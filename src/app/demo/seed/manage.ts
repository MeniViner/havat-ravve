// Demo seed slice for the "manage" area (M1-M10, N1-N7, N13-N14, G1-G5).
// Brings the core demo data in line with the designed manage screens: visit requests, donations (month 1,220 / year 8,400),
// the inbox items, settings extras, a pending manager invite, today's activity feed and this month's task totals for reports.
import type { Row, Slice } from './types';
import { put, patch, drop } from './types';

const key = (d: number) => new Date(Date.UTC(2026, 10, 19 + d)).toISOString().slice(0, 10);
const at = (d: number, hhmm = '12:00') => new Date(`${key(d)}T${hhmm}:00+02:00`).toISOString();
const ago = (hours: number) => new Date(new Date('2026-11-19T10:30:00+02:00').getTime() - hours * 3600_000).toISOString();
const A = {
  beni: { uid: 'demo-u-beni', name: 'בני גוטמן' }, noa: { uid: 'demo-u-noa', name: 'נועה שחר' }, dana: { uid: 'demo-u-dana', name: 'דנה אברהם' },
  yoav: { uid: 'demo-u-yoav', name: 'יואב פרץ' }, eliya: { uid: 'demo-u-eliya', name: 'אליה כהן' },
};
const MONTH_START = '2026-11-01';
/** Tasks done this month per person, as the M10 design shows them (53 in all, 2.8 a day). */
const DONE_TARGET: Record<string, number> = { 'demo-u-yoav': 28, 'demo-u-noa': 18, 'demo-u-dana': 6, 'demo-u-eliya': 1 };
const TASK_NAMES = ['האכלת העיזים', 'השקיית העציצים', 'ניקוי הלול', 'פתיחת השער ובדיקת הברזים', 'החלפת מים לסוסים', 'איסוף ביצים', 'סידור המחסן', 'גיזום בפינת החי'];

