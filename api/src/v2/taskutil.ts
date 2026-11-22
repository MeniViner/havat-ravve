// Shared helpers of the tasks, shopping and projects actions (v2): the app's Hebrew wording (src/app/v2/gender.ts,
// format.ts, data/shopping.ts), the team to notify, the R2 photo link the Rules accept, and the shopping item document
// addShopItem() writes. Pure, except teamUids() which reads the team.
import { invalid } from '../http';
import type { Firestore, Write } from '../firestore';
import { type Person, activity, nowIso } from '../core';
import { notifyWrites } from '../notify';

// ---------- Hebrew forms (src/app/v2/gender.ts, the name guess; the app calls it without a profile in these actions) ----------
const FEMALE = new Set(['רחל', 'מיכל', 'אסתר', 'תמר', 'שירן', 'ענבל', 'הדס', 'כרמל', 'מירב', 'סיגל', 'קרן', 'יעל', 'רות', 'מורן', 'אורלי', 'שני', 'נעמי', 'אורנה', 'מרים', 'דבורה', 'שושנה', 'רינת', 'ליאת', 'אביגיל', 'אילת', 'אפרת', 'גלית', 'עדן', 'שקד', 'רונית', 'שלומית', 'פזית', 'אורית', 'יפית', 'נגה', 'תהל', 'שושן', 'ליאור', 'אלה', 'בתיה', 'הילה', 'נעמה', 'שרון', 'שירלי', 'גלי', 'סיון', 'אילנית', 'רוני', 'אור']);
const MALE = new Set(['משה', 'שלמה', 'יהודה', 'אריה', 'אליה', 'ישעיה', 'זכריה', 'יונה', 'טוביה', 'עזריה', 'מתתיה', 'נחמיה', 'ירמיה', 'שמעיה', 'יחיאל', 'נוח', 'נח', 'מתנה', 'נוה', 'אהרון', 'אהרן', 'ברכה', 'עזרא', 'עובדיה', 'אלישע', 'מתניה', 'יוסף']);
const firstOf = (name: string) => ((name || '').trim().split(/\s+/)[0] || '').replace(/[׳'"״]/g, '');
export function isFemale(name: string): boolean {
  const f = firstOf(name);
  if (FEMALE.has(f)) return true;
  if (MALE.has(f)) return false;
  return /(ה|ית)$/.test(f);
}
/** gw(): the masculine or feminine form for this person. */
export const gw = (name: string, male: string, female: string) => (isFemale(name) ? female : male);
/** format.ts firstName(). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** The activity / notification title of a task (tasks.ts short()). */
export const short = (s: string) => (s.length > 60 ? s.slice(0, 60) + '…' : s);

/** createTask / updateTask / assignTask: "משימה חדשה: …" to the person it was put on. Empty when that is the actor. */
export const taskToPerson = (fs: Firestore, me: Person, to: Person, taskId: string, title: string): Write[] =>
  to.uid === me.uid ? [] : notifyWrites(fs, [to.uid], { kind: 'task', title: `משימה חדשה: ${short(title)}`, sub: `${firstName(me.name)} ${gw(me.name, 'העביר', 'העבירה')} אליך`, link: `/tasks/${taskId}`, refId: taskId, by: me });

// ---------- the team (shopping.ts teamUids): active staff, managers and owners ----------
export async function teamUids(fs: Firestore): Promise<string[]> {
  const eq = (field: string, value: string) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } });
  const out: string[] = [];
  for (const role of ['staff', 'manager', 'owner']) {
    // equality filters only: served by single-field indexes, no composite index
    const docs = await fs.query({ from: [{ collectionId: 'users' }], select: { fields: [] }, where: { compositeFilter: { op: 'AND', filters: [eq('status', 'active'), eq('role', role)] } }, limit: 1000 });
    out.push(...docs.map((d) => d.id));
  }
  return out;
}

