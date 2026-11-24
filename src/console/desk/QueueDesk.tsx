// תור שליחה on a computer (K11): one table for mail and push, and beside it the chosen one: why it failed, the message
// itself, send again / do not send. The words and the message's details are shared with the phone screen (Queue.tsx).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { daysFromToday, dayTime, hhmm } from '../../app/v2/format';
import { ago, fmt } from '../shared';
import { errorText, source, type Queue, type QueueEmail, type QueueEmailView, type QueuePush, type QueueSent } from '../source';
import { Act, Btn, Chips, Cols, DTag, EmptyPanel, Fact, Facts, Failed, LoadingPanel, Ltr, Notice, Page, Panel, Skeleton, Table, TableCard, Toolbar, type Column, type TagTone } from './desk';
import { toTab, useSelected } from './route';

export const KIND: Record<string, string> = { order: 'כרטיסים', donation: 'תרומה', tab: 'חשבון דוכן', broadcast: 'הודעה במייל' };
export const PUSH_KIND: Record<string, string> = { broadcast: 'הודעה לכולם', task: 'משימה', urgent: 'דחוף', trip: 'נסיעה', event: 'אירוע', vendor: 'דוכנים', system: 'מערכת' };
/** Why a mail failed (api/src/email.ts), in plain words: what happened, and what to do about it. */
const WHY: Record<string, [string, string?]> = {
  expired: ['לא ברור אם נשלח (ניסיון שנקטע)', 'לפני שליחה שוב כדאי לבדוק עם האורח'],
  invalid_address: ['הכתובת לא תקינה', 'כדאי לבדוק את הכתובת בכרטיס של האדם'],
  no_address: ['אין כתובת מייל', 'אפשר להוסיף כתובת בכרטיס של האדם'],
  rejected: ['שירות המייל דחה את המייל', 'כדאי לבדוק את הכתובת בכרטיס של האדם'],
  rate_limited: ['יותר מדי מיילים בבת אחת'], quota: ['נגמרה המכסה היומית של שירות המייל', 'מחר אפשר לשלוח שוב'],
  auth: ['בעיה במפתח של שירות המייל'], provider_auth: ['בעיה במפתח של שירות המייל'],
  unavailable: ['שירות המייל לא זמין'], provider_error: ['שירות המייל לא זמין'], provider_unreachable: ['שירות המייל לא ענה'], provider_busy: ['שירות המייל עסוק'],
};
const ADDRESS = new Set(['invalid_address', 'no_address', 'rejected']);
/** A technical (English) sentence stays off the screen. */
const hebrew = (s: string) => (s && !/[A-Za-z]/.test(s) ? s.replace(/[.\s]+$/, '') : '');
export const whyText = (e: QueueEmail) => { const w = WHY[e.reason]; return w ? w.join('. ') : hebrew(e.error) || 'נכשל'; };
const TIMES = ['', 'פעם אחת', 'פעמיים', 'שלוש פעמים', 'ארבע פעמים', 'חמש פעמים', 'שש פעמים', 'שבע פעמים', 'שמונה פעמים', 'תשע פעמים', 'עשר פעמים'];
const times = (n: number) => TIMES[n] ?? `${fmt(n)} פעמים`;

