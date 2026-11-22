// Personal notifications and the push outbox, written exactly as the app's notify() (src/app/v2/data/notify.ts) does:
// users/{uid}/notifications/{id} for each recipient, plus push_jobs/{id} that the Worker's cron drains (push.ts).
// Returned as Writes so they commit in the same transaction as the action that caused them.
import type { Firestore, Write } from './firestore';
import type { Person } from './core';
import { nowIso } from './core';
import { autoId } from './util';

export type NotifyKind = 'task' | 'urgent' | 'trip' | 'broadcast' | 'event' | 'system' | 'vendor' | 'visit' | 'donation' | 'payment';
export type NotifySpec = {
  kind: NotifyKind | string; title: string; sub?: string; link: string; refId?: string;
  action?: string; by: Person;
  /** Also queue a phone push (default true). */
  push?: boolean;
  /** A stable notification id (same for every recipient), e.g. `b_<broadcastId>`; writing it again brings it back as new. */
  id?: string;
  urgent?: boolean;
  tag?: string;
};

/** A notification link is always an in-app path. */
export const appLink = (link: string) => (/^\/(?!\/)/.test(link) ? link : '/' + link.replace(/^[a-z]+:\/\/[^/]*\/?/i, '').replace(/^\/+/, ''));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** The writes that notify `uids` (the sender is skipped, duplicates removed). Empty when nobody is left. */
export function notifyWrites(fs: Firestore, uids: string[], n: NotifySpec): Write[] {
  const to = [...new Set(uids.filter(Boolean))].filter((u) => u !== n.by.uid);
  if (!to.length) return [];
  const createdAt = nowIso();
  const link = appLink(n.link);
  const out: Write[] = [];
  for (const uid of to) {
    const id = n.id || autoId();
    out.push(fs.set(`users/${uid}/notifications`, id, {
      id, kind: n.kind, title: clip(n.title, 120), sub: clip(n.sub || '', 240), link, refId: n.refId || '',
      ...(n.action ? { action: n.action } : {}), by: n.by, createdAt, readAt: null,
    }));
  }
  if (n.push !== false) {
    for (let i = 0; i < to.length; i += 200) {
      const id = autoId();
      out.push(fs.set('push_jobs', id, {
        id, kind: n.kind, title: clip(n.title, 80), body: clip(n.sub || '', 180), link, to: to.slice(i, i + 200),
        createdBy: n.by, createdAt, sentAt: null, urgent: !!n.urgent, tag: n.tag || id, refId: n.refId || '',
      }));
    }
  }
  return out;
}
