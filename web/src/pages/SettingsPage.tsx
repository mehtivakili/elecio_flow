import { useEffect, useState, type ReactNode } from 'react';
import {
  Settings, Building, Workflow, Users, Target, ClipboardCheck, Tags, Save, Plus, Trash2, ArrowUp, ArrowDown, ShieldCheck, Lock, UserPlus, RotateCcw,
} from 'lucide-react';
import {
  ELECIO_DEFAULTS, MODULES, ROLES, ROLE_LABELS, ROLE_MODULES, type CustomFieldDef, type OptionDef, type StageDef, type WorkspaceSettings,
} from '@shared/defaults';
import { del, post, put } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Field, Input, Modal, PageHeader, Pill, Select, Tabs, Toggle, useConfirm } from '../components/ui';
import { num } from '../lib/format';

type Tab = 'company' | 'workflows' | 'crm' | 'service' | 'users' | 'tags';

const GATES: Record<string, string> = {
  '': 'بدون کنترل', deposit: 'پیش‌پرداخت', full_payment: 'تسویه کامل', allocation: 'تخصیص کالا', shipment: 'ثبت محموله', kitting: 'کیتینگ قطعات', qc_pass: 'قبولی QC',
};
const SYSTEM_ORDER_KEYS = ['quote', 'production', 'allocation', 'installation', 'delivered'];
const SYSTEM_WO_KEYS = ['planned', 'kitting', 'firmware', 'done'];
const MODULE_LABELS: Record<string, string> = {
  crm: 'CRM', sales: 'سفارش', scm: 'تأمین', inventory: 'انبار', production: 'تولید', units: 'دستگاه‌ها', service: 'خدمات', finance: 'مالی', tasks: 'کارها', settings: 'تنظیمات',
};

