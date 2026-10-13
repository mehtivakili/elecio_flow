import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Plus, Warehouse, Pencil, ClipboardCheck } from 'lucide-react';
import clsx from 'clsx';
import { MOVE_KINDS } from '@shared/defaults';
import { post, put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, Field, Filters, Input, ListCard, Modal, PageHeader, Pill, SearchBox, Select, Spinner, Tabs } from '../../components/ui';
import { matchesSearch } from '@shared/search';
import { ItemPicker, WarehousePicker } from '../../components/domain';
import { dateTime, money, num } from '../../lib/format';

const WH_KINDS: Record<string, string> = { parts: 'قطعات و مواد', finished: 'محصول نهایی', repair: 'تعمیرات / قرنطینه' };

export default function StockPage({ view = 'stock' }: { view?: 'stock' | 'moves' }) {
  const { warehouses } = useSession();
  const [tab, setTab] = useState<'levels' | 'warehouses'>('levels');
  const [wh, setWh] = useState('');
  const [search, setSearch] = useState('');
  const [moving, setMoving] = useState(false);
  const [adjusting, setAdjusting] = useState<any>(null);
  const [editingWh, setEditingWh] = useState<any>(null);
  const { data: stock = [], isLoading } = useApi<any[]>('/stock');
  const { data: moves = [] } = useApi<any[]>(view === 'moves' ? '/moves' : null);

  const levels = useMemo(() => stock.filter((s) => (!wh || s.warehouseId === wh) && matchesSearch(`${s.name} ${s.sku}`, search)), [stock, wh, search]);
  const filteredMoves = useMemo(() => moves.filter((m) => (!wh || m.fromWh === wh || m.toWh === wh) && matchesSearch(`${m.itemName} ${m.sku} ${m.note}`, search)), [moves, wh, search]);

  return (
    <div>
      <PageHeader icon={view === 'moves' ? ArrowLeftRight : Warehouse}
        title={view === 'moves' ? 'تراکنش‌های انبار' : 'موجودی انبار'}
        subtitle={view === 'moves' ? 'دفتر مستقل ورود، خروج، انتقال و اصلاح موجودی با مرجع و کاربر ثبت‌کننده' : 'موجودی فعلی، مقدار رزروشده، موجودی آزاد و اصلاح شمارش کالاها'}
        fab={view === 'moves' ? { label: 'تراکنش دستی', icon: Plus, onClick: () => setMoving(true) } : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === 'stock' && <Tabs className="w-full md:w-auto" value={tab} onChange={setTab} tabs={[{ key: 'levels', label: 'سطح موجودی' }, { key: 'warehouses', label: 'انبارها', count: warehouses.length }]} />}
        {(view === 'moves' || tab !== 'warehouses') && <>
          <Filters count={wh ? 1 : 0} onReset={() => setWh('')}>
            <Select className="w-52" value={wh} onChange={(e) => setWh(e.target.value)}>
              <option value="">همه انبارها</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Filters>
          <SearchBox value={search} onChange={setSearch} className="min-w-0 flex-1 md:min-w-[200px]" placeholder="نام یا کد کالا…" />
        </>}
      </div>

      {view === 'stock' && tab === 'levels' && (isLoading ? <Spinner /> : levels.length === 0 ? <Card><Empty title="موجودی ثبت نشده" /></Card> : (<>
        <div className="space-y-2.5 md:hidden">
          {levels.map((s) => {
            const free = s.qty - s.reserved;
            const low = free <= s.reorderPoint && s.reorderPoint > 0;
            return (
              <ListCard key={`${s.itemId}-${s.warehouseId}`} accent={low ? '#FF499E' : undefined}>
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/inventory/items/${s.itemId}`} className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-ink">{s.name}</div>
                    <div className="mt-0.5 text-[11px] text-mist"><span className="ltr">{s.sku}</span> · {s.warehouseName}</div>
                  </Link>
                  <Button size="sm" variant="outline" icon={ClipboardCheck} onClick={() => setAdjusting(s)}>اصلاح</Button>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-deep/60 px-1 py-2.5 text-center">
                  <div><div className="text-[11px] text-mist">موجودی</div><div className="num mt-0.5 font-bold text-ink">{num(s.qty)}</div></div>
                  <div><div className="text-[11px] text-mist">رزرو</div><div className="num mt-0.5 font-bold text-amber">{s.reserved ? num(s.reserved) : '—'}</div></div>
                  <div><div className="text-[11px] text-mist">آزاد</div><div className={clsx('num mt-0.5 font-bold', low ? 'text-rose' : 'text-mint')}>{num(free)}</div></div>
                  <div><div className="text-[11px] text-mist">واحد</div><div className="mt-0.5 truncate font-bold text-frost">{s.unit}</div></div>
                </div>
                <div className="mt-2 text-[11px] text-mist">ارزش: <b className="num font-semibold text-frost">{money(s.qty * s.cost)}</b></div>
              </ListCard>
            );
          })}
        </div>
        <Card pad={false} bodyClass="overflow-x-auto" className="hidden md:block">
          <table className="tbl">
            <thead><tr><th>کالا</th><th>انبار</th><th>موجودی و اصلاح شمارش</th><th>رزرو</th><th>آزاد</th><th>ارزش</th></tr></thead>
            <tbody>{levels.map((s) => (
              <tr key={`${s.itemId}-${s.warehouseId}`}>
                <td><Link to={`/inventory/items/${s.itemId}`} className="text-ink hover:text-iris">{s.name}</Link><div className="ltr text-right text-[11px] text-mist">{s.sku}</div></td>
                <td className="text-xs">{s.warehouseName}</td>
                <td><div className="flex items-center gap-2"><span className="num whitespace-nowrap">{num(s.qty)} <span className="text-xs text-mist">{s.unit}</span></span><Button size="sm" variant="outline" icon={ClipboardCheck} onClick={() => setAdjusting(s)}>اصلاح</Button></div></td>
                <td className="num text-amber">{s.reserved ? num(s.reserved) : '—'}</td>
                <td className={clsx('num font-semibold', s.qty - s.reserved <= s.reorderPoint && s.reorderPoint > 0 ? 'text-rose' : 'text-ink')}>{num(s.qty - s.reserved)}</td>
                <td className="num text-xs text-mist">{money(s.qty * s.cost)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </>))}

      {view === 'moves' && filteredMoves.length > 0 && (
        <div className="space-y-2.5 md:hidden">
          {filteredMoves.map((m) => {
            const inbound = m.toWh && !m.fromWh, outbound = m.fromWh && !m.toWh;
            const color = inbound ? '#0FD69D' : outbound ? '#BE7C38' : '#779BE7';
            const refLink = m.refType === 'po' ? `/scm/purchase-orders/${m.refId}` : m.refType === 'order' ? `/sales/orders/${m.refId}` : m.refType === 'work_order' ? `/production/work-orders/${m.refId}` : null;
            return (
              <ListCard key={m.id} accent={color}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/inventory/items/${m.itemId}`} className="block truncate text-[15px] font-bold text-ink">{m.itemName}</Link>
                    <div className="mt-0.5 text-[11px] text-mist">{dateTime(m.at)} · {m.userName}</div>
                  </div>
                  <div className={clsx('num shrink-0 text-lg font-extrabold', inbound ? 'text-mint' : outbound ? 'text-amber' : 'text-ink')}>{inbound ? '+' : outbound ? '−' : ''}{num(m.qty)}</div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <Pill color={color}>{MOVE_KINDS[m.kind] ?? m.kind}</Pill>
                  <span className="text-frost">{m.fromName ?? '—'}</span>
                  <span className="text-mist">←</span>
                  <span className="text-frost">{m.toName ?? '—'}</span>
                </div>
                {m.note && (refLink
                  ? <Link to={refLink} className="mt-2 block truncate text-xs text-iris">{m.note}</Link>
                  : <p className="mt-2 line-clamp-2 text-xs text-mist">{m.note}</p>)}
              </ListCard>
            );
          })}
        </div>
      )}

      {view === 'moves' && (
        <Card pad={false} bodyClass="overflow-x-auto" className={clsx(filteredMoves.length > 0 && 'hidden md:block')}>
          {filteredMoves.length === 0 ? <Empty title="تراکنشی یافت نشد" /> : (
            <table className="tbl">
              <thead><tr><th>تاریخ</th><th>کالا</th><th>نوع</th><th>مقدار</th><th>از</th><th>به</th><th>مرجع / توضیح</th><th>کاربر</th></tr></thead>
              <tbody>{filteredMoves.map((m) => {
                const inbound = m.toWh && !m.fromWh, outbound = m.fromWh && !m.toWh;
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-xs text-mist">{dateTime(m.at)}</td>
                    <td><Link to={`/inventory/items/${m.itemId}`} className="text-ink hover:text-iris">{m.itemName}</Link></td>
                    <td><Pill color={inbound ? '#0FD69D' : outbound ? '#BE7C38' : '#779BE7'}>{MOVE_KINDS[m.kind] ?? m.kind}</Pill></td>
                    <td className={clsx('num font-semibold', inbound ? 'text-mint' : outbound ? 'text-amber' : '')}>{inbound ? '+' : outbound ? '−' : ''}{num(m.qty)}</td>
                    <td className="text-xs">{m.fromName ?? '—'}</td><td className="text-xs">{m.toName ?? '—'}</td>
                    <td className="max-w-[220px] truncate text-xs text-mist">
                      {m.refType === 'po' ? <Link className="text-iris" to={`/scm/purchase-orders/${m.refId}`}>{m.note}</Link>
                        : m.refType === 'order' ? <Link className="text-iris" to={`/sales/orders/${m.refId}`}>{m.note}</Link>
                          : m.refType === 'work_order' ? <Link className="text-iris" to={`/production/work-orders/${m.refId}`}>{m.note}</Link> : m.note}
                    </td>
                    <td className="text-xs text-mist">{m.userName}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </Card>
      )}

      {view === 'stock' && tab === 'warehouses' && (
        <div className="grid gap-4 md:grid-cols-3">
          {warehouses.map((w) => {
            const rows = stock.filter((s) => s.warehouseId === w.id);
            return (
              <div key={w.id} className="glass p-4 md:p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/15 text-iris"><Warehouse size={18} /></span>
                    <div><div className="font-semibold">{w.name}</div><div className="ltr text-right text-xs text-mist">{w.code}</div></div>
                  </div>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditingWh(w)} />
                </div>
                <div className="mt-4 flex justify-between text-sm"><span className="text-mist">{WH_KINDS[w.kind]}</span><span>{num(rows.length)} قلم</span></div>
                <div className="mt-1 flex justify-between text-sm"><span className="text-mist">ارزش</span><span className="num">{money(rows.reduce((s, r) => s + r.qty * r.cost, 0))}</span></div>
              </div>
            );
          })}
          <button onClick={() => setEditingWh({})} className="flex min-h-[140px] items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-mist hover:border-iris hover:text-iris"><Plus size={16} />انبار جدید</button>
        </div>
      )}

      <MoveModal open={moving} onClose={() => setMoving(false)} />
      <StockAdjustmentModal stock={adjusting} onClose={() => setAdjusting(null)} />
      <WarehouseModal wh={editingWh} onClose={() => setEditingWh(null)} />
    </div>
  );
}

export function StockMovesPage() {
  return <StockPage view="moves" />;
}

export function StockAdjustmentModal({ stock, onClose }: { stock: any | null; onClose: () => void }) {
  const [countedQty, setCountedQty] = useState<number | ''>('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (stock) { setCountedQty(Number(stock.qty)); setNote(''); }
  }, [stock]);
  const difference = stock && countedQty !== '' ? Number(countedQty) - Number(stock.qty) : 0;
  const invalidReserved = !!stock && countedQty !== '' && Number(countedQty) < Number(stock.reserved ?? 0);
  const save = useAction(
    () => post('/stock/adjust', { itemId: stock.itemId, warehouseId: stock.warehouseId, countedQty: Number(countedQty), note: note.trim() }),
    { success: (result: any) => `موجودی اصلاح شد (${result.difference > 0 ? '+' : ''}${num(result.difference)})`, onSuccess: onClose },
  );
  return <Modal open={!!stock} onClose={onClose} title="اصلاح موجودی پس از شمارش" subtitle={stock ? `${stock.name} · ${stock.warehouseName}` : undefined} icon={ClipboardCheck} size="sm"
    footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={save.isPending} disabled={countedQty === '' || Number(countedQty) < 0 || invalidReserved || difference === 0 || !note.trim()} onClick={() => save.mutate(undefined)}>ثبت اصلاح موجودی</Button></>}>
    {stock && <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-ink/[0.04] p-3"><div className="text-[10px] text-mist">موجودی فعلی</div><div className="num mt-1 font-bold text-ink">{num(stock.qty)}</div></div>
        <div className="rounded-xl bg-amber/[0.07] p-3"><div className="text-[10px] text-mist">رزروشده</div><div className="num mt-1 font-bold text-amber">{num(stock.reserved ?? 0)}</div></div>
        <div className="rounded-xl bg-iris/[0.07] p-3"><div className="text-[10px] text-mist">اختلاف</div><div className={clsx('num mt-1 font-bold', difference > 0 ? 'text-mint' : difference < 0 ? 'text-rose' : 'text-mist')}>{difference > 0 ? '+' : ''}{num(difference)}</div></div>
      </div>
      <Field label={`تعداد واقعی شمارش‌شده (${stock.unit})`} hint="عدد نهایی روی قفسه را وارد کنید؛ سیستم اختلاف را محاسبه می‌کند.">
        <Input autoFocus type="number" min={0} step="any" value={countedQty} onChange={(e) => setCountedQty(e.target.value === '' ? '' : Number(e.target.value))} />
      </Field>
      {invalidReserved && <p className="rounded-xl bg-rose/10 px-3 py-2 text-xs leading-6 text-rose">این مقدار از {num(stock.reserved)} واحد رزروشده کمتر است. ابتدا رزرو سفارش‌ها را بررسی یا آزاد کنید.</p>}
      <Field label="دلیل اصلاح" hint="این توضیح در دفتر تراکنش‌های انبار ثبت می‌شود.">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً اختلاف شمارش دوره‌ای، خرابی یا ضایعات" />
      </Field>
    </div>}
  </Modal>;
}

function MoveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<any>({ kind: 'receipt', itemId: null, qty: 1, fromWh: null, toWh: null, warehouseId: null, note: '' });
  const save = useAction(() => post('/moves', f), { success: 'تراکنش ثبت شد', onSuccess: () => { onClose(); setF({ ...f, itemId: null, qty: 1, note: '' }); } });
  return (
    <Modal open={open} onClose={onClose} title="تراکنش دستی انبار" subtitle="کالاهای سریالی فقط از مسیر تولید، سفارش و تعمیر جابه‌جا می‌شوند" icon={ArrowLeftRight} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.itemId || !f.qty} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت</Button></>}>
      <div className="space-y-4">
        <Field label="نوع تراکنش">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="receipt">ورود به انبار</option><option value="issue">خروج از انبار</option>
            <option value="transfer">انتقال بین انبار</option><option value="adjust">اصلاح موجودی (شمارش)</option>
          </Select>
        </Field>
        <Field label="کالا"><ItemPicker value={f.itemId} kinds={['component', 'product']} onChange={(v) => setF({ ...f, itemId: v })} /></Field>
        <Field label="مقدار" hint={f.kind === 'adjust' ? 'مثبت = افزایش، منفی = کاهش' : undefined}><Input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} /></Field>
        {(f.kind === 'issue' || f.kind === 'transfer') && <Field label="از انبار"><WarehousePicker value={f.fromWh} onChange={(v) => setF({ ...f, fromWh: v })} /></Field>}
        {(f.kind === 'receipt' || f.kind === 'transfer') && <Field label="به انبار"><WarehousePicker value={f.toWh} onChange={(v) => setF({ ...f, toWh: v })} /></Field>}
        {f.kind === 'adjust' && <Field label="انبار"><WarehousePicker value={f.warehouseId} onChange={(v) => setF({ ...f, warehouseId: v })} /></Field>}
        <Field label="توضیح"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function WarehouseModal({ wh, onClose }: { wh: any | null; onClose: () => void }) {
  const { refresh } = useSession();
  const [f, setF] = useState<any>({});
  const isOpen = !!wh;
  useEffect(() => { if (wh) setF({ kind: 'parts', ...wh }); }, [wh]);
  const save = useAction(() => (wh?.id ? put(`/warehouses/${wh.id}`, f) : post('/warehouses', f)), { success: 'انبار ذخیره شد', onSuccess: () => { refresh(); onClose(); } });
  return (
    <Modal open={isOpen} onClose={onClose} title={wh?.id ? 'ویرایش انبار' : 'انبار جدید'} icon={Warehouse} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.name || !f.code} loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</Button></>}>
      <div className="space-y-4">
        <Field label="نام"><Input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="کد"><Input className="ltr" value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="نوع"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(WH_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="آدرس"><Input value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
