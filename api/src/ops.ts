// The operations. Each one mirrors what the app's facade (src/app/store.ts) writes for the same action,
// including the activity record, but does it atomically in one Firestore transaction.
import { ApiError, invalid } from './http';
import { type Caller, requireScope, seesManagerTasks } from './auth';
import { operation } from './catalog';
import { type Doc, Firestore, type Write, backoff, enc, isContention, isUncertain, toApiError } from './firestore';
import { UUID_RE, autoId, b64url, canonical, normName, sha256hex, validate } from './util';

type Person = { uid: string; name: string };
type TaskData = Record<string, unknown> & { title: string; managersOnly: boolean; assignee: Person | null };

const TEAM_ROLES = new Set(['owner', 'manager', 'staff']);
const nowIso = () => new Date().toISOString();
/** Same truncation the app uses for activity text (store.ts taskText). */
const taskText = (title: string) => (title.length > 60 ? title.slice(0, 60) + '…' : title);
/** Activity text for a task. Manager-only titles never go into the log, which team members can read. */
const activityText = (t: { title: string; managersOnly: boolean }) => (t.managersOnly ? 'משימת מנהלים' : taskText(t.title));

/** What callers see of a task: no base64 photos, no manager-only flag for team members. */
function publicTask(id: string, t: Record<string, unknown>, caller: Caller) {
  return {
    id,
    title: t.title,
    note: t.note || '',
    dueDate: t.dueDate || null,
    urgent: !!t.urgent,
    done: !!t.done,
    doneAt: t.doneAt ?? null,
    doneBy: t.doneBy ?? null,
    assignee: t.assignee ?? null,
    createdBy: t.createdBy ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    hasPhoto: !!t.photo,
    recurring: !!t.templateId,
    ...(seesManagerTasks(caller.actor) ? { managersOnly: !!t.managersOnly } : {}),
  };
}

const visible = (t: Record<string, unknown>, caller: Caller) => !t.managersOnly || seesManagerTasks(caller.actor);

// ---------- reads ----------

export async function getTask(fs: Firestore, caller: Caller, id: string) {
  requireScope(caller, 'tasks:read');
  validate(operation('tasks.get')!.pathParams!, { id });
  const d = await fs.get('tasks', id);
  // a hidden task looks exactly like a missing one
  if (!d || !visible(d.data, caller)) throw new ApiError('NOT_FOUND', 'task not found');
  return { task: publicTask(d.id, d.data, caller) };
}

type Cursor = { c: string; n: string; f: string };

export async function listTasks(fs: Firestore, caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'tasks:read');
  const raw: Record<string, string> = {};
  for (const [k, v] of query) { if (k in raw) throw invalid(k, `"${k}" given twice`); raw[k] = v; }
  const p = validate(operation('tasks.list')!.params!, raw, true) as { assignee: string | null; date: string | null; done: boolean | null; limit: number; cursor: string | null };

  const filters: Record<string, unknown>[] = [];
  const eq = (field: string, value: unknown) => filters.push({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } });
  if (!seesManagerTasks(caller.actor)) eq('managersOnly', false);
  if (p.assignee) eq('assignee.uid', p.assignee);
  if (p.date) eq('dueDate', p.date);
  if (p.done !== null) eq('done', p.done);
  const fingerprint = (await sha256hex(canonical({ a: p.assignee, d: p.date, x: p.done, m: seesManagerTasks(caller.actor) }))).slice(0, 16);

  let startAt: Record<string, unknown> | undefined;
  if (p.cursor) {
    let c: Cursor;
    try { c = JSON.parse(b64url.decode(p.cursor)); } catch { throw invalid('cursor', 'cursor is not valid'); }
    if (!c || typeof c.c !== 'string' || typeof c.n !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(c.n)) throw invalid('cursor', 'cursor is not valid');
    if (c.f !== fingerprint) throw invalid('cursor', 'cursor belongs to a different filter');
    startAt = { values: [{ stringValue: c.c }, { referenceValue: fs.name('tasks', c.n) }], before: false };
  }

  const docs = await fs.query({
    from: [{ collectionId: 'tasks' }],
    ...(filters.length ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } : {}),
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }, { field: { fieldPath: '__name__' }, direction: 'DESCENDING' }],
    ...(startAt ? { startAt } : {}),
    limit: p.limit + 1,
  });
  const page = docs.slice(0, p.limit);
  const hasMore = docs.length > p.limit;
  const last = page[page.length - 1];
  return {
    items: page.map((d) => publicTask(d.id, d.data, caller)),
    hasMore,
    nextCursor: hasMore && last ? b64url.encode(JSON.stringify({ c: String(last.data.createdAt), n: last.id, f: fingerprint })) : null,
  };
}

