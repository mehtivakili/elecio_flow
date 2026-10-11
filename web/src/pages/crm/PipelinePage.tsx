import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Star, PhoneCall, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, PageHeader, SearchBox, Select, Spinner, useConfirm } from '../../components/ui';
import { ContactFormModal, LogTouchModal, NextActionTag } from '../../components/crm';
import { ScoreMeter } from '../../components/charts';
import { compactMoney, num, relative } from '../../lib/format';

export default function PipelinePage() {
  const { settings, users, userName } = useSession();
  const confirm = useConfirm();
  const { data = [], isLoading } = useApi<any[]>('/pipeline');
  const [owner, setOwner] = useState('');
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [touch, setTouch] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const move = useAction((body: { id: string; stage: string; lostReason?: string }) => post(`/contacts/${body.id}/stage`, body), { success: 'مرحله به‌روز شد' });

  const contacts = useMemo(() => data.filter((c) =>
    (!owner || c.ownerId === owner) && (!search || `${c.name} ${c.company}`.includes(search))), [data, owner, search]);

  const drop = async (stage: string) => {
    const c = data.find((x) => x.id === dragId);
    setDragId(null); setOver(null);
    if (!c || c.stage === stage) return;
    if (stage === 'lost') {
      const reason = await confirm({ title: `از دست رفتن «${c.name}»`, danger: true, confirm: 'ثبت', body: `دلایل رایج: ${settings.lostReasons.join('، ')}`, input: { label: 'دلیل', required: true } });
      if (reason) move.mutate({ id: c.id, stage, lostReason: reason });
      return;
    }
    move.mutate({ id: c.id, stage });
  };

  if (isLoading) return <Spinner />;
  return (
    <div>
      <PageHeader
        icon={GitBranch}
        title="قیف فروش"
        subtitle="کارت‌ها را بین مراحل بکشید — هر کارت بر اساس امتیاز مرتب شده است"
        actions={<>
          <SearchBox value={search} onChange={setSearch} className="w-56" />
          <Select className="w-44" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">همه کارشناسان</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </Select>
          <Button variant="glow" icon={UserPlus} onClick={() => setCreating(true)}>سرنخ جدید</Button>
        </>}
      />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {settings.lifecycleStages.map((stage) => {
          const cards = contacts.filter((c) => c.stage === stage.key);
          const value = cards.reduce((s, c) => s + (c.openOrderValue || c.estimatedValue || 0), 0);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => { e.preventDefault(); setOver(stage.key); }}
              onDragLeave={() => setOver((o) => (o === stage.key ? null : o))}
              onDrop={() => drop(stage.key)}
              className={clsx('glass flex w-[290px] shrink-0 flex-col transition', over === stage.key && 'border-iris/60 shadow-glow')}
            >
              <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3" style={{ boxShadow: `inset 0 3px 0 ${stage.color}` }}>
                <div>
                  <div className="text-sm font-semibold text-ink">{stage.label}</div>
                  <div className="num text-[11px] text-mist">{compactMoney(value)} {settings.company.currency}</div>
                </div>
                <span className="num rounded-full px-2 py-0.5 text-xs font-bold text-night" style={{ background: stage.color }}>{num(cards.length)}</span>
              </div>
              <div className="flex max-h-[calc(100vh-260px)] min-h-[200px] flex-col gap-2.5 overflow-y-auto p-3">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={clsx('cursor-grab rounded-xl border border-white/[0.06] bg-deep/70 p-3 transition hover:border-iris/40 active:cursor-grabbing', dragId === c.id && 'opacity-40')}
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
      <LogTouchModal open={!!touch} onClose={() => setTouch(null)} contact={touch} />
      <ContactFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
