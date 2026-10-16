import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  FileText, FilePlus2, FileImage, X, ChevronRight, ChevronLeft, Download, Pencil, Trash2, Paperclip, Upload, ZoomIn, ZoomOut, Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { ATTACHMENT_KINDS } from '@shared/defaults';
import { del, fetchBlob, put, uploadAttachment } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { compressImage, pdfThumbnail, renderPdfPages, shareOrDownload } from '../lib/pdf';
import { date, money, num } from '../lib/format';
import { Button, Card, Field, Input, Modal, MoneyInput, Pill, Select, Textarea, useConfirm } from './ui';
import { DateInput } from './inputs';

export interface DocLink { id: string; label: string }
type Side = 'sales' | 'purchase';
interface Scope { contactId?: string; orderId?: string; supplierId?: string; poId?: string }

const KIND_COLORS: Record<string, string> = {
  sales_invoice: '#0FD69D', proforma: '#9DB4C0', contract: '#B48CF2', purchase_invoice: '#F5B85A', receipt: '#5EC8E5', payment: '#779BE7', other: '#C2DFE3',
};
const kindsFor = (side: Side) => Object.entries(ATTACHMENT_KINDS).filter(([, k]) => k.side === side || k.side === 'any');
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

function scopeQuery(scope: Scope) {
  const [key, value] = Object.entries(scope).find(([, v]) => !!v) ?? [];
  return key ? `/attachments?${key}=${encodeURIComponent(value!)}` : null;
}

/* ───────────────────────── Thumbnails (cached per document) ───────────────────────── */

const thumbCache = new Map<string, Promise<string>>();
function thumbnailOf(doc: any): Promise<string> {
  if (!thumbCache.has(doc.id)) {
    thumbCache.set(doc.id, (async () => {
      const blob = await fetchBlob(`/attachments/${doc.id}/file`);
      if (doc.mime === 'application/pdf') return pdfThumbnail(await blob.arrayBuffer());
      return URL.createObjectURL(blob);
    })().catch(() => { thumbCache.delete(doc.id); return ''; }));
  }
  return thumbCache.get(doc.id)!;
}

