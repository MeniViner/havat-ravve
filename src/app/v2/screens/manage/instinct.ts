// Q20 Instinct log in Hebrew (rule 12): one api_log entry (written by the API Worker, api/src/audit.ts) as a sentence, the
// subject on the meta line, a failure as a plain-Hebrew reason, and where tapping the row goes. Pure, tested in tests/v2-manage.mjs.

export type ApiLogEntry = {
  id: string; at: string; credential: string; keyLabel: string;
  actor: { id: string; role: string; uid: string; name: string };
  kind: 'read' | 'write'; op: string; opHe: string; verb: string;
  method: string; path: string; query: string; body: string; result: string; count: number | null;
  refs: { col: string; id: string }[]; status: number; ok: boolean; code: string; message: string;
  replayed: boolean; idempotencyKey: string; ms: number;
};

/** Every error code the Worker writes into api_log (api/src/http.ts ErrorCode), as a short Hebrew reason. */
export const INSTINCT_REASON: Record<string, string> = {
  VALIDATION_FAILED: 'הבקשה לא הייתה תקינה',
  UNAUTHENTICATED: 'המפתח לא היה תקף',
  FORBIDDEN: 'אין לו הרשאה לפעולה הזאת',
  NOT_FOUND: 'הדבר לא נמצא, אולי נמחק',
  IDEMPOTENCY_CONFLICT: 'אותה בקשה נשלחה פעמיים עם תוכן שונה',
  STALE_WRITE: 'הרשומה השתנתה בינתיים',
  RATE_LIMITED: 'יותר מדי בקשות בזמן קצר',
  QUOTA_EXCEEDED: 'המכסה היומית נגמרה',
  UPSTREAM_ERROR: 'מסד הנתונים לא היה זמין',
  OUTCOME_UNKNOWN: 'לא ברור אם זה נשמר',
  PRODUCTION_LOCKED: 'השרת עוד לא מחובר לנתונים האמיתיים',
  INTERNAL: 'תקלה בשרת',
};
/** STALE_WRITE names the thing when it can: "המשימה השתנתה בינתיים". */
const CHANGED: Record<string, string> = { tasks: 'המשימה השתנתה', shopping: 'הפריט השתנה', events: 'האירוע השתנה', projects: 'הפרויקט השתנה', donations: 'התרומה השתנתה', visits: 'הביקור השתנה', templates: 'המשימה החוזרת השתנתה', settings: 'ההגדרות השתנו' };

/** The thing an operation group acts on, for "<verb> <noun>". */
const NOUN: Record<string, string> = {
  tasks: 'משימה', templates: 'משימה חוזרת', shopping: 'פריט בקניות', projects: 'פרויקט', events: 'אירוע', tickets: 'כרטיסים', tabs: 'חשבון בדוכן',
  gate: 'כניסה בשער', donations: 'תרומה', visits: 'ביקור', people: 'פרטים של אדם', invites: 'תפקיד מראש', places: 'מקום', presence: 'נוכחות',
  calendar: 'פריט ביומן', broadcasts: 'הודעה לצוות', notifications: 'התראה', vendors: 'בעל דוכן', vendorRequests: 'בקשה מדוכן',
  payments: 'אישור תשלום', settings: 'הגדרות', console: 'בקונסולה',
};
/** Operations whose sentence reads better than "<verb> <noun>". */
const SENTENCE: Record<string, string> = {
  'tasks.create': 'יצר משימה', 'tasks.edit': 'ערך משימה', 'tasks.delete': 'מחק משימה', 'tasks.complete': 'סימן משימה כבוצעה', 'tasks.reopen': 'פתח משימה מחדש',
  'tasks.assign': 'שייך משימה', 'tasks.take': 'לקח משימה', 'tasks.release': 'שחרר משימה', 'tasks.addShopping': 'הוסיף לקניות ממשימה',
  'shopping.add': 'הוסיף פריט לקניות', 'shopping.delete': 'מחק פריט מרשימת הקניות', 'shopping.edit': 'ערך פריט בקניות', 'shopping.setBought': 'סימן פריט כנקנה',
  'shopping.setMissing': 'סימן שפריט לא היה', 'shopping.startTrip': 'התחיל קנייה', 'shopping.closeTrip': 'סיים קנייה',
  'broadcasts.send': 'שלח הודעה לצוות', 'broadcasts.resend': 'שלח שוב הודעה לצוות', 'notifications.send': 'שלח התראה', 'notifications.setHandled': 'סימן פריט כטופל',
  'visits.setStatus': 'עדכן בקשת ביקור', 'donations.setPayment': 'עדכן תשלום של תרומה', 'donations.setReceiptSent': 'סימן שהקבלה נשלחה',
  'people.setRole': 'שינה תפקיד', 'people.setNotes': 'עדכן הערה על אדם', 'people.setStatus': 'חסם או שחרר אדם', 'presence.save': 'רשם נוכחות',
  'calendar.create': 'הוסיף ליומן', 'settings.update': 'עדכן הגדרות', 'payments.markConfirmation': 'סימן שאישור התשלום נשלח',
};
/** "ניסה ל…": the infinitive of each verb the Worker writes (api/src/audit.ts verbOf). */
const TRIED: Record<string, string> = { 'ערך': 'לערוך', 'יצר': 'ליצור', 'מחק': 'למחוק', 'שלח': 'לשלוח', 'ביטל': 'לבטל', 'ביצע': 'לבצע', 'קרא': 'לקרוא' };
const SHOP_LIST: Record<string, string> = { super: 'סופר', building: 'בניין', online: 'אונליין', wish: 'משאלות' };

