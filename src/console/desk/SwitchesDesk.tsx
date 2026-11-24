// מתגים on a computer (K13): three cards side by side, every change asks first and may say why, and the last changes.
// The questions and the list of changes are shared with the phone screen (Switches.tsx).
import { useEffect, useState, type ReactNode } from 'react';
import { daysFromToday, dayTime, ddmm, hhmm, relDay } from '../../app/v2/format';
import { ago, useLoad } from '../shared';
import { source, type LogEntry, type SwitchChange, type Switches, type SwitchesView } from '../source';
import { Act, Btn, Cols, DCard, DTag, Failed, Input, Notice, Page, Skeleton, Small, Switch, Table, type Column } from './desk';
import { DIcon } from './icons';
import { toTab } from './route';
import { switchKnown, switchSaid, switchTextSaid, switchVerb } from '../switchNames';

/** The switches of this screen. Each is kept as "is it stopped" (maintenance and read-only: "is it on"). */
export type Key = 'maintenance' | 'readOnly' | 'keysStopped' | 'registrationClosed' | 'emailPaused' | 'pushPaused' | 'broadcastEmailPaused';
export const MAINTENANCE_PLACEHOLDER = 'אנחנו עובדים על שיפור קטן. נחזור בקרוב.';
/** One change in words: who turned what on or off. */
export type Change = { id: string; at: string; by: string; name: string; on: boolean | null; reason: string };
const fromHistory = (c: SwitchChange): Change => ({ id: '', at: c.at, by: c.by, ...switchSaid(c.key, c.to), reason: c.reason });
/** The same from the server's action log: today's Worker keeps no history of its own, and takes no reason. */
export function fromLog(log: LogEntry[]): Change[] {
  return log.filter((l) => l.op === 'console.switches.set' && l.ok).flatMap((l) => {
    let b: Record<string, unknown> = {};
    try { b = JSON.parse(l.body || '{}') || {}; } catch { /* cut short in the log: nothing to say about it */ }
    return Object.entries(b).flatMap(([key, v]): Change[] => {
      if (typeof v === 'boolean' && switchKnown(key)) return [fromHistory({ at: l.at, by: l.actor.name, key, to: v, reason: '' })];
      return key === 'maintenanceText' && Object.keys(b).length === 1 ? [{ id: '', at: l.at, by: l.actor.name, ...switchTextSaid, reason: '' }] : [];
    });
  });
}
export const changeText = (c: Change) => `${switchVerb(c.on)}: ${c.name}`;
export const changeWhen = (c: Change) => `${relDay(c.at)} ${hhmm(c.at)}`;
/** The last changes: the server's own history, or (an older server) what its action log says. */
export function useChanges(v: SwitchesView | null) {
  const own = v?.history;
  const log = useLoad<LogEntry[] | null>(() => (v && !own ? source.recent(100) : Promise.resolve(null)), [!!v, !!own, v?.switches.updatedAt]);
  const all: Change[] | null = own ? own.map(fromHistory) : log.data ? fromLog(log.data).slice(0, 12) : null;
  // two changes may share a moment, so a line is also known by its place from the oldest
  const list = all && all.map((c, i) => ({ ...c, id: `${c.at} ${all.length - i}` }));
  return { list, reasons: !!own, error: own ? null : log.error, reload: log.reload };
}

