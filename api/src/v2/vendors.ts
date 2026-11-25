// Stall owners and vendors in the redesigned app (V1, V2, V6, V7, N8): the pool (vendors/{vid} plus the team's notes in
// vendors/{vid}/private/main), the per-event record (events/{eid}/vendors/{vid}), the brief an invited vendor reads
// (events/{eid}/vendor_info/main), access links (vendor_invites/{code}) and event-day requests. As src/app/v2/data/vendor.ts
// (savePoolVendor, inviteToEvent, remindVendor, confirmForVendor, inviteMany, addPerson, removePerson, removeAccess,
// deleteVendorV2, removeFromEvent, closeRequest) and deleteVendorRequest() (src/app/v2/data/manage.ts) write them.
import { ApiError, invalid } from '../http';
import type { Doc, Write } from '../firestore';
import { activity, fresh, mustGet, notFound, nowIso, project, whereEq } from '../core';
import { type Ctx, bool, def, en, given, mergedSettings, needSome, req, storedImage, str } from '../writes';
import { notifyWrites } from '../notify';
import { autoId } from '../util';
import { isFemale } from './taskutil';
import { type Data, IFU, dayShort, eventFor, hhmmIL, keyIL, shiftIso } from './events';

// ---------- helpers (vendor.ts) ----------
const NEEDS = ['table', 'power', 'shade', 'water', 'chairs'];
const first = (name: string) => (name || '').trim().split(/\s+/)[0] || '';
const ORIGIN = 'https://havat-ravve.web.app';
/** inviteLink(): the WhatsApp link a vendor opens (D1 for an event, the vendor home for a helper); k is the access code. */
export const inviteLink = (eid: string, code?: string) => `${ORIGIN}/app/vendor${eid ? `/invite/${eid}` : ''}${code ? `?k=${code}` : ''}`;
const newCode = () => { const abc = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = ''; for (const b of crypto.getRandomValues(new Uint8Array(12))) s += abc[b % abc.length]; return s; };
const fillTemplate = (t: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`[${k}]`, String(v)), t);
type VPerson = { uid?: string; name: string; phone?: string; role: 'owner' | 'helper'; entered: boolean; addedAt?: string; addedBy?: string; code?: string; fem?: boolean };
const peopleOfDoc = (v: Data) => (v.people as VPerson[]) || [];
const ownerOf = (v: Data) => peopleOfDoc(v).find((p) => p.role === 'owner');
const needsOk = (needs: string[] | null) => { if (needs && needs.some((n) => !NEEDS.includes(n))) throw invalid('needs', `needs are some of: ${NEEDS.join(', ')}`); return needs; };
const vendorFor = (c: Ctx, id: string) => mustGet(c.fs, 'vendors', id, c.tx, 'vendor');
const recCol = (eid: string) => `events/${eid}/vendors`;
async function settingsOf(c: Ctx) { return mergedSettings((await c.fs.get('settings', 'app'))?.data || null); }
/** The linked app accounts of a stall (peopleOf(): a person's uid or the account that claimed their code). */
function linkedUids(v: Data, invites: Doc[]) {
  return [...new Set([...peopleOfDoc(v).map((p) => p.uid || invites.find((i) => i.id === p.code)?.data.usedBy || ''), ...invites.map((i) => i.data.usedBy || '')].map(String).filter(Boolean))];
}
/** A linked account back to guest, with a line in its log (removeAccess / deleteVendorV2). */
function toGuest(c: Ctx, u: Doc, text: string, at: string): Write {
  const log = [...((u.data.log as unknown[]) || []).slice(-29), { at, by: c.me, text }];
  return c.fs.patch('users', u.id, { role: 'guest', notes: u.data.notes || '', updatedAt: at, log }, u.updateTime);
}

// ======================= the pool (V1, V2) =======================

