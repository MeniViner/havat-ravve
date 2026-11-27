// FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> node tests/operational-messages.mjs. No delivery provider is called.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const host=process.env.FIRESTORE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(host || '')) throw new Error('This test requires a loopback Firestore emulator');
const project='demo-operations-local';
const env={FIRESTORE_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:host,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'};
const bundle=await build({stdin:{contents:"export * from './api/src/operationalMessages';export {Firestore} from './api/src/firestore'",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {operationalMessageRoute,Firestore,allowsOperationalChannel}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const db=new Firestore(env);
const runId=randomUUID().slice(0,8);
const id=label=>runId+'-'+label;
const auth=uid=>{
  const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),seconds=Math.floor(Date.now()/1000);
  return new Request('http://127.0.0.1/v1/test',{method:'POST',headers:{authorization:'Bearer '+b({alg:'none'})+'.'+b({sub:uid,aud:project,iss:'https://securetoken.google.com/'+project,iat:seconds,exp:seconds+3600})+'.'}});
};
const refs=Object.fromEntries(['boss','crew','guest','stall','newStall','declined','inactive','eve','cashier','visitor'].map(k=>[k,id(k)]));
const p=(key,role,num,active=true)=>db.create('users',refs[key],{displayName:key,role,status:active?'active':'blocked',phone:'050000'+String(num).padStart(4,'0'),email:key+'@example.test',...(role==='vendor'?{vendorId:id('stall-'+key)}:{}),push:{enabled:key!=='newStall',devices:[{ua:'test'}],kinds:['event']}});
const event=refs.eve;
const ticket=(name,key,properties={})=>db.create('tickets',id(name),{ownerUid:refs[key],ownerName:key,ownerPhone:'0500000025',status:'valid',paymentStatus:'free',eventId:event,orderId:id('ord-'+name),...properties});
const proofs=(name,key)=>db.create('activity',id('proof-'+name),{kind:'ticket',action:'ordered',eventId:event,refId:id('ord-'+name),by:{uid:refs[key]},subjectUid:refs[key]});
await db.commit([p('boss','manager',1),p('crew','staff',2),p('guest','guest',3),p('stall','vendor',4),p('newStall','guest',5),p('declined','vendor',6),p('inactive','guest',7,false),p('cashier','manager',8),p('visitor','guest',9),
  db.create('events',event,{title:'אירוע דמיוני'}),ticket('guest-ticket','guest',{selfRegistered:true}),ticket('guest-duplicate','guest',{selfRegistered:true}),ticket('crew-ticket','crew'),proofs('crew-ticket','crew'),
  ticket('cancelled','declined',{selfRegistered:true,status:'cancelled'}),ticket('blocked','inactive',{selfRegistered:true}),ticket('manual','cashier',{ownerName:'מוזמן בדוי',ownerPhone:'0500000098',selfRegistered:false}),
  ticket('old-manual','cashier',{ownerName:'cashier',ownerPhone:'0500000008'}),ticket('walk-in','cashier',{walkIn:true}),ticket('test','declined',{selfRegistered:true,isTest:true}),
  db.create('events/'+event+'/staffing','a',{people:[{uid:refs.crew},{uid:refs.guest}]}),
  db.create('events/'+event+'/vendors',id('stall-stall'),{vendorId:id('stall-stall'),status:'confirmed'}),
  db.create('events/'+event+'/vendors',id('stall-declined'),{vendorId:id('stall-declined'),status:'invited'}),
  db.create('events/'+event+'/vendor_applications',refs.newStall,{ownerUid:refs.newStall,status:'approved'})]);
const command={operationId:id('notice'),eventId:event,groups:['registrants','crew','approvedVendors'],channels:['whatsapp','push','email'],text:'תזכורת דמיונית'};
const call=(source,input,who=refs.boss)=>operationalMessageRoute(auth(who),env,source,input);
await assert.rejects(call('event',command,refs.crew),e=>e.code==='FORBIDDEN');
await assert.rejects(call('event',{...command,recipients:[refs.boss]}),e=>e.code==='VALIDATION_FAILED');
const sent=await call('event',command);
assert.equal(sent.created,3);assert.equal(sent.queued,5);assert.equal(sent.drafts.length,6);assert.equal(sent.pending,false);
assert.deepEqual(await call('event',command),sent);
await assert.rejects(call('event',{...command,text:'תוכן אחר'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
const scoped=(col,attr,v)=>db.query({from:[{collectionId:col}],where:{fieldFilter:{field:{fieldPath:attr},op:'EQUAL',value:{stringValue:v}}}});
const plans=await scoped('operational_notices','sourceId',event);assert.equal(plans.length,1);const plan=plans[0];
assert.deepEqual(plan.data.emailUids.slice().sort(),[refs.crew,refs.guest,refs.stall,refs.newStall].sort());
assert(!allowsOperationalChannel(plan.data,refs.cashier,'push'));assert(!allowsOperationalChannel(plan.data,refs.newStall,'push'));assert(allowsOperationalChannel(plan.data,refs.guest,'email'));
const mail=await scoped('email_outbox','operationalId',plan.id),push=await scoped('push_jobs','operationalId',plan.id);
assert.equal(mail.length,4);assert.equal(push.length,1);assert.equal(push[0].data.to.length,3);assert(mail.every(m=>m.data.status==='queued'));
const text='בקשת הביקור הדמיונית נדחתה',updated='2026-11-19T12:00:00.000Z';
const visit=id('visit');
await db.commit([db.create('visits',visit,{uid:refs.visitor,name:'מבקש דוגמה',date:'2026-12-11',phone:'0500000009',people:2,status:'new',updatedAt:updated,managerNote:'הערה פנימית'}),db.create('notifications',id('vnote'),{type:'visit',refId:visit,handled:false})]);
const decision={operationId:id('reply'),visitId:visit,text,channels:['whatsapp','email'],decision:{status:'rejected',expectedUpdatedAt:updated}};
const reply=await call('visit',decision);
assert.deepEqual([reply.created,reply.queued,reply.drafts.length],[1,1,1]);assert.match(reply.drafts[0].url,/972500000009/);
assert.equal((await db.get('visits',visit)).data.managerNote,'הערה פנימית');assert.equal((await db.get('notifications',id('vnote'))).data.handled,true);
assert.equal(await db.get('calendar','visit_'+visit),null);assert.deepEqual(await call('visit',decision),reply);
await assert.rejects(call('visit',{...decision,operationId:id('stale')}),e=>e.code==='STALE_WRITE');
const scheduled=id('scheduled');
await db.commit([db.create('visits',scheduled,{uid:refs.visitor,name:'אורחת דוגמה',date:'2026-12-01',people:2,status:'new',updatedAt:updated})]);
const approve={operationId:id('approve'),visitId:scheduled,text:'המועד עודכן',channels:[],decision:{status:'approved',date:'2026-12-03',time:'10:30',expectedUpdatedAt:updated}};
const approvals=await Promise.all([call('visit',approve),call('visit',approve)]);
assert.deepEqual(approvals[0],approvals[1]);assert.equal(approvals[0].created,1);assert.equal(approvals[0].queued,0);
const calendar=(await db.get('calendar','visit_'+scheduled)).data;
assert.equal(calendar.date,'2026-12-03');assert.equal(calendar.time,'10:30');assert.equal((await db.get('visits',scheduled)).data.date,'2026-12-01');
console.log('PASS event and visit messages: manager authorization, legacy identity, group deduplication, new approved stall, channel eligibility, local outboxes, replay and concurrent approval');
