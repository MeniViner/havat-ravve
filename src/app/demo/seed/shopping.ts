// Demo seed slice for the "shopping" area (S1-S8). The core rows live in demo/data.ts; this slice fixes their times to the
// designs and adds what the screens need per scenario:
//  regular (Thu 19.11 10:30): S1/S2/S3/S4/S8 as designed, no trip open; this week's purchases for S8 ("השבוע · 9").
//  eventDay (Sat 28.11 17:20): Yoav is at the supermarket (S6): 2 in the cart, coffee not on the shelf, Dana added tahini live.
//  afterEvent (Sat 28.11 21:04): the same trip closed (S7): 5 bought, coffee stayed on the list.
import type { Slice, Seed, Row } from './types';
import { put, patch } from './types';

const actor = (uid: string, name: string) => ({ uid, name });
const A = {
  beni: actor('demo-u-beni', 'בני גוטמן'), eliya: actor('demo-u-eliya', 'אליה כהן'), noa: actor('demo-u-noa', 'נועה שחר'),
  yoav: actor('demo-u-yoav', 'יואב פרץ'), dana: actor('demo-u-dana', 'דנה אברהם'),
};
/** An instant in Israel (winter, +02:00). */
const t = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();
const plus24 = (iso: string) => new Date(new Date(iso).getTime() + 24 * 3600_000).toISOString();
const item = (id: string, title: string, category: string, o: Row = {}): Row => ({
  id, title, note: '', link: '', category, qty: '', urgent: false, createdBy: A.noa, createdAt: t('2026-11-10', '09:00'),
  bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: t('2026-11-10', '09:00'), ...o,
});
const bought = (by: { uid: string; name: string }, at: string, o: Row = {}): Row => ({ bought: true, boughtBy: by, boughtAt: at, expireAt: plus24(at), updatedAt: at, ...o });

function regular(seed: Seed) {
  // S1 "דנה · לפני שעה" and F5/N14 "09:12 דנה הוסיפה לקניות: חלב 3%"; the soap row is "לפני 3 ימים"
  patch(seed, 'shopping', 'demo-s-milk', { createdAt: t('2026-11-19', '09:12'), updatedAt: t('2026-11-19', '09:13') });
  patch(seed, 'shopping', 'demo-s-soap', { createdAt: t('2026-11-16', '12:00') });
  // S2: "לפני שבוע" / "לפני שבועיים" / "לפני חודש"
  patch(seed, 'shopping', 'demo-s-cabinet', { createdAt: t('2026-11-12', '09:00') });
  patch(seed, 'shopping', 'demo-s-fence', { createdAt: t('2026-11-05', '09:00') });
  patch(seed, 'shopping', 'demo-s-barrow', { createdAt: t('2026-10-20', '09:00') });
  // S4 timeline: "היום 09:13 · דנה סימנה דחוף"
  for (const a of seed.collections.activity || []) if (a.refId === 'demo-s-milk' && a.action === 'edited') a.at = t('2026-11-19', '09:13');
  // S8 "השבוע · 9": Tue goat food, Mon screws, Sun milk, and six more from Sunday's big shop
  patch(seed, 'shopping', 'demo-s-goatfood-prev', bought(A.yoav, t('2026-11-17', '10:00')));
  patch(seed, 'shopping', 'demo-s-milk-prev', { qty: '6 קרטונים', ...bought(A.noa, t('2026-11-15', '11:30')) });
  patch(seed, 'shopping', 'demo-s-cement-prev', bought(A.dana, t('2026-11-15', '11:10')));
  patch(seed, 'shopping', 'demo-s-flour', bought(A.noa, t('2026-11-15', '11:00')));
  put(seed, 'shopping', [
    item('demo-s-screws-prev', 'ברגים לגדר', 'building', { qty: 'קופסה', createdBy: A.eliya, createdAt: t('2026-11-12', '08:00'), ...bought(A.beni, t('2026-11-16', '16:00')) }),
    item('demo-s-oil-prev', 'שמן זית', 'super', { qty: 'בקבוק', createdBy: A.dana, ...bought(A.noa, t('2026-11-15', '10:50')) }),
    item('demo-s-sugar-prev', 'סוכר', 'super', { qty: '2 ק״ג', createdBy: A.beni, ...bought(A.noa, t('2026-11-15', '10:40')) }),
    item('demo-s-rice-prev', 'אורז', 'super', { qty: '2 ק״ג', createdBy: A.noa, ...bought(A.noa, t('2026-11-15', '10:30')) }),
    item('demo-s-paper-prev', 'נייר טואלט', 'super', { qty: 'חבילה', createdBy: A.yoav, ...bought(A.noa, t('2026-11-15', '10:20')) }),
  ]);
}

const TRIP = 'demo-trip-yoav';
function tripDay(seed: Seed, closed: boolean) {
  const d = '2026-11-28';
  const trip = { id: TRIP, by: A.yoav, list: 'super', startedAt: t(d, '17:02'), closedAt: closed ? t(d, '17:41') : null, bought: [] as string[], missing: [] as string[] };
  // the festival's tablecloths were bought before the day
  patch(seed, 'shopping', 'demo-s-tablecloths', bought(A.noa, t('2026-11-26', '12:00')));
  patch(seed, 'shopping', 'demo-s-milk', { createdAt: t(d, '15:40'), updatedAt: t(d, '15:40') });
  patch(seed, 'shopping', 'demo-s-soap', { createdAt: t('2026-11-26', '09:00') });
  patch(seed, 'shopping', 'demo-s-coffee', { createdAt: t('2026-11-27', '08:00'), notAvailable: true, notAvailableAt: t(d, '17:10'), tripId: TRIP, updatedAt: t(d, '17:10') });
  patch(seed, 'shopping', 'demo-s-eggs', { createdAt: t('2026-11-25', '09:00'), ...bought(A.yoav, t(d, '17:08'), { tripId: TRIP }) });
  patch(seed, 'shopping', 'demo-s-bags', { createdAt: t('2026-11-24', '09:00'), ...bought(A.yoav, t(d, '17:11'), { tripId: TRIP }) });
  put(seed, 'shopping', [item('demo-s-tahini', 'טחינה', 'super', { qty: '2 צנצנות', createdBy: A.dana, createdAt: t(d, '17:14'), updatedAt: t(d, '17:14') })]);
  if (closed) {
    patch(seed, 'shopping', 'demo-s-milk', bought(A.yoav, t(d, '17:30'), { tripId: TRIP }));
    patch(seed, 'shopping', 'demo-s-tahini', bought(A.yoav, t(d, '17:33'), { tripId: TRIP }));
    patch(seed, 'shopping', 'demo-s-soap', bought(A.yoav, t(d, '17:35'), { tripId: TRIP }));
    trip.bought = ['demo-s-eggs', 'demo-s-bags', 'demo-s-milk', 'demo-s-tahini', 'demo-s-soap'];
    trip.missing = ['demo-s-coffee'];
  }
  put(seed, 'shopping_trips', [trip]);
}

const slice: Slice = (seed, scenario) => {
  if (scenario === 'regular') regular(seed);
  else tripDay(seed, scenario === 'afterEvent');
};
export default slice;
