// תור שליחה: payment emails and phone pushes that wait or failed, with send again / don't send (asks first: it cannot be
// undone), and the payment email as a guest gets it. Addresses never show here: only the name on the payment.
import { useState } from 'react';
import { Button, Card, ConfirmSheet, EmptyState, ListCard, Strip, Tag } from '../app/v2/kit';
import { ago, QRow, Section, useLoad } from './shared';
import { errorText, source, type QueueEmail, type QueuePush } from './source';

const KIND: Record<string, string> = { order: 'כרטיסים', donation: 'תרומה', tab: 'חשבון דוכן' };
const REASON: Record<string, string> = {
  expired: 'לא ברור אם נשלח (ניסיון שנקטע). לפני שליחה שוב כדאי לבדוק עם האורח',
  invalid_address: 'הכתובת לא תקינה', no_address: 'אין כתובת מייל', rate_limited: 'יותר מדי מיילים בבת אחת',
  quota: 'נגמרה המכסה היומית של שירות המייל', auth: 'בעיה במפתח של שירות המייל', unavailable: 'שירות המייל לא זמין',
};
const PUSH_KIND: Record<string, string> = { broadcast: 'הודעה לכולם', task: 'משימה', urgent: 'דחוף', trip: 'נסיעה', event: 'אירוע', vendor: 'דוכנים', system: 'מערכת' };

export function QueueScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const q = useLoad(() => source.queue());
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [drop, setDrop] = useState<{ kind: 'email'; e: QueueEmail } | { kind: 'push'; p: QueuePush } | null>(null);
  const act = async (id: string, run: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try { await run(); notify(done); await q.reload(); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(null); }
  };
  const d = q.data;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">תור שליחה</h1>
          <p className="c-sub">מיילים על תשלומים והתראות לטלפון שעוד מחכים, או שנכשלו. מה שנשלח בהצלחה לא מופיע כאן.</p>
        </div>
        <Button variant="neutral" onClick={() => q.reload()} disabled={q.loading}>רענון</Button>
      </div>
      {q.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את התור. {q.error}</Card>}
      {q.loading && !d && <p className="c-soft">טוען…</p>}
      {d && (
        <div className={q.loading ? 'c-stack c-loading' : 'c-stack'}>
          {d.switches.emailPaused && <Strip icon="bolt">המיילים בהשהיה (במסך מתגים). תשלומים נכנסים לתור ונשלחים כשמדליקים.</Strip>}
          {d.switches.pushPaused && <Strip icon="bolt">ההתראות לטלפון בהשהיה (במסך מתגים).</Strip>}
          <Section title={`מיילים על תשלומים · ${d.emails.length}`}>
            {!d.email.on && <p className="c-note">המיילים כבויים בהגדרות השרת, אז כלום לא נשלח מכאן.</p>}
            {d.emails.length ? <ListCard>{d.emails.map((e) => <EmailRow key={e.id} e={e} busy={busy === e.id}
              retry={() => act(e.id, () => source.emailAction(e.id, 'retry', e.updateTime), 'נכנס לתור, יישלח בסבב הבא (עד 5 דקות)')}
              cancel={() => setDrop({ kind: 'email', e })} />)}</ListCard>
              : <EmptyState variant="card" icon="check" title="אין מיילים שמחכים או נכשלו" text="כל מייל על תשלום יוצא תוך כמה דקות." />}
          </Section>
          <Section title={`התראות לטלפון · ${d.pushes.length}`}>
            {d.pushes.length ? <ListCard>{d.pushes.map((p) => <PushRow key={p.id} p={p} busy={busy === p.id}
              cancel={() => setDrop({ kind: 'push', p })} />)}</ListCard>
              : <EmptyState variant="card" icon="check" title="אין התראות שמחכות" text="התראות לטלפון יוצאות בסבב של כל 5 דקות." />}
          </Section>
          <Section title="המייל שאורחים מקבלים">
            {preview ? <Preview /> : <Button variant="neutral" onClick={() => setPreview(true)}>הצגת המייל</Button>}
          </Section>
        </div>
      )}
      {drop && (
        <ConfirmSheet open cancelLabel="חזרה" onClose={() => setDrop(null)}
          title={drop.kind === 'email' ? `לא לשלוח את המייל ל${drop.e.who || 'אורח'}?` : 'לא לשלוח את ההתראה לטלפון?'}
          text={drop.kind === 'email' ? 'המייל יוצא מהתור ולא יישלח. אי אפשר להחזיר אותו לתור מכאן.' : 'מי שעוד לא קיבל את ההתראה לא יקבל אותה בטלפון. ההתראה בתוך האפליקציה נשארת.'}
          confirmLabel="כן, לא לשלוח"
          onConfirm={async () => {
            const x = drop;
            setDrop(null);
            if (x.kind === 'email') await act(x.e.id, () => source.emailAction(x.e.id, 'cancel', x.e.updateTime), 'המייל לא יישלח');
            else await act(x.p.id, () => source.cancelPush(x.p.id, x.p.updateTime), 'ההתראה לא תישלח לטלפון. ההתראה באפליקציה נשארת');
          }} />
      )}
    </>
  );
}

