import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Plus, Warehouse, Pencil } from 'lucide-react';
import clsx from 'clsx';
import { MOVE_KINDS } from '@shared/defaults';
import { post, put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Pill, SearchBox, Select, Spinner, Tabs } from '../../components/ui';
import { ItemPicker, WarehousePicker } from '../../components/domain';
import { dateTime, money, num } from '../../lib/format';

const WH_KINDS: Record<string, string> = { parts: 'قطعات و مواد', finished: 'محصول نهایی', repair: 'تعمیرات / قرنطینه' };

export default function StockPage() {
  const { warehouses } = useSession();
  const [tab, setTab] = useState<'levels' | 'moves' | 'warehouses'>('levels');
  const [wh, setWh] = useState('');
  const [search, setSearch] = useState('');
  const [moving, setMoving] = useState(false);
  const [editingWh, setEditingWh] = useState<any>(null);
  const { data: stock = [], isLoading } = useApi<any[]>('/stock');
  const { data: moves = [] } = useApi<any[]>(tab === 'moves' ? '/moves' : null);

  const levels = useMemo(() => stock.filter((s) => (!wh || s.warehouseId === wh) && (!search || `${s.name} ${s.sku}`.includes(search))), [stock, wh, search]);
  const filteredMoves = useMemo(() => moves.filter((m) => (!wh || m.fromWh === wh || m.toWh === wh) && (!search || `${m.itemName} ${m.sku} ${m.note}`.includes(search))), [moves, wh, search]);

  return (
    <div>
      <PageHeader icon={ArrowLeftRight} title="موجودی و تراکنش‌های انبار" subtitle="هر تغییر موجودی یک سطر در دفتر انبار است — قابل ردیابی تا سند مبدأ"
        actions={<Button variant="glow" icon={Plus} onClick={() => setMoving(true)}>تراکنش دستی</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'levels', label: 'سطح موجودی' }, { key: 'moves', label: 'دفتر تراکنش‌ها' }, { key: 'warehouses', label: 'انبارها', count: warehouses.length }]} />
        {tab !== 'warehouses' && <>
          <Select className="w-52" value={wh} onChange={(e) => setWh(e.target.value)}>
            <option value="">همه انبارها</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <SearchBox value={search} onChange={setSearch} className="min-w-[200px] flex-1" />
        </>}
      </div>

      {tab === 'levels' && (isLoading ? <Spinner /> : levels.length === 0 ? <Card><Empty title="موجودی ثبت نشده" /></Card> : (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>کالا</th><th>انبار</th><th>موجودی</th><th>رزرو</th><th>آزاد</th><th>ارزش</th></tr></thead>
            <tbody>{levels.map((s) => (
              <tr key={`${s.itemId}-${s.warehouseId}`}>
                <td><Link to={`/inventory/items/${s.itemId}`} className="text-ink hover:text-iris">{s.name}</Link><div className="ltr text-right text-[11px] text-mist">{s.sku}</div></td>
                <td className="text-xs">{s.warehouseName}</td>
                <td className="num">{num(s.qty)} <span className="text-xs text-mist">{s.unit}</span></td>
                <td className="num text-amber">{s.reserved ? num(s.reserved) : '—'}</td>
                <td className={clsx('num font-semibold', s.qty - s.reserved <= s.reorderPoint && s.reorderPoint > 0 ? 'text-rose' : 'text-ink')}>{num(s.qty - s.reserved)}</td>
                <td className="num text-xs text-mist">{money(s.qty * s.cost)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      ))}

      {tab === 'moves' && (
        <Card pad={false} bodyClass="overflow-x-auto">
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

      {tab === 'warehouses' && (
        <div className="grid gap-4 md:grid-cols-3">
          {warehouses.map((w) => {
            const rows = stock.filter((s) => s.warehouseId === w.id);
            return (
              <div key={w.id} className="glass p-5">
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
      <WarehouseModal wh={editingWh} onClose={() => setEditingWh(null)} />
    </div>
  );
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
