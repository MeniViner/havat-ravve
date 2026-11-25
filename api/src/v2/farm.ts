// Farm area (v2): presence (F4) and the team calendar (C11), written exactly as src/app/v2/data/farm.ts does
// (savePresence → presencePlan, saveCalItem, deleteCalItem / removePresence). Model: docs/redesign-data/farm.md.
import { requireScope } from '../auth';
import { invalid } from '../http';
import type { Param } from '../catalog';
import type { Write } from '../firestore';
import { type Person, type Ref, activity, member, mustGet, nowIso, project, whereEq } from '../core';
import { autoId } from '../util';
import { type Ctx, bool, date, def, en, opt, req, str } from '../writes';

const time = (he: string): Param => ({ type: 'time', format: 'HH:mm', timezone: 'Asia/Jerusalem', he });

// ---------- helpers from src/app/v2/screens/farm/logic.ts ----------
type Hours = { from: string; to: string };
/** normTime(): "9" → "09:00"; '' for anything that is not a time. */
export function normTime(input: string): string {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec((input || '').trim().replace(/[.,]/g, ':'));
  if (!m) return '';
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  return h > 23 || min > 59 ? '' : `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
const minutes = (t: string) => { const n = normTime(t); return n ? Number(n.slice(0, 2)) * 60 + Number(n.slice(3)) : NaN; };
/** timeText(): the old `time` text written next to from/to (rules: at most 11 characters). */
export const timeText = (h: Hours) => (h.from && h.to ? `${h.from}–${h.to}` : h.from ? h.from : h.to ? `–${h.to}` : '');
/** parseLegacyTime() + hoursOf(): the v2 fields when present, else parsed from the old `time` text. */
function hoursOf(item: Record<string, unknown>): Hours {
  if (typeof item.from === 'string' || typeof item.to === 'string') return { from: normTime(String(item.from || '')), to: normTime(String(item.to || '')) };
  const s = String(item.time || '').trim();
  if (!s) return { from: '', to: '' };
  const [a = '', b = ''] = s.split(/\s*[–-]\s*/);
  return { from: normTime(a), to: normTime(b) };
}
function checkHours(h: Hours) {
  if (h.from && h.to && !(minutes(h.from) < minutes(h.to))) throw invalid('to', '"to" must be after "from"');
}
export const firstOf = (name: string) => (name || '').trim().split(/\s+/)[0] || name || '';
/** isPresence(): kind 'presence', or an old manual entry titled "<first name> בחווה". */
const isPresence = (d: Record<string, unknown>) => d.kind === 'presence' || (d.kind === 'manual' && !!d.ownerName && String(d.title || '').trim() === `${firstOf(String(d.ownerName))} בחווה`);
/** israelIso(): the instant of an Israeli wall-clock time (summer time handled). */
export function israelIso(day: string, hhmm: string): string {
  const [y, mo, d] = day.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want - 2 * 3600_000;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    const seen = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
    if (seen === want) break;
    t += want - seen;
  }
  return new Date(t).toISOString();
}
/** remindAt(): when the Worker sends the reminder, an hour before the start ('' without a start hour). */
export const remindAt = (day: string, from: string, minutesBefore = 60) => (normTime(from) ? new Date(new Date(israelIso(day, normTime(from))).getTime() - minutesBefore * 60_000).toISOString() : '');
const realDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

// ======================= presence (F4) =======================

// savePresence() → presencePlan()
def('presence.save', 'presence:write', 'רישום נוכחות בחווה ליום אחד או כמה ימים (שעות והערה לצוות)', {
  dates: { type: 'stringList', maxItems: 31, maxLength: 10, required: true, he: 'הימים, כל אחד YYYY-MM-DD' },
  from: time('משעה (בלי from ו־to = כל היום)'), to: time('עד שעה'), note: str(200, 'הערה לצוות'),
  uid: opt('בשביל מי (מנהלים בלבד; ברירת מחדל: מי שקורא)'),
}, async (c) => {
  const days = [...new Set(c.input.dates as string[])].sort();
  if (!days.length) throw invalid('dates', 'at least one date');
  for (const d of days) if (!realDate(d)) throw invalid('dates', `"${d}" is not a date YYYY-MM-DD`);
  const hours = { from: c.input.from || '', to: c.input.to || '' };
  checkHours(hours);
  // F4 for managers: "בשביל מי"; volunteers register only themselves (firestore.rules createsPresence)
  let who: Person = c.me;
  if (c.input.uid && c.input.uid !== c.me.uid) {
    requireScope(c.caller, 'presence:write:any');
    who = await member(c.fs, c.input.uid, 'uid', c.tx);
  }
  const fields = { from: hours.from, to: hours.to, time: timeText(hours), note: String(c.input.note || '').slice(0, 200), title: `${firstOf(who.name)} בחווה` };
  const now = nowIso();
  const writes: Write[] = [], refs: Ref[] = [];
  let created = 0, updated = 0;
  for (const day of days) {
    // the person's own presence entry that day is updated instead of adding a second one; old manual entries are left alone
    const mine = (await whereEq(c.fs, 'calendar', { date: day, ownerUid: who.uid }, 50)).filter((d) => d.data.kind === 'presence').sort((a, b) => a.id.localeCompare(b.id))[0];
    if (mine) {
      const cur = await mustGet(c.fs, 'calendar', mine.id, c.tx, 'calendar item');
      writes.push(c.fs.patch('calendar', cur.id, { ...fields, date: day }, cur.updateTime));
      refs.push({ col: 'calendar', id: cur.id, expected: { ...fields, date: day } });
      writes.push(activity(c.fs, c.me, 'calendar', cur.id, 'edited', `נוכחות · ${day}`, { subjectUid: who.uid }));
      updated++;
    } else {
      const id = autoId();
      writes.push(c.fs.create('calendar', id, { ...fields, date: day, kind: 'presence', ownerUid: who.uid, ownerName: who.name, refId: '', createdAt: now }));
      refs.push({ col: 'calendar', id, expected: { ...fields, date: day, kind: 'presence', ownerUid: who.uid } });
      writes.push(activity(c.fs, c.me, 'calendar', id, 'created', `נוכחות · ${day}`, { subjectUid: who.uid }));
      created++;
    }
  }
  return { status: created ? 201 : 200, writes, refs, data: { itemIds: refs.map((r) => r.id), created, updated, who } };
}, [
  'One entry per day: an existing presence of that person on that day is updated (hours, note), otherwise a new one is added. Title "<first name> בחווה".',
  'from/to: both empty = all day; one of them = an open end. The note is shown to the team under the name.',
]);

// removePresence()
def('presence.remove', 'presence:remove', 'הסרת רישום נוכחות מהיומן', { itemId: req('מתוך calendar.list (kind presence)') }, async (c) => {
  const it = await mustGet(c.fs, 'calendar', c.input.itemId, c.tx, 'calendar item');
  if (!isPresence(it.data)) throw invalid('itemId', 'this calendar item is not a presence entry (managers: calendar.delete)');
  // volunteers delete only their own presence (firestore.rules ownsPresence)
  if (it.data.kind !== 'presence' || it.data.ownerUid !== c.me.uid) requireScope(c.caller, 'presence:write:any');
  return { writes: [c.fs.remove('calendar', it.id, it.updateTime), activity(c.fs, c.me, it.data.audience === 'managers' ? 'calendar_private' : 'calendar', it.id, 'deleted', it.data.kind === 'presence' ? 'נוכחות' : 'פריט ביומן')], refs: [{ col: 'calendar', id: it.id, gone: true }], data: { deleted: project('calendar', it.id, it.data) } };
}, ['Destructive: confirm with the user first.']);

// ======================= team calendar (C11) =======================

const KINDS = ['manual', 'meeting', 'planning'];
const KIND_HE = 'meeting פגישת צוות, planning הכנות לפסטיבל, manual פריט אחר';
async function participantsOf(c: Ctx, uids: string[] | null): Promise<string[] | null> {
  if (!uids) return null;
  const list = [...new Set(uids)];
  if (list.length > 30) throw invalid('participants', 'at most 30 participants');
  const found = new Set((await c.fs.getMany('users', list)).map((d) => d.id));
  const missing = list.filter((u) => !found.has(u));
  if (missing.length) throw invalid('participants', `unknown uid: ${missing.join(', ')}`);
  return list;
}
const calBody = (create: boolean): Record<string, Param> => ({
  title: str(200, 'מה', create, 1), date: date('תאריך', create),
  from: time('משעה'), to: time('עד שעה'), time: time('(ישן) כמו from'),
  ...(create ? {} : { allDay: bool('true מוחק את השעות (כל היום)') }),
  audience: en(['all', 'managers'], 'מי רואה: all כל הצוות, managers מנהלים בלבד', false, create ? 'all' : undefined),
  participants: { type: 'stringList', maxItems: 30, maxLength: 128, he: 'uid של המשתתפים (מחליף את הרשימה); הם מקבלים את התזכורת' },
  reminder: bool('להזכיר למשתתפים שעה לפני (צריך שעת התחלה)', create ? true : undefined),
  kind: en(KINDS, KIND_HE, false, create ? 'manual' : undefined),
});
const calNotes = [
  'The reminder goes out an hour before "from" to the participants (the Worker sends it; an item without participants or without a start hour reminds nobody). Every save sets the reminder again.',
  'audience "managers" hides the item from volunteers\' screens; the text is not secret.',
];

// saveCalItem() (new)
def('calendar.create', 'calendar:write', 'הוספת פריט ליומן החווה (פגישה, הכנות לפסטיבל, פריט אחר)', calBody(true), async (c) => {
  const i = c.input;
  const hours = { from: i.from || i.time || '', to: i.to || '' };
  checkHours(hours);
  const participants = (await participantsOf(c, i.participants)) || [];
  const id = autoId();
  const data = {
    title: i.title, date: i.date, time: timeText(hours), from: hours.from, to: hours.to, audience: i.audience, participants,
    reminder: i.reminder ? '60' : '', remindAt: i.reminder ? remindAt(i.date, hours.from) : '', reminderSentAt: null,
    kind: i.kind, ownerUid: c.me.uid, ownerName: c.me.name, refId: '', createdAt: nowIso(),
  };
  return { status: 201, writes: [c.fs.create('calendar', id, data), activity(c.fs, c.me, data.audience === 'managers' ? 'calendar_private' : 'calendar', id, 'created', 'פריט ביומן')], refs: [{ col: 'calendar', id, expected: { title: data.title, date: data.date, time: data.time, remindAt: data.remindAt } }], data: { itemId: id } };
}, calNotes);

// saveCalItem() (existing): the app saves the whole form, so hours, the reminder time and reminderSentAt are written again
def('calendar.update', 'calendar:write', 'עדכון פריט ביומן (שינוי תאריך או שעה קובע מחדש את התזכורת)', { itemId: req(), ...calBody(false) }, async (c) => {
  const i = c.input;
  const it = await mustGet(c.fs, 'calendar', i.itemId, c.tx, 'calendar item');
  const d = it.data;
  if (isPresence(d) && d.ownerUid !== c.me.uid) requireScope(c.caller, 'presence:write:any');
  if (![i.title, i.date, i.from, i.to, i.time, i.allDay, i.audience, i.participants, i.reminder, i.kind].some((v) => v !== null && v !== undefined)) throw invalid('body', 'nothing to change: send at least one field');
  const was = hoursOf(d);
  const hours = i.allDay ? { from: '', to: '' } : { from: i.from || i.time || was.from, to: i.to || was.to };
  checkHours(hours);
  const day = i.date || String(d.date);
  const reminder = i.reminder ?? !!d.reminder;
  const participants = (await participantsOf(c, i.participants)) ?? (Array.isArray(d.participants) ? d.participants : []);
  const fields: Record<string, unknown> = {
    title: i.title ?? String(d.title), date: day, time: timeText(hours), from: hours.from, to: hours.to,
    audience: i.audience ?? (d.audience === 'managers' ? 'managers' : 'all'), participants,
    reminder: reminder ? '60' : '', remindAt: reminder ? remindAt(day, hours.from) : '', reminderSentAt: null,
  };
  // kindToSave(): on an edit the kind is written only when it changed
  const shown = d.kind === 'meeting' || d.kind === 'planning' ? d.kind : 'manual';
  if (i.kind && i.kind !== shown) fields.kind = i.kind;
  return { writes: [c.fs.patch('calendar', it.id, fields, it.updateTime), activity(c.fs, c.me, fields.audience === 'managers' ? 'calendar_private' : 'calendar', it.id, 'edited', 'פריט ביומן')], refs: [{ col: 'calendar', id: it.id, expected: { date: day, time: fields.time, remindAt: fields.remindAt } }] };
}, ['Only the fields sent change; changing the date or the hours sets a new reminder time (and it will be sent again).', 'Visit and event entries follow their visit/event; change those instead. Presence: presence.save.']);

// deleteCalItem()
def('calendar.delete', 'calendar:write', 'מחיקת פריט מהיומן', { itemId: req() }, async (c) => {
  const it = await mustGet(c.fs, 'calendar', c.input.itemId, c.tx, 'calendar item');
  if (isPresence(it.data) && it.data.ownerUid !== c.me.uid) requireScope(c.caller, 'presence:write:any');
  return { writes: [c.fs.remove('calendar', it.id, it.updateTime), activity(c.fs, c.me, it.data.audience === 'managers' ? 'calendar_private' : 'calendar', it.id, 'deleted', it.data.kind === 'presence' ? 'נוכחות' : 'פריט ביומן')], refs: [{ col: 'calendar', id: it.id, gone: true }], data: { deleted: project('calendar', it.id, it.data) } };
}, ['Destructive: confirm with the user first.']);
