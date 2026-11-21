// Manage area: pure helpers (no React, no data access). Everything that turns rows into numbers or words lives here,
// so tests/v2-manage.mjs can check it without a browser. "today" is always passed in (YYYY-MM-DD from clock.ts).
import type { Activity, AppNotification, Donation, Profile, Role, Settings, Tab, Ticket, Visit, RegistrationField } from '../../../types';

// ---------- money and periods ----------
export const isPaid = (s: string) => s === 'paid' || s === 'paid_onsite';
export const monthStart = (today: string) => today.slice(0, 8) + '01';
export const yearStart = (today: string) => today.slice(0, 5) + '01-01';
const dayMs = 86400_000;
const keyMs = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
export const addDaysKey = (k: string, n: number) => new Date(keyMs(k) + n * dayMs).toISOString().slice(0, 10);
export type Period = 'month' | '3m' | 'year';
export const periodStart = (today: string, p: Period) => (p === 'month' ? monthStart(today) : p === 'year' ? yearStart(today) : addDaysKey(today, -90));
/** Days in the period up to and including today (at least 1). */
export const periodDays = (today: string, from: string) => Math.max(1, Math.round((keyMs(today) - keyMs(from)) / dayMs) + 1);
/** ISO timestamps compare as text against a YYYY-MM-DD key (both start with the date). */
const onOrAfter = (iso: string, key: string) => iso.slice(0, 10) >= key;

export const needsReceipt = (d: Donation) => !!d.receiptWanted && !d.receiptSent;
export const awaitsApproval = (d: Donation) => d.paymentStatus === 'claimed' || d.paymentStatus === 'pending';
/** N3 / M1 numbers: paid this month and this year, how many wait for approval, how many still need a receipt. */
export function donationTotals(ds: Donation[], today: string) {
  const m = monthStart(today), y = yearStart(today);
  const paid = ds.filter((d) => isPaid(d.paymentStatus));
  return {
    month: paid.filter((d) => onOrAfter(d.createdAt, m)).reduce((s, d) => s + d.amount, 0),
    year: paid.filter((d) => onOrAfter(d.createdAt, y)).reduce((s, d) => s + d.amount, 0),
    toApprove: ds.filter((d) => d.paymentStatus === 'claimed').length,
    needReceipt: ds.filter((d) => d.paymentStatus !== 'cancelled' && needsReceipt(d)).length,
  };
}

/** Open money per person: valid tickets still pending/claimed, plus open or claimed stall tabs with something on them. */
export function debtsByPerson(tickets: Ticket[], tabs: Tab[]) {
  const m = new Map<string, number>();
  for (const t of tickets) if (t.status === 'valid' && (t.paymentStatus === 'pending' || t.paymentStatus === 'claimed') && t.price > 0) m.set(t.ownerUid, (m.get(t.ownerUid) || 0) + t.price);
  for (const t of tabs) if (t.guestUid && (t.status === 'open' || t.status === 'claimed') && t.total > 0) m.set(t.guestUid, (m.get(t.guestUid) || 0) + t.total);
  return m;
}
export function openDebts(tickets: Ticket[], tabs: Tab[]) {
  const m = debtsByPerson(tickets, tabs);
  return { total: [...m.values()].reduce((s, v) => s + v, 0), people: m.size };
}

/** Tasks done in the period, from the activity log: a task counts once, by whoever last marked it done, unless it was undone after. */
export function doneTasks(activity: Activity[], fromKey: string, toKey: string) {
  const last = new Map<string, Activity>();
  const rows = activity.filter((a) => (a.kind === 'task' || a.kind === 'task_private') && (a.action === 'done' || a.action === 'undone')).sort((a, b) => a.at.localeCompare(b.at));
  for (const a of rows) last.set(a.refId, a);
  return [...last.values()].filter((a) => a.action === 'done' && a.at.slice(0, 10) >= fromKey && a.at.slice(0, 10) <= toKey);
}

