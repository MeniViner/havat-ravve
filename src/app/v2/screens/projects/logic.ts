// Pure helpers of the projects area (P1-P6): ordering, counts, wording. No data access here, so tests/v2-projects.mjs
// can bundle and drive them without Firebase. All "today" comes from clock.ts through format.ts.
import type { Actor, Project, ProjectStep } from '../../../types';
import { dayName, ddmm, daysFromToday, daysLeft, firstName } from '../../format';
import { todayKey } from '../../../clock';

/** Fields this area adds to Project (optional, with defaults for older documents). */
export type ProjectDoc = Project & {
  /** uids of `members`, so "שלי" is one array-contains query. Default: derived from members. */
  memberUids?: string[];
  /** When the last step was marked done (status 'done'). */
  doneAt?: string | null;
  /** Short name for back links and meta lines ("הכנות לפסטיבל"). Default: the title. */
  short?: string;
};
export type StepDoc = ProjectStep;

/** Steps in display order (n ascending; ties by creation). n may be fractional after a split. */
export function sortSteps<T extends Pick<StepDoc, 'n' | 'createdAt'>>(steps: T[]): T[] {
  return [...steps].sort((a, b) => (a.n - b.n) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

export type Progress = { total: number; done: number; free: number };
export function progressOf(steps: Pick<StepDoc, 'done' | 'assignee'>[]): Progress {
  return { total: steps.length, done: steps.filter((s) => s.done).length, free: steps.filter((s) => !s.done && !s.assignee).length };
}

/** "2 צעדים פנויים" / "צעד אחד פנוי" / "כל הצעדים פנויים" / '' when none is free. */
export function freeLabel(p: Progress): string {
  if (!p.free) return '';
  if (p.free === p.total && p.total > 1) return 'כל הצעדים פנויים';
  return p.free === 1 ? 'צעד אחד פנוי' : `${p.free} צעדים פנויים`;
}

/** "3 מתוך 7" */
export const countLabel = (p: Progress) => `${p.done} מתוך ${p.total}`;

/** The project deadline as the cards show it: "עוד 8 ימים" (date), "עד סוף דצמבר" (free text), "בלי תאריך". */
export function deadlineLabel(p: Pick<ProjectDoc, 'deadline' | 'deadlineText'>): string {
  if (p.deadline) { const d = daysFromToday(p.deadline); return d < 0 ? 'עבר התאריך' : daysLeft(p.deadline); }
  if (p.deadlineText) return `עד ${p.deadlineText}`;
  return 'בלי תאריך';
}
/** A dated deadline within two weeks (or past) is shown as a red tag on P2. */
export function deadlineUrgent(p: Pick<ProjectDoc, 'deadline'>): boolean {
  return !!p.deadline && daysFromToday(p.deadline) <= 14;
}
/** P3 hero line: "היעד: מוכנים עד שישי 27.11 · עוד 8 ימים" / "היעד: מוכנים עד סוף דצמבר" / "היעד: בלי תאריך". */
export function goalLine(p: Pick<ProjectDoc, 'deadline' | 'deadlineText' | 'status' | 'doneAt'>): string {
  if (p.status === 'done' && p.doneAt) return `הושלם ${ddmm(p.doneAt)}`;
  if (p.deadline) { const d = daysFromToday(p.deadline); return `היעד: מוכנים עד ${dayName(p.deadline)} ${ddmm(p.deadline)}${d >= 0 ? ` · ${daysLeft(p.deadline)}` : ''}`; }
  if (p.deadlineText) return `היעד: מוכנים עד ${p.deadlineText}`;
  return 'היעד: בלי תאריך';
}
/** "עד שני 23.11" */
export const dueLabel = (due: string) => (due ? `עד ${dayName(due)} ${ddmm(due)}` : '');

/** What the P5 "עד מתי" field means: a date ("27.11", "27.11.26", "27/11/2026", "2026-11-27") or free text ("סוף דצמבר").
 *  A day and month without a year is the next such date from today. */
export function parseDeadline(text: string): { deadline: string; deadlineText?: string } {
  const t = text.trim();
  if (!t) return { deadline: '' };
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { deadline: t };
  const m = t.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/);
  if (m) {
    const day = +m[1], month = +m[2];
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const today = todayKey();
      const pad = (n: number) => String(n).padStart(2, '0');
      let year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +today.slice(0, 4);
      let key = `${year}-${pad(month)}-${pad(day)}`;
      if (!m[3] && key < today) { year += 1; key = `${year}-${pad(month)}-${pad(day)}`; }
      return { deadline: key };
    }
  }
  return { deadline: '', deadlineText: t };
}
/** The text the P5 "עד מתי" field shows when editing. */
export const deadlineInput = (p: Pick<ProjectDoc, 'deadline' | 'deadlineText'>) => p.deadlineText || (p.deadline ? ddmm(p.deadline) : '');

/** Short project name for back links and meta lines: `short` when set ("הכנות לפסטיבל"), otherwise the title. */
export const shortTitle = (p: Pick<ProjectDoc, 'title' | 'short'>) => (p.short || '').trim() || p.title.trim();

/** Members in order of joining, without duplicates; members missing on older documents fall back to the creator. */
export function membersOf(p: Pick<ProjectDoc, 'members' | 'createdBy'>): Actor[] {
  const out: Actor[] = [];
  for (const a of [...(p.members || []), ...(p.members?.length ? [] : p.createdBy ? [p.createdBy] : [])]) if (a?.uid && !out.some((x) => x.uid === a.uid)) out.push(a);
  return out;
}
export const memberUidsOf = (p: Pick<ProjectDoc, 'members' | 'createdBy' | 'memberUids'>) => p.memberUids?.length ? p.memberUids : membersOf(p).map((a) => a.uid);
export const isMember = (p: Pick<ProjectDoc, 'members' | 'createdBy' | 'memberUids'>, uid: string) => memberUidsOf(p).includes(uid);

