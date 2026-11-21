// Rules tests for the team app collections (users, invites, tasks, task_templates, shopping, places).
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);require('firebase/compat/firestore');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocFromCache,getDocs,collection,updateDoc,deleteDoc,query,where,arrayUnion,increment,disableNetwork,enableNetwork,writeBatch,serverTimestamp,Timestamp}=require('firebase/firestore');
import {build} from 'esbuild';
await build({entryPoints:['src/app/calendarRef.ts'],bundle:true,platform:'node',format:'esm',outfile:'.build/calendar-ref-test.mjs',logLevel:'silent'});const {eventCalendarFields}=await import('../.build/calendar-ref-test.mjs');

const env=await initializeTestEnvironment({projectId:'demo-havat-ravve',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
const claims=email=>({email,email_verified:true,firebase:{sign_in_provider:'google.com'}});
const ctx=(uid,email)=>env.authenticatedContext(uid,claims(email)).firestore();
const now=new Date().toISOString();
const profile=(uid,email,role,status,extra={})=>({uid,email,displayName:'בדיקה',phone:'0500000000',role,status,customerNumber:1,acceptedTermsAt:now,createdAt:now,updatedAt:now,...extra});
const actor=(uid)=>({uid,name:'בדיקה'});
const task=(uid,extra={})=>({title:'משימה',note:'',photo:'',location:null,dueDate:'',managersOnly:false,templateId:null,dateKey:null,createdBy:actor(uid),createdAt:now,done:false,doneBy:null,doneAt:null,donePhoto:'',doneNote:'',assignee:null,urgent:false,updatedAt:now,...extra});
const item=(uid,extra={})=>({title:'חלב',qty:'',urgent:false,note:'',link:'',category:'super',createdBy:actor(uid),createdAt:now,bought:false,boughtBy:null,boughtAt:null,expireAt:null,updatedAt:now,...extra});

try{
 const owner=ctx('owner','meniviner@gmail.com');
 const beni=ctx('beni','beni@example.com');
 const vol=ctx('vol','vol@example.com');
 const guest=ctx('guest','guest@example.com');
 const stranger=ctx('stranger','stranger@example.com');
 const anon=env.unauthenticatedContext().firestore();

 // --- profiles ---
 await assertFails(setDoc(doc(anon,'users','x'),profile('x','x@example.com','guest','active')));
 await assertSucceeds(setDoc(doc(owner,'users','owner'),profile('owner','meniviner@gmail.com','owner','active')));
 await assertFails(setDoc(doc(beni,'users','beni'),profile('beni','beni@example.com','owner','active')));      // only the bootstrap email may self-create as owner
 await assertFails(setDoc(doc(beni,'users','beni'),profile('beni','beni@example.com','manager','active')));    // nobody self-creates as manager
 await assertFails(setDoc(doc(beni,'users','beni'),profile('beni','beni@example.com','staff','active')));      // staff needs a pre-assigned role
 await assertSucceeds(setDoc(doc(beni,'users','beni'),profile('beni','beni@example.com','guest','active')));
 const guestProfile=doc(guest,'users','guest');
 await assertFails(setDoc(guestProfile,profile('guest','guest@example.com','guest','active',{fields:{receiptPreference:'sms'}})));
 await assertSucceeds(setDoc(guestProfile,profile('guest','guest@example.com','guest','active',{fields:{city:'באר שבע',source:'חברים'}})));
 await assertSucceeds(setDoc(guestProfile,{fields:{receiptPreference:'whatsapp'},updatedAt:now},{merge:true}));
 await assertSucceeds(setDoc(guestProfile,{fields:{receiptPreference:'email'},updatedAt:now},{merge:true}));
 await assertFails(setDoc(guestProfile,{fields:{receiptPreference:'sms'},updatedAt:now},{merge:true}));
 assert.deepEqual((await getDoc(guestProfile)).data().fields,{city:'באר שבע',source:'חברים',receiptPreference:'email'});
 await assertFails(setDoc(doc(stranger,'users','someone-else'),profile('someone-else','stranger@example.com','guest','active')));
 await assertFails(getDoc(doc(guest,'users','beni')));                        // guests cannot read others
 await assertFails(getDocs(collection(beni,'users')));                        // guests cannot list

 // owner promotes beni to manager; beni approves a volunteer later
 await assertSucceeds(updateDoc(doc(owner,'users','beni'),{role:'manager',status:'active',notes:'',updatedAt:now}));
 await assertSucceeds(getDocs(collection(beni,'users')));
 await assertFails(updateDoc(doc(beni,'users','owner'),{role:'guest',status:'active',notes:'',updatedAt:now})); // manager cannot touch an owner
 await assertFails(updateDoc(doc(beni,'users','guest'),{role:'owner',status:'active',notes:'',updatedAt:now})); // manager cannot create owners
 await assertFails(updateDoc(doc(beni,'users','guest'),{role:'manager',status:'active',notes:'',updatedAt:now})); // manager cannot promote to manager
 await assertFails(setDoc(doc(beni,'users','guest'),{fields:{receiptPreference:'whatsapp'},updatedAt:now},{merge:true}));
 await assertSucceeds(updateDoc(doc(guest,'users','guest'),{displayName:'אורח',phone:'',updatedAt:now}));
 await assertFails(updateDoc(doc(guest,'users','guest'),{role:'manager',status:'active',updatedAt:now}));

 // --- role by email (pre-assignment) ---
 await assertFails(setDoc(doc(guest,'role_invites','vol@example.com'),{email:'vol@example.com',role:'staff',createdBy:actor('guest'),createdAt:now}));
 await assertSucceeds(setDoc(doc(beni,'role_invites','vol@example.com'),{email:'vol@example.com',role:'staff',createdBy:actor('beni'),createdAt:now}));
 await assertFails(setDoc(doc(beni,'role_invites','m@example.com'),{email:'m@example.com',role:'manager',createdBy:actor('beni'),createdAt:now}));   // only owners pre-assign managers
 await assertSucceeds(setDoc(doc(owner,'role_invites','m@example.com'),{email:'m@example.com',role:'manager',createdBy:actor('owner'),createdAt:now}));
 await assertFails(setDoc(doc(vol,'users','vol'),profile('vol','vol@example.com','manager','active')));          // invite says staff, not manager
 await assertSucceeds(setDoc(doc(vol,'users','vol'),profile('vol','vol@example.com','staff','active')));
 const mgr=ctx('m','m@example.com');
 await assertSucceeds(setDoc(doc(mgr,'users','m'),profile('m','m@example.com','manager','active')));
 await assertFails(updateDoc(doc(guest,'users','guest'),{role:'staff',status:'active',updatedAt:now}));          // no self-promotion
 await assertSucceeds(updateDoc(doc(beni,'users','guest'),{role:'staff',status:'active',notes:'',updatedAt:now,log:[{at:now,by:actor('beni'),text:'x'}]}));
 // activity log
 await assertSucceeds(setDoc(doc(vol,'activity','a1'),{kind:'task',refId:'t1',action:'done',text:'x',by:actor('vol'),at:now,subjectUid:'',eventId:''}));
 await assertFails(setDoc(doc(vol,'activity','a2'),{kind:'task',refId:'t1',action:'done',text:'x',by:actor('beni'),at:now,subjectUid:'',eventId:''}));  // cannot write as someone else
 await assertSucceeds(setDoc(doc(guest,'activity','a3'),{kind:'visit',refId:'v1',action:'requested',text:'x',by:actor('guest'),at:now,subjectUid:'guest',eventId:''}));
 await assertFails(getDoc(doc(vol,'activity','a3')));                                                           // staff cannot read visit activity
 await assertSucceeds(getDoc(doc(guest,'activity','a3')));                                                      // but the subject can
 await assertSucceeds(getDocs(query(collection(vol,'activity'),where('kind','==','task'))));
 await assertFails(getDocs(collection(vol,'activity')));
 await assertSucceeds(getDocs(collection(beni,'activity')));
 await assertFails(updateDoc(doc(beni,'activity','a1'),{text:'changed'}));
 // managers-only task history: its own kind, so no volunteer query can return the title
 const act=(by,kind,refId,extra={})=>({kind,refId,action:'created',text:'סוד של מנהלים',by:actor(by),at:now,subjectUid:'',eventId:'',...extra});
 await assertSucceeds(setDoc(doc(beni,'activity','p1'),act('beni','task_private','tp1',{subjectUid:'vol'})));   // even assigned to the volunteer
 await assertSucceeds(setDoc(doc(beni,'activity','p2'),act('beni','task','to1')));                              // an open task, by the same manager
 await assertFails(getDoc(doc(vol,'activity','p1')));                                                          // by id
 await assertFails(getDocs(query(collection(vol,'activity'),where('refId','==','tp1'))));                      // by refId
 await assertFails(getDocs(query(collection(vol,'activity'),where('kind','==','task_private'),where('refId','==','tp1'))));
 await assertFails(getDocs(query(collection(vol,'activity'),where('kind','in',['task','task_private']),where('refId','==','tp1'))));
 await assertFails(getDocs(query(collection(vol,'activity'),where('kind','==','task_private'))));              // by kind
 await assertFails(getDocs(query(collection(vol,'activity'),where('by.uid','==','beni'))));                    // by actor
 await assertFails(getDocs(query(collection(vol,'activity'),where('subjectUid','==','vol'))));                 // by subject: the assignee neither
 const volByActor=await getDocs(query(collection(vol,'activity'),where('kind','in',['task','shopping','event','ticket','tab','place']),where('by.uid','==','beni')));
 assert.deepEqual(volByActor.docs.map((d)=>d.id),['p2']);                                                      // the allowed actor query still never returns it
 const volOpen=await getDocs(query(collection(vol,'activity'),where('kind','==','task'),where('refId','==','to1')));
 assert.equal(volOpen.size,1);                                                                                 // an open task's history stays readable
 const mgrHist=await getDocs(query(collection(beni,'activity'),where('kind','in',['task','task_private']),where('refId','==','tp1')));
 assert.equal(mgrHist.size,1);                                                                                 // a manager still sees it
 // a task changing visibility: a manager moves its history between the two kinds, nothing else
 await assertFails(updateDoc(doc(vol,'activity','p2'),{kind:'task_private'}));
 await assertFails(updateDoc(doc(beni,'activity','p2'),{kind:'task_private',text:'x'}));
 await assertFails(updateDoc(doc(beni,'activity','a3'),{kind:'task'}));                                        // only task entries
 await assertFails(updateDoc(doc(beni,'activity','p2'),{kind:'visit'}));
 await assertSucceeds(updateDoc(doc(beni,'activity','p2'),{kind:'task_private'}));
 await assertFails(getDoc(doc(vol,'activity','p2')));                                                          // hidden once the task is managers-only
 await assertSucceeds(updateDoc(doc(beni,'activity','p1'),{kind:'task'}));
 await assertSucceeds(getDoc(doc(vol,'activity','p1')));                                                       // shown again once it is open
 await assertFails(deleteDoc(doc(beni,'activity','p1')));

 // --- tasks ---
 await assertFails(setDoc(doc(stranger,'tasks','t0'),task('stranger')));                                      // no profile
 await assertSucceeds(setDoc(doc(vol,'tasks','t1'),task('vol')));
 await assertFails(setDoc(doc(vol,'tasks','t2'),task('vol',{managersOnly:true})));                             // staff cannot create managers-only
 await assertSucceeds(setDoc(doc(beni,'tasks','t2'),task('beni',{managersOnly:true})));
 // a task may name the event it prepares: optional, a short string
 await assertSucceeds(setDoc(doc(vol,'tasks','te1'),task('vol',{eventId:'ev-tour'})));
 await assertFails(setDoc(doc(vol,'tasks','te2'),task('vol',{eventId:7})));
 await assertFails(setDoc(doc(vol,'tasks','te3'),task('vol',{eventId:'x'.repeat(61)})));
 await assertSucceeds(updateDoc(doc(vol,'tasks','te1'),{eventId:'',updatedAt:now}));                       // the creator unlinks it
 await assertSucceeds(updateDoc(doc(beni,'tasks','t2'),{eventId:'ev-tour',updatedAt:now}));                // a manager links an older task
 await assertFails(setDoc(doc(vol,'tasks','t3'),task('vol',{createdBy:actor('beni')})));                       // cannot impersonate
 await assertFails(setDoc(doc(vol,'tasks','t4'),task('vol',{done:true,doneBy:actor('vol'),doneAt:now})));      // created already done
 await assertFails(setDoc(doc(vol,'tasks','t5'),task('vol',{photo:'data:image/svg+xml,<svg/>'})));
 await assertSucceeds(setDoc(doc(vol,'tasks','t6'),task('vol',{photo:'data:image/webp;base64,AAAA',location:{lat:31.3,lng:35.0,placeName:'עץ'}})));
 await assertFails(getDoc(doc(vol,'tasks','t2')));                                                             // staff cannot read managers-only
 await assertSucceeds(getDoc(doc(beni,'tasks','t2')));
 await assertSucceeds(getDocs(query(collection(vol,'tasks'),where('managersOnly','==',false),where('done','==',false))));
 await assertFails(getDocs(query(collection(vol,'tasks'),where('done','==',false))));                          // staff query must exclude managers-only
 await assertSucceeds(getDocs(query(collection(beni,'tasks'),where('done','==',false))));
 // marking done: anyone on staff, but only done-fields on someone else's task
 const t1=(await getDoc(doc(vol,'tasks','t1'))).data();
 await assertSucceeds(setDoc(doc(guest,'tasks','t1'),{...t1,done:true,doneBy:actor('guest'),doneAt:now,updatedAt:now}));
 await assertFails(setDoc(doc(guest,'tasks','t1'),{...t1,title:'שונה',done:true,doneBy:actor('guest'),doneAt:now,updatedAt:now})); // not the creator, edited title
 const t1done=(await getDoc(doc(vol,'tasks','t1'))).data();
 await assertFails(setDoc(doc(guest,'tasks','t1'),{...t1done,doneBy:actor('vol')}));                           // cannot rewrite who did it
 await assertSucceeds(setDoc(doc(guest,'tasks','t1'),{...t1done,donePhoto:'data:image/webp;base64,BBBB',doneNote:'בארגז',updatedAt:now}));
 await assertSucceeds(setDoc(doc(vol,'tasks','t1'),{...t1done,title:'כותרת חדשה',updatedAt:now}));             // creator edits
 await assertSucceeds(setDoc(doc(vol,'tasks','t1'),{...t1done,done:false,doneBy:null,doneAt:null,donePhoto:'',doneNote:'',updatedAt:now}));
 await assertFails(deleteDoc(doc(guest,'tasks','t1')));                                                        // not creator, not manager
 await assertSucceeds(deleteDoc(doc(beni,'tasks','t1')));
 // recurring instances: id must be templateId_dateKey
 await assertFails(setDoc(doc(vol,'tasks','wrong'),task('vol',{templateId:'tpl1',dateKey:'2026-11-10'})));
 await assertSucceeds(setDoc(doc(vol,'tasks','tpl1_2026-11-10'),task('vol',{templateId:'tpl1',dateKey:'2026-11-10',dueDate:'2026-11-10'})));

 // --- templates ---
 const tpl={title:'השקיה',note:'',days:[],time:'',active:true,managersOnly:false,createdBy:actor('beni'),createdAt:now,updatedAt:now};
 await assertFails(setDoc(doc(vol,'task_templates','tpl1'),{...tpl,createdBy:actor('vol')}));
 await assertSucceeds(setDoc(doc(beni,'task_templates','tpl1'),tpl));
 await assertSucceeds(setDoc(doc(beni,'task_templates','tpl2'),{...tpl,managersOnly:true}));
 await assertSucceeds(getDocs(query(collection(vol,'task_templates'),where('managersOnly','==',false))));
 await assertFails(getDocs(collection(vol,'task_templates')));
 const routine=doc(vol,'tasks','tpl1_2026-11-11');
 await assertSucceeds(setDoc(doc(beni,'tasks',routine.id),task('beni',{templateId:'tpl1',dateKey:'2026-11-11',dueDate:'2026-11-11'})));
 await assertSucceeds(updateDoc(routine,{assignee:actor('vol'),updatedAt:now}));
 await assertSucceeds(updateDoc(routine,{assignee:null,updatedAt:now}));
 await assertSucceeds(updateDoc(routine,{assignee:actor('vol'),updatedAt:now}));
 await assertSucceeds(updateDoc(routine,{done:true,doneBy:actor('vol'),doneAt:now,updatedAt:now}));
 assert.equal((await assertSucceeds(getDoc(routine))).data().assignee.uid,'vol');
 await assertSucceeds(setDoc(doc(beni,'tasks','tpl2_2026-11-11'),task('beni',{templateId:'tpl2',dateKey:'2026-11-11',managersOnly:true})));
 await assertFails(getDoc(doc(vol,'tasks','tpl2_2026-11-11')));
 await assertFails(updateDoc(doc(vol,'tasks','tpl2_2026-11-11'),{assignee:actor('vol'),updatedAt:now}));

 // --- shopping ---
 await assertSucceeds(setDoc(doc(vol,'shopping','s1'),item('vol')));
 await assertFails(setDoc(doc(vol,'shopping','s2'),item('vol',{category:'other'})));
 await assertFails(setDoc(doc(vol,'shopping','s3'),item('vol',{category:'online',link:'javascript:alert(1)'})));
 await assertSucceeds(setDoc(doc(vol,'shopping','s3'),item('vol',{category:'online',link:'https://example.com/p'})));
 const photo='data:image/webp;base64,AAAA';
 await assertSucceeds(setDoc(doc(vol,'shopping','s4'),item('vol',{category:'building',photo})));
 const legacyShopItem=doc(vol,'shopping','s1');
 await assertSucceeds(updateDoc(legacyShopItem,{photo,updatedAt:now}));
 await assertSucceeds(updateDoc(legacyShopItem,{note:'פרטים על הפריט',updatedAt:now}));
 assert.equal((await assertSucceeds(getDoc(legacyShopItem))).data().photo,photo);
 await assertSucceeds(updateDoc(legacyShopItem,{photo:'',updatedAt:now}));
 await assertFails(updateDoc(legacyShopItem,{photo:'data:image/svg+xml,<svg/>',updatedAt:now}));
 await assertFails(updateDoc(legacyShopItem,{photo:'data:image/jpeg;base64,'+'A'.repeat(400000),updatedAt:now}));
 await assertFails(getDocs(collection(stranger,'shopping')));
 const s1=(await getDoc(doc(vol,'shopping','s1'))).data();
 await assertFails(setDoc(doc(guest,'shopping','s1'),{...s1,bought:true,boughtBy:actor('vol'),boughtAt:now,expireAt:now,updatedAt:now})); // wrong actor
 await assertSucceeds(setDoc(doc(guest,'shopping','s1'),{...s1,bought:true,boughtBy:actor('guest'),boughtAt:now,expireAt:now,updatedAt:now}));
 await assertSucceeds(deleteDoc(doc(guest,'shopping','s3')));                                                  // staff may delete

 // --- account deletion requests ---
 const delReq=(uid,email,at=serverTimestamp())=>({uid,email,requestedAt:at});
 await assertFails(setDoc(doc(anon,'account_deletions','x'),delReq('x','x@example.com')));
 await assertFails(setDoc(doc(stranger,'account_deletions','guest'),delReq('guest','guest@example.com')));          // only for yourself
 await assertFails(setDoc(doc(stranger,'account_deletions','stranger'),delReq('stranger','other@example.com')));   // your own email
 await assertFails(setDoc(doc(stranger,'account_deletions','stranger'),delReq('stranger','stranger@example.com',Timestamp.fromDate(new Date(Date.now()-40*86400000))))); // never a back-dated time
 await assertFails(setDoc(doc(stranger,'account_deletions','stranger'),{...delReq('stranger','stranger@example.com'),note:'x'}));
 await assertFails(setDoc(doc(stranger,'account_deletions','stranger'),{uid:'stranger',email:'stranger@example.com'}));
 await assertFails(setDoc(doc(owner,'account_deletions','owner'),delReq('owner','meniviner@gmail.com')));          // the owner cannot delete the account from the app
 await assertSucceeds(setDoc(doc(stranger,'account_deletions','stranger'),delReq('stranger','stranger@example.com')));
 await assertSucceeds(getDoc(doc(stranger,'account_deletions','stranger')));
 await assertFails(updateDoc(doc(stranger,'account_deletions','stranger'),{email:'stranger@example.com'}));
 await assertFails(getDoc(doc(vol,'account_deletions','stranger')));
 await assertFails(getDocs(collection(vol,'account_deletions')));
 await assertSucceeds(getDocs(collection(beni,'account_deletions')));                                            // managers see pending deletions
 await assertSucceeds(deleteDoc(doc(stranger,'account_deletions','stranger')));                                   // cancel
 await assertSucceeds(setDoc(doc(stranger,'account_deletions','stranger'),delReq('stranger','stranger@example.com')));
 await assertFails(deleteDoc(doc(vol,'account_deletions','stranger')));
 await assertSucceeds(deleteDoc(doc(beni,'account_deletions','stranger')));

 // --- places ---
 // v2 (L3 "אני עומד כאן"): a volunteer saves a place too (was managers-only); deleting stays with managers
 await assertSucceeds(setDoc(doc(vol,'places','p0'),{name:'עץ',lat:31.3,lng:35,createdBy:actor('vol'),createdAt:now}));
 await assertFails(deleteDoc(doc(vol,'places','p0')));
 await assertSucceeds(setDoc(doc(beni,'places','p1'),{name:'עץ',lat:31.3,lng:35,createdBy:actor('beni'),createdAt:now}));
 await assertSucceeds(getDocs(collection(vol,'places')));

 // --- blocked user loses everything ---
 await assertSucceeds(updateDoc(doc(beni,'users','vol'),{role:'staff',status:'blocked',notes:'',updatedAt:now}));
 await assertFails(setDoc(doc(vol,'tasks','t9'),task('vol')));
 await assertFails(getDocs(collection(vol,'shopping')));

 console.log('PASS: team app rules — profiles, bootstrap owner, join codes, manager limits, task visibility, done-only edits, recurring ids, shopping, account deletion requests, places, blocking.');
}finally{await env.cleanup();}

// ---------- guest side: events, tickets, visits, donations, tabs, notifications ----------
const env2=await initializeTestEnvironment({projectId:'demo-havat-ravve-2',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
try{
 const ctx2=(uid,email)=>env2.authenticatedContext(uid,claims(email)).firestore();
 const owner=ctx2('owner','meniviner@gmail.com'), beni=ctx2('beni','beni@example.com'), vol=ctx2('vol','vol@example.com'), guest=ctx2('guest','guest@example.com'), other=ctx2('other','other@example.com'), blockedUser=ctx2('blk','blk@example.com');
 const anon=env2.unauthenticatedContext().firestore();
 await setDoc(doc(owner,'users','owner'),profile('owner','meniviner@gmail.com','owner','active'));
 await setDoc(doc(beni,'users','beni'),profile('beni','beni@example.com','guest','active'));
 await updateDoc(doc(owner,'users','beni'),{role:'manager',status:'active',notes:'',updatedAt:now});
 await setDoc(doc(vol,'users','vol'),profile('vol','vol@example.com','guest','active'));
 await updateDoc(doc(beni,'users','vol'),{role:'staff',status:'active',notes:'',updatedAt:now});
 await setDoc(doc(guest,'users','guest'),profile('guest','guest@example.com','guest','active'));
 await setDoc(doc(other,'users','other'),profile('other','other@example.com','guest','active'));

 // settings: public read, manager write
 await assertFails(setDoc(doc(guest,'settings','app'),{guestIntro:'x'}));
 await assertSucceeds(setDoc(doc(beni,'settings','app'),{guestIntro:'x'}));
 await assertSucceeds(getDoc(doc(anon,'settings','app')));
 await assertFails(updateDoc(doc(beni,'settings','app'),{payment:{bit:'050',paybox:'',cash:true,note:''}}));   // a manager cannot change where the money goes
 await assertSucceeds(updateDoc(doc(beni,'settings','app'),{visitTypes:['סיור']}));
 await assertSucceeds(updateDoc(doc(owner,'settings','app'),{payment:{bit:'050',paybox:'',cash:true,note:''}}));
 const contact={whatsapp:'050-000-0642',phone:'08-000-0642'};
 await assertFails(setDoc(doc(vol,'settings','app'),{contact},{merge:true}));
 await assertFails(setDoc(doc(guest,'settings','app'),{contact},{merge:true}));
 await assertFails(setDoc(doc(beni,'settings','app'),{contact:{whatsapp:'https://example.test'}},{merge:true}));
 await assertFails(setDoc(doc(beni,'settings','app'),{contact:{phone:'1'}},{merge:true}));
 await assertFails(setDoc(doc(beni,'settings','app'),{contact:{email:'fake@example.test'}},{merge:true}));
 await assertFails(setDoc(doc(beni,'settings','app'),{templates:{paymentConfirmation:42}},{merge:true}));
 await assertSucceeds(setDoc(doc(beni,'settings','app'),{contact,templates:{paymentConfirmation:'קיבלנו [סכום]'}},{merge:true}));
 await assertSucceeds(setDoc(doc(beni,'settings','app'),{contact:{whatsapp:''}},{merge:true}));
 const publicSettings=(await getDoc(doc(anon,'settings','app'))).data();
 assert.deepEqual(publicSettings.contact,{...contact,whatsapp:''});
 assert.equal(publicSettings.payment.bit,'050');
 assert.equal(publicSettings.templates.paymentConfirmation,'קיבלנו [סכום]');

 // events: published readable by anyone, drafts only by staff
 const ev=(extra={})=>({title:'פסטיבל',description:'',image:'',location:'',start:'2030-01-01T18:00:00.000Z',end:'2030-01-01T22:00:00.000Z',price:50,maxPerOrder:5,capacity:0,open:true,published:true,questions:[],createdBy:actor('beni'),createdAt:now,updatedAt:now,...extra});
 await assertFails(setDoc(doc(vol,'events','e1'),ev({createdBy:actor('vol')})));
 await assertSucceeds(setDoc(doc(beni,'events','e1'),ev()));
 await assertSucceeds(updateDoc(doc(beni,'events','e1'),{description:'אירוע ותיק ללא הגדרת מודולים'}));
 const tour=doc(beni,'events','tour');
 await assertSucceeds(setDoc(tour,ev({entry:false,stall:false})));
 await assertSucceeds(updateDoc(tour,{entry:true}));
 assert.equal((await assertSucceeds(getDoc(tour))).data().stall,false);
 await assertSucceeds(updateDoc(tour,{entry:false,stall:true}));
 await assertFails(updateDoc(tour,{entry:'false'}));
 await assertFails(updateDoc(tour,{stall:null}));
 await assertFails(updateDoc(doc(vol,'events','tour'),{entry:true}));
 const publication=doc(beni,'events','publication');
 const republishedAt=new Date(Date.parse(now)+5000).toISOString();
 await assertFails(setDoc(publication,ev({publishedAt:'tomorrow'})));
 await assertFails(setDoc(publication,ev({published:false,publishedAt:now})));
 await assertSucceeds(setDoc(publication,ev({publishedAt:now})));
 await assertFails(updateDoc(publication,{publishedAt:republishedAt,updatedAt:republishedAt}));
 await assertSucceeds(updateDoc(publication,{title:'עדכון',updatedAt:republishedAt}));
 assert.equal((await getDoc(publication)).data().publishedAt,now);
 await assertSucceeds(updateDoc(publication,{published:false,updatedAt:republishedAt}));
 await assertFails(updateDoc(doc(vol,'events','publication'),{published:true,publishedAt:republishedAt,updatedAt:republishedAt}));
 await assertSucceeds(updateDoc(publication,{published:true,publishedAt:republishedAt,updatedAt:republishedAt}));
 await assertSucceeds(setDoc(doc(beni,'events','draft'),ev({published:false,createdBy:actor('beni')})));
 await assertSucceeds(setDoc(doc(beni,'events','free'),ev({price:0,createdBy:actor('beni')})));
 await assertSucceeds(getDoc(doc(anon,'events','e1')));
 await assertFails(getDoc(doc(anon,'events','draft')));
 await assertSucceeds(getDoc(doc(vol,'events','draft')));
 await assertSucceeds(getDocs(query(collection(anon,'events'),where('published','==',true))));
 await assertFails(getDocs(collection(guest,'events')));
 await assertSucceeds(setDoc(doc(beni,'events','e1','products','p1'),{name:'יין',price:20,active:true,sort:0}));
 await assertFails(setDoc(doc(vol,'events','e1','products','p2'),{name:'בירה',price:20,active:true,sort:1}));
 await assertSucceeds(getDocs(collection(vol,'events','e1','products')));
 await assertFails(getDocs(collection(guest,'events','e1','products')));
 // event files: managers only, never the volunteers or the guests
 await assertSucceeds(setDoc(doc(beni,'events','e1','files','f1'),{name:'אישור משטרה',url:'https://drive.google.com/x',kind:'doc',by:actor('beni'),at:now}));
 await assertFails(setDoc(doc(beni,'events','e1','files','f2'),{name:'x',url:'http://insecure',kind:'doc',by:actor('beni'),at:now}));
 await assertFails(getDocs(collection(vol,'events','e1','files')));
 await assertFails(getDocs(collection(guest,'events','e1','files')));
 await assertSucceeds(getDocs(collection(beni,'events','e1','files')));

 // tickets
 const tk=(uid,extra={})=>({eventId:'e1',eventTitle:'פסטיבל',orderId:'o1',index:1,total:2,ownerUid:uid,ownerName:'אורח',ownerPhone:'0500000000',holderName:'',secret:'abcdef0123456789abcdef00',price:50,paymentStatus:'pending',status:'valid',scans:[],entries:0,answers:{},createdAt:now,updatedAt:now,...extra});
 const confirmation={paymentConfirmation:{by:actor('beni'),at:now},updatedAt:now};
 await assertFails(setDoc(doc(anon,'tickets','t0'),tk('anon')));
 await assertSucceeds(setDoc(doc(guest,'tickets','t1'),tk('guest')));
 await assertFails(setDoc(doc(guest,'tickets','forged-send'),tk('guest',confirmation)));
 await assertFails(updateDoc(doc(beni,'tickets','t1'),confirmation));
 await assertFails(setDoc(doc(guest,'tickets','t2'),tk('other')));                                   // not own
 await assertFails(setDoc(doc(guest,'tickets','t2'),tk('guest',{paymentStatus:'paid'})));            // cannot self-mark paid
 await assertFails(setDoc(doc(guest,'tickets','t2'),tk('guest',{price:0})));                         // price must match event
 await assertFails(setDoc(doc(guest,'tickets','t2'),tk('guest',{total:9,index:9})));                 // over maxPerOrder
 await assertFails(setDoc(doc(guest,'tickets','t2'),tk('guest',{eventId:'draft'})));                 // unpublished
 await assertSucceeds(setDoc(doc(guest,'tickets','tf'),tk('guest',{eventId:'free',price:0,paymentStatus:'free'})));
 // paying at the gate covers the whole order: a volunteer may mark a sibling ticket paid on site without scanning it, and nothing else
 await assertSucceeds(setDoc(doc(guest,'tickets','t9'),tk('guest')));
 await assertFails(updateDoc(doc(vol,'tickets','t9'),{paymentStatus:'paid',updatedAt:now}));
 await assertFails(updateDoc(doc(guest,'tickets','t9'),{paymentStatus:'paid_onsite',updatedAt:now}));
 await assertSucceeds(updateDoc(doc(vol,'tickets','t9'),{paymentStatus:'paid_onsite',updatedAt:now}));
 // a blocked account is no longer "signed": it cannot order
 await setDoc(doc(blockedUser,'users','blk'),profile('blk','blk@example.com','guest','active'));
 await updateDoc(doc(beni,'users','blk'),{role:'guest',status:'blocked',notes:'',updatedAt:now});
 await assertFails(setDoc(doc(blockedUser,'tickets','tb'),tk('blk')));
 await assertSucceeds(getDoc(doc(guest,'tickets','t1')));
 await assertFails(getDoc(doc(other,'tickets','t1')));
 await assertSucceeds(getDoc(doc(vol,'tickets','t1')));
 await assertSucceeds(getDocs(query(collection(guest,'tickets'),where('ownerUid','==','guest'))));
 await assertFails(getDocs(collection(guest,'tickets')));
 await assertSucceeds(setDoc(doc(other,'tickets','other-event-ticket'),tk('other',{orderId:'other-order'})));
 const atEvent=where('eventId','==','e1');
 await assertFails(getDocs(query(collection(guest,'tickets'),atEvent)));
 await assertFails(getDocs(query(collection(guest,'tickets'),atEvent,where('ownerUid','==','other'))));
 const ownTickets=await assertSucceeds(getDocs(query(collection(guest,'tickets'),atEvent,where('ownerUid','==','guest'))));
 const volunteerTickets=await assertSucceeds(getDocs(query(collection(vol,'tickets'),atEvent)));
 assert.equal(ownTickets.docs.some((ticket)=>ticket.id==='other-event-ticket'),false);
 assert.equal(volunteerTickets.docs.some((ticket)=>ticket.id==='other-event-ticket'),true);
 const t1=(await getDoc(doc(guest,'tickets','t1'))).data();
 await assertFails(setDoc(doc(guest,'tickets','t1'),{...t1,paymentStatus:'paid',updatedAt:now}));
 await assertSucceeds(setDoc(doc(guest,'tickets','t1'),{...t1,paymentStatus:'claimed',updatedAt:now}));
 const t1c=(await getDoc(doc(guest,'tickets','t1'))).data();
 await assertFails(setDoc(doc(vol,'tickets','t1'),{...t1c,scans:[{at:now,by:actor('beni')}],entries:1,updatedAt:now}));   // wrong scanner actor
 await assertFails(setDoc(doc(vol,'tickets','t1'),{...t1c,scans:[{at:now,by:actor('vol')}],entries:2,updatedAt:now}));    // entries must be +1
 await assertSucceeds(setDoc(doc(vol,'tickets','t1'),{...t1c,scans:[{at:now,by:actor('vol')}],entries:1,paymentStatus:'paid_onsite',updatedAt:now}));
 const t1s=(await getDoc(doc(vol,'tickets','t1'))).data();
 await assertFails(setDoc(doc(vol,'tickets','t1'),{...t1s,secret:'ffffffffffffffffffffffff'}));
 await assertFails(setDoc(doc(guest,'tickets','t1'),{...t1s,status:'cancelled',updatedAt:now}));    // already entered
 await assertSucceeds(updateDoc(doc(beni,'tickets','t1'),{paymentStatus:'paid',updatedAt:now}));
 await assertFails(updateDoc(doc(guest,'tickets','t1'),confirmation));
 await assertFails(updateDoc(doc(vol,'tickets','t1'),confirmation));
 await assertFails(updateDoc(doc(beni,'tickets','t1'),{...confirmation,paymentConfirmation:{by:actor('vol'),at:now}}));
 await assertFails(updateDoc(doc(beni,'tickets','t1'),{...confirmation,paymentConfirmation:{by:{uid:'beni',name:'אדם אחר'},at:now}}));
 await assertFails(updateDoc(doc(beni,'tickets','t1'),{...confirmation,paymentConfirmation:{by:actor('beni'),at:'tomorrow'}}));
 await assertFails(updateDoc(doc(beni,'tickets','t1'),{...confirmation,status:'cancelled'}));
 const confirmationBatch=writeBatch(beni);
 for(const ticketId of ['t1','t9']) confirmationBatch.update(doc(beni,'tickets',ticketId),confirmation);
 await assertSucceeds(confirmationBatch.commit());
 for(const ticketId of ['t1','t9']) assert.deepEqual((await getDoc(doc(beni,'tickets',ticketId))).data().paymentConfirmation,confirmation.paymentConfirmation);
 await assertSucceeds(updateDoc(doc(vol,'tickets','t1'),{scans:arrayUnion({at:republishedAt,by:actor('vol')}),entries:increment(1),updatedAt:republishedAt}));
 // The largest supported order fits in the same atomic payment and confirmation batches.
 await assertSucceeds(setDoc(doc(beni,'events','large-order'),ev({maxPerOrder:20})));
 const largeOrder=Array.from({length:20},(_,i)=>`large-order-${i+1}`);
 const placeOrder=writeBatch(guest);
 const payLargeOrder=writeBatch(beni);
 const confirmLargeOrder=writeBatch(beni);
 for(const [i,id] of largeOrder.entries()){
  placeOrder.set(doc(guest,'tickets',id),tk('guest',{eventId:'large-order',orderId:'large-order',index:i+1,total:20}));
  payLargeOrder.update(doc(beni,'tickets',id),{paymentStatus:'paid',updatedAt:now});
  confirmLargeOrder.update(doc(beni,'tickets',id),confirmation);
 }
 await assertSucceeds(placeOrder.commit());
 await assertSucceeds(payLargeOrder.commit());
 await assertSucceeds(confirmLargeOrder.commit());
 assert.deepEqual((await getDoc(doc(beni,'tickets','large-order-20'))).data().paymentConfirmation,confirmation.paymentConfirmation);
 const tf=(await getDoc(doc(guest,'tickets','tf'))).data();
 await assertSucceeds(setDoc(doc(guest,'tickets','tf'),{...tf,status:'cancelled',updatedAt:now}));

 // visits
 const vs={uid:'guest',name:'אורח',phone:'0500000000',date:'2030-02-02',people:4,type:'סיור',note:'',status:'new',managerNote:'',handledBy:null,createdAt:now,updatedAt:now};
 await assertSucceeds(setDoc(doc(guest,'visits','v1'),vs));
 await assertFails(setDoc(doc(guest,'visits','v2'),{...vs,status:'approved'}));
 await assertFails(getDoc(doc(vol,'visits','v1')));
 await assertSucceeds(getDoc(doc(beni,'visits','v1')));
 await assertFails(updateDoc(doc(vol,'visits','v1'),{status:'approved',managerNote:'',handledBy:actor('vol'),updatedAt:now}));
 await assertSucceeds(updateDoc(doc(beni,'visits','v1'),{status:'approved',managerNote:'בשער',handledBy:actor('beni'),updatedAt:now}));
 await assertFails(updateDoc(doc(guest,'visits','v1'),{status:'cancelled',updatedAt:now}));         // only from 'new'

 // donations
 const dn={uid:'guest',name:'אורח',phone:'',amount:180,label:'חי',note:'',memorial:'',receiptWanted:true,receiptName:'אורח',receiptSent:false,paymentStatus:'pending',createdAt:now,updatedAt:now};
 await assertSucceeds(setDoc(doc(guest,'donations','d1'),dn));
 await assertFails(setDoc(doc(guest,'donations','forged-send'),{...dn,...confirmation}));
 await assertFails(updateDoc(doc(beni,'donations','d1'),confirmation));
 await assertFails(setDoc(doc(guest,'donations','d2'),{...dn,paymentStatus:'paid'}));
 await assertSucceeds(updateDoc(doc(guest,'donations','d1'),{paymentStatus:'claimed',updatedAt:now}));
 await assertFails(updateDoc(doc(guest,'donations','d1'),{paymentStatus:'paid',updatedAt:now}));
 await assertSucceeds(updateDoc(doc(beni,'donations','d1'),{paymentStatus:'paid',receiptSent:true,updatedAt:now}));
 await assertFails(updateDoc(doc(guest,'donations','d1'),confirmation));
 await assertFails(updateDoc(doc(beni,'donations','d1'),{...confirmation,receiptSent:false}));
 await assertSucceeds(updateDoc(doc(beni,'donations','d1'),confirmation));
 assert.equal((await getDoc(doc(beni,'donations','d1'))).data().receiptSent,true);
 await assertFails(getDocs(collection(vol,'donations')));

 // tabs
 const tb={eventId:'e1',eventTitle:'פסטיבל',guestUid:'guest',guestName:'אורח',guestPhone:'',ticketId:'t1',items:[],total:0,status:'open',createdBy:actor('vol'),createdAt:now,updatedAt:now};
 const firstItem={productId:'p1',name:'יין',price:20,qty:2,at:now,by:actor('vol')};
 const firstPurchase=doc(vol,'tabs','tb-first-purchase');
 await assertFails(setDoc(firstPurchase,{...tb,items:[firstItem],total:40}));
 // The stall queues the empty create followed by a separate item update, even without reception.
 await disableNetwork(vol);
 const firstCreate=setDoc(firstPurchase,tb);
 let firstUpdate;
 try{
  const emptyDraft=(await getDocFromCache(firstPurchase)).data();
  assert.equal(emptyDraft.items.length,0);
  firstUpdate=updateDoc(firstPurchase,{items:arrayUnion(firstItem),total:increment(40),updatedAt:now});
  const queuedPurchase=(await getDocFromCache(firstPurchase)).data();
  assert.deepEqual(queuedPurchase.items,[firstItem]);
  assert.equal(queuedPurchase.total,40);
 } finally{ await enableNetwork(vol); }
 await assertSucceeds(Promise.all([firstCreate,firstUpdate]));
 const savedPurchase=(await assertSucceeds(getDoc(firstPurchase))).data();
 assert.deepEqual(savedPurchase.items,[firstItem]);
 assert.equal(savedPurchase.total,40);
 await assertFails(setDoc(doc(guest,'tabs','tb1'),{...tb,createdBy:actor('guest')}));
 await assertSucceeds(setDoc(doc(vol,'tabs','tb1'),tb));
 await assertFails(setDoc(doc(vol,'tabs','forged-send'),{...tb,...confirmation}));
 await assertFails(updateDoc(doc(beni,'tabs','tb1'),confirmation));
 await assertSucceeds(updateDoc(doc(vol,'tabs','tb1'),{items:[{productId:'p1',name:'יין',price:20,qty:2,at:now,by:actor('vol')}],total:40,updatedAt:now}));
 await assertFails(updateDoc(doc(vol,'tabs','tb1'),{status:'waived',updatedAt:now}));            // staff cannot waive a debt
 await assertFails(updateDoc(doc(guest,'tabs','tb1'),{status:'paid',updatedAt:now}));              // a guest cannot mark their own tab paid
 await assertFails(updateDoc(doc(guest,'tabs','tb1'),{items:[],total:0,updatedAt:now}));          // guest cannot edit items
 await assertSucceeds(updateDoc(doc(guest,'tabs','tb1'),{status:'claimed',updatedAt:now}));
 await assertSucceeds(updateDoc(doc(vol,'tabs','tb1'),{status:'paid',updatedAt:now}));             // paid on the spot: a volunteer closes the tab
 await assertSucceeds(updateDoc(doc(beni,'tabs','tb1'),{status:'paid',updatedAt:now}));
 await assertFails(updateDoc(doc(vol,'tabs','tb1'),confirmation));
 await assertFails(updateDoc(doc(guest,'tabs','tb1'),confirmation));
 await assertSucceeds(updateDoc(doc(beni,'tabs','tb1'),confirmation));
 await assertFails(updateDoc(doc(owner,'tabs','tb1'),{paymentConfirmation:{by:actor('owner'),at:republishedAt},updatedAt:republishedAt}));
 await assertSucceeds(getDoc(doc(guest,'tabs','tb1')));
 await assertFails(getDoc(doc(other,'tabs','tb1')));

 // notifications & calendar
 await assertSucceeds(setDoc(doc(guest,'notifications','n1'),{type:'visit',title:'x',text:'y',link:'/manage/visits',refId:'v1',createdAt:now,handled:false,handledBy:null,handledAt:null}));
 await assertFails(setDoc(doc(guest,'notifications','n2'),{type:'visit',title:'x',text:'y',link:'',refId:'',createdAt:now,handled:true,handledBy:null,handledAt:null}));
 await assertFails(getDocs(collection(vol,'notifications')));
 await assertSucceeds(updateDoc(doc(beni,'notifications','n1'),{handled:true,handledBy:actor('beni'),handledAt:now}));
 const message={type:'contact',title:'חניה',text:'איפה החניה הנגישה?',link:'/manage/inbox',refId:'guest',createdAt:now,handled:false,handledBy:null,handledAt:null};
 await assertFails(setDoc(doc(anon,'notifications','contact-forged'),message));
 await assertFails(setDoc(doc(blockedUser,'notifications','contact-forged'),{...message,refId:'blk'}));
 await assertFails(setDoc(doc(guest,'notifications','contact-forged'),{...message,refId:'vol'}));
 await assertFails(setDoc(doc(guest,'notifications','contact-forged'),{...message,link:'/manage/people/other'}));
 await assertFails(setDoc(doc(guest,'notifications','contact-forged'),{...message,text:''}));
 await assertSucceeds(setDoc(doc(guest,'notifications','guest-contact'),message));
 await assertSucceeds(setDoc(doc(vol,'notifications','team-contact'),{...message,refId:'vol'}));
 await assertFails(getDoc(doc(guest,'notifications','guest-contact')));
 await assertSucceeds(getDoc(doc(beni,'notifications','guest-contact')));
 await assertSucceeds(updateDoc(doc(beni,'notifications','guest-contact'),{handled:true,handledBy:actor('beni'),handledAt:now}));
 const cal={ownerUid:'beni',ownerName:'בני',title:'פריט ביומן',date:'2030-01-01',time:'',kind:'manual',refId:'',createdAt:now};
 const volCal={...cal,ownerUid:'vol',ownerName:'בדיקה',kind:'presence',time:'08:00–11:00'};
 await assertSucceeds(setDoc(doc(beni,'calendar','c1'),cal));
 await assertSucceeds(setDoc(doc(beni,'calendar','c2'),{...cal,time:'18:00–21:00',kind:'event',refId:'e1'}));
 await assertSucceeds(setDoc(doc(beni,'calendar','c3'),{...cal,time:'שקיעה',kind:'visit',refId:'v1'}));
 await assertSucceeds(setDoc(doc(beni,'calendar','c4'),{...cal,kind:'meeting'}));
 await assertSucceeds(setDoc(doc(beni,'calendar','c5'),{...cal,kind:'planning'}));
 await assertSucceeds(setDoc(doc(beni,'calendar','c6'),{...cal,kind:'presence'}));
 await assertFails(updateDoc(doc(beni,'calendar','c1'),{time:'08:00–11:000'}));
 const teamCalendar=await assertSucceeds(getDocs(query(collection(vol,'calendar'),where('date','==',cal.date))));
 assert(teamCalendar.docs.some((entry)=>entry.data().kind==='visit'));
 await assertFails(getDocs(collection(guest,'calendar')));
 await assertFails(getDoc(doc(guest,'calendar','c1')));
 await assertFails(getDocs(collection(anon,'calendar')));
 await assertFails(getDocs(collection(blockedUser,'calendar')));
 await assertFails(setDoc(doc(guest,'calendar','guest-presence'),{...volCal,ownerUid:'guest'}));
 await assertFails(setDoc(doc(vol,'calendar','foreign-presence'),{...volCal,ownerUid:'beni'}));
 await assertFails(setDoc(doc(vol,'calendar','forged-presence-name'),{...volCal,ownerName:'בני'}));
 await assertFails(setDoc(doc(vol,'calendar','forged-presence-kind'),{...volCal,kind:'meeting'}));
 await assertFails(updateDoc(doc(vol,'calendar','c6'),{time:'10:00'}));
 await assertFails(deleteDoc(doc(vol,'calendar','c6')));
 const ownPresence=doc(vol,'calendar','own-presence');
 await assertSucceeds(setDoc(ownPresence,volCal));
 await assertSucceeds(updateDoc(ownPresence,{title:'אני בחווה',date:'2030-01-02',time:''}));
 await assertFails(updateDoc(ownPresence,{ownerUid:'beni'}));
 await assertFails(updateDoc(ownPresence,{kind:'manual'}));
 await assertSucceeds(updateDoc(doc(beni,'calendar','own-presence'),{time:'10:00'}));
 await assertSucceeds(deleteDoc(ownPresence));
 await assertSucceeds(setDoc(ownPresence,volCal));
 await assertSucceeds(deleteDoc(doc(beni,'calendar','own-presence')));
 // regression: publishing an event writes the entry the app builds (ManageEvents save -> upsertCalendarRef), and the Rules accept it
 const evRef=(id,start,end)=>({...eventCalendarFields({title:'ערב שירה בחווה',start,end}),ownerUid:'beni',ownerName:'b',kind:'event',refId:id,createdAt:now});
 const evening=evRef('e2','2030-05-01T07:00:00.000Z','2030-05-01T11:00:00.000Z');
 if(evening.time!=='10:00–14:00'||evening.date!=='2030-05-01')throw new Error('event calendar fields: '+JSON.stringify(evening));
 await assertSucceeds(setDoc(doc(beni,'calendar','event_e2'),evening));
 const night=evRef('e3','2030-05-01T21:30:00.000Z','2030-05-02T01:00:00.000Z');   // 00:30 farm time: the entry is on May 2, not the UTC day
 if(night.time!=='00:30–04:00'||night.date!=='2030-05-02')throw new Error('event calendar fields: '+JSON.stringify(night));
 await assertSucceeds(setDoc(doc(beni,'calendar','event_e3'),night));
 await assertFails(setDoc(doc(beni,'calendar','event_e4'),{...evening,refId:'e4',time:'10:00–14:00 extra'}));   // still bounded
 // the team list: a volunteer may list team members by role, never everyone
 await assertSucceeds(getDocs(query(collection(vol,'users'),where('role','in',['owner','manager','staff']))));
 await assertFails(getDocs(collection(vol,'users')));
 await assertFails(getDocs(query(collection(guest,'users'),where('role','in',['owner','manager','staff']))));
 // item history: the kind is part of the query, so a volunteer can read it for a task
 await assertSucceeds(getDocs(query(collection(vol,'activity'),where('kind','==','task'),where('refId','==','t1'))));
 await assertFails(getDocs(query(collection(vol,'activity'),where('refId','==','t1'))));
 // paidAt: only a write that settles the payment may set it, and only to the server's time
 const longAgo=Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
 await assertFails(setDoc(doc(guest,'tickets','pa0'),tk('guest',{paidAt:serverTimestamp()})));              // never on create
 for(const id of ['pa1','pa2','pa3','pa4']) await assertSucceeds(setDoc(doc(guest,'tickets',id),tk('guest')));
 await assertFails(updateDoc(doc(guest,'tickets','pa1'),{paymentStatus:'claimed',paidAt:serverTimestamp(),updatedAt:now})); // a claim is not a settle
 await assertFails(updateDoc(doc(vol,'tickets','pa1'),{paymentStatus:'paid_onsite',paidAt:longAgo,updatedAt:now}));         // no back-dated stamp
 await assertFails(updateDoc(doc(vol,'tickets','pa1'),{paymentStatus:'paid_onsite',paidAt:now,updatedAt:now}));             // not a client string
 await assertSucceeds(updateDoc(doc(vol,'tickets','pa1'),{paymentStatus:'paid_onsite',paidAt:serverTimestamp(),updatedAt:now}));
 await assertSucceeds(updateDoc(doc(vol,'tickets','pa2'),{scans:arrayUnion({at:now,by:actor('vol')}),entries:increment(1),paymentStatus:'paid_onsite',paidAt:serverTimestamp(),updatedAt:now}));
 await assertFails(updateDoc(doc(beni,'tickets','pa3'),{paidAt:serverTimestamp(),updatedAt:now}));                          // still pending: no stamp
 await assertSucceeds(updateDoc(doc(beni,'tickets','pa3'),{paymentStatus:'paid',paidAt:serverTimestamp(),updatedAt:now}));
 await assertSucceeds(updateDoc(doc(vol,'tickets','pa4'),{paymentStatus:'paid_onsite',updatedAt:now}));                     // an old client without paidAt still works
 await assertSucceeds(setDoc(doc(guest,'donations','dpa'),dn));
 await assertFails(setDoc(doc(guest,'donations','dpa0'),{...dn,paidAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(guest,'donations','dpa'),{paymentStatus:'claimed',paidAt:serverTimestamp(),updatedAt:now}));
 await assertSucceeds(updateDoc(doc(beni,'donations','dpa'),{paymentStatus:'paid',paidAt:serverTimestamp(),updatedAt:now}));
 await assertSucceeds(setDoc(doc(vol,'tabs','tbpa'),tb));
 await assertFails(updateDoc(doc(vol,'tabs','tbpa'),{items:[],total:0,paidAt:serverTimestamp(),updatedAt:now}));
 await assertFails(updateDoc(doc(guest,'tabs','tbpa'),{status:'claimed',paidAt:serverTimestamp(),updatedAt:now}));
 await assertSucceeds(updateDoc(doc(vol,'tabs','tbpa'),{status:'paid',paidAt:serverTimestamp(),updatedAt:now}));
 // the email outbox: managers read it, nobody writes it from the app, guests and volunteers never see it
 await env2.withSecurityRulesDisabled(async(c)=>{await setDoc(doc(c.firestore(),'email_outbox','order_o1'),{kind:'order',refId:'o1',uid:'guest',status:'sent',to:'guest@example.com',updatedAt:now});});
 await assertFails(getDoc(doc(guest,'email_outbox','order_o1')));
 await assertFails(getDocs(query(collection(guest,'email_outbox'),where('uid','==','guest'))));
 await assertFails(getDoc(doc(vol,'email_outbox','order_o1')));
 await assertFails(getDoc(doc(anon,'email_outbox','order_o1')));
 await assertSucceeds(getDoc(doc(beni,'email_outbox','order_o1')));
 await assertSucceeds(getDocs(collection(beni,'email_outbox')));
 await assertFails(setDoc(doc(guest,'email_outbox','order_forged'),{kind:'order',refId:'x',uid:'guest',status:'queued'}));
 await assertFails(updateDoc(doc(guest,'email_outbox','order_o1'),{status:'queued'}));
 await assertFails(updateDoc(doc(beni,'email_outbox','order_o1'),{status:'cancelled'}));
 await assertFails(deleteDoc(doc(owner,'email_outbox','order_o1')));
 console.log('PASS: guest side rules — settings, published events, ticket ownership/payment/scan rules, visits, donations, stall tabs, notifications, calendar.');
}finally{await env2.cleanup();}

// =====================================================================================================================
// v2 redesign (docs/redesign-data/*.md, rules summary in docs/redesign-data/rules.md). Every case runs and is counted;
// the run fails at the end if any case failed. Roles: owner (bootstrap), mgr and noa (managers), vol and dana (staff),
// guest, blk (blocked staff), raz / tamar (vendor owner / helper of v-raz), vdana (vendor of v-dana), anon (signed out).
// =====================================================================================================================
let v2n=0,v2fail=0;
const v2ok=async(p,label)=>{v2n++;try{await assertSucceeds(p);}catch(e){v2fail++;console.log('  ✗ allow expected: '+label+' — '+String(e.message||e).replace(/\s+/g,' ').slice(0,700));}};
const v2no=async(p,label)=>{v2n++;try{await assertFails(p);}catch(e){v2fail++;console.log('  ✗ deny expected: '+label);}};
const env3=await initializeTestEnvironment({projectId:'demo-havat-ravve-3',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
try{
 const C=(uid)=>env3.authenticatedContext(uid,claims(uid==='owner'?'meniviner@gmail.com':uid+'@example.com')).firestore();
 const owner=C('owner'),mgr=C('mgr'),noa=C('noa'),vol=C('vol'),dana=C('dana'),guest=C('guest'),blk=C('blk'),raz=C('raz'),tamar=C('tamar'),fresh=C('fresh');
 const anon=env3.unauthenticatedContext().firestore();
 const P=(uid,role,extra={})=>profile(uid,uid==='owner'?'meniviner@gmail.com':uid+'@example.com',role,'active',extra);
 const A=(uid)=>actor(uid);
 const webp='data:image/webp;base64,AAAA', jpeg='data:image/jpeg;base64,AAAA';
 const ev=(extra={})=>({title:'פסטיבל',description:'',image:'',location:'',start:'2030-01-01T18:00:00.000Z',end:'2030-01-01T22:00:00.000Z',price:50,maxPerOrder:5,capacity:0,open:true,published:true,questions:[],createdBy:A('mgr'),createdAt:now,updatedAt:now,...extra});
 const tk=(id,extra={})=>({eventId:'ev-day',eventTitle:'פסטיבל',orderId:'o-'+id,index:1,total:1,ownerUid:'guest',ownerName:'אורח',ownerPhone:'0500000000',holderName:'',secret:'s-'+id,price:50,paymentStatus:'pending',status:'valid',scans:[],entries:0,answers:{},createdAt:now,updatedAt:now,...extra});
 const tb=(extra={})=>({eventId:'ev-day',eventTitle:'פסטיבל',guestUid:'guest',guestName:'אורח',guestPhone:'',ticketId:'',items:[],total:0,status:'open',createdBy:A('vol'),createdAt:now,updatedAt:now,...extra});
 const scan=(by,extra={})=>({eventId:'ev-day',ticketId:'tk-a',orderId:'o-tk-a',name:'אורח',phone:'0500000000',meta:'כרטיס אחד',result:'ok',count:1,by:A(by),at:now,reopenedBy:null,reopenedAt:null,...extra});
 const cal=(owner_,extra={})=>({ownerUid:owner_,ownerName:'בדיקה',title:'בדיקה בחווה',date:'2030-01-02',time:'08:00–13:00',kind:'presence',refId:'',createdAt:now,...extra});
 const project=(extra={})=>({id:'p1',title:'הכנות לפסטיבל',goal:'הכנות לפסטיבל',deadline:'2030-01-01',members:[A('mgr')],memberUids:['mgr'],status:'active',doneAt:null,createdBy:A('mgr'),createdAt:now,updatedAt:now,...extra});
 const step=(id,extra={})=>({id,projectId:'p1',n:1,title:'צעד',assignee:null,due:'',note:'',done:false,doneBy:null,doneAt:null,parentId:null,updates:[],createdBy:A('mgr'),createdAt:now,updatedAt:now,...extra});
 const trip=(by,extra={})=>({id:'x',by:A(by),list:'super',startedAt:now,closedAt:null,bought:[],missing:[],...extra});
 const bc=(id,extra={})=>({id,text:'מחר מתחילים ב־7',audience:'all',urgent:false,by:A('mgr'),createdAt:now,recipients:['vol','raz','blk','mgr'],recipientCount:4,resentAt:null,...extra});
 const note=(id,by,extra={})=>({id,kind:'task',title:'משימה חדשה',sub:'',link:'/tasks/t1',refId:'t1',by:A(by),createdAt:now,readAt:null,...extra});
 const job=(id,by,extra={})=>({id,kind:'task',title:'משימה חדשה',body:'',link:'/tasks/t1',to:['noa','dana','mgr'].filter((u)=>u!==by),createdBy:A(by),createdAt:now,sentAt:null,urgent:false,tag:id,refId:'t1',...extra});

 await env3.withSecurityRulesDisabled(async(c)=>{
  const f=c.firestore();const put=(p,d)=>setDoc(doc(f,p),d);
  await put('users/owner',P('owner','owner'));await put('users/mgr',P('mgr','manager'));await put('users/noa',P('noa','manager'));
  await put('users/vol',P('vol','staff'));await put('users/dana',P('dana','staff'));await put('users/guest',P('guest','guest'));
  await put('users/blk',profile('blk','blk@example.com','staff','blocked'));
  await put('users/raz',P('raz','vendor',{vendorId:'v-raz',helper:false,addedBy:'mgr',inviteCode:'code-raz-0001'}));
  await put('users/tamar',P('tamar','vendor',{vendorId:'v-raz',helper:true,addedBy:'raz',inviteCode:'code-tamar-01'}));
  await put('users/vdana',P('vdana','vendor',{vendorId:'v-dana',helper:false,addedBy:'mgr',inviteCode:'code-dana-001'}));
  for(const [id,extra] of [['t-free',{}],['t-noa',{assignee:A('noa')}],['t-vol',{assignee:A('vol')}],['t-race',{assignee:A('noa')}],['t-done',{done:true,doneBy:A('dana'),doneAt:now}],['t-free2',{}],['t-free3',{}],['t-mo',{managersOnly:true}],['t-old',{}],['t-ev',{eventId:'ev-day'}],['t-ev-mo',{eventId:'ev-day',managersOnly:true}]]) await put('tasks/'+id,task('mgr',extra));
  await put('task_templates/tpl-old',{title:'השקיה',note:'',days:[],time:'06:30',active:true,managersOnly:false,createdBy:A('mgr'),createdAt:now,updatedAt:now});
  await put('places/pl-1',{name:'חממה',lat:31.3,lng:35,createdBy:A('mgr'),createdAt:now});
  await put('shopping/sh-old',item('vol'));
  await put('shopping_trips/trip-vol',trip('vol',{id:'trip-vol'}));
  await put('calendar/c-vol',cal('vol'));await put('calendar/c-dana',cal('dana'));
  await put('calendar/c-old',{ownerUid:'mgr',ownerName:'בדיקה',title:'פגישה',date:'2030-01-02',time:'10:00',kind:'manual',refId:'',createdAt:now});
  await put('calendar/visit_x',{ownerUid:'mgr',ownerName:'בדיקה',title:'סיור',date:'2030-01-02',time:'09:00',kind:'visit',refId:'x',createdAt:now});
  await put('projects/p1',project());await put('projects/p1/steps/s1',step('s1'));await put('projects/p1/steps/s2',step('s2',{done:true,doneBy:A('mgr'),doneAt:now}));
  await put('projects/p1/steps/s300',step('s300',{updates:Array.from({length:300},()=>({by:A('mgr'),at:now,text:'x'}))}));
  await put('broadcasts/b1',bc('b1'));
  await put('users/vol/notifications/n1',note('n1','mgr'));await put('users/vol/notifications/b_b1',note('b_b1','mgr',{kind:'broadcast',link:'/tasks',refId:'b1'}));
  await put('push_jobs/j0',job('j0','mgr'));
  await put('notifications/x',{type:'visit',title:'ביקור',text:'',link:'/manage/inbox',refId:'v1',createdAt:now,handled:false,handledBy:null,handledAt:null});
  await put('donations/d1',{uid:'guest',name:'אורח',phone:'',amount:100,label:'',note:'',memorial:'',receiptWanted:false,receiptName:'',receiptSent:false,paymentStatus:'claimed',createdAt:now,updatedAt:now});
  await put('donations/d2',{uid:'guest',name:'אורח',phone:'',amount:100,label:'',note:'',memorial:'',receiptWanted:false,receiptName:'',receiptSent:false,paymentStatus:'claimed',createdAt:now,updatedAt:now});
  await put('settings/app',{guestIntro:'',payment:{bit:'050',paybox:'',cash:true,note:''}});
  await put('settings/push',{mode:'webpush',vapidPublicKey:'BPk',fcmVapidKey:'',updatedAt:now});
  await put('users/g2',P('g2','guest'));await put('users/g3',P('g3','guest'));await put('users/g4',P('g4','guest'));
  await put('events/ev-day',ev());await put('events/ev-closed',ev({closed:{at:now,by:A('mgr'),reopenUntil:now}}));
  await put('events/ev-day/staffing/gate',{station:'שער',people:[{uid:'dana',name:'דנה',hours:'17:00-21:00'}],needed:2});
  await put('events/ev-day/products/pr1',{name:'קפה',price:10,active:true,sort:1});
  await put('events/ev-day/files/f1',{name:'מפה',url:'https://example.com/map.pdf',kind:'doc',by:A('mgr'),at:now});
  await put('events/ev-day/counters/live',{eventId:'ev-day',entered:5,scans:6,paidAtGate:0,payLater:0,payLaterAmount:0,rejected:1,perHalfHour:{},per10m:{}});
  await put('events/ev-day/counters/cash',{gate:{amount:100,by:'דנה',at:now}});
  await put('events/ev-day/scans/sc-rej',scan('dana',{result:'rejected',reason:'ההזמנה בוטלה',keptBy:null,keptAt:null}));
  await put('events/ev-day/scans/sc-rej2',scan('dana',{result:'rejected',reason:'ההזמנה בוטלה',keptBy:null,keptAt:null}));
  await put('events/ev-day/scans/sc-ok',scan('dana'));
  for(const [id,extra] of [['tk-a',{}],['tk-b',{}],['tk-c',{status:'cancelled',paymentStatus:'cancelled'}],['tk-paid',{paymentStatus:'paid'}],['tk-later',{}],['tk-rem',{}]]) await put('tickets/'+id,tk(id,extra));
  await put('tabs/tb-open',tb({items:[{productId:'pr1',name:'קפה',price:10,qty:1,at:now,by:A('vol')}],total:10}));
  await put('tabs/tb-paid',tb({status:'paid',total:10}));await put('tabs/tb-closed',tb({eventId:'ev-closed',total:10}));await put('tabs/tb-claim',tb({total:10}));
  await put('events/ev-day/vendor_info/main',{setupFrom:'14:00',managerUids:['mgr'],updatedAt:now});
  await put('events/ev-day/vendors/v-raz',{vendorId:'v-raz',name:'רז',confirmed:true,notes:'',status:'confirmed',updatedAt:now});
  await put('vendors/v-raz',{name:'גבינות רז',phone:'0520000000',product:'גבינות',external:true,events:['ev-day'],createdAt:now,updatedAt:now});
  await put('vendors/v-raz/private/main',{notes:'משלם באיחור',updatedAt:now});
  await put('vendor_invites/code-open-0001',{code:'code-open-0001',vendorId:'v-raz',vendorName:'רז',role:'helper',name:'אבי',phone:'',active:true,usedBy:null,usedAt:null,createdBy:A('raz'),createdAt:now});
 });

 // ---------------- tasks (tasks.md 1-8, 17; farm.md 11-13) ----------------
 await v2ok(updateDoc(doc(vol,'tasks','t-free'),{assignee:A('vol'),takenAt:now,updatedAt:now}),'tasks 1 staff takes a free task');
 await v2no(updateDoc(doc(vol,'tasks','t-noa'),{assignee:A('vol'),takenAt:now,updatedAt:now}),'tasks 2 staff takes a task that is on Noa (hardening)');
 await v2ok(updateDoc(doc(vol,'tasks','t-noa'),{photo:webp,updatedAt:now}),'tasks 3 staff adds a before photo');
 await v2ok(updateDoc(doc(vol,'tasks','t-noa'),{shoppingId:'abc',updatedAt:now}),'tasks 4 staff links a shopping item');
 await v2no(updateDoc(doc(vol,'tasks','t-noa'),{title:'אחר',updatedAt:now}),'tasks 5 staff edits the title');
 await v2ok(updateDoc(doc(mgr,'tasks','t-noa'),{assignee:A('dana'),takenAt:now,updatedAt:now}),'tasks 6 manager assigns');
 await v2no(setDoc(doc(vol,'tasks','tn1'),task('vol',{takenAt:'x'.repeat(41)})),'tasks 7 takenAt of 41 chars');
 await v2no(setDoc(doc(vol,'tasks','tn2'),task('vol',{foo:1})),'tasks 8 unknown key');
 await v2ok(setDoc(doc(vol,'tasks','tn3'),task('vol')),'tasks 17 old shape create');
 await v2ok(updateDoc(doc(vol,'tasks','t-old'),{done:true,doneBy:A('vol'),doneAt:now,updatedAt:now}),'tasks 17 old shape done');
 await v2ok(setDoc(doc(vol,'tasks','tn4'),task('vol',{requestedBy:A('noa'),shoppingId:'s1'})),'tasks create with requestedBy and shoppingId');
 await v2no(setDoc(doc(vol,'tasks','tn5'),task('vol',{requestedBy:'noa'})),'tasks requestedBy not an actor');
 await v2ok(updateDoc(doc(vol,'tasks','t-vol'),{assignee:null,updatedAt:now}),'tasks staff releases own task');
 await v2no(updateDoc(doc(vol,'tasks','t-race'),{assignee:null,updatedAt:now}),'tasks staff releases a task on someone else');
 await v2ok(updateDoc(doc(vol,'tasks','t-free'),{assignee:A('dana'),takenAt:now,updatedAt:now}),'tasks staff hands own task to a teammate (C4)');
 await v2no(updateDoc(doc(vol,'tasks','t-race'),{assignee:A('vol'),takenAt:now,updatedAt:now}),'tasks late offline take after someone else took it (X1)');
 await v2no(updateDoc(doc(vol,'tasks','t-done'),{assignee:A('vol'),takenAt:now,updatedAt:now}),'tasks take a done task');
 await v2ok(updateDoc(doc(vol,'tasks','t-free2'),{done:true,doneBy:A('vol'),doneAt:now,updatedAt:now,assignee:A('vol')}),'tasks tick a free task (becomes mine)');
 await v2ok(updateDoc(doc(vol,'tasks','t-free3'),{assignee:A('vol'),updatedAt:now}),'farm 12 F6 take: assignee + updatedAt');
 await v2no(getDocs(query(collection(vol,'tasks'),where('eventId','==','ev-day'))),'farm 11 staff queries event tasks without managersOnly');
 await v2ok(getDocs(query(collection(vol,'tasks'),where('eventId','==','ev-day'),where('managersOnly','==',false))),'farm 11 staff queries event tasks with managersOnly == false');
 await v2ok(getDocs(query(collection(vol,'activity'),where('by.uid','==','vol'),where('kind','==','task'),where('action','==','done'))),'farm 13 activity by me, task, done');
 await v2no(getDocs(query(collection(vol,'activity'),where('by.uid','==','vol'),where('kind','==','task_private'),where('action','==','done'))),'farm 13 activity task_private');
 await v2no(getDoc(doc(vol,'tasks','t-mo')),'tasks staff reads a managers-only task');
 for(const [who,db_] of [['vendor',raz],['guest',guest],['blocked',blk],['anon',anon]]){
  await v2no(getDoc(doc(db_,'tasks','t-old')),`tasks ${who} reads a task`);
  await v2no(setDoc(doc(db_,'tasks','tx-'+who),task(who)),`tasks ${who} creates a task`);
 }
 // ---------------- task_templates (tasks.md 9-11, 17) ----------------
 const tpl=(extra={})=>({title:'האכלה',note:'',days:[],time:'07:00',active:true,managersOnly:false,createdBy:A('mgr'),createdAt:now,updatedAt:now,...extra});
 await v2ok(setDoc(doc(mgr,'task_templates','tp1'),tpl({assignee:A('vol'),placeId:'p1'})),'templates 9 manager with assignee and placeId');
 await v2no(setDoc(doc(mgr,'task_templates','tp2'),tpl({assignee:'x'})),'templates 10 assignee not a map');
 await v2no(setDoc(doc(vol,'task_templates','tp3'),tpl({createdBy:A('vol')})),'templates 11 staff creates');
 await v2ok(updateDoc(doc(mgr,'task_templates','tpl-old'),{active:false,updatedAt:now}),'templates 17 old template toggled');
 await v2ok(setDoc(doc(mgr,'task_templates','tp4'),tpl({assignee:null,managersOnly:true})),'templates assignee null');
 // ---------------- places (tasks.md 12-15) ----------------
 await v2ok(setDoc(doc(vol,'places','pl-v'),{name:'מקום חדש',lat:31.3,lng:35,createdBy:A('vol'),createdAt:now,accuracy:4}),'places 12 staff saves where they stand');
 await v2ok(updateDoc(doc(vol,'places','pl-1'),{photo:jpeg}),'places 13 staff adds a photo');
 await v2no(updateDoc(doc(vol,'places','pl-1'),{photo:'http://x'}),'places 14 photo not a data URL');
 // photos stored in R2 by the farm's Worker: only that host and key shape
 const r2=(kind,ext='jpg')=>`https://havat-ravve-api.meniviner.workers.dev/v1/files/${kind}/vol/${'Ab_-'.repeat(8)}.${ext}`;
 await v2ok(updateDoc(doc(vol,'places','pl-1'),{photo:r2('place')}),'places 15 photo stored in R2');
 await v2ok(updateDoc(doc(vol,'tasks','t-noa'),{photo:r2('task','webp'),updatedAt:now}),'tasks R2 photo link');
 await v2no(updateDoc(doc(vol,'places','pl-1'),{photo:'https://evil.example/v1/files/place/vol/'+'A'.repeat(32)+'.jpg'}),'places 16 photo on another host');
 await v2no(updateDoc(doc(vol,'places','pl-1'),{photo:r2('place','pdf')}),'places 17 a PDF link as a photo');
 await v2no(updateDoc(doc(vol,'places','pl-1'),{photo:r2('place')+'?track=1'}),'places 18 R2 link with extra text');
 await v2no(deleteDoc(doc(vol,'places','pl-1')),'places 15 staff deletes');
 await v2ok(updateDoc(doc(vol,'places','pl-v'),{name:'הלול',lat:31.31,lng:35.01,accuracy:6}),'places staff names it (L4)');
 await v2no(updateDoc(doc(vol,'places','pl-v'),{createdBy:A('dana')}),'places createdBy changed');
 await v2no(setDoc(doc(vol,'places','pl-w'),{name:'x',lat:1,lng:1,createdBy:A('vol'),createdAt:now,accuracy:'4'}),'places accuracy not a number');
 await v2no(setDoc(doc(raz,'places','pl-r'),{name:'x',lat:1,lng:1,createdBy:A('raz'),createdAt:now}),'places vendor creates');
 await v2no(getDoc(doc(guest,'places','pl-1')),'places guest reads');
 await v2ok(deleteDoc(doc(mgr,'places','pl-v')),'places manager deletes');
 // ---------------- shopping (shopping.md; tasks.md 16) ----------------
 await v2ok(setDoc(doc(vol,'shopping','sh1'),item('vol')),'shopping old shape');
 await v2ok(setDoc(doc(vol,'shopping','sh2'),item('vol',{taskId:'t1'})),'shopping 16 with taskId');
 await v2no(setDoc(doc(vol,'shopping','sh3'),item('vol',{taskId:'x'.repeat(81)})),'shopping taskId of 81');
 await v2ok(updateDoc(doc(vol,'shopping','sh1'),{bought:true,boughtBy:A('vol'),boughtAt:now,expireAt:now,updatedAt:now,tripId:'trip-vol'}),'shopping bought in a trip');
 await v2no(updateDoc(doc(vol,'shopping','sh2'),{bought:true,boughtBy:A('dana'),boughtAt:now,expireAt:now,updatedAt:now,tripId:'trip-vol'}),'shopping bought by someone else');
 await v2ok(updateDoc(doc(vol,'shopping','sh2'),{notAvailable:true,notAvailableAt:now,tripId:'trip-vol',updatedAt:now}),'shopping not available');
 await v2ok(updateDoc(doc(vol,'shopping','sh2'),{notAvailable:false,notAvailableAt:null,updatedAt:now}),'shopping back to available');
 await v2no(updateDoc(doc(vol,'shopping','sh2'),{notAvailable:'yes',updatedAt:now}),'shopping notAvailable not a bool');
 await v2no(updateDoc(doc(vol,'shopping','sh2'),{foundWhere:'x'.repeat(201),updatedAt:now}),'shopping foundWhere of 201');
 await v2no(updateDoc(doc(vol,'shopping','sh2'),{price:5,updatedAt:now}),'shopping unknown key');
 await v2ok(updateDoc(doc(dana,'shopping','sh-old'),{qty:'2',updatedAt:now}),'shopping old doc updated');
 for(const [who,db_] of [['vendor',raz],['guest',guest],['anon',anon]]){
  await v2no(getDoc(doc(db_,'shopping','sh-old')),`shopping ${who} reads`);
  await v2no(setDoc(doc(db_,'shopping','sx-'+who),item(who)),`shopping ${who} creates`);
 }
 // ---------------- shopping_trips ----------------
 await v2ok(setDoc(doc(vol,'shopping_trips','tr1'),trip('vol',{id:'tr1'})),'trips staff starts');
 await v2no(setDoc(doc(vol,'shopping_trips','tr2'),trip('dana',{id:'tr2'})),'trips by someone else');
 await v2no(setDoc(doc(vol,'shopping_trips','tr3'),trip('vol',{id:'tr3',closedAt:now})),'trips created closed');
 await v2ok(updateDoc(doc(vol,'shopping_trips','tr1'),{closedAt:now,bought:['sh1'],missing:['sh2']}),'trips shopper closes');
 await v2ok(updateDoc(doc(vol,'shopping_trips','tr1'),{closedAt:null}),'trips shopper reopens');
 await v2no(updateDoc(doc(dana,'shopping_trips','tr1'),{closedAt:now}),'trips another staff closes');
 await v2no(updateDoc(doc(vol,'shopping_trips','tr1'),{startedAt:'2030-01-01T00:00:00.000Z'}),'trips startedAt changed');
 await v2no(updateDoc(doc(vol,'shopping_trips','tr1'),{list:'building'}),'trips list changed');
 await v2no(updateDoc(doc(vol,'shopping_trips','tr1'),{bought:Array.from({length:201},(_,i)=>'i'+i)}),'trips 201 bought ids');
 await v2no(deleteDoc(doc(vol,'shopping_trips','tr1')),'trips delete by shopper');
 await v2no(deleteDoc(doc(dana,'shopping_trips','tr1')),'trips delete by another staff');
 for(const [who,db_] of [['owner',owner],['manager',mgr],['staff',vol]]) await v2ok(getDoc(doc(db_,'shopping_trips','trip-vol')),`trips ${who} reads`);
 for(const [who,db_] of [['vendor',raz],['helper',tamar],['guest',guest],['blocked',blk],['anon',anon]]){
  await v2no(getDoc(doc(db_,'shopping_trips','trip-vol')),`trips ${who} reads`);
  await v2no(setDoc(doc(db_,'shopping_trips','tr-'+who),trip(who,{id:'tr-'+who})),`trips ${who} starts`);
 }
 // ---------------- calendar (farm.md 1-10, manage.md 8) ----------------
 await v2ok(setDoc(doc(vol,'calendar','cp1'),cal('vol',{from:'08:00',to:'13:00',note:'מגיע עם הטנדר'})),'farm 1 own presence with hours and note');
 await v2no(setDoc(doc(vol,'calendar','cp2'),cal('dana')),'farm 2 presence for someone else');
 await v2no(setDoc(doc(vol,'calendar','cp3'),cal('vol',{ownerName:'שם אחר'})),'farm 2 ownerName not the profile name');
 await v2no(setDoc(doc(vol,'calendar','cp4'),cal('vol',{audience:'all'})),'farm 3 presence with audience');
 await v2no(setDoc(doc(vol,'calendar','cp5'),cal('vol',{participants:[]})),'farm 3 presence with participants');
 await v2no(setDoc(doc(vol,'calendar','cp6'),cal('vol',{remindAt:now})),'farm 3 presence with remindAt');
 await v2no(setDoc(doc(vol,'calendar','cp7'),cal('vol',{kind:'manual'})),'farm 4 staff creates a C11 item');
 await v2ok(updateDoc(doc(vol,'calendar','c-vol'),{from:'09:00',to:'12:00',note:'x',time:'09:00–12:00',title:'בחווה',date:'2030-01-03'}),'farm 5 own presence hours and date');
 await v2no(updateDoc(doc(vol,'calendar','c-vol'),{ownerUid:'dana'}),'farm 5 ownerUid changed');
 await v2no(updateDoc(doc(vol,'calendar','c-vol'),{kind:'manual'}),'farm 5 kind changed');
 await v2no(updateDoc(doc(vol,'calendar','c-dana'),{note:'x'}),'farm 6 updates someone else presence');
 await v2no(deleteDoc(doc(vol,'calendar','c-dana')),'farm 6 deletes someone else presence');
 await v2ok(deleteDoc(doc(vol,'calendar','cp1')),'farm 6 deletes own presence');
 const c11=(extra={})=>({ownerUid:'mgr',ownerName:'בדיקה',title:'פגישת צוות',date:'2030-01-02',time:'10:00–11:00',from:'10:00',to:'11:00',kind:'manual',refId:'',createdAt:now,audience:'managers',participants:['mgr','noa','vol'],reminder:'60',remindAt:now,reminderSentAt:null,...extra});
 await v2ok(setDoc(doc(mgr,'calendar','cm1'),c11()),'farm 7 manager C11 item');
 await v2no(setDoc(doc(mgr,'calendar','cm2'),c11({audience:'secret'})),'farm 8 audience secret');
 await v2no(setDoc(doc(mgr,'calendar','cm3'),c11({participants:Array.from({length:31},(_,i)=>'u'+i)})),'farm 8 31 participants');
 await v2no(setDoc(doc(mgr,'calendar','cm4'),c11({reminder:'30'})),'farm 8 reminder 30');
 await v2no(setDoc(doc(mgr,'calendar','cm5'),c11({note:'x'.repeat(201)})),'farm 8 note of 201');
 await v2no(setDoc(doc(mgr,'calendar','cm6'),c11({time:'x'.repeat(12)})),'farm 8 time of 12');
 await v2ok(updateDoc(doc(mgr,'calendar','c-old'),{title:'פגישה חדשה'}),'farm 9 old item updated by manager');
 await v2ok(getDocs(query(collection(vol,'calendar'),where('date','>=','2030-01-01'),where('date','<=','2030-01-07'))),'farm 10 staff reads a date range');
 await v2no(getDocs(query(collection(anon,'calendar'),where('date','>=','2030-01-01'))),'farm 10 signed-out read');
 await v2no(getDocs(query(collection(raz,'calendar'),where('date','>=','2030-01-01'))),'calendar vendor read');
 await v2ok(updateDoc(doc(mgr,'calendar','visit_x'),{time:'09:00–14:00'}),'manage 8 visit time of 11 chars');
 await v2no(updateDoc(doc(mgr,'calendar','visit_x'),{time:'09:00 – 14:00'}),'manage 8 visit time of 13 chars');
 // ---------------- projects (projects.md 1-10) ----------------
 for(const [who,db_] of [['manager',mgr],['owner',owner]]){
  await v2ok(getDoc(doc(db_,'projects','p1')),`projects 1 ${who} reads a project`);
  await v2ok(getDoc(doc(db_,'projects/p1/steps','s1')),`projects 1 ${who} reads a step`);
 }
 for(const [who,db_] of [['staff',vol],['vendor',raz],['helper',tamar],['guest',guest],['blocked',blk],['anon',anon]]){
  await v2no(getDoc(doc(db_,'projects','p1')),`projects 2/3 ${who} reads a project`);
  await v2no(getDocs(collection(db_,'projects')),`projects 2/3 ${who} lists projects`);
  await v2no(getDoc(doc(db_,'projects/p1/steps','s1')),`projects 2/3 ${who} reads a step`);
  await v2no(getDocs(collection(db_,'projects/p1/steps')),`projects 2/3 ${who} lists steps`);
  await v2no(setDoc(doc(db_,'projects','px-'+who),project({id:'px-'+who,createdBy:A(who)})),`projects 4 ${who} creates a project`);
  await v2no(updateDoc(doc(db_,'projects/p1/steps','s1'),{assignee:A(who),updatedAt:now}),`projects 4 ${who} updates a step`);
 }
 await v2ok(setDoc(doc(mgr,'projects','p2'),project({id:'p2'})),'projects manager creates');
 await v2no(setDoc(doc(mgr,'projects','p3'),project({id:'p3',secret:1})),'projects 5 extra field');
 await v2no(setDoc(doc(mgr,'projects','p4'),project({id:'p4',title:''})),'projects 5 empty title');
 await v2no(setDoc(doc(mgr,'projects','p5'),project({id:'p5',status:'done'})),'projects 5 created done');
 await v2no(setDoc(doc(mgr,'projects/p1/steps','s3'),step('s3',{done:true,doneBy:A('mgr'),doneAt:now})),'projects 6 step created done');
 await v2no(setDoc(doc(mgr,'projects/p1/steps','s4'),step('s4',{updates:[{by:A('mgr'),at:now,text:'x'}]})),'projects 6 step created with updates');
 await v2no(setDoc(doc(mgr,'projects/p1/steps','s5'),step('s5',{projectId:'p2'})),'projects 6 projectId of another project');
 await v2ok(setDoc(doc(mgr,'projects/p1/steps','s6'),step('s6',{assignee:A('vol'),parentId:'s1',due:'2030-01-01',n:1.5})),'projects step split with parent');
 await v2ok(updateDoc(doc(mgr,'projects/p1/steps','s1'),{assignee:A('mgr'),updatedAt:now}),'projects 7 manager takes a free step');
 await v2no(updateDoc(doc(mgr,'projects/p1/steps','s1'),{done:true,doneBy:A('noa'),doneAt:now,updatedAt:now}),'projects 7 done stamped as someone else');
 await v2ok(updateDoc(doc(mgr,'projects/p1/steps','s1'),{done:true,doneBy:A('mgr'),doneAt:now,updatedAt:now}),'projects 7 done stamped by self');
 await v2no(updateDoc(doc(noa,'projects/p1/steps','s1'),{done:true,doneBy:A('noa'),doneAt:now,updatedAt:now}),'projects late second done (X1)');
 await v2ok(updateDoc(doc(mgr,'projects/p1/steps','s1'),{done:false,doneBy:null,doneAt:null,updatedAt:now}),'projects reopen a step');
 await v2no(updateDoc(doc(mgr,'projects/p1/steps','s1'),{createdBy:A('noa')}),'projects 8 step createdBy');
 await v2no(updateDoc(doc(mgr,'projects/p1/steps','s1'),{createdAt:'2020-01-01T00:00:00.000Z'}),'projects 8 step createdAt');
 await v2no(updateDoc(doc(mgr,'projects','p1'),{createdBy:A('noa')}),'projects 8 project createdBy');
 await v2no(updateDoc(doc(mgr,'projects','p1'),{createdAt:'2020-01-01T00:00:00.000Z'}),'projects 8 project createdAt');
 await v2ok(updateDoc(doc(mgr,'projects','p1'),{members:arrayUnion(A('noa')),memberUids:arrayUnion('noa'),status:'done',doneAt:now,updatedAt:now}),'projects member joins and project done');
 await v2ok(updateDoc(doc(mgr,'projects','p1'),{status:'active',doneAt:null,updatedAt:now}),'projects reopened');
 await v2ok(updateDoc(doc(mgr,'projects/p1/steps','s1'),{updates:arrayUnion({by:A('mgr'),at:now,text:'הזמנתי'}),updatedAt:now}),'projects thread update');
 await v2ok(updateDoc(doc(noa,'projects/p1/steps','s1'),{updates:arrayUnion({by:A('noa'),at:'2030-01-01T10:00:00.000Z',text:'הגיע'}),updatedAt:now}),'projects second thread update by another manager');
 await v2no(updateDoc(doc(mgr,'projects/p1/steps','s1'),{updates:arrayUnion({by:A('noa'),at:now,text:'בשם נועה'}),updatedAt:now}),'projects thread update as someone else');
 await v2no(updateDoc(doc(mgr,'projects/p1/steps','s1'),{updates:[],updatedAt:now}),'projects thread rewritten');
 await v2no(updateDoc(doc(mgr,'projects/p1/steps','s300'),{updates:arrayUnion({by:A('mgr'),at:now,text:'301'}),updatedAt:now}),'projects 10 301st update');
 await v2ok(updateDoc(doc(mgr,'projects/p1/steps','s1'),{title:'צעד חדש',due:'2030-01-05',note:'הערה',updatedAt:now}),'projects edit step');
 await v2ok(deleteDoc(doc(mgr,'projects/p1/steps','s6')),'projects 9 delete an open step');
 await v2no(deleteDoc(doc(mgr,'projects/p1/steps','s2')),'projects 9 delete a done step');
 await v2no(deleteDoc(doc(mgr,'projects','p2')),'projects 9 manager deletes a project');
 await v2ok(deleteDoc(doc(owner,'projects','p2')),'projects owner deletes a project');
 // ---------------- users: system fields (system.md 1-13) and push (broadcast.md 24-28) ----------------
 const photo100k='data:image/jpeg;base64,'+'A'.repeat(100000);
 await v2ok(updateDoc(doc(vol,'users','vol'),{photo:photo100k,photoSource:'custom',updatedAt:now}),'system 1 own photo of 100k');
 await v2ok(updateDoc(doc(vol,'users','vol'),{photo:`https://havat-ravve-api.meniviner.workers.dev/v1/files/avatar/vol/${'x'.repeat(32)}.jpg`,photoSource:'custom',updatedAt:now}),'system 1b own photo stored in R2');
 await v2no(updateDoc(doc(vol,'users','vol'),{photo:'https://tracker.example/p.jpg',photoSource:'custom',updatedAt:now}),'system 1c own photo from another host');
 await v2ok(updateDoc(doc(vol,'users','vol'),{photoSource:'none',updatedAt:now}),'system 2 photoSource none');
 await v2ok(updateDoc(doc(vol,'users','vol'),{photoSource:'google',googlePhoto:'https://lh3.googleusercontent.com/a/x',updatedAt:now}),'system 2 photoSource google');
 await v2ok(updateDoc(doc(vol,'users','vol'),{town:'רביבים',birthDate:'1975-03-14',fields:{receiptPreference:'email'},displayName:'יואב',phone:'0501111111',updatedAt:now}),'system 3 town, birthDate, receipt, name, phone');
 await v2ok(updateDoc(doc(vol,'users','vol'),{push:{enabled:true,kinds:['task','trip'],updatedAt:now},updatedAt:now}),'system 4 push kinds');
 await v2ok(updateDoc(doc(vol,'users','vol'),{push:{enabled:false,kinds:[],updatedAt:now},updatedAt:now}),'system 4 push off');
 await v2ok(updateDoc(doc(vol,'users','vol'),{displayName:'בדיקה',updatedAt:now}),'system name back (presence checks the name)');
 await env3.withSecurityRulesDisabled(async(c)=>{await setDoc(doc(c.firestore(),'role_invites','fresh@example.com'),{email:'fresh@example.com',role:'staff',createdBy:A('mgr'),createdAt:now});});
 await v2ok(setDoc(doc(fresh,'users','fresh'),P('fresh','staff')),'system 5 invited person creates the profile');
 await v2ok(updateDoc(doc(fresh,'users','fresh'),{welcomedAt:now}),'system 5 then welcomedAt');
 await v2ok(updateDoc(doc(tamar,'users','tamar'),{phone:'0529999999',updatedAt:now}),'system 6 vendor helper edits own phone');
 await v2no(updateDoc(doc(vol,'users','vol'),{role:'manager',updatedAt:now}),'system 7 own role');
 await v2no(updateDoc(doc(vol,'users','vol'),{role:'manager',photoSource:'none',updatedAt:now}),'system 7 own role with a photo change');
 for(const [k,v] of [['status','blocked'],['email','x@example.com'],['customerNumber',99],['notes','x'],['log',[]],['vendorId','v-raz'],['helper',true]]) await v2no(updateDoc(doc(vol,'users','vol'),{[k]:v,updatedAt:now}),'system 8 own '+k);
 await v2no(updateDoc(doc(vol,'users','noa'),{photo:jpeg,updatedAt:now}),'system 9 photo on someone else');
 await v2no(updateDoc(doc(vol,'users','dana'),{town:'x',updatedAt:now}),'system 9 town on someone else');
 for(const [k,v] of [['photo',jpeg],['town','x'],['birthDate','1990-01-01'],['push',{enabled:true,kinds:[],updatedAt:now}]]) await v2no(updateDoc(doc(noa,'users','vol'),{[k]:v,updatedAt:now}),'system 10 manager writes '+k);
 await v2no(updateDoc(doc(vol,'users','vol'),{photo:'data:image/jpeg;base64,'+'A'.repeat(120001),updatedAt:now}),'system 11 photo over 120000');
 await v2no(updateDoc(doc(vol,'users','vol'),{photo:'https://x/y.jpg',updatedAt:now}),'system 11 photo not a data URL');
 await v2no(updateDoc(doc(vol,'users','vol'),{photoSource:'facebook',updatedAt:now}),'system 12 photoSource facebook');
 await v2no(updateDoc(doc(vol,'users','vol'),{birthDate:'14.03.1975',updatedAt:now}),'system 12 birthDate not ISO');
 await v2no(updateDoc(doc(vol,'users','vol'),{town:'x'.repeat(61),updatedAt:now}),'system 12 town over 60');
 await v2no(updateDoc(doc(vol,'users','vol'),{push:{enabled:true,kinds:Array.from({length:11},()=>'task'),updatedAt:now},updatedAt:now}),'system 12 push 11 kinds');
 await v2no(updateDoc(doc(vol,'users','vol'),{push:{enabled:true,kinds:[],updatedAt:now,extra:1},updatedAt:now}),'system 12 / broadcast 25 push extra key');
 await v2no(updateDoc(doc(anon,'users','vol'),{town:'x',updatedAt:now}),'system 13 signed out');
 const dev=(i)=>({id:'d'+i,kind:'webpush',endpoint:'https://push.example/'+i,keys:{p256dh:'p',auth:'a'},ua:'iPhone',createdAt:now});
 await v2ok(updateDoc(doc(vol,'users','vol'),{push:{enabled:true,kinds:['broadcast'],devices:[dev(1),dev(2)],updatedAt:now},updatedAt:now}),'broadcast 24 two devices');
 await v2no(updateDoc(doc(vol,'users','vol'),{push:{enabled:true,devices:[1,2,3,4,5,6,7].map(dev),updatedAt:now},updatedAt:now}),'broadcast 25 seven devices');
 await v2no(updateDoc(doc(vol,'users','dana'),{push:{enabled:true,updatedAt:now},updatedAt:now}),'broadcast 26 push on someone else');
 await v2no(setDoc(doc(mgr,'settings','push'),{mode:'off'}),'broadcast 27 manager writes settings/push');
 await v2no(setDoc(doc(owner,'settings','push'),{mode:'off'},{merge:true}),'broadcast 27 owner writes settings/push');
 await v2ok(getDoc(doc(anon,'settings','push')),'broadcast 28 signed-out reads settings/push');
 await v2no(setDoc(doc(guest,'users','guest'),{vendorId:'v-raz',updatedAt:now},{merge:true}),'a guest cannot link itself to a stall');
 // ---------------- broadcasts, receipts, personal notifications, push jobs (broadcast.md 1-23) ----------------
 await v2ok(setDoc(doc(mgr,'broadcasts','b2'),bc('b2')),'broadcast 1 manager sends');
 await v2no(setDoc(doc(vol,'broadcasts','b3'),bc('b3',{by:A('vol')})),'broadcast 2 staff sends');
 await v2no(setDoc(doc(mgr,'broadcasts','b4'),bc('b4',{text:'x'.repeat(201)})),'broadcast 3 text of 201');
 await v2no(setDoc(doc(mgr,'broadcasts','b5'),bc('b5',{by:A('noa')})),'broadcast 3 by someone else');
 await v2no(setDoc(doc(mgr,'broadcasts','b6'),bc('b6',{recipientCount:9})),'broadcast count does not match');
 const send=writeBatch(mgr);send.set(doc(mgr,'broadcasts','b7'),bc('b7'));send.set(doc(mgr,'broadcasts/b7/reads','mgr'),{id:'mgr',uid:'mgr',name:'בדיקה',at:now,seenAt:now});
 await v2ok(send.commit(),'broadcast sender receipt in the same batch');
 await v2ok(getDoc(doc(vol,'broadcasts','b1')),'broadcast 4 recipient gets');
 await v2ok(getDocs(query(collection(vol,'broadcasts'),where('recipients','array-contains','vol'))),'broadcast 4 recipient lists');
 await v2no(getDoc(doc(dana,'broadcasts','b1')),'broadcast 5 staff not a recipient');
 await v2no(getDocs(collection(vol,'broadcasts')),'broadcast staff lists all');
 await v2ok(getDocs(query(collection(raz,'broadcasts'),where('recipients','array-contains','raz'))),'broadcast 6 vendor lists own (D3)');
 await v2no(getDoc(doc(blk,'broadcasts','b1')),'broadcast blocked recipient');
 await v2no(getDoc(doc(guest,'broadcasts','b1')),'broadcast guest');
 await v2ok(updateDoc(doc(mgr,'broadcasts','b1'),{resentAt:now}),'broadcast 7 resentAt');
 await v2no(updateDoc(doc(mgr,'broadcasts','b1'),{text:'אחר'}),'broadcast 7 text changed');
 await v2no(deleteDoc(doc(mgr,'broadcasts','b1')),'broadcast manager deletes');
 await v2ok(setDoc(doc(vol,'broadcasts/b1/reads','vol'),{id:'vol',uid:'vol',name:'בדיקה',seenAt:now},{merge:true}),'broadcast 8 seen');
 await v2ok(setDoc(doc(vol,'broadcasts/b1/reads','vol'),{id:'vol',uid:'vol',name:'בדיקה',at:now,seenAt:now}),'broadcast 8 read');
 await v2no(setDoc(doc(vol,'broadcasts/b1/reads','dana'),{id:'dana',uid:'dana',name:'בדיקה',at:now}),'broadcast 9 receipt for someone else');
 await v2no(setDoc(doc(dana,'broadcasts/b1/reads','dana'),{id:'dana',uid:'dana',name:'בדיקה',at:now}),'broadcast 10 not a recipient');
 await v2no(setDoc(doc(vol,'broadcasts/b1/reads','vol'),{id:'vol',uid:'vol',name:'בדיקה',at:null,seenAt:now}),'broadcast 11 clears at');
 await v2ok(setDoc(doc(vol,'broadcasts/b1/reads','vol'),{seenAt:now},{merge:true}),'broadcast seen again keeps at');
 await v2no(getDocs(collection(vol,'broadcasts/b1/reads')),'broadcast 12 staff lists receipts');
 await v2ok(getDocs(collection(mgr,'broadcasts/b1/reads')),'broadcast 13 manager lists receipts');
 await v2ok(setDoc(doc(raz,'broadcasts/b1/reads','raz'),{id:'raz',uid:'raz',name:'בדיקה',at:now,seenAt:now}),'broadcast vendor recipient reads');
 await v2ok(getDocs(collection(vol,'users/vol/notifications')),'broadcast 14 me reads my notifications');
 await v2ok(updateDoc(doc(vol,'users/vol/notifications','n1'),{readAt:now}),'broadcast 14 me marks read');
 await v2no(updateDoc(doc(vol,'users/vol/notifications','n1'),{title:'x'}),'broadcast 15 me edits title');
 await v2no(getDocs(collection(dana,'users/vol/notifications')),'broadcast 16 staff reads another list');
 await v2no(getDocs(collection(mgr,'users/vol/notifications')),'manager reads another list');
 await v2ok(setDoc(doc(vol,'users/dana/notifications','n2'),note('n2','vol')),'broadcast 17 staff notifies a teammate');
 await v2no(setDoc(doc(vol,'users/dana/notifications','n3'),note('n3','vol',{kind:'broadcast'})),'broadcast 18 staff broadcast kind');
 await v2no(setDoc(doc(vol,'users/dana/notifications','n4'),note('n4','vol',{kind:'system'})),'staff system kind');
 await v2no(setDoc(doc(vol,'users/dana/notifications','n5'),note('n5','noa')),'notification by someone else');
 await v2no(setDoc(doc(vol,'users/dana/notifications','n6'),note('n6','vol',{link:'https://evil.example'})),'notification link off the app');
 await v2no(setDoc(doc(vol,'users/dana/notifications','n7'),note('n7','vol',{readAt:now})),'notification created read');
 await v2ok(setDoc(doc(mgr,'users/vol/notifications','b_b1'),note('b_b1','mgr',{kind:'broadcast',link:'/tasks',refId:'b1'})),'broadcast 19 manager resend overwrites');
 await v2ok(setDoc(doc(raz,'users/mgr/notifications','nv1'),note('nv1','raz',{kind:'vendor',link:'/manage/events/ev-day/vendors'})),'vendor notifies a manager (D6)');
 await v2no(setDoc(doc(raz,'users/mgr/notifications','nv2'),note('nv2','raz')),'vendor task kind');
 await v2no(setDoc(doc(raz,'users/guest/notifications','nv3'),note('nv3','raz',{kind:'vendor'})),'vendor notifies a guest');
 await v2no(setDoc(doc(raz,'users/tamar/notifications','nv4'),note('nv4','raz',{kind:'vendor'})),'vendor notifies another vendor');
 for(const [who,db_] of [['guest',guest],['blocked',blk],['anon',anon]]) await v2no(setDoc(doc(db_,'users/mgr/notifications','nx-'+who),note('nx-'+who,who)),`${who} notifies`);
 await v2ok(setDoc(doc(vol,'push_jobs','j1'),job('j1','vol')),'broadcast 20 staff queues a push');
 await v2no(setDoc(doc(vol,'push_jobs','j2'),job('j2','vol',{kind:'broadcast'})),'broadcast 21 staff broadcast push');
 await v2no(setDoc(doc(vol,'push_jobs','j3'),job('j3','noa')),'broadcast 21 createdBy someone else');
 await v2no(setDoc(doc(vol,'push_jobs','j4'),job('j4','vol',{to:Array.from({length:201},(_,i)=>'u'+i)})),'broadcast 21 to 201');
 await v2no(setDoc(doc(vol,'push_jobs','j5'),job('j5','vol',{to:['vol','dana']})),'broadcast 21 to self');
 await v2no(setDoc(doc(vol,'push_jobs','j6'),job('j6','vol',{sentAt:now})),'push created sent');
 await v2ok(setDoc(doc(mgr,'push_jobs','j7'),job('j7','mgr',{kind:'broadcast'})),'manager broadcast push');
 await v2ok(setDoc(doc(raz,'push_jobs','j8'),job('j8','raz',{kind:'vendor'})),'vendor queues a vendor push');
 await v2no(setDoc(doc(raz,'push_jobs','j9'),job('j9','raz',{kind:'task'})),'vendor queues a task push');
 for(const [who,db_] of [['guest',guest],['blocked',blk],['anon',anon]]) await v2no(setDoc(doc(db_,'push_jobs','jx-'+who),job('jx-'+who,who)),`${who} queues a push`);
 for(const [who,db_] of [['owner',owner],['staff',vol],['vendor',raz]]){
  await v2no(getDoc(doc(db_,'push_jobs','j0')),`broadcast 22 ${who} gets a job`);
  await v2no(getDocs(collection(db_,'push_jobs')),`broadcast 22 ${who} lists jobs`);
 }
 await v2no(updateDoc(doc(vol,'push_jobs','j1'),{sentAt:now}),'broadcast 23 staff sets sentAt');
 await v2no(updateDoc(doc(owner,'push_jobs','j1'),{sentAt:now}),'owner sets sentAt');
 // ---------------- manage (manage.md 1-7) ----------------
 await v2ok(updateDoc(doc(mgr,'notifications','x'),{handled:true,handledBy:A('mgr'),handledAt:now}),'manage 1 handled');
 await v2no(updateDoc(doc(mgr,'notifications','x'),{handled:false,handledBy:null,handledAt:null,title:'x'}),'manage 1 with title');
 await v2ok(updateDoc(doc(mgr,'donations','d1'),{paymentStatus:'paid',paidAt:serverTimestamp(),updatedAt:now}),'manage 2 claimed to paid');
 await v2ok(updateDoc(doc(mgr,'donations','d2'),{paymentStatus:'pending',updatedAt:now}),'manage 2 claimed to pending');
 await v2no(updateDoc(doc(mgr,'donations','d2'),{method:'bit',updatedAt:now}),'manage 2 method');
 await v2ok(setDoc(doc(mgr,'settings','app'),{contactMore:{email:'farm@example.com',address:'',inquiries:''},donationOptions:{custom:true,memorial:false,receipt:true}},{merge:true}),'manage 3 contactMore and donationOptions');
 await v2no(setDoc(doc(mgr,'settings','app'),{payment:{bitNumber:'0501234567'}},{merge:true}),'manage 3 manager payment.bitNumber');
 await v2ok(setDoc(doc(owner,'settings','app'),{payment:{bitNumber:'0501234567'}},{merge:true}),'manage 3 owner payment.bitNumber');
 await v2no(setDoc(doc(mgr,'settings','app'),{contact:{phone:'0501234567',whatsapp:'0501234567',email:'x@example.com'}},{merge:true}),'manage 4 contact email');
 await v2no(setDoc(doc(mgr,'settings','app'),{contact:{whatsapp:'123'}},{merge:true}),'manage 4 whatsapp 123');
 await v2ok(setDoc(doc(mgr,'role_invites','a@b.com'),{email:'a@b.com',role:'staff',createdBy:A('mgr'),createdAt:now}),'manage 5 staff invite');
 await v2no(setDoc(doc(mgr,'role_invites','m@b.com'),{email:'m@b.com',role:'manager',createdBy:A('mgr'),createdAt:now}),'manage 5 manager invite by manager');
 await v2ok(setDoc(doc(owner,'role_invites','m@b.com'),{email:'m@b.com',role:'manager',createdBy:A('owner'),createdAt:now}),'manage 5 manager invite by owner');
 await v2ok(updateDoc(doc(mgr,'users','g2'),{role:'staff',status:'active',notes:'',updatedAt:now}),'manage 6 guest to staff');
 await v2no(updateDoc(doc(mgr,'users','g3'),{role:'manager',status:'active',notes:'',updatedAt:now}),'manage 6 guest to manager by manager');
 await v2ok(updateDoc(doc(owner,'users','g3'),{role:'owner',status:'active',notes:'',updatedAt:now}),'manage 6 owner makes an owner');
 await v2ok(updateDoc(doc(mgr,'users','g4'),{role:'guest',status:'blocked',notes:'',updatedAt:now}),'manage 7 manager blocks a guest');
 await v2ok(updateDoc(doc(mgr,'users','vdana'),{role:'vendor',status:'active',notes:'משלם במזומן',updatedAt:now}),'manager edits a vendor note, role stays vendor');
 await v2no(updateDoc(doc(mgr,'users','g2'),{role:'vendor',status:'active',notes:'',updatedAt:now}),'manager makes a vendor without a claim');
 // ---------------- events area (events.md 1-8) ----------------
 await v2ok(getDoc(doc(vol,'events/ev-day/staffing','gate')),'events 1 staff reads staffing');
 for(const [who,db_] of [['guest',guest],['vendor',raz],['anon',anon]]) await v2no(getDoc(doc(db_,'events/ev-day/staffing','gate')),`events 1 ${who} reads staffing`);
 await v2ok(setDoc(doc(mgr,'events/ev-day/staffing','stall'),{station:'שער',people:[],needed:1}),'events 2 manager writes staffing');
 await v2no(setDoc(doc(mgr,'events/ev-day/staffing','parking'),{station:'חניה',people:[],needed:1,extra:1}),'events 2 extra key');
 await v2no(setDoc(doc(vol,'events/ev-day/staffing','parking'),{station:'חניה',people:[],needed:1}),'events 2 staff writes staffing');
 await v2ok(updateDoc(doc(mgr,'tickets','tk-rem'),{reminderSentAt:now}),'events 3 manager stamps reminderSentAt');
 await v2no(updateDoc(doc(guest,'tickets','tk-rem'),{reminderSentAt:now}),'events 3 owner stamps reminderSentAt');
 await v2ok(updateDoc(doc(mgr,'tabs','tb-open'),{reminderSentAt:now}),'events 4 manager stamps a tab');
 await v2no(updateDoc(doc(vol,'tabs','tb-open'),{reminderSentAt:'2030-01-01T00:00:00.000Z'}),'events 4 staff stamps a tab');
 await v2ok(updateDoc(doc(guest,'tabs','tb-claim'),{status:'claimed',claimedAt:now,updatedAt:now}),'events 5 guest claims with claimedAt');
 await v2no(updateDoc(doc(guest,'tabs','tb-paid'),{claimedAt:now,updatedAt:now}),'events 5 claimedAt on a paid tab');
 await v2ok(setDoc(doc(mgr,'events/ev-day/products','pr2'),{name:'לימונדה',price:12,active:true,sort:2,unit:'כוס'}),'events 6 product unit');
 await v2no(setDoc(doc(mgr,'events/ev-day/products','pr3'),{name:'לימונדה',price:12,active:true,sort:2,unit:'x'.repeat(21)}),'events 6 unit of 21');
 await v2ok(setDoc(doc(mgr,'events/ev-day/files','f2'),{name:'רישיון',url:'data:image/webp;base64,'+'A'.repeat(600000),kind:'image',by:A('mgr'),at:now,mime:'image/webp',size:450000}),'events 7 data URL file');
 await v2ok(setDoc(doc(mgr,'events/ev-day/files','f3'),{name:'תוכנית',url:'data:application/pdf;base64,AAAA',kind:'doc',by:A('mgr'),at:now,mime:'application/pdf',size:3}),'events 7 small PDF');
 await v2no(setDoc(doc(mgr,'events/ev-day/files','f4'),{name:'x',url:'data:text/html,<script>',kind:'doc',by:A('mgr'),at:now}),'events 7 data:text/html');
 await v2no(setDoc(doc(mgr,'events/ev-day/files','f5'),{name:'x',url:'data:image/webp;base64,'+'A'.repeat(700001),kind:'image',by:A('mgr'),at:now}),'events 7 over 700000');
 await v2no(getDoc(doc(vol,'events/ev-day/files','f1')),'events 7 staff reads files');
 const mo=(id,extra={})=>tk(id,{ownerUid:'mgr',ownerName:'משפחת לוי',orderId:'o-m',total:2,index:1,...extra});
 const m1=writeBatch(mgr);m1.set(doc(mgr,'tickets','tm1'),mo('tm1'));m1.set(doc(mgr,'tickets','tm2'),mo('tm2',{index:2}));
 await v2ok(m1.commit(),'events 8 manager adds a guest order (owned by the manager)');
 await v2no(setDoc(doc(mgr,'tickets','tm3'),mo('tm3',{ownerUid:'guest'})),'events 8 owned by the guest');
 await v2no(updateDoc(doc(mgr,'tickets','tm1'),{paymentStatus:'paid',paidAt:now,updatedAt:now}),'events.ts paid with a client paidAt string (code fix: serverNow)');
 await v2ok(updateDoc(doc(mgr,'tickets','tm1'),{paymentStatus:'paid',paidAt:serverTimestamp(),updatedAt:now}),'manager paid with the server time');
 // ---------------- event day (eventday.md) ----------------
 const admit=writeBatch(vol);
 admit.update(doc(vol,'tickets','tk-a'),{scans:arrayUnion({at:now,by:A('vol')}),entries:increment(1),payLater:true,payLaterAt:now,payLaterBy:A('vol'),updatedAt:now});
 admit.set(doc(vol,'events/ev-day/scans','tk-a-1'),scan('vol',{result:'payLater',amount:50,method:'',meta:'כרטיס אחד · 50 ₪'}));
 admit.update(doc(vol,'events/ev-day/counters','live'),{entered:increment(1),scans:increment(1),payLater:increment(1),payLaterAmount:increment(50),perHalfHour:{'18:00':1},per10m:{'18:00':1}});
 await v2ok(admit.commit(),'eventday staff admits as pay later (ticket + scan + counters)');
 await v2ok(setDoc(doc(dana,'events/ev-day/scans','tk-b-1'),scan('dana',{ticketId:'tk-b'})),'eventday a staffed volunteer writes a scan');
 await v2ok(setDoc(doc(vol,'events/ev-day/scans','tk-x-1'),scan('vol',{ticketId:'tk-x'})),'eventday a volunteer not on staffing writes a scan (crew = any staff, decision)');
 await v2no(setDoc(doc(dana,'events/ev-day/scans','tk-a-1'),scan('dana')),'eventday second create of the same entry (two gates)');
 await v2no(setDoc(doc(mgr,'events/ev-day/scans','tk-a-1'),scan('mgr')),'eventday manager overwrites an entry');
 await v2no(setDoc(doc(vol,'events/ev-day/scans','tk-y-1'),scan('dana')),'eventday scan by someone else');
 await v2no(setDoc(doc(vol,'events/ev-day/scans','tk-y-2'),scan('vol',{reopenedBy:A('vol'),reopenedAt:now})),'eventday scan created reopened');
 await v2no(updateDoc(doc(vol,'tickets','tk-b'),{scans:arrayUnion({at:now,by:A('vol')}),entries:increment(1),paymentStatus:'paid',updatedAt:now}),'eventday staff sets paid (not paid_onsite)');
 await v2no(updateDoc(doc(vol,'tickets','tk-b'),{price:0,updatedAt:now}),'eventday staff changes price');
 await v2no(updateDoc(doc(vol,'tickets','tk-b'),{status:'cancelled',updatedAt:now}),'eventday staff changes status');
 await v2no(updateDoc(doc(vol,'tickets','tk-c'),{scans:arrayUnion({at:now,by:A('vol')}),entries:increment(1),updatedAt:now}),'eventday scan of a cancelled ticket');
 await v2no(updateDoc(doc(vol,'tickets','tk-paid'),{payLater:true,payLaterAt:now,payLaterBy:A('vol'),updatedAt:now}),'eventday pay later on a paid ticket');
 await v2ok(updateDoc(doc(vol,'tickets','tk-later'),{payLater:true,payLaterAt:now,payLaterBy:A('vol'),updatedAt:now}),'eventday other owing ticket of the order as pay later');
 await v2no(updateDoc(doc(vol,'tickets','tk-b'),{payLater:true,payLaterAt:now,payLaterBy:A('dana'),updatedAt:now}),'eventday pay later stamped as someone else');
 await v2ok(updateDoc(doc(vol,'tickets','tk-b'),{paymentStatus:'paid_onsite',paidAt:serverTimestamp(),updatedAt:now}),'eventday paid at the gate');
 const walk=(id,i,extra={})=>tk(id,{orderId:'o-walk',index:i,total:2,ownerUid:'',ownerName:'משפחת כהן',ownerPhone:'0521111111',paymentStatus:'paid_onsite',scans:[{at:now,by:A('vol')}],entries:1,walkIn:true,createdBy:A('vol'),...extra});
 const w=writeBatch(vol);w.set(doc(vol,'tickets','tw1'),walk('tw1',1));w.set(doc(vol,'tickets','tw2'),walk('tw2',2));w.set(doc(vol,'events/ev-day/scans','tw1-1'),scan('vol',{ticketId:'tw1',orderId:'o-walk',result:'paidAtGate',amount:100,method:'',count:2}));
 await v2ok(w.commit(),'eventday walk-in paid at the gate');
 await v2ok(setDoc(doc(vol,'tickets','tw3'),walk('tw3',1,{orderId:'o-w2',total:1,paymentStatus:'pending',payLater:true,payLaterAt:now,payLaterBy:A('vol')})),'eventday walk-in pay later');
 await v2no(setDoc(doc(vol,'tickets','tw4'),walk('tw4',1,{orderId:'o-w3',total:1,paymentStatus:'pending'})),'eventday walk-in pending without pay later');
 await v2no(setDoc(doc(vol,'tickets','tw5'),walk('tw5',1,{orderId:'o-w4',total:1,price:0})),'eventday walk-in with another price');
 await v2no(setDoc(doc(vol,'tickets','tw6'),walk('tw6',1,{orderId:'o-w5',total:1,createdBy:A('dana')})),'eventday walk-in createdBy someone else');
 await v2no(setDoc(doc(guest,'tickets','tw7'),walk('tw7',1,{orderId:'o-w6',total:1,createdBy:A('guest'),scans:[{at:now,by:A('guest')}]})),'eventday guest creates a walk-in');
 await v2no(setDoc(doc(vol,'tickets','tw8'),walk('tw8',1,{orderId:'o-w7',total:1,eventId:'ev-closed'})),'eventday walk-in on a closed event');
 await v2ok(updateDoc(doc(vol,'events/ev-day/counters','live'),{scans:increment(1),rejected:increment(1)}),'counters staff adds');
 await v2no(updateDoc(doc(vol,'events/ev-day/counters','live'),{entered:increment(-1)}),'counters staff goes down');
 await v2no(updateDoc(doc(vol,'events/ev-day/counters','live'),{rejected:increment(-1)}),'counters staff rejected -1');
 await v2ok(updateDoc(doc(mgr,'events/ev-day/counters','live'),{rejected:increment(-1),scans:increment(1)}),'counters manager reopen rejected -1');
 await v2ok(setDoc(doc(vol,'events/ev-day/counters','live'),{eventId:'ev-day'},{merge:true}),'counters ensure (merge) on an existing doc');
 await v2no(setDoc(doc(vol,'events/ev-day/counters','live'),{eventId:'ev-day',bogus:1},{merge:true}),'counters unknown key');
 await v2no(setDoc(doc(vol,'events/ev-day/counters','cash'),{gate:{amount:1,by:'x',at:now}},{merge:true}),'eventday staff writes counters/cash');
 await v2no(getDoc(doc(vol,'events/ev-day/counters','cash')),'counters staff reads cash');
 await v2ok(setDoc(doc(mgr,'events/ev-day/counters','cash'),{stall:{amount:300,by:'נועה',at:now}},{merge:true}),'counters manager counts cash');
 await v2ok(getDoc(doc(vol,'events/ev-day/counters','live')),'counters staff reads live');
 await v2no(getDoc(doc(guest,'events/ev-day/counters','live')),'counters guest reads live');
 await v2ok(updateDoc(doc(mgr,'events/ev-day/scans','sc-rej'),{reopenedBy:A('mgr'),reopenedAt:now}),'eventday manager reopens a rejected scan');
 await v2no(updateDoc(doc(noa,'events/ev-day/scans','sc-rej'),{reopenedBy:A('noa'),reopenedAt:now}),'eventday second reopen');
 await v2no(updateDoc(doc(mgr,'events/ev-day/scans','sc-rej'),{keptBy:A('mgr'),keptAt:now}),'eventday keep after reopen');
 await v2no(updateDoc(doc(vol,'events/ev-day/scans','sc-rej2'),{keptBy:A('vol'),keptAt:now}),'eventday staff keeps');
 await v2ok(updateDoc(doc(mgr,'events/ev-day/scans','sc-rej2'),{keptBy:A('mgr'),keptAt:now}),'eventday manager keeps');
 await v2no(updateDoc(doc(mgr,'events/ev-day/scans','sc-rej2'),{reopenedBy:A('mgr'),reopenedAt:now}),'eventday reopen after keep');
 await v2no(updateDoc(doc(mgr,'events/ev-day/scans','sc-ok'),{reopenedBy:A('mgr'),reopenedAt:now}),'eventday reopen an ok scan');
 await v2no(deleteDoc(doc(owner,'events/ev-day/scans','sc-ok')),'eventday owner deletes a scan');
 await v2no(getDoc(doc(guest,'events/ev-day/scans','sc-ok')),'eventday guest reads scans');
 await v2no(getDoc(doc(raz,'events/ev-day/scans','sc-ok')),'eventday vendor reads scans');
 // closing (Y5): no cash in the public event document; crew writes stop; a manager reopens
 await v2no(updateDoc(doc(vol,'events','ev-day'),{closed:{at:now,by:A('vol'),reopenUntil:now},updatedAt:now}),'eventday staff closes');
 await v2no(updateDoc(doc(mgr,'events','ev-day'),{closed:{at:now,by:A('mgr'),cashGate:100,cashGateBy:'דנה',cashStall:300,cashStallBy:'נועה',reopenUntil:now},updatedAt:now}),'eventday closed with cash counts in the public event (code fix)');
 await v2ok(updateDoc(doc(mgr,'events','ev-day'),{closed:{at:now,by:A('mgr'),reopenUntil:now},updatedAt:now}),'eventday manager closes');
 await v2no(setDoc(doc(vol,'events/ev-day/scans','tk-z-1'),scan('vol',{ticketId:'tk-z'})),'eventday scan after close');
 await v2no(updateDoc(doc(vol,'tickets','tk-rem'),{scans:arrayUnion({at:now,by:A('vol')}),entries:increment(1),updatedAt:now}),'eventday ticket scan after close');
 await v2no(updateDoc(doc(vol,'tabs','tb-open'),{items:arrayUnion({productId:'pr1',name:'קפה',price:10,qty:1,at:now,by:A('vol')}),total:increment(10),updatedAt:now}),'eventday tab item after close');
 await v2no(setDoc(doc(vol,'tabs','tb-new'),tb()),'eventday open a tab after close');
 await v2no(updateDoc(doc(vol,'events/ev-day/counters','live'),{scans:increment(1)}),'eventday counters after close');
 await v2ok(updateDoc(doc(mgr,'tickets','tk-later'),{paymentStatus:'paid',paidAt:serverTimestamp(),updatedAt:now}),'eventday manager settles a debt after close');
 await v2ok(updateDoc(doc(mgr,'tabs','tb-open'),{status:'paid',paidAt:serverTimestamp(),updatedAt:now}),'eventday manager settles a tab after close');
 await v2ok(updateDoc(doc(guest,'tabs','tb-closed'),{status:'claimed',updatedAt:now}),'eventday guest claims a tab after close');
 await v2ok(updateDoc(doc(mgr,'events','ev-day'),{closed:null,reopenedAt:now,reopenedBy:A('mgr'),updatedAt:now}),'eventday manager reopens');
 await v2ok(setDoc(doc(vol,'events/ev-day/scans','tk-z-1'),scan('vol',{ticketId:'tk-z'})),'eventday scan after reopen');
 // ---------------- role boundaries for the remaining new paths ----------------
 const roles=[['owner',owner],['manager',mgr],['staff',vol],['vendor',raz],['helper',tamar],['guest',guest],['blocked',blk],['anon',anon]];
 const expect=async(allowed,p,label)=>allowed?v2ok(p,label):v2no(p,label);
 for(const [who,db_] of roles){
  const team=['owner','manager','staff'].includes(who), boss=['owner','manager'].includes(who), stall=['vendor','helper'].includes(who);
  await expect(boss,getDoc(doc(db_,'vendors/v-raz/private','main')),`boundary ${who} reads vendors/private`);
  await expect(boss,setDoc(doc(db_,'vendors/v-raz/private','main'),{notes:'x',updatedAt:now}),`boundary ${who} writes vendors/private`);
  await expect(team||stall,getDoc(doc(db_,'events/ev-day/vendor_info','main')),`boundary ${who} reads vendor_info (raz invited)`);
  await expect(team,getDocs(collection(db_,'events/ev-day/staffing')),`boundary ${who} lists staffing`);
  await expect(team,getDocs(query(collection(db_,'events/ev-day/scans'),where('result','==','rejected'))),`boundary ${who} lists rejected scans`);
  await expect(boss,getDoc(doc(db_,'events/ev-day/counters','cash')),`boundary ${who} reads cash`);
  await expect(team||stall,getDoc(doc(db_,'events/ev-day/counters','live')),`boundary ${who} reads live counter`);
  await expect(boss,getDocs(collection(db_,'broadcasts')),`boundary ${who} lists all broadcasts`);
  await expect(who==='staff',getDoc(doc(db_,'users/vol/notifications','n1')),`boundary ${who} reads vol's notification`);
  await expect(false,getDoc(doc(db_,'push_jobs','j0')),`boundary ${who} reads a push job`);
  await expect(team,getDoc(doc(db_,'shopping_trips','trip-vol')),`boundary ${who} reads a trip`);
  await expect(boss,getDoc(doc(db_,'projects','p1')),`boundary ${who} reads a project`);
 }
 // ---------------- deletes everywhere (2026-11-21): every manager item deletable behind a confirmation ----------------
 await env3.withSecurityRulesDisabled(async(c)=>{
  const f=c.firestore();const put=(p,d)=>setDoc(doc(f,p),d);
  await put('task_templates/tpl-skip',{title:'האכלה',note:'',days:[],time:'07:00',active:true,managersOnly:false,createdBy:A('mgr'),createdAt:now,updatedAt:now});
  await put('tasks/tpl-skip_2030-01-02',task('vol',{templateId:'tpl-skip',dateKey:'2030-01-02'}));
  await put('tasks/tpl-skip_2030-01-03',task('vol',{templateId:'tpl-skip',dateKey:'2030-01-03'}));
  await put('shopping_trips/tr-del',trip('vol',{id:'tr-del',closedAt:now}));
  await put('projects/p9',project({id:'p9'}));await put('projects/p9/steps/s1',step('s1',{projectId:'p9'}));await put('projects/p9/steps/s2',step('s2',{projectId:'p9',done:true,doneBy:A('mgr'),doneAt:now}));
  await put('vendors/v-del',{name:'דוכן למחיקה',phone:'0520000001',external:true,events:['ev-day'],createdAt:now,updatedAt:now});
  await put('vendors/v-del/private/main',{notes:'x',updatedAt:now});
  await put('events/ev-day/vendors/v-del',{vendorId:'v-del',name:'דוכן למחיקה',confirmed:false,notes:'',status:'invited',updatedAt:now});
  await put('vendor_invites/code-del-0001',{code:'code-del-0001',vendorId:'v-del',vendorName:'דוכן למחיקה',role:'owner',name:'יוסי',phone:'',active:false,usedBy:'vdel',usedAt:now,createdBy:A('mgr'),createdAt:now});
  await put('users/vdel',P('vdel','vendor',{vendorId:'v-del',helper:false,addedBy:'mgr',inviteCode:'code-del-0001'}));
  await put('users/gone',P('gone','staff'));await put('role_invites/gone@example.com',{email:'gone@example.com',role:'staff',createdBy:A('mgr'),createdAt:now});
  await put('broadcasts/b-del',bc('b-del'));
  await put('visits/vi-del',{uid:'guest',name:'אורח',phone:'',date:'2030-01-02',people:4,type:'סיור',note:'',status:'approved',managerNote:'',handledBy:A('mgr'),createdAt:now,updatedAt:now});
  await put('calendar/visit_vi-del',{ownerUid:'mgr',ownerName:'בדיקה',title:'ביקור',date:'2030-01-02',time:'10:00',kind:'visit',refId:'vi-del',createdAt:now});
  await put('notifications/n-vi-del',{type:'visit',title:'ביקור',text:'',link:'/manage/inbox',refId:'vi-del',createdAt:now,handled:false,handledBy:null,handledAt:null});
  await put('tickets/tk-del1',tk('del1',{orderId:'o-del'}));await put('tickets/tk-del2',tk('del2',{orderId:'o-del',index:2,total:2}));
  await put('tabs/tb-del',tb({total:10}));
  await put('events/ev-day/vendor_requests/r-del',{id:'r-del',eventId:'ev-day',vendorId:'v-raz',vendorName:'רז',kind:'power',text:'',by:A('raz'),createdAt:now,takenBy:null,closedAt:null,closedBy:null});
 });
 // a recurring day's instance: the task goes and the template remembers the day (skip), in one batch
 await v2ok(updateDoc(doc(mgr,'task_templates','tpl-skip'),{skip:['2030-01-02'],updatedAt:now}),'delete: manager writes a template skip list');
 await v2no(updateDoc(doc(mgr,'task_templates','tpl-skip'),{skip:Array.from({length:31},(_,i)=>'2030-02-'+String(i+1).padStart(2,'0')),updatedAt:now}),'delete: template skip of 31 days');
 await v2no(updateDoc(doc(mgr,'task_templates','tpl-skip'),{skip:'2030-01-02',updatedAt:now}),'delete: template skip not a list');
 await v2no(updateDoc(doc(vol,'task_templates','tpl-skip'),{skip:['2030-01-03'],updatedAt:now}),'delete: staff writes a template skip list');
 { const b=writeBatch(mgr); b.delete(doc(mgr,'tasks','tpl-skip_2030-01-03')); b.update(doc(mgr,'task_templates','tpl-skip'),{skip:['2030-01-02','2030-01-03'],updatedAt:now}); await v2ok(b.commit(),'delete: manager deletes a recurring instance with the skip in one batch'); }
 { const b=writeBatch(vol); b.delete(doc(vol,'tasks','tpl-skip_2030-01-02')); b.update(doc(vol,'task_templates','tpl-skip'),{skip:['2030-01-02'],updatedAt:now}); await v2no(b.commit(),'delete: staff creator of an instance cannot write the skip'); }
 await v2ok(setDoc(doc(mgr,'task_templates','tp-skip2'),tpl({skip:[]})),'delete: template created with an empty skip list');
 // shopping trips: a manager deletes one
 await v2no(deleteDoc(doc(vol,'shopping_trips','tr-del')),'delete: shopper deletes own trip');
 await v2ok(deleteDoc(doc(mgr,'shopping_trips','tr-del')),'delete: manager deletes a trip');
 // a whole project: the owner deletes done steps too, a manager still cannot
 await v2no(deleteDoc(doc(mgr,'projects/p9/steps','s2')),'delete: manager deletes a done step');
 { const b=writeBatch(mgr); b.delete(doc(mgr,'projects/p9/steps','s1')); b.delete(doc(mgr,'projects/p9/steps','s2')); b.delete(doc(mgr,'projects','p9')); await v2no(b.commit(),'delete: manager deletes a whole project'); }
 { const b=writeBatch(owner); b.delete(doc(owner,'projects/p9/steps','s1')); b.delete(doc(owner,'projects/p9/steps','s2')); b.delete(doc(owner,'projects','p9')); await v2ok(b.commit(),'delete: owner deletes a project with a done step'); }
 // a stall from the pool: its access, links, notes and event records in one batch (manager); staff cannot
 const vendorDelete=(u)=>{ const b=writeBatch(u);
  b.update(doc(u,'users','vdel'),{role:'guest',notes:'',updatedAt:now,log:[{at:now,by:A(u===mgr?'mgr':'vol'),text:'x'}]});
  b.delete(doc(u,'vendor_invites','code-del-0001')); b.delete(doc(u,'events/ev-day/vendors','v-del')); b.delete(doc(u,'vendors/v-del/private','main')); b.delete(doc(u,'vendors','v-del'));
  return b.commit(); };
 await v2no(vendorDelete(vol),'delete: staff deletes a stall');
 await v2ok(vendorDelete(mgr),'delete: manager deletes a stall with its access, links, notes and records');
 await v2ok(updateDoc(doc(mgr,'vendors','v-raz'),{events:[],updatedAt:now}),'delete: manager takes an event off a stall history');
 // a person: the owner only
 { const b=writeBatch(mgr); b.delete(doc(mgr,'users','gone')); b.delete(doc(mgr,'role_invites','gone@example.com')); await v2no(b.commit(),'delete: manager deletes a person'); }
 { const b=writeBatch(owner); b.delete(doc(owner,'users','gone')); b.delete(doc(owner,'role_invites','gone@example.com')); await v2ok(b.commit(),'delete: owner deletes a person and the role waiting for the email'); }
 // broadcasts: the owner only
 await v2ok(deleteDoc(doc(owner,'broadcasts','b-del')),'delete: owner deletes a broadcast');
 // a visit with its calendar entry and inbox item; an order; a tab; a stall request; an inbox item
 { const b=writeBatch(vol); b.delete(doc(vol,'visits','vi-del')); await v2no(b.commit(),'delete: staff deletes a visit'); }
 { const b=writeBatch(mgr); b.delete(doc(mgr,'visits','vi-del')); b.delete(doc(mgr,'calendar','visit_vi-del')); b.delete(doc(mgr,'notifications','n-vi-del')); await v2ok(b.commit(),'delete: manager deletes a visit, its calendar entry and inbox item'); }
 await v2no(deleteDoc(doc(vol,'tickets','tk-del1')),'delete: staff deletes a ticket');
 { const b=writeBatch(mgr); b.delete(doc(mgr,'tickets','tk-del1')); b.delete(doc(mgr,'tickets','tk-del2')); await v2ok(b.commit(),'delete: manager deletes a whole order'); }
 await v2no(deleteDoc(doc(vol,'tabs','tb-del')),'delete: staff deletes a tab');
 await v2ok(deleteDoc(doc(mgr,'tabs','tb-del')),'delete: manager deletes a tab');
 await v2no(deleteDoc(doc(vol,'events/ev-day/vendor_requests','r-del')),'delete: staff deletes a stall request');
 await v2ok(deleteDoc(doc(mgr,'events/ev-day/vendor_requests','r-del')),'delete: manager deletes a stall request');
 await v2ok(deleteDoc(doc(mgr,'donations','d2')),'delete: manager deletes a donation');
}finally{await env3.cleanup();}

// ---------------------------------------------------------------------------------------------------------------------
// Vendor area (docs/redesign-data/vendor.md): the rules cases of tests/v2-vendor.mjs part A, run here against
// firestore.rules itself (its seven rules blocks are now in the file). Counted with the v2 cases above.
// ---------------------------------------------------------------------------------------------------------------------
const env4=await initializeTestEnvironment({projectId:'demo-havat-ravve-4',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
{
  const env = env4;
  const db = (uid) => env.authenticatedContext(uid, claims(uid + '@example.com')).firestore();
  const profile = (uid, role, extra = {}) => ({ uid, email: uid + '@example.com', displayName: 'בדיקה', phone: '0500000000', role, status: 'active', customerNumber: 1, acceptedTermsAt: now, createdAt: now, updatedAt: now, ...extra });
  const vendor = (name, extra = {}) => ({ name, phone: '0520000000', product: 'גבינות', sells: 'גבינות', external: true, notes: '', note: '', needs: [], events: [], people: [], inviteNext: false, createdAt: now, updatedAt: now, ...extra });
  const rec = (vid, extra = {}) => ({ vendorId: vid, name: vid, confirmed: false, notes: '', status: 'invited', invitedAt: now, invitedBy: actor('mgr'), answeredAt: null, sells: '', needs: [], people: 1, vehicle: '', note: '', spot: null, spotNote: '', arrivedAt: null, feedback: null, updatedAt: now, ...extra });
  const invite = (code, vid, role, extra = {}) => ({ code, vendorId: vid, vendorName: vid, role, name: 'בדיקה', phone: '0520000000', active: true, usedBy: null, usedAt: null, createdBy: actor('mgr'), createdAt: now, ...extra });
  const request = (id, eid, vid, by, extra = {}) => ({ id, eventId: eid, vendorId: vid, vendorName: vid, kind: 'power', text: 'החשמל נפל', by: actor(by), createdAt: now, takenBy: null, closedAt: null, closedBy: null, ...extra });
  const ok = v2ok, no = v2no, vsection = () => {};
  const vn0 = v2n, vf0 = v2fail;
  try {
    await env.withSecurityRulesDisabled(async (c) => {
      const f = c.firestore();
      await setDoc(doc(f, 'users/mgr'), profile('mgr', 'manager'));
      await setDoc(doc(f, 'users/staff'), profile('staff', 'staff'));
      await setDoc(doc(f, 'users/guest'), profile('guest', 'guest'));
      await setDoc(doc(f, 'users/raz'), profile('raz', 'vendor', { vendorId: 'v-raz', helper: false, addedBy: 'mgr', inviteCode: 'code-raz-0001' }));
      await setDoc(doc(f, 'users/tamar'), profile('tamar', 'vendor', { vendorId: 'v-raz', helper: true, addedBy: 'raz', inviteCode: 'code-tamar-01' }));
      await setDoc(doc(f, 'users/dana'), profile('dana', 'vendor', { vendorId: 'v-dana', helper: false, addedBy: 'mgr', inviteCode: 'code-dana-001' }));
      await setDoc(doc(f, 'counters/users'), { value: 6 });
      await setDoc(doc(f, 'vendors/v-raz'), vendor('גבינות משק רז', { events: ['e-hidden'] }));
      await setDoc(doc(f, 'vendors/v-raz/private/main'), { notes: 'משלם באיחור', updatedAt: now });
      await setDoc(doc(f, 'vendors/v-dana'), vendor('קרמיקה של דנה', { events: ['e-other'] }));
      const ev = (title, published) => ({ title, published, start: '2026-11-28T14:00:00.000Z', end: '2026-11-28T19:00:00.000Z', stall: true, createdBy: actor('mgr'), createdAt: now, updatedAt: now });
      await setDoc(doc(f, 'events/e-hidden'), ev('פסטיבל', false));
      await setDoc(doc(f, 'events/e-other'), ev('יריד', false));
      await setDoc(doc(f, 'events/e-pub'), ev('חנוכה', true));
      await setDoc(doc(f, 'events/e-hidden/vendors/v-raz'), rec('v-raz'));
      await setDoc(doc(f, 'events/e-other/vendors/v-dana'), rec('v-dana', { status: 'confirmed', confirmed: true }));
      await setDoc(doc(f, 'events/e-hidden/vendor_info/main'), { setupFrom: '14:00', managerUids: ['mgr'], updatedAt: now });
      await setDoc(doc(f, 'events/e-other/vendor_info/main'), { setupFrom: '14:00', managerUids: ['mgr'], updatedAt: now });
      await setDoc(doc(f, 'events/e-hidden/counters/live'), { entered: 12 });
      await setDoc(doc(f, 'events/e-other/vendor_requests/r-dana'), request('r-dana', 'e-other', 'v-dana', 'dana'));
      await setDoc(doc(f, 'vendor_invites/code-tamar-01'), invite('code-tamar-01', 'v-raz', 'helper', { active: false, usedBy: 'tamar', usedAt: now, createdBy: actor('raz') }));
      await setDoc(doc(f, 'vendor_invites/code-owner-new'), invite('code-owner-new', 'v-raz', 'owner'));
      await setDoc(doc(f, 'vendor_invites/code-guest-001'), invite('code-guest-001', 'v-dana', 'helper', { createdBy: actor('dana') }));
      await setDoc(doc(f, 'vendor_invites/code-used-0001'), invite('code-used-0001', 'v-raz', 'helper', { active: false, usedBy: 'someone', usedAt: now }));
    });
    const raz = db('raz'), tamar = db('tamar'), dana = db('dana'), staff = db('staff'), mgr = db('mgr'), guest = db('guest'), fresh = db('fresh'), fresh2 = db('fresh2');

    vsection('Rules: own stall, invited events, nothing of other people');
    await ok(getDoc(doc(raz, 'vendors/v-raz')), '1 owner reads own vendor');
    await no(getDoc(doc(raz, 'vendors/v-dana')), '2 owner cannot read another vendor');
    await no(getDocs(collection(raz, 'vendors')), '2 owner cannot list vendors');
    await ok(getDoc(doc(tamar, 'vendors/v-raz')), '3 helper reads the stall');
    await no(getDoc(doc(raz, 'vendors/v-raz/private/main')), '4 vendor cannot read the team notes');
    await ok(getDoc(doc(mgr, 'vendors/v-raz/private/main')), '4 manager reads the team notes');
    await ok(getDoc(doc(raz, 'events/e-hidden')), '5 invited vendor reads an unpublished event');
    await ok(getDoc(doc(tamar, 'events/e-hidden')), '5 helper reads the invited event');
    await no(getDoc(doc(raz, 'events/e-other')), '6 not invited: cannot read the event');
    await no(getDocs(collection(raz, 'events')), '6 vendor cannot list all events');
    await ok(getDocs(query(collection(raz, 'events'), where('published', '==', true))), '7 vendor lists published events');
    await ok(getDoc(doc(raz, 'events/e-hidden/vendor_info/main')), '8 vendor reads the brief of an invited event');
    await ok(getDoc(doc(raz, 'events/e-hidden/counters/live')), '8 vendor reads the live count of an invited event');
    await no(getDoc(doc(raz, 'events/e-other/vendor_info/main')), '9 no brief of another event');
    await no(getDoc(doc(raz, 'events/e-other/vendors/v-dana')), '9 no record of another stall');
    await no(getDocs(collection(raz, 'events/e-hidden/vendors')), '9 cannot list the event vendors');
    await no(getDoc(doc(raz, 'users/tamar')), '28 vendor cannot read another profile');
    await no(getDocs(collection(raz, 'users')), '28 vendor cannot list users');

    vsection('Rules: answering, check-in, requests');
    const mine = doc(raz, 'events/e-hidden/vendors/v-raz');
    await no(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { status: 'confirmed', confirmed: true, answeredAt: now, updatedAt: now }), '11 helper cannot answer');
    await ok(updateDoc(mine, { status: 'confirmed', confirmed: true, answeredAt: now, sells: 'גבינות', needs: ['table', 'power'], people: 2, withVehicle: true, vehicle: 'רכב לפריקה', note: '', updatedAt: now }), '10 owner confirms with needs');
    await no(updateDoc(mine, { spot: 3, updatedAt: now }), '11 owner cannot pick a spot');
    await no(updateDoc(mine, { status: 'confirmed', confirmed: false, answeredAt: now, updatedAt: now }), '10 confirmed must match status');
    await no(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { arrivedAt: now, arrivedBy: 'raz', updatedAt: now }), '12 check-in as someone else is refused');
    await ok(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { arrivedAt: now, arrivedBy: 'tamar', updatedAt: now }), '12 helper checks in');
    await no(updateDoc(mine, { arrivedAt: now, arrivedBy: 'raz', updatedAt: now }), '12 second check-in is refused');
    await ok(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { guidelinesReadAt: now }), 'guidelines read stamp');
    await ok(updateDoc(mine, { feedback: { rating: 5, text: 'היה טוב', inviteNext: true, at: now }, updatedAt: now }), 'owner feedback (D9)');
    await no(updateDoc(mine, { feedback: { rating: 9, text: '', inviteNext: true, at: now }, updatedAt: now }), 'feedback rating out of range');

    const reqRef = (u, id, eid = 'e-hidden') => doc(u, `events/${eid}/vendor_requests/${id}`);
    await ok(setDoc(reqRef(raz, 'r1'), request('r1', 'e-hidden', 'v-raz', 'raz')), '13 owner creates a request');
    await ok(setDoc(reqRef(tamar, 'r2'), request('r2', 'e-hidden', 'v-raz', 'tamar', { kind: 'help', text: 'צריך עזרה בדוכן' })), '13 helper creates a request');
    await no(setDoc(reqRef(dana, 'r3'), request('r3', 'e-hidden', 'v-raz', 'dana')), '14 another vendor cannot ask for this stall');
    await no(setDoc(reqRef(raz, 'r4', 'e-other'), request('r4', 'e-other', 'v-raz', 'raz')), '14 not on that event');
    await no(setDoc(reqRef(raz, 'r5'), request('r5', 'e-hidden', 'v-raz', 'tamar')), '14 by must be the writer');
    await ok(getDocs(query(collection(raz, 'events/e-hidden/vendor_requests'), where('vendorId', '==', 'v-raz'))), '15 owner lists own requests');
    await no(getDocs(collection(raz, 'events/e-hidden/vendor_requests')), '15 owner cannot list all requests');
    await no(getDoc(reqRef(raz, 'r-dana', 'e-other')), '15 cannot read another stall request');
    await ok(updateDoc(reqRef(staff, 'r1'), { takenBy: actor('staff') }), '16 staff takes a request');
    await no(updateDoc(reqRef(raz, 'r1'), { takenBy: actor('raz') }), '16 vendor cannot take');
    await ok(updateDoc(reqRef(raz, 'r1'), { closedAt: now, closedBy: actor('raz') }), '16 owner closes own request');
    await no(updateDoc(reqRef(mgr, 'r1'), { closedAt: now, closedBy: actor('mgr') }), '16 closing twice is refused');
    await ok(updateDoc(reqRef(mgr, 'r2'), { closedAt: now, closedBy: actor('mgr') }), '16 manager closes a request');

    vsection('Rules: the stall and its people');
    await ok(updateDoc(doc(raz, 'vendors/v-raz'), { name: 'גבינות רז', note: 'מגיע עם מקרר', sells: 'גבינות', product: 'גבינות', inviteNext: true, updatedAt: now }), '17 owner edits the stall');
    await no(updateDoc(doc(raz, 'vendors/v-raz'), { external: false, updatedAt: now }), '17 owner cannot change external');
    await no(updateDoc(doc(raz, 'vendors/v-raz'), { notes: 'x', updatedAt: now }), '17 owner cannot write team notes');
    await no(updateDoc(doc(raz, 'vendors/v-raz'), { events: arrayUnion('e-pub'), updatedAt: now }), '17 owner cannot add events');
    await no(updateDoc(doc(tamar, 'vendors/v-raz'), { name: 'x', updatedAt: now }), '18 helper cannot edit');
    await no(updateDoc(doc(dana, 'vendors/v-raz'), { name: 'x', updatedAt: now }), '18 another vendor cannot edit');
    const helperInvite = invite('code-avi-0001', 'v-raz', 'helper', { createdBy: actor('raz') });
    const b1 = writeBatch(raz);
    b1.set(doc(raz, 'vendor_invites/code-avi-0001'), helperInvite);
    b1.update(doc(raz, 'vendors/v-raz'), { people: arrayUnion({ name: 'אבי', phone: '0521234567', role: 'helper', entered: false, code: 'code-avi-0001' }), updatedAt: now });
    await ok(b1.commit(), '19 owner adds a helper (invite + people)');
    await no(setDoc(doc(raz, 'vendor_invites/code-own-0002'), invite('code-own-0002', 'v-raz', 'owner', { createdBy: actor('raz') })), '19 owner cannot create an owner invite');
    await no(setDoc(doc(raz, 'vendor_invites/code-dana-002'), invite('code-dana-002', 'v-dana', 'helper', { createdBy: actor('raz') })), '19 owner cannot invite to another stall');
    await no(setDoc(doc(tamar, 'vendor_invites/code-tam-0002'), invite('code-tam-0002', 'v-raz', 'helper', { createdBy: actor('tamar') })), '19 helper cannot invite');
    await ok(getDocs(query(collection(raz, 'vendor_invites'), where('vendorId', '==', 'v-raz'))), '20 owner lists own invites');
    await no(getDocs(query(collection(tamar, 'vendor_invites'), where('vendorId', '==', 'v-raz'))), '20 helper cannot list invites');
    await no(getDocs(query(collection(dana, 'vendor_invites'), where('vendorId', '==', 'v-raz'))), '20 another vendor cannot list');
    await ok(getDoc(doc(guest, 'vendor_invites/code-owner-new')), '21 the link holder reads the invite');
    await ok(updateDoc(doc(raz, 'vendor_invites/code-avi-0001'), { active: false }), '26 owner revokes a helper invite');
    await no(updateDoc(doc(raz, 'vendor_invites/code-owner-new'), { active: false }), '26 owner cannot revoke an owner invite');

    vsection('Rules: claiming an invite');
    const claimNew = (u, uid, code, inv, over = {}, useInvite = true, value = 7) => {
      const b = writeBatch(u);
      b.set(doc(u, `users/${uid}`), { ...profile(uid, 'vendor'), customerNumber: 7, vendorId: inv.vendorId, helper: inv.role === 'helper', addedBy: inv.createdBy, inviteCode: code, ...over });
      b.update(doc(u, 'counters/users'), { value });
      if (useInvite) b.update(doc(u, `vendor_invites/${code}`), { usedBy: uid, usedAt: now, active: false });
      return b.commit();
    };
    await no(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-raz', role: 'owner', createdBy: 'mgr' }, {}, false), '23 vendor profile without using the invite');
    await no(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-dana', role: 'owner', createdBy: 'mgr' }), '23 wrong vendorId');
    await no(claimNew(fresh, 'fresh', 'code-used-0001', { vendorId: 'v-raz', role: 'helper', createdBy: 'mgr' }), '23 used invite');
    await no(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-raz', role: 'helper', createdBy: 'mgr' }), '23 helper flag must match the invite');
    await ok(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-raz', role: 'owner', createdBy: 'mgr' }), '22 new account claims (profile + invite + counter)');
    await ok(getDoc(doc(fresh, 'vendors/v-raz')), '22 the new owner reads the stall');
    await no(claimNew(fresh2, 'fresh2', 'code-owner-new', { vendorId: 'v-raz', role: 'owner', createdBy: 'mgr' }, {}, true, 8), '23 the same invite twice');
    const claimExisting = (u, uid, code, inv) => {
      const b = writeBatch(u);
      b.update(doc(u, `users/${uid}`), { role: 'vendor', vendorId: inv.vendorId, helper: inv.role === 'helper', addedBy: inv.createdBy, inviteCode: code, updatedAt: now });
      b.update(doc(u, `vendor_invites/${code}`), { usedBy: uid, usedAt: now, active: false });
      return b.commit();
    };
    await no(claimExisting(staff, 'staff', 'code-guest-001', { vendorId: 'v-dana', role: 'helper', createdBy: 'dana' }), '25 a team account cannot become a stall');
    await ok(claimExisting(guest, 'guest', 'code-guest-001', { vendorId: 'v-dana', role: 'helper', createdBy: 'dana' }), '24 guest claims a helper invite');
    await ok(getDoc(doc(guest, 'events/e-other')), '24 the new helper reads the invited event');
    await no(updateDoc(doc(guest, 'users/guest'), { vendorId: 'v-raz', updatedAt: now }), 'a vendor cannot switch stall by itself');
    await no(updateDoc(doc(mgr, 'users/staff'), { role: 'vendor', status: 'active', notes: '', updatedAt: now }), 'a manager cannot make a vendor without a claim');

    vsection('Rules: removing access (V6)');
    await ok(updateDoc(doc(mgr, 'users/raz'), { role: 'guest', notes: '', updatedAt: now, log: [] }), '27 manager sets the vendor back to guest');
    await no(getDoc(doc(raz, 'vendors/v-raz')), '27 after removal the stall is closed');
    await no(getDoc(doc(raz, 'events/e-hidden')), '27 and so is the event');
  } finally {
    await env.cleanup();
  }
  console.log(`PASS check — vendor rules (ported from tests/v2-vendor.mjs): ${(v2n - vn0) - (v2fail - vf0)} of ${v2n - vn0} passed`);
}
console.log(`PASS check — v2 rules: ${v2n-v2fail} of ${v2n} passed`);
if(v2fail) throw new Error(`v2 rules: ${v2fail} failed`);
