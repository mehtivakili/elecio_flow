import { Router } from 'express';
import { insert, one, q, run, tx, uid, update, val } from '../db.ts';
import {
  HttpError, getSettings, guard, h, logActivity, mustFind, nextNumber, orderStagesFor,
} from '../core.ts';
import {
  advanceOrder, advanceWorkOrder, allocateOrder, cancelOrder, createTicket, createWorkOrder, createWorkOrdersForOrder,
  kittingNeeds, lineAllocation, recalcOrder, recordQc, releaseUnit, setTicketStatus, shipOrder, slaState, stageHistory,
} from '../services/workflow.ts';
import { setStage } from '../services/crm.ts';
import { unitEvent } from '../services/inventory.ts';

/* ═════════════════════════ Sales orders (OMS) ═════════════════════════ */

export const ordersRouter = Router();
ordersRouter.use(guard('sales'));

function decorateOrder(o: any) {
  const stages = orderStagesFor(o.orgId, o.fulfillment, !!o.needsInstallation);
  const index = stages.findIndex((s) => s.key === o.stage);
  const sla = slaState(stages[index], o.stageEnteredAt);
  return {
    ...o,
    stageIndex: index,
    stageCount: stages.length,
    progress: stages.length > 1 ? Math.round((Math.max(index, 0) / (stages.length - 1)) * 100) : 0,
    daysInStage: Math.round(sla.days * 10) / 10,
    late: o.status === 'open' && (sla.late || (!!o.promisedAt && o.promisedAt < Date.now())),
    stageLate: o.status === 'open' && sla.late,
    promiseLate: o.status === 'open' && !!o.promisedAt && o.promisedAt < Date.now(),
    balance: o.total - o.paid,
  };
}

ordersRouter.get('/orders', h((req) => q(
  `SELECT o.*, c.name AS contact_name, c.company AS contact_company, u.full_name AS owner_name,
     (SELECT GROUP_CONCAT(i.name || ' ×' || CAST(l.qty AS INTEGER), '، ') FROM order_lines l JOIN items i ON i.id = l.item_id WHERE l.order_id = o.id) AS summary
   FROM orders o JOIN contacts c ON c.id = o.contact_id LEFT JOIN users u ON u.id = o.owner_id
   WHERE o.org_id = ? ORDER BY o.created_at DESC`, req.user.orgId,
).map(decorateOrder)));

ordersRouter.get('/orders/:id', h((req) => {
  const raw = one(
    `SELECT o.*, c.name AS contact_name, c.company AS contact_company, c.phones_json
     FROM orders o JOIN contacts c ON c.id = o.contact_id WHERE o.id = ? AND o.org_id = ?`, req.params.id, req.user.orgId,
  );
  if (!raw) throw new HttpError(404, 'سفارش پیدا نشد');
  const order = decorateOrder(raw);
  return {
    order,
    stages: orderStagesFor(req.user.orgId, order.fulfillment, !!order.needsInstallation),
    lines: lineAllocation(order.id),
    address: order.addressId ? one('SELECT * FROM contact_addresses WHERE id = ?', order.addressId) : null,
    units: q(`SELECT u.*, i.name AS item_name FROM units u JOIN items i ON i.id = u.item_id WHERE u.order_id = ?`, order.id),
    payments: q('SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at', order.id),
    shipments: q('SELECT * FROM shipments WHERE order_id = ? ORDER BY shipped_at', order.id),
    workOrders: q('SELECT * FROM work_orders WHERE order_id = ? ORDER BY created_at', order.id),
    tickets: q('SELECT * FROM tickets WHERE order_id = ? ORDER BY created_at', order.id),
    history: stageHistory('order', order.id),
    activity: q("SELECT * FROM activity WHERE entity_type = 'order' AND entity_id = ? ORDER BY at DESC LIMIT 50", order.id),
  };
}));

