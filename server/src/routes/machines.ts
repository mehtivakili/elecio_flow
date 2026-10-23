import { Router } from 'express';
import { one, q, run, tx, uid, type Row } from '../db.ts';
import { HttpError, guardRouter, h, logActivity, mustFind, type AuthUser } from '../core.ts';
import { CONTROLLER_BRANDS, brandOf } from '../../../shared/machines.ts';
import { rescore } from '../services/crm.ts';

/* ═════════════════════════ CNC machines & controllers ═════════════════════════
 * Each customer / lead lists its machines, one row per machine: controller brand (required)
 * and controller model (optional). Each machine runs one Elecio. A count given when adding
 * creates that many separate machines (their models usually differ). Workspaces can add
 * their own brands and models beside the built-in catalogue.
 */

export const machinesRouter = Router();
guardRouter(machinesRouter, 'crm');

const clean = (v: unknown, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

const customBrands = (orgId: string) => q('SELECT key, label, color FROM controller_brands WHERE org_id = ? ORDER BY created_at', orgId);
function brandLabel(orgId: string, key: string) {
  if (CONTROLLER_BRANDS.some((b) => b.key === key)) return brandOf(key).label;
  return one('SELECT label FROM controller_brands WHERE org_id = ? AND key = ?', orgId, key)?.label ?? key;
}
const isBrand = (orgId: string, key: string) => CONTROLLER_BRANDS.some((b) => b.key === key) || !!one('SELECT key FROM controller_brands WHERE org_id = ? AND key = ?', orgId, key);

function readMachine(orgId: string, body: Row) {
  const brand = clean(body.controllerBrand, 40);
  if (!brand || !isBrand(orgId, brand)) throw new HttpError(400, 'برند کنترلر را انتخاب کنید');
  return { controllerBrand: brand, controllerModel: clean(body.controllerModel, 60), qty: 1 };
}
/** How many machines to create from one entry (adding «HEIDENHAIN × 2» makes two machines). */
function readCount(body: Row) {
  const n = Math.round(Number(body.count ?? body.qty ?? 1));
  if (!(n >= 1 && n <= 99)) throw new HttpError(400, 'تعداد ماشین باید بین ۱ تا ۹۹ باشد');
  return n;
}

/** A model typed in that is not in the catalogue becomes one of this workspace's models. */
function rememberModel(orgId: string, userId: string, brand: string, model: string) {
  const builtIn = CONTROLLER_BRANDS.find((b) => b.key === brand);
  if (!model || builtIn?.models.some((m) => m.toLowerCase() === model.toLowerCase())) return;
  if (one('SELECT id FROM controller_models WHERE org_id = ? AND brand = ? AND lower(model) = lower(?)', orgId, brand, model)) return;
  run('INSERT INTO controller_models (id, org_id, brand, model, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', uid('cm'), orgId, brand, model, userId, Date.now());
}

/**
 * Keeps the older summary fields (machine count, controller brands) in step with the machine
 * list, so lead scoring and the pipeline keep working from the detailed data.
 */
function syncSummary(contactId: string, clearWhenEmpty = false) {
  const rows = q('SELECT controller_brand, qty FROM machines WHERE contact_id = ?', contactId);
  const c = one('SELECT attrs_json FROM contacts WHERE id = ?', contactId);
  if (!c) return;
  if (!rows.length && !clearWhenEmpty) return;
  const attrs = { ...(c.attrs ?? {}) };
  attrs.machines = rows.reduce((s, r) => s + r.qty, 0);
  attrs.controllers = [...new Set(rows.map((r) => (CONTROLLER_BRANDS.some((b) => b.key === r.controllerBrand) ? brandOf(r.controllerBrand).legacy : 'سایر')))];
  run('UPDATE contacts SET attrs_json = ?, updated_at = ? WHERE id = ?', JSON.stringify(attrs), Date.now(), contactId);
  rescore(contactId);
}

const describe = (orgId: string, m: Row) => [brandLabel(orgId, m.controllerBrand), m.controllerModel].filter(Boolean).join(' ');

function insertMachine(user: AuthUser, contactId: string, m: ReturnType<typeof readMachine>, at = Date.now()) {
  const id = uid('mch');
  run(
    `INSERT INTO machines (id, org_id, contact_id, controller_brand, controller_model, qty, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.orgId, contactId, m.controllerBrand, m.controllerModel, m.qty, user.id, at, at,
  );
  rememberModel(user.orgId, user.id, m.controllerBrand, m.controllerModel);
  return id;
}

machinesRouter.get('/contacts/:id/machines', h((req) => {
  mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  return q('SELECT * FROM machines WHERE contact_id = ? AND org_id = ? ORDER BY created_at', req.params.id, req.user.orgId);
}));

machinesRouter.post('/contacts/:id/machines', h((req) => {
  const c = mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  const m = readMachine(req.user.orgId, req.body ?? {});
  const count = readCount(req.body ?? {});
  return tx(() => {
    const now = Date.now();
    const ids = Array.from({ length: count }, (_, i) => insertMachine(req.user, c.id, m, now + i));
    syncSummary(c.id);
    logActivity(req.user, 'contact', c.id, 'machine', `افزودن ${count > 1 ? `${count} ماشین` : 'ماشین'}: ${describe(req.user.orgId, m)}`);
    return { id: ids[0], ids };
  });
}));

/** The whole machine list at once (customer form): rows with an id are updated, new rows added, missing rows removed. */
machinesRouter.put('/contacts/:id/machines', h((req) => {
  const c = mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  const list: Row[] = Array.isArray(req.body?.machines) ? req.body.machines : [];
  if (list.length > 300) throw new HttpError(400, 'تعداد ردیف‌ها زیاد است');
  // A row that still carries a count is split into that many machines.
  const rows = list.flatMap((r) => {
    const m = readMachine(req.user.orgId, r);
    const n = r.qty > 1 ? readCount(r) : 1;
    return Array.from({ length: n }, (_, i) => ({ id: i === 0 && r.id ? String(r.id) : null, ...m }));
  });
  if (rows.length > 500) throw new HttpError(400, 'تعداد ماشین‌ها زیاد است');
  return tx(() => {
    const existing = new Set(q('SELECT id FROM machines WHERE contact_id = ?', c.id).map((r) => r.id));
    const keep = new Set(rows.filter((r) => r.id && existing.has(r.id)).map((r) => r.id));
    for (const id of existing) if (!keep.has(id)) run('DELETE FROM machines WHERE id = ?', id);
    const now = Date.now();
    rows.forEach((r, i) => {
      if (r.id && keep.has(r.id)) {
        run('UPDATE machines SET controller_brand = ?, controller_model = ?, qty = ?, created_at = ?, updated_at = ? WHERE id = ?',
          r.controllerBrand, r.controllerModel, r.qty, now + i, now, r.id);
        rememberModel(req.user.orgId, req.user.id, r.controllerBrand, r.controllerModel);
      } else insertMachine(req.user, c.id, r, now + i);
    });
    syncSummary(c.id, true);
    logActivity(req.user, 'contact', c.id, 'machine', `فهرست ماشین‌ها: ${rows.map((r) => describe(req.user.orgId, r)).join('، ') || 'خالی'}`);
    return { count: rows.length };
  });
}));

machinesRouter.put('/machines/:id', h((req) => {
  const row = mustFind('machines', req.params.id, req.user.orgId, 'ماشین');
  const m = readMachine(req.user.orgId, { ...row, ...req.body });
  tx(() => {
    run('UPDATE machines SET controller_brand = ?, controller_model = ?, qty = ?, updated_at = ? WHERE id = ?', m.controllerBrand, m.controllerModel, m.qty, Date.now(), row.id);
    rememberModel(req.user.orgId, req.user.id, m.controllerBrand, m.controllerModel);
    syncSummary(row.contactId);
  });
}));

/** Duplicate a machine row (same brand, model and count) into the same list. */
machinesRouter.post('/machines/:id/copy', h((req) => {
  const row = mustFind('machines', req.params.id, req.user.orgId, 'ماشین');
  return tx(() => {
    const id = insertMachine(req.user, row.contactId, readMachine(req.user.orgId, row));
    syncSummary(row.contactId);
    return { id };
  });
}));

machinesRouter.delete('/machines/:id', h((req) => {
  const row = mustFind('machines', req.params.id, req.user.orgId, 'ماشین');
  tx(() => {
    run('DELETE FROM machines WHERE id = ?', row.id);
    syncSummary(row.contactId, true);
    logActivity(req.user, 'contact', row.contactId, 'machine', `حذف ماشین: ${describe(req.user.orgId, row)}`);
  });
}));

/** Turns the old summary (brands + machine count) into machine rows, which the user then completes. */
machinesRouter.post('/contacts/:id/machines/from-summary', h((req) => {
  const c = mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  if (one('SELECT id FROM machines WHERE contact_id = ?', c.id)) throw new HttpError(409, 'برای این مخاطب ماشین ثبت شده است');
  const legacy: string[] = Array.isArray(c.attrs?.controllers) ? c.attrs.controllers : [];
  const count = Math.max(0, Math.round(Number(c.attrs?.machines) || 0));
  const brands = [...new Set(legacy.map((l) => CONTROLLER_BRANDS.find((b) => b.legacy === l && b.key !== 'other')?.key ?? 'other'))];
  if (!brands.length) throw new HttpError(400, 'اطلاعات قبلی کنترلر برای این مخاطب ثبت نشده است');
  const now = Date.now();
  tx(() => {
    // One brand: the whole count belongs to it. Several: the split is unknown — 1 each, to be corrected.
    // One brand: that many machines of it. Several brands: one each (the split is unknown).
    const plan = brands.length === 1 ? Array(Math.min(99, Math.max(1, count))).fill(brands[0]) : brands;
    plan.forEach((brand, i) => insertMachine(req.user, c.id, { controllerBrand: brand, controllerModel: '', qty: 1 }, now + i));
    syncSummary(c.id);
  });
  return { created: brands.length === 1 ? Math.min(99, Math.max(1, count)) : brands.length };
}));

/** Picker data: the workspace's own brands and models, plus every model already in use (with counts). */
machinesRouter.get('/controller-models', h((req) => {
  const custom = q('SELECT brand, model FROM controller_models WHERE org_id = ? ORDER BY model', req.user.orgId);
  const used = q(
    `SELECT controller_brand AS brand, controller_model AS model, SUM(qty) AS machines FROM machines
     WHERE org_id = ? AND controller_model != '' GROUP BY controller_brand, lower(controller_model)`, req.user.orgId,
  );
  const brandUse = Object.fromEntries(q('SELECT controller_brand AS b, SUM(qty) AS n FROM machines WHERE org_id = ? GROUP BY controller_brand', req.user.orgId).map((r) => [r.b, r.n]));
  return { custom, used, brands: customBrands(req.user.orgId).map((b) => ({ ...b, machines: brandUse[b.key] ?? 0 })) };
}));

machinesRouter.post('/controller-models', h((req) => {
  const brand = clean(req.body?.brand, 40);
  const model = clean(req.body?.model, 60);
  if (!isBrand(req.user.orgId, brand) || !model) throw new HttpError(400, 'برند و مدل را وارد کنید');
  rememberModel(req.user.orgId, req.user.id, brand, model);
  return { brand, model };
}));

/** Add a controller brand that is not in the built-in list. */
machinesRouter.post('/controller-brands', h((req) => {
  const label = clean(req.body?.label, 40);
  if (label.length < 2) throw new HttpError(400, 'نام برند را وارد کنید');
  const taken = CONTROLLER_BRANDS.find((b) => b.label.toLowerCase() === label.toLowerCase() || b.fa === label)
    ?? one('SELECT key FROM controller_brands WHERE org_id = ? AND lower(label) = lower(?)', req.user.orgId, label);
  if (taken) throw new HttpError(409, 'این برند در فهرست هست');
  const color = /^#[0-9a-f]{6}$/i.test(String(req.body?.color)) ? String(req.body.color) : '#779BE7';
  const key = `c_${uid('b').slice(2, 12)}`;
  run('INSERT INTO controller_brands (key, org_id, label, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', key, req.user.orgId, label, color, req.user.id, Date.now());
  logActivity(req.user, 'settings', key, 'brand', `افزودن برند کنترلر ${label}`);
  return { key, label, color };
}));

/**
 * Remove an added brand. Machines that use it are moved to «سایر» (with ?force=1); without it
 * the request is refused while machines still use the brand. Built-in brands cannot be removed.
 */
machinesRouter.delete('/controller-brands/:key', h((req) => {
  const b = one('SELECT * FROM controller_brands WHERE org_id = ? AND key = ?', req.user.orgId, req.params.key);
  if (!b) throw new HttpError(404, 'برند پیدا نشد (برندهای پیش‌فرض قابل حذف نیستند)');
  const contacts = q('SELECT DISTINCT contact_id FROM machines WHERE org_id = ? AND controller_brand = ?', req.user.orgId, b.key).map((r) => r.contactId);
  const used = one('SELECT COUNT(*) AS n FROM machines WHERE org_id = ? AND controller_brand = ?', req.user.orgId, b.key)?.n ?? 0;
  if (used && req.query.force !== '1') throw new HttpError(409, `${used} ماشین با برند «${b.label}» ثبت شده`, { machines: used });
  return tx(() => {
    run("UPDATE machines SET controller_brand = 'other', controller_model = '', updated_at = ? WHERE org_id = ? AND controller_brand = ?", Date.now(), req.user.orgId, b.key);
    run('DELETE FROM controller_models WHERE org_id = ? AND brand = ?', req.user.orgId, b.key);
    run('DELETE FROM controller_brands WHERE org_id = ? AND key = ?', req.user.orgId, b.key);
    contacts.forEach((id) => syncSummary(id));
    logActivity(req.user, 'settings', b.key, 'brand', `حذف برند کنترلر ${b.label}${used ? ` — ${used} ماشین به «سایر» منتقل شد` : ''}`);
    return { moved: used };
  });
}));

/**
 * Remove an added controller model: it leaves the picker, and machines that had it keep
 * their brand with the model cleared. Built-in catalogue models cannot be removed.
 */
machinesRouter.post('/controller-models/remove', h((req) => {
  const brand = clean(req.body?.brand, 40);
  const model = clean(req.body?.model, 60);
  if (!brand || !model) throw new HttpError(400, 'برند و مدل را مشخص کنید');
  if (CONTROLLER_BRANDS.find((b) => b.key === brand)?.models.some((m) => m.toLowerCase() === model.toLowerCase())) {
    throw new HttpError(400, 'مدل‌های فهرست پیش‌فرض قابل حذف نیستند');
  }
  return tx(() => {
    const cleared = getChanges(run(
      "UPDATE machines SET controller_model = '', updated_at = ? WHERE org_id = ? AND controller_brand = ? AND lower(controller_model) = lower(?)",
      Date.now(), req.user.orgId, brand, model,
    ));
    run('DELETE FROM controller_models WHERE org_id = ? AND brand = ? AND lower(model) = lower(?)', req.user.orgId, brand, model);
    logActivity(req.user, 'settings', brand, 'model', `حذف مدل کنترلر ${brandLabel(req.user.orgId, brand)} ${model}${cleared ? ` — از ${cleared} ماشین پاک شد` : ''}`);
    return { cleared };
  });
}));
const getChanges = (r: { changes: number | bigint }) => Number(r.changes);

/** Everything a workspace added (brands, models) with how many machines use each — for the settings page. */
machinesRouter.get('/controller-catalogue', h((req) => {
  const brands = customBrands(req.user.orgId).map((b) => ({
    ...b, machines: one('SELECT COUNT(*) AS n FROM machines WHERE org_id = ? AND controller_brand = ?', req.user.orgId, b.key)?.n ?? 0,
  }));
  const models = q('SELECT brand, model, created_at FROM controller_models WHERE org_id = ? ORDER BY brand, model', req.user.orgId).map((m) => ({
    ...m, machines: one('SELECT COUNT(*) AS n FROM machines WHERE org_id = ? AND controller_brand = ? AND lower(controller_model) = lower(?)', req.user.orgId, m.brand, m.model)?.n ?? 0,
  }));
  return { brands, models };
}));

/** Statistics: every machine with its site, and contacts that only have the older brand summary. */
machinesRouter.get('/machines/stats', h((req) => {
  const rows = q(
    `SELECT m.*, c.name AS contact_name, c.stage AS contact_stage,
       (SELECT a.county FROM contact_addresses a WHERE a.contact_id = c.id ORDER BY a.is_primary DESC, a.sort_order LIMIT 1) AS city,
       (SELECT a.province FROM contact_addresses a WHERE a.contact_id = c.id ORDER BY a.is_primary DESC, a.sort_order LIMIT 1) AS province
     FROM machines m JOIN contacts c ON c.id = m.contact_id
     WHERE m.org_id = ? AND c.deleted_at IS NULL ORDER BY c.name, m.created_at`, req.user.orgId,
  );
  const summaryOnly = q(
    `SELECT id, name, attrs_json FROM contacts c WHERE org_id = ? AND deleted_at IS NULL
       AND json_array_length(COALESCE(json_extract(attrs_json, '$.controllers'), '[]')) > 0
       AND NOT EXISTS (SELECT 1 FROM machines m WHERE m.contact_id = c.id)`, req.user.orgId,
  ).map((c) => ({ id: c.id, name: c.name, controllers: c.attrs?.controllers ?? [], machines: Number(c.attrs?.machines) || 0 }));
  return { machines: rows, summaryOnly };
}));