const poolFields = (required: boolean) => ({
  name: str(200, 'שם הדוכן / העסק', required, 1), contact: str(80, 'איש קשר'), phone: str(25, 'טלפון'), sells: str(300, 'מה מוכרים'),
  product: str(300, 'שם ישן של sells (מה מוכרים); נשמר בשני השדות'),
  needs: { type: 'stringList' as const, maxItems: 5, maxLength: 10, he: 'מה צריכים: table שולחן, power חשמל, shade צל, water מים, chairs כיסאות' },
  notes: str(2000, 'הערות לצוות (רק מנהלים רואים; בעל הדוכן לא)'), external: bool('ספק חיצוני (מקבל קישור לאפליקציה כשמזמינים)'),
  fem: bool('פונים אליה (לשון נקבה) בהודעות'), photo: str(300, 'תמונה: קישור שנשמר דרך /v1/files (stall) בלבד, או "" להסרה'),
});
const POOL_NOTES = ['notes are the team\'s notes: stored apart from the stall (vendors/{id}/private/main), which the vendor never reads. vendors.get returns them to managers as privateNotes.'];

// savePoolVendor() (new)
def('vendors.create', 'vendors:write', 'הוספת בעל דוכן / ספק למאגר', poolFields(true), async (c) => {
  const id = autoId();
  const at = nowIso();
  const sells = (c.input.sells ?? c.input.product ?? '') as string;
  const contact = (c.input.contact as string) || '';
  storedImage('photo', c.input.photo);
  const photo = c.input.photo as string | null;
  const data = {
    name: c.input.name, contact, phone: c.input.phone || '', sells, product: sells, needs: needsOk(c.input.needs) || [], notes: '', external: c.input.external ?? true,
    fem: c.input.fem ?? (contact ? isFemale(contact) : false), ...(photo ? { photo } : {}), updatedAt: at, note: '', events: [], people: [], inviteNext: false, createdAt: at,
  };
  return {
    status: 201,
    writes: [c.fs.create('vendors', id, data), c.fs.set(`vendors/${id}/private`, 'main', { notes: c.input.notes || '', updatedAt: at }), activity(c.fs, c.me, 'event', id, 'added', `בעל דוכן חדש: ${data.name}`)],
    refs: [{ col: 'vendors', id, expected: { name: data.name, sells } }], data: { vendorId: id },
  };
}, [...POOL_NOTES, 'external defaults to true (as the app\'s form). fem defaults to a guess from the contact\'s name.']);
// savePoolVendor() (existing)
def('vendors.update', 'vendors:write', 'עדכון בעל דוכן / ספק במאגר', { ifUpdatedAt: IFU, vendorId: req(), ...poolFields(false) }, async (c) => {
  const v = await vendorFor(c, c.input.vendorId);
  fresh(v, c.input.ifUpdatedAt);
  const patch: Data = given(c.input, ['name', 'contact', 'phone', 'needs', 'external', 'fem']);
  needsOk(c.input.needs);
  const sells = c.input.sells ?? c.input.product;
  if (sells !== null) { patch.sells = sells; patch.product = sells; }
  if (c.input.photo !== null) { storedImage('photo', c.input.photo); patch.photo = c.input.photo; }
  if (!Object.keys(patch).length && c.input.notes === null) needSome(patch);
  const at = nowIso();
  const priv = await c.fs.get(`vendors/${v.id}/private`, 'main', c.tx);
  // the app clears a legacy public `notes` on every save and keeps the team's notes in the private document
  const notes = String(c.input.notes ?? priv?.data.notes ?? v.data.notes ?? '');
  return {
    writes: [c.fs.patch('vendors', v.id, { ...patch, notes: '', updatedAt: at }, v.updateTime), c.fs.set(`vendors/${v.id}/private`, 'main', { notes, updatedAt: at })],
    refs: [{ col: 'vendors', id: v.id, expected: Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'photo')) }], data: { privateNotes: notes },
  };
}, [...POOL_NOTES, 'Only the fields you send change (the stall\'s own fields, people and events stay).']);