function writeLines(orderId: string, orgId: string, lines: any[]) {
  run('DELETE FROM order_lines WHERE order_id = ?', orderId);
  lines.forEach((l, index) => {
    const item = mustFind('items', l.itemId, orgId, 'کالا');
    run(
      `INSERT INTO order_lines (id, order_id, item_id, description, qty, unit_price, discount_pct, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      uid('ol'), orderId, item.id, l.description ?? '', l.qty, l.unitPrice ?? item.price, l.discountPct ?? 0, index,
    );
  });
}

ordersRouter.post('/orders', h((req) => {
  const b = req.body ?? {};
  const contact = mustFind('contacts', b.contactId, req.user.orgId, 'مشتری');
  if (!b.lines?.length) throw new HttpError(400, 'حداقل یک ردیف کالا لازم است');
  const s = getSettings(req.user.orgId);
  const fulfillment = b.fulfillment === 'mto' ? 'mto' : 'stock';
  const stages = orderStagesFor(req.user.orgId, fulfillment, b.needsInstallation !== false);
  const id = uid('so');
  const now = Date.now();
  tx(() => {
    const address = b.addressId ?? one('SELECT id FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC LIMIT 1', contact.id)?.id;
    insert('orders', {
      id, orgId: req.user.orgId, number: nextNumber(req.user.orgId, s.company.orderPrefix), contactId: contact.id,
      addressId: address ?? null, ownerId: b.ownerId ?? req.user.id, stage: stages[0].key, stageEnteredAt: now,
      status: 'open', fulfillment, priority: b.priority ?? 'normal', promisedAt: b.promisedAt ?? null,
      discount: b.discount ?? 0, taxRate: b.taxRate ?? s.company.taxRate, needsInstallation: b.needsInstallation === false ? 0 : 1,
      notes: b.notes ?? '', createdAt: now, updatedAt: now,
    }, ['id', 'org_id', 'number', 'contact_id', 'address_id', 'owner_id', 'stage', 'stage_entered_at', 'status', 'fulfillment',
      'priority', 'promised_at', 'discount', 'tax_rate', 'needs_installation', 'notes', 'created_at', 'updated_at']);
    writeLines(id, req.user.orgId, b.lines);
    recalcOrder(id);
    run(
      `INSERT INTO stage_log (id, org_id, entity_type, entity_id, stage, entered_at, user_id) VALUES (?, ?, 'order', ?, ?, ?, ?)`,
      uid('sl'), req.user.orgId, id, stages[0].key, now, req.user.id,
    );
    // A quote means the lead is in negotiation — keep the CRM pipeline in step.
    if (['cold_lead', 'warm_lead', 'qualified'].includes(contact.stage)) setStage(contact.id, 'negotiation');
    logActivity(req.user, 'order', id, 'create', `پیش‌فاکتور برای ${contact.name}`);
  });
  return { id };
}));

ordersRouter.put('/orders/:id', h((req) => {
  const order = mustFind('orders', req.params.id, req.user.orgId, 'سفارش');
  if (order.status !== 'open') throw new HttpError(409, 'سفارش بسته قابل ویرایش نیست');
  const b = req.body ?? {};
  tx(() => {
    if (b.lines) {
      const stages = orderStagesFor(req.user.orgId, order.fulfillment, !!order.needsInstallation);
      if (stages.findIndex((s) => s.key === order.stage) > 1) {
        throw new HttpError(409, 'پس از دریافت پیش‌پرداخت، اقلام سفارش قابل تغییر نیست');
      }
      writeLines(order.id, req.user.orgId, b.lines);
    }
    if ('needsInstallation' in b) b.needsInstallation = b.needsInstallation ? 1 : 0;
    update('orders', order.id, req.user.orgId, { ...b, updatedAt: Date.now() },
      ['address_id', 'owner_id', 'priority', 'promised_at', 'discount', 'tax_rate', 'notes', 'fulfillment', 'needs_installation', 'updated_at']);
    recalcOrder(order.id);
  });
  return { id: order.id };
}));

ordersRouter.post('/orders/:id/advance', h((req) => advanceOrder(req.user, req.params.id, req.body ?? {})));
ordersRouter.post('/orders/:id/allocate', h((req) => allocateOrder(req.user, req.params.id, req.body ?? {})));
ordersRouter.post('/orders/:id/ship', h((req) => shipOrder(req.user, req.params.id, req.body ?? {})));
ordersRouter.post('/orders/:id/cancel', h((req) => cancelOrder(req.user, req.params.id, req.body?.reason ?? '')));
ordersRouter.post('/orders/:id/work-orders', h((req) => {
  const order = mustFind('orders', req.params.id, req.user.orgId, 'سفارش');
  const created = tx(() => createWorkOrdersForOrder(req.user, order));
  if (!created.length) throw new HttpError(409, 'کسری‌ای برای تولید وجود ندارد');
  return { created };
}));
ordersRouter.post('/units/:id/release', h((req) => releaseUnit(req.user, req.params.id)));

ordersRouter.post('/orders/:id/payments', h((req) => {
  const order = mustFind('orders', req.params.id, req.user.orgId, 'سفارش');
  const amount = Math.round(Number(req.body?.amount));
  if (!(amount > 0)) throw new HttpError(400, 'مبلغ نامعتبر است');
  tx(() => {
    run(
      `INSERT INTO payments (id, org_id, order_id, amount, method, reference, paid_at, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uid('pay'), req.user.orgId, order.id, amount, req.body.method ?? 'transfer', req.body.reference ?? '',
      req.body.paidAt ?? Date.now(), req.body.note ?? '', req.user.id,
    );
    recalcOrder(order.id);
    logActivity(req.user, 'order', order.id, 'payment', `دریافت وجه برای ${order.number}`);
  });
}));

