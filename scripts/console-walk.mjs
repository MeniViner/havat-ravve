// The owner's walk through the server console on a computer, for real: /admin at 1440x900 signed in as an owner of the
// emulators, against this branch's Worker under `wrangler dev`; then the demo; then the same screens against today's
// Worker (origin/main's api/). Every action is checked on the screen AND in Firestore or the Worker's own answer.
//
//   PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH node scripts/console-walk.mjs [--only=owner,demo,today] [--shots]
//   WALK_SCRATCH=<folder>   logs, the built page and the Workers' state (default: $TMPDIR/console-walk)
//   WALK_APP=<folder>       a frozen copy of the commit to walk (default: this folder), and WALK_COMMIT=<its name, for the README>
//   TODAY_API=<folder>      origin/main's api/ (git archive origin/main api package.json tsconfig.json | tar -x -C <dir>)
//
// Needs ports 8080, 9099 (emulators), 5297 (page), 18801, 18802 (Workers). Nothing reaches the live Worker or the
// production project: see scripts/smoke/console-env.mjs (kernel sandbox, aborted requests, demo project only).
// Results: docs/console-desktop-check/walk/README.md and <scratch>/results.json.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import * as E from './smoke/console-env.mjs';

const net = E.sandboxed();
const { seed, PEOPLE, IL } = await import('./smoke/console-seed.mjs');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const wants = (x) => !only.length || only.includes(x);
const OUT = path.join(E.ROOT, 'docs/console-desktop-check/walk');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(E.SCRATCH, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10_000, every = 200) { const t0 = Date.now(); let v; for (;;) { try { v = await fn(); if (v) return v; } catch { /* again */ } if (Date.now() - t0 > ms) return v; await sleep(every); } }

