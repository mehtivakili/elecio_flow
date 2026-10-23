import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Cog, Plus, Trash2, Search, Check, X, Minus, Copy, Factory, Wand2, ChevronDown, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { CONTROLLER_BRANDS, MAIN_BRANDS } from '@shared/machines';
import { del, post, put } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Empty, Field, Input, Modal, useConfirm } from './ui';
import { BrandLogo } from './brandLogos';
import { num } from '../lib/format';

/* ───────────────────────── Brands & models (built-in + this workspace's) ───────────────────────── */

export interface BrandInfo { key: string; label: string; fa?: string; color: string; custom?: boolean; machines?: number }
interface PickerData { custom: { brand: string; model: string }[]; used: { brand: string; model: string; machines: number }[]; brands: { key: string; label: string; color: string; machines: number }[] }

export function useBrands() {
  const { data } = useApi<PickerData>('/controller-models');
  return useMemo(() => {
    const list: BrandInfo[] = [
      ...CONTROLLER_BRANDS.filter((b) => b.key !== 'other').map((b) => ({ key: b.key, label: b.label, fa: b.fa, color: b.color })),
      ...(data?.brands ?? []).map((b) => ({ ...b, custom: true })),
      { key: 'other', label: 'سایر', fa: 'سایر برندها', color: '#9DB4C0' },
    ];
    const byKey = (k?: string | null): BrandInfo => list.find((b) => b.key === k) ?? { key: k ?? 'other', label: k ?? 'سایر', color: '#9DB4C0' };
    return { list, byKey, data };
  }, [data]);
}

function useModelOptions(brand: string) {
  const { data } = useBrands();
  return useMemo(() => {
    const catalogue = CONTROLLER_BRANDS.find((b) => b.key === brand)?.models ?? [];
    const used = new Map((data?.used ?? []).filter((u) => u.brand === brand).map((u) => [u.model.toLowerCase(), u.machines]));
    const names = [...catalogue, ...(data?.custom ?? []).filter((c) => c.brand === brand).map((c) => c.model), ...(data?.used ?? []).filter((u) => u.brand === brand).map((u) => u.model)];
    const seen = new Set<string>();
    return names.filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((model) => ({ model, machines: used.get(model.toLowerCase()) ?? 0, custom: !catalogue.includes(model) }))
      .sort((a, b) => b.machines - a.machines);
  }, [data, brand]);
}

export function BrandPill({ brand, model }: { brand: string; model?: string }) {
  const b = useBrands().byKey(brand);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: `${b.color}22`, color: b.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />
      {b.label}{model && <span className="ltr code font-medium text-frost">{model}</span>}
    </span>
  );
}

/* ───────────────────────── Floating panel anchored to a field (never clipped by dialogs) ───────────────────────── */

