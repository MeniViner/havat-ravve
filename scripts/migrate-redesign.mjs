// Redesign v2 data migration. Safe to run again: every step checks the current state first and skips what is already done.
// Dry run by default (prints what it would do); pass --apply to write.
//
//   Emulator:   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-redesign.mjs [--project=demo-havat-ravve] [--apply]
//   Production: ACCESS_TOKEN="$(gcloud auth print-access-token)" node scripts/migrate-redesign.mjs --project=havat-ravve [--apply]
//               (Meni runs this, signed in to gcloud with an account that has Firestore access; see docs/migration-redesign.md)
//
// Steps:
//   1. vendors/{id}.notes (the team's notes) -> vendors/{id}/private/main.notes, then blank vendors/{id}.notes.
//      Vendors can read their own vendors/{id} after the redesign, so the team's notes must not stay there.
//   2. Report only: events/{eid}/vendors/{vid} records that still carry a non-empty `notes` (a vendor can read its own record).
import process from 'node:process';

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const APPLY = args.includes('--apply');
const emu = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = opt('project', emu ? 'demo-havat-ravve' : '');
if (!PROJECT) { console.error('Pass --project=<id>.'); process.exit(1); }
if (!emu && !process.env.ACCESS_TOKEN) { console.error('Set ACCESS_TOKEN (gcloud auth print-access-token) or FIRESTORE_EMULATOR_HOST.'); process.exit(1); }
const BASE = emu ? `http://${emu}/v1/projects/${PROJECT}/databases/(default)/documents` : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const headers = { 'content-type': 'application/json', authorization: `Bearer ${emu ? 'owner' : process.env.ACCESS_TOKEN}` };

async function api(method, url, body) {
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${method} ${url.replace(BASE, '')}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function list(path) {
  const out = []; let token = '';
  do {
    const j = await api('GET', `${BASE}/${path}?pageSize=300${token ? `&pageToken=${token}` : ''}`);
    out.push(...(j?.documents || [])); token = j?.nextPageToken || '';
  } while (token);
  return out;
}
const str = (doc, f) => doc?.fields?.[f]?.stringValue ?? '';
const idOf = (doc) => doc.name.split('/').pop();
const now = new Date().toISOString();

let changed = 0, skipped = 0;
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} on ${emu ? 'emulator ' + emu : 'project ' + PROJECT}\n`);

// 1. vendor notes -> private
for (const v of await list('vendors')) {
  const id = idOf(v); const notes = str(v, 'notes').trim();
  if (!notes) { skipped++; continue; }
  const priv = await api('GET', `${BASE}/vendors/${id}/private/main`);
  const have = str(priv, 'notes').trim();
  const merged = !have ? notes : have.includes(notes) ? have : `${have}\n${notes}`;
  console.log(`vendors/${id}: move notes (${notes.length} chars) to private/main${have ? ' (merged with existing)' : ''}`);
  if (APPLY) {
    await api('PATCH', `${BASE}/vendors/${id}/private/main?updateMask.fieldPaths=notes&updateMask.fieldPaths=updatedAt`, { fields: { notes: { stringValue: merged }, updatedAt: { stringValue: now } } });
    await api('PATCH', `${BASE}/vendors/${id}?updateMask.fieldPaths=notes&updateMask.fieldPaths=updatedAt`, { fields: { notes: { stringValue: '' }, updatedAt: { stringValue: now } } });
  }
  changed++;
}

// 2. report event-level vendor notes
for (const e of await list('events')) {
  const eid = idOf(e);
  for (const ev of await list(`events/${eid}/vendors`)) {
    const n = str(ev, 'notes').trim();
    if (n) console.log(`report: events/${eid}/vendors/${idOf(ev)} has notes (${n.length} chars) the vendor will be able to read`);
  }
}

console.log(`\n${changed} to change${APPLY ? ' (done)' : ''}, ${skipped} vendors already clean.${APPLY ? '' : ' Run again with --apply to write.'}`);