// ---------- results ----------
const results = []; // { part, step, check, ok, note }
let part = '', stepName = '';
function check(ok, what, note) {
  results.push({ part, step: stepName, check: what, ok: !!ok, note: ok ? '' : note === undefined ? '' : (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 600) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${part}] ${stepName}: ${what}${!ok && note !== undefined ? ' · ' + (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 600) : ''}`);
  return !!ok;
}
async function step(name, fn, s) {
  stepName = name;
  try { await fn(); } catch (e) { check(false, 'ran to its end', String(e?.message || e).split('\n').slice(0, 6).join(' | ')); if (s) await s.page.screenshot({ path: path.join(E.SCRATCH, `fail-${part}-${results.length}.png`) }).catch(() => {}); }
  if (s) { const e = s.take(); if (e.length) check(false, 'no console or page errors', e.slice(0, 4).join(' || ')); await s.closeAll(); }
}

// ---------- the browser ----------
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--no-pings'] });
const aborted = []; // every request that was not to this computer, all aborted
const LOCAL = new Set(['localhost', '127.0.0.1']);
async function session({ site, api, who, url = '/admin', width = 1440 }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route((u) => !LOCAL.has(u.hostname) && /^(https?|wss?):$/.test(u.protocol), (r) => { aborted.push({ part, step: stepName, url: r.request().url().slice(0, 300) }); return r.abort(); });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [], reqs = [], warns = [];
  const allowed = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !allowed.some((a) => a.test(t + ' ' + (m.location()?.url || '')))) errors.push('console: ' + t.slice(0, 260) + ' ' + (m.location()?.url || '').slice(0, 160)); if (m.type() === 'warning') warns.push(t.slice(0, 300)); });
  page.on('request', (r) => reqs.push({ at: Date.now(), method: r.method(), url: r.url(), body: r.postData() || '' }));
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
  const s = {
    ctx, page, errors, reqs, warns, bad, allowed, api, site,
    take: () => errors.splice(0),
    text: () => page.locator('body').innerText(),
    async closeAll() { for (let i = 0; i < 4 && await page.locator('[role=dialog]').count(); i++) { await page.keyboard.press('Escape'); await sleep(250); } },
    async go(hash) { await page.evaluate((h) => { location.hash = h; }, '#/' + hash); await s.idle(); },
    /** Until nothing was asked for 500 ms and no skeleton is left. */
    async idle(ms = 12_000) { const t0 = Date.now(); let quiet = 0; let last = -1; while (Date.now() - t0 < ms) { const n = reqs.filter((r) => !/Listen\/channel/.test(r.url)).length + (await page.locator('.d-skel, .is-skeleton').count()) * 1000; if (n === last && n < 1e9) quiet++; else quiet = 0; last = n; if (quiet >= 4 && !(await page.locator('.d-skel').count())) return; await sleep(130); } },
    toast: (t, ms = 8000) => page.getByText(t, { exact: false }).first().waitFor({ timeout: ms }).then(() => true, () => false),
    btn: (name, o = {}) => page.getByRole('button', { name, exact: true, ...o }),
    async confirm(name) { await page.locator('[role=dialog]').last().getByRole('button', { name, exact: true }).click(); await sleep(350); },
    row: (t) => page.locator('.d-main tr[data-row]', { hasText: t }).first(),
    panel: () => page.locator('.d-panel').last(),
    async shot(n) { await page.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 55 }); },
    token: () => page.evaluate(() => window.__walkToken()),
    async call(method, p, body) { const r = await fetch(api + '/v1/console' + p, { method, headers: { authorization: 'Bearer ' + (await s.token()), ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() } : {}) }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined }); const j = await r.json().catch(() => null); return { status: r.status, data: j?.data, error: j?.error }; },
    async download(run) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), run()]); const f = path.join(E.SCRATCH, 'dl-' + d.suggestedFilename()); await d.saveAs(f); return { name: d.suggestedFilename(), bytes: fs.readFileSync(f), text: fs.readFileSync(f, 'utf8') }; },
  };
  if (who) {
    await page.goto(`${site}/admin?api=${api}`, { waitUntil: "load" });
    const [sub, email, name] = PEOPLE[who];
    s.uid = await page.evaluate(([a, b, c]) => window.__walkSignIn(a, b, c), [sub, email, name]);
  }
  await page.goto(`${site}${url}${api ? `${url.includes('?') ? '&' : '?'}api=${api}` : ''}#/overview`, { waitUntil: 'load' });
  return s;
}
const SCREENS = [['overview', 'מצב כללי'], ['monitor', 'ניטור'], ['speed', 'מהירות'], ['stats', 'סטטיסטיקות'], ['traffic', 'ביקורים ושימוש'], ['money', 'כסף ואירועים'], ['data', 'דפדוף בנתונים'], ['people', 'אנשים והרשאות'], ['import', 'ייבוא מאקסל'], ['backups', 'גיבויים'], ['queue', 'תור שליחה'], ['jobs', 'משימות מתוזמנות'], ['switches', 'מתגים'], ['keys', 'מפתחות API'], ['run', 'הרצת פעולה'], ['security', 'יומן אבטחה']];
const BROKEN = /undefined|\bNaN\b|\[object |Invalid Date|לא הצלחנו|משהו השתבש|אין הרשאה לפעולה|אין חיבור לשרת|לנסות שוב/;
/** Error text, broken words and failed blocks on the screen now. */
async function trouble(s) {
  return s.page.evaluate(([re]) => {
    // the farm's quota cannot be measured on emulators: the console says so, which is right
    const t = (document.querySelector('.d-main')?.innerText || document.body.innerText).replace(/לא הצלחנו למדוד את המכסה של מסד הנתונים/g, '');
    const m = new RegExp(re).exec(t);
    const alerts = [...document.querySelectorAll('.d-main .d-failed, .d-main [role=alert], .c-error')].filter((e) => !e.matches('.d-field__err')).map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 120));
    return { m: m ? t.slice(Math.max(0, m.index - 50), m.index + 60).replace(/\s+/g, ' ') : '', alerts, skel: document.querySelectorAll('.d-skel').length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  }, [BROKEN.source]);
}
const norm = (u, api) => new URL(u).pathname.replace(/^\/v1\/console/, '') + new URL(u).search.replace(/=[^&]*/g, '=…');
const requests = {}; // part -> screen -> { worker: [...], firestore: n }
function counted(s, from) {
  const mine = s.reqs.slice(from);
  const worker = mine.filter((r) => s.api && r.url.startsWith(s.api)).map((r) => `${r.method} ${norm(r.url)}`);
  // a Firestore read of the browser is an addTarget on the Listen channel
  const fsq = mine.filter((r) => /Listen\/channel/.test(r.url)).reduce((n, r) => n + (decodeURIComponent(r.body.replace(/\+/g, ' ')).match(/"addTarget"/g) || []).length, 0);
  return { worker, firestore: fsq };
}
async function openAll(s, key, { shots } = {}) {
  requests[key] = {};
  for (const [tab, title] of SCREENS) {
    await step(`screen ${tab}`, async () => {
      // from another screen, by the sidebar, as a person does
      if (new URL(s.page.url()).hash.startsWith('#/' + tab)) { await s.go(tab === 'overview' ? 'monitor' : 'overview'); }
      const from = s.reqs.length; s.bad.length = 0;
      await s.page.locator(`.d-nav__item[href="#/${tab}"]`).click();
      await s.idle();
      await s.page.locator('.d-head__title', { hasText: title }).waitFor({ timeout: 5000 });
      const c = counted(s, from); requests[key][tab] = c;
      const t = await trouble(s);
      check(!t.m && !t.alerts.length && !t.skel, `${tab}: loaded, no error text`, { ...t, bad: s.bad.slice(0, 5) });
      check(t.over <= 0, `${tab}: no sideways scroll`, t.over);
      const same = Object.entries(c.worker.reduce((m, w) => ({ ...m, [w.replace(/\/(keys|queue\/email|imports)\/[^/]+/, '/$1/:id')]: (m[w.replace(/\/(keys|queue\/email|imports)\/[^/]+/, '/$1/:id')] || 0) + 1 }), {})).filter(([, n]) => n > 1);
      check(!same.length, `${tab}: no Worker request sent twice or per row`, same);
      if (shots && ['overview', 'people'].includes(tab)) await s.shot(`${key}-${tab}`);
    }, s);
  }
}

// ---------- start ----------
console.log('sandbox: ' + net.proof);
const site = await E.page();
let emu, uids;
const mail = await E.mailMock();
const ANY = `demo-${Date.now()}`;
if (wants('owner') || wants('today')) { emu = await E.emulators(); uids = await seed(); }
const b64 = (b) => Buffer.from(b).toString('base64url');
const vapid = (await import('node:crypto')).generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const vars = {
  EMAIL_ENABLED: 'true', EMAIL_TEST_FAST: '1', BREVO_API_URL: mail.url, BREVO_API_KEY: 'walk-not-a-key', BREVO_SENDER_EMAIL: 'sender@example.com',
  PUSH_MODE: 'webpush', VAPID_PUBLIC_KEY: b64(Buffer.concat([Buffer.from([4]), Buffer.from(vapid.x, 'base64url'), Buffer.from(vapid.y, 'base64url')])), VAPID_PRIVATE_KEY: vapid.d, VAPID_SUBJECT: 'mailto:walk@example.com',
};
const outbound = {};
const ctxs = { E, check, step, until, sleep, trouble, session, openAll, counted, requests, SCREENS, PEOPLE, IL, mail, uids, OUT, setPart: (p) => { part = p; }, shots: process.argv.includes('--shots') };

try {
  if (wants('owner')) { const { ownerWalk } = await import('./smoke/console-owner.mjs'); const w = await E.worker({ api: path.join(E.APP, 'api'), port: 18801, name: 'branch', vars }); try { await ownerWalk({ ...ctxs, w, site }); } finally { outbound.branch = w.outbound; await E.stop(w); } }
  if (wants('demo')) { const { demoWalk } = await import('./smoke/console-demo.mjs'); await demoWalk({ ...ctxs, site }); }
  if (wants('today')) {
    const api = process.env.TODAY_API;
    if (!api || !fs.existsSync(path.join(api, 'src/index.ts'))) throw new Error("TODAY_API: origin/main's api folder");
    const { todayWalk } = await import('./smoke/console-today.mjs');
    const w = await E.worker({ api, port: 18802, name: 'today', vars });
    try { await todayWalk({ ...ctxs, w, site }); } finally { outbound.today = w.outbound; await E.stop(w); }
  }
} catch (e) { part = part || 'start'; stepName = 'walk'; check(false, 'ran to its end', String(e?.stack || e)); }
await browser.close(); mail.close(); site.close(); if (emu) await E.stop(emu);

const toMd = await import('./smoke/console-report.mjs');
const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
const tally = (l) => Object.entries((l || []).reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {}));
fs.writeFileSync(path.join(E.SCRATCH, `results-${only.join('-') || 'all'}.json`), JSON.stringify({ at: new Date().toISOString(), proof: net.proof, results, requests, aborted, outbound: Object.fromEntries(Object.entries(outbound).map(([k, v]) => [k, tally(v)])) }, null, 1));
if (!only.length) toMd.report({ OUT, results, requests, aborted, outbound: Object.fromEntries(Object.entries(outbound).map(([k, v]) => [k, tally(v)])), proof: net.proof, SCREENS });
console.log(`\n${pass} passed, ${fail} failed`);
console.log('aborted in the browser:', JSON.stringify(aborted));
console.log('asked by the Worker, answered or blocked locally:', JSON.stringify(Object.fromEntries(Object.entries(outbound).map(([k, v]) => [k, tally(v)]))));
for (const r of results.filter((x) => !x.ok)) console.log(`  FAIL [${r.part}] ${r.step}: ${r.check} · ${r.note}`);
process.exit(fail ? 1 : 0);
