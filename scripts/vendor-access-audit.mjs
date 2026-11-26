// Review legacy vendor access. Report and cleanup preview are read-only. See docs/redesign-data/vendor.md.
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  project: { type: 'string' },
  cleanup: { type: 'boolean' },
  apply: { type: 'boolean' },
} });
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const project = values.project || (emulator ? 'demo-havat-ravve' : '');
const credential = emulator ? 'owner' : process.env.ACCESS_TOKEN;
if (!/^[a-z][a-z0-9-]{3,62}$/.test(project) || !credential || (values.apply && !values.cleanup)) {
  console.error('Pass --project and ACCESS_TOKEN (or use FIRESTORE_EMULATOR_HOST). To write, pass --cleanup --apply.');
  process.exit(1);
}
const database = `projects/${project}/databases/(default)`;
const base = `${emulator ? 'http://' + emulator : 'https://firestore.googleapis.com'}/v1/${database}/documents`;
const name = (path) => database + '/documents/' + path;
const string = (doc, field) => doc?.fields?.[field]?.stringValue || '';
const bool = (doc, field) => doc?.fields?.[field]?.booleanValue;
const idOf = (doc) => doc.name.split('/').at(-1);
const validId = (id) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
const validCode = (code) => /^[a-z0-9-]{8,40}$/.test(code);

async function request(method, suffix, body) {
  const r = await fetch(base + suffix, {
    method, headers: { authorization: 'Bearer ' + credential, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.ok) return r.json();
  if (r.status === 404 && method === 'GET') return null;
  const error = await r.json().catch(() => null);
  throw Object.assign(new Error(`Firestore ${method} ${r.status} ${error?.error?.status || ''}`), { status: error?.error?.status });
}

function accessState(profile, stall, invite) {
  const uid = idOf(profile);
  const vendorId = string(profile, 'vendorId');
  const code = string(profile, 'inviteCode');
  const helper = bool(profile, 'helper') === true;
  if (!validId(vendorId) || string(profile, 'uid') !== uid) return { finding: 'missing-identity', eligible: false };
  const list = stall?.fields?.people?.arrayValue;
  if (stall && !list) return { finding: 'unverifiable-stall-list', eligible: false };
  const rows = list?.values || [];
  const people = rows.map((row) => row.mapValue);
  const match = people.filter((row) => string(row, 'uid') === uid || (code && string(row, 'code') === code));
  if (match.length === 1) {
    const row = match[0];
    const rowUid = string(row, 'uid');
    const rowCode = string(row, 'code');
    if ((!rowUid || rowUid === uid) && (!rowCode || !code || rowCode === code) && string(row, 'role') === (helper ? 'helper' : 'owner')) return null;
  }
  if (match.length || people.some((row) => !row || (!string(row, 'uid') && !string(row, 'code')))) {
    return { finding: 'ambiguous-stall-rows', eligible: false };
  }
  return {
    finding: stall ? 'person-missing' : 'stall-missing',
    eligible: helper && validCode(code) && string(invite, 'code') === code && string(invite, 'role') === 'helper'
      && string(invite, 'vendorId') === vendorId && string(invite, 'usedBy') === uid && bool(invite, 'active') === false,
  };
}

async function inspect(profile, read) {
  const vendorId = string(profile, 'vendorId');
  const code = string(profile, 'inviteCode');
  if (!validId(vendorId)) return accessState(profile, null, null);
  const stall = await read('vendors/' + vendorId);
  const initial = accessState(profile, stall, null);
  if (!initial || !bool(profile, 'helper') || !validCode(code) || !['person-missing', 'stall-missing'].includes(initial.finding)) return initial;
  return accessState(profile, stall, await read('vendor_invites/' + code));
}

// Re-read each candidate and its references inside a transaction. A later re-invite or row change cannot be overwritten.
async function cleanup(uid) {
  const { transaction } = await request('POST', ':beginTransaction', { options: { readWrite: {} } });
  let committed = false;
  try {
    const read = async (path) => (await request('POST', ':batchGet', { documents: [name(path)], transaction }))[0]?.found || null;
    const profile = await read('users/' + uid);
    if (string(profile, 'role') !== 'vendor' || !(await inspect(profile, read))?.eligible) return false;
    await request('POST', ':commit', {
      transaction, writes: [{
        update: { name: profile.name, fields: { role: { stringValue: 'guest' }, updatedAt: { stringValue: new Date().toISOString() } } },
        updateMask: { fieldPaths: ['role', 'updatedAt'] }, currentDocument: { updateTime: profile.updateTime },
      }],
    });
    committed = true;
    return true;
  } catch (e) {
    if (e.status === 'ABORTED' || e.status === 'FAILED_PRECONDITION') return false;
    throw e;
  } finally {
    if (!committed) await request('POST', ':rollback', { transaction }).catch(() => {});
  }
}

const mode = values.apply ? 'apply' : values.cleanup ? 'dry-run' : 'report';
const rows = await request('POST', ':runQuery', { structuredQuery: {
  from: [{ collectionId: 'users' }],
  where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'vendor' } } },
  select: { fields: ['uid', 'vendorId', 'helper', 'inviteCode'].map((fieldPath) => ({ fieldPath })) },
} });
const read = (path) => request('GET', '/' + path);
const cases = [];
for (const { document: profile } of rows) {
  if (!profile) continue;
  const state = await inspect(profile, read);
  if (!state) continue;
  const uid = idOf(profile);
  const result = mode === 'apply' && state.eligible ? (await cleanup(uid) ? 'revoked' : 'changed-since-read') : state.eligible ? 'candidate' : 'manual-review';
  cases.push({ uid, vendorId: string(profile, 'vendorId'), finding: state.finding, result });
}
console.log(JSON.stringify({ mode, cases }, null, 2));
