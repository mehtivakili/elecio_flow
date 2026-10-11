import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { ITEM_KINDS } from '@shared/defaults';
import { post, put } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, Toggle } from './ui';
import { Picker } from './inputs';

export function ItemFormModal({ item, onClose, onSaved }: { item: any | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const { data: suppliers = [] } = useApi<any[]>('/suppliers');
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (item) setF({ kind: 'component', unit: 'عدد', price: 0, cost: 0, reorderPoint: 0, reorderQty: 0, leadTimeDays: 0, ...item, serialized: !!item.serialized, active: item.active !== 0 });
  }, [item]);
  const save = useAction(() => (item?.id ? put(`/items/${item.id}`, f) : post('/items', f)), {
    success: 'کالا ذخیره شد', onSuccess: (r) => { onClose(); onSaved?.(r.id); },
  });
  const bind = (key: string) => ({ value: f[key] ?? '', onChange: (e: any) => setF({ ...f, [key]: e.target.value }) });
  const numBind = (key: string) => ({ type: 'number', value: f[key] ?? 0, onChange: (e: any) => setF({ ...f, [key]: Number(e.target.value) }) });
  return (
    <Modal open={!!item} onClose={onClose} size="lg" icon={Boxes} title={item?.id ? `ویرایش ${item.name}` : 'تعریف کالا / قطعه / خدمت'}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.name || !f.sku} loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="نوع"><Select {...bind('kind')}>{Object.entries(ITEM_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="کد کالا (SKU) *"><Input className="ltr uppercase" {...bind('sku')} /></Field>
        <Field label="واحد"><Input {...bind('unit')} /></Field>
        <Field label="نام *" className="sm:col-span-2"><Input {...bind('name')} /></Field>
        <Field label="دسته"><Input {...bind('category')} /></Field>
        {f.kind !== 'component' && <Field label="قیمت فروش"><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v ?? 0 })} /></Field>}
        <Field label="بهای تمام‌شده" hint="با هر رسید خرید، میانگین موزون می‌شود"><MoneyInput value={f.cost} onChange={(v) => setF({ ...f, cost: v ?? 0 })} /></Field>
        {f.kind !== 'service' && <>
          <Field label="نقطه سفارش"><Input {...numBind('reorderPoint')} /></Field>
          <Field label="مقدار سفارش پیشنهادی"><Input {...numBind('reorderQty')} /></Field>
          <Field label="زمان تأمین (روز)"><Input {...numBind('leadTimeDays')} /></Field>
          <Field label="تأمین‌کننده اصلی" className="sm:col-span-2">
            <Picker options={suppliers.map((s) => ({ value: s.id, label: s.name }))} value={f.supplierId ?? null} onChange={(v) => setF({ ...f, supplierId: v })} clearable />
          </Field>
        </>}
        {f.kind === 'product' && <>
          <div className="flex items-end pb-2"><Toggle checked={f.serialized} onChange={(v) => setF({ ...f, serialized: v })} label="سریالی (ردیابی تک‌تک دستگاه)" /></div>
          <Field label="گارانتی (ماه)"><Input {...numBind('warrantyMonths')} /></Field>
          <Field label="نسخه سخت‌افزار"><Input className="ltr" {...bind('hwRev')} /></Field>
          <Field label="نسخه فریمور جاری"><Input className="ltr" {...bind('fwVersion')} /></Field>
        </>}
        <Field label="توضیحات" className="sm:col-span-3"><Textarea {...bind('description')} /></Field>
        {item?.id && <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="فعال" />}
      </div>
    </Modal>
  );
}
