// Every other action of the app. Each one writes exactly what the app's function writes (named in its
// comment, in src/app/store.ts or src/app/data.ts), including the activity record and side effects such as
// the calendar entry or closing notifications, but atomically in one transaction with an idempotency key.
import { ApiError, invalid } from './http';
import type { Caller, Scope } from './auth';
import type { Operation, Param } from './catalog';
import type { Firestore, Write } from './firestore';
import {
  type Person, type Ref, IF_UPDATED_AT, activity, forbidden, fresh, idempotent, isManager, isOwner, mustGet, notFound, nowIso, project, readBackRefs, whereEq,
} from './core';
import { autoId } from './util';

type Input = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = { fs: Firestore; caller: Caller; me: Person; input: Input; tx: string };
type Out = { writes: Write[]; refs: Ref[]; data?: Record<string, unknown>; status?: number };
export type WriteDef = { op: Operation; run: (fs: Firestore, caller: Caller, input: Input, key: string | null) => Promise<{ status: number; data: Record<string, unknown>; replayed: boolean }> };

const DEFS: WriteDef[] = [];
function def(name: string, scope: Scope, he: string, body: Record<string, Param>, fn: (c: Ctx) => Promise<Out>, notes: string[] = []) {
  const op: Operation = { name, kind: 'write', idempotency: 'required', he, method: 'POST', path: `/v1/actions/${name}`, body, requiredScope: scope, notes: [...notes, 'Response: "record" (or "records") read back after the write, and "verified".'] };
  DEFS.push({
    op,
    run: (fs, caller, input, key) => idempotent(fs, caller, name, key, input, async (tx) => {
      const r = await fn({ fs, caller, me: caller.actor.person, input, tx });
      return { writes: r.writes, status: r.status, data: { ...(r.data || {}), refs: r.refs } };
    }, readBackRefs(fs)),
  });
}
export const WRITE_DEFS = DEFS;

// ---------- parameter helpers ----------
const str = (max: number, he?: string, required = false, min = 0): Param => ({ type: 'string', max, min, required, he });
const req = (he?: string): Param => ({ type: 'id', required: true, he });
const opt = (he?: string): Param => ({ type: 'id', he });
const bool = (he?: string, dflt?: boolean): Param => ({ type: 'bool', he, ...(dflt === undefined ? {} : { default: dflt }) });
const date = (he: string, required = false): Param => ({ type: 'date', format: 'YYYY-MM-DD', timezone: 'Asia/Jerusalem', required, he });
const dt = (he: string, required = false): Param => ({ type: 'datetime', format: 'YYYY-MM-DDTHH:mm', timezone: 'Asia/Jerusalem', required, he });
const en = (values: string[], he: string, required = false, dflt?: string): Param => ({ type: 'enum', values, he, required, ...(dflt ? { default: dflt } : {}) });
const num = (min: number, max: number, he: string, required = false, dflt?: number): Param => ({ type: 'number', min, max, he, required, ...(dflt === undefined ? {} : { default: dflt }) });

/** Only the fields the caller actually sent (validate() fills the rest with null). */
const given = (input: Input, keys: string[]) => Object.fromEntries(keys.filter((k) => input[k] !== null && input[k] !== undefined).map((k) => [k, input[k]]));
function needSome(patch: Record<string, unknown>) { if (!Object.keys(patch).length) throw invalid('body', 'nothing to change: send at least one field'); }
const taskText = (t: { title: unknown }) => { const s = String(t.title); return s.length > 60 ? s.slice(0, 60) + '…' : s; };
const ROLE_HE: Record<string, string> = { owner: 'בעלים', manager: 'מנהל/ת', staff: 'מתנדב/ת', guest: 'אורח/ת' };
const hhmm = (s: string) => s.slice(11, 16);

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
  return { lat: p.data.lat, lng: p.data.lng, placeId: p.id, placeName: p.data.name };
}

