import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, ArrowUp, Check, ChevronLeft, ClipboardList, Factory, LifeBuoy, MapPin, PackageOpen,
  GripVertical, Pencil, Plus, Route, Save, ShoppingCart, Trash2, Truck, X, type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import type { ProductFlowSection, ProductFlowSubsection } from '@shared/defaults';
import { put } from '../lib/api';
import { compactProductFlow } from '../lib/product-flow';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Button, Card, Field, Input, PageHeader, Select, Textarea, useConfirm } from '../components/ui';

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

function reorder<T>(list: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [selected] = next.splice(from, 1);
  next.splice(to, 0, selected);
  return next;
}

export default function ProductFlowPage() {
  const { settings, can, refresh } = useSession();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [quickEdit, setQuickEdit] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<ProductFlowSection[]>(() => compactProductFlow(settings.productFlow));
  useEffect(() => { setDraft(compactProductFlow(settings.productFlow)); setDirty(false); }, [settings.productFlow]);
  const changeDraft = (next: ProductFlowSection[]) => { setDraft(next); setDirty(true); };
  const save = useAction(
    (sections: ProductFlowSection[]) => put('/settings', { productFlow: sections }),
    { success: 'ساختار فرآیند تأمین ذخیره شد', onSuccess: () => { refresh(); setEditing(false); setEditingSection(null); setQuickEdit(null); setDirty(false); } },
  );
  const persistNow = (next: ProductFlowSection[]) => { setDraft(next); setDirty(false); save.mutate(next); };
  const addStage = (sectionId: string, title: string) => {
    persistNow(draft.map((section) => section.id === sectionId ? { ...section, subsections: [...section.subsections, { id: `sub_${Date.now().toString(36)}`, title, items: [] }] } : section));
  };
  const addSection = (title: string) => {
    persistNow([...draft, { id: `section_${Date.now().toString(36)}`, title, owner: '', description: '', output: '', color: '#779BE7', icon: 'production', to: '/production/work-orders', action: 'مشاهده بخش', subsections: [] }]);
  };
  const removeSection = async (sectionId: string, title: string) => {
    const section = draft.find((candidate) => candidate.id === sectionId);
    if (!section) return;
    const itemCount = section.subsections.reduce((sum, sub) => sum + sub.items.length, 0);
    const ok = await confirm({
      title: `حذف بخش «${title}»؟`,
      body: <DeletePreview section={section} detail={`${section.subsections.length} مرحله و ${itemCount} گزینه همراه این بخش حذف می‌شود.`} />,
      confirm: 'حذف کامل بخش', danger: true,
    });
    if (!ok) return;
    persistNow(draft.filter((section) => section.id !== sectionId));
  };
  const addItem = (sectionId: string, subsectionId: string, item: string) => {
    persistNow(draft.map((section) => section.id === sectionId ? { ...section, subsections: section.subsections.map((sub) => sub.id === subsectionId ? { ...sub, items: [...sub.items, item] } : sub) } : section));
  };
  const removeStage = async (sectionId: string, subsectionId: string, title: string) => {
    const section = draft.find((candidate) => candidate.id === sectionId);
    const subsection = section?.subsections.find((candidate) => candidate.id === subsectionId);
    if (!section || !subsection) return;
    const ok = await confirm({
      title: `حذف مرحله «${title}»؟`,
      body: <DeletePreview section={section} subsection={subsection} detail={`${subsection.items.length} گزینه داخل این مرحله نیز حذف می‌شود.`} />,
      confirm: 'حذف مرحله', danger: true,
    });
    if (!ok) return;
    persistNow(draft.map((section) => section.id === sectionId ? { ...section, subsections: section.subsections.filter((sub) => sub.id !== subsectionId) } : section));
  };
  const removeItem = async (sectionId: string, subsectionId: string, itemIndex: number) => {
    const section = draft.find((candidate) => candidate.id === sectionId);
    const subsection = section?.subsections.find((candidate) => candidate.id === subsectionId);
    const item = subsection?.items[itemIndex];
    if (!section || !subsection || !item) return;
    const ok = await confirm({
      title: `حذف گزینه «${item}»؟`,
      body: <DeletePreview section={section} subsection={subsection} item={item} detail="فقط همین گزینه حذف می‌شود." />,
      confirm: 'حذف گزینه', danger: true,
    });
    if (!ok) return;
    persistNow(draft.map((section) => section.id === sectionId ? { ...section, subsections: section.subsections.map((sub) => sub.id === subsectionId ? { ...sub, items: sub.items.filter((_, index) => index !== itemIndex) } : sub) } : section));
  };
  const back = () => {
    if (quickEdit) { setQuickEdit(null); return; }
    if (editing) { setEditing(false); setEditingSection(null); setDraft(compactProductFlow(settings.productFlow)); setDirty(false); return; }
    navigate(-1);
  };

  return (
    <div className="space-y-3">
      <PageHeader icon={Route} title="عملیات محصول" subtitle="از سفارش و تأمین قطعات تا آماده‌سازی، ارسال و پشتیبانی"
        actions={<><Button variant="ghost" icon={ArrowRight} onClick={back}>بازگشت</Button>{can('settings') && (editing
          ? <><Button variant="ghost" onClick={() => { setDraft(compactProductFlow(settings.productFlow)); setEditing(false); setEditingSection(null); setDirty(false); }}>انصراف</Button><Button variant="primary" icon={Save} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(draft)}>ذخیره تغییرات</Button></>
          : <>{dirty && <Button variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate(draft)}>ذخیره تغییرات</Button>}<Button variant="outline" icon={Pencil} onClick={() => { setQuickEdit(null); setEditingSection(null); setEditing(true); }}>مدیریت همه بخش‌ها</Button></>)} </>} />

      {editing
        ? <FlowEditor sections={draft} onChange={changeDraft} focused={editingSection} onFocus={setEditingSection} />
        : <FlowView sections={draft} canEdit={can('settings')} quickEdit={quickEdit} onEdit={(id) => setQuickEdit((current) => current === id ? null : id)} onChange={changeDraft} onAddSection={addSection} onRemoveSection={removeSection} onAddStage={addStage} onAddItem={addItem} onRemoveStage={removeStage} onRemoveItem={removeItem} saving={save.isPending} />}

    </div>
  );
}

