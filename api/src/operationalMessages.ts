import { Firestore, backoff, isContention, isUncertain, type Doc, type Env, type Write } from './firestore';
import { ApiError, invalid } from './http';
import { verifyIdToken } from './idtoken';
import { sha256hex } from './util';
import { activity, nextUpdatedAt } from './core';
import {
  eventGroups,
  eventReminderPeople,
  messageChannels,
  noticePerson,
  phoneDigits,
  whatsappDrafts,
  type EventGroup,
  type MessageChannel,
  type NoticePerson,
  type ReminderInputs,
  type VisitDecision,
} from '../../shared/operational-messages';

type Source = 'event' | 'visit';
type Actor = { uid: string; name: string };
type Command = {
  operationId: string;
  sourceId: string;
  text: string;
  groups: EventGroup[];
  channels: MessageChannel[];
  decision?: VisitDecision;
};
type Plan = {
  source: Source;
  sourceId: string;
  groups: EventGroup[];
  channels: MessageChannel[];
  title: string;
  text: string;
  actor: Actor;
  createdAt: string;
  fingerprint: string;
  inAppUids: string[];
  vendorUids?: string[];
  pushUids: string[];
  emailUids: string[];
  contacts: { uid: string; name: string; phone: string }[];
  cursor: number;
  total: number;
};
const notices = 'operational_notices';
const wordId = /^[\w-]{1,128}$/;
const validId = (key: string, v: unknown) => {
  if (typeof v !== 'string' || !wordId.test(v)) throw invalid(key, 'invalid document id');
  return v;
};
const day = (s: string) => /^\d{4}-\d\d-\d\d$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const arrays = <T extends string>(key: string, v: unknown, allowed: readonly T[]) => {
  if (!Array.isArray(v) || v.length > allowed.length || v.some(x => !allowed.includes(x)))
    throw invalid(key, 'invalid selection');
  return [...new Set(v as T[])].sort();
};
export function operationalCommand(source: Source, input: Record<string, unknown>): Command {
  const key = source === 'event' ? 'eventId' : 'visitId';
  if (
    Object.keys(input).some(
      k => !['operationId', key, 'text', 'channels', 'groups', ...(source === 'visit' ? ['decision'] : [])].includes(k),
    )
  )
    throw invalid('body', 'unexpected input field');
  const operationId = validId('operationId', input.operationId),
    sourceId = validId(key, input[key]);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text || [...text].length > 240) throw invalid('text', 'expected 1–240 characters');
  const channels = arrays('channels', input.channels, messageChannels);
  const groups = arrays('groups', input.groups ?? [], eventGroups);
  if ((source === 'event' && (!groups.length || !channels.length)) || (source === 'visit' && groups.length))
    throw invalid('groups', 'select groups and channels appropriate to this message');
  const out: Command = { operationId, sourceId, text, groups, channels };
  if (source === 'visit') {
    const raw = input.decision as Record<string, unknown> | undefined;
    if (
      !raw ||
      !['approved', 'rejected'].includes(String(raw.status)) ||
      typeof raw.expectedUpdatedAt !== 'string' ||
      !raw.expectedUpdatedAt ||
      raw.expectedUpdatedAt.length > 48 ||
      Object.keys(raw).some(k => !['status', 'date', 'time', 'managerNote', 'expectedUpdatedAt'].includes(k))
    )
      throw invalid('decision', 'expected a visit decision and its version');
    const date = raw.date === undefined ? '' : String(raw.date),
      time = raw.time === undefined ? '' : String(raw.time);
    if (date && (!/^\d{4}-\d\d-\d\d$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || !day(date)))
      throw invalid('date', 'invalid date');
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw invalid('time', 'invalid time');
    if (raw.managerNote !== undefined && (typeof raw.managerNote !== 'string' || raw.managerNote.length > 1000))
      throw invalid('managerNote', 'invalid internal note');
    out.decision = {
      status: raw.status as VisitDecision['status'],
      expectedUpdatedAt: raw.expectedUpdatedAt,
      date,
      time,
      ...(raw.managerNote !== undefined ? { managerNote: raw.managerNote as string } : {}),
    };
  }
  return out;
}
const where = (field: string, value: string) => ({
  fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
});
const fields = (names: string[]) => ({ fields: names.map(fieldPath => ({ fieldPath })) });
const profileFields = ['displayName', 'role', 'status', 'phone', 'email', 'vendorId', 'push'];
function profile(d: Doc): ReminderInputs['profiles'][number] {
  return {
    uid: d.id,
    displayName: String(d.data.displayName || ''),
    role: String(d.data.role || ''),
    status: String(d.data.status || ''),
    phone: String(d.data.phone || ''),
    email: String(d.data.email || ''),
    vendorId: String(d.data.vendorId || ''),
    push: d.data.push,
  };
}
async function eventPeople(fs: Firestore, eventId: string, groups: EventGroup[]) {
  const [registrations, stations, stalls, vendors, applicants, activityDocs] = await Promise.all([
    groups.includes('registrants')
      ? fs.query({
          from: [{ collectionId: 'tickets' }],
          where: where('eventId', eventId),
          select: fields([
            'ownerUid',
            'ownerName',
            'ownerPhone',
            'orderId',
            'eventId',
            'status',
            'paymentStatus',
            'test',
            'isTest',
            'selfRegistered',
            'walkIn',
          ]),
        })
      : [],
    groups.includes('crew')
      ? fs.query({ from: [{ collectionId: 'staffing' }], select: fields(['people']) }, 'events/' + eventId)
      : [],
    groups.includes('approvedVendors')
      ? fs.query(
          { from: [{ collectionId: 'vendors' }], select: fields(['vendorId', 'confirmed', 'status']) },
          'events/' + eventId,
        )
      : [],
    groups.includes('approvedVendors')
      ? fs.query({ from: [{ collectionId: 'users' }], where: where('role', 'vendor'), select: fields(profileFields) })
      : [],
    groups.includes('approvedVendors')
      ? fs.query(
          {
            from: [{ collectionId: 'vendor_applications' }],
            where: where('status', 'approved'),
            select: fields(['ownerUid', 'status']),
          },
          'events/' + eventId,
        )
      : [],
    groups.includes('registrants')
      ? fs.query({
          from: [{ collectionId: 'activity' }],
          where: where('eventId', eventId),
          select: fields(['kind', 'action', 'eventId', 'refId', 'by', 'subjectUid']),
        })
      : [],
  ]);
  const activity = activityDocs.map(d => d.data) as ReminderInputs['activity'];
  const applications = applicants
    .map(d => ({ ownerUid: String(d.data.ownerUid || ''), status: String(d.data.status || '') }))
    .filter(a => !!a.ownerUid);
  const tickets = registrations.map(d => ({
    id: d.id,
    ...d.data,
    test: d.data.test === true || d.data.isTest === true,
  })) as ReminderInputs['tickets'];
  const staffing = stations.map(d => ({ people: d.data.people || [] })) as ReminderInputs['staffing'];
  const ids = [
    ...new Set(
      [
        ...tickets.map(t => t.ownerUid),
        ...applications.map(a => a.ownerUid),
        ...staffing.flatMap(s => (s.people || []).map(p => p.uid)),
      ].filter(uid => typeof uid === 'string' && wordId.test(uid)),
    ),
  ];
  const users = [...vendors];
  for (let i = 0; i < ids.length; i += 200)
    users.push(...(await fs.getMany('users', ids.slice(i, i + 200), profileFields)));
  return eventReminderPeople(
    {
      tickets,
      activity,
      applications,
      staffing,
      profiles: users.map(profile),
      stalls: stalls.map(d => ({ id: d.id, ...d.data })),
    },
    groups,
  );
}
function makePlan(
  source: Source,
  c: Command,
  actor: Actor,
  people: NoticePerson[],
  fingerprint: string,
  now: string,
): Plan {
  const uids = (f: (p: NoticePerson) => boolean) =>
    [...new Set(people.filter(p => p.uid && f(p)).map(p => p.uid))].sort();
  const pushUids = c.channels.includes('push') ? uids(p => p.push) : [];
  const emailUids = c.channels.includes('email') ? uids(p => !!p.email) : [];
  const inAppUids = source === 'visit' ? uids(() => true) : pushUids;
  const contacts = c.channels.includes('whatsapp')
    ? people.filter(p => p.phone).map(p => ({ uid: p.uid, name: p.name.slice(0, 100), phone: p.phone }))
    : [];
  if (people.length > 2000) throw invalid('groups', 'up to 2000 distinct recipients per operation');
  if (source === 'event' && !pushUids.length && !emailUids.length && !contacts.length)
    throw invalid('channels', 'no eligible recipients for these channels', 'אין נמענים זמינים לערוצים שנבחרו');
  return {
    source,
    sourceId: c.sourceId,
    groups: c.groups,
    channels: c.channels,
    title:
      source === 'event'
        ? 'תזכורת לאירוע'
        : c.decision?.status === 'rejected'
          ? 'עדכון על בקשת הביקור'
          : 'אישור ביקור בחווה',
    text: c.text,
    actor,
    createdAt: now,
    fingerprint,
    inAppUids,
    vendorUids: uids(p => p.role === 'vendor'),
    pushUids,
    emailUids,
    contacts,
    cursor: 0,
    total: inAppUids.length + emailUids.length + Math.ceil(pushUids.length / 200),
  };
}
export function allowsOperationalChannel(
  doc: Record<string, unknown> | undefined,
  uid: string,
  channel: 'email' | 'push',
) {
  const ids = doc?.[channel === 'push' ? 'pushUids' : 'emailUids'];
  return (doc?.source === 'visit' || doc?.source === 'event') && Array.isArray(ids) && ids.includes(uid);
}
function result(p: Plan) {
  return {
    created: p.inAppUids.length,
    queued: p.emailUids.length + Math.ceil(p.pushUids.length / 200),
    pending: p.cursor < p.total,
    drafts: whatsappDrafts(
      p.contacts.map(c => ({ ...c, email: '', push: false })),
      p.text,
    ),
  };
}
function destinationWrites(fs: Firestore, id: string, p: Plan, end: number) {
  const ops: Write[] = [];
  const link = p.source === 'visit' ? `/me/visits/${p.sourceId}` : '/me/messages';
  for (let i = p.cursor; i < end; i++) {
    if (i < p.inAppUids.length) {
      const uid = p.inAppUids[i];
      ops.push(
        fs.create(`users/${uid}/notifications`, id, {
          id,
          kind: 'event',
          title: p.title,
          sub: p.text,
          link:
            p.source === 'visit' ? link : `/${p.vendorUids?.includes(uid) ? 'vendor/events' : 'events'}/${p.sourceId}`,
          refId: p.sourceId,
          by: p.actor,
          createdAt: p.createdAt,
          readAt: null,
        }),
      );
      continue;
    }
    const pos = i - p.inAppUids.length;
    if (pos < p.emailUids.length) {
      const uid = p.emailUids[pos];
      ops.push(
        fs.create('email_outbox', `op_mail_${id}_${uid}`, {
          kind: 'broadcast',
          broadcastId: id,
          operationalId: id,
          uid,
          status: 'queued',
          createdBy: p.actor,
          createdAt: p.createdAt,
        }),
      );
      continue;
    }
    const chunk = pos - p.emailUids.length,
      jobId = `op_push_${id}_${chunk}`;
    ops.push(
      fs.create('push_jobs', jobId, {
        id: jobId,
        kind: 'event',
        operationalId: id,
        title: p.title,
        body: p.text,
        link,
        refId: p.sourceId,
        to: p.pushUids.slice(chunk * 200, (chunk + 1) * 200),
        createdBy: p.actor,
        createdAt: p.createdAt,
        sentAt: null,
        tag: id,
      }),
    );
  }
  return ops;
}
async function visitWrites(fs: Firestore, tx: string, c: Command, visit: Doc, actor: Actor, at: string) {
  const d = c.decision!,
    v = visit.data;
  const approved = d.status === 'approved';
  const allowed = approved
    ? ['new', 'approved', 'rejected', 'cancelled'].includes(String(v.status))
    : v.status === 'new' || v.status === 'approved';
  if (!allowed || v.updatedAt !== d.expectedUpdatedAt) throw new ApiError('STALE_WRITE', 'the visit changed');
  const calendarId = 'visit_' + visit.id;
  const existingCalendar = approved || v.status === 'approved' ? await fs.get('calendar', calendarId, tx) : null;
  if (existingCalendar && (existingCalendar.data.kind !== 'visit' || existingCalendar.data.refId !== visit.id))
    throw new ApiError('STALE_WRITE', 'the calendar entry belongs to a different activity');
  const match = await fs.query({ from: [{ collectionId: 'notifications' }], where: where('refId', visit.id) }, '', tx);
  const date = d.date || String((approved && v.status === 'approved' && v.approvedDate) || v.date);
  const time = d.time || String((approved && !d.date && v.status === 'approved' && v.approvedTime) || '');
  const replyChannel = c.channels.includes('email')
    ? 'app-email'
    : c.channels.includes('whatsapp')
      ? 'whatsapp'
      : 'app';
  const writes = [
    fs.patch(
      'visits',
      visit.id,
      {
        status: d.status,
        handledBy: actor,
        updatedAt: nextUpdatedAt(v.updatedAt),
        requestedDate: v.requestedDate || v.date,
        approvedDate: approved ? date : '',
        approvedTime: approved ? time : '',
        replyChannel,
        replyChannels: c.channels,
        replyText: c.text,
        ...(d.managerNote === undefined ? {} : { managerNote: d.managerNote }),
      },
      visit.updateTime,
    ),
  ];
  if (approved)
    writes.push(
      fs.set('calendar', calendarId, {
        title: `ביקור: ${v.name} · ${v.people}`,
        date,
        time,
        ownerUid: actor.uid,
        ownerName: actor.name,
        kind: 'visit',
        refId: visit.id,
        audience: existingCalendar?.data.audience === 'managers' ? 'managers' : 'all',
        createdAt: existingCalendar?.data.createdAt || at,
      }),
    );
  else if (existingCalendar) writes.push(fs.remove('calendar', calendarId, existingCalendar.updateTime));
  for (const row of match)
    if (!row.data.handled && row.data.type === 'visit')
      writes.push(
        fs.patch('notifications', row.id, { handled: true, handledBy: actor, handledAt: at }, row.updateTime),
      );
  writes.push(
    activity(fs, actor, 'visit', visit.id, d.status, `${v.name} · ${date}`, { subjectUid: String(v.uid || '') }),
  );
  return writes;
}
async function currentManager(fs: Firestore, uid: string, tx?: string): Promise<Actor> {
  const actor = await fs.get('users', uid, tx);
  if (!actor || actor.data.status !== 'active' || !['owner', 'manager'].includes(String(actor.data.role)))
    throw new ApiError('FORBIDDEN', 'an active manager is required');
  return { uid, name: String(actor.data.displayName || '') };
}
export async function executeOperationalMessage(fs: Firestore, uid: string, source: Source, c: Command) {
  const id = 'op_' + (await sha256hex(uid + '/' + c.operationId)).slice(0, 40);
  const fingerprint = await sha256hex(JSON.stringify([source, c]));
  await currentManager(fs, uid);
  let failures = 0;
  for (;;) {
    const tx = await fs.begin();
    try {
      const actor = await currentManager(fs, uid, tx);
      const record = await fs.get(notices, id, tx);
      const ops: Write[] = [];
      let plan: Plan;
      if (record) {
        plan = record.data as Plan;
        if (plan.fingerprint !== fingerprint)
          throw new ApiError('IDEMPOTENCY_CONFLICT', 'operation id already belongs to another request');
        if (plan.cursor >= plan.total) {
          await fs.rollback(tx);
          return result(plan);
        }
      } else {
        const item = await fs.get(source === 'visit' ? 'visits' : 'events', c.sourceId, tx);
        if (!item) throw new ApiError('NOT_FOUND', 'source document does not exist');
        const at = new Date().toISOString();
        let people: NoticePerson[];
        if (source === 'visit') {
          const user =
            typeof item.data.uid === 'string' && wordId.test(item.data.uid)
              ? await fs.get('users', item.data.uid, tx)
              : null;
          const person =
            user?.data.status === 'active'
              ? noticePerson(profile(user))
              : { uid: '', name: String(item.data.name || ''), phone: '', email: '', push: false };
          people = [{ ...person, phone: phoneDigits(String(item.data.phone || person.phone)) }];
          ops.push(...(await visitWrites(fs, tx, c, item, actor, at)));
        } else people = await eventPeople(fs, c.sourceId, c.groups);
        plan = makePlan(source, c, actor, people, fingerprint, at);
      }
      const end = Math.min(plan.cursor + 400, plan.total);
      ops.push(...destinationWrites(fs, id, plan, end));
      plan = { ...plan, cursor: end };
      ops.push(record ? fs.patch(notices, id, { cursor: end }, record.updateTime) : fs.create(notices, id, plan));
      await fs.commit(ops, tx);
      if (end === plan.total) return result(plan);
      failures = 0;
    } catch (e) {
      await fs.rollback(tx);
      if ((isContention(e) || isUncertain(e)) && failures < 6) {
        await backoff(failures++);
        continue;
      }
      throw e;
    }
  }
}
export async function operationalMessageRoute(req: Request, env: Env, source: Source, body: Record<string, unknown>) {
  const token = /^Bearer (\S+)$/.exec(req.headers.get('authorization') || '')?.[1];
  if (!token) throw new ApiError('UNAUTHENTICATED', 'a Firebase ID token is required');
  const { uid } = await verifyIdToken(token, env);
  return executeOperationalMessage(new Firestore(env), uid, source, operationalCommand(source, body));
}
