// Read a local snapshot and print a plan. This script has no Firebase client or write mode.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function planCustomerNumbers({ counter, users }) {
  if (!Number.isSafeInteger(counter?.value) || counter.value < 0 || !Array.isArray(users)) {
    throw new Error('Expected { counter: { value: 0 }, users: [...] } with the local value of counters/users.');
  }
  const seen = new Set();
  const assigned = new Map();
  const missing = [];
  const review = [];
  let next = counter.value;
  for (const p of users) {
    if (typeof p.uid !== 'string' || !p.uid || seen.has(p.uid)) throw new Error('Each input row needs a distinct uid.');
    seen.add(p.uid);
    const n = p.customerNumber;
    if (n !== undefined && n !== null) {
      if (Number.isSafeInteger(n) && n > 0) {
        if (assigned.has(n)) review.push({ uid: p.uid, otherUid: assigned.get(n), reason: 'duplicate-existing-number' });
        else assigned.set(n, p.uid);
        next = Math.max(next, n);
      } else review.push({ uid: p.uid, reason: 'invalid-existing-number' });
      continue;
    }
    const time = typeof p.createdAt === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(p.createdAt) ? Date.parse(p.createdAt) : NaN;
    if (!Number.isFinite(time)) review.push({ uid: p.uid, reason: 'missing-registration-time' });
    else missing.push({ uid: p.uid, time });
  }
  missing.sort((a, b) => a.time - b.time || (a.uid < b.uid ? -1 : 1));
  if (!Number.isSafeInteger(next + missing.length)) throw new Error('No safe customer numbers remain.');
  const assignments = missing.map(({ uid }) => ({ uid, customerNumber: ++next }));
  return { counterPath: 'counters/users', previousCounter: counter.value, proposedCounter: next, assignments, review };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/plan-customer-numbers.mjs <local-snapshot.json>');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(planCustomerNumbers(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
