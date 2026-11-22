// /admin?demo: the console over made-up people, keys and numbers, kept in memory only. No Firestore, no Worker.
import type { KeyView, LogEntry, Overview, Person, Source } from './source';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const DAY = 24 * 60;

const people: Person[] = [
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

const keys: KeyView[] = [
  { id: 'cred-assistant', label: 'האינסטינקט של מני', actors: ['user:d-owner'], status: 'active', expiresAt: null, rotating: false, previousUntil: null, source: 'secret', createdAt: null, createdBy: null, updatedAt: null },
  { id: 'cred-beni', label: 'האינסטינקט של בני', actors: ['user:d-beni'], status: 'active', expiresAt: null, rotating: true, previousUntil: ago(-18 * 60), source: 'console', createdAt: ago(12 * DAY), createdBy: 'מני בעלים', updatedAt: ago(6 * 60) },
  { id: 'cred-stageb', label: 'בדיקות אוטומטיות', actors: ['user:d-owner'], status: 'active', expiresAt: ago(-80 * DAY), rotating: false, previousUntil: null, source: 'secret', createdAt: null, createdBy: null, updatedAt: null },
  { id: 'cred-old', label: 'מפתח ישן לניסוי', actors: ['user:d-matan'], status: 'revoked', expiresAt: null, rotating: false, previousUntil: null, source: 'console', createdAt: ago(40 * DAY), createdBy: 'מני בעלים', updatedAt: ago(20 * DAY) },
];
const lastUse: Record<string, string | null> = { 'cred-assistant': ago(3), 'cred-beni': ago(95), 'cred-stageb': ago(2 * DAY), 'cred-old': ago(21 * DAY) };

const entry = (min: number, credential: string, keyLabel: string, name: string, op: string, opHe: string, verb: string, ok = true): LogEntry =>
  ({ id: 'l' + min, at: ago(min), credential, keyLabel, actor: { id: 'user:x', role: 'owner', uid: 'x', name }, kind: 'write', op, opHe, verb, ok, code: ok ? '' : 'FORBIDDEN', message: '', status: ok ? 200 : 403 });
const recent: LogEntry[] = [
  entry(3, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'tasks.create', 'יצירת משימה', 'יצר'),
  entry(11, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'shopping.add', 'הוספה לרשימת הקניות', 'יצר'),
  entry(42, 'console', 'קונסולה · מני', 'מני בעלים', 'console.keys.rotate', 'החלפת מפתח API', 'ערך'),
  entry(95, 'cred-beni', 'האינסטינקט של בני', 'בני גוטמן', 'broadcasts.send', 'שליחת הודעה לצוות', 'שלח', false),
  entry(130, 'cred-beni', 'האינסטינקט של בני', 'בני גוטמן', 'tasks.complete', 'סימון משימה כבוצעה', 'ביצע'),
  entry(300, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'events.update', 'עריכת אירוע', 'ערך'),
];

const overview = (): Overview => ({
  server: { status: 'ok', catalogVersion: '3.0.0', version: '68a66274-demo', deployedAt: ago(26 * 60), project: 'havat-ravve' },
  last24h: { requests: 412, writes: 57, failed: 3, failures: 0 },
  queues: { pushPending: 0, email: { pending: 0, sent: 0, failed: 0 } },
  crons: { at: ago(2), wallMs: 840 },
  switches: { email: { on: false, configured: false, brevo: false, resend: false }, push: { mode: 'webpush' }, files: { r2: true } },
});

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 180));
const fakeKey = () => 'hr_DEMO_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

export const demoSource: Source = {
  demo: true,
  me: () => wait({ uid: 'd-owner', name: 'מני בעלים', role: 'owner' as const }),
  overview: () => wait(overview()),
  keys: () => wait(keys),
  createKey: async ({ label, actor, expiresAt }) => {
    const id = 'cred-demo-' + (keys.length + 1);
    keys.push({ id, label, actors: [actor], status: 'active', expiresAt, rotating: false, previousUntil: null, source: 'console', createdAt: ago(0), createdBy: 'מני בעלים', updatedAt: ago(0) });
    lastUse[id] = null;
    return wait({ id, key: fakeKey() });
  },
  changeKey: async (id, action, body = {}) => {
    const k = keys.find((x) => x.id === id);
    if (!k) throw new Error('no such key');
    k.updatedAt = ago(0);
    k.source = 'console';
    if (action === 'rename') k.label = String(body.label);
    if (action === 'revoke') k.status = 'revoked';
    if (action === 'restore') k.status = k.expiresAt && Date.parse(k.expiresAt) < Date.now() ? 'expired' : 'active';
    if (action === 'expire') { k.expiresAt = (body.expiresAt as string) || null; k.status = k.status === 'revoked' ? 'revoked' : k.expiresAt && Date.parse(k.expiresAt) < Date.now() ? 'expired' : 'active'; }
    if (action === 'rotate') {
      const h = Number(body.graceHours ?? 24);
      k.rotating = h > 0; k.previousUntil = h > 0 ? ago(-h * 60) : null; k.status = 'active';
      return wait({ id, key: fakeKey() });
    }
    return wait({ id });
  },
  people: () => wait(people),
  recent: (n) => wait(recent.slice(0, n)),
  lastUse: (ids) => wait(Object.fromEntries(ids.map((id) => [id, lastUse[id] ?? null]))),
  action: async (op, body) => {
    const p = people.find((x) => x.uid === body.uid);
    if (op === 'people.setRole' && p) p.role = body.role as Person['role'];
    if (op === 'people.setStatus' && p) p.status = body.status as Person['status'];
    if (op === 'people.setNotes' && p) p.notes = String(body.notes);
    if (op === 'people.delete' && p) people.splice(people.indexOf(p), 1);
    if (p) p.updatedAt = ago(0);
    return wait({ changed: true });
  },
};
