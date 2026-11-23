// Click-through of the vendor area (D1-D11, V1/W3, V2, V6, N8, V7) in demo mode: every control per persona (vendor regular /
// event day / after, helper, manager), writes checked after a reload, no console errors, no request outside the demo sandbox.
// The vendor rules cases live in tests/rules-app.mjs (npm run test:rules).
//
//   PORT=5208 node scripts/dev.mjs            (another terminal)
//   node tests/v2-vendor.mjs [--base=http://localhost:5208]

const section = (s) => console.log('\n' + s);
let fails = 0;

// ====================================================================================================================
// Click-through in demo mode.
// ====================================================================================================================
async function clickPart() {
  const { chromium } = await import('playwright');
  const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || process.env.BASE || 'http://localhost:5208';
  const browser = await chromium.launch();
  const log = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  async function session(persona, scenario) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
    await ctx.addInitScript(([p, s]) => {
      if (sessionStorage.getItem('__vc')) return; sessionStorage.setItem('__vc', '1');
      localStorage.clear(); localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona: p, scenario: s })); localStorage.setItem('farm-install-dismissed', '1');
    }, [persona, scenario]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(4000);
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => { if (/firestore\.googleapis\.com|identitytoolkit|securetoken|workers\.dev/.test(r.url())) errors.push('network outside the demo: ' + r.url().slice(0, 120)); }); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const go = async (path) => { await page.goto(`${BASE}/app${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(250); };
    const text = async () => page.locator('body').innerText();
    const has = async (t) => (await text()).includes(t);
    const click = async (t, o = {}) => { try { await page.getByText(t, { exact: !!o.exact }).first().click(); } catch (e) { log(false, `click "${t}": ${String(e).split('\n')[0]}`); } await page.waitForTimeout(250); };
    const role = async (r, name) => { try { await page.getByRole(r, { name }).first().click(); } catch (e) { log(false, `click ${r} "${name}": ${String(e).split('\n')[0]}`); } await page.waitForTimeout(250); };
    const reload = async () => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(250); };
    return { ctx, page, errors, go, text, has, click, role, reload };
  }
  const step = async (name, fn) => { try { await fn(); } catch (e) { log(false, `${name}: ${String(e).split('\n')[0]}`); } };

  // ---------- vendor, regular day ----------
  await step('vendor regular', async () => {
    const s = await session('vendor', 'regular');
    await s.go('/vendor');
    log(await s.has('פסטיבל הסתיו') && await s.has('נשאר לך'), 'D3 renders hero and todos');
    await s.click('כניסת רכבים רק עד 15:15');
    log(await s.page.getByRole('dialog').isVisible(), 'D3 message opens sheet');
    await s.page.getByRole('dialog').getByText('סגירה').click(); await s.page.waitForTimeout(200);
    await s.reload();
    log((await s.page.locator('.k-row', { hasText: 'כניסת רכבים' }).locator('[aria-label="חדש"]').count()) === 0, 'D3 message read receipt persists');
    await s.click('לקרוא את ההנחיות לדוכנים'); await s.reload();
    log(!(await s.has('לקרוא את ההנחיות')), 'D3 guidelines todo cleared after opening');
    await s.click('לצרף את מי שעובד איתך');
    log(s.page.url().includes('/vendor/stall'), 'D3 helpers todo opens the stall');
    await s.go('/vendor'); await s.page.locator('.k-hero').click(); await s.page.waitForTimeout(250);
    log(s.page.url().endsWith('/vendor/events/demo-e-festival'), 'D3 hero opens D4');
    await s.role('button', 'וואטסאפ לנועה'); log(await s.page.getByText('בהדגמה לא נשלח').first().isVisible(), 'D4 WhatsApp is intercepted in demo');
    log((await s.page.locator('.k-row', { hasText: 'נועה שחר' }).locator('button[aria-label^="התקשרות"]').count()) === 0, 'D4 contact row carries one control (rule 4)');
    await s.page.locator('.k-row', { hasText: 'נועה שחר' }).locator('.k-row__hit').click(); await s.page.waitForTimeout(200);
    log(await s.page.getByRole('dialog').getByText('התקשרות').isVisible(), 'D4 contact row opens its sheet with the call');
    await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(200);
    await s.click('ניווט לחווה'); await s.click('במפה');
    await s.click('שינוי תשובה'); log(s.page.url().includes('/vendor/invite/demo-e-festival'), 'D4 change answer opens D1');
    await s.click('מגיעים'); log(s.page.url().includes('/needs'), 'D1 מגיעים opens D2');
    await s.click('מים', { exact: true }); await s.role('button', 'עוד'); await s.role('switch', 'מגיעים עם רכב לפריקה');
    await s.page.getByLabel('משהו שחשוב שנדע').fill('צריך שקע כפול'); await s.click('שליחה לחווה');
    log(s.page.url().endsWith('/vendor/events/demo-e-festival'), 'D2 send returns to D4');
    await s.go('/vendor/events/demo-e-festival/needs'); await s.reload();
    log(await s.page.getByRole('button', { name: 'מים', exact: true }).getAttribute('aria-pressed') === 'true', 'D2 needs persisted (מים)');
    log(await s.page.getByLabel('משהו שחשוב שנדע').inputValue() === 'צריך שקע כפול', 'D2 note persisted');
    log((await s.page.locator('.k-stepper__value').innerText()) === '3', 'D2 people persisted');
    log(await s.page.getByRole('switch', { name: 'מגיעים עם רכב לפריקה' }).getAttribute('aria-checked') === 'false', 'D2 vehicle persisted');
    await s.go('/vendor/invite/demo-e-festival'); await s.click('לא הפעם');
    log(s.page.url().endsWith('/vendor') && await s.has('אין כרגע אירוע קרוב'), 'D1 decline lands on D10');
    await s.reload(); log(await s.has('אין כרגע אירוע קרוב'), 'D1 decline persisted');
    await s.go('/vendor/invite/demo-e-festival'); await s.click('מגיעים', { exact: true }); await s.click('שליחה לחווה');
    await s.go('/vendor'); log(await s.has('אישרת הגעה'), 'D1/D2 confirm again restores D3');
    await s.go('/vendor/stall'); log(await s.has('מי עובד בדוכן'), 'D7 renders');
    await s.click('עריכה'); log(await s.has('עריכת הדוכן'), 'D7 edit opens');
    await s.page.getByLabel('הערה לחווה').fill('מגיע עם מקרר גדול'); await s.click('שמירה');
    await s.reload(); log(await s.has('מגיע עם מקרר גדול'), 'D7 edit persisted');
    await s.click('תמר כהן'); log(await s.page.getByRole('dialog').isVisible(), 'D7 helper sheet opens');
    await s.page.getByRole('dialog').getByText('שליחת הקישור שוב').click(); await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(200);
    await s.click('לצרף עוזר'); await s.click('שליחת קישור בוואטסאפ');
    log(await s.has('כתבו את השם'), 'D8 validation shows');
    await s.page.getByLabel('שם', { exact: true }).fill('אבי לוי'); await s.page.getByLabel('טלפון').fill('052-123-4567'); await s.click('שליחת קישור בוואטסאפ');
    await s.reload(); log(s.page.url().endsWith('/vendor/stall') && await s.has('אבי לוי'), 'D8 helper added and persisted');
    await s.click('אבי לוי'); await s.page.getByRole('dialog').getByText('הסרה מהדוכן').click(); await s.page.waitForTimeout(200);
    log((await s.page.getByRole('dialog').innerText()).includes('להסיר את אבי מהדוכן?'), 'D7 helper removal asks in the Q8 sheet');
    await s.page.getByRole('dialog').getByRole('button', { name: 'הסרה', exact: true }).click(); await s.page.waitForTimeout(250);
    await s.reload(); log(!(await s.has('אבי לוי')), 'D7 helper removed and persisted');
    // the profile's terms and account deletion open for a vendor (guest pages through the legacy fallback), not bounced to /vendor
    for (const [path, title] of [['/terms', 'תנאי שימוש ופרטיות'], ['/privacy', 'תנאי שימוש ופרטיות'], ['/delete-account', 'מחיקת החשבון'], ['/contact', 'פנייה לחווה']]) {
      await s.go(path); log(s.page.url().endsWith(path) && await s.has(title), `vendor opens ${path}`);
    }
    await s.go('/events/demo-e-festival'); log(s.page.url().endsWith('/vendor'), 'other guest pages still go to /vendor');
    log(!s.errors.length, `vendor regular: no console errors ${s.errors.slice(0, 3).join(' | ')}`);
    await s.ctx.close();
  });
  // ---------- vendor, event day ----------
  await step('vendor eventDay', async () => {
    const s = await session('vendor', 'eventDay');
    await s.go('/vendor'); log(await s.has('היום האירוע'), 'D5 renders');
    await s.click('הגעתי לחווה'); log(await s.has('האירוע פתוח') && await s.has('212'), 'D5 check-in shows D6');
    await s.reload(); log(await s.has('האירוע פתוח'), 'D6 arrival persisted');
    await s.click('הסתדר'); await s.reload(); log(!(await s.has('ביקשת:')), 'D6 settled persisted');
    await s.click('צריך עזרה בדוכן'); await s.reload(); log(await s.has('ביקשת: צריך עזרה בדוכן'), 'D6 request persisted');
    await s.page.locator('.vendor-ask__btn', { hasText: 'צריך עזרה בדוכן' }).click(); await s.page.waitForTimeout(200);
    log(await s.has('כבר ביקשת את זה'), 'D6 duplicate request guarded');
    log(!s.errors.length, `vendor eventDay: no console errors ${s.errors.slice(0, 3).join(' | ')}`);
    await s.ctx.close();
  });
  // ---------- vendor, after the event ----------
  await step('vendor afterEvent', async () => {
    const s = await session('vendor', 'afterEvent');
    await s.go('/vendor'); log(await s.has('אין כרגע אירוע קרוב') && await s.has('היית אצלנו'), 'D10 renders');
    await s.role('switch', 'להזמין אותי לאירוע הבא'); await s.reload();
    log(await s.page.getByRole('switch', { name: 'להזמין אותי לאירוע הבא' }).getAttribute('aria-checked') === 'false', 'D10 toggle persisted');
    await s.click('פסטיבל הסתיו · 28.11'); log(s.page.url().includes('/summary'), 'D10 past row opens D9');
    await s.click('שליחה לחווה'); log(await s.has('בחרו איך היה'), 'D9 validation');
    await s.click('בסדר', { exact: true }); await s.page.getByLabel('מה היה עוזר לך בפעם הבאה').fill('חשמל קרוב'); await s.click('שליחה לחווה');
    await s.go('/vendor/events/demo-e-festival/summary');
    log(await s.has('עדכון המשוב'), 'D9 feedback persisted');
    log(await s.page.getByRole('radio', { name: 'בסדר' }).getAttribute('aria-checked') === 'true', 'D9 rating persisted');
    log(!s.errors.length, `vendor afterEvent: no console errors ${s.errors.slice(0, 3).join(' | ')}`);
    await s.ctx.close();
  });
  // ---------- helper ----------
  await step('helper', async () => {
    const s = await session('helper', 'regular');
    await s.go('/vendor'); log(await s.has('בדוכן של') && await s.has('פסטיבל הסתיו'), 'D11 renders');
    await s.go('/vendor/stall'); log((await s.page.getByText('עריכה').count()) === 0 && (await s.page.getByText('לצרף עוזר').count()) === 0, 'D7 read-only for helper');
    await s.go('/vendor/stall/helpers/new'); log(s.page.url().endsWith('/vendor/stall'), 'D8 closed to helpers');
    await s.go('/vendor/events/demo-e-festival'); log((await s.page.getByText('שינוי תשובה').count()) === 0, 'D4 helper cannot change the answer');
    await s.go('/vendor/invite/demo-e-festival'); log((await s.page.getByText('לא הפעם').count()) === 0, 'D1 helper cannot answer');
    log(!s.errors.length, `helper: no console errors ${s.errors.slice(0, 3).join(' | ')}`);
    await s.ctx.close();
  });
  // ---------- manager ----------
  await step('manager regular', async () => {
    const s = await session('manager', 'regular');
    await s.go('/manage/vendors'); log(await s.has('בעלי דוכנים · 9'), 'V1 renders');
    await s.page.getByLabel('שם, טלפון או מה מוכרים').fill('דבש'); await s.page.waitForTimeout(200);
    log((await s.page.locator('.k-row').count()) === 1, 'V1 search filters');
    await s.page.getByLabel('שם, טלפון או מה מוכרים').fill('');
    // W3: the top bar holds only ⋯ (table view, Excel, the saved invite message); "חדש" became the dashed row under the search
    log((await s.page.getByRole('button', { name: 'חדש', exact: true }).count()) === 0, 'W3 no "חדש" in the top bar');
    await s.role('button', 'עוד פעולות');
    const poolMore = await s.page.getByRole('dialog').innerText();
    log(['צפייה בטבלה', 'ייצוא לאקסל', 'נוסח ההזמנה'].every((t) => poolMore.includes(t)), 'W3 ⋯ holds table view, Excel and the saved template');
    await s.page.getByRole('dialog').getByText('צפייה בטבלה').click(); await s.page.waitForTimeout(250);
    log(s.page.url().includes('/manage/vendors/table') && await s.has('9 שורות · 7 עמודות') && await s.has('גבינות משק רז'), 'W3 table view opens its own /table screen');
    log((await s.page.locator('td', { hasText: /^\d{2}\.\d{2}\.\d{4}$/ }).count()) === 9, 'W3 table dates go through tableCell');
    await s.click('בעלי דוכנים', { exact: true }); log(/\/manage\/vendors$/.test(s.page.url()) && await s.has('בעלי דוכנים · 9'), 'W3 table back link returns to the pool');
    await s.role('button', 'עוד פעולות'); await s.page.getByRole('dialog').getByText('נוסח ההזמנה').click(); await s.page.waitForTimeout(250);
    log(s.page.url().includes('/manage/settings/messages') && await s.has('הזמנת בעל דוכן'), 'W3 saved template opens the invite message');
    await s.go('/manage/vendors');
    await s.role('button', 'בעל דוכן חדש'); log(s.page.url().includes('new=1') && await s.has('שם הדוכן') && await s.has('הוספה למאגר'), 'W3 "בעל דוכן חדש" opens the new form');
    await s.page.getByLabel('שם הדוכן').fill('ירקות השדה'); await s.page.getByLabel('איש קשר').fill('גלית'); await s.page.getByLabel('טלפון').fill('050-111-2222'); await s.click('הוספה למאגר');
    await s.reload(); log(await s.has('ירקות השדה') && /\/manage\/vendors\/demo-/.test(s.page.url()), 'V1 new vendor saved and opens V2');
    await s.click('הזמנה לאירוע'); await s.page.getByRole('dialog').getByText('פסטיבל הסתיו').click(); await s.page.waitForTimeout(250);
    await s.reload(); log(await s.has('באירועים שלנו') && await s.has('הוזמנה ב־'), 'V2 invite persisted');
    await s.go('/manage/vendors/demo-v-raz'); await s.click('עריכה'); await s.page.getByLabel('הערות לצוות').fill('מעדיף פינה'); await s.click('שמירה');
    await s.reload(); log(await s.has('מעדיף פינה'), 'V2 edit persisted');
    await s.click('גישה', { exact: true }); log(s.page.url().endsWith('/access'), 'V2 access link opens V6');
    await s.click('שוב', { exact: true }); log(await s.has('בהדגמה לא נשלח'), 'V6 resend intercepted');
    await s.click('לקשר עוד מישהו לדוכן');
    await s.page.getByRole('dialog').getByLabel('שם', { exact: true }).fill('יעל כהן'); await s.page.getByRole('dialog').getByLabel('טלפון').fill('054-999-8888');
    await s.page.getByRole('dialog').getByText('שליחת קישור בוואטסאפ').click(); await s.page.waitForTimeout(250);
    await s.reload(); log(await s.has('יעל כהן') && await s.has('מי מקושר לדוכן · 3'), 'V6 link person persisted');
    log(!(await s.has('הסרת הגישה')), 'V6 no remove-access text at the bottom (rule 6)');
    await s.role('button', 'עוד פעולות'); await s.page.getByRole('dialog').getByText('הסרת הגישה').click(); await s.page.waitForTimeout(200);
    log((await s.page.getByRole('dialog').innerText()).includes('להסיר את הגישה של כולם?'), 'V6 remove access asks in the Q8 sheet');
    await s.page.getByRole('dialog').getByRole('button', { name: 'הסרה', exact: true }).click(); await s.page.waitForTimeout(250); await s.reload();
    log(await s.has('אף אחד עוד לא מקושר'), 'V6 remove access persisted');
    // Q10
    await s.go('/manage/events/demo-e-festival/vendors'); log(await s.has('הוזמנו') && await s.has('לא ענו'), 'Q10 renders three stats');
    log(await s.page.locator('.k-row button:not(.k-row__hit)').evaluateAll((bs) => bs.length > 0 && bs.every((b) => (b.getAttribute('aria-label') || '').startsWith('תזכורת בוואטסאפ'))), 'Q10 the only row control is the reminder on unanswered rows');
    log((await s.page.locator('.k-row', { hasText: 'גבינות משק רז' }).locator('.k-row__chev').count()) === 1, 'Q10 an answered row has a chevron');
    await s.role('button', 'תזכורת בוואטסאפ ליאיר'); log(await s.has('בהדגמה לא נשלח'), 'Q10 reminder intercepted');
    // Q11
    await s.page.locator('.k-row', { hasText: 'דבש הגבעה' }).locator('.k-row__hit').click(); await s.page.waitForTimeout(200);
    const sheet = await s.page.getByRole('dialog').innerText();
    log(sheet.includes('דבש הגבעה · יאיר') && sheet.includes('לא ענה · הוזמן ב־') && sheet.includes('לסמן ידנית שהוא מגיע') && sheet.includes('לכרטיס בעל הדוכן') && sheet.includes('הסרה מהאירוע'), 'Q11 sheet: title, sub line and actions');
    await s.page.getByRole('dialog').getByText('אישר בטלפון').click(); await s.page.waitForTimeout(250); await s.reload();
    log((await s.page.locator('.k-row', { hasText: 'דבש הגבעה' }).innerText()).includes('אישר'), 'Q11 manual confirm persisted');
    await s.page.locator('.k-row', { hasText: 'מאפים של סבתא' }).locator('.k-row__hit').click(); await s.page.waitForTimeout(200);
    await s.page.getByRole('dialog').getByText('לא מגיעה הפעם').click(); await s.page.waitForTimeout(250); await s.reload();
    log((await s.page.locator('.k-row', { hasText: 'מאפים של סבתא' }).innerText()).includes('לא מגיעה'), 'Q11 not coming persisted');
    await s.page.locator('.k-row', { hasText: 'מאפים של סבתא' }).locator('.k-row__hit').click(); await s.page.waitForTimeout(200);
    await s.page.getByRole('dialog').getByText('לכרטיס בעל הדוכן').click(); await s.page.waitForTimeout(250);
    log(s.page.url().endsWith('/manage/vendors/demo-v-bakery'), 'Q11 opens the vendor card');
    await s.go('/manage/events/demo-e-festival/vendors');
    const before = await s.page.locator('.k-stat__value').first().innerText();
    await s.click('הזמנה מהמאגר'); await s.page.getByRole('dialog').locator('.k-row').first().click(); await s.page.waitForTimeout(250); await s.page.keyboard.press('Escape');
    await s.reload(); const after = await s.page.locator('.k-stat__value').first().innerText();
    log(Number(after) === Number(before) + 1, `Q10 invite from pool persisted (${before} -> ${after})`);
    // ⋯: copy from the previous event, the saved invite message
    await s.role('button', 'עוד פעולות');
    const menu = await s.page.getByRole('dialog').innerText();
    log(menu.includes('נוסח ההזמנה'), 'Q10 ⋯ holds the saved invite message');
    if (menu.includes('להזמין את מי שהיה ביריד אוקטובר')) { await s.page.getByRole('dialog').getByText('להזמין את מי שהיה ביריד אוקטובר').click(); await s.page.waitForTimeout(300); await s.reload(); }
    else await s.page.keyboard.press('Escape');
    await s.role('button', 'עוד פעולות');
    log(!(await s.page.getByRole('dialog').innerText()).includes('להזמין את מי שהיה'), 'Q10 invite previous event persisted');
    await s.page.getByRole('dialog').getByText('נוסח ההזמנה').click(); await s.page.waitForTimeout(250);
    log(s.page.url().endsWith('/manage/settings/messages') && await s.has('הזמנת בעל דוכן'), 'Q10 saved invite message opens the ready messages');
    // new vendor from the event: saved, invited, back on Q10
    await s.go('/manage/events/demo-e-festival/vendors'); await s.click('הזמנה מהמאגר'); await s.page.getByRole('dialog').getByText('בעל דוכן חדש').click(); await s.page.waitForTimeout(250);
    await s.page.getByLabel('שם הדוכן').fill('פרחי הבר'); await s.page.getByLabel('איש קשר').fill('נגה'); await s.click('הוספה למאגר'); await s.page.waitForTimeout(300);
    await s.reload(); log(s.page.url().endsWith('/manage/events/demo-e-festival/vendors') && await s.has('פרחי הבר'), 'Q10 new vendor from the event is invited');
    log(!s.errors.length, `manager regular: no console errors ${s.errors.slice(0, 3).join(' | ')}`);
    await s.ctx.close();
  });
  await step('manager eventDay', async () => {
    const s = await session('manager', 'eventDay');
    await s.go('/manage/events/demo-e-festival/vendors/today'); log(await s.has('ביקשו משהו'), 'V7 renders with request');
    await s.click('טופל'); await s.reload(); log(!(await s.has('ביקשו משהו')), 'V7 done persisted');
    await s.role('button', 'וואטסאפ ליאיר'); log(await s.has('בהדגמה לא נשלח'), 'V7 WhatsApp intercepted');
    await s.click('קרמיקה של דנה'); log(s.page.url().includes('/manage/vendors/demo-v-dana'), 'V7 row opens V2');
    await s.go('/manage/events/demo-e-festival/vendors/today'); await s.click('הודעה', { exact: true }); log(s.page.url().includes('/manage/broadcasts/new'), 'V7 message opens B1');
    log(!s.errors.length, `manager eventDay: no console errors ${s.errors.slice(0, 3).join(' | ')}`);
    await s.ctx.close();
  });
  await browser.close();
}

await clickPart();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
