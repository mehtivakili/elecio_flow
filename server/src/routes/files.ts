import { Router, raw } from 'express';
import { q, one, run, uid, type Row } from '../db.ts';
import { HttpError, getSettings, guard, h, logActivity, mustFind, nextNumber, type AuthUser } from '../core.ts';
import { ATTACHMENT_KINDS, canWrite } from '../../../shared/defaults.ts';

/* ═════════════════════════ Documents ═════════════════════════
 * Scanned or photographed paperwork (a handwritten sales invoice, a supplier's invoice
 * or receipt, a contract…) kept with a customer / sales order or a supplier / purchase
 * order. Files live inside the database so backups and the uploaded .db carry them.
 */

export const filesRouter = Router();

const MAX_BYTES = 20 * 1024 * 1024;
const MIMES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(1, 4).toString('latin1') === 'PNG',
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const META_COLUMNS = `a.id, a.kind, a.title, a.doc_number, a.doc_date, a.amount, a.contact_id, a.order_id, a.supplier_id, a.po_id,
  a.file_name, a.mime, a.size, a.note, a.uploaded_by, a.created_at,
  (SELECT full_name FROM users WHERE id = a.uploaded_by) AS uploaded_by_name,
  (SELECT number FROM orders WHERE id = a.order_id) AS order_number,
  (SELECT number FROM purchase_orders WHERE id = a.po_id) AS po_number`;

/** Customer documents need sales or CRM rights; supplier documents need purchasing rights. */
function assertCanWrite(user: AuthUser, row: { contactId?: string | null; orderId?: string | null; supplierId?: string | null; poId?: string | null }) {
  const purchase = !!(row.supplierId || row.poId);
  const ok = purchase ? canWrite(user.roles, 'scm') : canWrite(user.roles, 'sales') || canWrite(user.roles, 'crm');
  if (!ok) throw new HttpError(403, 'شما مجوز افزودن یا تغییر این سند را ندارید');
}

/** Resolves and validates the record a document belongs to; an order implies its customer, a PO its supplier. */
function resolveLinks(orgId: string, input: Row) {
  let contactId: string | null = input.contactId || null;
  let supplierId: string | null = input.supplierId || null;
  const orderId: string | null = input.orderId || null;
  const poId: string | null = input.poId || null;
  if (orderId) contactId = mustFind('orders', orderId, orgId, 'سفارش').contactId;
  if (poId) supplierId = mustFind('purchase_orders', poId, orgId, 'سفارش خرید').supplierId;
  if (contactId) mustFind('contacts', contactId, orgId, 'مشتری');
  if (supplierId) mustFind('suppliers', supplierId, orgId, 'تأمین‌کننده');
  if (!contactId && !supplierId) throw new HttpError(400, 'سند باید به یک مشتری یا تأمین‌کننده وصل باشد');
  if (contactId && supplierId) throw new HttpError(400, 'سند نمی‌تواند هم‌زمان به مشتری و تأمین‌کننده وصل باشد');
  return { contactId, supplierId, orderId, poId };
}

const cleanMeta = (input: Row) => {
  const kind = String(input.kind ?? 'other');
  if (!ATTACHMENT_KINDS[kind]) throw new HttpError(400, 'نوع سند نامعتبر است');
  const amount = input.amount === null || input.amount === undefined || input.amount === '' ? null : Math.round(Number(input.amount));
  if (amount !== null && !(amount >= 0)) throw new HttpError(400, 'مبلغ نامعتبر است');
  const docDate = input.docDate ? Number(input.docDate) : null;
  return {
    kind,
    title: String(input.title ?? '').trim().slice(0, 200),
    docNumber: String(input.docNumber ?? '').trim().slice(0, 60),
    docDate: docDate && Number.isFinite(docDate) ? docDate : null,
    amount,
    note: String(input.note ?? '').trim().slice(0, 2000),
  };
};

