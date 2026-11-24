// Clicks every control of the screen that is open, one by one, and says which did nothing and what went wrong (used by the
// demo and by the walk against today's Worker). Questions and windows are opened and closed, never confirmed.
const SKIP = /^(יציאה|התנתקות|לאפליקציה|לעריכת האתר)$/;
export async function clickAll(s, { tab, sleep, trouble, max = 45 }) {
  const { page } = s; const dead = [], bad = []; let clicked = 0;
  const controls = async () => page.evaluate(() => [...document.querySelectorAll('.d-main button, .d-main [role=switch], .d-main summary, .d-main tr[data-row]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.disabled; }).map((e, i) => ({ i, tag: e.tagName, name: (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60), on: e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-checked') === 'true' && e.getAttribute('role') === 'radio' || e.getAttribute('aria-current') === 'true' || e.getAttribute('aria-selected') === 'true' || e.matches('.is-on') })));
  const first = await controls(); const seen = new Map(); const todo = [];
  for (const c of first) { const n = seen.get(c.tag + c.name) || 0; seen.set(c.tag + c.name, n + 1); const rows = todo.filter((t) => t.tag === 'TR').length; if (n < 2 && !(c.tag === 'TR' && rows >= 3) && !SKIP.test(c.name)) todo.push({ ...c, nth: n }); }
  const pop = []; s.ctx.on('page', (p) => { pop.push(p.url()); p.close().catch(() => {}); });
  let dl = 0; page.on('download', () => dl++);
  for (const c of todo.slice(0, max)) {
    const at = `#/${tab}`;
    if (!page.url().includes(at)) { await s.go(tab); }
    const handle = await page.evaluateHandle(([tag, name, nth]) => [...document.querySelectorAll('.d-main button, .d-main [role=switch], .d-main summary, .d-main tr[data-row]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.disabled && e.tagName === tag && (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) === name; })[nth], [c.tag, c.name, c.nth]);
    const el = handle.asElement(); if (!el) continue;
    const snap = () => page.evaluate(() => document.body.innerHTML.length + '|' + location.hash + '|' + document.body.innerText.length + '|' + [...document.querySelectorAll('[aria-pressed=true],[aria-checked=true],details[open],[aria-selected=true]')].length + '|' + (document.activeElement?.tagName || '') + document.body.innerHTML.replace(/\d/g, '').slice(-400));
    const before = await snap(); const reqs = s.reqs.length, d0 = dl, p0 = pop.length;
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    try { await el.click({ timeout: 2500 }); } catch (e) { bad.push(`${c.name}: cannot be clicked (${String(e).split('\n').find((l) => /intercepts|not visible|outside/.test(l)) || 'timeout'})`.slice(0, 160)); continue; }
    clicked++;
    await sleep(350);
    for (let i = 0; i < 12 && (await page.locator('.d-skel').count()); i++) await sleep(200);
    const changed = (await snap()) !== before || (await page.evaluate(() => document.body.innerHTML)) !== bodyHtml || s.reqs.length > reqs || dl > d0 || pop.length > p0;
    if (!changed && !c.on && c.tag !== 'TR') dead.push(c.name);
    const t = await trouble(s); const dlgT = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((x) => x.innerText.replace(/\s+/g, ' ')).join(' ## ').slice(0, 3000));
    if (t.m || t.alerts.length || /undefined|\bNaN\b|\[object |Invalid Date|לא הצלחנו|לנסות שוב/.test(dlgT)) bad.push(`${c.name}: ${t.m || t.alerts.join(' / ') || dlgT.slice(0, 160)}`);
    const toast = await page.evaluate(() => [...document.querySelectorAll('[role=alert], .k-toast--alert')].filter((e) => !e.closest('.d-main')).map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 120)));
    if (toast.length) bad.push(`${c.name}: message "${toast.join(' / ')}"`);
    await s.closeAll();
    // leave a form or an editor
    const cancel = page.locator('.d-main .d-panel').getByRole('button', { name: 'ביטול', exact: true }); if (tab === 'data' && await cancel.count()) await cancel.first().click().catch(() => {});
  }
  return { clicked, dead: [...new Set(dead)], bad: [...new Set(bad)], popups: pop, downloads: dl };
}
