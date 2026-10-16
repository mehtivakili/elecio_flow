import { Router } from 'express';
import { insert, normalizeSearch, one, q, run, tx, uid, update, val, type Row } from '../db.ts';
import { DAY, HttpError, bulkDelete, getSettings, guard, h, logActivity, mustFind, unlinkTasks, guardRouter } from '../core.ts';
import {
  buildContactSearch, hydrateContacts, nextBestAction, rescore, setStage, syncContactMeta, syncContactPeople,
} from '../services/crm.ts';

export const crmRouter = Router();
guardRouter(crmRouter, 'crm');

const CONTACT_COLUMNS = [
  'owner_id', 'kind', 'name', 'company', 'job_title', 'phones_json', 'emails_json', 'website', 'lead_source',
  'lead_source_detail', 'customer_type', 'rating', 'starred', 'estimated_value', 'attrs_json', 'notes', 'referred_by_id',
];

function withInsights(rows: Row[]) {
  return hydrateContacts(rows).map((c) => ({ ...c, nextAction: nextBestAction(c) }));
}

/* ───────────── Contacts ───────────── */

crmRouter.get('/contacts', h((req) => {
  const { search, stage, source, owner, tag, province, temp, customerType } = req.query as Record<string, string>;
  const s = getSettings(req.user.orgId).scoring;
  let sql = 'SELECT * FROM contacts c WHERE org_id = ? AND deleted_at IS NULL';
  const params: (string | number)[] = [req.user.orgId];
  if (search) { sql += ' AND normalize_search(search) LIKE ?'; params.push(`%${normalizeSearch(search)}%`); }
  if (stage) { sql += ' AND stage = ?'; params.push(stage); }
  if (source) { sql += ' AND lead_source = ?'; params.push(source); }
  if (owner) { sql += ' AND owner_id = ?'; params.push(owner); }
  if (customerType) { sql += ' AND customer_type = ?'; params.push(customerType); }
  if (tag) { sql += ' AND EXISTS (SELECT 1 FROM contact_tags t WHERE t.contact_id = c.id AND t.tag_id = ?)'; params.push(tag); }
  if (province) { sql += ' AND EXISTS (SELECT 1 FROM contact_addresses a WHERE a.contact_id = c.id AND a.province = ?)'; params.push(province); }
  if (temp === 'hot') { sql += " AND score >= ? AND stage NOT IN ('customer','lost')"; params.push(s.hotThreshold); }
  if (temp === 'warm') { sql += " AND score >= ? AND score < ? AND stage NOT IN ('customer','lost')"; params.push(s.warmThreshold, s.hotThreshold); }
  if (temp === 'cold') { sql += " AND score < ? AND stage NOT IN ('customer','lost')"; params.push(s.warmThreshold); }
  sql += ' ORDER BY starred DESC, updated_at DESC';
  return withInsights(q(sql, ...params));
}));

