import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Factory, Plus, AlertTriangle, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { BoardJump, Button, Card, Field, Input, Modal, PageHeader, Progress, Select, Spinner, Tabs, Textarea } from '../../components/ui';
import { DateInput } from '../../components/inputs';
import { ItemPicker, PriorityPill, UserPicker, WoStagePill } from '../../components/domain';
import { date, num, relative } from '../../lib/format';

export default function WorkOrdersPage() {
  const { settings } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data = [], isLoading } = useApi<any[]>('/work-orders');
  const [tab, setTab] = useState<'board' | 'done'>('board');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (params.get('new') === '1') { setCreating(true); params.delete('new'); setParams(params, { replace: true }); } }, [params, setParams]);
  const open = data.filter((w) => w.status === 'open');
  const stages = settings.workOrderStages.filter((s) => !s.final);

  return (
    <div>
      <PageHeader icon={Factory} title="دستورهای تولید" subtitle="کیتینگ ← مونتاژ ← فریمور ← تست و QC ← بسته‌بندی ← ورود به انبار، با شماره‌سریال برای هر دستگاه"
        actions={<>
          <Tabs value={tab} onChange={setTab} tabs={[{ key: 'board', label: 'خط تولید', count: open.length }, { key: 'done', label: 'تکمیل‌شده' }]} />
        </>}
        fab={{ label: 'دستور تولید', icon: Plus, onClick: () => setCreating(true) }} />
      {isLoading ? <Spinner /> : tab === 'board' ? (<>
        <BoardJump stages={stages.map((s) => ({ key: s.key, label: s.label, color: s.color, count: open.filter((w) => w.stage === s.key).length }))} />
        <div className="board flex gap-4 overflow-x-auto pb-3">
          {stages.map((s) => {
            const col = open.filter((w) => w.stage === s.key);
            return (
              <div key={s.key} data-col={s.key} className="glass w-[250px] shrink-0">
                <div className="flex items-center justify-between border-b border-line/60 px-4 py-3" style={{ boxShadow: `inset 0 3px 0 ${s.color}` }}>
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="num text-xs text-mist">{num(col.reduce((a, w) => a + w.qty, 0))} دستگاه</span>
                </div>
                <div className="flex min-h-[160px] flex-col gap-2 p-3">
                  {col.map((w) => (
                    <Link key={w.id} to={`/production/work-orders/${w.id}`} className={clsx('rounded-xl border bg-deep/70 p-3 transition hover:border-iris/40', w.late ? 'border-rose/40' : 'border-white/[0.06]')}>
                      <div className="flex items-center justify-between"><span className="ltr text-xs font-semibold">{w.number}</span><PriorityPill priority={w.priority} /></div>
                      <div className="mt-1 text-sm text-ink">{num(w.qty)} × {w.itemName}</div>
                      {w.orderNumber && <div className="mt-1 flex items-center gap-1 text-[11px] text-lilac"><ShoppingCart size={11} />{w.contactName}</div>}
                      {s.key === 'testing' && <div className="mt-2"><Progress value={(w.qcPassed / w.qty) * 100} color="#0FD69D" /><div className="num mt-1 text-[10px] text-mist">QC: {num(w.qcPassed)} از {num(w.qty)}</div></div>}
                      <div className="mt-2 flex items-center justify-between text-[11px] text-mist">
                        <span>{w.assigneeName ?? '—'}</span>
                        <span className={clsx('flex items-center gap-1', w.late && 'text-rose')}>{w.late && <AlertTriangle size={11} />}{relative(w.stageEnteredAt)}</span>
                      </div>
                    </Link>
                  ))}
                  {!col.length && <div className="py-8 text-center text-xs text-mist">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </>) : (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>شماره</th><th>محصول</th><th>تعداد</th><th>وضعیت</th><th>سفارش</th><th>شروع</th><th>پایان</th></tr></thead>
            <tbody>{data.filter((w) => w.status !== 'open').map((w) => (
              <tr key={w.id} className="cursor-pointer" onClick={() => navigate(`/production/work-orders/${w.id}`)}>
                <td className="ltr text-right">{w.number}</td><td>{w.itemName}</td><td className="num">{num(w.qty)}</td>
                <td><WoStagePill stage={w.stage} status={w.status} /></td><td className="text-xs">{w.orderNumber ?? 'برای انبار'}</td>
                <td className="text-xs text-mist">{date(w.startedAt)}</td><td className="text-xs text-mist">{date(w.completedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      <NewWorkOrderModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/production/work-orders/${id}`)} />
    </div>
  );
}

function NewWorkOrderModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState<any>({ itemId: null, qty: 5, priority: 'normal', dueAt: Date.now() + 10 * 86_400_000, assigneeId: null, notes: '' });
  const save = useAction(() => post('/work-orders', f), { success: 'دستور تولید ایجاد شد', onSuccess: (r) => { onClose(); onSaved(r.id); } });
  return (
    <Modal open={open} onClose={onClose} title="دستور تولید جدید" subtitle="برای تأمین موجودی انبار — دستور تولید سفارش‌ها خودکار ساخته می‌شود" icon={Factory}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.itemId || f.qty < 1} loading={save.isPending} onClick={() => save.mutate(undefined)}>ایجاد</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="محصول" className="sm:col-span-2"><ItemPicker value={f.itemId} kinds={['product']} onChange={(v) => setF({ ...f, itemId: v })} /></Field>
        <Field label="تعداد"><Input type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} /></Field>
        <Field label="اولویت"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">کم</option><option value="normal">عادی</option><option value="high">بالا</option><option value="urgent">فوری</option></Select></Field>
        <Field label="موعد تکمیل"><DateInput value={f.dueAt} onChange={(v) => setF({ ...f, dueAt: v })} /></Field>
        <Field label="مسئول"><UserPicker value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} /></Field>
        <Field label="توضیحات" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
