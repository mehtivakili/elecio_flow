import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Plus, Circle, CheckCircle2, Trash2, Timer, CalendarClock, UserRound, Send, Link2, Flame } from 'lucide-react';
import clsx from 'clsx';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '@shared/defaults';
import { del, post, put } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Avatar, Button, Card, Empty, Field, Input, Modal, PageHeader, Pill, SearchBox, Select, SelectDot, Spinner, Tabs, Textarea, useConfirm } from '../components/ui';
import { SelectButton, SelectionBar, useSelection } from '../components/selection';
import { DateInput } from '../components/inputs';
import { UserPicker } from '../components/domain';
import { dateTime, num, relative } from '../lib/format';
import { matchesSearch } from '@shared/search';

const REF_LINK: Record<string, string> = { contact: '/crm/contacts/', order: '/sales/orders/', po: '/scm/purchase-orders/', work_order: '/production/work-orders/', ticket: '/service/tickets/' };
const REF_LABEL: Record<string, string> = { contact: 'مشتری', order: 'سفارش فروش', po: 'سفارش خرید', work_order: 'دستور تولید', ticket: 'تیکت' };
const STATUS = [
  { key: 'todo', label: 'برای انجام', color: '#9DB4C0' },
  { key: 'doing', label: 'در حال انجام', color: '#779BE7' },
  { key: 'done', label: 'انجام‌شده', color: '#0FD69D' },
] as const;

type Scope = 'mine' | 'assigned' | 'all';

/** Due-date wording with urgency colour: overdue / today / soon / later. */
function dueInfo(t: any) {
  if (!t.dueAt) return null;
  if (t.status === 'done') return { text: relative(t.dueAt), cls: 'text-mist' };
  const now = Date.now();
  const end = new Date(); end.setHours(23, 59, 59, 999);
  if (t.dueAt < now) return { text: `عقب‌افتاده · ${relative(t.dueAt)}`, cls: 'text-rose font-semibold' };
  if (t.dueAt <= end.getTime()) return { text: `امروز · ${relative(t.dueAt)}`, cls: 'text-amber font-semibold' };
  return { text: relative(t.dueAt), cls: 'text-frost' };
}

