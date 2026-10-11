import { useNavigate, Link } from 'react-router-dom';
import {
  Wallet, ShoppingCart, Flame, Factory, Package, Cpu, LifeBuoy, HandCoins, LayoutDashboard, BellRing, CalendarClock,
  Activity, Phone, Truck, Wrench, ChevronLeft, Users, FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Card, Empty, PageHeader, Spinner, Stat } from '../components/ui';
import { BarList, GroupedBars, SERIES, StackStrip } from '../components/charts';
import { AlertRow } from '../components/Shell';
import { Timeline } from '../components/flow';
import { UNIT_STATUS } from '@shared/defaults';
import { compactMoney, dateLong, dateTime, isolateCodes, num, relative } from '../lib/format';

const ENTITY_LINK: Record<string, (id: string) => string> = {
  contact: (id) => `/crm/contacts/${id}`,
  order: (id) => `/sales/orders/${id}`,
  po: (id) => `/scm/purchase-orders/${id}`,
  work_order: (id) => `/production/work-orders/${id}`,
  ticket: (id) => `/service/tickets/${id}`,
  item: (id) => `/inventory/items/${id}`,
};

const ENTITY_COLOR: Record<string, string> = {
  contact: '#779BE7', order: '#B48CF2', po: '#5EC8E5', work_order: '#F5B85A', ticket: '#FF499E', item: '#C2DFE3',
};

