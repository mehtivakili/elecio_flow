import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Phone, NotebookPen, ChevronDown, Cpu, PackageCheck, Clock, AlarmClock, LifeBuoy, MapPin, ArrowLeftRight, Wallet } from 'lucide-react';
import clsx from 'clsx';
import type { StageDef } from '@shared/defaults';
import { useSession } from '../lib/session';
import { useIsMobile } from '../lib/media';
import { Avatar } from './ui';
import { ScoreRing } from './charts';
import { NextActionTag } from './crm';
import { compactMoney, date, num, relative } from '../lib/format';

const placeOf = (c: any) => c.addresses?.[0]?.county || c.addresses?.[0]?.province || '';
const subtitleOf = (c: any) => [c.people?.find((p: any) => p.isPrimary)?.name || c.company, placeOf(c)].filter(Boolean).join(' · ');
const isCustomer = (c: any) => c.stage === 'customer' || c.devicesBought > 0 || c.ordersCount > 0;

/** Devices bought / devices they have now — shown on customer rows and cards. */
export function DeviceStats({ c, compact }: { c: any; compact?: boolean }) {
  if (!c.devicesBought && !c.devicesOwned) return compact ? null : <span className="text-[11px] text-mist">بدون دستگاه</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-lg bg-iris/10 px-2 py-0.5 text-[11px] text-iris" title="تعداد دستگاه‌هایی که خریده">
        <PackageCheck size={12} /><span className="num font-bold">{num(c.devicesBought)}</span>{!compact && ' خرید'}
      </span>
      <span className="inline-flex items-center gap-1 rounded-lg bg-mint/10 px-2 py-0.5 text-[11px] text-mint" title="دستگاه‌هایی که الان نزد مشتری است">
        <Cpu size={12} /><span className="num font-bold">{num(c.devicesOwned)}</span>{!compact && ' فعال'}
      </span>
    </span>
  );
}

function StageMove({ c, stages, onMove }: { c: any; stages: StageDef[]; onMove: (c: any, stage: string) => void }) {
  return (
    <label className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-mist transition hover:bg-ink/[0.07] hover:text-ink" title="انتقال به مرحله دیگر">
      <ArrowLeftRight size={15} />
      <select aria-label={`انتقال ${c.name}`} className="absolute inset-0 cursor-pointer opacity-0" value={c.stage} onChange={(e) => onMove(c, e.target.value)}>
        {stages.map((s) => <option key={s.key} value={s.key}>{s.key === c.stage ? `${s.label} (فعلی)` : `انتقال به ${s.label}`}</option>)}
      </select>
    </label>
  );
}