/** ?contactId= (also that customer's orders) · ?orderId= · ?supplierId= (also its POs) · ?poId= */
filesRouter.get('/attachments', h((req) => {
  const { contactId, orderId, supplierId, poId } = req.query as Record<string, string | undefined>;
  const org = req.user.orgId;
  if (orderId) return q(`SELECT ${META_COLUMNS} FROM attachments a WHERE a.org_id = ? AND a.order_id = ? ORDER BY COALESCE(a.doc_date, a.created_at) DESC`, org, orderId);
  if (poId) return q(`SELECT ${META_COLUMNS} FROM attachments a WHERE a.org_id = ? AND a.po_id = ? ORDER BY COALESCE(a.doc_date, a.created_at) DESC`, org, poId);
  if (contactId) return q(`SELECT ${META_COLUMNS} FROM attachments a WHERE a.org_id = ? AND a.contact_id = ? ORDER BY COALESCE(a.doc_date, a.created_at) DESC`, org, contactId);
  if (supplierId) return q(`SELECT ${META_COLUMNS} FROM attachments a WHERE a.org_id = ? AND a.supplier_id = ? ORDER BY COALESCE(a.doc_date, a.created_at) DESC`, org, supplierId);
  throw new HttpError(400, 'مشخص کنید اسناد کدام رکورد را می‌خواهید');
}));

