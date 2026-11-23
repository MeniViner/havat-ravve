// Google Play readiness for the installed Android app.
// Usage: npm run play:check            (local files; run `npm run build` first)
//        npm run play:check -- --live  (also fetches the production site)
//        add --strict to fail on owner items too.
// Statuses: pass, fail (fix in code), owner (needs the farm owner), pending (later step).
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const rows = [];
const add = (area, check, status, note = '') => rows.push({ area, check, status, note });
const ok = (area, check, cond, note = '', bad = 'fail') => add(area, check, cond ? 'pass' : bad, cond ? '' : note);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const pngSize = (p) => { try { const b = fs.readFileSync(p); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; } catch { return null; } };
const hex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');

const site = readJson('site.config.json');
const origin = site?.origin || '';
const host = origin.replace(/^https:\/\//, '');

// ---------- web app manifest ----------
const m = readJson('public/app.webmanifest');
if (!m) add('Manifest', 'public/app.webmanifest parses', 'fail', 'missing or invalid JSON');
else {
  ok('Manifest', 'name set, at most 30 characters (Play title limit)', m.name && [...m.name].length <= 30, `"${m.name}"`);
  ok('Manifest', 'short_name at most 12 characters (launcher label)', m.short_name && [...m.short_name].length <= 12, `"${m.short_name}"`);
  ok('Manifest', 'display is standalone or fullscreen', ['standalone', 'fullscreen'].includes(m.display), m.display);
  ok('Manifest', 'start_url inside scope', m.start_url && m.start_url.startsWith(m.scope || '/'), `${m.start_url} / ${m.scope}`);
  ok('Manifest', 'theme_color and background_color are hex colors', hex(m.theme_color) && hex(m.background_color));
  ok('Manifest', 'lang and dir set (Hebrew, RTL)', m.lang === 'he' && m.dir === 'rtl');
  const icons = m.icons || [];
  const has = (size, purpose) => icons.find((i) => i.sizes === size && (i.purpose || 'any').split(' ').includes(purpose));
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
    const icon = has(size, purpose);
    const real = icon && pngSize('public' + icon.src);
    ok('Manifest', `${purpose} icon ${size} exists as a PNG of that size`, real && real.join('x') === size, icon ? `${icon.src}: ${real ? real.join('x') : 'not a PNG'}` : 'not listed');
  }
  ok('Manifest', 'maskable icon listed on its own (not "any maskable")', !icons.some((i) => /any/.test(i.purpose || '') && /maskable/.test(i.purpose || '')), 'split "any maskable" into two entries');
}