ordersRouter.delete('/payments/:id', h((req) => {
  const p = mustFind('payments', req.params.id, req.user.orgId, 'پرداخت');
  run('DELETE FROM payments WHERE id = ?', p.id);
  recalcOrder(p.orderId);
}));

ordersRouter.put('/shipments/:id', h((req) => {
  const s = mustFind('shipments', req.params.id, req.user.orgId, 'محموله');
  update('shipments', s.id, req.user.orgId, req.body ?? {}, ['carrier', 'tracking_no', 'status', 'delivered_at', 'note']);
}));

/* ═════════════════════════ Production (MES) ═════════════════════════ */

export const productionRouter = Router();
productionRouter.use(guard('production'));

productionRouter.get('/work-orders', h((req) => {
  const stages = getSettings(req.user.orgId).workOrderStages;
  return q(
    `SELECT w.*, i.name AS item_name, i.sku, o.number AS order_number, c.name AS contact_name, u.full_name AS assignee_name,
       (SELECT COUNT(*) FROM units WHERE work_order_id = w.id AND qc_result = 'pass') AS qc_passed,
       (SELECT COUNT(*) FROM units WHERE work_order_id = w.id AND qc_result = 'fail') AS qc_failed
     FROM work_orders w JOIN items i ON i.id = w.item_id LEFT JOIN orders o ON o.id = w.order_id
     LEFT JOIN contacts c ON c.id = o.contact_id LEFT JOIN users u ON u.id = w.assignee_id
     WHERE w.org_id = ? ORDER BY w.created_at DESC`, req.user.orgId,
  ).map((w) => {
    const sla = slaState(stages.find((s) => s.key === w.stage), w.stageEnteredAt);
    return { ...w, daysInStage: Math.round(sla.days * 10) / 10, late: w.status === 'open' && (sla.late || (!!w.dueAt && w.dueAt < Date.now())) };
  });
}));

productionRouter.get('/work-orders/:id', h((req) => {
  const wo = one(
    `SELECT w.*, i.name AS item_name, i.sku, o.number AS order_number, o.contact_id FROM work_orders w
     JOIN items i ON i.id = w.item_id LEFT JOIN orders o ON o.id = w.order_id WHERE w.id = ? AND w.org_id = ?`,
    req.params.id, req.user.orgId,
  );
  if (!wo) throw new HttpError(404, 'دستور تولید پیدا نشد');
  return {
    workOrder: wo,
    needs: kittingNeeds(wo.id),
    units: q('SELECT * FROM units WHERE work_order_id = ? ORDER BY serial', wo.id),
    qc: q('SELECT q.*, u.serial FROM qc_checks q JOIN units u ON u.id = q.unit_id WHERE q.work_order_id = ? ORDER BY q.at DESC', wo.id),
    history: stageHistory('work_order', wo.id),
    moves: q("SELECT m.*, i.name AS item_name, i.unit FROM stock_moves m JOIN items i ON i.id = m.item_id WHERE m.ref_type = 'work_order' AND m.ref_id = ? ORDER BY m.at", wo.id),
  };
}));

