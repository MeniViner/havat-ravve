// Broadcasts (B1-B3) and personal notifications (C1), written exactly as src/app/v2/data/broadcast.ts and notify.ts do.
// The audience is resolved here the way useAudiences() resolves it in the app at send time. Model: docs/redesign-data/broadcast.md.
import { messageActivityText, notificationTargets, OUTSIDE_AUDIENCES, type BroadcastAudience } from '../../../shared/message-activity';
import { requireScope, TEAM_ROLES } from '../auth';
import { ApiError, invalid } from '../http';
import type { Firestore, Write } from '../firestore';
import { type Person, activity, forbidden, isOwner, mustGet, nowIso, project, todayIL } from '../core';
import { notifyWrites, appLink } from '../notify';
import { autoId } from '../util';
import { bool, def, type Ctx, en, farmTime, opt, req, str } from '../writes';

export const AUDIENCES = ['all', 'farmToday', 'managers', 'crew', 'vendors'] as const;
const AUDIENCE_HE = 'all כל הצוות, farmToday מי שבחווה היום (רשום בנוכחות), managers מנהלים ובעלים, crew צוות האירוע (שיבוץ), vendors בעלי הדוכנים של האירוע';
const TEAM = ['owner', 'manager', 'staff'];
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** pushTitle(): "הודעה מבני" */
const pushTitle = (by: { name: string }) => `הודעה מ${firstName(by.name)}`;

type F = Record<string, unknown>;
const eq = (field: string, value: string | boolean): F => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value } } });
const and = (fl: F[]) => (fl.length === 1 ? fl[0] : { compositeFilter: { op: 'AND', filters: fl } });

/** pickEvent(): the event the crew/vendors audiences refer to: the one named, today's, or the next published one. */
async function pickEvent(fs: Firestore, today: string, wanted: string | null) {
  if (wanted) {
    const e = await fs.get('events', wanted);
    if (!e) throw invalid('eventId', 'no such event');
    return e;
  }
  const live = (await fs.query({ from: [{ collectionId: 'events' }], where: eq('published', true), orderBy: [{ field: { fieldPath: 'start' }, direction: 'ASCENDING' }], limit: 300 }))
    .filter((e) => !e.data.closed);
  const day = (v: unknown) => farmTime(String(v || '')).slice(0, 10);
  return live.find((e) => day(e.data.start) <= today && day(e.data.end || e.data.start) >= today) || live.find((e) => day(e.data.start) > today) || null;
}

/** useAudiences(): who an audience reaches right now (active people only; the event for crew/vendors). */
export async function resolveAudience(fs: Firestore, audience: string, eventId: string | null) {
  const today = todayIL();
  const team = (await fs.query({ from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'IN', value: { arrayValue: { values: TEAM.map((r) => ({ stringValue: r })) } } } }, limit: 5000 }))
    .filter((p) => p.data.status === 'active');
  const byUid = new Map(team.map((p) => [p.id, p]));
  const event = audience === 'crew' || audience === 'vendors' ? await pickEvent(fs, today, eventId) : null;
  if ((audience === 'crew' || audience === 'vendors') && !event) throw invalid('eventId', 'there is no current or upcoming published event: name one with eventId');
  let people = team;
  if (audience === 'managers') people = team.filter((p) => p.data.role === 'owner' || p.data.role === 'manager');
  if (audience === 'farmToday') {
    const here = new Set((await fs.query({ from: [{ collectionId: 'calendar' }], where: and([eq('kind', 'presence'), eq('date', today)]), limit: 1000 })).map((c) => String(c.data.ownerUid)));
    people = team.filter((p) => here.has(p.id));
  }
  if (audience === 'crew') {
    const staffing = await fs.query({ from: [{ collectionId: 'staffing' }], limit: 500 }, `events/${event!.id}`);
    const uids = new Set(staffing.flatMap((s) => ((s.data.people as { uid?: string }[]) || []).map((p) => String(p.uid || ''))));
    people = [...uids].map((u) => byUid.get(u)).filter((p): p is NonNullable<typeof p> => !!p);
  }
  if (audience === 'vendors') {
    const stalls = await fs.query({ from: [{ collectionId: 'vendors' }], limit: 500 }, `events/${event!.id}`);
    const stallIds = new Set(stalls.filter((v) => v.data.status !== 'declined').map((v) => String(v.data.vendorId || v.id)));
    people = (await fs.query({ from: [{ collectionId: 'users' }], where: eq('role', 'vendor'), limit: 5000 }))
      .filter((p) => p.data.status === 'active' && p.data.vendorId && stallIds.has(String(p.data.vendorId)));
  }
  const members = people.map((p) => ({ uid: p.id, name: String(p.data.displayName || '') }));
  return { members, event: event ? { id: event.id, title: String(event.data.title || ''), start: event.data.start ?? null } : null, date: today };
}

function requireBroadcastScopes(c: Ctx, audience: BroadcastAudience, urgent: boolean) {
  if (OUTSIDE_AUDIENCES.includes(audience) && !c.caller.legacyExternalBroadcasts) requireScope(c.caller, 'notify:all');
  if (urgent) requireScope(c.caller, 'broadcasts:urgent');
}

