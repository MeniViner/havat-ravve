// The demo's content: נתונים: דפדוף, אנשים, ייבוא, גיבויים (K7-K10).
import type { Backup, DataDoc, Person, Source, TrashItem } from '../source';
import { ago, DAY, dayKey, wait } from './base';

export const people: Person[] = [
  { uid: 'd-owner', email: 'owner@demo.invalid', displayName: 'מני בעלים', phone: '050-0000001', role: 'owner', status: 'active', customerNumber: 1, createdAt: ago(400 * DAY), updatedAt: ago(30 * DAY) },
  { uid: 'd-beni', email: 'beni@demo.invalid', displayName: 'בני גוטמן', phone: '050-0000002', role: 'owner', status: 'active', customerNumber: 2, createdAt: ago(390 * DAY), updatedAt: ago(10 * DAY) },
  { uid: 'd-matan', email: 'matan@demo.invalid', displayName: 'מתן לוי', phone: '050-0000003', role: 'manager', status: 'active', customerNumber: 3, createdAt: ago(200 * DAY), updatedAt: ago(4 * DAY) },
  { uid: 'd-orly', email: 'orly@demo.invalid', displayName: 'אורלי כהן', phone: '050-0000004', role: 'staff', status: 'active', customerNumber: 7, notes: 'מגיעה בימי שישי', createdAt: ago(120 * DAY), updatedAt: ago(2 * DAY) },
  { uid: 'd-yoav', email: 'yoav@demo.invalid', displayName: 'יואב פרץ', phone: '050-0000005', role: 'staff', status: 'active', customerNumber: 9, createdAt: ago(90 * DAY), updatedAt: ago(9 * DAY) },
  { uid: 'd-raz', email: 'raz@demo.invalid', displayName: 'רז גבינות העמק', phone: '050-0000006', role: 'vendor', status: 'active', customerNumber: 14, vendorId: 'v1', createdAt: ago(60 * DAY), updatedAt: ago(20 * DAY) },
  { uid: 'd-michal', email: 'michal@demo.invalid', displayName: 'מיכל אברהם', phone: '050-0000007', role: 'guest', status: 'active', customerNumber: 21, createdAt: ago(30 * DAY), updatedAt: ago(30 * DAY) },
  { uid: 'd-tamar', email: 'tamar@demo.invalid', displayName: 'תמר שלו', phone: '050-0000008', role: 'guest', status: 'blocked', customerNumber: 22, createdAt: ago(25 * DAY), updatedAt: ago(5 * DAY) },
  { uid: 'd-noga', email: 'noga@demo.invalid', displayName: 'נוגה ברק', phone: '050-0000009', role: 'guest', status: 'active', customerNumber: 23, createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY) },
];

const COLS = { activity: 168, users: 9, notifications: 18, push_jobs: 14, tasks: 9, tickets: 4, events: 2, 'events/*/vendors': 3, vendors: 3, places: 2, settings: 1, shopping: 6, calendar: 4, visits: 1, donations: 2 };
const backups: Backup[] = Array.from({ length: 12 }, (_, i) => {
  const docs = 246 - i * 3;
  return { date: dayKey(i), startedAt: ago(i * DAY + 180), finishedAt: ago(i * DAY + 175), docs, bytes: docs * 610, parts: 1, collections: COLS, by: 'cron' };
});
const trash: TrashItem[] = [
  { key: 'trash/d/1-aaaaaaaa.json', path: 'tasks/t-fence', collection: 'tasks', title: 'לתקן את הגדר בחלקה הצפונית', by: 'האינסטינקט של מני', who: 'מני בעלים', requestId: 'req_1', deletedAt: ago(35) },
  { key: 'trash/d/2-bbbbbbbb.json', path: 'shopping/s-hay', collection: 'shopping', title: 'חבילות חציר', by: 'האינסטינקט של בני', who: 'בני גוטמן', requestId: 'req_2', deletedAt: ago(5 * 60) },
  { key: 'trash/d/3-cccccccc.json', path: 'places/p-old', collection: 'places', title: 'מחסן ישן', by: 'קונסולה · מני', who: 'מני בעלים', requestId: 'req_3', deletedAt: ago(2 * DAY) },
];
const demoDocs = [
  { path: 'tasks/t-fence', title: 'לתקן את הגדר בחלקה הצפונית' }, { path: 'tasks/t-water', title: 'לבדוק את השוקת' },
  { path: 'tasks/t-feed', title: 'להזמין מזון לעיזים' }, { path: 'users/d-orly', title: 'אורלי כהן' }, { path: 'users/d-yoav', title: 'יואב פרץ' },
];
const restoredDocs = new Set<string>(); // put back in this demo session: "now" matches the backup again

