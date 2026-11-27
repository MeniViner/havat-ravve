import type { BroadcastAudience } from '../../shared/message-activity';
export type Role = 'owner' | 'manager' | 'staff' | 'guest' | 'vendor';
export type Status = 'active' | 'pending' | 'blocked';

export type Profile = {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  role: Role;
  status: Status;
  customerNumber: number;
  acceptedTermsAt: string;
  joinCode?: string;
  /** The one-time team link (team_links/{code}) this account used to join (Q27). */
  teamLink?: string;
  notes?: string;
  fields?: Record<string, string>;
  log?: { at: string; by: Actor; text: string }[];
  createdAt: string;
  updatedAt: string;
  // ---- redesign v2 (all optional; older documents load without them) ----
  /** role 'vendor': the vendors/{id} this account belongs to. */
  vendorId?: string;
  /** role 'vendor': a helper of the stall owner (read-only on stall details and the invitation answer). */
  helper?: boolean;
  /** A helper: who added them (vendor uid). */
  addedBy?: string;
  /** Profile photo source. Missing = 'google' when a Google photo exists, else initials. */
  photoSource?: 'custom' | 'google' | 'none';
  /** Custom photo: square JPEG data URL, about 256px. */
  photo?: string;
  /** The Google account photo URL, copied at sign-in. */
  googlePhoto?: string;
  town?: string;
  birthDate?: string;
  /** Push opt-in (L6 / C12 notification rows). */
  push?: { enabled: boolean; kinds?: string[]; updatedAt?: string };
  /** First entry (C9) was completed. */
  welcomedAt?: string;
  /** v2 (optional): grammatical gender for Hebrew wording; missing = guessed from the first name (v2/gender.ts). */
  gender?: 'f' | 'm';
  /** Tidy round: the person agreed to receive update messages ("לקבל עדכונים מהחווה"). Messages to all users reach only
   *  people with true; messages about an event they registered to (service messages) reach every registrant. Default off. */
  updatesOptIn?: boolean;
};

export type Actor = { uid: string; name: string };
export type ReceiptPreference = 'whatsapp' | 'email';
export const RECEIPT_PREFERENCE_FIELD = 'receiptPreference';
export const RECEIPT_PREFERENCE_LABELS: Record<ReceiptPreference, string> = { whatsapp: 'וואטסאפ', email: 'מייל' };
export type PaymentConfirmation = { by: Actor; at: string };

export type Place = { id: string; name: string; lat: number; lng: number; createdBy: Actor; createdAt: string; photo?: string; accuracy?: number | null; measuredAt?: number | null; source?: 'gps' | 'manual' | null; archived?: boolean };

export type TaskLocation = { lat: number; lng: number; placeId?: string; placeName?: string };

export type Task = {
  id: string;
  title: string;
  note: string;
  photo: string;
  location: TaskLocation | null;
  dueDate: string;
  managersOnly: boolean;
  templateId: string | null;
  dateKey: string | null;
  createdBy: Actor;
  createdAt: string;
  done: boolean;
  doneBy: Actor | null;
  doneAt: string | null;
  donePhoto: string;
  doneNote: string;
  assignee: Actor | null;
  urgent: boolean;
  /** The event this task prepares for. Missing or '' on older tasks and on tasks written by the Worker without one. */
  eventId?: string;
  updatedAt: string;
  // ---- redesign v2 (optional) ----
  /** The place link is location.placeId (existing field). A shopping item bought for this task (C3). */
  shoppingId?: string;
  /** When the current assignee took it. */
  takenAt?: string;
  /** Who asked for it, when not the creator (T3 "ביקש"). Missing = createdBy. */
  requestedBy?: Actor;
};

export type Template = {
  id: string;
  title: string;
  note: string;
  days: number[];
  time: string;
  active: boolean;
  managersOnly: boolean;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
  /** v2 (optional): who it is on by default (null = whoever is free) and where. */
  assignee?: Actor | null;
  placeId?: string;
  /** Days (YYYY-MM-DD) whose instance a manager deleted: materializeToday does not create it again. Only today and later are kept. */
  skip?: string[];
};

