// The local world of the owners' console walk (scripts/console-walk.mjs): emulators, Worker, page and mock mail, all on
// this computer. Nothing here may reach the live Worker or the production Firebase project:
//  1. the whole process tree (emulators, wrangler, workerd, Chromium) runs under a kernel sandbox that denies every
//     outbound connection except localhost, DNS included (sandboxed() below; macOS sandbox-exec);
//  2. the Worker runs from a wrapper that answers for the outside world itself and lists every address it was asked for,
//     under a config of its own with made-up KV and R2 names, project demo-havat-ravve, no Cloudflare or Google credentials;
//  3. every browser context aborts and lists every request that is not localhost (scripts/console-walk.mjs);
//  4. the page's bundle is built here with the demo project in place of the real one, always on the emulators.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(import.meta.dirname, '../..');
/** What is walked: this folder, or a frozen copy of a commit (git archive <commit> | tar -x, with a node_modules link), so that edits made meanwhile do not mix in. */
export const APP = process.env.WALK_APP || ROOT;
export const PROJECT = 'demo-havat-ravve';
export const FS_HOST = '127.0.0.1:8080', AUTH_HOST = '127.0.0.1:9099';
export const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
export const PAGE_PORT = Number(process.env.WALK_PORT) || 5297;
export const SCRATCH = process.env.WALK_SCRATCH || path.join(process.env.TMPDIR || '/tmp', 'console-walk');
const PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))(deny network-outbound (literal "/private/var/run/mDNSResponder") (literal "/var/run/mDNSResponder"))';

