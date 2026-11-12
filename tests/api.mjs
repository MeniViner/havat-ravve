// Gate A for the Havat Ravve API (api/): runs the real Worker in `wrangler dev` against the Firestore
// emulator, with synthetic actors and data only. Run via `npm run test:api` (starts the emulator).
// Also exercises the service-account JWT signing path against a local mock token endpoint.
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, createVerify } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
if (!EMU) { console.error('FIRESTORE_EMULATOR_HOST is not set; run with npm run test:api'); process.exit(1); }
const PROJECT = 'demo-havat-ravve';
const DOCS = `http://${EMU}/v1/projects/${PROJECT}/databases/(default)/documents`;

let failures = 0, passes = 0;
const check = (cond, label, extra) => { if (cond) { passes++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const section = (s) => console.log('\n' + s);

// ---------- emulator helpers (admin access with "Bearer owner") ----------
const enc = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = (v) => 'nullValue' in v ? null : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'stringValue' in v ? v.stringValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
const admin = { authorization: 'Bearer owner', 'content-type': 'application/json' };
async function seed(col, id, data) {
  const r = await fetch(`${DOCS}/${col}/${id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
  if (!r.ok) throw new Error('seed failed ' + (await r.text()));
}
/** Synthetic active profiles, written 500 per commit. */
async function seedPeople(people) {
  const now = new Date().toISOString();
  for (let i = 0; i < people.length; i += 500) {
    const writes = people.slice(i, i + 500).map((p) => ({ update: { name: `projects/${PROJECT}/databases/(default)/documents/users/${p.uid}`, fields: Object.fromEntries(Object.entries({ uid: p.uid, email: `${p.uid}@synthetic.invalid`, displayName: p.displayName, phone: '0500000000', role: p.role, status: 'active', customerNumber: 1, acceptedTermsAt: now, createdAt: now, updatedAt: now }).map(([k, v]) => [k, enc(v)])) } }));
    const r = await fetch(`${DOCS}:commit`, { method: 'POST', headers: admin, body: JSON.stringify({ writes }) });
    if (!r.ok) throw new Error('bulk seed failed ' + (await r.text()).slice(0, 300));
  }
}
async function where(col, field, value) {
  const r = await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: admin, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } } } }) });
  return (await r.json()).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), ...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
const countTitled = async (title) => (await where('tasks', 'title', title)).length;

// ---------- synthetic credentials and service account ----------
const newKey = () => 'hr_' + randomBytes(32).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const KEYS = { assistant: newKey(), owner: newKey(), staff: newKey(), users: newKey() };
const CREDENTIALS = [
  { id: 'cred-assistant', sha256: sha(KEYS.assistant), actors: ['actor-demo-owner'] },
  { id: 'cred-test-owner', sha256: sha(KEYS.owner), actors: ['actor-demo-owner'] },
  { id: 'cred-test-staff', sha256: sha(KEYS.staff), actors: ['actor-demo-staff'] },
  // real-person actors: name and role come from users/<uid>
  { id: 'cred-test-users', sha256: sha(KEYS.users), actors: ['user:syn-dani-l', 'user:syn-ronit', 'user:syn-blocked', 'user:syn-dana-guest', 'user:syn-missing'] },
];
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', client_email: 'api-test@synthetic.iam.gserviceaccount.com', private_key_id: 'synthetic', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

// mock Google token endpoint: verifies the RS256 assertion the Worker signs with WebCrypto
const tokenHits = { total: 0, valid: 0 };
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    tokenHits.total++;
    const assertion = new URLSearchParams(body).get('assertion') || '';
    const [h, p, s] = assertion.split('.');
    const v = createVerify('RSA-SHA256'); v.update(h + '.' + p);
    const claims = JSON.parse(Buffer.from(p || '', 'base64url').toString() || '{}');
    const ok = v.verify(publicKey, Buffer.from(s || '', 'base64url')) && claims.iss === SA.client_email && claims.scope === 'https://www.googleapis.com/auth/datastore' && claims.exp - claims.iat === 3600;
    if (ok) tokenHits.valid++;
    res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ok ? { access_token: 'synthetic-token', expires_in: 3599, token_type: 'Bearer' } : { error: 'invalid_grant' }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const tokenUrl = `http://127.0.0.1:${mock.address().port}/token`;

// ---------- Worker under wrangler dev ----------
const logs = [];
const workers = new Set();
/** True while something accepts TCP connections on the port. */
const listening = (port) => new Promise((resolve) => {
  const s = net.connect({ host: '127.0.0.1', port });
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
});
function startWorker(port, vars) {
  const args = ['wrangler', 'dev', '--config', 'api/wrangler.toml', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(port + 1000), '--show-interactive-dev-session=false', '--log-level', 'log'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  // detached: npx, wrangler and workerd share one process group, so stopWorker can end all of them
  const p = spawn('npx', args, { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  p.port = port;
  p.logs = [];
  const onData = (d) => { for (const line of String(d).split('\n')) { const i = line.indexOf('{"requestId"'); if (i >= 0) { try { const l = JSON.parse(line.slice(i)); logs.push(l); p.logs.push(l); } catch { /* partial */ } } } };
  p.stdout.on('data', (d) => { onData(d); if (process.env.API_TEST_DEBUG) process.stderr.write(d); }); p.stderr.on('data', (d) => { onData(d); if (process.env.API_TEST_DEBUG) process.stderr.write(d); });
  workers.add(p);
  return p;
}
const signalGroup = (p, signal) => { try { process.kill(-p.pid, signal); } catch { /* already gone */ } };
/**
 * Stops a worker and returns only once its port is closed. Killing `npx` alone can leave workerd serving
 * the port for a while, and the next worker's health check would then be answered by the old one.
 */
async function stopWorker(p) {
  signalGroup(p, 'SIGTERM');
  for (let i = 0; i < 100 && (await listening(p.port)); i++) { if (i === 50) signalGroup(p, 'SIGKILL'); await new Promise((r) => setTimeout(r, 100)); }
  workers.delete(p);
  if (await listening(p.port)) throw new Error(`worker on port ${p.port} did not stop`);
}
process.on('exit', () => { for (const p of workers) signalGroup(p, 'SIGKILL'); });
/** Whether this worker process logged the request, which proves it is the one that answered. */
async function servedBy(p, requestId) {
  for (let i = 0; i < 50; i++) { if (p.logs.some((l) => l.requestId === requestId)) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
}
async function waitUp(base) {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(base + '/v1/health'); if (r.ok) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('worker did not start at ' + base);
}

const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
const worker = startWorker(PORT, {
  FIRESTORE_PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: EMU, TEST_FAULTS: '1',
  API_CREDENTIALS: JSON.stringify(CREDENTIALS), GCP_SERVICE_ACCOUNT: JSON.stringify(SA), GOOGLE_TOKEN_URL: tokenUrl,
});
const timings = {};
async function api(method, path, { key, body, idem, headers = {}, label } = {}) {
  const t0 = performance.now();
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(key ? { authorization: 'Bearer ' + key } : {}), ...(idem ? { 'idempotency-key': idem } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  if (label) (timings[label] ||= []).push(ms);
  const json = await r.json().catch(() => null);
  return { status: r.status, json, headers: r.headers, ms };
}
const create = (key, body, idem = randomUUID(), headers, label = 'tasks.create (mixed, incl. failures)') => api('POST', '/v1/actions/tasks.create', { key, body, idem, headers, label });

let rulesEnv;
try {
  await waitUp(BASE);
  await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

  // synthetic people (no real names, emails or phones)
  const now = new Date().toISOString();
  const person = (uid, displayName, role, status = 'active') => seed('users', uid, { uid, email: `${uid}@synthetic.invalid`, displayName, phone: '0500000000', role, status, customerNumber: 1, acceptedTermsAt: now, createdAt: now, updatedAt: now });
  await person('synthetic-owner', 'בעלים (סינתטי)', 'owner');
  await person('synthetic-staff', 'מתנדב (סינתטי)', 'staff');
  await person('syn-dani-c', 'דני כהן', 'staff');
  await person('syn-dani-l', 'דני לוי', 'manager');
  await person('syn-ronit', 'רונית', 'staff');
  await person('syn-dana-guest', 'דנה', 'guest');
  await person('syn-blocked', 'דני חסום', 'staff', 'blocked');
  await person('syn-pager', 'עמוד בדיקה', 'staff');
  await seed('tasks', 'syn-managers-only', { title: 'סוד של המנהלים', note: '', photo: '', location: null, dueDate: '', managersOnly: true, templateId: null, dateKey: null, createdBy: { uid: 'synthetic-owner', name: 'x' }, createdAt: now, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, updatedAt: now });

  section('health and catalog');
  {
    const h = await api('GET', '/v1/health', { label: 'health' });
    check(h.status === 200 && h.json.ok && h.json.data.catalogVersion === '1.1.0', 'GET /v1/health → 200 with catalog version');
    const c = await api('GET', '/v1/catalog', { label: 'catalog' });
    const ops = c.json?.data?.operations || [];
    const valid = ops.length >= 5 && ops.every((o) => typeof o.name === 'string' && ['read', 'write'].includes(o.kind) && ['GET', 'POST'].includes(o.method) && o.path.startsWith('/v1/') && /^[a-z]+:[a-z]+$/.test(o.requiredScope) && typeof o.he === 'string' && (o.kind === 'read' || o.idempotency === 'required'));
    check(c.status === 200 && c.json.data.version === '1.1.0' && valid, 'GET /v1/catalog → valid versioned catalog', ops.map((o) => o.name));
    check(['people.search', 'tasks.list', 'tasks.get', 'tasks.create', 'tasks.assign', 'tasks.complete', 'tasks.reopen', 'shopping.list', 'shopping.add', 'shopping.setBought'].every((n) => ops.some((o) => o.name === n)), 'catalog has all ten operations');
  }

  section('authentication and permissions');
  {
    const r = await api('GET', '/v1/tasks');
    check(r.status === 401 && r.json.ok === false && r.json.error.code === 'UNAUTHENTICATED' && r.json.error.he && r.json.meta.requestId, 'no Authorization → 401 in envelope');
    const bad = await api('GET', '/v1/tasks', { key: newKey() });
    check(bad.status === 401 && bad.json.error.code === 'UNAUTHENTICATED', 'unknown key → 401');
    const role = await api('GET', '/v1/tasks?role=manager', { key: KEYS.staff });
    check(role.status === 400 && role.json.error.details.field === 'role', 'client-sent role=manager is rejected, not trusted');

    const before = await countTitled('ניסיון שיוך של מתנדב');
    const assign = await api('POST', '/v1/actions/tasks.assign', { key: KEYS.staff, idem: randomUUID(), body: { taskId: 'x', assignee: 'syn-ronit' } });
    check(assign.status === 403 && assign.json.error.code === 'FORBIDDEN' && assign.json.error.details.requiredScope === 'tasks:assign', 'staff → tasks.assign is 403 with requiredScope');
    const spoof = await create(KEYS.staff, { title: 'ניסיון שיוך של מתנדב', assignee: 'syn-ronit' }, randomUUID(), { 'x-actor-id': 'actor-demo-owner' });
    check(spoof.status === 403 && spoof.json.error.code === 'FORBIDDEN', 'staff credential with X-Actor-Id of owner → 403');
    const staffAssignOnCreate = await create(KEYS.staff, { title: 'ניסיון שיוך של מתנדב', assignee: 'syn-ronit' });
    check(staffAssignOnCreate.status === 403, 'staff cannot assign someone else while creating');
    check((await countTitled('ניסיון שיוך של מתנדב')) === before, 'no task was written by the rejected requests');
    const ghost = await create(KEYS.owner, { title: 'x' }, randomUUID(), { 'x-actor-id': 'actor-nobody' });
    check(ghost.status === 403, 'unknown actor id → 403');
  }

  section('validation');
  {
    const noKey = await api('POST', '/v1/actions/tasks.create', { key: KEYS.owner, body: { title: 'בלי מפתח' } });
    check(noKey.status === 400 && noKey.json.error.details.field === 'Idempotency-Key', 'write without Idempotency-Key → 400');
    const notUuid = await create(KEYS.owner, { title: 'מפתח לא תקין' }, 'abc');
    check(notUuid.status === 400, 'non-UUID Idempotency-Key → 400');
    const extra = await create(KEYS.owner, { title: 'שדה זר', managersOnly: true });
    check(extra.status === 400 && extra.json.error.details.field === 'managersOnly', 'unknown body field → 400 naming the field');
    const relDate = await create(KEYS.owner, { title: 'מחר', dueDate: 'מחר' });
    check(relDate.status === 400 && relDate.json.error.details.field === 'dueDate', 'relative date is rejected; absolute YYYY-MM-DD only');
    const badDate = await create(KEYS.owner, { title: 'תאריך', dueDate: '2026-02-30' });
    check(badDate.status === 400, 'impossible date → 400');
    const blank = await create(KEYS.owner, { title: '   ' });
    check(blank.status === 400 && blank.json.error.details.field === 'title', 'blank title → 400');
    const blocked = await create(KEYS.owner, { title: 'לחסום', assignee: 'syn-blocked' });
    check(blocked.status === 400 && blocked.json.error.details.field === 'assignee', 'blocked person cannot be assigned');
    const unknownOp = await api('POST', '/v1/actions/tasks.delete', { key: KEYS.owner, idem: randomUUID(), body: {} });
    check(unknownOp.status === 404, 'operation not in the catalog → 404');
  }

  section('create, idempotency, read-back, activity');
  let taskId;
  {
    const key = randomUUID();
    const body = { title: 'להשקות את העצים בחלקה הצפונית', assignee: 'syn-dani-c', dueDate: '2026-11-13', urgent: true };
    const a = await create(KEYS.assistant, body, key);
    taskId = a.json?.data?.taskId;
    check(a.status === 201 && a.json.data.replayed === false && a.json.data.verified === true, 'tasks.create → 201, verified read-back', a.json);
    const t = a.json.data.task;
    check(t && t.title === body.title && t.assignee.uid === 'syn-dani-c' && t.assignee.name === 'דני כהן' && t.dueDate === '2026-11-13' && t.urgent === true && t.done === false && t.createdBy.uid === 'synthetic-owner', 'read-back matches what was sent');
    const b = await create(KEYS.assistant, { ...body, title: '  ' + body.title + ' ' }, key);
    check(b.status === 200 && b.json.data.replayed === true && b.json.data.taskId === taskId, 'same key + same (normalized) payload → replayed, same task');
    check((await countTitled(body.title)) === 1, 'exactly one task stored');
    const other = await create(KEYS.owner, body, key);
    check(other.status === 201 && other.json.data.replayed === false && other.json.data.taskId !== taskId, 'same key from another credential is a different key (no cross-credential replay)');
    const before = await countTitled('מטען אחר');
    const c = await create(KEYS.assistant, { ...body, title: 'מטען אחר' }, key);
    check(c.status === 409 && c.json.error.code === 'IDEMPOTENCY_CONFLICT', 'same key + different payload → 409');
    check((await countTitled('מטען אחר')) === before, 'nothing written on 409');

    const g = await api('GET', '/v1/tasks/' + taskId, { key: KEYS.staff, label: 'tasks.get' });
    check(g.status === 200 && g.json.data.task.title === body.title && !('managersOnly' in g.json.data.task) && g.json.data.task.hasPhoto === false, 'tasks.get returns the stored task (no photo blob, no manager flag for staff)');
    const act = await where('activity', 'refId', taskId);
    const created = act.find((x) => x.action === 'created'), assigned = act.find((x) => x.action === 'assigned');
    check(act.length === 2 && created && assigned && created.kind === 'task' && created.by.uid === 'synthetic-owner' && assigned.subjectUid === 'syn-dani-c' && assigned.text.endsWith('← דני כהן'), 'activity "created" + "assigned" committed with the task', act);
    const idem = await fetch(`${DOCS}/api_idempotency`, { headers: admin }).then((r) => r.json());
    check((idem.documents || []).every((d) => !JSON.stringify(d).includes(key)), 'idempotency records store a hash, not the raw key');
  }

  section('assign');
  {
    const key = randomUUID();
    const a = await api('POST', '/v1/actions/tasks.assign', { key: KEYS.assistant, idem: key, body: { taskId, assignee: 'syn-ronit' }, label: 'tasks.assign' });
    check(a.status === 200 && a.json.data.changed === true && a.json.data.task.assignee.uid === 'syn-ronit' && a.json.data.verified === true, 'tasks.assign → verified read-back');
    const again = await api('POST', '/v1/actions/tasks.assign', { key: KEYS.assistant, idem: key, body: { taskId, assignee: 'syn-ronit' } });
    check(again.status === 200 && again.json.data.replayed === true, 'repeat assign with same key → replayed');
    const act = (await where('activity', 'refId', taskId)).filter((x) => x.action === 'assigned');
    check(act.length === 2, 'one new "assigned" activity, not two');
    const missing = await api('POST', '/v1/actions/tasks.assign', { key: KEYS.assistant, idem: randomUUID(), body: { taskId: 'no-such-task', assignee: 'syn-ronit' } });
    check(missing.status === 404, 'assign a missing task → 404');
    const mo = await api('POST', '/v1/actions/tasks.assign', { key: KEYS.owner, idem: randomUUID(), body: { taskId: 'syn-managers-only', assignee: 'syn-dani-l' } });
    const moAct = await where('activity', 'refId', 'syn-managers-only');
    check(mo.status === 200 && moAct.length === 1 && !moAct[0].text.includes('סוד'), 'assigning a manager-only task does not leak its title into activity', moAct);
  }

  section('manager-only visibility');
  {
    const s = await api('GET', '/v1/tasks/syn-managers-only', { key: KEYS.staff });
    check(s.status === 404, 'staff: manager-only task looks missing (404)');
    const o = await api('GET', '/v1/tasks/syn-managers-only', { key: KEYS.owner });
    check(o.status === 200 && o.json.data.task.managersOnly === true, 'owner sees it');
    const list = await api('GET', '/v1/tasks?limit=50', { key: KEYS.staff });
    check(list.status === 200 && !list.json.data.items.some((t) => t.id === 'syn-managers-only'), 'staff list excludes manager-only tasks');
  }

  section('people search');
  {
    const amb = await api('GET', '/v1/people?q=' + encodeURIComponent('דני'), { key: KEYS.owner, label: 'people.search' });
    const names = amb.json?.data?.candidates?.map((c) => c.name) || [];
    check(amb.status === 200 && amb.json.data.ambiguous === true && amb.json.data.match === 'prefix' && names.length === 2 && names.includes('דני כהן') && names.includes('דני לוי'), 'ambiguous "דני" → candidates, no guess', amb.json?.data);
    check(!names.includes('דני חסום') && !names.includes('דנה'), 'blocked people and guests are not candidates');
    check(amb.json.data.candidates.every((c) => Object.keys(c).sort().join() === 'name,role,uid'), 'candidates carry uid, name, role only (no email/phone)');
    const ex = await api('GET', '/v1/people?q=' + encodeURIComponent('דני כהן'), { key: KEYS.owner });
    check(ex.json.data.match === 'exact' && ex.json.data.ambiguous === false && ex.json.data.candidates[0].uid === 'syn-dani-c', 'exact name → single match');
    const lastName = await api('GET', '/v1/people?q=' + encodeURIComponent('לוי'), { key: KEYS.owner });
    check(lastName.json.data.candidates.length === 1 && lastName.json.data.candidates[0].uid === 'syn-dani-l', 'word prefix (last name) matches');
    const none = await api('GET', '/v1/people?q=' + encodeURIComponent('אף אחד'), { key: KEYS.owner });
    check(none.json.data.match === 'none' && none.json.data.candidates.length === 0, 'no match → empty candidates');
    const staff = await api('GET', '/v1/people?q=x', { key: KEYS.staff });
    check(staff.status === 403, 'staff has no people:read');
  }

  section('pagination (60 synthetic tasks, pages of 25)');
  {
    const created = [];
    for (let i = 0; i < 60; i += 10) {
      const batch = await Promise.all(Array.from({ length: 10 }, (_, j) => create(KEYS.owner, { title: `משימת עמוד ${i + j + 1}`, assignee: 'syn-pager', dueDate: '2026-11-20' }, randomUUID(), undefined, 'tasks.create ×10 parallel')));
      created.push(...batch.map((r) => r.json?.data?.taskId));
    }
    check(created.every(Boolean) && new Set(created).size === 60, '60 tasks created', created.filter((x) => !x).length);
    const seen = []; let cursor = null; let pages = 0; let lastHasMore = true;
    do {
      const r = await api('GET', `/v1/tasks?assignee=syn-pager&date=2026-11-20&limit=25${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { key: KEYS.owner, label: 'tasks.list' });
      if (r.status !== 200) { check(false, 'page request', r.json); break; }
      seen.push(...r.json.data.items.map((t) => t.id)); cursor = r.json.data.nextCursor; lastHasMore = r.json.data.hasMore; pages++;
    } while (cursor && pages < 10);
    check(pages === 3 && seen.length === 60 && new Set(seen).size === 60 && created.every((id) => seen.includes(id)) && lastHasMore === false, 'pages of 25/25/10, every task exactly once', { pages, n: seen.length });
    const first = await api('GET', '/v1/tasks?assignee=syn-pager&limit=25', { key: KEYS.owner });
    const mixed = await api('GET', `/v1/tasks?assignee=syn-ronit&limit=25&cursor=${encodeURIComponent(first.json.data.nextCursor)}`, { key: KEYS.owner });
    check(mixed.status === 400 && mixed.json.error.details.field === 'cursor', 'cursor reused with other filters → 400');
    const garbage = await api('GET', '/v1/tasks?cursor=not-a-cursor', { key: KEYS.owner });
    check(garbage.status === 400, 'garbage cursor → 400');
    const big = await api('GET', '/v1/tasks?limit=51', { key: KEYS.owner });
    check(big.status === 400, 'limit over 50 → 400');
    const dup = await api('GET', '/v1/tasks?limit=5&limit=6', { key: KEYS.owner });
    check(dup.status === 400, 'repeated query parameter → 400');
  }

  section('concurrency and failure');
  {
    const key = randomUUID(); const body = { title: 'חמש בקשות במקביל' };
    const rs = await Promise.all(Array.from({ length: 5 }, () => create(KEYS.assistant, body, key, undefined, 'tasks.create ×5 same key')));
    const ids = new Set(rs.map((r) => r.json?.data?.taskId));
    check(rs.every((r) => r.status === 200 || r.status === 201) && ids.size === 1 && (await countTitled(body.title)) === 1, '5 identical parallel requests → one task', rs.map((r) => [r.status, r.json?.error?.code]));
    check(rs.filter((r) => r.json?.data?.replayed === false).length === 1, 'exactly one of them wrote; four replayed');

    const k2 = randomUUID(); const b2 = { title: 'אישור שאבד בדרך' };
    const lost = await create(KEYS.assistant, b2, k2, { 'x-test-fault': 'commit-timeout' });
    check(lost.status === 200 && lost.json.data.replayed === true, 'commit applied but ack lost → reconciled from the idempotency record', lost.json);
    const retry = await create(KEYS.assistant, b2, k2);
    check(retry.status === 200 && retry.json.data.replayed === true && (await countTitled(b2.title)) === 1, 'retry after timeout → no duplicate');

    const k3 = randomUUID(); const b3 = { title: 'כתיבה שלא הגיעה' };
    const unknown = await create(KEYS.assistant, b3, k3, { 'x-test-fault': 'commit-lost' });
    check(unknown.status === 503 && unknown.json.error.code === 'OUTCOME_UNKNOWN' && (await countTitled(b3.title)) === 0, 'commit never arrived → 503 OUTCOME_UNKNOWN, nothing written');
    const again = await create(KEYS.assistant, b3, k3);
    check(again.status === 201 && (await countTitled(b3.title)) === 1, 'resend with same key → written once');

    // review finding: Firestore answers 2xx to the commit, then the body fails to arrive
    const k4 = randomUUID(); const b4 = { title: 'תשובה שנקטעה באמצע' };
    const cut = await create(KEYS.assistant, b4, k4, { 'x-test-fault': 'commit-body-lost' });
    check(cut.status === 200 && cut.json.data.replayed === true && cut.json.data.verified === true && (await countTitled(b4.title)) === 1, 'commit applied, response body lost mid-read → reconciled from the idempotency record, not a 500', cut.json);
    const cutAgain = await create(KEYS.assistant, b4, k4);
    check(cutAgain.status === 200 && cutAgain.json.data.replayed === true && cutAgain.json.data.taskId === cut.json?.data?.taskId && (await countTitled(b4.title)) === 1, 'resend after the lost body → same task, no duplicate', cutAgain.json);

    // the commit landed, but neither its answer nor the idempotency record can be read: the API cannot know
    const k5 = randomUUID(); const b5 = { title: 'נכתב ואי אפשר לדעת' };
    const blind = await create(KEYS.assistant, b5, k5, { 'x-test-fault': 'commit-body-lost,read-lost:api_idempotency' });
    check(blind.status === 503 && blind.json.error.code === 'OUTCOME_UNKNOWN' && (await countTitled(b5.title)) === 1, 'commit applied, body and lookup both lost → 503 OUTCOME_UNKNOWN: neither success nor failure is claimed', blind.json);
    const blindAgain = await create(KEYS.assistant, b5, k5);
    check(blindAgain.status === 200 && blindAgain.json.data.replayed === true && blindAgain.json.data.verified === true && (await countTitled(b5.title)) === 1, 'resend with the same key → replayed, the Worker did not write it a second time', blindAgain.json);

    // the commit was acknowledged, then the read-back failed: the write is stored and must not be reported as failed
    const k6 = randomUUID(); const b6 = { title: 'נשמר ולא נקרא בחזרה' };
    const noRead = await create(KEYS.assistant, b6, k6, { 'x-test-fault': 'read-lost:tasks' });
    const nd = noRead.json?.data || {};
    check(noRead.status === 201 && noRead.json.ok === true && nd.replayed === false && nd.verified === false && nd.task === null && nd.readBack === 'unavailable' && typeof nd.taskId === 'string' && !('expected' in nd) && (await countTitled(b6.title)) === 1, 'commit acknowledged, read-back failed → reported as stored but unverified, not as an error', noRead.json);
    const readAgain = await create(KEYS.assistant, b6, k6);
    check(readAgain.status === 200 && readAgain.json.data.replayed === true && readAgain.json.data.verified === true && readAgain.json.data.taskId === nd.taskId && !('readBack' in readAgain.json.data) && (await countTitled(b6.title)) === 1, 'resend with the same key → replayed and verified, still one task', readAgain.json);

    const q = await create(KEYS.assistant, { title: 'מכסה נגמרה' }, randomUUID(), { 'x-test-fault': 'quota' });
    const ra = Number(q.headers.get('retry-after'));
    check(q.status === 429 && q.json.error.code === 'QUOTA_EXCEEDED' && ra >= 60 && ra <= 86400 && (await countTitled('מכסה נגמרה')) === 0, 'Firestore quota → clean 429 with Retry-After, nothing written', { status: q.status, ra });
    const ql = await api('GET', '/v1/tasks', { key: KEYS.owner, headers: { 'x-test-fault': 'quota' } });
    check(ql.status === 429, 'quota on reads → 429 too');
  }

  section('real people as actors (name and role from their profile)');
  {
    const as = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
    const dani = await api('POST', '/v1/actions/tasks.create', { ...as('syn-dani-l'), idem: randomUUID(), body: { title: 'משימה של מנהל אמיתי', assignee: 'syn-ronit' } });
    check(dani.status === 201 && dani.json.data.task.createdBy.uid === 'syn-dani-l' && dani.json.data.task.createdBy.name === 'דני לוי', 'a manager profile acts as itself: createdBy is the real uid and name', dani.json);
    const acts = await where('activity', 'refId', dani.json.data.taskId);
    check(acts.length === 2 && acts.every((a) => a.by.uid === 'syn-dani-l' && a.by.name === 'דני לוי'), 'activity is written in the real person\'s name', acts.map((a) => a.by));
    const ronitAssign = await api('POST', '/v1/actions/tasks.create', { ...as('syn-ronit'), idem: randomUUID(), body: { title: 'לשייך לאחר', assignee: 'syn-dani-c' } });
    check(ronitAssign.status === 403, 'a staff profile gets staff scopes: assigning someone else → 403');
    const ronitSelf = await api('POST', '/v1/actions/tasks.create', { ...as('syn-ronit'), idem: randomUUID(), body: { title: 'משימה לעצמי', assignee: 'syn-ronit' } });
    check(ronitSelf.status === 201, 'a staff profile may create a task for itself');
    check((await api('GET', '/v1/people?q=דני', as('syn-ronit'))).status === 403, 'a staff profile cannot search people');
    for (const [uid, why] of [['syn-blocked', 'blocked profile'], ['syn-dana-guest', 'guest profile'], ['syn-missing', 'missing profile']]) {
      const r = await api('GET', '/v1/tasks', as(uid));
      check(r.status === 403 && r.json.error.code === 'FORBIDDEN', `${why} → 403`, r.json);
    }
    check((await api('GET', '/v1/tasks/syn-managers-only', as('syn-ronit'))).status === 404, 'a staff profile does not see manager-only tasks');
    check((await api('GET', '/v1/tasks/syn-managers-only', as('syn-dani-l'))).status === 200, 'a manager profile does');
  }

  section('tasks.complete and tasks.reopen');
  {
    const as = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
    const t = (await create(KEYS.owner, { title: 'לסמן כבוצע', assignee: 'syn-ronit' })).json.data.taskId;
    const key = randomUUID();
    const c = await api('POST', '/v1/actions/tasks.complete', { ...as('syn-ronit'), idem: key, body: { taskId: t }, label: 'tasks.complete' });
    check(c.status === 200 && c.json.data.changed && c.json.data.verified && c.json.data.task.done === true && c.json.data.task.doneBy.uid === 'syn-ronit', 'staff completes a task: done by them, verified', c.json);
    const again = await api('POST', '/v1/actions/tasks.complete', { ...as('syn-ronit'), idem: key, body: { taskId: t } });
    check(again.status === 200 && again.json.data.replayed === true, 'same key → replay');
    const noop = await api('POST', '/v1/actions/tasks.complete', { ...as('syn-ronit'), idem: randomUUID(), body: { taskId: t } });
    check(noop.json.data.changed === false, 'completing a done task → no-op');
    const r = await api('POST', '/v1/actions/tasks.reopen', { ...as('syn-dani-l'), idem: randomUUID(), body: { taskId: t } });
    check(r.status === 200 && r.json.data.changed && r.json.data.task.done === false && r.json.data.task.doneBy === null && r.json.data.verified, 'reopen clears done, doneBy, doneAt');
    const acts = (await where('activity', 'refId', t)).map((a) => a.action).sort();
    check(acts.join() === 'assigned,created,done,undone', 'done and undone activity entries, one each', acts);
    const hidden = await api('POST', '/v1/actions/tasks.complete', { ...as('syn-ronit'), idem: randomUUID(), body: { taskId: 'syn-managers-only' } });
    check(hidden.status === 404, 'staff cannot complete a manager-only task (404, looks missing)');
    const stored = (await fetch(`${DOCS}/tasks/syn-managers-only`, { headers: admin }).then((x) => x.json())).fields.done.booleanValue;
    check(stored === false, 'and it stays open');
  }

  section('shopping');
  let shopId;
  {
    const as = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
    const a = await api('POST', '/v1/actions/shopping.add', { ...as('syn-ronit'), idem: randomUUID(), body: { title: 'מלט', qty: '3 שקים', category: 'building' }, label: 'shopping.add' });
    check(a.status === 201 && a.json.data.verified && a.json.data.item.category === 'building' && a.json.data.item.createdBy.uid === 'syn-ronit', 'staff adds a shopping item, verified', a.json);
    shopId = a.json.data.itemId;
    const d = await api('POST', '/v1/actions/shopping.add', { ...as('syn-ronit'), idem: randomUUID(), body: { title: 'חלב' } });
    check(d.json.data.item.category === 'super' && d.json.data.item.qty === '' && d.json.data.item.urgent === false, 'defaults: category super, empty qty, not urgent');
    const bad = await api('POST', '/v1/actions/shopping.add', { ...as('syn-ronit'), idem: randomUUID(), body: { title: 'x', category: 'food' } });
    check(bad.status === 400 && bad.json.error.details.field === 'category', 'unknown category → 400');
    const stored = (await where('shopping', 'title', 'מלט'))[0];
    const appKeys = ['title', 'note', 'link', 'category', 'createdBy', 'createdAt', 'bought', 'boughtBy', 'boughtAt', 'expireAt', 'updatedAt', 'qty', 'urgent'];
    check(JSON.stringify(Object.keys(stored).filter((k) => k !== 'id').sort()) === JSON.stringify([...appKeys].sort()), 'stored item has exactly the fields the app writes');
    const added = await where('activity', 'refId', shopId);
    check(added.length === 1 && added[0].kind === 'shopping' && added[0].action === 'added' && added[0].text === 'מלט · 3 שקים (חומרי בניין)', 'activity "added" with the app\'s text', added);
    const open = await api('GET', '/v1/shopping', { ...as('syn-ronit'), label: 'shopping.list' });
    check(open.status === 200 && open.json.data.items.some((i) => i.id === shopId), 'shopping.list shows the open item');
    const onlyBuilding = await api('GET', '/v1/shopping?category=building', as('syn-ronit'));
    check(onlyBuilding.json.data.items.every((i) => i.category === 'building') && onlyBuilding.json.data.items.length >= 1, 'category filter');
    const b = await api('POST', '/v1/actions/shopping.setBought', { ...as('syn-dani-l'), idem: randomUUID(), body: { itemId: shopId } });
    check(b.status === 200 && b.json.data.changed && b.json.data.item.bought && b.json.data.item.boughtBy.uid === 'syn-dani-l' && b.json.data.verified, 'setBought marks it bought by the caller');
    const exp = (await where('shopping', 'title', 'מלט'))[0].expireAt;
    check(Math.abs(Date.parse(exp) - Date.now() - 24 * 3600_000) < 120_000, 'expireAt is 24 hours ahead, as in the app');
    check(!(await api('GET', '/v1/shopping', as('syn-ronit'))).json.data.items.some((i) => i.id === shopId), 'a bought item leaves the open list');
    check((await api('GET', '/v1/shopping?bought=true', as('syn-ronit'))).json.data.items.some((i) => i.id === shopId), 'and shows with bought=true');
    const g = await api('POST', '/v1/actions/shopping.add', { ...as('syn-ronit'), idem: randomUUID(), body: { title: 'ספה', category: 'giveaway' } });
    await api('POST', '/v1/actions/shopping.setBought', { ...as('syn-ronit'), idem: randomUUID(), body: { itemId: g.json.data.itemId } });
    check((await where('activity', 'refId', g.json.data.itemId)).some((x) => x.action === 'found'), 'a giveaway item logs "found", as in the app');
    check((await api('POST', '/v1/actions/shopping.setBought', { ...as('syn-ronit'), idem: randomUUID(), body: { itemId: 'no-such-item' } })).status === 404, 'unknown item → 404');
  }

  section('compatibility with the app and its Rules');
  {
    const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
    require('firebase/compat/firestore');
    const { doc, getDoc, updateDoc } = require('firebase/firestore');
    rulesEnv = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
    const claims = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const ronit = rulesEnv.authenticatedContext('syn-ronit', claims('syn-ronit@synthetic.invalid')).firestore();
    await assertSucceeds(getDoc(doc(ronit, 'tasks', taskId)));
    const n = new Date().toISOString();
    await assertSucceeds(updateDoc(doc(ronit, 'tasks', taskId), { done: true, doneBy: { uid: 'syn-ronit', name: 'רונית' }, doneAt: n, updatedAt: n }));
    check(true, 'a team member can read and complete an API-created task through the app\'s Rules');
    const rec = (await fetch(`${DOCS}/api_idempotency`, { headers: admin }).then((r) => r.json())).documents[0].name.split('/').pop();
    await assertFails(getDoc(doc(ronit, 'api_idempotency', rec)));
    check(true, 'app clients cannot read api_idempotency (no rule → denied)');
    const after = await api('GET', '/v1/tasks/' + taskId, { key: KEYS.owner });
    check(after.json.data.task.done === true && after.json.data.task.doneBy.uid === 'syn-ronit', 'the API reads back the change made in the app');
    await assertSucceeds(updateDoc(doc(ronit, 'shopping', shopId), { bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: n }));
    check(true, 'a team member can un-buy an API-created shopping item through the app\'s Rules');
  }

  section('service-account token path (WebCrypto RS256 → mock token endpoint)');
  {
    const tokenLogs = logs.filter((l) => l.token === 'fresh' || l.token === 'cache');
    check(tokenHits.total >= 1 && tokenHits.valid === tokenHits.total, 'every signed JWT verified against the public key', tokenHits);
    check(tokenHits.total === 1 && tokenLogs.filter((l) => l.token === 'fresh').length === 1 && tokenLogs.filter((l) => l.token === 'cache').length > 10, 'one exchange, then the in-memory cache', { hits: tokenHits.total, fresh: tokenLogs.filter((l) => l.token === 'fresh').length });
    const raw = logs.map((l) => JSON.stringify(l)).join('\n');
    check(!raw.includes('synthetic-token') && !Object.values(KEYS).some((k) => raw.includes(k)) && !raw.includes('PRIVATE KEY'), 'request logs contain no keys, tokens or private key');
  }

  section('latency sample (20 sequential calls each)');
  for (let i = 0; i < 20; i++) {
    await create(KEYS.assistant, { title: `דגימת זמן ${i}`, assignee: 'syn-ronit', dueDate: '2026-11-21' }, randomUUID(), undefined, 'seq tasks.create (+assign, read-back)');
    await api('GET', '/v1/tasks?assignee=syn-ronit&limit=20', { key: KEYS.assistant, label: 'seq tasks.list (20)' });
    await api('GET', '/v1/tasks/' + taskId, { key: KEYS.assistant, label: 'seq tasks.get' });
    await api('GET', '/v1/people?q=' + encodeURIComponent('דני'), { key: KEYS.assistant, label: 'seq people.search' });
  }
  check(true, 'sampled');

  section('measurements (local: wrangler dev + emulator, wall time from the client)');
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
  console.log('  | operation | n | mean ms | p95 ms |');
  console.log('  |---|---|---|---|');
  for (const [k, a] of Object.entries(timings)) console.log(`  | ${k} | ${a.length} | ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)} | ${pct(a, 95).toFixed(1)} |`);

  // Runs last: it fills `users` with thousands of profiles, which would distort the timings above.
  // Document ids are chosen so the bulk profiles sort before the named ones ("aaa-", "bulk-" < "syn-" < "zzz-").
  section('people search beyond 1,000 profiles');
  {
    const search = async (q) => (await api('GET', '/v1/people?q=' + encodeURIComponent(q), { key: KEYS.owner })).json?.data || {};
    const n4 = (i) => String(i).padStart(4, '0');

    // review finding: 1,100 active guests used to fill the 1,000-document scan before any team member was read
    await seedPeople(Array.from({ length: 1100 }, (_, i) => ({ uid: `aaa-guest-${n4(i)}`, displayName: `אורח ${n4(i)}`, role: 'guest' })));
    const afterGuests = await search('דני כהן');
    check(afterGuests.match === 'exact' && afterGuests.candidates?.length === 1 && afterGuests.candidates[0].uid === 'syn-dani-c' && afterGuests.ambiguous === false && afterGuests.complete === true, '1,100 active guests ahead of the team → the exact name is still found, search is complete', afterGuests);
    const guestName = await search('אורח 0001');
    check(guestName.match === 'none' && guestName.candidates?.length === 0, 'guests are still never candidates', guestName);

    // more staff than one page (500): a member on a later page, and a duplicate name split across pages
    await seedPeople([
      { uid: 'aaa-noa', displayName: 'נועה שדה', role: 'staff' },
      ...Array.from({ length: 600 }, (_, i) => ({ uid: `bulk-staff-${n4(i)}`, displayName: `עובד ${n4(i)}`, role: 'staff' })),
      { uid: 'zzz-noa', displayName: 'נועה שדה', role: 'staff' },
      { uid: 'zzz-tslil', displayName: 'צליל אחרון', role: 'staff' },
    ]);
    const lastPage = await search('צליל אחרון');
    check(lastPage.match === 'exact' && lastPage.candidates?.[0]?.uid === 'zzz-tslil' && lastPage.ambiguous === false && lastPage.complete === true, '600+ staff → a member on the second page is found', lastPage);
    const twins = await search('נועה שדה');
    check(twins.match === 'exact' && twins.ambiguous === true && twins.complete === true && twins.candidates?.map((c) => c.uid).sort().join() === 'aaa-noa,zzz-noa', 'the same name on the first and the last page → both candidates, ambiguous', twins);

    // more staff than one search reads (2,000 per role): the answer says it is partial instead of guessing
    await seedPeople(Array.from({ length: 1500 }, (_, i) => ({ uid: `bulk-staff-${n4(600 + i)}`, displayName: `עובד ${n4(600 + i)}`, role: 'staff' })));
    const partialOne = await search('נועה שדה');
    check(partialOne.complete === false && partialOne.candidates?.length === 1 && partialOne.candidates[0].uid === 'aaa-noa' && partialOne.ambiguous === true, '2,100+ staff → "complete": false, and the one candidate found is not presented as unambiguous', partialOne);
    const partialNone = await search('צליל אחרון');
    check(partialNone.complete === false && partialNone.match === 'none', 'a member past the scan → no match, with "complete": false saying people may be missing', partialNone);
  }
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await stopWorker(worker).catch((e) => { failures++; console.error(e); });
  mock.close();
  await rulesEnv?.cleanup().catch(() => {});
}

// production lock: a Worker pointed at the production project id (no emulator) refuses to serve data
// unless PRODUCTION_APPROVED names that same project.
// Each case gets its own port and must be answered by the worker started for it: on a shared port a
// worker that is still shutting down answers the next case's request with the previous case's setting.
section('production lock');
for (const [i, [approved, expectLocked]] of [['', true], ['some-other-project', true], ['havat-ravve', false]].entries()) {
  const port = PORT + 7 + i;
  const label = expectLocked
    ? `project "havat-ravve", PRODUCTION_APPROVED="${approved}" → 503 PRODUCTION_LOCKED, no Google call`
    : 'project "havat-ravve", PRODUCTION_APPROVED="havat-ravve" → lock opens';
  if (await listening(port)) { check(false, label, `port ${port} is already in use, so the answer would not come from this case's worker`); continue; }
  // a garbage service account: if the lock opens, the call fails at signing, before any network request
  const w = startWorker(port, { FIRESTORE_PROJECT_ID: 'havat-ravve', PRODUCTION_APPROVED: approved, API_CREDENTIALS: JSON.stringify(CREDENTIALS), GCP_SERVICE_ACCOUNT: JSON.stringify({ ...SA, private_key: 'not-a-key' }) });
  try {
    await waitUp(`http://127.0.0.1:${port}`);
    const r = await fetch(`http://127.0.0.1:${port}/v1/tasks`, { headers: { authorization: 'Bearer ' + KEYS.owner } });
    const j = await r.json();
    const own = await servedBy(w, j.meta?.requestId);
    if (expectLocked) check(own && r.status === 503 && j.error.code === 'PRODUCTION_LOCKED', label, { answeredByThisWorker: own, ...j });
    else check(own && j.ok === false && j.error?.code !== 'PRODUCTION_LOCKED', label, { answeredByThisWorker: own, ...j });
  } catch (e) { failures++; console.error(e); } finally { await stopWorker(w).catch((e) => { failures++; console.error(e); }); }
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
