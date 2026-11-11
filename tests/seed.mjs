// Seeds the running Firestore emulator with realistic demo data for visual review.
// Usage: FIRESTORE_EMULATOR_HOST=localhost:8080 node tests/seed.mjs
// The first account in the Auth emulator becomes the owner profile (sign in once in the app first).
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);require('firebase/compat/firestore');
import fs from 'node:fs';
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,setDoc}=require('firebase/firestore');
const project=process.argv[2]||'demo-havat-ravve';
const accounts=await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${process.argv[3]||'demo-havat-ravve'}/accounts:query`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:'{}'}).then(r=>r.json()).catch(()=>({}));
if(accounts.userInfo)accounts.users=accounts.userInfo;
const env=await initializeTestEnvironment({projectId:project,firestore:{rules:fs.readFileSync('firestore.rules','utf8'),host:'localhost',port:8080}});
let owner=accounts.users?.[0];
if(!owner){ // fall back to an existing owner profile in Firestore
 const {getDocs,collection,query,where}=require('firebase/firestore');
 await env.withSecurityRulesDisabled(async(ctx)=>{const snap=await getDocs(query(collection(ctx.firestore(),'users'),where('role','==','owner')));const d=snap.docs[0]?.data();if(d)owner={localId:d.uid,email:d.email};});
}
if(!owner){console.error('Sign in once in the app first.');await env.cleanup();process.exit(1);}
const iso=(d)=>d.toISOString();const day=(n,h=12)=>{const d=new Date();d.setDate(d.getDate()+n);d.setHours(h,0,0,0);return d;};
const key=(d)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jerusalem'}).format(d);
const now=iso(new Date());
const me={uid:owner.localId,name:'מני וינר'};
const beni={uid:'seed-beni',name:'בני גוטמן'};const noa={uid:'seed-noa',name:'נועה לוי'};const yossi={uid:'seed-yossi',name:'יוסי כהן'};const guest={uid:'seed-guest',name:'רותם אברהם'};
await env.withSecurityRulesDisabled(async(ctx)=>{
 const db=ctx.firestore();const S=(c,id,d)=>setDoc(doc(db,c,id),d);
 const prof=(a,email,role,status,n,extra={})=>({uid:a.uid,email,displayName:a.name,phone:'05'+String(2000000+n).padStart(8,'0'),role,status,customerNumber:n,acceptedTermsAt:now,createdAt:iso(day(-30+n)),updatedAt:now,...extra});
 await S('users',me.uid,prof(me,owner.email,'owner','active',1));
 await S('users',beni.uid,prof(beni,'beni@example.com','manager','active',2));
 await S('users',noa.uid,prof(noa,'noa@example.com','staff','active',3));
 await S('users',yossi.uid,prof(yossi,'yossi@example.com','staff','pending',4));
 await S('users',guest.uid,prof(guest,'rotem@example.com','guest','active',5));
 await S('counters','users',{value:5});
 await S('role_invites','newvolunteer@example.com',{email:'newvolunteer@example.com',role:'staff',createdBy:beni,createdAt:now});
 for(let i=0;i<12;i++)await S('shopping','hist'+i,{title:['חלב','לחם','ביצים','שקי מלט','ברגים','חלב','עגבניות','חלב','סבון','לחם','ביצים','חוט קשירה'][i],qty:['3 יח׳','','תבנית','2','','3 יח׳','','3 יח׳','','','תבנית',''][i],urgent:false,note:'',link:'',category:['super','super','super','building','building','super','super','super','super','super','super','building'][i],createdBy:noa,createdAt:iso(day(-i*3-2)),bought:true,boughtBy:[noa,me,beni][i%3],boughtAt:iso(day(-i*3-1,11)),expireAt:iso(day(-i*3)),updatedAt:now});
 const act=(kind,refId,action,text,by,daysAgo,extra={})=>S('activity','a'+Math.random().toString(36).slice(2,9),{kind,refId,action,text,by,at:iso(day(-daysAgo,10+Math.floor(Math.random()*8))),subjectUid:'',eventId:'',...extra});
 await act('task','t5','done','לצבוע את הספסל',noa,0);await act('task','t6','done','להעביר את הגזם',me,0);await act('task','t1','created','להחליף את הדגל',beni,1);await act('shopping','s3','bought','שקית קמח',me,0);await act('ticket','o2','ordered','כרטיס · פסטיבל החורף',guest,3,{subjectUid:guest.uid,eventId:'e1'});await act('visit','vi1','requested','4 אנשים · סיור',guest,2,{subjectUid:guest.uid});await act('donation','d2','paid','שירה גל · 360 ₪',beni,1);await act('user',noa.uid,'role','נועה לוי: אורח/ת ← צוות',beni,20,{subjectUid:noa.uid});
 await S('invites','7A8DSP',{code:'7A8DSP',role:'staff',active:true,createdBy:beni,createdAt:now,usedBy:[noa.uid]});
 await S('settings','app',{donationPresets:[{amount:18,label:'חי'},{amount:180,label:'עשר פעמים חי'},{amount:360,label:'לב'}],visitTypes:['סיור בחווה','מפגש קבוצתי','אירוע פרטי','אחר'],payment:{bit:'050-1234567',paybox:'',cash:true,note:''},templates:{visitApproved:'שלום [שם], הביקור בחוות רווה ב־[תאריך] מאושר. נשמח לראותכם!',donationThanks:'שלום [שם], תודה רבה על התרומה לחוות רווה.',debtReminder:'שלום [שם], תודה שהייתם ב־[אירוע]. נשאר לתשלום [סכום] ₪.',ticketReminder:'שלום [שם], מזכירים: [אירוע] ב־[תאריך].'},registrationFields:[{id:'city',label:'יישוב',type:'text',options:[],required:false}],guestIntro:'ברוכים הבאים לחוות רווה. כאן מזמינים כרטיסים לאירועים, מתאמים ביקור ותורמים.'});
 // places
 await S('places','p1',{name:'העץ מאחורי הביתן',lat:31.3521,lng:34.9712,createdBy:beni,createdAt:now});
 await S('places','p2',{name:'שורת העציצים הצפונית',lat:31.3528,lng:34.9705,createdBy:beni,createdAt:now});
 await S('places','p3',{name:'הכניסה הראשית',lat:31.3515,lng:34.9720,createdBy:beni,createdAt:now});
 // templates
 await S('task_templates','tpl1',{title:'השקיית העציצים',note:'גם את השורה שמאחורי המכולה',days:[],time:'07:30',active:true,managersOnly:false,createdBy:beni,createdAt:now,updatedAt:now});
 await S('task_templates','tpl2',{title:'סידור הכלים במחסן',note:'',days:[5],time:'',active:true,managersOnly:false,createdBy:beni,createdAt:now,updatedAt:now});
 await S('task_templates','tpl3',{title:'בדיקת קופה',note:'',days:[],time:'',active:true,managersOnly:true,createdBy:beni,createdAt:now,updatedAt:now});
 // tasks
 const task=(id,t,extra={})=>S('tasks',id,{title:t,note:'',photo:'',location:null,dueDate:'',managersOnly:false,templateId:null,dateKey:null,createdBy:beni,createdAt:iso(day(-1)),done:false,doneBy:null,doneAt:null,donePhoto:'',doneNote:'',assignee:null,urgent:false,updatedAt:now,...extra});
 await task('t1','להחליף את הדגל ליד הכניסה',{note:'הדגל הקרוע במחסן, ליד הסולם.',location:{lat:31.3515,lng:34.9720,placeId:'p3',placeName:'הכניסה הראשית'}});
 await task('t2','לתקן את הברז בשירותים',{dueDate:key(day(-2)),urgent:true});
 await task('t7','להזמין חול לארגז של הילדים',{assignee:me,dueDate:key(day(0))});
 await task('t8','לבדוק את משאבת המים',{assignee:noa,urgent:true});
 await task('t3','להביא שק מלט מהרכב',{createdBy:noa,dueDate:key(day(0))});
 await task('t4','לנקות את אזור האוהלים לפני שבת',{dueDate:key(day(3))});
 await task('t5','לצבוע את הספסל',{done:true,doneBy:noa,doneAt:iso(new Date(Date.now()-3*3600e3))});
 await task('t6','להעביר את הגזם לפינת הקומפוסט',{done:true,doneBy:me,doneAt:iso(new Date(Date.now()-40*60e3)),doneNote:'הגזם ליד הגדר הצפונית'});
 for(let i=1;i<=9;i++)await task('h'+i,['סידור הכלים','השקיה','תיקון גדר','איסוף זבל','ניקיון מטבח','הכנת מדורה','בדיקת מים','סימון שבילים','גיזום'][i-1],{done:true,doneBy:[noa,me,beni][i%3],doneAt:iso(day(-i,14)),createdAt:iso(day(-i-1))});
 await task('m1','לסגור חוזה עם ספק היין',{managersOnly:true,createdBy:me});
 // shopping
 const item=(id,t,cat,extra={})=>S('shopping',id,{title:t,qty:'',urgent:false,note:'',link:'',category:cat,createdBy:noa,createdAt:iso(new Date(Date.now()-2*3600e3)),bought:false,boughtBy:null,boughtAt:null,expireAt:null,updatedAt:now,...extra});
 await item('s1','חלב','super',{qty:'3 יח׳'});await item('s2','ביצים','super',{createdBy:beni});await item('s3','שקית קמח','super',{bought:true,boughtBy:me,boughtAt:iso(new Date(Date.now()-50*60e3)),expireAt:iso(day(1))});
 await item('s4','שקי מלט','building',{qty:'2',urgent:true});await item('s5','ברגים 6 מ״מ','building');
 await item('s6','משאבת מים סולארית','online',{link:'https://www.example.com/pump'});
 await item('s7','ארון למחסן','giveaway');await item('s8','גדר רשת','giveaway');
 // events
 const ev=(id,t,start,end,extra={})=>S('events',id,{title:t,description:'ערב של מוזיקה חיה, יין מהחווה ואוכל טוב. מתאים לכל המשפחה. מביאים שמיכה ומצב רוח טוב.',image:'',location:'חוות רווה',start:iso(start),end:iso(end),price:50,maxPerOrder:5,capacity:0,open:true,published:true,questions:[{id:'q1',label:'איך שמעתם עלינו?',required:false}],createdBy:beni,createdAt:iso(day(-10)),updatedAt:now,...extra});
 await ev('e1','פסטיבל החורף',day(12,18),day(12,23));
 await ev('e2','סיור שקיעה ויין',day(4,16),day(4,19),{price:0,questions:[]});
 await ev('e3','ערב בוטיק: גבינות ושירה',day(-20,18),day(-20,22),{open:false});
 await ev('e4','סדנת חמוציות (טיוטה)',day(30,10),day(30,13),{published:false});
 await S('events/e1/products','pr1',{name:'כוס יין',price:25,active:true,sort:0});await S('events/e1/products','pr2',{name:'בקבוק בירה',price:20,active:true,sort:1});await S('events/e1/products','pr3',{name:'צלחת גבינות',price:45,active:true,sort:2});await S('events/e1/products','pr4',{name:'מים',price:8,active:true,sort:3});
 await S('vendors','v1',{name:'גבינות העמק',phone:'0521111111',product:'גבינות',external:true,notes:'',createdAt:now,updatedAt:now});
 await S('vendors','v2',{name:'יקב רווה',phone:'0522222222',product:'יין',external:false,notes:'',createdAt:now,updatedAt:now});
 await S('events/e1/vendors','v1',{vendorId:'v1',name:'גבינות העמק',confirmed:true,notes:''});
 // tickets
 const tk=(id,ev,title,orderId,idx,total,owner,extra={})=>S('tickets',id,{eventId:ev,eventTitle:title,orderId,index:idx,total,ownerUid:owner.uid,ownerName:owner.name,ownerPhone:'0500000000',holderName:'',secret:'abcdef0123456789abcdef'+String(idx).padStart(2,'0'),price:50,paymentStatus:'pending',status:'valid',scans:[],entries:0,answers:{q1:'מחברים'},createdAt:iso(day(-3)),updatedAt:now,...extra});
 await tk('k1','e1','פסטיבל החורף','o1',1,2,me);await tk('k2','e1','פסטיבל החורף','o1',2,2,me,{holderName:'דנה וינר'});
 await tk('k3','e1','פסטיבל החורף','o2',1,1,guest,{paymentStatus:'paid'});
 await tk('k4','e1','פסטיבל החורף','o3',1,3,{uid:'seed-g2',name:'אבי שטרן'},{paymentStatus:'claimed'});await tk('k5','e1','פסטיבל החורף','o3',2,3,{uid:'seed-g2',name:'אבי שטרן'},{paymentStatus:'claimed'});await tk('k6','e1','פסטיבל החורף','o3',3,3,{uid:'seed-g2',name:'אבי שטרן'},{paymentStatus:'claimed'});
 await tk('k7','e2','סיור שקיעה ויין','o4',1,2,me,{price:0,paymentStatus:'free'});await tk('k8','e2','סיור שקיעה ויין','o4',2,2,me,{price:0,paymentStatus:'free'});
 await tk('k9','e3','ערב בוטיק: גבינות ושירה','o5',1,1,guest,{paymentStatus:'paid_onsite',scans:[{at:iso(day(-20,19)),by:noa},{at:iso(day(-20,20)),by:noa}],entries:2});
 // tabs
 await S('tabs','tab1',{eventId:'e1',eventTitle:'פסטיבל החורף',guestUid:me.uid,guestName:me.name,guestPhone:'0500000000',ticketId:'k1',items:[{productId:'pr1',name:'כוס יין',price:25,qty:2,at:now,by:noa},{productId:'pr3',name:'צלחת גבינות',price:45,qty:1,at:now,by:noa}],total:95,status:'open',createdBy:noa,createdAt:now,updatedAt:now});
 await S('tabs','tab2',{eventId:'e3',eventTitle:'ערב בוטיק: גבינות ושירה',guestUid:guest.uid,guestName:guest.name,guestPhone:'0523333333',ticketId:'k9',items:[{productId:'x',name:'כוס יין',price:25,qty:3,at:iso(day(-20,20)),by:noa}],total:75,status:'open',createdBy:noa,createdAt:iso(day(-20,20)),updatedAt:iso(day(-20,21))});
 // visits
 const vs=(id,o,d,people,status,extra={})=>S('visits',id,{uid:o.uid,name:o.name,phone:'0523333333',date:key(day(d)),people,type:'סיור בחווה',note:'משפחה עם שני ילדים, מעניין אותנו הסיפור של המשטרה',status,managerNote:'',handledBy:null,createdAt:iso(day(-2)),updatedAt:now,...extra});
 await vs('vi1',guest,6,4,'new');await vs('vi2',{uid:'seed-g3',name:'מיכל בר'},9,12,'new',{type:'מפגש קבוצתי',note:''});await vs('vi3',me,2,2,'approved',{managerNote:'נפגשים בשער ב־10:00',handledBy:beni});
 await S('calendar','visit_vi3',{ownerUid:beni.uid,ownerName:beni.name,title:'ביקור: מני וינר (2)',date:key(day(2)),time:'',kind:'visit',refId:'vi3',createdAt:now});
 await S('calendar','event_e1',{ownerUid:beni.uid,ownerName:beni.name,title:'פסטיבל החורף',date:key(day(12)),time:'18:00',kind:'event',refId:'e1',createdAt:now});
 await S('calendar','c1',{ownerUid:me.uid,ownerName:me.name,title:'אני בחווה',date:key(day(1)),time:'09:00',kind:'manual',refId:'',createdAt:now});
 await S('calendar','c2',{ownerUid:beni.uid,ownerName:beni.name,title:'פגישת צוות',date:key(day(1)),time:'17:00',kind:'manual',refId:'',createdAt:now});
 // donations
 const dn=(id,o,amount,label,status,extra={})=>S('donations',id,{uid:o.uid,name:o.name,phone:'0523333333',amount,label,note:'',memorial:'',receiptWanted:false,receiptName:'',receiptSent:false,paymentStatus:status,createdAt:iso(day(-1)),updatedAt:now,...extra});
 await dn('d1',guest,180,'עשר פעמים חי','claimed',{receiptWanted:true,receiptName:'רותם אברהם',memorial:'סבא יעקב'});await dn('d2',{uid:'seed-g4',name:'שירה גל'},360,'לב','paid');await dn('d3',me,50,'','pending',{note:'תודה על הסיור!'});
 // notifications
 const nt=(id,type,title,text,link,refId,extra={})=>S('notifications',id,{type,title,text,link,refId,createdAt:iso(new Date(Date.now()-Math.random()*5*3600e3)),handled:false,handledBy:null,handledAt:null,...extra});
 await nt('n1','visit','בקשת ביקור חדשה','רותם אברהם · 4 אנשים · '+key(day(6)),'/manage/visits','vi1');
 await nt('n2','donation','תרומה חדשה','רותם אברהם · 180 ₪ · הנצחה','/manage/donations','d1');
 await nt('n3','join','בקשת הצטרפות','יוסי כהן מבקש להצטרף לצוות','/manage/people','seed-yossi');
 await nt('n4','claim','תשלום הועבר: פסטיבל החורף','אבי שטרן סימן/ה שהעביר/ה תשלום על 3 כרטיסים','/manage/events/e1','o3');
 await nt('n5','order','הזמנה חדשה: פסטיבל החורף','רותם אברהם הזמין/ה כרטיס','/manage/events/e1','o2',{handled:true,handledBy:beni,handledAt:now});
});
await env.cleanup();
console.log('Seeded demo data for owner',owner.email,owner.localId);
