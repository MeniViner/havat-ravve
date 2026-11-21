// Tasks area (v2): pure helpers (tested in tests/v2-tasks.mjs), data hooks and actions for tasks, places, recurring templates,
// the shared add form (tasks and shopping items) and the day summary. Everything goes through db.ts: the same code runs on the
// demo sandbox and on Firestore, and every write is applied locally at once (offline first). Take / release / assign use
// transact(); a ConflictError is shown by the screen as X1.
import { useMemo } from 'react';
import { useList, useDoc, write, newId, transact, ConflictError, isConflict } from '../../db';
import { nowIso, nowMs, todayKey, dateKeyOf } from '../../clock';
import { logActivity, taskKind } from '../../activity';
import { addTask, editTask, editShopping, type NewTask } from '../../store';
import { addShopItem, setItemPhoto } from './shopping';
import { notify } from './notify';
import { byPriority } from '../../taskOrder';
import { firstName, hhmm, dayName, ddmm, daysFromToday } from '../format';
import { gw } from '../gender';
import type { Actor, Profile, Task, Template, Place, ShoppingItem, ShoppingCategory, CalendarItem, Activity, FarmEvent } from '../../types';

// ======================= pure helpers =======================

/** The profile behind an actor, when the screen has the team (an explicit gender wins over the name guess). */
export type ProfileOf = (uid: string) => Profile | undefined;
/** The verb form for this actor: "ביקש" / "ביקשה", "לקח" / "לקחה". */
export const gwA = (a: Actor | null | undefined, male: string, female: string, profileOf?: ProfileOf) =>
  gw(a?.name || '', male, female, a?.uid && profileOf ? profileOf(a.uid) : undefined);

const DAY = 86400_000;
/** A done task stays on the root, struck through, for this long; then it lives in history (T6). Decided by the owner. */
export const DONE_VISIBLE_MS = 24 * 3600_000;

/** Old task documents miss fields that later versions added: every reader goes through this. */
export function normalizeTask(raw: Partial<Task> & { id: string }): Task {
  const by: Actor = raw.createdBy && typeof raw.createdBy === 'object' ? raw.createdBy : { uid: '', name: '' };
  return {
    ...raw,
    id: raw.id,
    title: raw.title || '',
    note: raw.note || '',
    photo: raw.photo || '',
    location: raw.location && typeof raw.location.lat === 'number' ? raw.location : null,
    dueDate: raw.dueDate || '',
    managersOnly: !!raw.managersOnly,
    templateId: raw.templateId || null,
    dateKey: raw.dateKey || null,
    createdBy: by,
    createdAt: raw.createdAt || '',
    done: !!raw.done,
    doneBy: raw.doneBy || null,
    doneAt: raw.doneAt || null,
    donePhoto: raw.donePhoto || '',
    doneNote: raw.doneNote || '',
    assignee: raw.assignee && raw.assignee.uid ? raw.assignee : null,
    urgent: !!raw.urgent,
    eventId: raw.eventId || '',
    updatedAt: raw.updatedAt || raw.createdAt || '',
  };
}

/** Recurring instances get the template's place and default person when the instance itself has none (display only). */
export function withTemplateDefaults(t: Task, templates: Template[], places: Place[]): Task {
  if (!t.templateId) return t;
  const tpl = templates.find((x) => x.id === t.templateId);
  if (!tpl) return t;
  let out = t;
  if (!t.location && tpl.placeId) {
    const p = places.find((x) => x.id === tpl.placeId);
    if (p) out = { ...out, location: { lat: p.lat, lng: p.lng, placeId: p.id, placeName: p.name } };
  }
  if (!t.assignee && tpl.assignee) out = { ...out, assignee: tpl.assignee };
  return out;
}

/** Who asked for it (T3 "ביקש"): requestedBy when someone asked on another's behalf, otherwise the creator. */
export const requesterOf = (t: Task): Actor => t.requestedBy || t.createdBy;
export const isMine = (t: Task, uid: string) => t.assignee?.uid === uid;
export const isFree = (t: Task) => !t.assignee;
/** Open and due today, overdue or undated: what "today" means on the root. */
export const isForToday = (t: Task, today: string) => !t.done && (!t.dueDate || t.dueDate <= today);
/** On the root: open tasks, and done tasks for 24 hours. */
export const rootVisible = (t: Task, now: number) => !t.done || (!!t.doneAt && now - Date.parse(t.doneAt) < DONE_VISIBLE_MS);
const doneToday = (t: Task, today: string) => t.done && !!t.doneAt && dateKeyOf(new Date(t.doneAt)) === today;

/** "N מתוך M שלך בוצעו": my open tasks for today plus my tasks done today. */
export function progressOf(tasks: Task[], uid: string, today: string) {
  const mine = tasks.filter((t) => isMine(t, uid) && (isForToday(t, today) || doneToday(t, today)));
  return { total: mine.length, done: mine.filter((t) => t.done).length };
}
export function progressCaption(done: number, total: number) {
  const base = `${done} מתוך ${total} שלך בוצעו`;
  return total - done === 1 && total > 1 ? `${base}. נשארה אחת` : base;
}

/** "הבא בתור": my most pressing open task for today (urgent, overdue, due today, oldest first). */
export function pickNextUp(tasks: Task[], uid: string, today: string): Task | null {
  const mine = tasks.filter((t) => isMine(t, uid) && isForToday(t, today));
  return [...mine].sort(byPriority(uid, today))[0] || null;
}

