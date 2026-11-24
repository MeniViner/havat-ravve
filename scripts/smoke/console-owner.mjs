// The owner's walk itself (scripts/console-walk.mjs): every screen and every action once, on the screen and in the data.
import fs from 'node:fs';
export async function ownerWalk(x) {
  const { E, check, step, until, sleep, session, openAll, counted, requests, w, site, setPart, uids, IL, mail } = x;
  setPart('owner');
  await E.cronAll(w); await E.cronAll(w);
  const s = await session({ site: site.base, api: w.base, who: 'owner' });
  const { page } = s;
  const R = (o) => page.getByRole('button', { name: o, exact: true });
  const panel = () => page.locator('aside.d-panel').last();
  const pbtn = (n) => panel().getByRole('button', { name: n, exact: true });
  const dlg = () => page.locator('.d-dialog [role=dialog]').last();
  const dbtn = (n) => dlg().getByRole('button', { name: n, exact: true });
  const sheet = async (go) => { const b = page.locator('.k-sheet').last().getByRole('button', { name: go, exact: true }); await b.click(); };
  const sw = (n) => page.getByRole('switch', { name: n, exact: true });
  const rowKey = (k) => page.locator(`tr[data-row="${k}"]`).first();
  const key = async (secret, method, p, body) => { const r = await fetch(w.base + p, { method, headers: { authorization: 'Bearer ' + secret, ...(body ? { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const noToast = async () => { await sleep(150); };

  await step('sign in', async () => { await s.idle(); check(await page.locator('.d-head__title', { hasText: 'מצב כללי' }).count(), 'an owner reaches the console at 1440x900', (await s.text()).slice(0, 300)); }, s);
  await openAll(s, 'first', {});

  // ---------- refresh, full check ----------
  await step('refresh and full check', async () => {
    await s.go('overview');
    let from = s.reqs.length; await R('רענון').click(); await s.idle();
    check(counted(s, from).worker.some((q) => q === 'GET /overview'), 'refresh reads the overview again', counted(s, from).worker);
    from = s.reqs.length; await R('בדיקה מלאה עכשיו').click();
    check(await s.toast('הבדיקה הסתיימה', 15000), 'full check: says it ended');
    await s.idle();
    check(counted(s, from).worker.some((q) => /^POST/.test(q)), 'full check really ran on the server', counted(s, from).worker);
    const m = await s.call('GET', '/monitor'); const newest = Math.max(...[...JSON.stringify(m.data).matchAll(/"(20\d\d-[^"]+Z)"/g)].map((q) => Date.parse(q[1])).filter((t) => t <= Date.now())); check(m.status === 200 && Date.now() - newest < 60_000, 'server: checked within the last minute', new Date(newest).toISOString());
  }, s);

  // ---------- people ----------
  await step('people: role, block, notes', async () => {
    const u = uids.orly; await s.go('people/' + u);
    check(await panel().getByRole('heading', { name: /אורלי/ }).count(), 'the address opens her panel');
    await panel().getByRole('radio', { name: /^מנהל/ }).click(); await sheet('כן, לשנות');
    check(await s.toast('התפקיד עודכן'), 'role change: says so');
    check(await until(async () => (await E.get('users/' + u)).role === 'manager'), 'Firestore: role manager');
    check((await E.list('activity')).some((a) => a.refId === u && a.action === 'role' && Date.now() - Date.parse(a.at) < 60_000), 'the change is written in activity', (await E.list('activity')).filter((a) => a.refId === u).map((a) => a.action));
    await until(() => panel().getByRole('radio', { name: /^מנהל/, checked: true }).count());
    check(await panel().getByRole('radio', { name: /^מנהל/, checked: true }).count(), 'the panel shows the new role');
    await s.idle(); { const dm = IL().slice(5).split('-').reverse().map(Number).join('.'); const tx = (await panel().innerText()).split('שינויי הרשאות')[1] || ''; check(tx.includes(dm) || /היום/.test(tx), 'permission changes list today\'s change', tx.slice(0, 300)); }
    await panel().getByRole('radio', { name: /^מתנדב/ }).click(); await sheet('כן, לשנות');
    check(await until(async () => (await E.get('users/' + u)).role === 'staff'), 'Firestore: back to staff');
    await sleep(700);
    await pbtn('חסימה').click(); await sheet('כן, לחסום');
    check(await until(async () => (await E.get('users/' + u)).status === 'blocked'), 'Firestore: blocked');
    check(await until(() => pbtn('שחרור החסימה').count()), 'the button turns to release');
    await pbtn('שחרור החסימה').click(); await sheet('כן, לשחרר');
    check(await s.toast('החסימה שוחררה'), 'release: says so');
    check(await until(async () => (await E.get('users/' + u)).status === 'active'), 'Firestore: active again');
    await panel().getByRole('button', { name: 'להוסיף', exact: true }).click();
    await dlg().getByLabel('הערות', { exact: true }).fill('הערה לבדיקה: "גרשיים" ופסיק,'); await dbtn('שמירה').click();
    check(await s.toast('ההערות נשמרו'), 'notes: says so');
    check(await until(async () => JSON.stringify(await E.get('users/' + u)).includes('הערה לבדיקה') || (await Promise.all([E.list('user_notes'), E.list('userNotes')]).then((r) => JSON.stringify(r))).includes('הערה לבדיקה')), 'Firestore: the notes are saved');
    check(await until(async () => (await panel().innerText()).includes('הערה לבדיקה')), 'the panel shows the notes');
    const d = await s.download(() => R('אקסל').click());
    check(d.name === 'havat-ravve-people.csv' && d.bytes[0] === 0xef, 'people export: a CSV with BOM for Excel', d.name);
    check(d.text.includes('אורלי לוי') && d.text.includes('שם'), 'people export: Hebrew');
    check(!/(^|,|")=HYPERLINK/m.test(d.text.replace(/"'=/g, '')) && /'=HYPERLINK/.test(d.text), 'people export: formula-safe (leading =)', d.text.split('\n').find((l) => l.includes('HYPERLINK')));
  }, s);

  // ---------- jobs ----------
  await step('jobs: pause, resume, run, full round', async () => {
    await s.go('jobs');
    const swState = async () => (await s.call('GET', '/switches')).data.switches;
    await sw('מיילים על תשלומים').click();
    check(await s.toast('מיילים על תשלומים: בהשהיה'), 'pause email: says so');
    check((await swState()).emailPaused === true, 'server: emailPaused');
    await sw('מיילים על תשלומים').click();
    check(await s.toast('מיילים על תשלומים: פועלת שוב'), 'resume: says so');
    check((await swState()).emailPaused === false, 'server: not paused');
    await sw('גיבוי לילי').click(); await sheet('כן, להשהות');
    check(await until(async () => (await swState()).backupPaused === true), 'pausing the backup asks, then pauses');
    await sw('גיבוי לילי').click(); check(await until(async () => (await swState()).backupPaused === false), 'backup resumed');
    await s.idle(); await rowKey('monitor').getByRole('button', { name: 'להריץ עכשיו' }).click();
    check(await s.toast('בדיקת האתר והמכסה: רצה עכשיו', 15000), 'run one job: says so');
    const j = (await s.call('GET', '/jobs')).data.jobs.find((q) => q.id === 'monitor');
    const jn = Math.max(...[...JSON.stringify(j).matchAll(/"(20\d\d-[^"]+Z)"/g)].map((q) => Date.parse(q[1])).filter((t) => t <= Date.now())); check(Date.now() - jn < 60_000, 'server: the monitor job ran now', j);
    await s.idle(); await R('להריץ סבב מלא עכשיו').click(); await sheet('כן, להריץ');
    check(await until(async () => (await dlg().innerText()).includes('הסבב הסתיים.'), 90_000), 'full round: runs to its end', await dlg().innerText().catch(() => ''));
    const t = await dlg().innerText(); check(!/נכשל|שגיאה|undefined/.test(t), 'full round: no step failed', t.replace(/\n+/g, ' · ').slice(0, 500));
    const jr = (await s.call('GET', '/jobs')).data; const late = jr.jobs.filter((q) => ['email', 'push', 'monitor'].includes(q.id) && !([...JSON.stringify(q).matchAll(/"(20\d\d-[^"]+Z)"/g)].some((z) => Math.abs(Date.now() - Date.parse(z[1])) < 120_000))).map((q) => q.id); check(!late.length, 'server: email, push and monitor all ran in the round', late);
  }, s);

  // ---------- switches ----------
  await step('switches: read-only on and off with a reason; history; security log', async () => {
    await s.go('switches');
    const st = async () => (await s.call('GET', '/switches')).data; const h0 = (await st()).history?.length || 0;
    const flip = async (name, go, reason) => { await sw(name).click(); const sh = page.locator('.k-sheet').last(); await sh.getByLabel('למה (לא חובה)').fill(reason); await sh.getByRole('button', { name: go, exact: true }).click(); await until(async () => !(await page.locator('.k-sheet').count())); await s.idle(); };
    await flip('קריאה בלבד', 'כן, קריאה בלבד', 'בדיקה: סיבה ראשונה');
    let v = await st(); check(v.switches.readOnly === true, 'server (KV): readOnly on');
    check((await E.get('settings/switches'))?.readOnly === true, 'Firestore app copy: readOnly on', await E.get('settings/switches'));
    check(v.history?.length === h0 + 1 && v.history.some((q) => q.reason === 'בדיקה: סיבה ראשונה'), 'server history: one new line, with the reason', v.history?.slice(0, 2));
    const tb = await page.locator('table[aria-label="שינויים אחרונים במתגים"]').innerText();
    check(/הדליק[הו]?:? ?.*קריאה בלבד/.test(tb) && tb.includes('בדיקה: סיבה ראשונה') && tb.includes('אליה'), 'the history table: who, what, why', tb.slice(0, 300));
    
    await flip('קריאה בלבד', 'כן, לצאת', 'בדיקה: סיבה שנייה');
    v = await st(); check(v.switches.readOnly === false && (await E.get('settings/switches'))?.readOnly === false, 'off again, server and app copy');
    await flip('הודעות במייל לנרשמים', 'כן, להשהות', 'עומס'); await flip('הודעות במייל לנרשמים', 'כן, להדליק', 'נגמר');
    check((await st()).switches.broadcastEmailPaused === false, 'broadcast pause: on and off');
    const before = JSON.stringify((await st()).switches);
    await sw('מצב תחזוקה').click(); check(await page.locator('.k-sheet').count(), 'maintenance asks before anything'); await page.locator('.k-sheet').last().getByRole('button', { name: 'חזרה', exact: true }).click(); await sleep(300);
    check(JSON.stringify((await st()).switches) === before, 'cancelling the question changes nothing');
    await s.shot('switches-after');
    await s.go('security'); await page.getByRole('button', { name: /^בקונסולה/ }).first().click(); await s.idle();
    const log = await page.locator('table[aria-label="יומן אבטחה"]').innerText();
    check(/קריאה בלבד/.test(log), 'the security log names the switch (קריאה בלבד)', log.slice(0, 600));
    check(/(הדליק|כיבה) מתג: קריאה בלבד/.test(log), 'the security log says it was turned on/off ("הדליק מתג: קריאה בלבד")', log.split('\n').filter((l) => /מתג/.test(l)).slice(0, 5));
    check(/(הדליק|כיבה) מתג: הודעות במייל לנרשמים/.test(log), 'and the broadcast switch', log.split('\n').filter((l) => /מתג/.test(l)).slice(0, 5));
    check(!/readOnly|broadcastEmailPaused/.test(log), 'no code names in the log');
    await s.shot('security-after');
  }, s);

  // ---------- keys ----------
  let k1 = '', k2 = '', kid = '';
  await step('keys: create, use, scopes, replace, revoke, restore, usage', async () => {
    await s.go('keys'); await R('מפתח חדש').click();
    await dlg().getByLabel(/שם המפתח/).fill('מפתח הליכה'); await dlg().getByLabel('פועל בשם').selectOption(uids.dana);
    await dbtn('יצירת המפתח').click(); await dlg().locator('code.da-key').waitFor();
    k1 = (await dlg().locator('code.da-key').innerText()).trim(); check(k1.length > 20, 'the new key is shown once');
    await dbtn('סיימתי').click(); check(await page.locator('.k-sheet', { hasText: 'לסגור בלי להעתיק?' }).count(), 'closing before copying asks');
    await page.locator('.k-sheet').last().getByRole('button', { name: 'חזרה', exact: true }).click(); await sleep(350);
    await dbtn('העתקת המפתח').click(); check(await until(() => dbtn('הועתק').count()), 'copy'); check((await page.evaluate(() => navigator.clipboard.readText())) === k1, 'the clipboard has the key');
    await dbtn('סיימתי').click(); await s.idle(); check(!(await s.text()).includes(k1), 'the key is nowhere on the page after closing');
    const keys = (await s.call('GET', '/keys')).data; const me = (keys.items || keys).find((q) => q.label === 'מפתח הליכה'); kid = me.id; check(!!kid && !JSON.stringify(keys).includes(k1), 'server: the key exists, its secret is not in the list');
    let r = await key(k1, 'GET', '/v1/tasks?limit=5'); check(r.status === 200, 'the key reads tasks', r);
    r = await key(k1, 'POST', '/v1/actions/tasks.create', { title: 'נוצר דרך מפתח' }); check(r.status < 300, 'the key adds a task', r);
    // narrow: read only
    await rowKey(kid).click(); await s.idle();
    await panel().getByLabel('מה המפתח יכול').selectOption('read'); await pbtn('שמירה').click(); await sheet('כן, לשמור'); check(await s.toast('ההרשאות נשמרו'), 'narrowed to read-only');
    r = await until(async () => { const q = await key(k1, 'POST', '/v1/actions/tasks.create', { title: 'לא אמור' }); return q.status === 403 && q; }, 95_000, 1500); check(r?.status === 403, 'the server refuses a write after narrowing', r);
    check((await key(k1, 'GET', '/v1/tasks?limit=1')).status === 200, 'and still reads');
    await s.go('overview'); await s.go('keys/' + kid); await s.idle();
    await until(async () => /בקש.* השבוע/.test(await panel().innerText()), 15_000);
    check(/בקשות השבוע/.test(await panel().innerText()) && /נכשל/.test(await panel().innerText()), 'usage of the key: requests and failures', (await panel().innerText()).slice(0, 400));
    const lu = await rowKey(kid).innerText(); check(!/לא היה בשימוש/.test(lu), 'the table shows its last use', lu);
    await s.shot('keys-panel');
    // replace, old one stops now
    await pbtn('החלפת המפתח').click(); await dlg().getByRole('radio').first().click(); const graceNow = dlg().getByRole('radio', { name: /מיד|עכשיו/ }); if (await graceNow.count()) await graceNow.first().click();
    await dbtn('יצירת מפתח חדש').click(); await dlg().locator('code.da-key').waitFor(); k2 = (await dlg().locator('code.da-key').innerText()).trim(); await dbtn('העתקת המפתח').click(); await until(() => dbtn('הועתק').count()); await dbtn('סיימתי').click();
    check(k2 && k2 !== k1, 'replaced: a new key, shown once');
    check((await until(async () => (await key(k2, 'GET', '/v1/tasks?limit=1')).status === 200, 20_000)), 'the new one works');
    check(await until(async () => (await key(k1, 'GET', '/v1/tasks?limit=1')).status === 401, 95_000, 1500), 'the old one stops (grace: now)');
    await s.idle(); await pbtn('ביטול').click(); await sheet('כן, לבטל'); check(await s.toast('המפתח בוטל'), 'revoke: says so');
    check(await until(async () => [401, 403].includes((await key(k2, 'GET', '/v1/tasks?limit=1')).status), 95_000, 1500), 'server refuses the revoked key');
    await s.idle(); if (!(await pbtn('החזרת המפתח').count())) { await page.getByRole('button', { name: /^לא פעילים/ }).click(); await rowKey(kid).click(); await s.idle(); }
    await pbtn('החזרת המפתח').click(); await sheet('כן, להחזיר'); check(await s.toast('המפתח הוחזר לעבודה'), 'restore: says so');
    check(await until(async () => (await key(k2, 'GET', '/v1/tasks?limit=1')).status === 200, 95_000, 1500), 'and it works again');
  }, s);

  await step('keys: requests per row', async () => {
    for (let i = 0; i < 6; i++) await s.call('POST', '/keys', { label: 'מפתח נוסף ' + i, actor: 'user:' + uids.yoav, expiresAt: null, scopes: null });
    await s.go('overview'); const from = s.reqs.length; await page.locator('.d-nav__item[href="#/keys"]').click(); await s.idle(); await sleep(1200);
    const c = counted(s, from); requests.keysWith7 = { keys: c };
    const n = await page.locator('.d-main tbody tr').count();
    check(n >= 7, 'seven keys in the table', n);
    check(c.firestore <= 1 && c.worker.length <= 3, 'one request for the table, not one per key', { rows: n, ...c });
  }, s);

  // ---------- run an operation ----------
  await step('run: a read, a write, undo it', async () => {
    await s.go('run/tasks.list'); await R('הרצה').click(); await s.idle();
    check(await until(async () => (await page.locator('.d-main').innerText()).includes('הצליח')), 'a read runs', (await page.locator('.d-main').innerText()).slice(-400));
    check(await page.locator('table[aria-label="מה שהתקבל"] tbody tr').count() > 3, 'its answer is a table');
    await s.go('run/tasks.create'); await page.getByLabel(/^מה צריך לעשות/).first().fill('משימה מהקונסולה'); await R('הרצה').click(); await sheet('כן, להריץ');
    await until(async () => (await page.locator('.d-main').innerText()).includes('הצליח'));
    const made = await until(async () => (await E.list('tasks')).find((t) => t.title === 'משימה מהקונסולה')); check(!!made, 'Firestore: the task was created');
    check(await s.btn('לבטל את הפעולה').count(), 'undo is offered');
    await R('להציג את התשובה המלאה').click(); check((await dlg().innerText()).includes('HTTP 20'), 'the full answer'); await dbtn('סגירה').last().click(); await sleep(250);
    await R('לבטל את הפעולה').click(); await sheet('כן, לבטל'); check(await s.toast('הפעולה בוטלה'), 'undo: says so');
    check(await until(async () => !(await E.list('tasks')).find((t) => t.title === 'משימה מהקונסולה')), 'Firestore: the task is gone');
    await s.go('run/tasks.list'); await s.go('run/tasks.create'); await sleep(300); await R('הרצה').click(); await sleep(500); check(await page.locator('.d-field__err').count() && !(await page.locator('.k-sheet').count()), 'a missing required field stops the run');
  }, s);

  // ---------- backup first, then data ----------
  let backupDate = '';
  await step('backup now and its download', async () => {
    await s.go('backups'); await R('גיבוי עכשיו').click();
    check(await s.toast('הגיבוי נשמר', 60_000), 'backup now: says so'); await s.idle();
    const b = (await s.call('GET', '/backups')).data.items; backupDate = b[0]?.date; check(!!backupDate, 'server: the backup is listed', b?.slice(0, 2));
    const d = await s.download(() => page.locator('table[aria-label="גיבויים שמורים"] tbody tr').first().getByRole('button', { name: 'הורדה' }).click());
    check(/^havat-ravve-backup-.*\.ndjson$/.test(d.name), 'the file name', d.name);
    const lines = d.text.trim().split('\n').map((l) => JSON.parse(l)); check(lines.length > 50 && d.text.includes('משימה לשחזור מגיבוי'), 'the file has every record', lines.length);
  }, s);

  await step('data: careful edit, history', async () => {
    const from = s.reqs.length; await s.go('data/tasks/t-edit'); check(counted(s, from).worker.length <= 6, 'opening a record: a handful of requests', counted(s, from).worker);
    check((await panel().innerText()).includes('לצבוע את הגדר'), 'the record opens from its address');
    check(/היסטוריה של הרשומה/.test(await panel().innerText()), 'its history is in the panel', (await panel().innerText()).slice(0, 500));
    await pbtn('עריכה זהירה').click(); const inp = panel().locator('input.d-input').filter({ hasText: '' });
    const note = panel().getByLabel(/^(הערה|פירוט|הסבר)/).first(); const target = (await note.count()) ? note : inp.nth(1);
    await target.fill('צבע ירוק'); await panel().getByRole('button', { name: /^שמירה \(1\)/ }).click();
    check((await dlg().innerText()).includes('צבע ירוק'), 'the confirm shows before and after'); await dbtn('כן, לשמור').click(); check(await s.toast('נשמר'), 'saved');
    check(await until(async () => JSON.stringify(await E.get('tasks/t-edit')).includes('צבע ירוק')), 'Firestore: changed', await E.get('tasks/t-edit'));
    await s.idle(); await pbtn('גרסה קודמת').click(); await s.idle(); await sleep(800);
    const t = await dlg().innerText(); check(/להשוות/.test(t) && /דנה/.test(t), 'versions: the backup is there, with what the app recorded', t.slice(0, 500));
    await dbtn('להשוות').first().click(); await dbtn('להחזיר לגרסה הזאת').click(); await sheet('כן, להחזיר'); check(await s.toast('הרשומה הוחזרה לגרסה הזאת', 15000), 'back to the older version');
    check(await until(async () => (await E.get('tasks/t-edit')).note === 'צבע לבן, שתי שכבות'), 'Firestore: the old note is back', (await E.get('tasks/t-edit')).note);
    const d = await s.download(() => R('ייצוא האוסף').click()); check(d.bytes[0] === 0xef && d.text.includes('לצבוע את הגדר'), 'collection export: Hebrew CSV', d.name);
    check(/'=SUM/.test(d.text) && !/(^|,|")=SUM/m.test(d.text), 'collection export: formula-safe', d.text.split('\n').find((l) => l.includes('SUM(A1')));
  }, s);

  await step('delete a record, bring it back from the bin', async () => {
    await s.go('data/tasks/t-del'); const was = await E.get('tasks/t-del'); await pbtn('מחיקה').click(); await sheet('מחיקה');
    check(await s.toast('נמחק'), 'delete: says so'); check(await until(async () => !(await E.get('tasks/t-del'))), 'Firestore: gone');
    await s.go('backups'); const it = page.locator('.dd-item', { hasText: 'משימה למחיקה' }); check(await it.count(), 'the bin lists it'); await it.getByRole('button', { name: 'להחזיר' }).click(); await dbtn('להחזיר').click();
    check(await s.toast('שוחזר'), 'restored: says so'); const now = await E.get('tasks/t-del'); check(now && now.title === was.title && JSON.stringify(now.createdBy) === JSON.stringify(was.createdBy), 'Firestore: exactly as it was', now);
  }, s);

  await step('restore a record from a backup', async () => {
    await E.put('tasks/t-restore', { ...(await E.get('tasks/t-restore')), id: undefined, note: 'קלקול' }); await s.go('overview'); await s.go('backups');
    await page.locator('table[aria-label="גיבויים שמורים"] tbody tr').first().getByRole('button', { name: 'שחזור מכאן' }).click();
    await dlg().locator('tr', { hasText: /^משימות/ }).first().getByRole('button', { name: 'לפתוח' }).click(); await s.idle();
    await dlg().getByRole('searchbox').fill('לשחזור'); await dlg().locator('tr', { hasText: 'משימה לשחזור מגיבוי' }).getByRole('button', { name: 'להשוות' }).click(); await s.idle();
    check((await dlg().innerText()).includes('קלקול') && (await dlg().innerText()).includes('המצב המקורי'), 'side by side: backup and today'); await s.shot('restore');
    await dbtn('שחזור למצב בגיבוי').click(); await sheet('כן, לשחזר'); check(await s.toast('הרשומה הוחזרה למצב שלה בגיבוי', 15000), 'restored: says so');
    check(await until(async () => (await E.get('tasks/t-restore')).note === 'המצב המקורי'), 'Firestore: back as in the backup');
  }, s);

  // ---------- queue ----------
  await step('queue: text of one mail, send again, do not send', async () => {
    const sentBefore = mail.calls.length;
    await s.go('queue'); const row = (id) => rowKey(id);
    const ids = await page.locator('table[aria-label="תור שליחה"] tr[data-row]').evaluateAll((l) => l.map((r) => r.getAttribute('data-row')));
    const find = (t) => ids.find((i) => i.includes(t));
    check(!!find('dn-retry'), 'the failed mails are listed', ids);
    await row(find('dn-retry')).click(); await s.idle(); await until(() => panel().locator('.dn-mail').count());
    const mt = await panel().locator('.dn-mail').innerText().catch(() => ''); check(/מיכל/.test(mt) && /270/.test(mt), "a single mail's text, with the person and the sum", mt.slice(0, 200) || (await panel().innerText()).slice(0, 300));
    await s.shot('queue-mail');
    await pbtn('שליחה שוב').click(); await sheet('כן, לשלוח שוב'); check(await s.toast('נכנס לתור'), 'send again: says so');
    check(['queued', 'sending', 'sent'].includes((await E.get('email_outbox/donation_dn-retry')).status), 'Firestore: queued');
    await E.cronAll(w); check(await until(async () => (await E.get('email_outbox/donation_dn-retry')).status === 'sent', 20_000), 'the next round sent it', await E.get('email_outbox/donation_dn-retry'));
    const m = mail.calls.slice(sentBefore); check(m.length === 1 && m[0].to === 'michal.walk@example.com', 'the mail service (mock) got it exactly once', m.map((q) => [q.to, q.subject]));
    await s.go('overview'); await s.go('queue'); await row(find('dn-drop')).click(); await s.idle(); await pbtn('לא לשלוח').click(); await sheet('כן, לא לשלוח'); check(await s.toast('המייל לא יישלח'), 'do not send: says so');
    check((await E.get('email_outbox/donation_dn-drop')).status === 'cancelled', 'Firestore: cancelled');
    await R('הצגת תבנית המייל').click(); await s.idle(); check(await dlg().locator('iframe').count(), 'the template opens');
  }, s);

  // ---------- import ----------
  await step('import: paste, check, import, undo', async () => {
    await s.go('import'); await page.getByLabel('השורות מאקסל').fill('משימה\tתאריך יעד\tדחוף\nייבוא אחת\t1.12.2026\tכן\nייבוא שתיים\t\t\nייבוא שלוש\tלא תאריך\t\n\t5.12.2026\t');
    await R('המשך').click(); await s.idle(); if (await R('לבדיקה').count()) { await R('לבדיקה').click(); await s.idle(); }
    check(/עם בעיה/.test(await panel().innerText()), 'bad rows are marked'); await s.shot('import-check');
    await panel().getByRole('button', { name: /^ייבוא .*משימות/ }).click(); await sheet('כן, להוסיף');
    check(await until(async () => (await panel().innerText()).includes('הייבוא נגמר'), 30_000), 'import ended', (await panel().innerText()).slice(0, 300));
    const tl = (await E.list('tasks')).filter((t) => /^ייבוא /.test(t.title)); check(tl.length === 2 && tl.find((t) => t.title === 'ייבוא אחת')?.dueDate === '2026-12-01' && tl.find((t) => t.title === 'ייבוא אחת')?.urgent === true, 'Firestore: the two good rows, date and urgency right', tl.map((t) => [t.title, t.dueDate, t.urgent]));
    const tag = await E.get('tasks/' + (tl[0]?.id || 'x'));
    await pbtn('לבטל את הייבוא').click(); await sheet('כן, לבטל את הייבוא'); check(await s.toast('הייבוא בוטל', 15_000), 'undo: says so');
    check(await until(async () => !(await E.list('tasks')).some((t) => /^ייבוא /.test(t.title))), 'Firestore: both gone', !!tag);
    const im = (await s.call('GET', '/imports')).data; const b0 = (im.items || im)[0]; check(!!b0?.undone, 'server: the import is marked undone', b0);
  }, s);

  // ---------- periods ----------
  await step('traffic year, stats, speed, money periods', async () => {
    for (const tab of ['traffic', 'stats', 'speed', 'money']) {
      await s.go(tab); const chips = await page.locator('.d-main .d-chip').allInnerTexts();
      for (const c of chips.slice(0, 5)) { await page.locator('.d-main .d-chip', { hasText: c }).first().click(); await s.idle(); const t = await x.trouble(s); check(!t.m && !t.alerts.length && !t.skel, `${tab}: ${c.replace(/\n/g, ' ')}`, t); }
    }
    await s.go('traffic'); await page.locator('.d-main .d-chip', { hasText: 'שנה' }).first().click(); await s.idle(); await sleep(400);
    const y = await s.call('GET', '/traffic?days=365'); check(JSON.stringify(y.data).includes('77'), 'traffic year: the visit from half a year back is in it', JSON.stringify(y.data).slice(0, 200));
    await s.shot('traffic-year');
  }, s);

  await step('security export', async () => {
    await s.go('security'); for (const c of ['7 ימים', '30 ימים']) { const b = page.getByRole('button', { name: c, exact: true }); if (await b.count()) { await b.click(); await s.idle(); } }
    const d = await s.download(() => R('אקסל').click()); check(d.name === 'havat-ravve-security.csv' && d.bytes[0] === 0xef && /[א-ת]/.test(d.text), 'a Hebrew CSV', d.name);
    check(/החלפ|מפתח/.test(d.text), 'the key actions are in it', d.text.slice(0, 300));
    const lines = d.text.split('\n').slice(1); check(!lines.some((l) => /(^|,)"?[=+@]/.test(l)), 'formula-safe');
  }, s);

  // ---------- money / overview after the work, and the queue's counter ----------
  await openAll(s, 'branch', { shots: true });

  // ---------- refused ----------
  setPart('limited');
  for (const who of ['dana', 'yoav', 'michal', 'avi']) {
    const m = await session({ site: site.base, api: w.base, who, url: '/admin' });
    await step(`${who} is refused`, async () => {
      await sleep(1500); await m.idle();
      const t = await m.text(); check(/הקונסולה רק לבעלי החווה|חסו|חשבון/.test(t) && !(await m.page.locator('.d-nav__item').count()), 'the console refuses, no sidebar', t.slice(0, 200)); if (who === 'dana') await m.shot('refused-manager');
      m.allowed.push(/403/); const tok = await m.token();
      for (const p of ['/overview', '/people/access', '/keys', '/switches', '/data']) { const r = await fetch(w.base + '/v1/console' + p, { headers: { authorization: 'Bearer ' + tok } }); check(r.status === 403 || r.status === 401, `server refuses ${p}`, r.status); }
      const wr = await fetch(w.base + '/v1/console/switches', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ readOnly: true }) }); check(wr.status === 403 || wr.status === 401, 'server refuses a write', wr.status);
      m.take();
    });
    await m.ctx.close();
  }
  setPart('owner');
  const keep = { requests };
  fs.writeFileSync(E.SCRATCH + '/mail.json', JSON.stringify(mail.calls.map((m) => [m.to, m.subject])));
  await s.ctx.close(); return keep;
}
