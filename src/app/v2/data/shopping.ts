// Shopping area data (S1-S8): the four lists, the trip (someone is at the store), history and suggestions.
// Old shopping docs keep loading: every v2 field (tripId, notAvailable, notAvailableAt, foundWhere, taskId) is optional,
// and a write outside a trip keeps exactly the old document shape. All "now" from clock.ts, all writes offline-first via db.ts.
import { useMemo } from 'react';
import { useList, useDoc, write, newId } from '../../db';
import { nowIso, nowMs, todayKey, dateKeyOf } from '../../clock';
import { logActivity, useActivityFor } from '../../activity';
import { useDemo, useDemoStates } from '../../demo/store';
import { notify } from './notify';
import { deferDelete, isHidden, useHiddenVersion } from '../../defer';
import type { Activity, Actor, Profile, ShoppingCategory, ShoppingItem, ShoppingTrip } from '../../types';

// ---------- lists ----------
/** URL key (?list=) of each list. "giveaway" items are the מחפשים list (S2). */
export type ListKey = 'super' | 'building' | 'online' | 'wish';
export const LISTS: { key: ListKey; cat: ShoppingCategory; label: string }[] = [
  { key: 'super', cat: 'super', label: 'סופר' },
  { key: 'building', cat: 'building', label: 'בניין' },
  { key: 'online', cat: 'online', label: 'אינטרנט' },
  { key: 'wish', cat: 'giveaway', label: 'מחפשים' },
];
export const catOfKey = (k: string): ShoppingCategory => LISTS.find((l) => l.key === k)?.cat || 'super';
export const keyOfCat = (c: ShoppingCategory): ListKey => LISTS.find((l) => l.cat === c)?.key || 'super';
export const listLabel = (c: ShoppingCategory) => LISTS.find((l) => l.cat === c)?.label || 'סופר';
/** Capture-bar placeholder per list (S1 "להוסיף לסופר", S2 "מה מחפשים?", S3 "להוסיף לאינטרנט"). */
export const addPlaceholder = (c: ShoppingCategory) => (c === 'giveaway' ? 'מה מחפשים?' : `להוסיף ל${listLabel(c)}`);
/** The verb of "done" per list: bought / ordered online / found. */
export const doneWord = (c: ShoppingCategory) => (c === 'giveaway' ? 'נמצא' : c === 'online' ? 'הוזמן' : 'נקנה');

// ---------- Hebrew forms ----------
/** First name: "דנה אברהם" -> "דנה". */
export const first = (name: string) => (name || '').trim().split(/\s+/)[0] || '';
const FEMALE = new Set(['מיכל', 'אסתר', 'רחל', 'תמר', 'רות', 'יעל', 'שרון', 'אורלי', 'שירלי', 'נעמי', 'הדס', 'שני', 'כרמל', 'אביגיל', 'מרים', 'דבורה', 'ענבל', 'גלי', 'מורן', 'סיון', 'אילנית', 'ליאת', 'רוני']);
const MALE = new Set(['אליה', 'משה', 'שלמה', 'יונה', 'אריה', 'יהודה', 'נח', 'עזרא', 'ישעיה', 'ירמיה', 'זכריה', 'נחמיה', 'טוביה', 'עובדיה', 'אלישע', 'שמעיה', 'מתניה', 'יוסף', 'אהרן']);
/** Hebrew verbs follow the person. Uses Profile.gender when it exists ('f' | 'm'), else the first name. */
export function isFem(name: string, profile?: { gender?: string } | null): boolean {
  if (profile?.gender === 'f') return true;
  if (profile?.gender === 'm') return false;
  const f = first(name);
  if (FEMALE.has(f)) return true;
  if (MALE.has(f)) return false;
  return /(ה|ית)$/.test(f);
}
export const g = (name: string, m: string, f: string, profile?: { gender?: string } | null) => (isFem(name, profile) ? f : m);

// ---------- quantities (free text "6 קרטונים") ----------
/** Splits the leading number off a quantity: "6 קרטונים" -> 6 + "קרטונים"; "קופסה" -> 1 + "קופסה"; "" -> 1 + "". */
export function parseQty(qty: string): { n: number; unit: string } {
  const s = (qty || '').trim();
  const m = s.match(/^(\d+)\s*(.*)$/);
  if (m) return { n: Number(m[1]), unit: m[2].trim() };
  return { n: 1, unit: s };
}
/** Steps the number of a quantity, never below 1: stepQty("6 קרטונים", 1) -> "7 קרטונים". */
export function stepQty(qty: string, delta: number): string {
  const { n, unit } = parseQty(qty);
  const next = Math.max(1, n + delta);
  return unit ? `${next} ${unit}` : String(next);
}
/** What S4 shows for the amount: the text, or "1" when nobody wrote one. */
export const qtyText = (qty: string) => (qty || '').trim() || '1';

