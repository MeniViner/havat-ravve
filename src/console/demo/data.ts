// The demo's content: נתונים: דפדוף, אנשים, ייבוא, גיבויים (K7-K10).
import type { AccessChange, Backup, DataDoc, ImportBatch, Person, PersonAccess, Source, TrashItem } from '../source';
import { ConsoleError } from '../source';
import { ago, at, DAY, dayKey, DEMO_NOW, wait } from './base';

/* ───────── people (K8) ───────── */
const person = (uid: string, email: string, displayName: string, phone: string, role: Person['role'], customerNumber: number, created: string, updated: string, more: Partial<Person> = {}): Person =>
  ({ uid, email: `${email}@demo.invalid`, displayName, phone, role, status: 'active', customerNumber, createdAt: created, updatedAt: updated, ...more });
export const people: Person[] = [
  person('d-owner', 'owner', 'מני בעלים', '052-000-0001', 'owner', 1, ago(400 * DAY), ago(30 * DAY)),
  person('d-beni', 'beni', 'בני גוטמן', '052-000-0002', 'owner', 2, ago(390 * DAY), ago(10 * DAY)),
  person('d-matan', 'matan', 'מתן לוי', '052-000-0014', 'manager', 14, at('2026-11-03', '09:20'), at('2026-11-03', '12:05')),
  person('d-orly', 'orly', 'אורלי כהן', '052-000-0007', 'staff', 7, ago(120 * DAY), ago(2 * DAY), { notes: 'מגיעה בימי שישי' }),
  person('d-yoav', 'yoav', 'יואב פרץ', '052-000-0009', 'staff', 9, ago(90 * DAY), ago(9 * DAY)),
  person('d-raz', 'raz', 'רז גבינות העמק', '052-000-0016', 'vendor', 16, ago(60 * DAY), ago(20 * DAY), { vendorId: 'v-raz' }),
  person('d-michal', 'michal', 'מיכל אברהם', '052-000-0021', 'guest', 21, ago(30 * DAY), ago(30 * DAY)),
  person('d-tamar', 'tamar', 'תמר שלו', '052-000-0022', 'guest', 22, ago(25 * DAY), ago(5 * DAY), { status: 'blocked' }),
  person('d-noga', 'noga', 'נגה ברק', '052-000-0023', 'guest', 23, ago(3 * DAY), ago(3 * DAY)),
];
const access: Record<string, PersonAccess> = {
  'd-beni': { at: at('2026-11-23', '18:12'), device: 'phone' }, 'd-owner': { at: at('2026-11-23', '18:34'), device: 'computer' }, 'd-matan': { at: at('2026-11-22', '21:40'), device: 'phone' },
  'd-orly': { at: at('2026-11-23', '07:05'), device: 'phone' }, 'd-yoav': { at: at('2026-11-23', '08:30'), device: 'phone' }, 'd-raz': { at: at('2026-11-20', '15:10'), device: 'computer' },
  'd-michal': { at: at('2026-11-21', '20:44'), device: null }, 'd-noga': { at: at('2026-11-22', '11:20'), device: 'phone' }, 'd-tamar': { at: at('2026-11-14', '22:03'), device: 'phone' },
};
const ROLE_HE: Record<string, string> = { owner: 'בעלים', manager: 'מנהל/ת', staff: 'מתנדב/ת', guest: 'אורח/ת', vendor: 'בעל דוכן' };
const changes: Record<string, AccessChange[]> = {
  'd-matan': [{ at: at('2026-11-03', '12:05'), text: 'מתן לוי: מתנדב/ת ← מנהל/ת', by: 'בני גוטמן' }, { at: at('2026-11-03', '09:20'), text: 'נכנס בפעם הראשונה כמתנדב', by: '' }],
  'd-beni': [{ at: ago(389 * DAY), text: 'בני גוטמן: אורח/ת ← בעלים', by: 'מני בעלים' }, { at: ago(390 * DAY), text: 'בני גוטמן נרשם/ה', by: 'בני גוטמן' }],
  'd-owner': [{ at: ago(400 * DAY), text: 'מני בעלים נרשם/ה', by: 'מני בעלים' }],
  'd-orly': [{ at: ago(119 * DAY), text: 'אורלי כהן: אורח/ת ← מתנדב/ת', by: 'בני גוטמן' }, { at: ago(120 * DAY), text: 'אורלי כהן נרשם/ה', by: 'אורלי כהן' }],
  'd-yoav': [{ at: ago(88 * DAY), text: 'יואב פרץ: אורח/ת ← מתנדב/ת', by: 'מתן לוי' }, { at: ago(90 * DAY), text: 'יואב פרץ נרשם/ה', by: 'יואב פרץ' }],
  'd-raz': [{ at: ago(60 * DAY), text: 'רז גבינות העמק נרשם/ה', by: 'רז גבינות העמק' }],
  'd-michal': [{ at: ago(30 * DAY), text: 'מיכל אברהם נרשם/ה', by: 'מיכל אברהם' }],
  'd-tamar': [{ at: at('2026-11-18', '10:30'), text: 'תמר שלו נחסם/ה', by: 'בני גוטמן' }, { at: ago(25 * DAY), text: 'תמר שלו נרשם/ה', by: 'תמר שלו' }],
  'd-noga': [{ at: ago(3 * DAY), text: 'נגה ברק נרשם/ה', by: 'נגה ברק' }],
};

