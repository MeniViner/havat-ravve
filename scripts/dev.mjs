// Local preview of the team/guest app without Firebase emulators: esbuild watch + static server with the /app rewrite.
// Open http://localhost:5173/app?demo=owner to walk through the demo persona.
import { context } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const out = '.dev';
const port = Number(process.env.PORT) || 5173; // a second worktree can run next to the first: PORT=5183 node scripts/dev.mjs
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
fs.cpSync('public', out, { recursive: true });
const ctx = await context({ entryPoints: ['src/app-entry.tsx'], bundle: true, format: 'esm', outfile: `${out}/app.js`, jsx: 'automatic', external: ['/assets/*'], sourcemap: true, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'info' });
await ctx.watch();
const html = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#263a2c"><title>חוות רווה · צוות</title><link rel="icon" href="/assets/rava-logo.png"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.map': 'application/json', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(html); }
  if (url.pathname === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('// no service worker in dev'); }
  const file = path.join(out, url.pathname === '/' ? '/index.html' : url.pathname);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) { res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); return fs.createReadStream(file).pipe(res); }
  res.writeHead(404); res.end('not found');
}).listen(port, () => console.log(`dev: http://localhost:${port}/app?demo=owner`));
