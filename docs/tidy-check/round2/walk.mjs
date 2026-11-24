// Round-2 walk: every screen in demo per role, checked against RULES.md. Run from the worktree root:
//   node docs/tidy-check/round2/walk.mjs [role...] --base=http://localhost:5240 --out=docs/tidy-check/round2
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = opt('base', 'http://localhost:5240');
const OUT = opt('out', 'docs/tidy-check/round2');
const OLD = 'docs/tidy-check';
const only = args.filter((a) => !a.startsWith('--'));

const oldWalk = (role) => { try { return JSON.parse(fs.readFileSync(`${OLD}/${role}/_walk.json`, 'utf8')); } catch { return { results: [] }; } };
const parse = (s) => { const [route, scenario = 'regular'] = s.split('@'); return { route, scenario }; };
const fromOld = (role) => oldWalk(role).results.map((r) => ({ route: r.route, scenario: r.scenario }));

const TEAM_MGR_NEW = [
  '/manage/inbox?view=handled', '/manage/inbox/demo-n-contact', '/manage/vendors/table',
  '/manage/inbox/stall/demo-e-festival/demo-vr-raz-power@eventDay', '/manage/events/demo-e-festival/vendors/today/demo-vr-raz-power@eventDay',
  '/manage/inbox@eventDay', '/manage/donations@afterEvent', '/manage/reports/tasks?__returned',
].map(parse);
const ROLES = {
  owner: { persona: 'owner', routes: [...fromOld('owner'), ...TEAM_MGR_NEW, parse('/manage/settings/demo')] },
  manager: { persona: 'manager', routes: [...fromOld('manager'), ...TEAM_MGR_NEW, parse('/manage/settings/demo'), parse('/manage/settings/managers'), parse('/manage/instinct')] },
  staff: { persona: 'staff', routes: [...fromOld('staff'), parse('/install?first=1'), parse('/manage/inbox/demo-n-contact')] },
  vendor: { persona: 'vendor', routes: fromOld('vendor') },
  helper: { persona: 'helper', routes: ['/vendor', '/vendor/stall', '/vendor/events/demo-e-festival', '/notifications', '/me', '/me/edit', '/me/photo', '/install', '/terms', '/contact', '/tasks', '/vendor@eventDay', '/vendor/stall@eventDay', '/vendor@afterEvent'].map(parse) },
  guest: { persona: 'guest', routes: [...fromOld('guest'), parse('/me/visits/demo-vi-michal@eventDay'), parse('/me/donations/demo-d-michal@eventDay'), parse('/me/account@eventDay'), parse('/install?first=1')] },
  anon: { persona: 'anon', routes: fromOld('anon') },
};
// drop the placeholder used above
for (const r of Object.values(ROLES)) r.routes = r.routes.filter((x) => !x.route.includes('__returned'));