// deleteVendorV2()
def('vendors.delete', 'vendors:write', 'מחיקת בעל דוכן מהמאגר, עם ההזמנות שלו לאירועים וקישורי הגישה', { ifUpdatedAt: IFU, vendorId: req() }, async (c) => {
  const v = await vendorFor(c, c.input.vendorId);
  fresh(v, c.input.ifUpdatedAt);
  const at = nowIso();
  const invites = await whereEq(c.fs, 'vendor_invites', { vendorId: v.id });
  const writes: Write[] = [];
  for (const uid of linkedUids(v.data, invites)) {
    const u = await c.fs.get('users', uid, c.tx);
    if (!u || u.data.role !== 'vendor' || u.data.vendorId !== v.id) continue;
    writes.push(toGuest(c, u, `הדוכן ${v.data.name} נמחק מהמאגר`, at));
  }
  for (const i of invites) writes.push(c.fs.remove('vendor_invites', i.id));
  for (const eid of new Set((v.data.events as string[]) || [])) writes.push(c.fs.remove(recCol(eid), v.id));
  writes.push(c.fs.remove(`vendors/${v.id}/private`, 'main'), c.fs.remove('vendors', v.id, v.updateTime));
  writes.push(activity(c.fs, c.me, 'event', v.id, 'deleted', `${v.data.name} נמחק ממאגר בעלי הדוכנים`));
  return { writes, refs: [{ col: 'vendors', id: v.id, gone: true }], data: { deleted: project('vendors', v.id, v.data), events: [...new Set((v.data.events as string[]) || [])].length, links: invites.length } };
}, ['Destructive and final: confirm with the user first. Also removes the stall from every event it was invited to, its access links and the team\'s notes; linked accounts go back to guest.']);

// ======================= people and access (V6) =======================

const helperText = (vname: string, name: string, link: string, role: 'owner' | 'helper') => (role === 'owner'
  ? `שלום ${first(name)}, זה הקישור לאפליקציה של חוות רווה בשביל ${vname}: ${link} נכנסים עם חשבון Google.`
  : `שלום ${first(name)}, צירפתי אותך לדוכן ${vname} באפליקציה של חוות רווה. נכנסים כאן עם חשבון Google: ${link}`);
