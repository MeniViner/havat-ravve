// Manager projects (P1-P6): projects/{pid} and projects/{pid}/steps/{sid}, managers and owners only. Each action writes what its
// function in src/app/v2/data/projects.ts writes (pure helpers ported from src/app/v2/screens/projects/logic.ts), in one
// transaction with the idempotency record and manager-only activity. People given a step are notified.
import { ApiError, invalid } from '../http';
import type { Param } from '../catalog';
import type { Doc, Firestore, Write } from '../firestore';
import { type Person, type Ref, IF_UPDATED_AT, forbidden, fresh, isManager, isOwner, member, mustGet, nowIso, project, todayIL } from '../core';
import { type Ctx, date, def, req, str } from '../writes';
import { RESOURCES, type ResourceDef } from '../resources';
import { notifyWrites } from '../notify';
import { autoId } from '../util';

const P = 'projects';
const stepsCol = (pid: string) => `${P}/${pid}/steps`;
const stepLink = (pid: string, sid: string) => `/projects/${pid}/steps/${sid}`;
type Step = Record<string, unknown> & { id: string; n: number; title: string; done: boolean; assignee: Person | null; createdAt?: string };

// ---------- logic.ts ----------
const sortSteps = <T extends { n: number; createdAt?: unknown }>(steps: T[]) => [...steps].sort((a, b) => (a.n - b.n) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
const nextN = (steps: { n: number }[]) => Math.floor(Math.max(0, ...steps.map((s) => s.n))) + 1;
function splitNs(steps: Step[], parentId: string, count: number): number[] {
  const sorted = sortSteps(steps);
  const i = sorted.findIndex((s) => s.id === parentId);
  if (i < 0) return Array.from({ length: count }, (_, k) => nextN(steps) + k);
  const lo = sorted[i].n, hi = i + 1 < sorted.length ? sorted[i + 1].n : lo + 1;
  return Array.from({ length: count }, (_, k) => lo + ((hi - lo) * (k + 1)) / (count + 1));
}
const shortTitle = (p: Record<string, unknown>) => String(p.short || '').trim() || String(p.title || '').trim();
/** parseDeadline(): a date ("27.11", "27.11.26", "2026-11-27"; without a year the next such date) or free text ("סוף דצמבר"). */
function parseDeadline(text: string): { deadline: string; deadlineText?: string } {
  const t = text.trim();
  if (!t) return { deadline: '' };
  if (/^(\d{4})-(\d{2})-(\d{2})$/.test(t)) return { deadline: t };
  const m = t.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/);
  if (m) {
    const day = +m[1], month = +m[2];
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const today = todayIL();
      const pad = (n: number) => String(n).padStart(2, '0');
      let year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +today.slice(0, 4);
      let key = `${year}-${pad(month)}-${pad(day)}`;
      if (!m[3] && key < today) { year += 1; key = `${year}-${pad(month)}-${pad(day)}`; }
      return { deadline: key };
    }
  }
  return { deadline: '', deadlineText: t };
}
type Draft = { id?: string; title: string; assignee?: Person | null };
type Plan = { create: { title: string; assignee: Person | null; n: number }[]; update: { id: string; title?: string; assignee?: Person | null; n: number }[]; remove: string[] };
/** planSteps(): the form's rows -> steps to create / update / delete. A cleared or missing open step is deleted. */
function planSteps(drafts: Draft[], existing: Step[]): Plan {
  const plan: Plan = { create: [], update: [], remove: [] };
  let n = 0;
  for (const d of drafts) {
    const title = d.title.trim();
    const old = d.id ? existing.find((s) => s.id === d.id) : undefined;
    if (!title) { if (old && !old.done) plan.remove.push(old.id); else if (old) { n += 1; plan.update.push({ id: old.id, n }); } continue; }
    n += 1;
    if (old) plan.update.push({ id: old.id, title, assignee: d.assignee, n });
    else plan.create.push({ title, assignee: d.assignee ?? null, n });
  }
  for (const s of existing) if (!drafts.some((d) => d.id === s.id) && !plan.remove.includes(s.id) && !s.done) plan.remove.push(s.id);
  return plan;
}

