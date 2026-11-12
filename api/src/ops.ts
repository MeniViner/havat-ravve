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

/** Documents per Firestore round trip when reading the team. */
const PEOPLE_PAGE = 500;
/** The most active profiles one search reads per team role. Past this the answer says it is incomplete. */
const PEOPLE_MAX_PER_ROLE = 2000;

/**
 * Every active profile with this role, read in pages by document name. `complete` is false when the role
 * has more profiles than one search is allowed to read; the caller must then say so, not guess.
 */
async function activeWithRole(fs: Firestore, role: string): Promise<{ docs: Doc[]; complete: boolean }> {
  const eq = (field: string, value: string) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } });
  const docs: Doc[] = [];
  for (;;) {
    const want = Math.min(PEOPLE_PAGE, PEOPLE_MAX_PER_ROLE - docs.length);
    const last = docs[docs.length - 1];
    const page = await fs.query({
      from: [{ collectionId: 'users' }],
      select: { fields: [{ fieldPath: 'displayName' }, { fieldPath: 'role' }] },
      // The role is filtered in Firestore, so guests (most profiles) are never read and never use up the
      // scan. Equality filters ordered by document name need no composite index.
      where: { compositeFilter: { op: 'AND', filters: [eq('status', 'active'), eq('role', role)] } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      ...(last ? { startAt: { values: [{ referenceValue: last.name }], before: false } } : {}),
      // one more than wanted: tells whether anything is left without another round trip
      limit: want + 1,
    });
    docs.push(...page.slice(0, want));
    if (page.length <= want) return { docs, complete: true };
    if (docs.length >= PEOPLE_MAX_PER_ROLE) return { docs, complete: false };
  }
}

/** One role after the other: a cold start then signs a single Google token, not one per parallel query. */
async function teamMembers(fs: Firestore): Promise<{ docs: Doc[]; complete: boolean }> {
  const docs: Doc[] = [];
  let complete = true;
  for (const role of TEAM_ROLES) {
    const r = await activeWithRole(fs, role);
    docs.push(...r.docs.filter((d) => typeof d.data.displayName === 'string'));
    complete &&= r.complete;
  }
  return { docs, complete };
}