/* ───────── the database (K7) ───────── */
type DemoRec = { path: string; fields: Record<string, unknown>; updateTime: string; createTime: string };
const who = (uid: string, name: string) => ({ uid, name });
const BENI = who('d-beni', 'בני גוטמן'), YOAV = who('d-yoav', 'יואב פרץ'), MATAN = who('d-matan', 'מתן לוי'), MENI = who('d-owner', 'מני בעלים');
const rec = (path: string, updated: string, created: string, fields: Record<string, unknown>): DemoRec => ({ path, fields: { ...fields, createdAt: created, updatedAt: updated }, updateTime: updated, createTime: created });
const task = (id: string, title: string, updated: string, created: string, assignee: unknown, more: Record<string, unknown> = {}) =>
  rec('tasks/' + id, updated, created, { title, assignee, done: false, urgent: false, dueDate: '', note: '', location: null, managersOnly: false, createdBy: BENI, ...more });
const NORTH = { lat: 31.2425, lng: 34.7301, placeId: 'p-north', placeName: 'החלקה הצפונית' };
const recs: DemoRec[] = [
  task('t-8f2c1a', 'לתקן את הגדר בחלקה הצפונית', ago(35), at('2026-11-20', '09:14'), YOAV, { urgent: true, dueDate: '2026-12-01', location: NORTH }),
  task('t-goats', 'להאכיל את העזים', at('2026-11-23', '07:10'), at('2026-11-23', '00:05'), null, { done: true, doneAt: at('2026-11-23', '07:10'), doneBy: who('d-orly', 'אורלי כהן'), templateId: 'tpl-goats', dateKey: '2026-11-23' }),
  task('t-flag', 'להחליף את הדגל', at('2026-11-22', '18:20'), at('2026-11-21', '10:00'), null, { urgent: true }),
  task('t-prune', 'לגזום ענפים נמוכים', at('2026-11-22', '16:02'), at('2026-11-19', '10:00'), null),
  task('t-compost', 'להעביר שקי קומפוסט', at('2026-11-21', '17:30'), at('2026-11-18', '10:00'), YOAV),
  task('t-tools', 'לסדר את ארגז הכלים', at('2026-11-21', '15:10'), at('2026-11-17', '10:00'), YOAV, { done: true, doneAt: at('2026-11-21', '15:10'), doneBy: YOAV }),
  task('t-pots', 'להשקות את שורת העציצים', at('2026-11-21', '08:40'), at('2026-11-20', '10:00'), who('x-dana', 'דנה רום'), { done: true, doneAt: at('2026-11-21', '08:40'), doneBy: who('x-dana', 'דנה רום') }),
  task('t-path', 'לפנות את השביל לחממה', at('2026-11-20', '12:00'), at('2026-11-16', '10:00'), null),
  task('t-signs', 'להדפיס שלטי כניסה ודוכן', at('2026-11-19', '12:00'), at('2026-11-15', '10:00'), null),
  ...[['s-hay2', 'חבילות חציר', '4 חבילות', false, true], ['s-screws', 'ברגים לעץ', '2 קופסאות', false, false], ['s-cups', 'כוסות לאירוח', '100', false, false], ['s-paint', 'צבע לשער', '1 פח', true, false], ['s-gloves', 'כפפות עבודה', '6 זוגות', true, false], ['s-water', 'מים מינרליים', '3 שישיות', false, false]]
    .map(([id, title, qty, bought, urgent], i) => rec('shopping/' + id, ago(i * 300 + 90), ago(i * 300 + 2 * DAY), { title, qty, category: i % 2 ? 'building' : 'super', bought, urgent, boughtBy: bought ? BENI : null, boughtAt: bought ? ago(i * 300 + 90) : null, note: '', createdBy: i % 2 ? MATAN : BENI })),
  ...[['tk-1', 'מיכל אברהם', 'pending', 40], ['tk-2', 'מיכל אברהם', 'pending', 40], ['tk-3', 'נגה ברק', 'paid', 40], ['tk-4', 'תמר שלו', 'cancelled', 40]]
    .map(([id, ownerName, paymentStatus, price], i) => rec('tickets/' + id, ago(i * 400 + 200), ago(i * 400 + 3 * DAY), { title: ownerName, ownerName, eventTitle: 'חג האסיף בחווה', price, paymentStatus, status: paymentStatus === 'cancelled' ? 'cancelled' : 'valid', index: 1, total: 1 })),
  ...[['c-1', 'וטרינר לעזים', '2026-11-25', '10:00'], ['c-2', 'משלוח קש', '2026-11-26', '08:00'], ['c-3', 'סיור בית ספר', '2026-11-30', '09:30'], ['c-4', 'ישיבת צוות', '2026-12-01', '19:00']]
    .map(([id, title, date, time], i) => rec('calendar/' + id, ago(i * DAY + 500), ago(i * DAY + 9 * DAY), { title, date, time, note: '', createdBy: i % 2 ? MATAN : BENI })),
  ...[['v-raz', 'רז גבינות העמק', 'גבינות', '052-000-0016'], ['v-bakery', 'מאפיית הכפר', 'לחמים', '052-000-0031'], ['v-honey', 'דבש הגבעה', 'דבש', '052-000-0032']]
    .map(([id, name, product, phone], i) => rec('vendors/' + id, ago(i * DAY + 800), ago(60 * DAY), { name, product, phone, external: true, notes: '' })),
  rec('events/e-harvest', ago(3 * DAY), ago(30 * DAY), { title: 'חג האסיף בחווה', start: at('2026-12-05', '10:00'), end: at('2026-12-05', '17:00'), published: true, open: true, price: 40, capacity: 300, location: 'חוות רווה' }),
  rec('events/e-hanuka', ago(5 * DAY), ago(12 * DAY), { title: 'נר ראשון בחווה', start: at('2026-12-13', '17:00'), end: at('2026-12-13', '20:00'), published: false, open: false, price: 25, capacity: 120, location: 'חוות רווה' }),
  rec('events/e-harvest/vendors/v-raz', ago(4 * DAY), ago(20 * DAY), { name: 'רז גבינות העמק', status: 'confirmed', fee: 150 }),
  rec('events/e-harvest/vendors/v-bakery', ago(2 * DAY), ago(6 * DAY), { name: 'מאפיית הכפר', status: 'pending', fee: 150 }),
  rec('events/e-harvest/vendors/v-honey', ago(3 * DAY), ago(6 * DAY), { name: 'דבש הגבעה', status: 'declined', fee: 150 }),
  rec('places/p-north', ago(40 * DAY), ago(200 * DAY), { name: 'החלקה הצפונית', lat: 31.2425, lng: 34.7301, createdBy: BENI }),
  rec('places/p-gate', ago(60 * DAY), ago(190 * DAY), { name: 'ליד הכניסה', lat: 31.2412, lng: 34.7301, createdBy: BENI }),
  rec('donations/d-1', ago(2 * DAY), ago(3 * DAY), { name: 'מיכל אברהם', amount: 180, paymentStatus: 'paid', label: 'עשר פעמים חי', note: '', receiptWanted: true, receiptSent: true }),
  rec('donations/d-2', ago(DAY), ago(DAY), { name: 'נגה ברק', amount: 360, paymentStatus: 'claimed', label: '', note: 'לעילוי נשמת סבתא', receiptWanted: true, receiptSent: false }),
  rec('visits/vi-1', ago(7 * 60), ago(8 * 60), { name: 'גן הדס', phone: '052-000-0041', date: '2026-12-02', people: 24, status: 'new', note: 'סיור לגן', managerNote: '' }),
  rec('settings/site', ago(20 * DAY), ago(300 * DAY), { title: 'חוות רווה', email: 'farm@demo.invalid', ticketsOpen: true }),
  ...people.map((p) => ({ path: `users/${p.uid}`, fields: { displayName: p.displayName, email: p.email, phone: p.phone, role: p.role, status: p.status, customerNumber: p.customerNumber }, updateTime: p.updatedAt!, createTime: p.createdAt! })),
  ...Array.from({ length: 168 }, (_, i) => rec(`activity/a-${String(168 - i).padStart(4, '0')}`, ago(i * 47 + 12), ago(i * 47 + 12), { text: ['לתקן את הגדר בחלקה הצפונית', 'חבילות חציר', 'להאכיל את העזים', 'חג האסיף בחווה', 'להחליף את הדגל'][i % 5], action: ['edited', 'created', 'done', 'edited', 'urgent'][i % 5], by: [MENI, BENI, YOAV, MATAN, BENI][i % 5] })),
  ...Array.from({ length: 18 }, (_, i) => rec(`notifications/n-${String(18 - i).padStart(3, '0')}`, ago(i * 340 + 40), ago(i * 340 + 40), { title: ['בקשת ביקור חדשה', 'תרומה ממתינה לאישור', 'הזמנת כרטיסים חדשה'][i % 3], by: [who('x-1', 'גן הדס'), who('d-noga', 'נגה ברק'), who('d-michal', 'מיכל אברהם')][i % 3], read: i > 3 })),
  ...Array.from({ length: 132 }, (_, i) => rec(`api_log/req_${String(9000 - i)}`, ago(i * 11 + 3), ago(i * 11 + 3), { op: ['tasks.list', 'tasks.create', 'shopping.list', 'events.list'][i % 4], kind: i % 4 === 1 ? 'write' : 'read', ok: i % 29 !== 7, status: i % 29 === 7 ? 403 : 200, keyLabel: i % 3 ? 'האינסטינקט של מני' : 'האינסטינקט של בני' })),
  ...Array.from({ length: 203 }, (_, i) => rec(`api_idempotency/k-${(0x8f2c1a0 + i * 977).toString(16)}`, ago(i * 13 + 9), ago(i * 13 + 9), { operation: ['tasks.create', 'shopping.add'][i % 2], actor: 'user:d-owner' })),
  ...Array.from({ length: 14 }, (_, i) => rec(`push_jobs/pj-${14 - i}`, ago(i * 190 + 30), ago(i * 190 + 30), { title: 'משימה חדשה בשבילך', status: 'done', to: 1 + (i % 4) })),
];
const READ_ONLY = new Set(['users', 'activity', 'notifications', 'api_log', 'api_failures', 'api_idempotency']);
const groupOfPath = (p: string) => p.split('/').filter((_, i) => i % 2 === 0).join('/*/');
const readOnly = (group: string) => READ_ONLY.has(group.split('/*/').pop()!);
const titleOfRec = (f: Record<string, unknown>) => String(f.title || f.name || f.displayName || f.text || f.email || '');
const typeOfVal = (v: unknown) => (v === null ? 'null' : typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'double') : typeof v === 'string' ? 'string' : Array.isArray(v) ? 'array' : 'map');
/** What the table's columns need: simple values, and a person's or a place's name. */
const simple = (f: Record<string, unknown>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v && typeof v === 'object' ? (v as { name?: string; placeName?: string }).name || (v as { placeName?: string }).placeName || null : v]));
const docOfRec = (r: DemoRec): DataDoc => {
  const g = groupOfPath(r.path);
  return {
    path: r.path, id: r.path.split('/').pop()!, group: g, title: titleOfRec(r.fields), fields: structuredClone(r.fields),
    types: Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, typeOfVal(v)])), createTime: r.createTime, updateTime: r.updateTime,
    subcollections: [...new Set(recs.filter((x) => x.path.startsWith(r.path + '/')).map((x) => x.path.slice(r.path.length + 1).split('/')[0]))],
    readOnly: readOnly(g),
  };
};
const PAGE = 60;