export default function TasksPage() {
  const { me } = useSession();
  const { data = [], isLoading } = useApi<any[]>('/tasks');
  const [scope, setScope] = useState<Scope>('mine');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<any | null>(null);
  const toggle = useAction((t: any) => put(`/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' }));
  const start = useAction((t: any) => put(`/tasks/${t.id}`, { status: 'doing' }));
  const list = useMemo(() => data
    .filter((t) => scope === 'all' || (scope === 'mine' ? t.assigneeId === me.id : t.createdBy === me.id && t.assigneeId !== me.id))
    .filter((t) => matchesSearch(`${t.title} ${t.description ?? ''} ${t.assigneeName ?? ''} ${t.refLabel ?? ''}`, search)), [data, scope, me.id, search]);
  const sel = useSelection(list.map((t) => t.id));
  const mineOpen = data.filter((t) => t.assigneeId === me.id && t.status !== 'done').length;
  const sentOpen = data.filter((t) => t.createdBy === me.id && t.assigneeId !== me.id && t.status !== 'done').length;

  return (
    <div>
      <PageHeader icon={ListChecks} title="کارها" subtitle="کار برای خودتان یا همکار — با موعد، اولویت و اتصال به مشتری، سفارش یا تیکت"
        aside={<SelectButton sel={sel} />}
        fab={sel.active ? undefined : { label: 'کار جدید', icon: Plus, onClick: () => setOpen({}) }} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs className="w-full md:w-auto" value={scope} onChange={setScope} tabs={[
          { key: 'mine', label: 'کارهای من', count: mineOpen },
          { key: 'assigned', label: 'واگذار کرده‌ام', count: sentOpen },
          { key: 'all', label: 'همه تیم' },
        ]} />
        <SearchBox value={search} onChange={setSearch} placeholder="جستجو در کارها…" className="min-w-0 flex-1 md:min-w-[220px]" />
      </div>
      {isLoading ? <Spinner /> : list.length === 0 ? (
        <Card><Empty icon={ListChecks} title="کاری نیست" hint="کار جدید بسازید و در صورت نیاز به همکارتان واگذار کنید." /></Card>
      ) : (
        <div className="grid gap-4 md:gap-5 lg:grid-cols-3">
          {STATUS.map((c) => {
            const items = list.filter((t) => t.status === c.key);
            return (
              <Card key={c.key} title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.label}<span className="num text-xs font-normal text-mist">{num(items.length)}</span></span>} pad={false} bodyClass="space-y-2 p-2.5 md:p-3">
                {items.map((t) => {
                  const due = dueInfo(t);
                  const urgent = t.priority === 'urgent' || t.priority === 'high';
                  const fromOther = t.createdBy && t.createdBy !== t.assigneeId;
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => (sel.active ? sel.toggle(t.id) : setOpen(t))}
                      onKeyDown={(e) => { if (e.key === 'Enter') setOpen(t); }}
                      className={clsx(
                        'group flex cursor-pointer items-start gap-3 rounded-xl border bg-deep/60 p-3 transition hover:border-iris/30',
                        urgent && t.status !== 'done' ? 'border-rose/25' : 'border-transparent',
                        sel.has(t.id) && 'list-card-selected',
                      )}
                      style={urgent && t.status !== 'done' ? { boxShadow: `inset -3px 0 0 ${PRIORITY_COLORS[t.priority as 'high']}` } : undefined}
                    >
                      {sel.active ? <SelectDot checked={sel.has(t.id)} /> : (
                        <button onClick={(e) => { e.stopPropagation(); toggle.mutate(t); }} className="-m-1.5 p-1.5 text-mist hover:text-mint" aria-label="انجام شد / برنگشت">
                          {t.status === 'done' ? <CheckCircle2 size={19} className="text-mint" /> : <Circle size={19} />}
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className={clsx('text-[14px] font-semibold leading-6', t.status === 'done' ? 'text-mist line-through' : 'text-ink')}>{t.title}</div>
                          {urgent && t.status !== 'done' && <Pill color={PRIORITY_COLORS[t.priority as 'high']} className="shrink-0">{t.priority === 'urgent' && <Flame size={11} />}{PRIORITY_LABELS[t.priority as 'high']}</Pill>}
                        </div>
                        {t.description && <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-mist">{t.description}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                          {due && <span className={clsx('flex items-center gap-1', due.cls)}><CalendarClock size={12} />{due.text}</span>}
                          {(scope !== 'mine' || t.assigneeId !== me.id) && <span className="flex items-center gap-1 text-frost"><UserRound size={12} />{t.assigneeId === me.id ? 'من' : t.assigneeName ?? '—'}</span>}
                          {fromOther && t.assigneeId === me.id && <span className="flex items-center gap-1 text-lilac"><Send size={12} />از {t.createdByName}</span>}
                          {t.refType && t.refLabel && <span className="flex min-w-0 items-center gap-1 text-iris"><Link2 size={12} /><span className="truncate">{t.refLabel}</span></span>}
                        </div>
                      </div>
                      {!sel.active && t.status === 'todo' && (
                        <Button size="sm" variant="ghost" icon={Timer} title="شروع کار" aria-label="شروع کار" className="md:opacity-0 md:group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); start.mutate(t); }} />
                      )}
                    </div>
                  );
                })}
                {!items.length && <p className="py-6 text-center text-xs text-mist">—</p>}
              </Card>
            );
          })}
        </div>
      )}
      <TaskModal task={open} onClose={() => setOpen(null)} />
      <SelectionBar sel={sel} path="/tasks/bulk-delete" noun="کار" />
    </div>
  );
}

/** Create, view and edit a task — details, assignee, due date, priority, status and linked record. */
function TaskModal({ task, onClose }: { task: any | null; onClose: () => void }) {
  const { me } = useSession();
  const confirm = useConfirm();
  const isNew = !task?.id;
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (task) setF({ title: '', description: '', assigneeId: me.id, dueAt: null, priority: 'normal', status: 'todo', ...task });
  }, [task, me.id]);
  const body = { title: f.title, description: f.description, assigneeId: f.assigneeId, dueAt: f.dueAt, priority: f.priority, status: f.status };
  const save = useAction(() => (isNew ? post('/tasks', body) : put(`/tasks/${task.id}`, body)), { success: isNew ? 'کار ثبت شد' : 'کار به‌روز شد', onSuccess: onClose });
  const remove = useAction(() => del(`/tasks/${task.id}`), { success: 'کار حذف شد', onSuccess: onClose });
  const set = (patch: any) => setF((x: any) => ({ ...x, ...patch }));

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={isNew ? 'کار جدید' : 'جزئیات کار'}
      subtitle={!isNew ? `ثبت ${dateTime(task.createdAt)}${task.createdByName ? ` توسط ${task.createdByName}` : ''}` : undefined}
      icon={ListChecks}
      footer={<>
        {!isNew && <Button variant="danger" icon={Trash2} onClick={async () => (await confirm({ title: 'حذف کار', danger: true, confirm: 'حذف' })) && remove.mutate(undefined)}>حذف</Button>}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>بستن</Button>
        <Button variant="primary" disabled={!f.title?.trim()} loading={save.isPending} onClick={() => save.mutate(undefined)}>{isNew ? 'ثبت' : 'ذخیره تغییرات'}</Button>
      </>}
    >
      <div className="space-y-4">
        <Field label="عنوان"><Input autoFocus={isNew} value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="توضیحات و جزئیات"><Textarea className="min-h-[120px]" value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="شرح کار، نکات و هر چیزی که انجام‌دهنده باید بداند…" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="واگذار به" hint={f.assigneeId && f.assigneeId !== me.id ? 'این کار در «کارهای من» همکار نمایش داده می‌شود' : undefined}>
            <UserPicker value={f.assigneeId} onChange={(v) => set({ assigneeId: v ?? me.id })} />
          </Field>
          <Field label="موعد انجام"><DateInput value={f.dueAt} onChange={(v) => set({ dueAt: v })} /></Field>
        </div>
        <Field label="اولویت">
          <div className="grid grid-cols-4 gap-1.5">
            {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
              <button key={p} type="button" onClick={() => set({ priority: p })}
                className={clsx('rounded-xl border py-2 text-[13px] transition', f.priority === p ? 'border-transparent font-bold text-night' : 'border-line text-mist')}
                style={f.priority === p ? { background: PRIORITY_COLORS[p] } : undefined}>
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </Field>
        {!isNew && (
          <Field label="وضعیت">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
        )}
        {!isNew && task.refType && REF_LINK[task.refType] && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.04] px-3 py-2.5 text-sm">
            <span className="text-mist">مرتبط با {REF_LABEL[task.refType]}</span>
            <Link to={REF_LINK[task.refType] + task.refId} onClick={onClose} className="truncate font-semibold text-iris">{task.refLabel ?? 'مشاهده'}</Link>
          </div>
        )}
        {!isNew && (
          <div className="flex items-center gap-2 text-xs text-mist">
            <Avatar name={task.assigneeName ?? '؟'} size={22} />
            <span>مسئول: <b className="text-frost">{task.assigneeName ?? '—'}</b>{task.createdByName && task.createdBy !== task.assigneeId ? <> · واگذار شده توسط <b className="text-frost">{task.createdByName}</b></> : null}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
