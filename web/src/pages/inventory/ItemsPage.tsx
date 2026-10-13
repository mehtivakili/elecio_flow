import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Plus, AlertTriangle, Layers } from 'lucide-react';
import clsx from 'clsx';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Card, Empty, ListCard, PageHeader, Pill, SearchBox, Spinner, Stat, Tabs } from '../../components/ui';
import { ItemFormModal } from '../../components/items';
import { compactMoney, money, num } from '../../lib/format';
import { matchesSearch } from '@shared/search';

export default function ItemsPage() {
  const { settings } = useSession();
  const navigate = useNavigate();
  const { data = [], isLoading } = useApi<any[]>('/items');
  const [kind, setKind] = useState<'all' | 'product' | 'component' | 'service' | 'reorder'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any>(null);

  const list = useMemo(() => data.filter((i) =>
    (kind === 'all' || (kind === 'reorder' ? i.needsReorder : i.kind === kind))
    && matchesSearch(`${i.name} ${i.sku} ${i.category}`, search)), [data, kind, search]);
  const stockValue = data.reduce((s, i) => s + i.onHand * i.cost, 0);

  return (
    <div>
      <PageHeader icon={Boxes} title="کالاها و قطعات" subtitle="محصولات نهایی، قطعات تولید و خدمات — با موجودی آزاد، رزرو و در راه"
        fab={{ label: 'تعریف کالا', icon: Plus, onClick: () => setEditing({}) }} />
      <div className="stat-rail mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="ارزش موجودی" value={compactMoney(stockValue)} hint={settings.company.currency} tone="mint" />
        <Stat label="محصولات نهایی" value={num(data.filter((i) => i.kind === 'product').length)} tone="iris" />
        <Stat label="قطعات" value={num(data.filter((i) => i.kind === 'component').length)} tone="sky" />
        <Stat label="زیر نقطه سفارش" value={num(data.filter((i) => i.needsReorder).length)} tone="rose" alert={data.some((i) => i.needsReorder)} onClick={() => setKind('reorder')} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs className="w-full md:w-auto" value={kind} onChange={setKind} tabs={[
          { key: 'all', label: 'همه', count: data.length },
          { key: 'product', label: 'محصول نهایی' }, { key: 'component', label: 'قطعات' }, { key: 'service', label: 'خدمات' },
          { key: 'reorder', label: 'نیاز به خرید', count: data.filter((i) => i.needsReorder).length },
        ]} />
        <SearchBox value={search} onChange={setSearch} placeholder="نام یا کد کالا…" className="min-w-0 flex-1 md:min-w-[220px]" />
      </div>
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={Boxes} title="کالایی یافت نشد" /></Card> : (<>
        <div className="space-y-2.5 md:hidden">
          {list.map((i) => (
            <ListCard key={i.id} to={`/inventory/items/${i.id}`} accent={i.needsReorder ? '#FF499E' : undefined} className={clsx(!i.active && 'opacity-50')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[15px] font-bold text-ink"><span className="truncate">{i.name}</span>{i.bomCount ? <Layers size={13} className="shrink-0 text-mist" /> : null}</div>
                  <div className="ltr mt-0.5 text-right text-[11px] text-mist">{i.sku}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {i.serialized ? <Pill color="#779BE7">سریالی</Pill> : null}
                  <Pill color={i.kind === 'product' ? '#B48CF2' : i.kind === 'component' ? '#5EC8E5' : '#9DB4C0'}>{i.kind === 'product' ? 'محصول' : i.kind === 'component' ? 'قطعه' : 'خدمت'}</Pill>
                </div>
              </div>
              {i.kind !== 'service' && (
                <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-deep/60 px-1 py-2.5 text-center">
                  <div><div className="text-[11px] text-mist">موجودی</div><div className="num mt-0.5 font-bold text-ink">{num(i.onHand)}</div></div>
                  <div><div className="text-[11px] text-mist">رزرو</div><div className="num mt-0.5 font-bold text-amber">{i.reserved ? num(i.reserved) : '—'}</div></div>
                  <div><div className="text-[11px] text-mist">آزاد</div><div className={clsx('num mt-0.5 flex items-center justify-center gap-1 font-bold', i.needsReorder ? 'text-rose' : 'text-mint')}>{num(i.available)}{i.needsReorder && <AlertTriangle size={12} />}</div></div>
                  <div><div className="text-[11px] text-mist">در راه</div><div className="num mt-0.5 font-bold text-sky">{i.incoming ? num(i.incoming) : '—'}</div></div>
                </div>
              )}
              <div className="mt-2.5 flex justify-between gap-2 text-[11px] text-mist">
                <span>بهای تمام‌شده <b className="num font-semibold text-frost">{money(i.cost)}</b></span>
                {i.kind !== 'component' && <span>فروش <b className="num font-semibold text-frost">{money(i.price)}</b></span>}
              </div>
            </ListCard>
          ))}
        </div>
        <Card pad={false} bodyClass="overflow-x-auto" className="hidden md:block">
          <table className="tbl">
            <thead><tr><th>کالا</th><th>نوع</th><th>موجودی</th><th>رزرو</th><th>آزاد</th><th>در راه</th><th>نقطه سفارش</th><th>بهای تمام‌شده</th><th>قیمت فروش</th></tr></thead>
            <tbody>{list.map((i) => (
              <tr key={i.id} className={clsx('cursor-pointer', !i.active && 'opacity-50')} onClick={() => navigate(`/inventory/items/${i.id}`)}>
                <td>
                  <div className="flex items-center gap-2 text-ink">{i.name}{i.serialized ? <Pill color="#779BE7">سریالی</Pill> : null}{i.bomCount ? <Layers size={13} className="text-mist" /> : null}</div>
                  <div className="ltr text-right text-[11px] text-mist">{i.sku}</div>
                </td>
                <td className="text-xs text-mist">{i.kind === 'product' ? 'محصول' : i.kind === 'component' ? 'قطعه' : 'خدمت'}</td>
                {i.kind === 'service' ? <td colSpan={5} className="text-xs text-mist">—</td> : <>
                  <td className="num">{num(i.onHand)}</td>
                  <td className="num text-amber">{i.reserved ? num(i.reserved) : '—'}</td>
                  <td className={clsx('num font-semibold', i.needsReorder ? 'text-rose' : 'text-ink')}>
                    <span className="flex items-center gap-1">{num(i.available)}{i.needsReorder && <AlertTriangle size={13} />}</span>
                  </td>
                  <td className="num text-sky">{i.incoming ? num(i.incoming) : '—'}</td>
                  <td className="num text-mist">{num(i.reorderPoint)}</td>
                </>}
                <td className="num text-xs">{money(i.cost)}</td>
                <td className="num text-xs">{i.kind === 'component' ? '—' : money(i.price)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </>)}
      <ItemFormModal item={editing} onClose={() => setEditing(null)} onSaved={(id) => navigate(`/inventory/items/${id}`)} />
    </div>
  );
}
