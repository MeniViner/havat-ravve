// The static, versioned catalog of what this API can do. It is the only thing the assistant relies on:
// an operation that is not listed here does not exist. The same specs drive request validation, so the
// catalog and the server can never disagree about a parameter.

import { resourceOperations } from './resources';
import { WRITE_DEFS } from './writes';
import { OVERVIEW_OPS } from './overview';
import { FAILURE_OPS } from './failures';

export const CATALOG_VERSION = '2.0.0';

export type Param =
  | { type: 'string'; required?: boolean; min?: number; max: number; he?: string }
  | { type: 'uid' | 'id'; required?: boolean; he?: string }
  | { type: 'date'; format: 'YYYY-MM-DD'; timezone: 'Asia/Jerusalem'; required?: boolean; he?: string }
  | { type: 'bool'; required?: boolean; default?: boolean; he?: string }
  | { type: 'int'; min: number; max: number; default?: number; required?: boolean; he?: string }
  | { type: 'enum'; values: readonly string[]; required?: boolean; default?: string; he?: string }
  | { type: 'number'; min: number; max: number; required?: boolean; default?: number; he?: string }
  | { type: 'datetime'; format: 'YYYY-MM-DDTHH:mm'; timezone: 'Asia/Jerusalem'; required?: boolean; he?: string }
  | { type: 'time'; format: 'HH:mm'; timezone?: 'Asia/Jerusalem'; required?: boolean; he?: string }
  | { type: 'email'; required?: boolean; he?: string }
  | { type: 'stringList'; maxItems: number; maxLength: number; required?: boolean; he?: string }
  | { type: 'intList'; min: number; max: number; maxItems: number; required?: boolean; he?: string };

export type Operation = {
  name: string;
  kind: 'read' | 'write';
  he: string;
  method: 'GET' | 'POST';
  path: string;
  idempotency?: 'required';
  pathParams?: Record<string, Param>;
  params?: Record<string, Param>;
  body?: Record<string, Param>;
  requiredScope: string;
  notes?: string[];
};

const date = (he: string, required = false): Param => ({ type: 'date', format: 'YYYY-MM-DD', timezone: 'Asia/Jerusalem', required, he });

