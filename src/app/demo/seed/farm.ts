// Demo seed slice for the "farm" area (F1-F6, C11, C5): November presence that gives the designed counts (F1 week bars,
// F2 month marks), today's people and hours (F1, F3, C4), Noa's and Yoav's week (C5, F4), today's calendar items (F2, F3),
// the feed of what was done today (F5, F1) and the festival crew (F6). Dates are absolute: the demo clock is frozen.
import { A, E, T, U } from '../data';
import type { Actor } from '../../types';
import type { Row, Slice } from './types';
import { drop, patch, put } from './types';

/** People at the farm per day in November 2026, as drawn in F2 (the 19th is the designed "today"). */
const NOVEMBER: number[] = [2, 3, 3, 4, 3, 2, 0, 2, 3, 3, 4, 3, 2, 0, 2, 3, 3, 5, 4, 2, 0, 2, 3, 2, 3, 3, 4, 8, 3, 2];
const ISO = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();
const first = (a: Actor) => a.name.split(' ')[0];
const timeOf = (from: string, to: string) => (from && to ? `${from}–${to}` : from || (to ? `–${to}` : ''));
const presence = (id: string, a: Actor, date: string, from = '', to = '', note = ''): Row => ({
  id, ownerUid: a.uid, ownerName: a.name, title: `${first(a)} בחווה`, date, time: timeOf(from, to), from, to, note, kind: 'presence', refId: '', createdAt: ISO('2026-11-10', '09:00'),
});
const HOURS: [string, string][] = [['', ''], ['08:00', '13:00'], ['09:00', '14:00'], ['13:00', '18:00'], ['07:30', '12:00'], ['10:00', '16:00']];

/** Fixed days (designed people and hours); every other day is filled from the team in a stable rotation. */
const FIXED: Record<string, Row[]> = {
  '2026-11-19': [
    presence('demo-c-presence-beni', A.beni, '2026-11-19'),
    presence('demo-c-presence-noa', A.noa, '2026-11-19', '09:00', '14:00'),
    presence('demo-c-presence-yoav', A.yoav, '2026-11-19', '08:00', '13:00'),
    presence('demo-c-presence-dana', A.dana, '2026-11-19', '15:00', '19:00'),
  ],
  '2026-11-22': [presence('demo-c-f-noa-22', A.noa, '2026-11-22'), presence('demo-c-f-beni-22', A.beni, '2026-11-22', '08:00', '13:00')],
  '2026-11-24': [presence('demo-c-f-noa-24', A.noa, '2026-11-24', '12:00', ''), presence('demo-c-f-dana-24', A.dana, '2026-11-24', '09:00', '14:00')],
  '2026-11-25': [presence('demo-c-f-yoav-25', A.yoav, '2026-11-25'), presence('demo-c-f-beni-25', A.beni, '2026-11-25'), presence('demo-c-f-dana-25', A.dana, '2026-11-25', '13:00', '18:00')],
  // the old calendar wrote presence as a manual item "בני בחווה": kept on the 20th and the 27th to show old documents still count
  '2026-11-20': [presence('demo-c-f-roi-20', A.roi, '2026-11-20', '09:00', '14:00')],
  '2026-11-27': [presence('demo-c-f-noa-27', A.noa, '2026-11-27', '08:00', '13:00'), presence('demo-c-f-dana-27', A.dana, '2026-11-27'), presence('demo-c-f-beni-27', A.beni, '2026-11-27', '10:00', '16:00')],
};
/** From the 19th on, Yoav and Noa appear only where the designs show them (F4, C5). */
const ROTATION: Actor[] = [A.beni, A.dana, A.roi, A.eliya, A.orly, A.shira, A.gil, A.omer, A.noa, A.yoav];

function november(): Row[] {
  const rows: Row[] = [];
  NOVEMBER.forEach((n, i) => {
    const date = `2026-11-${String(i + 1).padStart(2, '0')}`;
    if (FIXED[date]) { rows.push(...FIXED[date]); return; }
    const pool = date >= '2026-11-19' ? ROTATION.filter((a) => a !== A.yoav && a !== A.noa) : ROTATION;
    for (let k = 0; k < n; k++) {
      const a = pool[(i * 3 + k) % pool.length];
      const [from, to] = HOURS[(i + k) % HOURS.length];
      rows.push(presence(`demo-c-f-${a.uid.slice(7)}-${i + 1}`, a, date, from, to));
    }
  });
  return rows;
}