// ---------- one line of the table ----------
export type QLine = {
  key: string; type: 'email' | 'push'; state: 'failed' | 'waiting' | 'sent'; who: string; what: string; tag: string; tone: TagTone; tries: number; at: string; today: boolean;
  /** A sent push to one person: the day's routine, shown under נשלחו and not between the mails. */
  routine: boolean; e?: QueueEmail; p?: QueuePush; s?: QueueSent;
};
const emailWhat = (e: QueueEmail, amount?: number | null) => (e.kind === 'broadcast' ? KIND.broadcast : `אישור תשלום${KIND[e.kind] ? ` · ${KIND[e.kind]}` : ''}${e.kind === 'donation' && amount ? ` ${fmt(amount)} ₪` : ''}`);
const pushWho = (p: { to: number; kind: string }) => (p.to === 1 ? 'אדם אחד' : `${fmt(p.to)} ${p.kind === 'broadcast' ? 'אנשי צוות' : 'אנשים'}`);
export function queueLines(d: Queue, amounts: Record<string, number | null> = {}): QLine[] {
  const byAt = (a: QLine, b: QLine) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  const emails = d.emails.map((e): QLine => {
    const failed = e.status === 'failed';
    return { key: e.id, type: 'email', state: failed ? 'failed' : 'waiting', who: e.who || 'בלי שם', what: emailWhat(e, amounts[e.id]), tag: failed ? 'נכשל' : e.status === 'sending' ? 'בשליחה' : 'מחכה', tone: failed ? 'red' : 'neutral', tries: e.attempts, at: failed ? e.updatedAt : e.createdAt, today: false, routine: false, e };
  });
  const pushes = d.pushes.map((p): QLine => ({ key: p.id, type: 'push', state: 'waiting', who: pushWho(p), what: p.title || 'התראה', tag: p.stale ? 'ישנה מדי' : 'מחכה', tone: p.stale ? 'amber' : 'neutral', tries: 0, at: p.createdAt, today: false, routine: false, p }));
  const sent = (d.sent || []).map((s): QLine => ({
    key: s.id, type: s.type, state: 'sent', who: s.type === 'push' ? (s.who && s.to > 1 ? `${s.who} · ${fmt(s.to)}` : s.who || pushWho(s)) : s.who || 'בלי שם',
    what: s.what || (s.type === 'push' ? PUSH_KIND[s.kind] || 'התראה' : KIND[s.kind] ? `אישור תשלום · ${KIND[s.kind]}` : 'מייל'), tag: 'נשלח', tone: 'green', tries: s.attempts, at: s.at, today: daysFromToday(s.at) === 0,
    routine: s.type === 'push' && s.to === 1, s,
  }));
  return [...emails.filter((x) => x.state === 'failed').sort(byAt), ...[...emails.filter((x) => x.state === 'waiting'), ...pushes].sort(byAt), ...sent.sort(byAt)];
}
export const lineWhen = (l: QLine) => (l.state === 'sent' ? dayTime(l.at) : ago(l.at));
export const lineTitle = (l: QLine) => (l.type === 'push' ? l.what : `${l.what.split(' · ')[0]}${l.e?.who || l.s?.who ? ` ל${l.e?.who || l.s?.who}` : ''}`);
export function lineSub(l: QLine) {
  if (l.type === 'push') return l.state === 'sent' ? `התראה · נשלחה ${dayTime(l.at)}` : `התראה · ${l.p!.stale ? 'ישנה מדי לטלפון' : l.p!.done ? `נשלחה ל־${fmt(l.p!.done)} מתוך ${fmt(l.p!.to)}` : 'תישלח בסבב הבא'}`;
  if (l.state === 'failed') return l.tries ? `מייל · נכשל ${times(l.tries)}` : 'מייל · נכשל';
  if (l.state === 'sent') return `מייל · נשלח ${dayTime(l.at)}`;
  return `מייל · ${l.e!.status === 'sending' ? 'בשליחה עכשיו' : 'יישלח בסבב הבא'}`;
}

// ---------- the mail itself ----------
export type MailState = { view: QueueEmailView | null; loading: boolean; error: string | null; retry: () => void };
/** The chosen mail as the guest gets it. Asked for once per mail (and again when it changed), a moment after the choice,
 *  so running down the list with the arrow keys asks only for the one it stops on. */
