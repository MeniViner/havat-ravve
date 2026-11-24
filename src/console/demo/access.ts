// The demo's content: גישה ואבטחה: מפתחות, הרצת פעולה, יומן אבטחה (K14-K16).
import type { CatalogOp, KeyView, SecurityEvent, Source } from '../source';
import { ago, DAY, dayKey, wait, fakeKey, DEMO_NOW } from './base';

const keys: KeyView[] = [
  { id: 'cred-assistant', label: 'האינסטינקט של מני', actors: ['user:d-owner'], status: 'active', expiresAt: null, rotating: false, previousUntil: null, source: 'secret', createdAt: null, createdBy: null, updatedAt: null, scopes: null },
  { id: 'cred-beni', label: 'האינסטינקט של בני', actors: ['user:d-beni'], status: 'active', expiresAt: null, rotating: true, previousUntil: ago(-18 * 60), source: 'console', createdAt: ago(12 * DAY), createdBy: 'מני בעלים', updatedAt: ago(6 * 60), scopes: null },
  { id: 'cred-stageb', label: 'בדיקות אוטומטיות', actors: ['user:d-owner'], status: 'active', expiresAt: ago(-80 * DAY), rotating: false, previousUntil: null, source: 'secret', createdAt: null, createdBy: null, updatedAt: null, scopes: ['tasks:read', 'shopping:read', 'events:read', 'overview:read', 'system:read'] },
  { id: 'cred-old', label: 'מפתח ישן לניסוי', actors: ['user:d-matan'], status: 'revoked', expiresAt: null, rotating: false, previousUntil: null, source: 'console', createdAt: ago(40 * DAY), createdBy: 'מני בעלים', updatedAt: ago(20 * DAY), scopes: null },
];
const lastUse: Record<string, string | null> = { 'cred-assistant': ago(3), 'cred-beni': ago(95), 'cred-stageb': ago(2 * DAY), 'cred-old': ago(21 * DAY) };

const ev = (min: number, kind: SecurityEvent['kind'], who: string, what: string, detail = '', ok = kind === 'console'): SecurityEvent => ({ at: ago(min), kind, who, what, detail, ok });
const security: SecurityEvent[] = [
  ev(8, 'console', 'מני בעלים', 'כניסה לקונסולה'),
  ev(42, 'console', 'מני בעלים', 'החלפת מפתח API'),
  ev(95, 'refused', 'האינסטינקט של בני', 'שליחת הודעה לצוות', 'אין הרשאה: the key may not send broadcasts', false),
  ev(6 * 60, 'limited', 'כתובת לא מוכרת', '/v1/tasks', 'יותר מדי בקשות בזמן קצר: נחסם לדקה', false),
  ev(DAY + 30, 'console', 'בני גוטמן', 'כניסה לקונסולה'),
  ev(2 * DAY, 'console', 'מני בעלים', 'שחזור מסל המחזור'),
  ev(3 * DAY, 'refused', 'מפתח ישן לניסוי', 'רשימת משימות', 'לא מחובר: the key was revoked', false),
];

