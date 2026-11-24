// משימות מתוזמנות on a computer (K12): the jobs as a table, the last four hours of rounds, cleanup and archive; and
// "להריץ סבב מלא עכשיו", which the phone screen (Jobs.tsx) has too: the browser runs the jobs one after the other, each its
// own request, the way the server's round does.
import { jobBlockedText } from '../delivery';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from '../../app/v2/kit';
import { hhmm, keyOf } from '../../app/v2/format';
import { nowMs, todayKey } from '../../app/clock';
import { ago, fmt, many } from '../shared';
import { collectionName, size } from '../labels';
import { errorText, source, type Job, type Jobs } from '../source';
import { Act, Btn, CellStrip, Cols, DCard, DDot, DTag, Dialog, Empty, Fact, Facts, Failed, Page, Skeleton, Switch, Table, TableCard, type Column, type DotTone } from './desk';

const n = (v: unknown) => (typeof v === 'number' ? v : 0);
/** The cleanup's lines in plain words (the server's own names speak of its API). */
export const CLEAN_HE: Record<string, string> = { api_idempotency: 'רישום בקשות למניעת כפילויות', api_log: 'יומן הבקשות לשרת' };
const ARCHIVE_HE: Record<string, string> = { api_idempotency: 'רישום בקשות', api_log: 'יומן הבקשות', push_jobs: 'התראות שנשלחו', api_failures: 'תקלות שרת', email_outbox: 'מיילים שנשלחו' };
/** The table's short "when"; the server's full sentence is the cell's hint. */
const WHEN: Record<string, string> = { email: 'כל 5 דקות', push: 'כל 5 דקות', monitor: 'כל 15 דקות', backup: 'כל לילה ב־03:00', cleanup: 'כל לילה, אחרי הגיבוי', accounts: 'כל 5 דקות' };
export const KEEP_ACCOUNTS = 'מחיקת חשבונות לא נעצרת מכאן: היא בקשה של המשתמש, והיא מתבצעת 30 יום אחריה.';
const CLEANUP_TEXT = 'כל לילה, אחרי הגיבוי, רשומות טכניות ישנות עוברות לארכיון בשירות האחסון ונמחקות ממסד הנתונים, כדי שיישאר קטן וחינמי. הנתונים של החווה עצמה (משימות, אנשים, אירועים, תשלומים) לא נמחקים אף פעם.';

