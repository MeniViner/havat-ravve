// The operations. Each one mirrors what the app's facade (src/app/store.ts) writes for the same action,
// including the activity record, but does it atomically in one Firestore transaction.
import { ApiError, invalid } from './http';
import { type Caller, requireScope, seesManagerTasks } from './auth';
import { operation } from './catalog';
import { type Doc, Firestore, type Write, enc } from './firestore';
import { fresh, idempotent, nextUpdatedAt, todayIL } from './core';
import { autoId, b64url, canonical, normName, sha256hex, validate } from './util';
import { photoUrl, publicItem, qtyPart, shopItemWrites, short, storedPhoto, taskToPerson, teamUids } from './v2/taskutil';

type Person = { uid: string; name: string };
type TaskData = Record<string, unknown> & { title: string; managersOnly: boolean; assignee: Person | null };

const TEAM_ROLES = new Set(['owner', 'manager', 'staff']);
const nowIso = () => new Date().toISOString();
/** Same truncation the app uses for activity text (store.ts taskText). */
const taskText = (title: string) => (title.length > 60 ? title.slice(0, 60) + '…' : title);
/** Activity text for a task. A manager-only task logs under 'task_private', which team members cannot read, so its title is kept. */
const activityText = (t: { title: string }) => taskText(t.title);
const kindOf = (t: { managersOnly?: unknown }) => (t.managersOnly ? 'task_private' as const : 'task' as const);

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
    location: t.location ?? null,
    doneNote: t.doneNote || '',
    hasPhoto: !!t.photo,
    hasDonePhoto: !!t.donePhoto,
    // the R2 link of a photo (never a base64 data: URL)
    photoUrl: photoUrl(t.photo),
    donePhotoUrl: photoUrl(t.donePhoto),
    recurring: !!t.templateId,
    templateId: t.templateId ?? null,
    dateKey: t.dateKey ?? null,
    eventId: t.eventId || null,
    takenAt: t.takenAt || null,
    requestedBy: t.requestedBy ?? null,
    shoppingId: t.shoppingId || null,
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

type Cursor = { c: string; n: string; f: string; o?: number };
type ListParams = {
  assignee: string | null; date: string | null; done: boolean | null; eventId: string | null; placeId: string | null; templateId: string | null;
  doneFrom: string | null; doneTo: string | null; overdue: boolean | null; limit: number; cursor: string | null;
};
/** Small sets (an event's or a place's tasks, overdue tasks) are read whole, up to this many, then sorted and paged here. */
const SMALL_SET_MAX = 500;

/** Midnight at the start of an Israel calendar day, as an ISO instant (Israel is UTC+2 or UTC+3). */
function ilDayStartIso(day: string): string {
  for (const off of ['+02:00', '+03:00']) {
    const t = new Date(`${day}T00:00:00${off}`);
    const back = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
    if (back === `${day} 00:00`) return t.toISOString();
  }
  return new Date(`${day}T00:00:00+02:00`).toISOString();
}
const nextDay = (day: string) => new Date(Date.parse(day + 'T12:00:00Z') + 86400_000).toISOString().slice(0, 10);

