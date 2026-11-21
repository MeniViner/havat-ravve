// Visual check of the redesign: opens each screen in demo mode at 390x844 (device scale 2), takes a screenshot,
// and saves it next to the design PNG with a pixel-difference score.
//
//   node scripts/dev.mjs                         (in another terminal; or PORT=5201 node scripts/dev.mjs)
//   node scripts/visual-check.mjs [ids...] [--base=http://localhost:5173] [--out=docs/visual-check] [--design=havat-raveh-redesign/design]
//
// Rows come from docs/demo-coverage.md (id | persona | scenario | route | steps).
// steps (separated by ";"): click:<text> · button:<accessible name> · fill:<placeholder or label>=<text> · wait:<ms> · scroll:<px> · demo:<offline|refuseNext|empty> · fullpage
// Output per screen: <out>/<id>.actual.png (2x), <out>/<id>.pair.jpg (design | app, 1x), and <out>/results.json (diff score 0..1).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const ids = args.filter((a) => !a.startsWith('--'));
const BASE = opt('base', process.env.BASE || 'http://localhost:5173');
const OUT = opt('out', 'docs/visual-check');
const DESIGN = opt('design', process.env.DESIGN || 'havat-raveh-redesign/design');
fs.mkdirSync(OUT, { recursive: true });

const rows = fs.readFileSync('docs/demo-coverage.md', 'utf8').split('\n')
  .map((l) => l.match(/^\| ([A-Z]\d+-[\w]+) \| (\w+) \| (\w+) \| ([^|]*) \| ([^|]*)\|/))
  .filter(Boolean).map((m) => ({ id: m[1], persona: m[2], scenario: m[3], route: m[4].trim(), steps: m[5].trim() }))
  .filter((r) => !ids.length || ids.some((i) => r.id === i || r.id.startsWith(i + '-') || r.id.split('-')[0] === i));

const browser = await chromium.launch();
const resultsFile = path.join(OUT, 'results.json');
const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : {};
for (const r of rows) {
  const steps = r.steps ? r.steps.split(';').map((s) => s.trim()).filter(Boolean) : [];
  const states = { offline: steps.includes('demo:offline'), refuseNext: steps.includes('demo:refuseNext'), empty: steps.includes('demo:empty') };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  await ctx.addInitScript(([persona, scenario, st]) => {
    if (sessionStorage.getItem('__vc')) return; // only on the first load: steps may navigate
    sessionStorage.setItem('__vc', '1');
    localStorage.clear();
    localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona, scenario }));
    localStorage.setItem('farm-demo-states', JSON.stringify(st));
    localStorage.setItem('farm-install-dismissed', '1');
  }, [r.persona, r.scenario, states]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(`${BASE}/app${r.route || '/'}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    for (const s of steps) {
      const [k, ...rest] = s.split(':'); const v = rest.join(':');
      if (k === 'click') await page.getByText(v, { exact: false }).first().click();
      else if (k === 'button') await page.getByRole('button', { name: v }).first().click();
      else if (k === 'fill') { const [label, text] = v.split('='); const el = page.getByPlaceholder(label).or(page.getByLabel(label)).first(); await el.fill(text); }
      else if (k === 'wait') await page.waitForTimeout(Number(v));
      else if (k === 'scroll') await page.mouse.wheel(0, Number(v));
      await page.waitForTimeout(250);
    }
    // the designs show the demo strip only on Z2-Z5: hide it elsewhere so the comparison lines up
    if (!r.id.startsWith('Z') && !args.includes('--strip')) await page.addStyleTag({ content: '.k-demo{display:none!important}' });
    await page.waitForTimeout(100);
    const full = steps.includes('fullpage');
    // the v2 screen body scrolls on its own: let it grow so a full-page shot shows everything
    if (full) await page.addStyleTag({ content: '.k-screen{height:auto!important;min-height:100dvh;overflow:visible!important}.k-screen__body{overflow:visible!important}' });
    const actual = path.join(OUT, `${r.id}.actual.png`);
    await page.screenshot({ path: actual, fullPage: full });
    const designPng = path.join(DESIGN, 'png', `${r.id}.png`);
    let score = null;
    if (fs.existsSync(designPng)) {
      const cmp = await ctx.newPage();
      await cmp.setViewportSize({ width: 800, height: 900 });
      const a = fs.readFileSync(designPng).toString('base64'); const b = fs.readFileSync(actual).toString('base64');
      score = await cmp.evaluate(async ([a, b]) => {
        const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
        const [A, B] = await Promise.all([load(a), load(b)]);
        const w = A.width, h = Math.max(A.height, B.height);
        const c = document.createElement('canvas'); c.width = w; c.height = A.height; const x = c.getContext('2d');
        x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, w, A.height).data;
        x.clearRect(0, 0, w, A.height); x.fillStyle = '#fff'; x.fillRect(0, 0, w, A.height); x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, w, A.height).data;
        let diff = 0; const n = w * A.height;
        for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) diff++;
        // the pair: design | app at 1x
        const p = document.createElement('canvas'); p.width = w + 24; p.height = h / 2 + 30; p.style.width = p.width + 'px';
        const y = p.getContext('2d'); y.fillStyle = '#888'; y.fillRect(0, 0, p.width, p.height);
        y.drawImage(A, 0, 30, w / 2, A.height / 2); y.drawImage(B, w / 2 + 24, 30, B.width / 2, B.height / 2);
        y.fillStyle = '#fff'; y.font = '16px sans-serif'; y.fillText('design', 8, 20); y.fillText('app', w / 2 + 32, 20);
        document.body.style.margin = '0'; document.body.appendChild(p);
        return { diff: diff / n, w: p.width, h: p.height };
      }, [a, b]);
      await cmp.setViewportSize({ width: score.w, height: Math.ceil(score.h) });
      await cmp.locator('canvas').screenshot({ path: path.join(OUT, `${r.id}.pair.jpg`), type: 'jpeg', quality: 72 });
      await cmp.close();
    }
    results[r.id] = { ...r, diff: score ? Math.round(score.diff * 1000) / 1000 : null, errors: errors.slice(0, 5), at: new Date().toISOString() };
    console.log(`${r.id.padEnd(16)} diff=${score ? (score.diff * 100).toFixed(1) + '%' : 'n/a'}${errors.length ? '  errors: ' + errors[0].slice(0, 120) : ''}`);
  } catch (e) {
    results[r.id] = { ...r, diff: null, errors: [String(e).slice(0, 300), ...errors.slice(0, 3)], at: new Date().toISOString() };
    console.log(`${r.id.padEnd(16)} FAILED ${String(e).slice(0, 160)}`);
  }
  await ctx.close();
}
fs.writeFileSync(resultsFile, JSON.stringify(results, null, 1));
await browser.close();