/** How one step row reads for the viewer (P3). */
export type StepState = 'done' | 'mine' | 'other' | 'free';
export function stepState(s: Pick<StepDoc, 'done' | 'assignee'>, uid: string): StepState {
  if (s.done) return 'done';
  if (!s.assignee) return 'free';
  return s.assignee.uid === uid ? 'mine' : 'other';
}
/** P3 row meta: "בני · 2.11" (done), "עד שני 23.11" (mine / free), "נועה · עד רביעי 25.11" (someone else). */
export function stepMeta(s: Pick<StepDoc, 'done' | 'assignee' | 'doneBy' | 'doneAt' | 'due'>, uid: string): string {
  const st = stepState(s, uid);
  if (st === 'done') return [s.doneBy ? firstName(s.doneBy.name) : '', s.doneAt ? ddmm(s.doneAt) : ''].filter(Boolean).join(' · ');
  if (st === 'other') return [firstName(s.assignee!.name), dueLabel(s.due)].filter(Boolean).join(' · ');
  return dueLabel(s.due);
}

/** n for a step added at the end. */
export const nextN = (steps: Pick<StepDoc, 'n'>[]) => Math.floor(Math.max(0, ...steps.map((s) => s.n))) + 1;
/** n values for `count` sub-steps placed right after `parent`, before the step that follows it. */
export function splitNs(steps: Pick<StepDoc, 'id' | 'n' | 'createdAt'>[], parentId: string, count: number): number[] {
  const sorted = sortSteps(steps);
  const i = sorted.findIndex((s) => s.id === parentId);
  if (i < 0) return Array.from({ length: count }, (_, k) => nextN(steps) + k);
  const lo = sorted[i].n, hi = i + 1 < sorted.length ? sorted[i + 1].n : lo + 1;
  return Array.from({ length: count }, (_, k) => lo + ((hi - lo) * (k + 1)) / (count + 1));
}
/** 1-based place of a step in the project ("צעד 4 מתוך 7"). */
export function stepNumber(steps: Pick<StepDoc, 'id' | 'n' | 'createdAt'>[], id: string): { n: number; total: number } {
  const sorted = sortSteps(steps);
  return { n: sorted.findIndex((s) => s.id === id) + 1, total: sorted.length };
}
/** The step before this one (P4 "אחרי"). */
export function previousStep<T extends Pick<StepDoc, 'id' | 'n' | 'createdAt'>>(steps: T[], id: string): T | null {
  const sorted = sortSteps(steps);
  const i = sorted.findIndex((s) => s.id === id);
  return i > 0 ? sorted[i - 1] : null;
}
/** The project is finished when it has steps and every one is done. */
export const allDone = (steps: Pick<StepDoc, 'done'>[]) => steps.length > 0 && steps.every((s) => s.done);

/** P2 tabs. */
export type ListTab = 'active' | 'mine' | 'done';
export function filterProjects<T extends ProjectDoc>(projects: T[], tab: ListTab, uid: string): T[] {
  const active = projects.filter((p) => p.status !== 'done');
  const list = tab === 'done' ? projects.filter((p) => p.status === 'done') : tab === 'mine' ? active.filter((p) => isMember(p, uid)) : active;
  return sortProjects(list);
}
/** Dated deadlines first (soonest first), then free-text and undated ones by creation. Done projects: latest first. */
export function sortProjects<T extends ProjectDoc>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.status === 'done' && b.status === 'done') return String(b.doneAt || b.updatedAt || '').localeCompare(String(a.doneAt || a.updatedAt || ''));
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    if (!!a.deadlineText !== !!b.deadlineText) return a.deadlineText ? -1 : 1;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}
/** The projects block above the tasks (P1): my active projects; when I am in none, the active ones. At most `max`. */
export function blockProjects<T extends ProjectDoc>(projects: T[], uid: string, max = 3): T[] {
  const mine = filterProjects(projects, 'mine', uid);
  return (mine.length ? mine : filterProjects(projects, 'active', uid)).slice(0, max);
}

/** Draft rows of the P5 form -> the steps to create / update / delete. Empty rows are dropped; an existing step whose
 *  text was cleared is deleted (unless it is done). */
export type DraftStep = { id?: string; title: string; assignee: Actor | null };
export type StepPlan = { create: { title: string; assignee: Actor | null; n: number }[]; update: { id: string; title?: string; assignee?: Actor | null; n: number }[]; remove: string[] };
export function planSteps(drafts: DraftStep[], existing: Pick<StepDoc, 'id' | 'done' | 'n'>[]): StepPlan {
  const plan: StepPlan = { create: [], update: [], remove: [] };
  let n = 0;
  for (const d of drafts) {
    const title = d.title.trim();
    const old = d.id ? existing.find((s) => s.id === d.id) : undefined;
    if (!title) { if (old && !old.done) plan.remove.push(old.id); else if (old) { n += 1; plan.update.push({ id: old.id, n }); } continue; }
    n += 1;
    if (old) plan.update.push({ id: old.id, title, assignee: d.assignee, n });
    else plan.create.push({ title, assignee: d.assignee, n });
  }
  for (const s of existing) if (!drafts.some((d) => d.id === s.id) && !plan.remove.includes(s.id) && !s.done) plan.remove.push(s.id);
  return plan;
}