// ---------- data ----------
async function stepsOf(fs: Firestore, pid: string): Promise<Doc[]> {
  return fs.query({ from: [{ collectionId: 'steps' }], limit: 500 }, `${P}/${pid}`);
}
const asStep = (d: Doc): Step => ({ ...(d.data as Record<string, unknown>), id: d.id, n: Number(d.data.n) || 0, title: String(d.data.title || ''), done: !!d.data.done, assignee: (d.data.assignee as Person | null) || null });
function newStep(pid: string, id: string, n: number, title: string, assignee: Person | null, me: Person, at: string, extra: Record<string, unknown> = {}) {
  return { id, projectId: pid, n, title, assignee, due: '', note: '', done: false, doneBy: null, doneAt: null, parentId: null, updates: [], createdBy: me, createdAt: at, updatedAt: at, ...extra };
}
const notifyAssigned = (fs: Firestore, by: Person, p: Record<string, unknown> & { id: string }, sid: string, title: string, n: number, total: number, uid: string) =>
  notifyWrites(fs, [uid], { kind: 'task', title: 'צעד חדש עליך', sub: `${title} · ${shortTitle(p)}, צעד ${n} מתוך ${total}`, link: stepLink(p.id, sid), refId: sid, by });
const memberUidsOf = (p: Record<string, unknown>) => ((p.memberUids as string[] | undefined)?.length ? (p.memberUids as string[]) : ((p.members as Person[] | undefined) || []).map((m) => m.uid));
/** push(...) on members / memberUids (arrayUnion), computed on the copy read in the transaction. */
function withMembers(p: Record<string, unknown>, people: Person[]) {
  const members = [...(((p.members as Person[]) || []))];
  const uids = [...((p.memberUids as string[]) || [])];
  for (const a of people) {
    if (!members.some((m) => m.uid === a.uid && m.name === a.name)) members.push(a);
    if (!uids.includes(a.uid)) uids.push(a.uid);
  }
  return { members, memberUids: uids };
}

/** The steps the form sends: a JSON array of {id?, title, assignee?} (assignee: uid, null = free, absent = keep). */
async function parseDrafts(c: Ctx, raw: string): Promise<Draft[]> {
  let list: unknown;
  try { list = JSON.parse(raw); } catch { throw invalid('steps', 'steps must be a JSON array'); }
  if (!Array.isArray(list) || list.length > 50) throw invalid('steps', 'steps must be a JSON array of at most 50 steps');
  const people = new Map<string, Person>();
  const out: Draft[] = [];
  for (const [i, x] of list.entries()) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw invalid('steps', `step ${i + 1} must be an object`);
    const o = x as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!['id', 'title', 'assignee'].includes(k)) throw invalid('steps', `step ${i + 1}: unknown field "${k}"`);
    if (typeof o.title !== 'string' || o.title.trim().length > 200) throw invalid('steps', `step ${i + 1}: title must be a string of up to 200 characters`);
    if (o.id !== undefined && (typeof o.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(o.id))) throw invalid('steps', `step ${i + 1}: id is not valid`);
    const d: Draft = { title: o.title.normalize('NFC').trim(), ...(o.id ? { id: o.id as string } : {}) };
    if (o.assignee === null) d.assignee = null;
    else if (o.assignee !== undefined) {
      if (typeof o.assignee !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(o.assignee)) throw invalid('steps', `step ${i + 1}: assignee must be a uid or null`);
      if (!people.has(o.assignee)) people.set(o.assignee, await member(c.fs, o.assignee, 'steps', c.tx));
      d.assignee = people.get(o.assignee)!;
    }
    out.push(d);
  }
  return out;
}

const STEPS_HE = 'הצעדים לפי הסדר, JSON: [{"id":"<קיים, מתוך projects.get>","title":"...","assignee":"<uid>"|null}]. בלי id = צעד חדש; assignee null = פנוי; בלי assignee = בלי שינוי';
async function projectFor(c: Ctx, pid: string) { return mustGet(c.fs, P, pid, c.tx, 'project'); }
async function stepFor(c: Ctx, pid: string, sid: string) { return mustGet(c.fs, stepsCol(pid), sid, c.tx, 'step'); }
const conflict = (message: string, details: Record<string, unknown> = {}) => new ApiError('STALE_WRITE', message, details);
const MGR_NOTE = 'Managers and owners edit projects. Staff can read projects assigned to an event. Activity entries are visible to managers and owners.';
const STEPS_NOTE = 'steps is a string that holds a JSON array (send the array serialized, not as an array): [{"id":"<existing id>","title":"...","assignee":"<uid>"|null}]. No id = a new step; assignee null = free; no assignee key = unchanged.';