/* ───────── backups (K10) ───────── */
const COLS = { activity: 168, users: 9, notifications: 18, push_jobs: 14, tasks: 9, tickets: 4, events: 2, 'events/*/vendors': 3, vendors: 3, places: 2, settings: 1, shopping: 6, calendar: 4, visits: 1, donations: 2 };
const backups: Backup[] = Array.from({ length: 10 }, (_, i) => {
  const docs = 246 - i * 3, day = dayKey(i);
  // 20.11 finished late in the morning
  return { date: day, startedAt: at(day, '03:00'), finishedAt: at(day, i === 3 ? '09:40' : '03:00'), docs, bytes: docs * 610, parts: 1, collections: { ...COLS, activity: 168 - i * 3 }, by: 'cron' };
});
type Binned = TrashItem & { rec: DemoRec };
const binned = (key: string, r: DemoRec, by: string, whoName: string, requestId: string, deletedAt: string): Binned => ({ key, path: r.path, collection: groupOfPath(r.path), title: titleOfRec(r.fields), by, who: whoName, requestId, deletedAt, rec: r });
const trash: Binned[] = [
  binned('trash/d/1-aaaaaaaa.json', task('t-fence', 'לתקן את הגדר בחלקה הצפונית', ago(DAY), ago(9 * DAY), YOAV), 'האינסטינקט של מני', 'מני בעלים', 'req_1', ago(35)),
  binned('trash/d/2-bbbbbbbb.json', rec('shopping/s-hay', ago(DAY), ago(4 * DAY), { title: 'חבילות חציר', qty: '4', category: 'super', bought: false, urgent: false, createdBy: BENI }), 'האינסטינקט של בני', 'בני גוטמן', 'req_2', ago(5 * 60)),
  binned('trash/d/3-cccccccc.json', rec('places/p-old', ago(90 * DAY), ago(300 * DAY), { name: 'מחסן ישן', lat: 31.2406, lng: 34.7313, createdBy: BENI }), 'קונסולה · מני', 'מני בעלים', 'req_3', ago(2 * DAY)),
];
const restoredDocs = new Set<string>(); // put back in this demo session: "now" matches the backup again
/** The records a backup holds: what is there now, and what was deleted since. */
const inBackup = (collection: string) => [...recs, ...trash.map((t) => t.rec)].filter((r) => groupOfPath(r.path) === collection);
const beforeEdit = new Map<string, Record<string, unknown>>(); // what a record was before it was edited in this demo session
/** As it was then: some records changed since. */
const asThen = (r: DemoRec): Record<string, unknown> => {
  const f = structuredClone(beforeEdit.get(r.path) || r.fields);
  if (restoredDocs.has(r.path)) return f;
  if (f.done === true) { f.done = false; f.doneAt = null; f.doneBy = null; }
  else if (f.urgent === true) f.urgent = false;
  else if (f.bought === true) { f.bought = false; f.boughtAt = null; f.boughtBy = null; }
  else if (f.status === 'confirmed') f.status = 'pending';
  return f;
};

