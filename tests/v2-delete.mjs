// Click-through of "delete everywhere" (2026-11-21) in demo mode: every manager item is deleted behind the same ConfirmSheet,
// the delete survives a reload, "ביטול" keeps the item, and the people who may not delete see no delete. No console errors,
// no request outside the demo sandbox. The rules cases live in tests/rules-app.mjs ("deletes everywhere").
//
//   PORT=5211 node scripts/dev.mjs            (another terminal)
//   node tests/v2-delete.mjs [--base=http://localhost:5211]

const { chromium } = await import('playwright');
const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || process.env.BASE || 'http://localhost:5211';
const browser = await chromium.launch();
let fails = 0, passes = 0;
const log = (ok, msg) => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

async function session(persona) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  await ctx.addInitScript((p) => {
    if (sessionStorage.getItem('__vc')) return; sessionStorage.setItem('__vc', '1');
    localStorage.clear(); localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona: p, scenario: 'regular' })); localStorage.setItem('farm-install-dismissed', '1');
  }, persona);
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { if (/firestore\.googleapis\.com|identitytoolkit|securetoken|workers\.dev/.test(r.url())) errors.push('network outside the demo: ' + r.url().slice(0, 120)); });
  const go = async (path) => { await page.goto(`${BASE}/app${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(250); };
  const has = async (t) => (await page.locator('body').innerText()).includes(t);
  const path = () => new URL(page.url()).pathname.replace(/^\/app/, '');
  const dialog = () => page.getByRole('dialog');
  /** Presses the delete entry, checks the sheet's question, presses the red button in it. */
  const confirm = async (trigger, title, button = 'מחיקה', opts = {}) => {
    await (opts.locator || page.getByRole('button', { name: trigger, exact: true })).first().click(); await page.waitForTimeout(250);
    const d = dialog().last();
    log(await d.isVisible() && (await d.innerText()).includes(title), `${opts.label || trigger}: the confirmation asks "${title}"`);
    if (opts.text) log((await d.innerText()).includes(opts.text), `${opts.label || trigger}: the confirmation says "${opts.text}"`);
    await d.getByRole('button', { name: button, exact: true }).click(); await page.waitForTimeout(400);
  };
  const reload = async () => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300); };
  /** Tidy round: a detail screen's delete is an item in its ⋯ menu ("עוד פעולות"); opens the menu, then confirms like above. */
  const more = async (item, title, button = 'מחיקה', opts = {}) => {
    await page.getByRole('button', { name: 'עוד פעולות' }).first().click(); await page.waitForTimeout(250);
    await confirm(item, title, button, { ...opts, locator: dialog().getByRole('button', { name: item, exact: true }) });
  };
  /** The items the ⋯ menu offers, read from its sheet (the sheet is closed again). */
  const moreItems = async () => {
    const b = page.getByRole('button', { name: 'עוד פעולות' });
    if (!(await b.count())) return '';
    await b.first().click(); await page.waitForTimeout(250);
    const t = await dialog().last().innerText(); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    return t;
  };
  return { ctx, page, errors, go, has, path, dialog, confirm, reload, more, moreItems };
}
const step = async (name, fn) => { try { await fn(); } catch (e) { log(false, `${name}: ${String(e).split('\n')[0]}`); } };
let today = '';
/** Tidy rule 6: ⋯ ("עוד פעולות") → "מחיקה" → the confirmation. */
const more = async (s) => { await s.page.getByRole('button', { name: 'עוד פעולות', exact: true }).click(); await s.page.waitForTimeout(250); };
const viaMore = async (s, title, button = 'מחיקה', opts = {}) => { await more(s); await s.confirm('מחיקה', title, button, { ...opts, locator: s.dialog().getByRole('button', { name: 'מחיקה' }) }); };
const clean = async (s, who) => { log(!s.errors.length, `${who}: no console errors and nothing outside the demo${s.errors.length ? ' — ' + s.errors.slice(0, 3).join(' | ') : ''}`); await s.ctx.close(); };

// ---------- owner: every entity ----------
await step('owner', async () => {
  const s = await session('owner');

  // task: cancel keeps it, then delete
  await s.go('/tasks/demo-t-paint/edit');
  await more(s); await s.dialog().getByRole('button', { name: 'מחיקה' }).click(); await s.page.waitForTimeout(300);
  await s.dialog().getByRole('button', { name: 'ביטול' }).click(); await s.page.waitForTimeout(200);
  log(!(await s.dialog().count()) && s.path() === '/tasks/demo-t-paint/edit', 'task: "ביטול" closes the confirmation and keeps the task');
  await viaMore(s, 'למחוק את המשימה?', 'מחיקה', { text: 'תימחק מהרשימה של כולם', label: 'task' });
  log(s.path() === '/tasks' && await s.has('המשימה נמחקה'), 'task: back on the list with "המשימה נמחקה"');
  await s.reload(); log(!(await s.has('לצבוע את דלת המחסן')), 'task: gone after a reload');
  await s.go('/tasks/demo-t-paint'); log(await s.has('המשימה לא נמצאה'), 'task: its page says it is not there');

  // a recurring day's instance: deleted, and not created again on the next load (done by me today: under "רק שלי", Q2)
  await s.go('/tasks?view=mine');
  const href = await s.page.locator('a[href*="demo-tpl-gate_"]').first().getAttribute('href').catch(() => '');
  log(!!href, 'recurring: today\'s gate instance is on the list');
  if (href) {
    const id = href.split('/').pop(); today = id.split('_').pop();
    await s.go(`/tasks/${id}/edit`);
    await viaMore(s, 'למחוק את המשימה?', 'מחיקה', { text: 'רק המשימה של היום תימחק', label: 'recurring' });
    await s.reload(); await s.go('/tasks?view=mine'); await s.page.waitForTimeout(500);
    log(!(await s.page.locator(`a[href$="${id}"]`).count()), 'recurring: the day is not recreated after a reload');
    await s.go('/manage/recurring'); log(await s.has('פתיחת שער הכניסה'), 'recurring: the template itself stays');
  }

  // recurring template (was instant): now confirms
  await s.go('/manage/recurring/demo-tpl-pots');
  await viaMore(s, 'למחוק את המשימה החוזרת?', 'מחיקה', { label: 'template' });
  log(s.path() === '/manage/recurring', 'template: back on the list');
  await s.reload(); log(!(await s.page.locator('a[href$="/manage/recurring/demo-tpl-pots"]').count()), 'template: gone after a reload');

  // place (was instant)
  await s.go('/places/demo-p-pots');
  await viaMore(s, 'למחוק את המקום?', 'מחיקה', { label: 'place' });
  log(s.path() === '/places', 'place: back on the list');
  await s.reload(); log(!(await s.page.locator('a[href$="/places/demo-p-pots"]').count()), 'place: gone after a reload');

  // stall from the pool: its event records go too (the edit form's ⋯ → "מחיקה" → Q8)
  await s.go('/manage/vendors/demo-v-dana?edit=1');
  await s.page.getByRole('button', { name: 'עוד פעולות' }).click(); await s.page.waitForTimeout(200);
  await s.confirm('', 'למחוק את בעל הדוכן?', 'מחיקה', { text: 'מהמאגר ומההזמנות לאירועים', label: 'stall', locator: s.dialog().getByRole('button', { name: 'מחיקה' }) });
  log(s.path() === '/manage/vendors', 'stall: back on the pool');
  await s.reload(); log(!(await s.has('קרמיקה של דנה')), 'stall: gone from the pool after a reload');
  await s.go('/manage/events/demo-e-festival/vendors'); log(!(await s.has('קרמיקה של דנה')), 'stall: gone from the event\'s stalls');

  // a stall off one event (Q10 row → Q11 sheet → "הסרה מהאירוע" → Q8)
  await s.go('/manage/events/demo-e-festival/vendors');
  await s.page.locator('.k-row', { hasText: 'גבינות משק רז' }).locator('.k-row__hit').click(); await s.page.waitForTimeout(200);
  await s.confirm('', 'להסיר מהאירוע?', 'הסרה', { locator: s.dialog().getByRole('button', { name: 'הסרה מהאירוע' }), label: 'event stall' });
  await s.reload(); log(!(await s.has('גבינות משק רז')), 'event stall: off the event after a reload');
  await s.go('/manage/vendors'); log(await s.has('גבינות משק רז'), 'event stall: still in the pool');

  // project (owner) with its steps
  await s.go('/projects/demo-p-festival/edit'); await s.page.waitForTimeout(300);
  await viaMore(s, 'למחוק את הפרויקט?', 'מחיקה', { text: 'גם אלה שכבר בוצעו', label: 'project' });
  log(s.path() === '/projects', 'project: back on the list');
  await s.reload(); await s.go('/projects/demo-p-festival'); log(await s.has('הפרויקט לא נמצא'), 'project: gone after a reload');

  // visit with its calendar entry
  await s.go('/manage/visits/demo-vi-kindergarten');
  await s.more('מחיקה', 'למחוק את הבקשה?', 'מחיקה', { text: 'וגם הביקור ביומן', label: 'visit' });
  log(s.path() === '/manage/visits', 'visit: back on the list');
  await s.reload(); log(!(await s.has('בית ספר אורנים')), 'visit: gone after a reload');
  await s.go('/farm/calendar'); log(!(await s.has('ביקור: בית ספר אורנים')), 'visit: its calendar entry went with it');

  // donation
  await s.go('/manage/donations/demo-d-h-mar');
  await s.more('מחיקה', 'למחוק את התרומה?', 'מחיקה', { label: 'donation' });
  log(s.path() === '/manage/donations', 'donation: back on the list');
  await s.go('/manage/donations/demo-d-h-mar'); log(await s.has('התרומה לא נמצאה'), 'donation: gone after a reload');

  // person (owner only)
  await s.go('/manage/people/demo-u-roni');
  await s.more('מחיקה', 'למחוק את רוני לוי?', 'מחיקה', { text: 'עם אותו חשבון גוגל', label: 'person' });
  log(s.path() === '/manage/people', 'person: back on the directory');
  await s.reload(); log(!(await s.has('רוני לוי')), 'person: gone from the directory after a reload');
  await s.go('/manage/people/demo-u-beni'); log(!(await s.moreItems()).includes('מחיקה'), 'person: no delete on my own file');

  // broadcast (owner only)
  await s.go('/manage/broadcasts/demo-b-1');
  await s.confirm('מחיקה', 'למחוק את ההודעה?', 'מחיקה', { label: 'broadcast' });
  log(s.path() === '/manage/broadcasts', 'broadcast: back on the list');
  await s.go('/manage/broadcasts/demo-b-1'); log(await s.has('ההודעה לא נמצאה'), 'broadcast: gone after a reload');

  // inbox item: the card's head opens its row sheet, "מחיקה מהרשימה" is in it (tidy round: no X on the card)
  await s.go('/manage/inbox');
  const cards = s.page.locator('.manage-item__hit');
  const before = await cards.count();
  log(before > 0 && !(await s.page.getByRole('button', { name: /^מחיקה/ }).count()), 'inbox: every card opens its sheet, no delete button on the cards');
  if (before) {
    await cards.first().click(); await s.page.waitForTimeout(250);
    await s.confirm('', 'למחוק מהרשימה?', 'מחיקה', { locator: s.dialog().getByRole('button', { name: 'מחיקה מהרשימה', exact: true }), label: 'inbox' });
    await s.reload(); log((await s.page.locator('.manage-item__hit').count()) === before - 1, 'inbox: one card less after a reload');
  }

  // stall tab: N12 top-bar ⋯ (rule 6)
  const more = async () => { await s.page.getByRole('button', { name: 'עוד פעולות' }).first().click(); await s.page.waitForTimeout(250); };
  await s.go('/manage/events/demo-e-october/tabs/demo-tab-roni-oct');
  await more();
  await s.confirm('מחיקה', 'למחוק את החשבון?', 'מחיקה', { label: 'tab' });
  log(s.path() === '/manage/events/demo-e-october/tabs', 'tab: back on the tabs');
  await s.go('/manage/events/demo-e-october/tabs/demo-tab-roni-oct'); log(await s.has('החשבון לא נמצא'), 'tab: gone after a reload');

  // ticket order
  await s.go('/manage/events/demo-e-festival?tab=guests'); await s.page.waitForTimeout(300);
  if (await s.page.getByText('דוד כהן').count()) {
    await s.page.getByText('דוד כהן').first().click(); await s.page.waitForTimeout(250);
    await s.confirm('מחיקה', 'למחוק את ההזמנה?', 'מחיקה', { label: 'order' });
    log(!(await s.dialog().count()), 'order: both sheets closed');
    await s.reload(); log(!(await s.has('דוד כהן')), 'order: gone from the guests after a reload');
  } else log(false, 'order: a guest row to open');

  // the instant deletes that now confirm
  // shopping item and calendar item: delete is in ⋯ on their edit forms (tidy rule 6; the item keeps "עריכה")
  await s.go('/shopping/demo-s-milk/edit');
  await s.page.getByRole('button', { name: 'עוד פעולות', exact: true }).click(); await s.page.waitForTimeout(250);
  await s.dialog().getByRole('button', { name: 'מחיקה' }).click(); await s.page.waitForTimeout(350);
  log((await s.dialog().innerText()).includes('למחוק מהרשימה?'), 'shopping item: the delete asks first');
  await s.dialog().getByRole('button', { name: 'ביטול' }).click(); await s.page.waitForTimeout(200);
  log(s.path() === '/shopping/demo-s-milk/edit', 'shopping item: "ביטול" keeps it');
  await s.go('/farm/calendar/demo-c-5/edit');
  if (await s.page.getByRole('button', { name: 'עוד פעולות', exact: true }).count()) {
    await s.page.getByRole('button', { name: 'עוד פעולות', exact: true }).click(); await s.page.waitForTimeout(250);
    await s.confirm('מחיקה', 'למחוק מהיומן?', 'מחיקה', { label: 'calendar item', locator: s.dialog().getByRole('button', { name: 'מחיקה' }) });
    await s.go('/farm/calendar/demo-c-5/edit'); log(await s.has('הפריט לא נמצא'), 'calendar item: gone after a reload');
  } else log(false, 'calendar item: the delete is in ⋯ on its form');
  await s.go('/manage/events/demo-e-festival/products');
  const prod = s.page.locator('.k-row').first();
  if (await prod.count()) {
    await prod.locator('a').first().click(); await s.page.waitForTimeout(250);
    await more(); // N10: ⋯ beside "ביטול" (rule 6)
    await s.confirm('מחיקה', 'למחוק את המוצר?', 'מחיקה', { label: 'product' });
    log(s.path() === '/manage/events/demo-e-festival/products', 'product: back on the products');
  }
  // event: ⋯ beside "ביטול" on the event form (M4 keeps "עריכה")
  await s.go('/manage/events/demo-e-october/edit'); await s.page.waitForTimeout(300);
  await more();
  await s.confirm('מחיקה', 'למחוק את האירוע?', 'מחיקה', { label: 'event', text: 'הכרטיסים שכבר נרשמו נשמרים' });
  log(s.path() === '/manage/events', 'event: back on the events');
  await s.go('/manage/events/demo-e-october'); log(await s.has('האירוע לא נמצא'), 'event: gone after a reload');
  await clean(s, 'owner');
});

// ---------- manager: owner-only deletes are not offered ----------
await step('manager', async () => {
  const s = await session('manager');
  await s.go('/manage/people/demo-u-david'); log(await s.has('דוד כהן') && !(await s.moreItems()).includes('מחיקה'), 'manager: no person delete (owner only)');
  await s.go('/projects/demo-p-irrigation/edit'); await s.page.waitForTimeout(300); log(!(await s.page.getByRole('button', { name: 'עוד פעולות' }).count()), 'manager: no project delete (owner only)');
  await s.go('/manage/broadcasts/demo-b-2'); log(!(await s.page.getByRole('button', { name: 'מחיקה', exact: true }).count()), 'manager: no broadcast delete (owner only)');
  await s.go('/manage/visits/demo-vi-photo'); log((await s.moreItems()).includes('מחיקה'), 'manager: visits are deletable');
  await clean(s, 'manager');
});

// ---------- staff: no delete on manager items ----------
await step('staff', async () => {
  const s = await session('staff');
  // as in the live app, only a manager or the creator edits a task: staff opening someone else's edit link land back on the task
  await s.go('/tasks/demo-t-paint/edit'); await s.page.waitForTimeout(300); log(!(await s.page.getByLabel('מה צריך לעשות').count()) && !(await s.page.getByRole('button', { name: 'מחיקת המשימה' }).count()), 'staff: no edit or delete on a task someone else created');
  await s.go('/places/demo-p-pots'); log(!(await s.page.getByRole('button', { name: 'עוד פעולות', exact: true }).count()), 'staff: no place delete');
  if (today) { await s.go(`/tasks/demo-tpl-goats_${today}/edit`); await s.page.waitForTimeout(300); log(!(await s.page.getByLabel('מה צריך לעשות').count()) && !(await s.page.getByRole('button', { name: 'מחיקת המשימה' }).count()), 'staff: no edit or delete on a recurring day'); }
  for (const p of ['/manage/visits/demo-vi-photo', '/manage/people/demo-u-david', '/manage/vendors/demo-v-honey?edit=1', '/manage/donations/demo-d-h-jun']) {
    await s.go(p); log(!(await s.page.getByRole('button', { name: /^מחיקה$|^מחיקת / }).count()), `staff: no delete on ${p}`);
  }
  // a task of their own: the creator may delete it
  await s.go('/new?text=' + encodeURIComponent('לבדוק את הברז בלול'));
  await s.page.getByRole('button', { name: 'הוספת משימה' }).click(); await s.page.waitForTimeout(400);
  await s.go('/tasks'); const own = await s.page.locator('a', { hasText: 'לבדוק את הברז בלול' }).first().getAttribute('href').catch(() => '');
  log(!!own, 'staff: own task added');
  if (own) {
    await s.go(`${own.replace(/^\/app/, '')}/edit`);
    await viaMore(s, 'למחוק את המשימה?', 'מחיקה', { label: 'staff own task' });
    await s.reload(); log(!(await s.has('לבדוק את הברז בלול')), 'staff: own task deleted');
  }
  await clean(s, 'staff');
});

await browser.close();
console.log(`\n${fails ? 'FAIL' : 'PASS'}: delete everywhere click-through — ${passes} of ${passes + fails} checks passed`);
if (fails) process.exit(1);
