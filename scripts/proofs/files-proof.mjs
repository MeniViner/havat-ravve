// Proof: the app stores a task photo in R2 through the Worker (CORS, the signed-in person's token, the link saved in
// Firestore, the bytes served back), and falls back to the inline photo when the Worker cannot be reached.
// Emulators and a local Worker only; every non-localhost request is aborted. Run through files-proof.sh.
import { launch, close, session, check, results, external, adminGet, adminSet, uids } from '../smoke/lib.mjs';

const API = process.env.FILES_API || 'http://127.0.0.1:8797';
const PUBLIC = 'https://havat-ravve-api.meniviner.workers.dev/v1/files/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 10000) { const t0 = Date.now(); let v; while (Date.now() - t0 < timeout) { try { v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(250); } return v; }
async function pickPhoto(s, trigger) {
  const [chooser] = await Promise.all([s.page.waitForEvent('filechooser', { timeout: 5000 }), trigger()]);
  await chooser.setFiles('public/assets/rava-logo.png'); await s.settle(1500);
}

await launch();
try {
  const U = uids();
  // 1. upload through the local Worker
  const s = await session('yoav');
  const posts = [];
  s.page.on('request', (r) => { if (r.url().startsWith(API + '/v1/files')) posts.push(`${r.method()} ${r.headers().authorization ? 'with-token' : 'no-token'}`); });
  await s.go('/tasks/t-yoav?filesApi=' + encodeURIComponent(API), 1500);
  await pickPhoto(s, () => s.click('הוספת תמונה למשימה'));
  const photo = await until(async () => { const p = (await adminGet('tasks/t-yoav'))?.photo || ''; return p.startsWith(PUBLIC) ? p : ''; });
  check(!!photo && photo.startsWith(`${PUBLIC}task/${U.yoav}/`), 'task photo saved as an R2 link under the volunteer\'s uid (rules accepted it)', 'volunteer', photo.slice(0, 120));
  check(posts.includes('POST with-token'), 'the app sent the photo to the Worker with the sign-in token (CORS preflight passed)', 'volunteer', posts.join(', '));
  if (photo) {
    const got = await fetch(API + '/v1/files/' + photo.slice(PUBLIC.length));
    const bytes = Buffer.from(await got.arrayBuffer());
    check(got.status === 200 && /^image\/(webp|jpeg)$/.test(got.headers.get('content-type')) && bytes.length > 1000, 'the same key is served back by the Worker (local R2)', 'volunteer', `${got.status} ${got.headers.get('content-type')} ${bytes.length} bytes`);
  }
  const e1 = s.takeErrors();
  check(!e1.length, 'no console errors while uploading', 'volunteer', e1.slice(0, 3).join(' | '));
  await s.ctx.close();

  // 2. the Worker cannot be reached: the photo is kept inline, as before
  const now = new Date().toISOString();
  await adminSet('tasks/t-proof', { title: 'בדיקת תמונה', note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: { uid: U.yoav, name: 'יואב פרץ' }, createdAt: now, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: { uid: U.yoav, name: 'יואב פרץ' }, urgent: false, eventId: '', updatedAt: now });
  const s2 = await session('yoav');
  await s2.go('/tasks/t-proof?filesApi=http://127.0.0.1:9', 1500);
  await pickPhoto(s2, () => s2.click('הוספת תמונה למשימה'));
  const inline = await until(async () => ((await adminGet('tasks/t-proof'))?.photo || '').startsWith('data:image'));
  check(!!inline, 'Worker unreachable → the photo is saved inline (data URL), nothing lost', 'volunteer');
  await s2.ctx.close();
} catch (e) { check(false, 'proof crashed', '-', String(e).slice(0, 300)); }
await close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed; external requests aborted: ${external.length}${external.length ? ' (' + [...new Set(external.map((u) => new URL(u).host))].join(', ') + ')' : ''}`);
process.exit(failed.length ? 1 : 0);
