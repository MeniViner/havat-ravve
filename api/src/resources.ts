// Generic reads: every collection of the app, listed and fetched with the same rules the app's Firestore
// Rules apply. Each resource below becomes "<name>.list" and "<name>.get" in the catalog.
import { ApiError, invalid } from './http';
import { type Caller, type Scope, requireScope } from './auth';
import type { Operation, Param } from './catalog';
import { type Doc, Firestore, enc } from './firestore';
import { isManager, project, todayIL } from './core';
import { b64url, canonical, sha256hex, validate } from './util';

type Dir = 'ASCENDING' | 'DESCENDING';
type Filter = { field: string; param: Param };
export type ResourceDef = {
  name: string;
  col: string;
  /** Subcollection: the parent document is events/{eventId}. */
  parent?: { param: string; col: string };
  path: string;
  he: string;
  scope: Scope;
  order: { field: string; dir: Dir };
  filters?: Record<string, Filter>;
  /** A range on the order field: params "<from>" and "<to>" (YYYY-MM-DD, inclusive). */
  range?: { from: string; to: string; he: string };
  /** Extra condition for callers who are not managers, mirroring the Rules; null means "no access". */
  restrict?: (c: Caller, given: Record<string, unknown>) => Record<string, unknown>[] | null;
  /** Whether a single document is visible to this caller (for .get). */
  visible?: (c: Caller, d: Record<string, unknown>) => boolean;
  notes?: string[];
  /** Last step before items leave the server (e.g. hiding what a role may not see). */
  redact?: (fs: Firestore, c: Caller, items: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
};

/**
 * The app writes the real title of a manager-only task into the activity log, which staff can read, so
 * the title leaks there. For staff, task entries keep their text only while the task exists and is not
 * manager-only; otherwise the text becomes generic. (Deleted tasks can't be checked, so they are hidden too.)
 */
async function redactTaskActivity(fs: Firestore, c: Caller, items: Record<string, unknown>[]) {
  if (isManager(c)) return items;
  const ids = [...new Set(items.filter((a) => a.kind === 'task').map((a) => String(a.refId)))];
  const visible = new Set((await fs.getMany('tasks', ids)).filter((d) => !d.data.managersOnly).map((d) => d.id));
  return items.map((a) => (a.kind === 'task' && !visible.has(String(a.refId)) ? { ...a, text: 'משימה שאינה זמינה לך', redacted: true } : a));
}

const eq = (field: string, value: unknown) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } });
const s = (he: string): Param => ({ type: 'string', max: 200, he });
const id = (he: string): Param => ({ type: 'id', he });
const bool = (he: string): Param => ({ type: 'bool', he });
const en = (values: string[], he: string): Param => ({ type: 'enum', values, he });

export const PAYMENT = ['free', 'pending', 'claimed', 'paid', 'paid_onsite', 'cancelled'];
export const TEAM_KINDS = ['task', 'shopping', 'event', 'ticket', 'tab', 'place'];
const ALL_KINDS = [...TEAM_KINDS, 'visit', 'donation', 'user', 'settings'];

