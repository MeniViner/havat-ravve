// Shared helpers for the emulator smoke cycle (scripts/smoke-cycle.mjs).
// Safety: every context aborts every request to a host that is not localhost, so nothing can reach production
// Firebase; every app URL carries ?emulator (src/app/firebase.ts switches to the emulators only then).
import fs from 'node:fs';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { ACCOUNTS, idpSignIn } from '../smoke-seed.mjs';

export const BASE = process.env.BASE || 'http://localhost:5173';
export const SHOTS = process.env.SHOTS || 'docs/smoke/tidy/shots';
const API_KEY = JSON.parse(fs.readFileSync('site.config.json', 'utf8')).firebase.apiKey;
const LOCAL = new Set(['localhost', '127.0.0.1']);

/** Every non-localhost request seen (all aborted). A Google host here that was not aborted would be a stop. */
export const external = [];
export const results = []; // {item, check, role, ok, note}
let currentItem = '';
export const setItem = (i) => { currentItem = i; console.log('\n=== ' + i); };
export function check(ok, checkName, role, note = '') {
  results.push({ item: currentItem, check: checkName, role, ok: !!ok, note });
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${role}] ${checkName}${note ? ' · ' + note : ''}`);
  return !!ok;
}

let browser;
export async function launch() { browser = await chromium.launch(); return browser; }
export async function close() { await browser?.close(); }

/** The camera: a canvas stream that shows whatever QR image the test sets with window.__smokeQr(dataUrl). */
const CAMERA_STUB = () => {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
  const g = canvas.getContext('2d'); let img = null;
  const draw = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 480); if (img) g.drawImage(img, 170, 90, 300, 300); };
  setInterval(draw, 60); draw();
  window.__smokeQr = (src) => new Promise((res) => { if (!src) { img = null; return res(); } const i = new Image(); i.onload = () => { img = i; res(); }; i.src = src; });
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(15);
};

export async function qrDataUrl(text) { return QRCode.toDataURL(text, { margin: 2, width: 300 }); }

/**
 * A browser context signed in as `who` (a key of ACCOUNTS) or signed out (null).
 * Sign-in: the Google button goes through the Auth emulator's handler page, whose redirect result needs Google's gapi
 * loader from apis.google.com, which the safety block aborts. So the session signs in to the Auth emulator by REST
 * (a Google IdP sign-in) and hands the result to Firebase's own persistence before the app loads; the app then
 * restores the session exactly as after a real sign-in.
 */
export async function session(who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block', permissions: ['camera'], ...(opts.ctx || {}) });
  await ctx.route((u) => !LOCAL.has(u.hostname), (r) => { external.push(r.request().url()); return r.abort(); });
  await ctx.addInitScript(CAMERA_STUB);
  await ctx.addInitScript(() => { try { localStorage.setItem('farm-install-dismissed', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(opts.timeout || 6000);
  const errors = [];
  const allowed = opts.allowErrors || [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  const failed = []; // localhost responses >= 400, named next to the console's "Failed to load resource"
  page.on('response', (r) => { if (r.status() >= 400 && LOCAL.has(new URL(r.url()).hostname)) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*$/, '').slice(0, 140)} ${(r.request().postData() || '').slice(0, 160)}`); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (loc && !LOCAL.has(new URL(loc).hostname)) return; // a blocked external resource
    if (!page.url().startsWith(BASE)) return; // the Auth emulator's own page
    const t = m.text();
    if (allowed.some((a) => a.test(t))) return;
    errors.push('console: ' + t.slice(0, 300) + (/Failed to load resource/.test(t) && failed.length ? ' <- ' + failed[failed.length - 1] : ''));
  });
  let account = null;
  if (who) {
    const r = await idpSignIn(who);
    account = { key: who, uid: r.localId, ...ACCOUNTS[who] };
    // the first-visit demo (PR #24) would open every account in demo at its own role: mark it as already answered on this
    // browser, as for a returning person, so the session works on the real (emulator) data. src/app/demo/intro.ts STAGE().
    // opts.firstVisit: leave it unmarked, as for a new account on this browser (item 13, W4)
    if (!opts.firstVisit) await ctx.addInitScript((k) => { try { localStorage.setItem(k, 'done'); } catch { /* */ } }, 'farm-demo-intro:' + r.localId);
    const now = Date.now();
    const user = { uid: r.localId, email: ACCOUNTS[who].email, emailVerified: true, displayName: ACCOUNTS[who].name, isAnonymous: false, photoURL: null, phoneNumber: null, tenantId: null,
      providerData: [{ providerId: 'google.com', uid: 'smoke-' + who, displayName: ACCOUNTS[who].name, email: ACCOUNTS[who].email, phoneNumber: null, photoURL: null }],
      stsTokenManager: { refreshToken: r.refreshToken, accessToken: r.idToken, expirationTime: now + Number(r.expiresIn || 3600) * 1000 },
      createdAt: String(now), lastLoginAt: String(now), apiKey: API_KEY, appName: '[DEFAULT]' };
    await page.goto(`${BASE}/smoke-blank`);
    await page.evaluate(([k, value]) => new Promise((res, rej) => {
      const open = indexedDB.open('firebaseLocalStorageDb', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      open.onerror = () => rej(open.error);
      open.onsuccess = () => { const tx = open.result.transaction('firebaseLocalStorage', 'readwrite'); tx.objectStore('firebaseLocalStorage').put({ fbase_key: k, value }); tx.oncomplete = () => { open.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    }), [`firebase:authUser:${API_KEY}:[DEFAULT]`, user]);
    errors.length = 0; // the blank page's 404
  }
  const s = new Session(ctx, page, errors, account, who || 'signed-out');
  return s;
}

const withEmu = (path) => `${BASE}/app${path === '/' ? '' : path}${path.includes('?') ? '&' : '?'}emulator`;
export class Session {
  constructor(ctx, page, errors, account, role) { Object.assign(this, { ctx, page, errors, account, role }); }
  /** Opens an app path with ?emulator (never page.reload(): in-app navigation drops the query). */
  async go(path, wait = 900) { await this.page.goto(withEmu(path), { waitUntil: 'load' }); await this.settle(wait); }
  async reload(wait = 1200) { const u = new URL(this.page.url()); u.searchParams.delete('emulator'); await this.go(u.pathname.replace(/^\/app/, '') + (u.search || ''), wait); }
  async settle(ms = 400) { await this.page.waitForTimeout(ms); }
  path() { return new URL(this.page.url()).pathname.replace(/^\/app/, '') || '/'; }
  async text() { return this.page.locator('body').innerText(); }
  async has(t) { return (await this.text()).includes(t); }
  async waitText(t, timeout = 6000) { try { await this.page.getByText(t, { exact: false }).first().waitFor({ timeout }); return true; } catch { return false; } }
  async click(t, o = {}) {
    const root = o.within ? this.page.locator(o.within).first() : this.page;
    const loc = o.role ? root.getByRole(o.role, { name: t, exact: !!o.exact }) : root.getByText(t, { exact: !!o.exact });
    await loc.first().click({ timeout: o.timeout || 6000 });
    await this.settle(o.wait ?? 450);
  }
  async tryClick(t, o = {}) { try { await this.click(t, o); return true; } catch { return false; } }
  async fill(label, value, o = {}) { const f = this.page.getByLabel(label, { exact: !!o.exact }).first(); await f.fill(value); await this.settle(150); }
  async shot(name) { fs.mkdirSync(SHOTS, { recursive: true }); await this.page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: 'jpeg', quality: 70, scale: 'css' }); }
  takeErrors() { const e = this.errors.splice(0); return e; }
  async done() { await this.ctx.close(); }
}

