import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ShoppingCart, ArrowLeft, Pencil, Printer, Ban, PackageCheck, Truck, Wallet, Plus, Cpu, Factory, LifeBuoy, Lock,
  ShieldAlert, Unlink, MapPin, Phone, History, Undo2,
} from 'lucide-react';
import clsx from 'clsx';
import { PAYMENT_METHODS } from '@shared/defaults';
import { ApiError, del, post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { Button, Card, Field, Input, KV, Modal, MoneyInput, PageHeader, Pill, Progress, Select, Spinner, Textarea, useConfirm } from '../../components/ui';
import { DateInput } from '../../components/inputs';
import { OrderStagePill, PriorityPill, TicketStatusPill, UnitStatusPill, WoStagePill } from '../../components/domain';
import { StageTrack, Timeline } from '../../components/flow';
import { OrderFormModal } from '../../components/orders';
import { date, dateTime, money, num } from '../../lib/format';

const GATE_HINT: Record<string, string> = {
  deposit: 'برای عبور: دریافت پیش‌پرداخت',
  full_payment: 'برای عبور: تسویه کامل حساب',
  allocation: 'برای عبور: تخصیص همه کالاها (سریال یا موجودی)',
  shipment: 'برای عبور: ثبت محموله ارسالی',
};

export default function OrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { settings, userName, me } = useSession();
  const { data, isLoading } = useApi<any>(`/orders/${id}`);
  const [blocked, setBlocked] = useState<{ to?: string; error: ApiError } | null>(null);
  const [forceNote, setForceNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [shipping, setShipping] = useState(false);
  const cur = settings.company.currency;

  const advance = useAction(
    (body: { to?: string; force?: boolean; note?: string }) => post(`/orders/${id}/advance`, body),
    {
      success: 'مرحله سفارش به‌روز شد',
      onSuccess: () => { setBlocked(null); setForceNote(''); },
      onError: (e) => { if (e.status === 409 && e.details?.blockers) setBlocked({ error: e }); else { setBlocked(null); toast(e.message, 'error'); } },
    },
  );
  const allocate = useAction((lineId: string) => post(`/orders/${id}/allocate`, { lineId }), { success: (r: any) => `${num(r.allocated)} مورد تخصیص یافت` });
  const release = useAction((unitId: string) => post(`/units/${unitId}/release`), { success: 'سریال آزاد شد' });
  const makeWo = useAction(() => post(`/orders/${id}/work-orders`), { success: 'دستور تولید برای کسری ایجاد شد' });
  const cancel = useAction((reason: string) => post(`/orders/${id}/cancel`, { reason }), { success: 'سفارش لغو شد' });
  const removePayment = useAction((pid: string) => del(`/payments/${pid}`), { success: 'پرداخت حذف شد' });

  if (isLoading || !data) return <Spinner />;
  const o = data.order;
  const stages = data.stages;
  const current = stages.find((s: any) => s.key === o.stage);
  const next = stages[o.stageIndex + 1];
  const open = o.status === 'open';
  const missing = data.lines.filter((l: any) => l.itemKind !== 'service' && l.missing > 0);
  const paidPct = o.total ? Math.round((o.paid / o.total) * 100) : 0;
  const depositNeed = Math.round(o.total * settings.company.depositPct / 100);
  const isAdmin = ['owner', 'admin'].includes(me.role);

  const history = [
    ...data.history.map((h: any) => ({
      id: h.id, at: h.enteredAt, color: stages.find((s: any) => s.key === h.stage)?.color,
      title: <span>ورود به «{stages.find((s: any) => s.key === h.stage)?.label ?? h.stage}»{h.forced ? <Pill color="#FF499E" className="mr-2">عبور اجباری</Pill> : null}</span>,
      body: h.note, meta: `${userName(h.userId)} · ${dateTime(h.enteredAt)}`,
    })),
    ...data.activity.filter((a: any) => a.action !== 'stage').map((a: any) => ({ id: a.id, at: a.at, title: a.summary, color: '#5C6B73' })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title={<span className="flex items-center gap-3"><span className="ltr">{o.number}</span><OrderStagePill stage={o.stage} status={o.status} /><PriorityPill priority={o.priority} /></span>}
        subtitle={<span>
          <Link to={`/crm/contacts/${o.contactId}`} className="text-frost hover:text-iris">{o.contactName}</Link>
          {' · '}{o.fulfillment === 'mto' ? 'تولید بر اساس سفارش' : 'فروش از موجودی'}{o.needsInstallation ? ' · با نصب' : ''}
          {' · '}ثبت {date(o.createdAt)}
        </span>}
        actions={<>
          <Button variant="ghost" icon={Printer} onClick={() => window.print()}>چاپ</Button>
          {open && o.stageIndex <= 1 && <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>ویرایش اقلام</Button>}
          {open && (
            <Button variant="danger" icon={Ban} onClick={async () => {
              const reason = await confirm({ title: `لغو سفارش ${o.number}`, danger: true, confirm: 'لغو سفارش', body: 'سریال‌ها و موجودی رزروشده آزاد می‌شوند.', input: { label: 'دلیل لغو', required: true } });
              if (reason) cancel.mutate(reason);
            }}>لغو</Button>
          )}
          {open && o.stageIndex > 0 && (
            <Button variant="outline" icon={Undo2} onClick={() => advance.mutate({ to: stages[o.stageIndex - 1].key })} title="بازگشت به مرحله قبل" />
          )}
          {open && next && (
            <Button variant="glow" icon={ArrowLeft} loading={advance.isPending} onClick={() => advance.mutate({})}>
              {o.stage === 'quote' ? 'تأیید و تبدیل به سفارش' : `انتقال به «${next.label}»`}
            </Button>
          )}
        </>}
      />

      <Card pad={false} bodyClass="p-5">
        <StageTrack stages={stages} current={o.stage} history={data.history} closed={o.status === 'done'} onPick={open && isAdmin ? (key) => advance.mutate({ to: key }) : undefined} />
        {open && current?.gate && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-ink/[0.04] px-4 py-2.5 text-xs text-frost">
            <Lock size={14} className="text-amber" /> {GATE_HINT[current.gate]}
            {current.gate === 'deposit' && <span className="text-mist">— دریافتی {money(o.paid)} از {money(depositNeed)} {cur}</span>}
            {current.gate === 'allocation' && missing.length > 0 && <span className="text-mist">— {num(missing.length)} ردیف تخصیص‌نیافته</span>}
            {current.gate === 'full_payment' && <span className="text-mist">— مانده {money(o.balance)} {cur}</span>}
          </div>
        )}
        {o.status === 'cancelled' && <p className="mt-4 text-sm text-rose">لغو شده: {o.cancelReason}</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card title="اقلام سفارش و تخصیص" icon={PackageCheck} pad={false} bodyClass="overflow-x-auto"
            actions={open && missing.some((l: any) => l.serialized) && <Button size="sm" variant="outline" icon={Factory} onClick={() => makeWo.mutate(undefined)}>دستور تولید برای کسری</Button>}>
            <table className="tbl">
              <thead><tr><th>کالا / خدمت</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th><th>تخصیص</th><th /></tr></thead>
              <tbody>
                {data.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td><div className="text-ink">{l.itemName}</div><div className="ltr text-right text-[11px] text-mist">{l.sku}</div></td>
                    <td className="num">{num(l.qty)}</td>
                    <td className="num">{money(l.unitPrice)}{l.discountPct ? <span className="mr-1 text-[11px] text-mint">-{num(l.discountPct)}٪</span> : null}</td>
                    <td className="num">{money(l.qty * l.unitPrice * (1 - l.discountPct / 100))}</td>
                    <td className="w-36">
                      {l.itemKind === 'service' ? <span className="text-xs text-mist">خدمت</span> : (
                        <>
                          <Progress value={(l.covered / l.qty) * 100} color={l.missing ? '#F5B85A' : '#0FD69D'} />
                          <div className="num mt-1 text-[11px] text-mist">{num(l.covered)} از {num(l.qty)} {l.serialized ? 'سریال' : ''}</div>
                        </>
                      )}
                    </td>
                    <td>{open && l.itemKind !== 'service' && l.missing > 0 && (
                      <Button size="sm" variant="action" loading={allocate.isPending} onClick={() => allocate.mutate(l.id)}>تخصیص</Button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="دستگاه‌های این سفارش" subtitle="شماره‌سریال‌های رزرو، ارسال یا نصب‌شده" icon={Cpu} pad={false} bodyClass="overflow-x-auto">
            {data.units.length === 0 ? <p className="px-5 pb-5 text-sm text-mist">هنوز سریالی تخصیص نیافته است.</p> : (
              <table className="tbl">
                <thead><tr><th>سریال</th><th>محصول</th><th>وضعیت</th><th>فریمور</th><th>گارانتی تا</th><th /></tr></thead>
                <tbody>{data.units.map((u: any) => (
                  <tr key={u.id}>
                    <td><Link to={`/units/${u.serial}`} className="ltr font-mono text-xs text-ink hover:text-iris">{u.serial}</Link></td>
                    <td className="text-sm">{u.itemName}</td>
                    <td><UnitStatusPill status={u.status} /></td>
                    <td className="ltr text-right text-xs">{u.fwVersion || '—'}</td>
                    <td className="text-xs text-mist">{date(u.warrantyUntil)}</td>
                    <td>{u.status === 'reserved' && open && <Button size="sm" variant="ghost" icon={Unlink} title="آزادسازی" onClick={() => release.mutate(u.id)} />}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="ارسال و حمل" icon={Truck} actions={open && <Button size="sm" variant="action" icon={Truck} onClick={() => setShipping(true)} disabled={missing.length > 0} title={missing.length ? 'ابتدا کالاها را تخصیص دهید' : ''}>ثبت ارسال</Button>}>
              {data.shipments.length === 0 ? <p className="text-sm text-mist">محموله‌ای ثبت نشده</p> : data.shipments.map((s: any) => (
                <div key={s.id} className="mb-2 rounded-xl bg-ink/[0.04] p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="font-medium">{s.carrier || 'حمل‌کننده'}</span><Pill color={s.status === 'delivered' ? '#0FD69D' : '#5EC8E5'}>{s.status === 'delivered' ? 'تحویل شد' : 'در مسیر'}</Pill></div>
                  <div className="ltr mt-1 text-right text-xs text-mist">{s.trackingNo}</div>
                  <div className="mt-1 text-xs text-mist">ارسال: {dateTime(s.shippedAt)}{s.cost ? ` · هزینه ${money(s.cost)}` : ''}</div>
                </div>
              ))}
            </Card>
            <Card title="تولید و خدمات مرتبط" icon={Factory}>
              <div className="space-y-2">
                {data.workOrders.map((w: any) => (
                  <Link key={w.id} to={`/production/work-orders/${w.id}`} className="flex items-center justify-between rounded-xl bg-ink/[0.04] p-3 text-sm hover:bg-ink/[0.07]">
                    <span className="flex items-center gap-2"><Factory size={14} className="text-iris" /><span className="ltr">{w.number}</span> · {num(w.qty)} عدد</span>
                    <WoStagePill stage={w.stage} status={w.status} />
                  </Link>
                ))}
                {data.tickets.map((t: any) => (
                  <Link key={t.id} to={`/service/tickets/${t.id}`} className="flex items-center justify-between rounded-xl bg-ink/[0.04] p-3 text-sm hover:bg-ink/[0.07]">
                    <span className="flex min-w-0 items-center gap-2"><LifeBuoy size={14} className="shrink-0 text-rose" /><span className="truncate">{t.subject}</span></span>
                    <TicketStatusPill status={t.status} />
                  </Link>
                ))}
                {!data.workOrders.length && !data.tickets.length && <p className="text-sm text-mist">موردی وجود ندارد</p>}
              </div>
            </Card>
          </div>

          <Card title="تاریخچه سفارش" icon={History}><Timeline items={history} /></Card>
        </div>

        <div className="space-y-6">
          <Card title="خلاصه مالی" icon={Wallet} actions={o.status !== 'cancelled' && <Button size="sm" variant="action" icon={Plus} onClick={() => setPaying(true)}>ثبت دریافت</Button>}>
            <div className="space-y-2 text-sm">
              <Row label="جمع اقلام" value={money(o.subtotal)} />
              {o.discount > 0 && <Row label="تخفیف" value={`- ${money(o.discount)}`} />}
              <Row label={`مالیات (${num(o.taxRate)}٪)`} value={money(o.total - Math.max(0, o.subtotal - o.discount))} />
              <div className="border-t border-line/60 pt-2"><Row label="مبلغ کل" value={<b className="text-ink">{money(o.total, cur)}</b>} /></div>
              <Row label="دریافتی" value={<span className="text-mint">{money(o.paid)}</span>} />
              <Row label="مانده" value={<span className={o.balance > 0 ? 'text-amber' : 'text-mint'}>{money(o.balance)}</span>} />
              <Progress value={paidPct} color="#0FD69D" className="mt-2" />
              <div className="flex justify-between text-[11px] text-mist"><span>{num(paidPct)}٪ تسویه</span><span>پیش‌پرداخت لازم: {money(depositNeed)}</span></div>
            </div>
            {data.payments.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line/60 pt-3">
                {data.payments.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-mist">{date(p.paidAt)} · {PAYMENT_METHODS[p.method] ?? p.method}</span>
                    <span className="flex items-center gap-1"><span className="num text-ink">{money(p.amount)}</span>
                      {isAdmin && <button className="text-mist hover:text-rose" title="حذف" onClick={async () => (await confirm({ title: 'حذف پرداخت', danger: true, body: `${money(p.amount)} ${cur}` })) && removePayment.mutate(p.id)}>×</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="مشتری و محل تحویل" icon={MapPin}>
            <KV cols={1} items={[
              ['مشتری', <Link to={`/crm/contacts/${o.contactId}`} className="hover:text-iris">{o.contactName}</Link>],
              ['تلفن', o.phones?.[0] ? <a href={`tel:${o.phones[0].value}`} className="ltr inline-flex items-center gap-1"><Phone size={12} />{o.phones[0].value}</a> : '—'],
              ['آدرس', data.address ? [data.address.province, data.address.county, data.address.address].filter(Boolean).join('، ') : '—'],
              ['تحویل تعهدی', <span className={clsx(o.promiseLate && 'text-rose')}>{date(o.promisedAt)}</span>],
              ['کارشناس فروش', userName(o.ownerId)],
            ]} />
            {o.notes && <p className="mt-4 rounded-xl bg-ink/[0.04] p-3 text-sm leading-6 text-frost">{o.notes}</p>}
          </Card>
        </div>
      </div>

      <Modal open={!!blocked} onClose={() => setBlocked(null)} title="کنترل مرحله اجازه عبور نمی‌دهد" icon={ShieldAlert} size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setBlocked(null)}>بستن</Button>
          {blocked?.error.details?.canForce && (
            <Button variant="danger" disabled={!forceNote.trim()} loading={advance.isPending} onClick={() => advance.mutate({ force: true, note: forceNote })}>عبور با مسئولیت مدیر</Button>
          )}
        </>}>
        <ul className="space-y-2">
          {blocked?.error.details?.blockers?.map((b: any, i: number) => (
            <li key={i} className="rounded-xl bg-rose/10 px-3 py-2 text-sm text-frost"><b className="text-rose">{b.stage}:</b> {b.reason}</li>
          ))}
        </ul>
        {blocked?.error.details?.canForce
          ? <Field label="دلیل عبور اجباری (در تاریخچه ثبت می‌شود)" className="mt-4"><Textarea value={forceNote} onChange={(e) => setForceNote(e.target.value)} /></Field>
          : <p className="mt-4 text-xs text-mist">فقط مدیر سیستم می‌تواند با ثبت دلیل از این کنترل عبور کند.</p>}
      </Modal>

      <PaymentModal open={paying} onClose={() => setPaying(false)} orderId={o.id} balance={o.balance} />
      <ShipModal open={shipping} onClose={() => setShipping(false)} orderId={o.id} />
      <OrderFormModal open={editing} onClose={() => setEditing(false)} order={o} lines={data.lines} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-mist">{label}</span><span className="num">{value}</span></div>;
}

function PaymentModal({ open, onClose, orderId, balance }: { open: boolean; onClose: () => void; orderId: string; balance: number }) {
  const [f, setF] = useState<any>({ amount: null, method: 'transfer', reference: '', paidAt: Date.now(), note: '' });
  const save = useAction(() => post(`/orders/${orderId}/payments`, f), { success: 'دریافت وجه ثبت شد', onSuccess: () => { onClose(); setF({ ...f, amount: null, reference: '' }); } });
  return (
    <Modal open={open} onClose={onClose} title="ثبت دریافت وجه" icon={Wallet} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.amount} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت</Button></>}>
      <div className="space-y-4">
        <Field label="مبلغ" hint={<button className="text-iris" onClick={() => setF({ ...f, amount: balance })}>کل مانده: {money(balance)}</button>}><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="روش"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="تاریخ"><DateInput value={f.paidAt} onChange={(v) => setF({ ...f, paidAt: v })} clearable={false} /></Field>
        </div>
        <Field label="شماره پیگیری / چک"><Input className="ltr" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function ShipModal({ open, onClose, orderId }: { open: boolean; onClose: () => void; orderId: string }) {
  const [f, setF] = useState<any>({ carrier: 'تیپاکس', trackingNo: '', cost: null, note: '' });
  const save = useAction(() => post(`/orders/${orderId}/ship`, f), { success: 'ارسال ثبت شد — سریال‌ها از انبار خارج شدند', onSuccess: onClose });
  return (
    <Modal open={open} onClose={onClose} title="ثبت ارسال محموله" subtitle="کالاهای تخصیص‌یافته از انبار خارج و گارانتی دستگاه‌ها فعال می‌شود" icon={Truck} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت ارسال</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="حمل‌کننده"><Input value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} /></Field>
          <Field label="کد رهگیری"><Input className="ltr" value={f.trackingNo} onChange={(e) => setF({ ...f, trackingNo: e.target.value })} /></Field>
        </div>
        <Field label="هزینه حمل (به هزینه‌ها اضافه می‌شود)"><MoneyInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
        <Field label="توضیحات"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
