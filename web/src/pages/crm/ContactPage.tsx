import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Building2, PhoneCall, Pencil, FileText, Wrench, Star, MapPin, Mail, Globe, Gauge, Clock, Check, AlarmClock, Trash2,
  ShoppingCart, Cpu, LifeBuoy, History, UserCheck, Share2,
} from 'lucide-react';
import clsx from 'clsx';
import { CALL_OUTCOMES, INTERACTION_TYPES } from '@shared/defaults';
import { del, post, put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, KV, PageHeader, Pill, Spinner, Stars, Tabs, useConfirm } from '../../components/ui';
import { LifecyclePill, OrderStagePill, TicketStatusPill, UnitStatusPill, WarrantyBadge } from '../../components/domain';
import { ContactFormModal, LogTouchModal, NextActionTag, ScoreBreakdown } from '../../components/crm';
import { Timeline } from '../../components/flow';
import { ScoreMeter } from '../../components/charts';
import { compactMoney, date, dateTime, money, num, relative } from '../../lib/format';

export default function ContactPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { settings, tags, userName, lifecycle } = useSession();
  const { data, isLoading } = useApi<any>(`/contacts/${id}`);
  const [tab, setTab] = useState<'timeline' | 'orders' | 'units' | 'tickets'>('timeline');
  const [editing, setEditing] = useState(false);
  const [touch, setTouch] = useState<{ followupId?: string } | null>(null);

  const setStage = useAction((body: any) => post(`/contacts/${id}/stage`, body), { success: 'مرحله مخاطب تغییر کرد' });
  const followAction = useAction(({ fid, action }: { fid: string; action: string }) => post(`/followups/${fid}/${action}`, { days: 1 }), { success: 'پیگیری به‌روز شد' });
  const star = useAction((starred: boolean) => put(`/contacts/${id}`, { starred }));
  const rate = useAction((rating: number) => put(`/contacts/${id}`, { rating }));
  const remove = useAction(() => del(`/contacts/${id}`), { success: 'مخاطب حذف شد', onSuccess: () => navigate('/crm/contacts') });

  if (isLoading || !data) return <Spinner />;
  const c = data.contact;
  const cur = settings.company.currency;
  const isLead = !['customer', 'lost'].includes(c.stage);
  const pending = data.followups.filter((f: any) => f.status === 'pending');
  const lifetime = data.orders.filter((o: any) => o.status !== 'cancelled' && o.stage !== 'quote').reduce((s: number, o: any) => s + o.total, 0);
  const balance = data.orders.filter((o: any) => o.status !== 'cancelled' && o.stage !== 'quote').reduce((s: number, o: any) => s + o.total - o.paid, 0);
  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));

  const changeStage = async (stage: string) => {
    if (stage === 'lost') {
      const reason = await confirm({
        title: 'ثبت از دست رفتن سرنخ', danger: true, confirm: 'ثبت',
        body: `دلیل را از میان این موارد بنویسید: ${settings.lostReasons.join('، ')}`,
        input: { label: 'دلیل', placeholder: settings.lostReasons[0], required: true },
      });
      if (reason) setStage.mutate({ stage, lostReason: reason });
    } else setStage.mutate({ stage });
  };

  const timeline = [
    ...data.interactions.map((i: any) => ({
      id: i.id, at: i.at, color: i.type === 'call' ? '#779BE7' : i.type === 'meeting' || i.type === 'visit' ? '#0FD69D' : '#9DB4C0',
      title: <span>{INTERACTION_TYPES[i.type]}{i.type === 'call' && <span className="mr-2 text-xs text-mist">{i.direction === 'inbound' ? '↙ ورودی' : '↗ خروجی'} · {CALL_OUTCOMES[i.outcome] ?? i.outcome}</span>}</span>,
      body: i.body, meta: `${userName(i.userId)} · ${dateTime(i.at)}${i.durationMin ? ` · ${num(i.durationMin)} دقیقه` : ''}`,
    })),
    ...data.followups.filter((f: any) => f.status !== 'pending').map((f: any) => ({
      id: f.id, at: f.completedAt ?? f.dueAt, color: f.status === 'done' ? '#0FD69D' : '#5C6B73',
      title: `پیگیری ${f.status === 'done' ? 'انجام شد' : 'لغو شد'}`, body: f.note, meta: userName(f.userId),
    })),
    ...data.orders.map((o: any) => ({
      id: o.id, at: o.createdAt, color: '#B48CF2',
      title: <Link to={`/sales/orders/${o.id}`} className="hover:text-iris">{o.stage === 'quote' ? 'پیش‌فاکتور' : 'سفارش'} {o.number} — {money(o.total, cur)}</Link>,
    })),
    ...data.tickets.map((t: any) => ({
      id: t.id, at: t.createdAt, color: '#FF499E',
      title: <Link to={`/service/tickets/${t.id}`} className="hover:text-iris">تیکت {t.number}: {t.subject}</Link>,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div>
      <PageHeader
        icon={Building2}
        title={<span className="flex items-center gap-2">
          {c.name}
          <button onClick={() => star.mutate(!c.starred)} aria-label="نشان‌دار"><Star size={18} className={c.starred ? 'fill-amber text-amber' : 'text-slate hover:text-amber'} /></button>
        </span>}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <LifecyclePill stage={c.stage} />
          {c.company && <span>{c.company}{c.jobTitle && ` — ${c.jobTitle}`}</span>}
          {c.tags.map((t: string) => tagMap[t] && <Pill key={t} color={tagMap[t].color}>{tagMap[t].name}</Pill>)}
        </span>}
        actions={<>
          <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>ویرایش</Button>
          <Button variant="outline" icon={Wrench} onClick={() => navigate(`/service/tickets?new=1&contact=${c.id}`)}>تیکت</Button>
          <Button variant="outline" icon={FileText} onClick={() => navigate(`/sales/orders?new=1&contact=${c.id}`)}>پیش‌فاکتور</Button>
          <Button variant="glow" icon={PhoneCall} onClick={() => setTouch({})}>ثبت ارتباط</Button>
        </>}
      />

      {/* Lifecycle stepper — click to move the contact through the funnel */}
      <div className="glass mb-6 flex flex-wrap items-center gap-2 p-3">
        {settings.lifecycleStages.map((s) => {
          const active = s.key === c.stage;
          return (
            <button
              key={s.key}
              onClick={() => !active && changeStage(s.key)}
              className={clsx('flex-1 rounded-xl px-3 py-2 text-sm transition', active ? 'font-semibold text-night' : 'text-mist hover:bg-ink/[0.06] hover:text-ink')}
              style={active ? { background: s.color } : undefined}
            >{s.label}</button>
          );
        })}
      </div>
      {c.stage === 'lost' && c.lostReason && <p className="-mt-3 mb-5 text-sm text-rose">دلیل از دست رفتن: {c.lostReason}</p>}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          {isLead ? (
            <Card title="امتیاز سرنخ" icon={Gauge} actions={<ScoreMeter score={c.score} hot={settings.scoring.hotThreshold} warm={settings.scoring.warmThreshold} />}>
              <div className="mb-4"><NextActionTag action={c.nextAction} /></div>
              <ScoreBreakdown parts={c.scoreParts ?? []} score={c.score} />
            </Card>
          ) : (
            <Card title="ارزش مشتری" icon={UserCheck}>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-ink/[0.04] p-3"><div className="text-xs text-mist">خرید کل</div><div className="num mt-1 font-bold">{compactMoney(lifetime)}</div></div>
                <div className="rounded-xl bg-ink/[0.04] p-3"><div className="text-xs text-mist">مانده حساب</div><div className={clsx('num mt-1 font-bold', balance > 0 && 'text-amber')}>{compactMoney(balance)}</div></div>
                <div className="rounded-xl bg-ink/[0.04] p-3"><div className="text-xs text-mist">دستگاه نصب‌شده</div><div className="num mt-1 font-bold">{num(data.units.length)}</div></div>
                <div className="rounded-xl bg-ink/[0.04] p-3"><div className="text-xs text-mist">مشتری از</div><div className="mt-1 text-sm font-bold">{date(c.convertedAt)}</div></div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-mist">امتیاز کیفی<Stars value={c.rating} onChange={(v) => rate.mutate(v)} /></div>
            </Card>
          )}

          <Card title="پرونده" icon={Building2}>
            <KV cols={1} items={[
              ['تلفن', <div className="space-y-0.5">{c.phones.map((p: any, i: number) => <a key={i} href={`tel:${p.value}`} className="ltr block hover:text-iris">{p.value}</a>)}</div>],
              ...(c.emails?.length ? [['ایمیل', <span className="ltr flex items-center gap-1"><Mail size={12} />{c.emails[0]}</span>] as [string, any]] : []),
              ...(c.website ? [['وب‌سایت', <span className="ltr flex items-center gap-1"><Globe size={12} />{c.website}</span>] as [string, any]] : []),
              ['منبع', `${settings.leadSources.find((s) => s.key === c.leadSource)?.label ?? '—'}${c.leadSourceDetail ? ` — ${c.leadSourceDetail}` : ''}`],
              ['نوع مشتری', settings.customerTypes.find((t) => t.key === c.customerType)?.label],
              ...settings.customFields.map((f) => [f.label, Array.isArray(c.attrs?.[f.key]) ? c.attrs[f.key].join('، ') || '—' : c.attrs?.[f.key] ?? '—'] as [string, any]),
              ['ارزش تخمینی', c.estimatedValue ? money(c.estimatedValue, cur) : '—'],
              ['کارشناس', userName(c.ownerId)],
              ['ثبت', `${date(c.createdAt)} (${relative(c.createdAt)})`],
              ...(data.referredBy ? [['معرف', <Link to={`/crm/contacts/${data.referredBy.id}`} className="hover:text-iris">{data.referredBy.name}</Link>] as [string, any]] : []),
            ]} />
            {data.referrals.length > 0 && (
              <div className="mt-4 border-t border-line/60 pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs text-mist"><Share2 size={13} />معرفی‌شده‌ها توسط این مشتری</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.referrals.map((r: any) => <Link key={r.id} to={`/crm/contacts/${r.id}`}><Pill color={lifecycle(r.stage)?.color}>{r.name}</Pill></Link>)}
                </div>
              </div>
            )}
            {c.notes && <p className="mt-4 rounded-xl bg-ink/[0.04] p-3 text-sm leading-7 text-frost">{c.notes}</p>}
          </Card>

          <Card title="آدرس‌ها" icon={MapPin}>
            {c.addresses.length === 0 ? <p className="text-sm text-mist">آدرسی ثبت نشده</p> : (
              <ul className="space-y-3">
                {c.addresses.map((a: any) => (
                  <li key={a.id} className="text-sm">
                    <div className="font-medium text-ink">{a.title}</div>
                    <div className="text-mist">{[a.province, a.county, a.address].filter(Boolean).join('، ')}</div>
                    {a.lat && <a className="text-xs text-iris" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=15/${a.lat}/${a.lng}`}>مشاهده روی نقشه ↗</a>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Button variant="danger" size="sm" icon={Trash2} onClick={async () => {
            if (await confirm({ title: 'حذف مخاطب', danger: true, confirm: 'حذف', body: 'تمام تماس‌ها و پیگیری‌های این مخاطب حذف می‌شود. مخاطبی که سفارش دارد قابل حذف نیست.' })) remove.mutate(undefined);
          }}>حذف مخاطب</Button>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="پیگیری‌های باز" icon={AlarmClock} pad={false} bodyClass="p-3">
            {pending.length === 0 ? (
              <div className="flex items-center justify-between px-2 py-2 text-sm text-mist">
                پیگیری زمان‌بندی‌شده‌ای وجود ندارد
                <Button size="sm" variant="action" onClick={() => setTouch({})}>ثبت ارتباط و پیگیری</Button>
              </div>
            ) : pending.map((f: any) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-ink/[0.04]">
                <Clock size={16} className={f.dueAt < Date.now() ? 'text-rose' : 'text-iris'} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink">{f.note || 'پیگیری'}</div>
                  <div className={clsx('text-xs', f.dueAt < Date.now() ? 'text-rose' : 'text-mist')}>{dateTime(f.dueAt)} — {relative(f.dueAt)} · {userName(f.userId)}</div>
                </div>
                {f.priority === 'high' && <Pill color="#F5B85A">اولویت بالا</Pill>}
                <Button size="sm" variant="action" icon={PhoneCall} onClick={() => setTouch({ followupId: f.id })}>تماس</Button>
                <Button size="sm" variant="ghost" icon={AlarmClock} onClick={() => followAction.mutate({ fid: f.id, action: 'snooze' })} title="تعویق یک روزه" />
                <Button size="sm" variant="ghost" icon={Check} onClick={() => followAction.mutate({ fid: f.id, action: 'complete' })} title="انجام شد" />
              </div>
            ))}
          </Card>

          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'timeline', label: 'تاریخچه ارتباط', icon: History, count: timeline.length },
              { key: 'orders', label: 'فروش‌ها', icon: ShoppingCart, count: data.orders.length },
              { key: 'units', label: 'دستگاه‌ها', icon: Cpu, count: data.units.length },
              { key: 'tickets', label: 'تیکت‌ها', icon: LifeBuoy, count: data.tickets.length },
            ]}
          />

          {tab === 'timeline' && <Card><Timeline items={timeline} empty="هنوز ارتباطی ثبت نشده — اولین تماس را ثبت کنید" /></Card>}

          {tab === 'orders' && (
            <Card pad={false} bodyClass="overflow-x-auto">
              {data.orders.length === 0 ? <Empty icon={ShoppingCart} title="سفارشی ثبت نشده" action={<Button variant="action" onClick={() => navigate(`/sales/orders?new=1&contact=${c.id}`)}>ایجاد پیش‌فاکتور</Button>} /> : (
                <table className="tbl">
                  <thead><tr><th>شماره</th><th>مرحله</th><th>مبلغ</th><th>پرداخت‌شده</th><th>تاریخ</th></tr></thead>
                  <tbody>{data.orders.map((o: any) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/sales/orders/${o.id}`)}>
                      <td className="ltr text-right font-medium">{o.number}</td>
                      <td><OrderStagePill stage={o.stage} status={o.status} /></td>
                      <td className="num">{money(o.total)}</td>
                      <td className="num text-mist">{money(o.paid)}</td>
                      <td className="text-xs text-mist">{date(o.createdAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          )}

          {tab === 'units' && (
            <Card pad={false} bodyClass="overflow-x-auto">
              {data.units.length === 0 ? <Empty icon={Cpu} title="دستگاهی برای این مشتری ثبت نشده" /> : (
                <table className="tbl">
                  <thead><tr><th>سریال</th><th>محصول</th><th>وضعیت</th><th>فریمور</th><th>گارانتی</th></tr></thead>
                  <tbody>{data.units.map((u: any) => (
                    <tr key={u.id} className="cursor-pointer" onClick={() => navigate(`/units/${u.serial}`)}>
                      <td className="ltr text-right font-mono text-xs text-ink">{u.serial}</td>
                      <td>{u.itemName}</td>
                      <td><UnitStatusPill status={u.status} /></td>
                      <td className="ltr text-right text-xs">{u.fwVersion || '—'}</td>
                      <td><WarrantyBadge until={u.warrantyUntil} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          )}

          {tab === 'tickets' && (
            <Card pad={false} bodyClass="overflow-x-auto">
              {data.tickets.length === 0 ? <Empty icon={LifeBuoy} title="تیکتی ثبت نشده" /> : (
                <table className="tbl">
                  <thead><tr><th>شماره</th><th>موضوع</th><th>وضعیت</th><th>تاریخ</th></tr></thead>
                  <tbody>{data.tickets.map((t: any) => (
                    <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/service/tickets/${t.id}`)}>
                      <td className="ltr text-right">{t.number}</td><td>{t.subject}</td><td><TicketStatusPill status={t.status} /></td><td className="text-xs text-mist">{date(t.createdAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          )}
        </div>
      </div>

      <ContactFormModal open={editing} onClose={() => setEditing(false)} contact={c} />
      <LogTouchModal open={!!touch} onClose={() => setTouch(null)} contact={c} completeFollowupId={touch?.followupId} />
    </div>
  );
}