function FlowView({ sections, canEdit, quickEdit, onEdit, onChange, onAddSection, onRemoveSection, onAddStage, onAddItem, onRemoveStage, onRemoveItem, saving }: {
  sections: ProductFlowSection[]; canEdit: boolean; quickEdit: string | null; onEdit: (id: string) => void; onChange: (sections: ProductFlowSection[]) => void;
  onAddSection: (title: string) => void; onRemoveSection: (sectionId: string, title: string) => void;
  onAddStage: (sectionId: string, title: string) => void; onAddItem: (sectionId: string, subsectionId: string, item: string) => void;
  onRemoveStage: (sectionId: string, subsectionId: string, title: string) => void; onRemoveItem: (sectionId: string, subsectionId: string, itemIndex: number) => void; saving: boolean;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardHeight, setBoardHeight] = useState(540);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      const scrollTop = board.closest('main')?.scrollTop ?? 0;
      setBoardHeight(Math.max(320, Math.floor(window.innerHeight - board.getBoundingClientRect().top - scrollTop - 24)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (board.parentElement?.parentElement) observer.observe(board.parentElement.parentElement);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  type DragState =
    | { kind: 'section'; sectionId: string }
    | { kind: 'stage'; sectionId: string; subsectionId: string }
    | { kind: 'item'; sectionId: string; subsectionId: string; itemIndex: number };
  const [dragging, setDragging] = useState<DragState | null>(null);
  const beginDrag = (event: React.DragEvent, value: DragState) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(value));
    const preview = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-drag-preview]');
    if (preview) event.dataTransfer.setDragImage(preview, 24, 24);
    setDragging(value);
  };
  const moveSectionOver = (targetIndex: number) => {
    if (dragging?.kind !== 'section') return;
    const sourceIndex = sections.findIndex((candidate) => candidate.id === dragging.sectionId);
    if (sourceIndex === targetIndex) return;
    onChange(reorder(sections, sourceIndex, targetIndex));
  };
  const moveStageOver = (section: ProductFlowSection, targetIndex: number) => {
    if (dragging?.kind !== 'stage' || dragging.sectionId !== section.id) return;
    const sourceIndex = section.subsections.findIndex((candidate) => candidate.id === dragging.subsectionId);
    if (sourceIndex === targetIndex) return;
    onChange(sections.map((candidate) => candidate.id === section.id ? { ...candidate, subsections: reorder(candidate.subsections, sourceIndex, targetIndex) } : candidate));
  };
  const moveItemOver = (section: ProductFlowSection, subsection: ProductFlowSubsection, targetIndex: number) => {
    if (dragging?.kind !== 'item' || dragging.sectionId !== section.id || dragging.subsectionId !== subsection.id) return;
    if (dragging.itemIndex === targetIndex) return;
    onChange(sections.map((candidate) => candidate.id === section.id ? { ...candidate, subsections: candidate.subsections.map((stage) => stage.id === subsection.id ? { ...stage, items: reorder(stage.items, dragging.itemIndex, targetIndex) } : stage) } : candidate));
    setDragging({ ...dragging, itemIndex: targetIndex });
  };
  const finishDrop = (event: React.DragEvent) => { event.preventDefault(); event.stopPropagation(); setDragging(null); };
  return <section className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[11px] text-mist">{sections.length} بخش · نمای کلی آماده‌سازی دستگاه</span>
      {canEdit && <InlineAdd label="بخش اصلی" placeholder="نام بخش جدید…" compact disabled={saving} onAdd={onAddSection} />}
    </div>
    <div ref={boardRef} className="product-flow-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" style={{ '--flow-board-height': `${boardHeight}px`, '--flow-board-rows': Math.max(1, Math.ceil(sections.length / 4)) } as React.CSSProperties}>
      {sections.map((section, index) => {
        const Icon = PRODUCT_FLOW_ICONS[section.icon] ?? ClipboardList;
        const isEditing = quickEdit === section.id;
        const update = (next: ProductFlowSection) => onChange(sections.map((s) => s.id === section.id ? next : s));
        return <article key={section.id} data-drag-preview onDragOver={(event) => { if (dragging?.kind === 'section') event.preventDefault(); }} onDragEnter={() => moveSectionOver(index)} onDrop={finishDrop} className={clsx('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-amber/45 bg-[#17242a] p-3 transition-[opacity,background-color] duration-200', isEditing && 'ring-1 ring-iris/70', dragging?.kind === 'section' && dragging.sectionId === section.id && 'opacity-55')}>
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#fff2c4] to-[#e5a936] text-sm font-extrabold text-night">{index + 1}</span>
            <Icon size={19} className="shrink-0 text-amber" />
            {isEditing ? <Input aria-label="عنوان بخش" value={section.title} className="h-8 min-w-0 px-2 text-xs" onChange={(event) => update({ ...section, title: event.target.value })} /> : <h3 className="min-w-0 text-xs font-bold leading-5 text-ink" title={section.description}>{section.title}</h3>}
          </div>
          {canEdit && <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-1"><button onClick={() => onEdit(section.id)} className={clsx('flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px]', isEditing ? 'bg-iris/15 text-ink' : 'text-mist')}><Pencil size={10} />{isEditing ? 'بستن ویرایش' : 'ویرایش سریع'}</button>{isEditing && <div className="flex items-center gap-1"><span draggable onDragStart={(event) => beginDrag(event, { kind: 'section', sectionId: section.id })} onDragEnd={() => setDragging(null)} className="cursor-grab p-1 text-mist active:cursor-grabbing" title="جابجایی بخش با کشیدن"><GripVertical size={13} /></span><button disabled={saving} onClick={() => onRemoveSection(section.id, section.title)} className="p-1 text-mist hover:text-rose" title="حذف بخش"><Trash2 size={12} /></button></div>}<InlineAdd label="مرحله" placeholder="نام مرحله…" compact disabled={saving} onAdd={(title) => onAddStage(section.id, title)} /></div>}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pb-2">
            {section.subsections.map((sub, subIndex) => <div key={sub.id} data-drag-preview onDragOver={(event) => { if (dragging?.kind === 'stage' && dragging.sectionId === section.id) event.preventDefault(); }} onDragEnter={(event) => { if (dragging?.kind === 'stage') { event.stopPropagation(); moveStageOver(section, subIndex); } }} onDrop={finishDrop} className={clsx('transition-[opacity,background-color] duration-200', isEditing && 'rounded-lg border border-iris/30 p-2', dragging?.kind === 'stage' && dragging.subsectionId === sub.id && 'bg-iris/[0.09] opacity-55')}>
              <div className="flex items-center justify-between gap-2">
                {isEditing && <span draggable onDragStart={(event) => beginDrag(event, { kind: 'stage', sectionId: section.id, subsectionId: sub.id })} onDragEnd={() => setDragging(null)} className="cursor-grab rounded-md p-1 text-mist hover:bg-ink/[0.05] hover:text-ink active:cursor-grabbing" title="جابجایی مرحله با کشیدن"><GripVertical size={14} /></span>}
                {isEditing
                  ? <input autoFocus={section.subsections[0]?.id === sub.id} aria-label="نام مرحله" value={sub.title} className="field h-8 min-w-0 flex-1 px-2 text-xs font-semibold" onChange={(event) => update({ ...section, subsections: section.subsections.map((candidate) => candidate.id === sub.id ? { ...candidate, title: event.target.value } : candidate) })} />
                  : section.subsections.length > 1 && <h4 className="mb-1 text-[9px] font-medium text-mist">{sub.title}</h4>}
                {canEdit && isEditing && <button disabled={saving} onClick={() => onRemoveStage(section.id, sub.id, sub.title)} className="rounded-lg p-1 text-mist hover:bg-rose/10 hover:text-rose" title="حذف مرحله"><Trash2 size={12} /></button>}
              </div>
              <ul className="grid grid-cols-2 grid-flow-row items-start gap-x-3 gap-y-1" dir="rtl">
                {sub.items.map((item, itemIndex) => <li key={`${sub.id}-${itemIndex}`} data-drag-preview onDragOver={(event) => { if (dragging?.kind === 'item' && dragging.sectionId === section.id && dragging.subsectionId === sub.id) event.preventDefault(); }} onDragEnter={(event) => { if (dragging?.kind === 'item') { event.stopPropagation(); moveItemOver(section, sub, itemIndex); } }} onDrop={finishDrop} className={clsx('flex items-center gap-1.5 rounded-md text-[10px] leading-4 text-frost transition-[opacity,background-color] duration-150', dragging?.kind === 'item' && dragging.subsectionId === sub.id && dragging.itemIndex === itemIndex && 'bg-iris/[0.09] opacity-55')}>
                  {isEditing && <span draggable onDragStart={(event) => beginDrag(event, { kind: 'item', sectionId: section.id, subsectionId: sub.id, itemIndex })} onDragEnd={() => setDragging(null)} className="cursor-grab rounded p-0.5 text-mist hover:text-ink active:cursor-grabbing" title="جابجایی گزینه با کشیدن"><GripVertical size={12} /></span>}
                  <Check size={10} className="shrink-0 text-amber" />
                  {isEditing
                    ? <input aria-label={`گزینه ${itemIndex + 1}`} value={item} className="field h-7 min-w-0 flex-1 px-2 text-[11px]" onChange={(event) => update({ ...section, subsections: section.subsections.map((candidate) => candidate.id === sub.id ? { ...candidate, items: candidate.items.map((value, index) => index === itemIndex ? event.target.value : value) } : candidate) })} />
                    : <span className="flex-1">{item}</span>}
                  {canEdit && isEditing && <button disabled={saving} onClick={() => onRemoveItem(section.id, sub.id, itemIndex)} className="shrink-0 rounded p-0.5 text-mist hover:text-rose" title="حذف گزینه"><Trash2 size={10} /></button>}
                </li>)}
                {canEdit && <li className="col-span-2 mt-1"><InlineAdd label="گزینه جدید" placeholder="عنوان گزینه…" compact full disabled={saving} onAdd={(item) => onAddItem(section.id, sub.id, item)} /></li>}
              </ul>
            </div>)}
          </div>
          <Link to={section.to} className="flex shrink-0 items-center justify-between gap-2 border-t border-amber/15 pt-2 text-[9px] text-mist" title={section.output}><span>{section.action}</span><ChevronLeft size={12} /></Link>
        </article>;
      })}
    </div>
  </section>;
}

