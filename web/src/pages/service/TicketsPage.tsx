import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LifeBuoy, Plus, AlertOctagon, ShieldCheck, Star } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, Field, Filters, Input, ListCard, Modal, PageHeader, SearchBox, Select, Spinner, Stat, Tabs, Textarea } from '../../components/ui';
import { DateInput } from '../../components/inputs';
import { ContactPicker, PriorityPill, TicketStatusPill, TicketTypePill, UnitPicker, UserPicker, WarrantyBadge } from '../../components/domain';
import { date, num, relative } from '../../lib/format';
import { matchesSearch } from '@shared/search';

export default function TicketsPage() {
  const { settings, users } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data = [], isLoading } = useApi<any[]>('/tickets');
  const [tab, setTab] = useState<'open' | 'resolved' | 'all'>('open');
  const [type, setType] = useState(() => params.get('type') ?? '');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<{ contactId?: string | null; unitId?: string | null } | null>(null);
  useEffect(() => {
    const requestedType = params.get('type');
    if (requestedType) setType(requestedType);
    if (params.get('new') === '1') {
      setCreating({ contactId: params.get('contact'), unitId: params.get('unit') });
      ['new', 'contact', 'unit'].forEach((k) => params.delete(k)); setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const isOpen = (t: any) => !['resolved', 'closed'].includes(t.status);
  const list = useMemo(() => data.filter((t) =>
    (tab === 'all' || (tab === 'open' ? isOpen(t) : !isOpen(t))) && (!type || t.type === type) && (!assignee || t.assigneeId === assignee)
    && matchesSearch(`${t.number} ${t.subject} ${t.contactName ?? ''} ${t.serial ?? ''}`, search)), [data, tab, type, assignee, search]);
  const open = data.filter(isOpen);
  const rated = data.filter((t) => t.satisfaction);

  return (
    <div>
      <PageHeader icon={LifeBuoy} title="خدمات پس از فروش" subtitle="نصب، پشتیبانی، گارانتی و تعمیر — با SLA بر اساس اولویت"
        fab={{ label: 'تیکت جدید', icon: Plus, onClick: () => setCreating({}) }} />
      <div className="stat-rail mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="تیکت‌های باز" value={num(open.length)} tone="iris" />
        <Stat label="نقض SLA" value={num(open.filter((t) => t.breached).length)} tone="rose" icon={AlertOctagon} alert={open.some((t) => t.breached)} />
        <Stat label="زیر پوشش گارانتی" value={num(open.filter((t) => t.underWarranty).length)} tone="mint" icon={ShieldCheck} />
        <Stat label="رضایت مشتری" value={rated.length ? `${num(rated.reduce((s, t) => s + t.satisfaction, 0) / rated.length, 1)} / ۵` : '—'} hint={`${num(rated.length)} نظر`} tone="amber" icon={Star} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs className="w-full md:w-auto" value={tab} onChange={setTab} tabs={[{ key: 'open', label: 'باز', count: open.length }, { key: 'resolved', label: 'حل‌شده' }, { key: 'all', label: 'همه' }]} />
        <Filters count={(type ? 1 : 0) + (assignee ? 1 : 0)} onReset={() => { setType(''); setAssignee(''); }}>
          <Select className="w-44" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">همه انواع</option>{settings.ticketTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
          <Select className="w-44" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">همه کارشناسان</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </Select>
        </Filters>
        <SearchBox value={search} onChange={setSearch} className="min-w-0 flex-1 md:min-w-[200px]" placeholder="شماره، موضوع، مشتری، سریال…" />
      </div>
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={LifeBuoy} title="تیکتی یافت نشد" /></Card> : (<>
        <div className="space-y-2.5 md:hidden">
          {list.map((t) => (
            <ListCard key={t.id} to={`/service/tickets/${t.id}`} accent={t.breached && isOpen(t) ? '#FF499E' : settings.ticketTypes.find((x) => x.key === t.type)?.color}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[15px] font-bold leading-6 text-ink">{t.subject}</div>
                  <div className="mt-0.5 text-[11px] text-mist"><span className="ltr">{t.number}</span> · {t.contactName ?? '—'}</div>
                </div>
                <TicketStatusPill status={t.status} />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <TicketTypePill type={t.type} />
                <PriorityPill priority={t.priority} />
                {t.serial && <span className="ltr rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[11px] text-frost">{t.serial}</span>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/50 pt-2.5 text-[11px]">
                <span className={clsx(t.breached && isOpen(t) ? 'font-semibold text-rose' : 'text-mist')}>
                  {isOpen(t) ? (t.breached ? `نقض SLA — ${relative(t.slaDueAt)}` : `SLA ${relative(t.slaDueAt)}`) : 'بسته شده'}
                </span>
                <span className="text-mist">{t.assigneeName ?? 'بدون کارشناس'}</span>
              </div>
              {t.scheduledAt && isOpen(t) && <div className="mt-1.5 text-[11px] text-iris">نوبت بازدید: {date(t.scheduledAt)}</div>}
            </ListCard>
          ))}
        </div>
        <Card pad={false} bodyClass="overflow-x-auto" className="hidden md:block">
          <table className="tbl">
            <thead><tr><th>شماره</th><th>موضوع</th><th>نوع</th><th>مشتری / سریال</th><th>وضعیت</th><th>اولویت</th><th>SLA</th><th>کارشناس</th></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/service/tickets/${t.id}`)}>
                <td className="ltr whitespace-nowrap text-right text-xs font-semibold">{t.number}</td>
                <td className="max-w-[260px]"><div className="truncate text-ink">{t.subject}</div>{t.scheduledAt && isOpen(t) && <div className="text-[11px] text-iris">نوبت: {date(t.scheduledAt)}</div>}</td>
                <td><TicketTypePill type={t.type} /></td>
                <td className="text-xs"><div>{t.contactName ?? '—'}</div>{t.serial && <div className="ltr text-right font-mono text-mist">{t.serial}</div>}</td>
                <td><TicketStatusPill status={t.status} /></td>
                <td><PriorityPill priority={t.priority} /></td>
                <td className={clsx('whitespace-nowrap text-xs', t.breached ? 'font-semibold text-rose' : 'text-mist')}>{isOpen(t) ? (t.breached ? `نقض — ${relative(t.slaDueAt)}` : relative(t.slaDueAt)) : '—'}</td>
                <td className="text-xs text-mist">{t.assigneeName ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </>)}
      <TicketFormModal init={creating} onClose={() => setCreating(null)} onSaved={(id) => navigate(`/service/tickets/${id}`)} />
    </div>
  );
}

export function TicketFormModal({ init, onClose, onSaved }: { init: { contactId?: string | null; unitId?: string | null } | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { settings, me } = useSession();
  const { data: units = [] } = useApi<any[]>('/units');
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (init) setF({ contactId: init.contactId ?? null, unitId: init.unitId ?? null, type: 'support', priority: 'normal', channel: 'phone', subject: '', description: '', scheduledAt: null, assigneeId: me.role === 'support' ? me.id : null });
  }, [init, me]);
  const unit = units.find((u) => u.id === f.unitId);
  useEffect(() => { if (unit?.contactId && !f.contactId) setF((x: any) => ({ ...x, contactId: unit.contactId })); }, [unit, f.contactId]);
  const save = useAction(() => post('/tickets', f), { success: 'تیکت ثبت شد', onSuccess: (r) => { onClose(); onSaved(r.id); } });
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  return (
    <Modal open={!!init} onClose={onClose} title="تیکت جدید" icon={LifeBuoy} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.subject?.trim() || (!f.contactId && !f.unitId)} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت تیکت</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="شماره سریال دستگاه" hint={unit ? <WarrantyBadge until={unit.warrantyUntil} /> : 'با انتخاب سریال، مشتری و وضعیت گارانتی خودکار تشخیص داده می‌شود'}>
          <UnitPicker value={f.unitId} contactId={f.contactId && !f.unitId ? f.contactId : undefined} onChange={(v) => set('unitId', v)} />
        </Field>
        <Field label="مشتری"><ContactPicker value={f.contactId} onChange={(v) => set('contactId', v)} /></Field>
        <Field label="نوع"><Select value={f.type} onChange={(e) => set('type', e.target.value)}>{settings.ticketTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="اولویت" hint={`SLA: ${num(settings.ticketSlaHours[f.priority as 'normal'] ?? 72)} ساعت`}>
            <Select value={f.priority} onChange={(e) => set('priority', e.target.value)}><option value="low">کم</option><option value="normal">عادی</option><option value="high">بالا</option><option value="urgent">فوری</option></Select>
          </Field>
          <Field label="کانال"><Select value={f.channel} onChange={(e) => set('channel', e.target.value)}><option value="phone">تلفن</option><option value="whatsapp">واتساپ</option><option value="email">ایمیل</option><option value="visit">حضوری</option></Select></Field>
        </div>
        <Field label="موضوع *" className="sm:col-span-2"><Input value={f.subject ?? ''} onChange={(e) => set('subject', e.target.value)} /></Field>
        <Field label="شرح" className="sm:col-span-2"><Textarea value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="زمان بازدید / نصب"><DateInput value={f.scheduledAt} onChange={(v) => set('scheduledAt', v)} /></Field>
        <Field label="کارشناس"><UserPicker value={f.assigneeId} onChange={(v) => set('assigneeId', v)} /></Field>
      </div>
    </Modal>
  );
}

