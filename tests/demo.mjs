// Demo mode is a sandbox: while it is on, nothing may reach Firestore. While it is off, a demo id may never be written.
// Bundles the real data facade (src/app/db.ts) with Firestore replaced by a recorder, then drives it.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';

const stub = {
  name: 'stub-firebase',
  setup(b) {
    b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'fs', namespace: 'stub' }));
    b.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: 'app', namespace: 'stub' }));
    b.onLoad({ filter: /^fs$/, namespace: 'stub' }, () => ({ contents: `
      const calls = globalThis.__calls;
      let n = 0;
      export const collection = (db, path) => ({ path });
      export const doc = (a, b, c) => (c !== undefined ? { path: b + '/' + c } : b !== undefined ? { path: b } : { id: 'real' + (++n), path: a.path + '/real' + n });
      export const query = (c) => c, where = () => 0, orderBy = () => 0, limit = () => 0;
      export const onSnapshot = (ref) => { calls.push(['listen', ref.path]); return () => {}; };
      export const getDocsFromServer = async (ref) => { calls.push(['get', ref.path]); return { docs: [] }; };
      export const serverTimestamp = () => ({ __serverTimestamp: true });
      export const documentId = () => '__name__';
      export const setDoc = async (ref) => { calls.push(['set', ref.path]); if (globalThis.__server === 'silent') await new Promise(() => {}); if (globalThis.__server === 'refuse') { await new Promise((r) => setTimeout(r, 30)); throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } };
      export const updateDoc = async (ref) => { calls.push(['update', ref.path]); };
      export const deleteDoc = async (ref) => { calls.push(['delete', ref.path]); };
      export const writeBatch = () => ({ set: (r) => calls.push(['batch.set', r.path]), update: (r) => calls.push(['batch.update', r.path]), delete: (r) => calls.push(['batch.delete', r.path]), commit: async () => { calls.push(['commit']); if (globalThis.__batch === 'refuse') { await new Promise((r) => setTimeout(r, 30)); throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } } });
      export const arrayUnion = (...v) => ({ union: v }), arrayRemove = (...v) => ({ remove: v }), increment = (n) => ({ inc: n });
      // __tx: '' runs fn and commits; 'unavailable' / 'denied' fail like the server; 'hang' never answers;
      // 'slowRead' answers the reads only after __slowMs; 'slowCommit' commits after __slowMs.
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const snap = (path, d) => ({ id: path.split('/').pop(), exists: () => !!d, data: () => d });
      export const runTransaction = async (db, fn) => {
        calls.push(['tx']);
        const mode = globalThis.__tx || '';
        if (mode === 'unavailable') { await wait(10); throw Object.assign(new Error('offline'), { code: 'unavailable' }); }
        if (mode === 'hang') await new Promise(() => {});
        const out = await fn({
          get: async (r) => { if (mode === 'slowRead') await wait(globalThis.__slowMs); return snap(r.path, (globalThis.__serverDocs || {})[r.path]); },
          set: (r) => calls.push(['tx.set', r.path]), update: (r) => calls.push(['tx.update', r.path]),
        });
        if (mode === 'slowCommit') await wait(globalThis.__slowMs);
        if (mode === 'denied') throw Object.assign(new Error('denied'), { code: 'permission-denied' });
        calls.push(['tx.commit']);
        return out;
      };
      export const getDocFromCache = async (r) => { const d = (globalThis.__cacheDocs || {})[r.path]; if (d === undefined) throw Object.assign(new Error('not cached'), { code: 'unavailable' }); return snap(r.path, d); };
    ` }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: 'export const onAuthStateChanged = () => {};' }));
    b.onLoad({ filter: /^app$/, namespace: 'stub' }, () => ({ contents: `
      export const db = {}, ownerEmail = 'owner@example.test';
      export const readyAuth = async () => ({});
      export const nowIso = () => new Date().toISOString();
      export const todayKey = () => '', hoursAgoIso = () => '', isAccountUser = () => false, appleSignInAvailable = false; export const signInApple = async () => {};
    ` }));
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

const { write, newId, push, inc, syncState, setDemo, getDemo, demoItems, demoDoc, NEW_DEMO_SESSION, createProfile, updateOwnProfile, fit, byPriority, transact, ConflictError, isConflict, txTiming } = await import('../.build/demo-test.mjs?' + Date.now());
const calls = globalThis.__calls;
const writes = () => calls.filter((c) => c[0] !== 'listen');

assert.deepEqual(getDemo(), { on: false, persona: 'real', scenario: 'regular' }, 'an old mixed state loads as "demo off"');