// ---------- derived lists ----------
const norm = (t: string) => (t || '').trim().replace(/\s+/g, ' ').toLowerCase();
/** Urgent first, then newest first (S1, S2, S6 open rows; S7 rows). */
export const byListOrder = (a: ShoppingItem, b: ShoppingItem) => Number(!!b.urgent) - Number(!!a.urgent) || (b.createdAt || '').localeCompare(a.createdAt || '');
export const openOf = (open: ShoppingItem[], c: ShoppingCategory) => open.filter((i) => !i.bought && i.category === c).sort(byListOrder);
/** "6 פריטים פתוחים": what is still to buy or order (the מחפשים list is not shopping). */
export const openToBuy = (open: ShoppingItem[]) => open.filter((i) => !i.bought && i.category !== 'giveaway').length;
export const openOverline = (n: number) => (n === 0 ? 'אין פריטים פתוחים' : n === 1 ? 'פריט פתוח אחד' : `${n} פריטים פתוחים`);
const keyOf = (iso: string | null | undefined) => (iso ? dateKeyOf(new Date(iso)) : '');
/** Bought (or found) today, newest first. */
export const doneToday = (history: ShoppingItem[], c: ShoppingCategory, today: string) =>
  history.filter((i) => i.bought && i.category === c && keyOf(i.boughtAt) === today).sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || ''));
/** Found this calendar month (S2 "נמצא החודש"). */
export const doneThisMonth = (history: ShoppingItem[], c: ShoppingCategory, today: string) =>
  history.filter((i) => i.bought && i.category === c && keyOf(i.boughtAt).slice(0, 7) === today.slice(0, 7)).sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || ''));
/** S1 dashed chips "קונים בדרך כלל": bought most often lately in this list and not open now; ties go to the most recent. */
export function suggestions(history: ShoppingItem[], open: ShoppingItem[], c: ShoppingCategory, max = 3): { title: string; qty: string; note: string; link: string }[] {
  const onList = new Set(open.filter((i) => !i.bought && i.category === c).map((i) => norm(i.title)));
  const m = new Map<string, { title: string; qty: string; note: string; link: string; n: number; last: string }>();
  for (const i of history) {
    if (!i.bought || i.category !== c || onList.has(norm(i.title))) continue;
    const k = norm(i.title); const cur = m.get(k); const at = i.boughtAt || '';
    if (!cur) m.set(k, { title: i.title.trim(), qty: i.qty || '', note: i.note || '', link: i.link || '', n: 1, last: at });
    else { cur.n++; if (at > cur.last) Object.assign(cur, { last: at, qty: i.qty || cur.qty, note: i.note || '', link: i.link || '' }); }
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, max).map(({ title, qty, note, link }) => ({ title, qty, note, link }));
}

// ---------- trips ----------
/** A trip left open longer than this is over (someone forgot to press "סיימתי"). */
export const TRIP_MAX_HOURS = 8;
export const isTripOpen = (t: ShoppingTrip, now = nowMs()) => !t.closedAt && now - new Date(t.startedAt).getTime() < TRIP_MAX_HOURS * 3600_000;
export const activeTripOf = (trips: ShoppingTrip[], uid: string, now = nowMs()) =>
  trips.filter((t) => t.by?.uid === uid && isTripOpen(t, now)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] || null;
export const lastClosedTripOf = (trips: ShoppingTrip[], uid: string) =>
  trips.filter((t) => t.by?.uid === uid && !!t.closedAt).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''))[0] || null;
