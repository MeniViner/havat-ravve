// The console's data browser (דפדוף בנתונים): every collection and its size, the documents of one, a document with
// all its fields, its subcollections and its history (each version the nightly backups saw, plus the app's activity
// lines about it), a careful edit of simple fields, a delete that goes to the recycle bin, and CSV export for Excel.
//
// Edits write straight to Firestore, past the app's own rules, so they are kept narrow: only fields that already hold
// text, a number, yes/no or nothing; never the logs, and never people (they have their own screen, where a role change
// does everything it must). Each edit and delete carries the updateTime the owner saw, so it never overwrites a newer
// change, and the log keeps what each field was before.
import { nextUpdatedAt } from './core';
import { ApiError, invalid } from './http';
import { type Env, Firestore, FsError, type RawDoc, type V, dec, decFields, enc } from './firestore';
import { BACKUPS, groupOf, lastBackup, listBackups, pathOf, titleOf } from './backup';

const GROUP_RE = /^[A-Za-z0-9_]{1,100}(\/\*\/[A-Za-z0-9_]{1,100}){0,4}$/;
// ids may hold Hebrew and punctuation, never what changes a URL (? # %) and never . or .. on their own
const PATH_RE = /^[A-Za-z0-9_]{1,100}\/[^/\s?#%]{1,300}(\/[A-Za-z0-9_]{1,100}\/[^/\s?#%]{1,300}){0,4}$/;
const READ_ONLY = new Set(['api_log', 'api_failures', 'api_idempotency', 'account_activity', 'notification_activity', 'users']);
const PAGE = 200;
/** Fields that hold a person, a place or a confirmation when filled: never set to plain text from the browser. */
const OBJECT_FIELDS = new Set(['assignee', 'doneBy', 'by', 'createdBy', 'updatedBy', 'claimedBy', 'place', 'location', 'paymentConfirmation', 'owner', 'vendor']);
const lastCol = (path: string) => { const s = path.split('/'); return s[s.length - 2] || ''; };

export function checkPath(path: string) {
  if (typeof path !== 'string' || !PATH_RE.test(path) || path.split('/').some((x) => x === '.' || x === '..')) throw invalid('path', 'a document path such as tasks/abc123');
  return path;
}
function checkGroup(group: string) {
  if (typeof group !== 'string' || !GROUP_RE.test(group)) throw invalid('collection', 'a collection such as tasks or events/*/vendors');
  return group;
}

/** Every collection: last night's counts from the backup, plus a live count of each top-level one. */
export async function collections(env: Env, fs: Firestore) {
  let backup: Record<string, number> = {};
  let backupDate: string | null = null;
  try {
    const j = await lastBackup(env);
    if (j) { backup = j.collections || {}; backupDate = j.date; }
  } catch { /* no backup yet: live counts only */ }
  const top = await fs.listCollectionIds('');
  const live = Object.fromEntries(await Promise.all(top.map(async (c) => {
    try { return [c, await fs.count({ from: [{ collectionId: c }] })] as const; } catch { return [c, null] as const; }
  })));
  const groups = [...new Set([...top, ...Object.keys(backup)])];
  const items = groups.map((g) => ({ group: g, count: g in live ? live[g] : null, backupCount: backup[g] ?? null, readOnly: READ_ONLY.has(g.split('/*/').pop()!) }));
  items.sort((a, b) => (b.count ?? b.backupCount ?? 0) - (a.count ?? a.backupCount ?? 0));
  return { items, backupDate };
}

// never in the table's columns: what opens a door (a ticket's secret, a token, a push address), and pictures kept as text
const HIDDEN_FIELD = /secret|token|password|passcode|sha256|apikey|private_?key|endpoint|p256dh|idempotencykey/i;
const MAX_FIELDS = 40;
/** A record's simple fields for the table: text (up to 200 characters), numbers, yes/no, empty, times, and a person ({uid, name}) as the name. */
export function simpleFields(fields: Record<string, V>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (HIDDEN_FIELD.test(k)) continue;
    if (n >= MAX_FIELDS) break;
    const t = typeOf(v);
    if (t === 'map') {
      const p = ((v.mapValue as V).fields || {}) as Record<string, V>;
      if (typeof p.uid?.stringValue !== 'string' || typeof p.name?.stringValue !== 'string') continue;
      out[k] = p.name.stringValue.slice(0, 200);
    } else if (t === 'string') {
      const s = String(v.stringValue);
      if (s.startsWith('data:')) continue;
      out[k] = s.length > 200 ? s.slice(0, 199) + '…' : s;
    } else if (['integer', 'double', 'boolean', 'null', 'timestamp'].includes(t)) out[k] = dec(v);
    else continue;
    n++;
  }
  return out;
}

