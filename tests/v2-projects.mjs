// Projects area (P1-P6): the pure helpers (ordering, counts, wording, deadline parsing, form plans) and the data actions
// (take / release / done / reopen / update / split / create / save) run against the demo store with Firestore stubbed out.
//   node tests/v2-projects.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Firestore must never be reached: every function of the SDK records the call and the test asserts there were none.
const stub = {
  name: 'stub-firebase',
  setup(b) {
    b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'fs', namespace: 'stub' }));
    b.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: 'app', namespace: 'stub' }));
    b.onLoad({ filter: /^fs$/, namespace: 'stub' }, () => ({ contents: `
      const rec = (n) => (...a) => { globalThis.__calls.push(n); return n === 'onSnapshot' ? () => {} : {}; };
      export const collection = rec('collection'), doc = rec('doc'), documentId = rec('documentId'), onSnapshot = rec('onSnapshot'), query = rec('query'), where = rec('where'), orderBy = rec('orderBy'), limit = rec('limit');
      export const setDoc = async () => rec('setDoc')(), updateDoc = async () => rec('updateDoc')(), deleteDoc = async () => rec('deleteDoc')(), getDocsFromServer = async () => rec('get')();
      export const writeBatch = () => { rec('writeBatch')(); return { set() {}, update() {}, delete() {}, commit: async () => {} }; };
      export const runTransaction = async () => rec('runTransaction')();
      export const arrayUnion = rec('arrayUnion'), arrayRemove = rec('arrayRemove'), increment = rec('increment'), serverTimestamp = rec('serverTimestamp');
    ` }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: 'export const onAuthStateChanged = () => {};' }));
    b.onLoad({ filter: /^app$/, namespace: 'stub' }, () => ({ contents: "export const db = {}, ownerEmail = 'owner@example.test'; export const readyAuth = async () => ({});" }));
  },
};
await build({
  stdin: { contents: `
    export * from './src/app/v2/screens/projects/logic';
    export * as data from './src/app/v2/data/projects';
    export { setDemo, setDemoStates, demoItems, demoDoc } from './src/app/demo/store';
    export { write } from './src/app/db';
    export { freezeClock } from './src/app/clock';
    export { default as slice } from './src/app/demo/seed/projects';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: '.build/v2-projects-test.mjs', plugins: [stub], logLevel: 'silent', jsx: 'automatic',
});
const kv = new Map();
globalThis.localStorage = { getItem: (k) => (kv.has(k) ? kv.get(k) : null), setItem: (k, v) => kv.set(k, String(v)), removeItem: (k) => kv.delete(k), clear: () => kv.clear() };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.location = { search: '', pathname: '/app', origin: 'http://localhost', href: 'http://localhost/app' };
globalThis.history = { replaceState() {}, pushState() {}, state: null };
globalThis.window = globalThis; globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.__calls = [];
const m = await import('../.build/v2-projects-test.mjs?' + Date.now());
const { data } = m;

// ---------- pure helpers (clock frozen on the designed day, Thu 19.11.2026) ----------
m.freezeClock('2026-11-19T10:30:00+02:00');
const A = { beni: { uid: 'u-beni', name: 'בני גוטמן' }, noa: { uid: 'u-noa', name: 'נועה שחר' }, eliya: { uid: 'u-eliya', name: 'אליה כהן' } };
const st = (id, n, extra = {}) => ({ id, n, title: id, assignee: null, done: false, doneBy: null, doneAt: null, due: '', createdAt: '2026-11-01T00:00:00Z', ...extra });

assert.deepEqual(m.sortSteps([st('c', 3), st('a', 1), st('b', 1.5)]).map((s) => s.id), ['a', 'b', 'c'], 'steps sort by n, fractional n after a split');
const festival = [st('1', 1, { done: true, doneBy: A.beni }), st('2', 2, { done: true }), st('3', 3, { done: true }), st('4', 4, { assignee: A.beni }), st('5', 5, { assignee: A.noa }), st('6', 6), st('7', 7)];
const prog = m.progressOf(festival);
assert.deepEqual(prog, { total: 7, done: 3, free: 2 });
assert.equal(m.countLabel(prog), '3 מתוך 7');
assert.equal(m.freeLabel(prog), '2 צעדים פנויים');
assert.equal(m.freeLabel({ total: 5, done: 1, free: 1 }), 'צעד אחד פנוי');
assert.equal(m.freeLabel({ total: 4, done: 0, free: 4 }), 'כל הצעדים פנויים');
assert.equal(m.freeLabel({ total: 4, done: 4, free: 0 }), '');

assert.equal(m.deadlineLabel({ deadline: '2026-11-27' }), 'עוד 8 ימים');
assert.equal(m.deadlineLabel({ deadline: '', deadlineText: 'סוף דצמבר' }), 'עד סוף דצמבר');
assert.equal(m.deadlineLabel({ deadline: '' }), 'בלי תאריך');
assert.equal(m.deadlineLabel({ deadline: '2026-11-10' }), 'עבר התאריך');
assert.equal(m.deadlineUrgent({ deadline: '2026-11-27' }), true);
assert.equal(m.deadlineUrgent({ deadline: '2027-01-27' }), false);
assert.equal(m.deadlineUrgent({ deadline: '' }), false);
assert.equal(m.goalLine({ deadline: '2026-11-27', status: 'active' }), 'היעד: מוכנים עד שישי 27.11 · עוד 8 ימים');
assert.equal(m.goalLine({ deadline: '', deadlineText: 'סוף דצמבר', status: 'active' }), 'היעד: מוכנים עד סוף דצמבר');
assert.equal(m.goalLine({ deadline: '', status: 'active' }), 'היעד: בלי תאריך');
assert.equal(m.dueLabel('2026-11-23'), 'עד שני 23.11');

assert.deepEqual(m.parseDeadline('27.11'), { deadline: '2026-11-27' });
assert.deepEqual(m.parseDeadline('5/1'), { deadline: '2027-01-05' }, 'a past day/month means next year');
assert.deepEqual(m.parseDeadline('27.11.27'), { deadline: '2027-11-27' });
assert.deepEqual(m.parseDeadline('2026-12-31'), { deadline: '2026-12-31' });
assert.deepEqual(m.parseDeadline('סוף דצמבר'), { deadline: '', deadlineText: 'סוף דצמבר' });
assert.deepEqual(m.parseDeadline('40.13'), { deadline: '', deadlineText: '40.13' });
assert.deepEqual(m.parseDeadline('  '), { deadline: '' });
assert.equal(m.deadlineInput({ deadline: '2026-11-27' }), '27.11');
assert.equal(m.deadlineInput({ deadline: '', deadlineText: 'סוף דצמבר' }), 'סוף דצמבר');

assert.equal(m.shortTitle({ title: 'הכנות לפסטיבל הסתיו', short: 'הכנות לפסטיבל' }), 'הכנות לפסטיבל');
assert.equal(m.shortTitle({ title: 'מערכת השקיה חדשה' }), 'מערכת השקיה חדשה');

assert.deepEqual(m.membersOf({ members: [A.beni, A.noa, A.beni], createdBy: A.beni }).map((a) => a.uid), ['u-beni', 'u-noa']);
assert.deepEqual(m.membersOf({ members: [], createdBy: A.eliya }).map((a) => a.uid), ['u-eliya'], 'older documents without members fall back to the creator');
assert.equal(m.isMember({ members: [A.noa], createdBy: A.noa }, 'u-noa'), true);
assert.equal(m.isMember({ members: [A.noa], memberUids: ['u-noa'], createdBy: A.noa }, 'u-beni'), false);

assert.deepEqual(festival.map((s) => m.stepState(s, 'u-beni')), ['done', 'done', 'done', 'mine', 'other', 'free', 'free']);
assert.equal(m.stepMeta({ ...festival[0], doneAt: '2026-11-02T15:00:00Z' }, 'u-beni'), 'בני · 2.11');
assert.equal(m.stepMeta({ ...festival[3], due: '2026-11-23' }, 'u-beni'), 'עד שני 23.11');
assert.equal(m.stepMeta({ ...festival[4], due: '2026-11-25' }, 'u-beni'), 'נועה · עד רביעי 25.11');
assert.equal(m.stepMeta({ ...festival[5], due: '2026-11-26' }, 'u-beni'), 'עד חמישי 26.11');

assert.deepEqual(m.stepNumber(festival, '4'), { n: 4, total: 7 });
assert.equal(m.previousStep(festival, '4').id, '3');
assert.equal(m.previousStep(festival, '1'), null);
assert.equal(m.nextN(festival), 8);
assert.deepEqual(m.splitNs(festival, '4', 2).map((x) => +x.toFixed(3)), [4.333, 4.667], 'sub-steps fall between the step and the next one');
assert.deepEqual(m.splitNs(festival, '7', 1), [7.5], 'splitting the last step places the sub-step after it');
assert.equal(m.allDone([]), false); assert.equal(m.allDone([{ done: true }]), true); assert.equal(m.allDone(festival), false);

const P = (id, extra = {}) => ({ id, title: id, goal: id, deadline: '', members: [A.eliya], memberUids: ['u-eliya'], status: 'active', createdBy: A.eliya, createdAt: '2026-11-0' + id.length + 'T00:00:00Z', updatedAt: '', ...extra });
const projects = [
  P('permits'),
  P('irrigation', { deadlineText: 'סוף דצמבר', members: [A.beni, A.eliya], memberUids: ['u-beni', 'u-eliya'] }),
  P('festival', { deadline: '2026-11-27', members: [A.beni, A.noa, A.eliya], memberUids: ['u-beni', 'u-noa', 'u-eliya'] }),
  P('fence', { status: 'done', doneAt: '2026-09-28T00:00:00Z' }), P('container', { status: 'done', doneAt: '2026-08-14T00:00:00Z' }),
];
assert.deepEqual(m.filterProjects(projects, 'active', 'u-beni').map((p) => p.id), ['festival', 'irrigation', 'permits'], 'dated first, then free text, then undated');
assert.deepEqual(m.filterProjects(projects, 'mine', 'u-beni').map((p) => p.id), ['festival', 'irrigation']);
assert.deepEqual(m.filterProjects(projects, 'done', 'u-beni').map((p) => p.id), ['fence', 'container'], 'done: latest first');
assert.deepEqual(m.blockProjects(projects, 'u-beni').map((p) => p.id), ['festival', 'irrigation'], 'P1 block: my active projects');
assert.deepEqual(m.blockProjects(projects, 'u-roi').map((p) => p.id), ['festival', 'irrigation', 'permits'], 'not in any: the active ones');

const plan = m.planSteps([
  { id: 'a', title: 'ראשון', assignee: null }, { title: '  ', assignee: null }, { id: 'b', title: '', assignee: null }, { id: 'c', title: '', assignee: null }, { title: 'חדש', assignee: A.noa },
], [{ id: 'a', n: 1, done: false }, { id: 'b', n: 2, done: false }, { id: 'c', n: 3, done: true }, { id: 'd', n: 4, done: false }]);
assert.deepEqual(plan, {
  create: [{ title: 'חדש', assignee: A.noa, n: 3 }],
  update: [{ id: 'a', title: 'ראשון', assignee: null, n: 1 }, { id: 'c', n: 2 }],
  remove: ['b', 'd'],
}, 'P5 plan: blank rows dropped, cleared open steps removed, a cleared done step is kept, rows renumbered');
console.log('PASS: projects helpers (order, counts, wording, deadline parsing, filters, form plan)');

// ---------- data actions on the demo store ----------
m.setDemo({ on: true, persona: 'owner', scenario: 'regular' });
globalThis.__calls.length = 0;
const beni = { actor: { uid: 'demo-u-beni', name: 'בני גוטמן' } };
const noa = { actor: { uid: 'demo-u-noa', name: 'נועה שחר' } };
const steps = (pid) => m.sortSteps(m.demoItems(`projects/${pid}/steps`));

// the seed slice builds what the designs show
const seed = { collections: {}, documents: {} };
m.slice(seed, 'regular');
assert.equal(seed.collections.projects.filter((p) => p.status !== 'done').length, 3);
assert.equal(seed.collections.projects.filter((p) => p.status === 'done').length, 4);
assert.deepEqual(m.progressOf(seed.collections['projects/demo-p-festival/steps']), { total: 7, done: 3, free: 2 });
assert.deepEqual(m.progressOf(seed.collections['projects/demo-p-irrigation/steps']), { total: 5, done: 1, free: 1 });
assert.deepEqual(m.progressOf(seed.collections['projects/demo-p-permits/steps']), { total: 4, done: 0, free: 4 });
assert.ok(seed.collections['projects/demo-p-festival/steps'].some((s) => s.id === 'demo-ps-police' && s.assignee.uid === 'demo-u-beni' && s.updates.length === 2));

// create: project + steps in one go, a notification for the person given a step
const pid = await data.createProject(beni, { title: 'לול חדש', deadline: '15.12', steps: [{ title: 'לבחור מקום', assignee: null }, { title: '', assignee: null }, { title: 'לקנות רשת', assignee: noa.actor }] });
const proj = m.demoDoc(`projects/${pid}`);
assert.equal(proj.title, 'לול חדש'); assert.equal(proj.deadline, '2026-12-15'); assert.equal(proj.status, 'active');
assert.deepEqual(proj.memberUids, ['demo-u-beni', 'demo-u-noa']);
assert.deepEqual(steps(pid).map((s) => [s.n, s.title, s.assignee?.uid || null]), [[1, 'לבחור מקום', null], [2, 'לקנות רשת', 'demo-u-noa']]);
await new Promise((r) => setTimeout(r, 10));
const noaNotes = m.demoItems('users/demo-u-noa/notifications');
assert.ok(noaNotes.some((n) => n.title === 'צעד חדש עליך' && n.link.startsWith(`/projects/${pid}/steps/`)), 'the assignee is notified');
assert.equal(m.demoItems('users/demo-u-beni/notifications').filter((n) => n.title === 'צעד חדש עליך').length, 0, 'nobody is notified about their own action');

// take: free -> mine; a second taker is refused (X1); release only by the holder
const [s1, s2] = steps(pid);
await data.takeStep(noa, pid, s1.id);
assert.equal(m.demoDoc(`projects/${pid}/steps/${s1.id}`).assignee.uid, 'demo-u-noa');
await assert.rejects(data.takeStep(beni, pid, s1.id), (e) => e.conflict === true, 'taking a step someone holds is a conflict');
await assert.rejects(data.releaseStep(beni, pid, s1.id), (e) => e.conflict === true, 'only the holder releases');
await data.releaseStep(noa, pid, s1.id);
assert.equal(m.demoDoc(`projects/${pid}/steps/${s1.id}`).assignee, null);
await data.takeStep(beni, pid, s1.id);
m.setDemoStates({ refuseNext: true });
await assert.rejects(data.takeStep(noa, pid, s2.id), (e) => e.conflict === true, 'demo "refused write" makes the next take fail');

// updates thread
await data.postUpdate(beni, m.demoDoc(`projects/${pid}`), m.demoDoc(`projects/${pid}/steps/${s1.id}`), '  מצאתי מקום ליד החממה  ');
assert.deepEqual(m.demoDoc(`projects/${pid}/steps/${s1.id}`).updates.map((u) => [u.by.uid, u.text]), [['demo-u-beni', 'מצאתי מקום ליד החממה']]);
await data.postUpdate(beni, m.demoDoc(`projects/${pid}`), m.demoDoc(`projects/${pid}/steps/${s1.id}`), '   ');
assert.equal(m.demoDoc(`projects/${pid}/steps/${s1.id}`).updates.length, 1, 'an empty update is not posted');

// split: sub-steps right after the step, inheriting assignee and due
await data.updateStep(beni, pid, s1.id, { title: 'לבחור מקום', due: '2026-11-30', note: 'ליד החממה' });
await data.splitStep(beni, pid, steps(pid), m.demoDoc(`projects/${pid}/steps/${s1.id}`), ['למדוד', '', 'לסמן']);
assert.deepEqual(steps(pid).map((s) => s.title), ['לבחור מקום', 'למדוד', 'לסמן', 'לקנות רשת']);
assert.ok(steps(pid).slice(1, 3).every((s) => s.parentId === s1.id && s.assignee.uid === 'demo-u-beni' && s.due === '2026-11-30'));

// done: completing the last open step closes the project; reopening brings it back
for (const s of steps(pid)) await data.completeStep(beni, pid, s.id, steps(pid));
assert.equal(m.demoDoc(`projects/${pid}`).status, 'done'); assert.ok(m.demoDoc(`projects/${pid}`).doneAt);
await assert.rejects(data.completeStep(noa, pid, s1.id, steps(pid)), (e) => e.conflict === true, 'a step already done is a conflict');
await data.reopenStep(beni, pid, s2.id);
assert.equal(m.demoDoc(`projects/${pid}`).status, 'active'); assert.equal(m.demoDoc(`projects/${pid}/steps/${s2.id}`).done, false);

// save (P5 edit): rename, change deadline, assign, add, remove; stale assignee -> conflict, nothing saved
const loaded = steps(pid);
const drafts = loaded.map((s) => ({ id: s.id, title: s.title, assignee: s.assignee }));
drafts[1].title = ''; // remove "למדוד" (done steps stay: it is done, so it is kept)
drafts[3].assignee = noa.actor; // "לקנות רשת" was Noa's, reopened, still Noa's: no change
drafts.push({ title: 'להכניס תרנגולות', assignee: noa.actor });
await data.saveProject(beni, m.demoDoc(`projects/${pid}`), loaded, { title: 'לול חדש לתרנגולות', deadline: 'אחרי חנוכה', steps: drafts });
const saved = m.demoDoc(`projects/${pid}`);
assert.equal(saved.title, 'לול חדש לתרנגולות'); assert.equal(saved.deadline, ''); assert.equal(saved.deadlineText, 'אחרי חנוכה');
assert.deepEqual(steps(pid).map((s) => [s.n, s.title]), [[1, 'לבחור מקום'], [2, 'למדוד'], [3, 'לסמן'], [4, 'לקנות רשת'], [5, 'להכניס תרנגולות']], 'a cleared done step is kept');
const stale = steps(pid);
await data.takeStep(noa, pid, stale[4].id).catch(() => {}); // held by Noa already: no change
const beforeEdit = steps(pid);
const d2 = beforeEdit.map((s) => ({ id: s.id, title: s.title, assignee: s.assignee }));
await data.releaseStep(noa, pid, beforeEdit[4].id); // someone changes the step after the form loaded
d2[4].assignee = beni.actor;
await assert.rejects(data.saveProject(beni, m.demoDoc(`projects/${pid}`), beforeEdit, { title: 'שם אחר', deadline: '', steps: d2 }), (e) => e.conflict === true);
assert.equal(m.demoDoc(`projects/${pid}`).title, 'לול חדש לתרנגולות', 'a conflicting save writes nothing');

// addStep at the end
const added = await data.addStep(beni, pid, steps(pid), 'לבנות מדף');
assert.equal(steps(pid).at(-1).id, added);

assert.deepEqual(globalThis.__calls.filter((c) => !['collection', 'doc', 'query', 'where', 'orderBy', 'limit', 'documentId'].includes(c)), [], 'demo: no Firestore call');
console.log('PASS: projects data actions on the demo store (create, take/release with conflicts, updates, split, done/reopen, save with conflict)');
