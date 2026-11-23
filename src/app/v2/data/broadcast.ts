// Team broadcasts (B1-B4) and the notification list (C1). Data through db.ts only, so the same screens run on demo data
// and on Firestore. Model: docs/redesign-data/broadcast.md.
//
//   broadcasts/{id}              text (<=200), audience, urgent, by, createdAt, recipients (uids, snapshot), recipientCount, eventId?, resentAt?
//   broadcasts/{id}/reads/{uid}  the person's own receipt: seenAt when the card first appeared, at when they tapped "קראתי"
//   users/{uid}/notifications    C1 (notify.ts); a broadcast writes b_<broadcastId> for each recipient
//   push_jobs/{id}               the outbox the Worker drains (notify.ts, api/src/push.ts)
//   email_outbox/bc_<id>_<uid>   "לשלוח גם במייל" (Q26): one job per person without push, drained by the Worker cron (api/src/email.ts)
//   users/{uid}.updatesOptIn     "לקבל עדכונים מהחווה": a message to all users reaches only people with true
import { useMemo } from 'react';
import { useList, useDoc, write, newId } from '../../db';
import { nowIso, todayKey } from '../../clock';
import { useAllEvents } from '../../data';
import { keyOf, hhmm, daysFromToday, ddmm } from '../format';
import { notify, markNotificationsRead } from './notify';
import type { Actor, Broadcast, BroadcastAudience, BroadcastRead, CalendarItem, EventVendorV2, FarmEvent, Profile, RoleInvite, Staffing, Ticket, UserNotification } from '../../types';
import { AUDIENCE_LABELS, OUTSIDE_AUDIENCES } from '../../types';
import type { V2Ctx } from '../ctx';

export { AUDIENCE_LABELS };
export const TEXT_MAX = 200;

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
/** "בני · היום 14:10" (Q25, where the audience is the tag above). */
export const sentBy = (b: Broadcast) => `${firstName(b.by.name)} · ${sentWhen(b.createdAt)}`;
/** "בני · היום 14:10 · כל הצוות" (B3 hero). */
export const sentLine = (b: Broadcast, eventTitle?: string) => `${sentBy(b)} · ${audienceLabel(b.audience, eventTitle)}`;

// ---------- audiences (Q26) ----------
/** A recipient as Q26 counts them: `pushes` = the Worker will reach this person's phone (api/src/push.ts: team and vendors
 *  with push on, a device, and broadcasts among their kinds); `email` only when it is a usable address. */