export default function DashboardPage() {
  const { data, isLoading } = useApi<any>('/dashboard');
  const { me, settings } = useSession();
  const navigate = useNavigate();
  if (isLoading || !data) return <Spinner />;
  const k = data.kpis;
  const cur = settings.company.currency;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روز بخیر' : 'عصر بخیر';

  /* The whole business as one flow — the idea behind the product's name. */
  const unitsBy = Object.fromEntries(data.unitsByStatus.map((u: any) => [u.status, u.n]));
  const flow = [
    { label: 'سرنخ فعال', value: data.funnel.filter((f: any) => !f.final).reduce((s: number, f: any) => s + f.count, 0), icon: Users, to: '/crm/pipeline', color: '#9DB4C0' },
    { label: 'پیش‌فاکتور باز', value: k.quotes, icon: FileText, to: '/sales/orders?stage=quote', color: '#C2DFE3' },
    { label: 'سفارش در جریان', value: k.openOrders - k.quotes, icon: ShoppingCart, to: '/sales/orders', color: '#B48CF2' },
    { label: 'در حال تولید', value: k.wip, icon: Factory, to: '/production/work-orders', color: '#779BE7' },
    { label: 'آماده در انبار', value: k.readyStock + (unitsBy.reserved ?? 0), icon: Package, to: '/units?status=in_stock', color: '#5EC8E5' },
    { label: 'در مسیر / نصب', value: unitsBy.shipped ?? 0, icon: Truck, to: '/units?status=shipped', color: '#F5B85A' },
    { label: 'نزد مشتری', value: k.installedBase, icon: Cpu, to: '/units?status=installed', color: '#0FD69D' },
    { label: 'تیکت باز', value: k.openTickets, icon: LifeBuoy, to: '/service/tickets', color: '#FF499E' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title={`${greet}، ${me.fullName}`}
        subtitle={`${dateLong(Date.now())} — تصویر یکپارچه فروش، تأمین، تولید و خدمات`}
      />

      <section className="glass overflow-x-auto p-4">
        <div className="flex min-w-[880px] items-stretch">
          {flow.map((f, i) => (
            <div key={f.label} className="flex flex-1 items-center">
              <button onClick={() => navigate(f.to)} className="group flex w-full min-w-[92px] flex-col items-center gap-2 rounded-xl px-2 py-2 text-center transition hover:bg-ink/[0.05]">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl transition group-hover:scale-105" style={{ background: `${f.color}26`, color: f.color }}>
                  <f.icon size={20} />
                </span>
                <span className="num text-xl font-bold text-ink">{num(f.value)}</span>
                <span className="text-[11px] text-mist">{f.label}</span>
              </button>
              {i < flow.length - 1 && <ChevronLeft size={18} className="mx-1 shrink-0 text-slate" />}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="وصولی این ماه" value={compactMoney(k.revenueMonth)} hint={`فروش قطعی ماه: ${compactMoney(k.bookedMonth)} ${cur}`} icon={Wallet} tone="mint" onClick={() => navigate('/finance')} />
        <Stat label="سفارش‌های باز" value={num(k.openOrders)} hint={`ارزش: ${compactMoney(k.openOrdersValue)} ${cur}`} icon={ShoppingCart} tone="lilac" alert={k.lateOrders > 0} onClick={() => navigate('/sales/orders')} />
        <Stat label="مطالبات" value={compactMoney(k.receivable)} hint={`${cur} — مانده حساب مشتریان`} icon={HandCoins} tone="amber" onClick={() => navigate('/finance')} />
        <Stat label="سرنخ‌های داغ" value={num(k.hotLeads)} hint={`${num(k.warmLeads)} گرم · ${num(k.newLeadsMonth)} سرنخ جدید این ماه`} icon={Flame} tone="rose" onClick={() => navigate('/crm/leads')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card title="نیاز به اقدام" subtitle="استثناهای همه ماژول‌ها در یک فهرست" icon={BellRing} pad={false} bodyClass="p-2">
          {data.alerts.length === 0
            ? <Empty title="همه‌چیز طبق برنامه است" hint="هیچ تأخیر، کسری یا نقض SLA فعالی وجود ندارد." />
            : data.alerts.map((a: any) => <AlertRow key={a.id} alert={a} onClick={() => navigate(a.link)} />)}
        </Card>

        <Card title="برنامه امروز و این هفته" icon={CalendarClock}>
          <div className="space-y-5">
            <AgendaBlock title="پیگیری‌های امروز" icon={Phone} empty="پیگیری سررسیدی ندارید" items={data.agenda.followups.map((f: any) => ({
              id: f.id, to: `/crm/contacts/${f.contactId}`, title: f.contactName, sub: f.note || 'پیگیری', when: f.dueAt, late: f.dueAt < Date.now(),
            }))} />
            <AgendaBlock title="نصب و بازدیدهای پیش‌رو" icon={Wrench} empty="نصبی برنامه‌ریزی نشده" items={data.agenda.installations.map((t: any) => ({
              id: t.id, to: `/service/tickets/${t.id}`, title: t.contactName ?? t.subject, sub: t.subject, when: t.scheduledAt,
            }))} />
            <AgendaBlock title="محموله‌های خرید در راه" icon={Truck} empty="محموله‌ای در راه نیست" items={data.agenda.deliveries.map((p: any) => ({
              id: p.id, to: `/scm/purchase-orders/${p.id}`, title: `${p.number} — ${p.supplierName}`, sub: 'تاریخ تحویل', when: p.expectedAt, late: p.expectedAt < Date.now(),
            }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="جریان نقدی ماهانه" subtitle={`وصولی در برابر هزینه‌ها (${cur})`} icon={Wallet}>
          <GroupedBars
            data={data.series}
            series={[{ key: 'revenue', label: 'وصولی', color: SERIES[0] }, { key: 'expenses', label: 'هزینه‌ها', color: SERIES[1] }]}
          />
        </Card>
        <Card title="قیف مشتریان" subtitle="تعداد مخاطب در هر مرحله" icon={Users}>
          <BarList
            rows={data.funnel.map((f: any) => ({ key: f.key, label: f.label, value: f.count, color: f.color }))}
            onClick={(key) => navigate(`/crm/contacts?stage=${key}`)}
          />
          <div className="mt-4 flex justify-between border-t border-line/60 pt-3 text-xs text-mist">
            <span>تبدیل به مشتری این ماه: <b className="num text-ink">{num(k.conversionsMonth)}</b></span>
            <span>رضایت مشتری: <b className="num text-ink">{k.csat ? `${num(k.csat, 1)} از ۵` : '—'}</b></span>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="سفارش‌ها در هر مرحله" subtitle={`ارزش سفارش‌های باز (${cur})`} icon={ShoppingCart}>
          <BarList
            rows={data.pipelineStages.filter((s: any) => !s.final).map((s: any) => ({ key: s.key, label: s.label, value: s.value, color: s.color, hint: `(${num(s.count)})` }))}
            format={compactMoney}
            onClick={(key) => navigate(`/sales/orders?stage=${key}`)}
          />
        </Card>
        <Card title="وضعیت دستگاه‌ها" subtitle="همه شماره‌سریال‌های ساخته‌شده" icon={Cpu}>
          <StackStrip parts={Object.entries(UNIT_STATUS).map(([key, s]) => ({ key, label: s.label, color: s.color, value: unitsBy[key] ?? 0 }))} />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line/60 pt-3 text-center">
            <Link to="/production/work-orders" className="rounded-xl bg-ink/[0.04] p-2 hover:bg-ink/[0.07]">
              <div className="num text-lg font-bold">{num(k.wip)}</div><div className="text-[11px] text-mist">در خط تولید</div>
            </Link>
            <Link to="/scm/purchase-orders" className="rounded-xl bg-ink/[0.04] p-2 hover:bg-ink/[0.07]">
              <div className={clsx('num text-lg font-bold', k.delayedPos && 'text-rose')}>{num(k.delayedPos)}</div><div className="text-[11px] text-mist">خرید با تأخیر</div>
            </Link>
          </div>
        </Card>
        <Card title="آخرین رویدادها" icon={Activity}>
          <div className="max-h-[300px] overflow-y-auto pl-1">
            <Timeline items={data.activity.map((a: any) => ({
              id: a.id, at: a.at, color: ENTITY_COLOR[a.entityType] ?? '#5C6B73',
              title: ENTITY_LINK[a.entityType]
                ? <Link to={ENTITY_LINK[a.entityType](a.entityId)} className="hover:text-iris">{isolateCodes(a.summary)}</Link>
                : isolateCodes(a.summary),
              meta: `${a.userName ?? 'سیستم'} · ${dateTime(a.at)}`,
            }))} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function AgendaBlock({ title, icon: Icon, items, empty }: {
  title: string; icon: any; empty: string; items: { id: string; to: string; title: string; sub: string; when: number; late?: boolean }[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-mist"><Icon size={14} />{title}</div>
      {items.length === 0 ? <p className="text-xs text-mist/70">{empty}</p> : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <Link to={it.to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/[0.05]">
                <span className="min-w-0"><span className="block truncate text-ink">{isolateCodes(it.title)}</span><span className="block truncate text-xs text-mist">{it.sub}</span></span>
                <span className={clsx('shrink-0 text-xs', it.late ? 'text-rose' : 'text-mist')}>{relative(it.when)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
