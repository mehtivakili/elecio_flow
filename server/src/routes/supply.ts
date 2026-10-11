import { Router } from 'express';
import { insert, one, q, run, tx, uid, update, val } from '../db.ts';
import { DAY, HttpError, getSettings, guard, h, logActivity, mustFind, nextNumber } from '../core.ts';
import { moveStock } from '../services/inventory.ts';

/* ═════════════════════════ Items, BOM, warehouses, stock (WMS) ═════════════════════════ */

export const inventoryRouter = Router();
inventoryRouter.use(guard('inventory'));

const ITEM_COLUMNS = [
  'sku', 'name', 'kind', 'category', 'unit', 'price', 'cost', 'serialized', 'warranty_months', 'hw_rev', 'fw_version',
  'reorder_point', 'reorder_qty', 'lead_time_days', 'supplier_id', 'description', 'active',
];

/** Items with on-hand / reserved / incoming totals and a reorder signal. */
function itemsWithStock(orgId: string, where = '', ...params: (string | number)[]) {
  return q(
    `SELECT i.*, s.name AS supplier_name,
       COALESCE((SELECT SUM(qty) FROM stock WHERE item_id = i.id), 0) AS on_hand,
       COALESCE((SELECT SUM(reserved) FROM stock WHERE item_id = i.id), 0) AS reserved,
       COALESCE((SELECT SUM(l.qty - l.received_qty) FROM po_lines l JOIN purchase_orders p ON p.id = l.po_id
                 WHERE l.item_id = i.id AND p.status IN ('sent','confirmed','in_transit','partial')), 0) AS incoming,
       (SELECT COUNT(*) FROM bom_lines WHERE parent_id = i.id) AS bom_count
     FROM items i LEFT JOIN suppliers s ON s.id = i.supplier_id
     WHERE i.org_id = ? ${where} ORDER BY i.kind DESC, i.name`,
    orgId, ...params,
  ).map((i) => {
    const free = i.onHand - i.reserved;
    const needsReorder = i.kind !== 'service' && i.reorderPoint > 0 && free + i.incoming <= i.reorderPoint;
    return { ...i, available: free, needsReorder };
  });
}

inventoryRouter.get('/items', h((req) => {
  const { kind } = req.query as Record<string, string>;
  return kind ? itemsWithStock(req.user.orgId, 'AND i.kind = ?', kind) : itemsWithStock(req.user.orgId);
}));

inventoryRouter.get('/items/:id', h((req) => {
  const item = itemsWithStock(req.user.orgId, 'AND i.id = ?', req.params.id)[0];
  if (!item) throw new HttpError(404, 'کالا پیدا نشد');
  return {
    item,
    stock: q(
      `SELECT s.*, w.name AS warehouse_name, w.code FROM stock s JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.item_id = ? ORDER BY w.created_at`, item.id,
    ),
    bom: q(
      `SELECT b.*, i.name, i.sku, i.unit, i.cost,
         COALESCE((SELECT SUM(qty - reserved) FROM stock WHERE item_id = i.id), 0) AS available
       FROM bom_lines b JOIN items i ON i.id = b.component_id WHERE b.parent_id = ?`, item.id,
    ),
    usedIn: q(
      `SELECT b.qty, i.id, i.name, i.sku FROM bom_lines b JOIN items i ON i.id = b.parent_id WHERE b.component_id = ?`, item.id,
    ),
    moves: q(
      `SELECT m.*, fw.name AS from_name, tw.name AS to_name FROM stock_moves m
       LEFT JOIN warehouses fw ON fw.id = m.from_wh LEFT JOIN warehouses tw ON tw.id = m.to_wh
       WHERE m.item_id = ? ORDER BY m.at DESC LIMIT 100`, item.id,
    ),
    units: item.serialized
      ? q('SELECT status, COUNT(*) AS n FROM units WHERE item_id = ? GROUP BY status', item.id)
      : [],
  };
}));