export const RESOURCES: ResourceDef[] = [
  {
    name: 'templates', col: 'task_templates', path: '/v1/templates', scope: 'templates:read',
    he: 'משימות קבועות (חוזרות): ימים בשבוע (0=ראשון), שעה, פעילה או לא',
    order: { field: 'createdAt', dir: 'ASCENDING' },
    filters: { active: { field: 'active', param: bool('רק פעילות / רק מושבתות') } },
    restrict: (c) => (isManager(c) ? [] : [eq('managersOnly', false)]),
    visible: (c, d) => isManager(c) || !d.managersOnly,
    notes: ['Every day the app creates that day\'s task from each active template (id "<templateId>_<date>").'],
  },
  { name: 'places', col: 'places', path: '/v1/places', scope: 'places:read', he: 'מקומות בחווה (שם וקואורדינטות)', order: { field: 'name', dir: 'ASCENDING' } },
  {
    name: 'profiles', col: 'users', path: '/v1/profiles', scope: 'people:read',
    he: 'כל האנשים הרשומים באפליקציה, כולל אורחים: תפקיד, מצב, טלפון, מייל, הערות והיסטוריה',
    order: { field: 'displayName', dir: 'ASCENDING' },
    filters: {
      role: { field: 'role', param: en(['owner', 'manager', 'staff', 'guest'], 'owner בעלים, manager מנהל, staff מתנדב, guest אורח') },
      status: { field: 'status', param: en(['active', 'pending', 'blocked'], 'active פעיל, pending ממתין, blocked חסום') },
    },
    notes: ['To find someone by name, use people.search. This list is for browsing and counting.'],
  },
  { name: 'roleInvites', col: 'role_invites', path: '/v1/role-invites', scope: 'people:read', he: 'מיילים שהוגדר להם תפקיד מראש (יקבלו אותו כשיירשמו)', order: { field: 'createdAt', dir: 'DESCENDING' } },
  { name: 'joinCodes', col: 'invites', path: '/v1/join-codes', scope: 'people:read', he: 'קודי הצטרפות לצוות', order: { field: 'createdAt', dir: 'DESCENDING' } },
  {
    name: 'events', col: 'events', path: '/v1/events', scope: 'events:read',
    he: 'אירועים: מועד, מחיר, קיבולת, פתוח להרשמה, מפורסם',
    order: { field: 'start', dir: 'DESCENDING' },
    filters: { published: { field: 'published', param: bool('מפורסם לאורחים') }, open: { field: 'open', param: bool('פתוח להרשמה') } },
    range: { from: 'startFrom', to: 'startTo', he: 'מועד ההתחלה' },
    notes: ['start/end are "YYYY-MM-DDTHH:mm" in Israel time. Latest first; for upcoming events pass startFrom=<today>.', 'Tickets sold: tickets.list with eventId (countOnly=true for a number).'],
  },
  {
    name: 'eventVendors', col: 'vendors', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/vendors', scope: 'events:read',
    he: 'דוכנים/ספקים ששובצו לאירוע ואם אישרו הגעה', order: { field: 'name', dir: 'ASCENDING' },
  },
  {
    name: 'eventProducts', col: 'products', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/products', scope: 'events:read',
    he: 'מוצרים ומחירים בדוכן של האירוע', order: { field: 'sort', dir: 'ASCENDING' },
  },
  {
    name: 'tickets', col: 'tickets', path: '/v1/tickets', scope: 'tickets:read',
    he: 'כרטיסים שהוזמנו: מי הזמין, לאיזה אירוע, מצב תשלום, כניסות',
    order: { field: 'createdAt', dir: 'DESCENDING' },
    filters: {
      eventId: { field: 'eventId', param: id('אירוע') }, orderId: { field: 'orderId', param: id('הזמנה (כל הכרטיסים שהוזמנו יחד)') },
      ownerUid: { field: 'ownerUid', param: id('המזמין') },
      paymentStatus: { field: 'paymentStatus', param: en(PAYMENT, 'free חינם, pending ממתין, claimed דווח שהועבר, paid שולם, paid_onsite שולם במקום, cancelled בוטל') },
      status: { field: 'status', param: en(['valid', 'cancelled'], 'valid בתוקף, cancelled בוטל') },
    },
    notes: ['The QR secret is never returned.', 'One order = several tickets with the same orderId.'],
  },
  {
    name: 'visits', col: 'visits', path: '/v1/visits', scope: 'visits:read',
    he: 'בקשות ביקור בחווה: מי, מתי, כמה אנשים, סוג, מצב',
    order: { field: 'date', dir: 'DESCENDING' },
    filters: { status: { field: 'status', param: en(['new', 'approved', 'rejected', 'cancelled'], 'new חדש, approved אושר, rejected לא מתאים, cancelled בוטל') }, uid: { field: 'uid', param: id('המבקש') } },
    range: { from: 'dateFrom', to: 'dateTo', he: 'תאריך הביקור' },
  },
  {
    name: 'donations', col: 'donations', path: '/v1/donations', scope: 'donations:read',
    he: 'תרומות: סכום, מטרה, הנצחה, מצב תשלום, קבלה',
    order: { field: 'createdAt', dir: 'DESCENDING' },
    filters: {
      paymentStatus: { field: 'paymentStatus', param: en(['pending', 'claimed', 'paid', 'cancelled'], 'pending ממתין, claimed דווח שהועבר, paid שולם, cancelled בוטל') },
      uid: { field: 'uid', param: id('התורם') },
      receiptWanted: { field: 'receiptWanted', param: bool('ביקש קבלה') }, receiptSent: { field: 'receiptSent', param: bool('הקבלה נשלחה') },
    },
  },
  {
    name: 'vendors', col: 'vendors', path: '/v1/vendors', scope: 'vendors:read', he: 'ספקים ובעלי דוכנים (טלפון, מה מוכרים)',
    order: { field: 'name', dir: 'ASCENDING' }, filters: { external: { field: 'external', param: bool('חיצוני') } },
  },
  {
    name: 'tabs', col: 'tabs', path: '/v1/tabs', scope: 'tabs:read', he: 'חשבונות פתוחים בדוכן של אירוע: מה נלקח, כמה לתשלום, מצב',
    order: { field: 'createdAt', dir: 'DESCENDING' },
    filters: {
      eventId: { field: 'eventId', param: id('אירוע') }, guestUid: { field: 'guestUid', param: id('האורח') },
      status: { field: 'status', param: en(['open', 'claimed', 'paid', 'waived'], 'open פתוח, claimed דווח שהועבר, paid שולם, waived נמחל') },
    },
  },
  {
    name: 'notifications', col: 'notifications', path: '/v1/notifications', scope: 'notifications:read', he: 'תור ההתראות למנהלים (ביקורים, תרומות, הזמנות, תשלומים)',
    order: { field: 'createdAt', dir: 'DESCENDING' },
    filters: { handled: { field: 'handled', param: bool('טופל') }, type: { field: 'type', param: en(['visit', 'donation', 'join', 'order', 'receipt', 'tab', 'claim'], 'סוג ההתראה') } },
  },
  {
    name: 'calendar', col: 'calendar', path: '/v1/calendar', scope: 'calendar:read', he: 'יומן המנהלים: פריטים ידניים, ביקורים מאושרים ואירועים מפורסמים',
    order: { field: 'date', dir: 'ASCENDING' },
    filters: { kind: { field: 'kind', param: en(['manual', 'visit', 'event'], 'manual ידני, visit ביקור, event אירוע') } },
    range: { from: 'dateFrom', to: 'dateTo', he: 'תאריך' },
  },
  {
    name: 'activity', col: 'activity', path: '/v1/activity', scope: 'activity:read', he: 'יומן הפעילות: מי עשה מה ומתי, בכל המערכת',
    order: { field: 'at', dir: 'DESCENDING' },
    filters: {
      kind: { field: 'kind', param: en(ALL_KINDS, 'task, shopping, event, ticket, tab, place, visit, donation, user, settings') },
      refId: { field: 'refId', param: id('הרשומה שהפעולה עליה') }, subjectUid: { field: 'subjectUid', param: id('האדם שהפעולה נוגעת אליו') },
      eventId: { field: 'eventId', param: id('אירוע') }, byUid: { field: 'by.uid', param: id('מי ביצע') },
      action: { field: 'action', param: s('created, edited, done, undone, deleted, assigned, bought, paid, approved...') },
    },
    restrict: (c, given) => {
      if (isManager(c)) return [];
      if (given.kind) return TEAM_KINDS.includes(String(given.kind)) ? [] : null;
      return [{ fieldFilter: { field: { fieldPath: 'kind' }, op: 'IN', value: { arrayValue: { values: TEAM_KINDS.map((k) => ({ stringValue: k })) } } } }];
    },
    visible: (c, d) => isManager(c) || TEAM_KINDS.includes(String(d.kind)),
    redact: redactTaskActivity,
    notes: ['Newest first. "at" is an ISO time in UTC.', 'Staff see only task, shopping, event, ticket, tab and place entries, as in the app, and task entries of manager-only or deleted tasks come with generic text ("redacted": true).'],
  },
];

