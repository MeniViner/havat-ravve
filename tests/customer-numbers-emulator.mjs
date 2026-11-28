// Isolated synthetic project. Two backfills race a normal counter allocation.
import assert from 'node:assert/strict';
import { reconcileNumbers } from '../scripts/apply-customer-numbers.mjs';
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(emulator || '')) throw Error('Local Firestore emulator required.');
const project = 'demo-number-check';
const path = 'projects/' + project + '/databases/(default)/documents/';
const base = 'http://' + emulator + '/v1/' + path;
const headers = { authorization: 'Bearer owner', 'content-type': 'application/json' };
async function req(p, init = {}) { const r = await fetch(base + p, { ...init, headers }); const result = await r.json(); if (!r.ok) throw Object.assign(Error(result.error.status), { status: r.status }); return result; }
const set = (p, fields) => req(p, { method: 'PATCH', body: JSON.stringify({ fields }) });
const n = (i) => ({ integerValue: String(i) });
const time = (s) => ({ stringValue: s });
const date = (i) => time('2026-01-' + String(i).padStart(2, '0') + 'T09:00:00Z');
await fetch('http://' + emulator + '/emulator/v1/projects/' + project + '/databases/(default)/documents', { method: 'DELETE' });
await Promise.all([set('counters/users', { value: n(5) }), set('users/existing', { customerNumber: n(9) }),
  set('users/late', { createdAt: date(23) }), set('users/early', { createdAt: date(1) }), set('users/noDate', { note: time('preserve') })]);
const options = { emulator, project };
const dry = await reconcileNumbers(options);
assert.deepEqual(dry.assignments, [{ uid: 'early', customerNumber: 10 }, { uid: 'late', customerNumber: 11 }]);
assert.equal((await req('counters/users')).fields.value.integerValue, '5');
async function signup() {
  for (let i = 0; i < 10; i++) {
    const counter = await req('counters/users');
    const value = n(Math.max(9, Number(counter.fields.value.integerValue)) + 1);
    const writes = [{ update: { name: path + 'counters/users', fields: { value } }, currentDocument: { updateTime: counter.updateTime } },
      { update: { name: path + 'users/new', fields: { customerNumber: value, createdAt: date(24) } }, currentDocument: { exists: false } }];
    try { await req('../documents:commit', { method: 'POST', body: JSON.stringify({ writes }) }); return; }
    catch (e) { if (!['ABORTED', 'FAILED_PRECONDITION'].includes(e.message)) throw e; }
  }
  throw Error('Synthetic registration retry exhausted');
}
await Promise.all([reconcileNumbers({ ...options, apply: true }), reconcileNumbers({ ...options, apply: true }), signup()]);
const ids = await Promise.all(['existing', 'early', 'late', 'new'].map(async (id) => Number((await req('users/' + id)).fields.customerNumber.integerValue)));
assert.equal(ids[0], 9);
assert.equal(new Set(ids).size, 4);
assert.ok(ids[1] < ids[2]);
assert.equal(Number((await req('counters/users')).fields.value.integerValue), Math.max(...ids));
assert.ok(!(await req('users/noDate')).fields.customerNumber);
assert.equal((await reconcileNumbers({ ...options, apply: true })).applied, 0);
console.log('PASS local counter backfill, concurrent signup, preservation, oldest-first and idempotency');
