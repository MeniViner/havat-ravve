// Farm area (v2): unit tests of the pure data helpers in src/app/v2/screens/farm/logic.ts.
// Bundles logic.ts for node with esbuild (no React, no Firestore) and checks the month grid, presence sums,
// old calendar documents, Israel times, the feed and the F4 save plan. Run: node tests/v2-farm.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

process.env.TZ = 'UTC'; // the helpers must not depend on the machine's zone
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v2-farm-'));
const out = path.join(dir, 'logic.mjs');
await build({ stdin: { contents: "export * from './src/app/v2/screens/farm/logic'; export * from './src/app/v2/screens/farm/staffing'", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const L = await import(out);
await fs.rm(dir, { recursive: true, force: true });

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`PASS: ${name}`); };

const item = (o) => ({ id: o.id || Math.random().toString(36).slice(2), ownerUid: '', ownerName: '', title: '', date: '2026-11-19', time: '', kind: 'presence', refId: '', ...o });
const pres = (uid, name, date, from, to, extra = {}) => item({ ownerUid: uid, ownerName: name, title: `${name.split(' ')[0]} בחווה`, date, from, to, time: L.timeText({ from, to }), ...extra });

test('staffing summary merges overlapping periods, preserves a second visit and hides private shifts', () => {
  const date='2026-11-19';
  const shifts=[
    pres('m','תמר',date,'07:00','15:00'), pres('v','נטע',date,'08:00','12:00'),
    pres('v','נטע',date,'09:00','10:00'), pres('v','נטע',date,'14:00','17:00'),
    pres('v2','עומר',date,'09:00','11:00'), pres('m2','גל',date,'11:00','16:00',{audience:'managers'}),
  ];
  const profiles=new Map([['m',{role:'owner'}],['m2',{role:'manager'}],['v',{role:'staff'}],['v2',{role:'staff'}]]);
  const report=L.staffingSummary(shifts,date,630,profiles,true);
  assert.equal(report.current.length,3);
  assert.deepEqual(report.next.map(e=>[e.person.uid,e.arriving]).sort(),[['m2',true],['v2',false]]);
  assert.deepEqual(report.gap,{start:720,end:840});
  const publicReport=L.staffingSummary(shifts,date,630,profiles,false);
  assert(!publicReport.people.some(p=>p.uid==='m2'));
  assert.deepEqual(publicReport.next.map(e=>e.person.uid),['v2']);
  assert.equal(L.plannedAt(publicReport.people,840).filter(p=>p.uid==='v').length,1);
});

test('normTime reads loose hour input and refuses non-times', () => {
  assert.equal(L.normTime('9'), '09:00');
  assert.equal(L.normTime('930'), '09:30');
  assert.equal(L.normTime('9:30'), '09:30');
  assert.equal(L.normTime('9.30'), '09:30');
  assert.equal(L.normTime(' 14:00 '), '14:00');
  assert.equal(L.normTime('24:00'), '');
  assert.equal(L.normTime('12:60'), '');
  assert.equal(L.normTime('שקיעה'), '');
  assert.equal(L.normTime(''), '');
});

test('old calendar time text keeps loading (all day, range, start only, free text)', () => {
  assert.deepEqual(L.parseLegacyTime(''), { from: '', to: '' });
  assert.deepEqual(L.parseLegacyTime('08:00–13:00'), { from: '08:00', to: '13:00' });
  assert.deepEqual(L.parseLegacyTime('8:00-13:00'), { from: '08:00', to: '13:00' });
  assert.deepEqual(L.parseLegacyTime('11:00'), { from: '11:00', to: '' });
  assert.deepEqual(L.parseLegacyTime('שקיעה'), { from: '', to: '' });
  // v2 fields win over the old text; an old document has only `time`
  assert.deepEqual(L.hoursOf({ time: '08:00–13:00' }), { from: '08:00', to: '13:00' });
  assert.deepEqual(L.hoursOf({ time: '08:00–13:00', from: '09:00', to: '' }), { from: '09:00', to: '' });
  assert.deepEqual(L.hoursOf({ time: '', from: '', to: '' }), { from: '', to: '' });
});

test('timeText writes the old field within the rules limit of 11 characters', () => {
  assert.equal(L.timeText({ from: '08:00', to: '13:00' }), '08:00–13:00');
  assert.equal(L.timeText({ from: '08:00', to: '13:00' }).length, 11);
  assert.equal(L.timeText({ from: '12:00', to: '' }), '12:00');
  assert.equal(L.timeText({ from: '', to: '13:00' }), '–13:00');
  assert.equal(L.timeText({ from: '', to: '' }), '');
});

test('hours labels and validation', () => {
  assert.equal(L.labelOf({ from: '', to: '' }), 'allDay');
  assert.equal(L.labelOf({ from: '08:00', to: '13:00' }), 'morning');
  assert.equal(L.labelOf({ from: '13:00', to: '18:00' }), 'afternoon');
  assert.equal(L.labelOf({ from: '09:00', to: '14:00' }), 'other');
  assert.equal(L.hoursValid({ from: '', to: '' }), true);
  assert.equal(L.hoursValid({ from: '09:00', to: '' }), true);
  assert.equal(L.hoursValid({ from: '14:00', to: '09:00' }), false);
  assert.equal(L.hoursValid({ from: '09:00', to: '09:00' }), false);
  assert.equal(L.hoursValid({ from: '9:5', to: '' }), false);
});

test('isPresence counts kind presence and the old manual "<first name> בחווה"', () => {
  assert.equal(L.isPresence(item({ kind: 'presence', title: 'x' })), true);
  assert.equal(L.isPresence(item({ kind: 'manual', ownerName: 'בני רווה', title: 'בני בחווה' })), true);
  assert.equal(L.isPresence(item({ kind: 'manual', ownerName: 'בני רווה', title: 'ספק מגיע' })), false);
  assert.equal(L.isPresence(item({ kind: 'event', ownerName: 'בני רווה', title: 'בני בחווה' })), false);
});

test('monthGrid: Sunday first, padded to whole weeks', () => {
  const nov = L.monthGrid('2026-11-19'); // 1 Nov 2026 is a Sunday
  assert.equal(nov.length, 35);
  assert.equal(nov[0], '2026-11-01');
  assert.equal(nov[29], '2026-11-30');
  assert.deepEqual(nov.slice(30), [null, null, null, null, null]);
  const feb = L.monthGrid('2026-02-10'); // 1 Feb 2026 is a Sunday, 28 days
  assert.equal(feb.length, 28);
  const dec = L.monthGrid('2026-12-05'); // 1 Dec 2026 is a Tuesday
  assert.deepEqual(dec.slice(0, 3), [null, null, '2026-12-01']);
  assert.equal(dec.length % 7, 0);
  assert.equal(dec.filter(Boolean).length, 31);
  assert.equal(L.monthEnd('2028-02-03'), '2028-02-29');
  assert.equal(L.shiftMonth('2026-12-31', 1), '2027-01-01');
  assert.equal(L.shiftMonth('2026-01-31', -1), '2025-12-01');
});

test('week days run Sunday to Saturday', () => {
  assert.deepEqual(L.weekDays('2026-11-19'), ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
  assert.equal(L.weekdayOf('2026-11-19'), 4);
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(L.nextDays('2026-11-29', 3), ['2026-11-29', '2026-11-30', '2026-12-01']);
});

const DAY = [
  pres('beni', 'בני רווה', '2026-11-19', '', ''),
  pres('noa', 'נועה שחר', '2026-11-19', '09:00', '14:00'),
  pres('yoav', 'יואב לוי', '2026-11-19', '08:00', '13:00'),
  pres('dana', 'דנה כהן', '2026-11-19', '15:00', '19:00'),
  pres('roi', 'רועי בר', '2026-11-19', '06:00', '08:00'),
  // the same person twice in a day still counts once
  pres('noa', 'נועה שחר', '2026-11-19', '16:00', '18:00'),
  // an old manual entry counts too
  item({ kind: 'manual', ownerUid: 'eliya', ownerName: 'אליה ט', title: 'אליה בחווה', date: '2026-11-20', time: '' }),
  item({ kind: 'manual', ownerUid: 'eliya', ownerName: 'אליה ט', title: 'אליה בחווה', date: '2026-11-20', time: '10:00' }),
  item({ kind: 'manual', ownerUid: 'beni', ownerName: 'בני רווה', title: 'ספק מגיע', date: '2026-11-20', time: '11:00' }),
];
const at = (hhmm) => L.minutes(hhmm);

test('countsByDay counts each person once a day, old entries included, other items not', () => {
  assert.deepEqual(L.countsByDay(DAY, ['2026-11-19', '2026-11-20', '2026-11-21']), [5, 1, 0]);
});

test('dayEntries: one line per person, the stretch that holds now, else the next one', () => {
  const e = L.dayEntries(DAY, '2026-11-19', at('10:30'));
  assert.equal(e.length, 5);
  const noa = e.find((x) => x.uid === 'noa');
  assert.deepEqual([noa.hours, noa.status], [{ from: '09:00', to: '14:00' }, 'now']);
  const noaLate = L.dayEntries(DAY, '2026-11-19', at('15:00')).find((x) => x.uid === 'noa');
  assert.deepEqual([noaLate.hours.from, noaLate.status], ['16:00', 'later']);
  const noaGone = L.dayEntries(DAY, '2026-11-19', at('19:00')).find((x) => x.uid === 'noa');
  assert.deepEqual([noaGone.hours.from, noaGone.status], ['16:00', 'past']);
});

test('whoIsHere: now (all day first, then by leaving), later by arrival', () => {
  const w = L.whoIsHere(DAY, '2026-11-19', at('10:30'));
  assert.deepEqual(w.now.map((x) => x.uid), ['beni', 'noa', 'yoav']);
  assert.deepEqual(w.later.map((x) => x.uid), ['dana']);
  const order = L.dayPeople(DAY, '2026-11-19', '2026-11-19', at('10:30')).map((x) => x.uid);
  assert.deepEqual(order, ['beni', 'noa', 'yoav', 'dana', 'roi']); // F2/F3 today: as F1, then who already left
  const other = L.dayPeople(DAY, '2026-11-19', '2026-11-18', -1).map((x) => x.uid);
  assert.deepEqual(other, ['beni', 'roi', 'yoav', 'noa', 'dana']); // another day: all day, then by arrival
});

test('presenceOf finds old and new entries of one person on one day', () => {
  assert.equal(L.presenceOf(DAY, 'eliya', '2026-11-20').length, 2);
  assert.equal(L.presenceOf(DAY, 'beni', '2026-11-20').length, 0);
});

test('bars: month mark width, week bar heights, axis spans', () => {
  assert.equal(L.barWidth(0), 0);
  assert.equal(L.barWidth(2), 8);
  assert.equal(L.barWidth(4), 14);
  assert.equal(L.barWidth(20), 30);
  assert.deepEqual(L.barHeights([2, 3, 0, 4]), [14, 21, 2, 28]);
  assert.deepEqual(L.barHeights([3, 12, 0]), [11, 42, 2]); // scaled to 42px
  assert.deepEqual(L.barSpan({ from: '', to: '' }), { start: 0, width: 100 });
  assert.deepEqual(L.barSpan({ from: '13:00', to: '20:00' }), { start: 50, width: 50 });
  assert.deepEqual(L.barSpan({ from: '05:00', to: '06:00' }), { start: 0, width: 2 }); // before the axis: a sliver
  assert.equal(L.axisPct('10:30'), 32.142857142857146);
});

test('israelIso and remindAt follow Israel winter and summer time', () => {
  assert.equal(L.israelIso('2026-11-19', '10:30'), '2026-11-19T08:30:00.000Z'); // winter, UTC+2
  assert.equal(L.israelIso('2026-07-01', '10:30'), '2026-07-01T07:30:00.000Z'); // summer, UTC+3
  assert.equal(L.israelIso('2026-11-19', '00:00'), '2026-11-18T22:00:00.000Z');
  assert.equal(L.remindAt('2026-11-23', '10:30'), '2026-11-23T07:30:00.000Z');
  assert.equal(L.remindAt('2026-07-01', '10:30'), '2026-07-01T06:30:00.000Z');
  assert.equal(L.remindAt('2026-11-23', ''), ''); // no start hour: no reminder time
});

test('Hebrew wording: and-joins, names line, save label, gender', () => {
  assert.equal(L.joinHe(['ביצים', 'לחם']), 'ביצים ולחם');
  assert.equal(L.joinHe(['ביצים', 'חלב', 'לחם']), 'ביצים, חלב ולחם');
  assert.equal(L.joinHe(['ביצים', '3%']), 'ביצים ו־3%');
  assert.equal(L.joinHe(['ביצים']), 'ביצים');
  assert.equal(L.namesLine(['בני רווה', 'נועה שחר', 'יואב', 'דנה', 'רועי', 'שירה']), 'בני, נועה, יואב, דנה ועוד 2');
  assert.equal(L.namesLine(['בני רווה', 'נועה שחר']), 'בני ונועה');
  assert.equal(L.saveLabel(1), 'שמירה · יום אחד');
  assert.equal(L.saveLabel(2), 'שמירה · יומיים');
  assert.equal(L.saveLabel(3), 'שמירה · 3 ימים');
  assert.equal(L.isFemale('נועה שחר'), true);
  assert.equal(L.isFemale('אורלי'), true);
  assert.equal(L.isFemale('דנית'), true);
  assert.equal(L.isFemale('יואב'), false);
  assert.equal(L.isFemale('אליה'), false);
  assert.equal(L.isFemale('נועה', 'm'), false); // an explicit profile field wins
  assert.equal(L.heroHours({ hours: { from: '15:00', to: '19:00' }, status: 'later' }, true), 'מגיעה ב־15:00');
  assert.equal(L.heroHours({ hours: { from: '', to: '' }, status: 'now' }, false), 'כל היום');
  assert.equal(L.entryText({ from: '08:00', to: '13:00' }), 'בוקר, עד 13:00');
  assert.equal(L.rangeText({ from: '12:00', to: '' }), 'מ־12:00');
  assert.equal(L.barLabel({ from: '09:00', to: '14:00' }, false), '09–14');
  assert.equal(L.barLabel({ from: '08:00', to: '13:00' }, true), 'עד 13:00');
});

const by = (uid, name) => ({ uid, name });
const ACTS = [
  { id: 'a1', kind: 'task', refId: 't1', action: 'done', text: 'רשתות צל', by: by('yoav', 'יואב לוי'), at: '2026-11-19T06:30:00.000Z' },
  { id: 'a2', kind: 'shopping', refId: 's1', action: 'bought', text: 'ביצים · 2 תבניות', by: by('noa', 'נועה שחר'), at: '2026-11-19T06:40:00.000Z' },
  { id: 'a3', kind: 'shopping', refId: 's2', action: 'bought', text: 'לחם', by: by('noa', 'נועה שחר'), at: '2026-11-19T06:45:00.000Z' },
  { id: 'a4', kind: 'shopping', refId: 's3', action: 'bought', text: 'חלב', by: by('noa', 'נועה שחר'), at: '2026-11-19T07:30:00.000Z' }, // 45 minutes later: a new line
  { id: 'a5', kind: 'shopping', refId: 's4', action: 'created', text: 'חלב 3% · 6 קרטונים', by: by('dana', 'דנה כהן'), at: '2026-11-19T07:12:00.000Z' },
  { id: 'a6', kind: 'task', refId: 't2', action: 'done', text: 'האכלת העיזים', by: by('noa', 'נועה שחר'), at: '2026-11-19T05:10:00.000Z' },
  { id: 'a7', kind: 'task', refId: 't2', action: 'done', text: 'האכלת העיזים', by: by('noa', 'נועה שחר'), at: '2026-11-19T05:20:00.000Z' }, // done again: one line
  { id: 'a8', kind: 'task', refId: 't3', action: 'assigned', text: 'לסמן חניות', by: by('beni', 'בני רווה'), at: '2026-11-19T07:00:00.000Z' }, // not feed-worthy
];

test('feedLines: newest first, purchases within 10 minutes merge, repeats collapse', () => {
  const lines = L.feedLines(ACTS);
  assert.deepEqual(lines.map((l) => [l.kind, l.refIds.join('+')]), [
    ['bought', 's3'], ['addedShop', 's4'], ['bought', 's2+s1'], ['done', 't1'], ['done', 't2'],
  ]);
  assert.equal(L.feedSentence(lines[2], true), 'נועה קנתה לחם וביצים');
  assert.equal(L.feedSentence(lines[1], true), 'דנה הוסיפה לקניות: חלב 3%');
  assert.equal(L.feedSentence(lines[3], false), 'יואב סיים: רשתות צל');
  assert.equal(L.titleOf('ביצים · 2 תבניות'), 'ביצים');
});

test('feedCounts: distinct tasks done, things bought, people who did something', () => {
  assert.deepEqual(L.feedCounts(ACTS), { done: 2, bought: 3, people: 3 });
  assert.deepEqual(L.feedCounts([]), { done: 0, bought: 0, people: 0 });
});

test('presencePlan updates my entry on a day I am registered, adds one elsewhere', () => {
  const items = [
    pres('yoav', 'יואב לוי', '2026-11-19', '08:00', '13:00', { id: 'p19' }),
    item({ id: 'old20', kind: 'manual', ownerUid: 'yoav', ownerName: 'יואב לוי', title: 'יואב בחווה', date: '2026-11-20', time: '' }),
    pres('noa', 'נועה שחר', '2026-11-23', '', '', { id: 'noa23' }),
  ];
  let k = 0;
  const plan = L.presencePlan(['2026-11-23', '2026-11-19', '2026-11-20', '2026-11-19'], items, by('yoav', 'יואב לוי'), { from: '09:00', to: '14:00' }, '  מביא את הטנדר ', () => `new${++k}`, '2026-11-19T08:30:00.000Z');
  assert.deepEqual(plan.map((p) => [p.op, p.id, p.date]), [['update', 'p19', '2026-11-19'], ['set', 'new1', '2026-11-20'], ['set', 'new2', '2026-11-23']]);
  assert.deepEqual(plan[0].data, { from: '09:00', to: '14:00', time: '09:00–14:00', note: 'מביא את הטנדר', title: 'יואב בחווה', date: '2026-11-19' });
  assert.deepEqual(plan[2].data, {
    from: '09:00', to: '14:00', time: '09:00–14:00', note: 'מביא את הטנדר', title: 'יואב בחווה', date: '2026-11-23',
    kind: 'presence', ownerUid: 'yoav', ownerName: 'יואב לוי', refId: '', createdAt: '2026-11-19T08:30:00.000Z',
  });
  // the new document holds only keys the calendar rules allow today plus from, to, note (the requested rules change)
  const allowed = new Set(['ownerUid', 'ownerName', 'title', 'date', 'time', 'kind', 'refId', 'createdAt', 'from', 'to', 'note']);
  assert.deepEqual(Object.keys(plan[2].data).filter((x) => !allowed.has(x)), []);
});

test('day picker: any date beyond the week shows next to it; "היום" shows only away from today', () => {
  assert.deepEqual(L.pickerDays('2026-11-19', ['2026-11-19']), L.nextDays('2026-11-19'));
  const far = L.pickerDays('2026-11-19', ['2026-11-20', '2026-12-24']);
  assert.equal(far.length, 8); assert.equal(far[7], '2026-12-24');
  assert.deepEqual(L.pickerDays('2026-11-19', ['2026-11-19', '2026-11-19', '']), L.nextDays('2026-11-19'));
  assert.equal(L.pickerStart('2026-11-21', '2026-11-19'), '2026-11-19');
  assert.equal(L.pickerStart('2026-11-26', '2026-11-19'), '2026-11-26');
  assert.equal(L.pickerStart('2026-11-10', '2026-11-19'), '2026-11-10');
  assert.equal(L.holdsToday('day', '2026-11-19', '2026-11-19'), true);
  assert.equal(L.holdsToday('day', '2026-11-20', '2026-11-19'), false);
  assert.equal(L.holdsToday('week', '2026-11-21', '2026-11-19'), true); // Sun 15 to Sat 21
  assert.equal(L.holdsToday('week', '2026-11-22', '2026-11-19'), false);
  assert.equal(L.holdsToday('month', '2026-11-02', '2026-11-19'), true);
  assert.equal(L.holdsToday('month', '2026-12-19', '2026-11-19'), false);
});

test("item kinds: Q31's 'סוג' chips (meeting / visit / event prep / other); old items keep their kind unless changed", () => {
  assert.deepEqual(L.TEAM_KINDS.map((k) => k.label), ['פגישה', 'ביקור', 'הכנות לאירוע', 'אחר']);
  assert.equal(L.teamKindOf('meeting'), 'meeting'); assert.equal(L.teamKindOf('manual'), 'manual'); assert.equal(L.teamKindOf('presence'), 'manual');
  assert.equal(L.teamKindOf('visit'), 'visit');
  assert.equal(L.teamKindLabel('planning'), 'הכנות לאירוע'); assert.equal(L.teamKindLabel('visit'), 'ביקור'); assert.equal(L.teamKindLabel('manual'), ''); assert.equal(L.teamKindLabel('event'), '');
  // a visit noted by hand is a team item (the form edits it); a visit request's own entry (with refId) and events are not
  assert.equal(L.isTeamItem({ kind: 'visit', refId: '', title: 'ביקור גן', ownerName: 'בני' }), true);
  assert.equal(L.isTeamItem({ kind: 'visit', refId: 'v1', title: 'ביקור: גן', ownerName: 'בני' }), false);
  assert.equal(L.isTeamItem({ kind: 'event', refId: 'e1', title: 'פסטיבל', ownerName: 'בני' }), false);
  assert.equal(L.isTeamItem({ kind: 'manual', title: 'בני בחווה', ownerName: 'בני גולן' }), false);
  assert.equal(L.kindToSave('visit', 'manual'), 'visit');
  // new: the chosen kind, 'manual' by default
  assert.equal(L.kindToSave(undefined), 'manual'); assert.equal(L.kindToSave('meeting'), 'meeting');
  // edit: written only when it changed
  assert.equal(L.kindToSave('manual', 'manual'), undefined);
  assert.equal(L.kindToSave('meeting', 'meeting'), undefined);
  assert.equal(L.kindToSave('planning', 'manual'), 'planning');
  assert.equal(L.kindToSave(undefined, 'meeting'), undefined);
});

test('presence for someone else: me first, then the active team by name; volunteers drawn outlined', () => {
  const me = { uid: 'beni', displayName: 'בני', role: 'owner', status: 'active' };
  const team = [
    me, { uid: 'yoav', displayName: 'יואב', role: 'staff', status: 'active' }, { uid: 'dana', displayName: 'דנה', role: 'manager', status: 'active' },
    { uid: 'gone', displayName: 'אבי', role: 'staff', status: 'blocked' }, { uid: 'v', displayName: 'גלית', role: 'vendor', status: 'active' },
  ];
  assert.deepEqual(L.presencePeople(team, me).map((p) => p.uid), ['beni', 'dana', 'yoav']);
  assert.equal(L.isVolunteer('staff'), true); assert.equal(L.isVolunteer('manager'), false); assert.equal(L.isVolunteer('owner'), false); assert.equal(L.isVolunteer(undefined), false);
  // a manager's entry for a teammate is that teammate's entry
  const plan = L.presencePlan(['2026-11-24'], [], by('yoav', 'יואב לוי'), { from: '', to: '' }, '', () => 'n1', '2026-11-19T08:30:00.000Z');
  assert.equal(plan[0].data.ownerUid, 'yoav'); assert.equal(plan[0].data.title, 'יואב בחווה'); assert.equal(plan[0].data.time, '');
});

console.log(`\n${n} farm helper tests passed`);
