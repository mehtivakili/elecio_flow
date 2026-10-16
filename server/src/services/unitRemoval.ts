import { one, run, tx, uid, val, type Row } from '../db.ts';
import { HttpError, logActivity, unlinkTasks, type AuthUser } from '../core.ts';
import { defaultWarehouse, moveStock, reserve, unitEvent } from './inventory.ts';
import { recalcOrder } from './workflow.ts';

/**
 * Removing a device that was recorded by mistake — together with what it touched:
 *  · entered manually (past sales, «تعریف دستی»): the record goes; stock never changed, so it
 *    stays as it is; the ledger gets a «حذف دستگاه» line for the trail.
 *  · it left a warehouse through an order (shipped / installed): it goes back into that
 *    warehouse (stock +1) and is detached from the customer and the order.
 *  · it sits in a warehouse: the record goes and that warehouse's stock drops by one.
 * In every case the order it belonged to loses that device (quantity and amount); a past
 * sale left with nothing on it is removed entirely. Tickets keep their history but lose
 * the link. Devices still in production are refused (scrap them in the work order).
 */

export interface UnitRemovalResult {
  deleted: number;
  archived: Row[];
  blocked: Row[];
  /** What happened to each device, for the report shown after deleting. */
  effects: { id: string; name: string; reason: string }[];
}

const labelOf = (u: Row) => (u.serialUnknown ? `دستگاه بدون سریال (${one('SELECT name FROM items WHERE id = ?', u.itemId)?.name ?? ''})` : u.serial);

/** Lowers the order line of this item by one device; drops an emptied past sale. Returns a short description. */
function shrinkOrder(actor: AuthUser, orderId: string, itemId: string, unitLabel: string): string | null {
  const order = one('SELECT * FROM orders WHERE id = ?', orderId);
  if (!order) return null;
  const line = one('SELECT * FROM order_lines WHERE order_id = ? AND item_id = ? AND qty > 0 ORDER BY sort_order LIMIT 1', orderId, itemId);
  if (line) {
    if (line.qty <= 1) run('DELETE FROM order_lines WHERE id = ?', line.id);
    else run('UPDATE order_lines SET qty = qty - 1, allocated = MAX(0, MIN(allocated, qty - 1)) WHERE id = ?', line.id);
  }
  recalcOrder(orderId);
  const left = val<number>('SELECT COUNT(*) FROM order_lines WHERE order_id = ?', orderId);
  if (order.legacy && !left) {
    // A past sale that no longer sells anything was itself the mistake.
    run('DELETE FROM payments WHERE order_id = ?', orderId);
    run('DELETE FROM shipments WHERE order_id = ?', orderId);
    run("DELETE FROM stage_log WHERE entity_type = 'order' AND entity_id = ?", orderId);
    run('UPDATE attachments SET order_id = NULL WHERE order_id = ?', orderId);
    run('UPDATE tickets SET order_id = NULL WHERE order_id = ?', orderId);
    run('UPDATE work_orders SET order_id = NULL WHERE order_id = ?', orderId);
    unlinkTasks('order', orderId);
    run('DELETE FROM orders WHERE id = ?', orderId);
    logActivity(actor, 'order', orderId, 'delete', `حذف فروش قبلی ${order.number} — همه دستگاه‌هایش حذف شدند`);
    return `فروش قبلی ${order.number} هم حذف شد (دستگاه دیگری نداشت)`;
  }
  logActivity(actor, 'order', orderId, 'unit_removed', `حذف ${unitLabel} از سفارش ${order.number}`);
  return `از ${order.legacy ? 'فروش قبلی' : 'سفارش'} ${order.number} یک دستگاه کم شد`;
}

/** Warehouse a shipped device originally left from (its ship move), else the finished-goods warehouse. */
function originWarehouse(orgId: string, u: Row): string | null {
  if (u.orderId) {
    const mv = one(
      "SELECT from_wh FROM stock_moves WHERE kind = 'ship' AND ref_type = 'order' AND ref_id = ? AND note LIKE ? AND from_wh IS NOT NULL ORDER BY at DESC LIMIT 1",
      u.orderId, `%${u.serial}%`,
    );
    if (mv?.fromWh) return mv.fromWh;
  }
  return defaultWarehouse(orgId, 'finished');
}

function ledger(actor: AuthUser, u: Row, kind: string, note: string, refType: string | null, refId: string | null) {
  run(
    `INSERT INTO stock_moves (id, org_id, item_id, kind, from_wh, to_wh, qty, ref_type, ref_id, note, user_id, at)
     VALUES (?, ?, ?, ?, NULL, NULL, 1, ?, ?, ?, ?, ?)`,
    uid('mv'), actor.orgId, u.itemId, kind, refType, refId, note, actor.id, Date.now(),
  );
}

