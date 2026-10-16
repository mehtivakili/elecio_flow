import type { NextFunction, Request, Response, RequestHandler, Router } from 'express';
import jwt from 'jsonwebtoken';
import { one, run, tx, uid, getDb } from './db.ts';
import {
  ELECIO_DEFAULTS, canWrite, effectiveRoles, isAdminRole, type Module, type Role, type StageDef, type WorkspaceSettings,
} from '../../shared/defaults.ts';
import { toJalali } from '../../shared/jalali.ts';

export const JWT_SECRET = process.env.ELECIO_JWT_SECRET || 'elecio-flow-dev-secret-change-me';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export interface AuthUser {
  id: string;
  orgId: string;
  /** Primary role (shown in the UI). */
  role: Role;
  /** Every role the user holds — permissions are the union of these. */
  roles: Role[];
  fullName: string;
}

export const isAdmin = (user: Pick<AuthUser, 'roles'>) => isAdminRole(user.roles);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user: AuthUser }
  }
}

/** Wraps an async/sync handler so thrown errors reach the error middleware. */
export const h = (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  (req, res, next) => {
    try {
      const result = fn(req, res);
      if (result instanceof Promise) {
        result.then((value) => { if (!res.headersSent) res.json(value ?? { ok: true }); }).catch(next);
      } else if (!res.headersSent) {
        res.json(result ?? { ok: true });
      }
    } catch (err) {
      next(err);
    }
  };

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = one('SELECT id, org_id, role, roles_json, full_name, active FROM users WHERE id = ?', payload.sub);
    if (!user || !user.active) throw new Error('inactive');
    req.user = { id: user.id, orgId: user.orgId, role: user.role, roles: effectiveRoles(user.role, user.roles), fullName: user.fullName };
    next();
  } catch {
    next(new HttpError(401, 'نشست شما منقضی شده است، دوباره وارد شوید'));
  }
}

/** Reads are open to every signed-in role; writes need the module in the role's list. */
export const guard = (module: Module): RequestHandler => (req, _res, next) => {
  if (req.method === 'GET') return next();
  if (!canWrite(req.user.roles, module)) {
    return next(new HttpError(403, 'شما مجوز تغییر در این بخش را ندارید'));
  }
  next();
};

/**
 * Every router is mounted on /api, so a plain `router.use(guard(...))` would also run for
 * requests meant for the routers after it (a warehouse user adding an item was stopped by
 * the CRM guard). This guard only applies to the router's own routes.
 */
export function guardRouter(router: Router, module: Module) {
  router.use((req, res, next) => {
    if (req.method === 'GET') return next();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const own = (router.stack as any[]).some((layer) => layer.route && layer.route._handles_method(req.method) && layer.match(req.path));
    return own ? guard(module)(req, res, next) : next();
  });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    error: status === 500 ? 'خطای داخلی سرور' : err.message,
    details: err instanceof HttpError ? err.details : undefined,
  });
}

/* ───────────── Workspace settings ───────────── */

const settingsCache = new Map<string, WorkspaceSettings>();

/** After the database file is swapped (restore/import) cached settings belong to the old file. */
export function clearSettingsCache() { settingsCache.clear(); }

export function getSettings(orgId: string): WorkspaceSettings {
  const cached = settingsCache.get(orgId);
  if (cached) return cached;
  const row = one('SELECT settings_json FROM orgs WHERE id = ?', orgId);
  // Fill in any section a tenant has never customised from the defaults.
  const settings = { ...ELECIO_DEFAULTS, ...(row?.settings ?? {}) } as WorkspaceSettings;
  // Guard against text damaged by a non-UTF-8 client. A run of replacement
  // question marks is not valid Persian process content; fall back to the
  // complete preset so the editor can save a clean copy.
  if (!Array.isArray(settings.productFlow) || /\?{3,}/.test(JSON.stringify(settings.productFlow))) {
    settings.productFlow = structuredClone(ELECIO_DEFAULTS.productFlow);
  }
  settingsCache.set(orgId, settings);
  return settings;
}

export function saveSettings(orgId: string, patch: Partial<WorkspaceSettings>) {
  const next = { ...getSettings(orgId), ...patch };
  run('UPDATE orgs SET settings_json = ? WHERE id = ?', JSON.stringify(next), orgId);
  settingsCache.set(orgId, next);
  return next;
}

/** Order stages that apply to an order's fulfillment mode. */
export function orderStagesFor(orgId: string, fulfillment: string, needsInstallation = true): StageDef[] {
  return getSettings(orgId).orderStages.filter((s) =>
    (!s.onlyFor || s.onlyFor === fulfillment) && (needsInstallation || s.key !== 'installation'));
}

/* ───────────── Document numbering ───────────── */