/* ───────── imports (K9) ───────── */
export const importSample = [
  'משימה\tתאריך יעד\tאיפה\tדחוף',
  'לתקן את הגדר בצפון\t1.12.2026\tהחלקה הצפונית\tכן',
  'להאכיל את העזים\tכל יום\tפינת החי\t',
  'לצבוע את שער הכניסה\t5.12.2026\tליד הכניסה\t',
  'לנקות את מחסן הכלים\t28.11.2026\tמכולה ומחסן\t',
  'לסמן חניות לפסטיבל\t27.11.2026\t\tכן',
  '\t30.11.2026\tחממה\t',
  'להזמין שירותים ניידים\t25.11.2026\t\t',
  'לבדוק את מערכת ההשקיה\t2.12.2026\tשורת העציצים\t',
  'לתלות שלטי הכוונה\t26.11.2026\tליד הכניסה\t',
  'להכין שקי אשפה\t27.11.2026\t\t',
  'לבדוק תאורה בשביל\t26.11.2026\tהחלקה הצפונית\t',
  'לפרוס מחצלות\t27.11.2026\t\t',
].join('\n');
const imports: ImportBatch[] = [
  { id: 'imp-2', kind: 'shopping', at: ago(5 * 60), by: 'בני גוטמן', count: 14, undoUntil: ago(-19 * 60), undone: false },
  { id: 'imp-1', kind: 'tasks', at: ago(4 * DAY), by: 'מני בעלים', count: 22, undoUntil: ago(3 * DAY), undone: false },
];
let seq = 0;
/** "now" in the demo, a moment later each time, so a second change is newer than the first. */
const tick = () => new Date(DEMO_NOW + ++seq).toISOString();