productionRouter.post('/work-orders', h((req) => ({ id: createWorkOrder(req.user, req.body ?? {}) })));
productionRouter.put('/work-orders/:id', h((req) => {
  const wo = mustFind('work_orders', req.params.id, req.user.orgId, 'دستور تولید');
  update('work_orders', wo.id, req.user.orgId, { ...req.body, updatedAt: Date.now() },
    ['priority', 'assignee_id', 'due_at', 'fw_version', 'hw_rev', 'source_wh', 'target_wh', 'notes', 'updated_at']);
}));
productionRouter.post('/work-orders/:id/advance', h((req) => advanceWorkOrder(req.user, req.params.id, req.body ?? {})));
productionRouter.post('/work-orders/:id/qc', h((req) => recordQc(req.user, req.params.id, req.body ?? {})));
productionRouter.post('/work-orders/:id/cancel', h((req) => {
  const wo = mustFind('work_orders', req.params.id, req.user.orgId, 'دستور تولید');
  if (wo.startedAt) throw new HttpError(409, 'قطعات این دستور مصرف شده؛ به‌جای لغو، دستگاه‌ها را اسقاط یا تکمیل کنید');
  run("UPDATE work_orders SET status = 'cancelled', completed_at = ? WHERE id = ?", Date.now(), wo.id);
  logActivity(req.user, 'work_order', wo.id, 'cancel', `لغو ${wo.number}`);
}));

/* ═════════════════════════ Product units — serial traceability ═════════════════════════ */

export const unitsRouter = Router();
unitsRouter.use(guard('units'));

unitsRouter.get('/units', h((req) => q(
  `SELECT u.*, i.name AS item_name, i.sku, c.name AS contact_name, o.number AS order_number, w.name AS warehouse_name
   FROM units u JOIN items i ON i.id = u.item_id LEFT JOIN contacts c ON c.id = u.contact_id
   LEFT JOIN orders o ON o.id = u.order_id LEFT JOIN warehouses w ON w.id = u.warehouse_id
   WHERE u.org_id = ? ORDER BY u.created_at DESC`, req.user.orgId,
)));

/** The full life story of one device — accepts an id or a serial number. */
unitsRouter.get('/units/:key', h((req) => {
  const unit = one(
    `SELECT u.*, i.name AS item_name, i.sku, i.warranty_months, c.name AS contact_name, c.phones_json AS contact_phones_json,
       o.number AS order_number, w.name AS warehouse_name, wo.number AS work_order_number
     FROM units u JOIN items i ON i.id = u.item_id LEFT JOIN contacts c ON c.id = u.contact_id
     LEFT JOIN orders o ON o.id = u.order_id LEFT JOIN warehouses w ON w.id = u.warehouse_id
     LEFT JOIN work_orders wo ON wo.id = u.work_order_id
     WHERE u.org_id = ? AND (u.id = ? OR UPPER(u.serial) = UPPER(?))`,
    req.user.orgId, req.params.key, req.params.key,
  );
  if (!unit) throw new HttpError(404, 'شماره سریال پیدا نشد');
  return {
    unit,
    events: q('SELECT e.*, u.full_name AS user_name FROM unit_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.unit_id = ? ORDER BY e.at', unit.id),
    qc: q('SELECT * FROM qc_checks WHERE unit_id = ? ORDER BY at DESC', unit.id),
    tickets: q('SELECT * FROM tickets WHERE unit_id = ? ORDER BY created_at DESC', unit.id),
    address: unit.addressId ? one('SELECT * FROM contact_addresses WHERE id = ?', unit.addressId) : null,
    components: q(
      `SELECT i.name, i.sku, b.qty FROM bom_lines b JOIN items i ON i.id = b.component_id WHERE b.parent_id = ?`, unit.itemId,
    ),
  };
}));

unitsRouter.put('/units/:id', h((req) => {
  const unit = mustFind('units', req.params.id, req.user.orgId, 'دستگاه');
  const b = req.body ?? {};
  tx(() => {
    if (b.fwVersion && b.fwVersion !== unit.fwVersion) {
      unitEvent(req.user, unit.id, 'firmware', `به‌روزرسانی فریمور ${unit.fwVersion || '—'} → ${b.fwVersion}`);
    }
    if (b.status === 'scrapped' && unit.status !== 'scrapped') {
      if (['reserved', 'shipped', 'installed'].includes(unit.status)) throw new HttpError(409, 'دستگاه در دست مشتری یا رزرو است');
      if (unit.warehouseId && unit.status === 'in_stock') {
        run('UPDATE stock SET qty = MAX(0, qty - 1) WHERE item_id = ? AND warehouse_id = ?', unit.itemId, unit.warehouseId);
      }
      unitEvent(req.user, unit.id, 'scrapped', `اسقاط: ${b.reason ?? ''}`);
    }
    update('units', unit.id, req.user.orgId, b, ['fw_version', 'hw_rev', 'notes', ...(b.status === 'scrapped' ? ['status'] : [])]);
  });
}));

