// Click-through of the event-day area (E1-E9, Y1-Y5) in demo mode, as the gate volunteer and as a manager.
// Every write must still be there after a reload (the demo store keeps it in localStorage).
// Run against a dev server: PORT=5205 node scripts/dev.mjs, then node tests/v2-eventday.mjs [--base=http://localhost:5205]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=http://localhost:5205').slice(7);
const FEST = 'demo-e-festival';
const browser = await chromium.launch();
let failures = 0, passed = 0, current = null;

async function session(persona, scenario) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  await ctx.addInitScript(([p, s]) => {
    if (sessionStorage.getItem('__t')) return;
    sessionStorage.setItem('__t', '1');
    localStorage.clear();
    localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona: p, scenario: s }));
    localStorage.setItem('farm-install-dismissed', '1');
  }, [persona, scenario]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const go = async (path) => { await page.goto(`${BASE}/app${path}`, { waitUntil: 'networkidle' }); };
  const see = async (text, timeout = 5000) => { await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout }); };
  const gone = async (text) => { await page.getByText(text, { exact: false }).first().waitFor({ state: 'hidden', timeout: 5000 }); };
  const tap = async (name) => {
    const byRole = page.getByRole('button', { name, exact: false }).or(page.getByRole('link', { name, exact: false }));
    if (await byRole.count()) await byRole.first().click(); else await page.getByText(name, { exact: false }).first().click();
  };
  const fill = async (label, text) => { await page.getByLabel(label, { exact: true }).or(page.getByPlaceholder(label, { exact: true })).first().fill(text); };
  const reload = async () => { await page.reload({ waitUntil: 'networkidle' }); };
  current = page;
  return { ctx, page, errors, go, see, gone, tap, fill, reload };
}
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) {
    failures++; console.log('  FAIL', name, '\n       ', String(e.message || e).split('\n').slice(0, 3).join(' | '));
    if (process.env.SHOTS && current) await current.screenshot({ path: `.build/t-fail-${failures}.png` }).catch(() => {});
  }
}

