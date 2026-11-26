// Every other action of the app. Each one writes exactly what the app's function writes (named in its
// comment, in src/app/store.ts or src/app/data.ts), including the activity record and side effects such as
// the calendar entry or closing notifications, but atomically in one transaction with an idempotency key.
import { ApiError, invalid } from './http';
import type { Caller, Scope } from './auth';
import type { Operation, Param } from './catalog';
import type { Firestore, Write } from './firestore';
import {
  type Person, type Ref, IF_UPDATED_AT, activity, forbidden, fresh, idempotent, isManager, isOwner, mustGet, notFound, nextUpdatedAt, nowIso, paidStamp, project, readBackRefs, taskKind, whereEq, placeIsReferenced,
} from './core';
import { autoId } from './util';
import { notifyWrites } from './notify';
import { member as teamMember, todayIL } from './core';
import { storedPhoto, taskToPerson } from './v2/taskutil';
import { dropPushDevices } from './resources';
import { addWriteActivity } from './write-activity';

export type Input = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Ctx = { fs: Firestore; caller: Caller; me: Person; input: Input; tx: string };
export type Out = { writes: Write[]; refs: Ref[]; data?: Record<string, unknown>; status?: number };
export type WriteDef = { op: Operation; run: (fs: Firestore, caller: Caller, input: Input, key: string | null) => Promise<{ status: number; data: Record<string, unknown>; replayed: boolean }> };

const DEFS: WriteDef[] = [];
export function def(name: string, scope: Scope, he: string, body: Record<string, Param>, fn: (c: Ctx) => Promise<Out>, notes: string[] = [], alternativeScopes?: readonly Scope[]) {
  const op: Operation = { name, kind: 'write', idempotency: 'required', he, method: 'POST', path: `/v1/actions/${name}`, body, requiredScope: scope, ...(alternativeScopes ? { alternativeScopes } : {}), notes: [...notes, 'Response: "record" (or "records") read back after the write, and "verified".'] };
  DEFS.push({
    op,
    run: (fs, caller, input, key) => idempotent(fs, caller, name, key, input, async (tx) => {
      const me = caller.actor.person;
      const r = await fn({ fs, caller, me, input, tx });
      addWriteActivity(fs, me, name, input, r.writes, r.refs);
      return { writes: r.writes, status: r.status, data: { ...(r.data || {}), refs: r.refs } };
    }, async (d) => scrubPush(await readBackRefs(fs)(d))),
  });
}
/** A profile read back after a write never carries push subscriptions (resources.ts dropPushDevices). */
function scrubPush(d: Record<string, unknown>) {
  const one = (r: unknown) => (r && typeof r === 'object' ? dropPushDevices(r as Record<string, unknown>) : r);
  return { ...d, ...(d.record ? { record: one(d.record) } : {}), ...(Array.isArray(d.records) ? { records: d.records.map(one) } : {}) };
}
export const WRITE_DEFS = DEFS;

// ---------- parameter helpers ----------
export const str = (max: number, he?: string, required = false, min = 0): Param => ({ type: 'string', max, min, required, he });
export const req = (he?: string): Param => ({ type: 'id', required: true, he });
export const opt = (he?: string): Param => ({ type: 'id', he });
export const bool = (he?: string, dflt?: boolean): Param => ({ type: 'bool', he, ...(dflt === undefined ? {} : { default: dflt }) });
export const date = (he: string, required = false): Param => ({ type: 'date', format: 'YYYY-MM-DD', timezone: 'Asia/Jerusalem', required, he });
export const dt = (he: string, required = false): Param => ({ type: 'datetime', format: 'YYYY-MM-DDTHH:mm', timezone: 'Asia/Jerusalem', required, he });
export const en = (values: string[], he: string, required = false, dflt?: string): Param => ({ type: 'enum', values, he, required, ...(dflt ? { default: dflt } : {}) });
export const num = (min: number, max: number, he: string, required = false, dflt?: number): Param => ({ type: 'number', min, max, he, required, ...(dflt === undefined ? {} : { default: dflt }) });

