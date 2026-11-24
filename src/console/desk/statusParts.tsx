// What the three מצב screens (מצב כללי, ניטור, מהירות) share: the checks by name, the free quota's meters, and the
// words for a time, an action in the log and what waits for the owner. No requests here: everything comes from what the
// screens already loaded.
import type { ReactNode } from 'react';
import { ddmm, dayTime, hhmm, DAY_LETTERS, daysFromToday } from '../../app/v2/format';
import { nowMs, todayKey } from '../../app/clock';
import { size } from '../labels';
import { fmt, many } from '../shared';
import type { Health, HealthState, LogEntry, Monitor, MonitorEvent, Overview, Queue } from '../source';
import { Btn, Ltr, Meter, Meters, Mono, Skeleton, type DotTone } from './desk';
import { toTab } from './route';

/** 0.4 שנ׳; under a tenth of a second, said so. */
export const sec = (ms: number) => (ms < 100 ? 'פחות מ־0.1 שנ׳' : `${(ms / 1000).toFixed(1)} שנ׳`);
export const DOT: Record<HealthState, DotTone> = { ok: 'ok', warn: 'warn', bad: 'bad', unknown: 'unknown' };
export const STATE: Record<HealthState, string> = { ok: 'תקין', warn: 'לשים לב', bad: 'לטפל', unknown: 'לא ידוע' };
/** The morning check's lines by their id, short enough for a table (the server's own names mention its providers). */
const CHECK: Record<string, string> = { site: 'האתר', backup: 'גיבוי הלילה', failures: 'תקלות שרת', email: 'מיילים שנכשלו', push: 'התראות לטלפון', keys: 'מפתחות API', quota: 'המכסה החינמית', storage: 'אחסון קבצים', cron: 'משימות מתוזמנות', switches: 'מתגים' };
export const checkName = (i: { id: string; he?: string }) => CHECK[i.id] || i.he || 'בדיקה נוספת';

/** The names of the keys about to expire, from the check's own line ("א, ב: התוקף נגמר השבוע"). */
function expiring(i: { detail: string } | undefined) {
  const m = i && /^(.+): (.+)$/.exec(i.detail);
  return m ? { names: m[1].split(', '), when: m[2] } : null;
}
/** A check's detail, as short as its line in a list. */
export function checkDetail(i: Health['items'][number], cronAt: string | null, agoText: (iso: string) => string): string {
  if (i.id === 'keys' && i.state === 'warn') { const e = expiring(i); if (e) return e.names.length === 1 ? 'אחד פג השבוע' : `${fmt(e.names.length)} פגים השבוע`; }
  if (i.id === 'cron' && i.state === 'ok' && cronAt) return `רצו ${agoText(cronAt)}`;
  // a number and its unit stay on one line
  return i.detail.replace(/(\d) (KB|MB|GB)/g, '$1\u00a0$2');
}

/** "רצה ב־07:00 · הבאה מחר" */
export function healthWhen(h: Health): string {
  const today = h.date === todayKey();
  const at = daysFromToday(h.at) === 0 ? `ב־${hhmm(h.at)}` : dayTime(h.at);
  return `רצה ${at}${h.by !== 'cron' ? ` · ${h.by}` : ''} · הבאה ${today ? 'מחר' : 'ב־07:00'}`;
}
/** "אתמול ב־16:42", "ב־12.11" */
export const dayAt = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? `היום ב־${hhmm(iso)}` : d === -1 ? `אתמול ב־${hhmm(iso)}` : `ב־${ddmm(iso)}`; };
/** "היום 04:53", "ה׳ 20.11 03:00" */
const letter = (v: string) => DAY_LETTERS[new Date((/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(v))) + 'T12:00:00Z').getUTCDay()];
export const eventWhen = (iso: string) => (daysFromToday(iso) === 0 ? `היום ${hhmm(iso)}` : `${letter(iso)} ${ddmm(iso)} ${hhmm(iso)}`);
/** A column of the week: "ג׳ 17", "היום". */
export const weekDay = (date: string) => (date === todayKey() ? 'היום' : `${letter(date)} ${+date.slice(8)}`);

