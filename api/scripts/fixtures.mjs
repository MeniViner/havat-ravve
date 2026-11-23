// Test fixtures for what the assistant cannot create through the API (guests, vendors and the app create these),
// so it can exercise every operation end to end on production without touching real people:
//   - a fake team member "INSTINCT TEST עובד" (staff, active): the target for people.*, assigning, stations,
//     notifications.send and farmToday broadcasts, so notifications land on a fake account, never a real one;
//   - a paid draft event (never published) with two unpaid guest orders, a stall and an open stall request;
//   - a donation (1 ₪, never charged), a visit request, and their items in the managers' inbox;
//   - one notification in Meni's own bell (for me.notifications.markRead);
//   - an inactive join code (nobody can join with it).
// Every name says "INSTINCT TEST" and the guests and the vendor are fake uids with no profile, so the payment
// email job skips them (it needs a profile with an email preference).
//
//   GOOGLE_TOKEN=$(gcloud auth print-access-token --configuration havat-ravve) PROJECT=havat-ravve MENI_UID=<uid> \
//     node api/scripts/fixtures.mjs create
//   ... node api/scripts/fixtures.mjs delete          deletes the fixtures, the fake accounts' notifications and their activity
//   ... node api/scripts/fixtures.mjs sweep [--delete] lists (or deletes) anything left that says INSTINCT, anywhere
//
// MENI_UID may also come from MENI_ACTOR=user:<uid>. The ids are kept in api/.fixtures.local.json (git-ignored).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { GOOGLE_TOKEN, PROJECT } = process.env;
const MENI_UID = process.env.MENI_UID || String(process.env.MENI_ACTOR || '').replace(/^user:/, '');
if (!GOOGLE_TOKEN || !PROJECT) { console.error('GOOGLE_TOKEN and PROJECT are required'); process.exit(2); }
const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.fixtures.local.json');
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const API = 'https://firestore.googleapis.com/v1/';
const H = { authorization: 'Bearer ' + GOOGLE_TOKEN, 'content-type': 'application/json' };
const enc = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const id = () => randomBytes(15).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
const TAG = 'INSTINCT';
const FAKE_UIDS = ['instinct-test-staff', 'instinct-test-guest', 'instinct-test-vendor'];

