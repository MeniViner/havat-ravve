// Hebrew date and time wording shared by every v2 screen. All "now" comes from clock.ts (frozen in demo).
import { now, nowMs, dateKeyOf, todayKey } from '../clock';

const TZ = 'Asia/Jerusalem';
export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** A YYYY-MM-DD key or ISO string -> Date at noon Israel (keys) or the instant (ISO). */
const toDate = (v: string | Date) => (v instanceof Date ? v : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00+02:00') : new Date(v));
const parts = (v: string | Date) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(toDate(v));
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
  return { day: +g('day'), month: +g('month'), year: +g('year'), hour: g('hour'), minute: g('minute'), wd };
};
export const keyOf = (v: string | Date) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : dateKeyOf(toDate(v)));
/** Whole days from today to the date (negative = past), by Israeli calendar day. */
export function daysFromToday(v: string | Date) {
  const a = Date.UTC(...(todayKey().split('-').map(Number) as [number, number, number]).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]);
  const b = Date.UTC(...(keyOf(v).split('-').map(Number) as [number, number, number]).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]);
  return Math.round((b - a) / 86400_000);
}
/** "חמישי" */
export const dayName = (v: string | Date) => DAY_NAMES[parts(v).wd];
/** "19.11" */
export const ddmm = (v: string | Date) => { const p = parts(v); return `${p.day}.${p.month}`; };
/** "חמישי · 19.11" (root overline) */
export const dayOverline = (v: string | Date = now()) => `${dayName(v)} · ${ddmm(v)}`;
/** "שישי, 27.11" */
export const dayComma = (v: string | Date) => `${dayName(v)}, ${ddmm(v)}`;
/** "08:15" */
export const hhmm = (v: string | Date) => { const p = parts(v); return `${p.hour}:${p.minute}`; };
/** "היום" / "מחר" / "אתמול" / "שישי 27.11" */
export function relDay(v: string | Date) {
  const d = daysFromToday(v);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  return `${dayName(v)} ${ddmm(v)}`;
}
/** "אתמול 08:15" / "היום 10:12" / "12.11 17:20" */
export function dayTime(v: string | Date) {
  const d = daysFromToday(v);
  const t = hhmm(v);
  return d === 0 ? `היום ${t}` : d === -1 ? `אתמול ${t}` : `${ddmm(v)} ${t}`;
}
/** "בעוד 9 ימים" / "מחר" / "היום" / "לפני 3 ימים" */
export function inDays(v: string | Date) {
  const d = daysFromToday(v);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  return d > 0 ? `בעוד ${d} ימים` : `לפני ${-d} ימים`;
}
/** "עוד 8 ימים" (countdown without "ב") */
export const daysLeft = (v: string | Date) => { const d = daysFromToday(v); return d === 0 ? 'היום' : d === 1 ? 'מחר' : `עוד ${d} ימים`; };
/** "לפני 20 דק׳" / "לפני שעה" / "לפני 6 שעות" / "אתמול" / "לפני 3 ימים" / "עכשיו" */
export function ago(iso: string) {
  const min = Math.round((nowMs() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'עכשיו';
  if (min < 60) return `לפני ${min} דק׳`;
  const h = Math.round(min / 60);
  if (h === 1) return 'לפני שעה';
  if (h === 2) return 'לפני שעתיים';
  if (h < 24 && daysFromToday(iso) === 0) return `לפני ${h} שעות`;
  const d = -daysFromToday(iso);
  if (d <= 1) return 'אתמול';
  return `לפני ${d} ימים`;
}
/** "42 דקות" style long minutes for sentences: "לפני 42 דקות" */
export function agoLong(iso: string) {
  const min = Math.round((nowMs() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.round(min / 60);
  return h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : h < 24 ? `לפני ${h} שעות` : `לפני ${Math.round(h / 24)} ימים`;
}
/** "₪1,240" is not the house style; the designs write "1,240 ₪". */
export const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₪`;
export const num = (n: number) => n.toLocaleString('en-US');
/** "19 בנובמבר" */
export const longDate = (v: string | Date) => { const p = parts(v); return `${p.day} ב${MONTHS[p.month - 1]}`; };
/** Two Hebrew initials: "יואב פרץ" -> "יפ". */
export const initials = (name: string) => { const w = name.trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : w[0]?.[1] || '')).replace(/[״"׳']/g, ''); };
/** First name: "יואב פרץ" -> "יואב". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
