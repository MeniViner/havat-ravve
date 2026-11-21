// End-to-end smoke cycle of the v2 redesign on the Firebase emulators, as every role.
//
//   PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH npx firebase emulators:start --only firestore,auth --project demo-havat-ravve
//   node scripts/dev.mjs                                   (port 5173, or PORT=... and BASE=http://localhost:...)
//   node scripts/smoke-seed.mjs && node scripts/smoke-cycle.mjs [--only=1,2,3]
//
// Every browser context aborts all non-localhost requests and every app URL carries ?emulator (scripts/smoke/lib.mjs).
// Screenshots go to docs/smoke/redesign/shots, results to .build/smoke/results.json.
import fs from 'node:fs';
import { launch, close, session, check, setItem, results, external, adminGet, adminList, userWrite, userRead, uids, qrDataUrl, adminSet } from './smoke/lib.mjs';

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const PHOTO = 'public/assets/rava-logo.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 8000) { const t0 = Date.now(); let v; while (Date.now() - t0 < timeout) { try { v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(250); } return v; }
const row = (s, title) => s.page.locator('.k-row', { hasText: title }).first();
const noErrors = (s, what) => { const e = s.takeErrors(); check(!e.length, `${what}: no console errors`, s.role, e.slice(0, 3).join(' | ')); };
async function pickPhoto(s, trigger) {
  const [chooser] = await Promise.all([s.page.waitForEvent('filechooser', { timeout: 5000 }), trigger()]);
  await chooser.setFiles(PHOTO); await s.settle(1200);
}
async function findBy(coll, pred, timeout = 8000) { return until(async () => (await adminList(coll)).find(pred), timeout); }

// ====================================================================================================================
async function item1() {
  setItem('1 Volunteer day');
  const s = await session('yoav'); const U = uids();
  await s.go('/tasks', 1500);
  check(await s.has('הבא בתור') && await s.has('לבדוק את משאבת המים'), 'T1 tasks root: next-up card with my task', 'volunteer');
  await s.shot('1-tasks-by-place');
  await s.click('לפי זמן', { role: 'radio' }).catch(() => s.click('לפי זמן'));
  check(s.page.url().includes('view=time') && await s.has('היום'), 'T1 by time view', 'volunteer');
  await s.click('רק שלי', { role: 'radio' }).catch(() => s.click('רק שלי'));
  check(s.page.url().includes('view=mine'), 'T1 only mine view', 'volunteer');
  await s.click('לפי מקום', { role: 'radio' }).catch(() => s.click('לפי מקום'));
  // take a free task
  // (a task with a place: a row ticked under "בלי מקום" leaves the list by design, see the README's open decisions)
  await row(s, 'לטאטא את השביל').getByRole('button', { name: 'לקחת' }).click(); await s.settle(800);
  const taken = await until(async () => (await adminGet('tasks/t-race2'))?.assignee?.uid === U.yoav);
  check(taken && await row(s, 'לטאטא את השביל').getByText('שלך').count() > 0, 'take a free task (assignee saved, row tagged שלך)', 'volunteer');
  // mark done: struck through and stays
  await s.page.getByLabel('סימון בוצע: לטאטא את השביל').first().click();
  await s.settle(700);
  const doneSaved = await until(async () => (await adminGet('tasks/t-race2'))?.done === true);
  check(doneSaved && await s.has('בוצע: לטאטא את השביל'), 'mark done: saved, toast בוצע', 'volunteer');
  check(await row(s, 'לטאטא את השביל').evaluate((el) => el.classList.contains('k-row--done')).catch(() => false), 'done row stays in place, struck through (T4)', 'volunteer');
  await s.shot('1-task-done-struck');
  // T5 add a task through the capture bar
  await s.page.getByPlaceholder('משימה או קנייה חדשה').fill('לנקות את המטבח'); await s.page.keyboard.press('Enter'); await s.settle(800);
  check(s.path() === '/new' && await s.has('הוספת משימה'), 'capture bar opens T5 with the text', 'volunteer');
  await s.click('אחר', { exact: true }); await s.click('המחסן', { exact: true });
  await s.click('היום', { exact: true });
  await s.click('הוספת משימה', { role: 'button' });
  const added = await findBy('tasks', (t) => t.title === 'לנקות את המטבח');
  check(added && added.location?.placeId === 'pl-shed' && added.createdBy?.uid === U.yoav && s.path() === '/tasks', 'T5 task saved with place and date, back on T1', 'volunteer', added ? '' : 'not found');
  // photo on the new task (T3 "הוספת תמונה למשימה")
  if (added) {
    await s.go('/tasks/' + added.id, 1200);
    await pickPhoto(s, () => s.click('הוספת תמונה למשימה'));
    const withPhoto = await until(async () => ((await adminGet('tasks/' + added.id))?.photo || '').startsWith('data:image'));
    check(withPhoto, 'T3 add a photo to the task (saved as an image)', 'volunteer');
    await s.shot('1-T3-task-photo');
  }
  // done with a photo (C1 / done photo screen) on my assigned task
  await s.go('/tasks/t-yoav', 1000);
  await s.click('עם צילום');
  check(s.path() === '/tasks/t-yoav/done', 'done with photo opens the photo screen', 'volunteer');
  await s.shot('1-done-photo-screen');
  noErrors(s, 'tasks');

  // shopping
  await s.go('/shopping', 1200);
  check(await s.has('קניות') && await s.has('חלב'), 'S1 shopping list renders', 'volunteer');
  await s.page.getByPlaceholder('להוסיף לסופר').fill('שמן זית'); await s.page.keyboard.press('Enter'); await s.settle(800);
  check(s.path() === '/new' && await s.has('הוספה לסופר'), 'S5 opens with the text and the list', 'volunteer');
  await s.click('הוספה לסופר', { role: 'button' });
  const oil = await findBy('shopping', (i) => i.title === 'שמן זית' && !i.bought);
  check(oil && s.path() === '/shopping', 'S5 item saved, back on S1', 'volunteer');
  const chip = s.page.locator('.shopping-chips button').first(); const chipText = (await chip.innerText().catch(() => '')).trim();
  await chip.click().catch(() => {}); await s.settle(800);
  const chipItem = chipText && await findBy('shopping', (i) => i.title === chipText && !i.bought);
  check(chipItem, `suggestion chip adds "${chipText}"`, 'volunteer');
  await s.shot('1-S1-shopping');
  await s.page.getByLabel(/: חלב$/).first().click(); await s.settle(800);
  const milk = await until(async () => (await adminGet('shopping/s-milk'))?.bought === true);
  check(milk, 'mark bought (saved)', 'volunteer');
  await s.reload();
  check(await s.has('נקנה היום'), 'bought item listed under נקנה היום after reload', 'volunteer');
  noErrors(s, 'shopping');

  // the farm tab
  await s.go('/farm', 1200);
  check(await s.has('החווה') && await s.has('פסטיבל החורף'), 'F1 farm tab: presence, week, next event', 'volunteer');
  await s.shot('1-F1-farm');
  await s.click('ליומן'); check(s.path().startsWith('/farm/calendar'), 'farm calendar opens', 'volunteer');
  await s.go('/farm/today', 900); check(await s.has('יואב סיים: לטאטא את השביל') && await s.has('יואב קנה חלב'), 'F5 today feed lists what was done', 'volunteer');
  noErrors(s, 'farm');

  // notifications bell
  await s.go('/tasks', 1000);
  await s.page.getByRole('button', { name: /^התראות/ }).first().click().catch(() => s.page.getByRole('link', { name: /^התראות/ }).first().click());
  await s.settle(700);
  check(s.path() === '/notifications', 'bell opens notifications', 'volunteer');
  // profile
  await s.go('/me', 1000);
  check(await s.has('יואב פרץ') && await s.has('מתנדב'), 'L6 profile renders', 'volunteer');
  await s.shot('1-L6-profile');
  await s.click('עריכה'); await s.settle(500);
  const phone = s.page.getByLabel('טלפון').first(); await phone.fill('052-111-2233');
  await s.click('שמירה', { role: 'button' });
  const saved = await until(async () => (await adminGet('users/' + U.yoav))?.phone === '052-111-2233');
  check(saved, 'C13 profile edit saved', 'volunteer');
  noErrors(s, 'farm, notifications, profile');
  await s.done();
}

