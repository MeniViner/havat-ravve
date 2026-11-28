// Phone-sized browser checks; deny external tile traffic during scripted map interaction.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin = process.env.SURVEY_WEB_ORIGIN || 'http://localhost:5194';
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
  const exceptions = [];
  page.on('pageerror', (e) => exceptions.push(e.message));
  await page.goto(origin + '/app/farm/map?demo=owner');
  const button = (name) => page.getByRole('button', { name, exact: true });
  await button('בחירה ידנית במפה').and(page.locator(':enabled')).waitFor();
  const marker = page.locator('.survey-place-button').first();
  const placeName = await marker.getAttribute('aria-label');
  const placeHeading = page.getByRole('heading', { name: placeName, exact: true });
  for (const key of ['Enter', 'Space']) {
    await marker.press(key);
    await placeHeading.waitFor();
    assert.ok(await placeHeading.evaluate(el => el === document.activeElement));
    await button('סגירה').click();
  }
  await marker.click();
  await placeHeading.waitFor();
  await button('סגירה').click();
  // Disconnecting disposes the basemap. Zooming after reconnect must not call the detached layer.
  await ctx.setOffline(true);
  await page.getByText(/אין רשת · מפת הרקע/).waitFor();
  await ctx.setOffline(false);
  await page.locator('.leaflet-control-zoom-out').click();
  await page.locator('.leaflet-control-zoom-in').click();
  await button('לאפשר גישה למיקום').click();
  await page.evaluate(() => window.feedTestFix('timeout'));
  await page.getByRole('heading', { name: 'הזמן לקבלת מדידה חלף' }).waitFor();
  await page.evaluate(() => window.feedTestFix('unavailable'));
  await page.getByRole('heading', { name: 'המיקום אינו זמין' }).waitFor();
  await page.evaluate(() => window.feedTestFix('weak'));
  await page.getByText(/דיוק משוער 45/).waitFor();
  await page.evaluate(() => window.feedTestFix('stale'));
  assert.ok(await button('שמירת מקום כאן').isDisabled());
  await page.evaluate(() => window.feedTestFix('denied'));
  await page.getByRole('heading', { name: 'הגישה למיקום חסומה' }).waitFor();
  await button('בחירה ידנית במפה').click();
  await page.getByRole('region', { name: 'מפת החווה' }).click({ position: { x: 125, y: 110 } });
  await page.getByLabel('שם המקום').fill('טיוטה לביטול');
  await button('ביטול').click();
  await button('חיפוש ורשימה').click();
  await page.getByLabel('חיפוש במפה').fill('טיוטה לביטול');
  await page.getByText('אין תוצאות לחיפוש הזה').waitFor();
  await page.getByLabel('חיפוש במפה').fill('');
  await button('מפה').click();
  await button('בחירה ידנית במפה').click();
  await page.getByRole('region', { name: 'מפת החווה' }).click({ position: { x: 130, y: 115 } });
  await page.getByLabel('שם המקום').fill('שער ידני לבדיקה');
  await page.reload();
  await page.getByLabel('שם המקום').waitFor();
  assert.equal(await page.getByLabel('שם המקום').inputValue(), 'שער ידני לבדיקה');
  await button('שמירת המקום').click();
  await page.getByRole('heading', { name: 'שער ידני לבדיקה' }).waitFor();
  await button('עריכת מקום').click();
  await page.getByLabel('שם המקום').fill('שער לאחר תיקון');
  await button('תיקון במפה').click();
  await page.getByRole('region', { name: 'מפת החווה' }).click({ position: { x: 140, y: 116 } });
  await button('שמירת המקום').click();
  await page.getByRole('heading', { name: 'שער לאחר תיקון' }).waitFor();
  assert.equal(await page.locator('.survey-screen').evaluate((x) => getComputedStyle(x).direction), 'rtl');
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
  await button('חיפוש ורשימה').click();
  await button('שביל צפוני · מאושר').click();
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
  await button('חיפוש ורשימה').click();
  await button('שביל צפוני · מאושר').click();
  await page.getByText('כניסות וחיבורים (1)').click();
  await page.getByText(/נדרש אישור מחדש/).waitFor();
  await button('אישור ושמירת השביל').click();
  await page.getByText(/אחד היעדים השתנה/).waitFor();
  await page.goto(origin + '/app/farm/map?demo=owner&day=eventDay');
  await page.getByRole('heading', { name: 'מפת החווה' }).waitFor();
  assert.ok((await page.locator('nav').innerText()).includes('אירוע'));
  for (const role of ['staff', 'manager']) {
    for (const day of ['regular', 'eventDay']) {
      await page.goto(origin + '/app/farm/map?demo=' + role + '&day=' + day);
      await page.getByRole('heading', { name: 'מפת החווה' }).waitFor();
      await page.locator('.leaflet-container').waitFor();
      assert.equal(await button('בחירה ידנית במפה').count(), 0);
      const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
      const map = await nav.getByRole('button', { name: 'מפה', exact: true }).boundingBox();
      const bar = await nav.boundingBox();
      assert.ok(Math.abs(map.x + map.width / 2 - bar.x - bar.width / 2) < 2);
    }
  }
  await page.goto(origin + '/app/farm/map?demo=anon');
  await page.getByRole('heading', { name: 'כניסה למפת החווה' }).waitFor();
  await page.getByRole('button', { name: /Google/ }).waitFor();
  assert.equal(await page.locator('.leaflet-container').count(), 0);
  await page.goto(origin + '/app/farm/map?demo=guest');
  await page.getByText('מפת החווה זמינה לצוות החווה').waitFor();
  assert.equal(await page.locator('.leaflet-container').count(), 0);
  assert.deepEqual(exceptions, []);
  console.log(
    'PASS mobile RTL map, browser measurement states, manual selection, cancellation, reload, edit, search, explicit trail connection, stale target and read-only team access, centered navigation and guest route guard'
  );
} finally {
  await browser.close();
}