inventoryRouter.post('/items', h((req) => {
  const b = req.body ?? {};
  if (!b.sku?.trim() || !b.name?.trim()) throw new HttpError(400, 'کد و نام کالا الزامی است');
  const id = uid('itm');
  try {
    insert('items', { ...b, sku: b.sku.trim().toUpperCase(), id, orgId: req.user.orgId, serialized: b.serialized ? 1 : 0, createdAt: Date.now() },
      ['id', 'org_id', 'created_at', ...ITEM_COLUMNS]);
  } catch {
    throw new HttpError(409, 'کد کالا تکراری است');
  }
  logActivity(req.user, 'item', id, 'create', `تعریف کالا: ${b.name}`);
  return { id };
}));

inventoryRouter.put('/items/:id', h((req) => {
  const item = mustFind('items', req.params.id, req.user.orgId, 'کالا');
  const b = { ...req.body };
  if ('serialized' in b) b.serialized = b.serialized ? 1 : 0;
  if ('active' in b) b.active = b.active ? 1 : 0;
  update('items', item.id, req.user.orgId, b, ITEM_COLUMNS);
  return { id: item.id };
}));

inventoryRouter.put('/items/:id/bom', h((req) => {
  const item = mustFind('items', req.params.id, req.user.orgId, 'کالا');
  const lines = (req.body?.lines ?? []) as { componentId: string; qty: number }[];
  if (lines.some((l) => l.componentId === item.id)) throw new HttpError(400, 'کالا نمی‌تواند جزء خودش باشد');
  tx(() => {
    run('DELETE FROM bom_lines WHERE parent_id = ?', item.id);
    for (const l of lines.filter((x) => x.qty > 0)) {
      run('INSERT INTO bom_lines (id, org_id, parent_id, component_id, qty) VALUES (?, ?, ?, ?, ?)',
        uid('bom'), req.user.orgId, item.id, l.componentId, l.qty);
    }
  });
  logActivity(req.user, 'item', item.id, 'bom', `به‌روزرسانی BOM ${item.name}`);
}));

inventoryRouter.post('/warehouses', h((req) => {
  const b = req.body ?? {};
  if (!b.name?.trim() || !b.code?.trim()) throw new HttpError(400, 'نام و کد انبار الزامی است');
  const id = uid('wh');
  insert('warehouses', { ...b, id, orgId: req.user.orgId, createdAt: Date.now() },
    ['id', 'org_id', 'code', 'name', 'kind', 'address', 'created_at']);
  return { id };
}));

inventoryRouter.put('/warehouses/:id', h((req) => {
  const wh = mustFind('warehouses', req.params.id, req.user.orgId, 'انبار');
  update('warehouses', wh.id, req.user.orgId, req.body ?? {}, ['code', 'name', 'kind', 'address']);
}));

inventoryRouter.get('/stock', h((req) => q(
  `SELECT s.*, i.sku, i.name, i.kind, i.unit, i.cost, i.reorder_point, w.name AS warehouse_name, w.code AS warehouse_code
   FROM stock s JOIN items i ON i.id = s.item_id JOIN warehouses w ON w.id = s.warehouse_id
   WHERE s.org_id = ? AND (s.qty != 0 OR s.reserved != 0) ORDER BY w.created_at, i.name`, req.user.orgId,
)));

inventoryRouter.get('/moves', h((req) => q(
  `SELECT m.*, i.name AS item_name, i.sku, i.unit, fw.name AS from_name, tw.name AS to_name, u.full_name AS user_name
   FROM stock_moves m JOIN items i ON i.id = m.item_id
   LEFT JOIN warehouses fw ON fw.id = m.from_wh LEFT JOIN warehouses tw ON tw.id = m.to_wh
   LEFT JOIN users u ON u.id = m.user_id
   WHERE m.org_id = ? ORDER BY m.at DESC LIMIT 300`, req.user.orgId,
)));

