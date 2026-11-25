// Run against scripts/dev.mjs. The demo and network allowlist keep this test local.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch();
try {
  for (const { persona, account, width } of [
    { persona: 'owner', account: '/me', width: 1440 },
    { persona: 'guest', account: '/me/account', width: 375 },
    { persona: 'vendor', account: '/me', width: 375 },
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      colorScheme: 'dark',
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(base + '/app' + account + '?demo=' + persona);
    await page.getByRole('button', { name: /עיצוב/ }).click();
    await page.getByRole('heading', { name: 'עיצוב' }).waitFor();
    const light = page.getByRole('radio', { name: /^בהיר/ });
    const system = page.getByRole('radio', { name: /^לפי המכשיר/ });
    const dark = page.getByRole('radio', { name: /^כהה תמיד/ });
    const scheme = () => page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme);
    assert.equal(await light.getAttribute('aria-checked'), 'true');
    assert.equal(await scheme(), 'light');
    await system.click();
    assert.equal(await scheme(), 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => !document.documentElement.dataset.theme);
    assert.equal(await system.getAttribute('aria-checked'), 'true');
    await dark.click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.reload();
    await dark.waitFor();
    assert.equal(await dark.getAttribute('aria-checked'), 'true');
    assert.equal(await scheme(), 'dark');
    assert.equal(await page.locator('.k-screen').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(24, 29, 26)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await light.click();
    assert.equal(await scheme(), 'light');
    await page.getByRole('button', { name: 'חזרה לחשבון' }).click();
    await page.waitForURL((url) => url.pathname === '/app' + account);
    assert.equal(await scheme(), 'light');
    await context.close();
    console.log(`Appearance passed for ${persona} at ${width}px`);
  }
} finally {
  await browser.close();
}
