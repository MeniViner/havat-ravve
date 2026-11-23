// First visits in demo (src/app/demo/intro.ts): demo on by itself for a new account, at its own role or below, until it is left;
// one question on the next opening; then nothing. All in this browser's storage, nothing in Firestore.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
globalThis.location = { search: '', pathname: '/app' }; globalThis.history = { state: null, replaceState() {} };

const entry = 'export * from "../src/app/demo/intro"; export { getDemo, setDemo } from "../src/app/demo/store";';
const out = await build({ stdin: { contents: entry, resolveDir: 'tests', loader: 'ts' }, bundle: true, format: 'esm', write: false, platform: 'node', external: ['react', 'firebase/*'], logLevel: 'error' });
const file = new URL('./.demo-intro.bundle.mjs', import.meta.url);
fs.writeFileSync(file, out.outputFiles[0].text);
const I = await import(file.href).finally(() => fs.unlinkSync(file));

const p = (o) => ({ uid: 'u1', role: 'guest', status: 'active', createdAt: '2026-11-25T10:00:00.000Z', displayName: 'דנה', email: 'd@example.test', ...o });
const stage = (uid = 'u1') => localStorage.getItem('farm-demo-intro:' + uid);
const newOpening = () => sessionStorage.clear();

// the pure step
assert.deepEqual(I.introStep(null, { fresh: true, leftNow: false }), { action: 'start', stage: 'demo' });
assert.deepEqual(I.introStep(null, { fresh: false, leftNow: false }), { action: 'none', stage: null });
assert.deepEqual(I.introStep('demo', { fresh: true, leftNow: true }), { action: 'none', stage: 'left' });
assert.deepEqual(I.introStep('left', { fresh: true, leftNow: false }), { action: 'ask', stage: 'left' });
assert.deepEqual(I.introStep('demo', { fresh: true, leftNow: false }), { action: 'ask', stage: 'left' }, 'left demo in an earlier opening');
assert.deepEqual(I.introStep('done', { fresh: true, leftNow: false }), { action: 'none', stage: 'done' });

// the persona is the person's own role or the closest one below it
assert.equal(I.introPersona(p({}), false, false), 'guest');
assert.equal(I.introPersona(p({ role: 'staff' }), false, false), 'staff');
assert.equal(I.introPersona(p({ role: 'staff', status: 'pending' }), false, false), 'guest');
assert.equal(I.introPersona(p({ role: 'manager' }), false, true), 'manager');
assert.equal(I.introPersona(p({ role: 'owner' }), true, true), 'owner');
assert.equal(I.introPersona(p({ role: 'guest' }), true, true), 'owner', 'the owner email');
assert.equal(I.introPersona(p({ role: 'vendor' }), false, false), 'vendor');
assert.equal(I.introPersona(p({ role: 'vendor', helper: true }), false, false), 'helper');
assert.equal(I.introPersona(p({ role: 'vendor', status: 'pending' }), false, false), 'guest');

// the whole path for a new volunteer
const me = p({ role: 'staff' });
assert.equal(I.runIntro(me, false, false), 'start');
assert.deepEqual([I.getDemo().on, I.getDemo().persona, stage()], [true, 'staff', 'demo']);
assert.equal(I.runIntro(me, false, false), 'none', 'demo on: nothing to do');
newOpening(); // later openings: demo is still on (farm-demo in localStorage), so the real account never shows
assert.equal(I.getDemo().on, true);
I.setDemo({ on: false }); // יציאה in the strip
assert.equal(I.leaveDemoTarget(), '/', 'a demo started for the account goes back to it');
assert.equal(I.runIntro(me, false, false), 'none', 'no question in the opening it was left in');
assert.equal(stage(), 'left');
assert.equal(I.runIntro(me, false, false), 'none', 'still the same opening');
newOpening();
assert.equal(I.runIntro(me, false, false), 'ask', 'the next opening asks once');
I.answerIntro(me.uid, false, 'staff'); // לא תודה
assert.equal(stage(), 'done');
newOpening();
assert.equal(I.runIntro(me, false, false), 'none', 'never again');
assert.equal(I.getDemo().on, false);

// הפעלה: demo on at the same role, and leaving it goes back to the account
const m = p({ uid: 'u2', role: 'manager' });
localStorage.setItem('farm-demo-intro:u2', 'left');
assert.equal(I.runIntro(m, false, true), 'ask');
I.answerIntro(m.uid, true, I.introPersona(m, false, true));
assert.deepEqual([I.getDemo().on, I.getDemo().persona, stage('u2')], [true, 'manager', 'done']);
I.setDemo({ on: false });
assert.equal(I.leaveDemoTarget(), '/');
newOpening();
assert.equal(I.runIntro(m, false, true), 'none');

// a demo entered from the persona chooser still leaves to /demo, as before
I.setDemo({ on: true, persona: 'owner' }); I.setDemo({ on: false });
assert.equal(I.leaveDemoTarget(), '/demo');

// accounts from before the feature are left alone; ?demo-intro=reset starts it again on this device
const old = p({ uid: 'u3', createdAt: '2026-03-01T08:00:00.000Z' });
assert.equal(I.runIntro(old, false, false), 'none');
assert.equal(stage('u3'), null);
assert.equal(I.runIntro(p({ uid: 'u4', createdAt: undefined }), false, false), 'none', 'no createdAt: treated as an old account');
localStorage.setItem('farm-demo-intro-reset', '1');
assert.equal(I.runIntro(old, false, false), 'start');
assert.deepEqual([I.getDemo().persona, stage('u3')], ['guest', 'demo']);
I.setDemo({ on: false });

console.log('demo-intro: ok');