/** A page of documents of a collection, by id; `after` is the path of the last one of the previous page. */
export async function docsPage(fs: Firestore, group: string, after?: string | null, parent?: string | null) {
  checkGroup(group);
  if (after) checkPath(after);
  if (parent) checkPath(parent);
  const nested = group.includes('/*/');
  const collectionId = group.split('/*/').pop()!;
  // a document's own subcollection ("events/e1" + vendors), or the collection everywhere it appears
  const docs = await fs.rawQuery({
    from: [{ collectionId, ...(nested && !parent ? { allDescendants: true } : {}) }],
    orderBy: [{ field: { fieldPath: '__name__' } }],
    ...(after ? { startAt: { values: [{ referenceValue: `${fs.root}/${after}` }], before: false } } : {}),
    limit: PAGE,
  }, parent || '');
  const items = docs.filter((d) => groupOf(pathOf(d.name)) === group).map((d) => ({ path: pathOf(d.name), id: d.name.split('/').pop()!, title: titleOf(d), updateTime: d.updateTime || null, fields: simpleFields(d.fields || {}) }));
  return { items, next: docs.length === PAGE ? pathOf(docs[docs.length - 1].name) : null };
}

const typeOf = (v: V): string => (Object.keys(v)[0] || 'nullValue').replace(/Value$/, '');

/** One document: its fields (and each field's type), when it was made and changed, and its subcollections. */
export async function docView(fs: Firestore, path: string) {
  checkPath(path);
  const [d] = await fs.rawGet([`${fs.root}/${path}`]);
  if (!d) throw new ApiError('NOT_FOUND', 'no such document');
  const fields = d.fields || {};
  return {
    path, id: path.split('/').pop()!, group: groupOf(path), title: titleOf(d),
    fields: decFields(fields), types: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeOf(v)])),
    createTime: d.createTime || null, updateTime: d.updateTime || null,
    subcollections: await fs.listCollectionIds(path).catch(() => [] as string[]),
    readOnly: READ_ONLY.has(lastCol(path)),
  };
}

/** Each version of a document the nightly backups saw (newest first), and the app's activity lines about it. */
export async function history(env: Env, fs: Firestore, path: string, days = 7) {
  checkPath(path);
  const name = `${fs.root}/${path}`;
  const needle = `"name":${JSON.stringify(name)}`;
  const b = env.FILE_BUCKET;
  const seen: { date: string; doc: RawDoc | null }[] = [];
  let truncated = false;
  // days 0: the activity lines only, no backup is read
  if (b && days > 0) {
    // finished backups only (a half-done one would say the record was gone), and at most 40 R2 reads: the free plan
    // allows 50 subrequests per request, so a long range stops early and says so
    const finished = (await listBackups(env)).items;
    let reads = 0;
    for (const m of finished.slice(0, Math.min(30, Math.max(1, days)))) {
      const date = m.date;
      if (reads + m.parts > 40) { truncated = true; break; }
      const parts = Array.from({ length: m.parts }, (_, i) => `${BACKUPS}${date}/part-${String(i + 1).padStart(4, '0')}.ndjson`);
      let doc: RawDoc | null = null;
      for (const k of parts) {
        reads++;
        const o = await b.get(k);
        if (!o) continue;
        const text = await o.text();
        const i = text.indexOf(needle);
        if (i < 0) continue;
        const start = text.lastIndexOf('\n', i) + 1;
        const end = text.indexOf('\n', i);
        doc = JSON.parse(text.slice(start, end < 0 ? undefined : end)) as RawDoc;
        break;
      }
      seen.push({ date, doc });
    }
  }
  const [now] = await fs.rawGet([name]);
  // one entry per version: the newest backup that had it, and how far back it goes
  type Version = { updateTime: string | null; from: string; to: string; fields: Record<string, unknown> | null; gone?: boolean };
  const versions: Version[] = [];
  for (const s of seen) {
    const ut = s.doc?.updateTime || null;
    const prev = versions[versions.length - 1];
    if (prev && prev.updateTime === ut && !!prev.fields === !!s.doc) { prev.from = s.date; continue; }
    versions.push({ updateTime: ut, from: s.date, to: s.date, fields: s.doc ? decFields(s.doc.fields || {}) : null, ...(s.doc ? {} : { gone: true }) });
  }
  const changes = versions.map((v, i) => {
    const older = versions[i + 1];
    if (!older || !v.fields || !older.fields) return { ...v, changed: [] as string[] };
    const keys = new Set([...Object.keys(v.fields), ...Object.keys(older.fields)]);
    return { ...v, changed: [...keys].filter((k) => JSON.stringify(v.fields![k]) !== JSON.stringify(older.fields![k])).sort() };
  });
  // the app's activity lines about this record (tasks, events, places ... keep refId = the document id)
  const id = path.split('/').pop()!;
  let activity: { at: string; text: string; by: string; action: string; via: string }[] = [];
  try {
    const rows = await fs.query({ from: [{ collectionId: 'activity' }], where: { fieldFilter: { field: { fieldPath: 'refId' }, op: 'EQUAL', value: { stringValue: id } } }, limit: 60 });
    activity = rows.map((r) => ({ at: String(r.data.at || ''), text: String(r.data.text || ''), action: String(r.data.action || ''), by: String((r.data.by as { name?: string } | undefined)?.name || ''), via: String((r.data.via as { label?: string } | undefined)?.label || '') }))
      .sort((a, c) => (a.at < c.at ? 1 : -1)).slice(0, 40);
  } catch { /* no activity index or none */ }
  return { path, now: now ? { updateTime: now.updateTime || null, fields: decFields(now.fields || {}) } : null, versions: changes, activity, days: seen.length, truncated };
}

