import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Plus, AlertTriangle, Layers } from 'lucide-react';
import clsx from 'clsx';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, PageHeader, Pill, SearchBox, Spinner, Stat, Tabs } from '../../components/ui';
import { ItemFormModal } from '../../components/items';
import { compactMoney, money, num } from '../../lib/format';

export default function ItemsPage() {
  const { settings } = useSession();
  const navigate = useNavigate();
  const { data = [], isLoading } = useApi<any[]>('/items');
  const [kind, setKind] = useState<'all' | 'product' | 'component' | 'service' | 'reorder'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any>(null);

  const list = useMemo(() => data.filter((i) =>
    (kind === 'all' || (kind === 'reorder' ? i.needsReorder : i.kind === kind))
    && (!search || `${i.name} ${i.sku} ${i.category}`.toLowerCase().includes(search.toLowerCase()))), [data, kind, search]);
  const stockValue = data.reduce((s, i) => s + i.onHand * i.cost, 0);

  return (
    <div>
      <PageHeader icon={Boxes} title="کالاها و قطعات" subtitle="محصولات نهایی، قطعات تولید و خدمات — با موجودی آزاد، رزرو و در راه"
        actions={<Button variant="glow" icon={Plus} onClick={() => setEditing({})}>تعریف کالا</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="ارزش موجودی" value={compactMoney(stockValue)} hint={settings.company.currency} tone="mint" />
        <Stat label="محصولات نهایی" value={num(data.filter((i) => i.kind === 'product').length)} tone="iris" />
        <Stat label="قطعات" value={num(data.filter((i) => i.kind === 'component').length)} tone="sky" />
        <Stat label="زیر نقطه سفارش" value={num(data.filter((i) => i.needsReorder).length)} tone="rose" alert={data.some((i) => i.needsReorder)} onClick={() => setKind('reorder')} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={kind} onChange={setKind} tabs={[
          { key: 'all', label: 'همه', count: data.length },
          { key: 'product', label: 'محصول نهایی' }, { key: 'component', label: 'قطعات' }, { key: 'service', label: 'خدمات' },
          { key: 'reorder', label: 'نیاز به خرید', count: data.filter((i) => i.needsReorder).length },
        ]} />
        <SearchBox value={search} onChange={setSearch} placeholder="نام یا کد کالا…" className="min-w-[220px] flex-1" />
      </div>
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={Boxes} title="کالایی یافت نشد" /></Card> : (
        <Card pad={false} bodyClass="overflow-x-auto">
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
      )}
      <ItemFormModal item={editing} onClose={() => setEditing(null)} onSaved={(id) => navigate(`/inventory/items/${id}`)} />
    </div>
  );
}
