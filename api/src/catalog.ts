// The static, versioned catalog of what this API can do. It is the only thing the assistant relies on:
// an operation that is not listed here does not exist. The same specs drive request validation, so the
// catalog and the server can never disagree about a parameter.

export const CATALOG_VERSION = '1.0.0';

export type Param =
  | { type: 'string'; required?: boolean; min?: number; max: number; he?: string }
  | { type: 'uid' | 'id'; required?: boolean; he?: string }
  | { type: 'date'; format: 'YYYY-MM-DD'; timezone: 'Asia/Jerusalem'; required?: boolean; he?: string }
  | { type: 'bool'; required?: boolean; default?: boolean; he?: string }
  | { type: 'int'; min: number; max: number; default: number; he?: string };

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
    },
    requiredScope: 'tasks:assign',
    notes: [
      'The response is a read-back of the stored task.',
      '"readBack": "unavailable" (with "task": null, "verified": false) means the change was stored but could not be read back. Do not send it again with a new key.',
    ],
  },
];

export const CATALOG = {
  version: CATALOG_VERSION,
  generatedAt: '2026-11-12T00:00:00+02:00',
  service: 'havat-ravve-api',
  conventions: {
    auth: 'Authorization: Bearer <api-key>. Each key is bound to one actor; X-Actor-Id may only pick among that key\'s own actors and never raises permissions.',
    idempotency: 'Every write needs an Idempotency-Key header (UUID). Same key + same body returns the stored result with "replayed": true. Same key + different body is 409. After a timeout or OUTCOME_UNKNOWN, resend with the same key.',
    dates: 'Absolute dates only, YYYY-MM-DD in Asia/Jerusalem. Resolve "today" / "tomorrow" before calling; the server does not parse natural language.',
    envelope: 'Success: { ok: true, data, meta }. Failure: { ok: false, error: { code, message, he, details }, meta }.',
    unknownParams: 'Unknown query or body fields are rejected with 400.',
  },
  errors: {
    VALIDATION_FAILED: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, IDEMPOTENCY_CONFLICT: 409,
    QUOTA_EXCEEDED: 429, UPSTREAM_ERROR: 502, OUTCOME_UNKNOWN: 503, PRODUCTION_LOCKED: 503, INTERNAL: 500,
  },
  operations: OPERATIONS,
};

export const operation = (name: string) => OPERATIONS.find((o) => o.name === name);
