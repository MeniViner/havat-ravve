// Demo data: every example that appears in the design canvas, typed with the real app types.
// Loaded only when demo mode is on (see demo/store.ts). Ids start with "demo-" so writes never touch Firestore.
import type {
  Profile, Task, Template, ShoppingItem, Place, RoleInvite, Activity, FarmEvent, Ticket, Visit, Donation, Vendor, EventVendor,
  Product, Tab, Settings, AppNotification, CalendarItem, Actor, VendorV2, EventVendorV2,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';

// ---------- time helpers: fixed to the designed "regular day" (Thu 2026-11-19 10:30, Israel) ----------
// The demo clock is frozen per scenario (demo/store.ts); the seed is written around these fixed dates so the designs match.
const DAY = 86400_000;
export const ANCHOR = '2026-11-19T10:30:00+02:00';
const now = new Date(ANCHOR);
const key = (daysFromToday: number) => new Date(Date.UTC(2026, 10, 19 + daysFromToday)).toISOString().slice(0, 10);
const at = (daysFromToday: number, hhmm = '12:00') => new Date(`${key(daysFromToday)}T${hhmm}:00+02:00`).toISOString();
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
export const demoPreviousGuestVisit = ago(24);
const SAT1 = 9, SAT2 = 16, SAT3 = 24; // 28.11 festival, 5.12 tour, 13.12 hanukkah evening
const FRI = 8, THU = 7;
void DAY;

// ---------- people ----------
const actor = (uid: string, name: string): Actor => ({ uid, name });
const person = (uid: string, n: number, displayName: string, email: string, phone: string, role: Profile['role'], created: number, extra: Partial<Profile> = {}): Profile => ({
  uid, email, displayName, phone, role, status: 'active', customerNumber: n, acceptedTermsAt: ago(created * 24), createdAt: ago(created * 24), updatedAt: ago(created * 24), ...extra,
});
export const U = {
  beni: 'demo-u-beni', eliya: 'demo-u-eliya', noa: 'demo-u-noa', roi: 'demo-u-roi', dana: 'demo-u-dana',
  yoav: 'demo-u-yoav', orly: 'demo-u-orly', omer: 'demo-u-omer', shira: 'demo-u-shira', gil: 'demo-u-gil', maya: 'demo-u-maya', avi: 'demo-u-avi',
  michal: 'demo-u-michal', david: 'demo-u-david', roni: 'demo-u-roni', shirak: 'demo-u-shirak', ester: 'demo-u-ester', yossi: 'demo-u-yossi', noam: 'demo-u-noam', rachel: 'demo-u-rachel', naama: 'demo-u-naama',
  raz: 'demo-u-raz', tamar: 'demo-u-tamar', farm: 'demo-u-farm',
};
export const A = {
  beni: actor(U.beni, 'בני גוטמן'), eliya: actor(U.eliya, 'אליה כהן'), noa: actor(U.noa, 'נועה שחר'), roi: actor(U.roi, 'רועי אלון'), yoav: actor(U.yoav, 'יואב פרץ'), dana: actor(U.dana, 'דנה אברהם'),
  orly: actor(U.orly, 'אורלי לוי'), omer: actor(U.omer, 'עומר לוי'), shira: actor(U.shira, 'שירה גולן'), gil: actor(U.gil, 'גיל ברק'),
  roni: actor(U.roni, 'רוני לוי'), david: actor(U.david, 'דוד כהן'), michal: actor(U.michal, 'מיכל ברק'), ester: actor(U.ester, 'אסתר כהן'), noam: actor(U.noam, 'נועם אדרי'), yossi: actor(U.yossi, 'יוסי מזרחי'),
  rachel: actor(U.rachel, 'רחל שטרן'), shirak: actor(U.shirak, 'שירה כץ'), raz: actor(U.raz, 'רז כהן'), tamar: actor(U.tamar, 'תמר כהן'),
};
// The team is 12 (5 managers and owners, 7 volunteers). Dana Avraham is a manager (the design shows her both ways; decided: manager).
const named: Profile[] = [
  person(U.beni, 1, 'בני גוטמן', 'beni@gmail.com', '050-000-0002', 'owner', 250, { town: 'טנא עומרים', fields: { city: 'טנא עומרים' }, createdAt: '2026-10-01T09:00:00.000Z' }),
  person(U.eliya, 41, 'אליה כהן', 'eliya@gmail.com', '052-000-0001', 'owner', 248),
  person(U.noa, 7, 'נועה שחר', 'noa.sh@gmail.com', '052-000-0007', 'manager', 245, { log: [{ at: ago(245 * 24), by: A.beni, text: 'תפקיד: מתנדב/ת ← מנהל/ת' }] }),
  person(U.roi, 19, 'רועי אלון', 'roi.alon@gmail.com', '052-000-0019', 'manager', 160),
  person(U.dana, 12, 'דנה אברהם', 'dana.av@gmail.com', '052-000-0012', 'manager', 215),
  person(U.yoav, 9, 'יואב פרץ', 'yoav.p@gmail.com', '052-000-0047', 'staff', 220, { town: 'אשל הנשיא', fields: { city: 'אשל הנשיא' } }),
  person(U.orly, 87, 'אורלי לוי', 'orly.l@gmail.com', '054-000-0087', 'staff', 70),
  person(U.omer, 44, 'עומר לוי', 'omer.levi@gmail.com', '050-000-0044', 'staff', 20),
  person(U.shira, 51, 'שירה גולן', 'shira.g@gmail.com', '052-000-0051', 'staff', 90),
  person(U.gil, 58, 'גיל ברק', 'gil.b@gmail.com', '054-000-0058', 'staff', 70),
  person(U.maya, 63, 'מאיה רוזן', 'maya.r@gmail.com', '050-000-0063', 'staff', 60),
  person(U.avi, 72, 'אבי נחום', 'avi.n@gmail.com', '052-000-0072', 'staff', 50),
  person(U.roni, 88, 'רוני לוי', 'roni.levi@gmail.com', '054-000-0088', 'guest', 70, { fields: { city: 'באר שבע', source: 'פייסבוק', receiptPreference: 'whatsapp' } }),
  person(U.david, 130, 'דוד כהן', 'david.c@gmail.com', '052-000-0130', 'guest', 40, { fields: { city: 'עומר', receiptPreference: 'email' } }),
  person(U.michal, 155, 'מיכל ברק', 'michal.b@gmail.com', '054-000-0155', 'guest', 30, { town: 'טנא עומרים', fields: { city: 'טנא עומרים' } }),
  person(U.yossi, 203, 'יוסי מזרחי', 'yossi.m@gmail.com', '052-000-0312', 'guest', 28, { status: 'blocked', notes: 'לא שילם פעמיים. חוב 80 ₪ מהפסטיבל הקודם.', log: [{ at: ago(6 * 24), by: A.beni, text: 'מצב: נחסם' }] }),
  person(U.ester, 310, 'אסתר כהן', 'ester.c@gmail.com', '050-000-0310', 'guest', 3),
  person(U.noam, 276, 'נועם אדרי', 'noam.a@gmail.com', '050-000-0276', 'guest', 12),
  person(U.rachel, 281, 'רחל שטרן', 'rachel.s@gmail.com', '050-000-0281', 'guest', 11),
  person(U.shirak, 260, 'שירה כץ', 'shira.k@gmail.com', '050-000-0260', 'guest', 10),
  person(U.naama, 199, 'נעמה כהנא', 'naama.k@gmail.com', '054-000-0199', 'guest', 25),
  person(U.raz, 402, 'רז כהן', 'raz.cheese@gmail.com', '052-000-0471', 'vendor', 40, { vendorId: 'demo-v-raz' }),
  person(U.tamar, 415, 'תמר כהן', 'tamar.c@gmail.com', '052-000-0472', 'vendor', 4, { vendorId: 'demo-v-raz', helper: true, addedBy: U.raz, createdAt: '2026-11-17T10:00:00.000Z' }),
];
// The people directory holds 155 people; the rest are plausible fictional guests.
const FIRST = ['אבי', 'אורית', 'איתי', 'אלון', 'אסף', 'בתיה', 'גלית', 'גדי', 'הדס', 'הילה', 'זיו', 'חן', 'טל', 'יעל', 'יונתן', 'יפית', 'כרמל', 'לירון', 'מאיר', 'מורן', 'מירב', 'משה', 'נגה', 'נדב', 'ניר', 'סיגל', 'עדי', 'עמית', 'ענבל', 'פזית', 'צחי', 'קרן', 'רונית', 'רותם', 'שגיא', 'שלומית', 'שני', 'תומר', 'תהל', 'אלה'];
const LAST = ['אזולאי', 'ביטון', 'גבאי', 'דהן', 'חדד', 'וקנין', 'זילברמן', 'טל', 'ישראלי', 'כהן', 'לוי', 'מלכה', 'נחמיאס', 'סויסה', 'עמר', 'פרידמן', 'צור', 'קפלן', 'רוזנברג', 'שושן', 'תורג׳מן', 'אוחיון', 'בן דוד', 'גולדשטיין'];
const fillers: Profile[] = Array.from({ length: 155 - named.filter((p) => p.role !== 'vendor').length }, (_, i) => {
  const name = `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 5 + 3) % LAST.length]}`;
  const n = 100 + i * 2 + (i % 3);
  return person(`demo-u-g${String(i + 1).padStart(3, '0')}`, n, name, `guest${i + 1}@example.test`, `05${i % 5}-000-${String(500 + i).padStart(4, '0')}`, 'guest', 200 - i);
});
export const profiles: Profile[] = [...named, ...fillers];
export const roleInvites: RoleInvite[] = [
  { id: 'omer.levi2@gmail.com', email: 'omer.levi2@gmail.com', role: 'staff', createdBy: A.beni, createdAt: ago(3 * 24) },
  { id: 'farm.ravve@gmail.com', email: 'farm.ravve@gmail.com', role: 'owner', createdBy: A.beni, createdAt: ago(60 * 24) },
];

// ---------- places ----------
const place = (id: string, name: string, lat: number, lng: number, by: Actor, days: number): Place => ({ id, name, lat, lng, createdBy: by, createdAt: ago(days * 24) });
export const P = { gate: 'demo-p-gate', container: 'demo-p-container', greenhouse: 'demo-p-greenhouse', petting: 'demo-p-petting', tree: 'demo-p-tree', pots: 'demo-p-pots', stall: 'demo-p-stall' };
export const places: Place[] = [
  place(P.gate, 'ליד הכניסה', 31.2412, 34.7301, A.beni, 240),
  place(P.container, 'מכולה ומחסן', 31.2408, 34.7312, A.eliya, 205),
  place(P.greenhouse, 'חממה', 31.2421, 34.7318, A.beni, 238),
  place(P.petting, 'פינת החי', 31.2415, 34.7325, A.beni, 240),
  place(P.tree, 'העץ מאחורי הביתן', 31.2418, 34.7309, A.beni, 210),
  place(P.pots, 'שורת העציצים הצפונית', 31.2425, 34.7298, A.beni, 240),
  place(P.stall, 'אזור הדוכן', 31.2410, 34.7304, A.noa, 150),
];
const loc = (id: keyof typeof P, placeName?: string) => { const p = places.find((x) => x.id === P[id])!; return { lat: p.lat, lng: p.lng, placeId: p.id, placeName: placeName || p.name }; };

// ---------- recurring templates ----------
const tpl = (id: string, title: string, note: string, days: number[], time: string, active: boolean, managersOnly: boolean, createdDays: number, o: Partial<Template> & { assignee?: Actor | null; placeId?: string } = {}): Template => ({ id, title, note, days, time, active, managersOnly, createdBy: A.beni, createdAt: ago(createdDays * 24), updatedAt: ago(createdDays * 24), ...o });
export const T = { gate: 'demo-tpl-gate', goats: 'demo-tpl-goats', pots: 'demo-tpl-pots', eggs: 'demo-tpl-eggs', petting: 'demo-tpl-petting', irrigation: 'demo-tpl-irrigation' };
export const templates: Template[] = [
  tpl(T.gate, 'פתיחת שער הכניסה', '', [], '06:30', true, false, 240, { assignee: A.beni }),
  tpl(T.goats, 'האכלת העיזים', 'חצי שק תערובת + מים נקיים.', [], '07:00', true, false, 240, { assignee: A.noa }),
  tpl(T.pots, 'השקיית שורת העציצים', '10 דקות לכל עציץ.', [0, 2, 4], '07:00', true, false, 230, { assignee: null, placeId: P.pots }),
  tpl(T.eggs, 'איסוף ביצים', '', [], '07:00', true, false, 200, { assignee: null }),
  tpl(T.petting, 'ניקוי פינת החי', '', [5], '09:00', true, false, 150, { assignee: null, placeId: P.petting }),
  tpl(T.irrigation, 'בדיקת מערכת ההשקיה', 'לעבור על כל הטפטפות.', [1], '', false, true, 180),
];

// ---------- tasks ----------
const task = (id: string, title: string, o: Partial<Task> = {}): Task => ({
  id, title, note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: A.beni, createdAt: ago(20), done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, updatedAt: ago(1), ...o,
});
const today = key(0);
const PHOTO = '/assets/rava-wayfinding.webp';
export const tasks: Task[] = [
  task('demo-t-toolbox', 'לסדר את ארגז הכלים במכולה', { location: loc('container', 'מאחורי המכולה'), assignee: A.yoav, createdBy: A.beni, createdAt: at(-1, '08:15'), takenAt: at(-1, '08:40'), dueDate: today, note: 'המקדח והמברגות חוזרים לארגז האדום. מה ששבור, לשים בצד.' }),
  task('demo-t-flag', 'להחליף את הדגל', { location: loc('gate'), urgent: true, photo: PHOTO, createdAt: ago(18), dueDate: today }),
  task('demo-t-branches', 'לגזום ענפים נמוכים', { location: loc('gate'), createdAt: ago(30), createdBy: A.eliya }),
  task('demo-t-compost', 'להעביר שקי קומפוסט לחממה', { location: loc('greenhouse'), assignee: A.yoav, createdBy: A.eliya, createdAt: ago(22), dueDate: today, takenAt: ago(21) }),
  task('demo-t-path', 'לפנות את השביל לחממה', { location: loc('greenhouse'), dueDate: '2026-12-04', createdAt: ago(26) }),
  task('demo-t-tap', 'לתקן את הברז ליד החממה', { location: loc('greenhouse'), assignee: A.yoav, createdBy: A.beni, createdAt: ago(20 / 60), dueDate: today, takenAt: ago(20 / 60) }),
  task('demo-t-tables', 'להכין את שולחנות הדוכן', { location: loc('stall'), assignee: A.noa, createdBy: A.beni, createdAt: ago(3 * 24), dueDate: '2026-11-27', eventId: 'demo-e-festival', shoppingId: 'demo-s-tablecloths', takenAt: ago(3 * 24 - 1) }),
  task('demo-t-signs', 'להדפיס שלטי כניסה ודוכן', { eventId: 'demo-e-festival', createdAt: ago(3 * 24), dueDate: '2026-11-27' }),
  task('demo-t-parking', 'לסמן חניות', { eventId: 'demo-e-festival', createdAt: ago(2 * 24), dueDate: '2026-11-28' }),
  task('demo-t-shade', 'לפרוס רשתות צל מעל פינת החי', { location: loc('petting'), assignee: A.yoav, done: true, doneBy: A.yoav, doneAt: at(0, '08:30'), donePhoto: PHOTO, createdAt: ago(48) }),
  task(`${T.goats}_${today}`, 'להאכיל את העיזים', { templateId: T.goats, dateKey: today, dueDate: today, location: loc('petting'), done: true, doneBy: A.noa, doneAt: at(0, '07:10'), createdAt: at(0, '00:05') }),
  task(`${T.pots}_${today}`, 'להשקות את שורת העציצים', { templateId: T.pots, dateKey: today, dueDate: today, location: loc('pots'), done: true, doneBy: A.dana, doneAt: at(0, '06:50'), donePhoto: PHOTO, createdAt: at(0, '00:05') }),
  task(`${T.gate}_${today}`, 'לפתוח את שער הכניסה', { templateId: T.gate, dateKey: today, dueDate: today, location: loc('gate'), done: true, doneBy: A.beni, doneAt: at(0, '06:30'), createdAt: at(0, '00:05') }),
];

// ---------- shopping ----------
const shop = (id: string, title: string, category: ShoppingItem['category'], o: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id, title, note: '', link: '', category, qty: '', urgent: false, createdBy: A.beni, createdAt: ago(20), bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: ago(1), ...o,
});
// lists: super = סופר, building = בניין, online = אינטרנט, giveaway = מחפשים (things we look for)
export const shopping: ShoppingItem[] = [
  shop('demo-s-milk', 'חלב 3%', 'super', { qty: '6 קרטונים', urgent: true, createdBy: A.dana, createdAt: at(0, '07:40'), note: 'רק טרי, לא עמיד. נגמר הבוקר.' }),
  shop('demo-s-bags', 'שקיות זבל גדולות', 'super', { qty: '2 חבילות', createdBy: A.yoav, createdAt: ago(26) }),
  shop('demo-s-coffee', 'קפה שחור', 'super', { qty: '1 ק״ג', createdBy: A.beni, createdAt: ago(30), note: 'מהסוג הגס' }),
  shop('demo-s-soap', 'סבון כלים', 'super', { createdBy: A.dana, createdAt: ago(40) }),
  shop('demo-s-tablecloths', 'מפות שולחן', 'super', { qty: '4', createdBy: A.noa, createdAt: ago(3 * 24), taskId: 'demo-t-tables' }),
  shop('demo-s-eggs', 'ביצים', 'super', { qty: '2 תבניות', createdBy: A.dana, createdAt: ago(28), bought: true, boughtBy: A.noa, boughtAt: at(0, '08:40'), expireAt: at(1, '08:40') }),
  shop('demo-s-bread', 'לחם', 'super', { qty: '3', createdBy: A.beni, createdAt: ago(28), bought: true, boughtBy: A.noa, boughtAt: at(0, '08:40'), expireAt: at(1, '08:40') }),
  shop('demo-s-screws', 'ברגים לגדר', 'building', { createdBy: A.eliya, createdAt: ago(50) }),
  shop('demo-s-cement', '2 שקי מלט לגדר', 'building', { urgent: true, createdBy: A.eliya, createdAt: ago(30) }),
  shop('demo-s-cabinet', 'ארון מתכת למחסן', 'giveaway', { createdBy: A.beni, createdAt: ago(10 * 24) }),
  shop('demo-s-fence', 'גדר רשת', 'giveaway', { qty: '20 מטר', createdBy: A.eliya, createdAt: ago(8 * 24) }),
  shop('demo-s-barrow', 'מריצה', 'giveaway', { createdBy: A.yoav, createdAt: ago(6 * 24) }),
  shop('demo-s-chairs', 'כיסאות פלסטיק', 'giveaway', { qty: '8', createdBy: A.beni, createdAt: ago(9 * 24), bought: true, boughtBy: A.dana, boughtAt: at(0, '09:10'), expireAt: at(1, '09:10'), foundWhere: 'אצל משפחת לוי' }),
  // history (S8)
  shop('demo-s-milk-prev', 'חלב 3%', 'super', { qty: '4 קרטונים', createdBy: A.dana, createdAt: ago(6 * 24), bought: true, boughtBy: A.noa, boughtAt: at(-4, '11:30') }),
  shop('demo-s-flour', 'קמח', 'super', { qty: '5 ק״ג', createdBy: A.noa, createdAt: ago(9 * 24), bought: true, boughtBy: A.dana, boughtAt: at(-7, '12:10') }),
  shop('demo-s-cement-prev', 'מלט', 'building', { qty: '4 שקים', createdBy: A.eliya, createdAt: ago(12 * 24), bought: true, boughtBy: A.dana, boughtAt: at(-1, '12:40') }),
  shop('demo-s-goatfood-prev', 'מזון לעיזים', 'super', { qty: '2 שקים', createdBy: A.noa, createdAt: ago(10 * 24), bought: true, boughtBy: A.yoav, boughtAt: at(-3, '10:00') }),
];