// the data browser: a few made-up records per collection, editable in memory
const SYS = { api_log: 132, api_idempotency: 203, push_jobs: 14, email_outbox: 0 };
type DemoRec = { path: string; fields: Record<string, unknown>; updateTime: string; createTime: string };
const recs: DemoRec[] = [
  ...people.map((p) => ({ path: `users/${p.uid}`, fields: { displayName: p.displayName, email: p.email, phone: p.phone, role: p.role, status: p.status, customerNumber: p.customerNumber }, updateTime: p.updatedAt!, createTime: p.createdAt! })),
  { path: 'tasks/t-fence', fields: { title: 'לתקן את הגדר בחלקה הצפונית', done: false, urgent: true, place: 'החלקה הצפונית', assignee: { uid: 'd-yoav', name: 'יואב פרץ' }, createdAt: ago(9 * DAY), updatedAt: ago(35) }, updateTime: ago(35), createTime: ago(9 * DAY) },
  { path: 'tasks/t-water', fields: { title: 'לבדוק את השוקת', done: true, urgent: false, place: 'החלקה הצפונית', assignee: { uid: 'd-yoav', name: 'יואב פרץ' }, doneAt: ago(DAY), createdAt: ago(9 * DAY), updatedAt: ago(DAY) }, updateTime: ago(DAY), createTime: ago(9 * DAY) },
  { path: 'tasks/t-feed', fields: { title: 'להזמין מזון לעיזים', done: false, urgent: false, place: '', assignee: null, createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY) }, updateTime: ago(2 * DAY), createTime: ago(2 * DAY) },
  { path: 'places/p-north', fields: { name: 'החלקה הצפונית', lat: 31.52, lng: 34.6, createdAt: ago(200 * DAY) }, updateTime: ago(40 * DAY), createTime: ago(200 * DAY) },
  { path: 'places/p-pen', fields: { name: 'דיר העיזים', lat: 31.521, lng: 34.602, createdAt: ago(190 * DAY) }, updateTime: ago(60 * DAY), createTime: ago(190 * DAY) },
  { path: 'events/e-harvest', fields: { title: 'חג האסיף בחווה', date: dayKey(-12), status: 'published', price: 40, capacity: 300 }, updateTime: ago(3 * DAY), createTime: ago(30 * DAY) },
  { path: 'events/e-harvest/vendors/v1', fields: { name: 'רז גבינות העמק', status: 'approved', fee: 150 }, updateTime: ago(4 * DAY), createTime: ago(20 * DAY) },
  { path: 'events/e-harvest/vendors/v2', fields: { name: 'מאפיית הכפר', status: 'pending', fee: 150 }, updateTime: ago(2 * DAY), createTime: ago(6 * DAY) },
  { path: 'shopping/s-hay', fields: { text: 'חבילות חציר', bought: false, qty: 4, addedBy: { uid: 'd-beni', name: 'בני גוטמן' } }, updateTime: ago(5 * 60), createTime: ago(5 * 60) },
  { path: 'settings/site', fields: { title: 'חוות רווה', email: 'farm@demo.invalid', ticketsOpen: true }, updateTime: ago(20 * DAY), createTime: ago(300 * DAY) },
];
const groupOfPath = (p: string) => p.split('/').filter((_, i) => i % 2 === 0).join('/*/');
const titleOfRec = (f: Record<string, unknown>) => String(f.title || f.name || f.displayName || f.text || f.email || '');
const typeOfVal = (v: unknown) => (v === null ? 'null' : typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'double') : typeof v === 'string' ? 'string' : Array.isArray(v) ? 'array' : 'map');
const docOfRec = (r: DemoRec): DataDoc => {
  const g = groupOfPath(r.path);
  return {
    path: r.path, id: r.path.split('/').pop()!, group: g, title: titleOfRec(r.fields), fields: structuredClone(r.fields),
    types: Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, typeOfVal(v)])), createTime: r.createTime, updateTime: r.updateTime,
    subcollections: recs.some((x) => x.path.startsWith(r.path + '/')) ? [...new Set(recs.filter((x) => x.path.startsWith(r.path + '/')).map((x) => x.path.slice(r.path.length + 1).split('/')[0]))] : [],
    readOnly: ['users', 'api_log', 'api_failures', 'api_idempotency'].includes(g.split('/*/').pop()!),
  };
};

