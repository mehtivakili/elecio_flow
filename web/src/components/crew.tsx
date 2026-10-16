import { useEffect, useRef, useState } from 'react';
import { Users, Pencil, Check, UserCheck, UserCog, Plus, X, Lock, AlertTriangle, Clock } from 'lucide-react';
import clsx from 'clsx';
import type { StageDef } from '@shared/defaults';
import { put } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Field, Modal } from './ui';
import { ChipSelect } from './inputs';
import { GATE_LABELS } from './flow';
import { dateTime, initials, num } from '../lib/format';

export interface CrewRow { stage: string; userId: string; role: 'assigned' | 'performed'; addedAt: number; addedBy?: string | null }
type Role = CrewRow['role'];

export const crewOf = (crew: CrewRow[], stage: string, role: Role) =>
  [...new Set(crew.filter((c) => c.stage === stage && c.role === role).map((c) => c.userId))];

/** Pick several team members (active users). */
export function PeoplePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { users, me } = useSession();
  const options = users.filter((u) => u.active !== 0 || value.includes(u.id))
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.fullName.localeCompare(b.fullName, 'fa')))
    .map((u) => ({ value: u.id, label: u.id === me.id ? `${u.fullName} (من)` : u.fullName }));
  return <ChipSelect options={options} value={value} onChange={onChange} />;
}

const TONES = {
  iris: { chip: 'bg-iris/10 text-iris', dot: 'bg-iris' },
  mint: { chip: 'bg-mint/10 text-mint', dot: 'bg-mint' },
};

/**
 * Avatars + names of a list of users. With `onChange`, each chip gets a remove (×) button
 * and a «+» button opens the team list to add someone — saved immediately.
 */
