import { useMemo } from 'react';
import { useList, write } from '../../db';
import { demoOnly, demoDoc } from '../../demo/store';
import { emulatorMode, readyAuth } from '../../firebase';
import { FILES_API } from '../../upload';
import { nowIso } from '../../clock';
import type { Activity, Actor, EventVendorV2, Profile, Staffing, Ticket, Visit } from '../../types';
import type { V2Ctx } from '../ctx';
import {
  eventReminderPeople,
  noticePerson,
  phoneDigits,
  whatsappDrafts,
  type EventGroup,
  type MessageChannel,
  type NoticePerson,
  type VisitDecision,
} from '../../../../shared/operational-messages';

export type { MessageChannel, NoticePerson, VisitDecision };
export type ReminderGroup = 'registrants' | 'crew' | 'vendors' | 'approvedVendors';
const serverGroups = (groups: ReminderGroup[]) =>
  [...new Set(groups.map((g): EventGroup => (g === 'vendors' ? 'approvedVendors' : g)))].sort();
export function useEventReminderRecipients(ctx: V2Ctx, eventId: string, groups: ReminderGroup[]) {
  const enabled = ctx.manager && !!eventId;
  const tickets = useList<Ticket>('tickets', { where: [['eventId', '==', eventId || '_']] }, enabled);
  const staff = useList<Staffing>(`events/${eventId || '_'}/staffing`, {}, enabled);
  const vendors = useList<EventVendorV2>(`events/${eventId || '_'}/vendors`, {}, enabled);
  const applications = useList<{ id: string; ownerUid: string; status: string }>(
    `events/${eventId || '_'}/vendor_applications`,
    {},
    enabled,
  );
  const activity = useList<Activity>(
    'activity',
    { where: [['eventId', '==', eventId || '_']] },
    enabled && groups.includes('registrants'),
  );
  const people = useMemo(
    () =>
      eventReminderPeople(
        {
          profiles: [...ctx.peopleByUid.values()],
          tickets: tickets.items,
          staffing: staff.items,
          stalls: vendors.items,
          applications: applications.items,
          activity: activity.items,
        },
        serverGroups(groups),
      ),
    [ctx.peopleByUid, tickets.items, staff.items, vendors.items, applications.items, activity.items, groups],
  );
  return {
    people,
    loading: tickets.loading || staff.loading || vendors.loading || applications.loading || activity.loading,
    error: tickets.error || staff.error || vendors.error || applications.error || activity.error,
  };
}
export function visitRecipient(v: Visit, profile?: Profile | null): NoticePerson {
  const p =
    profile?.uid === v.uid && profile.status === 'active'
      ? noticePerson(profile)
      : { uid: '', name: v.name, email: '', phone: '', push: false };
  return { ...p, phone: phoneDigits(v.phone || p.phone) };
}
type Input = {
  id: string;
  source: 'event' | 'visit';
  sourceId: string;
  text: string;
  groups?: ReminderGroup[];
  channels: MessageChannel[];
  people: NoticePerson[];
  decision?: VisitDecision;
};
type Result = { drafts: ReturnType<typeof whatsappDrafts>; created: number; queued: number; pending: boolean };
export async function deliverOperationalMessage(
  actor: Actor,
  d: Input,
  applyDemoDecision?: () => Promise<unknown>,
): Promise<Result> {
  const text = d.text.trim(),
    groups = serverGroups(d.groups || []),
    channels = [...new Set(d.channels)].sort();
  if (!text || [...text].length > 240) throw new Error('יש לכתוב הודעה באורך של עד 240 תווים');
  const body = {
    operationId: d.id,
    [d.source === 'event' ? 'eventId' : 'visitId']: d.sourceId,
    text,
    groups,
    channels,
    ...(d.decision ? { decision: d.decision } : {}),
  };
  if (demoOnly()) {
    const saved = demoDoc('operational_notices/' + d.id);
    if (saved) {
      if (saved.request !== JSON.stringify(body)) throw new Error('מזהה הפעולה כבר שימש להודעה אחרת');
      return saved.receipt as Result;
    }
    if (d.source === 'event' && (!groups.length || !channels.length)) throw new Error('יש לבחור קהל וערוץ לתזכורת');
    const people = [...new Map(d.people.map(p => [p.uid || 'phone:' + p.phone, p])).values()];
    const receipt: Result = {
      drafts: channels.includes('whatsapp') ? whatsappDrafts(people, text) : [],
      created: 0,
      queued: 0,
      pending: false,
    };
    const rows: Parameters<typeof write.batch>[0] = [];
    for (const p of people.filter(p => p.uid)) {
      const push = channels.includes('push') && p.push;
      if (d.source === 'visit' || push) {
        const title = d.source === 'visit' ? 'עדכון על הביקור' : 'תזכורת לאירוע';
        const noticeId = 'op_demo_' + d.id;
        rows.push({
          op: 'set',
          col: `users/${p.uid}/notifications`,
          id: noticeId,
          data: {
            id: noticeId,
            kind: 'event',
            title,
            sub: text,
            refId: d.sourceId,
            link:
              d.source === 'visit'
                ? `/me/visits/${d.sourceId}`
                : p.role === 'vendor'
                  ? `/vendor/events/${d.sourceId}`
                  : `/events/${d.sourceId}`,
            by: actor,
            createdAt: nowIso(),
            readAt: null,
          },
        });
        receipt.created++;
      }
      if (push) receipt.queued++;
      if (channels.includes('email') && p.email) receipt.queued++;
    }
    if (applyDemoDecision) await applyDemoDecision();
    await write.batch([
      ...rows,
      { op: 'set', col: 'operational_notices', id: d.id, data: { request: JSON.stringify(body), receipt } },
    ]);
    return receipt;
  }
  const base = emulatorMode ? sessionStorage.getItem('farm-files-api') : FILES_API;
  if (!base || (emulatorMode && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)))
    throw new Error('שרת ההודעות המקומי אינו זמין');
  const user = (await readyAuth()).currentUser;
  if (!user) throw new Error('נדרשת כניסה כדי לשלוח');
  const res = await fetch(`${base}/v1/${d.source === 'event' ? 'event-reminders' : 'visit-notices'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (await user.getIdToken()) },
    body: JSON.stringify(body),
  });
  const reply = await res.json();
  if (!res.ok || !reply.ok) throw new Error(reply.error?.he || reply.error?.message || 'לא ניתן להשלים את הפעולה');
  return reply.data as Result;
}