// addPerson()
def('vendors.addPerson', 'vendors:write', 'קישור אדם לדוכן (בעלים או עוזר): קישור גישה לאפליקציה', {
  vendorId: req(), name: str(80, 'שם', true, 1), phone: str(25, 'טלפון'), role: en(['owner', 'helper'], 'owner בעל הדוכן, helper עוזר', false, 'helper'), fem: bool('לשון נקבה'),
}, async (c) => {
  const v = await vendorFor(c, c.input.vendorId);
  if (peopleOfDoc(v.data).length >= 12) throw invalid('vendorId', 'a stall links at most 12 people');
  const code = newCode(); const at = nowIso();
  const name = c.input.name as string, phone = (c.input.phone as string) || '', role = c.input.role as 'owner' | 'helper';
  const fem = c.input.fem ? { fem: true } : {};
  const invite = { code, vendorId: v.id, vendorName: v.data.name, role, name, phone, ...fem, active: true, usedBy: null, usedAt: null, createdBy: c.me, createdAt: at };
  const person: VPerson = { name, phone, role, entered: false, addedAt: keyIL(at), addedBy: c.me.uid, code, ...fem };
  const link = inviteLink('', code);
  return {
    status: 201,
    writes: [c.fs.create('vendor_invites', code, invite), c.fs.patch('vendors', v.id, { people: [...peopleOfDoc(v.data), person], updatedAt: at }, v.updateTime)],
    refs: [{ col: 'vendor_invites', id: code, expected: { active: true } }], data: { code, link, text: helperText(String(v.data.name), name, link, role) },
  };
}, ['Returns the WhatsApp text with the link; send it yourself (the API sends nothing). The person signs in with Google through the link.']);
// removePerson()
def('vendors.removePerson', 'vendors:write', 'הסרת אדם מהדוכן וסגירת קישור הגישה שלו', {
  vendorId: req(), code: { type: 'id', he: 'קוד הגישה של האדם (people[].code ב־vendors.get)' }, name: str(80, 'בלי קוד: השם כפי שמופיע ב־people'), role: en(['owner', 'helper'], 'בלי קוד: התפקיד'),
}, async (c) => {
  const v = await vendorFor(c, c.input.vendorId);
  const people = peopleOfDoc(v.data);
  const { code: requestedCode, name, role } = c.input;
  if (!requestedCode && !name) throw invalid('code', 'send code, or name (and role)');
  const matches = people.filter((p) => requestedCode ? p.code === requestedCode : p.name === name && (!role || p.role === role));
  if (matches.length > 1) throw invalid('code', 'more than one matching row: send its invite code');
  const p = matches[0];
  if (!p && !requestedCode) throw notFound('person of this stall');
  const code = p?.code || requestedCode;
  if (!code || !/^[a-z0-9-]{8,40}$/.test(code)) throw invalid('code', 'this row has no verifiable invite code', 'לקישור הישן חסר מידע. נדרשת בדיקה לפני שמסירים את הגישה.');
  const invite = await c.fs.get('vendor_invites', code, c.tx);
  const receipt = await c.fs.get('activity', code, c.tx);
  if (!p) {
    if (invite?.data.vendorId === v.id && invite.data.active === false && receipt?.data.refId === v.id && receipt.data.action === 'removed') {
      return { writes: [], refs: [{ col: 'vendors', id: v.id }], data: { alreadyRemoved: true } };
    }
    throw notFound('person of this stall');
  }
  if (!invite || invite.data.code !== code || invite.data.vendorId !== v.id || invite.data.role !== p.role || receipt || people.filter((row) => row.code === code).length !== 1) {
    throw invalid('code', 'could not verify the selected invite', 'לא הצלחנו לבדוק את הקישור. נסו שוב או פנו לחווה.');
  }
  const claimant = invite.data.usedBy;
  if (claimant !== null && (typeof claimant !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claimant) || (p.uid && p.uid !== claimant))) {
    throw invalid('code', 'identity on the row and invite could not be reconciled');
  }
  const uid = claimant || p.uid;
  if (uid && !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw invalid('code', 'invalid account on the selected row');
  const u = uid ? await c.fs.get('users', uid, c.tx) : null;
  const linked = !!u && u.data.role === 'vendor' && u.data.vendorId === v.id && (u.data.helper ?? false) === (p.role === 'helper') && u.data.inviteCode === code;
  const at = nowIso();
  const writes: Write[] = [
    c.fs.patch('vendors', v.id, { people: people.filter((x) => x !== p), updatedAt: at }, v.updateTime),
    c.fs.patch('vendor_invites', invite.id, { active: false }, invite.updateTime),
    c.fs.create('activity', code, {
      kind: 'inbox', refId: v.id, action: 'removed', text: 'גישה לדוכן', by: c.me, at,
      subjectUid: '', eventId: '', ...(c.fs.via ? { via: c.fs.via } : {}),
    }),
  ];
  if (linked && u) writes.push(toGuest(c, u, `הגישה לדוכן ${v.data.name} הוסרה`, at));
  return { writes, refs: [{ col: 'vendors', id: v.id }], data: { removed: p, accessRemoved: linked } };
}, ['Destructive: confirm with the user first. The invite is closed and the row removed in one transaction. A linked account goes back to guest only while its current access came from this invite. Rows without a verifiable code need manual review.']);

