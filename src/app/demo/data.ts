// Demo data: every example that appears in the design canvas, typed with the real app types.
// Loaded only when demo mode is on (see demo/store.ts). Ids start with "demo-" so writes never touch Firestore.
import type {
  Profile, Task, Template, ShoppingItem, Place, RoleInvite, Activity, FarmEvent, Ticket, Visit, Donation, Vendor, EventVendor,
  Product, Tab, Settings, AppNotification, CalendarItem, Actor,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';

// ---------- time helpers: everything is relative to "now" so the demo never goes stale ----------
const DAY = 86400_000;
const now = new Date();
const at = (daysFromToday: number, hhmm = '12:00') => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromToday);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
const key = (daysFromToday: number) => { const d = new Date(now.getTime() + daysFromToday * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Next Saturday that is at least `minDays` away. */
const nextSat = (minDays: number) => { let d = minDays; while (new Date(now.getTime() + d * DAY).getDay() !== 6) d++; return d; };
const SAT1 = nextSat(3), SAT2 = SAT1 + 7, SAT3 = SAT1 + 28;
const FRI = (() => { let d = 8; while (new Date(now.getTime() + d * DAY).getDay() !== 5) d++; return d; })();
const THU = (() => { let d = 1; while (new Date(now.getTime() + d * DAY).getDay() !== 4) d++; return d; })();

// ---------- people ----------
const actor = (uid: string, name: string): Actor => ({ uid, name });
const person = (uid: string, n: number, displayName: string, email: string, phone: string, role: Profile['role'], created: number, extra: Partial<Profile> = {}): Profile => ({
  uid, email, displayName, phone, role, status: 'active', customerNumber: n, acceptedTermsAt: ago(created * 24), createdAt: ago(created * 24), updatedAt: ago(created * 24), ...extra,
});
export const U = {
  beni: 'demo-u-beni', eliya: 'demo-u-eliya', farm: 'demo-u-farm', noa: 'demo-u-noa', roi: 'demo-u-roi', tamar: 'demo-u-tamar',
  yoav: 'demo-u-yoav', dana: 'demo-u-dana', omer: 'demo-u-omer', shira: 'demo-u-shira', gil: 'demo-u-gil',
  roni: 'demo-u-roni', orly: 'demo-u-orly', david: 'demo-u-david', michal: 'demo-u-michal', yossi: 'demo-u-yossi', ester: 'demo-u-ester', noam: 'demo-u-noam', shirak: 'demo-u-shirak', naama: 'demo-u-naama',
};
export const A = {
  beni: actor(U.beni, 'בני גוטמן'), eliya: actor(U.eliya, 'אליה כהן'), noa: actor(U.noa, 'נועה שחר'), yoav: actor(U.yoav, 'יואב פרץ'), dana: actor(U.dana, 'דנה אברהם'),
  roni: actor(U.roni, 'רוני לוי'), david: actor(U.david, 'דוד כהן'), michal: actor(U.michal, 'מיכל ברק'), ester: actor(U.ester, 'אסתר כהן'), noam: actor(U.noam, 'נועם אדרי'), yossi: actor(U.yossi, 'יוסי מזרחי'),
};
export const profiles: Profile[] = [
  person(U.beni, 1, 'בני גוטמן', 'beni@gmail.com', '050-000-0002', 'owner', 250, { fields: { city: 'טנא עומרים' } }),
  person(U.eliya, 41, 'אליה כהן', 'eliya@gmail.com', '052-000-0001', 'owner', 248),
  person(U.noa, 7, 'נועה שחר', 'noa.sh@gmail.com', '052-000-0007', 'manager', 245, { log: [{ at: ago(245 * 24), by: A.beni, text: 'תפקיד: צוות ← מנהל/ת' }] }),
  person(U.roi, 19, 'רועי אלון', 'roi.alon@gmail.com', '052-000-0019', 'manager', 160),
  person(U.tamar, 33, 'תמר קליין', 'tamar.k@gmail.com', '054-000-0033', 'manager', 40, { log: [{ at: ago(30 * 24), by: A.beni, text: 'תפקיד: צוות ← מנהל/ת' }] }),
  person(U.yoav, 9, 'יואב פרץ', 'yoav.p@gmail.com', '050-000-0009', 'staff', 220, { fields: { city: 'אשל הנשיא' } }),
  person(U.dana, 12, 'דנה אברהם', 'dana.av@gmail.com', '052-000-0012', 'staff', 215),
  person(U.omer, 44, 'עומר לוי', 'omer.levi@gmail.com', '050-000-0044', 'staff', 20),
  person(U.shira, 51, 'שירה גולן', 'shira.g@gmail.com', '052-000-0051', 'staff', 90),
  person(U.gil, 58, 'גיל ברק', 'gil.b@gmail.com', '054-000-0058', 'staff', 70),
  person(U.roni, 88, 'רוני לוי', 'roni.levi@gmail.com', '054-000-0088', 'guest', 70, { fields: { city: 'באר שבע', source: 'פייסבוק' } }),
  person(U.orly, 87, 'אורלי לוי', 'orly.l@gmail.com', '054-000-0087', 'guest', 70),
  person(U.david, 130, 'דוד כהן', 'david.c@gmail.com', '052-000-0130', 'guest', 40, { fields: { city: 'עומר' } }),
  person(U.michal, 155, 'מיכל ברק', 'michal.b@gmail.com', '054-000-0155', 'guest', 30),
  person(U.yossi, 203, 'יוסי מזרחי', 'yossi.m@gmail.com', '053-000-0203', 'guest', 28, { status: 'blocked', notes: 'לא שילם פעמיים. חוב 80 ₪ מהפסטיבל הקודם.', log: [{ at: ago(6 * 24), by: A.beni, text: 'מצב: נחסם' }] }),
  person(U.ester, 310, 'אסתר כהן', 'ester.c@gmail.com', '050-000-0310', 'guest', 3),
  person(U.noam, 276, 'נועם אדרי', 'noam.a@gmail.com', '050-000-0276', 'guest', 12),
  person(U.shirak, 260, 'שירה כץ', 'shira.k@gmail.com', '050-000-0260', 'guest', 10),
  person(U.naama, 199, 'נעמה כהנא', 'naama.k@gmail.com', '054-000-0199', 'guest', 25),
];
export const roleInvites: RoleInvite[] = [
  { id: 'omer.levi2@gmail.com', email: 'omer.levi2@gmail.com', role: 'staff', createdBy: A.beni, createdAt: ago(3 * 24) },
  { id: 'farm.ravve@gmail.com', email: 'farm.ravve@gmail.com', role: 'owner', createdBy: A.beni, createdAt: ago(60 * 24) },
];

// ---------- places ----------
const place = (id: string, name: string, lat: number, lng: number, by: Actor, days: number): Place => ({ id, name, lat, lng, createdBy: by, createdAt: ago(days * 24) });
export const P = { gate: 'demo-p-gate', tree: 'demo-p-tree', container: 'demo-p-container', pots: 'demo-p-pots', greenhouse: 'demo-p-greenhouse', olives: 'demo-p-olives', goats: 'demo-p-goats', stall: 'demo-p-stall', storage: 'demo-p-storage' };
export const places: Place[] = [
  place(P.gate, 'ליד הכניסה', 31.2412, 34.7301, A.beni, 240),
  place(P.tree, 'העץ מאחורי הביתן', 31.2418, 34.7309, A.beni, 210),
  place(P.container, 'מאחורי המכולה', 31.2408, 34.7312, A.eliya, 205),
  place(P.pots, 'שורת העציצים הצפונית', 31.2425, 34.7298, A.beni, 240),
  place(P.greenhouse, 'החממה', 31.2421, 34.7318, A.beni, 238),
  place(P.olives, 'שורת הזיתים', 31.2402, 34.7290, A.eliya, 180),
  place(P.goats, 'דיר העיזים', 31.2415, 34.7325, A.beni, 240),
  place(P.stall, 'אזור הדוכן', 31.2410, 34.7304, A.noa, 150),
  place(P.storage, 'המחסן', 31.2406, 34.7320, A.beni, 30),
];
const loc = (id: keyof typeof P) => { const p = places.find((x) => x.id === P[id])!; return { lat: p.lat, lng: p.lng, placeId: p.id, placeName: p.name }; };

// ---------- recurring templates ----------
const tpl = (id: string, title: string, note: string, days: number[], time: string, active: boolean, managersOnly: boolean, createdDays: number): Template => ({ id, title, note, days, time, active, managersOnly, createdBy: A.beni, createdAt: ago(createdDays * 24), updatedAt: ago(createdDays * 24) });
export const T = { gate: 'demo-t-gate', goats: 'demo-t-goats', pots: 'demo-t-pots', tools: 'demo-t-tools', stall: 'demo-t-stall', irrigation: 'demo-t-irrigation', olives: 'demo-t-olives' };
export const templates: Template[] = [
  tpl(T.gate, 'פתיחת השער ובדיקת הברזים', 'לבדוק שאין נזילה בברז ליד הכניסה.', [], '07:30', true, false, 240),
  tpl(T.goats, 'האכלת העיזים', 'חצי שק תערובת + מים נקיים.', [], '08:00', true, false, 240),
  tpl(T.pots, 'השקיית העציצים בשורה הצפונית', '10 דקות לכל עציץ, לבדוק שהצינור לא סתום.', [0, 1, 2, 3, 4, 5], '10:00', true, false, 230),
  tpl(T.tools, 'סידור הכלים במכולה', '', [0, 3, 5], '', true, false, 200),
  tpl(T.stall, 'ניקוי אזור הדוכן', '', [4, 5], '', true, false, 150),
  tpl(T.irrigation, 'בדיקת מערכת ההשקיה', 'לעבור על כל הטפטפות, לרשום איפה יש סתימה.', [1], '09:00', true, true, 180),
  tpl(T.olives, 'קטיף זיתים', 'עונתי · חוזר באוקטובר', [], '', false, false, 400),
];

// ---------- tasks ----------
const task = (id: string, title: string, o: Partial<Task> = {}): Task => ({
  id, title, note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: A.beni, createdAt: ago(20), done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, updatedAt: ago(1), ...o,
});
const today = key(0);
export const tasks: Task[] = [
  task('demo-task-flag', 'להחליף את הדגל ליד הכניסה', { note: 'הדגל ליד שער הכניסה נקרע ברוח. יש דגל חדש בארון במחסן, במדף העליון. צריך גם להחליף את החבל.', location: loc('gate'), dueDate: today, urgent: true, createdAt: ago(18), updatedAt: ago(5), photo: '/assets/rava-wayfinding.webp' }),
  task('demo-task-fence', 'לתקן את הגדר בחלקה הדרומית', { note: 'הגדר נפלה בפינה הדרומית־מזרחית. צריך 4 עמודים ורשת.', dueDate: key(-1), assignee: A.eliya, createdAt: ago(60), location: { lat: 31.2398, lng: 34.7300, placeName: 'חלקה דרומית' } }),
  task(`${T.pots}_${today}`, 'השקיית העציצים בשורה הצפונית', { note: '10 דקות לכל עציץ, לבדוק שהצינור לא סתום.', templateId: T.pots, dateKey: today, dueDate: today, location: loc('pots'), createdAt: at(0, '00:05') }),
  task('demo-task-tools', 'לסדר את ארגז הכלים במכולה', { assignee: A.yoav, dueDate: today, createdAt: ago(26), location: loc('container') }),
  task('demo-task-compost', 'להעביר שקי קומפוסט לחממה', { assignee: A.yoav, dueDate: today, createdBy: A.eliya, createdAt: ago(22), location: loc('tree') }),
  task('demo-task-tables', 'להכין את שולחנות הדוכן לפסטיבל', { assignee: A.noa, dueDate: key(SAT1 - 1), location: loc('stall'), createdAt: ago(40) }),
  task('demo-task-olives', 'לקצור את הזיתים בשורה המזרחית', { assignee: A.eliya, dueDate: key(SAT1 + 1), createdBy: A.eliya, location: loc('olives'), createdAt: ago(50) }),
  task('demo-task-irrigation', 'בדיקת מערכת ההשקיה', { managersOnly: true, dueDate: key(SAT1 + 2), templateId: T.irrigation, createdAt: ago(30) }),
  task('demo-task-paint', 'לצבוע את דלת המחסן', { createdBy: A.noa, createdAt: ago(7 * 24), location: loc('storage') }),
  task('demo-task-sign', 'להדפיס שלטי "כניסה" ו"דוכן" לפסטיבל', { createdBy: A.beni, createdAt: ago(3 * 24), managersOnly: false }),
  task('demo-task-prune', 'גיזום הענפים הנמוכים ליד השער', { createdBy: A.eliya, createdAt: ago(5 * 24), location: loc('gate') }),
  // done today
  task(`${T.gate}_${today}`, 'פתיחת השער ובדיקת הברזים', { templateId: T.gate, dateKey: today, dueDate: today, location: loc('gate'), done: true, doneBy: A.noa, doneAt: at(0, '07:10'), createdAt: at(0, '00:05') }),
  task(`${T.goats}_${today}`, 'האכלת העיזים', { templateId: T.goats, dateKey: today, dueDate: today, location: loc('goats'), done: true, doneBy: A.yoav, doneAt: at(0, '07:45'), createdAt: at(0, '00:05') }),
  task(`${T.stall}_${today}`, 'ניקוי אזור הדוכן', { templateId: T.stall, dateKey: today, dueDate: today, location: loc('stall'), done: true, doneBy: A.dana, doneAt: at(0, '09:30'), createdAt: at(0, '00:05') }),
  task('demo-task-done-nets', 'לפרוס רשתות צל מעל פינת החי', { done: true, doneBy: A.yoav, doneAt: at(0, '08:30'), createdAt: ago(48), assignee: A.yoav }),
  task('demo-task-done-water', 'למלא את שוקת המים בדיר', { done: true, doneBy: A.dana, doneAt: at(0, '09:05'), createdAt: ago(30), location: loc('goats') }),
  task('demo-task-done-trash', 'להוציא את הפחים לשער', { done: true, doneBy: A.noa, doneAt: at(0, '07:20'), createdAt: ago(28) }),
  // done yesterday
  task('demo-task-done-tools', 'סידור ארגז הכלים במכולה', { done: true, doneBy: A.eliya, doneAt: at(-1, '16:20'), doneNote: 'המקדח במדף העליון', donePhoto: '/assets/rava-wayfinding.webp', createdAt: ago(60), location: loc('container') }),
  task(`${T.pots}_${key(-1)}`, 'השקיית העציצים בשורה הצפונית', { templateId: T.pots, dateKey: key(-1), dueDate: key(-1), done: true, doneBy: A.yoav, doneAt: at(-1, '09:05'), createdAt: at(-1, '00:05'), location: loc('pots') }),
  task('demo-task-done-fence-buy', 'קניית חומרי בניין לגדר', { done: true, doneBy: A.dana, doneAt: at(-1, '12:40'), createdAt: ago(70) }),
  task(`${T.gate}_${key(-1)}`, 'פתיחת השער ובדיקת הברזים', { templateId: T.gate, dateKey: key(-1), dueDate: key(-1), done: true, doneBy: A.yoav, doneAt: at(-1, '07:25'), createdAt: at(-1, '00:05') }),
  task(`${T.goats}_${key(-1)}`, 'האכלת העיזים', { templateId: T.goats, dateKey: key(-1), dueDate: key(-1), done: true, doneBy: A.yoav, doneAt: at(-1, '07:50'), createdAt: at(-1, '00:05') }),
  // older history (last 30 days) for templates / reports
  ...Array.from({ length: 28 }, (_, i) => i + 2).flatMap((d) => {
    const k = key(-d); const wd = new Date(now.getTime() - d * DAY).getDay(); const out: Task[] = [];
    // a day that was missed simply has no done instance (the open one was cleaned up), so the 30-day grid shows a gap
    if (wd !== 6) {
      if (d % 15 !== 0) out.push(task(`${T.gate}_${k}`, 'פתיחת השער ובדיקת הברזים', { templateId: T.gate, dateKey: k, dueDate: k, done: true, doneBy: d % 3 ? A.noa : A.yoav, doneAt: at(-d, '07:20'), createdAt: at(-d, '00:05') }));
      out.push(task(`${T.goats}_${k}`, 'האכלת העיזים', { templateId: T.goats, dateKey: k, dueDate: k, done: true, doneBy: d % 4 === 0 ? A.dana : A.yoav, doneAt: at(-d, '07:50'), createdAt: at(-d, '00:05') }));
      if (d % 6 !== 0) out.push(task(`${T.pots}_${k}`, 'השקיית העציצים בשורה הצפונית', { templateId: T.pots, dateKey: k, dueDate: k, done: true, doneBy: d % 2 ? A.yoav : A.noa, doneAt: at(-d, '09:40'), createdAt: at(-d, '00:05') }));
    }
    return out;
  }),
];

// ---------- shopping ----------
const shop = (id: string, title: string, category: ShoppingItem['category'], o: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id, title, note: '', link: '', category, qty: '', urgent: false, createdBy: A.beni, createdAt: ago(24), bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: ago(1), ...o,
});
export const shopping: ShoppingItem[] = [
  shop('demo-shop-milk', 'חלב 3%', 'super', { qty: '6 קרטונים', urgent: true, createdBy: A.dana, createdAt: ago(1), updatedAt: at(0, '10:40') }),
  shop('demo-shop-bags', 'שקיות זבל גדולות', 'super', { qty: '2 חבילות', createdBy: A.yoav, createdAt: ago(26) }),
  shop('demo-shop-coffee', 'קפה שחור', 'super', { qty: '1 ק״ג', note: 'מהסוג הגס', createdBy: A.beni, createdAt: ago(28) }),
  shop('demo-shop-sugar', 'סוכר', 'super', { createdBy: A.noa, createdAt: ago(72) }),
  shop('demo-shop-soap', 'סבון כלים', 'super', { createdBy: A.dana, createdAt: ago(74) }),
  shop('demo-shop-screws', 'ברגים 4 מ״מ', 'building', { qty: 'קופסה', note: 'לגדר', createdBy: A.eliya, createdAt: ago(50) }),
  shop('demo-shop-pipe', 'צינור השקיה 16 מ״מ', 'building', { qty: '50 מ׳', createdBy: A.yoav, createdAt: ago(52) }),
  shop('demo-shop-dripper', 'מכוון טפטפות', 'online', { link: 'https://www.example.com/dripper', createdBy: A.beni, createdAt: ago(100) }),
  shop('demo-shop-cabinet', 'ארון מתכת למחסן', 'giveaway', { note: 'ראיתם ברשתות? סמנו נמצא', createdBy: A.beni, createdAt: ago(200) }),
  shop('demo-shop-eggs', 'ביצים', 'super', { qty: '2 תבניות', createdBy: A.dana, createdAt: ago(40), bought: true, boughtBy: A.noa, boughtAt: at(0, '08:40'), expireAt: at(1, '08:40') }),
  shop('demo-shop-bread', 'לחם', 'super', { qty: '3', createdBy: A.yoav, createdAt: ago(41), bought: true, boughtBy: A.noa, boughtAt: at(0, '08:40'), expireAt: at(1, '08:40') }),
  shop('demo-shop-feed', 'מזון לעיזים', 'super', { qty: '3 שקים', createdBy: A.yoav, createdAt: ago(5 * 24), bought: true, boughtBy: A.dana, boughtAt: at(-3, '12:00') }),
  shop('demo-shop-milk-prev', 'חלב 3%', 'super', { qty: '4 קרטונים', createdBy: A.dana, createdAt: ago(6 * 24), bought: true, boughtBy: A.noa, boughtAt: at(-4, '11:30') }),
  shop('demo-shop-flour', 'קמח', 'super', { qty: '5 ק״ג', createdBy: A.noa, createdAt: ago(9 * 24), bought: true, boughtBy: A.dana, boughtAt: at(-7, '12:10') }),
  shop('demo-shop-cement', 'מלט', 'building', { qty: '4 שקים', createdBy: A.eliya, createdAt: ago(12 * 24), bought: true, boughtBy: A.dana, boughtAt: at(-1, '12:40') }),
];

// ---------- events ----------
const ev = (id: string, title: string, o: Partial<FarmEvent>): FarmEvent => ({
  id, title, description: '', image: '', location: 'חוות רווה, ליד טנא עומרים', start: '', end: '', price: 0, maxPerOrder: 5, capacity: 0, open: true, published: true, questions: [], createdBy: A.beni, createdAt: ago(30 * 24), updatedAt: ago(24), ...o,
});
export const E = { fall: 'demo-e-fall', tour: 'demo-e-tour', hanukkah: 'demo-e-hanukkah', oct: 'demo-e-oct', rosh: 'demo-e-rosh', summer: 'demo-e-summer', shavuot: 'demo-e-shavuot' };
export const events: FarmEvent[] = [
  ev(E.fall, 'פסטיבל הסתיו', { description: 'אחר צהריים של סתיו בחווה: דוכני תוצרת ואומנות, סיורים מודרכים בין העצים, פינת חי לילדים ומוזיקה חיה עם השקיעה. דוכן החווה פתוח כל הערב.', image: '/assets/rava-sunset.webp', start: at(SAT1, '16:00'), end: at(SAT1, '21:00'), price: 50, maxPerOrder: 5, capacity: 300, questions: [{ id: 'kids', label: 'מגיעים עם ילדים?', required: false }] }),
  ev(E.tour, 'סיור שבת בחווה', { description: 'סיור מודרך של שעתיים בין העצים, הדיר והחממה. מתאים למשפחות. נפגשים בשער.', start: at(SAT2, '10:00'), end: at(SAT2, '12:00'), price: 0, maxPerOrder: 6, capacity: 60 }),
  ev(E.hanukkah, 'יריד חנוכה', { description: '', start: at(SAT3, '16:00'), end: at(SAT3, '20:00'), price: 40, published: false, open: false }),
  ev(E.oct, 'יריד אוקטובר', { description: 'יריד תוצרת של סתיו.', start: at(-24, '16:00'), end: at(-24, '21:00'), price: 40, capacity: 200, open: false }),
  ev(E.rosh, 'סיור ראש השנה', { start: at(-51, '10:00'), end: at(-51, '12:00'), price: 0, open: false }),
  ev(E.summer, 'פסטיבל הקיץ', { start: at(-122, '17:00'), end: at(-122, '22:00'), price: 40, open: false }),
  ev(E.shavuot, 'סיור שבועות', { start: at(-178, '10:00'), end: at(-178, '12:00'), price: 0, open: false }),
];

// ---------- tickets ----------
let tseq = 0;
const order = (eventId: string, owner: Profile, count: number, paymentStatus: Ticket['paymentStatus'], createdAt: string, o: Partial<Ticket> & { holders?: string[]; entriesPer?: number[] } = {}): Ticket[] => {
  const e = events.find((x) => x.id === eventId)!;
  const orderId = `demo-o-${++tseq}`;
  const { holders = [], entriesPer = [], ...rest } = o;
  return Array.from({ length: count }, (_, i) => ({
    id: `${orderId}-${i + 1}`, eventId, eventTitle: e.title, orderId, index: i + 1, total: count,
    ownerUid: owner.uid, ownerName: owner.displayName, ownerPhone: owner.phone, holderName: holders[i] || '',
    secret: `d${tseq.toString(16).padStart(4, '0')}${(i + 1).toString(16).padStart(2, '0')}deadbeef`.slice(0, 24), price: e.price, paymentStatus, status: 'valid' as const,
    scans: Array.from({ length: entriesPer[i] || 0 }, (_, s) => ({ at: at(0, `16:${30 + s}`), by: s % 2 ? A.yoav : A.noa })), entries: entriesPer[i] || 0, answers: {}, createdAt, updatedAt: createdAt, ...rest,
  }));
};
const pr = (uid: string) => profiles.find((p) => p.uid === uid)!;
export const tickets: Ticket[] = [
  ...order(E.fall, pr(U.roni), 3, 'pending', at(0, '09:48'), { holders: ['', 'אורלי לוי', ''] }),
  ...order(E.fall, pr(U.michal), 3, 'paid', at(0, '10:12')),
  ...order(E.fall, pr(U.david), 4, 'claimed', at(-2, '18:00'), { answers: { kids: '2, בני 6 ו־9' } }),
  ...order(E.fall, pr(U.ester), 5, 'paid', at(-3, '20:00')),
  ...order(E.fall, pr(U.orly), 2, 'paid', at(-8, '12:00')),
  ...order(E.fall, pr(U.noam), 1, 'paid', at(-5, '12:00')),
  ...order(E.fall, pr(U.shirak), 1, 'paid', at(-1, '12:00')),
  ...order(E.fall, pr(U.naama), 1, 'paid', at(-4, '12:00')),
  ...order(E.fall, pr(U.yossi), 2, 'cancelled', at(-9, '12:00'), { status: 'cancelled' }),
  ...order(E.tour, pr(U.roni), 2, 'free', at(-2, '12:00')),
  ...order(E.tour, pr(U.david), 4, 'free', at(-1, '12:00')),
  // past: October fair
  ...order(E.oct, pr(U.roni), 2, 'paid', at(-30, '12:00'), { entriesPer: [1, 1] }),
  ...order(E.oct, pr(U.david), 4, 'paid_onsite', at(-29, '12:00'), { entriesPer: [1, 2, 1, 1] }),
  ...order(E.oct, pr(U.orly), 2, 'paid', at(-28, '12:00'), { entriesPer: [1, 1] }),
  ...order(E.oct, pr(U.michal), 2, 'paid', at(-27, '12:00'), { entriesPer: [1, 1] }),
  ...order(E.oct, pr(U.noam), 1, 'paid', at(-26, '12:00'), { entriesPer: [1] }),
  ...order(E.oct, pr(U.shirak), 1, 'paid', at(-25, '12:00'), { entriesPer: [1] }),
  ...order(E.oct, pr(U.yossi), 2, 'pending', at(-25, '12:00'), { entriesPer: [1, 1] }),
];

// ---------- visits ----------
const visit = (id: string, p: Profile, date: string, people: number, type: string, note: string, status: Visit['status'], o: Partial<Visit> = {}): Visit => ({
  id, uid: p.uid, name: p.displayName, phone: p.phone, date, people, type, note, status, managerNote: '', handledBy: null, createdAt: ago(48), updatedAt: ago(48), ...o,
});
export const visits: Visit[] = [
  visit('demo-v-cohen', pr(U.ester), key(FRI), 8, 'סיור בחווה', 'סבא וסבתא עם הנכדים, מעדיפים בוקר. הנכד הקטן אלרגי לאגוזים.', 'new', { name: 'משפחת כהן', createdAt: ago(0.7), updatedAt: ago(0.7) }),
  visit('demo-v-kindergarten', { ...pr(U.noam), displayName: 'גן ילדים "רימון"', phone: '052-000-0712' } as Profile, key(THU), 24, 'מפגש קבוצתי', 'ילדי הגן הבוגר, 24 ילדים ו־4 מלוות.', 'approved', { managerNote: 'להכין את פינת החי', handledBy: A.beni, createdAt: ago(5 * 24), updatedAt: ago(26) }),
  visit('demo-v-photo', { ...pr(U.naama), displayName: 'חוג צילום באר שבע', phone: '054-000-0740' } as Profile, key(FRI - 3), 12, 'סיור בחווה', 'שעת שקיעה אם אפשר.', 'approved', { managerNote: 'שעת שקיעה', handledBy: A.noa, createdAt: ago(6 * 24), updatedAt: ago(4 * 24) }),
  visit('demo-v-rachel', { ...pr(U.orly), displayName: 'יום הולדת 60 לרחל', phone: '050-000-0633' } as Profile, key(FRI + 7), 30, 'אירוע פרטי', 'ארוחת צהריים בחוץ, 30 אנשים.', 'approved', { managerNote: 'אירוע פרטי · 11:00', handledBy: A.beni, createdAt: ago(9 * 24), updatedAt: ago(8 * 24) }),
  visit('demo-v-couple', { ...pr(U.shirak), displayName: 'זוג מתל אביב', phone: '053-000-0981' } as Profile, key(-2), 2, 'סיור בחווה', '', 'rejected', { managerNote: 'אין סיורים ביום ראשון', handledBy: A.noa, createdAt: ago(4 * 24), updatedAt: ago(3 * 24) }),
  visit('demo-v-levi', { ...pr(U.roni), displayName: 'משפחת לוי' } as Profile, key(-10), 6, 'סיור בחווה', '', 'approved', { managerNote: 'הגיעו · קנו בדוכן', handledBy: A.beni, createdAt: ago(15 * 24), updatedAt: ago(14 * 24) }),
];

// ---------- donations ----------
const don = (id: string, p: Profile, amount: number, label: string, createdAt: string, o: Partial<Donation> = {}): Donation => ({
  id, uid: p.uid, name: p.displayName, phone: p.phone, amount, label, note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'paid', createdAt, updatedAt: createdAt, ...o,
});
export const donations: Donation[] = [
  don('demo-d-michal', pr(U.michal), 180, 'עשר פעמים חי', at(0, '10:30'), { memorial: 'יוסף ברק', note: 'סבא שלי, שאהב את הנגב.', receiptWanted: true, receiptName: 'מיכל ברק', paymentStatus: 'claimed' }),
  don('demo-d-noam', pr(U.noam), 360, 'לב', at(-2, '12:00'), { receiptWanted: true, receiptName: 'נועם אדרי' }),
  don('demo-d-tamar', pr(U.tamar), 250, 'סכום חופשי', at(-6, '12:00'), { note: 'לטובת העצים החדשים', receiptWanted: true, receiptName: 'תמר קליין' }),
  don('demo-d-orly', pr(U.orly), 18, 'חי', at(-8, '12:00')),
  don('demo-d-david', pr(U.david), 180, 'עשר פעמים חי', at(-9, '12:00'), { receiptWanted: true, receiptName: 'דוד כהן', receiptSent: true }),
  don('demo-d-anon', { ...pr(U.gil), displayName: 'אנונימי', phone: '' } as Profile, 360, 'לב', at(-10, '12:00'), { note: 'בשביל העצים' }),
  don('demo-d-shirak', pr(U.shirak), 52, 'סכום חופשי', at(-10, '12:00')),
  don('demo-d-oct1', pr(U.roni), 100, 'סכום חופשי', at(-24, '18:00')),
  don('demo-d-oct2', pr(U.ester), 180, 'עשר פעמים חי', at(-24, '19:00')),
  don('demo-d-sep', pr(U.noam), 360, 'לב', at(-40, '12:00')),
];

// ---------- vendors ----------
const vendor = (id: string, name: string, phone: string, product: string, notes = ''): Vendor => ({ id, name, phone, product, external: true, notes, createdAt: ago(200 * 24), updatedAt: ago(10 * 24) });
export const V = { raz: 'demo-vd-raz', honey: 'demo-vd-honey', winery: 'demo-vd-winery', bakery: 'demo-vd-bakery', ceramics: 'demo-vd-ceramics', oil: 'demo-vd-oil', jewelry: 'demo-vd-jewelry', herbs: 'demo-vd-herbs', farm: 'demo-vd-farm' };
export const vendors: Vendor[] = [
  vendor(V.raz, 'גבינות משק רז', '052-000-0601', 'גבינות'),
  vendor(V.honey, 'דבש גלעד', '054-000-0602', 'דבש'),
  vendor(V.winery, 'יקב הר', '050-000-0603', 'יין'),
  vendor(V.bakery, 'מאפיית הכפר', '052-000-0604', 'לחמים'),
  vendor(V.ceramics, 'קרמיקה של תמר', '054-000-0605', 'קרמיקה', 'צריכה שולחן וחיבור לחשמל. היתה ביריד אוקטובר, מכרה טוב.'),
  vendor(V.oil, 'שמן זית בן־עמי', '050-000-0606', 'שמן זית'),
  vendor(V.jewelry, 'תכשיטי נעמה', '052-000-0520', 'תכשיטים'),
  vendor(V.herbs, 'צמחי מרפא נגב', '053-000-0607', 'תה וצמחים'),
  { ...vendor(V.farm, 'דוכן החווה', '', 'מוצרים ומחירים לכל אירוע'), external: false },
];
export const eventVendors: Record<string, EventVendor[]> = {
  [E.fall]: [
    { id: V.raz, vendorId: V.raz, name: 'גבינות משק רז', confirmed: true, notes: '' },
    { id: V.honey, vendorId: V.honey, name: 'דבש גלעד', confirmed: true, notes: '' },
    { id: V.winery, vendorId: V.winery, name: 'יקב הר', confirmed: true, notes: '' },
    { id: V.bakery, vendorId: V.bakery, name: 'מאפיית הכפר', confirmed: false, notes: 'הוזמנו לפני 5 ימים' },
    { id: V.jewelry, vendorId: V.jewelry, name: 'תכשיטי נעמה', confirmed: false, notes: 'הוזמנה לפני 5 ימים' },
    { id: V.farm, vendorId: V.farm, name: 'דוכן החווה', confirmed: true, notes: '' },
  ],
  [E.oct]: [
    { id: V.raz, vendorId: V.raz, name: 'גבינות משק רז', confirmed: true, notes: '' },
    { id: V.honey, vendorId: V.honey, name: 'דבש גלעד', confirmed: true, notes: '' },
    { id: V.ceramics, vendorId: V.ceramics, name: 'קרמיקה של תמר', confirmed: true, notes: '' },
    { id: V.herbs, vendorId: V.herbs, name: 'צמחי מרפא נגב', confirmed: true, notes: '' },
    { id: V.farm, vendorId: V.farm, name: 'דוכן החווה', confirmed: true, notes: '' },
  ],
};

// ---------- products (per event) ----------
const prod = (id: string, name: string, price: number, sort: number, active = true): Product => ({ id, name, price, active, sort });
const baseProducts = [
  prod('demo-pr-lemonade', 'לימונדה', 12, 1), prod('demo-pr-tea', 'תה צמחים', 10, 2), prod('demo-pr-cheese', 'גבינת עיזים', 35, 3), prod('demo-pr-cake', 'עוגת תפוחים', 18, 4),
  prod('demo-pr-olives', 'זיתים', 20, 5), prod('demo-pr-oil', 'שמן זית 500 מ״ל', 45, 6), prod('demo-pr-honey', 'דבש', 40, 7), prod('demo-pr-bread', 'לחם מחמצת', 25, 8), prod('demo-pr-jam', 'ריבת תאנים', 28, 9, false),
];
export const products: Record<string, Product[]> = {
  [E.fall]: baseProducts,
  [E.oct]: baseProducts.map((p) => ({ ...p, active: true, price: p.id === 'demo-pr-cheese' ? 32 : p.price })),
  [E.summer]: baseProducts.slice(0, 6),
};

// ---------- tabs ----------
const tabItem = (productId: string, qty: number, atIso: string, by: Actor): import('../types').TabItem => { const p = baseProducts.find((x) => x.id === productId)!; return { productId, name: p.name, price: p.price, qty, at: atIso, by }; };
const tab = (id: string, eventId: string, guest: Profile | { uid: string; displayName: string; phone: string }, items: import('../types').TabItem[], status: Tab['status'], createdAt: string, by: Actor, o: Partial<Tab> = {}): Tab => {
  const e = events.find((x) => x.id === eventId)!;
  return { id, eventId, eventTitle: e.title, guestUid: guest.uid, guestName: guest.displayName, guestPhone: guest.phone, ticketId: '', items, total: items.reduce((s, i) => s + i.price * i.qty, 0), status, createdBy: by, createdAt, updatedAt: createdAt, ...o };
};
export const tabs: Tab[] = [
  tab('demo-tab-roni-oct', E.oct, pr(U.roni), [tabItem('demo-pr-lemonade', 2, at(-24, '17:05'), A.noa), tabItem('demo-pr-cheese', 1, at(-24, '17:40'), A.yoav)], 'claimed', at(-24, '17:05'), A.noa, { total: 46 + 13 - 13, items: [tabItem('demo-pr-lemonade', 2, at(-24, '17:05'), A.noa), { ...tabItem('demo-pr-cheese', 1, at(-24, '17:40'), A.yoav), price: 22 }], updatedAt: at(-1, '20:14') }),
  tab('demo-tab-shirak-oct', E.oct, pr(U.shirak), [tabItem('demo-pr-oil', 1, at(-24, '18:10'), A.yoav), tabItem('demo-pr-honey', 1, at(-24, '18:10'), A.yoav)], 'open', at(-24, '18:10'), A.yoav, { total: 70, items: [{ ...tabItem('demo-pr-oil', 1, at(-24, '18:10'), A.yoav), price: 30 }, tabItem('demo-pr-honey', 1, at(-24, '18:10'), A.yoav)] }),
  tab('demo-tab-david-oct', E.oct, pr(U.david), [tabItem('demo-pr-oil', 1, at(-24, '17:00'), A.noa), tabItem('demo-pr-honey', 1, at(-24, '17:00'), A.noa), tabItem('demo-pr-cake', 2, at(-24, '18:30'), A.yoav)], 'paid', at(-24, '17:00'), A.noa, { total: 118, items: [{ ...tabItem('demo-pr-oil', 1, at(-24, '17:00'), A.noa), price: 42 }, tabItem('demo-pr-honey', 1, at(-24, '17:00'), A.noa), tabItem('demo-pr-cake', 2, at(-24, '18:30'), A.yoav)] }),
  tab('demo-tab-orly-oct', E.oct, pr(U.orly), [tabItem('demo-pr-lemonade', 1, at(-24, '16:30'), A.noa), tabItem('demo-pr-cake', 1, at(-24, '16:30'), A.noa), tabItem('demo-pr-jam', 1, at(-24, '16:35'), A.noa)], 'paid', at(-24, '16:30'), A.noa),
  tab('demo-tab-michal-oct', E.oct, pr(U.michal), [tabItem('demo-pr-tea', 2, at(-24, '17:20'), A.yoav), tabItem('demo-pr-bread', 2, at(-24, '17:20'), A.yoav)], 'paid', at(-24, '17:20'), A.yoav, { updatedAt: at(-22, '10:00') }),
  tab('demo-tab-walkin-oct', E.oct, { uid: '', displayName: 'עובר אורח', phone: '052-000-0411' }, [tabItem('demo-pr-lemonade', 1, at(-24, '19:00'), A.noa)], 'waived', at(-24, '19:00'), A.noa, { updatedAt: at(-17, '10:00') }),
  tab('demo-tab-noam-oct', E.oct, pr(U.noam), [tabItem('demo-pr-cheese', 1, at(-24, '16:12'), A.yoav)], 'paid', at(-24, '16:12'), A.yoav),
];

// ---------- notifications (manager queue) ----------
const notif = (id: string, type: AppNotification['type'], title: string, text: string, link: string, refId: string, createdAt: string, handled: { by: Actor; at: string } | null = null): AppNotification => ({ id, type, title, text, link, refId, createdAt, handled: !!handled, handledBy: handled?.by || null, handledAt: handled?.at || null });
export const notifications: AppNotification[] = [
  notif('demo-n-visit', 'visit', 'בקשת ביקור חדשה', 'משפחת כהן · 8 אנשים · סיור בחווה', '/manage/visits/demo-v-cohen', 'demo-v-cohen', ago(0.7)),
  notif('demo-n-donation', 'donation', 'תרומה · 180 ₪ · מיכל ברק', 'הועבר, ממתין לאישור · לזכר יוסף ברק · צריכה קבלה', '/manage/donations/demo-d-michal', 'demo-d-michal', ago(1)),
  notif('demo-n-tab', 'tab', 'תשלום דוכן הועבר: יריד אוקטובר', 'רוני לוי · 46 ₪', `/manage/events/${E.oct}/tabs/demo-tab-roni-oct`, 'demo-tab-roni-oct', at(-1, '20:14')),
  notif('demo-n-order-michal', 'order', 'הזמנה חדשה: פסטיבל הסתיו', 'מיכל ברק הזמינה 3 כרטיסים', `/manage/events/${E.fall}/guests`, 'demo-o-2', at(0, '10:12'), { by: A.beni, at: at(0, '10:13') }),
  notif('demo-n-order-roni', 'order', 'הזמנה חדשה: פסטיבל הסתיו', 'רוני לוי הזמינה 3 כרטיסים', `/manage/events/${E.fall}/guests`, 'demo-o-1', at(0, '09:48'), { by: A.beni, at: at(0, '09:50') }),
  notif('demo-n-visit-kg', 'visit', 'בקשת ביקור חדשה', 'גן ילדים "רימון" · 24', '/manage/visits/demo-v-kindergarten', 'demo-v-kindergarten', ago(5 * 24), { by: A.beni, at: ago(26) }),
  notif('demo-n-don-noam', 'donation', 'תרומה חדשה', 'נועם אדרי · 360 ₪', '/manage/donations/demo-d-noam', 'demo-d-noam', at(-2, '12:00'), { by: A.noa, at: at(-2, '13:00') }),
  notif('demo-n-receipt-noam', 'receipt', 'בקשה לקבלה', 'נועם אדרי · 360 ₪', '/manage/donations/demo-d-noam', 'demo-d-noam', at(-2, '12:00'), { by: A.beni, at: at(-2, '15:00') }),
  notif('demo-n-claim-david', 'claim', 'תשלום הועבר: פסטיבל הסתיו', 'דוד כהן סימן שהעביר תשלום על 4 כרטיסים', `/manage/events/${E.fall}/guests`, 'demo-o-3', at(-1, '21:05'), { by: A.beni, at: at(0, '08:30') }),
];

// ---------- calendar ----------
const cal = (id: string, owner: Actor, title: string, date: string, time: string, kind: CalendarItem['kind'] = 'manual', refId = ''): CalendarItem => ({ id, ownerUid: owner.uid, ownerName: owner.name, title, date, time, kind, refId, createdAt: ago(48) });
export const calendar: CalendarItem[] = [
  cal('demo-c-1', A.eliya, 'אליה בחווה', key(0), '09:00–14:00'),
  cal('demo-c-2', A.beni, 'בני בחווה', key(1), '08:00–13:00'),
  cal('demo-c-3', A.noa, 'ספק מגיע', key(-1), '11:00'),
  cal('demo-c-4', A.beni, 'פגישת צוות לפני הפסטיבל', key(THU), '17:00'),
  cal('demo-c-5', A.noa, 'הכנת שולחנות', key(SAT1 - 1), ''),
  cal('demo-c-6', A.eliya, 'אליה בחווה', key(8), '09:00–14:00'),
  cal('demo-c-7', A.eliya, 'אליה בחווה', key(FRI), ''),
  cal('demo-c-8', A.beni, 'בני בחווה', key(15), ''),
  cal('visit_demo-v-kindergarten', A.beni, 'ביקור: גן ילדים "רימון" · 24', key(THU), '09:30', 'visit', 'demo-v-kindergarten'),
  cal('visit_demo-v-photo', A.noa, 'ביקור: חוג צילום באר שבע · 12', key(FRI - 3), 'שקיעה', 'visit', 'demo-v-photo'),
  cal('visit_demo-v-rachel', A.beni, 'אירוע פרטי: יום הולדת 60 לרחל · 30', key(FRI + 7), '11:00', 'visit', 'demo-v-rachel'),
  cal(`event_${E.fall}`, A.beni, 'פסטיבל הסתיו', key(SAT1), '16:00–21:00', 'event', E.fall),
  cal(`event_${E.tour}`, A.beni, 'סיור שבת בחווה', key(SAT2), '10:00–12:00', 'event', E.tour),
];

// ---------- activity ----------
let aseq = 0;
const act = (kind: Activity['kind'], refId: string, action: string, text: string, by: Actor, atIso: string, extra: { subjectUid?: string; eventId?: string } = {}): Activity => ({ id: `demo-a-${++aseq}`, kind, refId, action, text, by, at: atIso, subjectUid: extra.subjectUid || '', eventId: extra.eventId || '' });
export const activity: Activity[] = [
  act('shopping', 'demo-shop-milk', 'edited', 'סימנה דחוף: חלב 3% · 6 קרטונים', A.dana, at(0, '10:40')),
  act('donation', 'demo-d-michal', 'claimed', '180 ₪ · לזכר יוסף ברק', A.michal, at(0, '10:31'), { subjectUid: U.michal }),
  act('donation', 'demo-d-michal', 'created', '180 ₪ · לזכר יוסף ברק', A.michal, at(0, '10:30'), { subjectUid: U.michal }),
  act('visit', 'demo-v-cohen', 'requested', '8 אנשים · סיור בחווה · מהאתר', A.ester, at(0, '10:20'), { subjectUid: U.ester }),
  act('ticket', 'demo-o-2', 'ordered', '3 כרטיסים · פסטיבל הסתיו · שולם', A.michal, at(0, '10:12'), { subjectUid: U.michal, eventId: E.fall }),
  act('ticket', 'demo-o-1', 'ordered', '3 כרטיסים · פסטיבל הסתיו · ממתין לתשלום · 150 ₪', A.roni, at(0, '09:48'), { subjectUid: U.roni, eventId: E.fall }),
  act('task', `${T.stall}_${today}`, 'done', 'ניקוי אזור הדוכן', A.dana, at(0, '09:30')),
  act('shopping', 'demo-shop-eggs', 'bought', 'ביצים · 2 תבניות', A.noa, at(0, '08:40')),
  act('shopping', 'demo-shop-bread', 'bought', 'לחם · 3', A.noa, at(0, '08:40')),
  act('ticket', 'demo-o-3', 'paid', 'דוד כהן · פסטיבל הסתיו · 200 ₪ · 4 כרטיסים', A.beni, at(0, '08:30'), { subjectUid: U.david, eventId: E.fall }),
  act('task', `${T.goats}_${today}`, 'done', 'האכלת העיזים', A.yoav, at(0, '07:45')),
  act('task', `${T.gate}_${today}`, 'done', 'פתיחת השער ובדיקת הברזים', A.noa, at(0, '07:10')),
  act('task', 'demo-task-flag', 'edited', 'סומנה דחוף: להחליף את הדגל ליד הכניסה', A.beni, at(0, '07:02')),
  act('ticket', 'demo-o-3', 'claimed', '4 כרטיסים · פסטיבל הסתיו · 200 ₪', A.david, at(-1, '21:05'), { subjectUid: U.david, eventId: E.fall }),
  act('tab', 'demo-tab-roni-oct', 'claimed', '46 ₪ · יריד אוקטובר', A.roni, at(-1, '20:14'), { subjectUid: U.roni, eventId: E.oct }),
  act('event', E.fall, 'edited', 'יקב הר אישרו הגעה', A.beni, at(-1, '18:40'), { eventId: E.fall }),
  act('task', 'demo-task-flag', 'photo', 'להחליף את הדגל ליד הכניסה', A.beni, at(-1, '18:21')),
  act('task', 'demo-task-flag', 'created', 'להחליף את הדגל ליד הכניסה, עם תמונה ומיקום', A.beni, at(-1, '18:20')),
  act('task', 'demo-task-done-tools', 'done', 'סידור ארגז הכלים במכולה, עם תמונה · "המקדח במדף העליון"', A.eliya, at(-1, '16:20')),
  act('event', E.fall, 'edited', 'הועתקו 8 מוצרים מיריד אוקטובר', A.noa, at(-1, '16:12'), { eventId: E.fall }),
  act('event', E.fall, 'edited', 'התיאור והתמונה עודכנו', A.beni, at(-1, '15:50'), { eventId: E.fall }),
  act('user', 'omer.levi2@gmail.com', 'invited', 'omer.levi2@gmail.com הוגדר/ה מראש כצוות', A.beni, at(-1, '12:05')),
  act('task', `${T.pots}_${key(-1)}`, 'done', 'השקיית העציצים בשורה הצפונית', A.yoav, at(-1, '09:05')),
  act('task', 'demo-task-done-fence-buy', 'done', 'קניית חומרי בניין לגדר', A.dana, at(-1, '12:40')),
  act('ticket', 'demo-o-9', 'cancelled', 'יוסי מזרחי · 2 כרטיסים · פסטיבל הסתיו · "לא שילם פעמיים"', A.beni, at(-6, '11:20'), { subjectUid: U.yossi, eventId: E.fall }),
  act('user', U.yossi, 'blocked', 'יוסי מזרחי נחסם/ה', A.beni, at(-6, '11:22'), { subjectUid: U.yossi }),
  act('event', E.fall, 'published', 'פסטיבל הסתיו', A.beni, at(-6, '09:00'), { eventId: E.fall }),
  act('visit', 'demo-v-kindergarten', 'approved', 'גן ילדים "רימון" · להכין את פינת החי', A.beni, ago(26), { subjectUid: U.noam }),
  act('donation', 'demo-d-noam', 'receipt', 'נועם אדרי · 360 ₪', A.beni, at(-2, '15:00'), { subjectUid: U.noam }),
  act('donation', 'demo-d-noam', 'paid', 'נועם אדרי · 360 ₪', A.noa, at(-2, '13:00'), { subjectUid: U.noam }),
  act('ticket', 'demo-o-12-2', 'scanned', 'רוני לוי · כניסה 1', A.noa, at(-24, '16:42'), { subjectUid: U.roni, eventId: E.oct }),
  act('ticket', 'demo-o-13-1', 'scanned', 'דוד כהן · כניסה 2', A.yoav, at(-24, '16:40'), { subjectUid: U.david, eventId: E.oct }),
  act('tab', 'demo-tab-roni-oct', 'item', 'רוני לוי: לימונדה ×2 · 24 ₪', A.noa, at(-24, '17:05'), { subjectUid: U.roni, eventId: E.oct }),
  act('tab', 'demo-tab-roni-oct', 'item', 'רוני לוי: גבינת עיזים · 22 ₪', A.yoav, at(-24, '17:40'), { subjectUid: U.roni, eventId: E.oct }),
  act('tab', 'demo-tab-roni-oct', 'removed', 'רוני לוי: עוגת תפוחים · "טעות"', A.yoav, at(-24, '17:42'), { subjectUid: U.roni, eventId: E.oct }),
  act('tab', 'demo-tab-walkin-oct', 'waived', 'עובר אורח · 12 ₪ · "לא שווה לרדוף"', A.beni, at(-17, '10:00'), { eventId: E.oct }),
  act('user', U.tamar, 'role', 'תמר קליין: צוות ← מנהל/ת', A.beni, at(-30, '10:00'), { subjectUid: U.tamar }),
  act('user', U.roni, 'joined', 'רוני לוי נרשם/ה', A.roni, ago(70 * 24), { subjectUid: U.roni }),
  act('place', P.storage, 'created', 'המחסן', A.beni, ago(30 * 24)),
];

// ---------- settings ----------
export const settings: Settings = {
  ...DEFAULT_SETTINGS,
  payment: { bit: '050-000-0000', paybox: 'payboxapp.com/ravve', cash: true, note: 'בהעברה לציין את שם האירוע ושם המזמין' },
  registrationFields: [
    { id: 'city', label: 'יישוב', type: 'text', options: [], required: false },
    { id: 'source', label: 'איך שמעתם עלינו?', type: 'choice', options: ['פייסבוק', 'חברים', 'עברנו ליד', 'אחר'], required: false },
    { id: 'birthday', label: 'תאריך לידה', type: 'date', options: [], required: false },
  ],
  templates: {
    ...DEFAULT_SETTINGS.templates,
    visitApproved: 'שלום [שם], הביקור בחוות רווה ב־[תאריך] מאושר. נפגשים בשער ב־[שעה]. נשמח לראותכם!',
    debtReminder: 'שלום [שם], תודה שהייתם ב־[אירוע]. נשאר לתשלום [סכום] ₪. אפשר להעביר בביט 050-000-0000 או ב־PayBox. תודה!',
  },
};

/** Everything the demo store serves, keyed by Firestore collection path. */
export const collections: Record<string, Record<string, unknown>[]> = {
  users: profiles, role_invites: roleInvites, tasks, task_templates: templates, shopping, places, events, tickets, visits, donations, vendors, tabs, notifications, calendar, activity,
  ...Object.fromEntries(Object.entries(eventVendors).map(([eid, v]) => [`events/${eid}/vendors`, v])),
  ...Object.fromEntries(Object.entries(products).map(([eid, p]) => [`events/${eid}/products`, p])),
};
export const documents: Record<string, unknown> = { 'settings/app': settings };
