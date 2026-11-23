// Seeds the Firebase emulators (Firestore 8080, Auth 9099) for the end-to-end smoke cycle (v2 redesign, tidy round).
// Wipes both emulators first, creates the Google accounts in the Auth emulator and the base data in Firestore.
// Everything a flow creates for real (events, vendor, helper, the invited volunteer, tickets ordered by a guest) is
// left out on purpose: the smoke cycle (scripts/smoke-cycle.mjs) creates it through the app.
//
//   PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:start --only firestore,auth --project demo-havat-ravve
//   node scripts/smoke-seed.mjs
//
// Emulators only: every URL here is localhost.
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); require('firebase/compat/firestore');
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');

// The app's config names the real project id, and connectFirestoreEmulator keeps it, so the app reads the emulator's
// 'havat-ravve' namespace (as `npm run seed` does). This is still only the local emulator on localhost:8080.
const PROJECT = 'havat-ravve';
const AUTH_PROJECT = 'demo-havat-ravve';
const AUTH = 'http://localhost:9099';
const FS = 'http://localhost:8080';

/** Google accounts in the Auth emulator. `profile: false` = no profile yet (a real flow creates it). */
export const ACCOUNTS = {
  owner: { email: 'owner.smoke@example.com', name: 'אליה כהן', role: 'owner', gender: 'f' },
  dana: { email: 'dana.smoke@example.com', name: 'דנה אברהם', role: 'manager', gender: 'f' },
  yoav: { email: 'yoav.smoke@example.com', name: 'יואב פרץ', role: 'staff', gender: 'm' },
  orly: { email: 'orly.smoke@example.com', name: 'אורלי לוי', role: 'staff', gender: 'f' },
  yossi: { email: 'yossi.smoke@example.com', name: 'יוסי כהן', role: 'staff', status: 'pending', gender: 'm' },
  avi: { email: 'avi.smoke@example.com', name: 'אבי שטרן', role: 'staff', status: 'blocked', gender: 'm' },
  michal: { email: 'michal.smoke@example.com', name: 'מיכל בר', role: 'guest', gender: 'f' },
  noga: { email: 'noga.smoke@example.com', name: 'נגה שמיר', profile: false }, // invited by email (M-people), joins through C9
  raz: { email: 'raz.smoke@example.com', name: 'רז כהן', profile: false }, // stall owner, claims a vendor link
  tamar: { email: 'tamar.smoke@example.com', name: 'תמר כהן', profile: false }, // helper, claims the helper link
  rotem: { email: 'rotem.smoke@example.com', name: 'רותם אברהם', profile: false }, // new guest, signs up in item 8 (agrees to updates)
  lior: { email: 'lior.smoke@example.com', name: 'ליאור דהן', role: 'guest', gender: 'm' }, // a guest who opens a cancelled team link (item 10)
  gal: { email: 'gal.smoke@example.com', name: 'גל מזרחי', profile: false }, // added ahead by phone, claims the team link (item 10)
  shir: { email: 'shir.smoke@example.com', name: 'שיר לוי', profile: false }, // a second account that opens the used team link (item 10)
};

