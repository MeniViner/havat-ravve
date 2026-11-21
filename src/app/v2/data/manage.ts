// Manage area data: reads and writes for M1-M10, N1-N7, N13-N14, G1-G5.
// Every write goes through the existing helpers in data.ts / store.ts (they write through db.ts), so the documents keep
// exactly the shape the rules and the guest app expect. New settings keys are optional and live next to the old ones.
import { useCallback } from 'react';
import { useList, isConflict, readOnce, write } from '../../db';
import { logActivity } from '../../activity';
import { nowIso } from '../../clock';
import {
  useNotifications, useHandledNotifications, handleNotification, handleNotificationsFor, decideVisit, setDonation, setTabStatus,
  setOrderPayment, saveSettingsPart, useOpenTickets, useOpenTabs, useDonations, useDonation, useVisits, useVisit, useCalendar,
  useMyTickets, useMyVisits, useMyDonations, useMyTabs, downloadCsv, useTab, fillTemplate, markPaymentConfirmation,
} from '../../data';
import { usePeople, usePerson, useRoleInvites, setUserRole, inviteByEmail, removeRoleInvite, isOwnerEmail } from '../../store';
import { useActivityByKind } from '../../activity';
import { notify } from './notify';
import { useToast } from '../core';
import { ROLE_LABELS } from '../../types';
import type { Actor, AppNotification, Donation, Profile, Role, Settings, Tab, Ticket, Visit, VendorRequest, RoleInvite } from '../../types';
import type { PaymentExtra } from '../screens/manage/calc';

export * from '../screens/manage/calc';
export {
  useNotifications, useHandledNotifications, useOpenTickets, useOpenTabs, useDonations, useDonation, useVisits, useVisit, useCalendar,
  usePeople, usePerson, useRoleInvites, useMyTickets, useMyVisits, useMyDonations, useMyTabs, downloadCsv, useTab, fillTemplate, markPaymentConfirmation,
};

// ---------- settings as stored (old keys plus the optional new ones) ----------
/** New optional keys on settings/app. The guest app reads only the old ones; these are for the manage screens until it does. */
export type SettingsExtra = {
  payment: Settings['payment'] & PaymentExtra;
  /** G1 toggles: free amount, memorial field, receipt request (default all on, as the guest form behaves today). */
  donationOptions?: { custom: boolean; memorial: boolean; receipt: boolean };
  /** G4 details the contact rule does not allow under `contact` (it accepts phone/whatsapp only). */
  contactMore?: { email: string; address: string; inquiries: boolean };
};
export type ManageSettings = Settings & SettingsExtra;
export const donationOptionsOf = (s: ManageSettings) => ({ custom: true, memorial: true, receipt: true, ...s.donationOptions });
export const contactMoreOf = (s: ManageSettings) => ({ email: '', address: '', inquiries: true, ...s.contactMore });

// ---------- reads ----------
export const useActivityAll = (enabled = true, max = 400) => useActivityByKind('all', enabled, max);
/** Tickets created since a date (reports). */
export const useTicketsSince = (fromKey: string, enabled = true) =>
  useList<Ticket>('tickets', { where: [['createdAt', '>=', fromKey + 'T00:00:00.000Z']], orderBy: [['createdAt', 'desc']], limit: 3000 }, enabled);
/** The tickets of one order (a "claim" inbox item points at the order). */
export const useOrderTickets = (orderId: string, enabled = true) =>
  useList<Ticket>('tickets', { where: [['orderId', '==', orderId]] }, enabled && !!orderId);
/** Open vendor requests of today's event (D6 -> M2). */
export const useVendorRequests = (eventId: string, enabled = true) =>
  useList<VendorRequest>(`events/${eventId || '_'}/vendor_requests`, { where: [['closedAt', '==', null]], orderBy: [['createdAt', 'desc']] }, enabled && !!eventId);
export type { RoleInvite };

