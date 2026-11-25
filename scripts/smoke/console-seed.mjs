// The owners' console walk's made-up farm (scripts/console-walk.mjs): synthetic people only, in the local emulators.
import { idp, put } from './console-env.mjs';

export const IL = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const H = 60, D = 1440;

/** Google accounts of the Auth emulator: key -> [sub, email, name, role, status]. */
export const PEOPLE = {
  owner: ['walk-owner', 'owner.walk@example.com', 'אליה כהן', 'owner', 'active'],
  owner2: ['walk-owner2', 'owner2.walk@example.com', 'נעם רז', 'owner', 'active'],
  dana: ['walk-dana', 'dana.walk@example.com', 'דנה אברהם', 'manager', 'active'],
  yoav: ['walk-yoav', 'yoav.walk@example.com', 'יואב פרץ', 'staff', 'active'],
  orly: ['walk-orly', 'orly.walk@example.com', 'אורלי לוי', 'staff', 'active'],
  yossi: ['walk-yossi', 'yossi.walk@example.com', 'יוסי בר', 'staff', 'pending'],
  avi: ['walk-avi', 'avi.walk@example.com', 'אבי שטרן', 'staff', 'blocked'],
  raz: ['walk-raz', 'raz.walk@example.com', 'רז גולן', 'vendor', 'active'],
  michal: ['walk-michal', 'michal.walk@example.com', 'מיכל בר', 'guest', 'active'],
  lior: ['walk-lior', 'lior.walk@example.com', 'ליאור דהן', 'guest', 'active'],
};

