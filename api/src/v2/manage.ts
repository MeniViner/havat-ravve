// Manage area (v2): deletes, the payment follow-ups and the registration questions, written exactly as
// src/app/v2/data/manage.ts does (deletePerson, deleteVisit, deleteDonation, deleteInboxItem, paymentNotArrived, undoApproval,
// saveSettings for G3). Each runs in one commit with its activity entry. Model: docs/redesign-data/manage.md.
import { invalid } from '../http';
import type { Write } from '../firestore';
import { IF_UPDATED_AT, activity, forbidden, fresh, isOwner, mustGet, nowIso, project, whereEq } from '../core';
import type { Param } from '../catalog';
import { dropPushDevices } from '../resources';
import { type Ctx, bool, def, en, mergedSettings, req, settingsMerge, str } from '../writes';

/** The farm's own owner account (firestore.rules bootstrapOwner, the app's ownerEmail): never deleted. */
const OWNER_EMAIL = 'meniviner@gmail.com';

/** inboxFor(): every managers' inbox item about a record, open or handled. */
const inboxFor = (c: Ctx, refId: string) => whereEq(c.fs, 'notifications', { refId }, 500);

// ======================= people =======================

// deletePerson()
def('people.delete', 'people:delete', 'מחיקת אדם מהאפליקציה (בעלים בלבד)', { ifUpdatedAt: IF_UPDATED_AT as Param, uid: req('uid מתוך people.search או profiles.list') }, async (c) => {
  // canDeletePerson(): the owner, never themselves and never the farm's own owner account (firestore.rules users delete: isOwner)
  if (!isOwner(c.caller)) throw forbidden('only the owner deletes a person');
  if (c.input.uid === c.me.uid) throw forbidden('you cannot delete yourself');
  const p = await mustGet(c.fs, 'users', c.input.uid, c.tx, 'person');
  fresh(p, c.input.ifUpdatedAt);
  const email = String(p.data.email || '').toLowerCase();
  if (email === OWNER_EMAIL) throw forbidden('the farm\'s own owner account cannot be deleted');
  const writes: Write[] = [c.fs.remove('users', p.id, p.updateTime), ...(email ? [c.fs.remove('role_invites', email)] : []),
    activity(c.fs, c.me, 'user', p.id, 'deleted', `${p.data.displayName} נמחק/ה מהאפליקציה`, { subjectUid: p.id })];
  return { writes, refs: [{ col: 'users', id: p.id, gone: true }], data: { deleted: dropPushDevices(project('users', p.id, p.data)) } };
}, ['Destructive and final: confirm with the user first. Their tickets, donations and visits stay; signing in again starts over as a new person. To keep them out instead, use people.setStatus blocked.']);

// ======================= visits =======================

// deleteVisit()
def('visits.delete', 'visits:write', 'מחיקת בקשת ביקור (עם הפריט ביומן והפריטים בתור ההתראות)', { ifUpdatedAt: IF_UPDATED_AT as Param, visitId: req() }, async (c) => {
  const v = await mustGet(c.fs, 'visits', c.input.visitId, c.tx, 'visit');
  fresh(v, c.input.ifUpdatedAt);
  const inbox = await inboxFor(c, v.id);
  const writes: Write[] = [c.fs.remove('visits', v.id, v.updateTime), c.fs.remove(`visits/${v.id}/private`, 'staff'), c.fs.remove('calendar', `visit_${v.id}`), ...inbox.map((n) => c.fs.remove('notifications', n.id)),
    activity(c.fs, c.me, 'visit', v.id, 'deleted', `${v.data.name} · ${v.data.date}`, { subjectUid: String(v.data.uid || '') })];
  return { writes, refs: [{ col: 'visits', id: v.id, gone: true }, { col: 'calendar', id: `visit_${v.id}`, gone: true }], data: { deleted: project('visits', v.id, v.data), inboxRemoved: inbox.length } };
}, ['Destructive: confirm with the user first. To decline instead, use visits.setStatus rejected.']);

// ======================= donations =======================

