// Data of the projects area (P1-P6): projects/{pid} and projects/{pid}/steps/{sid}. Managers and owners only.
// Everything goes through db.ts (demo store or Firestore). Take / release / done go through transact (X1 on conflict).
// Writes never wait for the server (offline-first). Pure wording and ordering live in screens/projects/logic.ts.
import { useMemo } from 'react';
import { useList, useDoc, write, newId, transact, push, ConflictError } from '../../db';
import { nowIso } from '../../clock';
import { activityOp } from '../../activity';
import { notify } from './notify';
import type { Actor } from '../../types';
import type { TeamCtx } from '../../ctx';
import {
  sortSteps, stepNumber, shortTitle, nextN, splitNs, planSteps, parseDeadline, allDone,
  type ProjectDoc, type StepDoc, type DraftStep,
} from '../screens/projects/logic';

export type { ProjectDoc, StepDoc, DraftStep };
const PROJECTS = 'projects';
export const stepsPath = (pid: string) => `${PROJECTS}/${pid}/steps`;
export const projectLink = (pid: string) => `/projects/${pid}`;
export const stepLink = (pid: string, sid: string) => `/projects/${pid}/steps/${sid}`;

// ---------- reads ----------
/** Every project (the collection is small: a handful active, a few dozen done). Managers only: staff must not even ask. */
export function useProjects(enabled: boolean) {
  return useList<ProjectDoc>(PROJECTS, {}, enabled);
}
export function useProject(pid: string, enabled = true) {
  return useDoc<ProjectDoc>(`${PROJECTS}/${pid}`, enabled && !!pid);
}
/** The steps of one project in display order. */
export function useSteps(pid: string, enabled = true) {
  const r = useList<StepDoc>(stepsPath(pid || '_'), {}, enabled && !!pid);
  return useMemo(() => ({ ...r, items: sortSteps(r.items) }), [r]);
}
export function useStep(pid: string, sid: string, enabled = true) {
  return useDoc<StepDoc>(`${stepsPath(pid)}/${sid}`, enabled && !!pid && !!sid);
}

/** A step of mine with its project, for the tasks root (P1 next-up, P6 "עליך"). */
export type MyStep = { step: StepDoc; project: ProjectDoc; n: number; total: number; short: string };
const SLOTS = 10;
/** Steps assigned to me or done by me, across active projects (open ones first, by due date). Managers only.
 *  Hooks cannot loop over a changing list, so this listens to a fixed number of project slots (the active few). */
