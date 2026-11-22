// v2 shopping data helpers (src/app/v2/data/shopping.ts): pure logic and the writes they make.
// Bundles the real module with db / activity / demo store / notify replaced by recorders and the real clock frozen.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const stub = {
  name: 'stub-shopping',
  setup(b) {
    const map = { react: 'react', '../../kit': 'kit', '../../db': 'db', '../../activity': 'activity', '../../demo/store': 'demo', './notify': 'notify' };
    b.onResolve({ filter: /^(react|\.\.\/\.\.\/kit|\.\.\/\.\.\/db|\.\.\/\.\.\/activity|\.\.\/\.\.\/demo\/store|\.\/notify)$/ }, (a) => ({ path: map[a.path], namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents: {
        react: 'export const useMemo = (f) => f(); export const useSyncExternalStore = (s, g) => g();',
        db: `
          const calls = () => globalThis.__calls;
          let n = 0;
          export const newId = (col) => col + '-new' + (++n);
          export const useList = () => ({ items: [], loading: false }), useDoc = () => ({ item: null, loading: false });
          export const write = {
            set: async (col, id, data) => { calls().push(['set', col, id, data]); },
            update: async (col, id, data) => { calls().push(['update', col, id, data]); },
            remove: async (col, id) => { calls().push(['remove', col, id]); },
            batch: async (ops) => { calls().push(['batch', ops]); },
          };`,
        activity: `export const logActivity = (actor, kind, refId, action, text) => { globalThis.__calls.push(['log', kind, refId, action, text]); };
                   export const useActivityFor = () => ({ items: [] });`,
        kit: `const hidden = new Map();
              export const deferDelete = (id, run, ms) => { hidden.set(id, setTimeout(() => { hidden.delete(id); run(); }, ms)); return () => { clearTimeout(hidden.get(id)); hidden.delete(id); }; };
              export const isHidden = (id) => hidden.has(id), useHiddenVersion = () => 0;`,
        demo: 'export const useDemo = () => ({ on: false }), useDemoStates = () => [];',
        notify: 'export const notify = async (uids, n) => { globalThis.__calls.push(["notify", uids, n]); };',
      }[a.path],
      loader: 'js',
    }));
  },
};
await build({ entryPoints: ['src/app/v2/data/shopping.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.build/v2-shopping-test.mjs', plugins: [stub], logLevel: 'silent' });
globalThis.__calls = [];
const calls = globalThis.__calls;
const S = await import('../.build/v2-shopping-test.mjs?' + Date.now());

// ---- fixtures
const yoav = { uid: 'u-yoav', name: 'יואב כהן' };
const dana = { uid: 'u-dana', name: 'דנה לוי' };
const noa = { uid: 'u-noa', name: 'נועה' };
let seq = 0;
const item = (o) => ({
  id: 'i' + (++seq), title: 'פריט', qty: '', note: '', link: '', category: 'super', urgent: false,
  createdBy: dana, createdAt: '2026-11-19T07:00:00.000Z', bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: '2026-11-19T07:00:00.000Z', ...o,
});
const bought = (title, at, o = {}) => item({ title, bought: true, createdBy: { uid: 'u-beni', name: 'בני' }, boughtBy: noa, boughtAt: at, ...o });

// ---- names and Hebrew verbs
assert.equal(S.first('דנה אברהם'), 'דנה');
assert.equal(S.first('  '), '');
assert.equal(S.isFem('דנה'), true, 'ends with ה');
assert.equal(S.isFem('נועה'), true);
assert.equal(S.isFem('יואב'), false);
assert.equal(S.isFem('אליה'), false, 'known male name ending with ה');
assert.equal(S.isFem('מיכל'), true, 'known female name');
assert.equal(S.isFem('דנה', { gender: 'm' }), false, 'Profile.gender wins');
assert.equal(S.g('נועה לוי', 'קנה', 'קנתה'), 'קנתה');
assert.equal(S.g('בני', 'קנה', 'קנתה'), 'קנה');

// ---- lists
assert.equal(S.catOfKey('wish'), 'giveaway');
assert.equal(S.catOfKey('nope'), 'super');
assert.equal(S.keyOfCat('giveaway'), 'wish');
assert.equal(S.listLabel('building'), 'בניין');
assert.equal(S.addPlaceholder('super'), 'להוסיף לסופר');
assert.equal(S.addPlaceholder('giveaway'), 'מה מחפשים?');
assert.deepEqual(['super', 'online', 'giveaway'].map(S.doneWord), ['נקנה', 'הוזמן', 'נמצא']);

// ---- quantities
assert.deepEqual(S.parseQty('6 קרטונים'), { n: 6, unit: 'קרטונים' });
assert.deepEqual(S.parseQty('קופסה'), { n: 1, unit: 'קופסה' });
assert.deepEqual(S.parseQty(''), { n: 1, unit: '' });
assert.equal(S.stepQty('6 קרטונים', 1), '7 קרטונים');
assert.equal(S.stepQty('1 ק"ג', -1), '1 ק"ג', 'never below 1');
assert.equal(S.stepQty('', 1), '2');
assert.equal(S.stepQty('קופסה', 1), '2 קופסה');
assert.equal(S.qtyText(''), '1');

// ---- open list: urgent first, then newest; giveaway is not counted as "to buy"
const a = item({ title: 'ישן', createdAt: '2026-11-10T08:00:00.000Z' });
const b = item({ title: 'חדש', createdAt: '2026-11-19T08:00:00.000Z' });
const c = item({ title: 'דחוף', urgent: true, createdAt: '2026-11-01T08:00:00.000Z' });
const w = item({ title: 'עגלה', category: 'giveaway' });
const x = item({ title: 'בניין', category: 'building' });
assert.deepEqual(S.openOf([a, b, c, w, x], 'super').map((i) => i.title), ['דחוף', 'חדש', 'ישן']);
assert.equal(S.openToBuy([a, b, c, w, x]), 4);
assert.deepEqual([0, 1, 7].map(S.openOverline), ['אין פריטים פתוחים', 'פריט פתוח אחד', '7 פריטים פתוחים']);

// ---- done today / this month (Israel date of boughtAt)
const today = '2026-11-19';
const hist = [
  bought('ביצים', '2026-11-19T06:40:00.000Z', { qty: '2 תבניות' }),
  bought('לחם', '2026-11-18T22:30:00.000Z'), // 00:30 on the 19th in Israel
  bought('לחם', '2026-11-15T09:00:00.000Z'),
  bought('לחם', '2026-11-12T09:00:00.000Z'),
  bought('מזון לעיזים', '2026-11-17T08:00:00.000Z'),
  bought('ביצים', '2026-11-10T08:00:00.000Z'),
  bought('חלב 3%', '2026-11-15T09:30:00.000Z', { qty: '6 קרטונים', boughtBy: noa }),
  bought('מלט', '2026-11-16T09:00:00.000Z', { category: 'building', boughtBy: dana }),
  bought('עגלת יד', '2026-11-05T09:00:00.000Z', { category: 'giveaway' }),
  bought('שולחן', '2026-10-28T09:00:00.000Z', { category: 'giveaway' }),
];
assert.deepEqual(S.doneToday(hist, 'super', today).map((i) => i.title), ['ביצים', 'לחם'], 'newest first, Israel day');
assert.deepEqual(S.doneThisMonth(hist, 'giveaway', today).map((i) => i.title), ['עגלת יד']);

// ---- suggestions: most often, then most recent; nothing already open
assert.deepEqual(S.suggestions(hist, [], 'super').map((s) => s.title), ['לחם', 'ביצים', 'מזון לעיזים'], 'ties go to the most recent');
assert.deepEqual(S.suggestions(hist, [item({ title: ' לחם ' })], 'super').map((s) => s.title), ['ביצים', 'מזון לעיזים', 'חלב 3%'], 'an open item is not suggested (spaces ignored)');
assert.equal(S.suggestions(hist, [], 'super').find((s) => s.title === 'ביצים').qty, '2 תבניות', 'the latest qty comes along');
assert.deepEqual(S.suggestions(hist, [], 'building').map((s) => s.title), ['מלט']);
assert.equal(S.SUGGESTED, 5);
assert.deepEqual(S.suggestions(hist, [], 'super', S.SUGGESTED).map((s) => s.title), ['לחם', 'ביצים', 'מזון לעיזים', 'חלב 3%'], 'up to five');
assert.deepEqual(S.suggestions(hist, [], 'giveaway', S.SUGGESTED).map((s) => s.title), ['עגלת יד', 'שולחן'], 'the מחפשים list has its usual items too');

// ---- trips
const H = 3600_000;
const now = Date.parse('2026-11-28T15:20:00.000Z');
const trip = { id: 't1', by: yoav, list: 'super', startedAt: '2026-11-28T15:02:00.000Z', closedAt: null, bought: [], missing: [] };
const stale = { ...trip, id: 't0', startedAt: '2026-11-28T05:00:00.000Z' };
const closed = { ...trip, id: 'tc', startedAt: '2026-11-27T10:00:00.000Z', closedAt: '2026-11-27T10:40:00.000Z' };
const others = { ...trip, id: 'td', by: dana };
assert.equal(S.isTripOpen(trip, now), true);
assert.equal(S.isTripOpen(stale, now), false, `older than ${S.TRIP_MAX_HOURS} hours is over`);
assert.equal(S.isTripOpen(trip, Date.parse(trip.startedAt) + 9 * H), false);
assert.equal(S.activeTripOf([stale, closed, others, trip], yoav.uid, now).id, 't1');
assert.equal(S.activeTripOf([stale, closed, others], yoav.uid, now), null, 'only my trips, only open ones');
assert.equal(S.lastClosedTripOf([stale, closed, trip], yoav.uid).id, 'tc');
assert.equal(S.lastClosedTripOf([others], yoav.uid), null);

const milk = item({ title: 'חלב', urgent: true, createdAt: '2026-11-28T13:40:00.000Z' });
const tahini = item({ title: 'טחינה', createdAt: '2026-11-28T15:14:00.000Z', createdBy: dana });
const mine = item({ title: 'שלי', createdAt: '2026-11-28T15:10:00.000Z', createdBy: yoav });
const coffee = item({ title: 'קפה', notAvailable: true, notAvailableAt: '2026-11-28T15:09:00.000Z', tripId: 't1' });
const coffeeOld = item({ title: 'קפה ישן', notAvailable: true, tripId: 'old-trip' });
const eggs = item({ title: 'ביצים', bought: true, boughtBy: yoav, boughtAt: '2026-11-28T15:08:00.000Z', tripId: 't1' });
const bags = item({ title: 'שקיות', bought: true, boughtBy: yoav, boughtAt: '2026-11-28T15:11:00.000Z', tripId: 't1' });
const before = item({ title: 'נקנה קודם', bought: true, boughtAt: '2026-11-26T10:00:00.000Z' });
const bld = item({ title: 'מסמרים', category: 'building' });
assert.equal(S.addedLive(tahini, trip), true, 'added by someone else after the start');
assert.equal(S.addedLive(mine, trip), false, 'the shopper adding is not "נוסף עכשיו"');
assert.equal(S.addedLive(milk, trip), false, 'added before the start');
const v = S.tripView(trip, [bags, coffee, tahini, milk, eggs, before, bld, coffeeOld]);
assert.deepEqual(v.open.map((i) => i.title), ['חלב', 'טחינה', 'קפה ישן'], 'urgent first; "אין" from another trip is open again');
assert.deepEqual(v.missing.map((i) => i.title), ['קפה']);
assert.deepEqual(v.bought.map((i) => i.title), ['ביצים', 'שקיות'], 'cart in the order bought');
assert.deepEqual([v.total, v.handled], [6, 3]);
assert.equal(S.tripView(trip, []).total, 0);

// mergeItems: one copy per id, the newer wins
const m1 = item({ id: 'same', title: 'ישן', updatedAt: '2026-11-28T10:00:00.000Z' });
const m2 = { ...m1, title: 'חדש', updatedAt: '2026-11-28T11:00:00.000Z' };
assert.deepEqual(S.mergeItems([m2], [m1]).map((i) => i.title), ['חדש']);
assert.deepEqual(S.mergeItems([m1], [m2]).map((i) => i.title), ['חדש']);

assert.equal(S.tripSummary(5, ['קפה שחור']), '5 נקנו · קפה שחור לא היה');
assert.equal(S.tripSummary(1, []), 'פריט אחד נקנה');
assert.equal(S.tripSummary(3, ['א', 'ב']), '3 נקנו · 2 לא היו');

// ---- history (S8)
assert.equal(S.weekStartKey('2026-11-19'), '2026-11-15', 'Thursday -> Sunday');
assert.equal(S.weekStartKey('2026-11-15'), '2026-11-15', 'Sunday is its own week start');
assert.equal(S.weekStartKey('2026-11-01'), '2026-11-01');
assert.equal(S.weekStartKey('2026-03-03'), '2026-03-01');
const groups = S.historyGroups(hist, 'all', '', today);
assert.deepEqual(groups.map((g) => [g.title, g.items.length]), [['היום', 2], ['השבוע', 4], ['קודם', 4]], 'found (giveaway) items are in the history');
assert.deepEqual(S.historyGroups(hist, 'giveaway', '', today).flatMap((g) => g.items.map((i) => i.title)), ['עגלת יד', 'שולחן'], 'the מחפשים filter');
assert.deepEqual(S.historyGroups(hist, 'building', '', today).map((g) => g.items.map((i) => i.title)), [['מלט']]);
assert.deepEqual(S.historyGroups(hist, 'all', 'דנה', today).flatMap((g) => g.items.map((i) => i.title)), ['מלט'], 'search by who bought');
assert.deepEqual(S.historyGroups(hist, 'all', 'לחם', today).flatMap((g) => g.items.length), [1, 1, 1]);
assert.deepEqual(S.historyGroups(hist, 'online', '', today), []);

// ---- item timeline (S4)
const f = { dayTime: (iso) => 'T' + iso.slice(11, 16), ddmm: (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7) };
const it = item({ title: 'חלב 3%', createdBy: dana, createdAt: '2026-11-19T07:12:00.000Z' });
const acts = [
  { action: 'added', by: dana, at: '2026-11-19T07:12:00.000Z', text: '' },
  { action: 'edited', by: dana, at: '2026-11-19T07:13:00.000Z', text: 'סימון דחוף' },
  { action: 'unavailable', by: yoav, at: '2026-11-19T07:20:00.000Z', text: '' },
  { action: 'photo', by: noa, at: '2026-11-19T07:15:00.000Z', text: '' },
  { action: 'weird', by: noa, at: '2026-11-19T07:16:00.000Z', text: '' },
];
assert.deepEqual(S.timeline(it, acts, hist, f), [
  'T07:12 · דנה הוסיפה לרשימה',
  'T07:13 · דנה סימנה דחוף',
  'T07:15 · נועה הוסיפה תמונה',
  'T07:20 · יואב סימן שלא היה במדף',
  'נקנה בפעם הקודמת ב־15.11 · נועה',
]);
const old = item({ title: 'פריט ישן', createdBy: undefined, createdAt: '' });
assert.deepEqual(S.timeline(old, [], [], f), [], 'an old doc without createdBy still renders');

// ---- writes
const actor = yoav;
const team = [
  { uid: 'u-yoav', role: 'staff', status: 'active' }, { uid: 'u-dana', role: 'manager', status: 'active' },
  { uid: 'u-guest', role: 'guest', status: 'active' }, { uid: 'u-gone', role: 'staff', status: 'blocked' },
];
assert.deepEqual(S.teamUids(team), ['u-yoav', 'u-dana']);

calls.length = 0;
const id = await S.addShopItem(actor, { title: ' סוכר ', qty: '2 ק"ג', category: 'super', urgent: true }, team);
const [set] = calls.filter((c) => c[0] === 'set');
assert.equal(set[1], 'shopping'); assert.equal(set[2], id);
assert.deepEqual(Object.keys(set[3]).sort(), ['bought', 'boughtAt', 'boughtBy', 'category', 'createdAt', 'createdBy', 'expireAt', 'link', 'note', 'qty', 'title', 'updatedAt', 'urgent'].sort(), 'a plain add keeps the old shape');
assert.equal(set[3].title, 'סוכר');
assert.ok(calls.some((c) => c[0] === 'log' && c[3] === 'added'));
const urgent = calls.find((c) => c[0] === 'notify');
assert.equal(urgent[2].kind, 'urgent'); assert.equal(urgent[2].title, 'דחוף לכולם');

calls.length = 0;
await S.addShopItem(actor, { title: 'מפות', category: 'super', taskId: 'task-1' });
assert.equal(calls.find((c) => c[0] === 'set')[3].taskId, 'task-1');
assert.ok(!calls.some((c) => c[0] === 'notify'), 'not urgent: nobody is told');

calls.length = 0;
await S.setItemBought(actor, milk, true);
let up = calls.find((c) => c[0] === 'update')[3];
assert.equal(up.bought, true); assert.equal(up.boughtBy, actor); assert.ok(!('tripId' in up), 'outside a trip: the old shape');
assert.equal(calls.find((c) => c[0] === 'log')[3], 'bought');

calls.length = 0;
await S.setItemBought(actor, coffee, true, trip);
up = calls.find((c) => c[0] === 'update')[3];
assert.equal(up.tripId, 't1'); assert.equal(up.notAvailable, false, 'bought after all clears "אין"');

calls.length = 0;
await S.setItemBought(actor, w, true);
assert.equal(calls.find((c) => c[0] === 'log')[3], 'found');

calls.length = 0;
await S.setItemBought(actor, eggs, false);
up = calls.find((c) => c[0] === 'update')[3];
assert.deepEqual([up.bought, up.boughtBy, up.boughtAt, up.expireAt], [false, null, null, null]);

calls.length = 0;
await S.setItemMissing(actor, milk, trip, true);
up = calls.find((c) => c[0] === 'update')[3];
assert.deepEqual([up.notAvailable, up.tripId], [true, 't1']);
assert.equal(calls.find((c) => c[0] === 'log')[3], 'unavailable');

calls.length = 0;
assert.equal(await S.startTrip(actor, 'super', [trip], team), 't1', 'my open trip resumes');
assert.equal(calls.length, 0, 'resuming writes nothing and tells nobody');

calls.length = 0;
const forgotten = { ...trip, id: 'tf', startedAt: '2026-01-01T08:00:00.000Z' };
const nid = await S.startTrip(actor, 'super', [forgotten, others], team);
const ops = calls.find((c) => c[0] === 'batch')[1];
assert.deepEqual(ops.map((o) => [o.op, o.id]), [['update', 'tf'], ['set', nid]], 'my forgotten trip is closed, the new one opened; Dana\'s is not touched');
assert.equal(ops[1].data.closedAt, null);
const tn = calls.find((c) => c[0] === 'notify')[2];
assert.equal(tn.kind, 'trip'); assert.equal(tn.title, 'יואב יוצא לסופר עכשיו'); assert.equal(tn.action.kind, 'addToTrip');

calls.length = 0;
await S.closeTrip(actor, trip, v, team);
up = calls.find((c) => c[0] === 'update');
assert.equal(up[1], 'shopping_trips');
assert.deepEqual([up[3].bought, up[3].missing], [[eggs.id, bags.id], [coffee.id]]);
const cn = calls.find((c) => c[0] === 'notify')[2];
assert.equal(cn.title, 'הקנייה בסופר נסגרה'); assert.equal(cn.sub, '2 נקנו · קפה לא היה'); assert.equal(cn.push, false);

calls.length = 0;
await S.reopenTrip(trip);
assert.deepEqual(calls[0], ['update', 'shopping_trips', 't1', { closedAt: null }]);

calls.length = 0;
await S.againShopItem(actor, bought('לחם', '2026-11-15T09:00:00.000Z', { qty: '2' }));
const again = calls.find((c) => c[0] === 'set')[3];
assert.deepEqual([again.title, again.qty, again.bought, again.createdBy], ['לחם', '2', false, actor]);

// delete waits for the undo window: undo writes nothing (no re-create of someone else's item)
calls.length = 0;
const undo = S.deleteShopItem(actor, milk, 20);
undo();
await new Promise((r) => setTimeout(r, 40));
assert.equal(calls.length, 0, 'undone in time: nothing written');
S.deleteShopItem(actor, milk, 20);
assert.equal(calls.length, 0, 'not deleted yet');
await new Promise((r) => setTimeout(r, 40));
assert.deepEqual(calls.map((c) => c[0] + ':' + (c[3] || c[1])), ['remove:shopping', 'log:deleted']);

console.log('v2 shopping: all checks passed');