// ---------- catalog entries ----------

const PAGE: Record<string, Param> = {
  limit: { type: 'int', min: 1, max: 100, default: 25 },
  cursor: { type: 'string', max: 600, he: 'nextCursor מהעמוד הקודם, עם אותם מסננים' },
  countOnly: { type: 'bool', default: false, he: 'true: רק מספר התוצאות, בלי הרשומות' },
};
const listParams = (r: ResourceDef): Record<string, Param> => ({
  ...Object.fromEntries(Object.entries(r.filters || {}).map(([k, f]) => [k, f.param])),
  ...(r.range ? { [r.range.from]: { type: 'date', format: 'YYYY-MM-DD', timezone: 'Asia/Jerusalem', he: `${r.range.he} מ־ (כולל)` } as Param, [r.range.to]: { type: 'date', format: 'YYYY-MM-DD', timezone: 'Asia/Jerusalem', he: `${r.range.he} עד (כולל)` } as Param } : {}),
  ...PAGE,
});
const pathParams = (r: ResourceDef, withId: boolean): Record<string, Param> | undefined => {
  const p: Record<string, Param> = {};
  if (r.parent) p[r.parent.param] = { type: 'id', required: true };
  if (withId) p.id = { type: 'id', required: true };
  return Object.keys(p).length ? p : undefined;
};