/** Added by someone else after the trip started (S6 "נוסף עכשיו", S7 "דנה הוסיפה בזמן הקנייה"). */
export const addedLive = (i: ShoppingItem, t: ShoppingTrip) => !!i.createdAt && i.createdAt >= t.startedAt && i.createdBy?.uid !== t.by.uid;
export type TripView = { open: ShoppingItem[]; missing: ShoppingItem[]; bought: ShoppingItem[]; total: number; handled: number };
/** What the trip shows: open rows (urgent, then newest), then "אין" rows marked on this trip, then what went into the cart (in order). */
export function tripView(t: ShoppingTrip, items: ShoppingItem[]): TripView {
  const mine = mergeItems(items).filter((i) => i.category === t.list);
  const missedHere = (i: ShoppingItem) => !i.bought && !!i.notAvailable && i.tripId === t.id;
  const bought = mine.filter((i) => i.bought && i.tripId === t.id).sort((a, b) => (a.boughtAt || '').localeCompare(b.boughtAt || ''));
  const missing = mine.filter(missedHere).sort(byListOrder);
  const open = mine.filter((i) => !i.bought && !missedHere(i)).sort(byListOrder);
  return { open, missing, bought, total: open.length + missing.length + bought.length, handled: missing.length + bought.length };
}
/** One copy per id: the open list and the history list can both hold an item for a moment while it changes; the newer copy wins. */
export function mergeItems(...lists: ShoppingItem[][]): ShoppingItem[] {
  const m = new Map<string, ShoppingItem>();
  for (const i of lists.flat()) { const cur = m.get(i.id); if (!cur || (i.updatedAt || '') >= (cur.updatedAt || '')) m.set(i.id, i); }
  return [...m.values()];
}
/** The C1 line when a trip closes: "5 נקנו · קפה שחור לא היה". */
export function tripSummary(bought: number, missing: string[]): string {
  const parts = [bought === 1 ? 'פריט אחד נקנה' : `${bought} נקנו`];
  if (missing.length === 1) parts.push(`${missing[0]} לא היה`);
  else if (missing.length > 1) parts.push(`${missing.length} לא היו`);
  return parts.join(' · ');
}

// ---------- history (S8) ----------
/** Sunday of this week (Israeli week), as YYYY-MM-DD. */
export function weekStartKey(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}
export type HistoryFilter = 'all' | 'super' | 'building' | 'online';
export type HistoryGroup = { key: 'today' | 'week' | 'earlier'; title: string; items: ShoppingItem[] };
/** S8: bought items (not the מחפשים list), filtered by list and by a search over item and person, grouped today / this week / earlier. */
export function historyGroups(history: ShoppingItem[], filter: HistoryFilter, query: string, today: string): HistoryGroup[] {
  const q = norm(query);
  const week = weekStartKey(today);
  const rows = history
    .filter((i) => i.bought && i.boughtAt && i.category !== 'giveaway' && (filter === 'all' || i.category === filter))
    .filter((i) => !q || norm(i.title).includes(q) || norm(i.boughtBy?.name || '').includes(q) || norm(i.createdBy?.name || '').includes(q))
    .sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || ''));
  const groups: HistoryGroup[] = [
    { key: 'today', title: 'היום', items: rows.filter((i) => keyOf(i.boughtAt) === today) },
    { key: 'week', title: 'השבוע', items: rows.filter((i) => { const k = keyOf(i.boughtAt); return k < today && k >= week; }) },
    { key: 'earlier', title: 'קודם', items: rows.filter((i) => keyOf(i.boughtAt) < week) },
  ];
  return groups.filter((x) => x.items.length);
}

// ---------- item timeline (S4 "מה קרה עד עכשיו") ----------
type Fmt = { dayTime: (iso: string) => string; ddmm: (iso: string) => string };
/** Lines oldest first: who added it, what happened (activity), and when it was bought the previous time. */
export function timeline(item: ShoppingItem, acts: Activity[], history: ShoppingItem[], f: Fmt): string[] {
  const lines: { at: string; text: string }[] = [];
  if (item.createdAt && item.createdBy) lines.push({ at: item.createdAt, text: `${first(item.createdBy.name)} ${g(item.createdBy.name, 'הוסיף', 'הוסיפה')} לרשימה` });
  for (const a of acts) {
    const n = a.by?.name || ''; const who = first(n);
    let t = '';
    if (a.action === 'added' || a.action === 'deleted') continue;
    if (a.action === 'edited' && /^סימ/.test(a.text)) t = `${g(n, 'סימן', 'סימנה')} דחוף`;
    else if (a.action === 'edited' && /^הורד/.test(a.text)) t = `${g(n, 'הוריד', 'הורידה')} את הדחוף`;
    else if (a.action === 'edited') t = g(n, 'ערך', 'ערכה');
    else if (a.action === 'bought') t = g(n, 'קנה', 'קנתה');
    else if (a.action === 'found') t = g(n, 'מצא', 'מצאה');
    else if (a.action === 'unbought') t = `${g(n, 'החזיר', 'החזירה')} לרשימה`;
    else if (a.action === 'unavailable') t = `${g(n, 'סימן', 'סימנה')} שלא היה במדף`;
    else if (a.action === 'photo') t = `${g(n, 'הוסיף', 'הוסיפה')} תמונה`;
    else continue;
    lines.push({ at: a.at, text: `${who} ${t}` });
  }
  lines.sort((a, b) => a.at.localeCompare(b.at));
  const out = lines.map((l) => `${f.dayTime(l.at)} · ${l.text}`);
  const before = item.bought && item.boughtAt ? item.boughtAt : '￿';
  const prev = history
    .filter((h) => h.id !== item.id && h.bought && h.boughtAt && h.boughtAt < before && h.category === item.category && norm(h.title) === norm(item.title))
    .sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || ''))[0];
  if (prev) out.push(`${doneWord(item.category)} בפעם הקודמת ב־${f.ddmm(prev.boughtAt!)} · ${first(prev.boughtBy?.name || '')}`);
  return out;
}