function EmailRow({ e, busy, retry, cancel }: { e: QueueEmail; busy: boolean; retry: () => void; cancel: () => void }) {
  const failed = e.status === 'failed';
  const meta = failed
    ? <>{REASON[e.reason] || e.error || 'נכשל'} · {ago(e.updatedAt)}</>
    : <>{e.status === 'sending' ? 'בשליחה עכשיו' : 'יישלח בסבב הבא'} · נכנס לתור {ago(e.createdAt)}</>;
  return (
    <QRow title={<><b>{e.who || 'בלי שם'}</b> · {KIND[e.kind] || e.kind}</>} meta={meta} tag={failed ? <Tag tone="urgent">נכשל</Tag> : <Tag tone="neutral">מחכה</Tag>}>
      {failed && <Button variant="neutral" disabled={busy} onClick={retry}>שליחה שוב</Button>}
      {e.status !== 'sending' && <Button variant="quiet" disabled={busy} onClick={cancel}>לא לשלוח</Button>}
    </QRow>
  );
}

function PushRow({ p, busy, cancel }: { p: QueuePush; busy: boolean; cancel: () => void }) {
  return (
    <QRow title={<><b>{p.title || 'התראה'}</b>{p.body ? ` · ${p.body}` : ''}</>}
      meta={<>{PUSH_KIND[p.kind] || p.kind} · {p.to === 1 ? 'לאדם אחד' : `ל־${p.to} אנשים`}{p.done ? `, נשלחה ל־${p.done}` : ''}{p.by ? ` · מאת ${p.by}` : ''} · {ago(p.createdAt)}</>}
      tag={p.stale ? <Tag tone="outline">ישנה מדי לטלפון</Tag> : <Tag tone="neutral">מחכה</Tag>}>
      <Button variant="quiet" disabled={busy} onClick={cancel}>לא לשלוח</Button>
    </QRow>
  );
}

function Preview() {
  const p = useLoad(() => source.emailPreview());
  if (p.error) return <Card pad="md" className="c-error">לא הצלחנו להציג. {p.error}</Card>;
  if (!p.data) return <p className="c-soft">טוען…</p>;
  const v = p.data;
  return (
    <Card pad="lg" className="c-stack c-stack--sm">
      <dl className="c-mailhead">
        <div><dt>מאת</dt><dd>{v.from}</dd></div>
        <div><dt>נושא</dt><dd>{v.subject}</dd></div>
      </dl>
      <iframe className="c-mail" title="המייל כפי שאורח מקבל" sandbox="" srcDoc={v.html} />
      <p className="c-note">{v.custom ? 'זה הנוסח ששמרתם.' : 'זה הנוסח הרגיל.'} השם, הסכום והפרטים כאן לדוגמה. את הנוסח משנים באפליקציה: ניהול ← הגדרות ← הודעות.</p>
    </Card>
  );
}
