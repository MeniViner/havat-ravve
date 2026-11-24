// How much an API key was used this week (the console's מפתחות screen), from the assistant log.
import { ApiError } from './http';
import type { Env, Firestore } from './firestore';
import { listKeys } from './keys';
import { LOG } from './audit';

const DAYS = 7;
/** At most this many failed requests (of every key) are read. */
const FAILED_SCAN = 500;

/**
 * Two Firestore calls: a count over (credential, at), which costs one read per 1,000 requests, and the week's failed
 * requests of every key (few; only their key's id is read) over (ok, at). No index of its own is needed.
 */
export async function keyUsage(env: Env, fs: Firestore, id: string) {
  if (!(await listKeys(env)).some((k) => k.id === id)) throw new ApiError('NOT_FOUND', 'no such key');
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const filter = (field: string, op: string, value: Record<string, unknown>) => ({ fieldFilter: { field: { fieldPath: field }, op, value } });
  const atSince = filter('at', 'GREATER_THAN_OR_EQUAL', { stringValue: since });
  const [requests, failed] = await Promise.all([
    // the order is the index's own (credential, at descending): without it the count would need another index
    fs.count({ from: [{ collectionId: LOG }], where: { compositeFilter: { op: 'AND', filters: [filter('credential', 'EQUAL', { stringValue: id }), atSince] } }, orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }] }),
    fs.query({
      from: [{ collectionId: LOG }], select: { fields: [{ fieldPath: 'credential' }] },
      where: { compositeFilter: { op: 'AND', filters: [filter('ok', 'EQUAL', { booleanValue: false }), atSince] } },
      orderBy: [{ field: { fieldPath: 'at' }, direction: 'ASCENDING' }], limit: FAILED_SCAN,
    }),
  ]);
  return { requests, failed: failed.filter((d) => d.data.credential === id).length, days: DAYS };
}