/** Body: the file bytes. Metadata: the X-Attachment-Meta header (URI-encoded JSON). */
filesRouter.post('/attachments', raw({ type: () => true, limit: MAX_BYTES }), h((req) => {
  let meta: Row;
  try { meta = JSON.parse(decodeURIComponent(String(req.headers['x-attachment-meta'] ?? '{}'))); } catch { throw new HttpError(400, 'اطلاعات سند نامعتبر است'); }
  const data = req.body;
  if (!Buffer.isBuffer(data) || !data.length) throw new HttpError(400, 'فایلی دریافت نشد');
  const mime = String(meta.mime ?? '');
  if (!MIMES[mime]) throw new HttpError(400, 'فقط عکس (JPG، PNG، WEBP) یا PDF قابل بارگذاری است');
  if (!MIMES[mime](data)) throw new HttpError(400, 'محتوای فایل با نوع آن هم‌خوانی ندارد');
  const links = resolveLinks(req.user.orgId, meta);
  assertCanWrite(req.user, links);
  const m = cleanMeta(meta);
  const id = uid('att');
  const fileName = String(meta.fileName ?? 'document').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 120) || 'document';
  run(
    `INSERT INTO attachments (id, org_id, kind, title, doc_number, doc_date, amount, contact_id, order_id, supplier_id, po_id,
       file_name, mime, size, data, note, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, req.user.orgId, m.kind, m.title, m.docNumber, m.docDate, m.amount, links.contactId, links.orderId, links.supplierId, links.poId,
    fileName, mime, data.length, data, m.note, req.user.id, Date.now(),
  );
  const label = `${ATTACHMENT_KINDS[m.kind].label}${m.docNumber ? ` ${m.docNumber}` : ''}`;
  if (links.contactId) logActivity(req.user, 'contact', links.contactId, 'document', `افزودن سند: ${label}`);
  if (links.supplierId) logActivity(req.user, 'supplier', links.supplierId, 'document', `افزودن سند: ${label}`);
  return { id };
}));

filesRouter.get('/attachments/:id/file', (req, res, next) => {
  try {
    const row = one('SELECT file_name, mime, data FROM attachments WHERE id = ? AND org_id = ?', req.params.id, req.user.orgId);
    if (!row) throw new HttpError(404, 'سند پیدا نشد');
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(Buffer.from(row.data as Uint8Array));
  } catch (err) { next(err); }
});

filesRouter.put('/attachments/:id', h((req) => {
  const row = mustFind('attachments', req.params.id, req.user.orgId, 'سند');
  const merged = { contactId: row.contactId, supplierId: row.supplierId, orderId: row.orderId, poId: row.poId, ...pick(req.body ?? {}, ['orderId', 'poId']) };
  const links = resolveLinks(req.user.orgId, merged);
  assertCanWrite(req.user, links);
  const m = cleanMeta({ ...row, ...req.body });
  run(
    `UPDATE attachments SET kind = ?, title = ?, doc_number = ?, doc_date = ?, amount = ?, note = ?, order_id = ?, po_id = ?, contact_id = ?, supplier_id = ?
     WHERE id = ?`,
    m.kind, m.title, m.docNumber, m.docDate, m.amount, m.note, links.orderId, links.poId, links.contactId, links.supplierId, row.id,
  );
}));

filesRouter.delete('/attachments/:id', h((req) => {
  const row = mustFind('attachments', req.params.id, req.user.orgId, 'سند');
  assertCanWrite(req.user, row);
  run('DELETE FROM attachments WHERE id = ?', row.id);
  const label = ATTACHMENT_KINDS[row.kind]?.label ?? 'سند';
  if (row.contactId) logActivity(req.user, 'contact', row.contactId, 'document', `حذف سند: ${label} ${row.docNumber}`.trim());
  if (row.supplierId) logActivity(req.user, 'supplier', row.supplierId, 'document', `حذف سند: ${label} ${row.docNumber}`.trim());
}));

function pick(obj: Row, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

/* ═════════════════════════ Proforma / sales invoice data ═════════════════════════ */

/** Everything the printable proforma or invoice needs, in one call. */
filesRouter.get('/orders/:id/document', h((req) => {
  const order = one('SELECT * FROM orders WHERE id = ? AND org_id = ?', req.params.id, req.user.orgId);
  if (!order) throw new HttpError(404, 'سفارش پیدا نشد');
  const contact = one('SELECT id, name, company, kind, phones_json, emails_json, attrs_json FROM contacts WHERE id = ?', order.contactId);
  const address = order.addressId
    ? one('SELECT * FROM contact_addresses WHERE id = ?', order.addressId)
    : one('SELECT * FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC, sort_order LIMIT 1', order.contactId);
  const person = one('SELECT name, title, phones_json FROM contact_people WHERE contact_id = ? ORDER BY is_primary DESC, sort_order LIMIT 1', order.contactId);
  const lines = q(
    `SELECT l.description, l.qty, l.unit_price, l.discount_pct, i.name AS item_name, i.sku, i.unit AS item_unit
     FROM order_lines l JOIN items i ON i.id = l.item_id WHERE l.order_id = ? ORDER BY l.sort_order`, order.id,
  );
  return { order, contact, address, person, lines, invoice: getSettings(req.user.orgId).invoice, company: getSettings(req.user.orgId).company };
}));

/** Gives the order its sales-invoice number the first time an invoice is produced. */
filesRouter.post('/orders/:id/invoice-number', guard('sales'), h((req) => {
  const order = mustFind('orders', req.params.id, req.user.orgId, 'سفارش');
  if (order.invoiceNumber) return { invoiceNumber: order.invoiceNumber, invoicedAt: order.invoicedAt };
  const number = nextNumber(req.user.orgId, getSettings(req.user.orgId).invoice.invoicePrefix || 'INV');
  const at = Date.now();
  run('UPDATE orders SET invoice_number = ?, invoiced_at = ? WHERE id = ?', number, at, order.id);
  logActivity(req.user, 'order', order.id, 'invoice', `صدور فاکتور فروش ${number}`);
  return { invoiceNumber: number, invoicedAt: at };
}));

/** Buyer details printed on invoices (economic code, national ID…), remembered per customer. */
filesRouter.put('/contacts/:id/billing', guard('sales'), h((req) => {
  const c = mustFind('contacts', req.params.id, req.user.orgId, 'مشتری');
  const b = req.body ?? {};
  const billing = Object.fromEntries(['billingName', 'economicCode', 'nationalId', 'postalCode', 'billingAddress', 'billingPhone']
    .map((k) => [k, String(b[k] ?? '').trim().slice(0, 300)]));
  const attrs = { ...(c.attrs ?? {}), billing };
  run('UPDATE contacts SET attrs_json = ? WHERE id = ?', JSON.stringify(attrs), c.id);
  return billing;
}));