/** Runs this script again inside the kernel sandbox (once). Refuses to go on without it. */
export function sandboxed() {
  if (process.env.WALK_SANDBOXED === '1') {
    const out = spawnSync('/usr/bin/curl', ['-sS', '-m', '3', '-o', '/dev/null', 'http://1.1.1.1/'], { encoding: 'utf8' });
    const dns = spawnSync('/usr/bin/curl', ['-sS', '-m', '3', '-o', '/dev/null', 'http://example.com/'], { encoding: 'utf8' });
    if (out.status === 0 || dns.status === 0) { console.error('the network sandbox is not in force: stopping'); process.exit(2); }
    return { proof: `curl to 1.1.1.1: exit ${out.status} (${out.stderr.trim().slice(0, 90)}); a name lookup (example.com): exit ${dns.status} (${dns.stderr.trim().slice(0, 90)})` };
  }
  if (process.platform !== 'darwin') { console.error('needs macOS sandbox-exec'); process.exit(2); }
  const env = { ...process.env, WALK_SANDBOXED: '1', WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1', FIREBASE_SKIP_UPDATE_CHECK: '1' };
  for (const k of ['CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN']) delete env[k];
  const r = spawnSync('/usr/bin/sandbox-exec', ['-p', PROFILE, process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}

const children = new Set();
const kill = (p, s) => { try { process.kill(-p.pid, s); } catch { /* gone */ } };
process.on('exit', () => {
  for (const p of children) kill(p, 'SIGKILL');
  // the Firestore emulator's java is a group of its own: only the one started on this scratch folder's rules
  const ps = spawnSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout || '';
  for (const l of ps.split('\n')) if (/cloud-firestore-emulator/.test(l) && l.includes(path.join(SCRATCH, 'emu/firestore.rules'))) { try { process.kill(Number(l.trim().split(/\s+/)[0]), 'SIGKILL'); } catch { /* gone */ } }
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1));
const listening = (port) => new Promise((res) => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
async function until(fn, what, ms = 90_000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 300)); } throw new Error('did not start: ' + what); }
export async function stop(p) {
  kill(p, 'SIGTERM');
  for (let i = 0; i < 120 && p.port && (await listening(p.port)); i++) { if (i === 100) kill(p, 'SIGKILL'); await new Promise((r) => setTimeout(r, 100)); }
  children.delete(p);
}
function start(cmd, args, opts, log) {
  const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const f = fs.createWriteStream(path.join(SCRATCH, log));
  p.lines = [];
  for (const s of [p.stdout, p.stderr]) s.on('data', (d) => { f.write(d); for (const l of String(d).split('\n')) if (l.trim()) p.lines.push(l); });
  children.add(p);
  return p;
}

// ---------- emulators ----------
export async function emulators() {
  for (const port of [8080, 9099]) if (await listening(port)) throw new Error(`port ${port} is taken`);
  const dir = path.join(SCRATCH, 'emu');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(APP, 'firestore.rules'), path.join(dir, 'firestore.rules'));
  fs.copyFileSync(path.join(APP, 'firestore.indexes.json'), path.join(dir, 'firestore.indexes.json'));
  fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({ firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' }, emulators: { singleProjectMode: false, firestore: { host: '127.0.0.1', port: 8080 }, auth: { host: '127.0.0.1', port: 9099 }, ui: { enabled: false } } }));
  const p = start(process.execPath, [path.join(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'emulators:start', '--only', 'firestore,auth', '--project', PROJECT], { cwd: dir, env: { ...process.env, JAVA_TOOL_OPTIONS: '-Djava.net.preferIPv4Stack=true' } }, 'emulators.log'); // IPv4: the sandbox's localhost does not include ::ffff:127.0.0.1
  p.port = 8080;
  await until(() => p.lines.some((l) => /All emulators ready/.test(l)), 'emulators (see emulators.log)');
  return p;
}

// ---------- Firestore, by hand ----------
export const enc = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
export const dec = (v) => 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'stringValue' in v ? v.stringValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
const admin = { authorization: 'Bearer owner', 'content-type': 'application/json' };
const docOf = (d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) });
export async function put(p, data) { const r = await fetch(`${DOCS}/${p}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) }); if (!r.ok) throw new Error('put ' + p + ' ' + (await r.text()).slice(0, 200)); }
export async function get(p) { const r = await fetch(`${DOCS}/${p}`, { headers: admin }); return r.status === 404 ? null : docOf(await r.json()); }
export async function list(col) { const out = []; let t = ''; do { const j = await fetch(`${DOCS}/${col}?pageSize=300${t ? '&pageToken=' + t : ''}`, { headers: admin }).then((r) => r.json()); out.push(...(j.documents || []).map(docOf)); t = j.nextPageToken || ''; } while (t); return out; }
export async function idp(sub, email, name) {
  const idToken = JSON.stringify({ sub, email, email_verified: true, name });
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=walk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }) }).then((x) => x.json());
  if (!r.localId) throw new Error('auth emulator: ' + JSON.stringify(r).slice(0, 200));
  return r;
}

// ---------- the mail service, pretend ----------
export async function mailMock() {
  const calls = [];
  const s = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      const j = JSON.parse(body || '{}'); calls.push({ to: j.to?.[0]?.email || '', subject: j.subject, text: j.textContent });
      res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: `<mock-${calls.length}@mail.test>` }));
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { calls, url: `http://127.0.0.1:${s.address().port}/v3/smtp/email`, close: () => s.close() };
}

// ---------- the Worker under wrangler dev (local only) ----------
/** api: the folder with src/index.ts and wrangler.toml. Returns the process; p.outbound lists what it asked of the outside. */
export async function worker({ api, port, name, vars = {}, persist }) {
  const dir = path.join(SCRATCH, 'worker-' + name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'entry.ts'), `// the walk's wrapper: the outside world is answered here and never called
import worker from ${JSON.stringify(path.join(api, 'src/index.ts'))};
const real = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url);
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return real(input as any, init);
  console.log('WALK-OUTBOUND ' + u.origin + u.pathname);
  if (u.hostname === 'havat-ravve.web.app') return new Response('<html>walk</html>', { status: 200 });
  throw new TypeError('blocked by the walk: ' + u.hostname);
}) as typeof fetch;
export default worker;
`);
  let toml = fs.readFileSync(path.join(api, 'wrangler.toml'), 'utf8');
  toml = toml.replace(/^main\s*=.*$/m, `main = "entry.ts"`).replace(/^name\s*=.*$/m, 'name = "walk-local"').replace(/^workers_dev.*$/m, '').replace(/^PRODUCTION_APPROVED.*$/m, '').replace(/^FIRESTORE_PROJECT_ID.*$/m, `FIRESTORE_PROJECT_ID = "${PROJECT}"`)
    .replace(/^id = ".*"$/m, 'id = "00000000000000000000000000000000"').replace(/^bucket_name.*$/m, 'bucket_name = "walk-local-files"').replace(/\[triggers\][^\[]*\n/, (m) => m);
  fs.writeFileSync(path.join(dir, 'wrangler.toml'), toml);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  const all = { FIRESTORE_PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: FS_HOST, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, TEST_FAULTS: '1', API_CREDENTIALS: '[]', ...vars };
  const args = [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', 'wrangler.toml', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(port + 1000), '--show-interactive-dev-session=false', '--log-level', 'log', '--test-scheduled', '--persist-to', persist || path.join(dir, 'state')];
  for (const [k, v] of Object.entries(all)) args.push('--var', `${k}:${v}`);
  const home = path.join(SCRATCH, 'home'); fs.mkdirSync(home, { recursive: true }); // no Cloudflare sign-in to find
  const p = start(process.execPath, args, { cwd: dir, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home } }, `worker-${name}.log`);
  p.port = port; p.base = `http://127.0.0.1:${port}`;
  Object.defineProperty(p, 'outbound', { get: () => p.lines.filter((l) => l.includes('WALK-OUTBOUND')).map((l) => l.split('WALK-OUTBOUND ')[1].trim()) });
  await until(async () => (await fetch(p.base + '/v1/health')).ok, `worker ${name} (see worker-${name}.log)`);
  return p;
}
export async function cronAll(p) {
  for (const c of ['*/5+*+*+*+*', '1-59/5+*+*+*+*', '2-59/5+*+*+*+*']) { const st = (await fetch(`${p.base}/__scheduled?cron=${c}`)).status; if (st !== 200) return st; }
  return 200;
}

// ---------- the page ----------
/** Builds the console (the emulator build and the real one) and serves them: /admin is the emulator one unless ?demo. */
export async function page() {
  const out = path.join(SCRATCH, 'site');
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.cpSync(path.join(APP, 'public'), out, { recursive: true });
  const base = { absWorkingDir: APP, entryPoints: ['src/console-entry.tsx'], bundle: true, format: 'esm', jsx: 'automatic', external: ['/assets/*'], sourcemap: 'linked', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error' };
  const local = { name: 'walk-emulators', setup(b) {
    b.onLoad({ filter: /site\.config\.json$/ }, (a) => { const c = JSON.parse(fs.readFileSync(a.path, 'utf8')); c.firebase = { ...c.firebase, projectId: PROJECT, apiKey: 'walk-fake-key', authDomain: 'localhost', storageBucket: '', appId: 'walk' }; return { contents: JSON.stringify(c), loader: 'json' }; });
    b.onLoad({ filter: /src\/app\/firebase\.ts$/ }, (a) => {
      let s = fs.readFileSync(a.path, 'utf8');
      const was = s;
      s = s.replace(/const useEmulator = .*;/, 'const useEmulator = true;').replace("connectFirestoreEmulator(db, 'localhost', 8080)", "connectFirestoreEmulator(db, '127.0.0.1', 8080)").replace("'http://localhost:9099'", "'http://127.0.0.1:9099'");
      if (s === was || !s.includes('useEmulator = true')) throw new Error('firebase.ts changed: the walk cannot switch it to the emulators');
      s += `\nimport { signInWithCredential as __c } from 'firebase/auth';\n(window as any).__walkSignIn = async (sub: string, email: string, name: string) => { const a = await readyAuth(); await __c(a, GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true, name }))); return a.currentUser!.uid; };\n(window as any).__walkToken = async () => (await readyAuth()).currentUser!.getIdToken();\n`;
      return { contents: s, loader: 'ts', resolveDir: path.dirname(a.path) };
    });
  } };
  await build({ ...base, outfile: path.join(out, 'console.js'), plugins: [local] });
  await build({ ...base, outfile: path.join(out, 'real/console.js') });
  const html = (dir) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>walk</title><link rel="icon" href="/assets/rava-logo.png"><link rel="stylesheet" href="${dir}/console.css"></head><body><div id="root"></div><script type="module" src="${dir}/console.js"></script></body></html>`;
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.map': 'application/json' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>blank</title>'); }
    if (u.pathname === '/admin') { res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-cache' }); return res.end(html(u.searchParams.has('demo') ? '/real' : '')); }
    const f = path.join(out, u.pathname);
    if (f.startsWith(out) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); res.end('not found');
  });
  await new Promise((r, j) => { server.once('error', j); server.listen(PAGE_PORT, '127.0.0.1', r); });
  return { base: `http://localhost:${PAGE_PORT}`, close: () => server.close() };
}