/** Admin read/write of the emulator (rules bypassed with the emulator's owner token). Used only to verify and to fetch ticket secrets. */
const FS = 'http://localhost:8080/v1/projects/havat-ravve/databases/(default)/documents';
const H = { authorization: 'Bearer owner', 'content-type': 'application/json' };
const decode = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)])) : 'arrayValue' in v ? (v.arrayValue.values || []).map(decode) : v;
const docOf = (d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])) });
export async function adminGet(path) { const r = await fetch(`${FS}/${path}`, { headers: H }); if (r.status === 404) return null; return docOf(await r.json()); }
export async function adminList(path) { const out = []; let token = ''; do { const r = await fetch(`${FS}/${path}?pageSize=300${token ? '&pageToken=' + token : ''}`, { headers: H }).then((x) => x.json()); (r.documents || []).forEach((d) => out.push(docOf(d))); token = r.nextPageToken || ''; } while (token); return out; }

const encode = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } } : { stringValue: String(v) };
/** Admin write (rules bypassed), like the seed: only for data the staff side would have created (a stall tab). */
export async function adminSet(path, data) { const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }) }); if (!r.ok) throw new Error('adminSet ' + r.status); }

/** A direct Firestore REST write as a signed-in account (the rules apply): returns the HTTP status. */
export async function userWrite(who, path, fields, method = 'PATCH') {
  const r = await idpSignIn(who);
  const enc = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } } : { stringValue: String(v) };
  const mask = method === 'PATCH' ? '?' + Object.keys(fields).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') : '';
  const res = await fetch(`${FS}/${path}${mask}`, { method, headers: { authorization: 'Bearer ' + r.idToken, 'content-type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) }) });
  return res.status;
}
export async function userRead(who, path) { const r = await idpSignIn(who); return (await fetch(`${FS}/${path}`, { headers: { authorization: 'Bearer ' + r.idToken } })).status; }
export const uids = () => JSON.parse(fs.readFileSync('.build/smoke/uids.json', 'utf8'));
