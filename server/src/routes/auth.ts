import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { one, q, run, uid, insert } from '../db.ts';
import { HttpError, JWT_SECRET, getSettings, h, requireAuth, saveSettings, guard, logActivity } from '../core.ts';
import { ROLES, effectiveRoles, type Role } from '../../../shared/defaults.ts';
import { rescoreOrg } from '../services/crm.ts';
import { hashPassword, PASSWORD_MIN_LENGTH, passwordHashNeedsUpgrade, rehashVerifiedPassword, verifyPassword } from '../security.ts';

export const authRouter = Router();

authRouter.post('/login', h((req) => {
  const { username, password, workspace } = req.body ?? {};
  const users = q(
    `SELECT u.*, o.slug FROM users u JOIN orgs o ON o.id = u.org_id
     WHERE u.username = ? AND u.active = 1 ${workspace ? 'AND o.slug = ?' : ''}`,
    String(username ?? '').trim().toLowerCase(), ...(workspace ? [workspace] : []),
  );
  const plainPassword = String(password ?? '');
  const user = users.find((u) => verifyPassword(plainPassword, u.passwordHash));
  if (!user) throw new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است');
  if (passwordHashNeedsUpgrade(user.passwordHash)) {
    run('UPDATE users SET password_hash = ? WHERE id = ?', rehashVerifiedPassword(plainPassword), user.id);
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return { token };
}));

export const metaRouter = Router();
metaRouter.use(requireAuth);

/** Everything the client needs to render: who am I, my workspace, its settings and people. */
metaRouter.get('/meta', h((req) => {
  const org = one('SELECT id, name, slug, created_at FROM orgs WHERE id = ?', req.user.orgId);
  const withRoles = (u: any) => (u ? { ...u, roles: effectiveRoles(u.role, u.roles) } : u);
  const me = withRoles(one('SELECT id, username, full_name, role, roles_json, phone FROM users WHERE id = ?', req.user.id));
  const users = q('SELECT id, username, full_name, role, roles_json, phone, active FROM users WHERE org_id = ? ORDER BY created_at', req.user.orgId).map(withRoles);
  const tags = q('SELECT * FROM tags WHERE org_id = ? ORDER BY name', req.user.orgId);
  const warehouses = q('SELECT * FROM warehouses WHERE org_id = ? ORDER BY created_at', req.user.orgId);
  return { org, me, users, tags, warehouses, settings: getSettings(req.user.orgId) };
}));

metaRouter.put('/settings', guard('settings'), h((req) => {
  const allowed = [
    'company', 'lifecycleStages', 'leadSources', 'customerTypes', 'lostReasons', 'customFields', 'scoring',
    'orderStages', 'workOrderStages', 'productFlow', 'qcChecklist', 'ticketTypes', 'ticketSlaHours', 'expenseCategories', 'backup', 'invoice',
  ];
  const patch = Object.fromEntries(Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k)));
  const settings = saveSettings(req.user.orgId, patch);
  if ('scoring' in patch) rescoreOrg(req.user.orgId);
  logActivity(req.user, 'settings', req.user.orgId, 'update', `به‌روزرسانی تنظیمات: ${Object.keys(patch).join('، ')}`);
  return settings;
}));

/** Accepts either `roles: Role[]` (first one is the primary) or a single `role`. */
function readRoles(body: any): Role[] | null {
  const list: unknown[] = Array.isArray(body?.roles) ? body.roles : body?.role ? [body.role] : [];
  if (!list.length) return null;
  if (list.some((r) => !ROLES.includes(r as Role))) throw new HttpError(400, 'نقش نامعتبر است');
  return [...new Set(list as Role[])];
}

metaRouter.post('/users', guard('settings'), h((req) => {
  const { username, fullName, password, phone } = req.body ?? {};
  const roles = readRoles(req.body);
  if (!username || !fullName || !password) throw new HttpError(400, 'نام، نام کاربری و رمز الزامی است');
  if (String(password).length < PASSWORD_MIN_LENGTH) throw new HttpError(400, `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد`);
  if (!roles) throw new HttpError(400, 'حداقل یک نقش انتخاب کنید');
  if (roles.includes('owner') && !req.user.roles.includes('owner')) throw new HttpError(403, 'فقط مالک می‌تواند مالک تعریف کند');
  const [role, ...extraRoles] = roles;
  const id = uid('usr');
  try {
    insert('users', {
      id, orgId: req.user.orgId, username: String(username).trim().toLowerCase(), fullName,
      passwordHash: hashPassword(password), role, roles: extraRoles, phone: phone ?? '', active: 1, createdAt: Date.now(),
    }, ['id', 'org_id', 'username', 'full_name', 'password_hash', 'role', 'roles_json', 'phone', 'active', 'created_at']);
  } catch {
    throw new HttpError(409, 'این نام کاربری قبلاً ثبت شده است');
  }
  return { id };
}));

metaRouter.put('/users/:id', guard('settings'), h((req) => {
  const target = one('SELECT * FROM users WHERE id = ? AND org_id = ?', req.params.id, req.user.orgId);
  if (!target) throw new HttpError(404, 'کاربر پیدا نشد');
  const targetRoles = effectiveRoles(target.role, target.roles);
  if (targetRoles.includes('owner') && !req.user.roles.includes('owner')) throw new HttpError(403, 'تغییر مالک مجاز نیست');
  const { fullName, phone, active, password } = req.body ?? {};
  const roles = readRoles(req.body);
  if (roles?.includes('owner') && !req.user.roles.includes('owner')) throw new HttpError(403, 'فقط مالک می‌تواند مالک تعریف کند');
  const rolesChanged = !!roles && roles.join(',') !== targetRoles.join(',');
  if (target.id === req.user.id && (active === false || rolesChanged)) {
    throw new HttpError(409, 'نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید');
  }
  run(
    `UPDATE users SET full_name = COALESCE(?, full_name), role = COALESCE(?, role), roles_json = COALESCE(?, roles_json),
       phone = COALESCE(?, phone), active = COALESCE(?, active) WHERE id = ?`,
    fullName ?? null, roles ? roles[0] : null, roles ? JSON.stringify(roles.slice(1)) : null, phone ?? null,
    active === undefined ? null : active ? 1 : 0, target.id,
  );
  if (password) {
    if (String(password).length < PASSWORD_MIN_LENGTH) throw new HttpError(400, `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد`);
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), target.id);
  }
  return { ok: true };
}));
