// Hebrew names for the database's collections, for every console screen that lists them (backups, recycle bin, data).
const NAMES: Record<string, string> = {
  users: 'אנשים', tasks: 'משימות', task_templates: 'תבניות משימות', shopping: 'קניות', events: 'אירועים', tickets: 'כרטיסים',
  donations: 'תרומות', visits: 'ביקורים', places: 'מקומות', calendar: 'לוח זמנים', activity: 'יומן הפעולות', notifications: 'תיבת המנהלים',
  broadcasts: 'הודעות לצוות', vendors: 'דוכנים', settings: 'הגדרות', api_log: 'יומן אינסטינקט', push_jobs: 'תור התראות לטלפון',
  email_outbox: 'תור מיילים', role_invites: 'תפקידים מראש', tabs: 'חשבונות דוכן', counters: 'מונים', invites: 'הזמנות',
  projects: 'פרויקטים', api_failures: 'תקלות שרת', account_deletions: 'בקשות מחיקת חשבון', notification_activity: 'יומן שליחת התראות אישיות', account_activity: 'פעילות חשבונות פרטית', cms_admins: 'עורכי האתר',
  cms_content: 'תוכן האתר', cms_media: 'תמונות האתר', cms_history: 'היסטוריית האתר', join_codes: 'קודי הצטרפות',
  products: 'מוצרים', staffing: 'שיבוץ צוות', vendor_requests: 'בקשות דוכנים', reads: 'קריאות', orders: 'הזמנות',
  api_idempotency: 'מניעת כפילויות בשרת',
};
/** "events/*\/vendors" -> "דוכנים באירועים"; "users" -> "אנשים"; unknown ids stay as they are. */
export function collectionName(group: string): string {
  const parts = group.split('/*/');
  const last = parts[parts.length - 1];
  const name = NAMES[last] || last;
  if (parts.length === 1) return name;
  const parent = NAMES[parts[parts.length - 2]] || parts[parts.length - 2];
  return `${name} · ${parent}`;
}
import { ddmm, hhmm } from '../app/v2/format';

// Hebrew names for the fields that records share across the farm's collections (tasks, shopping, people, events,
// visits, payments…). A field not listed here is shown by its stored name.
const FIELDS: Record<string, string> = {
  id: 'מזהה', uid: 'מזהה אדם', title: 'כותרת', name: 'שם', text: 'טקסט', note: 'הערה', notes: 'הערות', description: 'תיאור',
  status: 'מצב', role: 'תפקיד', active: 'פעיל', open: 'פתוח', done: 'בוצעה', doneAt: 'מתי בוצעה', doneBy: 'מי ביצע', doneNote: 'הערת ביצוע', donePhoto: 'תמונת ביצוע',
  urgent: 'דחוף', assignee: 'אחראי', dueDate: 'תאריך יעד', place: 'מקום', placeId: 'מקום', category: 'קטגוריה', qty: 'כמות',
  bought: 'נקנה', boughtAt: 'מתי נקנה', boughtBy: 'מי קנה', addedBy: 'מי הוסיף', createdAt: 'נוצר', createdBy: 'מי יצר', updatedAt: 'עודכן', updatedBy: 'מי עדכן',
  displayName: 'שם', email: 'מייל', phone: 'טלפון', customerNumber: 'מספר לקוח', gender: 'מגדר', birthDate: 'תאריך לידה', town: 'יישוב', photo: 'תמונה',
  date: 'תאריך', dateKey: 'תאריך', start: 'התחלה', end: 'סיום', time: 'שעה', days: 'ימים', location: 'מיקום', lat: 'קו רוחב', lng: 'קו אורך',
  price: 'מחיר', amount: 'סכום', fee: 'דמי השתתפות', capacity: 'מקומות', payment: 'תשלום', paid: 'שולם', tickets: 'כרטיסים', items: 'פריטים',
  eventId: 'אירוע', vendorId: 'דוכן', taskId: 'משימה', templateId: 'תבנית', shoppingId: 'פריט קניות', tripId: 'נסיעה', ownerUid: 'בעלים',
  members: 'חברים', memberUids: 'חברים', requestedBy: 'מי ביקש', contact: 'איש קשר', link: 'קישור', files: 'קבצים', by: 'על ידי', via: 'דרך', action: 'פעולה',
  managersOnly: 'רק למנהלים', ticketsOpen: 'מכירת כרטיסים פתוחה', expireAt: 'פג תוקף', welcomedAt: 'קיבל ברוכים הבאים', acceptedTermsAt: 'אישר את התנאים',
};
/** The Hebrew name of a stored field, or null when we have none (then the stored name is shown). */
export const fieldLabel = (key: string): string | null => FIELDS[key] || null;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** A stored value as a person reads it: dates as dates, a person as their name, lists joined. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  if (typeof v === 'string') return ISO.test(v) ? `${ddmm(v)}.${v.slice(2, 4)} ${hhmm(v)}` : v;
  if (typeof v === 'number') return v.toLocaleString('he-IL');
  if (Array.isArray(v)) return v.length ? v.map(valueText).join(', ') : '—';
  if (typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.name === 'string') return o.name; return JSON.stringify(v); }
  return String(v);
}

/** "12 KB", "1.4 MB" */
export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${+(bytes / 1024 ** 3).toFixed(1)} GB`;
}