// removeAccess()
def('vendors.removeAccess', 'vendors:write', 'הסרת הגישה של דוכן לאפליקציה: כל הקישורים נסגרים והחשבונות חוזרים לאורח', { vendorId: req() }, async (c) => {
  const v = await vendorFor(c, c.input.vendorId);
  const at = nowIso();
  const invites = await whereEq(c.fs, 'vendor_invites', { vendorId: v.id });
  const writes: Write[] = invites.filter((i) => i.data.active).map((i) => c.fs.patch('vendor_invites', i.id, { active: false }, i.updateTime));
  for (const uid of linkedUids(v.data, invites)) {
    const u = await c.fs.get('users', uid, c.tx);
    if (!u || u.data.role !== 'vendor') continue;
    writes.push(toGuest(c, u, `הגישה לדוכן ${v.data.name} הוסרה`, at));
  }
  writes.push(c.fs.patch('vendors', v.id, { people: [], updatedAt: at }, v.updateTime), activity(c.fs, c.me, 'event', v.id, 'removed', `הגישה של ${v.data.name} לאפליקציה הוסרה`));
  return { writes, refs: [{ col: 'vendors', id: v.id, expected: { people: [] } }] };
}, ['Destructive: confirm with the user first. The stall stays in the pool and on its events.']);

// ======================= a stall on an event (N8) =======================

/** ensureVendorInfo(): the brief, created with defaults on the first invite; later only the managers to notify are kept current. */
async function vendorInfoWrite(c: Ctx, ev: Doc): Promise<Write | null> {
  const col = `events/${ev.id}/vendor_info`;
  const info = await c.fs.get(col, 'main', c.tx);
  const team = [...await whereEq(c.fs, 'users', { role: 'owner' }), ...await whereEq(c.fs, 'users', { role: 'manager' })].filter((u) => u.data.status === 'active');
  const managers = team.map((u) => u.id).slice(0, 20);
  const managerUids = managers.length ? managers : [c.me.uid];
  if (!info) {
    const phone = String((await c.fs.get('users', c.me.uid))?.data.phone || '');
    const start = String(ev.data.start || ''), end = String(ev.data.end || ev.data.start || '');
    return c.fs.set(col, 'main', { setupFrom: hhmmIL(shiftIso(start, -120)), vehiclesUntil: hhmmIL(shiftIso(start, -45)), teardownFrom: hhmmIL(shiftIso(end, 30)), answerBy: keyIL(shiftIso(start, -3 * 24 * 60)), contact: { uid: c.me.uid, name: c.me.name, phone }, managerUids, updatedAt: nowIso() });
  }
  const cur = (info.data.managerUids as string[]) || [];
  if (cur.length && managerUids.every((u) => cur.includes(u))) return null;
  return c.fs.patch(col, 'main', { managerUids, updatedAt: nowIso() }, info.updateTime);
}
const inviteText = (tpl: string, v: Data, ev: Doc, code?: string) => `${fillTemplate(tpl, { 'שם': first(String(v.contact || v.name)), 'אירוע': String(ev.data.title), 'תאריך': dayShort(ev.data.start) })}\n${inviteLink(ev.id, code)}`;
/** inviteToEvent() for one stall: the record, the event in the stall's history and an owner access code when it has none. */
async function inviteOne(c: Ctx, ev: Doc, v: Doc, tpl: string) {
  const at = nowIso();
  const existing = await c.fs.get(recCol(ev.id), v.id, c.tx);
  const writes: Write[] = [];
  if (!existing) {
    writes.push(c.fs.create(recCol(ev.id), v.id, {
      vendorId: v.id, name: v.data.name, confirmed: false, notes: '', status: 'invited', invitedAt: at, invitedBy: c.me, answeredAt: null, sells: v.data.sells || v.data.product || '',
      needs: (v.data.needs as string[]) || [], people: 1, vehicle: '', note: '', spot: null, spotNote: '', arrivedAt: null, feedback: null, updatedAt: at,
    }));
  }
  const owner = ownerOf(v.data);
  let code = owner?.code;
  const events = [...new Set([...((v.data.events as string[]) || []), ev.id])];
  const vendorPatch: Data = { events, updatedAt: at };
  if (v.data.external !== false && !code && v.data.phone) {
    code = newCode();
    const name = String(v.data.contact || v.data.name);
    const fem = v.data.fem ? { fem: true } : {};
    writes.push(c.fs.create('vendor_invites', code, { code, vendorId: v.id, vendorName: v.data.name, role: 'owner', name, phone: v.data.phone, ...fem, active: true, usedBy: null, usedAt: null, createdBy: c.me, createdAt: at }));
    if (peopleOfDoc(v.data).length < 12) vendorPatch.people = [...peopleOfDoc(v.data), { name, phone: v.data.phone, role: 'owner', entered: false, addedAt: keyIL(at), addedBy: c.me.uid, code, ...fem }];
  }
  writes.push(c.fs.patch('vendors', v.id, vendorPatch, v.updateTime));
  if (!existing) writes.push(activity(c.fs, c.me, 'event', ev.id, 'invited', `${v.data.name} הוזמן לדוכן`, { eventId: ev.id }));
  return { writes, isNew: !existing, text: inviteText(tpl, v.data, ev, owner?.entered ? undefined : code) };
}
const INVITE_NOTES = ['Returns the WhatsApp text with the link to the invitation (the farm\'s saved "הזמנת בעל דוכן" message); send it yourself, the API sends nothing.', 'The vendor answers in the app; record an answer that came by phone with events.confirmVendor.'];