// editTask()
def('tasks.edit', 'tasks:edit', 'עריכת משימה: כותרת, הערה, תאריך יעד, דחיפות, מיקום, למנהלים בלבד', { ifUpdatedAt: IF_UPDATED_AT as Param,
  taskId: req(), title: str(200, 'כותרת', false, 1), note: str(4000, 'הערה'), dueDate: date('תאריך יעד'), clearDueDate: bool('true מסיר את תאריך היעד'),
  urgent: bool('דחוף'), managersOnly: bool('למנהלים בלבד (רק מנהל)'), placeId: opt('מקום מתוך places.list'), clearPlace: bool('true מסיר את המיקום'),
}, async (c) => {
  const t = await taskFor(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  ownsTask(c, t);
  const patch: Record<string, unknown> = given(c.input, ['title', 'note', 'dueDate', 'urgent', 'managersOnly']);
  if (c.input.clearDueDate) patch.dueDate = '';
  if ('managersOnly' in patch && !isManager(c.caller)) throw forbidden('only managers can make a task manager-only');
  if (c.input.placeId) patch.location = await placeLocation(c, c.input.placeId);
  if (c.input.clearPlace) patch.location = null;
  needSome(patch);
  const onlyUrgent = Object.keys(patch).length === 1 && 'urgent' in patch;
  const writes = [c.fs.patch('tasks', t.id, { ...patch, updatedAt: nowIso() }, t.updateTime)];
  if (onlyUrgent && patch.urgent !== !!t.data.urgent) writes.push(activity(c.fs, c.me, 'task', t.id, patch.urgent ? 'urgent' : 'edited', `${patch.urgent ? 'סומנה דחוף: ' : 'הורד הדחוף: '}${taskText(t.data as { title: string })}`));
  else if (!onlyUrgent) writes.push(activity(c.fs, c.me, 'task', t.id, 'edited', taskText({ title: patch.title ?? t.data.title })));
  return { writes, refs: [{ col: 'tasks', id: t.id, expected: patch }] };
});

// setTaskDoneDetails()
def('tasks.setDoneNote', 'tasks:complete', 'הערת ביצוע למשימה (מה נעשה)', { ifUpdatedAt: IF_UPDATED_AT as Param, taskId: req(), note: str(2000, 'ההערה', true) }, async (c) => {
  const t = await taskFor(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  const writes = [c.fs.patch('tasks', t.id, { doneNote: c.input.note, updatedAt: nowIso() }, t.updateTime),
    activity(c.fs, c.me, 'task', t.id, 'note', `${taskText(t.data as { title: string })}${c.input.note ? ': ' + c.input.note : ''}`)];
  return { writes, refs: [{ col: 'tasks', id: t.id, expected: { doneNote: c.input.note } }] };
});

// deleteTask()
def('tasks.delete', 'tasks:edit', 'מחיקת משימה', { ifUpdatedAt: IF_UPDATED_AT as Param, taskId: req() }, async (c) => {
  const t = await taskFor(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  ownsTask(c, t);
  return { writes: [c.fs.remove('tasks', t.id, t.updateTime), activity(c.fs, c.me, 'task', t.id, 'deleted', taskText(t.data as { title: string }))], refs: [{ col: 'tasks', id: t.id, gone: true }], data: { deleted: project('tasks', t.id, t.data) } };
}, ['Destructive: confirm with the user first. "deleted" holds the task as it was.']);

// ======================= recurring templates =======================

const templateBody = (required: boolean): Record<string, Param> => ({
  title: str(200, 'כותרת', required, 1), note: str(4000, 'הערה'),
  days: { type: 'intList', min: 0, max: 6, maxItems: 7, he: 'ימים בשבוע: 0 ראשון … 6 שבת. רשימה ריקה = כל יום' },
  time: { type: 'time', format: 'HH:mm', timezone: 'Asia/Jerusalem', he: 'שעה' }, active: bool('פעילה'), managersOnly: bool('למנהלים בלבד'),
});
// saveTemplate() (new)
def('templates.create', 'templates:write', 'יצירת משימה קבועה (חוזרת)', templateBody(true), async (c) => {
  const id = autoId();
  const now = nowIso();
  const data = { title: c.input.title, note: c.input.note || '', days: c.input.days || [], time: c.input.time || '', active: c.input.active ?? true, managersOnly: c.input.managersOnly ?? false, createdBy: c.me, createdAt: now, updatedAt: now };
  return { status: 201, writes: [c.fs.create('task_templates', id, data)], refs: [{ col: 'task_templates', id, expected: { title: data.title, days: data.days, active: data.active } }], data: { templateId: id } };
}, ['The app creates the day\'s task from active templates when someone opens it that day.']);
// saveTemplate() (existing)
def('templates.update', 'templates:write', 'עדכון משימה קבועה', { ifUpdatedAt: IF_UPDATED_AT as Param, templateId: req(), ...templateBody(false) }, async (c) => {
  const t = await mustGet(c.fs, 'task_templates', c.input.templateId, c.tx, 'template');
  fresh(t, c.input.ifUpdatedAt);
  const patch = given(c.input, ['title', 'note', 'days', 'time', 'active', 'managersOnly']);
  needSome(patch);
  return { writes: [c.fs.patch('task_templates', t.id, { ...patch, updatedAt: nowIso() }, t.updateTime)], refs: [{ col: 'task_templates', id: t.id, expected: patch }] };
});
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
def('shopping.delete', 'shopping:write', 'מחיקת פריט מרשימת הקניות', { ifUpdatedAt: IF_UPDATED_AT as Param, itemId: req() }, async (c) => {
  const it = await mustGet(c.fs, 'shopping', c.input.itemId, c.tx, 'shopping item');
  fresh(it, c.input.ifUpdatedAt);
  return { writes: [c.fs.remove('shopping', it.id, it.updateTime), activity(c.fs, c.me, 'shopping', it.id, 'deleted', String(it.data.title))], refs: [{ col: 'shopping', id: it.id, gone: true }], data: { deleted: project('shopping', it.id, it.data) } };
}, ['Destructive: confirm with the user first. To mark it bought, use shopping.setBought instead.']);

// ======================= places =======================

// addPlace()
def('places.add', 'places:write', 'הוספת מקום בחווה', { name: str(120, 'שם', true, 1), lat: num(-90, 90, 'קו רוחב', true), lng: num(-180, 180, 'קו אורך', true) }, async (c) => {
  const id = autoId();
  const data = { name: c.input.name, lat: c.input.lat, lng: c.input.lng, createdBy: c.me, createdAt: nowIso() };
  return { status: 201, writes: [c.fs.create('places', id, data), activity(c.fs, c.me, 'place', id, 'created', data.name)], refs: [{ col: 'places', id, expected: { name: data.name } }], data: { placeId: id } };
});
// updatePlace()
def('places.update', 'places:write', 'עדכון מקום', { placeId: req(), name: str(120, 'שם', false, 1), lat: num(-90, 90, 'קו רוחב'), lng: num(-180, 180, 'קו אורך') }, async (c) => {
  const p = await mustGet(c.fs, 'places', c.input.placeId, c.tx, 'place');
  const patch = given(c.input, ['name', 'lat', 'lng']);
  needSome(patch);
  return { writes: [c.fs.patch('places', p.id, patch, p.updateTime)], refs: [{ col: 'places', id: p.id, expected: patch }] };
});
// deletePlace()
def('places.delete', 'places:write', 'מחיקת מקום', { placeId: req() }, async (c) => {
  const p = await mustGet(c.fs, 'places', c.input.placeId, c.tx, 'place');
  return { writes: [c.fs.remove('places', p.id, p.updateTime)], refs: [{ col: 'places', id: p.id, gone: true }], data: { deleted: project('places', p.id, p.data) } };
}, ['Destructive: confirm with the user first.']);

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
      activity(c.fs, c.me, 'user', p.id, 'role', `${p.data.displayName}: ${ROLE_HE[from]} ← ${ROLE_HE[to]}`, { subjectUid: p.id })],
    refs: [{ col: 'users', id: p.id, expected: { role: to } }], data: { changed: true },
  };
});
// setUserRole() (status)
def('people.setStatus', 'people:write', 'חסימה או שחרור של אדם', { ifUpdatedAt: IF_UPDATED_AT as Param, uid: req(), status: en(['active', 'blocked'], 'active פעיל (שחרור), blocked חסום', true) }, async (c) => {
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

const eventFields = (required: boolean): Record<string, Param> => ({
  title: str(200, 'שם האירוע', required, 1), description: str(8000, 'תיאור'), location: str(300, 'מקום'),
  start: dt('התחלה', required), end: dt('סיום', required), price: num(0, 100000, 'מחיר לכרטיס, 0 חינם'),
  maxPerOrder: { type: 'int', min: 1, max: 20, default: 5, he: 'מקסימום כרטיסים להזמנה' }, capacity: { type: 'int', min: 0, max: 100000, default: 0, he: 'קיבולת, 0 ללא הגבלה' },
  open: bool('פתוח להרשמה'), published: bool('מפורסם לאורחים'),
});
/** ManageEvents.tsx save(): a published event has a calendar entry "event_<id>" (time "HH:mm–HH:mm"), an unpublished one none. */
function eventCalendar(c: Ctx, id: string, e: Record<string, unknown>): Write {
  if (!e.published) return c.fs.remove('calendar', `event_${id}`);
  return c.fs.set('calendar', `event_${id}`, { title: e.title, date: String(e.start).slice(0, 10), time: `${hhmm(String(e.start))}–${hhmm(String(e.end))}`, ownerUid: c.me.uid, ownerName: c.me.name, kind: 'event', refId: id, createdAt: nowIso() });
}
// saveEvent() (new) + upsertCalendarRef
def('events.create', 'events:write', 'יצירת אירוע', { ...eventFields(true), maxPerOrder: { type: 'int', min: 1, max: 20, default: 5, he: 'מקסימום כרטיסים להזמנה' } }, async (c) => {
  if (c.input.end < c.input.start) throw invalid('end', 'end is before start');
  const id = autoId();
  const now = nowIso();
  const e = {
    title: c.input.title, description: c.input.description || '', image: '', location: c.input.location ?? 'חוות רווה, ליד טנא עומרים',
    start: c.input.start, end: c.input.end, price: c.input.price ?? 0, maxPerOrder: c.input.maxPerOrder, capacity: c.input.capacity,
    open: c.input.open ?? true, published: c.input.published ?? false, questions: [], files: [], createdBy: c.me, createdAt: now, updatedAt: now,
  };
  const writes = [c.fs.create('events', id, e), activity(c.fs, c.me, 'event', id, 'created', e.title, { eventId: id })];
  if (e.published) writes.push(eventCalendar(c, id, e));
  return { status: 201, writes, refs: [{ col: 'events', id, expected: { title: e.title, start: e.start, published: e.published } }], data: { eventId: id } };
}, ['Created as a draft unless published=true. Images, questions and files are added in the app.']);
// saveEvent() (existing) + upsert/deleteCalendarRef
def('events.update', 'events:write', 'עדכון אירוע, כולל פרסום/הסרה מפרסום ופתיחה/סגירה של הרשמה', { ifUpdatedAt: IF_UPDATED_AT as Param, eventId: req(), ...eventFields(false), maxPerOrder: { type: 'int', min: 1, max: 20, he: 'מקסימום כרטיסים להזמנה' }, capacity: { type: 'int', min: 0, max: 100000, he: 'קיבולת' } } as Record<string, Param>, async (c) => {
  const ev = await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  fresh(ev, c.input.ifUpdatedAt);
  const patch = given(c.input, ['title', 'description', 'location', 'start', 'end', 'price', 'maxPerOrder', 'capacity', 'open', 'published']);
  needSome(patch);
  const next = { ...ev.data, ...patch };
  if (String(next.end) < String(next.start)) throw invalid('end', 'end is before start');
  const action = patch.published !== undefined && patch.published !== !!ev.data.published ? (patch.published ? 'published' : 'unpublished') : 'edited';
  return {
    writes: [c.fs.patch('events', ev.id, { ...patch, updatedAt: nowIso() }, ev.updateTime), activity(c.fs, c.me, 'event', ev.id, action, String(next.title), { eventId: ev.id }), eventCalendar(c, ev.id, next)],
    refs: [{ col: 'events', id: ev.id, expected: patch }],
  };
});
// deleteEvent() + deleteCalendarRef
def('events.delete', 'events:write', 'מחיקת אירוע', { ifUpdatedAt: IF_UPDATED_AT as Param, eventId: req() }, async (c) => {
  const ev = await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  fresh(ev, c.input.ifUpdatedAt);
  return {
    writes: [c.fs.remove('events', ev.id, ev.updateTime), activity(c.fs, c.me, 'event', ev.id, 'deleted', String(ev.data.title), { eventId: ev.id }), c.fs.remove('calendar', `event_${ev.id}`)],
    refs: [{ col: 'events', id: ev.id, gone: true }], data: { deleted: project('events', ev.id, ev.data) },
  };
}, ['Destructive: confirm with the user first. Its tickets stay (as in the app); to unpublish instead, use events.update published=false.']);
// setEventVendor()
def('events.setVendor', 'events:write', 'שיבוץ ספק/דוכן לאירוע, ואם אישר הגעה', { eventId: req(), vendorId: req('מתוך vendors.list'), confirmed: bool('אישר הגעה', false), notes: str(1000, 'הערות') }, async (c) => {
  await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  const v = await mustGet(c.fs, 'vendors', c.input.vendorId, c.tx, 'vendor');
  const col = `events/${c.input.eventId}/vendors`;
  const data = { vendorId: v.id, name: v.data.name, confirmed: c.input.confirmed, notes: c.input.notes || '' };
  return { writes: [c.fs.set(col, v.id, data)], refs: [{ col, id: v.id, expected: { confirmed: data.confirmed } }] };
});
// removeEventVendor()
def('events.removeVendor', 'events:write', 'הסרת ספק/דוכן מאירוע', { eventId: req(), vendorId: req() }, async (c) => {
  const col = `events/${c.input.eventId}/vendors`;
  await mustGet(c.fs, col, c.input.vendorId, c.tx, 'event vendor');
  return { writes: [c.fs.remove(col, c.input.vendorId)], refs: [{ col, id: c.input.vendorId, gone: true }] };
});
// saveProduct()
def('events.saveProduct', 'events:write', 'הוספה או עדכון של מוצר ומחיר בדוכן האירוע', {
  eventId: req(), productId: opt('לעדכון מוצר קיים; בלי זה נוצר מוצר חדש'), name: str(200, 'שם המוצר', true, 1), price: num(0, 100000, 'מחיר', true),
  active: bool('זמין למכירה', true), sort: num(0, 100000, 'סדר תצוגה', false, 0),
}, async (c) => {
  await mustGet(c.fs, 'events', c.input.eventId, c.tx, 'event');
  const col = `events/${c.input.eventId}/products`;
  if (c.input.productId) await mustGet(c.fs, col, c.input.productId, c.tx, 'product');
  const id = c.input.productId || autoId();
  const data = { name: c.input.name, price: c.input.price, active: c.input.active, sort: c.input.sort };
  return { status: c.input.productId ? 200 : 201, writes: [c.fs.set(col, id, data)], refs: [{ col, id, expected: data }], data: { productId: id } };
});
// deleteProduct()
def('events.deleteProduct', 'events:write', 'מחיקת מוצר מדוכן האירוע', { eventId: req(), productId: req() }, async (c) => {
  const col = `events/${c.input.eventId}/products`;
  const p = await mustGet(c.fs, col, c.input.productId, c.tx, 'product');
  return { writes: [c.fs.remove(col, p.id, p.updateTime)], refs: [{ col, id: p.id, gone: true }], data: { deleted: project(col, p.id, p.data) } };
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
// setOrderPayment()
def('tickets.setOrderPayment', 'tickets:write', 'סימון תשלום על הזמנה שלמה (כל הכרטיסים שלה)', { orderId: req('orderId מתוך tickets.list'), paymentStatus: en(PAY_SET, 'paid שולם, paid_onsite שולם במקום, pending ממתין, claimed דווח שהועבר, free חינם', true) }, async (c) => {
  const list = await orderTickets(c, c.input.orderId);
  const now = nowIso();
  const t = list[0].data;
  return {
    writes: [...list.map((x) => c.fs.patch('tickets', x.id, { paymentStatus: c.input.paymentStatus, updatedAt: now }, x.updateTime)),
      activity(c.fs, c.me, 'ticket', c.input.orderId, 'paid', `${t.ownerName} · ${t.eventTitle} · ${Number(t.price) * list.length} ₪ · ${list.length} כרטיסים`, { subjectUid: String(t.ownerUid), eventId: String(t.eventId) })],
    refs: list.map((x) => ({ col: 'tickets', id: x.id, expected: { paymentStatus: c.input.paymentStatus } })),
  };
});
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
    writes: [c.fs.patch('tickets', t.id, { paymentStatus: c.input.paymentStatus, updatedAt: nowIso() }, t.updateTime),
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
});
// addTabItems()
def('tabs.addItem', 'tabs:write', 'רישום מוצר שאורח לקח מהדוכן', { ifUpdatedAt: IF_UPDATED_AT as Param, tabId: req(), productId: req('מתוך eventProducts.list של האירוע'), qty: { type: 'int', min: 1, max: 50, default: 1, he: 'כמות' } }, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  fresh(tab, c.input.ifUpdatedAt);
  const p = await mustGet(c.fs, `events/${tab.data.eventId}/products`, c.input.productId, c.tx, 'product');
  const item: TabItem = { productId: p.id, name: String(p.data.name), price: Number(p.data.price), qty: c.input.qty, at: nowIso(), by: c.me };
  const items = [...((tab.data.items as TabItem[]) || []), item];
  return {
    writes: [c.fs.patch('tabs', tab.id, { items, total: sum(items), updatedAt: nowIso() }, tab.updateTime),
      activity(c.fs, c.me, 'tab', tab.id, 'item', `${tab.data.guestName}: ${item.name}${item.qty > 1 ? ' ×' + item.qty : ''} · ${sum([item])} ₪`, { subjectUid: String(tab.data.guestUid), eventId: String(tab.data.eventId) })],
    refs: [{ col: 'tabs', id: tab.id, expected: { total: sum(items) } }],
  };
});
// removeTabItem()
def('tabs.removeItem', 'tabs:write', 'הסרת פריט מחשבון בדוכן', { ifUpdatedAt: IF_UPDATED_AT as Param, tabId: req(), index: { type: 'int', min: 0, max: 499, required: true, he: 'מיקום הפריט ברשימת items (מ־0)' }, reason: str(300, 'סיבה') }, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  fresh(tab, c.input.ifUpdatedAt);
  const cur = (tab.data.items as TabItem[]) || [];
  if (c.input.index >= cur.length) throw invalid('index', 'no item at this index');
  const items = cur.filter((_, i) => i !== c.input.index);
  return {
    writes: [c.fs.patch('tabs', tab.id, { items, total: sum(items), updatedAt: nowIso() }, tab.updateTime),
      activity(c.fs, c.me, 'tab', tab.id, 'removed', `${tab.data.guestName}: ${cur[c.input.index].name}${c.input.reason ? ' · "' + c.input.reason + '"' : ''}`, { subjectUid: String(tab.data.guestUid), eventId: String(tab.data.eventId) })],
    refs: [{ col: 'tabs', id: tab.id, expected: { total: sum(items) } }],
  };
});
// setTabStatus()
def('tabs.setStatus', 'tabs:settle', 'סגירת חשבון בדוכן: שולם, נמחל, או חזרה לפתוח', { ifUpdatedAt: IF_UPDATED_AT as Param, tabId: req(), status: en(['open', 'claimed', 'paid', 'waived'], 'paid שולם, waived נמחל, open פתוח, claimed דווח שהועבר', true), note: str(300, 'הערה') }, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  fresh(tab, c.input.ifUpdatedAt);
  const s = c.input.status as string;
  const d = tab.data;
  return {
    writes: [c.fs.patch('tabs', tab.id, { status: s, updatedAt: nowIso() }, tab.updateTime),
      activity(c.fs, c.me, 'tab', tab.id, s === 'paid' ? 'paid' : s === 'waived' ? 'waived' : 'edited', `${d.guestName} · ${d.total} ₪ · ${d.eventTitle}${c.input.note ? ' · "' + c.input.note + '"' : ''}`, { subjectUid: String(d.guestUid), eventId: String(d.eventId) })],
    refs: [{ col: 'tabs', id: tab.id, expected: { status: s } }],
  };
});

