// The demo's content: גישה ואבטחה: מפתחות, הרצת פעולה, יומן אבטחה (K14-K16).
import type { CatalogOp, KeyUsage, KeyView, SecurityEvent, Source } from '../source';
import { otherOps } from './ops';
import { people } from './data';
import { ago, at, DAY, dayKey, wait, fakeKey, DEMO_NOW } from './base';

const scopes = {
  beni: ['broadcasts:read', 'broadcasts:write', 'projects:read', 'projects:write', 'shopping:read', 'shopping:write', 'tasks:assign', 'tasks:complete', 'tasks:create', 'tasks:edit', 'tasks:read', 'templates:read', 'templates:write'],
  tasks: ['tasks:read', 'tasks:create', 'tasks:complete', 'tasks:edit'],
  view: ['tasks:read', 'shopping:read', 'events:read', 'overview:read', 'system:read'],
};
const keys: KeyView[] = [
  { id: 'cred-assistant', label: 'האינסטינקט של מני', actors: ['user:d-owner'], status: 'active', expiresAt: null, rotating: false, previousUntil: null, source: 'secret', createdAt: null, createdBy: null, updatedAt: null, scopes: null },
  { id: 'cred-beni', label: 'האינסטינקט של בני', actors: ['user:d-beni'], status: 'active', expiresAt: null, rotating: true, previousUntil: at('2026-11-24', '18:00'), source: 'console', createdAt: at('2026-11-12', '10:20'), createdBy: 'מני בעלים', updatedAt: at('2026-11-23', '18:00'), scopes: scopes.beni },
  { id: 'cred-stageb', label: 'בדיקות אוטומטיות', actors: ['user:d-owner'], status: 'active', expiresAt: at('2026-11-26', '12:00'), rotating: false, previousUntil: null, source: 'console', createdAt: at('2026-09-02', '11:05'), createdBy: 'מני בעלים', updatedAt: at('2026-09-02', '11:05'), scopes: scopes.view },
  { id: 'cred-old', label: 'מפתח ישן לניסוי', actors: ['user:d-matan'], status: 'revoked', expiresAt: null, rotating: false, previousUntil: null, source: 'console', createdAt: at('2026-10-14', '09:40'), createdBy: 'מני בעלים', updatedAt: at('2026-11-03', '20:15'), scopes: scopes.tasks },
];
const lastUse: Record<string, string | null> = { 'cred-assistant': ago(3), 'cred-beni': ago(118), 'cred-stageb': at('2026-11-21', '07:30'), 'cred-old': at('2026-11-02', '16:10') };
const usage: Record<string, KeyUsage> = {
  'cred-assistant': { requests: 214, failed: 0, days: 7 }, 'cred-beni': { requests: 61, failed: 1, days: 7 }, 'cred-stageb': { requests: 36, failed: 0, days: 7 }, 'cred-old': { requests: 1, failed: 1, days: 7 },
};

const ev = (when: string, kind: SecurityEvent['kind'], who: string, what: string, detail = '', ok = kind === 'console'): SecurityEvent => ({ at: when, kind, who, what, detail, ok });
const IN = 'כניסה לקונסולה';
const security: SecurityEvent[] = [
  ev(at('2026-11-23', '18:34'), 'console', 'מני בעלים', IN),
  ev(at('2026-11-23', '18:00'), 'console', 'מני בעלים', 'החלפת מפתח API'),
  ev(at('2026-11-23', '17:07'), 'refused', 'האינסטינקט של בני', 'שליחת הודעה לצוות', 'אין הרשאה: the key may not send broadcasts', false),
  ev(at('2026-11-23', '12:42'), 'limited', 'כתובת לא מוכרת', '/v1/tasks', 'יותר מדי בקשות בזמן קצר: נחסם ל־10 דקות', false),
  ev(at('2026-11-22', '18:12'), 'console', 'בני גוטמן', IN),
  ev(at('2026-11-21', '18:46'), 'console', 'מני בעלים', 'שחזור מסל המחזור'),
  ev(at('2026-11-20', '10:12'), 'console', 'מני בעלים', 'שינוי מתג', 'השהיית מיילים לנרשמים: כבוי · אחרי בדיקת המכסה של שירות המייל'),
  ev(at('2026-11-20', '09:12'), 'refused', 'מפתח ישן לניסוי', 'רשימת משימות', 'לא מחובר: the key was revoked', false),
  // the design's table has eight rows and its list of sign-ins has this one too, so it stands after them
  ev(at('2026-11-21', '18:40'), 'console', 'מני בעלים', IN),
  ev(at('2026-11-15', '20:04'), 'console', 'בני גוטמן', IN),
  ev(at('2026-11-12', '10:20'), 'console', 'מני בעלים', 'יצירת מפתח API'),
  ev(at('2026-11-12', '10:16'), 'console', 'מני בעלים', IN),
  ev(at('2026-11-09', '21:10'), 'console', 'מני בעלים', 'גיבוי עכשיו'),
  ev(at('2026-11-06', '03:22'), 'limited', 'כתובת לא מוכרת', '/v1/people', 'יותר מדי בקשות בזמן קצר: נחסם ל־10 דקות', false),
  ev(at('2026-11-03', '20:15'), 'console', 'מני בעלים', 'ביטול מפתח API'),
  ev(at('2026-11-03', '20:11'), 'console', 'מני בעלים', IN),
  ev(at('2026-10-29', '08:50'), 'refused', 'בדיקות אוטומטיות', 'יצירת משימה חדשה', 'אין הרשאה: actor has no scope tasks:create', false),
];

