// מתגים: what the owners can turn on or off in one tap: maintenance, registration, read-only, emails, phone pushes and
// every API key. Turning something risky on asks first; turning it back off never does.
import { useEffect, useState } from 'react';
import { Button, Card, ConfirmSheet, Field, ListCard, Row, Toggle } from '../app/v2/kit';
import { ago, Section, useLoad } from './shared';
import { errorText, source, type Switches, type SwitchesView } from './source';

type Key = keyof Omit<Switches, 'maintenanceText' | 'updatedAt' | 'updatedBy'>;
const ASK: Partial<Record<Key, { title: string; text: string; go: string }>> = {
  maintenance: { title: 'להעביר את האפליקציה לתחזוקה?', text: 'כל מי שנכנס, חוץ מהבעלים, יראה מסך "האפליקציה בתחזוקה" עד שתכבו את זה. מה שכבר נשמר לא נפגע.', go: 'כן, לתחזוקה' },
  readOnly: { title: 'לעבור לקריאה בלבד?', text: 'אף אחד חוץ מהבעלים לא יוכל לשנות כלום: לא באפליקציה ולא דרך מפתחות ה־API. אפשר עדיין לצפות בהכל. מתאים לחירום.', go: 'כן, קריאה בלבד' },
  keysStopped: { title: 'לעצור את כל מפתחות ה־API?', text: 'כל בקשה עם מפתח תיענה בסירוב, גם של אינסטינקט, עד שתפעילו שוב. הקונסולה ממשיכה לעבוד.', go: 'כן, לעצור' },
  registrationClosed: { title: 'לסגור את ההרשמה?', text: 'מי שאין לו עדיין חשבון יראה "ההרשמה סגורה כרגע". מי שכבר רשום נכנס כרגיל.', go: 'כן, לסגור' },
};
export const ON_NOW: [Key, string][] = [
  ['maintenance', 'מצב תחזוקה'], ['readOnly', 'קריאה בלבד'], ['keysStopped', 'מפתחות ה־API עצורים'], ['registrationClosed', 'ההרשמה סגורה'],
  ['emailPaused', 'מיילים בהשהיה'], ['pushPaused', 'התראות לטלפון בהשהיה'],
];

export function SwitchesScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const st = useLoad(() => source.switches());
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Key | null>(null);
  const v = st.data;
  const set = async (b: Partial<Switches>, done?: string) => {
    setBusy(true);
    try { st.setData(await source.setSwitches(b)); if (done) notify(done); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  // risky when turned on (or, for registration, when closed): ask first
  const flip = (k: Key, on: boolean) => { if (on && ASK[k]) setAsk(k); else set({ [k]: on }); };
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">מתגים</h1>
          <p className="c-sub">לכבות ולהדליק בלחיצה. האפליקציה מקבלת את השינוי תוך שניות, והשרת תוך דקה.</p>
        </div>
      </div>
      {st.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את המתגים. {st.error}</Card>}
      {st.loading && !v && <p className="c-soft">טוען…</p>}
      {v && <Body v={v} busy={busy} flip={flip} set={set} />}
      {ask && v && (
        <ConfirmSheet open title={ASK[ask]!.title} text={ASK[ask]!.text} confirmLabel={ASK[ask]!.go} cancelLabel="חזרה" onClose={() => setAsk(null)}
          onConfirm={async () => { await set({ [ask]: true }); setAsk(null); }} />
      )}
    </>
  );
}

