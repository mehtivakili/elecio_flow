import { useState, type ReactNode } from 'react';
import { Check, Lock, AlertTriangle, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { StageDef } from '@shared/defaults';
import { dateTime, isolateCodes, num, relative } from '../lib/format';
import { useIsMobile } from '../lib/media';

const GATE_LABELS: Record<string, string> = {
  deposit: 'نیازمند پیش‌پرداخت',
  full_payment: 'نیازمند تسویه کامل',
  allocation: 'نیازمند تخصیص کالا',
  shipment: 'نیازمند ثبت محموله',
  kitting: 'نیازمند موجودی قطعات',
  qc_pass: 'نیازمند تأیید QC',
};

/**
 * Stage tracker used by orders and work orders. Each step shows how long it took
 * (from the stage log), its SLA and the gate guarding its exit. Desktop gets the
 * horizontal stepper; phones get a compact summary with a segmented bar and an
 * expandable vertical list — no sideways scrolling.
 */
export function StageTrack({
  stages, current, history = [], closed, onPick,
}: {
  stages: StageDef[]; current: string; history?: { stage: string; enteredAt: number; leftAt?: number | null }[];
  closed?: boolean; onPick?: (key: string) => void;
}) {
  const mobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const index = stages.findIndex((s) => s.key === current);
  const steps = stages.map((s, i) => {
    const done = !!closed || i < index;
    const active = !closed && i === index;
    const log = [...history].reverse().find((h) => h.stage === s.key);
    const days = log ? ((log.leftAt ?? Date.now()) - log.enteredAt) / 86_400_000 : null;
    const late = !!(active && s.slaDays && days !== null && days > s.slaDays);
    return { s, i, done, active, days, late };
  });
  const timing = (st: (typeof steps)[number]) => (st.days !== null
    ? <span className={clsx(st.late && 'font-semibold text-rose')}>{num(st.days, 1)} روز{st.s.slaDays ? ` / ${num(st.s.slaDays)}` : ''}</span>
    : st.s.slaDays ? <span>SLA {num(st.s.slaDays)} روز</span> : null);

  if (mobile) {
    const now = steps[Math.max(0, index)];
    return (
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-mist">{closed ? 'تکمیل شده' : `مرحله ${num(index + 1)} از ${num(stages.length)}`}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[15px] font-bold text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: now?.s.color }} />
              <span className="truncate">{closed ? stages[stages.length - 1]?.label : now?.s.label}</span>
              {now?.late && <AlertTriangle size={14} className="shrink-0 text-rose" />}
            </div>
          </div>
          {!closed && now && <div className="flex shrink-0 items-center gap-1 pt-4 text-[11px] text-mist">{now.s.gate && <Lock size={11} />}{timing(now)}</div>}
        </div>
        <div className="mt-2.5 flex gap-1" aria-hidden>
          {steps.map((st) => (
            <span key={st.s.key} className="h-1.5 flex-1 rounded-full" style={{ background: st.done || st.active ? st.s.color : 'rgba(224,251,252,.09)', opacity: st.active ? 1 : st.done ? 0.75 : 1 }} />
          ))}
        </div>
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-2 flex items-center gap-1 py-1 text-xs font-medium text-iris">
          {expanded ? 'بستن فهرست مراحل' : 'نمایش همه مراحل'}
          <ChevronDown size={14} className={clsx('transition', expanded && 'rotate-180')} />
        </button>
        {expanded && (
          <ol className="mt-1 space-y-0.5">
            {steps.map((st) => (
              <li key={st.s.key}>
                <button
                  type="button"
                  disabled={!onPick}
                  onClick={() => onPick?.(st.s.key)}
                  className={clsx('flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-right', st.active && 'bg-ink/[0.06]', onPick && 'active:bg-ink/[0.08]')}
                >
                  <span
                    className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold', st.done || st.active ? 'border-transparent text-night' : 'border-line text-mist')}
                    style={st.done || st.active ? { background: st.s.color } : undefined}
                  >{st.done ? <Check size={13} strokeWidth={3} /> : num(st.i + 1)}</span>
                  <span className={clsx('min-w-0 flex-1 truncate text-[13px]', st.active ? 'font-bold text-ink' : st.done ? 'text-frost' : 'text-mist')}>{st.s.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-mist">
                    {st.s.gate && !st.done && <Lock size={10} />}{timing(st)}{st.late && <AlertTriangle size={11} className="text-rose" />}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start">
        {steps.map(({ s, i, done, active, late, ...st }) => (
          <li key={s.key} className="flex items-start">
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
                {timing({ s, i, done, active, late, ...st })}
                {late && <AlertTriangle size={10} className="text-rose" />}
              </span>
            </button>
            {i < stages.length - 1 && (
              <span className={clsx('mt-[18px] h-0.5 w-6 rounded-full', i < index || closed ? 'bg-iris/70' : 'bg-line')} />
            )}
          </li>
        ))}
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