export function PeopleChips({ ids, empty = '—', tone = 'iris', onChange, busy }: {
  ids: string[]; empty?: string; tone?: keyof typeof TONES; onChange?: (ids: string[]) => void; busy?: boolean;
}) {
  const { userName, users, me } = useSession();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const others = users.filter((u) => u.active !== 0 && !ids.includes(u.id))
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.fullName.localeCompare(b.fullName, 'fa')));
  const t = TONES[tone];

  return (
    <span ref={box} className={clsx('relative flex flex-wrap items-center gap-1.5', busy && 'opacity-60')}>
      {!ids.length && !onChange && <span className="text-xs text-mist">{empty}</span>}
      {ids.map((id) => (
        <span key={id} className={clsx('inline-flex items-center gap-1.5 rounded-full py-0.5 ps-0.5 text-[11.5px]', onChange ? 'pe-1' : 'pe-2.5', t.chip)}>
          <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-night', t.dot)}>{initials(userName(id))}</span>
          <span className="text-frost">{userName(id)}</span>
          {onChange && (
            <button type="button" disabled={busy} aria-label={`حذف ${userName(id)}`} onClick={() => onChange(ids.filter((x) => x !== id))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-mist transition hover:bg-rose/20 hover:text-rose">
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      {onChange && (
        <button type="button" disabled={busy || !others.length} onClick={() => setOpen((o) => !o)} aria-label="افزودن نفر" title="افزودن نفر"
          className={clsx('flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-[11px] transition disabled:opacity-40',
            open ? 'border-iris bg-iris/15 text-iris' : 'border-line text-mist hover:border-iris/60 hover:text-iris')}>
          <Plus size={13} />{!ids.length && <span>افزودن</span>}
        </button>
      )}
      {open && (
        <span className="absolute right-0 top-full z-30 mt-1.5 block max-h-64 w-56 overflow-y-auto rounded-xl border border-line bg-[#24323a] p-1 shadow-2xl">
          {others.map((u) => (
            <button key={u.id} type="button" onClick={() => { onChange?.([...ids, u.id]); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-[13px] text-frost hover:bg-iris/15">
              <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-night', t.dot)}>{initials(u.fullName)}</span>
              <span className="truncate">{u.fullName}{u.id === me.id && <span className="text-mist"> (من)</span>}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * The production route of one work order — one list for everything: step number, status,
 * time spent vs. SLA, gate, and the people of each stage (responsible / did it). The stage
 * in progress can be staffed directly with «+» and «×»; other stages through the pencil.
 */
export function StageCrewCard({ woId, stages, current, closed, crew, history, editable }: {
  woId: string; stages: StageDef[]; current: string; closed: boolean; crew: CrewRow[];
  history: { stage: string; enteredAt: number; leftAt?: number | null; userId?: string | null }[]; editable: boolean;
}) {
  const { userName } = useSession();
  const [editing, setEditing] = useState<StageDef | null>(null);
  const index = stages.findIndex((s) => s.key === current);
  const quick = useAction((body: { stage: string; assigned?: string[]; performed?: string[] }) => put(`/work-orders/${woId}/crew`, body));
  const doneCount = closed ? stages.length : Math.max(0, index);

  return (
    <Card title="مسیر تولید و افراد هر مرحله" icon={Users}
      subtitle={closed ? 'همه مراحل انجام شده' : `مرحله ${num(index + 1)} از ${num(stages.length)} · کار را هر کسی شروع کند، دیگران می‌توانند مرحله بعد را به عهده بگیرند`}
      actions={<div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-line sm:block"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${(doneCount / stages.length) * 100}%` }} /></div>}>
      <ol className="relative">
        {stages.map((stage, at) => {
          const state = closed || at < index ? 'done' : at === index ? 'current' : 'next';
          const visits = history.filter((h) => h.stage === stage.key);
          const first = visits[0];
          const last = visits.at(-1);
          const days = last ? ((last.leftAt ?? Date.now()) - last.enteredAt) / 86_400_000 : null;
          const late = state === 'current' && !!stage.slaDays && days !== null && days > stage.slaDays;
          const assigned = crewOf(crew, stage.key, 'assigned');
          const performed = crewOf(crew, stage.key, 'performed');
          const live = state === 'current' && editable && !closed;
          const pending = quick.isPending && quick.variables?.stage === stage.key;

          return (
            <li key={stage.key} className="relative flex gap-3 pb-3 last:pb-0">
              {at < stages.length - 1 && <span className={clsx('absolute right-[15px] top-8 h-[calc(100%-26px)] w-0.5 rounded-full', state === 'done' ? 'bg-mint/40' : 'bg-line')} />}
              <span
                className={clsx('relative z-[1] mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                  state === 'next' ? 'border-line bg-deep text-mist' : 'border-transparent text-night')}
                style={state !== 'next' ? { background: stage.color } : undefined}
              >
                {state === 'done' ? <Check size={15} strokeWidth={3} /> : num(at + 1)}
                {state === 'current' && <span className="absolute inset-0 animate-ping rounded-full opacity-25" style={{ background: stage.color }} />}
              </span>

              <div className={clsx('min-w-0 flex-1 rounded-2xl border px-3 py-2.5',
                state === 'current' ? 'border-amber/45 bg-amber/[0.05]' : state === 'done' ? 'border-line/60 bg-deep/30' : 'border-line/40 bg-deep/20')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={clsx('text-sm font-bold', state === 'next' ? 'text-frost' : 'text-ink')}>{stage.label}</span>
                      {state === 'current' && <span className="rounded-full bg-amber/15 px-2 py-px text-[10.5px] font-semibold text-amber">در حال انجام</span>}
                      {stage.gate && state !== 'done' && <span className="flex items-center gap-1 text-[10.5px] text-mist" title={GATE_LABELS[stage.gate]}><Lock size={10} />{GATE_LABELS[stage.gate]}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-mist">
                      {days !== null && (
                        <span className={clsx('flex items-center gap-1', late && 'font-semibold text-rose')}>
                          {late ? <AlertTriangle size={11} /> : <Clock size={11} />}
                          {num(days, 1)} روز{stage.slaDays ? ` از ${num(stage.slaDays)} روز مجاز` : ''}
                        </span>
                      )}
                      {days === null && !!stage.slaDays && <span>زمان مجاز {num(stage.slaDays)} روز</span>}
                      {first && <span>شروع {dateTime(first.enteredAt)}{first.userId ? ` · ${userName(first.userId)}` : ''}</span>}
                      {state === 'done' && last?.leftAt && <span>پایان {dateTime(last.leftAt)}</span>}
                    </div>
                  </div>
                  {editable && !stage.final && !live && <Button size="sm" variant="ghost" icon={Pencil} aria-label={`افراد مرحله ${stage.label}`} onClick={() => setEditing(stage)} />}
                </div>

                {!stage.final && (
                  <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-[11px] text-mist"><UserCog size={12} />مسئول</div>
                      <PeopleChips ids={assigned} empty={state === 'next' ? 'تعیین نشده' : '—'} busy={pending}
                        onChange={live ? (v) => quick.mutate({ stage: stage.key, assigned: v }) : undefined} />
                    </div>
                    {state !== 'next' && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-[11px] text-mist"><UserCheck size={12} />انجام‌دهندگان</div>
                        <PeopleChips ids={performed} tone="mint" empty="—" busy={pending}
                          onChange={live ? (v) => quick.mutate({ stage: stage.key, performed: v }) : undefined} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <CrewModal woId={woId} stage={editing} crew={crew} onClose={() => setEditing(null)}
        showPerformed={!!editing && (closed || stages.findIndex((s) => s.key === editing.key) <= index)} />
    </Card>
  );
}

function CrewModal({ woId, stage, crew, onClose, showPerformed }: { woId: string; stage: StageDef | null; crew: CrewRow[]; onClose: () => void; showPerformed: boolean }) {
  const [assigned, setAssigned] = useState<string[]>([]);
  const [performed, setPerformed] = useState<string[]>([]);
  useEffect(() => {
    if (!stage) return;
    setAssigned(crewOf(crew, stage.key, 'assigned'));
    setPerformed(crewOf(crew, stage.key, 'performed'));
  }, [stage, crew]);
  const save = useAction(() => put(`/work-orders/${woId}/crew`, { stage: stage!.key, assigned, ...(showPerformed ? { performed } : {}) }), {
    success: 'افراد مرحله ذخیره شد', onSuccess: onClose,
  });
  return (
    <Modal open={!!stage} onClose={onClose} icon={Users} size="sm" title={`افراد مرحله «${stage?.label ?? ''}»`}
      subtitle="چند نفر را می‌توانید انتخاب کنید؛ تغییرها در تاریخچه دستور تولید ثبت می‌شوند"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</Button></>}>
      <div className="space-y-5">
        <Field label="مسئولان این مرحله"><PeoplePicker value={assigned} onChange={setAssigned} /></Field>
        {showPerformed && <Field label="انجام‌دهندگان (چه کسانی این مرحله را انجام دادند)"><PeoplePicker value={performed} onChange={setPerformed} /></Field>}
      </div>
    </Modal>
  );
}
