import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Cpu, Wrench, Upload, StickyNote, Trash2, Factory, ShoppingCart, MapPin, Phone, ClipboardCheck, PackageCheck, Truck,
  CheckCircle2, XCircle, Hammer, Bookmark, Unlink, Ticket, Box, History,
} from 'lucide-react';
import clsx from 'clsx';
import { post, put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, KV, PageHeader, Spinner, useConfirm } from '../../components/ui';
import { TicketStatusPill, UnitStatusPill, WarrantyBadge } from '../../components/domain';
import { Timeline } from '../../components/flow';
import { date, dateTime, num } from '../../lib/format';

const EVENT_STYLE: Record<string, { color: string; icon: any }> = {
  created: { color: '#779BE7', icon: Factory }, firmware: { color: '#B48CF2', icon: Upload }, qc_pass: { color: '#0FD69D', icon: CheckCircle2 },
  assembly: { color: '#779BE7', icon: Wrench }, packaging: { color: '#C2DFE3', icon: PackageCheck }, step_reopened: { color: '#F5B85A', icon: History },
  qc_fail: { color: '#FF499E', icon: XCircle }, stocked: { color: '#C2DFE3', icon: Box }, reserved: { color: '#F5B85A', icon: Bookmark },
  released: { color: '#9DB4C0', icon: Unlink }, shipped: { color: '#5EC8E5', icon: Truck }, installed: { color: '#0FD69D', icon: PackageCheck },
  repair: { color: '#B48CF2', icon: Hammer }, repaired: { color: '#0FD69D', icon: Wrench }, ticket: { color: '#FF499E', icon: Ticket },
  scrapped: { color: '#5C6B73', icon: Trash2 }, note: { color: '#9DB4C0', icon: StickyNote },
};

/**
 * The device passport: "a customer calls six months later" — from the serial
 * alone you see when it was built, with which parts and firmware, who bought
 * it, when it was installed, its warranty and its full service history.
 */