export async function listTasks(fs: Firestore, caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'tasks:read');
  const raw: Record<string, string> = {};
  for (const [k, v] of query) { if (k in raw) throw invalid(k, `"${k}" given twice`); raw[k] = v; }
  const p = validate(operation('tasks.list')!.params!, raw, true) as ListParams;
  const history = !!(p.doneFrom || p.doneTo);
  const small = !history && !!(p.eventId || p.placeId || p.overdue);
  if (history) {
    // a range on doneAt is ordered by doneAt: only the indexes the app's history screen uses exist for it
    for (const k of ['assignee', 'date', 'done', 'eventId', 'placeId', 'templateId', 'overdue'] as const) if (p[k] !== null) throw invalid(k, `"${k}" cannot be combined with doneFrom/doneTo`);
    if (p.doneFrom && p.doneTo && p.doneFrom > p.doneTo) throw invalid('doneTo', 'doneTo is before doneFrom');
  }
  if (p.overdue) {
    if (p.done === true) throw invalid('done', 'overdue tasks are open: do not send done=true');
    if (p.date) throw invalid('date', '"date" cannot be combined with overdue');
  }

  const filters: Record<string, unknown>[] = [];
  const eq = (field: string, value: unknown) => filters.push({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } });
  if (!seesManagerTasks(caller.actor)) eq('managersOnly', false);
  if (p.assignee) eq('assignee.uid', p.assignee);
  if (p.date) eq('dueDate', p.date);
  if (p.overdue) eq('done', false); else if (p.done !== null) eq('done', p.done);
  if (p.templateId) eq('templateId', p.templateId);
  if (p.eventId) eq('eventId', p.eventId);
  if (p.placeId) eq('location.placeId', p.placeId);
  if (p.doneFrom) filters.push({ fieldFilter: { field: { fieldPath: 'doneAt' }, op: 'GREATER_THAN_OR_EQUAL', value: enc(ilDayStartIso(p.doneFrom)) } });
  if (p.doneTo) filters.push({ fieldFilter: { field: { fieldPath: 'doneAt' }, op: 'LESS_THAN', value: enc(ilDayStartIso(nextDay(p.doneTo))) } });
  const where = filters.length ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } : {};
  const fingerprint = (await sha256hex(canonical({ a: p.assignee, d: p.date, x: p.done, e: p.eventId, pl: p.placeId, t: p.templateId, df: p.doneFrom, dt: p.doneTo, o: p.overdue, m: seesManagerTasks(caller.actor) }))).slice(0, 16);

  let cursor: Cursor | null = null;
  if (p.cursor) {
    try { cursor = JSON.parse(b64url.decode(p.cursor)); } catch { throw invalid('cursor', 'cursor is not valid'); }
    if (!cursor || typeof cursor.c !== 'string' || typeof cursor.n !== 'string' || !/^[A-Za-z0-9_-]{0,128}$/.test(cursor.n)) throw invalid('cursor', 'cursor is not valid');
    if (cursor.f !== fingerprint) throw invalid('cursor', 'cursor belongs to a different filter');
  }

  if (small) {
    // equality filters only (no order): single-field indexes serve it, no composite index is needed
    const docs = await fs.query({ from: [{ collectionId: 'tasks' }], ...where, limit: SMALL_SET_MAX + 1 });
    const complete = docs.length <= SMALL_SET_MAX;
    const today = todayIL();
    let rows = docs.slice(0, SMALL_SET_MAX);
    if (p.overdue) rows = rows.filter((d) => d.data.dueDate && String(d.data.dueDate) < today);
    const byNew = (a: Doc, b: Doc) => String(b.data.createdAt || '').localeCompare(String(a.data.createdAt || '')) || b.id.localeCompare(a.id);
    rows.sort(p.overdue ? (a, b) => String(a.data.dueDate).localeCompare(String(b.data.dueDate)) || byNew(a, b) : byNew);
    const offset = cursor ? Math.max(0, Number(cursor.o) || 0) : 0;
    const page = rows.slice(offset, offset + p.limit);
    const hasMore = rows.length > offset + p.limit;
    return {
      items: page.map((d) => publicTask(d.id, d.data, caller)),
      hasMore, complete,
      nextCursor: hasMore ? b64url.encode(JSON.stringify({ c: '', n: '', o: offset + p.limit, f: fingerprint })) : null,
    };
  }

  const orderField = history ? 'doneAt' : 'createdAt';
  if (cursor && !cursor.n) throw invalid('cursor', 'cursor is not valid');
  const startAt = cursor ? { values: [{ stringValue: cursor.c }, { referenceValue: fs.name('tasks', cursor.n) }], before: false } : undefined;
  const docs = await fs.query({
    from: [{ collectionId: 'tasks' }],
    ...where,
    orderBy: [{ field: { fieldPath: orderField }, direction: 'DESCENDING' }, { field: { fieldPath: '__name__' }, direction: 'DESCENDING' }],
    ...(startAt ? { startAt } : {}),
    limit: p.limit + 1,
  });
  const page = docs.slice(0, p.limit);
  const hasMore = docs.length > p.limit;
  const last = page[page.length - 1];
  return {
    items: page.map((d) => publicTask(d.id, d.data, caller)),
    hasMore,
    nextCursor: hasMore && last ? b64url.encode(JSON.stringify({ c: String(last.data[orderField]), n: last.id, f: fingerprint })) : null,
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

async function resolveAssignee(fs: Firestore, uid: string, tx: string): Promise<Person> {
  const u = await fs.get('users', uid, tx);
  if (!u || u.data.status !== 'active' || !TEAM_ROLES.has(String(u.data.role))) throw invalid('assignee', 'assignee is not an active team member');
  return { uid: u.id, name: String(u.data.displayName || '').slice(0, 80) };
}

function activity(fs: Firestore, caller: Caller, refId: string, action: string, text: string, subjectUid = '', kind: 'task' | 'task_private' | 'shopping' = 'task'): Write {
  return fs.create('activity', autoId(), { kind, refId, action, text: text.slice(0, 500), by: caller.actor.person, at: nowIso(), subjectUid, eventId: '', ...(fs.via ? { via: fs.via } : {}) });
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
  const input = validate(operation('tasks.create')!.body!, body) as { title: string; assignee: string | null; dueDate: string | null; urgent: boolean; note: string | null; managersOnly: boolean; placeId: string | null; eventId: string | null };
  if (input.managersOnly && !seesManagerTasks(caller.actor)) throw new ApiError('FORBIDDEN', 'only managers can create manager-only tasks', { requiredScope: 'tasks:assign' });
  if (input.assignee && input.assignee !== caller.actor.person.uid) requireScope(caller, 'tasks:assign');

  return idempotent(fs, caller, 'tasks.create', key, input, async (tx) => {
    const assignee = input.assignee ? await resolveAssignee(fs, input.assignee, tx) : null;
    let location: Record<string, unknown> | null = null;
    if (input.placeId) {
      const p = await fs.get('places', input.placeId, tx);
      if (!p || p.data.archived) throw invalid('placeId', 'place does not exist or was archived');
      location = { lat: p.data.lat, lng: p.data.lng, placeId: p.id, placeName: p.data.name };
    }
    if (input.eventId && !(await fs.get('events', input.eventId, tx))) throw invalid('eventId', 'no such event');
    const id = autoId();
    const now = nowIso();
    // exactly the shape addTask() in src/app/store.ts writes, so the app and the Rules accept it
    const task: TaskData = {
      title: input.title, note: input.note || '', photo: '', location, dueDate: input.dueDate || '', managersOnly: input.managersOnly,
      templateId: null, dateKey: null, createdBy: caller.actor.person, createdAt: now, done: false, doneBy: null, doneAt: null,
      donePhoto: '', doneNote: '', assignee, urgent: input.urgent, updatedAt: now, ...(input.eventId ? { eventId: input.eventId } : {}),
    };
    const writes = [fs.create('tasks', id, task), activity(fs, caller, id, 'created', activityText(task), assignee?.uid || '', kindOf(task))];
    if (assignee && assignee.uid !== caller.actor.person.uid) writes.push(activity(fs, caller, id, 'assigned', `${activityText(task)} ← ${assignee.name}`, assignee.uid, kindOf(task)));
    // createTask() in src/app/v2/data/tasks.ts: the person it was put on is told (in the app and by push)
    if (assignee) writes.push(...taskToPerson(fs, caller.actor.person, assignee, id, task.title));
    const expected = { title: task.title, dueDate: task.dueDate || null, urgent: task.urgent, assignee, done: false };
    return { status: 201, writes, data: { taskId: id, expected } };
  }, readBackTask(fs, caller));
}

/** tasks.assign: assignTask() in src/app/v2/data/tasks.ts (takenAt, released when null, the new person notified). */
export async function assignTask(fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'tasks:assign');
  const input = validate(operation('tasks.assign')!.body!, body) as { taskId: string; assignee: string | null; release: boolean | null; ifUpdatedAt: string | null };
  if (!input.assignee === !input.release) throw invalid('assignee', 'send either assignee or release=true');

  return idempotent(fs, caller, 'tasks.assign', key, input, async (tx) => {
    const t = await fs.get('tasks', input.taskId, tx);
    if (!t || !visible(t.data, caller)) throw new ApiError('NOT_FOUND', 'task not found');
    fresh(t, input.ifUpdatedAt);
    const assignee = input.assignee ? await resolveAssignee(fs, input.assignee, tx) : null;
    const current = (t.data.assignee as Person | null) || null;
    const expected = { assignee };
    if ((current?.uid || null) === (assignee?.uid || null)) return { writes: [], data: { taskId: t.id, changed: false, expected } };
    if (t.data.done) throw new ApiError('STALE_WRITE', 'the task is already done', { reason: 'done' });
    const data = t.data as TaskData;
    const me = caller.actor.person;
    const at = nowIso();
    const writes = assignee
      ? [
        fs.patch('tasks', t.id, { assignee, takenAt: at, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime),
        activity(fs, caller, t.id, 'assigned', `${activityText(data)} ← ${assignee.name}`, assignee.uid, kindOf(data)),
        ...taskToPerson(fs, me, assignee, t.id, data.title),
      ]
      : [
        fs.patch('tasks', t.id, { assignee: null, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime),
        activity(fs, caller, t.id, 'released', activityText(data), current?.uid || '', kindOf(data)),
      ];
    return { writes, data: { taskId: t.id, changed: true, expected } };
  }, readBackTask(fs, caller));
}

/**
 * tasks.complete and tasks.reopen: setDone() in src/app/v2/data/tasks.ts (a free one-off task becomes the completer's; the
 * done photo and note stay on reopen), and with donePhoto/doneNote doneWithPhoto(). Activity subject: the assignee, else the actor.
 */
async function setTaskDone(fs: Firestore, caller: Caller, op: 'tasks.complete' | 'tasks.reopen', body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'tasks:complete');
  const input = validate(operation(op)!.body!, body) as { taskId: string; ifUpdatedAt: string | null; donePhoto?: string | null; doneNote?: string | null };
  const done = op === 'tasks.complete';
  const withDetails = done && (input.donePhoto != null || input.doneNote != null);
  const photo = withDetails && input.donePhoto ? storedPhoto('donePhoto', input.donePhoto) : '';
  return idempotent(fs, caller, op, key, input, async (tx) => {
    const t = await fs.get('tasks', input.taskId, tx);
    if (!t || !visible(t.data, caller)) throw new ApiError('NOT_FOUND', 'task not found');
    fresh(t, input.ifUpdatedAt);
    const data = t.data as TaskData;
    const me = caller.actor.person;
    const wasDone = !!data.done;
    if (wasDone === done && !withDetails) return { writes: [], data: { taskId: t.id, changed: false, expected: { done } } };
    const now = nowIso();
    const cur = (data.assignee as Person | null) || null;
    const updatedAt = nextUpdatedAt(t.data.updatedAt);
    const patch: Record<string, unknown> = done
      ? (wasDone ? { updatedAt } : { done: true, doneBy: me, doneAt: now, updatedAt })
      : { done: false, doneBy: null, doneAt: null, updatedAt };
    if (done && !wasDone && !cur && !data.templateId) patch.assignee = me;
    if (withDetails) { patch.doneNote = input.doneNote || ''; if (photo) patch.donePhoto = photo; }
    const writes = [fs.patch('tasks', t.id, patch, t.updateTime)];
    const subject = cur?.uid || me.uid;
    if (wasDone !== done) writes.push(activity(fs, caller, t.id, done ? 'done' : 'undone', activityText(data), subject, kindOf(data)));
    if (withDetails && !photo && wasDone === done) writes.push(activity(fs, caller, t.id, 'note', short(data.title), '', kindOf(data)));
    if (photo) writes.push(activity(fs, caller, t.id, 'photo', `${short(data.title)}${input.doneNote ? ': ' + input.doneNote : ''}`, '', kindOf(data)));
    const expected: Record<string, unknown> = done ? { done: true, doneBy: wasDone ? data.doneBy : me } : { done: false, doneBy: null };
    if ('assignee' in patch) expected.assignee = me;
    return { writes, data: { taskId: t.id, changed: true, expected } };
  }, readBackTask(fs, caller));
}
export const completeTask = (fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) => setTaskDone(fs, caller, 'tasks.complete', body, key);
export const reopenTask = (fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) => setTaskDone(fs, caller, 'tasks.reopen', body, key);

// ---------- shopping ----------

export const SHOPPING_CATEGORIES = ['super', 'building', 'online', 'giveaway'] as const;
type Category = (typeof SHOPPING_CATEGORIES)[number];
const itemText = (d: Record<string, unknown>) => `${d.title}${qtyPart(d.qty)}`;

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

/** shopping.add: addShopItem() in src/app/v2/data/shopping.ts (taskId, photo, list label in the activity; urgent tells the team). */
export async function addShopping(fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'shopping:write');
  const input = validate(operation('shopping.add')!.body!, body) as { title: string; qty: string | null; category: Category; urgent: boolean; note: string | null; link: string | null; taskId: string | null; photo: string | null };
  const photo = input.photo ? storedPhoto('photo', input.photo) : null;
  const team = input.urgent ? await teamUids(fs) : [];
  return idempotent(fs, caller, 'shopping.add', key, input, async (tx) => {
    if (input.taskId) {
      const t = await fs.get('tasks', input.taskId, tx);
      if (!t || !visible(t.data, caller)) throw invalid('taskId', 'no such task');
    }
    const id = autoId();
    const { doc, writes } = shopItemWrites(fs, caller.actor.person, id, { ...input, photo }, team);
    const expected = { title: doc.title, qty: doc.qty, category: doc.category, urgent: doc.urgent, bought: false, taskId: input.taskId || null };
    return { status: 201, writes, data: { itemId: id, expected } };
  }, readBackItem(fs));
}

