// What "run any operation" needs to know about the API's operations, beyond the catalog itself (K15): their names and
// fields in Hebrew, where a record's answer is read from, the record's place in the app, and which operation undoes which.
import { ddmm } from '../../app/v2/format';
import { nowMs } from '../../app/clock';
import { fieldLabel, valueText } from '../labels';
import { fmt } from '../shared';
import type { CatalogOp, CatalogParam } from '../source';

const LATIN = /[A-Za-z]/;

/* ───────── operations ───────── */
/** The everyday ones, in front; the rest open on demand, by a filter or by searching. */
export const COMMON = ['tasks.list', 'tasks.get', 'tasks.create', 'shopping.list', 'shopping.add', 'people.search', 'overview.get', 'farm.overview'];
const TEXT: Record<string, [string, string]> = {
  'tasks.list': ['רשימת משימות', 'כל המשימות, ואפשר לסנן לפי אחראי, תאריך, מקום ומצב.'],
  'tasks.get': ['משימה אחת', 'כל הפרטים של משימה אחת.'],
  'tasks.create': ['יצירת משימה חדשה', 'יוצרת משימה, ואפשר לשייך אותה מיד למישהו.'],
  'shopping.list': ['רשימת הקניות', 'מה שעוד לא נקנה, או מה שנקנה ביממה האחרונה.'],
  'shopping.add': ['הוספת פריט לקניות', 'מוסיפה פריט לרשימת הקניות. פריט דחוף מגיע כהתראה לכל הצוות.'],
  'people.search': ['חיפוש אדם לפי שם', 'מחזיר את אנשי הצוות שהשם שלהם מתאים.'],
  'overview.get': ['מבט כללי על החווה', 'משימות, קניות ואירועים קרובים במספרים.'],
  'farm.overview': ['מבט כללי על החווה', 'משימות, קניות, אירועים קרובים, ביקורים ותשלומים במספרים.'],
};
const ONE = /\s*\(רשומה אחת לפי מזהה\)\s*$/;
/** A short name: the catalog's line up to its first detail. */
export function opTitle(o: CatalogOp): string {
  if (TEXT[o.name]) return TEXT[o.name][0];
  const one = ONE.test(o.he);
  const text = o.he.replace(ONE, '');
  const head = text.split(/[:;(.,]/)[0].trim();
  return (head.length > 3 ? head : text) + (one ? ' · רשומה אחת' : '');
}
export function opAbout(o: CatalogOp): string {
  if (TEXT[o.name]) return TEXT[o.name][1];
  const text = o.he.replace(ONE, '').trim();
  if (text !== opTitle(o) && !LATIN.test(text) && !ONE.test(o.he)) return text.replace(/\.?$/, '.');
  return o.kind === 'write' ? 'משנה נתונים של החווה.' : 'רק קוראת, לא משנה כלום.';
}
const GROUPS: [string, string[]][] = [
  ['משימות', ['tasks', 'templates', 'projects']],
  ['קניות', ['shopping', 'shoppingTrips']],
  ['אנשים', ['people', 'profiles', 'roleInvites', 'invites', 'joinCodes', 'accountDeletions']],
  ['אירועים', ['events', 'eventStaffing', 'eventFiles', 'eventScans', 'eventCounters', 'eventProducts', 'gate']],
  ['כרטיסים ותשלומים', ['tickets', 'tabs', 'donations', 'payments', 'emailOutbox']],
  ['בעלי דוכנים', ['vendors', 'vendorInvites', 'vendorRequests', 'eventVendors', 'eventVendorRequests', 'eventVendorInfo']],
  ['ביקורים ויומן', ['visits', 'calendar', 'presence']],
  ['הודעות והתראות', ['broadcasts', 'broadcastReads', 'notifications', 'me']],
  ['מקומות', ['places']],
];
export function groupOps(ops: CatalogOp[]): { title: string; ops: CatalogOp[] }[] {
  const of = (o: CatalogOp) => GROUPS.find(([, p]) => p.includes(o.name.split('.')[0]))?.[0] || 'כללי';
  return [...GROUPS.map(([t]) => t), 'כללי'].map((title) => ({ title, ops: ops.filter((o) => of(o) === title) })).filter((g) => g.ops.length);
}

/* ───────── fields ───────── */
export type Where = 'path' | 'query' | 'body';
export type OpField = { key: string; p: CatalogParam; where: Where };
export const fieldsOf = (op: CatalogOp): OpField[] => [
  ...Object.entries(op.pathParams || {}).map(([key, p]) => ({ key, p, where: 'path' as const })),
  ...Object.entries((op.method === 'GET' ? op.params : op.body) || {}).map(([key, p]) => ({ key, p, where: (op.method === 'GET' ? 'query' : 'body') as Where })),
];
const FIELD: Record<string, string> = {
  title: 'כותרת', assignee: 'על מי', dueDate: 'עד מתי', placeId: 'מקום', urgent: 'דחוף', note: 'הערה', managersOnly: 'למנהלים בלבד', eventId: 'אירוע', q: 'שם או תחילת שם', date: 'תאריך',
  done: 'בוצעו', templateId: 'משימה קבועה', doneFrom: 'בוצעו מתאריך', doneTo: 'בוצעו עד תאריך', overdue: 'רק באיחור', limit: 'כמה להביא', cursor: 'המשך מהעמוד הקודם', countOnly: 'רק לספור', taskId: 'משימה',
  release: 'לשחרר (בלי אחראי)', ifUpdatedAt: 'רק אם לא השתנתה מאז', donePhoto: 'תמונת ביצוע (קישור)', doneNote: 'הערת ביצוע', bought: 'נקנה', category: 'איפה קונים', qty: 'כמות', link: 'קישור', photo: 'תמונה (קישור)',
  itemId: 'פריט', tripId: 'קנייה', hours: 'שעות', active: 'פעיל', role: 'תפקיד', status: 'מצב', published: 'מפורסם לאורחים', open: 'פתוח להרשמה', startFrom: 'מתחיל מתאריך', startTo: 'מתחיל עד תאריך', orderId: 'הזמנה',
  ownerUid: 'של מי', paymentStatus: 'מצב התשלום', uid: 'אדם', dateFrom: 'מתאריך', dateTo: 'עד תאריך', receiptWanted: 'ביקש קבלה', receiptSent: 'הקבלה נשלחה', external: 'ספק חיצוני', vendorId: 'בעל דוכן', result: 'תוצאה',
  guestUid: 'האורח', handled: 'טופל', type: 'סוג', kind: 'סוג', audience: 'מי רואה', broadcastId: 'הודעה', refId: 'הרשומה שעליה', subjectUid: 'האדם שהפעולה עליו', byUid: 'מי ביצע', action: 'הפעולה', clearDueDate: 'להסיר את התאריך',
  clearPlace: 'להסיר את המקום', clearEvent: 'לנתק מהאירוע', clearAssignee: 'בלי אחראי', days: 'ימים בשבוע (0 ראשון, 6 שבת)', time: 'שעה', name: 'שם', lat: 'קו רוחב', lng: 'קו אורך', accuracy: 'דיוק במטרים', notes: 'הערות', email: 'מייל',
  description: 'תיאור לאורחים', location: 'מקום', start: 'התחלה', end: 'סיום', price: 'מחיר', maxPerOrder: 'עד כמה כרטיסים בהזמנה', capacity: 'מקומות', entry: 'כניסה בסריקה בשער', stall: 'דוכן החווה', questions: 'שאלות בהרשמה',
  questionsRequired: 'אילו שאלות חובה', image: 'תמונה לאירוע (קישור)', productId: 'מוצר', unit: 'יחידת מכירה', sort: 'סדר תצוגה', reason: 'סיבה', ticketId: 'כרטיס', guestName: 'שם האורח', guestPhone: 'הטלפון של האורח', tabId: 'חשבון דוכן',
  items: 'כמה מוצרים בבת אחת', index: 'המקום של הפריט ברשימה', visitId: 'ביקור', managerNote: 'הערה למבקר', donationId: 'תרומה', sent: 'נשלחה', notificationId: 'התראה', guestIntro: 'משפט הפתיחה לאורחים', visitTypes: 'סוגי ביקור',
  paymentBit: 'מספר לביט', paymentPaybox: 'קישור ל־PayBox', paymentCash: 'מזומן בשער', paymentNote: 'שורה ליד התשלום', donationPresets: 'סכומי תרומה', donationCustom: 'לאפשר סכום אחר', donationMemorial: 'שדה הנצחה',
  donationReceipt: 'בקשת קבלה', msgVisitApproved: 'הודעה: אישור ביקור', msgDonationThanks: 'הודעה: תודה על תרומה', msgDebtReminder: 'הודעה: תזכורת חוב', msgPaymentConfirmation: 'הודעה: אישור תשלום', msgTicketReminder: 'הודעה: תזכורת לאירוע',
  msgVendorInvite: 'הודעה: הזמנת בעל דוכן', contactPhone: 'טלפון החווה', contactWhatsapp: 'וואטסאפ החווה', contactEmail: 'מייל לפניות', contactAddress: 'כתובת', contactInquiries: 'לקבל פניות מהאתר', dates: 'הימים', from: 'משעה', to: 'עד שעה',
  participants: 'משתתפים', reminder: 'להזכיר שעה לפני', allDay: 'כל היום', text: 'ההודעה', preview: 'רק לראות למי יגיע', ids: 'אילו התראות', all: 'כל מה שלא נקרא', uids: 'למי', sub: 'טקסט', push: 'גם בטלפון', fieldId: 'שאלה קיימת',
  label: 'השאלה', options: 'אפשרויות', required: 'חובה', order: 'הסדר החדש', missing: 'לא היה בחנות', list: 'איזו רשימה', deadline: 'עד מתי', steps: 'הצעדים', projectId: 'פרויקט', stepId: 'צעד', titles: 'שמות הצעדים', due: 'עד מתי',
  clearDue: 'להסיר את התאריך', productIds: 'המוצרים בסדר החדש', fromEventId: 'האירוע שממנו', url: 'קישור', fileId: 'קובץ', legacyIndex: 'קישור ישן: המקום ברשימה', station: 'עמדה', stationName: 'שם העמדה', needed: 'כמה צריך בעמדה', phone: 'טלפון',
  count: 'כמה', paid: 'שילם', collection: 'על מה', pay: 'תשלום בשער', entries: 'כניסות כפי שנקרא', meta: 'פירוט', scanId: 'כניסה שנדחתה', which: 'איפה', amount: 'סכום', by: 'מי ספר', contact: 'איש קשר', sells: 'מה מוכרים',
  product: 'מה מוכרים (ישן)', needs: 'מה צריכים', fem: 'פונים אליה בלשון נקבה', code: 'קוד הגישה', vendorIds: 'בעלי הדוכנים', confirmed: 'אישר הגעה', requestId: 'בקשה', id: 'מזהה',
  doneAt: 'מתי בוצעה', doneBy: 'מי ביצע', boughtBy: 'מי קנה', boughtAt: 'מתי נקנה', notAvailable: 'לא היה', people: 'אנשים', total: 'סך הכול', displayName: 'שם', customerNumber: 'מספר לקוח', at: 'מתי', recurring: 'חוזרת', closed: 'סגור', who: 'מי',
  changed: 'השתנה', created: 'נוספו', updated: 'עודכנו', amountPaid: 'שולם',
};
const FIELD_IN: Record<string, string> = { 'tasks.create.title': 'מה צריך לעשות', 'tasks.create.note': 'הערה', 'shopping.add.title': 'מה לקנות', 'tasks.addShopping.title': 'מה לקנות', 'events.create.title': 'שם האירוע', 'broadcasts.send.audience': 'למי' };
export const opFieldName = (op: CatalogOp, key: string): string => FIELD_IN[`${op.name}.${key}`] || FIELD[key] || fieldLabel(key) || key;
/** Technical or rarely needed: behind "עוד שדות", unless the operation requires them. */
const EXTRA = new Set(['ifUpdatedAt', 'cursor', 'countOnly', 'photo', 'donePhoto', 'image', 'legacyIndex', 'accuracy', 'product', 'clearDueDate', 'clearPlace', 'clearEvent', 'clearAssignee', 'clearDue', 'sort', 'fem', 'meta']);
export const isExtra = (f: OpField) => !f.p.required && EXTRA.has(f.key);
export const isLong = (f: OpField) => f.p.type === 'string' && (f.p.max || 0) >= 1000 && !/link|url|steps/i.test(f.key);
export const isFull = (f: OpField) => isLong(f) || (f.p.type === 'string' && ((!!f.p.required && ['title', 'text', 'name', 'q', 'label'].includes(f.key)) || f.key === 'steps' || f.key === 'link')) || f.p.type === 'stringList';
/** Must-haves first, then short fields, yes/no last, long texts at the end. */
export const orderFields = (fs: OpField[]) => {
  const rank = (f: OpField) => (f.p.required ? 0 : isLong(f) || isFull(f) ? 3 : f.p.type === 'bool' ? 2 : 1);
  return fs.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map((x) => x.f);
};
const PERSON = new Set(['assignee', 'uid', 'ownerUid', 'guestUid', 'subjectUid', 'byUid', 'participants', 'uids']);
const LIST_OF: Record<string, string> = {
  placeId: 'places.list', eventId: 'events.list', fromEventId: 'events.list', taskId: 'tasks.list', vendorId: 'vendors.list', vendorIds: 'vendors.list', projectId: 'projects.list', templateId: 'templates.list', visitId: 'visits.list', donationId: 'donations.list',
  broadcastId: 'broadcasts.list', tabId: 'tabs.list', ticketId: 'tickets.list', tripId: 'shoppingTrips.list', notificationId: 'notifications.list',
};
/** Where a field's records are picked from: 'people', the name of a list operation, or null (typed as it is). */
export function pickFrom(op: CatalogOp, f: OpField, ops: CatalogOp[]): string | null {
  if (PERSON.has(f.key) || f.p.type === 'uid') return 'people';
  const res = op.name.slice(0, op.name.lastIndexOf('.'));
  const list = f.key === 'itemId' ? (res === 'shopping' ? 'shopping.list' : 'calendar.list') : f.key === 'id' && f.where === 'path' ? (res === 'profiles' ? 'people' : `${res}.list`) : LIST_OF[f.key];
  if (!list || list === 'people') return list || null;
  return ops.some((o) => o.name === list && !o.pathParams) ? list : null;
}
export type Opt = { id: string; label: string };
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const nameOf = (v: unknown) => (v && typeof v === 'object' ? s((v as { name?: string }).name) : '');
export const recordName = (r: Record<string, unknown>) => s(r.title) || s(r.name) || s(r.displayName) || s(r.label) || s(r.guestName) || nameOf(r.guest) || nameOf(r.owner) || s(r.text) || s(r.email) || '';
/** The records of a list answer as choices; two with one name are told apart. */
export function optsOf(items: Record<string, unknown>[]): Opt[] {
  const seen = new Map<string, number>();
  return items.flatMap((r) => {
    const id = s(r.id) || s(r.uid);
    const name = recordName(r);
    if (!id || !name) return [];
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return [{ id, label: n > 1 ? `${name} (${n})` : name }];
  });
}
/** What was typed, as the record it means: its name, the start of only one name, or its id. */
export function pick(text: string, opts: Opt[]): string | null {
  const t = text.trim();
  const hit = opts.find((o) => o.label === t) || opts.find((o) => o.id === t);
  if (hit) return hit.id;
  const start = opts.filter((o) => o.label.startsWith(t));
  if (start.length === 1) return start[0].id;
  return /^[A-Za-z0-9_-]{4,}$/.test(t) ? t : null;
}

/* ───────── values ───────── */
const pad = (n: number | string) => String(n).padStart(2, '0');
/** "1.12.2026", "1.12", "2026-12-01", "היום", "מחר" → YYYY-MM-DD. */
export function parseDate(text: string): string | null {
  const t = text.trim();
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(ms));
  if (t === 'היום') return day(nowMs());
  if (t === 'מחר') return day(nowMs() + 86400_000);
  if (t === 'אתמול') return day(nowMs() - 86400_000);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  let [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  if (!m) {
    m = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?$/.exec(t);
    if (!m) return null;
    [d, mo] = [+m[1], +m[2]];
    y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +day(nowMs()).slice(0, 4);
  }
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCMonth() === mo - 1 && at.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}
function parseTime(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? `${pad(m[1])}:${m[2]}` : null;
}
/** A field's text in the type the server takes, or why it cannot be. Empty: left out. */
export function typed(p: CatalogParam, raw: string): { value?: unknown; error?: string } {
  const v = raw.trim();
  if (!v) return {};
  if (p.type === 'bool') return { value: v === 'true' };
  if (p.type === 'int' || p.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n) || (p.type === 'int' && !Number.isInteger(n))) return { error: 'צריך מספר' };
    if ((p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) return { error: `בין ${p.min} ל־${p.max}` };
    return { value: n };
  }
  if (p.type === 'date') { const d = parseDate(v); return d ? { value: d } : { error: 'תאריך לא מובן. למשל 1.12.2026' }; }
  if (p.type === 'time') { const t = parseTime(v); return t ? { value: t } : { error: 'שעה לא מובנת. למשל 08:30' }; }
  if (p.type === 'datetime') {
    const [a, b] = v.split(/[ T]+/);
    const d = parseDate(a), t = parseTime(b || '');
    return d && t ? { value: `${d}T${t}` } : { error: 'למשל 1.12.2026 18:00' };
  }
  if (p.type === 'stringList') return { value: v.split(',').map((x) => x.trim()).filter(Boolean) };
  if (p.type === 'intList') { const l = v.split(',').map((x) => Number(x.trim())); return l.every(Number.isInteger) ? { value: l } : { error: 'מספרים, מופרדים בפסיק' }; }
  if (p.type === 'string' && p.max && v.length > p.max) return { error: `עד ${p.max} תווים` };
  return { value: v };
}
export function placeholderOf(f: OpField, from: string | null): string {
  const many = f.p.type === 'stringList';
  if (from === 'people') return many ? 'שמות, מופרדים בפסיק' : 'שם של אדם';
  if (from) return many ? 'שמות, מופרדים בפסיק' : 'שם, או בחירה מהרשימה';
  if (f.p.type === 'date') return 'תאריך, למשל 1.12.2026';
  if (f.p.type === 'time') return 'שעה, למשל 08:30';
  if (f.p.type === 'datetime') return 'תאריך ושעה, למשל 1.12.2026 18:00';
  if (f.p.type === 'email') return 'כתובת מייל';
  if (many) return f.key === 'dates' ? 'תאריכים, מופרדים בפסיק' : 'כמה ערכים, מופרדים בפסיק';
  if (f.p.type === 'intList') return 'מספרים, מופרדים בפסיק';
  if ((f.p.type === 'int' || f.p.type === 'number') && f.p.min !== undefined) return `מספר, ${f.p.min} עד ${f.p.max}`;
  if (/link|url|photo|image/i.test(f.key)) return 'קישור שמתחיל ב־https';
  return '';
}
const VALUE: Record<string, string> = {
  super: 'סופר', building: 'חומרי בניין', online: 'אינטרנט', giveaway: 'מוצרי מסירה', owner: 'בעלים', manager: 'מנהל/ת', staff: 'מתנדב/ת', guest: 'אורח/ת', vendor: 'בעל דוכן', helper: 'עוזר/ת',
  active: 'פעיל', pending: 'ממתין', blocked: 'חסום', free: 'חינם', claimed: 'דווח שהועבר', paid: 'שולם', paid_onsite: 'שולם במקום', cancelled: 'בוטל', valid: 'בתוקף', new: 'חדש', approved: 'אושר', rejected: 'לא מתאים', ok: 'נכנס',
  paidAtGate: 'שילם בשער', payLater: 'ישלם אחר כך', open: 'פתוח', waived: 'נמחל', done: 'בוצע', all: 'כולם', managers: 'מנהלים', farmToday: 'מי שבחווה היום', crew: 'צוות האירוע', vendors: 'בעלי הדוכנים', manual: 'פריט אחר', visit: 'ביקור',
  event: 'אירוע', presence: 'נוכחות', meeting: 'פגישה', planning: 'הכנות לפסטיבל', donation: 'תרומה', join: 'הצטרפות', order: 'הזמנה', receipt: 'קבלה', tab: 'חשבון דוכן', claim: 'דיווח תשלום', contact: 'פנייה מהאתר', task: 'משימה', urgent: 'דחוף',
  trip: 'קנייה', broadcast: 'הודעה', system: 'מערכת', shopping: 'קניות', ticket: 'כרטיס', place: 'מקום', task_private: 'משימה למנהלים', user: 'אדם', settings: 'הגדרות', text: 'טקסט', choice: 'בחירה', date: 'תאריך', doc: 'מסמך', image: 'תמונה',
  tickets: 'הזמנה', donations: 'תרומה', tabs: 'חשבון דוכן', none: 'שולם או חינם', gate: 'שילמו בשער', later: 'ישלמו אחר כך', stall: 'הדוכן', sent: 'נשלח', queued: 'ממתין', failed: 'נכשל', skipped: 'דולג',
};
export const enumHe = (key: string, v: string) => (key === 'which' && v === 'gate' ? 'השער' : key === 'audience' && v === 'all' ? 'כל הצוות' : VALUE[v] || v);
const ENUM_KEYS = new Set(['status', 'paymentStatus', 'role', 'category', 'kind', 'audience', 'type', 'result', 'list', 'pay', 'which', 'collection']);