// ---------- photos ----------
/** firestore.rules storedPhoto(): a file the farm's Worker stored in R2. The API cannot upload bytes, so only such a link is accepted. */
export const STORED_PHOTO = /^https:\/\/havat-ravve-api[.]meniviner[.]workers[.]dev\/v1\/files\/(avatar|task|shopping|place|event|eventfile|stall)\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{32}[.](jpg|webp|png)$/;
export function storedPhoto(field: string, v: unknown, allowEmpty = false): string {
  const s = String(v ?? '');
  if (allowEmpty && s === '') return '';
  if (s.length > 300 || !STORED_PHOTO.test(s)) throw invalid(field, `"${field}" must be a link to a photo already stored by the app (https://havat-ravve-api.meniviner.workers.dev/v1/files/...); the API cannot upload photos`);
  return s;
}
/** What a caller sees of a stored photo: the R2 link, never a base64 data: URL. */
export const photoUrl = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') ? v : null);

// ---------- shopping (data/shopping.ts) ----------
export const SHOP_CATEGORIES = ['super', 'building', 'online', 'giveaway'] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];
/** listLabel(): the list names of the redesigned app. */
export const listLabel = (c: unknown) => ({ super: 'סופר', building: 'בניין', online: 'אינטרנט', giveaway: 'מחפשים' } as Record<string, string>)[String(c)] || 'סופר';
/** keyOfCat(): the ?list= key of a list. */
export const keyOfCat = (c: unknown) => ({ super: 'super', building: 'building', online: 'online', giveaway: 'wish' } as Record<string, string>)[String(c)] || 'super';
export const qtyPart = (q: unknown) => (q ? ' · ' + q : '');

export type NewShopItem = { title: string; qty?: string | null; note?: string | null; link?: string | null; category: string; urgent?: boolean | null; photo?: string | null; taskId?: string | null };
/**
 * addShopItem(): the item document, its "added" activity and, for an urgent item, "דחוף לכולם" to the team (kind urgent + push).
 * `team` is teamUids(), read before the transaction.
 */
export function shopItemWrites(fs: Firestore, me: Person, id: string, data: NewShopItem, team: string[]): { doc: Record<string, unknown>; writes: Write[] } {
  const now = nowIso();
  const title = data.title.trim(), qty = (data.qty || '').trim();
  const link = (data.link || '').trim();
  if (link && !/^https:\/\//.test(link)) throw invalid('link', 'link must start with https://');
  const doc: Record<string, unknown> = {
    title, qty, note: (data.note || '').trim(), link, category: data.category, urgent: !!data.urgent,
    createdBy: me, createdAt: now, bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now,
    ...(data.photo ? { photo: data.photo } : {}), ...(data.taskId ? { taskId: data.taskId } : {}),
  };
  const writes = [fs.create('shopping', id, doc), activity(fs, me, 'shopping', id, 'added', `${title}${qtyPart(qty)} (${listLabel(data.category)})`)];
  if (data.urgent) writes.push(...notifyWrites(fs, team, { kind: 'urgent', title: 'דחוף לכולם', sub: `${title}${qtyPart(qty)}`, link: `/shopping/${id}`, refId: id, by: me }));
  return { doc, writes };
}

/** What callers see of a shopping item: every field the app writes, photos as a flag (and the R2 link). */
export function publicItem(id: string, d: Record<string, unknown>) {
  return {
    id, title: d.title, qty: d.qty || '', note: d.note || '', link: d.link || '', category: d.category, urgent: !!d.urgent,
    bought: !!d.bought, boughtBy: d.boughtBy ?? null, boughtAt: d.boughtAt ?? null, expireAt: d.expireAt ?? null,
    createdBy: d.createdBy ?? null, createdAt: d.createdAt, updatedAt: d.updatedAt,
    hasPhoto: !!d.photo, photoUrl: photoUrl(d.photo), taskId: d.taskId || null,
    notAvailable: !!d.notAvailable, notAvailableAt: d.notAvailableAt ?? null, tripId: d.tripId || null, foundWhere: d.foundWhere || '',
  };
}