const date = (he: string) => ({ type: 'date', format: 'YYYY-MM-DD', he });
const demoCatalog: CatalogOp[] = [
  { name: 'tasks.list', kind: 'read', he: 'רשימת משימות', method: 'GET', path: '/v1/tasks', requiredScope: 'tasks:read', params: { status: { type: 'enum', values: ['open', 'done', 'all'], default: 'open', he: 'אילו משימות' }, assignee: { type: 'uid', he: 'רק של אדם אחד' }, limit: { type: 'int', min: 1, max: 100, default: 25 } } },
  { name: 'tasks.get', kind: 'read', he: 'משימה אחת', method: 'GET', path: '/v1/tasks/{id}', requiredScope: 'tasks:read', pathParams: { id: { type: 'id', required: true } } },
  { name: 'people.search', kind: 'read', he: 'חיפוש אדם לפי שם', method: 'GET', path: '/v1/people', requiredScope: 'people:read', params: { q: { type: 'string', required: true, min: 1, max: 80, he: 'שם או חלק משם' } } },
  { name: 'shopping.list', kind: 'read', he: 'רשימת הקניות', method: 'GET', path: '/v1/shopping', requiredScope: 'shopping:read', params: { bought: { type: 'bool', default: false } } },
  { name: 'overview.get', kind: 'read', he: 'מבט כללי על החווה', method: 'GET', path: '/v1/overview', requiredScope: 'overview:read' },
  { name: 'tasks.create', kind: 'write', he: 'יצירת משימה חדשה, אופציונלי עם שיוך לאחראי', method: 'POST', path: '/v1/actions/tasks.create', idempotency: 'required', requiredScope: 'tasks:create',
    body: { title: { type: 'string', required: true, min: 1, max: 200, he: 'כותרת המשימה' }, dueDate: date('תאריך יעד'), urgent: { type: 'bool', default: false }, note: { type: 'string', max: 4000, he: 'הערה / פירוט' } } },
  { name: 'shopping.add', kind: 'write', he: 'הוספת פריט לרשימת הקניות', method: 'POST', path: '/v1/actions/shopping.add', idempotency: 'required', requiredScope: 'shopping:write',
    body: { title: { type: 'string', required: true, min: 1, max: 200, he: 'מה לקנות' }, qty: { type: 'string', max: 40, he: 'כמות' }, category: { type: 'enum', values: ['super', 'building', 'online', 'giveaway'], default: 'super' }, urgent: { type: 'bool', default: false } } },
];
let demoSeq = 0;
const demoRun = (method: string, path: string, body?: Record<string, unknown>) => {
  if (method === 'POST') {
    const id = 'demo-' + (++demoSeq);
    if (!String(body?.title || '').trim()) return { status: 400, ms: 120, json: { ok: false, error: { code: 'VALIDATION_FAILED', message: 'title is required', he: 'חסר שדה חובה', details: { field: 'title' } } } };
    return { status: 201, ms: 430, json: { ok: true, data: { verified: true, record: { id, ...body }, replayed: false }, meta: { requestId: 'req_demo' + demoSeq } } };
  }
  if (path.startsWith('/v1/people')) return { status: 200, ms: 160, json: { ok: true, data: { items: [{ uid: 'd-yoav', name: 'יואב פרץ', role: 'staff' }] } } };
  if (path.startsWith('/v1/tasks')) return { status: 200, ms: 190, json: { ok: true, data: { items: [{ id: 't-1', title: 'להאכיל את העזים', done: false, assignee: { name: 'יואב פרץ' }, dueDate: dayKey(0) }, { id: 't-2', title: 'לתקן את הגדר בצפון', done: false, urgent: true }] } } };
  return { status: 200, ms: 240, json: { ok: true, data: { note: 'בהדגמה: תשובה לדוגמה' } } };
};

export const accessDemo: Pick<Source, 'keys' | 'createKey' | 'changeKey' | 'lastUse' | 'security' | 'catalog' | 'runOp' | 'keyUsage'> = {
  keys: () => wait(keys),
  createKey: async ({ label, actor, expiresAt, scopes }) => {
    const id = 'cred-demo-' + (keys.length + 1);
    keys.push({ id, label, actors: [actor], status: 'active', expiresAt, rotating: false, previousUntil: null, source: 'console', createdAt: ago(0), createdBy: 'מני בעלים', updatedAt: ago(0), scopes: scopes?.length ? [...scopes].sort() : null });
    lastUse[id] = null;
    return wait({ id, key: fakeKey() });
  },
  changeKey: async (id, action, body = {}) => {
    const k = keys.find((x) => x.id === id);
    if (!k) throw new Error('no such key');
    k.updatedAt = ago(0);
    k.source = 'console';
    if (action === 'rename') k.label = String(body.label);
    if (action === 'scopes') k.scopes = Array.isArray(body.scopes) ? [...(body.scopes as string[])].sort() : null;
    if (action === 'revoke') k.status = 'revoked';
    if (action === 'restore') k.status = k.expiresAt && Date.parse(k.expiresAt) < DEMO_NOW ? 'expired' : 'active';
    if (action === 'expire') { k.expiresAt = (body.expiresAt as string) || null; k.status = k.status === 'revoked' ? 'revoked' : k.expiresAt && Date.parse(k.expiresAt) < DEMO_NOW ? 'expired' : 'active'; }
    if (action === 'rotate') {
      const h = Number(body.graceHours ?? 24);
      k.rotating = h > 0; k.previousUntil = h > 0 ? ago(-h * 60) : null; k.status = 'active';
      return wait({ id, key: fakeKey() });
    }
    return wait({ id });
  },
  lastUse: (ids) => wait(Object.fromEntries(ids.map((id) => [id, lastUse[id] ?? null]))),
  security: (days) => wait({ since: ago(days * DAY), items: security.filter((e) => DEMO_NOW - Date.parse(e.at) < days * DAY * 60_000) }),
  catalog: () => wait(demoCatalog),
  runOp: async (method, path, body) => wait(demoRun(method, path, body)),
  keyUsage: () => wait({ requests: 0, failed: 0, days: 7 }),
};
