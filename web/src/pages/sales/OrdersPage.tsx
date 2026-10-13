import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, FilePlus2, Rows3, Columns3, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, PageHeader, Progress, SearchBox, Select, Spinner, Stat, Tabs } from '../../components/ui';
import { OrderStagePill, PriorityPill } from '../../components/domain';
import { OrderFormModal } from '../../components/orders';
import { compactMoney, date, money, num, relative } from '../../lib/format';

export default function OrdersPage() {
  const { settings } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data = [], isLoading } = useApi<any[]>('/orders');
  const [status, setStatus] = useState<'open' | 'done' | 'cancelled' | 'all'>('open');
  const [view, setView] = useState<'table' | 'board'>('table');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<string | null | false>(false);
  const stage = params.get('stage') ?? '';
  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(params.get('contact'));
      params.delete('new'); params.delete('contact'); setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const orders = useMemo(() => data.filter((o) =>
    (status === 'all' || o.status === status) && (!stage || o.stage === stage)
    && (!search || `${o.number} ${o.contactName} ${o.summary}`.includes(search))), [data, status, stage, search]);
  const open = data.filter((o) => o.status === 'open');
  const cur = settings.company.currency;
  const boardStages = settings.orderStages.filter((s) => !s.final);

  return (
    <div>
      <PageHeader
        icon={ShoppingCart}
        title="سفارش‌های فروش"
        subtitle="سفارش‌های دریافتی از مشتری؛ از پیش‌فاکتور تا تحویل و نصب"
        actions={<Button variant="glow" icon={FilePlus2} onClick={() => setCreating(null)}>پیش‌فاکتور جدید</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="پیش‌فاکتورهای باز" value={num(open.filter((o) => o.stage === 'quote').length)} hint={`${compactMoney(open.filter((o) => o.stage === 'quote').reduce((s, o) => s + o.total, 0))} ${cur}`} tone="sky" />
        <Stat label="فروش در جریان" value={num(open.filter((o) => o.stage !== 'quote').length)} hint={`${compactMoney(open.filter((o) => o.stage !== 'quote').reduce((s, o) => s + o.total, 0))} ${cur}`} tone="lilac" />
        <Stat label="با تأخیر" value={num(open.filter((o) => o.late).length)} hint="عبور از SLA مرحله یا موعد تحویل" tone="rose" alert={open.some((o) => o.late)} />
        <Stat label="مانده دریافتی سفارش‌های باز" value={compactMoney(open.filter((o) => o.stage !== 'quote').reduce((s, o) => s + o.balance, 0))} hint={cur} tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={status} onChange={setStatus} tabs={[
          { key: 'open', label: 'باز', count: open.length },
          { key: 'done', label: 'تحویل‌شده', count: data.filter((o) => o.status === 'done').length },
          { key: 'cancelled', label: 'لغو‌شده', count: data.filter((o) => o.status === 'cancelled').length },
          { key: 'all', label: 'همه' },
        ]} />
        <Select className="w-48" value={stage} onChange={(e) => { if (e.target.value) params.set('stage', e.target.value); else params.delete('stage'); setParams(params); }}>
          <option value="">همه مراحل</option>
          {settings.orderStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
        <SearchBox value={search} onChange={setSearch} placeholder="شماره، مشتری، کالا…" className="min-w-[200px] flex-1" />
        <div className="flex rounded-xl border border-line/70 p-0.5">
          <Button size="sm" variant={view === 'table' ? 'action' : 'ghost'} icon={Rows3} onClick={() => setView('table')} aria-label="جدول" />
          <Button size="sm" variant={view === 'board' ? 'action' : 'ghost'} icon={Columns3} onClick={() => setView('board')} aria-label="بورد" />
        </div>
      </div>

      {isLoading ? <Spinner /> : orders.length === 0 ? <Card><Empty icon={ShoppingCart} title="سفارشی یافت نشد" /></Card> : view === 'table' ? (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>شماره</th><th>مشتری</th><th>اقلام</th><th>مرحله</th><th>پیشرفت</th><th>مبلغ</th><th>پرداخت</th><th>تحویل تعهدی</th><th>اولویت</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/sales/orders/${o.id}`)}>
                  <td className="ltr whitespace-nowrap text-right font-medium text-ink">{o.number}</td>
                  <td><div className="text-ink">{o.contactName}</div><div className="text-xs text-mist">{o.fulfillment === 'mto' ? 'تولید سفارشی' : 'از موجودی'}</div></td>
                  <td className="max-w-[240px] truncate text-xs text-frost" title={o.summary}>{o.summary}</td>
                  <td>
                    <div className="flex items-center gap-1.5"><OrderStagePill stage={o.stage} status={o.status} />{o.late && <AlertTriangle size={14} className="text-rose" />}</div>
                    {o.status === 'open' && <div className={clsx('mt-1 text-[11px]', o.stageLate ? 'text-rose' : 'text-mist')}>{num(o.daysInStage, 1)} روز در این مرحله</div>}
                  </td>
                  <td className="w-28"><Progress value={o.status === 'done' ? 100 : o.progress} color={o.late ? '#FF499E' : '#779BE7'} /></td>
                  <td className="num whitespace-nowrap">{money(o.total)}</td>
                  <td className="w-28">
                    <Progress value={o.total ? (o.paid / o.total) * 100 : 0} color="#0FD69D" />
                    <div className="num mt-1 text-[11px] text-mist">{num(o.total ? (o.paid / o.total) * 100 : 0)}٪</div>
                  </td>
                  <td className={clsx('whitespace-nowrap text-xs', o.promiseLate ? 'text-rose' : 'text-mist')}>{o.promisedAt ? `${date(o.promisedAt)}` : '—'}</td>
                  <td><PriorityPill priority={o.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {boardStages.map((s) => {
            const col = orders.filter((o) => o.stage === s.key && o.status === 'open');
            return (
              <div key={s.key} className="glass w-[260px] shrink-0">
                <div className="flex items-center justify-between border-b border-line/60 px-4 py-3" style={{ boxShadow: `inset 0 3px 0 ${s.color}` }}>
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="num text-xs text-mist">{num(col.length)} · {compactMoney(col.reduce((a, o) => a + o.total, 0))}</span>
                </div>
                <div className="flex min-h-[160px] flex-col gap-2 p-3">
                  {col.map((o) => (
                    <Link key={o.id} to={`/sales/orders/${o.id}`} className={clsx('rounded-xl border bg-deep/70 p-3 transition hover:border-iris/40', o.late ? 'border-rose/40' : 'border-white/[0.06]')}>
                      <div className="flex items-center justify-between"><span className="ltr text-xs font-semibold text-ink">{o.number}</span><PriorityPill priority={o.priority} /></div>
                      <div className="mt-1 truncate text-sm text-frost">{o.contactName}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-mist">
                        <span className="num">{compactMoney(o.total)}</span>
                        <span className={clsx(o.stageLate && 'text-rose')}>{relative(o.stageEnteredAt)}</span>
                      </div>
                    </Link>
                  ))}
                  {col.length === 0 && <div className="py-6 text-center text-xs text-mist">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <OrderFormModal open={creating !== false} onClose={() => setCreating(false)} defaultContact={creating || null} onSaved={(id) => navigate(`/sales/orders/${id}`)} />
    </div>
  );
}
