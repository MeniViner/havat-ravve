// Start scripts/dev.mjs on localhost (BASE), then run this with Firestore and Auth emulators.
import assert from 'node:assert/strict';
import { adminGet, adminSet, BASE, close, launch, session } from '../scripts/smoke/lib.mjs';
import { idpSignIn } from '../scripts/smoke-seed.mjs';

assert.equal(new URL(BASE).hostname, 'localhost', 'use the local preview server');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'run inside the local emulators');
const at = new Date().toISOString();
const stall = 'test-vendor-removal';
const helperName = 'עוזר בדיקה';
const profile = (uid, email, name, number, code, helper) => ({
  uid, email, displayName: name, phone: '0500000000', role: 'vendor', status: 'active', customerNumber: number,
  acceptedTermsAt: at, createdAt: at, updatedAt: at, vendorId: stall, inviteCode: code, helper,
});
const row = (code, name = helperName) => ({ name, role: 'helper', entered: true, code });
const select = async (s, name) => {
  await s.click(name, { exact: true });
  await s.page.getByRole('dialog').getByRole('button', { name: 'הסרה מהדוכן', exact: true }).click();
  const dialog = s.page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'הסרה', exact: true }).scrollIntoViewIfNeeded();
  const box = await dialog.boundingBox();
  const viewport = s.page.viewportSize();
  assert.ok(box && box.x >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify({ box, viewport }));
  assert.ok(await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  return dialog;
};
const remove = (dialog) => dialog.getByRole('button', { name: 'הסרה', exact: true }).click();

await launch();
try {
  const { localId: helper } = await idpSignIn('tamar');
  for (const width of [375, 1440]) {
    const s = await session('raz', { ctx: { viewport: { width, height: 844 } } });
    const owner = s.account.uid;
    const actor = { uid: owner, name: s.account.name };
    const code = 'test-claim-' + width;
    const old = 'test-older-' + width;
    const unresolved = 'test-missing-' + width;
    const invitePath = 'vendor_invites/' + code;
    const helperPath = 'users/' + helper;
    const vendorPath = 'vendors/' + stall;

    await adminSet('users/' + owner, profile(owner, s.account.email, s.account.name, 1, 'test-own-link', false));
    await adminSet(helperPath, profile(helper, 'tamar.smoke@example.com', helperName, 2, code, true));
    await adminSet(vendorPath, {
      name: 'דוכן לבדיקה', phone: '', sells: '', product: '', notes: '', events: [], createdAt: at, updatedAt: at,
      people: [row(code), row(old, 'קישור ישן'), row(unresolved, 'קישור חסר')],
    });
    for (const link of [code, old]) {
      await adminSet('vendor_invites/' + link, {
        code: link, vendorId: stall, vendorName: 'דוכן לבדיקה', role: 'helper', name: helperName, phone: '',
        active: false, usedBy: helper, usedAt: at, createdBy: actor, createdAt: at,
      });
    }

    await s.go('/vendor/stall');
    assert.ok(await s.waitText('מי עובד בדוכן'), `stall opens at ${width}`);
    const offline = await select(s, helperName);
    await s.ctx.setOffline(true);
    await remove(offline);
    assert.ok(await s.waitText('אין חיבור לאינטרנט. נסו שוב אחרי החיבור.'));
    assert.ok(await s.has(helperName));
    assert.equal((await adminGet(helperPath)).role, 'vendor');
    assert.ok((await adminGet(vendorPath)).people.some((p) => p.code === code));
    assert.equal(await adminGet('activity/' + code), null);
    await s.ctx.setOffline(false);

    await remove(await select(s, 'קישור חסר'));
    assert.ok(await s.waitText('לא הצלחנו לבדוק את הקישור. נסו שוב או פנו לחווה.'));
    assert.ok(await s.has('קישור חסר'));
    assert.ok((await adminGet(vendorPath)).people.some((p) => p.code === unresolved));

    await remove(await select(s, 'קישור ישן'));
    await s.page.getByText('קישור ישן', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal((await adminGet(helperPath)).inviteCode, code);
    assert.equal((await adminGet(helperPath)).role, 'vendor');
    assert.equal((await adminGet('activity/' + old)).action, 'removed');

    let lost = false;
    await s.page.route(/localhost:8080.*documents:commit/, async (route) => {
      if (lost || route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      lost = true;
      await route.abort('failed');
    });
    await remove(await select(s, helperName));
    assert.ok(await s.waitText('עוזר הוסר מהדוכן', 15_000), 'retry acknowledges the committed removal after a lost response');
    assert.equal(lost, true, 'the commit reached the emulator and its response was dropped');
    assert.equal((await adminGet(helperPath)).role, 'guest');
    assert.equal((await adminGet(invitePath)).active, false);
    assert.equal((await adminGet('activity/' + code)).action, 'removed');
    assert.ok(!(await adminGet(vendorPath)).people.some((p) => p.code === code));
    await s.done();
    console.log(`PASS ${width}px: removal dialog, offline retry, missing invite, newer link, and lost response`);
  }
} finally {
  await close();
}