/** A row under its place header does not repeat the place: "לסדר את ארגז הכלים במכולה" -> "לסדר את ארגז הכלים".
 *  Only a one-letter prefix (ב/ל/מ) is removed; `short` (C7, where titles stand alone) also drops "ליד / מעל / מאחורי <place>". */
export function stripPlace(title: string, placeName?: string, short = false) {
  if (!placeName) return title;
  const names = [placeName, placeName.replace(/^ה/, '')];
  const preps = short ? ['ב', 'ל', 'מ', 'ליד ', 'מעל ', 'מאחורי ', 'בתוך ', 'ליד ה', 'מעל ה'] : ['ב', 'ל', 'מ'];
  for (const n of names) for (const p of preps) {
    const tail = ' ' + p + n;
    if (title.endsWith(tail) && title.length > tail.length) return title.slice(0, -tail.length).trim();
  }
  const words = placeName.split(/\s+/).filter((w) => w.length > 2);
  const m = title.match(/^(.*\S)\s+([בלמ])(\S+)$/);
  if (!m) return title;
  const tail = m[3].replace(/^ה/, '');
  return words.some((w) => w === m[3] || w === tail || w.replace(/^ה/, '') === tail) ? m[1] : title;
}

/** "היום" / "מחר" / "שישי 4.12". */
export function dueText(due: string, today: string) {
  if (!due) return '';
  const d = Math.round((Date.parse(due + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / DAY);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  return `${dayName(due)} ${ddmm(due)}`;
}
/** "היום" / "מחר" / "שישי, 27.11" (T3 "עד מתי"). */
export function dueLong(due: string, today: string) {
  const s = dueText(due, today);
  return s === 'היום' || s === 'מחר' || s === 'אתמול' ? s : `${dayName(due)}, ${ddmm(due)}`;
}

export type RowView = 'place' | 'time' | 'later' | 'mine' | 'placeList';
/** The soft line under a task row. Copy follows T1, T2, T4, P6, L4. */
export function rowMeta(t: Task, o: { uid: string; view: RowView; today: string; now: number; profileOf?: ProfileOf }) {
  if (t.done) {
    const at = t.doneAt ? (o.now - Date.parse(t.doneAt) < 120_000 ? 'עכשיו' : daysAgo(t.doneAt, o.today) === 0 ? hhmm(t.doneAt) : ddmm(t.doneAt)) : '';
    return [`בוצע ${at}`.trim(), t.templateId ? 'שגרה' : t.doneBy ? firstName(t.doneBy.name) : ''].filter(Boolean).join(' · ');
  }
  const req = requesterOf(t);
  const asked = req.uid && req.uid !== o.uid && req.name ? `${firstName(req.name)} ${gwA(req, 'ביקש', 'ביקשה', o.profileOf)}` : '';
  const due = dueText(t.dueDate, o.today);
  let who: string;
  if (!t.assignee) who = 'פנויה';
  else if (t.assignee.uid === o.uid) who = asked || (due ? `עליך · ${due}` : 'עליך');
  else {
    const fresh = t.takenAt && o.now - Date.parse(t.takenAt) < 10 * 60_000 ? 'לפני רגע' : '';
    const askedOther = req.uid !== t.assignee.uid ? asked : '';
    who = [firstName(t.assignee.name), fresh || (o.view === 'later' ? askedOther : askedOther || due)].filter(Boolean).join(' · ');
  }
  const place = t.location?.placeName || '';
  switch (o.view) {
    case 'place': return [who, t.photo && !t.assignee ? 'עם תמונה' : ''].filter(Boolean).join(' · ');
    case 'time': return [place, who].filter(Boolean).join(' · ');
    case 'later': return [due, who].filter(Boolean).join(' · ');
    case 'mine': return t.assignee?.uid === o.uid ? [place || 'בלי מקום', !due ? '' : due === 'היום' ? 'היום' : `עד ${due}`].filter(Boolean).join(' · ') : who;
    case 'placeList': return [t.assignee ? firstName(t.assignee.name) : 'פנויה', due].filter(Boolean).join(' · ');
  }
}
const daysAgo = (iso: string, today: string) => Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(dateKeyOf(new Date(iso)) + 'T12:00:00Z')) / DAY);

