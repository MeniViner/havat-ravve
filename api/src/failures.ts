// Failures worth knowing about (5xx, outcome unknown, rate limits, quota) are kept in api_failures, so the
// owner, or the assistant on a schedule, can ask "did anything go wrong?" and alert on WhatsApp.
import { type Caller, requireScope } from './auth';
import type { Operation } from './catalog';
import { type Env, Firestore } from './firestore';
import { autoId, validate } from './util';

export const FAILURE_OPS: Operation[] = [{
  name: 'system.failures', kind: 'read', method: 'GET', path: '/v1/system/failures', requiredScope: 'system:read',
  he: 'תקלות אחרונות בשרת: שגיאות, פעולות שלא ברור אם נשמרו, חסימות קצב ומכסה',
  params: { hours: { type: 'int', min: 1, max: 720, default: 24, he: 'כמה שעות אחורה' } },
  notes: ['Empty "items" means nothing went wrong. Worth checking once a day and telling the owner when it is not empty.', 'OUTCOME_UNKNOWN entries name the operation: resend it with the same Idempotency-Key or check the record.'],
}];

export async function recordFailure(env: Env, log: Record<string, unknown>) {
  const fs = new Firestore(env, new Set());
  const at = new Date().toISOString();
  const pick = ['requestId', 'method', 'path', 'op', 'actor', 'credential', 'status', 'code', 'wallMs'];
  const data: Record<string, unknown> = { at, ...Object.fromEntries(pick.filter((k) => log[k] !== undefined).map((k) => [k, log[k]])) };
  if (typeof log.internal === 'string') data.internal = log.internal.slice(0, 300);
  await fs.commit([fs.create('api_failures', autoId(), data)]);
}

export async function listFailures(fs: Firestore, caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'system:read');
  const { hours } = validate(FAILURE_OPS[0].params!, Object.fromEntries(query), true) as { hours: number };
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const docs = await fs.query({
    from: [{ collectionId: 'api_failures' }],
    where: { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: since } } },
    orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
    limit: 100,
  });
  const byCode: Record<string, number> = {};
  for (const d of docs) byCode[String(d.data.code ?? d.data.status)] = (byCode[String(d.data.code ?? d.data.status)] || 0) + 1;
  return { since, total: docs.length, byCode, items: docs.map((d) => ({ id: d.id, ...d.data })) };
}