/** Changes simple fields of a document (text, number, yes/no, empty), only if nobody changed it since `updateTime`. */
export async function editDoc(fs: Firestore, body: Record<string, unknown>) {
  for (const k of Object.keys(body)) if (!['path', 'set', 'updateTime'].includes(k)) throw invalid(k, `unknown field ${k}`);
  const path = checkPath(String(body.path || ''));
  if (READ_ONLY.has(lastCol(path))) throw new ApiError('FORBIDDEN', lastCol(path) === 'users' ? 'people are edited in the people screen' : 'the logs cannot be edited');
  const set = body.set as Record<string, unknown>;
  if (!set || typeof set !== 'object' || Array.isArray(set) || !Object.keys(set).length || Object.keys(set).length > 30) throw invalid('set', '{ field: value } with 1 to 30 fields');
  if (typeof body.updateTime !== 'string') throw invalid('updateTime', 'the updateTime of the document as it was read');
  const [d] = await fs.rawGet([`${fs.root}/${path}`]);
  if (!d) throw new ApiError('NOT_FOUND', 'no such document');
  if (d.updateTime !== body.updateTime) throw new ApiError('STALE_WRITE', 'the document changed since it was read', { currentUpdateTime: d.updateTime ?? null });
  const fields = d.fields || {};
  const before: Record<string, unknown> = {};
  const next: Record<string, V> = {};
  for (const [k, v] of Object.entries(set)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(k)) throw invalid('set.' + k, 'a field name');
    const cur = fields[k];
    if (!cur) throw invalid('set.' + k, 'only fields the document already has can be changed here');
    const t = typeOf(cur);
    // an empty field the app fills with a person or a place ({uid, name}) must not become plain text
    if (t === 'null' && v !== null && OBJECT_FIELDS.has(k)) throw invalid('set.' + k, 'this field holds a person or a place when filled; set it in the app');
    const ok = v === null || (t === 'string' && typeof v === 'string' && v.length <= 5000) || ((t === 'integer' || t === 'double') && typeof v === 'number' && Number.isFinite(v)) || (t === 'boolean' && typeof v === 'boolean') || (t === 'null' && ['string', 'number', 'boolean'].includes(typeof v));
    if (!['string', 'integer', 'double', 'boolean', 'null'].includes(t) || !ok) throw invalid('set.' + k, `this field holds ${t}; only text, numbers, yes/no or empty can be set here`);
    before[k] = dec(cur);
    next[k] = enc(v);
  }
  // the record's own "last changed" moves too, so a client working from an older read sees the change (core.ts fresh)
  const version = fields.updatedAt ? dec(fields.updatedAt) : undefined;
  if (['tasks', 'task_templates'].includes(lastCol(path))) {
    next.updatedAt = enc(nextUpdatedAt(version));
    if ('updatedAt' in set) before.updatedAt = version;
  } else if (typeof version === 'string' && !('updatedAt' in set)) {
    next.updatedAt = enc(nextUpdatedAt(version));
  }
  try {
    await fs.commit([{ update: { name: d.name, fields: next }, updateMask: { fieldPaths: Object.keys(next) }, currentDocument: { updateTime: d.updateTime } }]);
  } catch (e) {
    if (e instanceof FsError && e.status === 'FAILED_PRECONDITION') throw new ApiError('STALE_WRITE', 'the document changed since it was read');
    throw e;
  }
  const [after] = await fs.rawGet([d.name]);
  return { path, before, after: Object.fromEntries(Object.keys(set).map((k) => [k, dec(next[k])])), updateTime: after?.updateTime || null };
}

