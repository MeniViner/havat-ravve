// Gate A for the v2 tasks area of the API (api/src/v2/tasks.ts, api/src/v2/projects.ts and the task / shopping / template /
// place parts of ops.ts and writes.ts): the real Worker in `wrangler dev` against the Firestore emulator, synthetic actors and
// data only. Each op is checked against what its app function writes (src/app/v2/data/tasks.ts, shopping.ts, projects.ts):
// stored fields, activity, notifications and push jobs, permissions (staff vs manager vs owner) and idempotent replay.
// Run: npx firebase emulators:exec --only firestore,auth --project demo-havat-ravve "node tests/api-v2-tasks.mjs"
import { spawn } from 'node:child_process';
import { createHash, createVerify, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
if (!EMU) { console.error('FIRESTORE_EMULATOR_HOST is not set; run inside firebase emulators:exec'); process.exit(1); }
const PROJECT = 'demo-havat-ravve';
const DOCS = `http://${EMU}/v1/projects/${PROJECT}/databases/(default)/documents`;

let failures = 0, passes = 0;
const check = (cond, label, extra) => { if (cond) { passes++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const section = (s) => console.log('\n' + s);

// ---------- emulator helpers (admin access with "Bearer owner") ----------
const enc = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = (v) => 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? Number(v.doubleValue) : 'stringValue' in v ? v.stringValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
const admin = { authorization: 'Bearer owner', 'content-type': 'application/json' };
const fields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));
async function seed(path, data) {
  const r = await fetch(`${DOCS}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
  if (!r.ok) throw new Error('seed failed ' + (await r.text()));
}
async function docOf(path) { const j = await fetch(`${DOCS}/${path}`, { headers: admin }).then((x) => x.json()); return j.fields ? fields(j.fields) : null; }
async function listOf(path) { const j = await fetch(`${DOCS}/${path}?pageSize=300`, { headers: admin }).then((x) => x.json()); return (j.documents || []).map((d) => ({ _id: d.name.split('/').pop(), ...fields(d.fields) })); }
async function where(col, field, value) {
  const r = await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: admin, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } } } }) });
  return (await r.json()).filter((x) => x.document).map((x) => ({ _id: x.document.name.split('/').pop(), ...fields(x.document.fields) }));
}
const keys = (o) => Object.keys(o).filter((k) => k !== '_id').sort().join(',');
const sameKeys = (o, list) => keys(o) === [...list].sort().join(',');
const acts = async (refId) => (await where('activity', 'refId', refId)).sort((a, b) => a.at.localeCompare(b.at));
const notesOf = async (uid) => listOf(`users/${uid}/notifications`);
const pushesFor = async (refId) => where('push_jobs', 'refId', refId);

// the app's document shapes
const TASK_KEYS = ['title', 'note', 'photo', 'location', 'dueDate', 'managersOnly', 'templateId', 'dateKey', 'createdBy', 'createdAt', 'done', 'doneBy', 'doneAt', 'donePhoto', 'doneNote', 'assignee', 'urgent', 'updatedAt'];
const ITEM_KEYS = ['title', 'qty', 'note', 'link', 'category', 'urgent', 'createdBy', 'createdAt', 'bought', 'boughtBy', 'boughtAt', 'expireAt', 'updatedAt'];
const ACT_KEYS = ['kind', 'refId', 'action', 'text', 'by', 'at', 'subjectUid', 'eventId'];
const NOTE_KEYS = ['id', 'kind', 'title', 'sub', 'link', 'refId', 'by', 'createdAt', 'readAt'];
const PUSH_KEYS = ['id', 'kind', 'title', 'body', 'link', 'to', 'createdBy', 'createdAt', 'sentAt', 'urgent', 'tag', 'refId'];
const TRIP_KEYS = ['recipientUids', 'id', 'by', 'list', 'startedAt', 'closedAt', 'bought', 'missing'];
const TEMPLATE_KEYS = ['title', 'note', 'days', 'time', 'active', 'managersOnly', 'updatedAt', 'createdBy', 'createdAt'];
const PLACE_KEYS = ['name', 'lat', 'lng', 'createdBy', 'createdAt'];
const PROJECT_KEYS = ['id', 'title', 'goal', 'deadline', 'members', 'memberUids', 'status', 'createdBy', 'createdAt', 'updatedAt', 'doneAt'];
const STEP_KEYS = ['id', 'projectId', 'n', 'title', 'assignee', 'due', 'note', 'done', 'doneBy', 'doneAt', 'parentId', 'updates', 'createdBy', 'createdAt', 'updatedAt'];
const PHOTO = (who = 'syn-ronit') => `https://havat-ravve-api.meniviner.workers.dev/v1/files/task/${who}/${randomBytes(16).toString('hex')}.jpg`;
const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

// ---------- synthetic credentials and service account ----------
const newKey = () => 'hr_' + randomBytes(32).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const KEYS = { owner: newKey(), staff: newKey(), users: newKey() };
const CREDENTIALS = [
  { id: 'cred-v2-owner', sha256: sha(KEYS.owner), actors: ['actor-demo-owner'] },
  { id: 'cred-v2-staff', sha256: sha(KEYS.staff), actors: ['actor-demo-staff'] },
  { id: 'cred-v2-users', sha256: sha(KEYS.users), actors: ['user:syn-mgr', 'user:syn-ronit', 'user:syn-noa'] },
];
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', client_email: 'api-test@synthetic.iam.gserviceaccount.com', private_key_id: 'synthetic', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
// mock Google token endpoint (the emulator path never calls it; kept so a non-emulator call would be answered locally)
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const [h, p, s] = (new URLSearchParams(body).get('assertion') || '').split('.');
    const v = createVerify('RSA-SHA256'); v.update(h + '.' + p);
    const ok = !!s && v.verify(publicKey, Buffer.from(s, 'base64url'));
    res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ok ? { access_token: 'synthetic-token', expires_in: 3599, token_type: 'Bearer' } : { error: 'invalid_grant' }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const tokenUrl = `http://127.0.0.1:${mock.address().port}/token`;

// ---------- Worker under wrangler dev ----------
const workers = new Set();
const listening = (port) => new Promise((resolve) => {
  const s = net.connect({ host: '127.0.0.1', port });
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
});
function startWorker(port, vars) {
  const args = ['wrangler', 'dev', '--config', 'api/wrangler.toml', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(port + 1000), '--show-interactive-dev-session=false', '--log-level', 'log'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const p = spawn('npx', args, { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  p.port = port;
  const out = (d) => { if (process.env.API_TEST_DEBUG) process.stderr.write(d); };
  p.stdout.on('data', out); p.stderr.on('data', out);
  workers.add(p);
  return p;
}
const signalGroup = (p, signal) => { try { process.kill(-p.pid, signal); } catch { /* already gone */ } };
async function stopWorker(p) {
  signalGroup(p, 'SIGTERM');
  for (let i = 0; i < 100 && (await listening(p.port)); i++) { if (i === 50) signalGroup(p, 'SIGKILL'); await new Promise((r) => setTimeout(r, 100)); }
  workers.delete(p);
}
process.on('exit', () => { for (const p of workers) signalGroup(p, 'SIGKILL'); });
async function waitUp(base) {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(base + '/v1/health'); if (r.ok) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('worker did not start at ' + base);
}

const PORT = 18900;
const BASE = `http://127.0.0.1:${PORT}`;
if (await listening(PORT)) { console.error(`port ${PORT} is already in use`); process.exit(1); }
const worker = startWorker(PORT, {
  FIRESTORE_PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: EMU, TEST_FAULTS: '1',
  API_CREDENTIALS: JSON.stringify(CREDENTIALS), GCP_SERVICE_ACCOUNT: JSON.stringify(SA), GOOGLE_TOKEN_URL: tokenUrl, EMAIL_ENABLED: 'false',
});
async function api(method, path, { key, body, idem, headers = {} } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(key ? { authorization: 'Bearer ' + key } : {}), ...(idem ? { 'idempotency-key': idem } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const OWNER = { key: KEYS.owner }, STAFF = { key: KEYS.staff };
const U = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
const MGR = U('syn-mgr'), RONIT = U('syn-ronit'), NOA = U('syn-noa');
const ME = { owner: { uid: 'synthetic-owner', name: 'בעלים (סינתטי)' }, staff: { uid: 'synthetic-staff', name: 'מתנדב (סינתטי)' }, mgr: { uid: 'syn-mgr', name: 'דני לוי' }, ronit: { uid: 'syn-ronit', name: 'רונית' }, noa: { uid: 'syn-noa', name: 'נועה' } };
const w = (who, op, body, idem = randomUUID()) => api('POST', '/v1/actions/' + op, { ...who, idem, body });
const r = (who, path) => api('GET', path, who);
const ok = (res, label) => check(res.status >= 200 && res.status < 300 && (res.json?.data?.verified ?? true) !== false, label, res.json?.error || res.json?.data);
const create = async (who, body) => { const x = await w(who, 'tasks.create', body); if (x.status !== 201) throw new Error('create failed ' + JSON.stringify(x.json)); return x.json.data.taskId; };
const now = new Date().toISOString();
const baseTask = (o = {}) => ({ title: 'משימה', note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: ME.owner, createdAt: now, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, updatedAt: now, ...o });

let rulesEnv;
try {
  await waitUp(BASE);
  await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const person = (uid, displayName, role, status = 'active') => seed(`users/${uid}`, { uid, email: `${uid}@synthetic.invalid`, displayName, phone: '0500000000', role, status, customerNumber: 1, acceptedTermsAt: now, createdAt: now, updatedAt: now });
  await person('synthetic-owner', ME.owner.name, 'owner');
  await person('synthetic-staff', ME.staff.name, 'staff');
  await person('syn-mgr', ME.mgr.name, 'manager');
  await person('syn-ronit', ME.ronit.name, 'staff');
  await person('syn-noa', ME.noa.name, 'staff');
  await person('syn-guest', 'אורח', 'guest');
  await person('syn-blocked', 'חסום', 'staff', 'blocked');
  const TEAM = ['synthetic-owner', 'synthetic-staff', 'syn-mgr', 'syn-ronit', 'syn-noa'];

  section('catalog');
  {
    const c = await api('GET', '/v1/catalog');
    const names = c.json.data.operations.map((o) => o.name);
    const want = ['tasks.take', 'tasks.release', 'tasks.setPhoto', 'tasks.setDonePhoto', 'tasks.addShopping', 'shopping.setMissing', 'shopping.startTrip', 'shopping.closeTrip', 'shopping.deleteTrip', 'shopping.reopenTrip',
      'shoppingTrips.list', 'shoppingTrips.get', 'projects.list', 'projects.get', 'projects.create', 'projects.update', 'projects.delete', 'projects.takeStep', 'projects.releaseStep', 'projects.completeStep',
      'projects.reopenStep', 'projects.postUpdate', 'projects.splitStep', 'projects.updateStep', 'projects.addStep'];
    check(want.every((n) => names.includes(n)), 'every new operation is in the catalog', want.filter((n) => !names.includes(n)));
    check(new Set(names).size === names.length, 'no operation name twice');
    const ops = Object.fromEntries(c.json.data.operations.map((o) => [o.name, o]));
    check(want.filter((n) => ops[n].kind === 'write').every((n) => typeof ops[n].he === 'string' && /[א-ת]/.test(ops[n].he)), 'Hebrew descriptions');
    check(['projects.delete', 'projects.update', 'shopping.deleteTrip', 'tasks.delete'].every((n) => ops[n].notes.some((x) => /confirm with the user/i.test(x))), 'destructive ops tell the assistant to confirm first');
    check(['eventId', 'placeId', 'templateId', 'doneFrom', 'doneTo', 'overdue'].every((k) => k in ops['tasks.list'].params), 'tasks.list has the new filters');
  }

  section('tasks.create: the person it is put on is notified');
  {
    const key = randomUUID();
    const a = await w(OWNER, 'tasks.create', { title: 'להשקות את הגינה', assignee: 'syn-noa' }, key);
    check(a.status === 201 && a.json.data.verified, 'created', a.json);
    const id = a.json.data.taskId;
    const notes = (await notesOf('syn-noa')).filter((n) => n.refId === id);
    check(notes.length === 1 && sameKeys(notes[0], NOTE_KEYS) && notes[0].kind === 'task' && notes[0].title === 'משימה חדשה: להשקות את הגינה' && notes[0].sub === 'בעלים העביר אליך' && notes[0].link === `/tasks/${id}` && notes[0].readAt === null && notes[0].by.uid === 'synthetic-owner', 'notification with the app\'s shape and text', notes);
    const pj = await pushesFor(id);
    check(pj.length === 1 && sameKeys(pj[0], PUSH_KEYS) && pj[0].to.join() === 'syn-noa' && pj[0].kind === 'task' && pj[0].sentAt === null && pj[0].urgent === false && pj[0].tag === pj[0].id, 'one push job to that person', pj);
    const again = await w(OWNER, 'tasks.create', { title: 'להשקות את הגינה', assignee: 'syn-noa' }, key);
    check(again.json.data.replayed === true && (await notesOf('syn-noa')).filter((n) => n.refId === id).length === 1 && (await pushesFor(id)).length === 1, 'replay: same task, no second notification');
    check(sameKeys(await docOf('tasks/' + id), TASK_KEYS), 'the stored task has exactly the app\'s fields');
    const self = await create(RONIT, { title: 'עליי', assignee: 'syn-ronit' });
    check((await notesOf('syn-ronit')).filter((n) => n.refId === self).length === 1 && (await pushesFor(self)).length === 1, 'putting it on yourself writes one copy and job');
    const mn = await create(MGR, { title: 'למנהל', assignee: 'syn-ronit' });
    check((await notesOf('syn-ronit')).find((n) => n.refId === mn)?.sub === 'דני העביר אליך', 'the verb follows the sender (דני העביר)');
  }

  section('tasks.edit: changing the assignee');
  {
    const id = await create(MGR, { title: 'לתקן את הגדר' });
    const e = await w(MGR, 'tasks.edit', { taskId: id, assignee: 'syn-ronit', note: 'עם חוט' });
    ok(e, 'manager puts the task on Ronit while editing');
    const t = await docOf('tasks/' + id);
    check(t.assignee.uid === 'syn-ronit' && t.note === 'עם חוט' && !('takenAt' in t) && sameKeys(t, TASK_KEYS), 'assignee stored as {uid,name}, no takenAt (editTask writes none)', t);
    const a = await acts(id);
    const asg = a.find((x) => x.action === 'assigned');
    check(a.map((x) => x.action).sort().join() === 'assigned,created,edited' && asg.text === 'לתקן את הגדר ← רונית' && asg.subjectUid === 'syn-ronit' && a.every(({ via, ...x }) => sameKeys(x, ACT_KEYS) && via?.credential), 'activity edited + assigned, as editTask logs them', a);
    const n = (await notesOf('syn-ronit')).filter((x) => x.refId === id);
    check(n.length === 1 && n[0].title === 'משימה חדשה: לתקן את הגדר', 'the new person is notified', n);
    await w(MGR, 'tasks.edit', { taskId: id, assignee: 'syn-ronit', title: 'לתקן את הגדר מחר' });
    check((await notesOf('syn-ronit')).filter((x) => x.refId === id).length === 1 && (await acts(id)).filter((x) => x.action === 'assigned').length === 1, 'same assignee again: no new notification, no new "assigned"');
    const mine = await create(RONIT, { title: 'שלי לערוך' });
    check((await w(RONIT, 'tasks.edit', { taskId: mine, assignee: 'syn-noa' })).status === 403, 'staff cannot put their task on someone else (tasks:assign)');
    ok(await w(RONIT, 'tasks.edit', { taskId: mine, assignee: 'syn-ronit' }), 'staff may put their own task on themselves');
    ok(await w(RONIT, 'tasks.edit', { taskId: mine, clearAssignee: true }), 'and make it free again');
    check((await docOf('tasks/' + mine)).assignee === null, 'assignee cleared');
    check((await w(MGR, 'tasks.edit', { taskId: mine, assignee: 'syn-guest' })).status === 400, 'a guest cannot be the assignee');
    check((await w(MGR, 'tasks.edit', { taskId: mine, assignee: 'syn-noa', clearAssignee: true })).status === 400, 'assignee + clearAssignee → 400');
  }

  section('tasks.complete / reopen (setDone)');
  {
    const free = await create(OWNER, { title: 'משימה פנויה' });
    const key = randomUUID();
    const c = await w(RONIT, 'tasks.complete', { taskId: free }, key);
    check(c.status === 200 && c.json.data.verified && c.json.data.task.assignee?.uid === 'syn-ronit' && c.json.data.task.doneBy.uid === 'syn-ronit', 'a free one-off task becomes the completer\'s', c.json);
    let a = await acts(free);
    check(a.at(-1).action === 'done' && a.at(-1).subjectUid === 'syn-ronit', 'activity done, subject = the completer (assignee || actor)', a);
    check((await w(RONIT, 'tasks.complete', { taskId: free }, key)).json.data.replayed === true, 'replay');
    check(sameKeys(await docOf('tasks/' + free), TASK_KEYS), 'no field the app does not write');
    const theirs = await create(OWNER, { title: 'של נועה', assignee: 'syn-noa' });
    const c2 = await w(RONIT, 'tasks.complete', { taskId: theirs });
    check(c2.json.data.task.assignee.uid === 'syn-noa' && (await acts(theirs)).at(-1).subjectUid === 'syn-noa', 'someone else\'s task stays theirs; subject = assignee');
    const tplTask = 'tpl-x_2026-11-20';
    await seed('tasks/' + tplTask, baseTask({ title: 'שגרה', templateId: 'tpl-x', dateKey: '2026-11-20', dueDate: '2026-11-20' }));
    const c3 = await w(RONIT, 'tasks.complete', { taskId: tplTask });
    check(c3.json.data.task.assignee === null && c3.json.data.task.done, 'a recurring instance does not become the completer\'s');
    // reopen keeps the done photo and note
    const ph = PHOTO();
    const withPhoto = await create(OWNER, { title: 'עם תמונה' });
    const cp = await w(RONIT, 'tasks.complete', { taskId: withPhoto, donePhoto: ph, doneNote: 'נעשה' });
    check(cp.status === 200 && cp.json.data.task.donePhotoUrl === ph && cp.json.data.task.doneNote === 'נעשה' && cp.json.data.task.hasDonePhoto, 'done with a photo and a note in one call (doneWithPhoto)', cp.json);
    a = await acts(withPhoto);
    check(a.map((x) => x.action).sort().join() === 'created,done,photo' && a.find((x) => x.action === 'photo').text === 'עם תמונה: נעשה' && a.find((x) => x.action === 'done').subjectUid === 'syn-ronit', 'activity done + photo, as doneWithPhoto logs them', a);
    const ro = await w(MGR, 'tasks.reopen', { taskId: withPhoto });
    const after = await docOf('tasks/' + withPhoto);
    check(ro.status === 200 && after.done === false && after.doneBy === null && after.doneAt === null && after.donePhoto === ph && after.doneNote === 'נעשה', 'reopen clears done/doneBy/doneAt but keeps the done photo and note', after);
    check((await acts(withPhoto)).at(-1).action === 'undone' && (await acts(withPhoto)).at(-1).subjectUid === 'syn-ronit', 'undone, subject = assignee');
    check((await w(RONIT, 'tasks.complete', { taskId: withPhoto, donePhoto: 'data:image/jpeg;base64,AAAA' })).status === 400, 'a base64 photo is refused (only a stored link)');
    check((await w(RONIT, 'tasks.complete', { taskId: withPhoto, donePhoto: 'https://evil.example.com/x.jpg' })).status === 400, 'a link to another host is refused');
  }

  section('tasks.take / tasks.release');
  {
    const id = await create(OWNER, { title: 'לאסוף ביצים' });
    const key = randomUUID();
    const t = await w(RONIT, 'tasks.take', { taskId: id }, key);
    check(t.status === 200 && t.json.data.changed && t.json.data.record.assignee.uid === 'syn-ronit' && t.json.data.verified, 'staff takes a free task', t.json);
    const d = await docOf('tasks/' + id);
    check(sameKeys(d, [...TASK_KEYS, 'takenAt']) && /Z$/.test(d.takenAt) && d.updatedAt === d.takenAt, 'stored: assignee, takenAt, updatedAt (takeTask)', d);
    const a = await acts(id);
    check(a.at(-1).action === 'assigned' && a.at(-1).text === 'לאסוף ביצים ← רונית' && a.at(-1).subjectUid === 'syn-ronit' && a.at(-1).by.uid === 'syn-ronit', 'activity assigned', a.at(-1));
    const rep = await w(RONIT, 'tasks.take', { taskId: id }, key);
    check(rep.json.data.replayed === true && (await acts(id)).length === a.length, 'replay: nothing written twice');
    const second = await w(NOA, 'tasks.take', { taskId: id });
    check(second.status === 409 && second.json.error.code === 'STALE_WRITE' && second.json.error.details.assignee.uid === 'syn-ronit', 'someone else taking it → 409 naming who has it (X1)', second.json);
    check((await w(RONIT, 'tasks.take', { taskId: id })).json.data.changed === false, 'taking your own task again changes nothing');
    check((await w(NOA, 'tasks.release', { taskId: id })).status === 409, 'staff cannot release someone else\'s task');
    const rel = await w(RONIT, 'tasks.release', { taskId: id });
    check(rel.status === 200 && (await docOf('tasks/' + id)).assignee === null, 'release: free again');
    const ra = (await acts(id)).at(-1);
    check(ra.action === 'released' && ra.text === 'לאסוף ביצים' && ra.subjectUid === 'syn-ronit', 'activity released', ra);
    await w(NOA, 'tasks.take', { taskId: id });
    ok(await w(MGR, 'tasks.release', { taskId: id }), 'a manager releases anyone\'s task');
    const done = await create(OWNER, { title: 'כבר בוצעה' });
    await w(OWNER, 'tasks.complete', { taskId: done });
    check((await w(NOA, 'tasks.take', { taskId: done })).status === 409, 'a done task cannot be taken');
    await seed('tasks/syn-mo', baseTask({ title: 'סודי', managersOnly: true }));
    check((await w(NOA, 'tasks.take', { taskId: 'syn-mo' })).status === 404, 'staff: a manager-only task looks missing');
    ok(await w(MGR, 'tasks.take', { taskId: 'syn-mo' }), 'a manager takes it');
    check((await acts('syn-mo')).at(-1).kind === 'task_private', 'logged as task_private');
  }

  section('tasks.assign (assignTask)');
  {
    const id = await create(OWNER, { title: 'להזמין מספוא' });
    check((await w(RONIT, 'tasks.assign', { taskId: id, assignee: 'syn-noa' })).status === 403, 'staff → 403');
    check((await w(MGR, 'tasks.assign', { taskId: id })).status === 400 && (await w(MGR, 'tasks.assign', { taskId: id, assignee: 'syn-noa', release: true })).status === 400, 'exactly one of assignee / release');
    const key = randomUUID();
    const a = await w(MGR, 'tasks.assign', { taskId: id, assignee: 'syn-noa' }, key);
    check(a.status === 200 && a.json.data.changed && a.json.data.task.assignee.uid === 'syn-noa' && a.json.data.task.takenAt, 'assigned, takenAt stamped', a.json);
    check((await notesOf('syn-noa')).filter((n) => n.refId === id).length === 1 && (await pushesFor(id)).length === 1, 'the new person is notified (in the app + push)');
    check((await w(MGR, 'tasks.assign', { taskId: id, assignee: 'syn-noa' }, key)).json.data.replayed && (await pushesFor(id)).length === 1, 'replay: no second notification');
    const rel = await w(MGR, 'tasks.assign', { taskId: id, release: true });
    check(rel.status === 200 && rel.json.data.task.assignee === null, 'release by a manager');
    const ra = (await acts(id)).at(-1);
    check(ra.action === 'released' && ra.subjectUid === 'syn-noa', 'activity released, subject = who it was on', ra);
    check((await w(MGR, 'tasks.assign', { taskId: id, release: true })).json.data.changed === false, 'releasing a free task changes nothing');
    await w(MGR, 'tasks.complete', { taskId: id });
    check((await w(MGR, 'tasks.assign', { taskId: id, assignee: 'syn-ronit' })).status === 409, 'a done task cannot be reassigned');
    const mine = await create(MGR, { title: 'למנהל עצמו' });
    await w(MGR, 'tasks.assign', { taskId: mine, assignee: 'syn-mgr' });
    check((await pushesFor(mine)).length === 1, 'assigning to yourself queues one job');
  }

  section('tasks.delete: a recurring day');
  {
    await seed('task_templates/tpl-del', { title: 'להאכיל', note: '', days: [], time: '07:00', active: true, managersOnly: false, createdBy: ME.owner, createdAt: now, updatedAt: now, skip: ['2020-01-01', '2099-01-01'] });
    const day = todayIL();
    await seed(`tasks/tpl-del_${day}`, baseTask({ title: 'להאכיל', templateId: 'tpl-del', dateKey: day, dueDate: day, createdBy: ME.ronit }));
    check((await w(RONIT, 'tasks.delete', { taskId: `tpl-del_${day}` })).status === 403, 'staff cannot delete a recurring day, even one they created (canDeleteTask)');
    const d = await w(MGR, 'tasks.delete', { taskId: `tpl-del_${day}` });
    check(d.status === 200 && d.json.data.verified && !(await docOf(`tasks/tpl-del_${day}`)), 'a manager deletes it', d.json);
    const tpl = await docOf('task_templates/tpl-del');
    check(tpl.skip.join() === [day, '2099-01-01'].sort().join(), 'the template skips the day; past skips dropped (deleteTaskV2)', tpl.skip);
    check((await acts(`tpl-del_${day}`)).at(-1).action === 'deleted', 'activity deleted');
    const one = await create(RONIT, { title: 'למחוק' });
    ok(await w(RONIT, 'tasks.delete', { taskId: one }), 'a one-off task is still deleted by its creator');
  }

  section('task fields in reads');
  {
    const ph = PHOTO();
    await seed('tasks/syn-fields', baseTask({ title: 'שדות', takenAt: now, requestedBy: ME.mgr, shoppingId: 'shop-1', photo: ph, donePhoto: 'data:image/jpeg;base64,AAAA', assignee: ME.ronit }));
    const t = (await r(STAFF, '/v1/tasks/syn-fields')).json.data.task;
    check(t.takenAt === now && t.requestedBy.uid === 'syn-mgr' && t.shoppingId === 'shop-1', 'takenAt, requestedBy, shoppingId returned', t);
    check(t.hasPhoto && t.photoUrl === ph && t.hasDonePhoto && t.donePhotoUrl === null && !JSON.stringify(t).includes('base64'), 'a stored link is returned, a base64 photo only as a flag', t);
  }

  section('tasks.list: event, place, template, history, overdue');
  {
    await seed('places/pl-list', { name: 'לול', lat: 31.5, lng: 34.6, createdBy: ME.owner, createdAt: now });
    await seed('events/ev-list', { title: 'פסטיבל', start: '2026-12-01T10:00', end: '2026-12-01T14:00', createdBy: ME.owner, createdAt: now, updatedAt: now });
    for (let i = 0; i < 7; i++) await create(OWNER, { title: 'לאירוע ' + i, eventId: 'ev-list' });
    await create(OWNER, { title: 'בלול', placeId: 'pl-list' });
    await seed('tasks/syn-mo-place', baseTask({ title: 'סוד בלול', managersOnly: true, location: { lat: 31.5, lng: 34.6, placeId: 'pl-list', placeName: 'לול' } }));
    const ev = (await r(OWNER, '/v1/tasks?eventId=ev-list&limit=3')).json.data;
    const ev2 = (await r(OWNER, '/v1/tasks?eventId=ev-list&limit=3&cursor=' + encodeURIComponent(ev.nextCursor))).json.data;
    const ev3 = (await r(OWNER, '/v1/tasks?eventId=ev-list&limit=3&cursor=' + encodeURIComponent(ev2.nextCursor))).json.data;
    const all = [...ev.items, ...ev2.items, ...ev3.items];
    check(all.length === 7 && new Set(all.map((x) => x.id)).size === 7 && all.every((x) => x.eventId === 'ev-list') && !ev3.hasMore && ev.complete === true, 'eventId: 7 tasks in pages of 3, each once', all.map((x) => x.title));
    check(all.every((x, i) => i === 0 || all[i - 1].createdAt >= x.createdAt), 'newest first');
    const badCur = await r(OWNER, '/v1/tasks?placeId=pl-list&cursor=' + encodeURIComponent(ev.nextCursor));
    check(badCur.status === 400, 'a cursor from another filter is refused');
    const plStaff = (await r(STAFF, '/v1/tasks?placeId=pl-list')).json.data.items;
    const plMgr = (await r(MGR, '/v1/tasks?placeId=pl-list')).json.data.items;
    check(plStaff.length === 1 && plStaff[0].title === 'בלול' && plMgr.length === 2, 'placeId (location.placeId); staff never see manager-only tasks', { plStaff, plMgr: plMgr.map((x) => x.title) });
    await seed('tasks/tpl-l_2026-11-01', baseTask({ title: 'שגרה 1', templateId: 'tpl-l', dateKey: '2026-11-01', createdAt: '2026-11-01T05:00:00.000Z' }));
    await seed('tasks/tpl-l_2026-11-02', baseTask({ title: 'שגרה 2', templateId: 'tpl-l', dateKey: '2026-11-02', createdAt: '2026-11-02T05:00:00.000Z' }));
    const tl = (await r(OWNER, '/v1/tasks?templateId=tpl-l')).json.data.items;
    check(tl.map((x) => x.id).join() === 'tpl-l_2026-11-02,tpl-l_2026-11-01', 'templateId: the instances, newest first', tl.map((x) => x.id));
    // done history (Israel days; March 2026 is UTC+2)
    await seed('tasks/h1', baseTask({ title: 'היסטוריה 1', done: true, doneBy: ME.ronit, doneAt: '2026-03-10T10:00:00.000Z' }));
    await seed('tasks/h2', baseTask({ title: 'היסטוריה 2', done: true, doneBy: ME.ronit, doneAt: '2026-03-12T21:30:00.000Z' }));
    await seed('tasks/h3', baseTask({ title: 'היסטוריה 3', done: true, doneBy: ME.ronit, doneAt: '2026-03-12T22:30:00.000Z' }));
    await seed('tasks/h4', baseTask({ title: 'היסטוריה סודית', managersOnly: true, done: true, doneBy: ME.mgr, doneAt: '2026-03-11T10:00:00.000Z' }));
    const h = (await r(MGR, '/v1/tasks?doneFrom=2026-03-10&doneTo=2026-03-12')).json.data.items.map((x) => x.id);
    check(h.join() === 'h2,h4,h1', 'doneFrom/doneTo: Israel days inclusive, latest done first (23:30 on the 12th in, 00:30 on the 13th out)', h);
    const hs = (await r(STAFF, '/v1/tasks?doneFrom=2026-03-10&doneTo=2026-03-12')).json.data.items.map((x) => x.id);
    check(hs.join() === 'h2,h1', 'staff history without manager-only tasks', hs);
    const hp = (await r(MGR, '/v1/tasks?doneFrom=2026-03-10&doneTo=2026-03-13&limit=2')).json.data;
    const hp2 = (await r(MGR, '/v1/tasks?doneFrom=2026-03-10&doneTo=2026-03-13&limit=2&cursor=' + encodeURIComponent(hp.nextCursor))).json.data;
    check([...hp.items, ...hp2.items].map((x) => x.id).join() === 'h3,h2,h4,h1' && !hp2.hasMore, 'history pages by doneAt');
    check((await r(MGR, '/v1/tasks?doneFrom=2026-03-10&assignee=syn-ronit')).status === 400 && (await r(MGR, '/v1/tasks?doneFrom=2026-03-12&doneTo=2026-03-10')).status === 400, 'history + other filters, or a reversed range → 400');
    // overdue
    await seed('tasks/od1', baseTask({ title: 'באיחור ישן', dueDate: '2020-01-01' }));
    await seed('tasks/od2', baseTask({ title: 'באיחור', dueDate: '2026-01-05', assignee: ME.ronit }));
    await seed('tasks/od3', baseTask({ title: 'עתידית', dueDate: '2099-01-01' }));
    await seed('tasks/od4', baseTask({ title: 'באיחור אבל בוצעה', dueDate: '2020-01-01', done: true, doneBy: ME.ronit, doneAt: now }));
    await seed('tasks/od5', baseTask({ title: 'באיחור סודי', dueDate: '2020-02-01', managersOnly: true }));
    const od = (await r(MGR, '/v1/tasks?overdue=true')).json.data.items.map((x) => x.id);
    check(od.includes('od1') && od.includes('od2') && od.includes('od5') && !od.includes('od3') && !od.includes('od4') && od.indexOf('od1') < od.indexOf('od5') && od.indexOf('od5') < od.indexOf('od2'), 'overdue: open, past due, earliest due first', od);
    check(!(await r(STAFF, '/v1/tasks?overdue=true')).json.data.items.some((x) => x.id === 'od5'), 'staff overdue without manager-only');
    check((await r(MGR, '/v1/tasks?overdue=true&assignee=syn-ronit')).json.data.items.map((x) => x.id).join() === 'od2', 'overdue + assignee');
    check((await r(MGR, '/v1/tasks?overdue=true&done=true')).status === 400, 'overdue + done=true → 400');
  }

  section('photos: tasks.setPhoto / tasks.setDonePhoto');
  {
    const id = await create(OWNER, { title: 'עם צילום' });
    const ph = PHOTO();
    const s = await w(NOA, 'tasks.setPhoto', { taskId: id, photo: ph });
    check(s.status === 200 && s.json.data.verified && (await docOf('tasks/' + id)).photo === ph, 'a stored link is saved on the task', s.json);
    check((await acts(id)).at(-1).action === 'photo' && (await acts(id)).at(-1).text === 'עם צילום', 'activity photo (setTaskPhoto)');
    check((await w(NOA, 'tasks.setPhoto', { taskId: id, photo: 'data:image/webp;base64,AAAA' })).status === 400, 'base64 refused: the API cannot upload');
    ok(await w(NOA, 'tasks.setPhoto', { taskId: id, photo: '' }), 'an empty photo removes it');
    const dp = PHOTO();
    const sd = await w(NOA, 'tasks.setDonePhoto', { taskId: id, donePhoto: dp, note: 'הנה' });
    const t = await docOf('tasks/' + id);
    check(sd.status === 200 && t.donePhoto === dp && t.doneNote === 'הנה' && (await acts(id)).at(-1).text === 'עם צילום: הנה', 'done photo + note, activity photo with the note (setDoneDetails)', t);
    check(sameKeys(t, TASK_KEYS), 'no extra fields');
  }

  section('tasks.addShopping / shopping.add');
  {
    const tid = await create(RONIT, { title: 'לבנות מדף' });
    const key = randomUUID();
    const a = await w(NOA, 'tasks.addShopping', { taskId: tid, title: 'ברגים', qty: '2 קופסאות', category: 'building' }, key);
    check(a.status === 201 && a.json.data.verified, 'item for a task', a.json);
    const sid = a.json.data.itemId;
    const item = await docOf('shopping/' + sid);
    check(sameKeys(item, [...ITEM_KEYS, 'taskId']) && item.taskId === tid && item.createdBy.uid === 'syn-noa', 'item: the app\'s fields plus taskId', item);
    const task = await docOf('tasks/' + tid);
    check(task.shoppingId === sid && sameKeys(task, [...TASK_KEYS, 'shoppingId']), 'task: shoppingId back (createShopping)', task);
    const al = await acts(sid);
    check(al.length === 1 && al[0].action === 'added' && al[0].text === 'ברגים · 2 קופסאות (בניין)', 'activity added with the v2 list label', al);
    check((await w(NOA, 'tasks.addShopping', { taskId: tid, title: 'ברגים', qty: '2 קופסאות', category: 'building' }, key)).json.data.replayed && (await where('shopping', 'taskId', tid)).length === 1, 'replay: one item');
    check(!(await pushesFor(sid)).length, 'not urgent: nobody notified');
    check((await w(STAFF, 'tasks.addShopping', { taskId: 'syn-mo', title: 'x' })).status === 404, 'staff: not for a manager-only task');
    // urgent tells the team
    const u = await w(RONIT, 'shopping.add', { title: 'חלב', qty: '3', urgent: true, link: 'https://example.com/milk', taskId: tid });
    check(u.status === 201 && u.json.data.item.taskId === tid && u.json.data.item.link === 'https://example.com/milk' && u.json.data.item.urgent, 'shopping.add with taskId and link', u.json);
    const uid = u.json.data.itemId;
    const pj = await pushesFor(uid);
    check(pj.length === 1 && pj[0].kind === 'urgent' && pj[0].title === 'דחוף לכולם' && pj[0].body === 'חלב · 3' && [...pj[0].to].sort().join() === [...TEAM].sort().join(), 'urgent: one push to the whole active team including the sender (no guest, no blocked)', pj);
    const nn = (await notesOf('syn-noa')).filter((n) => n.refId === uid);
    check(nn.length === 1 && nn[0].kind === 'urgent' && nn[0].link === `/shopping/${uid}` && sameKeys(nn[0], NOTE_KEYS), 'and an in-app notification each', nn);
    check((await notesOf('syn-ronit')).filter((n) => n.refId === uid).length === 1 && !(await notesOf('syn-guest')).some((n) => n.refId === uid), 'one for the sender, none for guests');
    check((await w(RONIT, 'shopping.add', { title: 'x', photo: 'data:image/jpeg;base64,AA' })).status === 400, 'shopping.add: base64 photo refused');
    check((await w(RONIT, 'shopping.add', { title: 'x', taskId: 'no-such-task' })).status === 400, 'shopping.add: unknown task → 400');
    const plain = await w(RONIT, 'shopping.add', { title: 'סוכר' });
    check(sameKeys(await docOf('shopping/' + plain.json.data.itemId), ITEM_KEYS), 'a plain item keeps exactly the old shape');
    const read = (await r(RONIT, '/v1/shopping?limit=100')).json.data.items.find((i) => i.id === uid);
    check(read && read.taskId === tid && read.notAvailable === false && read.tripId === null && read.hasPhoto === false && 'expireAt' in read && read.foundWhere === '', 'shopping.list returns taskId, notAvailable, tripId, photo flag, expireAt', read);
  }

  section('shopping trips');
  {
    const old = new Date(Date.now() - 10 * 3600_000).toISOString();
    const older = new Date(Date.now() - 20 * 3600_000).toISOString();
    await seed('shopping_trips/trip-old', { id: 'trip-old', by: ME.ronit, list: 'super', startedAt: old, closedAt: null, bought: [], missing: [] });
    await seed('shopping_trips/trip-older', { id: 'trip-older', by: ME.ronit, list: 'online', startedAt: older, bought: [], missing: [] });
    const resumed = await w(RONIT, 'shopping.startTrip', { list: 'building' });
    check(resumed.status === 200 && resumed.json.data.resumed && resumed.json.data.tripId === 'trip-old' && resumed.json.data.list === 'super'
      && (await docOf('shopping_trips/trip-old')).closedAt === null && !(await docOf('shopping_trips/trip-older')).closedAt
      && !(await pushesFor('trip-old')).length && !(await acts('trip-old')).length
      && !(await notesOf('syn-ronit')).some((n) => n.refId === 'trip-old'),
    'resume the newest unclosed trip even after 8 hours, preserving its list and leaving both trips untouched', resumed.json);
    for (const id of ['trip-old', 'trip-older']) {
      await w(MGR, 'shopping.deleteTrip', { tripId: id });
      check(!(await docOf('shopping_trips/' + id)), 'cleanup: ' + id + ' gone');
    }
    const key = randomUUID();
    const s = await w(RONIT, 'shopping.startTrip', { list: 'super' }, key);
    check(s.status === 201 && s.json.data.resumed === false && s.json.data.verified, 'start a trip', s.json);
    const tripId = s.json.data.tripId;
    const trip = await docOf('shopping_trips/' + tripId);
    check(sameKeys(trip, TRIP_KEYS) && trip.id === tripId && trip.by.uid === 'syn-ronit' && trip.list === 'super' && trip.closedAt === null && !trip.bought.length && !trip.missing.length, 'trip document as startTrip writes it', trip);
    const tn = (await notesOf('syn-noa')).filter((n) => n.refId === tripId);
    check(tn.length === 1 && tn[0].kind === 'trip' && tn[0].title === 'רונית יוצאת לסופר עכשיו' && tn[0].sub === 'צריך משהו? עוד אפשר להוסיף' && tn[0].link === '/shopping?list=super' && tn[0].action?.kind === 'addToTrip' && tn[0].action?.label === 'הוספה' && sameKeys(tn[0], [...NOTE_KEYS, 'action']), 'the team is told, with the "הוספה" action', tn);
    check((await pushesFor(tripId)).length === 1, 'with a push');
    check((await w(RONIT, 'shopping.startTrip', { list: 'super' }, key)).json.data.replayed, 'replay');
    const again = await w(RONIT, 'shopping.startTrip', { list: 'building' });
    check(again.json.data.resumed === true && again.json.data.tripId === tripId && (await pushesFor(tripId)).length === 1, 'starting again resumes my open trip, nothing sent');
    // items on the trip
    const i1 = (await w(NOA, 'shopping.add', { title: 'לחם' })).json.data.itemId;
    const i2 = (await w(NOA, 'shopping.add', { title: 'קפה שחור' })).json.data.itemId;
    const i3 = (await w(NOA, 'shopping.add', { title: 'מסמרים', category: 'building' })).json.data.itemId;
    check((await w(RONIT, 'shopping.setMissing', { itemId: i1 })).status === 400, 'setMissing needs the trip');
    const m = await w(RONIT, 'shopping.setMissing', { itemId: i2, tripId });
    const mi = await docOf('shopping/' + i2);
    check(m.status === 200 && mi.notAvailable === true && /Z$/.test(mi.notAvailableAt) && mi.tripId === tripId && mi.bought === false, '"אין": notAvailable, notAvailableAt, tripId; stays open', mi);
    check((await acts(i2)).at(-1).action === 'unavailable' && (await acts(i2)).at(-1).text === 'קפה שחור', 'activity unavailable');
    await w(RONIT, 'shopping.setMissing', { itemId: i1, tripId });
    const b = await w(RONIT, 'shopping.setBought', { itemId: i1, tripId });
    const bi = await docOf('shopping/' + i1);
    check(b.status === 200 && b.json.data.verified && bi.bought && bi.tripId === tripId && bi.notAvailable === false && bi.notAvailableAt === null, 'bought on the trip: tripId kept, "אין" cleared (setItemBought)', bi);
    check((await w(RONIT, 'shopping.setBought', { itemId: i3, tripId: 'no-such-trip' })).status === 400, 'unknown trip → 400');
    await w(RONIT, 'shopping.setBought', { itemId: i3, tripId });
    const unm = await w(RONIT, 'shopping.setMissing', { itemId: i2, tripId, missing: false });
    check(unm.status === 200 && (await docOf('shopping/' + i2)).notAvailable === false && (await acts(i2)).filter((a) => a.action === 'unavailable').length === 1, 'un-marking: no activity (setItemMissing)');
    await w(RONIT, 'shopping.setMissing', { itemId: i2, tripId });
    // close
    check((await w(NOA, 'shopping.closeTrip', { tripId })).status === 403, 'only the shopper closes the trip');
    const c = await w(RONIT, 'shopping.closeTrip', { tripId });
    const ct = await docOf('shopping_trips/' + tripId);
    check(c.status === 200 && ct.closedAt && ct.bought.join() === i1 && ct.missing.join() === i2, 'closed with what was bought and missing on this list (the building item is not on it)', ct);
    const cn = (await notesOf('syn-noa')).filter((n) => n.refId === tripId);
    check(cn.length === 2 && cn.some((n) => n.title === 'הקנייה בסופר נסגרה' && n.sub === 'פריט אחד נקנה · קפה שחור לא היה' && n.link === `/shopping/trip/done?id=${tripId}`), 'the team is told in the app', cn);
    check((await pushesFor(tripId)).length === 1, 'no push for closing');
    check((await w(RONIT, 'shopping.closeTrip', { tripId })).json.data.changed === false, 'closing again changes nothing');
    check((await w(NOA, 'shopping.reopenTrip', { tripId })).status === 403, 'only the shopper reopens it');
    ok(await w(RONIT, 'shopping.reopenTrip', { tripId }), 'reopen');
    check((await docOf('shopping_trips/' + tripId)).closedAt === null, 'closedAt null again');
    const list = (await r(NOA, '/v1/shopping-trips')).json.data.items;
    check(list[0].id === tripId && !list.some((t) => t.id === 'trip-old'), 'shoppingTrips.list, latest first', list.map((t) => t.id));
    check((await r(NOA, '/v1/shopping-trips/' + tripId)).json.data.record.by.uid === 'syn-ronit', 'shoppingTrips.get');
    check((await w(RONIT, 'shopping.deleteTrip', { tripId })).status === 403, 'staff cannot delete a trip');
    const del = await w(MGR, 'shopping.deleteTrip', { tripId });
    check(del.status === 200 && !(await docOf('shopping_trips/' + tripId)) && (await docOf('shopping/' + i1)).bought, 'a manager deletes it; bought stays bought');
  }

  section('team categories and the audience for a single shopping trip');
  {
    const created=await w(RONIT,'shopping.createCategory',{name:'חומרים  לבדיקה'});
    ok(created,'a volunteer can create a category');
    const category=created.json.data.id;
    const same=await w(NOA,'shopping.createCategory',{name:'  חומרים לבדיקה '});
    check(same.json.data.id===category && (await docOf('shopping_categories/'+category)).name==='חומרים לבדיקה','creation and normalized retry resolve to one shared category');
    const begin=await w(RONIT,'shopping.startTrip',{list:category,recipientUids:['syn-noa','syn-noa','syn-guest']});
    ok(begin,'start a trip for a custom category');
    const id=begin.json.data.tripId;
    check((await docOf('shopping_trips/'+id)).recipientUids.join()==='syn-noa','the audience intersects active staff, without forcing the shopper into it');
    check((await pushesFor(id))[0]?.to.join()==='syn-noa','only the selected manager is queued');
    await w(RONIT,'shopping.closeTrip',{tripId:id});
    check((await notesOf('syn-noa')).filter(n=>n.refId===id).length===2 && !(await notesOf('syn-ronit')).some(n=>n.refId===id),'closure uses the same audience');
    const quiet=await w(RONIT,'shopping.startTrip',{list:'super',recipientUids:[]});
    ok(quiet,'an explicit empty audience opens the trip');
    check(!(await pushesFor(quiet.json.data.tripId)).length,'no recipients produce no push');
    await w(RONIT,'shopping.closeTrip',{tripId:quiet.json.data.tripId});
  }

  section('recurring templates');
  {
    await seed('places/pl-tpl', { name: 'רפת', lat: 31.6, lng: 34.7, createdBy: ME.owner, createdAt: now });
    const a = await w(MGR, 'templates.create', { title: 'חליבה', days: [0, 1, 2, 3, 4, 5, 6], time: '06:00', assignee: 'syn-ronit', placeId: 'pl-tpl' });
    ok(a, 'templates.create with person and place');
    const t = await docOf('task_templates/' + a.json.data.templateId);
    check(sameKeys(t, [...TEMPLATE_KEYS, 'assignee', 'placeId']) && t.days.length === 0 && t.assignee.uid === 'syn-ronit' && t.assignee.name === 'רונית' && t.placeId === 'pl-tpl', 'all seven days stored as [] (daysToSave); assignee {uid,name}; placeId', t);
    const plain = await w(MGR, 'templates.create', { title: 'ישן', days: [1, 3] });
    check(sameKeys(await docOf('task_templates/' + plain.json.data.templateId), TEMPLATE_KEYS), 'without person and place: the old shape exactly');
    const mo = await w(MGR, 'templates.create', { title: 'הנהלה', managersOnly: true, assignee: 'syn-ronit' });
    check((await docOf('task_templates/' + mo.json.data.templateId)).assignee === null, 'manager-only: assignee stored null');
    const id = a.json.data.templateId;
    ok(await w(MGR, 'templates.update', { templateId: id, managersOnly: true }), 'make it manager-only');
    check((await docOf('task_templates/' + id)).assignee === null, 'its person is cleared, as saveTemplateV2 does');
    await w(MGR, 'templates.update', { templateId: id, managersOnly: false, assignee: 'syn-noa' });
    check((await docOf('task_templates/' + id)).assignee.uid === 'syn-noa', 'person set again');
    await w(MGR, 'templates.update', { templateId: id, clearAssignee: true, clearPlace: true });
    const c = await docOf('task_templates/' + id);
    check(c.assignee === null && c.placeId === '', 'clearAssignee → null, clearPlace → ""', c);
    await w(MGR, 'templates.update', { templateId: plain.json.data.templateId, clearPlace: true, clearAssignee: true, days: [0, 1, 2, 3, 4, 5, 6] });
    const pc = await docOf('task_templates/' + plain.json.data.templateId);
    check(sameKeys(pc, TEMPLATE_KEYS) && pc.days.length === 0, 'clearing fields a template never had adds nothing', pc);
    check((await w(RONIT, 'templates.create', { title: 'x' })).status === 403, 'staff cannot create templates');
    check((await w(MGR, 'templates.create', { title: 'x', placeId: 'no-such-place' })).status === 404, 'unknown place → 404');
  }

  section('places');
  {
    const a = await w(OWNER, 'places.add', { name: 'מחסן', lat: 31.55, lng: 34.65, accuracy: 12.5 });
    ok(a, 'owner adds a place');
    const pid = a.json.data.placeId;
    const p = await docOf('places/' + pid);
    check(sameKeys(p, [...PLACE_KEYS, 'accuracy']) && p.accuracy === 12.5 && p.createdBy.uid === 'synthetic-owner', 'with accuracy (createPlace)', p);
    check((await acts(pid)).map((x) => x.action + ':' + x.kind + ':' + x.text).join() === 'created:place:מחסן', 'activity created');
    const noAcc = await w(OWNER, 'places.add', { name: 'בלי דיוק', lat: 31, lng: 34 });
    check(sameKeys(await docOf('places/' + noAcc.json.data.placeId), PLACE_KEYS), 'without accuracy: no accuracy field');
    ok(await w(OWNER, 'places.update', { placeId: pid, name: 'מחסן כלים', accuracy: 5 }), 'owner edits a place');
    const ph = PHOTO('syn-noa').replace('/task/', '/place/');
    ok(await w(OWNER, 'places.update', { placeId: pid, photo: ph }), 'a stored photo for the place');
    const p2 = await docOf('places/' + pid);
    check(p2.name === 'מחסן כלים' && p2.accuracy === 5 && p2.photo === ph && !('updatedAt' in p2), 'name, accuracy and photo; no updatedAt (the rules allow none)', p2);
    check((await acts(pid)).map((x) => x.action + ':' + x.text).join() === 'created:מחסן,edited:מחסן כלים,edited:מחסן כלים', 'activity edited each time (savePlace)', await acts(pid));
    check((await w(OWNER, 'places.update', { placeId: pid, photo: 'data:image/jpeg;base64,AA' })).status === 400, 'base64 place photo refused');
    check((await w(RONIT, 'places.delete', { placeId: pid })).status === 403, 'staff cannot delete a place');
    check((await w(MGR, 'places.update', { placeId: pid, lat: 32 })).status === 403, 'manager cannot move a place');
    check((await w(MGR, 'places.delete', { placeId: pid })).status === 403, 'manager cannot delete a place');
    const d = await w(OWNER, 'places.delete', { placeId: pid });
    check(d.status === 200 && !(await docOf('places/' + pid)) && (await acts(pid)).at(-1).action === 'deleted' && (await acts(pid)).at(-1).text === 'מחסן כלים', 'an owner deletes it, activity deleted');
  }

  section('projects');
  let projectId;
  {
    check((await r(RONIT, '/v1/projects')).status === 403 && (await w(RONIT, 'projects.create', { title: 'x' })).status === 403, 'staff: no projects at all');
    const steps = JSON.stringify([{ title: 'לסגור ספקים', assignee: 'syn-mgr' }, { title: 'לתאם משטרה' }, { title: '  ' }, { title: 'לפרסם', assignee: null }]);
    const key = randomUUID();
    const c = await w(OWNER, 'projects.create', { title: 'הכנות לפסטיבל', deadline: '2026-12-24', steps }, key);
    check(c.status === 201 && c.json.data.verified && c.json.data.stepIds.length === 3, 'create with steps (an empty row is dropped)', c.json);
    projectId = c.json.data.projectId;
    const p = await docOf('projects/' + projectId);
    check(sameKeys(p, PROJECT_KEYS) && p.id === projectId && p.goal === p.title && p.deadline === '2026-12-24' && p.status === 'active' && p.doneAt === null, 'project document as createProject writes it (no deadlineText for a date)', p);
    check(p.members.map((m) => m.uid).join() === 'synthetic-owner,syn-mgr' && p.memberUids.join() === 'synthetic-owner,syn-mgr', 'members: the creator, then people given a step');
    const st = (await listOf(`projects/${projectId}/steps`)).sort((a, b) => a.n - b.n);
    check(st.length === 3 && st.every((s) => sameKeys(s, STEP_KEYS) && s.projectId === projectId && s.updates.length === 0 && s.done === false && s.parentId === null) && st.map((s) => s.n).join() === '1,2,3' && st[0].assignee.uid === 'syn-mgr', 'steps as newStep writes them', st);
    const n = (await notesOf('syn-mgr')).filter((x) => x.refId === st[0]._id);
    check(n.length === 1 && n[0].title === 'צעד חדש עליך' && n[0].sub === 'לסגור ספקים · הכנות לפסטיבל, צעד 1 מתוך 3' && n[0].link === `/projects/${projectId}/steps/${st[0]._id}`, 'the person given a step is notified', n);
    check((await w(OWNER, 'projects.create', { title: 'הכנות לפסטיבל', deadline: '2026-12-24', steps }, key)).json.data.replayed && (await notesOf('syn-mgr')).filter((x) => x.refId === st[0]._id).length === 1, 'replay: no second project, no second notification');
    const txt = await w(MGR, 'projects.create', { title: 'השקיה', deadline: 'סוף דצמבר' });
    const tp = await docOf('projects/' + txt.json.data.projectId);
    check(tp.deadline === '' && tp.deadlineText === 'סוף דצמבר' && sameKeys(tp, [...PROJECT_KEYS, 'deadlineText']), 'a free-text deadline is kept as deadlineText');
    check((await w(MGR, 'projects.create', { title: 'x', steps: '[{"title":"a","who":1}]' })).status === 400 && (await w(MGR, 'projects.create', { title: 'x', steps: 'not json' })).status === 400, 'malformed steps → 400');
    // reads
    const g = (await r(MGR, '/v1/projects/' + projectId)).json.data.record;
    check(g.steps.length === 3 && g.steps[0].title === 'לסגור ספקים' && g.progress.total === 3 && g.progress.free === 2 && g.progress.done === 0, 'projects.get comes with its ordered steps and progress', g);
    check((await r(MGR, '/v1/projects')).json.data.items.some((x) => x.id === projectId && x.steps.length === 3), 'projects.list too');
    // take / release / complete
    const free = st[1]._id, last = st[2]._id, first = st[0]._id;
    const tk = await w(MGR, 'projects.takeStep', { projectId, stepId: free });
    check(tk.status === 200 && (await docOf(`projects/${projectId}/steps/${free}`)).assignee.uid === 'syn-mgr', 'take a free step', tk.json);
    check((await w(OWNER, 'projects.takeStep', { projectId, stepId: free })).status === 409, 'a step held by someone else → 409');
    check((await w(OWNER, 'projects.releaseStep', { projectId, stepId: free })).status === 409, 'release someone else\'s step → 409');
    ok(await w(MGR, 'projects.releaseStep', { projectId, stepId: free }), 'release my own step');
    ok(await w(OWNER, 'projects.takeStep', { projectId, stepId: free }), 'the owner takes it');
    const pm = await docOf('projects/' + projectId);
    check(pm.memberUids.join() === 'synthetic-owner,syn-mgr' && pm.members.length === 2, 'members are a union (no duplicates)', pm.members);
    ok(await w(MGR, 'projects.completeStep', { projectId, stepId: first }), 'complete step 1');
    const s1 = await docOf(`projects/${projectId}/steps/${first}`);
    check(s1.done && s1.doneBy.uid === 'syn-mgr' && /\.\d{3}Z$/.test(s1.doneAt), 'done by the caller, doneAt an ISO time the rules accept', s1);
    check((await w(MGR, 'projects.completeStep', { projectId, stepId: first })).status === 409, 'already done → 409');
    await w(OWNER, 'projects.completeStep', { projectId, stepId: free });
    const lastDone = await w(OWNER, 'projects.completeStep', { projectId, stepId: last });
    const pd = await docOf('projects/' + projectId);
    check(lastDone.json.data.projectDone === true && pd.status === 'done' && pd.doneAt, 'the last open step closes the project', pd);
    const ro = await w(OWNER, 'projects.reopenStep', { projectId, stepId: last });
    check(ro.status === 200 && (await docOf('projects/' + projectId)).status === 'active' && (await docOf('projects/' + projectId)).doneAt === null && (await docOf(`projects/${projectId}/steps/${last}`)).doneBy === null, 'reopen: step open, project active');
    // thread
    const pu = await w(MGR, 'projects.postUpdate', { projectId, stepId: last, text: 'דיברתי עם המשטרה' });
    const sl = await docOf(`projects/${projectId}/steps/${last}`);
    check(pu.status === 200 && sl.updates.length === 1 && sl.updates[0].by.uid === 'syn-mgr' && sl.updates[0].text === 'דיברתי עם המשטרה' && sameKeys(sl.updates[0], ['by', 'at', 'text']), 'the update is appended', sl.updates);
    const on = (await notesOf('synthetic-owner')).filter((x) => x.refId === last);
    check(on.length === 1 && on[0].title === 'עדכון בהכנות לפסטיבל' && on[0].sub === 'לפרסם: דיברתי עם המשטרה' && !(await pushesFor(last)).length && (await notesOf('syn-mgr')).filter((x) => x.refId === last && x.title.startsWith('עדכון')).length === 1, 'members including the poster told in the app (no push)', on);
    // split / edit / add
    const sp = await w(MGR, 'projects.splitStep', { projectId, stepId: first, titles: ['לסגור חשמלאי', 'לסגור במה'] });
    check(sp.status === 201 && sp.json.data.stepIds.length === 2, 'split', sp.json);
    const subs = await Promise.all(sp.json.data.stepIds.map((id) => docOf(`projects/${projectId}/steps/${id}`)));
    check(subs[0].n > 1 && subs[0].n < subs[1].n && subs[1].n < 2 && subs.every((s) => s.parentId === first && s.assignee.uid === 'syn-mgr' && sameKeys(s, STEP_KEYS)), 'sub-steps right after it, with its assignee and parentId', subs);
    ok(await w(MGR, 'projects.updateStep', { projectId, stepId: last, due: '2026-12-20', note: 'לבדוק אישור' }), 'updateStep');
    const ue = await docOf(`projects/${projectId}/steps/${last}`);
    check(ue.due === '2026-12-20' && ue.note === 'לבדוק אישור' && ue.title === 'לפרסם', 'due and note changed, title kept');
    const ad = await w(MGR, 'projects.addStep', { projectId, title: 'לנקות אחרי' });
    check(ad.status === 201 && (await docOf(`projects/${projectId}/steps/${ad.json.data.stepId}`)).n === 4, 'addStep at the end (n = 4)');
    // update with the form's list: rename, give a step to Noa... (a manager only), drop an open step
    const cur = (await r(MGR, '/v1/projects/' + projectId)).json.data.record.steps;
    const keep = cur.filter((s) => s.id !== ad.json.data.stepId).map((s) => ({ id: s.id, title: s.id === last ? 'לפרסם ברשתות' : s.title }));
    keep.push({ title: 'צעד חדש לבעלים', assignee: 'synthetic-owner' });
    const up = await w(MGR, 'projects.update', { projectId, title: 'פסטיבל חנוכה', deadline: '24.12.26', steps: JSON.stringify(keep) });
    check(up.status === 200 && up.json.data.removedStepIds.join() === ad.json.data.stepId && up.json.data.createdStepIds.length === 1, 'update: one created, the left-out open step removed', up.json);
    check(!(await docOf(`projects/${projectId}/steps/${ad.json.data.stepId}`)), 'the removed step is gone');
    const pu2 = await docOf('projects/' + projectId);
    check(pu2.title === 'פסטיבל חנוכה' && pu2.goal === 'פסטיבל חנוכה' && pu2.deadline === '2026-12-24' && pu2.deadlineText === '', 'title, goal and deadline ("24.12.26") as saveProject writes them', pu2);
    const after = (await listOf(`projects/${projectId}/steps`));
    check(after.find((s) => s._id === last).title === 'לפרסם ברשתות' && after.length === 6 && after.find((s) => s._id === first).done === true, 'rename applied; done steps kept', after.map((s) => s.title));
    const newId = up.json.data.createdStepIds[0];
    check((await notesOf('synthetic-owner')).some((x) => x.refId === newId && x.title === 'צעד חדש עליך'), 'the person given the new step is notified');
    check((await w(MGR, 'projects.update', { projectId, steps: JSON.stringify([{ id: first, title: 'x', assignee: 'syn-guest' }]) })).status === 400, 'a guest cannot get a step');
    // delete
    check((await w(MGR, 'projects.delete', { projectId })).status === 403, 'a manager cannot delete a project (owner only)');
    const del = await w(OWNER, 'projects.delete', { projectId });
    check(del.status === 200 && del.json.data.verified && !(await docOf('projects/' + projectId)) && !(await listOf(`projects/${projectId}/steps`)).length, 'the owner deletes it with every step', del.json);
    check((await acts(projectId)).some((a) => a.kind === 'project' && a.action === 'created'), 'project creation has a manager-only activity entry');
  }

  section('compatibility with the app and its Rules');
  {
    const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
    require('firebase/compat/firestore');
    const { doc, getDoc, updateDoc, arrayUnion } = require('firebase/firestore');
    rulesEnv = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: EMU.split(':')[0], port: Number(EMU.split(':')[1]) } });
    const claims = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const ronit = rulesEnv.authenticatedContext('syn-ronit', claims('syn-ronit@synthetic.invalid')).firestore();
    const noa = rulesEnv.authenticatedContext('syn-noa', claims('syn-noa@synthetic.invalid')).firestore();
    const dani = rulesEnv.authenticatedContext('syn-mgr', claims('syn-mgr@synthetic.invalid')).firestore();
    const n = new Date().toISOString();
    let label;
    try {
      // an API-taken task: the holder releases it in the app, someone else then takes it in the app
      const id = await create(OWNER, { title: 'לבדיקת חוקים' });
      await w(RONIT, 'tasks.take', { taskId: id });
      label = 'the app releases an API-taken task'; await assertSucceeds(updateDoc(doc(ronit, 'tasks', id), { assignee: null, updatedAt: n })); check(true, label);
      label = 'and another volunteer takes it in the app'; await assertSucceeds(updateDoc(doc(noa, 'tasks', id), { assignee: { uid: 'syn-noa', name: 'נועה' }, takenAt: n, updatedAt: n })); check(true, label);
      // an API-added item for a task, bought in the app
      const tid = await create(RONIT, { title: 'חוקים לקניות' });
      const sid = (await w(NOA, 'tasks.addShopping', { taskId: tid, title: 'צבע' })).json.data.itemId;
      label = 'the app buys an API-added item that carries taskId'; await assertSucceeds(updateDoc(doc(ronit, 'shopping', sid), { bought: true, boughtBy: { uid: 'syn-ronit', name: 'רונית' }, boughtAt: n, expireAt: n, updatedAt: n })); check(true, label);
      // an API-started trip, closed by the shopper in the app; a stranger may not
      const trip = (await w(NOA, 'shopping.startTrip', { list: 'online' })).json.data.tripId;
      label = 'someone else cannot close an API-started trip in the app'; await assertFails(updateDoc(doc(ronit, 'shopping_trips', trip), { closedAt: n })); check(true, label);
      label = 'the shopper closes it in the app'; await assertSucceeds(updateDoc(doc(noa, 'shopping_trips', trip), { closedAt: n, bought: [], missing: [] })); check(true, label);
      // an API-created template and place are valid app documents
      const tpl = (await w(MGR, 'templates.create', { title: 'חוקים', assignee: 'syn-ronit', placeId: 'pl-tpl', days: [0, 1, 2, 3, 4, 5, 6] })).json.data.templateId;
      label = 'a manager edits an API-created template in the app'; await assertSucceeds(updateDoc(doc(dani, 'task_templates', tpl), { active: false, updatedAt: n })); check(true, label);
      const pl = (await w(OWNER, 'places.add', { name: 'חוקים', lat: 31, lng: 34, accuracy: 3 })).json.data.placeId;
      label = 'staff cannot edit an API-added place in the app'; await assertFails(updateDoc(doc(noa, 'places', pl), { name: 'חוקים 2', lat: 31, lng: 34 })); check(true, label);
      // projects: API steps are valid for the app's take / update; staff sees nothing
      const pid = (await w(MGR, 'projects.create', { title: 'חוקים', steps: JSON.stringify([{ title: 'א' }, { title: 'ב' }]) })).json.data.projectId;
      const steps = await listOf(`projects/${pid}/steps`);
      label = 'staff cannot read an API-created project'; await assertFails(getDoc(doc(ronit, 'projects', pid))); check(true, label);
      label = 'a manager takes an API-created step in the app'; await assertSucceeds(updateDoc(doc(dani, `projects/${pid}/steps`, steps[0]._id), { assignee: { uid: 'syn-mgr', name: 'דני לוי' }, updatedAt: n })); check(true, label);
      await w(OWNER, 'projects.postUpdate', { projectId: pid, stepId: steps[1]._id, text: 'ראשון' });
      label = 'the app appends to a thread the API started'; await assertSucceeds(updateDoc(doc(dani, `projects/${pid}/steps`, steps[1]._id), { updates: arrayUnion({ by: { uid: 'syn-mgr', name: 'דני לוי' }, at: n, text: 'שני' }), updatedAt: n })); check(true, label);
      await w(MGR, 'projects.completeStep', { projectId: pid, stepId: steps[0]._id });
      label = 'a step done through the API can be reopened in the app'; await assertSucceeds(updateDoc(doc(dani, `projects/${pid}/steps`, steps[0]._id), { done: false, doneBy: null, doneAt: null, updatedAt: n })); check(true, label);
    } catch (e) { check(false, label, String(e?.message || e)); }
  }
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await stopWorker(worker).catch((e) => { failures++; console.error(e); });
  mock.close();
  await rulesEnv?.cleanup().catch(() => {});
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
