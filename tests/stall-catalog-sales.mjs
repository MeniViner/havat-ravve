// An isolated, synthetic Firestore project on a loopback emulator. No delivery service or real payment is used.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host || '')) throw new Error('use a loopback Firestore emulator');
const project = 'demo-stall-sale-' + randomUUID().slice(0, 8);
const env = {
  FIRESTORE_PROJECT_ID: project,
  FIRESTORE_EMULATOR_HOST: host,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  TEST_FAULTS: '1',
};
const output = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: "export {default as worker} from './api/src/index';export {Firestore} from './api/src/firestore';",
  },
  platform: 'node',
  bundle: true,
  format: 'esm',
  write: false,
});
const { worker, Firestore } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64')
);
const fs = new Firestore(env),
  origin = 'http://localhost:5184',
  event = 'day',
  col = 'events/day/products',
  cfg = 'events/day/stall_config';
const secs = Math.floor(Date.now() / 1000);
const b = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = (u) =>
  b({ alg: 'none' }) +
  '.' +
  b({ sub: u, aud: project, iss: 'https://securetoken.google.com/' + project, iat: secs, exp: secs + 3600 }) +
  '.';
const send = async (body, uid = 'volunteer', options = {}) => {
  const req = new Request('http://localhost:5185/v1/stall-sales', {
    method: options.method || 'POST',
    headers: { origin, authorization: 'Bearer ' + token(uid), 'content-type': 'application/json', ...options.headers },
    ...(options.method === 'OPTIONS' ? {} : { body: JSON.stringify(body) }),
  });
  const response = await worker.fetch(req, env, { waitUntil() {} });
  return { status: response.status, data: await response.json().catch(() => null) };
};
const ok = async (promise) => {
  const o = await promise;
  assert.equal(o.status, 200, JSON.stringify(o));
  return o.data.data;
};
const denied = async (promise, code) => {
  const r = await promise;
  assert.equal(r.data?.error?.code, code, JSON.stringify(r));
};
const set = (col, id, data) => fs.commit([fs.set(col, id, data)]);
const doc = async (col, id) => (await fs.get(col, id))?.data;
const item = {
  productId: 'cup',
  qty: 2,
  price: 7,
  catalogId: 'food',
  catalogProductId: 'cup',
  catalogGeneration: 0,
  catalogProductGeneration: 0,
};
const plain = { productId: 'bag', qty: 1, price: 3 };
const body = (lines, options = {}) => ({ eventId: event, operationId: randomUUID(), tabId: 'a', items: lines, ...options });
const fresh = (lines, options = {}) => {
  const purchase = body(lines, { guest: { uid: '', ticketId: '', name: 'אורח בדיקה', phone: '050-000-0011' }, ...options });
  delete purchase.tabId;
  return purchase;
};
const history = {
  productId: 'retired',
  qty: 1,
  price: 12,
  name: 'שם ישן',
  at: '2024-01-01T00:00:00Z',
  by: { uid: 'past', name: 'ישן' },
};
const baseTab = {
  eventId: event,
  eventTitle: 'שוק בדיקה',
  guestUid: '',
  guestName: 'מדגם',
  guestPhone: '',
  ticketId: '',
  status: 'open',
  items: [history],
  total: 12,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};
