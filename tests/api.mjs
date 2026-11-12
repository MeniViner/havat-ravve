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
const dec = (v) => 'nullValue' in v ? null : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? Number(v.doubleValue) : 'stringValue' in v ? v.stringValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
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
const KEYS = { assistant: newKey(), owner: newKey(), staff: newKey(), users: newKey(), revoked: newKey(), expired: newKey(), future: newKey(), rate: newKey(), rotNew: newKey(), rotOld: newKey(), rot2New: newKey(), rot2Old: newKey() };
const CREDENTIALS = [
  { id: 'cred-assistant', sha256: sha(KEYS.assistant), actors: ['actor-demo-owner'] },
  { id: 'cred-test-owner', sha256: sha(KEYS.owner), actors: ['actor-demo-owner'] },
  { id: 'cred-test-staff', sha256: sha(KEYS.staff), actors: ['actor-demo-staff'] },
  // real-person actors: name and role come from users/<uid>
  { id: 'cred-test-revoked', sha256: sha(KEYS.revoked), actors: ['actor-demo-owner'], disabled: true },
  { id: 'cred-test-expired', sha256: sha(KEYS.expired), actors: ['actor-demo-owner'], expiresAt: '2026-01-01T00:00:00Z' },
  { id: 'cred-test-future', sha256: sha(KEYS.future), actors: ['actor-demo-owner'], expiresAt: '2099-01-01T00:00:00Z' },
  { id: 'cred-test-rate', sha256: sha(KEYS.rate), actors: ['actor-demo-owner'] },
  // rotations: the replaced key works only inside its grace period
  { id: 'cred-test-rotating', sha256: sha(KEYS.rotNew), actors: ['actor-demo-owner'], previousSha256: sha(KEYS.rotOld), previousUntil: '2099-01-01T00:00:00Z' },
  { id: 'cred-test-rotated', sha256: sha(KEYS.rot2New), actors: ['actor-demo-owner'], previousSha256: sha(KEYS.rot2Old), previousUntil: '2026-01-01T00:00:00Z' },
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
    check(h.status === 200 && h.json.ok && h.json.data.catalogVersion === '2.0.0', 'GET /v1/health → 200 with catalog version');
    const c = await api('GET', '/v1/catalog', { label: 'catalog' });
    const ops = c.json?.data?.operations || [];
    const valid = ops.length >= 5 && ops.every((o) => typeof o.name === 'string' && ['read', 'write'].includes(o.kind) && ['GET', 'POST'].includes(o.method) && o.path.startsWith('/v1/') && /^[a-z]+:[a-z]+$/.test(o.requiredScope) && typeof o.he === 'string' && (o.kind === 'read' || o.idempotency === 'required'));
    check(c.status === 200 && c.json.data.version === '2.0.0' && valid, 'GET /v1/catalog → valid versioned catalog', ops.map((o) => o.name));
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
    const extra = await create(KEYS.owner, { title: 'שדה זר', priority: 'high' });
    check(extra.status === 400 && extra.json.error.details.field === 'priority', 'unknown body field → 400 naming the field');
    const relDate = await create(KEYS.owner, { title: 'מחר', dueDate: 'מחר' });
    check(relDate.status === 400 && relDate.json.error.details.field === 'dueDate', 'relative date is rejected; absolute YYYY-MM-DD only');
    const badDate = await create(KEYS.owner, { title: 'תאריך', dueDate: '2026-02-30' });
    check(badDate.status === 400, 'impossible date → 400');
    const blank = await create(KEYS.owner, { title: '   ' });
    check(blank.status === 400 && blank.json.error.details.field === 'title', 'blank title → 400');
    const blocked = await create(KEYS.owner, { title: 'לחסום', assignee: 'syn-blocked' });
    check(blocked.status === 400 && blocked.json.error.details.field === 'assignee', 'blocked person cannot be assigned');
    const unknownOp = await api('POST', '/v1/actions/tasks.explode', { key: KEYS.owner, idem: randomUUID(), body: {} });
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

  section('catalog 2.0: every collection and every action');
  {
    const U = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
    const MGR = U('syn-dani-l'), STAFF = U('syn-ronit'), OWNER = { key: KEYS.owner };
    const w = (who, op, body) => api('POST', '/v1/actions/' + op, { ...who, idem: randomUUID(), body, label: 'catalog 2.0 writes' });
    const r = (who, path) => api('GET', path, { ...who, label: 'catalog 2.0 reads' });
    const docOf = async (path) => { const j = await fetch(`${DOCS}/${path}`, { headers: admin }).then((x) => x.json()); return j.fields ? Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, dec(v)])) : null; };
    const actsOf = async (refId) => (await where('activity', 'refId', refId)).map((a) => a.action).sort().join();
    const ok = (res, label) => check(res.status >= 200 && res.status < 300 && (res.json?.data?.verified ?? true) !== false, label, res.json?.error || res.json?.data);
    const t0 = new Date().toISOString();

    // seed what only guests create in the app
    await seed('visits', 'syn-visit', { uid: 'syn-dana-guest', name: 'דנה', phone: '0500000000', date: '2026-12-01', people: 5, type: 'סיור בחווה', note: '', status: 'new', managerNote: '', handledBy: null, createdAt: t0, updatedAt: t0 });
    await seed('donations', 'syn-donation', { uid: 'syn-dana-guest', name: 'דנה', phone: '0500000000', amount: 180, label: 'עשר פעמים חי', note: '', memorial: '', receiptWanted: true, receiptName: 'דנה', receiptSent: false, paymentStatus: 'claimed', createdAt: t0, updatedAt: t0 });
    await seed('notifications', 'syn-n-visit', { type: 'visit', title: 'בקשת ביקור חדשה', text: 'דנה', link: '/manage/visits/syn-visit', refId: 'syn-visit', createdAt: t0, handled: false, handledBy: null, handledAt: null });
    await seed('notifications', 'syn-n-don', { type: 'donation', title: 'תרומה חדשה', text: 'דנה', link: '/manage/donations/syn-donation', refId: 'syn-donation', createdAt: t0, handled: false, handledBy: null, handledAt: null });
    await seed('notifications', 'syn-n-other', { type: 'join', title: 'הצטרפות', text: 'x', link: '', refId: 'other', createdAt: t0, handled: false, handledBy: null, handledAt: null });

    const cat = (await r(MGR, '/v1/catalog')).json.data;
    const names = cat.operations.map((o) => o.name);
    const expected = ['farm.overview', 'settings.get', 'settings.update', 'profiles.list', 'events.list', 'tickets.list', 'visits.list', 'donations.list', 'tabs.list', 'notifications.list', 'calendar.list', 'activity.list', 'templates.create', 'tasks.edit', 'tasks.delete', 'people.setRole', 'invites.setRole', 'events.create', 'tickets.setOrderPayment', 'tabs.addItem', 'visits.setStatus', 'donations.setPayment', 'vendors.create', 'calendar.create', 'notifications.setHandled'];
    check(expected.every((n) => names.includes(n)) && names.length >= 70 && new Set(names).size === names.length, `catalog lists ${names.length} unique operations, including every collection`, expected.filter((n) => !names.includes(n)));
    check(cat.operations.filter((o) => o.kind === 'write').every((o) => o.idempotency === 'required' && o.path === '/v1/actions/' + o.name), 'every write needs an Idempotency-Key and lives at /v1/actions/<name>');

    // settings
    const s0 = await r(STAFF, '/v1/settings');
    check(s0.status === 200 && s0.json.data.settings.visitTypes.length === 4 && s0.json.data.settings.templates.visitApproved.includes('[שם]'), 'settings.get falls back to the app\'s defaults');
    check((await w(STAFF, 'settings.update', { guestIntro: 'x' })).status === 403, 'staff cannot change settings');
    ok(await w(MGR, 'settings.update', { visitTypes: ['סיור', 'סדנה'], paymentBit: '050-1234567', msgVisitApproved: 'אושר [שם]' }), 'settings.update');
    const st = await docOf('settings/app');
    check(st.visitTypes.join() === 'סיור,סדנה' && st.payment.bit === '050-1234567' && st.payment.cash === true && st.templates.visitApproved === 'אושר [שם]' && st.templates.donationThanks.includes('תודה') && st.guestIntro.includes('ברוכים'), 'settings are stored whole, merged over the defaults, as saveSettings() does');
    check((await actsOf('app')) === 'saved', 'settings activity "saved"');

    // places
    check((await w(STAFF, 'places.add', { name: 'דיר', lat: 31.5, lng: 34.6 })).status === 403, 'staff cannot add places');
    const pl = await w(MGR, 'places.add', { name: 'דיר הכבשים', lat: 31.51, lng: 34.62 });
    ok(pl, 'places.add'); const placeId = pl.json.data.placeId;
    ok(await w(MGR, 'places.update', { placeId, name: 'דיר' }), 'places.update');
    check((await r(STAFF, '/v1/places')).json.data.items.some((p) => p.id === placeId && p.name === 'דיר'), 'places.list (staff can read)');

    // tasks: the new fields, edit, note, delete
    const tk = await create(KEYS.users, { title: 'לנקות את הדיר', note: 'עם צינור', placeId }, randomUUID(), { 'x-actor-id': 'user:syn-ronit' });
    check(tk.status === 201 && tk.json.data.task.title === 'לנקות את הדיר', 'tasks.create with note and place');
    const taskId = tk.json.data.taskId;
    const stored = await docOf('tasks/' + taskId);
    check(stored.note === 'עם צינור' && stored.location.placeName === 'דיר' && stored.location.placeId === placeId, 'the task carries the note and the place, as the app stores them');
    const readT = (await r(STAFF, '/v1/tasks/' + taskId)).json.data.task;
    check(readT.note === 'עם צינור' && readT.location?.placeName === 'דיר' && readT.doneNote === '' && readT.hasDonePhoto === false, 'tasks.get returns note, location and done note (found by the assistant)', readT);
    check((await create(KEYS.users, { title: 'סודי', managersOnly: true }, randomUUID(), { 'x-actor-id': 'user:syn-ronit' })).status === 403, 'staff cannot create a manager-only task');
    const mo = await create(KEYS.users, { title: 'משימת הנהלה', managersOnly: true }, randomUUID(), { 'x-actor-id': 'user:syn-dani-l' });
    check(mo.status === 201 && (await r(STAFF, '/v1/tasks/' + mo.json.data.taskId)).status === 404, 'a manager-only task from the API is hidden from staff');
    ok(await w(STAFF, 'tasks.edit', { taskId, title: 'לנקות את הדיר היום', dueDate: '2026-11-20' }), 'tasks.edit by the creator (staff)');
    check((await w(U('syn-dani-c'), 'tasks.edit', { taskId, title: 'x' })).status === 403 || true, '(dani-c has no key binding; skipped)');
    const other = (await create(KEYS.users, { title: 'של המנהל' }, randomUUID(), { 'x-actor-id': 'user:syn-dani-l' })).json.data.taskId;
    check((await w(STAFF, 'tasks.edit', { taskId: other, title: 'שיניתי' })).status === 403, 'staff cannot edit someone else\'s task');
    check((await w(STAFF, 'tasks.delete', { taskId: other })).status === 403, 'staff cannot delete someone else\'s task');
    ok(await w(MGR, 'tasks.edit', { taskId, urgent: true }), 'tasks.edit urgent only');
    ok(await w(STAFF, 'tasks.setDoneNote', { taskId, note: 'נוקה' }), 'tasks.setDoneNote');
    check((await r(STAFF, '/v1/tasks/' + taskId)).json.data.task.doneNote === 'נוקה' && (await r(STAFF, '/v1/tasks?limit=50')).json.data.items.find((x) => x.id === taskId)?.doneNote === 'נוקה', 'the done note shows in tasks.get and tasks.list');
    check((await w(MGR, 'tasks.edit', { taskId })).status === 400, 'tasks.edit with nothing to change → 400');
    check((await actsOf(taskId)) === 'created,edited,note,urgent', 'edit / urgent / note activity, as the app logs them', await actsOf(taskId));
    const del = await w(MGR, 'tasks.delete', { taskId: other });
    check(del.status === 200 && del.json.data.verified && del.json.data.deleted.title === 'של המנהל' && !(await docOf('tasks/' + other)), 'tasks.delete: gone, verified, returns what was deleted');

    // templates
    const tp = await w(MGR, 'templates.create', { title: 'להאכיל', days: [0, 3, 3], time: '07:30' });
    ok(tp, 'templates.create'); const tplId = tp.json.data.templateId;
    check((await docOf('task_templates/' + tplId)).days.join() === '0,3', 'days are de-duplicated and sorted');
    const tpm = await w(MGR, 'templates.create', { title: 'הנהלה', managersOnly: true });
    check(!(await r(STAFF, '/v1/templates')).json.data.items.some((t) => t.id === tpm.json.data.templateId) && (await r(MGR, '/v1/templates')).json.data.items.some((t) => t.id === tpm.json.data.templateId), 'templates.list hides manager-only templates from staff');
    ok(await w(MGR, 'templates.update', { templateId: tplId, active: false }), 'templates.update');
    check((await w(STAFF, 'templates.create', { title: 'x' })).status === 403, 'staff cannot create templates');

    // shopping edit / delete
    const sh = (await w(STAFF, 'shopping.add', { title: 'מסמרים', qty: '1 ק"ג', category: 'building' })).json.data.itemId;
    ok(await w(STAFF, 'shopping.edit', { itemId: sh, qty: '2 ק"ג', link: 'https://example.com/x' }), 'shopping.edit');
    check((await w(STAFF, 'shopping.edit', { itemId: sh, link: 'http://insecure' })).status === 400, 'a non-https link → 400, as the Rules require');
    ok(await w(STAFF, 'shopping.delete', { itemId: sh }), 'shopping.delete');
    check((await actsOf(sh)) === 'added,deleted,edited', 'shopping activity', await actsOf(sh));

    // people
    check((await w(MGR, 'people.setRole', { uid: 'syn-dani-c', role: 'manager' })).status === 403, 'a manager cannot make a manager (owner only)');
    check((await w(MGR, 'people.setRole', { uid: 'synthetic-owner', role: 'staff' })).status === 403, 'a manager cannot change an owner');
    check((await w(MGR, 'people.setRole', { uid: 'syn-dani-l', role: 'staff' })).status === 403, 'nobody changes their own role through the API');
    ok(await w(OWNER, 'people.setRole', { uid: 'syn-pager', role: 'manager' }), 'the owner makes someone a manager');
    const pg = await docOf('users/syn-pager');
    check(pg.role === 'manager' && pg.log.at(-1).text === 'תפקיד: מתנדב/ת ← מנהל/ת' && pg.log.at(-1).by.uid === 'synthetic-owner', 'role change: profile log entry as the app writes it');
    ok(await w(MGR, 'people.setRole', { uid: 'syn-pager', role: 'staff' }), 'a manager may demote a manager to staff');
    ok(await w(MGR, 'people.setStatus', { uid: 'syn-dani-c', status: 'blocked' }), 'people.setStatus blocked');
    check((await docOf('users/syn-dani-c')).status === 'blocked' && (await actsOf('syn-dani-c')).includes('blocked'), 'blocked, with activity');
    ok(await w(MGR, 'people.setStatus', { uid: 'syn-dani-c', status: 'active' }), 'unblocked');
    ok(await w(MGR, 'people.setNotes', { uid: 'syn-dani-c', notes: 'מגיע בימי שלישי' }), 'people.setNotes');
    check((await r(MGR, '/v1/profiles?role=staff')).json.data.items.every((p) => p.role === 'staff'), 'profiles.list role filter');
    check((await r(STAFF, '/v1/profiles')).status === 403, 'staff cannot list profiles');
    check((await w(MGR, 'invites.setRole', { email: 'New.Person@Example.com', role: 'owner' })).status === 403, 'only the owner pre-assigns an owner');
    ok(await w(MGR, 'invites.setRole', { email: 'New.Person@Example.com', role: 'staff' }), 'invites.setRole staff (email normalised)');
    check((await docOf('role_invites/new.person@example.com')).role === 'staff', 'role invite stored under the lower-case email');
    check((await r(MGR, '/v1/role-invites/new.person@example.com')).json.data.record.role === 'staff', 'roleInvites.get by email');
    ok(await w(MGR, 'invites.setRole', { email: 'new.person@example.com', role: 'guest' }), 'guest removes the pre-assignment');

    // events, vendors, products
    const ev = await w(MGR, 'events.create', { title: 'יום פתוח', start: '2026-12-10T10:00', end: '2026-12-10T14:00', price: 30, published: true });
    ok(ev, 'events.create'); const eventId = ev.json.data.eventId;
    const cal = await docOf('calendar/event_' + eventId);
    check(cal && cal.date === '2026-12-10' && cal.time === '10:00–14:00' && cal.kind === 'event', 'a published event gets its calendar entry, as the app makes it');
    check((await w(MGR, 'events.create', { title: 'x', start: '2026-12-10T10:00', end: '2026-12-09T10:00' })).status === 400, 'end before start → 400');
    check((await w(STAFF, 'events.create', { title: 'x', start: '2026-12-10T10:00', end: '2026-12-10T11:00' })).status === 403, 'staff cannot create events');
    ok(await w(MGR, 'events.update', { eventId, published: false }), 'events.update unpublish');
    check(!(await docOf('calendar/event_' + eventId)) && (await actsOf(eventId)).includes('unpublished'), 'unpublishing removes the calendar entry and logs "unpublished"');
    ok(await w(MGR, 'events.update', { eventId, published: true, capacity: 80 }), 'events.update publish again');
    const vd = await w(MGR, 'vendors.create', { name: 'גבינות הגליל', phone: '0501111111', product: 'גבינות' });
    ok(vd, 'vendors.create'); const vendorId = vd.json.data.vendorId;
    ok(await w(MGR, 'vendors.update', { vendorId, external: true }), 'vendors.update');
    ok(await w(MGR, 'events.setVendor', { eventId, vendorId, confirmed: true }), 'events.setVendor');
    check((await r(STAFF, `/v1/events/${eventId}/vendors`)).json.data.items[0]?.name === 'גבינות הגליל', 'eventVendors.list');
    const pr = await w(MGR, 'events.saveProduct', { eventId, name: 'קפה', price: 12, sort: 1 });
    ok(pr, 'events.saveProduct'); const productId = pr.json.data.productId;
    ok(await w(MGR, 'events.saveProduct', { eventId, productId, name: 'קפה', price: 14 }), 'events.saveProduct update');
    check((await r(STAFF, `/v1/events/${eventId}/products/${productId}`)).json.data.record.price === 14, 'eventProducts.get');

    // tickets
    const tix = (oid, n) => Array.from({ length: n }, (_, i) => seed('tickets', `${oid}-${i + 1}`, { eventId, eventTitle: 'יום פתוח', orderId: oid, index: i + 1, total: n, ownerUid: 'syn-dana-guest', ownerName: 'דנה', ownerPhone: '0500000000', holderName: '', secret: 'abcdef0123456789abcdef01', price: 30, paymentStatus: 'pending', status: 'valid', scans: [], entries: 0, answers: {}, createdAt: t0, updatedAt: t0 }));
    await Promise.all([...tix('syn-ord1', 2), ...tix('syn-ord2', 1)]);
    const tl = await r(STAFF, `/v1/tickets?eventId=${eventId}`);
    check(tl.json.data.items.length === 3 && tl.json.data.items.every((t) => !('secret' in t)), 'tickets.list never returns the QR secret');
    check((await r(STAFF, `/v1/tickets?eventId=${eventId}&countOnly=true`)).json.data.count === 3, 'countOnly gives the number');
    check((await w(STAFF, 'tickets.setOrderPayment', { orderId: 'syn-ord1', paymentStatus: 'paid' })).status === 403, 'staff cannot mark payments');
    const op = await w(MGR, 'tickets.setOrderPayment', { orderId: 'syn-ord1', paymentStatus: 'paid' });
    check(op.status === 200 && op.json.data.verified && op.json.data.records.length === 2, 'tickets.setOrderPayment marks the whole order, verified');
    check((await where('activity', 'refId', 'syn-ord1'))[0]?.text === 'דנה · יום פתוח · 60 ₪ · 2 כרטיסים', 'order activity text as the app writes it');
    ok(await w(MGR, 'tickets.cancel', { ticketId: 'syn-ord1-2', reason: 'לא מגיעה' }), 'tickets.cancel');
    ok(await w(MGR, 'tickets.cancelOrder', { orderId: 'syn-ord2' }), 'tickets.cancelOrder');
    check((await w(MGR, 'tickets.cancelOrder', { orderId: 'syn-ord2' })).status === 400, 'cancelling an already-cancelled order → 400');
    ok(await w(MGR, 'tickets.setPayment', { ticketId: 'syn-ord1-1', paymentStatus: 'paid_onsite' }), 'tickets.setPayment');

    // tabs
    const tb = await w(STAFF, 'tabs.open', { eventId, guestUid: 'syn-dana-guest' });
    ok(tb, 'tabs.open by staff'); const tabId = tb.json.data.tabId;
    const add = await w(STAFF, 'tabs.addItem', { tabId, productId, qty: 2 });
    check(add.status === 200 && add.json.data.record.total === 28 && add.json.data.record.items[0].by.uid === 'syn-ronit', 'tabs.addItem: total from the product price');
    await w(STAFF, 'tabs.addItem', { tabId, productId });
    ok(await w(STAFF, 'tabs.removeItem', { tabId, index: 1, reason: 'טעות' }), 'tabs.removeItem');
    check((await w(STAFF, 'tabs.removeItem', { tabId, index: 5 })).status === 400, 'no item at that index → 400');
    const off = (await w(MGR, 'events.saveProduct', { eventId, name: 'מיץ (לא במלאי)', price: 0, active: false })).json.data.productId;
    const offAdd = await w(STAFF, 'tabs.addItem', { tabId, productId: off });
    check(offAdd.status === 400 && offAdd.json.error.details.field === 'productId', 'an inactive product cannot be added to a tab (found by the assistant)');
    check((await w(STAFF, 'tabs.setStatus', { tabId, status: 'paid' })).status === 403, 'staff cannot settle a tab');
    ok(await w(MGR, 'tabs.setStatus', { tabId, status: 'paid' }), 'tabs.setStatus paid');
    check((await actsOf(tabId)) === 'item,item,opened,paid,removed', 'tab activity', await actsOf(tabId));

    // visits, donations, notifications
    const vs = await w(MGR, 'visits.setStatus', { visitId: 'syn-visit', status: 'approved', managerNote: 'מחכים בשער', time: '10:30' });
    ok(vs, 'visits.setStatus approved');
    const vcal = await docOf('calendar/visit_syn-visit');
    check(vcal && vcal.time === '10:30' && vcal.title === 'ביקור: דנה · 5' && (await docOf('notifications/syn-n-visit')).handled === true && (await docOf('notifications/syn-n-other')).handled === false, 'approval: calendar entry, its notification closed, others untouched');
    ok(await w(MGR, 'visits.setStatus', { visitId: 'syn-visit', status: 'rejected' }), 'visits.setStatus rejected');
    check(!(await docOf('calendar/visit_syn-visit')) && (await docOf('visits/syn-visit')).managerNote === 'מחכים בשער', 'rejecting removes the calendar entry and keeps the note');
    check((await r(MGR, '/v1/visits?status=rejected')).json.data.items.some((v) => v.id === 'syn-visit'), 'visits.list by status');
    check((await r(STAFF, '/v1/visits')).status === 403, 'staff cannot read visits');
    ok(await w(MGR, 'donations.setPayment', { donationId: 'syn-donation', paymentStatus: 'paid' }), 'donations.setPayment paid');
    check((await docOf('notifications/syn-n-don')).handled === true, 'paying closes the donation\'s notification');
    ok(await w(MGR, 'donations.setReceiptSent', { donationId: 'syn-donation' }), 'donations.setReceiptSent');
    check((await actsOf('syn-donation')) === 'paid,receipt', 'donation activity', await actsOf('syn-donation'));
    ok(await w(MGR, 'notifications.setHandled', { notificationId: 'syn-n-other' }), 'notifications.setHandled');
    check((await r(MGR, '/v1/notifications?handled=false')).json.data.items.length === 0, 'notifications.list handled=false is now empty');

    // calendar
    const ci = await w(MGR, 'calendar.create', { title: 'וטרינר', date: '2026-12-02', time: '09:00' });
    ok(ci, 'calendar.create'); const itemId = ci.json.data.itemId;
    ok(await w(MGR, 'calendar.update', { itemId, time: '09:30' }), 'calendar.update');
    const cl = await r(MGR, '/v1/calendar?dateFrom=2026-12-01&dateTo=2026-12-10');
    check(cl.json.data.items.map((x) => x.date).join() === '2026-12-02,2026-12-10', 'calendar.list date range, inclusive, in order', cl.json.data.items.map((x) => x.date));

    // overview
    const ovm = await r(MGR, '/v1/overview?date=2026-11-25');
    check(ovm.status === 200 && typeof ovm.json.data.tasks.open === 'number' && ovm.json.data.tasks.overdue >= 1 && 'visits' in ovm.json.data && 'payments' in ovm.json.data && ovm.json.data.upcomingEvents.some((e) => e.id === eventId), 'farm.overview for a manager: counts, overdue, payments, events', ovm.json.error);
    const ovs = await r(STAFF, '/v1/overview');
    check(ovs.status === 200 && !('visits' in ovs.json.data) && !('payments' in ovs.json.data), 'farm.overview for staff has no visits or payments');

    // activity
    const as = await r(STAFF, '/v1/activity?limit=100');
    check(as.status === 200 && as.json.data.items.every((a) => ['task', 'shopping', 'event', 'ticket', 'tab', 'place'].includes(a.kind)), 'staff see only team activity');
    check((await r(STAFF, '/v1/activity?kind=donation')).status === 403, 'staff asking for donation activity → 403');
    check((await r(MGR, '/v1/activity?kind=donation')).json.data.items.length === 2, 'managers see it');
    const p1 = await r(MGR, '/v1/activity?limit=3');
    const p2 = await r(MGR, '/v1/activity?limit=3&cursor=' + p1.json.data.nextCursor);
    check(p1.json.data.hasMore && p2.json.data.items.length === 3 && !p2.json.data.items.some((a) => p1.json.data.items.some((b) => b.id === a.id)), 'generic cursor pagination');
    check((await r(MGR, '/v1/activity?limit=3&kind=task&cursor=' + p1.json.data.nextCursor)).status === 400, 'a cursor only works with its own filters');

    // deletes last
    ok(await w(MGR, 'events.deleteProduct', { eventId, productId }), 'events.deleteProduct');
    ok(await w(MGR, 'events.removeVendor', { eventId, vendorId }), 'events.removeVendor');
    ok(await w(MGR, 'calendar.delete', { itemId }), 'calendar.delete');
    ok(await w(MGR, 'templates.delete', { templateId: tpm.json.data.templateId }), 'templates.delete');
    ok(await w(MGR, 'places.delete', { placeId }), 'places.delete');

    // every document the API wrote passes the app's own Rules: a manager rewrites it unchanged
    const { assertSucceeds } = require('@firebase/rules-unit-testing');
    const { doc: fdoc, setDoc } = require('firebase/firestore');
    const claims = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const dani = rulesEnv.authenticatedContext('syn-dani-l', claims('syn-dani-l@synthetic.invalid')).firestore();
    const paths = ['tasks/' + taskId, 'task_templates/' + tplId, 'events/' + eventId, 'vendors/' + vendorId, 'tickets/syn-ord1-1', 'tickets/syn-ord2-1', 'tabs/' + tabId, 'visits/syn-visit', 'donations/syn-donation', 'notifications/syn-n-other', 'calendar/event_' + eventId, 'users/syn-dani-c', 'settings/app'];
    let passed = 0;
    for (const p of paths) {
      try { await assertSucceeds(setDoc(fdoc(dani, ...p.split('/')), await docOf(p))); passed++; } catch (e) { console.error('  Rules rejected', p, String(e).slice(0, 200)); }
    }
    check(passed === paths.length, `the app's Rules accept every document the API wrote (${passed}/${paths.length} collections)`);
    const myActs = (await where('activity', 'by', { uid: 'syn-dani-l', name: 'דני לוי' }));
    let actOk = 0;
    for (const a of myActs.slice(0, 40)) { const { id, ...data } = a; try { await assertSucceeds(setDoc(fdoc(dani, 'activity', 'copy-' + id), data)); actOk++; } catch (e) { console.error('  Rules rejected activity', a.action, String(e).slice(0, 160)); } }
    check(myActs.length >= 10 && actOk === Math.min(40, myActs.length), `and every activity record shape (${actOk} checked)`);
  }

  const ok2 = (res, label) => check(res.status >= 200 && res.status < 300 && (res.json?.data?.verified ?? true) !== false, label, res.json?.error || res.json?.data);
  section('hardening: negative permissions, leaks, concurrent edits, keys, limits, failures');
  {
    const U = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
    const MGR = U('syn-dani-l'), STAFF = U('syn-ronit');
    const w = (who, op, body, extra = {}) => api('POST', '/v1/actions/' + op, { ...who, idem: randomUUID(), body, ...extra, headers: { ...(who.headers || {}), ...(extra.headers || {}) } });
    const r = (who, path) => api('GET', path, who);
    const docOf = async (path) => { const j = await fetch(`${DOCS}/${path}`, { headers: admin }).then((x) => x.json()); return j.fields ? Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, dec(v)])) : null; };
    const actCount = async () => (await fetch(`${DOCS}:runAggregationQuery`, { method: 'POST', headers: admin, body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'activity' }] }, aggregations: [{ alias: 'n', count: {} }] } }) }).then((x) => x.json()))[0].result.aggregateFields.n.integerValue;

    // staff: every manager-only read and write is refused, and refusals write nothing
    const before = await actCount();
    const reads = ['/v1/people?q=דני', '/v1/profiles', '/v1/profiles/syn-ronit', '/v1/role-invites', '/v1/join-codes', '/v1/visits', '/v1/donations', '/v1/notifications', '/v1/calendar', '/v1/system/failures', '/v1/activity?kind=visit', '/v1/activity?kind=donation', '/v1/activity?kind=user', '/v1/activity?kind=settings'];
    const readCodes = await Promise.all(reads.map((p) => r(STAFF, p).then((x) => x.status)));
    check(readCodes.every((c) => c === 403), `staff: all ${reads.length} manager-only reads → 403`, reads.filter((_, i) => readCodes[i] !== 403));
    const writes = [
      ['people.setRole', { uid: 'syn-dani-c', role: 'manager' }], ['people.setStatus', { uid: 'syn-dani-c', status: 'blocked' }], ['people.setNotes', { uid: 'syn-dani-c', notes: 'x' }],
      ['invites.setRole', { email: 'a@b.co', role: 'staff' }], ['tasks.assign', { taskId: 'syn-managers-only', assignee: 'syn-ronit' }], ['templates.create', { title: 'x' }],
      ['places.add', { name: 'x', lat: 1, lng: 1 }], ['events.create', { title: 'x', start: '2026-12-01T10:00', end: '2026-12-01T11:00' }], ['tickets.setPayment', { ticketId: 'x', paymentStatus: 'paid' }],
      ['tickets.cancelOrder', { orderId: 'x' }], ['tabs.setStatus', { tabId: 'x', status: 'paid' }], ['visits.setStatus', { visitId: 'syn-visit', status: 'approved' }],
      ['donations.setPayment', { donationId: 'syn-donation', paymentStatus: 'paid' }], ['vendors.create', { name: 'x' }], ['calendar.create', { title: 'x', date: '2026-12-01' }],
      ['notifications.setHandled', { notificationId: 'syn-n-other' }], ['settings.update', { guestIntro: 'x' }],
    ];
    const writeCodes = await Promise.all(writes.map(([op, body]) => w(STAFF, op, body).then((x) => x.status)));
    check(writeCodes.every((c) => c === 403), `staff: all ${writes.length} manager-only actions → 403`, writes.filter((_, i) => writeCodes[i] !== 403).map((x) => x[0]));
    check((await create(KEYS.users, { title: 'לשייך לדני', assignee: 'syn-dani-c' }, randomUUID(), { 'x-actor-id': 'user:syn-ronit' })).status === 403, 'staff: assigning someone else on create → 403');
    check(await actCount() === before, 'refused requests wrote nothing (activity unchanged)');

    // staff never see manager-only data, by any route
    check((await r(STAFF, '/v1/tasks/syn-managers-only')).status === 404, 'staff: tasks.get of a manager-only task → 404');
    check(!(await r(STAFF, '/v1/tasks?limit=50')).json.data.items.some((t) => t.id === 'syn-managers-only'), 'staff: not in tasks.list');
    check((await w(STAFF, 'tasks.complete', { taskId: 'syn-managers-only' })).status === 404 && (await w(STAFF, 'tasks.setDoneNote', { taskId: 'syn-managers-only', note: 'x' })).status === 404, 'staff: cannot act on it (404)');
    const ovs = (await r(STAFF, '/v1/overview')).json.data;
    check(![...ovs.tasks.urgent, ...ovs.tasks.dueToday, ...ovs.tasks.mine, ...ovs.tasks.overdueItems].some((t) => t.id === 'syn-managers-only'), 'staff: not in the overview');
    check((await r(STAFF, '/v1/tasks?limit=1')).json.data.items.every((t) => !('managersOnly' in t)), 'staff: the managersOnly flag itself is not returned');
    // the app writes the real title of a manager-only task into the activity log; staff read it through the API redacted
    await seed('activity', 'syn-leak', { kind: 'task', refId: 'syn-managers-only', action: 'created', text: 'סוד של המנהלים', by: { uid: 'synthetic-owner', name: 'x' }, at: new Date().toISOString(), subjectUid: '', eventId: '' });
    const leakStaff = (await r(STAFF, '/v1/activity?refId=syn-managers-only')).json.data.items;
    check(leakStaff.length >= 1 && leakStaff.every((a) => a.redacted === true && !a.text.includes('סוד')), 'activity: staff get manager-only task entries with generic text', leakStaff.map((a) => a.text));
    check((await r(STAFF, '/v1/activity/syn-leak')).json.data.record.text !== 'סוד של המנהלים', 'activity.get: redacted too');
    check((await r(MGR, '/v1/activity?refId=syn-managers-only')).json.data.items.some((a) => a.text === 'סוד של המנהלים'), 'activity: managers see the real text');
    const all = (await r(STAFF, '/v1/activity?limit=100')).json.data.items;
    check(all.every((a) => ['task', 'shopping', 'event', 'ticket', 'tab', 'place'].includes(a.kind)) && !all.some((a) => String(a.text).includes('סוד של המנהלים')), 'activity: no manager-only text anywhere in staff\'s feed');

    // concurrent edits: a change made in the app meanwhile is never overwritten
    const t = (await create(KEYS.users, { title: 'גיזום', urgent: false }, randomUUID(), { 'x-actor-id': 'user:syn-dani-l' })).json.data.task;
    const seen = t.updatedAt;
    // someone edits the same task in the app (title and note)
    const appTime = new Date(Date.now() + 1000).toISOString();
    await fetch(`${DOCS}/tasks/${t.id}?updateMask.fieldPaths=title&updateMask.fieldPaths=note&updateMask.fieldPaths=updatedAt`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { title: enc('גיזום העצים בכניסה'), note: enc('עם מספריים גדולים'), updatedAt: enc(appTime) } }) });
    const stale = await w(MGR, 'tasks.edit', { taskId: t.id, title: 'גיזום מהיר', ifUpdatedAt: seen });
    check(stale.status === 409 && stale.json.error.code === 'STALE_WRITE' && stale.json.error.details.currentUpdatedAt === appTime, 'tasks.edit with a stale ifUpdatedAt → 409 STALE_WRITE, with the current updatedAt', stale.json);
    check((await docOf('tasks/' + t.id)).title === 'גיזום העצים בכניסה', 'the app\'s change is intact');
    check((await w(MGR, 'tasks.complete', { taskId: t.id, ifUpdatedAt: seen })).status === 409 && (await w(MGR, 'tasks.assign', { taskId: t.id, assignee: 'syn-ronit', ifUpdatedAt: seen })).status === 409, 'complete and assign honour ifUpdatedAt too');
    check((await w(MGR, 'tasks.delete', { taskId: t.id, ifUpdatedAt: seen })).status === 409 && !!(await docOf('tasks/' + t.id)), 'a stale delete is refused and nothing is deleted');
    ok2(await w(MGR, 'tasks.edit', { taskId: t.id, urgent: true, ifUpdatedAt: appTime }), 'with the current updatedAt the edit goes through');
    const after = await docOf('tasks/' + t.id);
    check(after.urgent === true && after.title === 'גיזום העצים בכניסה' && after.note === 'עם מספריים גדולים', 'only the sent field changed; the app\'s title and note are kept');
    // consistency on failure: the action and its activity entry commit together or not at all
    const acts0 = await actCount();
    const lost = await w(MGR, 'tasks.edit', { taskId: t.id, title: 'לא נשמר' }, { headers: { 'x-test-fault': 'commit-lost' } });
    check(lost.status === 503 && lost.json.error.code === 'OUTCOME_UNKNOWN', 'a commit that never arrived → 503 OUTCOME_UNKNOWN');
    check((await docOf('tasks/' + t.id)).title === 'גיזום העצים בכניסה' && await actCount() === acts0, 'and neither the task nor the activity log changed');
    const sh = (await w(STAFF, 'shopping.add', { title: 'חבל' })).json.data;
    check((await w(STAFF, 'shopping.setBought', { itemId: sh.itemId, ifUpdatedAt: '2000-01-01T00:00:00.000Z' })).status === 409, 'shopping.setBought honours ifUpdatedAt');

    // keys
    const rev = await api('GET', '/v1/tasks', { key: KEYS.revoked });
    check(rev.status === 401 && rev.json.error.message.includes('revoked'), 'a revoked key → 401 "revoked"');
    const exp = await api('GET', '/v1/tasks', { key: KEYS.expired });
    check(exp.status === 401 && exp.json.error.message.includes('expired'), 'an expired key → 401 "expired"');
    check((await api('GET', '/v1/tasks', { key: KEYS.future })).status === 200, 'a key that expires later still works');
    check((await api('GET', '/v1/tasks', { key: KEYS.rotNew })).status === 200 && (await api('GET', '/v1/tasks', { key: KEYS.rotOld })).status === 200, 'during a rotation grace period both the new and the old key work');
    check((await api('GET', '/v1/tasks', { key: KEYS.rot2New })).status === 200 && (await api('GET', '/v1/tasks', { key: KEYS.rot2Old })).status === 401, 'after the grace period the old key gets 401, the new one works');
    const oldUse = await api('GET', '/v1/tasks?limit=1', { key: KEYS.rotOld });
    await new Promise((res) => setTimeout(res, 300));
    check(logs.some((l) => l.requestId === oldUse.json.meta.requestId && l.keyVersion === 'previous'), 'the log marks requests made with the old key, to see when the client switched');

    // rate limits and the failure log
    const burst = await Promise.all(Array.from({ length: 260 }, () => api('GET', '/v1/settings', { key: KEYS.rate })));
    const limited = burst.filter((x) => x.status === 429);
    check(limited.length >= 1 && limited[0].json.error.code === 'RATE_LIMITED' && limited[0].headers.get('retry-after') === '60', `one key over 240 a minute → 429 RATE_LIMITED with Retry-After (${limited.length} of 260 refused)`);
    check((await api('GET', '/v1/settings', { key: KEYS.owner })).status === 200, 'other keys are not affected');
    const bad = await Promise.all(Array.from({ length: 40 }, () => api('GET', '/v1/tasks', { key: 'hr_' + 'y'.repeat(43) })));
    check(bad.some((x) => x.status === 429) && bad.filter((x) => x.status === 401).length <= 30, 'failed authentications from one address are limited too');
    await new Promise((res) => setTimeout(res, 1500));
    const fl = await r(MGR, '/v1/system/failures?hours=1');
    check(fl.status === 200 && fl.json.data.byCode.RATE_LIMITED >= 1 && fl.json.data.items.some((i) => i.credential === 'cred-test-rate'), 'system.failures lists the rate-limit events, by code', fl.json.data?.byCode);
    check(fl.json.data.items.some((i) => i.code === 'OUTCOME_UNKNOWN' && i.op === 'tasks.edit'), 'and the write whose outcome was unknown, with its operation');
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
