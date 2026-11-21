// Vendor area (D1-D11, V1, V2, V6, N8, V7): two parts in one file.
//
// Part A, rules: applies the requested rules blocks from docs/redesign-data/vendor.md to a copy of firestore.rules and
// checks what a vendor and a helper may read and write (own stall, invited events, nothing of other people).
//   PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH firebase emulators:exec --only firestore --project demo-havat-ravve "node tests/v2-vendor.mjs"
//
// Part B, click-through in demo mode: every control per persona (vendor regular / event day / after, helper, manager),
// writes checked after a reload, no console errors, no request outside the demo sandbox.
//   PORT=5208 node scripts/dev.mjs            (another terminal)
//   node tests/v2-vendor.mjs [--base=http://localhost:5208]
//
// With FIRESTORE_EMULATOR_HOST set (emulators:exec) only part A runs; otherwise only part B.

const section = (s) => console.log('\n' + s);
let fails = 0;

// ====================================================================================================================
// Part A: rules. Applies the rules blocks from docs/redesign-data/vendor.md to a copy of firestore.rules and runs the
// test cases listed there. Only under the emulator (FIRESTORE_EMULATOR_HOST is set by emulators:exec).
// ====================================================================================================================
async function rulesPart() {
  const { createRequire } = await import('node:module'); const require = createRequire(import.meta.url); require('firebase/compat/firestore');
  const fs = await import('node:fs');
  const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
  const { doc, setDoc, getDoc, getDocs, collection, updateDoc, query, where, writeBatch, arrayUnion } = require('firebase/firestore');

  // ---- the requested rules, applied exactly as the doc writes them ----
  const md = fs.readFileSync('docs/redesign-data/vendor.md', 'utf8');
  const blocks = Object.fromEntries([...md.matchAll(/```rules:([\w-]+)\n([\s\S]*?)```/g)].map((m) => [m[1], m[2].replace(/\n$/, '')]));
  for (const k of ['helpers', 'users-shape', 'users-create', 'users-update', 'events-read', 'event-vendors', 'vendors']) if (!blocks[k]) throw new Error('missing rules block ' + k);
  let rules = fs.readFileSync('firestore.rules', 'utf8');
  const swap = (re, by, label) => { if (!re.test(rules)) throw new Error('rules anchor not found: ' + label); rules = rules.replace(re, () => by); };
  if (!/^  function isStaff\(\)\{.*$/m.test(rules)) throw new Error('rules anchor not found: isStaff');
  rules = rules.replace(/^  function isStaff\(\)\{.*$/m, (l) => l + '\n' + blocks.helpers);
  swap(/^   function profileShape\(\)\{.*$/m, blocks['users-shape'], 'profileShape');
  swap(/^   function createRole\(\)\{.*$/m, blocks['users-create'], 'createRole');
  swap(/^   allow update: if profileShape\(\).*$/m, blocks['users-update'], 'users update');
  swap(/^   allow read: if resource\.data\.published == true \|\| isStaff\(\);$/m, blocks['events-read'], 'events read');
  swap(/^   match \/vendors\/\{vid\} \{\n[\s\S]*?\n   \}$/m, blocks['event-vendors'], 'events/vendors');
  swap(/^  match \/vendors\/\{id\} \{\n[\s\S]*?\n  \}$/m, blocks.vendors, 'vendors');
  fs.mkdirSync('.build', { recursive: true }); fs.writeFileSync('.build/firestore.vendor.rules', rules);

  const env = await initializeTestEnvironment({ projectId: 'demo-havat-ravve', firestore: { rules } });
  const claims = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
  const db = (uid) => env.authenticatedContext(uid, claims(uid + '@example.com')).firestore();
  const now = new Date().toISOString();
  const actor = (uid) => ({ uid, name: 'בדיקה' });
  const profile = (uid, role, extra = {}) => ({ uid, email: uid + '@example.com', displayName: 'בדיקה', phone: '0500000000', role, status: 'active', customerNumber: 1, acceptedTermsAt: now, createdAt: now, updatedAt: now, ...extra });
  const vendor = (name, extra = {}) => ({ name, phone: '0520000000', product: 'גבינות', sells: 'גבינות', external: true, notes: '', note: '', needs: [], events: [], people: [], inviteNext: false, createdAt: now, updatedAt: now, ...extra });
  const rec = (vid, extra = {}) => ({ vendorId: vid, name: vid, confirmed: false, notes: '', status: 'invited', invitedAt: now, invitedBy: actor('mgr'), answeredAt: null, sells: '', needs: [], people: 1, vehicle: '', note: '', spot: null, spotNote: '', arrivedAt: null, feedback: null, updatedAt: now, ...extra });
  const invite = (code, vid, role, extra = {}) => ({ code, vendorId: vid, vendorName: vid, role, name: 'בדיקה', phone: '0520000000', active: true, usedBy: null, usedAt: null, createdBy: actor('mgr'), createdAt: now, ...extra });
  const request = (id, eid, vid, by, extra = {}) => ({ id, eventId: eid, vendorId: vid, vendorName: vid, kind: 'power', text: 'החשמל נפל', by: actor(by), createdAt: now, takenBy: null, closedAt: null, closedBy: null, ...extra });

  let n = 0, failures = 0;
  const ok = async (p, label) => { n++; try { await assertSucceeds(p); console.log('  ✓ ' + label); } catch (e) { failures++; console.log('  ✗ ' + label + ' — ' + String(e.message || e).split('\n')[0]); } };
  const no = async (p, label) => { n++; try { await assertFails(p); console.log('  ✓ ' + label); } catch (e) { failures++; console.log('  ✗ ' + label + ' — allowed'); } };

  try {
    await env.withSecurityRulesDisabled(async (c) => {
      const f = c.firestore();
      await setDoc(doc(f, 'users/mgr'), profile('mgr', 'manager'));
      await setDoc(doc(f, 'users/staff'), profile('staff', 'staff'));
      await setDoc(doc(f, 'users/guest'), profile('guest', 'guest'));
      await setDoc(doc(f, 'users/raz'), profile('raz', 'vendor', { vendorId: 'v-raz', helper: false, addedBy: 'mgr', inviteCode: 'code-raz-0001' }));
      await setDoc(doc(f, 'users/tamar'), profile('tamar', 'vendor', { vendorId: 'v-raz', helper: true, addedBy: 'raz', inviteCode: 'code-tamar-01' }));
      await setDoc(doc(f, 'users/dana'), profile('dana', 'vendor', { vendorId: 'v-dana', helper: false, addedBy: 'mgr', inviteCode: 'code-dana-001' }));
      await setDoc(doc(f, 'counters/users'), { value: 6 });
      await setDoc(doc(f, 'vendors/v-raz'), vendor('גבינות משק רז', { events: ['e-hidden'] }));
      await setDoc(doc(f, 'vendors/v-raz/private/main'), { notes: 'משלם באיחור', updatedAt: now });
      await setDoc(doc(f, 'vendors/v-dana'), vendor('קרמיקה של דנה', { events: ['e-other'] }));
      const ev = (title, published) => ({ title, published, start: '2026-11-28T14:00:00.000Z', end: '2026-11-28T19:00:00.000Z', stall: true, createdBy: actor('mgr'), createdAt: now, updatedAt: now });
      await setDoc(doc(f, 'events/e-hidden'), ev('פסטיבל', false));
      await setDoc(doc(f, 'events/e-other'), ev('יריד', false));
      await setDoc(doc(f, 'events/e-pub'), ev('חנוכה', true));
      await setDoc(doc(f, 'events/e-hidden/vendors/v-raz'), rec('v-raz'));
      await setDoc(doc(f, 'events/e-other/vendors/v-dana'), rec('v-dana', { status: 'confirmed', confirmed: true }));
      await setDoc(doc(f, 'events/e-hidden/vendor_info/main'), { setupFrom: '14:00', managerUids: ['mgr'], updatedAt: now });
      await setDoc(doc(f, 'events/e-other/vendor_info/main'), { setupFrom: '14:00', managerUids: ['mgr'], updatedAt: now });
      await setDoc(doc(f, 'events/e-hidden/counters/live'), { entered: 12 });
      await setDoc(doc(f, 'events/e-other/vendor_requests/r-dana'), request('r-dana', 'e-other', 'v-dana', 'dana'));
      await setDoc(doc(f, 'vendor_invites/code-tamar-01'), invite('code-tamar-01', 'v-raz', 'helper', { active: false, usedBy: 'tamar', usedAt: now, createdBy: actor('raz') }));
      await setDoc(doc(f, 'vendor_invites/code-owner-new'), invite('code-owner-new', 'v-raz', 'owner'));
      await setDoc(doc(f, 'vendor_invites/code-guest-001'), invite('code-guest-001', 'v-dana', 'helper', { createdBy: actor('dana') }));
      await setDoc(doc(f, 'vendor_invites/code-used-0001'), invite('code-used-0001', 'v-raz', 'helper', { active: false, usedBy: 'someone', usedAt: now }));
    });
    const raz = db('raz'), tamar = db('tamar'), dana = db('dana'), staff = db('staff'), mgr = db('mgr'), guest = db('guest'), fresh = db('fresh'), fresh2 = db('fresh2');

    section('Rules: own stall, invited events, nothing of other people');
    await ok(getDoc(doc(raz, 'vendors/v-raz')), '1 owner reads own vendor');
    await no(getDoc(doc(raz, 'vendors/v-dana')), '2 owner cannot read another vendor');
    await no(getDocs(collection(raz, 'vendors')), '2 owner cannot list vendors');
    await ok(getDoc(doc(tamar, 'vendors/v-raz')), '3 helper reads the stall');
    await no(getDoc(doc(raz, 'vendors/v-raz/private/main')), '4 vendor cannot read the team notes');
    await ok(getDoc(doc(mgr, 'vendors/v-raz/private/main')), '4 manager reads the team notes');
    await ok(getDoc(doc(raz, 'events/e-hidden')), '5 invited vendor reads an unpublished event');
    await ok(getDoc(doc(tamar, 'events/e-hidden')), '5 helper reads the invited event');
    await no(getDoc(doc(raz, 'events/e-other')), '6 not invited: cannot read the event');
    await no(getDocs(collection(raz, 'events')), '6 vendor cannot list all events');
    await ok(getDocs(query(collection(raz, 'events'), where('published', '==', true))), '7 vendor lists published events');
    await ok(getDoc(doc(raz, 'events/e-hidden/vendor_info/main')), '8 vendor reads the brief of an invited event');
    await ok(getDoc(doc(raz, 'events/e-hidden/counters/live')), '8 vendor reads the live count of an invited event');
    await no(getDoc(doc(raz, 'events/e-other/vendor_info/main')), '9 no brief of another event');
    await no(getDoc(doc(raz, 'events/e-other/vendors/v-dana')), '9 no record of another stall');
    await no(getDocs(collection(raz, 'events/e-hidden/vendors')), '9 cannot list the event vendors');
    await no(getDoc(doc(raz, 'users/tamar')), '28 vendor cannot read another profile');
    await no(getDocs(collection(raz, 'users')), '28 vendor cannot list users');

    section('Rules: answering, check-in, requests');
    const mine = doc(raz, 'events/e-hidden/vendors/v-raz');
    await no(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { status: 'confirmed', confirmed: true, answeredAt: now, updatedAt: now }), '11 helper cannot answer');
    await ok(updateDoc(mine, { status: 'confirmed', confirmed: true, answeredAt: now, sells: 'גבינות', needs: ['table', 'power'], people: 2, withVehicle: true, vehicle: 'רכב לפריקה', note: '', updatedAt: now }), '10 owner confirms with needs');
    await no(updateDoc(mine, { spot: 3, updatedAt: now }), '11 owner cannot pick a spot');
    await no(updateDoc(mine, { status: 'confirmed', confirmed: false, answeredAt: now, updatedAt: now }), '10 confirmed must match status');
    await no(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { arrivedAt: now, arrivedBy: 'raz', updatedAt: now }), '12 check-in as someone else is refused');
    await ok(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { arrivedAt: now, arrivedBy: 'tamar', updatedAt: now }), '12 helper checks in');
    await no(updateDoc(mine, { arrivedAt: now, arrivedBy: 'raz', updatedAt: now }), '12 second check-in is refused');
    await ok(updateDoc(doc(tamar, 'events/e-hidden/vendors/v-raz'), { guidelinesReadAt: now }), 'guidelines read stamp');
    await ok(updateDoc(mine, { feedback: { rating: 5, text: 'היה טוב', inviteNext: true, at: now }, updatedAt: now }), 'owner feedback (D9)');
    await no(updateDoc(mine, { feedback: { rating: 9, text: '', inviteNext: true, at: now }, updatedAt: now }), 'feedback rating out of range');

    const reqRef = (u, id, eid = 'e-hidden') => doc(u, `events/${eid}/vendor_requests/${id}`);
    await ok(setDoc(reqRef(raz, 'r1'), request('r1', 'e-hidden', 'v-raz', 'raz')), '13 owner creates a request');
    await ok(setDoc(reqRef(tamar, 'r2'), request('r2', 'e-hidden', 'v-raz', 'tamar', { kind: 'help', text: 'צריך עזרה בדוכן' })), '13 helper creates a request');
    await no(setDoc(reqRef(dana, 'r3'), request('r3', 'e-hidden', 'v-raz', 'dana')), '14 another vendor cannot ask for this stall');
    await no(setDoc(reqRef(raz, 'r4', 'e-other'), request('r4', 'e-other', 'v-raz', 'raz')), '14 not on that event');
    await no(setDoc(reqRef(raz, 'r5'), request('r5', 'e-hidden', 'v-raz', 'tamar')), '14 by must be the writer');
    await ok(getDocs(query(collection(raz, 'events/e-hidden/vendor_requests'), where('vendorId', '==', 'v-raz'))), '15 owner lists own requests');
    await no(getDocs(collection(raz, 'events/e-hidden/vendor_requests')), '15 owner cannot list all requests');
    await no(getDoc(reqRef(raz, 'r-dana', 'e-other')), '15 cannot read another stall request');
    await ok(updateDoc(reqRef(staff, 'r1'), { takenBy: actor('staff') }), '16 staff takes a request');
    await no(updateDoc(reqRef(raz, 'r1'), { takenBy: actor('raz') }), '16 vendor cannot take');
    await ok(updateDoc(reqRef(raz, 'r1'), { closedAt: now, closedBy: actor('raz') }), '16 owner closes own request');
    await no(updateDoc(reqRef(mgr, 'r1'), { closedAt: now, closedBy: actor('mgr') }), '16 closing twice is refused');
    await ok(updateDoc(reqRef(mgr, 'r2'), { closedAt: now, closedBy: actor('mgr') }), '16 manager closes a request');

    section('Rules: the stall and its people');
    await ok(updateDoc(doc(raz, 'vendors/v-raz'), { name: 'גבינות רז', note: 'מגיע עם מקרר', sells: 'גבינות', product: 'גבינות', inviteNext: true, updatedAt: now }), '17 owner edits the stall');
    await no(updateDoc(doc(raz, 'vendors/v-raz'), { external: false, updatedAt: now }), '17 owner cannot change external');
    await no(updateDoc(doc(raz, 'vendors/v-raz'), { notes: 'x', updatedAt: now }), '17 owner cannot write team notes');
    await no(updateDoc(doc(raz, 'vendors/v-raz'), { events: arrayUnion('e-pub'), updatedAt: now }), '17 owner cannot add events');
    await no(updateDoc(doc(tamar, 'vendors/v-raz'), { name: 'x', updatedAt: now }), '18 helper cannot edit');
    await no(updateDoc(doc(dana, 'vendors/v-raz'), { name: 'x', updatedAt: now }), '18 another vendor cannot edit');
    const helperInvite = invite('code-avi-0001', 'v-raz', 'helper', { createdBy: actor('raz') });
    const b1 = writeBatch(raz);
    b1.set(doc(raz, 'vendor_invites/code-avi-0001'), helperInvite);
    b1.update(doc(raz, 'vendors/v-raz'), { people: arrayUnion({ name: 'אבי', phone: '0521234567', role: 'helper', entered: false, code: 'code-avi-0001' }), updatedAt: now });
    await ok(b1.commit(), '19 owner adds a helper (invite + people)');
    await no(setDoc(doc(raz, 'vendor_invites/code-own-0002'), invite('code-own-0002', 'v-raz', 'owner', { createdBy: actor('raz') })), '19 owner cannot create an owner invite');
    await no(setDoc(doc(raz, 'vendor_invites/code-dana-002'), invite('code-dana-002', 'v-dana', 'helper', { createdBy: actor('raz') })), '19 owner cannot invite to another stall');
    await no(setDoc(doc(tamar, 'vendor_invites/code-tam-0002'), invite('code-tam-0002', 'v-raz', 'helper', { createdBy: actor('tamar') })), '19 helper cannot invite');
    await ok(getDocs(query(collection(raz, 'vendor_invites'), where('vendorId', '==', 'v-raz'))), '20 owner lists own invites');
    await no(getDocs(query(collection(tamar, 'vendor_invites'), where('vendorId', '==', 'v-raz'))), '20 helper cannot list invites');
    await no(getDocs(query(collection(dana, 'vendor_invites'), where('vendorId', '==', 'v-raz'))), '20 another vendor cannot list');
    await ok(getDoc(doc(guest, 'vendor_invites/code-owner-new')), '21 the link holder reads the invite');
    await ok(updateDoc(doc(raz, 'vendor_invites/code-avi-0001'), { active: false }), '26 owner revokes a helper invite');
    await no(updateDoc(doc(raz, 'vendor_invites/code-owner-new'), { active: false }), '26 owner cannot revoke an owner invite');

    section('Rules: claiming an invite');
    const claimNew = (u, uid, code, inv, over = {}, useInvite = true, value = 7) => {
      const b = writeBatch(u);
      b.set(doc(u, `users/${uid}`), { ...profile(uid, 'vendor'), customerNumber: 7, vendorId: inv.vendorId, helper: inv.role === 'helper', addedBy: inv.createdBy, inviteCode: code, ...over });
      b.update(doc(u, 'counters/users'), { value });
      if (useInvite) b.update(doc(u, `vendor_invites/${code}`), { usedBy: uid, usedAt: now, active: false });
      return b.commit();
    };
    await no(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-raz', role: 'owner', createdBy: 'mgr' }, {}, false), '23 vendor profile without using the invite');
    await no(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-dana', role: 'owner', createdBy: 'mgr' }), '23 wrong vendorId');
    await no(claimNew(fresh, 'fresh', 'code-used-0001', { vendorId: 'v-raz', role: 'helper', createdBy: 'mgr' }), '23 used invite');
    await no(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-raz', role: 'helper', createdBy: 'mgr' }), '23 helper flag must match the invite');
    await ok(claimNew(fresh, 'fresh', 'code-owner-new', { vendorId: 'v-raz', role: 'owner', createdBy: 'mgr' }), '22 new account claims (profile + invite + counter)');
    await ok(getDoc(doc(fresh, 'vendors/v-raz')), '22 the new owner reads the stall');
    await no(claimNew(fresh2, 'fresh2', 'code-owner-new', { vendorId: 'v-raz', role: 'owner', createdBy: 'mgr' }, {}, true, 8), '23 the same invite twice');
    const claimExisting = (u, uid, code, inv) => {
      const b = writeBatch(u);
      b.update(doc(u, `users/${uid}`), { role: 'vendor', vendorId: inv.vendorId, helper: inv.role === 'helper', addedBy: inv.createdBy, inviteCode: code, updatedAt: now });
      b.update(doc(u, `vendor_invites/${code}`), { usedBy: uid, usedAt: now, active: false });
      return b.commit();
    };
    await no(claimExisting(staff, 'staff', 'code-guest-001', { vendorId: 'v-dana', role: 'helper', createdBy: 'dana' }), '25 a team account cannot become a stall');
    await ok(claimExisting(guest, 'guest', 'code-guest-001', { vendorId: 'v-dana', role: 'helper', createdBy: 'dana' }), '24 guest claims a helper invite');
    await ok(getDoc(doc(guest, 'events/e-other')), '24 the new helper reads the invited event');
    await no(updateDoc(doc(guest, 'users/guest'), { vendorId: 'v-raz', updatedAt: now }), 'a vendor cannot switch stall by itself');
    await no(updateDoc(doc(mgr, 'users/staff'), { role: 'vendor', status: 'active', notes: '', updatedAt: now }), 'a manager cannot make a vendor without a claim');

    section('Rules: removing access (V6)');
    await ok(updateDoc(doc(mgr, 'users/raz'), { role: 'guest', notes: '', updatedAt: now, log: [] }), '27 manager sets the vendor back to guest');
    await no(getDoc(doc(raz, 'vendors/v-raz')), '27 after removal the stall is closed');
    await no(getDoc(doc(raz, 'events/e-hidden')), '27 and so is the event');
  } finally {
    await env.cleanup();
  }
  console.log(`\nrules: ${n - failures} of ${n} passed`);
  return failures;
}

// ====================================================================================================================
// Part B: click-through in demo mode.
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
    await s.click('אבי לוי'); await s.page.getByRole('dialog').getByText('הסרה מהדוכן').click(); await s.page.getByRole('dialog').getByText('כן, להסיר').click(); await s.page.waitForTimeout(250);
    await s.reload(); log(!(await s.has('אבי לוי')), 'D7 helper removed and persisted');
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
    await s.click('חדש'); log(await s.has('בעל דוכן חדש'), 'V1 new form opens');
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
    await s.click('הסרת הגישה'); await s.click('כן, להסיר את הגישה של כולם'); await s.reload();
    log(await s.has('אף אחד עוד לא מקושר'), 'V6 remove access persisted');
    await s.go('/manage/events/demo-e-festival/vendors'); log(await s.has('הוזמנו'), 'N8 renders');
    await s.click('תזכורת'); log(await s.has('בהדגמה לא נשלח'), 'N8 reminder intercepted');
    const before = await s.page.locator('.k-stat__value').first().innerText();
    await s.click('הזמנה מהמאגר'); await s.page.getByRole('dialog').locator('.k-row').first().click(); await s.page.waitForTimeout(250); await s.page.keyboard.press('Escape');
    await s.reload(); const after = await s.page.locator('.k-stat__value').first().innerText();
    log(Number(after) === Number(before) + 1, `N8 invite from pool persisted (${before} -> ${after})`);
    if (await s.page.getByText('להזמין את מי שהיה ביריד אוקטובר').count()) { await s.click('להזמין את מי שהיה ביריד אוקטובר'); await s.reload(); }
    log((await s.page.getByText('להזמין את מי שהיה').count()) === 0, 'N8 invite previous event persisted');
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

if (process.env.FIRESTORE_EMULATOR_HOST) fails += await rulesPart();
else await clickPart();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