const minutesText = (n: number) => (n < 1 ? 'רגעי' : n === 1 ? 'דקה' : n < 60 ? `${n} דקות` : n < 90 ? 'שעה' : n < 150 ? 'שעתיים' : n < 2880 ? `${Math.round(n / 60)} שעות` : `${Math.round(n / 1440)} ימים`);
export const eventLong = (e: MonitorEvent) => (e.until === 'morning' ? 'עד הבוקר' : e.minutes !== null ? minutesText(e.minutes) : e.kind === 'site' ? 'עדיין לא חזר' : 'רגעי');
/** What went wrong lately: the server's own list, or (an older server) only when the site was down, without who was told. */
export function eventsOf(m: Monitor): { items: MonitorEvent[]; told: boolean } {
  if (m.events) return { items: m.events, told: true };
  const items = [...m.site.incidents].reverse().map((i): MonitorEvent => ({ at: i.from, kind: 'site', he: 'האתר לא ענה', minutes: i.to ? mins(i.from, i.to) : null, alerted: false }));
  return { items, told: false };
}
const mins = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
/** The site's last outage in the strip's 24 hours, in a line. */
export function outage(m: Monitor): string {
  const i = m.site.incidents[m.site.incidents.length - 1];
  if (m.site.downSince) return `לא עונה מאז ${hhmm(m.site.downSince)}`;
  if (!i?.to || nowMs() - Date.parse(i.from) > 86400_000) return '';
  return `נפל ב־${hhmm(i.from)}, חזר אחרי ${minutesText(mins(i.from, i.to))}`;
}
/** The site's usual answer time, when the server does not say its own. */
export function siteTypical(m: Monitor | null): number | null {
  const s = (m?.site.checks || []).filter((c) => c.ok).map((c) => c.ms).sort((a, b) => a - b);
  return s.length ? s[Math.ceil(s.length / 2) - 1] : null;
}

/* ───────── what waits for the owner ───────── */
export type Wait = { id: string; tone: 'red' | 'amber'; title: string; text: string; link: string; href: string };
const REASON: Record<string, string> = {
  expired: 'לא ברור אם נשלח', invalid_address: 'הכתובת לא תקינה', no_address: 'אין כתובת מייל', rate_limited: 'יותר מדי מיילים בבת אחת',
  quota: 'נגמרה המכסה היומית של שירות המייל', auth: 'בעיה במפתח של שירות המייל', unavailable: 'שירות המייל לא זמין',
};
/** The switches that change what people can do. */
const LOUD = [['maintenance', 'מצב תחזוקה'], ['readOnly', 'קריאה בלבד'], ['keysStopped', 'מפתחות ה־API עצורים'], ['registrationClosed', 'ההרשמה סגורה']] as const;
const FIX: Record<string, [string, string]> = { backup: ['backups', 'לגיבויים'], push: ['queue', 'לתור השליחה'], email: ['queue', 'לתור השליחה'], switches: ['switches', 'למתגים'], keys: ['keys', 'למפתחות'], cron: ['jobs', 'למשימות המתוזמנות'], failures: ['speed', 'למהירות'] };
export const cronLate = (at: string | null | undefined) => !at || nowMs() - Date.parse(at) > 15 * 60_000;

