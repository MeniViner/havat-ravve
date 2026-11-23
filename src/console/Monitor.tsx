// ניטור: the server watching itself. The site every 15 minutes (a strip of the last 24 hours), the free quota of
// Firestore and R2, this morning's check, and the alerts the owners get when something is wrong.
import { useState } from 'react';
import { Bar, Button, Card, Dot, ListCard, Row, Toggle } from '../app/v2/kit';
import { hhmm } from '../app/v2/format';
import { ago, fmt, Section, useLoad } from './shared';
import { size } from './labels';
import { errorText, source, type HealthState, type Monitor } from './source';
import { sec } from './Speed';

const GRANT = 'gcloud projects add-iam-policy-binding havat-ravve --member=serviceAccount:api-worker@havat-ravve.iam.gserviceaccount.com --role=roles/monitoring.viewer';
const STATE: Record<HealthState, string> = { ok: 'תקין', warn: 'לשים לב', bad: 'לטפל', unknown: 'לא ידוע' };
/** The morning check's lines by their id, in plain words (the server's own names mention its providers). */
const HEALTH_HE: Record<string, string> = { quota: 'המכסה החינמית של מסד הנתונים', storage: 'אחסון קבצים וגיבויים' };

function StateMark({ state }: { state: HealthState }) {
  return <span className={`c-state c-state--${state}`} role="img" aria-label={STATE[state]} />;
}

export function MonitorScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const mon = useLoad(() => source.monitor());
  const [busy, setBusy] = useState(false);
  const m = mon.data;
  const checkNow = async () => {
    setBusy(true);
    try { mon.setData(await source.checkNow()); notify('הבדיקה הסתיימה'); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">ניטור</h1>
          <p className="c-sub">השרת בודק את עצמו: את האתר כל רבע שעה, את המכסה החינמית כל שעה, ובדיקה מלאה כל בוקר ב־07:00.</p>
        </div>
        <Button variant="neutral" onClick={checkNow} disabled={busy || !m}>{busy ? 'בודק…' : 'בדיקה עכשיו'}</Button>
      </div>
      {mon.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את הניטור. {mon.error}</Card>}
      {mon.loading && !m && <p className="c-soft">טוען…</p>}
      {m && (
        <div className={mon.loading || busy ? 'c-stack c-loading' : 'c-stack'}>
          <SiteCard m={m} />
          <QuotaSection m={m} notify={notify} />
          <Section title="בדיקת הבוקר" aside={m.health ? <span className="c-soft">{ago(m.health.at)}{m.health.by !== 'cron' ? ` · ${m.health.by}` : ''}</span> : undefined}>
            {!m.health && <Card pad="md" className="c-soft">הבדיקה הראשונה תרוץ מחר ב־07:00, או עכשיו בכפתור למעלה.</Card>}
            {m.health && (
              <ListCard>
                {m.health.items.map((i) => (
                  <Row key={i.id} leading={<StateMark state={i.state} />} title={HEALTH_HE[i.id] || i.he} meta={i.detail} value={<span className={`c-state-text c-state-text--${i.state}`}>{STATE[i.state]}</span>} />
                ))}
              </ListCard>
            )}
          </Section>
          <AlertsSection m={m} onChange={(alerts) => mon.setData({ ...m, alerts })} notify={notify} />
        </div>
      )}
    </>
  );
}