// ---------- events ----------
const ev = (id: string, title: string, o: Partial<FarmEvent>): FarmEvent => ({
  id, title, description: '', image: '', location: 'חוות רווה, ליד טנא עומרים', start: '', end: '', price: 0, maxPerOrder: 5, capacity: 0, open: true, published: true, questions: [], createdBy: A.beni, createdAt: ago(30 * 24), updatedAt: ago(24), ...o,
});
export const E = { fall: 'demo-e-festival', tour: 'demo-e-tour', hanukkah: 'demo-e-hanukkah', oct: 'demo-e-october', rosh: 'demo-e-rosh', summer: 'demo-e-summer', shavuot: 'demo-e-shavuot' };
export const events: FarmEvent[] = [
  ev(E.fall, 'פסטיבל הסתיו', { description: 'אחר צהריים של סתיו בחווה: דוכני תוצרת ואומנות, סיורים מודרכים בין העצים, פינת חי לילדים ומוזיקה חיה עם השקיעה. דוכן החווה פתוח כל הערב.', image: '/assets/rava-sunset.webp', start: at(SAT1, '16:00'), end: at(SAT1, '21:00'), price: 50, maxPerOrder: 5, capacity: 300, questions: [{ id: 'kids', label: 'מגיעים עם ילדים?', required: false }], entry: true, stall: true, publishedAt: ago(6 * 24), updatedAt: ago(1) }),
  ev(E.tour, 'סיור שבת בחווה', { description: 'סיור מודרך של שעתיים בין העצים, הדיר והחממה. מתאים למשפחות. נפגשים בשער.', start: at(SAT2, '10:00'), end: at(SAT2, '12:00'), price: 0, maxPerOrder: 6, capacity: 60, entry: false, stall: false, publishedAt: ago(4) }),
  ev(E.hanukkah, 'ערב חנוכה', { description: '', start: at(SAT3, '17:00'), end: at(SAT3, '20:00'), price: 40, published: false, open: false }),
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
  ...order(E.fall, pr(U.michal), 1, 'pending', at(0, '11:07')),
];

