// Tasks and shopping actions of the redesigned app (v2) that the older catalog lacked: take / release, photos, a shopping item
// for a task, "not on the shelf", and the shopping trip. Each one writes what its function in src/app/v2/data/tasks.ts or
// src/app/v2/data/shopping.ts writes (fields, activity, notifications), in one transaction with the idempotency record.
import { ApiError, invalid } from '../http';
import type { Param } from '../catalog';
import type { Doc, Write } from '../firestore';
import { IF_UPDATED_AT, activity, forbidden, fresh, isManager, mustGet, notFound, nextUpdatedAt, nowIso, project, taskKind } from '../core';
import { type Ctx, bool, def, en, req, str } from '../writes';
import { RESOURCES } from '../resources';
import { notifyWrites } from '../notify';
import { autoId } from '../util';
import { SHOP_CATEGORIES, firstName, gw, keyOfCat, listLabel, qtyPart, shopItemWrites, short, storedPhoto, teamUids } from './taskutil';

type Person = { uid: string; name: string };

/** A task this caller may see: a manager-only task looks missing to staff (as the Rules' canSee()). */
async function visibleTask(c: Ctx, id: string): Promise<Doc> {
  const t = await mustGet(c.fs, 'tasks', id, c.tx, 'task');
  if (t.data.managersOnly && !isManager(c.caller)) throw notFound('task');
  return t;
}
const titleOf = (t: Doc) => String(t.data.title || '');
const conflict = (message: string, details: Record<string, unknown> = {}) => new ApiError('STALE_WRITE', message, details);

// ======================= tasks =======================

