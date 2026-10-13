import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Truck, PackagePlus, Plus, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, Field, Input, ListCard, Modal, MoneyInput, PageHeader, Progress, Spinner, Stat, Tabs, Textarea } from '../../components/ui';
import { DateInput, Picker } from '../../components/inputs';
import { ItemPicker, PoStatusPill } from '../../components/domain';
import { compactMoney, date, money, num } from '../../lib/format';

export default function PurchaseOrdersPage() {
  const { settings } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data = [], isLoading } = useApi<any[]>('/purchase-orders');
  const { data: items = [] } = useApi<any[]>('/items');
  const [tab, setTab] = useState<'open' | 'received' | 'all'>('open');
  const [creating, setCreating] = useState<any[] | null>(null);
  useEffect(() => { if (params.get('new') === '1') { setCreating([]); params.delete('new'); setParams(params, { replace: true }); } }, [params, setParams]);

  const reorder = items.filter((i) => i.needsReorder && i.kind !== 'service');
  const list = data.filter((p) => tab === 'all' || (tab === 'open' ? !['received', 'cancelled'].includes(p.status) : p.status === 'received'));
  const openPos = data.filter((p) => ['sent', 'confirmed', 'in_transit', 'partial'].includes(p.status));

  return (
    <div>
      <PageHeader
        icon={Truck}
        title="سفارش‌های خرید"
        subtitle="خریدهای ثبت‌شده توسط ما برای تأمین کالا و قطعات؛ از سفارش تا رسید انبار"
        fab={{ label: 'سفارش خرید جدید', icon: PackagePlus, onClick: () => setCreating([]) }}
      />
      <div className="stat-rail mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="خریدهای در جریان" value={num(openPos.length)} hint={`${compactMoney(openPos.reduce((s, p) => s + p.total, 0))} ${settings.company.currency}`} tone="sky" />
        <Stat label="محموله‌های با تأخیر" value={num(data.filter((p) => p.delayed).length)} hint="عبور از تاریخ تحویل" tone="rose" alert={data.some((p) => p.delayed)} />
        <Stat label="پیش‌نویس" value={num(data.filter((p) => p.status === 'draft').length)} hint="هنوز ارسال نشده" tone="iris" />
        <Stat label="کالای زیر نقطه سفارش" value={num(reorder.length)} hint="نیازمند خرید" tone="amber" />
      </div>

      {reorder.length > 0 && (
        <Card className="mb-5" title="پیشنهاد خرید هوشمند" subtitle="کالاهایی که موجودی آزاد + در راه آن‌ها به نقطه سفارش رسیده" icon={Sparkles}
          actions={<Button size="sm" variant="action" icon={PackagePlus} onClick={() => setCreating(reorder)} className="w-full md:w-auto">ایجاد سفارش برای همه</Button>}>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {reorder.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.04] px-3 py-2 text-sm">
                <div className="min-w-0"><div className="truncate text-ink">{i.name}</div><div className="text-[11px] text-mist">{i.supplierName ?? 'بدون تأمین‌کننده'}</div></div>
                <div className="text-left text-xs">
                  <div className={clsx('num', i.available <= 0 ? 'text-rose' : 'text-amber')}>آزاد {num(i.available)}</div>
                  <div className="num text-mist">نقطه سفارش {num(i.reorderPoint)}</div>
                </div>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => setCreating([i])} title="سفارش" />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Tabs className="mb-4 w-full md:w-fit" value={tab} onChange={setTab} tabs={[
        { key: 'open', label: 'در جریان', count: data.filter((p) => !['received', 'cancelled'].includes(p.status)).length },
        { key: 'received', label: 'دریافت‌شده' }, { key: 'all', label: 'همه' },
      ]} />
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={Truck} title="سفارش خریدی وجود ندارد" /></Card> : (<>
        <div className="space-y-2.5 md:hidden">
          {list.map((p) => {
            const received = p.qtyTotal ? (p.qtyReceived / p.qtyTotal) * 100 : 0;
            return (
              <ListCard key={p.id} to={`/scm/purchase-orders/${p.id}`} accent={p.delayed ? '#FF499E' : undefined}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-ink">{p.supplierName}</div>
                    <div className="ltr mt-0.5 text-right text-xs font-medium text-mist">{p.number}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">{p.delayed && <AlertTriangle size={15} className="text-rose" />}<PoStatusPill status={p.status} /></div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="num text-[17px] font-extrabold text-ink">{compactMoney(p.total)} <span className="text-[11px] font-medium text-mist">{settings.company.currency}</span></div>
                  <div className={clsx('text-left text-[11px]', p.delayed ? 'text-rose' : 'text-mist')}>
                    تحویل {date(p.expectedAt)}{p.delayed && <div>{num(p.delayDays)} روز تأخیر</div>}
                  </div>
                </div>
                <div className="mt-3 border-t border-line/50 pt-3">
                  <div className="mb-1.5 flex justify-between text-[11px] text-mist"><span>دریافت کالا</span><span className="num">{num(received)}٪</span></div>
                  <Progress value={received} color="#0FD69D" />
                </div>
                {(p.shippingMethod || p.trackingNo) && <div className="mt-2 text-[11px] text-mist">{p.shippingMethod}{p.trackingNo && <span className="ltr mr-1">{p.trackingNo}</span>}</div>}
              </ListCard>
            );
          })}
        </div>
        <Card pad={false} bodyClass="overflow-x-auto" className="hidden md:block">
          <table className="tbl">
            <thead><tr><th>شماره</th><th>تأمین‌کننده</th><th>وضعیت</th><th>مبلغ</th><th>دریافت</th><th>تاریخ تحویل</th><th>حمل</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/scm/purchase-orders/${p.id}`)}>
                <td className="ltr text-right font-medium text-ink">{p.number}</td>
                <td>{p.supplierName}</td>
                <td><div className="flex items-center gap-1.5"><PoStatusPill status={p.status} />{p.delayed && <AlertTriangle size={14} className="text-rose" />}</div></td>
                <td className="num">{money(p.total)}</td>
                <td className="w-28"><Progress value={p.qtyTotal ? (p.qtyReceived / p.qtyTotal) * 100 : 0} color="#0FD69D" /></td>
                <td className={clsx('text-xs', p.delayed ? 'text-rose' : 'text-mist')}>{date(p.expectedAt)}{p.delayed && ` (${num(p.delayDays)} روز تأخیر)`}</td>
                <td className="text-xs text-mist">{p.shippingMethod}{p.trackingNo && <div className="ltr text-right">{p.trackingNo}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </>)}
      <PoFormModal open={creating !== null} onClose={() => setCreating(null)} prefill={creating ?? []} onSaved={(id) => navigate(`/scm/purchase-orders/${id}`)} />
    </div>
  );
}

function PoFormModal({ open, onClose, prefill, onSaved }: { open: boolean; onClose: () => void; prefill: any[]; onSaved: (id: string) => void }) {
  const { data: suppliers = [] } = useApi<any[]>('/suppliers');
  const { data: items = [] } = useApi<any[]>('/items');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [lines, setLines] = useState<{ itemId: string | null; qty: number; unitCost: number | null }[]>([]);
  const [f, setF] = useState<any>({ expectedAt: null, shippingMethod: '', shippingCost: null, notes: '' });
  useEffect(() => {
    if (!open) return;
    const supplier = prefill.find((i) => i.supplierId)?.supplierId ?? null;
    setSupplierId(supplier);
    setLines(prefill.length
      ? prefill.filter((i) => !supplier || i.supplierId === supplier || !i.supplierId).map((i) => ({ itemId: i.id, qty: Math.max(i.reorderQty || 1, i.reorderPoint - i.available - i.incoming), unitCost: i.cost }))
      : [{ itemId: null, qty: 1, unitCost: null }]);
    setF({ expectedAt: null, shippingMethod: '', shippingCost: null, notes: '' });
  }, [open, prefill]);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const valid = lines.filter((l) => l.itemId && l.qty > 0);
  const total = valid.reduce((s, l) => s + l.qty * (l.unitCost ?? 0), 0) + (f.shippingCost ?? 0);
  const save = useAction(() => post('/purchase-orders', { supplierId, lines: valid, ...f, expectedAt: f.expectedAt ?? undefined, shippingCost: f.shippingCost ?? 0 }), {
    success: 'سفارش خرید ثبت شد', onSuccess: (r) => { onClose(); onSaved(r.id); },
  });
  return (
    <Modal open={open} onClose={onClose} size="lg" icon={PackagePlus} title="سفارش خرید جدید"
      footer={<>
        <span className="ml-auto text-sm text-mist">جمع: <b className="num text-ink">{money(total)}</b></span>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" disabled={!supplierId || !valid.length} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت پیش‌نویس</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="تأمین‌کننده *" className="md:col-span-2"><Picker options={suppliers.map((s) => ({ value: s.id, label: s.name, hint: `${s.city} · ${num(s.leadTimeDays)} روز` }))} value={supplierId} onChange={setSupplierId} /></Field>
        <Field label="تاریخ تحویل مورد انتظار" hint={supplier ? `پیش‌فرض: ${num(supplier.leadTimeDays)} روز بعد` : undefined}><DateInput value={f.expectedAt} onChange={(v) => setF({ ...f, expectedAt: v })} /></Field>
      </div>
      <div className="mt-5 overflow-x-auto rounded-2xl border-line/70 md:border">
        <table className="tbl">
          <thead><tr><th className="w-1/2">قطعه</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={i}>
              <td><ItemPicker value={l.itemId} kinds={['component', 'product']} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: v, unitCost: v ? itemMap[v]?.cost ?? null : null } : x)))} /></td>
              <td><Input type="number" className="w-24" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} /></td>
              <td><MoneyInput className="w-32" value={l.unitCost} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCost: v } : x)))} /></td>
              <td className="num">{money(l.qty * (l.unitCost ?? 0))}</td>
              <td><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLines(lines.filter((_, j) => j !== i))} /></td>
            </tr>
          ))}</tbody>
        </table>
        <div className="p-2"><Button size="sm" variant="ghost" icon={Plus} onClick={() => setLines([...lines, { itemId: null, qty: 1, unitCost: null }])}>افزودن ردیف</Button></div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="روش حمل"><Input value={f.shippingMethod} onChange={(e) => setF({ ...f, shippingMethod: e.target.value })} placeholder="هوایی، باربری، پیک…" /></Field>
        <Field label="هزینه حمل / گمرک"><MoneyInput value={f.shippingCost} onChange={(v) => setF({ ...f, shippingCost: v })} /></Field>
        <Field label="توضیحات"><Textarea className="min-h-[42px]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

