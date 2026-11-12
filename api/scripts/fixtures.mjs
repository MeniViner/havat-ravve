// Test fixtures for what only guests create in the app (tickets, donations) and join codes, so the
// assistant can exercise those operations end to end. Everything is named "INSTINCT TEST", belongs to a
// fake guest uid, costs nothing (free event, 1 ₪ donation that is never charged), and the join code is
// inactive, so nobody can use it to join.
//
//   GOOGLE_TOKEN=$(gcloud auth print-access-token) PROJECT=havat-ravve node api/scripts/fixtures.mjs create
//   GOOGLE_TOKEN=... PROJECT=havat-ravve node api/scripts/fixtures.mjs delete   (also deletes their activity)
//
// The ids are kept in api/.fixtures.local.json (git-ignored) between create and delete.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { GOOGLE_TOKEN, PROJECT } = process.env;
if (!GOOGLE_TOKEN || !PROJECT) { console.error('GOOGLE_TOKEN and PROJECT are required'); process.exit(2); }
const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.fixtures.local.json');
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { authorization: 'Bearer ' + GOOGLE_TOKEN, 'content-type': 'application/json' };
const enc = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const id = () => randomBytes(15).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
async function put(path, data) {
  const r = await fetch(`${DOCS}/${path}?currentDocument.exists=false`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const cmd = process.argv[2];
if (cmd === 'create') {
  if (existsSync(FILE)) { console.error('fixtures already exist; run delete first'); process.exit(1); }
  const now = new Date().toISOString();
  const guest = { uid: 'instinct-test-guest', name: 'INSTINCT TEST אורח' };
  const ev = id(), ordA = id(), ordB = id(), don = id(), code = 'ITEST' + randomBytes(2).toString('hex').toUpperCase();
  const paths = [];
  const P = async (p, d) => { await put(p, d); paths.push(p); };
  await P(`events/${ev}`, { title: 'INSTINCT TEST · אירוע בדיקה', description: 'TEST ONLY', image: '', location: 'חוות רווה', start: '2027-02-01T10:00', end: '2027-02-01T12:00', price: 0, maxPerOrder: 5, capacity: 0, open: false, published: false, questions: [], files: [], createdBy: { uid: 'instinct-test-admin', name: 'INSTINCT TEST' }, createdAt: now, updatedAt: now });
  const ticket = (order, i, total) => ({ eventId: ev, eventTitle: 'INSTINCT TEST · אירוע בדיקה', orderId: order, index: i, total, ownerUid: guest.uid, ownerName: guest.name, ownerPhone: '0500000000', holderName: '', secret: randomBytes(12).toString('hex'), price: 0, paymentStatus: 'free', status: 'valid', scans: [], entries: 0, answers: {}, createdAt: now, updatedAt: now });
  const tA = [id(), id()], tB = [id()];
  for (const [i, t] of tA.entries()) await P(`tickets/${t}`, ticket(ordA, i + 1, 2));
  await P(`tickets/${tB[0]}`, ticket(ordB, 1, 1));
  await P(`donations/${don}`, { uid: guest.uid, name: guest.name, phone: '0500000000', amount: 1, label: 'INSTINCT TEST', note: 'TEST ONLY, never charged', memorial: '', receiptWanted: true, receiptName: guest.name, receiptSent: false, paymentStatus: 'pending', createdAt: now, updatedAt: now });
  const n = id();
  await P(`notifications/${n}`, { type: 'donation', title: 'תרומה חדשה (INSTINCT TEST)', text: `${guest.name} · 1 ₪`, link: `/manage/donations/${don}`, refId: don, createdAt: now, handled: false, handledBy: null, handledAt: null });
  await P(`invites/${code}`, { code, role: 'staff', active: false, createdBy: { uid: 'instinct-test-admin', name: 'INSTINCT TEST' }, createdAt: now, usedBy: [] });
  const out = { eventId: ev, orderA: { orderId: ordA, ticketIds: tA }, orderB: { orderId: ordB, ticketIds: tB }, donationId: don, donationNotificationId: n, joinCode: code, refs: [ev, ordA, ordB, ...tA, ...tB, don], paths };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  const { refs: _r, paths: _p, ...show } = out;
  console.log(JSON.stringify(show, null, 2));
} else if (cmd === 'delete') {
  if (!existsSync(FILE)) { console.error('no fixtures recorded'); process.exit(1); }
  const f = JSON.parse(readFileSync(FILE, 'utf8'));
  let docs = 0, acts = 0;
  for (const p of f.paths) if ((await fetch(`${DOCS}/${p}`, { method: 'DELETE', headers: H })).ok) docs++;
  for (const ref of f.refs) {
    const rows = await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'activity' }], where: { fieldFilter: { field: { fieldPath: 'refId' }, op: 'EQUAL', value: { stringValue: ref } } } } }) }).then((r) => r.json());
    for (const row of rows) if (row.document && (await fetch(`https://firestore.googleapis.com/v1/${row.document.name}`, { method: 'DELETE', headers: H })).ok) acts++;
  }
  unlinkSync(FILE);
  console.log(`deleted ${docs} fixture documents and ${acts} activity entries`);
} else {
  console.error('usage: fixtures.mjs create | delete'); process.exit(2);
}
