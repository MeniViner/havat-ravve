// Team broadcasts (B1-B4) and the notification list (C1). Data through db.ts only, so the same screens run on demo data
// and on Firestore. Model: docs/redesign-data/broadcast.md.
//
//   broadcasts/{id}              text (<=200), audience, urgent, by, createdAt, recipients (uids, snapshot), recipientCount, eventId?, resentAt?
//   broadcasts/{id}/reads/{uid}  the person's own receipt: seenAt when the card first appeared, at when they tapped "קראתי"
//   users/{uid}/notifications    C1 (notify.ts); a broadcast writes b_<broadcastId> for each recipient
//   push_jobs/{id}               the outbox the Worker drains (notify.ts, api/src/push.ts)
import { useMemo } from 'react';
import { useList, useDoc, write, newId } from '../../db';
import { nowIso, todayKey } from '../../clock';
import { useAllEvents } from '../../data';
import { keyOf, hhmm, daysFromToday, ddmm } from '../format';
import { notify, markNotificationsRead } from './notify';
import type { Actor, Broadcast, BroadcastAudience, BroadcastRead, CalendarItem, EventVendorV2, FarmEvent, Profile, RoleInvite, Staffing, UserNotification } from '../../types';
import { AUDIENCE_LABELS } from '../../types';
import type { V2Ctx } from '../ctx';

export { AUDIENCE_LABELS };
export const TEXT_MAX = 200;
export const AUDIENCES: BroadcastAudience[] = ['all', 'farmToday', 'managers', 'crew', 'vendors'];

/** A receipt: `seenAt` is written when the card first shows on the person's phone, `at` when they tap "קראתי". */
export type Receipt = Omit<BroadcastRead, 'at'> & { at: string | null; seenAt?: string };
export const isRead = (r: Receipt | null | undefined) => !!r?.at;

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** The lock-screen title (B1 preview, push job, C1 row): "הודעה מבני". */
export const pushTitle = (by: Actor | { name: string }) => `הודעה מ${firstName(by.name)}`;
/** "היום 14:10" / "אתמול 11:30" / "26.10" (B2, B3). */
export function sentWhen(iso: string) {
  const d = daysFromToday(iso);
  return d === 0 ? `היום ${hhmm(iso)}` : d === -1 ? `אתמול ${hhmm(iso)}` : ddmm(iso);
}
/** "14:10" today, otherwise like sentWhen (B4 card). */
export const cardWhen = (iso: string) => (daysFromToday(iso) === 0 ? hhmm(iso) : sentWhen(iso));
/** "בני · היום 14:10 · כל הצוות" */
export const sentLine = (b: Broadcast) => `${firstName(b.by.name)} · ${sentWhen(b.createdAt)} · ${AUDIENCE_LABELS[b.audience] || ''}`;

// ---------- audiences (B1) ----------
type Person = { uid: string; name: string; phone: string };
const person = (p: Profile): Person => ({ uid: p.uid, name: p.displayName, phone: p.phone || '' });
export type Audiences = { members: Record<BroadcastAudience, Person[]>; event: FarmEvent | null; loading: boolean };

/** The event the "event crew" and "vendors" audiences refer to: the one named in the link, today's, or the next one. */
export function pickEvent(events: FarmEvent[], today: string, wanted?: string): FarmEvent | null {
  if (wanted) return events.find((e) => e.id === wanted) || null;
  const live = events.filter((e) => e.published && !(e as { closed?: unknown }).closed);
  const now = live.find((e) => keyOf(e.start) <= today && keyOf(e.end || e.start) >= today);
  if (now) return now;
  return live.filter((e) => keyOf(e.start) > today).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}

/** Who each audience reaches right now. Managers only (it reads presence, staffing and vendor accounts). */
export function useAudiences(ctx: V2Ctx, eventId?: string): Audiences {
  const today = ctx.today || todayKey();
  const events = useAllEvents(ctx.manager);
  const event = useMemo(() => pickEvent(events.items, today, eventId), [events.items, today, eventId]);
  const presence = useList<CalendarItem>('calendar', { where: [['kind', '==', 'presence'], ['date', '==', today]] }, ctx.manager);
  const staffing = useList<Staffing>(`events/${event?.id || '_'}/staffing`, {}, ctx.manager && !!event);
  const stalls = useList<EventVendorV2>(`events/${event?.id || '_'}/vendors`, {}, ctx.manager && !!event);
  const vendorUsers = useList<Profile>('users', { where: [['role', '==', 'vendor']] }, ctx.manager);
  const members = useMemo(() => {
    const team = ctx.team.filter((p) => p.status === 'active');
    const byUid = new Map(team.map((p) => [p.uid, p]));
    const here = new Set(presence.items.map((c) => c.ownerUid));
    const crewUids = new Set(staffing.items.flatMap((s) => (s.people || []).map((p) => p.uid)));
    const stallIds = new Set(stalls.items.filter((v) => v.status !== 'declined').map((v) => v.vendorId || v.id));
    const m: Record<BroadcastAudience, Person[]> = {
      all: team.map(person),
      farmToday: team.filter((p) => here.has(p.uid)).map(person),
      managers: team.filter((p) => p.role === 'owner' || p.role === 'manager').map(person),
      crew: [...crewUids].map((u) => byUid.get(u)).filter((p): p is Profile => !!p).map(person),
      vendors: vendorUsers.items.filter((p) => p.status === 'active' && p.vendorId && stallIds.has(p.vendorId)).map(person),
    };
    return m;
  }, [ctx.team, presence.items, staffing.items, stalls.items, vendorUsers.items]);
  return { members, event, loading: events.loading || presence.loading || vendorUsers.loading };
}