export type ShoppingCategory = 'super' | 'building' | 'online' | 'giveaway';

export type ShoppingItem = {
  id: string;
  title: string;
  note: string;
  link: string;
  photo?: string;
  category: ShoppingCategory;
  qty: string;
  urgent: boolean;
  createdBy: Actor;
  createdAt: string;
  bought: boolean;
  boughtBy: Actor | null;
  boughtAt: string | null;
  expireAt: string | null;
  updatedAt: string;
  // ---- redesign v2 (optional) ----
  /** The task this item is bought for (C3). */
  taskId?: string;
  /** Marked "אין" during a trip (S6): not available in the store; stays on the list. */
  notAvailable?: boolean;
  notAvailableAt?: string | null;
  /** The trip during which it was added ("נוסף עכשיו") or bought. */
  tripId?: string | null;
  /** "מחפשים" list: where it was found. */
  foundWhere?: string;
};

/** A shopping trip (S6/S7): someone is at the store now. */
export type ShoppingTrip = {
  id: string; by: Actor; list: ShoppingCategory; startedAt: string; closedAt: string | null;
  /** ids bought / marked not available during the trip (filled on close) */
  bought: string[]; missing: string[];
};

export type RoleInvite = { id: string; email: string; role: 'staff' | 'manager' | 'owner'; createdBy: Actor; createdAt: string };
export type ActivityKind = 'task' | 'task_private' | 'shopping' | 'event' | 'ticket' | 'tab' | 'place' | 'visit' | 'donation' | 'user' | 'settings' | 'project' | 'message' | 'calendar' | 'calendar_private' | 'inbox';
export type Activity = { id: string; kind: ActivityKind; refId: string; action: string; text: string; by: Actor; at: string; subjectUid: string; eventId: string;
  /** Written through the API: the key that did it (its name in the owners' assistant log). */
  via?: { credential: string; label: string } };
export const KIND_LABELS: Record<ActivityKind, string> = { task: 'משימה', task_private: 'משימת מנהלים', shopping: 'קניות', event: 'אירוע', ticket: 'כרטיס', tab: 'דוכן', place: 'מקום', visit: 'ביקור', donation: 'תרומה', user: 'אנשים', settings: 'הגדרות', project: 'פרויקט', message: 'הודעה', calendar: 'יומן', calendar_private: 'יומן מנהלים', inbox: 'לטיפול' };
export type Invite = { code: string; role: 'staff'; active: boolean; createdBy: Actor; createdAt: string; usedBy: string[] };

export const CATEGORY_LABELS: Record<ShoppingCategory, string> = { super: 'סופר', building: 'חומרי בניין', online: 'אינטרנט', giveaway: 'מוצרי מסירה' };
export const ROLE_LABELS: Record<Role, string> = { owner: 'בעלים', manager: 'מנהל/ת', staff: 'מתנדב/ת', guest: 'אורח/ת', vendor: 'בעל דוכן' };
export const STATUS_LABELS: Record<Status, string> = { active: 'פעיל', pending: 'ממתין לאישור', blocked: 'חסום' };
export const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// ---------- events, tickets, visits, donations, stalls ----------
export type PaymentStatus = 'free' | 'pending' | 'claimed' | 'paid' | 'paid_onsite' | 'cancelled';
export const PAYMENT_LABELS: Record<PaymentStatus, string> = { free: 'חינם', pending: 'ממתין לתשלום', claimed: 'הועבר, ממתין לאישור', paid: 'שולם', paid_onsite: 'שולם במקום', cancelled: 'בוטל' };

export type EventQuestion = { id: string; label: string; required: boolean };
export type EventFile = { name: string; url: string; kind: 'doc' | 'image'; by: Actor; at: string };
export type FarmEvent = {
  id: string; title: string; description: string; image: string; location: string;
  start: string; end: string; price: number; maxPerOrder: number; capacity: number;
  open: boolean; published: boolean; publishedAt?: string; questions: EventQuestion[];
  entry?: boolean; stall?: boolean;
  files?: EventFile[];
  createdBy: Actor; createdAt: string; updatedAt: string;
};

