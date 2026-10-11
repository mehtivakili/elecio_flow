import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { one, q, run, uid, insert } from '../db.ts';
import { HttpError, JWT_SECRET, getSettings, h, requireAuth, saveSettings, guard, logActivity } from '../core.ts';
import { ROLES } from '../../../shared/defaults.ts';
import { rescoreOrg } from '../services/crm.ts';

export const authRouter = Router();

authRouter.post('/login', h((req) => {
  const { username, password, workspace } = req.body ?? {};
  const users = q(
    `SELECT u.*, o.slug FROM users u JOIN orgs o ON o.id = u.org_id
     WHERE u.username = ? AND u.active = 1 ${workspace ? 'AND o.slug = ?' : ''}`,
    String(username ?? '').trim().toLowerCase(), ...(workspace ? [workspace] : []),
  );
  const user = users.find((u) => bcrypt.compareSync(String(password ?? ''), u.passwordHash));
  if (!user) throw new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است');
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return { token };
}));

export const metaRouter = Router();
metaRouter.use(requireAuth);

/** Everything the client needs to render: who am I, my workspace, its settings and people. */
metaRouter.get('/meta', h((req) => {
  const org = one('SELECT id, name, slug, created_at FROM orgs WHERE id = ?', req.user.orgId);
  const me = one('SELECT id, username, full_name, role, phone FROM users WHERE id = ?', req.user.id);
  const users = q('SELECT id, username, full_name, role, phone, active FROM users WHERE org_id = ? ORDER BY created_at', req.user.orgId);
  const tags = q('SELECT * FROM tags WHERE org_id = ? ORDER BY name', req.user.orgId);
  const warehouses = q('SELECT * FROM warehouses WHERE org_id = ? ORDER BY created_at', req.user.orgId);
  return { org, me, users, tags, warehouses, settings: getSettings(req.user.orgId) };
}));

metaRouter.put('/settings', guard('settings'), h((req) => {
  const allowed = [
    'company', 'lifecycleStages', 'leadSources', 'customerTypes', 'lostReasons', 'customFields', 'scoring',
    'orderStages', 'workOrderStages', 'qcChecklist', 'ticketTypes', 'ticketSlaHours', 'expenseCategories',
  ];
  const patch = Object.fromEntries(Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k)));
  const settings = saveSettings(req.user.orgId, patch);
  if ('scoring' in patch) rescoreOrg(req.user.orgId);
  logActivity(req.user, 'settings', req.user.orgId, 'update', `به‌روزرسانی تنظیمات: ${Object.keys(patch).join('، ')}`);
  return settings;
}));

metaRouter.post('/users', guard('settings'), h((req) => {
  const { username, fullName, password, role, phone } = req.body ?? {};
  if (!username || !fullName || !password) throw new HttpError(400, 'نام، نام کاربری و رمز الزامی است');
  if (!ROLES.includes(role)) throw new HttpError(400, 'نقش نامعتبر است');
  if (role === 'owner' && req.user.role !== 'owner') throw new HttpError(403, 'فقط مالک می‌تواند مالک تعریف کند');
  const id = uid('usr');
  try {
    insert('users', {
      id, orgId: req.user.orgId, username: String(username).trim().toLowerCase(), fullName,
      passwordHash: bcrypt.hashSync(password, 10), role, phone: phone ?? '', active: 1, createdAt: Date.now(),
    }, ['id', 'org_id', 'username', 'full_name', 'password_hash', 'role', 'phone', 'active', 'created_at']);
  } catch {
    throw new HttpError(409, 'این نام کاربری قبلاً ثبت شده است');
  }
  return { id };
}));

metaRouter.put('/users/:id', guard('settings'), h((req) => {
  const target = one('SELECT * FROM users WHERE id = ? AND org_id = ?', req.params.id, req.user.orgId);
  if (!target) throw new HttpError(404, 'کاربر پیدا نشد');
  if (target.role === 'owner' && req.user.role !== 'owner') throw new HttpError(403, 'تغییر مالک مجاز نیست');
  const { fullName, role, phone, active, password } = req.body ?? {};
  if (role && !ROLES.includes(role)) throw new HttpError(400, 'نقش نامعتبر است');
  if (target.id === req.user.id && (active === false || (role && role !== target.role))) {
    throw new HttpError(409, 'نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید');
  }
  run(
    `UPDATE users SET full_name = COALESCE(?, full_name), role = COALESCE(?, role), phone = COALESCE(?, phone),
       active = COALESCE(?, active) WHERE id = ?`,
    fullName ?? null, role ?? null, phone ?? null, active === undefined ? null : active ? 1 : 0, target.id,
  );
  if (password) run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(password, 10), target.id);
  return { ok: true };
}));
