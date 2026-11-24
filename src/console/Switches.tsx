// מתגים: what the owners can turn on or off in one tap: maintenance, registration, read-only, emails, phone pushes and
// every API key. On a phone turning something risky on asks first; on a computer every change asks (desk/SwitchesDesk.tsx).
// The question takes the reason, when the server keeps one.
import { sendingSwitches } from './delivery';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Field, ListCard, Row, Sheet, Toggle } from '../app/v2/kit';
import { ago, Section, useLoad } from './shared';
import { errorText, source, type Switches, type SwitchesView } from './source';
import { Input } from './desk/desk';
import { useWide } from './desk/route';
import { changeText, changeWhen, MAINTENANCE_PLACEHOLDER, question, RISKY, SwitchesDesk, useChanges, type Key } from './desk/SwitchesDesk';

export const ON_NOW: [Key, string][] = [
  ['maintenance', 'מצב תחזוקה'], ['readOnly', 'קריאה בלבד'], ['keysStopped', 'מפתחות ה־API עצורים'], ['registrationClosed', 'ההרשמה סגורה'],
  ['emailPaused', 'מיילים בהשהיה'], ['pushPaused', 'התראות לטלפון בהשהיה'], ['broadcastEmailPaused', 'הודעות במייל לנרשמים בהשהיה'],
];

export function SwitchesScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const wide = useWide();
  const st = useLoad(() => source.switches());
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<{ k: Key; to: boolean } | null>(null);
  const v = st.data;
  const set = async (b: Partial<Switches>, done?: string, reason?: string) => {
    setBusy(true);
    try { st.setData(await source.setSwitches(b, v?.history ? reason?.trim() || undefined : undefined)); if (done) notify(done); return true; }
    catch (e) { notify(errorText(e), 'alert'); return false; }
    finally { setBusy(false); }
  };
  // a phone: risky when turned on (or, for registration, when closed) asks first; a computer: every change asks
  const flip = (k: Key, to: boolean) => { if (wide || (to && RISKY.has(k))) setAsk({ k, to }); else set({ [k]: to }); };
  const close = useCallback(() => setAsk(null), []);
  const saveText = (text: string) => set({ maintenanceText: text }, 'ההודעה נשמרה');
  return (
    <>
      {wide ? <SwitchesDesk v={v} error={st.error} retry={st.reload} busy={busy} ask={flip} saveText={saveText} onNow={v ? ON_NOW.filter(([k]) => v.switches[k]).map(([, he]) => he) : []} /> : (
        <>
          <div className="c-title">
            <div>
              <h1 className="c-h1">מתגים</h1>
              <p className="c-sub">לכבות ולהדליק בלחיצה. האפליקציה מקבלת את השינוי תוך שניות, והשרת תוך דקה.</p>
            </div>
          </div>
          {st.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את המתגים. {st.error}</Card>}
          {st.loading && !v && <p className="c-soft">טוען…</p>}
          {v && <Body v={v} busy={busy} flip={flip} saveText={saveText} />}
        </>
      )}
      {ask && v && (
        <AskSheet key={ask.k + ask.to} k={ask.k} to={ask.to} wide={wide} text0={v.switches.maintenanceText} withReason={!!v.history} onClose={close}
          onConfirm={async (text, reason) => {
            const withText = ask.k === 'maintenance' && ask.to && text.trim() !== v.switches.maintenanceText;
            // a refused change keeps the question open, with what was typed
            if (await set({ [ask.k]: ask.to, ...(withText ? { maintenanceText: text } : {}) }, undefined, reason)) close();
          }} />
      )}
    </>
  );
}