// ---------- reads ----------
const HISTORY_DAYS = 90;
/** Open items of every list plus everything bought in the last 90 days (S1 bought today, chips, S2 found, S4 previous, S8). */
export function useShopping(enabled = true) {
  const demo = useDemo(); const states = useDemoStates();
  const blank = demo.on && states.empty; // Z3 "lists empty" (S3, D10, L5)
  const from = useMemo(() => new Date(nowMs() - HISTORY_DAYS * 86400_000).toISOString().slice(0, 10), [todayKey()]);
  const open = useList<ShoppingItem>('shopping', { where: [['bought', '==', false]], orderBy: [['createdAt', 'desc']] }, enabled && !blank);
  const history = useList<ShoppingItem>('shopping', { where: [['boughtAt', '>=', from]], orderBy: [['boughtAt', 'desc']], limit: 400 }, enabled && !blank);
  useHiddenVersion(); // an item deleted a moment ago is gone from the lists while its undo is still offered
  const shown = (l: ShoppingItem[]) => l.filter((i) => !isHidden(i.id));
  return { open: shown(open.items), history: shown(history.items), loading: open.loading || history.loading, error: open.error || history.error };
}
export const useShopItem = (id: string) => useDoc<ShoppingItem>('shopping/' + (id || '_'), !!id);
export const useItemActivity = (id: string) => useActivityFor('shopping', id);
/** The latest trips (a handful a week): enough to find mine and the one just closed. */
export const useTrips = (enabled = true) => useList<ShoppingTrip>('shopping_trips', { orderBy: [['startedAt', 'desc']], limit: 20 }, enabled);
export const useTrip = (id: string) => useDoc<ShoppingTrip>('shopping_trips/' + (id || '_'), !!id);

// ---------- writes ----------
const qtyPart = (q: string) => (q ? ' · ' + q : '');
/** Team members to tell (C1 + push): active staff, managers and owners. notify() leaves out the sender. */
export const teamUids = (team: Profile[]) => team.filter((p) => p.status === 'active' && ['staff', 'manager', 'owner'].includes(p.role)).map((p) => p.uid);

export type NewShopItem = { title: string; qty?: string; note?: string; link?: string; category: ShoppingCategory; urgent?: boolean; photo?: string; taskId?: string };
/** Adds an item (S1 chips, S8 "שוב", and S5 may use it). An urgent item tells the team (kind 'urgent'). */
export async function addShopItem(actor: Actor, data: NewShopItem, team: Profile[] = []): Promise<string> {
  const now = nowIso();
  const id = newId('shopping');
  const title = data.title.trim(); const qty = (data.qty || '').trim();
  const doc: Record<string, unknown> = {
    title, qty, note: (data.note || '').trim(), link: (data.link || '').trim(), category: data.category, urgent: !!data.urgent,
    createdBy: actor, createdAt: now, bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now,
    ...(data.photo ? { photo: data.photo } : {}), ...(data.taskId ? { taskId: data.taskId } : {}),
  };
  await write.set('shopping', id, doc);
  logActivity(actor, 'shopping', id, 'added', `${title}${qtyPart(qty)} (${listLabel(data.category)})`);
  if (data.urgent) void notify(teamUids(team), { kind: 'urgent', title: 'דחוף לכולם', sub: `${title}${qtyPart(qty)}`, link: `/shopping/${id}`, refId: id, by: actor });
  return id;
}
/** Bought / found / back to the list. In a trip the item carries the trip id (S6, S7); outside a trip the old shape is written. */
export async function setItemBought(actor: Actor, item: ShoppingItem, bought: boolean, trip?: ShoppingTrip | null) {
  const now = nowIso();
  const patch: Record<string, unknown> = bought
    ? { bought: true, boughtBy: actor, boughtAt: now, expireAt: new Date(nowMs() + 24 * 3600_000).toISOString(), updatedAt: now }
    : { bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now };
  if (trip) patch.tripId = trip.id;
  if (item.notAvailable) { patch.notAvailable = false; patch.notAvailableAt = null; }
  await write.update('shopping', item.id, patch);
  logActivity(actor, 'shopping', item.id, bought ? (item.category === 'giveaway' ? 'found' : 'bought') : 'unbought', `${item.title}${qtyPart(item.qty)}`);
}
/** "אין": not on the shelf this trip. It stays on the list (S7 "לא היה, נשאר ברשימה"). */
export async function setItemMissing(actor: Actor, item: ShoppingItem, trip: ShoppingTrip, missing: boolean) {
  const now = nowIso();
  await write.update('shopping', item.id, missing
    ? { notAvailable: true, notAvailableAt: now, tripId: trip.id, updatedAt: now }
    : { notAvailable: false, notAvailableAt: null, updatedAt: now });
  if (missing) logActivity(actor, 'shopping', item.id, 'unavailable', `${item.title}${qtyPart(item.qty)}`);
}
export async function setItemQty(item: ShoppingItem, qty: string) {
  await write.update('shopping', item.id, { qty: qty.slice(0, 40), updatedAt: nowIso() });
}
export const logQtyChange = (actor: Actor, item: ShoppingItem, qty: string) => logActivity(actor, 'shopping', item.id, 'edited', `${item.title}${qtyPart(qty)}`);
export async function setItemPhoto(actor: Actor, item: ShoppingItem, photo: string) {
  await write.update('shopping', item.id, { photo, updatedAt: nowIso() });
  logActivity(actor, 'shopping', item.id, 'photo', item.title);
}
/** Deletes when the undo window closes (as the old screen did): undo never has to re-create someone else's item,
 *  which the rules refuse. Returns the undo. */
