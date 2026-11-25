// Backups and the recycle bin, on the free tiers only (Google's managed backups need a paid plan):
//
// Daily backup. Every night after 03:00 Israel time the cron reads the whole database with one ordered query over every
// collection (a "kindless" query: one read per document, about 450 today out of the free 50,000 a day) and writes it to
// R2 as newline-delimited JSON, exactly as the REST API returns each document, so a restore writes back the same types:
//   backups/<YYYY-MM-DD>/pages/<uuid>.page ...   backups/<YYYY-MM-DD>/manifests/<uuid>.json
// It runs one page per cron run (the free plan allows 10 ms of CPU per run) and keeps its cursor and published index in one R2 catalog, so a big
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
/** Legacy summaries only. New readers discover new backups through the R2 catalog. */
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

// ---------- the daily backup ----------
type State = { date: string; startedAt: string; cursor: string | null; part: number; docs: number; bytes: number; collections: Record<string, number>; by: string };
type Active = State & { generation: string; partKeys: string[] };
export type BackupSummary = { date: string; startedAt: string; finishedAt: string; docs: number; bytes: number; parts: number; collections: Record<string, number>; by: string };
type Manifest = BackupSummary & { partKeys?: string[] };
type Published = BackupSummary & { manifestKey: string };
type Catalog = { running: Active | null; items: Published[]; retiredLegacy: string[]; retiring?: string };
type CatalogRead = { value: Catalog; etag?: string };
type Candidate = { date: string; item?: BackupSummary; manifestKey?: string };

const CATALOG_KEY = BACKUPS + 'catalog.json';
const LEGACY_WRITER = BACKUPS + 'legacy-writer.json';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const PAGE_KEY_RE = new RegExp(`^pages/(?:${UUID_RE}/)?${UUID_RE}\\.page$`);
const MANIFEST_KEY_RE = new RegExp(`^manifests/${UUID_RE}\\.json$`);
const JSON_META = { contentType: 'application/json' };
const NDJSON_META = { contentType: 'application/x-ndjson' };
const HISTORY_READS = 40;
const MAX_PART_READS = 36; // leaves room for request overhead, plus a one-record restore

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const value = await env.TOKEN_KV?.get(key);
  return value ? JSON.parse(value) as T : null;
}
function unavailable(message: string): ApiError {
  const e = new ApiError('INTERNAL', message);
  e.he = 'הגיבוי לא זמין כרגע. אפשר לבחור גיבוי מתאריך אחר.';
  return e;
}
const legacyManifest = (date: string) => `${BACKUPS}${date}/manifest.json`;
const numberedPart = (date: string, part: number) => `${BACKUPS}${date}/part-${String(part).padStart(4, '0')}.ndjson`;
const newest = <T extends { date: string }>(items: T[]) => items.sort((a, b) => b.date.localeCompare(a.date));
const summaryOf = ({ date, startedAt, finishedAt, docs, bytes, parts, collections, by }: BackupSummary): BackupSummary =>
  ({ date, startedAt, finishedAt, docs, bytes, parts, collections, by });

async function readCatalog(b: R2): Promise<CatalogRead> {
  const o = await b.get(CATALOG_KEY);
  if (!o) return { value: { items: [], running: null, retiredLegacy: [] } };
  try {
    const value = JSON.parse(await o.text()) as Catalog;
    if (!value || !Array.isArray(value.items) || !Array.isArray(value.retiredLegacy)) throw new Error('shape');
    return { value, etag: o.etag };
  } catch { throw unavailable('invalid backup catalog'); }
}

/** One conditional R2 write publishes the date, newest backup and index entry together. */
async function writeCatalog(b: R2, old: CatalogRead, value: Catalog) {
  return (await b.put(CATALOG_KEY, JSON.stringify(value), {
    httpMetadata: JSON_META, onlyIf: old.etag ? { etagMatches: old.etag } : { etagDoesNotMatch: '*' },
  })) !== null;
}