/** Manual receipt / issue / transfer / adjustment. Serialized goods move through their own flows. */
inventoryRouter.post('/moves', h((req) => {
  const b = req.body ?? {};
  const item = mustFind('items', b.itemId, req.user.orgId, 'کالا');
  if (item.serialized && b.kind !== 'adjust') {
    throw new HttpError(400, 'کالای سریالی فقط از طریق تولید، سفارش و تعمیر جابه‌جا می‌شود');
  }
  const kinds: Record<string, [boolean, boolean]> = { receipt: [false, true], issue: [true, false], transfer: [true, true], adjust: [false, false] };
  if (!(b.kind in kinds)) throw new HttpError(400, 'نوع جابه‌جایی نامعتبر است');
  let { fromWh, toWh } = b;
  let qty = Number(b.qty);
  if (b.kind === 'adjust') {
    // Adjustment takes a signed quantity: + adds to the warehouse, − removes from it.
    if (qty > 0) { toWh = b.warehouseId; fromWh = null; } else { fromWh = b.warehouseId; toWh = null; qty = -qty; }
  } else {
    const [needFrom, needTo] = kinds[b.kind];
    if (needFrom && !fromWh) throw new HttpError(400, 'انبار مبدأ را انتخاب کنید');
    if (needTo && !toWh) throw new HttpError(400, 'انبار مقصد را انتخاب کنید');
    if (b.kind === 'transfer' && fromWh === toWh) throw new HttpError(400, 'مبدأ و مقصد یکسان است');
  }
  const id = moveStock(req.user, { itemId: item.id, kind: b.kind, qty, fromWh, toWh, note: b.note });
  logActivity(req.user, 'item', item.id, 'move', `${item.name}: ${b.kind} ${qty} ${item.unit}`);
  return { id };
}));

/* ═════════════════════════ Suppliers & purchase orders (SCM) ═════════════════════════ */

export const supplyRouter = Router();
supplyRouter.use(guard('scm'));

const SUPPLIER_COLUMNS = ['name', 'contact_person', 'phone', 'email', 'country', 'city', 'address', 'categories', 'lead_time_days', 'rating', 'notes'];

/** Supplier scorecard: on-time delivery and average delay, computed from real POs. */
supplyRouter.get('/suppliers', h((req) => q('SELECT * FROM suppliers WHERE org_id = ? ORDER BY name', req.user.orgId).map((s) => {
  const pos = q("SELECT expected_at, received_at, status FROM purchase_orders WHERE supplier_id = ? AND status != 'cancelled'", s.id);
  const received = pos.filter((p) => p.receivedAt && p.expectedAt);
  const onTime = received.filter((p) => p.receivedAt <= p.expectedAt + DAY).length;
  const delays = received.map((p) => Math.max(0, (p.receivedAt - p.expectedAt) / DAY));
  const late = pos.filter((p) => !p.receivedAt && p.expectedAt && p.expectedAt < Date.now() && p.status !== 'draft').length;
  return {
    ...s,
    poCount: pos.length,
    openPos: pos.filter((p) => !['received', 'draft'].includes(p.status)).length,
    lateNow: late,
    onTimeRate: received.length ? Math.round((onTime / received.length) * 100) : null,
    avgDelayDays: delays.length ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null,
    spend: val<number>(
      `SELECT COALESCE(SUM(l.qty * l.unit_cost), 0) FROM po_lines l JOIN purchase_orders p ON p.id = l.po_id
       WHERE p.supplier_id = ? AND p.status != 'cancelled'`, s.id,
    ),
  };
})));

supplyRouter.post('/suppliers', h((req) => {
  if (!req.body?.name?.trim()) throw new HttpError(400, 'نام تأمین‌کننده الزامی است');
  const id = uid('sup');
  insert('suppliers', { ...req.body, id, orgId: req.user.orgId, createdAt: Date.now() }, ['id', 'org_id', 'created_at', ...SUPPLIER_COLUMNS]);
  return { id };
}));

supplyRouter.put('/suppliers/:id', h((req) => {
  const s = mustFind('suppliers', req.params.id, req.user.orgId, 'تأمین‌کننده');
  update('suppliers', s.id, req.user.orgId, req.body ?? {}, SUPPLIER_COLUMNS);
}));

