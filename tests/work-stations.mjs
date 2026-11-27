// Exercises the application service against a local Firestore emulator, with real manager/volunteer rules.
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tests/work-stations.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
require('firebase/compat/firestore');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocsFromServer, runTransaction, setDoc, setLogLevel, deleteDoc } = require('firebase/firestore');
setLogLevel('silent');
const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('A loopback Firestore emulator is required.');
const [address, port] = host.split(':');
const env = await initializeTestEnvironment({ projectId:'demo-havat-work-stations', firestore:{ host:address, port:Number(port), rules:await fs.readFile('firestore.rules','utf8') } });
const user = (uid) => env.authenticatedContext(uid,{email:uid+'@example.invalid',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
const manager = user('manager'), staff = user('staff'), guest = user('guest');
const at = '2030-06-10T08:00:00.000Z', activeEnd = '2030-06-11T10:00:00.000Z';
let server = manager, failOnce = '', ids = 0;
const row = (d) => d.exists() ? {...d.data(),id:d.id} : null;
const seen = (db,p) => getDoc(doc(db,p)).then(row);
globalThis.stationTestAdapter = {
  newId: () => 'new-' + (++ids),
  readOnce: async (p) => (await getDocsFromServer(collection(server,p))).docs.map(row),
  transact: (fn, opts) => {
    assert(opts?.serverOnly, 'catalog edits and migration phases must stay on the server');
    return runTransaction(server, async (t) => fn({
      get: async (p,id) => { if (failOnce && p===failOnce) { failOnce=''; throw new Error('interrupted fixture'); } return row(await t.get(doc(server,p,id))); },
      set: (p,id,data) => t.set(doc(server,p,id),data), remove:(p,id)=>t.delete(doc(server,p,id)),
      update: (p,id,data) => t.update(doc(server,p,id),data),
    }));
  },
};
const bundle = await build({
  stdin:{contents:"export * from './src/app/v2/data/workStations'; export * from './shared/work-stations'; export { stationsOf } from './src/app/v2/screens/events/logic';",resolveDir:process.cwd(),loader:'ts'},
  platform:'node',format:'cjs',bundle:true,write:false,
  plugins:[{name:'station-test-adapter', setup(build) {
    build.onResolve({filter:/^\.\.\/\.\.\/db$/}, a => a.importer.endsWith('/data/workStations.ts') ? {path:'db',namespace:'fixture'} : undefined);
    build.onResolve({filter:/^\.\.\/\.\.\/clock$/}, a => a.importer.endsWith('/data/workStations.ts') ? {path:'clock',namespace:'fixture'} : undefined);
    build.onLoad({filter:/.*/,namespace:'fixture'}, a => ({contents: a.path==='clock' ? 'export const nowIso=()=>'+JSON.stringify(at)+'; export const nowMs=()=>Date.parse(nowIso());' : 'export const {newId,readOnce,transact}=globalThis.stationTestAdapter;export const useDoc=()=>{};export class ConflictError extends Error {};' }));
  }}],
});
const moduleFacade = {exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(moduleFacade,moduleFacade.exports,require);
const S = moduleFacade.exports;
try {
  await env.clearFirestore();
  const role = (uid,role) => ({uid,role,status:'active',displayName:uid,email:uid+'@example.invalid'});
  const shift = (uid,job,hours) => ({uid,name:uid,hours,role:job,startsAt:'2030-06-10T08:00:00.000Z',endsAt:'2030-06-10T10:00:00.000Z'});
  const first=shift('crew','בידוק','10:00-12:00'),samePerson=shift('crew','קופה','14:00-16:00'),other=shift('other','הכוונה','11:00-12:00');
  const station=(name,people) => ({station:name,needed:1,people});
  await env.withSecurityRulesDisabled(async ctx => {
    const db=ctx.firestore();const jobs=[['users/manager',role('manager','manager')],['users/staff',role('staff','staff')],['users/guest',role('guest','guest')]];
    for (const eid of ['a','b','past']) {
      jobs.push(['events/'+eid,{title:eid,entry:true,stall:true,start:eid==='past'?'2029-05-01T08:00:00.000Z':at,end:eid==='past'?'2029-05-01T10:00:00.000Z':activeEnd}]);
      jobs.push(['events/'+eid+'/staffing/gate',station('שער מקורי',eid==='b'?[other]:[first])]);
    }
    jobs.push(['events/a/staffing/parking',station('חניה',[samePerson])]);
    await Promise.all(jobs.map(([p,x])=>setDoc(doc(db,p),x)));
  });
  const pastBefore = await seen(manager,'events/past/staffing/gate');
  const created = await S.saveWorkStation('  קבלה  ראשית ',[]);
  assert.equal(created.name,'קבלה ראשית');
  await assert.rejects(S.saveWorkStation('קבלה ראשית',[]),/כבר קיימת/);
  assert.equal((await S.saveWorkStation('מודיעין',[],created)).id,created.id);
  await assert.rejects(S.saveWorkStation('עריכה מיושנת',[],created),/השתנה/);
  await assertFails(setDoc(doc(staff,'work_stations/farm'),{stations:{},moving:null}));
  await assertFails(getDoc(doc(guest,'work_stations/farm')));
  assert((await seen(staff,'work_stations/farm')).stations[created.id]);
  await assertFails(deleteDoc(doc(manager,'events/a/staffing/gate')));
  await assert.rejects(S.retireWorkStation({id:'gate',name:'שער'},null),/חלופית/);
  assert.equal((await seen(manager,'work_stations/farm')).moving,null);
  failOnce='events/b/staffing';
  const old={id:'gate',name:'שער'},target={id:'parking',name:'חניה'};
  await assert.rejects(S.retireWorkStation(old,target),/interrupted fixture/);
  assert.equal((await seen(manager,'work_stations/farm')).moving.from,'gate');
  assert.equal(await seen(manager,'events/a/staffing/gate'),null);
  await assertFails(setDoc(doc(manager,'events/a/staffing/gate'),station('שער',[other])));
  await assertFails(deleteDoc(doc(manager,'events/b/staffing/gate')));
  await S.retireWorkStation(old,target);
  const registry=await seen(manager,'work_stations/farm');
  assert.equal(registry.moving,null);assert.equal(registry.stations.gate.replacementId,'parking');
  const inA=await seen(manager,'events/a/staffing/parking'), inB=await seen(manager,'events/b/staffing/parking');
  assert.deepEqual(inA.people.map(p=>p.role),['קופה','בידוק']);assert.equal(inB.people[0].role,'הכוונה');
  assert.equal(new Set(inA.people.map(S.assignmentKey)).size,2);
  for (const [name,val] of Object.entries(first)) assert.deepEqual(inA.people[1][name],val,name);
  assert.deepEqual(await seen(manager,'events/past/staffing/gate'),pastBefore);
  assert(!S.stationsOf({entry:true,stall:true},[],registry).some(s=>s.id==='gate'));
  assert(S.stationsOf({entry:true,stall:true},[pastBefore]).some(s=>s.station==='שער מקורי'));
  await S.retireWorkStation(old,target);
  assert.equal((await seen(manager,'events/a/staffing/parking')).people.length,2);
  await S.retireWorkStation({id:created.id,name:'מודיעין'},null);
  assert(!S.catalogStations(await seen(manager,'work_stations/farm')).some(s=>s.id===created.id));
  console.log('PASS farm stations: manager permissions, old and new stations, duplicate names and stale edits, cross-event transfer, two roles for one person, interrupted retry, historic events and no resurrection.');
} finally {
  delete globalThis.stationTestAdapter;
  await env.cleanup();
}
