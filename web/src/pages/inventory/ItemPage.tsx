import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Boxes, Pencil, Layers, Warehouse, ArrowLeftRight, Plus, Trash2, Save, Cpu, Factory } from 'lucide-react';
import clsx from 'clsx';
import { MOVE_KINDS, UNIT_STATUS } from '@shared/defaults';
import { put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Input, KV, PageHeader, Pill, Spinner } from '../../components/ui';
import { ItemPicker } from '../../components/domain';
import { ItemFormModal } from '../../components/items';
import { StackStrip } from '../../components/charts';
import { dateTime, money, num } from '../../lib/format';

export default function ItemPage() {
  const { id } = useParams();
  const { settings } = useSession();
  const { data, isLoading } = useApi<any>(`/items/${id}`);
  const [editing, setEditing] = useState<any>(null);
  const [bom, setBom] = useState<{ componentId: string | null; qty: number }[] | null>(null);
  useEffect(() => { setBom(null); }, [id]);
  const saveBom = useAction(() => put(`/items/${id}/bom`, { lines: (bom ?? []).filter((l) => l.componentId) }), { success: 'BOM ذخیره شد', onSuccess: () => setBom(null) });

  if (isLoading || !data) return <Spinner />;
  const i = data.item;
  const buildable = data.bom.length ? Math.min(...data.bom.map((b: any) => Math.floor(b.available / b.qty))) : null;
  const bomCost = data.bom.reduce((s: number, b: any) => s + b.qty * b.cost, 0);
  const margin = i.price && bomCost ? Math.round(((i.price - bomCost) / i.price) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader icon={Boxes}
        title={<span className="flex items-center gap-2">{i.name}{i.serialized ? <Pill color="#779BE7">سریالی</Pill> : null}{i.needsReorder && <Pill color="#FF499E">زیر نقطه سفارش</Pill>}</span>}
        subtitle={<span className="ltr">{i.sku}</span>}
        actions={<Button variant="outline" icon={Pencil} onClick={() => setEditing(i)}>ویرایش</Button>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['موجودی کل', num(i.onHand), 'text-ink'], ['رزرو برای سفارش', num(i.reserved), 'text-amber'], ['آزاد', num(i.available), i.needsReorder ? 'text-rose' : 'text-mint'],
          ['در راه (خرید)', num(i.incoming), 'text-sky'], [i.kind === 'product' && buildable !== null ? 'قابل ساخت با موجودی فعلی' : 'نقطه سفارش', i.kind === 'product' && buildable !== null ? num(buildable) : num(i.reorderPoint), 'text-iris'],
        ].map(([label, value, tone]) => (
          <div key={label} className="glass p-4"><div className="text-xs text-mist">{label}</div><div className={clsx('num mt-1 text-2xl font-bold', tone)}>{value}</div></div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {i.kind === 'product' && (
            <Card title="فهرست مواد (BOM)" subtitle="قطعات لازم برای ساخت یک دستگاه — مصرف خودکار در مرحله کیتینگ" icon={Layers}
              actions={bom
                ? <><Button size="sm" variant="ghost" onClick={() => setBom(null)}>انصراف</Button><Button size="sm" variant="action" icon={Save} loading={saveBom.isPending} onClick={() => saveBom.mutate(undefined)}>ذخیره BOM</Button></>
                : <Button size="sm" variant="outline" icon={Pencil} onClick={() => setBom(data.bom.map((b: any) => ({ componentId: b.componentId, qty: b.qty })))}>ویرایش</Button>}
              pad={false} bodyClass="overflow-x-auto">
              {bom ? (
                <div className="space-y-2 p-4">
                  {bom.map((l, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <ItemPicker value={l.componentId} kinds={['component']} onChange={(v) => setBom(bom.map((x, j) => (j === idx ? { ...x, componentId: v } : x)))} />
                      <Input type="number" step="0.5" className="w-24" value={l.qty} onChange={(e) => setBom(bom.map((x, j) => (j === idx ? { ...x, qty: Number(e.target.value) } : x)))} />
                      <Button variant="ghost" icon={Trash2} onClick={() => setBom(bom.filter((_, j) => j !== idx))} />
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => setBom([...bom, { componentId: null, qty: 1 }])}>افزودن قطعه</Button>
                </div>
              ) : data.bom.length === 0 ? <p className="px-5 pb-5 text-sm text-mist">BOM تعریف نشده — بدون آن، تولید قطعه‌ای مصرف نمی‌کند.</p> : (
                <table className="tbl">
                  <thead><tr><th>قطعه</th><th>مقدار برای هر دستگاه</th><th>موجودی آزاد</th><th>کافی برای</th><th>بها</th></tr></thead>
                  <tbody>{data.bom.map((b: any) => {
                    const enough = Math.floor(b.available / b.qty);
                    return (
                      <tr key={b.id}>
                        <td><Link to={`/inventory/items/${b.componentId}`} className="text-ink hover:text-iris">{b.name}</Link><div className="ltr text-right text-[11px] text-mist">{b.sku}</div></td>
                        <td className="num">{num(b.qty, 2)} {b.unit}</td>
                        <td className="num">{num(b.available)}</td>
                        <td className={clsx('num font-semibold', enough === buildable ? 'text-amber' : 'text-ink')}>{num(enough)} دستگاه{enough === buildable && <span className="mr-1 text-[10px] font-normal">(گلوگاه)</span>}</td>
                        <td className="num text-xs">{money(b.qty * b.cost)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </Card>
          )}

          <Card title="کاردکس — آخرین جابه‌جایی‌ها" icon={ArrowLeftRight} pad={false} bodyClass="overflow-x-auto">
            {data.moves.length === 0 ? <p className="px-5 pb-5 text-sm text-mist">تراکنشی ثبت نشده</p> : (
              <table className="tbl">
                <thead><tr><th>تاریخ</th><th>نوع</th><th>مقدار</th><th>از</th><th>به</th><th>مرجع</th></tr></thead>
                <tbody>{data.moves.map((m: any) => (
                  <tr key={m.id}>
                    <td className="text-xs text-mist">{dateTime(m.at)}</td>
                    <td><Pill color={m.toWh && !m.fromWh ? '#0FD69D' : m.fromWh && !m.toWh ? '#BE7C38' : '#779BE7'}>{MOVE_KINDS[m.kind] ?? m.kind}</Pill></td>
                    <td className={clsx('num font-semibold', m.toWh && !m.fromWh ? 'text-mint' : m.fromWh && !m.toWh ? 'text-amber' : 'text-ink')}>{m.toWh && !m.fromWh ? '+' : m.fromWh && !m.toWh ? '−' : ''}{num(m.qty)}</td>
                    <td className="text-xs">{m.fromName ?? '—'}</td><td className="text-xs">{m.toName ?? '—'}</td>
                    <td className="text-xs text-mist">{m.note}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="موجودی در انبارها" icon={Warehouse}>
            {data.stock.length === 0 ? <p className="text-sm text-mist">موجودی ثبت نشده</p> : (
              <ul className="space-y-2">{data.stock.map((s: any) => (
                <li key={s.warehouseId} className="flex items-center justify-between rounded-xl bg-ink/[0.04] px-3 py-2 text-sm">
                  <span>{s.warehouseName}</span>
                  <span className="num">{num(s.qty)}{s.reserved ? <span className="mr-1.5 text-xs text-amber">({num(s.reserved)} رزرو)</span> : null}</span>
                </li>
              ))}</ul>
            )}
          </Card>
          {i.serialized ? (
            <Card title="دستگاه‌ها بر اساس وضعیت" icon={Cpu} actions={<Link to="/units" className="text-xs text-iris">همه سریال‌ها</Link>}>
              <StackStrip parts={data.units.map((u: any) => ({ key: u.status, label: UNIT_STATUS[u.status]?.label ?? u.status, color: UNIT_STATUS[u.status]?.color ?? '#5C6B73', value: u.n }))} />
            </Card>
          ) : null}
          {data.usedIn.length > 0 && (
            <Card title="مصرف در محصولات" icon={Factory}>
              <ul className="space-y-1.5 text-sm">{data.usedIn.map((u: any) => (
                <li key={u.id} className="flex justify-between"><Link to={`/inventory/items/${u.id}`} className="text-frost hover:text-iris">{u.name}</Link><span className="num text-mist">×{num(u.qty, 2)}</span></li>
              ))}</ul>
            </Card>
          )}
          <Card title="مشخصات">
            <KV cols={1} items={[
              ['دسته', i.category || '—'], ['واحد', i.unit],
              ['بهای تمام‌شده', money(i.cost, settings.company.currency)],
              ...(i.kind !== 'component' ? [['قیمت فروش', money(i.price, settings.company.currency)] as [string, any]] : []),
              ...(bomCost ? [['بهای مواد طبق BOM', money(bomCost)] as [string, any]] : []),
              ...(margin !== null ? [['حاشیه سود ناخالص', <span className={margin > 40 ? 'text-mint' : 'text-amber'}>{num(margin)}٪</span>] as [string, any]] : []),
              ['تأمین‌کننده', i.supplierName ?? '—'], ['زمان تأمین', `${num(i.leadTimeDays)} روز`],
              ...(i.kind === 'product' ? [['گارانتی', `${num(i.warrantyMonths ?? settings.company.warrantyMonths)} ماه`], ['نسخه سخت‌افزار / فریمور', <span className="ltr">{i.hwRev} / {i.fwVersion}</span>]] as [string, any][] : []),
            ]} />
            {i.description && <p className="mt-4 text-sm leading-6 text-frost">{i.description}</p>}
          </Card>
        </div>
      </div>
      <ItemFormModal item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