const notice = (b: { id: string; text: string; audience: string; urgent: boolean; by: Person }, by: Person) => ({
  id: 'b_' + b.id, kind: 'broadcast', title: pushTitle(b.by), sub: b.text, link: b.audience === 'vendors' ? '/vendor' : '/tasks',
  refId: b.id, by, urgent: b.urgent, tag: 'b_' + b.id,
});

// sendBroadcast()
def('broadcasts.send', 'broadcasts:write', 'שליחת הודעה לצוות (מגיעה כהתראה באפליקציה ובטלפון)', {
  text: str(200, 'ההודעה', true, 1), audience: en([...AUDIENCES], AUDIENCE_HE, true), urgent: bool('דחוף: נשארת בראש המסך עד שקוראים', false),
  eventId: opt('לצוות האירוע / בעלי הדוכנים: איזה אירוע (ברירת מחדל: של היום או הבא)'),
  includeSelf: { type: 'bool', default: false, omitWhenFalse: true, he: 'גם לשולח, אם הוא בקהל' },
  preview: bool('true: רק מחזיר למי זה יגיע, בלי לשלוח', false),
}, async (c) => {
  const i = c.input;
  requireBroadcastScopes(c, i.audience, !!i.urgent);
  if ((i.audience === 'crew' || i.audience === 'vendors') === false && i.eventId) throw invalid('eventId', 'eventId is only for the crew and vendors audiences');
  const { members, event } = await resolveAudience(c.fs, i.audience, i.eventId);
  const to = [...new Set(members.map((m) => m.uid))];
  if (i.preview) return { writes: [], refs: [], data: { preview: true, recipientCount: to.length, recipients: members, event } };
  if (!to.length) throw invalid('audience', 'nobody is in this audience right now (אין למי לשלוח)');
  if (to.length > 500) throw invalid('audience', `this audience has ${to.length} people; a broadcast reaches at most 500`);
  const id = autoId();
  const createdAt = nowIso();
  const b = { id, text: i.text, audience: i.audience, urgent: !!i.urgent, by: c.me, createdAt, recipients: to, recipientCount: to.length, resentAt: null, ...(event ? { eventId: event.id } : {}) };
  const writes: Write[] = [c.fs.create('broadcasts', id, b)];
  // the sender wrote it, so it is read for them (and no card shows on their own phone)
  if (!i.includeSelf && to.includes(c.me.uid)) writes.push(c.fs.set(`broadcasts/${id}/reads`, c.me.uid, { id: c.me.uid, uid: c.me.uid, name: c.me.name, at: createdAt, seenAt: createdAt }));
  const notified = notificationTargets(to, c.me.uid, i.includeSelf);
  writes.push(
    activity(c.fs, c.me, 'message', id, 'message_sent', messageActivityText(b.audience, b.recipientCount, b.urgent, b.text), { eventId: event?.id }),
    ...notifyWrites(c.fs, notified, { ...notice(b, c.me), includeSelf: i.includeSelf }),
  );
  return { status: 201, writes, refs: [{ col: 'broadcasts', id, expected: { text: b.text, recipientCount: b.recipientCount } }], data: { broadcastId: id, recipientCount: to.length, notified: notified.length, event } };
}, [
  'Confirm the text and the audience with the user first; preview=true shows who it reaches without sending (then send with a new Idempotency-Key).',
  'Urgent messages require broadcasts:urgent. Broadcasts outside the team require notify:all.',
  'Each recipient gets an in-app notification and a phone push (urgent: high priority, stays on screen). The sender is counted when in the audience. By default their copy starts read and they receive no notification. Set includeSelf=true for an unread copy, an in-app notification and a push.',
]);

// resendBroadcast()
def('broadcasts.resend', 'broadcasts:write', 'שליחה חוזרת של הודעה לצוות, רק למי שעוד לא קרא', { broadcastId: req() }, async (c) => {
  const b = await mustGet(c.fs, 'broadcasts', c.input.broadcastId, c.tx, 'broadcast');
  const audience = String(b.data.audience) as BroadcastAudience;
  const urgent = b.data.urgent === true;
  requireBroadcastScopes(c, audience, urgent);
  const reads = await c.fs.query({ from: [{ collectionId: 'reads' }], limit: 1000 }, `broadcasts/${b.id}`);
  const read = new Set(reads.filter((r) => !!r.data.at).map((r) => String(r.data.uid || r.id)));
  const to = ((b.data.recipients as string[]) || []).filter((u) => !read.has(u) && u !== c.me.uid);
  if (!to.length) return { writes: [], refs: [{ col: 'broadcasts', id: b.id }], data: { notified: 0, changed: false } };
  const now = nowIso();
  const writes: Write[] = [c.fs.patch('broadcasts', b.id, { resentAt: now }, b.updateTime),
    activity(c.fs, c.me, 'message', b.id, 'message_resent', messageActivityText(audience, to.length, urgent), { eventId: String(b.data.eventId || '') }),
    ...notifyWrites(c.fs, to, notice({ id: b.id, text: String(b.data.text), audience, urgent, by: b.data.by as Person }, c.me))];
  return { writes, refs: [{ col: 'broadcasts', id: b.id, expected: { resentAt: now } }], data: { notified: to.length, changed: true } };
}, ['Their notification comes back as new (same notification, not a second one). Nobody unread: "changed": false and nothing is sent.']);

