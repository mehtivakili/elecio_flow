import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Check, ChevronLeft, ClipboardList, Factory, LifeBuoy, MapPin, PackageOpen,
  Pencil, Plus, Route, Save, ShoppingCart, Trash2, Truck, type LucideIcon,
} from 'lucide-react';
import type { ProductFlowSection, ProductFlowSubsection } from '@shared/defaults';
import { put } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';

export const PRODUCT_FLOW_ICONS: Record<ProductFlowSection['icon'], LucideIcon> = {
  order: ShoppingCart, supply: PackageOpen, production: Factory,
  warehouse: Truck, delivery: MapPin, support: LifeBuoy,
};

const ICON_LABELS: Record<ProductFlowSection['icon'], string> = {
  order: 'سفارش', supply: 'تأمین', production: 'تولید', warehouse: 'انبار و ارسال', delivery: 'تحویل و نصب', support: 'پشتیبانی',
};

function move<T>(list: T[], index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function ProductFlowPage() {
  const { settings, can, refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProductFlowSection[]>(settings.productFlow);
  useEffect(() => setDraft(settings.productFlow), [settings.productFlow]);
  const save = useAction(
    () => put('/settings', { productFlow: draft }),
    { success: 'ساختار فرآیند تأمین ذخیره شد', onSuccess: () => { refresh(); setEditing(false); } },
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={Route} title="فرآیند تأمین محصول" subtitle="ساختار بخش‌ها و زیربخش‌های اجباری از سفارش تا پشتیبانی"
        actions={can('settings') && (editing
          ? <><Button variant="ghost" onClick={() => { setDraft(settings.productFlow); setEditing(false); }}>انصراف</Button><Button variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره ساختار</Button></>
          : <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>مدیریت بخش‌ها</Button>)} />

      {editing ? <FlowEditor sections={draft} onChange={setDraft} /> : <FlowView sections={settings.productFlow} />}

      {!editing && <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          [Factory, 'کیفیت در تمام مراحل', 'هر خروجی پیش از ورود به بخش بعدی کنترل می‌شود.'],
          [Route, 'فرآیند شفاف و قابل پیگیری', 'بخش‌ها، زیربخش‌ها و مسئول هر قسمت روشن است.'],
          [Truck, 'تحویل مطمئن', 'سریال، لیبل و رهگیری حمل به سفارش متصل می‌ماند.'],
          [LifeBuoy, 'پشتیبانی پایدار', 'پرونده دستگاه پس از تحویل وارد خدمات پس از فروش می‌شود.'],
        ].map(([Icon, title, body]) => {
          const FeatureIcon = Icon as LucideIcon;
          return <div key={title as string} className="glass flex items-start gap-3 p-4"><FeatureIcon size={19} className="mt-0.5 shrink-0 text-amber" /><div><h3 className="text-sm font-semibold text-ink">{title as string}</h3><p className="mt-1 text-xs leading-6 text-mist">{body as string}</p></div></div>;
        })}
      </section>}
    </div>
  );
}

function FlowView({ sections }: { sections: ProductFlowSection[] }) {
  return <section className="glass overflow-hidden">
    <div className="border-b border-line/60 bg-gradient-to-l from-amber/10 via-transparent to-mint/10 px-5 py-4">
      <h2 className="font-semibold text-ink">{sections.length} بخش اصلی در مسیر آماده‌سازی دستگاه</h2>
      <p className="mt-1 text-xs leading-6 text-mist">هر بخش می‌تواند چند زیربخش و هر زیربخش می‌تواند چک‌لیست مستقل داشته باشد.</p>
    </div>
    <div className="grid gap-px bg-line/40 md:grid-cols-2 xl:grid-cols-3">
      {sections.map((section, index) => {
        const Icon = PRODUCT_FLOW_ICONS[section.icon] ?? ClipboardList;
        return <article key={section.id} className="flex min-h-[390px] flex-col bg-deep/75 p-5 transition hover:bg-ink/[0.055]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3"><span className="num flex h-10 w-10 items-center justify-center rounded-2xl text-base font-extrabold text-night" style={{ background: section.color }}>{index + 1}</span><span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: `${section.color}1f`, color: section.color }}><Icon size={19} /></span></div>
            {index < sections.length - 1 && <ChevronLeft size={18} className="mt-3 text-slate" />}
          </div>
          <h3 className="text-base font-bold text-ink">{section.title}</h3><p className="mt-1 text-[11px] font-medium" style={{ color: section.color }}>{section.owner}</p><p className="mt-3 text-xs leading-6 text-mist">{section.description}</p>
          <div className="mt-4 space-y-3">{section.subsections.map((sub) => <div key={sub.id} className="rounded-xl border border-line/60 bg-ink/[0.025] p-3"><h4 className="text-xs font-semibold text-ink">{sub.title}</h4><ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{sub.items.map((item) => <li key={item} className="flex items-start gap-1.5 text-[11px] leading-5 text-frost"><Check size={11} className="mt-1 shrink-0" style={{ color: section.color }} />{item}</li>)}</ul></div>)}</div>
          <div className="mt-auto pt-5"><p className="mb-3 rounded-xl bg-ink/[0.04] px-3 py-2 text-[11px] text-mist">خروجی: {section.output}</p><Link to={section.to} className="flex items-center justify-between rounded-xl border border-line/70 px-3 py-2 text-xs font-medium transition hover:border-current" style={{ color: section.color }}><span>{section.action}</span><ChevronLeft size={15} /></Link></div>
        </article>;
      })}
    </div>
  </section>;
}

