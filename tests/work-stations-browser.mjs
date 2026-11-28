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
    setDemoAccess('fixture-owner','owner');const persona=localStorage.getItem('station-test-persona') || 'manager';setDemo({on:true,persona,scenario:'regular'});
    const uid=PERSONA_UID[persona],profile=demoDoc('users/'+uid);
    Object.assign(window,{stationQA:{items:demoItems,doc:demoDoc,go:navigate}});
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
 for(const width of [320,375,1440]){
  const ctx=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  p.setDefaultTimeout(5500);p.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const button=(name,scope=p)=>scope.getByRole('button',{name,exact:true});
  const dialog=()=>p.getByRole('dialog').last();
  const close=async()=>{await p.keyboard.press('Escape');};
  await p.goto(base+'/app/manage/events');await p.getByText('תחנות עבודה',{exact:true}).click();
  await p.getByRole('heading',{name:'תחנות עבודה',exact:true}).waitFor();
  await button('הוספת תחנה').click();await dialog().getByLabel('שם התחנה').fill('הרשמה');await button('הוספת התחנה',dialog()).click();
  await button('עריכת הרשמה').click();await dialog().getByLabel('שם התחנה').fill('רישום');await button('שמירת השם',dialog()).click();
  await p.goto(base+'/app/manage/events/demo-e-festival/staffing');await button('הוסף משובץ').click();
  const form=dialog();await form.getByLabel('תפקיד בתחנה').fill('סידור קהל');await form.getByRole('combobox').nth(1).selectOption({index:1});
  await form.getByLabel('הגעה').fill('2026-11-28T16:00');await form.getByLabel('עד',{exact:true}).fill('2026-11-28T19:00');
  const station = form.getByLabel('תחנה',{exact:true});
  await station.click();
  const picker = p.locator('dialog.farm-choice-menu');
  await picker.getByRole('listbox',{name:'תחנה'}).waitFor();
  await p.keyboard.press('End'); await p.keyboard.press('Escape');
  assert.equal(await form.getByLabel('תפקיד בתחנה').inputValue(),'סידור קהל');
  assert.equal(await p.getByRole('dialog').count(),1);
  await station.focus(); await p.keyboard.press('Enter');
  await picker.getByRole('option',{name:'＋ הוספת תחנת עבודה'}).click();await dialog().getByLabel('שם התחנה').fill('רחבה');await button('הוספת התחנה',dialog()).click();
  await p.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===1);
  assert.equal(await dialog().getByLabel('תפקיד בתחנה').inputValue(),'סידור קהל');
  assert.equal(await dialog().getByLabel('תחנה',{exact:true}).locator('option:checked').innerText(),'רחבה');
  await button('שמירת השיבוץ',dialog()).click();await p.getByText(/סידור קהל/).first().waitFor();
  await button('ניהול תחנות עבודה').click();await button('הסרת רחבה').click();
  const retire=dialog(),confirm=button('העברת השיבוצים והסרת התחנה',retire);
  assert(await confirm.isDisabled());assert(await retire.getByRole('option',{name:'＋ הוספת תחנת עבודה'}).count());await retire.getByLabel('תחנה חלופית',{exact:true}).selectOption({label:'רישום'});await confirm.click();
  await p.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
  const transferred=await p.evaluate(()=>{const all=window.stationQA.items('events/demo-e-festival/staffing');return all.find(s=>s.station==='רישום')?.people.find(p=>p.role==='סידור קהל')});
  assert(transferred?.startsAt && transferred?.endsAt);assert.equal(await button('עריכת רחבה').count(),0);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.evaluate(()=>localStorage.setItem('station-test-persona','staff'));await p.goto(base+'/app/farm/events/demo-e-festival?section=staffing');
  await p.getByText(/סידור קהל/).first().waitFor();
  assert.equal(await button('ניהול תחנות עבודה').count(),0);assert.equal(await button('הוסף משובץ').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS farm station screens at '+width+'px');
 }
} finally {await browser.close();await new Promise(r=>server.close(r));}