const slug = (route) => route.replace(/^\//, '').replace(/demo-/g, '').replace(/[?&=/]+/g, '-').replace(/-+$/, '') || 'home';
const browser = await chromium.launch();

const HIDE = '.k-demo{display:none!important}#root>.v2:not(.k-screen):has(>.k-demo){display:none!important}.v2:has(>.k-demo)+.k-screen{height:100dvh!important}';
const GROW = '.k-screen{height:auto!important;min-height:100dvh;overflow:visible!important}.k-screen__body{overflow:visible!important}';

async function check(page) {
  return page.evaluate(() => {
    const F = [];
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const txt = (el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    const inSheet = (el) => !!el.closest('.k-sheet,[role=dialog]');
    const ctrlSel = 'button,a[href],input:not([type=hidden]),select,textarea,[role=switch],[role=checkbox],[role=button]';
    // install strip / banner (decision 1)
    document.querySelectorAll('.k-strip,[class*=install-banner],[class*=installbanner]').forEach((el) => { if (vis(el) && !el.closest('.k-demo')) F.push({ rule: 'strip', what: `strip: "${txt(el).slice(0, 80)}"` }); });
    const body = document.body.innerText;
    const installWords = (body.match(/[^\n]*(להוסיף למסך הבית|התקנה|להתקין|התקינו)[^\n]*/g) || []).map((s) => s.trim().slice(0, 60));
    // top bar
    document.querySelectorAll('.k-topbar,.k-formheader').forEach((tb) => {
      if (inSheet(tb)) return;
      const end = tb.querySelector('.k-topbar__end');
      const ctrls = end ? [...end.querySelectorAll(ctrlSel)].filter(vis) : [];
      if (ctrls.length > 1) F.push({ rule: 'topbar-controls', what: `${ctrls.length} controls: ${ctrls.map(txt).join(' | ')}` });
      if (end && end.querySelector('.k-textlink')) F.push({ rule: 'backlink-loose', what: `text link in top bar: "${txt(end.querySelector('.k-textlink'))}"` });
    });
    // rows with more than one control
    document.querySelectorAll('.k-row').forEach((row) => {
      if (!vis(row) || inSheet(row)) return;
      const ctrls = [...row.querySelectorAll(ctrlSel)].filter((c) => vis(c) && !c.matches('.k-row__hit') && !c.parentElement.closest(ctrlSel));
      if (ctrls.length > 1) F.push({ rule: 'row-controls', what: `${ctrls.length} controls: "${txt(row).slice(0, 60)}" [${ctrls.map((c) => txt(c).slice(0, 12)).join(' | ')}]` });
    });
    // X / delete outside a sheet
    document.querySelectorAll('button,a,[role=button]').forEach((b) => {
      if (!vis(b) || inSheet(b)) return;
      const t = txt(b);
      const lab = b.getAttribute('aria-label') || '';
      if (/^(×|✕|x)$/i.test(b.innerText.trim()) || /^(סגירה|הסרה|להסיר|close|dismiss)/i.test(lab) && !b.closest('.k-topbar')) F.push({ rule: 'x-button', what: `X-like button: "${lab || t}"` });
      if (/^(מחיקה|למחוק|מחיקת|הסרה מ)/.test(t)) F.push({ rule: 'delete-outside', what: `delete control outside ⋯: "${t.slice(0, 40)}"` });
    });
    // red badges
    document.querySelectorAll('.k-nav__badge').forEach((b) => { if (!vis(b)) return; const item = b.closest('.k-nav__item'); const l = item ? txt(item) : ''; if (!/ניהול/.test(l)) F.push({ rule: 'badge', what: `nav badge on "${l}"` }); });
    document.querySelectorAll('.k-headbtn__badge').forEach((b) => { if (!vis(b)) return; const h = b.closest('button,a'); const l = h ? (h.getAttribute('aria-label') || txt(h)) : ''; if (!/התראות/.test(l)) F.push({ rule: 'badge', what: `head badge on "${l}"` }); });
    // Latin
    const latin = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; const p = n.parentElement;
      if (!p || !vis(p) || p.closest('.k-demo,script,style')) continue;
      for (const m of n.textContent.matchAll(/[A-Za-z][A-Za-z0-9.:/_-]*[A-Za-z0-9]/g)) { const w = m[0]; if (/@/.test(n.textContent) && /\.(com|co|il|org)/.test(n.textContent)) continue; latin.add(w); }
    }
    // one word per line on titles, tags, buttons, meta lines
    const owl = [];
    document.querySelectorAll('.k-row__title,.k-row__meta,.k-h1,.k-tag,button,.k-meta,.k-card__title,.manage-item__title,.manage-item__meta').forEach((el) => {
      if (!vis(el) || el.closest('.k-nav')) return;
      const words = (el.innerText || '').trim().split(/\s+/).filter(Boolean);
      if (words.length < 2) return;
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const rects = [];
      while (tw.nextNode()) { const rg = document.createRange(); rg.selectNodeContents(tw.currentNode); rects.push(...rg.getClientRects()); }
      const tops = new Set(rects.filter((r) => r.width > 1).map((r) => Math.round(r.top / 4)));
      if (tops.size >= 2 && tops.size >= words.length) owl.push(el.innerText.trim().slice(0, 40));
    });
    owl.forEach((t) => F.push({ rule: 'one-word-per-line', what: t }));
    const title = (document.querySelector('.k-h1,h1') || {}).innerText || '';
    const more = !!document.querySelector(':is(.k-topbar,.k-formheader) [aria-label="עוד פעולות"]');
    return { findings: F, latin: [...latin], installWords, title: title.replace(/\s+/g, ' ').trim().slice(0, 60), more, url: location.pathname.replace(/^\/app/, '') + location.search };
  });
}
const sheetItems = (page) => page.evaluate(() => [...document.querySelectorAll('.k-sheet .k-sheet__panel button, .k-sheet .k-sheet__panel a')].map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
const sheetOpen = (page) => page.evaluate(() => !!document.querySelector('.k-sheet .k-sheet__panel'));

async function shot(page, file) {
  await page.addStyleTag({ content: GROW });
  await page.waitForTimeout(80);
  await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 62 });
}

