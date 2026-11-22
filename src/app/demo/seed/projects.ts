// Demo seed slice for the "projects" area (P1-P6): three active projects and four done ones, as in demo-data.json.
// The designed day is Thu 19.11.2026; the viewer of P1-P5 is Beni (owner persona).
import type { Slice, Row } from './types';
import { put } from './types';
import { A } from '../data';
import type { Actor } from '../../types';

const iso = (day: string, hhmm = '12:00') => new Date(`${day}T${hhmm}:00+02:00`).toISOString();
type StepIn = { id: string; title: string; assignee?: Actor | null; due?: string; doneBy?: Actor; doneAt?: string; note?: string; updates?: { by: Actor; at: string; text: string }[] };

function project(id: string, title: string, by: Actor, created: string, members: Actor[], extra: Row = {}): Row {
  return {
    id, title, goal: title, deadline: '', members, memberUids: members.map((m) => m.uid), status: 'active',
    createdBy: by, createdAt: iso(created, '09:00'), updatedAt: iso('2026-11-19', '08:20'), doneAt: null, ...extra,
  };
}
function steps(pid: string, by: Actor, created: string, list: StepIn[]): Row[] {
  return list.map((s, i) => ({
    id: s.id, projectId: pid, n: i + 1, title: s.title, assignee: s.doneBy ? s.doneBy : s.assignee ?? null, due: s.due || '', note: s.note || '',
    done: !!s.doneBy, doneBy: s.doneBy || null, doneAt: s.doneAt ? iso(s.doneAt, '17:00') : null, parentId: null, updates: s.updates || [],
    createdBy: by, createdAt: iso(created, '09:00'), updatedAt: s.doneAt ? iso(s.doneAt, '17:00') : iso(created, '09:00'),
  }));
}

const slice: Slice = (seed) => {
  const { beni, eliya, noa, roi, dana } = A;
  put(seed, 'projects', [
    project('demo-p-festival', 'הכנות לפסטיבל הסתיו', beni, '2026-10-28', [beni, noa, eliya], { deadline: '2026-11-27', short: 'הכנות לפסטיבל' }),
    project('demo-p-irrigation', 'מערכת השקיה חדשה', beni, '2026-11-10', [beni, eliya], { deadlineText: 'סוף דצמבר' }),
    project('demo-p-permits', 'אישורים לעמותה', eliya, '2026-11-15', [eliya]),
    project('demo-p-fence', 'גדר חדשה לחממה', roi, '2026-09-01', [roi, beni], { status: 'done', deadline: '2026-10-01', doneAt: iso('2026-09-28', '16:00'), updatedAt: iso('2026-09-28', '16:00') }),
    project('demo-p-roshhashana', 'סדנת ראש השנה', noa, '2026-08-20', [noa, dana], { status: 'done', deadline: '2026-09-10', doneAt: iso('2026-09-10', '18:00'), updatedAt: iso('2026-09-10', '18:00') }),
    project('demo-p-container', 'שיפוץ המכולה', beni, '2026-07-01', [beni, roi], { status: 'done', doneAt: iso('2026-08-14', '15:00'), updatedAt: iso('2026-08-14', '15:00') }),
    project('demo-p-petting', 'פינת ליטוף לילדים', dana, '2026-06-10', [dana, noa, eliya], { status: 'done', doneAt: iso('2026-07-20', '12:00'), updatedAt: iso('2026-07-20', '12:00') }),
  ]);
  put(seed, 'projects/demo-p-festival/steps', steps('demo-p-festival', beni, '2026-10-28', [
    { id: 'demo-ps-date', title: 'לקבוע תאריך ולפרסם', doneBy: beni, doneAt: '2026-11-02' },
    { id: 'demo-ps-vendors', title: 'להזמין בעלי דוכנים', doneBy: noa, doneAt: '2026-11-09' },
    { id: 'demo-ps-toilets', title: 'להזמין שירותים ניידים', doneBy: eliya, doneAt: '2026-11-12' },
    { id: 'demo-ps-police', title: 'לסגור אישור משטרה', assignee: beni, due: '2026-11-23', note: 'צריך תוכנית אבטחה ומספר משתתפים צפוי. הטופס אצל אליה.', updates: [
      { by: beni, at: iso('2026-11-18', '14:10'), text: 'שלחתי את הטופס, מחכים לתשובה' },
      { by: eliya, at: iso('2026-11-19', '08:20'), text: 'ביקשו גם אישור כיבוי אש' },
    ] },
    { id: 'demo-ps-music', title: 'לתאם מוזיקה חיה', assignee: noa, due: '2026-11-25' },
    { id: 'demo-ps-parking', title: 'לארגן חניה ושילוט', due: '2026-11-26' },
    { id: 'demo-ps-briefing', title: 'תדריך למתנדבים', due: '2026-11-27' },
  ]));
  put(seed, 'projects/demo-p-irrigation/steps', steps('demo-p-irrigation', beni, '2026-11-10', [
    { id: 'demo-ps-measure', title: 'למדוד את השטח ולשרטט', assignee: beni },
    { id: 'demo-ps-pipes', title: 'לבדוק את הצנרת הקיימת', doneBy: eliya, doneAt: '2026-11-14' },
    { id: 'demo-ps-quotes', title: 'לקבל שלוש הצעות מחיר' },
    { id: 'demo-ps-budget', title: 'לאשר תקציב עם אליה', assignee: eliya },
    { id: 'demo-ps-install', title: 'להזמין ולהתקין', assignee: eliya },
  ]));
  put(seed, 'projects/demo-p-permits/steps', steps('demo-p-permits', eliya, '2026-11-15', [
    { id: 'demo-ps-registrar', title: 'לחדש אישור ניהול תקין' },
    { id: 'demo-ps-section46', title: 'להגיש בקשה לסעיף 46' },
    { id: 'demo-ps-insurance', title: 'לחדש את ביטוח המתנדבים' },
    { id: 'demo-ps-report', title: 'להגיש דוח שנתי לרשם' },
  ]));
  const doneSteps = (pid: string, by: Actor, created: string, day: string, list: [string, string, Actor][]) =>
    put(seed, `projects/${pid}/steps`, steps(pid, by, created, list.map(([id, title, who]) => ({ id, title, doneBy: who, doneAt: day }))));
  doneSteps('demo-p-fence', roi, '2026-09-01', '2026-09-28', [['demo-ps-fence-1', 'לקנות עמודים ורשת', roi], ['demo-ps-fence-2', 'להציב את העמודים', beni], ['demo-ps-fence-3', 'למתוח את הרשת', roi]]);
  doneSteps('demo-p-roshhashana', noa, '2026-08-20', '2026-09-10', [['demo-ps-rh-1', 'לפרסם את הסדנה', noa], ['demo-ps-rh-2', 'לקנות דבש ותפוחים', dana], ['demo-ps-rh-3', 'לסדר את השולחנות', noa]]);
  doneSteps('demo-p-container', beni, '2026-07-01', '2026-08-14', [['demo-ps-co-1', 'לפנות את המכולה', roi], ['demo-ps-co-2', 'לצבוע מבפנים', beni], ['demo-ps-co-3', 'להתקין מדפים', roi], ['demo-ps-co-4', 'להעביר את הכלים', beni]]);
  doneSteps('demo-p-petting', dana, '2026-06-10', '2026-07-20', [['demo-ps-pe-1', 'לבנות מכלאה קטנה', dana], ['demo-ps-pe-2', 'להביא שתי עזים', noa], ['demo-ps-pe-3', 'שלט הסבר לילדים', eliya]]);
};
export default slice;
