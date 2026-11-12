// One call for "what's going on at the farm": the numbers and the items that need attention, for the
// caller's role. Managers also get visits, payments, the notification queue and today's calendar.
import { type Caller, requireScope } from './auth';
import type { Operation } from './catalog';
import { type Doc, Firestore, enc } from './firestore';
import { isManager, project, todayIL } from './core';
import { mergedSettings } from './writes';
import { validate } from './util';

type F = Record<string, unknown>;
const eq = (field: string, value: unknown): F => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } });
const cmp = (field: string, op: string, value: string): F => ({ fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: value } } });
const where = (fl: F[]) => (fl.length ? { where: fl.length === 1 ? fl[0] : { compositeFilter: { op: 'AND', filters: fl } } } : {});

export const OVERVIEW_OPS: Operation[] = [
  {
    name: 'farm.overview', kind: 'read', method: 'GET', path: '/v1/overview', requiredScope: 'overview:read',
    he: 'תמונת מצב של החווה: משימות פתוחות/דחופות/להיום/באיחור, שלי, קניות, אירועים קרובים; למנהלים גם ביקורים, תשלומים, התראות ויומן היום',
    params: { date: { type: 'date', format: 'YYYY-MM-DD', timezone: 'Asia/Jerusalem', he: 'היום שלגביו (ברירת מחדל: היום)' } },
    notes: ['Start here for open questions ("what\'s happening", "what needs attention"). Lists are capped (20); counts are exact.', 'For details, follow up with the matching .list operation.'],
  },
  {
    name: 'settings.get', kind: 'read', method: 'GET', path: '/v1/settings', requiredScope: 'settings:read',
    he: 'הגדרות: פתיח לאורחים, סוגי ביקור, פרטי תשלום (ביט/PayBox), סכומי תרומה, נוסחי הודעות',
  },
];

const brief = (d: Doc, keys: string[]) => { const p = project('', d.id, d.data); return Object.fromEntries([['id', d.id], ...keys.map((k) => [k, p[k] ?? null])]); };
const TASK = ['title', 'dueDate', 'urgent', 'assignee', 'createdBy', 'createdAt'];

const inList = (field: string, values: string[]): F => ({ fieldFilter: { field: { fieldPath: field }, op: 'IN', value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } } });
const CAP = 20;
const byStr = (k: string, dir = 1) => (a: Doc, b: Doc) => dir * String(a.data[k] ?? '').localeCompare(String(b.data[k] ?? ''));

/**
 * Few round trips on purpose (the Free plan allows 10 ms of CPU per request): one query per collection,
 * only the fields needed, and the counts and lists derived from it. A count that hit its query's limit is
 * reported with "...Capped": true.
 */