// inviteToEvent()
def('events.inviteVendor', 'events:write', 'הזמנת בעל דוכן לאירוע', { eventId: req(), vendorId: req('מתוך vendors.list') }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const v = await vendorFor(c, c.input.vendorId);
  const one = await inviteOne(c, ev, v, String((await settingsOf(c)).templates.vendorInvite || ''));
  const info = await vendorInfoWrite(c, ev);
  return { status: one.isNew ? 201 : 200, writes: [...one.writes, ...(info ? [info] : [])], refs: [{ col: recCol(ev.id), id: v.id }], data: { text: one.text, alreadyInvited: !one.isNew } };
}, INVITE_NOTES);
// inviteMany()
def('events.inviteVendors', 'events:write', 'הזמנת כמה בעלי דוכנים לאירוע (רשימה, או כל מי שהיה באירוע קודם)', {
  eventId: req(), vendorIds: { type: 'stringList', maxItems: 40, maxLength: 200, he: 'בעלי הדוכנים מתוך vendors.list' }, fromEventId: { type: 'id', he: 'או: כל בעלי הדוכנים שהוזמנו לאירוע הזה' },
}, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  if ((c.input.vendorIds === null) === (c.input.fromEventId === null)) throw invalid('vendorIds', 'send vendorIds or fromEventId');
  let ids = (c.input.vendorIds as string[] | null) || [];
  if (c.input.fromEventId) {
    await eventFor(c, c.input.fromEventId);
    ids = (await c.fs.query({ from: [{ collectionId: 'vendors' }], limit: 300 }, `events/${c.input.fromEventId}`)).map((r) => String(r.data.vendorId || r.id));
  }
  const already = new Set((await c.fs.query({ from: [{ collectionId: 'vendors' }], select: { fields: [] }, limit: 300 }, `events/${ev.id}`)).map((r) => r.id));
  const todo = [...new Set(ids)].filter((id) => !already.has(id));
  if (todo.length > 40) throw invalid('fromEventId', 'more than 40 stalls to invite at once');
  const tpl = String((await settingsOf(c)).templates.vendorInvite || '');
  const writes: Write[] = []; const invited: Data[] = [];
  for (const id of todo) {
    const v = await c.fs.get('vendors', id, c.tx);
    if (!v) { if (c.input.vendorIds) throw notFound(`vendor ${id}`); continue; }
    const one = await inviteOne(c, ev, v, tpl);
    writes.push(...one.writes); invited.push({ vendorId: v.id, name: v.data.name, phone: v.data.phone || '', text: one.text });
  }
  if (invited.length) { const info = await vendorInfoWrite(c, ev); if (info) writes.push(info); }
  return { status: invited.length ? 201 : 200, writes, refs: invited.map((i) => ({ col: recCol(ev.id), id: String(i.vendorId) })), data: { invited, skipped: [...new Set(ids)].filter((id) => already.has(id)) } };
}, ['Skips stalls already invited to this event. Returns one WhatsApp text per stall; send them yourself.']);
// confirmForVendor()
def('events.confirmVendor', 'events:write', 'רישום שבעל דוכן אישר הגעה (בטלפון או בוואטסאפ)', { eventId: req(), vendorId: req() }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const rec = await mustGet(c.fs, recCol(ev.id), c.input.vendorId, c.tx, 'stall on this event');
  const at = nowIso();
  return {
    writes: [c.fs.patch(recCol(ev.id), rec.id, { status: 'confirmed', confirmed: true, answeredAt: at, updatedAt: at }, rec.updateTime), activity(c.fs, c.me, 'event', ev.id, 'edited', `${rec.data.name}: אישרו הגעה`, { eventId: ev.id })],
    refs: [{ col: recCol(ev.id), id: rec.id, expected: { status: 'confirmed', confirmed: true } }],
  };
}, ['Invite first (events.inviteVendor).']);
// remindVendor()
def('events.remindVendor', 'events:write', 'תזכורת לבעל דוכן שעוד לא ענה: רישום ונוסח הודעה', { eventId: req(), vendorId: req() }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const v = await vendorFor(c, c.input.vendorId);
  const rec = await mustGet(c.fs, recCol(ev.id), v.id, c.tx, 'stall on this event');
  const at = nowIso();
  const owner = ownerOf(v.data);
  const code = owner?.entered ? undefined : owner?.code;
  const tpl = String((await settingsOf(c)).templates.vendorInvite || '');
  const text = tpl.trim() ? inviteText(tpl, v.data, ev, code) : `שלום ${first(String(v.data.contact || v.data.name))}, מזכירים: ${ev.data.title} ב־${dayShort(ev.data.start)}. מגיעים? אפשר לענות כאן: ${inviteLink(ev.id, code)}`;
  return { writes: [c.fs.patch(recCol(ev.id), rec.id, { remindedAt: at }, rec.updateTime)], refs: [{ col: recCol(ev.id), id: rec.id, expected: { remindedAt: at } }], data: { text } };
}, ['Records remindedAt and returns the WhatsApp text; send it yourself.']);
// removeFromEvent()
def('events.removeVendor', 'events:write', 'הסרת בעל דוכן מאירוע', { eventId: req(), vendorId: req() }, async (c) => {
  const rec = await mustGet(c.fs, recCol(c.input.eventId), c.input.vendorId, c.tx, 'stall on this event');
  const vid = String(rec.data.vendorId || rec.id);
  const v = await c.fs.get('vendors', vid, c.tx);
  const writes: Write[] = [c.fs.remove(recCol(c.input.eventId), rec.id, rec.updateTime)];
  if (v) writes.push(c.fs.patch('vendors', v.id, { events: ((v.data.events as string[]) || []).filter((e) => e !== c.input.eventId), updatedAt: nowIso() }, v.updateTime));
  writes.push(activity(c.fs, c.me, 'event', c.input.eventId, 'removed', `${rec.data.name || v?.data.name || 'בעל דוכן'} הוסר מהדוכנים של האירוע`, { eventId: c.input.eventId }));
  return { writes, refs: [{ col: recCol(c.input.eventId), id: rec.id, gone: true }], data: { removed: project('vendors', rec.id, rec.data) } };
}, ['Destructive: confirm with the user first. The stall stays in the pool.']);
// The first API's "assign a vendor": kept for callers that use it. A new stall is invited as in the app (status invited, or
// confirmed); an existing record changes only confirmed/status (kept consistent) and notes, never its other v2 fields.
def('events.setVendor', 'events:write', 'שיבוץ בעל דוכן לאירוע ואם אישר הגעה (ישן: עדיף events.inviteVendor / events.confirmVendor)', {
  eventId: req(), vendorId: req('מתוך vendors.list'), confirmed: bool('אישר הגעה'), notes: str(1000, 'הערות'),
}, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const v = await vendorFor(c, c.input.vendorId);
  const rec = await c.fs.get(recCol(ev.id), v.id, c.tx);
  const at = nowIso();
  const confirmed = c.input.confirmed as boolean | null;
  const writes: Write[] = [];
  if (rec) {
    const patch: Data = {};
    if (confirmed !== null && confirmed !== !!rec.data.confirmed) {
      patch.confirmed = confirmed;
      patch.status = confirmed ? 'confirmed' : 'invited';
      if (confirmed) patch.answeredAt = at;
    }
    if (c.input.notes !== null) patch.notes = c.input.notes;
    if (!Object.keys(patch).length) return { writes: [], refs: [{ col: recCol(ev.id), id: v.id }], data: { changed: false } };
    writes.push(c.fs.patch(recCol(ev.id), v.id, { ...patch, updatedAt: at }, rec.updateTime));
    if (patch.status === 'confirmed') writes.push(activity(c.fs, c.me, 'event', ev.id, 'edited', `${rec.data.name}: אישרו הגעה`, { eventId: ev.id }));
  } else {
    const on = !!confirmed;
    writes.push(c.fs.create(recCol(ev.id), v.id, {
      vendorId: v.id, name: v.data.name, confirmed: on, notes: c.input.notes || '', status: on ? 'confirmed' : 'invited', invitedAt: at, invitedBy: c.me, answeredAt: on ? at : null,
      sells: v.data.sells || v.data.product || '', needs: (v.data.needs as string[]) || [], people: 1, vehicle: '', note: '', spot: null, spotNote: '', arrivedAt: null, feedback: null, updatedAt: at,
    }));
    writes.push(c.fs.patch('vendors', v.id, { events: [...new Set([...((v.data.events as string[]) || []), ev.id])], updatedAt: at }, v.updateTime));
    writes.push(activity(c.fs, c.me, 'event', ev.id, 'invited', `${v.data.name} הוזמן לדוכן`, { eventId: ev.id }));
  }
  return { writes, refs: [{ col: recCol(ev.id), id: v.id }], data: { changed: true } };
}, ['Kept for compatibility. It creates no access link and returns no message: for a real invitation use events.inviteVendor.']);