// takeTask(): "לקחת", only while the task is still free (or already mine). Staff may take a free open task.
def('tasks.take', 'tasks:complete', 'לקחת משימה פנויה על עצמי', { taskId: req() }, async (c) => {
  const t = await visibleTask(c, c.input.taskId);
  if (t.data.done) throw conflict('the task is already done', { reason: 'done' });
  const cur = (t.data.assignee as Person | null) || null;
  if (cur && cur.uid !== c.me.uid) throw conflict(`the task is already on ${cur.name}`, { reason: 'taken', assignee: cur });
  if (cur) return { writes: [], refs: [{ col: 'tasks', id: t.id }], data: { changed: false } };
  const now = nowIso();
  return {
    writes: [
      c.fs.patch('tasks', t.id, { assignee: c.me, takenAt: now, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime),
      activity(c.fs, c.me, taskKind(t.data), t.id, 'assigned', `${short(titleOf(t))} ← ${c.me.name}`, { subjectUid: c.me.uid }),
    ],
    refs: [{ col: 'tasks', id: t.id, expected: { assignee: c.me } }], data: { changed: true },
  };
}, ['409 STALE_WRITE when someone else already took it (details.assignee says who) or it is done. Taking your own task again changes nothing.']);

// releaseTask(): "לשחרר", back to free; only while it is still mine (a manager may release anyone's).
def('tasks.release', 'tasks:complete', 'לשחרר משימה שלי (חוזרת להיות פנויה)', { taskId: req() }, async (c) => {
  const t = await visibleTask(c, c.input.taskId);
  const cur = (t.data.assignee as Person | null) || null;
  if (!isManager(c.caller) && cur && cur.uid !== c.me.uid) throw conflict(`the task is on ${cur.name}`, { reason: 'taken', assignee: cur });
  if (!cur) return { writes: [], refs: [{ col: 'tasks', id: t.id }], data: { changed: false } };
  return {
    writes: [
      c.fs.patch('tasks', t.id, { assignee: null, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime),
      activity(c.fs, c.me, taskKind(t.data), t.id, 'released', short(titleOf(t)), { subjectUid: c.me.uid }),
    ],
    refs: [{ col: 'tasks', id: t.id, expected: { assignee: null } }], data: { changed: true },
  };
}, ['Staff release only their own task; a manager may release anyone\'s (tasks.assign with release=true does the same and logs the person it was on).']);

const PHOTO_HE = 'רק קישור לתמונה שהאפליקציה כבר שמרה (https://havat-ravve-api.meniviner.workers.dev/v1/files/...). ריק מסיר';
const PHOTO_NOTE = 'The API cannot upload photo bytes (requests are limited to 16 KB and uploads need the app\'s sign-in): only a link to a photo the app already stored is accepted, exactly https://havat-ravve-api.meniviner.workers.dev/v1/files/<kind>/<owner>/<32-character id>.jpg|webp|png (kind: task, shopping, place, event, eventfile, stall, avatar). Any other link is 400; in practice the assistant can only reuse a link it read from another record, or clear the photo with "".';

// setTaskPhoto()
def('tasks.setPhoto', 'tasks:complete', 'תמונה למשימה (מה צריך לעשות)', { ifUpdatedAt: IF_UPDATED_AT as Param, taskId: req(), photo: str(300, PHOTO_HE, true) }, async (c) => {
  const t = await visibleTask(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  const photo = storedPhoto('photo', c.input.photo, true);
  return {
    writes: [c.fs.patch('tasks', t.id, { photo, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime), activity(c.fs, c.me, taskKind(t.data), t.id, 'photo', short(titleOf(t)))],
    refs: [{ col: 'tasks', id: t.id, expected: { hasPhoto: !!photo } }],
  };
}, [PHOTO_NOTE]);

// setDoneDetails() with a done photo (and optionally the done note)
def('tasks.setDonePhoto', 'tasks:complete', 'תמונת ביצוע למשימה (אחרי שבוצעה), ואופציונלי הערת ביצוע', { ifUpdatedAt: IF_UPDATED_AT as Param, taskId: req(), donePhoto: str(300, PHOTO_HE, true), note: str(2000, 'הערת ביצוע') }, async (c) => {
  const t = await visibleTask(c, c.input.taskId);
  fresh(t, c.input.ifUpdatedAt);
  const donePhoto = storedPhoto('donePhoto', c.input.donePhoto, true);
  const patch: Record<string, unknown> = { donePhoto, updatedAt: nextUpdatedAt(t.data.updatedAt) };
  if (c.input.note !== null && c.input.note !== undefined) patch.doneNote = String(c.input.note).slice(0, 2000);
  return {
    writes: [c.fs.patch('tasks', t.id, patch, t.updateTime), activity(c.fs, c.me, taskKind(t.data), t.id, 'photo', `${short(titleOf(t))}${patch.doneNote ? ': ' + patch.doneNote : ''}`)],
    refs: [{ col: 'tasks', id: t.id, expected: { hasDonePhoto: !!donePhoto, ...('doneNote' in patch ? { doneNote: patch.doneNote } : {}) } }],
  };
}, [PHOTO_NOTE, 'To mark it done with a photo in one step, use tasks.complete with donePhoto.']);

const CAT_HE = 'super סופר, building בניין, online אינטרנט, giveaway מחפשים';
const shopBody = (): Record<string, Param> => ({
  title: str(200, 'מה לקנות', true, 1), qty: str(40, 'כמות, טקסט חופשי'), note: str(1000, 'הערה'), link: str(2000, 'קישור https'),
  category: en([...SHOP_CATEGORIES], CAT_HE, false, 'super'), urgent: bool('דחוף: כל הצוות מקבל התראה', false), photo: str(300, PHOTO_HE),
});

// createShopping() with a taskId: the item carries taskId, the task gets shoppingId back (C3)
def('tasks.addShopping', 'shopping:write', 'פריט קנייה שנדרש למשימה (מקושר משני הצדדים)', { taskId: req('המשימה'), ...shopBody() }, async (c) => {
  const t = await visibleTask(c, c.input.taskId);
  const photo = c.input.photo ? storedPhoto('photo', c.input.photo) : null;
  const team = c.input.urgent ? await teamUids(c.fs) : [];
  const id = autoId();
  const { doc, writes } = shopItemWrites(c.fs, c.me, id, { ...c.input, photo, taskId: t.id } as Parameters<typeof shopItemWrites>[3], team);
  writes.push(c.fs.patch('tasks', t.id, { shoppingId: id, updatedAt: nextUpdatedAt(t.data.updatedAt) }, t.updateTime));
  return {
    status: 201, writes,
    refs: [{ col: 'shopping', id, expected: { title: doc.title, taskId: t.id } }, { col: 'tasks', id: t.id, expected: { shoppingId: id } }],
    data: { itemId: id, taskId: t.id },
  };
}, ['urgent=true notifies the whole team, as the app does: ask before using it.']);

// ======================= shopping =======================

// setItemMissing(): "אין" on this trip; the item stays on the list
def('shopping.setMissing', 'shopping:write', 'סימון פריט "אין" (לא היה בחנות בקנייה הזו), או ביטול הסימון', {
  ifUpdatedAt: IF_UPDATED_AT as Param, itemId: req(), tripId: { type: 'id', he: 'הקנייה (מתוך shoppingTrips.list). חובה כשמסמנים "אין"' }, missing: bool('false מבטל את הסימון', true),
}, async (c) => {
  const it = await mustGet(c.fs, 'shopping', c.input.itemId, c.tx, 'shopping item');
  fresh(it, c.input.ifUpdatedAt);
  const missing = c.input.missing !== false;
  if (missing && !c.input.tripId) throw invalid('tripId', 'tripId is required to mark an item missing');
  if (missing) await mustGet(c.fs, 'shopping_trips', c.input.tripId, c.tx, 'shopping trip');
  const now = nowIso();
  const patch = missing ? { notAvailable: true, notAvailableAt: now, tripId: c.input.tripId, updatedAt: now } : { notAvailable: false, notAvailableAt: null, updatedAt: now };
  const writes: Write[] = [c.fs.patch('shopping', it.id, patch, it.updateTime)];
  if (missing) writes.push(activity(c.fs, c.me, 'shopping', it.id, 'unavailable', `${it.data.title}${qtyPart(it.data.qty)}`));
  return { writes, refs: [{ col: 'shopping', id: it.id, expected: { notAvailable: missing } }] };
}, ['It stays on the open list ("לא היה, נשאר ברשימה").', 'Marking it missing needs tripId of a shopping trip (shoppingTrips.list); without one it is 400.']);

/** firestore.rules shopping_trips update: only the shopper writes the trip. */
function myTrip(c: Ctx, t: Doc) { if ((t.data.by as Person | null)?.uid !== c.me.uid) throw forbidden('only the person on this shopping trip can change it'); }

// Resume the newest unclosed trip for this shopper, whatever list was requested.
def('shopping.startTrip', 'shopping:write', 'המשך קנייה פתוחה או התחלת קנייה חדשה', { list: en([...SHOP_CATEGORIES], CAT_HE, true) }, async (c) => {
  const mine = await c.fs.query({
    from: [{ collectionId: 'shopping_trips' }],
    where: { fieldFilter: { field: { fieldPath: 'by.uid' }, op: 'EQUAL', value: { stringValue: c.me.uid } } },
  }, '', c.tx);
  const open = mine.filter((t) => !t.data.closedAt).sort((a, b) => String(b.data.startedAt).localeCompare(String(a.data.startedAt)))[0];
  if (open) return { writes: [], refs: [{ col: 'shopping_trips', id: open.id }], data: { tripId: open.id, list: open.data.list, resumed: true } };
  const now = nowIso();
  const id = autoId();
  const trip = { id, by: c.me, list: c.input.list, startedAt: now, closedAt: null, bought: [], missing: [] };
  const writes = [c.fs.create('shopping_trips', id, trip)];
  writes.push(...notifyWrites(c.fs, await teamUids(c.fs), {
    kind: 'trip', title: `${firstName(c.me.name)} ${gw(c.me.name, 'יוצא', 'יוצאת')} ל${listLabel(c.input.list)} עכשיו`, sub: 'צריך משהו? עוד אפשר להוסיף',
    link: `/shopping?list=${keyOfCat(c.input.list)}`, refId: id, action: { label: 'הוספה', kind: 'addToTrip' } as unknown as string, by: c.me,
  }));
  return { status: 201, writes, refs: [{ col: 'shopping_trips', id, expected: { list: c.input.list, closedAt: null } }], data: { tripId: id, list: trip.list, resumed: false } };
}, ["Resumes the shopper's newest unclosed trip at any age and returns its actual list. Other trips are untouched. Only opening a new trip writes a team notification and queues a push."]);

/** tripSummary() in data/shopping.ts: "5 נקנו · קפה שחור לא היה". */
function tripSummary(bought: number, missing: string[]): string {
  const parts = [bought === 1 ? 'פריט אחד נקנה' : `${bought} נקנו`];
  if (missing.length === 1) parts.push(`${missing[0]} לא היה`);
  else if (missing.length > 1) parts.push(`${missing.length} לא היו`);
  return parts.join(' · ');
}

// closeTrip(): closes the trip with what was bought and what was missing; the team is told in the app (no push)
def('shopping.closeTrip', 'shopping:write', 'סיימתי לקנות: סגירת הקנייה (מה נקנה ומה לא היה)', { tripId: req() }, async (c) => {
  const t = await mustGet(c.fs, 'shopping_trips', c.input.tripId, c.tx, 'shopping trip');
  myTrip(c, t);
  if (t.data.closedAt) return { writes: [], refs: [{ col: 'shopping_trips', id: t.id }], data: { changed: false } };
  // tripView(): the items of this list marked on this trip
  const items = (await c.fs.query({ from: [{ collectionId: 'shopping' }], where: { fieldFilter: { field: { fieldPath: 'tripId' }, op: 'EQUAL', value: { stringValue: t.id } } }, limit: 400 }))
    .filter((i) => i.data.category === t.data.list);
  const bought = items.filter((i) => i.data.bought).sort((a, b) => String(a.data.boughtAt || '').localeCompare(String(b.data.boughtAt || '')));
  const missing = items.filter((i) => !i.data.bought && i.data.notAvailable)
    .sort((a, b) => Number(!!b.data.urgent) - Number(!!a.data.urgent) || String(b.data.createdAt || '').localeCompare(String(a.data.createdAt || '')));
  const patch = { closedAt: nowIso(), bought: bought.map((i) => i.id), missing: missing.map((i) => i.id) };
  const writes: Write[] = [c.fs.patch('shopping_trips', t.id, patch, t.updateTime)];
  writes.push(...notifyWrites(c.fs, await teamUids(c.fs), {
    kind: 'trip', title: `הקנייה ב${listLabel(t.data.list)} נסגרה`, sub: tripSummary(bought.length, missing.map((i) => String(i.data.title))),
    link: `/shopping/trip/done?id=${t.id}`, refId: t.id, by: c.me, push: false,
  }));
  return { writes, refs: [{ col: 'shopping_trips', id: t.id, expected: { bought: patch.bought, missing: patch.missing } }], data: { changed: true } };
}, ['Only the person on the trip can close it. The team gets an in-app notification (no push).']);

// deleteTrip(): a manager deletes a trip; the items keep what happened to them
def('shopping.deleteTrip', 'shopping:delete', 'מחיקת קנייה (רק מנהל). הפריטים נשארים כפי שהם', { tripId: req() }, async (c) => {
  if (!isManager(c.caller)) throw forbidden('only managers can delete a shopping trip');
  const t = await mustGet(c.fs, 'shopping_trips', c.input.tripId, c.tx, 'shopping trip');
  return { writes: [c.fs.remove('shopping_trips', t.id, t.updateTime)], refs: [{ col: 'shopping_trips', id: t.id, gone: true }], data: { deleted: project('shopping_trips', t.id, t.data) } };
}, ['Destructive: confirm with the user first. Bought items stay bought.']);

// reopenTrip(): "טעות? לחזור לקנייה"
def('shopping.reopenTrip', 'shopping:write', 'פתיחה מחדש של קנייה שנסגרה בטעות', { tripId: req() }, async (c) => {
  const t = await mustGet(c.fs, 'shopping_trips', c.input.tripId, c.tx, 'shopping trip');
  myTrip(c, t);
  if (!t.data.closedAt) return { writes: [], refs: [{ col: 'shopping_trips', id: t.id }], data: { changed: false } };
  return { writes: [c.fs.patch('shopping_trips', t.id, { closedAt: null }, t.updateTime)], refs: [{ col: 'shopping_trips', id: t.id, expected: { closedAt: null } }], data: { changed: true } };
}, ['Only the person on the trip can reopen it.']);

// ======================= reads =======================

RESOURCES.push({
  name: 'shoppingTrips', col: 'shopping_trips', path: '/v1/shopping-trips', scope: 'shopping:read',
  he: 'קניות (מישהו בחנות): מי, איזו רשימה, מתי התחילה ונסגרה, מה נקנה ומה לא היה',
  order: { field: 'startedAt', dir: 'DESCENDING' },
  notes: ['Latest first. A trip with closedAt null that started less than 8 hours ago is in progress. bought/missing are shopping item ids (filled when it closes).'],
});