await fs.commit([
  fs.set('events', event, { title: 'שוק בדיקה', stall: true }),
  fs.set('users', 'volunteer', { role: 'staff', status: 'active', displayName: 'עובד בדיקה' }),
  fs.set('users', 'boss', { role: 'owner', status: 'active', displayName: 'בעלים' }),
  fs.set('users', 'blocked', { role: 'manager', status: 'blocked' }),
  fs.set('users', 'viewer', { role: 'guest', status: 'active' }),
  fs.set('tabs', 'a', baseTab),
  fs.set('farm_catalogs', 'food', { name: 'קטלוג בדיקה' }),
  fs.set('farm_catalogs/food/products', 'cup', { name: 'שם במאסטר', price: 999 }),
  fs.set(col, 'bag', { name: 'שקית', price: 3, active: true }),
  fs.set(col, 'cup', { name: 'כוס האירוע', price: 7, active: true, catalogId: 'food', catalogProductId: 'cup' }),
]);
assert.equal((await send({}, 'volunteer', { method: 'OPTIONS' })).status, 204);
assert.equal((await send(body([item]), 'volunteer', { headers: { origin: 'http://untrusted.invalid' } })).status, 403);
await denied(send(body([item]), 'volunteer', { headers: { authorization: '' } }), 'UNAUTHENTICATED');
const rateKeys = [];
env.AUTH_LIMITER = env.RATE_LIMITER = {
  limit: async ({ key }) => {
    rateKeys.push(key);
    return { success: false };
  },
};
await denied(send(body([item]), 'volunteer', { headers: { authorization: '' } }), 'RATE_LIMITED');
await denied(send(body([item]), 'volunteer'), 'RATE_LIMITED');
await denied(send(body([item]), 'boss'), 'RATE_LIMITED');
assert.deepEqual(rateKeys, ['pos-auth:local', 'pos:volunteer', 'pos:boss']);
delete env.AUTH_LIMITER;
delete env.RATE_LIMITER;
for (const who of ['viewer', 'blocked', 'missing']) await denied(send(body([item]), who), 'FORBIDDEN');
await set('settings', 'switches', { readOnly: true });
await denied(send(body([item])), 'FORBIDDEN');
await set('settings', 'switches', { readOnly: false });
await set('events', event, { title: 'שוק', stall: false });
await denied(send(body([item])), 'VALIDATION_FAILED');
await set('events', event, { title: 'שוק', stall: true, closed: { by: 'מנהל' } });
await denied(send(body([item])), 'VALIDATION_FAILED');
await set('events', event, { title: 'שוק', stall: true });
await set(col, 'bad', { name: 'חיבור קטלוג פגום', price: 3, active: true, catalogId: '', catalogProductId: '' });
await denied(send(body([{ productId: 'bad', qty: 1, price: 3 }])), 'STALE_WRITE');
const first = body([item, plain]);
const responses = await Promise.all([ok(send(first)), ok(send(first))]);
assert.equal(responses.filter((r) => !r.replayed).length, 1);
assert.equal(responses[0].total, 17);
const stored = await doc('tabs', 'a');
assert.equal(stored.total, 29);
assert.deepEqual(stored.items[0], history);
assert.deepEqual(
  stored.items.slice(1).map(({ name, price }) => [name, price]),
  [
    ['כוס האירוע', 7],
    ['שקית', 3],
  ],
);
assert.equal((await doc(cfg, 'catalog')).enabled, true);
await denied(send({ ...first, items: [plain] }), 'IDEMPOTENCY_CONFLICT');
await set('farm_catalogs/food/products', 'cup', { archived: true, generation: 1, price: 999 });
await denied(send(body([plain, item])), 'STALE_WRITE');
assert.deepEqual(await doc('tabs', 'a'), stored);
const rejected = fresh([plain, item]);
await denied(send(rejected), 'STALE_WRITE');
assert.equal((await fs.query({ from: [{ collectionId: 'tabs' }] })).length, 1, 'no empty first-sale account');
assert.equal((await ok(send(first))).replayed, true, 'original receipt survives archive');
await set('farm_catalogs/food/products', 'cup', { archived: false, generation: 1, price: 999 });
await denied(send(body([item])), 'STALE_WRITE');
await set(col, 'cup', {
  name: 'סיבוב ב',
  price: 8,
  active: true,
  catalogId: 'food',
  catalogProductId: 'cup',
  catalogProductGeneration: 1,
});
await denied(send(body([{ ...item, price: 8 }])), 'STALE_WRITE');
await denied(send(body([{ ...item, catalogProductGeneration: 1 }])), 'STALE_WRITE');
assert.equal((await ok(send(first))).total, 17, 'a price change cannot alter an acknowledged receipt');
const current = { ...item, price: 8, catalogProductGeneration: 1 };
await set('farm_catalogs', 'food', { archived: true, generation: 1 });
await denied(send(body([plain, current])), 'STALE_WRITE');
await set('farm_catalogs', 'food', { archived: false, generation: 1 });
await denied(send(body([current])), 'STALE_WRITE');
await set(col, 'cup', {
  name: 'סיבוב ג',
  price: 8,
  active: true,
  catalogId: 'food',
  catalogProductId: 'cup',
  catalogGeneration: 1,
  catalogProductGeneration: 1,
});
const approved = { ...current, catalogGeneration: 1 };
const lost = fresh([approved]);
await denied(
  send(lost, 'volunteer', { headers: { 'x-test-fault': 'commit-timeout,read-lost:stall_sale_receipts' } }),
  'OUTCOME_UNKNOWN',
);
const recovered = await ok(send(lost));
assert.equal(recovered.replayed, true);
assert.equal((await doc('tabs', recovered.tabId)).items.length, 1);
const newOne = await ok(send(fresh([plain])));
assert.equal(newOne.tabId, recovered.tabId);
assert.equal((await doc('tabs', recovered.tabId)).total, 19);
await denied(
  send(fresh([plain], { guest: { uid: 'boss', ticketId: 'not-a-ticket', name: 'בדיקה', phone: '' } })),
  'VALIDATION_FAILED',
);
await fs.commit([fs.set('tabs', 'large', { ...baseTab, items: [], total: 0 }), fs.set('events', 'other', { stall: true })]);
await denied(send(body([plain], { eventId: 'other' })), 'STALE_WRITE');
const raceBuyer = { uid: '', ticketId: '', name: 'לקוח מקביל', phone: '050-000-0066' };
const concurrent = await Promise.all([
  ok(send(fresh([plain], { guest: raceBuyer }))),
  ok(send(fresh([approved], { guest: raceBuyer }))),
]);
assert.equal(concurrent[0].tabId, concurrent[1].tabId);
assert.equal((await doc('tabs', concurrent[0].tabId)).total, 19);
const rawKey = randomUUID(),
  rawLog =
    'pos_' +
    createHash('sha256')
      .update(JSON.stringify(['volunteer', rawKey]))
      .digest('hex');
