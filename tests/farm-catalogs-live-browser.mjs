// A manager archives a product while two event selections stay open in independent browser sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const require=createRequire(import.meta.url);
require('firebase/compat/firestore');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,setLogLevel}=require('firebase/firestore');setLogLevel('silent');
const host=process.env.FIRESTORE_EMULATOR_HOST||'';assert.match(host,/^127\.0\.0\.1:\d+$/);
const projectId='demo-havat-farm-catalogs',port=Number(host.split(':')[1]),uid='g4-browser-manager';
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port,rules:await fs.readFile('firestore.rules','utf8')}});
const stamp='2030-01-02T09:00:00.000Z',claims={sub:uid,user_id:uid,email:'g4@example.invalid',email_verified:true,firebase:{sign_in_provider:'google.com'}};
const profile={uid,role:'manager',status:'active',displayName:'מנהלת בדיקה',email:claims.email,phone:'0500000000',createdAt:stamp,updatedAt:stamp,acceptedTermsAt:stamp};
const master={name:'קפה בדיקת שער',price:7,createdAt:stamp,updatedAt:stamp},eventProduct={name:master.name,price:7,catalogId:'live-coffee',catalogProductId:'coffee',active:true,sort:1};
const selectedId='catalog_11_live-coffee_coffee',sale={eventId:'g4-live-a',guestUid:uid,items:[{productId:selectedId,name:master.name,price:7,qty:2,at:stamp,by:{uid,name:profile.displayName}}],total:14};
const config=JSON.parse(await fs.readFile('site.config.json','utf8'));config.firebase={projectId,apiKey:'synthetic-key',appId:'1:123:web:tests',authDomain:'localhost.invalid'};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {connectFirestoreEmulator} from 'firebase/firestore';
 import {db} from './src/app/firebase';import {V2Root} from './src/app/v2/App';import {settings} from './src/app/demo/data';import './src/app/app.css';
 connectFirestoreEmulator(db,'127.0.0.1',${port},{mockUserToken:${JSON.stringify(claims)}});
 const profile=${JSON.stringify(profile)};
 createRoot(document.getElementById('root')).render(<V2Root settings={settings} profile={profile} user={{uid:profile.uid,displayName:profile.displayName,email:profile.email}}/>);
 `},outfile:'fixture.js',format:'iife',jsx:'automatic',bundle:true,write:false,define:{'process.env.NODE_ENV':'"production"'},external:['/assets/*'],logLevel:'silent',
 plugins:[{name:'only-synthetic-project',setup(b){b.onResolve({filter:/site\.config\.json$/},()=>({path:'config',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'json',contents:JSON.stringify(config)}))}}]});
const server=http.createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/app')){res.setHeader('content-type','text/html;charset=utf-8');res.end('<html dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');return}
 const f=bundle.outputFiles.find(x=>x.path.endsWith(path));if(f){res.setHeader('content-type',path.endsWith('.js')?'text/javascript':'text/css');res.end(f.contents)}else{res.statusCode=404;res.end()}
});let browser;
try{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();const jobs=[['users/'+uid,profile],['farm_catalogs/live-coffee',{name:'משקאות בדיקת חווה',createdAt:stamp,updatedAt:stamp}],['farm_catalogs/live-coffee/products/coffee',master],['tabs/g4-live-sale',sale]];
  for(const id of ['g4-live-a','g4-live-b']){jobs.push(['events/'+id,{title:'אירוע דמה '+id,entry:false,stall:true,start:stamp,end:'2030-01-02T16:00:00.000Z',published:true,open:true,createdAt:stamp,updatedAt:stamp}],['events/'+id+'/products/'+selectedId,eventProduct],['events/'+id+'/stall_config/catalog',{enabled:true}]);}
  await Promise.all(jobs.map(([path,value])=>setDoc(doc(db,path),value)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const pages=[];for(const path of ['/manage/events/g4-live-a/products','/manage/events/g4-live-b/products','/manage']){
  const ctx=await browser.newContext({viewport:{width:375,height:840},serviceWorkers:'block'});
  await ctx.route('**/*',r=>[new URL(base).host,host].includes(new URL(r.request().url()).host)?r.continue():r.abort());
  const p=await ctx.newPage();p.setDefaultTimeout(12000);await p.goto(base+'/app'+path);pages.push(p);
 }
 const [a,b,m]=pages;
 const row=p=>p.locator('.events-prodrow__name').getByText(master.name,{exact:true});
 await Promise.all([row(a).waitFor(),row(b).waitFor()]);
 await m.getByText('אירועים',{exact:true}).click();
 await m.getByRole('link',{name:/הדוכן של החווה/}).click();await m.getByText('משקאות בדיקת חווה',{exact:true}).click();await m.getByText(master.name,{exact:true}).click();
 await m.getByRole('dialog').getByRole('button',{name:'העברת המוצר לארכיון'}).click();await m.getByRole('dialog').getByRole('button',{name:'העברה לארכיון',exact:true}).click();
 await Promise.all([row(a).waitFor({state:'hidden'}),row(b).waitFor({state:'hidden'})]);
 await m.getByLabel('הצגת מוצרים בארכיון').check();await m.locator('.k-row__hit').filter({hasText:master.name}).click();await m.getByRole('dialog').getByRole('button',{name:'החזרה מהארכיון'}).click();
 for(const p of[a,b]){await p.getByText('משקאות בדיקת חווה',{exact:true}).click();const c=p.getByLabel('בחירת '+master.name+' לאירוע');await c.waitFor();assert.equal(await c.getAttribute('aria-checked'),'false');assert.equal(await row(p).count(),0);}
 await a.getByLabel('בחירת '+master.name+' לאירוע').click();await row(a).waitFor();
 await b.reload();await b.getByText('משקאות בדיקת חווה',{exact:true}).click();await b.getByLabel('בחירת '+master.name+' לאירוע').waitFor();assert.equal(await row(b).count(),0);
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();assert.deepEqual((await getDoc(doc(db,'tabs/g4-live-sale'))).data(),sale);
  const read=async eid=>(await getDoc(doc(db,'events/'+eid+'/products/'+selectedId))).data();assert.equal((await read('g4-live-a')).catalogProductGeneration,1);assert.equal((await read('g4-live-b')).catalogProductGeneration,undefined);});
 console.log('PASS live Firestore browser: three simultaneous manager sessions. Two open events stopped offering the product after one archive; restore left both off; explicit selection reactivated only event A; event B reload and previous sale kept their data.');
}finally{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));await env.cleanup();}