for (const [role, conf] of Object.entries(ROLES)) {
  if (only.length && !only.includes(role)) continue;
  const dir = path.join(OUT, role); fs.mkdirSync(dir, { recursive: true });
  const old = oldWalk(role);
  const results = [];
  let nn = 0;
  for (const r of conf.routes) {
    nn++;
    const id = String(nn).padStart(2, '0');
    const name = `${id}-${slug(r.route)}${r.scenario !== 'regular' ? '.' + r.scenario : ''}`;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
    await ctx.addInitScript(([persona, scenario]) => {
      if (sessionStorage.getItem('__w')) return; sessionStorage.setItem('__w', '1');
      localStorage.clear();
      localStorage.setItem('farm-demo', JSON.stringify({ on: true, persona, scenario }));
      localStorage.setItem('farm-demo-states', JSON.stringify({ offline: false, refuseNext: false, empty: false }));
    }, [conf.persona, r.scenario]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    const res = { nn: id, route: r.route, scenario: r.scenario, shots: [], findings: [], errors, notes: [] };
    try {
      await page.goto(`${BASE}/app${r.route}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.addStyleTag({ content: HIDE });
      const c = await check(page);
      Object.assign(res, { title: c.title, finalUrl: c.url, latin: c.latin, installWords: c.installWords });
      res.findings.push(...c.findings);
      await shot(page, path.join(dir, `${name}.jpg`)); res.shots.push(`${name}.jpg`);
      // reload-free: go back to viewport height for the interactions
      await page.addStyleTag({ content: '.k-screen{height:100dvh!important;overflow:hidden!important}.k-screen__body{overflow:auto!important}' });
      if (c.more) {
        await page.locator(':is(.k-topbar,.k-formheader) [aria-label="עוד פעולות"]').first().click();
        await page.waitForTimeout(450);
        res.moreItems = await sheetItems(page);
        await page.screenshot({ path: path.join(dir, `${name}-more.jpg`), type: 'jpeg', quality: 62 }); res.shots.push(`${name}-more.jpg`);
        const del = page.locator('.k-sheet .k-sheet__panel button').filter({ hasText: /^\s*(מחיקה|הסרה)/ }).first();
        if (await del.count()) {
          await del.click(); await page.waitForTimeout(450);
          const t = await page.evaluate(() => [...document.querySelectorAll('.k-sheet .k-sheet__panel')].map((p) => p.innerText.replace(/\s+/g, ' ')).join(' / '));
          res.deleteConfirm = t.slice(0, 200);
          if (!/ביטול/.test(t) || !/מחיקה|הסרה|למחוק|להסיר/.test(t)) res.findings.push({ rule: 'delete-confirm', what: `⋯ delete did not open Q8: ${t.slice(0, 80)}` });
        }
        await page.keyboard.press('Escape'); await page.waitForTimeout(250);
        if (await sheetOpen(page)) { await page.locator('.k-sheet__backdrop').first().click({ force: true }).catch(() => {}); await page.waitForTimeout(250); }
      }
      // first row that is a button
      const row = page.locator('.k-screen .k-row__hit, .k-screen button.k-row, .k-screen .manage-item__hit').first();
      if (await row.count() && await row.isVisible().catch(() => false)) {
        const before = page.url();
        await row.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (await sheetOpen(page)) {
          res.rowSheet = await sheetItems(page);
          await page.screenshot({ path: path.join(dir, `${name}-row.jpg`), type: 'jpeg', quality: 62 }); res.shots.push(`${name}-row.jpg`);
        } else if (page.url() !== before) res.rowNav = new URL(page.url()).pathname.replace(/^\/app/, '');
      }
    } catch (e) { res.errors.push(`walk: ${String(e).slice(0, 200)}`); }
    // compare with round 1's record of the same route and day
    const prev = old.results.find((o) => o.route === r.route && o.scenario === r.scenario);
    if (prev) {
      res.prevShot = prev.shots?.[0];
      const has = (list, x) => (list || []).some((y) => y === x || y.startsWith(x) || x.startsWith(y));
      const lost = (prev.moreItems || []).filter((x) => !has(res.moreItems, x));
      if (lost.length) res.findings.push({ rule: 'more-lost', what: `⋯ items gone since round 1: ${[...new Set(lost)].join(' | ')}` });
      const lostRow = (prev.rowSheet || []).filter((x) => !has(res.rowSheet, x));
      if (lostRow.length) res.findings.push({ rule: 'rowsheet-lost', what: `row-sheet items gone since round 1: ${[...new Set(lostRow)].join(' | ')}` });
      if (prev.finalUrl && res.finalUrl && prev.finalUrl !== res.finalUrl) res.notes.push(`finalUrl was ${prev.finalUrl}, now ${res.finalUrl}`);
      const prevRules = new Set((prev.findings || []).map((f) => f.what));
      res.newFindings = res.findings.filter((f) => !prevRules.has(f.what) && !f.rule.endsWith('-lost'));
    } else res.newFindings = res.findings;
    results.push(res);
    console.log(`${role} ${id} ${r.route}${r.scenario !== 'regular' ? ' @' + r.scenario : ''} -> ${res.finalUrl} · ${res.findings.length} findings (${(res.newFindings || []).length} new)${res.errors.length ? ' · ERR ' + res.errors.length : ''}`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(dir, '_walk.json'), JSON.stringify({ role, results }, null, 1));
}
await browser.close();
