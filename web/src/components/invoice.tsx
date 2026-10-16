import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, ReceiptText, Download, Share2, Printer, Pencil, Check } from 'lucide-react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import type { InvoiceSettings } from '@shared/defaults';
import { post, put, uploadAttachment } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useIsMobile } from '../lib/media';
import { useToast } from '../lib/toast';
import { elementToPdf, shareOrDownload } from '../lib/pdf';
import { date } from '../lib/format';
import { Button, Field, Input, Modal, Spinner, Textarea, Toggle } from './ui';

export type InvoiceKind = 'proforma' | 'invoice';

/* ───────────────────────── Persian helpers ───────────────────────── */

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد'];

function threeDigits(n: number) {
  const parts: string[] = [];
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]);
  const rest = n % 100;
  if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) parts.push(ONES[rest % 10]);
  } else if (rest >= 10) parts.push(TEENS[rest - 10]);
  else if (rest) parts.push(ONES[rest]);
  return parts.join(' و ');
}

/** 1250000 → «یک میلیون و دویست و پنجاه هزار» */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (!n) return 'صفر';
  const groups: string[] = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) groups.unshift(`${threeDigits(g)}${SCALES[i] ? ` ${SCALES[i]}` : ''}`);
  }
  return groups.join(' و ');
}

const fa = (n: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(n);

/** Replaces {شماره} {تاریخ} {مشتری} {مبلغ_کل} {مانده} {اعتبار_روز} in template text. */
export function fillTemplate(text: string, vars: Record<string, string>) {
  return (text ?? '').replace(/\{([^{}]+)\}/g, (all, key: string) => vars[key.trim()] ?? all);
}

/* ───────────────────────── Data ───────────────────────── */

interface Buyer { billingName: string; economicCode: string; nationalId: string; postalCode: string; billingAddress: string; billingPhone: string }

function defaultBuyer(doc: any): Buyer {
  const saved = doc.contact?.attrs?.billing ?? {};
  const a = doc.address;
  const phone = doc.person?.phones?.[0]?.value ?? doc.contact?.phones?.[0]?.value ?? doc.contact?.phones?.[0] ?? '';
  return {
    billingName: saved.billingName || doc.contact?.name || '',
    economicCode: saved.economicCode || '',
    nationalId: saved.nationalId || '',
    postalCode: saved.postalCode || a?.postalCode || '',
    billingAddress: saved.billingAddress || (a ? [a.province, a.county, a.address].filter(Boolean).join('، ') : ''),
    billingPhone: saved.billingPhone || (typeof phone === 'string' ? phone : ''),
  };
}

function totalsOf(doc: any) {
  const rows = doc.lines.map((l: any) => {
    const gross = l.qty * l.unitPrice;
    const off = Math.round(gross * (l.discountPct ?? 0) / 100);
    return { ...l, gross, off, net: gross - off };
  });
  const net = rows.reduce((s: number, r: any) => s + r.net, 0);
  const o = doc.order;
  const afterDiscount = Math.max(0, net - (o.discount ?? 0));
  const total = o.total ?? Math.round(afterDiscount * (1 + (o.taxRate ?? 0) / 100));
  return { rows, gross: rows.reduce((s: number, r: any) => s + r.gross, 0), lineOff: rows.reduce((s: number, r: any) => s + r.off, 0), net, discount: o.discount ?? 0, tax: total - afterDiscount, total, paid: o.paid ?? 0 };
}

/* ───────────────────────── The printable A4 page ───────────────────────── */

const PAGE_W = 794;

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#cfd8dc]">
      <h3 className="bg-[#eef3f5] px-3 py-1.5 text-[11.5px] font-bold text-[#253237]">{title}</h3>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 px-3 py-2.5 text-[11px] leading-5 text-[#253237]">{children}</div>
    </section>
  );
}
function Item({ label, value, wide, ltr }: { label: string; value?: string | null; wide?: boolean; ltr?: boolean }) {
  return (
    <div className={clsx('flex min-w-0 gap-1.5', wide && 'col-span-3')}>
      <span className="shrink-0 text-[#5c6b73]">{label}:</span>
      <span className={clsx('min-w-0 font-semibold', ltr && value && 'ltr')}>{value?.trim() ? value : '—'}</span>
    </div>
  );
}