export default function SettingsPage() {
  const { settings, can } = useSession();
  const [tab, setTab] = useState<Tab>('company');
  const [draft, setDraft] = useState<WorkspaceSettings>(settings);
  useEffect(() => setDraft(settings), [settings]);
  const { refresh } = useSession();
  const save = useAction((patch: Partial<WorkspaceSettings>) => put('/settings', patch), { success: 'تنظیمات ذخیره شد', onSuccess: refresh });
  const editable = can('settings');
  const set = <K extends keyof WorkspaceSettings>(k: K, v: WorkspaceSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const SaveBar = ({ keys }: { keys: (keyof WorkspaceSettings)[] }) => editable ? (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft((d) => ({ ...d, ...Object.fromEntries(keys.map((k) => [k, ELECIO_DEFAULTS[k]])) }))}>پیش‌فرض الکیو</Button>
      <Button variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate(Object.fromEntries(keys.map((k) => [k, draft[k]])))}>ذخیره</Button>
    </div>
  ) : <p className="text-left text-xs text-mist">فقط مدیر سیستم می‌تواند تنظیمات را تغییر دهد.</p>;

  return (
    <div>
      <PageHeader icon={Settings} title="تنظیمات فضای کار" subtitle="همه مراحل، برچسب‌ها و قواعد سیستم قابل تنظیم است — پیش‌فرض‌ها مطابق فرایند الکیو تنظیم شده‌اند" />
      <Tabs className="mb-6 w-fit" value={tab} onChange={setTab} tabs={[
        { key: 'company', label: 'سازمان', icon: Building }, { key: 'workflows', label: 'جریان‌های کاری', icon: Workflow },
        { key: 'crm', label: 'CRM و امتیازدهی', icon: Target }, { key: 'service', label: 'کیفیت و خدمات', icon: ClipboardCheck },
        { key: 'users', label: 'کاربران و دسترسی', icon: Users }, { key: 'tags', label: 'برچسب‌ها', icon: Tags },
      ]} />

      {tab === 'company' && (
        <div className="space-y-6">
          <Card title="اطلاعات سازمان و قواعد پایه" icon={Building}>
            <div className="grid gap-4 md:grid-cols-3">
              {([
                ['name', 'نام سازمان'], ['brand', 'نام برند'], ['currency', 'واحد پول'],
                ['orderPrefix', 'پیشوند سفارش فروش'], ['poPrefix', 'پیشوند سفارش خرید'], ['woPrefix', 'پیشوند دستور تولید'],
                ['ticketPrefix', 'پیشوند تیکت'], ['serialPattern', 'الگوی شماره سریال'],
              ] as [keyof WorkspaceSettings['company'], string][]).map(([k, label]) => (
                <Field key={k} label={label} hint={k === 'serialPattern' ? '{SKU} {YY} {MM} {SEQ}' : undefined}>
                  <Input className={k.endsWith('Prefix') || k === 'serialPattern' ? 'ltr' : ''} value={String(draft.company[k])} onChange={(e) => set('company', { ...draft.company, [k]: e.target.value })} />
                </Field>
              ))}
              {([['taxRate', 'مالیات و عوارض ٪'], ['depositPct', 'درصد پیش‌پرداخت لازم'], ['warrantyMonths', 'گارانتی پیش‌فرض (ماه)']] as [keyof WorkspaceSettings['company'], string][]).map(([k, label]) => (
                <Field key={k} label={label}><Input type="number" value={Number(draft.company[k])} onChange={(e) => set('company', { ...draft.company, [k]: Number(e.target.value) })} /></Field>
              ))}
            </div>
          </Card>
          <SaveBar keys={['company']} />
        </div>
      )}

      {tab === 'workflows' && (
        <div className="space-y-6">
          <Card title="مراحل سفارش فروش" subtitle="هر مرحله: SLA (روز)، کنترل خروج، و نوع تأمینی که برایش اعمال می‌شود" icon={Workflow}>
            <StageEditor stages={draft.orderStages} onChange={(v) => set('orderStages', v)} systemKeys={SYSTEM_ORDER_KEYS} gates={['', 'deposit', 'full_payment', 'allocation', 'shipment']} showOnlyFor />
          </Card>
          <Card title="مراحل دستور تولید" icon={Workflow}>
            <StageEditor stages={draft.workOrderStages} onChange={(v) => set('workOrderStages', v)} systemKeys={SYSTEM_WO_KEYS} gates={['', 'kitting', 'qc_pass']} />
          </Card>
          <SaveBar keys={['orderStages', 'workOrderStages']} />
        </div>
      )}

      {tab === 'crm' && (
        <div className="space-y-6">
          <Card title="مراحل چرخه مشتری" subtitle="کلیدها ثابت‌اند (برای امتیازدهی و یکپارچگی با سفارش)، عنوان، رنگ و SLA قابل تغییر است" icon={Target}>
            <StageEditor stages={draft.lifecycleStages} onChange={(v) => set('lifecycleStages', v)} systemKeys={draft.lifecycleStages.map((s) => s.key)} gates={['']} fixedOrder />
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="منابع سرنخ"><OptionEditor options={draft.leadSources} onChange={(v) => set('leadSources', v)} /></Card>
            <Card title="انواع مشتری"><OptionEditor options={draft.customerTypes} onChange={(v) => set('customerTypes', v)} withColor /></Card>
            <Card title="دلایل از دست رفتن"><ListEditor items={draft.lostReasons} onChange={(v) => set('lostReasons', v)} /></Card>
            <Card title="قواعد امتیازدهی سرنخ">
              <div className="grid grid-cols-2 gap-4">
                <Field label="آستانه داغ"><Input type="number" value={draft.scoring.hotThreshold} onChange={(e) => set('scoring', { ...draft.scoring, hotThreshold: Number(e.target.value) })} /></Field>
                <Field label="آستانه گرم"><Input type="number" value={draft.scoring.warmThreshold} onChange={(e) => set('scoring', { ...draft.scoring, warmThreshold: Number(e.target.value) })} /></Field>
                <Field label="روز تا سرد شدن"><Input type="number" value={draft.scoring.staleDays} onChange={(e) => set('scoring', { ...draft.scoring, staleDays: Number(e.target.value) })} /></Field>
                <Field label="مهلت اولین تماس (ساعت)"><Input type="number" value={draft.scoring.firstTouchHours} onChange={(e) => set('scoring', { ...draft.scoring, firstTouchHours: Number(e.target.value) })} /></Field>
                <Field label="کنترلرهای هدف" className="col-span-2" hint="با کاما جدا کنید">
                  <Input className="ltr" value={draft.scoring.targetControllers.join(', ')} onChange={(e) => set('scoring', { ...draft.scoring, targetControllers: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                </Field>
              </div>
            </Card>
          </div>
          <Card title="فیلدهای ارزیابی سرنخ (سفارشی)" subtitle="این فیلدها در فرم مخاطب و پرونده نمایش داده می‌شوند"><CustomFieldsEditor fields={draft.customFields} onChange={(v) => set('customFields', v)} /></Card>
          <SaveBar keys={['lifecycleStages', 'leadSources', 'customerTypes', 'lostReasons', 'scoring', 'customFields']} />
        </div>
      )}

      {tab === 'service' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="چک‌لیست کنترل کیفیت" icon={ClipboardCheck}><ListEditor items={draft.qcChecklist} onChange={(v) => set('qcChecklist', v)} /></Card>
            <Card title="SLA تیکت‌ها (ساعت)" icon={ShieldCheck}>
              <div className="grid grid-cols-2 gap-4">
                {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
                  <Field key={p} label={{ urgent: 'فوری', high: 'بالا', normal: 'عادی', low: 'کم' }[p]}>
                    <Input type="number" value={draft.ticketSlaHours[p]} onChange={(e) => set('ticketSlaHours', { ...draft.ticketSlaHours, [p]: Number(e.target.value) })} />
                  </Field>
                ))}
              </div>
            </Card>
            <Card title="انواع تیکت"><OptionEditor options={draft.ticketTypes} onChange={(v) => set('ticketTypes', v)} withColor /></Card>
            <Card title="دسته‌های هزینه"><ListEditor items={draft.expenseCategories} onChange={(v) => set('expenseCategories', v)} /></Card>
          </div>
          <SaveBar keys={['qcChecklist', 'ticketSlaHours', 'ticketTypes', 'expenseCategories']} />
        </div>
      )}

      {tab === 'users' && <UsersTab />}
      {tab === 'tags' && <TagsTab />}
    </div>
  );
}

