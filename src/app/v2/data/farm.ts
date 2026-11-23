// Farm area data: presence and calendar items (collection `calendar`), the "today at the farm" feed (collection `activity`),
// event prep for the team (events, tasks, staffing) and teammate cards. Everything goes through db.ts, so the same code runs on
// demo data and on Firestore, and every write is offline-first (nothing waits for the server). See docs/redesign-data/farm.md.
import { useMemo } from 'react';
import { useList, useDoc, write, newId, transact, readOnce, ConflictError } from '../../db';
import { nowIso, nowMs } from '../../clock';
import { activityOp, logActivity, taskKind } from '../../activity';
import { setTaskDone } from '../../store';
import { getDemo } from '../../demo/store';
import type { Actor, CalendarItem, FarmEvent, Profile, Project, ProjectStep, ShoppingItem, Staffing, Task } from '../../types';
import { israelIso, kindToSave, presencePlan, remindAt, timeText, type Act, type CalItem, type Hours, type TeamKind } from '../screens/farm/logic';

/** CalendarItem with the reminder stamp the Worker uses (local until types.ts gains it; see the data doc). */
export type FarmCalItem = CalendarItem & { remindAt?: string; reminderSentAt?: string | null; updatedAt?: string };

// ---------- reads ----------
/** Calendar items between two dates (inclusive). Volunteers do not see items marked "מנהלים בלבד" (a display filter: see the data doc). */
export function useCalendarRange(from: string, to: string, manager: boolean, enabled = true) {
  const r = useList<FarmCalItem>('calendar', { where: [['date', '>=', from], ['date', '<=', to]], orderBy: [['date', 'asc']] }, enabled);
  return useMemo(() => ({ ...r, items: manager ? r.items : r.items.filter((i) => i.audience !== 'managers') }), [r, manager]);
}
export const useCalItem = (id: string, enabled = true) => useDoc<FarmCalItem>(`calendar/${id || '_'}`, enabled && !!id);

/** Feed activity (team kinds only, which volunteers may read) between two instants, newest first. */
export const useFeed = (fromIso: string, toIso: string, enabled = true) =>
  useList<Act & Record<string, unknown>>('activity', { where: [['kind', 'in', ['task', 'shopping']], ['at', '>=', fromIso], ['at', '<', toIso]], orderBy: [['at', 'desc']], limit: 400 }, enabled);

/** Tasks done in a period (their place and result photo for the feed). Volunteers query only open tasks. */
export const useDoneTasks = (fromIso: string, toIso: string, manager: boolean, enabled = true) =>
  useList<Task>('tasks', { where: [...(manager ? [] : [['managersOnly', '==', false] as [string, '==', unknown]]), ['doneAt', '>=', fromIso], ['doneAt', '<=', toIso]], orderBy: [['doneAt', 'desc']], limit: 400 }, enabled);
/** Shopping rows for the feed: everything added or bought in the period. */
export function useShopSince(fromIso: string, enabled = true) {
  const added = useList<ShoppingItem>('shopping', { where: [['createdAt', '>=', fromIso]], orderBy: [['createdAt', 'desc']], limit: 300 }, enabled);
  const bought = useList<ShoppingItem>('shopping', { where: [['boughtAt', '>=', fromIso]], orderBy: [['boughtAt', 'desc']], limit: 300 }, enabled);
  return useMemo(() => new Map([...added.items, ...bought.items].map((s) => [s.id, s])), [added.items, bought.items]);
}
/** Routine instances of one day (recurring tasks materialized as templateId_date). */
export const useRoutines = (date: string, manager: boolean, enabled = true) =>
  useList<Task>('tasks', { where: [...(manager ? [] : [['managersOnly', '==', false] as [string, '==', unknown]]), ['dateKey', '==', date]] }, enabled && !!date);

export const useUpcoming = () => useList<FarmEvent>('events', { where: [['published', '==', true]], orderBy: [['start', 'asc']] }, true);
export const useFarmEvent = (id: string) => useDoc<FarmEvent>(`events/${id || '_'}`, !!id);
export const useStaffing = (eventId: string) => useList<Staffing>(`events/${eventId || '_'}/staffing`, {}, !!eventId);
/** Open prep tasks of an event (F6). */
export const usePrepTasks = (eventId: string, manager: boolean) =>
  useList<Task>('tasks', { where: [['eventId', '==', eventId], ['done', '==', false], ...(manager ? [] : [['managersOnly', '==', false] as [string, '==', unknown]])], orderBy: [['createdAt', 'asc']] }, !!eventId);

/** C5: open tasks on a person. */
export const useTasksOn = (uid: string, manager: boolean) =>
  useList<Task>('tasks', { where: [['assignee.uid', '==', uid], ['done', '==', false], ...(manager ? [] : [['managersOnly', '==', false] as [string, '==', unknown]])], orderBy: [['createdAt', 'desc']], limit: 30 }, !!uid);
/** C5: what a person finished since a moment (counts "בוצעו היום" / "החודש"). */
export const useDoneBy = (uid: string, fromIso: string, manager: boolean) =>
  useList<Act & Record<string, unknown>>('activity', { where: [['by.uid', '==', uid], manager ? ['kind', 'in', ['task', 'task_private']] : ['kind', '==', 'task'], ['action', '==', 'done'], ['at', '>=', fromIso]], orderBy: [['at', 'desc']], limit: 300 }, !!uid);
