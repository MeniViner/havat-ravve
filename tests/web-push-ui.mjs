// Run after npm run build inside firebase emulators:exec --only firestore,auth.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const project = 'demo-havat-ravve';
const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
for (const host of [fsHost, authHost]) assert.match(host || '', /^(localhost|127\.0\.0\.1):[0-9]+$/);
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic';
const vapidPublicKey = Buffer.from([4, ...new Uint8Array(64)]).toString('base64url');
const docUrl = `http://${fsHost}/v1/projects/${project}/databases/(default)/documents`;
const headers = { authorization: 'Bearer owner', 'content-type': 'application/json' };
const enc = (value) => {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(enc) } };
  return { mapValue: { fields: fields(value) } };
};
const fields = (value) => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, enc(v)]));
const write = async (name, data) => {
  const res = await fetch(docUrl + '/' + name, { method: 'PATCH', headers, body: JSON.stringify({ fields: fields(data) }) });
  assert.equal(res.ok, true, await res.text());
};

const bundle = await build({
  entryPoints: ['src/app-entry.tsx'], bundle: true, format: 'esm', jsx: 'automatic',
  outfile: 'app.js', write: false, external: ['/assets/*'],
  plugins: [{
    name: 'push-ui-emulators',
    setup(b) {
      b.onLoad({ filter: /site\.config\.json$/ }, async ({ path }) => {
        const config = JSON.parse(await readFile(path, 'utf8'));
        config.firebase = { projectId: project, apiKey: 'push-ui-fake-key', authDomain: 'localhost', appId: 'push-ui' };
        return { contents: JSON.stringify(config), loader: 'json' };
      });
      b.onLoad({ filter: /src\/app\/firebase\.ts$/ }, async ({ path: file }) => {
        const source = (await readFile(file, 'utf8')).replace(/const useEmulator = .*;/, 'const useEmulator = true;')
          .replace("connectFirestoreEmulator(db, 'localhost', 8080)", `connectFirestoreEmulator(db, '${fsHost.split(':')[0]}', ${fsHost.split(':')[1]})`)
          .replace("'http://localhost:9099'", JSON.stringify('http://' + authHost));
        assert.ok(source.includes('const useEmulator = true;'));
        return {
          contents: source + `
            import { signInWithCredential } from 'firebase/auth';
            (window as any).testSignIn = async () => {
              const auth = await readyAuth();
              const credential = GoogleAuthProvider.credential(JSON.stringify({
                sub: 'synthetic-web-push', email: 'web-push@synthetic.invalid', email_verified: true,
                name: 'בדיקת התראות'
              }));
              return (await signInWithCredential(auth, credential)).user.uid;
            };
          `, loader: 'ts', resolveDir: path.dirname(file),
        };
      });
    },
  }],
});
const files = new Map(bundle.outputFiles.map((file) => [path.basename(file.path), file.contents]));
const server = http.createServer(async (req, res) => {
  const uri = new URL(req.url, 'http://localhost').pathname;
  if (uri === '/site.js') return res.writeHead(204).end();
  const filename = uri === '/' ? 'index.html' : uri === '/app' || uri.startsWith('/app/') ? 'app.html' : uri.slice(1);
  if (filename.includes('..')) return res.writeHead(404).end();
  const data = files.get(filename) || await readFile('dist/' + filename).catch(() => null);
  if (!data) return res.writeHead(404).end();
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
  return res.writeHead(200, { 'content-type': mime[path.extname(filename)] || 'application/octet-stream' }).end(data);
});
await new Promise((resolve) => server.listen(0, 'localhost', resolve));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();