// ---------- visits ----------
const visit = (id: string, p: Profile, date: string, people: number, type: string, note: string, status: Visit['status'], o: Partial<Visit> = {}): Visit => ({
  id, uid: p.uid, name: p.displayName, phone: p.phone, date, people, type, note, status, managerNote: '', handledBy: null, createdAt: ago(48), updatedAt: ago(48), ...o,
});
export const visits: Visit[] = [
  visit('demo-vi-cohen', pr(U.ester), key(FRI), 8, 'סיור בחווה', 'סבא וסבתא עם הנכדים, מעדיפים בוקר. הנכד הקטן אלרגי לאגוזים.', 'new', { name: 'משפחת כהן', createdAt: ago(0.7), updatedAt: ago(0.7) }),
  visit('demo-vi-kindergarten', { ...pr(U.noam), displayName: 'גן ילדים "רימון"', phone: '052-000-0712' } as Profile, key(THU), 24, 'מפגש קבוצתי', 'ילדי הגן הבוגר, 24 ילדים ו־4 מלוות.', 'approved', { managerNote: 'להכין את פינת החי', handledBy: A.beni, createdAt: ago(5 * 24), updatedAt: ago(26) }),
  visit('demo-vi-photo', { ...pr(U.naama), displayName: 'חוג צילום באר שבע', phone: '054-000-0740' } as Profile, key(FRI - 3), 12, 'סיור בחווה', 'שעת שקיעה אם אפשר.', 'approved', { managerNote: 'שעת שקיעה', handledBy: A.noa, createdAt: ago(6 * 24), updatedAt: ago(4 * 24) }),
  visit('demo-vi-rachel', { ...pr(U.orly), displayName: 'יום הולדת 60 לרחל', phone: '050-000-0633' } as Profile, key(FRI + 7), 30, 'אירוע פרטי', 'ארוחת צהריים בחוץ, 30 אנשים.', 'approved', { managerNote: 'אירוע פרטי · 11:00', handledBy: A.beni, createdAt: ago(9 * 24), updatedAt: ago(8 * 24) }),
  visit('demo-vi-couple', { ...pr(U.shirak), displayName: 'זוג מתל אביב', phone: '053-000-0981' } as Profile, key(-2), 2, 'סיור בחווה', '', 'rejected', { managerNote: 'אין סיורים ביום ראשון', handledBy: A.noa, createdAt: ago(4 * 24), updatedAt: ago(3 * 24) }),
  visit('demo-vi-levi', { ...pr(U.roni), displayName: 'משפחת לוי' } as Profile, key(-10), 6, 'סיור בחווה', '', 'approved', { managerNote: 'הגיעו · קנו בדוכן', handledBy: A.beni, createdAt: ago(15 * 24), updatedAt: ago(14 * 24) }),
];

