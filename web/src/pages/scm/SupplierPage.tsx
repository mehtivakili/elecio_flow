import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Building2, Pencil, PackagePlus, Phone, Mail, MapPin, Truck, TrendingUp, TrendingDown, Minus, ChevronDown, Timer, History, Tags,
} from 'lucide-react';
import clsx from 'clsx';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { useIsMobile } from '../../lib/media';
import { Button, Card, Empty, KV, ListCard, PageHeader, Pill, Spinner, Stars, Stat } from '../../components/ui';
import { PoStatusPill } from '../../components/domain';
import { Timeline } from '../../components/flow';
import { DocumentsCard } from '../../components/documents';
import { SupplierModal } from './SuppliersPage';
import { compactMoney, date, dateTime, money, num, phoneHref } from '../../lib/format';

/** Price change of an item, coloured from the buyer's point of view (cheaper = good). */
function Change({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0) return <span className="inline-flex items-center gap-1 text-xs text-mist"><Minus size={13} />بدون تغییر</span>;
  const up = pct > 0;
  return (
    <span className={clsx('num inline-flex items-center gap-1 text-xs font-bold', up ? 'text-rose' : 'text-mint')}>
      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{up ? '+' : '−'}{num(Math.abs(pct), 1)}٪
    </span>
  );
}

/** Tiny price line: one point per purchase, last point highlighted. */
function PriceSpark({ history, width = 120, height = 34 }: { history: { at: number; price: number }[]; width?: number; height?: number }) {
  const prices = history.map((h) => h.price);
  if (prices.length < 2) return <span className="text-[11px] text-mist">یک خرید</span>;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pts = prices.map((p, i) => [4 + (i / (prices.length - 1)) * (width - 8), height - 4 - ((p - min) / span) * (height - 8)]);
  const up = prices.at(-1)! > prices[0];
  const color = prices.at(-1) === prices[0] ? '#9DB4C0' : up ? '#FF499E' : '#0FD69D';
  const last = pts.at(-1)!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="ltr block" aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3.2 : 1.8} fill={i === pts.length - 1 ? color : '#C2DFE3'} />)}
      <circle cx={last[0]} cy={last[1]} r="6" fill={color} opacity="0.18" />
    </svg>
  );
}