/** Deletes a document (kept in the recycle bin for 30 days), only if nobody changed it since `updateTime`. */
export async function deleteDoc(fs: Firestore, body: Record<string, unknown>) {
  for (const k of Object.keys(body)) if (!['path', 'updateTime'].includes(k)) throw invalid(k, `unknown field ${k}`);
  const path = checkPath(String(body.path || ''));
  if (READ_ONLY.has(lastCol(path))) throw new ApiError('FORBIDDEN', lastCol(path) === 'users' ? 'people are removed in the people screen' : 'the logs cannot be deleted');
  if (typeof body.updateTime !== 'string') throw invalid('updateTime', 'the updateTime of the document as it was read');
  const name = `${fs.root}/${path}`;
  try {
    await fs.commit([{ delete: name, currentDocument: { updateTime: body.updateTime } }]);
  } catch (e) {
    if (e instanceof FsError && (e.status === 'FAILED_PRECONDITION' || e.status === 'NOT_FOUND')) throw new ApiError('STALE_WRITE', 'the document changed or was deleted since it was read');
    throw e;
  }
  return { path, deleted: true };
}

// ---------- CSV for Excel ----------
const FIRST = ['title', 'name', 'displayName', 'text', 'email', 'phone', 'role', 'status', 'date', 'createdAt', 'updatedAt'];
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !Array.isArray(v) && typeof (v as { name?: unknown }).name === 'string') return (v as { name: string }).name;
  if (Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null)) return v.join(', ');
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
const csvQuote = (s: string) => {
  // a leading = + - @ would run as a formula in Excel
  // (a real number, -150, stays a number so SUM counts it)
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** A whole collection as a CSV file (UTF-8 with BOM so Excel shows Hebrew), up to 5,000 documents. */
export async function exportCsv(fs: Firestore, group: string, date: string): Promise<Response> {
  checkGroup(group);
  const rows: { id: string; path: string; f: Record<string, unknown> }[] = [];
  let after: string | null = null;
  const nested = group.includes('/*/');
  const collectionId = group.split('/*/').pop()!;
  for (let i = 0; i < 25; i++) {
    const docs: RawDoc[] = await fs.rawQuery({
      from: [{ collectionId, ...(nested ? { allDescendants: true } : {}) }],
      orderBy: [{ field: { fieldPath: '__name__' } }],
      ...(after ? { startAt: { values: [{ referenceValue: `${fs.root}/${after}` }], before: false } } : {}),
      limit: PAGE,
    });
    for (const d of docs) { const p = pathOf(d.name); if (groupOf(p) === group) rows.push({ id: d.name.split('/').pop()!, path: p, f: decFields(d.fields || {}) }); }
    if (docs.length < PAGE) break;
    after = pathOf(docs[docs.length - 1].name);
  }
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.f)))];
  keys.sort((a, b) => { const ia = FIRST.indexOf(a), ib = FIRST.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
  const head = ['id', ...(nested ? ['path'] : []), ...keys];
  const lines = [head.map(csvQuote).join(',')];
  for (const r of rows) lines.push([r.id, ...(nested ? [r.path] : []), ...keys.map((k) => cell(r.f[k]))].map(csvQuote).join(','));
  const file = `havat-ravve-${group.replace(/\/\*\//g, '-')}-${date}.csv`;
  return new Response('﻿' + lines.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' } });
}