export async function idpSignIn(key) {
  const a = ACCOUNTS[key];
  const idToken = JSON.stringify({ sub: 'smoke-' + key, email: a.email, email_verified: true, name: a.name });
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=smoke`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }),
  }).then((x) => x.json());
  if (!r.localId) throw new Error('auth emulator: ' + JSON.stringify(r).slice(0, 200));
  return r;
}

async function main() {
  // wipe
  await fetch(`${AUTH}/emulator/v1/projects/${AUTH_PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const uid = {};
  for (const k of Object.keys(ACCOUNTS)) uid[k] = (await idpSignIn(k)).localId;

  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 } });
  const iso = (d) => d.toISOString();
  const day = (n, h = 12, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
  const key = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' }).format(d);
  const now = iso(new Date());
  const A = (k) => ({ uid: uid[k], name: ACCOUNTS[k].name });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore(); const S = (c, id, d) => setDoc(doc(db, c, id), d);
    let n = 0;
    for (const [k, a] of Object.entries(ACCOUNTS)) {
      if (a.profile === false) continue; n++;
      await S('users', uid[k], { uid: uid[k], email: a.email, displayName: a.name, phone: '052-000-00' + String(10 + n), role: a.role, status: a.status || 'active', customerNumber: n, acceptedTermsAt: now, createdAt: iso(day(-40 + n)), updatedAt: now, welcomedAt: now, fields: {},
        ...(a.status === 'blocked' ? { log: [{ at: iso(day(-1, 9, 15)), by: A('owner'), text: 'מצב: נחסם' }] } : {}) });
    }
    await S('counters', 'users', { value: n });
    await S('settings', 'app', { donationPresets: [{ amount: 18, label: 'חי' }, { amount: 180, label: 'עשר פעמים חי' }, { amount: 360, label: 'לב' }], visitTypes: ['סיור בחווה', 'מפגש קבוצתי', 'אירוע פרטי', 'אחר'], payment: { bit: '050-1234567', paybox: '', cash: true, note: '' }, templates: { visitApproved: 'שלום [שם], הביקור בחוות רווה ב־[תאריך] מאושר. נשמח לראותכם!', donationThanks: 'שלום [שם], תודה רבה על התרומה לחוות רווה.', debtReminder: 'שלום [שם], תודה שהייתם ב־[אירוע]. נשאר לתשלום [סכום] ₪.', ticketReminder: 'שלום [שם], מזכירים: [אירוע] ב־[תאריך].' }, registrationFields: [{ id: 'city', label: 'יישוב', type: 'text', options: [], required: false }], guestIntro: 'ברוכים הבאים לחוות רווה. כאן מזמינים כרטיסים לאירועים, מתאמים ביקור ותורמים.' });
    // places
    await S('places', 'pl-gate', { name: 'הכניסה הראשית', lat: 31.3515, lng: 34.972, createdBy: A('dana'), createdAt: now });
    await S('places', 'pl-garden', { name: 'הגינה', lat: 31.3521, lng: 34.9712, createdBy: A('dana'), createdAt: now });
    await S('places', 'pl-shed', { name: 'המחסן', lat: 31.3528, lng: 34.9705, createdBy: A('dana'), createdAt: now });
    // recurring templates (materialized into today's tasks by a manager's app)
    await S('task_templates', 'tpl-water', { title: 'השקיית העציצים', note: 'גם את השורה שמאחורי המכולה', days: [], time: '07:30', active: true, managersOnly: false, assignee: null, placeId: 'pl-garden', createdBy: A('dana'), createdAt: now, updatedAt: now });
    await S('task_templates', 'tpl-cash', { title: 'בדיקת קופה', note: '', days: [], time: '', active: true, managersOnly: true, assignee: null, createdBy: A('dana'), createdAt: now, updatedAt: now });
    // tasks
    const task = (id, title, extra = {}) => S('tasks', id, { title, note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: A('dana'), createdAt: iso(day(-1)), done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, eventId: '', updatedAt: now, ...extra });
    const at = (p, name) => ({ lat: 31.35, lng: 34.97, placeId: p, placeName: name });
    await task('t-flag', 'להחליף את הדגל ליד הכניסה', { note: 'הדגל הקרוע במחסן, ליד הסולם.', location: at('pl-gate', 'הכניסה הראשית') });
    await task('t-tap', 'לתקן את הברז בגינה', { urgent: true, location: at('pl-garden', 'הגינה') });
    await task('t-race', 'לסדר את המדפים במחסן', { location: at('pl-shed', 'המחסן') });
    await task('t-race2', 'לטאטא את השביל', { location: at('pl-gate', 'הכניסה הראשית') });
    await task('t-off1', 'לאסוף גזם ליד הגדר', {});
    await task('t-off2', 'למלא מים לכלבים', {});
    await task('t-assign', 'להביא שק מלט מהרכב', { dueDate: key(day(0)) });
    await task('t-yoav', 'לבדוק את משאבת המים', { assignee: A('yoav'), takenAt: now, dueDate: key(day(0)) });
    await task('t-done', 'לצבוע את הספסל', { done: true, doneBy: A('orly'), doneAt: iso(new Date(Date.now() - 3 * 3600e3)) });
    await task('t-mgr', 'לסגור חוזה עם ספק היין', { managersOnly: true, createdBy: A('owner') });
    // shopping: open items and a bought history (the suggestion chips come from it)
    const item = (id, title, cat, extra = {}) => S('shopping', id, { title, qty: '', urgent: false, note: '', link: '', category: cat, createdBy: A('orly'), createdAt: iso(new Date(Date.now() - 2 * 3600e3)), bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now, ...extra });
    await item('s-milk', 'חלב', 'super', { qty: '3' });
    await item('s-eggs', 'ביצים', 'super');
    await item('s-cement', 'שקי מלט', 'building', { qty: '2', urgent: true });
    await item('s-off', 'סבון כלים', 'super');
    for (let i = 0; i < 9; i++) await item('s-h' + i, ['לחם', 'עגבניות', 'לחם', 'חלב', 'לחם', 'קפה', 'עגבניות', 'קפה', 'לחם'][i], 'super', { bought: true, boughtBy: A(['orly', 'yoav', 'dana'][i % 3]), boughtAt: iso(day(-i - 1, 11)), createdAt: iso(day(-i - 2)), expireAt: iso(day(-i)) });
    // an upcoming published event (guest flows, the farm tab) and a past one
    const ev = (id, title, start, end, extra = {}) => S('events', id, { title, description: 'ערב של מוזיקה חיה, יין מהחווה ואוכל טוב. מתאים לכל המשפחה.', image: '', location: 'חוות רווה', start: iso(start), end: iso(end), price: 50, maxPerOrder: 5, capacity: 0, open: true, published: true, publishedAt: iso(day(-10)), questions: [], createdBy: A('dana'), createdAt: iso(day(-10)), updatedAt: now, ...extra });
    await ev('ev-winter', 'פסטיבל החורף', day(12, 18), day(12, 23));
    await ev('ev-past', 'ערב גבינות ושירה', day(-20, 18), day(-20, 22), { open: false });
    // a guest's visit request and donation (manager inbox, payments approval)
    await S('visits', 'vi-michal', { uid: uid.michal, name: ACCOUNTS.michal.name, phone: '0523333333', date: key(day(6)), people: 4, type: 'סיור בחווה', note: 'משפחה עם שני ילדים', status: 'new', managerNote: '', handledBy: null, createdAt: iso(day(-2)), updatedAt: now });
    await S('donations', 'dn-michal', { uid: uid.michal, name: ACCOUNTS.michal.name, phone: '0523333333', amount: 180, label: 'עשר פעמים חי', note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'claimed', createdAt: iso(day(-1)), updatedAt: now });
    // a past event's tickets the guest marked as paid (trust-based bulk approval)
    for (let i = 1; i <= 2; i++) await S('tickets', 'tk-past' + i, { eventId: 'ev-winter', eventTitle: 'פסטיבל החורף', orderId: 'or-michal', index: i, total: 2, ownerUid: uid.michal, ownerName: ACCOUNTS.michal.name, ownerPhone: '0523333333', holderName: '', secret: 'smokesecret000000000000' + i, price: 50, paymentStatus: 'claimed', status: 'valid', scans: [], entries: 0, answers: {}, createdAt: iso(day(-3)), updatedAt: now });
    // the notifications the guest helpers in src/app/data.ts write for those three (notify(): the manager inbox, M2)
    const nt = (id, type, title, text, link, refId, ago) => S('notifications', id, { type, title, text, link, refId, createdAt: iso(new Date(Date.now() - ago * 3600e3)), handled: false, handledBy: null, handledAt: null });
    await nt('nt-visit', 'visit', 'בקשת ביקור חדשה', `${ACCOUNTS.michal.name} · 4 אנשים · ${key(day(6))}`, '/manage/visits/vi-michal', 'vi-michal', 5);
    await nt('nt-dn', 'claim', 'תרומה הועברה', `${ACCOUNTS.michal.name} סימן/ה שהעביר/ה 180 ₪`, '/manage/donations/dn-michal', 'dn-michal', 4);
    await nt('nt-tk', 'claim', 'תשלום הועבר: פסטיבל החורף', `${ACCOUNTS.michal.name} סימן/ה שהעביר/ה תשלום על 2 כרטיסים`, '/manage/events/ev-winter/guests', 'or-michal', 3);
  });
  await env.cleanup();
  fs.mkdirSync('.build/smoke', { recursive: true });
  fs.writeFileSync('.build/smoke/uids.json', JSON.stringify(uid, null, 1));
  console.log('smoke seed: ' + Object.keys(uid).length + ' accounts, base data written');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