// deleteBroadcast()
def('broadcasts.delete', 'broadcasts:write', 'מחיקת הודעה לצוות (בעלים בלבד)', { broadcastId: req() }, async (c) => {
  if (!isOwner(c.caller)) throw forbidden('only the owner deletes a broadcast');
  const b = await mustGet(c.fs, 'broadcasts', c.input.broadcastId, c.tx, 'broadcast');
  return { writes: [c.fs.remove('broadcasts', b.id, b.updateTime), activity(c.fs, c.me, 'message', b.id, 'message_deleted', b.id, { eventId: String(b.data.eventId || '') })], refs: [{ col: 'broadcasts', id: b.id, gone: true }], data: { deleted: project('broadcasts', b.id, b.data) } };
}, ['Destructive: confirm with the user first. The copies in each person\'s notifications stay (they belong to the person), as in the app.']);

// ======================= personal notifications (C1) =======================

// markNotificationsRead()
def('me.notifications.markRead', 'me:write', 'סימון ההתראות האישיות שלי כנקראו', {
  ids: { type: 'stringList', maxItems: 100, maxLength: 200, he: 'מזהי ההתראות (מתוך me.notifications.list)' },
  all: bool('true: כל מה שעוד לא נקרא', false),
}, async (c) => {
  const col = `users/${c.me.uid}/notifications`;
  if (!c.input.all && !(c.input.ids || []).length) throw invalid('ids', 'send ids, or all=true');
  const docs = c.input.all
    ? await c.fs.query({ from: [{ collectionId: 'notifications' }], orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 500 }, `users/${c.me.uid}`)
    : await c.fs.getMany(col, [...new Set(c.input.ids as string[])]);
  if (!c.input.all && docs.length < new Set(c.input.ids as string[]).size) throw new ApiError('NOT_FOUND', 'notification not found');
  const unread = docs.filter((d) => !d.data.readAt);
  const readAt = nowIso();
  return { writes: unread.map((d) => c.fs.patch(col, d.id, { readAt }, d.updateTime)), refs: unread.slice(0, 50).map((d) => ({ col, id: d.id, expected: { readAt } })), data: { marked: unread.length } };
}, ['Already-read notifications are left as they are ("marked" counts the ones changed).']);

// notify(): a direct message to chosen people, for the assistant (kind "system", in the app's bell and as a phone push)
def('notifications.send', 'notify:team', 'שליחת התראה אישית לאנשים מסוימים (בפעמון באפליקציה ובטלפון)', {
  uids: { type: 'stringList', maxItems: 200, maxLength: 128, required: true, he: 'uid של הנמענים (people.search / profiles.list)' },
  title: str(120, 'כותרת', true, 1), sub: str(240, 'טקסט'), link: str(200, 'נתיב באפליקציה שמתחיל ב־/ (לא קישור https), למשל /tasks/abc או /farm', true, 1),
  includeSelf: { type: 'bool', default: false, omitWhenFalse: true, he: 'גם לשולח, אם הוא ברשימת הנמענים' },
  push: bool('גם התראה בטלפון', true), urgent: bool('דחוף (בטלפון: נשאר על המסך)', false),
}, async (c) => {
  const i = c.input;
  if (!/^\/(?!\/)/.test(i.link)) throw invalid('link', 'link must be an in-app path starting with "/"');
  const uids = [...new Set(i.uids as string[])];
  const people = await c.fs.getMany('users', uids);
  const missing = uids.filter((u) => !people.some((p) => p.id === u));
  if (missing.length) throw invalid('uids', `unknown uid: ${missing.join(', ')}`);
  const inactive = people.filter((p) => p.data.status !== 'active').map((p) => p.id);
  if (inactive.length) throw invalid('uids', `not active: ${inactive.join(', ')}`);
  if (people.some((p) => !TEAM_ROLES.has(String(p.data.role)))) requireScope(c.caller, 'notify:all');
  const to = notificationTargets(uids, c.me.uid, i.includeSelf);
  if (!to.length) throw invalid('uids', 'nobody to notify (you do not notify yourself)');
  const id = autoId();
  const writes = notifyWrites(c.fs, to, { id, kind: 'system', title: i.title, sub: i.sub || '', link: appLink(i.link), by: c.me, push: i.push, urgent: i.urgent, includeSelf: i.includeSelf });
  return { status: 201, writes, refs: to.slice(0, 50).map((u) => ({ col: `users/${u}/notifications`, id, expected: { title: i.title.slice(0, 120) } })), data: { notificationId: id, notified: to.length } };
}, ['Confirm the text and the people with the user first. The person sees it in the app\'s notifications (and on the phone when push is on and they allow it).', 'link is an in-app path starting with "/" (for example /tasks/<id>); an https link is refused with 400.', 'notify:team limits recipients to active team members. notify:all also allows other active profiles. includeSelf=true includes the sender when listed.'], ['notify:all']);