export type Report = { tasksDone: number; perDay: number; donations: number; tickets: number; byPerson: { label: string; value: number }[]; debts: { total: number; people: number } };
/** M10: the four numbers, who did the tasks, and open debts (debts are across all events, not the period). */
export function buildReport(p: { activity: Activity[]; donations: Donation[]; tickets: Ticket[]; openTickets: Ticket[]; openTabs: Tab[]; today: string; period: Period }): Report {
  const from = periodStart(p.today, p.period);
  const done = doneTasks(p.activity, from, p.today);
  const per = new Map<string, number>();
  for (const a of done) per.set(a.by.name, (per.get(a.by.name) || 0) + 1);
  return {
    tasksDone: done.length,
    perDay: Math.round((done.length / periodDays(p.today, from)) * 10) / 10,
    donations: p.donations.filter((d) => isPaid(d.paymentStatus) && onOrAfter(d.createdAt, from)).reduce((s, d) => s + d.amount, 0),
    tickets: p.tickets.filter((t) => t.status === 'valid' && isPaid(t.paymentStatus) && onOrAfter(t.createdAt, from)).reduce((s, t) => s + t.price, 0),
    byPerson: [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he')).map(([label, value]) => ({ label, value })),
    debts: openDebts(p.openTickets, p.openTabs),
  };
}

// ---------- inbox (M2) ----------
export type InboxGroup = 'payments' | 'visits' | 'contact' | 'other';
export const inboxGroup = (n: Pick<AppNotification, 'type'>): InboxGroup =>
  n.type === 'donation' || n.type === 'claim' || n.type === 'tab' ? 'payments' : n.type === 'visit' ? 'visits' : n.type === 'contact' ? 'contact' : 'other';
/** "2 תשלומים · ביקור · פנייה" (M1 hero line). One of a kind is the bare noun. */
export function inboxSummary(list: Pick<AppNotification, 'type'>[], vendorRequests = 0) {
  const c = { payments: 0, visits: 0, contact: 0, other: 0 };
  for (const n of list) c[inboxGroup(n)]++;
  const part = (k: number, one: string, many: string) => (k === 0 ? '' : k === 1 ? one : `${k} ${many}`);
  return [part(c.payments, 'תשלום', 'תשלומים'), part(c.visits, 'ביקור', 'ביקורים'), part(c.contact, 'פנייה', 'פניות'), part(vendorRequests, 'בקשת דוכן', 'בקשות דוכן'), part(c.other, 'עוד דבר', 'דברים נוספים')].filter(Boolean).join(' · ');
}

// ---------- visits (N1, N2) ----------
/** "נפגשים בשער ב־10:00" -> "10:00" (the calendar time; the rules allow 11 characters). */
export const timeFromNote = (note: string) => { const m = (note || '').match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
export function visitBuckets(visits: Visit[], today: string) {
  return {
    fresh: visits.filter((v) => v.status === 'new').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    approved: visits.filter((v) => v.status === 'approved' && v.date >= today).sort((a, b) => a.date.localeCompare(b.date) || timeFromNote(a.managerNote).localeCompare(timeFromNote(b.managerNote))),
    past: visits.filter((v) => v.status === 'approved' && v.date < today).sort((a, b) => b.date.localeCompare(a.date)),
    rejected: visits.filter((v) => v.status === 'rejected' || v.status === 'cancelled').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}
/** M1 tile: approved visits in the coming month. */
export const approvedSoon = (visits: Visit[], today: string) => visits.filter((v) => v.status === 'approved' && v.date >= today && v.date <= addDaysKey(today, 30)).length;

// ---------- people (M8, M9, N13, G5) ----------
const FEMALE = new Set(['מיכל', 'רחל', 'אסתר', 'אורלי', 'יעל', 'סיגל', 'מירב', 'ענבל', 'רונית', 'גלית', 'שלומית', 'פזית', 'קרן', 'אורית', 'יפית', 'שני', 'נגה', 'הדס', 'תהל', 'אביגיל', 'רות', 'דבורה', 'שושן', 'ליאור', 'מורן', 'אלה', 'בתיה', 'הילה', 'נעמה', 'תמר']);
const MALE = new Set(['משה', 'שלמה', 'אריה', 'יהודה', 'יונה', 'נוח', 'ישעיה', 'מתנה']);
/** Hebrew wording needs a gender; the profile has none, so it is guessed from the first name (feminine endings and common names). */
export function isFemale(name: string) {
  const f = (name || '').trim().split(/\s+/)[0] || '';
  if (FEMALE.has(f)) return true;
  if (MALE.has(f)) return false;
  return /[הת]$/.test(f);
}
export const gw = (name: string, male: string, female: string) => (isFemale(name) ? female : male);
const ROLE_WORDS: Record<Role, [string, string]> = { guest: ['אורח', 'אורחת'], staff: ['מתנדב', 'מתנדבת'], manager: ['מנהל', 'מנהלת'], owner: ['בעלים', 'בעלים'], vendor: ['בעל דוכן', 'בעלת דוכן'] };
export const roleWord = (role: Role, female: boolean) => ROLE_WORDS[role][female ? 1 : 0];

/** The roles this manager may give this person, as the rules allow: owners anything except to themselves; managers guest/staff, and only to non-managers. */
export function allowedRoles(me: { owner: boolean; uid: string }, target: Pick<Profile, 'uid' | 'role'>): Role[] {
  if (me.uid === target.uid) return [];
  if (target.role === 'vendor') return [];
  if (me.owner) return ['guest', 'staff', 'manager', 'owner'];
  if (target.role === 'owner' || target.role === 'manager') return [];
  return ['guest', 'staff'];
}
/** Blocking: never yourself; owners anyone; managers only guests (old screen and rules). */
export const canBlock = (me: { owner: boolean; uid: string }, target: Pick<Profile, 'uid' | 'role'>) => me.uid !== target.uid && (me.owner || target.role === 'guest');
/** N13: a manager may pre-assign only volunteers; owners also managers and owners (role_invites rule). */
export const inviteRolesFor = (owner: boolean): ('staff' | 'manager' | 'owner')[] => (owner ? ['staff', 'manager', 'owner'] : ['staff']);
export const emailOk = (e: string) => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e.trim());

export const isTeam = (p: Pick<Profile, 'role' | 'status'>) => (p.role === 'staff' || p.role === 'manager' || p.role === 'owner') && p.status === 'active';
export function personMatches(p: Pick<Profile, 'displayName' | 'email' | 'phone' | 'customerNumber'>, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\D/g, '');
  return p.displayName.toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s) || (!!digits && (p.phone || '').replace(/\D/g, '').includes(digits)) || String(p.customerNumber) === s.replace(/^#/, '');
}
/** Alphabetical groups by first letter (Hebrew order). */
export function letterGroups<T extends { displayName: string }>(people: T[]) {
  const sorted = [...people].sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
  const m = new Map<string, T[]>();
  for (const p of sorted) { const l = p.displayName.trim()[0] || '?'; m.set(l, [...(m.get(l) || []), p]); }
  return [...m.entries()];
}

// ---------- activity (N14) ----------
export type ActivityFilter = 'all' | 'money' | 'people' | 'tasks' | 'events';
export function activityGroup(kind: Activity['kind']): Exclude<ActivityFilter, 'all'> | 'other' {
  if (kind === 'ticket' || kind === 'tab' || kind === 'donation') return 'money';
  if (kind === 'user' || kind === 'visit') return 'people';
  if (kind === 'task' || kind === 'task_private' || kind === 'shopping' || kind === 'place') return 'tasks';
  if (kind === 'event') return 'events';
  return 'other';
}
type Verb = { m: string; f: string; join: ':' | ' ' | '' };
const VERBS: Record<string, Verb> = {
  'paid': { m: 'אישר תשלום', f: 'אישרה תשלום', join: ':' },
  'claimed': { m: 'סימן שהעביר', f: 'סימנה שהעבירה', join: ' ' },
  'receipt': { m: 'שלח קבלה', f: 'שלחה קבלה', join: ':' },
  'waived': { m: 'מחל על חוב', f: 'מחלה על חוב', join: ':' },
  'ordered': { m: 'הזמין', f: 'הזמינה', join: ':' },
  'cancelled': { m: 'ביטל', f: 'ביטלה', join: ':' },
  'scanned': { m: 'סרק', f: 'סרקה', join: ':' },
  'item': { m: 'רשם בדוכן', f: 'רשמה בדוכן', join: ':' },
  'removed': { m: 'הסיר מהדוכן', f: 'הסירה מהדוכן', join: ':' },
  'opened': { m: 'פתח חשבון', f: 'פתחה חשבון', join: ':' },
  'role': { m: 'שינה תפקיד', f: 'שינתה תפקיד', join: ':' },
  'blocked': { m: 'חסם', f: 'חסמה', join: ':' },
  'unblocked': { m: 'שחרר חסימה', f: 'שחררה חסימה', join: ':' },
  'invited': { m: 'הגדיר תפקיד', f: 'הגדירה תפקיד', join: ':' },
  'joined': { m: 'נרשם', f: 'נרשמה', join: '' },
  'requested': { m: 'ביקש ביקור', f: 'ביקשה ביקור', join: '' },
  'approved': { m: 'אישר ביקור', f: 'אישרה ביקור', join: ':' },
  'rejected': { m: 'דחה ביקור', f: 'דחתה ביקור', join: ':' },
  'done': { m: 'סיים', f: 'סיימה', join: ':' },
  'undone': { m: 'החזיר לביצוע', f: 'החזירה לביצוע', join: ':' },
  'created': { m: 'הוסיף', f: 'הוסיפה', join: ':' },
  'edited': { m: 'עדכן', f: 'עדכנה', join: ':' },
  'photo': { m: 'הוסיף תמונה', f: 'הוסיפה תמונה', join: ':' },
  'bought': { m: 'קנה', f: 'קנתה', join: ':' },
  'added': { m: 'הוסיף לקניות', f: 'הוסיפה לקניות', join: ':' },
  'published': { m: 'פרסם', f: 'פרסמה', join: ':' },
  'saved': { m: 'שמר', f: 'שמרה', join: ':' },
};
const KIND_WORD: Record<string, string> = { task: 'משימות', task_private: 'משימות מנהלים', shopping: 'קניות', event: 'אירועים', ticket: 'כרטיסים', tab: 'דוכן', place: 'מקומות', visit: 'ביקורים', donation: 'תרומה', user: 'אנשים', settings: 'הגדרות' };
/**
 * One feed line: "בני אישר תשלום: 150 ₪ · רוני לוי" + meta "פסטיבל הסתיו · 3 כרטיסים".
 * Team members appear by first name, guests by full name. The text's first segment goes in the line, the rest is the meta
 * (a text with a line break puts everything before it in the line). Shopping "created" reads "הוסיף לקניות".
 */
export function activityLine(a: Pick<Activity, 'kind' | 'action' | 'text' | 'by'>, team: Set<string>) {
  const who = team.has(a.by.uid) ? (a.by.name.trim().split(/\s+/)[0] || a.by.name) : a.by.name;
  const female = isFemale(a.by.name);
  const action = a.kind === 'shopping' && a.action === 'created' ? 'added' : a.action;
  const v = VERBS[action] || { m: action, f: action, join: ':' as const };
  let text = a.text || '';
  if (action === 'role') { const m = text.match(/^(.*?): (.*) ← (.*)$/); if (m) text = `${m[1]}, ${m[3]}`; }
  let head = '', meta = '';
  if (text.includes('\n')) [head, meta] = [text.split('\n')[0], text.split('\n').slice(1).join(' · ')];
  else if (v.join === '') meta = text;
  else { const segs = text.split(' · '); head = segs[0]; meta = segs.slice(1).join(' · '); }
  if (!meta) meta = KIND_WORD[a.kind] || '';
  const verb = female ? v.f : v.m;
  const title = head ? `${who} ${verb}${v.join === ':' ? ': ' : ' '}${head}` : `${who} ${verb}`;
  return { title, meta };
}
export function activityMatches(a: Pick<Activity, 'text' | 'by' | 'action'>, q: string, line: string) {
  const s = q.trim();
  return !s || line.includes(s) || a.text.includes(s) || a.by.name.includes(s);
}

// ---------- settings (N5, N6, N7, G1-G5) ----------
/** Template text -> parts, placeholders like [שם] become {ph:'שם'} chips (N7). */
export function templateParts(text: string): (string | { ph: string })[] {
  const out: (string | { ph: string })[] = [];
  const re = /\[([^\]]+)\]/g; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { if (m.index > last) out.push(text.slice(last, m.index)); out.push({ ph: m[1] }); last = m.index + m[0].length; }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
/** Same check as the settings rule numberOk: empty, or 9-15 digits with spaces, dots, dashes, brackets, an optional +. */
export const numberOk = (v: string) => v.length <= 25 && (v === '' || /^[+]?([() .-]*[0-9]){9,15}[() .-]*$/.test(v));

export type PaymentExtra = { bitNumber?: string; payboxLink?: string };
export type PaymentForm = { bitOn: boolean; bit: string; payboxOn: boolean; paybox: string; cash: boolean; note: string };
/** N6 reads the stored payment; when Bit or PayBox was switched off we keep the number aside so switching back on restores it. */
export function paymentForm(p: Settings['payment'] & PaymentExtra): PaymentForm {
  return { bitOn: !!p.bit, bit: p.bit || p.bitNumber || '', payboxOn: !!p.paybox, paybox: p.paybox || p.payboxLink || '', cash: p.cash !== false, note: p.note || '' };
}
/** What the guest flow reads stays as before: payment.bit / payment.paybox are the live values ('' = not offered). */
export function paymentPatch(f: PaymentForm): Settings['payment'] & PaymentExtra {
  const bit = f.bit.trim(), paybox = f.paybox.trim();
  return { bit: f.bitOn ? bit : '', paybox: f.payboxOn ? paybox : '', cash: f.cash, note: f.note.trim(), bitNumber: bit, payboxLink: paybox };
}
export type PresetRow = { key: string; amount: string; label: string };
/** G1 rows -> donationPresets: whole positive amounts, label kept, empty rows dropped. */
export function cleanPresets(rows: PresetRow[]): { amount: number; label: string }[] {
  return rows.map((r) => ({ amount: Math.round(Number(String(r.amount).replace(/[^\d.]/g, ''))), label: r.label.trim() })).filter((r) => r.amount > 0 && r.amount <= 1000000);
}
export const cleanTypes = (rows: string[]) => [...new Set(rows.map((r) => r.trim()).filter(Boolean))];
export function reorder<T>(list: T[], from: number, to: number) {
  const out = [...list]; const [x] = out.splice(from, 1); out.splice(Math.max(0, Math.min(out.length, to)), 0, x); return out;
}
const TYPE_WORD: Record<RegistrationField['type'], string> = { text: 'טקסט חופשי', date: 'תאריך', choice: 'בחירה' };
export const questionMeta = (f: RegistrationField) => (f.type === 'choice' ? `בחירה · ${f.options.length} אפשרויות` : TYPE_WORD[f.type]);
export const fieldId = (label: string, taken: string[]) => { let base = 'q' + Math.abs([...label].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36).slice(0, 5); let id = base, n = 2; while (taken.includes(id)) id = base + n++; return id; };
/** N5 row lines. */
export function settingsLines(s: Settings & { donationOptions?: { custom?: boolean } }, owners: number, managers: number) {
  const pay = [s.payment.bit && 'ביט', s.payment.paybox && 'PayBox', s.payment.cash && 'מזומן בשער'].filter(Boolean).join(' · ') || 'לא הוגדר';
  const amounts = [...s.donationPresets.map((p) => String(p.amount)), ...(s.donationOptions?.custom === false ? [] : ['סכום אחר'])].join(' · ');
  return {
    payments: pay,
    amounts,
    types: `${s.visitTypes.length} סוגים`,
    questions: s.registrationFields.length ? s.registrationFields.map((f) => f.label.replace(/[?؟]/g, '').trim().split(/\s+/).slice(0, 2).join(' ')).join(', ') : 'אין שאלות נוספות',
    messages: 'אישור ביקור, תודה, תזכורת חוב',
    contact: s.contact?.phone || s.contact?.whatsapp || 'לא הוגדר',
    managers: `${owners} בעלים · ${managers} מנהלים`,
  };
}
