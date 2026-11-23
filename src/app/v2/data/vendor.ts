// Vendor area data: the vendor pool (vendors/{vid}), the per-event vendor record (events/{eid}/vendors/{vid}), the vendor-facing
// event brief (events/{eid}/vendor_info/main), event-day requests (events/{eid}/vendor_requests/{rid}) and app access by invite
// (vendor_invites/{code}, claimed at first sign-in). Everything goes through db.ts, so demo and Firestore behave the same.
// Model and rules: docs/redesign-data/vendor.md.
import { useMemo } from 'react';
import { useDoc, useList, write, newId, push, pull, transact, ConflictError } from '../../db';
import { isFemale } from '../gender';
import { nowIso, nowMs, todayKey } from '../../clock';
import { logActivity } from '../../activity';
import { fillTemplate } from '../../data';
import { notify } from './notify';
import { hhmm, ddmm, dayName, keyOf } from '../format';
import { NEED_LABELS } from '../../types';
import type { Actor, FarmEvent, Profile, VendorNeed, VendorV2, EventVendorV2, VendorRequest, VendorRequestKind } from '../../types';
import type { Session } from '../../firebase';
import type { V2Ctx } from '../ctx';

// ---------- types (local extensions of types.ts; every field optional, old documents load without them) ----------
/** One person linked to a stall. `code` points at the vendor_invites document that gives them access. */
export type VendorPerson = {
  uid?: string; name: string; phone?: string; role: 'owner' | 'helper'; entered: boolean;
  addedAt?: string; addedBy?: string; code?: string; fem?: boolean; lastSeenAt?: string;
};
export type VendorDoc = Omit<VendorV2, 'people'> & { people?: VendorPerson[]; fem?: boolean };
export type EventVendorDoc = EventVendorV2 & {
  invitedBy?: Actor; inviteNote?: string; withVehicle?: boolean; guidelinesReadAt?: string | null; remindedAt?: string | null; updatedAt?: string;
};
/** events/{eid}/vendor_info/main: what an invited vendor may read about the event (a restricted projection). Managers write it. */
export type VendorInfo = {
  id?: string;
  setupFrom?: string; vehiclesUntil?: string; teardownFrom?: string; peakUntil?: string;
  expected?: number; provided?: string; bring?: string;
  contact?: { uid: string; name: string; phone: string };
  guidelines?: { name: string; url: string; minutes?: number };
  mapUrl?: string; answerBy?: string; note?: string; thanks?: string;
  visitors?: number; stalls?: number; managerUids?: string[];
  updatedAt?: string;
};
export type VendorInviteDoc = {
  id?: string; code: string; vendorId: string; vendorName: string; role: 'owner' | 'helper'; name: string; phone: string; fem?: boolean;
  active: boolean; usedBy: string | null; usedAt: string | null; createdBy: Actor; createdAt: string;
};
export type RequestKind = VendorRequestKind | 'supply';
export type VendorRequestDoc = Omit<VendorRequest, 'kind'> & { kind: RequestKind };
type Live = { id?: string; entered?: number };

// ---------- wording helpers ----------
/** Gendered word: g(fem, 'אישר', 'אישרה'). */
export const g = (fem: boolean | undefined, m: string, f: string) => (fem ? f : m);
/** Team members carry no gender field; Hebrew first names ending in ה / ית are read as feminine (נועה, דנה). */
/** Gendered wording for a person without an explicit `fem`: the app-wide rule (src/app/v2/gender.ts). */
export const femName = (name: string) => isFemale(name);
export const first = (name: string) => (name || '').trim().split(/\s+/)[0] || '';
/** "רז ותמר", "נועה, אורלי ודנה". */
export const andList = (names: string[]) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
export const NEED_ORDER: VendorNeed[] = ['table', 'power', 'shade', 'water', 'chairs'];
export const needsText = (needs: VendorNeed[] | undefined, joiner: 'comma' | 'and' = 'comma') => {
  const l = (needs || []).map((n) => NEED_LABELS[n]).filter(Boolean);
  return joiner === 'and' ? andList(l) : l.join(', ');
};
export const REQUEST_LABELS: Record<RequestKind, string> = { power: 'החשמל נפל', help: 'צריך עזרה בדוכן', supply: 'נגמר לי משהו', other: 'משהו אחר', water: 'צריך מים' };
export const requestLabel = (r: { kind: RequestKind; text?: string }) => r.text || REQUEST_LABELS[r.kind] || 'בקשה';