/** e.g. SO-0507-0012 — prefix, Jalali yy+mm, per-prefix running sequence. */
export function nextNumber(orgId: string, prefix: string): string {
  const database = getDb();
  const row = one('SELECT counters_json FROM orgs WHERE id = ?', orgId);
  const counters = (row?.counters ?? {}) as Record<string, number>;
  const seq = (counters[prefix] ?? 0) + 1;
  counters[prefix] = seq;
  database.prepare('UPDATE orgs SET counters_json = ? WHERE id = ?').run(JSON.stringify(counters), orgId);
  const j = toJalali(Date.now());
  return `${prefix}-${String(j.jy).slice(2)}${String(j.jm).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
}

export function nextSerial(orgId: string, sku: string): string {
  const pattern = getSettings(orgId).company.serialPattern || '{SKU}-{YY}{MM}-{SEQ}';
  const key = `serial:${sku}`;
  const row = one('SELECT counters_json FROM orgs WHERE id = ?', orgId);
  const counters = (row?.counters ?? {}) as Record<string, number>;
  const seq = (counters[key] ?? 0) + 1;
  counters[key] = seq;
  run('UPDATE orgs SET counters_json = ? WHERE id = ?', JSON.stringify(counters), orgId);
  const j = toJalali(Date.now());
  return pattern
    .replace('{SKU}', sku.replace(/[^A-Za-z0-9-]/g, '').toUpperCase())
    .replace('{YY}', String(j.jy).slice(2))
    .replace('{MM}', String(j.jm).padStart(2, '0'))
    .replace('{SEQ}', String(seq).padStart(4, '0'));
}

/* ───────────── Activity feed ───────────── */

export function logActivity(
  user: Pick<AuthUser, 'id' | 'orgId'>,
  entityType: string,
  entityId: string,
  action: string,
  summary: string,
) {
  run(
    'INSERT INTO activity (id, org_id, user_id, entity_type, entity_id, action, summary, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    uid('act'), user.orgId, user.id, entityType, entityId, action, summary, Date.now(),
  );
}

export function mustFind(table: string, id: string, orgId: string, label = 'رکورد') {
  const row = one(`SELECT * FROM ${table} WHERE id = ? AND org_id = ?`, id, orgId);
  if (!row) throw new HttpError(404, `${label} پیدا نشد`);
  return row;
}

/** Owner / admin only (manual historical entries, backups, restoring archived records). */
export const adminOnly: RequestHandler = (req, _res, next) => {
  if (!isAdmin(req.user)) return next(new HttpError(403, 'این بخش فقط برای مدیر سیستم در دسترس است'));
  next();
};

export const DAY = 86_400_000;
export const HOUR = 3_600_000;

/* ───────────── Delete / archive ───────────── */

export interface BulkDeleteResult {
  deleted: number;
  /** Still referenced elsewhere, so hidden (archived) instead — history stays intact. */
  archived: { id: string; name: string; reason: string }[];
  /** Could not be removed at all (rare: a hard safety rule). */
  blocked: { id: string; name: string; reason: string }[];
}

/**
 * Deletes the selected records of one table in a single transaction.
 *
 * Rows nothing else points at are removed for good. Rows that other documents
 * still reference (`linkedReason` returns why) are *archived* instead: they get a
 * `deleted_at` stamp, disappear from every list, picker and report, but the orders,
 * stock moves, devices and tickets that mention them keep working and keep showing
 * the name. Archived rows can be restored from Settings → Archive. `beforeArchive`
 * lets a module tidy up first (e.g. cancel an open order so its stock is released).
 */
export function bulkDelete(
  user: AuthUser,
  rawIds: unknown,
  opts: {
    table: string;
    entity: string;
    noun: string;
    label: (row: any) => string;
    block?: (row: any) => string | null;
    linkedReason?: (row: any) => string | null;
    beforeArchive?: (row: any) => void;
    remove: (row: any) => void;
  },
): BulkDeleteResult {
  if (!Array.isArray(rawIds) || rawIds.length === 0) throw new HttpError(400, 'هیچ موردی انتخاب نشده است');
  if (rawIds.length > 500) throw new HttpError(400, 'در هر بار حداکثر ۵۰۰ مورد قابل حذف است');
  const ids = [...new Set(rawIds.map(String))];
  return tx(() => {
    const result: BulkDeleteResult = { deleted: 0, archived: [], blocked: [] };
    for (const id of ids) {
      const row = one(`SELECT * FROM ${opts.table} WHERE id = ? AND org_id = ?`, id, user.orgId);
      if (!row) continue;
      const name = opts.label(row);
      const blocked = opts.block?.(row) ?? null;
      if (blocked) { result.blocked.push({ id, name, reason: blocked }); continue; }
      const linked = opts.linkedReason?.(row) ?? null;
      if (linked) {
        if (!row.deletedAt) {
          opts.beforeArchive?.(row);
          run(`UPDATE ${opts.table} SET deleted_at = ? WHERE id = ?`, Date.now(), id);
          logActivity(user, opts.entity, id, 'archive', `حذف (بایگانی) ${opts.noun} ${name}`);
        }
        result.archived.push({ id, name, reason: linked });
        continue;
      }
      opts.remove(row);
      logActivity(user, opts.entity, id, 'delete', `حذف ${opts.noun} ${name}`);
      result.deleted++;
    }
    return result;
  });
}

/** Clears task links that pointed at a record which no longer exists. */
export function unlinkTasks(refType: string, refId: string) {
  run('UPDATE tasks SET ref_type = NULL, ref_id = NULL WHERE ref_type = ? AND ref_id = ?', refType, refId);
}
