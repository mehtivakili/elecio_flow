import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Plus, Circle, CheckCircle2, Trash2, Timer } from 'lucide-react';
import clsx from 'clsx';
import { del, post, put } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, SelectDot, Spinner, Tabs, Textarea } from '../components/ui';
import { SelectButton, SelectionBar, useSelection } from '../components/selection';
import { DateInput } from '../components/inputs';
import { PriorityPill, UserPicker } from '../components/domain';
import { relative } from '../lib/format';

const REF_LINK: Record<string, string> = { contact: '/crm/contacts/', order: '/sales/orders/', po: '/scm/purchase-orders/', work_order: '/production/work-orders/', ticket: '/service/tickets/' };

export default function TasksPage() {
  const { me } = useSession();
  const { data = [], isLoading } = useApi<any[]>('/tasks');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [adding, setAdding] = useState(false);
  const toggle = useAction((t: any) => put(`/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' }));
  const start = useAction((t: any) => put(`/tasks/${t.id}`, { status: 'doing' }));
  const remove = useAction((id: string) => del(`/tasks/${id}`), { success: 'کار حذف شد' });
  const list = useMemo(() => data.filter((t) => scope === 'all' || t.assigneeId === me.id), [data, scope, me.id]);
  const sel = useSelection(list.map((t) => t.id));
  const cols = [
    { key: 'todo', label: 'برای انجام' }, { key: 'doing', label: 'در حال انجام' }, { key: 'done', label: 'انجام‌شده' },
  ];

  return (
    <div>
      <PageHeader icon={ListChecks} title="کارها" subtitle="کارهای داخلی تیم — قابل اتصال به مشتری، سفارش، خرید یا تیکت"
        actions={<>
          <Tabs value={scope} onChange={setScope} tabs={[{ key: 'mine', label: 'کارهای من' }, { key: 'all', label: 'همه تیم' }]} />
        </>}
        aside={<SelectButton sel={sel} />}
        fab={sel.active ? undefined : { label: 'کار جدید', icon: Plus, onClick: () => setAdding(true) }} />
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={ListChecks} title="کاری ثبت نشده" /></Card> : (
        <div className="grid gap-5 lg:grid-cols-3">
          {cols.map((c) => (
            <Card key={c.key} title={c.label} pad={false} bodyClass="space-y-2 p-3">
              {list.filter((t) => t.status === c.key).map((t) => (
                <div
                  key={t.id}
                  role={sel.active ? 'checkbox' : undefined}
                  aria-checked={sel.active ? sel.has(t.id) : undefined}
                  onClick={sel.active ? () => sel.toggle(t.id) : undefined}
                  className={clsx('group flex items-start gap-3 rounded-xl border border-transparent bg-deep/60 p-3', sel.active && 'cursor-pointer [&_a]:pointer-events-none [&_button]:pointer-events-none', sel.has(t.id) && 'list-card-selected')}
                >
                  {sel.active && <SelectDot checked={sel.has(t.id)} />}
                  <button onClick={() => toggle.mutate(t)} className={clsx('-m-1.5 p-1.5 text-mist hover:text-mint', sel.active && 'hidden')} aria-label="تغییر وضعیت">
                    {t.status === 'done' ? <CheckCircle2 size={18} className="text-mint" /> : <Circle size={18} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={clsx('text-sm', t.status === 'done' ? 'text-mist line-through' : 'text-ink')}>{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-mist">
                      <PriorityPill priority={t.priority} />
                      {t.dueAt && <span className={clsx(t.status !== 'done' && t.dueAt < Date.now() && 'text-rose')}>{relative(t.dueAt)}</span>}
                      {scope === 'all' && <span>{t.assigneeName}</span>}
                      {t.refType && t.refId && REF_LINK[t.refType] && <Link to={REF_LINK[t.refType] + t.refId} className="text-iris">مشاهده مرجع</Link>}
                    </div>
                  </div>
                  <div className="flex transition md:opacity-0 md:group-hover:opacity-100">
                    {t.status === 'todo' && <Button size="sm" variant="ghost" icon={Timer} title="شروع" onClick={() => start.mutate(t)} />}
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove.mutate(t.id)} />
                  </div>
                </div>
              ))}
              {!list.some((t) => t.status === c.key) && <p className="py-6 text-center text-xs text-mist">—</p>}
            </Card>
          ))}
        </div>
      )}
      <TaskModal open={adding} onClose={() => setAdding(false)} />
      <SelectionBar sel={sel} path="/tasks/bulk-delete" noun="کار" />
    </div>
  );
}

function TaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useSession();
  const [f, setF] = useState<any>({ title: '', description: '', assigneeId: me.id, dueAt: null, priority: 'normal' });
  const save = useAction(() => post('/tasks', f), { success: 'کار ثبت شد', onSuccess: () => { onClose(); setF({ ...f, title: '', description: '' }); } });
  return (
    <Modal open={open} onClose={onClose} title="کار جدید" icon={ListChecks} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.title.trim()} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت</Button></>}>
      <div className="space-y-4">
        <Field label="عنوان"><Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="توضیحات"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="مسئول"><UserPicker value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} /></Field>
          <Field label="اولویت"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">کم</option><option value="normal">عادی</option><option value="high">بالا</option></Select></Field>
        </div>
        <Field label="موعد"><DateInput value={f.dueAt} onChange={(v) => setF({ ...f, dueAt: v })} /></Field>
      </div>
    </Modal>
  );
}