// ======================= event-day requests (V7) =======================

// closeRequest() as a manager or a volunteer ("טופל")
def('vendorRequests.close', 'tabs:write', 'סגירת בקשה של בעל דוכן ביום האירוע ("טופל")', { eventId: req(), requestId: req('מתוך eventVendorRequests.list') }, async (c) => {
  const col = `events/${c.input.eventId}/vendor_requests`;
  const r = await mustGet(c.fs, col, c.input.requestId, c.tx, 'request');
  if (r.data.closedAt) throw new ApiError('STALE_WRITE', 'the request was already closed');
  const closedAt = nowIso();
  const by = r.data.by as { uid?: string } | undefined;
  return {
    writes: [c.fs.patch(col, r.id, { closedAt, closedBy: c.me }, r.updateTime),
      ...notifyWrites(c.fs, [String(by?.uid || '')], { kind: 'vendor', title: 'הבקשה שלך טופלה', sub: c.me.name, link: '/vendor', refId: r.id, by: c.me })],
    refs: [{ col, id: r.id, expected: { closedAt } }],
  };
}, ['The vendor who asked gets a notification and a push.']);
// deleteVendorRequest()
def('vendorRequests.delete', 'vendors:write', 'מחיקת בקשה של בעל דוכן', { eventId: req(), requestId: req() }, async (c) => {
  const col = `events/${c.input.eventId}/vendor_requests`;
  const r = await mustGet(c.fs, col, c.input.requestId, c.tx, 'request');
  return { writes: [c.fs.remove(col, r.id, r.updateTime)], refs: [{ col, id: r.id, gone: true }], data: { deleted: project('vendor_requests', r.id, r.data) } };
}, ['Destructive: confirm with the user first. To mark it handled instead, use vendorRequests.close.']);
