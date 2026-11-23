// Demo seed slice for the guest screens (U1-U14), for the guest persona (Michal). Additive only: she has read the Hanukkah
// update (her two messages, the festival one unread for the U1 card, come from the broadcast slice), a visit request (U7 item, visit page), her updates switch on (U7 "פעיל") and
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
  // U7: every registration question answered, so no "נשאר לענות" nudge on her account
  patch(seed, 'users', U.michal, { updatesOptIn: true, fields: { city: 'טנא עומרים', source: 'חברים', birthday: '1988-05-12', receiptPreference: 'whatsapp' } });
  // Q13: the managers' note on her card
  patch(seed, 'users', U.michal, { notes: 'מגיעה עם אמא בכיסא גלגלים. לשמור חניה ליד השער.' });
  // U7 "הכל · 6": the October stall account was Naama's (Q12 keeps its counts and total); Q13 Michal shows her festival items only
  patch(seed, 'tabs', 'demo-tab-michal-oct', { guestUid: U.naama, guestName: 'נעמה כהנא', guestPhone: '054-000-0199' });
  // U2: the description as designed, without the stall line
  patch(seed, 'events', E.fall, { description: 'אחר צהריים של סתיו בחווה: דוכני תוצרת ואומנות, סיורים מודרכים בין העצים, פינת חי לילדים ומוזיקה חיה עם השקיעה.' });
  // the messages themselves (demo-b-r1 festival, demo-b-e1 Hanukkah) are in the broadcast slice, which runs first
  put(seed, 'broadcasts/demo-b-e1/reads', [{ id: U.michal, uid: U.michal, name: 'מיכל ברק', at: at('2026-11-16', '19:05'), seenAt: at('2026-11-16', '19:05') }]);
  put(seed, 'visits', [
    { id: 'demo-vi-michal', uid: U.michal, name: 'מיכל ברק', phone: '054-000-0155', date: '2026-11-27', people: 4, type: 'סיור בחווה', note: 'סבא וסבתא עם הנכדים, מעדיפים בוקר.',
      status: 'approved', managerNote: 'נפגשים בשער ב־10:00', handledBy: A.beni, createdAt: at('2026-11-17', '20:10'), updatedAt: at('2026-11-18', '09:30') },
  ]);
};
export default slice;