// createProject()
def('projects.create', 'projects:write', 'יצירת פרויקט עם צעדים (מי שמקבל צעד מקבל התראה)', {
  eventId: { type: 'id', he: 'קישור לאירוע' }, title: str(120, 'לאן רוצים להגיע', true, 1), deadline: str(60, 'עד מתי: תאריך (27.11, 2026-11-27) או טקסט חופשי ("סוף דצמבר")'), steps: str(12000, STEPS_HE),
}, async (c) => {
  const at = nowIso(); const me = c.me;
  const pid = autoId();
  if (c.input.eventId) await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  const plan = planSteps(c.input.steps ? await parseDrafts(c, c.input.steps) : [], []);
  const members: Person[] = [me];
  for (const s of plan.create) if (s.assignee && !members.some((m) => m.uid === s.assignee!.uid)) members.push(s.assignee);
  const dl = parseDeadline(c.input.deadline || '');
  const doc: Record<string, unknown> = {
    id: pid, ...(c.input.eventId ? { eventId: c.input.eventId } : {}), title: c.input.title, goal: c.input.title, deadline: dl.deadline, ...(dl.deadlineText ? { deadlineText: dl.deadlineText } : {}),
    members, memberUids: members.map((m) => m.uid), status: 'active', createdBy: me, createdAt: at, updatedAt: at, doneAt: null,
  };
  const col = stepsCol(pid);
  const created = plan.create.map((s) => ({ ...s, id: autoId() }));
  const writes: Write[] = [c.fs.create(P, pid, doc), ...created.map((s) => c.fs.create(col, s.id, newStep(pid, s.id, s.n, s.title, s.assignee, me, at)))];
  for (const s of created) if (s.assignee) writes.push(...notifyAssigned(c.fs, me, doc as Record<string, unknown> & { id: string }, s.id, s.title, s.n, created.length, s.assignee.uid));
  return { status: 201, writes, refs: [{ col: P, id: pid, expected: { title: doc.title, status: 'active' } }], data: { projectId: pid, stepIds: created.map((s) => s.id) } };
}, [MGR_NOTE, STEPS_NOTE]);

// saveProject()
def('projects.update', 'projects:write', 'עריכת פרויקט: שם, יעד, והצעדים (הוספה, שינוי, מחיקה של צעד פתוח שהוסר)', {
  ifUpdatedAt: IF_UPDATED_AT as Param, projectId: req(), eventId: str(80, 'מזהה אירוע; מחרוזת ריקה לניתוק'), title: str(120, 'לאן רוצים להגיע', false, 1), deadline: str(60, 'עד מתי (ריק מסיר)'), steps: str(12000, STEPS_HE),
}, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  fresh(p, c.input.ifUpdatedAt);
  const at = nowIso(); const me = c.me;
  const col = stepsCol(p.id);
  const loadedDocs = c.input.steps !== null && c.input.steps !== undefined ? await stepsOf(c.fs, p.id) : [];
  const loaded = loadedDocs.map(asStep);
  const plan = c.input.steps !== null && c.input.steps !== undefined ? planSteps(await parseDrafts(c, c.input.steps), loaded) : { create: [], update: [], remove: [] } as Plan;
  const writes: Write[] = [];
  const newly: { id: string; title: string; n: number; uid: string }[] = [];
  const joiners: Person[] = [];
  for (const u of plan.update) {
    const was = loaded.find((s) => s.id === u.id)!;
    const patch: Record<string, unknown> = { n: u.n, updatedAt: at };
    if (u.title !== undefined) patch.title = u.title;
    if (u.assignee !== undefined && (u.assignee?.uid || '') !== (was.assignee?.uid || '')) {
      patch.assignee = u.assignee;
      if (u.assignee) { newly.push({ id: u.id, title: u.title || was.title, n: u.n, uid: u.assignee.uid }); joiners.push(u.assignee); }
    }
    // the step's updateTime as read: a take or release meanwhile fails the commit, which is retried on fresh data
    writes.push(c.fs.patch(col, u.id, patch, loadedDocs.find((d) => d.id === u.id)!.updateTime));
  }
  const created = plan.create.map((s) => ({ ...s, id: autoId() }));
  for (const s of created) {
    writes.push(c.fs.create(col, s.id, newStep(p.id, s.id, s.n, s.title, s.assignee, me, at)));
    if (s.assignee) { newly.push({ id: s.id, title: s.title, n: s.n, uid: s.assignee.uid }); joiners.push(s.assignee); }
  }
  for (const id of plan.remove) writes.push(c.fs.remove(col, id, loadedDocs.find((d) => d.id === id)!.updateTime));
  const known = new Set(memberUidsOf(p.data));
  const fresh_ = joiners.filter((a, i) => !known.has(a.uid) && joiners.findIndex((b) => b.uid === a.uid) === i);
  const title = c.input.title ?? String(p.data.title);
  const dl = c.input.deadline !== null && c.input.deadline !== undefined ? parseDeadline(c.input.deadline) : { deadline: String(p.data.deadline || ''), deadlineText: String(p.data.deadlineText || '') };
  if (c.input.eventId) {
    if (!/^[\w-]{1,80}$/.test(c.input.eventId)) throw invalid('eventId', 'invalid event id');
    await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  }
  const ppatch: Record<string, unknown> = { ...(c.input.eventId != null ? { eventId: c.input.eventId } : {}), title, goal: title, deadline: dl.deadline, deadlineText: dl.deadlineText || '', updatedAt: at, ...(fresh_.length ? withMembers(p.data, fresh_) : {}) };
  writes.push(c.fs.patch(P, p.id, ppatch, p.updateTime));
  const total = plan.update.length + created.length;
  const pd = { ...p.data, title, id: p.id };
  for (const a of newly) writes.push(...notifyAssigned(c.fs, me, pd, a.id, a.title, a.n, total, a.uid));
  return {
    writes, refs: [{ col: P, id: p.id, expected: { title } }],
    data: { createdStepIds: created.map((s) => s.id), updatedStepIds: plan.update.map((u) => u.id), removedStepIds: plan.remove },
  };
}, [MGR_NOTE, 'Without "steps" only the title and deadline change. With "steps", send the whole ordered list as in the edit form: an open step left out (or with an empty title) is DELETED, so read projects.get first. Destructive for those steps: confirm with the user first.', 'People newly given a step are notified (in the app and by push).']);

