// An explicit entry button is the only gateway to demo. Cover stale client settings, bookmarks, real user changes and role limits.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.localStorage = { getItem: (key) => key === 'farm-demo' ? JSON.stringify({ on: true, persona: 'owner', scenario: 'eventDay' }) : null, setItem() {} };
globalThis.location = { pathname: '/app', search: '?demo=owner&day=eventDay&emulator=', hash: '' };
let cleanUrl;
globalThis.history = { replaceState(_state, _title, path) { cleanUrl = path; } };
await build({ entryPoints: ['src/app/demo/store.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.build/demo-access-test.mjs', logLevel: 'silent' });
const d = await import('../.build/demo-access-test.mjs');
assert.equal(cleanUrl, '/app?emulator=');
assert.equal(d.getDemo().on, false);
d.setDemo({ on: true, persona: 'owner' });
assert.equal(d.getDemo().on, false);
for (const [role, expected] of [[null, []], ['staff', ['staff', 'vendor', 'guest']], ['manager', ['manager', 'staff', 'vendor', 'guest']], ['owner', ['owner', 'manager', 'staff', 'vendor', 'guest']]]) {
  assert.deepEqual(d.allowedDemoPersonas(role), expected);
  d.setDemoAccess('local', role);
  for (const persona of d.LISTED_PERSONAS) {
    d.setDemo({ on: true, persona, scenario: 'eventDay' });
    assert.equal(d.getDemo().on, expected.includes(persona));
    d.setDemo({ on: false });
  }
}
d.setDemoAccess('staff-id', 'staff');
d.setDemo({ on: true, persona: 'staff', scenario: 'regular' });
d.setDemo({ persona: 'manager' });
assert.equal(d.getDemo().persona, 'staff');
d.checkDemoSession('another');
assert.equal(d.getDemo().on, false);
d.setDemo({ on: true, persona: 'guest' });
assert.equal(d.getDemo().on, false);
console.log('PASS manual demo, old bookmark, remembered state, four role limits and account switch');
