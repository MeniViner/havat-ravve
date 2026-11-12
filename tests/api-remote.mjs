// Stage B: checks against a deployed Worker and real Firestore. Every document it creates is tagged and
// deleted at the end (tasks, their activity entries, and this credential's idempotency records).
//
// Env:
//   API_BASE      the Worker URL
//   KEY_STAGEB    a key whose credential allows actor-demo-owner and actor-demo-staff
//   GOOGLE_TOKEN  an access token with read/write on the project (for direct reads and cleanup)
//   PROJECT       the Firestore project id
// Usage: set -a; . api/.dev.vars.stage-b; set +a; GOOGLE_TOKEN=$(gcloud auth print-access-token) PROJECT=havat-ravve node tests/api-remote.mjs
import { randomUUID } from 'node:crypto';

const { API_BASE, KEY_STAGEB, GOOGLE_TOKEN, PROJECT } = process.env;
if (!API_BASE || !KEY_STAGEB || !GOOGLE_TOKEN || !PROJECT) { console.error('API_BASE, KEY_STAGEB, GOOGLE_TOKEN and PROJECT are required'); process.exit(2); }
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TAG = '[בדיקת API]';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

let passes = 0, failures = 0;
const check = (cond, label, extra) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const section = (s) => console.log('\n' + s);
const timings = {};
const created = new Set();

async function api(method, path, { body, key = KEY_STAGEB, actor, idem, label } = {}) {
  const headers = {};
  if (key) headers.authorization = 'Bearer ' + key;
  if (actor) headers['x-actor-id'] = actor;
  if (idem) headers['idempotency-key'] = idem;
  if (body) headers['content-type'] = 'application/json';
  const t = performance.now();
  const r = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ms = performance.now() - t;
  if (label) (timings[label] ||= []).push(ms);
  const j = await r.json();
  if (j?.data?.taskId) created.add(j.data.taskId);
  return { status: r.status, j };
}
async function fsReq(method, path, body) {
  const r = await fetch(FS + path, { method, headers: { authorization: 'Bearer ' + GOOGLE_TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (method === 'DELETE') return r.ok;
  return r.json();
}
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : 'integerValue' in v ? Number(v.integerValue) : v;
const fields = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)]));
async function queryEq(col, field, value) {
  const rows = await fsReq('POST', ':runQuery', { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } });
  return rows.filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), ...fields(r.document) }));
}

// the real owner, to assign to (read directly, never printed)
const owners = (await fsReq('POST', ':runQuery', { structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'owner' } } } } }))
  .filter((r) => r.document).map((r) => ({ uid: r.document.name.split('/').pop(), ...fields(r.document) }));
const owner = owners.find((o) => o.status === 'active');
if (!owner) { console.error('no active owner in users'); process.exit(2); }

