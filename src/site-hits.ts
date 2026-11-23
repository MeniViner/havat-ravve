// The public site's visit counter (see hits.ts): one beacon when the page opens (which page, where the visitor came
// from, phone or computer), and one when it is left (which sections were seen, what was pressed, how far down, how long).
// Only names from a short list are sent, never a link's address or anything typed.
import { device, firstToday, hitsOn, sendHit } from './hits';

const SEARCH = /(^|\.)(bing|duckduckgo|yahoo|yandex|ecosia|baidu)\./;
/** Where the visit came from: a ?utm_source / ?src tag first (a QR sign says src=qr), else the referring site. */
function source(): string | null {
  const q = new URLSearchParams(location.search);
  const tag = (q.get('utm_source') || q.get('src') || '').toLowerCase();
  if (tag) return /^qr/.test(tag) ? 'qr' : /^(fb|facebook)/.test(tag) ? 'facebook' : /^(ig|instagram)/.test(tag) ? 'instagram' : /^(wa|whatsapp)/.test(tag) ? 'whatsapp' : /^google/.test(tag) ? 'google' : 'other';
  if (!document.referrer) return 'direct';
  let host = '';
  try { host = new URL(document.referrer).hostname.toLowerCase(); } catch { return 'other'; }
  if (host === location.hostname) return null; // moving inside the farm's own pages (back from the app): not a new source
  if (/(^|\.)google\./.test(host)) return 'google';
  if (SEARCH.test(host)) return 'search';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return 'facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return 'whatsapp';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  return 'other';
}

/** What a press on a link or button was, by its kind only (never the address itself). */
function clickKind(el: Element): string | null {
  if (el.matches('[data-calendar]')) return 'calendar';
  if (el.matches('.share-button')) return 'share';
  if (el.matches('#install-app')) return 'install';
  if (el.matches('#event-notifications')) return 'notify';
  const a = el.closest('a[href]') as HTMLAnchorElement | null;
  if (!a) return null;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('tel:')) return 'phone';
  if (href.startsWith('mailto:')) return 'email';
  let u: URL;
  try { u = new URL(a.href); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(host)) return 'whatsapp';
  if (/(^|\.)waze\.com$/.test(host)) return 'waze';
  if (/(^|\.)(instagram|facebook|tiktok|youtube)\.com$/.test(host)) return 'social';
  if (host === location.hostname || /^havat-ravve\.(web\.app|firebaseapp\.com)$/.test(host)) {
    if (u.pathname === '/app' || u.pathname.startsWith('/app/')) return 'app';
    if (u.pathname.startsWith('/events/archive')) return 'archive';
    return null; // a section of this page, or the home page
  }
  return /^https?:$/.test(u.protocol) ? 'external' : null;
}

const seen = new Set<string>();
let sectionWatch: IntersectionObserver | null = null;
/** After every render of the page (site-entry.ts replaces the body): watch its sections again. */
export function watchSections() {
  if (!hitsOn() || !('IntersectionObserver' in window)) return;
  sectionWatch?.disconnect();
  sectionWatch = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting && e.target.id) seen.add(e.target.id);
  }, { threshold: 0.3 });
  document.querySelectorAll('main section[id], #contact').forEach((s) => sectionWatch!.observe(s));
}

let started = false;
/** Once per page load, from site-entry.ts. */
export function startSiteHits() {
  if (started || !hitsOn()) return;
  started = true;
  const archive = location.pathname.startsWith('/events/archive');
  sendHit({ t: 'view', page: archive ? 'archive' : 'home', source: source(), device: device(), ...firstToday('site') });

  const clicks = new Set<string>();
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('a, button');
    const k = el && clickKind(el);
    if (k) clicks.add(k);
  }, { capture: true, passive: true });

  let deepest = 0, ticking = false;
  const measure = () => {
    const range = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    deepest = Math.max(deepest, Math.min(1, (scrollY + 1) / range));
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(measure); } }, { passive: true });

  const opened = performance.now();
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    measure(); // a quick scroll just before leaving still counts
    const s = (performance.now() - opened) / 1000;
    sendHit({
      t: 'leave', sections: [...seen], clicks: [...clicks],
      depth: deepest >= 0.95 ? 'd100' : deepest >= 0.75 ? 'd75' : deepest >= 0.5 ? 'd50' : 'd25',
      time: s < 10 ? 't10' : s < 60 ? 't60' : s < 180 ? 't180' : 'tlong',
    });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  addEventListener('pagehide', leave);
}