export function InvoicePage({ doc, kind, number, issuedAt, buyer, pageRef }: {
  doc: any; kind: InvoiceKind; number: string; issuedAt: number; buyer: Buyer; pageRef?: React.Ref<HTMLDivElement>;
}) {
  const inv: InvoiceSettings = doc.invoice;
  const cur = doc.company.currency;
  const t = totalsOf(doc);
  const validUntil = issuedAt + (inv.proformaValidityDays || 0) * 86_400_000;
  const vars = {
    'شماره': number, 'تاریخ': date(issuedAt), 'مشتری': buyer.billingName, 'مبلغ_کل': `${fa(t.total)} ${cur}`,
    'مانده': `${fa(Math.max(0, t.total - t.paid))} ${cur}`, 'اعتبار_روز': fa(inv.proformaValidityDays || 0),
  };
  const terms = fillTemplate(kind === 'proforma' ? inv.proformaTerms : inv.invoiceTerms, vars);
  const seller = inv.sellerName || doc.company.name;
  const money = (v: number) => fa(v);

  return (
    <div ref={pageRef} dir="rtl" className="relative bg-white text-[#1d2a2f]" style={{ width: PAGE_W, minHeight: 1123, padding: '34px 36px 28px', fontFamily: 'IRANSansX, Vazirmatn, Tahoma, sans-serif' }}>
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#253237] pb-4">
        <div className="flex w-[240px] items-center gap-3">
          <img src="/brand.svg" alt="" className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold leading-6 text-[#253237]">{seller}</div>
            {inv.website && <div className="ltr text-right text-[10.5px] text-[#5c6b73]">{inv.website}</div>}
          </div>
        </div>
        <div className="flex-1 pt-1 text-center">
          <h1 className="text-[19px] font-extrabold text-[#253237]">{kind === 'proforma' ? inv.proformaTitle || 'پیش‌فاکتور' : inv.invoiceTitle || 'فاکتور فروش'}</h1>
          {kind === 'proforma' && <div className="mt-1 text-[10.5px] text-[#5c6b73]">این سند پیش‌فاکتور است و ارزش فاکتور فروش ندارد</div>}
        </div>
        <div className="w-[200px] rounded-[10px] border border-[#cfd8dc] px-3 py-2 text-[11px] leading-6">
          <div className="flex justify-between"><span className="text-[#5c6b73]">شماره:</span><b className="ltr">{number || '—'}</b></div>
          <div className="flex justify-between"><span className="text-[#5c6b73]">تاریخ:</span><b>{date(issuedAt)}</b></div>
          {kind === 'proforma'
            ? inv.proformaValidityDays > 0 && <div className="flex justify-between"><span className="text-[#5c6b73]">معتبر تا:</span><b>{date(validUntil)}</b></div>
            : <div className="flex justify-between"><span className="text-[#5c6b73]">شماره سفارش:</span><b className="ltr">{doc.order.number}</b></div>}
        </div>
      </header>

      <div className="mt-4 space-y-3">
        <Box title="مشخصات فروشنده">
          <Item label="نام" value={seller} />
          <Item label="شماره اقتصادی" value={inv.economicCode} ltr />
          <Item label="شناسه ملی" value={inv.nationalId} ltr />
          <Item label="شماره ثبت" value={inv.registrationNo} ltr />
          <Item label="کد پستی" value={inv.postalCode} ltr />
          <Item label="تلفن" value={inv.phone} ltr />
          <Item label="نشانی" value={inv.address} wide />
        </Box>
        <Box title="مشخصات خریدار">
          <Item label="نام" value={buyer.billingName} />
          <Item label="شماره اقتصادی" value={buyer.economicCode} ltr />
          <Item label="شناسه / کد ملی" value={buyer.nationalId} ltr />
          <Item label="کد پستی" value={buyer.postalCode} ltr />
          <Item label="تلفن" value={buyer.billingPhone} ltr />
          <Item label="نشانی" value={buyer.billingAddress} wide />
        </Box>
      </div>

      {/* Lines */}
      <table className="mt-4 w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-[#253237] text-white">
            {['ردیف', 'شرح کالا یا خدمات', 'تعداد', 'واحد', `مبلغ واحد (${cur})`, `مبلغ کل (${cur})`, 'تخفیف', `پس از تخفیف (${cur})`].map((h, i) => (
              <th key={h} className={clsx('border border-[#253237] px-2 py-2 font-bold', i === 1 ? 'text-right' : 'text-center')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r: any, i: number) => (
            <tr key={i} className={i % 2 ? 'bg-[#f6f9fa]' : 'bg-white'}>
              <td className="border border-[#cfd8dc] px-2 py-2 text-center">{fa(i + 1)}</td>
              <td className="border border-[#cfd8dc] px-2 py-2">
                <div className="font-semibold">{r.itemName}</div>
                {(r.description || r.sku) && <div className="text-[9.5px] text-[#5c6b73]">{r.description || <span className="ltr">{r.sku}</span>}</div>}
              </td>
              <td className="border border-[#cfd8dc] px-2 py-2 text-center">{fa(r.qty)}</td>
              <td className="border border-[#cfd8dc] px-2 py-2 text-center">{r.itemUnit || 'عدد'}</td>
              <td className="border border-[#cfd8dc] px-2 py-2 text-center">{money(r.unitPrice)}</td>
              <td className="border border-[#cfd8dc] px-2 py-2 text-center">{money(r.gross)}</td>
              <td className="border border-[#cfd8dc] px-2 py-2 text-center">{r.off ? money(r.off) : '—'}</td>
              <td className="border border-[#cfd8dc] px-2 py-2 text-center font-semibold">{money(r.net)}</td>
            </tr>
          ))}
          {t.rows.length === 0 && <tr><td colSpan={8} className="border border-[#cfd8dc] px-2 py-6 text-center text-[#5c6b73]">بدون ردیف</td></tr>}
        </tbody>
      </table>

      {/* Totals + words */}
      <div className="mt-3 flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-2.5 text-[11px] leading-6">
          <div className="rounded-[10px] bg-[#eef3f5] px-3 py-2">
            <span className="text-[#5c6b73]">مبلغ قابل پرداخت به حروف: </span>
            <b>{numberToWords(t.total)} {cur}</b>
          </div>
          {terms && <div className="whitespace-pre-line px-1 text-[10.5px] text-[#37474f]">{terms}</div>}
          {inv.bankInfo && <div className="whitespace-pre-line rounded-[10px] border border-dashed border-[#cfd8dc] px-3 py-2 text-[10.5px]"><b className="text-[#253237]">اطلاعات پرداخت: </b>{inv.bankInfo}</div>}
        </div>
        <table className="w-[270px] shrink-0 border-collapse text-[11px]">
          <tbody>
            {[
              ['جمع کل', t.gross],
              ...(t.lineOff ? [['تخفیف ردیف‌ها', -t.lineOff]] : []),
              ...(t.discount ? [['تخفیف فاکتور', -t.discount]] : []),
              ...(t.tax ? [[`مالیات و عوارض (${fa(doc.order.taxRate)}٪)`, t.tax]] : []),
            ].map(([label, v]) => (
              <tr key={label as string}>
                <td className="border border-[#cfd8dc] bg-[#f6f9fa] px-2.5 py-1.5 text-[#5c6b73]">{label}</td>
                <td className="border border-[#cfd8dc] px-2.5 py-1.5 text-left font-semibold">{(v as number) < 0 ? `(${money(-(v as number))})` : money(v as number)}</td>
              </tr>
            ))}
            <tr className="bg-[#253237] text-white">
              <td className="border border-[#253237] px-2.5 py-2 font-bold">مبلغ قابل پرداخت</td>
              <td className="border border-[#253237] px-2.5 py-2 text-left text-[12.5px] font-extrabold">{money(t.total)} <span className="text-[9.5px] font-normal">{cur}</span></td>
            </tr>
            {kind === 'invoice' && t.paid > 0 && <>
              <tr>
                <td className="border border-[#cfd8dc] bg-[#f6f9fa] px-2.5 py-1.5 text-[#5c6b73]">پرداخت‌شده</td>
                <td className="border border-[#cfd8dc] px-2.5 py-1.5 text-left font-semibold">{money(t.paid)}</td>
              </tr>
              <tr>
                <td className="border border-[#cfd8dc] bg-[#f6f9fa] px-2.5 py-1.5 font-bold">مانده</td>
                <td className="border border-[#cfd8dc] px-2.5 py-1.5 text-left font-extrabold">{money(Math.max(0, t.total - t.paid))}</td>
              </tr>
            </>}
          </tbody>
        </table>
      </div>

      {inv.showSignatures && (
        <div className="mt-8 grid grid-cols-2 gap-6 text-center text-[11px] text-[#5c6b73]">
          <div className="rounded-[10px] border border-[#cfd8dc] px-3 pb-12 pt-2">مهر و امضای فروشنده</div>
          <div className="rounded-[10px] border border-[#cfd8dc] px-3 pb-12 pt-2">مهر و امضای خریدار</div>
        </div>
      )}
      {inv.footer && <footer className="mt-6 border-t border-[#cfd8dc] pt-2 text-center text-[10.5px] text-[#5c6b73]">{fillTemplate(inv.footer, vars)}</footer>}
    </div>
  );
}

/* ───────────────────────── Dialog: preview, buyer details, PDF ───────────────────────── */

/** Builds the proforma or sales invoice of an order as a PDF to download or share. */
export function InvoiceDialog({ orderId, kind, open, onClose }: { orderId: string; kind: InvoiceKind; open: boolean; onClose: () => void }) {
  const { data: doc } = useApi<any>(open ? `/orders/${orderId}/document` : null);
  const mobile = useIsMobile();
  const toast = useToast();
  const qc = useQueryClient();
  const page = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [editBuyer, setEditBuyer] = useState(false);
  const [number, setNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState(Date.now());
  const [keepCopy, setKeepCopy] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [scale, setScale] = useState(0.5);
  const [pageH, setPageH] = useState(1123);
  const saved = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !doc) return;
    setBuyer(defaultBuyer(doc));
    setEditBuyer(false);
    saved.current = null;
    if (kind === 'invoice') { setNumber(doc.order.invoiceNumber ?? ''); setIssuedAt(doc.order.invoicedAt ?? Date.now()); }
    else { setNumber(doc.order.number); setIssuedAt(Date.now()); }
  }, [open, doc, kind]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => { setScale(Math.min(1, (el.clientWidth - 2) / PAGE_W)); setPageH(page.current?.offsetHeight ?? 1123); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, buyer, number]);

  const build = async (): Promise<{ blob: Blob; name: string } | null> => {
    if (!doc || !buyer || !page.current) return null;
    let no = number;
    try {
      // Remember the buyer's details for the next invoice of this customer.
      const before = JSON.stringify(defaultBuyer({ ...doc, contact: { ...doc.contact, attrs: { billing: doc.contact?.attrs?.billing ?? {} } } }));
      if (JSON.stringify(buyer) !== before) await put(`/contacts/${doc.contact.id}/billing`, buyer);
      if (kind === 'invoice' && !no) {
        setBusy('صدور شماره فاکتور…');
        const r = await post<{ invoiceNumber: string; invoicedAt: number }>(`/orders/${orderId}/invoice-number`);
        no = r.invoiceNumber;
        setNumber(r.invoiceNumber);
        setIssuedAt(r.invoicedAt);
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      }
      setBusy('ساخت PDF…');
      const blob = await elementToPdf(page.current);
      const name = `${kind === 'proforma' ? 'پیش‌فاکتور' : 'فاکتور'}-${no}.pdf`;
      if (keepCopy && saved.current !== no) {
        await uploadAttachment(blob, {
          orderId, kind: kind === 'proforma' ? 'proforma' : 'sales_invoice', docNumber: no, docDate: kind === 'invoice' ? issuedAt : Date.now(),
          amount: totalsOf(doc).total, title: `${kind === 'proforma' ? 'پیش‌فاکتور' : 'فاکتور فروش'} ${no} (سیستمی)`, fileName: name, mime: 'application/pdf',
        });
        saved.current = no;
        qc.invalidateQueries();
      }
      return { blob, name };
    } catch (err) {
      toast((err as Error).message || 'ساخت PDF ناموفق بود', 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const deliver = async (mode: 'download' | 'share' | 'print') => {
    const out = await build();
    if (!out) return;
    if (mode === 'print') {
      const url = URL.createObjectURL(out.blob);
      const w = window.open(url, '_blank');
      if (!w) await shareOrDownload(out.blob, out.name, false);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const r = await shareOrDownload(out.blob, out.name, mode === 'share');
    if (r === 'downloaded') toast(`«${out.name}» دانلود شد`, 'success');
  };

  const title = kind === 'proforma' ? 'پیش‌فاکتور' : 'فاکتور فروش';
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  return (
    <Modal open={open} onClose={onClose} size="xl" icon={kind === 'proforma' ? FileText : ReceiptText}
      title={`${title}${doc ? ` — ${doc.contact?.name ?? ''}` : ''}`}
      subtitle={kind === 'invoice' && !number ? 'شماره فاکتور هنگام ساخت PDF صادر می‌شود' : `شماره ${number || '—'} · قالب از تنظیمات ← قالب فاکتور`}
      footer={<>
        <label className="ml-auto flex items-center gap-2 text-xs text-mist"><Toggle checked={keepCopy} onChange={setKeepCopy} />ذخیره نسخه PDF در اسناد مشتری</label>
        <Button variant="ghost" onClick={onClose}>بستن</Button>
        {!mobile && <Button variant="outline" icon={Printer} disabled={!!busy || !doc} onClick={() => deliver('print')}>چاپ</Button>}
        {(mobile || canShare) && <Button variant="outline" icon={Share2} disabled={!!busy || !doc} onClick={() => deliver('share')}>ارسال</Button>}
        <Button variant="primary" icon={Download} loading={!!busy} disabled={!doc} onClick={() => deliver('download')}>{busy ?? 'دانلود PDF'}</Button>
      </>}>
      {!doc || !buyer ? <Spinner /> : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line/70 bg-deep/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-ink">مشخصات خریدار روی فاکتور</div>
                {!editBuyer && <div className="truncate text-xs text-mist">{[buyer.billingName, buyer.economicCode && `کد اقتصادی ${buyer.economicCode}`, buyer.billingPhone].filter(Boolean).join(' · ')}</div>}
              </div>
              <Button size="sm" variant={editBuyer ? 'action' : 'ghost'} icon={editBuyer ? Check : Pencil} onClick={() => setEditBuyer(!editBuyer)}>{editBuyer ? 'تأیید' : 'ویرایش'}</Button>
            </div>
            {editBuyer && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="نام خریدار"><Input value={buyer.billingName} onChange={(e) => setBuyer({ ...buyer, billingName: e.target.value })} /></Field>
                <Field label="شماره اقتصادی"><Input className="ltr" value={buyer.economicCode} onChange={(e) => setBuyer({ ...buyer, economicCode: e.target.value })} /></Field>
                <Field label="شناسه / کد ملی"><Input className="ltr" value={buyer.nationalId} onChange={(e) => setBuyer({ ...buyer, nationalId: e.target.value })} /></Field>
                <Field label="کد پستی"><Input className="ltr" value={buyer.postalCode} onChange={(e) => setBuyer({ ...buyer, postalCode: e.target.value })} /></Field>
                <Field label="تلفن"><Input className="ltr" value={buyer.billingPhone} onChange={(e) => setBuyer({ ...buyer, billingPhone: e.target.value })} /></Field>
                <Field label="نشانی" className="sm:col-span-3"><Textarea className="min-h-[56px]" value={buyer.billingAddress} onChange={(e) => setBuyer({ ...buyer, billingAddress: e.target.value })} /></Field>
                <p className="text-[11px] text-mist sm:col-span-3">این مشخصات برای فاکتورهای بعدی همین مشتری به خاطر سپرده می‌شود.</p>
              </div>
            )}
          </div>

          {/* Live preview: the real A4 page, scaled to fit */}
          <div ref={box} className="w-full overflow-hidden rounded-xl bg-[#e9eef0] p-0">
            <div style={{ width: PAGE_W * scale, height: pageH * scale, margin: '0 auto' }}>
              <div style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
                <InvoicePage doc={doc} kind={kind} number={number} issuedAt={issuedAt} buyer={buyer} pageRef={page} />
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