export const OPERATIONS: Operation[] = [
  {
    name: 'people.search',
    kind: 'read',
    he: 'חיפוש איש צוות לפי שם. מחזיר מועמדים, לא מנחש',
    method: 'GET',
    path: '/v1/people',
    params: { q: { type: 'string', required: true, min: 1, max: 80, he: 'שם או תחילת שם' } },
    requiredScope: 'people:read',
    notes: [
      'Exact name matches come first; only if there are none, prefix matches on the full name or any word.',
      'When "ambiguous" is true, ask the user to pick one of "candidates" by uid. Never pick for them.',
      'Only team members (staff, manager, owner) are returned, without email or phone.',
      '"complete" is false when the team is too large to search in full: people may be missing from "candidates", so a single candidate is reported as ambiguous. Confirm with the user before using it.',
    ],
  },
  {
    name: 'tasks.list',
    kind: 'read',
    he: 'רשימת משימות, אופציונלי לפי אחראי, תאריך יעד ומצב ביצוע',
    method: 'GET',
    path: '/v1/tasks',
    params: {
      assignee: { type: 'uid', he: 'uid מתוך people.search' },
      date: date('תאריך יעד מדויק'),
      done: { type: 'bool', he: 'true לבוצעו, false לפתוחות' },
      limit: { type: 'int', min: 1, max: 50, default: 20 },
      cursor: { type: 'string', max: 400, he: 'nextCursor מהעמוד הקודם, עם אותם מסננים' },
    },
    requiredScope: 'tasks:read',
    notes: ['Newest first. Response has "items", "nextCursor" and "hasMore". A cursor is only valid with the same filters.'],
  },
  {
    name: 'tasks.get',
    kind: 'read',
    he: 'משימה אחת לפי מזהה',
    method: 'GET',
    path: '/v1/tasks/{id}',
    pathParams: { id: { type: 'id', required: true } },
    requiredScope: 'tasks:read',
  },
  {
    name: 'tasks.create',
    kind: 'write',
    idempotency: 'required',
    he: 'יצירת משימה חדשה, אופציונלי עם שיוך לאחראי',
    method: 'POST',
    path: '/v1/actions/tasks.create',
    body: {
      title: { type: 'string', required: true, min: 1, max: 200, he: 'כותרת המשימה' },
      assignee: { type: 'uid', he: 'uid מתוך people.search. שיוך למישהו אחר דורש גם tasks:assign' },
      dueDate: date('תאריך יעד'),
      urgent: { type: 'bool', default: false },
      note: { type: 'string', max: 4000, he: 'הערה / פירוט' },
      managersOnly: { type: 'bool', default: false, he: 'למנהלים בלבד (רק מנהל)' },
      placeId: { type: 'id', he: 'מקום מתוך places.list' },
    },
    requiredScope: 'tasks:create',
    notes: [
      'The response is a read-back of the stored task ("verified": true when it matches what was sent).',
      '"readBack": "unavailable" (with "task": null, "verified": false) means the task was stored but could not be read back. Do not create it again with a new Idempotency-Key; read it later with tasks.get.',
    ],
  },
  {
    name: 'tasks.assign',
    kind: 'write',
    idempotency: 'required',
    he: 'שיוך משימה קיימת לאחראי',
    method: 'POST',
    path: '/v1/actions/tasks.assign',
    body: {
      taskId: { type: 'id', required: true },
      assignee: { type: 'uid', required: true, he: 'uid מתוך people.search' },
      ifUpdatedAt: { type: 'string', max: 40, he: 'updatedAt כפי שנקרא; אם השתנה מאז, 409 STALE_WRITE' },
    },
    requiredScope: 'tasks:assign',
    notes: [
      'The response is a read-back of the stored task.',
      '"readBack": "unavailable" (with "task": null, "verified": false) means the change was stored but could not be read back. Do not send it again with a new key.',
    ],
  },
  {
    name: 'tasks.complete',
    kind: 'write',
    idempotency: 'required',
    he: 'סימון משימה כבוצעה, בשם מי שקורא',
    method: 'POST',
    path: '/v1/actions/tasks.complete',
    body: { taskId: { type: 'id', required: true }, ifUpdatedAt: { type: 'string', max: 40, he: 'updatedAt כפי שנקרא; אם השתנה מאז, 409 STALE_WRITE' }, },
    requiredScope: 'tasks:complete',
    notes: [
      'Marks the task done by the calling actor, as the app does. An already-done task returns "changed": false.',
      'The response is a read-back of the stored task. "readBack": "unavailable" means it was stored but could not be read back.',
    ],
  },
  {
    name: 'tasks.reopen',
    kind: 'write',
    idempotency: 'required',
    he: 'החזרת משימה שבוצעה למצב פתוח',
    method: 'POST',
    path: '/v1/actions/tasks.reopen',
    body: { taskId: { type: 'id', required: true }, ifUpdatedAt: { type: 'string', max: 40, he: 'updatedAt כפי שנקרא; אם השתנה מאז, 409 STALE_WRITE' }, },
    requiredScope: 'tasks:complete',
    notes: ['Clears done, doneBy, doneAt and the done photo and note, as the app does. An open task returns "changed": false.'],
  },
  {
    name: 'shopping.list',
    kind: 'read',
    he: 'רשימת הקניות. ברירת מחדל: מה שעוד לא נקנה',
    method: 'GET',
    path: '/v1/shopping',
    params: {
      bought: { type: 'bool', default: false, he: 'false לרשימה הפתוחה, true למה שנקנה (נעלם מהאפליקציה אחרי 24 שעות)' },
      category: { type: 'enum', values: ['super', 'building', 'online', 'giveaway'], he: 'super סופר, building חומרי בניין, online אינטרנט, giveaway מוצרי מסירה' },
      limit: { type: 'int', min: 1, max: 100, default: 50 },
    },
    requiredScope: 'shopping:read',
    notes: ['Newest first. Response has "items" and "hasMore".'],
  },
  {
    name: 'shopping.add',
    kind: 'write',
    idempotency: 'required',
    he: 'הוספת פריט לרשימת הקניות',
    method: 'POST',
    path: '/v1/actions/shopping.add',
    body: {
      title: { type: 'string', required: true, min: 1, max: 200, he: 'מה לקנות' },
      qty: { type: 'string', max: 40, he: 'כמות, טקסט חופשי, למשל "2 שקים"' },
      category: { type: 'enum', values: ['super', 'building', 'online', 'giveaway'], default: 'super', he: 'super סופר, building חומרי בניין, online אינטרנט, giveaway מוצרי מסירה' },
      urgent: { type: 'bool', default: false },
      note: { type: 'string', max: 1000 },
    },
    requiredScope: 'shopping:write',
    notes: ['Check shopping.list first: if the same item is already open, ask before adding it again.', 'The response is a read-back of the stored item.'],
  },
  {
    name: 'shopping.setBought',
    kind: 'write',
    idempotency: 'required',
    he: 'סימון פריט כנקנה (או ביטול הסימון)',
    method: 'POST',
    path: '/v1/actions/shopping.setBought',
    body: {
      itemId: { type: 'id', required: true },
      ifUpdatedAt: { type: 'string', max: 40, he: 'updatedAt כפי שנקרא; אם השתנה מאז, 409 STALE_WRITE' },
      bought: { type: 'bool', default: true, he: 'false מחזיר את הפריט לרשימה הפתוחה' },
    },
    requiredScope: 'shopping:write',
    notes: ['Bought items leave the app\'s open list and disappear after 24 hours, as when marked in the app. No change returns "changed": false.'],
  },
];