/** handleNotificationsFor(): closes the open inbox items about a record. */
async function closeOpen(c: Ctx, refId: string): Promise<Write[]> {
  const now = nowIso();
  return (await whereEq(c.fs, 'notifications', { refId, handled: false })).map((n) => c.fs.patch('notifications', n.id, { handled: true, handledBy: c.me, handledAt: now }));
}
const donationText = (d: Record<string, unknown>) => `${d.name} · ${d.amount} ₪`;

// paymentNotArrived() (donation): back to waiting for payment, the inbox item closes
def('donations.paymentNotArrived', 'donations:write', 'תרומה: "עוד לא הגיע" (חזרה להמתנה לתשלום)', { ifUpdatedAt: IF_UPDATED_AT as Param, donationId: req() }, async (c) => {
  const d = await mustGet(c.fs, 'donations', c.input.donationId, c.tx, 'donation');
  fresh(d, c.input.ifUpdatedAt);
  const writes: Write[] = [c.fs.patch('donations', d.id, { paymentStatus: 'pending', updatedAt: nowIso() }, d.updateTime),
    activity(c.fs, c.me, 'donation', d.id, 'edited', donationText(d.data), { subjectUid: String(d.data.uid || '') }), ...await closeOpen(c, d.id)];
  return { writes, refs: [{ col: 'donations', id: d.id, expected: { paymentStatus: 'pending' } }] };
}, ['For a donor who said they paid (claimed) but the money is not there. The donor is not messaged automatically.']);

// undoApproval() (donation): back to what it was before the approval, every inbox item about it back in the queue
def('donations.undoApproval', 'donations:write', 'ביטול אישור תשלום של תרומה (חזרה למצב שלפני האישור)', {
  ifUpdatedAt: IF_UPDATED_AT as Param, donationId: req(), paymentStatus: en(['claimed', 'pending'], 'המצב שלפני האישור: claimed דווח שהועבר (ברירת מחדל), pending ממתין', false, 'claimed'),
}, async (c) => {
  const d = await mustGet(c.fs, 'donations', c.input.donationId, c.tx, 'donation');
  fresh(d, c.input.ifUpdatedAt);
  if (d.data.paymentStatus !== 'paid') throw invalid('donationId', 'this donation is not marked paid');
  const ps = c.input.paymentStatus as string;
  const writes: Write[] = [c.fs.patch('donations', d.id, { paymentStatus: ps, updatedAt: nowIso() }, d.updateTime),
    activity(c.fs, c.me, 'donation', d.id, 'edited', donationText(d.data), { subjectUid: String(d.data.uid || '') }),
    ...(await inboxFor(c, d.id)).filter((n) => n.data.handled !== false).map((n) => c.fs.patch('notifications', n.id, { handled: false, handledBy: null, handledAt: null }))];
  return { writes, refs: [{ col: 'donations', id: d.id, expected: { paymentStatus: ps } }] };
}, ['Only for a donation marked paid by mistake.']);

// deleteDonation()
def('donations.delete', 'donations:delete', 'מחיקת תרומה (עם הפריטים בתור ההתראות)', { ifUpdatedAt: IF_UPDATED_AT as Param, donationId: req() }, async (c) => {
  const d = await mustGet(c.fs, 'donations', c.input.donationId, c.tx, 'donation');
  fresh(d, c.input.ifUpdatedAt);
  const inbox = await inboxFor(c, d.id);
  const writes: Write[] = [c.fs.remove('donations', d.id, d.updateTime), ...inbox.map((n) => c.fs.remove('notifications', n.id)),
    activity(c.fs, c.me, 'donation', d.id, 'deleted', donationText(d.data), { subjectUid: String(d.data.uid || '') })];
  return { writes, refs: [{ col: 'donations', id: d.id, gone: true }], data: { deleted: project('donations', d.id, d.data), inboxRemoved: inbox.length } };
}, ['Destructive: confirm with the user first.']);

// ======================= managers' inbox =======================

// deleteInboxItem(): one item; what it points at stays
def('notifications.delete', 'notifications:write', 'מחיקת פריט מתור ההתראות למנהלים (הביקור/התרומה עצמם נשארים)', { notificationId: req() }, async (c) => {
  const n = await mustGet(c.fs, 'notifications', c.input.notificationId, c.tx, 'notification');
  return { writes: [c.fs.remove('notifications', n.id, n.updateTime)], refs: [{ col: 'notifications', id: n.id, gone: true }], data: { deleted: project('notifications', n.id, n.data) } };
}, ['Destructive: confirm with the user first. To take it off the queue but keep it, use notifications.setHandled.']);

