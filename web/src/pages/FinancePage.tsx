import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, TrendingUp, TrendingDown, HandCoins, Boxes, Percent, Plus, Trash2, Receipt, CreditCard } from 'lucide-react';
import { PAYMENT_METHODS } from '@shared/defaults';
import { del, post } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Field, Input, Modal, MoneyInput, PageHeader, Progress, Select, Spinner, Stat, Tabs, useConfirm } from '../components/ui';
import { DateInput } from '../components/inputs';
import { BarList, GroupedBars, SERIES } from '../components/charts';
import { OrderStagePill } from '../components/domain';
import { compactMoney, date, money, num } from '../lib/format';

export default function FinancePage() {
  const { settings, can } = useSession();
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any>('/finance/summary');
  const { data: expenses = [] } = useApi<any[]>('/expenses');
  const [tab, setTab] = useState<'receivables' | 'expenses' | 'payments'>('receivables');
  const [adding, setAdding] = useState(false);
  const remove = useAction((id: string) => del(`/expenses/${id}`), { success: 'هزینه حذف شد' });
  if (isLoading || !data) return <Spinner />;
  const cur = settings.company.currency;

  return (
    <div className="space-y-6">
      <PageHeader icon={Wallet} title="مالی و هزینه‌ها" subtitle="وصولی، مطالبات، تعهدات خرید، ارزش انبار و حاشیه سود — همه از تراکنش‌های واقعی"
        actions={can('finance') && <Button variant="glow" icon={Plus} onClick={() => setAdding(true)}>ثبت هزینه</Button>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="وصولی این ماه" value={compactMoney(data.revenueMonth)} hint={cur} icon={TrendingUp} tone="mint" />
        <Stat label="هزینه این ماه" value={compactMoney(data.expensesMonth)} hint={cur} icon={TrendingDown} tone="amber" />
        <Stat label="مطالبات" value={compactMoney(data.receivable)} hint={`${num(data.receivables.length)} سفارش`} icon={HandCoins} tone="rose" />
        <Stat label="تعهدات خرید باز" value={compactMoney(data.payable)} hint="سفارش‌های خرید دریافت‌نشده" icon={Receipt} tone="sky" />
        <Stat label="ارزش موجودی انبار" value={compactMoney(data.inventoryValue)} hint="به بهای تمام‌شده" icon={Boxes} tone="iris" />
        <Stat label="حاشیه سود ناخالص" value={`${num(data.grossMargin)}٪`} hint="فروش قطعی در برابر بهای کالا" icon={Percent} tone="lilac" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card title="روند ۶ ماهه" subtitle={`وصولی و هزینه (${cur})`} icon={TrendingUp}>
          <GroupedBars data={data.series} series={[{ key: 'revenue', label: 'وصولی', color: SERIES[0] }, { key: 'expenses', label: 'هزینه‌ها', color: SERIES[1] }]} />
        </Card>
        <Card title="ترکیب هزینه‌ها" subtitle="۶ ماه اخیر" icon={TrendingDown}>
          <BarList rows={data.byCategory.map((c: any) => ({ key: c.category, label: c.category, value: c.total, color: SERIES[1] }))} format={compactMoney} />
        </Card>
      </div>

      <Tabs className="w-fit" value={tab} onChange={setTab} tabs={[
        { key: 'receivables', label: 'مطالبات', count: data.receivables.length },
        { key: 'payments', label: 'دریافتی‌ها' }, { key: 'expenses', label: 'هزینه‌ها', count: expenses.length },
      ]} />
      {tab === 'receivables' && (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>سفارش</th><th>مشتری</th><th>مرحله</th><th>مبلغ کل</th><th>دریافتی</th><th>مانده</th><th>تسویه</th></tr></thead>
            <tbody>{data.receivables.map((r: any) => (
              <tr key={r.id}>
                <td><Link to={`/sales/orders/${r.id}`} className="ltr text-ink hover:text-iris">{r.number}</Link></td>
                <td>{r.contactName}</td><td><OrderStagePill stage={r.stage} status={r.status} /></td>
                <td className="num">{money(r.total)}</td><td className="num text-mist">{money(r.paid)}</td>
                <td className="num font-semibold text-amber">{money(r.total - r.paid)}</td>
                <td className="w-28"><Progress value={(r.paid / r.total) * 100} color="#0FD69D" /></td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {tab === 'payments' && (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>تاریخ</th><th>سفارش</th><th>مشتری</th><th>روش</th><th>مرجع</th><th>مبلغ</th></tr></thead>
            <tbody>{data.payments.map((p: any) => (
              <tr key={p.id}>
                <td className="text-xs text-mist">{date(p.paidAt)}</td>
                <td><Link to={`/sales/orders/${p.orderId}`} className="ltr hover:text-iris">{p.orderNumber}</Link></td>
                <td>{p.contactName}</td>
                <td className="text-xs"><span className="flex items-center gap-1"><CreditCard size={12} />{PAYMENT_METHODS[p.method] ?? p.method}</span></td>
                <td className="ltr text-right text-xs text-mist">{p.reference}</td>
                <td className="num font-semibold text-mint">{money(p.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {tab === 'expenses' && (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>تاریخ</th><th>دسته</th><th>شرح</th><th>ذی‌نفع</th><th>مبلغ</th><th /></tr></thead>
            <tbody>{expenses.map((e) => (
              <tr key={e.id}>
                <td className="text-xs text-mist">{date(e.at)}</td><td className="text-sm">{e.category}</td>
                <td className="text-xs">{e.refType === 'po' ? <Link to={`/scm/purchase-orders/${e.refId}`} className="text-iris">{e.description}</Link> : e.refType === 'order' ? <Link to={`/sales/orders/${e.refId}`} className="text-iris">{e.description}</Link> : e.description}</td>
                <td className="text-xs text-mist">{e.payee}</td>
                <td className="num font-semibold">{money(e.amount)}</td>
                <td>{can('finance') && !e.refType && <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => (await confirm({ title: 'حذف هزینه', danger: true })) && remove.mutate(e.id)} />}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      <ExpenseModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useSession();
  const [f, setF] = useState<any>({ category: settings.expenseCategories[0], amount: null, at: Date.now(), description: '', payee: '' });
  const save = useAction(() => post('/expenses', f), { success: 'هزینه ثبت شد', onSuccess: () => { onClose(); setF({ ...f, amount: null, description: '' }); } });
  return (
    <Modal open={open} onClose={onClose} title="ثبت هزینه" icon={Receipt} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.amount} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت</Button></>}>
      <div className="space-y-4">
        <Field label="دسته"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="مبلغ" hint={settings.company.currency}><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="تاریخ"><DateInput value={f.at} onChange={(v) => setF({ ...f, at: v })} clearable={false} /></Field>
        <Field label="شرح"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="ذی‌نفع"><Input value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
