// Demo seed slice for the system area (profile, search, suspended). Same rows in every scenario.
import { A, U } from '../data';
import { put, patch, type Slice } from './types';

const task = (id: string, title: string, o: Record<string, unknown>) => ({
  id, title, note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: A.beni,
  createdAt: '2026-11-18T09:00:00.000Z', done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, updatedAt: '2026-11-18T09:00:00.000Z', ...o,
});

const slice: Slice = (seed) => {
  // L6: "מתנדב · מאוקטובר 2026"
  patch(seed, 'users', U.yoav, { createdAt: '2026-10-12T09:00:00.000Z', acceptedTermsAt: '2026-10-12T09:00:00.000Z', photoSource: 'custom' });
  // C13: Beni's picture comes from Google (none copied in demo, so initials show); A1: Yoav chose his own picture
  patch(seed, 'users', U.beni, { photoSource: 'google' });
  // Q18 "3 מתוך 5 פעילות": Beni keeps team messages, his tasks and urgent; no shopping trips or event reminders
  const beni = (seed.collections.users || []).find((u) => u.uid === U.beni);
  patch(seed, 'users', U.beni, { push: { ...(beni?.push as object || { enabled: true }), kinds: ['broadcast', 'task', 'urgent'] } });
  // X2: "מנהל השעה את הגישה שלך ... ב־18.11"
  patch(seed, 'users', U.yossi, { log: [{ at: '2026-11-18T09:15:00.000Z', by: A.beni, text: 'מצב: נחסם' }], updatedAt: '2026-11-18T09:15:00.000Z' });
  // C2 "כהן": one task on the owner today (managers only, so volunteers never see it) and one done by Noa on 12.11
  put(seed, 'tasks', [
    task('demo-t-call-ester', 'להתקשר לאסתר כהן על הביקור', { managersOnly: true, assignee: A.beni, dueDate: '2026-11-19', createdBy: A.noa, takenAt: '2026-11-19T07:00:00.000Z' }),
    task('demo-t-charger', 'להחזיר לדוד כהן את המטען', { createdBy: A.noa, createdAt: '2026-11-11T09:00:00.000Z', done: true, doneBy: A.noa, doneAt: '2026-11-12T10:20:00.000Z', assignee: A.noa }),
  ]);
};
export default slice;