const demoCatalog: CatalogOp[] = [
  { name: 'tasks.list', kind: 'read', he: 'רשימת משימות, אופציונלי לפי אחראי, תאריך יעד, מצב ביצוע, מקום או באיחור', method: 'GET', path: '/v1/tasks', requiredScope: 'tasks:read',
    params: { assignee: { type: 'uid' }, date: { type: 'date', he: 'תאריך יעד מדויק' }, done: { type: 'bool', he: 'true לבוצעו, false לפתוחות' }, placeId: { type: 'id' }, overdue: { type: 'bool' }, limit: { type: 'int', min: 1, max: 50, default: 20 }, cursor: { type: 'string', max: 400 } },
    notes: ['Newest first. Response has "items", "nextCursor" and "hasMore".'] },
  { name: 'tasks.get', kind: 'read', he: 'משימה אחת לפי מזהה', method: 'GET', path: '/v1/tasks/{id}', requiredScope: 'tasks:read', pathParams: { id: { type: 'id', required: true } } },
  { name: 'tasks.create', kind: 'write', he: 'יצירת משימה חדשה, אופציונלי עם שיוך לאחראי', method: 'POST', path: '/v1/tasks', idempotency: 'required', requiredScope: 'tasks:create',
    body: { title: { type: 'string', required: true, min: 1, max: 200, he: 'כותרת המשימה' }, assignee: { type: 'uid' }, dueDate: { type: 'date', he: 'תאריך יעד' }, placeId: { type: 'id' }, urgent: { type: 'bool', default: false } },
    notes: ['The response is a read-back of the stored task ("verified": true when it matches what was sent).'] },
  { name: 'shopping.list', kind: 'read', he: 'רשימת הקניות. ברירת מחדל: מה שעוד לא נקנה', method: 'GET', path: '/v1/shopping', requiredScope: 'shopping:read',
    params: { bought: { type: 'bool', default: false }, category: { type: 'enum', values: ['super', 'building', 'online', 'giveaway'] }, limit: { type: 'int', min: 1, max: 100, default: 50 } } },
  { name: 'shopping.add', kind: 'write', he: 'הוספת פריט לרשימת הקניות', method: 'POST', path: '/v1/actions/shopping.add', idempotency: 'required', requiredScope: 'shopping:write',
    body: { title: { type: 'string', required: true, min: 1, max: 200, he: 'מה לקנות' }, qty: { type: 'string', max: 40, he: 'כמות, למשל 2 שקים' }, category: { type: 'enum', values: ['super', 'building', 'online', 'giveaway'], default: 'super' }, urgent: { type: 'bool', default: false }, note: { type: 'string', max: 1000 } } },
  { name: 'people.search', kind: 'read', he: 'חיפוש איש צוות לפי שם. מחזיר מועמדים, לא מנחש', method: 'GET', path: '/v1/people', requiredScope: 'people:read', params: { q: { type: 'string', required: true, min: 1, max: 80, he: 'שם או תחילת שם' } } },
  { name: 'overview.get', kind: 'read', he: 'תמונת מצב של החווה במספרים', method: 'GET', path: '/v1/overview', requiredScope: 'overview:read', params: { date: { type: 'date', he: 'היום שלגביו' } } },
  ...otherOps(),
];

