import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Plus, Pencil, Phone, Clock, Timer, Globe2 } from 'lucide-react';
import clsx from 'clsx';
import { post, put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Spinner, Stars, Textarea } from '../../components/ui';
import { compactMoney, num } from '../../lib/format';

/** Supplier scorecards: on-time delivery and average delay come from real purchase orders. */
export default function SuppliersPage() {
  const { data = [], isLoading } = useApi<any[]>('/suppliers');
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <div>
      <PageHeader icon={Building2} title="تأمین‌کنندگان" subtitle="کارنامه تحویل به‌موقع، تأخیر میانگین و حجم خرید هر تأمین‌کننده"
        fab={{ label: 'تأمین‌کننده جدید', icon: Plus, onClick: () => setEditing({}) }} />
      {isLoading ? <Spinner /> : data.length === 0 ? <Card><Empty icon={Building2} title="تأمین‌کننده‌ای ثبت نشده" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.map((s) => {
            const rate = s.onTimeRate;
            const tone = rate === null ? 'text-mist' : rate >= 85 ? 'text-mint' : rate >= 60 ? 'text-amber' : 'text-rose';
            return (
              <div key={s.id} className={clsx('glass p-4 md:p-5', focus === s.id && 'border-iris/60 shadow-glow')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{s.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-mist"><Globe2 size={12} />{s.country}، {s.city}</div>
                  </div>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(s)} />
                </div>
                <div className="mt-2 text-xs text-frost">{s.categories}</div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-ink/[0.04] p-2"><div className={clsx('num text-lg font-bold', tone)}>{rate === null ? '—' : `${num(rate)}٪`}</div><div className="text-[10px] text-mist">تحویل به‌موقع</div></div>
                  <div className="rounded-xl bg-ink/[0.04] p-2"><div className="num text-lg font-bold">{s.avgDelayDays === null ? '—' : num(s.avgDelayDays, 1)}</div><div className="text-[10px] text-mist">تأخیر میانگین (روز)</div></div>
                  <div className="rounded-xl bg-ink/[0.04] p-2"><div className="num text-lg font-bold">{compactMoney(s.spend)}</div><div className="text-[10px] text-mist">حجم خرید</div></div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3 text-xs text-mist">
                  <span className="flex items-center gap-1"><Timer size={12} />زمان تأمین {num(s.leadTimeDays)} روز</span>
                  <span className="flex items-center gap-1"><Clock size={12} />{num(s.openPos)} سفارش باز{s.lateNow ? <b className="text-rose"> · {num(s.lateNow)} با تأخیر</b> : null}</span>
                  <Stars value={s.rating} size={12} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-frost"><Phone size={12} />{s.contactPerson} — <a href={`tel:${s.phone}`} className="ltr text-iris">{s.phone}</a></div>
              </div>
            );
          })}
        </div>
      )}
      <SupplierModal supplier={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SupplierModal({ supplier, onClose }: { supplier: any | null; onClose: () => void }) {
  const [f, setF] = useState<any>({});
  useEffect(() => { if (supplier) setF({ country: 'ایران', leadTimeDays: 14, rating: 3, ...supplier }); }, [supplier]);
  const save = useAction(() => (supplier?.id ? put(`/suppliers/${supplier.id}`, f) : post('/suppliers', f)), { success: 'تأمین‌کننده ذخیره شد', onSuccess: onClose });
  const bind = (key: string) => ({ value: f[key] ?? '', onChange: (e: any) => setF({ ...f, [key]: e.target.value }) });
  return (
    <Modal open={!!supplier} onClose={onClose} title={supplier?.id ? 'ویرایش تأمین‌کننده' : 'تأمین‌کننده جدید'} icon={Building2}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام *" className="sm:col-span-2"><Input {...bind('name')} /></Field>
        <Field label="فرد رابط"><Input {...bind('contactPerson')} /></Field>
        <Field label="تلفن"><Input className="ltr" {...bind('phone')} /></Field>
        <Field label="کشور"><Input {...bind('country')} /></Field>
        <Field label="شهر"><Input {...bind('city')} /></Field>
        <Field label="دسته‌های تأمین" className="sm:col-span-2"><Input {...bind('categories')} placeholder="ماژول، PCB، قاب…" /></Field>
        <Field label="زمان تأمین (روز)"><Input type="number" value={f.leadTimeDays ?? ''} onChange={(e) => setF({ ...f, leadTimeDays: Number(e.target.value) })} /></Field>
        <Field label="ارزیابی"><div className="pt-1.5"><Stars value={f.rating ?? 0} onChange={(v) => setF({ ...f, rating: v })} size={20} /></div></Field>
        <Field label="یادداشت" className="sm:col-span-2"><Textarea {...bind('notes')} /></Field>
      </div>
    </Modal>
  );
}