export const dataDemo: Pick<Source, 'people' | 'action' | 'backups' | 'runBackup' | 'downloadBackup' | 'backupDocs' | 'backupDoc' | 'restoreBackup' | 'trash' | 'restoreTrash' | 'dataCollections' | 'dataDocs' | 'dataDoc' | 'dataHistory' | 'editDoc' | 'deleteDoc' | 'exportCsv' | 'peopleAccess' | 'accessChanges' | 'imports' | 'saveImport' | 'undoImport'> = {
  people: () => wait(people),
  action: async (op, body) => {
    if (op === 'places.add') {
      const id = 'p-new-' + ++seq;
      recs.push(rec('places/' + id, tick(), ago(0), { name: body.name, lat: body.lat, lng: body.lng, createdBy: MENI }));
      return wait({ placeId: id });
    }
    const p = people.find((x) => x.uid === body.uid);
    const log = (text: string) => { (changes[p!.uid] ||= []).unshift({ at: ago(0), text, by: 'מני בעלים' }); };
    if (op === 'people.setRole' && p) { log(`${p.displayName}: ${ROLE_HE[p.role]} ← ${ROLE_HE[body.role as string]}`); p.role = body.role as Person['role']; }
    if (op === 'people.setStatus' && p) { log(`${p.displayName} ${body.status === 'blocked' ? 'נחסם/ה' : 'שוחרר/ה'}`); p.status = body.status as Person['status']; }
    if (op === 'people.setNotes' && p) p.notes = String(body.notes);
    if (op === 'people.delete' && p) people.splice(people.indexOf(p), 1);
    if (p) p.updatedAt = tick();
    return wait({ changed: true });
  },
  peopleAccess: () => wait(access),
  accessChanges: (uid) => wait(changes[uid] || []),

  backups: () => wait({ items: backups, running: null }),
  runBackup: async () => {
    const b = { ...backups[0], startedAt: ago(0), finishedAt: ago(0), by: 'מני בעלים' };
    backups[0] = b;
    return wait({ done: true, date: b.date, docs: b.docs });
  },
  downloadBackup: async () => { await wait(null); throw new Error('demo'); },
  backupDocs: (_date, collection) => {
    const items = inBackup(collection).map((r) => ({ path: r.path, title: titleOfRec(r.fields), updateTime: r.updateTime }));
    return wait({ items, total: items.length });
  },
  backupDoc: (_date, path) => {
    const live = recs.find((x) => x.path === path), gone = trash.find((t) => t.path === path)?.rec;
    const r = live || gone!;
    return wait({ path, then: gone && !live ? structuredClone(gone.fields) : asThen(r), now: live ? structuredClone(live.fields) : null, thenUpdated: r.createTime, nowUpdated: live ? live.updateTime : null });
  },
  restoreBackup: (date, paths) => {
    for (const p of paths) {
      const live = recs.find((x) => x.path === p), t = trash.findIndex((x) => x.path === p);
      if (live) { live.fields = date >= dayKey(1) ? structuredClone(beforeEdit.get(p) || live.fields) : asThen(live); live.updateTime = tick(); } else if (t >= 0) recs.push(trash.splice(t, 1)[0].rec);
      restoredDocs.add(p); beforeEdit.delete(p);
    }
    return wait({ restored: paths.length, missing: 0 });
  },
  trash: () => wait(trash.map(({ rec: _rec, ...t }) => t)),
  restoreTrash: (keys) => {
    const out = { restored: [] as string[], exists: [] as string[], gone: [] as string[] };
    for (const k of keys) {
      const i = trash.findIndex((t) => t.key === k);
      if (i < 0) { out.gone.push(k); continue; }
      if (recs.some((r) => r.path === trash[i].path)) { out.exists.push(trash[i].path); continue; }
      const [t] = trash.splice(i, 1);
      recs.push(t.rec);
      out.restored.push(t.path);
    }
    return wait(out);
  },

  dataCollections: () => {
    const counts: Record<string, number> = { email_outbox: 0, account_deletions: 0 };
    for (const r of recs) if (r.path.split('/').length === 2) counts[r.path.split('/')[0]] = (counts[r.path.split('/')[0]] || 0) + 1;
    return wait({ items: Object.entries(counts).map(([group, count]) => ({ group, count, backupCount: count, readOnly: readOnly(group) })).sort((a, b) => b.count - a.count), backupDate: dayKey(0) });
  },
  dataDocs: (group, after, parent) => {
    const all = recs.filter((r) => groupOfPath(r.path) === group && (!parent || r.path.startsWith(parent + '/')));
    const from = after ? all.findIndex((r) => r.path === after) + 1 : 0;
    const part = all.slice(from, from + PAGE);
    return wait({ items: part.map((r) => ({ path: r.path, id: r.path.split('/').pop()!, title: titleOfRec(r.fields), updateTime: r.updateTime, fields: simple(r.fields) })), next: from + PAGE < all.length ? part[part.length - 1].path : null });
  },
  dataDoc: async (path) => { const r = recs.find((x) => x.path === path); await wait(null); if (!r) throw new ConsoleError('NOT_FOUND', 'not found'); return docOfRec(r); },
  dataHistory: (path, days) => {
    const r = recs.find((x) => x.path === path);
    const now = r ? { updateTime: r.updateTime, fields: structuredClone(r.fields) } : null;
    const older = r ? asThen(r) : null;
    const last = r ? structuredClone(beforeEdit.get(path) || r.fields) : {};
    const versions = r && days ? [
      { updateTime: beforeEdit.has(path) ? ago(DAY) : r.updateTime, from: dayKey(1), to: dayKey(0), fields: last, changed: Object.keys(last).filter((k) => JSON.stringify(last[k]) !== JSON.stringify(older![k])) },
      { updateTime: ago(8 * DAY), from: dayKey(Math.min(days, 10) - 1), to: dayKey(2), fields: older, changed: [] },
    ] : [];
    const title = titleOfRec(r?.fields || {});
    const line = (when: string, action: string, by: string, via = '', text = title) => ({ at: when, text, by, action, via });
    const activity = path === 'tasks/t-8f2c1a' ? [
      line(ago(35), 'edited', 'מני בעלים', 'האינסטינקט של מני', `${title} את התאריך`), line(at('2026-11-22', '18:20'), 'urgent', 'בני גוטמן', '', 'סומנה דחוף: ' + title), line(at('2026-11-20', '09:14'), 'created', 'בני גוטמן'),
    ] : r && /^(tasks|shopping|events|places)\//.test(path) ? [
      ...(r.fields.done ? [line(r.updateTime, 'done', (r.fields.doneBy as { name?: string })?.name || 'בני גוטמן')] : r.fields.bought ? [line(r.updateTime, 'bought', 'בני גוטמן')] : r.updateTime !== r.createTime ? [line(r.updateTime, 'edited', 'מתן לוי')] : []),
      line(r.createTime, 'created', (r.fields.createdBy as { name?: string })?.name || 'בני גוטמן'),
    ] : [];
    return wait({ path, now, versions, activity, days: Math.min(days, 10) });
  },
  editDoc: (path, set) => { const r = recs.find((x) => x.path === path)!; if (!beforeEdit.has(path)) beforeEdit.set(path, structuredClone(r.fields)); restoredDocs.delete(path); Object.assign(r.fields, set); r.updateTime = tick(); return wait({ path, updateTime: r.updateTime }); },
  deleteDoc: (path) => {
    const [r] = recs.splice(recs.findIndex((x) => x.path === path), 1);
    trash.unshift(binned(`trash/d/${DEMO_NOW + ++seq}-dddddddd.json`, r, 'קונסולה · מני', 'מני בעלים', 'req_demo', ago(0)));
    return wait({ path, deleted: true });
  },
  exportCsv: async () => { await wait(null); throw new Error('demo'); },

  imports: () => wait(imports),
  saveImport: (kind, ids) => {
    const b: ImportBatch = { id: 'imp-demo-' + ++seq, kind, at: ago(0), by: 'מני בעלים', count: ids.length, undoUntil: at('2026-11-24', '18:36'), undone: false };
    imports.unshift(b);
    return wait(b);
  },
  undoImport: (id) => { const b = imports.find((x) => x.id === id)!; b.undone = true; return wait({ removed: b.count, kept: 0, left: 0 }); },
};
