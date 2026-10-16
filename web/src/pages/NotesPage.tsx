import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StickyNote, Plus, Pin, Lock, Users, Globe2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { del, post, put } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Avatar, Button, Card, Empty, Field, Input, Modal, PageHeader, SearchBox, Spinner, Tabs, Textarea, Toggle, useConfirm } from '../components/ui';
import { ChipSelect } from '../components/inputs';
import { num, relative, dateTime } from '../lib/format';
import { matchesSearch } from '@shared/search';

const COLORS: Record<string, string> = {
  iris: '#779BE7', mint: '#0FD69D', amber: '#F5B85A', rose: '#FF499E', lilac: '#B48CF2', sky: '#5EC8E5',
};

const VISIBILITY = {
  private: { label: 'فقط خودم', icon: Lock },
  users: { label: 'افراد مشخص', icon: Users },
  team: { label: 'همه تیم', icon: Globe2 },
} as const;

type Scope = 'visible' | 'mine' | 'inbox' | 'all';

/**
 * Notes: everyone sees their own notes and notes others shared with them (or with
 * the whole team); owners/admins can switch to "all notes".
 */
export default function NotesPage() {
  const { me, isAdmin, userName } = useSession();
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState<Scope>('visible');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const { data = [], isLoading } = useApi<any[]>(`/notes?scope=${scope}`);
  useEffect(() => {
    if (params.get('new') === '1') { setEditing({}); params.delete('new'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  const notes = useMemo(() => data.filter((n) => matchesSearch(`${n.title} ${n.body} ${n.authorName ?? ''}`, search)), [data, search]);
  const tabs = [
    { key: 'visible' as Scope, label: 'همه' },
    { key: 'mine' as Scope, label: 'نوشته‌های من' },
    { key: 'inbox' as Scope, label: 'برای من' },
    ...(isAdmin ? [{ key: 'all' as Scope, label: 'کل تیم' }] : []),
  ];

  return (
    <div>
      <PageHeader
        icon={StickyNote}
        title="یادداشت‌ها"
        subtitle="یادداشت شخصی، یا برای همکار مشخص و کل تیم — مدیر همه را می‌بیند"
        fab={{ label: 'یادداشت جدید', icon: Plus, onClick: () => setEditing({}) }}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs className="w-full md:w-auto" value={scope} onChange={setScope} tabs={tabs} />
        <SearchBox value={search} onChange={setSearch} placeholder="جستجو در یادداشت‌ها…" className="min-w-0 flex-1 md:min-w-[220px]" />
      </div>
      {isLoading ? <Spinner /> : notes.length === 0 ? (
        <Card><Empty icon={StickyNote} title="یادداشتی نیست" hint="اولین یادداشت را بنویسید؛ می‌توانید آن را با همکاران یا کل تیم به اشتراک بگذارید." action={<Button variant="action" icon={Plus} onClick={() => setEditing({})}>یادداشت جدید</Button>} /></Card>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 xl:columns-3 2xl:columns-4">
          {notes.map((n) => {
            const color = COLORS[n.color] ?? COLORS.iris;
            const V = VISIBILITY[n.visibility as keyof typeof VISIBILITY] ?? VISIBILITY.private;
            const mine = n.authorId === me.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setEditing(n)}
                className="glass mb-3 block w-full break-inside-avoid p-4 text-right transition hover:-translate-y-0.5 hover:border-iris/30 active:scale-[.99]"
                style={{ boxShadow: `inset 0 3px 0 ${color}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-[15px] font-bold leading-6 text-ink">{n.title || <span className="text-mist">بدون عنوان</span>}</div>
                  {!!n.pinned && <Pin size={14} className="mt-1 shrink-0 fill-amber text-amber" />}
                </div>
                {n.body && <p className="mt-1.5 line-clamp-[8] whitespace-pre-wrap text-sm leading-7 text-frost/90">{n.body}</p>}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/50 pt-2.5 text-[11.5px] text-mist">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Avatar name={n.authorName ?? '؟'} size={20} />
                    <span className="truncate">{mine ? 'من' : n.authorName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1" title={n.visibility === 'users' ? (n.recipients ?? []).map(userName).join('، ') : V.label}>
                      <V.icon size={12} />{n.visibility === 'users' ? `${num((n.recipients ?? []).length)} نفر` : V.label}
                    </span>
                    <span title={dateTime(n.updatedAt)}>{relative(n.updatedAt)}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <NoteModal note={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function NoteModal({ note, onClose }: { note: any | null; onClose: () => void }) {
  const { me, users, isAdmin, userName } = useSession();
  const confirm = useConfirm();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (note) setF({ title: '', body: '', color: 'iris', visibility: 'private', recipients: [], ...note, pinned: !!note.pinned });
  }, [note]);
  const isNew = !note?.id;
  const editable = isNew || note?.authorId === me.id || isAdmin;
  const save = useAction(() => (isNew ? post('/notes', f) : put(`/notes/${note.id}`, f)), { success: 'یادداشت ذخیره شد', onSuccess: onClose });
  const remove = useAction(() => del(`/notes/${note.id}`), { success: 'یادداشت حذف شد', onSuccess: onClose });
  const set = (patch: any) => setF((x: any) => ({ ...x, ...patch }));
  const others = users.filter((u) => u.id !== me.id && u.active !== 0);

  if (!editable) {
    return (
      <Modal open={!!note} onClose={onClose} icon={StickyNote} title={note?.title || 'یادداشت'} subtitle={note ? `${note.authorName} · ${dateTime(note.updatedAt)}` : undefined}
        footer={<Button variant="action" onClick={onClose}>بستن</Button>}>
        <p className="whitespace-pre-wrap text-sm leading-7 text-frost">{note?.body}</p>
      </Modal>
    );
  }
  return (
    <Modal
      open={!!note}
      onClose={onClose}
      icon={StickyNote}
      title={isNew ? 'یادداشت جدید' : 'ویرایش یادداشت'}
      subtitle={!isNew && note.authorId !== me.id ? `نوشته‌شده توسط ${userName(note.authorId)}` : undefined}
      footer={<>
        {!isNew && <Button variant="danger" icon={Trash2} onClick={async () => (await confirm({ title: 'حذف یادداشت', danger: true, confirm: 'حذف' })) && remove.mutate(undefined)}>حذف</Button>}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button variant="primary" loading={save.isPending} disabled={!f.title?.trim() && !f.body?.trim()} onClick={() => save.mutate(undefined)}>ذخیره</Button>
      </>}
    >
      <div className="space-y-4">
        <Field label="عنوان"><Input value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="مثلاً: نکات جلسه با آقای محتشم" /></Field>
        <Field label="متن"><Textarea autoFocus className="min-h-[160px]" value={f.body ?? ''} onChange={(e) => set({ body: e.target.value })} /></Field>
        <Field label="چه کسانی ببینند؟">
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(VISIBILITY) as (keyof typeof VISIBILITY)[]).map((k) => {
              const V = VISIBILITY[k];
              return (
                <button key={k} type="button" onClick={() => set({ visibility: k })}
                  className={clsx('flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[13px] transition', f.visibility === k ? 'border-iris bg-iris/15 font-bold text-ink' : 'border-line text-mist')}>
                  <V.icon size={15} />{V.label}
                </button>
              );
            })}
          </div>
        </Field>
        {f.visibility === 'users' && (
          <Field label="برای این افراد" hint="فقط شما، این افراد و مدیر سیستم یادداشت را می‌بینند">
            <ChipSelect options={others.map((u) => ({ value: u.id, label: u.fullName }))} value={f.recipients ?? []} onChange={(v) => set({ recipients: v })} />
          </Field>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {Object.entries(COLORS).map(([key, hex]) => (
              <button key={key} type="button" aria-label={`رنگ ${key}`} onClick={() => set({ color: key })}
                className={clsx('h-7 w-7 rounded-full border-2 transition', f.color === key ? 'scale-110 border-ink' : 'border-transparent')} style={{ background: hex }} />
            ))}
          </div>
          <Toggle checked={!!f.pinned} onChange={(v) => set({ pinned: v })} label="سنجاق بالای فهرست" />
        </div>
      </div>
    </Modal>
  );
}