/** "9 נשלחו, אחת נכשלה": only what there was; nothing at all is said in words, not as a zero. */
const told = (parts: [number, string, string][]) => parts.filter(([k]) => k).map(([k, one, other]) => many(k, one, other)).join(', ') || 'לא היה מה לשלוח';
/** The payment mails, and the messages to registrants that went with them. */
const mails = (r: Record<string, unknown>) => n(r.sent) + n((r.broadcasts as { sent?: unknown } | undefined)?.sent);
/** What a job's last turn did, in words. */
export function lastText(j: Pick<Job, 'id' | 'last' | 'blocked'>): string {
  if (j.blocked) return jobBlockedText[j.blocked];
  const l = j.last;
  if (!l) return 'עוד לא רצה מאז העדכון';
  const r = l.result;
  // a Hebrew reason is shown; a technical (English) one stays out of the line
  if (!l.ok) { const err = String(r.error || ''); return err && !/[A-Za-z]/.test(err) ? `נכשלה: ${err}` : 'נכשלה בפעם האחרונה'; }
  if (r.nothing) return 'לא היה מה לעשות';
  switch (j.id) {
    case 'email': return r.enabled === false ? 'כבויה בהגדרות השרת' : r.paused ? (n(r.enqueued) ? `בהשהיה. ${many(n(r.enqueued), 'מייל אחד נכנס לתור', 'נכנסו לתור')}` : 'בהשהיה') : told([[mails(r), 'נשלח מייל אחד', 'נשלחו'], [n(r.failed), 'אחד נכשל', 'נכשלו'], [n(r.enqueued), 'אחד נכנס לתור', 'נכנסו לתור']]);
    case 'push': return r.paused ? 'בהשהיה' : r.mode === 'unset' || r.mode === 'off' ? jobBlockedText.phone : told([[n(r.delivered), 'שירות ההתראות קיבל התראה אחת', 'התקבלו אצל שירות ההתראות'], [n(r.failed), 'אחת נכשלה', 'נכשלו']]);
    case 'monitor': return r.health ? `בדיקה כללית: ${r.health === 'ok' ? 'הכל תקין' : 'יש מה לבדוק'}` : 'האתר נבדק';
    case 'backup': return r.done ? `הגיבוי הושלם${n(r.docs) ? `: ${fmt(n(r.docs))} רשומות` : ''}` : `בגיבוי: ${fmt(n(r.docs))} רשומות עד עכשיו`;
    case 'cleanup': return r.done ? `הסתיים: ${fmt(n(r.deleted))} רשומות עברו לארכיון ונמחקו` : `${fmt(n(r.deleted))} רשומות עד עכשיו`;
    case 'accounts': return n(r.deleted) ? many(n(r.deleted), 'נמחק חשבון אחד', 'חשבונות נמחקו') : 'אין חשבונות למחיקה';
    default: return 'רצה';
  }
}
/** The same, short enough for a table cell. */
function shortText(j: Pick<Job, 'id' | 'last' | 'blocked'>): string {
  if (j.blocked) return jobBlockedText[j.blocked];
  const l = j.last;
  if (!l) return 'עוד לא רצה';
  if (!l.ok || l.result.nothing) return lastText(j);
  const r = l.result;
  if (j.id === 'monitor' && r.health) return r.health === 'ok' ? 'הכול תקין' : 'יש מה לבדוק';
  if (j.id === 'backup' && r.done && n(r.docs)) return `${fmt(n(r.docs))} רשומות`;
  if (j.id === 'cleanup' && r.done) return n(r.deleted) === 1 ? 'רשומה אחת עברה לארכיון' : `${fmt(n(r.deleted))} עברו לארכיון`;
  if (j.id === 'accounts' && !n(r.deleted)) return 'אין מה למחוק';
  return lastText(j);
}
const secs = (ms: number) => Math.max(0.1, ms / 1000).toFixed(1);

// ---------- the rounds of the last four hours ----------
type Rounds = NonNullable<Jobs['rounds']>;
const CELLS = 48;
/** The last full round: the server's own, or one run from this screen since (the server's clock does not count that one). */
export function lastRound(d: Jobs): { at: string; ms: number | null; by: string } | null {
  const due = d.jobs.filter((j) => ['email', 'push', 'monitor'].includes(j.id) && j.canRun && !j.paused && !j.blocked);
  const here = due.length > 1 && due.every((j) => j.last?.by && (!d.cronAt || j.last.at > d.cronAt));
  if (here) return { at: due.map((j) => j.last!.at).sort().at(-1)!, ms: due.reduce((s, j) => s + j.last!.ms, 0), by: due[0].last!.by! };
  return d.cronAt ? { at: d.cronAt, ms: d.cronMs, by: '' } : null;
}
export const roundsAside = (d: Jobs) => {
  const r = lastRound(d);
  const last = r?.by ? undefined : d.rounds?.items.at(-1);
  return [r ? `הסבב האחרון: ${ago(r.at)}${r.by ? `, ידנית, ${r.by}` : ''}` : 'עוד לא היה סבב מאז העדכון', r?.ms != null ? `נמשך ${(r.ms / 1000).toFixed(1)} שניות` : '', last?.used != null ? `${fmt(last.used)} מתוך ${fmt(d.rounds!.limit)} פניות` : ''].filter(Boolean).join(' · ');
};
export const failedRounds = (r: Rounds) => r.items.filter((x) => !x.ok).length;
export function roundsText(r: Rounds, jobs: Job[]): string {
  if (!r.items.length) return 'עוד לא נשמרו סבבים.';
  const bad = r.items.map((x, i) => ({ x, i })).filter(({ x }) => !x.ok);
  if (!bad.length) return 'כל הסבבים הצליחו.';
  const { x, i } = bad[bad.length - 1];
  const why = x.why && !/[A-Za-z]/.test(x.why) ? x.why : jobs.find((j) => j.id === x.failed)?.he || (x.failed && !/[A-Za-z]/.test(x.failed) ? x.failed : '');
  const next = r.items[i + 1];
  const after = next ? (next.ok ? ' הסבב הבא השלים את העבודה.' : '') : ' הסבב הבא ינסה שוב.';
  return `${bad.length === 1 ? 'סבב אחד נכשל' : `${fmt(bad.length)} סבבים נכשלו, האחרון`} ב־${hhmm(x.at)}${why ? ` (${why})` : ''}.${after}`;
}
export function RoundsStrip({ r }: { r: Rounds }) {
  const items = r.items.slice(-CELLS);
  const bad = failedRounds({ ...r, items });
  // a server that was just updated has fewer than four hours: the cells before them are grey
  const cells = [
    ...Array.from({ length: Math.max(0, CELLS - items.length) }, (_, i) => ({ key: 'x' + i, state: 'none' as const, tip: 'עוד לא נשמר' })),
    ...items.map((x) => ({ key: x.at, state: x.ok ? 'ok' as const : 'bad' as const, tip: `${hhmm(x.at)} · ${x.ok ? 'הצליח' : 'נכשל'} · ${secs(x.ms)} שנ׳${x.used != null ? ` · ${fmt(x.used)} פניות` : ''}` })),
  ];
  return <CellStrip radius={2} cells={cells} label={`${many(items.length, 'סבב אחד', 'סבבים')}, ${!bad ? 'כולם הצליחו' : bad === 1 ? 'אחד נכשל' : `${bad} נכשלו`}`} />;
}

