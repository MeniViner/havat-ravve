// Demo seed slice for the live area (Y1-Y5): the counters document, the scan log and the cash counts of the festival.
// Counters carry the designed figures (Y1: 212 inside, 217 scans, 34 paid at the gate, 3 later for 150 ₪, 2 rejected).
import { A, E } from '../data';
import { put, type Row, type Slice } from './types';
import { fillerPlan, RETURNED } from './eventday';

const T = (hhmm: string, day = '2026-11-28') => new Date(`${day}T${hhmm}:00+02:00`).toISOString();
const SCANS = `events/${E.fall}/scans`;

const slice: Slice = (seed, scenario) => {
  if (scenario === 'regular') return;
  const after = scenario === 'afterEvent';
  const Y = A.yoav;
  const scan = (id: string, at: string, ticketId: string, name: string, phone: string, result: string, meta: string, extra: Row = {}): Row => ({
    id, eventId: E.fall, ticketId, orderId: ticketId.replace(/-\d+$/, ''), name, phone, meta, result, by: Y, at: T(at), reopenedBy: null, reopenedAt: null, count: 1, ...extra,
  });
  // The named rows of Y2 (Michal's 17:20 entry is left out: in the demo she is the one "QR תקין" lets in).
  const named: Row[] = [
    scan('demo-o-3-1-1', '17:19', 'demo-o-3-1', 'דוד כהן', '052-000-0130', 'ok', 'כרטיס 1 מתוך 4'),
    scan('demo-o-7-1-1', '17:18', 'demo-o-7-1', 'שירה כץ', '050-000-0260', 'paidAtGate', 'כרטיס אחד · 50 ₪ מזומן', { amount: 50, method: 'מזומן' }),
    scan('demo-o-1-1-1', '17:11', 'demo-o-1-1', 'רוני לוי', '054-000-0088', 'payLater', '3 כרטיסים · 150 ₪', { amount: 150, method: '', count: 3 }),
    scan('demo-o-5-1-1', '17:07', 'demo-o-5-1', 'אורלי לוי', '054-000-0087', 'ok', 'כרטיס אחד'),
    scan('demo-sc-yossi', '17:02', 'demo-o-9-1', 'יוסי מזרחי', '052-000-0312', 'rejected', 'ההזמנה בוטלה ב־17.11', { reason: 'ההזמנה בוטלה', keptBy: null, keptAt: null }),
    scan('demo-o-6-2-1', '16:58', 'demo-o-6-2', 'נועם אדרי', '050-000-0276', 'ok', 'כרטיס 2 מתוך 2'),
    scan('demo-o-6-1-1', '16:55', 'demo-o-6-1', 'נועם אדרי', '050-000-0276', 'ok', 'כרטיס 1 מתוך 2'),
    scan('demo-o-rachel-1-1', '16:51', 'demo-o-rachel-1', 'רחל שטרן', '050-000-0281', 'paidAtGate', 'כרטיס אחד · 50 ₪ ביט', { amount: 50, method: 'ביט' }),
    scan('demo-sc-yossi-1', '16:47', 'demo-o-9-2', 'יוסי מזרחי', '052-000-0312', 'rejected', 'ההזמנה בוטלה ב־17.11', { reason: 'ההזמנה בוטלה', keptBy: null, keptAt: null }),
  ];
  const fillers: Row[] = [];
  for (const { o, ins } of fillerPlan(after)) {
    ins.forEach((e, i) => {
      if (!e) return;
      const tid = `${o.orderId}-${i + 1}`;
      fillers.push({ id: `${tid}-1`, eventId: E.fall, ticketId: tid, orderId: o.orderId, name: o.owner.name, phone: o.owner.phone, meta: o.count === 1 ? 'כרטיס אחד' : `כרטיס ${i + 1} מתוך ${o.count}`, result: 'ok', by: e.by, at: e.at, reopenedBy: null, reopenedAt: null, count: 1 });
    });
  }
  // Y2 "יצאו וחזרו": the second scan of the tickets that went out and came back in
  for (const r of RETURNED) {
    const first = fillers.find((f) => f.ticketId === r.ticketId);
    if (first) fillers.push({ ...first, id: `${r.ticketId}-2`, by: r.by, at: r.at });
  }
  put(seed, SCANS, [...named, ...fillers]);

  put(seed, `events/${E.fall}/counters`, [
    after
      ? { id: 'live', eventId: E.fall, entered: 487, scans: 496, paidAtGate: 41, payLater: 3, payLaterAmount: 150, rejected: 2,
        perHalfHour: { '16:00': 74, '16:30': 62, '17:00': 76, '17:30': 71, '18:00': 64, '18:30': 52, '19:00': 41, '19:30': 28, '20:00': 13, '20:30': 6 }, per10m: { '20:50': 1 } }
      : { id: 'live', eventId: E.fall, entered: 212, scans: 217, paidAtGate: 34, payLater: 3, payLaterAmount: 150, rejected: 2,
        perHalfHour: { '16:00': 74, '16:30': 62, '17:00': 76 }, per10m: { '16:50': 31, '17:00': 36, '17:10': 38 } },
    ...(after ? [{ id: 'cash', gate: { amount: 1150, by: 'יואב', at: T('20:58'), byActor: A.yoav }, stall: { amount: 640, by: 'נועה', at: T('21:01'), byActor: A.noa } }] : []),
  ]);
};
export default slice;
