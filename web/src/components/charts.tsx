import { useState } from 'react';
import clsx from 'clsx';
import { compactMoney, money, num } from '../lib/format';

/**
 * Charts follow the dataviz rules: one axis, thin marks with rounded data-ends
 * on the baseline, recessive grid, legend + hover tooltip, text in ink tokens.
 * Series colours (#6690E3 / #BE7C38) were validated against the dark surface.
 */
export const SERIES = ['#6690E3', '#BE7C38'] as const;

interface Series { key: string; label: string; color: string }

export function GroupedBars({
  data, series, height = 220, format = compactMoney,
}: { data: Record<string, any>[]; series: Series[]; height?: number; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, padTop = 12, padBottom = 28, padLeft = 64;
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] as number)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotH = H - padTop - padBottom;
  const group = (W - padLeft - 8) / data.length;
  const bar = Math.min(22, (group - 18) / series.length - 2);
  const y = (v: number) => padTop + plotH - (v / top) * plotH;

  return (
    <div className="relative">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={series.map((s) => s.label).join(' و ')}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={padLeft} x2={W} y1={y(v)} y2={y(v)} stroke="#E0FBFC" strokeOpacity={v === 0 ? 0.25 : 0.06} />
            <text x={padLeft - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9DB4C0" className="num">{format(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = padLeft + i * group + (group - (bar + 2) * series.length) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padLeft + i * group} y={padTop} width={group} height={plotH} fill="#E0FBFC" fillOpacity={hover === i ? 0.04 : 0} />
              {series.map((s, si) => {
                const v = d[s.key] as number;
                const h = Math.max(0, (v / top) * plotH);
                return <path key={s.key} d={roundedTop(gx + si * (bar + 2), y(v), bar, h)} fill={s.color} />;
              })}
              <text x={padLeft + i * group + group / 2} y={H - 8} textAnchor="middle" fontSize="11.5" fill="#9DB4C0">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="glass-strong pointer-events-none absolute z-10 min-w-[170px] px-3 py-2 text-xs"
          style={{ top: 36, left: `${Math.min(70, Math.max(2, ((padLeft + hover * group) / W) * 100 - 6))}%` }}
        >
          <div className="mb-1 font-semibold text-ink">{data[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4 text-frost">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
              <span className="num">{money(data[hover][s.key])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function niceStep(raw: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-frost">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars — funnels and ranked lists. Identity colour sits on the mark, text stays ink. */
export function BarList({
  rows, format = num, onClick,
}: { rows: { key: string; label: string; value: number; color?: string; hint?: string }[]; format?: (v: number) => string; onClick?: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            disabled={!onClick}
            onClick={() => onClick?.(r.key)}
            className={clsx('group w-full text-right', onClick && 'cursor-pointer')}
            title={`${r.label}: ${format(r.value)}`}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-frost group-hover:text-ink">{r.label}</span>
              <span className="num shrink-0 text-ink">{format(r.value)}{r.hint && <span className="mr-1.5 text-mist">{r.hint}</span>}</span>
            </div>
            <div className="h-2 rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%`, background: r.color ?? SERIES[0] }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Part-to-whole strip with 2px surface gaps and a labelled legend (no colour-only identity). */
export function StackStrip({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {visible.map((p) => (
          <div key={p.key} title={`${p.label}: ${num(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {visible.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-2 text-frost">
            <span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} /><span className="truncate">{p.label}</span></span>
            <span className="num text-ink">{num(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lead-score meter: the score number in ink, the bar coloured by temperature. */
export function ScoreMeter({ score, hot = 70, warm = 40, compact }: { score: number; hot?: number; warm?: number; compact?: boolean }) {
  const tier = score >= hot ? 'hot' : score >= warm ? 'warm' : 'cold';
  const color = tier === 'hot' ? '#FF499E' : tier === 'warm' ? '#F5B85A' : '#9DB4C0';
  const label = tier === 'hot' ? 'داغ' : tier === 'warm' ? 'گرم' : 'سرد';
  return (
    <div className={clsx(compact ? 'w-20' : 'w-28')}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="num font-bold text-ink">{num(score)}</span>
        {!compact && <span style={{ color }}>{label}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-ink/[0.08]">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}
