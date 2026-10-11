import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, PhoneCall, ChevronDown, Star } from 'lucide-react';
import clsx from 'clsx';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, PageHeader, Spinner, Tabs } from '../../components/ui';
import { LifecyclePill } from '../../components/domain';
import { LogTouchModal, NextActionTag, PhoneLine, ScoreBreakdown } from '../../components/crm';
import { ScoreMeter } from '../../components/charts';
import { compactMoney, num, relative } from '../../lib/format';

/** Tamasa's "conversion potential" page, now with the reasons behind every score. */
export default function LeadsPage() {
  const { settings, userName } = useSession();
  const [tier, setTier] = useState<'hot' | 'warm'>('hot');
  const min = tier === 'hot' ? settings.scoring.hotThreshold : settings.scoring.warmThreshold;
  const { data = [], isLoading } = useApi<any[]>(`/hot-leads?min=${min}`);
  const [open, setOpen] = useState<string | null>(null);
  const [touch, setTouch] = useState<any>(null);
  const leads = tier === 'warm' ? data.filter((c) => c.score < settings.scoring.hotThreshold) : data;

  return (
    <div>
      <PageHeader
        icon={Flame}
        title="سرنخ‌های داغ"
        subtitle="بیشترین احتمال خرید — بر اساس تناسب با محصول، میزان تعامل و نزدیکی به خرید"
        actions={<Tabs value={tier} onChange={setTier} tabs={[{ key: 'hot', label: `داغ (≥ ${num(settings.scoring.hotThreshold)})` }, { key: 'warm', label: 'گرم' }]} />}
      />
      {isLoading ? <Spinner /> : leads.length === 0 ? <Card><Empty icon={Flame} title="سرنخی در این دسته نیست" /></Card> : (
        <div className="space-y-3">
          {leads.map((c, i) => (
            <div key={c.id} className="glass overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 p-4">
                <span className={clsx('num flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold', i < 3 && tier === 'hot' ? 'bg-rose/20 text-rose' : 'bg-ink/[0.06] text-mist')}>{num(i + 1)}</span>
                <div className="min-w-[200px] flex-1">
                  <Link to={`/crm/contacts/${c.id}`} className="flex items-center gap-1.5 font-semibold text-ink hover:text-iris">
                    {!!c.starred && <Star size={13} className="fill-amber text-amber" />}{c.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist">
                    <LifecyclePill stage={c.stage} />
                    <span>{c.addresses?.[0]?.county}</span>
                    {c.attrs?.machines ? <span>{num(c.attrs.machines)} ماشین CNC</span> : null}
                    {c.attrs?.controllers?.length ? <span className="ltr">{c.attrs.controllers.join(' · ')}</span> : null}
                  </div>
                </div>
                <ScoreMeter score={c.score} hot={settings.scoring.hotThreshold} warm={settings.scoring.warmThreshold} />
                <div className="w-28 text-xs">
                  <div className="text-mist">ارزش تخمینی</div>
                  <div className="num font-semibold text-ink">{c.estimatedValue ? compactMoney(c.estimatedValue) : '—'}</div>
                </div>
                <div className="w-32 text-xs">
                  <div className="text-mist">آخرین ارتباط</div>
                  <div className="text-frost">{c.lastContactAt ? relative(c.lastContactAt) : 'بدون تماس'}</div>
                </div>
                <div className="flex w-56 flex-col items-start gap-1"><NextActionTag action={c.nextAction} /><span className="text-[11px] text-mist">{userName(c.ownerId)} · <PhoneLine phones={c.phones} /></span></div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="action" icon={PhoneCall} onClick={() => setTouch(c)}>ثبت ارتباط</Button>
                  <Button size="sm" variant="ghost" icon={ChevronDown} onClick={() => setOpen(open === c.id ? null : c.id)} aria-label="جزئیات امتیاز" className={clsx(open === c.id && 'rotate-180')} />
                </div>
              </div>
              {open === c.id && (
                <div className="border-t border-line/60 bg-deep/40 p-5"><div className="max-w-xl"><ScoreBreakdown parts={c.scoreParts ?? []} score={c.score} /></div></div>
              )}
            </div>
          ))}
        </div>
      )}
      <LogTouchModal open={!!touch} onClose={() => setTouch(null)} contact={touch} />
    </div>
  );
}
