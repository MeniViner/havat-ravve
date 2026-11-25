// Run with the Firestore emulator. Uses an isolated demo database.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(host, 'run with the Firestore emulator');
const project = 'demo-havat-ravve-vendor-audit';
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const headers = { authorization: 'Bearer owner', 'content-type': 'application/json' };
const value = (data) => typeof data === 'boolean' ? { booleanValue: data }
  : typeof data === 'string' ? { stringValue: data }
  : Array.isArray(data) ? { arrayValue: { values: data.map(value) } }
  : { mapValue: { fields: encode(data) } };
const encode = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)]));
const seed = async (path, data) => {
  const r = await fetch(`${base}/${path}`, { method: 'PATCH', headers, body: JSON.stringify({ fields: encode(data) }) });
  assert.ok(r.ok, await r.text());
};
const get = async (path) => fetch(`${base}/${path}`, { headers }).then((r) => r.json());
const run = async (...flags) => JSON.parse((await promisify(execFile)(process.execPath, ['scripts/vendor-access-audit.mjs', '--project=' + project, ...flags])).stdout);

for (const [uid, vendorId, options] of [
  ['dangling', 'stall-a'], ['missing', 'no-stall'], ['linked', 'stall-a'], ['linked-uid', 'stall-a'],
  ['legacy', 'stall-ambiguous'], ['unverifiable', 'stall-no-list'], ['owner', 'stall-a', { helper: false }], ['wrong-code', 'stall-a'],
]) {
  const code = `code-${uid}`;
  await seed('users/' + uid, { uid, vendorId, role: 'vendor', helper: true, inviteCode: code, displayName: 'Same synthetic label', ...options });
  await seed('vendor_invites/' + code, { code, vendorId, role: 'helper', active: false, usedBy: uid === 'wrong-code' ? 'another-synthetic-account' : uid });
}
await seed('vendors/stall-a', { people: [
  { code: 'code-linked', role: 'helper', name: 'Same synthetic label' },
  { uid: 'linked-uid', role: 'helper', name: 'Same synthetic label' },
] });
await seed('vendors/stall-no-list', { name: 'Synthetic, no people list' });
await seed('vendors/stall-ambiguous', { people: [{ name: 'Same synthetic label', role: 'helper' }] });

await assert.rejects(run('--apply'), /To write, pass --cleanup --apply/);
const audit = await run();
assert.equal(audit.mode, 'report');
assert.deepEqual(audit.cases.filter((r) => r.result === 'candidate').map((r) => r.uid).sort(), ['dangling', 'missing']);
assert.deepEqual(audit.cases.filter((r) => r.result === 'manual-review').map((r) => r.uid).sort(), ['legacy', 'owner', 'unverifiable', 'wrong-code']);
const dry = await run('--cleanup');
assert.equal(dry.mode, 'dry-run');
assert.deepEqual(dry.cases, audit.cases);
assert.equal((await get('users/dangling')).fields.role.stringValue, 'vendor');
const cleanup = await run('--cleanup', '--apply');
assert.deepEqual(cleanup.cases.filter((r) => r.result === 'revoked').map((r) => r.uid).sort(), ['dangling', 'missing']);
const profile = await get('users/dangling');
assert.equal(profile.fields.role.stringValue, 'guest');
assert.equal(profile.fields.inviteCode.stringValue, 'code-dangling');
for (const uid of ['linked', 'linked-uid', 'legacy', 'owner', 'unverifiable', 'wrong-code']) assert.equal((await get('users/' + uid)).fields.role.stringValue, 'vendor');
assert.equal((await run('--cleanup', '--apply')).cases.filter((r) => r.result === 'revoked').length, 0);
assert.deepEqual(await get('users/dangling'), profile);
console.log('PASS: read-only vendor report, cleanup dry run, confirmed orphan cleanup and idempotent retry');