export type TicketScan = { at: string; by: Actor };
export type Ticket = {
  id: string; eventId: string; eventTitle: string; orderId: string; index: number; total: number;
  ownerUid: string; ownerName: string; ownerPhone: string; holderName: string;
  /** Whether the signed-in owner registered personally. Absent on older tickets. */
  selfRegistered?: boolean;
  walkIn?: boolean;
  secret: string; price: number; paymentStatus: PaymentStatus; status: 'valid' | 'cancelled';
  scans: TicketScan[]; entries: number; answers: Record<string, string>;
  paymentConfirmation?: PaymentConfirmation;
  /** v2 (optional): when the payment reminder went out. */ reminderSentAt?: string | null;
  createdAt: string; updatedAt: string;
};

export type VisitStatus = 'new' | 'approved' | 'rejected' | 'cancelled';
export const VISIT_LABELS: Record<VisitStatus, string> = { new: 'חדש', approved: 'אושר', rejected: 'לא מתאים', cancelled: 'בוטל' };
export type Visit = {
  id: string; uid: string; name: string; phone: string; date: string; people: number; type: string; note: string;
  status: VisitStatus; managerNote: string; handledBy: Actor | null; createdAt: string; updatedAt: string;
};

export type Donation = {
  id: string; uid: string; name: string; phone: string; amount: number; label: string; note: string; memorial: string;
  receiptWanted: boolean; receiptName: string; receiptSent: boolean; paymentStatus: PaymentStatus;
  paymentConfirmation?: PaymentConfirmation;
  createdAt: string; updatedAt: string;
};

export type Vendor = { id: string; name: string; phone: string; product: string; external: boolean; notes: string; createdAt: string; updatedAt: string };
export type EventVendor = { id: string; vendorId: string; name: string; confirmed: boolean; notes: string };
export type Product = { id: string; name: string; price: number; active: boolean; sort: number; /** v2 (optional): sale unit text */ unit?: string };
export type TabItem = { productId: string; name: string; price: number; qty: number; at: string; by: Actor };
export type TabStatus = 'open' | 'claimed' | 'paid' | 'waived';
export const TAB_LABELS: Record<TabStatus, string> = { open: 'פתוח', claimed: 'הועבר, ממתין לאישור', paid: 'שולם', waived: 'נמחל' };
export type Tab = {
  id: string; eventId: string; eventTitle: string; guestUid: string; guestName: string; guestPhone: string; ticketId: string;
  items: TabItem[]; total: number; status: TabStatus; createdBy: Actor; createdAt: string; updatedAt: string;
  paymentConfirmation?: PaymentConfirmation;
  /** v2 (optional): when the guest said they paid; when the reminder went out. */ claimedAt?: string; reminderSentAt?: string | null;
};