/* ───────── the answer ───────── */
export type Row = { key: string; label: string; value: string; mono?: boolean };
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
/** People by uid, so a stored uid is read as a name. */
export type Names = Map<string, string>;
const HIDE = new Set(['id', 'uid', 'createdAt', 'createdBy', 'updatedAt', 'expireAt', 'verified', 'replayed', 'readBack', 'templateId', 'dateKey', 'secret', 'lat', 'lng', 'accuracy', 'photoUrl', 'donePhotoUrl', 'takenAt', 'remindAt', 'welcomedAt']);
const FIRST = ['assignee', 'dueDate', 'location', 'qty', 'category', 'status', 'paymentStatus', 'role', 'date', 'time', 'start', 'end', 'amount', 'price', 'phone', 'email', 'urgent', 'done', 'doneBy', 'bought', 'boughtBy', 'note'];
function cell(key: string, v: unknown, names: Names): string {
  if (v === null || v === undefined || v === '' || v === false) return '';
  if (key === 'location' && isRec(v)) return s(v.placeName);
  if (isRec(v)) return nameOf(v);
  if (Array.isArray(v)) return v.every((x) => typeof x === 'string' || typeof x === 'number') ? v.map((x) => (names.get(String(x)) || String(x))).filter((x) => !/^[A-Za-z0-9_-]{18,}$/.test(x)).join(', ') : v.map((x) => (isRec(x) ? recordName(x) : '')).filter(Boolean).join(', ') || (v.length ? String(v.length) : '');
  if (typeof v === 'string') {
    if (ENUM_KEYS.has(key)) return enumHe(key, v);
    if (/uid$/i.test(key)) return names.get(v) || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${ddmm(v)}.${v.slice(0, 4)}`;
    if (/Id$/.test(key) || v.startsWith('data:')) return '';
  }
  if (key === 'eventId') return '';
  return valueText(v);
}
const knownKeys = (r: Rec) => [...FIRST.filter((k) => k in r), ...Object.keys(r).filter((k) => !FIRST.includes(k) && !HIDE.has(k) && !/^has[A-Z]|Id$|Url$/.test(k) && (FIELD[k] || fieldLabel(k)))];
const recLabel = (k: string) => (k === 'location' ? 'מקום' : FIELD[k] || fieldLabel(k) || k);
const FEM = new Set(['tasks', 'templates', 'broadcasts', 'visits', 'donations', 'gate']);
function headLabel(op: string): string {
  const [res] = op.split('.');
  const verb = op.slice(op.lastIndexOf('.') + 1);
  const fem = FEM.has(res) || (res === 'shopping' && verb.includes('Trip'));
  if (verb === 'create') return fem ? 'נוצרה' : 'נוצר';
  if (verb.startsWith('add') || verb === 'open') return 'נוסף';
  if (verb.startsWith('delete') || verb.startsWith('remove')) return fem ? 'נמחקה' : 'נמחק';
  if (verb === 'get') return 'שם';
  return 'עודכן';
}
const OVERVIEW: [string, string][] = [
  ['tasks.open', 'משימות פתוחות'], ['tasks.urgent', 'דחופות'], ['tasks.dueToday', 'להיום'], ['tasks.overdue', 'באיחור'], ['tasks.mine', 'המשימות שלך'], ['shopping.open', 'לקנות'], ['shopping.urgent', 'קניות דחופות'], ['upcomingEvents', 'אירועים קרובים'],
  ['visits.new', 'ביקורים חדשים'], ['visits.upcomingApproved', 'ביקורים שאושרו'], ['payments.ticketsPending', 'כרטיסים ממתינים'], ['payments.ticketsClaimed', 'כרטיסים שדווחו'], ['payments.donationsPending', 'תרומות ממתינות'], ['payments.donationsClaimed', 'תרומות שדווחו'],
  ['payments.tabsOpen', 'חשבונות פתוחים'], ['notifications.unhandled', 'התראות פתוחות'], ['calendarToday', 'ביומן היום'], ['peoplePending', 'אנשים ממתינים'],
];
export type Shaped = { rows: Row[]; list: { columns: { key: string; head: string }[]; items: { id: string; cells: Record<string, string> }[]; more: boolean } | null; note: string };
/** An answer as a person reads it: label and value rows, or a table. Everything else is in the full answer. */
export function shape(op: CatalogOp, json: unknown, names: Names): Shaped {
  const data = isRec(json) && isRec(json.data) ? json.data : {};
  if (data.accepted === true && typeof data.created === 'number' && typeof data.queued === 'number') {
    const rows = [
      { key: 'accepted', label: 'הפעולה התקבלה', value: 'כן' },
      { key: 'created', label: 'התראות שנשמרו באפליקציה', value: fmt(data.created) },
      { key: 'queued', label: 'משימות שנוספו לתור הטלפון', value: fmt(data.queued) },
    ];
    const phone = data.queued ? (data.pushState === 'off' ? 'נוסף לתור, אבל השליחה לטלפון כבויה בשרת.'
      : data.pushState === 'paused' ? 'נוסף לתור, והשליחה לטלפון בהשהיה.'
        : 'נוסף לתור השליחה לטלפון. עדיין לא ידוע אם ההתראה הופיעה במכשיר.') : '';
    const note = [data.replayed ? 'מוצגת תוצאת הפעולה הקודמת.' : '', phone].filter(Boolean).join(' ');
    return { rows, list: null, note };
  }
  const note = data.replayed ? 'הפעולה כבר בוצעה קודם, ולא בוצעה פעם נוספת.' : data.changed === false ? 'לא היה מה לשנות: זה כבר היה כך.' : data.verified === false && op.kind === 'write' ? 'הפעולה נשמרה, אבל השרת לא הצליח לקרוא אותה חזרה. לא להריץ שוב.' : '';
  const items = [data.items, data.candidates, data.records, data.questions].find(Array.isArray) as Rec[] | undefined;
  if (items) {
    const recs = items.filter(isRec);
    const text = recs.map((r) => ({ r, cells: Object.fromEntries(knownKeys(r).map((k) => [k, cell(k, r[k], names)])) }));
    const nameKeys = ['title', 'name', 'displayName', 'label', 'text'];
    const keys: string[] = [];
    for (const t of text) for (const k of knownKeys(t.r)) if (!nameKeys.includes(k) && !keys.includes(k) && t.cells[k]) keys.push(k);
    keys.sort((a, b) => (FIRST.indexOf(a) + 100) % 100 - (FIRST.indexOf(b) + 100) % 100);
    const columns = [{ key: '_', head: op.name.startsWith('tasks') ? 'משימה' : 'שם' }, ...keys.slice(0, 4).map((k) => ({ key: k, head: recLabel(k) }))];
    return { rows: [], note, list: { columns, items: text.map((t, i) => ({ id: s(t.r.id) || s(t.r.uid) || String(i), cells: { ...t.cells, _: recordName(t.r) || 'בלי שם' } })), more: !!data.hasMore } };
  }
  const rec = [data.task, data.item, data.record, data.deleted, data.removed, data.settings].find(isRec);
  const rows: Row[] = [];
  if (rec) {
    const name = recordName(rec);
    if (name) rows.push({ key: '_', label: headLabel(op.name), value: name });
    for (const k of knownKeys(rec)) {
      const value = cell(k, rec[k], names);
      if (value && value !== name && rows.length < 9) rows.push({ key: k, label: recLabel(k), value });
    }
    const id = s(rec.id) || s(rec.uid);
    if (id) rows.push({ key: 'id', label: 'מזהה', value: id, mono: true });
    return { rows, list: null, note };
  }
  for (const [path, label] of OVERVIEW) {
    const v = path.split('.').reduce<unknown>((o, k) => (isRec(o) ? o[k] : undefined), data);
    if (typeof v === 'number') rows.push({ key: path, label, value: v.toLocaleString('he-IL') });
    else if (Array.isArray(v)) rows.push({ key: path, label, value: v.length ? `${v.length} · ${v.slice(0, 3).map((x) => (isRec(x) ? recordName(x) : '')).filter(Boolean).join(', ')}${v.length > 3 ? '…' : ''}` : 'אין' });
  }
  if (!rows.length) for (const k of Object.keys(data)) { const value = HIDE.has(k) ? '' : cell(k, data[k], names); if (value && (FIELD[k] || fieldLabel(k))) rows.push({ key: k, label: recLabel(k), value }); }
  return { rows: rows.slice(0, 12), list: null, note };
}

/** Where the record is in the app, when it has a page there. */
export function appPath(op: CatalogOp, json: unknown): string | null {
  const data = isRec(json) && isRec(json.data) ? json.data : {};
  if (/\.(delete|remove)/.test(op.name) || data.deleted || data.removed) return null;
  const rec = [data.task, data.item, data.record].find(isRec);
  const id = rec ? s(rec.id) || s(rec.uid) : '';
  if (!id) return null;
  if (data.task) return `/app/tasks/${id}`;
  const res = op.name.split('.')[0];
  const at: Record<string, string> = {
    tasks: '/app/tasks/', shopping: '/app/shopping/', places: '/app/places/', projects: '/app/projects/', events: '/app/manage/events/', vendors: '/app/manage/vendors/', visits: '/app/manage/visits/', donations: '/app/manage/donations/',
    people: '/app/manage/people/', profiles: '/app/manage/people/', broadcasts: '/app/manage/people/messages/',
  };
  // these read back something under the record (a step, a product, a trip), which has no page of its own
  if (!at[res] || /Step|Product|Vendor|Station|File|Trip|Cash|addPerson|removePerson/.test(op.name)) return null;
  return at[res] + id;
}

/* ───────── undo ───────── */
export type Undo = { op: string; body: Rec; text: string };
type Rule = (sent: Rec, data: Rec, id: string) => Undo | null;
const undo = (op: string, body: Rec, text: string): Undo | null => (Object.values(body).every((v) => v !== undefined && v !== '' && v !== null) ? { op, body, text } : null);
/**
 * The operations with a natural reverse, each by the API's own operation. Not here: what replaced a value nobody keeps
 * (a role, a payment, an edited text) and what already reached people (a message).
 */
const UNDO: Record<string, Rule> = {
  'tasks.create': (_, d, id) => undo('tasks.delete', { taskId: s(d.taskId) || id }, 'המשימה החדשה תימחק. היא תחכה 30 יום בסל המחזור.'),
  'tasks.complete': (b, d) => (d.changed === false ? null : undo('tasks.reopen', { taskId: b.taskId }, 'המשימה תחזור להיות פתוחה. האחראי לא משתנה.')),
  'tasks.take': (b, d) => (d.changed === false ? null : undo('tasks.release', { taskId: b.taskId }, 'המשימה תחזור להיות פנויה.')),
  'tasks.addShopping': (_, d, id) => undo('shopping.delete', { itemId: s(d.itemId) || id }, 'הפריט יימחק מרשימת הקניות.'),
  'shopping.add': (_, d, id) => undo('shopping.delete', { itemId: s(d.itemId) || id }, 'הפריט יימחק מרשימת הקניות.'),
  'shopping.setBought': (b, d) => (d.changed === false || b.bought === false ? null : undo('shopping.setBought', { itemId: b.itemId, bought: false }, 'הפריט יחזור לרשימה הפתוחה.')),
  'shopping.setMissing': (b) => (b.missing === false ? null : undo('shopping.setMissing', { itemId: b.itemId, missing: false }, 'הסימון יוסר מהפריט.')),
  'shopping.startTrip': (_, d) => (d.resumed ? null : undo('shopping.deleteTrip', { tripId: s(d.tripId) }, 'הקנייה תימחק. ההתראה לצוות כבר יצאה.')),
  'shopping.closeTrip': (b, d) => (d.changed === false ? null : undo('shopping.reopenTrip', { tripId: b.tripId }, 'הקנייה תיפתח מחדש.')),
  'shopping.reopenTrip': (b, d) => (d.changed === false ? null : undo('shopping.closeTrip', { tripId: b.tripId }, 'הקנייה תיסגר.')),
  'templates.create': (_, d, id) => undo('templates.delete', { templateId: s(d.templateId) || id }, 'המשימה הקבועה החדשה תימחק.'),
  'places.add': (_, d, id) => undo('places.delete', { placeId: s(d.placeId) || id }, 'המקום החדש יימחק.'),
  'events.create': (_, d, id) => undo('events.delete', { eventId: s(d.eventId) || id }, 'האירוע החדש יימחק.'),
  'events.close': (b, d) => (d.changed === false ? null : undo('events.reopen', { eventId: b.eventId }, 'האירוע ייפתח מחדש.')),
  'events.reopen': (b, d) => (d.changed === false ? null : undo('events.close', { eventId: b.eventId }, 'האירוע ייסגר.')),
  'events.saveProduct': (b, d) => (b.productId ? null : undo('events.deleteProduct', { eventId: b.eventId, productId: s(d.productId) }, 'המוצר החדש יימחק מהדוכן.')),
  'events.addFileLink': (b, d) => undo('events.removeFile', { eventId: b.eventId, fileId: s(d.fileId) }, 'הקישור יימחק מהאירוע.'),
  'events.inviteVendor': (b, d) => (d.alreadyInvited ? null : undo('events.removeVendor', { eventId: b.eventId, vendorId: b.vendorId }, 'בעל הדוכן יוסר מהאירוע.')),
  'tickets.addGuestOrder': (_, d) => undo('tickets.deleteOrder', { orderId: s(d.orderId) }, 'ההזמנה החדשה תימחק לגמרי, עם הכרטיסים שלה.'),
  'tabs.open': (_, d, id) => undo('tabs.delete', { tabId: s(d.tabId) || id }, 'החשבון החדש יימחק.'),
  'donations.setReceiptSent': (b) => undo('donations.setReceiptSent', { donationId: b.donationId, sent: b.sent === false }, b.sent === false ? 'הקבלה תסומן כנשלחה.' : 'הקבלה תסומן כלא נשלחה.'),
  'notifications.setHandled': (b) => undo('notifications.setHandled', { notificationId: b.notificationId, handled: b.handled === false }, b.handled === false ? 'ההתראה תסומן כטופלה.' : 'ההתראה תחזור לתור.'),
  'calendar.create': (_, d, id) => undo('calendar.delete', { itemId: s(d.itemId) || id }, 'הפריט החדש יימחק מהיומן.'),
  'presence.save': (_, d) => (d.updated || !Array.isArray(d.itemIds) || d.itemIds.length !== 1 ? null : undo('presence.remove', { itemId: d.itemIds[0] }, 'רישום הנוכחות יוסר מהיומן.')),
  'projects.create': (_, d, id) => undo('projects.delete', { projectId: s(d.projectId) || id }, 'הפרויקט החדש יימחק עם הצעדים שלו.'),
  'projects.takeStep': (b, d) => (d.changed === false ? null : undo('projects.releaseStep', { projectId: b.projectId, stepId: b.stepId }, 'הצעד יחזור להיות פנוי.')),
  'projects.completeStep': (b, d) => (d.changed === false ? null : undo('projects.reopenStep', { projectId: b.projectId, stepId: b.stepId }, 'הצעד יחזור לרשימה.')),
  'vendors.create': (_, d, id) => undo('vendors.delete', { vendorId: s(d.vendorId) || id }, 'בעל הדוכן החדש יימחק מהמאגר.'),
  'vendors.addPerson': (b, d) => undo('vendors.removePerson', { vendorId: b.vendorId, code: s(d.code) }, 'האדם יוסר מהדוכן וקישור הגישה שלו ייסגר.'),
};
/** How to undo this run, when the operation has a reverse and the catalog offers it. */
export function undoOf(op: CatalogOp, sent: Rec, json: unknown, ops: CatalogOp[]): Undo | null {
  const data = isRec(json) && isRec(json.data) ? json.data : {};
  if (data.replayed) return null;
  const rec = [data.task, data.item, data.record].find(isRec);
  const u = UNDO[op.name]?.(sent, data, rec ? s(rec.id) : '') || null;
  return u && ops.some((o) => o.name === u.op) ? u : null;
}
