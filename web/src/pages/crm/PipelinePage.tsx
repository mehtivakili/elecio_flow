import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Star, Phone, PhoneCall, UserPlus, LayoutGrid, List, NotebookPen } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Avatar, Filters, IconToggle, PageHeader, SearchBox, Select, Spinner, useConfirm } from '../../components/ui';
import { StagePager } from '../../components/StagePager';
import { useIsMobile } from '../../lib/media';
import { ContactFormModal, LogTouchModal, NextActionTag } from '../../components/crm';
import { ScoreMeter, ScoreRing } from '../../components/charts';
import { compactMoney, num, relative } from '../../lib/format';
import { matchesSearch } from '@shared/search';

export default function PipelinePage() {
  const { settings, users, userName } = useSession();
  const mobile = useIsMobile();
  const confirm = useConfirm();
  const { data = [], isLoading } = useApi<any[]>('/pipeline');
  const [owner, setOwner] = useState('');
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [touch, setTouch] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'board' | 'list'>(() => {
    try { return localStorage.getItem('pipeline_view') === 'list' ? 'list' : 'board'; } catch { return 'board'; }
  });
  useEffect(() => { try { localStorage.setItem('pipeline_view', view); } catch { /* ignore */ } }, [view]);
  const move = useAction((body: { id: string; stage: string; lostReason?: string }) => post(`/contacts/${body.id}/stage`, body), { success: 'مرحله به‌روز شد' });

  const contacts = useMemo(() => data.filter((c) =>
    (!owner || c.ownerId === owner) && matchesSearch(`${c.name} ${c.company}`, search)), [data, owner, search]);

  // While searching, the stage bar keeps only the stages that contain a match
  // (one match → the pager lands straight on that stage).
  const pagerStages = useMemo(() => settings.lifecycleStages
    .map((s) => ({ key: s.key, label: s.label, color: s.color, count: contacts.filter((c) => c.stage === s.key).length }))
    .filter((s) => !search.trim() || s.count > 0), [settings.lifecycleStages, contacts, search]);

  const moveContact = async (c: any, stage: string) => {
    if (!c || c.stage === stage) return;
    if (stage === 'lost') {
      const reason = await confirm({ title: `از دست رفتن «${c.name}»`, danger: true, confirm: 'ثبت', body: `دلایل رایج: ${settings.lostReasons.join('، ')}`, input: { label: 'دلیل', required: true } });
      if (reason) move.mutate({ id: c.id, stage, lostReason: reason });
      return;
    }
    move.mutate({ id: c.id, stage });
  };

  const drop = async (stage: string) => {
    const c = data.find((x) => x.id === dragId);
    setDragId(null); setOver(null);
    await moveContact(c, stage);
  };

  if (isLoading) return <Spinner />;
  return (
    <div>
      <PageHeader
        icon={GitBranch}
        title="قیف فروش"
        aside={<IconToggle value={view} onChange={setView} options={[{ key: 'board', label: 'نمای کارت', icon: LayoutGrid }, { key: 'list', label: 'نمای لیست', icon: List }]} />}
        actions={<div className="hidden md:contents">
          <SearchBox value={search} onChange={setSearch} className="w-56" />
          <Select className="w-44" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">همه کارشناسان</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </Select>
        </div>}
        fab={{ label: 'سرنخ جدید', icon: UserPlus, onClick: () => setCreating(true) }}
      />
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <SearchBox value={search} onChange={setSearch} className="min-w-0 flex-1" placeholder="نام یا شرکت…" />
        <Filters count={owner ? 1 : 0} onReset={() => setOwner('')}>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">همه کارشناسان</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </Select>
        </Filters>
      </div>
      {view === 'list' ? (
        <div className="glass overflow-hidden">
          <div className="hidden grid-cols-[minmax(180px,1.5fr)_minmax(130px,1fr)_88px_minmax(150px,1.2fr)_110px_36px] gap-3 border-b border-line/70 bg-deep/50 px-4 py-2.5 text-xs text-mist md:grid">
            <span>مشتری</span><span>مرحله</span><span>امتیاز</span><span>اقدام بعدی</span><span>کارشناس</span><span />
          </div>
          <div className="divide-y divide-line/60">
            {contacts.slice().sort((a, b) => b.score - a.score).map((c) => {
              const stage = settings.lifecycleStages.find((s) => s.key === c.stage);
              return (
                <div key={c.id} className="relative grid gap-2 px-3 py-3 transition hover:bg-ink/[0.035] md:grid-cols-[minmax(180px,1.5fr)_minmax(130px,1fr)_88px_minmax(150px,1.2fr)_110px_36px] md:items-center md:gap-3 md:px-4 md:py-2">
                  <Link to={`/crm/contacts/${c.id}`} className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink hover:text-iris">
                      {!!c.starred && <Star size={12} className="shrink-0 fill-amber text-amber" />}{c.name}
                    </div>
                    <div className="truncate text-[11px] text-mist">{c.company || c.addresses?.[0]?.county || '—'} · {c.lastContactAt ? relative(c.lastContactAt) : 'بدون تماس'}</div>
                  </Link>
                  <Select
                    aria-label={`مرحله ${c.name}`}
                    className="h-8 py-0 text-xs"
                    value={c.stage}
                    onChange={(e) => moveContact(c, e.target.value)}
                    style={{ borderColor: `${stage?.color ?? '#779BE7'}66` }}
                  >
                    {settings.lifecycleStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </Select>
                  <div className="hidden md:block"><ScoreMeter score={c.score} hot={settings.scoring.hotThreshold} warm={settings.scoring.warmThreshold} /></div>
                  <div className="min-w-0">{c.nextAction ? <NextActionTag action={c.nextAction} /> : <span className="text-xs text-mist">بدون اقدام</span>}</div>
                  <div className="hidden truncate text-xs text-mist md:block">{userName(c.ownerId)}</div>
                  <button onClick={() => setTouch(c)} className="absolute left-5 mt-0.5 rounded-lg p-1.5 text-mist hover:bg-iris/20 hover:text-iris md:static" title="ثبت ارتباط"><PhoneCall size={15} /></button>
                </div>
              );
            })}
            {contacts.length === 0 && <div className="py-14 text-center text-sm text-mist">موردی با این فیلتر پیدا نشد</div>}
          </div>
        </div>
      ) : mobile ? (pagerStages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line/70 py-14 text-center text-sm text-mist">موردی با این جستجو پیدا نشد</div>
      ) : (
        <StagePager
          stages={pagerStages}
          renderPage={(key) => {
            const stage = settings.lifecycleStages.find((s) => s.key === key)!;
            const cards = contacts.filter((c) => c.stage === key);
            const value = cards.reduce((sum, c) => sum + (c.openOrderValue || c.estimatedValue || 0), 0);
            const share = contacts.length ? Math.round((cards.length / contacts.length) * 100) : 0;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1 text-[11.5px] text-mist">
                  <span><b className="num text-ink">{num(cards.length)}</b> مورد · <b className="num text-ink">{num(share)}٪</b> از کل قیف</span>
                  <span className="num">{compactMoney(value)} {settings.company.currency}</span>
                </div>
                {cards.map((c) => {
                  const phone = c.phones?.[0]?.value;
                  return (
                    <div key={c.id} className="list-card accented" style={{ boxShadow: `inset -3px 0 0 ${stage.color}` }}>
                      <div className="flex items-center gap-3">
                        <div className="shrink-0">
                          {stage.final
                            ? <Avatar name={c.name} size={44} color={stage.color} />
                            : <ScoreRing score={c.score} hot={settings.scoring.hotThreshold} warm={settings.scoring.warmThreshold} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link to={`/crm/contacts/${c.id}`} className="block">
                            <div className="flex items-center gap-1 text-[14.5px] font-bold text-ink">
                              {!!c.starred && <Star size={12} className="shrink-0 fill-amber text-amber" />}<span className="truncate">{c.name}</span>
                            </div>
                            <div className="truncate text-[11.5px] text-mist">
                              {[c.addresses?.[0]?.county, c.attrs?.machines ? `${num(c.attrs.machines)} ماشین` : null, c.lastContactAt ? relative(c.lastContactAt) : 'بدون تماس'].filter(Boolean).join(' · ')}
                            </div>
                            {c.nextAction && <div className="mt-1"><NextActionTag action={c.nextAction} /></div>}
                          </Link>
                          {c.stage === 'lost' && c.lostReason && <div className="mt-1.5 text-[11px] text-rose">دلیل: {c.lostReason}</div>}
                          <Select aria-label={`انتقال ${c.name}`} className="mt-2.5 !min-h-[34px] h-[34px] py-0 text-xs" value={c.stage} onChange={(e) => moveContact(c, e.target.value)}>
                            {settings.lifecycleStages.map((s) => <option key={s.key} value={s.key}>{s.key === c.stage ? 'انتقال به مرحله…' : s.label}</option>)}
                          </Select>
                        </div>
                        {/* Call on top (green), call report under it — big thumb targets on the left, centred */}
                        <div className="flex shrink-0 flex-col gap-2">
                          {phone
                            ? <a href={`tel:${phone}`} className="call-btn" aria-label={`تماس با ${c.name}`}><Phone size={19} strokeWidth={2.3} /><span>تماس</span></a>
                            : <span className="call-btn opacity-35" aria-disabled="true"><Phone size={19} strokeWidth={2.3} /><span>تماس</span></span>}
                          <button type="button" onClick={() => setTouch(c)} className="report-btn" aria-label={`ثبت گزارش تماس ${c.name}`}><NotebookPen size={18} strokeWidth={2.2} /><span>گزارش</span></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {cards.length === 0 && <div className="rounded-2xl border border-dashed border-line/70 py-12 text-center text-xs text-mist">موردی در این مرحله نیست</div>}
              </div>
            );
          }}
        />
      )) : <>
      <div
        className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-4 lg:-mx-6 lg:px-6 xl:grid xl:overflow-x-visible"
        style={{ gridTemplateColumns: `repeat(${settings.lifecycleStages.length}, minmax(0, 1fr))` }}
      >
        {settings.lifecycleStages.map((stage) => {
          const cards = contacts.filter((c) => c.stage === stage.key);
          const value = cards.reduce((s, c) => s + (c.openOrderValue || c.estimatedValue || 0), 0);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => { e.preventDefault(); setOver(stage.key); }}
              onDragLeave={() => setOver((o) => (o === stage.key ? null : o))}
              onDrop={() => drop(stage.key)}
              className={clsx('glass flex w-[232px] shrink-0 flex-col transition xl:w-auto xl:min-w-0', over === stage.key && 'border-iris/60 shadow-glow')}
            >
              <div className="flex items-center justify-between gap-1.5 border-b border-line/60 px-3 py-2.5" style={{ boxShadow: `inset 0 3px 0 ${stage.color}` }}>
                <div>
                  <div className="text-sm font-semibold text-ink">{stage.label}</div>
                  <div className="num text-[11px] text-mist">{compactMoney(value)} {settings.company.currency}</div>
                </div>
                <span className="num rounded-full px-2 py-0.5 text-xs font-bold text-night" style={{ background: stage.color }}>{num(cards.length)}</span>
              </div>
              <div className="flex max-h-[calc(100vh-250px)] min-h-[200px] flex-col gap-2 overflow-y-auto p-2.5">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={clsx('cursor-grab rounded-xl border border-white/[0.06] bg-deep/70 p-2.5 transition hover:border-iris/40 active:cursor-grabbing', dragId === c.id && 'opacity-40')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/crm/contacts/${c.id}`} className="min-w-0">
                        <div className="flex items-center gap-1 truncate text-sm font-medium text-ink hover:text-iris">
                          {!!c.starred && <Star size={12} className="shrink-0 fill-amber text-amber" />}{c.name}
                        </div>
                        <div className="truncate text-[11px] text-mist">{c.addresses?.[0]?.county ?? ''}{c.attrs?.machines ? ` · ${num(c.attrs.machines)} ماشین` : ''}</div>
                      </Link>
                      <button onClick={() => setTouch(c)} className="rounded-lg p-1 text-mist hover:bg-iris/20 hover:text-iris" title="ثبت ارتباط"><PhoneCall size={14} /></button>
                    </div>
                    {!stage.final && <div className="mt-2.5"><ScoreMeter score={c.score} hot={settings.scoring.hotThreshold} warm={settings.scoring.warmThreshold} /></div>}
                    {c.nextAction && <div className="mt-2"><NextActionTag action={c.nextAction} /></div>}
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-mist">
                      <span>{userName(c.ownerId)}</span>
                      <span>{c.lastContactAt ? relative(c.lastContactAt) : 'بدون تماس'}</span>
                    </div>
                    {c.stage === 'lost' && c.lostReason && <div className="mt-1.5 text-[11px] text-rose">دلیل: {c.lostReason}</div>}
                  </div>
                ))}
                {cards.length === 0 && <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line/70 py-8 text-xs text-mist">کارتی اینجا رها کنید</div>}
              </div>
            </div>
          );
        })}
      </div>
      </>}
      <LogTouchModal open={!!touch} onClose={() => setTouch(null)} contact={touch} />
      <ContactFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