async function legacyIndex(env: Env): Promise<BackupSummary[] | null> {
  const items = await readJson<BackupSummary[]>(env, INDEX_KEY).catch(() => null);
  return Array.isArray(items) ? items.filter((m) => m && DATE_RE.test(m.date)).map(summaryOf) : null;
}

function candidates(catalog: Catalog, legacy: Candidate[]): Candidate[] {
  const items = new Map(legacy.filter((m) => !catalog.retiredLegacy.includes(m.date)).map((m) => [m.date, m]));
  for (const m of catalog.items) items.set(m.date, { date: m.date, item: summaryOf(m), manifestKey: m.manifestKey });
  return newest([...items.values()]);
}

async function legacyCandidates(env: Env, b: R2): Promise<Candidate[]> {
  const index = await legacyIndex(env);
  const last = await readJson<BackupSummary>(env, LAST_KEY).catch(() => null);
  const items: Candidate[] = index ? index.map((item) => ({ date: item.date, item })) :
    (await prefixes(b, BACKUPS)).filter((date) => DATE_RE.test(date)).map((date) => ({ date }));
  if (last && DATE_RE.test(last.date)) items.push({ date: last.date, item: summaryOf(last) });
  return items;
}

async function lastCandidate(env: Env, catalog: Catalog) {
  const old = await readJson<BackupSummary>(env, LAST_KEY).catch(() => null);
  return candidates(catalog, old && DATE_RE.test(old.date) ? [{ date: old.date, item: old }] : [])[0];
}

/** The newest published backup. New publications never race updating the old KV cache. */
export async function lastBackup(env: Env): Promise<BackupSummary | null> {
  if (!env.FILE_BUCKET) return null;
  const b = env.FILE_BUCKET;
  const last = await lastCandidate(env, (await readCatalog(b)).value);
  if (!last) return null;
  const resolved = await resolveManifest(b, last);
  if (!resolved) throw unavailable('backup manifest is missing');
  await preflightParts(b, resolved);
  return summaryOf(resolved.manifest);
}

function newState(today: string, by: string): State {
  return { date: today, startedAt: new Date().toISOString(), cursor: null, part: 0, docs: 0, bytes: 0, collections: {}, by };
}