// ======================= registration questions (G3) =======================

type Field = { id: string; label: string; type: 'text' | 'date' | 'choice'; options: string[]; required: boolean };
/** fieldId(): a new id from the label that never reuses a taken one. */
const fieldId = (label: string, taken: string[]) => { const base = 'q' + Math.abs([...label].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)).toString(36).slice(0, 5); let id = base, n = 2; while (taken.includes(id)) id = base + n++; return id; };
async function questions(c: Ctx) {
  const cur = await c.fs.get('settings', 'app', c.tx);
  return { cur, fields: ((mergedSettings(cur?.data ?? null).registrationFields as Field[]) || []).slice() };
}
const saveQuestions = (c: Ctx, cur: Awaited<ReturnType<typeof questions>>['cur'], fields: Field[], what: string) => ({
  writes: [settingsMerge(c, cur, { registrationFields: fields }), activity(c.fs, c.me, 'settings', 'app', 'saved', what)],
  refs: [{ col: 'settings', id: 'app' }],
});

// QuestionsPage saveDraft()
def('settings.saveQuestion', 'settings:write', 'הוספה או עריכה של שאלת הרשמה (נשאלת אורחים בהרשמה)', {
  fieldId: { type: 'id', he: 'לעריכת שאלה קיימת (מתוך settings.get registrationFields); בלי זה נוספת שאלה' },
  label: str(200, 'השאלה', true, 1), type: en(['text', 'choice', 'date'], 'text טקסט חופשי, choice בחירה, date תאריך', false, 'text'),
  options: { type: 'stringList', maxItems: 30, maxLength: 100, he: 'אפשרויות (רק לבחירה)' }, required: bool('חובה (בלי תשובה אי אפשר להירשם)', false),
}, async (c) => {
  const { cur, fields } = await questions(c);
  const i = c.input;
  if (i.fieldId && !fields.some((f) => f.id === i.fieldId)) throw invalid('fieldId', 'no such question');
  const options = i.type === 'choice' ? (i.options || []) as string[] : [];
  if (i.type === 'choice' && !options.length) throw invalid('options', 'a choice question needs options');
  const f: Field = { id: i.fieldId || fieldId(i.label, fields.map((x) => x.id)), label: i.label, type: i.type, options, required: !!i.required };
  const next = i.fieldId ? fields.map((x) => (x.id === i.fieldId ? f : x)) : [...fields, f];
  return { ...saveQuestions(c, cur, next, i.fieldId ? `שאלת הרשמה עודכנה: ${f.label}` : `שאלת הרשמה נוספה: ${f.label}`), status: i.fieldId ? 200 : 201, data: { fieldId: f.id } };
}, ['A new question is added last. Answers already given stay on each person\'s card.']);

// QuestionsPage remove()
def('settings.removeQuestion', 'settings:write', 'הסרת שאלת הרשמה', { fieldId: req() }, async (c) => {
  const { cur, fields } = await questions(c);
  const f = fields.find((x) => x.id === c.input.fieldId);
  if (!f) throw invalid('fieldId', 'no such question');
  return { ...saveQuestions(c, cur, fields.filter((x) => x.id !== f.id), `שאלת הרשמה הוסרה: ${f.label}`), data: { removed: f } };
}, ['Destructive: confirm with the user first. Answers already given stay on each person\'s card.']);

// QuestionsPage useReorder()
def('settings.reorderQuestions', 'settings:write', 'שינוי סדר שאלות ההרשמה', { order: { type: 'stringList', maxItems: 50, maxLength: 60, required: true, he: 'כל מזהי השאלות בסדר החדש' } }, async (c) => {
  const { cur, fields } = await questions(c);
  const order = c.input.order as string[];
  if (order.length !== fields.length || new Set(order).size !== order.length || !order.every((id) => fields.some((f) => f.id === id))) throw invalid('order', 'send every question id exactly once');
  return saveQuestions(c, cur, order.map((id) => fields.find((f) => f.id === id)!), 'סדר שאלות ההרשמה שונה');
});
