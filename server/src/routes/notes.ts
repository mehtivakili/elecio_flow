import { Router } from 'express';
import { insert, one, q, run, uid } from '../db.ts';
import { HttpError, h, isAdmin, type AuthUser } from '../core.ts';

/**
 * Personal and shared notes.
 *  - private: only the author
 *  - users:   the author plus the chosen recipients
 *  - team:    everyone in the workspace
 * Owners/admins can see every note.
 */
export const notesRouter = Router();

const VISIBILITY = ['private', 'users', 'team'] as const;
const COLORS = ['iris', 'mint', 'amber', 'rose', 'lilac', 'sky'];

function canSee(user: AuthUser, n: any) {
  if (n.authorId === user.id || isAdmin(user)) return true;
  if (n.visibility === 'team') return true;
  return n.visibility === 'users' && (n.recipients ?? []).includes(user.id);
}

notesRouter.get('/notes', h((req) => {
  const scope = String(req.query.scope ?? 'visible');
  const rows = q(
    `SELECT n.*, u.full_name AS author_name FROM notes n LEFT JOIN users u ON u.id = n.author_id
     WHERE n.org_id = ? ORDER BY n.pinned DESC, n.updated_at DESC`, req.user.orgId,
  );
  const me = req.user.id;
  if (scope === 'all') {
    if (!isAdmin(req.user)) throw new HttpError(403, 'فقط مدیر همه یادداشت‌ها را می‌بیند');
    return rows;
  }
  if (scope === 'mine') return rows.filter((n) => n.authorId === me);
  if (scope === 'inbox') return rows.filter((n) => n.authorId !== me && (n.visibility === 'team' || (n.recipients ?? []).includes(me)));
  return rows.filter((n) => canSee(req.user, n));
}));

function readNote(body: any) {
  const visibility = VISIBILITY.includes(body?.visibility) ? body.visibility : 'private';
  const recipients: string[] = Array.isArray(body?.recipients) ? [...new Set(body.recipients.map(String))] as string[] : [];
  const text = String(body?.body ?? '').trim();
  const title = String(body?.title ?? '').trim();
  if (!text && !title) throw new HttpError(400, 'متن یادداشت خالی است');
  if (visibility === 'users' && !recipients.length) throw new HttpError(400, 'حداقل یک نفر را برای دیدن یادداشت انتخاب کنید');
  return {
    title, body: text, visibility, recipients: visibility === 'users' ? recipients : [],
    color: COLORS.includes(body?.color) ? body.color : 'iris', pinned: body?.pinned ? 1 : 0,
    refType: body?.refType || null, refId: body?.refId || null,
  };
}

notesRouter.post('/notes', h((req) => {
  const note = readNote(req.body);
  const id = uid('note');
  const now = Date.now();
  insert('notes', { ...note, id, orgId: req.user.orgId, authorId: req.user.id, createdAt: now, updatedAt: now },
    ['id', 'org_id', 'author_id', 'title', 'body', 'color', 'visibility', 'recipients_json', 'ref_type', 'ref_id', 'pinned', 'created_at', 'updated_at']);
  return { id };
}));

function ownNote(user: AuthUser, id: string) {
  const n = one('SELECT * FROM notes WHERE id = ? AND org_id = ?', id, user.orgId);
  if (!n) throw new HttpError(404, 'یادداشت پیدا نشد');
  if (n.authorId !== user.id && !isAdmin(user)) throw new HttpError(403, 'فقط نویسنده یادداشت می‌تواند آن را تغییر دهد');
  return n;
}

notesRouter.put('/notes/:id', h((req) => {
  const n = ownNote(req.user, req.params.id);
  const note = readNote({ ...n, ...req.body });
  run(
    `UPDATE notes SET title = ?, body = ?, visibility = ?, recipients_json = ?, color = ?, pinned = ?, updated_at = ? WHERE id = ?`,
    note.title, note.body, note.visibility, JSON.stringify(note.recipients), note.color, note.pinned, Date.now(), n.id,
  );
  return { id: n.id };
}));

notesRouter.delete('/notes/:id', h((req) => {
  const n = ownNote(req.user, req.params.id);
  run('DELETE FROM notes WHERE id = ?', n.id);
}));
