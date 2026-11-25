// The new console page against today's Worker (origin/main's api/): it goes out before the Worker does, so every screen
// must load and what the old Worker cannot do must not be offered.
import { clickAll } from './console-click.mjs';
export async function todayWalk(x) {
  const { E, check, step, sleep, session, openAll, trouble, SCREENS, w, site, setPart, uids } = x;
  setPart('today');
  await E.cronAll(w); await E.cronAll(w);
  const s = await session({ site: site.base, api: w.base, who: 'owner' });
  await step('sign in', async () => { await s.idle(); check(await s.page.locator('.d-head__title', { hasText: 'מצב כללי' }).count(), 'an owner reaches the console', (await s.text()).slice(0, 200)); }, s);
  await s.call('POST', '/keys', { label: 'מפתח היום', actor: 'user:' + uids.dana, expiresAt: null, scopes: null });
  s.allowed.push(/404|Failed to load resource.*404/);
  await openAll(s, 'today', { shots: false });
  const miss = {}; s.page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(w.base)) { const k = `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname.replace(/[^/]{16,}/g, ':id')}`; miss[k] = (miss[k] || 0) + 1; } });
  for (const [tab] of SCREENS) await step(`today ${tab}: every control`, async () => {
    await s.go(tab); await s.idle();
    const r = await clickAll(s, { tab, sleep, trouble });
    check(!r.dead.length, `${tab}: no dead controls (${r.clicked} clicked)`, r.dead);
    check(!r.bad.length, `${tab}: no error text after clicking`, r.bad);
  }, s);
  console.log('today: refused by the old Worker', JSON.stringify(miss));
  x.requests.todayRefused = { all: { worker: Object.entries(miss).map(([k, n]) => `${k} x${n}`), firestore: 0 } };
  // what the old Worker does not have must not be offered as if it did
  await step('actions still work', async () => {
    await s.go('people/' + uids.yoav); await s.idle(); const p = s.page.locator('aside.d-panel').last();
    check(!/undefined|NaN/.test(await p.innerText()), 'a person opens');
    await p.getByRole('radio', { name: /^מנהל/ }).click(); await s.page.locator('.k-sheet').last().getByRole('button', { name: 'כן, לשנות', exact: true }).click(); await s.toast('התפקיד עודכן'); check((await E.get('users/' + uids.yoav)).role === 'manager', 'role change');
    await s.go('switches'); await s.idle(); check(await s.page.getByRole('switch', { name: 'קריאה בלבד', exact: true }).count() === 1, 'switches open');
    await s.page.getByRole('switch', { name: 'קריאה בלבד', exact: true }).click(); const sh = s.page.locator('.k-sheet').last(); check(!(await sh.getByLabel('למה (לא חובה)').count()), 'no reason field when the server keeps none'); await sh.getByRole('button', { name: 'כן, קריאה בלבד', exact: true }).click(); await sleep(900);
    check((await E.get('settings/switches'))?.readOnly === true, 'switch on', await E.get('settings/switches'));
    await s.page.getByRole('switch', { name: 'קריאה בלבד', exact: true }).click(); await s.page.locator('.k-sheet').last().getByRole('button', { name: 'כן, לצאת', exact: true }).click(); await sleep(900); check((await E.get('settings/switches'))?.readOnly === false, 'switch off');
    await s.go('run/tasks.create'); await s.page.getByLabel(/^מה צריך לעשות/).first().fill('משימה בשרת של היום'); await s.btn('הרצה').click(); await s.page.locator('.k-sheet').last().getByRole('button', { name: 'כן, להריץ', exact: true }).click(); await sleep(1500); check((await E.list('tasks')).some((t) => t.title === 'משימה בשרת של היום'), 'run a write');
    await s.go('import'); await s.page.getByLabel('השורות מאקסל').fill('משימה\nייבוא בשרת של היום'); await s.btn('המשך').click(); await s.idle(); if (await s.btn('לבדיקה').count()) await s.btn('לבדיקה').click(); await s.page.locator('aside.d-panel').last().getByRole('button', { name: /^ייבוא / }).click(); await s.page.locator('.k-sheet').last().getByRole('button', { name: 'כן, להוסיף', exact: true }).click(); await sleep(2500);
    check((await s.page.locator('aside.d-panel').last().innerText()).includes('הייבוא נגמר'), 'import ends'); check((await E.list('tasks')).some((t) => t.title === 'ייבוא בשרת של היום'), 'import wrote'); check(!(await s.btn('לבטל את הייבוא').count()), 'no undo offered (the server has none)');
    await s.go('data/tasks/t-tap'); await s.idle(); check((await s.page.locator('aside.d-panel').last().innerText()).includes('לתקן את הברז'), 'a record opens');
    await s.page.locator('aside.d-panel').last().getByRole('button', { name: 'מחיקה', exact: true }).click(); await s.page.locator('.k-sheet').last().getByRole('button', { name: 'מחיקה', exact: true }).click(); await sleep(1200); check(!(await E.get('tasks/t-tap')), 'delete works');
  }, s);
  await step('the old server\'s limits read as such', async () => {
    for (const tab of ['queue', 'jobs', 'people', 'keys', 'import']) { await s.go(tab); await s.idle(); await s.shot('today-' + tab); }
    await s.go('traffic'); const year = s.page.locator('.d-main .d-chip', { hasText: 'שנה' }).first(); if (await year.count()) await year.click(); await s.idle(); await sleep(400); await s.shot('today-traffic-year');
    const t = await trouble(s); check(!t.m && !t.alerts.length, 'traffic year on the old server', t);
    console.log('today traffic text', (await s.page.locator('.d-main').innerText()).replace(/\n+/g, ' · ').slice(0, 900));
  }, s);
  await step('control: the detectors see a fault', async () => {
    await s.page.route('**/v1/console/queue', (r) => r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false,"error":{"code":"INTERNAL","he":"תקלה"}}' }));
    await s.go('overview'); await s.go('queue'); await s.idle(); const t = await trouble(s); check(!!t.m || t.alerts.length > 0, 'a broken answer is noticed on the screen', t);
    await s.page.unroute('**/v1/console/queue');
    await s.page.evaluate(() => { const b = document.createElement('button'); b.textContent = 'מת'; document.querySelector('.d-main').append(b); });
    const r = await clickAll(s, { tab: 'queue', sleep, trouble, max: 60 }); check(r.dead.includes('מת'), 'a dead button is noticed', r.dead);
    s.take();
  });
  await s.ctx.close();
}
