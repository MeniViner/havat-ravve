// Personal notifications (C1) and the push outbox (BACKEND: push). Shared by every area; the broadcast area owns this file.
// notify() writes users/{uid}/notifications/{id} for each recipient and one push_jobs/{id} the Worker drains (docs/push-design.md).
// Offline-first: batched writes, nothing waits for the server.
import { write, newId } from '../../db';
import { nowIso } from '../../clock';
import type { Actor, UserNotification, UserNotificationKind } from '../../types';

export type NotifySpec = {
  kind: UserNotificationKind; title: string; sub?: string; link: string; refId?: string;
  action?: UserNotification['action']; by?: Actor;
  /** Also queue a phone push (default true). */
  push?: boolean;
};

export async function notify(uids: string[], n: NotifySpec): Promise<void> {
  const to = [...new Set(uids.filter(Boolean))].filter((u) => u !== n.by?.uid);
  if (!to.length) return;
  const createdAt = nowIso();
  const ops: Parameters<typeof write.batch>[0] = [];
  for (const uid of to) {
    const col = `users/${uid}/notifications`;
    const id = newId(col);
    const doc: UserNotification = { id, kind: n.kind, title: n.title, sub: n.sub || '', link: n.link, refId: n.refId || '', ...(n.action ? { action: n.action } : {}), ...(n.by ? { by: n.by } : {}), createdAt, readAt: null };
    ops.push({ op: 'set', col, id, data: doc as unknown as Record<string, unknown> });
  }
  if (n.push !== false && n.by) {
    const id = newId('push_jobs');
    ops.push({ op: 'set', col: 'push_jobs', id, data: { id, kind: n.kind, title: n.title, body: n.sub || '', link: n.link, to, createdBy: n.by, createdAt, sentAt: null } });
  }
  await write.batch(ops);
}
