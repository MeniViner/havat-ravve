// Exercise the real picker with browser scrolling at phone width, including its initially unanswered state.
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';

const fixture = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx', contents: `
      import { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { BirthYearField } from './src/app/v2/screens/system/fields';
      import './src/app/v2/kit/kit.css';
      import './src/app/v2/screens/system/system.css';
      function Fixture() {
        const [year, setYear] = useState();
        return <div className="v2" dir="rtl" style={{padding:16}}>
          <BirthYearField value={year} onChange={setYear} invalid={year === undefined}/>
          <button onClick={() => setYear(1889)}>פרופיל משנת 1889</button>
        </div>;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);
    `
  },
  outfile: 'picker.js', bundle: true, write: false, format: 'iife', jsx: 'automatic',
  external: ['/assets/*'], define: { 'process.env.NODE_ENV': '"production"' }
});
const html = '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/picker.css"><div id="root"></div><script src="/picker.js"></script></html>';
const server = http.createServer((req, res) => {
  if (req.url === '/') return res.setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
  const asset = fixture.outputFiles.find(file => file.path.endsWith(req.url));
  if (!asset) return res.writeHead(404).end();
  res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css').end(asset.contents);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ hasTouch: true, viewport: { width: 320, height: 640 } });
      await page.goto('http://127.0.0.1:' + server.address().port);
      const picker = page.getByRole('spinbutton', { name: 'אנא בחר שנת לידה' });
      await picker.waitFor();
      await picker.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await picker.getAttribute('aria-valuenow'), null);
      assert.equal(await picker.getAttribute('aria-required'), 'true');
      const label = await page.getByText('אנא בחר שנת לידה', { exact: true }).boundingBox();
      const wheel = await picker.boundingBox();
      assert.ok(wheel.height <= 44 && wheel.width >= label.width * 1.9 && wheel.x + wheel.width <= label.x);

      await picker.getByText('2000', { exact: true }).tap();
      const current = Number(await picker.getAttribute('aria-valuemax'));
      await page.getByText('גילך הוא ' + (current - 2000) + ' שנים').waitFor();
      await picker.press('ArrowRight');
      assert.equal(await picker.getAttribute('aria-valuenow'), '1999');
      await picker.press('Home');
      assert.equal(await picker.getAttribute('aria-valuenow'), '1900');
      await picker.press('End');
      assert.equal(await picker.getAttribute('aria-valuenow'), String(current));
      await page.getByRole('button', { name: 'פרופיל משנת 1889' }).click();
      assert.equal(await picker.getAttribute('aria-valuenow'), '1889');
      await picker.press('ArrowLeft');
      assert.equal(await picker.getAttribute('aria-valuenow'), '1900');

      const x = wheel.x + wheel.width / 2, y = wheel.y + wheel.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(() => Number(document.querySelector('[role=spinbutton]').getAttribute('aria-valuenow')) > 1900);
      if (engine === chromium) {
        const cdp = await page.context().newCDPSession(page);
        await picker.press('End');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: wheel.x + wheel.width - 8, y }] });
        for (let right = wheel.width - 20; right > 8; right -= 12) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: wheel.x + right, y }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(max => Number(document.querySelector('[role=spinbutton]').getAttribute('aria-valuenow')) < max, current);
      }
      console.log('PASS compact required birth year, RTL layout, age, keyboard, tap and scroll — ' + engine.name());
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