// ======================= visits & donations =======================

/** handleNotificationsFor(): closes every open notification that points at this record. */
async function closeNotifications(c: Ctx, refId: string): Promise<Write[]> {
  const open = await whereEq(c.fs, 'notifications', { refId, handled: false });
  const now = nowIso();
  return open.map((n) => c.fs.patch('notifications', n.id, { handled: true, handledBy: c.me, handledAt: now }));
}
// setVisitStatus() + upsert/deleteCalendarRef + handleNotificationsFor (ManageMore.tsx)
def('visits.setStatus', 'visits:write', 'אישור או דחייה של בקשת ביקור', { ifUpdatedAt: IF_UPDATED_AT as Param,
  visitId: req(), status: en(['approved', 'rejected', 'new'], 'approved אושר, rejected לא מתאים, new החזרה לחדש', true),
  managerNote: str(2000, 'הערה למבקר (מחליף את הקיימת)'), time: { type: 'time', format: 'HH:mm', timezone: 'Asia/Jerusalem', he: 'שעת הביקור ליומן' },
}, async (c) => {
  const v = await mustGet(c.fs, 'visits', c.input.visitId, c.tx, 'visit');
  fresh(v, c.input.ifUpdatedAt);
  const note = c.input.managerNote ?? String(v.data.managerNote || '');
  const st = c.input.status as string;
  const writes: Write[] = [
    c.fs.patch('visits', v.id, { status: st, managerNote: note, handledBy: c.me, updatedAt: nowIso() }, v.updateTime),
    activity(c.fs, c.me, 'visit', v.id, st, `${v.data.name} · ${v.data.date}${note ? ' · ' + note : ''}`, { subjectUid: String(v.data.uid) }),
  ];
  if (st === 'approved') writes.push(c.fs.set('calendar', `visit_${v.id}`, { title: `ביקור: ${v.data.name} · ${v.data.people}`, date: v.data.date, time: c.input.time || note.match(/\d{1,2}:\d{2}/)?.[0] || '', ownerUid: c.me.uid, ownerName: c.me.name, kind: 'visit', refId: v.id, createdAt: nowIso() }));
  else writes.push(c.fs.remove('calendar', `visit_${v.id}`));
  writes.push(...await closeNotifications(c, v.id));
  return { writes, refs: [{ col: 'visits', id: v.id, expected: { status: st } }] };
}, ['Approving adds the visit to the managers\' calendar; this also closes its open notifications. The guest is not messaged automatically.']);
// setDonation() (payment) + handleNotificationsFor
def('donations.setPayment', 'donations:write', 'אישור תשלום תרומה (או שינוי מצב התשלום)', { ifUpdatedAt: IF_UPDATED_AT as Param, donationId: req(), paymentStatus: en(['paid', 'pending', 'claimed', 'cancelled'], 'paid שולם, pending ממתין, claimed דווח שהועבר, cancelled בוטל', true) }, async (c) => {
  const d = await mustGet(c.fs, 'donations', c.input.donationId, c.tx, 'donation');
  fresh(d, c.input.ifUpdatedAt);
  const ps = c.input.paymentStatus as string;
  const writes: Write[] = [c.fs.patch('donations', d.id, { paymentStatus: ps, updatedAt: nowIso() }, d.updateTime),
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

const vendorFields = (required: boolean): Record<string, Param> => ({ name: str(200, 'שם', required, 1), phone: str(25, 'טלפון'), product: str(300, 'מה מוכרים/מספקים'), external: bool('ספק חיצוני'), notes: str(2000, 'הערות') });
// saveVendor() (new)
def('vendors.create', 'vendors:write', 'הוספת ספק / בעל דוכן', vendorFields(true), async (c) => {
  const id = autoId();
  const now = nowIso();
  const data = { name: c.input.name, phone: c.input.phone || '', product: c.input.product || '', external: c.input.external ?? false, notes: c.input.notes || '', createdAt: now, updatedAt: now };
  return { status: 201, writes: [c.fs.create('vendors', id, data)], refs: [{ col: 'vendors', id, expected: { name: data.name } }], data: { vendorId: id } };
});
// saveVendor() (existing)
def('vendors.update', 'vendors:write', 'עדכון ספק / בעל דוכן', { ifUpdatedAt: IF_UPDATED_AT as Param, vendorId: req(), ...vendorFields(false) }, async (c) => {
  const v = await mustGet(c.fs, 'vendors', c.input.vendorId, c.tx, 'vendor');
  fresh(v, c.input.ifUpdatedAt);
  const patch = given(c.input, ['name', 'phone', 'product', 'external', 'notes']);
  needSome(patch);
  return { writes: [c.fs.patch('vendors', v.id, { ...patch, updatedAt: nowIso() }, v.updateTime)], refs: [{ col: 'vendors', id: v.id, expected: patch }] };
});
// deleteVendor()
def('vendors.delete', 'vendors:write', 'מחיקת ספק', { ifUpdatedAt: IF_UPDATED_AT as Param, vendorId: req() }, async (c) => {
  const v = await mustGet(c.fs, 'vendors', c.input.vendorId, c.tx, 'vendor');
  fresh(v, c.input.ifUpdatedAt);
  return { writes: [c.fs.remove('vendors', v.id, v.updateTime)], refs: [{ col: 'vendors', id: v.id, gone: true }], data: { deleted: project('vendors', v.id, v.data) } };
}, ['Destructive: confirm with the user first.']);

// ======================= notifications & calendar =======================

// handleNotification()
def('notifications.setHandled', 'notifications:write', 'סימון התראה כטופלה (או החזרה לתור)', { notificationId: req(), handled: bool('false מחזיר לתור', true) }, async (c) => {
  const n = await mustGet(c.fs, 'notifications', c.input.notificationId, c.tx, 'notification');
  const patch = c.input.handled ? { handled: true, handledBy: c.me, handledAt: nowIso() } : { handled: false, handledBy: null, handledAt: null };
  return { writes: [c.fs.patch('notifications', n.id, patch, n.updateTime)], refs: [{ col: 'notifications', id: n.id, expected: { handled: c.input.handled } }] };
});
// saveCalendarItem() (new)
def('calendar.create', 'calendar:write', 'הוספת פריט ליומן המנהלים', { title: str(200, 'מה', true, 1), date: date('תאריך', true), time: { type: 'time', format: 'HH:mm', timezone: 'Asia/Jerusalem', he: 'שעה' } }, async (c) => {
  const id = autoId();
  const data = { title: c.input.title, date: c.input.date, time: c.input.time || '', ownerUid: c.me.uid, ownerName: c.me.name, kind: 'manual', refId: '', createdAt: nowIso() };
  return { status: 201, writes: [c.fs.create('calendar', id, data)], refs: [{ col: 'calendar', id, expected: { title: data.title, date: data.date } }], data: { itemId: id } };
});
// saveCalendarItem() (existing)
def('calendar.update', 'calendar:write', 'עדכון פריט ביומן', { itemId: req(), title: str(200, 'מה', false, 1), date: date('תאריך'), time: { type: 'time', format: 'HH:mm', timezone: 'Asia/Jerusalem', he: 'שעה' } }, async (c) => {
  const it = await mustGet(c.fs, 'calendar', c.input.itemId, c.tx, 'calendar item');
  const patch = given(c.input, ['title', 'date', 'time']);
  needSome(patch);
  return { writes: [c.fs.patch('calendar', it.id, patch, it.updateTime)], refs: [{ col: 'calendar', id: it.id, expected: patch }] };
}, ['Visit and event entries follow their visit/event; change those instead.']);
// deleteCalendarItem()
def('calendar.delete', 'calendar:write', 'מחיקת פריט מהיומן', { itemId: req() }, async (c) => {
  const it = await mustGet(c.fs, 'calendar', c.input.itemId, c.tx, 'calendar item');
  return { writes: [c.fs.remove('calendar', it.id, it.updateTime)], refs: [{ col: 'calendar', id: it.id, gone: true }], data: { deleted: project('calendar', it.id, it.data) } };
}, ['Destructive: confirm with the user first.']);

// ======================= settings =======================

/** DEFAULT_SETTINGS in src/app/types.ts: what useSettings() shows when a field was never saved. */
export const DEFAULT_SETTINGS = {
  donationPresets: [{ amount: 18, label: 'חי' }, { amount: 180, label: 'עשר פעמים חי' }, { amount: 360, label: 'לב' }],
  visitTypes: ['סיור בחווה', 'מפגש קבוצתי', 'אירוע פרטי', 'אחר'],
  payment: { bit: '', paybox: '', cash: true, note: '' },
  templates: {
    visitApproved: 'שלום [שם], הביקור בחוות רווה ב־[תאריך] מאושר. נשמח לראותכם!',
    donationThanks: 'שלום [שם], תודה רבה על התרומה לחוות רווה.',
    debtReminder: 'שלום [שם], תודה שהייתם ב־[אירוע]. נשאר לתשלום [סכום] ₪. אפשר להעביר בביט או ב־PayBox. תודה!',
    ticketReminder: 'שלום [שם], מזכירים: [אירוע] מתקיים ב־[תאריך]. הכרטיסים באפליקציה: https://havat-ravve.web.app/app/me',
    vendorInvite: 'שלום [שם], נשמח שתגיעו עם דוכן ל־[אירוע] ב־[תאריך] בחוות רווה. מתאים?',
  },
  registrationFields: [],
  guestIntro: 'ברוכים הבאים לחוות רווה. כאן מזמינים כרטיסים לאירועים, מתאמים ביקור ותורמים.',
};
/** useSettings(): the stored document over the defaults, with payment and templates merged field by field. */
export function mergedSettings(stored: Record<string, unknown> | null) {
  const s = stored || {};
  return { ...DEFAULT_SETTINGS, ...s, payment: { ...DEFAULT_SETTINGS.payment, ...((s.payment as object) || {}) }, templates: { ...DEFAULT_SETTINGS.templates, ...((s.templates as object) || {}) } } as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
// saveSettings()
def('settings.update', 'settings:write', 'עדכון הגדרות: פתיח לאורחים, סוגי ביקור, פרטי תשלום ונוסחי הודעות', {
  guestIntro: str(2000, 'טקסט הפתיחה לאורחים'), visitTypes: { type: 'stringList', maxItems: 20, maxLength: 100, he: 'סוגי ביקור (מחליף את הרשימה)' },
  paymentBit: str(100, 'מספר/קישור ביט'), paymentPaybox: str(100, 'מספר/קישור PayBox'), paymentCash: bool('מקבלים מזומן'), paymentNote: str(1000, 'הערה על תשלום'),
  msgVisitApproved: str(2000, 'נוסח: ביקור אושר'), msgDonationThanks: str(2000, 'נוסח: תודה על תרומה'), msgDebtReminder: str(2000, 'נוסח: תזכורת חוב'),
  msgTicketReminder: str(2000, 'נוסח: תזכורת לאירוע'), msgVendorInvite: str(2000, 'נוסח: הזמנת דוכן'),
}, async (c) => {
  const cur = await c.fs.get('settings', 'app', c.tx);
  const s = mergedSettings(cur?.data ?? null);
  const i = c.input;
  const patch = given(i, Object.keys(i));
  needSome(patch);
  if (i.guestIntro !== null) s.guestIntro = i.guestIntro;
  if (i.visitTypes !== null) s.visitTypes = i.visitTypes;
  const pay: Record<string, [string, string]> = { paymentBit: ['bit', ''], paymentPaybox: ['paybox', ''], paymentCash: ['cash', ''], paymentNote: ['note', ''] };
  for (const [k, [f]] of Object.entries(pay)) if (i[k] !== null) s.payment[f] = i[k];
  const msg: Record<string, string> = { msgVisitApproved: 'visitApproved', msgDonationThanks: 'donationThanks', msgDebtReminder: 'debtReminder', msgTicketReminder: 'ticketReminder', msgVendorInvite: 'vendorInvite' };
  for (const [k, f] of Object.entries(msg)) if (i[k] !== null) s.templates[f] = i[k];
  delete s.id;
  return { writes: [c.fs.set('settings', 'app', s), activity(c.fs, c.me, 'settings', 'app', 'saved', 'ההגדרות עודכנו')], refs: [{ col: 'settings', id: 'app' }] };
}, ['Message templates use [שם], [תאריך], [אירוע], [סכום] as placeholders.']);