export type RegistrationField = { id: string; label: string; type: 'text' | 'date' | 'choice'; options: string[]; required: boolean };
export type FarmContact = { whatsapp?: string; phone?: string };
export type Settings = {
  donationPresets: { amount: number; label: string }[];
  visitTypes: string[];
  payment: { bit: string; paybox: string; cash: boolean; note: string };
  templates: { visitApproved: string; donationThanks: string; debtReminder: string; ticketReminder: string; vendorInvite?: string; paymentConfirmation?: string };
  registrationFields: RegistrationField[];
  guestIntro: string;
  contact?: FarmContact;
};
export const DEFAULT_SETTINGS: Settings = {
  donationPresets: [{ amount: 18, label: 'חי' }, { amount: 180, label: 'עשר פעמים חי' }, { amount: 360, label: 'לב' }],
  visitTypes: ['סיור בחווה', 'מפגש קבוצתי', 'אירוע פרטי', 'אחר'],
  payment: { bit: '', paybox: '', cash: true, note: '' },
  contact: { whatsapp: '', phone: '' },
  templates: {
    visitApproved: 'שלום [שם], הביקור בחוות רווה ב־[תאריך] מאושר. נשמח לראותכם!',
    donationThanks: 'שלום [שם], תודה רבה על התרומה לחוות רווה.',
    debtReminder: 'שלום [שם], תודה שהייתם ב־[אירוע]. נשאר לתשלום [סכום] ₪. אפשר להעביר בביט או ב־PayBox. תודה!',
    ticketReminder: 'שלום [שם], מזכירים: [אירוע] מתקיים ב־[תאריך]. הכרטיסים באפליקציה: https://havat-ravve.web.app/app/me',
    vendorInvite: 'שלום [שם], נשמח שתגיעו עם דוכן ל־[אירוע] ב־[תאריך] בחוות רווה. מתאים?',
    paymentConfirmation: 'שלום [שם], קיבלנו את התשלום בסך [סכום] עבור [עבור]. תודה מחוות רווה!',
  },
  registrationFields: [],
  guestIntro: 'ברוכים הבאים לחוות רווה. כאן מזמינים כרטיסים לאירועים, מתאמים ביקור ותורמים.',
};

export type NotificationType = 'visit' | 'donation' | 'join' | 'order' | 'receipt' | 'tab' | 'claim' | 'contact';
export type ContactGuest = { id: string; accountUid: string; customerNumber?: number; method: 'email' | 'phone'; reply: string; createdAt: string };
export type AppNotification = { id: string; contactId?: string; type: NotificationType; title: string; text: string; link: string; refId: string; createdAt: string; handled: boolean; handledBy: Actor | null; handledAt: string | null };

export type CalendarKind = 'manual' | 'visit' | 'event' | 'presence' | 'meeting' | 'planning';
export type CalendarItem = { id: string; ownerUid: string; ownerName: string; title: string; date: string; time: string; kind: CalendarKind; refId: string; createdAt: string;
  /** v2 (optional): presence hours; 'HH:MM' strings. Missing on older presence = all day. */ from?: string; to?: string; note?: string; audience?: 'all' | 'managers'; participants?: string[]; reminder?: string;
  /** v2: when the Worker should send the reminder (ISO) and when it did. */ remindAt?: string | null; reminderSentAt?: string | null };


// ======================= redesign v2 =======================

/** Manager projects (P1-P6). Managers and owners only. */
export type Project = {
  id: string; title: string; goal: string; deadline: string; deadlineText?: string;
  members: Actor[]; status: 'active' | 'done'; createdBy: Actor; createdAt: string; updatedAt: string;
  /** uids of members (rules and queries); short name for compact places (P4, P6); when the last step was done. */
  memberUids?: string[]; short?: string; doneAt?: string | null;
};
/** projects/{pid}/steps/{sid} */
export type ProjectStep = {
  id: string; projectId: string; n: number; title: string; assignee: Actor | null; due: string; note: string;
  done: boolean; doneBy: Actor | null; doneAt: string | null; parentId?: string | null;
  updates: { by: Actor; at: string; text: string }[];
  createdBy: Actor; createdAt: string; updatedAt: string;
};

/** Team broadcast (B1-B4). Read receipts at broadcasts/{id}/reads/{uid}. */
/** Team audiences: all, farmToday, managers, crew. Outside the team (tidy round, Q26): registrants of one event (eventId, a
 *  service message to every registrant), vendors, and everyone (all users who opted in to updates, `Profile.updatesOptIn`). */
export { AUDIENCE_LABELS, OUTSIDE_AUDIENCES, type BroadcastAudience } from '../../shared/message-activity';
export type Broadcast = {
  id: string; text: string; audience: BroadcastAudience; eventId?: string; urgent: boolean;
  by: Actor; createdAt: string; recipients: string[]; recipientCount: number; resentAt?: string | null;
};
export type BroadcastRead = { id: string; uid: string; name: string; at: string };

