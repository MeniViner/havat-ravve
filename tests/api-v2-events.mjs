// Gate A for the v2 events, event-day and vendor operations of the API (api/src/v2/events.ts, eventday.ts, vendors.ts and the
// events/tickets/tabs parts of api/src/writes.ts, api/src/resources.ts and api/src/overview.ts): the real Worker in
// `wrangler dev` against the Firestore emulator, synthetic people only. Run:
//   npx firebase emulators:exec --only firestore,auth --project demo-havat-ravve "node tests/api-v2-events.mjs"
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
async function seed(path, data) {
  const r = await fetch(`${DOCS}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
  if (!r.ok) throw new Error('seed failed ' + (await r.text()));
}
const rawDoc = (path) => fetch(`${DOCS}/${path}`, { headers: admin }).then((x) => x.json());
const docOf = async (path) => { const j = await rawDoc(path); return j.fields ? Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, dec(v)])) : null; };
async function listCol(path) {
  const j = await fetch(`${DOCS}/${path}?pageSize=1000`, { headers: admin }).then((x) => x.json());
  return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
async function where(col, field, value) {
  const r = await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: admin, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } } } }) });
  return (await r.json()).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), ...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
const acts = async (refId) => (await where('activity', 'refId', refId)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
const sameKeys = (o, keys) => JSON.stringify(Object.keys(o || {}).sort()) === JSON.stringify([...keys].sort());
const ilWall = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(' ', 'T');
const STORED = (kind, owner) => `https://havat-ravve-api.meniviner.workers.dev/v1/files/${kind}/${owner}/${randomBytes(16).toString('hex')}.jpg`;

// ---------- synthetic credentials ----------
const newKey = () => 'hr_' + randomBytes(32).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const KEYS = { owner: newKey(), users: newKey() };
const CREDENTIALS = [
  { id: 'cred-ev-owner', sha256: sha(KEYS.owner), actors: ['actor-demo-owner'] },
  { id: 'cred-ev-users', sha256: sha(KEYS.users), actors: ['user:syn-mgr', 'user:syn-staff', 'user:syn-staff2'] },
];

// ---------- Worker under wrangler dev ----------
const workers = new Set();
const listening = (port) => new Promise((resolve) => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); });
function startWorker(port, vars) {
  const args = ['wrangler', 'dev', '--config', 'api/wrangler.toml', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(port + 1000), '--show-interactive-dev-session=false', '--log-level', 'log'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const p = spawn('npx', args, { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  p.port = port;
  if (process.env.API_TEST_DEBUG) { p.stdout.on('data', (d) => process.stderr.write(d)); p.stderr.on('data', (d) => process.stderr.write(d)); } else { p.stdout.resume(); p.stderr.resume(); }
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

const PORT = 18950;
const BASE = `http://127.0.0.1:${PORT}`;
if (await listening(PORT)) { console.error(`port ${PORT} is busy`); process.exit(1); }
const worker = startWorker(PORT, { FIRESTORE_PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: EMU, TEST_FAULTS: '1', API_CREDENTIALS: JSON.stringify(CREDENTIALS), EMAIL_ENABLED: 'false' });
async function api(method, path, { key, body, idem, headers = {} } = {}) {
  const r = await fetch(BASE + path, { method, headers: { ...(key ? { authorization: 'Bearer ' + key } : {}), ...(idem ? { 'idempotency-key': idem } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const U = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
const OWNER = { key: KEYS.owner }, MGR = U('syn-mgr'), STAFF = U('syn-staff');
const w = (who, op, body, idem = randomUUID()) => api('POST', '/v1/actions/' + op, { ...who, idem, body });
const r = (who, path) => api('GET', path, who);
const ok = (res, label) => check(res.status >= 200 && res.status < 300 && (res.json?.data?.verified ?? true) !== false, label, res.json?.error || res.json?.data);
const code = (res) => res.json?.error?.code;
const MGR_ACTOR = { uid: 'syn-mgr', name: 'מנהלת בדיקה' }, STAFF_ACTOR = { uid: 'syn-staff', name: 'רונית לוי' };

let rulesEnv;
try {
  await waitUp(BASE);
  await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const now = new Date().toISOString();
  const person = (uid, displayName, role, extra = {}) => seed('users/' + uid, { uid, email: `${uid}@synthetic.invalid`, displayName, phone: '0500000000', role, status: 'active', customerNumber: 1, acceptedTermsAt: now, notes: '', createdAt: now, updatedAt: now, ...extra });
  await person('synthetic-owner', 'בעלים סינתטי', 'owner');
  await person('syn-mgr', 'מנהלת בדיקה', 'manager', { phone: '0521234567' });
  await person('syn-staff', 'רונית לוי', 'staff');
  await person('syn-staff2', 'יואב כהן', 'staff');
  await person('syn-guest', 'דנה אורחת', 'guest');

  section('catalog');
  const mine = ['events.close', 'events.reopen', 'events.reorderProducts', 'events.copyProducts', 'events.addFileLink', 'events.removeFile', 'events.assignStation', 'events.updateStationPerson', 'events.removeFromStation',
    'tickets.addGuestOrder', 'tickets.deleteOrder', 'tabs.delete', 'tickets.stampReminder', 'tabs.stampReminder', 'payments.markConfirmation', 'gate.admit', 'gate.reject', 'gate.admitWalkIn', 'gate.reopenAndAdmit', 'gate.keepRejected',
    'tickets.payOnsite', 'events.saveCash', 'vendors.create', 'vendors.update', 'vendors.delete', 'vendors.addPerson', 'vendors.removePerson', 'vendors.removeAccess', 'events.inviteVendor', 'events.inviteVendors', 'events.confirmVendor',
    'events.remindVendor', 'events.removeVendor', 'events.setVendor', 'vendorRequests.close', 'vendorRequests.delete',
    'eventStaffing.list', 'eventFiles.list', 'eventScans.list', 'eventCounters.get', 'eventVendorRequests.list', 'eventVendorInfo.get', 'vendorInvites.list', 'emailOutbox.get'];
  {
    const ops = (await api('GET', '/v1/catalog')).json.data.operations;
    const names = ops.map((o) => o.name);
    check(mine.every((n) => names.includes(n)), 'every new operation and read is in the catalog', mine.filter((n) => !names.includes(n)));
    check(new Set(names).size === names.length, 'operation names are unique');
    const destructive = ['events.removeFile', 'tickets.deleteOrder', 'tabs.delete', 'vendors.delete', 'vendors.removePerson', 'vendors.removeAccess', 'events.removeVendor', 'vendorRequests.delete', 'events.close'];
    check(destructive.every((n) => (ops.find((o) => o.name === n)?.notes || []).some((x) => /confirm with the user first|Ask the user first/.test(x))), 'destructive operations tell the assistant to confirm with the user first', destructive.filter((n) => !(ops.find((o) => o.name === n)?.notes || []).some((x) => /confirm with the user first|Ask the user first/.test(x))));
    check(mine.filter((n) => !n.includes('.list') && !n.includes('.get')).every((n) => /[א-ת]/.test(ops.find((o) => o.name === n)?.he || '')), 'each operation has Hebrew wording');
  }

  section('events: ISO times, later-day end, questions, image');
  let eventId;
  {
    check((await w(STAFF, 'events.create', { title: 'x', start: '2026-12-10T10:00', end: '2026-12-10T11:00' })).status === 403, 'staff cannot create an event');
    check((await w(MGR, 'events.create', { title: 'x', start: '2026-12-10T10:00', end: '2026-12-10T11:00', image: 'data:image/jpeg;base64,AAAA' })).status === 400, 'an inline (data:) image is refused');
    check((await w(MGR, 'events.create', { title: 'x', start: '2026-12-10T10:00', end: '2026-12-10T11:00', image: 'https://example.com/a.jpg' })).status === 400, 'an outside image link is refused');
    const img = STORED('event', 'syn-mgr');
    const key = randomUUID();
    const body = { title: 'ערב חנוכה', start: '2026-12-10T20:00', end: '2026-12-11T01:30', price: 30, published: true, maxPerOrder: 6, questions: ['מאיפה שמעתם?', 'אלרגיות'], questionsRequired: [1], image: img };
    const c1 = await w(MGR, 'events.create', body, key);
    check(c1.status === 201 && c1.json.data.verified, 'events.create → 201, verified', c1.json);
    eventId = c1.json.data.eventId;
    const e = await docOf('events/' + eventId);
    check(e.start === '2026-12-10T18:00:00.000Z' && e.end === '2026-12-10T23:30:00.000Z', 'start/end stored as ISO UTC with Z (Israel 20:00 → 18:00Z); an end after midnight is fine', [e.start, e.end]);
    check(e.entry === true && e.stall === true && e.open === true && e.image === img && Array.isArray(e.files) && e.files.length === 0 && e.publishedAt === e.createdAt, 'entry, stall and open default to true; the stored image link is kept; files []', e);
    check(e.questions.length === 2 && e.questions[0].label === 'מאיפה שמעתם?' && e.questions[0].required === false && e.questions[1].required === true && /^q[0-9a-z]+$/.test(e.questions[0].id), 'questions as the form stores them ({id, label, required})', e.questions);
    const again = await w(MGR, 'events.create', body, key);
    check(again.json.data.replayed === true && again.json.data.eventId === eventId && (await where('events', 'title', 'ערב חנוכה')).length === 1, 'idempotent replay: same answer, one event');
    const cal = await docOf('calendar/event_' + eventId);
    check(cal?.date === '2026-12-10' && cal?.time === '20:00–01:30', 'calendar entry in farm time', cal);
    const qid = e.questions[1].id;
    ok(await w(MGR, 'events.update', { eventId, questions: ['אלרגיות', 'רכב?'], questionsRequired: [0] }), 'events.update questions');
    const e2 = await docOf('events/' + eventId);
    check(e2.questions[0].id === qid && e2.questions[0].required === true && e2.questions[1].label === 'רכב?' && e2.questions[1].id !== qid, 'a question that stays keeps its id', e2.questions);
    check((await w(MGR, 'events.update', { eventId, end: '2026-12-10T19:00' })).status === 400, 'an end before the start → 400');
    // an event written in farm time by the first API: the next edit stores ISO
    await seed('events/syn-old', { title: 'אירוע ישן', description: '', image: '', location: '', start: '2026-12-20T10:00', end: '2026-12-20T12:00', price: 0, maxPerOrder: 4, capacity: 0, open: true, published: true, questions: [], createdBy: MGR_ACTOR, createdAt: now, updatedAt: now });
    ok(await w(MGR, 'events.update', { eventId: 'syn-old', description: 'נערך' }), 'events.update on a farm-time event');
    const old = await docOf('events/syn-old');
    check(old.start === '2026-12-20T08:00:00.000Z' && old.end === '2026-12-20T10:00:00.000Z', 'its times are now ISO UTC', [old.start, old.end]);
    const list = await r(STAFF, '/v1/events?startFrom=2026-12-10&startTo=2026-12-10');
    check(list.status === 200 && list.json.data.items.length === 1 && list.json.data.items[0].id === eventId && list.json.data.items[0].startLocal === '2026-12-10T20:00' && list.json.data.items[0].endLocal === '2026-12-11T01:30', 'events.list by Israeli date over ISO starts, with startLocal/endLocal', list.json.data?.items);
    check((await r(STAFF, '/v1/events?startTo=2026-12-09')).json.data.items.every((x) => x.id !== eventId), 'startTo the day before leaves it out');
    const ov = await r(MGR, '/v1/overview?date=2026-12-10');
    const up = ov.json.data.upcomingEvents.find((x) => x.id === eventId);
    check(up && up.startLocal === '2026-12-10T20:00' && up.closed === null, 'farm.overview: the event of that day, with local times', ov.json.data.upcomingEvents);
  }

  section('stall products: patch keeps the unit, reorder, copy');
  let coffee, tea, cake;
  {
    coffee = (await w(MGR, 'events.saveProduct', { eventId, name: 'קפה', price: 12, unit: 'כוס' })).json.data.productId;
    tea = (await w(MGR, 'events.saveProduct', { eventId, name: 'תה', price: 8 })).json.data.productId;
    cake = (await w(MGR, 'events.saveProduct', { eventId, name: 'עוגה', price: 15.5 })).json.data.productId;
    const p0 = await docOf(`events/${eventId}/products/${coffee}`);
    check(sameKeys(p0, ['name', 'price', 'active', 'sort', 'unit']) && p0.sort === 1 && p0.active === true && p0.unit === 'כוס', 'a new product: sort after the last, active, with its unit', p0);
    check((await docOf(`events/${eventId}/products/${tea}`)).sort === 2 && !('unit' in (await docOf(`events/${eventId}/products/${tea}`))), 'no unit sent → no unit field');
    ok(await w(MGR, 'events.saveProduct', { eventId, productId: coffee, price: 14 }), 'saveProduct with only a price');
    const p1 = await docOf(`events/${eventId}/products/${coffee}`);
    check(p1.price === 14 && p1.unit === 'כוס' && p1.name === 'קפה' && p1.active === true && p1.sort === 1, 'WRONG fix: a price change keeps the unit, name, active and sort', p1);
    check((await acts(eventId)).some((a) => a.text === 'מוצר עודכן: קפה · 14 ₪'), 'activity "מוצר עודכן: קפה · 14 ₪"');
    const nActs = (await acts(eventId)).length;
    ok(await w(MGR, 'events.saveProduct', { eventId, productId: tea, active: false }), 'saveProduct active=false');
    check((await acts(eventId)).length === nActs + 1, 'the availability toggle writes activity');
    ok(await w(MGR, 'events.saveProduct', { eventId, productId: coffee, unit: '' }), 'unit "" removes it');
    check(!('unit' in (await docOf(`events/${eventId}/products/${coffee}`))), 'the unit field is gone');
    check((await w(STAFF, 'events.saveProduct', { eventId, name: 'x', price: 1 })).status === 403, 'staff cannot change products');
    const ro = await w(MGR, 'events.reorderProducts', { eventId, productIds: [cake, coffee] });
    check(ro.status === 200 && ro.json.data.order.join() === [cake, coffee, tea].join() && ro.json.data.changed === 3, 'reorder: the listed first, the rest after', ro.json.data);
    check((await docOf(`events/${eventId}/products/${cake}`)).sort === 1 && (await docOf(`events/${eventId}/products/${tea}`)).sort === 3, 'sort 1..n stored');
    check((await w(MGR, 'events.reorderProducts', { eventId, productIds: ['nope'] })).status === 404, 'an unknown product → 404');
    await seed('events/syn-src', { title: 'אירוע קודם', description: '', image: '', location: '', start: '2026-11-01T08:00:00.000Z', end: '2026-11-01T12:00:00.000Z', price: 0, maxPerOrder: 4, capacity: 0, open: false, published: true, questions: [], createdBy: MGR_ACTOR, createdAt: now, updatedAt: now });
    await seed('events/syn-src/products/p1', { name: 'לימונדה', price: 10, active: true, sort: 1, unit: 'כוס' });
    await seed('events/syn-src/products/p2', { name: 'פופקורן', price: 5, active: false, sort: 2 });
    const cp = await w(MGR, 'events.copyProducts', { eventId, fromEventId: 'syn-src' });
    check(cp.status === 201 && cp.json.data.productIds.length === 2, 'copyProducts → 201, two new', cp.json);
    const lem = await docOf(`events/${eventId}/products/${cp.json.data.productIds[0]}`);
    check(sameKeys(lem, ['name', 'price', 'active', 'sort']) && lem.name === 'לימונדה' && lem.sort === 4 && (await docOf(`events/${eventId}/products/${cp.json.data.productIds[1]}`)).active === false, 'copied as the app copies (name, price, active; after the existing; no unit)', lem);
    check((await acts(eventId)).some((a) => a.text === 'הועתקו 2 מוצרים מאירוע קודם'), 'activity "הועתקו 2 מוצרים מ…"');
    check((await w(MGR, 'events.copyProducts', { eventId, fromEventId: eventId })).status === 400, 'copying from itself → 400');
  }

  section('files (V3)');
  {
    check((await w(MGR, 'events.addFileLink', { eventId, name: 'היתר', url: 'http://x.example/a.pdf' })).status === 400, 'a non-https link → 400');
    check((await w(STAFF, 'events.addFileLink', { eventId, name: 'היתר', url: 'https://x.example/a.pdf' })).status === 403, 'staff cannot add files');
    const f = await w(MGR, 'events.addFileLink', { eventId, name: 'היתר עירייה', url: 'https://docs.example/permit.pdf' });
    check(f.status === 201, 'events.addFileLink → 201');
    const fd = await docOf(`events/${eventId}/files/${f.json.data.fileId}`);
    check(sameKeys(fd, ['name', 'url', 'kind', 'by', 'at']) && fd.kind === 'doc' && fd.by.uid === 'syn-mgr', 'stored as {name, url, kind doc, by, at}', fd);
    await seed(`events/${eventId}/files/inline`, { name: 'מפה', url: 'data:image/jpeg;base64,AAAA', kind: 'image', by: MGR_ACTOR, at: now, mime: 'image/jpeg', size: 4 });
    const fl = await r(MGR, `/v1/events/${eventId}/files`);
    const inl = fl.json.data.items.find((x) => x.id === 'inline');
    check(fl.status === 200 && fl.json.data.items.length === 2 && inl.url === null && inl.hasData === true, 'eventFiles.list: an inline file comes as a flag, not base64', fl.json.data?.items);
    check((await r(STAFF, `/v1/events/${eventId}/files`)).status === 403 && (await r(STAFF, `/v1/events/${eventId}/files/inline`)).status === 404, 'staff cannot read event files');
    await seed('events/syn-legacy-files', { title: 'עם קבצים ישנים', description: '', image: '', location: '', start: '2026-12-21T08:00:00.000Z', end: '2026-12-21T10:00:00.000Z', price: 0, maxPerOrder: 4, capacity: 0, open: true, published: false, questions: [], files: [{ name: 'א', url: 'https://a.example' }, { name: 'ב', url: 'https://b.example' }], createdBy: MGR_ACTOR, createdAt: now, updatedAt: now });
    const rl = await w(MGR, 'events.removeFile', { eventId: 'syn-legacy-files', legacyIndex: 0 });
    check(rl.status === 200 && (await docOf('events/syn-legacy-files')).files.map((x) => x.name).join() === 'ב', 'removeFile legacyIndex takes the link out of the event', rl.json);
    check((await w(MGR, 'events.removeFile', { eventId: 'syn-legacy-files', legacyIndex: 5 })).status === 400, 'no legacy file at that index → 400');
    ok(await w(MGR, 'events.removeFile', { eventId, fileId: f.json.data.fileId }), 'removeFile fileId');
    check(!(await docOf(`events/${eventId}/files/${f.json.data.fileId}`)) && (await acts(eventId)).some((a) => a.text === 'ערב חנוכה: נמחק קובץ "היתר עירייה"'), 'the file is gone, with its activity line');
  }

  section('staffing (V4)');
  {
    check((await w(STAFF, 'events.assignStation', { eventId, station: 'gate', uid: 'syn-staff' })).status === 403, 'staff cannot assign stations');
    check((await w(MGR, 'events.assignStation', { eventId, station: 'gate', uid: 'syn-guest' })).status === 400, 'a guest cannot be assigned');
    const key = randomUUID();
    const a = await w(MGR, 'events.assignStation', { eventId, station: 'gate', uid: 'syn-staff', hours: '19:00-22:00' }, key);
    ok(a, 'events.assignStation');
    const st = await docOf(`events/${eventId}/staffing/gate`);
    check(sameKeys(st, ['station', 'people', 'needed']) && st.station === 'שער' && st.needed === 1 && st.people.length === 1 && sameKeys(st.people[0], ['uid', 'name', 'hours']) && st.people[0].hours === '19:00-22:00' && st.people[0].name === 'רונית לוי', 'stored as {station, people[{uid,name,hours}], needed}', st);
    check((await w(MGR, 'events.assignStation', { eventId, station: 'gate', uid: 'syn-staff', hours: '19:00-22:00' }, key)).json.data.replayed === true && (await docOf(`events/${eventId}/staffing/gate`)).people.length === 1, 'replay: same answer, nobody added twice');
    const ev = (await acts(eventId)).filter((x) => x.subjectUid === 'syn-staff');
    check(ev.some((x) => x.text === 'ערב חנוכה: רונית לוי שובץ/ה לשער · 19:00–22:00' && x.action === 'edited' && x.kind === 'event'), 'activity with subjectUid, as the app writes it', ev.map((x) => x.text));
    const notes = await listCol('users/syn-staff/notifications');
    const n = notes.find((x) => x.refId === eventId);
    check(n && n.kind === 'event' && n.title === 'ערב חנוכה: שער' && n.sub === 'חמישי 10.12 · 19:00–22:00' && n.link === `/farm/events/${eventId}`, 'the person gets the notification', n);
    check((await listCol('push_jobs')).some((j) => j.refId === eventId && j.to.includes('syn-staff') && j.kind === 'event'), 'and a push job');
    check((await w(MGR, 'events.assignStation', { eventId, station: 'gate', uid: 'syn-staff' })).status === 400, 'already on the station → 400');
    check((await w(MGR, 'events.assignStation', { eventId, station: 'kitchen', uid: 'syn-staff2' })).status === 400, 'a new station needs its name');
    ok(await w(MGR, 'events.assignStation', { eventId, station: 'kitchen', stationName: 'מטבח', needed: 3, uid: 'syn-staff2' }), 'a new station with a name');
    check((await docOf(`events/${eventId}/staffing/kitchen`)).needed === 3, 'needed stored');
    ok(await w(MGR, 'events.updateStationPerson', { eventId, station: 'gate', uid: 'syn-staff', hours: '20:00-23:00' }), 'updateStationPerson');
    check((await docOf(`events/${eventId}/staffing/gate`)).people[0].hours === '20:00-23:00' && (await acts(eventId)).some((x) => x.text === 'ערב חנוכה: שעות בשער עודכנו'), 'hours changed, activity "שעות בשער עודכנו"');
    check((await w(MGR, 'events.updateStationPerson', { eventId, station: 'gate', uid: 'syn-staff', hours: 'ערב' })).status === 400, 'hours must look like 16:00-20:00');
    const sl = await r(STAFF, `/v1/events/${eventId}/staffing`);
    check(sl.status === 200 && sl.json.data.items.length === 2, 'staff read eventStaffing.list');
    ok(await w(MGR, 'events.removeFromStation', { eventId, station: 'kitchen', uid: 'syn-staff2' }), 'removeFromStation');
    check((await docOf(`events/${eventId}/staffing/kitchen`)).people.length === 0 && (await acts(eventId)).some((x) => x.text === 'ערב חנוכה: יואב כהן הוסר/ה ממטבח'), 'removed, with its activity line');
    const self = { eventId, station: 'kitchen', uid: 'syn-mgr' };
    ok(await w(MGR, 'events.assignStation', self), 'a manager assigns themself to a station');
    check((await w(MGR, 'events.assignStation', self)).status === 400, 'a second assignment to the same station is refused');
    const selfNotes = (await listCol('users/syn-mgr/notifications')).filter((n) => n.refId === eventId && n.kind === 'event');
    const selfJobs = (await listCol('push_jobs')).filter((j) => j.refId === eventId && j.kind === 'event' && j.to.includes('syn-mgr'));
    check(selfNotes.length === 1 && selfNotes[0].readAt === null && selfJobs.length === 1 && selfJobs[0].to.join() === 'syn-mgr', 'one unread station assignment copy and one job to self');
    await w(MGR, 'events.removeFromStation', self);
    check((await docOf(`events/${eventId}/staffing/kitchen`)).people.length === 0, 'self assignment fixture removed');
  }

  section('guests and payments (M5, N12, V5)');
  const tix = (oid, n, extra = {}) => Promise.all(Array.from({ length: n }, (_, i) => seed(`tickets/${oid}-${i + 1}`, { eventId, eventTitle: 'ערב חנוכה', orderId: oid, index: i + 1, total: n, ownerUid: 'syn-guest', ownerName: 'דנה אורחת', ownerPhone: '0501112222', holderName: '', secret: 'abcdef0123456789abcdef01', price: 30, paymentStatus: 'pending', status: 'valid', scans: [], entries: 0, answers: {}, createdAt: now, updatedAt: now, ...extra })));
  const inbox = (id, refId) => seed('notifications/' + id, { type: 'payment', title: 'תשלום', text: 'x', link: '/manage', refId, handled: false, handledBy: null, handledAt: null, createdAt: now });
  {
    check((await w(STAFF, 'tickets.addGuestOrder', { eventId, name: 'משפחת לוי', count: 2 })).status === 403, 'staff cannot add a registration');
    check((await w(MGR, 'tickets.addGuestOrder', { eventId, name: 'רבים', count: 7 })).status === 400, 'more than maxPerOrder → 400');
    const g = await w(MGR, 'tickets.addGuestOrder', { eventId, name: 'משפחת לוי', phone: '0503334444', count: 2, paid: true });
    check(g.status === 201 && g.json.data.ticketIds.length === 2, 'tickets.addGuestOrder → 201', g.json);
    const raw = await rawDoc('tickets/' + g.json.data.ticketIds[0]);
    const t = await docOf('tickets/' + g.json.data.ticketIds[0]);
    check(t.ownerUid === 'syn-mgr' && t.ownerName === 'משפחת לוי' && t.ownerPhone === '0503334444' && t.paymentStatus === 'paid' && 'timestampValue' in raw.fields.paidAt && t.total === 2 && t.price === 30 && /^[0-9a-f]{24}$/.test(t.secret) && t.entries === 0, 'tickets as the app stores them: the manager owns them, paid with a server paidAt', t);
    const ga = await acts(g.json.data.orderId);
    const gText = (action) => ga.find((x) => x.action === action)?.text;
    check(ga.length === 2 && gText('ordered') === 'משפחת לוי · 2 כרטיסים · ערב חנוכה · נוסף/ה על ידי מנהלת בדיקה' && gText('paid') === 'משפחת לוי · ערב חנוכה · 60 ₪ · 2 כרטיסים', 'activity "ordered" and "paid"', ga.map((x) => x.text));
    await tix('syn-del', 2); await inbox('n-del', 'syn-del');
    check((await w(STAFF, 'tickets.deleteOrder', { orderId: 'syn-del' })).status === 403, 'staff cannot delete an order');
    ok(await w(MGR, 'tickets.deleteOrder', { orderId: 'syn-del' }), 'tickets.deleteOrder');
    check(!(await docOf('tickets/syn-del-1')) && !(await docOf('tickets/syn-del-2')) && !(await docOf('notifications/n-del')), 'its tickets and its inbox item are gone');
    check((await acts('syn-del'))[0]?.text === 'דנה אורחת · 2 כרטיסים · ערב חנוכה' && (await acts('syn-del'))[0]?.subjectUid === 'syn-guest', 'activity "deleted"');
    await tix('syn-pay', 1); await inbox('n-pay', 'syn-pay');
    ok(await w(MGR, 'tickets.setOrderPayment', { orderId: 'syn-pay', paymentStatus: 'paid' }), 'tickets.setOrderPayment paid');
    check((await docOf('notifications/n-pay')).handled === true && (await docOf('notifications/n-pay')).handledBy.uid === 'syn-mgr', 'it closes the order\'s inbox item');
    await tix('syn-rem', 2, { paymentStatus: 'claimed' });
    ok(await w(MGR, 'tickets.stampReminder', { orderId: 'syn-rem' }), 'tickets.stampReminder');
    check((await docOf('tickets/syn-rem-1')).reminderSentAt && (await docOf('tickets/syn-rem-2')).reminderSentAt, 'reminderSentAt on the owing tickets');
    check((await w(MGR, 'tickets.stampReminder', { orderId: 'syn-pay' })).status === 400, 'a paid order has nothing to remind');
    // payment confirmations
    check((await w(MGR, 'payments.markConfirmation', { collection: 'tickets', id: 'syn-rem' })).status === 400, 'an unpaid order gets no confirmation');
    check((await w(STAFF, 'payments.markConfirmation', { collection: 'tickets', id: 'syn-pay' })).status === 403, 'staff cannot mark confirmations');
    const mc = await w(MGR, 'payments.markConfirmation', { collection: 'tickets', id: 'syn-pay' });
    const tp = await docOf('tickets/syn-pay-1');
    check(mc.status === 200 && mc.json.data.changed === true && sameKeys(tp.paymentConfirmation, ['by', 'at']) && tp.paymentConfirmation.by.uid === 'syn-mgr' && tp.updatedAt === tp.paymentConfirmation.at, 'paymentConfirmation {by, at}, updatedAt = at', tp);
    check((await w(MGR, 'payments.markConfirmation', { collection: 'tickets', id: 'syn-pay' })).json.data.changed === false, 'marked once only');
    await seed('donations/syn-don', { uid: 'syn-guest', name: 'דנה', phone: '', amount: 180, label: '', note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'paid', createdAt: now, updatedAt: now });
    ok(await w(MGR, 'payments.markConfirmation', { collection: 'donations', id: 'syn-don' }), 'markConfirmation on a paid donation');
    await seed('email_outbox/order_syn-pay', { kind: 'order', col: 'tickets', refId: 'syn-pay', uid: 'syn-guest', to: 'secret@synthetic.invalid', status: 'sent', attempts: 1, createdAt: now, updatedAt: now });
    const eo = await r(MGR, '/v1/email-outbox/order_syn-pay');
    check(eo.status === 200 && eo.json.data.record.status === 'sent' && !('to' in eo.json.data.record), 'emailOutbox.get: the state of the automatic email, without the address', eo.json);
    check((await r(STAFF, '/v1/email-outbox/order_syn-pay')).status === 403 && (await r(STAFF, '/v1/email-outbox')).status === 403, 'staff cannot read the email outbox');
    check((await r(MGR, '/v1/email-outbox/_state')).status === 404, 'the outbox\'s own state document is not a record');
  }

  section('stall tabs: several products, delete, settle');
  let tabId;
  {
    tabId = (await w(STAFF, 'tabs.open', { eventId, guestName: 'אורח בדוכן' })).json.data.tabId;
    const add = await w(STAFF, 'tabs.addItem', { tabId, items: [coffee, `${cake}:2`] });
    check(add.status === 200 && add.json.data.record.total === 45 && add.json.data.record.items.length === 2 && add.json.data.record.items[1].qty === 2, 'tabs.addItem with several products: one write, total 14 + 2×15.5', add.json);
    const it = (await docOf('tabs/' + tabId)).items;
    check(it[0].at < it[1].at, 'each line has its own moment');
    check((await acts(tabId)).some((a) => a.text === 'אורח בדוכן: קפה, עוגה ×2 · 45 ₪'), 'one activity line for the cart', (await acts(tabId)).map((a) => a.text));
    check((await w(STAFF, 'tabs.addItem', { tabId, productId: coffee, items: [coffee] })).status === 400, 'productId and items together → 400');
    check((await w(STAFF, 'tabs.addItem', { tabId, items: [tea] })).status === 400, 'an inactive product in a cart → 400');
    ok(await w(MGR, 'tabs.stampReminder', { tabId }), 'tabs.stampReminder');
    await inbox('n-tab', tabId);
    ok(await w(MGR, 'tabs.setStatus', { tabId, status: 'paid' }), 'tabs.setStatus paid');
    check((await docOf('notifications/n-tab')).handled === true, 'it closes the tab\'s inbox item');
    ok(await w(MGR, 'payments.markConfirmation', { collection: 'tabs', id: tabId }), 'markConfirmation on a paid tab');
    const t2 = (await w(STAFF, 'tabs.open', { eventId, guestName: 'למחיקה' })).json.data.tabId;
    await inbox('n-tab2', t2);
    check((await w(STAFF, 'tabs.delete', { tabId: t2 })).status === 403, 'staff cannot delete a tab');
    ok(await w(MGR, 'tabs.delete', { tabId: t2 }), 'tabs.delete');
    check(!(await docOf('tabs/' + t2)) && !(await docOf('notifications/n-tab2')) && (await acts(t2)).some((a) => a.action === 'deleted' && a.text === 'למחיקה · 0 ₪ · ערב חנוכה'), 'the tab and its inbox item are gone, with "deleted"');
  }

  section('the gate (E2-E6, Y1-Y3) and paying on site');
  let laterScan, rejected, walkIn;
  {
    await tix('syn-gate', 2);
    check((await w(STAFF, 'gate.admit', { eventId, ticketId: 'syn-gate-1' })).status === 400, 'an unpaid ticket needs pay gate or later');
    const key = randomUUID();
    const a = await w(STAFF, 'gate.admit', { eventId, ticketId: 'syn-gate-1', pay: 'later', entries: 0 }, key);
    check(a.status === 200 && a.json.data.entries === 1 && a.json.data.result === 'payLater' && a.json.data.amount === 60, 'gate.admit pay later: entry 1, the whole order as a debt', a.json);
    laterScan = a.json.data.scanId;
    const t1 = await docOf('tickets/syn-gate-1'), t2 = await docOf('tickets/syn-gate-2');
    check(t1.entries === 1 && t1.scans.length === 1 && t1.scans[0].by.uid === 'syn-staff' && t1.payLater === true && t1.payLaterBy.uid === 'syn-staff' && t1.paymentStatus === 'pending' && t2.payLater === true && t2.entries === 0, 'tickets: the scanned one entered, both owing as payLater', [t1, t2]);
    const s = await docOf(`events/${eventId}/scans/${laterScan}`);
    check(laterScan === 'syn-gate-1-1' && s.result === 'payLater' && s.meta === '2 כרטיסים · 60 ₪' && s.count === 2 && s.amount === 60 && s.method === '' && s.reopenedBy === null && s.name === 'דנה אורחת', 'scan "<ticket>-<n>" as admit() writes it', s);
    const live = await docOf(`events/${eventId}/counters/live`);
    check(live.entered === 1 && live.scans === 1 && live.payLater === 2 && live.payLaterAmount === 60 && live.rejected === 0 && live.eventId === eventId && Object.values(live.perHalfHour)[0] === 1 && Object.values(live.per10m)[0] === 1, 'live counters created with the time buckets', live);
    check((await acts('syn-gate-1'))[0]?.text === 'דנה אורחת · כניסה 1 · ישלמו אחר כך 60 ₪', 'activity "scanned"');
    const rep = await w(STAFF, 'gate.admit', { eventId, ticketId: 'syn-gate-1', pay: 'later', entries: 0 }, key);
    check(rep.json.data.replayed === true && (await docOf('tickets/syn-gate-1')).entries === 1, 'replay with the same key: the entry is not counted twice');
    const stale = await w(STAFF, 'gate.admit', { eventId, ticketId: 'syn-gate-1', entries: 0 });
    check(stale.status === 409 && code(stale) === 'STALE_WRITE', 'another gate already counted it → 409', stale.json);
    const back = await w(STAFF, 'gate.admit', { eventId, ticketId: 'syn-gate-1', entries: 1 });
    check(back.status === 200 && back.json.data.entries === 2 && back.json.data.result === 'ok' && (await docOf(`events/${eventId}/counters/live`)).entered === 1, 'out and back in: entry 2, still one person inside');
    await tix('syn-cancel', 1, { status: 'cancelled', paymentStatus: 'cancelled', cancelledAt: '2026-12-01T10:00:00.000Z' });
    check((await w(STAFF, 'gate.admit', { eventId, ticketId: 'syn-cancel-1', pay: 'gate' })).status === 400, 'a cancelled ticket is not let in');
    const rj = await w(STAFF, 'gate.reject', { eventId, ticketId: 'syn-cancel-1', reason: 'ההזמנה בוטלה' });
    check(rj.status === 201, 'gate.reject → 201');
    rejected = rj.json.data.scanId;
    const rs = await docOf(`events/${eventId}/scans/${rejected}`);
    check(rs.result === 'rejected' && rs.meta === 'ההזמנה בוטלה ב־1.12' && rs.keptAt === null && rs.orderId === 'syn-cancel', 'the rejected scan with the app\'s meta', rs);
    check((await docOf(`events/${eventId}/counters/live`)).rejected === 1, 'rejected counted');
    check((await w(STAFF, 'gate.reopenAndAdmit', { eventId, scanId: rejected })).status === 403, 'staff cannot reopen a cancelled order');
    ok(await w(MGR, 'gate.reopenAndAdmit', { eventId, scanId: rejected }), 'gate.reopenAndAdmit');
    const rt = await docOf('tickets/syn-cancel-1');
    check(rt.status === 'valid' && rt.paymentStatus === 'pending' && rt.payLater === true && rt.entries === 1 && (await docOf(`events/${eventId}/scans/${rejected}`)).reopenedBy.uid === 'syn-mgr' && (await docOf(`events/${eventId}/counters/live`)).rejected === 0, 'the order is valid again, a debt, entered; rejected back to 0', rt);
    check((await w(MGR, 'gate.reopenAndAdmit', { eventId, scanId: rejected })).status === 409, 'reopening twice → 409');
    const rj2 = (await w(STAFF, 'gate.reject', { eventId, name: 'לא מזוהה', reason: 'לא נמצא' })).json.data.scanId;
    check((await w(STAFF, 'gate.keepRejected', { eventId, scanId: rj2 })).status === 403, 'staff cannot handle a rejected entry');
    ok(await w(MGR, 'gate.keepRejected', { eventId, scanId: rj2 }), 'gate.keepRejected');
    check((await docOf(`events/${eventId}/scans/${rj2}`)).keptBy.uid === 'syn-mgr' && (await w(MGR, 'gate.reopenAndAdmit', { eventId, scanId: rj2 })).status === 409, 'kept: it can no longer be reopened');
    const wi = await w(STAFF, 'gate.admitWalkIn', { eventId, name: 'אורח מזדמן', phone: '0509990000', count: 2, pay: 'gate' });
    check(wi.status === 201 && wi.json.data.result === 'paidAtGate' && wi.json.data.amount === 60, 'gate.admitWalkIn → 201', wi.json);
    walkIn = wi.json.data.ticketIds[0];
    const wt = await docOf('tickets/' + walkIn);
    check(wt.walkIn === true && wt.ownerUid === '' && wt.paymentStatus === 'paid_onsite' && !('paidAt' in wt) && wt.entries === 1 && wt.createdBy.uid === 'syn-staff' && !('payLater' in wt), 'walk-in tickets as admitWalkIn() writes them (no paidAt, as the rules require)', wt);
    check((await docOf(`events/${eventId}/scans/${walkIn}-1`)).meta === '2 כרטיסים · אורח בלי כרטיס · 60 ₪' && (await docOf(`events/${eventId}/counters/live`)).paidAtGate === 2, 'its scan and the counters');
    await tix('syn-onsite', 2, { paymentStatus: 'claimed' });
    const po = await w(STAFF, 'tickets.payOnsite', { orderId: 'syn-onsite' });
    const raw = await rawDoc('tickets/syn-onsite-1');
    check(po.status === 200 && po.json.data.paid === 2 && dec(raw.fields.paymentStatus) === 'paid_onsite' && 'timestampValue' in raw.fields.paidAt, 'tickets.payOnsite (staff): paid on site, server paidAt', po.json);
    check((await acts('syn-onsite'))[0]?.text === 'דנה אורחת · ערב חנוכה · 60 ₪ · שולם במקום', 'activity "שולם במקום"');
    check((await w(STAFF, 'tickets.payOnsite', { orderId: 'syn-onsite' })).json.data.changed === false, 'nothing left to pay: changed false');
    check((await w(STAFF, 'events.saveCash', { eventId, which: 'gate', amount: 120 })).status === 403, 'staff cannot record the cash count');
    ok(await w(MGR, 'events.saveCash', { eventId, which: 'gate', amount: 120 }), 'events.saveCash gate');
    ok(await w(MGR, 'events.saveCash', { eventId, which: 'stall', amount: 45.5, by: 'רונית' }), 'events.saveCash stall');
    const cash = await docOf(`events/${eventId}/counters/cash`);
    check(sameKeys(cash, ['gate', 'stall']) && cash.gate.amount === 120 && cash.gate.by === 'מנהלת בדיקה' && cash.stall.by === 'רונית' && cash.stall.byActor.uid === 'syn-mgr', 'both counts kept side by side (merge)', cash);
    check((await r(MGR, `/v1/events/${eventId}/counters/cash`)).json.data.record.gate.amount === 120 && (await r(STAFF, `/v1/events/${eventId}/counters/cash`)).status === 404 && (await r(STAFF, `/v1/events/${eventId}/counters/live`)).json.data.record.entered === 4, 'eventCounters.get: cash for managers only, live for the crew');
    const sc = await r(STAFF, `/v1/events/${eventId}/scans?result=rejected`);
    check(sc.status === 200 && sc.json.data.items.length === 2 && sc.json.data.items.every((x) => x.result === 'rejected'), 'eventScans.list by result');
  }

  section('closing the event day (Y5)');
  {
    check((await w(STAFF, 'events.close', { eventId })).status === 403, 'staff cannot close the event');
    const c = await w(MGR, 'events.close', { eventId });
    ok(c, 'events.close');
    const e = await docOf('events/' + eventId);
    const tomorrow = ilWall(new Date(Date.parse(e.closed.at) + 86400_000).toISOString()).slice(0, 10);
    check(sameKeys(e.closed, ['at', 'by', 'reopenUntil']) && e.closed.by.uid === 'syn-mgr' && ilWall(e.closed.reopenUntil) === tomorrow + 'T12:00' && e.updatedAt === e.closed.at, 'closed {at, by, reopenUntil = noon tomorrow in Israel}', e.closed);
    check((await acts(eventId)).some((a) => a.action === 'closed' && a.text === 'ערב חנוכה נסגר'), 'activity "closed"');
    check((await w(MGR, 'events.close', { eventId })).json.data.changed === false, 'closing again: changed false');
    await tix('syn-late', 1);
    check((await w(STAFF, 'gate.admit', { eventId, ticketId: 'syn-late-1', pay: 'gate' })).status === 403, 'closed: staff cannot scan');
    check((await w(STAFF, 'tickets.payOnsite', { orderId: 'syn-late' })).status === 403, 'closed: staff cannot take payment on site');
    check((await w(STAFF, 'tabs.open', { eventId, guestName: 'מאוחר' })).status === 403 && (await w(STAFF, 'tabs.addItem', { tabId, productId: coffee })).status === 403, 'closed: staff cannot sell at the stall');
    check((await w(STAFF, 'vendorRequests.close', { eventId, requestId: 'none' })).status === 404, '(requests are checked below)');
    check((await w(MGR, 'gate.admitWalkIn', { eventId, name: 'x', count: 1 })).status === 403, 'closed: no walk-in tickets, for managers too (the rules)');
    ok(await w(MGR, 'gate.admit', { eventId, ticketId: 'syn-late-1', pay: 'gate' }), 'closed: a manager still lets someone in');
    ok(await w(MGR, 'events.reopen', { eventId }), 'events.reopen');
    const e2 = await docOf('events/' + eventId);
    check(e2.closed === null && e2.reopenedBy.uid === 'syn-mgr' && e2.reopenedAt && (await acts(eventId)).some((a) => a.action === 'reopened'), 'reopened: closed null, reopenedAt/By, activity');
    check((await w(MGR, 'events.reopen', { eventId })).json.data.changed === false, 'reopening an open event: changed false');
  }

  section('vendors: the pool, private notes, v2 fields kept');
  let vid, vid2;
  {
    check((await w(MGR, 'vendors.create', { name: 'x', photo: 'data:image/jpeg;base64,AAAA' })).status === 400, 'an inline photo is refused');
    check((await w(STAFF, 'vendors.create', { name: 'x' })).status === 403, 'staff cannot add vendors');
    const v = await w(MGR, 'vendors.create', { name: 'גבינות הגליל', contact: 'מיכל כהן', phone: '0501111111', sells: 'גבינות', needs: ['table', 'power'], notes: 'משלמת במזומן בלבד' });
    check(v.status === 201, 'vendors.create → 201', v.json);
    vid = v.json.data.vendorId;
    const vd = await docOf('vendors/' + vid);
    check(vd.notes === '' && vd.sells === 'גבינות' && vd.product === 'גבינות' && vd.external === true && vd.fem === true && vd.contact === 'מיכל כהן' && vd.needs.join() === 'table,power' && vd.people.length === 0 && vd.events.length === 0 && vd.inviteNext === false && vd.note === '', 'stored as savePoolVendor() writes it (fem guessed from the contact)', vd);
    check((await docOf(`vendors/${vid}/private/main`)).notes === 'משלמת במזומן בלבד', 'WRONG fix: the team\'s notes are in vendors/{id}/private/main, not on the stall');
    const g1 = await r(MGR, '/v1/vendors/' + vid), g2 = await r(STAFF, '/v1/vendors/' + vid);
    check(g1.json.data.record.privateNotes === 'משלמת במזומן בלבד' && !('privateNotes' in g2.json.data.record) && g2.json.data.record.notes === '', 'vendors.get: privateNotes for managers only', [g1.json.data.record, g2.json.data.record]);
    check((await r(MGR, '/v1/vendors')).json.data.items.find((x) => x.id === vid)?.privateNotes === 'משלמת במזומן בלבד', 'vendors.list too');
    ok(await w(MGR, 'events.inviteVendor', { eventId, vendorId: vid }), 'events.inviteVendor');
    ok(await w(MGR, 'vendors.update', { vendorId: vid, phone: '0502222222' }), 'vendors.update one field');
    const vu = await docOf('vendors/' + vid);
    check(vu.phone === '0502222222' && vu.people.length === 1 && vu.events.includes(eventId) && vu.needs.join() === 'table,power' && vu.contact === 'מיכל כהן' && vu.notes === '', 'WRONG fix: an update keeps the v2 fields (people, events, needs, contact)', vu);
    check((await docOf(`vendors/${vid}/private/main`)).notes === 'משלמת במזומן בלבד', 'and keeps the private notes when none are sent');
    ok(await w(MGR, 'vendors.update', { vendorId: vid, notes: 'עכשיו גם ביט' }), 'vendors.update notes');
    check((await docOf(`vendors/${vid}/private/main`)).notes === 'עכשיו גם ביט' && (await docOf('vendors/' + vid)).notes === '', 'notes go to the private document only');
    await seed('vendors/syn-legacy-v', { name: 'דבש ישן', phone: '0503333333', product: 'דבש', external: true, notes: 'הערה ישנה', createdAt: now, updatedAt: now });
    ok(await w(MGR, 'vendors.update', { vendorId: 'syn-legacy-v', sells: 'דבש ושמן' }), 'vendors.update on a stall of the first API');
    check((await docOf('vendors/syn-legacy-v')).notes === '' && (await docOf('vendors/syn-legacy-v/private/main')).notes === 'הערה ישנה' && (await docOf('vendors/syn-legacy-v')).product === 'דבש ושמן', 'its public notes move to the private document');
    vid2 = (await w(MGR, 'vendors.create', { name: 'קפה נייד', phone: '0504444444', product: 'קפה', external: false })).json.data.vendorId;
    check((await docOf('vendors/' + vid2)).sells === 'קפה', 'the old "product" field still works (stored as sells and product)');
  }

  section('vendors on an event (N8), access (V6)');
  {
    const rec = await docOf(`events/${eventId}/vendors/${vid}`);
    check(rec.status === 'invited' && rec.confirmed === false && rec.invitedBy.uid === 'syn-mgr' && rec.sells === 'גבינות' && rec.needs.join() === 'table,power' && rec.people === 1 && rec.spot === null && rec.feedback === null, 'the per-event record as inviteToEvent() writes it', rec);
    const vv = await docOf('vendors/' + vid);
    const owner = vv.people[0];
    check(owner.role === 'owner' && owner.name === 'מיכל כהן' && owner.entered === false && owner.fem === true && /^[a-z2-9]{12}$/.test(owner.code), 'an owner access link was made', owner);
    const inv = await docOf('vendor_invites/' + owner.code);
    check(inv.active === true && inv.role === 'owner' && inv.vendorId === vid && inv.usedBy === null && inv.createdBy.uid === 'syn-mgr', 'vendor_invites/<code>', inv);
    const info = await docOf(`events/${eventId}/vendor_info/main`);
    check(info.setupFrom === '18:00' && info.vehiclesUntil === '19:15' && info.teardownFrom === '02:00' && info.answerBy === '2026-12-07' && info.contact.uid === 'syn-mgr' && info.contact.phone === '0521234567' && info.managerUids.includes('syn-mgr') && info.managerUids.includes('synthetic-owner'), 'vendor_info/main with the app\'s defaults', info);
    check((await acts(eventId)).some((a) => a.action === 'invited' && a.text === 'גבינות הגליל הוזמן לדוכן'), 'activity "invited"');
    const again = await w(MGR, 'events.inviteVendor', { eventId, vendorId: vid });
    check(again.json.data.alreadyInvited === true && again.json.data.text.includes(`/app/vendor/invite/${eventId}?k=${owner.code}`) && again.json.data.text.startsWith('שלום מיכל,'), 'inviting again: the WhatsApp text with the link', again.json.data);
    check((await r(STAFF, `/v1/events/${eventId}/vendor-info/main`)).status === 200, 'eventVendorInfo.get for the crew');
    const rm = await w(MGR, 'events.remindVendor', { eventId, vendorId: vid });
    check(rm.status === 200 && (await docOf(`events/${eventId}/vendors/${vid}`)).remindedAt && rm.json.data.text.includes('?k='), 'events.remindVendor stamps remindedAt and returns the text');
    ok(await w(MGR, 'events.confirmVendor', { eventId, vendorId: vid }), 'events.confirmVendor');
    const rc = await docOf(`events/${eventId}/vendors/${vid}`);
    check(rc.status === 'confirmed' && rc.confirmed === true && rc.answeredAt && (await acts(eventId)).some((a) => a.text === 'גבינות הגליל: אישרו הגעה'), 'confirmed, with its activity');
    // the old setVendor: a patch that keeps the record's v2 fields and keeps status consistent
    ok(await w(MGR, 'events.setVendor', { eventId, vendorId: vid, confirmed: false, notes: 'מגיעה מאוחר' }), 'events.setVendor (old) on an invited stall');
    const rs = await docOf(`events/${eventId}/vendors/${vid}`);
    check(rs.confirmed === false && rs.status === 'invited' && rs.notes === 'מגיעה מאוחר' && rs.invitedBy.uid === 'syn-mgr' && rs.sells === 'גבינות' && rs.remindedAt, 'WRONG fix: setVendor keeps the v2 fields, and status follows confirmed', rs);
    ok(await w(MGR, 'events.setVendor', { eventId, vendorId: vid2, confirmed: true }), 'events.setVendor on a new stall');
    const r2 = await docOf(`events/${eventId}/vendors/${vid2}`);
    check(r2.status === 'confirmed' && r2.confirmed === true && r2.people === 1 && (await docOf('vendors/' + vid2)).events.includes(eventId), 'a v2 record, and the event in the stall\'s history', r2);
    check((await r(STAFF, `/v1/events/${eventId}/vendors`)).json.data.items.length === 2, 'eventVendors.list');
    // invite everyone from a previous event
    await seed('events/syn-src/vendors/syn-legacy-v', { vendorId: 'syn-legacy-v', name: 'דבש ישן', confirmed: true, notes: '' });
    await seed(`events/syn-src/vendors/${vid}`, { vendorId: vid, name: 'גבינות הגליל', confirmed: true, notes: '' });
    const many = await w(MGR, 'events.inviteVendors', { eventId, fromEventId: 'syn-src' });
    check(many.status === 201 && many.json.data.invited.map((x) => x.vendorId).join() === 'syn-legacy-v' && many.json.data.skipped.includes(vid), 'inviteVendors from a previous event skips the ones already invited', many.json.data);
    check((await docOf('vendors/syn-legacy-v')).people[0]?.role === 'owner', 'the stall got its owner link');
    // people and access
    const ap = await w(MGR, 'vendors.addPerson', { vendorId: vid, name: 'שירה עוזרת', phone: '0505555555', fem: true });
    check(ap.status === 201 && ap.json.data.link === `https://havat-ravve.web.app/app/vendor?k=${ap.json.data.code}` && ap.json.data.text.startsWith('שלום שירה, צירפתי אותך לדוכן גבינות הגליל'), 'vendors.addPerson: an access link and the helper text', ap.json.data);
    const helper = ap.json.data.code;
    check((await docOf('vendors/' + vid)).people.length === 2 && (await docOf('vendor_invites/' + helper)).role === 'helper', 'the person and the invite are stored');
    const il = await r(MGR, `/v1/vendor-invites?vendorId=${vid}`);
    check(il.status === 200 && il.json.data.items.length === 2 && (await r(STAFF, '/v1/vendor-invites')).status === 403, 'vendorInvites.list for managers only');
    ok(await w(MGR, 'vendors.removePerson', { vendorId: vid, code: helper }), 'vendors.removePerson');
    check((await docOf('vendors/' + vid)).people.length === 1 && (await docOf('vendor_invites/' + helper)).active === false, 'removed, and the link closed');
    // an account that signed in with the owner link
    await person('syn-vendor-acct', 'מיכל כהן', 'vendor', { vendorId: vid, helper: false, addedBy: 'syn-mgr', inviteCode: owner.code });
    await seed('vendor_invites/' + owner.code, { ...(await docOf('vendor_invites/' + owner.code)), usedBy: 'syn-vendor-acct', usedAt: now, active: false });
    // event-day requests
    await seed(`events/${eventId}/vendor_requests/req1`, { id: 'req1', eventId, vendorId: vid, vendorName: 'גבינות הגליל', kind: 'power', text: 'החשמל נפל', by: { uid: 'syn-vendor-acct', name: 'מיכל כהן' }, createdAt: now, takenBy: null, closedAt: null, closedBy: null });
    const rq = await r(STAFF, `/v1/events/${eventId}/vendor-requests?vendorId=${vid}`);
    check(rq.status === 200 && rq.json.data.items.length === 1, 'eventVendorRequests.list for the crew');
    ok(await w(STAFF, 'vendorRequests.close', { eventId, requestId: 'req1' }), 'vendorRequests.close by a volunteer');
    const rqd = await docOf(`events/${eventId}/vendor_requests/req1`);
    const vn = (await listCol('users/syn-vendor-acct/notifications')).find((x) => x.refId === 'req1');
    check(rqd.closedBy.uid === 'syn-staff' && rqd.closedAt && vn?.title === 'הבקשה שלך טופלה' && vn?.sub === 'רונית לוי' && vn?.link === '/vendor' && vn?.kind === 'vendor', 'closed, and the vendor is told', [rqd, vn]);
    check((await w(STAFF, 'vendorRequests.close', { eventId, requestId: 'req1' })).status === 409, 'closing twice → 409');
    check((await w(STAFF, 'vendorRequests.delete', { eventId, requestId: 'req1' })).status === 403, 'staff cannot delete a request');
    ok(await w(MGR, 'vendorRequests.delete', { eventId, requestId: 'req1' }), 'vendorRequests.delete');
    check(!(await docOf(`events/${eventId}/vendor_requests/req1`)), 'the request is gone');
    // remove access: the linked account goes back to guest
    ok(await w(MGR, 'vendors.removeAccess', { vendorId: vid }), 'vendors.removeAccess');
    const acct = await docOf('users/syn-vendor-acct');
    check(acct.role === 'guest' && acct.log.at(-1).text === 'הגישה לדוכן גבינות הגליל הוסרה' && (await docOf('vendors/' + vid)).people.length === 0, 'the account is a guest again, with a log line; the people list is empty', acct);
    // take a stall off an event
    ok(await w(MGR, 'events.removeVendor', { eventId, vendorId: vid2 }), 'events.removeVendor');
    check(!(await docOf(`events/${eventId}/vendors/${vid2}`)) && !(await docOf('vendors/' + vid2)).events.includes(eventId) && (await acts(eventId)).some((a) => a.action === 'removed' && a.text === 'קפה נייד הוסר מהדוכנים של האירוע'), 'the record is gone, the event leaves the stall\'s history (arrayRemove), activity "removed"');
  }

  section('the app\'s Rules accept what the API wrote');
  {
    const { initializeTestEnvironment, assertSucceeds } = require('@firebase/rules-unit-testing');
    require('firebase/compat/firestore');
    const { doc, setDoc, Timestamp } = require('firebase/firestore');
    rulesEnv = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
    const claims = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const as = (uid) => rulesEnv.authenticatedContext(uid, claims(uid + '@synthetic.invalid')).firestore();
    const mgr = as('syn-mgr'), staff = as('syn-staff');
    const tsOf = (t) => { const [, frac = ''] = /\.(\d+)Z$/.exec(t) || []; return new Timestamp(Math.floor(Date.parse(t.replace(/\.\d+Z$/, 'Z')) / 1000), Number(frac.padEnd(9, '0').slice(0, 9))); };
    const decSdk = (v) => 'timestampValue' in v ? tsOf(v.timestampValue) : 'arrayValue' in v ? (v.arrayValue.values || []).map(decSdk) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decSdk(x)])) : dec(v);
    const sdk = async (path) => Object.fromEntries(Object.entries((await rawDoc(path)).fields || {}).map(([k, v]) => [k, decSdk(v)]));
    const tries = [];
    const tryIt = async (label, p) => { try { await assertSucceeds(p); tries.push(true); } catch (e) { tries.push(false); console.error('  Rules rejected', label, String(e).slice(0, 220)); } };
    for (const p of [`events/${eventId}`, 'events/syn-old', `events/${eventId}/products/${cake}`, `events/${eventId}/staffing/gate`, `events/${eventId}/files/inline`, `events/${eventId}/counters/live`, `events/${eventId}/counters/cash`,
      'tickets/syn-gate-1', 'tickets/syn-cancel-1', 'tickets/syn-onsite-1', 'tickets/syn-pay-1', `tabs/${tabId}`, `vendors/${vid}`, `vendors/${vid}/private/main`, 'vendors/syn-legacy-v', `events/${eventId}/vendors/${vid}`, `events/${eventId}/vendor_info/main`, 'donations/syn-don']) {
      await tryIt(p, sdk(p).then((d) => setDoc(doc(mgr, ...p.split('/')), d)));
    }
    const guest = (await where('tickets', 'ownerName', 'משפחת לוי'))[0];
    await tryIt('a manager\'s guest order (rewritten)', sdk('tickets/' + guest.id).then((d) => setDoc(doc(mgr, 'tickets', guest.id), d)));
    const { id: _w, ...walk } = await docOf('tickets/' + walkIn);
    await tryIt('a walk-in ticket (a volunteer creates it)', setDoc(doc(staff, 'tickets', 'copy-walkin'), walk));
    const scan = await docOf(`events/${eventId}/scans/${laterScan}`);
    await tryIt('a gate scan (a volunteer creates it)', setDoc(doc(staff, 'events', eventId, 'scans', 'copy-scan'), scan));
    const rej = await docOf(`events/${eventId}/scans/${rejected}`);
    await tryIt('a rejected scan shape (a volunteer creates it)', setDoc(doc(staff, 'events', eventId, 'scans', 'copy-rej'), { ...rej, reopenedBy: null, reopenedAt: null }));
    const inv = (await where('vendor_invites', 'vendorId', 'syn-legacy-v'))[0];
    const { id: _i, ...invData } = inv;
    await tryIt('a vendor invite (a manager creates it)', setDoc(doc(mgr, 'vendor_invites', 'copyinvite01'), { ...invData, code: 'copyinvite01' }));
    const n = (await listCol('users/syn-staff/notifications')).find((x) => x.refId === eventId);
    await tryIt('a station notification (a manager sends it)', setDoc(doc(mgr, 'users', 'syn-staff2', 'notifications', 'copyn'), { ...n, id: 'copyn' }));
    const myActs = (await where('activity', 'by', MGR_ACTOR)).slice(0, 40);
    for (const a of myActs) { const { id, via: _via, ...data } = a; await tryIt('activity ' + a.action, setDoc(doc(mgr, 'activity', 'copy-' + id), data)); }
    check(tries.every(Boolean) && tries.length >= 30, `the app's Rules accept every shape (${tries.filter(Boolean).length}/${tries.length})`);
  }

  section('vendors.delete: the whole stall');
  {
    await person('syn-vendor-acct2', 'עוזר דבש', 'vendor', { vendorId: 'syn-legacy-v', helper: true, addedBy: 'syn-mgr', inviteCode: 'x' });
    const v = await docOf('vendors/syn-legacy-v');
    await seed('vendors/syn-legacy-v', { ...v, people: [...v.people, { name: 'עוזר דבש', role: 'helper', entered: true, uid: 'syn-vendor-acct2' }] });
    check((await w(STAFF, 'vendors.delete', { vendorId: 'syn-legacy-v' })).status === 403, 'staff cannot delete a stall');
    const d = await w(MGR, 'vendors.delete', { vendorId: 'syn-legacy-v' });
    check(d.status === 200 && d.json.data.verified && d.json.data.events === 1, 'vendors.delete', d.json);
    check(!(await docOf('vendors/syn-legacy-v')) && !(await docOf('vendors/syn-legacy-v/private/main')) && !(await docOf(`events/${eventId}/vendors/syn-legacy-v`)) && !(await where('vendor_invites', 'vendorId', 'syn-legacy-v')).length, 'the stall, its notes, its event record and its links are gone');
    check((await docOf('users/syn-vendor-acct2')).role === 'guest' && (await docOf('users/syn-vendor-acct2')).log.at(-1).text === 'הדוכן דבש ישן נמחק מהמאגר', 'its linked account is a guest again');
    check((await acts('syn-legacy-v')).some((a) => a.action === 'deleted' && a.text === 'דבש ישן נמחק ממאגר בעלי הדוכנים'), 'activity "deleted"');
  }

  void OWNER;
} catch (e) {
  failures++;
  console.error(e);
} finally {
  if (rulesEnv) await rulesEnv.cleanup().catch(() => {});
  await stopWorker(worker);
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