export async function overview(fs: Firestore, caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'overview:read');
  const { date } = validate(OVERVIEW_OPS[0].params!, Object.fromEntries(query), true) as { date: string | null };
  const day = date || todayIL();
  const mgr = isManager(caller);
  const me = caller.actor.person.uid;
  const q = (col: string, fl: F[], fields: string[], limit: number, orderBy?: [string, 'ASCENDING' | 'DESCENDING']) =>
    fs.query({ from: [{ collectionId: col }], ...where(fl), select: { fields: fields.map((f) => ({ fieldPath: f })) }, ...(orderBy ? { orderBy: [{ field: { fieldPath: orderBy[0] }, direction: orderBy[1] }] } : {}), limit });
  const TASK_LIMIT = 1000, SHOP_LIMIT = 1000;

  const [tasks, shop, events] = await Promise.all([
    q('tasks', [...(mgr ? [] : [eq('managersOnly', false)]), eq('done', false)], [...TASK, 'managersOnly'], TASK_LIMIT),
    q('shopping', [eq('bought', false)], ['title', 'qty', 'category', 'urgent', 'createdAt'], SHOP_LIMIT),
    q('events', [cmp('start', 'GREATER_THAN_OR_EQUAL', day)], ['title', 'start', 'end', 'published', 'open', 'price', 'capacity'], 5, ['start', 'ASCENDING']),
  ]);
  const newest = byStr('createdAt', -1);
  const overdue = tasks.filter((d) => d.data.dueDate && String(d.data.dueDate) < day).sort(byStr('dueDate'));
  const out: Record<string, unknown> = {
    date: day,
    tasks: {
      open: tasks.length, ...(tasks.length >= TASK_LIMIT ? { openCapped: true } : {}), overdue: overdue.length,
      urgent: tasks.filter((d) => d.data.urgent).sort(newest).slice(0, CAP).map((d) => brief(d, TASK)),
      dueToday: tasks.filter((d) => d.data.dueDate === day).sort(newest).slice(0, CAP).map((d) => brief(d, TASK)),
      overdueItems: overdue.slice(0, CAP).map((d) => brief(d, TASK)),
      mine: tasks.filter((d) => (d.data.assignee as { uid?: string } | null)?.uid === me).sort(newest).slice(0, CAP).map((d) => brief(d, TASK)),
    },
    shopping: { open: shop.length, ...(shop.length >= SHOP_LIMIT ? { openCapped: true } : {}), urgent: shop.filter((d) => d.data.urgent).sort(newest).slice(0, CAP).map((d) => brief(d, ['title', 'qty', 'category'])) },
    upcomingEvents: events.filter((d) => mgr || d.data.published).map((d) => brief(d, ['title', 'start', 'end', 'published', 'open', 'price', 'capacity'])),
  };
  if (!mgr) return out;

  const [visits, donations, tickets, tabs, notifs, calendar, pendingPeople] = await Promise.all([
    q('visits', [inList('status', ['new', 'approved'])], ['name', 'phone', 'date', 'people', 'type', 'note', 'status'], 300),
    q('donations', [inList('paymentStatus', ['pending', 'claimed'])], ['name', 'amount', 'label', 'createdAt', 'paymentStatus'], 500),
    q('tickets', [inList('paymentStatus', ['pending', 'claimed'])], ['paymentStatus'], 2000),
    q('tabs', [inList('status', ['open', 'claimed'])], ['status'], 1000),
    q('notifications', [eq('handled', false)], ['type', 'title', 'text', 'createdAt'], 100, ['createdAt', 'DESCENDING']),
    q('calendar', [eq('date', day)], ['title', 'time', 'kind'], 30),
    fs.count({ from: [{ collectionId: 'users' }], where: eq('status', 'pending') }),
  ]);
  const count = (docs: Doc[], k: string, v: string) => docs.filter((d) => d.data[k] === v).length;
  return {
    ...out,
    visits: {
      new: visits.filter((d) => d.data.status === 'new').sort(byStr('date')).slice(0, CAP).map((d) => brief(d, ['name', 'phone', 'date', 'people', 'type', 'note'])),
      upcomingApproved: visits.filter((d) => d.data.status === 'approved' && String(d.data.date) >= day).sort(byStr('date')).slice(0, CAP).map((d) => brief(d, ['name', 'date', 'people', 'type'])),
    },
    payments: {
      donationsClaimed: donations.filter((d) => d.data.paymentStatus === 'claimed').sort(newest).slice(0, CAP).map((d) => brief(d, ['name', 'amount', 'label', 'createdAt'])),
      donationsPending: count(donations, 'paymentStatus', 'pending'),
      ticketsClaimed: count(tickets, 'paymentStatus', 'claimed'), ticketsPending: count(tickets, 'paymentStatus', 'pending'),
      tabsOpen: count(tabs, 'status', 'open'), tabsClaimed: count(tabs, 'status', 'claimed'),
    },
    notifications: { unhandled: notifs.length, ...(notifs.length >= 100 ? { unhandledCapped: true } : {}), latest: notifs.slice(0, 10).map((d) => brief(d, ['type', 'title', 'text', 'createdAt'])) },
    calendarToday: calendar.map((d) => brief(d, ['title', 'time', 'kind'])).sort((a, b) => String(a.time).localeCompare(String(b.time))),
    peoplePending: pendingPeople,
  };
}

export async function getSettings(fs: Firestore, caller: Caller) {
  requireScope(caller, 'settings:read');
  const d = await fs.get('settings', 'app');
  const s = mergedSettings(d?.data ?? null);
  delete s.id;
  return { settings: s };
}