// ---------- running a write with the house feedback ----------
/** Runs a write; on a refused or failed write shows the X1 alert. Returns true when it went through (or was queued offline). */
export function useRun() {
  const toast = useToast();
  return useCallback(async (fn: () => Promise<unknown>, ok?: string | { text: string; undo?: () => Promise<unknown> }) => {
    try {
      await fn();
      if (ok) {
        const o = typeof ok === 'string' ? { text: ok } : ok;
        toast.show({ text: o.text, check: true, duration: o.undo ? 5000 : 2500, actions: o.undo ? [{ label: 'ביטול', onClick: () => { o.undo!().catch(() => toast.refused()); } }] : [] });
      }
      return true;
    } catch (e) {
      if (isConflict(e)) toast.refused(); else toast.refused('לא נשמר. ' + ((e as Error)?.message && !/permission|insufficient/i.test((e as Error).message) ? (e as Error).message : 'אין הרשאה לשינוי הזה.'));
      return false;
    }
  }, [toast]);
}

// ---------- payments (M2, N4): trust-based, a manager approves ----------
export type PayItem =
  | { kind: 'donation'; doc: Donation }
  | { kind: 'tab'; doc: Tab }
  | { kind: 'order'; tickets: Ticket[] };
const refOf = (p: PayItem) => (p.kind === 'order' ? p.tickets[0]?.orderId || '' : p.doc.id);

/** Approves one payment and closes its open inbox items, as the old screens did. */
export async function approvePayment(actor: Actor, p: PayItem, open: AppNotification[]) {
  if (p.kind === 'donation') await setDonation(actor, p.doc, { paymentStatus: 'paid' });
  else if (p.kind === 'tab') await setTabStatus(actor, p.doc, 'paid');
  else if (p.tickets.length) await setOrderPayment(actor, p.tickets.filter((t) => t.status === 'valid' && (t.paymentStatus === 'pending' || t.paymentStatus === 'claimed')), 'paid');
  await handleNotificationsFor(open, refOf(p), actor);
}
/** "עוד לא הגיע": the money is not there yet. The record goes back to waiting for payment and the inbox item closes. */
export async function paymentNotArrived(actor: Actor, p: PayItem, open: AppNotification[]) {
  if (p.kind === 'donation') await setDonation(actor, p.doc, { paymentStatus: 'pending' });
  else if (p.kind === 'tab') await setTabStatus(actor, p.doc, 'open', 'עוד לא הגיע');
  else if (p.tickets.length) await setOrderPayment(actor, p.tickets.filter((t) => t.status === 'valid' && t.paymentStatus === 'claimed'), 'pending');
  await handleNotificationsFor(open, refOf(p), actor);
}
/** Undo of an approval: back to what it was (claimed), inbox item reopened. */
export async function undoApproval(actor: Actor, p: PayItem, open: AppNotification[], handled: AppNotification[]) {
  if (p.kind === 'donation') await setDonation(actor, p.doc, { paymentStatus: p.doc.paymentStatus });
  else if (p.kind === 'tab') await setTabStatus(actor, p.doc, p.doc.status);
  else if (p.tickets.length) await setOrderPayment(actor, p.tickets, p.tickets[0].paymentStatus);
  const ref = refOf(p);
  for (const n of [...open, ...handled].filter((x) => x.refId === ref)) await handleNotification(n, actor, false);
}
/** Bulk approval (M2 "תשלומים"): one after the other, so each record keeps its own log line. */
export async function approveMany(actor: Actor, items: PayItem[], open: AppNotification[]) {
  for (const p of items) await approvePayment(actor, p, open);
}
export const markReceipt = (actor: Actor, d: Donation, sent: boolean) => setDonation(actor, d, { receiptSent: sent });
export const setHandled = (n: AppNotification, actor: Actor, handled = true) => handleNotification(n, actor, handled);

// ---------- visits (M2, N2) ----------
export { timeFromNote as visitTime } from '../screens/manage/calc';
export async function decide(v: Visit, actor: Actor, status: Visit['status'], note: string, time: string, open: AppNotification[]) {
  await decideVisit(v, actor, status, note, time, open);
}

