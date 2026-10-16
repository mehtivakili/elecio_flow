import { insert, one, q, run, uid, val } from '../db.ts';
import { HttpError, getSettings, logActivity, nextNumber, orderStagesFor, type AuthUser } from '../core.ts';
import { recalcOrder } from './workflow.ts';
import { setStage } from './crm.ts';
import { unitEvent } from './inventory.ts';

/**
 * Manually entered history (owner/admin): past sales and devices that were sold
 * before Elecio Flow existed. None of it touches stock levels — but every entry
 * is written to the stock ledger (kind legacy_sale / manual_unit, no warehouse)
 * and to the activity log, so it stays traceable.
 */

const MONTH = 30 * 86_400_000;

/** A placeholder service item for free-text service lines ("نصب در محل", "آموزش"…). */
function miscServiceItem(orgId: string): string {
  const existing = one("SELECT id FROM items WHERE org_id = ? AND sku = 'SRV-MISC'", orgId);
  if (existing) return existing.id;
  const id = uid('itm');
  const now = Date.now();
  insert('items', {
    id, orgId, sku: 'SRV-MISC', name: 'خدمات متفرقه', kind: 'service', category: 'خدمات', unit: 'خدمت',
    price: 0, cost: 0, active: 1, createdAt: now,
  }, ['id', 'org_id', 'sku', 'name', 'kind', 'category', 'unit', 'price', 'cost', 'active', 'created_at']);
  return id;
}

export interface ManualUnitInput {
  itemId: string;
  count: number;
  serials?: string[];
  contactId?: string | null;
  addressId?: string | null;
  orderId?: string | null;
  date?: number | null;
  unitPrice?: number | null;
  hwRev?: string;
  fwVersion?: string;
  notes?: string;
}

/** Creates device records without touching stock. Missing serials are allowed. */
export function createManualUnits(actor: AuthUser, input: ManualUnitInput): string[] {
  const item = one('SELECT * FROM items WHERE id = ? AND org_id = ?', input.itemId, actor.orgId);
  if (!item) throw new HttpError(400, 'محصول انتخاب نشده');
  const count = Math.round(Number(input.count));
  if (!(count >= 1 && count <= 500)) throw new HttpError(400, 'تعداد دستگاه باید بین ۱ تا ۵۰۰ باشد');
  const serials = (input.serials ?? []).map((s) => String(s ?? '').trim()).filter(Boolean);
  if (serials.length > count) throw new HttpError(400, `تعداد شماره‌سریال‌ها (${serials.length}) از تعداد دستگاه‌ها بیشتر است`);
  const dupesInList = serials.filter((s, i) => serials.findIndex((x) => x.toUpperCase() === s.toUpperCase()) !== i);
  if (dupesInList.length) throw new HttpError(400, `شماره‌سریال تکراری در فهرست: ${dupesInList[0]}`);
  for (const serial of serials) {
    if (val<number>('SELECT COUNT(*) FROM units WHERE org_id = ? AND UPPER(serial) = UPPER(?)', actor.orgId, serial)) {
      throw new HttpError(409, `شماره‌سریال ${serial} قبلاً ثبت شده است`);
    }
  }
  const contact = input.contactId ? one('SELECT id, name FROM contacts WHERE id = ? AND org_id = ?', input.contactId, actor.orgId) : null;
  if (input.contactId && !contact) throw new HttpError(400, 'مشتری پیدا نشد');
  const addressId = input.addressId
    ?? (contact ? one('SELECT id FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC LIMIT 1', contact.id)?.id : null) ?? null;
  const when = input.date ?? null;
  const warrantyMonths = item.warrantyMonths || getSettings(actor.orgId).company.warrantyMonths || 0;
  const ids: string[] = [];
  const now = Date.now();
  for (let k = 0; k < count; k++) {
    const id = uid('unit');
    const serial = serials[k];
    insert('units', {
      id, orgId: actor.orgId, serial: serial ?? `NOSN-${id.slice(5).toUpperCase()}`, serialUnknown: serial ? 0 : 1, manual: 1,
      itemId: item.id, status: contact ? 'installed' : 'registered', hwRev: input.hwRev ?? item.hwRev ?? '',
      fwVersion: input.fwVersion ?? item.fwVersion ?? '', orderId: input.orderId ?? null, contactId: contact?.id ?? null,
      addressId: contact ? addressId : null, builtAt: when, shippedAt: contact ? when : null, installedAt: contact ? when : null,
      warrantyUntil: contact && when && warrantyMonths ? when + warrantyMonths * MONTH : null,
      salePrice: input.unitPrice ?? null, notes: input.notes ?? '', createdAt: now,
    }, ['id', 'org_id', 'serial', 'serial_unknown', 'manual', 'item_id', 'status', 'hw_rev', 'fw_version', 'order_id', 'contact_id',
      'address_id', 'built_at', 'shipped_at', 'installed_at', 'warranty_until', 'sale_price', 'notes', 'created_at']);
    unitEvent(actor, id, 'created', contact ? `ثبت دستی دستگاه برای ${contact.name} (بدون اثر بر موجودی)` : 'ثبت دستی دستگاه (بدون اثر بر موجودی)',
      input.orderId ? 'order' : undefined, input.orderId ?? undefined);
    ids.push(id);
  }
  if (!input.orderId) {
    run(
      `INSERT INTO stock_moves (id, org_id, item_id, kind, from_wh, to_wh, qty, ref_type, ref_id, note, user_id, at)
       VALUES (?, ?, ?, 'manual_unit', NULL, NULL, ?, NULL, NULL, ?, ?, ?)`,
      uid('mv'), actor.orgId, item.id, count,
      `ثبت دستی ${count} دستگاه${contact ? ` برای ${contact.name}` : ''} — بدون اثر بر موجودی`, actor.id, now,
    );
    logActivity(actor, 'item', item.id, 'manual_units', `ثبت دستی ${count} دستگاه ${item.name}${contact ? ` برای ${contact.name}` : ''}`);
  }
  return ids;
}