// ---------- a full round, run from here ----------
/** done: the night's job already finished today. */
const doneToday = (j: Job) => !!j.last?.ok && j.last.result.done === true && keyOf(j.last.at) === todayKey();
const NIGHT = new Set(['backup', 'cleanup']);
type Step = { id: string; he: string; state: 'wait' | 'run' | 'ok' | 'bad' | 'skip'; text: string };
const ilHour = () => Number(hhmm(new Date(nowMs())).slice(0, 2));
/** What a full round would do now, in the server's order: the 5-minute jobs, then the night's if they are still due. */
export function roundPlan(jobs: Job[]): Step[] {
  const of = (id: string) => jobs.find((j) => j.id === id);
  const backup = of('backup');
  const backupLeft = !!backup && (backup.paused || ilHour() < 3) && !doneToday(backup);
  return ['email', 'push', 'monitor', 'backup', 'cleanup'].map(of).filter((j): j is Job => !!j && j.canRun).map((j) => {
    const skip = j.blocked ? jobBlockedText[j.blocked] : j.paused ? 'בהשהיה, לא תרוץ'
      : NIGHT.has(j.id) && doneToday(j) ? 'כבר הסתיימה היום'
      : NIGHT.has(j.id) && ilHour() < 3 ? 'רצה רק אחרי 03:00'
      : j.id === 'cleanup' && backupLeft ? 'רצה רק אחרי הגיבוי' : '';
    return { id: j.id, he: j.he, state: skip ? 'skip' as const : 'wait' as const, text: skip || 'מחכה' };
  });
}
/** A night job goes a page at a time: the browser asks for the next one until it says it is done. */
const PAGES = 60;
export type Round = { steps: Step[]; running: boolean; stopping: boolean; open: boolean; start: (jobs: Job[]) => void; stop: () => void; show: () => void; close: () => void };
export function useRound(reload: () => Promise<void>): Round {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [open, setOpen] = useState(false);
  const stop = useRef(false);
  const gone = useRef(false);
  // set on mount too: in strict mode the first unmount would leave it true
  useEffect(() => { gone.current = false; return () => { gone.current = true; stop.current = true; }; }, []);
  const start = async (jobs: Job[]) => {
    const plan = roundPlan(jobs);
    stop.current = false;
    setSteps(plan); setRunning(true); setStopping(false); setOpen(true);
    const put = (id: string, p: Partial<Step>) => { if (!gone.current) setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x))); };
    let backupBad = false, bad = false;
    for (const st of plan) {
      if (st.state !== 'wait') continue;
      if (stop.current) { put(st.id, { state: 'skip', text: 'לא רצה, עצרתם לפניה' }); continue; }
      if (st.id === 'cleanup' && backupBad) { put(st.id, { state: 'skip', text: 'לא רצה, כי הגיבוי לא הסתיים' }); continue; }
      put(st.id, { state: 'run', text: 'רצה עכשיו…' });
      try {
        let result: Record<string, unknown> | null = null;
        for (let i = 0; i < PAGES; i++) {
          result = (await source.runJob(st.id)).result;
          const job = { id: st.id, last: { at: '', ms: 0, ok: true, result: result || { nothing: true } } };
          if (!NIGHT.has(st.id) || result?.done !== false || stop.current) { put(st.id, { state: 'ok', text: shortText(job) }); break; }
          put(st.id, { text: lastText(job) });
        }
        if (NIGHT.has(st.id) && result?.done === false) { put(st.id, { state: 'ok', text: 'עוד לא הסתיימה, הסבב הבא ימשיך' }); if (st.id === 'backup') backupBad = true; }
      } catch (e) { bad = true; put(st.id, { state: 'bad', text: errorText(e) }); if (st.id === 'backup') backupBad = true; }
    }
    if (gone.current) return;
    setRunning(false); setStopping(false);
    if (bad) setOpen(true); // a closed window comes back to say what failed
    await reload();
  };
  return { steps, running, stopping, open, start, stop: () => { stop.current = true; setStopping(true); }, show: () => setOpen(true), close: () => setOpen(false) };
}
const TONE: Record<Step['state'], DotTone> = { wait: 'unknown', run: 'warn', ok: 'ok', bad: 'bad', skip: 'unknown' };
/** The progress window: each job, what it is doing, what it did. Closing it does not stop the round; leaving the screen does. */
export function RoundWindow({ round, wide }: { round: Round; wide: boolean }) {
  const { steps, running } = round;
  const bad = steps.filter((s) => s.state === 'bad').length;
  const latest = useRef(round.close);
  latest.current = round.close;
  const close = useCallback(() => latest.current(), []);
  const at = steps.filter((s) => s.state === 'ok' || s.state === 'bad').length;
  const of = steps.filter((s) => s.state !== 'skip').length;
  const sub = running ? `משימה ${Math.min(at + 1, of)} מתוך ${of}. הסבב נעצר אם עוברים למסך אחר.` : bad ? (bad === 1 ? 'הסבב הסתיים, משימה אחת נכשלה.' : `הסבב הסתיים, ${bad} משימות נכשלו.`) : of ? 'הסבב הסתיים.' : 'לא היה מה להריץ.';
  const list = (
    <div className="dn-round" role="status">
      {steps.map((s) => <div key={s.id} className="dn-round__row"><DDot tone={TONE[s.state]} /><b>{s.he}</b><span className={s.state === 'bad' ? 'is-bad' : undefined}>{s.text}</span></div>)}
    </div>
  );
  const foot = running ? <Btn disabled={round.stopping} onClick={round.stop}>{round.stopping ? 'עוצר אחרי המשימה הזאת…' : 'לעצור אחרי המשימה הזאת'}</Btn> : <Btn kind="primary" onClick={close}>סגירה</Btn>;
  if (!round.open || !steps.length) return null;
  return wide
    ? <Dialog open onClose={close} title="סבב מלא" sub={sub} footer={foot}>{list}</Dialog>
    : <Sheet open onClose={close} title="סבב מלא" sub={sub}>{list}<div className="dn-foot">{foot}</div></Sheet>;
}