// deleteProject(): the owner only; every step (done ones too) and the project
def('projects.delete', 'projects:write', 'מחיקת פרויקט שלם עם כל הצעדים (רק הבעלים)', { ifUpdatedAt: IF_UPDATED_AT as Param, projectId: req() }, async (c) => {
  if (!isOwner(c.caller)) throw forbidden('only the owner can delete a project');
  const p = await projectFor(c, c.input.projectId);
  fresh(p, c.input.ifUpdatedAt);
  const steps = await stepsOf(c.fs, p.id);
  const refs: Ref[] = [{ col: P, id: p.id, gone: true }, ...steps.map((s) => ({ col: stepsCol(p.id), id: s.id, gone: true }))];
  return { writes: [...steps.map((s) => c.fs.remove(stepsCol(p.id), s.id)), c.fs.remove(P, p.id, p.updateTime)], refs, data: { deleted: { ...project(P, p.id, p.data), steps: steps.length } } };
}, ['Destructive and final: confirm with the user first. Owner only.']);

const stepRef = { projectId: req('הפרויקט'), stepId: req('הצעד (מתוך projects.get)') };

// takeStep(): only if the step is still free and open
def('projects.takeStep', 'projects:write', 'לקחת צעד פנוי בפרויקט על עצמי', stepRef, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const s = await stepFor(c, p.id, c.input.stepId);
  const cur = (s.data.assignee as Person | null) || null;
  if (s.data.done) throw conflict('the step is already done', { reason: 'done' });
  if (cur && cur.uid !== c.me.uid) throw conflict(`the step is already on ${cur.name}`, { reason: 'taken', assignee: cur });
  if (cur) return { writes: [], refs: [{ col: stepsCol(p.id), id: s.id }], data: { changed: false } };
  const at = nowIso();
  return {
    writes: [c.fs.patch(stepsCol(p.id), s.id, { assignee: c.me, updatedAt: at }, s.updateTime), c.fs.patch(P, p.id, { ...withMembers(p.data, [c.me]), updatedAt: at }, p.updateTime)],
    refs: [{ col: stepsCol(p.id), id: s.id, expected: { assignee: c.me } }], data: { changed: true },
  };
}, ['409 STALE_WRITE when someone else holds it or it is done.']);

