// Farm area: pure helpers (no React, no Firestore), so tests/v2-farm.mjs can run them in node.
import { isFemale as sharedIsFemale } from '../../gender';
// Dates are 'YYYY-MM-DD' keys in Israel; hours are 'HH:MM' strings; '' means an open end.

/** The minimal calendar shape these helpers read (CalendarItem in types.ts, all v2 fields optional). */
export type CalItem = {
  id: string; ownerUid: string; ownerName: string; title: string; date: string; time: string; kind: string; refId?: string;
  from?: string; to?: string; note?: string; audience?: 'all' | 'managers'; participants?: string[]; reminder?: string; remindAt?: string;
};
export type Hours = { from: string; to: string };
export type PresenceLabel = 'allDay' | 'morning' | 'afternoon' | 'other';

/** F4 presets. "כל היום" stores no hours (the old meaning of an empty `time`). */
export const PRESETS: Record<Exclude<PresenceLabel, 'other' | 'allDay'>, Hours> = { morning: { from: '08:00', to: '13:00' }, afternoon: { from: '13:00', to: '18:00' } };
/** F3 hour axis: 06:00 to 20:00. */
export const AXIS_FROM = 6, AXIS_TO = 20;

// ---------- times ----------
/** "9" -> "09:00", "930" -> "09:30", "9:5" -> "", "24:00" -> "". Returns '' for anything that is not a time. */
export function normTime(input: string): string {
  const s = (input || '').trim().replace(/[.,]/g, ':');
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s);
  if (!m) return '';
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
/** Minutes since midnight; NaN for '' or a bad time. */
export const minutes = (hhmm: string) => { const t = normTime(hhmm); return t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : NaN; };
/** "09:00" -> "09", "09:30" -> "09:30" (F3 bar labels). */
export const shortHour = (hhmm: string) => (hhmm.endsWith(':00') ? hhmm.slice(0, 2) : hhmm);

/** The old `time` text: "" (all day), "08:00–13:00", "11:00", or free text such as "שקיעה". */
export function parseLegacyTime(time: string): Hours {
  const s = (time || '').trim();
  if (!s) return { from: '', to: '' };
  const [a = '', b = ''] = s.split(/\s*[–-]\s*/);
  const from = normTime(a), to = normTime(b);
  if (!from && !to) return { from: '', to: '' };
  return { from, to };
}
/** Hours of a calendar item: the v2 fields when present, else parsed from the old `time` text. */
export function hoursOf(item: Pick<CalItem, 'time' | 'from' | 'to'>): Hours {
  if (typeof item.from === 'string' || typeof item.to === 'string') return { from: normTime(item.from || ''), to: normTime(item.to || '') };
  return parseLegacyTime(item.time);
}
/** The old `time` text written next to from/to, so old screens and the Worker keep reading presence (rules: at most 11 characters). */
export const timeText = (h: Hours) => (h.from && h.to ? `${h.from}–${h.to}` : h.from ? h.from : h.to ? `–${h.to}` : '');
export const isAllDay = (h: Hours) => !h.from && !h.to;
export function labelOf(h: Hours): PresenceLabel {
  if (isAllDay(h)) return 'allDay';
  if (h.from === PRESETS.morning.from && h.to === PRESETS.morning.to) return 'morning';
  if (h.from === PRESETS.afternoon.from && h.to === PRESETS.afternoon.to) return 'afternoon';
  return 'other';
}
/** Hours that are fine to save: both empty, or valid times with from before to. */
export function hoursValid(h: Hours) {
  if (isAllDay(h)) return true;
  if (h.from && !normTime(h.from)) return false;
  if (h.to && !normTime(h.to)) return false;
  return !(h.from && h.to) || minutes(h.from) < minutes(h.to);
}

// ---------- presence ----------
export const firstOf = (name: string) => (name || '').trim().split(/\s+/)[0] || name || '';
/** Presence: kind 'presence', or an old manual entry titled "<first name> בחווה" (how the old calendar wrote it). */
export const isPresence = (item: Pick<CalItem, 'kind' | 'title' | 'ownerName'>) =>
  item.kind === 'presence' || (item.kind === 'manual' && !!item.ownerName && item.title.trim() === `${firstOf(item.ownerName)} בחווה`);

