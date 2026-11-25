// Permission and notification channel smoke test. Run with the debug APK open
// on a fresh, offline Android emulator. This test never registers an FCM token.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const serial = process.env.ANDROID_SERIAL || '';
assert.match(serial, /^emulator-[0-9]+$/, 'Set ANDROID_SERIAL to an emulator; this changes only the emulator permission.');
const app = 'com.menis10tec.havatravve';
const adb = (...args) => promisify(execFile)('adb', ['-s', serial, ...args]).then((r) => r.stdout.trim());
const pid = await adb('shell', 'pidof', app);
assert.match(pid, /^\d+$/);
const port = await adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
let socket;
try {
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json());
  const page = pages.find((entry) => entry.url.startsWith('https://localhost/'));
  assert.ok(page?.webSocketDebuggerUrl, 'Use a debug APK with WebView debugging enabled.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', listener);
      if (message.error || message.result?.exceptionDetails) reject(new Error('Android WebView evaluation failed'));
      else resolve(message.result?.result?.value);
    };
    socket.addEventListener('message', listener);
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: true } }));
  });
  assert.equal(await evaluate("Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PushNotifications') && Capacitor.isPluginAvailable('AndroidNotificationSettings')"), true);
  assert.equal((await evaluate('Capacitor.Plugins.AndroidNotificationSettings.allowed()')).allowed, false);
  const permission = evaluate('Capacitor.Plugins.PushNotifications.requestPermissions()');
  const remoteDump = '/sdcard/farm-push-test-window.xml';
  let allow;
  for (let attempt = 0; attempt < 4 && !allow; attempt++) {
    await delay(400);
    await adb('shell', 'uiautomator', 'dump', remoteDump);
    const xml = await adb('shell', 'cat', remoteDump);
    const button = /<node [^>]*resource-id="[^"]+:id\/permission_allow_button"[^>]*>/.exec(xml)?.[0];
    allow = button && /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(button);
  }
  assert.ok(allow, 'The native permission dialog appeared.');
  const [x0, y0, x1, y1] = allow.slice(1).map(Number);
  await adb('shell', 'input', 'tap', String((x0 + x1) >> 1), String((y0 + y1) >> 1));
  assert.equal((await permission).receive, 'granted');
  await evaluate("Capacitor.Plugins.PushNotifications.createChannel({ id: 'farm_updates', name: 'הודעות מחוות רווה', importance: 4, visibility: 0 })");
  assert.equal((await evaluate('Capacitor.Plugins.AndroidNotificationSettings.allowed()')).allowed, true);
  assert.ok((await evaluate('Capacitor.Plugins.PushNotifications.listChannels()')).channels.some((channel) => channel.id === 'farm_updates' && channel.importance === 4));
  console.log('PASS: Android runtime permission prompt, native notification setting and high-importance notification channel.');
} finally {
  socket?.close();
  await adb('forward', '--remove', 'tcp:' + port);
}
