// Demo seed slice for the guest screens (U1-U14), for the guest persona (Michal). Additive only: her two update messages
// (U1 card, U14 list, one unread), a visit request (U7 item, visit page), her updates switch on (U7 "פעיל") and
// WhatsApp as her payment-confirmation channel.
// Her paid and unpaid festival orders, the claimed donation and the stall accounts are already in demo/data.ts.
// The regular day is Thu 19.11.2026.
import type { Slice } from './types';
import { put, patch } from './types';
import { U, A, E } from '../data';

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+02:00`).toISOString();
const TODAY = '2026-11-19';

const slice: Slice = (seed) => {
  // her payment confirmations go to WhatsApp (U3, U7 "נשלח אליי בוואטסאפ"); her registration answer stays
  patch(seed, 'users', U.michal, { updatesOptIn: true, fields: { city: 'טנא עומרים', receiptPreference: 'whatsapp' } });
  put(seed, 'broadcasts', [
    // a service message to the festival's registrants (sent to everyone with a ticket, opt-in or not)
    { id: 'demo-b-g1', text: 'פסטיבל הסתיו: החניה עברה לשדה הצפוני. יש שילוט מהכביש.', audience: 'registrants', eventId: E.fall, urgent: false, by: A.beni,
      createdAt: at(TODAY, '11:20'), recipients: [U.michal, U.david, U.roni], recipientCount: 3, resentAt: null },
    // an update to everyone who opted in
    { id: 'demo-b-g2', text: 'ערב חנוכה בחווה, 13.12. ההרשמה נפתחה.', audience: 'everyone', urgent: false, by: A.beni,
      createdAt: at('2026-11-16', '18:00'), recipients: [U.michal, U.david], recipientCount: 2, resentAt: null },
  ]);
  put(seed, 'broadcasts/demo-b-g2/reads', [{ id: U.michal, uid: U.michal, name: 'מיכל ברק', at: at('2026-11-16', '19:05'), seenAt: at('2026-11-16', '19:05') }]);
  put(seed, 'visits', [
    { id: 'demo-vi-michal', uid: U.michal, name: 'מיכל ברק', phone: '054-000-0155', date: '2026-11-27', people: 4, type: 'סיור בחווה', note: 'סבא וסבתא עם הנכדים, מעדיפים בוקר.',
      status: 'approved', managerNote: 'נפגשים בשער ב־10:00', handledBy: A.beni, createdAt: at('2026-11-17', '20:10'), updatedAt: at('2026-11-18', '09:30') },
  ]);
};
export default slice;
