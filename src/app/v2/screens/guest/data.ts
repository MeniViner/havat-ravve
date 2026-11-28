import { eventMillis } from '../events/logic';
// The guest side (U1-U14): what the screens read and how they word it. Data through data.ts / db.ts only, so every screen
// runs the same on demo data and on Firestore. A team member reaches the same screens from the team app (tickets as a guest,
// visit, donate, contact): `team` in the context changes only where links go (their /me is the team profile).
import { useMemo, useState } from 'react';
import type { FarmEvent, Ticket, Donation, Tab, Visit, Profile, Settings, Broadcast, PaymentStatus, ReceiptPreference } from '../../../types';
import { AUDIENCE_LABELS, RECEIPT_PREFERENCE_FIELD } from '../../../types';
import type { Session } from '../../../firebase';
import { signIn, authErrorMessage } from '../../../firebase';
import { useUpcomingEvents, receiptDestination, receiptPreference, useMyTickets, useMyVisits, useMyDonations, useMyTabs } from '../../../data';
import { updateOwnProfile } from '../../../store';
import { write } from '../../../db';
import { nowIso, now as clockNow } from '../../../clock';
import { useDemo, setDemo } from '../../../demo/store';
import { navigate } from '../../../router';
import { dayName, ddmm, hhmm, keyOf, longDate, money } from '../../format';
import type { TagTone } from '../../kit';

export type GuestCtx = { user: Session | null; profile: Profile | null; settings: Settings; team: boolean };
export const actorOf = (p: Profile) => ({ uid: p.uid, name: p.displayName });

/** Where "my tickets" and "my account" are: a team member's /me is the team profile (C12), their tickets are /me/tickets. */
export const paths = (ctx: { team: boolean }) => ({
  tickets: ctx.team ? '/me/tickets' : '/me',
  account: ctx.team ? '/me' : '/me/account',
  accountLabel: ctx.team ? 'הפרופיל שלי' : 'החשבון שלי',
});