/** C5 (managers only, projects are managers-only): active projects; their steps are read per project. */
export const useActiveProjects = (enabled: boolean) => useList<Project>('projects', { where: [['status', '==', 'active']] }, enabled);
export const useStepsOn = (projectId: string, uid: string, enabled: boolean) =>
  useList<ProjectStep>(`projects/${projectId}/steps`, { where: [['assignee.uid', '==', uid], ['done', '==', false]] }, enabled && !!projectId && !!uid);

// ---------- writes ----------
/** F4: one entry per chosen day for `who` (the signed-in person, or the person a manager picked), as one batch (works offline). */
export async function savePresence(actor: Actor, who: Actor, days: string[], items: CalItem[], hours: Hours, note: string) {
  const ops = presencePlan(days, items, who, hours, note, () => newId('calendar'), nowIso());
  await write.batch(ops.flatMap((o) => [
    { op: o.op, col: 'calendar', id: o.id, data: o.data },
    activityOp(actor, 'calendar', o.id, o.op === 'set' ? 'created' : 'edited', `נוכחות · ${o.data.date}`, { subjectUid: who.uid }),
  ]));
  return ops.length;
}
export const removePresence = (actor: Actor, id: string) => write.batch([
  { op: 'remove', col: 'calendar', id }, activityOp(actor, 'calendar', id, 'deleted', 'נוכחות'),
]);

export type CalDraft = { title: string; date: string; from: string; to: string; audience: 'all' | 'managers'; participants: string[]; reminder: boolean; kind?: TeamKind };
/** C11: add or edit a calendar item (managers). The old `time` text is kept next to from/to for old screens and the Worker.
 *  `kind` (meeting / planning / other, as the old calendar) is written on a new item, and on an edit only when it changed. */
export async function saveCalItem(actor: Actor, d: CalDraft, existing?: FarmCalItem | null) {
  const hours = { from: d.from, to: d.to };
  const at = d.reminder ? remindAt(d.date, d.from) : '';
  const fields: Record<string, unknown> = {
    title: d.title.trim().slice(0, 200), date: d.date, time: timeText(hours), from: d.from, to: d.to,
    audience: d.audience, participants: d.participants, reminder: d.reminder ? '60' : '', remindAt: at, reminderSentAt: null,
  };
  const kind = kindToSave(d.kind, existing ? existing.kind : undefined);
  const id = existing?.id ?? newId('calendar');
  const record = existing ? (kind ? { ...fields, kind } : fields)
    : { ...fields, kind: kind || 'manual', ownerUid: actor.uid, ownerName: actor.name, refId: '', createdAt: nowIso() };
  await write.batch([
    { op: existing ? 'update' : 'set', col: 'calendar', id, data: record },
    activityOp(actor, d.audience === 'managers' ? 'calendar_private' : 'calendar', id, existing ? 'edited' : 'created', 'פריט ביומן'),
  ]);
  return id;
}
export const deleteCalItem = (actor: Actor, item: FarmCalItem) => write.batch([
  { op: 'remove', col: 'calendar', id: item.id },
  activityOp(actor, item.audience === 'managers' ? 'calendar_private' : 'calendar', item.id, 'deleted', 'פריט ביומן'),
]);

/** F6 "לקחת": take a prep task only if it is still free (X1 on conflict). */
export async function takeTask(actor: Actor, task: Task) {
  await transact(async (tx) => {
    const cur = await tx.get<Task>('tasks', task.id);
    if (!cur || cur.done || (cur.assignee && cur.assignee.uid !== actor.uid)) throw new ConflictError();
    const now = nowIso();
    tx.update('tasks', task.id, { assignee: { uid: actor.uid, name: actor.name }, updatedAt: now }); // only keys the task rules let a volunteer change
  });
  logActivity(actor, taskKind(task), task.id, 'assigned', `${task.title.slice(0, 60)} ← ${actor.name}`, { subjectUid: actor.uid, eventId: task.eventId || '' });
}
export const markTaskDone = (actor: Actor, task: Task, done: boolean) => setTaskDone(actor, task, done);

// ---------- F6 offline readiness (per device) ----------
const OFFLINE_KEY = (eventId: string) => `farm-offline-${eventId}`;
/** When this phone last downloaded the event's lists. Demo: the designed 07:40 of the scenario day unless refreshed. */
export function offlineStamp(eventId: string, today: string): string {
  try { const v = localStorage.getItem(OFFLINE_KEY(eventId)); if (v) return v; } catch { /* private mode */ }
  return getDemo().on ? israelIso(today, '07:40') : '';
}
/** "רענון": reads the gate and stall lists from the server once, so the local cache can work without reception on the day. */
export async function refreshOffline(eventId: string, manager: boolean) {
  await Promise.all([
    readOnce('tickets', { where: [['eventId', '==', eventId]] }),
    readOnce(`events/${eventId}/products`, {}),
    readOnce(`events/${eventId}/staffing`, {}),
    // volunteers may only query tasks that are not managers-only (the rules check the query, not each result)
    readOnce('tasks', { where: [['eventId', '==', eventId], ...(manager ? [] : [['managersOnly', '==', false] as [string, '==', unknown]])] }),
  ]);
  const at = new Date(nowMs()).toISOString();
  try { localStorage.setItem(OFFLINE_KEY(eventId), at); } catch { /* private mode: the stamp is only a hint */ }
  return at;
}

/** The person behind a uid: the team list first, then the people directory, then the actor name. */
export const personOf = (peopleByUid: Map<string, Profile>, uid: string) => peopleByUid.get(uid) || null;