export function useMail(l: QLine | null): [MailState, Record<string, number | null>] {
  const id = l?.type === 'email' ? l.key : null;
  const key = id ? `${id} ${l!.e?.updateTime || ''}` : null;
  const [views, setViews] = useState<Record<string, QueueEmailView | null>>({});
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const [n, setN] = useState(0);
  const have = !!key && key in views;
  useEffect(() => {
    if (!key || !id || have) return;
    let off = false;
    setError(null);
    const t = setTimeout(() => source.queueEmail(id)
      .then((v) => { if (!off) setViews((x) => ({ ...x, [key]: v })); })
      .catch((e) => { if (!off) setError({ key, text: errorText(e) }); }), 150);
    return () => { off = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, have, n]);
  const amounts = useMemo(() => Object.fromEntries(Object.entries(views).map(([k, v]) => [k.split(' ')[0], v?.amount ?? null])), [views]);
  const err = key && error?.key === key ? error.text : null;
  return [{ view: key ? views[key] ?? null : null, loading: !!key && !have && !err, error: err, retry: () => setN((x) => x + 1) }, amounts];
}

/** What the panel (and the phone's sheet) says about one line, without its title and actions. */
export function LineDetail({ l, mail }: { l: QLine; mail: MailState }) {
  const { e, p, s } = l;
  const v = mail.view;
  if (p) return (
    <>
      {p.stale && <Notice icon="bell"><b>ישנה מדי לטלפון.</b> ההתראה חיכתה יותר מ־6 שעות, ולכן לא תישלח. באפליקציה היא נמצאת.</Notice>}
      <Facts style={p.stale ? { marginTop: 6 } : undefined}>
        <Fact label="אל">{pushWho(p)}</Fact>
        {p.done > 0 && <Fact label="כבר נשלחה">{p.done === 1 ? 'לאדם אחד' : `ל־${fmt(p.done)} אנשים`}</Fact>}
        <Fact label="סוג">{PUSH_KIND[p.kind] || 'התראה'}</Fact>
        {p.by && <Fact label="מאת">{p.by}</Fact>}
        <Fact label="נוצרה">{dayTime(p.createdAt)}</Fact>
      </Facts>
      <div className="dn-mail"><b>{p.title || 'התראה'}</b>{p.body && <p>{p.body}</p>}</div>
    </>
  );
  if (s && s.type === 'push') return (
    <>
      <Facts>
        <Fact label="אל">{s.who ? `${s.who}${s.to > 1 ? `, ${fmt(s.to)} אנשים` : ''}` : pushWho(s)}</Fact>
        <Fact label="סוג">{PUSH_KIND[s.kind] || 'התראה'}</Fact>
        <Fact label="נשלחה">{dayTime(s.at)}</Fact>
      </Facts>
      <div className="dn-mail"><b>{s.what || 'התראה'}</b></div>
    </>
  );
  const why = e?.status === 'failed' ? WHY[e.reason] : undefined;
  const said = e?.status === 'failed' ? hebrew(v?.providerSaid || '') || hebrew(e.error) : '';
  const created = v?.createdAt || e?.createdAt;
  const tried = e && e.attempts > 0 ? v?.lastAttemptAt || e.updatedAt : null;
  return (
    <>
      {e?.status === 'failed' && <Notice tone="red" icon="mail"><b>{why ? why[0] : 'המייל לא נשלח'}.</b>{said && said !== why?.[0] ? ` שירות המייל החזיר: ${said}.` : ''}{why?.[1] ? ` ${why[1]}.` : ''}</Notice>}
      <Facts style={e?.status === 'failed' ? { marginTop: 6 } : undefined}>
        {mail.loading ? <Fact label="אל"><span className="d-skel" style={{ width: 160, marginTop: 3 }} /></Fact> : v?.to ? <Fact label="אל"><Ltr>{v.to}</Ltr></Fact> : <Fact label="אל">{l.who}</Fact>}
        {created && <Fact label="נוצר">{dayTime(created)}{v?.by ? ` · אחרי אישור תשלום של ${v.by}` : ''}</Fact>}
        {tried && <Fact label="ניסיון אחרון">{ago(tried)}</Fact>}
        {e && e.status === 'queued' && e.attempts > 0 && e.nextAt && <Fact label="ניסיון הבא">{hhmm(e.nextAt)}</Fact>}
        {s && <Fact label="נשלח">{dayTime(s.at)}</Fact>}
      </Facts>
      {mail.loading ? <div className="dn-mail"><Skeleton lines={3} /></div>
        : mail.error ? <Failed text={`לא הצלחנו להציג את המייל. ${mail.error}`} retry={mail.retry} />
        : v && (v.subject || v.text) ? <div className="dn-mail"><b>{v.subject}</b><p>{v.text}</p></div> : null}
      {v?.uid && <div className="dn-card"><Act href={toTab('people', v.uid)}>{e && ADDRESS.has(e.reason) ? 'לכרטיס של האדם, לתקן את הכתובת' : 'לכרטיס של האדם'}</Act></div>}
    </>
  );
}

// ---------- the page ----------
type State = 'all' | 'failed' | 'waiting' | 'sent';
const NONE: Record<State, string> = {
  all: 'אין מיילים או התראות שמחכים או נכשלו. כל מייל על תשלום יוצא תוך כמה דקות.',
  failed: 'שום דבר לא נכשל.', waiting: 'שום דבר לא מחכה. מיילים והתראות יוצאים בסבב של כל 5 דקות.', sent: 'היום עוד לא נשלח כלום.',
};
export function QueueDesk({ d, error, loading, reload, busy, retry, drop, preview }: {
  d: Queue | null; error: string | null; loading: boolean; reload: () => void; busy: string | null;
  retry: (e: QueueEmail) => void; drop: (l: QLine) => void; preview: () => void;
}) {
  const [state, setState] = useState<State>('all');
  const [type, setType] = useState<'' | 'email' | 'push'>('');
  // the amount of a donation is known only from the mail itself, so it joins the table once that mail was opened
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const all = useMemo(() => (d ? queueLines(d, amounts) : null), [d, amounts]);
  const hidden = !!all && state === 'all' && !type ? all.filter((l) => l.routine).length : 0;
  const rows = all && all.filter((l) => (!type || l.type === type) && (state === 'all' ? !(hidden && l.routine) : state === 'sent' ? l.state === 'sent' && l.today : l.state === state));
  const [sel, select] = useSelected('queue', rows ? rows.map((l) => l.key) : []);
  const l = rows?.find((x) => x.key === sel) || null;
  const [mail, known] = useMail(l);
  useEffect(() => setAmounts(known), [known]);
  const count = (s: QLine['state']) => all?.filter((x) => x.state === s).length ?? 0;
  const states: { value: State; label: ReactNode }[] = [
    { value: 'all', label: 'הכל' },
    { value: 'failed', label: d ? `נכשלו · ${fmt(count('failed'))}` : 'נכשלו' },
    { value: 'waiting', label: d ? `מחכים · ${fmt(count('waiting'))}` : 'מחכים' },
    ...(d?.sent ? [{ value: 'sent' as const, label: `נשלחו היום · ${fmt(d.sentToday ?? all!.filter((x) => x.state === 'sent' && x.today).length)}` }] : []),
  ];
  const columns: Column<QLine>[] = [
    { key: 'type', head: 'סוג', width: 114, soft: true, cell: (x) => (x.type === 'email' ? 'מייל' : 'התראה') },
    { key: 'who', head: 'למי', width: 194, strong: true, cell: (x) => x.who },
    { key: 'what', head: 'על מה', cell: (x) => <span className="dn-what" title={x.what}>{x.what}</span> },
    { key: 'state', head: 'מצב', width: 114, cell: (x) => <DTag tone={x.tone}>{x.tag}</DTag> },
    { key: 'tries', head: 'ניסיונות', width: 104, align: 'end', cell: (x) => fmt(x.tries) },
    { key: 'when', head: 'מתי', width: 144, soft: true, cell: lineWhen },
  ];
  return (
    <Page group="שליחה ותזמון" title="תור שליחה" sub={d && !d.sent ? 'מיילים והתראות לטלפון שמחכים או שנכשלו' : 'מיילים והתראות לטלפון שמחכים, שנכשלו ושנשלחו'}
      actions={<><Btn icon="refresh" onClick={reload} disabled={loading}>רענון</Btn><Btn onClick={preview}>הצגת תבנית המייל</Btn></>}>
      <Toolbar end={d?.daily && <span className="dn-daily">המכסה היומית של המייל: {fmt(d.daily.used)} מתוך {fmt(d.daily.limit)}</span>}>
        <Chips label="מצב" options={states} value={state} onChange={setState} />
        <Chips label="סוג" options={[{ value: 'email', label: 'מיילים' }, { value: 'push', label: 'התראות' }]} value={type} onChange={(v) => setType(v === type ? '' : v)} />
      </Toolbar>
      {d?.switches.emailPaused && <div className="dn-fixed"><Notice icon="mail"><span>המיילים בהשהיה. תשלומים נכנסים לתור ונשלחים כשמדליקים. <Act href={toTab('switches')}>למתגים</Act></span></Notice></div>}
      {d?.switches.pushPaused && <div className="dn-fixed"><Notice icon="bell"><span>ההתראות לטלפון בהשהיה. <Act href={toTab('switches')}>למתגים</Act></span></Notice></div>}
      {d && !d.email.on && <div className="dn-fixed"><Notice icon="mail">המיילים כבויים בהגדרות השרת, אז כלום לא נשלח מכאן.</Notice></div>}
      <Cols>
        <div className="dn-queue"><TableCard>
          <Table label="תור שליחה" columns={columns} rows={rows} rowKey={(x) => x.key} selected={sel} onSelect={select} loading={loading}
            onEnter={(x) => { if (x.state === 'failed' && x.e && !busy) retry(x.e); }}
            error={error && `לא הצלחנו לקרוא את התור. ${error}`} retry={reload} empty={NONE[state]} />
          {hidden > 0 && <p className="dn-more"><Act onClick={() => setState('sent')}>{hidden === 1 ? 'ועוד התראה אחת לאדם אחד שנשלחה' : `ועוד ${fmt(hidden)} התראות לאדם אחד שנשלחו`}</Act></p>}
        </TableCard></div>
        {!d && !error ? <LoadingPanel /> : !l ? <EmptyPanel>{rows?.length ? 'בחרו שורה כדי לראות את ההודעה.' : 'כאן תופיע ההודעה שתבחרו.'}</EmptyPanel> : (
          <Panel label="ההודעה שנבחרה" title={lineTitle(l)} sub={lineSub(l)}
            footer={l.state !== 'sent' && (l.p || l.e?.status !== 'sending') ? (
              <>
                {l.state === 'failed' && <Btn kind="primary" icon="refresh" disabled={busy === l.key} onClick={() => retry(l.e!)}>שליחה שוב</Btn>}
                <Btn disabled={busy === l.key} onClick={() => drop(l)}>לא לשלוח</Btn>
              </>
            ) : undefined}>
            <LineDetail l={l} mail={mail} />
          </Panel>
        )}
      </Cols>
    </Page>
  );
}
