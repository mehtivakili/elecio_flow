import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhoneCall, Check, AlarmClock, Clock, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Tabs } from '../../components/ui';
import { DateInput } from '../../components/inputs';
import { ContactPicker, LifecyclePill } from '../../components/domain';
import { LogTouchModal, PhoneLine } from '../../components/crm';
import { dateTime, num, relative } from '../../lib/format';

export default function FollowupsPage() {
  const { me, userName } = useSession();
  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const [status, setStatus] = useState<'pending' | 'done'>('pending');
  const { data = [], isLoading } = useApi<any[]>(`/followups?status=${status}${mine === 'mine' ? '&mine=1' : ''}`);
  const [touch, setTouch] = useState<{ contact: any; followupId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const act = useAction(({ id, action, days }: { id: string; action: string; days?: number }) => post(`/followups/${id}/${action}`, { days }), { success: 'پیگیری به‌روز شد' });

  const groups = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 86_400_000;
    const week = start.getTime() + 7 * 86_400_000;
    if (status === 'done') return [{ key: 'done', label: 'انجام‌شده', items: data, tone: 'text-mint' }];
    return [
      { key: 'overdue', label: 'عقب‌افتاده', items: data.filter((f) => f.dueAt < start.getTime()), tone: 'text-rose' },
      { key: 'today', label: 'امروز', items: data.filter((f) => f.dueAt >= start.getTime() && f.dueAt < end), tone: 'text-amber' },
      { key: 'week', label: 'این هفته', items: data.filter((f) => f.dueAt >= end && f.dueAt < week), tone: 'text-iris' },
      { key: 'later', label: 'بعدتر', items: data.filter((f) => f.dueAt >= week), tone: 'text-mist' },
    ];
  }, [data, status]);

  return (
    <div>
      <PageHeader
        icon={PhoneCall}
        title="پیگیری‌ها"
        subtitle="صف تماس‌های امروز — بعد از هر تماس، پیگیری بعدی را همان‌جا زمان‌بندی کنید"
        actions={<>
          <Tabs value={mine} onChange={setMine} tabs={[{ key: 'all', label: 'همه' }, { key: 'mine', label: 'پیگیری‌های من' }]} />
          <Tabs value={status} onChange={setStatus} tabs={[{ key: 'pending', label: 'در انتظار' }, { key: 'done', label: 'انجام‌شده' }]} />
        </>}
        fab={{ label: 'پیگیری جدید', icon: Plus, onClick: () => setCreating(true) }}
      />
      {status === 'pending' && (
        <div className="mb-5 grid grid-cols-4 gap-2 md:mb-6 md:gap-3">
          {groups.map((g) => (
            <div key={g.key} className="glass px-2 py-3 text-center md:p-4 md:text-right">
              <div className="truncate text-xs text-mist">{g.label}</div>
              <div className={clsx('num mt-1 text-xl font-bold md:text-2xl', g.tone)}>{num(g.items.length)}</div>
            </div>
          ))}
        </div>
      )}
      {isLoading ? <Spinner /> : data.length === 0 ? <Card><Empty icon={Clock} title="پیگیری‌ای وجود ندارد" /></Card> : (
        <div className="space-y-6">
          {groups.filter((g) => g.items.length).map((g) => (
            <Card key={g.key} title={<span className={g.tone}>{g.label} ({num(g.items.length)})</span>} pad={false} bodyClass="p-2">
              {g.items.map((f: any) => (
                <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/40 px-3 py-3 last:border-0 hover:bg-ink/[0.04] md:rounded-xl md:border-0 md:py-2.5">
                  <div className="min-w-0 basis-full md:min-w-[200px] md:flex-1 md:basis-auto">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/crm/contacts/${f.contactId}`} className="font-medium text-ink hover:text-iris">{f.contactName}</Link>
                      <LifecyclePill stage={f.contactStage} />
                      {f.priority === 'high' && <span className="text-[11px] font-semibold text-amber">اولویت بالا</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-mist">{f.note || 'پیگیری'} · {userName(f.userId)}</div>
                  </div>
                  <PhoneLine phones={f.phones} />
                  <span className={clsx('text-xs md:w-32', status === 'pending' && f.dueAt < Date.now() ? 'text-rose' : 'text-mist')} title={dateTime(f.dueAt)}>{relative(f.dueAt)}</span>
                  {status === 'pending' && (
                    <div className="flex w-full items-center gap-1 md:w-auto">
                      <Button size="sm" variant="action" icon={PhoneCall} className="flex-1 md:flex-none" onClick={() => setTouch({ contact: { id: f.contactId, name: f.contactName, phones: f.phones, stage: f.contactStage }, followupId: f.id })}>تماس و ثبت</Button>
                      <Button size="sm" variant="ghost" icon={AlarmClock} title="تعویق یک روز" onClick={() => act.mutate({ id: f.id, action: 'snooze', days: 1 })} />
                      <Button size="sm" variant="ghost" icon={Check} title="انجام شد" onClick={() => act.mutate({ id: f.id, action: 'complete' })} />
                      <Button size="sm" variant="ghost" icon={X} title="لغو" onClick={() => act.mutate({ id: f.id, action: 'cancel' })} />
                    </div>
                  )}
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
      <LogTouchModal open={!!touch} onClose={() => setTouch(null)} contact={touch?.contact} completeFollowupId={touch?.followupId} />
      <NewFollowupModal open={creating} onClose={() => setCreating(false)} defaultUser={me.id} />
    </div>
  );
}

function NewFollowupModal({ open, onClose, defaultUser }: { open: boolean; onClose: () => void; defaultUser: string }) {
  const [f, setF] = useState<any>({ contactId: null, dueAt: Date.now() + 86_400_000, priority: 'normal', note: '' });
  const save = useAction(() => post('/followups', { ...f, userId: defaultUser }), { success: 'پیگیری ثبت شد', onSuccess: onClose });
  return (
    <Modal open={open} onClose={onClose} title="پیگیری جدید" icon={AlarmClock} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.contactId || !f.dueAt} loading={save.isPending} onClick={() => save.mutate(undefined)}>ثبت</Button></>}>
      <div className="space-y-4">
        <Field label="مخاطب"><ContactPicker value={f.contactId} onChange={(v) => setF({ ...f, contactId: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاریخ"><DateInput value={f.dueAt} onChange={(v) => setF({ ...f, dueAt: v })} /></Field>
          <Field label="اولویت">
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">کم</option><option value="normal">عادی</option><option value="high">بالا</option></Select>
          </Field>
        </div>
        <Field label="یادداشت"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
