// Site visits and app usage, counted by ourselves (no outside analytics, no Cloudflare token): the site and the app send
// a small beacon (POST /v1/hit, public, no sign-in), and each beacon adds to one document per Israel day,
// site_stats/<YYYY-MM-DD>, with Firestore increments (one write, no read). Only counters are kept: never an address,
// a cookie, an id, a name or the page's own text. Every name is checked against the lists below, so a stranger cannot
// grow the document with fields of their own, and a daily cap plus a rate limit keep the free 20,000 writes for the farm.
import type { Env, Firestore } from './firestore';
import { invalid } from './http';

const TZ = 'Asia/Jerusalem';
const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const hourOf = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d)) % 24;

/** Beacons a day before counting stops for that day (about 3,000 visits: far beyond the farm's busiest day). */
export const DAILY_CAP = 6000;
const MAX_BODY = 2048;

// What the site and the app may count. Anything else in a beacon is ignored.
const SITE_PAGES = ['home', 'archive'];
const SITE_SECTIONS = ['home', 'story', 'heritage', 'experiences', 'visit', 'events', 'contact'];
const SITE_CLICKS = ['app', 'waze', 'phone', 'whatsapp', 'email', 'calendar', 'archive', 'share', 'social', 'external', 'install', 'notify'];
const SOURCES = ['google', 'search', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'qr', 'direct', 'other'];
const DEVICES = ['mobile', 'desktop', 'installed'];
const DEPTHS = ['d25', 'd50', 'd75', 'd100'];
const TIMES = ['t10', 't60', 't180', 'tlong'];
const APP_SCREENS = [
  'home', 'day', 'tasks', 'shopping', 'people', 'places', 'projects', 'farm', 'event', 'events', 'manage', 'me', 'new',
  'notifications', 'search', 'vendor', 'welcome', 'install', 'offline', 'visit', 'donate', 'contact', 'login', 'more',
  'calendar', 'order', 'terms', 'other',
];
const ROLES = ['owner', 'manager', 'staff', 'vendor', 'guest', 'signedout'];

type Body = Record<string, unknown>;
const pick = (v: unknown, list: string[]) => (typeof v === 'string' && list.includes(v) ? v : null);
/** A list of names from the beacon, each allowed one, at most `max` of them. */
const names = (v: unknown, list: string[], max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && list.includes(x)))].slice(0, max) : []);
/** {name: count} from the beacon (the app's screens): allowed names, whole counts 1..50. */
function counts(v: unknown, list: string[]): [string, number][] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>).filter(([k, n]) => list.includes(k) && Number.isInteger(n) && (n as number) > 0).slice(0, 30).map(([k, n]) => [k, Math.min(50, n as number)]);
}

/** The increments one beacon makes: field path → amount. Exported for the tests. */
export function hitFields(b: Body, now = new Date()): Record<string, number> {
  const f: Record<string, number> = { hits: 1 };
  const add = (k: string, n = 1) => { f[k] = (f[k] || 0) + n; };
  const app = b.app === true;
  const p = app ? 'app' : 'site';
  if (b.t === 'view') {
    if (app) add('app.opens');
    else { add('site.views'); add(`site.page.${pick(b.page, SITE_PAGES) || 'home'}`); }
    add(`${p}.hour.h${String(hourOf(now)).padStart(2, '0')}`);
    const dev = pick(b.device, DEVICES); if (dev) add(`${p}.device.${dev}`);
    if (b.newToday === true) add(`${p}.visitors`);
    if (b.newToday === true && b.returning === true) add(`${p}.returning`);
    if (!app) { const src = pick(b.source, SOURCES); if (src) add(`site.source.${src}`); }
    if (app) { const role = pick(b.role, ROLES); if (role && b.newToday === true) add(`app.role.${role}`); }
  } else if (b.t === 'leave') {
    if (app) for (const [s, n] of counts(b.screens, APP_SCREENS)) add(`app.screen.${s}`, n);
    else {
      for (const s of names(b.sections, SITE_SECTIONS, SITE_SECTIONS.length)) add(`site.section.${s}`);
      for (const c of names(b.clicks, SITE_CLICKS, SITE_CLICKS.length)) add(`site.click.${c}`);
      const d = pick(b.depth, DEPTHS); if (d) add(`site.depth.${d}`);
      const t = pick(b.time, TIMES); if (t) add(`site.time.${t}`);
    }
  } else throw invalid('t', '"view" or "leave"');
  return f;
}

// the day this isolate saw go over the cap: no more writes for it (each isolate learns after at most one write)
let cappedDay = '';

