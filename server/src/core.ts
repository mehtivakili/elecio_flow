import type { NextFunction, Request, Response, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { one, run, uid, getDb } from './db.ts';
import {
  ELECIO_DEFAULTS, canWrite, type Module, type Role, type StageDef, type WorkspaceSettings,
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
  role: Role;
  fullName: string;
}

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
    const user = one('SELECT id, org_id, role, full_name, active FROM users WHERE id = ?', payload.sub);
    if (!user || !user.active) throw new Error('inactive');
    req.user = { id: user.id, orgId: user.orgId, role: user.role, fullName: user.fullName };
    next();
  } catch {
    next(new HttpError(401, 'نشست شما منقضی شده است، دوباره وارد شوید'));
  }
}

/** Reads are open to every signed-in role; writes need the module in the role's list. */
export const guard = (module: Module): RequestHandler => (req, _res, next) => {
  if (req.method === 'GET') return next();
  if (!canWrite(req.user.role, module)) {
    return next(new HttpError(403, 'شما مجوز تغییر در این بخش را ندارید'));
  }
  next();
};

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

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
