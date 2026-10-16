import { useEffect, useMemo, useState } from 'react';
import { History, Plus, Trash2, Cpu, Info, PackageCheck, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Field, Input, Modal, MoneyInput, Textarea, Toggle } from './ui';
import { DateInput } from './inputs';
import { ContactPicker, ItemPicker } from './domain';
import { money, num } from '../lib/format';

/** One serial per line (or comma separated); blanks are dropped. */
export const parseSerials = (text: string) => text.split(/[\n,،]+/).map((s) => s.trim()).filter(Boolean);

function NoStockNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-iris/25 bg-iris/[0.08] px-3 py-2.5 text-xs leading-6 text-frost">
      <Info size={16} className="mt-1 shrink-0 text-iris" />
      <div>{children}</div>
    </div>
  );
}

interface Line { kind: 'item' | 'service'; itemId: string | null; description: string; qty: number; unitPrice: number | null; serials: string }
const newLine = (kind: Line['kind'] = 'item'): Line => ({ kind, itemId: null, description: '', qty: 1, unitPrice: null, serials: '' });

/**
 * Owner/admin: record a sale from before the system — manual prices, services and
 * device count. Nothing is taken from stock; the sale is logged in the stock ledger
 * as "فروش قبلی" and sold devices are added to the device registry (serials optional).
 */
