import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Truck, Send, CheckCircle2, Navigation, PackageCheck, Ban, History, AlertTriangle } from 'lucide-react';
import { PO_STATUS } from '@shared/defaults';
import { post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Field, Input, KV, Modal, PageHeader, Progress, Spinner, useConfirm } from '../../components/ui';
import { PoStatusPill, WarehousePicker } from '../../components/domain';
import { Timeline } from '../../components/flow';
import { DocumentsCard } from '../../components/documents';
import { date, dateTime, money, num } from '../../lib/format';

const FLOW = ['draft', 'sent', 'confirmed', 'in_transit', 'partial', 'received'];

export default function PurchaseOrderPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const { settings, warehouses } = useSession();
  const { data, isLoading } = useApi<any>(`/purchase-orders/${id}`);
  const [receiving, setReceiving] = useState(false);
  const setStatus = useAction((body: any) => post(`/purchase-orders/${id}/status`, body), { success: 'وضعیت سفارش خرید به‌روز شد' });

  if (isLoading || !data) return <Spinner />;
  const p = data.po;
  const idx = FLOW.indexOf(p.status);
  const canReceive = ['sent', 'confirmed', 'in_transit', 'partial'].includes(p.status);

  return (
    <div className="space-y-6">
      <PageHeader hero eyebrow="سفارش خرید"
        icon={Truck}
        title={<span className="flex items-center gap-3"><span className="ltr">{p.number}</span><PoStatusPill status={p.status} /></span>}
        subtitle={`${p.supplierName} · ثبت ${date(p.createdAt)}`}
        actions={<>
          {p.status === 'draft' && <Button variant="action" icon={Send} onClick={() => setStatus.mutate({ status: 'sent' })}>ارسال به تأمین‌کننده</Button>}
          {p.status === 'sent' && <Button variant="action" icon={CheckCircle2} onClick={() => setStatus.mutate({ status: 'confirmed' })}>تأیید تأمین‌کننده</Button>}
          {['sent', 'confirmed'].includes(p.status) && (
            <Button variant="outline" icon={Navigation} onClick={async () => {
              const tracking = await confirm({ title: 'ثبت حرکت محموله', confirm: 'ثبت', input: { label: 'کد رهگیری / بارنامه' } });
              if (tracking) setStatus.mutate({ status: 'in_transit', trackingNo: tracking === 'ok' ? undefined : tracking });
            }}>در مسیر حمل</Button>
          )}
          {canReceive && <Button variant="glow" icon={PackageCheck} onClick={() => setReceiving(true)}>ثبت رسید انبار</Button>}
          {['draft', 'sent', 'confirmed'].includes(p.status) && (
            <Button variant="danger" icon={Ban} onClick={async () => (await confirm({ title: 'لغو سفارش خرید', danger: true })) && setStatus.mutate({ status: 'cancelled' })} />
          )}
        </>}
      />

      {p.delayed && (
        <div className="glass flex items-center gap-3 border-rose/40 bg-rose/10 p-4 text-sm">
          <AlertTriangle className="text-rose" size={20} />
          <span>این محموله <b className="num">{num(p.delayDays)}</b> روز از تاریخ تحویل عقب است. تولیدی که به این قطعات وابسته است ممکن است متوقف شود.</span>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {FLOW.filter((s) => s !== 'partial' || p.status === 'partial').map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${p.status === 'cancelled' ? 'bg-ink/5 text-mist' : FLOW.indexOf(s) <= idx ? 'text-night' : 'bg-ink/[0.05] text-mist'}`}
                style={p.status !== 'cancelled' && FLOW.indexOf(s) <= idx ? { background: PO_STATUS[s].color } : undefined}>{PO_STATUS[s].label}</span>
              {i < FLOW.length - 2 && <span className="h-px w-5 bg-line" />}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card title="اقلام" pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>قطعه</th><th>سفارش</th><th>دریافت‌شده</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
            <tbody>{data.lines.map((l: any) => (
              <tr key={l.id}>
                <td><Link to={`/inventory/items/${l.itemId}`} className="text-ink hover:text-iris">{l.name}</Link><div className="ltr text-right text-[11px] text-mist">{l.sku}</div></td>
                <td className="num">{num(l.qty)} {l.unit}</td>
                <td className="w-36"><Progress value={(l.receivedQty / l.qty) * 100} color="#0FD69D" /><div className="num mt-1 text-[11px] text-mist">{num(l.receivedQty)} از {num(l.qty)}</div></td>
                <td className="num">{money(l.unitCost)}</td>
                <td className="num">{money(l.qty * l.unitCost)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <div className="space-y-6">
          <Card title="جزئیات">
            <KV cols={1} items={[
              ['تأمین‌کننده', <Link to={`/scm/suppliers/${p.supplierId}`} className="text-iris hover:underline">{p.supplierName}</Link>],
              ['تاریخ سفارش', date(p.orderedAt)],
              ['تحویل مورد انتظار', <span className={p.delayed ? 'text-rose' : ''}>{date(p.expectedAt)}</span>],
              ['تاریخ دریافت', date(p.receivedAt)],
              ['روش حمل', p.shippingMethod || '—'],
              ['کد رهگیری', <span className="ltr">{p.trackingNo || '—'}</span>],
              ['هزینه حمل/گمرک', money(p.shippingCost)],
              ['جمع کل', <b>{money(p.total + p.shippingCost, settings.company.currency)}</b>],
            ]} />
          </Card>
          <DocumentsCard scope={{ poId: p.id }} side="purchase" compact title="فاکتور خرید و رسیدها" />
          <Card title="رسیدها و تاریخچه" icon={History}>
            <Timeline items={[
              ...data.moves.map((m: any) => ({ id: m.id, at: m.at, color: '#0FD69D', title: `رسید ${num(m.qty)} ${m.itemName}`, meta: warehouses.find((w) => w.id === m.toWh)?.name })),
              ...data.activity.map((a: any) => ({ id: a.id, at: a.at, title: a.summary, color: '#5EC8E5', meta: dateTime(a.at) })),
            ].sort((a, b) => b.at - a.at)} />
          </Card>
        </div>
      </div>
      <ReceiveModal open={receiving} onClose={() => setReceiving(false)} poId={p.id} lines={data.lines} />
    </div>
  );
}

function ReceiveModal({ open, onClose, poId, lines }: { open: boolean; onClose: () => void; poId: string; lines: any[] }) {
  const { warehouses } = useSession();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    setWarehouseId(warehouses.find((w) => w.kind === 'parts')?.id ?? warehouses[0]?.id ?? null);
    setQty(Object.fromEntries(lines.map((l) => [l.id, Math.max(0, l.qty - l.receivedQty)])));
  }, [open, lines, warehouses]);
  const save = useAction(() => post(`/purchase-orders/${poId}/receive`, { warehouseId, lines: Object.entries(qty).map(([lineId, q]) => ({ lineId, qty: q })) }), {
    success: 'رسید انبار ثبت شد و موجودی افزایش یافت', onSuccess: onClose,
  });
  return (
    <Modal open={open} onClose={onClose} title="ثبت رسید انبار" subtitle="مقادیر دریافتی واقعی را وارد کنید — دریافت جزئی مجاز است" icon={PackageCheck}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!warehouseId} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت رسید</Button></>}>
      <Field label="انبار مقصد" className="mb-4"><WarehousePicker value={warehouseId} onChange={setWarehouseId} /></Field>
      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.04] px-3 py-2">
            <div className="min-w-0 text-sm"><div className="truncate text-ink">{l.name}</div><div className="text-[11px] text-mist">باقی‌مانده: {num(l.qty - l.receivedQty)} {l.unit}</div></div>
            <Input type="number" min={0} className="w-24" value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
