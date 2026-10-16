import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Plus, Pencil, Phone, Clock, Timer, Globe2, MapPin, LayoutGrid, List, ChevronLeft, Paperclip } from 'lucide-react';
import clsx from 'clsx';
import { matchesSearch } from '@shared/search';
import { post, put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useIsMobile } from '../../lib/media';
import { Button, Card, Empty, Field, IconToggle, Input, ListCard, Modal, PageHeader, SearchBox, SelectDot, Spinner, Stars, Textarea } from '../../components/ui';
import { SelectButton, SelectionBar, useSelection } from '../../components/selection';
import { compactMoney, date, num, phoneHref } from '../../lib/format';

type View = 'cards' | 'list';
const VIEW_KEY = 'ef_suppliers_view';

const rateTone = (rate: number | null) => rate === null ? 'text-mist' : rate >= 85 ? 'text-mint' : rate >= 60 ? 'text-amber' : 'text-rose';
const placeOf = (s: any) => [s.country !== 'ایران' ? s.country : '', s.city].filter(Boolean).join('، ');

/** Supplier scorecards: on-time delivery and average delay come from real purchase orders. */
export default function SuppliersPage() {
  const { data = [], isLoading } = useApi<any[]>('/suppliers');
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [view, setViewState] = useState<View>(() => { try { return (localStorage.getItem(VIEW_KEY) as View) || 'cards'; } catch { return 'cards'; } });
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const list = useMemo(() => data.filter((s) => matchesSearch(`${s.name} ${s.city} ${s.country} ${s.address} ${s.categories} ${s.contactPerson} ${s.phone}`, search)), [data, search]);
  const sel = useSelection(list.map((s) => s.id));
  const open = (s: any) => (sel.active ? sel.toggle(s.id) : navigate(`/scm/suppliers/${s.id}`));

  return (
    <div>
      <PageHeader icon={Building2} title="تأمین‌کنندگان" subtitle="کارنامه تحویل به‌موقع، تأخیر میانگین، حجم خرید و تاریخچه قیمت هر تأمین‌کننده"
        aside={<div className="flex items-center gap-2">
          <IconToggle value={view} onChange={setView} options={[{ key: 'cards', icon: LayoutGrid, label: 'کارتی' }, { key: 'list', icon: List, label: 'لیستی' }]} />
          <SelectButton sel={sel} />
        </div>}
        fab={sel.active ? undefined : { label: 'تأمین‌کننده جدید', icon: Plus, onClick: () => setEditing({}) }} />
      <SearchBox className="mb-4 md:max-w-sm" value={search} onChange={setSearch} placeholder="جستجوی نام، شهر، آدرس، دسته…" />
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={Building2} title={data.length ? 'موردی با این جستجو پیدا نشد' : 'تأمین‌کننده‌ای ثبت نشده'} /></Card>
        : view === 'cards' ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {list.map((s) => (
              <div
                key={s.id}
                role={sel.active ? 'checkbox' : 'link'}
                tabIndex={0}
                aria-checked={sel.active ? sel.has(s.id) : undefined}
                onClick={() => open(s)}
                onKeyDown={(e) => e.key === 'Enter' && open(s)}
                className={clsx('glass cursor-pointer p-4 transition hover:border-iris/50 md:p-5', focus === s.id && 'border-iris/60 shadow-glow', sel.has(s.id) && 'list-card-selected')}
              >
                <div className="flex items-start justify-between gap-3">
                  {sel.active && <SelectDot checked={sel.has(s.id)} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold text-ink">{s.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-mist"><Globe2 size={12} />{placeOf(s) || '—'}</div>
                  </div>
                  {!sel.active && <Button size="sm" variant="ghost" icon={Pencil} aria-label="ویرایش" onClick={(e) => { e.stopPropagation(); setEditing(s); }} />}
                </div>
                <div className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-frost/85">
                  <MapPin size={13} className="mt-[3px] shrink-0 text-mist" />
                  <span className="line-clamp-2">{s.address || <span className="text-mist">آدرس ثبت نشده</span>}</span>
                </div>
                {s.categories && <div className="mt-1.5 truncate text-xs text-mist">{s.categories}</div>}
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-ink/[0.04] p-2"><div className={clsx('num text-lg font-bold', rateTone(s.onTimeRate))}>{s.onTimeRate === null ? '—' : `${num(s.onTimeRate)}٪`}</div><div className="text-[10px] text-mist">تحویل به‌موقع</div></div>
                  <div className="rounded-xl bg-ink/[0.04] p-2"><div className="num text-lg font-bold">{s.avgDelayDays === null ? '—' : num(s.avgDelayDays, 1)}</div><div className="text-[10px] text-mist">تأخیر میانگین (روز)</div></div>
                  <div className="rounded-xl bg-ink/[0.04] p-2"><div className="num text-lg font-bold">{compactMoney(s.spend)}</div><div className="text-[10px] text-mist">حجم خرید</div></div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3 text-xs text-mist">
                  <span className="flex items-center gap-1"><Timer size={12} />تأمین {num(s.leadTimeDays)} روز</span>
                  <span className="flex items-center gap-1"><Clock size={12} />{num(s.openPos)} سفارش باز{s.lateNow ? <b className="text-rose"> · {num(s.lateNow)} با تأخیر</b> : null}</span>
                  <Stars value={s.rating} size={12} />
                </div>
                {(s.contactPerson || s.phone) && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-frost">
                    <Phone size={12} />{s.contactPerson}{s.contactPerson && s.phone && ' — '}
                    {s.phone && <a href={phoneHref(s.phone)} onClick={(e) => e.stopPropagation()} className="ltr text-iris">{s.phone}</a>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : mobile ? (
          <div className="space-y-2">
            {list.map((s) => (
              <ListCard key={s.id} onClick={() => navigate(`/scm/suppliers/${s.id}`)} selecting={sel.active} selected={sel.has(s.id)} onSelect={() => sel.toggle(s.id)} onLongPress={() => sel.start(s.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-bold text-ink">{s.name}</span>
                  <span className={clsx('num shrink-0 text-xs font-bold', rateTone(s.onTimeRate))}>{s.onTimeRate === null ? '—' : `${num(s.onTimeRate)}٪ به‌موقع`}</span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-mist">{[placeOf(s), s.address].filter(Boolean).join(' — ') || 'آدرس ثبت نشده'}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-mist">
                  <span>خرید {compactMoney(s.spend)} · {num(s.poCount)} سفارش</span>
                  <span>{s.lastPurchaseAt ? `آخرین خرید ${date(s.lastPurchaseAt)}` : 'بدون خرید'}</span>
                </div>
              </ListCard>
            ))}
          </div>
        ) : (
          <Card pad={false} bodyClass="overflow-x-auto">
            <table className="tbl min-w-[900px]">
              <thead><tr>
                {sel.active && <th className="w-10" />}
                <th>تأمین‌کننده</th><th>شهر و آدرس</th><th>رابط و تلفن</th><th>به‌موقع</th><th>حجم خرید</th><th>سفارش باز</th><th>آخرین خرید</th><th>اسناد</th><th />
              </tr></thead>
              <tbody>{list.map((s) => (
                <tr key={s.id} className={clsx('cursor-pointer', sel.has(s.id) && 'bg-iris/10')} onClick={() => open(s)}>
                  {sel.active && <td><SelectDot checked={sel.has(s.id)} /></td>}
                  <td>
                    <div className="font-semibold text-ink">{s.name}</div>
                    <div className="max-w-[220px] truncate text-[11px] text-mist">{s.categories}</div>
                  </td>
                  <td className="max-w-[300px]">
                    <div className="text-xs text-frost">{placeOf(s) || '—'}</div>
                    <div className="truncate text-[11px] text-mist" title={s.address}>{s.address || '—'}</div>
                  </td>
                  <td className="text-xs">
                    <div className="text-frost">{s.contactPerson || '—'}</div>
                    {s.phone && <a href={phoneHref(s.phone)} onClick={(e) => e.stopPropagation()} className="ltr text-iris">{s.phone}</a>}
                  </td>
                  <td className={clsx('num font-bold', rateTone(s.onTimeRate))}>{s.onTimeRate === null ? '—' : `${num(s.onTimeRate)}٪`}</td>
                  <td className="num">{compactMoney(s.spend)}</td>
                  <td className="num">{num(s.openPos)}{s.lateNow ? <span className="text-rose"> ({num(s.lateNow)} تأخیر)</span> : null}</td>
                  <td className="text-xs text-mist">{date(s.lastPurchaseAt)}</td>
                  <td className="text-xs text-mist">{s.docCount ? <span className="flex items-center gap-1"><Paperclip size={12} />{num(s.docCount)}</span> : '—'}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {!sel.active && <Button size="sm" variant="ghost" icon={Pencil} aria-label="ویرایش" onClick={(e) => { e.stopPropagation(); setEditing(s); }} />}
                      <ChevronLeft size={16} className="text-mist" />
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      <SupplierModal supplier={editing} onClose={() => setEditing(null)} />
      <SelectionBar sel={sel} path="/suppliers/bulk-delete" noun="تأمین‌کننده" />
    </div>
  );
}

export function SupplierModal({ supplier, onClose }: { supplier: any | null; onClose: () => void }) {
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
        <Field label="ایمیل"><Input className="ltr" {...bind('email')} /></Field>
        <Field label="کشور"><Input {...bind('country')} /></Field>
        <Field label="شهر"><Input {...bind('city')} /></Field>
        <Field label="آدرس" className="sm:col-span-2"><Textarea className="min-h-[64px]" {...bind('address')} placeholder="خیابان، پلاک، واحد…" /></Field>
        <Field label="دسته‌های تأمین" className="sm:col-span-2"><Input {...bind('categories')} placeholder="ماژول، PCB، قاب…" /></Field>
        <Field label="زمان تأمین (روز)"><Input type="number" value={f.leadTimeDays ?? ''} onChange={(e) => setF({ ...f, leadTimeDays: Number(e.target.value) })} /></Field>
        <Field label="ارزیابی"><div className="pt-1.5"><Stars value={f.rating ?? 0} onChange={(v) => setF({ ...f, rating: v })} size={20} /></div></Field>
        <Field label="یادداشت" className="sm:col-span-2"><Textarea {...bind('notes')} /></Field>
      </div>
    </Modal>
  );
}
