// System area (Q18 profile replacing L6 / C12, C13, A1, A2, C2, C9, C10, C8, X2, Z1, Z3): the pure helpers (periods, role words, photo source,
// birth date, suspended date, search with role filtering) and the profile writes, run against the demo store with
// Firestore stubbed out. Writes must stay in demo and touch only the person's own fields.
//   node tests/v2-system.mjs
//   node tests/v2-system.mjs --base=http://localhost:5236   (also checks the Q18 placement in the running demo app)
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Firestore must never be reached: every function of the SDK records the call and the test asserts there were none.
const stub = {
  name: 'stub-firebase',
  setup(b) {
    b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'fs', namespace: 'stub' }));
    b.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onResolve({ filter: /^firebase\/storage$/ }, () => ({ path: 'storage', namespace: 'stub' }));
    b.onResolve({ filter: /^\.\.?\/(\.\.\/)*firebase$/ }, () => ({ path: 'app', namespace: 'stub' }));
    b.onLoad({ filter: /^fs$/, namespace: 'stub' }, () => ({ contents: `
      const rec = (n) => (...a) => { globalThis.__calls.push(n); return n === 'onSnapshot' ? () => {} : {}; };
      export const collection = rec('collection'), doc = rec('doc'), documentId = rec('documentId'), onSnapshot = rec('onSnapshot'), query = rec('query'), where = rec('where'), orderBy = rec('orderBy'), limit = rec('limit');
      export const setDoc = async () => rec('setDoc')(), updateDoc = async () => rec('updateDoc')(), deleteDoc = async () => rec('deleteDoc')(), getDocsFromServer = async () => rec('get')();
      export const writeBatch = () => { rec('writeBatch')(); return { set() {}, update() {}, delete() {}, commit: async () => {} }; };
      export const runTransaction = async () => rec('runTransaction')();
      export const arrayUnion = rec('arrayUnion'), arrayRemove = rec('arrayRemove'), increment = rec('increment'), serverTimestamp = rec('serverTimestamp');
    ` }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: 'export const onAuthStateChanged = () => {}; export const signOut = async () => {};' }));
    b.onLoad({ filter: /^storage$/, namespace: 'stub' }, () => ({ contents: 'export {};' }));
    b.onLoad({ filter: /^app$/, namespace: 'stub' }, () => ({ contents: "export const db = {}, ownerEmail = 'owner@example.test', config = {}, emulatorMode = false; export const readyAuth = async () => ({ currentUser: null }); export const isGoogleUser = () => false, inAppBrowser = () => false, authErrorMessage = () => ''; export const signIn = async () => {}, signOutUser = async () => {}; export { nowIso, todayKey, dateKeyOf, hoursAgoIso } from '" + process.cwd() + "/src/app/clock';", resolveDir: process.cwd(), loader: 'ts' }));
  },
};
await build({
  stdin: { contents: `
    export * as sys from './src/app/v2/data/system';
    export { setDemo, demoDoc, demoItems } from './src/app/demo/store';
    export { freezeClock } from './src/app/clock';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: '.build/v2-system-test.mjs', plugins: [stub], logLevel: 'silent', jsx: 'automatic',
  external: ['react', 'react-dom'],
});
const kv = new Map();
globalThis.localStorage = { getItem: (k) => (kv.has(k) ? kv.get(k) : null), setItem: (k, v) => kv.set(k, String(v)), removeItem: (k) => kv.delete(k), clear: () => kv.clear() };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.location = { search: '', pathname: '/app', origin: 'http://localhost', href: 'http://localhost/app' };
globalThis.history = { replaceState() {}, pushState() {}, state: null };
globalThis.window = globalThis; globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'node', platform: 'node', maxTouchPoints: 0 }, configurable: true });
globalThis.__calls = [];
const m = await import('../.build/v2-system-test.mjs?' + Date.now());
const { sys } = m;
m.freezeClock('2026-11-19T10:30:00+02:00');

// ---------- periods (Thu 19.11.2026: week from Sunday 15.11, month from 1.11) ----------
const p = sys.periodStarts('2026-11-19');
assert.equal(p.day, '2026-11-18T22:00:00.000Z');
assert.equal(p.week, '2026-11-14T22:00:00.000Z', 'the week starts on Sunday');
assert.equal(p.month, '2026-10-31T22:00:00.000Z');
assert.equal(p.end, '2026-11-19T21:59:59.000Z');
assert.equal(sys.periodStarts('2026-11-15').week, sys.periodStarts('2026-11-15').day, 'on Sunday the week starts today');

// ---------- role words and "since" ----------
assert.equal(sys.roleWord({ role: 'owner' }, true, true), 'בעלים');
assert.equal(sys.roleWord({ role: 'manager' }, false, true), 'מנהל');
assert.equal(sys.roleWord({ role: 'staff' }, false, false), 'מתנדב');
assert.equal(sys.roleWord({ role: 'vendor' }, false, false), 'בעל דוכן');
assert.equal(sys.roleWord({ role: 'vendor', helper: true }, false, false), 'עוזר בדוכן');
assert.equal(sys.roleWord({ role: 'guest' }, false, false), 'אורח');
assert.equal(sys.sinceText('2026-10-12T09:00:00.000Z'), 'מאוקטובר 2026');
assert.equal(sys.sinceText('2026-10-31T23:30:00.000Z'), 'מנובמבר 2026', 'the month is the Israeli one');
assert.equal(sys.sinceText(''), '');

// ---------- photo source (missing source = google when a Google picture exists, else custom when a photo exists, else none) ----------
assert.equal(sys.sourceOf({}), 'none');
assert.equal(sys.sourceOf({ googlePhoto: 'g' }), 'google');
assert.equal(sys.sourceOf({ photo: 'c' }), 'custom');
assert.equal(sys.sourceOf({ photo: 'c', googlePhoto: 'g' }), 'google', 'old docs with both keep showing Google');
assert.equal(sys.photoOf({ photo: 'c', googlePhoto: 'g', photoSource: 'custom' }), 'c');
assert.equal(sys.photoOf({ photo: 'c', googlePhoto: 'g', photoSource: 'none' }), undefined, 'none = initials even when pictures exist');
assert.equal(sys.photoOf({ photoSource: 'custom' }), undefined, 'custom without a photo = initials');

// ---------- birth date ----------
assert.equal(sys.parseBirth(''), '');
assert.equal(sys.parseBirth('14.03.1975'), '1975-03-14');
assert.equal(sys.parseBirth('14/3/1975'), '1975-03-14');
assert.equal(sys.parseBirth('1975-03-14'), '1975-03-14');
assert.equal(sys.parseBirth('31.02.1980'), null, 'no 31 February');
assert.equal(sys.parseBirth('1.1.2030'), null, 'not in the future');
assert.equal(sys.parseBirth('1.1.1850'), null);
assert.equal(sys.parseBirth('אתמול'), null);
assert.equal(sys.birthText('1975-03-14'), '14.03.1975');

// ---------- small words ----------
assert.equal(sys.firstName('  בני גוטמן '), 'בני');
assert.equal(sys.INVITE_ROLE_WORD.staff, 'כמתנדב');
assert.equal(sys.suspendedAt({ log: [{ at: '2026-11-01T00:00:00Z', text: 'מצב: פעיל' }, { at: '2026-11-18T09:15:00Z', text: 'מצב: נחסם' }], updatedAt: '2026-11-20T00:00:00Z' }), '2026-11-18T09:15:00Z');
assert.equal(sys.suspendedAt({ updatedAt: '2026-11-20T00:00:00Z' }), '2026-11-20T00:00:00Z', 'no log: the last update');

// ---------- search: what each role may find ----------
const people = [
  { uid: 'u1', role: 'owner', displayName: 'בני גוטמן', phone: '050-1111111', email: 'b@x' },
  { uid: 'u2', role: 'staff', displayName: 'יואב כהן', phone: '052-2222222', email: 'y@x' },
  { uid: 'u3', role: 'guest', displayName: 'אסתר כהן', phone: '054-3333333', email: 'e@x' },
  { uid: 'u4', role: 'vendor', displayName: 'רז כהן', phone: '053-4444444', email: 'r@x' },
];
const ctxOf = (manager) => ({ manager, owner: manager, user: { uid: 'u2' }, today: '2026-11-19', places: [{ id: 'pl1', name: 'שער כהן' }], peopleByUid: new Map(people.map((x) => [x.uid, x])) });
const data = {
  tasks: [
    { id: 't1', title: 'להתקשר לאסתר כהן', managersOnly: true, assignee: { uid: 'u1', name: 'בני גוטמן' }, dueDate: '2026-11-19', done: false },
    { id: 't2', title: 'להחזיר לדוד כהן את המטען', done: true, doneBy: { uid: 'u5', name: 'נועה שחר' }, doneAt: '2026-11-12T10:20:00Z' },
    { id: 't3', title: 'לקנות לכהן מתנה', assignee: { uid: 'u2', name: 'יואב כהן' }, dueDate: '2026-11-19', done: false },
  ],
  shopping: [{ id: 's1', title: 'גבינת כהן', qty: '2', bought: false }],
  events: [{ id: 'e1', title: 'ערב כהן', published: false, start: '2026-11-27T18:00:00+02:00' }, { id: 'e2', title: 'שוק כהן', published: true, start: '2026-11-28T10:00:00+02:00' }],
  visits: [{ id: 'v1', uid: 'u3', name: 'אסתר כהן', people: 4, date: '2026-11-27', type: 'סיור', status: 'new' }],
  unpaid: [{ id: 'k1', ownerUid: 'u3', status: 'valid', price: 200, eventTitle: 'פסטיבל הסתיו', paymentStatus: 'pending' }],
  loading: false,
};
const kinds = (hits) => [...new Set(hits.map((h) => h.kind))];
const mgr = sys.searchAll(ctxOf(true), data, 'כהן');
assert.deepEqual(kinds(mgr), ['people', 'visits', 'tasks', 'events', 'shopping', 'places']);
assert.deepEqual(mgr.filter((h) => h.kind === 'people').map((h) => h.id), ['u2', 'u3'], 'team first, vendors never; the owner does not match');
const ester = mgr.find((h) => h.id === 'u3');
assert.equal(ester.meta, '054-3333333 · פסטיבל הסתיו');
assert.deepEqual(ester.tag, { text: '200 ₪', tone: 'waiting' });
assert.equal(mgr.find((h) => h.id === 'v1').meta, 'שישי 27.11 · סיור');
assert.equal(sys.searchAll(ctxOf(true), { ...data, unpaid: [] }, 'אסתר').find((h) => h.id === 'u3').meta, '054-3333333 · ביקשה ביקור', 'the visit request follows her gender');
assert.equal(mgr.find((h) => h.id === 't1').meta, 'בני · היום');
assert.equal(mgr.find((h) => h.id === 't2').meta, 'בוצע · נועה · 12.11');
assert.equal(mgr.find((h) => h.id === 't3').meta, 'עליך · היום');
assert.equal(mgr.find((h) => h.id === 'e1').href, '/manage/events/e1');

const vol = sys.searchAll(ctxOf(false), data, 'כהן');
assert.deepEqual(kinds(vol), ['tasks', 'events', 'shopping', 'places'], 'volunteers: no people, visits or money');
assert.ok(!vol.some((h) => h.id === 't1'), 'a managers-only task never reaches a volunteer');
assert.deepEqual(vol.filter((h) => h.kind === 'events').map((h) => h.id), ['e2'], 'only published events');
assert.equal(vol.find((h) => h.id === 'e2').href, '/farm/events/e2');
assert.equal(sys.searchAll(ctxOf(false), data, '0522222222').length, 0, 'volunteers cannot search people by phone');
assert.deepEqual(sys.searchAll(ctxOf(true), data, '052 222').map((h) => h.id), ['u2'], 'phone digits match across dashes and spaces');
assert.deepEqual(sys.searchAll(ctxOf(true), data, '   '), []);

// ---------- writes: demo only, own fields only ----------
m.setDemo({ on: true, persona: 'staff' });
globalThis.__calls.length = 0;
const yoav = m.demoDoc('users/demo-u-yoav');
assert.ok(yoav, 'the staff persona has a profile');
assert.equal(yoav.photoSource, 'custom', 'seed: Yoav chose his own picture');
const before = { role: yoav.role, status: yoav.status, email: yoav.email };
await sys.saveProfile(yoav, { displayName: ' יואב פרץ ', phone: '052-1234567', town: 'רחובות', birthDate: '14.3.1975', receipt: 'email' });
let after = m.demoDoc('users/demo-u-yoav');
assert.equal(after.displayName, 'יואב פרץ');
assert.equal(after.town, 'רחובות');
assert.equal(after.birthDate, '1975-03-14');
assert.equal(after.fields.receiptPreference, 'email');
assert.deepEqual({ role: after.role, status: after.status, email: after.email }, before, 'role, status and mail never change from the profile');
await sys.savePhotoSource('demo-u-yoav', 'none');
assert.equal(m.demoDoc('users/demo-u-yoav').photoSource, 'none');
await sys.saveCustomPhoto('demo-u-yoav', 'data:image/jpeg;base64,AAAA');
after = m.demoDoc('users/demo-u-yoav');
assert.equal(after.photoSource, 'custom'); assert.equal(after.photo, 'data:image/jpeg;base64,AAAA');
// push preferences moved to the push area (src/app/v2/data/push.ts, tested in tests/v2-broadcast.mjs and tests/api.mjs)
await sys.markWelcomed('demo-u-yoav', { displayName: 'יואב פרץ', phone: '052-1234567' });
assert.ok(m.demoDoc('users/demo-u-yoav').welcomedAt, 'C9 marks the first entry');

// ---------- registration questions (settings.registrationFields): the same rules as the old RegistrationFields.tsx ----------
const QS = [
  { id: 'receiptPreference', label: 'אישורים', type: 'choice', options: ['whatsapp', 'email'], required: false },
  { id: 'shirt', label: 'מידת חולצה', type: 'choice', options: ['S', 'M', 'L'], required: true },
  { id: 'empty', label: 'בלי אפשרויות', type: 'choice', options: [], required: true },
  { id: 'nolabel', label: '  ', type: 'text', options: [], required: true },
  { id: 'since', label: 'מתנדב מאז', type: 'date', options: [], required: false },
  { id: 'how', label: 'איך שמעת עלינו', type: 'text', options: [], required: true },
];
const qs = sys.registrationQuestions(QS);
assert.deepEqual(qs.map((f) => f.id), ['shirt', 'since', 'how'], 'no receipt question, no empty label, no choice without options');
assert.deepEqual(sys.registrationQuestions(undefined), [], 'old settings without questions');
assert.equal(sys.answerOf({ shirt: 'XL' }, qs[0]), '', 'a choice that is no longer an option is no answer');
assert.equal(sys.answerOf({ shirt: 'M' }, qs[0]), 'M');
assert.deepEqual(sys.missingAnswers({ shirt: 'M', how: '  ' }, qs), ['how'], 'only required, blank counts as missing');
assert.deepEqual(sys.missingAnswers({ shirt: 'M', how: 'חבר' }, qs), []);
assert.equal(sys.answerText({ since: '2024-05-01' }, qs[1]), '01.05.2024', 'a date answer reads as on the profile');
assert.deepEqual(sys.answersFor({ shirt: 'M', receiptPreference: 'email', other: 'x' }, qs), { shirt: 'M' }, 'the form starts from the questions only');
await sys.saveProfile(m.demoDoc('users/demo-u-yoav'), { displayName: 'יואב פרץ', phone: '052-1234567', town: '', birthDate: '', receipt: 'whatsapp', answers: { shirt: 'L', how: ' חבר ' } });
after = m.demoDoc('users/demo-u-yoav');
assert.deepEqual({ shirt: after.fields.shirt, how: after.fields.how, receipt: after.fields.receiptPreference }, { shirt: 'L', how: 'חבר', receipt: 'whatsapp' }, 'C13 saves the answers trimmed, with the receipt');
await sys.saveProfile(m.demoDoc('users/demo-u-yoav'), { displayName: 'יואב פרץ', phone: '052-1234567', town: '', birthDate: '', receipt: 'whatsapp' });
assert.equal(m.demoDoc('users/demo-u-yoav').fields.shirt, 'L', 'a draft without answers keeps the stored ones');
await sys.markWelcomed('demo-u-yoav', { displayName: 'יואב פרץ', phone: '052-1234567', fields: { ...m.demoDoc('users/demo-u-yoav').fields, how: 'אתר ' } });
assert.deepEqual({ shirt: m.demoDoc('users/demo-u-yoav').fields.shirt, how: m.demoDoc('users/demo-u-yoav').fields.how }, { shirt: 'L', how: 'אתר' }, 'C9 /welcome writes the answers');

// ---------- install banner (the old shell's rules) ----------
const base = { installed: false, seenBefore: true, depth: 0, dismissedUntil: 0, now: 1000, prompt: true, ios: false, route: '/tasks' };
assert.equal(sys.installBannerShown(base), true);
assert.equal(sys.installBannerShown({ ...base, installed: true }), false, 'not once installed');
assert.equal(sys.installBannerShown({ ...base, route: '/install' }), false, 'not on /install');
assert.equal(sys.installBannerShown({ ...base, seenBefore: false }), false, 'not on the first screen of a first visit');
assert.equal(sys.installBannerShown({ ...base, seenBefore: false, depth: 1 }), true, 'after moving on in a first visit');
assert.equal(sys.installBannerShown({ ...base, dismissedUntil: 2000 }), false, 'not while dismissed');
assert.equal(sys.installBannerShown({ ...base, prompt: false }), false, 'nothing to offer on a browser without a prompt');
assert.equal(sys.installBannerShown({ ...base, prompt: false, ios: true }), true, 'iPhone gets the Safari steps');
const until = sys.snoozeInstall(1000);
assert.equal(until, 1000 + 14 * 86400_000, 'two weeks');
assert.equal(localStorage.getItem('farm-app-install-dismissed-until'), String(until), 'the old banner key');
assert.equal(sys.installDismissedUntil(), until);
sys.markInstallSeen();
assert.equal(localStorage.getItem('farm-app-install-seen'), 'yes');

// ---------- seed slice ----------
const tasks = m.demoItems('tasks');
assert.equal(tasks.find((t) => t.id === 'demo-t-call-ester')?.managersOnly, true);
assert.equal(m.demoDoc('users/demo-u-yossi').log.at(-1).text, 'מצב: נחסם');
assert.equal(sys.suspendedAt(m.demoDoc('users/demo-u-yossi')), '2026-11-18T09:15:00.000Z', 'X2 says 18.11');

assert.deepEqual(globalThis.__calls.filter((c) => /Doc|Batch|Transaction|get/.test(c)), [], 'nothing reached Firestore');

// ---------- Q18 placement in the running app (demo), only with a dev server: --base=http://localhost:52xx or BASE= ----------
const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || process.env.BASE || '';
if (BASE) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const open = async (persona, path) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
    await ctx.addInitScript((p) => { if (sessionStorage.getItem('__vc')) return; sessionStorage.setItem('__vc', '1'); localStorage.clear(); localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona: p, scenario: 'regular' })); }, persona);
    const page = await ctx.newPage(); page.setDefaultTimeout(4000);
    const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (x) => { if (x.type() === 'error') errors.push(x.text()); });
    await page.goto(`${BASE}/app${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    return { ctx, page, errors, text: async () => page.locator('body').innerText() };
  };
  for (const persona of ['owner', 'staff']) {
    const s = await open(persona, '/me');
    const t = await s.text();
    assert.equal(await s.page.locator('.k-topbar .k-ulink').filter({ hasText: 'עריכת פרטים' }).count(), 1, `${persona} Q18: "עריכת פרטים" is the underlined link in the top bar`);
    assert.equal(await s.page.getByRole('button', { name: 'עריכה', exact: true }).count(), 0, `${persona} Q18: no outlined "עריכה" on the profile`);
    assert.ok(!t.includes('איך שמעתם עלינו?'), `${persona} Q18: registration answers are not listed on /me`);
    assert.ok(!t.includes('מחיקת החשבון'), `${persona} Q18: account deletion is not on /me`);
    const foot = await s.page.locator('.system-foot').innerText();
    assert.ok(foot.includes('יציאה מהחשבון') && foot.includes('האתר של החווה') && foot.includes('תנאי שימוש'), `${persona} Q18: website and terms are quiet links beside sign-out`);
    assert.equal(await s.page.locator('.k-list').filter({ hasText: 'האתר של החווה' }).count(), 0, `${persona} Q18: the website is not a row`);
    assert.ok(t.includes(persona === 'owner' ? 'לראות את האפליקציה כמו מתנדב' : 'פנייה למנהלים') && t.includes('התקנה למסך הבית') && t.includes('הכרטיסים שלי כאורח'), `${persona} Q18: the designed rows stay`);
    await s.page.locator('.k-ulink').filter({ hasText: 'עריכת פרטים' }).click(); await s.page.waitForTimeout(400);
    assert.match(new URL(s.page.url()).pathname, /\/app\/me\/edit$/, `${persona}: "עריכת פרטים" opens /me/edit`);
    const e = await s.text();
    assert.ok(e.includes('איך שמעתם עלינו?') && e.includes('יישוב *'), `${persona} C13: the registration questions are edited in /me/edit`);
    assert.ok(e.includes('מחיקת החשבון'), `${persona} C13: account deletion sits at the bottom of /me/edit`);
    assert.deepEqual(s.errors, [], `${persona}: no page errors`);
    await s.ctx.close();
  }
  { // a team invitee (C9) answers the same questions on first entry
    const s = await open('new', '/');
    const t = await s.text();
    // rule 8: a required question stays in the form; the optional ones wait in "עוד פרטים"
    assert.ok(t.includes('ברוך הבא לצוות') && t.includes('יישוב *') && !t.includes('איך שמעתם עלינו?'), 'C9: required questions in the form, optional ones folded');
    await s.page.locator('.k-moredetails__head').click(); await s.page.waitForTimeout(200);
    assert.ok((await s.text()).includes('איך שמעתם עלינו?'), 'C9: a team invitee answers the optional questions under "עוד פרטים"');
    assert.deepEqual(s.errors, [], 'C9: no page errors');
    await s.ctx.close();
  }
  { // decision 10 (U15, U16): a guest opens a visit request and a donation from the account, marks the donation paid, cancels the request
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { if (sessionStorage.getItem('__vc')) return; sessionStorage.setItem('__vc', '1'); localStorage.clear(); localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona: 'guest', scenario: 'eventDay' })); });
    const page = await ctx.newPage(); page.setDefaultTimeout(4000);
    const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (x) => { if (x.type() === 'error') errors.push(x.text()); });
    const text = () => page.locator('body').innerText();
    const fromAccount = async (title) => { // the row on U7, or under "הכל · N" when it is not in the first four
      await page.goto(`${BASE}/app/me/account`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
      const row = page.locator('.k-row').filter({ hasText: title });
      if (!(await row.count())) { await page.getByRole('button', { name: /^הכל/ }).click(); await page.waitForTimeout(300); }
      await page.locator('.k-row').filter({ hasText: title }).first().click(); await page.waitForTimeout(400);
    };
    await fromAccount('ביקור ·');
    assert.match(new URL(page.url()).pathname, /\/app\/me\/visits\/demo-vi-michal$/, 'U15: the visit row opens the request');
    let t = await text();
    for (const w of ['בקשת ביקור', 'מחכה לתשובה', '8 אנשים', 'כתבת', 'הבקשה נשלחה', 'החווה חוזרת אליך', 'הביקור נקבע', 'וואטסאפ לחווה', 'ביטול הבקשה']) assert.ok(t.includes(w), `U15 shows "${w}"`);
    await page.getByRole('button', { name: 'עוד פעולות' }).click(); await page.waitForTimeout(300);
    assert.deepEqual(await page.locator('.k-actionsheet .k-action__label').allInnerTexts(), ['ביטול הבקשה'], 'U15: cancel and nothing else in ⋯');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await fromAccount('תרומה · 180');
    assert.match(new URL(page.url()).pathname, /\/app\/me\/donations\/demo-d-michal$/, 'U16: the donation row opens the donation');
    t = await text();
    for (const w of ['ממתין לתשלום', 'לזכר יוסף ברק', 'ביקשת · תישלח אחרי האישור', 'נשאר לשלם', 'תרומה, מיכל ברק']) assert.ok(t.includes(w), `U16 shows "${w}"`);
    await page.getByRole('button', { name: 'העברתי את התשלום' }).click();
    await page.getByText('המנהלים יאשרו את ההעברה').first().waitFor();
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    t = await text();
    assert.ok(t.includes('סימנת שהעברת · מחכה לאישור') && !t.includes('העברתי את התשלום'), 'U16: marked paid, kept after reload, the button is gone');
    await fromAccount('ביקור ·');
    await page.locator('.guest-actions').getByRole('button', { name: 'ביטול הבקשה' }).click(); await page.waitForTimeout(300);
    await page.locator('.k-sheet').getByRole('button', { name: 'ביטול הבקשה' }).click();
    await page.getByText('הבקשה בוטלה').first().waitFor();
    t = await text();
    assert.ok(t.includes('בוטל') && (await page.getByRole('button', { name: 'עוד פעולות' }).count()) === 0 && (await page.locator('.guest-steps').count()) === 0, 'U15: the cancelled request has no status line and no cancel');
    assert.deepEqual(errors, [], 'U15/U16: no page errors');
    await ctx.close();
  }
  { // decision 11: one row at the bottom of a team member's tickets leads to their own "מה יש לי בחווה"
    const s = await open('staff', '/me/tickets');
    const last = s.page.locator('.k-list').last();
    assert.ok((await last.innerText()).includes('מה יש לי בחווה'), 'decision 11: the row sits at the bottom of the tickets page');
    await last.locator('.k-row').filter({ hasText: 'מה יש לי בחווה' }).click(); await s.page.waitForTimeout(400);
    assert.match(new URL(s.page.url()).pathname, /\/app\/me\/items$/, 'decision 11: the row opens /me/items');
    assert.ok((await s.text()).includes('הכרטיסים שלי'), 'decision 11: the list goes back to the tickets');
    assert.deepEqual(s.errors, [], 'decision 11: no page errors');
    await s.ctx.close();
  }
  await browser.close();
  console.log('v2-system: Q18 placement checked in the app');
}
console.log('v2-system: all passed');