// ---------- donations ----------
const don = (id: string, p: Profile, amount: number, label: string, createdAt: string, o: Partial<Donation> = {}): Donation => ({
  id, uid: p.uid, name: p.displayName, phone: p.phone, amount, label, note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'paid', createdAt, updatedAt: createdAt, ...o,
});
export const donations: Donation[] = [
  don('demo-d-michal', pr(U.michal), 180, 'עשר פעמים חי', at(0, '10:30'), { memorial: 'יוסף ברק', note: 'סבא שלי, שאהב את הנגב.', receiptWanted: true, receiptName: 'מיכל ברק', paymentStatus: 'claimed' }),
  don('demo-d-noam', pr(U.noam), 360, 'לב', at(-2, '12:00'), { receiptWanted: true, receiptName: 'נועם אדרי' }),
  don('demo-d-rachel', pr(U.rachel), 18, 'חי', at(-3, '12:00'), { receiptWanted: true, receiptName: 'רחל שטרן' }),
  don('demo-d-orly', pr(U.orly), 18, 'חי', at(-8, '12:00')),
  don('demo-d-david', pr(U.david), 180, 'עשר פעמים חי', at(-9, '12:00'), { receiptWanted: true, receiptName: 'דוד כהן', receiptSent: true }),
  don('demo-d-anon', { ...pr(U.gil), displayName: 'אנונימי', phone: '' } as Profile, 360, 'לב', at(-10, '12:00'), { note: 'בשביל העצים' }),
  don('demo-d-shirak', pr(U.shirak), 52, 'סכום חופשי', at(-10, '12:00')),
  don('demo-d-oct1', pr(U.roni), 100, 'סכום חופשי', at(-24, '18:00')),
  don('demo-d-oct2', pr(U.ester), 180, 'עשר פעמים חי', at(-24, '19:00')),
  don('demo-d-sep', pr(U.noam), 360, 'לב', at(-40, '12:00')),
];

