// Backups and the recycle bin, on the free tiers only (Google's managed backups need a paid plan):
//
// Daily backup. Every night after 03:00 Israel time the cron reads the whole database with one ordered query over every
// collection (a "kindless" query: one read per document, about 450 today out of the free 50,000 a day) and writes it to
// R2 as newline-delimited JSON, exactly as the REST API returns each document, so a restore writes back the same types:
//   backups/<YYYY-MM-DD>/pages/<uuid>.page ...   backups/<YYYY-MM-DD>/manifest.json
// It runs one page per cron run (the free plan allows 10 ms of CPU per run) and keeps its cursor in TOKEN_KV, so a big
// database simply takes a few more runs. Kept: the last 30 days, and the first of each month for a year.
//
// Recycle bin. Whatever an API request deletes (Instinct, the console, any key) is read just before the commit and kept
// in R2 for 30 days (trash/<YYYY-MM-DD>/<time>-<random>.json), with who deleted it. What the app deletes directly is
// covered by the daily backup instead.
import { ApiError, invalid } from './http';
import { type Env, Firestore, type RawDoc, type Write, decFields } from './firestore';
import type { R2 } from './files';

export const BACKUPS = 'backups/';
export const TRASH = 'trash/';
const STATE_KEY = 'console:backup-state';
const LAST_KEY = 'console:backup-last';
/** Every finished backup's manifest, newest first: the console's list in one KV read, not one R2 read per day. */
const INDEX_KEY = 'console:backup-index';
const PAGE = 300;
const KEEP_DAYS = 30;
const KEEP_MONTHS = 12;
const TRASH_DAYS = 30;
/** Not worth keeping: the API's replay cache (it expires in a day anyway). */
const SKIP = new Set(['api_idempotency']);
/** Not put in the recycle bin: the API's own housekeeping. */
const NO_TRASH = new Set(['api_idempotency', 'push_jobs', 'email_outbox', 'api_log', 'api_failures']);

const TZ = 'Asia/Jerusalem';
export const ilDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const ilHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));

/** "projects/p/databases/(default)/documents/events/e1/vendors/v1" -> "events/e1/vendors/v1" */
export const pathOf = (name: string) => name.slice(name.indexOf('/documents/') + '/documents/'.length);
/** "events/e1/vendors/v1" -> "events/*\/vendors" (the collection, with the ids of its parents left out) */
export const groupOf = (path: string) => path.split('/').filter((_, i) => i % 2 === 0).join('/*/');
const lastCollection = (path: string) => { const s = path.split('/'); return s[s.length - 2] || ''; };
/** A short name for a document in lists: its title, name or text. */
export function titleOf(d: RawDoc): string {
  const f = d.fields || {};
  for (const k of ['title', 'name', 'displayName', 'text', 'email', 'label']) {
    const v = (f[k] as { stringValue?: string } | undefined)?.stringValue;
    if (v) return v.slice(0, 80);
  }
  return '';
}

function bucket(env: Env): R2 {
  if (!env.FILE_BUCKET) throw new ApiError('INTERNAL', 'FILE_BUCKET is not bound');
  return env.FILE_BUCKET;
}
async function listAll(b: R2, prefix: string, include?: ('customMetadata')[]) {
  const out: { key: string; size: number; uploaded: Date; customMetadata?: Record<string, string> }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const r = await b.list({ prefix, cursor, limit: 1000, ...(include ? { include } : {}) });
    out.push(...r.objects);
    if (!r.truncated) break;
    cursor = r.cursor;
  }
  return out;
}
async function prefixes(b: R2, prefix: string): Promise<string[]> {
  const r = await b.list({ prefix, delimiter: '/', limit: 1000 });
  return r.delimitedPrefixes.map((p) => p.slice(prefix.length, -1)).sort();
}
async function removePrefix(b: R2, prefix: string) {
  const keys = (await listAll(b, prefix)).map((o) => o.key);
  for (let i = 0; i < keys.length; i += 1000) await b.delete(keys.slice(i, i + 1000));
}

// ---------- the daily backup ----------
type State = { partKeys: string[]; date: string; startedAt: string; cursor: string | null; part: number; docs: number; bytes: number; collections: Record<string, number>; by: string };
export type Manifest = { partKeys?: string[]; date: string; startedAt: string; finishedAt: string; docs: number; bytes: number; parts: number; collections: Record<string, number>; by: string };

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  try { return JSON.parse((await env.TOKEN_KV?.get(key)) || 'null') as T | null; } catch { return null; }
}
/** The newest finished backup (one KV read). */
export const lastBackup = (env: Env) => readJson<Manifest>(env, LAST_KEY);

/**
 * One step of the backup: called by every cron run (does nothing before 03:00, or once today's backup is done) and by
 * the console's "גיבוי עכשיו" (force). Returns what it did, or null when there was nothing to do.
 */