/** The attention cards: worst first, each with the screen that fixes it. Nothing here asks the server. */
export function waiting(o: Overview | null, m: Monitor | null, q: Queue | null, agoText: (iso: string) => string): Wait[] {
  const out: Wait[] = [];
  const h = m?.health;
  const s = q?.switches;
  if (m?.site.downSince) out.push({ id: 'site', tone: 'red', title: 'האתר לא עונה', text: `מאז ${hhmm(m.site.downSince)} · נבדק שוב כל רבע שעה`, link: 'לניטור', href: toTab('monitor') });
  if (o && o.server.status !== 'ok') out.push({ id: 'server', tone: 'red', title: 'השרת לא עונה כמו שצריך', text: 'כדאי לבדוק מה נכשל בבדיקה האחרונה', link: 'לניטור', href: toTab('monitor') });
  if (o && cronLate(o.crons?.at)) out.push({ id: 'cron', tone: 'red', title: 'המשימות המתוזמנות מאחרות', text: o.crons ? `רצו ${agoText(o.crons.at)}, ואמורות לרוץ כל 5 דקות` : 'עוד לא נרשמה ריצה', link: 'למשימות המתוזמנות', href: toTab('jobs') });
  const failed = o?.queues.email.failed || 0;
  if (failed) {
    const rows = (q?.emails || []).filter((e) => e.status === 'failed');
    const names = rows.map((e) => e.who || 'אורח');
    const who = names.length > 2 ? `ל${names[0]}, ל${names[1]} ועוד ${fmt(names.length - 2)}` : names.map((x) => 'ל' + x).join(' ו');
    const why = rows[0] && (REASON[rows[0].reason] || 'לא נשלח');
    out.push({ id: 'email', tone: 'red', title: failed === 1 ? 'מייל אחד לא נשלח' : `${fmt(failed)} מיילים לא נשלחו`, text: rows.length ? `אישור תשלום ${who} · ${why}` : 'אישורי תשלום שלא הגיעו לאורחים', link: 'לתור השליחה', href: toTab('queue') });
  }
  const loud = s ? LOUD.filter(([k]) => s[k]).map(([, he]) => he) : [];
  if (loud.length) out.push({ id: 'loud', tone: 'red', title: loud.length === 1 ? `דלוק עכשיו: ${loud[0]}` : `${fmt(loud.length)} מתגי חירום דלוקים`, text: loud.length === 1 ? 'זה משנה את מה שאנשים יכולים לעשות באפליקציה' : loud.join(' · '), link: 'למתגים', href: toTab('switches') });
  for (const i of h?.items || []) {
    if (i.state !== 'warn' && i.state !== 'bad') continue;
    if ((i.id === 'site' && m?.site.downSince) || (i.id === 'email' && (failed || o)) || (i.id === 'cron' && o) || (i.id === 'switches' && loud.length)) continue;
    const e = i.id === 'keys' ? expiring(i) : null;
    const [tab, link] = FIX[i.id] || ['monitor', 'לניטור'];
    out.push({
      id: 'h-' + i.id, tone: i.state === 'bad' ? 'red' : 'amber', link, href: e?.names.length === 1 ? toTab(tab, e.names[0]) : toTab(tab),
      title: e ? (e.names.length === 1 ? 'מפתח API עומד לפוג' : `${fmt(e.names.length)} מפתחות API עומדים לפוג`) : `${checkName(i)}: ${STATE[i.state]}`,
      text: e ? `${e.names.map((n) => `"${n}"`).join(', ')} · ${e.when}` : i.detail,
    });
  }
  return [...out.filter((w) => w.tone === 'red'), ...out.filter((w) => w.tone === 'amber')];
}
export const waitingText = (n: number) => (n === 0 ? 'הכול תקין, אין דבר שמחכה לך' : n === 1 ? 'דבר אחד מחכה לך למטה' : n === 2 ? 'שני דברים מחכים לך למטה' : `${fmt(n)} דברים מחכים לך למטה`);

