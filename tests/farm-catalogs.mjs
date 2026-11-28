// Real app catalog transactions, Firestore Rules and the Worker's HTTP handler, all using one loopback emulator.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
require('firebase/compat/firestore');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, getDocsFromServer, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const host = process.env.FIRESTORE_EMULATOR_HOST || '';
assert.match(host,/^(localhost|127\.0\.0\.1):\d+$/,'Only a local Firestore emulator is supported.');
const [address,port] = host.split(':'), projectId = 'demo-havat-farm-catalogs';
const env = await initializeTestEnvironment({projectId,firestore:{host:address,port:+port,rules:await fs.readFile('firestore.rules','utf8')}});
const account = uid => env.authenticatedContext(uid,{email:uid+'@example.invalid',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
const at = '2030-01-15T09:00:00.000Z', manager=account('g4-manager'), owner=account('g4-owner'), staff=account('g4-staff');
const row = d => d.exists() ? {...d.data(),id:d.id} : null;
const read = (path,db=manager) => getDoc(doc(db,path)).then(row);
const list = async path => (await getDocsFromServer(collection(manager,path))).docs.map(row);
let acting=owner;
globalThis.g4Tx = {
 newId:()=>randomUUID(),
 transact:(fn,options)=>{
  assert(options.serverOnly);
  return runTransaction(acting,async tx=>fn({get:async(p,id)=>row(await tx.get(doc(acting,p,id))),set:(p,id,data)=>tx.set(doc(acting,p,id),data),update:(p,id,data)=>tx.update(doc(acting,p,id),data)}));
 },
};
async function load(contents,plugins=[]){
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents,loader:'ts'},platform:'node',format:'cjs',target:'es2022',write:false,bundle:true,plugins,logLevel:'silent'});
 const mod={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,require);return mod.exports;
}
try {
 await env.clearFirestore();
 const baseline={name:'תה ישן',price:6},sale={eventId:'a',guestUid:'g4-example',items:[{productId:'catalog_6_drinks_tea',name:'תה ישן',price:6,qty:2,at,by:{uid:'g4-staff',name:'צוות בדיקה'}}],total:12};
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),jobs=[];
  for(const [id,r] of [['g4-owner','owner'],['g4-manager','manager'],['g4-staff','staff']]) jobs.push(['users/'+id,{uid:id,role:r,status:'active',displayName:id,email:id+'@example.invalid',createdAt:at,updatedAt:at}]);
  for(const id of ['a','b','c'])jobs.push(['events/'+id,{title:'אירוע דמה '+id,entry:false,stall:true,start:at,end:'2030-01-15T19:00:00.000Z'}]);
  jobs.push(['farm_catalogs/drinks',{name:'משקאות',createdAt:at,updatedAt:at}],['farm_catalogs/drinks/products/tea',{...baseline,createdAt:at,updatedAt:at}],['events/a/products/standalone',{name:'מיץ חד פעמי',price:19,sort:4,active:true}],['tabs/g4-past',sale]);
  await Promise.all(jobs.map(([p,data])=>setDoc(doc(db,p),data)));
 });
 const app=await load("export * from './src/app/v2/data/farmCatalogs'; export {isCurrentCatalogSelection} from './shared/farm-catalogs'",[{name:'actual-emulator-transactions',setup(b){
  b.onResolve({filter:/^\.\.\/\.\.\/db$/},()=>({path:'db',namespace:'g4'}));
  b.onLoad({filter:/.*/,namespace:'g4'},()=>({contents:'export const {newId,transact}=globalThis.g4Tx;export const useList=()=>{};export class ConflictError extends Error{};'}));
 }}]);
 const groupPath=id=>'farm_catalogs/'+id,prd=(cid,pid)=>groupPath(cid)+'/products/'+pid,selection=(eid,cid,pid)=>'events/'+eid+'/products/'+app.selectionId(cid,pid);
 for (const bad of [{catalogId:'drinks'},{catalogProductId:'tea'},{catalogId:'drinks',catalogProductId:''}]){
   assert.equal(app.isCurrentCatalogSelection({...bad,active:true},{},{}),false);
   const broken={...bad,id:'broken',name:'מקור חסר',active:true,price:1,sort:1};assert.equal(await app.copyFarmProducts('a','c',[broken]),0);
   const {id,...fields}=broken;await assertFails(setDoc(doc(manager,'events/b/products/broken'),fields));
 }
 assert.equal(app.isCurrentCatalogSelection({active:true}),true);
 const gid=await app.saveCatalogEntry({kind:'catalog'},'  מאפים  '),g=await read(groupPath(gid));
 assert.equal(g.name,'מאפים');
 acting=manager;await app.saveCatalogEntry({kind:'catalog',catalog:g},'לחמים');await assert.rejects(app.saveCatalogEntry({kind:'catalog',catalog:g},'שם מיושן'),/השתנו/);
 const group=await read(groupPath(gid)),pid=await app.saveCatalogEntry({kind:'product',catalog:group},'לחם',0);
 const old=await read(prd(gid,pid));assert.equal(old.price,0);
 await app.saveCatalogEntry({kind:'product',catalog:group,product:old},'לחם דמה',23.5);
 await assert.rejects(app.saveCatalogEntry({kind:'product',catalog:group,product:old},'לחם מיושן',11),/השתנו/);
 await assert.rejects(app.saveCatalogEntry({kind:'product',catalog:group},'מחיר שגוי',-5));
 await assertFails(setDoc(doc(manager,selection('a','drinks','tea')),{catalogId:'drinks',catalogProductId:'tea',active:true,sort:1,name:baseline.name,price:baseline.price}));
 await app.selectCatalogProduct('a','drinks','tea',true);await app.selectCatalogProduct('a',gid,pid,true,1);
 assert.equal((await read('events/a/stall_config/catalog')).enabled,true);
 await app.selectCatalogProduct('a','drinks','tea',true);
 assert.equal((await list('events/a/products')).length,3);
 const tea=await read(prd('drinks','tea')),drinks=await read(groupPath('drinks'));await app.saveCatalogEntry({kind:'product',catalog:drinks,product:tea},'תה חדש',12);
 await app.selectCatalogProduct('b','drinks','tea',true);
 assert.equal((await read(selection('a','drinks','tea'))).price,6);assert.equal((await read(selection('b','drinks','tea'))).price,12);
 await assertFails(updateDoc(doc(manager,selection('a','drinks','tea')),{price:3}));
 const spare=await app.saveCatalogEntry({kind:'product',catalog:group},'עוגה',4);await app.archiveCatalogEntry(group,await read(prd(gid,spare)),true);
 const food=await read(prd(gid,pid));await app.archiveCatalogEntry(group,undefined,true);await app.archiveCatalogEntry(group,undefined,true);
 await assert.rejects(app.saveCatalogEntry({kind:'product',catalog:group},'מוצר בארכיון',2),/ארכיון/);
 await assert.rejects(app.selectCatalogProduct('b',gid,pid,true),/ארכיון/);
 const stale=await read(selection('a',gid,pid));assert.equal((await read(groupPath(gid))).generation,1);
 assert.equal(app.isCurrentCatalogSelection(stale,await read(groupPath(gid)),food),false);
 assert.deepEqual(await read(prd(gid,pid)),food);
 await assertFails(setDoc(doc(manager,selection('b',gid,pid)),{catalogId:gid,catalogProductId:pid,active:true,sort:2,name:food.name,price:food.price}));
 await assertFails(deleteDoc(doc(manager,groupPath(gid))));await assertFails(deleteDoc(doc(manager,prd(gid,pid))));
 await assertFails(deleteDoc(doc(manager,selection('a','drinks','tea'))));await assertFails(updateDoc(doc(manager,prd(gid,pid)),{name:'שינוי סמוי'}));
 assert.equal((await read(groupPath(gid),staff)).id,gid);await assertFails(getDocsFromServer(collection(staff,'farm_catalogs')));await assertFails(setDoc(doc(staff,'farm_catalogs/no'),{name:'לא מורשה',createdAt:at,updatedAt:at}));
 const source=await list('events/a/products');assert.equal(await app.copyFarmProducts('a','c',source),2);
 assert.equal((await read(selection('c','drinks','tea'))).price,12);assert.equal(await read(selection('c',gid,pid)),null);
 assert.deepEqual((await list('events/c/products')).map(p=>p.name).sort(),['מיץ חד פעמי','תה חדש'].sort());
 assert.equal(await app.copyFarmProducts('a','c',source),0);
 await assertFails(updateDoc(doc(manager,selection('a',gid,pid)),{catalogGeneration:1}));
 await app.archiveCatalogEntry(await read(groupPath(gid)),undefined,false);
 assert.equal((await read(prd(gid,spare))).archived,true);
 assert.equal(app.isCurrentCatalogSelection(stale,await read(groupPath(gid)),food),false);
 assert.equal(await app.copyFarmProducts('a','c',source),0);
 await app.selectCatalogProduct('a',gid,pid,true);assert.equal((await read(selection('a',gid,pid))).catalogGeneration,1);
 assert.equal(app.isCurrentCatalogSelection(await read(selection('a',gid,pid)),await read(groupPath(gid)),food),true);
 await app.selectCatalogProduct('a',gid,pid,false);assert.equal((await read(selection('a',gid,pid))).active,false);
 assert.equal((await read('events/c/stall_config/catalog')).enabled,true);
 await assert.rejects(app.selectCatalogProduct('a',gid,spare,true),/ארכיון/);
 await app.archiveCatalogEntry(await read(groupPath(gid)),await read(prd(gid,spare)),false);
 await app.selectCatalogProduct('a',gid,spare,true);await app.selectCatalogProduct('a','drinks','tea',false);await app.selectCatalogProduct('a','drinks','tea',true);
 assert.equal((await read(selection('a','drinks','tea'))).price,12);
 assert.deepEqual((await read('tabs/g4-past')).items,sale.items);
 console.log('PASS application transactions and Rules: legacy catalogs, CRUD + zero price, stale edits, two events and multiple catalogs, idempotent selection and copy, parent/child archive and restore, guardrails, read-only staff, historic sale.');
 const worker=(await load("export {default} from './api/src/index'")).default;
 const key='hr_'+randomBytes(32).toString('base64url'),by='user:g4-manager';
 const bindings={FIRESTORE_PROJECT_ID:projectId,FIRESTORE_EMULATOR_HOST:host,TEST_FAULTS:'1',EMAIL_ENABLED:'false',
 API_CREDENTIALS:JSON.stringify([{id:'g4-local-key',sha256:createHash('sha256').update(key).digest('hex'),actors:[by,'user:g4-staff']}])};
 const originalFetch=globalThis.fetch;
 bindings.FETCH=(input,init)=>{assert.equal(new URL(input instanceof Request?input.url:input).host,host);return originalFetch(input,init)};
 async function invoke(op,data,status=200,who=by,idem=randomUUID()){
  const req=new Request('http://localhost/v1/actions/'+op,{method:'POST',headers:{authorization:'Bearer '+key,'x-actor-id':who,'content-type':'application/json','idempotency-key':idem},body:JSON.stringify(data)});
  const pending=[];const res=await worker.fetch(req,bindings,{waitUntil:p=>pending.push(p)});await Promise.allSettled(pending);const body=await res.json();
  assert.equal(res.status,status,op+' '+JSON.stringify(body));return body.data;
 }
 const apiCat=await invoke('farmCatalogs.save',{name:'קטלוג API'});const cid=apiCat.catalogId;
 await invoke('farmCatalogs.save',{catalogId:cid,name:'דוכן API'});const product=await invoke('farmCatalogs.saveProduct',{catalogId:cid,name:'קפה',price:10});const aid=product.catalogProductId;
 const payload={eventId:'a',catalogId:cid,productId:aid,active:true};
 await invoke('farmCatalogs.selectForEvent',payload);await invoke('farmCatalogs.saveProduct',{catalogId:cid,productId:aid,name:'קפה עדכני',price:13});
 await invoke('events.saveProduct',{eventId:'a',productId:app.selectionId(cid,aid),price:20},400);
 const copy=await invoke('events.copyProducts',{eventId:'b',fromEventId:'a'},201);assert(copy.productIds.includes(app.selectionId(cid,aid)));
 assert.equal((await read(selection('b',cid,aid))).price,13);
 await invoke('farmCatalogs.setArchived',{catalogId:cid,archived:true});await invoke('farmCatalogs.setArchived',{catalogId:cid,archived:true});
 await invoke('farmCatalogs.saveProduct',{catalogId:cid,name:'לא פעיל',price:1},400);await invoke('farmCatalogs.save',{catalogId:cid,name:'לא פעיל'},400);
 await invoke('farmCatalogs.selectForEvent',{...payload,eventId:'c'},400);
 await invoke('events.deleteProduct',{eventId:'a',productId:app.selectionId(cid,aid)});assert.equal((await read(selection('a',cid,aid))).active,false);
 await invoke('events.saveProduct',{eventId:'a',productId:app.selectionId(cid,aid),active:true},400);
 await invoke('farmCatalogs.setArchived',{catalogId:cid,archived:false},403,'user:g4-staff');
 await invoke('farmCatalogs.setArchived',{catalogId:cid,archived:false});
 assert.equal(app.isCurrentCatalogSelection(await read(selection('b',cid,aid)),await read(groupPath(cid)),await read(prd(cid,aid))),false);
 await invoke('events.saveProduct',{eventId:'a',productId:app.selectionId(cid,aid),active:true});assert.equal((await read(selection('a',cid,aid))).price,13);
 await invoke('farmCatalogs.setArchived',{catalogId:cid,productId:aid,archived:true});await invoke('farmCatalogs.selectForEvent',{...payload,eventId:'c'},400);
 await invoke('farmCatalogs.selectForEvent',{...payload,active:false});await invoke('farmCatalogs.setArchived',{catalogId:cid,productId:aid,archived:false});
 await invoke('farmCatalogs.selectForEvent',payload);assert.equal((await read(selection('b',cid,aid))).price,13);
 assert.equal((await read(selection('a',cid,aid))).catalogGeneration,1);assert.equal((await read(selection('a',cid,aid))).catalogProductGeneration,1);
 assert.equal(app.isCurrentCatalogSelection(await read(selection('b',cid,aid)),await read(groupPath(cid)),await read(prd(cid,aid))),false);
 assert.deepEqual((await read('tabs/g4-past')).items,sale.items);
 console.log('PASS Worker HTTP actions: owner/manager data contract, staff refused, new and legacy actions, populated archive, snapshot prices, copy and restored product.');
} finally {delete globalThis.g4Tx;await env.cleanup();}
