import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Plus, Trash2, MapPin, Phone, Users as UsersIcon, Target, PhoneCall, CalendarPlus, Sparkles, AlertTriangle, Search, LocateFixed, Cog } from 'lucide-react';
import clsx from 'clsx';
import { IRAN_CENTER, IRAN_PROVINCES, getProvince } from '@shared/iran-locations';
import { CALL_OUTCOMES, INTERACTION_TYPES } from '@shared/defaults';
import { api, post, put } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Button, Field, Input, Modal, MoneyInput, Select, Stars, Textarea, Toggle } from './ui';
import { ChipSelect, DateInput } from './inputs';
import { UserPicker } from './domain';
import { MachinesEditor, newRow, type MachineRow } from './machines';
import { num } from '../lib/format';

/* ───────────────────────── Map location picker ───────────────────────── */

/**
 * Pick an exact location: search an address or place name (OpenStreetMap
 * Nominatim — the query text is sent to openstreetmap.org), use the phone's GPS,
 * or tap the map.
 */
export function LocationPicker({ lat, lng, province, onChange, height = 220, searchHint }: {
  lat?: number | null; lng?: number | null; province?: string; onChange: (lat: number, lng: number) => void; height?: number;
  /** Appended to searches to narrow them, e.g. "کرج، البرز". */
  searchHint?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const placeRef = useRef<(p: L.LatLngExpression) => void>(() => {});
  const cb = useRef(onChange);
  cb.current = onChange;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!box.current || map.current) return;
    const center: [number, number] = lat != null && lng != null ? [lat, lng] : IRAN_CENTER;
    const m = L.map(box.current, { center, zoom: lat != null ? 13 : 5, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(m);
    const place = (p: L.LatLngExpression) => {
      if (marker.current) marker.current.setLatLng(p);
      else marker.current = L.circleMarker(p, { radius: 9, color: '#253237', weight: 3, fillColor: '#FF499E', fillOpacity: 1 }).addTo(m);
    };
    placeRef.current = place;
    if (lat != null && lng != null) place([lat, lng]);
    m.on('click', (e: L.LeafletMouseEvent) => { place(e.latlng); cb.current(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)); });
    map.current = m;
    setTimeout(() => m.invalidateSize(), 120);
    return () => { m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = province ? getProvince(province) : null;
    if (p && map.current && lat == null) map.current.flyTo([p.lat, p.lng], 9, { duration: 0.6 });
  }, [province, lat]);

  const choose = (la: number, ln: number, zoom = 16) => {
    placeRef.current([la, ln]);
    map.current?.flyTo([la, ln], zoom, { duration: 0.7 });
    cb.current(+la.toFixed(6), +ln.toFixed(6));
    setResults(null);
  };

  const search = async () => {
    const text = query.trim();
    if (text.length < 2) return;
    setBusy(true);
    const ask = async (q: string) => {
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ir&accept-language=fa&q=' + encodeURIComponent(q);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      return res.ok ? (await res.json()) as any[] : [];
    };
    try {
      const hint = searchHint || province || '';
      let found = hint && !text.includes(hint) ? await ask(text + '، ' + hint) : [];
      if (!found.length) found = await ask(text);
      setResults(found);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); choose(p.coords.latitude, p.coords.longitude, 17); },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist" />
          <Input
            className="pr-9"
            value={query}
            enterKeyHint="search"
            placeholder="جستجوی آدرس، خیابان، شهرک صنعتی یا نام مکان…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          />
        </div>
        <Button variant="action" icon={Search} loading={busy} onClick={search} aria-label="جستجوی آدرس"><span className="hidden sm:inline">جستجو</span></Button>
        <Button variant="outline" icon={LocateFixed} onClick={locateMe} aria-label="موقعیت فعلی من" title="موقعیت فعلی من" />
      </div>
      {results && (
        <div className="mb-2 overflow-hidden rounded-xl border border-line bg-deep/80">
          {results.length === 0 ? <p className="px-3 py-3 text-xs text-mist">نتیجه‌ای پیدا نشد — عبارت کوتاه‌تر یا نام شهر را امتحان کنید، یا روی نقشه کلیک کنید.</p> : (
            <ul className="max-h-48 overflow-y-auto">
              {results.map((r) => (
                <li key={r.place_id}>
                  <button type="button" onClick={() => choose(+r.lat, +r.lon)} className="flex w-full items-start gap-2 px-3 py-2.5 text-right text-sm text-frost hover:bg-iris/15">
                    <MapPin size={14} className="mt-1 shrink-0 text-iris" /><span className="leading-6">{r.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div ref={box} className="overflow-hidden rounded-xl border border-line" style={{ height }} />
      <p className="mt-1.5 text-[11px] text-mist">
        آدرس را جستجو کنید یا مستقیم روی نقشه کلیک کنید
        {lat != null && lng != null && <span className="ltr mr-2 inline-block">({lat}, {lng})</span>}
      </p>
    </div>
  );
}

/* ───────────────────────── Contact form ───────────────────────── */

interface AddressForm { title: string; province: string; county: string; address: string; postalCode: string; lat: number | null; lng: number | null }
const emptyAddress = (): AddressForm => ({ title: 'کارخانه', province: '', county: '', address: '', postalCode: '', lat: null, lng: null });

const STEPS = [
  { n: 1, label: 'هویت و منبع', icon: UsersIcon },
  { n: 2, label: 'تماس و آدرس', icon: MapPin },
  { n: 3, label: 'ارزیابی سرنخ', icon: Target },
  { n: 4, label: 'ماشین‌ها', icon: Cog },
];
/** Summary fields now kept in sync from the machine list (step 4) — not edited by hand. */
const MACHINE_FIELDS = ['machines', 'controllers'];

export function ContactFormModal({ open, onClose, contact, onSaved }: { open: boolean; onClose: () => void; contact?: any; onSaved?: (id: string) => void }) {
  const { settings, tags, me } = useSession();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [dupes, setDupes] = useState<{ id: string; name: string }[] | null>(null);
  const blank = () => ({
    kind: 'company', name: '', company: '', jobTitle: '', phones: [{ type: 'mobile', value: '' }], emails: [''], website: '',
    leadSource: settings.leadSources[0]?.key ?? 'other', leadSourceDetail: '', stage: 'cold_lead', customerType: settings.customerTypes[0]?.key ?? '',
    rating: 0, starred: false, estimatedValue: null as number | null, attrs: {} as Record<string, any>, notes: '', tags: [] as string[],
    ownerId: me.id, addresses: [emptyAddress()],
  });
  const [form, setForm] = useState(blank);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [machinesDirty, setMachinesDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    setStep(1); setDupes(null);
    setMachines([]); setMachinesDirty(false);
    if (contact?.id) {
      api<any[]>(`/contacts/${contact.id}/machines`)
        .then((rows) => setMachines(rows.map((r) => newRow({ id: r.id, controllerBrand: r.controllerBrand, controllerModel: r.controllerModel, qty: r.qty }))))
        .catch(() => { /* the tab shows the list empty; saving without changes leaves machines untouched */ });
    }
    setForm(contact ? {
      ...blank(), ...contact,
      phones: contact.phones?.length ? contact.phones : [{ type: 'mobile', value: '' }],
      emails: contact.emails?.length ? contact.emails : [''],
      starred: !!contact.starred, attrs: contact.attrs ?? {},
      addresses: contact.addresses?.length ? contact.addresses.map((a: any) => ({ ...emptyAddress(), ...a })) : [emptyAddress()],
    } : blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact]);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm((f) => ({ ...f, ...patch }));
  const setAddr = (i: number, patch: Partial<AddressForm>) => set({ addresses: form.addresses.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const save = useAction(
    async (allowDuplicate: boolean) => {
      const body = {
        ...form,
        allowDuplicate,
        phones: form.phones.filter((p) => p.value.trim()),
        emails: form.emails.filter((e) => e.trim()),
        addresses: form.addresses.filter((a) => a.province || a.address || a.lat),
      };
      const r = contact ? await put(`/contacts/${contact.id}`, body) : await post('/contacts', body);
      const id: string = contact?.id ?? r.id;
      // The machine list is saved with the customer (only when it was touched).
      if (machinesDirty) {
        await put(`/contacts/${id}/machines`, { machines: machines.map(({ id: mid, controllerBrand, controllerModel, qty }) => ({ id: mid, controllerBrand, controllerModel, qty })) });
      }
      return { id };
    },
    {
      success: contact ? 'اطلاعات مخاطب به‌روز شد' : 'مخاطب جدید ثبت شد',
      onSuccess: (r) => { onClose(); onSaved?.(r.id); },
      onError: (e) => { if (e.status === 409 && e.details?.duplicates) setDupes(e.details.duplicates); else toast(e.message, 'error'); },
    },
  );

  const canNext = step !== 1 || form.name.trim().length > 1;
  const province = IRAN_PROVINCES.find((p) => p.name === form.addresses[0]?.province);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={UsersIcon}
      title={contact ? `ویرایش ${contact.name}` : 'مشتری / مخاطب جدید'}
      subtitle="مرحله (سرنخ سرد، گرم، مشتری…) یکی از ویژگی‌های مشتری است و در همین فرم تعیین می‌شود"
      footer={<>
        {dupes && (
          <div className="ml-auto flex items-center gap-2 text-xs text-amber">
            <AlertTriangle size={15} /> شماره تکراری با «{dupes.map((d) => d.name).join('، ')}»
            <Button size="sm" variant="outline" onClick={() => save.mutate(true)}>ثبت در هر صورت</Button>
          </div>
        )}
        {step > 1 && <Button variant="ghost" onClick={() => setStep(step - 1)}>مرحله قبل</Button>}
        {step < STEPS.length
          ? <Button variant="action" disabled={!canNext} onClick={() => setStep(step + 1)}>مرحله بعد</Button>
          : null}
        <Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate(false)}>ذخیره</Button>
      </>}
    >
      <div className="mb-6 flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => (s.n < step || canNext) && setStep(s.n)}
              className={clsx('flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] leading-4 transition sm:flex-row sm:gap-2 sm:px-3 sm:text-sm',
                step === s.n ? 'border-iris bg-iris/15 text-ink' : s.n < step ? 'border-line text-frost' : 'border-line/60 text-mist')}
            >
              <s.icon size={16} className="shrink-0" /> <span className="w-full truncate text-center sm:w-auto sm:text-right">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="hidden h-px w-3 bg-line sm:block" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نوع">
            <Select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="company">شرکت / کارگاه</option>
              <option value="person">شخص</option>
            </Select>
          </Field>
          <Field label={form.kind === 'company' ? 'نام شرکت / کارگاه *' : 'نام و نام خانوادگی *'}>
            <Input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={form.kind === 'company' ? 'رابط اصلی' : 'شرکت'} hint={form.kind === 'company' ? 'افراد و رابط‌های بیشتر را در پرونده مشتری اضافه کنید' : undefined}>
            <Input value={form.company} onChange={(e) => set({ company: e.target.value })} />
          </Field>
          <Field label="سمت">
            <Input value={form.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="مدیر تولید، سرپرست CNC…" />
          </Field>
          <Field label="منبع سرنخ">
            <Select value={form.leadSource} onChange={(e) => set({ leadSource: e.target.value })}>
              {settings.leadSources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="جزئیات منبع" hint="نام نمایشگاه، معرف، کمپین…">
            <Input value={form.leadSourceDetail} onChange={(e) => set({ leadSourceDetail: e.target.value })} />
          </Field>
          {!contact && (
            <Field label="مرحله فعلی">
              <Select value={form.stage} onChange={(e) => set({ stage: e.target.value })}>
                {settings.lifecycleStages.filter((s) => s.key !== 'lost').map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="نوع مشتری">
            <Select value={form.customerType} onChange={(e) => set({ customerType: e.target.value })}>
              {settings.customerTypes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="کارشناس مسئول"><UserPicker value={form.ownerId} onChange={(v) => set({ ownerId: v ?? me.id })} /></Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">شماره‌های تماس</span>
              <div className="space-y-2">
                {form.phones.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Select className="w-28" value={p.type} onChange={(e) => set({ phones: form.phones.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
                      <option value="mobile">موبایل</option><option value="work">محل کار</option><option value="fax">فکس</option><option value="other">سایر</option>
                    </Select>
                    <Input className="ltr text-left" value={p.value} placeholder="0912…" onChange={(e) => set({ phones: form.phones.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                    {form.phones.length > 1 && <Button variant="ghost" icon={Trash2} onClick={() => set({ phones: form.phones.filter((_, j) => j !== i) })} />}
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ phones: [...form.phones, { type: 'work', value: '' }] })}>شماره دیگر</Button>
              </div>
            </div>
            <div className="space-y-4">
              <Field label="ایمیل"><Input className="ltr text-left" value={form.emails[0] ?? ''} onChange={(e) => set({ emails: [e.target.value] })} /></Field>
              <Field label="وب‌سایت"><Input className="ltr text-left" value={form.website} onChange={(e) => set({ website: e.target.value })} /></Field>
            </div>
          </div>
          {form.addresses.map((a, i) => (
            <div key={i} className="rounded-2xl border border-line/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-frost">{i === 0 ? 'آدرس اصلی' : `آدرس ${num(i + 1)}`}</span>
                {i > 0 && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set({ addresses: form.addresses.filter((_, j) => j !== i) })} />}
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="عنوان"><Input value={a.title} onChange={(e) => setAddr(i, { title: e.target.value })} /></Field>
                <Field label="استان">
                  <Select value={a.province} onChange={(e) => setAddr(i, { province: e.target.value, county: '' })}>
                    <option value="">—</option>
                    {IRAN_PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label="شهرستان">
                  <Select value={a.county} onChange={(e) => setAddr(i, { county: e.target.value })}>
                    <option value="">—</option>
                    {(IRAN_PROVINCES.find((p) => p.name === a.province)?.counties ?? []).map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="کد پستی"><Input className="ltr" value={a.postalCode} onChange={(e) => setAddr(i, { postalCode: e.target.value })} /></Field>
                <Field label="نشانی" className="sm:col-span-4"><Input value={a.address} onChange={(e) => setAddr(i, { address: e.target.value })} /></Field>
              </div>
              {i === 0 && <div className="mt-3"><LocationPicker key={contact?.id ?? 'new'} lat={a.lat} lng={a.lng} province={province?.name} onChange={(lat, lng) => setAddr(0, { lat, lng })} /></div>}
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ addresses: [...form.addresses, { ...emptyAddress(), title: 'شعبه' }] })}>افزودن آدرس دیگر</Button>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {settings.customFields.filter((f) => !MACHINE_FIELDS.includes(f.key)).map((f) => (
            <Field key={f.key} label={f.label} className={f.type === 'multiselect' ? 'sm:col-span-2' : ''}>
              {f.type === 'multiselect' ? (
                <ChipSelect options={(f.options ?? []).map((o) => ({ value: o, label: o }))} value={form.attrs[f.key] ?? []} onChange={(v) => set({ attrs: { ...form.attrs, [f.key]: v } })} />
              ) : f.type === 'select' ? (
                <Select value={form.attrs[f.key] ?? ''} onChange={(e) => set({ attrs: { ...form.attrs, [f.key]: e.target.value } })}>
                  <option value="">—</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
                </Select>
              ) : (
                <Input type={f.type === 'number' ? 'number' : 'text'} value={form.attrs[f.key] ?? ''} onChange={(e) => set({ attrs: { ...form.attrs, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value } })} />
              )}
            </Field>
          ))}
          <Field label="ارزش تخمینی معامله" hint={settings.company.currency}>
            <MoneyInput value={form.estimatedValue} onChange={(v) => set({ estimatedValue: v })} />
          </Field>
          <Field label="امتیاز کیفی کارشناس"><div className="pt-1.5"><Stars value={form.rating} onChange={(v) => set({ rating: v })} size={20} /></div></Field>
          <Field label="برچسب‌ها" className="sm:col-span-2">
            <ChipSelect options={tags.map((t) => ({ value: t.id, label: t.name, color: t.color }))} value={form.tags} onChange={(v) => set({ tags: v })} />
          </Field>
          <Field label="یادداشت" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          <Toggle checked={form.starred} onChange={(v) => set({ starred: v })} label="نشان‌دار (اولویت فروش)" />
        </div>
      )}

      {step === 4 && (
        <MachinesEditor
          rows={machines}
          onChange={(rows) => { setMachines(rows); setMachinesDirty(true); }}
          legacy={{ controllers: Array.isArray(form.attrs.controllers) ? form.attrs.controllers : [], machines: Number(form.attrs.machines) || 0 }}
        />
      )}
    </Modal>
  );
}

/* ───────────────────────── Log a touchpoint ───────────────────────── */

export function LogTouchModal({ open, onClose, contact, completeFollowupId }: { open: boolean; onClose: () => void; contact: any; completeFollowupId?: string }) {
  const { settings } = useSession();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (open) {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 2); tomorrow.setHours(10, 0, 0, 0);
      setF({ type: 'call', direction: 'outbound', outcome: 'answered', body: '', durationMin: '', schedule: true, dueAt: tomorrow.getTime(), priority: 'normal', note: '', stage: '', lostReason: '' });
    }
  }, [open]);
  const save = useAction(() => post(`/contacts/${contact.id}/interactions`, {
    type: f.type, direction: f.direction, outcome: f.type === 'call' ? f.outcome : 'answered', body: f.body,
    durationMin: f.durationMin ? Number(f.durationMin) : undefined, completeFollowupId,
    followUp: f.schedule ? { dueAt: f.dueAt, priority: f.priority, note: f.note } : undefined,
    stage: f.stage || undefined, lostReason: f.lostReason || undefined,
  }), { success: 'ارتباط ثبت شد و امتیاز سرنخ به‌روز شد', onSuccess: onClose });

  if (!contact) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={PhoneCall}
      title={`ثبت ارتباط با ${contact.name}`}
      subtitle={contact.phones?.[0]?.value && <span className="ltr">{contact.phones[0].value}</span>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" loading={save.isPending} disabled={f.stage === 'lost' && !f.lostReason} onClick={() => save.mutate(undefined)}>ثبت</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(INTERACTION_TYPES).map(([k, label]) => (
            <button key={k} onClick={() => setF({ ...f, type: k })} className={clsx('rounded-full border px-3 py-1 text-xs', f.type === k ? 'border-transparent bg-iris text-night' : 'border-line text-mist')}>{label}</button>
          ))}
        </div>
        {f.type === 'call' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="جهت">
              <Select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
                <option value="outbound">تماس خروجی</option><option value="inbound">تماس ورودی</option>
              </Select>
            </Field>
            <Field label="نتیجه">
              <Select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
                {Object.entries(CALL_OUTCOMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="مدت (دقیقه)"><Input type="number" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /></Field>
          </div>
        )}
        <Field label="خلاصه گفتگو"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="نیاز مشتری، اعتراضات، قدم بعدی…" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="تغییر مرحله (اختیاری)">
            <Select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
              <option value="">بدون تغییر</option>
              {settings.lifecycleStages.filter((s) => s.key !== contact.stage).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          {f.stage === 'lost' && (
            <Field label="دلیل از دست رفتن *">
              <Select value={f.lostReason} onChange={(e) => setF({ ...f, lostReason: e.target.value })}>
                <option value="">—</option>{settings.lostReasons.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <div className="rounded-2xl border border-line/70 p-4">
          <Toggle checked={f.schedule} onChange={(v) => setF({ ...f, schedule: v })} label={<span className="flex items-center gap-1.5"><CalendarPlus size={15} />زمان‌بندی پیگیری بعدی</span>} />
          {f.schedule && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="تاریخ"><DateInput value={f.dueAt} onChange={(v) => setF({ ...f, dueAt: v })} clearable={false} /></Field>
              <Field label="اولویت">
                <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
                  <option value="low">کم</option><option value="normal">عادی</option><option value="high">بالا</option>
                </Select>
              </Field>
              <Field label="یادداشت پیگیری"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Score explanation ───────────────────────── */

const GROUPS = [
  { key: 'fit', label: 'تناسب با محصول', max: 35, color: '#779BE7' },
  { key: 'engagement', label: 'تعامل', max: 40, color: '#0FD69D' },
  { key: 'intent', label: 'قصد خرید', max: 35, color: '#F5B85A' },
] as const;

export function ScoreBreakdown({ parts = [], score }: { parts: { group: string; label: string; points: number }[]; score: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-mist"><Sparkles size={14} className="text-iris" />امتیاز {num(score)} از ۱۰۰ — قابل تنظیم در تنظیمات</div>
      {GROUPS.map((g) => {
        const items = parts.filter((p) => p.group === g.key);
        const sum = Math.min(g.max, items.reduce((s, p) => s + p.points, 0));
        return (
          <div key={g.key}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-frost">{g.label}</span>
              <span className="num text-ink">{num(Math.max(0, sum))} / {num(g.max)}</span>
            </div>
            <div className="mb-2 h-1.5 rounded-full bg-ink/[0.08]"><div className="h-full rounded-full" style={{ width: `${(Math.max(0, sum) / g.max) * 100}%`, background: g.color }} /></div>
            <ul className="space-y-1">
              {items.map((p, i) => (
                <li key={i} className="flex items-center justify-between text-xs text-mist">
                  <span>{p.label}</span>
                  <span className={clsx('num ltr font-medium', p.points >= 0 ? 'text-mint' : 'text-rose')}>{p.points > 0 ? '+' : ''}{num(p.points)}</span>
                </li>
              ))}
              {!items.length && <li className="text-xs text-mist/60">موردی ثبت نشده</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function NextActionTag({ action }: { action?: { label: string; tone: string } | null }) {
  if (!action) return null;
  const color = action.tone === 'urgent' ? '#FF499E' : action.tone === 'normal' ? '#779BE7' : '#9DB4C0';
  return (
    <span className="chip" style={{ background: `${color}1f`, color }}>
      <Sparkles size={11} />{action.label}
    </span>
  );
}

export function PhoneLine({ phones }: { phones?: { value: string }[] }) {
  if (!phones?.length) return <span className="text-mist">—</span>;
  return <a href={`tel:${phones[0].value}`} className="ltr inline-flex items-center gap-1 text-frost hover:text-iris"><Phone size={12} />{phones[0].value}</a>;
}