function FlowEditor({ sections, onChange }: { sections: ProductFlowSection[]; onChange: (sections: ProductFlowSection[]) => void }) {
  const updateSection = (index: number, patch: Partial<ProductFlowSection>) => onChange(sections.map((s, i) => i === index ? { ...s, ...patch } : s));
  const addSection = () => onChange([...sections, { id: `section_${Date.now().toString(36)}`, title: 'بخش جدید', owner: '', description: '', output: '', color: '#779BE7', icon: 'production', to: '/production/work-orders', action: 'مشاهده بخش', subsections: [] }]);
  return <div className="space-y-4">
    <div className="glass flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="text-sm font-semibold text-ink">طراحی ساختار فرآیند</h2><p className="mt-1 text-xs text-mist">بخش اصلی، زیربخش و موارد اجرایی دلخواه تعریف کنید.</p></div><Button variant="action" icon={Plus} onClick={addSection}>افزودن بخش اصلی</Button></div>
    {sections.map((section, sectionIndex) => <Card key={section.id} title={`بخش ${sectionIndex + 1}: ${section.title}`} icon={PRODUCT_FLOW_ICONS[section.icon]} actions={<div className="flex"><Button size="sm" variant="ghost" icon={ArrowUp} disabled={sectionIndex === 0} onClick={() => onChange(move(sections, sectionIndex, -1))} /><Button size="sm" variant="ghost" icon={ArrowDown} disabled={sectionIndex === sections.length - 1} onClick={() => onChange(move(sections, sectionIndex, 1))} /><Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(sections.filter((_, i) => i !== sectionIndex))} /></div>}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="عنوان بخش"><Input value={section.title} onChange={(e) => updateSection(sectionIndex, { title: e.target.value })} /></Field><Field label="مسئول"><Input value={section.owner} onChange={(e) => updateSection(sectionIndex, { owner: e.target.value })} /></Field><Field label="نوع / آیکن"><Select value={section.icon} onChange={(e) => updateSection(sectionIndex, { icon: e.target.value as ProductFlowSection['icon'] })}>{Object.entries(ICON_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
        <Field label="شرح بخش" className="md:col-span-2"><Textarea value={section.description} onChange={(e) => updateSection(sectionIndex, { description: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="رنگ"><Input type="color" className="h-10 p-1" value={section.color} onChange={(e) => updateSection(sectionIndex, { color: e.target.value })} /></Field><Field label="عنوان دکمه"><Input value={section.action} onChange={(e) => updateSection(sectionIndex, { action: e.target.value })} /></Field></div><Field label="خروجی بخش"><Input value={section.output} onChange={(e) => updateSection(sectionIndex, { output: e.target.value })} /></Field><Field label="مسیر صفحه"><Input className="ltr" value={section.to} onChange={(e) => updateSection(sectionIndex, { to: e.target.value })} /></Field>
      </div>
      <div className="mt-5 border-t border-line/60 pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-ink">زیربخش‌ها</h3><Button size="sm" variant="outline" icon={Plus} onClick={() => updateSection(sectionIndex, { subsections: [...section.subsections, { id: `sub_${Date.now().toString(36)}`, title: 'زیربخش جدید', items: [] }] })}>افزودن زیربخش</Button></div><div className="space-y-3">{section.subsections.map((sub, subIndex) => <SubsectionEditor key={sub.id} subsection={sub} onChange={(next) => updateSection(sectionIndex, { subsections: section.subsections.map((s, i) => i === subIndex ? next : s) })} onDelete={() => updateSection(sectionIndex, { subsections: section.subsections.filter((_, i) => i !== subIndex) })} />)}{!section.subsections.length && <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-mist">هنوز زیربخشی تعریف نشده است.</p>}</div></div>
    </Card>)}
  </div>;
}

function SubsectionEditor({ subsection, onChange, onDelete }: { subsection: ProductFlowSubsection; onChange: (sub: ProductFlowSubsection) => void; onDelete: () => void }) {
  return <div className="rounded-xl border border-line/60 bg-ink/[0.025] p-3"><div className="flex items-center gap-2"><Input className="max-w-sm" value={subsection.title} onChange={(e) => onChange({ ...subsection, title: e.target.value })} /><Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} /></div><div className="mt-3 space-y-2">{subsection.items.map((item, itemIndex) => <div key={itemIndex} className="flex items-center gap-2"><Input value={item} onChange={(e) => onChange({ ...subsection, items: subsection.items.map((x, i) => i === itemIndex ? e.target.value : x) })} /><Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange({ ...subsection, items: subsection.items.filter((_, i) => i !== itemIndex) })} /></div>)}<Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange({ ...subsection, items: [...subsection.items, 'مورد جدید'] })}>افزودن مورد</Button></div></div>;
}