function DeletePreview({ section, subsection, item, detail }: {
  section: ProductFlowSection;
  subsection?: ProductFlowSubsection;
  item?: string;
  detail: string;
}) {
  const stages = subsection ? [subsection] : section.subsections;

  return <div className="space-y-3 text-right" dir="rtl">
    <div className="rounded-xl border border-rose/30 bg-rose/[0.06] p-3">
      <div className="text-[11px] font-medium text-mist">مسیر مورد انتخاب‌شده</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-lg border border-line/60 bg-ink/[0.04] px-2.5 py-1.5 text-ink">
          بخش: <strong>{section.title}</strong>
        </span>
        {subsection && <>
          <ChevronLeft size={14} className="text-mist" />
          <span className="rounded-lg border border-line/60 bg-ink/[0.04] px-2.5 py-1.5 text-ink">
            مرحله: <strong>{subsection.title}</strong>
          </span>
        </>}
        {item && <>
          <ChevronLeft size={14} className="text-mist" />
          <span className="rounded-lg border border-rose/30 bg-rose/10 px-2.5 py-1.5 font-semibold text-rose">
            گزینه: {item}
          </span>
        </>}
      </div>
    </div>

    {!item && <div className="rounded-xl border border-line/70 bg-ink/[0.025] p-3">
      <div className="mb-2 text-[11px] font-medium text-mist">محتوایی که حذف می‌شود</div>
      <div className="max-h-44 space-y-2 overflow-y-auto pl-1">
        {stages.length ? stages.map((stage) => <div key={stage.id} className="rounded-lg border border-line/50 bg-deep/40 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-ink">مرحله: {stage.title}</span>
            <span className="shrink-0 text-[10px] text-mist">{stage.items.length} گزینه</span>
          </div>
          <div className="mt-1.5 text-[11px] leading-5 text-frost">
            {stage.items.length ? stage.items.join('، ') : 'این مرحله گزینه‌ای ندارد.'}
          </div>
        </div>) : <div className="rounded-lg border border-dashed border-line/60 px-3 py-2 text-[11px] text-mist">این بخش مرحله‌ای ندارد.</div>}
      </div>
    </div>}

    <div className="rounded-xl bg-rose/[0.05] px-3 py-2.5">
      <p className="text-xs leading-6 text-rose">{detail}</p>
      <p className="mt-1 text-[11px] text-mist">این عمل قابل بازگشت نیست.</p>
    </div>
  </div>;
}

