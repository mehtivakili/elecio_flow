import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Cog, Factory, Layers, Building2, X, ChevronLeft, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { matchesSearch } from '@shared/search';
import { useApi } from '../../lib/hooks';
import { useIsMobile } from '../../lib/media';
import { Card, Empty, PageHeader, SearchBox, Spinner, Stat, Tabs } from '../../components/ui';
import { LifecyclePill } from '../../components/domain';
import { BrandPill, useBrands } from '../../components/machines';
import { BrandLogo } from '../../components/brandLogos';
import { num } from '../../lib/format';

type Scope = 'all' | 'customers' | 'leads';
interface Bucket { key: string; label: string; machines: number; sites: Set<string>; color: string }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Same brand + model at one workshop shown once with a count. */
function groupRows(rows: any[]) {
  const map = new Map<string, { key: string; brand: string; model: string; count: number }>();
  for (const m of rows) {
    const key = `${m.controllerBrand}|${m.controllerModel.toLowerCase()}`;
    const g = map.get(key) ?? { key, brand: m.controllerBrand, model: m.controllerModel, count: 0 };
    g.count += m.qty;
    map.set(key, g);
  }
  return [...map.values()];
}

function bucketize(rows: any[], keyOf: (m: any) => string, labelOf: (k: string) => string, colorOf: (k: string) => string) {
  const map = new Map<string, Bucket>();
  for (const m of rows) {
    const k = keyOf(m);
    const b = map.get(k) ?? { key: k, label: labelOf(k), machines: 0, sites: new Set<string>(), color: colorOf(k) };
    b.machines += m.qty; b.sites.add(m.contactId);
    map.set(k, b);
  }
  return [...map.values()].sort((a, b) => b.machines - a.machines);
}