// the farm behind the demo's operations: what the runs read, add to and take from
type Rec = Record<string, unknown>;
const who = (uid: unknown) => { const p = people.find((x) => x.uid === uid); return p ? { uid: p.uid, name: p.displayName } : null; };
const farm: Record<string, Rec[]> = {
  tasks: [
    { id: 't-1', title: 'להאכיל את העזים', done: false, assignee: who('d-yoav'), dueDate: dayKey(0), location: { placeId: 'p-pen', placeName: 'דיר העיזים' }, urgent: false },
    { id: 't-2', title: 'לתקן את הגדר בצפון', done: false, assignee: null, dueDate: dayKey(-2), location: { placeId: 'p-north', placeName: 'החלקה הצפונית' }, urgent: true },
    { id: 't-3', title: 'לבדוק את השוקת', done: false, assignee: who('d-orly'), dueDate: null, location: null, urgent: false },
    { id: 't-4', title: 'לסדר את מחסן הכלים', done: false, assignee: null, dueDate: dayKey(-5), location: null, urgent: false },
  ],
  shopping: [
    { id: 's-1', title: 'חבילות חציר', qty: '6', category: 'super', urgent: true, bought: false }, { id: 's-2', title: 'ברגים לגדר', qty: '2 קופסאות', category: 'building', urgent: false, bought: false }, { id: 's-3', title: 'קפה', qty: '', category: 'super', urgent: false, bought: false },
  ],
  places: ['החלקה הצפונית', 'דיר העיזים', 'חממה', 'פינת החי', 'שורת העציצים'].map((name, i) => ({ id: ['p-north', 'p-pen', 'p-green', 'p-zoo', 'p-pots'][i], name })),
  events: [{ id: 'e-fest', title: 'פסטיבל החורף', start: '2026-11-28T10:00', end: '2026-11-28T18:00', price: 40, capacity: 200, published: true, open: true }, { id: 'e-olive', title: 'מסיק זיתים', start: '2026-12-11T08:00', end: '2026-12-11T13:00', price: 0, capacity: 60, published: true, open: true }],
  vendors: [{ id: 'v1', name: 'גבינות העמק', contact: 'רז', phone: '050-0000006', sells: 'גבינות' }, { id: 'v2', name: 'דוכן הדבש', contact: 'נעמי', phone: '050-0000011', sells: 'דבש' }],
  profiles: people.map((p) => ({ id: p.uid, name: p.displayName, role: p.role, status: p.status, phone: p.phone })),
  projects: [{ id: 'pr-1', title: 'שיפוץ הכניסה', deadline: 'סוף דצמבר', status: 'active' }],
};
let seq = 0, made = 0;
/** The first task made here is the design's own. */
const newId = (res: string) => (res === 'tasks' ? ['t-91c04e', 't-b3d27a', 't-0c48f1'][made++] || `t-demo${made}` : `${res[0]}-demo${++made}`);
const found = (data: Rec, ms = 210) => ({ status: 200, ms, json: { ok: true, data, meta: { requestId: 'req_demo' + ++seq } } });
const missing = { status: 404, ms: 160, json: { ok: false, error: { code: 'NOT_FOUND', message: 'not found', he: 'לא נמצא' } } };
const invalid = (field: string, he = 'חסר שדה חובה') => ({ status: 400, ms: 120, json: { ok: false, error: { code: 'VALIDATION_FAILED', message: `${field} is not valid`, he, details: { field } } } });