function poWithTotals(where: string, ...params: (string | number)[]) {
  return q(
    `SELECT p.*, s.name AS supplier_name,
       COALESCE((SELECT SUM(qty * unit_cost) FROM po_lines WHERE po_id = p.id), 0) AS total,
       COALESCE((SELECT SUM(qty) FROM po_lines WHERE po_id = p.id), 0) AS qty_total,
       COALESCE((SELECT SUM(received_qty) FROM po_lines WHERE po_id = p.id), 0) AS qty_received
     FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id WHERE ${where} ORDER BY p.created_at DESC`,
    ...params,
  ).map((p) => ({
    ...p,
    delayed: !['received', 'cancelled', 'draft'].includes(p.status) && !!p.expectedAt && p.expectedAt < Date.now(),
    delayDays: p.expectedAt ? Math.round(((p.receivedAt ?? Date.now()) - p.expectedAt) / DAY) : 0,
  }));
}

supplyRouter.get('/purchase-orders', h((req) => poWithTotals('p.org_id = ?', req.user.orgId)));

supplyRouter.get('/purchase-orders/:id', h((req) => {
  const po = poWithTotals('p.id = ? AND p.org_id = ?', req.params.id, req.user.orgId)[0];
  if (!po) throw new HttpError(404, 'سفارش خرید پیدا نشد');
  return {
    po,
    lines: q(
      `SELECT l.*, i.name, i.sku, i.unit FROM po_lines l JOIN items i ON i.id = l.item_id WHERE l.po_id = ?`, po.id,
    ),
    moves: q("SELECT m.*, i.name AS item_name FROM stock_moves m JOIN items i ON i.id = m.item_id WHERE m.ref_type = 'po' AND m.ref_id = ? ORDER BY m.at", po.id),
    activity: q("SELECT * FROM activity WHERE entity_type = 'po' AND entity_id = ? ORDER BY at DESC", po.id),
  };
}));

supplyRouter.post('/purchase-orders', h((req) => {
  const b = req.body ?? {};
  const supplier = mustFind('suppliers', b.supplierId, req.user.orgId, 'تأمین‌کننده');
  const lines = (b.lines ?? []) as { itemId: string; qty: number; unitCost: number }[];
  if (!lines.length) throw new HttpError(400, 'حداقل یک ردیف کالا لازم است');
  const id = uid('po');
  const now = Date.now();
  tx(() => {
    insert('purchase_orders', {
      id, orgId: req.user.orgId, number: nextNumber(req.user.orgId, getSettings(req.user.orgId).company.poPrefix),
      supplierId: supplier.id, status: 'draft', expectedAt: b.expectedAt ?? now + supplier.leadTimeDays * DAY,
      shippingMethod: b.shippingMethod ?? '', shippingCost: b.shippingCost ?? 0, notes: b.notes ?? '',
      createdBy: req.user.id, createdAt: now, updatedAt: now,
    }, ['id', 'org_id', 'number', 'supplier_id', 'status', 'expected_at', 'shipping_method', 'shipping_cost', 'notes', 'created_by', 'created_at', 'updated_at']);
    for (const l of lines) {
      mustFind('items', l.itemId, req.user.orgId, 'کالا');
      run('INSERT INTO po_lines (id, po_id, item_id, qty, unit_cost) VALUES (?, ?, ?, ?, ?)', uid('pol'), id, l.itemId, l.qty, l.unitCost ?? 0);
    }
    logActivity(req.user, 'po', id, 'create', `سفارش خرید از ${supplier.name}`);
  });
  return { id };
}));

const PO_FLOW = ['draft', 'sent', 'confirmed', 'in_transit', 'partial', 'received'];

