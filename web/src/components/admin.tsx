import { useEffect, useRef, useState } from 'react';
import {
  DatabaseBackup, Download, Upload, History, Trash2, RotateCcw, Archive, ShieldAlert, Clock, HardDrive, Users, UserPlus, Pencil,
} from 'lucide-react';
import clsx from 'clsx';
import { ROLES, ROLE_LABELS, type Role } from '@shared/defaults';
import { ApiError, del, downloadFile, post, put, uploadFile } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Avatar, Button, Card, Empty, Field, Input, Modal, Pill, Select, Spinner, Toggle, useConfirm } from './ui';
import { dateTime, num, relative } from '../lib/format';

const kb = (n: number) => (n > 1048576 ? `${num(n / 1048576, 1)} مگابایت` : `${num(Math.round(n / 1024))} کیلوبایت`);

/* ═════════════════════════ Users with several roles ═════════════════════════ */

const roleOrder = (roles: Role[]) => ROLES.filter((r) => roles.includes(r));

export function UsersAdmin() {
  const { users, me, can, refresh } = useSession();
  const [editing, setEditing] = useState<any | null>(null);
  const editable = can('settings');
  return (
    <Card title="کاربران" subtitle="هر کاربر می‌تواند چند نقش داشته باشد — دسترسی او مجموع دسترسی نقش‌هایش است" icon={Users}
      actions={editable && <Button size="sm" variant="action" icon={UserPlus} onClick={() => setEditing({})}>کاربر جدید</Button>} pad={false} bodyClass="p-2.5 md:p-3">
      <ul className="space-y-2">
        {users.map((u) => {
          const roles = roleOrder(u.roles ?? [u.role]);
          const locked = !editable || u.id === me.id || (roles.includes('owner') && !me.roles.includes('owner'));
          return (
            <li key={u.id} className={clsx('flex items-center gap-3 rounded-2xl bg-deep/50 p-3', u.active === 0 && 'opacity-50')}>
              <Avatar name={u.fullName} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{u.fullName}</span>
                  {u.id === me.id && <span className="text-xs text-iris">(شما)</span>}
                  {u.active === 0 && <span className="text-xs text-rose">غیرفعال</span>}
                </div>
                <div className="ltr text-right text-xs text-mist">{u.username}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">{roles.map((r) => <Pill key={r} color={r === 'owner' || r === 'admin' ? '#F5B85A' : '#779BE7'}>{ROLE_LABELS[r]}</Pill>)}</div>
              </div>
              {!locked && <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(u)}><span className="hidden sm:inline">ویرایش</span></Button>}
            </li>
          );
        })}
      </ul>
      <UserModal user={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </Card>
  );
}

