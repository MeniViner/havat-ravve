// Phone-sized browser checks; deny external tile traffic during scripted map interaction.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin = process.env.SURVEY_WEB_ORIGIN || 'http://127.0.0.1:62276';
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  await ctx.addInitScript(() => {
    let success, fail;
    Object.defineProperty(navigator, 'permissions', {
      value: { query: async () => ({ state: 'prompt', onchange: null }) },
    });
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (a, b) => {
          success = a;
          fail = b;
          return 1;
        },
        clearWatch: () => {},
      },
    });
    window.feedTestFix = (mode) => {
      if (mode === 'timeout' || mode === 'unavailable' || mode === 'denied') {
        fail({ code: mode === 'timeout' ? 3 : mode === 'denied' ? 1 : 2 });
        return;
      }
      success({
        timestamp: Date.now() - (mode === 'stale' ? 60000 : 0),
        coords: { latitude: 50, longitude: 10, accuracy: mode === 'weak' ? 45 : 7 },
      });
    };
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const exceptions = [];
  page.on('pageerror', (e) => exceptions.push(e.message));
  await page.goto(origin + '/app/farm/map?example=owner');
  const button = (name) => page.getByRole('button', { name, exact: true });
  const find = page.getByRole('combobox', { name: 'חיפוש מקום או שביל בחווה' });
  const heading = name => page.getByRole('heading', { name, exact: true });
  const editMode = async () => { await button('עריכת המפה').click(); };
  const add = async () => {
    await page.getByRole('button', { name: /^הוספת מקום/ }).click();
    await button('בחירת נקודה במפה').click();
    await page.getByRole('region', { name: 'מפת החווה' }).click({ position: { x: 110, y: 150 } });
    await button('אישור הנקודה').click();
  };
  const searchFor = async (name) => {
    await find.fill(name);
    await page.getByRole('option', { name: new RegExp(name) }).click();
    await heading(name).waitFor();
  };
  const editTrail = async name => {
    await editMode();
    await button('סגירה').click();
    await searchFor(name);
    await button('עריכת השביל').click();
  };
  const marker = page.locator('.survey-place-button').first();
  await marker.waitFor();
  const placeName = await marker.getAttribute('aria-label');
  for (const key of ['Enter', 'Space']) {
    await marker.press(key);
    await heading(placeName).waitFor();
    assert.ok(await heading(placeName).evaluate(el => el === document.activeElement));
    await button('סגירה').click();
  }
  await marker.click();
  await heading(placeName).waitFor();
  await button('סגירה').click();
  await ctx.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  await ctx.setOffline(false);
  await page.setViewportSize({ width: 1180, height: 800 });
  await button('התרחקות').click();
  await button('התקרבות').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await button('המיקום שלי').click();
  await button('לאפשר גישה למיקום').click();
  for (const [fix, message] of [
    ['timeout', 'הזמן לקבלת מדידה חלף'], ['unavailable', 'המיקום אינו זמין'],
    ['weak', 'דיוק משוער 45'], ['stale', 'מדידה ישנה'], ['denied', 'הגישה למיקום חסומה'],
  ]) {
    await page.evaluate(mode => window.feedTestFix(mode), fix);
    await page.locator('.fm-sheet').getByText(message, { exact: false }).first().waitFor();
  }
  await button('סגירה').click();
  await editMode();
  await add();
  await page.getByLabel('שם המקום').fill('טיוטה לביטול');
  await button('ביטול הטיוטה').click();
  await button('מחיקת הטיוטה').click();
  await button('סגירה').click();
  await find.fill('טיוטה לביטול');
  await page.getByText('לא נמצאו מקומות או שבילים בשם הזה.').waitFor();
  await find.press('Escape');
  await button('כלי עריכה').click();
  await add();
  await page.getByLabel('שם המקום').fill('שער ידני לבדיקה');
  await button('שער').click();
  await page.reload();
  await editMode();
  await page.getByRole('button', { name: /^הטיוטות שלי/ }).click();
  await page.getByRole('button', { name: /שער ידני לבדיקה/ }).click();
  assert.equal(await page.getByLabel('שם המקום').inputValue(), 'שער ידני לבדיקה');
  await button('שמירת המקום').click();
  await button('חזרה למפה').click();
  await searchFor('שער ידני לבדיקה');
  await button('עריכת המקום').click();
  await page.getByLabel('שם המקום').fill('שער לאחר תיקון');
  await button('הזזה במפה').click();
  await button('בחירת מרכז המפה').click();
  await button('אישור הנקודה').click();
  await button('שמירת המקום').click();
  await button('חזרה למפה').click();
  await searchFor('שער לאחר תיקון');
  assert.equal(await page.locator('.farm-map-workspace').evaluate(x => getComputedStyle(x).direction), 'rtl');
  for (const label of ['משימות', 'קניות', 'החווה', 'ניהול'])
    assert.ok((await page.locator('nav').innerText()).includes(label), label);
  // Two independently surveyed paths can be joined only at vertices the owner selects.
  await page.evaluate(() => {
    const overrides = JSON.parse(localStorage.getItem('farm-demo-overrides') || '{}');
    overrides.farmTrails ??= {};
    for (const [id, name] of [
      ['first', 'שביל צפוני'],
      ['second', 'שביל דרומי'],
    ]) {
      const points = [1, 2, 3].map((seq) => ({ seq, segment: 1, lat: 50 + seq / 100000, lng: 10 }));
      overrides.farmTrails[id] = {
        name,
        ownerUid: 'demo-u-beni',
        recordingId: id,
        revision: 'v1',
        geometry: 'g1',
        status: 'confirmed',
        modes: ['walk'],
        connections: [],
        count: 3,
        chunks: 1,
        updatedAt: Date.now(),
      };
      overrides['farmTrails/' + id + '/versions/g1/chunks'] = { 0: { index: 0, points } };
    }
    localStorage.setItem('farm-demo-overrides', JSON.stringify(overrides));
  });
  await page.reload();
  await editTrail('שביל צפוני');
  await page.getByText('כניסות וחיבורים (0)').click();
  await page.getByLabel('יעד החיבור').selectOption('trail:second');
  assert.ok(await button('אישור החיבור בשטח').isDisabled());
  await page.getByLabel('נקודת הכניסה בשביל הזה').fill('2');
  await page.getByLabel('נקודה בשביל היעד').selectOption('3');
  await button('אישור החיבור בשטח').click();
  await button('אישור ושמירת השביל').click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('farm-demo-overrides')).farmTrails.first.connections.length === 1
  );
  const savedLink = await page.evaluate(
    () => JSON.parse(localStorage.getItem('farm-demo-overrides')).farmTrails.first.connections[0]
  );
  assert.equal(savedLink.at, 2);
  assert.equal(savedLink.targetVertex, 3);
  assert.equal(savedLink.targetGeometry, 'g1');
  assert.equal(savedLink.mode, 'walk');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('farm-demo-overrides'));
    data.farmTrails.second.geometry = 'g2';
    data['farmTrails/second/versions/g2/chunks'] = data['farmTrails/second/versions/g1/chunks'];
    localStorage.setItem('farm-demo-overrides', JSON.stringify(data));
  });
  await page.reload();
  await editTrail('שביל צפוני');
  await page.getByText('כניסות וחיבורים (1)').click();
  await page.getByText(/נדרש אישור מחדש/).waitFor();
  await button('אישור ושמירת השביל').click();
  await page.getByText(/אחד היעדים השתנה/).waitFor();
  await page.goto(origin + '/app/farm/map?example=owner&scenario=eventDay');
  await page.getByRole('heading', { name: 'מפת החווה' }).waitFor();
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('button', { name: 'אירוע', exact: true }).waitFor();
  for (const role of ['staff', 'manager']) {
    for (const day of ['regular', 'eventDay']) {
      await page.goto(origin + '/app/farm/map?example=' + role + '&scenario=' + day);
      await page.getByRole('heading', { name: 'מפת החווה' }).waitFor();
      await page.locator('.leaflet-container').waitFor();
      assert.equal(await button('עריכת המפה').count(), 0);
      await searchFor('שביל החממה');
      assert.equal(await button('עריכת השביל').count(), 0);
      const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
      const map = await nav.getByRole('button', { name: 'מפה', exact: true }).boundingBox();
      const bar = await nav.boundingBox();
      assert.ok(Math.abs(map.x + map.width / 2 - bar.x - bar.width / 2) < 2);
    }
  }
  await page.goto(origin + '/app/farm/map?example=anon');
  await page.getByRole('heading', { name: 'כניסה למפת החווה' }).waitFor();
  await page.getByRole('button', { name: /Google/ }).waitFor();
  assert.equal(await page.locator('.leaflet-container').count(), 0);
  await page.goto(origin + '/app/farm/map?example=guest');
  await page.getByText('מפת החווה זמינה לצוות החווה').waitFor();
  assert.equal(await page.locator('.leaflet-container').count(), 0);
  assert.deepEqual(exceptions, []);
  console.log(
    'PASS mobile RTL map, browser measurement states, manual selection, cancellation, reload, edit, search, explicit trail connection, stale target and read-only team access, centered navigation and guest route guard'
  );
} finally {
  await browser.close();
}