// ====================================================================================================================
async function item2() {
  setItem('2 Manager day');
  const U = uids();
  const s = await session('dana', { ctx: { geolocation: { latitude: 31.3519, longitude: 34.9716 }, permissions: ['camera', 'geolocation'] } });
  await s.go('/manage', 1500);
  check(await s.has('ניהול') && await s.has('הודעות לצוות'), 'M1 manage tab renders', 'manager');
  await s.shot('2-M1-manage');
  // C4 assign a task to someone
  await s.go('/tasks/t-assign', 1000);
  await s.click('על מי', { exact: true }).catch(() => {});
  if (!s.path().endsWith('/assign')) await s.go('/tasks/t-assign/assign', 900);
  check(s.path() === '/tasks/t-assign/assign', 'C4 opens from the task', 'manager');
  await s.click('יואב פרץ'); await s.shot('2-C4-assign');
  await s.click('להעביר ליואב', { role: 'button' });
  const assigned = await until(async () => (await adminGet('tasks/t-assign'))?.assignee?.uid === U.yoav);
  check(assigned && s.path() === '/tasks/t-assign', 'C4 assigned to Yoav (saved), back on the task', 'manager');
  // recurring templates
  await s.go('/manage/recurring', 900); await s.click('חדשה');
  await s.fill('מה עושים', 'האכלת התרנגולות'); await s.fill('עד איזו שעה', '08:00'); await s.fill('איפה', 'הגינה');
  await s.click('שמירה', { role: 'button' });
  const tpl = await findBy('task_templates', (t) => t.title === 'האכלת התרנגולות');
  check(tpl && tpl.placeId === 'pl-garden' && tpl.time === '08:00' && s.path() === '/manage/recurring', 'L2 recurring template saved with place and time', 'manager');
  if (tpl) {
    await s.go('/manage/recurring/' + tpl.id, 900); await s.page.getByRole('switch', { name: 'פעילה' }).click(); await s.click('שמירה', { role: 'button' });
    check(await until(async () => (await adminGet('task_templates/' + tpl.id))?.active === false), 'L2 template turned off (saved)', 'manager');
  }
  // places
  await s.go('/places', 900); await s.click('אני עומד כאן, לשמור מקום', { wait: 1200 });
  check(/^\/places\/[^/]+$/.test(s.path()), 'L3 save a place from the current position opens L4', 'manager');
  await s.page.getByLabel('שם המקום').fill('ליד הלול'); await s.click('שמירה', { role: 'button' });
  const place = await findBy('places', (p) => p.name === 'ליד הלול');
  check(place && Math.abs(place.lat - 31.3519) < 0.001, 'L4 place saved with the position', 'manager');
  // projects (managers only, above tasks)
  await s.go('/tasks', 1000);
  check(await s.has('פרויקטים'), 'P1 projects block shows above the tasks for a manager', 'manager');
  await s.go('/projects/new', 900);
  await s.fill('לאן רוצים להגיע', 'פינת ישיבה ליד הבריכה'); await s.fill('עד מתי', '');
  await s.page.locator('.projects-draft__input').first().fill('לקנות עצים');
  await s.click('צעד נוסף'); await s.page.locator('.projects-draft__input').nth(1).fill('לבנות ספסל');
  await s.click('יצירת הפרויקט', { role: 'button', wait: 1200 });
  const proj = await findBy('projects', (p) => p.title === 'פינת ישיבה ליד הבריכה');
  check(proj && /^\/projects\/[^/]+$/.test(s.path()) && await s.has('לבנות ספסל'), 'P5 project created with two steps, P3 opens', 'manager');
  await s.shot('2-P3-project');
  // people directory: invite by email (N13), block/unblock a guest
  await s.go('/manage/people', 1000);
  check(await s.has('אנשים') && await s.has('אורלי לוי'), 'M8 people directory renders', 'manager');
  await s.click('תפקיד לפי כתובת מייל');
  await s.page.getByLabel('כתובת Google של האדם').fill('noga.smoke@example.com');
  await s.click('שמירת התפקיד', { role: 'button' });
  check(await until(async () => (await adminGet('role_invites/noga.smoke@example.com'))?.role === 'staff'), 'N13 role invite by email saved (staff)', 'manager');
  await s.go('/manage/people/' + U.michal, 1000); await s.click('חסימה', { role: 'button' });
  check(await until(async () => (await adminGet('users/' + U.michal))?.status === 'blocked'), 'M9 manager blocks a guest', 'manager');
  await s.reload(); await s.click('שחרור חסימה', { role: 'button' });
  check(await until(async () => (await adminGet('users/' + U.michal))?.status === 'active'), 'M9 manager unblocks the guest', 'manager');
  await s.go('/manage/people/' + U.orly, 1000);
  check((await s.page.getByRole('button', { name: 'חסימה' }).count()) === 0, 'M9 a manager cannot block a volunteer (owner only)', 'manager');
  // broadcast (B1/B2)
  await s.go('/manage/broadcasts/new', 1000);
  await s.page.getByLabel('תוכן ההודעה').fill('מחר בשבע בבוקר מתחילים לקטוף זיתים. מי שיכול להגיע, שיגיע.');
  await s.shot('2-B1-compose');
  await s.click('שליחה ל־', { role: 'button', wait: 1500 });
  const bc = await findBy('broadcasts', (b) => (b.text || '').includes('לקטוף זיתים'));
  check(bc && /\/manage\/broadcasts/.test(s.path()), 'B1 broadcast sent (saved)', 'manager', bc ? `recipients ${bc.recipients?.length}` : '');
  // payments: bulk approval in the inbox (trust-based)
  await s.go('/manage/inbox', 1200); await s.click('תשלומים', { exact: false });
  await s.shot('2-M2-payments');
  await s.click('אישור כל התשלומים', { wait: 1500 });
  const paid = await until(async () => (await adminGet('donations/dn-michal'))?.paymentStatus === 'paid' && (await adminGet('tickets/tk-past1'))?.paymentStatus === 'paid' && (await adminGet('tickets/tk-past2'))?.paymentStatus === 'paid');
  check(paid, 'M2 bulk approval: donation and both tickets paid', 'manager');
  check(await until(async () => (await adminGet('notifications/nt-dn'))?.handled === true && (await adminGet('notifications/nt-tk'))?.handled === true), 'M2 approved items leave the queue (handled)', 'manager');
  noErrors(s, 'manager day');

  // a volunteer reads the broadcast and sees the task put on him
  const y = await session('yoav');
  await y.go('/tasks', 1500);
  check(await y.has('לקטוף זיתים'), 'B4 the broadcast card shows on the volunteer root', 'volunteer');
  await y.shot('2-B4-volunteer-card');
  await y.click('קראתי', { role: 'button', wait: 900 });
  const receipt = bc && await until(async () => (await adminGet(`broadcasts/${bc.id}/reads/${U.yoav}`))?.at);
  check(receipt && !(await y.has('לקטוף זיתים')), 'B3 read receipt saved, card leaves', 'volunteer');
  await y.go('/notifications', 1200);
  check(await y.has('להביא שק מלט מהרכב'), 'C1 the assignment reached the volunteer\'s notifications', 'volunteer');
  noErrors(y, 'volunteer reads');
  await y.done();
  if (bc) { await s.go('/manage/broadcasts/' + bc.id, 1200); check(await s.has('יואב'), 'B2 the manager sees who read it', 'manager'); }

  // the invited person signs in for the first time (C9) and lands in the team app as a volunteer
  const n = await session('noga');
  await n.go('/', 2000);
  check(await n.has('ברוך הבא לצוות') && await n.has('דנה הוסיפה אותך'), 'C9 first entry opens for the invited person, names who added them', 'new volunteer');
  await n.page.getByLabel('השם שלך בעברית').fill('נגה שמיר'); await n.page.getByLabel('טלפון').fill('052-444-5566');
  await n.shot('2-C9-first-entry');
  await n.click('כניסה לאפליקציה', { role: 'button', wait: 2500 });
  const np = await until(async () => adminGet('users/' + U.noga));
  check(np?.role === 'staff' && np?.status === 'active', 'C9 profile created with the invited role (staff)', 'new volunteer');
  await n.go('/tasks', 1500);
  check(await n.has('משימות') && !(await n.has('ניהול')), 'the new volunteer has the team app without the manage tab', 'new volunteer');
  noErrors(n, 'first entry');
  await n.done();

  // owner blocks and unblocks a volunteer; the activity feed shows the day
  const o = await session('owner');
  await o.go('/manage/people/' + U.orly, 1200); await o.click('חסימה', { role: 'button' });
  check(await until(async () => (await adminGet('users/' + U.orly))?.status === 'blocked'), 'M9 owner blocks a volunteer', 'owner');
  await o.reload(); await o.click('שחרור חסימה', { role: 'button' });
  check(await until(async () => (await adminGet('users/' + U.orly))?.status === 'active'), 'M9 owner unblocks the volunteer', 'owner');
  await o.go('/manage/activity', 1500);
  check(await o.has('דנה העבירה: להביא שק מלט מהרכב') && await o.has('דנה אישרה תשלום') && await o.has('דנה חסמה: מיכל בר') && !/[a-z]{4,}/.test((await o.text()).replace(/\S+@\S+/g, '')), 'N14 activity feed lists the day, every line in Hebrew', 'owner');
  await o.shot('2-N14-activity');
  noErrors(o, 'owner');
  await o.done(); await s.done();
}

