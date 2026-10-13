import { useEffect, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { post, put } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, Toggle } from './ui';
import { DateInput } from './inputs';
import { ContactPicker, ItemPicker } from './domain';
import { money, num } from '../lib/format';

interface Line { itemId: string | null; qty: number; unitPrice: number | null; discountPct: number; description: string }

export function OrderFormModal({ open, onClose, order, lines: initialLines, defaultContact, onSaved }: {
  open: boolean; onClose: () => void; order?: any; lines?: any[]; defaultContact?: string | null; onSaved?: (id: string) => void;
}) {
  const { settings } = useSession();
  const { data: items = [] } = useApi<any[]>('/items');
  const blank = () => ({
    contactId: defaultContact ?? null as string | null, fulfillment: 'stock', needsInstallation: true, priority: 'normal',
    promisedAt: Date.now() + 21 * 86_400_000 as number | null, discount: 0 as number | null, taxRate: settings.company.taxRate, notes: '',
  });
  const [f, setF] = useState(blank);
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => {
    if (!open) return;
    if (order) {
      setF({ contactId: order.contactId, fulfillment: order.fulfillment, needsInstallation: !!order.needsInstallation, priority: order.priority,
        promisedAt: order.promisedAt, discount: order.discount, taxRate: order.taxRate, notes: order.notes ?? '' });
      setLines((initialLines ?? []).map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, description: l.description ?? '' })));
    } else {
      setF(blank());
      setLines([{ itemId: null, qty: 1, unitPrice: null, discountPct: 0, description: '' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order, defaultContact]);

  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = lines.filter((l) => l.itemId && l.qty > 0);
  const subtotal = valid.reduce((s, l) => s + l.qty * (l.unitPrice ?? itemMap[l.itemId!]?.price ?? 0) * (1 - l.discountPct / 100), 0);
  const total = Math.max(0, subtotal - (f.discount ?? 0)) * (1 + f.taxRate / 100);
  const shortages = valid.filter((l) => {
    const it = itemMap[l.itemId!];
    return it && it.kind !== 'service' && it.available < l.qty;
  });

  const save = useAction(() => {
    const body = { ...f, discount: f.discount ?? 0, lines: valid.map((l) => ({ ...l, unitPrice: l.unitPrice ?? itemMap[l.itemId!]?.price })) };
    return order ? put(`/orders/${order.id}`, body) : post('/orders', body);
  }, { success: order ? 'سفارش به‌روز شد' : 'پیش‌فاکتور ایجاد شد', onSuccess: (r) => { onClose(); onSaved?.(r.id); } });

  return (
    <Modal open={open} onClose={onClose} size="xl" icon={FileText}
      title={order ? `ویرایش سفارش فروش ${order.number}` : 'پیش‌فاکتور / سفارش فروش جدید'}
      subtitle="سفارش مشتری از مرحله پیش‌فاکتور شروع می‌شود و با هر مرحله جلو می‌رود"
      footer={<>
        <div className="ml-auto text-sm text-mist">جمع کل: <b className="num text-lg text-ink">{money(total, settings.company.currency)}</b></div>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" loading={save.isPending} disabled={!f.contactId || !valid.length} onClick={() => save.mutate(undefined)}>ذخیره</Button>
      </>}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="مشتری *" className="md:col-span-2"><ContactPicker value={f.contactId} onChange={(v) => setF({ ...f, contactId: v })} /></Field>
        <Field label="نحوه تأمین" hint={f.fulfillment === 'mto' ? 'دستور تولید خودکار ایجاد می‌شود' : 'تخصیص از موجودی انبار'}>
          <Select value={f.fulfillment} onChange={(e) => setF({ ...f, fulfillment: e.target.value })} disabled={!!order}>
            <option value="stock">فروش از موجودی</option>
            <option value="mto">تولید بر اساس سفارش</option>
          </Select>
        </Field>
        <Field label="اولویت">
          <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option value="low">کم</option><option value="normal">عادی</option><option value="high">بالا</option><option value="urgent">فوری</option>
          </Select>
        </Field>
        <Field label="تاریخ تحویل تعهدشده"><DateInput value={f.promisedAt} onChange={(v) => setF({ ...f, promisedAt: v })} /></Field>
        <div className="flex items-end pb-2 md:col-span-3"><Toggle checked={f.needsInstallation} onChange={(v) => setF({ ...f, needsInstallation: v })} label="شامل نصب و راه‌اندازی در محل مشتری" /></div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line/70">
        <table className="tbl">
          <thead><tr><th className="w-[38%]">کالا / خدمت</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف ٪</th><th>جمع</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const it = l.itemId ? itemMap[l.itemId] : null;
              const price = l.unitPrice ?? it?.price ?? 0;
              return (
                <tr key={i}>
                  <td>
                    <ItemPicker value={l.itemId} kinds={['product', 'service']} onChange={(v) => setLine(i, { itemId: v, unitPrice: v ? itemMap[v]?.price ?? null : null })} />
                    {it && it.kind !== 'service' && <div className={`mt-1 text-[11px] ${it.available < l.qty ? 'text-amber' : 'text-mist'}`}>موجودی آزاد: {num(it.available)} {it.unit}{it.serialized ? ' (سریالی)' : ''}</div>}
                  </td>
                  <td><Input type="number" min={1} className="w-20" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                  <td><MoneyInput className="w-36" value={price} onChange={(v) => setLine(i, { unitPrice: v })} /></td>
                  <td><Input type="number" min={0} max={100} className="w-20" value={l.discountPct} onChange={(e) => setLine(i, { discountPct: Number(e.target.value) })} /></td>
                  <td className="num whitespace-nowrap">{money(l.qty * price * (1 - l.discountPct / 100))}</td>
                  <td><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLines(lines.filter((_, j) => j !== i))} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2"><Button size="sm" variant="ghost" icon={Plus} onClick={() => setLines([...lines, { itemId: null, qty: 1, unitPrice: null, discountPct: 0, description: '' }])}>افزودن ردیف</Button></div>
      </div>
      {shortages.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber/10 px-3 py-2 text-xs leading-6 text-amber">
          موجودی آزاد برای {shortages.map((l) => itemMap[l.itemId!].name).join('، ')} کافی نیست.
          {f.fulfillment === 'stock' ? ' می‌توانید نحوه تأمین را «تولید بر اساس سفارش» انتخاب کنید.' : ' با ورود سفارش به مرحله تولید، دستور تولید ساخته می‌شود.'}
        </p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_200px_140px]">
        <Field label="توضیحات"><Textarea className="min-h-[60px]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <Field label="تخفیف کلی" hint={settings.company.currency}><MoneyInput value={f.discount} onChange={(v) => setF({ ...f, discount: v })} /></Field>
        <Field label="مالیات و عوارض ٪"><Input type="number" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: Number(e.target.value) })} /></Field>
      </div>
    </Modal>
  );
}