// ---------- wording ----------
const MONTH_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
export const monthShort = (iso: string) => MONTH_SHORT[Number(keyOf(iso).slice(5, 7)) - 1];
export const dayNum = (iso: string) => Number(keyOf(iso).slice(8, 10));
/** "16:00 עד 21:00" */
export const hours = (e: Pick<FarmEvent, 'start' | 'end'>) => (e.end && keyOf(e.end) === keyOf(e.start) ? `${hhmm(e.start)} עד ${hhmm(e.end)}` : hhmm(e.start));
/** "שבת 28.11" */
export const dayShort = (iso: string) => `${dayName(iso)} ${ddmm(iso)}`;
/** "שבת 28.11 · 16:00 עד 21:00" (ticket card) */
export const whenShort = (e: Pick<FarmEvent, 'start' | 'end'>) => `${dayShort(e.start)} · ${hours(e)}`;
/** "שבת, 28 בנובמבר · 16:00 עד 21:00" (event photo header) */
export const whenLong = (e: Pick<FarmEvent, 'start' | 'end'>) => `${dayName(e.start)}, ${longDate(e.start)} · ${hours(e)}`;
/** "כרטיס אחד" / "3 כרטיסים" */
export const ticketsWord = (n: number) => (n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`);
export const priceLine = (e: FarmEvent) => (e.price ? `${money(e.price)} לכרטיס` : 'חינם, בהרשמה');
/** "בביט, ב־PayBox או במזומן" from the farm's payment settings. */
export function payWays(s: Settings, cashWord = 'במזומן') {
  const p = s.payment; const ways = [p.bit && 'בביט', p.paybox && 'ב־PayBox', p.cash && cashWord].filter(Boolean) as string[];
  return ways.length > 1 ? `${ways.slice(0, -1).join(', ')} או ${ways[ways.length - 1]}` : ways[0] || '';
}

// ---------- events ----------
/** Published events by id (the order rows need their dates; tickets carry only the event id and title). */
export function useEvents() {
  const r = useUpcomingEvents();
  const byId = useMemo(() => new Map(r.items.map((e) => [e.id, e])), [r.items]);
  return { ...r, byId };
}
export const isPast = (e: Pick<FarmEvent, 'start' | 'end'>) => !(eventMillis(e.end) > clockNow().getTime());

// ---------- orders ----------
export type Order = { id: string; tickets: Ticket[]; valid: Ticket[]; first: Ticket; event: FarmEvent | undefined; status: PaymentStatus; cancelled: boolean; past: boolean; owed: number };
export function ordersOf(tickets: Ticket[], byId: Map<string, FarmEvent>): Order[] {
  const m = new Map<string, Ticket[]>();
  for (const t of tickets) m.set(t.orderId, [...(m.get(t.orderId) || []), t]);
  return [...m.entries()].map(([id, list]) => {
    const ts = [...list].sort((a, b) => a.index - b.index);
    const valid = ts.filter((t) => t.status === 'valid');
    const first = ts[0];
    const event = byId.get(first.eventId);
    const cancelled = !valid.length;
    const status = first.paymentStatus;
    return { id, tickets: ts, valid, first, event, status, cancelled, past: !!event && isPast(event), owed: status === 'pending' ? first.price * valid.length : 0 };
  });
}
/** Upcoming first by event date, then by when they were ordered; an order whose event is unknown counts as upcoming. */
export const byDate = (a: Order, b: Order) => (a.event?.start || '9').localeCompare(b.event?.start || '9') || a.first.createdAt.localeCompare(b.first.createdAt);
export type OrderState = 'due' | 'claimed' | 'paid' | 'free' | 'onsite' | 'cancelled';
export const orderState = (o: Order): OrderState => (o.cancelled ? 'cancelled' : o.status === 'pending' ? 'due' : o.status === 'claimed' ? 'claimed' : o.status === 'free' ? 'free' : o.status === 'paid_onsite' ? 'onsite' : o.status === 'cancelled' ? 'cancelled' : 'paid');

/** Everything the person has at the farm: orders (upcoming and past), visits, donations and stall accounts. */
export function useMine(ctx: { profile: Profile | null }) {
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid); const visits = useMyVisits(uid, !!uid); const donations = useMyDonations(uid, !!uid); const tabs = useMyTabs(uid, !!uid);
  const events = useEvents();
  const orders = useMemo(() => ordersOf(tickets.items, events.byId), [tickets.items, events.byId]);
  const upcoming = useMemo(() => orders.filter((o) => !o.cancelled && !o.past).sort(byDate), [orders]);
  const past = useMemo(() => orders.filter((o) => o.past || o.cancelled).sort((a, b) => -byDate(a, b)), [orders]);
  return {
    loading: tickets.loading || events.loading, events, orders, upcoming, past,
    visits: visits.items, donations: donations.items, tabs: tabs.items.filter(shownTab), allTabs: tabs.items,
  };
}

// ---------- status tags (U7) ----------
export type Status = { text: string; tone: TagTone };
export function orderTag(o: Order): Status {
  switch (orderState(o)) {
    case 'due': return { text: 'ממתין לתשלום', tone: 'waiting' };
    case 'claimed': return { text: 'סימנת שהעברת', tone: 'waiting' };
    case 'free': return { text: 'נרשמת', tone: 'paid' };
    case 'onsite': return { text: 'שולם במקום', tone: 'paid' };
    case 'cancelled': return { text: 'בוטל', tone: 'neutral' };
    default: return { text: 'שולם', tone: 'paid' };
  }
}
export function donationTag(d: Donation): Status {
  if (d.paymentStatus === 'pending') return { text: 'ממתין לתשלום', tone: 'waiting' };
  if (d.paymentStatus === 'claimed') return { text: 'סימנת שהעברת', tone: 'waiting' };
  if (d.paymentStatus === 'cancelled') return { text: 'בוטל', tone: 'neutral' };
  return { text: 'שולם', tone: 'paid' };
}
export function tabTag(t: Tab): Status {
  if (t.status === 'open') return { text: 'פתוח', tone: 'waiting' };
  if (t.status === 'claimed') return { text: 'סימנת שהעברת', tone: 'waiting' };
  if (t.status === 'waived') return { text: 'נמחל', tone: 'neutral' };
  return { text: 'שולם', tone: 'paid' };
}
export function visitTag(v: Visit): Status {
  if (v.status === 'new') return { text: 'מחכה לתשובה', tone: 'waiting' };
  if (v.status === 'approved') return { text: 'אושר', tone: 'paid' };
  if (v.status === 'rejected') return { text: 'לא מתאים', tone: 'neutral' };
  return { text: 'בוטל', tone: 'neutral' };
}
/** An open stall account with nothing on it is not shown to the guest (no "0 ₪ · פתוח" with "העברתי"). */
export const shownTab = (t: Tab) => t.status !== 'open' || t.total > 0;

// ---------- receipt channel (payment confirmation) ----------
const METHODS: ReceiptPreference[] = ['whatsapp', 'email'];
export const receiptMethods = (p: Profile) => METHODS.filter((m) => receiptDestination(p, m));
export const canChooseReceipt = (p: Profile | null) => !!p && receiptMethods(p).length > 0;
export const RECEIPT_WORD: Record<ReceiptPreference, string> = { whatsapp: 'וואטסאפ', email: 'מייל' };
/** The chosen channel on a form: the person's draft, or what is saved on the account. */
export function useReceiptChoice(profile: Profile | null) {
  const [draft, setDraft] = useState<ReceiptPreference>();
  const method = profile && draft && receiptDestination(profile, draft) ? draft : receiptPreference(profile);
  return { method, set: setDraft, missing: !!profile && !method && canChooseReceipt(profile) };
}
/** Saves the channel on the account (kept for the next payment), only when it changed. */
export function saveReceipt(profile: Profile, method: ReceiptPreference | undefined) {
  if (method && receiptDestination(profile, method) && method !== receiptPreference(profile)) {
    return updateOwnProfile(profile.uid, { fields: { [RECEIPT_PREFERENCE_FIELD]: method } });
  }
}

// ---------- update messages (U13, U14, edit details) ----------
export const setUpdatesOptIn = (uid: string, on: boolean) => write.update('users', uid, { updatesOptIn: on, updatedAt: nowIso() });

/** Who a broadcast was addressed to, as a guest reads it (U14): "לנרשמי פסטיבל הסתיו", "עדכון לכולם". */
export function audienceText(b: Broadcast, byId: Map<string, FarmEvent>) {
  if (b.audience === 'registrants') { const t = b.eventId ? byId.get(b.eventId)?.title : ''; return t ? `לנרשמי ${t}` : AUDIENCE_LABELS.registrants; }
  if (b.audience === 'everyone') return 'עדכון לכולם';
  return AUDIENCE_LABELS[b.audience] || '';
}

// ---------- signing in on the page ----------
/** Google sign-in right where the person is (no detour). In the demo it becomes the example guest. */
export function useSignIn() {
  const demo = useDemo();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const go = async (next?: string) => {
    if (demo.on) { setDemo({ persona: 'guest' }); if (next) navigate(next, true); return; }
    setBusy(true); setError('');
    try { await signIn(); } catch (e) { setError(authErrorMessage(e)); } finally { setBusy(false); }
  };
  return { go, busy, error };
}

// ---------- calendar and sharing ----------
export function downloadIcs(e: FarmEvent) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Havat Ravve//HE', 'BEGIN:VEVENT', `UID:${e.id}@havat-ravve.web.app`, `DTSTAMP:${stamp(nowIso())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end || e.start)}`, `SUMMARY:${e.title}`, `LOCATION:${e.location || 'חוות רווה'}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `${e.title}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const share = (data: ShareData) => { navigator.share?.(data).catch(() => {}); };
export const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
