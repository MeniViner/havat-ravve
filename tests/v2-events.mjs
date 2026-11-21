// v2 events area: the pure logic behind M3-M7, N9-N12, V3-V5, checked against the demo seed (the numbers the designs show).
// Usage: node tests/v2-events.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';

await build({
  stdin: {
    contents: `export * from './src/app/v2/screens/events/logic';
      export { seedFor } from './src/app/demo/seed/index';
      export { freezeClock, nowMs, todayKey } from './src/app/clock';
      export { E, U } from './src/app/demo/data';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: '.build/v2-events-test.mjs', logLevel: 'error',
});
const L = await import('../.build/v2-events-test.mjs?' + Date.now());
let passed = 0;
const t = (name, fn) => { try { fn(); passed += 1; } catch (e) { console.error('FAIL', name); throw e; } };
const of = (sc, id) => { const s = L.seedFor(sc); return { s, tickets: s.collections.tickets.filter((x) => x.eventId === id), tabs: s.collections.tabs.filter((x) => x.eventId === id), allTickets: s.collections.tickets, allTabs: s.collections.tabs }; };

// ---------- phases and tabs ----------
const fest = { start: '2026-11-28T14:00:00.000Z', end: '2026-11-28T19:00:00.000Z' };
t('phaseOf', () => {
  assert.equal(L.phaseOf(fest, Date.parse('2026-11-19T08:30:00Z')), 'before');
  assert.equal(L.phaseOf(fest, Date.parse('2026-11-28T15:20:00Z')), 'during');
  assert.equal(L.phaseOf(fest, Date.parse('2026-11-28T19:04:00Z')), 'after');
  assert.equal(L.phaseOf({ ...fest, closed: true }, Date.parse('2026-11-28T15:00:00Z')), 'after');
});
t('defaultTab', () => {
  assert.equal(L.defaultTab(fest, Date.parse('2026-11-19T08:30:00Z'), '2026-11-19'), 'prep');
  assert.equal(L.defaultTab(fest, Date.parse('2026-11-28T08:00:00Z'), '2026-11-28'), 'day'); // the morning of the event
  assert.equal(L.defaultTab(fest, Date.parse('2026-11-28T15:20:00Z'), '2026-11-28'), 'day');
  assert.equal(L.defaultTab(fest, Date.parse('2026-11-28T19:04:00Z'), '2026-11-28'), 'summary');
});
t('eventSubtitle', () => {
  L.freezeClock('2026-11-19T10:30:00+02:00');
  assert.equal(L.eventSubtitle(fest, L.nowMs()), 'שבת 28.11 · 16:00–21:00 · בעוד 9 ימים');
  assert.equal(L.eventSubtitle(fest, Date.parse('2026-11-28T15:20:00Z')), 'שבת 28.11 · קורה עכשיו · 17:20');
  assert.equal(L.eventSubtitle({ start: '2026-10-26T14:00:00Z', end: '2026-10-26T19:00:00Z' }, L.nowMs()), 'שני 26.10 · הסתיים');
  assert.equal(L.monthShort('2026-11-28T14:00:00Z'), 'נוב׳');
  assert.equal(L.monthShort('2026-05-02T14:00:00Z'), 'מאי');
});

// ---------- N11 date and time ----------
t('isoFromLocal across summer time', () => {
  assert.equal(L.isoFromLocal('2026-11-28', '16:00'), '2026-11-28T14:00:00.000Z'); // winter +02
  assert.equal(L.isoFromLocal('2026-07-10', '16:00'), '2026-07-10T13:00:00.000Z'); // summer +03
  assert.deepEqual(L.localOf('2026-07-10T13:00:00.000Z'), { date: '2026-07-10', time: '16:00' });
  assert.equal(L.dateFieldText('2026-11-28'), 'שבת 28.11.2026');
});
t('normTime and rangeFromForm', () => {
  assert.equal(L.normTime('9:5'), '09:05');
  assert.equal(L.normTime('0930'), '09:30');
  assert.equal(L.normTime('16'), '16:00');
  assert.equal(L.normTime('25:00'), '');
  assert.deepEqual(L.rangeFromForm('2026-11-28', '16:00', '21:00'), { start: '2026-11-28T14:00:00.000Z', end: '2026-11-28T19:00:00.000Z' });
  assert.deepEqual(L.rangeFromForm('2026-11-28', '20:00', '01:00'), { start: '2026-11-28T18:00:00.000Z', end: '2026-11-28T23:00:00.000Z' }); // rolls into the night
  assert.equal(L.rangeFromForm('2026-11-28', '', '21:00'), null);
});

// ---------- M5 guests (festival, regular day) ----------
t('festival guests', () => {
  const { tickets } = of('regular', L.E.fall);
  const orders = L.ordersOf(tickets);
  const claimed = L.filterOrders(orders, 'claimed', '');
  assert.deepEqual(claimed.map((o) => [o.name, o.count, o.owed]), [['דוד כהן', 4, 200], ['רוני לוי', 3, 150]]); // longest waiting first
  assert.equal(claimed.reduce((s, o) => s + o.owed, 0), 350);
  const st = L.guestStats(tickets);
  assert.equal(st.paid + st.waitingCount <= st.tickets, true);
  assert.equal(L.filterOrders(orders, 'all', 'רוני').every((o) => o.name.includes('רוני')), true);
  assert.equal(L.ticketsWord(1), 'כרטיס אחד');
  assert.equal(L.ticketsWord(4), '4 כרטיסים');
});

// ---------- M7 summary (October fair) ----------
t('october summary', () => {
  const { tickets, tabs } = of('regular', L.E.oct);
  const s = L.eventSummary(tickets, tabs);
  assert.equal(s.registered, 96);
  assert.equal(s.arrived, 81);
  assert.equal(s.ticketsIncome, 650);
  assert.equal(s.stallIncome, 1180);
  assert.deepEqual(L.topSold(tabs), [{ label: 'לימונדה', value: 38 }, { label: 'עוגת תפוחים', value: 24 }, { label: 'גבינת עיזים', value: 17 }, { label: 'דבש', value: 9 }]);
});

// ---------- V5 debts ----------
t('debts after the event', () => {
  L.freezeClock('2026-11-28T21:04:00+02:00');
  const { allTickets, allTabs } = of('afterEvent', L.E.oct);
  const d = L.debtsOf(L.E.oct, allTickets, allTabs);
  assert.deepEqual(d.map((x) => [x.name, x.amount, x.what]), [
    ['דוד כהן', 200, '4 כרטיסים'],
    ['שירה כץ', 58, 'חשבון דוכן · 3 פריטים'],
    ['רוני לוי', 46, 'חשבון דוכן · 4 פריטים'],
    ['יוסי מזרחי', 312, '6 כרטיסים'],
  ]);
  assert.deepEqual(L.debtTotals(d), { count: 4, amount: 616, tickets: 2, tabs: 2 });
  assert.equal(L.debtBreakdown({ tickets: 2, tabs: 2 }), '2 כרטיסים · 2 חשבונות דוכן');
  assert.equal(L.debtsOf(L.E.oct, allTickets, allTabs.map((x) => ({ ...x, status: 'paid' }))).length, 2); // tabs settled: only tickets left
});
t('sortDebts: unsent by amount, then sent by time', () => {
  const list = [
    { name: 'א', amount: 10, reminderSentAt: '2026-11-28T17:00:00Z' },
    { name: 'ב', amount: 50, reminderSentAt: null },
    { name: 'ג', amount: 90, reminderSentAt: null },
    { name: 'ד', amount: 99, reminderSentAt: '2026-11-28T16:00:00Z' },
  ];
  assert.deepEqual(L.sortDebts(list).map((x) => x.name), ['ג', 'ב', 'ד', 'א']);
});
t('fillDebtTemplate: the V5 text', () => {
  const tpl = 'שלום [שם], תודה שהייתם ב[אירוע]. נשאר לתשלום [סכום]. אפשר בביט [ביט].';
  assert.equal(L.fillDebtTemplate(tpl, { name: 'דוד כהן', event: 'יריד אוקטובר', amount: 200, bit: '050-000-0000' }),
    'שלום דוד, תודה שהייתם ביריד אוקטובר. נשאר לתשלום 200 ₪. אפשר בביט 050-000-0000.');
  assert.equal(L.fillDebtTemplate('חוב: [סכום] ₪', { name: 'x', event: 'y', amount: 1240, bit: '' }), 'חוב: 1,240 ₪'); // no double ₪
});

// ---------- N12 tab ----------
t('tab lines and who recorded', () => {
  const { tabs } = of('regular', L.E.oct);
  const roni = tabs.find((x) => x.guestName === 'רוני לוי');
  assert.equal(L.tabUnits(roni), 4);
  assert.equal(L.recordedLine(roni.items), 'רשמה נועה · 17:05, 17:40');
  assert.deepEqual(L.tabLines(roni.items).map((l) => [l.name, l.qty]), [['לימונדה', 2], ['עוגת תפוחים', 1], ['תה צמחים', 1]]);
  const two = [{ ...roni.items[0], by: { uid: 'a', name: 'נועה שחר' } }, { ...roni.items[1], by: { uid: 'b', name: 'יואב פרץ' } }];
  assert.equal(L.recordedLine(two).startsWith('רשמו נועה ויואב'), true);
});

// ---------- V4 staffing ----------
t('staffing stations and stats', () => {
  const { s } = of('regular', L.E.fall);
  const saved = s.collections[`events/${L.E.fall}/staffing`];
  const stations = L.stationsOf({ entry: true, stall: true }, saved);
  assert.deepEqual(stations.map((x) => [x.station, x.people.length]), [['שער', 2], ['דוכן החווה', 2], ['חניה', 2]]);
  const presence = s.collections.calendar.filter((c) => c.kind === 'presence' && c.date === '2026-11-28');
  const team = s.collections.users.map((u) => u.uid);
  const st = L.staffingStats(stations, presence, team);
  assert.equal(st.assigned, 6);
  assert.equal(st.missing, 1);
  assert.equal(st.available, 4);
  assert.equal(L.staffingMeta(st), '6 משובצים · בחניה חסר מישהו');
  assert.equal(L.hoursText('15:30-18:30'), '15:30–18:30');
  // never saved: the usual stations appear, without the stall when the event has none
  assert.deepEqual(L.stationsOf({ entry: true, stall: false }, []).map((x) => x.station), ['שער', 'חניה']);
});

// ---------- M6 live ----------
t('live numbers and scan parts', () => {
  const n = L.liveNumbers({ entered: 212, paidAtGate: 34, tickets: 640, stallTabs: 18, stallSold: 1240 }, [], []);
  assert.deepEqual([n.entered, n.total, n.notArrived, n.paidAtGate, n.stallTabs, n.stallSold], [212, 640, 428, 34, 18, 1240]);
  assert.equal(L.shareLabel(n.share), 'שליש מהכרטיסים נכנסו');
  assert.equal(L.scanPart({ meta: '' }, { index: 2, total: 3 }), '2/3');
  assert.equal(L.scanPart({ meta: 'כרטיס 1 מתוך 2' }), '1/2');
  assert.equal(L.scanPart({ meta: 'כרטיס אחד' }), '1/1');
});

// ---------- V3 files ----------
t('file kinds', () => {
  assert.equal(L.fileKindLabel({ kind: 'image', url: 'data:image/webp;base64,' }), 'תמונה');
  assert.equal(L.fileKindLabel({ kind: 'file', url: 'data:application/pdf;base64,' }), 'PDF');
  assert.equal(L.fileKindLabel({ kind: 'link', url: 'https://example.com/plan' }), 'קישור');
  assert.equal(L.FILE_MAX_CHARS < 1_000_000, true); // stays well under the 1 MiB document limit
});

L.freezeClock(null);
console.log(`v2 events: ${passed} checks passed`);