export async function runBackup(env: Env, opts: { force?: boolean; by?: string } = {}) {
  if (!env.FILE_BUCKET || !env.TOKEN_KV) return null;
  const b = env.FILE_BUCKET;
  const today = ilDate();
  let st = await readJson<State>(env, STATE_KEY);
  // Restart in-progress legacy runs; their numbered parts are not immutable.
  if (st && !Array.isArray(st.partKeys)) st = null;
  // a run left over from another day (the Worker was down): start again
  if (st && st.date !== today && Date.now() - Date.parse(st.startedAt) > 20 * 3600_000) st = null;
  if (!st) {
    if (!opts.force) {
      if (ilHour() < 3) return null;
      if ((await readJson<Manifest>(env, LAST_KEY))?.date === today) return null;
    }
    st = { partKeys: [], date: today, startedAt: new Date().toISOString(), cursor: null, part: 0, docs: 0, bytes: 0, collections: {}, by: opts.by || 'cron' };
  }
  const fs = new Firestore(env);
  const page = await fs.rawQuery({
    from: [{ allDescendants: true }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: PAGE,
    ...(st.cursor ? { startAt: { values: [{ referenceValue: st.cursor }], before: false } } : {}),
  });
  const lines: string[] = [];
  for (const d of page) {
    const path = pathOf(d.name);
    if (SKIP.has(lastCollection(path))) continue;
    const g = groupOf(path);
    st.collections[g] = (st.collections[g] || 0) + 1;
    lines.push(JSON.stringify({ name: d.name, fields: d.fields || {}, createTime: d.createTime, updateTime: d.updateTime }));
  }
  if (page.length) st.cursor = page[page.length - 1].name;
  if (lines.length) {
    st.part++;
    const body = new TextEncoder().encode(lines.join('\n') + '\n');
    // Each step gets a unique key, even if two Workers read the same KV cursor.
    const key = `${BACKUPS}${st.date}/pages/${crypto.randomUUID()}.page`;
    await b.put(key, body, { httpMetadata: { contentType: 'application/x-ndjson' } });
    st.partKeys.push(key);
    st.bytes += body.byteLength;
    st.docs += lines.length;
  }
  if (page.length === PAGE) {
    await env.TOKEN_KV.put(STATE_KEY, JSON.stringify(st));
    return { cron: 'backup', done: false, date: st.date, docs: st.docs, parts: st.part };
  }
  const manifest: Manifest = { partKeys: st.partKeys, date: st.date, startedAt: st.startedAt, finishedAt: new Date().toISOString(), docs: st.docs, bytes: st.bytes, parts: st.part, collections: st.collections, by: st.by };
  // Publish the entire ordered snapshot in one R2 write after every part exists.
  await b.put(`${BACKUPS}${st.date}/manifest.json`, JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json' } });
  await env.TOKEN_KV.put(LAST_KEY, JSON.stringify(manifest));
  await env.TOKEN_KV.delete?.(STATE_KEY);
  // Retain older pages until date retention so in-flight readers can finish.
  const index = [manifest, ...(await readIndex(env, b)).filter((m) => m.date !== manifest.date)];
  const pruned = await prune(b, index).catch(() => 0);
  const kept = new Set(await prefixes(b, BACKUPS).catch(() => index.map((m) => m.date)));
  await env.TOKEN_KV.put(INDEX_KEY, JSON.stringify(index.filter((m) => kept.has(m.date))));
  return { cron: 'backup', done: true, date: st.date, docs: st.docs, parts: st.part, bytes: st.bytes, pruned };
}

/**
 * Keeps the last 30 finished backups and the first finished backup of each month for a year. A folder without a manifest
 * (a run abandoned long ago) goes after two days; today's is never touched here.
 */
async function prune(b: R2, index: Manifest[]): Promise<number> {
  const done = new Set(index.map((m) => m.date));
  const days = (await prefixes(b, BACKUPS)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  const complete = days.filter((d) => done.has(d));
  const keep = new Set(complete.slice(0, KEEP_DAYS));
  const firstOfMonth = new Map<string, string>();
  for (const d of [...complete].reverse()) if (!firstOfMonth.has(d.slice(0, 7))) firstOfMonth.set(d.slice(0, 7), d);
  for (const d of [...firstOfMonth.values()].sort().reverse().slice(0, KEEP_MONTHS)) keep.add(d);
  const recent = ilDate(new Date(Date.now() - 2 * 86400_000));
  let n = 0;
  for (const d of days) {
    if (keep.has(d) || d === ilDate() || (!done.has(d) && d >= recent)) continue;
    // A stale KV index does not make a date with an R2 manifest an abandoned run.
    if (!done.has(d) && await b.get(`${BACKUPS}${d}/manifest.json`)) continue;
    await removePrefix(b, `${BACKUPS}${d}/`); n++;
  }
  // the recycle bin keeps 30 days
  const cut = ilDate(new Date(Date.now() - TRASH_DAYS * 86400_000));
  for (const d of await prefixes(b, TRASH)) if (d < cut) { await removePrefix(b, `${TRASH}${d}/`); n++; }
  return n;
}

/** The manifests of the finished backups, newest first: from KV, built once from R2 when missing. */
async function readIndex(env: Env, b: R2): Promise<Manifest[]> {
  const cached = await readJson<Manifest[]>(env, INDEX_KEY);
  if (cached) return cached;
  const days = (await prefixes(b, BACKUPS)).sort().reverse().slice(0, 45);
  const items = (await Promise.all(days.map(async (d) => {
    const m = await b.get(`${BACKUPS}${d}/manifest.json`);
    return m ? (JSON.parse(await m.text()) as Manifest) : null;
  }))).filter((m): m is Manifest => !!m);
  if (items.length) await env.TOKEN_KV?.put(INDEX_KEY, JSON.stringify(items));
  return items;
}

export async function listBackups(env: Env) {
  const items = await readIndex(env, bucket(env));
  const running = await readJson<State>(env, STATE_KEY);
  return { items, running: running ? { date: running.date, docs: running.docs, startedAt: running.startedAt } : null };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
async function partsOf(b: R2, date: string) {
  if (!DATE_RE.test(date)) throw invalid('date', 'YYYY-MM-DD');
  const prefix = `${BACKUPS}${date}/`;
  const object = await b.get(`${prefix}manifest.json`);
  if (!object) throw new ApiError('NOT_FOUND', 'no finished backup for that day');
  const manifest = JSON.parse(await object.text()) as Manifest;
  if (manifest.date !== date || !Number.isSafeInteger(manifest.parts) || manifest.parts < 0) {
    throw new ApiError('INTERNAL', 'invalid backup manifest');
  }
  if (manifest.partKeys !== undefined) {
    if (!Array.isArray(manifest.partKeys) || manifest.partKeys.length !== manifest.parts ||
        new Set(manifest.partKeys).size !== manifest.parts ||
        manifest.partKeys.some((key) => typeof key !== 'string' || !key.startsWith(prefix) ||
          !/^pages\/[0-9a-f-]{36}\.page$/.test(key.slice(prefix.length)))) {
      throw new ApiError('INTERNAL', 'invalid backup parts');
    }
    return manifest.partKeys;
  }
  // Older published backups used sequential names. Ignore extra or unpublished parts.
  return Array.from({ length: manifest.parts }, (_, i) => `${prefix}part-${String(i + 1).padStart(4, '0')}.ndjson`);
}

/** The whole backup as one file (the parts one after another, streamed straight from R2). */
export async function downloadBackup(env: Env, date: string): Promise<Response> {
  const b = bucket(env);
  const parts = await partsOf(b, date);
  const { readable, writable } = new TransformStream();
  (async () => {
    for (const k of parts) {
      const o = await b.get(k);
      if (!o) throw new ApiError('INTERNAL', 'backup part is missing');
      await o.body.pipeTo(writable, { preventClose: true });
    }
    await writable.close();
  })().catch((e) => writable.abort(e).catch(() => {}));
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': `attachment; filename="havat-ravve-backup-${date}.ndjson"`, 'cache-control': 'no-store' } });
}

async function docsOf(b: R2, date: string, want: (path: string) => boolean): Promise<RawDoc[]> {
  const out: RawDoc[] = [];
  for (const k of await partsOf(b, date)) {
    const o = await b.get(k);
    if (!o) throw new ApiError('INTERNAL', 'backup part is missing');
    for (const line of (await o.text()).split('\n')) {
      if (!line) continue;
      const i = line.indexOf('"name":"');
      const name = line.slice(i + 8, line.indexOf('"', i + 8));
      if (want(pathOf(name))) out.push(JSON.parse(line) as RawDoc);
    }
  }
  return out;
}

/** The documents of one collection in a backup (for picking what to restore). */
export async function backupCollection(env: Env, date: string, group: string) {
  if (!/^[A-Za-z0-9_*/-]{1,200}$/.test(group)) throw invalid('collection', 'a collection from the backup');
  const docs = await docsOf(bucket(env), date, (p) => groupOf(p) === group);
  return { items: docs.slice(0, 1000).map((d) => ({ path: pathOf(d.name), title: titleOf(d), updateTime: d.updateTime || null })), total: docs.length };
}

/** One document as it was in the backup, next to how it is now. */
export async function backupDoc(env: Env, date: string, path: string, fs: Firestore) {
  const [d] = await docsOf(bucket(env), date, (p) => p === path);
  if (!d) throw new ApiError('NOT_FOUND', 'that document is not in this backup');
  const [now] = await fs.rawGet([d.name]);
  return { path, then: decFields(d.fields || {}), now: now ? decFields(now.fields || {}) : null, thenUpdated: d.updateTime || null, nowUpdated: now?.updateTime || null };
}

/** Writes documents back as they were in the backup (replacing what is there now). */
export async function restoreFromBackup(env: Env, date: string, paths: string[], fs: Firestore) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 2000 || paths.some((p) => typeof p !== 'string')) throw invalid('paths', '1 to 2000 document paths from the backup');
  const want = new Set(paths);
  const docs = await docsOf(bucket(env), date, (p) => want.has(p));
  if (!docs.length) throw new ApiError('NOT_FOUND', 'none of those documents are in this backup');
  // what is there now goes to the recycle bin first (30 days), so a restore can itself be undone
  const now: RawDoc[] = [];
  for (let i = 0; i < docs.length; i += 100) now.push(...await fs.rawGet(docs.slice(i, i + 100).map((d) => d.name)));
  const current = new Map(now.map((d) => [d.name, d]));
  // a person's profile (role, status) is changed in the people screen: a restore only brings back one that is gone
  const people = docs.filter((d) => lastCollection(pathOf(d.name)) === 'users' && current.has(d.name));
  const todo = docs.filter((d) => !people.includes(d));
  const keep = todo.map((d) => current.get(d.name)).filter((d): d is RawDoc => !!d);
  if (keep.length && fs.trash) await fs.trash.put(keep);
  const writes: Write[] = todo.map((d) => ({ update: { name: d.name, fields: d.fields || {} } }));
  for (let i = 0; i < writes.length; i += 400) await fs.commit(writes.slice(i, i + 400));
  return { restored: todo.length, missing: paths.length - docs.length, skippedPeople: people.map((d) => pathOf(d.name)), keptInTrash: keep.length, paths: todo.map((d) => pathOf(d.name)) };
}

// ---------- the recycle bin ----------
export type TrashBy = { credential: string; label: string; name: string; requestId: string };

/** The recycle bin of one request: set on its Firestore so every delete it commits is kept first. */
export function trashFor(env: Env, by: TrashBy): Firestore['trash'] {
  if (!env.FILE_BUCKET) return null;
  const b = env.FILE_BUCKET;
  return {
    keep: (name) => !NO_TRASH.has(lastCollection(pathOf(name))),
    put: async (docs) => {
      const at = new Date();
      await Promise.all(docs.map((d) => {
        const path = pathOf(d.name);
        const key = `${TRASH}${ilDate(at)}/${at.getTime()}-${crypto.randomUUID().slice(0, 8)}.json`;
        return b.put(key, JSON.stringify({ doc: d, deletedAt: at.toISOString(), by }), {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { path: path.slice(0, 500), title: titleOf(d).slice(0, 80), by: by.label.slice(0, 80), who: by.name.slice(0, 80), requestId: by.requestId, at: at.toISOString() },
        });
      }));
    },
  };
}

export async function listTrash(env: Env) {
  const objs = await listAll(bucket(env), TRASH, ['customMetadata']);
  return {
    items: objs.sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 500).map((o) => {
      const m = o.customMetadata || {};
      return { key: o.key, path: m.path || '', collection: groupOf(m.path || ''), title: m.title || '', by: m.by || '', who: m.who || '', requestId: m.requestId || '', deletedAt: m.at || o.uploaded.toISOString() };
    }),
  };
}

/** Puts deleted documents back. A document that was created again since is left alone (reported, not overwritten). */
export async function restoreFromTrash(env: Env, keys: string[], fs: Firestore) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 200 || keys.some((k) => typeof k !== 'string' || !/^trash\/\d{4}-\d{2}-\d{2}\/[0-9]+-[0-9a-f]{8}\.json$/.test(k))) throw invalid('keys', '1 to 200 keys from the recycle bin');
  const b = bucket(env);
  const restored: string[] = [], exists: string[] = [], gone: string[] = [];
  for (const k of keys) {
    const o = await b.get(k);
    if (!o) { gone.push(k); continue; }
    const { doc } = JSON.parse(await o.text()) as { doc: RawDoc };
    try {
      await fs.commit([{ update: { name: doc.name, fields: doc.fields || {} }, currentDocument: { exists: false } }]);
      restored.push(pathOf(doc.name));
      await b.delete(k);
    } catch (e) {
      if (e instanceof Error && /ALREADY_EXISTS|FAILED_PRECONDITION/.test((e as { status?: string }).status || e.message)) exists.push(pathOf(doc.name));
      else throw e;
    }
  }
  return { restored, exists, gone };
}
