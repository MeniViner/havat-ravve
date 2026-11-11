export type Role = 'owner' | 'manager' | 'staff' | 'guest';
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
  notes?: string;
  fields?: Record<string, string>;
  log?: { at: string; by: Actor; text: string }[];
  createdAt: string;
  updatedAt: string;
};

export type Actor = { uid: string; name: string };

export type Place = { id: string; name: string; lat: number; lng: number; createdBy: Actor; createdAt: string };

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
  updatedAt: string;
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
};

export type ShoppingCategory = 'super' | 'building' | 'online' | 'giveaway';

export type ShoppingItem = {
  id: string;
  title: string;
  note: string;
  link: string;
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
};

export type RoleInvite = { id: string; email: string; role: 'staff' | 'manager' | 'owner'; createdBy: Actor; createdAt: string };
export type ActivityKind = 'task' | 'shopping' | 'event' | 'ticket' | 'tab' | 'place' | 'visit' | 'donation' | 'user' | 'settings';
export type Activity = { id: string; kind: ActivityKind; refId: string; action: string; text: string; by: Actor; at: string; subjectUid: string; eventId: string };
export const KIND_LABELS: Record<ActivityKind, string> = { task: 'משימה', shopping: 'קניות', event: 'אירוע', ticket: 'כרטיס', tab: 'דוכן', place: 'מקום', visit: 'ביקור', donation: 'תרומה', user: 'אנשים', settings: 'הגדרות' };
export type Invite = { code: string; role: 'staff'; active: boolean; createdBy: Actor; createdAt: string; usedBy: string[] };

export const CATEGORY_LABELS: Record<ShoppingCategory, string> = { super: 'סופר', building: 'חומרי בניין', online: 'אינטרנט', giveaway: 'מוצרי מסירה' };
export const ROLE_LABELS: Record<Role, string> = { owner: 'בעלים', manager: 'מנהל/ת', staff: 'צוות', guest: 'אורח/ת' };
export const STATUS_LABELS: Record<Status, string> = { active: 'פעיל', pending: 'ממתין לאישור', blocked: 'חסום' };
export const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// ---------- events, tickets, visits, donations, stalls ----------
export type PaymentStatus = 'free' | 'pending' | 'claimed' | 'paid' | 'paid_onsite' | 'cancelled';
export const PAYMENT_LABELS: Record<PaymentStatus, string> = { free: 'חינם', pending: 'ממתין לתשלום', claimed: 'הועבר, ממתין לאישור', paid: 'שולם', paid_onsite: 'שולם במקום', cancelled: 'בוטל' };

export type EventQuestion = { id: string; label: string; required: boolean };
export type FarmEvent = {
  id: string; title: string; description: string; image: string; location: string;
  start: string; end: string; price: number; maxPerOrder: number; capacity: number;
  open: boolean; published: boolean; questions: EventQuestion[];
  createdBy: Actor; createdAt: string; updatedAt: string;
};

export type TicketScan = { at: string; by: Actor };
export type Ticket = {
  id: string; eventId: string; eventTitle: string; orderId: string; index: number; total: number;
  ownerUid: string; ownerName: string; ownerPhone: string; holderName: string;
  secret: string; price: number; paymentStatus: PaymentStatus; status: 'valid' | 'cancelled';
  scans: TicketScan[]; entries: number; answers: Record<string, string>;
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
  createdAt: string; updatedAt: string;
};

export type Vendor = { id: string; name: string; phone: string; product: string; external: boolean; notes: string; createdAt: string; updatedAt: string };
export type EventVendor = { id: string; vendorId: string; name: string; confirmed: boolean; notes: string };
export type Product = { id: string; name: string; price: number; active: boolean; sort: number };
export type TabItem = { productId: string; name: string; price: number; qty: number; at: string; by: Actor };
export type TabStatus = 'open' | 'claimed' | 'paid' | 'waived';
export const TAB_LABELS: Record<TabStatus, string> = { open: 'פתוח', claimed: 'הועבר, ממתין לאישור', paid: 'שולם', waived: 'נמחל' };
export type Tab = {
  id: string; eventId: string; eventTitle: string; guestUid: string; guestName: string; guestPhone: string; ticketId: string;
  items: TabItem[]; total: number; status: TabStatus; createdBy: Actor; createdAt: string; updatedAt: string;
};

export type RegistrationField = { id: string; label: string; type: 'text' | 'date' | 'choice'; options: string[]; required: boolean };
export type Settings = {
  donationPresets: { amount: number; label: string }[];
  visitTypes: string[];
  payment: { bit: string; paybox: string; cash: boolean; note: string };
  templates: { visitApproved: string; donationThanks: string; debtReminder: string; ticketReminder: string };
  registrationFields: RegistrationField[];
  guestIntro: string;
};
export const DEFAULT_SETTINGS: Settings = {
  donationPresets: [{ amount: 18, label: 'חי' }, { amount: 180, label: 'עשר פעמים חי' }, { amount: 360, label: 'לב' }],
  visitTypes: ['סיור בחווה', 'מפגש קבוצתי', 'אירוע פרטי', 'אחר'],
  payment: { bit: '', paybox: '', cash: true, note: '' },
  templates: {
    visitApproved: 'שלום [שם], הביקור בחוות רווה ב־[תאריך] מאושר. נשמח לראותכם!',
    donationThanks: 'שלום [שם], תודה רבה על התרומה לחוות רווה.',
    debtReminder: 'שלום [שם], תודה שהייתם ב־[אירוע]. נשאר לתשלום [סכום] ₪. אפשר להעביר בביט או ב־PayBox. תודה!',
    ticketReminder: 'שלום [שם], מזכירים: [אירוע] מתקיים ב־[תאריך]. הכרטיסים באפליקציה: https://havat-ravve.web.app/app/me',
  },
  registrationFields: [],
  guestIntro: 'ברוכים הבאים לחוות רווה. כאן מזמינים כרטיסים לאירועים, מתאמים ביקור ותורמים.',
};

export type NotificationType = 'visit' | 'donation' | 'join' | 'order' | 'receipt' | 'tab' | 'claim';
export type AppNotification = { id: string; type: NotificationType; title: string; text: string; link: string; refId: string; createdAt: string; handled: boolean; handledBy: Actor | null; handledAt: string | null };

export type CalendarItem = { id: string; ownerUid: string; ownerName: string; title: string; date: string; time: string; kind: 'manual' | 'visit' | 'event'; refId: string; createdAt: string };
