// Stage B: checks against a deployed Worker and real Firestore. Every document it creates is tagged and
// deleted at the end (tasks, their activity entries, and this credential's idempotency records).
//
// Env:
//   API_BASE      the Worker URL
//   KEY_STAGEB    a key whose credential allows actor-demo-owner and actor-demo-staff
//   GOOGLE_TOKEN  an access token with read/write on the project (for direct reads and cleanup)
//   PROJECT       the Firestore project id
//   MENI_ACTOR    optional, "user:<uid>" of the real owner, also allowed by KEY_STAGEB
// Usage: set -a; . api/.dev.vars.stage-b; set +a; GOOGLE_TOKEN=$(gcloud auth print-access-token) PROJECT=havat-ravve node tests/api-remote.mjs
import { randomUUID } from 'node:crypto';

const { API_BASE, KEY_STAGEB, GOOGLE_TOKEN, PROJECT, MENI_ACTOR } = process.env;
if (!API_BASE || !KEY_STAGEB || !GOOGLE_TOKEN || !PROJECT) { console.error('API_BASE, KEY_STAGEB, GOOGLE_TOKEN and PROJECT are required'); process.exit(2); }
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TAG = '[בדיקת API]';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

let passes = 0, failures = 0;
const check = (cond, label, extra) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const section = (s) => console.log('\n' + s);
const timings = {};
const created = new Set();
const createdItems = new Set();
const extraDocs = [];
const extraRefs = [];

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
  if (j?.data?.itemId) createdItems.add(j.data.itemId);
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

  section('real person as actor, complete/reopen, shopping');
  if (!MENI_ACTOR) console.log('  (skipped: MENI_ACTOR not set)');
  else {
    const me = { actor: MENI_ACTOR };
    const c = await api('POST', '/v1/actions/tasks.create', { ...me, body: { title: `${TAG} בשם הבעלים` }, idem: randomUUID(), label: 'tasks.create' });
    check(c.status === 201 && c.j.data.task.createdBy.uid === owner.uid && c.j.data.task.createdBy.name === owner.displayName, 'a task created as the real owner carries their uid and name', c.j.error);
    const acts = await queryEq('activity', 'refId', c.j.data.taskId);
    check(acts.length === 1 && acts[0].by.uid === owner.uid, 'activity in the owner\'s name');
    const done = await api('POST', '/v1/actions/tasks.complete', { ...me, body: { taskId: c.j.data.taskId }, idem: randomUUID(), label: 'tasks.complete' });
    check(done.status === 200 && done.j.data.task.done && done.j.data.task.doneBy.uid === owner.uid && done.j.data.verified, 'complete → done by the owner, verified', done.j.error);
    const re = await api('POST', '/v1/actions/tasks.reopen', { ...me, body: { taskId: c.j.data.taskId }, idem: randomUUID() });
    check(re.status === 200 && re.j.data.task.done === false && re.j.data.verified, 'reopen → open again');
    const add = await api('POST', '/v1/actions/shopping.add', { ...me, body: { title: `${TAG} פריט`, qty: '2', category: 'building' }, idem: randomUUID(), label: 'shopping.add' });
    check(add.status === 201 && add.j.data.verified && add.j.data.item.createdBy.uid === owner.uid, 'shopping.add as the owner, verified', add.j.error);
    const list = await api('GET', '/v1/shopping', { ...me, label: 'shopping.list' });
    check(list.status === 200 && list.j.data.items.some((i) => i.id === add.j.data.itemId), 'shopping.list shows it', list.j.error);
    const cat = await api('GET', '/v1/shopping?category=building', { ...me, label: 'shopping.list' });
    check(cat.status === 200 && cat.j.data.items.some((i) => i.id === add.j.data.itemId), 'shopping.list by category (index merge)', cat.j.error);
    const b = await api('POST', '/v1/actions/shopping.setBought', { ...me, body: { itemId: add.j.data.itemId }, idem: randomUUID(), label: 'shopping.setBought' });
    check(b.status === 200 && b.j.data.item.bought && b.j.data.verified, 'setBought → bought, verified', b.j.error);
    const bl = await api('GET', '/v1/shopping?bought=true', me);
    check(bl.status === 200 && bl.j.data.items.some((i) => i.id === add.j.data.itemId), 'listed under bought=true', bl.j.error);
    const staffAs = await api('GET', '/v1/people?q=x', { actor: 'actor-demo-staff' });
    check(staffAs.status === 403, 'staff actor still cannot search people');
  }

  section('catalog 2.0 against production');
  if (MENI_ACTOR) {
    const me = { actor: MENI_ACTOR }, staff = { actor: 'actor-demo-staff' };
    const W = async (who, op, body, label = op) => { const r = await api('POST', '/v1/actions/' + op, { ...who, body, idem: randomUUID(), label }); const d = r.j?.data || {}; for (const k of ['placeId', 'templateId', 'eventId', 'vendorId', 'tabId']) if (d[k]) extraDocs.push(`${k.replace('Id', '') === 'template' ? 'task_templates' : k.replace('Id', '') + 's'}/${d[k]}`); if (op === 'calendar.create' && d.itemId) extraDocs.push('calendar/' + d.itemId); if (d.productId) extraDocs.push(`events/${body.eventId}/products/${d.productId}`); return r; };
    const R = (who, path, label) => api('GET', path, { ...who, label });
    const good = (r, label) => check(r.status >= 200 && r.status < 300 && (r.j?.data?.verified ?? true) !== false, label, r.j?.error);
    const cat = await R(me, '/v1/catalog');
    check(cat.j.data.version === '2.0.0' && cat.j.data.operations.length >= 80, `live catalog 2.0.0 with ${cat.j.data.operations.length} operations`);
    const ov = await R(me, '/v1/overview', 'farm.overview');
    good(ov, 'farm.overview (manager) against production');
    check('payments' in (ov.j.data || {}) && 'notifications' in (ov.j.data || {}), 'manager overview has payments and notifications');
    const ovs = await R(staff, '/v1/overview');
    check(ovs.status === 200 && !('payments' in ovs.j.data), 'staff overview has no payments');
    good(await R(me, '/v1/settings', 'settings.get'), 'settings.get');
    for (const p of ['/v1/profiles?limit=5', '/v1/profiles?role=owner', '/v1/events?limit=5', '/v1/tickets?countOnly=true', '/v1/visits?status=new', '/v1/donations?paymentStatus=claimed', '/v1/tabs?status=open', '/v1/notifications?handled=false', '/v1/calendar?dateFrom=2026-01-01&dateTo=2026-12-31', '/v1/activity?limit=10', '/v1/activity?kind=task&limit=5', '/v1/templates', '/v1/places', '/v1/vendors', '/v1/role-invites', '/v1/join-codes', '/v1/system/failures?hours=24']) {
      const r = await R(me, p, 'resource reads');
      check(r.status === 200, `GET ${p} → 200`, r.j?.error);
    }
    const reads = ['/v1/profiles', '/v1/visits', '/v1/donations', '/v1/notifications', '/v1/calendar', '/v1/system/failures', '/v1/activity?kind=user'];
    const codes = await Promise.all(reads.map((p) => R(staff, p).then((x) => x.status)));
    check(codes.every((c) => c === 403), 'staff: manager-only reads → 403 in production', codes);

    const pl = await W(me, 'places.add', { name: `${TAG} מקום`, lat: 31.4, lng: 34.6 }); good(pl, 'places.add');
    const tk = await W(me, 'tasks.create', { title: `${TAG} עריכה`, placeId: pl.j.data.placeId, note: 'פירוט' });
    good(tk, 'tasks.create with place and note');
    const seen = tk.j.data.task.updatedAt;
    good(await W(me, 'tasks.edit', { taskId: tk.j.data.taskId, urgent: true, ifUpdatedAt: seen }), 'tasks.edit with ifUpdatedAt');
    const stale = await W(me, 'tasks.edit', { taskId: tk.j.data.taskId, title: `${TAG} דריסה`, ifUpdatedAt: seen });
    check(stale.status === 409 && stale.j.error.code === 'STALE_WRITE', 'a stale ifUpdatedAt → 409 STALE_WRITE in production');
    good(await W(me, 'tasks.setDoneNote', { taskId: tk.j.data.taskId, note: 'בוצע' }), 'tasks.setDoneNote');
    const del = await W(me, 'tasks.delete', { taskId: tk.j.data.taskId });
    check(del.status === 200 && del.j.data.verified, 'tasks.delete, verified gone');
    created.delete(tk.j.data.taskId); // gone: its activity is cleaned through extraRefs
    const tp = await W(me, 'templates.create', { title: `${TAG} קבועה`, active: false, days: [1] }); good(tp, 'templates.create (inactive, so the app makes no tasks from it)');
    good(await W(me, 'templates.update', { templateId: tp.j.data.templateId, note: 'x' }), 'templates.update');
    const vd = await W(me, 'vendors.create', { name: `${TAG} ספק` }); good(vd, 'vendors.create');
    const ev = await W(me, 'events.create', { title: `${TAG} אירוע`, start: '2027-01-10T10:00', end: '2027-01-10T12:00', published: false }); good(ev, 'events.create (draft)');
    const eventId = ev.j.data.eventId;
    good(await W(me, 'events.setVendor', { eventId, vendorId: vd.j.data.vendorId }), 'events.setVendor');
    extraDocs.push(`events/${eventId}/vendors/${vd.j.data.vendorId}`);
    const pr = await W(me, 'events.saveProduct', { eventId, name: 'קפה', price: 10 }); good(pr, 'events.saveProduct');
    const tab = await W(staff, 'tabs.open', { eventId, guestName: `${TAG} אורח` }); good(tab, 'tabs.open (staff)');
    const it = await W(staff, 'tabs.addItem', { tabId: tab.j.data.tabId, productId: pr.j.data.productId, qty: 2 });
    check(it.status === 200 && it.j.data.record.total === 20, 'tabs.addItem total from the product price');
    check((await W(staff, 'tabs.setStatus', { tabId: tab.j.data.tabId, status: 'paid' })).status === 403, 'staff cannot settle a tab');
    good(await W(me, 'tabs.setStatus', { tabId: tab.j.data.tabId, status: 'waived' }), 'tabs.setStatus (manager)');
    good(await W(me, 'events.update', { eventId, capacity: 50 }), 'events.update');
    const ci = await W(me, 'calendar.create', { title: `${TAG} יומן`, date: '2027-01-11', time: '09:00' }); good(ci, 'calendar.create');
    good(await W(me, 'calendar.update', { itemId: ci.j.data.itemId, time: '09:30' }), 'calendar.update');
    good(await W(me, 'events.deleteProduct', { eventId, productId: pr.j.data.productId }), 'events.deleteProduct');
    good(await W(me, 'events.removeVendor', { eventId, vendorId: vd.j.data.vendorId }), 'events.removeVendor');
    good(await W(me, 'events.delete', { eventId }), 'events.delete');
    good(await W(me, 'vendors.delete', { vendorId: vd.j.data.vendorId }), 'vendors.delete');
    good(await W(me, 'templates.delete', { templateId: tp.j.data.templateId }), 'templates.delete');
    good(await W(me, 'calendar.delete', { itemId: ci.j.data.itemId }), 'calendar.delete');
    good(await W(me, 'places.delete', { placeId: pl.j.data.placeId }), 'places.delete');
    for (const id of [tk.j.data.taskId, pl.j.data.placeId, eventId, tab.j.data.tabId]) extraRefs.push(id);
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
  let items = 0;
  for (const id of createdItems) {
    for (const a of await queryEq('activity', 'refId', id)) if (await fsReq('DELETE', `/activity/${a.id}`)) acts++;
    if (await fsReq('DELETE', `/shopping/${id}`)) items++;
  }
  let others = 0;
  for (const p of extraDocs) if (await fsReq('DELETE', '/' + p)) others++;
  for (const id of extraRefs) for (const a of await queryEq('activity', 'refId', id)) if (await fsReq('DELETE', `/activity/${a.id}`)) acts++;
  console.log(`  deleted ${others} other test documents (places, templates, events, vendors, tabs, calendar)`);
  for (const r of await queryEq('api_idempotency', 'credential', 'cred-stageb')) if (await fsReq('DELETE', `/api_idempotency/${r.id}`)) recs++;
  console.log(`  deleted ${tasks} tasks, ${items} shopping items, ${acts} activity entries, ${recs} idempotency records`);
  const left = (await fsReq('POST', ':runQuery', { structuredQuery: { from: [{ collectionId: 'tasks' }] } })).filter((r) => r.document && fields(r.document).title?.startsWith(TAG));
  check(left.length === 0, 'no tagged test task left in the project', left.length);
  const leftItems = (await fsReq('POST', ':runQuery', { structuredQuery: { from: [{ collectionId: 'shopping' }] } })).filter((r) => r.document && fields(r.document).title?.startsWith(TAG));
  check(leftItems.length === 0, 'no tagged shopping item left', leftItems.length);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
