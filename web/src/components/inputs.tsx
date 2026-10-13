import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Check, X } from 'lucide-react';
import clsx from 'clsx';
import {
  JALALI_MONTHS, JALALI_WEEKDAYS, formatJalali, fromJalali, jalaliMonthLength, jalaliToGregorian,
  parseJalali, toJalali, toPersianDigits,
} from '@shared/jalali';
import { useIsMobile } from '../lib/media';
import { Sheet } from './ui';

/** Floating panel anchored to an element, rendered in a portal so cards never clip it. */
function useAnchoredPanel(open: boolean, anchor: React.RefObject<HTMLElement | null>, width: number) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      const below = r.bottom + 6;
      const top = below + 340 > window.innerHeight && r.top > 360 ? r.top - 6 - 340 : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor, width]);
  return pos;
}

function useOutside(refs: React.RefObject<HTMLElement | null>[], onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (refs.every((r) => !r.current?.contains(e.target as Node))) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [active, onOutside, refs]);
}

/* ───────────────────────── Jalali date picker ───────────────────────── */

export function DateInput({
  value, onChange, placeholder = '۱۴۰۵/۰۷/۱۹', clearable = true, className,
}: { value: number | null | undefined; onChange: (ms: number | null) => void; placeholder?: string; clearable?: boolean; className?: string }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? formatJalali(value) : '');
  const today = toJalali(Date.now());
  const initial = value ? toJalali(value) : today;
  const [view, setView] = useState({ jy: initial.jy, jm: initial.jm });
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPanel(open && !mobile, anchor, 288);
  useOutside([anchor, panel], () => setOpen(false), open && !mobile);

  useEffect(() => { setText(value ? formatJalali(value) : ''); }, [value]);
  useEffect(() => {
    if (open) { const j = value ? toJalali(value) : today; setView({ jy: j.jy, jm: j.jm }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const days = jalaliMonthLength(view.jy, view.jm);
  const g = jalaliToGregorian(view.jy, view.jm, 1);
  const firstWeekday = (new Date(g.gy, g.gm - 1, g.gd).getDay() + 1) % 7; // Saturday = 0
  const selected = value ? toJalali(value) : null;
  const shift = (delta: number) => setView((v) => {
    let jm = v.jm + delta, jy = v.jy;
    if (jm < 1) { jm = 12; jy--; } if (jm > 12) { jm = 1; jy++; }
    return { jy, jm };
  });
  const pick = (jd: number) => {
    const keepHour = value ? new Date(value).getHours() : 10;
    onChange(fromJalali(view.jy, view.jm, jd, keepHour));
    setOpen(false);
  };
  const quick: [string, number][] = [['امروز', 0], ['فردا', 1], ['۳ روز بعد', 3], ['هفته بعد', 7]];

  const calendar = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-lg p-1.5 text-mist hover:bg-ink/10 hover:text-ink md:p-1.5" onClick={() => shift(-1)} aria-label="ماه قبل"><ChevronRight size={mobile ? 22 : 16} /></button>
        <span className="text-sm font-semibold md:text-sm">{JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}</span>
        <button type="button" className="rounded-lg p-1.5 text-mist hover:bg-ink/10 hover:text-ink" onClick={() => shift(1)} aria-label="ماه بعد"><ChevronLeft size={mobile ? 22 : 16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-mist">
        {JALALI_WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {Array.from({ length: firstWeekday }).map((_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const isSel = selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d;
          const isToday = today.jy === view.jy && today.jm === view.jm && today.jd === d;
          return (
            <button
              type="button"
              key={d}
              onClick={() => pick(d)}
              className={clsx(
                'num rounded-lg transition',
                mobile ? 'h-11 rounded-xl text-[15px]' : 'h-8',
                isSel ? 'bg-iris font-bold text-night' : isToday ? 'border border-iris/60 text-ink' : 'text-frost hover:bg-ink/10',
              )}
            >{toPersianDigits(d)}</button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/70 pt-3">
        {quick.map(([label, add]) => (
          <button
            type="button"
            key={label}
            className={clsx('rounded-lg bg-ink/[0.06] text-frost hover:bg-iris/20', mobile ? 'flex-1 py-2.5 text-sm' : 'px-2 py-1 text-xs')}
            onClick={() => { const d = new Date(); d.setDate(d.getDate() + add); d.setHours(10, 0, 0, 0); onChange(d.getTime()); setOpen(false); }}
          >{label}</button>
        ))}
      </div>
    </>
  );

  return (
    <div ref={anchor} className={clsx('relative', className)}>
      <input
        className="field ltr pl-16 text-right"
        value={text}
        placeholder={placeholder}
        readOnly={mobile}
        inputMode={mobile ? 'none' : undefined}
        onClick={() => mobile && setOpen(true)}
        onFocus={() => !mobile && setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          const ms = parseJalali(e.target.value);
          if (ms) onChange(ms);
          if (!e.target.value) onChange(null);
        }}
      />
      <div className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-mist">
        {clearable && value && (
          <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 hover:text-rose" aria-label="پاک کردن"><X size={14} /></button>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded p-0.5 hover:text-ink" aria-label="تقویم"><CalendarDays size={16} /></button>
      </div>
      {mobile ? (
        <Sheet open={open} onClose={() => setOpen(false)} title="انتخاب تاریخ" subtitle={value ? formatJalali(value) : undefined} icon={CalendarDays} layer={1100}>
          {calendar}
        </Sheet>
      ) : open && pos && createPortal(
        <div ref={panel} className="glass-strong fixed z-[1100] w-72 animate-fade-up p-3" style={pos}>{calendar}</div>,
        document.body,
      )}
    </div>
  );
}

/* ───────────────────────── Searchable picker ───────────────────────── */

export interface PickOption { value: string; label: string; hint?: string; color?: string; disabled?: boolean }

export function Picker({
  options, value, onChange, placeholder = 'انتخاب کنید…', className, emptyText = 'موردی یافت نشد', clearable,
}: {
  options: PickOption[]; value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string;
  className?: string; emptyText?: string; clearable?: boolean;
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);
  const pos = useAnchoredPanel(open && !mobile, anchor, width);
  useOutside([anchor, panel], () => setOpen(false), open && !mobile);
  useEffect(() => { if (open && anchor.current) setWidth(Math.max(260, anchor.current.offsetWidth)); }, [open]);

  const current = options.find((o) => o.value === value);
  const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase();
  const filtered = useMemo(() => {
    const qn = norm(query.trim());
    return (qn ? options.filter((o) => norm(`${o.label} ${o.hint ?? ''}`).includes(qn)) : options).slice(0, 80);
  }, [options, query]);
  useEffect(() => setActive(0), [query, open]);

  const choose = (o: PickOption) => { if (o.disabled) return; onChange(o.value); setOpen(false); setQuery(''); };

  return (
    <div ref={anchor} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="field flex items-center justify-between gap-2 text-right"
      >
        <span className={clsx('flex min-w-0 items-center gap-2 truncate', !current && 'text-mist/60')}>
          {current?.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: current.color }} />}
          <span className="truncate">{current ? current.label : placeholder}</span>
          {current?.hint && <span className="truncate text-xs text-mist">{current.hint}</span>}
        </span>
        <span className="flex items-center gap-1 text-mist">
          {clearable && current && (
            <span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onChange(null); }} className="hover:text-rose"><X size={14} /></span>
          )}
          <ChevronDown size={15} />
        </span>
      </button>
      {mobile ? (
        <Sheet open={open} onClose={() => { setOpen(false); setQuery(''); }} title={placeholder.replace(/…$/, '')} layer={1100} bodyClass="!px-2">
          <div className="sticky top-0 z-10 bg-[#2a393f] px-2 pb-2">
            <input className="field" placeholder="جستجو…" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
          </div>
          <ul role="listbox">
            {filtered.length === 0 && <li className="px-3 py-8 text-center text-sm text-mist">{emptyText}</li>}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => choose(o)}
                  disabled={o.disabled}
                  className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-right text-[15px] transition active:bg-ink/[0.07] disabled:opacity-40', o.value === value ? 'bg-iris/15 text-ink' : 'text-frost')}
                >
                  {o.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-mist">{o.hint}</span>}
                  </span>
                  {o.value === value && <Check size={18} className="shrink-0 text-iris" />}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : open && pos && createPortal(
        <div ref={panel} className="glass-strong fixed z-[1100] animate-fade-up overflow-hidden" style={{ ...pos, width }}>
          <div className="border-b border-line/70 p-2">
            <input
              autoFocus
              className="field h-8 py-1"
              placeholder="جستجو…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
                if (e.key === 'Escape') setOpen(false);
              }}
            />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1" role="listbox">
            {filtered.length === 0 && <li className="px-3 py-4 text-center text-sm text-mist">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  disabled={o.disabled}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm transition disabled:opacity-40',
                    i === active ? 'bg-iris/20 text-ink' : 'text-frost',
                  )}
                >
                  {o.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 truncate text-xs text-mist">{o.hint}</span>}
                  {o.value === value && <Check size={14} className="text-iris" />}
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Toggle-chips for multi-select vocabularies (controllers, tags…). */
export function ChipSelect({ options, value, onChange }: { options: { value: string; label: string; color?: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={clsx('rounded-full border px-2.5 py-1 text-xs transition', on ? 'border-transparent text-night' : 'border-line text-mist hover:text-ink')}
            style={on ? { background: o.color ?? '#779BE7' } : undefined}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <div><span className="label">{label}</span>{children}</div>;
}