export interface LegacySaleInput {
  contactId: string;
  date?: number | null;
  lines: { itemId?: string | null; description?: string; qty: number; unitPrice: number; serials?: string[] }[];
  paid?: number | null;
  paidAt?: number | null;
  taxRate?: number;
  discount?: number;
  notes?: string;
}

/** Records a past (already delivered) sale with manual prices — no stock is consumed. */
export function createLegacySale(actor: AuthUser, input: LegacySaleInput): { id: string; units: string[] } {
  const contact = one('SELECT * FROM contacts WHERE id = ? AND org_id = ?', input.contactId, actor.orgId);
  if (!contact) throw new HttpError(400, 'مشتری انتخاب نشده');
  const lines = (input.lines ?? []).filter((l) => (l.itemId || l.description?.trim()) && Number(l.qty) > 0);
  if (!lines.length) throw new HttpError(400, 'حداقل یک ردیف کالا یا خدمت لازم است');
  const s = getSettings(actor.orgId);
  const stages = orderStagesFor(actor.orgId, 'stock', false);
  const finalStage = stages.find((st) => st.final) ?? stages[stages.length - 1];
  const when = input.date ?? null;
  const at = when ?? Date.now();
  const id = uid('so');
  const number = nextNumber(actor.orgId, s.company.orderPrefix);
  const address = one('SELECT id FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC LIMIT 1', contact.id)?.id ?? null;
  insert('orders', {
    id, orgId: actor.orgId, number, contactId: contact.id, addressId: address, ownerId: actor.id, stage: finalStage.key,
    stageEnteredAt: at, status: 'done', fulfillment: 'stock', priority: 'normal', discount: Math.max(0, Math.round(Number(input.discount) || 0)),
    taxRate: Number(input.taxRate) || 0, needsInstallation: 0, notes: input.notes ?? '', legacy: 1, legacyDate: when,
    createdAt: at, updatedAt: Date.now(), closedAt: at,
  }, ['id', 'org_id', 'number', 'contact_id', 'address_id', 'owner_id', 'stage', 'stage_entered_at', 'status', 'fulfillment', 'priority',
    'discount', 'tax_rate', 'needs_installation', 'notes', 'legacy', 'legacy_date', 'created_at', 'updated_at', 'closed_at']);
  run(
    `INSERT INTO stage_log (id, org_id, entity_type, entity_id, stage, entered_at, user_id, note) VALUES (?, ?, 'order', ?, ?, ?, ?, ?)`,
    uid('sl'), actor.orgId, id, finalStage.key, at, actor.id, 'ثبت دستی فروش قبلی',
  );
  const units: string[] = [];
  lines.forEach((l, index) => {
    const itemId = l.itemId || miscServiceItem(actor.orgId);
    const item = one('SELECT * FROM items WHERE id = ? AND org_id = ?', itemId, actor.orgId);
    if (!item) throw new HttpError(400, 'کالای ردیف پیدا نشد');
    const qty = Number(l.qty);
    const unitPrice = Math.max(0, Math.round(Number(l.unitPrice) || 0));
    run(
      `INSERT INTO order_lines (id, order_id, item_id, description, qty, unit_price, discount_pct, allocated, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      uid('ol'), id, item.id, l.description ?? '', qty, unitPrice, qty, index,
    );
    if (item.kind === 'service') return;
    run(
      `INSERT INTO stock_moves (id, org_id, item_id, kind, from_wh, to_wh, qty, ref_type, ref_id, note, user_id, at)
       VALUES (?, ?, ?, 'legacy_sale', NULL, NULL, ?, 'order', ?, ?, ?, ?)`,
      uid('mv'), actor.orgId, item.id, qty, id, `فروش قبلی ${number} به ${contact.name} — ثبت دستی، بدون اثر بر موجودی`, actor.id, Date.now(),
    );
    // Every sold device (a product, serialised or not) gets a record in the device registry.
    if (item.serialized || item.kind === 'product') {
      if (!Number.isInteger(qty)) throw new HttpError(400, `تعداد دستگاه ${item.name} باید عدد صحیح باشد`);
      units.push(...createManualUnits(actor, {
        itemId: item.id, count: qty, serials: l.serials, contactId: contact.id, addressId: address, orderId: id, date: when, unitPrice,
      }));
    }
  });
  const paid = Math.max(0, Math.round(Number(input.paid) || 0));
  if (paid > 0) {
    run(
      `INSERT INTO payments (id, org_id, order_id, amount, method, reference, paid_at, note, user_id) VALUES (?, ?, ?, ?, 'other', '', ?, ?, ?)`,
      uid('pay'), actor.orgId, id, paid, input.paidAt ?? when ?? 0, 'ثبت دستی فروش قبلی', actor.id,
    );
  }
  recalcOrder(id);
  if (contact.stage !== 'customer') setStage(contact.id, 'customer');
  logActivity(actor, 'order', id, 'legacy', `ثبت دستی فروش قبلی ${number} برای ${contact.name}${when ? '' : ' (بدون تاریخ)'}`);
  return { id, units };
}

/** Assign or change the customer of manually registered devices later on. */
export function assignUnits(actor: AuthUser, ids: string[], contactId: string | null) {
  const contact = contactId ? one('SELECT id, name FROM contacts WHERE id = ? AND org_id = ?', contactId, actor.orgId) : null;
  if (contactId && !contact) throw new HttpError(400, 'مشتری پیدا نشد');
  const address = contact ? one('SELECT id FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC LIMIT 1', contact.id)?.id ?? null : null;
  let changed = 0;
  for (const id of ids) {
    const unit = one('SELECT * FROM units WHERE id = ? AND org_id = ?', id, actor.orgId);
    if (!unit) continue;
    if (!unit.manual && unit.status !== 'registered') throw new HttpError(409, 'فقط دستگاه‌های ثبت دستی را می‌توان این‌جا به مشتری داد؛ بقیه از مسیر سفارش واگذار می‌شوند');
    run('UPDATE units SET contact_id = ?, address_id = ?, status = ? WHERE id = ?',
      contact?.id ?? null, address, contact ? 'installed' : 'registered', unit.id);
    unitEvent(actor, unit.id, 'assigned', contact ? `اختصاص دستی به ${contact.name}` : 'برداشتن مشتری از دستگاه');
    changed++;
  }
  return { changed };
}

/** Used by the units list to tell how many manual devices are still waiting for a customer. */
export const pendingManualUnits = (orgId: string) =>
  q("SELECT COUNT(*) AS n FROM units WHERE org_id = ? AND status = 'registered' AND deleted_at IS NULL", orgId)[0]?.n ?? 0;