// ---------- automatic payment-confirmation email (the Worker's outbox) ----------
const emailOutbox = [
  { id: 'donation_demo-d-david', kind: 'donation', col: 'donations', refId: 'demo-d-david', uid: U.david, status: 'sent', to: 'david.c@gmail.com', messageId: '<demo@smtp-relay.mailin.fr>', attempts: 1, sentAt: at(-9, '12:05'), createdAt: at(-9, '12:00'), updatedAt: at(-9, '12:05') },
  { id: 'donation_demo-d-oct1', kind: 'donation', col: 'donations', refId: 'demo-d-oct1', uid: U.roni, status: 'skipped', reason: 'whatsapp', attempts: 1, createdAt: at(-24, '18:00'), updatedAt: at(-24, '18:05') },
];

// ---------- vendors (pool) ----------
const vendor = (id: string, name: string, phone: string, product: string, o: Partial<VendorV2> = {}): VendorV2 => ({ id, name, phone, product, external: true, notes: '', createdAt: ago(200 * 24), updatedAt: ago(10 * 24), ...o });
export const V = { raz: 'demo-v-raz', dana: 'demo-v-dana', farm: 'demo-v-farm', bakery: 'demo-v-bakery', honey: 'demo-v-honey', jewel: 'demo-v-jewel', winery: 'demo-v-winery', oil: 'demo-v-oil', herbs: 'demo-v-herbs' };
export const vendors: VendorV2[] = [
  vendor(V.raz, 'גבינות משק רז', '052-000-0471', 'גבינות עיזים, יוגורט', { contact: 'רז כהן', sells: 'גבינות עיזים, יוגורט', needs: ['table', 'power', 'shade'], note: 'מגיע עם מקרר. מעדיף מקום בצל, ליד הכניסה.', notes: 'מגיע עם מקרר. מעדיף מקום בצל, ליד הכניסה.', events: ['demo-e-festival', 'demo-e-october', 'demo-e-rosh'], inviteNext: true,
    people: [{ uid: U.raz, name: 'רז כהן', phone: '052-000-0471', role: 'owner', entered: true }, { uid: U.tamar, name: 'תמר כהן', phone: '052-000-0472', role: 'helper', entered: false, addedAt: '2026-11-17' }] }),
  vendor(V.dana, 'קרמיקה של דנה', '054-000-0605', 'כלי חרס', { contact: 'דנה לב', sells: 'כלי חרס', needs: ['table'], events: ['demo-e-festival', 'demo-e-october'] }),
  vendor(V.farm, 'דוכן החווה', '', 'לימונדה, עוגות, זיתים', { external: false, sells: 'לימונדה, עוגות, זיתים', events: ['demo-e-festival', 'demo-e-october', 'demo-e-rosh'] }),
  vendor(V.bakery, 'מאפים של סבתא', '052-000-0604', 'מאפים', { contact: 'מרים', sells: 'מאפים', needs: ['table', 'shade'], events: ['demo-e-festival'] }),
  vendor(V.honey, 'דבש הגבעה', '054-000-0602', 'דבש ושעווה', { contact: 'יאיר', sells: 'דבש ושעווה', needs: ['table'], events: ['demo-e-festival', 'demo-e-october'] }),
  vendor(V.jewel, 'תכשיטי המדבר', '052-000-0520', 'תכשיטים', { contact: 'שירן', sells: 'תכשיטים', needs: ['table', 'power'], events: ['demo-e-festival'] }),
  vendor(V.winery, 'יקב הר', '050-000-0603', 'יין', { contact: 'עמרי', sells: 'יין', events: ['demo-e-october'] }),
  vendor(V.oil, 'שמן זית בן־עמי', '050-000-0606', 'שמן זית', { contact: 'יוסף בן־עמי', sells: 'שמן זית' }),
  vendor(V.herbs, 'צמחי מרפא נגב', '053-000-0607', 'תה וצמחים', { contact: 'אורנה', sells: 'תה וצמחים', events: ['demo-e-october'] }),
];
const ev2 = (v: VendorV2, o: Partial<EventVendorV2>): EventVendorV2 => ({ id: v.id, vendorId: v.id, name: v.name, confirmed: o.status === 'confirmed', notes: '', status: 'invited', invitedAt: at(-7, '10:00'), answeredAt: null, sells: v.sells, needs: v.needs || [], people: 2, vehicle: '', note: '', spot: null, spotNote: '', arrivedAt: null, feedback: null, ...o });
const vById = (id: string) => vendors.find((v) => v.id === id)!;
export const eventVendors: Record<string, EventVendorV2[]> = {
  [E.fall]: [
    ev2(vById(V.raz), { status: 'confirmed', answeredAt: at(-6, '19:20'), spot: 3, spotNote: 'ליד הכניסה, בצל · עם חשמל', people: 2, vehicle: 'טנדר', note: 'מגיע עם מקרר' }),
    ev2(vById(V.dana), { status: 'confirmed', answeredAt: at(-5, '09:00'), spot: 5 }),
    ev2(vById(V.farm), { status: 'confirmed', answeredAt: at(-7, '10:00'), spot: 1 }),
    ev2(vById(V.jewel), { status: 'confirmed', answeredAt: at(-4, '12:00'), spot: 6 }),
    ev2(vById(V.honey), { status: 'invited', spot: 4 }),
    ev2(vById(V.bakery), { status: 'invited', spot: 2 }),
  ],
  [E.oct]: [
    ev2(vById(V.raz), { status: 'confirmed', spot: 2, feedback: { rating: 5, text: '', inviteNext: true, at: at(-23, '10:00') } }),
    ev2(vById(V.dana), { status: 'confirmed', spot: 4 }),
    ev2(vById(V.honey), { status: 'confirmed', spot: 3 }),
    ev2(vById(V.herbs), { status: 'confirmed', spot: 5 }),
    ev2(vById(V.winery), { status: 'confirmed', spot: 6 }),
    ev2(vById(V.farm), { status: 'confirmed', spot: 1 }),
  ],
  [E.rosh]: [ev2(vById(V.raz), { status: 'confirmed', spot: 1 }), ev2(vById(V.farm), { status: 'confirmed', spot: 2 })],
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
  tab('demo-tab-noam-empty-fall', E.fall, pr(U.noam), [], 'open', at(-1, '12:00'), A.yoav),
  tab('demo-tab-michal-unpaid-summer', E.summer, pr(U.michal), [tabItem('demo-pr-tea', 2, at(-122, '18:20'), A.yoav)], 'open', at(-122, '18:20'), A.yoav),
];