/** Noa's earlier November (C5 "החודש"): the goats every weekday from the 2nd to the 13th, egg collection on some days.
 *  Kept before this week so the feed (F5, "השבוע") shows only what the designs show. */
function noaMonth(): Row[] {
  const rows: Row[] = [];
  for (let d = 2; d <= 13; d++) {
    if (d === 7) continue; // Saturday
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    rows.push({ id: `demo-a-farm-noa-goats-${d}`, kind: 'task', refId: `${T.goats}_${date}`, action: 'done', text: 'האכלת העיזים', by: A.noa, at: ISO(date, '07:15'), subjectUid: U.noa, eventId: '' });
    if (d % 2 === 0) rows.push({ id: `demo-a-farm-noa-eggs-${d}`, kind: 'task', refId: `${T.eggs}_${date}`, action: 'done', text: 'איסוף ביצים', by: A.noa, at: ISO(date, '08:05'), subjectUid: U.noa, eventId: '' });
  }
  return rows;
}

const slice: Slice = (seed) => {
  // presence: replace the core sample with the designed month
  drop(seed, 'calendar', ['demo-c-1', 'demo-c-presence-yoav-later', 'demo-c-presence-yoav-next-month']);
  put(seed, 'calendar', november());
  // old-style manual presence that still counts: Beni on the 20th (with Roi = 2), Eliya twice on the 27th (one person, = 4)
  patch(seed, 'calendar', 'demo-c-2', { date: '2026-11-20' });
  // today's items (F2 summary, F3 "מה קורה"); the note is the line under the title
  patch(seed, 'calendar', 'demo-c-3', { date: '2026-11-19', time: '11:00', from: '11:00', to: '', note: 'בני מקבל', participants: [U.beni] });
  patch(seed, 'calendar', 'demo-c-4', { from: '10:30', to: '11:30', note: 'מנהלים', participants: [U.beni, U.noa, U.eliya], reminder: '60', remindAt: ISO('2026-11-19', '09:30'), reminderSentAt: ISO('2026-11-19', '09:30') });
  patch(seed, 'calendar', 'demo-c-5', { date: '2026-11-27' });

  // the feed (F5) and "נעשו היום" (F1): what the task rows say happened this morning
  const acts = seed.collections.activity || [];
  const fix = (refId: string, action: string, data: Row) => { const r = acts.find((a) => a.refId === refId && a.action === action); if (r) patch(seed, 'activity', String(r.id), data); };
  fix(`${T.goats}_2026-11-19`, 'done', { by: A.noa, at: ISO('2026-11-19', '07:10'), text: 'האכלת העיזים' });
  fix(`${T.gate}_2026-11-19`, 'done', { by: A.beni, at: ISO('2026-11-19', '06:30'), text: 'פתיחת שער הכניסה' });
  fix(`${T.pots}_2026-11-19`, 'done', { text: 'השקיית העציצים' });
  put(seed, 'activity', [
    { id: 'demo-a-farm-shade', kind: 'task', refId: 'demo-t-shade', action: 'done', text: 'רשתות צל', by: A.yoav, at: ISO('2026-11-19', '08:30'), subjectUid: U.yoav, eventId: '' },
    { id: 'demo-a-farm-milk', kind: 'shopping', refId: 'demo-s-milk', action: 'created', text: 'חלב 3% · 6 קרטונים', by: A.dana, at: ISO('2026-11-19', '09:12'), subjectUid: '', eventId: '' },
    ...noaMonth(),
  ]);

  // the festival crew (F6 "6 בצוות האירוע"); the event-day screens may extend the stations
  put(seed, `events/${E.fall}/staffing`, [
    { id: 'gate', station: 'שער', needed: 2, people: [{ uid: U.beni, name: A.beni.name, hours: '15:30–21:00' }, { uid: U.noa, name: A.noa.name, hours: '15:30–21:00' }] },
    { id: 'stall', station: 'דוכן החווה', needed: 2, people: [{ uid: U.yoav, name: A.yoav.name, hours: '15:30–21:00' }, { uid: U.dana, name: A.dana.name, hours: '15:30–21:00' }] },
    { id: 'parking', station: 'חניה', needed: 2, people: [{ uid: U.roi, name: A.roi.name, hours: '15:00–18:00' }, { uid: U.shira, name: A.shira.name, hours: '15:00–18:00' }] },
  ]);
};
export default slice;
