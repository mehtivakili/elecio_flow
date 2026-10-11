import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { Map as MapIcon, Users, Cpu, LifeBuoy, Crosshair } from 'lucide-react';
import clsx from 'clsx';
import { IRAN_CENTER, IRAN_PROVINCES, getMapCenter } from '@shared/iran-locations';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Card, PageHeader, Select, Spinner, Tabs } from '../../components/ui';
import { LifecyclePill } from '../../components/domain';
import { ScoreMeter } from '../../components/charts';
import { num } from '../../lib/format';

type Layer = 'pipeline' | 'installed' | 'service';
interface Pin { contact: any; pos: [number, number]; label: string }

/** Deterministic jitter so contacts without exact coordinates don't stack on the province centre. */
function offset(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const angle = (Math.abs(h) % 360) * Math.PI / 180;
  const r = 0.03 + (Math.abs(h >> 8) % 20) / 1000;
  return [Math.sin(angle) * r, Math.cos(angle) * r];
}

function cluster(pins: Pin[], zoom: number) {
  const cell = zoom <= 5 ? 1.6 : zoom === 6 ? 0.8 : zoom === 7 ? 0.35 : zoom <= 9 ? 0.12 : 0;
  if (!cell) return pins.map((p) => ({ pins: [p], pos: p.pos }));
  const groups = new Map<string, Pin[]>();
  for (const p of pins) {
    const key = `${Math.floor(p.pos[0] / cell)}:${Math.floor(p.pos[1] / cell)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()].map((g) => ({
    pins: g,
    pos: [g.reduce((s, p) => s + p.pos[0], 0) / g.length, g.reduce((s, p) => s + p.pos[1], 0) / g.length] as [number, number],
  }));
}

export default function MapPage() {
  const { settings, lifecycle } = useSession();
  const navigate = useNavigate();
  const { data = [], isLoading } = useApi<any[]>('/map');
  const [layer, setLayer] = useState<Layer>('pipeline');
  const [hidden, setHidden] = useState<string[]>([]);
  const [province, setProvince] = useState('');
  const [zoom, setZoom] = useState(5);
  const [selected, setSelected] = useState<any>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.LayerGroup | null>(null);

  const colorOf = (c: any) => layer === 'installed' ? '#0FD69D' : layer === 'service' ? '#FF499E' : lifecycle(c.stage)?.color ?? '#9DB4C0';

  const pins = useMemo<Pin[]>(() => data
    .filter((c) => layer === 'pipeline' ? !hidden.includes(c.stage) : layer === 'installed' ? c.installedUnits > 0 : c.openTickets > 0)
    .flatMap((c) => (c.addresses ?? []).map((a: any) => {
      if (a.lat != null && a.lng != null) return { contact: c, pos: [a.lat, a.lng] as [number, number], label: a.title };
      if (!a.province) return null;
      const base = getMapCenter(a.province, a.county);
      const [dy, dx] = offset(`${c.id}${a.id}`);
      return { contact: c, pos: [base[0] + dy, base[1] + dx] as [number, number], label: a.title };
    }).filter(Boolean) as Pin[]), [data, layer, hidden]);

  useEffect(() => {
    if (isLoading || !box.current || map.current) return;
    const m = L.map(box.current, { center: IRAN_CENTER, zoom: 5, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(m);
    layerGroup.current = L.layerGroup().addTo(m);
    m.on('zoomend', () => setZoom(m.getZoom()));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 150);
    return () => { m.remove(); map.current = null; };
  }, [isLoading]);

  useEffect(() => {
    const group = layerGroup.current;
    if (!group) return;
    group.clearLayers();
    for (const cl of cluster(pins, zoom)) {
      const count = cl.pins.length;
      let size = count > 1 ? Math.min(46, 24 + count * 2.5) : 18;
      if (layer === 'installed') size = Math.min(48, 18 + cl.pins.reduce((s, p) => s + p.contact.installedUnits, 0) * 3);
      // Conic gradient shows the stage mix inside a cluster — identity is also given by the legend and popup text.
      const colors = cl.pins.map((p) => colorOf(p.contact));
      const counts = new Map<string, number>();
      colors.forEach((col) => counts.set(col, (counts.get(col) ?? 0) + 1));
      let acc = 0;
      const bg = counts.size === 1 ? colors[0] : `conic-gradient(${[...counts.entries()].map(([col, n]) => { const s = acc; acc += (n / count) * 360; return `${col} ${s}deg ${acc}deg`; }).join(',')})`;
      const label = layer === 'installed' ? cl.pins.reduce((s, p) => s + p.contact.installedUnits, 0) : count > 1 ? count : '';
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-pin" style="width:${size}px;height:${size}px;background:${bg}">${label ? new Intl.NumberFormat('fa-IR').format(Number(label)) : ''}</div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker(cl.pos, { icon }).addTo(group);
      if (count === 1) marker.on('click', () => setSelected(cl.pins[0].contact));
      else marker.on('click', () => map.current?.flyTo(cl.pos, Math.min(12, zoom + 2), { duration: 0.6 }));
      marker.bindTooltip(count === 1 ? cl.pins[0].contact.name : `${new Intl.NumberFormat('fa-IR').format(count)} مخاطب`, { direction: 'top' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, zoom, layer]);

  useEffect(() => {
    const p = IRAN_PROVINCES.find((x) => x.name === province);
    if (map.current) map.current.flyTo(p ? [p.lat, p.lng] : IRAN_CENTER, p ? 8 : 5, { duration: 0.7 });
  }, [province]);

  const byProvince = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of pins) {
      const prov = p.contact.addresses?.[0]?.province;
      if (prov) counts[prov] = (counts[prov] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [pins]);

  return (
    <div>
      <PageHeader
        icon={MapIcon}
        title="نقشه عملیات"
        subtitle="پراکندگی سرنخ‌ها، مشتریان، دستگاه‌های نصب‌شده و درخواست‌های خدمات"
        actions={<>
          <Select className="w-44" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">کل کشور</option>
            {IRAN_PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}
          </Select>
          <Tabs value={layer} onChange={(v) => { setLayer(v); setSelected(null); }} tabs={[
            { key: 'pipeline', label: 'قیف فروش', icon: Users },
            { key: 'installed', label: 'دستگاه‌های نصب‌شده', icon: Cpu },
            { key: 'service', label: 'خدمات باز', icon: LifeBuoy },
          ]} />
        </>}
      />
      {isLoading ? <Spinner /> : (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="glass relative overflow-hidden p-1.5">
            <div ref={box} className="h-[calc(100vh-230px)] min-h-[460px] rounded-xl" />
            <button onClick={() => { setProvince(''); map.current?.flyTo(IRAN_CENTER, 5); }} className="absolute bottom-6 left-6 z-[500] flex h-9 w-9 items-center justify-center rounded-xl bg-[#2b3a40] text-ink shadow-lg" title="نمای کشور"><Crosshair size={16} /></button>
          </div>
          <div className="space-y-5">
            {layer === 'pipeline' && (
              <Card title="راهنما و فیلتر مراحل" pad={false} bodyClass="p-3">
                {settings.lifecycleStages.map((s) => {
                  const n = data.filter((c) => c.stage === s.key).length;
                  const off = hidden.includes(s.key);
                  return (
                    <button key={s.key} onClick={() => setHidden(off ? hidden.filter((h) => h !== s.key) : [...hidden, s.key])}
                      className={clsx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-ink/[0.05]', off && 'opacity-40')}>
                      <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: s.color }} />{s.label}</span>
                      <span className="num text-mist">{num(n)}</span>
                    </button>
                  );
                })}
              </Card>
            )}
            {selected ? (
              <Card title={selected.name} subtitle={selected.addresses?.[0] && `${selected.addresses[0].province}، ${selected.addresses[0].county}`}>
                <div className="space-y-3 text-sm">
                  <LifecyclePill stage={selected.stage} />
                  {!['customer', 'lost'].includes(selected.stage) && <ScoreMeter score={selected.score} />}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-ink/[0.04] p-2"><div className="num font-bold">{num(selected.installedUnits)}</div><div className="text-[11px] text-mist">دستگاه نصب‌شده</div></div>
                    <div className="rounded-xl bg-ink/[0.04] p-2"><div className={clsx('num font-bold', selected.openTickets && 'text-rose')}>{num(selected.openTickets)}</div><div className="text-[11px] text-mist">تیکت باز</div></div>
                  </div>
                  <button onClick={() => navigate(`/crm/contacts/${selected.id}`)} className="w-full rounded-xl bg-iris py-2 text-sm font-medium text-night">مشاهده پرونده</button>
                </div>
              </Card>
            ) : (
              <Card title="بیشترین تراکم" subtitle="بر اساس لایه فعلی">
                <ul className="space-y-2 text-sm">
                  {byProvince.map(([prov, n]) => (
                    <li key={prov}>
                      <button onClick={() => setProvince(prov)} className="flex w-full items-center justify-between rounded-lg px-2 py-1 hover:bg-ink/[0.05]">
                        <span className="text-frost">{prov}</span><span className="num text-ink">{num(n)}</span>
                      </button>
                    </li>
                  ))}
                  {!byProvince.length && <li className="text-mist">موردی برای نمایش نیست</li>}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