function read(full: string) {
  const [path, query] = full.split('?');
  const q = new URLSearchParams(query || '');
  const [, , res, id] = path.split('/').map(decodeURIComponent);
  if (res === 'overview') return found({
    date: dayKey(0), tasks: { open: farm.tasks.filter((t) => !t.done).length, overdue: 0, urgent: farm.tasks.filter((t) => t.urgent && !t.done), dueToday: farm.tasks.filter((t) => t.dueDate === dayKey(0)), mine: [] },
    shopping: { open: farm.shopping.filter((s) => !s.bought).length, urgent: farm.shopping.filter((s) => s.urgent && !s.bought) }, upcomingEvents: farm.events, calendarToday: [], peoplePending: 0,
  }, 240);
  if (res === 'people') { const t = (q.get('q') || '').trim(); return found({ candidates: people.filter((p) => ['owner', 'manager', 'staff'].includes(p.role) && p.displayName.includes(t)).map((p) => ({ uid: p.uid, name: p.displayName, role: p.role })), ambiguous: false, complete: true }, 160); }
  const list = farm[res];
  if (id && path.split('/').length === 4) { const rec = list?.find((x) => x.id === id); return rec ? found(res === 'tasks' ? { task: rec } : { record: rec }) : missing; }
  const keep = (x: Rec) => (!q.get('assignee') || (x.assignee as Rec | null)?.uid === q.get('assignee')) && (!q.get('date') || x.dueDate === q.get('date')) && (!q.get('done') || String(!!x.done) === q.get('done'))
    && (!q.get('placeId') || (x.location as Rec | null)?.placeId === q.get('placeId')) && (!q.get('category') || x.category === q.get('category')) && (!q.get('role') || x.role === q.get('role')) && (res !== 'shopping' || String(!!x.bought) === (q.get('bought') || 'false'));
  return found({ items: (list || []).filter(keep).slice(0, Number(q.get('limit')) || 50), hasMore: false, nextCursor: null }, 190);
}
/** A task or an item as the server reads it back: names instead of ids. */
function stored(res: string, id: string, body: Rec): Rec {
  const { placeId, assignee, ...rest } = body;
  if (res !== 'tasks') return { id, ...body };
  const place = farm.places.find((p) => p.id === placeId);
  return { id, done: false, urgent: false, dueDate: null, ...rest, assignee: who(assignee), location: place ? { placeId, placeName: place.name } : null, createdBy: who('d-owner'), createdAt: ago(0), updatedAt: ago(0) };
}
const wrap = (res: string, rec: Rec): Rec => (res === 'tasks' ? { taskId: rec.id, task: rec } : res === 'shopping' ? { itemId: rec.id, item: rec } : { [`${res.replace(/ies$/, 'y').replace(/s$/, '')}Id`]: rec.id, record: rec });
function write(op: string, body: Rec) {
  const [res, verb] = [op.slice(0, op.lastIndexOf('.')), op.slice(op.lastIndexOf('.') + 1)];
  const need = demoCatalog.find((o) => o.name === op)?.body || {};
  for (const [k, p] of Object.entries(need)) if (p.required && (body[k] === undefined || String(body[k]).trim() === '')) return invalid(k);
  const ok = (data: Rec, status = 200) => ({ status, ms: 430, json: { ok: true, data: { verified: true, replayed: false, ...data }, meta: { requestId: 'req_demo' + ++seq } } });
  if (verb === 'create' || verb === 'add') {
    const rec = stored(res, newId(res), body);
    (farm[res] ||= []).unshift(rec);
    return ok(wrap(res, rec), 201);
  }
  const id = Object.entries(body).find(([k]) => k === 'taskId' && res === 'tasks' || k === 'itemId' || /^(place|event|vendor|project|template|visit|donation|notification|tab|broadcast)Id$/.test(k) || k === 'uid')?.[1];
  const list = farm[res === 'people' ? 'profiles' : res];
  const rec = list?.find((x) => x.id === id);
  if (verb === 'delete') {
    if (list && !rec) return missing;
    if (list && rec) list.splice(list.indexOf(rec), 1);
    return ok({ deleted: rec || { id } });
  }
  if (list && id && !rec) return missing;
  if (rec) {
    const { taskId: _t, itemId: _i, uid: _u, ifUpdatedAt: _f, assignee, ...set } = body;
    Object.assign(rec, set, assignee ? { assignee: who(assignee) } : {});
    const was = !!rec.done;
    if (verb === 'complete') Object.assign(rec, { done: true, doneBy: who('d-owner'), doneAt: ago(0) });
    if (verb === 'reopen' && res === 'tasks') Object.assign(rec, { done: false, doneBy: null, doneAt: null });
    if (verb === 'take') rec.assignee = who('d-owner');
    if (verb === 'release') rec.assignee = null;
    if (verb === 'setBought') rec.bought = body.bought !== false;
    return ok({ ...wrap(res, rec), changed: !((verb === 'complete' && was) || (verb === 'reopen' && res === 'tasks' && !was)) });
  }
  return ok({ record: { id: id || newId(res), ...body } });
}
const demoRun = (method: string, path: string, body: Rec = {}) => (method === 'GET' ? read(path) : write(path.includes('/actions/') ? path.split('/actions/')[1] : `${path.split('/')[2]}.create`, body));

const ran = new Map<string, ReturnType<typeof demoRun>>();

export const accessDemo: Pick<Source, 'keys' | 'createKey' | 'changeKey' | 'lastUse' | 'lastUseOf' | 'security' | 'catalog' | 'runOp' | 'keyUsage'> = {
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
  lastUse: (ids) => wait({ at: Object.fromEntries(ids.flatMap((id) => (lastUse[id] ? [[id, lastUse[id]]] : []))), since: null }),
  lastUseOf: (id) => wait(lastUse[id] ?? null),
  security: (days) => wait({ since: ago(days * DAY), items: security.filter((e) => DEMO_NOW - Date.parse(e.at) < days * DAY * 60_000) }),
  catalog: () => wait(demoCatalog),
  // the same request again under the same key answers as before and changes nothing, like the server
  runOp: async (method, path, body, key) => {
    const before = key ? ran.get(key) : undefined;
    if (before) return wait({ ...before, json: { ...before.json, data: { ...(before.json as { data?: Rec }).data, replayed: true } } });
    const r = demoRun(method, path, body);
    if (key && r.status < 300) ran.set(key, r);
    return wait(r);
  },
  keyUsage: (id) => wait(usage[id] || { requests: 0, failed: 0, days: 7 }),
};