async function teamMembers(fs: Firestore): Promise<Doc[]> {
  const docs = await fs.query({
    from: [{ collectionId: 'users' }],
    select: { fields: [{ fieldPath: 'displayName' }, { fieldPath: 'role' }, { fieldPath: 'status' }] },
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'active' } } },
    limit: 1000,
  });
  return docs.filter((d) => TEAM_ROLES.has(String(d.data.role)) && typeof d.data.displayName === 'string');
}

export async function searchPeople(fs: Firestore, caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'people:read');
  const raw = Object.fromEntries(query);
  const { q } = validate(operation('people.search')!.params!, raw, true) as { q: string };
  const nq = normName(q);
  const people = (await teamMembers(fs)).map((d) => ({ uid: d.id, name: String(d.data.displayName), role: String(d.data.role), n: normName(String(d.data.displayName)) }));
  const exact = people.filter((p) => p.n === nq);
  const prefix = exact.length ? [] : people.filter((p) => p.n.startsWith(nq) || p.n.split(' ').some((w) => w.startsWith(nq)));
  const hits = (exact.length ? exact : prefix).sort((a, b) => a.name.localeCompare(b.name, 'he')).slice(0, 10);
  return {
    query: q,
    match: exact.length ? 'exact' : prefix.length ? 'prefix' : 'none',
    ambiguous: hits.length > 1,
    candidates: hits.map(({ uid, name, role }) => ({ uid, name, role })),
  };
}

// ---------- writes ----------

type WriteResult = { status: number; data: Record<string, unknown> };

/**
 * Runs a write exactly once per (actor, operation, Idempotency-Key). The idempotency record, the entity
 * and its activity are committed in one transaction, with a create-precondition on the record, so two
 * racing requests with the same key cannot both write. After a commit whose outcome is unknown, the
 * record is read back before anything is retried.
 */