export function resourceOperations(): Operation[] {
  return RESOURCES.flatMap((r) => [
    {
      name: `${r.name}.list`, kind: 'read', he: r.he, method: 'GET', path: r.path, requiredScope: r.scope,
      pathParams: pathParams(r, false), params: listParams(r),
      notes: [`Ordered by ${r.order.field} ${r.order.dir === 'ASCENDING' ? 'ascending' : 'descending'}. Response: "items", "hasMore", "nextCursor"; with countOnly=true: "count".`, ...(r.notes || [])],
    } satisfies Operation,
    {
      name: `${r.name}.get`, kind: 'read', he: `${r.he} (רשומה אחת לפי מזהה)`, method: 'GET', path: `${r.path}/{id}`, requiredScope: r.scope,
      pathParams: pathParams(r, true),
    } satisfies Operation,
  ]);
}

// ---------- handlers ----------

type Cursor = { v: unknown; n: string; f: string };

export async function listResource(fs: Firestore, caller: Caller, r: ResourceDef, parentId: string | null, query: URLSearchParams) {
  requireScope(caller, r.scope);
  const raw: Record<string, string> = {};
  for (const [k, v] of query) { if (k in raw) throw invalid(k, `"${k}" given twice`); raw[k] = v; }
  const p = validate(listParams(r), raw, true) as Record<string, unknown> & { limit: number; cursor: string | null; countOnly: boolean };
  if (r.parent) validate({ [r.parent.param]: { type: 'id', required: true } }, { [r.parent.param]: parentId });

  const given = Object.fromEntries(Object.keys(r.filters || {}).filter((k) => p[k] !== null).map((k) => [k, p[k]]));
  const extra = r.restrict ? r.restrict(caller, given) : [];
  if (extra === null) throw new ApiError('FORBIDDEN', `actor ${caller.actor.id} may not read these ${r.name}`);
  const filters: Record<string, unknown>[] = [...extra];
  for (const [k, f] of Object.entries(r.filters || {})) if (p[k] !== null) filters.push(eq(f.field, p[k]));
  if (r.range) {
    const from = p[r.range.from] as string | null, to = p[r.range.to] as string | null;
    if (from) filters.push({ fieldFilter: { field: { fieldPath: r.order.field }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: from } } });
    // inclusive end date, also for "YYYY-MM-DDTHH:mm" and ISO time values on that date
    if (to) filters.push({ fieldFilter: { field: { fieldPath: r.order.field }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: to + '￿' } } });
  }
  const where = filters.length ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } : {};
  const parent = r.parent ? `${r.parent.col}/${parentId}` : '';
  if (p.countOnly) {
    if (parent) return { count: (await fs.query({ from: [{ collectionId: r.col }], ...where, select: { fields: [] }, limit: 1000 }, parent)).length };
    return { count: await fs.count({ from: [{ collectionId: r.col }], ...where }) };
  }

  const fingerprint = (await sha256hex(canonical({ r: r.name, parent, given, range: r.range ? [p[r.range.from], p[r.range.to]] : null, m: isManager(caller) }))).slice(0, 16);
  let startAt: Record<string, unknown> | undefined;
  if (p.cursor) {
    let c: Cursor;
    try { c = JSON.parse(b64url.decode(p.cursor)); } catch { throw invalid('cursor', 'cursor is not valid'); }
    if (!c || typeof c.n !== 'string' || !/^[A-Za-z0-9_@.+-]{1,200}$/.test(c.n)) throw invalid('cursor', 'cursor is not valid');
    if (c.f !== fingerprint) throw invalid('cursor', 'cursor belongs to a different filter');
    startAt = { values: [enc(c.v), { referenceValue: fs.name(parent ? `${parent}/${r.col}` : r.col, c.n) }], before: false };
  }
  const docs = await fs.query({
    from: [{ collectionId: r.col }], ...where,
    orderBy: [{ field: { fieldPath: r.order.field }, direction: r.order.dir }, { field: { fieldPath: '__name__' }, direction: r.order.dir }],
    ...(startAt ? { startAt } : {}),
    limit: p.limit + 1,
  }, parent);
  const page = docs.slice(0, p.limit);
  const last = page[page.length - 1];
  const hasMore = docs.length > p.limit;
  const items = page.map((d) => project(r.col, d.id, d.data));
  return {
    items: r.redact ? await r.redact(fs, caller, items) : items,
    hasMore,
    nextCursor: hasMore && last ? b64url.encode(JSON.stringify({ v: last.data[r.order.field] ?? null, n: last.id, f: fingerprint })) : null,
  };
}

