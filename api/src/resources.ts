import { TEAM_ACTIVITY_KINDS } from '../../shared/activity';
// Generic reads: every collection of the app, listed and fetched with the same rules the app's Firestore
// Rules apply. Each resource below becomes "<name>.list" and "<name>.get" in the catalog.
import { ApiError, invalid } from './http';
import { type Caller, type Scope, requireScope } from './auth';
import type { Operation, Param } from './catalog';
import { type Doc, Firestore, enc } from './firestore';
import { isManager, project, todayIL } from './core';
import { b64url, canonical, sha256hex, validate } from './util';
import { farmTime, isoFromIL } from './writes';

type Dir = 'ASCENDING' | 'DESCENDING';
type Filter = { field: string; param: Param };
export type ResourceDef = {
  name: string;
  col: string;
  /** Subcollection: the parent document is <col>/{<param>} (e.g. events/{eventId}); the path names the same {<param>}. */
  parent?: { param: string; col: string };
  /** Subcollection of the caller's own profile: users/<caller uid>/<col> (e.g. their personal notifications). */
  mine?: boolean;
  path: string;
  he: string;
  scope: Scope;
  order: { field: string; dir: Dir };
  filters?: Record<string, Filter>;
  /** A range on the order field: params "<from>" and "<to>" (YYYY-MM-DD, inclusive). */
  range?: { from: string; to: string; he: string };
  /** The stored values the range compares against, when they are not plain dates (e.g. ISO instants in UTC). */
  rangeBounds?: (from: string | null, to: string | null) => [string | null, string | null];
  /** Extra condition for callers who are not managers, mirroring the Rules; null means "no access". */
  restrict?: (c: Caller, given: Record<string, unknown>) => Record<string, unknown>[] | null;
  /** Whether a single document is visible to this caller (for .get). */
  visible?: (c: Caller, d: Record<string, unknown>) => boolean;
  notes?: string[];
  /** Last step before items leave the server (e.g. hiding what a role may not see). */
  redact?: (fs: Firestore, c: Caller, items: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
};

/**
 * A manager-only task logs as 'task_private', which staff never receive. Entries written before that kind
 * existed may still carry such a title under 'task'. For staff, task entries keep their text only while the
 * task exists and is not manager-only; otherwise the text becomes generic. (Deleted tasks can't be checked.)
 */
async function redactTaskActivity(fs: Firestore, c: Caller, items: Record<string, unknown>[]) {
  if (isManager(c)) return items;
  const ids = [...new Set(items.filter((a) => a.kind === 'task').map((a) => String(a.refId)))];
  const visible = new Set((await fs.getMany('tasks', ids)).filter((d) => !d.data.managersOnly).map((d) => d.id));
  return items.map((a) => (a.kind === 'task' && !visible.has(String(a.refId)) ? { ...a, text: 'משימה שאינה זמינה לך', redacted: true } : a));
}

/** A profile's push subscriptions (endpoints, keys, tokens) never leave the server: only how many devices there are. */
export function dropPushDevices(rec: Record<string, unknown>): Record<string, unknown> {
  const p = rec.push;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return rec;
  const { devices, ...rest } = p as Record<string, unknown>;
  return { ...rec, push: { ...rest, deviceCount: Array.isArray(devices) ? devices.length : 0 } };
}
const redactProfiles = async (_fs: Firestore, _c: Caller, items: Record<string, unknown>[]) => items.map(dropPushDevices);
/** Volunteers' screens drop calendar items meant for managers (audience 'managers'), so the API does too. */
const redactCalendar = async (_fs: Firestore, c: Caller, items: Record<string, unknown>[]) => (isManager(c) ? items : items.filter((i) => i.audience !== 'managers'));
/** Events: start/end are ISO instants (older events: Israel wall time); both also as Israel "YYYY-MM-DDTHH:mm". */
const redactEvents = async (_fs: Firestore, _c: Caller, items: Record<string, unknown>[]) => items.map((e) => ({ ...e, startLocal: e.start ? farmTime(String(e.start)) : '', endLocal: e.end ? farmTime(String(e.end)) : '' }));
/** startFrom/startTo are Israeli dates; stored starts are ISO instants in UTC, so the bounds are the day's first and last instant. */
function eventDayBounds(from: string | null, to: string | null): [string | null, string | null] {
  const next = (d: string) => new Date(Date.parse(d + 'T12:00:00Z') + 86400_000).toISOString().slice(0, 10);
  return [from ? isoFromIL(from) : null, to ? new Date(Date.parse(isoFromIL(next(to))) - 1).toISOString() : null];
}
/** A file the app stored inline (data: URL) is a flag, not megabytes of base64. */
const redactFiles = async (_fs: Firestore, _c: Caller, items: Record<string, unknown>[]) => items.map((f) => (String(f.url || '').startsWith('data:') ? { ...f, url: null, hasData: true } : f));
const redactOutbox = async (_fs: Firestore, _c: Caller, items: Record<string, unknown>[]) => items.map(({ to: _to, ...rest }) => rest);
/** Managers also get the team's notes about each stall (vendors/{id}/private/main; older stalls: the public notes field). */
async function redactVendors(fs: Firestore, c: Caller, items: Record<string, unknown>[]) {
  if (!isManager(c)) return items;
  const priv = new Map((await fs.getMany('vendors', items.map((v) => `${v.id}/private/main`))).map((d) => [d.name.split('/').slice(-3)[0], d.data]));
  return items.map((v) => ({ ...v, privateNotes: String(priv.get(String(v.id))?.notes ?? v.notes ?? '') }));
}

const eq = (field: string, value: unknown) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } });
const s = (he: string): Param => ({ type: 'string', max: 200, he });
const id = (he: string): Param => ({ type: 'id', he });
const bool = (he: string): Param => ({ type: 'bool', he });
const en = (values: string[], he: string): Param => ({ type: 'enum', values, he });