await fs.commit([
  fs.set('tabs', 'raw', {
    ...baseTab,
    items: [
      history,
      {
        ...plain,
        name: 'שקית',
        at: '2030-01-01T00:00:00.000Z',
        by: { uid: 'volunteer', name: 'בדיקה' },
        saleOperation: rawKey,
      },
    ],
    total: 15,
  }),
  fs.set('activity', rawLog, {
    kind: 'tab',
    action: 'item',
    refId: 'raw',
    eventId: event,
    by: { uid: 'volunteer', name: 'בדיקה' },
  }),
]);
const rawRetry = body([plain], { operationId: rawKey, tabId: 'raw' });
assert.equal((await ok(send(rawRetry))).replayed, true);
await denied(send({ ...rawRetry, items: [{ ...plain, qty: 4 }] }), 'IDEMPOTENCY_CONFLICT');
assert.equal((await doc('tabs', 'raw')).total, 15);
const longItems = Array.from({ length: 500 }, (_, k) => ({
  productId: 'code-' + k + '-' + 'x'.repeat(40),
  qty: 1,
  price: 0.25,
  catalogId: 'source-' + k,
  catalogProductId: 'master-' + k,
  catalogGeneration: 1,
  catalogProductGeneration: 1,
}));
const setup = longItems.flatMap((i) => [
  fs.set('farm_catalogs', i.catalogId, { name: 'קטלוג בדיקה', generation: 1 }),
  fs.set('farm_catalogs/' + i.catalogId + '/products', i.catalogProductId, { name: 'מוצר מקור', price: 99, generation: 1 }),
  fs.set(col, i.productId, {
    name: 'מוצר בדיקה',
    price: 0.25,
    active: true,
    catalogId: i.catalogId,
    catalogProductId: i.catalogProductId,
    catalogGeneration: 1,
    catalogProductGeneration: 1,
  }),
]);
for (let k = 0; k < setup.length; k += 250) await fs.commit(setup.slice(k, k + 250));
const full = await ok(send(body(longItems, { tabId: 'large' })));
assert.equal(full.total, 125);
assert.equal((await doc('tabs', 'large')).items.length, 500);
await denied(send(body([plain], { tabId: 'large' })), 'VALIDATION_FAILED');
console.log(
  'PASS signed local POS: 500-line catalog checkout, mixed-cart refusal, generation and price checks, permanent receipts after timeout and archive, concurrent retry, historical items, authenticated roles, event state and read-only.',
);
