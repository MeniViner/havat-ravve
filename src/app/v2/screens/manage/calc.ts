// Manage area: pure helpers (no React, no data access). Everything that turns rows into numbers or words lives here,
import { isFemale as sharedIsFemale } from '../../gender';
// so tests/v2-manage.mjs can check it without a browser. "today" is always passed in (YYYY-MM-DD from clock.ts).
import type { Activity, AppNotification, Donation, Profile, Role, Settings, Tab, Ticket, Visit, RegistrationField } from '../../../types';
export * from './instinct';

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
    /** "ממתין": the amount marked as sent or not paid yet, waiting for a manager. */
    pending: ds.filter(awaitsApproval).reduce((s, d) => s + d.amount, 0),
  };
}
/** N3 chips: this month (and anything still unpaid), waiting, needs a receipt, with a memorial, this year, all. */
export type DonationFilter = 'month' | 'approve' | 'receipt' | 'memorial' | 'year' | 'all';
export function donationsIn(ds: Donation[], f: DonationFilter, today: string) {
  const m = monthStart(today), y = yearStart(today);
  return ds.filter((d) =>
    f === 'month' ? onOrAfter(d.createdAt, m) || awaitsApproval(d)
    : f === 'approve' ? awaitsApproval(d)
    : f === 'receipt' ? d.paymentStatus !== 'cancelled' && needsReceipt(d)
    : f === 'memorial' ? !!d.memorial
    : f === 'year' ? onOrAfter(d.createdAt, y)
    : true);
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

// ---------- reports extras (the old M10 numbers) ----------
/** Recurring tasks done in time: a template without an hour counts as in time; otherwise done (Israel time) by its hour. */
export function recurringOnTime(tasks: { templateId?: string | null; doneAt?: string | null }[], templates: { id: string; time: string }[], hhmmOf: (iso: string) => string) {
  const rec = tasks.filter((t) => t.templateId);
  const onTime = rec.filter((t) => { const tpl = templates.find((x) => x.id === t.templateId); return !tpl?.time || (!!t.doneAt && hhmmOf(t.doneAt).padStart(5, '0') <= tpl.time.padStart(5, '0')); }).length;
  return { total: rec.length, onTime, pct: rec.length ? Math.round((onTime / rec.length) * 100) : null };
}
/** The last 30 days of one recurring task (the old template "30 הימים האחרונים"): per day due / done / by whom, how many were
 *  due (no days = every day, as store.materializeToday does), how many done, and who did them most. Tasks match by dateKey. */
export function record30(days: number[], tasks: { dateKey?: string | null; done: boolean; doneBy?: { name: string } | null }[], today: string, first: (n: string) => string) {
  const grid = Array.from({ length: 30 }, (_, i) => {
    const k = addDaysKey(today, -29 + i);
    const due = !days.length || days.includes(new Date(keyMs(k)).getUTCDay());
    const t = tasks.find((x) => x.dateKey === k);
    return { k, due, done: !!t?.done, by: t?.done ? t.doneBy?.name || '' : '' };
  });
  const keys = new Set(grid.map((g) => g.k));
  const doneTasks = tasks.filter((t) => t.done && !!t.dateKey && keys.has(t.dateKey));
  const m = new Map<string, number>();
  for (const t of doneTasks) if (t.doneBy?.name) m.set(first(t.doneBy.name), (m.get(first(t.doneBy.name)) || 0) + 1);
  const expected = grid.filter((g) => g.due).length;
  return { grid, expected, done: Math.min(doneTasks.length, expected || doneTasks.length), who: [...m.entries()].sort((a, b) => b[1] - a[1]) };
}
/** People numbers of a period: new sign-ups, visits approved of requested, blocked (now). */
export function peopleStats(people: Pick<Profile, 'createdAt' | 'status'>[], visits: Pick<Visit, 'createdAt' | 'status'>[], from: string) {
  const reqV = visits.filter((v) => onOrAfter(v.createdAt, from));
  return {
    newPeople: people.filter((p) => onOrAfter(p.createdAt, from)).length,
    visitsApproved: reqV.filter((v) => v.status === 'approved').length,
    visitsRequested: reqV.length,
    blocked: people.filter((p) => p.status === 'blocked').length,
  };
}
/** "איך שמעו עלינו": answers to the `source` question, most first; no answer is "לא ענו". */
export function heardFrom(people: Pick<Profile, 'fields'>[]) {
  const m = new Map<string, number>();
  for (const p of people) { const s = (p.fields?.source || '').trim() || 'לא ענו'; m.set(s, (m.get(s) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

// ---------- inbox (M2) ----------
export type InboxGroup = 'payments' | 'visits' | 'contact' | 'other';
export const inboxGroup = (n: Pick<AppNotification, 'type'>): InboxGroup =>
  n.type === 'donation' || n.type === 'claim' || n.type === 'tab' ? 'payments' : n.type === 'visit' ? 'visits' : n.type === 'contact' ? 'contact' : 'other';
/** The inbox chips: the groups above plus the old app's own filters (receipts, stall accounts, orders). */
export type InboxFilter = 'all' | Exclude<InboxGroup, 'other'> | 'receipts' | 'stall' | 'orders';
export function inboxIn(n: Pick<AppNotification, 'type'>, f: InboxFilter) {
  if (f === 'all') return true;
  if (f === 'receipts') return n.type === 'receipt';
  if (f === 'stall') return n.type === 'tab';
  if (f === 'orders') return n.type === 'order' || n.type === 'claim' || n.type === 'join';
  return inboxGroup(n) === f;
}
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
/** Hebrew wording follows the person: the shared rule in v2/gender.ts. */
export function isFemale(name: string) { return sharedIsFemale(name); }
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
/** Q27: a manager may add ahead only volunteers; owners also managers and owners (role_invites and team_links rules).
 *  No "אורח": anyone who signs in is a guest, and the old "אורח" choice only removed an address set up in advance, which is
 *  "ביטול" on its row in the pending list. */
export type InviteRole = 'staff' | 'manager' | 'owner';
export const inviteRolesFor = (owner: boolean): InviteRole[] => (owner ? ['staff', 'manager', 'owner'] : ['staff']);
export const emailOk = (e: string) => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e.trim());

export const isTeam = (p: Pick<Profile, 'role' | 'status'>) => (p.role === 'staff' || p.role === 'manager' || p.role === 'owner') && p.status === 'active';
export function personMatches(p: Pick<Profile, 'displayName' | 'email' | 'phone' | 'customerNumber'> & { fields?: Record<string, string> }, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\D/g, '');
  return p.displayName.toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s) || (!!digits && (p.phone || '').replace(/\D/g, '').includes(digits)) || (!!userNumber(p.customerNumber) && String(p.customerNumber) === s.replace(/^#/, ''))
    // the answers to the registration questions (town, how they heard of us…)
    || Object.values(p.fields || {}).some((v) => String(v || '').toLowerCase().includes(s));
}
/** Existing numbers are display identifiers; an absent/invalid number must never become a route. */
export const userNumber = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;

type NamedPerson = { displayName: string; uid?: string; fields?: Record<string, string> };
export function letterGroups<T extends NamedPerson>(people: T[], questions: RegistrationField[] = []) {
  const firstId = questions.find((q) => q.type === 'text' && q.label.trim() === 'שם פרטי')?.id;
  const lastId = questions.find((q) => q.type === 'text' && q.label.trim() === 'שם משפחה')?.id;
  const named = people.map((person) => {
    // Old profiles have a single display name. Keep all words after the first together (e.g. בן דוד).
    const [given, ...rest] = person.displayName.trim().split(/\s+/);
    const first = (firstId && person.fields?.[firstId]?.trim()) || given;
    const last = (lastId && person.fields?.[lastId]?.trim()) || rest.join(' ') || given;
    return { person, first, last };
  });
  named.sort((a, b) => a.last.localeCompare(b.last, 'he') || a.first.localeCompare(b.first, 'he') || (a.person.uid || '').localeCompare(b.person.uid || ''));
  const groups = new Map<string, T[]>();
  for (const { person, last } of named) {
    const letter = last[0] || '?';
    const group = groups.get(letter);
    if (group) group.push(person); else groups.set(letter, [person]);
  }
  return [...groups.entries()];
}

const orderKey = (eventId: string, orderId: string) => JSON.stringify([eventId, orderId]);
/** Legacy ownerUid may be the cashier. Only self-order receipts identify their actual registrant. */
export function registeredTickets(tickets: Ticket[], activity: Activity[]) {
  const receipts = new Set(activity
    .filter((a) => a.kind === 'ticket' && a.action === 'ordered' && a.subjectUid && a.subjectUid === a.by.uid && a.eventId && a.refId)
    .map((a) => JSON.stringify([a.subjectUid, a.eventId, a.refId])));
  return tickets.filter((t) => t.ownerUid && !t.walkIn && (t.selfRegistered === true ||
    (t.selfRegistered === undefined && receipts.has(JSON.stringify([t.ownerUid, t.eventId, t.orderId])))));
}

/** One row per purchase, including cancelled purchases. Repeat entry scans count as one attendee. */
export function personOrders(tickets: Ticket[]) {
  const orders = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const key = orderKey(t.eventId, t.orderId);
    const order = orders.get(key);
    if (order) order.push(t); else orders.set(key, [t]);
  }
  return [...orders.values()].map((order) => {
    const first = order.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
    return { first, tickets: order, arrived: order.filter((t) => t.entries > 0).length };
  }).sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt) || a.first.orderId.localeCompare(b.first.orderId));
}
// ---------- activity (N14) ----------
export type ActivityFilter = 'all' | 'money' | 'people' | 'tasks' | 'events' | 'shopping' | 'settings' | 'messages';
export function activityGroup(kind: Activity['kind']): Exclude<ActivityFilter, 'all'> | 'other' {
  if (kind === 'ticket' || kind === 'tab' || kind === 'donation') return 'money';
  if (kind === 'user' || kind === 'visit') return 'people';
  if (kind === 'task' || kind === 'task_private' || kind === 'shopping' || kind === 'place') return 'tasks';
  if (kind === 'event' || kind === 'calendar' || kind === 'calendar_private') return 'events';
  if (kind === 'message') return 'messages';
  if (kind === 'project') return 'tasks';
  return 'other';
}
/** Does an activity line belong under this chip? Shopping and settings have chips of their own (tasks ≠ shopping). */
export function activityInFilter(kind: Activity['kind'], filter: ActivityFilter) {
  if (filter === 'all') return true;
  if (filter === 'shopping') return kind === 'shopping';
  if (filter === 'settings') return kind === 'settings';
  if (filter === 'tasks' && kind === 'shopping') return false;
  return activityGroup(kind) === filter;
}
/** The chips of one event's history (the old "היסטוריית האירוע"): orders, payments, stall, edits. */
export type EventActivityFilter = 'all' | 'orders' | 'payments' | 'stall' | 'edits';
export function eventActivityIn(a: Pick<Activity, 'kind' | 'action'>, filter: EventActivityFilter) {
  if (filter === 'all') return true;
  if (filter === 'orders') return a.action === 'ordered' || a.action === 'cancelled';
  if (filter === 'payments') return a.action === 'paid' || a.action === 'claimed';
  if (filter === 'stall') return a.kind === 'tab';
  return a.kind === 'event';
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
  // the other actions the app logs, in the words the task and shopping histories already use (data/tasks.ts, data/shopping.ts)
  'assigned': { m: 'העביר', f: 'העבירה', join: ':' },
  'released': { m: 'שחרר', f: 'שחררה', join: ':' },
  'deleted': { m: 'מחק', f: 'מחקה', join: ':' },
  'unbought': { m: 'החזיר לרשימה', f: 'החזירה לרשימה', join: ':' },
  'found': { m: 'מצא', f: 'מצאה', join: ':' },
  'unavailable': { m: 'סימן שלא היה במדף', f: 'סימנה שלא היה במדף', join: ':' },
  'unpublished': { m: 'הוריד מפרסום', f: 'הורידה מפרסום', join: ':' },
  'closed': { m: 'סגר', f: 'סגרה', join: ':' },
  'reopened': { m: 'פתח מחדש', f: 'פתחה מחדש', join: ':' },
};
/** Same action, other meaning on another kind: a vendor invited to an event, a ticket stopped at the gate. */
const KIND_VERBS: Record<string, Verb> = {
  'message:personal_notification_created': { m: 'יצר התראה אישית', f: 'יצרה התראה אישית', join: ':' },
  'message:message_sent': { m: 'שלח הודעה', f: 'שלחה הודעה', join: ':' },
  'message:message_resent': { m: 'שלח שוב הודעה', f: 'שלחה שוב הודעה', join: ':' },
  'message:message_deleted': { m: 'מחק הודעה', f: 'מחקה הודעה', join: ':' },
  'event:invited': { m: 'הזמין', f: 'הזמינה', join: ':' },
  'event:added': { m: 'הוסיף', f: 'הוסיפה', join: ':' },
  'event:removed': { m: 'הסיר', f: 'הסירה', join: ':' },
  'ticket:rejected': { m: 'סרק', f: 'סרקה', join: ':' },
};
/** Role labels in older texts carry both forms ("מתנדב/ת"): keep the one that fits the person. */
const roleFor = (label: string, name: string) => label.replace(/\/ת$/, isFemale(name) ? 'ת' : '');
const KIND_WORD: Record<string, string> = { task: 'משימות', task_private: 'משימות מנהלים', shopping: 'קניות', event: 'אירועים', ticket: 'כרטיסים', tab: 'דוכן', place: 'מקומות', visit: 'ביקורים', donation: 'תרומה', user: 'אנשים', settings: 'הגדרות', project: 'פרויקט', inbox: 'לטיפול', calendar: 'יומן', calendar_private: 'יומן מנהלים' };
/**
 * One feed line: "בני אישר תשלום: 150 ₪ · רוני לוי" + meta "פסטיבל הסתיו · 3 כרטיסים".
 * Team members appear by first name, guests by full name. The text's first segment goes in the line, the rest is the meta
 * (a text with a line break puts everything before it in the line). Shopping "created" reads "הוסיף לקניות".
 */
export function activityLine(a: Pick<Activity, 'kind' | 'action' | 'text' | 'by'> & { subjectUid?: string }, team: Set<string>) {
  const who = team.has(a.by.uid) ? (a.by.name.trim().split(/\s+/)[0] || a.by.name) : a.by.name;
  const female = isFemale(a.by.name);
  const action = a.kind === 'shopping' && a.action === 'created' ? 'added' : a.action;
  const took = action === 'assigned' && !!a.subjectUid && a.subjectUid === a.by.uid;
  const v = took ? { m: 'לקח', f: 'לקחה', join: ':' as const } : KIND_VERBS[`${a.kind}:${action}`] || VERBS[action] || { m: action, f: action, join: ':' as const };
  let text = a.text || '';
  let m: RegExpMatchArray | null;
  if (action === 'role' && (m = text.match(/^(.*?): (.*) ← (.*)$/))) text = `${m[1]}, ${roleFor(m[3], m[1])}`;
  // older texts repeat the action with both gender forms ("מיכל בר נחסם/ה"): the verb already says it
  else if ((action === 'blocked' || action === 'unblocked') && a.kind === 'user') text = text.replace(/ (נחסם|שוחרר)\/ה$/, '');
  else if (action === 'joined' && / נרשם\/ה$/.test(text)) text = '';
  else if (action === 'invited' && a.kind === 'user' && (m = text.match(/^(.*) הוגדר\/ה מראש כ(.*)$/))) text = `${m[1]} · ${roleFor(m[2], '')}`;
  else if (action === 'invited' && a.kind === 'event') text = text.replace(/ הוזמן לדוכן$/, '');
  else if (a.kind === 'event' && (action === 'closed' || action === 'reopened')) text = text.replace(/ (נסגר|נפתח מחדש)$/, '');
  else if (action === 'assigned' && (m = text.match(/^(.*) ← (.*)$/))) text = took ? m[1] : `${m[1]} · ל${m[2].trim().split(/\s+/)[0]}`;
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
    /** Q19 "סוגי ביקור ושאלות הרשמה" */
    typesQuestions: `${s.visitTypes.length} סוגים · ${s.registrationFields.length} שאלות`,
    questions: s.registrationFields.length ? s.registrationFields.map((f) => f.label.replace(/[?؟]/g, '').trim().split(/\s+/).slice(0, 2).join(' ')).join(', ') : 'אין שאלות נוספות',
    messages: 'אישור ביקור, תודה, תזכורת חוב',
    contact: s.contact?.phone || s.contact?.whatsapp || 'לא הוגדר',
    managers: `${owners} בעלים · ${managers} מנהלים`,
  };
}
