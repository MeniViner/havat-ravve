// Demo seed slice for the "broadcast" area: team broadcasts with read receipts (B2, B3, B4, D3) and the volunteer's
// notifications (C1). Values from demo-data.json ("broadcasts", "notifications"); the regular day is Thu 19.11.
//
// One knowingly different number: demo-data.json counts Yoav among the 9 readers of demo-b-1, but Yoav is also the
// volunteer persona who sees that same broadcast as an unread card (B4). The card is the designed screen for him, so
// here he has not read it yet: B2/B3 start at 8 of 12 and reach the designed 9 of 12 once he taps "קראתי".
import type { Slice, Row } from './types';
import { put } from './types';
import { U, A, E } from '../data';

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+02:00`).toISOString();
const TODAY = '2026-11-19', YESTERDAY = '2026-11-18';
const TEAM = [U.beni, U.eliya, U.noa, U.roi, U.dana, U.yoav, U.orly, U.omer, U.shira, U.gil, U.maya, U.avi];
const NAMES: Record<string, string> = {
  [U.beni]: 'בני גוטמן', [U.eliya]: 'אליה כהן', [U.noa]: 'נועה שחר', [U.roi]: 'רועי אלון', [U.dana]: 'דנה אברהם', [U.yoav]: 'יואב פרץ',
  [U.orly]: 'אורלי לוי', [U.omer]: 'עומר לוי', [U.shira]: 'שירה גולן', [U.gil]: 'גיל ברק', [U.maya]: 'מאיה רוזן', [U.avi]: 'אבי נחום',
  [U.raz]: 'רז כהן', [U.tamar]: 'תמר כהן',
};
const bc = (id: string, by: { uid: string; name: string }, createdAt: string, audience: string, text: string, recipients: string[], extra: Row = {}): Row =>
  ({ id, text, audience, urgent: false, by, createdAt, recipients, recipientCount: recipients.length, resentAt: null, ...extra });
const read = (uid: string, readAt: string | null, seenAt?: string): Row => ({ id: uid, uid, name: NAMES[uid] || '', at: readAt, seenAt: seenAt || readAt || undefined });

const slice: Slice = (seed) => {
  put(seed, 'broadcasts', [
    bc('demo-b-1', A.beni, at(TODAY, '14:10'), 'all', 'מחר מתחילים ב־15:30 ולא ב־16:00. להגיע עם כובע ומים.', TEAM),
    bc('demo-b-2', A.noa, at(YESTERDAY, '11:30'), 'farmToday', 'מי שסיים, לבוא לעזור בפריקה ליד השער', [U.beni, U.noa, U.dana, U.yoav], { urgent: true }),
    bc('demo-b-3', A.beni, at('2026-10-26', '20:15'), 'all', 'תודה לכולם על היריד. היה מעולה.', TEAM),
    bc('demo-b-v1', A.beni, at(YESTERDAY, '18:40'), 'vendors', 'כניסת רכבים רק עד 15:15', [U.raz, U.tamar], { eventId: E.fall }),
    bc('demo-b-v2', A.noa, at('2026-11-12', '12:00'), 'vendors', 'תודה שאישרתם. מפת הדוכנים בפנים', [U.raz, U.tamar], { eventId: E.fall }),
  ]);
  // demo-b-1: read by 8 (Beni wrote it); Dana and Eliya saw it and did not read; Omer and Yoav have not opened the app since
  put(seed, 'broadcasts/demo-b-1/reads', [
    read(U.beni, at(TODAY, '14:10')), read(U.noa, at(TODAY, '14:11')), read(U.orly, at(TODAY, '14:20')), read(U.roi, at(TODAY, '14:31')),
    read(U.shira, at(TODAY, '14:40')), read(U.gil, at(TODAY, '15:02')), read(U.maya, at(TODAY, '15:20')), read(U.avi, at(TODAY, '16:05')),
    read(U.dana, null, at(TODAY, '14:15')), read(U.eliya, null, at(TODAY, '14:50')),
  ]);
  put(seed, 'broadcasts/demo-b-2/reads', [U.noa, U.beni, U.dana, U.yoav].map((u, i) => read(u, at(YESTERDAY, `11:${30 + i * 4}`))));
  put(seed, 'broadcasts/demo-b-3/reads', TEAM.filter((u) => u !== U.omer).map((u, i) => read(u, at('2026-10-26', `20:${String(16 + i * 3).padStart(2, '0')}`))));
  put(seed, 'broadcasts/demo-b-v2/reads', [read(U.raz, at('2026-11-12', '12:40')), read(U.tamar, at('2026-11-12', '13:05'))]);

  // C1 for the volunteer persona (Yoav): three new, three earlier. The trip is someone else's (demo-data.json note).
  const n = (id: string, kind: string, title: string, sub: string, link: string, createdAt: string, readAt: string | null, extra: Row = {}): Row =>
    ({ id, kind, title, sub, link, refId: '', createdAt, readAt, ...extra });
  put(seed, `users/${U.yoav}/notifications`, [
    n('demo-n-trip', 'trip', 'גיל יוצא לסופר עכשיו', 'צריך משהו? עוד אפשר להוסיף', '/shopping', at(TODAY, '10:26'), null, { action: { label: 'הוספה', kind: 'addToTrip' }, by: A.gil }),
    n('demo-n-tap', 'task', 'משימה חדשה עליך', 'לתקן את הברז ליד החממה', '/tasks/demo-t-tap', at(TODAY, '10:10'), null, { refId: 'demo-t-tap', by: A.beni }),
    n('demo-n-flag', 'urgent', 'דחוף לכולם', 'להחליף את הדגל בכניסה', '/tasks/demo-t-flag', at(TODAY, '07:02'), null, { refId: 'demo-t-flag', by: A.beni }),
    n('demo-n-festival', 'event', 'מחר: פסטיבל הסתיו', 'המשמרת שלך מתחילה ב־15:30', `/farm/events/${E.fall}`, at(YESTERDAY, '18:00'), at(YESTERDAY, '19:10'), { refId: E.fall }),
    n('demo-n-taken', 'task', 'נועה לקחה משימה שהוספת', 'לצבוע את דלת המחסן', '/tasks', at(YESTERDAY, '12:40'), at(YESTERDAY, '13:00'), { by: A.noa }),
    n('demo-n-tripdone', 'trip', 'הקנייה בסופר נסגרה', '5 נקנו · קפה שחור לא היה', '/shopping/history', at('2026-11-17', '17:30'), at('2026-11-17', '18:02'), { by: A.noa }),
  ]);

  // "צוות האירוע" in B1 counts the festival's staffing (V4). Added only when the events slice did not seed it.
  const staffing = `events/${E.fall}/staffing`;
  if (!seed.collections[staffing]?.length) {
    put(seed, staffing, [
      { id: 'gate', station: 'שער', needed: 2, people: [{ uid: U.yoav, name: NAMES[U.yoav], hours: '15:30–18:30' }, { uid: U.dana, name: NAMES[U.dana], hours: '18:30–21:00' }] },
      { id: 'stall', station: 'דוכן', needed: 2, people: [{ uid: U.noa, name: NAMES[U.noa], hours: '15:30–21:00' }, { uid: U.orly, name: NAMES[U.orly], hours: '16:00–20:00' }] },
      { id: 'parking', station: 'חניה', needed: 1, people: [] },
    ]);
  }
};
export default slice;
