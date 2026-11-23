// מהירות: how fast the server answers. From the assistant log (api_log keeps each request's time in ms), the 5-minute
// round's own timings (monitor.ts jobs) and the site check (uptime). Computed on request: up to a few thousand reads.
import type { Env, Firestore } from './firestore';
import { invalid } from './http';
import { readMonitor } from './monitor';

const TZ = 'Asia/Jerusalem';
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
/** The value below which `p` of the sorted numbers fall (nearest rank). */
const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** Slower than this is "slow" (the console lists these). */
export const SLOW_MS = 2000;

export async function speed(env: Env, fs: Firestore, daysIn: number) {
  if (![1, 7, 30].includes(daysIn)) throw invalid('days', '1, 7 or 30');
  const now = Date.now();
  const from = new Date(now - daysIn * 86400_000).toISOString();
  const rows = (await fs.query({
    from: [{ collectionId: 'api_log' }],
    select: { fields: ['at', 'op', 'opHe', 'ms', 'status', 'keyLabel', 'kind'].map((fieldPath) => ({ fieldPath })) },
    where: { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: from } } },
    orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
    limit: 4000,
  })).map((d) => d.data);
  const timed = rows.filter((r) => num(r.ms) !== null);
  const all = timed.map((r) => num(r.ms)!).sort((a, b) => a - b);

  const byOp = new Map<string, { op: string; he: string; kind: string; ms: number[]; errors: number }>();
  for (const r of timed) {
    const op = str(r.op) || 'unknown';
    const e = byOp.get(op) || { op, he: str(r.opHe), kind: str(r.kind), ms: [], errors: 0 };
    e.ms.push(num(r.ms)!);
    if ((num(r.status) || 0) >= 500) e.errors++;
    byOp.set(op, e);
  }
  const ops = [...byOp.values()].map((e) => {
    const s = e.ms.sort((a, b) => a - b);
    return { op: e.op, he: e.he, kind: e.kind, count: s.length, p50: pct(s, 0.5), p95: pct(s, 0.95), max: s[s.length - 1] || 0, errors: e.errors };
  }).sort((a, b) => b.p95 - a.p95 || b.count - a.count).slice(0, 40);

  const days: { day: string; count: number; p50: number; p95: number }[] = [];
  if (daysIn > 1) {
    const per = new Map<string, number[]>();
    for (const r of timed) { const d = dayOf(str(r.at)); per.set(d, [...(per.get(d) || []), num(r.ms)!]); }
    for (let i = daysIn - 1; i >= 0; i--) {
      const d = dayOf(new Date(now - i * 86400_000).toISOString());
      const s = (per.get(d) || []).sort((a, b) => a - b);
      days.push({ day: d, count: s.length, p50: pct(s, 0.5), p95: pct(s, 0.95) });
    }
  }
  const slow = timed.filter((r) => num(r.ms)! >= SLOW_MS).sort((a, b) => num(b.ms)! - num(a.ms)!).slice(0, 10)
    .map((r) => ({ at: str(r.at), op: str(r.op), he: str(r.opHe), ms: num(r.ms)!, status: num(r.status) || 0, key: str(r.keyLabel) }));

  // the 5-minute round and the site, from the monitor's record (no Firestore read)
  const mon = await readMonitor(env);
  const jobs = Object.entries(mon.jobs || {}).map(([id, j]) => ({ id, ms: j.ms, at: j.at, ok: j.ok }));
  const checks = (mon.uptime?.checks || []).filter((c) => c.ok && typeof c.ms === 'number').map((c) => c.ms as number).sort((a, b) => a - b);
  return {
    days: daysIn, from, slowMs: SLOW_MS,
    total: { count: all.length, p50: pct(all, 0.5), p95: pct(all, 0.95), max: all[all.length - 1] || 0, slow: all.filter((x) => x >= SLOW_MS).length, errors: timed.filter((r) => (num(r.status) || 0) >= 500).length },
    truncated: rows.length >= 4000,
    ops, perDay: days, slowest: slow,
    cron: { at: mon.at || null, wallMs: mon.wallMs ?? null, jobs },
    site: { checks: checks.length, p50: pct(checks, 0.5), p95: pct(checks, 0.95) },
  };
}
