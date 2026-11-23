// Gate A for the v2 farm/broadcast/manage operations of the API (api/src/v2/farm.ts, broadcast.ts, manage.ts and the
// calendar/people/visits/donations/notifications/settings parts of api/src/writes.ts): the real Worker in `wrangler dev`
// against the Firestore emulator, synthetic people only. Run:
//   npx firebase emulators:exec --only firestore,auth --project demo-havat-ravve "node tests/api-v2-farm.mjs"
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
const check = (cond, label, extra) => { if (cond) { passes++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const section = (s) => console.log('\n' + s);

// ---------- emulator helpers (admin access with "Bearer owner") ----------
const enc = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = (v) => 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? Number(v.doubleValue) : 'stringValue' in v ? v.stringValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
const admin = { authorization: 'Bearer owner', 'content-type': 'application/json' };
async function seed(path, data, raw = {}) {
  const r = await fetch(`${DOCS}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])), ...raw } }) });
  if (!r.ok) throw new Error('seed failed ' + (await r.text()));
}
const docOf = async (path) => { const j = await fetch(`${DOCS}/${path}`, { headers: admin }).then((x) => x.json()); return j.fields ? Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, dec(v)])) : null; };
async function listCol(path) {
  const j = await fetch(`${DOCS}/${path}?pageSize=1000`, { headers: admin }).then((x) => x.json());
  return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
async function where(col, field, value) {
  const r = await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: admin, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } } } }) });
  return (await r.json()).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), ...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
const sameKeys = (o, keys) => JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...keys].sort());
const todayIL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (key, n) => { const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- synthetic credentials ----------
const newKey = () => 'hr_' + randomBytes(32).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const KEYS = { owner: newKey(), users: newKey() };
const CREDENTIALS = [
  { id: 'cred-v2-owner', sha256: sha(KEYS.owner), actors: ['actor-demo-owner'] },
  { id: 'cred-v2-users', sha256: sha(KEYS.users), actors: ['user:syn-mgr', 'user:syn-staff', 'user:syn-staff2'] },
];

// ---------- Worker under wrangler dev ----------
const workers = new Set();
const listening = (port) => new Promise((resolve) => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); });
function startWorker(port, vars, extra = []) {
  const args = ['wrangler', 'dev', '--config', 'api/wrangler.toml', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(port + 1000), '--show-interactive-dev-session=false', '--log-level', 'log'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  args.push(...extra);
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

const PORT = 19000;
const BASE = `http://127.0.0.1:${PORT}`;
if (await listening(PORT)) { console.error(`port ${PORT} is busy`); process.exit(1); }
const worker = startWorker(PORT, { FIRESTORE_PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: EMU, TEST_FAULTS: '1', API_CREDENTIALS: JSON.stringify(CREDENTIALS), EMAIL_ENABLED: 'false', KEY_LABELS: JSON.stringify({ 'cred-v2-users': 'האינסטינקט של הבדיקה' }), ...(process.env.FIREBASE_AUTH_EMULATOR_HOST ? { FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST } : {}) }, ['--persist-to', fs.mkdtempSync('/tmp/hr-farm-')]);
async function api(method, path, { key, body, idem, headers = {} } = {}) {
  const r = await fetch(BASE + path, { method, headers: { ...(key ? { authorization: 'Bearer ' + key } : {}), ...(idem ? { 'idempotency-key': idem } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const U = (uid) => ({ key: KEYS.users, headers: { 'x-actor-id': 'user:' + uid } });
const OWNER = { key: KEYS.owner }, MGR = U('syn-mgr'), STAFF = U('syn-staff'), STAFF2 = U('syn-staff2');
const w = (who, op, body, idem = randomUUID()) => api('POST', '/v1/actions/' + op, { ...who, idem, body });
const r = (who, path) => api('GET', path, who);
const ok = (res, label) => check(res.status >= 200 && res.status < 300 && (res.json?.data?.verified ?? true) !== false, label, res.json?.error || res.json?.data);
const pushJobs = async () => listCol('push_jobs');

let rulesEnv;
try {
  await waitUp(BASE);
  await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const now = new Date().toISOString();
  const person = (uid, displayName, role, extra = {}) => seed('users/' + uid, { uid, email: `${uid}@synthetic.invalid`, displayName, phone: '0500000000', role, status: 'active', customerNumber: 1, acceptedTermsAt: now, notes: '', createdAt: now, updatedAt: now, ...extra });
  await person('synthetic-owner', 'בעלים סינתטי', 'owner');
  await person('syn-mgr', 'מנהלת בדיקה', 'manager');
  await person('syn-staff', 'רונית לוי', 'staff', { push: { enabled: true, kinds: ['broadcast'], devices: [{ id: 'd1', kind: 'webpush', endpoint: 'https://push.example/secret-endpoint', keys: { p256dh: 'p', auth: 'a' }, ua: 'x', createdAt: now }], updatedAt: now } });
  await person('syn-staff2', 'יואב כהן', 'staff');
  await person('syn-guest', 'אורחת', 'guest');
  await person('syn-blocked', 'חסום', 'staff', { status: 'blocked' });
  await person('syn-vendor', 'בעל דוכן', 'vendor', { vendorId: 'v-cheese' });
  await person('syn-vendor-other', 'דוכן אחר', 'vendor', { vendorId: 'v-other' });
  await person('syn-owner-acct', 'חשבון הבעלים', 'owner', { email: 'meniviner@gmail.com' });
  await person('syn-delete-me', 'למחיקה', 'guest', { email: 'delete.me@synthetic.invalid' });
  await seed('role_invites/delete.me@synthetic.invalid', { email: 'delete.me@synthetic.invalid', role: 'staff', createdBy: { uid: 'synthetic-owner', name: 'x' }, createdAt: now });

  section('catalog 3.0');
  {
    const c = (await api('GET', '/v1/catalog')).json.data;
    const names = c.operations.map((o) => o.name);
    const mine = ['presence.save', 'presence.remove', 'calendar.create', 'calendar.update', 'calendar.delete', 'calendar.list', 'broadcasts.list', 'broadcasts.get', 'broadcastReads.list', 'broadcasts.send', 'broadcasts.resend', 'broadcasts.delete',
      'me.notifications.list', 'me.notifications.get', 'me.notifications.markRead', 'notifications.send', 'notifications.delete', 'people.delete', 'visits.delete', 'donations.paymentNotArrived', 'donations.undoApproval', 'donations.delete',
      'settings.update', 'settings.saveQuestion', 'settings.removeQuestion', 'settings.reorderQuestions', 'accountDeletions.list'];
    check(c.version === '3.0.0' && c.generatedAt.startsWith('2026-11-22') && (await api('GET', '/v1/health')).json.data.catalogVersion === '3.0.0', 'catalog and health report 3.0.0');
    check(mine.every((n) => names.includes(n)), 'every new operation is listed', mine.filter((n) => !names.includes(n)));
    check(new Set(names).size === names.length, 'operation names are unique');
    check(/photo|file/i.test(c.conventions.files) && /notification/i.test(c.conventions.notifications) && /staff/.test(c.conventions.scopes) && /presence/.test(c.conventions.scopes), 'conventions: files, notifications and the staff scope text');
  }

  section('presence (F4)');
  let presA, presB;
  const d1 = addDays(todayIL, 2), d2 = addDays(todayIL, 3);
  {
    const key = randomUUID();
    const s = await w(STAFF, 'presence.save', { dates: [d2, d1, d1], from: '08:00', to: '13:00', note: 'מביאה עוגה' }, key);
    check(s.status === 201 && s.json.data.created === 2 && s.json.data.updated === 0 && s.json.data.verified, 'staff registers two days → 201, two entries', s.json);
    [presA, presB] = s.json.data.itemIds;
    const a = await docOf('calendar/' + presA);
    check(sameKeys(a, ['from', 'to', 'time', 'note', 'title', 'date', 'kind', 'ownerUid', 'ownerName', 'refId', 'createdAt']) && a.date === d1 && a.time === '08:00–13:00' && a.title === 'רונית בחווה' && a.kind === 'presence' && a.ownerUid === 'syn-staff' && a.ownerName === 'רונית לוי' && a.refId === '' && a.note === 'מביאה עוגה',
      'stored exactly as presencePlan() writes it (days sorted, title "<first name> בחווה")', a);
    const again = await w(STAFF, 'presence.save', { dates: [d2, d1, d1], from: '08:00', to: '13:00', note: 'מביאה עוגה' }, key);
    check(again.status === 200 && again.json.data.replayed === true && (await where('calendar', 'ownerUid', 'syn-staff')).length === 2, 'replay with the same key: same answer, nothing new');
    const upd = await w(STAFF, 'presence.save', { dates: [d1], note: '' });
    const a2 = await docOf('calendar/' + presA);
    check(upd.status === 200 && upd.json.data.updated === 1 && upd.json.data.itemIds[0] === presA && a2.time === '' && a2.from === '' && a2.to === '' && a2.note === '' && a2.createdAt === a.createdAt, 'the same day again updates that entry (all day now), no second one', a2);
    // an old manual entry "<first name> בחווה" is left alone
    await seed('calendar/syn-legacy', { title: 'רונית בחווה', date: d2, time: '10:00', kind: 'manual', ownerUid: 'syn-staff', ownerName: 'רונית לוי', refId: '', createdAt: now });
    await w(STAFF, 'presence.save', { dates: [d2], from: '09:00' });
    check((await docOf('calendar/syn-legacy')).time === '10:00' && (await docOf('calendar/' + presB)).time === '09:00', 'an old manual presence entry is left as it was; the presence entry changes');
    check((await w(STAFF, 'presence.save', { dates: [d1], uid: 'syn-staff2' })).status === 403, 'staff cannot register someone else → 403');
    const forOther = await w(MGR, 'presence.save', { dates: [d1], uid: 'syn-staff2', from: '13:00', to: '18:00' });
    const o = await docOf('calendar/' + forOther.json.data.itemIds?.[0]);
    check(forOther.status === 201 && o.ownerUid === 'syn-staff2' && o.ownerName === 'יואב כהן' && o.title === 'יואב בחווה', 'a manager registers a volunteer (owner = that person)', o);
    check((await w(MGR, 'presence.save', { dates: [d1], uid: 'syn-guest' })).status === 400, 'only an active team member can be registered → 400');
    check((await w(STAFF, 'presence.save', { dates: [d1], from: '13:00', to: '09:00' })).status === 400, '"to" before "from" → 400');
    check((await w(STAFF, 'presence.save', { dates: ['2026-02-30'] })).status === 400, 'an impossible date → 400');
    check((await w(STAFF, 'presence.remove', { itemId: forOther.json.data.itemIds[0] })).status === 403, 'staff cannot remove someone else\'s presence → 403');
  }

  section('team calendar (C11)');
  let itemId;
  {
    check((await w(STAFF, 'calendar.create', { title: 'x', date: d1 })).status === 403, 'staff cannot add calendar items → 403');
    const c = await w(MGR, 'calendar.create', { title: 'פגישת צוות', date: '2026-12-02', from: '09:00', to: '10:30', participants: ['syn-staff', 'syn-staff2'], kind: 'meeting', audience: 'managers' });
    ok(c, 'calendar.create'); itemId = c.json.data.itemId;
    const it = await docOf('calendar/' + itemId);
    check(sameKeys(it, ['title', 'date', 'time', 'from', 'to', 'audience', 'participants', 'reminder', 'remindAt', 'reminderSentAt', 'kind', 'ownerUid', 'ownerName', 'refId', 'createdAt'])
      && it.time === '09:00–10:30' && it.reminder === '60' && it.remindAt === '2026-12-02T06:00:00.000Z' && it.reminderSentAt === null && it.kind === 'meeting' && it.audience === 'managers' && it.participants.join() === 'syn-staff,syn-staff2' && it.ownerUid === 'syn-mgr',
    'stored as saveCalItem() writes it: reminder on by default, an hour before 09:00 Israel winter time', it);
    const summer = await w(MGR, 'calendar.create', { title: 'קיץ', date: '2027-07-01', time: '09:00', reminder: true });
    const sm = await docOf('calendar/' + summer.json.data.itemId);
    check(sm.from === '09:00' && sm.to === '' && sm.time === '09:00' && sm.remindAt === '2027-07-01T05:00:00.000Z' && sm.audience === 'all' && sm.kind === 'manual', 'the old "time" works as "from"; summer time handled in remindAt', sm);
    const noHour = await w(MGR, 'calendar.create', { title: 'בלי שעה', date: '2026-12-03' });
    check((await docOf('calendar/' + noHour.json.data.itemId)).remindAt === '', 'no start hour → no reminder time');
    check((await w(MGR, 'calendar.create', { title: 'x', date: '2026-12-03', participants: ['nobody-here'] })).status === 400, 'an unknown participant → 400');
    // the Worker sent the reminder; moving the meeting sets a new remindAt and clears reminderSentAt
    await fetch(`${DOCS}/calendar/${itemId}?updateMask.fieldPaths=reminderSentAt`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { reminderSentAt: enc('2026-12-02T06:00:01.000Z') } }) });
    ok(await w(MGR, 'calendar.update', { itemId, date: '2026-12-04', from: '10:00' }), 'calendar.update date + hour');
    const u = await docOf('calendar/' + itemId);
    check(u.date === '2026-12-04' && u.from === '10:00' && u.to === '10:30' && u.time === '10:00–10:30' && u.remindAt === '2026-12-04T07:00:00.000Z' && u.reminderSentAt === null && u.participants.length === 2 && u.audience === 'managers', 'update recomputes the time text and remindAt, clears reminderSentAt, keeps the rest', u);
  }
  {
    const bad = await w(MGR, 'calendar.update', { itemId, from: '12:00' });
    check(bad.status === 400, 'an update that puts "from" after "to" → 400', bad.json);
    ok(await w(MGR, 'calendar.update', { itemId, to: '13:00', from: '12:00', kind: 'meeting' }), 'calendar.update hours');
    const u = await docOf('calendar/' + itemId);
    check(u.time === '12:00–13:00' && u.kind === 'meeting', 'hours saved; an unchanged kind is not rewritten');
    ok(await w(MGR, 'calendar.update', { itemId, allDay: true, reminder: false, audience: 'all', kind: 'planning' }), 'calendar.update all day, no reminder');
    const u2 = await docOf('calendar/' + itemId);
    check(u2.time === '' && u2.from === '' && u2.to === '' && u2.reminder === '' && u2.remindAt === '' && u2.kind === 'planning' && u2.audience === 'all', 'all day, reminder off, kind changed', u2);
    ok(await w(MGR, 'calendar.update', { itemId, audience: 'managers' }), 'back to managers only');
    const sl = await r(STAFF, `/v1/calendar?dateFrom=${todayIL}&dateTo=2026-12-31`);
    check(sl.status === 200 && sl.json.data.items.some((x) => x.id === presA) && !sl.json.data.items.some((x) => x.id === itemId), 'staff read the calendar, without items for managers only', sl.json);
    check((await r(STAFF, '/v1/calendar/' + itemId)).status === 404 && (await r(STAFF, '/v1/calendar/' + presA)).status === 200, 'calendar.get: a managers-only item is 404 for staff');
    const ml = await r(MGR, '/v1/calendar?audience=managers');
    check(ml.status === 200 && ml.json.data.items.length >= 1 && ml.json.data.items.every((x) => x.audience === 'managers'), 'calendar.list audience filter (managers)');
    check((await r(MGR, `/v1/calendar?ownerUid=syn-staff&kind=presence`)).json.data.items.every((x) => x.ownerUid === 'syn-staff' && x.kind === 'presence'), 'calendar.list by owner and kind');
    check((await w(MGR, 'presence.remove', { itemId })).status === 400, 'presence.remove on a non-presence item → 400');
    ok(await w(STAFF, 'presence.remove', { itemId: presB }), 'staff removes their own presence');
    check(!(await docOf('calendar/' + presB)), 'it is gone');
  }

  section('broadcasts (B1-B3)');
  let bAll, bTeam;
  {
    // today: syn-staff registered at the farm; an event today with a crew and two stalls (one declined)
    await w(STAFF, 'presence.save', { dates: [todayIL], from: '08:00', to: '12:00' });
    await seed('events/ev-today', { title: 'יום פתוח', start: `${todayIL}T08:00`, end: `${todayIL}T18:00`, published: true, open: true, price: 0, createdAt: now, updatedAt: now });
    await seed('events/ev-today/staffing/gate', { station: 'שער', people: [{ uid: 'syn-staff2', name: 'יואב כהן', hours: '' }, { uid: 'syn-guest', name: 'x', hours: '' }], needed: 2 });
    await seed('events/ev-today/vendors/v-cheese', { vendorId: 'v-cheese', name: 'גבינות', confirmed: true, notes: '', status: 'confirmed' });
    await seed('events/ev-today/vendors/v-other', { vendorId: 'v-other', name: 'אחר', confirmed: false, notes: '', status: 'declined' });
    const who = async (audience) => (await w(MGR, 'broadcasts.send', { text: 'בדיקה', audience, preview: true })).json.data;
    const all = await who('all'), mgrs = await who('managers'), today = await who('farmToday'), crew = await who('crew'), vendors = await who('vendors');
    const ids = (x) => x.recipients.map((p) => p.uid).sort().join();
    check(ids(all) === 'syn-mgr,syn-owner-acct,syn-staff,syn-staff2,synthetic-owner', 'audience all = active owners, managers and volunteers', ids(all));
    check(ids(mgrs) === 'syn-mgr,syn-owner-acct,synthetic-owner', 'audience managers', ids(mgrs));
    check(ids(today) === 'syn-staff', 'audience farmToday = today\'s presence', ids(today));
    check(ids(crew) === 'syn-staff2' && crew.event?.id === 'ev-today', 'audience crew = today\'s event staffing (team members only)', crew);
    check(ids(vendors) === 'syn-vendor', 'audience vendors = vendor accounts of the event\'s stalls that did not decline', ids(vendors));
    check(!(await listCol('broadcasts')).length, 'preview writes no broadcast');
    check((await w(STAFF, 'broadcasts.send', { text: 'x', audience: 'all' })).status === 403, 'staff cannot send → 403');
    check((await w(MGR, 'broadcasts.send', { text: 'x', audience: 'all', eventId: 'ev-today' })).status === 400, 'eventId with audience all → 400');

    const jobs0 = (await pushJobs()).length;
    const key = randomUUID();
    const s = await w(MGR, 'broadcasts.send', { text: 'מחר מתחילים ב־7', audience: 'all', urgent: true }, key);
    check(s.status === 201 && s.json.data.recipientCount === 5 && s.json.data.notified === 4, 'broadcasts.send → 201, 5 recipients, 4 notified (not the sender)', s.json);
    bAll = s.json.data.broadcastId;
    const b = await docOf('broadcasts/' + bAll);
    check(sameKeys(b, ['id', 'text', 'audience', 'urgent', 'by', 'createdAt', 'recipients', 'recipientCount', 'resentAt']) && b.id === bAll && b.urgent === true && b.by.uid === 'syn-mgr' && b.resentAt === null && b.recipientCount === b.recipients.length,
      'stored exactly as sendBroadcast() writes it', b);
    const own = await docOf(`broadcasts/${bAll}/reads/syn-mgr`);
    check(own && own.at === b.createdAt && own.seenAt === b.createdAt && own.uid === 'syn-mgr', 'the sender\'s own read receipt');
    const n = await docOf(`users/syn-staff/notifications/b_${bAll}`);
    check(n && sameKeys(n, ['id', 'kind', 'title', 'sub', 'link', 'refId', 'by', 'createdAt', 'readAt']) && n.kind === 'broadcast' && n.title === 'הודעה ממנהלת' && n.sub === 'מחר מתחילים ב־7' && n.link === '/tasks' && n.refId === bAll && n.readAt === null, 'each recipient: notification b_<id> as notify() writes it', n);
    check(!(await docOf(`users/syn-mgr/notifications/b_${bAll}`)), 'the sender is not notified');
    const jobs = (await pushJobs()).filter((j) => j.refId === bAll);
    check((await pushJobs()).length === jobs0 + 1 && jobs[0].kind === 'broadcast' && jobs[0].urgent === true && jobs[0].tag === 'b_' + bAll && jobs[0].to.sort().join() === 'syn-owner-acct,syn-staff,syn-staff2,synthetic-owner' && jobs[0].sentAt === null && jobs[0].createdBy.uid === 'syn-mgr',
      'one push job for the phones (urgent, tagged b_<id>, sender excluded)', jobs[0]);
    const again = await w(MGR, 'broadcasts.send', { text: 'מחר מתחילים ב־7', audience: 'all', urgent: true }, key);
    check(again.json.data.replayed === true && again.json.data.broadcastId === bAll && (await listCol('broadcasts')).length === 1 && (await pushJobs()).length === jobs0 + 1, 'replay: same broadcast, no second send');
    const v = await w(MGR, 'broadcasts.send', { text: 'לדוכנים', audience: 'vendors' });
    check(v.status === 201 && (await docOf('broadcasts/' + v.json.data.broadcastId)).eventId === 'ev-today' && (await docOf(`users/syn-vendor/notifications/b_${v.json.data.broadcastId}`)).link === '/vendor', 'vendors: eventId stored, link /vendor');
    bTeam = v.json.data.broadcastId;

    // reads
    const sl = await r(STAFF, '/v1/broadcasts');
    check(sl.status === 200 && sl.json.data.items.length === 1 && sl.json.data.items[0].id === bAll, 'staff see only broadcasts sent to them');
    check((await r(STAFF, '/v1/broadcasts/' + bTeam)).status === 404 && (await r(STAFF, '/v1/broadcasts/' + bAll)).status === 200, 'broadcasts.get: not a recipient → 404');
    check((await r(STAFF, '/v1/broadcasts?urgent=true')).status === 403, 'staff with filters → 403 (only their own list)');
    check((await r(MGR, '/v1/broadcasts?audience=vendors')).json.data.items.map((x) => x.id).join() === bTeam, 'managers list with an audience filter');
    // syn-staff read it; syn-staff2 only saw the card
    await seed(`broadcasts/${bAll}/reads/syn-staff`, { id: 'syn-staff', uid: 'syn-staff', name: 'רונית לוי', at: now, seenAt: now });
    await seed(`broadcasts/${bAll}/reads/syn-staff2`, { id: 'syn-staff2', uid: 'syn-staff2', name: 'יואב כהן', seenAt: now });
    const rd = await r(MGR, `/v1/broadcasts/${bAll}/reads`);
    check(rd.status === 200 && rd.json.data.items.length === 3 && rd.json.data.items.some((x) => x.uid === 'syn-staff2' && !x.at), 'broadcastReads.list: who read and who only saw it', rd.json);
    check((await r(STAFF, `/v1/broadcasts/${bAll}/reads`)).status === 403, 'staff cannot list read receipts');

    // resend: only the people without a read receipt; their notification comes back as new
    await fetch(`${DOCS}/users/syn-staff2/notifications/b_${bAll}?updateMask.fieldPaths=readAt`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { readAt: enc(now) } }) });
    const jobs1 = (await pushJobs()).length;
    const rs = await w(MGR, 'broadcasts.resend', { broadcastId: bAll });
    check(rs.status === 200 && rs.json.data.notified === 3 && (await docOf('broadcasts/' + bAll)).resentAt, 'broadcasts.resend: resentAt set, 3 unread people notified', rs.json);
    const newJob = (await pushJobs()).filter((j) => j.refId === bAll).find((j) => !j.to.includes('syn-staff'));
    check((await pushJobs()).length === jobs1 + 1 && newJob && newJob.to.sort().join() === 'syn-owner-acct,syn-staff2,synthetic-owner', 'the reader is skipped', newJob);
    check((await docOf(`users/syn-staff2/notifications/b_${bAll}`)).readAt === null, 'their notification is new again (same id)');
    check((await w(STAFF, 'broadcasts.resend', { broadcastId: bAll })).status === 403, 'staff cannot resend');
    check((await w(MGR, 'broadcasts.delete', { broadcastId: bTeam })).status === 403, 'a manager cannot delete a broadcast (owner only)');
    ok(await w(OWNER, 'broadcasts.delete', { broadcastId: bTeam }), 'the owner deletes a broadcast');
    check(!(await docOf('broadcasts/' + bTeam)) && !!(await docOf(`users/syn-vendor/notifications/b_${bTeam}`)), 'gone; the person\'s copy stays, as in the app');
  }

  section('personal notifications (C1)');
  {
    const l = await r(STAFF, '/v1/me/notifications');
    check(l.status === 200 && l.json.data.items.length === 1 && l.json.data.items[0].id === 'b_' + bAll && l.json.data.items[0].readAt === null, 'me.notifications.list: the caller\'s own', l.json);
    check((await r(STAFF, '/v1/me/notifications?kind=broadcast')).json.data.items.length === 1 && (await r(STAFF, '/v1/me/notifications/b_' + bAll)).json.data.record.kind === 'broadcast', 'filter by kind; get by id');
    check((await r(STAFF2, '/v1/me/notifications')).json.data.items.every((x) => x.id !== 'nope'), 'another person reads only their own');
    const m = await w(STAFF, 'me.notifications.markRead', { ids: ['b_' + bAll] });
    check(m.status === 200 && m.json.data.marked === 1 && (await docOf(`users/syn-staff/notifications/b_${bAll}`)).readAt, 'markRead by id', m.json);
    check((await w(STAFF, 'me.notifications.markRead', { ids: ['no-such'] })).status === 404, 'an id that is not mine → 404');
    check((await w(STAFF, 'me.notifications.markRead', {})).status === 400, 'nothing to mark → 400');
    const all = await w(STAFF2, 'me.notifications.markRead', { all: true });
    check(all.status === 200 && all.json.data.marked === 1, 'markRead all');
    // notifications.send: the assistant notifies chosen people
    check((await w(STAFF, 'notifications.send', { uids: ['syn-staff2'], title: 'x', link: '/tasks' })).status === 403, 'staff cannot use notifications.send');
    check((await w(MGR, 'notifications.send', { uids: ['syn-staff2'], title: 'x', link: 'https://evil.example' })).status === 400, 'a link outside the app → 400');
    check((await w(MGR, 'notifications.send', { uids: ['syn-blocked'], title: 'x', link: '/tasks' })).status === 400, 'a blocked person → 400');
    const jobs0 = (await pushJobs()).length;
    const ns = await w(MGR, 'notifications.send', { uids: ['syn-staff', 'syn-staff2', 'syn-mgr'], title: 'לבדוק את המשאבה', sub: 'היא מרעישה', link: '/farm' });
    const nid = ns.json.data?.notificationId;
    const nd = await docOf(`users/syn-staff/notifications/${nid}`);
    check(ns.status === 201 && ns.json.data.notified === 2 && nd.kind === 'system' && nd.title === 'לבדוק את המשאבה' && nd.link === '/farm' && nd.by.uid === 'syn-mgr' && !(await docOf(`users/syn-mgr/notifications/${nid}`)) && (await pushJobs()).length === jobs0 + 1, 'notifications.send: kind system, push job, never to the sender', ns.json);
  }

  section('people');
  {
    const p = await r(MGR, '/v1/profiles/syn-staff');
    check(p.status === 200 && p.json.data.record.push.deviceCount === 1 && !('devices' in p.json.data.record.push) && !JSON.stringify(p.json).includes('secret-endpoint'), 'profiles.get: push subscriptions redacted (deviceCount only)', p.json.data.record.push);
    const pl = await r(MGR, '/v1/profiles?limit=100');
    check(!JSON.stringify(pl.json).includes('secret-endpoint') && pl.json.data.items.find((x) => x.id === 'syn-staff').push.deviceCount === 1, 'profiles.list: redacted too');
    const nt = await w(MGR, 'people.setNotes', { uid: 'syn-staff', notes: 'מגיעה בבקרים' });
    check(nt.status === 200 && !JSON.stringify(nt.json).includes('secret-endpoint') && nt.json.data.record.push.deviceCount === 1, 'a write\'s read-back of a profile is redacted too');
    const jobs0 = (await pushJobs()).length;
    ok(await w(OWNER, 'people.setRole', { uid: 'syn-staff2', role: 'manager' }), 'people.setRole staff → manager');
    const notes = await listCol('users/syn-staff2/notifications');
    const sys = notes.find((x) => x.kind === 'system' && x.title.startsWith('קיבלת תפקיד'));
    check(sys && sys.title === 'קיבלת תפקיד: מנהל/ת' && sys.sub.endsWith(' עדכן/ה את התפקיד שלך באפליקציה') && sys.by.uid === 'synthetic-owner' && sys.link === '/me' && sys.readAt === null && (await pushJobs()).length === jobs0, 'the person is told in the app (kind system, no phone push), as changeRole() does', sys);
    ok(await w(OWNER, 'people.setRole', { uid: 'syn-staff2', role: 'guest' }), 'to guest');
    check((await listCol('users/syn-staff2/notifications')).filter((x) => x.kind === 'system' && x.title.startsWith('קיבלת תפקיד')).length === 1, 'no notification on a move to guest');
    ok(await w(OWNER, 'people.setRole', { uid: 'syn-staff2', role: 'staff' }), 'back to staff');
    ok(await w(MGR, 'people.setRole', { uid: 'syn-vendor-other', role: 'guest' }), 'a vendor can be set back to guest');
    check((await docOf('users/syn-vendor-other')).log.at(-1).text === 'תפקיד: בעל דוכן ← אורח/ת', 'vendor role named in the log');
    check((await w(OWNER, 'people.setRole', { uid: 'syn-guest', role: 'vendor' })).status === 400, 'nobody is made a vendor here → 400');
    // delete
    check((await w(MGR, 'people.delete', { uid: 'syn-delete-me' })).status === 403, 'a manager cannot delete a person');
    check((await w(OWNER, 'people.delete', { uid: 'synthetic-owner' })).status === 403, 'the owner cannot delete themselves');
    check((await w(OWNER, 'people.delete', { uid: 'syn-owner-acct' })).status === 403, 'the farm\'s own owner account is never deleted');
    const del = await w(OWNER, 'people.delete', { uid: 'syn-delete-me' });
    check(del.status === 200 && del.json.data.verified && !(await docOf('users/syn-delete-me')) && !(await docOf('role_invites/delete.me@synthetic.invalid')), 'people.delete removes the profile and the role invite', del.json);
    const act = (await where('activity', 'refId', 'syn-delete-me'))[0];
    check(act && act.kind === 'user' && act.action === 'deleted' && act.text === 'למחיקה נמחק/ה מהאפליקציה' && act.subjectUid === 'syn-delete-me', 'activity user/deleted as the app writes it', act);
    // account deletion requests
    await seed('account_deletions/syn-guest', { uid: 'syn-guest', email: 'syn-guest@synthetic.invalid' }, { requestedAt: { timestampValue: now } });
    const ad = await r(MGR, '/v1/account-deletions');
    check(ad.status === 200 && ad.json.data.items[0]?.uid === 'syn-guest' && Date.parse(ad.json.data.items[0].requestedAt) === Date.parse(now), 'accountDeletions.list (managers)', ad.json);
    check((await r(STAFF, '/v1/account-deletions')).status === 403, 'staff cannot read account deletions');
  }

  section('visits, donations, the managers\' inbox');
  {
    const t0 = new Date().toISOString();
    await seed('visits/syn-v', { uid: 'syn-guest', name: 'אורחת', phone: '0500000000', date: '2026-12-20', people: 4, type: 'סיור בחווה', note: '', status: 'new', managerNote: '', handledBy: null, createdAt: t0, updatedAt: t0 });
    await seed('notifications/n-v', { type: 'visit', title: 'בקשת ביקור', text: 'x', link: '/manage/visits/syn-v', refId: 'syn-v', createdAt: t0, handled: false, handledBy: null, handledAt: null });
    ok(await w(MGR, 'visits.setStatus', { visitId: 'syn-v', status: 'approved', managerNote: 'נפגשים ב־9:30 בשער' }), 'visits.setStatus approved, hour from the note');
    check((await docOf('calendar/visit_syn-v')).time === '09:30' && (await docOf('notifications/n-v')).handled === true, 'calendar entry at 09:30 (timeFromNote), inbox item closed');
    const va = (await where('activity', 'refId', 'syn-v')).find((a) => a.action === 'approved');
    check(va.text === 'אורחת · 2026-12-20 · 09:30 · נפגשים ב־9:30 בשער', 'activity text with the time, as decideVisit() writes it', va.text);
    ok(await w(MGR, 'visits.setStatus', { visitId: 'syn-v', status: 'new' }), 'visits.setStatus back to new');
    const nv = await docOf('notifications/n-v');
    check(nv.handled === false && nv.handledBy === null && nv.handledAt === null && !(await docOf('calendar/visit_syn-v')), 'back to new: the inbox item returns to the queue, the calendar entry goes');
    ok(await w(MGR, 'visits.setStatus', { visitId: 'syn-v', status: 'cancelled' }), 'visits.setStatus cancelled');
    check((await docOf('visits/syn-v')).status === 'cancelled' && (await docOf('notifications/n-v')).handled === true, 'cancelled, inbox item closed');
    check((await w(STAFF, 'visits.delete', { visitId: 'syn-v' })).status === 403, 'staff cannot delete a visit');
    await seed('calendar/visit_syn-v', { title: 'ביקור', date: '2026-12-20', time: '', ownerUid: 'syn-mgr', ownerName: 'x', kind: 'visit', refId: 'syn-v', createdAt: t0 });
    const vd = await w(MGR, 'visits.delete', { visitId: 'syn-v' });
    check(vd.status === 200 && vd.json.data.verified && vd.json.data.inboxRemoved === 1 && !(await docOf('visits/syn-v')) && !(await docOf('calendar/visit_syn-v')) && !(await docOf('notifications/n-v')), 'visits.delete: the visit, its calendar entry and its inbox items', vd.json);
    check((await where('activity', 'refId', 'syn-v')).some((a) => a.action === 'deleted' && a.text === 'אורחת · 2026-12-20'), 'activity visit/deleted');

    await seed('donations/syn-d', { uid: 'syn-guest', name: 'אורחת', phone: '0500000000', amount: 180, label: 'חי', note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'claimed', createdAt: t0, updatedAt: t0 });
    await seed('notifications/n-d', { type: 'claim', title: 'תרומה הועברה', text: 'x', link: '/manage/donations/syn-d', refId: 'syn-d', createdAt: t0, handled: false, handledBy: null, handledAt: null });
    check((await w(MGR, 'donations.undoApproval', { donationId: 'syn-d' })).status === 400, 'undoApproval of a donation that is not paid → 400');
    ok(await w(MGR, 'donations.paymentNotArrived', { donationId: 'syn-d' }), 'donations.paymentNotArrived');
    check((await docOf('donations/syn-d')).paymentStatus === 'pending' && (await docOf('notifications/n-d')).handled === true, 'back to pending, inbox item closed');
    ok(await w(MGR, 'donations.setPayment', { donationId: 'syn-d', paymentStatus: 'paid' }), 'approved');
    const und = await w(MGR, 'donations.undoApproval', { donationId: 'syn-d' });
    ok(und, 'donations.undoApproval');
    check((await docOf('donations/syn-d')).paymentStatus === 'claimed' && (await docOf('notifications/n-d')).handled === false, 'back to claimed, inbox item reopened');
    check((await where('activity', 'refId', 'syn-d')).map((a) => a.action).sort().join() === 'edited,edited,paid', 'donation activity as setDonation() logs it');
    check((await w(STAFF, 'donations.delete', { donationId: 'syn-d' })).status === 403, 'staff cannot delete a donation');
    const dd = await w(MGR, 'donations.delete', { donationId: 'syn-d' });
    check(dd.status === 200 && !(await docOf('donations/syn-d')) && !(await docOf('notifications/n-d')) && (await where('activity', 'refId', 'syn-d')).some((a) => a.action === 'deleted' && a.text === 'אורחת · 180 ₪'), 'donations.delete with its inbox items and activity');

    await seed('notifications/n-c', { type: 'contact', title: 'פנייה', text: 'x', link: '/manage', refId: 'c1', createdAt: t0, handled: false, handledBy: null, handledAt: null });
    const nl = await r(MGR, '/v1/notifications?type=contact');
    check(nl.status === 200 && nl.json.data.items.map((x) => x.id).join() === 'n-c', 'notifications.list type=contact');
    check((await w(STAFF, 'notifications.delete', { notificationId: 'n-c' })).status === 403, 'staff cannot delete inbox items');
    ok(await w(MGR, 'notifications.delete', { notificationId: 'n-c' }), 'notifications.delete');
    check(!(await docOf('notifications/n-c')), 'gone');
  }

  section('settings');
  {
    const s0 = (await r(STAFF, '/v1/settings')).json.data.settings;
    check(s0.contact.phone === '' && s0.templates.paymentConfirmation.includes('[סכום]') && s0.donationOptions.custom === true && s0.contactMore.inquiries === true, 'settings.get defaults include contact, paymentConfirmation and the manage extras', s0);
    check((await w(MGR, 'settings.update', { paymentBit: '0501234567' })).status === 403 && !(await docOf('settings/app')), 'a manager cannot change payment details (owner only) and nothing is written');
    check((await w(MGR, 'settings.update', { donationPresets: ['50|קטן'] })).status === 403, 'a manager cannot change donation amounts (owner page)');
    ok(await w(MGR, 'settings.update', { msgPaymentConfirmation: 'קיבלנו [סכום], תודה [שם]', visitTypes: ['סיור', 'סדנה', 'סיור'] }), 'a manager changes a template and the visit types');
    let st = await docOf('settings/app');
    check(sameKeys(st, ['templates', 'visitTypes']) && st.templates.paymentConfirmation === 'קיבלנו [סכום], תודה [שם]' && st.templates.visitApproved.includes('[שם]') && st.visitTypes.join() === 'סיור,סדנה', 'merged like saveSettingsPart(): only those sections, templates saved whole', st);
    const sa = (await where('activity', 'refId', 'app')).find((a) => a.text.includes('סוגי הביקור')) || {};
    check(sa.kind === 'settings' && sa.action === 'saved' && sa.text.includes('הודעה מוכנה עודכנה: אישור תשלום') && sa.text.includes('סוגי הביקור עודכנו'), 'activity settings/saved with the section texts', sa.text);
    ok(await w(OWNER, 'settings.update', { paymentBit: '050-1234567', paymentPaybox: 'https://payboxapp.page.link/x', paymentNote: 'תודה' }), 'the owner sets the payment details');
    st = await docOf('settings/app');
    check(st.payment.bit === '050-1234567' && st.payment.bitNumber === '050-1234567' && st.payment.paybox === 'https://payboxapp.page.link/x' && st.payment.cash === true && st.payment.note === 'תודה' && st.visitTypes.join() === 'סיור,סדנה', 'payment as paymentPatch() writes it; the rest kept', st.payment);
    ok(await w(OWNER, 'settings.update', { paymentBit: '' }), 'Bit switched off');
    st = await docOf('settings/app');
    check(st.payment.bit === '' && st.payment.bitNumber === '050-1234567', 'off: the number is kept aside in bitNumber');
    check((await w(OWNER, 'settings.update', { paymentBit: '123' })).status === 400, 'a Bit number without 9-15 digits → 400');
    check((await w(MGR, 'settings.update', { contactWhatsapp: '123' })).status === 400, 'a bad WhatsApp number → 400');
    ok(await w(MGR, 'settings.update', { contactPhone: '050-0000001', contactEmail: 'farm@example.com', contactInquiries: false }), 'contact details');
    st = await docOf('settings/app');
    check(st.contact.phone === '050-0000001' && st.contact.whatsapp === '' && sameKeys(st.contact, ['phone', 'whatsapp']) && st.contactMore.email === 'farm@example.com' && st.contactMore.inquiries === false && st.contactMore.address === '', 'contact {phone, whatsapp} and contactMore saved together', st);
    ok(await w(OWNER, 'settings.update', { donationPresets: ['50|קטן', '180 | עשר פעמים חי'], donationMemorial: false }), 'donation amounts (owner)');
    st = await docOf('settings/app');
    check(st.donationPresets.map((p) => `${p.amount}:${p.label}`).join() === '50:קטן,180:עשר פעמים חי' && st.donationOptions.memorial === false && st.donationOptions.custom === true, 'presets parsed, options saved together', st.donationPresets);
    check((await w(OWNER, 'settings.update', { donationPresets: [], donationCustom: false })).status === 400, 'no amount and no free amount → 400');
    check((await w(OWNER, 'settings.update', { donationPresets: ['abc|x'] })).status === 400, 'an amount that is not a number → 400');
    // registration questions (G3)
    const q1 = await w(MGR, 'settings.saveQuestion', { label: 'מאיפה שמעת עלינו?', type: 'choice', options: ['חברים', 'פייסבוק'], required: true });
    check(q1.status === 201 && /^q[0-9a-z]+$/.test(q1.json.data.fieldId), 'settings.saveQuestion adds a question with a fieldId() id', q1.json);
    const q2 = await w(MGR, 'settings.saveQuestion', { label: 'תאריך לידה', type: 'date' });
    check((await w(MGR, 'settings.saveQuestion', { label: 'x', type: 'choice' })).status === 400, 'a choice question without options → 400');
    ok(await w(MGR, 'settings.saveQuestion', { fieldId: q1.json.data.fieldId, label: 'איך הגעת?', type: 'text' }), 'edit a question');
    st = await docOf('settings/app');
    check(st.registrationFields.length === 2 && sameKeys(st.registrationFields[0], ['id', 'label', 'type', 'options', 'required']) && st.registrationFields[0].label === 'איך הגעת?' && st.registrationFields[0].options.length === 0, 'stored as {id, label, type, options, required}', st.registrationFields);
    check((await w(MGR, 'settings.reorderQuestions', { order: [q2.json.data.fieldId] })).status === 400, 'reorder must name every question');
    ok(await w(MGR, 'settings.reorderQuestions', { order: [q2.json.data.fieldId, q1.json.data.fieldId] }), 'reorder');
    ok(await w(MGR, 'settings.removeQuestion', { fieldId: q1.json.data.fieldId }), 'remove');
    st = await docOf('settings/app');
    check(st.registrationFields.map((f) => f.id).join() === q2.json.data.fieldId && st.payment.bitNumber === '050-1234567', 'one question left; the rest of the settings untouched');
    check((await where('activity', 'refId', 'app')).some((a) => a.text === 'סדר שאלות ההרשמה שונה'), 'activity for the question order');
    check((await w(STAFF, 'settings.saveQuestion', { label: 'x' })).status === 403, 'staff cannot change questions');
  }

  section('assistant log (api_log, owners only)');
  {
    const logOf = async (rid) => { for (let i = 0; i < 30; i++) { const d = await docOf('api_log/' + rid); if (d) return d; await new Promise((res) => setTimeout(res, 100)); } return null; };
    const made = await w(MGR, 'calendar.create', { title: 'יומן בדיקה ללוג', date: addDays(todayIL, 5), kind: 'manual' });
    ok(made, 'a write to log');
    const L = await logOf(made.json.meta.requestId);
    check(L && L.keyLabel === 'האינסטינקט של הבדיקה' && L.credential === 'cred-v2-users' && L.actor.uid === 'syn-mgr' && L.actor.role === 'manager', 'the entry names the key (KEY_LABELS) and the person it acts as', L);
    check(L && L.kind === 'write' && L.op === 'calendar.create' && L.verb === 'יצר' && L.opHe && L.ok === true && L.status === made.status, 'operation, verb and outcome', L);
    check(L && JSON.parse(L.body).title === 'יומן בדיקה ללוג' && L.result.includes(made.json.data.itemId || made.json.data.refs?.[0]?.id) && L.refs.length > 0 && L.idempotencyKey, 'what was sent, what came back and the records touched', L);
    const pl = await w(MGR, 'places.add', { name: 'מקום ללוג', lat: 31.5, lng: 34.6 });
    const act = (await where('activity', 'refId', pl.json.data.placeId || pl.json.data.refs?.[0]?.id || pl.json.data.record?.id))[0];
    check(act && act.via && act.via.label === 'האינסטינקט של הבדיקה' && act.via.credential === 'cred-v2-users', 'the app\'s activity line says which key did it', act);
    const rd = await r(MGR, '/v1/calendar?limit=5');
    const LR = await logOf(rd.json.meta.requestId);
    check(LR && LR.kind === 'read' && LR.verb === 'קרא' && LR.op === 'calendar.list' && typeof LR.count === 'number' && LR.body === '' && LR.result === '' && LR.query === 'limit=5' && LR.ok, 'a read is logged with its parameters and a count, not its data', LR);
    const no = await w(STAFF, 'broadcasts.send', { text: 'לא אמור לעבור', audience: 'all' });
    const LF = await logOf(no.json.meta.requestId);
    check(no.status === 403 && LF && LF.ok === false && LF.code === 'FORBIDDEN' && LF.status === 403 && LF.message && LF.result === '' && LF.verb === 'שלח', 'a refused action is logged as failed, with the reason', LF);
    const own = await r(OWNER, '/v1/overview');
    const LO = await logOf(own.json.meta.requestId);
    check(LO && LO.keyLabel === 'אינסטינקט של בעלים', 'a key without a name is "אינסטינקט של <first name>"', LO?.keyLabel);
    const bad = await api('GET', '/v1/overview', { key: 'hr_' + 'x'.repeat(40) });
    await new Promise((res) => setTimeout(res, 600));
    check(bad.status === 401 && !(await docOf('api_log/' + bad.json.meta.requestId)), 'an unknown key is nobody\'s action: not logged');
    const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
    const { doc: d2, getDoc } = require('firebase/firestore');
    const env2 = await initializeTestEnvironment({ projectId: PROJECT + '-log', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
    try {
      await env2.withSecurityRulesDisabled(async (c) => {
        const db = c.firestore();
        await db.doc('users/o1').set({ uid: 'o1', role: 'owner', status: 'active', displayName: 'בעלים', email: 'o1@synthetic.invalid' });
        await db.doc('users/m1').set({ uid: 'm1', role: 'manager', status: 'active', displayName: 'מנהל', email: 'm1@synthetic.invalid' });
        await db.doc('api_log/x').set({ id: 'x', keyLabel: 'k' });
      });
      const claims = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
      const as2 = (uid) => env2.authenticatedContext(uid, claims(uid + '@synthetic.invalid')).firestore();
      let ownerReads = true, mgrBlocked = true, ownerCantWrite = true;
      try { await assertSucceeds(getDoc(d2(as2('o1'), 'api_log', 'x'))); } catch { ownerReads = false; }
      try { await assertFails(getDoc(d2(as2('m1'), 'api_log', 'x'))); } catch { mgrBlocked = false; }
      try { await assertFails(require('firebase/firestore').setDoc(d2(as2('o1'), 'api_log', 'y'), { id: 'y' })); } catch { ownerCantWrite = false; }
      check(ownerReads && mgrBlocked && ownerCantWrite, 'Rules: only owners read the log, and nobody writes it from the app', { ownerReads, mgrBlocked, ownerCantWrite });
    } finally { await env2.cleanup(); }
  }

  section('owners\' console (/v1/console, Google sign-in)');
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) { failures++; console.error('FIREBASE_AUTH_EMULATOR_HOST is not set; run with npm run test:api'); } else {
    const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
    const signUp = async (email) => (await (await fetch(`${authBase}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'synthetic-pass-1', returnSecureToken: true }) })).json());
    const now = new Date().toISOString();
    const acct = async (name, role, status = 'active') => {
      const a = await signUp(`console-${name}-${Date.now()}@synthetic.test`);
      await seed('users/' + a.localId, { uid: a.localId, email: a.email, displayName: name === 'owner' ? 'נועה בעלים' : name, phone: '', role, status, customerNumber: 1, acceptedTermsAt: now, notes: '', createdAt: now, updatedAt: now });
      return a;
    };
    const own = await acct('owner', 'owner'), mgr = await acct('manager', 'manager'), off = await acct('blocked-owner', 'owner', 'blocked');
    const C = (a) => ({ key: a.idToken, headers: { origin: 'http://localhost:5173' } });
    const me = await api('GET', '/v1/console/me', C(own));
    check(me.status === 200 && me.json.data.uid === own.localId && me.json.data.role === 'owner' && me.json.data.name === 'נועה בעלים', 'an owner signed in with Google gets in', me.json);
    check((await api('GET', '/v1/console/me', C(mgr))).status === 403, 'a manager is refused (403)');
    check((await api('GET', '/v1/console/me', C(off))).status === 403, 'a blocked owner is refused (403)');
    check((await api('GET', '/v1/console/me', {})).status === 401, 'no sign-in → 401');
    check((await api('GET', '/v1/console/me', { key: KEYS.owner })).status === 401, 'an API key does not open the console');
    const pre = await fetch(BASE + '/v1/console/keys', { method: 'OPTIONS', headers: { origin: 'https://havat-ravve.web.app', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    check(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://havat-ravve.web.app' && /authorization/.test(pre.headers.get('access-control-allow-headers') || ''), 'CORS preflight from the farm\'s site');
    const evil = await fetch(BASE + '/v1/console/me', { headers: { origin: 'https://evil.example', authorization: 'Bearer ' + own.idToken } });
    check(!evil.headers.get('access-control-allow-origin'), 'no CORS for another site');

    const ov = await api('GET', '/v1/console/overview', C(own));
    const o = ov.json?.data;
    check(ov.status === 200 && o.server.catalogVersion === '3.0.0' && typeof o.last24h.requests === 'number' && o.last24h.requests > 0 && typeof o.queues.pushPending === 'number' && o.switches.email.on === false && typeof o.switches.push.mode === 'string', 'overview: server, last 24 hours, queues, switches', o);

    const list0 = await api('GET', '/v1/console/keys', C(own));
    const k0 = list0.json?.data?.items || [];
    check(list0.status === 200 && k0.some((k) => k.id === 'cred-v2-users' && k.label === 'האינסטינקט של הבדיקה' && k.source === 'secret' && k.status === 'active') && !JSON.stringify(k0).includes('sha256'), 'keys: the secret\'s keys are listed with names, never their hashes', k0);
    check((await api('GET', '/v1/console/keys', C(mgr))).status === 403, 'a manager cannot list keys');

    const bad = await api('POST', '/v1/console/keys', { ...C(own), body: { label: 'מפתח', actor: 'user:syn-guest' } });
    check(bad.status === 400, 'a key must act as an active team member (a guest is refused)', bad.json);
    const mk = await api('POST', '/v1/console/keys', { ...C(own), body: { label: 'האינסטינקט של מנהלת', actor: 'user:syn-mgr' } });
    const newId = mk.json?.data?.id, newKey1 = mk.json?.data?.key;
    check(mk.status === 201 && /^cred-/.test(newId) && /^hr_[A-Za-z0-9_-]{40,}$/.test(newKey1), 'create: an id and the key, once', mk.json);
    const use1 = await api('GET', '/v1/overview', { key: newKey1 });
    check(use1.status === 200, 'the new key works right away', use1.json);
    const logOf = async (rid) => { for (let i = 0; i < 30; i++) { const d = await docOf('api_log/' + rid); if (d) return d; await new Promise((res) => setTimeout(res, 100)); } return null; };
    const LU = await logOf(use1.json.meta.requestId);
    check(LU && LU.credential === newId && LU.keyLabel === 'האינסטינקט של מנהלת' && LU.actor.uid === 'syn-mgr' && LU.actor.role === 'manager', 'the new key is logged under its name, as the person it acts as', LU);
    const LC = await logOf(mk.json.meta.requestId);
    check(LC && LC.op === 'console.keys.create' && LC.keyLabel === 'קונסולה · נועה' && LC.actor.uid === own.localId && !JSON.stringify(LC).includes(newKey1) && LC.result.includes(newId), 'creating a key is logged as the console, without the key itself', LC);
    const listed = (await api('GET', '/v1/console/keys', C(own))).json.data.items.find((k) => k.id === newId);
    check(listed && listed.source === 'console' && listed.actors[0] === 'user:syn-mgr' && listed.createdBy === 'נועה בעלים' && listed.status === 'active', 'the new key is listed', listed);

    const ren = await api('POST', `/v1/console/keys/${newId}/rename`, { ...C(own), body: { label: 'אינסטינקט ניסוי' } });
    const LU2 = await logOf((await api('GET', '/v1/overview', { key: newKey1 })).json.meta.requestId);
    check(ren.status === 200 && LU2?.keyLabel === 'אינסטינקט ניסוי', 'rename: the log uses the new name', LU2?.keyLabel);
    const rot = await api('POST', `/v1/console/keys/${newId}/rotate`, { ...C(own), body: { graceHours: 1 } });
    const newKey2 = rot.json?.data?.key;
    check(rot.status === 200 && newKey2 && newKey2 !== newKey1, 'rotate: a new key, once', rot.json);
    const oldStill = await api('GET', '/v1/overview', { key: newKey1 });
    check(oldStill.status === 200 && oldStill.json.meta.keyVersion === 'previous' && (await api('GET', '/v1/overview', { key: newKey2 })).status === 200, 'during the grace period both keys work (the old one says "previous")', oldStill.json?.meta);
    const rot0 = await api('POST', `/v1/console/keys/${newId}/rotate`, { ...C(own), body: { graceHours: 0 } });
    const newKey3 = rot0.json?.data?.key;
    check((await api('GET', '/v1/overview', { key: newKey2 })).status === 401 && (await api('GET', '/v1/overview', { key: newKey3 })).status === 200, 'rotate with no grace: only the newest key works');
    const rv = await api('POST', `/v1/console/keys/${newId}/revoke`, { ...C(own), body: {} });
    const after = await api('GET', '/v1/overview', { key: newKey3 });
    check(rv.status === 200 && after.status === 401, 'revoke: the key stops working', after.json);
    check((await api('GET', '/v1/console/keys', C(own))).json.data.items.find((k) => k.id === newId)?.status === 'revoked', 'listed as revoked');
    await api('POST', `/v1/console/keys/${newId}/restore`, { ...C(own), body: {} });
    check((await api('GET', '/v1/overview', { key: newKey3 })).status === 200, 'restore: it works again');
    const past = await api('POST', `/v1/console/keys/${newId}/expire`, { ...C(own), body: { expiresAt: new Date(Date.now() - 60_000).toISOString() } });
    check(past.status === 200 && (await api('GET', '/v1/overview', { key: newKey3 })).status === 401 && (await api('GET', '/v1/console/keys', C(own))).json.data.items.find((k) => k.id === newId)?.status === 'expired', 'expire: past the date it stops working, listed as expired');
    await api('POST', `/v1/console/keys/${newId}/expire`, { ...C(own), body: { expiresAt: null } });
    check((await api('GET', '/v1/overview', { key: newKey3 })).status === 200, 'clearing the date: it works again');
    // a key from the secret can be renamed (copied into the console's record); the secret's own key keeps working
    const rs = await api('POST', '/v1/console/keys/cred-v2-users/rename', { ...C(own), body: { label: 'הבדיקה, שם חדש' } });
    const LS = await logOf((await r(MGR, '/v1/overview')).json.meta.requestId);
    check(rs.status === 200 && LS?.keyLabel === 'הבדיקה, שם חדש', 'a key from the secret can be renamed from the console, and keeps working', LS?.keyLabel);
    await api('POST', '/v1/console/keys/cred-v2-users/rename', { ...C(own), body: { label: 'האינסטינקט של הבדיקה' } });
    check((await api('POST', '/v1/console/keys/nope-nope/revoke', { ...C(own), body: {} })).status === 404, 'an unknown key → 404');
    check((await api('POST', `/v1/console/keys/${newId}/revoke`, { ...C(mgr), body: {} })).status === 403, 'a manager cannot change keys');

    // any operation, as the signed-in owner, without a key
    const pa = await api('POST', '/v1/console/api/actions/places.add', { ...C(own), idem: randomUUID(), body: { name: 'מקום מהקונסולה', lat: 31.5, lng: 34.6 } });
    const placeId = pa.json?.data?.placeId || pa.json?.data?.refs?.[0]?.id || pa.json?.data?.record?.id;
    check(pa.status === 201 || pa.status === 200, 'console: an action runs as the owner', pa.json);
    const LP = await logOf(pa.json.meta.requestId);
    check(LP && LP.op === 'places.add' && LP.keyLabel === 'קונסולה · נועה' && LP.path === '/v1/actions/places.add' && LP.actor.uid === own.localId, 'logged as "קונסולה · <first name>", with the API path', LP);
    const actP = (await where('activity', 'refId', placeId))[0];
    check(actP && actP.via?.label === 'קונסולה · נועה' && actP.by?.uid === own.localId, 'the app\'s activity line says it came from the console', actP);
    const rd = await api('GET', '/v1/console/api/tasks', C(own));
    check(rd.status === 200 && Array.isArray(rd.json.data.items), 'console: a read runs too', rd.json?.error);
    await new Promise((res) => setTimeout(res, 600));
    check(!(await docOf('api_log/' + rd.json.meta.requestId)) && !(await docOf('api_log/' + ov.json.meta.requestId)), 'the console\'s own reads are not logged (only what it did)');
    check((await api('GET', '/v1/console/api/people', C(mgr))).status === 403, 'a manager cannot use the console\'s API either');
  }

  section('the app\'s Rules accept what the API wrote');
  {
    const { initializeTestEnvironment, assertSucceeds } = require('@firebase/rules-unit-testing');
    require('firebase/compat/firestore');
    const { doc, setDoc, getDocs, collection } = require('firebase/firestore');
    rulesEnv = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
    const claims = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const as = (uid) => rulesEnv.authenticatedContext(uid, claims(uid + '@synthetic.invalid')).firestore();
    const mgr = as('syn-mgr'), staff = as('syn-staff');
    const tries = [];
    const tryIt = async (label, p) => { try { await assertSucceeds(p); tries.push(true); } catch (e) { tries.push(false); console.error('  Rules rejected', label, String(e).slice(0, 220)); } };
    const { id: _p, ...pres } = (await where('calendar', 'ownerUid', 'syn-staff')).find((x) => x.kind === 'presence');
    await tryIt('presence (volunteer creates it)', setDoc(doc(staff, 'calendar', 'copy-presence'), pres));
    const cal = await docOf('calendar/' + itemId);
    await tryIt('team calendar item (manager)', setDoc(doc(mgr, 'calendar', 'copy-item'), cal));
    await tryIt('staff reads the calendar', getDocs(collection(staff, 'calendar')));
    const b = await docOf('broadcasts/' + bAll);
    await tryIt('broadcast (manager)', setDoc(doc(mgr, 'broadcasts', 'copyb'), { ...b, id: 'copyb', resentAt: null }));
    const bn = await docOf(`users/syn-staff/notifications/b_${bAll}`);
    await tryIt('broadcast notification (manager)', setDoc(doc(mgr, 'users', 'syn-staff2', 'notifications', 'copyn'), { ...bn, id: 'copyn', readAt: null }));
    const job = (await pushJobs()).find((j) => j.refId === bAll);
    const { id: _j, ...jobData } = job;
    await tryIt('push job (manager)', setDoc(doc(mgr, 'push_jobs', 'copyjob'), { ...jobData, id: 'copyjob' }));
    await tryIt('settings/app rewritten unchanged by a manager', setDoc(doc(mgr, 'settings', 'app'), await docOf('settings/app')));
    check(tries.length === 7 && tries.every(Boolean), `the app's Rules accept every shape (${tries.filter(Boolean).length}/7)`);
  }
} catch (e) {
  failures++;
  console.error(e);
} finally {
  if (rulesEnv) await rulesEnv.cleanup().catch(() => {});
  await stopWorker(worker);
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
