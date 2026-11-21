// Demo seed slice for the vendor area (D1-D11, V1, V2, V6, V7, N8): access invites, the vendor brief per event,
// gendered wording flags, the farm stall's people, event-day arrivals and a request, and the farm messages to vendors.
import type { Slice, Seed, Row } from './types';
import { put, patch } from './types';
import { U, A, E, V } from '../data';

const key = (d: number) => new Date(Date.UTC(2026, 10, 19 + d)).toISOString().slice(0, 10);
const at = (d: number, hhmm = '12:00') => new Date(`${key(d)}T${hhmm}:00+02:00`).toISOString();
const FEST = 9; // 28.11
const has = (seed: Seed, path: string, id: string) => (seed.collections[path] || []).some((r) => String(r.id) === id) || !!seed.documents[`${path}/${id}`];

const slice: Slice = (seed, scenario) => {
  // ---------- vendors: wording and people ----------
  for (const id of [V.dana, V.bakery, V.jewel, V.herbs]) patch(seed, 'vendors', id, { fem: true });
  patch(seed, 'vendors', V.raz, {
    note: 'מגיע עם מקרר',
    people: [
      { uid: U.raz, name: 'רז כהן', phone: '052-000-0471', role: 'owner', entered: true, addedAt: '2026-10-10', addedBy: U.beni, code: 'demo-vi-raz', lastSeenAt: at(-1, '20:10') },
      { uid: U.tamar, name: 'תמר כהן', phone: '052-000-0472', role: 'helper', entered: false, addedAt: '2026-11-17', addedBy: U.raz, code: 'demo-vi-tamar', fem: true },
    ],
  });
  patch(seed, 'vendors', V.farm, { people: [{ uid: U.noa, name: 'נועה שחר', role: 'owner', entered: true, fem: true }, { uid: U.orly, name: 'אורלי לוי', role: 'helper', entered: true, fem: true }] });
  patch(seed, 'vendors', V.dana, { people: [{ name: 'דנה לב', phone: '054-000-0605', role: 'owner', entered: false, fem: true }] });
  patch(seed, 'vendors', V.jewel, { people: [{ name: 'שירן', phone: '052-000-0520', role: 'owner', entered: false, fem: true }] });
  patch(seed, 'vendors', V.honey, { people: [{ name: 'יאיר', phone: '054-000-0602', role: 'owner', entered: false }] });
  patch(seed, 'vendors', V.bakery, { people: [{ name: 'מרים', phone: '052-000-0604', role: 'owner', entered: false, fem: true }] });
  // V1 shows שירן at two events: she was at the October fair too.
  patch(seed, 'vendors', V.jewel, { events: [E.fall, E.oct] });
  const oct = seed.collections[`events/${E.oct}/vendors`] || [];
  if (!oct.some((r) => r.id === V.jewel)) put(seed, `events/${E.oct}/vendors`, [{ ...(seed.collections[`events/${E.fall}/vendors`] || []).find((r) => r.id === V.jewel), spot: 7, status: 'confirmed', confirmed: true, arrivedAt: null, answeredAt: at(-30, '10:00'), invitedAt: at(-35, '10:00') }]);

  // ---------- access invites (vendor_invites/{code}) ----------
  put(seed, 'vendor_invites', [
    { id: 'demo-vi-raz', code: 'demo-vi-raz', vendorId: V.raz, vendorName: 'גבינות משק רז', role: 'owner', name: 'רז כהן', phone: '052-000-0471', active: false, usedBy: U.raz, usedAt: at(-40, '19:02'), createdBy: A.beni, createdAt: at(-40, '18:00') },
    { id: 'demo-vi-tamar', code: 'demo-vi-tamar', vendorId: V.raz, vendorName: 'גבינות משק רז', role: 'helper', name: 'תמר כהן', phone: '052-000-0472', fem: true, active: true, usedBy: null, usedAt: null, createdBy: A.raz, createdAt: at(-2, '21:15') },
  ]);

  // ---------- the brief invited vendors read (events/{eid}/vendor_info/main) ----------
  const managers = [U.beni, U.noa];
  const contact = { uid: U.noa, name: 'נועה שחר', phone: '052-000-0007' };
  put(seed, `events/${E.fall}/vendor_info`, [{
    id: 'main', setupFrom: '14:00', vehiclesUntil: '15:15', teardownFrom: '21:30', peakUntil: '18:30', expected: 600, provided: 'שולחן, צל, חשמל לפי בקשה',
    bring: 'כבל מאריך, תאורה לערב', contact, guidelines: { name: 'הנחיות לדוכנים', url: 'https://havat-ravve.web.app/assets/vendor-guidelines.pdf', minutes: 2 },
    mapUrl: 'https://havat-ravve.web.app/assets/stalls-map.webp', answerBy: '2026-11-25', note: 'נשמח שתבואו שוב. שמרנו לכם את המקום ליד הכניסה, בצל.',
    managerUids: managers, updatedAt: at(-9, '10:00'),
    ...(scenario === 'afterEvent' ? { visitors: 487, stalls: 9, thanks: 'היה ערב יפה. תודה שבאתם, ונשמח לראות אתכם גם בחנוכה. בני' } : {}),
  }]);
  put(seed, `events/${E.oct}/vendor_info`, [{ id: 'main', setupFrom: '14:00', vehiclesUntil: '15:15', teardownFrom: '21:30', contact, managerUids: managers, visitors: 81, stalls: 6, thanks: 'תודה שבאתם ליריד. היה שמח, ונשמח לראות אתכם שוב בסתיו. בני', updatedAt: at(-23, '10:00') }]);
  put(seed, `events/${E.rosh}/vendor_info`, [{ id: 'main', setupFrom: '08:30', vehiclesUntil: '09:30', teardownFrom: '12:30', contact, managerUids: managers, visitors: 14, stalls: 2, updatedAt: at(-50, '10:00') }]);

  // ---------- raz's festival record ----------
  patch(seed, `events/${E.fall}/vendors`, V.raz, { invitedBy: A.beni, invitedAt: at(-9, '10:00'), withVehicle: true, note: '', guidelinesReadAt: null });

  // ---------- event day and after: honey and bakery confirmed, arrivals, one open request ----------
  if (scenario === 'eventDay' || scenario === 'afterEvent') {
    patch(seed, `events/${E.fall}/vendors`, V.honey, { status: 'confirmed', confirmed: true, answeredAt: at(-3, '09:00') });
    patch(seed, `events/${E.fall}/vendors`, V.bakery, { status: 'confirmed', confirmed: true, answeredAt: at(-2, '11:00') });
    patch(seed, `events/${E.fall}/vendors`, V.dana, { arrivedAt: at(FEST, '14:20'), arrivedBy: 'demo-u-dana-lev' });
    patch(seed, `events/${E.fall}/vendors`, V.farm, { arrivedAt: at(FEST, '13:30'), arrivedBy: U.noa });
    patch(seed, `events/${E.fall}/vendors`, V.jewel, { arrivedAt: at(FEST, '14:40') });
    // raz has not pressed "הגעתי" yet (D5); D6 is reached by pressing it.
    const r: Row = { id: 'demo-vr-raz-power', eventId: E.fall, vendorId: V.raz, vendorName: 'גבינות משק רז', kind: 'power', text: 'החשמל נפל', by: A.raz, createdAt: at(FEST, '17:12'), takenBy: A.noa, closedAt: null, closedBy: null };
    put(seed, `events/${E.fall}/vendor_requests`, [scenario === 'afterEvent' ? { ...r, closedAt: at(FEST, '17:31'), closedBy: A.noa } : r]);
    if (!has(seed, `events/${E.fall}/counters`, 'live')) put(seed, `events/${E.fall}/counters`, [{ id: 'live', entered: scenario === 'eventDay' ? 212 : 487 }]);
  }
  if (scenario === 'afterEvent') {
    for (const id of [V.raz, V.honey, V.bakery]) patch(seed, `events/${E.fall}/vendors`, id, { arrivedAt: at(FEST, id === V.raz ? '14:05' : '14:50') });
  }

  // ---------- farm messages to vendors (B1 audience "בעלי דוכנים") ----------
  const vendorsUids = [U.raz, U.tamar];
  put(seed, 'broadcasts', [
    { id: 'demo-b-vendors-cars', text: 'כניסת רכבים רק עד 15:15', audience: 'vendors', eventId: E.fall, urgent: false, by: A.beni, createdAt: at(-1, '18:40'), recipients: vendorsUids, recipientCount: 6 },
    { id: 'demo-b-vendors-thanks', text: 'תודה שאישרתם. מפת הדוכנים בפנים', audience: 'vendors', eventId: E.fall, urgent: false, by: A.noa, createdAt: at(-7, '12:30'), recipients: vendorsUids, recipientCount: 4 },
  ]);
  put(seed, 'broadcasts/demo-b-vendors-thanks/reads', [{ id: U.raz, uid: U.raz, name: 'רז כהן', at: at(-7, '13:00') }, { id: U.tamar, uid: U.tamar, name: 'תמר כהן', at: at(-2, '21:30') }]);
};
export default slice;
