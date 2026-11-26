import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { testOwner, webview, adb, tapSystem } from './android-survey-recorder.mjs';
const app = 'com.menis10tec.havatravve',
  prefix = 'android.permission.ACCESS_',
  user = await testOwner();
const start = () => adb('shell', 'am', 'start', '-n', app + '/.MainActivity');
const set = (cmd, p) => adb('shell', 'pm', cmd, app, prefix + p + '_LOCATION');
const keyArgs = { uid: user.localId, token: user.idToken };
let ui,
  mockProvider = false;
const call = (name, args) =>
  ui.evaluate('Capacitor.nativePromise("FarmSurvey",' + JSON.stringify(name) + ',' + JSON.stringify(args) + ')');
try {
  set('revoke', 'FINE');
  set('revoke', 'COARSE');
  for (const p of ['FINE', 'COARSE'])
    adb('shell', 'pm', 'clear-permission-flags', app, prefix + p + '_LOCATION', 'user-set', 'user-fixed');
  start();
  ui = await webview();
  const k = await call('authorize', keyArgs);
  let request = call('ask', k);
  await tapSystem('permission_deny_button');
  assert.equal((await request).level, 'denied');
  request = call('ask', k);
  await tapSystem('permission_deny(?:_and_dont_ask_again)?_button');
  assert.equal((await request).level, 'blocked');
  await call('settings', { ...k, target: 'app' });
  await delay(600);
  assert.match(
    adb('shell', 'dumpsys', 'activity', 'activities')
      .split('\n')
      .find((l) => l.includes('topResumedActivity')),
    /settings/
  );
  set('grant', 'COARSE');
  adb('shell', 'input', 'keyevent', '4');
  await delay(700);
  assert.equal((await call('status', k)).level, 'approximate');
  await assert.rejects(call('control', { ...k, action: 'start', id: '' }));
  set('grant', 'FINE');
  assert.equal((await call('status', k)).level, 'precise');
  adb('shell', 'cmd', 'location', 'set-location-enabled', 'false');
  await delay(500);
  assert.equal((await call('status', k)).enabled, false);
  await call('settings', { ...k, target: 'device' });
  await delay(400);
  adb('shell', 'cmd', 'location', 'set-location-enabled', 'true');
  adb('shell', 'input', 'keyevent', '4');
  await delay(600);
  assert.equal((await call('status', k)).enabled, true);
  adb('shell', 'appops', 'set', 'com.android.shell', 'android:mock_location', 'allow');
  adb('shell', 'cmd', 'location', 'providers', 'add-test-provider', 'gps');
  mockProvider = true;
  adb('shell', 'cmd', 'location', 'providers', 'set-test-provider-enabled', 'gps', 'true');
  await delay(4200);
  assert.equal(
    await ui.evaluate(
      'Capacitor.nativePromise("FarmSurvey","readFix",' + JSON.stringify(k) + ').then(() => null, e => e.code)'
    ),
    'timeout'
  );
  const fresh = call('readFix', k);
  adb(
    'shell',
    'cmd',
    'location',
    'providers',
    'set-test-provider-location',
    'gps',
    '--location',
    '50,10',
    '--accuracy',
    '9'
  );
  assert.equal((await fresh).accuracy, 9);
  console.log(
    'PASS runtime denial, blocked requests, app settings, approximate/precise, disabled services, device settings, native timeout and immediate fresh fix'
  );
} finally {
  if (mockProvider) adb('shell', 'cmd', 'location', 'providers', 'remove-test-provider', 'gps');
  adb('shell', 'cmd', 'location', 'set-location-enabled', 'true');
  ui?.close();
}