crmRouter.get('/contacts/:id', h((req) => {
  const contact = withInsights([mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب')])[0];
  const id = contact.id;
  return {
    contact,
    interactions: q('SELECT * FROM interactions WHERE contact_id = ? ORDER BY at DESC', id),
    followups: q('SELECT * FROM followups WHERE contact_id = ? ORDER BY due_at DESC', id),
    orders: q('SELECT * FROM orders WHERE contact_id = ? ORDER BY created_at DESC', id),
    units: q(
      `SELECT u.*, i.name AS item_name FROM units u JOIN items i ON i.id = u.item_id
       WHERE u.contact_id = ? ORDER BY u.shipped_at DESC`, id,
    ),
    tickets: q('SELECT * FROM tickets WHERE contact_id = ? ORDER BY created_at DESC', id),
    tasks: q("SELECT * FROM tasks WHERE ref_type = 'contact' AND ref_id = ? ORDER BY due_at", id),
    referrals: q('SELECT id, name, stage FROM contacts WHERE referred_by_id = ?', id),
    referredBy: contact.referredById ? one('SELECT id, name FROM contacts WHERE id = ?', contact.referredById) : null,
  };
}));

/** Finds existing contacts sharing a phone number — Tamasa let duplicates slip in silently. */
function findDuplicates(orgId: string, phones: Row[], excludeId?: string) {
  const digits = phones.map((p) => normalizeSearch(p.value).replace(/\D/g, '').slice(-10)).filter((d) => d.length >= 7);
  if (!digits.length) return [];
  return q('SELECT id, name, phones_json FROM contacts WHERE org_id = ? AND id != ? AND deleted_at IS NULL', orgId, excludeId ?? '')
    .filter((c) => (c.phones ?? []).some((p: Row) => digits.includes(normalizeSearch(p.value).replace(/\D/g, '').slice(-10))))
    .map((c) => ({ id: c.id, name: c.name }));
}

function saveAddresses(orgId: string, contactId: string, addresses: Row[] = []) {
  run('DELETE FROM contact_addresses WHERE contact_id = ?', contactId);
  addresses.forEach((a, index) => insert('contact_addresses', {
    id: a.id || uid('adr'), orgId, contactId, title: a.title || 'دفتر مرکزی', province: a.province ?? '',
    county: a.county ?? '', address: a.address ?? '', postalCode: a.postalCode ?? '', lat: a.lat ?? null,
    lng: a.lng ?? null, isPrimary: index === 0 ? 1 : 0, sortOrder: index,
  }, ['id', 'org_id', 'contact_id', 'title', 'province', 'county', 'address', 'postal_code', 'lat', 'lng', 'is_primary', 'sort_order']));
}

function saveTags(contactId: string, tagIds: string[] = []) {
  run('DELETE FROM contact_tags WHERE contact_id = ?', contactId);
  for (const tagId of tagIds) run('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', contactId, tagId);
}

crmRouter.post('/contacts', h((req) => {
  const body = req.body ?? {};
  if (!body.name?.trim()) throw new HttpError(400, 'نام مخاطب الزامی است');
  const dupes = findDuplicates(req.user.orgId, body.phones ?? []);
  if (dupes.length && !body.allowDuplicate) {
    throw new HttpError(409, `شماره تلفن با «${dupes[0].name}» تکراری است`, { duplicates: dupes });
  }
  const id = uid('ct');
  const now = Date.now();
  tx(() => {
    insert('contacts', {
      ...body, id, orgId: req.user.orgId, ownerId: body.ownerId ?? req.user.id, stage: body.stage ?? 'cold_lead',
      phones: body.phones ?? [], emails: body.emails ?? [], attrs: body.attrs ?? {}, starred: body.starred ? 1 : 0,
      stageChangedAt: now, convertedAt: body.stage === 'customer' ? now : null,
      search: buildContactSearch(body, body.addresses), createdAt: now, updatedAt: now,
    }, ['id', 'org_id', 'stage', 'stage_changed_at', 'converted_at', 'search', 'created_at', 'updated_at', ...CONTACT_COLUMNS]);
    saveAddresses(req.user.orgId, id, body.addresses);
    saveTags(id, body.tags);
    // People of the company: given explicitly, or the single contact person typed in the form.
    const people: Row[] = Array.isArray(body.people) && body.people.length
      ? body.people
      : String(body.company ?? '').trim() ? [{ name: body.company, title: body.jobTitle, phones: body.phones ?? [] }] : [];
    people.forEach((raw, index) => {
      const person = readPerson(raw);
      insert('contact_people', { ...person, isPrimary: index === 0 ? 1 : 0, id: uid('ppl'), orgId: req.user.orgId, contactId: id, sortOrder: index, createdAt: now },
        ['id', 'org_id', 'contact_id', 'created_at', ...PERSON_COLUMNS]);
    });
    if (people.length) syncContactPeople(id);
    rescore(id);
    logActivity(req.user, 'contact', id, 'create', `مخاطب جدید: ${body.name}`);
  });
  return { id };
}));

crmRouter.put('/contacts/:id', h((req) => {
  const existing = mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  const body = { ...req.body };
  if (body.phones) {
    const dupes = findDuplicates(req.user.orgId, body.phones, existing.id);
    if (dupes.length && !body.allowDuplicate) {
      throw new HttpError(409, `شماره تلفن با «${dupes[0].name}» تکراری است`, { duplicates: dupes });
    }
  }
  if ('starred' in body) body.starred = body.starred ? 1 : 0;
  tx(() => {
    const merged = { ...existing, ...body };
    if (body.addresses) saveAddresses(req.user.orgId, existing.id, body.addresses);
    const addresses = q('SELECT * FROM contact_addresses WHERE contact_id = ?', existing.id);
    update('contacts', existing.id, req.user.orgId, { ...body, search: buildContactSearch(merged, addresses), updatedAt: Date.now() },
      [...CONTACT_COLUMNS, 'search', 'updated_at']);
    if (body.tags) saveTags(existing.id, body.tags);
    // The form's "contact person" field edits the primary person (or creates one).
    if ('company' in body && String(body.company ?? '').trim()) {
      const primary = one('SELECT * FROM contact_people WHERE contact_id = ? ORDER BY is_primary DESC, sort_order LIMIT 1', existing.id);
      if (primary) run('UPDATE contact_people SET name = ?, title = COALESCE(?, title) WHERE id = ?', String(body.company).trim(), body.jobTitle ?? null, primary.id);
      else {
        insert('contact_people', { ...readPerson({ name: body.company, title: body.jobTitle, phones: body.phones ?? existing.phones }), isPrimary: 1,
          id: uid('ppl'), orgId: req.user.orgId, contactId: existing.id, sortOrder: 0, createdAt: Date.now() },
        ['id', 'org_id', 'contact_id', 'created_at', ...PERSON_COLUMNS]);
      }
    }
    syncContactPeople(existing.id);
    if (body.stage && body.stage !== existing.stage) setStage(existing.id, body.stage, body.lostReason);
    rescore(existing.id);
  });
  return { id: existing.id };
}));

crmRouter.post('/contacts/:id/stage', h((req) => {
  const c = mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  const stage = getSettings(req.user.orgId).lifecycleStages.find((s) => s.key === req.body?.stage);
  if (!stage) throw new HttpError(400, 'مرحله نامعتبر است');
  if (stage.key === 'lost' && !req.body.lostReason) throw new HttpError(400, 'دلیل از دست رفتن را مشخص کنید');
  setStage(c.id, stage.key, req.body.lostReason);
  logActivity(req.user, 'contact', c.id, 'stage', `${c.name} → ${stage.label}`);
  return { ok: true };
}));

/** Why a contact can't be deleted (it anchors sales, service or installed devices), or null. */
function contactDeleteBlocker(c: Row): string | null {
  if (val<number>('SELECT COUNT(*) FROM orders WHERE contact_id = ?', c.id)) return 'سفارش‌هایش حفظ شد';
  if (val<number>('SELECT COUNT(*) FROM tickets WHERE contact_id = ?', c.id)) return 'تیکت‌هایش حفظ شد';
  if (val<number>('SELECT COUNT(*) FROM units WHERE contact_id = ?', c.id)) return 'دستگاه‌هایش حفظ شد';
  return null;
}

function removeContact(c: Row) {
  // Addresses, tags, interactions and follow-ups cascade with the contact.
  run('UPDATE contacts SET referred_by_id = NULL WHERE referred_by_id = ?', c.id);
  unlinkTasks('contact', c.id);
  run('DELETE FROM contacts WHERE id = ?', c.id);
}

const CONTACT_DELETE = {
  table: 'contacts', entity: 'contact', noun: 'مخاطب',
  label: (c: Row) => c.name,
  linkedReason: contactDeleteBlocker,
  remove: removeContact,
};

crmRouter.delete('/contacts/:id', h((req) => bulkDelete(req.user, [req.params.id], CONTACT_DELETE)));

crmRouter.post('/contacts/bulk-delete', h((req) => bulkDelete(req.user, req.body?.ids, CONTACT_DELETE)));

/* ───────────── Contact people (several people / roles per company) ───────────── */

const PERSON_COLUMNS = ['name', 'title', 'department', 'buying_role', 'phones_json', 'email', 'rating', 'is_primary', 'notes', 'sort_order'];

function readPerson(body: Row) {
  const name = String(body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'نام شخص الزامی است');
  const phones = (Array.isArray(body.phones) ? body.phones : [])
    .map((p: Row) => ({ label: String(p?.label ?? 'موبایل'), value: String(p?.value ?? '').trim() }))
    .filter((p: Row) => p.value);
  return {
    name, title: String(body.title ?? '').trim(), department: String(body.department ?? '').trim(),
    buyingRole: String(body.buyingRole ?? ''), phones, email: String(body.email ?? '').trim(),
    rating: Math.max(0, Math.min(5, Math.round(Number(body.rating) || 0))), isPrimary: body.isPrimary ? 1 : 0,
    notes: String(body.notes ?? ''),
  };
}

function setPrimary(contactId: string, personId: string) {
  run('UPDATE contact_people SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE contact_id = ?', personId, contactId);
}

crmRouter.post('/contacts/:id/people', h((req) => {
  const c = mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  const person = readPerson(req.body ?? {});
  const id = uid('ppl');
  tx(() => {
    const count = val<number>('SELECT COUNT(*) FROM contact_people WHERE contact_id = ?', c.id);
    insert('contact_people', { ...person, id, orgId: req.user.orgId, contactId: c.id, sortOrder: count, createdAt: Date.now() },
      ['id', 'org_id', 'contact_id', 'created_at', ...PERSON_COLUMNS]);
    if (person.isPrimary || count === 0) setPrimary(c.id, id);
    syncContactPeople(c.id);
    logActivity(req.user, 'contact', c.id, 'person', `افزودن ${person.name} به ${c.name}`);
  });
  return { id };
}));

crmRouter.put('/people/:id', h((req) => {
  const p = mustFind('contact_people', req.params.id, req.user.orgId, 'شخص');
  const person = readPerson({ ...p, ...req.body });
  tx(() => {
    update('contact_people', p.id, req.user.orgId, person, PERSON_COLUMNS.filter((c) => c !== 'sort_order'));
    if (person.isPrimary) setPrimary(p.contactId, p.id);
    syncContactPeople(p.contactId);
  });
  return { id: p.id };
}));

crmRouter.delete('/people/:id', h((req) => {
  const p = mustFind('contact_people', req.params.id, req.user.orgId, 'شخص');
  tx(() => {
    run('DELETE FROM contact_people WHERE id = ?', p.id);
    if (p.isPrimary) {
      const next = one('SELECT id FROM contact_people WHERE contact_id = ? ORDER BY sort_order, created_at LIMIT 1', p.contactId);
      if (next) setPrimary(p.contactId, next.id);
    }
    syncContactPeople(p.contactId);
  });
}));

/* ───────────── Interactions & follow-ups ───────────── */

/**
 * Log a touchpoint and (optionally) schedule the next one in a single step —
 * Tamasa's "log call" flow, generalised to meetings, visits and messages.
 */
crmRouter.post('/contacts/:id/interactions', h((req) => {
  const c = mustFind('contacts', req.params.id, req.user.orgId, 'مخاطب');
  const b = req.body ?? {};
  const now = Date.now();
  return tx(() => {
    const id = uid('int');
    insert('interactions', {
      id, orgId: req.user.orgId, contactId: c.id, userId: req.user.id, type: b.type ?? 'call',
      direction: b.direction ?? 'outbound', outcome: b.outcome ?? '', subject: b.subject ?? '', body: b.body ?? '',
      durationMin: b.durationMin ?? null, at: b.at ?? now, createdAt: now,
    }, ['id', 'org_id', 'contact_id', 'user_id', 'type', 'direction', 'outcome', 'subject', 'body', 'duration_min', 'at', 'created_at']);
    if (b.completeFollowupId) {
      run("UPDATE followups SET status = 'done', completed_at = ? WHERE id = ? AND org_id = ?", now, b.completeFollowupId, req.user.orgId);
    }
    if (b.followUp?.dueAt) {
      insert('followups', {
        id: uid('fu'), orgId: req.user.orgId, contactId: c.id, userId: req.user.id, dueAt: b.followUp.dueAt,
        priority: b.followUp.priority ?? 'normal', note: b.followUp.note ?? '', status: 'pending', createdAt: now,
      }, ['id', 'org_id', 'contact_id', 'user_id', 'due_at', 'priority', 'note', 'status', 'created_at']);
    }
    // Promote a cold lead once the conversation actually starts.
    if (c.stage === 'cold_lead' && ['answered', 'interested', 'callback'].includes(b.outcome)) setStage(c.id, 'warm_lead');
    if (b.stage && b.stage !== c.stage) setStage(c.id, b.stage, b.lostReason);
    syncContactMeta(c.id);
    return { id };
  });
}));

crmRouter.get('/followups', h((req) => {
  const status = (req.query.status as string) || 'pending';
  const mine = req.query.mine === '1';
  return q(
    `SELECT f.*, c.name AS contact_name, c.company AS contact_company, c.phones_json, c.stage AS contact_stage, c.score
     FROM followups f JOIN contacts c ON c.id = f.contact_id
     WHERE f.org_id = ? AND f.status = ? ${mine ? 'AND f.user_id = ?' : ''}
     ORDER BY f.due_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 500`,
    req.user.orgId, status, ...(mine ? [req.user.id] : []),
  );
}));

crmRouter.post('/followups', h((req) => {
  const b = req.body ?? {};
  const c = mustFind('contacts', b.contactId, req.user.orgId, 'مخاطب');
  if (!b.dueAt) throw new HttpError(400, 'زمان پیگیری الزامی است');
  const id = uid('fu');
  insert('followups', {
    id, orgId: req.user.orgId, contactId: c.id, userId: b.userId ?? req.user.id, dueAt: b.dueAt,
    priority: b.priority ?? 'normal', note: b.note ?? '', status: 'pending', createdAt: Date.now(),
  }, ['id', 'org_id', 'contact_id', 'user_id', 'due_at', 'priority', 'note', 'status', 'created_at']);
  syncContactMeta(c.id);
  return { id };
}));

crmRouter.post('/followups/:id/:action', h((req) => {
  const f = mustFind('followups', req.params.id, req.user.orgId, 'پیگیری');
  const { action } = req.params;
  if (action === 'complete') run("UPDATE followups SET status = 'done', completed_at = ? WHERE id = ?", Date.now(), f.id);
  else if (action === 'cancel') run("UPDATE followups SET status = 'cancelled' WHERE id = ?", f.id);
  else if (action === 'snooze') {
    const days = Number(req.body?.days) || 1;
    run('UPDATE followups SET due_at = ? WHERE id = ?', Math.max(Date.now(), f.dueAt) + days * DAY, f.id);
  } else throw new HttpError(400, 'عملیات نامعتبر');
  syncContactMeta(f.contactId);
}));

/* ───────────── Pipeline, hot leads, map ───────────── */

crmRouter.get('/pipeline', h((req) => {
  const contacts = withInsights(q('SELECT * FROM contacts WHERE org_id = ? AND deleted_at IS NULL ORDER BY score DESC', req.user.orgId));
  const openValue = q(
    "SELECT contact_id, SUM(total) AS v FROM orders WHERE org_id = ? AND status = 'open' AND deleted_at IS NULL GROUP BY contact_id", req.user.orgId,
  );
  const valueMap = Object.fromEntries(openValue.map((r) => [r.contactId, r.v]));
  return contacts.map((c) => ({ ...c, openOrderValue: valueMap[c.id] ?? 0 }));
}));

crmRouter.get('/hot-leads', h((req) => {
  const min = Number(req.query.min) || getSettings(req.user.orgId).scoring.warmThreshold;
  return withInsights(q(
    "SELECT * FROM contacts WHERE org_id = ? AND deleted_at IS NULL AND score >= ? AND stage NOT IN ('customer','lost') ORDER BY score DESC",
    req.user.orgId, min,
  ));
}));

/**
 * One operational map instead of a contacts-only map: leads and customers,
 * the devices installed at each site, and open service tickets per site.
 */
crmRouter.get('/map', h((req) => {
  const contacts = withInsights(q('SELECT * FROM contacts WHERE org_id = ? AND deleted_at IS NULL', req.user.orgId));
  const units = q(
    `SELECT contact_id, address_id, COUNT(*) AS n FROM units
     WHERE org_id = ? AND status IN ('installed','shipped','in_repair') GROUP BY contact_id, address_id`, req.user.orgId,
  );
  const tickets = q(
    "SELECT contact_id, COUNT(*) AS n FROM tickets WHERE org_id = ? AND status NOT IN ('resolved','closed') GROUP BY contact_id",
    req.user.orgId,
  );
  const unitMap: Record<string, number> = {};
  for (const u of units) unitMap[u.contactId] = (unitMap[u.contactId] ?? 0) + u.n;
  const ticketMap = Object.fromEntries(tickets.map((t) => [t.contactId, t.n]));
  return contacts.map((c) => ({ ...c, installedUnits: unitMap[c.id] ?? 0, openTickets: ticketMap[c.id] ?? 0 }));
}));

/* ───────────── Tags ───────────── */

crmRouter.post('/tags', h((req) => {
  if (!req.body?.name?.trim()) throw new HttpError(400, 'نام برچسب الزامی است');
  const id = uid('tag');
  insert('tags', { id, orgId: req.user.orgId, name: req.body.name.trim(), color: req.body.color ?? '#779BE7', createdAt: Date.now() },
    ['id', 'org_id', 'name', 'color', 'created_at']);
  return { id };
}));

crmRouter.delete('/tags/:id', h((req) => {
  run('DELETE FROM tags WHERE id = ? AND org_id = ?', req.params.id, req.user.orgId);
}));