export function deleteShopItem(actor: Actor, item: ShoppingItem, ms = 6000): () => void {
  return deferDelete(item.id, () => {
    write.remove('shopping', item.id).catch(() => {});
    logActivity(actor, 'shopping', item.id, 'deleted', item.title);
  }, ms);
}
/** S8 "שוב": the same item, new on its list. */
export const againShopItem = (actor: Actor, item: ShoppingItem) =>
  addShopItem(actor, { title: item.title, qty: item.qty, note: item.note, link: item.link, category: item.category });

/** "אני בסופר, מתחילים": resumes my open trip, or opens one and tells the team (C1 "יואב יוצא לסופר עכשיו" + push). */
export async function startTrip(actor: Actor, list: ShoppingCategory, trips: ShoppingTrip[], team: Profile[]): Promise<string> {
  const mine = activeTripOf(trips, actor.uid);
  if (mine) return mine.id;
  const now = nowIso();
  const id = newId('shopping_trips');
  const ops: Parameters<typeof write.batch>[0] = trips.filter((t) => t.by?.uid === actor.uid && !t.closedAt).map((t) => ({ op: 'update' as const, col: 'shopping_trips', id: t.id, data: { closedAt: now } }));
  const trip: ShoppingTrip = { id, by: actor, list, startedAt: now, closedAt: null, bought: [], missing: [] };
  ops.push({ op: 'set', col: 'shopping_trips', id, data: trip as unknown as Record<string, unknown> });
  await write.batch(ops);
  const name = first(actor.name);
  void notify(teamUids(team), {
    kind: 'trip', title: `${name} ${g(actor.name, 'יוצא', 'יוצאת')} ל${listLabel(list)} עכשיו`, sub: 'צריך משהו? עוד אפשר להוסיף',
    link: `/shopping?list=${keyOfCat(list)}`, refId: id, action: { label: 'הוספה', kind: 'addToTrip' }, by: actor,
  });
  return id;
}
/** "סיימתי לקנות": closes the trip with what was bought and what was missing, and tells the team (C1, no push). */
export async function closeTrip(actor: Actor, trip: ShoppingTrip, view: TripView, team: Profile[]) {
  const bought = view.bought.map((i) => i.id); const missing = view.missing.map((i) => i.id);
  await write.update('shopping_trips', trip.id, { closedAt: nowIso(), bought, missing });
  void notify(teamUids(team), {
    kind: 'trip', title: `הקנייה ב${listLabel(trip.list)} נסגרה`, sub: tripSummary(bought.length, view.missing.map((i) => i.title)),
    link: `/shopping/trip/done?id=${trip.id}`, refId: trip.id, by: actor, push: false,
  });
}
/** S7 "טעות? לחזור לקנייה". */
export const reopenTrip = (trip: ShoppingTrip) => write.update('shopping_trips', trip.id, { closedAt: null });
