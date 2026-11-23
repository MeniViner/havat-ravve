// Hebrew names for the database's collections, for every console screen that lists them (backups, recycle bin, data).
const NAMES: Record<string, string> = {
  users: 'אנשים', tasks: 'משימות', task_templates: 'תבניות משימות', shopping: 'קניות', events: 'אירועים', tickets: 'כרטיסים',
  donations: 'תרומות', visits: 'ביקורים', places: 'מקומות', calendar: 'לוח זמנים', activity: 'יומן הפעולות', notifications: 'תיבת המנהלים',
  broadcasts: 'הודעות לצוות', vendors: 'דוכנים', settings: 'הגדרות', api_log: 'יומן אינסטינקט', push_jobs: 'תור התראות לטלפון',
  email_outbox: 'תור מיילים', role_invites: 'תפקידים מראש', tabs: 'חשבונות דוכן', counters: 'מונים', invites: 'הזמנות',
  projects: 'פרויקטים', api_failures: 'תקלות שרת', account_deletions: 'בקשות מחיקת חשבון', cms_admins: 'עורכי האתר',
  cms_content: 'תוכן האתר', cms_media: 'תמונות האתר', cms_history: 'היסטוריית האתר', join_codes: 'קודי הצטרפות',
  products: 'מוצרים', staffing: 'שיבוץ צוות', vendor_requests: 'בקשות דוכנים', reads: 'קריאות', orders: 'הזמנות',
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