// ---------- event times ----------
const atTime = (iso: string, t: string) => { // "HH:MM" on the event's Israeli date -> ISO
  if (!iso) return '';
  const k = keyOf(iso); const off = new Date(`${k}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)?.[1] || '+2';
  const h = Number(off); return new Date(`${k}T${t}:00${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`).toISOString();
};
const shift = (iso: string, min: number) => (iso ? new Date(new Date(iso).getTime() + min * 60_000).toISOString() : '');
export type TimelineItem = { at: string; time: string; text: string };
/** The vendor's day: setup, vehicles out, opening, end, teardown. Times from the brief, else derived from the event. */
export function timeline(e: FarmEvent, info: VendorInfo | null): TimelineItem[] {
  const setup = info?.setupFrom ? atTime(e.start, info.setupFrom) : shift(e.start, -120);
  const cars = info?.vehiclesUntil ? atTime(e.start, info.vehiclesUntil) : shift(e.start, -45);
  const tear = info?.teardownFrom ? atTime(e.end || e.start, info.teardownFrom) : shift(e.end || e.start, 30);
  const rows: [string, string][] = [[setup, 'הקמה ופריקה'], [cars, 'הרכבים יוצאים לחניה'], [e.start, 'פתיחה למבקרים'], [e.end, 'סיום'], [tear, 'פירוק, הרכבים נכנסים']];
  return rows.filter(([at]) => !!at).map(([at, text]) => ({ at, time: hhmm(at), text }));
}
export const setupTime = (e: FarmEvent, info: VendorInfo | null) => info?.setupFrom || hhmm(shift(e.start, -120));
export const vehiclesUntil = (e: FarmEvent, info: VendorInfo | null) => info?.vehiclesUntil || hhmm(shift(e.start, -45));
export const peakUntil = (e: FarmEvent, info: VendorInfo | null) => info?.peakUntil || hhmm(shift(e.start, 150));
/** "16:00–21:00" */
export const hours = (e: FarmEvent) => `${hhmm(e.start)}–${hhmm(e.end || e.start)}`;
/** "שבת 28.11" */
export const dayShort = (iso: string) => `${dayName(iso)} ${ddmm(iso)}`;
/** The last day to change the answer (YYYY-MM-DD): the brief, else three days before. */
export const answerBy = (e: FarmEvent, info: VendorInfo | null) => info?.answerBy || keyOf(shift(e.start, -3 * 24 * 60));
/** "3 שעות ו־40 דקות" */
export function duration(ms: number) {
  const min = Math.max(0, Math.round(ms / 60_000)); const h = Math.floor(min / 60); const m = min % 60;
  const hs = h === 0 ? '' : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  const ms2 = m === 0 ? '' : m === 1 ? 'דקה' : `${m} דקות`;
  return hs && ms2 ? `${hs} ו־${ms2}` : hs || ms2 || '0 דקות';
}
/** "עוד 10 דקות" for a timeline item starting within three hours. */
export function soon(at: string) {
  const d = new Date(at).getTime() - nowMs();
  if (d <= 0 || d > 3 * 3600_000) return '';
  return `עוד ${duration(d)}`;
}

/** Where a vendor stands with one event. */
export type Phase = 'upcoming' | 'today' | 'past';
export function phaseOf(e: FarmEvent): Phase {
  const end = e.end || e.start; if (!e.start) return 'upcoming';
  if (new Date(end).getTime() < nowMs()) return 'past';
  return keyOf(e.start) <= todayKey() ? 'today' : 'upcoming';
}

// ---------- reads ----------
export const useVendorDoc = (vid: string) => useDoc<VendorDoc>('vendors/' + (vid || '_'), !!vid);
export const useEventDoc = (eid: string) => useDoc<FarmEvent>('events/' + (eid || '_'), !!eid);
export const useEventVendor = (eid: string, vid: string) => useDoc<EventVendorDoc>(`events/${eid || '_'}/vendors/${vid || '_'}`, !!eid && !!vid);
export const useVendorInfo = (eid: string) => useDoc<VendorInfo>(`events/${eid || '_'}/vendor_info/main`, !!eid);
export const useLive = (eid: string, enabled = true) => useDoc<Live>(`events/${eid || '_'}/counters/live`, enabled && !!eid);

const SLOTS = 12;
export type Bundle = { id: string; event: FarmEvent; record: EventVendorDoc | null; phase: Phase };
/** The events this vendor was invited to (vendors/{vid}.events), each with its per-event record. Fixed number of slots so the
 *  hooks stay in a constant order; the newest 12 are enough for a stall's history on screen. */
export function useVendorBundles(vid: string, ids: string[] | undefined): { items: Bundle[]; loading: boolean } {
  const list = (ids || []).slice(-SLOTS);
  const ev: ReturnType<typeof useEventDoc>[] = []; const rec: ReturnType<typeof useEventVendor>[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const id = list[i] || '';
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ev.push(useDoc<FarmEvent>('events/' + (id || '_'), !!id));
    // eslint-disable-next-line react-hooks/rules-of-hooks
    rec.push(useDoc<EventVendorDoc>(`events/${id || '_'}/vendors/${vid || '_'}`, !!id && !!vid));
  }
  const key = ev.map((x) => x.item).concat(rec.map((x) => x.item as never));
  return useMemo(() => {
    const items: Bundle[] = [];
    list.forEach((id, i) => { const e = ev[i].item; if (e) items.push({ id, event: e, record: rec[i].item, phase: phaseOf(e) }); });
    items.sort((a, b) => a.event.start.localeCompare(b.event.start));
    return { items, loading: ev.some((x) => x.loading) || rec.some((x) => x.loading) };
  }, key); // eslint-disable-line react-hooks/exhaustive-deps
}

/** This vendor's requests on one event (a vendor may list only their own). */
export const useMyRequests = (eid: string, vid: string) =>
  useList<VendorRequestDoc>(`events/${eid || '_'}/vendor_requests`, { where: [['vendorId', '==', vid || '_']], orderBy: [['createdAt', 'desc']], limit: 10 }, !!eid && !!vid);

// manager side
/** vendors/{vid}/private/main: the team's notes about a vendor (V2 "הערות לצוות"). Managers only, never readable by the vendor. */
export type VendorPrivate = { id?: string; notes?: string; updatedAt?: string };
export const useVendorPrivate = (vid: string, enabled = true) => useDoc<VendorPrivate>(`vendors/${vid || '_'}/private/main`, enabled && !!vid);
export const useVendorPool = (enabled = true) => useList<VendorDoc>('vendors', { orderBy: [['createdAt', 'asc']] }, enabled);
export const useEventVendorList = (eid: string) => useList<EventVendorDoc>(`events/${eid || '_'}/vendors`, {}, !!eid);
export const useEventRequests = (eid: string) => useList<VendorRequestDoc>(`events/${eid || '_'}/vendor_requests`, { orderBy: [['createdAt', 'desc']], limit: 100 }, !!eid);
export const useVendorInvites = (vid: string, enabled = true) => useList<VendorInviteDoc>('vendor_invites', { where: [['vendorId', '==', vid || '_']] }, enabled && !!vid);
export const useEvents = (enabled = true) => useList<FarmEvent>('events', { orderBy: [['start', 'desc']] }, enabled);
/** Published events (any signed-in vendor may read these): the farm's next event for D9 "להזמין אותי לאירוע הבא". */
export const usePublishedEvents = (enabled = true) => useList<FarmEvent>('events', { where: [['published', '==', true]] }, enabled);

/** People of a stall with their access state (entered = claimed the invite). */
export function peopleOf(v: VendorDoc | null, invites: VendorInviteDoc[] = []): (VendorPerson & { invite?: VendorInviteDoc })[] {
  const list = v?.people || [];
  return list.map((p) => {
    const inv = p.code ? invites.find((i) => i.code === p.code) : undefined;
    return { ...p, invite: inv, uid: p.uid || inv?.usedBy || undefined, entered: p.entered || !!inv?.usedBy };
  }).sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1));
}

// ---------- links ----------
const origin = () => (typeof location !== 'undefined' ? location.origin : 'https://havat-ravve.web.app');
/** The WhatsApp link a vendor opens: lands on D1 for an event, or on the vendor home for a helper. `k` is the access code. */
export const inviteLink = (eid: string, code?: string) => `${origin()}/app/vendor${eid ? `/invite/${eid}` : ''}${code ? `?k=${code}` : ''}`;
const newCode = () => {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = '';
  const rnd = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(12)) : Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  for (const b of rnd) s += abc[b % abc.length];
  return s;
};

// ---------- vendor actions (D1, D2, D5, D6, D7, D8, D9, D10) ----------
const managersOf = (info: VendorInfo | null, rec: EventVendorDoc | null) => [...(info?.managerUids || []), info?.contact?.uid || '', rec?.invitedBy?.uid || ''].filter(Boolean);

/** D1 "לא הפעם": the answer is saved and the managers hear about it. */
export async function declineInvite(ctx: V2Ctx, e: FarmEvent, v: VendorDoc, rec: EventVendorDoc | null, info: VendorInfo | null) {
  const at = nowIso();
  await write.update(`events/${e.id}/vendors`, v.id, { status: 'declined', confirmed: false, answeredAt: at, updatedAt: at });
  await notify(managersOf(info, rec), { kind: 'vendor', title: `${v.name} ${g(v.fem, 'לא מגיע', 'לא מגיעה')} ל${e.title}`, sub: ctx.actor.name, link: `/manage/events/${e.id}/vendors`, refId: v.id, by: ctx.actor, push: false });
}

export type NeedsForm = { sells: string; needs: VendorNeed[]; people: number; withVehicle: boolean; note: string };
/** D2 "שליחה לחווה": confirms the invitation with what the stall needs; the same details become the stall's defaults. */
export async function confirmWithNeeds(ctx: V2Ctx, e: FarmEvent, v: VendorDoc, rec: EventVendorDoc | null, info: VendorInfo | null, f: NeedsForm) {
  const at = nowIso();
  const was = rec?.status;
  await write.batch([
    { op: 'update', col: `events/${e.id}/vendors`, id: v.id, data: { status: 'confirmed', confirmed: true, answeredAt: at, sells: f.sells.trim(), needs: f.needs, people: f.people, withVehicle: f.withVehicle, vehicle: f.withVehicle ? 'רכב לפריקה' : '', note: f.note.trim(), updatedAt: at } },
    { op: 'update', col: 'vendors', id: v.id, data: { sells: f.sells.trim(), product: f.sells.trim(), needs: f.needs, ...(f.note.trim() ? { note: f.note.trim() } : {}), updatedAt: at } },
  ]);
  await notify(managersOf(info, rec), { kind: 'vendor', title: was === 'confirmed' ? `${v.name} ${g(v.fem, 'עדכן', 'עדכנה')} את מה שצריך בדוכן` : `${v.name} ${g(v.fem, 'אישר', 'אישרה')} הגעה ל${e.title}`, sub: needsText(f.needs) || ctx.actor.name, link: `/manage/events/${e.id}/vendors`, refId: v.id, by: ctx.actor, push: false });
}

/** D5 "הגעתי לחווה" (vendor or helper). */
export async function checkIn(ctx: V2Ctx, eid: string, vid: string) {
  const at = nowIso();
  await write.update(`events/${eid}/vendors`, vid, { arrivedAt: at, arrivedBy: ctx.actor.uid, updatedAt: at });
}
export const markGuidelinesRead = (eid: string, vid: string) => write.update(`events/${eid}/vendors`, vid, { guidelinesReadAt: nowIso() }, { quiet: true });

/** D6: a "need something" button goes straight to the managers: a request document (M2, V7) plus a notification and a push. */
export async function createRequest(ctx: V2Ctx, e: FarmEvent, v: VendorDoc, rec: EventVendorDoc | null, info: VendorInfo | null, kind: RequestKind) {
  const col = `events/${e.id}/vendor_requests`; const id = newId(col); const text = REQUEST_LABELS[kind];
  const doc: VendorRequestDoc = { id, eventId: e.id, vendorId: v.id, vendorName: v.name, kind, text, by: ctx.actor, createdAt: nowIso(), takenBy: null, closedAt: null, closedBy: null };
  await write.set(col, id, doc as unknown as Record<string, unknown>);
  await notify(managersOf(info, rec), { kind: 'vendor', title: `${v.name}: ${text}`, sub: rec?.spot ? `דוכן ${rec.spot} · ${ctx.actor.name}` : ctx.actor.name, link: `/manage/events/${e.id}/vendors/today`, refId: id, by: ctx.actor });
  return id;
}
/** D6 "הסתדר" (the vendor) or V7 "טופל" (a manager). Conflict-safe: closing twice is refused quietly. */
export async function closeRequest(ctx: V2Ctx, eid: string, rid: string, notifyUid?: string) {
  await transact(async (tx) => {
    const r = await tx.get<VendorRequestDoc>(`events/${eid}/vendor_requests`, rid);
    if (!r || r.closedAt) throw new ConflictError('לא נשמר. הבקשה כבר נסגרה.');
    tx.update(`events/${eid}/vendor_requests`, rid, { closedAt: nowIso(), closedBy: ctx.actor });
  });
  if (notifyUid && notifyUid !== ctx.actor.uid) await notify([notifyUid], { kind: 'vendor', title: 'הבקשה שלך טופלה', sub: ctx.actor.name, link: '/vendor', refId: rid, by: ctx.actor });
}

/** D9 "שליחה לחווה". */
export async function saveFeedback(ctx: V2Ctx, e: FarmEvent, v: VendorDoc, rec: EventVendorDoc | null, info: VendorInfo | null, f: { rating: number; text: string; inviteNext: boolean }) {
  const at = nowIso();
  await write.batch([
    { op: 'update', col: `events/${e.id}/vendors`, id: v.id, data: { feedback: { rating: f.rating, text: f.text.trim(), inviteNext: f.inviteNext, at }, updatedAt: at } },
    { op: 'update', col: 'vendors', id: v.id, data: { inviteNext: f.inviteNext, updatedAt: at } },
  ]);
  await notify(managersOf(info, rec), { kind: 'vendor', title: `משוב מ${v.name}: ${RATING_LABELS[f.rating] || ''}`, sub: f.text.trim().slice(0, 120), link: `/manage/vendors/${v.id}`, refId: v.id, by: ctx.actor, push: false });
}
export const RATING_LABELS: Record<number, string> = { 5: 'מצוין', 3: 'בסדר', 1: 'פחות' };
/** D10 "להזמין אותי לאירוע הבא". */
export const setInviteNext = (vid: string, on: boolean) => write.update('vendors', vid, { inviteNext: on, updatedAt: nowIso() });

/** D7 "עריכה": the stall details the vendor owns. */
export type StallForm = { name: string; sells: string; phone: string; needs: VendorNeed[]; note: string; photo?: string };
export const saveStall = (vid: string, f: StallForm) =>
  write.update('vendors', vid, { name: f.name.trim(), sells: f.sells.trim(), product: f.sells.trim(), phone: f.phone.trim(), needs: f.needs, note: f.note.trim(), ...(f.photo !== undefined ? { photo: f.photo } : {}), updatedAt: nowIso() });

/** D8 (vendor) and V6 "לקשר עוד מישהו" (manager): an access invite plus a row in the stall's people. Returns the WhatsApp text and link. */
export async function addPerson(ctx: V2Ctx, v: VendorDoc, p: { name: string; phone: string; role: 'owner' | 'helper'; fem?: boolean }) {
  const code = newCode(); const at = nowIso();
  const invite: VendorInviteDoc = { code, vendorId: v.id, vendorName: v.name, role: p.role, name: p.name.trim(), phone: p.phone.trim(), ...(p.fem ? { fem: true } : {}), active: true, usedBy: null, usedAt: null, createdBy: ctx.actor, createdAt: at };
  const person: VendorPerson = { name: p.name.trim(), phone: p.phone.trim(), role: p.role, entered: false, addedAt: keyOf(at), addedBy: ctx.actor.uid, code, ...(p.fem ? { fem: true } : {}) };
  await write.batch([
    { op: 'set', col: 'vendor_invites', id: code, data: invite as unknown as Record<string, unknown> },
    { op: 'update', col: 'vendors', id: v.id, data: { people: push(person), updatedAt: at } },
  ]);
  return { code, link: inviteLink('', code), text: helperText(v, p.name, inviteLink('', code), p.role) };
}
export const helperText = (v: VendorDoc, name: string, link: string, role: 'owner' | 'helper' = 'helper') =>
  role === 'owner'
    ? `שלום ${first(name)}, זה הקישור לאפליקציה של חוות רווה בשביל ${v.name}: ${link} נכנסים עם חשבון Google.`
    : `שלום ${first(name)}, צירפתי אותך לדוכן ${v.name} באפליקציה של חוות רווה. נכנסים כאן עם חשבון Google: ${link}`;
/** Removes a helper from the stall and closes their invite (D7 sheet). The account itself stays, without the stall. */
export async function removePerson(v: VendorDoc, p: VendorPerson) {
  const people = (v.people || []).filter((x) => !(x.code ? x.code === p.code : x.name === p.name && x.role === p.role));
  const ops: Parameters<typeof write.batch>[0] = [{ op: 'update', col: 'vendors', id: v.id, data: { people, updatedAt: nowIso() } }];
  if (p.code) ops.push({ op: 'update', col: 'vendor_invites', id: p.code, data: { active: false } });
  await write.batch(ops);
}

// ---------- manager actions (V1, V2, V6, N8, V7) ----------
export type PoolForm = { name: string; contact: string; phone: string; sells: string; needs: VendorNeed[]; notes: string; external: boolean; fem: boolean };
export async function savePoolVendor(ctx: V2Ctx, f: PoolForm, existing?: VendorDoc | null) {
  const at = nowIso();
  // the vendor reads vendors/{id} (D7), so the team's notes live in a manager-only document; a legacy `notes` field is cleared on save
  const data = { name: f.name.trim(), contact: f.contact.trim(), phone: f.phone.trim(), sells: f.sells.trim(), product: f.sells.trim(), needs: f.needs, notes: '', external: f.external, fem: f.fem, updatedAt: at };
  const priv = { notes: f.notes.trim(), updatedAt: at };
  if (existing) {
    await write.batch([{ op: 'update', col: 'vendors', id: existing.id, data }, { op: 'set', col: `vendors/${existing.id}/private`, id: 'main', data: priv }]);
    return existing.id;
  }
  const id = newId('vendors');
  await write.batch([
    { op: 'set', col: 'vendors', id, data: { ...data, note: '', events: [], people: [], inviteNext: false, createdAt: at } },
    { op: 'set', col: `vendors/${id}/private`, id: 'main', data: priv },
  ]);
  logActivity(ctx.actor, 'event', id, 'added', `בעל דוכן חדש: ${data.name}`);
  return id;
}

/** The brief an invited vendor reads. Created with defaults the first time a manager invites someone; stall count and the managers
 *  to notify are kept current from N8 / V7. Never overwrites what a manager wrote. */
export async function ensureVendorInfo(ctx: V2Ctx, e: FarmEvent, info: VendorInfo | null, patch: Partial<VendorInfo> = {}) {
  const managers = ctx.team.filter((p) => p.role === 'owner' || p.role === 'manager').map((p) => p.uid);
  const managerUids = managers.length ? managers : [ctx.actor.uid];
  if (!info) {
    const phone = (ctx.profile as Profile).phone || '';
    const data: VendorInfo = { setupFrom: hhmm(shift(e.start, -120)), vehiclesUntil: hhmm(shift(e.start, -45)), teardownFrom: hhmm(shift(e.end || e.start, 30)), answerBy: keyOf(shift(e.start, -3 * 24 * 60)), contact: { uid: ctx.actor.uid, name: ctx.actor.name, phone }, managerUids, ...patch, updatedAt: nowIso() };
    await write.set(`events/${e.id}/vendor_info`, 'main', data as Record<string, unknown>, { quiet: true });
    return;
  }
  const next: Partial<VendorInfo> = { ...patch };
  if (!info.managerUids?.length || managerUids.some((u) => !info.managerUids!.includes(u))) next.managerUids = managerUids;
  const changed = Object.entries(next).some(([k, val]) => JSON.stringify((info as Record<string, unknown>)[k]) !== JSON.stringify(val));
  if (changed) await write.update(`events/${e.id}/vendor_info`, 'main', { ...next, updatedAt: nowIso() }, { quiet: true });
}

const owner = (v: VendorDoc) => (v.people || []).find((p) => p.role === 'owner');
/** V2 / N8 invite: the per-event record (status invited), the event in the vendor's history, an access code for the stall owner
 *  if they have none yet, and the WhatsApp text with the link to D1. */
export async function inviteToEvent(ctx: V2Ctx, v: VendorDoc, e: FarmEvent, info: VendorInfo | null, existing?: EventVendorDoc | null) {
  const at = nowIso();
  let code = owner(v)?.code;
  const ops: Parameters<typeof write.batch>[0] = [];
  if (!existing) {
    ops.push({ op: 'set', col: `events/${e.id}/vendors`, id: v.id, data: { vendorId: v.id, name: v.name, confirmed: false, notes: '', status: 'invited', invitedAt: at, invitedBy: ctx.actor, answeredAt: null, sells: v.sells || v.product || '', needs: v.needs || [], people: 1, vehicle: '', note: '', spot: null, spotNote: '', arrivedAt: null, feedback: null, updatedAt: at } });
  }
  const vendorPatch: Record<string, unknown> = { events: push(e.id), updatedAt: at };
  if (v.external !== false && !code && v.phone) {
    code = newCode();
    const name = v.contact || v.name;
    ops.push({ op: 'set', col: 'vendor_invites', id: code, data: { code, vendorId: v.id, vendorName: v.name, role: 'owner', name, phone: v.phone, ...(v.fem ? { fem: true } : {}), active: true, usedBy: null, usedAt: null, createdBy: ctx.actor, createdAt: at } });
    const person: VendorPerson = { name, phone: v.phone, role: 'owner', entered: false, addedAt: keyOf(at), addedBy: ctx.actor.uid, code, ...(v.fem ? { fem: true } : {}) };
    vendorPatch.people = push(person);
  }
  ops.push({ op: 'update', col: 'vendors', id: v.id, data: vendorPatch });
  await write.batch(ops);
  await ensureVendorInfo(ctx, e, info);
  if (!existing) logActivity(ctx.actor, 'event', e.id, 'invited', `${v.name} הוזמן לדוכן`, { eventId: e.id });
  const enteredOwner = owner(v)?.entered;
  return { text: inviteText(ctx, v, e, enteredOwner ? undefined : code) };
}
export function inviteText(ctx: V2Ctx, v: VendorDoc, e: FarmEvent, code?: string) {
  const t = ctx.settings.templates.vendorInvite || 'שלום [שם], נשמח שתגיעו עם דוכן ל־[אירוע] ב־[תאריך] בחוות רווה. מתאים?';
  return `${fillTemplate(t, { 'שם': first(v.contact || v.name), 'אירוע': e.title, 'תאריך': dayShort(e.start) })}\n${inviteLink(e.id, code)}`;
}
/** N8 "תזכורת": stamps the reminder and returns the WhatsApp text: the saved "הזמנת בעל דוכן" message when the farm wrote one
 *  (the old "הזמנה שוב" sent it), otherwise the short reminder. */
export async function remindVendor(ctx: V2Ctx, v: VendorDoc, e: FarmEvent) {
  await write.update(`events/${e.id}/vendors`, v.id, { remindedAt: nowIso() }, { quiet: true });
  const code = owner(v)?.entered ? undefined : owner(v)?.code;
  if (ctx.settings.templates.vendorInvite?.trim()) return inviteText(ctx, v, e, code);
  return `שלום ${first(v.contact || v.name)}, מזכירים: ${e.title} ב־${dayShort(e.start)}. מגיעים? אפשר לענות כאן: ${inviteLink(e.id, code)}`;
}
/** N8 "אישרו": a manager records the answer that came by phone or WhatsApp. */
export async function confirmForVendor(ctx: V2Ctx, eventId: string, rec: EventVendorDoc) {
  const at = nowIso();
  await write.update(`events/${eventId}/vendors`, rec.id, { status: 'confirmed', confirmed: true, answeredAt: at, updatedAt: at });
  logActivity(ctx.actor, 'event', eventId, 'edited', `${rec.name}: אישרו הגעה`, { eventId });
}
/** Q11 "לא מגיע הפעם": a manager records a no that came by phone or WhatsApp. */
export async function declineForVendor(ctx: V2Ctx, eventId: string, rec: EventVendorDoc, fem?: boolean) {
  const at = nowIso();
  await write.update(`events/${eventId}/vendors`, rec.id, { status: 'declined', confirmed: false, answeredAt: at, updatedAt: at });
  logActivity(ctx.actor, 'event', eventId, 'edited', `${rec.name}: ${g(fem, 'לא מגיע', 'לא מגיעה')} הפעם`, { eventId });
}
/** N8 "להזמין את מי שהיה ב...": invites in one batch everyone from a previous event who is not invited yet. */
export async function inviteMany(ctx: V2Ctx, vendors: VendorDoc[], e: FarmEvent, info: VendorInfo | null) {
  for (const v of vendors) await inviteToEvent(ctx, v, e, info);
  return vendors.length;
}
/** V6 "הסרת הגישה": every invite of the stall closed, linked accounts back to guest, the people list emptied. */
export async function removeAccess(ctx: V2Ctx, v: VendorDoc, invites: VendorInviteDoc[], peopleByUid: Map<string, Profile>) {
  const at = nowIso();
  const ops: Parameters<typeof write.batch>[0] = [];
  for (const i of invites) if (i.active) ops.push({ op: 'update', col: 'vendor_invites', id: i.code, data: { active: false } });
  const uids = new Set<string>([...peopleOf(v, invites).map((p) => p.uid || ''), ...invites.map((i) => i.usedBy || '')].filter(Boolean));
  for (const uid of uids) {
    const p = peopleByUid.get(uid);
    if (!p || p.role !== 'vendor') continue;
    ops.push({ op: 'update', col: 'users', id: uid, data: { role: 'guest', notes: (p as { notes?: string }).notes || '', updatedAt: at, log: [...(p.log || []).slice(-29), { at, by: ctx.actor, text: `הגישה לדוכן ${v.name} הוסרה` }] } });
  }
  ops.push({ op: 'update', col: 'vendors', id: v.id, data: { people: [], updatedAt: at } });
  await write.batch(ops);
  logActivity(ctx.actor, 'event', v.id, 'removed', `הגישה של ${v.name} לאפליקציה הוסרה`);
}

/** Deletes a stall from the pool: its invitation on every event (vendor.events), every access link, the team's notes,
 *  and the access of whoever is linked (back to guest, as V6). One batch, so a half-deleted stall never stays behind. */
export async function deleteVendorV2(ctx: V2Ctx, v: VendorDoc, invites: VendorInviteDoc[], peopleByUid: Map<string, Profile>) {
  const at = nowIso();
  const ops: Parameters<typeof write.batch>[0] = [];
  const uids = new Set<string>([...peopleOf(v, invites).map((p) => p.uid || ''), ...invites.map((i) => i.usedBy || '')].filter(Boolean));
  for (const uid of uids) {
    const p = peopleByUid.get(uid);
    if (!p || p.role !== 'vendor' || (p as { vendorId?: string }).vendorId !== v.id) continue;
    ops.push({ op: 'update', col: 'users', id: uid, data: { role: 'guest', notes: (p as { notes?: string }).notes || '', updatedAt: at, log: [...(p.log || []).slice(-29), { at, by: ctx.actor, text: `הדוכן ${v.name} נמחק מהמאגר` }] } });
  }
  for (const i of invites) ops.push({ op: 'remove', col: 'vendor_invites', id: i.code });
  for (const eid of new Set(v.events || [])) ops.push({ op: 'remove', col: `events/${eid}/vendors`, id: v.id });
  ops.push({ op: 'remove', col: `vendors/${v.id}/private`, id: 'main' });
  ops.push({ op: 'remove', col: 'vendors', id: v.id });
  await write.batch(ops);
  logActivity(ctx.actor, 'event', v.id, 'deleted', `${v.name} נמחק ממאגר בעלי הדוכנים`);
}
/** N8: takes a stall off one event (the record) and the event off the stall's history. */
export async function removeFromEvent(ctx: V2Ctx, v: VendorDoc | undefined, eventId: string, rec: EventVendorDoc) {
  const vid = rec.vendorId || rec.id;
  const ops: Parameters<typeof write.batch>[0] = [{ op: 'remove', col: `events/${eventId}/vendors`, id: rec.id }];
  if (v) ops.push({ op: 'update', col: 'vendors', id: vid, data: { events: pull(eventId), updatedAt: nowIso() } });
  await write.batch(ops);
  logActivity(ctx.actor, 'event', eventId, 'removed', `${rec.name || v?.name || 'בעל דוכן'} הוסר מהדוכנים של האירוע`, { eventId });
}

// ---------- access: claiming an invite at first sign-in ----------
const KEY = 'farm-vendor-invite';
/** The access code from the link (?k=...), remembered across the Google sign-in redirect. */
export function pendingVendorInvite(): string {
  try {
    const k = new URLSearchParams(location.search).get('k') || '';
    if (/^[a-z0-9-]{8,40}$/.test(k)) { sessionStorage.setItem(KEY, k); return k; }
    return sessionStorage.getItem(KEY) || '';
  } catch { return ''; }
}
export const forgetVendorInvite = () => { try { sessionStorage.removeItem(KEY); } catch { /* private mode */ } };
export const useInvite = (code: string) => useDoc<VendorInviteDoc>('vendor_invites/' + (code || '_'), !!code);

/** First sign-in (or a guest account) with a vendor link: makes this account the stall's owner or helper.
 *  One transaction: reads the invite (must be active and unused), creates or updates users/{uid} with role 'vendor' + vendorId,
 *  and marks the invite used. The rules check the same (docs/redesign-data/vendor.md). Returns the vendor id. */
export async function claimVendorInvite(user: Session, code: string, details?: { displayName?: string; phone?: string }): Promise<string> {
  const at = nowIso();
  const vid = await transact(async (tx) => {
    const inv = await tx.get<VendorInviteDoc>('vendor_invites', code);
    if (!inv || !inv.active || inv.usedBy) throw new ConflictError('הקישור כבר לא בתוקף. בקשו מהחווה קישור חדש.');
    const me = await tx.get<Profile>('users', user.uid);
    const link = { role: 'vendor', vendorId: inv.vendorId, helper: inv.role === 'helper', addedBy: inv.createdBy.uid, inviteCode: code, updatedAt: at };
    if (me) {
      if (me.role !== 'guest' && me.role !== 'vendor') throw new ConflictError('החשבון הזה כבר שייך לצוות. נכנסים עם חשבון אחר.');
      tx.update('users', user.uid, link);
    } else {
      const counter = await tx.get<{ value: number }>('counters', 'users');
      const value = (counter?.value || 0) + 1;
      if (counter) tx.update('counters', 'users', { value }); else tx.set('counters', 'users', { value });
      tx.set('users', user.uid, {
        uid: user.uid, email: (user.email || '').toLowerCase(), displayName: (details?.displayName || user.displayName || inv.name).trim().slice(0, 80) || inv.name,
        phone: (details?.phone ?? inv.phone).trim().slice(0, 25), status: 'active', customerNumber: value, acceptedTermsAt: at, createdAt: at, ...link,
      });
    }
    tx.update('vendor_invites', code, { usedBy: user.uid, usedAt: at, active: false });
    return inv.vendorId;
  });
  forgetVendorInvite();
  return vid;
}
