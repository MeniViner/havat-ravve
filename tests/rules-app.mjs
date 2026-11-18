// Rules tests for the team app collections (users, invites, tasks, task_templates, shopping, places).
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);require('firebase/compat/firestore');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocFromCache,getDocs,collection,updateDoc,deleteDoc,query,where,arrayUnion,increment,disableNetwork,enableNetwork,writeBatch}=require('firebase/firestore');

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

 // --- places ---
 await assertFails(setDoc(doc(vol,'places','p1'),{name:'עץ',lat:31.3,lng:35,createdBy:actor('vol'),createdAt:now}));
 await assertSucceeds(setDoc(doc(beni,'places','p1'),{name:'עץ',lat:31.3,lng:35,createdBy:actor('beni'),createdAt:now}));
 await assertSucceeds(getDocs(collection(vol,'places')));

 // --- blocked user loses everything ---
 await assertSucceeds(updateDoc(doc(beni,'users','vol'),{role:'staff',status:'blocked',notes:'',updatedAt:now}));
 await assertFails(setDoc(doc(vol,'tasks','t9'),task('vol')));
 await assertFails(getDocs(collection(vol,'shopping')));

 console.log('PASS: team app rules — profiles, bootstrap owner, join codes, manager limits, task visibility, done-only edits, recurring ids, shopping, places, blocking.');
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
 // the team list: a volunteer may list team members by role, never everyone
 await assertSucceeds(getDocs(query(collection(vol,'users'),where('role','in',['owner','manager','staff']))));
 await assertFails(getDocs(collection(vol,'users')));
 await assertFails(getDocs(query(collection(guest,'users'),where('role','in',['owner','manager','staff']))));
 // item history: the kind is part of the query, so a volunteer can read it for a task
 await assertSucceeds(getDocs(query(collection(vol,'activity'),where('kind','==','task'),where('refId','==','t1'))));
 await assertFails(getDocs(query(collection(vol,'activity'),where('refId','==','t1'))));
 console.log('PASS: guest side rules — settings, published events, ticket ownership/payment/scan rules, visits, donations, stall tabs, notifications, calendar.');
}finally{await env2.cleanup();}