// ---- demo on: every kind of write stays local, whatever the id looks like
for (const persona of ['owner', 'manager', 'staff', 'vendor', 'helper', 'guest', 'blocked', 'anon', 'new']) {
  setDemo({ on: true, persona });
  calls.length = 0;
  const id = newId('activity');
  assert.ok(id.startsWith('demo-'), 'new ids are demo ids while demo is on');
  await write.set('tasks', 'a-real-looking-id', { title: 'x' });
  await write.update('tasks', 'demo-task-flag', { done: true });
  await write.update('users', 'someRealUid', { notes: 'x' });
  await write.merge('users', 'someRealUid', { fields: { example: 'x' } });
  await write.remove('shopping', 'demo-shop-milk');
  await write.batch([{ op: 'set', col: 'activity', id, data: { text: 'x' } }, { op: 'update', col: 'tasks', id: 'realTask', data: { done: true } }, { op: 'set', col: 'events/demo-e-fall/products', id: 'p1', data: {} }]);
  await write.update('tabs', 'demo-tab-roni-oct', { items: push({ name: 'x' }), total: inc(5) });
  assert.deepEqual(writes(), [], `no Firestore write as ${persona}`);
}
assert.ok(demoItems('tasks').some((t) => t.id === 'a-real-looking-id'), 'the write landed in the local demo store');
const signup = { displayName: 'אורח חדש', phone: '0500000000', fields: { city: 'באר שבע', source: 'חברים' } };
await createProfile(NEW_DEMO_SESSION, signup);
await updateOwnProfile(NEW_DEMO_SESSION.uid, { fields: { receiptPreference: 'email' } });
await updateOwnProfile(NEW_DEMO_SESSION.uid, { fields: { city: 'עומר' } });
assert.deepEqual(demoDoc('users/' + NEW_DEMO_SESSION.uid).fields, { city: 'עומר', source: 'חברים', receiptPreference: 'email' });
assert.deepEqual(writes(), [], 'registration and profile updates remain in the local sandbox');

// ---- there is no "demo on top of the real account": turning demo on without a persona picks an example person
setDemo({ on: false });
setDemo({ on: true });
assert.deepEqual(getDemo(), { on: true, persona: 'owner', scenario: 'regular' });
setDemo({ on: false }); setDemo({ on: true }, 'staff');
assert.deepEqual(getDemo(), { on: true, persona: 'staff', scenario: 'regular' });
setDemo({ persona: 'real' });
assert.deepEqual(getDemo(), { on: false, persona: 'real', scenario: 'regular' }, 'choosing "my account" leaves demo');

// ---- demo off: real writes go through, and a demo id or a path under a demo document is refused
calls.length = 0;
await write.set('tasks', 't1', { title: 'real' });
await write.batch([{ op: 'update', col: 'tasks', id: 't1', data: {} }, { op: 'set', col: 'activity', id: newId('activity'), data: {} }]);
assert.deepEqual(writes().map((c) => c[0]), ['set', 'batch.update', 'batch.set', 'commit']);
calls.length = 0;
await assert.rejects(write.update('tasks', 'demo-task-flag', { done: true }));
await assert.rejects(write.set('events/demo-e-fall/products', 'p1', {}));
await assert.rejects(write.remove('users', 'demo-u-beni'));
await assert.rejects(write.merge('users', NEW_DEMO_SESSION.uid, { fields: { receiptPreference: 'email' } }));
await assert.rejects(createProfile(NEW_DEMO_SESSION, signup));
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