// ---------- reads ----------
export const useSentBroadcasts = (enabled: boolean) => useList<Broadcast>('broadcasts', { orderBy: [['createdAt', 'desc']], limit: 50 }, enabled);
export const useBroadcast = (id: string, enabled = true) => useDoc<Broadcast>('broadcasts/' + (id || '_'), enabled && !!id);
export const useReceipts = (id: string, enabled = true) => useList<Receipt>(`broadcasts/${id || '_'}/reads`, {}, enabled && !!id);
export const useReceipt = (id: string, uid: string, enabled = true) => useDoc<Receipt>(`broadcasts/${id || '_'}/reads/${uid || '_'}`, enabled && !!id && !!uid);
/** Broadcasts addressed to me, newest first (B4 card, the vendor home list D3). Needs the index recipients (array) + createdAt desc. */
export const useMyBroadcasts = (uid: string, max = 10, enabled = true) =>
  useList<Broadcast>('broadcasts', { where: [['recipients', 'array-contains', uid]], orderBy: [['createdAt', 'desc']], limit: max }, enabled && !!uid);
/** Who is at the farm today (B3 "לא בחווה היום"). */
export const usePresenceToday = (today: string, enabled = true) => useList<CalendarItem>('calendar', { where: [['kind', '==', 'presence'], ['date', '==', today]] }, enabled);
export const useRoleInvites = (enabled: boolean) => useList<RoleInvite>('role_invites', {}, enabled);

/** B4: a normal broadcast is a card on the day it was sent; an urgent one stays at the top until read ("נשארת בראש עד שקוראים"). */
export const cardEligible = (b: Broadcast) => b.urgent || keyOf(b.createdAt) === todayKey();

// ---------- writes ----------
export type Draft = { text: string; audience: BroadcastAudience; urgent: boolean; eventId?: string };

/** B1 "שליחה": the broadcast, the sender's own receipt, a notification for every recipient and one push job. */
export async function sendBroadcast(actor: Actor, d: Draft, recipients: string[]): Promise<Broadcast> {
  const text = d.text.trim().slice(0, TEXT_MAX);
  if (!text) throw new Error('צריך לכתוב הודעה');
  const to = [...new Set(recipients.filter(Boolean))];
  if (!to.length) throw new Error('אין למי לשלוח');
  const id = newId('broadcasts');
  const createdAt = nowIso();
  const b: Broadcast = { id, text, audience: d.audience, urgent: !!d.urgent, by: actor, createdAt, recipients: to, recipientCount: to.length, resentAt: null, ...(d.eventId ? { eventId: d.eventId } : {}) };
  const ops: Parameters<typeof write.batch>[0] = [{ op: 'set', col: 'broadcasts', id, data: b as unknown as Record<string, unknown> }];
  // the sender wrote it, so it is read for them (and no card shows on their own phone)
  if (to.includes(actor.uid)) ops.push({ op: 'set', col: `broadcasts/${id}/reads`, id: actor.uid, data: { id: actor.uid, uid: actor.uid, name: actor.name, at: createdAt, seenAt: createdAt } });
  await write.batch(ops);
  await notify(to, notice(b, actor));
  return b;
}
const notice = (b: Broadcast, by: Actor) => ({
  id: 'b_' + b.id, kind: 'broadcast' as const, title: pushTitle(b.by), sub: b.text, link: b.audience === 'vendors' ? '/vendor' : '/tasks',
  refId: b.id, by, urgent: b.urgent, tag: 'b_' + b.id,
});

/** B3 "לשלוח שוב": notifies again only the people without a read receipt. Returns how many. */
export async function resendBroadcast(actor: Actor, b: Broadcast, receipts: Receipt[]): Promise<number> {
  const read = new Set(receipts.filter(isRead).map((r) => r.uid));
  const to = b.recipients.filter((u) => !read.has(u) && u !== actor.uid);
  if (!to.length) return 0;
  await write.update('broadcasts', b.id, { resentAt: nowIso() });
  await notify(to, notice(b, actor));
  return to.length;
}

/** The card appeared on this phone: a receipt without `at` (B3 tells "עוד לא נכנס לאפליקציה" from "ראה ולא קרא"). */
export async function markSeen(actor: Actor, broadcastId: string) {
  // a merge, so a "read" written meanwhile on another phone is never turned back into "seen"
  await write.merge(`broadcasts/${broadcastId}/reads`, actor.uid, { id: actor.uid, uid: actor.uid, name: actor.name, seenAt: nowIso() });
}

/** B4 "קראתי": my receipt, and the matching notification in C1 is no longer new. */
export async function markRead(actor: Actor, broadcastId: string, prev: Receipt | null, notification: UserNotification | null) {
  const t = nowIso();
  await write.set(`broadcasts/${broadcastId}/reads`, actor.uid, { id: actor.uid, uid: actor.uid, name: actor.name, at: t, seenAt: prev?.seenAt || t });
  if (notification && !notification.readAt) await markNotificationsRead(actor.uid, [notification.id]);
}

// ---------- notifications (C1) ----------
export const useNotifications = (uid: string, enabled = true) =>
  useList<UserNotification>(`users/${uid || '_'}/notifications`, { orderBy: [['createdAt', 'desc']], limit: 60 }, enabled && !!uid);
export const useBroadcastNotification = (uid: string, broadcastId: string, enabled = true) =>
  useDoc<UserNotification>(`users/${uid || '_'}/notifications/b_${broadcastId || '_'}`, enabled && !!uid && !!broadcastId);
