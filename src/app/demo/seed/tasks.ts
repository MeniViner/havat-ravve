// Demo seed slice for the "tasks" area (T1-T6, C3, C4, C6, C7, L1-L5, P1/P6 task parts).
// The designed day is Thu 19.11.2026 10:30. Staff = Yoav, owner = Beni (P1/P6, C4), manager = Noa.
// What the designs need from the data:
//  - Yoav: 3 of 5 of his tasks done today (T1), next up the toolbox, then compost (T4); one routine done by him (T6).
//  - T6: 11 done today (Yoav 4, Noa 4, Dana 2, Beni 1) with the four shown rows the latest, 9 done yesterday.
//  - P6: the tap and the supplier call are on Beni; a free task waits in the container; the gate routine is his.
import type { Slice, Row } from './types';
import { put, patch } from './types';
import { A, P, T, places } from '../data';
import type { Actor } from '../../types';

const key = (d: number) => new Date(Date.UTC(2026, 10, 19 + d)).toISOString().slice(0, 10);
const at = (d: number, hhmm: string) => new Date(`${key(d)}T${hhmm}:00+02:00`).toISOString();
const NOW = Date.parse('2026-11-19T10:30:00+02:00');
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const loc = (id: keyof typeof P) => { const p = places.find((x) => x.id === P[id])!; return { lat: p.lat, lng: p.lng, placeId: p.id, placeName: p.name }; };

function task(id: string, title: string, o: Row = {}): Row {
  return {
    id, title, note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null,
    createdBy: A.beni, createdAt: ago(20), done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null,
    urgent: false, eventId: '', updatedAt: ago(1), ...o,
  };
}
/** A task done on day d at hh:mm by `by` (assigned to them unless it is a routine). */
const doneTask = (id: string, title: string, by: Actor, d: number, hhmm: string, o: Row = {}) =>
  task(id, title, { createdAt: at(d - 1, '18:00'), dueDate: key(d), assignee: o.templateId ? null : by, done: true, doneBy: by, doneAt: at(d, hhmm), updatedAt: at(d, hhmm), ...o });
const routine = (tpl: string, title: string, by: Actor, d: number, hhmm: string, o: Row = {}) =>
  doneTask(`${tpl}_${key(d)}`, title, by, d, hhmm, { templateId: tpl, dateKey: key(d), createdAt: at(d, '00:05'), ...o });

const slice: Slice = (seed) => {
  // P6 / C4: the tap is on Beni (he passes it on in C4); the gate routine keeps no place so "ליד הכניסה" stays at 2 rows (T1).
  patch(seed, 'tasks', 'demo-t-tap', { assignee: A.beni, takenAt: ago(20 / 60) });
  patch(seed, 'tasks', `${T.gate}_${key(0)}`, { location: null });
  put(seed, 'tasks', [
    // open
    task('demo-t-paint', 'לצבוע את דלת המחסן', { location: loc('container'), createdBy: A.eliya, createdAt: ago(2) }),
    task('demo-t-supplier', 'להתקשר לספק הגדרות', { managersOnly: true, assignee: A.beni, takenAt: ago(5), createdAt: ago(5), dueDate: key(1) }),
    // done today, before the four rows T6 shows (06:30-08:30)
    routine(T.eggs, 'לאסוף ביצים', A.yoav, 0, '06:25'),
    doneTask('demo-t-hens', 'להאכיל את התרנגולות', A.yoav, 0, '06:15', { location: loc('petting') }),
    doneTask('demo-t-trough', 'למלא מים בשוקת', A.yoav, 0, '06:05', { location: loc('petting') }),
    doneTask('demo-t-coop', 'לנקות את הלול', A.noa, 0, '06:20'),
    doneTask('demo-t-pasture', 'להוציא את העיזים למרעה', A.noa, 0, '06:10', { location: loc('petting') }),
    doneTask('demo-t-sweep', 'לטאטא את השביל לביתן', A.noa, 0, '06:00', { location: loc('tree') }),
    doneTask('demo-t-tree-water', 'להשקות את העץ', A.dana, 0, '06:12', { location: loc('tree') }),
    // done yesterday (9): the two T6 shows first, then earlier ones
    doneTask('demo-t-stall-after', 'לסדר את הדוכן אחרי הסיור', A.noa, -1, '17:20', { location: loc('stall') }),
    routine(T.eggs, 'לאסוף ביצים', A.yoav, -1, '07:05'),
    routine(T.goats, 'להאכיל את העיזים', A.noa, -1, '06:55', { location: loc('petting') }),
    routine(T.gate, 'לפתוח את שער הכניסה', A.beni, -1, '06:30'),
    doneTask('demo-t-beds', 'להשקות את הערוגות', A.dana, -1, '06:45', { location: loc('greenhouse') }),
    doneTask('demo-t-fence-check', 'לבדוק את הגדר', A.eliya, -1, '06:40'),
    doneTask('demo-t-trough-y', 'לנקות את השוקת', A.noa, -1, '06:35', { location: loc('petting') }),
    doneTask('demo-t-twigs', 'לאסוף ענפים', A.dana, -1, '06:20', { location: loc('tree') }),
    doneTask('demo-t-backgate', 'לתקן את השער האחורי', A.roi, -1, '06:10'),
  ]);
};
export default slice;
