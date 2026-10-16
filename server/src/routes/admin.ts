import { Router, raw } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BACKUP_DIR, DB_PATH, closeDb, getDb, q, run, val } from '../db.ts';
import { HttpError, adminOnly, clearSettingsCache, h, logActivity } from '../core.ts';

/* ═════════════════════════ Archive (soft-deleted records) ═════════════════════════ */

export const adminRouter = Router();

const ARCHIVE_TYPES: Record<string, { table: string; label: string; select: string }> = {
  contact: { table: 'contacts', label: 'مخاطب', select: 'SELECT id, name AS title, company AS subtitle, deleted_at FROM contacts' },
  item: { table: 'items', label: 'کالا', select: 'SELECT id, name AS title, sku AS subtitle, deleted_at FROM items' },
  supplier: { table: 'suppliers', label: 'تأمین‌کننده', select: 'SELECT id, name AS title, city AS subtitle, deleted_at FROM suppliers' },
  order: {
    table: 'orders', label: 'سفارش فروش',
    select: 'SELECT o.id, o.number AS title, (SELECT name FROM contacts WHERE id = o.contact_id) AS subtitle, o.deleted_at FROM orders o',
  },
  po: {
    table: 'purchase_orders', label: 'سفارش خرید',
    select: 'SELECT p.id, p.number AS title, (SELECT name FROM suppliers WHERE id = p.supplier_id) AS subtitle, p.deleted_at FROM purchase_orders p',
  },
  unit: {
    table: 'units', label: 'دستگاه',
    select: "SELECT u.id, CASE WHEN u.serial_unknown = 1 THEN 'بدون سریال' ELSE u.serial END AS title, (SELECT name FROM items WHERE id = u.item_id) AS subtitle, u.deleted_at FROM units u",
  },
};

adminRouter.get('/archive', adminOnly, h((req) => Object.entries(ARCHIVE_TYPES).flatMap(([type, t]) =>
  q(`${t.select} WHERE org_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`, req.user.orgId)
    .map((r) => ({ ...r, type, typeLabel: t.label })))));

adminRouter.post('/archive/restore', adminOnly, h((req) => {
  const t = ARCHIVE_TYPES[String(req.body?.type)];
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (!t || !ids.length) throw new HttpError(400, 'مورد نامعتبر است');
  let restored = 0;
  for (const id of ids) {
    const changed = getDb().prepare(`UPDATE ${t.table} SET deleted_at = NULL WHERE id = ? AND org_id = ? AND deleted_at IS NOT NULL`).run(id, req.user.orgId).changes;
    if (!changed) continue;
    if (t.table === 'items') run('UPDATE items SET active = 1 WHERE id = ?', id);
    logActivity(req.user, String(req.body.type), id, 'restore', `بازگردانی ${t.label} از بایگانی`);
    restored++;
  }
  return { restored };
}));

/* ═════════════════════════ Backups ═════════════════════════
 * The database is one SQLite file. Backups are consistent snapshots written with
 * VACUUM INTO next to it (backups/). Owners can download a snapshot, restore any
 * stored backup, import a .db file, and schedule automatic backups.
 */

interface Schedule { enabled: boolean; everyDays: number; keep: number; lastAt: number | null }
const SCHEDULE_FILE = () => path.join(BACKUP_DIR, 'schedule.json');
const DEFAULT_SCHEDULE: Schedule = { enabled: false, everyDays: 1, keep: 14, lastAt: null };

export function readSchedule(): Schedule {
  try { return { ...DEFAULT_SCHEDULE, ...JSON.parse(fs.readFileSync(SCHEDULE_FILE(), 'utf8')) }; } catch { return { ...DEFAULT_SCHEDULE }; }
}
function writeSchedule(s: Schedule) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(SCHEDULE_FILE(), JSON.stringify(s, null, 2));
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const safeName = (name: string) => {
  const base = path.basename(name);
  if (!/^[\w.-]+\.db$/.test(base)) throw new HttpError(400, 'نام فایل پشتیبان نامعتبر است');
  return base;
};

/** Writes a consistent snapshot of the live database into backups/. */
export function createBackup(kind: 'manual' | 'auto' | 'before-restore'): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  let file = path.join(BACKUP_DIR, `elecio-${kind}-${stamp()}.db`);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(BACKUP_DIR, `elecio-${kind}-${stamp()}-${n}.db`);
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).map((name) => {
    const st = fs.statSync(path.join(BACKUP_DIR, name));
    return { name, size: st.size, at: st.mtimeMs, kind: name.includes('-auto-') ? 'auto' : name.startsWith('before-') || name.includes('before-restore') ? 'safety' : 'manual' };
  }).sort((a, b) => b.at - a.at);
}

/** Keeps the newest `keep` automatic backups; manual and safety copies are never pruned. */
function pruneAuto(keep: number) {
  listBackups().filter((b) => b.kind === 'auto').slice(Math.max(1, keep)).forEach((b) => {
    try { fs.rmSync(path.join(BACKUP_DIR, b.name)); } catch { /* in use */ }
  });
}