/** The question before a switch changes: what will happen, the maintenance screen's message, and (optional) why. */
function AskSheet({ k, to, wide, text0, withReason, onClose, onConfirm }: { k: Key; to: boolean; wide: boolean; text0: string; withReason: boolean; onClose: () => void; onConfirm: (text: string, reason: string) => Promise<void> }) {
  const q = question(k, to, wide);
  const [text, setText] = useState(text0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(text, reason); } finally { if (alive.current) setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={q.title} sub={q.text} className="k-confirm">
      {k === 'maintenance' && to && (wide
        ? <Input label="ההודעה במסך התחזוקה" value={text} onChange={(x) => setText(x.slice(0, 300))} placeholder={MAINTENANCE_PLACEHOLDER} multiline />
        : <Field label="ההודעה במסך התחזוקה" value={text} onChange={(e) => setText(e.target.value)} placeholder={MAINTENANCE_PLACEHOLDER} maxLength={300} />)}
      {withReason && (wide
        ? <Input label="למה (לא חובה)" value={reason} onChange={(x) => setReason(x.slice(0, 120))} />
        : <Field label="למה (לא חובה)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />)}
      <div className="k-confirm__actions">
        {q.risky ? <button type="button" className="k-confirm__go" disabled={busy} onClick={go}>{q.go}</button> : <Button variant="primary" size="lg" block disabled={busy} onClick={go}>{q.go}</Button>}
        <button type="button" className="k-confirm__cancel" disabled={busy} onClick={onClose}>חזרה</button>
      </div>
    </Sheet>
  );
}

function Body({ v, busy, flip, saveText }: { v: SwitchesView; busy: boolean; flip: (k: Key, on: boolean) => void; saveText: (text: string) => void }) {
  const s = v.switches;
  const on = ON_NOW.filter(([k]) => s[k]).map(([, he]) => he);
  const [text, setText] = useState(s.maintenanceText);
  useEffect(() => setText(s.maintenanceText), [s.maintenanceText]);
  const changes = useChanges(v);
  const delivery = sendingSwitches(v);
  return (
    <>
      {on.length > 0 && <Card pad="md" className="c-warn"><b>דלוק עכשיו:</b> {on.join(' · ')}. כל בוקר תגיע תזכורת עד שזה יכובה.</Card>}
      <Section title="מה אנשים רואים באפליקציה">
        <ListCard>
          <Row className="dn-prow" title="מצב תחזוקה" meta="כולם חוץ מהבעלים רואים מסך תחזוקה" value={<Toggle checked={s.maintenance} onChange={(x) => flip('maintenance', x)} label="מצב תחזוקה" disabled={busy} />} />
          <Row className="dn-prow" title="הרשמה פתוחה" meta="קובע אם אנשים בלי חשבון יכולים להירשם דרך האפליקציה." value={<Toggle checked={!s.registrationClosed} onChange={(x) => flip('registrationClosed', !x)} label="הרשמה פתוחה" disabled={busy} />} />
          <Row className="dn-prow" title="קריאה בלבד (חירום)" meta="בגרסה העדכנית של האפליקציה רק הבעלים יכולים לשנות. מפתחות יכולים רק לקרוא." value={<Toggle checked={s.readOnly} onChange={(x) => flip('readOnly', x)} label="קריאה בלבד" disabled={busy} />} />
        </ListCard>
        {s.maintenance && (
          <Card pad="lg" className="c-stack c-stack--sm">
            <Field label="ההודעה במסך התחזוקה" value={text} onChange={(e) => setText(e.target.value)} placeholder={MAINTENANCE_PLACEHOLDER} maxLength={300} />
            <div><Button variant="neutral" disabled={busy || text.trim() === s.maintenanceText} onClick={() => saveText(text)}>שמירת ההודעה</Button></div>
          </Card>
        )}
      </Section>
      <Section title="שליחה">
        <ListCard>
          <Row className="dn-prow" title="מיילים על תשלומים" meta={delivery.email.text}
            value={<Toggle checked={delivery.email.on} onChange={(x) => flip('emailPaused', !x)} label="מיילים על תשלומים" disabled={busy || delivery.email.blocked} />} />
          <Row className="dn-prow" title="התראות לטלפון" meta={delivery.push.text}
            value={<Toggle checked={delivery.push.on} onChange={(x) => flip('pushPaused', !x)} label="התראות לטלפון" disabled={busy || delivery.push.blocked} />} />
          {s.broadcastEmailPaused !== undefined && <Row className="dn-prow" title="הודעות במייל לנרשמים" meta={delivery.broadcast.text}
            value={<Toggle checked={delivery.broadcast.on} onChange={(x) => flip('broadcastEmailPaused', !x)} label="הודעות במייל לנרשמים" disabled={busy || delivery.broadcast.blocked} />} />}
        </ListCard>
      </Section>
      <Section title="מפתחות API">
        <ListCard>
          <Row className="dn-prow" title="כל המפתחות פעילים" meta="קובע אם מפתחות, כולל אינסטינקט, יכולים להתחבר. אפשר להמשיך לעבוד במסך הניהול." value={<Toggle checked={!s.keysStopped} onChange={(x) => flip('keysStopped', !x)} label="כל המפתחות פעילים" disabled={busy} />} />
        </ListCard>
        <p className="c-note">במצב קריאה בלבד המפתחות עדיין יכולים לקרוא, אבל לא לשנות. מפתח אחד עוצרים במסך מפתחות API.</p>
      </Section>
      {!!changes.list?.length && (
        <Section title="שינויים אחרונים במתגים">
          <ListCard>{changes.list.map((c) => <Row key={c.id} className="dn-prow" title={changeText(c)} meta={`${c.by} · ${changeWhen(c)}${c.reason ? ` · ${c.reason}` : ''}`} />)}</ListCard>
        </Section>
      )}
      {s.updatedBy && <p className="c-note">שונה לאחרונה על ידי {s.updatedBy}, {ago(s.updatedAt)}.</p>}
    </>
  );
}
