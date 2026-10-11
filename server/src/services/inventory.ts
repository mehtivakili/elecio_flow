import { one, run, uid, tx, val } from '../db.ts';
import { HttpError, type AuthUser } from '../core.ts';

type Actor = Pick<AuthUser, 'id' | 'orgId'>;

function ensureStockRow(orgId: string, itemId: string, warehouseId: string) {
  run(
    'INSERT OR IGNORE INTO stock (org_id, item_id, warehouse_id, qty, reserved) VALUES (?, ?, ?, 0, 0)',
    orgId, itemId, warehouseId,
  );
}

export function available(itemId: string, warehouseId: string): number {
  const row = one('SELECT qty, reserved FROM stock WHERE item_id = ? AND warehouse_id = ?', itemId, warehouseId);
  return row ? row.qty - row.reserved : 0;
}

export function onHand(itemId: string, warehouseId?: string | null): number {
  return warehouseId
    ? val<number>('SELECT COALESCE(SUM(qty), 0) FROM stock WHERE item_id = ? AND warehouse_id = ?', itemId, warehouseId)
    : val<number>('SELECT COALESCE(SUM(qty), 0) FROM stock WHERE item_id = ?', itemId);
}

export interface MoveInput {
  itemId: string;
  kind: string;
  qty: number;
  fromWh?: string | null;
  toWh?: string | null;
  refType?: string;
  refId?: string;
  note?: string;
  /** Stock being moved out was previously reserved — release the reservation too. */
  fromReserved?: boolean;
  allowNegative?: boolean;
}

/** The only way stock levels change: a ledger row plus the level update, atomically. */
export function moveStock(actor: Actor, m: MoveInput) {
  if (!(m.qty > 0)) throw new HttpError(400, 'مقدار باید بزرگتر از صفر باشد');
  if (!m.fromWh && !m.toWh) throw new HttpError(400, 'انبار مبدأ یا مقصد مشخص نیست');
  return tx(() => {
    if (m.fromWh) {
      ensureStockRow(actor.orgId, m.itemId, m.fromWh);
      const free = m.fromReserved ? onHand(m.itemId, m.fromWh) : available(m.itemId, m.fromWh);
      if (!m.allowNegative && free < m.qty) {
        const item = one('SELECT name FROM items WHERE id = ?', m.itemId);
        throw new HttpError(409, `موجودی کافی نیست: ${item?.name ?? ''} (قابل‌برداشت ${free})`);
      }
      run(
        'UPDATE stock SET qty = qty - ?, reserved = MAX(0, reserved - ?) WHERE item_id = ? AND warehouse_id = ?',
        m.qty, m.fromReserved ? m.qty : 0, m.itemId, m.fromWh,
      );
    }
    if (m.toWh) {
      ensureStockRow(actor.orgId, m.itemId, m.toWh);
      run('UPDATE stock SET qty = qty + ? WHERE item_id = ? AND warehouse_id = ?', m.qty, m.itemId, m.toWh);
    }
    const id = uid('mv');
    run(
      `INSERT INTO stock_moves (id, org_id, item_id, kind, from_wh, to_wh, qty, ref_type, ref_id, note, user_id, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, actor.orgId, m.itemId, m.kind, m.fromWh ?? null, m.toWh ?? null, m.qty,
      m.refType ?? null, m.refId ?? null, m.note ?? '', actor.id, Date.now(),
    );
    return id;
  });
}

export function reserve(orgId: string, itemId: string, warehouseId: string, qty: number) {
  ensureStockRow(orgId, itemId, warehouseId);
  if (qty > 0 && available(itemId, warehouseId) < qty) {
    throw new HttpError(409, 'موجودی آزاد برای رزرو کافی نیست');
  }
  run(
    'UPDATE stock SET reserved = MAX(0, reserved + ?) WHERE item_id = ? AND warehouse_id = ?',
    qty, itemId, warehouseId,
  );
}

export function unitEvent(
  actor: Actor, unitId: string, kind: string, summary: string, refType?: string, refId?: string,
) {
  run(
    `INSERT INTO unit_events (id, org_id, unit_id, kind, summary, ref_type, ref_id, user_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid('ue'), actor.orgId, unitId, kind, summary, refType ?? null, refId ?? null, actor.id, Date.now(),
  );
}

export function defaultWarehouse(orgId: string, kind: 'parts' | 'finished' | 'repair'): string | null {
  return val<string | null>('SELECT id FROM warehouses WHERE org_id = ? AND kind = ? ORDER BY created_at LIMIT 1', orgId, kind);
}