export function useMySteps(ctx: Pick<TeamCtx, 'manager' | 'user'>): { items: MyStep[]; loading: boolean } {
  const projects = useProjects(ctx.manager);
  const active = useMemo(() => projects.items.filter((p) => p.status !== 'done').sort((a, b) => a.id.localeCompare(b.id)).slice(0, SLOTS), [projects.items]);
  const lists = Array.from({ length: SLOTS }, (_, i) => {
    const pid = active[i]?.id || '';
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed count of calls, always in the same order
    return useList<StepDoc>(stepsPath(pid || '_'), {}, ctx.manager && !!pid);
  });
  const uid = ctx.user.uid;
  const loading = projects.loading || lists.some((l) => l.loading);
  // one dependency per slot: the array keeps its length whatever the number of steps (React warns when it changes)
  const key = lists.map((l) => l.items);
  const items = useMemo(() => {
    const out: MyStep[] = [];
    active.forEach((project, i) => {
      const steps = sortSteps(lists[i].items);
      for (const step of steps) {
        if (step.assignee?.uid !== uid && step.doneBy?.uid !== uid) continue;
        const { n, total } = stepNumber(steps, step.id);
        out.push({ step, project, n, total, short: shortTitle(project) });
      }
    });
    return out.sort((a, b) => (Number(a.step.done) - Number(b.step.done)) || (a.step.due || '9').localeCompare(b.step.due || '9') || a.n - b.n);
  }, [active, uid, ...key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, loading };
}

// ---------- writes ----------
type Who = Pick<TeamCtx, 'actor'>;
const memberPatch = (a: Actor) => ({ members: push(a), memberUids: push(a.uid) });

/** P5 "יצירת הפרויקט": the project and its steps in one batch; people given a step get a notification. Returns the new id. */
export async function createProject(ctx: Who, form: { title: string; deadline: string; steps: DraftStep[]; eventId?:string }): Promise<string> {
  const at = nowIso(); const me = ctx.actor;
  const pid = newId(PROJECTS);
  const plan = planSteps(form.steps, []);
  const members: Actor[] = [me];
  for (const s of plan.create) if (s.assignee && !members.some((m) => m.uid === s.assignee!.uid)) members.push(s.assignee);
  const project: ProjectDoc = {
    id: pid, ...(form.eventId ? {eventId:form.eventId} : {}), title: form.title.trim(), goal: form.title.trim(), ...parseDeadline(form.deadline),
    members, memberUids: members.map((m) => m.uid), status: 'active', createdBy: me, createdAt: at, updatedAt: at, doneAt: null,
  } as ProjectDoc;
  if (!project.deadlineText) delete project.deadlineText;
  const col = stepsPath(pid);
  const created = plan.create.map((s) => ({ ...s, id: newId(col) }));
  await write.batch([
    { op: 'set', col: PROJECTS, id: pid, data: project as unknown as Record<string, unknown> },
    activityOp(me, 'project', pid, 'created', 'פרויקט'),
    ...created.map((s) => ({ op: 'set' as const, col, id: s.id, data: newStep(pid, s.id, s.n, s.title, s.assignee, me, at) })),
  ]);
  for (const s of created) if (s.assignee) void notifyAssigned(me, project, s.id, s.title, s.n, created.length, s.assignee.uid);
  return pid;
}
function newStep(pid: string, id: string, n: number, title: string, assignee: Actor | null, me: Actor, at: string, extra: Partial<StepDoc> = {}): Record<string, unknown> {
  const s: StepDoc = { id, projectId: pid, n, title, assignee, due: '', note: '', done: false, doneBy: null, doneAt: null, parentId: null, updates: [], createdBy: me, createdAt: at, updatedAt: at, ...extra };
  return s as unknown as Record<string, unknown>;
}
const notifyAssigned = (by: Actor, p: Pick<ProjectDoc, 'id' | 'title'>, sid: string, title: string, n: number, total: number, uid: string) =>
  notify([uid], { kind: 'task', title: 'צעד חדש עליך', sub: `${title} · ${shortTitle(p)}, צעד ${n} מתוך ${total}`, link: stepLink(p.id, sid), refId: sid, by }).catch(() => {});

/** P5 in edit mode. Assignee changes are checked against the server copy: if someone took or released the step since the
 *  form opened, nothing is saved and ConflictError is thrown (X1). Cleared rows delete their (open) step. */
export async function saveProject(ctx: Who, project: ProjectDoc, loaded: StepDoc[], form: { title: string; deadline: string; steps: DraftStep[] }) {
  const at = nowIso(); const me = ctx.actor;
  const plan = planSteps(form.steps, loaded);
  const col = stepsPath(project.id);
  const dl = parseDeadline(form.deadline);
  const created = plan.create.map((s) => ({ ...s, id: newId(col) }));
  const newlyAssigned = await transact(async (tx) => {
    const assigned: { id: string; title: string; n: number; uid: string }[] = [];
    const joiners: Actor[] = [];
    for (const id of plan.remove) {
      const current = await tx.get<StepDoc>(col, id);
      if (!current || current.done) throw new ConflictError();
      tx.remove(col, id);
    }
    for (const u of plan.update) {
      const was = loaded.find((s) => s.id === u.id)!;
      if (u.assignee === undefined || (u.assignee?.uid || '') === (was.assignee?.uid || '')) continue;
      const cur = await tx.get<StepDoc>(col, u.id);
      if (!cur || (cur.assignee?.uid || '') !== (was.assignee?.uid || '')) throw new ConflictError();
    }
    for (const u of plan.update) {
      const was = loaded.find((s) => s.id === u.id)!;
      const patch: Record<string, unknown> = { n: u.n, updatedAt: at };
      if (u.title !== undefined) patch.title = u.title;
      if (u.assignee !== undefined && (u.assignee?.uid || '') !== (was.assignee?.uid || '')) {
        patch.assignee = u.assignee;
        if (u.assignee) { assigned.push({ id: u.id, title: u.title || was.title, n: u.n, uid: u.assignee.uid }); joiners.push(u.assignee); }
      }
      tx.update(col, u.id, patch);
    }
    for (const s of created) {
      tx.set(col, s.id, newStep(project.id, s.id, s.n, s.title, s.assignee, me, at));
      if (s.assignee) { assigned.push({ id: s.id, title: s.title, n: s.n, uid: s.assignee.uid }); joiners.push(s.assignee); }
    }
    const known = new Set(project.memberUids || project.members.map((m) => m.uid));
    const fresh = joiners.filter((a, i) => !known.has(a.uid) && joiners.findIndex((b) => b.uid === a.uid) === i);
    tx.update(PROJECTS, project.id, {
      title: form.title.trim(), goal: form.title.trim(), deadline: dl.deadline, deadlineText: dl.deadlineText || '', updatedAt: at,
      ...(fresh.length ? { members: push(...fresh), memberUids: push(...fresh.map((a) => a.uid)) } : {}),
    });
    const log = activityOp(me, 'project', project.id, 'edited', 'פרויקט');
    tx.set(log.col, log.id, log.data);
    return assigned;
  });
  const total = plan.update.length + created.length;
  for (const a of newlyAssigned) void notifyAssigned(me, project, a.id, a.title, a.n, total, a.uid);
}

/** The owner deletes a whole project: every step (done ones too, which only the owner may delete) and the project, in one batch. */
export async function deleteProject(actor: Actor, project: ProjectDoc, steps: Pick<StepDoc, 'id'>[]) {
  const col = stepsPath(project.id);
  await write.batch([
    ...steps.map((s) => ({ op: 'remove' as const, col, id: s.id })),
    { op: 'remove', col: PROJECTS, id: project.id },
    activityOp(actor, 'project', project.id, 'deleted', 'פרויקט'),
  ]);
}

/** "לקחת": only if the step is still free and open. */
export async function takeStep(ctx: Who, pid: string, sid: string) {
  const me = ctx.actor; const at = nowIso();
  await transact(async (tx) => {
    const s = await tx.get<StepDoc>(stepsPath(pid), sid);
    if (!s || s.done || (s.assignee && s.assignee.uid !== me.uid)) throw new ConflictError();
    tx.update(stepsPath(pid), sid, { assignee: me, updatedAt: at });
    tx.update(PROJECTS, pid, { ...memberPatch(me), updatedAt: at });
    const log = activityOp(me, 'project', pid, 'assigned', 'צעד בפרויקט');
    tx.set(log.col, log.id, log.data);
  });
}
/** "לשחרר": only my own open step. */
export async function releaseStep(ctx: Who, pid: string, sid: string) {
  const me = ctx.actor; const at = nowIso();
  await transact(async (tx) => {
    const s = await tx.get<StepDoc>(stepsPath(pid), sid);
    if (!s || s.done || s.assignee?.uid !== me.uid) throw new ConflictError();
    tx.update(stepsPath(pid), sid, { assignee: null, updatedAt: at });
    const log = activityOp(me, 'project', pid, 'released', 'צעד בפרויקט');
    tx.set(log.col, log.id, log.data);
  });
}
/** "בוצע". `steps` is the list on screen: when this was the last open step, the project is marked done too. */
export async function completeStep(ctx: Who, pid: string, sid: string, steps: Pick<StepDoc, 'id' | 'done'>[]) {
  const me = ctx.actor; const at = nowIso();
  const last = allDone(steps.map((s) => (s.id === sid ? { done: true } : s)));
  await transact(async (tx) => {
    const s = await tx.get<StepDoc>(stepsPath(pid), sid);
    if (!s || s.done) throw new ConflictError();
    tx.update(stepsPath(pid), sid, { done: true, doneBy: me, doneAt: at, updatedAt: at });
    tx.update(PROJECTS, pid, { ...memberPatch(me), updatedAt: at, ...(last ? { status: 'done', doneAt: at } : {}) });
    const log = activityOp(me, 'project', pid, 'done', 'צעד בפרויקט');
    tx.set(log.col, log.id, log.data);
  });
}
/** Undo of "בוצע" (toast "ביטול", P4 "להחזיר לרשימה"). Reopens the project if it had been closed by this step. */
export async function reopenStep(ctx: Who, pid: string, sid: string) {
  const at = nowIso();
  await write.batch([
    { op: 'update', col: stepsPath(pid), id: sid, data: { done: false, doneBy: null, doneAt: null, updatedAt: at } },
    { op: 'update', col: PROJECTS, id: pid, data: { status: 'active', doneAt: null, updatedAt: at } },
    activityOp(ctx.actor, 'project', pid, 'undone', 'צעד בפרויקט'),
  ]);
}
/** P4 "שליחה": a short update in the step's thread; the project's selected members get an in-app notification (no push). */
export async function postUpdate(ctx: Who, project: ProjectDoc, step: StepDoc, text: string) {
  const t = text.trim().slice(0, 500); if (!t) return;
  const at = nowIso();
  await write.batch([
    { op: 'update', col: stepsPath(project.id), id: step.id, data: { updates: push({ by: ctx.actor, at, text: t }), updatedAt: at } },
    activityOp(ctx.actor, 'project', project.id, 'edited', 'עדכון לצעד בפרויקט'),
  ]);
  const to = [...(project.memberUids || project.members.map((m) => m.uid)), step.assignee?.uid || ''];
  void notify(to, { kind: 'task', title: `עדכון ב${shortTitle(project)}`, sub: `${step.title}: ${t}`.slice(0, 140), link: stepLink(project.id, step.id), refId: step.id, by: ctx.actor, push: false }).catch(() => {});
}
/** P4 "לפצל לצעדים": sub-steps placed right after the step, with its assignee and due date. */
export async function splitStep(ctx: Who, pid: string, steps: StepDoc[], parent: StepDoc, titles: string[]) {
  const list = titles.map((t) => t.trim()).filter(Boolean); if (!list.length) return;
  const at = nowIso(); const col = stepsPath(pid);
  const ns = splitNs(steps, parent.id, list.length);
  const created = list.map((title, i) => {
    const id = newId(col);
    return { op: 'set' as const, col, id, data: newStep(pid, id, ns[i], title, parent.assignee, ctx.actor, at, { due: parent.due, parentId: parent.id }) };
  });
  await write.batch([
    ...created, { op: 'update', col: PROJECTS, id: pid, data: { updatedAt: at } },
    activityOp(ctx.actor, 'project', pid, 'edited', 'צעד פוצל לצעדים'),
  ]);
}
/** P4 "עריכה": the step's own text, due date and note. */
export async function updateStep(ctx: Who, pid: string, sid: string, patch: { title: string; due: string; note: string }) {
  await write.batch([
    { op: 'update', col: stepsPath(pid), id: sid, data: { title: patch.title.trim(), due: patch.due, note: patch.note.trim().slice(0, 1000), updatedAt: nowIso() } },
    activityOp(ctx.actor, 'project', pid, 'edited', 'צעד בפרויקט'),
  ]);
}
/** One more step at the end (used by P5 edit through saveProject; exported for the tasks area). */
export async function addStep(ctx: Who, pid: string, steps: Pick<StepDoc, 'n'>[], title: string, assignee: Actor | null = null) {
  const at = nowIso(); const col = stepsPath(pid); const id = newId(col);
  await write.batch([
    { op: 'set', col, id, data: newStep(pid, id, nextN(steps), title.trim(), assignee, ctx.actor, at) },
    activityOp(ctx.actor, 'project', pid, 'created', 'צעד בפרויקט'),
  ]);
  return id;
}