export type Status = 'now' | 'later' | 'past';
/** Where `nowMin` falls against the hours of a day (open ends run to the start or the end of the day). */
export function statusAt(h: Hours, nowMin: number): Status {
  const a = h.from ? minutes(h.from) : 0, b = h.to ? minutes(h.to) : 24 * 60;
  if (nowMin < a) return 'later';
  if (nowMin >= b) return 'past';
  return 'now';
}
export type Entry = { uid: string; name: string; hours: Hours; status: Status; note: string; id: string };
/** One line per person for a day: the stretch that holds `nowMin`, else the next one, else the last one. */
export function dayEntries(items: CalItem[], date: string, nowMin: number): Entry[] {
  const by = new Map<string, Entry[]>();
  for (const it of items) {
    if (it.date !== date || !isPresence(it) || !it.ownerUid) continue;
    const hours = hoursOf(it);
    const e: Entry = { uid: it.ownerUid, name: it.ownerName, hours, status: statusAt(hours, nowMin), note: it.note || '', id: it.id };
    by.set(it.ownerUid, [...(by.get(it.ownerUid) || []), e]);
  }
  const rank: Record<Status, number> = { now: 0, later: 1, past: 2 };
  const start = (e: Entry) => (e.hours.from ? minutes(e.hours.from) : 0);
  return [...by.values()].map((list) => [...list].sort((a, b) => rank[a.status] - rank[b.status] || (a.status === 'past' ? start(b) - start(a) : start(a) - start(b)))[0]);
}
/** F1 hero: who is here now (all day first, then by leaving time) and who comes later today (by arrival). */
export function whoIsHere(items: CalItem[], date: string, nowMin: number) {
  const all = dayEntries(items, date, nowMin);
  const end = (e: Entry) => (e.hours.to ? minutes(e.hours.to) : 24 * 60 + 1);
  const now = all.filter((e) => e.status === 'now').sort((a, b) => end(b) - end(a));
  const later = all.filter((e) => e.status === 'later').sort((a, b) => minutes(a.hours.from) - minutes(b.hours.from));
  return { now, later };
}
/** One day's people in reading order: today as in F1 (here now, then later, then gone), other days all day first, then by arrival. */
export function dayPeople(items: CalItem[], date: string, today: string, nowMin: number): Entry[] {
  if (date === today) {
    const { now, later } = whoIsHere(items, date, nowMin);
    const past = dayEntries(items, date, nowMin).filter((e) => e.status === 'past').sort((a, b) => minutes(a.hours.from) - minutes(b.hours.from));
    return [...now, ...later, ...past];
  }
  const start = (e: Entry) => (e.hours.from ? minutes(e.hours.from) : -1);
  return dayEntries(items, date, -1).sort((a, b) => start(a) - start(b) || a.name.localeCompare(b.name, 'he'));
}
/** People at the farm per day (each person once a day). */
export function countsByDay(items: CalItem[], days: string[]): number[] {
  return days.map((d) => new Set(items.filter((it) => it.date === d && isPresence(it) && it.ownerUid).map((it) => it.ownerUid)).size);
}
/** Ids of the presence entries of one person on one day (to update instead of adding a second one). */
export const presenceOf = (items: CalItem[], uid: string, date: string) => items.filter((it) => it.date === date && it.ownerUid === uid && isPresence(it));

