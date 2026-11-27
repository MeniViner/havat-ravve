// Run under the Firestore emulator. This exercises the actual Worker + database against a dedicated synthetic project.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(emulator || '')) throw Error('Local Firestore emulator required.');
await build({ entryPoints: ['api/src/contact.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.build/contact-worker-test.mjs' });
const { handleContact } = await import('../.build/contact-worker-test.mjs');
const env = { FIRESTORE_EMULATOR_HOST: emulator, FIRESTORE_PROJECT_ID: 'demo-contact-check' };
const origin = 'http://localhost:5197';
const base = 'http://' + emulator + '/v1/projects/demo-contact-check/databases/(default)/documents/';
const admin = { headers: { authorization: 'Bearer owner' } };
const read = (path) => fetch(base + path, admin).then((r) => r.json());
const send = (body, headers = {}, settings = env) => handleContact(new Request('http://localhost/v1/contact', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), settings);
const data = { id: randomUUID(), subject: 'פניית בדיקה', message: 'הודעה בדויה', method: 'email', reply: 'qa@example.invalid' };
assert.equal((await send(data, { origin: 'https://example.invalid' })).status, 403);
const native = new Request('http://localhost/v1/contact', { method:'OPTIONS', headers:{ origin:'https://localhost' } });
assert.equal((await handleContact(native, {})).headers.get('access-control-allow-origin'), 'https://localhost');
assert.equal((await send({ ...data, role: 'owner' })).status, 400);
assert.equal((await send({ ...data, reply: 'invalid' })).status, 400);
assert.equal((await send('א'.repeat(4500))).status, 413); // actual bytes, even without Content-Length
assert.equal((await send(data, {}, { ...env, AUTH_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
const before = Number((await read('counters/users')).fields?.value?.integerValue || 0);
assert.equal((await send(data)).status, 204);
assert.equal((await send(data)).status, 204);
const person = (await read('contact_people/contact-' + data.id)).fields;
const notification = (await read('notifications/contact-' + data.id)).fields;
assert.equal(person.accountUid.stringValue, '');
assert.equal(person.reply.stringValue, data.reply);
assert.equal(notification.refId.stringValue, 'contact-' + data.id);
assert.equal(Number((await read('counters/users')).fields.value.integerValue), before + 1);
const second = { ...data, id: randomUUID() };
assert.equal((await send(second)).status, 204);
assert.equal(Number((await read('counters/users')).fields.value.integerValue), before + 2); // same typed address never merges strangers
assert.equal((await send({ ...data, id: randomUUID(), method: 'phone', reply: '050-000-0011' })).status, 204);
assert.equal((await send(data, { authorization: 'Bearer invalid-test-token' })).status, 401);
console.log('PASS public farm contact, bounded body, origins, retry, rate limiting and separate guest identities');