export default function SupplierPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const { settings } = useSession();
  const { data, isLoading } = useApi<any>(`/suppliers/${id}`);
  const [editing, setEditing] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (isLoading || !data) return <Spinner />;
  const s = data.supplier;
  const cur = settings.company.currency;
  const rateTone = s.onTimeRate === null ? 'iris' : s.onTimeRate >= 85 ? 'mint' : s.onTimeRate >= 60 ? 'amber' : 'rose';

  return (
    <div className="space-y-6">
      <PageHeader hero eyebrow="تأمین‌کننده" icon={Building2}
        title={s.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {[s.country !== 'ایران' ? s.country : '', s.city].filter(Boolean).join('، ') || 'شهر ثبت نشده'}
          {s.categories && <span className="text-mist">· {s.categories}</span>}
          <Stars value={s.rating} size={13} />
        </span>}
        actions={<>
          {s.phone && <a href={phoneHref(s.phone)}><Button variant="outline" icon={Phone}>تماس</Button></a>}
          <Button variant="ghost" icon={Pencil} onClick={() => setEditing(s)}>ویرایش</Button>
          <Button variant="glow" icon={PackagePlus} onClick={() => navigate(`/scm/purchase-orders?new=1&supplier=${s.id}`)}>سفارش خرید جدید</Button>
        </>} />

      <div className="stat-rail grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="تحویل به‌موقع" value={s.onTimeRate === null ? '—' : `${num(s.onTimeRate)}٪`} hint={s.avgDelayDays === null ? 'هنوز رسیدی ثبت نشده' : `تأخیر میانگین ${num(s.avgDelayDays, 1)} روز`} tone={rateTone} />
        <Stat label="حجم کل خرید" value={compactMoney(s.spend)} hint={cur} tone="sky" />
        <Stat label="سفارش‌های خرید" value={num(s.poCount)} hint={`${num(s.openPos)} باز${s.lateNow ? ` · ${num(s.lateNow)} با تأخیر` : ''}`} tone={s.lateNow ? 'rose' : 'iris'} alert={s.lateNow > 0} />
        <Stat label="آخرین خرید" value={s.lastPurchaseAt ? date(s.lastPurchaseAt) : '—'} hint={`${num(data.items.length)} قلم کالای متفاوت`} tone="lilac" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card title="اقلام خریداری‌شده و روند قیمت" icon={TrendingUp} pad={false}
            subtitle="هر قیمتی که در سفارش‌های خرید پرداخت شده؛ با قیمت تمام‌شده فعلی کالا و قیمت تأمین‌کنندگان دیگر مقایسه کنید">
            {data.items.length === 0 ? <div className="p-5"><Empty icon={Tags} title="هنوز از این تأمین‌کننده خریدی ثبت نشده" /></div> : mobile ? (
              <div className="space-y-2 px-3 pb-3">
                {data.items.map((it: any) => (
                  <div key={it.itemId} className="rounded-2xl border border-line/60 bg-deep/40">
                    <button type="button" onClick={() => setExpanded(expanded === it.itemId ? null : it.itemId)} className="w-full p-3 text-right">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-ink">{it.name}</span>
                        <Change pct={it.changePct} />
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-[11.5px] leading-5 text-mist">
                          <div>آخرین: <b className="num text-ink">{money(it.lastPrice)}</b> <span className="text-[10.5px]">({date(it.lastAt)})</span></div>
                          <div>اولین: <span className="num">{money(it.firstPrice)}</span> · فعلی کالا: <span className="num">{money(it.currentCost)}</span></div>
                        </div>
                        <PriceSpark history={it.history} width={96} />
                      </div>
                    </button>
                    {expanded === it.itemId && <PriceHistory item={it} cur={cur} />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl min-w-[860px]">
                  <thead><tr>
                    <th>کالا</th><th>دفعات / تعداد</th><th>اولین قیمت</th><th>آخرین قیمت</th><th>تغییر</th><th>روند</th><th>قیمت فعلی کالا</th><th />
                  </tr></thead>
                  <tbody>{data.items.map((it: any) => (
                    <Fragment key={it.itemId}>
                      <tr className="cursor-pointer" onClick={() => setExpanded(expanded === it.itemId ? null : it.itemId)}>
                        <td>
                          <Link to={`/inventory/items/${it.itemId}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink hover:text-iris">{it.name}</Link>
                          <div className="ltr text-right text-[11px] text-mist">{it.sku}</div>
                        </td>
                        <td className="text-xs"><span className="num">{num(it.timesBought)}</span> بار · <span className="num">{num(it.totalQty)}</span> {it.unit}</td>
                        <td><div className="num">{money(it.firstPrice)}</div><div className="text-[11px] text-mist">{date(it.firstAt)}</div></td>
                        <td><div className="num font-bold text-ink">{money(it.lastPrice)}</div><div className="text-[11px] text-mist">{date(it.lastAt)}</div></td>
                        <td><Change pct={it.changePct} /></td>
                        <td><PriceSpark history={it.history} /></td>
                        <td>
                          <div className="num">{money(it.currentCost)}</div>
                          {it.currentCost > 0 && it.lastPrice > 0 && it.currentCost !== it.lastPrice && (
                            <div className="text-[11px] text-mist">{it.lastPrice < it.currentCost ? 'ارزان‌تر از قیمت فعلی' : 'گران‌تر از قیمت فعلی'}</div>
                          )}
                        </td>
                        <td><ChevronDown size={16} className={clsx('text-mist transition', expanded === it.itemId && 'rotate-180')} /></td>
                      </tr>
                      {expanded === it.itemId && <tr><td colSpan={8} className="!p-0"><PriceHistory item={it} cur={cur} /></td></tr>}
                    </Fragment>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="سفارش‌های خرید" icon={Truck} pad={false}
            actions={<Button size="sm" variant="action" icon={PackagePlus} onClick={() => navigate(`/scm/purchase-orders?new=1&supplier=${s.id}`)}>جدید</Button>}>
            {data.purchaseOrders.length === 0 ? <div className="p-5"><Empty icon={Truck} title="سفارش خریدی ثبت نشده" /></div> : mobile ? (
              <div className="space-y-2 px-3 pb-3">
                {data.purchaseOrders.map((p: any) => (
                  <ListCard key={p.id} to={`/scm/purchase-orders/${p.id}`} accent={p.delayed ? '#FF499E' : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="ltr font-bold text-ink">{p.number}</span>
                      <PoStatusPill status={p.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11.5px] text-mist">
                      <span>{date(p.orderedAt ?? p.createdAt)}</span>
                      <span className="num font-semibold text-frost">{money(p.total + p.shippingCost, cur)}</span>
                    </div>
                  </ListCard>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>شماره</th><th>وضعیت</th><th>تاریخ سفارش</th><th>تحویل</th><th>اقلام</th><th>مبلغ</th></tr></thead>
                  <tbody>{data.purchaseOrders.map((p: any) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/scm/purchase-orders/${p.id}`)}>
                      <td className="ltr text-right font-medium">{p.number}</td>
                      <td><PoStatusPill status={p.status} /></td>
                      <td className="text-xs text-mist">{date(p.orderedAt ?? p.createdAt)}</td>
                      <td className={clsx('text-xs', p.delayed ? 'text-rose' : 'text-mist')}>{p.receivedAt ? `دریافت ${date(p.receivedAt)}` : date(p.expectedAt)}</td>
                      <td className="num text-xs">{num(p.qtyReceived)} / {num(p.qtyTotal)}</td>
                      <td className="num">{money(p.total + p.shippingCost)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>

          <DocumentsCard scope={{ supplierId: s.id }} side="purchase" linkLabel="سفارش خرید"
            title="فاکتورهای خرید و رسیدها"
            links={data.purchaseOrders.map((p: any) => ({ id: p.id, label: `${p.number} — ${money(p.total + p.shippingCost, cur)}` }))} />
        </div>

        <div className="space-y-6">
          <Card title="مشخصات" icon={Building2}>
            <KV cols={1} items={[
              ['فرد رابط', s.contactPerson || '—'],
              ['تلفن', s.phone ? <a href={phoneHref(s.phone)} className="ltr text-iris">{s.phone}</a> : '—'],
              ['ایمیل', s.email ? <a href={`mailto:${s.email}`} className="ltr text-iris">{s.email}</a> : '—'],
              ['شهر', [s.country, s.city].filter(Boolean).join('، ') || '—'],
              ['آدرس', s.address || '—'],
              ['زمان تأمین', `${num(s.leadTimeDays)} روز`],
              ['ارزیابی', <Stars value={s.rating} size={13} />],
            ]} />
            {s.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-ink/[0.04] px-3 py-2 text-sm leading-6 text-frost">{s.notes}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {s.phone && <a href={phoneHref(s.phone)} className="flex items-center gap-1 rounded-lg bg-mint/10 px-2.5 py-1.5 text-mint"><Phone size={13} />تماس</a>}
              {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-1 rounded-lg bg-iris/10 px-2.5 py-1.5 text-iris"><Mail size={13} />ایمیل</a>}
              {s.address && <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${s.address} ${s.city}`)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-amber/10 px-2.5 py-1.5 text-amber"><MapPin size={13} />نقشه</a>}
            </div>
          </Card>
          {data.defaultFor.length > 0 && (
            <Card title="تأمین‌کننده پیش‌فرض برای" icon={Timer} subtitle="کالاهایی که خرید مجددشان به این تأمین‌کننده پیشنهاد می‌شود">
              <ul className="space-y-1.5 text-sm">
                {data.defaultFor.map((i: any) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <Link to={`/inventory/items/${i.id}`} className="truncate text-frost hover:text-iris">{i.name}</Link>
                    <span className="num shrink-0 text-xs text-mist">{money(i.cost)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="تاریخچه" icon={History}>
            <Timeline items={data.activity.map((a: any) => ({ id: a.id, at: a.at, title: a.summary, color: '#5EC8E5', meta: dateTime(a.at) }))} empty="رویدادی ثبت نشده" />
          </Card>
        </div>
      </div>
      <SupplierModal supplier={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Every purchase of one item from this supplier, with the change from the previous purchase. */
function PriceHistory({ item, cur }: { item: any; cur: string }) {
  const rows = [...item.history].reverse();
  return (
    <div className="space-y-3 border-t border-line/50 bg-deep/40 px-4 py-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-mist"><th className="py-1.5 text-right font-medium">تاریخ</th><th className="text-right font-medium">سفارش</th><th className="text-right font-medium">تعداد</th><th className="text-right font-medium">قیمت واحد</th><th className="text-right font-medium">نسبت به خرید قبل</th></tr></thead>
          <tbody>
            {rows.map((h: any, i: number) => {
              const prev = rows[i + 1];
              const pct = prev && prev.price > 0 ? Math.round(((h.price - prev.price) / prev.price) * 1000) / 10 : null;
              return (
                <tr key={`${h.poId}-${i}`} className="border-t border-line/40">
                  <td className="py-1.5 text-frost">{date(h.at)}</td>
                  <td><Link to={`/scm/purchase-orders/${h.poId}`} className="ltr text-iris">{h.poNumber}</Link></td>
                  <td className="num">{num(h.qty)}</td>
                  <td className="num font-semibold text-ink">{money(h.price, cur)}</td>
                  <td>{prev ? <Change pct={pct} /> : <span className="text-mist">اولین خرید</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-mist">
        <span>کمترین: <b className="num text-mint">{money(item.minPrice)}</b></span>
        <span>بیشترین: <b className="num text-rose">{money(item.maxPrice)}</b></span>
        <span>جمع خرید: <b className="num text-frost">{money(item.totalSpend, cur)}</b></span>
      </div>
      {item.others.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11.5px] font-semibold text-frost">آخرین قیمت تأمین‌کنندگان دیگر</div>
          <div className="flex flex-wrap gap-2">
            {item.others.map((o: any) => (
              <Link key={o.supplierId} to={`/scm/suppliers/${o.supplierId}`} className="rounded-xl border border-line/60 px-2.5 py-1.5 text-[11.5px] hover:border-iris/60">
                <span className="text-frost">{o.supplierName}</span>{' '}
                <b className={clsx('num', o.unitCost < item.lastPrice ? 'text-mint' : o.unitCost > item.lastPrice ? 'text-rose' : 'text-ink')}>{money(o.unitCost)}</b>
                <span className="text-mist"> · {date(o.at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {item.others.length === 0 && <Pill color="#9DB4C0">از تأمین‌کننده دیگری خریداری نشده</Pill>}
    </div>
  );
}
