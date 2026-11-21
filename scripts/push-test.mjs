// Phone push test tool (docs/push-setup.md). Uses the Worker's own sender code (api/src/webpush.ts, api/src/fcm.ts),
// bundled on the fly, so a test here proves exactly what the cron will send. It never reads or writes Firestore.
//
//   node scripts/push-test.mjs --generate
//       prints a new VAPID key pair (do this once; put the values in Worker secrets, never in the repo)
//
//   VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:… node scripts/push-test.mjs --sub=device.json [--send]
//       one Web Push to one subscription. device.json is the device entry from users/{uid}.push.devices
//       (or a browser's PushSubscription.toJSON()): { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
//
//   FCM_SERVICE_ACCOUNT=./sa.json FCM_PROJECT_ID=havat-ravve node scripts/push-test.mjs --fcm-token=TOKEN [--send]
//       one FCM message to one registration token
//
// Without --send it only prints what it would send. Options: --title=… --body=… --link=/notifications --urgent
import { build } from 'esbuild';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (name) => { const a = process.argv.find((x) => x === '--' + name || x.startsWith('--' + name + '=')); return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const die = (msg) => { console.error(msg); process.exit(1); };

if (arg('generate')) {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
  console.log('New VAPID keys. Keep the private key secret: paste it only into `wrangler secret put VAPID_PRIVATE_KEY`.\n');
  console.log('VAPID_PUBLIC_KEY=' + pub);
  console.log('VAPID_PRIVATE_KEY=' + jwk.d);
  process.exit(0);
}

const payload = {
  title: String(arg('title') || 'בדיקת התראה מחוות רווה'),
  body: String(arg('body') || 'אם זה הגיע, ההתראות לטלפון עובדות.'),
  link: String(arg('link') || '/notifications'),
  tag: 'push-test',
  urgent: !!arg('urgent'),
};
const send = !!arg('send');
const subPath = arg('sub'), fcmToken = arg('fcm-token');
if (!subPath && !fcmToken) die('Nothing to do. Use --generate, --sub=device.json or --fcm-token=TOKEN (see the top of this file).');

// bundle the Worker's sender modules to a temp file and import them (Node has WebCrypto, fetch, atob and btoa)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'push-test-'));
const outfile = path.join(tmp, 'senders.mjs');
fs.writeFileSync(path.join(tmp, 'entry.ts'), `export * from ${JSON.stringify(path.resolve('api/src/webpush.ts'))};\nexport * from ${JSON.stringify(path.resolve('api/src/fcm.ts'))};\n`);
await build({ entryPoints: [path.join(tmp, 'entry.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'error' });
const m = await import(outfile);
fs.rmSync(tmp, { recursive: true, force: true });

if (subPath) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !/^(mailto:|https:)/.test(VAPID_SUBJECT || '')) die('Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:… or https://…) in the environment.');
  let sub;
  try { sub = JSON.parse(fs.readFileSync(String(subPath), 'utf8')); } catch (e) { die('Could not read ' + subPath + ': ' + e.message); }
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) die(subPath + ' needs endpoint, keys.p256dh and keys.auth.');
  if (!m.allowedEndpoint(sub.endpoint)) die('The endpoint is not a push service the Worker sends to (Google, Mozilla, Apple, Microsoft).');
  const host = new URL(sub.endpoint).host;
  if (!send) { console.log(`Would send to ${host}:`, payload, '\nAdd --send to send it.'); process.exit(0); }
  const r = await m.sendWebPush({ endpoint: sub.endpoint, keys: sub.keys }, payload, { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT }, { ttl: 600, urgency: payload.urgent ? 'high' : 'normal', topic: payload.tag });
  console.log(`${host}: HTTP ${r.status}`, r.ok ? 'sent' : r.gone ? 'the subscription is gone (the phone unsubscribed or the app was removed)' : r.retry ? 'the push service is busy, try again' : 'refused (check that VAPID_PUBLIC_KEY is the key the phone subscribed with)');
  process.exit(r.ok ? 0 : 1);
}

if (fcmToken) {
  let sa = process.env.FCM_SERVICE_ACCOUNT || '';
  if (sa && !sa.trim().startsWith('{')) { try { sa = fs.readFileSync(sa, 'utf8'); } catch (e) { die('Could not read FCM_SERVICE_ACCOUNT: ' + e.message); } }
  const env = { FCM_SERVICE_ACCOUNT: sa, FCM_PROJECT_ID: process.env.FCM_PROJECT_ID || '' };
  if (!m.fcmConfigured(env)) die('Set FCM_SERVICE_ACCOUNT (a JSON file or its content) and FCM_PROJECT_ID.');
  if (!send) { console.log(`Would send through FCM (${env.FCM_PROJECT_ID}):`, payload, '\nAdd --send to send it.'); process.exit(0); }
  const r = await m.sendFcm(env, String(fcmToken), { ...payload, ttl: 600 });
  console.log(`FCM: HTTP ${r.status}`, r.ok ? 'sent' : r.gone ? 'the token is no longer registered' : 'refused');
  process.exit(r.ok ? 0 : 1);
}