// ---------- the questions ----------
export type Question = { title: string; text: string; go: string; risky?: boolean };
/** Turned on (or stopped): these four are the risky ones, and ask on the phone too. */
export const RISKY = new Set<Key>(['maintenance', 'readOnly', 'keysStopped', 'registrationClosed']);
const ASK_ON: Record<Key, Question> = {
  maintenance: { title: 'להעביר את האפליקציה לתחזוקה?', text: 'כל מי שנכנס, חוץ מהבעלים, יראה מסך "האפליקציה בתחזוקה" עד שתכבו את זה. מה שכבר נשמר לא נפגע.', go: 'כן, לתחזוקה', risky: true },
  readOnly: { title: 'לעבור לקריאה בלבד?', text: 'אף אחד חוץ מהבעלים לא יוכל לשנות כלום: לא באפליקציה ולא דרך מפתחות ה־API. אפשר עדיין לצפות בהכל. מתאים לחירום.', go: 'כן, קריאה בלבד', risky: true },
  keysStopped: { title: 'לעצור את כל מפתחות ה־API?', text: 'כל בקשה עם מפתח תיענה בסירוב, גם של אינסטינקט, עד שתפעילו שוב. הקונסולה ממשיכה לעבוד.', go: 'כן, לעצור', risky: true },
  registrationClosed: { title: 'לסגור את ההרשמה?', text: 'מי שאין לו עדיין חשבון יראה "ההרשמה סגורה כרגע". מי שכבר רשום נכנס כרגיל.', go: 'כן, לסגור', risky: true },
  emailPaused: { title: 'להשהות את המיילים על תשלומים?', text: 'אישורי תשלום ייכנסו לתור ויישלחו כשתדליקו שוב, גם אם חיכו הרבה. ההשהיה עוצרת גם את ההודעות במייל לנרשמים: מייל כזה, אם עברו יותר מ־12 שעות מאז שההודעה נשלחה, כבר לא יישלח.', go: 'כן, להשהות' },
  pushPaused: { title: 'להשהות את ההתראות לטלפון?', text: 'ההתראה באפליקציה תמשיך להגיע. לטלפון לא יישלח מה שחיכה יותר מ־6 שעות.', go: 'כן, להשהות' },
  broadcastEmailPaused: { title: 'להשהות את ההודעות במייל לנרשמים?', text: 'הודעות שנשלחו "גם במייל" יחכו בתור, ויישלחו כשתדליקו שוב. מייל שחיכה יותר מ־12 שעות מאז שההודעה נשלחה כבר לא יישלח. באפליקציה הן מגיעות כרגיל.', go: 'כן, להשהות' },
};
const ASK_OFF: Record<Key, Question> = {
  maintenance: { title: 'לצאת ממצב תחזוקה?', text: 'כולם חוזרים לאפליקציה תוך שניות.', go: 'כן, לצאת מתחזוקה' },
  readOnly: { title: 'לצאת מקריאה בלבד?', text: 'כולם יוכלו שוב לשנות, לפי ההרשאות שלהם, באפליקציה ודרך המפתחות.', go: 'כן, לצאת' },
  keysStopped: { title: 'להפעיל את מפתחות ה־API?', text: 'המפתחות הפעילים, כולל של אינסטינקט, יחזרו לעבוד. מפתח שבוטל או פג נשאר סגור.', go: 'כן, להפעיל' },
  registrationClosed: { title: 'לפתוח את ההרשמה?', text: 'מי שאין לו חשבון יוכל להירשם באפליקציה.', go: 'כן, לפתוח' },
  emailPaused: { title: 'להדליק את המיילים על תשלומים?', text: 'מיילים שחיכו בתור יישלחו בסבב הבא (עד 5 דקות).', go: 'כן, להדליק' },
  pushPaused: { title: 'להדליק את ההתראות לטלפון?', text: 'התראות שמחכות יישלחו בסבב הבא. מה שחיכה יותר מ־6 שעות לא יישלח.', go: 'כן, להדליק' },
  broadcastEmailPaused: { title: 'להדליק את ההודעות במייל לנרשמים?', text: 'הודעות שחיכו יישלחו לפי המכסה היומית של שירות המייל. מה שחיכה יותר מ־12 שעות לא יישלח.', go: 'כן, להדליק' },
};
/** What the small print under the phone's switches says, where the computer's shorter lines do not. */
const FINE: Partial<Record<Key, string>> = {
  registrationClosed: 'נאכף באפליקציה עצמה.', readOnly: 'המפתחות עדיין יכולים לקרוא, אבל לא לשנות. נאכף בגרסה העדכנית של האפליקציה, לא בכללי מסד הנתונים.',
};
export const question = (k: Key, to: boolean, fine?: boolean): Question => {
  const q = (to ? ASK_ON : ASK_OFF)[k];
  return fine && to && FINE[k] ? { ...q, text: `${q.text} ${FINE[k]}` } : q;
};