/** Every operation: the hand-written ones above, then the generated reads, the overview and every app action. */
export const ALL_OPERATIONS: Operation[] = [...OVERVIEW_OPS, ...OPERATIONS, ...FAILURE_OPS, ...resourceOperations(), ...WRITE_DEFS.map((d) => d.op)];

export const CATALOG = {
  version: CATALOG_VERSION,
  generatedAt: '2026-11-12T00:00:00+02:00',
  service: 'havat-ravve-api',
  conventions: {
    auth: 'Authorization: Bearer <api-key>. Each key is bound to its own actors; X-Actor-Id may only pick among them and never raises permissions. A real person acts with the name and role of their profile in the app, and only while that profile is an active team member.',
    scopes: 'owner and manager: every operation. staff: tasks.list/get/create (for themselves)/complete/reopen and the shopping list; not people.search or assigning to others.',
    idempotency: 'Every write needs an Idempotency-Key header (UUID). Same key + same body returns the stored result with "replayed": true. Same key + different body is 409. After a timeout or OUTCOME_UNKNOWN, resend with the same key.',
    dates: 'Absolute dates only, YYYY-MM-DD in Asia/Jerusalem. Resolve "today" / "tomorrow" before calling; the server does not parse natural language.',
    datesAndTimes: 'Every parameter states its format and time zone. date: YYYY-MM-DD (Asia/Jerusalem). datetime: YYYY-MM-DDTHH:mm, local Israel time, no offset (event start/end). time: HH:mm, Israel time. Stored timestamps (createdAt, updatedAt, at, doneAt, boughtAt) are ISO 8601 in UTC with a Z; convert to Israel time before telling the user.',
    concurrency: 'Writes run in a transaction and only change the fields sent, so other fields changed meanwhile in the app are kept. To avoid overwriting a change to the same record, send ifUpdatedAt = the record\'s updatedAt as you read it: if it changed since, the write is refused with 409 STALE_WRITE; read it again and ask the user. The action and its activity entry are one commit: both happen or neither.',
    rateLimits: 'Per key: 240 requests a minute; failed authentications: 30 a minute per address. Over the limit: 429 RATE_LIMITED with Retry-After. A Firestore daily quota hit is 429 QUOTA_EXCEEDED.',
    keys: 'One key per person or assistant, bound on the server to that person\'s profile. A key can be revoked, rotated or set to expire; a revoked or expired key gets 401. Every authenticated response has meta.keyVersion: "current", or "previous" when a rotated key is still inside its grace period (switch to the new one).',
    envelope: 'Success: { ok: true, data, meta }. Failure: { ok: false, error: { code, message, he, details }, meta }.',
    unknownParams: 'Unknown query or body fields are rejected with 400.',
    userAgent: 'Send a User-Agent header that names your client, e.g. "Instinct-HavatRavve/1.0". Cloudflare blocks Python urllib\'s default User-Agent before the request reaches this API: a plain-text 403 "error code: 1010" means it never arrived and nothing was written.',
  },
  errors: {
    VALIDATION_FAILED: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, IDEMPOTENCY_CONFLICT: 409,
    STALE_WRITE: 409, RATE_LIMITED: 429, QUOTA_EXCEEDED: 429, UPSTREAM_ERROR: 502, OUTCOME_UNKNOWN: 503, PRODUCTION_LOCKED: 503, INTERNAL: 500,
  },
  operations: ALL_OPERATIONS,
};

export const operation = (name: string) => ALL_OPERATIONS.find((o) => o.name === name);
