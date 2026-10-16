import { normalizeSearch, one, q, run, val, type Row } from '../db.ts';
import { DAY, HOUR, getSettings } from '../core.ts';

/**
 * Lead scoring, evolved from Tamasa's single additive score into three
 * explainable dimensions. Every point carries a reason so the UI can answer
 * "why is this lead hot?" — and the weights live in workspace settings.
 *
 *   Fit         (≤ 35) — is this the kind of shop that buys our product?
 *   Engagement  (≤ 40) — how alive is the conversation?
 *   Intent      (≤ 35) — how close is the deal to closing?
 */

export interface ScorePart {
  group: 'fit' | 'engagement' | 'intent';
  label: string;
  points: number;
}

export function computeScore(contactId: string): { score: number; parts: ScorePart[] } {
  const c = one('SELECT * FROM contacts WHERE id = ?', contactId);
  if (!c) return { score: 0, parts: [] };
  if (c.stage === 'lost') return { score: 0, parts: [{ group: 'intent', label: 'از دست‌رفته', points: 0 }] };
  if (c.stage === 'customer') return { score: 100, parts: [{ group: 'intent', label: 'مشتری فعال', points: 100 }] };

  const s = getSettings(c.orgId).scoring;
  const parts: ScorePart[] = [];
  const add = (group: ScorePart['group'], label: string, points: number) => {
    if (points) parts.push({ group, label, points });
  };

  /* Fit */
  const attrs = (c.attrs ?? {}) as Record<string, any>;
  const machines = Number(attrs.machines) || 0;
  if (machines >= 10) add('fit', `${machines} ماشین CNC`, 15);
  else if (machines >= 4) add('fit', `${machines} ماشین CNC`, 10);
  else if (machines >= 1) add('fit', `${machines} ماشین CNC`, 5);
  const controllers: string[] = Array.isArray(attrs.controllers) ? attrs.controllers : [];
  const target = controllers.filter((ctl) => s.targetControllers.includes(ctl));
  if (target.length) add('fit', `کنترلر هدف (${target.join('، ')})`, 10);
  if (c.company?.trim() || c.kind === 'company') add('fit', 'شرکت/کارگاه مشخص', 5);
  if (c.jobTitle?.trim()) add('fit', 'سمت تصمیم‌گیر ثبت شده', 5);

  /* Engagement */
  const recent = q(
    'SELECT type, outcome, direction, at FROM interactions WHERE contact_id = ? ORDER BY at DESC LIMIT 12',
    contactId,
  );
  const answered = recent.filter((i) => i.type === 'call' && ['answered', 'interested', 'callback'].includes(i.outcome)).length;
  add('engagement', `${answered} تماس موفق`, Math.min(answered * 6, 18));
  const meetings = recent.filter((i) => i.type === 'meeting' || i.type === 'visit').length;
  add('engagement', `${meetings} جلسه/بازدید`, Math.min(meetings * 10, 20));
  if (recent.some((i) => i.outcome === 'interested')) add('engagement', 'ابراز علاقه صریح', 6);
  const outbound = recent.filter((i) => i.type === 'call' && i.direction !== 'inbound').slice(0, 3);
  if (outbound.length === 3 && outbound.every((i) => i.outcome === 'no_answer')) add('engagement', '۳ تماس بی‌پاسخ پیاپی', -10);
  if (recent.some((i) => i.direction === 'inbound')) add('engagement', 'تماس ورودی از سمت مشتری', 6);
  if (c.lastContactAt) {
    const days = (Date.now() - c.lastContactAt) / DAY;
    if (days <= 7) add('engagement', 'ارتباط در ۷ روز اخیر', 8);
    else if (days > s.staleDays) add('engagement', `بدون ارتباط بیش از ${s.staleDays} روز`, -15);
  }

  /* Intent */
  const stagePoints: Record<string, number> = { cold_lead: 0, warm_lead: 10, qualified: 18, negotiation: 25 };
  const stageLabel = getSettings(c.orgId).lifecycleStages.find((st) => st.key === c.stage)?.label ?? c.stage;
  add('intent', `مرحله: ${stageLabel}`, stagePoints[c.stage] ?? 5);
  const openQuote = val<number>(
    "SELECT COUNT(*) FROM orders WHERE contact_id = ? AND status = 'open' AND stage = 'quote'", contactId,
  );
  if (openQuote) add('intent', 'پیش‌فاکتور باز', 10);
  if (c.estimatedValue && c.estimatedValue >= s.highValue) add('intent', 'ارزش معامله بالا', 5);
  if (c.starred) add('intent', 'نشان‌دار توسط فروش', 5);
  const urgentFollowup = val<number>(
    "SELECT COUNT(*) FROM followups WHERE contact_id = ? AND status = 'pending' AND priority = 'high'", contactId,
  );
  if (urgentFollowup) add('intent', 'پیگیری با اولویت بالا', 5);

  const caps = { fit: 35, engagement: 40, intent: 35 };
  let score = 0;
  for (const group of ['fit', 'engagement', 'intent'] as const) {
    const sum = parts.filter((p) => p.group === group).reduce((acc, p) => acc + p.points, 0);
    score += Math.min(sum, caps[group]);
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), parts };
}