function CallButtons({ c, onReport }: { c: any; onReport: (c: any) => void }) {
  const phone = c.phones?.[0]?.value;
  return (
    <>
      {phone
        ? <a href={`tel:${phone}`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint/10 text-mint transition hover:bg-mint/25" title={`تماس ${phone}`} aria-label={`تماس با ${c.name}`}><Phone size={15} /></a>
        : <span className="flex h-8 w-8 items-center justify-center rounded-lg text-slate" title="شماره ثبت نشده"><Phone size={15} /></span>}
      <button type="button" onClick={() => onReport(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-iris/20 hover:text-iris" title="ثبت گزارش ارتباط" aria-label={`گزارش ${c.name}`}><NotebookPen size={15} /></button>
    </>
  );
}

/** Lead → score ring; customer → devices and tickets; lost → reason. */
function Insight({ c, stage }: { c: any; stage?: StageDef }) {
  const { settings } = useSession();
  if (c.stage === 'lost') return <span className="line-clamp-2 text-[11.5px] text-rose">{c.lostReason || 'دلیل ثبت نشده'}</span>;
  if (stage?.final || isCustomer(c)) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <DeviceStats c={c} />
        {c.openTickets > 0 && <span className="inline-flex items-center gap-1 rounded-lg bg-rose/10 px-2 py-0.5 text-[11px] text-rose"><LifeBuoy size={12} /><span className="num">{num(c.openTickets)}</span> تیکت</span>}
      </div>
    );
  }
  const tier = c.score >= settings.scoring.hotThreshold ? ['داغ', '#FF499E'] : c.score >= settings.scoring.warmThreshold ? ['گرم', '#F5B85A'] : ['سرد', '#9DB4C0'];
  return (
    <div className="flex items-center gap-2.5">
      <ScoreRing score={c.score} hot={settings.scoring.hotThreshold} warm={settings.scoring.warmThreshold} size={34} />
      <div className="min-w-0 text-[11px] leading-5">
        <div className="font-semibold" style={{ color: tier[1] }}>سرنخ {tier[0]}</div>
        {c.attrs?.machines ? <div className="text-mist"><span className="num">{num(c.attrs.machines)}</span> ماشین CNC</div> : <div className="text-mist">امتیاز {num(c.score)} از ۱۰۰</div>}
      </div>
    </div>
  );
}

function Money({ c, currency }: { c: any; currency: string }) {
  if (isCustomer(c) && c.revenue) {
    return (
      <div className="text-[11px] leading-5">
        <div className="num text-[13px] font-bold text-ink">{compactMoney(c.revenue)} <span className="text-[10px] font-normal text-mist">{currency}</span></div>
        <div className="text-mist">{num(c.ordersCount)} خرید{c.lastOrderAt ? ` · آخرین ${date(c.lastOrderAt)}` : ''}</div>
        {c.balance > 0 && <div className="flex items-center gap-1 text-amber"><Wallet size={11} />مانده {compactMoney(c.balance)}</div>}
      </div>
    );
  }
  const v = c.openOrderValue || c.estimatedValue || 0;
  if (!v) return <span className="text-[11px] text-mist">—</span>;
  return (
    <div className="text-[11px] leading-5">
      <div className="num text-[13px] font-bold text-ink">{compactMoney(v)} <span className="text-[10px] font-normal text-mist">{currency}</span></div>
      <div className="text-mist">{c.openOrderValue ? 'پیش‌فاکتور / سفارش باز' : 'ارزش تخمینی'}</div>
    </div>
  );
}

function Activity({ c }: { c: any }) {
  const followUp = c.nextFollowUpAt;
  const overdue = followUp && followUp < Date.now();
  return (
    <div className="min-w-0 space-y-1 text-[11px]">
      <div className="flex items-center gap-1 text-mist"><Clock size={11} />{c.lastContactAt ? `آخرین ارتباط ${relative(c.lastContactAt)}` : 'هنوز تماسی ثبت نشده'}</div>
      {followUp
        ? <div className={clsx('flex items-center gap-1', overdue ? 'font-semibold text-rose' : 'text-frost')}><AlarmClock size={11} />پیگیری {overdue ? `عقب‌افتاده (${date(followUp)})` : date(followUp)}</div>
        : c.nextAction && <NextActionTag action={c.nextAction} />}
    </div>
  );
}

const COLS = 'grid-cols-[minmax(210px,2fr)_minmax(170px,1.3fr)_minmax(120px,0.9fr)_minmax(170px,1.3fr)_minmax(110px,0.8fr)_104px]';

/**
 * The pipeline as a list: one section per stage (colour, count, value), and per contact
 * what matters at that stage — the lead score for leads; devices bought / in use,
 * purchases, balance and open tickets for customers — plus last contact, follow-up and owner.
 */
export function PipelineList({ contacts, onMove, onReport }: { contacts: any[]; onMove: (c: any, stage: string) => void; onReport: (c: any) => void }) {
  const { settings, userName } = useSession();
  const mobile = useIsMobile();
  const [only, setOnly] = useState<string | null>(null);
  const [closed, setClosed] = useState<string[]>([]);
  const cur = settings.company.currency;
  const groups = useMemo(() => settings.lifecycleStages.map((s) => {
    const rows = contacts.filter((c) => c.stage === s.key)
      .sort((a, b) => (s.final ? (b.revenue || 0) - (a.revenue || 0) || (b.devicesBought || 0) - (a.devicesBought || 0) : b.score - a.score));
    const value = rows.reduce((sum, c) => sum + (s.final ? c.revenue || 0 : c.openOrderValue || c.estimatedValue || 0), 0);
    const devices = rows.reduce((sum, c) => sum + (c.devicesBought || 0), 0);
    return { stage: s, rows, value, devices };
  }), [contacts, settings.lifecycleStages]);
  const shown = groups.filter((g) => g.rows.length && (!only || g.stage.key === only));

  return (
    <div className="space-y-4">
      {/* Stage summary — also a filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button type="button" onClick={() => setOnly(null)}
          className={clsx('shrink-0 rounded-xl border px-3 py-2 text-right transition', !only ? 'border-iris/60 bg-iris/10' : 'border-line/60 bg-deep/40 hover:border-line')}>
          <div className="text-[11px] text-mist">همه</div>
          <div className="num text-base font-bold text-ink">{num(contacts.length)}</div>
        </button>
        {groups.map(({ stage, rows, value }) => (
          <button key={stage.key} type="button" disabled={!rows.length} onClick={() => setOnly(only === stage.key ? null : stage.key)}
            className={clsx('min-w-[108px] shrink-0 rounded-xl border px-3 py-2 text-right transition disabled:opacity-40',
              only === stage.key ? 'bg-ink/[0.06]' : 'border-line/60 bg-deep/40 hover:border-line')}
            style={only === stage.key ? { borderColor: `${stage.color}aa` } : undefined}>
            <div className="flex items-center gap-1.5 text-[11px] text-mist"><span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />{stage.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="num text-base font-bold text-ink">{num(rows.length)}</span>
              {value > 0 && <span className="num text-[10.5px] text-mist">{compactMoney(value)}</span>}
            </div>
          </button>
        ))}
      </div>

      {shown.length === 0 && <div className="glass py-14 text-center text-sm text-mist">موردی با این فیلتر پیدا نشد</div>}

      {shown.map(({ stage, rows, value, devices }) => {
        const open = !closed.includes(stage.key);
        return (
          <section key={stage.key} className="glass overflow-hidden">
            <button type="button" onClick={() => setClosed(open ? [...closed, stage.key] : closed.filter((k) => k !== stage.key))}
              className="flex w-full items-center gap-3 px-4 py-3 text-right transition hover:bg-ink/[0.03]" style={{ boxShadow: `inset -4px 0 0 ${stage.color}` }}>
              <span className="text-[15px] font-bold text-ink">{stage.label}</span>
              <span className="num rounded-full px-2 py-0.5 text-[11px] font-bold text-night" style={{ background: stage.color }}>{num(rows.length)}</span>
              <span className="flex-1" />
              {stage.final && devices > 0 && <span className="hidden items-center gap-1 text-xs text-mist sm:flex"><PackageCheck size={13} /><span className="num">{num(devices)}</span> دستگاه فروخته‌شده</span>}
              {value > 0 && <span className="num text-xs text-mist">{compactMoney(value)} {cur}</span>}
              <ChevronDown size={16} className={clsx('text-mist transition', !open && '-rotate-90')} />
            </button>

            {open && !mobile && (
              <>
                <div className={clsx('grid gap-4 border-y border-line/50 bg-deep/40 px-4 py-2 text-[11px] text-mist', COLS)}>
                  <span>مشتری / مخاطب</span>
                  <span>{stage.final ? 'دستگاه‌ها و خدمات' : stage.key === 'lost' ? 'دلیل' : 'امتیاز سرنخ'}</span>
                  <span>{stage.final ? 'خرید و حساب' : 'ارزش'}</span>
                  <span>ارتباط و پیگیری</span>
                  <span>کارشناس</span>
                  <span />
                </div>
                <div className="divide-y divide-line/40">
                  {rows.map((c) => (
                    <div key={c.id} className={clsx('group grid items-center gap-4 px-4 py-2.5 transition hover:bg-ink/[0.03]', COLS)}>
                      <Link to={`/crm/contacts/${c.id}`} className="flex min-w-0 items-center gap-3">
                        <Avatar name={c.name} size={36} color={stage.color} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 truncate text-[13.5px] font-semibold text-ink group-hover:text-iris">
                            {!!c.starred && <Star size={12} className="shrink-0 fill-amber text-amber" />}<span className="truncate">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-1 truncate text-[11px] text-mist">{placeOf(c) && <MapPin size={10} className="shrink-0" />}<span className="truncate">{subtitleOf(c) || '—'}</span></div>
                        </div>
                      </Link>
                      <Insight c={c} stage={stage} />
                      <Money c={c} currency={cur} />
                      <Activity c={c} />
                      <div className="flex min-w-0 items-center gap-2 text-xs text-frost">
                        {c.ownerId ? <><Avatar name={userName(c.ownerId)} size={22} /><span className="truncate">{userName(c.ownerId)}</span></> : <span className="text-mist">—</span>}
                      </div>
                      <div className="flex items-center justify-end gap-0.5">
                        <CallButtons c={c} onReport={onReport} />
                        <StageMove c={c} stages={settings.lifecycleStages} onMove={onMove} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {open && mobile && (
              <div className="space-y-2 border-t border-line/50 p-2.5">
                {rows.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-line/50 bg-deep/40 p-3">
                    <div className="flex items-center gap-2.5">
                      <Link to={`/crm/contacts/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                        <Avatar name={c.name} size={38} color={stage.color} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 text-[14px] font-bold text-ink">{!!c.starred && <Star size={12} className="shrink-0 fill-amber text-amber" />}<span className="truncate">{c.name}</span></div>
                          <div className="truncate text-[11px] text-mist">{subtitleOf(c) || '—'}</div>
                        </div>
                      </Link>
                      <div className="flex shrink-0 items-center"><CallButtons c={c} onReport={onReport} /><StageMove c={c} stages={settings.lifecycleStages} onMove={onMove} /></div>
                    </div>
                    <div className="mt-2.5 flex items-start justify-between gap-3 border-t border-line/40 pt-2.5">
                      <Insight c={c} stage={stage} />
                      <div className="shrink-0 text-left"><Money c={c} currency={cur} /></div>
                    </div>
                    <div className="mt-2"><Activity c={c} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