// ---------- dates ----------
const utc = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const keyOfUtc = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => { const d = utc(key); d.setUTCDate(d.getUTCDate() + n); return keyOfUtc(d); };
/** 0 = Sunday ... 6 = Saturday */
export const weekdayOf = (key: string) => utc(key).getUTCDay();
export const dayNum = (key: string) => Number(key.slice(8, 10));
/** Sunday to Saturday of the week holding `key`. */
export const weekDays = (key: string) => { const s = addDays(key, -weekdayOf(key)); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); };
/** `n` days starting at `key` (F4 and C11 day pickers). */
export const nextDays = (key: string, n = 7) => Array.from({ length: n }, (_, i) => addDays(key, i));
/** The day picker's buttons: the week from `start`, plus any chosen day outside it (picked with "תאריך אחר"), in date order. */
export const pickerDays = (start: string, selected: string[], n = 7) => [...new Set([...nextDays(start, n), ...selected.filter(Boolean)])].sort();
/** Where the picker's week starts for a chosen date: today while the date is within the coming week, else the date itself. */
export const pickerStart = (date: string, today: string) => (date < today || date > addDays(today, 6) ? date : today);
/** Does the month / week / day on screen hold today? (the "היום" jump shows only when it does not). */
export function holdsToday(view: 'month' | 'week' | 'day', date: string, today: string) {
  if (view === 'day') return date === today;
  if (view === 'week') return weekDays(date).includes(today);
  return date.slice(0, 7) === today.slice(0, 7);
}
export const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
export const monthEnd = (key: string) => { const d = utc(monthStart(key)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return keyOfUtc(d); };
export const shiftMonth = (key: string, n: number) => { const d = utc(monthStart(key)); d.setUTCMonth(d.getUTCMonth() + n); return keyOfUtc(d); };
/** Month grid, Sunday first: leading nulls before the 1st, trailing nulls to complete the last week. */
export function monthGrid(key: string): (string | null)[] {
  const first = monthStart(key), last = monthEnd(key);
  const cells: (string | null)[] = Array.from({ length: weekdayOf(first) }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}
/** Instant of an Israeli wall-clock time (handles summer time). */
export function israelIso(date: string, hhmm: string): string {
  const [y, mo, d] = date.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want - 2 * 3600_000;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    const seen = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    if (seen === want) break;
    t += want - seen;
  }
  return new Date(t).toISOString();
}
/** C11 "להזכיר שעה לפני": when the Worker should send the reminder ('' without a start hour). */
export const remindAt = (date: string, from: string, minutesBefore = 60) => (normTime(from) ? new Date(new Date(israelIso(date, normTime(from))).getTime() - minutesBefore * 60_000).toISOString() : '');

// ---------- drawing ----------
/** F2 month mark under a day number: 3px per person (+2), capped to the cell. */
export const barWidth = (n: number) => (n > 0 ? Math.min(3 * n + 2, 30) : 0);
/** F1 week bars: 7px per person, scaled down when a busy day would overflow 42px; an empty day is a 2px line. */
export function barHeights(counts: number[]): number[] {
  const max = Math.max(0, ...counts);
  const unit = max * 7 > 42 ? 42 / max : 7;
  return counts.map((n) => (n > 0 ? Math.max(4, Math.round(n * unit)) : 2));
}
/** Position on the F3 axis (0..100, from the start side). */
export const axisPct = (hhmm: string) => Math.max(0, Math.min(100, ((minutes(hhmm) / 60 - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100));
export function barSpan(h: Hours): { start: number; width: number } {
  const start = h.from ? axisPct(h.from) : 0;
  const end = h.to ? axisPct(h.to) : 100;
  return { start: round2(start), width: round2(Math.max(2, end - start)) };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Hebrew wording ----------
/** Grammatical gender: the shared rule in v2/gender.ts. */
export function isFemale(name: string, gender?: string): boolean { return sharedIsFemale(name, gender); }
/** "מגיעה" / "מגיע" style pick. */
export const g = (female: boolean, m: string, f: string) => (female ? f : m);
/** F1 hero line end: "כל היום" / "עד 14:00" / "מגיעה ב־15:00". */
export function heroHours(e: Pick<Entry, 'hours' | 'status'>, female: boolean): string {
  if (e.status === 'later') return `${g(female, 'מגיע', 'מגיעה')} ב־${e.hours.from}`;
  if (!e.hours.to) return 'כל היום';
  return `עד ${e.hours.to}`;
}
/** F4 "כבר רשום אצלך": "כל היום" / "בוקר, עד 13:00" / "אחה״צ, מ־13:00" / "09:00–14:00". */
export function entryText(h: Hours): string {
  const l = labelOf(h);
  if (l === 'allDay') return 'כל היום';
  if (l === 'morning') return `בוקר, עד ${h.to}`;
  if (l === 'afternoon') return `אחה״צ, מ־${h.from}`;
  return rangeText(h);
}
/** C5 "השבוע בחווה": "09:00–14:00" / "כל היום" / "מ־12:00" / "עד 13:00". */
export function rangeText(h: Hours): string {
  if (isAllDay(h)) return 'כל היום';
  if (h.from && h.to) return `${h.from}–${h.to}`;
  return h.from ? `מ־${h.from}` : `עד ${h.to}`;
}
/** F3 bar label: "כל היום", "09–14", or for the viewer while here: "עד 13:00". */
export function barLabel(h: Hours, mineNow: boolean): string {
  if (isAllDay(h)) return 'כל היום';
  if (mineNow && h.to) return `עד ${h.to}`;
  if (h.from && h.to) return `${shortHour(h.from)}–${shortHour(h.to)}`;
  return h.from ? `מ־${shortHour(h.from)}` : `עד ${shortHour(h.to)}`;
}
/** "שמירה · 3 ימים" */
export const saveLabel = (n: number) => `שמירה · ${n === 1 ? 'יום אחד' : n === 2 ? 'יומיים' : `${n} ימים`}`;
/** Hebrew "and": "ביצים ולחם", "ביצים, חלב ולחם". */
export function joinHe(words: string[]): string {
  const w = words.filter(Boolean);
  if (w.length <= 1) return w[0] || '';
  const last = w[w.length - 1];
  const and = /^[א-ת]/.test(last) ? `ו${last}` : `ו־${last}`;
  return `${w.slice(0, -1).join(', ')} ${and}`;
}
/** Crew line in F6: "בני, נועה, יואב, דנה ועוד 2". */
export function namesLine(names: string[], show = 4): string {
  const first = names.slice(0, show).map(firstOf);
  return names.length > show ? `${first.join(', ')} ועוד ${names.length - show}` : joinHe(first);
}

// ---------- the activity feed (F5, F1 "נעשו היום") ----------
export type Act = { id: string; kind: string; refId: string; action: string; text: string; by: { uid: string; name: string }; at: string };
export type FeedLine = { id: string; at: string; by: { uid: string; name: string }; kind: 'done' | 'added' | 'addedShop' | 'bought'; refIds: string[]; titles: string[] };
/** The activity that counts as "what people did": task created and done, shopping added and bought. */
export const feedWorthy = (a: Act) => (a.kind === 'task' && (a.action === 'done' || a.action === 'created')) || (a.kind === 'shopping' && (a.action === 'bought' || a.action === 'created' || a.action === 'added'));
/** The item's name inside an activity text: "ביצים · 2 תבניות" -> "ביצים". */
export const titleOf = (text: string) => (text || '').split(' · ')[0].trim();
/** Newest first; consecutive purchases by the same person within 10 minutes become one line ("נועה קנתה ביצים ולחם"). */
export function feedLines(acts: Act[]): FeedLine[] {
  const sorted = acts.filter(feedWorthy).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const out: FeedLine[] = [];
  const seen = new Set<string>();
  for (const a of sorted) {
    const kind: FeedLine['kind'] = a.kind === 'task' ? (a.action === 'done' ? 'done' : 'added') : a.action === 'bought' ? 'bought' : 'addedShop';
    const key = `${kind}:${a.refId}`;
    if (seen.has(key)) continue; // done, undone, done again: the latest one is enough
    seen.add(key);
    const prev = out[out.length - 1];
    if (kind === 'bought' && prev && prev.kind === 'bought' && prev.by.uid === a.by.uid && Math.abs(new Date(prev.at).getTime() - new Date(a.at).getTime()) <= 10 * 60_000) {
      prev.refIds.push(a.refId); prev.titles.push(titleOf(a.text)); continue;
    }
    out.push({ id: a.id, at: a.at, by: a.by, kind, refIds: [a.refId], titles: [titleOf(a.text)] });
  }
  return out;
}
/** F5 counts: tasks done, shopping bought, and how many people did something. */
export function feedCounts(acts: Act[]) {
  const done = new Set(acts.filter((a) => a.kind === 'task' && a.action === 'done').map((a) => a.refId));
  const bought = new Set(acts.filter((a) => a.kind === 'shopping' && a.action === 'bought').map((a) => a.refId));
  const people = new Set(acts.filter(feedWorthy).map((a) => a.by.uid));
  return { done: done.size, bought: bought.size, people: people.size };
}
/** The sentence of a feed line: "יואב סיים: רשתות צל", "דנה הוסיפה לקניות: חלב 3%", "נועה קנתה ביצים ולחם". */
export function feedSentence(l: FeedLine, female: boolean): string {
  const who = firstOf(l.by.name);
  if (l.kind === 'done') return `${who} ${g(female, 'סיים', 'סיימה')}: ${l.titles[0]}`;
  if (l.kind === 'added') return `${who} ${g(female, 'הוסיף', 'הוסיפה')} משימה: ${l.titles[0]}`;
  if (l.kind === 'addedShop') return `${who} ${g(female, 'הוסיף', 'הוסיפה')} לקניות: ${l.titles[0]}`;
  return `${who} ${g(female, 'קנה', 'קנתה')} ${joinHe(l.titles)}`;
}

// ---------- C11 item kinds (as the old calendar) ----------
export type TeamKind = 'meeting' | 'planning' | 'manual';
export const TEAM_KINDS: { value: TeamKind; label: string }[] = [{ value: 'meeting', label: 'פגישת צוות' }, { value: 'planning', label: 'הכנות לפסטיבל' }, { value: 'manual', label: 'פריט אחר' }];
/** The kind a manager can choose for an existing item ('manual' for anything else). */
export const teamKindOf = (kind: string): TeamKind => (kind === 'meeting' || kind === 'planning' ? kind : 'manual');
/** The label of a chosen kind, shown on the row when nothing else is ('' for "פריט אחר"). */
export const teamKindLabel = (kind: string) => (kind === 'meeting' || kind === 'planning' ? TEAM_KINDS.find((k) => k.value === kind)!.label : '');
/** `kind` goes into the write on a new item, and on an edit only when it changed (an old item keeps its exact shape). */
export function kindToSave(chosen: TeamKind | undefined, existingKind?: string): TeamKind | undefined {
  if (existingKind === undefined) return chosen || 'manual';
  return chosen && chosen !== teamKindOf(existingKind) ? chosen : undefined;
}

// ---------- presence legend (owners and managers vs volunteers) ----------
/** Volunteers' presence is drawn outlined, owners' and managers' filled (as the old calendar). Unknown people are drawn filled. */
export const isVolunteer = (role?: string) => role === 'staff';
/** F4 for managers: whose presence the form registers. Me first, then the active team (owners, managers, volunteers) by name. */
export function presencePeople<P extends { uid: string; displayName: string; status?: string; role?: string }>(team: P[], me: P): P[] {
  const others = team.filter((p) => p.uid !== me.uid && (p.status === undefined || p.status === 'active') && (p.role === undefined || ['owner', 'manager', 'staff'].includes(p.role)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
  return [me, ...others];
}

// ---------- F4 save plan ----------
export type PresenceOp = { op: 'set' | 'update'; id: string; date: string; data: Record<string, unknown> };
/** One write per chosen day: the person's existing entry that day is updated (and extra ones removed by the caller), otherwise a new entry. */
export function presencePlan(days: string[], items: CalItem[], who: { uid: string; name: string }, hours: Hours, note: string, newId: () => string, nowIso: string): PresenceOp[] {
  const fields = { from: hours.from, to: hours.to, time: timeText(hours), note: note.trim().slice(0, 200), title: `${firstOf(who.name)} בחווה` };
  return [...new Set(days)].sort().map((date) => {
    const mine = presenceOf(items, who.uid, date).find((it) => it.kind === 'presence');
    if (mine) return { op: 'update', id: mine.id, date, data: { ...fields, date } };
    return { op: 'set', id: newId(), date, data: { ...fields, date, kind: 'presence', ownerUid: who.uid, ownerName: who.name, refId: '', createdAt: nowIso } };
  });
}
