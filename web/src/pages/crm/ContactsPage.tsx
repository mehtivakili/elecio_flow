import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Users, UserPlus, LayoutGrid, Rows3, Star, Phone, PhoneCall, Download, Filter } from 'lucide-react';
import clsx from 'clsx';
import { IRAN_PROVINCES } from '@shared/iran-locations';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Avatar, Button, Card, Empty, Filters, ListCard, PageHeader, Pill, SearchBox, Select, Spinner, Stars } from '../../components/ui';
import { LifecyclePill } from '../../components/domain';
import { ContactFormModal, LogTouchModal, NextActionTag, PhoneLine } from '../../components/crm';
import { ScoreMeter } from '../../components/charts';
import { num, relative } from '../../lib/format';

export default function ContactsPage() {
  const { settings, tags, users, userName } = useSession();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [view, setView] = useState<'table' | 'cards'>(() => (localStorage.getItem('ef_contacts_view') as any) || 'table');
  const [creating, setCreating] = useState(false);
  const [touch, setTouch] = useState<any>(null);
  const filters = {
    stage: params.get('stage') ?? '', temp: params.get('temp') ?? '', source: params.get('source') ?? '',
    customerType: params.get('customerType') ?? '', tag: params.get('tag') ?? '', province: params.get('province') ?? '', owner: params.get('owner') ?? '',
  };
  const untouched = params.get('untouched') === '1';
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t); }, [search]);
  useEffect(() => { if (params.get('new') === '1') { setCreating(true); params.delete('new'); setParams(params, { replace: true }); } }, [params, setParams]);
  useEffect(() => { try { localStorage.setItem('ef_contacts_view', view); } catch { /* ignore */ } }, [view]);

  const qs = new URLSearchParams(Object.entries({ ...filters, search: debounced }).filter(([, v]) => v)).toString();
  const { data: rawContacts, isLoading } = useApi<any[]>(`/contacts${qs ? `?${qs}` : ''}`);
  const contacts = useMemo(
    () => (rawContacts ?? []).filter((c) => !untouched || (!c.lastContactAt && !['customer', 'lost'].includes(c.stage))),
    [rawContacts, untouched],
  );
  const setFilter = (key: string, value: string) => {
    if (value) params.set(key, value); else params.delete(key);
    setParams(params, { replace: true });
  };
  const activeFilters = Object.values(filters).filter(Boolean).length + (untouched ? 1 : 0);
  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));

  const exportCsv = () => {
    const header = ['نام', 'رابط', 'تلفن', 'مرحله', 'امتیاز', 'منبع', 'استان', 'شهر', 'آخرین ارتباط'];
    const rows = contacts.map((c) => [
      c.name, c.company, c.phones?.[0]?.value ?? '', settings.lifecycleStages.find((s) => s.key === c.stage)?.label ?? c.stage,
      c.score, settings.leadSources.find((s) => s.key === c.leadSource)?.label ?? '', c.addresses?.[0]?.province ?? '', c.addresses?.[0]?.county ?? '',
      c.lastContactAt ? new Date(c.lastContactAt).toISOString().slice(0, 10) : '',
    ]);
    const csv = '﻿' + [header, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'elecio-contacts.csv';
    a.click();
  };

  return (
    <div>
      <PageHeader
        icon={Users}
        title="مخاطبین و مشتریان"
        subtitle={`${num(contacts.length)} مخاطب — سرنخ‌ها، مشتریان و نمایندگان`}
        actions={<Button variant="ghost" icon={Download} onClick={exportCsv} className="hidden md:inline-flex">خروجی CSV</Button>}
        fab={{ label: 'سرنخ جدید', icon: UserPlus, onClick: () => setCreating(true) }}
      />

      <Card pad={false} bodyClass="p-0 md:p-4" className="mb-4 border-0 bg-transparent shadow-none backdrop-blur-none md:mb-5 md:border md:bg-ink/[0.045] md:shadow-glass md:backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={search} onChange={setSearch} placeholder="نام، تلفن، شهر، یادداشت…" className="min-w-0 flex-1 md:min-w-[220px]" />
          <Filters count={activeFilters} onReset={() => setParams({}, { replace: true })}>
          <Select className="w-auto" value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)}>
            <option value="">همه مراحل</option>
            {settings.lifecycleStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Select className="w-auto" value={filters.temp} onChange={(e) => setFilter('temp', e.target.value)}>
            <option value="">همه دماها</option><option value="hot">🔥 داغ</option><option value="warm">گرم</option><option value="cold">سرد</option>
          </Select>
          <Select className="w-auto" value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
            <option value="">همه منابع</option>
            {settings.leadSources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Select className="w-auto" value={filters.province} onChange={(e) => setFilter('province', e.target.value)}>
            <option value="">همه استان‌ها</option>
            {IRAN_PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}
          </Select>
          <Select className="w-auto" value={filters.tag} onChange={(e) => setFilter('tag', e.target.value)}>
            <option value="">همه برچسب‌ها</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select className="w-auto" value={filters.owner} onChange={(e) => setFilter('owner', e.target.value)}>
            <option value="">همه کارشناسان</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </Select>
          </Filters>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" icon={Filter} className="hidden md:inline-flex" onClick={() => setParams({}, { replace: true })}>حذف {num(activeFilters)} فیلتر</Button>
          )}
          <div className="mr-auto hidden rounded-xl border border-line/70 p-0.5 md:flex">
            <Button size="sm" variant={view === 'table' ? 'action' : 'ghost'} icon={Rows3} onClick={() => setView('table')} aria-label="جدول" />
            <Button size="sm" variant={view === 'cards' ? 'action' : 'ghost'} icon={LayoutGrid} onClick={() => setView('cards')} aria-label="کارت" />
          </div>
        </div>
        {untouched && <p className="mt-3 text-xs text-amber">نمایش سرنخ‌هایی که هنوز هیچ تماسی با آن‌ها ثبت نشده است.</p>}
      </Card>

      {isLoading ? <Spinner /> : contacts.length === 0 ? (
        <Card><Empty icon={Users} title="مخاطبی یافت نشد" hint="فیلترها را تغییر دهید یا اولین سرنخ را ثبت کنید." action={<Button variant="action" icon={UserPlus} onClick={() => setCreating(true)}>سرنخ جدید</Button>} /></Card>
      ) : <>
      <div className="space-y-2 md:hidden">
        <div className="px-1 text-xs text-mist">{num(contacts.length)} مخاطب</div>
        {contacts.map((c) => {
          const stage = settings.lifecycleStages.find((s) => s.key === c.stage);
          const place = c.addresses?.[0]?.county || c.addresses?.[0]?.province;
          const scoreColor = c.score >= settings.scoring.hotThreshold ? 'text-rose' : c.score >= settings.scoring.warmThreshold ? 'text-amber' : 'text-mist';
          const phone = c.phones?.[0]?.value;
          return (
            <ListCard key={c.id} onClick={() => navigate(`/crm/contacts/${c.id}`)} accent={stage?.color}>
              <div className="flex items-center gap-2.5">
                <Avatar name={c.name} size={36} color={stage?.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1">
                      {!!c.starred && <Star size={12} className="shrink-0 fill-amber text-amber" />}
                      <span className="truncate text-[14.5px] font-bold text-ink">{c.name}</span>
                    </span>
                    <LifecyclePill stage={c.stage} />
                  </div>
                  <div className="truncate text-[11.5px] text-mist">
                    {!['customer', 'lost'].includes(c.stage) && <b className={clsx('num ml-1 font-bold', scoreColor)}>{num(c.score)}</b>}
                    {[c.company, place].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[11px]">
                      {c.nextAction ? <NextActionTag action={c.nextAction} />
                        : <span className={!c.lastContactAt ? 'text-amber' : 'text-mist'}>{c.lastContactAt ? `آخرین ارتباط ${relative(c.lastContactAt)}` : 'بدون تماس'}</span>}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {phone && <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="icon-chip text-mint" aria-label="تماس"><Phone size={15} /></a>}
                      <button type="button" onClick={(e) => { e.stopPropagation(); setTouch(c); }} className="icon-chip text-iris" aria-label="ثبت ارتباط"><PhoneCall size={15} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </ListCard>
          );
        })}
      </div>
      <div className="hidden md:block">
      {view === 'table' ? (
        <Card pad={false} bodyClass="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>نام</th><th>مرحله</th><th>امتیاز</th><th>اقدام پیشنهادی</th><th>تماس</th><th>موقعیت</th><th>منبع</th><th>آخرین ارتباط</th><th>کارشناس</th><th />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/crm/contacts/${c.id}`)}>
                  <td>
                    <div className="flex items-center gap-2">
                      {!!c.starred && <Star size={13} className="shrink-0 fill-amber text-amber" />}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">{c.name}</div>
                        <div className="flex flex-wrap items-center gap-1 text-xs text-mist">
                          {c.company}{c.jobTitle && ` · ${c.jobTitle}`}
                          {(c.tags ?? []).slice(0, 2).map((t: string) => tagMap[t] && <Pill key={t} color={tagMap[t].color} className="!py-0 !text-[10px]">{tagMap[t].name}</Pill>)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><LifecyclePill stage={c.stage} /></td>
                  <td>{['customer', 'lost'].includes(c.stage) ? <span className="text-xs text-mist">—</span> : <ScoreMeter score={c.score} hot={settings.scoring.hotThreshold} warm={settings.scoring.warmThreshold} compact />}</td>
                  <td><NextActionTag action={c.nextAction} /></td>
                  <td onClick={(e) => e.stopPropagation()}><PhoneLine phones={c.phones} /></td>
                  <td className="text-xs text-frost">{c.addresses?.[0] ? `${c.addresses[0].county || c.addresses[0].province}` : '—'}</td>
                  <td className="text-xs text-mist">{settings.leadSources.find((s) => s.key === c.leadSource)?.label}</td>
                  <td className={clsx('text-xs', !c.lastContactAt ? 'text-amber' : 'text-mist')}>{c.lastContactAt ? relative(c.lastContactAt) : 'بدون تماس'}</td>
                  <td className="text-xs text-mist">{userName(c.ownerId)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" icon={PhoneCall} onClick={() => setTouch(c)} title="ثبت ارتباط" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {contacts.map((c) => {
            const type = settings.customerTypes.find((t) => t.key === c.customerType);
            return (
              <div key={c.id} className="glass flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-iris/30">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/crm/contacts/${c.id}`} className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-ink hover:text-iris">
                      {!!c.starred && <Star size={13} className="fill-amber text-amber" />}<span className="truncate">{c.name}</span>
                    </div>
                    <div className="truncate text-xs text-mist">{c.company} {c.jobTitle && `· ${c.jobTitle}`}</div>
                  </Link>
                  <LifecyclePill stage={c.stage} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {!['customer', 'lost'].includes(c.stage) ? <ScoreMeter score={c.score} /> : <Stars value={c.rating} />}
                  {type && <Pill color={type.color}>{type.label}</Pill>}
                </div>
                <NextActionTag action={c.nextAction} />
                <div className="mt-auto flex items-center justify-between border-t border-line/50 pt-3 text-xs text-mist">
                  <PhoneLine phones={c.phones} />
                  <span>{c.addresses?.[0]?.county || c.addresses?.[0]?.province || ''}</span>
                  <Button size="sm" variant="ghost" icon={PhoneCall} onClick={() => setTouch(c)} title="ثبت ارتباط" />
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
      </>}

      <ContactFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/crm/contacts/${id}`)} />
      <LogTouchModal open={!!touch} onClose={() => setTouch(null)} contact={touch} />
    </div>
  );
}
