// Imports from Excel (the console's ייבוא screen) that can still be undone, until the end of the next day in Israel. The
// newest 20 live in one KV record (console:imports), written when an import is saved and when its undo ends.
//
// An undo deletes the records the way the console's own delete does (so they land in the recycle bin), only those
// nobody touched since: a record whose version is still its first one, made in the hour before the import was saved.
// Each call does one step (STEP records, about STEP + 12 of the free plan's 50 subrequests) and looks at the records
// themselves to know what is left, so a repeated or lost call does no harm.
import { ApiError, invalid } from './http';
import { type Env, Firestore, FsError } from './firestore';
import { ilDate } from './backup';
import { isoFromIL } from './writes';
import { UUID_RE, autoId, sleep } from './util';

const KEY = 'console:imports';
const KEEP = 20;
const MAX_IDS = 200;
const STEP = 25;
const KINDS = ['tasks', 'shopping'] as const;
type Kind = (typeof KINDS)[number];
export type ImportBatch = { id: string; kind: Kind; at: string; by: string; count: number; undoUntil: string; undone: boolean };
/** ids: dropped once the undo is done or its time passed. idem: the request's key, so a resent save is the same import. */
type Stored = ImportBatch & { ids: string[]; idem?: string };
const view = ({ ids: _ids, idem: _idem, ...b }: Stored): ImportBatch => b;

async function read(env: Env): Promise<Stored[]> {
  if (!env.TOKEN_KV) throw new ApiError('INTERNAL', 'TOKEN_KV is not bound');
  // a failed read must not look like an empty list: the next save would erase it
  const raw = await env.TOKEN_KV.get(KEY);
  try { const j = JSON.parse(raw || '[]'); return Array.isArray(j) ? j : []; } catch { return []; }
}
const save = (env: Env, all: Stored[]) => env.TOKEN_KV!.put(KEY, JSON.stringify(all.slice(0, KEEP).map((b) => (b.undone || Date.parse(b.undoUntil) < Date.now() ? { ...b, ids: [] } : b))));

/** The last moment of the next day in Israel. */
export function undoUntil(now = new Date()): string {
  const [y, m, d] = ilDate(now).split('-').map(Number);
  const dayAfterNext = new Date(Date.UTC(y, m - 1, d + 2)).toISOString().slice(0, 10);
  return new Date(Date.parse(isoFromIL(dayAfterNext)) - 1000).toISOString();
}

export async function listImports(env: Env) {
  return { items: (await read(env)).map(view) };
}

export async function saveImport(env: Env, b: Record<string, unknown>, by: string, key: string | null): Promise<ImportBatch> {
  for (const k of Object.keys(b)) if (!['kind', 'ids'].includes(k)) throw invalid(k, `unknown field ${k}`);
  if (!(KINDS as readonly unknown[]).includes(b.kind)) throw invalid('kind', 'tasks or shopping');
  if (key && !UUID_RE.test(key)) throw invalid('Idempotency-Key', 'Idempotency-Key must be a UUID');
  const ids = b.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || ids.some((x) => typeof x !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(x))) throw invalid('ids', `1 to ${MAX_IDS} record ids`, 'אפשר לשמור ייבוא של עד 200 רשומות');
  const all = await read(env);
  const again = key ? all.find((x) => x.idem === key) : undefined;
  if (again) return view(again);
  const unique = [...new Set(ids as string[])];
  const now = new Date();
  const batch: Stored = { id: 'imp-' + autoId(16), kind: b.kind as Kind, at: now.toISOString(), by, count: unique.length, undoUntil: undoUntil(now), undone: false, ids: unique, ...(key ? { idem: key } : {}) };
  await save(env, [batch, ...all]);
  return view(batch);
}

export async function importById(env: Env, id: string): Promise<Stored> {
  const batch = (await read(env)).find((x) => x.id === id);
  if (!batch) throw new ApiError('NOT_FOUND', 'no such import');
  return batch;
}

/** One step. removed: in this call; kept: changed or not this import's (told by the last call, when left is 0). */
export async function undoImport(env: Env, fs: Firestore, batch: Stored): Promise<{ removed: number; kept: number; left: number }> {
  if (batch.undone) return { removed: 0, kept: 0, left: 0 };
  if (Date.parse(batch.undoUntil) < Date.now()) throw invalid('id', 'the time to undo this import has passed', 'אפשר לבטל ייבוא רק עד סוף היום שאחריו');
  const docs = await fs.rawGet(batch.ids.map((id) => fs.name(batch.kind, id)), ['createdAt']);
  const at = Date.parse(batch.at);
  const untouched = docs.filter((d) => {
    const made = Date.parse(d.createTime || '');
    return !!d.updateTime && d.createTime === d.updateTime && made <= at + 60_000 && made > at - 3600_000;
  });
  const step = untouched.slice(0, STEP);
  let removed = 0;
  if (step.length) {
    try {
      await fs.commit(step.map((d) => ({ delete: d.name, currentDocument: { updateTime: d.updateTime } })));
      removed = step.length;
    } catch (e) {
      // someone changed or deleted one of them just now: nothing of this step was removed, the next call looks again
      if (!(e instanceof FsError && ['FAILED_PRECONDITION', 'NOT_FOUND', 'ABORTED'].includes(e.status))) throw e;
    }
  }
  const left = untouched.length - removed;
  if (left > 0) return { removed, kept: 0, left };
  const done = async () => { const all = await read(env); await save(env, all.map((x) => (x.id === batch.id ? { ...x, undone: true } : x))); };
  // KV takes one write a second per key: wait and try once more before giving up
  await done().catch(async () => { await sleep(1200); await done(); });
  return { removed, kept: docs.length - untouched.length, left: 0 };
}