// ---------- the page ----------
function Item({ title, text, on, onChange, disabled, children }: { title: string; text: ReactNode; on: boolean; onChange: (on: boolean) => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className="dn-sw">
      <div className="dn-sw__row">
        <span className="dn-sw__text"><b>{title}</b><span>{text}</span></span>
        <span className="dn-sw__end"><span className={on ? 'is-on' : undefined}>{on ? 'פועל' : 'כבוי'}</span><Switch on={on} onChange={onChange} label={title} disabled={disabled} /></span>
      </div>
      {children}
    </div>
  );
}

export function SwitchesDesk({ v, error, retry, busy, ask, saveText, onNow }: {
  v: SwitchesView | null; error: string | null; retry: () => void; busy: boolean;
  ask: (k: Key, to: boolean) => void; saveText: (text: string) => void; onNow: string[];
}) {
  const changes = useChanges(v);
  const s = v?.switches;
  const [text, setText] = useState('');
  useEffect(() => setText(s?.maintenanceText || ''), [s?.maintenanceText]);
  const emailServer = !!v?.server.email.on;
  const pushServer = !!v && !!v.server.push.mode && v.server.push.mode !== 'unset' && v.server.push.mode !== 'off';
  const last = changes.list?.[0];
  const columns: Column<Change>[] = [
    { key: 'at', head: 'מתי', width: 174, soft: true, cell: changeWhen },
    { key: 'by', head: 'מי', width: 204, strong: true, cell: (c) => c.by || '—' },
    { key: 'what', head: 'מה', cell: changeText },
    ...(changes.reasons ? [{ key: 'why', head: 'למה', soft: true, wrap: true, cell: (c: Change) => c.reason || '—' }] : []),
  ];
  const off = (k: Key) => ({ on: !s?.[k], onChange: (on: boolean) => ask(k, !on), disabled: busy });
  const on = (k: Key) => ({ on: !!s?.[k], onChange: (x: boolean) => ask(k, x), disabled: busy });
  return (
    <Page group="שליחה ותזמון" title="מתגים" sub="לכבות ולהדליק חלקים של המערכת בלחיצה. כל שינוי מבקש אישור ונרשם ביומן האבטחה">
      <div className="dn-fixed">
        <DCard>
          <div className="dn-info">
            <span className="dn-info__icon"><DIcon name="clock" size={20} /></span>
            <span className="dn-info__text">שינוי מתג נכנס לתוקף באפליקציה תוך שניות, ובשרת תוך דקה. {last
              ? <><b>שונה לאחרונה:</b> {last.by} {switchVerb(last.on)} את "{last.name}", {daysFromToday(last.at) < -1 ? ddmm(last.at) : dayTime(last.at)}.</>
              : s?.updatedBy ? <><b>שונה לאחרונה:</b> {s.updatedBy}, {ago(s.updatedAt)}.</> : null}</span>
            <Act href={toTab('security')}>להיסטוריית השינויים</Act>
          </div>
        </DCard>
      </div>
      {onNow.length > 0 && <div className="dn-fixed"><Notice tone="red" icon="bolt"><b>דלוק עכשיו:</b> {onNow.join(' · ')}. כל בוקר תגיע תזכורת עד שזה יכובה.</Notice></div>}
      {error && <div className="dn-fixed"><DCard><Failed text={`לא הצלחנו לקרוא את המתגים. ${error}`} retry={retry} /></DCard></div>}
      {!v && !error && <Cols className="d-cols--top d-cols--even dn-cards">{['מה אנשים רואים באפליקציה', 'שליחה', 'מפתחות API'].map((t) => <DCard key={t} title={t}><Skeleton lines={8} height={18} /></DCard>)}</Cols>}
      {s && (
        <>
          <Cols className="d-cols--top d-cols--even dn-cards">
            <DCard title="מה אנשים רואים באפליקציה" aside={<DTag tone="amber">מתגי חירום</DTag>}>
              <div className="dn-sws">
                <Item title="מצב תחזוקה" text={'כולם חוץ מהבעלים רואים מסך "חוזרים עוד מעט". לשימוש בזמן תיקון.'} {...on('maintenance')}>
                  {s.maintenance && (
                    <form className="dn-sw__form" onSubmit={(e) => { e.preventDefault(); saveText(text); }}>
                      <Input label="ההודעה במסך התחזוקה" value={text} onChange={(x) => setText(x.slice(0, 300))} placeholder={MAINTENANCE_PLACEHOLDER} multiline />
                      <div><Btn type="submit" disabled={busy || text.trim() === s.maintenanceText}>שמירת ההודעה</Btn></div>
                    </form>
                  )}
                </Item>
                <Item title="הרשמה פתוחה" text="כשכבוי, מי שאין לו חשבון לא יכול להירשם. מי שרשום ממשיך כרגיל." {...off('registrationClosed')} />
                <Item title="קריאה בלבד" text="אף אחד חוץ מהבעלים לא משנה כלום. לחירום, כשמשהו כותב נתונים שגויים." {...on('readOnly')} />
              </div>
            </DCard>
            <DCard title="שליחה">
              <div className="dn-sws">
                <Item title="מיילים על תשלומים" text={!emailServer ? 'כבוי בהגדרות השרת, לא נשלחים בכלל.' : s.emailPaused ? 'בהשהיה: תשלומים נכנסים לתור ונשלחים כשמדליקים.' : 'נשלחים לאורח כמה דקות אחרי שהתשלום סומן.'}
                  {...off('emailPaused')} on={emailServer && !s.emailPaused} disabled={busy || !emailServer} />
                <Item title="התראות לטלפון" text={!pushServer ? 'לא מוגדרות בשרת.' : s.pushPaused ? 'בהשהיה: ההתראה באפליקציה מגיעה. לטלפון לא יישלח מה שחיכה יותר מ־6 שעות.' : 'כל התראה באפליקציה מגיעה גם לטלפון, למי שהפעיל.'}
                  {...off('pushPaused')} on={pushServer && !s.pushPaused} disabled={busy || !pushServer} />
                {s.broadcastEmailPaused !== undefined && <Item title="הודעות במייל לנרשמים" text={!emailServer ? 'כבוי בהגדרות השרת, לא נשלחות בכלל.' : s.broadcastEmailPaused ? 'בהשהיה: ההודעות מחכות בתור ונשלחות כשמדליקים, אם לא עברו 12 שעות.' : '"לשלוח גם במייל" בהודעות לנרשמים ולכל המשתמשים.'}
                  {...off('broadcastEmailPaused')} on={emailServer && !s.broadcastEmailPaused} disabled={busy || !emailServer} />}
              </div>
            </DCard>
            <DCard title="מפתחות API">
              <div className="dn-sws">
                <Item title="כל המפתחות פעילים" text="כיבוי עוצר את כל המפתחות בבת אחת, כולל אינסטינקט. הקונסולה ממשיכה לעבוד." {...off('keysStopped')} />
              </div>
              <div className="dn-keys"><Small>מפתח בודד עוצרים במסך מפתחות API.{s.readOnly ? ' במצב קריאה בלבד המפתחות עדיין יכולים לקרוא, אבל לא לשנות.' : ''}</Small></div>
            </DCard>
          </Cols>
          <div className="dn-changes">
            <DCard tight title="שינויים אחרונים במתגים">
              <Table label="שינויים אחרונים במתגים" columns={columns} rows={changes.list} rowKey={(c) => c.id} skeleton={3} error={changes.error && `לא הצלחנו לקרוא את השינויים. ${changes.error}`} retry={changes.reload} empty="עוד לא שונה אף מתג." />
            </DCard>
          </div>
        </>
      )}
    </Page>
  );
}
