// Local-only browser regression for the normal manager and volunteer screens. No real sign-in or service delivery.
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture=await build({
  stdin:{ resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {V2Root} from './src/app/v2/App'; import {navigate} from './src/app/router';
    import {demoDoc,demoItems,setDemo,setDemoAccess,PERSONA_UID} from './src/app/demo/store';
    import {settings} from './src/app/demo/data'; import './src/app/app.css';
    setDemoAccess('fixture-owner','owner');const persona=localStorage.getItem('catalog-test-persona') || 'manager';setDemo({on:true,persona,scenario:'regular'});
    const uid=PERSONA_UID[persona],profile=demoDoc('users/'+uid);
    Object.assign(window,{catalogQA:{items:demoItems,doc:demoDoc,go:navigate}});
    createRoot(document.getElementById('root')).render(<V2Root settings={settings} profile={profile} user={{uid,displayName:profile.displayName,email:profile.email}}/>);
  `},outfile:'fixture.js',format:'iife',jsx:'automatic',bundle:true,write:false,
  define:{'process.env.NODE_ENV':'"production"'},external:['/assets/*'],logLevel:'silent'
});
const html='<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname.startsWith('/app')) {res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  const part=fixture.outputFiles.find(f=>f.path.endsWith(pathname));
  if(part){res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':'text/css');res.end(part.contents);return;}
  res.statusCode=404;res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for (const width of [320,375,1440]) {
  const ctx=await browser.newContext({viewport:{width,height:840},serviceWorkers:'block'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const p=await ctx.newPage(),errors=[];
  p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));
  const heading=name=>p.getByRole('heading',{name,exact:true}),button=(name,scope=p)=>scope.getByRole('button',{name,exact:true});
  const dialog=()=>p.getByRole('dialog').last();
  async function create(catalog,product,price){
   await button('הוספת קטלוג').click();await dialog().getByLabel('שם הקטלוג').fill(catalog);await button('שמירה',dialog()).click();
   await heading(catalog).waitFor();await button('הוספת מוצר לקטלוג').click();await dialog().getByLabel('שם המוצר').fill(product);
   await dialog().getByLabel('מחיר בשקלים').fill(String(price));await button('שמירה',dialog()).click();await p.getByText(product,{exact:true}).waitFor();
  }
  const eventPath='/app/manage/events/demo-e-festival/products',globalTitle='ניהול הקטלוגים והמוצרים';
  await p.goto(base+'/app/manage/events');await p.getByText('קטלוגים ומוצרים',{exact:true}).click();await heading(globalTitle).waitFor();
  assert.equal(new URL(p.url()).search,'');
  await create('משקאות בדיקה','תה בדיקה',6);
  await button('עריכת שם הקטלוג').click();await dialog().getByLabel('שם הקטלוג').fill('חליטות בדיקה');await button('שמירה',dialog()).click();
  await heading('חליטות בדיקה').waitFor();await p.getByText('כל הקטלוגים',{exact:true}).click();await create('מאפים בדיקה','לחם בדיקה',17.5);
  await p.goto(base+eventPath);await heading('מוצרי דוכן החווה').waitFor();
  async function pick(group,product){
   await p.getByText(group,{exact:true}).click();const ck=p.getByLabel('בחירת '+product+' לאירוע');await ck.click();
   await p.locator('.events-prodrow__name').getByText(product,{exact:true}).waitFor();
  }
  await pick('חליטות בדיקה','תה בדיקה');await pick('מאפים בדיקה','לחם בדיקה');
  await button('ניהול כל הקטלוגים והמוצרים').click();await p.getByText('חליטות בדיקה',{exact:true}).click();await p.reload();await heading('חליטות בדיקה').waitFor();
  const uri=new URL(p.url());assert.equal(uri.searchParams.get('event'),'demo-e-festival');assert(uri.searchParams.get('catalog'));
  await p.getByText('תה בדיקה',{exact:true}).click();await dialog().getByLabel('מחיר בשקלים').fill('9');
  await button('שמירה',dialog()).click();await button('חזרה לבחירת המוצרים באירוע').click();await heading('מוצרי דוכן החווה').waitFor();
  assert.equal(new URL(p.url()).pathname,eventPath);
  assert.match(await p.locator('.events-prodrow').filter({hasText:'תה בדיקה'}).innerText(),/6/);
  await p.getByText('חליטות בדיקה',{exact:true}).click();await p.getByText(/המחיר שנבחר לאירוע הוא/).waitFor();
  await button('ניהול כל הקטלוגים והמוצרים').click();await p.getByText('מאפים בדיקה',{exact:true}).click();await button('העברת הקטלוג לארכיון').click();
  await button('ביטול',dialog()).click();await heading('מאפים בדיקה').waitFor();await button('העברת הקטלוג לארכיון').click();await button('העברה לארכיון',dialog()).click();
  await p.getByText('קטלוג בארכיון',{exact:true}).waitFor();await button('חזרה לבחירת המוצרים באירוע').click();await heading('מוצרי דוכן החווה').waitFor();
  assert.equal(await p.getByText('מאפים בדיקה',{exact:true}).count(),0);await p.locator('.events-prodrow__name').getByText('לחם בדיקה',{exact:true}).waitFor({state:'hidden'});
  await button('ניהול כל הקטלוגים והמוצרים').click();await p.getByLabel('הצגת קטלוגים בארכיון').check();
  await p.locator('.k-row__hit').filter({hasText:'מאפים בדיקה'}).click();await button('החזרת הקטלוג מהארכיון').click();await button('החזרה מהארכיון',dialog()).click();
  await p.getByText('לחם בדיקה',{exact:true}).click();await button('העברת המוצר לארכיון',dialog()).click();await button('העברה לארכיון',dialog()).click();
  await p.getByLabel('הצגת מוצרים בארכיון').check();await p.locator('.k-row__hit').filter({hasText:'לחם בדיקה'}).click();await button('החזרה מהארכיון',dialog()).click();
  await p.reload();await heading('מאפים בדיקה').waitFor();await p.getByText('לחם בדיקה',{exact:true}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await button('חזרה לבחירת המוצרים באירוע').click();await heading('מוצרי דוכן החווה').waitFor();
  assert.equal(await p.locator('.events-prodrow__name').getByText('לחם בדיקה',{exact:true}).count(),0);await pick('מאפים בדיקה','לחם בדיקה');
  await p.evaluate(()=>localStorage.setItem('catalog-test-persona','staff'));await p.goto(base+'/app/manage/farm-catalogs');
  await p.waitForFunction(()=>document.querySelector('main h1, main h2, .k-page-title, .k-pagetitle'));
  assert.equal(await button('הוספת קטלוג').count(),0);assert.equal(await heading(globalTitle).count(),0);
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS farm menu, global product CRUD and archive, multi-catalog event selection, price snapshots, return/deep reload, staff denial at '+width+'px.');
 }
} finally {await browser.close();await new Promise(r=>server.close(r));}
