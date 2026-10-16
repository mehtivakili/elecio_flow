import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cpu, ScanLine, Plus, UserCheck } from 'lucide-react';
import clsx from 'clsx';
import { UNIT_STATUS } from '@shared/defaults';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { SelectAllCell, SelectButton, SelectCell, SelectionBar, useSelection } from '../../components/selection';
import { AssignUnitsModal, ManualUnitsModal } from '../../components/legacy';
import { Button, Card, Empty, Filters, Input, ListCard, PageHeader, Select, Spinner } from '../../components/ui';
import { UnitStatusPill, WarrantyBadge } from '../../components/domain';
import { StackStrip } from '../../components/charts';
import { date, num } from '../../lib/format';
import { matchesSearch } from '@shared/search';

export default function UnitsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data = [], isLoading } = useApi<any[]>('/units');
  const [search, setSearch] = useState('');
  const { isAdmin, can } = useSession();
  const [manual, setManual] = useState(false);
  const [assign, setAssign] = useState<string[] | null>(null);
  const status = params.get('status') ?? '';
  const warranty = params.get('warranty') ?? '';
  const set = (k: string, v: string) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };

  const list = useMemo(() => {
    const soon = Date.now() + 30 * 86_400_000;
    return data.filter((u) =>
      (!status || u.status === status)
      && (!warranty || (warranty === 'expiring' ? u.warrantyUntil && u.warrantyUntil > Date.now() && u.warrantyUntil < soon : warranty === 'expired' ? u.warrantyUntil && u.warrantyUntil < Date.now() : true))
      && matchesSearch(`${u.serialUnknown ? 'بدون سریال' : u.serial} ${u.itemName} ${u.contactName ?? ''} ${u.orderNumber ?? ''}`, search));
  }, [data, status, warranty, search]);
  const counts = Object.fromEntries(Object.keys(UNIT_STATUS).map((k) => [k, data.filter((u) => u.status === k).length]));
  const sel = useSelection(list.map((u) => u.id));
  const serialOf = (u: any) => (u.serialUnknown ? <span className="font-sans text-amber">بدون سریال</span> : u.serial);

  return (
    <div>
      <PageHeader icon={Cpu} title="شناسنامه دستگاه‌ها" subtitle="هر دستگاه با شماره سریال: از کیتینگ و QC تا ارسال، نصب، گارانتی و تعمیر"
        aside={can('units') ? <SelectButton sel={sel} /> : undefined}
        fab={isAdmin && !sel.active ? { label: 'تعریف دستی دستگاه', icon: Plus, onClick: () => setManual(true) } : undefined} />
      <Card className="mb-4 md:mb-5"><StackStrip parts={Object.entries(UNIT_STATUS).map(([key, s]) => ({ key, label: s.label, color: s.color, value: counts[key] }))} /></Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:min-w-[260px]">
          <ScanLine size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist" />
          <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="سریال، مشتری، شماره سفارش…" enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === 'Enter' && list.length === 1) navigate(`/units/${list[0].id}`); }} />
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
        <div className="space-y-2 md:hidden">
          {list.map((u) => (
            <ListCard key={u.id} to={`/units/${u.id}`} accent={UNIT_STATUS[u.status]?.color}
              selecting={sel.active} selected={sel.has(u.id)} onSelect={() => sel.toggle(u.id)} onLongPress={can('units') ? () => sel.start(u.id) : undefined}>
              <div className="flex items-center justify-between gap-2">
                <span className="ltr truncate font-mono text-[14px] font-bold text-ink">{serialOf(u)}{!!u.manual && <span className="mr-1.5 font-sans text-[10.5px] font-medium text-lilac">دستی</span>}</span>
                <UnitStatusPill status={u.status} />
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-mist">{u.itemName} · {u.contactName ?? u.warehouseName ?? '—'}</div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-mist">
                <span className="ltr truncate">{u.hwRev || u.fwVersion ? `${u.hwRev || '—'} / ${u.fwVersion || '—'}` : ''}</span>
                {['installed', 'shipped', 'in_repair'].includes(u.status) ? <WarrantyBadge until={u.warrantyUntil} /> : <span>ساخت {date(u.builtAt)}</span>}
              </div>
            </ListCard>
          ))}
        </div>
        <Card pad={false} bodyClass="overflow-x-auto" className="hidden md:block">
          <table className="tbl">
            <thead><tr><SelectAllCell sel={sel} /><th>شماره سریال</th><th>محصول</th><th>وضعیت</th><th>HW / FW</th><th>محل / مشتری</th><th>ساخت</th><th>گارانتی</th></tr></thead>
            <tbody>{list.map((u) => (
              <tr key={u.id} className={clsx('cursor-pointer', sel.has(u.id) && 'row-selected')} onClick={() => (sel.active ? sel.toggle(u.id) : navigate(`/units/${u.id}`))}>
                <SelectCell sel={sel} id={u.id} />
                <td className="ltr text-right font-mono text-xs font-semibold text-ink">{serialOf(u)}{!!u.manual && <span className="mr-1.5 font-sans text-[10.5px] font-medium text-lilac">دستی</span>}</td>
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
      <SelectionBar sel={sel} path="/units/bulk-delete" noun="دستگاه"
        extra={isAdmin ? <Button variant="outline" icon={UserCheck} disabled={!sel.count} onClick={() => setAssign([...sel.ids])}><span className="hidden sm:inline">اختصاص به مشتری</span></Button> : undefined} />
      <ManualUnitsModal open={manual} onClose={() => setManual(false)} />
      <AssignUnitsModal ids={assign} onClose={() => setAssign(null)} onDone={sel.stop} />
    </div>
  );
}