async function put(path, data) {
  const r = await fetch(`${API}${ROOT}/${path}?currentDocument.exists=false`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}
const del = async (name) => (await fetch(API + name, { method: 'DELETE', headers: H })).ok;
/** Every document directly under `parent` (a full resource name) in collection `col`, missing parents included. */
async function listAll(parent, col) {
  const out = []; let page = '';
  do {
    const r = await fetch(`${API}${parent}/${col}?pageSize=300&showMissing=true${page ? '&pageToken=' + page : ''}`, { headers: H }).then((x) => x.json());
    out.push(...(r.documents || [])); page = r.nextPageToken || '';
  } while (page);
  return out;
}
async function subCollections(name) {
  const r = await fetch(`${API}${name}:listCollectionIds`, { method: 'POST', headers: H, body: '{}' }).then((x) => x.json());
  return r.collectionIds || [];
}
async function activityFor(ref) {
  const rows = await fetch(`${API}${ROOT}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'activity' }], where: { fieldFilter: { field: { fieldPath: 'refId' }, op: 'EQUAL', value: { stringValue: ref } } } } }) }).then((r) => r.json());
  return rows.filter((x) => x.document).map((x) => x.document.name);
}

const cmd = process.argv[2];
if (cmd === 'create') {
  if (existsSync(FILE)) { console.error('fixtures already exist; run delete first'); process.exit(1); }
  if (!MENI_UID) { console.error('MENI_UID (or MENI_ACTOR=user:<uid>) is required'); process.exit(2); }
  const now = new Date().toISOString();
  const admin = { uid: 'instinct-test-admin', name: 'INSTINCT TEST' };
  const guest = { uid: 'instinct-test-guest', name: 'INSTINCT TEST אורח' };
  const staff = { uid: 'instinct-test-staff', name: 'INSTINCT TEST עובד' };
  const vendorActor = { uid: 'instinct-test-vendor', name: 'INSTINCT TEST בעל דוכן' };
  const ev = id(), ordA = id(), ordB = id(), don = id(), visit = id(), vend = id(), vreq = id(), bell = 'instinct-test-' + id();
  const code = 'ITEST' + randomBytes(2).toString('hex').toUpperCase();
  const title = 'INSTINCT TEST · אירוע בדיקה';
  const paths = [];
  const P = async (p, d) => { await put(p, d); paths.push(p); };

  await P(`users/${staff.uid}`, { uid: staff.uid, email: '', displayName: staff.name, phone: '0500000001', role: 'staff', status: 'active', customerNumber: 0, acceptedTermsAt: now, notes: 'INSTINCT TEST: חשבון מדומה לבדיקה', createdAt: now, updatedAt: now });
  await P(`events/${ev}`, { title, description: 'TEST ONLY', image: '', location: 'חוות רווה', start: '2027-02-01T08:00:00.000Z', end: '2027-02-01T10:00:00.000Z', price: 20, maxPerOrder: 5, capacity: 0, open: false, published: false, entry: true, stall: true, questions: [], files: [], createdBy: admin, createdAt: now, updatedAt: now });
  const ticket = (order, i, total) => ({ eventId: ev, eventTitle: title, orderId: order, index: i, total, ownerUid: guest.uid, ownerName: guest.name, ownerPhone: '0500000000', holderName: '', secret: randomBytes(12).toString('hex'), price: 20, paymentStatus: 'pending', status: 'valid', scans: [], entries: 0, answers: {}, createdAt: now, updatedAt: now });
  const tA = [id(), id()], tB = [id()];
  for (const [i, t] of tA.entries()) await P(`tickets/${t}`, ticket(ordA, i + 1, 2));
  await P(`tickets/${tB[0]}`, ticket(ordB, 1, 1));
  await P(`vendors/${vend}`, { name: 'INSTINCT TEST דוכן', phone: '0500000002', product: 'בדיקה', external: true, notes: '', contact: vendorActor.name, sells: 'בדיקה', events: [ev], people: [], createdAt: now, updatedAt: now });
  await P(`vendors/${vend}/private/main`, { notes: 'INSTINCT TEST: הערה פרטית', updatedAt: now });
  await P(`events/${ev}/vendors/${vend}`, { vendorId: vend, name: 'INSTINCT TEST דוכן', confirmed: true, notes: '', status: 'confirmed', invitedAt: now, answeredAt: now });
  await P(`events/${ev}/vendor_requests/${vreq}`, { eventId: ev, vendorId: vend, vendorName: 'INSTINCT TEST דוכן', kind: 'water', text: 'INSTINCT TEST: צריך מים', by: vendorActor, createdAt: now, takenBy: null, closedAt: null });
  await P(`donations/${don}`, { uid: guest.uid, name: guest.name, phone: '0500000000', amount: 1, label: 'INSTINCT TEST', note: 'TEST ONLY, never charged', memorial: '', receiptWanted: true, receiptName: guest.name, receiptSent: false, paymentStatus: 'claimed', createdAt: now, updatedAt: now });
  const nDon = id(), nVisit = id();
  await P(`notifications/${nDon}`, { type: 'donation', title: 'תרומה חדשה (INSTINCT TEST)', text: `${guest.name} · 1 ₪`, link: `/manage/donations/${don}`, refId: don, createdAt: now, handled: false, handledBy: null, handledAt: null });
  await P(`visits/${visit}`, { uid: guest.uid, name: guest.name, phone: '0500000000', date: '2027-02-03', people: 4, type: 'INSTINCT TEST', note: 'INSTINCT TEST 10:00', status: 'new', managerNote: '', handledBy: null, createdAt: now, updatedAt: now });
  await P(`notifications/${nVisit}`, { type: 'visit', title: 'בקשת ביקור חדשה (INSTINCT TEST)', text: `${guest.name} · 4 אנשים`, link: `/manage/visits/${visit}`, refId: visit, createdAt: now, handled: false, handledBy: null, handledAt: null });
  await P(`users/${MENI_UID}/notifications/${bell}`, { id: bell, kind: 'system', title: 'INSTINCT TEST: התראה לבדיקה', sub: 'אפשר לסמן כנקראה', link: '/farm', refId: '', by: admin, createdAt: now, readAt: null });
  await P(`invites/${code}`, { code, role: 'staff', active: false, createdBy: admin, createdAt: now, usedBy: [] });

  const out = {
    fakeStaffUid: staff.uid, eventId: ev, orderA: { orderId: ordA, ticketIds: tA }, orderB: { orderId: ordB, ticketIds: tB },
    vendorId: vend, vendorRequestId: vreq, donationId: don, visitId: visit, inbox: { donation: nDon, visit: nVisit },
    meniNotificationId: bell, joinCode: code, refs: [ev, ordA, ordB, ...tA, ...tB, don, visit, vend, vreq, staff.uid], paths,
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  const { refs: _r, paths: _p, ...show } = out;
  console.log(JSON.stringify(show, null, 2));
} else if (cmd === 'delete') {
  if (!existsSync(FILE)) { console.error('no fixtures recorded'); process.exit(1); }
  const f = JSON.parse(readFileSync(FILE, 'utf8'));
  let docs = 0, acts = 0, bells = 0;
  for (const p of [...f.paths].reverse()) if (await del(`${ROOT}/${p}`)) docs++;
  for (const uid of FAKE_UIDS) for (const d of await listAll(`${ROOT}/users/${uid}`, 'notifications')) if (await del(d.name)) bells++;
  for (const ref of f.refs) for (const name of await activityFor(ref)) if (await del(name)) acts++;
  unlinkSync(FILE);
  console.log(`deleted ${docs} fixture documents, ${bells} notifications of the fake accounts and ${acts} activity entries`);
} else if (cmd === 'sweep') {
  // Reads every document of the collections the API writes (the farm's data is small) and reports the ones whose
  // content says INSTINCT, plus everything under an INSTINCT event (events.delete leaves an event's subcollections).
  const remove = process.argv.includes('--delete');
  const hits = [];
  const has = (d) => JSON.stringify(d.fields || {}).includes(TAG);
  const TOP = ['tasks', 'task_templates', 'shopping', 'shopping_trips', 'places', 'projects', 'calendar', 'broadcasts', 'notifications', 'push_jobs',
    'tickets', 'tabs', 'donations', 'visits', 'vendors', 'vendor_invites', 'invites', 'role_invites', 'email_outbox', 'activity'];
  for (const col of TOP) for (const d of await listAll(ROOT, col)) {
    if (has(d)) hits.push(d.name);
    if (col === 'vendors' || col === 'broadcasts') if (has(d) || !d.fields) for (const sub of await subCollections(d.name)) for (const s of await listAll(d.name, sub)) hits.push(s.name);
  }
  for (const e of await listAll(ROOT, 'events')) {
    const mine = !e.fields || has(e);
    if (mine && e.fields) hits.push(e.name);
    for (const sub of await subCollections(e.name)) for (const s of await listAll(e.name, sub)) if (mine || has(s)) hits.push(s.name);
  }
  for (const u of await listAll(ROOT, 'users')) {
    if (FAKE_UIDS.includes(u.name.split('/').pop())) { if (u.fields) hits.push(u.name); for (const n of await listAll(u.name, 'notifications')) hits.push(n.name); continue; }
    for (const n of await listAll(u.name, 'notifications')) if (has(n)) hits.push(n.name);
  }
  const settings = await listAll(ROOT, 'settings');
  for (const s of settings) if (has(s)) console.log('settings still mention INSTINCT (restore by hand, not deleted):', s.name.split('/documents/')[1]);
  const rel = [...new Set(hits)].map((n) => n.split('/documents/')[1]);
  console.log(rel.length ? rel.join('\n') : 'nothing left');
  if (remove && rel.length) { let n = 0; for (const h of [...new Set(hits)]) if (await del(h)) n++; console.log(`deleted ${n}`); }
} else {
  console.error('usage: fixtures.mjs create | delete | sweep [--delete]'); process.exit(2);
}
