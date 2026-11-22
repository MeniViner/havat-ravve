// v2 tasks data helpers (src/app/v2/data/tasks.ts): the pure logic behind T1-T6, C3, C4, C6, C7, L1-L5, and the writes it makes.
// Bundles the real module with db / activity / store / shopping / notify replaced by recorders and the real clock frozen
// at the designed moment (Thu 19.11.2026 10:30, Israel). Run: node tests/v2-tasks.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';

process.env.TZ = 'UTC'; // the helpers must not depend on the machine's zone
const STUBS = {
  react: 'export const useMemo = (f) => f(); export const useSyncExternalStore = (s, g) => g();',
  db: `
    const calls = () => globalThis.__calls;
    let n = 0;
    export class ConflictError extends Error { constructor(m) { super(m); this.name = 'ConflictError'; } }
    export const isConflict = (e) => e instanceof ConflictError;
    export const newId = (col) => col + '-new' + (++n);
    export const useList = () => ({ items: [], loading: false }), useDoc = () => ({ item: null, loading: false });
    export const write = {
      set: async (col, id, data) => { calls().push(['set', col, id, data]); },
      update: async (col, id, data) => { calls().push(['update', col, id, data]); },
      remove: async (col, id) => { calls().push(['remove', col, id]); },
      batch: async (ops) => { calls().push(['batch', ops]); },
    };
    export const transact = async (fn) => fn({
      get: async (col, id) => globalThis.__server[col + '/' + id] || null,
      update: (col, id, data) => calls().push(['tx.update', col, id, data]),
      set: (col, id, data) => calls().push(['tx.set', col, id, data]),
    });`,
  activity: `export const logActivity = (actor, kind, refId, action, text, extra) => { globalThis.__calls.push(['log', kind, refId, action, text, extra]); };
             export const taskKind = (t) => (t.templateId ? 'routine' : 'task');
             export const useActivityFor = () => ({ items: [] });`,
  store: `export const addTask = async (actor, data) => { globalThis.__calls.push(['addTask', data]); return 'tasks-added'; };
          export const editTask = async (actor, t, data) => { globalThis.__calls.push(['editTask', t.id, data]); };
          export const editShopping = async (actor, item, data) => { globalThis.__calls.push(['editShopping', item.id, data]); };`,
  shopping: `export const addShopItem = async (actor, data, team) => { globalThis.__calls.push(['addShopItem', data]); return 'shopping-added'; };
             export const setItemPhoto = async (actor, item, photo) => { globalThis.__calls.push(['setItemPhoto', item.id, photo]); };`,
  notify: 'export const notify = async (uids, n) => { globalThis.__calls.push(["notify", uids, n]); };',
};
const stub = {
  name: 'stub-tasks',
  setup(b) {
    b.onResolve({ filter: /^(react|\.\.\/\.\.\/db|\.\.\/\.\.\/activity|\.\.\/\.\.\/store|\.\/shopping|\.\/notify)$/ }, (a) => ({ path: a.path.split('/').pop(), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
  },
};
await build({
  stdin: { contents: "export * from './src/app/v2/data/tasks.ts'; export { freezeClock } from './src/app/clock.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: '.build/v2-tasks-test.mjs', plugins: [stub], logLevel: 'silent',
});
globalThis.__calls = [];
globalThis.__server = {};
const calls = globalThis.__calls;
const T = await import('../.build/v2-tasks-test.mjs?' + Date.now());
const NOW = Date.parse('2026-11-19T10:30:00+02:00');
T.freezeClock(new Date(NOW).toISOString());
const TODAY = '2026-11-19';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`PASS: ${name}`); };

// ---- fixtures
const yoav = { uid: 'u-yoav', name: 'יואב כהן' };
const beni = { uid: 'u-beni', name: 'בני ביקש' };
const noa = { uid: 'u-noa', name: 'נועה לוי' };
const iso = (s) => new Date(s).toISOString();
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();
const place = (id, name, lat = 32, lng = 35) => ({ id, name, lat, lng });
const loc = (p) => ({ lat: p.lat, lng: p.lng, placeId: p.id, placeName: p.name });
const gate = place('p-gate', 'ליד הכניסה', 32.0000, 35.0000);
const green = place('p-green', 'חממה', 32.0010, 35.0000);
const shed = place('p-shed', 'מאחורי המכולה', 32.0020, 35.0000);
const task = (o) => T.normalizeTask({ id: o.id || 't' + Math.random().toString(36).slice(2), title: 'משימה', createdBy: beni, createdAt: ago(20), ...o });

await test('old task documents load with defaults for every missing field', () => {
  const t = T.normalizeTask({ id: 'old', title: 'ישנה', createdBy: beni, createdAt: '2025-01-01T08:00:00.000Z' });
  assert.equal(t.note, ''); assert.equal(t.photo, ''); assert.equal(t.location, null); assert.equal(t.dueDate, '');
  assert.equal(t.managersOnly, false); assert.equal(t.templateId, null); assert.equal(t.dateKey, null);
  assert.equal(t.done, false); assert.equal(t.doneBy, null); assert.equal(t.doneAt, null); assert.equal(t.assignee, null);
  assert.equal(t.urgent, false); assert.equal(t.eventId, ''); assert.equal(t.updatedAt, '2025-01-01T08:00:00.000Z');
  // broken shapes are tolerated
  const b = T.normalizeTask({ id: 'b', createdBy: 'x', location: { placeName: 'x' }, assignee: { uid: '', name: '' } });
  assert.deepEqual(b.createdBy, { uid: '', name: '' }); assert.equal(b.location, null); assert.equal(b.assignee, null);
  // unknown newer fields are kept
  assert.equal(T.normalizeTask({ id: 'n', shoppingId: 's1' }).shoppingId, 's1');
});

await test('recurring instances show the template place and person when they have none', () => {
  const tpl = { id: 'tpl-eggs', title: 'ביצים', days: [], time: '07:00', active: true, managersOnly: false, assignee: yoav, placeId: 'p-green' };
  const inst = task({ id: 'tpl-eggs_2026-11-19', templateId: 'tpl-eggs', dateKey: TODAY });
  const out = T.withTemplateDefaults(inst, [tpl], [green]);
  assert.equal(out.location.placeName, 'חממה'); assert.equal(out.assignee.uid, yoav.uid);
  const own = task({ templateId: 'tpl-eggs', assignee: noa, location: loc(gate) });
  assert.equal(T.withTemplateDefaults(own, [tpl], [green]), own, 'own values win and the object is untouched');
  const plain = task({});
  assert.equal(T.withTemplateDefaults(plain, [tpl], [green]), plain);
});

await test('progress counts my tasks for today and my tasks done today', () => {
  const ts = [
    task({ assignee: yoav, done: true, doneBy: yoav, doneAt: ago(2) }),
    task({ assignee: yoav, done: true, doneBy: yoav, doneAt: ago(3) }),
    task({ assignee: yoav, done: true, doneBy: yoav, doneAt: ago(30) }), // yesterday: out
    task({ assignee: yoav }),
    task({ assignee: yoav, dueDate: '2026-11-18' }), // overdue: in
    task({ assignee: yoav, dueDate: '2026-11-25' }), // later: out
    task({ assignee: noa }),
    task({}),
  ];
  assert.deepEqual(T.progressOf(ts, yoav.uid, TODAY), { total: 4, done: 2 });
  assert.equal(T.progressCaption(3, 5), '3 מתוך 5 שלך בוצעו');
  assert.equal(T.progressCaption(4, 5), '4 מתוך 5 שלך בוצעו. נשארה אחת');
  assert.equal(T.progressCaption(0, 1), '0 מתוך 1 שלך בוצעו');
});

await test('next up is my most pressing open task for today', () => {
  const old = task({ id: 'old', assignee: yoav, createdAt: ago(40) });
  const urgent = task({ id: 'urg', assignee: yoav, urgent: true, createdAt: ago(1) });
  const later = task({ id: 'later', assignee: yoav, dueDate: '2026-11-30', urgent: true });
  assert.equal(T.pickNextUp([old, later, urgent], yoav.uid, TODAY).id, 'urg');
  assert.equal(T.pickNextUp([old, later], yoav.uid, TODAY).id, 'old');
  assert.equal(T.pickNextUp([later, task({ assignee: noa })], yoav.uid, TODAY), null);
});

await test('stripPlace removes the place a group header already says', () => {
  assert.equal(T.stripPlace('לסדר את ארגז הכלים במכולה', 'המכולה'), 'לסדר את ארגז הכלים');
  assert.equal(T.stripPlace('להעביר שקי קומפוסט לחממה', 'חממה'), 'להעביר שקי קומפוסט');
  assert.equal(T.stripPlace('לסדר את ארגז הכלים במכולה', 'מאחורי המכולה'), 'לסדר את ארגז הכלים');
  assert.equal(T.stripPlace('לתקן את הברז ליד החממה', 'חממה'), 'לתקן את הברז ליד החממה', 'only one-letter prefixes by default');
  assert.equal(T.stripPlace('לתקן את הברז ליד החממה', 'חממה', true), 'לתקן את הברז');
  assert.equal(T.stripPlace('לחממה', 'חממה'), 'לחממה', 'never empties a title');
  assert.equal(T.stripPlace('להחליף את הדגל', 'ליד הכניסה'), 'להחליף את הדגל');
  assert.equal(T.stripPlace('כותרת', undefined), 'כותרת');
});

await test('due texts', () => {
  assert.equal(T.dueText('', TODAY), '');
  assert.equal(T.dueText(TODAY, TODAY), 'היום');
  assert.equal(T.dueText('2026-11-20', TODAY), 'מחר');
  assert.equal(T.dueText('2026-11-18', TODAY), 'אתמול');
  assert.equal(T.dueText('2026-12-04', TODAY), 'שישי 4.12');
  assert.equal(T.dueLong('2026-11-27', TODAY), 'שישי, 27.11');
  assert.equal(T.dueLong('2026-11-20', TODAY), 'מחר');
});

await test('row meta follows T1, T2, P6 and L4', () => {
  const o = (view) => ({ uid: yoav.uid, view, today: TODAY, now: NOW });
  const free = task({ photo: 'data:x', location: loc(gate) });
  assert.equal(T.rowMeta(free, o('place')), 'פנויה · עם תמונה');
  assert.equal(T.rowMeta(free, o('time')), 'ליד הכניסה · פנויה');
  // someone else's, asked by Beni
  const hers = task({ assignee: noa, location: loc(green) });
  assert.equal(T.rowMeta(hers, o('place')), 'נועה · בני ביקש');
  // assignee is the requester: no "ביקש" for them
  const own = task({ assignee: beni, dueDate: TODAY });
  assert.equal(T.rowMeta(own, o('place')), 'בני · היום');
  // just taken
  assert.equal(T.rowMeta(task({ assignee: noa, takenAt: ago(0.05) }), o('place')), 'נועה · לפני רגע');
  // mine
  assert.equal(T.rowMeta(task({ assignee: yoav }), o('place')), 'בני ביקש');
  assert.equal(T.rowMeta(task({ assignee: yoav, createdBy: yoav, dueDate: TODAY }), o('place')), 'עליך · היום');
  assert.equal(T.rowMeta(task({ assignee: yoav, dueDate: '2026-11-20' }), o('mine')), 'בלי מקום · עד מחר');
  assert.equal(T.rowMeta(task({ assignee: yoav, location: loc(green), dueDate: TODAY }), o('mine')), 'חממה · היום');
  assert.equal(T.rowMeta(task({ dueDate: '2026-12-04' }), o('placeList')), 'פנויה · שישי 4.12');
  // done
  assert.equal(T.rowMeta(task({ done: true, doneBy: noa, doneAt: iso('2026-11-19T08:05:00+02:00') }), o('place')), 'בוצע 08:05 · נועה');
  assert.equal(T.rowMeta(task({ done: true, doneBy: noa, doneAt: ago(0.01) }), o('place')), 'בוצע עכשיו · נועה');
  assert.equal(T.rowMeta(task({ done: true, doneBy: noa, templateId: 'x', doneAt: iso('2026-11-19T06:25:00+02:00') }), o('place')), 'בוצע 06:25 · שגרה');
});

await test('by place: urgent places first, then the longest waiting, no place last, done-only groups after', () => {
  const ts = [
    task({ id: 'a', location: loc(green), createdAt: ago(50) }),
    task({ id: 'b', location: loc(gate), createdAt: ago(2), urgent: true }),
    task({ id: 'c', createdAt: ago(100) }),
    task({ id: 'd', location: loc(shed), done: true, doneBy: noa, doneAt: ago(1) }),
    task({ id: 'e', location: loc(green), done: true, doneBy: noa, doneAt: ago(3) }),
    task({ id: 'f', location: loc(green), dueDate: '2026-11-25' }), // future: waits in "by time"
    task({ id: 'g', location: { lat: 1, lng: 1, placeName: 'ליד הבריכה' }, createdAt: ago(10) }),
  ];
  const g = T.groupByPlace(ts, yoav.uid, TODAY, (id) => (id === 'p-green' ? 'החממה החדשה' : undefined));
  assert.deepEqual(g.map((x) => x.key), ['p-gate', 'p-green', 'n:ליד הבריכה', '_none'], 'done-only places are gone');
  assert.equal(g[1].title, 'החממה החדשה', 'the saved place name wins');
  assert.deepEqual(g[1].rows.map((t) => t.id), ['a'], 'done rows leave the lists');
  assert.deepEqual(g.map((x) => x.open), [1, 1, 1, 1], 'counts are open tasks only');
  assert.equal(g[3].title, 'בלי מקום');
});

await test('by place: a task ticked in this session stays struck through in its place (T4), "בלי מקום" included', () => {
  const toolbox = task({ id: 'toolbox', assignee: yoav, location: loc(shed), createdAt: ago(30), done: true, doneBy: yoav, doneAt: ago(0) });
  const paint = task({ id: 'paint', location: loc(shed), createdAt: ago(2) });
  const nowhere = task({ id: 'nowhere', done: true, doneBy: yoav, doneAt: ago(0) });
  const old = task({ id: 'old', location: loc(green), done: true, doneBy: noa, doneAt: ago(3) });
  const g = T.groupByPlace([paint, toolbox, nowhere, old], yoav.uid, TODAY, undefined, new Set(['toolbox', 'nowhere']));
  assert.deepEqual(g.map((x) => x.key), ['p-shed', '_none']);
  assert.deepEqual(g[0].rows.map((t) => t.id), ['toolbox', 'paint'], 'the done one keeps its first place');
  assert.equal(g[0].open, 1);
  assert.deepEqual(g[1].rows.map((t) => t.id), ['nowhere'], 'a task without a place ticked here stays too');
  assert.equal(g[1].open, 0);
});

await test('places list (L3): most open everyday tasks first, then none, then routine places, event-only places last', () => {
  const ps = [place('a', 'אזור הדוכן'), place('b', 'חממה'), place('c', 'ליד הכניסה'), place('d', 'פינת החי'), place('e', 'מכולה'), place('f', 'הדוכן')];
  const open = [task({ location: loc(ps[2]) }), task({ location: loc(ps[2]) }), task({ location: loc(ps[1]) }), task({ location: loc(ps[4]) }), task({ location: loc(ps[4]) }), task({ location: loc(ps[0]), done: true }), task({ location: loc(ps[5]), eventId: 'ev' })];
  const order = T.sortPlaces(ps, open, [{ active: true, placeId: 'd' }, { active: false, placeId: 'a' }]).map((p) => p.id);
  assert.deepEqual(order, ['c', 'e', 'b', 'a', 'd', 'f']);
});

await test('by time: today (with overdue and mine first), this week, later, undated', () => {
  const ts = [
    task({ id: 'free-today', dueDate: TODAY, createdAt: ago(30) }),
    task({ id: 'mine-today', assignee: yoav, dueDate: TODAY, createdAt: ago(1) }),
    task({ id: 'overdue', dueDate: '2026-11-17' }),
    task({ id: 'week2', dueDate: '2026-11-25' }),
    task({ id: 'week1', dueDate: '2026-11-21' }),
    task({ id: 'later', dueDate: '2026-11-26' }),
    task({ id: 'none' }),
    task({ id: 'done', dueDate: TODAY, done: true, doneAt: ago(1) }),
  ];
  const g = T.groupByTime(ts, yoav.uid, TODAY);
  assert.deepEqual(g.map((x) => x.title), ['להיום', 'השבוע', 'בהמשך', 'בלי תאריך']);
  assert.equal(g[0].rows[0].id, 'mine-today');
  assert.ok(!g[0].rows.some((t) => t.id === 'done'));
  assert.deepEqual(g[1].rows.map((t) => t.id), ['week1', 'week2']);
});

await test('dates: end of the Israeli week is the coming Saturday', () => {
  assert.equal(T.addDays(TODAY, 1), '2026-11-20');
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(T.endOfWeek(TODAY), '2026-11-21'); // Thu -> Sat
  assert.equal(T.endOfWeek('2026-11-21'), '2026-11-21'); // Sat stays
  assert.equal(T.endOfWeek('2026-11-22'), '2026-11-28'); // Sun -> next Sat
});

await test('recurring templates: labels, saved days and the day they run', () => {
  assert.equal(T.daysLabel([]), 'כל יום');
  assert.equal(T.daysLabel([0, 1, 2, 3, 4, 5, 6]), 'כל יום');
  assert.equal(T.daysLabel([4, 0, 2]), 'א׳ ג׳ ה׳');
  assert.equal(T.templateMeta({ days: [], time: '06:30', managersOnly: false, assignee: beni }), 'כל יום · 06:30 · בני');
  assert.equal(T.templateMeta({ days: [0, 2, 4], time: '07:00', managersOnly: false, assignee: null }), 'א׳ ג׳ ה׳ · 07:00 · מי שפנוי');
  assert.equal(T.templateMeta({ days: [1], time: '', managersOnly: true, assignee: yoav }), 'ב׳ · מנהלים בלבד');
  assert.deepEqual(T.daysToSave([0, 1, 2, 3, 4, 5, 6]), []);
  assert.deepEqual(T.daysToSave([4, 2, 2, 0]), [0, 2, 4]);
  assert.equal(T.dueOn({ active: true, days: [] }, TODAY), true);
  assert.equal(T.dueOn({ active: true, days: [4] }, TODAY), true); // Thursday
  assert.equal(T.dueOn({ active: true, days: [0] }, TODAY), false);
  assert.equal(T.dueOn({ active: false, days: [] }, TODAY), false);
});

await test('places: meta, distance and the nearest saved place within 60 m', () => {
  const open = [task({ location: loc(green) }), task({ location: loc(green) }), task({ location: loc(gate), eventId: 'e1' })];
  assert.equal(T.placeMeta('p-green', open, [], []), '2 משימות פתוחות');
  assert.equal(T.placeMeta('p-gate', open, [], [{ id: 'e1', title: 'הפסטיבל' }]), 'לקראת הפסטיבל');
  assert.equal(T.placeMeta('p-gate', open, [], []), 'משימה אחת');
  assert.equal(T.placeMeta('p-shed', open, [{ id: 't', title: 'להשקות', active: true, placeId: 'p-shed' }], []), 'שגרה: להשקות');
  assert.equal(T.placeMeta('p-shed', open, [], []), 'אין משימות פתוחות');
  const d = T.distanceM(gate, green);
  assert.ok(d > 100 && d < 120, `about 111 m, got ${d}`);
  assert.equal(T.nearestPlace({ lat: 32.0001, lng: 35 }, [gate, green]).id, 'p-gate');
  assert.equal(T.nearestPlace({ lat: 32.0004, lng: 35 }, [gate, green]).id, 'p-gate', '44 m: within 60');
  assert.equal(T.nearestPlace({ lat: 32.0030, lng: 35 }, [gate, green, shed]), null, '111 m from the nearest: none');
  assert.equal(T.nearestPlace({ lat: 32, lng: 35 }, []), null);
});

await test('the add form understands places, shopping and urgency', () => {
  const places = [gate, green, shed, place('p-tree', 'העץ מאחורי הביתן')];
  assert.equal(T.suggestPlace('לתקן את הברז ליד החממה', places), 'p-green');
  assert.equal(T.suggestPlace('לנקות ליד הלול', places), null, '"ליד" alone is no place');
  assert.equal(T.suggestPlace('לסדר במכולה', places), 'p-shed');
  assert.equal(T.suggestPlace('להשקות את העץ', places), 'p-tree');
  assert.deepEqual(T.parseShopping('2 שקי מלט לגדר, דחוף'), { title: 'מלט לגדר', qty: '2 שקים', urgent: true, category: 'building' });
  assert.deepEqual(T.parseShopping('לקנות חלב'), { title: 'חלב', qty: '', urgent: false, category: 'super' });
  assert.deepEqual(T.parseShopping('3 מגרפות'), { title: 'מגרפות', qty: '3', urgent: false, category: null });
  assert.equal(T.parseShopping('דחופה הזמנה').urgent, false, 'only the whole word');
  assert.equal(T.guessKind('2 שקי מלט לגדר, דחוף'), 'shopping');
  assert.equal(T.guessKind('לקנות ברגים'), 'shopping');
  assert.equal(T.guessKind('לתקן את הברז ליד החממה'), 'task');
  assert.equal(T.guessKind('חלב'), 'shopping');
  assert.equal(T.guessKind('הדגל קרוע'), 'task');
  assert.deepEqual(T.parseTaskText('להחליף את הדגל, דחוף'), { title: 'להחליף את הדגל', urgent: true });
  assert.equal(T.fixLink(''), '');
  assert.equal(T.fixLink('ace.co.il/x'), 'https://ace.co.il/x');
  assert.equal(T.fixLink('http://a.b'), 'https://a.b');
  assert.equal(T.fixLink(' https://a.b '), 'https://a.b');
});

await test('presence (C4): v2 hours, the older text, all day and nothing', () => {
  assert.deepEqual(T.presenceHours({ time: '', from: '08:00', to: '13:00' }), { from: '08:00', to: '13:00' });
  assert.deepEqual(T.presenceHours({ time: '8:00–11:00' }), { from: '08:00', to: '11:00' });
  assert.equal(T.presenceHours({ time: '' }), null);
  assert.deepEqual(T.presenceOf([], '10:30'), { here: false, text: 'לא רשום היום', order: 3 });
  assert.deepEqual(T.presenceOf([{ time: '' }], '10:30'), { here: true, text: 'כל היום', order: 0 });
  assert.deepEqual(T.presenceOf([{ from: '08:00', to: '13:00' }], '10:30'), { here: true, text: 'עד 13:00', order: 0 });
  assert.deepEqual(T.presenceOf([{ from: '15:00', to: '18:00' }], '10:30'), { here: false, text: 'מגיע ב־15:00', order: 1 });
  assert.deepEqual(T.presenceOf([{ from: '15:00', to: '18:00' }], '10:30', true), { here: false, text: 'מגיעה ב־15:00', order: 1 });
  assert.deepEqual(T.presenceOf([{ time: '07:00–09:00' }], '10:30'), { here: false, text: 'היום עד 09:00', order: 2 });
  assert.equal(T.loadText(0), 'אין משימות היום'); assert.equal(T.loadText(1), 'משימה אחת היום'); assert.equal(T.loadText(3), '3 משימות היום');
});

await test('history (T6) and day end (C7)', () => {
  const done = [
    task({ id: 'y1', done: true, doneBy: yoav, doneAt: iso('2026-11-19T09:40:00+02:00'), templateId: 'x', donePhoto: 'p' }),
    task({ id: 'n1', done: true, doneBy: noa, doneAt: iso('2026-11-19T08:10:00+02:00'), donePhoto: 'p' }),
    task({ id: 'y2', done: true, doneBy: yoav, doneAt: iso('2026-11-19T07:00:00+02:00') }),
    task({ id: 'b1', done: true, doneBy: beni, doneAt: iso('2026-11-18T17:20:00+02:00') }),
    task({ id: 'o1', done: true, doneBy: beni, doneAt: iso('2026-11-16T09:00:00+02:00') }),
    task({ id: 'late', done: true, doneBy: noa, doneAt: iso('2026-11-18T23:30:00+02:00') }), // Israel date, not UTC
  ];
  const g = T.historyGroups(done, TODAY);
  assert.deepEqual(g.map((x) => x.title), ['היום', 'אתמול', 'שני 16.11']);
  assert.deepEqual(g[0].rows.map((t) => t.id), ['y1', 'n1', 'y2']);
  assert.deepEqual(g[1].rows.map((t) => t.id), ['late', 'b1']);
  assert.deepEqual(T.countsByPerson(done).map((c) => [c.name, c.n]), [['בני ביקש', 2], ['יואב כהן', 2], ['נועה לוי', 2]]);
  assert.equal(T.historyMeta(done[0]), 'יואב · 09:40 · שגרה');
  assert.equal(T.historyMeta(done[1]), 'נועה · 08:10 · עם תמונה');
  assert.equal(T.matchesSearch(done[1], 'נועה'), true);
  assert.equal(T.matchesSearch(done[1], 'חממה'), false);
  assert.equal(T.matchesSearch(done[1], '  '), true);
  const open = [task({ assignee: yoav }), task({ assignee: yoav, dueDate: '2026-11-20' }), task({ assignee: yoav, dueDate: '2026-11-22' }), task({ assignee: noa })];
  const e = T.dayEnd(done.slice(0, 3), open, yoav.uid, TODAY);
  assert.deepEqual(e.mine.map((t) => t.id), ['y2', 'y1']);
  assert.equal(e.total, 3); assert.equal(e.waiting, 2);
  assert.equal(T.waitingText(0), 'מחר אין משימות שמחכות לך');
  assert.equal(T.waitingText(1), 'מחר מחכה לך משימה אחת');
  assert.equal(T.waitingText(2), 'מחר מחכות לך 2 משימות');
});

await test('timeline: from the activity log, or derived from the document', () => {
  const fmt = (s) => s.slice(11, 16);
  const t = task({ createdAt: '2026-11-19T06:00:00.000Z', assignee: yoav, takenAt: '2026-11-19T07:00:00.000Z', done: true, doneBy: yoav, doneAt: '2026-11-19T08:00:00.000Z' });
  assert.deepEqual(T.timeline(t, [], fmt), ['06:00 · בני יצר את המשימה', '07:00 · יואב לקח אותה', '08:00 · יואב סימן בוצע']);
  const acts = [
    { action: 'assigned', text: 'x ← נועה לוי', by: beni, at: '2026-11-19T07:30:00.000Z', subjectUid: noa.uid },
    { action: 'assigned', text: 'x ← יואב כהן', by: yoav, at: '2026-11-19T07:10:00.000Z', subjectUid: yoav.uid },
    { action: 'unknown', text: '', by: yoav, at: '2026-11-19T07:20:00.000Z' },
  ];
  assert.deepEqual(T.timeline(t, acts, fmt), ['06:00 · בני יצר את המשימה', '07:10 · יואב לקח אותה', '07:30 · בני העביר לנועה']);
});

await test('done: a free task becomes the doer\'s; undo clears it; routines stay unassigned', async () => {
  calls.length = 0;
  await T.setDone(yoav, task({ id: 'free' }), true);
  assert.deepEqual(calls[0], ['update', 'tasks', 'free', { done: true, doneBy: yoav, doneAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(), assignee: yoav }]);
  assert.equal(calls[1][3], 'done');
  calls.length = 0;
  await T.setDone(yoav, task({ id: 'r', templateId: 'tpl' }), true);
  assert.ok(!('assignee' in calls[0][3]));
  calls.length = 0;
  await T.setDone(yoav, task({ id: 'free', done: true }), false);
  assert.deepEqual(calls[0][3], { done: false, doneBy: null, doneAt: null, updatedAt: new Date(NOW).toISOString() });
  assert.equal(calls[1][3], 'undone');
  calls.length = 0;
  await T.doneWithPhoto(yoav, task({ id: 'p', assignee: yoav }), 'data:img', ' נקי ');
  assert.equal(calls[0][3].donePhoto, 'data:img'); assert.equal(calls[0][3].doneNote, 'נקי'); assert.equal(calls[0][3].done, true);
  assert.deepEqual(calls.filter((c) => c[0] === 'log').map((c) => c[3]), ['done', 'photo']);
});

await test('take, release and assign refuse with X1 text when the server moved on', async () => {
  const t = task({ id: 'tk' });
  globalThis.__server = { 'tasks/tk': { ...t } };
  calls.length = 0;
  await T.takeTask(yoav, t);
  assert.deepEqual(calls[0], ['tx.update', 'tasks', 'tk', { assignee: yoav, takenAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() }]);
  globalThis.__server = { 'tasks/tk': { ...t, assignee: noa } };
  await assert.rejects(T.takeTask(yoav, t), (e) => e.name === 'ConflictError' && e.message === 'לא נשמר. נועה לקחה את המשימה לפני רגע' && e.by.uid === noa.uid);
  assert.equal(T.takenText(yoav), 'לא נשמר. יואב לקח את המשימה לפני רגע');
  assert.equal(T.takenText(yoav, () => ({ gender: 'f' })), 'לא נשמר. יואב לקחה את המשימה לפני רגע', 'the profile wins over the name');
  globalThis.__server = { 'tasks/tk': { ...t, done: true } };
  await assert.rejects(T.takeTask(yoav, t), /כבר בוצעה/);
  globalThis.__server = {};
  await assert.rejects(T.takeTask(yoav, t), /כבר לא קיימת/);
  // release: staff only their own; a manager anyone's
  globalThis.__server = { 'tasks/tk': { ...t, assignee: noa } };
  await assert.rejects(T.releaseTask(yoav, t, false), /כבר על נועה/);
  calls.length = 0;
  await T.releaseTask(beni, t, true);
  assert.deepEqual(calls[0][3], { assignee: null, updatedAt: new Date(NOW).toISOString() });
  // assign: refused when someone else changed it since the screen opened, notifies the new person
  globalThis.__server = { 'tasks/tk': { ...t, assignee: noa } };
  await assert.rejects(T.assignTask(beni, t, yoav, null), /כבר על נועה/);
  calls.length = 0;
  await T.assignTask(beni, t, yoav, noa.uid);
  assert.equal(calls[0][3].assignee, yoav);
  const note = calls.find((c) => c[0] === 'notify');
  assert.deepEqual(note[1], [yoav.uid]); assert.equal(note[2].link, '/tasks/tk'); assert.equal(note[2].sub, 'בני העביר אליך');
  calls.length = 0;
  await T.assignTask(yoav, t, yoav, noa.uid);
  assert.ok(!calls.some((c) => c[0] === 'notify'), 'taking it yourself sends nothing');
});

await test('add / edit: tasks through the store, shopping through the shopping area, the task gets shoppingId', async () => {
  calls.length = 0;
  const id = await T.createTask(beni, { title: 'לתקן', note: '', location: null, dueDate: '', managersOnly: false, assignee: yoav, urgent: false });
  assert.equal(id, 'tasks-added');
  assert.equal(calls[0][0], 'addTask'); assert.deepEqual(calls[1][1], [yoav.uid]);
  calls.length = 0;
  await T.createTask(yoav, { title: 'לתקן', assignee: yoav });
  assert.ok(!calls.some((c) => c[0] === 'notify'));
  calls.length = 0;
  const sid = await T.createShopping(yoav, { title: ' מלט ', qty: '2 שקים', note: '', link: 'ace.co.il', category: 'building', urgent: true, photo: '' }, [], 'tk');
  assert.equal(sid, 'shopping-added');
  assert.deepEqual(calls[0], ['addShopItem', { title: 'מלט', qty: '2 שקים', note: '', link: 'https://ace.co.il', category: 'building', urgent: true, photo: undefined, taskId: 'tk' }]);
  assert.deepEqual(calls[1], ['update', 'tasks', 'tk', { shoppingId: 'shopping-added', updatedAt: new Date(NOW).toISOString() }]);
  assert.ok(!calls.some((c) => (c[0] === 'set' || c[0] === 'update') && c[1] === 'shopping'), 'the shopping collection is never written here');
  calls.length = 0;
  await T.updateShopping(yoav, { id: 's1', photo: 'old' }, { title: 'מלט', qty: ' 3 ', note: '', link: '', category: 'building', urgent: false, photo: 'new' });
  assert.equal(calls[0][0], 'editShopping'); assert.equal(calls[0][2].qty, '3'); assert.ok(!('photo' in calls[0][2]));
  assert.deepEqual(calls[1], ['setItemPhoto', 's1', 'new']);
});

await test('templates keep the old shape unless the new fields carry a value', async () => {
  const data = { title: ' להשקות ', note: '', days: [0, 1, 2, 3, 4, 5, 6], time: '07:00', active: true, managersOnly: false, assignee: null, placeId: '' };
  calls.length = 0;
  await T.saveTemplateV2(beni, data);
  const [op, col, , doc] = calls[0];
  assert.equal(op, 'set'); assert.equal(col, 'task_templates');
  assert.deepEqual(Object.keys(doc).sort(), ['active', 'createdAt', 'createdBy', 'days', 'managersOnly', 'note', 'time', 'title', 'updatedAt']);
  assert.deepEqual(doc.days, []); assert.equal(doc.title, 'להשקות');
  calls.length = 0;
  await T.saveTemplateV2(beni, { ...data, assignee: yoav, placeId: 'p-green', managersOnly: false }, { id: 'tpl1' });
  assert.equal(calls[0][0], 'update'); assert.equal(calls[0][3].assignee, yoav); assert.equal(calls[0][3].placeId, 'p-green');
  calls.length = 0;
  await T.saveTemplateV2(beni, { ...data, managersOnly: true, assignee: yoav }, { id: 'tpl1', assignee: yoav, placeId: 'p-green' });
  assert.equal(calls[0][3].assignee, null, 'managers-only clears the person'); assert.equal(calls[0][3].placeId, '');
});

await test('places: accuracy and photo only when they change', async () => {
  calls.length = 0;
  await T.createPlace(yoav, ' ליד הלול ', { lat: 32, lng: 35 });
  assert.deepEqual(Object.keys(calls[0][3]).sort(), ['createdAt', 'createdBy', 'lat', 'lng', 'name']);
  calls.length = 0;
  await T.createPlace(yoav, 'x', { lat: 32, lng: 35, accuracy: 4 });
  assert.equal(calls[0][3].accuracy, 4);
  calls.length = 0;
  await T.savePlace(yoav, { id: 'p1', name: 'a', lat: 1, lng: 1, accuracy: 4 }, { name: 'b ', lat: 2, lng: 2, accuracy: 4, photo: '' });
  assert.deepEqual(calls[0][3], { name: 'b', lat: 2, lng: 2 });
});

await test('restored: stale routine, overdue group, routine "עד HH:MM", no "ביקש" on routine rows', () => {
  const stale = task({ id: 'tpl_2026-11-18', templateId: 'tpl', dateKey: '2026-11-18', dueDate: '2026-11-18' });
  const todayInst = task({ id: 'tpl_2026-11-19', templateId: 'tpl', dateKey: TODAY, dueDate: TODAY });
  assert.equal(T.isStaleRoutine(stale, TODAY), true);
  assert.equal(T.isStaleRoutine(todayInst, TODAY), false);
  assert.equal(T.isStaleRoutine({ ...stale, done: true }, TODAY), false, 'a done one is history, not clutter');
  assert.equal(T.isStaleRoutine(task({ dueDate: '2026-11-10' }), TODAY), false, 'an ordinary overdue task stays');
  assert.equal(T.isOverdue(task({ dueDate: '2026-11-18' }), TODAY), true);
  assert.equal(T.isOverdue(task({ dueDate: TODAY }), TODAY), false);
  assert.equal(T.isOverdue(task({ dueDate: '2026-11-18', done: true }), TODAY), false);
  assert.equal(T.routineTime(todayInst, [{ id: 'tpl', time: '07:00' }]), '07:00');
  assert.equal(T.routineTime(task({}), [{ id: 'tpl', time: '07:00' }]), '');
  const o = (view, time) => ({ uid: yoav.uid, view, today: TODAY, now: NOW, time });
  // routine: the template's hour instead of a date, never "ביקש"
  assert.equal(T.rowMeta(todayInst, o('place', '07:00')), 'פנויה · עד 07:00');
  assert.equal(T.rowMeta({ ...todayInst, assignee: yoav }, o('mine', '07:00')), 'בלי מקום · עד 07:00');
  assert.equal(T.rowMeta({ ...todayInst, assignee: yoav }, o('place', '07:00')), 'עליך · עד 07:00');
  assert.equal(T.rowMeta({ ...todayInst, assignee: noa }, o('place', '07:00')), 'נועה · עד 07:00');
  assert.equal(T.rowMeta({ ...todayInst, assignee: noa }, o('place')), 'נועה');
  // late rows lead with the date
  assert.equal(T.rowMeta(task({ dueDate: '2026-11-18', location: loc(green) }), o('late')), 'אתמול · חממה · פנויה');
  assert.equal(T.rowMeta(task({ dueDate: '2026-11-18', assignee: yoav }), o('late')), 'אתמול · עליך');
  // groupByTime with late: "באיחור" first, today without the overdue ones
  const ts = [task({ id: 'od', dueDate: '2026-11-17' }), task({ id: 'td', dueDate: TODAY }), task({ id: 'none' })];
  const g = T.groupByTime(ts, yoav.uid, TODAY, true);
  assert.deepEqual(g.map((x) => x.title), ['באיחור', 'להיום', 'בלי תאריך']);
  assert.deepEqual(g[0].rows.map((t) => t.id), ['od']);
  assert.deepEqual(T.groupByTime(ts, yoav.uid, TODAY).map((x) => x.title), ['להיום', 'בלי תאריך'], 'default keeps the T2 grouping');
  const [late, rest] = T.splitOverdue(ts, yoav.uid, TODAY);
  assert.deepEqual(late.map((t) => t.id), ['od']); assert.deepEqual(rest.map((t) => t.id).sort(), ['none', 'td']);
});

await test('restored: edit and assign permissions follow the rules', () => {
  const mineCreated = task({ createdBy: yoav });
  const routine = task({ createdBy: yoav, templateId: 'tpl', dateKey: TODAY });
  assert.equal(T.canEditTask(mineCreated, yoav.uid, false), true);
  assert.equal(T.canEditTask(routine, yoav.uid, false), false, 'a routine instance is the manager\'s');
  assert.equal(T.canEditTask(task({}), yoav.uid, false), false);
  assert.equal(T.canEditTask(routine, beni.uid, true), true);
  // a volunteer who did not create it
  const free = task({});
  assert.equal(T.canAssignTo(free, yoav.uid, false, yoav.uid), true);
  assert.equal(T.canAssignTo(free, yoav.uid, false, noa.uid), false);
  assert.equal(T.canAssignTo({ ...free, done: true }, yoav.uid, false, yoav.uid), false);
  const onMe = task({ assignee: yoav });
  assert.equal(T.canAssignTo(onMe, yoav.uid, false, noa.uid), true);
  assert.equal(T.canAssignTo(onMe, yoav.uid, false, null), true);
  const onNoa = task({ assignee: noa });
  assert.equal(T.canAssignTo(onNoa, yoav.uid, false, yoav.uid), false);
  assert.equal(T.canAssignTo(onNoa, yoav.uid, false, null), false);
  assert.equal(T.canAssignTo(onNoa, yoav.uid, false, noa.uid), true, 'no change is always fine');
  // manager or creator: anyone
  assert.equal(T.canAssignTo(onNoa, beni.uid, true, yoav.uid), true);
  assert.equal(T.canAssignTo(task({ assignee: noa, createdBy: yoav }), yoav.uid, false, null), true);
  assert.equal(T.canMoveOthers(onNoa, yoav.uid, false), false);
  assert.equal(T.canMoveOthers(onNoa, beni.uid, true), true);
});

await test('restored: history search reads the done note; done details write only what changed', async () => {
  const t = task({ id: 'dn', done: true, doneBy: yoav, doneAt: ago(1), doneNote: 'חסר מברג פיליפס' });
  assert.equal(T.matchesSearch(t, 'מברג'), true);
  calls.length = 0;
  await T.setDoneDetails(yoav, t, { doneNote: '  הכל במקום  ' });
  assert.equal(calls[0][0], 'update'); assert.deepEqual(Object.keys(calls[0][3]).sort(), ['doneNote', 'updatedAt']);
  assert.equal(calls[0][3].doneNote, 'הכל במקום');
  assert.equal(calls[1][3], 'note');
  calls.length = 0;
  await T.setDoneDetails(yoav, t, { donePhoto: 'https://x/p.jpg' });
  assert.deepEqual(Object.keys(calls[0][3]).sort(), ['donePhoto', 'updatedAt']);
  assert.equal(calls[1][3], 'photo');
});

console.log(`\n${n} tests passed`);
