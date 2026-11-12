// Gate A for the Havat Ravve API (api/): runs the real Worker in `wrangler dev` against the Firestore
// emulator, with synthetic actors and data only. Run via `npm run test:api` (starts the emulator).
// Also exercises the service-account JWT signing path against a local mock token endpoint.
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, createVerify } from 'node:crypto';
import http from 'node:http';
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
async function where(col, field, value) {
  const r = await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: admin, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } } } }) });
  return (await r.json()).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), ...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
const countTitled = async (title) => (await where('tasks', 'title', title)).length;

// ---------- synthetic credentials and service account ----------
const newKey = () => 'hr_' + randomBytes(32).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const KEYS = { assistant: newKey(), owner: newKey(), staff: newKey() };
const CREDENTIALS = [
  { id: 'cred-assistant', sha256: sha(KEYS.assistant), actors: ['actor-demo-owner'] },
  { id: 'cred-test-owner', sha256: sha(KEYS.owner), actors: ['actor-demo-owner'] },
  { id: 'cred-test-staff', sha256: sha(KEYS.staff), actors: ['actor-demo-staff'] },
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
function startWorker(port, vars) {
  const args = ['wrangler', 'dev', '--config', 'api/wrangler.toml', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(port + 1000), '--show-interactive-dev-session=false', '--log-level', 'log'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const p = spawn('npx', args, { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const onData = (d) => { for (const line of String(d).split('\n')) { const i = line.indexOf('{"requestId"'); if (i >= 0) { try { logs.push(JSON.parse(line.slice(i))); } catch { /* partial */ } } } };
  p.stdout.on('data', (d) => { onData(d); if (process.env.API_TEST_DEBUG) process.stderr.write(d); }); p.stderr.on('data', (d) => { onData(d); if (process.env.API_TEST_DEBUG) process.stderr.write(d); });
  return p;
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
    check(h.status === 200 && h.json.ok && h.json.data.catalogVersion === '1.0.0', 'GET /v1/health → 200 with catalog version');
    const c = await api('GET', '/v1/catalog', { label: 'catalog' });
    const ops = c.json?.data?.operations || [];
    const valid = ops.length >= 5 && ops.every((o) => typeof o.name === 'string' && ['read', 'write'].includes(o.kind) && ['GET', 'POST'].includes(o.method) && o.path.startsWith('/v1/') && /^[a-z]+:[a-z]+$/.test(o.requiredScope) && typeof o.he === 'string' && (o.kind === 'read' || o.idempotency === 'required'));
    check(c.status === 200 && c.json.data.version === '1.0.0' && valid, 'GET /v1/catalog → valid versioned catalog', ops.map((o) => o.name));
    check(['people.search', 'tasks.list', 'tasks.get', 'tasks.create', 'tasks.assign'].every((n) => ops.some((o) => o.name === n)), 'catalog has the five stage-1 operations');
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

    const q = await create(KEYS.assistant, { title: 'מכסה נגמרה' }, randomUUID(), { 'x-test-fault': 'quota' });
    const ra = Number(q.headers.get('retry-after'));
    check(q.status === 429 && q.json.error.code === 'QUOTA_EXCEEDED' && ra >= 60 && ra <= 86400 && (await countTitled('מכסה נגמרה')) === 0, 'Firestore quota → clean 429 with Retry-After, nothing written', { status: q.status, ra });
    const ql = await api('GET', '/v1/tasks', { key: KEYS.owner, headers: { 'x-test-fault': 'quota' } });
    check(ql.status === 429, 'quota on reads → 429 too');
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
} catch (e) {
  failures++;
  console.error(e);
} finally {
  worker.kill('SIGTERM');
  mock.close();
  await rulesEnv?.cleanup().catch(() => {});
}

// production lock: a Worker pointed at the production project id (no emulator) refuses to serve data
// unless PRODUCTION_APPROVED names that same project
section('production lock');
for (const [approved, expectLocked] of [['', true], ['some-other-project', true], ['havat-ravve', false]]) {
  const port = PORT + 7;
  // a garbage service account: if the lock opens, the call fails at signing, before any network request
  const w = startWorker(port, { FIRESTORE_PROJECT_ID: 'havat-ravve', PRODUCTION_APPROVED: approved, API_CREDENTIALS: JSON.stringify(CREDENTIALS), GCP_SERVICE_ACCOUNT: JSON.stringify({ ...SA, private_key: 'not-a-key' }) });
  try {
    await waitUp(`http://127.0.0.1:${port}`);
    const r = await fetch(`http://127.0.0.1:${port}/v1/tasks`, { headers: { authorization: 'Bearer ' + KEYS.owner } });
    const j = await r.json();
    if (expectLocked) check(r.status === 503 && j.error.code === 'PRODUCTION_LOCKED', `project "havat-ravve", PRODUCTION_APPROVED="${approved}" → 503 PRODUCTION_LOCKED, no Google call`, j);
    else check(j.error?.code !== 'PRODUCTION_LOCKED', 'project "havat-ravve", PRODUCTION_APPROVED="havat-ravve" → lock opens', j);
  } catch (e) { failures++; console.error(e); } finally { w.kill('SIGTERM'); await new Promise((r) => w.once('exit', r)); }
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
