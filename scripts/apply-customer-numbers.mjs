// Managed companion to the offline planner. Dry-run by default. Only reads IDs, signup times and assigned numbers.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { planCustomerNumbers } from './plan-customer-numbers.mjs';

export async function reconcileNumbers({ project, emulator, token, apply = false }) {
  if (!/^[a-z][a-z0-9-]{3,62}$/.test(project) || (!emulator && !token)) throw Error('Pass --project and ACCESS_TOKEN, or set FIRESTORE_EMULATOR_HOST.');
  const base = (emulator ? 'http://' + emulator : 'https://firestore.googleapis.com') + '/v1/projects/' + project + '/databases/(default)/documents';
  const name = 'projects/' + project + '/databases/(default)/documents/';
  const headers = { authorization: 'Bearer ' + (emulator ? 'owner' : token), 'content-type': 'application/json' };
  async function request(path, init = {}) {
    const r = await fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    if (!r.ok) throw Object.assign(Error(data.error?.status || 'Firestore request failed'), { status: r.status, code: data.error?.status });
    return data;
  }
  async function list(collection, fields) {
    const docs = [];
    const params = new URLSearchParams({ pageSize: '500' });
    fields.forEach((f) => params.append('mask.fieldPaths', f));
    for (;;) {
      const page = await request('/' + collection + '?' + params);
      docs.push(...(page.documents || []));
      if (!page.nextPageToken) return docs;
      params.set('pageToken', page.nextPageToken);
    }
  }
  let applied = 0, conflicts = 0;
  for (;;) {
    // Read the counter first. Every concurrent registration changes its update time before our commit can succeed.
    const counter = await request('/counters/users?mask.fieldPaths=value').catch((e) => { if (e.status === 404) return null; throw e; });
    const value = counter ? Number(counter.fields?.value?.integerValue) : 0;
    const [users, contacts] = await Promise.all([list('users', ['createdAt', 'customerNumber']), list('contact_people', ['customerNumber'])]);
    const numbers = contacts.map((d) => Number(d.fields?.customerNumber?.integerValue)).filter((v) => Number.isSafeInteger(v) && v > 0);
    if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid counters/users value.');
    const floor = numbers.reduce((max, v) => Math.max(max, v), value);
    const versions = new Map();
    const rows = users.map((doc) => {
      const uid = doc.name.slice(name.length + 'users/'.length);
      versions.set(uid, doc.updateTime);
      const fields = doc.fields || {};
      const old = fields.customerNumber;
      const customerNumber = old?.integerValue === undefined ? (old && !('nullValue' in old) ? 'invalid' : null) : Number(old.integerValue);
      return { uid, customerNumber, createdAt: fields.createdAt?.stringValue || fields.createdAt?.timestampValue };
    });
    const plan = planCustomerNumbers({ counter: { value: floor }, users: rows });
    if (!apply) return { mode: 'dry-run', ...plan, previousCounter: value };
    const chunk = plan.assignments.slice(0, 100);
    const next = chunk.at(-1)?.customerNumber ?? plan.proposedCounter;
    if (!chunk.length && next === value) return { mode: 'apply', applied, counter: value, review: plan.review };
    const write = (path, field, n, version) => ({ update: { name: name + path, fields: { [field]: { integerValue: String(n) } } },
      updateMask: { fieldPaths: [field] }, currentDocument: version ? { updateTime: version } : { exists: false } });
    const writes = [write('counters/users', 'value', next, counter?.updateTime),
      ...chunk.map((p) => write('users/' + p.uid, 'customerNumber', p.customerNumber, versions.get(p.uid)))];
    try { await request(':commit', { method: 'POST', body: JSON.stringify({ writes }) }); applied += chunk.length; conflicts = 0; }
    catch (error) {
      if (!['ABORTED', 'FAILED_PRECONDITION', 'ALREADY_EXISTS', 'NOT_FOUND', 'UNAVAILABLE', 'DEADLINE_EXCEEDED'].includes(error.code) || ++conflicts > 8) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * conflicts));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { project: { type: 'string' }, apply: { type: 'boolean' } } });
  try { console.log(JSON.stringify(await reconcileNumbers({ ...values, emulator: process.env.FIRESTORE_EMULATOR_HOST, token: process.env.ACCESS_TOKEN }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