// ---------- offline ----------
const sw = read('src/sw.ts');
ok('Offline', 'service worker registered and has a fetch handler', /serviceWorker\.register/.test(read('src/pwa.ts')) && /addEventListener\(['"]fetch/.test(sw));
ok('Offline', 'offline fallback page exists and is used by the service worker', fs.existsSync('public/offline.html') && sw.includes('offline.html'));

// ---------- hosting (asset links must be served) ----------
const fb = readJson('firebase.json');
const ignore = fb?.hosting?.ignore || [];
ok('Hosting', 'hosting ignore does not drop /.well-known', !ignore.some((g) => g === '**/.*' || g.startsWith('.well-known') || g.includes('/.well-known')), ignore.join(', '));
const alHeader = (fb?.hosting?.headers || []).find((h) => h.source === '/.well-known/assetlinks.json');
ok('Hosting', 'assetlinks.json served as application/json', alHeader?.headers?.some((h) => h.key.toLowerCase() === 'content-type' && /application\/json/.test(h.value)));

// ---------- packaged Android project ----------
const cap = readJson('capacitor.config.json');
const gradle = read('android/app/build.gradle');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const activity = read('android/app/src/main/java/com/menis10tec/havatravve/MainActivity.java');
const target = Number(read('android/variables.gradle').match(/targetSdkVersion\s*=\s*(\d+)/)?.[1]);
const versionCode = Number(gradle.match(/^\s*versionCode\s*=?\s*(\d+)/m)?.[1]);
const versionName = gradle.match(/^\s*versionName\s*=?\s*["']([^"']*)/m)?.[1];
ok('Android', 'uses the existing Play package', cap?.appId === 'com.menis10tec.havatravve' && gradle.includes(cap.appId));
ok('Android', 'targets API 36 or later and has a release version', target >= 36 && versionCode > 0 && !!versionName);
ok('Android', 'starts a native activity and loads a packaged entry point', /extends BridgeActivity/.test(activity) && manifest.includes('.MainActivity') && cap?.webDir === '.build/native' && !cap?.server?.url);
ok('Android', 'does not depend on an external browser activity', !/androidbrowserhelper|trustedwebactivity/i.test(gradle + manifest));
ok('Android', 'App Links cover the app paths of the production domain', manifest.includes(`android:host="${host}"`) && manifest.includes('android:pathPrefix="/app/"'));
const assetLinks = readJson('public/.well-known/assetlinks.json')?.find((link) => link.target?.package_name === cap?.appId);
const prints = assetLinks?.target?.sha256_cert_fingerprints || [];
ok('Android', 'production App Links keep valid SHA-256 certificates', prints.length >= 2 && prints.every((p) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(p)));
ok('Hosting', 'build preserves the production App Links', JSON.stringify(readJson('dist/.well-known/assetlinks.json')) === JSON.stringify(readJson('public/.well-known/assetlinks.json')));
const playAuth = readJson('android/app/google-services.json')?.client?.find((client) => client.client_info?.android_client_info?.package_name === cap?.appId);
ok('Android', 'Firebase configuration includes signing and web OAuth clients', [1, 3].every((type) => playAuth?.oauth_client?.some((client) => client.client_type === type)));
let tracked = '';
try { tracked = execSync('git ls-files', { encoding: 'utf8' }); } catch {}
ok('Android', 'no keystore or build output tracked in git', !/\.(jks|keystore|apk|aab)$/m.test(tracked));

// ---------- policy ----------
const app = read('src/app/v2/screens/guest/index.tsx'); // the guest routes (guestScreen)
const guest = read('src/app/v2/screens/guest/pages.tsx'); // the terms text
ok('Policy', 'privacy page reachable signed out (/app/terms)', /function guestScreen[\s\S]*?route === '\/terms'/.test(app), 'add /terms to guestScreen');
ok('Policy', 'privacy page is final (no "draft" marker)', !/טיוטה|טרם עברה בדיקה משפטית/.test(guest), 'remove "טיוטה" once the text is final');
const src = execSync('git ls-files src', { encoding: 'utf8' }).split('\n').filter((f) => /\.(tsx?|mjs)$/.test(f)).map(read).join('\n');
ok('Policy', 'account deletion can be requested inside the app', /deleteAccount|accountDeletion|delete_requests|מחיקת (ה)?חשבון/.test(src), 'only "ask the managers" in the terms text; Play requires an in-app path');
ok('Policy', 'account deletion has a public web link (Data safety form)', /route === '\/(delete-account|account-deletion)'/.test(app), 'Play requires a web URL that works without the app');
add('Policy', 'Data safety form, content rating, target audience, store listing', 'owner', 'filled in Play Console');

// ---------- live ----------
if (args.has('--live')) {
  const get = async (path) => { try { const r = await fetch(origin + path, { redirect: 'manual' }); return { status: r.status, type: r.headers.get('content-type') || '', body: await r.text() }; } catch (e) { return { status: 0, type: '', body: String(e) }; } };
  const man = await get('/app.webmanifest');
  ok('Live', 'manifest served (200)', man.status === 200, `HTTP ${man.status}`);
  const swr = await get('/sw.js');
  ok('Live', 'service worker served (200)', swr.status === 200, `HTTP ${swr.status}`);
  const terms = await get('/app/terms');
  ok('Live', 'privacy page URL answers 200', terms.status === 200, `HTTP ${terms.status}`);
  const al = await get('/.well-known/assetlinks.json');
  if (!prints.length) add('Live', 'assetlinks.json served', 'pending', `HTTP ${al.status}; written once fingerprints exist`);
  else {
    let parsed = null; try { parsed = JSON.parse(al.body); } catch {}
    ok('Live', 'assetlinks.json served as JSON without a redirect', al.status === 200 && /application\/json/.test(al.type) && parsed?.some((link) => link.target?.package_name === cap?.appId), `HTTP ${al.status} ${al.type}`);
  }
}

// ---------- report ----------
const order = { fail: 0, owner: 1, pending: 2, pass: 3 };
const w = (k) => Math.max(k.length, ...rows.map((r) => String(r[k]).length));
const [wa, ws] = ['area', 'status'].map(w);
console.log(`${'area'.padEnd(wa)}  ${'status'.padEnd(ws)}  check`);
for (const r of [...rows].sort((a, b) => order[a.status] - order[b.status])) console.log(`${r.area.padEnd(wa)}  ${r.status.padEnd(ws)}  ${r.check}${r.note ? `  (${r.note})` : ''}`);
const count = (s) => rows.filter((r) => r.status === s).length;
console.log(`\n${count('pass')} pass, ${count('fail')} fail, ${count('owner')} owner, ${count('pending')} pending`);
process.exitCode = count('fail') || (args.has('--strict') && count('owner')) ? 1 : 0;