unitsRouter.post('/units/:id/events', h((req) => {
  const unit = mustFind('units', req.params.id, req.user.orgId, 'دستگاه');
  if (!req.body?.summary?.trim()) throw new HttpError(400, 'شرح رویداد الزامی است');
  unitEvent(req.user, unit.id, 'note', req.body.summary.trim());
}));

/* ═════════════════════════ Service desk ═════════════════════════ */

export const serviceRouter = Router();
serviceRouter.use(guard('service'));

serviceRouter.get('/tickets', h((req) => q(
  `SELECT t.*, c.name AS contact_name, u.serial, us.full_name AS assignee_name
   FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN units u ON u.id = t.unit_id
   LEFT JOIN users us ON us.id = t.assignee_id WHERE t.org_id = ? ORDER BY t.created_at DESC`, req.user.orgId,
).map((t) => ({
  ...t,
  breached: !['resolved', 'closed'].includes(t.status) && !!t.slaDueAt && t.slaDueAt < Date.now(),
}))));

serviceRouter.get('/tickets/:id', h((req) => {
  const ticket = one(
    `SELECT t.*, c.name AS contact_name, c.phones_json AS contact_phones_json, u.serial, u.warranty_until, u.fw_version,
       i.name AS item_name, o.number AS order_number
     FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN units u ON u.id = t.unit_id
     LEFT JOIN items i ON i.id = u.item_id LEFT JOIN orders o ON o.id = t.order_id WHERE t.id = ? AND t.org_id = ?`,
    req.params.id, req.user.orgId,
  );
  if (!ticket) throw new HttpError(404, 'تیکت پیدا نشد');
  return {
    ticket: { ...ticket, breached: !['resolved', 'closed'].includes(ticket.status) && ticket.slaDueAt < Date.now() },
    comments: q('SELECT c.*, u.full_name AS user_name FROM ticket_comments c LEFT JOIN users u ON u.id = c.user_id WHERE ticket_id = ? ORDER BY at', ticket.id),
    history: ticket.unitId ? q('SELECT id, number, subject, status, created_at FROM tickets WHERE unit_id = ? AND id != ? ORDER BY created_at DESC', ticket.unitId, ticket.id) : [],
  };
}));

serviceRouter.post('/tickets', h((req) => {
  if (!req.body?.subject?.trim()) throw new HttpError(400, 'موضوع تیکت الزامی است');
  if (!req.body.contactId && !req.body.unitId) throw new HttpError(400, 'مشتری یا شماره سریال را مشخص کنید');
  return { id: tx(() => createTicket(req.user, req.body)) };
}));

serviceRouter.put('/tickets/:id', h((req) => {
  const t = mustFind('tickets', req.params.id, req.user.orgId, 'تیکت');
  update('tickets', t.id, req.user.orgId, { ...req.body, updatedAt: Date.now() },
    ['assignee_id', 'priority', 'type', 'scheduled_at', 'cost', 'satisfaction', 'subject', 'description', 'updated_at']);
}));

serviceRouter.post('/tickets/:id/status', h((req) => setTicketStatus(req.user, req.params.id, req.body?.status, req.body?.resolution)));

serviceRouter.post('/tickets/:id/comments', h((req) => {
  const t = mustFind('tickets', req.params.id, req.user.orgId, 'تیکت');
  if (!req.body?.body?.trim()) throw new HttpError(400, 'متن خالی است');
  run('INSERT INTO ticket_comments (id, ticket_id, user_id, body, internal, at) VALUES (?, ?, ?, ?, ?, ?)',
    uid('tc'), t.id, req.user.id, req.body.body.trim(), req.body.internal ? 1 : 0, Date.now());
  if (t.status === 'new') run("UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?", Date.now(), t.id);
  return { ok: true, count: val<number>('SELECT COUNT(*) FROM ticket_comments WHERE ticket_id = ?', t.id) };
}));