const groupOf = (op: string) => op.split('.')[0] || '';
/** The Hebrew name of an operation without its explanations: "יצירת משימה חדשה, אופציונלי…" -> "יצירת משימה חדשה". */
const clause = (he: string) => he.split(/[,:(]/)[0].trim();
const json = (s: string): Record<string, unknown> => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v as Record<string, unknown> : {}; } catch { return {}; } };
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** What the request was about, from what was sent or what came back ("קפה שחור · סופר"). */
export function instinctSubject(e: Pick<ApiLogEntry, 'body' | 'result'>) {
  const b = json(e.body), r = json(e.result);
  const gone = (r.deleted && typeof r.deleted === 'object' ? r.deleted : {}) as Record<string, unknown>;
  const name = [b.title, b.text, b.name, b.displayName, b.label, gone.title, gone.text, gone.name, r.title].map(str).find(Boolean) || '';
  const list = SHOP_LIST[str(b.category) || str(b.list) || str(gone.category)] || '';
  const s = [name, list].filter(Boolean).join(' · ');
  return s.length > 80 ? s.slice(0, 79) + '…' : s;
}

export type InstinctLine = { title: string; meta: string; failed: boolean };
/** One row of the log in Hebrew: never the operation key or an error code. */
export function instinctLine(e: Pick<ApiLogEntry, 'op' | 'opHe' | 'verb' | 'kind' | 'ok' | 'code' | 'count' | 'body' | 'result' | 'replayed'>): InstinctLine {
  const g = groupOf(e.op);
  const verb = e.verb || (e.kind === 'read' ? 'קרא' : 'ערך');
  const noun = NOUN[g] || clause(e.opHe) || 'פעולה';
  if (e.kind === 'read') {
    const what = clause(e.opHe) || noun;
    if (!e.ok) return { title: `ניסה לקרוא ${what}`, meta: INSTINCT_REASON[e.code] || 'זה לא הצליח', failed: true };
    return { title: `קרא ${what}`, meta: e.count !== null && e.count !== undefined ? `${e.count} רשומות` : '', failed: false };
  }
  if (!e.ok) {
    const reason = e.code === 'STALE_WRITE' ? `${CHANGED[g] || 'הרשומה השתנתה'} בינתיים` : INSTINCT_REASON[e.code] || 'זה לא הצליח';
    const end = e.code === 'OUTCOME_UNKNOWN' ? '' : ', לא נשמר';
    return { title: `ניסה ${TRIED[verb] || 'לבצע'} ${noun}`, meta: reason + end, failed: true };
  }
  const notified = json(e.result).notified;
  const subject = e.op === 'notifications.send' && typeof notified === 'number' ? `${notified} נמענים` : instinctSubject(e);
  return { title: SENTENCE[e.op] || `${verb} ${noun}`, meta: [subject, e.replayed ? 'בקשה חוזרת, לא בוצע פעמיים' : ''].filter(Boolean).join(' · '), failed: false };
}

const ROUTE: Record<string, [string, string]> = {
  tasks: ['/tasks/', 'taskId'], shopping: ['/shopping/', 'itemId'], events: ['/manage/events/', 'eventId'], donations: ['/manage/donations/', 'donationId'],
  visits: ['/manage/visits/', 'visitId'], projects: ['/projects/', 'projectId'], people: ['/manage/people/', 'uid'], places: ['/places/', 'placeId'],
  templates: ['/manage/recurring/', 'templateId'], broadcasts: ['/manage/broadcasts/', 'broadcastId'], vendors: ['/manage/vendors/', 'vendorId'],
};
/** Q20 "לחיצה על שורה פותחת את הדבר עצמו": the screen of the record a write touched ('' for reads, deletes and unknown records). */
export function instinctTarget(e: Pick<ApiLogEntry, 'op' | 'kind' | 'verb' | 'refs' | 'body'>) {
  if (e.kind !== 'write' || e.verb === 'מחק') return '';
  const r = ROUTE[groupOf(e.op)];
  if (!r) return '';
  const id = (e.refs || []).find((x) => x.col !== 'deleted')?.id || str(json(e.body)[r[1]]) || str(json(e.body).id);
  return id ? r[0] + encodeURIComponent(id) : '';
}
