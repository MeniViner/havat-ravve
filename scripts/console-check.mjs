// The owners' console against its designs: opens each screen of /admin?demo at 1440x900 (2x), and lays it beside the
// design's picture. node scripts/console-check.mjs [K1 K8 ...] [--out <folder>] [--width 1280] [--height 900] [--shot]
// Needs the dev server (CONSOLE_URL, default http://localhost:5193) and the design package in havat-raveh-console/ (not in git).
// Reports, per screen: how much of the picture differs, page errors, and any request that left the page's own files.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CONSOLE_URL || 'http://localhost:5193';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const out = opt('--out', 'docs/console-desktop-check');
const width = Number(opt('--width', 1440)), height = Number(opt('--height', 900));
const shotOnly = args.includes('--shot') || width !== 1440;
/** Where each design is: its address, and what to do there before the picture. */
export const SCREENS = {
  K1: { file: 'K1-ConsoleStatus', at: 'overview' }, K2: { file: 'K2-Monitor', at: 'monitor' }, K3: { file: 'K3-Speed', at: 'speed' },
  K4: { file: 'K4-Stats', at: 'stats' }, K5: { file: 'K5-Traffic', at: 'traffic' }, K6: { file: 'K6-Money', at: 'money' },
  K7: { file: 'K7-Data', at: 'data' }, K8: { file: 'K8-People', at: 'people/d-matan' }, K9: { file: 'K9-Import', at: 'import', do: async (p) => { await p.getByText('שורות לדוגמה').click(); if (width >= 1024) await p.getByRole('button', { name: 'המשך' }).click(); } }, K10: { file: 'K10-Backups', at: 'backups' },
  K11: { file: 'K11-Queue', at: 'queue' }, K12: { file: 'K12-Jobs', at: 'jobs' }, K13: { file: 'K13-Switches', at: 'switches' },
  K14: { file: 'K14-Keys', at: 'keys/cred-beni' }, K15: { file: 'K15-Run', at: 'run/tasks.create', do: async (page) => {
    page.setDefaultTimeout(8000);
    const field = (label) => page.getByLabel(label, { exact: true });
    await field('מה צריך לעשות · חובה').fill('לבדוק את הטפטפות בחממה');
    await field('על מי').fill('יואב פרץ');
    await field('מקום').fill('חממה');
    await page.getByRole('button', { name: 'הרצה', exact: true }).click();
    await page.getByRole('button', { name: 'כן, להריץ' }).click();
    await page.getByText('להציג את התשובה המלאה').waitFor();
    await page.evaluate(() => document.activeElement?.blur());
  } }, K16: { file: 'K16-Security', at: 'security' },
};
const want = args.filter((a) => /^K\d+$/.test(a));
const list = want.length ? want : Object.keys(SCREENS);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
let bad = 0;
for (const k of list) {
  const s = SCREENS[k];
  const page = await ctx.newPage();
  const errors = [], outside = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { const u = new URL(r.url()); if (!r.url().startsWith(BASE) && !['data:', 'blob:'].includes(u.protocol)) outside.push(r.url()); });
  await page.goto(`${BASE}/admin?demo#/${s.at}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  // a design that is a moment in the middle of work (the mapped table, the run result) is reached by doing the work
  let stuck = '';
  if (s.do) { try { await s.do(page); } catch (e) { if (width >= 1024) throw e; stuck = '  (the phone has its own steps: not done)'; } await page.waitForTimeout(500); }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // text cut inside the page: a cell or a line wider than its box, or a number broken over lines
  const cut = await page.evaluate(() => [...document.querySelectorAll('.d-body *')].filter((e) => {
    if (e.children.length || !e.textContent.trim() || !e.getClientRects().length) return false;
    const c = getComputedStyle(e);
    if (c.overflowX === 'hidden' && e.clientWidth > 2 && e.scrollWidth > e.clientWidth + 1 && !e.title && !e.closest('[title]')) return true;
    return /^[\d.:/]+$/.test(e.textContent.trim()) && (() => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1; })();
  }).map((e) => e.textContent.trim().slice(0, 30)).slice(0, 4));
  const raw = path.join(out, shotOnly ? `${k}-${width}.png` : `${k}.png`);
  await page.screenshot({ path: raw, scale: 'device' });
  let diff = '';
  if (!shotOnly) {
    const design = `havat-raveh-console/design/png/${s.file}.png`;
    const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const pair = await ctx.newPage();
    await pair.setViewportSize({ width: 2160, height: 720 });
    await pair.setContent(`<!doctype html><body style="margin:0;display:flex;align-items:flex-start;gap:12px;background:#888"><img id="a" style="width:1074px" src="${uri(design)}"><img id="b" style="width:1074px" src="${uri(raw)}"></body>`);
    await pair.waitForTimeout(150);
    const pct = await pair.evaluate(() => {
      const px = (id) => { const c = document.createElement('canvas'); c.width = 720; c.height = 450; const x = c.getContext('2d'); x.drawImage(document.getElementById(id), 0, 0, 720, 450); return x.getImageData(0, 0, 720, 450).data; };
      const a = px('a'), b = px('b'); let n = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) n++;
      return (n / (a.length / 4)) * 100;
    });
    diff = `  differs ${pct.toFixed(2)}%`;
    await pair.screenshot({ path: path.join(out, `${k}-pair.jpg`), type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 2160, height: 672 } });
    await pair.close();
    fs.rmSync(raw);
  }
  if (errors.length || outside.length || overflow > 0) bad++;
  console.log(`${k} ${s.at}${diff}${stuck}${cut.length ? '  CUT ' + cut.join(' | ') : ''}${overflow > 0 ? `  OVERFLOW ${overflow}px` : ''}${errors.length ? '  ERRORS ' + errors.join(' | ').slice(0, 300) : ''}${outside.length ? '  REQUESTS ' + outside.slice(0, 3).join(' ') : ''}`);
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
