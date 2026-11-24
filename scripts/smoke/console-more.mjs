// The rest of the owner's actions (scripts/console-walk.mjs, part "actions"): everything the console can change or save
// that console-owner.mjs does not do, once each, on the screen and in Firestore or the Worker's answer.
// It runs on a Worker of its own (empty KV and R2), so it can be run alone: --only=actions
import fs from 'node:fs';
import path from 'node:path';
export async function moreWalk(x) {
  const { E, check, step, until, sleep, session, counted, trouble, w, site, setPart, uids, IL, mail, note } = x;
  setPart('actions');
  const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
  const H = 60, D = 1440;
  const A = (k) => ({ uid: uids[k], name: x.PEOPLE[k][2] });
  // ---------- this part's own records ----------
  const user = (id, name, email, o = {}) => E.put('users/' + id, { uid: id, email, displayName: name, phone: '054-000-0000', role: 'guest', status: 'active', customerNumber: 900, acceptedTermsAt: ago(9 * D), createdAt: ago(9 * D), updatedAt: ago(D), welcomedAt: ago(D), ...o });
  await user('walk-gone', 'שני למחיקה', 'gone.walk@example.com');
  await user('walk-rise', 'תמר לקידום', 'rise.walk@example.com', { role: 'staff' });
  await E.put('role_invites/gone.walk@example.com', { email: 'gone.walk@example.com', role: 'staff', createdBy: A('owner'), createdAt: ago(D) });
  const task = (id, title, o = {}) => E.put('tasks/' + id, { title, note: '', photo: '', location: null, dueDate: '', managersOnly: false, templateId: null, dateKey: null, createdBy: A('dana'), createdAt: ago(2 * D), done: false, doneBy: null, doneAt: null, urgent: false, assignee: null, ...o });
  await task('m-edit', 'משימה לעריכה', { dueDate: IL(), note: 'לפני' });
  await task('m-stale', 'משימה שמשתנה בינתיים', { note: 'לפני' });
  await task('m-bin', 'משימה שנוצרה מחדש', { note: 'הישנה' });
  await task('m-lost', 'משימה שנעלמה מאז הגיבוי');
  await task('m-again', 'משימה כפולה');
  for (let i = 0; i < 205; i++) await E.put('vendor_requests/vr-' + i, { uid: 'guest-' + i, name: 'בקשה ' + i, phone: '0500000000', product: 'דבש', status: 'new', createdAt: ago(i) });
  await E.put('donations/dn-pause', { uid: uids.michal, name: 'מיכל בר', phone: '0523333333', amount: 55, label: '', note: '', memorial: '', receiptWanted: false, receiptName: '', receiptSent: false, paymentStatus: 'paid', paidAt: new Date(Date.now() - H * 60_000), createdAt: ago(D), updatedAt: ago(H) });
  await E.put('email_outbox/donation_dn-pause', { kind: 'donation', col: 'donations', refId: 'dn-pause', uid: uids.michal, status: 'queued', attempts: 0, createdAt: ago(1), updatedAt: ago(1), nextAt: ago(1), firstAttemptAt: null });
  await E.put('broadcasts/bc-walk', { text: 'הודעה לנרשמים', audience: 'registrants', eventId: 'ev-winter', recipients: [uids.michal], by: A('dana'), createdAt: ago(5) });
  await E.put('email_outbox/bc_bc-walk_' + uids.michal, { kind: 'broadcast', broadcastId: 'bc-walk', uid: uids.michal, status: 'queued', attempts: 0, createdAt: ago(5), updatedAt: ago(5) });

  const s = await session({ site: site.base, api: w.base, who: 'owner' });
  const { page } = s;
  const R = (o) => page.getByRole('button', { name: o, exact: true });
  const panel = () => page.locator('aside.d-panel').last();
  const pbtn = (n) => panel().getByRole('button', { name: n, exact: true });
  const dlg = () => page.locator('.d-dialog [role=dialog]').last();
  const dbtn = (n) => dlg().getByRole('button', { name: n, exact: true });
  const ksheet = () => page.locator('.k-sheet').last();
  const sheet = async (go) => { await ksheet().getByRole('button', { name: go, exact: true }).click(); };
  const sw = (n) => page.getByRole('switch', { name: n, exact: true });
  const rowKey = (k) => page.locator(`tr[data-row="${k}"]`).first();
  const chip = (t) => page.locator('.d-main .d-chip', { hasText: t }).first();
  const main = () => page.locator('.d-main').innerText();
  const search = (t) => page.locator('.d-main').getByPlaceholder(t, { exact: false }).first();
  const dismiss = async () => { await page.keyboard.press('Escape'); await sleep(300); };
  const isOn = async (n) => (await sw(n).getAttribute('aria-checked')) === 'true';
  const act = (a, refId) => E.list('activity').then((l) => l.some((q) => q.action === a && (!refId || q.refId === refId) && Date.now() - Date.parse(q.at) < 120_000));
  const key = async (secret, method, p, body) => { const r = await fetch(w.base + p, { method, headers: { authorization: 'Bearer ' + secret, ...(body ? { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const log = async () => { await s.go('overview'); await s.go('security'); await page.getByRole('button', { name: /^בקונסולה/ }).first().click(); await s.idle(); return page.locator('table[aria-label="יומן אבטחה"] tbody tr').allInnerTexts().then((l) => l.map((t) => t.replace(/\s+/g, ' '))); };
  await s.idle();

  // ---------- overview and the frame ----------
  await step('overview and the frame: every link', async () => {
    await s.go('overview');
    const links = await page.locator('.d-main a[href]').evaluateAll((l) => l.map((a) => a.getAttribute('href')));
    for (const h of [...new Set(links.filter((q) => q.startsWith('#/')))]) {
      await s.go('overview'); await page.locator(`.d-main a[href="${h}"]`).first().click(); await s.idle();
      const t = await trouble(s); check(page.url().includes(h) && !t.m && !t.alerts.length, `the link to ${h} opens it`, { url: page.url(), ...t });
    }
    const out = await page.locator('.d-side a[href], .d-nav a[href], aside a[href]').evaluateAll((l) => l.map((a) => a.getAttribute('href')));
    check(out.some((h) => /^\/app/.test(h)) && out.some((h) => /^\/edit/.test(h)), 'the sidebar leads to the app and to the site editor', out);
    await s.go('overview'); const l = page.locator('.d-main a', { hasText: 'ליומן המלא' }).first();
    check(/^\/app\/manage\/instinct/.test(await l.getAttribute('href') || ''), 'the full log is the app\'s own screen', await l.getAttribute('href'));
  }, s);

  // ---------- people ----------
  await step('people: search and filters', async () => {
    await s.go('people'); const n = () => page.locator('table[aria-label="אנשים"] tbody tr[data-row]').count();
    await search('שם, מייל').fill('gone.walk'); await sleep(400); check(await n() === 1, 'search by mail', await n());
    await search('שם, מייל').fill('שני'); await sleep(400); check((await main()).includes('שני למחיקה'), 'search by name');
    await search('שם, מייל').fill(''); await sleep(300); const seen = {};
    for (const c of ['כולם', 'צוות', 'אורחים', 'דוכנים', 'חסומים']) { await chip(c).click(); await sleep(250); seen[c] = [await n(), Number((await chip(c).innerText()).replace(/\D/g, ''))]; }
    check(Object.values(seen).every(([a, b]) => a === b || (b > 100 && a === 100)), 'each filter shows as many rows as it says', seen);
    await chip('חסומים').click(); const d = await s.download(() => R('אקסל').click()); check(d.text.trim().split('\n').length === seen['חסומים'][0] + 1, 'the export holds what is filtered', d.text.split('\n').length);
    await chip('כולם').click();
  }, s);
  await step('people: set a role ahead (invite)', async () => {
    await s.go('people'); await R('להוסיף מישהו מראש').click();
    await dlg().getByLabel('מייל', { exact: true }).fill('לא מייל'); check(await dbtn('שמירה').isDisabled(), 'a bad mail cannot be saved');
    await dlg().getByRole('radio', { name: /^בעלים/ }).click(); check(/בעלים רואים ומשנים הכל/.test(await dlg().innerText()), 'an owner ahead is warned about');
    await dlg().getByRole('radio', { name: /^מתנדב/ }).click();
    await dlg().getByLabel('מייל', { exact: true }).fill('Ahead.Walk@example.com'); await dbtn('שמירה').click();
    check(await s.toast('יקבל/תקבל את התפקיד'), 'says so'); check(await until(async () => !(await page.locator('.d-dialog [role=dialog]').count())), 'the window closes');
    const inv = await E.get('role_invites/ahead.walk@example.com'); check(inv?.role === 'staff' && inv.createdBy?.uid === uids.owner, 'Firestore: the invite, in small letters, by the owner', inv);
    check(await act('invited', 'ahead.walk@example.com'), 'written in activity');
    await R('להוסיף מישהו מראש').click(); await dlg().getByLabel('מייל', { exact: true }).fill('second.walk@example.com'); await dlg().getByRole('radio', { name: /^מנהל/ }).click(); await dbtn('ביטול').click(); await sleep(300);
    check(!(await E.get('role_invites/second.walk@example.com')), 'cancel saves nothing');
  }, s);
  await step('people: delete one', async () => {
    await s.go('people/walk-gone'); check((await panel().innerText()).includes('שני למחיקה'), 'the panel opens');
    await pbtn('מחיקה').click(); check(/כרטיסים, תרומות וביקורים נשארים/.test(await ksheet().innerText()), 'it asks, and says what stays');
    await sheet('חזרה'); await sleep(400); check(!!(await E.get('users/walk-gone')), 'cancel deletes nothing');
    await pbtn('מחיקה').click(); await sheet('כן, למחוק'); check(await s.toast('נמחק'), 'says so');
    check(await until(async () => !(await E.get('users/walk-gone'))), 'Firestore: the profile is gone');
    check(!(await E.get('role_invites/gone.walk@example.com')), 'Firestore: the role set ahead for that mail is gone');
    check(await act('deleted', 'walk-gone'), 'written in activity');
    check(await until(async () => !(await page.locator('table[aria-label="אנשים"]').innerText()).includes('שני למחיקה')), 'the table no longer has them');
    await s.go('overview'); await s.go('people/walk-gone'); check(!(await panel().innerText()).includes('שני למחיקה') && !/undefined/.test(await panel().innerText()), 'the old address does not break', (await panel().innerText()).slice(0, 120));
  }, s);
  await step('people: an owner, myself, a stall, the card in the app', async () => {
    await s.go('people/walk-rise'); await panel().getByRole('radio', { name: /^בעלים/ }).click(); check(/בעלים רואים ומשנים הכל/.test(await ksheet().innerText()), 'the owner role warns');
    await sheet('כן, לתת תפקיד בעלים'); check(await until(async () => (await E.get('users/walk-rise')).role === 'owner'), 'Firestore: owner'); await s.idle();
    await until(() => panel().getByRole('radio', { name: /^בעלים/, checked: true }).count());
    await panel().getByRole('radio', { name: /^אורח/ }).click(); await ksheet().locator('button').first().waitFor(); await ksheet().getByRole('button', { name: /^כן/ }).click(); check(await until(async () => (await E.get('users/walk-rise')).role === 'guest'), 'and down to a guest', (await E.get('users/walk-rise')).role);
    await s.go('people/' + uids.owner); await s.idle(); check(!(await pbtn('חסימה').count()) && !(await pbtn('מחיקה').count()), 'myself: no block, no delete');
    check(await panel().getByRole('radio').first().isDisabled().catch(() => false) || await panel().getByRole('radiogroup').getAttribute('aria-disabled') === 'true', 'myself: my role cannot be changed');
    await s.go('people/' + uids.raz); await s.idle(); check(await panel().getByRole('radio').count() === 2, 'a stall owner: only guest or stall', await panel().getByRole('radio').allInnerTexts());
    const [pop] = await Promise.all([s.ctx.waitForEvent('page'), pbtn('לכרטיס באפליקציה').click()]); check(new URL(pop.url()).pathname.endsWith('/app/manage/people/' + uids.raz) || await until(() => pop.url().includes(uids.raz), 3000), 'the card opens in the app', pop.url()); await pop.close();
  }, s);

  // ---------- monitor ----------
  await step('monitor: check, a row, the alert settings, a test alert', async () => {
    await s.go('monitor'); await R('בדיקה עכשיו').click(); check(await s.toast('הבדיקה הסתיימה', 15_000), 'check now: says so'); await s.idle();
    await page.locator('table[aria-label="בדיקת הבוקר לפי ימים"] tbody tr[data-row]').first().click(); check(await R('סגירה').count(), 'a check opens beside the table'); await R('סגירה').click(); check(!(await R('סגירה').count()), 'and closes');
    const al = async () => (await s.call('GET', '/monitor')).data.alerts; const before = await al();
    for (const [name, k] of [['גם לטלפון', 'push'], ['סיכום בוקר יומי', 'daily']]) {
      const was = await isOn(name); check(was === (before[k] && before.on), `${name}: shown as the server has it`, before);
      await sw(name).click(); check(await until(async () => (await al())[k] === !was), `${name}: ${was ? 'off' : 'on'} on the server`, await al()); check(await until(async () => (await isOn(name)) === !was), `${name}: and on the screen`);
      await s.idle(); await sw(name).click(); check(await until(async () => (await al())[k] === was), `${name}: back`, await al()); await s.idle();
    }
    const on = 'להתריע כשמשהו לא בסדר';
    await sw(on).click(); check(await until(async () => (await al()).on === false), 'alerts off on the server'); await s.idle();
    check(await sw('גם לטלפון').isDisabled() && await sw('סיכום בוקר יומי').isDisabled(), 'the other two wait while it is off');
    await sw(on).click(); check(await until(async () => (await al()).on === true), 'alerts on again'); await s.idle();
    check(/אליה/.test((await al()).updatedBy || ''), 'the server knows who changed it', await al());
    if ((await al()).push !== true) { await sw('גם לטלפון').click(); await s.idle(); }
    await R('לשלוח התראת בדיקה אליי').click(); check(await s.toast('התראת הבדיקה נשמרה באפליקציה. היא נוספה לתור השליחה לטלפון.'), 'test alert: says so');
    const inbox = (await E.list(`users/${uids.owner}/notifications`)).filter((q) => /בדיקת התראות/.test(q.title || '')); check(inbox.length === 1, 'Firestore: one line in my inbox', inbox.length);
    check((await E.list(`users/${uids.owner2}/notifications`)).every((q) => !/בדיקת התראות/.test(q.title || '')), 'and not in the other owner\'s');
    const pj = (await E.list('push_jobs')).filter((q) => /בדיקת התראות/.test(q.title || '')); check(pj.length === 1 && JSON.stringify(pj[0].to) === JSON.stringify([uids.owner]), 'Firestore: one phone push, to me', pj.map((q) => q.to));
    await sw('גם לטלפון').click(); await until(async () => (await al()).push === false); await s.idle();
    await R('לשלוח התראת בדיקה אליי').click(); check(await until(async () => (await E.list(`users/${uids.owner}/notifications`)).filter((q) => /בדיקת התראות/.test(q.title || '')).length === 2), 'without the phone: again in the inbox');
    check((await E.list('push_jobs')).filter((q) => /בדיקת התראות/.test(q.title || '')).length === 1, 'and no push');
    if (before.push) { await sw('גם לטלפון').click(); await s.idle(); }
  }, s);

  // ---------- switches ----------
  let k0 = '';
  const sst = async () => (await s.call('GET', '/switches')).data;
  const flip = async (name, go, o = {}) => {
    await sw(name).click(); const sh = ksheet();
    if (o.text !== undefined) await sh.getByLabel('ההודעה במסך התחזוקה').fill(o.text);
    if (o.reason) await sh.getByLabel('למה (לא חובה)').fill(o.reason);
    await sh.getByRole('button', { name: go, exact: true }).click(); await until(async () => !(await page.locator('.k-sheet').count())); await s.idle();
  };
  const appCopy = () => E.get('settings/switches');
  await step('switches: maintenance and its message', async () => {
    await s.go('switches');
    await flip('מצב תחזוקה', 'כן, לתחזוקה', { text: 'חוזרים בעוד שעה', reason: 'תיקון' });
    let v = (await sst()).switches; check(v.maintenance === true && v.maintenanceText === 'חוזרים בעוד שעה', 'server: on, with the message', v);
    check((await appCopy())?.maintenance === true && (await appCopy())?.maintenanceText === 'חוזרים בעוד שעה', 'Firestore app copy: on, with the message', await appCopy());
    check(/דלוק עכשיו:.*מצב תחזוקה/s.test(await main()), 'the screen says it is on now');
    await page.locator('.d-main').getByLabel('ההודעה במסך התחזוקה').fill('חוזרים מחר בבוקר'); await R('שמירת ההודעה').click(); check(await s.toast('ההודעה נשמרה'), 'a new message: says so');
    check((await sst()).switches.maintenanceText === 'חוזרים מחר בבוקר' && (await appCopy())?.maintenanceText === 'חוזרים מחר בבוקר', 'server and app copy: the new message');
    await flip('מצב תחזוקה', 'כן, לצאת מתחזוקה'); v = (await sst()).switches; check(v.maintenance === false && (await appCopy())?.maintenance === false, 'off again'); check(!/דלוק עכשיו:/.test(await main()), 'and the screen no longer says so');
  }, s);
  await step('switches: registration, keys, payments mail, phone, mail to registrants', async () => {
    // a key to see the keys' switch with
    const made = (await s.call('POST', '/keys', { label: 'מפתח למתגים', actor: 'user:' + uids.dana, expiresAt: null, scopes: null })).data; k0 = made.key;
    check((await key(k0, 'GET', '/v1/tasks?limit=1')).status === 200, 'a key works before');
    await s.go('switches');
    await flip('הרשמה פתוחה', 'כן, לסגור', { reason: 'מלא' }); check((await sst()).switches.registrationClosed === true && (await appCopy())?.registrationClosed === true, 'registration closed: server and app copy', await appCopy());
    check(!(await isOn('הרשמה פתוחה')), 'the switch shows off'); await flip('הרשמה פתוחה', 'כן, לפתוח'); check((await sst()).switches.registrationClosed === false && (await appCopy())?.registrationClosed === false, 'and open again');
    await flip('כל המפתחות פעילים', 'כן, לעצור'); check((await sst()).switches.keysStopped === true, 'all keys stopped: server');
    const stopped = await until(async () => { const q = await key(k0, 'GET', '/v1/tasks?limit=1'); return q.status !== 200 && q; }, 95_000, 1500); check(stopped && stopped.status >= 400 && stopped.status < 600, `a key is refused (${stopped?.status})`, stopped);
    await flip('כל המפתחות פעילים', 'כן, להפעיל'); check(await until(async () => (await key(k0, 'GET', '/v1/tasks?limit=1')).status === 200, 95_000, 1500), 'and works again');
    // what waits, and goes once it is on again
    await flip('מיילים על תשלומים', 'כן, להשהות'); await flip('התראות לטלפון', 'כן, להשהות'); await flip('הודעות במייל לנרשמים', 'כן, להשהות');
    const v = (await sst()).switches; check(v.emailPaused && v.pushPaused && v.broadcastEmailPaused, 'mail, phone and mail to registrants paused: server', v);
    check(/דלוק עכשיו:/.test(await main()) && /מיילים בהשהיה/.test(await main()) && /הודעות במייל לנרשמים בהשהיה/.test(await main()), 'the screen lists all three', (await main()).split('\n').find((l) => /דלוק/.test(l)));
    await s.go('queue'); check(/המיילים בהשהיה/.test(await main()) && /ההתראות לטלפון בהשהיה/.test(await main()), 'the queue says so');
    await s.go('jobs'); check(await rowKey('push').getByRole('button', { name: 'להריץ עכשיו' }).isDisabled(), 'jobs: the paused phone job cannot be run');
    await E.put('push_jobs/pj-hold', { id: 'pj-hold', kind: 'task', title: 'התראה שמחכה', body: 'x', to: [uids.yoav], createdBy: A('dana'), createdAt: ago(1), sentAt: null, attempts: 0 });
    await sleep(1000); const sent0 = mail.calls.length; await E.cronAll(w); await E.cronAll(w); await sleep(800);
    check(mail.calls.length === sent0 && (await E.get('email_outbox/donation_dn-pause')).status === 'queued' && (await E.get('email_outbox/bc_bc-walk_' + uids.michal)).status === 'queued', 'two rounds: no mail went', { n: mail.calls.length - sent0, a: await E.get('email_outbox/donation_dn-pause'), b: await E.get('email_outbox/bc_bc-walk_' + uids.michal) });
    check(!(await E.get('push_jobs/pj-hold')).sentAt, 'and no push', await E.get('push_jobs/pj-hold'));
    await s.go('switches'); await flip('מיילים על תשלומים', 'כן, להדליק');
    await until(async () => { await E.cronAll(w); return (await E.get('email_outbox/donation_dn-pause')).status === 'sent'; }, 95_000, 3000); check((await E.get('email_outbox/donation_dn-pause')).status === 'sent' && mail.calls.slice(sent0).filter((m) => m.to === 'michal.walk@example.com').length === 1, 'payments mail on: it went, once', [await E.get('email_outbox/donation_dn-pause'), mail.calls.slice(sent0).map((m) => [m.to, m.subject])]);
    await E.cronAll(w); await E.cronAll(w); check((await E.get('email_outbox/bc_bc-walk_' + uids.michal)).status === 'queued', 'the mail to registrants still waits: its own switch', await E.get('email_outbox/bc_bc-walk_' + uids.michal));
    await flip('הודעות במייל לנרשמים', 'כן, להדליק'); const n1 = mail.calls.length;
    check(await until(async () => { await E.cronAll(w); return (await E.get('email_outbox/bc_bc-walk_' + uids.michal)).status === 'sent'; }, 95_000, 3000), 'mail to registrants on: it went', await E.get('email_outbox/bc_bc-walk_' + uids.michal));
    check(mail.calls.slice(n1).filter((m) => /הודעה לנרשמים/.test(m.text || '')).length === 1, 'the mail service (mock) got its text once', mail.calls.slice(n1).map((m) => m.subject));
    await flip('התראות לטלפון', 'כן, להדליק'); check(await until(async () => { await E.cronAll(w); return !!(await E.get('push_jobs/pj-hold'))?.sentAt; }, 95_000, 3000), 'phone on: the push was handled', await E.get('push_jobs/pj-hold'));
    const e = (await sst()).switches; check(!e.emailPaused && !e.pushPaused && !e.broadcastEmailPaused && !e.keysStopped && !e.registrationClosed && !e.maintenance && !e.readOnly, 'every switch is back', e);
    const tb = await page.locator('table[aria-label="שינויים אחרונים במתגים"]').innerText(); for (const n of ['מצב תחזוקה', 'הרשמה פתוחה', 'כל המפתחות פעילים', 'מיילים על תשלומים', 'התראות לטלפון', 'הודעות במייל לנרשמים']) check(tb.includes(n), `the history has ${n}`, tb.slice(0, 300));
    await page.locator('.d-main a', { hasText: 'להיסטוריית השינויים' }).click(); await s.idle(); check(page.url().includes('#/security'), 'the link to the history opens the security log');
  }, s);
  await step('switches: read-only stops a key from writing', async () => {
    await s.go('switches'); await flip('קריאה בלבד', 'כן, קריאה בלבד', { reason: 'בדיקה' });
    const r = await until(async () => { const q = await key(k0, 'POST', '/v1/actions/tasks.create', { title: 'לא אמור להיכתב' }); return q.status >= 400 && q; }, 95_000, 1500); check(!!r, `a key cannot write (${r?.status})`, r);
    check((await key(k0, 'GET', '/v1/tasks?limit=1')).status === 200, 'and can read');
    await flip('קריאה בלבד', 'כן, לצאת'); check(await until(async () => (await key(k0, 'POST', '/v1/actions/tasks.create', { title: 'נכתב אחרי' })).status < 300, 95_000, 1500), 'off: it writes again');
  }, s);

  // ---------- backups first (the data steps need one) and the jobs ----------
  await step('jobs: each one once, the cleanup and its archive, a stopped round', async () => {
    const old = ago(100 * D);
    await E.put('api_log/old-1', { id: 'old-1', at: old, credential: 'cred-gone', op: 'tasks.list', ok: true, kind: 'read', ms: 5 });
    await E.put('push_jobs/old-1', { id: 'old-1', kind: 'task', title: 'ישנה', body: '', to: [], createdAt: ago(40 * D), sentAt: ago(40 * D), attempts: 1 });
    await E.put('email_outbox/old-sent', { kind: 'donation', status: 'sent', updatedAt: ago(400 * D), createdAt: ago(400 * D) });
    await E.put('email_outbox/old-queued', { kind: 'donation', status: 'queued', updatedAt: ago(400 * D), createdAt: ago(400 * D), nextAt: '2099-01-01T00:00:00.000Z' });
    await s.go('jobs'); check(/הארכיון ריק/.test(await main()), 'the archive starts empty');
    const job = async (id) => (await s.call('GET', '/jobs')).data.jobs.find((q) => q.id === id);
    for (const [id, he] of [['email', 'מיילים על תשלומים'], ['push', 'התראות לטלפון'], ['monitor', 'בדיקת האתר והמכסה'], ['backup', 'גיבוי לילי']]) {
      await s.idle(); await rowKey(id).getByRole('button', { name: 'להריץ עכשיו' }).click(); if (await ksheet().count()) await ksheet().getByRole('button', { name: /^כן/ }).click();
      check(await s.toast(`${he}: רצה עכשיו`, 60_000), `${he}: says it ran`); const j = await job(id); check(j.last?.ok === true && Date.now() - Date.parse(j.last.at) < 60_000 && /אליה/.test(j.last.by || ''), `${he}: server says it ran now, by hand, and well`, j.last);
    }
    await until(async () => { const b = (await s.call('GET', '/backups')).data; if (b.items?.length && !b.running) return true; await s.call('POST', '/jobs/backup/run'); return false; }, 60_000, 800);
    await s.idle(); await rowKey('cleanup').getByRole('button', { name: 'להריץ עכשיו' }).click(); check(await ksheet().count(), 'the cleanup asks first'); await sheet('כן, לנקות עכשיו'); check(await s.toast('ניקוי רשומות ישנות: רצה עכשיו', 30_000), 'the cleanup: says it ran');
    await until(async () => { const j = await job('cleanup'); if (j.last?.result?.done !== false && !(await E.get('api_log/old-1'))) return true; await s.call('POST', '/jobs/cleanup/run'); return false; }, 40_000, 800);
    check(!(await E.get('api_log/old-1')) && !(await E.get('push_jobs/old-1')) && !(await E.get('email_outbox/old-sent')), 'Firestore: the old records are gone', [await E.get('api_log/old-1'), await E.get('push_jobs/old-1'), await E.get('email_outbox/old-sent')]);
    check(!!(await E.get('email_outbox/old-queued')) && !!(await E.get('tasks/m-edit')), 'a mail still waiting, and the farm\'s own data, stay');
    const a = (await s.call('GET', '/jobs')).data.archive.collections; check(a.length >= 3 && a.every((c) => c.files > 0 && c.bytes > 0), 'server: the archive holds their files', a);
    await s.go('overview'); await s.go('jobs'); const card = page.locator('section.d-card', { hasText: 'בארכיון' }).last(); check(/קובץ|קבצים/.test(await card.innerText()), 'the archive card lists them', (await card.innerText()).slice(0, 200));
    check(!(await card.getByRole('button').count()) && !(await card.locator('a').count()), 'the archive card has no download (nor has the server)');
    for (const [he, k] of [['התראות לטלפון', 'pushPaused'], ['בדיקת האתר והמכסה', 'monitorPaused'], ['ניקוי רשומות ישנות', 'cleanupPaused']]) {
      await s.idle(); await sw(he).click(); await sleep(500); if (await ksheet().count()) await ksheet().getByRole('button', { name: /^כן/ }).click();
      check(await until(async () => (await sst()).switches[k] === true), `${he}: paused on the server`, (await sst()).switches); await s.idle(); await sw(he).click(); await sleep(400); if (await ksheet().count()) await ksheet().getByRole('button', { name: /^כן/ }).click(); check(await until(async () => (await sst()).switches[k] === false), `${he}: back`); await s.idle();
    }
    // a round stopped in its middle: the push job waits a moment, so there is a middle
    await page.route('**/jobs/email/run', async (r) => { await sleep(1500); await r.continue(); });
    await R('להריץ סבב מלא עכשיו').click(); await ksheet().getByRole('button', { name: /^כן/ }).click(); await dbtn('לעצור אחרי המשימה הזאת').click();
    check(await until(async () => (await dlg().innerText()).includes('לא רצה, עצרתם לפניה'), 30_000), 'a stopped round says what did not run', await dlg().innerText().catch(() => '')); await page.unroute('**/jobs/email/run');
  }, s);

  // ---------- keys ----------
  await step('keys: refused forms, picked areas, name, expiry, an expired one, not saved', async () => {
    await s.go('keys'); await R('מפתח חדש').click(); await dbtn('יצירת המפתח').click(); check(/צריך שם למפתח/.test(await dlg().innerText()), 'no name: refused');
    await dlg().getByLabel(/שם המפתח/).fill('מפתח תחומים'); await dbtn('יצירת המפתח').click(); check(/בחרו בשם מי המפתח פועל/.test(await dlg().innerText()), 'no person: refused');
    await dlg().getByLabel('פועל בשם').selectOption(uids.dana); await dlg().getByRole('radio', { name: 'לבחור תחומים' }).click(); await dbtn('יצירת המפתח').click(); check(/בחרו לפחות תחום אחד/.test(await dlg().innerText()), 'no area: refused');
    const boxes = await dlg().getByRole('checkbox').count(); check(boxes > 3, 'the areas are listed', boxes); await dlg().getByRole('checkbox', { name: /^משימות/ }).click(); await dlg().getByRole('radio', { name: '30 יום' }).click();
    await dbtn('יצירת המפתח').click(); await dlg().locator('code.da-key').waitFor(); const sec = (await dlg().locator('code.da-key').innerText()).trim(); await dbtn('העתקת המפתח').click(); await until(() => dbtn('הועתק').count()); await dbtn('סיימתי').click(); await s.idle();
    const find = async (label) => { const d = (await s.call('GET', '/keys')).data; return (d.items || d).find((q) => q.label === label); };
    let k = await find('מפתח תחומים'); check(k && k.scopes?.length && k.scopes.includes('tasks:read') && k.scopes.every((q) => /^(tasks|templates|projects):/.test(q)) && Math.abs(Date.parse(k.expiresAt) - Date.now() - 30 * 86400_000) < 2 * 86400_000, 'server: only the tasks\' area, for thirty days', k);
    check((await key(sec, 'GET', '/v1/tasks?limit=1')).status === 200 && (await key(sec, 'GET', '/v1/people?limit=1')).status >= 400, 'it reads tasks and nothing else', [(await key(sec, 'GET', '/v1/people?limit=1')).status]);
    await s.go('keys/' + k.id); await pbtn('שינוי שם').click(); await dlg().getByLabel('שם המפתח').fill('מפתח תחומים חדש'); await dbtn('שמירה').click(); check(await s.toast('השם נשמר'), 'name: says so'); check((await find('מפתח תחומים חדש'))?.id === k.id, 'server: the new name'); await s.idle(); check((await rowKey(k.id).innerText()).includes('מפתח תחומים חדש'), 'the table has it');
    await pbtn('שינוי').click(); await dlg().getByRole('radio', { name: 'שנה' }).click(); await dbtn('שמירה').click(); check(await s.toast('התוקף נשמר'), 'expiry: says so'); k = await find('מפתח תחומים חדש'); check(Math.abs(Date.parse(k.expiresAt) - Date.now() - 365 * 86400_000) < 2 * 86400_000, 'server: a year', k.expiresAt); await s.idle();
    await pbtn('שינוי').click(); await dlg().getByRole('radio', { name: 'בלי תאריך' }).click(); await dbtn('שמירה').click(); check(await s.toast('התאריך הוסר'), 'no date: says so'); check(!(await find('מפתח תחומים חדש')).expiresAt, 'server: no date'); await s.idle();
    // not saved: leaving asks, whether the screen was reached by the sidebar or loaded at its address
    const order = await page.evaluate(() => new Promise((res) => { const l = []; const a = () => l.push('plain, added first'), b = () => l.push('capture, added second'); addEventListener('hashchange', a); addEventListener('hashchange', b, true); setTimeout(() => { removeEventListener('hashchange', a); removeEventListener('hashchange', b, true); res(l); }, 300); dispatchEvent(new HashChangeEvent('hashchange', { oldURL: location.href, newURL: location.href })); }));
    console.log('  the order this browser calls hashchange listeners in:', order.join(', then '));
    const leaves = async () => { await s.idle(); await panel().getByLabel('מה המפתח יכול').selectOption('all'); await sleep(300); await page.locator('.d-nav__item[href="#/switches"]').click(); return until(async () => await page.locator('.k-sheet').count() && /שינויים שלא נשמרו/.test(await ksheet().innerText()), 2500); };
    await s.go('overview'); await page.locator('.d-nav__item[href="#/keys"]').click(); await s.idle(); await rowKey(k.id).click();
    const asked = await leaves(); check(asked, 'screen reached by the sidebar: leaving with a change asks', { url: page.url(), order }); if (asked) { await sheet('לצאת בלי לשמור'); await s.idle(); }
    await s.go('keys/' + k.id); await page.reload(); await s.idle();
    const asked2 = await leaves(); check(asked2, 'page loaded at the key: leaving with a change asks', page.url());
    if (asked2) { await sheet('חזרה לעריכה'); await sleep(300); check(page.url().includes('#/keys'), 'and stays'); await page.locator('.d-nav__item[href="#/switches"]').click(); await sheet('לצאת בלי לשמור'); await s.idle(); check(page.url().includes('#/switches'), 'or leaves'); }
    check(JSON.stringify((await find('מפתח תחומים חדש')).scopes) === JSON.stringify(k.scopes), 'server: nothing was saved');
    // the window that was closed keeps nothing
    await s.go('keys'); await R('מפתח חדש').click(); await dlg().getByLabel(/שם המפתח/).fill('לא נשמר'); await dbtn('חזרה').click(); await sleep(300); check(!(await find('לא נשמר')), 'closing the new key window makes none');
    // an expired one
    const r = await s.call('POST', `/keys/${k.id}/expire`, { expiresAt: ago(5) }); check(r.status === 200, 'server: a date that passed', r); await s.go('overview'); await s.go('keys'); await chip('לא פעילים').click(); await sleep(300); await rowKey(k.id).click(); await s.idle(); check(/פג תוקף/.test(await panel().innerText()), 'it is under the inactive ones, as expired');
    check(await until(async () => (await key(sec, 'GET', '/v1/tasks?limit=1')).status === 401, 95_000, 1500), 'server refuses it'); await pbtn('שינוי').click(); await dlg().getByRole('radio', { name: '90 יום' }).click(); await dbtn('שמירה').click(); check(await s.toast('התוקף נשמר'), 'a new date'); check(await until(async () => (await key(sec, 'GET', '/v1/tasks?limit=1')).status === 200, 95_000, 1500), 'and it works again');
  }, s);
  await step('keys: last use further back than the last hundred requests', async () => {
    const mk = async (label) => (await s.call('POST', '/keys', { label, actor: 'user:' + uids.yoav, expiresAt: null, scopes: null })).data.id || ((await s.call('GET', '/keys')).data.items || []).find((q) => q.label === label).id;
    const busy = await mk('מפתח עמוס'), old = await mk('מפתח שקט'), never = await mk('מפתח שלא היה');
    const row = (id, cred, at) => E.put('api_log/' + id, { id, at, credential: cred, keyLabel: '', actor: A('yoav'), op: 'tasks.list', opHe: 'רשימת משימות', kind: 'read', ok: true, ms: 12 });
    for (let i = 0; i < 130; i++) await row('busy-' + i, busy, new Date(Date.now() + 1000 - i * 1000).toISOString());
    await row('quiet-1', old, ago(50 * H));
    await s.go('overview'); let from = s.reqs.length; await s.go('keys/' + busy); await sleep(1200); let c = counted(s, from); check(c.firestore === 1, 'a key in use: one Firestore query for the whole table', c);
    const rowT = await rowKey(old).innerText(); check(/לא מאז/.test(rowT), 'the quiet key\'s row says only what is known ("not since")', rowT);
    from = s.reqs.length; await rowKey(old).click(); await s.idle(); await sleep(1200); c = counted(s, from); check(c.firestore === 1, 'opening it asks one query more', c);
    await panel().locator('summary', { hasText: 'פרטי המפתח' }).click(); const t = await panel().innerText(); check(/שימוש אחרון[\s\S]{0,40}(לפני יומיים|לפני 2 ימים|לפני 50 שעות|\d+\.\d+)/.test(t) && !/לא מאז/.test(t), 'the panel says exactly when', t.slice(-300));
    from = s.reqs.length; await rowKey(never).click(); await s.idle(); await sleep(1000); c = counted(s, from); await panel().locator('summary', { hasText: 'פרטי המפתח' }).click(); check(c.firestore === 1 && /עוד לא היה בשימוש/.test(await panel().innerText()), 'one never used: one query, "not used yet"', [c, (await panel().innerText()).slice(-200)]);
    await s.go('overview'); from = s.reqs.length; await s.go('keys/' + old); await sleep(1200); c = counted(s, from); check(c.firestore === 2, 'opened by its address: the table\'s query and its own, no more', c);
    x.requests.keysFar = { keys: c };
  }, s);

  // ---------- queue ----------
  await step('queue: filters, stop a push, the person\'s card, the counter', async () => {
    await E.put('push_jobs/pj-drop', { id: 'pj-drop', kind: 'task', title: 'התראה לביטול', body: 'x', to: [uids.yoav], createdBy: A('dana'), createdAt: ago(1), sentAt: null, attempts: 0 });
    await E.put('email_outbox/donation_dn-fail', { kind: 'donation', col: 'donations', refId: 'dn-pause', uid: uids.michal, status: 'failed', attempts: 1, reason: 'rejected', error: '400', createdAt: ago(H), updatedAt: ago(H), nextAt: null, firstAttemptAt: ago(H), provider: 'brevo' });
    await s.go('queue'); await R('רענון').click(); await s.idle(); check((await main()).includes('התראה לביטול'), 'refresh brings the new push');
    const n = () => page.locator('table[aria-label="תור שליחה"] tbody tr[data-row]').count(); const seen = {};
    for (const c of ['נכשלו', 'מחכים', 'נשלחו היום']) { await chip(c).click(); await sleep(250); seen[c] = [await n(), Number((await chip(c).innerText()).replace(/\D/g, ''))]; }
    check(Object.values(seen).every(([a, b]) => a === b), 'each state shows as many rows as it says', seen);
    await chip('הכל').click(); await chip('מיילים').click(); await sleep(250); check(!(await page.locator('table[aria-label="תור שליחה"]').innerText()).includes('התראה לביטול'), 'only mails'); await chip('התראות').click(); await sleep(250); check((await page.locator('table[aria-label="תור שליחה"]').innerText()).includes('התראה לביטול'), 'only pushes'); await chip('הכל').click(); await sleep(250);
    if (await page.locator('.dn-more').count()) { const b = await n(); await page.locator('.dn-more button').click(); await sleep(250); check(await n() > b || (await chip('נשלחו היום').getAttribute('aria-pressed')) === 'true', 'the hidden lines open'); await chip('הכל').click(); }
    await rowKey('pj-drop').click(); await pbtn('לא לשלוח').click(); await sheet('כן, לא לשלוח'); check(await s.toast('ההתראה לא תישלח לטלפון'), 'a push stopped: says so');
    await E.cronAll(w); const pj = await E.get('push_jobs/pj-drop'); check(!pj || pj.cancelled || pj.sentAt, 'Firestore: it waits no more', pj); check(await until(async () => !(await page.locator('table[aria-label="תור שליחה"]').innerText()).includes('התראה לביטול')), 'and it left the table');
    const failed = (await s.call('GET', '/queue')).data.emails.filter((e) => e.status === 'failed').length; check((await page.locator('.d-nav__count').innerText().catch(() => '')).trim() === String(failed), 'the sidebar counts the failed ones', [await page.locator('.d-nav__count').allInnerTexts(), failed]);
    await rowKey('donation_dn-fail').click(); await s.idle(); await until(() => panel().locator('.dn-card a, .dn-card button').count()); await panel().locator('.dn-card a, .dn-card button').first().click(); check(await until(() => page.url().includes('#/people/' + uids.michal)), 'the person\'s card opens', page.url());
    await E.put('email_outbox/donation_dn-ghost', { kind: 'donation', col: 'donations', refId: 'dn-pause', uid: 'walk-gone', status: 'failed', attempts: 1, reason: 'no_profile', error: '', createdAt: ago(H), updatedAt: ago(H), nextAt: null });
    await s.go('queue'); await R('רענון').click(); await s.idle(); await rowKey('donation_dn-ghost').click(); await s.idle(); await sleep(600); if (await panel().locator('.dn-card a, .dn-card button').count()) { await panel().locator('.dn-card a, .dn-card button').first().click(); check(await until(async () => /אין כרטיס לאדם הזה/.test(await panel().innerText())), 'a deleted person\'s card is said to be gone', (await panel().innerText()).slice(0, 300)); } else check(!/undefined/.test(await panel().innerText()), 'a deleted person: no card offered');
  }, s);

  // ---------- data ----------
  await step('data: browsing, filters, more, inside a record, the stored fields, exports', async () => {
    await s.go('data'); const cols = await page.locator('.dd-col').allInnerTexts(); check(cols.length > 8, 'the farm\'s collections', cols.length);
    await sw('אוספי מערכת').click(); await sleep(300); const all = await page.locator('.dd-col').count(); check(all > cols.length, 'the system ones too', [cols.length, all]);
    const bad = []; for (let i = 0; i < all; i++) { await page.locator('.dd-col').nth(i).click(); await s.idle(); const t = await trouble(s); if (t.m || t.alerts.length) bad.push([await page.locator('.dd-col').nth(i).innerText(), t]); await sleep(150); }
    check(!bad.length, `every one of the ${all} collections opens`, bad);
    await s.go('data/vendor_requests'); await s.idle(); const n = () => page.locator('.dd-recs tbody tr[data-row]').count(); const n0 = await n(); await page.locator('.dd-more button', { hasText: 'עוד' }).click(); await s.idle(); check(n0 === 200 && await n() === 205, 'more: two hundred, then the rest', [n0, await n()]);
    await search('חיפוש ב').fill('בקשה 204'); await sleep(400); check(await n() === 1, 'search in the collection', await n()); await search('חיפוש ב').fill('');
    await s.go('data/tasks'); await s.idle(); const seen = {}; for (const c of ['פתוחות', 'בוצעו']) { await chip(c).click(); await sleep(300); seen[c] = [await n(), Number((await chip(c).innerText()).replace(/\D/g, ''))]; } check(Object.values(seen).every(([a, b]) => a === b), 'the state chips', seen);
    await s.go('data/events/ev-winter'); await s.idle(); await panel().locator('.dd-subs button').first().click(); await s.idle(); check((await page.locator('.dd-recs').innerText()).includes('דבש הנגב'), 'what is inside the record opens'); await page.locator('.d-main button', { hasText: /^חזרה ל/ }).click(); await s.idle(); check((await panel().innerText()).includes('פסטיבל החורף'), 'and back to it');
    await panel().getByRole('button', { name: /^כל השדות כמו שהם שמורים/ }).click(); check(/published/.test(await dlg().innerText()), 'the fields as stored'); await dismiss();
    for (const [p, why] of [['users/' + uids.michal, 'people'], ['api_log/busy-0', 'the log']]) { await s.go('data/' + p); await s.idle(); check(!(await pbtn('עריכה זהירה').count()) && !(await pbtn('מחיקה').count()) && await pbtn('גרסה קודמת').count(), `${why}: read only`); const r = await s.call('POST', '/data/edit', { path: p, set: { displayName: 'x' }, updateTime: '2020-01-01T00:00:00Z' }); check(r.status >= 400, `${why}: the server refuses an edit (${r.status})`, r); }
    for (const c of ['donations', 'tickets', 'users']) { await s.go('data/' + c); await s.idle(); const d = await s.download(() => R('ייצוא האוסף').click()); const want = (await E.list(c)).length; check(d.name === `havat-ravve-${c}.csv` && d.bytes[0] === 0xef && d.text.trim().split(/\r?\n/).length >= want + 1, `export ${c}: all ${want}`, [d.name, d.text.split('\n').length]); check(!/(^|,|")[=+@][A-Za-z]/m.test(d.text.replace(/"'[=+@]/g, '"')), `export ${c}: formula-safe`, d.text.split('\n').find((l) => /(^|,|")[=+@][A-Za-z]/.test(l))); }
  }, s);
  await step('data: edit a yes/no and a date, a bad date, not saved, changed meanwhile', async () => {
    await s.go('data/tasks/m-edit'); await s.idle(); await pbtn('עריכה זהירה').click(); await panel().getByRole('switch', { name: /^דחוף/ }).click(); await panel().getByLabel(/^עד מתי|^תאריך יעד/).first().fill('2026-12-24');
    await panel().getByRole('button', { name: /^שמירה \(2\)/ }).click(); const t = await dlg().innerText(); check(/24\.12\.2026/.test(t), 'before and after, with the date in Israel\'s order', t.slice(0, 300)); await dbtn('חזרה לעריכה').click(); await sleep(250); check((await E.get('tasks/m-edit')).urgent === false, 'back to editing writes nothing');
    await panel().getByRole('button', { name: /^שמירה \(2\)/ }).click(); await dbtn('כן, לשמור').click(); check(await until(async () => !(await page.locator('.d-dialog [role=dialog]').count()) && pbtn('עריכה זהירה').count()), 'saved: the window and the form close'); const d = (await until(async () => { const q = await E.get('tasks/m-edit'); return q.urgent && q; })) || await E.get('tasks/m-edit'); check(d.urgent === true && d.dueDate === '2026-12-24', 'Firestore: both, and their types', [d.urgent, d.dueDate]); await s.idle();
    await pbtn('עריכה זהירה').click(); await panel().getByLabel('הערה').first().fill('לא נשמר'); await rowKey('tasks/m-stale').click(); check(await ksheet().count() && /שינויים שלא נשמרו/.test(await ksheet().innerText()), 'another record: asks'); await sheet('חזרה לעריכה'); await sleep(300); check(await panel().getByLabel('הערה').first().inputValue() === 'לא נשמר', 'back, with what was typed'); await pbtn('ביטול').click(); await sleep(200); check((await E.get('tasks/m-edit')).note === 'לפני', 'cancel writes nothing');
    await s.go('data/events/ev-winter'); await s.idle(); await pbtn('עריכה זהירה').click(); const price = panel().getByLabel(/^מחיר/).first(); await price.fill('abc'); await sleep(200); check(/צריך מספר/.test(await panel().innerText()) && await panel().getByRole('button', { name: /^שמירה/ }).isDisabled(), 'a number must be one'); await price.fill('65'); await panel().getByRole('button', { name: /^שמירה \(1\)/ }).click(); await dbtn('כן, לשמור').click(); await s.toast('נשמר'); check(await until(async () => (await E.get('events/ev-winter')).price === 65), 'Firestore: a number, not text', (await E.get('events/ev-winter')).price);
    await s.go('data/tasks/m-edit'); await s.idle(); await pbtn('עריכה זהירה').click(); await panel().getByLabel('הערה').first().fill('לא נשמר'); await page.locator('.d-nav__item[href="#/monitor"]').click(); await sleep(700); const q = await page.locator('.k-sheet').count(); check(q && page.url().endsWith('#/data/tasks/m-edit'), 'a record being edited is not left by the sidebar without a question', page.url()); if (q) { await sheet('לצאת בלי לשמור'); await s.idle(); }
    s.allowed.push(/409|412|400/); await s.go('data/tasks/m-stale'); await s.idle(); await pbtn('עריכה זהירה').click(); await panel().getByLabel('הערה').first().fill('שלי'); await E.put('tasks/m-stale', { ...(await E.get('tasks/m-stale')), id: undefined, note: 'של מישהו אחר' }); await panel().getByRole('button', { name: /^שמירה \(1\)/ }).click(); await dbtn('כן, לשמור').click(); check(await s.toast('מישהו שינה את זה בינתיים'), 'someone changed it: says so'); check((await E.get('tasks/m-stale')).note === 'של מישהו אחר', 'Firestore: not overwritten'); await sleep(300);
  }, s);
  await step('data: versions, thirty days', async () => {
    await s.go('overview'); await s.go('data/tasks/m-edit'); await s.idle(); await pbtn('גרסה קודמת').click(); await s.idle(); await sleep(600); const t0 = await dlg().innerText(); check(/נבדקו/.test(t0), 'the backups looked at are said', t0.slice(0, 200));
    if (await dbtn('לבדוק 30 יום').count()) { await dbtn('לבדוק 30 יום').click(); await s.idle(); await sleep(800); check(!(await dbtn('לבדוק 30 יום').count()), 'thirty days looked at'); } else check(false, 'thirty days is offered', t0.slice(0, 300));
    const go = dlg().getByRole('button', { name: 'להשוות' }).first(); check(await go.count(), 'a version to compare with'); await go.click(); check(/אז/.test(await dlg().innerText()) && /היום/.test(await dlg().innerText()), 'side by side'); await dbtn('כל הגרסאות').click(); check(await dlg().getByRole('button', { name: 'להשוות' }).count(), 'and back to the list');
  }, s);

  // ---------- backups ----------
  await step('backups: download from the restore window, a record gone since, a bin record made again', async () => {
    await s.go('backups'); const first = page.locator('table[aria-label="גיבויים שמורים"] tbody tr').first(); await first.getByRole('button', { name: 'שחזור מכאן' }).click(); const d = await s.download(() => dbtn('הורדת הקובץ').click()); check(/^havat-ravve-backup-.*\.ndjson$/.test(d.name) && d.text.includes('משימה שנעלמה מאז הגיבוי'), 'the file, from the window', d.name);
    const inBackup = d.text.trim().split('\n').map((l) => JSON.parse(l)); check(inBackup.length > 100, 'every line is a record', inBackup.length);
    await fetch(`${E.DOCS}/tasks/m-lost`, { method: 'DELETE', headers: { authorization: 'Bearer owner' } });
    await dlg().locator('tr', { hasText: /^משימות/ }).first().getByRole('button', { name: 'לפתוח' }).click(); await s.idle(); await dlg().getByRole('searchbox').fill('שנעלמה'); await dlg().locator('tr', { hasText: 'שנעלמה' }).getByRole('button', { name: 'להשוות' }).click(); await s.idle(); check(/הרשומה לא קיימת היום/.test(await dlg().innerText()), 'a record gone since: says so');
    await dbtn('שחזור למצב בגיבוי').click(); await sheet('כן, לשחזר'); check(await s.toast('הרשומה הוחזרה', 15_000), 'brought back: says so'); check(await until(async () => (await E.get('tasks/m-lost'))?.title === 'משימה שנעלמה מאז הגיבוי'), 'Firestore: it is back'); await s.closeAll();
    await s.go('data/tasks/m-bin'); await s.idle(); await pbtn('מחיקה').click(); await sheet('מחיקה'); await until(async () => !(await E.get('tasks/m-bin'))); await task('m-bin', 'משימה שנוצרה מחדש', { note: 'החדשה' });
    await s.go('backups'); await s.idle(); await page.locator('.dd-item', { hasText: 'משימה שנוצרה מחדש' }).getByRole('button', { name: 'להחזיר' }).click(); await dbtn('להחזיר').click(); check(await s.toast('לא שוחזר'), 'made again meanwhile: not overwritten, and says so'); check((await E.get('tasks/m-bin')).note === 'החדשה', 'Firestore: the new one stays');
  }, s);

  // ---------- import ----------
  await step('import: shopping from a file, a mended cell, a repeat, an old undo', async () => {
    const f = path.join(E.SCRATCH, 'walk.csv'); fs.writeFileSync(f, '﻿פריט,כמות\nשמן זית מהקובץ,2\nקמח מהקובץ,3\n');
    await s.go('import'); await chip('רשימת קניות').click(); const xl = path.join(E.SCRATCH, 'walk.xlsx'); fs.writeFileSync(xl, 'PK'); await page.locator('input[type=file]').setInputFiles(xl); await sleep(500); check(/CSV/.test(await s.text()) && !(await page.locator('.d-steps [aria-current]').innerText().catch(() => '')).includes('בדיקה'), 'an xlsx file is refused in words');
    await page.locator('input[type=file]').setInputFiles(f); await until(async () => (await page.getByLabel('השורות מאקסל').inputValue()).includes('קמח')); await R('המשך').click(); await s.idle(); if (await pbtn('לבדיקה').count()) { const n = await panel().locator('select').count(); check(n >= 2, 'the columns are matched', n); await pbtn('לבדיקה').click(); await s.idle(); }
    await panel().getByRole('button', { name: /^ייבוא / }).click(); await sheet('כן, להוסיף'); check(await until(async () => (await panel().innerText()).includes('הייבוא נגמר'), 30_000), 'import ended', (await panel().innerText()).slice(0, 200));
    const items = (await E.list('shopping')).filter((i) => /מהקובץ/.test(i.title || i.text || '')); check(items.length === 2, 'Firestore: both items', items.map((i) => i.title));
    await pbtn('ייבוא נוסף').click(); await s.idle(); await chip('משימות').click(); await page.getByLabel('השורות מאקסל').fill('משימה\tתאריך יעד\nמשימה כפולה\t\nייבוא מתוקן\tלא תאריך'); await R('המשך').click(); await s.idle(); if (await pbtn('לבדיקה').count()) { await pbtn('לבדיקה').click(); await s.idle(); }
    check(/כבר קיים/.test(await page.locator('table[aria-label="השורות שהודבקו"]').innerText()), 'a repeat is marked');
    await page.locator('button.dd-cell--bad').first().click(); await page.getByLabel('תיקון', { exact: true }).fill('24.12.2026'); await page.keyboard.press('Enter'); await sleep(400); check(!(await page.locator('button.dd-cell--bad').count()), 'a bad cell is mended in place');
    const dupBtn = panel().locator('.d-fact', { hasText: 'כפילויות' }).getByRole('button'); const before = await panel().getByRole('button', { name: /^ייבוא / }).innerText(); await dupBtn.click(); await sleep(250); const after = await panel().getByRole('button', { name: /^ייבוא / }).innerText(); check(before !== after, 'the repeat can be let in', [before, after]); await dupBtn.click(); await sleep(250);
    await panel().getByRole('button', { name: /^ייבוא / }).click(); await sheet('כן, להוסיף'); await until(async () => (await panel().innerText()).includes('הייבוא נגמר'), 30_000); const tl = (await E.list('tasks')).filter((t) => t.title === 'ייבוא מתוקן' || t.title === 'משימה כפולה'); check(tl.length === 2 && tl.find((t) => t.title === 'ייבוא מתוקן')?.dueDate === '2026-12-24', 'Firestore: the mended one is in, the repeat is not', tl.map((t) => [t.title, t.dueDate]));
    // undo the first import from the list, after one of its items was changed
    await E.put('shopping/' + items[0].id, { ...items[0], id: undefined, qty: '9' }); await s.go('overview'); await s.go('import'); await s.idle(); await page.locator('.dd-item', { hasText: 'פריטי קניות' }).getByRole('button', { name: 'לבטל את הייבוא' }).click(); await sheet('כן, לבטל את הייבוא'); await s.toast('הייבוא בוטל', 15_000);
    const left = (await until(async () => { const l = (await E.list('shopping')).filter((i) => /מהקובץ/.test(i.title || i.text || '')); return l.length === 1 && l; })) || []; check(left.length === 1 && left[0].qty === '9', 'undone from the list: the changed item stays', left.map((i) => [i.title, i.qty]));
  }, s);

  // ---------- run ----------
  await step('run: the list, technical details, more fields, a refused run', async () => {
    await s.go('run'); const ops = () => page.locator('[data-op]').count(); const common = await ops(); await page.getByRole('button', { name: /^כל הפעולות/ }).first().click(); await sleep(300); const all = await ops(); check(all > common, 'all the operations', [common, all]); const seen = {};
    for (const c of ['קריאה', 'משנה']) { await chip(c).click(); await sleep(250); seen[c] = await ops(); } check(seen['קריאה'] + seen['משנה'] === all, 'reading plus changing is all of them', [seen, all]); await chip('הכל').click(); await page.locator('.d-main').getByRole('searchbox').first().fill('tasks.create'); await sleep(300); check(await page.locator('[data-op="tasks.create"]').count() === 1, 'search by the operation\'s name');
    await page.locator('[data-op="tasks.create"]').click(); await s.idle(); await R('פרטים טכניים').click(); check(/tasks:create/.test(await dlg().innerText()), 'the technical details'); await dismiss(); await s.go('run/tasks.list'); await s.idle(); const f0 = await page.locator('.da-form input, .da-form textarea, .da-form select').count(); const more = page.getByRole('button', { name: /^עוד (שדה|\d+ שדות)/ }); await more.click(); await sleep(200); check(await page.locator('.da-form input, .da-form textarea, .da-form select').count() > f0, 'more fields');
    s.allowed.push(/400|404|409|422/); await s.go('run/tasks.get'); await s.idle(); const id = page.locator('.da-form input').first(); await id.fill('אין-כזאת'); await R('הרצה').click(); await s.idle(); await sleep(500); const t = await main(); check(/נכשל|לא נמצא/.test(t) && !/undefined/.test(t), 'a refused run says why', t.slice(-200));
    await s.go('run/tasks.list'); await s.idle(); await R('הרצה').click(); await s.idle(); await until(async () => /הצליח/.test(await main())); await R('להציג את התשובה המלאה').click(); await dbtn('העתקה').click(); check(await s.toast('הועתק'), 'copy: says so'); check(/"items"/.test(await page.evaluate(() => navigator.clipboard.readText())), 'the clipboard has the answer');
  }, s);

  // ---------- the reading screens ----------
  await step('money, speed, traffic, stats: every export and toggle', async () => {
    await s.go('money'); const d = await s.download(() => R('אקסל').click()); check(/^havat-ravve-payments-\d{4}-\d{2}-\d{2}\.csv$/.test(d.name) && d.bytes[0] === 0xef && /[א-ת]/.test(d.text), 'money export: a Hebrew CSV with BOM', d.name); const rows = await page.locator('table[aria-label="תשלומים פתוחים"] tbody tr').count(); check(d.text.trim().split(/\r?\n/).length === rows + 1, 'it holds the open payments', [rows, d.text.split('\n').length]);
    const evs = await page.locator('.df-ev').count(); if (evs > 1) { await page.locator('.df-ev').nth(1).click(); await s.idle(); check(await page.getByRole('button', { name: /^בחזרה אל/ }).count(), 'an event opens'); await page.getByRole('button', { name: /^בחזרה אל/ }).click(); await sleep(200); check(!(await page.getByRole('button', { name: /^בחזרה אל/ }).count()), 'and back'); } else check(false, 'events to open', evs);
    await s.go('speed'); const op = page.locator('table[aria-label="זמני התשובה לפי פעולה"] tbody tr[data-row]').first(); await op.click(); check(await R('סגירה').count(), 'an operation opens'); await R('סגירה').click(); const n = () => page.locator('table[aria-label="זמני התשובה לפי פעולה"] tbody tr').count(); const tg = page.locator('.ds-legend button').first(); if (await tg.count()) { const a = await n(); await tg.click(); await sleep(200); check(await n() !== a, 'all operations and back', [a, await n()]); }
    await s.go('traffic'); const t = page.getByRole('button', { name: /^הכול · / }).first(); if (await t.count()) { await t.click(); check(await R('להראות פחות').count(), 'a long list opens'); await R('להראות פחות').first().click(); check(!(await R('להראות פחות').count()), 'and closes'); } else console.log('  traffic: no list is long enough to open');
  }, s);
  await step('security: filters, search, periods, export, and what the lines say', async () => {
    const l = await log(); const has = (re) => l.some((t) => re.test(t)); const show = (re) => l.filter((t) => re.test(t)).slice(0, 4);
    for (const n of ['מצב תחזוקה', 'הרשמה פתוחה', 'כל המפתחות פעילים', 'מיילים על תשלומים', 'התראות לטלפון', 'הודעות במייל לנרשמים', 'קריאה בלבד', 'ניקוי רשומות ישנות', 'בדיקת האתר והמכסה']) { const p = n.replace(/[.*+?^$()|[\]\\]/g, '\\$&'); check(has(new RegExp('הדליק מתג: ' + p)) && has(new RegExp('כיבה מתג: ' + p)), `switch ${n}: on and off, each said`, show(/מתג/)); }
    check(has(/שינה: ההודעה במסך התחזוקה/), 'the maintenance message was changed', show(/התחזוקה|הודע/));
    check(has(/תפקיד.*תמר לקידום.*בעלים/) && has(/תפקיד.*תמר לקידום.*אורח/), 'a role change: who, and to what', show(/תפקיד/));
    for (const j of ['גיבוי לילי', 'ניקוי רשומות ישנות', 'התראות לטלפון']) check(has(new RegExp('משימה מתוזמנת.*' + j)), `a job run by hand: which (${j})`, show(/משימה מתוזמנת/));
    check(has(/מחיקת אדם.*שני/), 'deleting a person: who', show(/מחיקת אדם/));
    check(has(/תפקיד מראש.*ahead\.walk/), 'the line of a role set ahead says which mail', show(/מראש/));
    check(has(/מפתח.*מפתח תחומים/), 'the lines of the keys say which key', show(/מפתח/));
    check(has(/התראות.*(דלוק|כבוי|הדליק|כיבה)/), 'the line of the alert settings says which one and which way', show(/הגדרות התראות/));
    const bare = l.map((t) => t.replace(/[\w.+-]+@[\w.-]+/g, '')); const code = bare.filter((t) => /[a-z]+\.[a-zA-Z]+|undefined|\[object/.test(t)); check(!code.length, 'no code names', code.slice(0, 4));
    const fails = l.filter((t) => /נכשל/.test(t));
    check(fails.length > 0 && !fails.some((t) => /\/v1\//.test(t)), 'a failed action of the console is named in words, not by its address', fails.slice(0, 3));
    await page.getByRole('button', { name: /^הכל/ }).first().click(); await s.idle(); const edits = (await page.locator('table[aria-label="יומן אבטחה"] tbody tr').allInnerTexts()).filter((t) => /אין הרשאה|קריאה בלבד|נדחה/.test(t) && /קונסולה/.test(t)).map((t) => t.replace(/\s+/g, ' '));
    check(!edits.some((t) => /מפתח API נדחה/.test(t)), 'a refused action of the console is not listed again as an API key\'s', edits.slice(0, 4));
    await key('nonsense-key', 'GET', '/v1/tasks?limit=1'); const n = () => page.locator('table[aria-label="יומן אבטחה"] tbody tr[data-row], table[aria-label="יומן אבטחה"] tbody tr').count();
    for (const c of ['הכל', 'נדחו', 'נחסמו', 'בקונסולה']) { await page.getByRole('button', { name: new RegExp('^' + c) }).first().click(); await s.idle(); const t = await trouble(s); check(!t.alerts.length && (!t.m || /אין הרשאה לפעולה/.test(t.m)), `filter ${c}`, t); }
    for (const c of ['יממה', '7 ימים', '30 ימים']) { await R(c).click(); await s.idle(); const t = await trouble(s); check(!t.alerts.length && (!t.m || /אין הרשאה לפעולה/.test(t.m)), `period ${c}`, t); }
    await search('חיפוש: אדם').fill('תמר'); await sleep(400); const few = await n(); check(few > 0 && few < 10, 'search', few); const d = await s.download(() => R('אקסל').click()); check(d.text.trim().split(/\r?\n/).length === few + 1 && /תמר לקידום/.test(d.text), 'the export holds what was searched', [few, d.text.split('\n').length]);
    await page.locator('table[aria-label="יומן אבטחה"] tbody tr').first().click().catch(() => {});
    await s.shot('security-actions');
  }, s);

  // the walk's own refused calls (it asked the server for what the screen does not offer) are not left for the next part to read
  for (const l of await E.list('api_log')) if (l.ok === false && l.code === 'FORBIDDEN') await fetch(`${E.DOCS}/api_log/${l.id}`, { method: 'DELETE', headers: { authorization: 'Bearer owner' } });

  // ---------- out ----------
  await step('sign out', async () => {
    await s.go('overview'); await page.getByRole('button', { name: 'יציאה', exact: true }).click(); check(await until(async () => !(await page.locator('.d-nav__item').count()), 10_000), 'the console closes'); await sleep(600);
    const t = await s.text(); check(/Google|כניסה|להתחבר|התחברות/.test(t), 'and offers signing in', t.slice(0, 200)); s.take();
  }, s);
  await s.ctx.close();
}