/** One bar row: label, share bar, machines and sites. */
function BarRow({ b, total, active, onClick, mark }: { b: Bucket; total: number; active?: boolean; onClick?: () => void; mark?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={clsx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-right transition', onClick && 'hover:bg-ink/[0.04]', active && 'bg-ink/[0.06] ring-1 ring-inset ring-iris/40')}>
      {mark}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="code truncate text-[13px] font-semibold text-ink">{b.label}</span>
          <span className="num shrink-0 text-[13px] font-bold text-ink">{num(b.machines)} <span className="text-[10.5px] font-normal text-mist">دستگاه · {num(pct(b.machines, total))}٪</span></span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct(b.machines, total))}%`, background: b.color }} />
        </div>
        <div className="mt-1 text-[10.5px] text-mist">{num(b.sites.size)} کارگاه</div>
      </div>
    </button>
  );
}

/**
 * Which CNC controllers our customers and leads run (each machine = one Elecio): share per
 * brand and per controller model, and every workshop's machines.
 */
export default function MachinesPage() {
  const { data, isLoading } = useApi<{ machines: any[]; summaryOnly: any[] }>('/machines/stats');
  const { byKey } = useBrands();
  const mobile = useIsMobile();
  const [scope, setScope] = useState<Scope>('all');
  const [brand, setBrand] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const inScope = useMemo(() => (data?.machines ?? []).filter((m) =>
    scope === 'all' || (scope === 'customers' ? m.contactStage === 'customer' : !['customer', 'lost'].includes(m.contactStage))), [data, scope]);
  const total = inScope.reduce((s, m) => s + m.qty, 0);
  const sites = new Set(inScope.map((m) => m.contactId)).size;

  const brands = useMemo(() => bucketize(inScope, (m) => m.controllerBrand, (k) => `${byKey(k).label}${byKey(k).fa ? ` · ${byKey(k).fa}` : ''}`, (k) => byKey(k).color), [inScope, byKey]);
  const ofBrand = brand ? inScope.filter((m) => m.controllerBrand === brand) : inScope;
  const brandTotal = ofBrand.reduce((s, m) => s + m.qty, 0);
  const models = useMemo(() => bucketize(ofBrand,
    (m) => `${m.controllerBrand}|${m.controllerModel.toLowerCase()}`,
    (k) => { const [b, mdl] = k.split('|'); const shown = ofBrand.find((m) => m.controllerBrand === b && m.controllerModel.toLowerCase() === mdl)?.controllerModel; return `${brand ? '' : `${byKey(b).label} `}${shown || 'مدل نامشخص'}`; },
    (k) => byKey(k.split('|')[0]).color), [ofBrand, brand, byKey]);
  const modelCount = new Set(inScope.filter((m) => m.controllerModel).map((m) => `${m.controllerBrand}|${m.controllerModel.toLowerCase()}`)).size;

  const filtered = inScope.filter((m) =>
    (!brand || m.controllerBrand === brand)
    && (!model || `${m.controllerBrand}|${m.controllerModel.toLowerCase()}` === model)
    && matchesSearch(`${m.contactName} ${m.city ?? ''} ${byKey(m.controllerBrand).label} ${byKey(m.controllerBrand).fa ?? ''} ${m.controllerModel}`, search));
  const workshops = useMemo(() => {
    type Shop = { id: string; name: string; city: string; stage: string; rows: any[]; total: number };
    const map = new Map<string, Shop>();
    for (const m of filtered) {
      const w: Shop = map.get(m.contactId) ?? { id: m.contactId, name: m.contactName, city: [m.city, m.province].filter(Boolean)[0] ?? '', stage: m.contactStage, rows: [], total: 0 };
      w.rows.push(m); w.total += m.qty;
      map.set(m.contactId, w);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  const chips = [
    brand && { label: byKey(brand).label, clear: () => { setBrand(null); setModel(null); } },
    model && { label: models.find((x) => x.key === model)?.label ?? '', clear: () => setModel(null) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-5">
      <PageHeader icon={Cog} title="کنترلرها و ماشین‌ها" subtitle="جامعه آماری کنترلرهای CNC مشتریان و سرنخ‌ها — برای فروش، محتوای سایت و توسعه پست‌پروسسور"
        actions={<Tabs value={scope} onChange={setScope} tabs={[{ key: 'all', label: 'همه' }, { key: 'customers', label: 'مشتریان' }, { key: 'leads', label: 'سرنخ‌ها' }]} />} />

      <div className="stat-rail grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Stat label="دستگاه‌ها" value={num(total)} hint="هر ماشین = یک الکیو" icon={Factory} tone="iris" />
        <Stat label="کارگاه‌ها" value={num(sites)} hint={sites ? `میانگین ${num(total / sites, 1)} دستگاه` : '—'} icon={Building2} tone="sky" />
        <Stat label="برندهای کنترلر" value={num(brands.length)} hint={brands[0] ? `بیشترین: ${byKey(brands[0].key).label}` : '—'} icon={Cog} tone="lilac" />
        <Stat label="مدل‌های کنترلر" value={num(modelCount)} hint={`${num(inScope.filter((m) => !m.controllerModel).reduce((s, m) => s + m.qty, 0))} دستگاه بدون مدل`} icon={Layers} tone="mint" />
      </div>

      {total === 0 ? (
        <Card><Empty icon={Factory} title="هنوز ماشینی ثبت نشده" hint="از فرم مشتری (مرحله «ماشین‌ها») یا تب «ماشین‌ها» در صفحه مشتری اضافه کنید" /></Card>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
            <Card title="سهم برندهای کنترلر" icon={Cog} subtitle="روی هر برند بزنید تا مدل‌ها و کارگاه‌هایش را ببینید" pad={false} bodyClass="p-2.5">
              <div className="space-y-0.5">
                {brands.map((b) => (
                  <BarRow key={b.key} b={b} total={total} active={brand === b.key}
                    mark={<BrandLogo brand={b.key} label={byKey(b.key).label} color={byKey(b.key).color} height={30} />}
                    onClick={() => { setBrand(brand === b.key ? null : b.key); setModel(null); }} />
                ))}
              </div>
            </Card>
            <Card title={brand ? `مدل‌های ${byKey(brand).label}` : 'پرتکرارترین مدل‌های کنترلر'} icon={Layers}
              subtitle={brand ? `${num(brandTotal)} دستگاه در ${num(new Set(ofBrand.map((m) => m.contactId)).size)} کارگاه` : 'روی هر مدل بزنید تا کارگاه‌هایش را ببینید'}
              pad={false} bodyClass="max-h-[520px] overflow-y-auto p-2.5">
              <div className="space-y-0.5">
                {models.slice(0, brand ? 100 : 15).map((b) => (
                  <BarRow key={b.key} b={b} total={brand ? brandTotal : total} active={model === b.key} onClick={() => setModel(model === b.key ? null : b.key)} />
                ))}
              </div>
            </Card>
          </div>

          <Card title="کارگاه‌ها و ماشین‌هایشان" icon={Building2} pad={false}
            subtitle={`${num(workshops.length)} کارگاه · ${num(filtered.reduce((s, m) => s + m.qty, 0))} دستگاه`}
            actions={<SearchBox value={search} onChange={setSearch} className="w-full md:w-56" placeholder="کارگاه، برند یا مدل…" />}>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-line/50 px-4 pb-3">
                {chips.map((c) => (
                  <button key={c.label} type="button" onClick={c.clear} className="inline-flex items-center gap-1 rounded-full bg-iris/15 px-2.5 py-1 text-[11.5px] text-iris">
                    <span className="ltr code">{c.label}</span><X size={12} />
                  </button>
                ))}
              </div>
            )}
            {workshops.length === 0 ? <div className="p-6"><Empty icon={Building2} title="کارگاهی با این فیلتر پیدا نشد" /></div> : (
              <div className={clsx(mobile ? 'space-y-2 p-2.5' : 'divide-y divide-line/40')}>
                {workshops.map((w) => (
                  <Link key={w.id} to={`/crm/contacts/${w.id}`}
                    className={clsx('group flex gap-3 transition', mobile ? 'flex-col rounded-2xl border border-line/50 bg-deep/40 p-3' : 'items-center px-4 py-3 hover:bg-ink/[0.03]')}>
                    <div className={clsx('min-w-0', !mobile && 'w-56 shrink-0')}>
                      <div className="truncate text-[14px] font-bold text-ink group-hover:text-iris">{w.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-mist">{w.city || '—'}<LifecyclePill stage={w.stage} /></div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {groupRows(w.rows).map((g) => (
                        <span key={g.key} className="inline-flex items-center gap-1.5">
                          <BrandPill brand={g.brand} model={g.model} />
                          {g.count > 1 && <span className="num text-[11px] font-bold text-frost">×{num(g.count)}</span>}
                        </span>
                      ))}
                    </div>
                    <div className={clsx('flex shrink-0 items-center gap-3', mobile && 'justify-between')}>
                      <span className="text-center"><span className="num block text-lg font-black leading-none text-ink">{num(w.total)}</span><span className="text-[10px] text-mist">دستگاه</span></span>
                      {!mobile && <ChevronLeft size={16} className="text-mist" />}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {data.summaryOnly.length > 0 && (
        <Card title="فقط برند کنترلر ثبت شده" icon={Wand2} subtitle="این مخاطبان از قبل برند کنترلر دارند ولی فهرست ماشین ندارند؛ در فرم یا تب «ماشین‌ها» با یک کلیک تبدیل کنید" pad={false} bodyClass="p-2.5">
          <div className="flex flex-wrap gap-2">
            {data.summaryOnly.map((c) => (
              <Link key={c.id} to={`/crm/contacts/${c.id}`} className="rounded-xl border border-line/60 bg-deep/40 px-3 py-2 text-[12px] transition hover:border-iris/60">
                <span className="font-semibold text-ink">{c.name}</span>
                <span className="text-mist"> · {c.controllers.join('، ')}{c.machines ? ` · ${num(c.machines)} ماشین` : ''}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