// releaseStep(): only my own open step
def('projects.releaseStep', 'projects:write', 'לשחרר צעד שלי בפרויקט', stepRef, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const s = await stepFor(c, p.id, c.input.stepId);
  if (s.data.done || (s.data.assignee as Person | null)?.uid !== c.me.uid) throw conflict('the step is not yours, or it is done', { reason: 'not_mine', assignee: s.data.assignee ?? null });
  return { writes: [c.fs.patch(stepsCol(p.id), s.id, { assignee: null, updatedAt: nowIso() }, s.updateTime)], refs: [{ col: stepsCol(p.id), id: s.id, expected: { assignee: null } }] };
}, ['Only your own open step (409 STALE_WRITE otherwise).']);

// completeStep(): the last open step closes the project
def('projects.completeStep', 'projects:write', 'סימון צעד כבוצע (האחרון שנשאר סוגר את הפרויקט)', stepRef, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const s = await stepFor(c, p.id, c.input.stepId);
  if (s.data.done) throw conflict('the step is already done', { reason: 'done' });
  const all = (await stepsOf(c.fs, p.id)).map((d) => (d.id === s.id ? { done: true } : { done: !!d.data.done }));
  const last = all.length > 0 && all.every((x) => x.done);
  const at = nowIso();
  return {
    writes: [
      c.fs.patch(stepsCol(p.id), s.id, { done: true, doneBy: c.me, doneAt: at, updatedAt: at }, s.updateTime),
      c.fs.patch(P, p.id, { ...withMembers(p.data, [c.me]), updatedAt: at, ...(last ? { status: 'done', doneAt: at } : {}) }, p.updateTime),
    ],
    refs: [{ col: stepsCol(p.id), id: s.id, expected: { done: true } }, { col: P, id: p.id, expected: { status: last ? 'done' : p.data.status } }],
    data: { projectDone: last },
  };
}, ['Done by the calling person. "projectDone": true when it was the last open step (the project is marked done).']);

// reopenStep(): undo of "בוצע"; the project is active again
def('projects.reopenStep', 'projects:write', 'החזרת צעד שבוצע לרשימה (הפרויקט חוזר להיות פעיל)', stepRef, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const s = await stepFor(c, p.id, c.input.stepId);
  if (!s.data.done) return { writes: [], refs: [{ col: stepsCol(p.id), id: s.id }], data: { changed: false } };
  const at = nowIso();
  return {
    writes: [c.fs.patch(stepsCol(p.id), s.id, { done: false, doneBy: null, doneAt: null, updatedAt: at }, s.updateTime), c.fs.patch(P, p.id, { status: 'active', doneAt: null, updatedAt: at }, p.updateTime)],
    refs: [{ col: stepsCol(p.id), id: s.id, expected: { done: false } }], data: { changed: true },
  };
});

// postUpdate(): a short update in the step's thread; the project's members and the assignee are told in the app (no push)
def('projects.postUpdate', 'projects:write', 'עדכון קצר בשרשור של צעד (חברי הפרויקט מקבלים התראה באפליקציה)', { ...stepRef, text: str(500, 'העדכון', true, 1) }, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const s = await stepFor(c, p.id, c.input.stepId);
  const updates = ((s.data.updates as unknown[]) || []);
  if (updates.length >= 300) throw invalid('text', 'this step already has 300 updates');
  const at = nowIso();
  const t = String(c.input.text).slice(0, 500);
  const to = [...memberUidsOf(p.data), (s.data.assignee as Person | null)?.uid || ''];
  return {
    writes: [
      c.fs.patch(stepsCol(p.id), s.id, { updates: [...updates, { by: c.me, at, text: t }], updatedAt: at }, s.updateTime),
      ...notifyWrites(c.fs, to, { kind: 'task', title: `עדכון ב${shortTitle(p.data)}`, sub: `${s.data.title}: ${t}`.slice(0, 140), link: stepLink(p.id, s.id), refId: s.id, by: c.me, push: false }),
    ],
    refs: [{ col: stepsCol(p.id), id: s.id }],
  };
});

// splitStep(): sub-steps right after the step, with its assignee and due date
def('projects.splitStep', 'projects:write', 'פיצול צעד לתתי־צעדים (באים מיד אחריו, עם אותו אחראי ותאריך)', { ...stepRef, titles: { type: 'stringList', maxItems: 20, maxLength: 200, required: true, he: 'שמות תתי־הצעדים' } }, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const parent = await stepFor(c, p.id, c.input.stepId);
  const list = (c.input.titles as string[]).map((t) => t.trim()).filter(Boolean);
  if (!list.length) throw invalid('titles', 'send at least one title');
  const steps = (await stepsOf(c.fs, p.id)).map(asStep);
  const ns = splitNs(steps, parent.id, list.length);
  const at = nowIso(); const col = stepsCol(p.id);
  const ids = list.map(() => autoId());
  const writes: Write[] = list.map((title, i) => c.fs.create(col, ids[i], newStep(p.id, ids[i], ns[i], title, (parent.data.assignee as Person | null) || null, c.me, at, { due: parent.data.due || '', parentId: parent.id })));
  writes.push(c.fs.patch(P, p.id, { updatedAt: at }, p.updateTime));
  return { status: 201, writes, refs: ids.map((id) => ({ col, id })), data: { stepIds: ids } };
});