try {
  section('public endpoints and auth');
  {
    const h = await api('GET', '/v1/health', { key: null, label: 'health' });
    check(h.status === 200 && h.j.data.status === 'ok', 'health 200');
    const c = await api('GET', '/v1/catalog', { key: null, label: 'catalog' });
    check(c.status === 200 && c.j.data.operations?.length >= 5, 'catalog 200 with the operations');
    check((await api('GET', '/v1/tasks', { key: null })).status === 401, 'no key → 401');
    check((await api('GET', '/v1/tasks', { key: 'hr_' + 'x'.repeat(43) })).status === 401, 'unknown key → 401');
    const spoof = await api('GET', '/v1/tasks', { actor: 'actor-somebody-else' });
    check(spoof.status === 403, 'X-Actor-Id outside the credential → 403');
  }

  section('first real call (fresh Google token) and reads');
  {
    const first = await api('GET', '/v1/tasks?limit=5', { label: 'first call (fresh token)' });
    check(first.status === 200 && first.j.ok, 'tasks.list against real Firestore → 200', first.j.error);
    const name = String(owner.displayName || '');
    const word = name.split(/\s+/)[0];
    const p = await api('GET', '/v1/people?q=' + encodeURIComponent(word), { label: 'people.search' });
    check(p.status === 200 && p.j.data.candidates.some((c) => c.uid === owner.uid), 'people.search finds the real owner by first name');
    const none = await api('GET', '/v1/people?q=' + encodeURIComponent('זזזזז'));
    check(none.status === 200 && none.j.data.match === 'none' && none.j.data.candidates.length === 0, 'people.search with no match → empty, never a guess');
  }

  section('tasks.create: shape, activity, idempotency');
  let unassignedId, assignedId;
  {
    const key = randomUUID();
    const body = { title: `${TAG} בלי אחראי`, dueDate: today };
    const r = await api('POST', '/v1/actions/tasks.create', { body, idem: key, label: 'tasks.create' });
    check(r.status === 201 && r.j.data.verified === true && r.j.data.replayed === false, 'create → 201, read-back verified', r.j);
    unassignedId = r.j.data.taskId;
    const again = await api('POST', '/v1/actions/tasks.create', { body, idem: key, label: 'tasks.create replay' });
    check(again.status === 200 && again.j.data.replayed === true && again.j.data.taskId === unassignedId, 'same key, same body → replay, same task');
    const diff = await api('POST', '/v1/actions/tasks.create', { body: { ...body, title: body.title + ' שונה' }, idem: key });
    check(diff.status === 409 && diff.j.error.code === 'IDEMPOTENCY_CONFLICT', 'same key, different body → 409');
    const stored = await fsReq('GET', `/tasks/${unassignedId}`);
    const t = fields(stored);
    const appKeys = ['title', 'note', 'photo', 'location', 'dueDate', 'managersOnly', 'templateId', 'dateKey', 'createdBy', 'createdAt', 'done', 'doneBy', 'doneAt', 'donePhoto', 'doneNote', 'assignee', 'urgent', 'updatedAt'];
    check(JSON.stringify(Object.keys(t).sort()) === JSON.stringify([...appKeys].sort()), 'stored task has exactly the fields the app writes', Object.keys(t));
    const acts = await queryEq('activity', 'refId', unassignedId);
    check(acts.length === 1 && acts[0].action === 'created' && acts[0].kind === 'task', 'one "created" activity entry, same commit', acts.map((a) => a.action));
    const dupes = (await api('GET', `/v1/tasks?limit=50`)).j.data.items.filter((x) => x.title === body.title);
    check(dupes.length === 1, 'exactly one task after create + replay + conflict');

    const r2 = await api('POST', '/v1/actions/tasks.create', { body: { title: `${TAG} עם אחראי`, assignee: owner.uid, urgent: true }, idem: randomUUID(), label: 'tasks.create' });
    check(r2.status === 201 && r2.j.data.verified && r2.j.data.task.assignee?.uid === owner.uid, 'create with a real assignee → 201, verified', r2.j.error);
    assignedId = r2.j.data.taskId;
    const acts2 = await queryEq('activity', 'refId', assignedId);
    check(acts2.map((a) => a.action).sort().join() === 'assigned,created', 'created + assigned activity entries', acts2.map((a) => a.action));
    const bad = await api('POST', '/v1/actions/tasks.create', { body: { title: `${TAG} לא קיים`, assignee: 'no-such-user' }, idem: randomUUID() });
    check(bad.status === 400 && bad.j.error.details?.field === 'assignee', 'unknown assignee → 400, nothing written');
  }

  section('tasks.get, tasks.assign, staff limits');
  {
    const g = await api('GET', `/v1/tasks/${unassignedId}`, { label: 'tasks.get' });
    check(g.status === 200 && g.j.data.task.id === unassignedId, 'tasks.get → 200');
    check((await api('GET', '/v1/tasks/no-such-task')).status === 404, 'missing task → 404');
    const key = randomUUID();
    const a = await api('POST', '/v1/actions/tasks.assign', { body: { taskId: unassignedId, assignee: owner.uid }, idem: key, label: 'tasks.assign' });
    check(a.status === 200 && a.j.data.changed === true && a.j.data.verified, 'assign → changed, verified', a.j);
    const a2 = await api('POST', '/v1/actions/tasks.assign', { body: { taskId: unassignedId, assignee: owner.uid }, idem: randomUUID() });
    check(a2.status === 200 && a2.j.data.changed === false, 'assign to the same person → no-op');
    const s = await api('POST', '/v1/actions/tasks.assign', { actor: 'actor-demo-staff', body: { taskId: unassignedId, assignee: owner.uid }, idem: randomUUID() });
    check(s.status === 403, 'staff actor cannot assign → 403');
    const sg = await api('GET', `/v1/tasks/${unassignedId}`, { actor: 'actor-demo-staff' });
    check(sg.status === 200 && !('managersOnly' in sg.j.data.task), 'staff sees a team task, without the managersOnly flag');
  }

  section('pagination');
  {
    for (let i = 0; i < 5; i++) await api('POST', '/v1/actions/tasks.create', { body: { title: `${TAG} דף ${i + 1}` }, idem: randomUUID(), label: 'tasks.create' });
    const seen = [];
    let cursor = null, pages = 0;
    do {
      const r = await api('GET', `/v1/tasks?limit=3${cursor ? '&cursor=' + cursor : ''}`, { label: 'tasks.list' });
      if (r.status !== 200) { check(false, 'page request', r.j.error); break; }
      seen.push(...r.j.data.items.map((x) => x.id)); cursor = r.j.data.nextCursor; pages++;
    } while (cursor && pages < 10);
    const ours = seen.filter((id) => created.has(id));
    check(ours.length === created.size && new Set(seen).size === seen.length, `${created.size} created tasks paged in 3s: each exactly once (${pages} pages)`);
  }

  section('filtered lists (which composite indexes production needs)');
  const indexes = [];
  for (const [label, path, actor] of [
    ['assignee', `/v1/tasks?assignee=${owner.uid}`],
    ['date', `/v1/tasks?date=${today}`],
    ['done', '/v1/tasks?done=false'],
    ['assignee + date', `/v1/tasks?assignee=${owner.uid}&date=${today}`],
    ['assignee + done', `/v1/tasks?assignee=${owner.uid}&done=false`],
    ['staff (managersOnly=false)', '/v1/tasks', 'actor-demo-staff'],
    ['staff + assignee', `/v1/tasks?assignee=${owner.uid}`, 'actor-demo-staff'],
    ['staff + done', '/v1/tasks?done=false', 'actor-demo-staff'],
  ]) {
    const r = await api('GET', path, { actor, label: 'tasks.list (filtered)' });
    if (r.status === 200) check(true, `${label} → 200 (${r.j.data.items.length} items)`);
    else { indexes.push(label); console.log(`  ! ${label} → ${r.status} ${r.j.error?.details?.upstream || r.j.error?.code} (needs an index)`); }
  }
  if (indexes.length) console.log('  needs indexes:', indexes.join(' | '));

  section('latency (client wall time, 10 sequential each)');
  for (let i = 0; i < 10; i++) {
    await api('GET', `/v1/tasks/${assignedId}`, { label: 'tasks.get' });
    await api('GET', '/v1/tasks?limit=20', { label: 'tasks.list' });
  }
  for (const [k, v] of Object.entries(timings)) {
    const s = [...v].sort((a, b) => a - b);
    console.log(`  ${k.padEnd(26)} n=${String(s.length).padStart(2)} mean=${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(0)}ms p50=${s[Math.floor(s.length / 2)].toFixed(0)}ms max=${s[s.length - 1].toFixed(0)}ms`);
  }
} catch (e) {
  failures++;
  console.error(e);
} finally {
  section('cleanup');
  let tasks = 0, acts = 0, recs = 0;
  for (const id of created) {
    for (const a of await queryEq('activity', 'refId', id)) if (await fsReq('DELETE', `/activity/${a.id}`)) acts++;
    if (await fsReq('DELETE', `/tasks/${id}`)) tasks++;
  }
  for (const r of await queryEq('api_idempotency', 'credential', 'cred-stageb')) if (await fsReq('DELETE', `/api_idempotency/${r.id}`)) recs++;
  console.log(`  deleted ${tasks} tasks, ${acts} activity entries, ${recs} idempotency records`);
  const left = (await fsReq('POST', ':runQuery', { structuredQuery: { from: [{ collectionId: 'tasks' }] } })).filter((r) => r.document && fields(r.document).title?.startsWith(TAG));
  check(left.length === 0, 'no tagged test task left in the project', left.length);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
