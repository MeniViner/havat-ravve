// Dedicated emulator only. Build debug with -PsurveyTestBackend=true and reverse ports 8080/9099.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const app = 'com.menis10tec.havatravve';
export const adb = (...args) => {
  assert.match(process.env.ANDROID_SERIAL || '', /^emulator-\d+$/);
  return execFileSync('adb', ['-s', process.env.ANDROID_SERIAL, ...args], { encoding: 'utf8' }).trim();
};
export async function testOwner() {
  const email = 'farm-owner@example.test';
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=test',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        postBody: new URLSearchParams({
          providerId: 'google.com',
          id_token: JSON.stringify({ sub: 'farm-survey-owner', email, email_verified: true, name: 'בעלי החווה' }),
        }).toString(),
        requestUri: 'http://localhost',
        returnSecureToken: true,
      }),
    }
  );
  const user = await response.json();
  assert.ok(response.ok, JSON.stringify(user.error));
  const profile = {
    uid: user.localId,
    email,
    displayName: 'בעלי החווה',
    role: 'owner',
    status: 'active',
    phone: '0500000000',
    createdAt: new Date().toISOString(),
    welcomeDone: true,
  };
  const fields = Object.fromEntries(
    Object.entries(profile).map(([k, v]) => [k, typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v }])
  );
  const seeded = await fetch(
    'http://127.0.0.1:8080/v1/projects/demo-havat-ravve/databases/(default)/documents/users/' + user.localId,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  assert.ok(seeded.ok, await seeded.text());
  return user;
}
export async function webview() {
  let port, page;
  for (let i = 0; i < 28 && !page; i++) {
    try {
      const pid = adb('shell', 'pidof', app);
      port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      page = list.find((p) => p.webSocketDebuggerUrl && p.url?.startsWith('https://localhost'));
    } catch {}
    if (!page) {
      if (port) adb('forward', '--remove', 'tcp:' + port);
      await delay(500);
    }
  }
  assert.ok(page, 'App WebView became ready');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  let id = 0;
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const handler = (ev) => {
        const res = JSON.parse(ev.data);
        if (res.id !== n) return;
        socket.removeEventListener('message', handler);
        if (res.result?.exceptionDetails || res.error)
          reject(Error(res.result?.result?.description || JSON.stringify(res.error)));
        else resolve(res.result?.result?.value);
      };
      socket.addEventListener('message', handler);
      socket.send(
        JSON.stringify({
          id: n,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true, userGesture: true },
        })
      );
    });
  for (let i = 0; i < 40 && !(await evaluate('typeof Capacitor!=="undefined" && !!Capacitor.nativePromise')); i++)
    await delay(250);
  return {
    evaluate,
    close: () => {
      socket.close();
      adb('forward', '--remove', 'tcp:' + port);
    },
  };
}
export async function tapSystem(id) {
  for (let i = 0; i < 7; i++) {
    await delay(250);
    adb('shell', 'uiautomator', 'dump', '/sdcard/window-survey.xml');
    const xml = adb('shell', 'cat', '/sdcard/window-survey.xml');
    const node = xml.match(new RegExp('<node [^>]*resource-id="[^"]*:id/' + id + '"[^>]*>'))?.[0];
    const b = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (b) {
      adb('shell', 'input', 'tap', String((+b[1] + +b[3]) >> 1), String((+b[2] + +b[4]) >> 1));
      return;
    }
  }
  throw Error('Missing Android dialog control ' + id);
}
async function run() {
  const user = await testOwner(),
    ui = await webview();
  const call = (name, args) =>
    ui.evaluate('Capacitor.nativePromise("FarmSurvey",' + JSON.stringify(name) + ',' + JSON.stringify(args) + ')');
  try {
    await assert.rejects(call('status', { key: 'invalid' }));
    const key = await call('authorize', { uid: user.localId, token: user.idToken });
    let status = await call('status', key);
    if (status.level !== 'precise') {
      const p = call('ask', key);
      await tapSystem('permission_allow_foreground_only_button');
      assert.equal((await p).level, 'precise');
    }
    if (!status.notifications) {
      const p = call('askNotifications', key);
      await tapSystem('permission_allow_button');
      assert.equal((await p).notifications, true);
    }
    if (status.session) {
      if (status.session.state !== 'review')
        await call('control', { ...key, action: 'finish', id: status.session.id });
      await call('control', { ...key, action: 'saved', id: status.session.id });
    }
    adb('emu', 'geo', 'fix', '10.00000', '50.00000');
    const s = (await call('control', { ...key, action: 'start', id: '' })).session;
    assert.equal((await call('control', { ...key, action: 'start', id: '' })).session.id, s.id);
    await delay(3500);
    adb('shell', 'input', 'keyevent', '223');
    const deviceTime = () => Number(adb('shell', 'date', '+%s')) * 1000;
    for (let i = 0; i < 30 && !adb('shell', 'dumpsys', 'power').includes('mWakefulness=Asleep'); i++)
      await delay(500);
    const from = deviceTime();
    assert.ok(adb('shell', 'dumpsys', 'power').includes('mWakefulness=Asleep'), 'screen asleep');
    for (const [lon, lat] of [
      [10.00003, 50],
      [10.00007, 50],
      [10.00007, 50.00004],
      [10.00007, 50.00008],
      [10.00003, 50.00008],
    ]) {
      adb('emu', 'geo', 'fix', String(lon), String(lat));
      await delay(3400);
    }
    const until = deviceTime();
    adb('shell', 'input', 'keyevent', '224');
    adb('shell', 'wm', 'dismiss-keyguard');
    adb('shell', 'am', 'start', '-W', '-a', 'android.settings.SETTINGS');
    const foreground = () =>
      adb('shell', 'dumpsys', 'activity', 'activities')
        .split('\n')
        .find((line) => line.includes('topResumedActivity')) || '';
    assert.match(foreground(), /com.android.settings/);
    const otherFrom = deviceTime();
    await delay(3500);
    adb('emu', 'geo', 'fix', '10.00001', '50.00008');
    await delay(3300);
    assert.match(foreground(), /com.android.settings/);
    const otherUntil = deviceTime();
    adb('shell', 'am', 'start', '-n', app + '/.MainActivity');
    const rows = (await call('samples', { ...key, id: s.id, after: 0 })).items;
    const locked = rows.filter((p) => p.at > from + 1000 && p.at < until);
    assert.ok(locked.length >= 3);
    assert.ok(new Set(locked.map((p) => p.lat)).size >= 2 && new Set(locked.map((p) => p.lng)).size >= 2);
    const other = rows.filter((p) => p.at > otherFrom + 1000 && p.at < otherUntil);
    assert.ok(other.length);
    await call('control', { ...key, id: s.id, action: 'pause' });
    await delay(600);
    await call('control', { ...key, id: s.id, action: 'resume' });
    await delay(3200);
    adb('emu', 'geo', 'fix', '10.00001', '50.00009');
    await delay(3300);
    console.log(
      JSON.stringify({
        android: adb('shell', 'getprop', 'ro.build.version.release'),
        sdk: adb('shell', 'getprop', 'ro.build.version.sdk'),
        session: s.id,
        lockFrom: from,
        lockUntil: until,
        locked: locked.map((p) => ({ seq: p.seq, at: p.at, lat: p.lat, lng: p.lng })),
        otherFrom,
        otherUntil,
        otherAppSamples: other.map(({ at, seq }) => ({ at, seq })),
      })
    );
    adb('shell', 'am', 'force-stop', app);
    adb('shell', 'am', 'start', '-n', app + '/.MainActivity');
    await delay(2500);
    const reopened = await webview();
    try {
      const st = await reopened.evaluate(
        'Capacitor.nativePromise("FarmSurvey","status",' + JSON.stringify(key) + ')'
      );
      assert.equal(st.session.id, s.id);
      assert.equal(st.session.state, 'interrupted');
      assert.ok(st.session.count >= rows.length);
      console.log('PASS recovered interrupted session; stored samples', st.session.count);
    } finally {
      reopened.close();
    }
  } finally {
    ui.close();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await run();