/** Only the fields the caller actually sent (validate() fills the rest with null). */
export const given = (input: Input, keys: string[]) => Object.fromEntries(keys.filter((k) => input[k] !== null && input[k] !== undefined).map((k) => [k, input[k]]));
export function needSome(patch: Record<string, unknown>) { if (!Object.keys(patch).length) throw invalid('body', 'nothing to change: send at least one field'); }
export const taskText = (t: { title: unknown }) => { const s = String(t.title); return s.length > 60 ? s.slice(0, 60) + '…' : s; };
/** ROLE_LABELS in src/app/types.ts */
export const ROLE_HE: Record<string, string> = { owner: 'בעלים', manager: 'מנהל/ת', staff: 'מתנדב/ת', guest: 'אורח/ת', vendor: 'בעל דוכן' };
/** Event times as farm time "YYYY-MM-DDTHH:mm": the API stores them that way, the app stores ISO UTC ("…Z"). */
export const farmTime = (s: string) => (/(Z|[+-]\d\d:\d\d)$/.test(s) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s)).replace(' ', 'T') : s.slice(0, 16));
export const hhmm = (s: string) => farmTime(s).slice(11, 16);
const IL_WALL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const wallIL = (ms: number) => { const p = IL_WALL.formatToParts(new Date(ms)); const g = (t: string) => Number(p.find((x) => x.type === t)?.value || 0); return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')); };
/** Israel time "YYYY-MM-DDTHH:mm" (or a bare date = its midnight) -> ISO UTC instant, as isoFromLocal() in src/app/v2/screens/events/logic.ts. */
export function isoFromIL(local: string): string {
  const [y, m, d] = local.slice(0, 10).split('-').map(Number);
  const [h, mi] = (local.slice(11, 16) || '00:00').split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  let ms = target - 2 * 3600_000;
  for (let i = 0; i < 2; i++) ms += target - wallIL(ms);
  return new Date(ms).toISOString();
}
/** A stored event time in either format (the app's ISO UTC, or the farm time older API writes left) -> ISO UTC. */
export const eventIso = (s: unknown) => { const v = String(s || ''); return !v ? '' : /(Z|[+-]\d\d:\d\d)$/.test(v) ? new Date(v).toISOString() : isoFromIL(v); };

// ======================= tasks =======================

async function taskFor(c: Ctx, id: string) {
  const t = await mustGet(c.fs, 'tasks', id, c.tx, 'task');
  if (t.data.managersOnly && !isManager(c.caller)) throw notFound('task');
  return t;
}
/** firestore.rules: a team member may edit or delete a task only if they created it; managers always. */
function ownsTask(c: Ctx, t: { data: Record<string, unknown> }) {
  if (!isManager(c.caller) && (t.data.createdBy as Person | null)?.uid !== c.me.uid) throw forbidden('only managers or the task\'s creator may do this');
}
async function placeLocation(c: Ctx, placeId: string) {
  const p = await mustGet(c.fs, 'places', placeId, c.tx, 'place');
  if (p.data.archived) throw invalid('placeId','this place was archived');
  return { lat: p.data.lat, lng: p.data.lng, placeId: p.id, placeName: p.data.name };
}

// editTask()
def('tasks.edit', 'tasks:edit', 'עריכת משימה: כותרת, הערה, תאריך יעד, דחיפות, מיקום, למנהלים בלבד', { ifUpdatedAt: IF_UPDATED_AT as Param,
  taskId: req(), title: str(200, 'כותרת', false, 1), note: str(4000, 'הערה'), dueDate: date('תאריך יעד'), clearDueDate: bool('true מסיר את תאריך היעד'),
  urgent: bool('דחוף'), managersOnly: bool('למנהלים בלבד (רק מנהל)'), placeId: opt('מקום מתוך places.list'), clearPlace: bool('true מסיר את המיקום'),
  eventId: opt('האירוע שהמשימה מכינה, מתוך events.list'), clearEvent: bool('true מנתק את המשימה מהאירוע'),
  assignee: { type: 'uid', he: 'על מי המשימה: uid מתוך people.search (למישהו אחר: רק מנהל)' }, clearAssignee: bool('true: המשימה פנויה'),
}, async (c) => {
  const t = await taskFor(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  ownsTask(c, t);
  const patch: Record<string, unknown> = given(c.input, ['title', 'note', 'dueDate', 'urgent', 'managersOnly']);
  if (c.input.clearDueDate) patch.dueDate = '';
  if ('managersOnly' in patch && !isManager(c.caller)) throw forbidden('only managers can make a task manager-only');
  if (c.input.placeId) patch.location = await placeLocation(c, c.input.placeId);
  if (c.input.clearPlace) patch.location = null;
  if (c.input.eventId) { await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event'); patch.eventId = c.input.eventId; }
  if (c.input.clearEvent) patch.eventId = '';
  // updateTask() in src/app/v2/data/tasks.ts: the form sends the assignee; a new person is logged and notified
  if (c.input.assignee && c.input.clearAssignee) throw invalid('clearAssignee', 'send assignee or clearAssignee, not both');
  if (c.input.assignee && c.input.assignee !== c.me.uid && !c.caller.scopes.has('tasks:assign')) throw new ApiError('FORBIDDEN', 'only managers can put a task on someone else', { requiredScope: 'tasks:assign' });
  const was = (t.data.assignee as Person | null) || null;
  const newAssignee = c.input.assignee ? await teamMember(c.fs, c.input.assignee, 'assignee', c.tx) : null;
  if (newAssignee) patch.assignee = newAssignee;
  if (c.input.clearAssignee) patch.assignee = null;
  needSome(patch);
  const onlyUrgent = Object.keys(patch).length === 1 && 'urgent' in patch;
  const writes = [c.fs.patch('tasks', t.id, { ...patch, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime)];
  const kind = taskKind({ managersOnly: patch.managersOnly ?? t.data.managersOnly });
  // the history follows the task's visibility, as editTask() in the app does
  if ('managersOnly' in patch && !!patch.managersOnly !== !!t.data.managersOnly) {
    const from = patch.managersOnly ? 'task' : 'task_private';
    for (const a of await whereEq(c.fs, 'activity', { kind: from, refId: t.id }, 300)) writes.push(c.fs.patch('activity', a.id, { kind }));
  }
  if (onlyUrgent && patch.urgent !== !!t.data.urgent) writes.push(activity(c.fs, c.me, kind, t.id, patch.urgent ? 'urgent' : 'edited', `${patch.urgent ? 'סומנה דחוף: ' : 'הורד הדחוף: '}${taskText(t.data as { title: string })}`));
  else if (!onlyUrgent) writes.push(activity(c.fs, c.me, kind, t.id, 'edited', taskText({ title: patch.title ?? t.data.title })));
  if (!onlyUrgent && newAssignee && newAssignee.uid !== was?.uid) {
    writes.push(activity(c.fs, c.me, kind, t.id, 'assigned', `${taskText(t.data as { title: string })} ← ${newAssignee.name}`, { subjectUid: newAssignee.uid }));
    writes.push(...taskToPerson(c.fs, c.me, newAssignee, t.id, String(patch.title ?? t.data.title)));
  }
  return { writes, refs: [{ col: 'tasks', id: t.id, expected: patch }] };
});

// setTaskDoneDetails()
def('tasks.setDoneNote', 'tasks:complete', 'הערת ביצוע למשימה (מה נעשה)', { ifUpdatedAt: IF_UPDATED_AT as Param, taskId: req(), note: str(2000, 'ההערה', true) }, async (c) => {
  const t = await taskFor(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  const writes = [c.fs.patch('tasks', t.id, { doneNote: c.input.note, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime),
    activity(c.fs, c.me, taskKind(t.data), t.id, 'note', `${taskText(t.data as { title: string })}${c.input.note ? ': ' + c.input.note : ''}`)];
  return { writes, refs: [{ col: 'tasks', id: t.id, expected: { doneNote: c.input.note } }] };
});

// deleteTaskV2() in src/app/v2/data/tasks.ts
def('tasks.delete', 'tasks:delete', 'מחיקת משימה', { ifUpdatedAt: IF_UPDATED_AT as Param, taskId: req() }, async (c) => {
  const t = await taskFor(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  ownsTask(c, t);
  // canDeleteTask(): a recurring task belongs to the managers, whoever created that day's instance
  if (t.data.templateId && !isManager(c.caller)) throw forbidden('only managers can delete a recurring task');
  const writes: Write[] = [c.fs.remove('tasks', t.id, t.updateTime)];
  const refs: Ref[] = [{ col: 'tasks', id: t.id, gone: true }];
  // a day's instance would be created again that morning: the template remembers the day (skip: today and later, at most 30)
  if (t.data.templateId && t.data.dateKey) {
    const tpl = await c.fs.get('task_templates', String(t.data.templateId), c.tx);
    if (tpl) {
      const today = todayIL();
      const skip = [...new Set([...((tpl.data.skip as string[]) || []).filter((d) => d >= today), String(t.data.dateKey)])].sort().slice(-30);
      writes.push(c.fs.patch('task_templates', tpl.id, { skip, updatedAt: nextUpdatedAt(tpl.data.updatedAt) }, tpl.updateTime));
      refs.push({ col: 'task_templates', id: tpl.id, expected: { skip } });
    }
  }
  writes.push(activity(c.fs, c.me, taskKind(t.data), t.id, 'deleted', taskText(t.data as { title: string })));
  return { writes, refs, data: { deleted: project('tasks', t.id, t.data) } };
}, ['Destructive: confirm with the user first. "deleted" holds the task as it was.', 'A day of a recurring task (templateId) is for managers only; its template then skips that day, so it is not created again.']);

// ======================= recurring templates =======================

const templateBody = (required: boolean): Record<string, Param> => ({
  title: str(200, 'כותרת', required, 1), note: str(4000, 'הערה'),
  days: { type: 'intList', min: 0, max: 6, maxItems: 7, he: 'ימים בשבוע: 0 ראשון … 6 שבת. רשימה ריקה = כל יום' },
  time: { type: 'time', format: 'HH:mm', timezone: 'Asia/Jerusalem', he: 'שעה' }, active: bool('פעילה'), managersOnly: bool('למנהלים בלבד'),
  assignee: { type: 'uid', he: 'על מי כל יום (uid מתוך people.search). במשימה למנהלים בלבד נשמר ריק' }, placeId: opt('מקום מתוך places.list'),
});
/** daysToSave() in src/app/v2/data/tasks.ts: all seven days are stored as [] ("every day"). */
const daysToSave = (days: number[]) => (days.length === 7 ? [] : days);
const TEMPLATE_NOTES = ['The app creates the day\'s task from active templates when someone opens it that day, with the template\'s place and person.'];
// saveTemplateV2() (new) in src/app/v2/data/tasks.ts
def('templates.create', 'templates:write', 'יצירת משימה קבועה (חוזרת)', templateBody(true), async (c) => {
  const id = autoId();
  const now = nowIso();
  const managersOnly = c.input.managersOnly ?? false;
  const data: Record<string, unknown> = { title: c.input.title, note: c.input.note || '', days: daysToSave(c.input.days || []), time: c.input.time || '', active: c.input.active ?? true, managersOnly, updatedAt: now };
  // new fields only when they carry a value, so a template without them keeps the old shape
  if (c.input.assignee) data.assignee = managersOnly ? null : await teamMember(c.fs, c.input.assignee, 'assignee', c.tx);
  if (c.input.placeId) { await placeLocation(c, c.input.placeId); data.placeId = c.input.placeId; }
  Object.assign(data, { createdBy: c.me, createdAt: now });
  return { status: 201, writes: [c.fs.create('task_templates', id, data)], refs: [{ col: 'task_templates', id, expected: { title: data.title, days: data.days, active: data.active } }], data: { templateId: id } };
}, TEMPLATE_NOTES);
// saveTemplateV2() (existing)
def('templates.update', 'templates:write', 'עדכון משימה קבועה', { ifUpdatedAt: IF_UPDATED_AT as Param, templateId: req(), ...templateBody(false), clearAssignee: bool('true: בלי אחראי קבוע'), clearPlace: bool('true: בלי מקום') }, async (c) => {
  const t = await mustGet(c.fs, 'task_templates', c.input.templateId, c.tx, 'template');
  fresh(t, c.input.ifUpdatedAt);
  const patch: Record<string, unknown> = given(c.input, ['title', 'note', 'days', 'time', 'active', 'managersOnly']);
  if (patch.days) patch.days = daysToSave(patch.days as number[]);
  const managersOnly = !!(patch.managersOnly ?? t.data.managersOnly);
  if (c.input.assignee && c.input.clearAssignee) throw invalid('clearAssignee', 'send assignee or clearAssignee, not both');
  if (c.input.assignee) patch.assignee = managersOnly ? null : await teamMember(c.fs, c.input.assignee, 'assignee', c.tx);
  else if ('assignee' in t.data && (c.input.clearAssignee || (managersOnly && t.data.assignee))) patch.assignee = null;
  if (c.input.placeId && c.input.clearPlace) throw invalid('clearPlace', 'send placeId or clearPlace, not both');
  if (c.input.placeId) { await placeLocation(c, c.input.placeId); patch.placeId = c.input.placeId; }
  else if (c.input.clearPlace && 'placeId' in t.data) patch.placeId = '';
  needSome(patch);
  return { writes: [c.fs.patch('task_templates', t.id, { ...patch, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime)], refs: [{ col: 'task_templates', id: t.id, expected: patch }] };
}, ['Only the fields sent change. A manager-only template has no person (assignee is stored empty).']);
// deleteTemplate()
def('templates.delete', 'templates:write', 'מחיקת משימה קבועה', { ifUpdatedAt: IF_UPDATED_AT as Param, templateId: req() }, async (c) => {
  const t = await mustGet(c.fs, 'task_templates', c.input.templateId, c.tx, 'template');
  fresh(t, c.input.ifUpdatedAt);
  return { writes: [c.fs.remove('task_templates', t.id, t.updateTime)], refs: [{ col: 'task_templates', id: t.id, gone: true }], data: { deleted: project('task_templates', t.id, t.data) } };
}, ['Destructive: confirm with the user first. Tasks already created from it stay.']);

// ======================= shopping =======================

const CAT = ['super', 'building', 'online', 'giveaway'];
const itemText = (d: Record<string, unknown>) => `${d.title}${d.qty ? ' · ' + d.qty : ''}`;
// editShopping()
def('shopping.edit', 'shopping:write', 'עריכת פריט ברשימת הקניות', { ifUpdatedAt: IF_UPDATED_AT as Param,
  itemId: req(), title: str(200, 'מה לקנות', false, 1), qty: str(40, 'כמות'), note: str(1000, 'הערה'), link: str(2000, 'קישור https'),
  category: en(CAT, 'super סופר, building חומרי בניין, online אינטרנט, giveaway מוצרי מסירה'), urgent: bool('דחוף'),
}, async (c) => {
  const it = await mustGet(c.fs, 'shopping', c.input.itemId, c.tx, 'shopping item');
  fresh(it, c.input.ifUpdatedAt);
  const patch = given(c.input, ['title', 'qty', 'note', 'link', 'category', 'urgent']);
  if (typeof patch.link === 'string' && patch.link && !/^https:\/\//.test(patch.link)) throw invalid('link', 'link must start with https://');
  needSome(patch);
  const onlyUrgent = Object.keys(patch).length === 1 && 'urgent' in patch;
  const text = onlyUrgent ? `${patch.urgent ? 'סימן/ה דחוף: ' : 'הורד הדחוף: '}${itemText(it.data)}` : String(patch.title ?? it.data.title);
  const writes = [c.fs.patch('shopping', it.id, { ...patch, updatedAt: nowIso() }, it.updateTime)];
  if (!onlyUrgent || patch.urgent !== !!it.data.urgent) writes.push(activity(c.fs, c.me, 'shopping', it.id, 'edited', text));
  return { writes, refs: [{ col: 'shopping', id: it.id, expected: patch }] };
});
// deleteShopping()
def('shopping.delete', 'shopping:delete', 'מחיקת פריט מרשימת הקניות', { ifUpdatedAt: IF_UPDATED_AT as Param, itemId: req() }, async (c) => {
  const it = await mustGet(c.fs, 'shopping', c.input.itemId, c.tx, 'shopping item');
  fresh(it, c.input.ifUpdatedAt);
  return { writes: [c.fs.remove('shopping', it.id, it.updateTime), activity(c.fs, c.me, 'shopping', it.id, 'deleted', String(it.data.title))], refs: [{ col: 'shopping', id: it.id, gone: true }], data: { deleted: project('shopping', it.id, it.data) } };
}, ['Destructive: confirm with the user first. To mark it bought, use shopping.setBought instead.']);

// ======================= places =======================

// createPlace() in src/app/v2/data/tasks.ts: anyone on the team saves a place
def('places.add', 'places:write', 'הוספת מקום בחווה', { name: str(120, 'שם', true, 1), lat: num(-90, 90, 'קו רוחב', true), lng: num(-180, 180, 'קו אורך', true), accuracy: num(0, 100000, 'דיוק המיקום במטרים') }, async (c) => {
  const id = autoId();
  const data: Record<string, unknown> = { name: c.input.name, lat: c.input.lat, lng: c.input.lng, createdBy: c.me, createdAt: nowIso() };
  if (c.input.accuracy !== null && c.input.accuracy !== undefined) data.accuracy = c.input.accuracy;
  return { status: 201, writes: [c.fs.create('places', id, data), activity(c.fs, c.me, 'place', id, 'created', String(data.name))], refs: [{ col: 'places', id, expected: { name: data.name } }], data: { placeId: id } };
}, ['Every team member may add and edit places (as in the app); only managers delete them.']);
// savePlace()
def('places.update', 'places:write', 'עדכון מקום: שם, מיקום, דיוק, תמונה', {
  placeId: req(), name: str(120, 'שם', false, 1), lat: num(-90, 90, 'קו רוחב'), lng: num(-180, 180, 'קו אורך'), accuracy: num(0, 100000, 'דיוק המיקום במטרים'),
  photo: str(300, 'תמונה: רק קישור לתמונה שהאפליקציה כבר שמרה (https://havat-ravve-api.meniviner.workers.dev/v1/files/...)'),
}, async (c) => {
  const p = await mustGet(c.fs, 'places', c.input.placeId, c.tx, 'place');
  const patch: Record<string, unknown> = given(c.input, ['name', 'lat', 'lng']);
  if (c.input.accuracy !== null && c.input.accuracy !== undefined && c.input.accuracy !== p.data.accuracy) patch.accuracy = c.input.accuracy;
  if (c.input.photo !== null && c.input.photo !== undefined) { const ph = storedPhoto('photo', c.input.photo, true); if (ph !== (p.data.photo || '')) patch.photo = ph; }
  const moved = ['lat','lng'].some(key => key in patch && patch[key] !== p.data[key]);
  if (moved && p.data.source) Object.assign(patch, {source: null, measuredAt: null});
  if (moved && c.input.accuracy == null && p.data.accuracy != null) patch.accuracy = null;
  needSome(patch);
  // the read-back shows a photo as hasPhoto
  const { photo: newPhoto, ...shown } = patch;
  const expected = 'photo' in patch ? { ...shown, hasPhoto: !!newPhoto } : patch;
  return { writes: [c.fs.patch('places', p.id, patch, p.updateTime), activity(c.fs, c.me, 'place', p.id, 'edited', String(patch.name ?? p.data.name))], refs: [{ col: 'places', id: p.id, expected }] };
});
// removePlace()
def('places.delete', 'places:write', 'מחיקת מקום (רק מנהל)', { placeId: req() }, async (c) => {
  if (!isManager(c.caller)) throw forbidden('only managers can delete a place');
  const p = await mustGet(c.fs, 'places', c.input.placeId, c.tx, 'place');
  if (await placeIsReferenced(c.fs,p.id,c.tx)) {
    return {writes:[c.fs.patch('places',p.id,{archived:true},p.updateTime),activity(c.fs,c.me,'place',p.id,'archived',String(p.data.name))],
      refs:[{col:'places',id:p.id,expected:{archived:true}}],data:{archived:true}};
  }
  return { writes: [c.fs.remove('places', p.id, p.updateTime), activity(c.fs, c.me, 'place', p.id, 'deleted', String(p.data.name))], refs: [{ col: 'places', id: p.id, gone: true }], data: { deleted: project('places', p.id, p.data) } };
}, ['Destructive: confirm with the user first. Managers only.']);

// ======================= people =======================

/** firestore.rules managerEdit(): only the owner touches owners, and only the owner makes managers. */
function mayManage(c: Ctx, current: string, next?: string) {
  if (current === 'owner' && !isOwner(c.caller)) throw forbidden('only the owner can change an owner');
  if (next === 'owner' && !isOwner(c.caller)) throw forbidden('only the owner can make someone an owner');
  if (next === 'manager' && !isOwner(c.caller) && current !== 'manager') throw forbidden('only the owner can make someone a manager');
}
function logEntry(c: Ctx, p: Record<string, unknown>, text: string) {
  return [...((p.log as unknown[]) || []).slice(-29), { at: nowIso(), by: c.me, text }];
}
// setUserRole() (role)
def('people.setRole', 'people:write', 'שינוי תפקיד של אדם (אורח, מתנדב, מנהל, בעלים)', { ifUpdatedAt: IF_UPDATED_AT as Param, uid: req('uid מתוך people.search או profiles.list'), role: en(['guest', 'staff', 'manager', 'owner'], 'guest אורח, staff מתנדב, manager מנהל, owner בעלים', true) }, async (c) => {
  if (c.input.uid === c.me.uid) throw forbidden('you cannot change your own role through the API');
  const p = await mustGet(c.fs, 'users', c.input.uid, c.tx, 'person');
  fresh(p, c.input.ifUpdatedAt);
  const from = String(p.data.role), to = c.input.role as string;
  mayManage(c, from, to);
  if (from === to) return { writes: [], refs: [{ col: 'users', id: p.id }], data: { changed: false } };
  return {
    writes: [c.fs.patch('users', p.id, { role: to, updatedAt: nowIso(), log: logEntry(c, p.data, `תפקיד: ${ROLE_HE[from]} ← ${ROLE_HE[to]}`) }, p.updateTime),
      activity(c.fs, c.me, 'user', p.id, 'role', `${p.data.displayName}: ${ROLE_HE[from]} ← ${ROLE_HE[to]}`, { subjectUid: p.id }),
      // changeRole() (src/app/v2/data/manage.ts): the person is told in the app (C1), without a phone push; never on a move to guest
      ...(to !== 'guest' ? notifyWrites(c.fs, [p.id], { kind: 'system', title: `קיבלת תפקיד: ${ROLE_HE[to]}`, sub: `${c.me.name} עדכן/ה את התפקיד שלך באפליקציה`, link: '/me', by: c.me, push: false }) : [])],
    refs: [{ col: 'users', id: p.id, expected: { role: to } }], data: { changed: true },
  };
}, ['The person gets an in-app notification (no phone push) unless the new role is guest. A vendor\'s role can only go back to guest; nobody is made a vendor here (that takes a stall invite).']);
// setUserRole() (status)
def('people.setStatus', 'people:block', 'חסימה או שחרור של אדם', { ifUpdatedAt: IF_UPDATED_AT as Param, uid: req(), status: en(['active', 'blocked'], 'active פעיל (שחרור), blocked חסום', true) }, async (c) => {
  if (c.input.uid === c.me.uid) throw forbidden('you cannot block yourself through the API');
  const p = await mustGet(c.fs, 'users', c.input.uid, c.tx, 'person');
  fresh(p, c.input.ifUpdatedAt);
  mayManage(c, String(p.data.role));
  const to = c.input.status as string;
  if (p.data.status === to) return { writes: [], refs: [{ col: 'users', id: p.id }], data: { changed: false } };
  const blocked = to === 'blocked';
  return {
    writes: [c.fs.patch('users', p.id, { status: to, updatedAt: nowIso(), log: logEntry(c, p.data, `מצב: ${blocked ? 'נחסם' : 'שוחרר'}`) }, p.updateTime),
      activity(c.fs, c.me, 'user', p.id, blocked ? 'blocked' : 'unblocked', `${p.data.displayName} ${blocked ? 'נחסם/ה' : 'שוחרר/ה'}`, { subjectUid: p.id })],
    refs: [{ col: 'users', id: p.id, expected: { status: to } }], data: { changed: true },
  };
});
// setUserNotes()
def('people.setNotes', 'people:write', 'הערות פנימיות על אדם (רק מנהלים רואים)', { ifUpdatedAt: IF_UPDATED_AT as Param, uid: req(), notes: str(2000, 'ההערות (מחליף את הקיימות)', true) }, async (c) => {
  const p = await mustGet(c.fs, 'users', c.input.uid, c.tx, 'person');
  fresh(p, c.input.ifUpdatedAt);
  mayManage(c, String(p.data.role));
  return { writes: [c.fs.patch('users', p.id, { notes: c.input.notes, updatedAt: nowIso() }, p.updateTime)], refs: [{ col: 'users', id: p.id, expected: { notes: c.input.notes } }] };
}, ['Replaces the existing notes: read them first (profiles.get) and send the full new text.']);
// inviteByEmail()
def('invites.setRole', 'people:write', 'הגדרת תפקיד מראש למייל (יקבל אותו כשיירשם). guest מבטל', { email: { type: 'email', required: true }, role: en(['staff', 'manager', 'owner', 'guest'], 'staff מתנדב, manager מנהל, owner בעלים, guest ביטול ההגדרה', true) }, async (c) => {
  const e = c.input.email as string, role = c.input.role as string;
  if (role === 'guest') return { writes: [c.fs.remove('role_invites', e)], refs: [{ col: 'role_invites', id: e, gone: true }] };
  if ((role === 'owner' || role === 'manager') && !isOwner(c.caller)) throw forbidden('only the owner can pre-assign manager or owner');
  return {
    writes: [c.fs.set('role_invites', e, { email: e, role, createdBy: c.me, createdAt: nowIso() }), activity(c.fs, c.me, 'user', e, 'invited', `${e} הוגדר/ה מראש כ${ROLE_HE[role]}`)],
    refs: [{ col: 'role_invites', id: e, expected: { role } }],
  };
}, ['For someone who already has a profile, use people.setRole instead.']);

// ======================= events =======================

const DEFAULT_LOCATION = 'חוות רווה, ליד טנא עומרים';
/** firestore.rules storedPhoto(): the only https image the app's Rules accept is a link the Worker stored (POST /v1/files). */
export const STORED_FILE_RE = /^https:\/\/havat-ravve-api\.meniviner\.workers\.dev\/v1\/files\/(avatar|task|shopping|place|event|eventfile|stall)\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{32}\.(jpg|webp|png)$/;
/** An image field: "" (none) or a stored link. Never base64 through the API, never an outside link (the app could not save the record again). */
export function storedImage(field: string, v: unknown) {
  if (v === '' || v === null || v === undefined) return;
  if (typeof v !== 'string' || !STORED_FILE_RE.test(v)) throw invalid(field, `"${field}" must be a link the app stored (https://havat-ravve-api.meniviner.workers.dev/v1/files/...), or "" to remove it`);
}
/** N10 money(): "1,250 ₪". */
export const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₪`;
type Question = { id: string; label: string; required: boolean };
/** The event form's questions ({id, label, required}): a label that stays keeps its id, so the answers already given stay attached. */
function questionsOf(c: Ctx, old: unknown): Question[] | null {
  const labels = c.input.questions as string[] | null, req = c.input.questionsRequired as number[] | null;
  if (labels === null && req === null) return null;
  const prev = Array.isArray(old) ? (old as Question[]) : [];
  if (labels === null) {
    if (req!.some((n) => n >= prev.length)) throw invalid('questionsRequired', 'an index is past the event\'s questions');
    return prev.map((q, i) => ({ ...q, required: req!.includes(i) }));
  }
  if (req && req.some((n) => n >= labels.length)) throw invalid('questionsRequired', 'an index is past the questions sent');
  const used = new Set<string>();
  const base = Date.now();
  return labels.map((label, i) => {
    const same = prev.find((q) => q.label === label && !used.has(q.id));
    const id = same?.id || 'q' + (base + i).toString(36);
    used.add(id);
    return { id, label, required: req ? req.includes(i) : !!same?.required };
  });
}
const eventFields = (required: boolean): Record<string, Param> => ({
  title: str(200, 'שם האירוע', required, 1), description: str(8000, 'תיאור לאורחים'), location: str(300, 'מקום'),
  start: dt('התחלה, שעון ישראל', required), end: dt('סיום, שעון ישראל (יכול להיות ביום מאוחר יותר)', required), price: num(0, 100000, 'מחיר לכרטיס, 0 חינם'),
  maxPerOrder: { type: 'int', min: 1, max: 20, ...(required ? { default: 5 } : {}), he: 'עד כמה כרטיסים בהזמנה' }, capacity: { type: 'int', min: 0, max: 100000, ...(required ? { default: 0 } : {}), he: 'מקומות, 0 בלי הגבלה' },
  open: bool('פתוח להרשמה'), published: bool('מפורסם לאורחים'),
  entry: bool('כניסה בסריקה בשער (ברירת מחדל: כן)'), stall: bool('דוכן החווה (ברירת מחדל: כן)'),
  questions: { type: 'stringList', maxItems: 10, maxLength: 200, he: 'שאלות נוספות בהרשמה, לפי הסדר (מחליף את הרשימה; [] מסיר את כולן)' },
  questionsRequired: { type: 'intList', min: 0, max: 9, maxItems: 10, he: 'אילו שאלות חובה: המיקום שלהן ב־questions (מ־0)' },
  image: str(300, 'תמונה לדף האירוע: קישור שהאפליקציה שמרה (…/v1/files/event/…); "" מסיר'),
});
const EVENT_NOTES = [
  'start/end are Israel time "YYYY-MM-DDTHH:mm"; they are stored as ISO UTC ("…Z"), as the app stores them. An end on a later day is fine; it must be after the start.',
  'questions: the registration questions in order; questionsRequired: which of them are required (0-based). A question whose text stays keeps its id, so answers already given stay attached.',
  'image: only a link the app already stored (the API cannot upload bytes); "" removes it.',
];
/** ManageEvents.tsx save(): a published event has a calendar entry "event_<id>" (time "HH:mm–HH:mm"), an unpublished one none. */
function eventCalendar(c: Ctx, id: string, e: Record<string, unknown>): Write {
  if (!e.published) return c.fs.remove('calendar', `event_${id}`);
  return c.fs.set('calendar', `event_${id}`, { title: e.title, date: farmTime(String(e.start)).slice(0, 10), time: `${hhmm(String(e.start))}–${hhmm(String(e.end))}`, ownerUid: c.me.uid, ownerName: c.me.name, kind: 'event', refId: id, createdAt: nowIso() });
}
// saveEventV2() (src/app/v2/data/events.ts) -> saveEvent() (new) + upsertCalendarRef, with the fields of the N11 form
def('events.create', 'events:write', 'יצירת אירוע', eventFields(true), async (c) => {
  const i = c.input;
  const start = isoFromIL(i.start), end = isoFromIL(i.end);
  if (Date.parse(end) <= Date.parse(start)) throw invalid('end', 'end must be after start');
  storedImage('image', i.image);
  const id = autoId();
  const now = nowIso();
  const published = i.published ?? false;
  const e = {
    title: i.title, description: i.description || '', image: i.image || '', location: i.location ?? DEFAULT_LOCATION, start, end,
    price: i.price ?? 0, maxPerOrder: i.maxPerOrder, capacity: i.capacity, open: i.open ?? true, published,
    questions: questionsOf(c, []) || [], entry: i.entry ?? true, stall: i.stall ?? true, files: [],
    ...(published ? { publishedAt: now } : {}), createdBy: c.me, createdAt: now, updatedAt: now,
  };
  const writes = [c.fs.create('events', id, e), activity(c.fs, c.me, 'event', id, 'created', e.title, { eventId: id })];
  if (e.published) writes.push(eventCalendar(c, id, e));
  return { status: 201, writes, refs: [{ col: 'events', id, expected: { title: e.title, start: e.start, end: e.end, published: e.published } }], data: { eventId: id } };
}, ['Created as a draft unless published=true. Entry scanning and the farm stall are on unless sent false.', ...EVENT_NOTES]);
// saveEventV2() (existing) -> saveEvent() + upsert/deleteCalendarRef
def('events.update', 'events:write', 'עדכון אירוע, כולל פרסום/הסרה מפרסום ופתיחה/סגירה של הרשמה', { ifUpdatedAt: IF_UPDATED_AT as Param, eventId: req(), ...eventFields(false) }, async (c) => {
  const ev = await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  fresh(ev, c.input.ifUpdatedAt);
  const i = c.input;
  const patch: Record<string, unknown> = given(i, ['title', 'description', 'location', 'price', 'maxPerOrder', 'capacity', 'open', 'published', 'entry', 'stall', 'image']);
  if ('image' in patch) storedImage('image', patch.image);
  if (i.start !== null) patch.start = isoFromIL(i.start);
  if (i.end !== null) patch.end = isoFromIL(i.end);
  const questions = questionsOf(c, ev.data.questions);
  if (questions) patch.questions = questions;
  needSome(patch);
  // times older API writes left in farm time are stored as ISO UTC on the next edit, like the app's
  for (const k of ['start', 'end']) if (!(k in patch) && ev.data[k] && eventIso(ev.data[k]) !== ev.data[k]) patch[k] = eventIso(ev.data[k]);
  const next = { ...ev.data, ...patch };
  if (Date.parse(eventIso(next.end)) <= Date.parse(eventIso(next.start))) throw invalid('end', 'end must be after start');
  const action = patch.published !== undefined && patch.published !== !!ev.data.published ? (patch.published ? 'published' : 'unpublished') : 'edited';
  const now = nowIso();
  const publication = action === 'published' ? { publishedAt: now } : {};
  return {
    writes: [c.fs.patch('events', ev.id, { ...patch, ...publication, updatedAt: now }, ev.updateTime), activity(c.fs, c.me, 'event', ev.id, action, String(next.title), { eventId: ev.id }), eventCalendar(c, ev.id, next)],
    refs: [{ col: 'events', id: ev.id, expected: { ...patch, ...publication } }],
  };
}, ['Only the fields sent change.', ...EVENT_NOTES]);
// deleteEvent() + deleteCalendarRef
def('events.delete', 'events:delete', 'מחיקת אירוע', { ifUpdatedAt: IF_UPDATED_AT as Param, eventId: req() }, async (c) => {
  const ev = await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  fresh(ev, c.input.ifUpdatedAt);
  return {
    writes: [c.fs.remove('events', ev.id, ev.updateTime), activity(c.fs, c.me, 'event', ev.id, 'deleted', String(ev.data.title), { eventId: ev.id }), c.fs.remove('calendar', `event_${ev.id}`)],
    refs: [{ col: 'events', id: ev.id, gone: true }], data: { deleted: project('events', ev.id, ev.data) },
  };
}, ['Destructive: confirm with the user first. Its tickets stay (as in the app); to unpublish instead, use events.update published=false.']);
// events.setVendor and events.removeVendor: v2/vendors.ts (the redesign's per-event vendor record)
// saveProductV2() / setProductActive() (src/app/v2/data/events.ts), with the activity line N10 writes
def('events.saveProduct', 'events:write', 'הוספה או עדכון של מוצר בדוכן האירוע: שם, מחיר, יחידה, זמין למכירה', {
  eventId: req(), productId: opt('לעדכון מוצר קיים; בלי זה נוצר מוצר חדש'), name: str(200, 'שם המוצר (חובה במוצר חדש)', false, 1), price: num(0, 100000, 'מחיר (חובה במוצר חדש)'),
  unit: str(20, 'יחידת מכירה, למשל "כוס"; "" מסיר'), active: bool('זמין למכירה (במוצר חדש ברירת מחדל: כן)'), sort: num(0, 100000, 'סדר תצוגה (במוצר חדש: אחרי האחרונים)'),
}, async (c) => {
  const ev = await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  const col = `events/${ev.id}/products`;
  const i = c.input;
  const price = (n: number) => Math.round(n * 100) / 100;
  if (i.productId) {
    const p = await mustGet(c.fs, col, i.productId, c.tx, 'product');
    const patch: Record<string, unknown> = given(i, ['name', 'price', 'active', 'sort']);
    if ('price' in patch) patch.price = price(Number(patch.price));
    // an empty unit removes the field, as saving N10 with an empty unit does
    if (i.unit !== null) patch.unit = i.unit || undefined;
    needSome(patch);
    const onlyActive = Object.keys(patch).length === 1 && 'active' in patch;
    const writes: Write[] = [c.fs.patch(col, p.id, patch, p.updateTime)];
    if (!onlyActive) writes.push(activity(c.fs, c.me, 'event', ev.id, 'edited', `מוצר עודכן: ${patch.name ?? p.data.name} · ${money(Number(patch.price ?? p.data.price))}`, { eventId: ev.id }));
    return { writes, refs: [{ col, id: p.id, expected: Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }], data: { productId: p.id } };
  }
  if (i.name === null) throw invalid('name', 'name is required for a new product');
  if (i.price === null) throw invalid('price', 'price is required for a new product');
  const sort = i.sort ?? (await c.fs.query({ from: [{ collectionId: 'products' }], select: { fields: [{ fieldPath: 'sort' }] }, limit: 500 }, `events/${ev.id}`)).reduce((m, d) => Math.max(m, Number(d.data.sort) || 0), 0) + 1;
  const id = autoId();
  const data = { name: i.name, price: price(i.price), active: i.active ?? true, sort, ...(i.unit ? { unit: i.unit } : {}) };
  return {
    status: 201, writes: [c.fs.create(col, id, data), activity(c.fs, c.me, 'event', ev.id, 'edited', `מוצר חדש: ${data.name} · ${money(data.price)}`, { eventId: ev.id })],
    refs: [{ col, id, expected: data }], data: { productId: id },
  };
}, ['Only the fields sent change: unit, active and sort stay unless sent. active=false takes it off the stall.', 'To change the order of several products use events.reorderProducts.']);
// deleteProduct(), with the activity line N10 writes
def('events.deleteProduct', 'events:write', 'מחיקת מוצר מדוכן האירוע', { eventId: req(), productId: req() }, async (c) => {
  const col = `events/${c.input.eventId}/products`;
  const p = await mustGet(c.fs, col, c.input.productId, c.tx, 'product');
  return {
    writes: [c.fs.remove(col, p.id, p.updateTime), activity(c.fs, c.me, 'event', c.input.eventId, 'edited', `מוצר נמחק: ${p.data.name}`, { eventId: c.input.eventId })],
    refs: [{ col, id: p.id, gone: true }], data: { deleted: project(col, p.id, p.data) },
  };
}, ['Destructive: confirm with the user first. To stop selling it, use events.saveProduct active=false instead.']);

// ======================= tickets =======================

const PAY_SET = ['pending', 'claimed', 'paid', 'paid_onsite', 'free'];
async function orderTickets(c: Ctx, orderId: string) {
  const all = await whereEq(c.fs, 'tickets', { orderId });
  if (!all.length) throw notFound('order');
  // the app acts on the tickets of an order that are still valid
  const valid = all.filter((t) => t.data.status === 'valid');
  if (!valid.length) throw new ApiError('VALIDATION_FAILED', 'every ticket of this order is already cancelled', { field: 'orderId' });
  return valid;
}
// setOrderPayment() + handleNotificationsFor (approveOrders and M5 "שולם במקום" in src/app/v2/data/events.ts, event.tsx)
def('tickets.setOrderPayment', 'tickets:write', 'סימון תשלום על הזמנה שלמה (כל הכרטיסים שלה)', { orderId: req('orderId מתוך tickets.list'), paymentStatus: en(PAY_SET, 'paid שולם, paid_onsite שולם במקום, pending ממתין, claimed דווח שהועבר, free חינם', true) }, async (c) => {
  const list = await orderTickets(c, c.input.orderId);
  const now = nowIso();
  const t = list[0].data;
  const settled = c.input.paymentStatus === 'paid' || c.input.paymentStatus === 'paid_onsite';
  return {
    writes: [...list.map((x) => c.fs.patch('tickets', x.id, { paymentStatus: c.input.paymentStatus, updatedAt: now }, x.updateTime, paidStamp(c.input.paymentStatus))),
      activity(c.fs, c.me, 'ticket', c.input.orderId, 'paid', `${t.ownerName} · ${t.eventTitle} · ${Number(t.price) * list.length} ₪ · ${list.length} כרטיסים`, { subjectUid: String(t.ownerUid), eventId: String(t.eventId) }),
      ...(settled ? await closeNotifications(c, c.input.orderId) : [])],
    refs: list.map((x) => ({ col: 'tickets', id: x.id, expected: { paymentStatus: c.input.paymentStatus } })),
  };
}, ['Marking it paid or paid_onsite also closes the order\'s open items in the managers\' inbox (notifications), as approving in the app does.']);
// cancelOrder()
def('tickets.cancelOrder', 'tickets:write', 'ביטול הזמנה שלמה', { orderId: req(), reason: str(300, 'סיבת הביטול (תירשם בהיסטוריה)') }, async (c) => {
  const list = await orderTickets(c, c.input.orderId);
  const now = nowIso();
  const t = list[0].data;
  return {
    writes: [...list.map((x) => c.fs.patch('tickets', x.id, { status: 'cancelled', paymentStatus: 'cancelled', updatedAt: now }, x.updateTime)),
      activity(c.fs, c.me, 'ticket', c.input.orderId, 'cancelled', `${t.ownerName} · ${list.length} כרטיסים · ${t.eventTitle}${c.input.reason ? ' · "' + c.input.reason + '"' : ''}`, { subjectUid: String(t.ownerUid), eventId: String(t.eventId) })],
    refs: list.map((x) => ({ col: 'tickets', id: x.id, expected: { status: 'cancelled' } })),
  };
}, ['Destructive for the guest: confirm with the user first.']);
// setTicketPayment()
def('tickets.setPayment', 'tickets:write', 'סימון תשלום על כרטיס בודד', { ifUpdatedAt: IF_UPDATED_AT as Param, ticketId: req(), paymentStatus: en([...PAY_SET, 'cancelled'], 'מצב התשלום', true) }, async (c) => {
  const t = await mustGet(c.fs, 'tickets', c.input.ticketId, c.tx, 'ticket');
  fresh(t, c.input.ifUpdatedAt);
  return {
    writes: [c.fs.patch('tickets', t.id, { paymentStatus: c.input.paymentStatus, updatedAt: nowIso() }, t.updateTime, paidStamp(c.input.paymentStatus)),
      activity(c.fs, c.me, 'ticket', t.id, c.input.paymentStatus === 'cancelled' ? 'cancelled' : 'paid', `${t.data.ownerName} · ${t.data.eventTitle}`, { subjectUid: String(t.data.ownerUid), eventId: String(t.data.eventId) })],
    refs: [{ col: 'tickets', id: t.id, expected: { paymentStatus: c.input.paymentStatus } }],
  };
});
// cancelTicket()
def('tickets.cancel', 'tickets:write', 'ביטול כרטיס בודד', { ifUpdatedAt: IF_UPDATED_AT as Param, ticketId: req(), reason: str(300, 'סיבת הביטול') }, async (c) => {
  const t = await mustGet(c.fs, 'tickets', c.input.ticketId, c.tx, 'ticket');
  fresh(t, c.input.ifUpdatedAt);
  const d = t.data;
  return {
    writes: [c.fs.patch('tickets', t.id, { status: 'cancelled', paymentStatus: 'cancelled', updatedAt: nowIso() }, t.updateTime),
      activity(c.fs, c.me, 'ticket', t.id, 'cancelled', `${d.ownerName} · כרטיס ${d.index}/${d.total} · ${d.eventTitle}${c.input.reason ? ' · "' + c.input.reason + '"' : ''}`, { subjectUid: String(d.ownerUid), eventId: String(d.eventId) })],
    refs: [{ col: 'tickets', id: t.id, expected: { status: 'cancelled' } }],
  };
}, ['Destructive for the guest: confirm with the user first.']);

// ======================= stall tabs =======================

const round = (n: number) => Math.round(n * 100) / 100;
type TabItem = { productId: string; name: string; price: number; qty: number; at: string; by: Person };
const sum = (items: TabItem[]) => round(items.reduce((s, i) => s + i.price * i.qty, 0));
// openTab()
def('tabs.open', 'tabs:write', 'פתיחת חשבון בדוכן לאורח באירוע', {
  eventId: req(), guestUid: opt('אורח רשום (uid); אחרת guestName'), guestName: str(80, 'שם האורח, אם אינו רשום'), guestPhone: str(25, 'טלפון'), ticketId: opt('כרטיס האורח, אם יש'),
}, async (c) => {
  const ev = await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  stallOpen(c, ev.data);
  let guest = { uid: '', name: c.input.guestName || '', phone: c.input.guestPhone || '' };
  if (c.input.guestUid) {
    const u = await mustGet(c.fs, 'users', c.input.guestUid, c.tx, 'guest');
    guest = { uid: u.id, name: String(u.data.displayName || ''), phone: c.input.guestPhone || String(u.data.phone || '') };
  }
  if (!guest.name) throw invalid('guestName', 'guestUid or guestName is required');
  const id = autoId();
  const now = nowIso();
  const data = { eventId: ev.id, eventTitle: ev.data.title, guestUid: guest.uid, guestName: guest.name, guestPhone: guest.phone, ticketId: c.input.ticketId || '', items: [], total: 0, status: 'open', createdBy: c.me, createdAt: now, updatedAt: now };
  return { status: 201, writes: [c.fs.create('tabs', id, data), activity(c.fs, c.me, 'tab', id, 'opened', `${guest.name} · ${ev.data.title}`, { subjectUid: guest.uid, eventId: ev.id })], refs: [{ col: 'tabs', id, expected: { status: 'open', total: 0 } }], data: { tabId: id } };
}, ['After the event was closed (events.close) only managers can open a tab, as the app\'s Rules allow.']);
/** firestore.rules eventOpen(): once an event is closed, the crew's stall and gate writes stop; managers still settle and fix. */
export function stallOpen(c: Ctx, ev: Record<string, unknown>) {
  if (ev.closed && !isManager(c.caller)) throw forbidden('the event is closed: only managers can do this now (events.reopen opens it again)');
}
// addTabItems() via sellToTab() (src/app/v2/data/eventday.ts): one product, or a cart of several in one write
def('tabs.addItem', 'tabs:write', 'רישום מוצר (או כמה) שאורח לקח מהדוכן', {
  ifUpdatedAt: IF_UPDATED_AT as Param, tabId: req(), productId: opt('מוצר אחד, מתוך eventProducts.list של האירוע'), qty: { type: 'int', min: 1, max: 50, he: 'כמות (עם productId, ברירת מחדל 1)' },
  items: { type: 'stringList', maxItems: 20, maxLength: 260, he: 'כמה מוצרים בבת אחת: "<productId>" או "<productId>:<כמות>", במקום productId' },
}, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  fresh(tab, c.input.ifUpdatedAt);
  const ev = await mustGet(c.fs, 'events', String(tab.data.eventId), c.tx, 'event');
  stallOpen(c, ev.data);
  if (!!c.input.productId === !!c.input.items) throw invalid('productId', 'send productId (with qty) or items, not both');
  if (c.input.items && c.input.qty !== null) throw invalid('qty', 'with items, put the quantity in each item ("<productId>:<qty>")');
  const cart: [string, number][] = c.input.productId ? [[c.input.productId, c.input.qty ?? 1]] : (c.input.items as string[]).map((s) => {
    const m = /^([A-Za-z0-9_-]{1,200})(?::(\d{1,2}))?$/.exec(s);
    const q = Number(m?.[2] ?? 1);
    if (!m || q < 1 || q > 50) throw invalid('items', `"${s}" is not "<productId>" or "<productId>:<qty 1-50>"`);
    return [m[1], q];
  });
  if (!cart.length) throw invalid('items', 'items is empty');
  // each line gets its own moment, so two identical products added together stay two lines (addTabItems)
  const base = Date.now();
  const added: TabItem[] = [];
  for (const [k, [pid, qty]] of cart.entries()) {
    const p = await mustGet(c.fs, `events/${tab.data.eventId}/products`, pid, c.tx, 'product');
    // the stall screen only offers active products; an inactive one is not for sale
    if (p.data.active === false) throw invalid(c.input.productId ? 'productId' : 'items', `product ${pid} is not active (not for sale)`);
    added.push({ productId: p.id, name: String(p.data.name), price: Number(p.data.price), qty, at: new Date(base + k).toISOString(), by: c.me });
  }
  const items = [...((tab.data.items as TabItem[]) || []), ...added];
  return {
    writes: [c.fs.patch('tabs', tab.id, { items, total: sum(items), updatedAt: nowIso() }, tab.updateTime),
      activity(c.fs, c.me, 'tab', tab.id, 'item', `${tab.data.guestName}: ${added.map((i) => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')} · ${sum(added)} ₪`, { subjectUid: String(tab.data.guestUid), eventId: String(tab.data.eventId) })],
    refs: [{ col: 'tabs', id: tab.id, expected: { total: sum(items) } }],
  };
}, ['After the event was closed (events.close) only managers can add, as the app\'s Rules allow.']);
// removeTabItem()
def('tabs.removeItem', 'tabs:write', 'הסרת פריט מחשבון בדוכן', { ifUpdatedAt: IF_UPDATED_AT as Param, tabId: req(), index: { type: 'int', min: 0, max: 499, required: true, he: 'מיקום הפריט ברשימת items (מ־0)' }, reason: str(300, 'סיבה') }, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  fresh(tab, c.input.ifUpdatedAt);
  stallOpen(c, (await mustGet(c.fs, 'events', String(tab.data.eventId), c.tx, 'event')).data);
  const cur = (tab.data.items as TabItem[]) || [];
  if (c.input.index >= cur.length) throw invalid('index', 'no item at this index');
  const items = cur.filter((_, i) => i !== c.input.index);
  return {
    writes: [c.fs.patch('tabs', tab.id, { items, total: sum(items), updatedAt: nowIso() }, tab.updateTime),
      activity(c.fs, c.me, 'tab', tab.id, 'removed', `${tab.data.guestName}: ${cur[c.input.index].name}${c.input.reason ? ' · "' + c.input.reason + '"' : ''}`, { subjectUid: String(tab.data.guestUid), eventId: String(tab.data.eventId) })],
    refs: [{ col: 'tabs', id: tab.id, expected: { total: sum(items) } }],
  };
});
// setTabStatus() (+ handleNotificationsFor when paid: approveTab in src/app/v2/data/events.ts)
def('tabs.setStatus', 'tabs:settle', 'סגירת חשבון בדוכן: שולם, נמחל, או חזרה לפתוח', { ifUpdatedAt: IF_UPDATED_AT as Param, tabId: req(), status: en(['open', 'claimed', 'paid', 'waived'], 'paid שולם, waived נמחל, open פתוח, claimed דווח שהועבר', true), note: str(300, 'הערה') }, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  fresh(tab, c.input.ifUpdatedAt);
  const s = c.input.status as string;
  const d = tab.data;
  return {
    writes: [c.fs.patch('tabs', tab.id, { status: s, updatedAt: nowIso() }, tab.updateTime, paidStamp(s)),
      activity(c.fs, c.me, 'tab', tab.id, s === 'paid' ? 'paid' : s === 'waived' ? 'waived' : 'edited', `${d.guestName} · ${d.total} ₪ · ${d.eventTitle}${c.input.note ? ' · "' + c.input.note + '"' : ''}`, { subjectUid: String(d.guestUid), eventId: String(d.eventId) }),
      ...(s === 'paid' ? await closeNotifications(c, tab.id) : [])],
    refs: [{ col: 'tabs', id: tab.id, expected: { status: s } }],
  };
}, ['paid also closes the tab\'s open items in the managers\' inbox (notifications), as approving in the app does.']);

// ======================= visits & donations =======================

/** handleNotificationsFor(): closes every open notification that points at this record. */
async function closeNotifications(c: Ctx, refId: string): Promise<Write[]> {
  const open = await whereEq(c.fs, 'notifications', { refId, handled: false });
  const now = nowIso();
  return open.map((n) => c.fs.patch('notifications', n.id, { handled: true, handledBy: c.me, handledAt: now }));
}
// decideVisit() (src/app/data.ts): the status, the calendar entry and the inbox items in one commit
def('visits.setStatus', 'visits:write', 'אישור, דחייה או ביטול של בקשת ביקור', { ifUpdatedAt: IF_UPDATED_AT as Param,
  visitId: req(), status: en(['approved', 'rejected', 'cancelled', 'new'], 'approved אושר, rejected לא מתאים, cancelled בוטל, new החזרה לחדש', true),
  managerNote: str(2000, 'הערה למבקר (מחליף את הקיימת)'), time: { type: 'time', format: 'HH:mm', timezone: 'Asia/Jerusalem', he: 'שעת הביקור ליומן' },
}, async (c) => {
  const v = await mustGet(c.fs, 'visits', c.input.visitId, c.tx, 'visit');
  fresh(v, c.input.ifUpdatedAt);
  const note = c.input.managerNote ?? String(v.data.managerNote || '');
  const st = c.input.status as string;
  // the visit screen takes the hour from the note (timeFromNote); an explicit time wins
  const m = note.match(/(\d{1,2}):(\d{2})/);
  const time = c.input.time || (m ? `${m[1].padStart(2, '0')}:${m[2]}` : '');
  const now = nowIso();
  const writes: Write[] = [
    c.fs.patch('visits', v.id, { status: st, managerNote: note, handledBy: c.me, updatedAt: now }, v.updateTime),
    activity(c.fs, c.me, 'visit', v.id, st, `${v.data.name} · ${v.data.date}${time ? ' · ' + time : ''}${note ? ' · ' + note : ''}`, { subjectUid: String(v.data.uid) }),
  ];
  if (st === 'approved') writes.push(c.fs.set('calendar', `visit_${v.id}`, { title: `ביקור: ${v.data.name} · ${v.data.people}`, date: v.data.date, time, ownerUid: c.me.uid, ownerName: c.me.name, kind: 'visit', refId: v.id, createdAt: now }));
  else writes.push(c.fs.remove('calendar', `visit_${v.id}`));
  // back to "new": its inbox items return to the queue; any other decision closes them
  if (st === 'new') writes.push(...(await whereEq(c.fs, 'notifications', { refId: v.id, handled: true })).map((n) => c.fs.patch('notifications', n.id, { handled: false, handledBy: null, handledAt: null })));
  else writes.push(...await closeNotifications(c, v.id));
  return { writes, refs: [{ col: 'visits', id: v.id, expected: { status: st } }] };
}, ['Approving adds the visit to the calendar (time = "time", else the first HH:mm in the note); any other status removes it. Approve/reject/cancel close its inbox items; "new" puts them back in the queue. The guest is not messaged automatically.']);
// setDonation() (payment) + handleNotificationsFor
def('donations.setPayment', 'donations:write', 'אישור תשלום תרומה (או שינוי מצב התשלום)', { ifUpdatedAt: IF_UPDATED_AT as Param, donationId: req(), paymentStatus: en(['paid', 'pending', 'claimed', 'cancelled'], 'paid שולם, pending ממתין, claimed דווח שהועבר, cancelled בוטל', true) }, async (c) => {
  const d = await mustGet(c.fs, 'donations', c.input.donationId, c.tx, 'donation');
  fresh(d, c.input.ifUpdatedAt);
  const ps = c.input.paymentStatus as string;
  const writes: Write[] = [c.fs.patch('donations', d.id, { paymentStatus: ps, updatedAt: nowIso() }, d.updateTime, paidStamp(ps)),
    activity(c.fs, c.me, 'donation', d.id, ps === 'paid' ? 'paid' : 'edited', `${d.data.name} · ${d.data.amount} ₪`, { subjectUid: String(d.data.uid) })];
  if (ps === 'paid') writes.push(...await closeNotifications(c, d.id));
  return { writes, refs: [{ col: 'donations', id: d.id, expected: { paymentStatus: ps } }] };
});
// setDonation() (receipt)
def('donations.setReceiptSent', 'donations:write', 'סימון שהקבלה על התרומה נשלחה', { ifUpdatedAt: IF_UPDATED_AT as Param, donationId: req(), sent: bool('false מבטל את הסימון', true) }, async (c) => {
  const d = await mustGet(c.fs, 'donations', c.input.donationId, c.tx, 'donation');
  fresh(d, c.input.ifUpdatedAt);
  return {
    writes: [c.fs.patch('donations', d.id, { receiptSent: c.input.sent, updatedAt: nowIso() }, d.updateTime),
      activity(c.fs, c.me, 'donation', d.id, c.input.sent ? 'receipt' : 'edited', `${d.data.name} · ${d.data.amount} ₪`, { subjectUid: String(d.data.uid) })],
    refs: [{ col: 'donations', id: d.id, expected: { receiptSent: c.input.sent } }],
  };
}, ['This only records that a receipt was sent; it does not send one.']);

// ======================= vendors =======================
// vendors.create / update / delete: v2/vendors.ts (the redesign's vendor pool: private team notes, people, cascade on delete)

// ======================= notifications & calendar =======================

// handleNotification()
def('notifications.setHandled', 'notifications:write', 'סימון התראה כטופלה (או החזרה לתור)', { notificationId: req(), handled: bool('false מחזיר לתור', true) }, async (c) => {
  const n = await mustGet(c.fs, 'notifications', c.input.notificationId, c.tx, 'notification');
  const patch = c.input.handled ? { handled: true, handledBy: c.me, handledAt: nowIso() } : { handled: false, handledBy: null, handledAt: null };
  return { writes: [c.fs.patch('notifications', n.id, patch, n.updateTime)], refs: [{ col: 'notifications', id: n.id, expected: { handled: c.input.handled } }] };
});
// calendar.create / calendar.update / calendar.delete: api/src/v2/farm.ts (saveCalItem, with hours, audience, participants and the reminder)

// ======================= settings =======================

/** DEFAULT_SETTINGS in src/app/types.ts: what useSettings() shows when a field was never saved. */
export const DEFAULT_SETTINGS = {
  donationPresets: [{ amount: 18, label: 'חי' }, { amount: 180, label: 'עשר פעמים חי' }, { amount: 360, label: 'לב' }],
  visitTypes: ['סיור בחווה', 'מפגש קבוצתי', 'אירוע פרטי', 'אחר'],
  payment: { bit: '', paybox: '', cash: true, note: '' },
  contact: { whatsapp: '', phone: '' },
  templates: {
    visitApproved: 'שלום [שם], הביקור בחוות רווה ב־[תאריך] מאושר. נשמח לראותכם!',
    donationThanks: 'שלום [שם], תודה רבה על התרומה לחוות רווה.',
    debtReminder: 'שלום [שם], תודה שהייתם ב־[אירוע]. נשאר לתשלום [סכום] ₪. אפשר להעביר בביט או ב־PayBox. תודה!',
    ticketReminder: 'שלום [שם], מזכירים: [אירוע] מתקיים ב־[תאריך]. הכרטיסים באפליקציה: https://havat-ravve.web.app/app/me',
    vendorInvite: 'שלום [שם], נשמח שתגיעו עם דוכן ל־[אירוע] ב־[תאריך] בחוות רווה. מתאים?',
    paymentConfirmation: 'שלום [שם], קיבלנו את התשלום בסך [סכום] עבור [עבור]. תודה מחוות רווה!',
  },
  registrationFields: [],
  guestIntro: 'ברוכים הבאים לחוות רווה. כאן מזמינים כרטיסים לאירועים, מתאמים ביקור ותורמים.',
};
/** donationOptionsOf() / contactMoreOf() (src/app/v2/data/manage.ts): the optional manage-screen keys, all on / empty by default. */
const DEFAULT_EXTRA = { donationOptions: { custom: true, memorial: true, receipt: true }, contactMore: { email: '', address: '', inquiries: true } };
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** useSettings(): the stored document over the defaults, with payment, templates and contact merged field by field (plus the manage screens' optional keys). */
export function mergedSettings(stored: Record<string, unknown> | null) {
  const s = stored || {};
  return {
    ...DEFAULT_SETTINGS, ...s,
    payment: { ...DEFAULT_SETTINGS.payment, ...obj(s.payment) }, templates: { ...DEFAULT_SETTINGS.templates, ...obj(s.templates) }, contact: { ...DEFAULT_SETTINGS.contact, ...obj(s.contact) },
    donationOptions: { ...DEFAULT_EXTRA.donationOptions, ...obj(s.donationOptions) }, contactMore: { ...DEFAULT_EXTRA.contactMore, ...obj(s.contactMore) },
  } as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
/**
 * saveSettingsPart(): write.merge('settings', 'app', patch). A map section merges into the stored one key by key, a list or a
 * text replaces it, and nothing else in the document changes (so a manager's save never touches the owner's payment details).
 */
export function settingsMerge(c: Ctx, cur: { data: Record<string, unknown>; updateTime?: string } | null, patch: Record<string, unknown>): Write {
  if (!cur) return c.fs.set('settings', 'app', patch);
  const next = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? { ...obj(cur.data[k]), ...(v as object) } : v]));
  return c.fs.patch('settings', 'app', next, cur.updateTime);
}
/** numberOk() in the manage screens and the settings rule: '' or 9 to 15 digits. */
const numberOk = (v: string) => v.length <= 25 && (v === '' || /^[+]?([() .-]*[0-9]){9,15}[() .-]*$/.test(v));
const TEMPLATE_KEYS: Record<string, [string, string]> = {
  msgVisitApproved: ['visitApproved', 'אישור ביקור'], msgDonationThanks: ['donationThanks', 'תודה על תרומה'], msgDebtReminder: ['debtReminder', 'תזכורת חוב'],
  msgPaymentConfirmation: ['paymentConfirmation', 'אישור תשלום'], msgTicketReminder: ['ticketReminder', 'תזכורת לאירוע'], msgVendorInvite: ['vendorInvite', 'הזמנת בעל דוכן'],
};
// saveSettings() (src/app/v2/data/manage.ts) for every settings page: N6 payment, N7 messages, G1 amounts, G2 visit types, G4 contact
def('settings.update', 'settings:write', 'עדכון הגדרות: פרטי תשלום, הודעות מוכנות ופתיח, סכומי תרומה, סוגי ביקור, פרטי קשר', {
  guestIntro: str(2000, 'משפט הפתיחה לאורחים'), visitTypes: { type: 'stringList', maxItems: 20, maxLength: 100, he: 'סוגי ביקור, בסדר שהאורח רואה (מחליף את הרשימה)' },
  paymentBit: str(25, 'מספר לביט; "" מכבה את ביט (המספר נשמר בצד). בעלים בלבד'), paymentPaybox: str(300, 'קישור לקבוצת PayBox; "" מכבה. בעלים בלבד'),
  paymentCash: bool('מזומן בשער. בעלים בלבד'), paymentNote: str(300, 'השורה שהאורח רואה ליד התשלום. בעלים בלבד'),
  donationPresets: { type: 'stringList', maxItems: 12, maxLength: 120, he: 'סכומי תרומה, כל אחד "סכום|תווית" למשל "180|עשר פעמים חי" (מחליף את הרשימה). בעלים בלבד' },
  donationCustom: bool('לאפשר "סכום אחר". בעלים בלבד'), donationMemorial: bool('שדה הנצחה. בעלים בלבד'), donationReceipt: bool('בקשת קבלה. בעלים בלבד'),
  msgVisitApproved: str(2000, 'הודעה מוכנה: אישור ביקור'), msgDonationThanks: str(2000, 'הודעה מוכנה: תודה על תרומה'), msgDebtReminder: str(2000, 'הודעה מוכנה: תזכורת חוב'),
  msgPaymentConfirmation: str(2000, 'הודעה מוכנה: אישור תשלום'), msgTicketReminder: str(2000, 'הודעה מוכנה: תזכורת לאירוע'), msgVendorInvite: str(2000, 'הודעה מוכנה: הזמנת בעל דוכן'),
  contactPhone: str(25, 'טלפון החווה (9 עד 15 ספרות, "" ריק)'), contactWhatsapp: str(25, 'וואטסאפ החווה'), contactEmail: str(200, 'מייל לפניות'), contactAddress: str(300, 'כתובת'),
  contactInquiries: bool('לקבל פניות מהאתר'),
}, async (c) => {
  const i = c.input;
  const has = (k: string) => i[k] !== null && i[k] !== undefined;
  needSome(given(i, Object.keys(i)));
  const cur = await c.fs.get('settings', 'app', c.tx);
  const s = mergedSettings(cur?.data ?? null);
  const patch: Record<string, unknown> = {};
  const what: string[] = [];
  // N6: payment details are the owner's (firestore.rules settings: only an owner changes `payment`)
  if (['paymentBit', 'paymentPaybox', 'paymentCash', 'paymentNote'].some(has)) {
    if (!isOwner(c.caller)) throw forbidden('only the owner can change payment details');
    // paymentForm() / paymentPatch(): a switched-off number is kept aside in bitNumber / payboxLink
    const p = s.payment as Record<string, unknown>;
    let bit = String(p.bit || p.bitNumber || ''), bitOn = !!p.bit, paybox = String(p.paybox || p.payboxLink || ''), payboxOn = !!p.paybox;
    if (has('paymentBit')) { bitOn = !!i.paymentBit; if (i.paymentBit) bit = i.paymentBit; }
    if (has('paymentPaybox')) { payboxOn = !!i.paymentPaybox; if (i.paymentPaybox) paybox = i.paymentPaybox; }
    if (bitOn && !numberOk(bit)) throw invalid('paymentBit', 'the Bit number must have 9 to 15 digits');
    patch.payment = { bit: bitOn ? bit : '', paybox: payboxOn ? paybox : '', cash: has('paymentCash') ? i.paymentCash : p.cash !== false, note: has('paymentNote') ? i.paymentNote : String(p.note || ''), bitNumber: bit, payboxLink: paybox };
    what.push('פרטי התשלום עודכנו');
  }
  // N7: the edited card is saved over the whole templates map, as the screen does
  const tpl = Object.entries(TEMPLATE_KEYS).filter(([k]) => has(k));
  if (tpl.length) {
    patch.templates = { ...s.templates, ...Object.fromEntries(tpl.map(([k, [f]]) => [f, i[k]])) };
    for (const [, [, t]] of tpl) what.push(`הודעה מוכנה עודכנה: ${t}`);
  }
  if (has('guestIntro')) { patch.guestIntro = i.guestIntro; what.push('הודעה מוכנה עודכנה: משפט פתיחה לאורחים'); }
  // G1 (an owner's page): the amounts and the three options are saved together
  if (['donationPresets', 'donationCustom', 'donationMemorial', 'donationReceipt'].some(has)) {
    if (!isOwner(c.caller)) throw forbidden('only the owner can change the donation amounts');
    let presets = s.donationPresets as { amount: number; label: string }[];
    if (has('donationPresets')) {
      presets = (i.donationPresets as string[]).map((row) => {
        const [a, ...rest] = row.split('|');
        const amount = Math.round(Number(a.replace(/[^\d.]/g, '')));
        if (!(amount > 0 && amount <= 1000000)) throw invalid('donationPresets', `"${row}": the amount must be a whole number above 0`);
        return { amount, label: rest.join('|').trim() };
      });
    }
    const opts = { ...s.donationOptions, ...given(i, ['donationCustom', 'donationMemorial', 'donationReceipt']) } as Record<string, boolean>;
    const options = { custom: opts.donationCustom ?? opts.custom, memorial: opts.donationMemorial ?? opts.memorial, receipt: opts.donationReceipt ?? opts.receipt };
    if (!presets.length && !options.custom) throw invalid('donationPresets', 'at least one amount, or "סכום אחר" (donationCustom)');
    patch.donationPresets = presets; patch.donationOptions = options;
    what.push('סכומי התרומה עודכנו');
  }
  if (has('visitTypes')) { patch.visitTypes = [...new Set(i.visitTypes as string[])]; what.push('סוגי הביקור עודכנו'); }
  // G4: contact (phone/whatsapp, the rule's two keys) and contactMore are saved together
  if (['contactPhone', 'contactWhatsapp', 'contactEmail', 'contactAddress', 'contactInquiries'].some(has)) {
    const contact = { phone: has('contactPhone') ? i.contactPhone : String(s.contact.phone || ''), whatsapp: has('contactWhatsapp') ? i.contactWhatsapp : String(s.contact.whatsapp || '') };
    if (!numberOk(contact.phone)) throw invalid('contactPhone', 'a phone number has 9 to 15 digits');
    if (!numberOk(contact.whatsapp)) throw invalid('contactWhatsapp', 'a WhatsApp number has 9 to 15 digits');
    const more = { email: has('contactEmail') ? i.contactEmail : String(s.contactMore.email || ''), address: has('contactAddress') ? i.contactAddress : String(s.contactMore.address || ''), inquiries: has('contactInquiries') ? i.contactInquiries : s.contactMore.inquiries !== false };
    if (more.email && !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(more.email)) throw invalid('contactEmail', 'not a valid email');
    patch.contact = contact; patch.contactMore = more;
    what.push('פרטי הקשר עודכנו');
  }
  return {
    writes: [settingsMerge(c, cur, patch), activity(c.fs, c.me, 'settings', 'app', 'saved', what.join(' · '))],
    refs: [{ col: 'settings', id: 'app', expected: Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v !== 'object' || Array.isArray(v))) }], data: { saved: Object.keys(patch) },
  };
}, [
  'Send only what changes: each page\'s section is saved as the app saves it (payment, templates, donationPresets+donationOptions, visitTypes, contact+contactMore) and the rest of the settings stay as they are.',
  'Payment details and donation amounts: owner only. Message templates use [שם], [תאריך], [שעה], [אירוע], [סכום] as placeholders.',
  'Registration questions: settings.saveQuestion / settings.removeQuestion / settings.reorderQuestions.',
  'donationPresets replaces the whole list; each entry is "amount|label" (e.g. "180|עשר פעמים חי"). An entry without "|label" saves an empty label, so to restore, send every amount with its label as settings.get returned them.',
  'Saving the payment section always writes bitNumber and payboxLink (empty when off), as the app does.',
]);