// ---------- notifications (manager queue) ----------
const notif = (id: string, type: AppNotification['type'], title: string, text: string, link: string, refId: string, createdAt: string, handled: { by: Actor; at: string } | null = null): AppNotification => ({ id, type, title, text, link, refId, createdAt, handled: !!handled, handledBy: handled?.by || null, handledAt: handled?.at || null });
export const notifications: AppNotification[] = [
  notif('demo-n-contact', 'contact', 'יש חניה נגישה?', 'נגיע לפסטיבל הסתיו ונשמח לדעת איפה כדאי לחנות.', '/manage/inbox', U.michal, ago(0.4)),
  notif('demo-n-visit', 'visit', 'בקשת ביקור חדשה', 'משפחת כהן · 8 אנשים · סיור בחווה', '/manage/visits/demo-vi-cohen', 'demo-vi-cohen', ago(0.7)),
  notif('demo-n-donation', 'donation', 'תרומה · 180 ₪ · מיכל ברק', 'הועבר, ממתין לאישור · לזכר יוסף ברק · צריכה קבלה', '/manage/donations/demo-d-michal', 'demo-d-michal', ago(1)),
  notif('demo-n-tab', 'tab', 'תשלום דוכן הועבר: יריד אוקטובר', 'רוני לוי · 46 ₪', `/manage/events/${E.oct}/tabs/demo-tab-roni-oct`, 'demo-tab-roni-oct', at(-1, '20:14')),
  notif('demo-n-order-michal', 'order', 'הזמנה חדשה: פסטיבל הסתיו', 'מיכל ברק הזמינה 3 כרטיסים', `/manage/events/${E.fall}/guests`, 'demo-o-2', at(0, '10:12'), { by: A.beni, at: at(0, '10:13') }),
  notif('demo-n-order-roni', 'order', 'הזמנה חדשה: פסטיבל הסתיו', 'רוני לוי הזמינה 3 כרטיסים', `/manage/events/${E.fall}/guests`, 'demo-o-1', at(0, '09:48'), { by: A.beni, at: at(0, '09:50') }),
  notif('demo-n-visit-kg', 'visit', 'בקשת ביקור חדשה', 'גן ילדים "רימון" · 24', '/manage/visits/demo-vi-kindergarten', 'demo-vi-kindergarten', ago(5 * 24), { by: A.beni, at: ago(26) }),
  notif('demo-n-don-noam', 'donation', 'תרומה חדשה', 'נועם אדרי · 360 ₪', '/manage/donations/demo-d-noam', 'demo-d-noam', at(-2, '12:00'), { by: A.noa, at: at(-2, '13:00') }),
  notif('demo-n-receipt-noam', 'receipt', 'בקשה לקבלה', 'נועם אדרי · 360 ₪', '/manage/donations/demo-d-noam', 'demo-d-noam', at(-2, '12:00'), { by: A.beni, at: at(-2, '15:00') }),
  notif('demo-n-claim-david', 'claim', 'תשלום הועבר: פסטיבל הסתיו', 'דוד כהן סימן שהעביר תשלום על 4 כרטיסים', `/manage/events/${E.fall}/guests`, 'demo-o-3', at(-1, '21:05'), { by: A.beni, at: at(0, '08:30') }),
];