/** POST /v1/hit: answers 204 whatever happens, so a beacon never shows an error in someone's browser. */
export async function handleHit(req: Request, env: Env, fs: () => Firestore): Promise<Response> {
  const done = new Response(null, { status: 204, headers: hitCors(req) });
  if (req.method === 'OPTIONS') return done;
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: hitCors(req) });
  if (!allowedOrigin(req.headers.get('origin'), env)) return done;
  const now = new Date();
  const day = dayOf(now);
  if (cappedDay === day) return done;
  if (env.HIT_LIMITER && !(await env.HIT_LIMITER.limit({ key: 'all' })).success) return done;
  let b: Body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return done;
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return done;
    b = v as Body;
  } catch { return done; }
  let fields: Record<string, number>;
  try { fields = hitFields(b, now); } catch { return done; }
  try {
    const f = fs();
    const r = (await f.commit([{
      update: { name: f.name('site_stats', day), fields: {} },
      updateMask: { fieldPaths: [] },
      updateTransforms: Object.entries(fields).map(([fieldPath, n]) => ({ fieldPath, increment: { integerValue: String(n) } })),
    }])) as { writeResults?: { transformResults?: { integerValue?: string }[] }[] };
    // the first transform is "hits": its new value is the day's total so far, read back for free
    const total = Number(r.writeResults?.[0]?.transformResults?.[0]?.integerValue || 0);
    if (total >= DAILY_CAP) cappedDay = day;
  } catch { /* a lost count is fine */ }
  return done;
}

/** Only the farm's own pages count (and local testing): a beacon from anywhere else is dropped without a write. */
function allowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return !!env.FIRESTORE_EMULATOR_HOST;
  // production only: the preview channels CI opens for every pull request must not add to the farm's numbers
  if (/^https:\/\/havat-ravve\.(web\.app|firebaseapp\.com)$/.test(origin)) return true;
  return !!env.FIRESTORE_EMULATOR_HOST && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin);
}
function hitCors(req: Request): Record<string, string> {
  const o = req.headers.get('origin');
  return o ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' } : {};
}

// ---------- the console's view ----------

type Counts = Record<string, number>;
const sub = (d: Record<string, unknown>, k: string): Counts => {
  const v = d[k];
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === 'number')) as Counts;
};
const sum = (into: Counts, from: Counts) => { for (const [k, n] of Object.entries(from)) into[k] = (into[k] || 0) + n; return into; };
const n = (v: unknown) => (typeof v === 'number' ? v : 0);
const ranked = (c: Counts, order: string[]) => order.map((key) => ({ key, count: c[key] || 0 })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);

/** GET /v1/console/traffic?days=30: the site and the app over a period, day by day and in total. One read per day. */
export async function trafficStats(fs: Firestore, daysIn: number) {
  if (![7, 30, 90].includes(daysIn)) throw invalid('days', '7, 30 or 90');
  const now = new Date();
  const ids: string[] = [];
  for (let i = daysIn - 1; i >= 0; i--) ids.push(dayOf(new Date(now.getTime() - i * 86400_000)));
  const docs = new Map((await fs.getMany('site_stats', ids)).map((d) => [d.id, d.data]));
  const site = { page: {} as Counts, section: {} as Counts, click: {} as Counts, source: {} as Counts, device: {} as Counts, depth: {} as Counts, time: {} as Counts, hour: {} as Counts };
  const app = { screen: {} as Counts, device: {} as Counts, role: {} as Counts, hour: {} as Counts };
  const tot = { views: 0, visitors: 0, returning: 0, opens: 0, users: 0, appReturning: 0, hits: 0 };
  const days = ids.map((day) => {
    const d = docs.get(day) || {};
    const s = (d.site || {}) as Record<string, unknown>, a = (d.app || {}) as Record<string, unknown>;
    for (const k of Object.keys(site) as (keyof typeof site)[]) sum(site[k], sub(s, k));
    for (const k of Object.keys(app) as (keyof typeof app)[]) sum(app[k], sub(a, k));
    const row = { day, views: n(s.views), visitors: n(s.visitors), opens: n(a.opens), users: n(a.visitors) };
    tot.views += row.views; tot.visitors += row.visitors; tot.returning += n(s.returning);
    tot.opens += row.opens; tot.users += row.users; tot.appReturning += n(a.returning); tot.hits += n(d.hits);
    return row;
  });
  const hours = (c: Counts) => Array.from({ length: 24 }, (_, h) => c['h' + String(h).padStart(2, '0')] || 0);
  const today = days[days.length - 1];
  return {
    days: daysIn,
    from: ids[0],
    today: { ...today, capped: n((docs.get(today.day) || {}).hits) >= DAILY_CAP },
    cap: DAILY_CAP,
    totals: tot,
    perDay: days,
    site: {
      pages: ranked(site.page, SITE_PAGES), sections: ranked(site.section, SITE_SECTIONS), clicks: ranked(site.click, SITE_CLICKS),
      sources: ranked(site.source, SOURCES), devices: ranked(site.device, DEVICES), depth: DEPTHS.map((key) => ({ key, count: site.depth[key] || 0 })),
      time: TIMES.map((key) => ({ key, count: site.time[key] || 0 })), hours: hours(site.hour),
    },
    app: { screens: ranked(app.screen, APP_SCREENS), devices: ranked(app.device, DEVICES), roles: ranked(app.role, ROLES), hours: hours(app.hour) },
  };
}
