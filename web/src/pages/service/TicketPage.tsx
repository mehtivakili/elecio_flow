import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LifeBuoy, Send, Lock, Cpu, Phone, CheckCircle2, PlayCircle, PauseCircle, Archive, MessageSquare, History } from 'lucide-react';
import clsx from 'clsx';
import { TICKET_STATUS } from '@shared/defaults';
import { post, put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Avatar, Button, Card, Field, KV, MoneyInput, PageHeader, Spinner, Stars, Textarea, Toggle, useConfirm } from '../../components/ui';
import { DateInput } from '../../components/inputs';
import { PriorityPill, TicketStatusPill, TicketTypePill, UserPicker, WarrantyBadge } from '../../components/domain';
import { date, dateTime, money, relative } from '../../lib/format';

export default function TicketPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const { userName, settings } = useSession();
  const { data, isLoading } = useApi<any>(`/tickets/${id}`);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const setStatus = useAction((b: any) => post(`/tickets/${id}/status`, b), { success: 'وضعیت تیکت به‌روز شد' });
  const update = useAction((b: any) => put(`/tickets/${id}`, b), { success: 'تیکت به‌روز شد' });
  const comment = useAction(() => post(`/tickets/${id}/comments`, { body, internal }), { onSuccess: () => setBody('') });

  if (isLoading || !data) return <Spinner />;
  const t = data.ticket;
  const open = !['resolved', 'closed'].includes(t.status);

  const resolve = async () => {
    const text = await confirm({ title: 'ثبت راه‌حل', confirm: 'حل شد', input: { label: 'شرح اقدام انجام‌شده', required: true } });
    if (text) setStatus.mutate({ status: 'resolved', resolution: text });
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={LifeBuoy}
        title={<span className="flex flex-wrap items-center gap-3">{t.subject}<TicketStatusPill status={t.status} /></span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="ltr">{t.number}</span>·<TicketTypePill type={t.type} /><PriorityPill priority={t.priority} />· ثبت {relative(t.createdAt)}</span>}
        actions={open ? <>
          {t.status !== 'in_progress' && <Button variant="action" icon={PlayCircle} onClick={() => setStatus.mutate({ status: 'in_progress' })}>شروع رسیدگی</Button>}
          {t.status !== 'waiting' && <Button variant="outline" icon={PauseCircle} onClick={() => setStatus.mutate({ status: 'waiting' })}>منتظر مشتری</Button>}
          <Button variant="glow" icon={CheckCircle2} onClick={resolve}>حل شد</Button>
        </> : <>
          {t.status === 'resolved' && <Button variant="outline" icon={Archive} onClick={() => setStatus.mutate({ status: 'closed' })}>بستن</Button>}
          <Button variant="ghost" onClick={() => setStatus.mutate({ status: 'open' })}>بازگشایی</Button>
        </>} />

      {t.breached && open && <div className="glass border-rose/40 bg-rose/10 p-4 text-sm text-frost">مهلت SLA این تیکت ({dateTime(t.slaDueAt)}) گذشته است.</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card title="گفتگو و اقدامات" icon={MessageSquare}>
            {t.description && (
              <div className="mb-5 rounded-2xl bg-ink/[0.04] p-4 text-sm leading-7 text-frost">
                <div className="mb-1 text-xs text-mist">شرح اولیه · {dateTime(t.createdAt)}</div>{t.description}
              </div>
            )}
            <ul className="space-y-4">
              {data.comments.map((c: any) => (
                <li key={c.id} className="flex gap-3">
                  <Avatar name={c.userName ?? '؟'} size={32} />
                  <div className={clsx('min-w-0 flex-1 rounded-2xl p-3 text-sm leading-7', c.internal ? 'border border-dashed border-amber/40 bg-amber/5' : 'bg-ink/[0.05]')}>
                    <div className="mb-1 flex items-center gap-2 text-xs text-mist">{c.userName}<span>·</span>{dateTime(c.at)}{c.internal ? <span className="flex items-center gap-1 text-amber"><Lock size={11} />داخلی</span> : null}</div>
                    {c.body}
                  </div>
                </li>
              ))}
              {t.resolution && (
                <li className="rounded-2xl border border-mint/40 bg-mint/10 p-4 text-sm"><div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-mint"><CheckCircle2 size={14} />راه‌حل — {dateTime(t.resolvedAt)}</div>{t.resolution}</li>
              )}
            </ul>
            <div className="mt-5 border-t border-line/60 pt-4">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="پاسخ، اقدام انجام‌شده یا یادداشت…" />
              <div className="mt-2 flex items-center justify-between">
                <Toggle checked={internal} onChange={setInternal} label="یادداشت داخلی (برای مشتری نیست)" />
                <Button variant="action" icon={Send} disabled={!body.trim()} loading={comment.isPending} onClick={() => comment.mutate(undefined)}>ثبت</Button>
              </div>
            </div>
          </Card>
          {data.history.length > 0 && (
            <Card title="سابقه این دستگاه" icon={History}>
              <ul className="space-y-2">{data.history.map((h: any) => (
                <li key={h.id}><Link to={`/service/tickets/${h.id}`} className="flex items-center justify-between rounded-xl bg-ink/[0.04] p-3 text-sm hover:bg-ink/[0.07]">
                  <span>{h.subject} <span className="text-xs text-mist">· {date(h.createdAt)}</span></span><TicketStatusPill status={h.status} />
                </Link></li>
              ))}</ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="مشتری و دستگاه" icon={Cpu}>
            <KV cols={1} items={[
              ['مشتری', t.contactId ? <Link to={`/crm/contacts/${t.contactId}`} className="hover:text-iris">{t.contactName}</Link> : '—'],
              ['تلفن', t.contactPhones?.[0] ? <a href={`tel:${t.contactPhones[0].value}`} className="ltr inline-flex items-center gap-1"><Phone size={12} />{t.contactPhones[0].value}</a> : '—'],
              ['شماره سریال', t.serial ? <Link to={`/units/${t.serial}`} className="ltr font-mono hover:text-iris">{t.serial}</Link> : '—'],
              ['محصول', t.itemName ?? '—'],
              ['فریمور', <span className="ltr">{t.fwVersion || '—'}</span>],
              ['گارانتی', t.serial ? <WarrantyBadge until={t.warrantyUntil} /> : '—'],
              ['سفارش', t.orderNumber ? <Link to={`/sales/orders/${t.orderId}`} className="ltr hover:text-iris">{t.orderNumber}</Link> : '—'],
            ]} />
          </Card>
          <Card title="رسیدگی">
            <div className="space-y-4">
              <Field label="کارشناس مسئول"><UserPicker value={t.assigneeId} onChange={(v) => update.mutate({ assigneeId: v })} /></Field>
              <Field label="زمان بازدید / نصب"><DateInput value={t.scheduledAt} onChange={(v) => update.mutate({ scheduledAt: v })} /></Field>
              <Field label={`هزینه دریافتی از مشتری${t.underWarranty ? ' (زیر گارانتی)' : ''}`}><MoneyInput value={t.cost} onChange={(v) => update.mutate({ cost: v ?? 0 })} /></Field>
              <KV cols={1} items={[
                ['مهلت SLA', <span className={t.breached ? 'text-rose' : ''}>{dateTime(t.slaDueAt)}</span>],
                ['کانال', { phone: 'تلفن', whatsapp: 'واتساپ', email: 'ایمیل', visit: 'حضوری' }[t.channel as string] ?? t.channel],
                ['هزینه', t.cost ? money(t.cost, settings.company.currency) : 'رایگان'],
              ]} />
              {!open && (
                <div className="border-t border-line/60 pt-3">
                  <div className="mb-1 text-xs text-mist">رضایت مشتری</div>
                  <Stars value={t.satisfaction ?? 0} onChange={(v) => update.mutate({ satisfaction: v })} size={22} />
                </div>
              )}
            </div>
          </Card>
          <p className="text-center text-[11px] text-mist">{TICKET_STATUS[t.status]?.label} · آخرین تغییر {relative(t.updatedAt)} · {userName(t.assigneeId)}</p>
        </div>
      </div>
    </div>
  );
}