function UserModal({ user, onClose, onSaved }: { user: any | null; onClose: () => void; onSaved: () => void }) {
  const { me } = useSession();
  const isNew = !user?.id;
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (user) setF(isNew ? { username: '', fullName: '', password: '', phone: '', roles: ['sales'], active: true } : { fullName: user.fullName, phone: user.phone ?? '', roles: user.roles ?? [user.role], active: user.active !== 0, password: '' });
  }, [user, isNew]);
  const roles: Role[] = f.roles ?? [];
  const toggleRole = (r: Role) => setF((x: any) => ({ ...x, roles: roles.includes(r) ? roles.filter((y) => y !== r) : roleOrder([...roles, r]) }));
  const body = { ...f, roles: roleOrder(roles), ...(f.password ? {} : { password: undefined }) };
  const save = useAction(() => (isNew ? post('/users', body) : put(`/users/${user.id}`, body)), { success: isNew ? 'کاربر ایجاد شد' : 'کاربر به‌روز شد', onSuccess: () => { onSaved(); onClose(); } });
  const assignable = ROLES.filter((r) => r !== 'owner' || me.roles.includes('owner'));
  return (
    <Modal open={!!user} onClose={onClose} icon={isNew ? UserPlus : Users} size="sm" title={isNew ? 'کاربر جدید' : `ویرایش ${user?.fullName}`}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" loading={save.isPending} disabled={!roles.length || !f.fullName?.trim() || (isNew && (!f.username || (f.password ?? '').length < 12))} onClick={() => save.mutate(undefined)}>{isNew ? 'ایجاد' : 'ذخیره'}</Button></>}>
      <div className="space-y-4">
        <Field label="نام کامل"><Input value={f.fullName ?? ''} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        {isNew && <Field label="نام کاربری"><Input className="ltr" value={f.username ?? ''} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>}
        <Field label={isNew ? 'رمز عبور' : 'رمز عبور جدید (اختیاری)'} hint="حداقل ۱۲ کاراکتر"><Input className="ltr" type="password" autoComplete="new-password" value={f.password ?? ''} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="نقش‌ها" hint="چند نقش قابل انتخاب است؛ نقش بالاتر در فهرست، نقش اصلی نمایش داده می‌شود">
          <div className="grid grid-cols-2 gap-1.5">
            {assignable.map((r) => (
              <button key={r} type="button" onClick={() => toggleRole(r)}
                className={clsx('rounded-xl border px-3 py-2.5 text-right text-sm transition', roles.includes(r) ? 'border-iris bg-iris/15 font-bold text-ink' : 'border-line text-mist')}>
                {roles.includes(r) ? '✓ ' : ''}{ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="تلفن"><Input className="ltr" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        {!isNew && <Toggle checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} label={f.active ? 'حساب فعال است' : 'حساب غیرفعال است'} />}
      </div>
    </Modal>
  );
}

/* ═════════════════════════ Archive ═════════════════════════ */

export function ArchiveAdmin() {
  const { isAdmin } = useSession();
  const { data = [], isLoading } = useApi<any[]>(isAdmin ? '/archive' : null);
  const restore = useAction(({ type, id }: { type: string; id: string }) => post('/archive/restore', { type, ids: [id] }), { success: 'به فهرست‌ها بازگشت' });
  if (!isAdmin) return <Card><Empty icon={Archive} title="فقط مدیر سیستم به بایگانی دسترسی دارد" /></Card>;
  return (
    <Card title="بایگانی (موارد حذف‌شده با سابقه)" subtitle="مواردی که حذف شدند ولی چون به سفارش، دستگاه یا گردش انبار وصل بودند، سوابقشان حفظ شد" icon={Archive} pad={false} bodyClass="p-2.5 md:p-3">
      {isLoading ? <Spinner /> : !data.length ? <Empty icon={Archive} title="بایگانی خالی است" /> : (
        <ul className="space-y-1.5">
          {data.map((r) => (
            <li key={`${r.type}-${r.id}`} className="flex items-center gap-3 rounded-xl bg-deep/50 px-3 py-2.5">
              <Pill color="#9DB4C0">{r.typeLabel}</Pill>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{r.title}</div>
                <div className="truncate text-[11.5px] text-mist">{r.subtitle || '—'} · حذف {relative(r.deletedAt)}</div>
              </div>
              <Button size="sm" variant="outline" icon={RotateCcw} loading={restore.isPending} onClick={() => restore.mutate({ type: r.type, id: r.id })}><span className="hidden sm:inline">بازگرداندن</span></Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ═════════════════════════ Backups ═════════════════════════ */

const PRESETS = [1, 3, 5, 7, 14, 30];

export function BackupAdmin() {
  const { isOwner } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any>(isOwner ? '/backups' : null);
  const [schedule, setSchedule] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (data?.schedule) setSchedule(data.schedule); }, [data]);

  const create = useAction(() => post('/backups'), { success: 'پشتیبان گرفته شد' });
  const saveSchedule = useAction(() => put('/backups/schedule', schedule), { success: 'زمان‌بندی پشتیبان ذخیره شد' });
  const remove = useAction((name: string) => del(`/backups/${encodeURIComponent(name)}`), { success: 'فایل پشتیبان حذف شد' });
  const restore = useAction((name: string) => post(`/backups/${encodeURIComponent(name)}/restore`), {
    success: 'دیتابیس بازگردانی شد — صفحه دوباره بارگذاری می‌شود',
    onSuccess: () => setTimeout(() => window.location.reload(), 1200),
  });

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast(e instanceof ApiError ? e.message : 'خطا', 'error'); } finally { setBusy(null); }
  };

  if (!isOwner) return <Card><Empty icon={ShieldAlert} title="پشتیبان‌گیری فقط برای مالک سیستم در دسترس است" /></Card>;
  if (isLoading || !schedule) return <Spinner />;

  const onImport = async (file: File) => {
    const ok = await confirm({
      title: 'جایگزینی کل دیتابیس',
      danger: true,
      confirm: 'جایگزین کن',
      body: <>دیتابیس فعلی با «{file.name}» ({kb(file.size)}) جایگزین می‌شود. قبل از آن یک نسخه ایمنی از دیتابیس فعلی گرفته می‌شود. اگر فایل قدیمی‌تر باشد، خودکار به نسخه جدید ارتقا داده می‌شود.</>,
    });
    if (!ok) return;
    await run('import', async () => {
      await uploadFile('/backups-import', file);
      toast('دیتابیس وارد شد — صفحه دوباره بارگذاری می‌شود', 'success');
      setTimeout(() => window.location.reload(), 1200);
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <Card title="خروجی و ورود دیتابیس" subtitle={`دیتابیس فعال: ${data.dbFile}`} icon={HardDrive}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={!!busy} onClick={() => run('export', () => downloadFile('/backups-export', 'elecio-flow.db'))}
            className="flex items-center gap-3 rounded-2xl border border-mint/30 bg-mint/[0.08] p-4 text-right transition hover:bg-mint/15 disabled:opacity-50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint/20 text-mint"><Download size={20} /></span>
            <span><b className="block text-ink">دانلود کامل دیتابیس</b><span className="text-xs text-mist">{busy === 'export' ? 'در حال آماده‌سازی…' : 'یک فایل .db از وضعیت همین لحظه'}</span></span>
          </button>
          <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}
            className="flex items-center gap-3 rounded-2xl border border-amber/30 bg-amber/[0.08] p-4 text-right transition hover:bg-amber/15 disabled:opacity-50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber/20 text-amber"><Upload size={20} /></span>
            <span><b className="block text-ink">ورود فایل دیتابیس</b><span className="text-xs text-mist">{busy === 'import' ? 'در حال ارسال و بررسی…' : 'جایگزینی با یک فایل .db (با نسخه ایمنی)'}</span></span>
          </button>
          <input ref={fileRef} type="file" accept=".db,.sqlite,.sqlite3,application/octet-stream" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
        </div>
      </Card>

      <Card title="پشتیبان‌گیری خودکار" subtitle={schedule.lastAt ? `آخرین پشتیبان خودکار: ${dateTime(schedule.lastAt)}` : 'هنوز پشتیبان خودکاری گرفته نشده'} icon={Clock}>
        <div className="space-y-4">
          <Toggle checked={!!schedule.enabled} onChange={(v) => setSchedule({ ...schedule, enabled: v })} label={schedule.enabled ? 'روشن' : 'خاموش'} />
          <Field label="هر چند روز یک بار؟">
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((d) => (
                <button key={d} type="button" onClick={() => setSchedule({ ...schedule, everyDays: d })}
                  className={clsx('rounded-xl border px-3 py-2 text-sm transition', schedule.everyDays === d ? 'border-iris bg-iris/15 font-bold text-ink' : 'border-line text-mist')}>
                  {d === 1 ? 'هر روز' : d === 7 ? 'هر هفته' : d === 30 ? 'هر ماه' : `هر ${num(d)} روز`}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <Input type="number" min={1} max={365} className="w-24" value={schedule.everyDays} onChange={(e) => setSchedule({ ...schedule, everyDays: Number(e.target.value) })} />
                <span className="text-xs text-mist">روز (دلخواه)</span>
              </div>
            </div>
          </Field>
          <Field label="چند نسخه خودکار نگه داشته شود؟" hint="نسخه‌های قدیمی‌تر خودکار حذف می‌شوند؛ پشتیبان‌های دستی و ایمنی هرگز حذف نمی‌شوند">
            <Select className="w-48" value={schedule.keep} onChange={(e) => setSchedule({ ...schedule, keep: Number(e.target.value) })}>
              {[3, 7, 14, 30, 60, 90].map((k) => <option key={k} value={k}>{num(k)} نسخه</option>)}
            </Select>
          </Field>
          <div className="flex justify-end"><Button variant="primary" loading={saveSchedule.isPending} onClick={() => saveSchedule.mutate(undefined)}>ذخیره زمان‌بندی</Button></div>
        </div>
      </Card>

      <Card title="فایل‌های پشتیبان" subtitle="در پوشه backups کنار فایل دیتابیس" icon={DatabaseBackup}
        actions={<Button size="sm" variant="action" icon={DatabaseBackup} loading={create.isPending} onClick={() => create.mutate(undefined)}>پشتیبان‌گیری الان</Button>}
        pad={false} bodyClass="p-2.5 md:p-3">
        {!data.backups.length ? <Empty icon={DatabaseBackup} title="هنوز پشتیبانی وجود ندارد" /> : (
          <ul className="space-y-1.5">
            {data.backups.map((b: any) => (
              <li key={b.name} className="flex flex-wrap items-center gap-2 rounded-xl bg-deep/50 px-3 py-2.5">
                <History size={16} className="shrink-0 text-iris" />
                <div className="min-w-0 flex-1">
                  <div className="ltr truncate text-right font-mono text-xs text-ink">{b.name}</div>
                  <div className="text-[11.5px] text-mist">{dateTime(b.at)} · {kb(b.size)} · {b.kind === 'auto' ? 'خودکار' : b.kind === 'safety' ? 'نسخه ایمنی' : 'دستی'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={Download} aria-label="دانلود" title="دانلود" onClick={() => run(`dl-${b.name}`, () => downloadFile(`/backups/${encodeURIComponent(b.name)}/download`, b.name))} />
                  <Button size="sm" variant="ghost" icon={RotateCcw} aria-label="بازگردانی" title="بازگردانی این نسخه" onClick={async () => {
                    if (await confirm({ title: 'بازگردانی دیتابیس', danger: true, confirm: 'بازگردانی', body: <>دیتابیس به وضعیت «{b.name}» برمی‌گردد. قبل از آن یک نسخه ایمنی از وضعیت فعلی گرفته می‌شود.</> })) restore.mutate(b.name);
                  }} />
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label="حذف" title="حذف فایل" onClick={async () => (await confirm({ title: 'حذف فایل پشتیبان', danger: true, confirm: 'حذف', body: b.name })) && remove.mutate(b.name)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