async function idempotent(
  fs: Firestore, caller: Caller, op: string, key: string | null, input: Record<string, unknown>,
  run: (tx: string) => Promise<{ writes: Write[]; data: Record<string, unknown>; status?: number }>,
  readBack: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<WriteResult & { replayed: boolean }> {
  if (!key) throw invalid('Idempotency-Key', 'Idempotency-Key header is required for writes');
  if (!UUID_RE.test(key)) throw invalid('Idempotency-Key', 'Idempotency-Key must be a UUID');
  // namespaced by credential and actor: the same key from anyone else is a different key
  const recordId = await sha256hex(`${caller.credentialId}\n${caller.actor.id}\n${op}\n${key.toLowerCase()}`);
  const payloadHash = await sha256hex(canonical(input));

  const replay = async (rec: Doc) => {
    if (rec.data.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 'this Idempotency-Key was already used with a different payload', { operation: op });
    const stored = JSON.parse(String(rec.data.response)) as WriteResult;
    return { status: 200, data: await readBack(stored.data), replayed: true };
  };

  for (let attempt = 0; ; attempt++) {
    const tx = await fs.begin();
    let committing = false;
    try {
      const existing = await fs.get('api_idempotency', recordId, tx);
      if (existing) { await fs.rollback(tx); return await replay(existing); }
      const r = await run(tx);
      const result: WriteResult = { status: r.status ?? 200, data: r.data };
      const record = fs.create('api_idempotency', recordId, {
        actor: caller.actor.id, credential: caller.credentialId, operation: op, payloadHash,
        response: JSON.stringify(result), createdAt: nowIso(),
      });
      committing = true;
      await fs.commit([record, ...r.writes], tx);
      return { ...result, data: await readBack(result.data), replayed: false };
    } catch (e) {
      // also after an uncertain commit: frees the transaction's locks, and is a no-op if it did commit
      await fs.rollback(tx);
      if (e instanceof ApiError) throw e;
      if (isContention(e) && attempt < 6) { await backoff(attempt); continue; }
      if (committing && isUncertain(e)) {
        // the commit may have landed: look before deciding
        const rec = await fs.get('api_idempotency', recordId).catch(() => null);
        if (rec) return await replay(rec);
        throw new ApiError('OUTCOME_UNKNOWN', 'the write was not acknowledged; resend with the same Idempotency-Key', { operation: op });
      }
      throw toApiError(e);
    }
  }
}

async function resolveAssignee(fs: Firestore, uid: string, tx: string): Promise<Person> {
  const u = await fs.get('users', uid, tx);
  if (!u || u.data.status !== 'active' || !TEAM_ROLES.has(String(u.data.role))) throw invalid('assignee', 'assignee is not an active team member');
  return { uid: u.id, name: String(u.data.displayName || '').slice(0, 80) };
}

function activity(fs: Firestore, caller: Caller, refId: string, action: string, text: string, subjectUid = ''): Write {
  return fs.create('activity', autoId(), { kind: 'task', refId, action, text: text.slice(0, 500), by: caller.actor.person, at: nowIso(), subjectUid, eventId: '' });
}

const readBackTask = (fs: Firestore, caller: Caller) => async (data: Record<string, unknown>) => {
  const id = String(data.taskId);
  const d = await fs.get('tasks', id);
  if (!d || !visible(d.data, caller)) return { ...data, task: null, verified: false };
  const task = publicTask(d.id, d.data, caller);
  const expected = data.expected as Record<string, unknown> | undefined;
  const verified = !expected || Object.entries(expected).every(([k, v]) => canonical((task as Record<string, unknown>)[k]) === canonical(v));
  const { expected: _drop, ...rest } = data;
  return { ...rest, task, verified };
};

export async function createTask(fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'tasks:create');
  const input = validate(operation('tasks.create')!.body!, body) as { title: string; assignee: string | null; dueDate: string | null; urgent: boolean };
  if (input.assignee && input.assignee !== caller.actor.person.uid) requireScope(caller, 'tasks:assign');

  return idempotent(fs, caller, 'tasks.create', key, input, async (tx) => {
    const assignee = input.assignee ? await resolveAssignee(fs, input.assignee, tx) : null;
    const id = autoId();
    const now = nowIso();
    // exactly the shape addTask() in src/app/store.ts writes, so the app and the Rules accept it
    const task: TaskData = {
      title: input.title, note: '', photo: '', location: null, dueDate: input.dueDate || '', managersOnly: false,
      templateId: null, dateKey: null, createdBy: caller.actor.person, createdAt: now, done: false, doneBy: null, doneAt: null,
      donePhoto: '', doneNote: '', assignee, urgent: input.urgent, updatedAt: now,
    };
    const writes = [fs.create('tasks', id, task), activity(fs, caller, id, 'created', activityText(task), assignee?.uid || '')];
    if (assignee && assignee.uid !== caller.actor.person.uid) writes.push(activity(fs, caller, id, 'assigned', `${activityText(task)} ← ${assignee.name}`, assignee.uid));
    const expected = { title: task.title, dueDate: task.dueDate || null, urgent: task.urgent, assignee, done: false };
    return { status: 201, writes, data: { taskId: id, expected } };
  }, readBackTask(fs, caller));
}

export async function assignTask(fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'tasks:assign');
  const input = validate(operation('tasks.assign')!.body!, body) as { taskId: string; assignee: string };

  return idempotent(fs, caller, 'tasks.assign', key, input, async (tx) => {
    const t = await fs.get('tasks', input.taskId, tx);
    if (!t || !visible(t.data, caller)) throw new ApiError('NOT_FOUND', 'task not found');
    const assignee = await resolveAssignee(fs, input.assignee, tx);
    const current = t.data.assignee as Person | null;
    const expected = { assignee };
    if (current?.uid === assignee.uid) return { writes: [], data: { taskId: t.id, changed: false, expected } };
    const data = t.data as TaskData;
    const writes = [
      fs.patch('tasks', t.id, { assignee, updatedAt: nowIso() }, t.updateTime),
      activity(fs, caller, t.id, 'assigned', `${activityText(data)} ← ${assignee.name}`, assignee.uid),
    ];
    return { writes, data: { taskId: t.id, changed: true, expected } };
  }, readBackTask(fs, caller));
}
