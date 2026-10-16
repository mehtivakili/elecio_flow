import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings, Building, Workflow, Users, Target, ClipboardCheck, Tags, Save, Plus, Trash2, ArrowUp, ArrowDown, ShieldCheck, Lock, RotateCcw, DatabaseBackup, Archive, ReceiptText,
} from 'lucide-react';
import {
  ELECIO_DEFAULTS, MODULES, ROLES, ROLE_LABELS, ROLE_MODULES, type CustomFieldDef, type OptionDef, type StageDef, type WorkspaceSettings,
} from '@shared/defaults';
import { del, post, put } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Field, Input, PageHeader, Pill, Select, Tabs, Textarea, Toggle, useConfirm } from '../components/ui';
import { num } from '../lib/format';
import { ArchiveAdmin, BackupAdmin, UsersAdmin } from '../components/admin';

type Tab = 'company' | 'invoice' | 'workflows' | 'crm' | 'service' | 'users' | 'tags' | 'backup' | 'archive';
const TABS: Tab[] = ['company', 'invoice', 'workflows', 'crm', 'service', 'users', 'tags', 'backup', 'archive'];

const GATES: Record<string, string> = {
  '': 'بدون کنترل', deposit: 'پیش‌پرداخت', full_payment: 'تسویه کامل', allocation: 'تخصیص کالا', shipment: 'ثبت محموله', kitting: 'کیتینگ قطعات', qc_pass: 'قبولی QC',
};
const SYSTEM_ORDER_KEYS = ['quote', 'production', 'allocation', 'installation', 'delivered'];
const SYSTEM_WO_KEYS = ['planned', 'kitting', 'firmware', 'assembly', 'testing', 'packaging', 'done'];
const MODULE_LABELS: Record<string, string> = {
  crm: 'CRM', sales: 'سفارش', scm: 'تأمین', inventory: 'انبار', production: 'تولید', units: 'دستگاه‌ها', service: 'خدمات', finance: 'مالی', tasks: 'کارها', settings: 'تنظیمات',
};

export default function SettingsPage() {
  const { settings, can } = useSession();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? params.get('tab') as Tab : 'company';
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
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
        { key: 'company', label: 'سازمان', icon: Building }, { key: 'invoice', label: 'قالب فاکتور', icon: ReceiptText },
        { key: 'workflows', label: 'جریان‌های کاری', icon: Workflow },
        { key: 'crm', label: 'CRM و امتیازدهی', icon: Target }, { key: 'service', label: 'کیفیت و خدمات', icon: ClipboardCheck },
        { key: 'users', label: 'کاربران و دسترسی', icon: Users }, { key: 'tags', label: 'برچسب‌ها', icon: Tags },
        { key: 'backup', label: 'پشتیبان‌گیری', icon: DatabaseBackup }, { key: 'archive', label: 'بایگانی', icon: Archive },
      ]} />
      {tab === 'backup' && <BackupAdmin />}
      {tab === 'archive' && <ArchiveAdmin />}

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

      {tab === 'invoice' && (() => {
        const inv = { ...ELECIO_DEFAULTS.invoice, ...draft.invoice };
        const setInv = (patch: Partial<typeof inv>) => set('invoice', { ...inv, ...patch });
        const text = (k: keyof typeof inv, label: string, ltr = false, className = '') => (
          <Field key={k} label={label} className={className}><Input className={ltr ? 'ltr' : ''} value={String(inv[k] ?? '')} onChange={(e) => setInv({ [k]: e.target.value } as Partial<typeof inv>)} /></Field>
        );
        return (
          <div className="space-y-6">
            <Card title="مشخصات فروشنده روی پیش‌فاکتور و فاکتور" icon={ReceiptText} subtitle="در سربرگ و بخش «مشخصات فروشنده» چاپ می‌شود">
              <div className="grid gap-4 md:grid-cols-3">
                {text('sellerName', 'نام فروشنده')}
                {text('economicCode', 'شماره اقتصادی', true)}
                {text('nationalId', 'شناسه ملی', true)}
                {text('registrationNo', 'شماره ثبت', true)}
                {text('postalCode', 'کد پستی', true)}
                {text('phone', 'تلفن', true)}
                {text('website', 'وب‌سایت', true)}
                {text('address', 'نشانی', false, 'md:col-span-2')}
              </div>
            </Card>
            <Card title="عنوان، شماره‌گذاری و متن‌ها" icon={ReceiptText}
              subtitle="در متن‌ها می‌توانید از {شماره} {تاریخ} {مشتری} {مبلغ_کل} {مانده} {اعتبار_روز} استفاده کنید">
              <div className="grid gap-4 md:grid-cols-3">
                {text('proformaTitle', 'عنوان پیش‌فاکتور')}
                {text('invoiceTitle', 'عنوان فاکتور فروش')}
                {text('invoicePrefix', 'پیشوند شماره فاکتور', true)}
                <Field label="اعتبار پیش‌فاکتور (روز)"><Input type="number" value={inv.proformaValidityDays} onChange={(e) => setInv({ proformaValidityDays: Number(e.target.value) })} /></Field>
                <Field label="امضاها"><div className="pt-2"><Toggle checked={inv.showSignatures} onChange={(v) => setInv({ showSignatures: v })} label="کادر مهر و امضای فروشنده و خریدار" /></div></Field>
                <div />
                <Field label="شرایط پیش‌فاکتور" className="md:col-span-3"><Textarea value={inv.proformaTerms} onChange={(e) => setInv({ proformaTerms: e.target.value })} /></Field>
                <Field label="شرایط فاکتور فروش" className="md:col-span-3"><Textarea value={inv.invoiceTerms} onChange={(e) => setInv({ invoiceTerms: e.target.value })} /></Field>
                <Field label="اطلاعات پرداخت (شماره حساب / شبا / کارت)" className="md:col-span-3"><Textarea className="min-h-[60px]" value={inv.bankInfo} onChange={(e) => setInv({ bankInfo: e.target.value })} /></Field>
                <Field label="پانویس" className="md:col-span-3"><Input value={inv.footer} onChange={(e) => setInv({ footer: e.target.value })} /></Field>
              </div>
            </Card>
            <SaveBar keys={['invoice']} />
          </div>
        );
      })()}

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
  return (
    <div className="space-y-4 md:space-y-6">
      <UsersAdmin />
      <Card title="ماتریس دسترسی نقش‌ها" subtitle="همه نقش‌ها همه بخش‌ها را می‌بینند؛ این جدول مجوز «تغییر» را نشان می‌دهد. کاربر چندنقشی مجموع آن‌ها را دارد." icon={ShieldCheck} pad={false} bodyClass="overflow-x-auto">
        <table className="tbl tbl-keep">
          <thead><tr><th>نقش</th>{MODULES.map((m) => <th key={m} className="text-center">{MODULE_LABELS[m]}</th>)}</tr></thead>
          <tbody>{ROLES.map((r) => (
            <tr key={r}><td className="whitespace-nowrap">{ROLE_LABELS[r]}</td>
              {MODULES.map((m) => <td key={m} className="text-center">{ROLE_MODULES[r].includes(m) ? <span className="text-mint">●</span> : <span className="text-slate">○</span>}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </Card>
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