const slice: Slice = (seed, scenario) => {
  // ---- N1/N2 visits: approved list as designed; the new request keeps its place ----
  patch(seed, 'visits', 'demo-vi-cohen', { managerNote: 'נפגשים בשער ב־10:00' });
  patch(seed, 'visits', 'demo-vi-kindergarten', { name: 'בית ספר אורנים', people: 30, date: key(5), type: 'מפגש קבוצתי', managerNote: '09:30 · להכין את פינת החי', note: 'שכבת ד׳, 30 ילדים ו־3 מורות.' });
  patch(seed, 'visits', 'demo-vi-photo', { name: 'קבוצת גמלאים', people: 15, date: key(7), type: 'סיור בחווה', managerNote: '10:00 · בלי מדרגות', note: 'קבוצה מהמתנ"ס, חלקם עם מקלות הליכה.' });
  patch(seed, 'visits', 'demo-vi-rachel', { name: 'משפחת לוי', people: 5, date: key(14), type: 'אירוע פרטי', managerNote: '16:00', note: 'יום הולדת לסבתא, עוגה משלנו.' });
  patch(seed, 'visits', 'demo-vi-levi', { name: 'משפחת אזולאי' });
  patch(seed, 'calendar', 'visit_demo-vi-kindergarten', { title: 'ביקור: בית ספר אורנים · 30', date: key(5), time: '09:30' });
  patch(seed, 'calendar', 'visit_demo-vi-photo', { title: 'ביקור: קבוצת גמלאים · 15', date: key(7), time: '10:00' });
  patch(seed, 'calendar', 'visit_demo-vi-rachel', { title: 'אירוע פרטי: משפחת לוי · 5', date: key(14), time: '16:00' });
  // N2 "באותו יום ביומן" on Friday 27.11: Eliya's shift is demo-c-6 and Noa's festival prep is demo-c-5 (moved there by the farm slice);
  // demo-c-7 repeated Eliya's day without hours, so it goes.
  drop(seed, 'calendar', ['demo-c-7']);

  // ---- N3/N4 donations: this month 1,220 paid, the year 8,400, three waiting for a receipt ----
  patch(seed, 'donations', 'demo-d-michal', { createdAt: at(0, '09:40'), updatedAt: at(0, '09:40'), note: 'תודה על המקום הזה. אבא אהב לבוא לכאן.', method: 'bit' });
  patch(seed, 'donations', 'demo-d-noam', { createdAt: at(-1, '12:00'), updatedAt: at(-1, '15:00'), receiptSent: true });
  // Q4/Q9: David's donation is "בלי קבלה"
  patch(seed, 'donations', 'demo-d-david', { createdAt: at(-7, '12:00'), updatedAt: at(-7, '12:00'), receiptWanted: false, receiptName: '', receiptSent: false });
  drop(seed, 'email_outbox', ['donation_demo-d-david']);
  patch(seed, 'donations', 'demo-d-orly', { amount: 500, label: 'סכום חופשי', createdAt: at(-10, '14:00'), updatedAt: at(-10, '14:00'), receiptWanted: true, receiptName: 'אורלי לוי' });
  patch(seed, 'donations', 'demo-d-shirak', { amount: 162, createdAt: at(-10, '09:00'), updatedAt: at(-10, '09:00') });
  patch(seed, 'donations', 'demo-d-anon', { createdAt: at(-30, '12:00'), updatedAt: at(-30, '12:00') });
  const hist = (id: string, uid: string, name: string, amount: number, label: string, d: number): Row => ({
    id, uid, name, phone: '', amount, label, note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'paid', createdAt: at(d), updatedAt: at(d),
  });
  // Q4 chip, both forms (needs-design decision 5): one waiting on a regular day ("לאישור · 180 ₪"); after the festival Ester
  // marked a second donation as sent, so the chip reads "לאישור · 2 · 360 ₪".
  if (scenario === 'afterEvent') put(seed, 'donations', [{
    id: 'demo-d-ester-fest', uid: 'demo-u-ester', name: 'אסתר כהן', phone: '050-000-0310', amount: 180, label: 'עשר פעמים חי', note: '', memorial: '',
    receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'claimed', createdAt: at(9, '20:40'), updatedAt: at(9, '20:40'),
  }]);
  put(seed, 'donations', [
    hist('demo-d-h-mar', 'demo-u-roni', 'רוני לוי', 3600, 'סכום חופשי', -250),
    hist('demo-d-h-jun', 'demo-u-noam', 'נועם אדרי', 1800, 'סכום חופשי', -160),
    hist('demo-d-h-aug', 'demo-u-rachel', 'רחל שטרן', 500, 'סכום חופשי', -100),
    hist('demo-d-h-feb', 'demo-u-david', 'דוד כהן', 280, 'סכום חופשי', -280),
  ]);

  // ---- M2 inbox wording ----
  patch(seed, 'notifications', 'demo-n-contact', { text: 'לקראת פסטיבל הסתיו' });
  patch(seed, 'notifications', 'demo-n-tab', { createdAt: ago(6) });

  // ---- Q27/Q19: no pending e-mail invite; the farm's own address is not a person. Q27 shows two waiting (omer.levi2 by e-mail,
  // the phone link below), Q19 "2 בעלים · 3 מנהלים" ----
  drop(seed, 'role_invites', ['farm.ravve@gmail.com']);
  // ---- Q27: a volunteer added ahead by phone yesterday; the one-time WhatsApp link is still open (team_links/{code}) ----
  put(seed, 'team_links', [
    { id: 't-demo2k7q9mfx4r', code: 't-demo2k7q9mfx4r', role: 'staff', name: '', phone: '054-000-0421', fem: true, active: true, usedBy: null, usedAt: null,
      createdBy: A.beni, createdAt: ago(26), expiresMs: new Date(ago(26)).getTime() + 14 * 86400_000 },
  ]);

  // ---- N6/N7/G1/G4 settings (new keys are optional extras, see docs/redesign-data/manage.md) ----
  const s = seed.documents['settings/app'] as Row & { payment: Row; contact: Row; templates: Row };
  seed.documents['settings/app'] = {
    ...s,
    payment: { ...s.payment, paybox: 'payboxapp.page.link/ravve' },
    contact: { ...s.contact, whatsapp: '050-000-0002' },
    contactMore: { email: 'farm.ravve@gmail.com', address: 'חוות רווה, ליד טנא עומרים', inquiries: true },
    donationOptions: { custom: true, memorial: true, receipt: true },
    templates: {
      ...s.templates,
      visitApproved: 'שלום [שם], הביקור שלכם בחוות רווה ב־[תאריך] מאושר. [הערה] נתראה!',
      donationThanks: 'שלום [שם], תודה מכל הלב על התרומה של [סכום] לחווה.',
      paymentConfirmation: 'שלום [שם], קיבלנו [סכום]. תודה מכל הלב. חוות רווה',
    },
  };

  // ---- N14 today's feed ----
  patch(seed, 'activity', 'demo-a-3', { at: at(0, '09:40'), text: '180 ₪ · תרומה · לזכר יוסף ברק' });
  patch(seed, 'activity', 'demo-a-4', { at: at(0, '09:39'), text: '180 ₪ · תרומה · לזכר יוסף ברק' });
  patch(seed, 'activity', 'demo-a-5', { at: ago(0.7), text: 'שישי 27.11 · 8 אנשים' });
  const act = (id: string, kind: string, refId: string, action: string, text: string, by: { uid: string; name: string }, atIso: string, subjectUid = '', eventId = ''): Row =>
    ({ id, kind, refId, action, text, by, at: atIso, subjectUid, eventId });
  put(seed, 'activity', [
    act('demo-a-m-paid', 'ticket', 'demo-o-manage-roni', 'paid', '150 ₪ · רוני לוי\nפסטיבל הסתיו · 3 כרטיסים', A.beni, at(0, '10:05'), 'demo-u-roni'),
    // Dana's 09:12 milk row comes from the farm slice (demo-a-farm-milk).
    act('demo-a-m-role', 'user', 'demo-u-omer', 'role', 'עומר לוי: מנהל/ת ← מתנדב', A.noa, at(0, '08:55'), 'demo-u-omer'),
    act('demo-a-m-shade', 'task', 'demo-t-shade', 'done', 'רשתות צל · פינת החי · עם תמונה', A.yoav, at(0, '08:30')),
  ]);

  // ---- M10 reports: top up this month's done tasks to the designed totals ----
  const rows = (seed.collections.activity || []) as Row[];
  const latest = new Map<string, Row>();
  for (const r of rows) {
    if ((r.kind !== 'task' && r.kind !== 'task_private') || (r.action !== 'done' && r.action !== 'undone')) continue;
    const day = String(r.at).slice(0, 10);
    if (day < MONTH_START || day > key(0)) continue;
    const prev = latest.get(String(r.refId));
    if (!prev || String(prev.at) < String(r.at)) latest.set(String(r.refId), r);
  }
  const have: Record<string, number> = {};
  for (const r of latest.values()) if (r.action === 'done') { const uid = (r.by as { uid: string }).uid; have[uid] = (have[uid] || 0) + 1; }
  const extra: Row[] = [];
  for (const [uid, target] of Object.entries(DONE_TARGET)) {
    const by = Object.values(A).find((a) => a.uid === uid)!;
    for (let i = 0; i < target - (have[uid] || 0); i++) {
      const d = -1 - (i % 17); // 18.11 back to 2.11
      const hh = String(7 + (i % 9)).padStart(2, '0');
      extra.push(act(`demo-a-m-rep-${uid.slice(7)}-${i}`, 'task', `demo-rep-${uid.slice(7)}-${i}`, 'done', TASK_NAMES[i % TASK_NAMES.length], by, at(d, `${hh}:${String((i * 7) % 60).padStart(2, '0')}`)));
    }
  }
  put(seed, 'activity', extra);

  // ---- owners' assistant log (/manage/instinct): a morning of the owner's assistant key ----
  const KEY = { credential: 'cred-assistant', keyLabel: 'האינסטינקט של בני' };
  const actor = { id: 'user:demo-u-beni', role: 'owner', uid: 'demo-u-beni', name: A.beni.name };
  const log = (n: number, hhmm: string, op: string, opHe: string, verb: string, kind: 'read' | 'write', extra: Row = {}): Row => ({
    id: `demo-log-${n}`, at: at(0, hhmm), ...KEY, actor, kind, op, opHe, verb, method: kind === 'read' ? 'GET' : 'POST',
    path: kind === 'read' ? '/v1/overview' : `/v1/actions/${op}`, query: '', body: '', result: '', count: null, refs: [],
    status: 200, ok: true, code: '', message: '', replayed: false, idempotencyKey: '', ms: 180, ...extra,
  });
  put(seed, 'api_log', [
    log(1, '07:02', 'farm.overview', 'תמונת מצב של החווה', 'קרא', 'read', { count: null }),
    // Q20: the morning as designed (subjects are real demo rows: demo-t-tap, demo-s-milk, demo-t-toolbox, demo-s-coffee)
    log(2, '07:03', 'tasks.create', 'יצירת משימה', 'יצר', 'write', { status: 201, body: JSON.stringify({ title: 'לתקן את הברז ליד החממה', assignee: 'demo-u-yoav', dueDate: key(0) }), result: JSON.stringify({ taskId: 'demo-t-tap', verified: true }), refs: [{ col: 'tasks', id: 'demo-t-tap' }] }),
    log(3, '07:05', 'shopping.add', 'הוספת פריט לרשימת הקניות', 'יצר', 'write', { status: 201, body: JSON.stringify({ title: 'חלב 3%', qty: '6 קרטונים', category: 'super' }), result: JSON.stringify({ itemId: 'demo-s-milk' }), refs: [{ col: 'shopping', id: 'demo-s-milk' }] }),
    log(4, '07:40', 'broadcasts.send', 'הודעה לצוות', 'שלח', 'write', { body: JSON.stringify({ text: 'מחר מתחילים ב־15:30', audience: 'all' }) }),
    log(5, '08:10', 'tasks.edit', 'עריכת משימה', 'ערך', 'write', { status: 409, ok: false, code: 'STALE_WRITE', message: 'הרשומה השתנתה מאז שנקראה: the record changed since it was read', body: JSON.stringify({ taskId: 'demo-t-toolbox', note: 'המקדח במדף העליון' }) }),
    log(6, '08:12', 'tasks.edit', 'עריכת משימה', 'ערך', 'write', { body: JSON.stringify({ taskId: 'demo-t-toolbox', note: 'המקדח במדף העליון' }), result: JSON.stringify({ taskId: 'demo-t-toolbox', title: 'לסדר את ארגז הכלים' }), refs: [{ col: 'tasks', id: 'demo-t-toolbox' }] }),
    log(7, '09:15', 'shopping.delete', 'מחיקת פריט מרשימת הקניות', 'מחק', 'write', { body: JSON.stringify({ itemId: 'demo-s-coffee-old' }), result: JSON.stringify({ deleted: { id: 'demo-s-coffee-old', title: 'קפה שחור', category: 'super' } }), refs: [{ col: 'shopping', id: 'demo-s-coffee-old' }] }),
  ]);
};
export default slice;
