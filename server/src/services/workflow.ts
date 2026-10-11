import { one, q, run, tx, uid, val, type Row } from '../db.ts';
import {
  DAY, HttpError, getSettings, logActivity, nextNumber, nextSerial, orderStagesFor, type AuthUser,
} from '../core.ts';
import type { GateKind, StageDef } from '../../../shared/defaults.ts';
import { defaultWarehouse, moveStock, reserve, unitEvent, available } from './inventory.ts';
import { setStage } from './crm.ts';

type Actor = AuthUser;

/* ═════════════════════════ Stage log (shared by orders & work orders) ═════════════════════════ */

function enterStage(actor: Actor, entityType: string, entityId: string, stage: string, note = '', forced = false) {
  const now = Date.now();
  run(
    'UPDATE stage_log SET left_at = ? WHERE entity_type = ? AND entity_id = ? AND left_at IS NULL',
    now, entityType, entityId,
  );
  run(
    `INSERT INTO stage_log (id, org_id, entity_type, entity_id, stage, entered_at, user_id, note, forced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid('sl'), actor.orgId, entityType, entityId, stage, now, actor.id, note, forced ? 1 : 0,
  );
}

export function stageHistory(entityType: string, entityId: string) {
  return q('SELECT * FROM stage_log WHERE entity_type = ? AND entity_id = ? ORDER BY entered_at', entityType, entityId);
}

/** How long the record has been in its current stage vs. the stage SLA. */
export function slaState(stage: StageDef | undefined, enteredAt: number) {
  const days = (Date.now() - enteredAt) / DAY;
  if (!stage?.slaDays || stage.final) return { days, late: false, ratio: 0 };
  return { days, late: days > stage.slaDays, ratio: days / stage.slaDays };
}

/* ═════════════════════════ Orders (OMS) ═════════════════════════ */

export function recalcOrder(orderId: string) {
  const order = one('SELECT discount, tax_rate FROM orders WHERE id = ?', orderId);
  if (!order) return;
  const subtotal = Math.round(val<number>(
    'SELECT COALESCE(SUM(qty * unit_price * (1 - discount_pct / 100.0)), 0) FROM order_lines WHERE order_id = ?', orderId,
  ));
  const total = Math.round(Math.max(0, subtotal - order.discount) * (1 + order.taxRate / 100));
  const paid = val<number>('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE order_id = ?', orderId);
  run('UPDATE orders SET subtotal = ?, total = ?, paid = ?, updated_at = ? WHERE id = ?', subtotal, total, paid, Date.now(), orderId);
}

/** Per line: how much is covered by reserved serials or reserved bulk stock. */
export function lineAllocation(orderId: string) {
  const lines = q(
    `SELECT l.*, i.name AS item_name, i.sku, i.kind AS item_kind, i.serialized
     FROM order_lines l JOIN items i ON i.id = l.item_id WHERE l.order_id = ? ORDER BY l.sort_order`, orderId,
  );
  return lines.map((l) => {
    const units = l.serialized
      ? val<number>("SELECT COUNT(*) FROM units WHERE order_id = ? AND item_id = ? AND status != 'scrapped'", orderId, l.itemId)
      : 0;
    const covered = l.itemKind === 'service' ? l.qty : l.serialized ? units : l.allocated;
    return { ...l, units, covered, missing: Math.max(0, l.qty - covered) };
  });
}

function checkGate(gate: GateKind | undefined, order: Row): string | null {
  const s = getSettings(order.orgId);
  switch (gate) {
    case 'deposit': {
      const need = Math.round(order.total * s.company.depositPct / 100);
      return order.paid >= need ? null : `پیش‌پرداخت ${s.company.depositPct}٪ هنوز کامل دریافت نشده`;
    }
    case 'full_payment':
      return order.paid >= order.total ? null : 'تسویه کامل سفارش انجام نشده';
    case 'allocation': {
      const missing = lineAllocation(order.id).filter((l) => l.missing > 0);
      return missing.length
        ? `کالا برای ${missing.map((l) => `${l.itemName} (${l.missing})`).join('، ')} تخصیص نیافته`
        : null;
    }
    case 'shipment':
      return val<number>('SELECT COUNT(*) FROM shipments WHERE order_id = ?', order.id) ? null : 'هنوز محموله‌ای ثبت نشده';
    default:
      return null;
  }
}

export function createWorkOrdersForOrder(actor: Actor, order: Row) {
  const created: string[] = [];
  for (const line of lineAllocation(order.id)) {
    if (!line.serialized || line.missing <= 0) continue;
    const already = val<number>(
      "SELECT COALESCE(SUM(qty), 0) FROM work_orders WHERE order_id = ? AND item_id = ? AND status = 'open'",
      order.id, line.itemId,
    );
    const qty = line.missing - already;
    if (qty <= 0) continue;
    created.push(createWorkOrder(actor, {
      itemId: line.itemId, qty, orderId: order.id, priority: order.priority,
      dueAt: order.promisedAt ? order.promisedAt - 3 * DAY : Date.now() + 10 * DAY,
      notes: `برای سفارش ${order.number}`,
    }));
  }
  return created;
}

export function advanceOrder(actor: Actor, orderId: string, opts: { to?: string; force?: boolean; note?: string }) {
  return tx(() => {
    const order = one('SELECT * FROM orders WHERE id = ? AND org_id = ?', orderId, actor.orgId);
    if (!order) throw new HttpError(404, 'سفارش پیدا نشد');
    if (order.status !== 'open') throw new HttpError(409, 'سفارش بسته یا لغو شده است');

    const stages = orderStagesFor(actor.orgId, order.fulfillment, !!order.needsInstallation);
    const from = stages.findIndex((s) => s.key === order.stage);
    const to = opts.to ? stages.findIndex((s) => s.key === opts.to) : from + 1;
    if (to < 0 || to >= stages.length) throw new HttpError(400, 'مرحله مقصد نامعتبر است');
    if (to === from) return order;

    if (to > from) {
      const blockers = stages.slice(Math.max(from, 0), to)
        .map((s) => ({ stage: s.label, reason: checkGate(s.gate, order) }))
        .filter((b) => b.reason);
      if (blockers.length && !opts.force) {
        throw new HttpError(409, blockers[0].reason!, { blockers, canForce: ['owner', 'admin'].includes(actor.role) });
      }
      if (blockers.length && !['owner', 'admin'].includes(actor.role)) {
        throw new HttpError(403, 'عبور اجباری از کنترل‌ها فقط برای مدیر مجاز است');
      }
    }

    const target = stages[to];
    const now = Date.now();
    run('UPDATE orders SET stage = ?, stage_entered_at = ?, updated_at = ? WHERE id = ?', target.key, now, now, orderId);
    enterStage(actor, 'order', orderId, target.key, opts.note ?? '', !!opts.force);
    logActivity(actor, 'order', orderId, 'stage', `سفارش ${order.number} → ${target.label}`);

    // Integration points — where the CRM, MES and service desk hear about the order.
    if (from === 0 && to > 0) setStage(order.contactId, 'customer');
    if (target.key === 'production') createWorkOrdersForOrder(actor, { ...order, stage: target.key });
    if (target.key === 'installation') ensureInstallationTicket(actor, order);
    if (target.final) closeOrder(actor, order);
    return one('SELECT * FROM orders WHERE id = ?', orderId);
  });
}

function warrantyEnd(orgId: string, itemId: string, from: number) {
  const item = one('SELECT warranty_months FROM items WHERE id = ?', itemId);
  const months = item?.warrantyMonths ?? getSettings(orgId).company.warrantyMonths;
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

function closeOrder(actor: Actor, order: Row) {
  const now = Date.now();
  run("UPDATE orders SET status = 'done', closed_at = ? WHERE id = ?", now, order.id);
  for (const unit of q("SELECT * FROM units WHERE order_id = ? AND status IN ('shipped', 'reserved')", order.id)) {
    const start = order.needsInstallation ? now : unit.shippedAt ?? now;
    run(
      "UPDATE units SET status = 'installed', installed_at = COALESCE(installed_at, ?), warranty_until = ? WHERE id = ?",
      start, warrantyEnd(actor.orgId, unit.itemId, start), unit.id,
    );
    unitEvent(actor, unit.id, 'installed', `تحویل نهایی به مشتری — شروع گارانتی`, 'order', order.id);
  }
  run("UPDATE shipments SET status = 'delivered', delivered_at = COALESCE(delivered_at, ?) WHERE order_id = ?", now, order.id);
  setStage(order.contactId, 'customer');
}

function ensureInstallationTicket(actor: Actor, order: Row) {
  const exists = val<number>("SELECT COUNT(*) FROM tickets WHERE order_id = ? AND type = 'installation'", order.id);
  if (exists) return;
  createTicket(actor, {
    contactId: order.contactId,
    orderId: order.id,
    type: 'installation',
    priority: order.priority === 'urgent' ? 'urgent' : 'high',
    subject: `نصب و راه‌اندازی سفارش ${order.number}`,
    description: 'به‌صورت خودکار با ورود سفارش به مرحله نصب ایجاد شد.',
    scheduledAt: Date.now() + 2 * DAY,
  });
}

export function allocateOrder(
  actor: Actor,
  orderId: string,
  input: { lineId: string; unitIds?: string[]; qty?: number; warehouseId?: string },
) {
  return tx(() => {
    const order = one('SELECT * FROM orders WHERE id = ? AND org_id = ?', orderId, actor.orgId);
    if (!order || order.status !== 'open') throw new HttpError(409, 'سفارش قابل تخصیص نیست');
    const line = lineAllocation(orderId).find((l) => l.id === input.lineId);
    if (!line) throw new HttpError(404, 'ردیف سفارش پیدا نشد');
    if (line.missing <= 0) throw new HttpError(409, 'این ردیف کامل تخصیص یافته است');

    if (line.serialized) {
      const ids = input.unitIds?.length
        ? input.unitIds
        : q(
          "SELECT id FROM units WHERE org_id = ? AND item_id = ? AND status = 'in_stock' ORDER BY built_at LIMIT ?",
          actor.orgId, line.itemId, line.missing,
        ).map((u) => u.id);
      if (!ids.length) throw new HttpError(409, `واحد آماده‌ای از ${line.itemName} در انبار نیست — دستور تولید ایجاد کنید`);
      for (const id of ids.slice(0, line.missing)) {
        const unit = one("SELECT * FROM units WHERE id = ? AND org_id = ? AND status = 'in_stock'", id, actor.orgId);
        if (!unit) throw new HttpError(409, 'یکی از سریال‌ها آزاد نیست');
        if (unit.warehouseId) reserve(actor.orgId, unit.itemId, unit.warehouseId, 1);
        run(
          "UPDATE units SET status = 'reserved', order_id = ?, contact_id = ?, address_id = ? WHERE id = ?",
          orderId, order.contactId, order.addressId, id,
        );
        unitEvent(actor, id, 'reserved', `رزرو برای سفارش ${order.number}`, 'order', orderId);
      }
      return { allocated: Math.min(ids.length, line.missing) };
    }

    const warehouseId = input.warehouseId || line.warehouseId || defaultWarehouse(actor.orgId, 'finished')
      || defaultWarehouse(actor.orgId, 'parts');
    if (!warehouseId) throw new HttpError(400, 'انباری تعریف نشده است');
    const qty = Math.min(input.qty ?? line.missing, line.missing, available(line.itemId, warehouseId));
    if (qty <= 0) throw new HttpError(409, `موجودی آزاد ${line.itemName} کافی نیست`);
    reserve(actor.orgId, line.itemId, warehouseId, qty);
    run('UPDATE order_lines SET allocated = allocated + ?, warehouse_id = ? WHERE id = ?', qty, warehouseId, line.id);
    return { allocated: qty };
  });
}

export function releaseUnit(actor: Actor, unitId: string) {
  return tx(() => {
    const unit = one("SELECT * FROM units WHERE id = ? AND org_id = ? AND status = 'reserved'", unitId, actor.orgId);
    if (!unit) throw new HttpError(409, 'این سریال رزرو نیست');
    if (unit.warehouseId) reserve(actor.orgId, unit.itemId, unit.warehouseId, -1);
    run("UPDATE units SET status = 'in_stock', order_id = NULL, contact_id = NULL, address_id = NULL WHERE id = ?", unitId);
    unitEvent(actor, unitId, 'released', 'آزادسازی از سفارش', 'order', unit.orderId);
  });
}

export function shipOrder(
  actor: Actor,
  orderId: string,
  input: { carrier?: string; trackingNo?: string; cost?: number; note?: string },
) {
  return tx(() => {
    const order = one('SELECT * FROM orders WHERE id = ? AND org_id = ?', orderId, actor.orgId);
    if (!order || order.status !== 'open') throw new HttpError(409, 'سفارش قابل ارسال نیست');
    const missing = lineAllocation(orderId).filter((l) => l.missing > 0 && l.itemKind !== 'service');
    if (missing.length) throw new HttpError(409, `ابتدا کالاها را تخصیص دهید: ${missing.map((l) => l.itemName).join('، ')}`);

    const now = Date.now();
    const shipmentId = uid('shp');
    run(
      `INSERT INTO shipments (id, org_id, order_id, carrier, tracking_no, status, shipped_at, cost, note)
       VALUES (?, ?, ?, ?, ?, 'shipped', ?, ?, ?)`,
      shipmentId, actor.orgId, orderId, input.carrier ?? '', input.trackingNo ?? '', now, input.cost ?? 0, input.note ?? '',
    );
    for (const unit of q("SELECT * FROM units WHERE order_id = ? AND status = 'reserved'", orderId)) {
      if (unit.warehouseId) {
        moveStock(actor, {
          itemId: unit.itemId, kind: 'ship', qty: 1, fromWh: unit.warehouseId, fromReserved: true,
          refType: 'order', refId: orderId, note: `${order.number} — ${unit.serial}`,
        });
      }
      run(
        "UPDATE units SET status = 'shipped', shipped_at = ?, warehouse_id = NULL, warranty_until = ? WHERE id = ?",
        now, warrantyEnd(actor.orgId, unit.itemId, now), unit.id,
      );
      unitEvent(actor, unit.id, 'shipped', `ارسال با ${input.carrier || 'حمل‌کننده'} ${input.trackingNo ? `(${input.trackingNo})` : ''}`, 'order', orderId);
    }
    for (const line of q('SELECT * FROM order_lines WHERE order_id = ? AND allocated > 0 AND warehouse_id IS NOT NULL', orderId)) {
      moveStock(actor, {
        itemId: line.itemId, kind: 'ship', qty: line.allocated, fromWh: line.warehouseId, fromReserved: true,
        refType: 'order', refId: orderId, note: order.number,
      });
    }
    if (input.cost) {
      run(
        `INSERT INTO expenses (id, org_id, category, amount, at, description, ref_type, ref_id, user_id, created_at)
         VALUES (?, ?, 'حمل‌ونقل و گمرک', ?, ?, ?, 'order', ?, ?, ?)`,
        uid('exp'), actor.orgId, input.cost, now, `هزینه ارسال سفارش ${order.number}`, orderId, actor.id, now,
      );
    }
    logActivity(actor, 'order', orderId, 'ship', `ارسال سفارش ${order.number}`);
    return { shipmentId };
  });
}

export function cancelOrder(actor: Actor, orderId: string, reason: string) {
  return tx(() => {
    const order = one('SELECT * FROM orders WHERE id = ? AND org_id = ?', orderId, actor.orgId);
    if (!order || order.status !== 'open') throw new HttpError(409, 'سفارش باز نیست');
    for (const unit of q("SELECT id FROM units WHERE order_id = ? AND status = 'reserved'", orderId)) releaseUnit(actor, unit.id);
    for (const line of q('SELECT * FROM order_lines WHERE order_id = ? AND allocated > 0', orderId)) {
      if (line.warehouseId) reserve(actor.orgId, line.itemId, line.warehouseId, -line.allocated);
      run('UPDATE order_lines SET allocated = 0 WHERE id = ?', line.id);
    }
    run("UPDATE orders SET status = 'cancelled', cancel_reason = ?, closed_at = ? WHERE id = ?", reason, Date.now(), orderId);
    logActivity(actor, 'order', orderId, 'cancel', `لغو سفارش ${order.number}: ${reason}`);
  });
}

/* ═════════════════════════ Production (MES) ═════════════════════════ */

export function createWorkOrder(
  actor: Actor,
  input: { itemId: string; qty: number; orderId?: string; priority?: string; dueAt?: number; assigneeId?: string; notes?: string },
) {
  const item = one("SELECT * FROM items WHERE id = ? AND org_id = ? AND kind = 'product'", input.itemId, actor.orgId);
  if (!item) throw new HttpError(400, 'محصول قابل تولید انتخاب نشده');
  if (!(input.qty > 0)) throw new HttpError(400, 'تعداد تولید نامعتبر است');
  const stages = getSettings(actor.orgId).workOrderStages;
  const id = uid('wo');
  const now = Date.now();
  run(
    `INSERT INTO work_orders (id, org_id, number, item_id, qty, order_id, stage, stage_entered_at, status, priority,
       assignee_id, hw_rev, fw_version, source_wh, target_wh, due_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, actor.orgId, nextNumber(actor.orgId, getSettings(actor.orgId).company.woPrefix), item.id, input.qty,
    input.orderId ?? null, stages[0].key, now, input.priority ?? 'normal', input.assigneeId ?? null,
    item.hwRev, item.fwVersion, defaultWarehouse(actor.orgId, 'parts'), defaultWarehouse(actor.orgId, 'finished'),
    input.dueAt ?? null, input.notes ?? '', now, now,
  );
  enterStage(actor, 'work_order', id, stages[0].key);
  logActivity(actor, 'work_order', id, 'create', `دستور تولید ${input.qty} عدد ${item.name}`);
  return id;
}

export function kittingNeeds(woId: string) {
  const wo = one('SELECT * FROM work_orders WHERE id = ?', woId);
  if (!wo) return [];
  return q(
    `SELECT b.component_id, b.qty AS per_unit, i.name, i.sku, i.unit FROM bom_lines b
     JOIN items i ON i.id = b.component_id WHERE b.parent_id = ?`, wo.itemId,
  ).map((b) => {
    const need = b.perUnit * wo.qty;
    const free = wo.sourceWh ? available(b.componentId, wo.sourceWh) : 0;
    return { ...b, need, available: free, short: Math.max(0, need - free) };
  });
}

function woGate(gate: GateKind | undefined, wo: Row): string | null {
  if (gate === 'kitting' && !wo.startedAt) {
    const short = kittingNeeds(wo.id).filter((n) => n.short > 0);
    if (short.length) return `کسری قطعه: ${short.map((n) => `${n.name} (${n.short})`).join('، ')}`;
    if (!wo.sourceWh) return 'انبار قطعات مشخص نیست';
  }
  if (gate === 'qc_pass') {
    const pending = val<number>(
      "SELECT COUNT(*) FROM units WHERE work_order_id = ? AND status != 'scrapped' AND COALESCE(qc_result, '') != 'pass'", wo.id,
    );
    if (pending) return `${pending} دستگاه هنوز QC را با موفقیت پشت سر نگذاشته`;
  }
  return null;
}

/** Leaving the kitting stage consumes the BOM and gives every device its serial number. */
function kit(actor: Actor, wo: Row) {
  if (wo.startedAt) return;
  for (const need of kittingNeeds(wo.id)) {
    moveStock(actor, {
      itemId: need.componentId, kind: 'consume', qty: need.need, fromWh: wo.sourceWh,
      refType: 'work_order', refId: wo.id, note: wo.number,
    });
  }
  const item = one('SELECT * FROM items WHERE id = ?', wo.itemId)!;
  const now = Date.now();
  for (let i = 0; i < wo.qty; i++) {
    const id = uid('unit');
    run(
      `INSERT INTO units (id, org_id, serial, item_id, work_order_id, status, hw_rev, fw_version, created_at)
       VALUES (?, ?, ?, ?, ?, 'in_production', ?, ?, ?)`,
      id, actor.orgId, nextSerial(actor.orgId, item.sku), item.id, wo.id, wo.hwRev, '', now,
    );
    unitEvent(actor, id, 'created', `شروع ساخت در ${wo.number}`, 'work_order', wo.id);
  }
  run('UPDATE work_orders SET started_at = ? WHERE id = ?', now, wo.id);
}

function finishWorkOrder(actor: Actor, wo: Row) {
  const now = Date.now();
  const units = q("SELECT * FROM units WHERE work_order_id = ? AND status = 'in_production'", wo.id);
  const order = wo.orderId ? one("SELECT * FROM orders WHERE id = ? AND status = 'open'", wo.orderId) : null;
  for (const unit of units) {
    if (wo.targetWh) {
      moveStock(actor, {
        itemId: unit.itemId, kind: 'produce', qty: 1, toWh: wo.targetWh,
        refType: 'work_order', refId: wo.id, note: unit.serial,
      });
    }
    run("UPDATE units SET status = 'in_stock', warehouse_id = ?, built_at = ? WHERE id = ?", wo.targetWh, now, unit.id);
    unitEvent(actor, unit.id, 'stocked', 'ورود به انبار محصول نهایی', 'work_order', wo.id);
    if (order && wo.targetWh) {
      reserve(actor.orgId, unit.itemId, wo.targetWh, 1);
      run(
        "UPDATE units SET status = 'reserved', order_id = ?, contact_id = ?, address_id = ? WHERE id = ?",
        order.id, order.contactId, order.addressId, unit.id,
      );
      unitEvent(actor, unit.id, 'reserved', `رزرو خودکار برای سفارش ${order.number}`, 'order', order.id);
    }
  }
  run("UPDATE work_orders SET status = 'done', completed_at = ? WHERE id = ?", now, wo.id);
}

export function advanceWorkOrder(actor: Actor, woId: string, opts: { to?: string; force?: boolean; note?: string }) {
  return tx(() => {
    const wo = one('SELECT * FROM work_orders WHERE id = ? AND org_id = ?', woId, actor.orgId);
    if (!wo) throw new HttpError(404, 'دستور تولید پیدا نشد');
    if (wo.status !== 'open') throw new HttpError(409, 'دستور تولید بسته است');
    const stages = getSettings(actor.orgId).workOrderStages;
    const from = stages.findIndex((s) => s.key === wo.stage);
    const to = opts.to ? stages.findIndex((s) => s.key === opts.to) : from + 1;
    if (to < 0 || to >= stages.length || to === from) throw new HttpError(400, 'مرحله مقصد نامعتبر است');

    if (to > from) {
      for (const stage of stages.slice(Math.max(from, 0), to)) {
        const reason = woGate(stage.gate, { ...wo, startedAt: one('SELECT started_at FROM work_orders WHERE id = ?', woId)!.startedAt });
        // Kitting moves real stock, so it cannot be forced past a shortage.
        if (reason && (stage.gate === 'kitting' || !opts.force)) {
          throw new HttpError(409, reason, {
            blockers: [{ stage: stage.label, reason }],
            canForce: stage.gate !== 'kitting' && ['owner', 'admin'].includes(actor.role),
          });
        }
        if (stage.gate === 'kitting') kit(actor, wo);
      }
    }

    const target = stages[to];
    const now = Date.now();
    run('UPDATE work_orders SET stage = ?, stage_entered_at = ?, updated_at = ? WHERE id = ?', target.key, now, now, woId);
    enterStage(actor, 'work_order', woId, target.key, opts.note ?? '', !!opts.force);
    if (target.key === 'firmware' && wo.fwVersion) {
      for (const unit of q("SELECT id FROM units WHERE work_order_id = ? AND status = 'in_production'", woId)) {
        run('UPDATE units SET fw_version = ? WHERE id = ?', wo.fwVersion, unit.id);
        unitEvent(actor, unit.id, 'firmware', `نصب فریمور ${wo.fwVersion}`, 'work_order', woId);
      }
    }
    if (target.final) finishWorkOrder(actor, { ...wo, stage: target.key });
    logActivity(actor, 'work_order', woId, 'stage', `تولید ${wo.number} → ${target.label}`);
    return one('SELECT * FROM work_orders WHERE id = ?', woId);
  });
}

export function recordQc(
  actor: Actor, woId: string, input: { unitId: string; results: { check: string; ok: boolean }[]; note?: string },
) {
  return tx(() => {
    const unit = one('SELECT * FROM units WHERE id = ? AND org_id = ? AND work_order_id = ?', input.unitId, actor.orgId, woId);
    if (!unit) throw new HttpError(404, 'دستگاه در این دستور تولید نیست');
    const passed = input.results.length > 0 && input.results.every((r) => r.ok);
    run(
      `INSERT INTO qc_checks (id, org_id, work_order_id, unit_id, results_json, passed, inspector_id, note, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uid('qc'), actor.orgId, woId, unit.id, JSON.stringify(input.results), passed ? 1 : 0, actor.id, input.note ?? '', Date.now(),
    );
    run('UPDATE units SET qc_result = ? WHERE id = ?', passed ? 'pass' : 'fail', unit.id);
    const failed = input.results.filter((r) => !r.ok).map((r) => r.check);
    unitEvent(actor, unit.id, passed ? 'qc_pass' : 'qc_fail',
      passed ? 'QC تأیید شد' : `QC مردود: ${failed.join('، ')}`, 'work_order', woId);
    return { passed };
  });
}

/* ═════════════════════════ Service desk ═════════════════════════ */

export function createTicket(actor: Actor, input: Row) {
  const s = getSettings(actor.orgId);
  const now = Date.now();
  const unit = input.unitId ? one('SELECT * FROM units WHERE id = ? AND org_id = ?', input.unitId, actor.orgId) : null;
  const priority = (input.priority ?? 'normal') as keyof typeof s.ticketSlaHours;
  const id = uid('tk');
  run(
    `INSERT INTO tickets (id, org_id, number, contact_id, unit_id, order_id, type, channel, priority, status, subject,
       description, assignee_id, scheduled_at, sla_due_at, under_warranty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, actor.orgId, nextNumber(actor.orgId, s.company.ticketPrefix),
    input.contactId ?? unit?.contactId ?? null, unit?.id ?? null, input.orderId ?? unit?.orderId ?? null,
    input.type ?? 'support', input.channel ?? 'phone', priority, input.subject, input.description ?? '',
    // A scheduled visit starts its SLA clock at the appointment, not at booking.
    input.assigneeId ?? null, input.scheduledAt ?? null,
    (input.scheduledAt ?? now) + (s.ticketSlaHours[priority] ?? 72) * 3_600_000,
    unit?.warrantyUntil && unit.warrantyUntil > now ? 1 : 0, now, now,
  );
  if (unit && ['warranty_repair', 'paid_repair'].includes(input.type)) {
    run("UPDATE units SET status = 'in_repair' WHERE id = ?", unit.id);
    unitEvent(actor, unit.id, 'repair', `پذیرش تعمیر — ${input.subject}`, 'ticket', id);
  } else if (unit) {
    unitEvent(actor, unit.id, 'ticket', `تیکت: ${input.subject}`, 'ticket', id);
  }
  logActivity(actor, 'ticket', id, 'create', `تیکت جدید: ${input.subject}`);
  return id;
}

export function setTicketStatus(actor: Actor, ticketId: string, status: string, resolution?: string) {
  return tx(() => {
    const t = one('SELECT * FROM tickets WHERE id = ? AND org_id = ?', ticketId, actor.orgId);
    if (!t) throw new HttpError(404, 'تیکت پیدا نشد');
    const now = Date.now();
    const resolved = ['resolved', 'closed'].includes(status);
    run(
      'UPDATE tickets SET status = ?, resolution = COALESCE(?, resolution), resolved_at = ?, updated_at = ? WHERE id = ?',
      status, resolution ?? null, resolved ? (t.resolvedAt ?? now) : null, now, ticketId,
    );
    if (resolved && t.unitId) {
      const unit = one('SELECT * FROM units WHERE id = ?', t.unitId);
      if (unit?.status === 'in_repair') {
        run('UPDATE units SET status = ? WHERE id = ?', unit.contactId ? 'installed' : 'in_stock', unit.id);
        unitEvent(actor, unit.id, 'repaired', `تعمیر تکمیل شد${resolution ? `: ${resolution}` : ''}`, 'ticket', ticketId);
      }
      if (t.type === 'installation' && unit && !unit.installedAt) {
        run('UPDATE units SET installed_at = ? WHERE id = ?', now, unit.id);
      }
    }
    if (resolved && t.type === 'installation' && t.orderId) {
      for (const unit of q("SELECT id FROM units WHERE order_id = ? AND installed_at IS NULL", t.orderId)) {
        run('UPDATE units SET installed_at = ? WHERE id = ?', now, unit.id);
        unitEvent(actor, unit.id, 'installed', 'نصب و راه‌اندازی انجام شد', 'ticket', ticketId);
      }
    }
    logActivity(actor, 'ticket', ticketId, 'status', `تیکت ${t.number}: ${status}`);
  });
}
