// Click-through of the broadcast area (B1-B4, C1) in demo mode: every control does what SCREENS.md says and writes
// persist after a reload. Demo only: nothing leaves the browser (no Firestore, no Worker, no push).
//
//   PORT=5209 node scripts/dev.mjs            (another terminal)
//   node tests/v2-broadcast.mjs [--base=http://localhost:5209]
//
// B4 needs a root that renders <BroadcastCard> (TasksRoot, VendorHome). While the tasks area is still a placeholder
// those checks are reported as skipped, not passed.
import { chromium } from 'playwright';

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || process.env.BASE || 'http://localhost:5209';
let passes = 0, failures = 0, skips = 0;
const check = (cond, label, extra) => { if (cond) { passes++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 300) : '')); } };
const skip = (label) => { skips++; console.log('  - skipped: ' + label); };
const section = (s) => console.log('\n' + s);

const browser = await chromium.launch();
/** A fresh browser profile in demo mode as `persona` (the demo store reads localStorage on load). */
async function fresh(persona) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  await ctx.addInitScript(([p]) => {
    if (sessionStorage.getItem('__t')) return;
    sessionStorage.setItem('__t', '1');
    if (!localStorage.getItem('farm-demo')) localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona: p, scenario: 'regular' }));
    localStorage.setItem('farm-install-dismissed', '1');
  }, [persona]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  return { ctx, page };
}
/** Same browser profile (demo data kept), another persona. */
async function become(page, persona) {
  await page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('farm-demo') || '{}'); localStorage.setItem('farm-demo', JSON.stringify({ ...s, on: true, persona: p })); }, persona);
}
const go = async (page, path) => { await page.goto(BASE + '/app' + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(250); };
const text = (page) => page.locator('main').innerText();
const toast = async (page) => (await page.locator('.k-toast').allInnerTexts()).join(' | ');
const card = (page) => page.locator('section.broadcast-card');

const MSG = 'בדיקה: מחר בבוקר מתחילים ב־7:00';
try {
  // ---------- B1 -> B2 -> B3 as the owner ----------
  section('B1-Compose, B2-Sent, B3-Read (owner)');
  const { ctx, page } = await fresh('owner');
  await go(page, '/manage/broadcasts');
  check((await text(page)).includes('הודעות לצוות') && (await page.locator('a.broadcast-sent').count()) >= 3, 'B2 lists the sent broadcasts');
  check((await text(page)).includes('קראו 8 מתוך 12'), 'B2 read bar of demo-b-1 (8 of 12 until Yoav reads it)');
  await page.getByRole('button', { name: 'הודעה חדשה' }).click();
  await page.waitForTimeout(200);
  check(page.url().endsWith('/app/manage/broadcasts/new'), '"הודעה חדשה" opens B1');
  const chips = await page.locator('.k-choice').allInnerTexts();
  check(chips.includes('כל הצוות · 12') && chips.includes('בחווה היום · 4') && chips.includes('מנהלים · 5'), 'B1 audience counts (12 / 4 / 5)', chips);
  const send = page.locator('.k-bottombar button');
  check(await send.isDisabled(), 'send is disabled while the text is empty');
  await page.getByLabel('תוכן ההודעה').fill(MSG);
  check((await page.locator('.broadcast-count').innerText()) === `${MSG.length} מתוך 200`, 'counter "N מתוך 200"');
  await page.getByLabel('תוכן ההודעה').fill('א'.repeat(250));
  check((await page.getByLabel('תוכן ההודעה').inputValue()).length === 200, 'text stops at 200');
  await page.getByLabel('תוכן ההודעה').fill(MSG);
  await page.getByRole('button', { name: 'מנהלים · 5' }).click();
  await page.getByRole('button', { name: 'דחופה, נשארת בראש עד שקוראים' }).click();
  check((await page.locator('.broadcast-phone').innerText()).includes('הודעה מבני') && (await page.locator('.broadcast-phone').innerText()).includes(MSG), 'preview: "הודעה מבני" and the text');
  check((await send.innerText()).includes('שליחה ל־5 אנשים'), 'send button names the count', await send.innerText());
  await send.click();
  await page.waitForTimeout(400);
  check(page.url().endsWith('/app/manage/broadcasts') && (await toast(page)).includes('נשלח ל־5 אנשים'), 'send -> B2 with a toast', { url: page.url(), toast: await toast(page) });
  // (the demo clock stands at 10:30 while demo-b-1 is stamped 14:10, so the new one is listed second in demo)
  const mine = () => page.locator('a.broadcast-sent', { hasText: MSG });
  check((await mine().count()) === 1 && (await mine().innerText()).includes('דחוף') && (await mine().innerText()).includes('קראו 1 מתוך 5'), 'new broadcast listed: urgent, read 1 of 5 (the sender)', await page.locator('main').innerText());
  await page.reload({ waitUntil: 'networkidle' });
  check((await mine().count()) === 1, 'persists after reload');
  await mine().click();
  await page.waitForTimeout(250);
  check(/\/manage\/broadcasts\/demo-/.test(page.url()) && (await text(page)).includes('עוד לא קראו · 4') && (await text(page)).includes('קראו · 1'), 'row -> B3: 4 not yet, 1 read', await text(page));
  await page.getByText('לשלוח שוב').click();
  await page.waitForTimeout(250);
  check((await toast(page)).includes('נשלח שוב ל־4 אנשים'), '"לשלוח שוב" re-notifies only the 4 without a receipt', await toast(page));
  await page.getByRole('button', { name: /^וואטסאפ ל/ }).first().click();
  await page.waitForTimeout(200);
  check((await toast(page)).includes('בהדגמה לא נשלח'), 'WhatsApp per person (demo: nothing leaves)');
  await go(page, '/manage/broadcasts/demo-b-1');
  const b3 = await text(page);
  check(b3.includes('עוד לא קראו · 4') && b3.includes('עוד לא נכנס לאפליקציה') && b3.includes('קראו · 8') && b3.includes('עוד 5'), 'B3 demo-b-1: not yet 4, read 8, "עוד 5"', b3);
  await page.getByText('עוד 5').click();
  check((await page.locator('section.k-card--list').nth(1).locator('li').count()) === 8, '"עוד 5" shows every reader');
  await page.getByText('הודעות', { exact: true }).click();
  await page.waitForTimeout(200);
  check(page.url().endsWith('/app/manage/broadcasts'), 'B3 back -> B2');

  // ---------- B4 as the manager who got the urgent broadcast ----------
  section('B4-Receive (manager, same browser)');
  await become(page, 'manager');
  await go(page, '/tasks');
  if ((await text(page)).includes('TasksRoot')) skip('B4 on /tasks: TasksRoot is still a placeholder');
  else {
    check((await card(page).count()) === 1 && (await card(page).innerText()).includes(MSG) && (await card(page).innerText()).includes('הודעה מבני'), 'B4: the urgent broadcast is a card at the top');
    await card(page).getByRole('button', { name: 'קראתי' }).click();
    await page.waitForTimeout(400);
    check((await card(page).count()) === 0, '"קראתי" removes the card');
    await page.reload({ waitUntil: 'networkidle' });
    check((await card(page).count()) === 0, 'still gone after reload');
    await become(page, 'owner');
    await go(page, '/manage/broadcasts');
    check((await page.locator('a.broadcast-sent', { hasText: MSG }).innerText()).includes('קראו 2 מתוך 5'), 'the receipt reaches B2 (2 of 5)');
  }
  await ctx.close();

  // ---------- B4 + C1 as the volunteer ----------
  section('B4-Receive and C1-Notifs (staff)');
  const s = await fresh('staff');
  await go(s.page, '/tasks');
  if ((await text(s.page)).includes('TasksRoot')) skip('B4 on /tasks: TasksRoot is still a placeholder');
  else {
    check((await card(s.page).innerText()).includes('הודעה מבני · 14:10') && (await card(s.page).innerText()).includes('מחר מתחילים ב־15:30'), 'B4 shows demo-b-1 with sender and time');
    await card(s.page).getByRole('button', { name: 'קראתי' }).click();
    await s.page.waitForTimeout(400);
    await s.page.reload({ waitUntil: 'networkidle' });
    check((await card(s.page).count()) === 0, '"קראתי" persists');
  }
  await go(s.page, '/notifications');
  let c1 = await text(s.page);
  check(c1.includes('חדש · 3') && c1.includes('קודם') && c1.includes('משימה חדשה עליך'), 'C1: 3 new, earlier list', c1);
  check(c1.includes('לתקן את הברז ליד החממה · בני, לפני 20 דק׳'), 'task row says who and when');
  await s.page.reload({ waitUntil: 'networkidle' });
  c1 = await text(s.page);
  check(!c1.includes('חדש ·') && c1.includes('קודם'), 'opening C1 marked them read (after reload all are earlier)', c1);
  await s.page.getByText('משימה חדשה עליך').click();
  await s.page.waitForTimeout(200);
  check(s.page.url().endsWith('/app/tasks/demo-t-tap'), 'a row opens its subject');
  await s.page.goBack(); await s.page.waitForTimeout(200);
  // a fresh profile again for the inline action (it shows on new rows)
  const s2 = await fresh('staff');
  await go(s2.page, '/notifications');
  await s2.page.getByRole('button', { name: 'הוספה' }).click();
  await s2.page.waitForTimeout(200);
  check(s2.page.url().endsWith('/app/new?kind=shopping'), '"הוספה" opens the shopping add sheet');
  await go(s2.page, '/notifications');
  await s2.page.getByText('מה לקבל').click();
  await s2.page.waitForTimeout(200);
  const sheet = s2.page.getByRole('dialog');
  check((await sheet.innerText()).includes('התראות לטלפון') && (await sheet.innerText()).includes('כבוי בטלפון הזה'), '"מה לקבל" opens the push sheet');
  await sheet.getByRole('button', { name: 'להפעיל' }).click();
  await s2.page.waitForTimeout(300);
  check((await sheet.innerText()).includes('פעיל בטלפון הזה'), '"להפעיל" turns push on (demo: no real prompt)');
  await sheet.getByRole('switch', { name: 'יציאה לקניות' }).click();
  await s2.page.waitForTimeout(200);
  await s2.page.reload({ waitUntil: 'networkidle' });
  await s2.page.getByText('מה לקבל').click();
  await s2.page.waitForTimeout(200);
  const sheet2 = s2.page.getByRole('dialog');
  check((await sheet2.getByRole('switch', { name: 'יציאה לקניות' }).getAttribute('aria-checked')) === 'false' && (await sheet2.getByRole('switch', { name: 'הודעות לצוות' }).getAttribute('aria-checked')) === 'true', 'kind choices persist after reload');
  check((await sheet2.innerText()).includes('פעיל בטלפון הזה'), 'push stays on after reload');
  for (const p of [page, s.page, s2.page]) check(!p.errors.length, 'no page errors', p.errors);
  await s.ctx.close(); await s2.ctx.close();

  // ---------- managers only ----------
  section('access');
  const v = await fresh('staff');
  await go(v.page, '/manage/broadcasts/new');
  check(v.page.url().endsWith('/app/tasks'), 'a volunteer cannot open B1 (sent back to /tasks)');
  await v.ctx.close();
} catch (e) { failures++; console.error(e); } finally { await browser.close(); }

console.log(`\n${passes} passed, ${failures} failed${skips ? `, ${skips} skipped` : ''}`);
process.exit(failures ? 1 : 0);