export type Person = { uid: string; name: string; phone: string; email: string; pushes: boolean };
const EMAIL_RE = /^[^\s@?&/#]+@[^\s@?&/#]+\.[^\s@?&/#]+$/;
const PUSH_ROLES = new Set(['owner', 'manager', 'staff', 'vendor']);
type PushPrefs = { enabled?: boolean; kinds?: string[]; devices?: unknown[] };
export function pushReaches(p: Profile): boolean {
  const push = (p.push || {}) as PushPrefs;
  return PUSH_ROLES.has(p.role) && push.enabled === true && Array.isArray(push.devices) && push.devices.length > 0 && (!Array.isArray(push.kinds) || push.kinds.includes('broadcast'));
}
const person = (p: Profile): Person => ({ uid: p.uid, name: p.displayName, phone: p.phone || '', email: EMAIL_RE.test((p.email || '').trim()) ? p.email.trim() : '', pushes: pushReaches(p) });
export type Audiences = { members: Record<BroadcastAudience, Person[]>; event: FarmEvent | null; candidates: FarmEvent[]; loading: boolean };

/** The team audiences, then the ones outside the team (Q26 shows them as two groups; Q25 tags them warm and neutral). */
export const TEAM_AUDIENCES: BroadcastAudience[] = ['all', 'farmToday', 'managers', 'crew'];
export const AUDIENCES: BroadcastAudience[] = [...TEAM_AUDIENCES, ...OUTSIDE_AUDIENCES];
export const isOutside = (a: BroadcastAudience) => OUTSIDE_AUDIENCES.includes(a);
/** The audience as a tag (Q25) or a choice (Q26): "נרשמי פסטיבל הסתיו". */
export const audienceLabel = (a: BroadcastAudience, eventTitle?: string) => (a === 'registrants' && eventTitle ? `נרשמי ${eventTitle}` : AUDIENCE_LABELS[a] || '');

/** "לשלוח גם במייל": at most this many e-mails per message. The Worker's daily allowance for messages (api/src/email.ts
 *  BROADCAST_DAILY) is the same number, a third of the provider's free 300 a day, so payment confirmations always keep room. */
export const EMAIL_CAP = 100;
/** Who of these gets the e-mail copy: no push on their phone, a usable address, never the sender; the first EMAIL_CAP. */
export function emailTargets(to: Person[], sender: string) {
  const without = to.filter((p) => !p.pushes && p.uid !== sender);
  const mailable = without.filter((p) => p.email);
  return { withoutPush: without.length, mailable: mailable.length, send: mailable.slice(0, EMAIL_CAP) };
}

/** The event the "event crew", "vendors" and "registrants" audiences refer to: the one named in the link, today's, or the next one. */
export function pickEvent(events: FarmEvent[], today: string, wanted?: string): FarmEvent | null {
  if (wanted) return events.find((e) => e.id === wanted) || null;
  const live = events.filter((e) => e.published && !(e as { closed?: unknown }).closed);
  const now = live.find((e) => keyOf(e.start) <= today && keyOf(e.end || e.start) >= today);
  if (now) return now;
  return live.filter((e) => keyOf(e.start) > today).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}
const shiftKey = (key: string, days: number) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
/** Events whose registrants one may write to (the rule-9 picker): published, upcoming or ended in the last two weeks. */
export function registrantEvents(events: FarmEvent[], today: string, current: FarmEvent | null): FarmEvent[] {
  const from = shiftKey(today, -14);
  const list = events.filter((e) => e.published && keyOf(e.end || e.start) >= from);
  if (current && !list.some((e) => e.id === current.id)) list.push(current);
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

/** Who each audience reaches right now. Managers only (it reads presence, staffing, tickets and every profile). */
export function useAudiences(ctx: V2Ctx, eventId?: string): Audiences {
  const today = ctx.today || todayKey();
  const events = useAllEvents(ctx.manager);
  const event = useMemo(() => pickEvent(events.items, today, eventId), [events.items, today, eventId]);
  const candidates = useMemo(() => registrantEvents(events.items, today, event), [events.items, today, event]);
  const presence = useList<CalendarItem>('calendar', { where: [['kind', '==', 'presence'], ['date', '==', today]] }, ctx.manager);
  const staffing = useList<Staffing>(`events/${event?.id || '_'}/staffing`, {}, ctx.manager && !!event);
  const stalls = useList<EventVendorV2>(`events/${event?.id || '_'}/vendors`, {}, ctx.manager && !!event);
  const tickets = useList<Ticket>('tickets', { where: [['eventId', '==', event?.id || '_']] }, ctx.manager && !!event);
  const vendorUsers = useList<Profile>('users', { where: [['role', '==', 'vendor']] }, ctx.manager);
  const members = useMemo(() => {
    const team = ctx.team.filter((p) => p.status === 'active');
    const byUid = new Map(team.map((p) => [p.uid, p]));
    const here = new Set(presence.items.map((c) => c.ownerUid));
    const crewUids = new Set(staffing.items.flatMap((s) => (s.people || []).map((p) => p.uid)));
    const stallIds = new Set(stalls.items.filter((v) => v.status !== 'declined').map((v) => v.vendorId || v.id));
    // every profile a manager can see (ctx.peopleByUid holds the team and, for managers, every user); blocked people never
    const everybody = [...ctx.peopleByUid.values()].filter((p) => p.status === 'active');
    const active = new Map(everybody.map((p) => [p.uid, p]));
    // a service message: everyone holding a ticket that is not cancelled, whatever they chose about updates
    const registrantUids = new Set(tickets.items.filter((t) => t.status !== 'cancelled' && t.paymentStatus !== 'cancelled' && t.ownerUid).map((t) => t.ownerUid));
    const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, 'he');
    const m: Record<BroadcastAudience, Person[]> = {
      all: team.map(person),
      farmToday: team.filter((p) => here.has(p.uid)).map(person),
      managers: team.filter((p) => p.role === 'owner' || p.role === 'manager').map(person),
      crew: [...crewUids].map((u) => byUid.get(u)).filter((p): p is Profile => !!p).map(person),
      vendors: vendorUsers.items.filter((p) => p.status === 'active' && p.vendorId && stallIds.has(p.vendorId)).map(person),
      registrants: [...registrantUids].map((u) => active.get(u)).filter((p): p is Profile => !!p).map(person).sort(byName),
      // an update: only people who agreed to receive updates (Profile.updatesOptIn). Open decision: Meni has not confirmed it.
      everyone: everybody.filter((p) => p.updatesOptIn === true).map(person).sort(byName),
    };
    return m;
  }, [ctx.team, ctx.peopleByUid, presence.items, staffing.items, stalls.items, tickets.items, vendorUsers.items]);
  return { members, event, candidates, loading: events.loading || presence.loading || vendorUsers.loading || tickets.loading };
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

/** One e-mail job in the Worker's outbox (api/src/email.ts, broadcast lane). Only these fields: the Worker reads the text from
 *  the broadcast itself and skips the job when the broadcast was deleted. Shape checked by firestore.rules (email_outbox). */
export type BroadcastMailJob = { kind: 'broadcast'; broadcastId: string; uid: string; status: 'queued'; createdBy: Actor; createdAt: string };
export const mailJobId = (broadcastId: string, uid: string) => `bc_${broadcastId}_${uid}`;
/** firestore.rules caps a broadcast's recipient list (the document stays small). */
export const RECIPIENTS_MAX = 2000;

/** Q26 "שליחה": the broadcast, the sender's own receipt, a notification for every recipient, one push job, and with
 *  "לשלוח גם במייל" one e-mail job per person in `o.email` (people without push; at most EMAIL_CAP). */
export async function sendBroadcast(actor: Actor, d: Draft, recipients: string[], o: { email?: string[] } = {}): Promise<Broadcast> {
  const text = d.text.trim().slice(0, TEXT_MAX);
  if (!text) throw new Error('צריך לכתוב הודעה');
  const to = [...new Set(recipients.filter(Boolean))];
  if (!to.length) throw new Error('אין למי לשלוח');
  if (to.length > RECIPIENTS_MAX) throw new Error(`אפשר לשלוח עד ${RECIPIENTS_MAX} אנשים בהודעה אחת`);
  const id = newId('broadcasts');
  const createdAt = nowIso();
  const b: Broadcast = { id, text, audience: d.audience, urgent: !!d.urgent, by: actor, createdAt, recipients: to, recipientCount: to.length, resentAt: null, ...(d.eventId ? { eventId: d.eventId } : {}) };
  const ops: Parameters<typeof write.batch>[0] = [{ op: 'set', col: 'broadcasts', id, data: b as unknown as Record<string, unknown> }];
  // the sender wrote it, so it is read for them (and no card shows on their own phone)
  if (to.includes(actor.uid)) ops.push({ op: 'set', col: `broadcasts/${id}/reads`, id: actor.uid, data: { id: actor.uid, uid: actor.uid, name: actor.name, at: createdAt, seenAt: createdAt } });
  await write.batch(ops);
  await notify(to, notice(b, actor));
  const mail = [...new Set((o.email || []).filter((u) => u && u !== actor.uid && to.includes(u)))].slice(0, EMAIL_CAP);
  const jobs = mail.map((uid) => {
    const job: BroadcastMailJob = { kind: 'broadcast', broadcastId: id, uid, status: 'queued', createdBy: actor, createdAt };
    return { op: 'set' as const, col: 'email_outbox', id: mailJobId(id, uid), data: job as unknown as Record<string, unknown> };
  });
  for (let i = 0; i < jobs.length; i += 450) await write.batch(jobs.slice(i, i + 450));
  return b;
}
/** Where the notification opens: the vendor home, the team's tasks, or the person's own home ("/" lands guests on U1 with the
 *  card, the team on /tasks and vendors on /vendor). */
const noticeLink = (a: BroadcastAudience) => (a === 'vendors' ? '/vendor' : isOutside(a) ? '/' : '/tasks');
const notice = (b: Broadcast, by: Actor) => ({
  id: 'b_' + b.id, kind: 'broadcast' as const, title: pushTitle(b.by), sub: b.text, link: noticeLink(b.audience),
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
/** The owner deletes a broadcast. The read receipts under it are left (nobody can list them without the broadcast), and so are
 *  the copies in each person's notifications: those belong to the person. */
export const deleteBroadcast = (b: Broadcast) => write.remove('broadcasts', b.id);
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

// ---------- updates consent ----------
/** "לקבל עדכונים מהחווה" (/me/edit, the guest account page): the person's own choice, written on its own. */
export const setUpdatesOptIn = (uid: string, on: boolean) => write.update('users', uid, { updatesOptIn: on, updatedAt: nowIso() });