function Floating({ anchor, open, onClose, minWidth = 260, maxHeight = 380, children }: {
  anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; minWidth?: number; maxHeight?: number; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      const up = window.innerHeight - r.bottom < maxHeight && r.top > window.innerHeight - r.bottom;
      setPos({ top: up ? r.top - 6 : r.bottom + 6, left, width, up });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor, minWidth, maxHeight]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc, true); };
  }, [open, anchor, onClose]);
  if (!open || !pos) return null;
  return createPortal(
    <div ref={panel} dir="rtl" className="fixed z-[1200] flex flex-col overflow-hidden rounded-2xl border border-line bg-[#24323a] shadow-2xl"
      style={{ left: pos.left, width: pos.width, maxHeight, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
      {children}
    </div>,
    document.body,
  );
}

/* ───────────────────────── Brand picker: 6 main logos, the rest under «برندهای دیگر» ───────────────────────── */

const SWATCHES = ['#779BE7', '#0FD69D', '#F5B85A', '#FF499E', '#B48CF2', '#5EC8E5', '#E67E22', '#9DB4C0'];

export function BrandPicker({ value, onPick, compact }: { value?: string; onPick: (key: string) => void; compact?: boolean }) {
  const { list } = useBrands();
  const confirm = useConfirm();
  const main = MAIN_BRANDS.map((k) => list.find((b) => b.key === k)!).filter(Boolean);
  const others = list.filter((b) => !MAIN_BRANDS.includes(b.key));
  const [more, setMore] = useState(() => !!value && !MAIN_BRANDS.includes(value));
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const addBrand = useAction(() => post<BrandInfo>('/controller-brands', { label, color }), {
    success: 'برند اضافه شد', onSuccess: (b) => { setAdding(false); setLabel(''); onPick(b.key); },
  });
  const removeBrand = useAction((key: string) => del(`/controller-brands/${key}?force=1`), { success: 'برند حذف شد' });

  const tile = (b: BrandInfo) => {
    const on = value === b.key;
    return (
      <div key={b.key} className="relative">
        <button type="button" onClick={() => onPick(b.key)} title={b.fa ? `${b.label} — ${b.fa}` : b.label}
          className={clsx('flex w-full flex-col items-center gap-1.5 rounded-2xl border p-2 transition active:scale-95',
            on ? 'border-iris bg-iris/15 shadow-lg ring-2 ring-iris/40' : 'border-line/60 bg-deep/40 hover:border-line')}>
          <BrandLogo brand={b.key} label={b.label} color={b.color} height={compact ? 34 : 46} className="!w-full" />
          <span className={clsx('w-full truncate text-center text-[10.5px]', on ? 'font-bold text-ink' : 'text-mist')}>{b.fa ?? b.label}</span>
        </button>
        {b.custom && (
          <button type="button" aria-label={`حذف برند ${b.label}`} title="حذف این برند"
            onClick={async () => { if (await confirm({ title: `حذف برند ${b.label}`, danger: true, confirm: 'حذف', body: `برند از فهرست حذف می‌شود${b.machines ? ` و ${num(b.machines)} ماشینِ این برند به «سایر» منتقل می‌شوند` : ''}.` })) removeBrand.mutate(b.key); }}
            className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose text-white shadow">
            <X size={11} strokeWidth={3} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">{main.map(tile)}</div>
      <button type="button" onClick={() => setMore(!more)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-xs font-semibold text-frost transition hover:border-iris/60 hover:text-iris">
        برندهای دیگر ({num(others.length)})<ChevronDown size={14} className={clsx('transition', more && 'rotate-180')} />
      </button>
      {more && (
        <div className="animate-fade-up space-y-2">
          <div className={clsx('grid grid-cols-3 gap-2', !compact && 'sm:grid-cols-4')}>
            {others.map(tile)}
            <button type="button" onClick={() => setAdding(true)}
              className="flex min-h-[70px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-iris/50 bg-iris/[0.05] p-2 text-[11px] font-semibold text-iris hover:bg-iris/10">
              <Plus size={18} />افزودن برند
            </button>
          </div>
          {adding && (
            <div className="rounded-2xl border border-iris/40 bg-iris/[0.06] p-3">
              <div className="flex gap-2">
                <Input autoFocus className="flex-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="نام برند کنترلر، مثلاً ANILAM"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (label.trim().length > 1) addBrand.mutate(undefined); } }} />
                <Button variant="primary" icon={Check} loading={addBrand.isPending} disabled={label.trim().length < 2} onClick={() => addBrand.mutate(undefined)}>ثبت</Button>
                <Button variant="ghost" icon={X} aria-label="انصراف" onClick={() => { setAdding(false); setLabel(''); }} />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[11px] text-mist">رنگ:</span>
                {SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={clsx('h-6 w-6 rounded-full transition', color === c && 'ring-2 ring-white ring-offset-2 ring-offset-[#24323a]')} style={{ background: c }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Model picker: searchable, last row always «add new model» ───────────────────────── */

export function ModelPicker({ brand, value, onChange, compact, busy }: { brand: string; value: string; onChange: (v: string) => void; compact?: boolean; busy?: boolean }) {
  const list = useModelOptions(brand);
  const b = useBrands().byKey(brand);
  const { can } = useSession();
  const confirm = useConfirm();
  const removeModel = useAction((model: string) => post('/controller-models/remove', { brand, model }), { success: (r: any) => (r.cleared ? `مدل حذف شد و از ${num(r.cleared)} ماشین پاک شد` : 'مدل حذف شد') });
  const askRemove = async (o: { model: string; machines: number }) => {
    const ok = await confirm({
      title: `حذف مدل ${o.model}`, danger: true, confirm: 'حذف',
      body: `«${o.model}» از فهرست مدل‌های ${b.label} حذف می‌شود${o.machines ? ` و از ${num(o.machines)} ماشین هم پاک می‌شود (برندشان می‌ماند)` : ''}.`,
    });
    if (!ok) return;
    if (value.toLowerCase() === o.model.toLowerCase()) onChange('');
    removeModel.mutate(o.model);
  };
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase().replace(/[\s-]/g, '');
  const shown = creating ? [] : list.filter((o) => !q || o.model.toLowerCase().replace(/[\s-]/g, '').includes(q)).slice(0, 60);
  const exact = list.some((o) => o.model.toLowerCase() === query.trim().toLowerCase());
  const close = () => { setOpen(false); setCreating(false); setQuery(''); };
  const pick = (v: string) => { onChange(v); close(); };
  const startCreate = () => { setCreating(true); setTimeout(() => input.current?.focus(), 20); };

  return (
    <div ref={box} className="relative min-w-0">
      <button type="button" onClick={() => { setOpen(true); setTimeout(() => input.current?.focus(), 30); }}
        className={clsx('field flex w-full items-center justify-between gap-2 text-right', compact && '!h-10 !min-h-0', !value && 'text-mist')}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} />
          <span className={clsx('truncate', value && 'ltr code font-semibold text-ink')}>{value || (compact ? 'انتخاب مدل کنترلر…' : `مدل کنترلر ${b.label} (اختیاری)`)}</span>
        </span>
        {busy ? <Loader2 size={15} className="shrink-0 animate-spin text-mist" />
          : value ? <span role="button" tabIndex={0} aria-label="پاک کردن مدل" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="text-mist hover:text-rose"><X size={15} /></span>
            : <Search size={15} className="shrink-0 text-mist" />}
      </button>
      <Floating anchor={box} open={open} onClose={close}>
        <div className="relative border-b border-line/70 p-2">
          {creating ? <Plus size={15} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-iris" /> : <Search size={15} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-mist" />}
          <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={creating ? `نام مدل جدید ${b.label}…` : `جستجوی مدل ${b.label}…`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (creating) { if (query.trim()) pick(query.trim()); } else if (shown[0]) pick(shown[0].model); else if (query.trim()) pick(query.trim()); }
            }}
            className={clsx('field ltr code h-10 w-full pr-9 text-left', creating && 'border-iris/60')} />
        </div>
        {!creating && (
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {shown.map((o) => (
              <li key={o.model} className="flex items-center gap-1">
                <button type="button" onClick={() => pick(o.model)}
                  className={clsx('flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-right transition hover:bg-iris/15', value === o.model && 'bg-iris/10')}>
                  <span className="ltr code truncate text-[13px] font-semibold text-ink">{o.model}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[10.5px] text-mist">
                    {o.machines > 0 && <span className="rounded-md bg-mint/10 px-1.5 py-0.5 text-mint">{num(o.machines)} ماشین</span>}
                    {o.custom && <span>افزوده‌شده</span>}
                    {value === o.model && <Check size={14} className="text-iris" />}
                  </span>
                </button>
                {o.custom && can('crm') && (
                  <button type="button" onClick={() => askRemove(o)} aria-label={`حذف مدل ${o.model}`} title="حذف این مدل از فهرست"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-mist transition hover:bg-rose/15 hover:text-rose">
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
            {!shown.length && <li className="px-3 py-3 text-center text-xs text-mist">مدلی با این نام در فهرست نیست</li>}
          </ul>
        )}
        {/* Always the last option */}
        {creating ? (
          <div className="flex gap-2 border-t border-line/70 p-2">
            <Button size="sm" variant="primary" icon={Check} disabled={!query.trim()} onClick={() => pick(query.trim())}>ثبت مدل جدید</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setQuery(''); }}>بازگشت به فهرست</Button>
          </div>
        ) : (
          <button type="button" onClick={() => (query.trim() && !exact ? pick(query.trim()) : startCreate())}
            className="flex w-full items-center gap-2 border-t border-line/70 bg-iris/[0.08] px-4 py-3 text-right text-[13px] font-semibold text-iris hover:bg-iris/15">
            <Plus size={15} />
            {query.trim() && !exact ? <>افزودن مدل جدید «<span className="ltr code">{query.trim()}</span>»</> : 'افزودن مدل جدید…'}
          </button>
        )}
      </Floating>
    </div>
  );
}

/** Logo that opens the brand picker in place (change a machine's brand without an edit dialog). */
function BrandSwitch({ brand, onPick, height = 38 }: { brand: string; onPick: (key: string) => void; height?: number }) {
  const b = useBrands().byKey(brand);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen(!open)} title="تغییر برند کنترلر" aria-label={`برند ${b.label} — تغییر`}
        className="shrink-0 rounded-xl transition hover:ring-2 hover:ring-iris/50 focus-visible:ring-2 focus-visible:ring-iris">
        <BrandLogo brand={brand} label={b.label} color={b.color} height={height} />
      </button>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} minWidth={320} maxHeight={480}>
        <div className="overflow-y-auto p-3">
          <div className="mb-2 text-xs font-bold text-ink">برند کنترلر این ماشین</div>
          <BrandPicker compact value={brand} onPick={(k) => { setOpen(false); if (k !== brand) onPick(k); }} />
        </div>
      </Floating>
    </>
  );
}

/* ───────────────────────── Count stepper (only when adding: N separate machines) ───────────────────────── */

export function Stepper({ value, onChange, min = 1, max = 99, small }: { value: number; onChange: (v: number) => void; min?: number; max?: number; small?: boolean }) {
  return (
    <div className={clsx('flex items-center overflow-hidden rounded-xl border border-line bg-deep/60', small ? 'h-10' : 'h-11')}>
      <button type="button" className={clsx('flex h-full items-center justify-center text-mist hover:bg-ink/[0.06] disabled:opacity-30', small ? 'w-9' : 'w-11')} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="بیشتر"><Plus size={16} /></button>
      <input inputMode="numeric" aria-label="تعداد" className={clsx('num h-full w-10 min-w-0 flex-1 bg-transparent text-center font-bold text-ink outline-none', small ? 'text-sm' : 'text-base')} value={value}
        onChange={(e) => { const n = Number(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '')); onChange(Math.min(max, Math.max(min, n || min))); }} />
      <button type="button" className={clsx('flex h-full items-center justify-center text-mist hover:bg-ink/[0.06] disabled:opacity-30', small ? 'w-9' : 'w-11')} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="کمتر"><Minus size={16} /></button>
    </div>
  );
}

/* ───────────────────────── Add machines (customer page) ───────────────────────── */

export function MachineModal({ contact, open, onClose }: { contact: any; open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ controllerBrand: '', controllerModel: '', count: 1 });
  useEffect(() => { if (open) setF({ controllerBrand: '', controllerModel: '', count: 1 }); }, [open]);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const save = useAction(() => post(`/contacts/${contact.id}/machines`, f), {
    success: f.count > 1 ? `${num(f.count)} ماشین اضافه شد — مدل هر کدام را در لیست انتخاب کنید` : 'ماشین اضافه شد', onSuccess: onClose,
  });
  return (
    <Modal open={open} onClose={onClose} icon={Cog} size="md" title="افزودن ماشین"
      subtitle="برند کنترلر را انتخاب کنید؛ مدل را همین‌جا یا بعداً در لیست تعیین کنید"
      footer={<>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" icon={Check} disabled={!f.controllerBrand} loading={save.isPending} onClick={() => save.mutate(undefined)}>{f.count > 1 ? `افزودن ${num(f.count)} ماشین` : 'افزودن'}</Button>
      </>}>
      <div className="space-y-5">
        <Field label="برند کنترلر *"><BrandPicker value={f.controllerBrand} onPick={(k) => set({ controllerBrand: k, controllerModel: k === f.controllerBrand ? f.controllerModel : '' })} /></Field>
        {f.controllerBrand && (
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <Field label="مدل کنترلر"><ModelPicker brand={f.controllerBrand} value={f.controllerModel} onChange={(v) => set({ controllerModel: v })} /></Field>
            <Field label="تعداد ماشین" hint={f.count > 1 ? 'هر کدام جدا ثبت می‌شود' : undefined}><Stepper value={f.count} onChange={(v) => set({ count: v })} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────── One machine: brand and model editable in place ───────────────────────── */

function MachineRowCard({ m, index, editable, onCopy, onDelete, copying }: { m: any; index: number; editable: boolean; onCopy: () => void; onDelete: () => void; copying?: boolean }) {
  const b = useBrands().byKey(m.controllerBrand);
  const update = useAction((patch: Record<string, string>) => put(`/machines/${m.id}`, patch));
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line/60 bg-deep/40 p-2.5">
      <span className="num w-5 shrink-0 text-center text-xs font-bold text-mist">{num(index + 1)}</span>
      {editable
        ? <BrandSwitch brand={m.controllerBrand} onPick={(k) => update.mutate({ controllerBrand: k, controllerModel: '' })} />
        : <BrandLogo brand={m.controllerBrand} label={b.label} color={b.color} height={38} />}
      <div className="min-w-0 flex-1">
        <div className="mb-1 truncate text-[11px] text-mist">{b.label}{b.fa ? ` · ${b.fa}` : ''}</div>
        {editable
          ? <ModelPicker compact brand={m.controllerBrand} value={m.controllerModel} busy={update.isPending} onChange={(v) => update.mutate({ controllerModel: v })} />
          : m.controllerModel ? <div className="ltr code truncate text-right text-[15px] font-bold text-ink">{m.controllerModel}</div> : <div className="text-[13px] text-mist">مدل نامشخص</div>}
      </div>
      {editable && (
        <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
          <Button size="sm" variant="ghost" icon={Copy} aria-label="کپی" title="کپی این ماشین (یک ماشین دیگر با همین مشخصات)" disabled={copying} onClick={onCopy} />
          <Button size="sm" variant="ghost" icon={Trash2} aria-label="حذف" className="text-rose" onClick={onDelete} />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Machines tab on the customer page ───────────────────────── */

export function MachinesTab({ contact }: { contact: any }) {
  const { data = [], isLoading } = useApi<any[]>(`/contacts/${contact.id}/machines`);
  const confirm = useConfirm();
  const { can } = useSession();
  const { byKey } = useBrands();
  const [adding, setAdding] = useState(false);
  const remove = useAction((id: string) => del(`/machines/${id}`), { success: 'ماشین حذف شد' });
  const copy = useAction((id: string) => post(`/machines/${id}/copy`), { success: 'یک ماشین با همین مشخصات اضافه شد' });
  const convert = useAction(() => post(`/contacts/${contact.id}/machines/from-summary`), { success: 'از اطلاعات قبلی ساخته شد — مدل هر ماشین را انتخاب کنید' });
  const editable = can('crm');
  const total = data.length;
  const brands = [...new Set(data.map((m) => m.controllerBrand))];
  const noModel = data.filter((m) => !m.controllerModel).length;
  const legacy: string[] = Array.isArray(contact.attrs?.controllers) ? contact.attrs.controllers : [];

  return (
    <Card title="ماشین‌ها و کنترلرها" icon={Cog}
      subtitle={total ? `${num(total)} ماشین · ${num(brands.length)} برند کنترلر${noModel ? ` · ${num(noModel)} بدون مدل` : ''}` : 'ماشین‌های CNC این مشتری را با برند و مدل کنترلر ثبت کنید'}
      actions={editable && <Button size="sm" variant="action" icon={Plus} onClick={() => setAdding(true)}>افزودن ماشین</Button>}>
      {isLoading ? null : total === 0 ? (
        <div className="space-y-3">
          {legacy.length > 0 && editable && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber/30 bg-amber/[0.07] px-4 py-3 text-sm">
              <Wand2 size={18} className="shrink-0 text-amber" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">اطلاعات قبلی: {legacy.join('، ')}{contact.attrs?.machines ? ` · ${num(contact.attrs.machines)} ماشین` : ''}</div>
                <div className="text-xs text-mist">با یک کلیک به فهرست ماشین تبدیل کنید و بعد مدل هر کدام را انتخاب کنید.</div>
              </div>
              <Button size="sm" variant="outline" loading={convert.isPending} onClick={() => convert.mutate(undefined)}>تبدیل به فهرست ماشین</Button>
            </div>
          )}
          <Empty icon={Factory} title="هنوز ماشینی ثبت نشده" hint="برند کنترلر (فانوک، زیمنس، هایدن‌هاین…) و مدل دقیق را وارد کنید"
            action={editable && <Button variant="action" icon={Plus} onClick={() => setAdding(true)}>افزودن اولین ماشین</Button>} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-ink/[0.06]">
            {brands.map((k) => {
              const n = data.filter((m) => m.controllerBrand === k).length;
              return <span key={k} title={`${byKey(k).label}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: byKey(k).color }} />;
            })}
          </div>
          <div className="grid gap-2 2xl:grid-cols-2">
            {data.map((m, i) => (
              <MachineRowCard key={m.id} m={m} index={i} editable={editable} copying={copy.isPending}
                onCopy={() => copy.mutate(m.id)}
                onDelete={async () => { if (await confirm({ title: 'حذف ماشین', danger: true, confirm: 'حذف', body: `${byKey(m.controllerBrand).label} ${m.controllerModel || ''} حذف شود؟` })) remove.mutate(m.id); }} />
            ))}
          </div>
        </div>
      )}
      <MachineModal contact={contact} open={adding} onClose={() => setAdding(false)} />
    </Card>
  );
}

/* ───────────────────────── Editor inside the customer create / edit form ───────────────────────── */

export interface MachineRow { id?: string; tmp: string; controllerBrand: string; controllerModel: string; qty: number }
export const newRow = (r: Partial<MachineRow>): MachineRow => ({ tmp: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, controllerBrand: 'other', controllerModel: '', qty: 1, ...r });

/** Local list (saved together with the customer), one row per machine: pick brand (and how many), set each model, copy, remove. */
export function MachinesEditor({ rows, onChange, legacy }: { rows: MachineRow[]; onChange: (rows: MachineRow[]) => void; legacy?: { controllers: string[]; machines: number } }) {
  const { byKey } = useBrands();
  const [picking, setPicking] = useState(rows.length === 0);
  const [count, setCount] = useState(1);
  const setRow = (tmp: string, patch: Partial<MachineRow>) => onChange(rows.map((r) => (r.tmp === tmp ? { ...r, ...patch } : r)));
  const fromLegacy = () => {
    const keys = [...new Set((legacy?.controllers ?? []).map((l) => CONTROLLER_BRANDS.find((b) => b.legacy === l && b.key !== 'other')?.key ?? 'other'))];
    const plan: string[] = keys.length === 1 ? Array(Math.min(99, Math.max(1, legacy?.machines ?? 1))).fill(keys[0]) : keys;
    onChange(plan.map((k) => newRow({ controllerBrand: k })));
    setPicking(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-frost">{rows.length ? <><b className="num text-ink">{num(rows.length)}</b> ماشین</> : 'هنوز ماشینی تعریف نشده'}</div>
        {!picking && <Button size="sm" variant="action" icon={Plus} onClick={() => { setCount(1); setPicking(true); }}>افزودن ماشین</Button>}
      </div>

      {!rows.length && !!legacy?.controllers.length && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber/30 bg-amber/[0.07] px-3 py-2.5 text-xs">
          <Wand2 size={16} className="shrink-0 text-amber" />
          <span className="min-w-0 flex-1 text-frost">اطلاعات قبلی: {legacy.controllers.join('، ')}{legacy.machines ? ` · ${num(legacy.machines)} ماشین` : ''}</span>
          <Button size="sm" variant="outline" onClick={fromLegacy}>ساخت فهرست از همین</Button>
        </div>
      )}

      {picking && (
        <div className="rounded-2xl border border-iris/40 bg-iris/[0.04] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink">برند کنترلر را انتخاب کنید</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-mist">تعداد ماشین:</span>
              <div className="w-32"><Stepper small value={count} onChange={setCount} /></div>
              {rows.length > 0 && <Button size="sm" variant="ghost" icon={X} aria-label="بستن" onClick={() => setPicking(false)} />}
            </div>
          </div>
          {count > 1 && <p className="mb-2 text-[11px] text-mist">{num(count)} ماشین جدا ساخته می‌شود؛ مدل هر کدام را در لیست انتخاب کنید.</p>}
          <BrandPicker onPick={(k) => { onChange([...rows, ...Array.from({ length: count }, () => newRow({ controllerBrand: k }))]); setPicking(false); }} />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r, i) => {
          const b = byKey(r.controllerBrand);
          return (
            <div key={r.tmp} className="flex min-w-0 items-center gap-2 rounded-2xl border border-line/60 bg-deep/40 p-2">
              <span className="num w-4 shrink-0 text-center text-[11px] font-bold text-mist">{num(i + 1)}</span>
              <BrandSwitch brand={r.controllerBrand} height={28} onPick={(k) => setRow(r.tmp, { controllerBrand: k, controllerModel: '' })} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 truncate text-[11px] text-mist">{b.label}{b.fa ? ` · ${b.fa}` : ''}</div>
                <ModelPicker compact brand={r.controllerBrand} value={r.controllerModel} onChange={(v) => setRow(r.tmp, { controllerModel: v })} />
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                <Button size="sm" variant="ghost" icon={Copy} aria-label="کپی" title="کپی این ماشین" onClick={() => onChange([...rows.slice(0, i + 1), newRow({ controllerBrand: r.controllerBrand, controllerModel: r.controllerModel }), ...rows.slice(i + 1)])} />
                <Button size="sm" variant="ghost" icon={Trash2} aria-label="حذف" className="text-rose" onClick={() => onChange(rows.filter((x) => x.tmp !== r.tmp))} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Settings: brands and models added by the workspace ───────────────────────── */

export function ControllersAdmin() {
  const { data, isLoading } = useApi<{ brands: any[]; models: { brand: string; model: string; machines: number }[] }>('/controller-catalogue');
  const { byKey } = useBrands();
  const { can } = useSession();
  const confirm = useConfirm();
  const removeModel = useAction((m: { brand: string; model: string }) => post('/controller-models/remove', m), { success: (r: any) => (r.cleared ? `مدل حذف شد و از ${num(r.cleared)} ماشین پاک شد` : 'مدل حذف شد') });
  const removeBrand = useAction((key: string) => del(`/controller-brands/${key}?force=1`), { success: (r: any) => (r?.moved ? `برند حذف شد و ${num(r.moved)} ماشین به «سایر» منتقل شد` : 'برند حذف شد') });
  const editable = can('crm');
  const byBrand = new Map<string, { model: string; machines: number }[]>();
  for (const m of data?.models ?? []) byBrand.set(m.brand, [...(byBrand.get(m.brand) ?? []), m]);

  if (isLoading || !data) return null;
  return (
    <div className="space-y-6">
      <Card title="مدل‌های کنترلرِ افزوده‌شده" icon={Cog} subtitle="مدل‌هایی که خارج از فهرست پیش‌فرض اضافه شده‌اند. حذف، مدل را از فهرست و از ماشین‌هایی که آن را دارند پاک می‌کند (برندشان می‌ماند).">
        {byBrand.size === 0 ? <Empty icon={Cog} title="مدلی اضافه نشده" /> : (
          <div className="space-y-4">
            {[...byBrand.entries()].map(([brand, models]) => {
              const b = byKey(brand);
              return (
                <div key={brand}>
                  <div className="mb-2 flex items-center gap-2">
                    <BrandLogo brand={brand} label={b.label} color={b.color} height={26} />
                    <span className="text-sm font-semibold text-ink">{b.label}</span>
                    <span className="text-xs text-mist">{num(models.length)} مدل</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {models.map((m) => (
                      <span key={m.model} className="inline-flex items-center gap-2 rounded-xl border border-line/60 bg-deep/40 py-1 pe-1 ps-3 text-sm">
                        <span className="ltr code font-semibold text-ink">{m.model}</span>
                        <span className="text-[11px] text-mist">{m.machines ? `${num(m.machines)} ماشین` : 'بدون ماشین'}</span>
                        {editable && (
                          <button type="button" aria-label={`حذف ${m.model}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-mist hover:bg-rose/15 hover:text-rose"
                            onClick={async () => {
                              if (await confirm({ title: `حذف مدل ${m.model}`, danger: true, confirm: 'حذف', body: `از فهرست ${b.label} حذف می‌شود${m.machines ? ` و از ${num(m.machines)} ماشین هم پاک می‌شود` : ''}.` })) removeModel.mutate({ brand, model: m.model });
                            }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card title="برندهای افزوده‌شده" icon={Cog} subtitle="برندهای پیش‌فرض قابل حذف نیستند. با حذف یک برند، ماشین‌های آن به «سایر» منتقل می‌شوند.">
        {data.brands.length === 0 ? <Empty icon={Cog} title="برندی اضافه نشده" hint="از فرم ماشین ← «برندهای دیگر» ← «افزودن برند»" /> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.brands.map((b: any) => (
              <div key={b.key} className="flex items-center gap-3 rounded-2xl border border-line/60 bg-deep/40 p-2.5">
                <BrandLogo brand={b.key} label={b.label} color={b.color} height={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{b.label}</div>
                  <div className="text-[11px] text-mist">{b.machines ? `${num(b.machines)} ماشین` : 'بدون ماشین'}{byBrand.get(b.key)?.length ? ` · ${num(byBrand.get(b.key)!.length)} مدل` : ''}</div>
                </div>
                {editable && (
                  <Button size="sm" variant="ghost" icon={Trash2} className="text-rose" aria-label={`حذف ${b.label}`}
                    onClick={async () => { if (await confirm({ title: `حذف برند ${b.label}`, danger: true, confirm: 'حذف', body: `برند و مدل‌هایش از فهرست حذف می‌شوند${b.machines ? ` و ${num(b.machines)} ماشین به «سایر» منتقل می‌شوند` : ''}.` })) removeBrand.mutate(b.key); }} />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