// ───────── staff (Yoav, the gate volunteer) on event day ─────────
console.log('staff · eventDay');
{
  const s = await session('staff', 'eventDay');
  await step('E1 home: gate, stall, my counts', async () => {
    await s.go('/event');
    await s.see('פסטיבל הסתיו'); await s.see('הרשימות במכשיר'); await s.see('42'); await s.see('מכירות שלך היום');
  });
  await step('E2 -> E3: a paid ticket is let in, and the last-scan line follows', async () => {
    await s.tap('שער');
    await s.see('יציאה מהשער'); await s.see('הקודם: דוד כהן · מאושר');
    await s.tap('QR תקין');
    await s.see('מאושר'); await s.see('מיכל ברק'); await s.see('כרטיס 2 מתוך 3 · כניסה ראשונה'); await s.see('חוזר לסריקה בעוד');
    await s.tap('הבא');
    await s.see('הקודם: מיכל ברק · מאושר');
  });
  await step('E3 again: the same ticket is a re-entry', async () => {
    await s.tap('QR תקין');
    await s.see('כניסה 2, יצא וחזר');
    await s.page.waitForTimeout(3300); // auto-return after 3 seconds
    await s.see('יציאה מהשער');
  });
  await step('E4: unpaid ticket, let in to pay later', async () => {
    await s.tap('QR לא שולם');
    await s.see('נשאר לשלם'); await s.see('50 ₪'); await s.see('PayBox');
    await s.tap('להכניס, ישלמו אחר כך');
    await s.see('מאושר');
    await s.tap('הבא');
    await s.see('ישלמו אחר כך');
  });
  await step('E5: cancelled ticket is rejected and logged', async () => {
    await s.tap('QR מבוטל');
    await s.see('כרטיס בוטל'); await s.see('יוסי מזרחי'); await s.see('ההזמנה בוטלה ב־17.11');
    await s.tap('לסרוק שוב');
    await s.see('הקודם: יוסי מזרחי · נדחה');
  });
  await step('E5 -> E6: search by name and let a paid guest in', async () => {
    await s.tap('חיפוש בשם או טלפון');
    await s.see('מי בכניסה?');
    await s.fill('שם או טלפון', 'נעמה');
    await s.see('התאמה אחת');
    await s.tap('להכניס');
    await s.see('מאושר');
    await s.tap('הבא');
    await s.see('מי בכניסה?');
  });
  await step('E6 search by phone shows both of Michal\'s orders', async () => {
    await s.fill('שם או טלפון', '0155');
    await s.see('2 התאמות'); await s.see('נכנסו 1 מתוך 3');
  });
  await step('E6 walk-in at the gate (added state)', async () => {
    await s.fill('שם או טלפון', '');
    await s.tap('אורח בלי כרטיס');
    await s.fill('שם', 'אורח בדיקה');
    await s.fill('טלפון', '050-111-2222');
    await s.tap('שולם, להכניס');
    await s.see('אורח בדיקה'); await s.see('כניסה ראשונה');
  });
  await step('writes persist: my scans 46 after reload, Michal inside', async () => {
    await s.go('/event'); await s.reload();
    await s.see('46');
    await s.see('סריקות אחרונות'); await s.see('אורח בדיקה · כרטיס 1/1'); // the old hub's last scans, for every staff member
    await s.go('/event/gate/search');
    await s.fill('שם או טלפון', 'נעמה');
    await s.see('כולם נכנסו').catch(async () => s.see('נכנס'));
  });
  await step('E7 -> E8: sell two lemonades to Roni', async () => {
    await s.go('/event/stall');
    await s.see('מי קונה?'); await s.see('4 חשבונות פתוחים'); await s.see('קנו לאחרונה');
    await s.tap('רוני לוי');
    await s.see('כבר בחשבון: 2 פריטים · 22 ₪');
    await s.tap('הוספת לימונדה');
    await s.tap('עוד לימונדה');
    await s.see('24 ₪');
    await s.tap('פחות לימונדה'); await s.tap('עוד לימונדה');
    await s.tap('רישום לחשבון');
    await s.see('נרשם 24 ₪ לחשבון של רוני');
    await s.reload();
    await s.see('כבר בחשבון: 4 פריטים · 46 ₪');
  });
  await step('E7 walk-in customer gets an account and a sale', async () => {
    await s.tap('החלפת קונה');
    await s.tap('לקוח בלי כרטיס');
    await s.fill('שם', 'טל');
    await s.fill('טלפון', '052-333-4444');
    await s.tap('המשך לדוכן');
    await s.see('לקוח בלי כרטיס: טל');
    await s.tap('הוספת זיתים');
    await s.tap('רישום לחשבון');
    await s.see('נרשם 20 ₪');
  });
  await step('E7 search finds a ticket holder and opens their account', async () => {
    await s.go('/event/stall');
    await s.fill('חיפוש בשם או טלפון', 'אסתר');
    await s.tap('אסתר כהן');
    await s.see('חשבון חדש');
    assert.match(s.page.url(), /\/event\/stall\/new/, 'picking a buyer opens no account; the first sale does');
  });
  await step('E9 tabs: chips and persisted walk-in account', async () => {
    await s.go('/event/stall/tabs'); await s.reload();
    await s.see('חשבונות הדוכן'); await s.see('לקוח בלי כרטיס: טל'); await s.see('46 ₪');
    await s.tap('סימנו ששילמו');
    await s.see('46 ₪');
    await s.tap('נסגרו');
    await s.see('פתוחים · 5');
  });
  await step('E8 lines already on the account, with time and who; a line can be removed', async () => {
    await s.go('/event/stall');
    await s.fill('חיפוש בשם או טלפון', 'רוני');
    await s.tap('רוני לוי');
    await s.see('כבר בחשבון: 4 פריטים · 46 ₪'); await s.see('בחשבון'); await s.see('לימונדה ×2');
    await s.page.getByRole('button', { name: 'הסרה' }).first().click();
    await s.see('כבר בחשבון: 2 פריטים · 22 ₪');
    await s.reload();
    await s.see('כבר בחשבון: 2 פריטים · 22 ₪');
  });
  await step('E8 clear the cart, undo brings it back', async () => {
    await s.tap('הוספת זיתים');
    await s.tap('נקה הכל');
    await s.see('העגלה נוקתה');
    await s.page.getByRole('button', { name: 'ביטול' }).first().click();
    await s.see('פריט אחד');
  });
  await step('E9 the crew marks an account paid on the spot', async () => {
    await s.go('/event/stall/tabs');
    await s.see('פתוחים · 5');
    await s.page.getByRole('button', { name: 'שילם/ה במקום' }).first().click();
    await s.see('שולם במקום'); await s.see('פתוחים · 4');
    assert.equal(await s.page.getByText('נמכרו היום').count(), 0, 'the totals are for managers');
  });
  await step('module off: the old messages, not "no event today"', async () => {
    await s.go('/event/gate?e=demo-e-tour');
    await s.see('סריקת כניסה כבויה באירוע הזה');
    await s.go('/event/stall?e=demo-e-tour');
    await s.see('דוכן המכירות כבוי באירוע הזה');
  });
  await step('E2 exit returns to the event tab', async () => {
    await s.go('/event/gate');
    await s.tap('יציאה מהשער');
    await s.see('סריקות שלך היום');
  });
  await step('no page errors (staff)', async () => { assert.deepEqual(s.errors, []); });
  await s.ctx.close();
}

