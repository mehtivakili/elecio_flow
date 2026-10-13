import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cpu, ScanLine } from 'lucide-react';
import { UNIT_STATUS } from '@shared/defaults';
import { useApi } from '../../lib/hooks';
import { Card, Empty, Filters, Input, ListCard, PageHeader, Select, Spinner } from '../../components/ui';
import { UnitStatusPill, WarrantyBadge } from '../../components/domain';
import { StackStrip } from '../../components/charts';
import { date, num } from '../../lib/format';
import { matchesSearch } from '@shared/search';

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
      && matchesSearch(`${u.serial} ${u.contactName ?? ''} ${u.orderNumber ?? ''}`, search));
  }, [data, status, warranty, search]);
  const counts = Object.fromEntries(Object.keys(UNIT_STATUS).map((k) => [k, data.filter((u) => u.status === k).length]));

  return (
    <div>
      <PageHeader icon={Cpu} title="شناسنامه دستگاه‌ها" subtitle="هر دستگاه با شماره سریال: از کیتینگ و QC تا ارسال، نصب، گارانتی و تعمیر" />
      <Card className="mb-4 md:mb-5"><StackStrip parts={Object.entries(UNIT_STATUS).map(([key, s]) => ({ key, label: s.label, color: s.color, value: counts[key] }))} /></Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:min-w-[260px]">
          <ScanLine size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist" />
          <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="سریال، مشتری، شماره سفارش…" enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === 'Enter' && list.length === 1) navigate(`/units/${list[0].serial}`); }} />
        </div>
        <Filters count={(status ? 1 : 0) + (warranty ? 1 : 0)} onReset={() => { params.delete('status'); params.delete('warranty'); setParams(params, { replace: true }); }}>
          <Select className="w-48" value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">همه وضعیت‌ها</option>{Object.entries(UNIT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label} ({num(counts[k])})</option>)}
          </Select>
          <Select className="w-48" value={warranty} onChange={(e) => set('warranty', e.target.value)}>
            <option value="">همه گارانتی‌ها</option><option value="expiring">رو به پایان (۳۰ روز)</option><option value="expired">منقضی‌شده</option>
          </Select>
        </Filters>
      </div>
      {isLoading ? <Spinner /> : list.length === 0 ? <Card><Empty icon={Cpu} title="دستگاهی یافت نشد" /></Card> : (<>
        <div className="space-y-2.5 md:hidden">
          {list.map((u) => (
            <ListCard key={u.id} to={`/units/${u.serial}`} accent={UNIT_STATUS[u.status]?.color}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="ltr text-right font-mono text-[15px] font-bold text-ink">{u.serial}</div>
                  <div className="mt-0.5 truncate text-xs text-mist">{u.itemName}</div>
                </div>
                <UnitStatusPill status={u.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-deep/60 p-2.5 text-xs">
                <div className="min-w-0"><div className="text-[11px] text-mist">محل / مشتری</div><div className="mt-0.5 truncate text-ink">{u.contactName ?? u.warehouseName ?? '—'}</div></div>
                <div className="min-w-0"><div className="text-[11px] text-mist">HW / FW</div><div className="ltr mt-0.5 truncate text-right text-ink">{u.hwRev || '—'} / {u.fwVersion || '—'}</div></div>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-mist">
                <span>ساخت {date(u.builtAt)}{u.orderNumber && <span className="ltr mr-1">· {u.orderNumber}</span>}</span>
                {['installed', 'shipped', 'in_repair'].includes(u.status) && <WarrantyBadge until={u.warrantyUntil} />}
              </div>
            </ListCard>
          ))}
        </div>
        <Card pad={false} bodyClass="overflow-x-auto" className="hidden md:block">
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
      </>)}
    </div>
  );
}