export const dataDemo: Pick<Source, 'people' | 'action' | 'backups' | 'runBackup' | 'downloadBackup' | 'backupDocs' | 'backupDoc' | 'restoreBackup' | 'trash' | 'restoreTrash' | 'dataCollections' | 'dataDocs' | 'dataDoc' | 'dataHistory' | 'editDoc' | 'deleteDoc' | 'exportCsv' | 'peopleAccess' | 'accessChanges' | 'imports' | 'saveImport' | 'undoImport'> = {
  people: () => wait(people),
  action: async (op, body) => {
    const p = people.find((x) => x.uid === body.uid);
    if (op === 'people.setRole' && p) p.role = body.role as Person['role'];
    if (op === 'people.setStatus' && p) p.status = body.status as Person['status'];
    if (op === 'people.setNotes' && p) p.notes = String(body.notes);
    if (op === 'people.delete' && p) people.splice(people.indexOf(p), 1);
    if (p) p.updatedAt = ago(0);
    return wait({ changed: true });
  },
  backups: () => wait({ items: backups, running: null }),
  runBackup: async () => {
    const b = { ...backups[0], startedAt: ago(0), finishedAt: ago(0), by: 'מני בעלים' };
    backups[0] = b;
    return wait({ done: true, date: b.date, docs: b.docs });
  },
  downloadBackup: async () => { await wait(null); throw new Error('demo'); },
  backupDocs: (_date, collection) => {
    const items = demoDocs.filter((d) => d.path.startsWith(collection + '/')).map((d) => ({ ...d, updateTime: ago(3 * DAY) }));
    return wait({ items, total: items.length });
  },
  backupDoc: (_date, path) => {
    const d = demoDocs.find((x) => x.path === path);
    const then = { title: d?.title || path, place: 'החלקה הצפונית', done: false, assignee: { uid: 'd-yoav', name: 'יואב פרץ' }, createdAt: ago(9 * DAY) };
    const now = restoredDocs.has(path) ? { ...then } : path === 'tasks/t-fence' ? null : { ...then, done: true, doneAt: ago(DAY) };
    return wait({ path, then, now, thenUpdated: ago(3 * DAY), nowUpdated: now ? ago(DAY) : null });
  },
  restoreBackup: (_date, paths) => { paths.forEach((p) => restoredDocs.add(p)); return wait({ restored: paths.length, missing: 0 }); },
  trash: () => wait(trash),
  restoreTrash: (keys) => {
    const restored = trash.filter((t) => keys.includes(t.key)).map((t) => t.path);
    for (const k of keys) { const i = trash.findIndex((t) => t.key === k); if (i >= 0) trash.splice(i, 1); }
    return wait({ restored, exists: [], gone: [] });
  },
  dataCollections: () => {
    const counts: Record<string, number> = { ...COLS, ...SYS, users: people.length };
    for (const r of recs) counts[groupOfPath(r.path)] = Math.max(counts[groupOfPath(r.path)] || 0, recs.filter((x) => groupOfPath(x.path) === groupOfPath(r.path)).length);
    const items = Object.entries(counts).map(([group, count]) => ({ group, count: group.includes('/*/') ? null : count, backupCount: count, readOnly: ['users', 'api_log', 'api_failures', 'api_idempotency'].includes(group) }));
    return wait({ items: items.sort((a, b) => (b.count ?? b.backupCount ?? 0) - (a.count ?? a.backupCount ?? 0)), backupDate: dayKey(0) });
  },
  dataDocs: (group, _after, parent) => wait({ items: recs.filter((r) => groupOfPath(r.path) === group && (!parent || r.path.startsWith(parent + '/'))).map((r) => ({ path: r.path, id: r.path.split('/').pop()!, title: titleOfRec(r.fields), updateTime: r.updateTime })), next: null }),
  dataDoc: async (path) => { const r = recs.find((x) => x.path === path); if (!r) throw new Error('not found'); return wait(docOfRec(r)); },
  dataHistory: (path, days) => {
    const r = recs.find((x) => x.path === path);
    const now = r ? { updateTime: r.updateTime, fields: structuredClone(r.fields) } : null;
    const older: Record<string, unknown> | null = r ? { ...r.fields, ...(typeof r.fields.done === 'boolean' ? { done: !r.fields.done } : {}), ...(typeof r.fields.status === 'string' ? { status: 'draft' } : {}) } : null;
    const versions = r ? [
      { updateTime: r.updateTime, from: dayKey(1), to: dayKey(0), fields: structuredClone(r.fields), changed: Object.keys(r.fields).filter((k) => JSON.stringify(r.fields[k]) !== JSON.stringify(older![k])) },
      { updateTime: ago(8 * DAY), from: dayKey(Math.min(days, 7) - 1), to: dayKey(2), fields: older, changed: [] },
    ] : [];
    const activity = path.startsWith('tasks/') ? [
      { at: ago(35), text: 'סומנה דחוף: ' + titleOfRec(r?.fields || {}), by: 'מני בעלים', action: 'urgent', via: 'האינסטינקט של מני' },
      { at: ago(9 * DAY), text: 'נוצרה: ' + titleOfRec(r?.fields || {}), by: 'בני גוטמן', action: 'created', via: '' },
    ] : [];
    return wait({ path, now, versions, activity, days: Math.min(days, 12) });
  },
  editDoc: (path, set) => { const r = recs.find((x) => x.path === path)!; Object.assign(r.fields, set); r.updateTime = ago(0); return wait({ path, updateTime: r.updateTime }); },
  deleteDoc: (path) => { const i = recs.findIndex((x) => x.path === path); const r = recs[i]; recs.splice(i, 1); trash.unshift({ key: `trash/d/${Date.now()}-dddddddd.json`, path, collection: groupOfPath(path), title: titleOfRec(r.fields), by: 'קונסולה · מני', who: 'מני בעלים', requestId: 'req_demo', deletedAt: ago(0) }); return wait({ path, deleted: true }); },
  exportCsv: async () => { await wait(null); throw new Error('demo'); },
  peopleAccess: () => wait(null),
  accessChanges: () => wait([]),
  imports: () => wait([]),
  saveImport: (kind, ids) => wait({ id: 'imp-demo', kind, at: ago(0), by: 'מני בעלים', count: ids.length, undoUntil: ago(-DAY), undone: false }),
  undoImport: () => wait({ removed: 0, kept: 0 }),
};
