import { useEffect, useState } from 'react';
import { Users, Plus, Pencil, Trash2, Phone, Mail, Crown, X } from 'lucide-react';
import clsx from 'clsx';
import { del, post, put } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Avatar, Button, Card, Field, Input, Modal, Select, Stars, Textarea, Toggle, useConfirm } from './ui';
import { num } from '../lib/format';

/** Role of the person in the buying decision — shown as a coloured chip. */
export const BUYING_ROLES: Record<string, { label: string; color: string }> = {
  decision: { label: 'تصمیم‌گیرنده', color: '#FF499E' },
  influencer: { label: 'اثرگذار', color: '#F5B85A' },
  technical: { label: 'کارشناس فنی', color: '#5EC8E5' },
  user: { label: 'کاربر / اپراتور', color: '#0FD69D' },
  finance: { label: 'مالی / خرید', color: '#B48CF2' },
  gatekeeper: { label: 'دفتر / هماهنگی', color: '#9DB4C0' },
};

/**
 * The people of a company: several contacts with their own title, department,
 * role in the purchase, phones, email and a 1–5 rating. The primary person is
 * crowned and mirrored as the company's main contact everywhere else.
 */
export function ContactPeople({ contact }: { contact: any }) {
  const { can } = useSession();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<any | null>(null);
  const people: any[] = contact.people ?? [];
  const remove = useAction((id: string) => del(`/people/${id}`), { success: 'شخص حذف شد' });
  const makePrimary = useAction((p: any) => put(`/people/${p.id}`, { isPrimary: true }), { success: 'رابط اصلی تغییر کرد' });

  return (
    <Card
      title="افراد و رابط‌ها"
      subtitle={people.length ? `${num(people.length)} نفر در این مجموعه` : 'هنوز شخصی ثبت نشده'}
      icon={Users}
      actions={can('crm') && <Button size="sm" variant="action" icon={Plus} onClick={() => setEditing({})}>افزودن شخص</Button>}
      pad={false}
      bodyClass="p-2.5 md:p-3"
    >
      {people.length === 0 ? (
        <button type="button" onClick={() => setEditing({})} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line py-6 text-sm text-mist hover:border-iris hover:text-iris">
          <Users size={22} />مدیرعامل، مدیر تولید، کارشناس خرید… را اضافه کنید
        </button>
      ) : (
        <ul className="space-y-2">
          {people.map((p) => {
            const role = BUYING_ROLES[p.buyingRole];
            return (
              <li key={p.id} className={clsx('rounded-2xl border bg-deep/50 p-3', p.isPrimary ? 'border-iris/40' : 'border-white/[0.05]')}>
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <Avatar name={p.name} size={42} color={role?.color ?? '#779BE7'} />
                    {!!p.isPrimary && <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-night" title="رابط اصلی"><Crown size={11} /></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-bold text-ink">{p.name}</span>
                      {role && <span className="chip" style={{ background: `${role.color}1f`, color: role.color }}>{role.label}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-mist">{[p.title, p.department].filter(Boolean).join(' · ') || 'سمت ثبت نشده'}</div>
                    {p.rating > 0 && <div className="mt-1"><Stars value={p.rating} size={13} /></div>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(p.phones ?? []).map((ph: any, i: number) => (
                        <a key={i} href={`tel:${ph.value}`} className="flex items-center gap-1.5 rounded-lg bg-mint/10 px-2.5 py-1.5 text-xs text-mint hover:bg-mint/20">
                          <Phone size={12} /><span className="ltr">{ph.value}</span>{ph.label && <span className="text-mint/70">· {ph.label}</span>}
                        </a>
                      ))}
                      {p.email && <a href={`mailto:${p.email}`} className="ltr flex items-center gap-1.5 rounded-lg bg-iris/10 px-2.5 py-1.5 text-xs text-iris"><Mail size={12} />{p.email}</a>}
                    </div>
                    {p.notes && <p className="mt-2 text-xs leading-5 text-frost/80">{p.notes}</p>}
                  </div>
                  {can('crm') && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="ghost" icon={Pencil} aria-label="ویرایش" onClick={() => setEditing(p)} />
                      {!p.isPrimary && <Button size="sm" variant="ghost" icon={Crown} aria-label="رابط اصلی شود" title="رابط اصلی شود" onClick={() => makePrimary.mutate(p)} />}
                      <Button size="sm" variant="ghost" icon={Trash2} aria-label="حذف" onClick={async () => (await confirm({ title: `حذف ${p.name}`, danger: true, confirm: 'حذف' })) && remove.mutate(p.id)} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PersonModal contactId={contact.id} person={editing} isFirst={!people.length} onClose={() => setEditing(null)} />
    </Card>
  );
}

function PersonModal({ contactId, person, isFirst, onClose }: { contactId: string; person: any | null; isFirst: boolean; onClose: () => void }) {
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (person) setF({ name: '', title: '', department: '', buyingRole: '', email: '', rating: 0, notes: '', ...person, phones: person.phones?.length ? person.phones : [{ label: 'موبایل', value: '' }], isPrimary: person.id ? !!person.isPrimary : isFirst });
  }, [person, isFirst]);
  const isNew = !person?.id;
  const set = (patch: any) => setF((x: any) => ({ ...x, ...patch }));
  const save = useAction(() => (isNew ? post(`/contacts/${contactId}/people`, f) : put(`/people/${person.id}`, f)), { success: 'ذخیره شد', onSuccess: onClose });
  const phones: any[] = f.phones ?? [];
  return (
    <Modal open={!!person} onClose={onClose} icon={Users} title={isNew ? 'افزودن شخص' : `ویرایش ${person?.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!f.name?.trim()} loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام و نام خانوادگی *" className="sm:col-span-2"><Input autoFocus value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="سمت"><Input value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="مدیرعامل، مدیر تولید…" /></Field>
        <Field label="واحد"><Input value={f.department ?? ''} onChange={(e) => set({ department: e.target.value })} placeholder="تولید، خرید، مالی…" /></Field>
        <Field label="نقش در خرید">
          <Select value={f.buyingRole ?? ''} onChange={(e) => set({ buyingRole: e.target.value })}>
            <option value="">—</option>
            {Object.entries(BUYING_ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="امتیاز / اهمیت"><div className="pt-1.5"><Stars value={f.rating ?? 0} onChange={(v) => set({ rating: v })} size={22} /></div></Field>
        <div className="space-y-2 sm:col-span-2">
          <span className="label">تلفن‌ها</span>
          {phones.map((ph, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="w-28 shrink-0" value={ph.label} onChange={(e) => set({ phones: phones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="برچسب" />
              <Input className="ltr min-w-0 flex-1" inputMode="tel" value={ph.value} onChange={(e) => set({ phones: phones.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="09…" />
              {phones.length > 1 && <Button size="sm" variant="ghost" icon={X} aria-label="حذف شماره" onClick={() => set({ phones: phones.filter((_, j) => j !== i) })} />}
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ phones: [...phones, { label: 'داخلی', value: '' }] })}>شماره دیگر</Button>
        </div>
        <Field label="ایمیل" className="sm:col-span-2"><Input className="ltr" type="email" value={f.email ?? ''} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="یادداشت" className="sm:col-span-2"><Textarea className="min-h-[64px]" value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Toggle checked={!!f.isPrimary} onChange={(v) => set({ isPrimary: v })} label="رابط اصلی این مجموعه" /></div>
      </div>
    </Modal>
  );
}