function SiteCard({ m }: { m: Monitor }) {
  const s = m.site;
  const last = s.checks[s.checks.length - 1];
  const down = !!s.downSince;
  const recent = s.incidents.filter((i) => !i.to || Date.now() - Date.parse(i.to) < 7 * 86400_000).slice(-3).reverse();
  return (
    <Section title="האתר">
      <Card pad="lg" className="c-site">
        <div className="c-health">
          <Dot tone={!last ? 'amber' : down || !last.ok ? 'red' : 'green'} />
          <div className="c-health__body">
            <b>{!last ? 'עוד לא נבדק' : down ? `האתר לא עונה מאז ${hhmm(s.downSince!)}` : last.ok ? 'האתר עונה' : 'הבדיקה האחרונה לא עברה'}</b>
            <span className="c-soft">
              <span className="k-ltr">{s.url}</span>
              {last && <> · נבדק {ago(last.at)}{last.ok && <> · ענה תוך <bdi className="k-num">{sec(last.ms)}</bdi></>}</>}
              {s.uptime !== null && <> · <span className="k-num">{s.uptime}%</span> ביממה</>}
            </span>
          </div>
        </div>
        {!!s.checks.length && (
          <>
            <div className="c-strip" role="img" aria-label={`${s.checks.filter((c) => !c.ok).length} בדיקות שלא עברו ב־24 השעות האחרונות`}>
              {s.checks.map((c) => <span key={c.at} className={c.ok ? '' : 'is-down'} title={`${hhmm(c.at)} · ${c.ok ? sec(c.ms) : 'לא ענה'}`} />)}
            </div>
            <div className="c-strip__axis"><span>לפני 24 שעות</span><span>עכשיו</span></div>
          </>
        )}
        {!!recent.length && (
          <ul className="c-incidents">
            {recent.map((i) => (
              <li key={i.from}>{i.to ? `נפל ${ago(i.from)} וחזר אחרי ${Math.max(1, Math.round((Date.parse(i.to) - Date.parse(i.from)) / 60_000))} דקות` : `לא עונה מאז ${hhmm(i.from)}`}</li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}

function Meter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: (n: number) => string }) {
  const share = used / limit;
  const show = unit || fmt;
  return (
    <div className={`c-meter${share >= 0.9 ? ' c-meter--bad' : share >= 0.7 ? ' c-meter--warn' : ''}`}>
      <div className="c-meter__head"><span>{label}</span><span className="c-soft"><bdi className="k-num">{show(used)}</bdi> מתוך <bdi className="k-num">{show(limit)}</bdi></span></div>
      <Bar value={share} label={`${label}: ${Math.round(share * 100)}%`} />
    </div>
  );
}

function QuotaSection({ m, notify }: { m: Monitor; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const q = m.quota;
  const copy = async () => { try { await navigator.clipboard.writeText(GRANT); notify('הפקודה הועתקה'); } catch { notify('לא הצלחנו להעתיק. אפשר לסמן ולהעתיק ידנית', 'alert'); } };
  return (
    <Section title="מכסות חינם" aside={q && !q.error ? <span className="c-soft">נמדד {ago(q.at)}</span> : undefined}>
      <Card pad="lg" className="c-meters">
        {q && !q.error && (
          <>
            <Meter label="קריאות ממסד הנתונים היום" used={q.reads!} limit={m.limits.reads} />
            <Meter label="כתיבות למסד הנתונים היום" used={q.writes!} limit={m.limits.writes} />
            <Meter label="מחיקות ממסד הנתונים היום" used={q.deletes!} limit={m.limits.deletes} />
          </>
        )}
        {q?.error === 'permission' && (
          <div className="c-grant">
            <p><b>כדי לראות כמה מהמכסה של מסד הנתונים בשימוש, השרת צריך הרשאת צפייה אחת ב־Google Cloud.</b> זה בחינם, ואפשר לבטל בכל רגע. מריצים פעם אחת במחשב שמחובר לחשבון של החווה:</p>
            <code className="c-code" dir="ltr">{GRANT}</code>
            <Button variant="neutral" onClick={copy}>העתקת הפקודה</Button>
          </div>
        )}
        {q?.error === 'billing' && (
          <div className="c-grant">
            <p><b>Google מציג את המונה הזה רק בפרויקטים עם חיוב מופעל, והחווה בתוכנית החינמית.</b> את השימוש היומי אפשר לראות בקונסולת Firebase, בלשונית השימוש של מסד הנתונים. אם המכסה מתקרבת לסוף, האפליקציה עצמה מתחילה לסרב לשמירות עד 10:00 בבוקר.</p>
            <a className="c-link" href="https://console.firebase.google.com/project/havat-ravve/firestore/usage" target="_blank" rel="noreferrer">לשימוש במסד הנתונים בקונסולת Firebase</a>
          </div>
        )}
        {q && q.error && q.error !== 'permission' && q.error !== 'billing' && <p className="c-soft"><span title={q.detail || undefined}>לא הצלחנו למדוד את המכסה של מסד הנתונים. ננסה שוב בעוד שעה.</span></p>}
        {!q && <p className="c-soft">המדידה הראשונה תירשם בריצה הבאה של השרת.</p>}
        {m.health?.r2Bytes !== null && m.health?.r2Bytes !== undefined && <Meter label="אחסון קבצים וגיבויים" used={m.health.r2Bytes} limit={m.limits.r2Bytes} unit={size} />}
        <p className="c-note">המכסה של מסד הנתונים מתחדשת כל יום ב־10:00 (חצות בקליפורניה). כשהשימוש עובר 80% נשלחת התראה.</p>
      </Card>
    </Section>
  );
}

function AlertsSection({ m, onChange, notify }: { m: Monitor; onChange: (a: Monitor['alerts']) => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (b: { on?: boolean; push?: boolean }) => {
    setBusy(true);
    try { onChange(await source.setAlerts(b)); } catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const r = await source.testAlert(); notify(r.push ? 'נשלחה. היא תופיע בהתראות באפליקציה ובטלפון' : 'נשלחה. היא תופיע בהתראות באפליקציה'); }
    catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(false); }
  };
  const a = m.alerts;
  return (
    <Section title="התראות לבעלים">
      <ListCard>
        <Row title="התראה כשמשהו לא בסדר" meta="בהתראות באפליקציה של כל הבעלים" value={<Toggle checked={a.on} onChange={(on) => set({ on })} label="התראה כשמשהו לא בסדר" disabled={busy} />} />
        <Row title="גם לטלפון" meta="חוץ מבין 23:00 ל־07:00" value={<Toggle checked={a.push && a.on} onChange={(push) => set({ push })} label="גם לטלפון" disabled={busy || !a.on} />} />
      </ListCard>
      <p className="c-note">מתי נשלחת התראה: האתר לא עונה חצי שעה, בדיקת הבוקר מצאה משהו לטפל בו, או שהמכסה החינמית עברה 80%. אותה התראה לא חוזרת לפני 12 שעות.{a.updatedBy && ` שונה לאחרונה על ידי ${a.updatedBy}, ${ago(a.updatedAt)}.`}</p>
      <Button variant="neutral" onClick={test} disabled={busy}>שליחת התראת בדיקה אליי</Button>
    </Section>
  );
}
