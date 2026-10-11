import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cpu, ScanLine } from 'lucide-react';
import { UNIT_STATUS } from '@shared/defaults';
import { useApi } from '../../lib/hooks';
import { Card, Empty, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { UnitStatusPill, WarrantyBadge } from '../../components/domain';
import { StackStrip } from '../../components/charts';
import { date, num } from '../../lib/format';

export default function UnitsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data = [], isLoading } = useApi<any[]>('/units');
  const [search, setSearch] = useState('');
  const status = params.get('status') ?? '';
  const warranty = params.get('warranty') ?? '';
  const set = (k: string, v: string) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };

  const list = useMemo(() => {
    const soon = Date.now() + 30 * 86_400_000;
    return data.filter((u) =>
      (!status || u.status === status)
      && (!warranty || (warranty === 'expiring' ? u.warrantyUntil && u.warrantyUntil > Date.now() && u.warrantyUntil < soon : warranty === 'expired' ? u.warrantyUntil && u.warrantyUntil < Date.now() : true))
      && (!search || `${u.serial} ${u.contactName ?? ''} ${u.orderNumber ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  }, [data, status, warranty, search]);
  const counts = Object.fromEntries(Object.keys(UNIT_STATUS).map((k) => [k, data.filter((u) => u.status === k).length]));

  return (
    <div>
      <PageHeader icon={Cpu} title="شناسنامه دستگاه‌ها" subtitle="هر دستگاه با شماره سریال: از کیتینگ و QC تا ارسال، نصب، گارانتی و تعمیر" />
      <Card className="mb-5"><StackStrip parts={Object.entries(UNIT_STATUS).map(([key, s]) => ({ key, label: s.label, color: s.color, value: counts[key] }))} /></Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <ScanLine size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist" />
          <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسکن یا تایپ شماره سریال، نام مشتری، شماره سفارش…"
            onKeyDown={(e) => { if (e.key === 'Enter' && list.length === 1) navigate(`/units/${list[0].serial}`); }} />
        </div>
        <Select className="w-48" value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">همه وضعیت‌ها</option>{Object.entries(UNIT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label} ({num(counts[k])})</option>)}
        </Select>
        <Select className="w-48" value={warranty} onChange={(e) => set('warranty', e.target.value)}>
          <option value="">همه گارانتی‌ها</option><option value="expiring">رو به پایان (۳۰ روز)</option><option value="expired">منقضی‌شده</option>
        </Select>
      </div>
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={Cpu} title="دستگاهی یافت نشد" /></Card> : (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>شماره سریال</th><th>محصول</th><th>وضعیت</th><th>HW / FW</th><th>محل / مشتری</th><th>ساخت</th><th>گارانتی</th></tr></thead>
            <tbody>{list.map((u) => (
              <tr key={u.id} className="cursor-pointer" onClick={() => navigate(`/units/${u.serial}`)}>
                <td className="ltr text-right font-mono text-xs font-semibold text-ink">{u.serial}</td>
                <td className="text-sm">{u.itemName}</td>
                <td><UnitStatusPill status={u.status} /></td>
                <td className="ltr text-right text-xs text-mist">{u.hwRev || '—'} / {u.fwVersion || '—'}</td>
                <td className="text-xs">{u.contactName ?? u.warehouseName ?? '—'}{u.orderNumber && <span className="ltr mr-1 text-mist">({u.orderNumber})</span>}</td>
                <td className="text-xs text-mist">{date(u.builtAt)}</td>
                <td>{['installed', 'shipped', 'in_repair'].includes(u.status) ? <WarrantyBadge until={u.warrantyUntil} /> : <span className="text-xs text-mist">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