export type Group = { key: string; title: string; placeId?: string; rows: Task[]; open?: number };
/** Open rows by priority (urgent, mine, overdue, due today, oldest), then done rows, latest first. */
export function ordered(rows: Task[], uid: string, today: string) {
  const open = rows.filter((t) => !t.done).sort(byPriority(uid, today));
  const done = rows.filter((t) => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return [...open, ...done];
}
/** T1 "לפי מקום": open tasks for today (future-dated ones wait in "לפי זמן"), by place. Done tasks stay out, except the
 *  ones ticked in this session (`kept`): those stay struck through in their group (T4), "בלי מקום" included.
 *  Places with an urgent task first, then the place whose task has waited longest; tasks without a place last.
 *  `open` is the count the header shows (open tasks only). `nameOf` gives the saved place's current name. */
export function groupByPlace(tasks: Task[], uid: string, today: string, nameOf: (placeId: string) => string | undefined = () => undefined, kept: ReadonlySet<string> = new Set()): Group[] {
  type G = Group & { oldest: string; urgent: boolean; open: number };
  const map = new Map<string, G>();
  for (const t of tasks) {
    if (!t.done && t.dueDate && t.dueDate > today) continue;
    const pid = t.location?.placeId || '';
    const key = pid || (t.location?.placeName ? 'n:' + t.location.placeName : '_none');
    if (t.done && !kept.has(t.id)) continue;
    const g: G = map.get(key) || { key, title: (pid && nameOf(pid)) || t.location?.placeName || 'בלי מקום', placeId: pid || undefined, rows: [], oldest: '9999', urgent: false, open: 0 };
    g.rows.push(t);
    // a task ticked a moment ago still holds its group's place in the order
    g.urgent ||= t.urgent; if (t.createdAt < g.oldest) g.oldest = t.createdAt;
    if (!t.done) g.open++;
    map.set(key, g);
  }
  const asOpen = (t: Task) => (t.done ? { ...t, done: false } : t);
  return [...map.values()]
    .sort((a, b) => Number(a.key === '_none') - Number(b.key === '_none') || Number(b.urgent) - Number(a.urgent) || a.oldest.localeCompare(b.oldest))
    .map(({ key, title, placeId, rows, open }) => ({ key, title, placeId, open, rows: [...rows].sort((x, y) => byPriority(uid, today)(asOpen(x), asOpen(y))) }));
}
/** T2 "לפי זמן" (open tasks only): להיום (incl. overdue) · השבוע (next 6 days) · בהמשך · בלי תאריך. */
export function groupByTime(tasks: Task[], uid: string, today: string): Group[] {
  const week = addDays(today, 6);
  const buckets: Record<string, Task[]> = { today: [], week: [], later: [], none: [] };
  for (const t of tasks) {
    if (t.done) continue;
    const d = t.dueDate;
    buckets[!d ? 'none' : d <= today ? 'today' : d <= week ? 'week' : 'later'].push(t);
  }
  const titles: Record<string, string> = { today: 'להיום', week: 'השבוע', later: 'בהמשך', none: 'בלי תאריך' };
  return Object.entries(buckets).filter(([, rows]) => rows.length).map(([key, rows]) => ({
    key, title: titles[key],
    // by time, what is on me comes first (T2), then the usual priority
    rows: key === 'today' || key === 'none' ? ordered(rows, uid, today).sort((a, b) => Number(!isMine(a, uid)) - Number(!isMine(b, uid))) :[...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt)),
  }));
}