// ---- the gate on weak reception (transact with queue): a scan is never lost, a server that answers still refuses a second entry
{
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }); // "online", as a phone with one bar says
  txTiming.waitMs = 60;
  const ticket = { id: 't9', status: 'valid', entries: 0 };
  globalThis.__serverDocs = { 'tickets/t9': ticket }; globalThis.__cacheDocs = { 'tickets/t9': ticket };
  // the shape of admit(): read the ticket, refuse when someone else counted it first, write the scan and the ticket
  const scan = (seen = 0) => async (tx) => {
    const cur = await tx.get('tickets', 't9');
    if (!cur || (cur.entries || 0) !== seen) throw new ConflictError();
    tx.set('events/e1/scans', `t9-${seen + 1}`, { result: 'ok' });
    tx.update('tickets', 't9', { entries: inc(1) });
    return { entries: seen + 1 };
  };
  const sent = () => calls.filter((c) => c[0] === 'tx.commit' || c[0] === 'commit').map((c) => c[0]);
  const reset = () => { calls.length = 0; globalThis.__tx = ''; globalThis.__batch = ''; setSyncFailureMark(); };
  let mark = syncState().failure?.id; const setSyncFailureMark = () => { mark = syncState().failure?.id; };
  const newFailure = () => (syncState().failure?.id !== mark ? syncState().failure?.text : undefined);

  reset();
  assert.deepEqual(await transact(scan(), { queue: true }), { entries: 1 }, 'the server answers: an ordinary transaction');
  assert.deepEqual(sent(), ['tx.commit']);

  reset(); globalThis.__tx = 'unavailable';
  assert.deepEqual(await transact(scan(), { queue: true }), { entries: 1 }, 'the server cannot be reached: the scan is saved on the phone');
  assert.deepEqual(sent(), ['commit'], 'as one queued batch');
  assert.deepEqual(calls.filter((c) => c[0].startsWith('batch.')).map((c) => c[1]), ['events/e1/scans/t9-1', 'tickets/t9']);

  reset(); globalThis.__tx = 'hang';
  const t0 = Date.now();
  assert.deepEqual(await transact(scan(), { queue: true }), { entries: 1 }, 'no answer at all: saved on the phone after the short wait');
  assert.ok(Date.now() - t0 < 1000, 'the gate does not wait for the network');
  assert.deepEqual(sent(), ['commit']);

  reset(); globalThis.__tx = 'slowRead'; globalThis.__slowMs = 150;
  await transact(scan(), { queue: true });
  await new Promise((r) => setTimeout(r, 250));
  assert.deepEqual(sent(), ['commit'], 'the late transaction gives up instead of committing a second copy');

  reset(); globalThis.__tx = 'slowCommit'; globalThis.__slowMs = 150; globalThis.__batch = 'refuse';
  await transact(scan(), { queue: true });
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(sent().sort(), ['commit', 'tx.commit'], 'the slow transaction landed and the queued copy was refused by the rules');
  assert.equal(newFailure(), undefined, 'that refusal of the repeat is not shown as a failure');

  reset(); globalThis.__tx = 'hang'; globalThis.__batch = 'refuse';
  await assert.rejects(transact(scan(), { queue: true }), /אין הרשאה/, 'a queued scan the rules refuse is still reported');

  reset(); globalThis.__serverDocs = { 'tickets/t9': { ...ticket, entries: 1 } };
  await assert.rejects(transact(scan(0), { queue: true }), (e) => isConflict(e), 'another gate counted it first: X1, nothing written');
  assert.deepEqual(sent(), []);
  globalThis.__serverDocs = { 'tickets/t9': ticket };

  reset(); globalThis.__tx = 'denied';
  await assert.rejects(transact(scan(), { queue: true }), (e) => !isConflict(e) && e.message === 'אין הרשאה לפעולה הזו', 'a refusal by the rules is reported as such, not as "someone else was first"');
  await assert.rejects(transact(scan()), (e) => !isConflict(e) && e.message === 'אין הרשאה לפעולה הזו');

  reset(); globalThis.__tx = 'unavailable';
  await assert.rejects(transact(scan()), (e) => e.message === 'אין קליטה כרגע', 'without queue a transaction still needs the server');
  assert.deepEqual(sent(), []);

  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  reset();
  assert.deepEqual(await transact(scan()), { entries: 1 }, 'offline: the cached copy, as before');
  assert.deepEqual(sent(), ['commit']);
  reset();
  txTiming.waitMs = 4000; globalThis.__serverDocs = undefined; globalThis.__cacheDocs = undefined;
  console.log('PASS: a gate scan is saved on the phone when the server cannot be reached, and refusals are reported honestly');
}

// ---- Today: completed rows never push an open task off its group
{
  const t = (id, done, extra = {}) => ({ id, title: id, done, dueDate: '', urgent: false, assignee: null, createdAt: '2026-11-01T0' + (id.length % 10) + ':00:00.000Z', ...extra });
  const rows = [...Array.from({ length: 12 }, (_, i) => t('done' + i, true, { urgent: true })), t('open-a', false), t('open-b', false)];
  const sorted = [...rows].sort(byPriority('me', '2026-11-18'));
  assert.deepEqual(sorted.slice(0, 2).map((x) => x.id).sort(), ['open-a', 'open-b'], 'open tasks sort before completed ones, even urgent completed ones');
  const cut = fit(sorted, 8);
  assert.ok(cut.shown.some((x) => x.id === 'open-a') && cut.shown.some((x) => x.id === 'open-b'), 'every open task stays visible');
  assert.equal(cut.shown.length, 8); assert.equal(cut.hidden, 6, 'the hidden count is the completed rows that did not fit');
  const many = Array.from({ length: 10 }, (_, i) => t('o' + i, false));
  assert.equal(fit([...many, t('d', true)], 8).shown.length, 10, 'open rows are never cut, even past the limit');
  console.log('PASS: Today keeps every open task above completed ones');
}