export async function getResource(fs: Firestore, caller: Caller, r: ResourceDef, parentId: string | null, docId: string) {
  requireScope(caller, r.scope);
  validate(pathParams(r, true)!, { ...(r.parent ? { [r.parent.param]: parentId } : {}), id: docId });
  const d: Doc | null = await fs.get(r.parent ? `${r.parent.col}/${parentId}/${r.col}` : r.col, docId);
  if (!d || (r.visible && !r.visible(caller, d.data))) throw new ApiError('NOT_FOUND', `${r.name} record not found`);
  const rec = project(r.col, d.id, d.data);
  return { record: r.redact ? (await r.redact(fs, caller, [rec]))[0] : rec };
}

/** Matches a GET path against the resources: list or get, with the parent id for subcollections. */
export function matchResource(path: string): { r: ResourceDef; parentId: string | null; id: string | null } | null {
  for (const r of RESOURCES) {
    const pattern = '^' + r.path.replace('{eventId}', '([^/]+)') + '(?:/([^/]+))?$';
    const m = new RegExp(pattern).exec(path);
    if (!m) continue;
    const parentId = r.parent ? decodeURIComponent(m[1]) : null;
    const rest = r.parent ? m[2] : m[1];
    // "/v1/events/{id}/vendors" must not be read as events.get with id "{id}/vendors"
    return { r, parentId, id: rest ? decodeURIComponent(rest) : null };
  }
  return null;
}

export { todayIL };
