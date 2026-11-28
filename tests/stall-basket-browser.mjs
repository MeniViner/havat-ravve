// Real cashier screen in the product's manual demo. All browser requests are fulfilled locally.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import {createRoot} from 'react-dom/client';
    import {V2Root} from './src/app/v2/App';
    import {demoDoc,demoItems,demoSet,demoUpdate,setDemo,setDemoAccess,setDemoStates,PERSONA_UID} from './src/app/demo/store';
    import {settings} from './src/app/demo/data';
    import './src/app/app.css';

    setDemoAccess('fixture-owner','owner');
    setDemo({on:true,persona:'staff',scenario:'eventDay'});
    const uid=PERSONA_UID.staff, profile=demoDoc('users/'+uid);
    const event='demo-stall-test', tab='demo-stall-buyer', catalog='demo-master', sku='demo-coffee';
    const catalogProducts='farm_catalogs/'+catalog+'/products', sales='events/'+event+'/products';
    const at='2026-11-28T12:00:00.000Z', by={uid,name:profile.displayName};
    if (!demoDoc('tabs/'+tab)) {
    demoSet('events',event,{title:'דוכן בדיקה',start:at,end:'2026-11-28T22:00:00.000Z',published:true,open:true,stall:true});
    demoSet('tabs',tab,{eventId:event,eventTitle:'דוכן בדיקה',guestUid:'',guestName:'קונה לדוגמה',guestPhone:'0500000012',
      ticketId:'',status:'open',items:[{productId:sku,name:'קפה משנה קודמת',price:3,qty:2,at,by}],total:6,createdBy:by,createdAt:at,updatedAt:at});
    demoSet('events/'+event+'/stall_config','catalog',{enabled:true});
    demoSet('farm_catalogs',catalog,{name:'הקטלוג שלי'});
    demoSet(catalogProducts,'beans',{name:'קפה מהקטלוג',price:8});
    demoSet(sales,sku,{name:'קפה מהקטלוג',price:8,active:true,sort:1,catalogId:catalog,catalogProductId:'beans'});
    demoSet(sales,'demo-simple',{name:'תה מקומי',price:4,sort:2});
    demoSet(sales,'demo-second-local',{name:'עוגה מקומית',price:5,sort:3,active:true});
    }
    window.posFixture={
      changeSource: (parent,archived,generation) => demoUpdate(parent?'farm_catalogs':catalogProducts,parent?catalog:'beans',{archived,generation}),
      choose: (catalogGeneration,catalogProductGeneration) => demoUpdate(sales,sku,{catalogGeneration,catalogProductGeneration}),
      offline: (offline) => setDemoStates({offline}),
      history: () => demoDoc('tabs/'+tab).items,
      accounts: (phone) => demoItems('tabs').filter(t=>t.eventId===event && t.guestPhone===phone),
    };
    createRoot(document.getElementById('root')).render(<V2Root user={{uid,email:profile.email,displayName:profile.displayName}} profile={profile} settings={settings}/>);
  ` },
  outfile:'fixture.js',bundle:true,write:false,format:'iife',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'},external:['/assets/*'],
  // Keep the actual demo transaction and receipt. This adapter interrupts the response at the delivery boundary.
  plugins:[{name:'checkout-response-fault',setup(build) {
    build.onResolve({filter:/\/stallCheckout$/},() => ({path:'delivery',namespace:'checkout-test'}));
    build.onLoad({filter:/.*/,namespace:'checkout-test'},() => ({resolveDir:process.cwd(),contents:`
      export * from './src/app/v2/data/stallCheckout.ts';
      import {submitStallCart as record} from './src/app/v2/data/stallCheckout.ts';
      export async function submitStallCart(actor,cart,options) {
        const mode=sessionStorage.getItem('test-checkout-mode'), key='farm-pos-sent/'+options.operationId;
        const calls=JSON.parse(sessionStorage.getItem('test-checkout-calls') || '[]');
        calls.push({operationId:options.operationId,cart});
        sessionStorage.setItem('test-checkout-calls',JSON.stringify(calls));
        if(mode==='unknown') {sessionStorage.setItem(key,'1');throw new Error('תוצאת הרישום אינה ידועה');}
        if(mode==='stale') window.posFixture.changeSource(true,true,3);
        const result=await record(actor,cart,options);
        if(mode==='lost') {
          sessionStorage.setItem(key,'1');
          await new Promise(resolve=>{window.interruptSale=resolve;});
          throw new Error('תשובת הרישום אבדה');
        }
        return result;
      }
    `}));
  }}],
});
const html = '<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const ctx = await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'});
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = 'http://localhost:43871';
  await ctx.route('**/*', route => {
    const {origin:requestOrigin,pathname} = new URL(route.request().url());
    if (requestOrigin !== origin) return route.abort();
    if (pathname.startsWith('/app/')) return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
    const asset = fixture.outputFiles.find(file => file.path.endsWith(pathname));
    return asset ? route.fulfill({contentType:(pathname.endsWith('.css')?'text/css':'text/javascript')+'; charset=utf-8',body:Buffer.from(asset.contents)})
      : route.fulfill({status:404});
  });
  await page.goto(origin+'/app/event/stall/demo-stall-buyer?e=demo-stall-test',{waitUntil:'domcontentloaded'});
  const button = name => page.getByRole('button',{name,exact:true});
  const coffee = button('הוספת קפה מהקטלוג'), tea = button('הוספת תה מקומי'), sale = button('רישום לחשבון');
  const remove = button('הסרת הפריטים האלה מהעגלה');
  const history = () => page.evaluate(() => window.posFixture.history());
  await tea.click();
  await button('הוספת עוגה מקומית').click();
  await page.evaluate(() => window.posFixture.offline(true));
  await page.getByText(/בסל יש כמה מוצרים חד־פעמיים/).waitFor();
  assert.ok(await sale.isDisabled());
  await button('פחות עוגה מקומית').click();
  assert.ok(await sale.isEnabled());
  await button('פחות תה מקומי').click();
  await page.evaluate(() => window.posFixture.offline(false));
  await coffee.click();
  await tea.click();
  assert.ok(await sale.isEnabled());
  const previous = await history();
  await page.evaluate(() => window.posFixture.changeSource(false,true,1));
  await page.getByRole('alert').filter({hasText:'קפה מהקטלוג'}).waitFor();
  assert.ok(await sale.isDisabled());
  assert.ok(await button('עוד תה מקומי').isVisible());
  await page.evaluate(() => window.posFixture.changeSource(false,false,1));
  assert.equal(await coffee.count(),0);
  await page.evaluate(() => window.posFixture.choose(0,1));
  await button('עוד קפה מהקטלוג').waitFor();
  assert.ok(await sale.isDisabled());
  await remove.click();
  await coffee.click();
  assert.ok(await sale.isEnabled());
  await page.evaluate(() => window.posFixture.changeSource(true,true,1));
  await remove.waitFor();
  assert.ok(await sale.isDisabled());
  await page.evaluate(() => { window.posFixture.changeSource(true,false,1); window.posFixture.choose(1,1); });
  await button('עוד קפה מהקטלוג').waitFor();
  assert.ok(await sale.isDisabled());
  await remove.click();
  await coffee.click();
  await page.evaluate(() => window.posFixture.offline(true));
  await page.getByText('ממתינים לאימות העגלה',{exact:true}).waitFor();
  assert.ok(await sale.isDisabled());
  await page.evaluate(() => window.posFixture.offline(false));
  await button('עוד קפה מהקטלוג').waitFor();
  assert.ok(await sale.isEnabled());
  assert.deepEqual(await history(),previous);
  await page.getByText(/כבר בחשבון:/).click();
  await button('נקה הכל').click();
  await button('ביטול').waitFor();
  await tea.click();
  await coffee.click();
  await page.evaluate(() => sessionStorage.setItem('test-checkout-mode','lost'));
  await sale.click();
  await page.waitForFunction(() => typeof window.interruptSale === 'function');
  // A still-visible undo from an earlier clear cannot replace the submitted basket.
  await button('ביטול').click();
  const saved = () => page.evaluate(() => {
    const key=Object.keys(sessionStorage).find(k=>k.startsWith('farm-pos-cart-v1/'));
    return key ? JSON.parse(sessionStorage.getItem(key)) : null;
  });
  const pending = await saved();
  assert.equal(pending.lines.length,2);
  assert.equal(pending.attempted,true);
  await page.evaluate(() => window.interruptSale());
  const retry = button('ניסיון חוזר עם אותה עגלה');
  await retry.waitFor();
  await page.setViewportSize({width:320,height:812});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.ok(await button('עוד תה מקומי').isDisabled());
  assert.ok(await button('פחות קפה מהקטלוג').isDisabled());
  await page.getByText(/כבר בחשבון:/).click();
  assert.ok(await button('נקה הכל').isDisabled());
  await page.getByRole('dialog').getByText('סגירה',{exact:true}).click();
  await page.evaluate(() => window.posFixture.changeSource(true,true,2));
  assert.ok(await remove.isDisabled());
  await page.reload({waitUntil:'domcontentloaded'});
  await retry.waitFor();
  assert.deepEqual(await saved(),pending);
  await page.evaluate(() => sessionStorage.setItem('test-checkout-mode','unknown'));
  await retry.click();
  await page.getByText('תוצאת הרישום אינה ידועה',{exact:true}).waitFor();
  assert.ok(await remove.isDisabled());
  await page.evaluate(() => window.posFixture.offline(true));
  assert.ok(await retry.isDisabled());
  await page.evaluate(() => { window.posFixture.offline(false); sessionStorage.removeItem('test-checkout-mode'); });
  await retry.click();
  await page.getByText(/נרשם .*לחשבון של/).waitFor();
  const calls=await page.evaluate(() => JSON.parse(sessionStorage.getItem('test-checkout-calls')));
  assert.equal(calls.length,3);
  assert.deepEqual(calls[0],calls[1]);
  assert.deepEqual(calls[0],calls[2]);
  assert.equal(await saved(),null);
  const final = await history();
  assert.deepEqual(final.slice(0,previous.length),previous);
  assert.deepEqual(final.slice(previous.length).map(row => [row.name,row.price,row.qty]).sort(),[['תה מקומי',4,1],['קפה מהקטלוג',8,1]].sort());
  await page.evaluate(() => { window.posFixture.changeSource(true,false,2); window.posFixture.choose(2,1); });
  await tea.click();
  await coffee.click();
  await page.evaluate(() => sessionStorage.setItem('test-checkout-mode','stale'));
  await sale.click();
  await page.getByText(/מוצר בסל הוסר מהמכירה/).waitFor();
  assert.ok(await remove.isEnabled());
  assert.deepEqual(await history(),final);
  await page.goto(origin+'/app/event/stall?e=demo-stall-test',{waitUntil:'domcontentloaded'});
  await button('לקוח בלי כרטיס').click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'שם',exact:true}).fill('קונה חדש לדוגמה');
  await dialog.getByRole('textbox',{name:'טלפון',exact:true}).fill('0500000144');
  await dialog.getByRole('button',{name:'המשך לדוכן'}).click();
  await tea.click();
  await page.evaluate(() => sessionStorage.setItem('test-checkout-mode','lost'));
  await sale.click();
  await page.waitForFunction(() => typeof window.interruptSale === 'function');
  await page.evaluate(() => window.interruptSale());
  await retry.waitFor();
  // Choosing the now-existing account must preserve the guest command and its receipt.
  await page.goto(origin+'/app/event/stall?e=demo-stall-test',{waitUntil:'domcontentloaded'});
  await page.getByText('לקוח בלי כרטיס: קונה חדש לדוגמה',{exact:true}).click();
  assert.ok(!new URL(page.url()).pathname.endsWith('/new'));
  await retry.waitFor();
  await page.reload({waitUntil:'domcontentloaded'});
  await retry.waitFor();
  assert.ok(await button('עוד תה מקומי').isDisabled());
  await page.evaluate(() => sessionStorage.removeItem('test-checkout-mode'));
  await retry.click();
  await page.getByText(/נרשם .*לחשבון של/).waitFor();
  const newCalls=await page.evaluate(() => JSON.parse(sessionStorage.getItem('test-checkout-calls')).slice(-2));
  assert.deepEqual(newCalls[0],newCalls[1]);
  assert.equal(newCalls[1].cart.guest.phone,'0500000144');
  const newTabs=await page.evaluate(() => window.posFixture.accounts('0500000144'));
  assert.equal(newTabs.length,1);
  assert.equal(newTabs[0].total,4);
  assert.equal(newTabs[0].items.length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS cashier basket: archive and explicit reselection, offline, preserved history, locked edit/remove/clear/undo across a lost response, uncertain replay and reload, single complete sale, editable after confirmed rejection.');
} finally {
  await browser.close();
}