export async function seed() {
  const uid = {};
  let n = 0;
  for (const [k, [sub, email, name, role, status]] of Object.entries(PEOPLE)) {
    uid[k] = (await idp(sub, email, name)).localId; n++;
    await put('users/' + uid[k], { uid: uid[k], email, displayName: name, phone: '052-000-00' + (10 + n), role, status, customerNumber: n, acceptedTermsAt: ago(50 * D), createdAt: ago((40 - n) * D), updatedAt: ago(D), welcomedAt: ago(D), fields: k === 'michal' ? { receiptPreference: 'email' } : {}, ...(role === 'vendor' ? { vendorId: 'v-honey' } : {}), push: { enabled: true, devices: k === 'owner' ? [{ id: 'a', kind: 'webpush', ua: 'iPhone · Safari · app', createdAt: ago(D) }] : [] } });
  }
  for (let i = 0; i < 25; i++) await put('users/guest-' + i, { uid: 'guest-' + i, email: `guest${i}.walk@example.com`, displayName: i === 7 ? '=HYPERLINK("http://x","לחצו")' : 'אורח ' + i, phone: '053-000-00' + (10 + i), role: 'guest', status: 'active', customerNumber: 100 + i, createdAt: ago((i + 1) * D), updatedAt: ago(D) });
  await put('counters/users', { value: 130 });
  const A = (k) => ({ uid: uid[k], name: PEOPLE[k][2] });
  await put('settings/app', { donationPresets: [{ amount: 18, label: 'חי' }], visitTypes: ['סיור בחווה'], payment: { bit: '050-0000000', paybox: '', cash: true, note: '' }, templates: { paymentConfirmation: 'שלום [שם], קיבלנו [סכום] עבור [עבור]. תודה מחוות רווה' } });
  await put('places/pl-gate', { name: 'הכניסה הראשית', lat: 31.3515, lng: 34.972, createdBy: A('dana'), createdAt: ago(30 * D) });
  await put('places/pl-garden', { name: 'הגינה', lat: 31.3521, lng: 34.9712, createdBy: A('dana'), createdAt: ago(30 * D) });
  const task = (id, title, x = {}) => put('tasks/' + id, { title, note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: A('dana'), createdAt: ago(2 * D), done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, eventId: '', updatedAt: ago(D), ...x });
  await task('t-edit', 'לצבוע את הגדר', { note: 'צבע לבן, שתי שכבות' });
  await task('t-del', 'משימה למחיקה');
  await task('t-restore', 'משימה לשחזור מגיבוי', { note: 'המצב המקורי' });
  await task('t-formula', '=SUM(A1:A9)');
  await task('t-tap', 'לתקן את הברז בגינה', { urgent: true, location: { lat: 31.35, lng: 34.97, placeId: 'pl-garden', placeName: 'הגינה' } });
  await task('t-yoav', 'לבדוק את משאבת המים', { assignee: A('yoav'), takenAt: ago(H), dueDate: IL() });
  for (let i = 0; i < 30; i++) await task('t-many-' + i, 'משימה ' + i, i % 2 ? { done: true, doneBy: A(i % 3 ? 'yoav' : 'orly'), doneAt: ago((i % 9) * D + H) } : {});
  for (let i = 0; i < 12; i++) await put('shopping/s-' + i, { title: ['חלב', 'לחם', 'ביצים', 'קפה'][i % 4] + ' ' + i, qty: '2', urgent: i === 0, note: '', link: '', category: 'super', createdBy: A('orly'), createdAt: ago(D * (i + 1)), bought: i > 4, boughtBy: i > 4 ? A('yoav') : null, boughtAt: i > 4 ? ago(D * i) : null, updatedAt: ago(D) });
  const ev = (id, title, days, x = {}) => put('events/' + id, { title, description: 'ערב', image: '', location: 'חוות רווה', start: ago(-days * D), end: ago(-days * D - 300), price: 50, maxPerOrder: 5, capacity: 80, open: days > 0, published: true, createdBy: A('dana'), createdAt: ago(60 * D), updatedAt: ago(D), ...x });
  await ev('ev-winter', 'פסטיבל החורף', 12); await ev('ev-past', 'ערב גבינות ושירה', -20); await ev('ev-old', 'יריד הקיץ', -80);
  await put('events/ev-winter/vendors/v-honey', { vendorId: 'v-honey', name: 'דבש הנגב', status: 'confirmed', fee: 200, createdAt: ago(5 * D) });
  await put('vendors/v-honey', { name: 'דבש הנגב', product: 'דבש', phone: '052-0000099', createdAt: ago(30 * D) });
  const tk = (id, x) => put('tickets/' + id, { eventId: 'ev-winter', eventTitle: 'פסטיבל החורף', orderId: 'or-' + id, index: 1, total: 1, ownerUid: uid.michal, ownerName: 'מיכל בר', ownerPhone: '0523333333', holderName: '', secret: 'x'.repeat(24), price: 50, paymentStatus: 'pending', status: 'valid', scans: [], entries: 0, answers: {}, createdAt: ago(4 * D), updatedAt: ago(D), ...x });
  await tk('tk-1', { paymentStatus: 'paid', paidAt: new Date(Date.now() - 3 * D * 60_000) }); await tk('tk-2', { paymentStatus: 'claimed' }); await tk('tk-3', {}); await tk('tk-4', { status: 'cancelled' });
  await tk('tk-5', { eventId: 'ev-past', eventTitle: 'ערב גבינות ושירה', paymentStatus: 'paid', entries: 1, paidAt: new Date(Date.now() - 20 * D * 60_000) });
  const dn = (id, x) => put('donations/' + id, { uid: uid.michal, name: 'מיכל בר', phone: '0523333333', amount: 180, label: 'עשר פעמים חי', note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'paid', createdAt: ago(3 * D), updatedAt: ago(2 * D), ...x });
  await dn('dn-ok', { paidAt: new Date(Date.now() - 2 * D * 60_000) }); await dn('dn-claim', { paymentStatus: 'claimed', amount: 360 });
  await dn('dn-retry', { amount: 270 }); await dn('dn-drop', { amount: 90, uid: uid.lior, name: 'ליאור דהן' });
  await put('tabs/tb-1', { eventId: 'ev-winter', eventTitle: 'פסטיבל החורף', guestUid: uid.michal, guestName: 'מיכל בר', guestPhone: '', items: [], total: 64, status: 'paid', paidAt: new Date(Date.now() - 9 * D * 60_000), createdBy: A('raz'), createdAt: ago(9 * D), updatedAt: ago(9 * D) });
  await put('tabs/tb-2', { eventId: 'ev-winter', eventTitle: 'פסטיבל החורף', guestUid: uid.lior, guestName: 'ליאור דהן', guestPhone: '', items: [], total: 40, status: 'open', createdBy: A('raz'), createdAt: ago(D), updatedAt: ago(D) });
  await put('visits/vi-1', { uid: uid.michal, name: 'מיכל בר', phone: '0523333333', date: IL(new Date(Date.now() + 6 * 86400_000)), people: 4, type: 'סיור בחווה', note: '', status: 'new', createdAt: ago(2 * D), updatedAt: ago(D) });
  // the app's activity (permission changes, a record's history)
  const act = (id, x) => put('activity/' + id, { kind: 'task', refId: 't-edit', action: 'created', text: 'לצבוע את הגדר', by: A('dana'), at: ago(2 * D), subjectUid: '', eventId: '', ...x });
  await act('a-1', {}); await act('a-2', { action: 'urgent', at: ago(D) });
  for (let i = 0; i < 20; i++) await act('a-m' + i, { refId: 't-many-' + i, text: 'משימה ' + i, at: ago(i * 400) });
  await act('a-role', { kind: 'user', refId: uid.orly, action: 'role', text: 'אורלי לוי: אורח/ת ← מתנדב/ת', by: A('owner'), subjectUid: uid.orly, at: ago(20 * D) });
  // the send queue
  const mail = (id, x) => put('email_outbox/' + id, { kind: 'donation', col: 'donations', refId: 'dn-retry', uid: uid.michal, status: 'failed', attempts: 1, createdAt: ago(3 * H), updatedAt: ago(2 * H), nextAt: null, firstAttemptAt: ago(2 * H), ...x });
  await mail('donation_dn-retry', { reason: 'unavailable', error: '503 service unavailable', provider: 'brevo' });
  await mail('donation_dn-drop', { refId: 'dn-drop', uid: uid.lior, reason: 'rejected', error: '400 invalid_parameter email is not valid', provider: 'brevo' });
  await mail('order_or-tk-1', { kind: 'order', col: 'tickets', refId: 'or-tk-1', reason: 'expired', error: '' });
  for (let i = 0; i < 12; i++) await mail('donation_dn-s' + i, { refId: 'dn-ok', status: 'sent', to: 'michal.walk@example.com', amount: 180, messageId: `<m-${i}@mock>`, provider: 'brevo', sentAt: ago(i * 90 + 5), updatedAt: ago(i * 90 + 5) });
  await put('push_jobs/pj-wait', { id: 'pj-wait', kind: 'task', title: 'משימה חדשה', body: 'לבדוק את המשאבה', to: [uid.yoav], createdBy: A('dana'), createdAt: ago(8 * H), sentAt: null, attempts: 0 });
  for (let i = 0; i < 8; i++) await put('push_jobs/pj-s' + i, { id: 'pj-s' + i, kind: i ? 'task' : 'broadcast', title: 'התראה ' + i, body: 'x', to: i ? [uid.yoav] : [uid.yoav, uid.orly], createdBy: A('dana'), createdAt: ago(i * 70 + 9), sentAt: ago(i * 70 + 8), outcome: 'sent', attempts: 1 });
  // the assistant log and failures
  for (let i = 0; i < 40; i++) await put('api_log/log-' + i, { id: 'log-' + i, at: ago(i * 190 + 30), credential: 'cred-gone', keyLabel: 'אינסטינקט ישן', actor: { id: 'user:' + uid.dana, role: 'manager', uid: uid.dana, name: 'דנה אברהם' }, kind: i % 4 ? 'read' : 'write', op: i % 4 ? 'tasks.list' : 'tasks.create', opHe: i % 4 ? 'רשימת משימות' : 'הוספת משימה', verb: i % 4 ? 'קרא' : 'הוסיף', ok: i !== 3 && i !== 8, code: i === 3 || i === 8 ? 'FORBIDDEN' : '', message: i === 3 || i === 8 ? 'the key may not do this' : '', status: i === 3 || i === 8 ? 403 : 200, ms: 90 + i * 13, path: '/v1/tasks', body: i % 4 ? '' : JSON.stringify({ title: 'משימה מהאינסטינקט' }), result: '{}' });
  await put('api_failures/f-1', { at: ago(5 * H), code: 'UPSTREAM_ERROR', path: '/v1/tasks', status: 502, requestId: 'req_x' });
  // visits: some days of the week, one half a year back
  const day = (d, k) => put('site_stats/' + IL(new Date(Date.now() - d * 86400_000)), { hits: 3 * k, site: { views: k, visitors: k, returning: 1, page: { home: k }, section: { events: 2 }, click: { whatsapp: 1 }, source: { direct: k }, device: { mobile: k }, depth: { d50: 1 }, time: { t30: 1 }, hour: { h09: k } }, app: { opens: k, visitors: 2, returning: 1, screen: { tasks: k }, device: { installed: 1 }, hour: { h20: k }, role: { staff: 1 } } });
  for (const d of [0, 1, 2, 3, 5, 8, 20]) await day(d, 10 + d);
  await day(200, 77);
  return uid;
}
