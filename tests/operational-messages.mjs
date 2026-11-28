// FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> node tests/operational-messages.mjs. No delivery provider is called.
import assert from 'node:assert/strict';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(host || ''))
  throw new Error('This test requires a loopback Firestore emulator');
const runId = randomUUID().slice(0, 8);
const project = 'demo-operations-' + runId;
const env = {
  FIRESTORE_PROJECT_ID: project,
  FIRESTORE_EMULATOR_HOST: host,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
};
const bundle = await build({
  stdin: {
    contents:
      "export {default as worker} from './api/src/index';export {allowsOperationalChannel} from './api/src/operationalMessages';export {Firestore} from './api/src/firestore'; export {runPush} from './api/src/push'; export {runEmail} from './api/src/email'",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { worker, Firestore, allowsOperationalChannel, runPush, runEmail } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const vapid = createECDH('prime256v1');
vapid.generateKeys();
const device = createECDH('prime256v1');
device.generateKeys();
const providerHost = '127.0.0.1:18788';
const acceptedMail = [],
  acceptedPush = [];
Object.assign(env, {
  TEST_FAULTS: '1',
  EMAIL_ENABLED: 'true',
  BREVO_API_KEY: 'local-example',
  BREVO_SENDER_EMAIL: 'example@example.test',
  BREVO_API_URL: 'http://' + providerHost + '/mail',
  PUSH_MODE: 'webpush',
  VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString('base64url'),
  VAPID_SUBJECT: 'mailto:example@example.test',
  PUSH_TEST_HOSTS: providerHost,
  FETCH: async (url, init) => {
    const u = new URL(url);
    if (u.host === host) return fetch(url, init);
    assert.equal(u.host, providerHost, 'only the local synthetic provider is callable');
    if (u.pathname === '/mail') {
      const mail = JSON.parse(init.body);
      assert(mail.to[0].email.endsWith('@example.test'));
      acceptedMail.push(mail);
      return Response.json({ messageId: 'test-' + acceptedMail.length });
    }
    assert(u.pathname.startsWith('/push/'));
    acceptedPush.push(u.pathname);
    return new Response(null, { status: 201 });
  },
});
const db = new Firestore(env);
const id = label => runId + '-' + label;
const auth = uid => {
  const b = x => Buffer.from(JSON.stringify(x)).toString('base64url'),
    seconds = Math.floor(Date.now() / 1000);
  return new Request('http://127.0.0.1/v1/test', {
    method: 'POST',
    headers: {
      authorization:
        'Bearer ' +
        b({ alg: 'none' }) +
        '.' +
        b({
          sub: uid,
          aud: project,
          iss: 'https://securetoken.google.com/' + project,
          iat: seconds,
          exp: seconds + 3600,
        }) +
        '.',
    },
  });
};
const refs = Object.fromEntries(
  ['boss', 'crew', 'guest', 'stall', 'newStall', 'declined', 'inactive', 'eve', 'cashier', 'visitor'].map(k => [
    k,
    id(k),
  ]),
);
const p = (key, role, num, active = true) =>
  db.create('users', refs[key], {
    displayName: key,
    role,
    status: active ? 'active' : 'blocked',
    phone: '050000' + String(num).padStart(4, '0'),
    email: key + '@example.test',
    ...(role === 'vendor' ? { vendorId: id('stall-' + key) } : {}),
    push: {
      enabled: key !== 'newStall',
      devices: [
        {
          kind: 'webpush',
          endpoint: 'http://' + providerHost + '/push/' + key,
          keys: { p256dh: device.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
        },
      ],
      kinds: ['event'],
    },
  });
const event = refs.eve;
const ticket = (name, key, properties = {}) =>
  db.create('tickets', id(name), {
    ownerUid: refs[key],
    ownerName: key,
    ownerPhone: '0500000025',
    status: 'valid',
    paymentStatus: 'free',
    eventId: event,
    orderId: id('ord-' + name),
    ...properties,
  });
const proofs = (name, key) =>
  db.create('activity', id('proof-' + name), {
    kind: 'ticket',
    action: 'ordered',
    eventId: event,
    refId: id('ord-' + name),
    by: { uid: refs[key] },
    subjectUid: refs[key],
  });
await db.commit([
  p('boss', 'manager', 1),
  p('crew', 'staff', 2),
  p('guest', 'guest', 3),
  p('stall', 'vendor', 4),
  p('newStall', 'guest', 5),
  p('declined', 'vendor', 6),
  p('inactive', 'guest', 7, false),
  p('cashier', 'manager', 8),
  p('visitor', 'guest', 9),
  db.create('events', event, { title: 'אירוע דמיוני' }),
  ticket('guest-ticket', 'guest', { selfRegistered: true }),
  ticket('guest-duplicate', 'guest', { selfRegistered: true }),
  ticket('crew-ticket', 'crew'),
  proofs('crew-ticket', 'crew'),
  ticket('cancelled', 'declined', { selfRegistered: true, status: 'cancelled' }),
  ticket('blocked', 'inactive', { selfRegistered: true }),
  ticket('manual', 'cashier', { ownerName: 'מוזמן בדוי', ownerPhone: '0500000098', selfRegistered: false }),
  ticket('old-manual', 'cashier', { ownerName: 'cashier', ownerPhone: '0500000008' }),
  ticket('walk-in', 'cashier', { walkIn: true }),
  ticket('test', 'declined', { selfRegistered: true, isTest: true }),
  db.create('events/' + event + '/staffing', 'a', { people: [{ uid: refs.crew }, { uid: refs.guest }] }),
  db.create('events/' + event + '/vendors', id('stall-stall'), { vendorId: id('stall-stall'), status: 'confirmed' }),
  db.create('events/' + event + '/vendors', id('stall-declined'), {
    vendorId: id('stall-declined'),
    status: 'invited',
  }),
  db.create('events/' + event + '/vendor_applications', refs.newStall, { ownerUid: refs.newStall, status: 'approved' }),
]);
const command = {
  operationId: id('notice'),
  eventId: event,
  groups: ['registrants', 'crew', 'approvedVendors'],
  channels: ['whatsapp', 'push', 'email'],
  text: 'תזכורת דמיונית',
};
const call = async (source, input, who = refs.boss) => {
  const origin = 'http://127.0.0.1:18777';
  const path = source === 'event' ? '/v1/event-reminders' : '/v1/visit-notices';
  const req = new Request(origin + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      authorization: auth(who).headers.get('authorization'),
    },
    body: JSON.stringify(input),
  });
  const res = await worker.fetch(req, env);
  assert.equal(res.headers.get('access-control-allow-origin'), origin);
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error.message), { code: body.error.code });
  return body.data;
};
await assert.rejects(call('event', command, refs.crew), e => e.code === 'FORBIDDEN');
await assert.rejects(call('event', { ...command, recipients: [refs.boss] }), e => e.code === 'VALIDATION_FAILED');
const sent = await call('event', command);
assert.equal(sent.created, 3);
assert.equal(sent.queued, 5);
assert.equal(sent.drafts.length, 6);
assert.equal(sent.pending, false);
assert.deepEqual(await call('event', command), sent);
await assert.rejects(call('event', { ...command, text: 'תוכן אחר' }), e => e.code === 'IDEMPOTENCY_CONFLICT');
const scoped = (col, attr, v) =>
  db.query({
    from: [{ collectionId: col }],
    where: { fieldFilter: { field: { fieldPath: attr }, op: 'EQUAL', value: { stringValue: v } } },
  });