// ---------- calendar ----------
const cal = (id: string, owner: Actor, title: string, date: string, time: string, kind: CalendarItem['kind'] = 'manual', refId = ''): CalendarItem => ({ id, ownerUid: owner.uid, ownerName: owner.name, title, date, time, kind, refId, createdAt: ago(48) });
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 2, 12);
const nextMonthPresenceDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-02`;
export const calendar: CalendarItem[] = [
  cal('demo-c-1', A.eliya, 'אליה בחווה', key(0), '09:00–14:00'),
  cal('demo-c-2', A.beni, 'בני בחווה', key(1), '08:00–13:00'),
  cal('demo-c-3', A.noa, 'ספק מגיע', key(-1), '11:00'),
  cal('demo-c-4', A.beni, 'פגישת צוות לפני הפסטיבל', key(0), '10:30–11:30', 'meeting'),
  cal('demo-c-5', A.noa, 'הכנות לפסטיבל', key(0), '', 'planning'),
  cal('demo-c-6', A.eliya, 'אליה בחווה', key(8), '09:00–14:00'),
  cal('demo-c-7', A.eliya, 'אליה בחווה', key(FRI), ''),
  cal('demo-c-8', A.beni, 'בני בחווה', key(15), ''),
  cal('demo-c-presence-yoav', A.yoav, 'יואב בחווה', key(0), '08:00–11:00', 'presence'),
  cal('demo-c-presence-yoav-later', A.yoav, 'יואב בחווה אחר הצהריים', key(0), '15:00–17:00', 'presence'),
  cal('demo-c-presence-dana', A.dana, 'דנה בחווה', key(0), '08:30–13:30', 'presence'),
  cal('demo-c-presence-noa', A.noa, 'נועה בחווה', key(0), '10:00–14:00', 'presence'),
  cal('demo-c-presence-beni', A.beni, 'בני בחווה', key(0), '', 'presence'),
  cal('demo-c-presence-yoav-next-month', A.yoav, 'יואב בחווה', nextMonthPresenceDate, '09:00–12:00', 'presence'),
  cal('visit_demo-vi-kindergarten', A.beni, 'ביקור: גן ילדים "רימון" · 24', key(THU), '09:30', 'visit', 'demo-vi-kindergarten'),
  cal('visit_demo-vi-photo', A.noa, 'ביקור: חוג צילום באר שבע · 12', key(FRI - 3), 'שקיעה', 'visit', 'demo-vi-photo'),
  cal('visit_demo-vi-rachel', A.beni, 'אירוע פרטי: יום הולדת 60 לרחל · 30', key(FRI + 7), '11:00', 'visit', 'demo-vi-rachel'),
  cal(`event_${E.fall}`, A.beni, 'פסטיבל הסתיו', key(SAT1), '16:00–21:00', 'event', E.fall),
  cal(`event_${E.tour}`, A.beni, 'סיור שבת בחווה', key(SAT2), '10:00–12:00', 'event', E.tour),
];

// ---------- activity ----------
let aseq = 0;
const act = (kind: Activity['kind'], refId: string, action: string, text: string, by: Actor, atIso: string, extra: { subjectUid?: string; eventId?: string } = {}): Activity => ({ id: `demo-a-${++aseq}`, kind, refId, action, text, by, at: atIso, subjectUid: extra.subjectUid || '', eventId: extra.eventId || '' });
export const activity: Activity[] = [
  act('task_private', 'demo-task-irrigation', 'created', 'תיאום טיפול במערכת ההשקיה', A.beni, ago(30)),
  act('shopping', 'demo-s-milk', 'edited', 'סימנה דחוף: חלב 3% · 6 קרטונים', A.dana, at(0, '10:40')),
  act('donation', 'demo-d-michal', 'claimed', '180 ₪ · לזכר יוסף ברק', A.michal, at(0, '10:31'), { subjectUid: U.michal }),
  act('donation', 'demo-d-michal', 'created', '180 ₪ · לזכר יוסף ברק', A.michal, at(0, '10:30'), { subjectUid: U.michal }),
  act('visit', 'demo-vi-cohen', 'requested', '8 אנשים · סיור בחווה · מהאתר', A.ester, at(0, '10:20'), { subjectUid: U.ester }),
  act('ticket', 'demo-o-2', 'ordered', '3 כרטיסים · פסטיבל הסתיו · שולם', A.michal, at(0, '10:12'), { subjectUid: U.michal, eventId: E.fall }),
  act('ticket', 'demo-o-1', 'ordered', '3 כרטיסים · פסטיבל הסתיו · ממתין לתשלום · 150 ₪', A.roni, at(0, '09:48'), { subjectUid: U.roni, eventId: E.fall }),
  act('task', `${T.pots}_${today}`, 'done', 'להשקות את שורת העציצים', A.dana, at(0, '06:50')),
  act('shopping', 'demo-s-eggs', 'bought', 'ביצים · 2 תבניות', A.noa, at(0, '08:40')),
  act('shopping', 'demo-s-bread', 'bought', 'לחם · 3', A.noa, at(0, '08:40')),
  act('ticket', 'demo-o-3', 'paid', 'דוד כהן · פסטיבל הסתיו · 200 ₪ · 4 כרטיסים', A.beni, at(0, '08:30'), { subjectUid: U.david, eventId: E.fall }),
  act('task', `${T.goats}_${today}`, 'done', 'האכלת העיזים', A.yoav, at(0, '07:45')),
  act('task', `${T.gate}_${today}`, 'done', 'פתיחת השער ובדיקת הברזים', A.noa, at(0, '07:10')),
  act('task', 'demo-t-flag', 'edited', 'סומנה דחוף: להחליף את הדגל ליד הכניסה', A.beni, at(0, '07:02')),
  act('ticket', 'demo-o-3', 'claimed', '4 כרטיסים · פסטיבל הסתיו · 200 ₪', A.david, at(-1, '21:05'), { subjectUid: U.david, eventId: E.fall }),
  act('tab', 'demo-tab-roni-oct', 'claimed', '46 ₪ · יריד אוקטובר', A.roni, at(-1, '20:14'), { subjectUid: U.roni, eventId: E.oct }),
  act('event', E.fall, 'edited', 'יקב הר אישרו הגעה', A.beni, at(-1, '18:40'), { eventId: E.fall }),
  act('task', 'demo-t-flag', 'photo', 'להחליף את הדגל ליד הכניסה', A.beni, at(-1, '18:21')),
  act('task', 'demo-t-flag', 'created', 'להחליף את הדגל ליד הכניסה, עם תמונה ומיקום', A.beni, at(-1, '18:20')),
  act('task', 'demo-task-done-tools', 'done', 'סידור ארגז הכלים במכולה, עם תמונה · "המקדח במדף העליון"', A.eliya, at(-1, '16:20')),
  act('event', E.fall, 'edited', 'הועתקו 8 מוצרים מיריד אוקטובר', A.noa, at(-1, '16:12'), { eventId: E.fall }),
  act('event', E.fall, 'edited', 'התיאור והתמונה עודכנו', A.beni, at(-1, '15:50'), { eventId: E.fall }),
  act('user', 'omer.levi2@gmail.com', 'invited', 'omer.levi2@gmail.com הוגדר/ה מראש כצוות', A.beni, at(-1, '12:05')),
  act('task', `${T.pots}_${key(-1)}`, 'done', 'השקיית העציצים בשורה הצפונית', A.yoav, at(-1, '09:05')),
  act('task', 'demo-task-done-fence-buy', 'done', 'קניית חומרי בניין לגדר', A.dana, at(-1, '12:40')),
  act('ticket', 'demo-o-9', 'cancelled', 'יוסי מזרחי · 2 כרטיסים · פסטיבל הסתיו · "לא שילם פעמיים"', A.beni, at(-6, '11:20'), { subjectUid: U.yossi, eventId: E.fall }),
  act('user', U.yossi, 'blocked', 'יוסי מזרחי נחסם/ה', A.beni, at(-6, '11:22'), { subjectUid: U.yossi }),
  act('event', E.fall, 'published', 'פסטיבל הסתיו', A.beni, at(-6, '09:00'), { eventId: E.fall }),
  act('visit', 'demo-vi-kindergarten', 'approved', 'גן ילדים "רימון" · להכין את פינת החי', A.beni, ago(26), { subjectUid: U.noam }),
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
  act('place', P.stall, 'created', 'אזור הדוכן', A.noa, ago(150 * 24)),
];

// ---------- settings ----------
export const settings: Settings = {
  ...DEFAULT_SETTINGS,
  payment: { bit: '050-000-0000', paybox: 'payboxapp.com/ravve', cash: true, note: 'בהעברה לציין את שם האירוע ושם המזמין' },
  contact: { whatsapp: '050-000-0642', phone: '08-000-0642' },
  registrationFields: [
    { id: 'city', label: 'יישוב', type: 'text', options: [], required: true },
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
  users: profiles, role_invites: roleInvites, tasks, task_templates: templates, shopping, places, events, tickets, visits, donations, vendors, tabs, notifications, calendar, activity, email_outbox: emailOutbox,
  ...Object.fromEntries(Object.entries(eventVendors).map(([eid, v]) => [`events/${eid}/vendors`, v])),
  ...Object.fromEntries(Object.entries(products).map(([eid, p]) => [`events/${eid}/products`, p])),
};
export const documents: Record<string, unknown> = {
  'settings/app': settings,
  'cms_admins/beni@gmail.com': { email: 'beni@gmail.com', uid: U.beni, role: 'editor', active: true, created_at: ago(24) },
};
