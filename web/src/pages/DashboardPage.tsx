import { useNavigate, Link } from 'react-router-dom';
import {
  Wallet, ShoppingCart, Flame, Factory, Cpu, HandCoins, LayoutDashboard, BellRing, CalendarClock,
  Activity, Phone, Truck, Wrench, ChevronLeft, Users, Route,
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
import { PRODUCT_FLOW_ICONS } from './ProductFlowPage';

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

  const unitsBy = Object.fromEntries(data.unitsByStatus.map((u: any) => [u.status, u.n]));

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title={`${greet}، ${me.fullName}`}
        subtitle={`${dateLong(Date.now())} — تصویر یکپارچه فروش، تأمین، تولید و خدمات`}
      />

      <section className="glass overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Route size={18} className="text-amber" />
            <div><h2 className="text-sm font-semibold text-ink">فرآیند تأمین محصول</h2><p className="text-[11px] text-mist">از سفارش تا تحویل و پشتیبانی</p></div>
          </div>
          <Link to="/operations/product-flow" className="flex items-center gap-1 text-xs font-medium text-iris hover:text-ink"><span className="hidden sm:inline">مشاهده جزئیات و چک‌لیست‌ها</span><span className="sm:hidden">جزئیات</span> <ChevronLeft size={14} /></Link>
        </div>
        {/* Phones: the process reads as a two-column numbered timeline (1–4 then 5–8) */}
        <div
          className="grid grid-flow-col grid-cols-2 gap-x-4 px-4 py-2.5 md:hidden"
          style={{ gridTemplateRows: `repeat(${Math.ceil(settings.productFlow.length / 2)}, auto)` }}
        >
          {settings.productFlow.map((step, index) => {
            const perColumn = Math.ceil(settings.productFlow.length / 2);
            const next = settings.productFlow[index + 1];
            const lastInColumn = (index + 1) % perColumn === 0 || !next;
            return (
              <Link key={step.id} to={step.to} className="relative flex min-w-0 items-start gap-2.5 py-1.5 transition active:opacity-70">
                {!lastInColumn && <span className="absolute -bottom-5 right-[13px] top-5 w-0.5 rounded-full" style={{ background: `linear-gradient(${step.color}99, ${next.color}99)` }} />}
                <span className="num relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-night shadow-[0_0_0_3px_#283840]" style={{ background: step.color }}>{index + 1}</span>
                <span className="min-w-0">
                  <span className="mt-0.5 block text-[13px] font-semibold leading-[1.4] text-ink">{step.title}</span>
                  <span className="block truncate text-[10.5px] leading-4 text-mist">{step.owner}</span>
                </span>
              </Link>
            );
          })}
        </div>
        <div className="hidden gap-px bg-line/40 md:grid md:grid-cols-3 xl:grid-cols-6">
          {settings.productFlow.map((step, index) => {
            const StepIcon = PRODUCT_FLOW_ICONS[step.icon];
            return <Link key={step.id} to={step.to} className="group relative min-h-[128px] bg-deep/65 p-3 transition hover:bg-ink/[0.06]">
              <div className="flex items-center justify-between">
                <span className="num flex h-7 w-7 items-center justify-center rounded-xl text-xs font-extrabold text-night" style={{ background: step.color }}>{index + 1}</span>
                <StepIcon size={17} style={{ color: step.color }} />
              </div>
              <h3 className="mt-3 text-xs font-semibold leading-5 text-ink">{step.title}</h3>
              <p className="mt-1 text-[10px] leading-5 text-mist">{step.owner}</p>
            </Link>;
          })}
        </div>
      </section>

      <div className="stat-rail grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="وصولی این ماه" value={compactMoney(k.revenueMonth)} hint={`فروش قطعی ماه: ${compactMoney(k.bookedMonth)} ${cur}`} icon={Wallet} tone="mint" onClick={() => navigate('/finance')} />
        <Stat label="فروش‌های باز" value={num(k.openOrders)} hint={`ارزش: ${compactMoney(k.openOrdersValue)} ${cur}`} icon={ShoppingCart} tone="lilac" alert={k.lateOrders > 0} onClick={() => navigate('/sales/orders')} />
        <Stat label="مطالبات" value={compactMoney(k.receivable)} hint={`${cur} — مانده حساب مشتریان`} icon={HandCoins} tone="amber" onClick={() => navigate('/finance')} />
        <Stat label="سرنخ‌های داغ" value={num(k.hotLeads)} hint={`${num(k.warmLeads)} گرم · ${num(k.newLeadsMonth)} سرنخ جدید این ماه`} icon={Flame} tone="rose" onClick={() => navigate('/crm/leads')} />
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-[1.25fr_1fr]">
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

      <div className="grid gap-4 md:gap-6 xl:grid-cols-[1.4fr_1fr]">
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

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <Card title="سفارش‌های فروش در هر مرحله" subtitle={`ارزش سفارش‌های مشتریان (${cur})`} icon={ShoppingCart}>
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
              <Link to={it.to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-ink/[0.05] active:bg-ink/[0.07] md:py-1.5">
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
