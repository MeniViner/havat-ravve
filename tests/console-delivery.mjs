import assert from 'node:assert/strict';
import { build } from 'esbuild';

await build({ entryPoints: ['src/console/delivery.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.build/console-delivery.mjs' });
const { sendingSwitches, monitorAlertControls, testAlertText } = await import('../.build/console-delivery.mjs');

const switches = { emailPaused: false, pushPaused: false, broadcastEmailPaused: false };
const server = { email: { on: false, configured: false }, push: { mode: 'off' } };
const off = sendingSwitches({ switches, server });
for (const key of ['email', 'push', 'broadcast']) {
  assert.equal(off[key].on, false);
  assert.equal(off[key].blocked, true);
  assert.match(off[key].text, /צריך להפעיל/);
}
assert.match(sendingSwitches({ switches, server: {
  email: { on: false, configured: true }, push: { mode: 'off', missing: 'configuration' },
} }).push.text, /להשלים את החיבור/);

const configured = { email: { on: true, configured: true }, push: { mode: 'webpush' } };
const active = sendingSwitches({ switches, server: configured });
const paused = sendingSwitches({ switches: { emailPaused: true, pushPaused: true, broadcastEmailPaused: true }, server: configured });
for (const key of ['email', 'push', 'broadcast']) {
  assert.equal(active[key].on, true);
  assert.equal(paused[key].on, false);
  assert.equal(paused[key].blocked, false);
  assert.match(paused[key].text, /בהשהיה/);
}
const alerts = { on: true, push: true, daily: true };
const m = { alerts, pushState: 'enabled', alertsAvailable: true, monitorPaused: false };
const enabled = monitorAlertControls(m);
for (const key of ['app', 'phone', 'daily']) {
  assert.equal(enabled[key].on, true);
  const paused = monitorAlertControls({ ...m, monitorPaused: true })[key];
  assert.equal(paused.on, false);
  assert.equal(paused.blocked, true);
  assert.match(paused.text, /משימות מתוזמנות/);
}
for (const state of ['off', 'paused', undefined]) {
  const c = monitorAlertControls({ ...m, pushState: state });
  assert.equal(c.phone.on, false);
  assert.equal(c.phone.blocked, true);
  assert.equal(c.daily.on, true);
}
const disabled = monitorAlertControls({ ...m, alerts: { ...alerts, on: false } });
assert.equal(disabled.app.blocked, false);
assert.equal(disabled.phone.blocked, true);
assert.equal(disabled.daily.blocked, true);
assert.match(testAlertText({ accepted: true, created: 1, queued: 1, pushState: 'off' }), /נשמרה.*נוספה לתור.*כבויה בשרת/);
assert.match(testAlertText({ accepted: true, created: 1, queued: 1, pushState: 'enabled' }), /לתור השליחה לטלפון/);
assert.doesNotMatch(testAlertText({ accepted: true, created: 1, queued: 0 }), /לטלפון/);
console.log('PASS: console delivery switches and test-alert receipt');
