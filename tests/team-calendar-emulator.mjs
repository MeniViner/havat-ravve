// Role filtering and compatibility with pre-audience rows, against an isolated local project.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createMockUserToken } from '@firebase/util';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^(?:localhost|127\.0\.0\.1):\d+$/.test(host || '')) throw Error('A local Firestore emulator is required.');
const project = 'demo-team-calendar-review';
const env = { FIRESTORE_EMULATOR_HOST: host, FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099', FIRESTORE_PROJECT_ID: project };
const origin = 'http://localhost:5196';
const { outputFiles } = await build({ entryPoints: ['api/src/team-calendar.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { teamCalendar } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
const db = 'http://' + host + '/v1/projects/' + project + '/databases/(default)/documents/';
async function put(path, fields) {
  const encoded = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { stringValue: value }]));
  const res = await fetch(db + path, { method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: encoded }) });
  assert.ok(res.ok);
}
const day = '2026-11-16';
await Promise.all([
  put('calendar/old-shared', { date: day, title: 'משמרת בוקר' }),
  put('calendar/shared', { date: day, audience: 'all' }),
  put('calendar/manager-private', { date: day, audience: 'managers', title: 'פגישה סגורה' }),
  put('calendar/unknown', { date: day, audience: 'unknown' }),
  put('calendar/outside', { date: '2026-11-17' }),
  ...[['team', 'staff', 'active'], ['manager', 'manager', 'active'], ['guest', 'guest', 'active'], ['suspended', 'staff', 'pending']].map(([uid, role, status]) => put('users/' + uid, { role, status })),
]);
const read = (uid, from = day, to = day, source = origin, method = 'GET') => {
  const headers = { origin: source };
  if (uid) headers.authorization = 'Bearer ' + createMockUserToken({ sub: uid, iat: Math.floor(Date.now() / 1000), email: uid + '@example.invalid' }, project);
  return teamCalendar(new Request('http://localhost/v1/team-calendar?from=' + from + '&to=' + to, { method, headers }), env);
};
for (const uid of ['team', 'manager']) {
  const r = await read(uid);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ids: ['old-shared'] });
  assert.match(r.headers.get('cache-control'), /no-store/);
}
assert.equal((await read(null)).status, 401);
for (const uid of ['guest', 'suspended', 'unknown']) assert.equal((await read(uid)).status, 403);
assert.equal((await read('team', day, day, 'https://example.invalid')).status, 403);
assert.equal((await read('team', day, day, 'https://localhost')).status, 200);
assert.equal((await read('team', day, day, origin, 'OPTIONS')).status, 204);
assert.equal((await read('team', day, day, origin, 'POST')).status, 405);
for (const [from, to] of [['2026-11-17', day], ['2026-02-30', day], [day, '2027-02-17']]) assert.equal((await read('team', from, to)).status, 400);
await put('calendar/old-shared', { date: day, audience: 'managers' });
assert.deepEqual(await (await read('team')).json(), { ids: [] });
console.log('PASS team calendar legacy visibility, interval, native origin, role checks and withdrawn access');