supplyRouter.post('/purchase-orders/:id/status', h((req) => {
  const po = mustFind('purchase_orders', req.params.id, req.user.orgId, 'سفارش خرید');
  const { status, trackingNo, expectedAt, note } = req.body ?? {};
  if (![...PO_FLOW, 'cancelled'].includes(status) || ['partial', 'received'].includes(status)) {
    throw new HttpError(400, 'وضعیت نامعتبر — دریافت کالا از طریق «ثبت رسید» انجام می‌شود');
  }
  if (status === 'cancelled' && val<number>('SELECT COALESCE(SUM(received_qty),0) FROM po_lines WHERE po_id = ?', po.id) > 0) {
    throw new HttpError(409, 'بخشی از این سفارش دریافت شده و قابل لغو نیست');
  }
  const now = Date.now();
  run(
    `UPDATE purchase_orders SET status = ?, ordered_at = COALESCE(ordered_at, CASE WHEN ? = 'sent' THEN ? END),
       tracking_no = COALESCE(?, tracking_no), expected_at = COALESCE(?, expected_at), updated_at = ? WHERE id = ?`,
    status, status, now, trackingNo ?? null, expectedAt ?? null, now, po.id,
  );
  logActivity(req.user, 'po', po.id, 'status', `${po.number}: ${status}${note ? ` — ${note}` : ''}`);
}));

/** Goods receipt: posts stock into the warehouse and closes the PO when everything has arrived. */
supplyRouter.post('/purchase-orders/:id/receive', h((req) => {
  const po = mustFind('purchase_orders', req.params.id, req.user.orgId, 'سفارش خرید');
  if (['draft', 'cancelled', 'received'].includes(po.status)) throw new HttpError(409, 'این سفارش قابل دریافت نیست');
  const { warehouseId, lines } = req.body ?? {};
  mustFind('warehouses', warehouseId, req.user.orgId, 'انبار');
  tx(() => {
    for (const r of (lines ?? []) as { lineId: string; qty: number }[]) {
      if (!(r.qty > 0)) continue;
      const line = one('SELECT l.*, i.cost FROM po_lines l JOIN items i ON i.id = l.item_id WHERE l.id = ? AND l.po_id = ?', r.lineId, po.id);
      if (!line) throw new HttpError(404, 'ردیف سفارش خرید پیدا نشد');
      if (line.receivedQty + r.qty > line.qty * 1.1) throw new HttpError(409, 'مقدار دریافتی بیش از سفارش است');
      moveStock(req.user, {
        itemId: line.itemId, kind: 'receipt', qty: r.qty, toWh: warehouseId, refType: 'po', refId: po.id, note: po.number,
      });
      run('UPDATE po_lines SET received_qty = received_qty + ? WHERE id = ?', r.qty, line.id);
      // Moving-average cost so margins stay honest as purchase prices change.
      const onHandBefore = val<number>('SELECT COALESCE(SUM(qty),0) FROM stock WHERE item_id = ?', line.itemId) - r.qty;
      const newCost = onHandBefore > 0
        ? Math.round((onHandBefore * line.cost + r.qty * line.unitCost) / (onHandBefore + r.qty))
        : line.unitCost;
      if (line.unitCost) run('UPDATE items SET cost = ? WHERE id = ?', newCost, line.itemId);
    }
    const open = val<number>('SELECT COUNT(*) FROM po_lines WHERE po_id = ? AND received_qty < qty', po.id);
    const now = Date.now();
    run('UPDATE purchase_orders SET status = ?, received_at = ?, updated_at = ? WHERE id = ?',
      open ? 'partial' : 'received', open ? null : now, now, po.id);
    if (!open) {
      const total = val<number>('SELECT COALESCE(SUM(qty * unit_cost),0) FROM po_lines WHERE po_id = ?', po.id) + po.shippingCost;
      run(
        `INSERT INTO expenses (id, org_id, category, amount, at, description, payee, ref_type, ref_id, user_id, created_at)
         VALUES (?, ?, 'خرید قطعات', ?, ?, ?, ?, 'po', ?, ?, ?)`,
        uid('exp'), req.user.orgId, total, now, `سفارش خرید ${po.number}`,
        one('SELECT name FROM suppliers WHERE id = ?', po.supplierId)?.name ?? '', po.id, req.user.id, now,
      );
    }
    logActivity(req.user, 'po', po.id, 'receive', `ثبت رسید انبار برای ${po.number}`);
  });
}));
