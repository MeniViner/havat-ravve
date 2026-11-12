// Demo mode is a sandbox: while it is on, nothing may reach Firestore. While it is off, a demo id may never be written.
// Bundles the real data facade (src/app/db.ts) with Firestore replaced by a recorder, then drives it.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';

const stub = {
  name: 'stub-firebase',
  setup(b) {
    b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'fs', namespace: 'stub' }));
    b.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: 'app', namespace: 'stub' }));
    b.onLoad({ filter: /^fs$/, namespace: 'stub' }, () => ({ contents: `
      const calls = globalThis.__calls;
      let n = 0;
      export const collection = (db, path) => ({ path });
      export const doc = (a, b, c) => (c !== undefined ? { path: b + '/' + c } : b !== undefined ? { path: b } : { id: 'real' + (++n), path: a.path + '/real' + n });
      export const query = (c) => c, where = () => 0, orderBy = () => 0, limit = () => 0;
      export const onSnapshot = (ref) => { calls.push(['listen', ref.path]); return () => {}; };
      export const setDoc = async (ref) => { calls.push(['set', ref.path]); if (globalThis.__server === 'silent') await new Promise(() => {}); if (globalThis.__server === 'refuse') { await new Promise((r) => setTimeout(r, 30)); throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } };
      export const updateDoc = async (ref) => { calls.push(['update', ref.path]); };
      export const deleteDoc = async (ref) => { calls.push(['delete', ref.path]); };
      export const writeBatch = () => ({ set: (r) => calls.push(['batch.set', r.path]), update: (r) => calls.push(['batch.update', r.path]), delete: (r) => calls.push(['batch.delete', r.path]), commit: async () => { calls.push(['commit']); } });
      export const arrayUnion = (...v) => ({ union: v }), arrayRemove = (...v) => ({ remove: v }), increment = (n) => ({ inc: n });
      export const runTransaction = async (db, fn) => { calls.push(['tx']); return fn({ get: async () => ({ exists: () => false, data: () => ({}) }), set: (r) => calls.push(['tx.set', r.path]) }); };
    ` }));
    b.onLoad({ filter: /^app$/, namespace: 'stub' }, () => ({ contents: 'export const db = {};' }));
  },
};
await build({ entryPoints: ['tests/demo-entry.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.build/demo-test.mjs', plugins: [stub], logLevel: 'silent' });

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.location = { search: '', pathname: '/app', origin: 'http://localhost' };
globalThis.history = { replaceState() {} };
globalThis.__calls = [];
// a state left by the old build ("examples on top of my real account") must not come back as demo
store.set('farm-demo', JSON.stringify({ on: true, persona: 'real' }));

const { write, newId, push, inc, syncState, setDemo, getDemo, demoItems } = await import('../.build/demo-test.mjs?' + Date.now());
const calls = globalThis.__calls;
const writes = () => calls.filter((c) => c[0] !== 'listen');

assert.deepEqual(getDemo(), { on: false, persona: 'real' }, 'an old mixed state loads as "demo off"');

// ---- demo on: every kind of write stays local, whatever the id looks like
for (const persona of ['owner', 'manager', 'staff', 'guest', 'blocked', 'anon']) {
  setDemo({ on: true, persona });
  calls.length = 0;
  const id = newId('activity');
  assert.ok(id.startsWith('demo-'), 'new ids are demo ids while demo is on');
  await write.set('tasks', 'a-real-looking-id', { title: 'x' });
  await write.update('tasks', 'demo-task-flag', { done: true });
  await write.update('users', 'someRealUid', { notes: 'x' });
  await write.remove('shopping', 'demo-shop-milk');
  await write.batch([{ op: 'set', col: 'activity', id, data: { text: 'x' } }, { op: 'update', col: 'tasks', id: 'realTask', data: { done: true } }, { op: 'set', col: 'events/demo-e-fall/products', id: 'p1', data: {} }]);
  await write.update('tabs', 'demo-tab-roni-oct', { items: push({ name: 'x' }), total: inc(5) });
  assert.deepEqual(writes(), [], `no Firestore write as ${persona}`);
}
assert.ok(demoItems('tasks').some((t) => t.id === 'a-real-looking-id'), 'the write landed in the local demo store');

// ---- there is no "demo on top of the real account": turning demo on without a persona picks an example person
setDemo({ on: false });
setDemo({ on: true });
assert.deepEqual(getDemo(), { on: true, persona: 'owner' });
setDemo({ on: false }); setDemo({ on: true }, 'staff');
assert.deepEqual(getDemo(), { on: true, persona: 'staff' });
setDemo({ persona: 'real' });
assert.deepEqual(getDemo(), { on: false, persona: 'real' }, 'choosing "my account" leaves demo');

// ---- demo off: real writes go through, and a demo id or a path under a demo document is refused
calls.length = 0;
await write.set('tasks', 't1', { title: 'real' });
await write.batch([{ op: 'update', col: 'tasks', id: 't1', data: {} }, { op: 'set', col: 'activity', id: newId('activity'), data: {} }]);
assert.deepEqual(writes().map((c) => c[0]), ['set', 'batch.update', 'batch.set', 'commit']);
calls.length = 0;
await assert.rejects(write.update('tasks', 'demo-task-flag', { done: true }));
await assert.rejects(write.set('events/demo-e-fall/products', 'p1', {}));
await assert.rejects(write.remove('users', 'demo-u-beni'));
await assert.rejects(write.update('tabs', 'demo-tab-roni-oct', { total: inc(5) }));
await assert.rejects(write.batch([{ op: 'set', col: 'activity', id: 'r1', data: {} }, { op: 'update', col: 'tasks', id: 'demo-task-flag', data: {} }]));
assert.deepEqual(writes(), [], 'a batch with one demo id writes nothing at all');

await fs.rm('.build/demo-test.mjs', { force: true });
// ---- no reception: a write the server never answers must not keep the screen waiting
globalThis.__server = 'silent';
const waited = await Promise.race([write.set('tasks', 't2', { title: 'offline' }).then(() => 'resolved'), new Promise((r) => setTimeout(() => r('hung'), 500))]);
assert.equal(waited, 'resolved', 'an unanswered write resolves at once (the local cache already has it)');
// ---- a refusal that arrives after the screen moved on is reported, not lost
globalThis.__server = 'refuse';
await write.set('tasks', 't3', { title: 'late refusal' });
await new Promise((r) => setTimeout(r, 80));
assert.equal(syncState().failure?.text, 'אין הרשאה לפעולה הזו', 'the late refusal reaches the shell in Hebrew');
globalThis.__server = '';

console.log('PASS: demo mode never reaches Firestore, demo ids are refused outside it, and writes never wait for the server');