export const PAYMENT = ['free', 'pending', 'claimed', 'paid', 'paid_onsite', 'cancelled'];
const TEAM_KINDS: readonly string[] = TEAM_ACTIVITY_KINDS;
const ALL_KINDS = [...TEAM_KINDS, 'task_private', 'visit', 'donation', 'user', 'settings', 'project', 'calendar_private', 'inbox'];

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
    redact: redactProfiles,
    notes: ['To find someone by name, use people.search. This list is for browsing and counting.', 'Push subscriptions are never returned: "push" carries enabled, kinds and deviceCount only.'],
  },
  { name: 'roleInvites', col: 'role_invites', path: '/v1/role-invites', scope: 'people:read', he: 'מיילים שהוגדר להם תפקיד מראש (יקבלו אותו כשיירשמו)', order: { field: 'createdAt', dir: 'DESCENDING' } },
  { name: 'joinCodes', col: 'invites', path: '/v1/join-codes', scope: 'people:read', he: 'קודי הצטרפות לצוות', order: { field: 'createdAt', dir: 'DESCENDING' } },
  {
    name: 'events', col: 'events', path: '/v1/events', scope: 'events:read',
    he: 'אירועים: מועד, מחיר, קיבולת, פתוח להרשמה, מפורסם',
    order: { field: 'start', dir: 'DESCENDING' },
    filters: { published: { field: 'published', param: bool('מפורסם לאורחים') }, open: { field: 'open', param: bool('פתוח להרשמה') } },
    range: { from: 'startFrom', to: 'startTo', he: 'מועד ההתחלה' },
    rangeBounds: eventDayBounds,
    redact: redactEvents,
    notes: [
      'start/end are stored as ISO instants in UTC (older events: "YYYY-MM-DDTHH:mm" Israel time); startLocal/endLocal give both as "YYYY-MM-DDTHH:mm" in Israel time. Latest first; for upcoming events pass startFrom=<today> (Israeli dates).',
      'Tickets sold: tickets.list with eventId (countOnly=true for a number). closed (not null) = the event day was closed (events.close).',
      'files holds the links of older events (remove one with events.removeFile legacyIndex = its position); newer files are in eventFiles.list.',
    ],
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
    redact: redactVendors,
    notes: ['For managers each stall also carries privateNotes: the team\'s notes (vendors/{id}/private/main; the vendor never sees them).', 'people: who is linked to the stall (code = their access link in vendorInvites); events: the events it was invited to.'],
  },
  {
    name: 'vendorInvites', col: 'vendor_invites', path: '/v1/vendor-invites', scope: 'vendors:read', he: 'קישורי גישה של בעלי דוכנים לאפליקציה (מי, לאיזה דוכן, אם נכנס)',
    order: { field: 'vendorId', dir: 'ASCENDING' }, filters: { vendorId: { field: 'vendorId', param: id('הדוכן') } },
    restrict: (c) => (isManager(c) ? [] : null), visible: (c) => isManager(c),
    notes: ['Managers only. id = the access code; active false = closed or already used (usedBy = the account that signed in with it).'],
  },
  {
    name: 'eventStaffing', col: 'staffing', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/staffing', scope: 'events:read',
    he: 'שיבוץ הצוות לעמדות באירוע (שער, דוכן, חניה): מי, באילו שעות, כמה צריך', order: { field: 'station', dir: 'ASCENDING' },
    notes: ['id = the station (gate, stall, parking or another). people: [{uid, name, hours}], hours "" = the whole event; needed = how many the station needs. A station nobody saved yet is missing (the app shows gate, stall and parking anyway).'],
  },
  {
    name: 'eventFiles', col: 'files', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/files', scope: 'events:read',
    he: 'קבצים וקישורים של האירוע (היתרים, מפות, רשימות)', order: { field: 'at', dir: 'DESCENDING' },
    restrict: (c) => (isManager(c) ? [] : null), visible: (c) => isManager(c), redact: redactFiles,
    notes: ['Managers only. A file uploaded in the app as an image or PDF comes as "url": null with "hasData": true (open it in the app). Older events keep links in events.get → files.'],
  },
  {
    name: 'eventScans', col: 'scans', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/scans', scope: 'events:read',
    he: 'יומן השער של האירוע: מי נכנס, מתי, מי סרק, תשלום בשער, כניסות שנדחו', order: { field: 'at', dir: 'DESCENDING' },
    filters: { result: { field: 'result', param: en(['ok', 'paidAtGate', 'payLater', 'rejected'], 'ok נכנס, paidAtGate שילם בשער, payLater ישלם אחר כך, rejected נדחה') } },
    notes: ['A rejected entry a manager has not handled yet has reopenedAt and keptAt null (gate.reopenAndAdmit / gate.keepRejected).'],
  },
  {
    name: 'eventCounters', col: 'counters', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/counters', scope: 'events:read',
    he: 'מוני השער (נכנסו, סריקות, שילמו בשער, חובות) וספירת המזומן', order: { field: 'eventId', dir: 'ASCENDING' },
    visible: (c, d) => isManager(c) || 'eventId' in d,
    notes: ['Use .get: id "live" = the gate counters (entered, scans, paidAtGate, payLater, payLaterAmount, rejected, perHalfHour, per10m); id "cash" = the cash counted before closing ({gate, stall}: {amount, by, at}), managers only.'],
  },
  {
    name: 'eventVendorRequests', col: 'vendor_requests', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/vendor-requests', scope: 'events:read',
    he: 'בקשות של בעלי דוכנים ביום האירוע (חשמל, עזרה, מים)', order: { field: 'createdAt', dir: 'DESCENDING' },
    filters: { vendorId: { field: 'vendorId', param: id('הדוכן') } },
    notes: ['Open requests have closedAt null; close one with vendorRequests.close.'],
  },
  {
    name: 'eventVendorInfo', col: 'vendor_info', parent: { param: 'eventId', col: 'events' }, path: '/v1/events/{eventId}/vendor-info', scope: 'events:read',
    he: 'מה בעלי הדוכנים רואים על האירוע: שעות הקמה, איש קשר, הנחיות', order: { field: 'updatedAt', dir: 'DESCENDING' },
    notes: ['One document, id "main" (created with the first invitation). managerUids = who hears about the stalls\' requests.'],
  },
  {
    name: 'emailOutbox', col: 'email_outbox', path: '/v1/email-outbox', scope: 'notifications:read', he: 'מיילים אוטומטיים של אישור תשלום: נשלח, ממתין או נכשל',
    order: { field: 'updatedAt', dir: 'DESCENDING' },
    restrict: (c) => (isManager(c) ? [] : null), visible: (c, d) => isManager(c) && 'status' in d, redact: redactOutbox,
    notes: ['Managers only. Use .get with id order_<orderId>, donation_<donationId> or tab_<tabId>: status queued, sending, sent, failed or skipped (with reason). Not found = no automatic email for that payment (yet).', 'The guest\'s address is not returned.'],
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
    filters: { handled: { field: 'handled', param: bool('טופל') }, type: { field: 'type', param: en(['visit', 'donation', 'join', 'order', 'receipt', 'tab', 'claim', 'contact'], 'סוג ההתראה (contact = פנייה מהאתר)') } },
  },
  {
    name: 'calendar', col: 'calendar', path: '/v1/calendar', scope: 'calendar:read', he: 'יומן החווה: נוכחות, פגישות, הכנות לפסטיבל, ביקורים מאושרים ואירועים מפורסמים',
    order: { field: 'date', dir: 'ASCENDING' },
    filters: {
      kind: { field: 'kind', param: en(['manual', 'visit', 'event', 'presence', 'meeting', 'planning'], 'manual ידני, visit ביקור, event אירוע, presence נוכחות, meeting פגישה, planning הכנות לפסטיבל') },
      audience: { field: 'audience', param: en(['all', 'managers'], 'managers למנהלים בלבד, all לכולם (רק פריטים שנשמרו עם קהל)') },
      ownerUid: { field: 'ownerUid', param: id('של מי (לנוכחות: האדם)') },
    },
    range: { from: 'dateFrom', to: 'dateTo', he: 'תאריך' },
    visible: (c, d) => isManager(c) || d.audience !== 'managers',
    redact: redactCalendar,
    notes: [
      'Hours: "from"/"to" (HH:mm, "" = open end; both empty = all day). Older items have only "time" ("HH:mm–HH:mm", "HH:mm" or "" for all day).',
      'Presence = kind "presence" (or an old "manual" item titled "<first name> בחווה"). Several entries of one person on one day count once.',
      'audience "managers" items are hidden from staff, as in the app. Items without an audience are for everyone, so audience=all matches only items saved with one.',
    ],
  },
  {
    name: 'broadcasts', col: 'broadcasts', path: '/v1/broadcasts', scope: 'broadcasts:read',
    he: 'הודעות לצוות שנשלחו: טקסט, קהל, דחוף, מי שלח, למי (recipients)',
    order: { field: 'createdAt', dir: 'DESCENDING' },
    filters: { audience: { field: 'audience', param: en(['all', 'farmToday', 'managers', 'crew', 'vendors'], 'all כל הצוות, farmToday מי שבחווה היום, managers מנהלים, crew צוות האירוע, vendors בעלי הדוכנים') }, urgent: { field: 'urgent', param: bool('דחוף') } },
    restrict: (c, given) => (isManager(c) ? [] : Object.keys(given).length ? null : [{ fieldFilter: { field: { fieldPath: 'recipients' }, op: 'ARRAY_CONTAINS', value: { stringValue: c.actor.person.uid } } }]),
    visible: (c, d) => isManager(c) || (Array.isArray(d.recipients) && d.recipients.includes(c.actor.person.uid)),
    notes: ['Who read it: broadcastReads.list with the broadcastId (managers). A receipt counts as read only with "at"; "seenAt" alone = the card was shown.', 'Staff see only broadcasts sent to them, without filters.'],
  },
  {
    name: 'broadcastReads', col: 'reads', parent: { param: 'broadcastId', col: 'broadcasts' }, path: '/v1/broadcasts/{broadcastId}/reads', scope: 'broadcasts:read',
    he: 'אישורי קריאה של הודעה לצוות: מי קרא (at) ומי רק ראה (seenAt)', order: { field: 'name', dir: 'ASCENDING' },
    restrict: (c) => (isManager(c) ? [] : null),
    visible: (c, d) => isManager(c) || d.uid === c.actor.person.uid,
    notes: ['Recipients without a receipt never opened the app since. broadcasts.resend notifies again only those who did not read.'],
  },
  {
    name: 'me.notifications', col: 'notifications', mine: true, path: '/v1/me/notifications', scope: 'me:read',
    he: 'ההתראות האישיות שלי (מה שמופיע בפעמון באפליקציה)',
    order: { field: 'createdAt', dir: 'DESCENDING' },
    filters: { kind: { field: 'kind', param: en(['task', 'urgent', 'trip', 'event', 'broadcast', 'vendor', 'system'], 'סוג') }, refId: { field: 'refId', param: id('הרשומה שההתראה עליה') } },
    notes: ['Unread = "readAt": null. Mark read with me.notifications.markRead.', 'These are the caller\'s own notifications (users/<caller>/notifications), not the managers\' queue (notifications.list).'],
  },
  {
    name: 'accountDeletions', col: 'account_deletions', path: '/v1/account-deletions', scope: 'people:read',
    he: 'בקשות למחיקת חשבון: מי ביקש ומתי (החשבון נמחק 30 יום אחרי הבקשה)', order: { field: 'uid', dir: 'ASCENDING' },
    notes: ['requestedAt is the server time of the request (ISO, UTC). The scheduled job removes the account 30 days later unless the person cancels.'],
  },
  {
    name: 'activity', col: 'activity', path: '/v1/activity', scope: 'activity:read', he: 'יומן הפעילות: מי עשה מה ומתי, בכל המערכת',
    order: { field: 'at', dir: 'DESCENDING' },
    filters: {
      kind: { field: 'kind', param: en(ALL_KINDS, 'סוג הפעילות. תוצאות לפי הרשאת התפקיד') },
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
    notes: ['Newest first. "at" is an ISO time in UTC.', 'Staff see only team activity. Old task entries of manager-only or deleted tasks come with generic text ("redacted": true).'],
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
/** The parent document of a subcollection resource ('' for a top-level collection). */
const parentPath = (r: ResourceDef, caller: Caller, parentId: string | null) => (r.mine ? `users/${caller.actor.person.uid}` : r.parent ? `${r.parent.col}/${parentId}` : '');

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
    const [lo, hi] = r.rangeBounds ? r.rangeBounds(from, to) : [from, to ? to + '￿' : null];
    if (lo) filters.push({ fieldFilter: { field: { fieldPath: r.order.field }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: lo } } });
    // inclusive end date, also for "YYYY-MM-DDTHH:mm" and ISO time values on that date
    if (hi) filters.push({ fieldFilter: { field: { fieldPath: r.order.field }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: hi } } });
  }
  const where = filters.length ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } : {};
  const parent = parentPath(r, caller, parentId);
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
  const parent = parentPath(r, caller, parentId);
  const d: Doc | null = await fs.get(parent ? `${parent}/${r.col}` : r.col, docId);
  if (!d || (r.visible && !r.visible(caller, d.data))) throw new ApiError('NOT_FOUND', `${r.name} record not found`);
  const rec = project(r.col, d.id, d.data);
  return { record: r.redact ? (await r.redact(fs, caller, [rec]))[0] : rec };
}

/** Matches a GET path against the resources: list or get, with the parent id for subcollections. */
export function matchResource(path: string): { r: ResourceDef; parentId: string | null; id: string | null } | null {
  for (const r of RESOURCES) {
    const pattern = '^' + r.path.replace(/\{[A-Za-z]+\}/, '([^/]+)') + '(?:/([^/]+))?$';
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