export const addDays = (key: string, n: number) => new Date(Date.parse(key + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const weekday = (key: string) => new Date(key + 'T12:00:00Z').getUTCDay();
/** "השבוע" in the add form: the coming Saturday (the end of the Israeli week); today when today is Saturday. */
export const endOfWeek = (today: string) => addDays(today, (6 - weekday(today) + 7) % 7);

// ---------- recurring ----------
const LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
/** [] or all seven = "כל יום"; otherwise "א׳ ג׳ ה׳". */
export const daysLabel = (days: number[]) => (!days.length || days.length === 7 ? 'כל יום' : [...days].sort().map((d) => LETTERS[d]).join(' '));
/** L1 row meta: "כל יום · 06:30 · בני" · "א׳ ג׳ ה׳ · 07:00 · מי שפנוי" · "ב׳ · מנהלים בלבד". */
export function templateMeta(t: Pick<Template, 'days' | 'time' | 'managersOnly' | 'assignee'>) {
  const who = t.managersOnly ? 'מנהלים בלבד' : t.assignee ? firstName(t.assignee.name) : 'מי שפנוי';
  return [daysLabel(t.days || []), t.time, who].filter(Boolean).join(' · ');
}
/** Normalised days for saving: all seven are stored as [] (every day), as the old app did. */
export const daysToSave = (days: number[]) => (days.length === 7 ? [] : [...new Set(days)].sort());
/** Does the template create an instance on this date? Mirrors store.materializeToday. */
export const dueOn = (t: Pick<Template, 'active' | 'days'>, key: string) => t.active && (!t.days.length || t.days.includes(weekday(key)));

// ---------- places ----------
/** L3 row meta: open task count, otherwise the event the place is busy with, the routine done there, or nothing open. */
export function placeMeta(placeId: string, open: Task[], templates: Template[], events: Pick<FarmEvent, 'id' | 'title'>[]) {
  const here = open.filter((t) => t.location?.placeId === placeId && !t.done);
  const ev = here.length && here.every((t) => t.eventId && t.eventId === here[0].eventId) ? events.find((e) => e.id === here[0].eventId) : undefined;
  if (ev) return `לקראת ${ev.title}`;
  if (here.length === 1) return 'משימה אחת';
  if (here.length > 1) return `${here.length} משימות פתוחות`;
  const tpl = templates.find((t) => t.active && t.placeId === placeId);
  if (tpl) return `שגרה: ${tpl.title}`;
  return 'אין משימות פתוחות';
}
/** L3 order (as the design): the most open everyday tasks first; then places with none; places a routine runs at after
 *  those; places busy only with an event's tasks ("לקראת …") last. Ties keep the given order. */
export function sortPlaces<P extends Pick<Place, 'id'>>(places: P[], open: Task[], templates: Pick<Template, 'active' | 'placeId'>[]): P[] {
  const rank = (id: string, i: number) => {
    const here = open.filter((t) => !t.done && t.location?.placeId === id);
    const everyday = here.filter((t) => !t.eventId).length;
    const tier = everyday ? 0 : here.length ? 3 : templates.some((t) => t.active && t.placeId === id) ? 2 : 1;
    return { tier, n: everyday, i };
  };
  return places.map((p, i) => ({ p, r: rank(p.id, i) }))
    .sort((a, b) => a.r.tier - b.r.tier || b.r.n - a.r.n || a.r.i - b.r.i)
    .map((x) => x.p);
}
/** Metres between two points (equirectangular is plenty inside a farm). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.PI / 180;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}
/** "כאן, לפי המיקום שלי": the saved place within `max` metres, if any. */
export function nearestPlace(pos: { lat: number; lng: number }, places: Place[], max = 60): Place | null {
  let best: Place | null = null; let bd = Infinity;
  for (const p of places) { const d = distanceM(pos, p); if (d < bd) { bd = d; best = p; } }
  return best && bd <= max ? best : null;
}

// ---------- the add form: understanding what was typed ----------
const PLACE_STOP = new Set(['ליד', 'מאחורי', 'מעל', 'בתוך', 'אזור', 'שורת']);
/** A place named in the text: "לתקן את הברז ליד החממה" -> חממה. */
export function suggestPlace(text: string, places: Pick<Place, 'id' | 'name'>[]): string | null {
  // every reading of a word's prefix letters: "במכולה" -> במכולה, מכולה, כולה (and without a leading ה)
  const stems = new Set<string>();
  for (const w of text.split(/[\s,.]+/)) {
    for (let i = 0; i <= 2 && i < w.length; i++) {
      if (i > 0 && !'ובלמה'.includes(w[i - 1])) break;
      const s = w.slice(i);
      if (s.length >= 3) { stems.add(s); stems.add(s.replace(/^ה/, '')); }
    }
  }
  for (const p of places) {
    const parts = p.name.split(/\s+/).filter((w) => w.length > 2 && !PLACE_STOP.has(w)).map((w) => w.replace(/^ה/, ''));
    if (parts.some((w) => stems.has(w))) return p.id;
  }
  return null;
}
const URGENT = /(^|[\s,.])דחוף(?=$|[\s,.!])/;
const UNITS: Record<string, string> = { 'שקי': 'שקים', 'שק': 'שק', 'שקים': 'שקים', 'קרטוני': 'קרטונים', 'קרטונים': 'קרטונים', 'בקבוקי': 'בקבוקים', 'בקבוקים': 'בקבוקים', 'חבילות': 'חבילות', 'חבילת': 'חבילה', 'ארגזי': 'ארגזים', 'ארגזים': 'ארגזים', 'תבניות': 'תבניות', 'מטר': 'מטר', 'מטרים': 'מטר', 'ק״ג': 'ק״ג', 'קילו': 'קילו', 'ליטר': 'ליטר', 'גלילי': 'גלילים', 'גלילים': 'גלילים', 'קופסאות': 'קופסאות', 'קופסת': 'קופסה', 'יחידות': 'יחידות', 'זוגות': 'זוגות', 'זוג': 'זוג' };
const CATEGORY_WORDS: [ShoppingCategory, RegExp][] = [
  ['building', /מלט|בטון|ברגים|בורג|מסמרים|צבע|צינור|לוח|לוחות|עץ|גדר|רשת|חול|טיח|סיליקון|דבק|ברז|מקדח|פלטה|קרש/],
  ['online', /להזמין|אמזון|עלי|אונליין|באתר|באינטרנט/],
  ['super', /חלב|לחם|ביצים|קפה|סוכר|תה|גבינה|ירקות|פירות|שקיות|סבון|נייר|מים|מיץ|עוגיות|שמן/],
];
/** S5: "2 שקי מלט לגדר, דחוף" -> { title: "מלט לגדר", qty: "2 שקים", urgent: true, category: "building" }. */
export function parseShopping(text: string): { title: string; qty: string; urgent: boolean; category: ShoppingCategory | null } {
  let s = text.trim().replace(/^(צריך\s+)?לקנות\s+/, '');
  const urgent = URGENT.test(s);
  if (urgent) s = s.replace(/[\s,]*דחוף[!.]?/g, ' ').replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  let qty = '';
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+)$/);
  if (m && UNITS[m[2]]) { qty = `${m[1]} ${UNITS[m[2]]}`; s = m[3]; }
  else { const n = s.match(/^(\d+)\s+(.+)$/); if (n) { qty = n[1]; s = n[2]; } }
  const category = CATEGORY_WORDS.find(([, re]) => re.test(s))?.[0] || null;
  return { title: s, qty, urgent, category };
}
/** Typed into the capture bar: does it read like something to buy? */
export function guessKind(text: string): 'task' | 'shopping' {
  const s = text.trim();
  if (/^(צריך\s+)?לקנות\s|^קנייה\s/.test(s)) return 'shopping';
  const p = parseShopping(s);
  if (p.qty && p.qty.includes(' ')) return 'shopping';
  if (/^(ל|לה)\S+/.test(s)) return 'task'; // infinitive verbs: "לתקן", "להעביר"
  return p.category ? 'shopping' : 'task';
}
/** Task text: "דחוף" written in the text marks it urgent and leaves the title. */
export function parseTaskText(text: string) {
  const urgent = URGENT.test(text);
  const title = urgent ? text.replace(/[\s,]*דחוף[!.]?/g, ' ').replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '') : text.trim();
  return { title, urgent };
}
export const SHOP_LISTS: { id: ShoppingCategory; label: string }[] = [
  { id: 'super', label: 'סופר' }, { id: 'building', label: 'בניין' }, { id: 'online', label: 'אינטרנט' }, { id: 'giveaway', label: 'מחפשים' },
];
export const fixLink = (v: string) => { const s = v.trim(); return !s ? '' : /^https:\/\//i.test(s) ? s : 'https://' + s.replace(/^http:\/\//i, ''); };

// ---------- presence (C4) ----------
/** Hours of a presence entry: v2 from/to, or the older "08:00–11:00" text. null = all day. */
export function presenceHours(c: Pick<CalendarItem, 'time' | 'from' | 'to'>): { from: string; to: string } | null {
  if (c.from || c.to) return { from: c.from || '00:00', to: c.to || '23:59' };
  const m = (c.time || '').match(/(\d{1,2}:\d{2})\s*[–\-—]\s*(\d{1,2}:\d{2})/);
  return m ? { from: m[1].padStart(5, '0'), to: m[2].padStart(5, '0') } : null;
}
export type PresenceState = { here: boolean; text: string; order: number };
/** "עד 13:00" / "כל היום" when here now; "מגיעה ב־15:00" / "מגיע ב־15:00" later today; "היום עד 11:00" after; "לא רשום היום". */
export function presenceOf(entries: Pick<CalendarItem, 'time' | 'from' | 'to'>[], nowHHMM: string, female = false): PresenceState {
  if (!entries.length) return { here: false, text: 'לא רשום היום', order: 3 };
  const hours = entries.map(presenceHours);
  if (hours.some((h) => h === null)) return { here: true, text: 'כל היום', order: 0 };
  const hs = hours as { from: string; to: string }[];
  const now = hs.find((h) => h.from <= nowHHMM && nowHHMM < h.to);
  if (now) return { here: true, text: `עד ${now.to}`, order: 0 };
  const next = hs.filter((h) => h.from > nowHHMM).sort((a, b) => a.from.localeCompare(b.from))[0];
  if (next) return { here: false, text: `${female ? "מגיעה" : "מגיע"} ב־${next.from}`, order: 1 };
  const last = [...hs].sort((a, b) => b.to.localeCompare(a.to))[0];
  return { here: false, text: `היום עד ${last.to}`, order: 2 };
}
/** "2 משימות היום" / "משימה אחת היום" / "אין משימות היום". */
export const loadText = (n: number) => (n === 0 ? 'אין משימות היום' : n === 1 ? 'משימה אחת היום' : `${n} משימות היום`);

// ---------- history (T6) and day end (C7) ----------
export type DayGroup = { key: string; title: string; rows: Task[] };
export function historyGroups(done: Task[], today: string): DayGroup[] {
  const map = new Map<string, Task[]>();
  for (const t of [...done].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))) {
    const k = t.doneAt ? dateKeyOf(new Date(t.doneAt)) : '';
    map.set(k, [...(map.get(k) || []), t]);
  }
  return [...map.entries()].map(([k, rows]) => {
    const d = Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(k + 'T12:00:00Z')) / DAY);
    return { key: k, title: d === 0 ? 'היום' : d === 1 ? 'אתמול' : `${dayName(k)} ${ddmm(k)}`, rows };
  });
}
/** "יואב 4 · נועה 4 · דנה 2 · בני 1": doers by count. */
export function countsByPerson(done: Task[]) {
  const m = new Map<string, { uid: string; name: string; n: number }>();
  for (const t of done) {
    if (!t.doneBy) continue;
    const e = m.get(t.doneBy.uid) || { uid: t.doneBy.uid, name: t.doneBy.name, n: 0 };
    e.n++; m.set(t.doneBy.uid, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'he'));
}
export function historyMeta(t: Task) {
  return [t.doneBy ? firstName(t.doneBy.name) : '', t.doneAt ? hhmm(t.doneAt) : '', t.templateId ? 'שגרה' : t.donePhoto ? 'עם תמונה' : ''].filter(Boolean).join(' · ');
}
export function matchesSearch(t: Task, q: string) {
  const s = q.trim();
  if (!s) return true;
  return [t.title, t.location?.placeName, t.doneBy?.name, t.assignee?.name].some((v) => v && v.includes(s));
}
/** C7: what I closed today, the team bars and what waits for me tomorrow. */
export function dayEnd(doneTodayTasks: Task[], open: Task[], uid: string, today: string) {
  const mine = doneTodayTasks.filter((t) => t.doneBy?.uid === uid).sort((a, b) => (a.doneAt || '').localeCompare(b.doneAt || ''));
  const team = countsByPerson(doneTodayTasks);
  const tomorrow = addDays(today, 1);
  const waiting = open.filter((t) => !t.done && isMine(t, uid) && (!t.dueDate || t.dueDate <= tomorrow)).length;
  return { mine, team, total: doneTodayTasks.length, waiting };
}
export const waitingText = (n: number) => (n === 0 ? 'מחר אין משימות שמחכות לך' : n === 1 ? 'מחר מחכה לך משימה אחת' : `מחר מחכות לך ${n} משימות`);

