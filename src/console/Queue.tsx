// תור שליחה: payment emails and phone pushes that wait or failed, with send again / don't send (asks first: it cannot be
// undone), what went out lately, the message itself, and the payment email as a guest gets it. Addresses never show in
// the list: only the name on the payment. The computer's page: desk/QueueDesk.tsx.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, ConfirmSheet, EmptyState, ListCard, Row, Sheet, Strip, Tag } from '../app/v2/kit';
import { ago, fmt, QRow, Section, useLoad } from './shared';
import { errorText, source, type QueueEmail, type QueuePush } from './source';
import { Dialog, Failed, Skeleton } from './desk/desk';
import { setFailedMails } from './desk/counts';
import { useRest, useWide } from './desk/route';
import { KIND, LineDetail, lineSub, lineTitle, lineWhen, PUSH_KIND, QueueDesk, queueLines, useMail, whyText, type QLine } from './desk/QueueDesk';

export function QueueScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const wide = useWide();
  const q = useLoad(() => source.queue());
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [drop, setDrop] = useState<{ kind: 'email'; e: QueueEmail } | { kind: 'push'; p: QueuePush } | null>(null);
  const [again, setAgain] = useState<QueueEmail | null>(null);
  const [open, setOpen] = useState<QLine | null>(null);
  const closeSheet = useCallback(() => setOpen(null), []);
  const act = async (id: string, run: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try { await run(); notify(done); await q.reload(); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(null); }
  };
  const retry = (e: QueueEmail) => act(e.id, () => source.emailAction(e.id, 'retry', e.updateTime), 'נכנס לתור, יישלח בסבב הבא (עד 5 דקות)');
  const d = q.data;
  // the sidebar's red count follows the queue
  useEffect(() => { if (d) setFailedMails(d.emails.filter((e) => e.status === 'failed').length); }, [d]);
  const lines = d ? queueLines(d) : [];
  const lineOf = (id: string) => lines.find((l) => l.key === id) || null;
  // a link to one line (#/queue/<id>) opens it on a phone too, once the queue is here
  const linked = useRef(useRest('queue')[0][0] || null);
  useEffect(() => {
    if (!d) return;
    if (linked.current && !wide) setOpen(queueLines(d).find((l) => l.key === linked.current) || null);
    linked.current = null;
  }, [d, wide]);
  const closePreview = useCallback(() => setPreview(false), []);
  return (
    <>
      {wide ? (
        <QueueDesk d={d} error={q.error} loading={q.loading} reload={q.reload} busy={busy} retry={setAgain} preview={() => setPreview(true)}
          drop={(l) => setDrop(l.p ? { kind: 'push', p: l.p } : { kind: 'email', e: l.e! })} />
      ) : (
        <>
          <div className="c-title">
            <div>
              <h1 className="c-h1">תור שליחה</h1>
              <p className="c-sub">{d?.sent ? 'מיילים על תשלומים והתראות לטלפון שמחכים, שנכשלו ושנשלחו.' : 'מיילים על תשלומים והתראות לטלפון שעוד מחכים, או שנכשלו. מה שנשלח בהצלחה לא מופיע כאן.'}</p>
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
                {d.daily && <p className="c-note">המכסה היומית של המייל: {fmt(d.daily.used)} מתוך {fmt(d.daily.limit)}</p>}
                {d.emails.length ? <ListCard>{d.emails.map((e) => <EmailRow key={e.id} e={e} busy={busy === e.id} open={() => setOpen(lineOf(e.id))}
                  retry={() => retry(e)}
                  cancel={() => setDrop({ kind: 'email', e })} />)}</ListCard>
                  : <EmptyState variant="card" icon="check" title="אין מיילים שמחכים או נכשלו" text="כל מייל על תשלום יוצא תוך כמה דקות." />}
              </Section>
              <Section title={`התראות לטלפון · ${d.pushes.length}`}>
                {d.pushes.length ? <ListCard>{d.pushes.map((p) => <PushRow key={p.id} p={p} busy={busy === p.id}
                  cancel={() => setDrop({ kind: 'push', p })} />)}</ListCard>
                  : <EmptyState variant="card" icon="check" title="אין התראות שמחכות" text="התראות לטלפון יוצאות בסבב של כל 5 דקות." />}
              </Section>
              {d.sent && (
                <Section title={`נשלחו לאחרונה${d.sentToday !== undefined ? ` · ${fmt(d.sentToday)} היום` : ''}`}>
                  {d.sent.length ? <ListCard>{lines.filter((l) => l.state === 'sent').map((l) => <Row key={l.key} className="dn-prow" title={l.what} meta={`${l.type === 'email' ? 'מייל' : 'התראה'} · ${l.who} · ${lineWhen(l)}`} onClick={() => setOpen(l)} />)}</ListCard>
                    : <p className="c-note">עוד לא נשלח כלום.</p>}
                </Section>
              )}
              <Section title="המייל שאורחים מקבלים">
                {preview ? <Preview /> : <Button variant="neutral" onClick={() => setPreview(true)}>הצגת המייל</Button>}
              </Section>
            </div>
          )}
          {open && <LineSheet l={open} onClose={closeSheet} />}
        </>
      )}
      {wide && <Dialog open={preview} onClose={closePreview} title="תבנית המייל" sub="כך אורח מקבל את המייל על תשלום">{preview && <Preview bare />}</Dialog>}
      {again && (
        <ConfirmSheet open tone="primary" cancelLabel="חזרה" onClose={() => setAgain(null)} title={`לשלוח שוב את המייל ל${again.who || 'אורח'}?`}
          text={<>המייל נכנס לתור ויישלח בסבב הבא (עד 5 דקות).{again.reason === 'expired' ? ' לא ברור אם הניסיון הקודם הגיע, אז ייתכן שהאורח יקבל אותו פעמיים.' : again.reason === 'invalid_address' || again.reason === 'no_address' ? ' אם הכתובת לא תוקנה בכרטיס של האדם, הוא ייכשל שוב.' : ''}</>}
          confirmLabel="כן, לשלוח שוב" onConfirm={async () => { const e = again; setAgain(null); await retry(e); }} />
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

function EmailRow({ e, busy, retry, cancel, open }: { e: QueueEmail; busy: boolean; retry: () => void; cancel: () => void; open: () => void }) {
  const failed = e.status === 'failed';
  const meta = failed
    ? <>{whyText(e)} · {ago(e.updatedAt)}</>
    : <>{e.status === 'sending' ? 'בשליחה עכשיו' : 'יישלח בסבב הבא'} · נכנס לתור {ago(e.createdAt)}</>;
  return (
    <QRow title={<><b>{e.who || 'בלי שם'}</b> · {KIND[e.kind] || 'מייל'}</>} meta={meta} tag={failed ? <Tag tone="urgent">נכשל</Tag> : <Tag tone="neutral">מחכה</Tag>}>
      {failed && <Button variant="neutral" disabled={busy} onClick={retry}>שליחה שוב</Button>}
      {e.status !== 'sending' && <Button variant="quiet" disabled={busy} onClick={cancel}>לא לשלוח</Button>}
      <Button variant="quiet" onClick={open}>פרטים</Button>
    </QRow>
  );
}

function PushRow({ p, busy, cancel }: { p: QueuePush; busy: boolean; cancel: () => void }) {
  return (
    <QRow title={<><b>{p.title || 'התראה'}</b>{p.body ? ` · ${p.body}` : ''}</>}
      meta={<>{PUSH_KIND[p.kind] || 'התראה'} · {p.to === 1 ? 'לאדם אחד' : `ל־${p.to} אנשים`}{p.done ? `, נשלחה ל־${p.done}` : ''}{p.by ? ` · מאת ${p.by}` : ''} · {ago(p.createdAt)}</>}
      tag={p.stale ? <Tag tone="outline">ישנה מדי לטלפון</Tag> : <Tag tone="neutral">מחכה</Tag>}>
      <Button variant="quiet" disabled={busy} onClick={cancel}>לא לשלוח</Button>
    </QRow>
  );
}

/** The phone's version of the panel: the message and what happened to it. */
function LineSheet({ l, onClose }: { l: QLine; onClose: () => void }) {
  const [mail] = useMail(l);
  return <Sheet open onClose={onClose} title={lineTitle(l)} sub={lineSub(l)}><div className="dn-sheet"><LineDetail l={l} mail={mail} /></div></Sheet>;
}

/** The payment email with sample values. `bare`: inside the computer's window, without the phone's card. */
function Preview({ bare }: { bare?: boolean }) {
  const p = useLoad(() => source.emailPreview());
  if (p.error) return bare ? <Failed text={`לא הצלחנו להציג. ${p.error}`} retry={p.reload} /> : <Card pad="md" className="c-error">לא הצלחנו להציג. {p.error}</Card>;
  if (!p.data) return bare ? <Skeleton lines={6} /> : <p className="c-soft">טוען…</p>;
  const v = p.data;
  const body = (
    <>
      <dl className="c-mailhead">
        <div><dt>מאת</dt><dd>{v.from}</dd></div>
        <div><dt>נושא</dt><dd>{v.subject}</dd></div>
      </dl>
      <iframe className="c-mail" title="המייל כפי שאורח מקבל" sandbox="" srcDoc={v.html} />
      <p className="c-note">{v.custom ? 'זה הנוסח ששמרתם.' : 'זה הנוסח הרגיל.'} השם, הסכום והפרטים כאן לדוגמה. את הנוסח משנים באפליקציה: ניהול ← הגדרות ← הודעות.</p>
    </>
  );
  return bare ? <div className="dn-preview">{body}</div> : <Card pad="lg" className="c-stack c-stack--sm">{body}</Card>;
}