export function LegacySaleModal({ open, onClose, contactId, onSaved }: {
  open: boolean; onClose: () => void; contactId?: string | null; onSaved?: (id: string) => void;
}) {
  const { settings } = useSession();
  const { data: items = [] } = useApi<any[]>(open ? '/items' : null);
  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const [customer, setCustomer] = useState<string | null>(contactId ?? null);
  const [hasDate, setHasDate] = useState(true);
  const [date, setDate] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [paid, setPaid] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!open) return;
    setCustomer(contactId ?? null); setHasDate(true); setDate(null); setLines([newLine()]); setPaid(null); setNotes('');
  }, [open, contactId]);

  const valid = lines.filter((l) => (l.kind === 'item' ? l.itemId : l.description.trim()) && l.qty > 0);
  const total = valid.reduce((s, l) => s + l.qty * (l.unitPrice ?? 0), 0);
  const devices = valid.filter((l) => l.kind === 'item' && (itemMap[l.itemId!]?.serialized || itemMap[l.itemId!]?.kind === 'product')).reduce((s, l) => s + l.qty, 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = useAction(() => post<{ id: string; units: string[] }>('/orders/legacy', {
    contactId: customer,
    date: hasDate ? date : null,
    paid,
    notes,
    lines: valid.map((l) => ({
      itemId: l.kind === 'item' ? l.itemId : null, description: l.kind === 'service' ? l.description.trim() : '',
      qty: l.qty, unitPrice: l.unitPrice ?? 0, serials: l.kind === 'item' ? parseSerials(l.serials) : [],
    })),
  }), {
    success: (r) => `فروش قبلی ثبت شد${r.units.length ? ` · ${num(r.units.length)} دستگاه به شناسنامه‌ها اضافه شد` : ''}`,
    onSuccess: (r) => { onClose(); onSaved?.(r.id); },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={History}
      title="ثبت فروش / پروژه قبلی"
      subtitle="ورود دستی فروش‌های گذشته با قیمت دلخواه — فقط مدیر"
      footer={<>
        <span className="ml-auto text-sm text-mist">جمع: <b className="num text-ink">{money(total)}</b> {settings.company.currency}</span>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" loading={save.isPending} disabled={!customer || !valid.length || (hasDate && !date)} onClick={() => save.mutate(undefined)}>ثبت فروش</Button>
      </>}
    >
      <div className="space-y-4">
        <NoStockNotice>
          این فروش <b>از موجودی انبار کم نمی‌کند</b>. در «تراکنش‌های انبار» با برچسب «فروش قبلی» ثبت می‌شود و دستگاه‌های سریالی آن
          به «شناسنامه دستگاه‌ها» برای همین مشتری اضافه می‌شوند — اگر شماره‌سریال را ندارید خالی بگذارید، بعداً قابل ثبت است.
        </NoStockNotice>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="مشتری *"><ContactPicker value={customer} onChange={setCustomer} /></Field>
          <Field label="تاریخ فروش" hint={!hasDate ? 'بدون تاریخ ثبت می‌شود و در گزارش‌های ماهانه حساب نمی‌شود' : undefined}>
            <div className="flex items-center gap-2">
              {hasDate ? <DateInput className="flex-1" value={date} onChange={setDate} /> : <div className="field flex flex-1 items-center text-mist">بدون تاریخ</div>}
              <Toggle checked={!hasDate} onChange={(v) => setHasDate(!v)} label="نامشخص" />
            </div>
          </Field>
        </div>

        <div className="space-y-2.5">
          {lines.map((l, i) => {
            const item = l.itemId ? itemMap[l.itemId] : null;
            return (
              <div key={i} className="rounded-2xl border border-line/70 bg-deep/40 p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex rounded-xl border border-line/70 p-0.5 text-xs">
                    {([['item', 'کالا / دستگاه', PackageCheck], ['service', 'خدمت', Wrench]] as const).map(([k, label, Icon]) => (
                      <button key={k} type="button" onClick={() => setLine(i, { kind: k, itemId: null })}
                        className={clsx('flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition', l.kind === k ? 'bg-iris font-bold text-night' : 'text-mist')}>
                        <Icon size={13} />{label}
                      </button>
                    ))}
                  </div>
                  {lines.length > 1 && <Button size="sm" variant="ghost" icon={Trash2} aria-label="حذف ردیف" onClick={() => setLines(lines.filter((_, j) => j !== i))} />}
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_96px_150px]">
                  {l.kind === 'item'
                    ? <Field label="کالا"><ItemPicker value={l.itemId} kinds={['product', 'component']} onChange={(v) => setLine(i, { itemId: v, unitPrice: l.unitPrice ?? (v ? itemMap[v]?.price ?? null : null) })} /></Field>
                    : <Field label="شرح خدمت"><Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="نصب و راه‌اندازی، آموزش، سرویس…" /></Field>}
                  <Field label="تعداد"><Input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></Field>
                  <Field label="قیمت واحد"><MoneyInput value={l.unitPrice} onChange={(v) => setLine(i, { unitPrice: v })} /></Field>
                </div>
                {item?.serialized || item?.kind === 'product' ? (
                  <Field className="mt-3" label={`شماره‌سریال‌ها (${num(parseSerials(l.serials).length)} از ${num(l.qty)}) — اختیاری`} hint="هر خط یک سریال. هر تعداد که خالی بماند «بدون سریال» ثبت می‌شود.">
                    <Textarea className="ltr min-h-[64px] font-mono text-left text-xs" value={l.serials} onChange={(e) => setLine(i, { serials: e.target.value })} placeholder={'ELC-E1-0001\nELC-E1-0002'} />
                  </Field>
                ) : null}
                <div className="mt-2 text-left text-xs text-mist">جمع ردیف: <b className="num text-frost">{money(l.qty * (l.unitPrice ?? 0))}</b></div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={Plus} onClick={() => setLines([...lines, newLine('item')])}>کالا / دستگاه</Button>
            <Button size="sm" variant="outline" icon={Plus} onClick={() => setLines([...lines, newLine('service')])}>خدمت</Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="مبلغ دریافت‌شده" hint={`از جمع ${money(total)} — خالی یعنی تسویه نشده`}><MoneyInput value={paid} onChange={setPaid} /></Field>
          <Field label="یادداشت"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="نام پروژه، شماره قرارداد…" /></Field>
        </div>
        {devices > 0 && <p className="text-xs text-mint">{num(devices)} دستگاه به شناسنامه دستگاه‌های این مشتری اضافه می‌شود.</p>}
      </div>
    </Modal>
  );
}

/**
 * Owner/admin: define devices by hand — one or many, for a customer or unassigned.
 * With a customer and a unit price it is also recorded as a past sale.
 */
export function ManualUnitsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useSession();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (open) setF({ itemId: null, count: 1, serials: '', contactId: null, unitPrice: null, hasDate: false, date: null, notes: '' }); }, [open]);
  const serials = parseSerials(f.serials ?? '');
  const set = (patch: any) => setF((x: any) => ({ ...x, ...patch }));
  const asSale = !!f.contactId && (f.unitPrice ?? 0) > 0;
  const save = useAction(() => post<{ ids: string[]; orderId?: string }>('/units/manual', {
    itemId: f.itemId, count: f.count, serials, contactId: f.contactId, unitPrice: f.unitPrice, date: f.hasDate ? f.date : null, notes: f.notes,
  }), {
    success: (r) => `${num(r.ids.length)} دستگاه ثبت شد${r.orderId ? ' و به فروش‌های این مشتری اضافه شد' : ''}`,
    onSuccess: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Cpu}
      title="تعریف دستی دستگاه"
      subtitle="یک یا چند دستگاه — برای یک مشتری یا بدون مشتری — فقط مدیر"
      footer={<>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" loading={save.isPending} disabled={!f.itemId || !(f.count >= 1) || serials.length > f.count || (f.hasDate && !f.date)} onClick={() => save.mutate(undefined)}>
          ثبت {num(f.count || 0)} دستگاه
        </Button>
      </>}
    >
      <div className="space-y-4">
        <NoStockNotice>
          این دستگاه‌ها <b>روی موجودی انبار اثری ندارند</b>؛ فقط به شناسنامه دستگاه‌ها اضافه و در دفتر انبار «ثبت دستی دستگاه» درج می‌شوند.
          {asSale && <> چون مشتری و قیمت واحد مشخص شده، به‌عنوان <b>فروش قبلی</b> هم برای این مشتری ثبت می‌شود.</>}
        </NoStockNotice>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="محصول *"><ItemPicker value={f.itemId} kinds={['product']} onChange={(v) => set({ itemId: v })} /></Field>
          <Field label="تعداد *"><Input type="number" min={1} max={500} value={f.count ?? 1} onChange={(e) => set({ count: Number(e.target.value) })} /></Field>
        </div>
        <Field label={`شماره‌سریال‌ها — اختیاری (${num(serials.length)} از ${num(f.count || 0)})`} hint="هر خط یک سریال. بقیه «بدون سریال» ثبت می‌شوند و بعداً از صفحه هر دستگاه قابل ثبت‌اند."
          error={serials.length > f.count ? 'تعداد سریال‌ها از تعداد دستگاه بیشتر است' : undefined}>
          <Textarea className="ltr min-h-[80px] font-mono text-left text-xs" value={f.serials ?? ''} onChange={(e) => set({ serials: e.target.value })} placeholder={'ELC-E1-0001\nELC-E1-0002'} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="مشتری (اختیاری)" hint="خالی بگذارید تا بعداً به مشتری اختصاص دهید"><ContactPicker clearable stages={['customer']} value={f.contactId} onChange={(v) => set({ contactId: v })} placeholder="بدون مشتری" /></Field>
          <Field label={`قیمت فروش هر دستگاه (${settings.company.currency})`} hint={f.contactId ? 'با وارد کردن قیمت، در فروش‌های این مشتری هم ثبت می‌شود' : 'برای ثبت فروش، مشتری را هم انتخاب کنید'}>
            <MoneyInput value={f.unitPrice} onChange={(v) => set({ unitPrice: v })} />
          </Field>
        </div>
        <Field label="تاریخ">
          <div className="flex items-center gap-2">
            {f.hasDate ? <DateInput className="flex-1" value={f.date} onChange={(v) => set({ date: v })} /> : <div className="field flex flex-1 items-center text-mist">بدون تاریخ</div>}
            <Toggle checked={!!f.hasDate} onChange={(v) => set({ hasDate: v })} label="تاریخ دارد" />
          </div>
        </Field>
        <Field label="یادداشت"><Input value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/** Owner/admin: give manually registered devices to a customer (or take them back). */
export function AssignUnitsModal({ ids, onClose, onDone }: { ids: string[] | null; onClose: () => void; onDone?: () => void }) {
  const [contactId, setContactId] = useState<string | null>(null);
  useEffect(() => { if (ids) setContactId(null); }, [ids]);
  const save = useAction(() => post('/units/assign', { ids, contactId }), {
    success: (r: any) => `${num(r.changed)} دستگاه به‌روز شد`,
    onSuccess: () => { onClose(); onDone?.(); },
  });
  return (
    <Modal open={!!ids} onClose={onClose} icon={Cpu} size="sm" title={`اختصاص ${num(ids?.length ?? 0)} دستگاه به مشتری`}
      subtitle="فقط دستگاه‌هایی که دستی ثبت شده‌اند"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>{contactId ? 'اختصاص' : 'برداشتن مشتری'}</Button></>}>
      <Field label="مشتری" hint="خالی = دستگاه‌ها بدون مشتری می‌شوند"><ContactPicker clearable stages={['customer']} value={contactId} onChange={setContactId} /></Field>
    </Modal>
  );
}