// ---------- the timeline of one task (T3 "מה קרה עד עכשיו") ----------
/** From the activity log when it has entries; otherwise from the task document itself (older tasks, demo rows). */
export function timeline(t: Task, activity: Pick<Activity, 'action' | 'text' | 'by' | 'at' | 'subjectUid'>[], fmt: (iso: string) => string, profileOf?: ProfileOf): string[] {
  const fn = (a?: Actor | null) => (a?.name ? firstName(a.name) : '');
  const lines: { at: string; text: string }[] = [];
  const acts = [...activity].sort((a, b) => a.at.localeCompare(b.at));
  // "יואב לקח אותה" / "נועה לקחה אותה": [masculine, feminine] per action
  const say = (a: Actor | null | undefined, m: string, f: string, rest: string) => `${fn(a)} ${gwA(a, m, f, profileOf)} ${rest}`;
  if (!acts.some((a) => a.action === 'created') && t.createdAt) lines.push({ at: t.createdAt, text: say(t.createdBy, 'יצר', 'יצרה', 'את המשימה') });
  if (acts.length) {
    for (const a of acts) {
      const to = a.text.includes(' ← ') ? a.text.split(' ← ').pop() || '' : '';
      const text =
        a.action === 'created' ? say(a.by, 'יצר', 'יצרה', 'את המשימה')
        : a.action === 'assigned' ? (a.subjectUid && a.subjectUid === a.by.uid ? say(a.by, 'לקח', 'לקחה', 'אותה') : say(a.by, 'העביר', 'העבירה', `ל${firstName(to)}`))
        : a.action === 'released' ? say(a.by, 'שחרר', 'שחררה', 'אותה')
        : a.action === 'done' ? say(a.by, 'סימן', 'סימנה', 'בוצע')
        : a.action === 'undone' ? say(a.by, 'החזיר', 'החזירה', 'לביצוע')
        : a.action === 'photo' ? say(a.by, 'הוסיף', 'הוסיפה', 'תמונה')
        : a.action === 'note' ? say(a.by, 'הוסיף', 'הוסיפה', 'הערה')
        : a.action === 'urgent' ? say(a.by, 'סימן', 'סימנה', 'דחוף')
        : a.action === 'edited' ? say(a.by, 'ערך', 'ערכה', 'את המשימה')
        : '';
      if (text) lines.push({ at: a.at, text });
    }
  } else {
    if (t.assignee && t.takenAt) lines.push({ at: t.takenAt, text: say(t.assignee, 'לקח', 'לקחה', 'אותה') });
    if (t.done && t.doneAt) lines.push({ at: t.doneAt, text: say(t.doneBy, 'סימן', 'סימנה', 'בוצע') });
  }
  return lines.sort((a, b) => a.at.localeCompare(b.at)).map((l) => `${fmt(l.at)} · ${l.text}`);
}

