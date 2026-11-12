// Uniform response envelope and the error vocabulary every endpoint shares.
import { CATALOG_VERSION } from './catalog';

export type ErrorCode =
  | 'VALIDATION_FAILED' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'IDEMPOTENCY_CONFLICT'
  | 'QUOTA_EXCEEDED' | 'UPSTREAM_ERROR' | 'OUTCOME_UNKNOWN' | 'PRODUCTION_LOCKED' | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, IDEMPOTENCY_CONFLICT: 409,
  QUOTA_EXCEEDED: 429, UPSTREAM_ERROR: 502, OUTCOME_UNKNOWN: 503, PRODUCTION_LOCKED: 503, INTERNAL: 500,
};

const HE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'הבקשה לא תקינה',
  UNAUTHENTICATED: 'חסר אימות או שהמפתח לא תקף',
  FORBIDDEN: 'אין הרשאה לפעולה הזו',
  NOT_FOUND: 'לא נמצא',
  IDEMPOTENCY_CONFLICT: 'אותו מפתח פעולה כבר שימש לבקשה אחרת',
  QUOTA_EXCEEDED: 'המכסה היומית נגמרה, נסו שוב מאוחר יותר',
  UPSTREAM_ERROR: 'מסד הנתונים לא זמין כרגע',
  OUTCOME_UNKNOWN: 'לא ברור אם הפעולה נשמרה. שלחו שוב עם אותו מפתח פעולה, זה בטוח',
  PRODUCTION_LOCKED: 'השרת הזה לא מחובר לנתוני אמת בשלב הזה',
  INTERNAL: 'שגיאה פנימית',
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public details: Record<string, unknown> = {}, public headers: Record<string, string> = {}) {
    super(message);
  }
  get status() { return STATUS[this.code]; }
}

export const invalid = (field: string, message: string) => new ApiError('VALIDATION_FAILED', message, { field });

export type Meta = { requestId: string; started: number };

export function ok(meta: Meta, data: unknown, status = 200): Response {
  return json(status, { ok: true, data, meta: { catalogVersion: CATALOG_VERSION, requestId: meta.requestId, durationMs: Date.now() - meta.started } }, meta);
}

export function fail(meta: Meta, e: ApiError): Response {
  return json(e.status, { ok: false, error: { code: e.code, message: e.message, he: HE[e.code], details: e.details }, meta: { requestId: meta.requestId } }, meta, e.headers);
}

function json(status: number, body: unknown, meta: Meta, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': meta.requestId, ...headers },
  });
}