// updateStep(): the step's own text, due date and note
def('projects.updateStep', 'projects:write', 'עריכת צעד: שם, תאריך יעד, הערה', {
  ...stepRef, title: str(200, 'שם הצעד', false, 1), due: date('עד מתי'), clearDue: { type: 'bool', he: 'true מסיר את התאריך' }, note: str(1000, 'הערה'),
}, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const s = await stepFor(c, p.id, c.input.stepId);
  const patch: Record<string, unknown> = {};
  if (c.input.title) patch.title = c.input.title;
  if (c.input.due) patch.due = c.input.due;
  if (c.input.clearDue) patch.due = '';
  if (c.input.note !== null && c.input.note !== undefined) patch.note = String(c.input.note).slice(0, 1000);
  if (!Object.keys(patch).length) throw invalid('body', 'nothing to change: send at least one field');
  return { writes: [c.fs.patch(stepsCol(p.id), s.id, { ...patch, updatedAt: nowIso() }, s.updateTime)], refs: [{ col: stepsCol(p.id), id: s.id, expected: patch }] };
});

// addStep(): one more step at the end
def('projects.addStep', 'projects:write', 'הוספת צעד בסוף הפרויקט', { projectId: req('הפרויקט'), title: str(200, 'שם הצעד', true, 1), assignee: { type: 'uid', he: 'על מי (uid), ריק = פנוי' } }, async (c) => {
  const p = await projectFor(c, c.input.projectId);
  const assignee = c.input.assignee ? await member(c.fs, c.input.assignee, 'assignee', c.tx) : null;
  const steps = (await stepsOf(c.fs, p.id)).map(asStep);
  const at = nowIso(); const id = autoId();
  return { status: 201, writes: [c.fs.create(stepsCol(p.id), id, newStep(p.id, id, nextN(steps), c.input.title, assignee, c.me, at))], refs: [{ col: stepsCol(p.id), id, expected: { title: c.input.title } }], data: { stepId: id } };
}, ['As the app\'s addStep: nobody is notified. To give a step to someone with a notification, use projects.update.']);

// ======================= reads =======================

const projectsResource: ResourceDef = {
  name: 'projects', col: P, path: '/v1/projects', scope: 'projects:read',
  he: 'פרויקטים של המנהלים: יעד, תאריך, חברים, מצב, וכל הצעדים שלהם לפי הסדר',
  order: { field: 'createdAt', dir: 'ASCENDING' },
  restrict: (c) => (isManager(c) ? [] : null),
  visible: (c) => isManager(c),
  // every project comes with its steps in display order and the counts the cards show
  redact: async (fs, _c, items) => Promise.all(items.map(async (it) => {
    const steps = sortSteps((await stepsOf(fs, String(it.id))).map((d) => ({ ...project(stepsCol(String(it.id)), d.id, d.data), n: Number(d.data.n) || 0 } as Record<string, unknown> & { n: number })));
    const progress = { total: steps.length, done: steps.filter((s) => s.done).length, free: steps.filter((s) => !s.done && !s.assignee).length };
    return { ...it, steps, progress };
  })),
  notes: ['Managers and owners only. status: active or done. Each project includes "steps" (ordered; a step\'s id is what the step actions take) and "progress".'],
};
RESOURCES.push(projectsResource, {
  ...projectsResource, name: 'eventProjects', path: '/v1/event-projects', scope: 'events:read',
  he: 'פרויקטים משויכים לאירוע, עם צעדים והתקדמות', filters: { eventId: { field:'eventId', param:{ type:'id', required:true } } },
  restrict: (_caller, given) => typeof given.eventId === 'string' && given.eventId ? [] : null,
  visible: (_caller, data) => typeof data.eventId === 'string' && !!data.eventId,
  notes: ['List requires eventId. Only event-linked projects are visible in this read-only view.'],
});