// ───────── manager (Noa) on event day: live view ─────────
console.log('manager · eventDay');
{
  const s = await session('manager', 'eventDay');
  await step('Y1 live: numbers, needs-you, stations', async () => {
    await s.go(`/manage/events/${FEST}/live`);
    await s.see('212'); await s.see('מתוך 640 כרטיסים'); await s.see('428 עוד לא הגיעו'); await s.see('נשארו 3 שעות ו־40 דקות');
    await s.see('עכשיו: 38 בעשר דקות'); await s.see('דורש אותך · 3'); await s.see('חניה בלי איש צוות'); await s.see('שער · יואב'); await s.see('דוכן · נועה ואורלי');
    await s.see('18 חשבונות · נמכר 1,240 ₪');
  });
  await step('Y1 -> Y2 rejected filter -> Y3', async () => {
    await s.tap('2 סריקות נדחו בשער');
    await s.see('סריקות · 217');
    await s.page.locator('a', { hasText: 'יוסי מזרחי' }).first().click();
    await s.see('נדחה בשער · 17:02 · סרק יואב'); await s.see('ההזמנה בוטלה'); await s.see('נועה · 17.11'); await s.see('6 כרטיסים · 300 ₪ · לא שולם');
    await s.see('ביקש לבטל כי לא יגיעו');
  });
  await step('Y3 WhatsApp stays inside the demo', async () => {
    await s.tap('וואטסאפ');
    await s.see('בהדגמה לא נשלח');
  });
  await step('Y3 reopen and let in, persists', async () => {
    await s.tap('לפתוח מחדש ולהכניס');
    await s.see('נפתח מחדש. יוסי בפנים');
    await s.go(`/manage/events/${FEST}/live/scans/demo-sc-yossi`); await s.reload();
    await s.see('נפתח מחדש');
    await s.go(`/manage/events/${FEST}/live`);
    await s.see('213'); await s.see('4 נכנסו וישלמו אחר כך').catch(() => s.see('נכנסו וישלמו אחר כך'));
  });
  await step('Y3 keep the other rejection, persists', async () => {
    await s.go(`/manage/events/${FEST}/live/scans/demo-sc-yossi-1`);
    await s.tap('נשאר דחוי');
    await s.see('סריקות ·');
    await s.go(`/manage/events/${FEST}/live/scans/demo-sc-yossi-1`); await s.reload();
    await s.see('נשאר דחוי');
    await s.go(`/manage/events/${FEST}/live`);
    await s.see('דורש אותך · 2');
  });
  await step('Y2 chips, search, export', async () => {
    await s.go(`/manage/events/${FEST}/live/scans`);
    await s.tap('בשער · 34'); await s.see('רחל שטרן'); await s.see('שילם בשער');
    await s.tap('אחר כך ·'); await s.see('רוני לוי');
    await s.tap('הכל');
    await s.fill('שם או טלפון', 'נועם'); await s.see('כרטיס 2 מתוך 2');
    const dl = s.page.waitForEvent('download', { timeout: 5000 });
    await s.tap('אקסל');
    assert.match((await dl).suggestedFilename(), /\.csv$/);
  });
  await step('Y4 waiting: stats, chips, WhatsApp', async () => {
    await s.go(`/manage/events/${FEST}/live/waiting`);
    await s.see('עוד לא הגיעו'); await s.see('הזמנות'); await s.see('משפחת לוי'); await s.see('אסתר כהן');
    await s.tap('הגיעו חלקית'); await s.see('דוד כהן');
    await s.tap('לא שילמו ·'); await s.see('עומר לוי'); await s.see('100 ₪');
    await s.page.getByRole('button', { name: 'וואטסאפ לעומר' }).click();
    await s.see('בהדגמה לא נשלח');
    await s.see('רוב האנשים מגיעים עד 18:30');
  });
  await step('Y1 bottom bar opens the gate and the stall', async () => {
    await s.go(`/manage/events/${FEST}/live`);
    await s.page.locator('.k-bottombar').getByText('שער').click();
    await s.see('יציאה מהשער');
    await s.tap('יציאה מהשער');
    await s.see('דורש אותך');
    await s.page.locator('.k-bottombar').getByText('דוכן').click();
    await s.see('מי קונה?'); await s.see('האירוע חי');
  });
  await step('E2 for a manager: arrived of all tickets, and the quick link to the stall', async () => {
    await s.go('/event/gate');
    await s.see('נכנסו מתוך');
    await s.tap('לדוכן');
    await s.see('מי קונה?');
  });
  await step('E9 stall accounts: the totals for a manager', async () => {
    await s.go('/event/stall/tabs');
    await s.see('נמכרו היום'); await s.see('חשבונות פתוחים');
  });
  await step('E9 as manager links to the manager tab screen', async () => {
    await s.go(`/manage/events/${FEST}/tabs`);
    await s.see('חשבונות הדוכן');
    const href = await s.page.locator('a', { hasText: 'רוני לוי' }).first().getAttribute('href');
    assert.match(href || '', /\/manage\/events\/demo-e-festival\/tabs\/demo-tab-roni-fest/);
  });
  await step('no page errors (manager)', async () => { assert.deepEqual(s.errors, []); });
  await s.ctx.close();
}

