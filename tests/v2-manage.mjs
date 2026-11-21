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
assert.deepEqual(c.donationTotals(ds, today), { month: 878, year: 4478, toApprove: 1, needReceipt: 2 });

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
assert.deepEqual(c.inviteRolesFor(false), ['staff']);
assert.deepEqual(c.inviteRolesFor(true), ['staff', 'manager', 'owner']);
assert.equal(c.emailOk('name@gmail.com'), true);
assert.equal(c.emailOk('name@gmail'), false);
assert.equal(c.isFemale('מיכל ברק'), true);
assert.equal(c.isFemale('משה כהן'), false);
assert.equal(c.isFemale('יהודה לוי'), false);
assert.equal(c.gw('נועה שחר', 'שינה', 'שינתה'), 'שינתה');
assert.deepEqual(c.letterGroups([{ displayName: 'בני' }, { displayName: 'אורלי' }, { displayName: 'אליה' }]).map(([l, xs]) => [l, xs.length]), [['א', 2], ['ב', 1]]);
assert.equal(c.personMatches({ displayName: 'דוד כהן', email: 'd@x.com', phone: '052-000-0130', customerNumber: 130 }, '0130'), true);

// ---- activity lines (N14) ----
const team = new Set(['demo-u-beni', 'demo-u-noa', 'demo-u-dana']);
const line = (kind, action, text, uid, name) => c.activityLine({ kind, action, text, by: { uid, name } }, team);
assert.deepEqual(line('ticket', 'paid', '150 ₪ · רוני לוי\nפסטיבל הסתיו · 3 כרטיסים', 'demo-u-beni', 'בני גוטמן'), { title: 'בני אישר תשלום: 150 ₪ · רוני לוי', meta: 'פסטיבל הסתיו · 3 כרטיסים' });
assert.deepEqual(line('donation', 'claimed', '180 ₪ · תרומה · לזכר יוסף ברק', 'demo-u-michal', 'מיכל ברק'), { title: 'מיכל ברק סימנה שהעבירה 180 ₪', meta: 'תרומה · לזכר יוסף ברק' });
assert.deepEqual(line('shopping', 'created', 'חלב 3% · דחוף · סופר', 'demo-u-dana', 'דנה אברהם'), { title: 'דנה הוסיפה לקניות: חלב 3%', meta: 'דחוף · סופר' });
assert.deepEqual(line('user', 'role', 'עומר לוי: מנהל/ת ← מתנדב', 'demo-u-noa', 'נועה שחר'), { title: 'נועה שינתה תפקיד: עומר לוי, מתנדב', meta: 'אנשים' });
assert.deepEqual(line('visit', 'requested', 'שישי 27.11 · 8 אנשים', 'demo-u-ester', 'אסתר כהן'), { title: 'אסתר כהן ביקשה ביקור', meta: 'שישי 27.11 · 8 אנשים' });
assert.equal(c.activityGroup('donation'), 'money');
assert.equal(c.activityGroup('visit'), 'people');
assert.equal(c.activityGroup('shopping'), 'tasks');

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

console.log('PASS: v2 manage helpers (periods, donations, debts, reports, inbox, visits, roles, activity lines, settings)');