// ======================= hooks =======================
type Ctxish = { manager: boolean; templates: Template[]; places: Place[] };
const staffOnly = (manager: boolean): [string, '==', unknown][] => (manager ? [] : [['managersOnly', '==', false]]);
const norm = (rows: Task[]) => rows.map((r) => normalizeTask(r as Task & { id: string }));

/** The root list: open tasks plus tasks done in the last 24 hours, normalised and with template defaults. */
export function useRootTasks(ctx: Ctxish) {
  const open = useList<Task>('tasks', { where: [...staffOnly(ctx.manager), ['done', '==', false]], orderBy: [['createdAt', 'desc']] });
  // the cutoff moves in 10-minute steps so the listener is not re-created on every render
  const cutoff = new Date(Math.floor((nowMs() - DONE_VISIBLE_MS) / 600_000) * 600_000).toISOString();
  const done = useList<Task>('tasks', { where: [...staffOnly(ctx.manager), ['doneAt', '>=', cutoff]], orderBy: [['doneAt', 'desc']] });
  const items = useMemo(() => {
    const seen = new Set<string>(); const out: Task[] = [];
    for (const t of [...norm(open.items), ...norm(done.items)]) { if (seen.has(t.id)) continue; seen.add(t.id); out.push(withTemplateDefaults(t, ctx.templates, ctx.places)); }
    return out;
  }, [open.items, done.items, ctx.templates, ctx.places]);
  return { items, loading: open.loading || done.loading, error: open.error || done.error };
}
export function useTaskV2(id: string, ctx: Ctxish) {
  const r = useDoc<Task>('tasks/' + (id || '_'), !!id);
  const item = useMemo(() => (r.item ? withTemplateDefaults(normalizeTask(r.item as Task & { id: string }), ctx.templates, ctx.places) : null), [r.item, ctx.templates, ctx.places]);
  return { item, loading: r.loading, error: r.error };
}
export function useDoneBetween(manager: boolean, fromIso: string, toIso: string, max = 500) {
  const r = useList<Task>('tasks', { where: [...staffOnly(manager), ['doneAt', '>=', fromIso], ['doneAt', '<=', toIso]], orderBy: [['doneAt', 'desc']], limit: max });
  return { items: useMemo(() => norm(r.items), [r.items]), loading: r.loading, error: r.error };
}
export const useTasksAt = (placeId: string, manager: boolean) => {
  const r = useList<Task>('tasks', { where: [...staffOnly(manager), ['location.placeId', '==', placeId], ['done', '==', false]] }, !!placeId);
  return { items: useMemo(() => norm(r.items), [r.items]), loading: r.loading };
};
export const usePresenceToday = (today: string) => useList<CalendarItem>('calendar', { where: [['kind', '==', 'presence'], ['date', '==', today]] });
export const useShoppingDoc = (id: string) => useDoc<ShoppingItem>('shopping/' + (id || '_'), !!id);
/** Start of today in Israel as an ISO instant (Israel is UTC+2 or +3; the earliest of the two is safe for a ">=" query). */
export const startOfTodayIso = () => new Date(Date.parse(todayKey() + 'T00:00:00+03:00')).toISOString();

// ======================= actions =======================
const short = (s: string) => (s.length > 60 ? s.slice(0, 60) + '…' : s);