/** Personal notifications (C1): users/{uid}/notifications/{id}. Works without push. */
export type UserNotificationKind = 'task' | 'urgent' | 'trip' | 'event' | 'broadcast' | 'vendor' | 'system';
export type UserNotification = {
  id: string; kind: UserNotificationKind; title: string; sub: string; link: string; refId: string;
  action?: { label: string; kind: 'addToTrip' | 'open' }; by?: Actor; createdAt: string; readAt: string | null;
};

/** Push outbox drained by the Worker (docs/push-design.md). Idempotent by id. */
export type PushJob = { id: string; kind: string; title: string; body: string; link: string; to: string[]; createdBy: Actor; createdAt: string; sentAt?: string | null };

/** Per-event vendor record events/{id}/vendors/{vid} (existing EventVendor, extended). */
export type VendorStatus = 'invited' | 'confirmed' | 'declined';
export type VendorNeed = 'table' | 'power' | 'shade' | 'water' | 'parking' | 'chairs';
export const NEED_LABELS: Record<VendorNeed, string> = { table: 'שולחן', power: 'חשמל', shade: 'צל', water: 'מים', parking: 'חניה לרכב', chairs: 'כיסאות' };
export type EventVendorV2 = EventVendor & {
  status?: VendorStatus; invitedAt?: string; answeredAt?: string | null;
  sells?: string; needs?: VendorNeed[]; people?: number; vehicle?: string; note?: string;
  spot?: number | null; spotNote?: string; arrivedAt?: string | null; arrivedBy?: string;
  feedback?: { rating: number; text: string; inviteNext: boolean; at: string } | null;
};
/** events/{id}/vendor_requests/{rid} (D6, V7, M2). */
export type VendorRequestKind = 'power' | 'water' | 'help' | 'supply' | 'other';
export type VendorRequest = { id: string; eventId: string; vendorId: string; vendorName: string; kind: VendorRequestKind; text: string; by: Actor; createdAt: string; takenBy: Actor | null; /** W2 "אני על זה": when takenBy took it. */ takenAt?: string | null; closedAt: string | null; closedBy?: Actor | null };

/** Vendor pool (vendors/{id}), extended. */
export type VendorV2 = Vendor & {
  contact?: string; sells?: string; needs?: VendorNeed[]; note?: string; photo?: string;
  events?: string[]; people?: { uid: string; name: string; phone?: string; role: 'owner' | 'helper'; entered: boolean; addedAt?: string }[];
  inviteNext?: boolean;
};

/** Gate scans (events/{id}/scans/{sid}). */
export type ScanResult = 'ok' | 'paidAtGate' | 'payLater' | 'rejected';
export type GateScan = { id: string; eventId: string; ticketId: string; orderId: string; name: string; meta: string; result: ScanResult; reason?: string; amount?: number; method?: string; by: Actor; at: string; reopenedBy?: Actor | null; reopenedAt?: string | null };
/** events/{id}/counters/live: updated with each scan. */
export type LiveCounters = { entered: number; paidAtGate: number; payLater: number; payLaterAmount: number; rejected: number; scans: number; perHalfHour: Record<string, number> };

/** events/{id}/staffing/{station} (V4). */
export type Staffing = { id: string; station: string; people: { uid: string; name: string; hours: string }[]; needed: number };

/** Event close (Y5). Stored on the event document as `closed`. */
/** events/{id}.closed. Public with the event, so it holds no money: the cash counts live in events/{id}/counters/cash (managers only). */
export type EventClose = { at: string; by: Actor; reopenUntil: string };

/** Debts (V5): derived from pay-later tickets and unpaid tabs; reminders stamped on the source document as reminderSentAt. */
export type Debt = { id: string; kind: 'tickets' | 'tab'; refId: string; eventId: string; name: string; phone: string; what: string; amount: number; reminderSentAt: string | null };

/** Presence entries live in `calendar` (kind 'presence'); v2 adds hours. */
export type PresenceHours = { from: string; to: string; label: 'allDay' | 'morning' | 'afternoon' | 'other' };