/* ───────── an action of the log, as a sentence ───────── */
/** The operation's Hebrew name starts with a noun of doing: its past, and the infinitive for what did not work. */
const DID: Record<string, [string, string]> = {
  'יצירת': ['יצר', 'ליצור'], 'הוספת': ['הוסיף', 'להוסיף'], 'הוספה': ['הוסיף', 'להוסיף'], 'סימון': ['סימן', 'לסמן'], 'שיוך': ['שייך', 'לשייך'], 'שיבוץ': ['שיבץ', 'לשבץ'], 'החזרת': ['החזיר', 'להחזיר'], 'החלפת': ['החליף', 'להחליף'],
  'שליחת': ['שלח', 'לשלוח'], 'עריכת': ['ערך', 'לערוך'], 'מחיקת': ['מחק', 'למחוק'], 'ביטול': ['ביטל', 'לבטל'], 'שינוי': ['שינה', 'לשנות'], 'עדכון': ['עדכן', 'לעדכן'], 'שחזור': ['שחזר', 'לשחזר'], 'רישום': ['רשם', 'לרשום'],
  'הרצת': ['הריץ', 'להריץ'], 'הזמנת': ['הזמין', 'להזמין'], 'הסרת': ['הסיר', 'להסיר'], 'העתקת': ['העתיק', 'להעתיק'], 'סגירת': ['סגר', 'לסגור'], 'פתיחת': ['פתח', 'לפתוח'], 'הכנסת': ['הכניס', 'להכניס'], 'השארת': ['השאיר', 'להשאיר'],
  'פיצול': ['פיצל', 'לפצל'], 'סידור': ['סידר', 'לסדר'], 'קישור': ['קישר', 'לקשר'], 'אישור': ['אישר', 'לאשר'], 'דחיית': ['דחה', 'לדחות'], 'קביעת': ['קבע', 'לקבוע'], 'שמירת': ['שמר', 'לשמור'],
};
/** The record's name, when the request (or the answer) holds one. */
function recordName(e: LogEntry): string {
  for (const t of [e.body, e.result]) {
    try {
      const j = JSON.parse(t || '') as Record<string, unknown>;
      for (const k of ['title', 'name', 'text', 'label']) if (typeof j?.[k] === 'string' && (j[k] as string).trim()) return (j[k] as string).trim().split('\n')[0].slice(0, 90);
    } catch { /* cut short or empty: no name */ }
  }
  return '';
}
/** A catalog name without what comes after its first clause ("יצירת משימה חדשה, אופציונלי עם…"). */
export const opShort = (he: string) => he.split(/[,:(;]|\. /)[0].trim();
export function actionText(e: LogEntry): ReactNode {
  const he = opShort(e.opHe || '');
  const name = e.ok ? recordName(e) : '';
  const [first, ...more] = he.split(' ');
  const did = DID[first];
  const tail = name ? `: ${name}` : '';
  if (did) return `${e.ok ? did[0] : `ניסה ${did[1]}`} ${more.join(' ').replace(/ (חדשה|חדש)$/, '')}${tail}`;
  return <>{e.ok ? e.verb : 'ניסה'}: {he || <Mono>{e.op}</Mono>}{tail}</>;
}

/* ───────── the free quota ───────── */
export const GRANT = 'gcloud projects add-iam-policy-binding havat-ravve --member=serviceAccount:api-worker@havat-ravve.iam.gserviceaccount.com --role=roles/monitoring.viewer';
export const USAGE_URL = 'https://console.firebase.google.com/project/havat-ravve/firestore/usage';
export type Notify = (t: string, tone?: 'info' | 'alert') => void;
export async function copyGrant(notify: Notify) {
  try { await navigator.clipboard.writeText(GRANT); notify('הפקודה הועתקה'); } catch { notify('לא הצלחנו להעתיק. אפשר לסמן ולהעתיק ידנית', 'alert'); }
}
/** The meters, or why the database's numbers are missing. `long`: the labels name the database (no ניטור around them). */
export function QuotaBody({ m, long, notify }: { m: Monitor; long?: boolean; notify: Notify }) {
  const q = m.quota;
  const bytes = m.health?.r2Bytes;
  return (
    <div className="ds-quota">
      {q?.error === 'permission' && (
        <div className="ds-quota__why">
          <p><b>כדי לראות כמה מהמכסה של מסד הנתונים בשימוש, השרת צריך הרשאת צפייה אחת ב־Google Cloud.</b> זה בחינם, ואפשר לבטל בכל רגע. מריצים פעם אחת במחשב שמחובר לחשבון של החווה:</p>
          <code className="c-code" dir="ltr">{GRANT}</code>
          <Btn onClick={() => copyGrant(notify)}>העתקת הפקודה</Btn>
        </div>
      )}
      {q?.error === 'billing' && (
        <div className="ds-quota__why">
          <p><b>Google מציג את המונה הזה רק בפרויקטים עם חיוב מופעל, והחווה בתוכנית החינמית.</b> את השימוש היומי אפשר לראות בקונסולת Firebase, בלשונית השימוש של מסד הנתונים. אם המכסה מתקרבת לסוף, האפליקציה עצמה מתחילה לסרב לשמירות עד 10:00 בבוקר.</p>
          <a className="d-act" href={USAGE_URL} target="_blank" rel="noreferrer">לשימוש במסד הנתונים בקונסולת Firebase</a>
        </div>
      )}
      {q?.error && q.error !== 'permission' && q.error !== 'billing' && <p className="ds-quota__line" title={q.detail || undefined}>לא הצלחנו למדוד את המכסה של מסד הנתונים. ננסה שוב בעוד שעה.</p>}
      {!q && <p className="ds-quota__line">המדידה הראשונה תירשם בריצה הבאה של השרת.</p>}
      <Meters>
        {q && !q.error && (
          <>
            <Meter label={long ? 'קריאות ממסד הנתונים' : 'קריאות'} value={fmt(q.reads)} of={fmt(m.limits.reads)} pct={(q.reads! / m.limits.reads) * 100} />
            <Meter label="כתיבות" value={fmt(q.writes)} of={fmt(m.limits.writes)} pct={(q.writes! / m.limits.writes) * 100} />
            <Meter label="מחיקות" value={fmt(q.deletes)} of={fmt(m.limits.deletes)} pct={(q.deletes! / m.limits.deletes) * 100} />
          </>
        )}
        {bytes !== null && bytes !== undefined && <Meter label={long ? 'אחסון קבצים וגיבויים' : 'אחסון'} value={<Ltr>{size(bytes)}</Ltr>} of={<Ltr>{size(m.limits.r2Bytes)}</Ltr>} pct={(bytes / m.limits.r2Bytes) * 100} />}
      </Meters>
    </div>
  );
}
export const QuotaSkeleton = () => <Skeleton lines={8} height={10} />;
export const downCells = (m: Monitor) => many(m.site.checks.filter((c) => !c.ok).length, 'בדיקה אחת שלא עברה', 'בדיקות שלא עברו');