function InlineAdd({ label, placeholder, onAdd, disabled, compact, full }: { label: string; placeholder: string; onAdd: (value: string) => void; disabled?: boolean; compact?: boolean; full?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const close = () => { setOpen(false); setValue(''); };
  const submit = () => {
    const clean = value.trim();
    if (!clean) return;
    onAdd(clean);
    close();
  };
  if (!open) return <button disabled={disabled} onClick={() => setOpen(true)} className={clsx('inline-flex items-center justify-center gap-1 border border-dashed border-iris/60 font-medium text-iris hover:bg-iris/10 disabled:opacity-50', compact ? 'rounded-lg px-2 py-1 text-[10px]' : 'rounded-xl px-3 py-2 text-xs', full && 'w-full')}><Plus size={compact ? 11 : 15} />{label}</button>;
  return <div className={clsx('flex items-center gap-1', full && 'w-full')}>
    <input autoFocus value={value} placeholder={placeholder} className={clsx('field min-w-0 flex-1', compact ? 'h-7 px-2 py-1 text-[10px]' : 'h-9')} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') close(); }} />
    <button onClick={submit} disabled={!value.trim() || disabled} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint/15 text-mint disabled:opacity-40" title="ثبت"><Check size={13} /></button>
    <button onClick={close} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-mist" title="لغو"><X size={13} /></button>
  </div>;
}

function FlowEditor({ sections, onChange, focused, onFocus }: { sections: ProductFlowSection[]; onChange: (sections: ProductFlowSection[]) => void; focused: string | null; onFocus: (id: string | null) => void }) {
  const updateSection = (index: number, patch: Partial<ProductFlowSection>) => onChange(sections.map((s, i) => i === index ? { ...s, ...patch } : s));
  const addSection = () => {
    const section = { id: `section_${Date.now().toString(36)}`, title: 'بخش جدید', owner: '', description: '', output: '', color: '#779BE7', icon: 'production' as const, to: '/production/work-orders', action: 'مشاهده بخش', subsections: [] };
    onChange([...sections, section]); onFocus(section.id);
  };
  const visible = sections.map((section, sectionIndex) => ({ section, sectionIndex })).filter(({ section }) => !focused || section.id === focused);
  return <div className="space-y-4">
    <div className="glass flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="text-sm font-semibold text-ink">{focused ? `ویرایش بخش «${sections.find((s) => s.id === focused)?.title ?? ''}»` : 'طراحی ساختار فرآیند'}</h2><p className="mt-1 text-xs text-mist">مرحله‌ها و گزینه‌های اجرایی هر مرحله را دستی کم یا زیاد کنید.</p></div><div className="flex gap-2">{focused && <Button variant="ghost" onClick={() => onFocus(null)}>نمایش همه بخش‌ها</Button>}<Button variant="action" icon={Plus} onClick={addSection}>افزودن بخش اصلی</Button></div></div>
    {visible.map(({ section, sectionIndex }) => <Card key={section.id} title={`بخش ${sectionIndex + 1}: ${section.title}`} icon={PRODUCT_FLOW_ICONS[section.icon]} actions={<div className="flex"><Button size="sm" variant="ghost" icon={ArrowUp} disabled={sectionIndex === 0} onClick={() => onChange(move(sections, sectionIndex, -1))} /><Button size="sm" variant="ghost" icon={ArrowDown} disabled={sectionIndex === sections.length - 1} onClick={() => onChange(move(sections, sectionIndex, 1))} /><Button size="sm" variant="ghost" icon={Trash2} onClick={() => { onChange(sections.filter((_, i) => i !== sectionIndex)); onFocus(null); }} /></div>}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="عنوان بخش"><Input value={section.title} onChange={(e) => updateSection(sectionIndex, { title: e.target.value })} /></Field><Field label="مسئول"><Input value={section.owner} onChange={(e) => updateSection(sectionIndex, { owner: e.target.value })} /></Field><Field label="نوع / آیکن"><Select value={section.icon} onChange={(e) => updateSection(sectionIndex, { icon: e.target.value as ProductFlowSection['icon'] })}>{Object.entries(ICON_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
        <Field label="شرح بخش" className="md:col-span-2"><Textarea value={section.description} onChange={(e) => updateSection(sectionIndex, { description: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="رنگ"><Input type="color" className="h-10 p-1" value={section.color} onChange={(e) => updateSection(sectionIndex, { color: e.target.value })} /></Field><Field label="عنوان دکمه"><Input value={section.action} onChange={(e) => updateSection(sectionIndex, { action: e.target.value })} /></Field></div><Field label="خروجی بخش"><Input value={section.output} onChange={(e) => updateSection(sectionIndex, { output: e.target.value })} /></Field><Field label="مسیر صفحه"><Input className="ltr" value={section.to} onChange={(e) => updateSection(sectionIndex, { to: e.target.value })} /></Field>
      </div>
      <div className="mt-5 border-t border-line/60 pt-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-ink">مراحل این بخش</h3><p className="mt-1 text-[11px] text-mist">هر مرحله شامل گزینه‌ها و کارهای لازم خودش است.</p></div><Button size="sm" variant="outline" icon={Plus} onClick={() => updateSection(sectionIndex, { subsections: [...section.subsections, { id: `sub_${Date.now().toString(36)}`, title: 'مرحله جدید', items: [] }] })}>افزودن مرحله</Button></div><div className="space-y-3">{section.subsections.map((sub, subIndex) => <SubsectionEditor key={sub.id} subsection={sub} onChange={(next) => updateSection(sectionIndex, { subsections: section.subsections.map((s, i) => i === subIndex ? next : s) })} onDelete={() => updateSection(sectionIndex, { subsections: section.subsections.filter((_, i) => i !== subIndex) })} />)}{!section.subsections.length && <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-mist">هنوز مرحله‌ای تعریف نشده است.</p>}</div></div>
    </Card>)}
  </div>;
}

function SubsectionEditor({ subsection, onChange, onDelete }: { subsection: ProductFlowSubsection; onChange: (sub: ProductFlowSubsection) => void; onDelete: () => void }) {
  return <div className="rounded-xl border border-line/60 bg-ink/[0.025] p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-mist">نام مرحله</span><Input className="max-w-sm" value={subsection.title} onChange={(e) => onChange({ ...subsection, title: e.target.value })} /><Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete}>حذف مرحله</Button></div><div className="mt-3 space-y-2"><div className="text-[11px] font-medium text-mist">گزینه‌ها / کارهای این مرحله</div>{subsection.items.map((item, itemIndex) => <div key={itemIndex} className="flex items-center gap-2"><Input value={item} onChange={(e) => onChange({ ...subsection, items: subsection.items.map((x, i) => i === itemIndex ? e.target.value : x) })} /><Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange({ ...subsection, items: subsection.items.filter((_, i) => i !== itemIndex) })} /></div>)}<Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange({ ...subsection, items: [...subsection.items, 'گزینه جدید'] })}>افزودن گزینه</Button></div></div>;
}
