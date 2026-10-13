/** Comparison-friendly Persian/Arabic text shared by browser and API. */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/[ًٌٍَُِّْـ\u0610-\u061A\u06D6-\u06ED]/g, '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[\u200c\u200d\u200e\u200f]/g, ' ')
    .toLocaleLowerCase('fa-IR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every query word may appear anywhere and in any order. */
export function matchesSearch(value: unknown, query: unknown): boolean {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearchText(value);
  return words.every((word) => haystack.includes(word));
}
