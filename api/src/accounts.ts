// Account deletion. A signed-in user asks inside the app (`account_deletions/{uid}`, written with the
// server's time, see firestore.rules); the app then shows only "scheduled for deletion" with a cancel button.
// After GRACE_DAYS this cron job removes the Firebase Auth account and the profile, and strips the personal
// details from the person's tickets, visits, donations and stall accounts. Amounts and dates stay, without a
// name, for the farm's bookkeeping. One account per run keeps a run far inside the free subrequest limit.
import { ApiError } from './http';
import { Firestore, FsError, type Doc, type Env, type Write } from './firestore';
import { whereEq } from './core';

export const GRACE_DAYS = 30;
const REQUESTS = 'account_deletions';
export const DELETED_NAME = 'חשבון שנמחק';
const PER_COLLECTION = 400;

type Stats = { cron: 'accounts'; due: number; deleted: number; docs: number; note?: string };

/** Firebase Auth (Identity Toolkit). Emulator: the Auth emulator with the owner token. "Not found" counts as done. */
async function deleteAuthUser(fs: Firestore, env: Env, uid: string) {
  const path = `/v1/projects/${fs.project}/accounts:delete`;
  const url = fs.emulator ? `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com${path}` : `https://identitytoolkit.googleapis.com${path}`;
  if (fs.emulator && !env.FIREBASE_AUTH_EMULATOR_HOST) throw new ApiError('INTERNAL', 'FIREBASE_AUTH_EMULATOR_HOST is not set');
  let res: Response;
  try {
    res = await (env.FETCH || fetch)(url, { method: 'POST', headers: { authorization: await fs.bearer(), 'content-type': 'application/json' }, body: JSON.stringify({ localId: uid }), signal: AbortSignal.timeout(8000) });
  } catch { throw new ApiError('UPSTREAM_ERROR', 'Identity Toolkit unreachable'); }
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  if (/USER_NOT_FOUND/.test(text)) return;
  throw new ApiError('UPSTREAM_ERROR', `Auth delete failed (${res.status})`);
}

/** The writes that remove one person: profile, request, and the personal fields on their records. */
export async function purgeWrites(fs: Firestore, uid: string, now: string): Promise<Write[]> {
  const [tickets, visits, donations, tabs, outbox] = await Promise.all([
    whereEq(fs, 'tickets', { ownerUid: uid }, PER_COLLECTION),
    whereEq(fs, 'visits', { uid }, PER_COLLECTION),
    whereEq(fs, 'donations', { uid }, PER_COLLECTION),
    whereEq(fs, 'tabs', { guestUid: uid }, PER_COLLECTION),
    whereEq(fs, 'email_outbox', { uid }, PER_COLLECTION),
  ]);
  const patch = (col: string, d: Doc, data: Record<string, unknown>) => fs.patch(col, d.id, { ...data, updatedAt: now });
  return [
    ...tickets.map((d) => patch('tickets', d, { ownerName: DELETED_NAME, ownerPhone: '', holderName: '', answers: {} })),
    ...visits.map((d) => patch('visits', d, { name: DELETED_NAME, phone: '', note: '' })),
    ...donations.map((d) => patch('donations', d, { name: DELETED_NAME, phone: '', note: '', receiptName: '' })),
    ...tabs.map((d) => patch('tabs', d, { guestName: DELETED_NAME, guestPhone: '' })),
    // outbox jobs keep their outcome for managers, without the address
    ...outbox.filter((d) => 'to' in d.data).map((d) => fs.patch('email_outbox', d.id, { to: '' })),
    fs.remove('users', uid),
    fs.remove(REQUESTS, uid),
  ];
}

export async function runAccountDeletions(env: Env, nowMs = Date.now()): Promise<Stats> {
  const stats: Stats = { cron: 'accounts', due: 0, deleted: 0, docs: 0 };
  const fs = new Firestore(env);
  const cutoff = new Date(nowMs - GRACE_DAYS * 86_400_000).toISOString();
  const due = await fs.query({
    from: [{ collectionId: REQUESTS }],
    where: { fieldFilter: { field: { fieldPath: 'requestedAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: cutoff } } },
    orderBy: [{ field: { fieldPath: 'requestedAt' }, direction: 'ASCENDING' }],
    limit: 1,
  });
  stats.due = due.length;
  for (const req of due) {
    const uid = req.id;
    // Auth first: if the service account may not delete users, nothing is touched and the next run retries.
    await deleteAuthUser(fs, env, uid);
    // Google-linked correspondence holds a separate reply address. Drain it in retryable, bounded atomic pairs.
    for (;;) {
      const contacts = await whereEq(fs, 'contact_people', { accountUid: uid }, 100);
      if (!contacts.length) break;
      await fs.commit(contacts.flatMap((c) => [fs.remove('contact_people', c.id), fs.remove('notifications', c.id)]));
      stats.docs += contacts.length * 2;
    }
    const writes = await purgeWrites(fs, uid, new Date(nowMs).toISOString());
    try { await fs.commit(writes); }
    catch (e) { stats.note = 'commit failed: ' + (e instanceof FsError ? e.status : 'error'); continue; }
    stats.deleted++; stats.docs += writes.length - 2;
  }
  return stats;
}
