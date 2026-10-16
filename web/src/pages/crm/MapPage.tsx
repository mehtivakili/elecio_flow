import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { Map as MapIcon, Users, Cpu, LifeBuoy, Crosshair, MapPinOff, MapPinPlus, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { IRAN_CENTER, IRAN_PROVINCES, getMapCenter } from '@shared/iran-locations';
import { put } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { useIsMobile } from '../../lib/media';
import { Button, Card, Modal, PageHeader, Select, Sheet, Spinner, Tabs } from '../../components/ui';
import { LifecyclePill } from '../../components/domain';
import { ScoreMeter } from '../../components/charts';
import { LocationPicker } from '../../components/crm';
import { num } from '../../lib/format';

type Layer = 'pipeline' | 'installed' | 'service';
interface Pin { contact: any; pos: [number, number]; label: string }
interface ApproxGroup { key: string; title: string; contacts: any[] }

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
/** Unlocated customers sit a little north of the province centre, so they never hide real pins. */
const APPROX_LIFT = 0.22;
/**
 * Zoomed out, customers without an exact address are counted inside the ordinary clusters.
 * From this zoom on, each province's unlocated customers get their own (slightly larger,
 * dashed) pie marker that opens their list.
 */
const SPLIT_ZOOM = 7;
const PIN_SIZE = 18;
const APPROX_SIZE = 26;

interface Point { pos: [number, number]; contacts: any[]; approx: boolean; key: string; title: string }

/**
 * Groups markers that would overlap on screen (closer than `radius` pixels at this zoom),
 * so neighbouring groups always merge instead of sitting on top of each other.
 * Centres are weighted by how many customers each marker stands for.
 */
function cluster(points: Point[], zoom: number, project: (pos: [number, number]) => L.Point, radius = 40) {
  if (zoom >= 13) return points.map((p) => ({ pins: [p], pos: p.pos }));
  const groups: { pins: Point[]; x: number; y: number; w: number; lat: number; lng: number }[] = [];
  for (const p of [...points].sort((a, b) => b.contacts.length - a.contacts.length)) {
    const pt = project(p.pos);
    const w = Math.max(1, p.contacts.length);
    const g = groups.find((x) => Math.hypot(x.x - pt.x, x.y - pt.y) < radius);
    if (!g) { groups.push({ pins: [p], x: pt.x, y: pt.y, w, lat: p.pos[0] * w, lng: p.pos[1] * w }); continue; }
    g.pins.push(p);
    g.x = (g.x * g.w + pt.x * w) / (g.w + w);
    g.y = (g.y * g.w + pt.y * w) / (g.w + w);
    g.lat += p.pos[0] * w; g.lng += p.pos[1] * w; g.w += w;
  }
  return groups.map((g) => ({ pins: g.pins, pos: [g.lat / g.w, g.lng / g.w] as [number, number] }));
}

/** Conic gradient that keeps the stage mix visible inside one circle. */
function pie(colors: string[]) {
  const counts = new Map<string, number>();
  colors.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  if (counts.size === 1) return colors[0];
  let acc = 0;
  return `conic-gradient(${[...counts.entries()].map(([c, n]) => { const s = acc; acc += (n / colors.length) * 360; return `${c} ${s}deg ${acc}deg`; }).join(',')})`;
}

/** First address that has a province but no exact coordinates (only when none has coordinates). */
function approxAddress(c: any) {
  const addrs: any[] = c.addresses ?? [];
  if (addrs.some((a) => a.lat != null && a.lng != null)) return null;
  return addrs.find((a) => a.province) ?? null;
}

export default function MapPage() {
  const { settings, lifecycle } = useSession();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const { data = [], isLoading } = useApi<any[]>('/map');
  const [layer, setLayer] = useState<Layer>('pipeline');
  const [hidden, setHidden] = useState<string[]>([]);
  const [province, setProvince] = useState('');
  const [zoom, setZoom] = useState(5);
  const [selected, setSelected] = useState<any>(null);
  const [approx, setApprox] = useState<ApproxGroup | null>(null);
  const [placing, setPlacing] = useState<any>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.LayerGroup | null>(null);

  const colorOf = (c: any) => layer === 'installed' ? '#0FD69D' : layer === 'service' ? '#FF499E' : lifecycle(c.stage)?.color ?? '#9DB4C0';
  const inLayer = (c: any) => layer === 'pipeline' ? !hidden.includes(c.stage) : layer === 'installed' ? c.installedUnits > 0 : c.openTickets > 0;

  // Exact pins: addresses with coordinates.
  const pins = useMemo<Pin[]>(() => data.filter(inLayer).flatMap((c) => (c.addresses ?? [])
    .filter((a: any) => a.lat != null && a.lng != null)
    .map((a: any) => ({ contact: c, pos: [a.lat, a.lng] as [number, number], label: a.title }))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, layer, hidden]);

  // Customers we only know the province / city of — grouped per province.
  const approxGroups = useMemo<(ApproxGroup & { pos: [number, number] })[]>(() => {
    const groups = new Map<string, any[]>();
    for (const c of data.filter(inLayer)) {
      const a = approxAddress(c);
      if (!a) continue;
      groups.set(a.province, [...(groups.get(a.province) ?? []), c]);
    }
    return [...groups.entries()].map(([prov, contacts]) => {
      const base = getMapCenter(prov, '');
      return { key: prov, title: prov, contacts, pos: [base[0] + APPROX_LIFT, base[1]] as [number, number] };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, layer, hidden]);
  const unlocatedTotal = approxGroups.reduce((s, g) => s + g.contacts.length, 0);

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
    if (!group || !map.current) return;
    group.clearLayers();
    const points: Point[] = [
      ...pins.map((p) => ({ pos: p.pos, contacts: [p.contact], approx: false, key: `${p.contact.id}:${p.label}`, title: p.contact.name })),
      ...approxGroups.map((g) => ({ pos: g.pos, contacts: g.contacts, approx: true, key: g.key, title: g.title })),
    ];
    const split = zoom >= SPLIT_ZOOM;
    const project = (pos: [number, number]) => map.current!.project(L.latLng(pos[0], pos[1]), zoom);
    const groups = split
      ? [...cluster(points.filter((p) => !p.approx), zoom, project), ...points.filter((p) => p.approx).map((p) => ({ pins: [p], pos: p.pos }))]
      : cluster(points, zoom, project);

    for (const cl of groups) {
      const contacts = cl.pins.flatMap((p) => p.contacts);
      const count = contacts.length;
      const slices = pie(contacts.map(colorOf));
      const units = contacts.reduce((sum, c) => sum + (c.installedUnits ?? 0), 0);

      if (split && cl.pins[0].approx) {
        // Unlocated customers of one province: dashed pie, a touch larger than a single pin.
        const g = cl.pins[0];
        const size = APPROX_SIZE + (count >= 10 ? 4 : 0);
        const label = layer === 'installed' ? units : count;
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-pin map-pin-approx" style="width:${size}px;height:${size}px;background:${slices}"><span class="map-pin-hole">${fa(label)}</span><span class="map-pin-q">؟</span></div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        });
        const marker = L.marker(cl.pos, { icon, zIndexOffset: 500 }).addTo(group);
        marker.on('click', () => { setSelected(null); setApprox({ key: g.key, title: g.title, contacts }); });
        marker.bindTooltip(`${fa(count)} مخاطب بدون آدرس دقیق — ${g.title}`, { direction: 'top', offset: [0, -size / 2 - 2] });
        continue;
      }

      let size = count > 1 ? Math.min(46, 24 + count * 2.5) : PIN_SIZE;
      if (layer === 'installed') size = Math.min(48, 18 + units * 3);
      const label = layer === 'installed' ? units : count > 1 ? count : 0;
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-pin" style="width:${size}px;height:${size}px;background:${slices}">${label ? fa(label) : ''}</div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker(cl.pos, { icon }).addTo(group);
      const single = cl.pins.length === 1 && !cl.pins[0].approx && count === 1;
      if (single) marker.on('click', () => { setApprox(null); setSelected(contacts[0]); });
      else marker.on('click', () => map.current?.flyTo(cl.pos, Math.max(SPLIT_ZOOM, Math.min(12, zoom + 2)), { duration: 0.6 }));
      const unlocated = cl.pins.filter((p) => p.approx).reduce((sum, p) => sum + p.contacts.length, 0);
      marker.bindTooltip(single ? contacts[0].name : `${fa(count)} مخاطب${unlocated ? ` (${fa(unlocated)} بدون آدرس دقیق)` : ''}`, { direction: 'top', offset: [0, -size / 2 - 2] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, approxGroups, zoom, layer]);

  useEffect(() => {
    const p = IRAN_PROVINCES.find((x) => x.name === province);
    if (map.current) map.current.flyTo(p ? [p.lat, p.lng] : IRAN_CENTER, p ? 8 : 5, { duration: 0.7 });
  }, [province]);

  const byProvince = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of data.filter(inLayer)) {
      const prov = c.addresses?.[0]?.province;
      if (prov) counts[prov] = (counts[prov] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, layer, hidden]);

  const showAllUnlocated = () => setApprox({ key: 'all', title: 'همه استان‌ها', contacts: approxGroups.flatMap((g) => g.contacts) });

  const approxList = approx && (
    <UnlocatedList group={approx} onOpen={(c) => navigate(`/crm/contacts/${c.id}`)} onPlace={setPlacing} />
  );

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
          <Tabs value={layer} onChange={(v) => { setLayer(v); setSelected(null); setApprox(null); }} tabs={[
            { key: 'pipeline', label: 'قیف فروش', icon: Users },
            { key: 'installed', label: 'دستگاه‌های نصب‌شده', icon: Cpu },
            { key: 'service', label: 'خدمات باز', icon: LifeBuoy },
          ]} />
        </>}
      />
      {isLoading ? <Spinner /> : (
        <div className="grid gap-4 md:gap-5 xl:grid-cols-[1fr_340px]">
          <div className="glass relative overflow-hidden p-1.5">
            <div ref={box} className="h-[calc(100dvh-300px)] min-h-[420px] rounded-xl md:h-[calc(100vh-230px)] md:min-h-[460px]" />
            <button onClick={() => { setProvince(''); map.current?.flyTo(IRAN_CENTER, 5); }} className="absolute bottom-6 left-6 z-[500] flex h-9 w-9 items-center justify-center rounded-xl bg-[#2b3a40] text-ink shadow-lg" title="نمای کشور"><Crosshair size={16} /></button>
            {unlocatedTotal > 0 && (
              <button onClick={showAllUnlocated} className="absolute right-4 top-4 z-[500] flex items-center gap-2 rounded-xl border border-amber/40 bg-[#2b3a40]/95 px-3 py-2 text-xs font-semibold text-amber shadow-lg">
                <MapPinOff size={15} />{num(unlocatedTotal)} مخاطب بدون آدرس دقیق
              </button>
            )}
          </div>
          <div className="space-y-4 md:space-y-5">
            {approx && !mobile && (
              <Card title={`بدون آدرس دقیق — ${approx.title}`} subtitle="موقعیت تقریبی؛ برای ثبت دقیق، «ثبت روی نقشه» را بزنید" icon={MapPinOff} pad={false} bodyClass="p-2"
                actions={<Button size="sm" variant="ghost" onClick={() => setApprox(null)}>بستن</Button>}>
                {approxList}
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
            ) : null}
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
                <div className="mt-2 flex items-center gap-2.5 border-t border-line/60 px-3 pt-3 text-xs leading-5 text-mist">
                  <span className="map-pin map-pin-approx relative inline-flex h-7 w-7 shrink-0" style={{ background: 'conic-gradient(#F5B85A 0 180deg, #0FD69D 180deg 360deg)' }}><span className="map-pin-hole" /></span>
                  دایره خط‌چین با «؟» = مخاطبانی که فقط استان/شهرشان را داریم (بالای مرکز استان). در نمای دور با بقیه شمرده می‌شوند و با نزدیک‌شدن جدا نمایش داده می‌شوند.
                </div>
              </Card>
            )}
            {!selected && !approx && (
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
      {mobile && (
        <Sheet open={!!approx} onClose={() => setApprox(null)} title={`بدون آدرس دقیق — ${approx?.title ?? ''}`} subtitle="برای ثبت دقیق، «ثبت روی نقشه» را بزنید" icon={MapPinOff} bodyClass="!px-2">
          {approxList}
        </Sheet>
      )}
      <PlaceOnMap contact={placing} onClose={() => setPlacing(null)} />
    </div>
  );
}

function UnlocatedList({ group, onOpen, onPlace }: { group: ApproxGroup; onOpen: (c: any) => void; onPlace: (c: any) => void }) {
  return (
    <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
      {group.contacts.map((c) => {
        const a = approxAddress(c);
        return (
          <li key={c.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-ink/[0.04]">
            <button type="button" onClick={() => onOpen(c)} className="min-w-0 flex-1 text-right">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                <LifecyclePill stage={c.stage} />
              </div>
              <div className="truncate text-[11.5px] text-mist">{[a?.province, a?.county, a?.address].filter(Boolean).join('، ') || '—'}</div>
            </button>
            <Button size="sm" variant="action" icon={MapPinPlus} onClick={() => onPlace(c)}><span className="hidden sm:inline">ثبت روی نقشه</span></Button>
            <button type="button" onClick={() => onOpen(c)} className="text-mist" aria-label="پرونده"><ChevronLeft size={16} /></button>
          </li>
        );
      })}
    </ul>
  );
}

/** Pick the exact location of a customer's address (with address search) and save it. */
function PlaceOnMap({ contact, onClose }: { contact: any | null; onClose: () => void }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => setPos(null), [contact]);
  const address = contact ? approxAddress(contact) : null;
  const save = useAction(() => put(`/contacts/${contact.id}`, {
    addresses: (contact.addresses ?? []).map((a: any) => (a.id === address?.id ? { ...a, lat: pos!.lat, lng: pos!.lng } : a)),
  }), { success: 'موقعیت روی نقشه ثبت شد', onSuccess: onClose });
  return (
    <Modal open={!!contact} onClose={onClose} icon={MapPinPlus} size="lg" title={`ثبت موقعیت ${contact?.name ?? ''}`}
      subtitle={address ? [address.title, address.province, address.county, address.address].filter(Boolean).join('، ') : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!pos} loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره موقعیت</Button></>}>
      {contact && (
        <LocationPicker
          key={contact.id}
          lat={pos?.lat ?? null}
          lng={pos?.lng ?? null}
          province={address?.province}
          searchHint={[address?.county, address?.province].filter(Boolean).join('، ')}
          height={360}
          onChange={(lat, lng) => setPos({ lat, lng })}
        />
      )}
    </Modal>
  );
}