/** shopping.setBought: setItemBought() in src/app/v2/data/shopping.ts (24-hour expireAt, the trip, "not available" cleared). */
export async function setBought(fs: Firestore, caller: Caller, body: Record<string, unknown>, key: string | null) {
  requireScope(caller, 'shopping:write');
  const input = validate(operation('shopping.setBought')!.body!, body) as { itemId: string; bought: boolean; ifUpdatedAt: string | null; tripId: string | null };
  return idempotent(fs, caller, 'shopping.setBought', key, input, async (tx) => {
    const it = await fs.get('shopping', input.itemId, tx);
    if (!it) throw new ApiError('NOT_FOUND', 'shopping item not found');
    fresh(it, input.ifUpdatedAt);
    if (input.tripId && !(await fs.get('shopping_trips', input.tripId, tx))) throw invalid('tripId', 'no such shopping trip');
    if (!!it.data.bought === input.bought) return { writes: [], data: { itemId: it.id, changed: false, expected: { bought: input.bought } } };
    const now = nowIso();
    const patch: Record<string, unknown> = input.bought
      ? { bought: true, boughtBy: caller.actor.person, boughtAt: now, expireAt: new Date(Date.now() + 24 * 3600_000).toISOString(), updatedAt: now }
      : { bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now };
    if (input.tripId) patch.tripId = input.tripId;
    if (it.data.notAvailable) { patch.notAvailable = false; patch.notAvailableAt = null; }
    const action = input.bought ? (it.data.category === 'giveaway' ? 'found' : 'bought') : 'unbought';
    const writes = [fs.patch('shopping', it.id, patch, it.updateTime), activity(fs, caller, it.id, action, itemText(it.data), '', 'shopping')];
    const expected: Record<string, unknown> = input.bought ? { bought: true, boughtBy: caller.actor.person } : { bought: false, boughtBy: null };
    if (input.tripId) expected.tripId = input.tripId;
    return { writes, data: { itemId: it.id, changed: true, expected } };
  }, readBackItem(fs));
}