// ---------- people (M9, N13, G5) ----------
/** Role change: users/{uid} {role, status, notes, updatedAt, log} exactly as store.setUserRole writes it. The person is told (C1). */
export async function changeRole(actor: Actor, p: Profile, role: Role) {
  await setUserRole(actor, p, role, p.status);
  if (role !== 'guest' && role !== p.role) {
    await notify([p.uid], { kind: 'system', title: `קיבלת תפקיד: ${ROLE_LABELS[role]}`, sub: `${actor.name} עדכן/ה את התפקיד שלך באפליקציה`, link: '/me', by: actor, push: false }).catch(() => {});
  }
}
export const toggleBlock = (actor: Actor, p: Profile) => setUserRole(actor, p, p.role, p.status === 'blocked' ? 'active' : 'blocked');
export const inviteRole = (actor: Actor, email: string, role: RoleInvite['role']) => inviteByEmail(actor, email, role);
export const cancelInvite = (email: string) => removeRoleInvite(email);

// ---------- deletes (each behind the ConfirmSheet) ----------
/** The inbox items about a record (visit, donation, order): every one of them, also the handled ones, when the server answers;
 *  offline, the open ones this screen already has. */
async function inboxFor(refId: string, open: AppNotification[]) {
  try { return await readOnce<AppNotification>('notifications', { where: [['refId', '==', refId]] }); }
  catch { return open.filter((n) => n.refId === refId); }
}
/** A visit request, its calendar entry (visit_<id>) and its inbox items. */
export async function deleteVisit(actor: Actor, v: Visit, open: AppNotification[]) {
  const inbox = await inboxFor(v.id, open);
  await write.batch([
    { op: 'remove', col: 'visits', id: v.id }, { op: 'remove', col: 'calendar', id: `visit_${v.id}` },
    ...inbox.map((n) => ({ op: 'remove' as const, col: 'notifications', id: n.id })),
  ]);
  logActivity(actor, 'visit', v.id, 'deleted', `${v.name} · ${v.date}`, { subjectUid: v.uid });
}
/** A donation and its inbox items. */
export async function deleteDonation(actor: Actor, d: Donation, open: AppNotification[]) {
  const inbox = await inboxFor(d.id, open);
  await write.batch([{ op: 'remove', col: 'donations', id: d.id }, ...inbox.map((n) => ({ op: 'remove' as const, col: 'notifications', id: n.id }))]);
  logActivity(actor, 'donation', d.id, 'deleted', `${d.name} · ${d.amount} ₪`, { subjectUid: d.uid });
}
/** One inbox item (M3). What it points at stays. */
export const deleteInboxItem = (n: AppNotification) => write.remove('notifications', n.id);
/** A stall's request on the event day (M2). */
export const deleteVendorRequest = (r: VendorRequest) => write.remove(`events/${r.eventId}/vendor_requests`, r.id);
/** The owner deletes a person: the profile and a role waiting for their email. Their tickets, donations and visits stay.
 *  The Google account stays too, so signing in again starts over as a new person (first entry). */
export async function deletePerson(actor: Actor, p: Profile) {
  await write.batch([{ op: 'remove', col: 'users', id: p.uid }, ...(p.email ? [{ op: 'remove' as const, col: 'role_invites', id: p.email.toLowerCase() }] : [])]);
  logActivity(actor, 'user', p.uid, 'deleted', `${p.displayName} נמחק/ה מהאפליקציה`, { subjectUid: p.uid });
}
/** Who may delete a person: the owner, never themselves and never the farm's own owner account. */
export const canDeletePerson = (me: { owner: boolean; uid: string }, p: Profile) => me.owner && p.uid !== me.uid && !isOwnerEmail(p.email);

// ---------- settings (N6, N7, G1-G5) ----------
/** Merges one section into settings/app and logs it (saveSettingsPart). Extra keys are optional and ignored by older readers. */
export const saveSettings = (actor: Actor, patch: Partial<ManageSettings>, what: string) => saveSettingsPart(actor, patch as Partial<Settings>, what);

export const stamp = () => nowIso();