function Thumb({ doc, className }: { doc: any; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    thumbnailOf(doc).then((s) => alive && setSrc(s));
    return () => { alive = false; };
  }, [doc]);
  const Icon = doc.mime === 'application/pdf' ? FileText : FileImage;
  return (
    <div className={clsx('relative overflow-hidden bg-white/[0.06]', className)}>
      {src
        ? <img src={src} alt="" className="h-full w-full object-cover object-top" draggable={false} />
        : <div className="flex h-full w-full items-center justify-center text-mist"><Icon size={26} /></div>}
      {doc.mime === 'application/pdf' && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[#1C272B]/90 px-1.5 py-0.5 text-[9.5px] font-bold text-rose">PDF</span>}
    </div>
  );
}

/* ───────────────────────── Card: the documents of a record ───────────────────────── */

/**
 * Invoices, receipts and other paperwork of a customer (side "sales") or a supplier
 * (side "purchase"). `links` lets a document be tied to one of its orders / POs.
 */
export function DocumentsCard({ scope, side, links = [], linkLabel = 'سفارش', title = 'فاکتورها و اسناد', subtitle, compact }: {
  scope: Scope; side: Side; links?: DocLink[]; linkLabel?: string; title?: string; subtitle?: ReactNode; compact?: boolean;
}) {
  const path = scopeQuery(scope);
  const { data = [] } = useApi<any[]>(path);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const total = data.reduce((s, d) => s + (d.amount ?? 0), 0);
  const { settings } = useSession();

  return (
    <Card
      title={title}
      subtitle={subtitle ?? (data.length ? `${num(data.length)} سند${total ? ` · جمع مبالغ ${money(total, settings.company.currency)}` : ''}` : side === 'sales' ? 'فاکتور کتبی، قرارداد یا رسید را به‌صورت عکس یا PDF اضافه کنید' : 'فاکتور خرید، رسید یا حواله را به‌صورت عکس یا PDF اضافه کنید')}
      icon={Paperclip}
      actions={<Button size="sm" variant="action" icon={FilePlus2} onClick={() => setAdding(true)}>افزودن سند</Button>}
    >
      {data.length === 0 ? (
        <button type="button" onClick={() => setAdding(true)}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-7 text-center text-sm text-mist transition hover:border-iris/60 hover:text-ink">
          <Upload size={22} />
          <span>{side === 'sales' ? 'عکس یا PDF فاکتور فروش را اینجا اضافه کنید' : 'عکس یا PDF فاکتور خرید / رسید را اینجا اضافه کنید'}</span>
          <span className="text-[11px]">می‌توانید چند فایل را با هم انتخاب کنید</span>
        </button>
      ) : (
        <div className={clsx('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
          {data.map((d, i) => (
            <button key={d.id} type="button" onClick={() => setViewing(i)}
              className="group overflow-hidden rounded-2xl border border-line/70 bg-deep/50 text-right transition hover:border-iris/60 active:scale-[0.98]">
              <Thumb doc={d} className="aspect-[4/3] w-full" />
              <div className="space-y-1 p-2.5">
                <div className="flex items-center justify-between gap-1.5">
                  <Pill color={KIND_COLORS[d.kind]}>{ATTACHMENT_KINDS[d.kind]?.label ?? 'سند'}</Pill>
                  {d.docNumber && <span className="ltr truncate text-[11px] text-mist">#{d.docNumber}</span>}
                </div>
                <div className="truncate text-[12.5px] font-semibold text-ink">{d.title || d.fileName}</div>
                <div className="flex items-center justify-between gap-1.5 text-[11px] text-mist">
                  <span>{date(d.docDate ?? d.createdAt)}</span>
                  {d.amount != null && <span className="num font-semibold text-frost">{money(d.amount, settings.company.currency)}</span>}
                </div>
                {(d.orderNumber || d.poNumber) && <div className="ltr truncate text-right text-[10.5px] text-iris">{d.orderNumber || d.poNumber}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
      <DocumentForm open={adding} onClose={() => setAdding(false)} scope={scope} side={side} links={links} linkLabel={linkLabel} />
      <DocumentForm open={!!editing} doc={editing} onClose={() => setEditing(null)} scope={scope} side={side} links={links} linkLabel={linkLabel} />
      {viewing !== null && data[viewing] && (
        <DocumentViewer docs={data} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)}
          onEdit={(d) => setEditing(d)} />
      )}
    </Card>
  );
}

/* ───────────────────────── Upload / edit form ───────────────────────── */

function DocumentForm({ open, onClose, doc, scope, side, links, linkLabel }: {
  open: boolean; onClose: () => void; doc?: any; scope: Scope; side: Side; links: DocLink[]; linkLabel: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState<string | null>(null);
  const editing = !!doc;
  const linkKey = side === 'sales' ? 'orderId' : 'poId';

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setF(doc
      ? { kind: doc.kind, title: doc.title, docNumber: doc.docNumber, docDate: doc.docDate, amount: doc.amount, note: doc.note, [linkKey]: doc[linkKey] ?? '' }
      : { kind: side === 'sales' ? 'sales_invoice' : 'purchase_invoice', docDate: null, amount: null, [linkKey]: scope.orderId ?? scope.poId ?? '' });
  }, [open, doc, side, linkKey, scope.orderId, scope.poId]);

  const save = useAction(() => put(`/attachments/${doc.id}`, { ...f, [linkKey]: f[linkKey] || null }), { success: 'سند به‌روز شد', onSuccess: onClose });

  const upload = async () => {
    if (!files.length) return;
    let done = 0;
    try {
      for (const file of files) {
        setBusy(files.length > 1 ? `در حال ارسال ${num(done + 1)} از ${num(files.length)}…` : 'در حال ارسال…');
        const body = await compressImage(file);
        await uploadAttachment(body, {
          ...scope, ...f, [linkKey]: f[linkKey] || scope.orderId || scope.poId || null,
          fileName: body === file ? file.name : file.name.replace(/\.\w+$/, '') + '.jpg',
          mime: body === file ? file.type : 'image/jpeg',
          title: f.title || (files.length > 1 ? file.name.replace(/\.\w+$/, '') : f.title),
        });
        done++;
      }
      toast(files.length > 1 ? `${num(files.length)} سند اضافه شد` : 'سند اضافه شد', 'success');
      qc.invalidateQueries();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
      if (done) qc.invalidateQueries();
    } finally {
      setBusy(null);
    }
  };

  const tooBig = files.find((x) => x.type === 'application/pdf' && x.size > 20 * 1024 * 1024);
  return (
    <Modal open={open} onClose={onClose} icon={editing ? Pencil : FilePlus2} size="md"
      title={editing ? 'ویرایش مشخصات سند' : side === 'sales' ? 'افزودن فاکتور / سند فروش' : 'افزودن فاکتور خرید / رسید'}
      subtitle={editing ? doc.fileName : 'عکس (دوربین گوشی) یا فایل PDF — چند فایل هم‌زمان مجاز است'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        {editing
          ? <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</Button>
          : <Button variant="primary" icon={Upload} loading={!!busy} disabled={!files.length || !!tooBig} onClick={upload}>{busy ?? (files.length > 1 ? `ثبت ${num(files.length)} سند` : 'ثبت سند')}</Button>}
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <div className="sm:col-span-2">
            <input ref={fileInput} type="file" accept={ACCEPT} multiple className="hidden"
              onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileInput.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-iris/50 bg-iris/[0.06] px-4 py-5 text-sm font-semibold text-iris transition hover:bg-iris/10">
              <Upload size={18} />{files.length ? 'افزودن فایل دیگر' : 'انتخاب عکس یا PDF'}
            </button>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((file, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-xl bg-ink/[0.04] px-3 py-2 text-xs">
                    {file.type === 'application/pdf' ? <FileText size={15} className="shrink-0 text-rose" /> : <FileImage size={15} className="shrink-0 text-sky" />}
                    <span className="ltr min-w-0 flex-1 truncate text-right text-frost">{file.name}</span>
                    <span className="num shrink-0 text-mist">{num(file.size / 1024 / 1024, 1)} MB</span>
                    <button type="button" className="text-mist hover:text-rose" aria-label="حذف از لیست" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            {tooBig && <p className="mt-2 text-xs text-rose">حجم PDF «{tooBig.name}» بیش از ۲۰ مگابایت است.</p>}
          </div>
        )}
        <Field label="نوع سند">
          <Select value={f.kind ?? ''} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {kindsFor(side).map(([key, k]) => <option key={key} value={key}>{k.label}</option>)}
          </Select>
        </Field>
        <Field label="شماره فاکتور / سند"><Input className="ltr" value={f.docNumber ?? ''} onChange={(e) => setF({ ...f, docNumber: e.target.value })} placeholder="اختیاری" /></Field>
        <Field label="تاریخ سند"><DateInput value={f.docDate} onChange={(v) => setF({ ...f, docDate: v })} /></Field>
        <Field label="مبلغ"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} placeholder="اختیاری" /></Field>
        {links.length > 0 && (
          <Field label={`مربوط به ${linkLabel}`} className="sm:col-span-2">
            <Select value={f[linkKey] ?? ''} onChange={(e) => setF({ ...f, [linkKey]: e.target.value })}>
              <option value="">— بدون اتصال —</option>
              {links.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="عنوان" className="sm:col-span-2"><Input value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: فاکتور دستی خرید ۲ دستگاه" /></Field>
        <Field label="یادداشت" className="sm:col-span-2"><Textarea className="min-h-[60px]" value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Full-screen viewer ───────────────────────── */

export function DocumentViewer({ docs, index, onIndex, onClose, onEdit }: {
  docs: any[]; index: number; onIndex: (i: number) => void; onClose: () => void; onEdit?: (d: any) => void;
}) {
  const doc = docs[index];
  const { settings } = useSession();
  const confirm = useConfirm();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const pagesBox = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const imageUrl = useMemo(() => (blob && doc.mime !== 'application/pdf' ? URL.createObjectURL(blob) : ''), [blob, doc.mime]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  useEffect(() => {
    let alive = true;
    setBlob(null); setError(''); setZoom(1);
    fetchBlob(`/attachments/${doc.id}/file`).then((b) => alive && setBlob(b)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [doc.id]);

  // PDFs: every page drawn by pdf.js (works on phones, which cannot show PDFs inline).
  useEffect(() => {
    const box = pagesBox.current;
    if (!blob || doc.mime !== 'application/pdf' || !box) return;
    let cancelled = false;
    setRendering(true);
    box.replaceChildren();
    const base = Math.min(box.clientWidth || 800, 1000);
    blob.arrayBuffer()
      .then((data) => renderPdfPages(data, base * zoom, () => cancelled))
      .then((pages) => {
        if (cancelled) return;
        pages.forEach((c) => {
          c.className = 'mx-auto mb-3 block rounded-md bg-white shadow-xl';
          c.style.width = `${Math.round(base * zoom)}px`;
          c.style.maxWidth = zoom <= 1 ? '100%' : 'none';
          box.appendChild(c);
        });
      })
      .catch(() => !cancelled && setError('نمایش این PDF ممکن نشد؛ آن را دانلود کنید.'))
      .finally(() => !cancelled && setRendering(false));
    return () => { cancelled = true; };
  }, [blob, doc.mime, zoom]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowLeft' && index < docs.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; };
  }, [index, docs.length, onClose, onIndex]);

  const remove = useAction(() => del(`/attachments/${doc.id}`), {
    success: 'سند حذف شد',
    onSuccess: () => { thumbCache.delete(doc.id); if (docs.length <= 1) onClose(); else onIndex(Math.max(0, index - 1)); },
  });

  const kind = ATTACHMENT_KINDS[doc.kind]?.label ?? 'سند';
  const meta = [doc.docNumber && `شماره ${doc.docNumber}`, date(doc.docDate ?? doc.createdAt), doc.amount != null && money(doc.amount, settings.company.currency)].filter(Boolean).join(' · ');

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex flex-col bg-[#0b1113]/95 backdrop-blur-md" role="dialog" aria-modal="true">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] md:px-5">
        <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink" aria-label="بستن"><X size={19} /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Pill color={KIND_COLORS[doc.kind]}>{kind}</Pill>
            <span className="truncate text-sm font-bold text-ink">{doc.title || doc.fileName}</span>
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-mist">
            {meta}
            {doc.orderNumber && <> · <Link className="ltr text-iris" to={`/sales/orders/${doc.orderId}`} onClick={onClose}>{doc.orderNumber}</Link></>}
            {doc.poNumber && <> · <Link className="ltr text-iris" to={`/scm/purchase-orders/${doc.poId}`} onClick={onClose}>{doc.poNumber}</Link></>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ToolButton label="کوچک‌نمایی" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><ZoomOut size={17} /></ToolButton>
          <ToolButton label="بزرگ‌نمایی" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}><ZoomIn size={17} /></ToolButton>
          <ToolButton label="دانلود" onClick={() => blob && shareOrDownload(blob, doc.fileName, false)}><Download size={17} /></ToolButton>
          {onEdit && <ToolButton label="ویرایش مشخصات" onClick={() => onEdit(doc)}><Pencil size={16} /></ToolButton>}
          <ToolButton label="حذف" danger onClick={async () => {
            if (await confirm({ title: 'حذف سند', body: `«${doc.title || doc.fileName}» برای همیشه حذف شود؟`, danger: true, confirm: 'حذف' })) remove.mutate(undefined);
          }}><Trash2 size={16} /></ToolButton>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-2 py-4 md:px-8">
        {error && <p className="mx-auto mt-10 max-w-sm rounded-xl bg-rose/10 px-4 py-3 text-center text-sm text-rose">{error}</p>}
        {!blob && !error && <div className="flex h-full items-center justify-center text-mist"><Loader2 className="animate-spin" size={26} /></div>}
        {imageUrl && (
          <img src={imageUrl} alt={doc.title || doc.fileName} draggable={false}
            onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
            className="mx-auto block rounded-md shadow-2xl"
            style={zoom === 1 ? { maxWidth: '100%', maxHeight: 'calc(100dvh - 140px)', objectFit: 'contain' } : { width: `${zoom * 100}%`, maxWidth: 'none' }} />
        )}
        <div ref={pagesBox} className={clsx(doc.mime !== 'application/pdf' && 'hidden')} />
        {rendering && <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center"><span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-ink"><Loader2 size={14} className="animate-spin" />در حال آماده‌سازی صفحات…</span></div>}
        {doc.note && <p className="mx-auto mt-3 max-w-2xl rounded-xl bg-white/[0.06] px-4 py-3 text-sm leading-7 text-frost">{doc.note}</p>}
      </div>

      {docs.length > 1 && (
        <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">
          <ToolButton label="قبلی" disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronRight size={20} /></ToolButton>
          <span className="num text-xs text-mist">{num(index + 1)} از {num(docs.length)}</span>
          <ToolButton label="بعدی" disabled={index >= docs.length - 1} onClick={() => onIndex(index + 1)}><ChevronLeft size={20} /></ToolButton>
        </footer>
      )}
    </div>,
    document.body,
  );
}

function ToolButton({ label, onClick, children, danger, disabled }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={clsx('flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-30',
        danger ? 'text-rose hover:bg-rose/15' : 'text-frost hover:bg-white/10')}>
      {children}
    </button>
  );
}