export default function UnitPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { settings } = useSession();
  const { data, isLoading, error } = useApi<any>(`/units/${encodeURIComponent(key!)}`);
  const update = useAction((body: any) => put(`/units/${data.unit.id}`, body), { success: 'شناسنامه دستگاه به‌روز شد' });
  const addNote = useAction((summary: string) => post(`/units/${data.unit.id}/events`, { summary }), { success: 'یادداشت ثبت شد' });

  if (isLoading) return <Spinner />;
  if (error || !data) return <Card><Empty icon={Cpu} title="شماره سریال پیدا نشد" hint={<span className="ltr">{key}</span>} /></Card>;
  const u = data.unit;
  const atCustomer = ['installed', 'shipped', 'in_repair'].includes(u.status);

  return (
    <div className="space-y-6">
      <PageHeader icon={Cpu}
        title={<span className="flex items-center gap-3"><span className="ltr font-mono">{u.serial}</span><UnitStatusPill status={u.status} /></span>}
        subtitle={<span className="flex flex-wrap items-center gap-3">{u.itemName}{atCustomer && <WarrantyBadge until={u.warrantyUntil} />}</span>}
        actions={<>
          <Button variant="ghost" icon={StickyNote} onClick={async () => { const t = await confirm({ title: 'افزودن یادداشت به شناسنامه', input: { label: 'یادداشت', required: true } }); if (t) addNote.mutate(t); }}>یادداشت</Button>
          <Button variant="outline" icon={Upload} onClick={async () => { const v = await confirm({ title: 'ثبت به‌روزرسانی فریمور', input: { label: 'نسخه جدید', placeholder: '3.3.0', required: true } }); if (v) update.mutate({ fwVersion: v }); }}>به‌روزرسانی فریمور</Button>
          {['in_stock', 'qc_failed', 'in_production'].includes(u.status) && (
            <Button variant="danger" icon={Trash2} onClick={async () => { const r = await confirm({ title: 'اسقاط دستگاه', danger: true, input: { label: 'دلیل', required: true } }); if (r) update.mutate({ status: 'scrapped', reason: r }); }} />
          )}
          {atCustomer && <Button variant="glow" icon={Wrench} onClick={() => navigate(`/service/tickets?new=1&unit=${u.id}`)}>تیکت خدمات</Button>}
        </>} />

      <div className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        {[
          { icon: Factory, label: 'ساخت', value: date(u.builtAt ?? u.createdAt), sub: u.workOrderNumber, to: u.workOrderId && `/production/work-orders/${u.workOrderId}` },
          { icon: ShoppingCart, label: 'فروش', value: u.orderNumber ?? '—', sub: u.contactName, to: u.orderId && `/sales/orders/${u.orderId}` },
          { icon: Truck, label: 'ارسال / نصب', value: date(u.installedAt ?? u.shippedAt), sub: u.installedAt ? 'نصب‌شده' : u.shippedAt ? 'ارسال‌شده' : '' },
          { icon: ClipboardCheck, label: 'گارانتی تا', value: date(u.warrantyUntil), sub: `${num(u.warrantyMonths ?? settings.company.warrantyMonths)} ماهه` },
        ].map((b) => {
          const body = (
            <div className="glass flex h-full items-center gap-2.5 px-3 py-2.5 transition hover:border-iris/30 md:gap-3 md:p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-iris/15 text-iris md:h-10 md:w-10 md:rounded-xl"><b.icon size={16} /></span>
              <div className="min-w-0"><div className="text-[11.5px] text-mist md:text-xs">{b.label}</div><div className="ltr truncate text-right text-[13.5px] font-semibold md:text-base">{b.value}</div>{b.sub && <div className="truncate text-[11px] text-mist">{b.sub}</div>}</div>
            </div>
          );
          return b.to ? <Link key={b.label} to={b.to}>{body}</Link> : <div key={b.label}>{body}</div>;
        })}
      </div>

      <Card title="روند آماده‌سازی این دستگاه" subtitle="مراحل اجباری ثبت‌شده برای همین شماره‌سریال" icon={Factory}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { key: 'firmware', label: 'آماده‌سازی نرم‌افزار', icon: Upload },
            { key: 'assembly', label: 'مونتاژ', icon: Wrench },
            { key: 'testing', label: 'تست و QC', icon: ClipboardCheck },
            { key: 'packaging', label: 'بسته‌بندی', icon: PackageCheck },
          ].map((step, index) => {
            const record = (data.processSteps ?? []).find((s: any) => s.step === step.key);
            const done = step.key === 'testing' ? u.qcResult === 'pass' : !!record;
            return <div key={step.key} className={clsx('relative rounded-xl border p-3', done ? 'border-mint/35 bg-mint/[0.07]' : 'border-line/60 bg-ink/[0.025]')}>
              <div className="flex items-center gap-2"><span className={clsx('flex h-8 w-8 items-center justify-center rounded-xl', done ? 'bg-mint/15 text-mint' : 'bg-ink/[0.05] text-mist')}>{done ? <CheckCircle2 size={16} /> : <step.icon size={16} />}</span><div><div className="text-xs font-semibold text-ink">{step.label}</div><div className="text-[10px] text-mist">مرحله {num(index + 1)}</div></div></div>
              <div className={clsx('mt-3 text-[11px]', done ? 'text-mint' : 'text-mist')}>{done ? `تکمیل شده${record?.userName ? ` · ${record.userName}` : ''}` : 'در انتظار انجام'}</div>
            </div>;
          })}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card title="چرخه عمر دستگاه" subtitle="همه رویدادها از تولید تا امروز" icon={Cpu}>
          <Timeline items={[...data.events].reverse().map((e: any) => {
            const st = EVENT_STYLE[e.kind] ?? EVENT_STYLE.note;
            const link = e.refType === 'order' ? `/sales/orders/${e.refId}` : e.refType === 'work_order' ? `/production/work-orders/${e.refId}` : e.refType === 'ticket' ? `/service/tickets/${e.refId}` : null;
            return {
              id: e.id, at: e.at, color: st.color,
              title: <span className="flex items-center gap-2"><st.icon size={14} style={{ color: st.color }} />{link ? <Link to={link} className="hover:text-iris">{e.summary}</Link> : e.summary}</span>,
              meta: `${e.userName ?? 'سیستم'} · ${dateTime(e.at)}`,
            };
          })} />
        </Card>
        <div className="space-y-6">
          <Card title="مشخصات فنی">
            <KV cols={1} items={[
              ['محصول', <Link to={`/inventory/items/${u.itemId}`} className="hover:text-iris">{u.itemName}</Link>],
              ['کد کالا', <span className="ltr">{u.sku}</span>],
              ['نسخه سخت‌افزار', <span className="ltr">{u.hwRev || '—'}</span>],
              ['نسخه فریمور', <span className="ltr">{u.fwVersion || '—'}</span>],
              ['نتیجه QC', u.qcResult === 'pass' ? <span className="text-mint">قبول</span> : u.qcResult === 'fail' ? <span className="text-rose">مردود</span> : '—'],
              ['محل فعلی', u.warehouseName ?? u.contactName ?? '—'],
            ]} />
          </Card>
          {u.contactId && (
            <Card title="مشتری و محل نصب" icon={MapPin}>
              <KV cols={1} items={[
                ['مشتری', <Link to={`/crm/contacts/${u.contactId}`} className="hover:text-iris">{u.contactName}</Link>],
                ['تلفن', u.contactPhones?.[0] ? <a href={`tel:${u.contactPhones[0].value}`} className="ltr inline-flex items-center gap-1"><Phone size={12} />{u.contactPhones[0].value}</a> : '—'],
                ['آدرس', data.address ? [data.address.province, data.address.county, data.address.address].filter(Boolean).join('، ') : '—'],
              ]} />
            </Card>
          )}
          <Card title="سوابق خدمات" icon={Wrench}>
            {data.tickets.length === 0 ? <p className="text-sm text-mist">تیکتی برای این دستگاه ثبت نشده</p> : (
              <ul className="space-y-2">{data.tickets.map((t: any) => (
                <li key={t.id}><Link to={`/service/tickets/${t.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-ink/[0.04] p-3 text-sm hover:bg-ink/[0.07]">
                  <span className="min-w-0"><span className="block truncate">{t.subject}</span><span className="text-[11px] text-mist">{date(t.createdAt)}</span></span><TicketStatusPill status={t.status} />
                </Link></li>
              ))}</ul>
            )}
          </Card>
          <Card title="قطعات به‌کاررفته (BOM)" icon={Box}>
            <ul className="space-y-1 text-sm">{data.components.map((c: any) => (
              <li key={c.sku} className="flex justify-between text-frost"><span>{c.name}</span><span className="num text-mist">×{num(c.qty)}</span></li>
            ))}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
