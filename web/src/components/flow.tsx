import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Lock, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import type { StageDef } from '@shared/defaults';
import { dateTime, isolateCodes, num, relative } from '../lib/format';

const GATE_LABELS: Record<string, string> = {
  deposit: 'نیازمند پیش‌پرداخت',
  full_payment: 'نیازمند تسویه کامل',
  allocation: 'نیازمند تخصیص کالا',
  shipment: 'نیازمند ثبت محموله',
  kitting: 'نیازمند موجودی قطعات',
  qc_pass: 'نیازمند تأیید QC',
};

/**
 * Horizontal stage tracker used by orders and work orders. Each step shows
 * how long it took (from the stage log), its SLA and the gate guarding its exit.
 */
export function StageTrack({
  stages, current, history = [], closed, onPick,
}: {
  stages: StageDef[]; current: string; history?: { stage: string; enteredAt: number; leftAt?: number | null }[];
  closed?: boolean; onPick?: (key: string) => void;
}) {
  const index = stages.findIndex((s) => s.key === current);
  const track = useRef<HTMLDivElement>(null);
  // On narrow screens bring the current step into view instead of always showing step 1.
  useEffect(() => {
    const el = track.current;
    const step = el?.querySelector<HTMLElement>('[data-current="true"]');
    if (!el || !step || el.scrollWidth <= el.clientWidth) return;
    const box = el.getBoundingClientRect(), at = step.getBoundingClientRect();
    el.scrollBy({ left: at.left + at.width / 2 - (box.left + box.width / 2), behavior: 'smooth' });
  }, [index]);
  return (
    <div ref={track} className="no-scrollbar overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start">
        {stages.map((s, i) => {
          const done = closed || i < index;
          const active = !closed && i === index;
          const log = [...history].reverse().find((h) => h.stage === s.key);
          const days = log ? ((log.leftAt ?? Date.now()) - log.enteredAt) / 86_400_000 : null;
          const late = active && s.slaDays && days !== null && days > s.slaDays;
          return (
            <li key={s.key} className="flex items-start" data-current={active}>
              <button
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(s.key)}
                className={clsx('group flex w-[104px] flex-col items-center gap-2 text-center', onPick && 'cursor-pointer')}
                title={s.gate ? GATE_LABELS[s.gate] : undefined}
              >
                <span
                  className={clsx(
                    'relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition',
                    done && 'border-transparent text-night',
                    active && 'border-transparent text-night shadow-glow',
                    !done && !active && 'border-line bg-deep text-mist group-hover:border-mist',
                  )}
                  style={done || active ? { background: s.color } : undefined}
                >
                  {done ? <Check size={16} strokeWidth={3} /> : num(i + 1)}
                  {active && <span className="absolute inset-0 animate-ping rounded-full opacity-30" style={{ background: s.color }} />}
                </span>
                <span className={clsx('text-xs leading-5', active ? 'font-semibold text-ink' : done ? 'text-frost' : 'text-mist')}>{s.label}</span>
                <span className="flex items-center gap-1 text-[10px] text-mist">
                  {s.gate && !done && <Lock size={10} />}
                  {days !== null ? (
                    <span className={clsx(late && 'font-semibold text-rose')}>{num(days, 1)} روز{s.slaDays ? ` / ${num(s.slaDays)}` : ''}</span>
                  ) : s.slaDays ? <span>SLA {num(s.slaDays)} روز</span> : null}
                  {late && <AlertTriangle size={10} className="text-rose" />}
                </span>
              </button>
              {i < stages.length - 1 && (
                <span className={clsx('mt-[18px] h-0.5 w-6 rounded-full', i < index || closed ? 'bg-iris/70' : 'bg-line')} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface TimelineItem { id: string; at: number; title: ReactNode; body?: ReactNode; color?: string; icon?: ReactNode; meta?: ReactNode }

export function Timeline({ items, empty = 'رویدادی ثبت نشده' }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-mist">{empty}</p>;
  return (
    <ol className="relative space-y-4 pr-5 before:absolute before:bottom-2 before:right-[7px] before:top-2 before:w-px before:bg-line">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span
            className="absolute -right-5 top-1 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-night"
            style={{ background: it.color ?? '#5C6B73' }}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <div className="text-sm font-medium text-ink">{typeof it.title === 'string' ? isolateCodes(it.title) : it.title}</div>
            <time className="text-[11px] text-mist" title={dateTime(it.at)}>{relative(it.at)}</time>
          </div>
          {it.body && <div className="mt-1 text-sm leading-6 text-frost/90">{typeof it.body === 'string' ? isolateCodes(it.body) : it.body}</div>}
          {it.meta && <div className="mt-1 text-xs text-mist">{it.meta}</div>}
        </li>
      ))}
    </ol>
  );
}
