export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export const JALALI_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function div(a: number, b: number) { return Math.floor(a / b); }

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  jy += 1595;
  let days = -355668 + 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return { gy, gm, gd };
}

export function gregorianToJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Esfand: 30 days in leap years — detect by converting day 30 back and forth
  const g = jalaliToGregorian(jy, 12, 30);
  const back = gregorianToJalali(g.gy, g.gm, g.gd);
  return back.jd === 30 ? 30 : 29;
}

export function toJalali(ms: number) {
  const d = new Date(ms);
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function fromJalali(jy: number, jm: number, jd: number, hour = 9): number {
  const g = jalaliToGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd, hour, 0, 0).getTime();
}

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[+d]);
}

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function pad2(n: number) { return (n < 10 ? '0' : '') + n; }

export function formatJalali(ms: number | null | undefined, style: 'short' | 'long' | 'datetime' | 'month' = 'short'): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const j = toJalali(ms);
  if (style === 'long') return `${toPersianDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`;
  if (style === 'month') return `${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`;
  const date = toPersianDigits(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
  if (style === 'datetime') return `${date} — ${toPersianDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)}`;
  return date;
}

/** Parses "۱۴۰۵/۰۷/۱۹" or "1405-7-19" into a timestamp (09:00 local). */
export function parseJalali(value: string): number | null {
  const m = toLatinDigits(value).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (jm < 1 || jm > 12 || jd < 1 || jd > jalaliMonthLength(jy, jm)) return null;
  return fromJalali(jy, jm, jd);
}
