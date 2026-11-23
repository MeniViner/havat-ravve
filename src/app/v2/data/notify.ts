// Personal notifications (C1) and the push outbox (BACKEND: push). Shared by every area; the broadcast area owns this file.
// notify() writes users/{uid}/notifications/{id} for each recipient and one push_jobs/{id} the Worker drains (docs/push-design.md).
// Offline-first: batched writes, nothing waits for the server. The in-app notification is the source of truth;
// the push is a best-effort copy for the lock screen (the Worker skips people who turned it off).
import { notificationTargets } from '../../../../shared/message-activity';
import { write, newId } from '../../db';
import { nowIso } from '../../clock';
import type { Actor, PushJob, UserNotification, UserNotificationKind } from '../../types';

export type NotifySpec = {
  kind: UserNotificationKind; title: string; sub?: string; link: string; refId?: string;
  action?: UserNotification['action']; by?: Actor;
  /** Also queue a phone push (default true). */
  push?: boolean;
  includeSelf?: boolean;
  /** A stable notification id (same for every recipient), so a later write can find it again: e.g. `b_<broadcastId>`.
   *  Sending again with the same id brings the notification back as new instead of adding a second one. */
  id?: string;
  /** Lock-screen push only: urgent stays on screen until opened and is delivered at high priority. */
  urgent?: boolean;
  /** Lock-screen push only: a later push with the same tag replaces the earlier one on the phone. Default: the push job id. */
  tag?: string;
};

/** What the Worker reads from push_jobs/{id} (types.ts PushJob plus the optional delivery hints). */
export type PushJobDoc = PushJob & { urgent?: boolean; tag?: string; refId?: string; includeSelf?: boolean };

/** A notification link is always an in-app path (never another site): "/tasks/abc" -> "/tasks/abc". */
export const appLink = (link: string) => (/^\/(?!\/)/.test(link) ? link : '/' + link.replace(/^[a-z]+:\/\/[^/]*\/?/i, '').replace(/^\/+/, ''));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/** Firestore takes at most 500 writes per batch. */
const CHUNK = 450;

export async function notify(uids: string[], n: NotifySpec, changes: Parameters<typeof write.batch>[0] = []): Promise<void> {
  const to = notificationTargets(uids, n.by?.uid, n.includeSelf);
  const createdAt = nowIso();
  const link = appLink(n.link);
  const ops = [...changes];
  for (const uid of to) {
    const col = `users/${uid}/notifications`;
    const id = n.id || newId(col);
    const doc: UserNotification = { id, kind: n.kind, title: clip(n.title, 120), sub: clip(n.sub || '', 240), link, refId: n.refId || '', ...(n.action ? { action: n.action } : {}), ...(n.by ? { by: n.by } : {}), createdAt, readAt: null };
    ops.push({ op: 'set', col, id, data: doc as unknown as Record<string, unknown> });
  }
  if (n.push !== false && n.by) {
    // one job per send; `to` is the list of uids, the Worker looks up each person's devices and preferences
    for (let i = 0; i < to.length; i += 200) {
      const id = newId('push_jobs');
      const targets = to.slice(i, i + 200);
      const job: PushJobDoc = { id, kind: n.kind, title: clip(n.title, 80), body: clip(n.sub || '', 180), link, to: targets, ...(n.includeSelf && targets.includes(n.by.uid) ? { includeSelf: true } : {}), createdBy: n.by, createdAt, sentAt: null, urgent: !!n.urgent, tag: n.tag || id, refId: n.refId || '' };
      ops.push({ op: 'set', col: 'push_jobs', id, data: job as unknown as Record<string, unknown> });
    }
  }
  for (let i = 0; i < ops.length; i += CHUNK) await write.batch(ops.slice(i, i + CHUNK));
}

/** Marks some of my notifications read (C1 on open, B4 "קראתי"). */
export async function markNotificationsRead(uid: string, ids: string[]): Promise<void> {
  if (!uid || !ids.length) return;
  const readAt = nowIso();
  const ops = ids.map((id) => ({ op: 'update' as const, col: `users/${uid}/notifications`, id, data: { readAt } }));
  for (let i = 0; i < ops.length; i += CHUNK) await write.batch(ops.slice(i, i + CHUNK), { quiet: true });
}
