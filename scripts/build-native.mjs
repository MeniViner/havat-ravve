// The web bundle for the installed Android and iPhone apps: the team app from dist/, packed so it opens with no reception.
// Runs after `npm run build`. Capacitor copies .build/native into the chosen platform on `npx cap sync android` or `npx cap sync ios`.
import fs from 'node:fs/promises';

const out = '.build/native';
const html = await fs.readFile('dist/app.html', 'utf8').catch(() => { throw Error('Run npm run build first (dist/app.html is missing)'); });
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
for (const f of ['app.js', 'app.css', 'assets']) await fs.cp('dist/' + f, `${out}/${f}`, { recursive: true });
// The app is the start page. No web manifest or home-screen tags: this is already the installed app.
const page = html
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<meta name="(mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>/g, '');
if (page === html) throw Error('dist/app.html changed shape: update scripts/build-native.mjs');
await fs.writeFile(`${out}/index.html`, page);
const size = async (p) => { const s = await fs.stat(p); if (!s.isDirectory()) return s.size; let n = 0; for (const e of await fs.readdir(p)) n += await size(`${p}/${e}`); return n; };
console.log(`Built ${out} for Android and iPhone (${(await size(out) / 1e6).toFixed(1)} MB).`);