// ---------- the page ----------
export function JobsDesk({ d, error, retry, busy, askRun, askPause, askRound, round }: {
  d: Jobs | null; error: string | null; retry: () => void; busy: string | null;
  askRun: (j: Job) => void; askPause: (j: Job, paused: boolean) => void; askRound: () => void; round: Round;
}) {
  const columns: Column<Job>[] = [
    { key: 'job', head: 'משימה', strong: true, cell: (j) => <span className="dn-job">{j.he}{j.paused && <DTag tone="amber">בהשהיה</DTag>}</span> },
    { key: 'when', head: 'מתי', width: 174, soft: true, cell: (j) => <span title={j.every}>{WHEN[j.id] || j.every}</span> },
    { key: 'last', head: 'ריצה אחרונה', width: 154, cell: (j) => (j.last ? <>{ago(j.last.at)}{j.last.by && <span className="dn-by">ידנית, {j.last.by}</span>}</> : '—') },
    { key: 'ms', head: 'משך', width: 94, align: 'end', cell: (j) => (j.last ? `${secs(j.last.ms)} שנ׳` : '—') },
    { key: 'result', head: 'תוצאה', width: 214, cell: (j) => <span className={j.last && !j.last.ok ? 'dn-result is-bad' : 'dn-result'} title={lastText(j)}>{shortText(j)}</span> },
    { key: 'do', head: <span className="k-sr">פעולות</span>, width: 194, align: 'end', cell: (j) => (
      <span className="dn-do">
        {!j.canRun && !j.canPause && <span className="dn-none" title={KEEP_ACCOUNTS}>לא נעצרת מכאן</span>}
        {j.canRun && <Act disabled={busy !== null || !!j.blocked || (j.paused && j.id === 'push')} onClick={() => askRun(j)}>{busy === j.id ? 'רצה…' : 'להריץ עכשיו'}</Act>}
        {j.canPause && <Switch on={!j.paused && !j.blocked} onChange={(on) => askPause(j, !on)} label={j.he} disabled={busy !== null || !!j.blocked} />}
      </span>
    ) },
  ];
  return (
    <Page group="שליחה ותזמון" title="משימות מתוזמנות" sub="השרת עושה סבב כל 5 דקות. כאן רואים מה כל חלק עשה בפעם האחרונה, ואפשר להריץ עכשיו או להשהות"
      actions={round.running ? <Btn kind="action" icon="play" onClick={round.show}>הסבב רץ, להצגה</Btn> : <Btn kind="action" icon="play" disabled={!d || busy !== null} onClick={askRound}>להריץ סבב מלא עכשיו</Btn>}>
      {error && !d ? <TableCard style={{ flex: 'none' }}><Failed text={`לא הצלחנו לקרוא את המשימות. ${error}`} retry={retry} /></TableCard> : (
        <>
          {error && <div className="dn-fixed"><Failed text={`לא הצלחנו לרענן. ${error}`} retry={retry} /></div>}
          <div className="dn-jobs"><TableCard style={{ flex: 'none' }}><Table label="משימות מתוזמנות" columns={columns} rows={d ? d.jobs : null} rowKey={(j) => j.id} skeleton={6} empty="אין משימות." /></TableCard></div>
          {!d ? <div className="dn-fixed"><DCard title="הסבבים בארבע השעות האחרונות"><Skeleton lines={2} /></DCard></div>
            : d.rounds ? (
              <div className="dn-fixed">
                <DCard title="הסבבים בארבע השעות האחרונות" aside={roundsAside(d)}>
                  <RoundsStrip r={d.rounds} />
                  <p className="dn-caption">{roundsText(d.rounds, d.jobs)}</p>
                </DCard>
              </div>
            ) : <p className="dn-caption dn-caption--alone">{roundsAside(d)}</p>}
          <Cols className="dn-bottom">
            <DCard fill tight title="ניקוי רשומות ישנות" aside={<span title={CLEANUP_TEXT}>נתוני החווה עצמם לא נמחקים אף פעם</span>}>
              <Table label="ניקוי רשומות ישנות" rows={d ? d.cleanup.items : null} rowKey={(i) => i.collection} skeleton={5} empty="אין מה לנקות."
                columns={[
                  { key: 'what', head: 'מה', strong: true, cell: (i) => CLEAN_HE[i.collection] || i.he },
                  { key: 'days', head: 'נשמר', width: 114, soft: true, cell: (i) => (i.days === 365 ? 'שנה' : `${i.days} ימים`) },
                  { key: 'due', head: 'ממתין לניקוי', width: 134, align: 'end', cell: (i) => (i.due === null ? '—' : fmt(i.due)) },
                ]} />
            </DCard>
            <DCard title="בארכיון" style={{ flex: 'none', width: 374, overflowY: 'auto' }}>
              {!d ? <Skeleton lines={3} /> : d.archive.collections.length ? (
                <Facts style={{ marginTop: -4 }}>{d.archive.collections.map((c) => <Fact key={c.collection} label={<bdi>{size(c.bytes)}</bdi>}>{ARCHIVE_HE[c.collection] || collectionName(c.collection)} · {many(c.files, 'קובץ אחד', 'קבצים')}</Fact>)}</Facts>
              ) : <Empty>הארכיון ריק. הניקוי הראשון ימלא אותו.</Empty>}
            </DCard>
          </Cols>
        </>
      )}
    </Page>
  );
}