/* ───────────────────────── Editors ───────────────────────── */

function Row({ children, onUp, onDown, onDelete, locked }: { children: ReactNode; onUp?: () => void; onDown?: () => void; onDelete?: () => void; locked?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink/[0.03] p-2">
      {children}
      <div className="mr-auto flex items-center">
        {onUp && <Button size="sm" variant="ghost" icon={ArrowUp} onClick={onUp} />}
        {onDown && <Button size="sm" variant="ghost" icon={ArrowDown} onClick={onDown} />}
        {locked ? <span className="px-2 text-mist" title="مرحله سیستمی"><Lock size={14} /></span> : onDelete && <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} />}
      </div>
    </div>
  );
}

function move<T>(list: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function StageEditor({ stages, onChange, systemKeys, gates, showOnlyFor, fixedOrder }: {
  stages: StageDef[]; onChange: (s: StageDef[]) => void; systemKeys: string[]; gates: string[]; showOnlyFor?: boolean; fixedOrder?: boolean;
}) {
  const upd = (i: number, patch: Partial<StageDef>) => onChange(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <Row key={s.key} locked={systemKeys.includes(s.key)} onDelete={() => onChange(stages.filter((_, j) => j !== i))}
          onUp={fixedOrder || s.final ? undefined : () => onChange(move(stages, i, -1))} onDown={fixedOrder || s.final ? undefined : () => onChange(move(stages, i, 1))}>
          <input type="color" value={s.color} onChange={(e) => upd(i, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded-lg border border-line bg-transparent" />
          <Input className="w-52" value={s.label} onChange={(e) => upd(i, { label: e.target.value })} />
          <span className="ltr w-24 truncate text-[11px] text-mist">{s.key}</span>
          {!s.final && <>
            <div className="flex items-center gap-1 text-xs text-mist">SLA<Input type="number" className="w-16" value={s.slaDays ?? ''} onChange={(e) => upd(i, { slaDays: e.target.value ? Number(e.target.value) : undefined })} />روز</div>
            {gates.length > 1 && (
              <Select className="w-36" value={s.gate ?? ''} onChange={(e) => upd(i, { gate: (e.target.value || undefined) as StageDef['gate'] })}>
                {gates.map((g) => <option key={g} value={g}>{GATES[g]}</option>)}
              </Select>
            )}
            {showOnlyFor && (
              <Select className="w-36" value={s.onlyFor ?? ''} onChange={(e) => upd(i, { onlyFor: (e.target.value || undefined) as StageDef['onlyFor'] })}>
                <option value="">همه سفارش‌ها</option><option value="stock">فقط فروش از موجودی</option><option value="mto">فقط تولید سفارشی</option>
              </Select>
            )}
          </>}
          {s.final && <Pill color="#0FD69D">مرحله پایانی</Pill>}
        </Row>
      ))}
      {!fixedOrder && (
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => {
          const finalIdx = stages.findIndex((s) => s.final);
          const stage: StageDef = { key: `custom_${Date.now().toString(36)}`, label: 'مرحله جدید', color: '#9DB4C0', slaDays: 2 };
          const next = [...stages];
          next.splice(finalIdx < 0 ? next.length : finalIdx, 0, stage);
          onChange(next);
        }}>افزودن مرحله</Button>
      )}
    </div>
  );
}