/** Called periodically from index.ts. */
export function runScheduledBackup() {
  const s = readSchedule();
  if (!s.enabled) return;
  const due = !s.lastAt || Date.now() - s.lastAt >= Math.max(1, s.everyDays) * 86_400_000;
  if (!due) return;
  const file = createBackup('auto');
  writeSchedule({ ...s, lastAt: Date.now() });
  pruneAuto(s.keep);
  console.log(`[elecio-flow] automatic backup → ${file}`);
}

/** Backups contain the whole file, so they are limited to the owner of a single-workspace install. */
const ownerOnly: typeof adminOnly = (req, _res, next) => {
  if (!req.user.roles.includes('owner')) return next(new HttpError(403, 'پشتیبان‌گیری و بازگردانی فقط برای مالک مجاز است'));
  if (val<number>('SELECT COUNT(*) FROM orgs') > 1) return next(new HttpError(403, 'در نصب چندسازمانی پشتیبان‌گیری از این بخش غیرفعال است'));
  next();
};

adminRouter.get('/backups', ownerOnly, h(() => ({ backups: listBackups(), schedule: readSchedule(), dbFile: path.basename(DB_PATH) })));

adminRouter.post('/backups', ownerOnly, h((req) => {
  const file = createBackup('manual');
  logActivity(req.user, 'backup', path.basename(file), 'create', 'پشتیبان دستی از دیتابیس');
  return { name: path.basename(file) };
}));

adminRouter.put('/backups/schedule', ownerOnly, h((req) => {
  const b = req.body ?? {};
  const everyDays = Math.round(Number(b.everyDays));
  const keep = Math.round(Number(b.keep));
  if (!(everyDays >= 1 && everyDays <= 365)) throw new HttpError(400, 'فاصله پشتیبان‌گیری باید بین ۱ تا ۳۶۵ روز باشد');
  if (!(keep >= 1 && keep <= 365)) throw new HttpError(400, 'تعداد نگهداری باید بین ۱ تا ۳۶۵ باشد');
  const next = { ...readSchedule(), enabled: !!b.enabled, everyDays, keep };
  writeSchedule(next);
  logActivity(req.user, 'backup', 'schedule', 'update', next.enabled ? `پشتیبان خودکار هر ${everyDays} روز` : 'پشتیبان خودکار خاموش شد');
  runScheduledBackup();
  return readSchedule();
}));

adminRouter.get('/backups/:name/download', ownerOnly, (req, res, next) => {
  try {
    const file = path.join(BACKUP_DIR, safeName(req.params.name));
    if (!fs.existsSync(file)) throw new HttpError(404, 'فایل پشتیبان پیدا نشد');
    res.download(file);
  } catch (err) { next(err); }
});

/** A fresh snapshot of the live database, streamed as a download. */
adminRouter.get('/backups-export', ownerOnly, (req, res, next) => {
  try {
    const file = createBackup('manual');
    logActivity(req.user, 'backup', path.basename(file), 'export', 'دریافت خروجی دیتابیس');
    res.download(file, `elecio-flow-${stamp()}.db`);
  } catch (err) { next(err); }
});

adminRouter.delete('/backups/:name', ownerOnly, h((req) => {
  const file = path.join(BACKUP_DIR, safeName(req.params.name));
  if (fs.existsSync(file)) fs.rmSync(file);
}));

/** Checks that a file is an Elecio Flow SQLite database before it may replace the live one. */
function validateDatabase(file: string) {
  const header = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  if (header.toString('latin1') !== 'SQLite format 3\0') throw new HttpError(400, 'این فایل یک دیتابیس SQLite معتبر نیست');
  const probe = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = new Set((probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
    for (const t of ['orgs', 'users', 'contacts', 'items', 'orders']) {
      if (!tables.has(t)) throw new HttpError(400, `این فایل دیتابیس الکیو فلو نیست (جدول ${t} وجود ندارد)`);
    }
    const ok = (probe.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    if (ok !== 'ok') throw new HttpError(400, 'فایل دیتابیس آسیب‌دیده است');
  } finally {
    probe.close();
  }
}

/** Swap the live database for `source` (after a safety backup); the next query reopens and migrates it. */
function replaceDatabase(source: string) {
  validateDatabase(source);
  const safety = createBackup('before-restore');
  closeDb();
  for (const suffix of ['-wal', '-shm']) { try { fs.rmSync(DB_PATH + suffix); } catch { /* none */ } }
  fs.copyFileSync(source, DB_PATH);
  clearSettingsCache();
  getDb();
  return path.basename(safety);
}

adminRouter.post('/backups/:name/restore', ownerOnly, h((req) => {
  const file = path.join(BACKUP_DIR, safeName(req.params.name));
  if (!fs.existsSync(file)) throw new HttpError(404, 'فایل پشتیبان پیدا نشد');
  const safety = replaceDatabase(file);
  return { restored: req.params.name, safety };
}));

adminRouter.post('/backups-import', ownerOnly, raw({ type: '*/*', limit: '500mb' }), h((req) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'فایلی دریافت نشد');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const upload = path.join(BACKUP_DIR, `elecio-imported-${stamp()}.db`);
  fs.writeFileSync(upload, req.body);
  try {
    const safety = replaceDatabase(upload);
    return { imported: path.basename(upload), safety };
  } catch (err) {
    try { fs.rmSync(upload); } catch { /* ignore */ }
    throw err;
  }
}));
