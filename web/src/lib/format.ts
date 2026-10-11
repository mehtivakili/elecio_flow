import { formatJalali, toPersianDigits } from '@shared/jalali';

export { formatJalali, toPersianDigits };

const nf = new Intl.NumberFormat('fa-IR');

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return digits
    ? new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value)
    : nf.format(Math.round(value));
}

/** Full amount with thousands separators: ۴۸٬۰۰۰٬۰۰۰ */
export function money(value: number | null | undefined, currency?: string): string {
  if (value === null || value === undefined) return '—';
  return `${nf.format(Math.round(value))}${currency ? ` ${currency}` : ''}`;
}

/** Compact amount for tiles and charts: ۴۸ م / ۱٫۲ میلیارد */
export function compactMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${num(value / 1e9, 1)} میلیارد`;
  if (abs >= 1e6) return `${num(value / 1e6, abs >= 1e8 ? 0 : 1)} میلیون`;
  if (abs >= 1e3) return `${num(value / 1e3)} هزار`;
  return num(value);
}

export function date(ms: number | null | undefined) { return formatJalali(ms ?? null); }
export function dateTime(ms: number | null | undefined) { return formatJalali(ms ?? null, 'datetime'); }
export function dateLong(ms: number | null | undefined) { return formatJalali(ms ?? null, 'long'); }

export function relative(ms: number | null | undefined): string {
  if (!ms) return '—';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  const unit = (n: number, label: string) => `${num(n)} ${label} ${past ? 'پیش' : 'دیگر'}`;
  if (abs < 60_000) return past ? 'همین الان' : 'تا لحظاتی دیگر';
  if (abs < 3_600_000) return unit(Math.round(abs / 60_000), 'دقیقه');
  if (abs < 86_400_000) return unit(Math.round(abs / 3_600_000), 'ساعت');
  if (abs < 86_400_000 * 2) return past ? 'دیروز' : 'فردا';
  if (abs < 86_400_000 * 30) return unit(Math.round(abs / 86_400_000), 'روز');
  return dateLong(ms);
}

export function daysLeft(ms: number | null | undefined): number | null {
  if (!ms) return null;
  return Math.ceil((ms - Date.now()) / 86_400_000);
}

export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

export function phoneHref(value: string) {
  return `tel:${value.replace(/[^\d+]/g, '')}`;
}

/**
 * Wraps Latin document codes (SO-0507-0012, ELC-E1-0507-0003, TPX-881204…) in
 * Unicode directional isolates so they read left-to-right inside Persian text.
 */
export function isolateCodes(text: string): string {
  return text.replace(/[A-Za-z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)+/g, (m) => `\u2066${m}\u2069`);
}