function OptionEditor({ options, onChange, withColor }: { options: OptionDef[]; onChange: (o: OptionDef[]) => void; withColor?: boolean }) {
  const upd = (i: number, patch: Partial<OptionDef>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <Row key={o.key} onDelete={() => onChange(options.filter((_, j) => j !== i))}>
          {withColor && <input type="color" value={o.color ?? '#779BE7'} onChange={(e) => upd(i, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded-lg border border-line bg-transparent" />}
          <Input className="w-56" value={o.label} onChange={(e) => upd(i, { label: e.target.value })} />
        </Row>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...options, { key: `opt_${Date.now().toString(36)}`, label: 'گزینه جدید', color: '#779BE7' }])}>افزودن</Button>
    </div>
  );
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <Row key={i} onUp={() => onChange(move(items, i, -1))} onDown={() => onChange(move(items, i, 1))} onDelete={() => onChange(items.filter((_, j) => j !== i))}>
          <Input className="min-w-[200px] flex-1" value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
        </Row>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...items, ''])}>افزودن</Button>
    </div>
  );
}

function CustomFieldsEditor({ fields, onChange }: { fields: CustomFieldDef[]; onChange: (f: CustomFieldDef[]) => void }) {
  const upd = (i: number, patch: Partial<CustomFieldDef>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <Row key={f.key} onDelete={() => onChange(fields.filter((_, j) => j !== i))} locked={['machines', 'controllers'].includes(f.key)}>
          <Input className="w-48" value={f.label} onChange={(e) => upd(i, { label: e.target.value })} />
          <Select className="w-36" value={f.type} onChange={(e) => upd(i, { type: e.target.value as CustomFieldDef['type'] })}>
            <option value="text">متن</option><option value="number">عدد</option><option value="select">انتخابی</option><option value="multiselect">چندانتخابی</option>
          </Select>
          {(f.type === 'select' || f.type === 'multiselect') && (
            <Input className="min-w-[240px] flex-1" placeholder="گزینه‌ها با کاما" value={(f.options ?? []).join('، ')} onChange={(e) => upd(i, { options: e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean) })} />
          )}
        </Row>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...fields, { key: `f_${Date.now().toString(36)}`, label: 'فیلد جدید', type: 'text' }])}>افزودن فیلد</Button>
    </div>
  );
}

/* ───────────────────────── Users & tags ───────────────────────── */

