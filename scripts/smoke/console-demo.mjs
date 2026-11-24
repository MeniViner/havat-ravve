// The demo (?demo) with the real bundle: all sixteen screens and every control, and not one request but the page's own files.
import { clickAll } from './console-click.mjs';
export async function demoWalk(x) {
  const { check, step, sleep, session, trouble, SCREENS, site, setPart, requests } = x;
  setPart('demo');
  for (const who of ['?demo', '?demo=owner']) {
    const s = await session({ site: site.base, url: '/admin' + who });
    await step('opens ' + who, async () => { await s.idle(); check(await s.page.locator('.d-nav__item').count() === 16, 'sixteen screens in the sidebar', await s.page.locator('.d-nav__item').count()); }, s);
    for (const [tab, title] of SCREENS) await step(`demo ${tab}`, async () => {
      await s.page.locator(`.d-nav__item[href="#/${tab}"]`).click(); await s.idle(); await s.leave(); await s.page.locator('.d-head__title', { hasText: title }).waitFor();
      const t = await trouble(s); check(!t.m && !t.alerts.length, `${tab}: loaded, no error text`, t);
      if (who === '?demo') { const r = await clickAll(s, { tab, sleep, trouble }); check(!r.dead.length, `${tab}: every control does something (${r.clicked} clicked)`, r.dead); check(!r.bad.length, `${tab}: nothing breaks when clicked`, r.bad); if (r.popups.length) console.log('  popups', tab, r.popups); }
    }, s);
    await step('requests ' + who, async () => {
      const list = s.reqs.filter((r) => !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
      const other = list.filter((r) => { const u = new URL(r.url); return u.origin !== site.base || r.method !== 'GET' || !/^\/(admin|real\/|console|favicon|fonts|assets|.*\.(js|css|woff2?|png|svg|jpe?g|webp|ico|webmanifest))/.test(u.pathname); });
      check(!other.length, `every one of the ${list.length} requests was the page's own static files`, other.slice(0, 5).map((r) => r.method + ' ' + r.url));
      check(!list.some((r) => /firestore|identitytoolkit|securetoken|googleapis|workers\.dev|\/v1\//.test(r.url)), 'nothing to firestore, identitytoolkit or the Worker');
      requests['demo' + who] = { all: { worker: [...new Set(list.map((r) => new URL(r.url).pathname))], firestore: 0 } };
    });
    await s.ctx.close();
  }
}