const plans = await scoped('operational_notices', 'sourceId', event);
assert.equal(plans.length, 1);
const plan = plans[0];
assert.deepEqual(plan.data.emailUids.slice().sort(), [refs.crew, refs.guest, refs.stall, refs.newStall].sort());
assert(!allowsOperationalChannel(plan.data, refs.cashier, 'push'));
assert(!allowsOperationalChannel(plan.data, refs.newStall, 'push'));
assert(allowsOperationalChannel(plan.data, refs.guest, 'email'));
const mail = await scoped('email_outbox', 'operationalId', plan.id),
  push = await scoped('push_jobs', 'operationalId', plan.id);
assert.equal(mail.length, 4);
assert.equal(push.length, 1);
assert.equal(push[0].data.to.length, 3);
assert(mail.every(m => m.data.status === 'queued'));
const text = 'בקשת הביקור הדמיונית נדחתה',
  updated = '2026-11-19T12:00:00.000Z';
const visit = id('visit');
await db.commit([
  db.create('visits', visit, {
    uid: refs.visitor,
    name: 'מבקש דוגמה',
    date: '2026-12-11',
    phone: '0500000009',
    people: 2,
    status: 'new',
    updatedAt: updated,
    managerNote: 'הערה פנימית',
  }),
  db.create('notifications', id('vnote'), { type: 'visit', refId: visit, handled: false }),
]);
const decision = {
  operationId: id('reply'),
  visitId: visit,
  text,
  channels: ['whatsapp', 'email'],
  decision: { status: 'rejected', expectedUpdatedAt: updated, managerNote: 'תזכורת לצוות בלבד' },
};
const reply = await call('visit', decision);
assert.deepEqual([reply.created, reply.queued, reply.drafts.length], [1, 1, 1]);
assert.match(reply.drafts[0].url, /972500000009/);
assert.equal((await db.get('visits', visit)).data.managerNote, 'הערה פנימית');
assert.equal((await db.get('visits/' + visit + '/private', 'staff')).data.note, decision.decision.managerNote);
assert(!JSON.stringify((await db.get('visits', visit)).data).includes(decision.decision.managerNote));
assert.equal((await db.get('notifications', id('vnote'))).data.handled, true);
assert.equal(await db.get('calendar', 'visit_' + visit), null);
assert.deepEqual(await call('visit', decision), reply);
await assert.rejects(call('visit', { ...decision, operationId: id('stale') }), e => e.code === 'STALE_WRITE');
const scheduled = id('scheduled');
await db.commit([
  db.create('visits', scheduled, {
    uid: refs.visitor,
    name: 'אורחת דוגמה',
    date: '2026-12-01',
    people: 2,
    status: 'new',
    updatedAt: updated,
    managerNote: 'הערה פנימית שנשמרת',
  }),
]);
const approve = {
  operationId: id('approve'),
  visitId: scheduled,
  text: 'המועד עודכן',
  channels: [],
  decision: { status: 'approved', date: '2026-12-03', time: '10:30', expectedUpdatedAt: updated },
};
const approvals = await Promise.all([call('visit', approve), call('visit', approve)]);
assert.deepEqual(approvals[0], approvals[1]);
assert.equal(approvals[0].created, 1);
assert.equal(approvals[0].queued, 0);
const calendar = (await db.get('calendar', 'visit_' + scheduled)).data;
assert.equal(calendar.date, '2026-12-03');
assert.equal(calendar.time, '10:30');
assert.equal((await db.get('visits', scheduled)).data.date, '2026-12-01');
const versionOf = async visitId => (await db.get('visits', visitId)).data.updatedAt;
const reschedule = {
  ...approve,
  operationId: id('reschedule'),
  decision: { status: 'approved', date: '2026-12-04', time: '09:00', expectedUpdatedAt: await versionOf(scheduled) },
};
await call('visit', reschedule);
const revision = (await db.get('calendar', 'visit_' + scheduled)).data;
assert.equal(revision.date, '2026-12-04');
assert.equal(revision.createdAt, calendar.createdAt);
const withdraw = {
  ...approve,
  operationId: id('withdraw'),
  decision: { status: 'rejected', expectedUpdatedAt: await versionOf(scheduled) },
};
const withdrawal = await call('visit', withdraw);
assert.deepEqual(await call('visit', withdraw), withdrawal);
const withdrawn = (await db.get('visits', scheduled)).data;
assert.equal(withdrawn.status, 'rejected');
assert.equal(withdrawn.approvedDate, '');
assert.equal(withdrawn.approvedTime, '');
assert.equal(withdrawn.requestedDate, '2026-12-01');
assert.equal(withdrawn.managerNote, 'הערה פנימית שנשמרת');
assert.equal(await db.get('calendar', 'visit_' + scheduled), null);
await assert.rejects(call('visit', { ...withdraw, operationId: id('late-withdraw') }), e => e.code === 'STALE_WRITE');
await call('visit', {
  ...approve,
  operationId: id('restore'),
  decision: { ...approve.decision, expectedUpdatedAt: withdrawn.updatedAt },
});
assert.equal((await scoped('calendar', 'refId', scheduled)).length, 1);
const cancelled = id('cancelled-visit');
await db.commit([
  db.create('visits', cancelled, {
    uid: refs.visitor,
    name: 'מבקר דוגמה',
    date: '2026-12-01',
    people: 1,
    status: 'cancelled',
    updatedAt: updated,
  }),
]);
await call('visit', { ...approve, visitId: cancelled, operationId: id('restore-cancelled') });
assert.equal((await db.get('visits', cancelled)).data.status, 'approved');
assert.equal((await db.get('calendar', 'visit_' + cancelled)).data.refId, cancelled);
if (process.argv.includes('--providers')) {
  const pushed = await runPush(env);
  assert.deepEqual(acceptedPush.slice().sort(), ['/push/crew', '/push/guest', '/push/stall'], JSON.stringify(pushed));
  const emailed = await runEmail(env);
  assert.deepEqual(
    acceptedMail.map(m => m.to[0].email).sort(),
    ['crew@example.test', 'guest@example.test', 'newStall@example.test', 'stall@example.test', 'visitor@example.test'],
    JSON.stringify(emailed),
  );
  assert(acceptedMail.every(m => [command.text, text].includes(m.textContent)));
  await runPush(env);
  await runEmail(env);
  assert.equal(acceptedPush.length, 3);
  assert.equal(acceptedMail.length, 5);
  console.log(
    'PASS actual Worker dispatch to loopback provider doubles: three encrypted pushes and five synthetic mails, with no duplicate after redraining',
  );
}
console.log(
  'PASS event and visit HTTP routes: manager authorization, legacy identity, group deduplication, approved stalls, channel eligibility, local outboxes, replay, concurrent approval, private note storage, rescheduling, rejection and reopening',
);