// ====================================================================================================================
const jkey = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' }).format(d);
const plusDays = (n) => jkey(new Date(Date.now() + n * 86400e3));
/** The WhatsApp link the app tried to open (aborted by the safety block): the app link inside it. */
const lastWaLink = (re) => { const u = [...external].reverse().find((x) => /wa\.me|whatsapp/.test(x) && re.test(decodeURIComponent(x))); return u ? decodeURIComponent(u).match(re)?.[0] : null; };
const EV = 'ערב קטיף בחווה';
const ctx3 = {};

async function item3() {
  setItem('3 Event lifecycle with a vendor');
  const U = uids();
  const m = await session('dana');
  // the manager creates the event a few days ahead and publishes it
  await m.go('/manage/events/new', 1200);
  await m.fill('שם האירוע', EV);
  await m.page.locator('input[type=date]').fill(plusDays(4));
  await m.fill('משעה', '17:00'); await m.fill('עד שעה', '23:00'); await m.fill('מחיר לכרטיס, בשקלים', '40');
  await m.page.getByRole('switch', { name: 'מפורסם לאורחים' }).click();
  await m.click('שמירה', { role: 'button', wait: 1500 });
  const ev = await findBy('events', (e) => e.title === EV);
  check(ev && ev.published && /^\/manage\/events\/[^/]+$/.test(m.path()), 'N11 event created and published, M4 opens', 'manager');
  if (!ev) return;
  ctx3.ev = ev;
  // staffing (V4): Yoav at the gate, Orly at the stall
  await m.go(`/manage/events/${ev.id}/staffing`, 1200);
  for (const [station, who] of [['שער', 'יואב פרץ'], ['דוכן', 'אורלי לוי']]) {
    await m.click(`לשבץ מישהו ל${station}`); await m.page.getByRole('dialog').getByText(who).click(); await m.page.getByRole('dialog').getByRole('button', { name: 'שיבוץ' }).click(); await m.settle(900);
  }
  const staffing = await adminList(`events/${ev.id}/staffing`);
  check(staffing.some((s) => s.people?.some((p) => p.uid === U.yoav)) && staffing.some((s) => s.people?.some((p) => p.uid === U.orly)), 'V4 crew staffed (gate, stall)', 'manager');
  await m.shot('3-V4-staffing');
  // vendor pool (V1/V2) and the invite (N8) with the access link
  await m.go('/manage/vendors?new=1', 1200);
  await m.fill('שם הדוכן', 'גבינות העמק'); await m.fill('איש קשר', 'רז כהן'); await m.fill('טלפון', '052-777-8899'); await m.fill('מה מוכר', 'גבינות ויין');
  await m.click('חשמל', { exact: true }); await m.click('שולחן', { exact: true });
  await m.click('הוספה למאגר', { role: 'button', wait: 1500 });
  const vendor = await findBy('vendors', (v) => v.name === 'גבינות העמק');
  check(vendor && vendor.external && /\/manage\/vendors\//.test(m.path()), 'V1 vendor added to the pool, V2 opens', 'manager');
  if (!vendor) return;
  ctx3.vendor = vendor;
  await m.click('הזמנה לאירוע', { wait: 600 }); await m.page.getByRole('dialog').getByText(EV).click(); await m.settle(1500);
  const rec = await until(async () => adminGet(`events/${ev.id}/vendors/${vendor.id}`));
  const invite = await findBy('vendor_invites', (i) => i.vendorId === vendor.id && i.role === 'owner' && i.active);
  const link = lastWaLink(/\/app\/vendor[^\s]*\?k=[a-z0-9]+/);
  check(rec?.status === 'invited' && invite && link && link.includes(invite.code), 'V2 invite to the event: record invited, access link sent in WhatsApp', 'manager', link || 'no link');
  noErrors(m, 'event setup');

  // the vendor opens the link and signs in (claim through ?k=)
  const v = await session('raz');
  await v.go(link.replace(/^\/app/, ''), 3000);
  const vp = await until(async () => adminGet('users/' + U.raz));
  check(vp?.role === 'vendor' && vp?.vendorId === vendor.id && !vp.helper, 'vendor link claimed: profile bound to the stall', 'vendor');
  check(await v.has('רוצים אותך ב' + EV) && await v.has('מגיעים'), 'D1 invitation shows after the claim', 'vendor');
  await v.shot('3-D1-invite');
  await v.click('מגיעים', { exact: true, wait: 900 });
  check(v.path().endsWith('/needs'), 'D1 מגיעים opens D2', 'vendor');
  await v.click('מים', { exact: true }); await v.page.getByLabel('משהו שחשוב שנדע').fill('מגיעים עם מקרר');
  await v.shot('3-D2-needs');
  await v.click('שליחה לחווה', { role: 'button', wait: 1200 });
  const conf = await until(async () => { const r = await adminGet(`events/${ev.id}/vendors/${vendor.id}`); return r?.status === 'confirmed' && r; });
  check(conf && conf.needs?.includes('water') && conf.note === 'מגיעים עם מקרר', 'D2 arrival details saved (confirmed, needs, note)', 'vendor');
  await v.go('/vendor', 1500);
  check(await v.has(EV) && await v.has('אישרת הגעה'), 'D3 home shows the confirmed event', 'vendor');
  check((await v.page.locator('.k-bottomnav a, .k-bottomnav button, nav button, nav a').count()) <= 2 || (await v.has('האירועים') && await v.has('הדוכן שלי') && !(await v.has('משימות'))), 'vendor sees 2 tabs only', 'vendor');
  // helper (D8)
  await v.go('/vendor/stall', 1200); await v.click('לצרף עוזר');
  await v.page.getByLabel('שם', { exact: true }).fill('תמר כהן'); await v.page.getByLabel('טלפון').fill('052-123-4567');
  await v.click('שליחת קישור בוואטסאפ', { role: 'button', wait: 1500 });
  const hInvite = await findBy('vendor_invites', (i) => i.vendorId === vendor.id && i.role === 'helper' && i.active);
  const hLink = lastWaLink(/\/app\/vendor[^\s]*\?k=[a-z0-9]+/);
  check(hInvite && hLink?.includes(hInvite.code) && await v.has('תמר כהן'), 'D8 helper added, link sent in WhatsApp', 'vendor');
  noErrors(v, 'vendor before the day');
  await v.done();
  // the helper claims her link
  const h = await session('tamar');
  await h.go(hLink.replace(/^\/app/, ''), 3000);
  const hp = await until(async () => adminGet('users/' + U.tamar));
  check(hp?.role === 'vendor' && hp?.helper === true && hp?.vendorId === vendor.id, 'helper link claimed: helper of the stall', 'helper');
  await h.go('/vendor', 1500);
  check(await h.has('בדוכן של') && await h.has(EV), 'D11 helper home', 'helper');
  noErrors(h, 'helper');
  await h.done();

  // a guest orders two tickets and marks them paid (legacy guest flow)
  const g = await session('michal');
  await g.go(`/events/${ev.id}/order`, 1500);
  await g.page.getByRole('button', { name: 'עוד', exact: true }).click(); await g.settle(200);
  await g.page.locator('select').first().selectOption('whatsapp'); await g.settle(200);
  await g.click('הזמנה ·', { wait: 2000 });
  const order = await until(async () => { const t = (await adminList('tickets')).filter((x) => x.eventId === ev.id && x.ownerUid === U.michal); return t.length ? t : null; });
  check(order?.length === 2 && order.every((t) => t.paymentStatus === 'pending'), 'guest orders 2 tickets (pending)', 'guest', `${order?.length || 0} tickets`);
  await g.go('/me', 1500);
  await g.click('העברתי', { wait: 1500 });
  const claimed = await until(async () => (await adminList('tickets')).filter((x) => x.eventId === ev.id && x.ownerUid === U.michal).every((t) => t.paymentStatus === 'claimed'));
  check(claimed, 'guest marks the order paid (claimed, trust-based)', 'guest');
  noErrors(g, 'guest order');
  await g.done();

  // the day comes: the manager moves the event to today (N11 edit)
  await m.go(`/manage/events/${ev.id}/edit`, 1200);
  await m.page.locator('input[type=date]').fill(jkey(new Date()));
  await m.click('שמירה', { role: 'button', wait: 1500 });
  check(await until(async () => jkey(new Date((await adminGet('events/' + ev.id)).start)) === jkey(new Date())), 'N11 event date edited to today', 'manager');
  await m.done();
  await item3day();
}

async function item3day() {
  const U = uids(); const { ev, vendor } = ctx3;
  const tickets = (await adminList('tickets')).filter((t) => t.eventId === ev.id).sort((a, b) => a.index - b.index);
  // crew: the event tab and the gate
  const y = await session('yoav');
  await y.go('/tasks', 1500);
  check(await y.has('אירוע') && (await y.page.getByRole('button', { name: 'אירוע' }).count() + await y.page.getByRole('link', { name: 'אירוע' }).count()) > 0, 'the אירוע tab appears on event day for crew', 'volunteer (crew)');
  await y.go('/event', 1200);
  check(await y.has(EV) && await y.has('שער'), 'E1 event home', 'volunteer (crew)');
  await y.shot('3-E1-event-home');
  await y.go('/event/gate', 2500);
  const scan = async (code) => { await y.page.evaluate((u) => window.__smokeQr(u), code ? await qrDataUrl(code) : ''); };
  await scan(`HR1|${tickets[0].id}|${tickets[0].secret}`); await y.settle(1500);
  check(await y.has('מאושר') && await y.has('כניסה ראשונה'), 'E3 valid ticket: approved, first entry', 'volunteer (crew)');
  await y.shot('3-E3-scan-valid');
  check(await until(async () => (await adminGet('tickets/' + tickets[0].id))?.entries === 1), 'E3 entry saved on the ticket', 'volunteer (crew)');
  await scan(''); await y.settle(4500);
  await scan(`HR1|${tickets[0].id}|${tickets[0].secret}`); await y.settle(1500);
  check(await y.has('יצא וחזר'), 'E3 the same ticket again: second entry, "יצא וחזר"', 'volunteer (crew)');
  await scan(''); await y.settle(4500);
  await scan('HR1|no-such-ticket|0000'); await y.settle(1500);
  check(await y.has('לא נמצא'), 'E5 unknown ticket: לא נמצא', 'volunteer (crew)');
  await y.shot('3-E5-scan-unknown');
  await scan(''); await y.click('לסרוק שוב', { role: 'button', wait: 1500 });
  await scan(`HR1|${tickets[1].id}|deadbeef0000`); await y.waitText('ברקוד לא תקין', 5000);
  check(await y.has('ברקוד לא תקין'), 'E5 forged code: ברקוד לא תקין', 'volunteer (crew)', (await y.text()).replace(/\n+/g, ' | ').slice(0, 200));
  await scan(''); await y.click('לסרוק שוב', { role: 'button', wait: 800 });
  noErrors(y, 'gate');
  await y.done();

  // the vendor on the day: check-in and a request
  const v = await session('raz');
  await v.go('/vendor', 1500);
  check(await v.has('היום האירוע') && await v.has('הגעתי לחווה'), 'D5 event day for the vendor', 'vendor');
  await v.shot('3-D5-vendor-day');
  await v.click('הגעתי לחווה', { role: 'button', wait: 1200 });
  check(await until(async () => (await adminGet(`events/${ev.id}/vendors/${vendor.id}`))?.arrivedAt), 'D5 "הגעתי לחווה" saved (arrivedAt)', 'vendor');
  check(await v.has('הגעתם ב־') && await v.has('צריך משהו?'), 'D6 live view after check-in', 'vendor');
  await v.click('החשמל נפל', { wait: 1200 });
  const req = await findBy(`events/${ev.id}/vendor_requests`, (r) => r.kind === 'power' && !r.closedAt);
  check(req && await v.has('ביקשת: החשמל נפל'), 'D6 request "החשמל נפל" sent', 'vendor');
  await v.shot('3-D6-vendor-request');

  // managers see it and handle it
  const m = await session('dana');
  await m.go('/manage/inbox', 1500);
  check(await m.has('גבינות העמק · חשמל'), 'M2 the vendor request reaches the manager inbox', 'manager');
  await m.go(`/manage/events/${ev.id}/vendors/today`, 1500);
  check(await m.has('ביקשו משהו') && await m.has('החשמל נפל'), 'V7 vendors today lists the open request', 'manager');
  await m.click('טופל', { role: 'button', wait: 1200 });
  check(await until(async () => (await adminGet(`events/${ev.id}/vendor_requests/${req.id}`))?.closedAt), 'V7 request handled (closed)', 'manager');
  await m.shot('3-V7-vendors-today');
  await v.go('/vendor', 1500);
  check(!(await v.has('ביקשת: החשמל נפל')), 'the vendor sees the request closed', 'vendor');
  await v.click('נגמר לי משהו', { wait: 1200 });
  await m.go('/manage/inbox', 1500);
  check(await m.has('גבינות העמק · נגמר לי משהו'), 'M2 a "נגמר לי משהו" request reads in Hebrew', 'manager');
  noErrors(v, 'vendor on the day');
  await v.done();

  // close the event with cash, reopen within the window, close again
  await m.go(`/manage/events/${ev.id}/close`, 1500);
  await m.shot('3-Y5-close');
  await m.click('ספירה', { exact: true }); await m.page.getByLabel('כמה נספר (₪)').fill('320'); await m.page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click(); await m.settle(900);
  check(await until(async () => (await adminGet(`events/${ev.id}/counters/cash`))?.gate?.amount === 320), 'Y5 gate cash counted (saved)', 'manager');
  await m.click('סגירת האירוע', { role: 'button', wait: 1500 });
  check(await until(async () => (await adminGet('events/' + ev.id))?.closed?.at), 'Y5 event closed, the summary opens', 'manager');
  await m.go(`/manage/events/${ev.id}/close`, 1500);
  check(await m.has('אפשר לפתוח מחדש עד') && await m.has('פתיחה מחדש'), 'Y5 reopen window shown', 'manager');
  await m.click('פתיחה מחדש', { role: 'button', wait: 1500 });
  check(await until(async () => (await adminGet('events/' + ev.id))?.closed === null), 'Y5 reopened inside the window', 'manager');
  await m.go(`/manage/events/${ev.id}/close`, 1500);
  await m.click('סגירת האירוע', { role: 'button', wait: 1500 });
  check(await until(async () => (await adminGet('events/' + ev.id))?.closed?.at), 'Y5 closed again', 'manager');
  // after-event summaries
  await m.go(`/manage/events/${ev.id}?tab=summary`, 1500);
  check(await m.has('נרשמו') && await m.has('הגיעו'), 'M7 after-event summary for the manager', 'manager');
  await m.shot('3-M7-summary');
  noErrors(m, 'manager on the day');
  await m.done();
  const y2 = await session('yoav');
  await y2.go('/tasks', 1500);
  check(!(await y2.page.getByRole('button', { name: 'אירוע' }).count()) && !(await y2.page.getByRole('link', { name: 'אירוע' }).count()), 'after close the אירוע tab leaves the crew\'s phones', 'volunteer (crew)');
  await y2.go('/event/gate', 1500);
  check(!(await y2.has('מאושר')), 'gate closed after the event', 'volunteer (crew)');
  noErrors(y2, 'crew after close');
  await y2.done();
  const v2 = await session('raz');
  await v2.go(`/vendor/events/${ev.id}/summary`, 1500);
  check(await v2.has('שליחה לחווה'), 'D9 after-event summary for the vendor', 'vendor');
  await v2.click('בסדר', { exact: true }); await v2.page.getByLabel('מה היה עוזר לך בפעם הבאה').fill('חשמל קרוב לדוכן'); await v2.click('שליחה לחווה', { role: 'button', wait: 1200 });
  check(await until(async () => (await adminGet(`events/${ev.id}/vendors/${vendor.id}`))?.feedback?.text === 'חשמל קרוב לדוכן'), 'D9 vendor feedback saved', 'vendor');
  await v2.shot('3-D9-vendor-summary');
  noErrors(v2, 'vendor after the event');
  await v2.done();
}

async function item4() {
  setItem('4 Role boundaries');
  const U = uids();
  const y = await session('yoav');
  for (const path of ['/manage', '/manage/people', '/projects', '/manage/recurring', '/manage/events']) {
    await y.go(path, 1200);
    check(y.path() === '/tasks', `volunteer opening ${path} is sent to /tasks`, 'volunteer');
  }
  check(!(await y.has('ניהול')), 'volunteer has no manage tab', 'volunteer');
  noErrors(y, 'volunteer redirects');
  await y.done();
  const denied = (st) => st === 403;
  check(denied(await userWrite('yoav', 'settings/app', { guestIntro: 'x' })), 'rules refuse a volunteer writing settings/app', 'volunteer');
  check(denied(await userWrite('yoav', 'task_templates/smoke-x', { title: 'x' })), 'rules refuse a volunteer writing a recurring template', 'volunteer');
  check(denied(await userWrite('yoav', 'users/' + U.yoav, { role: 'manager', updatedAt: new Date().toISOString() })), 'rules refuse a volunteer making himself a manager', 'volunteer');
  check(denied(await userRead('yoav', 'users/' + U.michal)), 'rules refuse a volunteer reading a guest profile', 'volunteer');
  check(denied(await userRead('yoav', 'tasks/t-mgr')), 'rules refuse a volunteer reading a managers-only task', 'volunteer');
  check(denied(await userRead('yoav', 'notifications/nt-visit')), 'rules refuse a volunteer reading the manager inbox', 'volunteer');
  const proj = (await adminList('projects'))[0];
  if (proj) check(denied(await userRead('yoav', 'projects/' + proj.id)), 'rules refuse a volunteer reading a project', 'volunteer');

  const vendor = (await adminList('vendors')).find((v) => v.name === 'גבינות העמק');
  if (vendor) {
    const v = await session('raz');
    for (const path of ['/tasks', '/manage', '/shopping', '/farm', '/manage/vendors']) {
      await v.go(path, 1200);
      check(v.path() === '/vendor', `vendor opening ${path} is sent to /vendor`, 'vendor');
    }
    check(await v.has('האירועים') && await v.has('הדוכן שלי') && !(await v.has('משימות')) && !(await v.has('קניות')), 'vendor nav: 2 tabs only', 'vendor');
    await v.shot('4-vendor-two-tabs');
    noErrors(v, 'vendor redirects');
    await v.done();
    await adminGet('vendors/' + vendor.id);
    const other = await findBy('vendors', (x) => x.id !== vendor.id, 100) || null;
    check(denied(await userRead('raz', 'users/' + U.yoav)), 'rules refuse a vendor reading a team profile', 'vendor');
    check(denied(await userRead('raz', 'tasks/t-flag')), 'rules refuse a vendor reading tasks', 'vendor');
    check(denied(await userRead('raz', `vendors/${vendor.id}/private/main`)), 'rules refuse a vendor reading the team notes on the stall', 'vendor');
    if (other) check(denied(await userRead('raz', 'vendors/' + other.id)), 'rules refuse a vendor reading another stall', 'vendor');
    check(!denied(await userRead('raz', 'vendors/' + vendor.id)), 'the vendor reads its own stall', 'vendor');
    // helper limits
    const h = await session('tamar');
    await h.go('/vendor/stall', 1500);
    check((await h.page.getByText('עריכה', { exact: true }).count()) === 0 && (await h.page.getByText('לצרף עוזר').count()) === 0, 'helper: stall is read-only (no edit, no adding helpers)', 'helper');
    await h.go('/vendor/stall/helpers/new', 1500);
    check(h.path() === '/vendor/stall', 'helper opening the add-helper form is sent back to the stall', 'helper');
    noErrors(h, 'helper limits');
    await h.done();
    check(denied(await userWrite('tamar', 'vendors/' + vendor.id, { name: 'שונה', updatedAt: new Date().toISOString() })), 'rules refuse a helper editing the stall', 'helper');
  } else check(false, 'vendor from item 3 exists', 'runner');

  // pending and blocked accounts, the guest
  const p = await session('yossi');
  await p.go('/tasks', 1500);
  check(!(await p.has('משימה או קנייה חדשה')) && await p.has('הכרטיסים שלי'), 'pending account gets the guest app, not the team screens', 'pending');
  noErrors(p, 'pending'); await p.done();
  check(denied(await userRead('yossi', 'tasks/t-flag')), 'rules refuse a pending account reading tasks', 'pending');
  const b = await session('avi');
  await b.go('/tasks', 1500);
  check(await b.has('החשבון הושעה') && await b.has('יציאה מהחשבון'), 'X2 suspended screen for a blocked account', 'blocked');
  await b.shot('4-X2-suspended');
  await b.go('/manage', 1200); check(await b.has('החשבון הושעה'), 'X2 on every route', 'blocked');
  noErrors(b, 'blocked'); await b.done();
  check(denied(await userRead('avi', 'tasks/t-flag')), 'rules refuse a blocked account reading tasks', 'blocked');
  const g = await session('michal');
  for (const path of ['/tasks', '/manage', '/shopping', '/farm']) {
    await g.go(path, 1200);
    check(!(await g.has('משימה או קנייה חדשה')) && !(await g.has('ניהול')) && await g.has('אירועים קרובים'), `guest opening ${path} sees the guest home`, 'guest');
  }
  await g.shot('4-guest-no-team');
  noErrors(g, 'guest'); await g.done();
  check(denied(await userRead('michal', 'tasks/t-flag')), 'rules refuse a guest reading tasks', 'guest');
  check(denied(await userWrite('michal', 'shopping/smoke-g', { title: 'x' }, 'PATCH')), 'rules refuse a guest writing shopping', 'guest');
}

async function item5() {
  setItem('5 Offline');
  // the browser logs each failed request while there is no network (Firestore's channel): expected here
  const s = await session('orly', { allowErrors: [/ERR_INTERNET_DISCONNECTED/] });
  await s.go('/tasks', 1800);
  await s.ctx.setOffline(true); await s.settle(1200);
  check(await s.has('אין קליטה'), 'C8 offline strip shows', 'volunteer');
  await row(s, 'להחליף את הדגל ליד הכניסה').getByRole('button', { name: 'לקחת' }).click(); await s.settle(800);
  await s.page.getByLabel('סימון בוצע: לתקן את הברז').first().click(); await s.settle(800);
  // shopping through the in-app nav (no page load while offline)
  await s.page.getByRole('button', { name: 'קניות' }).last().click(); await s.settle(800);
  await s.page.getByPlaceholder('להוסיף לסופר').fill('נייר טואלט'); await s.page.keyboard.press('Enter'); await s.settle(700);
  await s.click('הוספה לסופר', { role: 'button', wait: 900 });
  const strip = await s.page.locator('.k-strip-btn').first().innerText().catch(() => '');
  const n = Number((strip.match(/(\d+) פעולות/) || [])[1] || 0);
  check(n >= 3, 'C8 strip counts the kept writes', 'volunteer', strip.replace(/\n/g, ' '));
  await s.shot('5-C8-offline-strip');
  await s.page.locator('.k-strip-btn').first().click(); await s.settle(900);
  check(s.path() === '/offline' && await s.has('מחכה'), 'C8 queue screen lists what waits', 'volunteer');
  await s.shot('5-C8-offline-queue');
  const before = await adminGet('tasks/t-flag');
  check(!before?.assignee, 'nothing reached the server while offline', 'volunteer');
  await s.ctx.setOffline(false); await s.settle(1500);
  const U = uids();
  const synced = await until(async () => (await adminGet('tasks/t-flag'))?.assignee?.uid === U.orly && (await adminGet('tasks/t-tap'))?.done === true && (await adminList('shopping')).some((i) => i.title === 'נייר טואלט'), 12000);
  check(synced, 'back online: take, done and the new item sync to the server', 'volunteer');
  await until(async () => !(await s.has('אין קליטה')), 5000);
  check(!(await s.has('אין קליטה')), 'C8 strip leaves when the network is back', 'volunteer');
  await s.go('/tasks', 1500);
  const nextUp = await s.page.locator('.k-nextup').first().innerText().catch(() => '');
  check(nextUp.includes('להחליף את הדגל ליד הכניסה') || await row(s, 'להחליף את הדגל ליד הכניסה').getByText('שלך').count() > 0, 'after reload the taken task is still mine (next up)', 'volunteer');
  await s.go('/shopping', 1200);
  check(await s.has('נייר טואלט'), 'after reload the item added offline is on the list', 'volunteer');
  noErrors(s, 'offline');
  await s.done();
}

async function item6() {
  setItem('6 Refused write');
  const U = uids();
  // the Firestore SDK logs the rules' refusal of the queued write; the screen must show X1 and carry on
  const quiet = { allowErrors: [/ERR_INTERNET_DISCONNECTED/, /PERMISSION_DENIED|permission-denied|Missing or insufficient permissions/, /status of 403/] };
  const a = await session('yoav', quiet); const b = await session('orly', quiet);
  await Promise.all([a.go('/tasks', 1800), b.go('/tasks', 1800)]);
  await Promise.all([row(a, 'לסדר את המדפים').getByRole('button', { name: 'לקחת' }).click(), row(b, 'לסדר את המדפים').getByRole('button', { name: 'לקחת' }).click()]);
  await a.settle(2500);
  const t = await adminGet('tasks/t-race');
  const winner = t?.assignee?.uid === U.yoav ? 'a' : t?.assignee?.uid === U.orly ? 'b' : null;
  const loser = winner === 'a' ? b : a; const wName = winner === 'a' ? 'יואב' : 'אורלי';
  check(winner, 'same free task taken at the same time: exactly one wins', 'volunteer x2', winner ? `${wName} won` : 'nobody');
  check(winner && await loser.has('לא נשמר.') && await loser.has('את המשימה לפני רגע'), 'X1 toast for the loser names who took it', 'volunteer', (await loser.text()).match(/לא נשמר[^\n]*/)?.[0] || '');
  await loser.shot('6-X1-refused-take');
  await loser.reload();
  check(await loser.has('משימות') && await loser.has('לסדר את המדפים'), 'nothing breaks: the loser\'s list reloads with the task on the winner', 'volunteer');
  // a queued write refused after the screen moved on: Orly takes a task offline, Yoav takes it online first
  await b.go('/tasks', 1500);
  await b.ctx.setOffline(true); await b.settle(800);
  await row(b, 'למלא מים לכלבים').getByRole('button', { name: 'לקחת' }).click(); await b.settle(800);
  await a.go('/tasks', 1500);
  await row(a, 'למלא מים לכלבים').getByRole('button', { name: 'לקחת' }).click(); await a.settle(1200);
  check(await until(async () => (await adminGet('tasks/t-off2'))?.assignee?.uid === U.yoav), 'online teammate takes it first', 'volunteer');
  await b.ctx.setOffline(false);
  const late = await b.waitText('לא נשמר', 15000);
  check(late, 'X1 after sync: the queued take is refused by the rules and the toast says so', 'volunteer', (await b.text()).match(/לא נשמר[^\n]*/)?.[0] || '');
  await b.shot('6-X1-refused-after-sync');
  check((await adminGet('tasks/t-off2'))?.assignee?.uid === U.yoav, 'the server keeps the first taker', 'volunteer');
  await b.go('/tasks', 1500);
  check(await b.has('משימות') && !(await b.has('המסך הזה נתקע')), 'the app carries on after the refusal', 'volunteer');
  noErrors(a, 'race winner/loser a'); noErrors(b, 'race loser b');
  await a.done(); await b.done();
}

async function item7() {
  setItem('7 Demo mode');
  const crashed = async (s) => (await s.has('המסך הזה נתקע'));
  const s = await session(null);
  // every persona x every day boots, and every bottom tab of that persona opens, without errors
  const PERSONAS = ['owner', 'manager', 'staff', 'vendor', 'guest', 'new', 'blocked', 'helper'];
  const DAYS = { regular: 'יום רגיל', eventDay: 'יום אירוע', afterEvent: 'אחרי אירוע' };
  const ROLE = { owner: 'בעלים', manager: 'מנהלת', staff: 'מתנדב', vendor: 'בעל דוכן', guest: 'אורחת', new: 'נרשם חדש', blocked: 'חסום', helper: 'עוזרת בדוכן' };
  for (const p of PERSONAS) for (const d of Object.keys(DAYS)) {
    await s.go(`/?demo=${p}&day=${d}`, 1300);
    const strip = await s.page.locator('.k-demo__switch').first().innerText().catch(() => '');
    const tabs = await s.page.locator('.k-nav button').allInnerTexts().catch(() => []);
    let tabsOk = true;
    for (let i = 0; i < tabs.length; i++) { await s.page.locator('.k-nav button').nth(i).click(); await s.settle(500); if (await crashed(s)) tabsOk = false; }
    const e = s.takeErrors();
    check(strip.includes('מחובר כ' + ROLE[p]) && strip.includes(DAYS[d]) && tabsOk && !e.length, `boots: ${p} · ${d}${tabs.length ? ' (' + tabs.length + ' tabs)' : ''}`, 'demo', e.slice(0, 2).join(' | '));
    if ((p === 'owner' && d === 'regular') || (d === 'eventDay' && ['staff', 'vendor'].includes(p))) { await s.go('/', 900); await s.shot(`7-demo-${p}-${d}`); }
  }
  // Z1 start page and the switch sheet (Z3)
  await s.go('/demo', 900);
  check(await s.has('לראות איך האפליקציה עובדת') && await s.has('כניסה להדגמה'), 'Z1 start page', 'demo');
  await s.click('מתנדב · יואב'); await s.click('יום רגיל', { role: 'radio' }); await s.click('כניסה להדגמה', { role: 'button', wait: 1200 });
  check(s.path() === '/tasks' && (await s.page.locator('.k-demo__switch').innerText()).includes('מחובר כמתנדב'), 'Z1 "כניסה להדגמה" enters as the chosen persona', 'demo');
  await s.page.locator('.k-demo__switch').click(); await s.settle(600);
  check(await s.has('נתונים לא אמיתיים') && await s.has('מצבים להדגמה'), 'Z3 sheet opens from the strip', 'demo');
  await s.shot('7-Z3-demo-sheet');
  await s.click('מנהלת · נועה', { wait: 1000 });
  check((await s.page.locator('.k-demo__switch').innerText()).includes('מחובר כמנהלת') && await s.page.locator('.k-nav button', { hasText: 'ניהול' }).count() > 0, 'Z3 switches persona (manager, with the manage tab)', 'demo');
  await s.page.locator('.k-demo__switch').click(); await s.settle(500);
  await s.click('יום אירוע', { role: 'radio', wait: 900 });
  check((await s.page.locator('.k-demo__switch').innerText()).includes('יום אירוע') && await s.page.locator('.k-nav button', { hasText: 'אירוע' }).count() > 0, 'Z3 switches the day (event day adds the event tab)', 'demo');
  await s.page.keyboard.press('Escape'); await s.settle(400);
  // reset: a demo edit, then "איפוס הנתונים" brings the seed back
  await s.go('/?demo=staff&day=regular', 1200);
  await s.page.getByRole('button', { name: 'קניות' }).last().click(); await s.settle(700);
  await s.page.getByPlaceholder('להוסיף לסופר').fill('מלפפונים לבדיקה'); await s.page.keyboard.press('Enter'); await s.settle(600);
  await s.tryClick('הוספה לסופר', { role: 'button', wait: 800 });
  const added = await s.has('מלפפונים לבדיקה');
  await s.go('/shopping', 1000);
  const kept = await s.has('מלפפונים לבדיקה');
  await s.page.locator('.k-demo__switch').click(); await s.settle(500);
  await s.click('איפוס הנתונים', { role: 'button', wait: 900 });
  const toast = await s.has('נתוני הדוגמה אופסו');
  await s.page.keyboard.press('Escape'); await s.settle(400);
  await s.go('/shopping', 1000);
  check(added && kept && toast && !(await s.has('מלפפונים לבדיקה')), 'reset restores the seed (a demo edit survives a reload, then is gone after reset)', 'demo', `added ${added} kept ${kept} toast ${toast}`);
  // "מצבים להדגמה"
  const states = async () => { await s.page.locator('.k-demo__switch').click(); await s.settle(500); await s.page.locator('.system-states summary').click(); await s.settle(300); };
  await s.go('/tasks', 1000);
  await states();
  await s.page.getByRole('switch', { name: 'אין קליטה' }).click(); await s.settle(400);
  await s.page.keyboard.press('Escape'); await s.settle(500);
  check(await s.has('אין קליטה'), 'trigger "אין קליטה": the C8 strip shows', 'demo');
  await s.shot('7-Z3-trigger-offline');
  await states(); await s.page.getByRole('switch', { name: 'אין קליטה' }).click(); await s.page.keyboard.press('Escape'); await s.settle(500);
  check(!(await s.has('אין קליטה')), 'trigger "אין קליטה" off: the strip leaves', 'demo');
  await states(); await s.page.getByRole('switch', { name: 'הפעולה הבאה לא תישמר' }).click(); await s.page.keyboard.press('Escape'); await s.settle(500);
  await s.page.getByRole('button', { name: 'לקחת' }).first().click(); await s.settle(900);
  check(await s.has('לא נשמר.'), 'trigger "הפעולה הבאה לא תישמר": the next take shows X1', 'demo', (await s.text()).match(/לא נשמר[^\n]*/)?.[0] || '');
  await s.shot('7-Z3-trigger-refuse');
  await states(); await s.page.getByRole('switch', { name: 'רשימות ריקות' }).click(); await s.page.keyboard.press('Escape'); await s.settle(600);
  await s.click('רק שלי', { wait: 600 });
  check(await s.has('סיימת את כל מה שעליך'), 'trigger "רשימות ריקות": "רק שלי" shows everything of mine done (L5)', 'demo');
  await s.shot('7-Z3-trigger-empty-tasks');
  await s.page.getByRole('button', { name: 'קניות' }).last().click(); await s.settle(700);
  check(await s.has('אין מה לקנות בסופר'), 'trigger "רשימות ריקות": the shopping list is empty (S3)', 'demo');
  await states(); await s.page.getByRole('switch', { name: 'רשימות ריקות' }).click(); await s.page.keyboard.press('Escape'); await s.settle(500);
  check(!(await s.has('אין מה לקנות בסופר')), 'trigger "רשימות ריקות" off: the list is back', 'demo');
  await s.go('/tasks', 900);
  await states(); await s.click('כניסה ראשונה', { wait: 1000 });
  check(await s.has('ברוך הבא לצוות') && (await s.page.locator('.k-demo__switch').innerText()).includes('נרשם חדש'), 'trigger "כניסה ראשונה" opens C9', 'demo');
  await s.page.locator('.k-demo__switch').click(); await s.settle(500); await s.page.locator('.system-states summary').click(); await s.settle(300);
  await s.click('חשבון מושעה', { wait: 1000 });
  check(await s.has('החשבון הושעה'), 'trigger "חשבון מושעה" opens X2', 'demo');
  await s.page.locator('.k-demo__switch').click(); await s.settle(500); await s.page.locator('.system-states summary').click(); await s.settle(300);
  await s.click('עוזרת בדוכן · תמר', { wait: 1000 });
  check(await s.has('בדוכן של רז') && s.path().startsWith('/vendor'), 'trigger helper opens the helper\'s vendor screens', 'demo');
  // leaving demo
  await s.page.locator('.k-demo__exit').click(); await s.settle(900);
  check(s.path() === '/demo' && !(await s.page.locator('.k-demo').count()), '"יציאה" leaves demo to the start page', 'demo');
  noErrors(s, 'demo sheet and triggers');
  await s.done();
}

async function item8() {
  setItem('8 Guest flows (legacy)');
  const U0 = uids();
  // signed out: home, event page, the order asks to sign in first
  const a = await session(null);
  await a.go('/', 1800);
  check(await a.has('אירועים קרובים') && await a.has('פסטיבל החורף') && await a.has('תיאום ביקור'), 'signed out: guest home lists the upcoming event and the tiles', 'signed-out');
  await a.shot('8-guest-home-signed-out');
  await a.click('פסטיבל החורף', { wait: 1000 });
  check(a.path() === '/events/ev-winter' && await a.has('הזמנת כרטיסים') && await a.has('לכרטיס'), 'event page with price and "הזמנת כרטיסים"', 'signed-out');
  await a.shot('8-event-page');
  await a.click('הזמנת כרטיסים', { wait: 900 });
  await a.click('הזמנה ·', { role: 'button', wait: 900 });
  check(a.path() === '/login' && await a.has('רגע לפני הכרטיסים') && await a.has('המשך עם Google'), 'ordering signed out asks to sign in first', 'signed-out');
  await a.go('/me', 900);
  check(await a.has('עוד לא נכנסתם'), '"הכרטיסים שלי" signed out invites to sign in', 'signed-out');
  noErrors(a, 'signed-out guest'); await a.done();

  // first entry (sign-up) of a new guest
  const g = await session('rotem');
  await g.go('/', 1800);
  check(await g.has('נעים להכיר') && await g.has('סיום'), 'first sign-in opens the sign-up form', 'new guest');
  await g.shot('8-signup');
  await g.fill('טלפון', '0541234567');
  await g.fill('יישוב', 'טנא עומרים');
  await g.click('סיום', { role: 'button', wait: 2000 });
  const U = uids(); const rotem = g.account.uid;
  const prof = await until(async () => adminGet('users/' + rotem));
  check(prof?.role === 'guest' && prof?.phone === '0541234567' && await g.waitText('אירועים קרובים', 6000), 'sign-up creates a guest profile and opens the guest home', 'new guest', JSON.stringify({ role: prof?.role, phone: prof?.phone }));
  // order (paid event): 2 tickets, then "העברתי"
  await g.go('/events/ev-winter/order', 1500);
  await g.page.getByRole('button', { name: 'עוד', exact: true }).click(); await g.settle(200);
  await g.page.getByPlaceholder('כרטיס 2').fill('דני אברהם');
  const sel = g.page.locator('select'); if (await sel.count()) { await sel.first().selectOption('whatsapp'); await g.settle(200); }
  await g.click('הזמנה ·', { role: 'button', wait: 2000 });
  const tks = await until(async () => { const t = (await adminList('tickets')).filter((x) => x.ownerUid === rotem); return t.length === 2 ? t : null; });
  check(tks?.length === 2 && tks.every((t) => t.paymentStatus === 'pending') && tks.some((t) => t.holderName === 'דני אברהם'), 'order: 2 tickets created, pending, the second in the companion\'s name', 'new guest');
  check(g.path() === '/me' && await g.has('ממתין לתשלום') && await g.page.locator('.ticket canvas, .ticket svg, .ticket img').count() > 0, '"הכרטיסים שלי" shows the order with a QR and the payment band', 'new guest');
  await g.shot('8-my-tickets');
  await g.click('העברתי', { role: 'button', wait: 1500 });
  check(await until(async () => (await adminList('tickets')).filter((x) => x.ownerUid === rotem).every((t) => t.paymentStatus === 'claimed')), '"העברתי" marks the order paid (claimed)', 'new guest');
  check(await until(async () => (await adminList('notifications')).some((n) => n.type === 'claim' && n.refId === tks[0].orderId), 5000), 'the managers\' inbox gets the payment claim', 'new guest');
  // registration (free event)
  await adminSet('events/ev-free', { title: 'סדנת הרכבה בחווה', description: 'סדנה פתוחה לכל המשפחה.', image: '', location: 'חוות רווה', start: new Date(Date.now() + 9 * 864e5).toISOString(), end: new Date(Date.now() + 9 * 864e5 + 3 * 3600e3).toISOString(), price: 0, maxPerOrder: 4, capacity: 0, open: true, published: true, publishedAt: new Date().toISOString(), questions: [], createdBy: { uid: U.dana, name: 'דנה אברהם' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await g.go('/events/ev-free', 1500);
  check(await g.has('כניסה חופשית') && await g.has('הרשמה'), 'free event: "כניסה חופשית · נדרש רישום"', 'new guest');
  await g.click('הרשמה', { role: 'link', wait: 1000 }).catch(() => g.click('הרשמה', { wait: 1000 }));
  await g.click('הרשמה', { role: 'button', wait: 2000 });
  check(await until(async () => (await adminList('tickets')).some((x) => x.ownerUid === rotem && x.eventId === 'ev-free' && x.paymentStatus === 'free')), 'registration creates a free ticket', 'new guest');
  // visit request
  await g.go('/visit', 1200);
  const dayBtn = g.page.locator('.cal button:not([disabled])').nth(5);
  await dayBtn.click(); await g.settle(200);
  await g.page.getByPlaceholder('סבא וסבתא עם הנכדים, מעדיפים בוקר.').fill('קבוצה של חברים');
  await g.click('שליחת הבקשה', { role: 'button', wait: 1500 });
  const visit = await until(async () => (await adminList('visits')).find((v) => v.uid === rotem));
  check(await g.has('קיבלנו, נחזור אליכם') && visit?.status === 'new' && visit?.people === 4, 'visit request sent ("קיבלנו, נחזור אליכם")', 'new guest');
  await g.shot('8-visit-sent');
  // donation
  await g.go('/donate', 1200);
  await g.click('סכום אחר', { wait: 200 });
  await g.page.getByPlaceholder('₪').fill('250');
  await g.page.getByPlaceholder('לזכר…').fill('סבתא רחל');
  await g.click('לתרום', { role: 'button', wait: 1800 });
  const dn = await until(async () => (await adminList('donations')).find((d) => d.uid === rotem));
  check(await g.has('תודה!') && dn?.amount === 250 && dn?.memorial === 'סבתא רחל' && dn?.paymentStatus === 'pending', 'donation 250 with a memorial (pending)', 'new guest');
  await g.click('העברתי', { role: 'button', wait: 1500 });
  check(await until(async () => (await adminGet('donations/' + dn.id))?.paymentStatus === 'claimed'), 'donation "העברתי" (claimed)', 'new guest');
  await g.shot('8-donation-thanks');
  // a stall tab opened for the guest at the event (staff side), paid from "הכרטיסים שלי"
  const now = new Date().toISOString();
  await adminSet('tabs/tab-rotem', { eventId: 'ev-winter', eventTitle: 'פסטיבל החורף', guestUid: rotem, guestName: 'רותם אברהם', guestPhone: '0541234567', ticketId: tks[0].id, items: [{ productId: 'p-cheese', name: 'גבינת עיזים', price: 45, qty: 1, at: now, by: { uid: U.orly, name: 'אורלי' } }], total: 45, status: 'open', createdBy: { uid: U.orly, name: 'אורלי' }, createdAt: now, updatedAt: now });
  await g.go('/me', 1500);
  const tabRow = g.page.locator('.row', { hasText: 'החשבון שלי בדוכן' }).first();
  check(await tabRow.count() > 0 && (await tabRow.innerText()).includes('פתוח'), 'stall tab shows on "הכרטיסים שלי" (open)', 'new guest');
  await tabRow.getByRole('button', { name: 'העברתי' }).click(); await g.settle(800);
  if (await g.has('אישור שהעברתי')) await g.click('אישור שהעברתי', { role: 'button', wait: 1200 });
  check(await until(async () => (await adminGet('tabs/tab-rotem'))?.status === 'claimed'), 'stall tab "העברתי" (claimed)', 'new guest');
  await g.shot('8-stall-tab');
  // account page
  await g.go('/me/account', 1500);
  const acc = await g.text();
  check(acc.includes('הפעילות שלי') && acc.includes('כרטיסים · פסטיבל החורף') && acc.includes('ביקור ·') && acc.includes('תרומה · 250') && acc.includes('החשבון שלי בדוכן'), 'account page lists tickets, visit, donation and the stall tab', 'new guest');
  check(acc.includes('תודה על תרומתך') && acc.includes('רותם אברהם'), 'account page: thank-you strip and the profile', 'new guest');
  await g.shot('8-account');
  await g.go('/contact', 1000);
  check(await g.has('פנייה למנהלים'), 'contact page opens', 'new guest');
  noErrors(g, 'new guest flows'); await g.done();

  // an existing guest sees her own history
  const m = await session('michal');
  await m.go('/me', 1800);
  check(await m.has('פסטיבל החורף') && await m.page.locator('.ticket').count() > 0, 'existing guest: her tickets are on "הכרטיסים שלי"', 'guest');
  await m.go('/me/account', 1200);
  check(await m.has('ביקור ·') && await m.has('תרומה · 180'), 'existing guest: account page lists her visit and donation', 'guest');
  noErrors(m, 'existing guest'); await m.done();
}

// ====================================================================================================================
const ITEMS = { 1: item1, 2: item2, 3: item3, 4: item4, 5: item5, 6: item6, 7: item7, 8: item8 };
await launch();
for (const [k, fn] of Object.entries(ITEMS)) {
  if (only.length && !only.includes(k)) continue;
  try { await fn(); } catch (e) { check(false, `item ${k} crashed: ${String(e).split('\n')[0]}`, 'runner'); }
}
await close();
const google = external.filter((u) => /google|firebase|gstatic/.test(u));
check(true, `non-localhost requests: ${external.length}, all aborted (Google hosts among them: ${google.length})`, 'runner');
fs.mkdirSync('.build/smoke', { recursive: true });
fs.writeFileSync('.build/smoke/results.json', JSON.stringify({ at: new Date().toISOString(), results, external }, null, 1));
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed${fails.length ? '\nFAILED:\n' + fails.map((f) => ` - [${f.item}] ${f.check} ${f.note}`).join('\n') : ''}`);
process.exit(fails.length ? 1 : 0);