// ───────── owner (Beni) after the event: closing ─────────
console.log('owner · afterEvent');
{
  const s = await session('owner', 'afterEvent');
  await step('Y5 checklist', async () => {
    await s.go(`/manage/events/${FEST}/close`);
    await s.see('487'); await s.see('נכנסו מתוך 640 כרטיסים'); await s.see('מזומן בשער נספר'); await s.see('1,150 ₪'); await s.see('5 חשבונות דוכן פתוחים'); await s.see('214 ₪');
    await s.see('3 ישלמו אחר כך');
  });
  await step('Y5 correct the gate cash, persists', async () => {
    await s.page.getByRole('button', { name: 'תיקון' }).first().click();
    await s.fill('כמה נספר (₪)', '1200');
    await s.tap('שמירה');
    await s.see('1,200 ₪');
    await s.reload();
    await s.see('1,200 ₪');
  });
  await step('Y5 close, then reopen', async () => {
    await s.page.locator('.k-bottombar').getByRole('button', { name: 'סגירת האירוע' }).click();
    await s.page.waitForURL(/tab=summary/);
    await s.go(`/manage/events/${FEST}/close`); await s.reload();
    await s.see('פתיחה מחדש');
    await s.go('/event');
    await s.see('אין אירוע היום'); // the shell drops a closed event, so the event tab is gone
    await s.go(`/manage/events/${FEST}/close`);
    await s.tap('פתיחה מחדש');
    await s.see('האירוע נפתח מחדש');
    await s.go(`/manage/events/${FEST}/close`); await s.reload();
    await s.see('מה קורה כשסוגרים');
  });
  await step('no page errors (owner)', async () => { assert.deepEqual(s.errors, []); });
  await s.ctx.close();
}

// ───────── the guest side pages this round restored ─────────
console.log('guest side');
{
  const s = await session('anon', 'regular');
  await step('signed out: /me/account links to the demo', async () => {
    await s.go('/me/account');
    await s.tap('לראות איך האפליקציה עובדת');
    await s.page.waitForURL(/\/app\/demo/);
  });
  await s.ctx.close();
}
{
  const s = await session('blocked', 'regular');
  await step('a blocked guest gets the guest blocked page', async () => {
    await s.go('/');
    await s.see('החשבון הושעה'); await s.see('שלום יוסי'); await s.see('עדיין פתוחים לצפייה');
    assert.equal(await s.page.getByText('לאפליקציית הצוות').count(), 0, 'not the team suspended screen');
  });
  await s.ctx.close();
}
{
  const s = await session('staff', 'regular');
  await step('a team member who orders tickets lands on their tickets, not the team profile', async () => {
    await s.go('/events/demo-e-tour/order');
    await s.page.getByRole('button', { name: 'הרשמה' }).click();
    await s.page.waitForURL(/\/app\/me\/tickets/);
    await s.see('הכרטיסים שלי');
  });
  await step('no page errors (guest side)', async () => { assert.deepEqual(s.errors, []); });
  await s.ctx.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
