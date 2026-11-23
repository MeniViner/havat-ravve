// Unit tests of the manage area's pure data helpers (src/app/v2/screens/manage/calc.ts).
// Run: node tests/v2-manage.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';

await build({ entryPoints: ['src/app/v2/screens/manage/calc.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.build/v2-manage-test.mjs', logLevel: 'error' });
const c = await import('../.build/v2-manage-test.mjs?' + Date.now());

const today = '2026-11-19';
const iso = (key, hh = '12:00') => new Date(`${key}T${hh}:00+02:00`).toISOString();
const don = (id, amount, createdAt, o = {}) => ({ id, uid: 'u', name: 'x', phone: '', amount, label: '', note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'paid', createdAt, updatedAt: createdAt, ...o });

// ---- periods ----
assert.equal(c.monthStart(today), '2026-11-01');
assert.equal(c.yearStart(today), '2026-01-01');
assert.equal(c.addDaysKey('2026-11-30', 1), '2026-12-01');
assert.equal(c.periodDays(today, '2026-11-01'), 19);
assert.equal(c.periodStart(today, '3m'), '2026-08-21'); // 90 days back

// ---- donations (N3, M1) ----
const ds = [
  don('a', 180, iso(today, '09:40'), { paymentStatus: 'claimed', receiptWanted: true }),
  don('b', 360, iso('2026-11-18'), { receiptWanted: true, receiptSent: true }),
  don('c', 500, iso('2026-11-09'), { receiptWanted: true }),
  don('d', 18, iso('2026-11-16'), { paymentStatus: 'paid_onsite' }),
  don('e', 3600, iso('2026-03-10')),
  don('f', 999, iso('2025-12-31')),
  don('g', 50, iso('2026-11-10'), { paymentStatus: 'cancelled', receiptWanted: true }),
];
assert.deepEqual(c.donationTotals(ds, today), { month: 878, year: 4478, toApprove: 1, needReceipt: 2, pending: 180 });
// N3 chips
assert.deepEqual(c.donationsIn(ds, 'month', today).map((d) => d.id), ['a', 'b', 'c', 'd', 'g']);
assert.deepEqual(c.donationsIn(ds, 'approve', today).map((d) => d.id), ['a']);
assert.deepEqual(c.donationsIn(ds, 'receipt', today).map((d) => d.id), ['a', 'c']);
assert.deepEqual(c.donationsIn([...ds, don('m', 100, iso('2025-05-01'), { memorial: 'סבא' })], 'memorial', today).map((d) => d.id), ['m']);
assert.deepEqual(c.donationsIn(ds, 'year', today).map((d) => d.id), ['a', 'b', 'c', 'd', 'e', 'g']);
assert.equal(c.donationsIn(ds, 'all', today).length, 7);
// an old unpaid donation still shows under "this month"
assert.deepEqual(c.donationsIn([don('o', 70, iso('2026-02-01'), { paymentStatus: 'pending' })], 'month', today).map((d) => d.id), ['o']);

// ---- reports extras ----
const hh = (s) => s.slice(11, 16);
assert.deepEqual(c.recurringOnTime([{ templateId: 't1', doneAt: '2026-11-19T07:30:00.000Z' }, { templateId: 't1', doneAt: '2026-11-19T09:30:00.000Z' }, { templateId: 't2', doneAt: '2026-11-19T20:00:00.000Z' }, { doneAt: 'x' }],
  [{ id: 't1', time: '08:00' }, { id: 't2', time: '' }], hh), { total: 3, onTime: 2, pct: 67 });
assert.deepEqual(c.recurringOnTime([], [], hh), { total: 0, onTime: 0, pct: null });
{ // record30: the last 30 days of a recurring task (2026-11-22 is a Sunday)
  const fn = (n) => n.split(' ')[0];
  const tasks = [
    { dateKey: '2026-11-22', done: true, doneBy: { name: 'דנה כהן' } },
    { dateKey: '2026-11-21', done: true, doneBy: { name: 'יוסי לוי' } },
    { dateKey: '2026-11-15', done: true, doneBy: { name: 'דנה כהן' } },
    { dateKey: '2026-11-20', done: false, doneBy: null },
    { dateKey: '2026-10-01', done: true, doneBy: { name: 'ישן' } }, // outside the 30 days
  ];
  const every = c.record30([], tasks, '2026-11-22', fn);
  assert.equal(every.grid.length, 30);
  assert.equal(every.grid[0].k, '2026-10-24');
  assert.equal(every.grid[29].k, '2026-11-22');
  assert.equal(every.expected, 30, 'no days = every day, Saturday included (store.materializeToday)');
  assert.equal(every.done, 3);
  assert.deepEqual(every.who, [['דנה', 2], ['יוסי', 1]]);
  assert.deepEqual(every.grid[29], { k: '2026-11-22', due: true, done: true, by: 'דנה כהן' });
  assert.deepEqual(every.grid[27], { k: '2026-11-20', due: true, done: false, by: '' });
  const sundays = c.record30([0], tasks, '2026-11-22', fn);
  assert.equal(sundays.expected, 5);
  assert.equal(sundays.grid.find((g) => g.k === '2026-11-21').due, false);
  assert.equal(sundays.done, 3, 'a done task on a day that is no longer due still counts, capped at the due days');
  assert.equal(c.record30([6], [], '2026-11-22', fn).expected, 5);
  assert.equal(c.record30([1], tasks, '2026-11-22', fn).done, 3);
  assert.deepEqual(c.record30([], [], '2026-11-22', fn).who, []);
}
assert.deepEqual(c.peopleStats([{ createdAt: iso('2026-11-02'), status: 'active' }, { createdAt: iso('2026-01-02'), status: 'blocked' }],
  [{ createdAt: iso('2026-11-03'), status: 'approved' }, { createdAt: iso('2026-11-04'), status: 'new' }, { createdAt: iso('2026-02-04'), status: 'approved' }], '2026-11-01'),
  { newPeople: 1, visitsApproved: 1, visitsRequested: 2, blocked: 1 });
assert.deepEqual(c.heardFrom([{ fields: { source: 'חברים' } }, { fields: { source: 'חברים' } }, {}, { fields: { source: 'פייסבוק' } }]),
  [{ label: 'חברים', value: 2 }, { label: 'לא ענו', value: 1 }, { label: 'פייסבוק', value: 1 }]);

// ---- debts (M10, M8 "עם חוב") ----
const t = (ownerUid, price, paymentStatus, status = 'valid') => ({ ownerUid, price, paymentStatus, status });
const tickets = [t('u1', 50, 'pending'), t('u1', 50, 'claimed'), t('u2', 70, 'paid'), t('u3', 40, 'pending', 'cancelled'), t('u4', 0, 'pending')];
const tabs = [{ guestUid: 'u5', status: 'open', total: 46 }, { guestUid: 'u1', status: 'claimed', total: 10 }, { guestUid: 'u6', status: 'paid', total: 30 }, { guestUid: '', status: 'open', total: 12 }];
assert.deepEqual(c.openDebts(tickets, tabs), { total: 156, people: 2 });
assert.equal(c.debtsByPerson(tickets, tabs).get('u1'), 110);

// ---- reports (M10) ----
const by = (uid, name) => ({ uid, name });
const act = (refId, action, who, at, kind = 'task') => ({ id: refId + at, kind, refId, action, text: '', by: who, at, subjectUid: '', eventId: '' });
const yoav = by('y', 'יואב פרץ'), noa = by('n', 'נועה שחר');
const activity = [
  act('t1', 'done', yoav, iso('2026-11-02')),
  act('t2', 'done', yoav, iso('2026-11-03')),
  act('t3', 'done', noa, iso('2026-11-04')),
  act('t3', 'undone', noa, iso('2026-11-04', '13:00')), // undone after: does not count
  act('t4', 'done', noa, iso('2026-10-30')), // last month
  act('t5', 'done', yoav, iso('2026-11-05'), 'task_private'),
  act('s1', 'bought', noa, iso('2026-11-05'), 'shopping'),
];
const r = c.buildReport({ activity, donations: ds, tickets: [], openTickets: tickets, openTabs: tabs, today, period: 'month' });
assert.equal(r.tasksDone, 3);
assert.equal(r.perDay, 0.2);
assert.equal(r.donations, 878);
assert.deepEqual(r.byPerson, [{ label: 'יואב פרץ', value: 3 }]);
assert.deepEqual(r.debts, { total: 156, people: 2 });

// ---- inbox (M1, M2) ----
assert.equal(c.inboxSummary([{ type: 'donation' }, { type: 'tab' }, { type: 'visit' }, { type: 'contact' }]), '2 תשלומים · ביקור · פנייה');
assert.equal(c.inboxGroup({ type: 'claim' }), 'payments');
assert.equal(c.inboxSummary([]), '');

// ---- visits (N1, N2) ----
assert.equal(c.timeFromNote('נפגשים בשער ב־9:30'), '09:30');
assert.equal(c.timeFromNote('בלי שעה'), '');
const v = (id, status, date, createdAt = iso('2026-11-10')) => ({ id, status, date, createdAt, updatedAt: createdAt });
const b = c.visitBuckets([v('n', 'new', '2026-11-27'), v('a2', 'approved', '2026-12-03'), v('a1', 'approved', '2026-11-24'), v('p', 'approved', '2026-11-09'), v('r', 'rejected', '2026-11-17'), v('x', 'cancelled', '2026-11-20')], today);
assert.deepEqual(b.fresh.map((x) => x.id), ['n']);
assert.deepEqual(b.approved.map((x) => x.id), ['a1', 'a2']);
assert.deepEqual(b.past.map((x) => x.id), ['p']);
assert.deepEqual(b.rejected.map((x) => x.id).sort(), ['r', 'x']);

// ---- people and roles (M9, N13, G5): must match firestore.rules ----
const owner = { owner: true, uid: 'o' }, manager = { owner: false, uid: 'm' };
assert.deepEqual(c.allowedRoles(owner, { uid: 'g', role: 'guest' }), ['guest', 'staff', 'manager', 'owner']);
assert.deepEqual(c.allowedRoles(manager, { uid: 'g', role: 'guest' }), ['guest', 'staff']);
assert.deepEqual(c.allowedRoles(manager, { uid: 'm2', role: 'manager' }), []);
assert.deepEqual(c.allowedRoles(owner, { uid: 'o', role: 'owner' }), []);
assert.deepEqual(c.allowedRoles(owner, { uid: 'v', role: 'vendor' }), []);
assert.equal(c.canBlock(manager, { uid: 'g', role: 'guest' }), true);
assert.equal(c.canBlock(manager, { uid: 's', role: 'staff' }), false);
assert.equal(c.canBlock(owner, { uid: 'o', role: 'owner' }), false);
assert.deepEqual(c.inviteRolesFor(false), ['guest', 'staff']);
assert.deepEqual(c.inviteRolesFor(true), ['guest', 'staff', 'manager', 'owner']);
assert.equal(c.emailOk('name@gmail.com'), true);
assert.equal(c.emailOk('name@gmail'), false);
assert.equal(c.isFemale('מיכל ברק'), true);
assert.equal(c.isFemale('משה כהן'), false);
assert.equal(c.isFemale('יהודה לוי'), false);
assert.equal(c.gw('נועה שחר', 'שינה', 'שינתה'), 'שינתה');
assert.deepEqual(c.letterGroups([{ displayName: 'בני' }, { displayName: 'אורלי' }, { displayName: 'אליה' }]).map(([l, xs]) => [l, xs.length]), [['א', 2], ['ב', 1]]);
assert.equal(c.personMatches({ displayName: 'דוד כהן', email: 'd@x.com', phone: '052-000-0130', customerNumber: 130 }, '0130'), true);
// registration answers are searched too
assert.equal(c.personMatches({ displayName: 'דוד כהן', email: 'd@x.com', phone: '', customerNumber: 130, fields: { city: 'רחובות' } }, 'רחוב'), true);
assert.equal(c.personMatches({ displayName: 'דוד כהן', email: 'd@x.com', phone: '', customerNumber: 130, fields: { city: 'רחובות' } }, 'חיפה'), false);

// ---- activity lines (N14) ----
const team = new Set(['demo-u-beni', 'demo-u-noa', 'demo-u-dana']);
const line = (kind, action, text, uid, name) => c.activityLine({ kind, action, text, by: { uid, name } }, team);
assert.deepEqual(line('ticket', 'paid', '150 ₪ · רוני לוי\nפסטיבל הסתיו · 3 כרטיסים', 'demo-u-beni', 'בני גוטמן'), { title: 'בני אישר תשלום: 150 ₪ · רוני לוי', meta: 'פסטיבל הסתיו · 3 כרטיסים' });
assert.deepEqual(line('donation', 'claimed', '180 ₪ · תרומה · לזכר יוסף ברק', 'demo-u-michal', 'מיכל ברק'), { title: 'מיכל ברק סימנה שהעבירה 180 ₪', meta: 'תרומה · לזכר יוסף ברק' });
assert.deepEqual(line('shopping', 'created', 'חלב 3% · דחוף · סופר', 'demo-u-dana', 'דנה אברהם'), { title: 'דנה הוסיפה לקניות: חלב 3%', meta: 'דחוף · סופר' });
assert.deepEqual(line('user', 'role', 'עומר לוי: מנהל/ת ← מתנדב', 'demo-u-noa', 'נועה שחר'), { title: 'נועה שינתה תפקיד: עומר לוי, מתנדב', meta: 'אנשים' });
assert.deepEqual(line('visit', 'requested', 'שישי 27.11 · 8 אנשים', 'demo-u-ester', 'אסתר כהן'), { title: 'אסתר כהן ביקשה ביקור', meta: 'שישי 27.11 · 8 אנשים' });
// every logged action reads in Hebrew (smoke round 1: "דנה assigned: ..."), older "/ה" texts lose the doubled verb
const line2 = (kind, action, text, uid, name, subjectUid) => c.activityLine({ kind, action, text, by: { uid, name }, subjectUid }, team);
assert.deepEqual(line2('task', 'assigned', 'להביא שק מלט ← יואב פרץ', 'demo-u-dana', 'דנה אברהם', 'demo-u-yoav'), { title: 'דנה העבירה: להביא שק מלט', meta: 'ליואב' });
assert.deepEqual(line2('task', 'assigned', 'להביא שק מלט ← יואב פרץ', 'demo-u-yoav', 'יואב פרץ', 'demo-u-yoav'), { title: 'יואב פרץ לקח: להביא שק מלט', meta: 'משימות' });
assert.deepEqual(line('user', 'blocked', 'מיכל בר נחסם/ה', 'demo-u-dana', 'דנה אברהם'), { title: 'דנה חסמה: מיכל בר', meta: 'אנשים' });
assert.deepEqual(line('user', 'unblocked', 'מיכל בר שוחרר/ה', 'demo-u-beni', 'בני גוטמן'), { title: 'בני שחרר חסימה: מיכל בר', meta: 'אנשים' });
assert.deepEqual(line('user', 'joined', 'נגה שמיר נרשם/ה', 'u-noga', 'נגה שמיר'), { title: 'נגה שמיר נרשמה', meta: 'אנשים' });
assert.deepEqual(line('user', 'invited', 'a@b.com הוגדר/ה מראש כמתנדב/ת', 'demo-u-dana', 'דנה אברהם'), { title: 'דנה הגדירה תפקיד: a@b.com', meta: 'מתנדב' });
assert.deepEqual(line('user', 'role', 'מיכל בר: אורח/ת ← מתנדב/ת', 'demo-u-beni', 'בני גוטמן'), { title: 'בני שינה תפקיד: מיכל בר, מתנדבת', meta: 'אנשים' });
assert.deepEqual(line('event', 'invited', 'גבינות העמק הוזמן לדוכן', 'demo-u-dana', 'דנה אברהם'), { title: 'דנה הזמינה: גבינות העמק', meta: 'אירועים' });
assert.deepEqual(line('event', 'closed', 'פסטיבל החורף נסגר', 'demo-u-dana', 'דנה אברהם'), { title: 'דנה סגרה: פסטיבל החורף', meta: 'אירועים' });
for (const a of ['assigned', 'released', 'deleted', 'unbought', 'found', 'unavailable', 'unpublished', 'closed', 'reopened', 'rejected', 'removed', 'added']) {
  assert.doesNotMatch(line('event', a, 'משהו', 'demo-u-dana', 'דנה אברהם').title + line('task', a, 'משהו', 'demo-u-dana', 'דנה אברהם').title, /[a-z]/, a);
}
assert.equal(c.activityGroup('donation'), 'money');
assert.equal(c.activityGroup('visit'), 'people');
assert.equal(c.activityGroup('shopping'), 'tasks');
// own chips for shopping and settings; tasks no longer shows shopping
assert.equal(c.inboxIn({ type: 'receipt' }, 'receipts'), true);
assert.equal(c.inboxIn({ type: 'tab' }, 'stall'), true);
assert.equal(c.inboxIn({ type: 'tab' }, 'payments'), true);
assert.equal(c.inboxIn({ type: 'order' }, 'orders'), true);
assert.equal(c.inboxIn({ type: 'claim' }, 'orders'), true);
assert.equal(c.inboxIn({ type: 'visit' }, 'orders'), false);
assert.equal(c.activityInFilter('shopping', 'shopping'), true);
assert.equal(c.activityInFilter('shopping', 'tasks'), false);
assert.equal(c.activityInFilter('task', 'tasks'), true);
assert.equal(c.activityInFilter('settings', 'settings'), true);
assert.equal(c.activityInFilter('settings', 'all'), true);
assert.equal(c.activityInFilter('donation', 'money'), true);
// one event's history chips
assert.equal(c.eventActivityIn({ kind: 'ticket', action: 'ordered' }, 'orders'), true);
assert.equal(c.eventActivityIn({ kind: 'ticket', action: 'cancelled' }, 'orders'), true);
assert.equal(c.eventActivityIn({ kind: 'ticket', action: 'claimed' }, 'payments'), true);
assert.equal(c.eventActivityIn({ kind: 'tab', action: 'paid' }, 'stall'), true);
assert.equal(c.eventActivityIn({ kind: 'event', action: 'updated' }, 'edits'), true);
assert.equal(c.eventActivityIn({ kind: 'ticket', action: 'ordered' }, 'edits'), false);

// ---- settings (N6, N7, G1-G5): stays compatible with what the guest flow reads ----
const pf = c.paymentForm({ bit: '', paybox: 'payboxapp.page.link/ravve', cash: true, note: '', bitNumber: '050-000-0000' });
assert.equal(pf.bitOn, false);
assert.equal(pf.bit, '050-000-0000'); // the number switched off earlier comes back
const pp = c.paymentPatch({ ...pf, payboxOn: false });
assert.equal(pp.bit, '');
assert.equal(pp.paybox, ''); // guest flow: '' means "not offered"
assert.equal(pp.payboxLink, 'payboxapp.page.link/ravve');
assert.equal(c.paymentPatch({ ...pf, bitOn: true }).bit, '050-000-0000');
assert.equal(c.numberOk(''), true);
assert.equal(c.numberOk('050-000-0002'), true);
assert.equal(c.numberOk('12345'), false);
assert.equal(c.numberOk('javascript:alert(1)'), false);
assert.deepEqual(c.cleanPresets([{ key: 'a', amount: '18', label: ' חי ' }, { key: 'b', amount: '', label: 'ריק' }, { key: 'c', amount: '0', label: 'אפס' }]), [{ amount: 18, label: 'חי' }]);
assert.deepEqual(c.cleanTypes([' סיור ', '', 'סיור', 'אחר']), ['סיור', 'אחר']);
assert.deepEqual(c.reorder(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
assert.deepEqual(c.templateParts('שלום [שם], תודה'), ['שלום ', { ph: 'שם' }, ', תודה']);
assert.equal(c.questionMeta({ id: 'x', label: 'x', type: 'choice', options: ['a', 'b', 'c', 'd'], required: false }), 'בחירה · 4 אפשרויות');
assert.notEqual(c.fieldId('יישוב', []), c.fieldId('יישוב', [c.fieldId('יישוב', [])]));
const lines = c.settingsLines({
  payment: { bit: '050', paybox: 'x', cash: true, note: '' }, donationPresets: [{ amount: 18, label: '' }, { amount: 180, label: '' }, { amount: 360, label: '' }],
  visitTypes: ['a', 'b', 'c', 'd'], registrationFields: [{ label: 'יישוב' }, { label: 'איך שמעתם עלינו?' }, { label: 'תאריך לידה' }], contact: { phone: '08-000-0642', whatsapp: '' }, templates: {},
}, 2, 3);
assert.equal(lines.payments, 'ביט · PayBox · מזומן בשער');
assert.equal(lines.amounts, '18 · 180 · 360 · סכום אחר');
assert.equal(lines.questions, 'יישוב, איך שמעתם, תאריך לידה');
assert.equal(lines.managers, '2 בעלים · 3 מנהלים');
assert.equal(lines.typesQuestions, '4 סוגים · 3 שאלות');

// ---- Q20 Instinct log in Hebrew ----
const CODES = ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'STALE_WRITE', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'UPSTREAM_ERROR', 'OUTCOME_UNKNOWN', 'PRODUCTION_LOCKED', 'INTERNAL'];
for (const k of CODES) assert.ok(c.INSTINCT_REASON[k] && !/[A-Z_]{3,}/.test(c.INSTINCT_REASON[k]), `Hebrew reason for ${k}`);
const log = (o) => ({ op: 'tasks.create', opHe: 'יצירת משימה חדשה, אופציונלי עם שיוך', verb: 'יצר', kind: 'write', ok: true, code: '', count: null, body: '{}', result: '{}', replayed: false, refs: [], ...o });
assert.deepEqual(c.instinctLine(log({ body: JSON.stringify({ title: 'להאכיל את העזים' }) })), { title: 'יצר משימה', meta: 'להאכיל את העזים', failed: false });
assert.deepEqual(c.instinctLine(log({ op: 'tasks.edit', verb: 'ערך', ok: false, code: 'STALE_WRITE' })), { title: 'ניסה לערוך משימה', meta: 'המשימה השתנתה בינתיים, לא נשמר', failed: true });
assert.deepEqual(c.instinctLine(log({ op: 'shopping.add', verb: 'יצר', ok: false, code: 'OUTCOME_UNKNOWN' })), { title: 'ניסה ליצור פריט בקניות', meta: 'לא ברור אם זה נשמר', failed: true });
assert.equal(c.instinctLine(log({ op: 'shopping.add', body: JSON.stringify({ text: 'קפה שחור', category: 'super' }) })).meta, 'קפה שחור · סופר');
assert.deepEqual(c.instinctLine(log({ op: 'tasks.list', opHe: 'רשימת משימות: פתוחות או כולן', verb: 'קרא', kind: 'read', count: 12 })), { title: 'קרא רשימת משימות', meta: '12 רשומות', failed: false });
assert.match(c.instinctLine(log({ replayed: true })).meta, /בקשה חוזרת/);
// a row never shows the operation key or an error code
for (const k of CODES) { const l = c.instinctLine(log({ ok: false, code: k })); assert.ok(!/[A-Za-z_]{4,}/.test(l.title + l.meta), `${k}: ${l.title} ${l.meta}`); }
assert.equal(c.instinctTarget(log({ refs: [{ col: 'tasks', id: 't1' }] })), '/tasks/t1');
assert.equal(c.instinctTarget(log({ op: 'tasks.delete', verb: 'מחק', refs: [{ col: 'tasks', id: 't1' }] })), '');
assert.equal(c.instinctTarget(log({ kind: 'read', refs: [{ col: 'tasks', id: 't1' }] })), '');

console.log('PASS: v2 manage helpers (periods, donations, debts, reports, inbox, visits, roles, activity lines, settings, Instinct log)');
