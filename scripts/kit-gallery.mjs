// Visual QA for the v2 kit (src/app/v2/kit).
// Bundles <Gallery/> and the screen compositions with esbuild into a temp dir, serves it (with /assets from public/),
// screenshots each view with Playwright at 390x844 @2x, and writes side-by-side sheets against design PNGs.
//
//   node scripts/kit-gallery.mjs [outDir] [--design <design dir>]
//
// outDir defaults to $TMPDIR/kit-gallery. The design dir holds png/<id>.png (havat-raveh-redesign/design).
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const di = args.indexOf('--design');
const designDir = di >= 0 ? path.resolve(args[di + 1]) : null;
const outDir = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--design') ?? path.join(os.tmpdir(), 'kit-gallery'));
const site = path.join(outDir, 'site');
await fs.rm(site, { recursive: true, force: true });
await fs.mkdir(site, { recursive: true });

await build({
  stdin: {
    contents: `import { createRoot } from 'react-dom/client';
import { GalleryView } from './src/app/v2/kit/Gallery';
const view = location.hash.slice(1);
createRoot(document.getElementById('root')).render(<GalleryView view={view} />);`,
    resolveDir: root,
    loader: 'tsx',
    sourcefile: 'kit-gallery-entry.tsx',
  },
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  outfile: path.join(site, 'app.js'),
  external: ['/assets/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
await fs.writeFile(
  path.join(site, 'index.html'),
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>kit gallery</title><link rel="stylesheet" href="/app.css"><style>html,body{margin:0;background:#F3F4F2}</style></head>
<body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`,
);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = url.startsWith('/assets/') ? path.join(root, 'public', url) : url.startsWith('/design/') && designDir ? path.join(designDir, url.slice(8)) : path.join(site, url === '/' ? 'index.html' : url);
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shoot = async (view, file, fullPage = false) => {
  await page.goto(`${base}/#${view}`);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, file), fullPage });
};

await shoot('gallery', 'gallery.png', true);
// The same page in 1200px slices, easier to inspect.
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0, n = 0; y < total; y += 1200, n++) {
  await page.screenshot({ path: path.join(outDir, `gallery-${n}.png`), fullPage: true, clip: { x: 0, y, width: 390, height: Math.min(1200, total - y) } });
}
const views = { T1: 'T1-Root', T4: 'T4-Done', T5: 'T5-Add', T3: 'T3-Task', X1: 'X1-Refused', Z3: 'Z3-DemoSwitch', E2: 'E2-Scan', E3: 'E3-Ok', E4: 'E4-Pay', E5: 'E5-Bad' };
for (const [v, id] of Object.entries(views)) await shoot(v, `kit-${v}.png`);

// Fonts actually used by the gallery page.
await page.goto(`${base}/#gallery`);
await page.reload();
await page.evaluate(() => document.fonts.ready);
const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`));

if (designDir) {
  const cmp = await browser.newPage({ viewport: { width: 800, height: 844 }, deviceScaleFactor: 2 });
  for (const [v, id] of Object.entries(views)) {
    const kit = (await fs.readFile(path.join(outDir, `kit-${v}.png`))).toString('base64');
    await cmp.setContent(`<body style="margin:0;display:flex;gap:20px;background:#888">
      <img src="${base}/design/png/${id}.png" style="width:390px;height:844px">
      <img src="data:image/png;base64,${kit}" style="width:390px;height:844px"></body>`);
    await cmp.waitForLoadState('networkidle');
    await cmp.screenshot({ path: path.join(outDir, `cmp-${v}.png`) });
  }
}

await browser.close();
server.close();
console.log(`Wrote screenshots to ${outDir}`);
console.log(`Loaded fonts: ${[...new Set(fonts)].join(', ') || 'none'}`);
if (errors.length) {
  console.log('Page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
}