async function nextPage(env: Env, st: State) {
  const page = await new Firestore(env).rawQuery({
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
  const body = lines.length ? new TextEncoder().encode(lines.join('\n') + '\n') : null;
  if (body) {
    st.part++;
    st.bytes += body.byteLength;
    st.docs += lines.length;
  }
  return { full: page.length === PAGE, body };
}

const stepResult = (st: State, done: boolean) => ({ cron: 'backup', done, date: st.date, docs: st.docs, parts: st.part, bytes: st.bytes });
const manifestOf = (st: State): BackupSummary =>
  ({ date: st.date, startedAt: st.startedAt, finishedAt: new Date().toISOString(), docs: st.docs, bytes: st.bytes, parts: st.part, collections: st.collections, by: st.by });

/** Temporary reader-first release. Continue the old format, and leave any already published day intact. */
async function runLegacy(env: Env, b: R2, today: string, opts: { force?: boolean; by?: string }) {
  if (!opts.force && ilHour() < 3) return null;
  const published = await resolveManifest(b, { date: today });
  if (published) {
    const { manifest } = published;
    return opts.force ? { cron: 'backup', done: true, date: today, docs: manifest.docs, bytes: manifest.bytes, parts: manifest.parts } : null;
  }
  const saved = await readJson<State | Active>(env, STATE_KEY);
  const st = saved?.date === today && !('partKeys' in saved) ? saved : newState(today, opts.by || 'cron');
  const { full, body } = await nextPage(env, st);
  if (body) await b.put(numberedPart(st.date, st.part), body, { httpMetadata: NDJSON_META });
  if (full) {
    await env.TOKEN_KV!.put(STATE_KEY, JSON.stringify(st));
    return stepResult(st, false);
  }
  const manifest = manifestOf(st);
  await b.put(legacyManifest(st.date), JSON.stringify(manifest), { httpMetadata: JSON_META });
  await env.TOKEN_KV!.put(LAST_KEY, JSON.stringify(manifest));
  const older = (await legacyIndex(env)) || [];
  // Old manifests remain readable from R2, including when no KV index has been populated yet.
  if (older.length) await env.TOKEN_KV!.put(INDEX_KEY, JSON.stringify([manifest, ...older.filter((m) => m.date !== st.date)]));
  await env.TOKEN_KV!.delete?.(STATE_KEY);
  return stepResult(st, true);
}

/** Serialize numbered writes in the temporary release so two invocations cannot rewrite a published page. */
async function withLegacyWriter(env: Env, b: R2, today: string, opts: { force?: boolean; by?: string }) {
  if (!opts.force && ilHour() < 3) return null;
  const lock = await b.get(LEGACY_WRITER);
  const since = lock ? Number(await lock.text()) : 0;
  if (Date.now() - since < 20 * 60_000) return opts.force ? { cron: 'backup', done: false, date: today, docs: 0 } : null;
  const held = await b.put(LEGACY_WRITER, String(Date.now()), {
    onlyIf: lock ? { etagMatches: lock.etag } : { etagDoesNotMatch: '*' },
  });
  if (!held) return opts.force ? { cron: 'backup', done: false, date: today, docs: 0 } : null;
  try { return await runLegacy(env, b, today, opts); }
  finally { await b.put(LEGACY_WRITER, '0', { onlyIf: { etagMatches: held.etag } }); }
}

/** Advance one snapshot page. Contending invocations can leave orphan objects, but only one advances the cursor. */
export async function runBackup(env: Env, opts: { force?: boolean; by?: string } = {}) {
  if (!env.FILE_BUCKET || !env.TOKEN_KV) return null;
  const b = env.FILE_BUCKET;
  const today = ilDate();
  const old = await readCatalog(b);
  if (env.BACKUP_WRITE_FORMAT === 'legacy') {
    if (old.etag) throw unavailable('legacy backup writes require the pre-publication reader release');
    return withLegacyWriter(env, b, today, opts);
  }
  if (env.BACKUP_WRITE_FORMAT === 'paused') {
    if (opts.force) throw unavailable('backup writing is paused');
    return null;
  }

  let st = old.value.running;
  // A legacy cursor referred to mutable numbered parts. Start the new format with a fresh snapshot.
  if (st?.date !== today) st = null;
  if (!st) {
    if (!opts.force) {
      if (ilHour() < 3 || old.value.items.some((m) => m.date === today) || await resolveManifest(b, { date: today })) return null;
    }
    st = { ...newState(today, opts.by || 'cron'), generation: crypto.randomUUID(), partKeys: [] };
  }
  const { full, body } = await nextPage(env, st);
  if (body) {
    if (st.part > MAX_PART_READS) throw unavailable('database exceeds the single-backup page limit');
    const key = `${BACKUPS}${st.date}/pages/${st.generation}/${crypto.randomUUID()}.page`;
    await b.put(key, body, { httpMetadata: NDJSON_META });
    st.partKeys.push(key);
  }
  let next: Catalog;
  if (full) next = { ...old.value, running: st };
  else {
    const published = manifestOf(st);
    const manifestKey = `${BACKUPS}${st.date}/manifests/${crypto.randomUUID()}.json`;
    await b.put(manifestKey, JSON.stringify({ ...published, partKeys: st.partKeys }), { httpMetadata: JSON_META });
    next = { ...old.value, running: null, items: newest([{ ...published, manifestKey }, ...old.value.items.filter((m) => m.date !== st.date)]) };
  }
  if (await writeCatalog(b, old, next)) return stepResult(st, !full);

  const current = (await readCatalog(b)).value;
  const finished = current.items.find((m) => m.date === st.date);
  if (!current.running && finished) return { cron: 'backup', done: true, date: finished.date, docs: finished.docs, parts: finished.parts, bytes: finished.bytes };
  return stepResult(current.running || newState(today, opts.by || 'cron'), false);
}

/** Bounded retention: withdraw at most one old date, then delete one batch. Old files can outlive their index entry. */
export async function pruneBackups(env: Env) {
  if (!env.FILE_BUCKET || env.BACKUP_WRITE_FORMAT === 'legacy' || env.BACKUP_WRITE_FORMAT === 'paused') return null;
  const b = env.FILE_BUCKET;
  const old = await readCatalog(b);
  if (!old.value.items.length) return null;
  const today = ilDate();
  const recent = ilDate(new Date(Date.now() - 2 * 86400_000));
  const legacy = await legacyIndex(env) || [];
  const complete = candidates(old.value, legacy.map((item) => ({ date: item.date, item })));
  const keep = new Set(complete.slice(0, KEEP_DAYS).map((m) => m.date));
  const firstOfMonth = new Map<string, string>();
  for (const { date } of [...complete].reverse()) if (!firstOfMonth.has(date.slice(0, 7))) firstOfMonth.set(date.slice(0, 7), date);
  for (const date of newest([...firstOfMonth.values()].map((date) => ({ date }))).slice(0, KEEP_MONTHS)) keep.add(date.date);
  // Even if legacy index hints are stale, never withdraw the last indexed new backup.
  keep.add(newest([...old.value.items])[0].date);
  const days = await prefixes(b, BACKUPS);
  const eligible = days.filter((d) => DATE_RE.test(d) && d < recent && !keep.has(d));
  const expired = new Set([...complete.map((m) => m.date), ...old.value.retiredLegacy]);
  // An unindexed legacy date is protected and cannot block pruning a known expired one.
  const day = old.value.retiring || eligible.find((d) => expired.has(d)) || eligible.at(-1);
  let pruned = 0;
  if (day) {
    const indexed = complete.some((m) => m.date === day);
    if (indexed || old.value.retiring === day || old.value.retiredLegacy.includes(day) || !await b.get(legacyManifest(day))) {
      if (indexed) {
        // First take it out of the index. A download already holding this manifest has until the next retention turn.
        const hasLegacy = legacy.some((m) => m.date === day) || !!await b.get(legacyManifest(day));
        const next = {
          ...old.value,
          items: old.value.items.filter((m) => m.date !== day),
          retiredLegacy: hasLegacy ? [...old.value.retiredLegacy, day] : old.value.retiredLegacy,
          retiring: day,
        };
        if (!(await writeCatalog(b, old, next))) return null;
      } else {
        const entries = await b.list({ prefix: `${BACKUPS}${day}/`, limit: 1000 });
        if (entries.objects.length) { await b.delete(entries.objects.map((o) => o.key)); pruned++; }
        if (old.value.retiring === day && !entries.truncated) await writeCatalog(b, old, { ...old.value, retiring: undefined });
      }
    }
  }
  const cut = ilDate(new Date(Date.now() - TRASH_DAYS * 86400_000));
  const trash = (await prefixes(b, TRASH)).find((d) => DATE_RE.test(d) && d < cut && d !== today);
  if (trash) {
    const { objects } = await b.list({ prefix: `${TRASH}${trash}/`, limit: 1000 });
    if (objects.length) { await b.delete(objects.map((o) => o.key)); pruned++; }
  }
  return pruned ? { cron: 'backupRetention', pruned } : null;
}

async function resolveManifest(b: R2, candidate: Candidate) {
  const { date, manifestKey } = candidate;
  if (!DATE_RE.test(date)) throw invalid('date', 'YYYY-MM-DD');
  const prefix = `${BACKUPS}${date}/`;
  if (manifestKey !== undefined && (!manifestKey.startsWith(prefix) || !MANIFEST_KEY_RE.test(manifestKey.slice(prefix.length)))) {
    throw unavailable('invalid backup manifest key');
  }
  const object = await b.get(manifestKey || legacyManifest(date));
  if (!object) return null;
  let manifest: Manifest;
  try { manifest = JSON.parse(await object.text()) as Manifest; }
  catch { throw unavailable('invalid backup manifest'); }
  if (!manifest || manifest.date !== date || !Number.isSafeInteger(manifest.parts) || manifest.parts < 0 ||
      !Number.isSafeInteger(manifest.docs) || !Number.isSafeInteger(manifest.bytes) ||
      manifest.docs < manifest.parts || manifest.bytes < manifest.docs ||
      (!manifest.parts && (manifest.docs || manifest.bytes))) {
    throw unavailable('invalid backup manifest');
  }
  if (manifestKey && !manifest.partKeys) throw unavailable('published backup is missing its part keys');
  if (manifest.partKeys !== undefined && (!Array.isArray(manifest.partKeys) || manifest.partKeys.length !== manifest.parts ||
      new Set(manifest.partKeys).size !== manifest.parts || manifest.partKeys.some((key) => typeof key !== 'string' ||
        !key.startsWith(prefix) || !PAGE_KEY_RE.test(key.slice(prefix.length))))) {
    throw unavailable('invalid backup parts');
  }
  return { manifest, keys: () => manifest.partKeys || Array.from({ length: manifest.parts }, (_, i) => numberedPart(date, i + 1)) };
}

async function backupFor(b: R2, date: string) {
  if (!DATE_RE.test(date)) throw invalid('date', 'YYYY-MM-DD');
  const catalog = (await readCatalog(b)).value;
  if (catalog.retiredLegacy.includes(date)) throw new ApiError('NOT_FOUND', 'no finished backup for that day');
  const item = catalog.items.find((m) => m.date === date);
  const resolved = await resolveManifest(b, { date, manifestKey: item?.manifestKey });
  if (!resolved) {
    if (item) throw unavailable('backup manifest is missing');
    throw new ApiError('NOT_FOUND', 'no finished backup for that day');
  }
  return resolved;
}

export async function listBackups(env: Env) {
  const b = bucket(env);
  const catalog = await readCatalog(b);
  const legacy = await legacyCandidates(env, b);
  const items: BackupSummary[] = [];
  let unchecked = 39;
  for (const m of candidates(catalog.value, legacy)) {
    if (m.item) { items.push(m.item); continue; }
    if (--unchecked < 0) break;
    try {
      const resolved = await resolveManifest(b, m);
      if (resolved) items.push(summaryOf(resolved.manifest));
    } catch (e) { if (!(e instanceof ApiError)) throw e; }
  }
  const running = catalog.value.running || (!catalog.etag ? await readJson<State>(env, STATE_KEY) : null);
  return { items, running: running ? { date: running.date, docs: running.docs, startedAt: running.startedAt } : null };
}

async function pageObject(b: R2, key: string) {
  const o = await b.get(key);
  if (!o) throw unavailable('backup part is missing');
  return o;
}

type ResolvedBackup = NonNullable<Awaited<ReturnType<typeof resolveManifest>>>;

async function preflightParts(b: R2, resolved: ResolvedBackup) {
  if (resolved.manifest.parts > MAX_PART_READS) throw unavailable('backup has too many parts to read in one request');
  const parts = resolved.keys();
  if (!parts.length) return parts;
  const first = parts[0];
  const prefix = resolved.manifest.partKeys ? first.slice(0, first.lastIndexOf('/') + 1) : `${BACKUPS}${resolved.manifest.date}/part-`;
  const { objects, truncated } = await b.list({ prefix, limit: 1000 });
  if (truncated) throw unavailable('backup pages could not be verified');
  const sizes = new Map(objects.map((o) => [o.key, o.size]));
  if (parts.some((key) => !sizes.has(key))) throw unavailable('backup part is missing');
  if (parts.reduce((total, key) => total + sizes.get(key)!, 0) !== resolved.manifest.bytes) {
    throw unavailable('backup size does not match manifest');
  }
  return parts;
}

/** Preflight all pages before response headers, then stream the pinned manifest's parts. */
export async function downloadBackup(env: Env, date: string): Promise<Response> {
  const b = bucket(env);
  const parts = await preflightParts(b, await backupFor(b, date));
  const { readable, writable } = new TransformStream();
  (async () => {
    for (const key of parts) await (await pageObject(b, key)).body.pipeTo(writable, { preventClose: true });
    await writable.close();
  })().catch((e) => writable.abort(e).catch(() => {}));
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': `attachment; filename="havat-ravve-backup-${date}.ndjson"`, 'cache-control': 'no-store' } });
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const FIRESTORE_NAME = /^projects\/[^/]+\/databases\/[^/]+\/documents(?:\/[^/]+\/[^/]+)+$/;
const VALUE_TYPES = new Set(['nullValue', 'booleanValue', 'integerValue', 'doubleValue', 'timestampValue', 'stringValue', 'bytesValue', 'referenceValue', 'geoPointValue', 'arrayValue', 'mapValue']);
function validValue(v: unknown): boolean {
  if (!isObject(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== 1 || !VALUE_TYPES.has(keys[0])) return false;
  const value = v[keys[0]];
  switch (keys[0]) {
    case 'mapValue': return isObject(value) && (value.fields === undefined || validFields(value.fields));
    case 'arrayValue': return isObject(value) && (value.values === undefined || (Array.isArray(value.values) && value.values.every(validValue)));
    case 'geoPointValue': return isObject(value) && typeof value.latitude === 'number' && Math.abs(value.latitude) <= 90 &&
      typeof value.longitude === 'number' && Math.abs(value.longitude) <= 180;
    case 'nullValue': return value === null || value === 'NULL_VALUE';
    case 'booleanValue': return typeof value === 'boolean';
    case 'doubleValue': return typeof value === 'number' || ['NaN', 'Infinity', '-Infinity'].includes(String(value));
    case 'integerValue': return typeof value === 'string' && /^-?\d+$/.test(value) &&
      BigInt(value) >= -(2n ** 63n) && BigInt(value) < 2n ** 63n;
    case 'timestampValue': return typeof value === 'string' && Number.isFinite(Date.parse(value));
    case 'referenceValue': return typeof value === 'string' && FIRESTORE_NAME.test(value);
    case 'bytesValue': return typeof value === 'string' && /^[A-Za-z0-9+/_-]*={0,2}$/.test(value);
    default: return typeof value === 'string';
  }
}
const validFields = (v: unknown): boolean => isObject(v) && Object.values(v).every(validValue);

/** Validate every row while streaming each page, retaining only the documents the caller requested. */
async function readDocs(b: R2, resolved: ResolvedBackup, want: (d: RawDoc) => boolean, root?: string) {
  const docs: RawDoc[] = [];
  let count = 0, bytes = 0;
  const readLine = (line: string) => {
    if (!line) return;
    let d: RawDoc;
    try { d = JSON.parse(line) as RawDoc; } catch { throw unavailable('invalid backup record'); }
    if (!d || typeof d.name !== 'string' || !FIRESTORE_NAME.test(d.name) ||
        (root && !d.name.startsWith(root + '/')) || (d.fields !== undefined && !validFields(d.fields))) {
      throw unavailable('invalid backup record');
    }
    count++;
    if (want(d)) docs.push(d);
  };
  for (const key of resolved.keys()) {
    const o = await pageObject(b, key);
    bytes += o.size;
    const reader = o.body.pipeThrough(new TextDecoderStream('utf-8', { fatal: true })).getReader();
    let tail = '';
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        const lines = (tail + chunk.value).split('\n');
        tail = lines.pop()!;
        for (const line of lines) readLine(line);
      }
      readLine(tail);
    } catch (e) {
      await reader.cancel().catch(() => {});
      if (e instanceof ApiError) throw e;
      throw unavailable('backup part could not be read');
    } finally { reader.releaseLock(); }
  }
  const m = resolved.manifest;
  if (count !== m.docs || bytes !== m.bytes) {
    throw unavailable('backup contents do not match manifest');
  }
  return docs;
}

async function docsOf(b: R2, date: string, want: (path: string) => boolean) {
  const resolved = await backupFor(b, date);
  if (resolved.manifest.parts > MAX_PART_READS) throw unavailable('backup has too many parts to read in one request');
  return readDocs(b, resolved, (d) => want(pathOf(d.name)));
}

export async function backupHistory(env: Env, name: string, days: number) {
  const seen: { date: string; doc: RawDoc | null; unavailable?: true }[] = [];
  if (!env.FILE_BUCKET || !days) return { seen, truncated: false };
  // Include the catalog and any fallback listing in the 40-read limit.
  let reads = 0;
  const b = env.FILE_BUCKET;
  const counted = { ...b, get: (key: string) => { reads++; return b.get(key); }, list: (opts: Parameters<R2['list']>[0]) => { reads++; return b.list(opts); } };
  const catalog = (await readCatalog(counted)).value;
  const legacy = await legacyCandidates(env, counted);
  for (const candidate of candidates(catalog, legacy)) {
    if (seen.length >= days) break;
    if (reads === HISTORY_READS) return { seen, truncated: true };
    const { date } = candidate;
    try {
      const manifest = await resolveManifest(counted, candidate);
      if (!manifest) {
        if (candidate.item) seen.push({ date, doc: null, unavailable: true });
        continue;
      }
      if (reads + manifest.manifest.parts > HISTORY_READS) return { seen, truncated: true };
      const [doc] = await readDocs(counted, manifest, (d) => d.name === name);
      seen.push({ date, doc: doc || null });
    } catch {
      seen.push({ date, doc: null, unavailable: true });
    }
  }
  return { seen, truncated: false };
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
  const b = bucket(env);
  const resolved = await backupFor(b, date);
  const tooMany = () => invalid('paths', 'this restore exceeds the request budget; choose fewer records', 'השחזור גדול מדי לפעולה אחת. בחרו פחות רשומות ונסו שוב.');
  const budget = 38; // reserve 10 for authentication/audit and 2 for catalog and manifest
  const parts = resolved.manifest.parts;
  if (parts > MAX_PART_READS) throw unavailable('backup has too many parts to restore in one request');
  const docs = await readDocs(b, resolved, (d) => want.has(pathOf(d.name)), fs.root);
  if (new Set(docs.map((d) => d.name)).size !== docs.length) throw unavailable('backup contains duplicate records');
  if (!docs.length) throw new ApiError('NOT_FOUND', 'none of those documents are in this backup');
  const getCalls = Math.ceil(docs.length / 100);
  if (parts + getCalls + Math.ceil(docs.length / 400) > budget) throw tooMany();
  // what is there now goes to the recycle bin first (30 days), so a restore can itself be undone
  const now: RawDoc[] = [];
  for (let i = 0; i < docs.length; i += 100) now.push(...await fs.rawGet(docs.slice(i, i + 100).map((d) => d.name)));
  const current = new Map(now.map((d) => [d.name, d]));
  // a person's profile (role, status) is changed in the people screen: a restore only brings back one that is gone
  const people = new Set(docs.filter((d) => lastCollection(pathOf(d.name)) === 'users' && current.has(d.name)));
  const todo = docs.filter((d) => !people.has(d));
  const keep = todo.map((d) => current.get(d.name)).filter((d): d is RawDoc => !!d);
  const writes: Write[] = todo.map((d) => ({ update: { name: d.name, fields: d.fields || {} } }));
  if (parts + getCalls + Math.ceil(writes.length / 400) + (fs.trash ? keep.length : 0) > budget) throw tooMany();
  if (keep.length && fs.trash) await fs.trash.put(keep);
  for (let i = 0; i < writes.length; i += 400) await fs.commit(writes.slice(i, i + 400));
  return { restored: todo.length, missing: paths.length - docs.length, skippedPeople: [...people].map((d) => pathOf(d.name)), keptInTrash: keep.length, paths: todo.map((d) => pathOf(d.name)) };
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