export async function searchPeople(fs: Firestore, caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'people:read');
  const raw = Object.fromEntries(query);
  const { q } = validate(operation('people.search')!.params!, raw, true) as { q: string };
  const nq = normName(q);
  const team = await teamMembers(fs);
  const people = team.docs.map((d) => ({ uid: d.id, name: String(d.data.displayName), role: String(d.data.role), n: normName(String(d.data.displayName)) }));
  const exact = people.filter((p) => p.n === nq);
  const prefix = exact.length ? [] : people.filter((p) => p.n.startsWith(nq) || p.n.split(' ').some((w) => w.startsWith(nq)));
  const hits = (exact.length ? exact : prefix).sort((a, b) => a.name.localeCompare(b.name, 'he')).slice(0, 10);
  return {
    query: q,
    match: exact.length ? 'exact' : prefix.length ? 'prefix' : 'none',
    // an incomplete search cannot rule out a second person with the same name
    ambiguous: hits.length > 1 || (!team.complete && hits.length > 0),
    complete: team.complete,
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
      // acknowledged: from here on the write is stored, and readBack reports a failed read without throwing
      return { ...result, data: await readBack(result.data), replayed: false };
    } catch (e) {
      // also after an uncertain commit: frees the transaction's locks, and is a no-op if it did commit
      await fs.rollback(tx);
      if (e instanceof ApiError) throw e;
      if (isContention(e) && attempt < 6) { await backoff(attempt); continue; }
      if (committing && isUncertain(e)) {
        // The commit was sent and may have landed (no answer, a 5xx, or a 2xx whose body never arrived).
        // It is never sent again from here. The idempotency record, written in the same commit, says
        // whether it landed; if the record is missing or cannot be read, the honest answer is "unknown".
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

function activity(fs: Firestore, caller: Caller, refId: string, action: string, text: string, subjectUid = '', kind: 'task' | 'shopping' = 'task'): Write {
  return fs.create('activity', autoId(), { kind, refId, action, text: text.slice(0, 500), by: caller.actor.person, at: nowIso(), subjectUid, eventId: '' });
}

/**
 * Reads the task back after a write. It runs only once the write is known to be stored (the commit was
 * acknowledged, or its idempotency record was found), so it never throws: a read that fails here must not
 * turn a stored write into an error or into "outcome unknown". The caller gets the stored result with
 * "verified": false and "readBack": "unavailable" instead.
 */
const readBackTask = (fs: Firestore, caller: Caller) => async (data: Record<string, unknown>) => {
  const id = String(data.taskId);
  let d: Doc | null;
  try {
    d = await fs.get('tasks', id);
  } catch {
    const { expected: _unchecked, ...stored } = data;
    return { ...stored, task: null, verified: false, readBack: 'unavailable' };
  }
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

/** tasks.complete and tasks.reopen: exactly what setTaskDone() in src/app/store.ts writes, plus its activity. */
async function setTaskDone(fs: Firestore, caller: Caller, op: 'tasks.complete' | 'tasks.reopen', body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'tasks:complete');
  const input = validate(operation(op)!.body!, body) as { taskId: string };
  const done = op === 'tasks.complete';
  return idempotent(fs, caller, op, key, input, async (tx) => {
    const t = await fs.get('tasks', input.taskId, tx);
    if (!t || !visible(t.data, caller)) throw new ApiError('NOT_FOUND', 'task not found');
    const data = t.data as TaskData;
    if (!!data.done === done) return { writes: [], data: { taskId: t.id, changed: false, expected: { done } } };
    const now = nowIso();
    const patch = done
      ? { done: true, doneBy: caller.actor.person, doneAt: now, updatedAt: now }
      : { done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', updatedAt: now };
    const writes = [
      fs.patch('tasks', t.id, patch, t.updateTime),
      activity(fs, caller, t.id, done ? 'done' : 'undone', activityText(data), (data.assignee as Person | null)?.uid || ''),
    ];
    return { writes, data: { taskId: t.id, changed: true, expected: done ? { done: true, doneBy: caller.actor.person } : { done: false, doneBy: null } } };
  }, readBackTask(fs, caller));
}
export const completeTask = (fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) => setTaskDone(fs, caller, 'tasks.complete', body, key);
export const reopenTask = (fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) => setTaskDone(fs, caller, 'tasks.reopen', body, key);

// ---------- shopping ----------

export const SHOPPING_CATEGORIES = ['super', 'building', 'online', 'giveaway'] as const;
type Category = (typeof SHOPPING_CATEGORIES)[number];
/** Same labels as CATEGORY_LABELS in src/app/types.ts, used in the activity text. */
const CATEGORY_HE: Record<Category, string> = { super: 'סופר', building: 'חומרי בניין', online: 'אינטרנט', giveaway: 'מוצרי מסירה' };
const itemText = (d: Record<string, unknown>) => `${d.title}${d.qty ? ' · ' + d.qty : ''}`;

function publicItem(id: string, d: Record<string, unknown>) {
  return {
    id, title: d.title, qty: d.qty || '', note: d.note || '', link: d.link || '', category: d.category, urgent: !!d.urgent,
    bought: !!d.bought, boughtBy: d.boughtBy ?? null, boughtAt: d.boughtAt ?? null,
    createdBy: d.createdBy ?? null, createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
}

export async function listShopping(fs: Firestore, caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'shopping:read');
  const raw: Record<string, string> = {};
  for (const [k, v] of query) { if (k in raw) throw invalid(k, `"${k}" given twice`); raw[k] = v; }
  const p = validate(operation('shopping.list')!.params!, raw, true) as { bought: boolean; category: Category | null; limit: number };
  const filters: Record<string, unknown>[] = [{ fieldFilter: { field: { fieldPath: 'bought' }, op: 'EQUAL', value: enc(p.bought) } }];
  if (p.category) filters.push({ fieldFilter: { field: { fieldPath: 'category' }, op: 'EQUAL', value: enc(p.category) } });
  const docs = await fs.query({
    from: [{ collectionId: 'shopping' }],
    where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } },
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: p.limit + 1,
  });
  return { items: docs.slice(0, p.limit).map((d) => publicItem(d.id, d.data)), hasMore: docs.length > p.limit };
}

const readBackItem = (fs: Firestore) => async (data: Record<string, unknown>) => {
  const id = String(data.itemId);
  let d: Doc | null;
  try { d = await fs.get('shopping', id); } catch {
    const { expected: _unchecked, ...stored } = data;
    return { ...stored, item: null, verified: false, readBack: 'unavailable' };
  }
  if (!d) return { ...data, item: null, verified: false };
  const item = publicItem(d.id, d.data);
  const expected = data.expected as Record<string, unknown> | undefined;
  const verified = !expected || Object.entries(expected).every(([k, v]) => canonical((item as Record<string, unknown>)[k]) === canonical(v));
  const { expected: _drop, ...rest } = data;
  return { ...rest, item, verified };
};

/** shopping.add: exactly the shape addShopping() in src/app/store.ts writes, plus its activity. */
export async function addShopping(fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'shopping:write');
  const input = validate(operation('shopping.add')!.body!, body) as { title: string; qty: string | null; category: Category; urgent: boolean; note: string | null };
  return idempotent(fs, caller, 'shopping.add', key, input, async () => {
    const id = autoId();
    const now = nowIso();
    const item = {
      title: input.title, qty: input.qty || '', note: input.note || '', link: '', category: input.category, urgent: input.urgent,
      createdBy: caller.actor.person, createdAt: now, bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now,
    };
    const writes = [fs.create('shopping', id, item), activity(fs, caller, id, 'added', `${itemText(item)} (${CATEGORY_HE[input.category]})`, '', 'shopping')];
    const expected = { title: item.title, qty: item.qty, category: item.category, urgent: item.urgent, bought: false };
    return { status: 201, writes, data: { itemId: id, expected } };
  }, readBackItem(fs));
}

/** shopping.setBought: what setBought() in src/app/store.ts writes, including the 24-hour expireAt. */
export async function setBought(fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'shopping:write');
  const input = validate(operation('shopping.setBought')!.body!, body) as { itemId: string; bought: boolean };
  return idempotent(fs, caller, 'shopping.setBought', key, input, async (tx) => {
    const it = await fs.get('shopping', input.itemId, tx);
    if (!it) throw new ApiError('NOT_FOUND', 'shopping item not found');
    if (!!it.data.bought === input.bought) return { writes: [], data: { itemId: it.id, changed: false, expected: { bought: input.bought } } };
    const now = nowIso();
    const patch = input.bought
      ? { bought: true, boughtBy: caller.actor.person, boughtAt: now, expireAt: new Date(Date.now() + 24 * 3600_000).toISOString(), updatedAt: now }
      : { bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now };
    const action = input.bought ? (it.data.category === 'giveaway' ? 'found' : 'bought') : 'unbought';
    const writes = [fs.patch('shopping', it.id, patch, it.updateTime), activity(fs, caller, it.id, action, itemText(it.data), '', 'shopping')];
    return { writes, data: { itemId: it.id, changed: true, expected: input.bought ? { bought: true, boughtBy: caller.actor.person } : { bought: false, boughtBy: null } } };
  }, readBackItem(fs));
}
