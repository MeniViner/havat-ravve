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
  // ---------- Q26 -> Q25 -> B3 as the owner (tidy round: messages live inside People) ----------
  section('Q26-ComposeAll, Q25-Messages (inside People), B3-Read (owner)');
  const { ctx, page } = await fresh('owner');
  await go(page, '/manage/broadcasts');
  check(page.url().endsWith('/app/manage/people?tab=messages'), '/manage/broadcasts redirects to People, messages segment', page.url());
  check((await text(page)).includes('אנשים והודעות') && (await page.locator('[aria-pressed="true"]', { hasText: 'הודעות' }).count()) === 1 && (await page.locator('a.broadcast-sent').count()) >= 3, 'Q25 lists the sent messages under "אנשים והודעות"');
  check((await text(page)).includes('קראו 8 מתוך 12'), 'Q25 read bar of demo-b-1 (8 of 12 until Yoav reads it)');
  const sent = (t) => page.locator('a.broadcast-sent', { hasText: t });
  check((await sent('מחר מתחילים ב־15:30').locator('.k-tag').first().innerText()) === 'כל הצוות' && (await sent('החניה עברה לשדה הצפוני').innerText()).includes('נרשמי פסטיבל הסתיו') && (await sent('החניה עברה לשדה הצפוני').innerText()).includes('ראו 5 מתוך 8'), 'Q25 audience tags (team, registrants of the festival) and "ראו" outside the team');
  check(await sent('מחר מתחילים ב־15:30').locator('.k-tag').first().evaluate((e) => e.className.includes('k-tag--warm')) && await sent('החניה עברה').locator('.k-tag').first().evaluate((e) => !/k-tag--/.test(e.className)), 'team tag warm, outside-the-team tag neutral');
  check((await sent('ערב חנוכה').innerText()).includes('כל המשתמשים'), 'Q25 a message to all users');
  await page.getByRole('button', { name: 'לצוות', exact: true }).click(); await page.waitForTimeout(150);
  check((await sent('מחר מתחילים ב־15:30').count()) === 1 && (await sent('החניה עברה').count()) === 0, 'filter "לצוות" shows only team messages');
  await page.getByRole('button', { name: 'לאורחים ולכולם' }).click(); await page.waitForTimeout(150);
  check((await sent('מחר מתחילים ב־15:30').count()) === 0 && (await sent('החניה עברה').count()) === 1 && (await sent('ערב חנוכה').count()) === 1, 'filter "לאורחים ולכולם" shows registrants, vendors and all users');
  await page.getByRole('button', { name: 'אנשים · 155' }).click(); await page.waitForTimeout(200);
  check(page.url().endsWith('/app/manage/people') && (await page.getByRole('button', { name: 'עוד פעולות' }).count()) === 1, 'segment "אנשים" goes back to the people list with ⋯');
  await page.getByRole('button', { name: 'הודעות', exact: true }).click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'הודעה חדשה' }).click();
  await page.waitForTimeout(200);
  check(page.url().endsWith('/app/manage/broadcasts/new'), '"הודעה חדשה" opens Q26');
  const chips = await page.locator('.k-choice').allInnerTexts();
  check(chips.includes('כל הצוות · 12') && chips.includes('בחווה היום · 4') && chips.includes('מנהלים · 5') && chips.includes('צוות האירוע · 6'), 'Q26 team audience counts (12 / 4 / 5 / 6)', chips);
  check(chips.includes('נרשמי פסטיבל הסתיו · 8') && chips.includes('בעלי דוכנים · 2') && chips.some((c) => /^כל המשתמשים · \d+$/.test(c) && +c.split('· ')[1] > 9), 'Q26 outside audiences: festival registrants 8, vendors 2, all users who agreed', chips);
  check((await page.locator('.broadcast-sub .k-group__label').allInnerTexts()).join('|') === 'הצוות|מחוץ לצוות', 'Q26 two groups: הצוות / מחוץ לצוות');
  const send = page.locator('.k-bottombar button');
  check(await send.isDisabled(), 'send is disabled while the text is empty');
  await page.getByLabel('תוכן ההודעה').fill(MSG);
  check((await page.locator('.broadcast-count').innerText()) === `${MSG.length} מתוך 200`, 'counter "N מתוך 200"');
  await page.getByLabel('תוכן ההודעה').fill('א'.repeat(250));
  check((await page.getByLabel('תוכן ההודעה').inputValue()).length === 200, 'text stops at 200');
  await page.getByLabel('תוכן ההודעה').fill(MSG);
  await page.getByRole('button', { name: 'מנהלים · 5' }).click();
  await page.getByRole('button', { name: 'דחופה, נשארת בראש עד שרואים' }).click();
  check((await page.locator('.broadcast-phone').innerText()).includes('הודעה מבני') && (await page.locator('.broadcast-phone').innerText()).includes(MSG), 'preview: "הודעה מבני" and the text');
  check((await send.innerText()).includes('שליחה ל־5 אנשים'), 'send button names the count', await send.innerText());
  await send.click();
  await page.waitForTimeout(400);
  check(page.url().endsWith('/app/manage/people?tab=messages') && (await toast(page)).includes('נשלח ל־5 אנשים'), 'send -> Q25 with a toast', { url: page.url(), toast: await toast(page) });
  // (the demo clock stands at 10:30 while demo-b-1 is stamped 14:10, so the new one is listed second in demo)
  const mine = () => page.locator('a.broadcast-sent', { hasText: MSG });
  check((await mine().count()) === 1 && (await mine().innerText()).includes('דחוף') && (await mine().innerText()).includes('קראו 1 מתוך 5'), 'new broadcast listed: urgent, read 1 of 5 (the sender)', await page.locator('main').innerText());
  await page.reload({ waitUntil: 'networkidle' });
  check((await mine().count()) === 1, 'persists after reload');
  await mine().click();
  await page.waitForTimeout(250);
  check(/\/manage\/people\/messages\/demo-/.test(page.url()) && (await text(page)).includes('עוד לא קראו · 4') && (await text(page)).includes('קראו · 1'), 'row -> B3: 4 not yet, 1 read', await text(page));
  await page.getByText('לשלוח שוב').click();
  await page.waitForTimeout(250);
  check((await toast(page)).includes('נשלח שוב ל־4 אנשים'), '"לשלוח שוב" re-notifies only the 4 without a receipt', await toast(page));
  await page.getByRole('button', { name: /^וואטסאפ ל/ }).first().click();
  await page.waitForTimeout(200);
  check((await toast(page)).includes('בהדגמה לא נשלח'), 'WhatsApp per person (demo: nothing leaves)');
  await go(page, '/manage/broadcasts/demo-b-1');
  check(page.url().endsWith('/app/manage/people/messages/demo-b-1'), 'an old /manage/broadcasts/:id link redirects to B3 under People');
  const b3 = await text(page);
  check(b3.includes('עוד לא קראו · 4') && b3.includes('עוד לא נכנס לאפליקציה') && b3.includes('קראו · 8') && b3.includes('עוד 5'), 'B3 demo-b-1: not yet 4, read 8, "עוד 5"', b3);
  await page.getByText('עוד 5').click();
  check((await page.locator('section.k-card--list').nth(1).locator('li').count()) === 8, '"עוד 5" shows every reader');
  await page.getByText('הודעות', { exact: true }).click();
  await page.waitForTimeout(200);
  check(page.url().endsWith('/app/manage/people?tab=messages'), 'B3 back -> Q25');

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
    await go(page, '/manage/people?tab=messages');
    check((await page.locator('a.broadcast-sent', { hasText: MSG }).innerText()).includes('קראו 2 מתוך 5'), 'the receipt reaches Q25 (2 of 5)');
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

  // ---------- Q26 outside the team: registrants (event picker), vendors, all users; "לשלוח גם במייל" ----------
  section('Q26 outside the team (owner): every audience writes to the demo store, e-mail jobs for people without push');
  const o = await fresh('owner');
  const overrides = () => o.page.evaluate(() => JSON.parse(localStorage.getItem('farm-demo-overrides') || '{}'));
  const sendTo = async (pick, text, after) => {
    await go(o.page, '/manage/broadcasts/new');
    await o.page.getByLabel('תוכן ההודעה').fill(text);
    await o.page.getByRole('button', { name: pick }).click(); await o.page.waitForTimeout(250);
    if (after) await after();
    const btn = o.page.locator('.k-bottombar button');
    const label = await btn.innerText();
    await btn.click(); await o.page.waitForTimeout(400);
    return label;
  };
  // registrants: two candidate events, so the choice opens the picker (rule 9)
  let pickerTitle = '';
  const regLabel = await sendTo(/^נרשמי /, 'בדיקה לנרשמי הסיור', async () => {
    const d = o.page.getByRole('dialog');
    pickerTitle = await d.innerText();
    await d.getByText('סיור שבת בחווה').click(); await o.page.waitForTimeout(250);
    const chips = await o.page.locator('.k-choice').allInnerTexts();
    check(chips.includes('נרשמי סיור שבת בחווה · 2'), 'the picked event names the choice and its count', chips);
    const mailRow = await o.page.locator('.broadcast-mailrow').innerText();
    check(mailRow.includes('2 מהם לא מקבלים התראות בטלפון'), 'the e-mail row counts the people without push', mailRow);
    check((await o.page.getByText('אורחים רואים את ההודעה באפליקציה, ליד הכרטיסים שלהם.').count()) === 1, 'the note line for guests');
    await o.page.getByRole('switch', { name: 'לשלוח גם במייל' }).click();
  });
  check(pickerTitle.includes('נרשמי איזה אירוע') && pickerTitle.includes('פסטיבל הסתיו') && pickerTitle.includes('סיור שבת בחווה'), 'registrants: a picker of the events', pickerTitle);
  check(regLabel.includes('שליחה ל־2 הזמנות'), 'send button "שליחה ל־N הזמנות"', regLabel);
  check(o.page.url().endsWith('/app/manage/people?tab=messages') && (await toast(o.page)).includes('נשלח ל־2 אנשים'), 'sent to the 2 registrants of the tour');
  const regCard = o.page.locator('a.broadcast-sent', { hasText: 'בדיקה לנרשמי הסיור' });
  check((await regCard.innerText()).includes('נרשמי סיור שבת בחווה') && (await regCard.innerText()).includes('ראו 0 מתוך 2'), 'listed with its neutral tag and "ראו 0 מתוך 2"', await regCard.innerText());
  let ov = await overrides();
  const bcs = Object.values(ov.broadcasts || {}).filter(Boolean);
  const regB = bcs.find((b) => b.text === 'בדיקה לנרשמי הסיור');
  check(regB && regB.audience === 'registrants' && regB.eventId === 'demo-e-tour' && regB.recipients.length === 2, 'the broadcast in the demo store: registrants of the tour', regB);
  const jobs = Object.entries(ov.email_outbox || {}).filter(([id]) => id.startsWith('bc_' + regB?.id));
  check(jobs.length === 2 && jobs.every(([, j]) => j.kind === 'broadcast' && j.status === 'queued' && !('nextAt' in j)), 'two e-mail jobs bc_<id>_<uid>, queued, no nextAt', jobs);
  const notes = regB ? regB.recipients.map((u) => ov[`users/${u}/notifications`]?.['b_' + regB.id]) : [];
  check(notes.length === 2 && notes.every((n) => n && n.link === '/'), 'a notification per registrant, opening their home (/)', notes);
  // vendors and all users
  await sendTo(/^בעלי דוכנים/, 'בדיקה לבעלי הדוכנים');
  await sendTo(/^כל המשתמשים/, 'בדיקה לכל המשתמשים');
  ov = await overrides();
  const all = Object.values(ov.broadcasts || {}).filter(Boolean);
  const vend = all.find((b) => b.text === 'בדיקה לבעלי הדוכנים'), every = all.find((b) => b.text === 'בדיקה לכל המשתמשים');
  check(vend?.audience === 'vendors' && vend.recipients.length === 2, 'vendors: written to the demo store', vend);
  check(every?.audience === 'everyone' && every.recipients.includes('demo-u-david') && !every.recipients.includes('demo-u-roni') && !every.recipients.includes('demo-u-yossi'), 'all users: only people who agreed to updates (David yes, Roni no, blocked Yossi never)', every?.recipients?.length);
  check(!Object.keys(ov.email_outbox || {}).some((id) => id.startsWith('bc_' + vend?.id) || id.startsWith('bc_' + every?.id)), 'no e-mail jobs while the switch stays off');
  await go(o.page, '/manage/people/messages/' + regB?.id);
  check((await text(o.page)).includes('עוד לא ראו · 2') && (await text(o.page)).includes('נרשמי סיור שבת בחווה'), 'B3 under People for an outside message: "עוד לא ראו"');
  await o.page.getByRole('button', { name: 'עוד פעולות' }).click(); await o.page.waitForTimeout(250);
  check((await o.page.getByRole('dialog').innerText()).includes('מחיקה'), 'owner: delete is in ⋯ (rule 6)');
  check(!o.page.errors.length, 'no page errors', o.page.errors);
  await o.ctx.close();
  const mg = await fresh('manager');
  await go(mg.page, '/manage/people/messages/demo-b-1');
  check((await mg.page.getByRole('button', { name: 'עוד פעולות' }).count()) === 0 && (await mg.page.getByRole('button', { name: 'מחיקה' }).count()) === 0, 'manager: no delete of a message (owners only)');
  await mg.ctx.close();

  // ---------- /me/edit: the consent switch ----------
  section('/me/edit "לקבל עדכונים מהחווה"');
  const me = await fresh('staff');
  await go(me.page, '/me/edit');
  const sw = () => me.page.getByRole('switch', { name: 'לקבל עדכונים מהחווה' });
  check((await sw().getAttribute('aria-checked')) === 'true' && (await me.page.locator('main').innerText()).includes('אירועים חדשים, כמה פעמים בשנה'), 'the switch with the U13 note (Yoav agreed in the demo)');
  await sw().click(); await me.page.getByRole('button', { name: 'שמירה' }).click(); await me.page.waitForTimeout(400);
  await go(me.page, '/me/edit');
  check((await sw().getAttribute('aria-checked')) === 'false', 'turned off, saved, still off after reopening');
  await me.ctx.close();

  // ---------- managers only ----------
  section('access');
  const v = await fresh('staff');
  await go(v.page, '/manage/broadcasts/new');
  check(v.page.url().endsWith('/app/tasks'), 'a volunteer cannot open B1 (sent back to /tasks)');
  await v.ctx.close();
} catch (e) { failures++; console.error(e); } finally { await browser.close(); }

console.log(`\n${passes} passed, ${failures} failed${skips ? `, ${skips} skipped` : ''}`);
process.exit(failures ? 1 : 0);