async function setup({ ios = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: ios ? 375 : 1440, height: 900 }, serviceWorkers: 'block',
    ...(ios ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1' } : {}),
  });
  const origins = new Set([base, 'http://' + fsHost, 'http://' + authHost]);
  await context.route('**/*', (route) => origins.has(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await context.addInitScript(({ endpoint }) => {
    let permission = 'default';
    let sub;
    window.permissionPrompts = 0;
    Object.defineProperties(Notification, {
      permission: { get: () => permission, configurable: true },
      requestPermission: { value: async () => {
        window.permissionPrompts++;
        assertGesture();
        return permission = 'granted';
      } },
    });
    function assertGesture() {
      if (!navigator.userActivation.isActive) throw new Error('No activation from a user tap');
    }
    const reg = {
      pushManager: {
        getSubscription: async () => sub,
        subscribe: async ({ applicationServerKey }) => sub = {
          endpoint,
          options: { applicationServerKey: applicationServerKey.buffer },
          toJSON: () => ({ endpoint, keys: { p256dh: 'test-public', auth: 'test-auth' } }),
          unsubscribe: async () => { sub = undefined; return true; },
        },
      },
    };
    Object.defineProperties(navigator.serviceWorker, {
      register: { value: async () => reg },
      getRegistration: { value: async () => reg },
      ready: { value: Promise.resolve(reg) },
    });
  }, { endpoint });
  const page = await context.newPage();
  return { context, page };
}

try {
  const { context, page } = await setup();
  await page.goto(base);
  const settings = page.getByRole('link', { name: 'הגדרת התראות', exact: true });
  assert.equal(await settings.getAttribute('href'), '/app/me/account?notifications=1');
  await settings.click();
  await page.getByText(/כדי לקבל התראות מהחווה במכשיר/).waitFor();
  assert.equal(await page.evaluate(() => window.permissionPrompts), 0);
  const uid = await page.evaluate(() => window.testSignIn());
  const at = new Date().toISOString();
  const person = {
    uid, email: 'web-push@synthetic.invalid', displayName: 'בדיקת התראות', phone: '0500000000',
    role: 'guest', status: 'active', customerNumber: 99, acceptedTermsAt: at, createdAt: at, updatedAt: at,
    push: { enabled: true, devices: [{
      id: 'another-device', kind: 'webpush', endpoint: endpoint + '-other', keys: { auth: 'fixture', p256dh: 'fixture' }, ua: 'fixture', createdAt: at,
    }] },
  };
  const readDevices = async () => {
    const response = await fetch(docUrl + '/users/' + uid, { headers });
    const data = await response.json();
    return data.fields.push.mapValue.fields.devices.arrayValue.values.map((d) => d.mapValue.fields.endpoint.stringValue);
  };
  await write('users/' + uid, person);
  await write('settings/push', { mode: 'webpush', vapidPublicKey });
  await page.getByRole('button', { name: 'להפעיל', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.permissionPrompts), 0);
  await page.getByRole('button', { name: 'להפעיל', exact: true }).click();
  await page.getByText('פעיל במכשיר הזה.', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.permissionPrompts), 1);
  assert.deepEqual(await readDevices(), [endpoint + '-other', endpoint]);
  await page.getByRole('switch', { name: 'התראות לטלפון' }).click();
  await page.getByRole('button', { name: 'להפעיל', exact: true }).waitFor();
  assert.deepEqual(await readDevices(), [endpoint + '-other']);
  await context.close();

  const iphone = await setup({ ios: true });
  await iphone.page.goto(base + '/app/me/account?notifications=1');
  await iphone.page.getByText(/כדי לקבל התראות מהחווה במכשיר/).waitFor();
  await iphone.page.evaluate(() => window.testSignIn());
  await iphone.page.getByText(/באייפון ובאייפד/).waitFor();
  assert.equal(await iphone.page.evaluate(() => window.permissionPrompts), 0);
  await iphone.page.getByRole('button', { name: 'איך מוסיפים' }).click();
  await iphone.page.getByRole('heading', { name: 'להוסיף למסך הבית' }).waitFor();
  await iphone.context.close();
  console.log('PASS: website link, guest sign-in, tap-only permission, server-confirmed registration, per-device off, iPhone installation guidance.');
} finally {
  await browser.close();
  server.close();
}