function UsersTab() {
  const { users, me, can, refresh } = useSession();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ username: '', fullName: '', password: '', role: 'sales', phone: '' });
  const create = useAction(() => post('/users', f), { success: 'کاربر ایجاد شد', onSuccess: () => { refresh(); setAdding(false); } });
  const update = useAction(({ id, ...body }: any) => put(`/users/${id}`, body), { success: 'کاربر به‌روز شد', onSuccess: refresh });
  const editable = can('settings');
  return (
    <div className="space-y-6">
      <Card title="کاربران" icon={Users} pad={false} bodyClass="overflow-x-auto" actions={editable && <Button size="sm" variant="action" icon={UserPlus} onClick={() => setAdding(true)}>کاربر جدید</Button>}>
        <table className="tbl">
          <thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>وضعیت</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td className="text-ink">{u.fullName}{u.id === me.id && <span className="mr-2 text-xs text-iris">(شما)</span>}</td>
              <td className="ltr text-right text-xs">{u.username}</td>
              <td>
                {editable && u.id !== me.id && u.role !== 'owner' ? (
                  <Select className="w-40" value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}>
                    {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                ) : <Pill color="#779BE7">{ROLE_LABELS[u.role]}</Pill>}
              </td>
              <td>{editable && u.id !== me.id && u.role !== 'owner'
                ? <Toggle checked={u.active !== 0} onChange={(v) => update.mutate({ id: u.id, active: v })} label={u.active !== 0 ? 'فعال' : 'غیرفعال'} />
                : <span className="text-xs text-mint">فعال</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <Card title="ماتریس دسترسی نقش‌ها" subtitle="همه نقش‌ها همه بخش‌ها را می‌بینند؛ این جدول مجوز «تغییر» را نشان می‌دهد" icon={ShieldCheck} pad={false} bodyClass="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>نقش</th>{MODULES.map((m) => <th key={m} className="text-center">{MODULE_LABELS[m]}</th>)}</tr></thead>
          <tbody>{ROLES.map((r) => (
            <tr key={r}><td className="whitespace-nowrap">{ROLE_LABELS[r]}</td>
              {MODULES.map((m) => <td key={m} className="text-center">{ROLE_MODULES[r].includes(m) ? <span className="text-mint">●</span> : <span className="text-slate">○</span>}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="کاربر جدید" icon={UserPlus} size="sm"
        footer={<><Button variant="ghost" onClick={() => setAdding(false)}>انصراف</Button><Button variant="primary" disabled={!f.username || !f.fullName || f.password.length < 6} loading={create.isPending} onClick={() => create.mutate(undefined)}>ایجاد</Button></>}>
        <div className="space-y-4">
          <Field label="نام کامل"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="نام کاربری"><Input className="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="رمز عبور" hint="حداقل ۶ کاراکتر"><Input className="ltr" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="نقش"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
        </div>
      </Modal>
    </div>
  );
}

function TagsTab() {
  const { tags, can, refresh } = useSession();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#779BE7');
  const add = useAction(() => post('/tags', { name, color }), { success: 'برچسب اضافه شد', onSuccess: () => { setName(''); refresh(); } });
  const remove = useAction((id: string) => del(`/tags/${id}`), { success: 'برچسب حذف شد', onSuccess: refresh });
  return (
    <Card title="برچسب‌های مخاطبین" icon={Tags}>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t.id} className="chip !py-1.5 !text-xs" style={{ background: `${t.color}22`, color: t.color }}>
            {t.name}
            {can('crm') && <button onClick={async () => (await confirm({ title: `حذف برچسب «${t.name}»`, danger: true })) && remove.mutate(t.id)} className="mr-1 opacity-60 hover:opacity-100">×</button>}
          </span>
        ))}
      </div>
      {can('crm') && (
        <div className="mt-5 flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-transparent" />
          <Input className="w-64" value={name} placeholder="نام برچسب" onChange={(e) => setName(e.target.value)} />
          <Button variant="action" icon={Plus} disabled={!name.trim()} onClick={() => add.mutate(undefined)}>افزودن</Button>
          <span className="text-xs text-mist">{num(tags.length)} برچسب</span>
        </div>
      )}
    </Card>
  );
}