/** Ticking a task. A free task ticked by someone becomes theirs (so their progress counts it). */
export async function setDone(actor: Actor, t: Task, done: boolean) {
  const now = nowIso();
  const patch: Record<string, unknown> = done ? { done: true, doneBy: actor, doneAt: now, updatedAt: now } : { done: false, doneBy: null, doneAt: null, updatedAt: now };
  if (done && !t.assignee && !t.templateId) patch.assignee = actor;
  await write.update('tasks', t.id, patch);
  logActivity(actor, taskKind(t), t.id, done ? 'done' : 'undone', short(t.title), { subjectUid: t.assignee?.uid || actor.uid });
}
/** C6: done with a compressed photo (and an optional note) in one write. */
export async function doneWithPhoto(actor: Actor, t: Task, photo: string, note: string) {
  const now = nowIso();
  const patch: Record<string, unknown> = { updatedAt: now, doneNote: note.trim() };
  if (photo) patch.donePhoto = photo;
  if (!t.done) Object.assign(patch, { done: true, doneBy: actor, doneAt: now }, !t.assignee && !t.templateId ? { assignee: actor } : {});
  await write.update('tasks', t.id, patch);
  if (!t.done) logActivity(actor, taskKind(t), t.id, 'done', short(t.title), { subjectUid: t.assignee?.uid || actor.uid });
  if (photo) logActivity(actor, taskKind(t), t.id, 'photo', `${short(t.title)}${note.trim() ? ': ' + note.trim() : ''}`);
}
export async function setTaskPhoto(actor: Actor, t: Task, photo: string) {
  await write.update('tasks', t.id, { photo, updatedAt: nowIso() });
  logActivity(actor, taskKind(t), t.id, 'photo', short(t.title));
}
/** X1 for a take that came second: "לא נשמר. נועה לקחה את המשימה לפני רגע". `by` lets the screen re-word it with the profile. */
export const takenText = (by: Actor, profileOf?: ProfileOf) => `לא נשמר. ${firstName(by.name)} ${gwA(by, 'לקח', 'לקחה', profileOf)} את המשימה לפני רגע`;
const takenBy = (by: Actor) => Object.assign(new ConflictError(takenText(by)), { by });
/** "לקחת": only while still free (or already mine). */
export async function takeTask(actor: Actor, t: Task) {
  try {
    await transact(async (tx) => {
      const cur = await tx.get<Task>('tasks', t.id);
      if (!cur) throw new ConflictError('לא נשמר. המשימה כבר לא קיימת');
      if (cur.done) throw new ConflictError('לא נשמר. המשימה כבר בוצעה');
      if (cur.assignee && cur.assignee.uid !== actor.uid) throw takenBy(cur.assignee);
      const now = nowIso();
      tx.update('tasks', t.id, { assignee: actor, takenAt: now, updatedAt: now });
    });
  } catch (e) {
    // two people at the same moment: the slower commit comes back as a plain refusal. Read who has it now, so X1 names them.
    if (isConflict(e) && !(e as { by?: Actor }).by) {
      const cur = await transact((tx) => tx.get<Task>('tasks', t.id)).catch(() => null);
      if (cur?.assignee && cur.assignee.uid !== actor.uid) throw takenBy(cur.assignee);
    }
    throw e;
  }
  logActivity(actor, taskKind(t), t.id, 'assigned', `${short(t.title)} ← ${actor.name}`, { subjectUid: actor.uid });
}
/** Demo only (X1 with `refuseNext`): the sandbox refuses before anyone is known, so the screen plays out the case the design
 *  shows, a teammate taking it first. A plain local write: in demo db.ts never reaches Firestore. */
export async function playTakenInDemo(t: Task, by: Actor) {
  const at = nowIso();
  await write.update('tasks', t.id, { assignee: by, takenAt: at, updatedAt: at });
}
/** "לשחרר": back to free, only while it is still mine (a manager may release anyone's). */
export async function releaseTask(actor: Actor, t: Task, manager: boolean) {
  await transact(async (tx) => {
    const cur = await tx.get<Task>('tasks', t.id);
    if (!cur) throw new ConflictError('לא נשמר. המשימה כבר לא קיימת');
    if (!manager && cur.assignee && cur.assignee.uid !== actor.uid) throw new ConflictError(`לא נשמר. המשימה כבר על ${firstName(cur.assignee.name)}`);
    tx.update('tasks', t.id, { assignee: null, updatedAt: nowIso() });
  });
  logActivity(actor, taskKind(t), t.id, 'released', short(t.title), { subjectUid: actor.uid });
}
/** C4: who the task is on. Refused when someone else changed the assignee since the screen opened. Notifies the new person. */
export async function assignTask(actor: Actor, t: Task, to: Actor | null, seenUid: string | null) {
  await transact(async (tx) => {
    const cur = await tx.get<Task>('tasks', t.id);
    if (!cur) throw new ConflictError('לא נשמר. המשימה כבר לא קיימת');
    if (cur.done) throw new ConflictError('לא נשמר. המשימה כבר בוצעה');
    const now = (cur.assignee?.uid || null);
    if (now !== seenUid && now !== (to?.uid || null)) throw new ConflictError(cur.assignee ? `לא נשמר. המשימה כבר על ${firstName(cur.assignee.name)}` : 'לא נשמר. מישהו שינה את המשימה לפני רגע');
    const at = nowIso();
    tx.update('tasks', t.id, to ? { assignee: to, takenAt: at, updatedAt: at } : { assignee: null, updatedAt: at });
  });
  if (to) {
    logActivity(actor, taskKind(t), t.id, 'assigned', `${short(t.title)} ← ${to.name}`, { subjectUid: to.uid });
    if (to.uid !== actor.uid) await notify([to.uid], { kind: 'task', title: `משימה חדשה: ${short(t.title)}`, sub: `${firstName(actor.name)} ${gwA(actor, "העביר", "העבירה")} אליך`, link: `/tasks/${t.id}`, refId: t.id, by: actor }).catch(() => {});
  } else logActivity(actor, taskKind(t), t.id, 'released', short(t.title), { subjectUid: t.assignee?.uid || '' });
}