export function rescore(contactId: string) {
  const { score, parts } = computeScore(contactId);
  run('UPDATE contacts SET score = ?, score_parts_json = ? WHERE id = ?', score, JSON.stringify(parts), contactId);
  return score;
}

export function rescoreOrg(orgId: string) {
  for (const { id } of q('SELECT id FROM contacts WHERE org_id = ?', orgId)) rescore(id);
}

/** Keeps the denormalised "last contact / next follow-up" columns honest. */
export function syncContactMeta(contactId: string) {
  const last = val<number | null>('SELECT MAX(at) FROM interactions WHERE contact_id = ?', contactId);
  const next = val<number | null>(
    "SELECT MIN(due_at) FROM followups WHERE contact_id = ? AND status = 'pending'", contactId,
  );
  run('UPDATE contacts SET last_contact_at = ?, next_follow_up_at = ? WHERE id = ?', last, next, contactId);
  rescore(contactId);
}

export function setStage(contactId: string, stage: string, lostReason?: string) {
  const c = one('SELECT stage, converted_at FROM contacts WHERE id = ?', contactId);
  if (!c || c.stage === stage) return;
  const now = Date.now();
  const convertedAt = stage === 'customer' ? (c.convertedAt ?? now) : c.convertedAt;
  run(
    'UPDATE contacts SET stage = ?, stage_changed_at = ?, converted_at = ?, lost_reason = ?, updated_at = ? WHERE id = ?',
    stage, now, convertedAt, stage === 'lost' ? (lostReason ?? '') : '', now, contactId,
  );
  rescore(contactId);
}

export function buildContactSearch(c: Row, addresses: Row[] = [], people: Row[] = []) {
  return normalizeSearch([
    c.name, c.company, c.jobTitle, c.website, c.notes, c.leadSourceDetail, c.customerType,
    ...(c.phones ?? []).map((p: Row) => p.value),
    ...(c.emails ?? []),
    ...addresses.flatMap((a) => [a.title, a.province, a.county, a.address]),
    ...people.flatMap((p) => [p.name, p.title, p.department, p.email, ...(p.phones ?? []).map((ph: Row) => ph.value)]),
  ].filter(Boolean).join(' '));
}

/**
 * After the people of a company change: the primary person is mirrored onto the
 * contact (company / job title, used by lists and cards) and search is rebuilt.
 */
export function syncContactPeople(contactId: string) {
  const contact = one('SELECT * FROM contacts WHERE id = ?', contactId);
  if (!contact) return;
  const people = q('SELECT * FROM contact_people WHERE contact_id = ? ORDER BY is_primary DESC, sort_order, created_at', contactId);
  const primary = people[0];
  const addresses = q('SELECT * FROM contact_addresses WHERE contact_id = ?', contactId);
  const merged = { ...contact, company: primary?.name ?? contact.company, jobTitle: primary?.title ?? contact.jobTitle };
  run('UPDATE contacts SET company = ?, job_title = ?, search = ? WHERE id = ?',
    merged.company ?? '', merged.jobTitle ?? '', buildContactSearch(merged, addresses, people), contactId);
}

/** Contacts with addresses + tag ids attached — the shape the UI works with. */
export function hydrateContacts(rows: Row[]): Row[] {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const addresses = q(`SELECT * FROM contact_addresses WHERE contact_id IN (${marks}) ORDER BY is_primary DESC, sort_order`, ...ids);
  const tags = q(`SELECT contact_id, tag_id FROM contact_tags WHERE contact_id IN (${marks})`, ...ids);
  const people = q(`SELECT * FROM contact_people WHERE contact_id IN (${marks}) ORDER BY is_primary DESC, sort_order, created_at`, ...ids);
  return rows.map((r) => ({
    ...r,
    search: undefined,
    addresses: addresses.filter((a) => a.contactId === r.id),
    tags: tags.filter((t) => t.contactId === r.id).map((t) => t.tagId),
    people: people.filter((p) => p.contactId === r.id),
  }));
}

/**
 * Suggests the single most useful next step for a lead — a small rule set
 * that turns the score into an action the salesperson can take today.
 */
export function nextBestAction(c: Row): { label: string; tone: 'urgent' | 'normal' | 'calm' } | null {
  if (['customer', 'lost'].includes(c.stage)) return null;
  const s = getSettings(c.orgId).scoring;
  const now = Date.now();
  if (!c.lastContactAt && now - c.createdAt > s.firstTouchHours * HOUR) {
    return { label: 'اولین تماس هنوز گرفته نشده', tone: 'urgent' };
  }
  if (c.nextFollowUpAt && c.nextFollowUpAt < now) return { label: 'پیگیری عقب افتاده', tone: 'urgent' };
  if (c.lastContactAt && now - c.lastContactAt > s.staleDays * DAY) return { label: 'سرد شده — تماس مجدد', tone: 'urgent' };
  if (c.stage === 'warm_lead' && c.score >= s.warmThreshold) return { label: 'هماهنگی دمو / بازدید', tone: 'normal' };
  if (c.stage === 'qualified') return { label: 'ارسال پیش‌فاکتور', tone: 'normal' };
  if (c.stage === 'negotiation') return { label: 'پیگیری پیش‌فاکتور و بستن قرارداد', tone: 'normal' };
  if (!c.nextFollowUpAt) return { label: 'یک پیگیری زمان‌بندی کنید', tone: 'calm' };
  return null;
}
