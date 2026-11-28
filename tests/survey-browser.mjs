// Phone-sized browser checks; deny external tile traffic during scripted map interaction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const origin = process.env.SURVEY_WEB_ORIGIN || 'http://localhost:5194';
const browser = await chromium.launch({ headless: true });
let currentPage;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  // Serve the built app in-process. No farm, tile or authentication request leaves this context.
  let failTile = '';
  let allowTiles = false;
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (allowTiles && url.hostname === 'tile.openstreetmap.org' && url.pathname !== failTile) {
      return route.fulfill({path: 'public/assets/beersheba-ortho-2015.jpg',contentType:'image/jpeg'});
    }
    if (url.origin !== origin) return route.abort();
    const file = path.resolve(
      'dist',
      url.pathname.startsWith('/app/') || url.pathname === '/app' ? 'app.html' : '.' + url.pathname
    );
    if (!file.startsWith(path.resolve('dist') + path.sep)) return route.abort();
    try {
      await route.fulfill({ path: file, headers: { 'cache-control': 'no-cache' } });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
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
    window.feedTestFix = (mode, delta = 0) => {
      if (mode === 'timeout' || mode === 'unavailable' || mode === 'denied') {
        fail({ code: mode === 'timeout' ? 3 : mode === 'denied' ? 1 : 2 });
        return;
      }
      success({
        timestamp: Date.now() - (mode === 'stale' ? 60000 : 0),
        coords: { latitude: 50 + delta, longitude: 10, accuracy: mode === 'weak' ? 45 : 7 },
      });
    };
  });
  const page = await ctx.newPage();
  currentPage = page;
  const exceptions = [];
  page.on('pageerror', (e) => exceptions.push(e.message));
  await page.goto(origin + '/app/farm/map?demo=owner');
  const button = (name) => page.getByRole('button', { name, exact: true });
  page.setDefaultTimeout(8000);
  const map = page.getByRole('region', { name: 'מפת החווה' });
  const heading = (name) => page.getByRole('heading', { name, exact: true });
  const search = page.getByRole('searchbox', { name: 'חיפוש במפה' });
  const checkTypingFocus = async (input, frame = input) => {
    const border = (el) => el.evaluate((node) => getComputedStyle(node).borderTopColor);
    const idleBorder = await border(frame);
    const idleHeight = (await frame.boundingBox()).height;
    await input.click();
    assert.ok(await input.evaluate((node) => node === document.activeElement));
    const style = await input.evaluate((node) => {
      const s = getComputedStyle(node);
      return [s.outlineStyle, s.boxShadow];
    });
    assert.deepEqual(style, ['none', 'none']);
    assert.equal(await border(frame), 'rgba(0, 0, 0, 0)');
    assert.equal((await frame.boundingBox()).height, idleHeight);
    await input.press('Tab');
    assert.notEqual(idleBorder, 'rgba(0, 0, 0, 0)');
    assert.equal(await border(frame), idleBorder);
  };
  const openEdit = () => button('עריכת המפה').click();
  const clickPoint = async (x = 120, y = 215) => {
    await map.click({ position: { x, y } });
    await button('אישור המיקום').click();
  };
  const menu = async () => {
    if (await button('כל כלי העריכה').isVisible()) await button('כל כלי העריכה').click();
  };
  const marker = page.locator('.survey-place-button').first();
  await marker.waitFor();
  const name = await marker.getAttribute('aria-label');
  for (const key of ['Enter', 'Space']) {
    await marker.press(key);
    await heading(name).waitFor();
    assert.ok(await heading(name).evaluate((el) => el === document.activeElement));
    await button('סגירה').click();
  }
  await checkTypingFocus(search, page.locator('.map-search'));
  await search.fill(name);
  await button(name).and(page.locator('.survey-hit')).click();
  await heading(name).waitFor();
  const base = page.getByRole('combobox', {name:'רקע למפה'});
  const chosen = page.locator('.survey-marker.chosen');
  const position = await chosen.boundingBox();
  assert.equal(await base.inputValue(), 'aerial');
  for (const mode of ['satellite','osm','aerial']) {
    await base.selectOption(mode);
    await heading(name).waitFor();
    const after = await chosen.boundingBox();
    assert.ok(Math.abs(after.x-position.x) < 1 && Math.abs(after.y-position.y) < 1, 'camera kept at selected place');
    if (mode !== 'osm') {
      await page.waitForFunction(() => {
        const img = document.querySelector('.regional-satellite');
        return img && img.complete && img.naturalWidth > 0;
      });
    }
  }
  await base.selectOption('osm');
  const status = page.locator('.survey-tile-status');
  await status.getByRole('button').waitFor();
  // Identify the tile under the actual viewport center, regardless of the camera saved by the fixture.
  failTile = await page.evaluate(() => {
    const box = document.querySelector('.survey-map-canvas').getBoundingClientRect();
    const x = box.x + box.width/2, y = box.y + box.height/2;
    const tile = [...document.querySelectorAll('img.leaflet-tile')].find(img => {
      const r = img.getBoundingClientRect(); return r.left<=x && x<r.right && r.top<=y && y<r.bottom;
    });
    return new URL(tile.src).pathname;
  });
  allowTiles = true;
  await status.getByRole('button').click();
  await page.waitForFunction(() => document.querySelector('.leaflet-tile[data-state="ok"]') &&
    document.querySelector('.leaflet-tile[data-state="error"]'));
  await status.getByText('הרקע באזור הזה לא נטען', {exact:false}).waitFor();
  failTile = '';
  await status.getByRole('button').click();
  await status.waitFor({state:'hidden'});
  allowTiles = false;
  await base.selectOption('aerial');
  await button('סגירה').click();
  await openEdit();
  await button('הגדרת מבט הפתיחה').click();
  await page.locator('.leaflet-control-zoom-out').click();
  await button('שמירת המבט הזה').click();
  await page.waitForFunction(
    () => !!JSON.parse(localStorage.getItem('farm-demo-overrides') || '{}').farmMap?.home
  );
  const savedHome = await page.evaluate(
    () => JSON.parse(localStorage.getItem('farm-demo-overrides')).farmMap.home
  );
  assert.ok(Number.isInteger(savedHome.zoom));
  await page.locator('.leaflet-control-zoom-in').click();
  await button('מבט על החווה').click();
  await button('הגדרת מבט הפתיחה').click();
  const readout = () => page.getByLabel('מרכז וזום').innerText();
  const expectHome = savedHome.lat.toFixed(5) + ', ' + savedHome.lng.toFixed(5) + ' · זום ' + savedHome.zoom;
  assert.equal(await readout(), expectHome);
  await page.locator('.leaflet-control-zoom-in').click();
  await button('סגירה').click();
  await button('הגדרת מבט הפתיחה').click();
  assert.equal(await readout(), expectHome);
  await button('סגירה').click();
  await button('מקומות').click();
  await button('בחירה ידנית במפה').click();
  await clickPoint();
  const placeName = page.getByLabel('שם המקום', { exact: true });
  await checkTypingFocus(placeName);
  await placeName.fill('טיוטה לביטול');
  await button('ביטול').click();
  await button('בחירה ידנית במפה').click();
  await clickPoint();
  await page.getByLabel('שם המקום', { exact: true }).fill('שער ידני לבדיקה');
  await page.getByLabel('אייקון המקום').selectOption('gate');
  await page.reload();
  await openEdit();
  assert.equal(await page.getByLabel('שם המקום', { exact: true }).inputValue(), 'שער ידני לבדיקה');
  await button('שמירת המקום').click();
  await page.waitForFunction(() =>
    Object.values(JSON.parse(localStorage.getItem('farm-demo-overrides') || '{}').places || {}).some(
      (p) => p.markerIcon === 'gate'
    )
  );
  await button('מקומות').click();
  await button('שער ידני לבדיקה').and(page.locator('.survey-hit')).click();
  await button('תיקון במפה').click();
  await clickPoint(132, 205);
  await page.locator('input[type=file]').setInputFiles({
    name: 'dot.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwLg8FAAHgAQDtKhqNAAAAAElFTkSuQmCC',
      'base64'
    ),
  });
  await page.getByRole('radio', { name: 'תמונה ממוזערת', exact: true }).check();
  await button('שמירת המקום').click();
  await page.locator('.survey-place-button img').first().waitFor();
  await button('שבילים והקלטה').click();
  await button('לאפשר גישה למיקום').click();
  await page.evaluate(() => window.feedTestFix('timeout'));
  await heading('הזמן לקבלת מדידה חלף').waitFor();
  await page.evaluate(() => window.feedTestFix('unavailable'));
  await heading('המיקום אינו זמין').waitFor();
  await page.evaluate(() => window.feedTestFix('denied'));
  await heading('הגישה למיקום חסומה').waitFor();
  await button('בדיקת מיקום מחדש').click();
  await page.evaluate(() => window.feedTestFix('weak'));
  await page
    .getByText(/דיוק משוער 45/)
    .first()
    .waitFor();
  assert.ok(await button('התחלת הקלטת שביל').isDisabled());
  await page.evaluate(() => window.feedTestFix('stale'));
  assert.ok(await button('התחלת הקלטת שביל').isDisabled());
  await page.evaluate(() => window.feedTestFix('fresh'));
  await button('התחלת הקלטת שביל').click();
  await button('השהיית ההקלטה').waitFor();
  await base.selectOption('satellite');
  await button('השהיית ההקלטה').waitFor();
  await base.selectOption('aerial');
  await page.evaluate(() => window.feedTestFix('fresh', 0.00001));
  await button('השהיית ההקלטה').click();
  await button('חידוש ההקלטה').click();
  await page.evaluate(() => window.feedTestFix('fresh', 0.00002));
  await button('הוספת מקום או תמונה').click();
  await button('שמירת מקום כאן').click();
  await page.getByLabel('שם המקום', { exact: true }).fill('לאורך השביל');
  await button('שמירת המקום').click();
  await page.waitForFunction(() =>
    Object.values(JSON.parse(localStorage.getItem('farm-demo-overrides') || '{}').places || {}).some(
      (p) => p.name === 'לאורך השביל'
    )
  );
  await page.getByLabel('שם המקום', { exact: true }).waitFor({ state: 'hidden' });
  await page.reload();
  await button('חידוש ההקלטה').waitFor();
  await openEdit();
  await button('שבילים והקלטה').click();
  await button('לאפשר גישה למיקום').click();
  await page.evaluate(() => window.feedTestFix('fresh', 0.00003));
  await button('חידוש ההקלטה').click();
  await page.evaluate(() => window.feedTestFix('fresh', 0.00004));
  await button('סיום וסקירה').click();
  await button('פתיחת הסקירה').click();
  await heading('סקירת השביל').waitFor();
  await page.getByRole('textbox', { name: 'שם השביל' }).fill('הליכת בדיקה');
  await page.getByRole('checkbox', { name: 'הליכה', exact: true }).check();
  await button('אישור ושמירת השביל').click();
  await page.waitForFunction(() =>
    Object.values(JSON.parse(localStorage.getItem('farm-demo-overrides') || '{}').farmTrails || {}).some(
      (t) => t.status === 'confirmed'
    )
  );
  assert.equal(await page.locator('.survey-screen').evaluate((x) => getComputedStyle(x).direction), 'rtl');
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
  await openEdit();
  await button('שבילים והקלטה').click();
  await button('שביל צפוני · עריכה וחיבורים').click();
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
  await openEdit();
  await button('שבילים והקלטה').click();
  await button('שביל צפוני · עריכה וחיבורים').click();
  await page.getByText('כניסות וחיבורים (1)').click();
  await page.getByText(/נדרש אישור מחדש/).waitFor();
  await button('אישור ושמירת השביל').click();
  await page.getByText(/אחד היעדים השתנה/).waitFor();
  for (const role of ['owner', 'manager', 'staff', 'vendor', 'helper', 'guest', 'anon', 'blocked', 'new']) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin + '/app/farm/map?demo=' + role + '&day=eventDay');
      await map.waitFor();
      const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
      const tab = nav.getByRole('button', { name: 'מפה', exact: true });
      assert.equal(await tab.getAttribute('aria-current'), 'page', role);
      const rect = await tab.boundingBox();
      assert.ok(Math.abs(rect.x + rect.width / 2 - width / 2) < 2, role + ' centered tab');
      assert.ok((await map.boundingBox()).width >= width - 2, role + ' full viewport');
      assert.equal(await button('עריכת המפה').count(), role === 'owner' ? 1 : 0, role);
      await button('מבט על החווה').click();
      await button('שכבות המפה').click();
      await button('סגירה').click();
      if (role === 'owner') assert.ok((await nav.innerText()).includes('אירוע'));
    }
  }
  assert.deepEqual(exceptions, []);
  console.log(
    'PASS map journeys, recording, draft recovery, public roles, owner edits, center tab and desktop/mobile layout'
  );
} catch (err) {
  if (currentPage)
    console.error(
      'Visible map state:',
      (
        await currentPage
          .locator('.map-stage')
          .innerText()
          .catch(() => '')
      ).slice(-1400)
    );
  throw err;
} finally {
  await browser.close();
}