export type TaskInput = NewTask;
/** T5 add: the existing store action (activity log included), plus a notification when it is put on someone else. */
export async function createTask(actor: Actor, data: TaskInput) {
  const id = await addTask(actor, data);
  if (data.assignee && data.assignee.uid !== actor.uid) await notify([data.assignee.uid], { kind: 'task', title: `משימה חדשה: ${short(data.title)}`, sub: `${firstName(actor.name)} ${gwA(actor, "העביר", "העבירה")} אליך`, link: `/tasks/${id}`, refId: id, by: actor }).catch(() => {});
  return id;
}
export async function updateTask(actor: Actor, t: Task, data: Partial<TaskInput>) {
  await editTask(actor, t, data);
  if (data.assignee && data.assignee.uid !== t.assignee?.uid && data.assignee.uid !== actor.uid) await notify([data.assignee.uid], { kind: 'task', title: `משימה חדשה: ${short(data.title || t.title)}`, sub: `${firstName(actor.name)} ${gwA(actor, "העביר", "העבירה")} אליך`, link: `/tasks/${t.id}`, refId: t.id, by: actor }).catch(() => {});
}

export type ShopInput = { title: string; qty: string; note: string; link: string; category: ShoppingCategory; urgent: boolean; photo?: string };
/** S5 add: the existing ShoppingItem shape plus an optional taskId; the task gets shoppingId back (C3). */
/** The shopping area owns the shopping collection: adding goes through its addShopItem (urgent items tell the team,
 *  taskId is kept); here only the task side of the link (shoppingId) is written. */
export async function createShopping(actor: Actor, data: ShopInput, team: Profile[], taskId?: string) {
  const id = await addShopItem(actor, { ...data, title: data.title.trim(), link: fixLink(data.link), photo: data.photo || undefined, taskId: taskId || undefined }, team);
  if (taskId) await write.update('tasks', taskId, { shoppingId: id, updatedAt: nowIso() });
  return id;
}
/** Edit (/shopping/:id/edit) with the existing store helper; a changed photo through the shopping area's helper. */
export async function updateShopping(actor: Actor, item: ShoppingItem, data: ShopInput) {
  const { photo, ...rest } = data;
  await editShopping(actor, item, { ...rest, title: rest.title.trim(), qty: rest.qty.trim(), note: rest.note.trim(), link: fixLink(rest.link) });
  if (photo !== undefined && photo !== (item.photo || '')) await setItemPhoto(actor, item, photo);
}

// ---------- recurring templates (L1, L2) ----------
export type TemplateInput = { title: string; note: string; days: number[]; time: string; active: boolean; managersOnly: boolean; assignee: Actor | null; placeId: string };
/** New fields (assignee, placeId) are written only when they carry a value or the document already has them,
 *  so templates without them keep the old shape exactly. */
export async function saveTemplateV2(actor: Actor, data: TemplateInput, existing?: Template) {
  const now = nowIso();
  const base: Record<string, unknown> = { title: data.title.trim(), note: data.note, days: daysToSave(data.days), time: data.time.trim(), active: data.active, managersOnly: data.managersOnly, updatedAt: now };
  if (data.assignee || (existing && 'assignee' in existing)) base.assignee = data.managersOnly ? null : data.assignee;
  if (data.placeId || (existing && 'placeId' in existing)) base.placeId = data.placeId;
  if (existing) { await write.update('task_templates', existing.id, base); return existing.id; }
  const id = newId('task_templates');
  await write.set('task_templates', id, { ...base, createdBy: actor, createdAt: now });
  return id;
}
export const setTemplateActive = (t: Template, active: boolean) => write.update('task_templates', t.id, { active, updatedAt: nowIso() });
export const removeTemplate = (id: string) => write.remove('task_templates', id);
export const restoreTemplate = (t: Template) => { const { id, ...rest } = t; return write.set('task_templates', id, rest as Record<string, unknown>); };

// ---------- places (L3, L4) ----------
export type PlaceV2 = Place & { photo?: string; accuracy?: number; updatedAt?: string };
export async function createPlace(actor: Actor, name: string, pos: { lat: number; lng: number; accuracy?: number }) {
  const id = newId('places');
  const doc: Record<string, unknown> = { name: name.trim(), lat: pos.lat, lng: pos.lng, createdBy: actor, createdAt: nowIso() };
  if (pos.accuracy !== undefined) doc.accuracy = pos.accuracy;
  await write.set('places', id, doc);
  logActivity(actor, 'place', id, 'created', name.trim());
  return id;
}
export async function savePlace(actor: Actor, p: PlaceV2, data: { name: string; lat: number; lng: number; accuracy?: number; photo?: string }) {
  const patch: Record<string, unknown> = { name: data.name.trim(), lat: data.lat, lng: data.lng };
  if (data.accuracy !== undefined && data.accuracy !== p.accuracy) patch.accuracy = data.accuracy;
  if (data.photo !== undefined && data.photo !== (p.photo || '')) patch.photo = data.photo;
  await write.update('places', p.id, patch);
  logActivity(actor, 'place', p.id, 'edited', data.name.trim());
}
export async function removePlace(actor: Actor, p: PlaceV2) {
  await write.remove('places', p.id);
  logActivity(actor, 'place', p.id, 'deleted', p.name);
}
export const restorePlace = (p: PlaceV2) => { const { id, ...rest } = p; return write.set('places', id, rest as Record<string, unknown>); };

export { daysFromToday };