function Body({ v, busy, flip, set }: { v: SwitchesView; busy: boolean; flip: (k: Key, on: boolean) => void; set: (b: Partial<Switches>, done?: string) => Promise<void> }) {
  const s = v.switches;
  const on = ON_NOW.filter(([k]) => s[k]).map(([, he]) => he);
  const [text, setText] = useState(s.maintenanceText);
  useEffect(() => setText(s.maintenanceText), [s.maintenanceText]);
  const emailServer = v.server.email.on;
  const pushServer = !!v.server.push.mode && v.server.push.mode !== 'unset' && v.server.push.mode !== 'off';
  return (
    <>
      {on.length > 0 && <Card pad="md" className="c-warn"><b>דלוק עכשיו:</b> {on.join(' · ')}. כל בוקר תגיע תזכורת עד שזה יכובה.</Card>}
      <Section title="מה אנשים רואים באפליקציה">
        <ListCard>
          <Row title="מצב תחזוקה" meta="כולם חוץ מהבעלים רואים מסך תחזוקה" value={<Toggle checked={s.maintenance} onChange={(x) => flip('maintenance', x)} label="מצב תחזוקה" disabled={busy} />} />
          <Row title="הרשמה פתוחה" meta="כשסגורה, מי שאין לו חשבון לא יכול להירשם באפליקציה (נאכף באפליקציה עצמה)" value={<Toggle checked={!s.registrationClosed} onChange={(x) => flip('registrationClosed', !x)} label="הרשמה פתוחה" disabled={busy} />} />
          <Row title="קריאה בלבד (חירום)" meta="אף אחד חוץ מהבעלים לא משנה כלום באפליקציה ובמפתחות. נאכף בגרסה העדכנית של האפליקציה, לא בכללי מסד הנתונים" value={<Toggle checked={s.readOnly} onChange={(x) => flip('readOnly', x)} label="קריאה בלבד" disabled={busy} />} />
        </ListCard>
        {s.maintenance && (
          <Card pad="lg" className="c-stack c-stack--sm">
            <Field label="ההודעה במסך התחזוקה" value={text} onChange={(e) => setText(e.target.value)} placeholder="אנחנו עובדים על שיפור קטן. נחזור בקרוב." maxLength={300} />
            <div><Button variant="neutral" disabled={busy || text.trim() === s.maintenanceText} onClick={() => set({ maintenanceText: text }, 'ההודעה נשמרה')}>שמירת ההודעה</Button></div>
          </Card>
        )}
      </Section>
      <Section title="שליחה">
        <ListCard>
          <Row title="מיילים על תשלומים" meta={!emailServer ? 'כבוי בהגדרות השרת, לא נשלחים בכלל' : s.emailPaused ? 'בהשהיה: תשלומים נכנסים לתור ונשלחים כשמדליקים' : 'נשלח לאורח כמה דקות אחרי שתשלום מסומן'}
            value={<Toggle checked={!s.emailPaused} onChange={(x) => flip('emailPaused', !x)} label="מיילים על תשלומים" disabled={busy || !emailServer} />} />
          <Row title="התראות לטלפון" meta={!pushServer ? 'לא מוגדרות בשרת' : s.pushPaused ? 'בהשהיה: ההתראה באפליקציה מגיעה. לטלפון לא יישלח מה שחיכה יותר מ־6 שעות' : 'כל התראה באפליקציה מגיעה גם לטלפון, למי שהפעיל'}
            value={<Toggle checked={!s.pushPaused} onChange={(x) => flip('pushPaused', !x)} label="התראות לטלפון" disabled={busy || !pushServer} />} />
        </ListCard>
      </Section>
      <Section title="מפתחות API">
        <ListCard>
          <Row title="כל המפתחות פעילים" meta="כיבוי עוצר את כולם בבת אחת, כולל אינסטינקט. הקונסולה ממשיכה לעבוד" value={<Toggle checked={!s.keysStopped} onChange={(x) => flip('keysStopped', !x)} label="כל המפתחות פעילים" disabled={busy} />} />
        </ListCard>
        <p className="c-note">במצב קריאה בלבד המפתחות עדיין יכולים לקרוא, אבל לא לשנות. מפתח אחד עוצרים במסך מפתחות API.</p>
      </Section>
      {s.updatedBy && <p className="c-note">שונה לאחרונה על ידי {s.updatedBy}, {ago(s.updatedAt)}.</p>}
    </>
  );
}