export function removeUnits(actor: AuthUser, rawIds: unknown): UnitRemovalResult {
  if (!Array.isArray(rawIds) || rawIds.length === 0) throw new HttpError(400, 'هیچ موردی انتخاب نشده است');
  if (rawIds.length > 500) throw new HttpError(400, 'در هر بار حداکثر ۵۰۰ مورد قابل حذف است');
  const ids = [...new Set(rawIds.map(String))];
  return tx(() => {
    const result: UnitRemovalResult = { deleted: 0, archived: [], blocked: [], effects: [] };
    for (const id of ids) {
      const u = one('SELECT * FROM units WHERE id = ? AND org_id = ?', id, actor.orgId);
      if (!u) continue;
      const name = labelOf(u);
      if (u.status === 'in_production') {
        result.blocked.push({ id, name, reason: 'هنوز در دستور تولید است؛ از صفحه دستور تولید اسقاط کنید' });
        continue;
      }
      const notes: string[] = [];
      const tickets = val<number>('SELECT COUNT(*) FROM tickets WHERE unit_id = ?', u.id);
      const fromStock = !u.manual && !u.warehouseId && !!u.orderId && ['shipped', 'installed', 'in_repair'].includes(u.status);

      if (fromStock) {
        // Left the warehouse through an order → back into stock, detached from customer and order.
        const wh = originWarehouse(actor.orgId, u);
        if (!wh) { result.blocked.push({ id, name, reason: 'انباری برای برگرداندن دستگاه پیدا نشد' }); continue; }
        const orderNo = one('SELECT number FROM orders WHERE id = ?', u.orderId)?.number ?? '';
        moveStock(actor, { itemId: u.itemId, kind: 'unit_returned', qty: 1, toWh: wh, refType: 'unit', refId: u.id, note: `${name} — برگشت از ${orderNo} (ثبت اشتباه)` });
        const shrunk = shrinkOrder(actor, u.orderId, u.itemId, name);
        run(`UPDATE units SET status = 'in_stock', warehouse_id = ?, order_id = NULL, contact_id = NULL, address_id = NULL,
               shipped_at = NULL, installed_at = NULL, warranty_until = NULL, deleted_at = NULL WHERE id = ?`, wh, u.id);
        if (tickets) run('UPDATE tickets SET unit_id = NULL WHERE unit_id = ?', u.id);
        unitEvent(actor, u.id, 'returned', `برگشت به انبار — جدا شدن از مشتری و ${orderNo} (ثبت اشتباه)`, 'unit', u.id);
        const whName = one('SELECT name FROM warehouses WHERE id = ?', wh)?.name ?? 'انبار';
        notes.push(`به ${whName} برگشت (موجودی +۱)`);
        if (shrunk) notes.push(shrunk);
        logActivity(actor, 'unit', u.id, 'return', `برگشت ${name} به ${whName} و جدا شدن از مشتری`);
        result.effects.push({ id, name, reason: notes.join(' · ') });
        result.deleted++;
        continue;
      }

      if (u.manual) {
        ledger(actor, u, 'unit_removed', `حذف ${name} (ثبت دستی اشتباه) — بدون اثر بر موجودی`, u.orderId ? 'order' : 'unit', u.orderId ?? u.id);
        notes.push('موجودی انبار تغییری نکرد');
      } else if (u.warehouseId) {
        // A device on the shelf whose record was wrong: the stock count drops with it.
        if (u.status === 'reserved') reserve(actor.orgId, u.itemId, u.warehouseId, -1);
        moveStock(actor, { itemId: u.itemId, kind: 'unit_removed', qty: 1, fromWh: u.warehouseId, allowNegative: true, refType: 'unit', refId: u.id, note: `حذف ${name} از موجودی (ثبت اشتباه)` });
        notes.push(`از موجودی ${one('SELECT name FROM warehouses WHERE id = ?', u.warehouseId)?.name ?? 'انبار'} کم شد`);
      } else {
        ledger(actor, u, 'unit_removed', `حذف ${name}`, 'unit', u.id);
      }
      if (u.orderId) {
        const shrunk = shrinkOrder(actor, u.orderId, u.itemId, name);
        if (shrunk) notes.push(shrunk);
      }
      if (tickets) { run('UPDATE tickets SET unit_id = NULL WHERE unit_id = ?', u.id); notes.push(`${tickets} تیکت از دستگاه جدا شد`); }
      unlinkTasks('unit', u.id);
      run('DELETE FROM units WHERE id = ?', u.id); // events, QC and production steps cascade
      logActivity(actor, 'unit', u.id, 'delete', `حذف دستگاه ${name}`);
      if (u.contactId) logActivity(actor, 'contact', u.contactId, 'unit_removed', `حذف دستگاه ${name}`);
      result.effects.push({ id, name, reason: notes.join(' · ') || 'حذف شد' });
      result.deleted++;
    }
    return result;
  });
}

