// Manager: visits, donations, calendar, reports, activity feed, settings.
import { Fragment, useMemo, useState } from 'react';
import type { Visit, Donation, CalendarItem, Settings, RegistrationField, AppNotification } from '../types';
import { PAYMENT_LABELS, VISIT_LABELS, KIND_LABELS, ROLE_LABELS, DEFAULT_SETTINGS, type ActivityKind } from '../types';
import type { TeamCtx } from '../ctx';
import { A, useDesktop, useToast, fmtDate, fmtTime, fmtDayLong, fmtWeekday, fmtMonthYear, firstName, relTime, whenText, todayISO, addDays, dateKey, money, dayLabel } from '../ui';
import { Head, Sect, Tabs, Btn, Form, Field, Seg, Tick, Empty, useSticky, deferDelete } from '../kit';
import { back, navigate, param } from '../router';
import { useDoc } from '../db';
import { usePerson, usePeople, useHistoryTasks, useOpenTasks } from '../store';
import { decideVisit, useVisit, useVisits, useDonation, setDonation, useDonations, useCalendar, saveCalendarItem, deleteCalendarItem, saveSettingsPart, useOpenTickets, useOpenTabs, useAllEvents, fillTemplate, waLink, telLink, handleNotification, handleNotificationsFor, useNotifications } from '../data';
import { useActivityFor, useActivityByKind, ACTION_LABELS } from '../activity';
import { Line, St, Loading, dayOf, fullDate, hit, asPhone, exportCsv, rowKeys, isPaid } from './Manage';

const HistoryLog = ({ items, first }: { items: { id: string; action: string; by: { name: string }; at: string; text?: string }[]; first: { text: string; at: string } }) => (
  <><Sect title="מה קרה כאן" /><ul className="r-log">{items.map((a) => <li key={a.id}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}<span>{whenText(a.at)}</span></li>)}<li>{first.text}<span>{whenText(first.at)}</span></li></ul></>
);

// ---------- visits ----------
type VTab = 'new' | 'coming' | 'past' | 'off' | 'all';
/** The time is kept at the start of the note ("10:00 · נפגשים בשער"), so the guest sees it and the calendar can use it. */
const splitNote = (s: string) => { const m = /^(\d{1,2}:\d{2})(?:\s*·\s*)?(.*)$/s.exec(s || ''); return m ? { time: m[1].padStart(5, '0'), text: m[2] } : { time: '', text: s || '' }; };
const joinNote = (time: string, text: string) => [time, text.trim()].filter(Boolean).join(' · ');
const inVTab = (v: Visit, t: VTab, today: string) => t === 'all' || (t === 'new' && v.status === 'new') || (t === 'coming' && v.status === 'approved' && v.date >= today) || (t === 'past' && v.status === 'approved' && v.date < today) || (t === 'off' && (v.status === 'rejected' || v.status === 'cancelled'));
const visitWord = (v: Visit, today: string) => v.status === 'new' ? <St tone="rust">{v.date < today ? 'חדשה · התאריך עבר' : `חדשה · ${relTime(v.createdAt)}`}</St> : v.status === 'approved' ? <St tone="ok">אושר{splitNote(v.managerNote).time ? ` · ${splitNote(v.managerNote).time}` : ''}</St> : <St tone="soft">{VISIT_LABELS[v.status]}</St>;
export function VisitsScreen({ ctx, visits, selectedId }: { ctx: TeamCtx; visits: Visit[]; selectedId?: string }) {
  const desktop = useDesktop(); const today = todayISO(); const toast = useToast();
  const inbox = useNotifications(true);
  const [saved, setTab] = useSticky<VTab | ''>('visits-tab', '');
  const tab: VTab = saved || (visits.some((v) => v.status === 'new') ? 'new' : 'coming'); // decided on every render, so a cold load lands on the new requests once they arrive
  const list = visits.filter((v) => inVTab(v, tab, today)).sort((a, b) => tab === 'new' || tab === 'all' ? b.createdAt.localeCompare(a.createdAt) : tab === 'coming' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const n = (t: VTab) => visits.filter((v) => inVTab(v, t, today)).length;
  const approve = (v: Visit) => {
    const mine = inbox.items.filter((x) => x.refId === v.id);
    decideVisit(v, ctx.actor, 'approved', v.managerNote, splitNote(v.managerNote).time, inbox.items).then(() => toast({ text: `אושר ונכנס ליומן: ${v.name}`, actions: [{ label: 'ביטול', onClick: () => { decideVisit(v, ctx.actor, 'new', v.managerNote, '', mine).catch(() => {}); } }] }, 6000)).catch((e) => toast({ text: (e as Error).message || 'לא נשמר', kind: 'error' }));
  };
  const csv = () => exportCsv('ביקורים.csv', ['תאריך', 'מי', 'טלפון', 'אנשים', 'סוג', 'מצב', 'בקשת האורח', 'הערת מנהל', 'טיפל/ה', 'הוגש'], list.map((v) => [fullDate(v.date), v.name, asPhone(v.phone), v.people, v.type, VISIT_LABELS[v.status], v.note, v.managerNote, v.handledBy?.name || '', fullDate(v.createdAt)]));
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="ביקורים" />
      <p className="rm-lead">בקשות מהאורחים. מתקשרים, קובעים שעה, מאשרים, וזה נכנס ליומן.</p>
      <div className="rm-tools" style={{ paddingTop: 10 }}><Btn small kind="quiet" to="/manage/settings/visit-types">סוגי ביקור</Btn><Btn small kind="quiet" onClick={csv}>ייצוא לאקסל ({list.length})</Btn></div>
      <Tabs label="אילו ביקורים" value={tab} onChange={setTab} items={[{ id: 'new', label: 'חדשות', n: n('new') }, { id: 'coming', label: 'מאושרים', n: n('coming') }, { id: 'past', label: 'היו', n: n('past') }, { id: 'off', label: 'לא יצאו לפועל', n: n('off') }, { id: 'all', label: 'הכל' }]} />
      {list.length === 0 ? <Empty title={tab === 'new' ? 'אין בקשות חדשות' : 'אין ביקורים כאלה'} />
        : desktop ? (
          <table className="r-table"><thead><tr><th>תאריך</th><th>מי</th><th>אנשים</th><th className="rm-opt">סוג</th><th className="rm-opt">טלפון</th><th>מצב</th><th /></tr></thead>
            <tbody>{list.map((v) => <tr key={v.id} className={v.id === selectedId ? 'sel' : ''} {...rowKeys(() => navigate(`/manage/visits/${v.id}`, false, true))}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtWeekday(v.date)} {fullDate(v.date)}</td><td><span className="r-t">{v.name}</span></td><td>{v.people}</td><td className="rm-opt">{v.type}</td><td className="rm-opt"><span className="rm-ltr">{v.phone}</span></td><td>{visitWord(v, today)}</td>
              <td className="r-end"><div className="rm-rowacts" onClick={(e) => e.stopPropagation()}>{v.status === 'new' && <Btn small onClick={() => approve(v)}>אישור ליומן</Btn>}<a className="r-btn ghost sm" href={telLink(v.phone)}>להתקשר</a></div></td>
            </tr>)}</tbody></table>
        ) : list.map((v) => <Line key={v.id} to={`/manage/visits/${v.id}`} title={`${v.name} · ${v.people} אנשים`} meta={<>{fmtWeekday(v.date)} {fmtDate(v.date)} · {v.type} · {visitWord(v, today)}</>} />)}
    </>
  );
}
export function VisitDetailScreen({ id, ctx }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: v, loading } = useVisit(id); const toast = useToast();
  const requester = usePerson(v?.uid || '', !!v?.uid);
  const sameDay = useCalendar(!!v, v?.date || '2000-01-01', v?.date || '2000-01-01');
  const log = useActivityFor('visit', id);
  const inbox = useNotifications(true);
  const [time, setTime] = useState<string | null>(null); const [text, setText] = useState<string | null>(null); const [askCancel, setAskCancel] = useState(false);
  if (loading) return <><Head backTo="/manage/visits" backLabel="ביקורים" title="" /><Loading /></>;
  if (!v) return <><Head backTo="/manage/visits" backLabel="ביקורים" title="הבקשה לא נמצאה" /><Empty title="ייתכן שנמחקה" /></>;
  const cur = splitNote(v.managerNote);
  const t = time ?? cur.time, x = text ?? cur.text; const note = joinNote(t, x);
  const dirty = note !== v.managerNote;
  const fail = (e: unknown) => toast({ text: (e as Error)?.message || 'לא נשמר', kind: 'error' });
  const decide = (status: Visit['status'], msg: string) => {
    const before = { status: v.status, note: v.managerNote }; const mine = inbox.items.filter((n) => n.refId === v.id);
    setAskCancel(false);
    decideVisit(v, ctx.actor, status, note, t, inbox.items).then(() => { setTime(null); setText(null); toast({ text: msg, actions: [{ label: 'ביטול', onClick: () => { decideVisit({ ...v, status, managerNote: note }, ctx.actor, before.status, before.note, splitNote(before.note).time, before.status === 'new' ? mine : []).catch(fail); } }] }, 7000); }).catch(fail);
  };
  const waText = fillTemplate(ctx.settings.templates.visitApproved, { 'שם': firstName(v.name), 'תאריך': fmtDayLong(v.date), 'שעה': t });
  const others = sameDay.items.filter((c) => c.refId !== v.id);
  return (
    <>
      <Head backTo="/manage/visits" backLabel="ביקורים" title={v.name} over={<>{fmtDayLong(v.date)} · {v.people} אנשים · {v.type}</>} />
      <p className="rm-pad">{visitWord(v, todayISO())}{v.handledBy && v.status !== 'new' ? <St tone="soft"> · {firstName(v.handledBy.name)}</St> : null}</p>
      {v.note && <blockquote className="rm-quote">{v.note}</blockquote>}
      <div className="r-actions"><a className="r-btn ghost sm" href={telLink(v.phone)}>להתקשר</a><a className="r-btn ghost sm" href={waLink(v.phone, v.status === 'approved' ? waText : '')} target="_blank" rel="noopener">{v.status === 'approved' ? 'להודיע בוואטסאפ שאושר' : 'וואטסאפ'}</a></div>
      {requester.item ? <div style={{ marginTop: 14 }}><Line to={`/manage/people/${requester.item.uid}`} title={requester.item.displayName} meta={<><span className="rm-ltr">{requester.item.phone}</span> · מספר {requester.item.customerNumber}</>} /></div>
        : <dl className="r-facts"><div><dt>טלפון</dt><dd><span className="rm-ltr">{v.phone}</span></dd></div></dl>}
      <Sect title="מה עוד ביומן באותו יום" n={others.length || undefined} />
      {others.length === 0 ? <p className="rm-lead">היום הזה פנוי.</p> : others.map((c) => <div key={c.id} className="rm-calrow"><div><span className="r-t">{c.title}</span><span className="r-m">{[c.time, c.kind === 'manual' ? firstName(c.ownerName) : c.kind === 'visit' ? 'ביקור' : 'אירוע'].filter(Boolean).join(' · ')}</span></div></div>)}
      <Form onSubmit={() => (v.status === 'approved' ? decide('approved', 'נשמר ועודכן ביומן') : decide('approved', `אושר ונכנס ליומן: ${v.name}`))}>
        <div className="rm-two">
          <Field label="באיזו שעה?" help="לא חובה. נכנס ליומן ולהודעה">{(i) => <input id={i} type="time" className="r-input" dir="ltr" value={t} onChange={(e) => setTime(e.target.value)} />}</Field>
          <span />
        </div>
        <Field label="הערה לאורח" help="האורח רואה אותה בחשבון שלו">{(i) => <input id={i} className="r-input" value={x} onChange={(e) => setText(e.target.value)} maxLength={1900} placeholder="נפגשים בשער, להביא כובע" />}</Field>
        {dirty && <span className="rm-dirty">יש שינוי שלא נשמר</span>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {v.status !== 'approved' && <Btn type="submit" style={{ flex: 1 }}>אישור ליומן</Btn>}
          {v.status === 'approved' && dirty && <Btn type="submit" style={{ flex: 1 }}>שמירת השינוי</Btn>}
          {(v.status === 'new') && <Btn kind="ghost" onClick={() => decide('rejected', 'סומן: לא מתאים')}>לא מתאים</Btn>}
          {v.status === 'approved' && !askCancel && <Btn kind="danger" onClick={() => setAskCancel(true)}>ביטול הביקור</Btn>}
        </div>
      </Form>
      {askCancel && <div className="rm-confirm" role="alertdialog" aria-label="אישור ביטול ביקור"><div><b>לבטל את הביקור של {v.name}?</b><br />הוא יירד מהיומן, והאורח יראה ״בוטל״ בחשבון שלו. כדאי גם להודיע בטלפון.</div><div className="rm-do"><Btn small onClick={() => decide('cancelled', 'הביקור בוטל וירד מהיומן')}>כן, לבטל</Btn><Btn small kind="quiet" onClick={() => setAskCancel(false)}>להשאיר</Btn></div></div>}
      <HistoryLog items={log.items} first={{ text: 'הבקשה הוגשה', at: v.createdAt }} />
    </>
  );
}

// ---------- donations ----------
type DTab = 'unpaid' | 'receipt' | 'month' | 'year' | 'memorial' | 'all';
export function DonationsScreen({ ctx, donations, selectedId }: { ctx: TeamCtx; donations: Donation[]; selectedId?: string }) {
  const desktop = useDesktop(); const toast = useToast(); const today = todayISO(); const inbox = useNotifications(true);
  const monthStart = today.slice(0, 8) + '01', yearStart = today.slice(0, 5) + '01-01';
  const live = donations.filter((d) => d.paymentStatus !== 'cancelled');
  // one predicate per tab: the number on the tab is the length of the list it opens
  const lists: Record<DTab, Donation[]> = {
    unpaid: live.filter((d) => !isPaid(d.paymentStatus)), receipt: live.filter((d) => isPaid(d.paymentStatus) && d.receiptWanted && !d.receiptSent),
    month: live.filter((d) => dayOf(d.createdAt) >= monthStart), year: live.filter((d) => dayOf(d.createdAt) >= yearStart), memorial: live.filter((d) => !!d.memorial), all: donations,
  };
  const [saved, setTab] = useSticky<DTab | ''>('donations-tab', '');
  const tab: DTab = saved || (lists.unpaid.length ? 'unpaid' : lists.receipt.length ? 'receipt' : 'month');
  const list = lists[tab];
  const sum = (x: Donation[]) => x.reduce((s, d) => s + d.amount, 0);
  const donors = (x: Donation[]) => new Set(x.map((d) => d.uid || d.name)).size;
  const paidM = lists.month.filter((d) => isPaid(d.paymentStatus)), paidY = lists.year.filter((d) => isPaid(d.paymentStatus));
  const fail = (e: unknown) => toast({ text: (e as Error)?.message || 'לא נשמר', kind: 'error' });
  const approve = (d: Donation) => { const mine = inbox.items.filter((n) => n.refId === d.id && n.type !== 'receipt'); setDonation(ctx.actor, d, { paymentStatus: 'paid' }).then(() => handleNotificationsFor(mine, d.id, ctx.actor)).then(() => toast({ text: `התשלום אושר: ${d.name}, ${money(d.amount)}`, actions: [{ label: 'ביטול', onClick: () => { setDonation(ctx.actor, d, { paymentStatus: d.paymentStatus }).catch(fail); mine.forEach((n) => { handleNotification(n, ctx.actor, false).catch(fail); }); } }] }, 6000)).catch(fail); };
  const receipt = (d: Donation) => { const mine = inbox.items.filter((n) => n.refId === d.id && n.type === 'receipt'); setDonation(ctx.actor, d, { receiptSent: true }).then(() => handleNotificationsFor(mine, d.id, ctx.actor)).then(() => toast({ text: `סומן: הקבלה נשלחה ל${d.receiptName || d.name}`, actions: [{ label: 'ביטול', onClick: () => { setDonation(ctx.actor, d, { receiptSent: false }).catch(fail); mine.forEach((n) => { handleNotification(n, ctx.actor, false).catch(fail); }); } }] }, 6000)).catch(fail); };
  const word = (d: Donation) => isPaid(d.paymentStatus) ? <St tone="ok">שולם</St> : d.paymentStatus === 'claimed' ? <St tone="rust">סימנ/ה שהעביר/ה</St> : d.paymentStatus === 'cancelled' ? <St tone="soft">בוטל</St> : <St tone="gold">עוד לא העביר/ה</St>;
  const recWord = (d: Donation) => !d.receiptWanted ? null : d.receiptSent ? <St tone="soft">קבלה נשלחה</St> : <St tone="gold">צריך קבלה</St>;
  const acts = (d: Donation) => <>{!isPaid(d.paymentStatus) && d.paymentStatus !== 'cancelled' && <Btn small onClick={() => approve(d)}>אישור תשלום</Btn>}{isPaid(d.paymentStatus) && d.receiptWanted && !d.receiptSent && <Btn small onClick={() => receipt(d)}>הקבלה נשלחה</Btn>}</>;
  const csv = () => exportCsv('תרומות.csv', ['תאריך', 'מי', 'טלפון', 'סכום', 'כותרת', 'הנצחה', 'הערה', 'תשלום', 'קבלה', 'קבלה על שם'], list.map((d) => [fullDate(d.createdAt), d.name, asPhone(d.phone), d.amount, d.label, d.memorial, d.note, PAYMENT_LABELS[d.paymentStatus], d.receiptWanted ? (d.receiptSent ? 'נשלחה' : 'לשלוח') : 'לא ביקש/ה', d.receiptWanted ? d.receiptName || d.name : '']));
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="תרומות" />
      <div className="rm-stats">
        <div><b>{money(sum(paidM))}</b><span>החודש · {donors(paidM)} תורמים</span></div>
        <div><b>{money(sum(paidY))}</b><span>השנה · {donors(paidY)} תורמים</span></div>
        <div><b className={lists.unpaid.length ? 'rust' : ''}>{money(sum(lists.unpaid))}</b><span>עוד לא שולם · {lists.unpaid.length}</span></div>
      </div>
      <div className="rm-tools" style={{ paddingTop: 10 }}><Btn small kind="quiet" to="/manage/settings/donations">סכומים מוגדרים</Btn><Btn small kind="quiet" onClick={csv}>ייצוא לאקסל ({list.length})</Btn></div>
      <Tabs label="אילו תרומות" value={tab} onChange={setTab} items={[{ id: 'unpaid', label: 'לא שולמו', n: lists.unpaid.length }, { id: 'receipt', label: 'קבלות לשלוח', n: lists.receipt.length }, { id: 'month', label: 'החודש', n: lists.month.length }, { id: 'year', label: 'השנה', n: lists.year.length }, { id: 'memorial', label: 'הנצחות', n: lists.memorial.length }, { id: 'all', label: 'הכל' }]} />
      {list.length === 0 ? <Empty title={tab === 'unpaid' ? 'אין תרומות שמחכות לתשלום' : tab === 'receipt' ? 'אין קבלות לשלוח' : 'אין תרומות כאלה'} />
        : desktop ? (
          <table className="r-table"><thead><tr><th>תאריך</th><th>מי</th><th>סכום</th><th className="rm-opt">הנצחה והערה</th><th>תשלום</th><th>קבלה</th><th /></tr></thead>
            <tbody>{list.map((d) => <tr key={d.id} className={d.id === selectedId ? 'sel' : ''} {...rowKeys(() => navigate(`/manage/donations/${d.id}`, false, true))}>
              <td style={{ whiteSpace: 'nowrap' }}>{fullDate(d.createdAt)}</td><td><span className="r-t">{d.name}</span></td><td><b style={{ fontFamily: 'var(--r-serif)', fontSize: 18 }}>{money(d.amount)}</b> {d.label}</td>
              <td className="rm-opt">{[d.memorial && `לזכר ${d.memorial}`, d.note].filter(Boolean).join(' · ')}</td><td>{word(d)}</td><td>{recWord(d)}{d.receiptWanted && !d.receiptSent ? ` · ${d.receiptName || d.name}` : ''}</td>
              <td className="r-end"><div className="rm-rowacts" onClick={(e) => e.stopPropagation()}>{acts(d)}</div></td>
            </tr>)}</tbody></table>
        ) : list.map((d) => (
          <div key={d.id} className="rm-q">
            <div><A to={`/manage/donations/${d.id}`}><span className="r-t">{d.name} · {money(d.amount)}</span></A><span className="r-m">{[d.label, dayLabel(dayOf(d.createdAt))].filter(Boolean).join(' · ')} · {word(d)}{recWord(d) && <> · {recWord(d)}</>}</span>{(d.memorial || d.note) && <span className="r-m">{[d.memorial && `לזכר ${d.memorial}`, d.note].filter(Boolean).join(' · ')}</span>}</div>
            {(!isPaid(d.paymentStatus) && d.paymentStatus !== 'cancelled' || (d.receiptWanted && !d.receiptSent && isPaid(d.paymentStatus))) && <div className="rm-do">{acts(d)}</div>}
          </div>
        ))}
    </>
  );
}
export function DonationDetailScreen({ id, ctx }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: d, loading } = useDonation(id); const toast = useToast();
  const donor = usePerson(d?.uid || '', !!d?.uid); const all = useDonations(true); const log = useActivityFor('donation', id); const inbox = useNotifications(true);
  if (loading) return <><Head backTo="/manage/donations" backLabel="תרומות" title="" /><Loading /></>;
  if (!d) return <><Head backTo="/manage/donations" backLabel="תרומות" title="התרומה לא נמצאה" /><Empty title="ייתכן שנמחקה" /></>;
  const paid = isPaid(d.paymentStatus);
  const count = all.items.filter((x) => x.uid === d.uid && x.paymentStatus !== 'cancelled').length;
  const fail = (e: unknown) => toast({ text: (e as Error)?.message || 'לא נשמר', kind: 'error' });
  const reopen = (list: AppNotification[]) => list.forEach((n) => { handleNotification(n, ctx.actor, false).catch(fail); });
  const approve = () => { const mine = inbox.items.filter((n) => n.refId === d.id && n.type !== 'receipt'); setDonation(ctx.actor, d, { paymentStatus: 'paid' }).then(() => handleNotificationsFor(mine, d.id, ctx.actor)).then(() => toast({ text: 'התשלום אושר', actions: [{ label: 'ביטול', onClick: () => { setDonation(ctx.actor, d, { paymentStatus: d.paymentStatus }).catch(fail); reopen(mine); } }] }, 6000)).catch(fail); };
  const receipt = (sent: boolean) => { const mine = inbox.items.filter((n) => n.refId === d.id && n.type === 'receipt'); setDonation(ctx.actor, d, { receiptSent: sent }).then(() => (sent ? handleNotificationsFor(mine, d.id, ctx.actor) : undefined)).then(() => toast({ text: sent ? 'סומן: הקבלה נשלחה' : 'סומן: הקבלה עוד לא נשלחה', actions: sent ? [{ label: 'ביטול', onClick: () => { setDonation(ctx.actor, d, { receiptSent: false }).catch(fail); reopen(mine); } }] : undefined }, 6000)).catch(fail); };
  const unpay = () => { setDonation(ctx.actor, d, { paymentStatus: 'claimed' }).then(() => toast({ text: 'הוחזר ל״מחכה לאישור״', actions: [{ label: 'ביטול', onClick: () => { setDonation(ctx.actor, d, { paymentStatus: d.paymentStatus }).catch(fail); } }] }, 6000)).catch(fail); };
  return (
    <>
      <Head backTo="/manage/donations" backLabel="תרומות" title={<>{money(d.amount)} · {d.name}</>} over={`תרומה · ${whenText(d.createdAt)}${d.label ? ' · ' + d.label : ''}`} />
      {d.note && <blockquote className="rm-quote">{d.note}</blockquote>}
      <dl className="r-facts">
        <div><dt>תשלום</dt><dd>{paid ? 'שולם' : d.paymentStatus === 'claimed' ? <>סימנ/ה שהעביר/ה<small>{whenText(d.updatedAt)} · מחכה לאישור שלך</small></> : d.paymentStatus === 'cancelled' ? 'בוטל' : <>עוד לא העביר/ה<small>התחייבות בלבד, בלי כסף עדיין</small></>}</dd></div>
        <div><dt>קבלה</dt><dd>{d.receiptWanted ? <>{d.receiptSent ? 'נשלחה' : paid ? 'צריך לשלוח' : 'ביקש/ה, אחרי התשלום'}<small>על שם {d.receiptName || d.name}</small></> : 'לא ביקש/ה'}</dd>{d.receiptWanted && d.receiptSent && <Btn small kind="quiet" onClick={() => receipt(false)}>עוד לא נשלחה</Btn>}</div>
        {d.memorial && <div><dt>הנצחה</dt><dd>לזכר {d.memorial}</dd></div>}
        {!donor.item && <div><dt>טלפון</dt><dd><span className="rm-ltr">{d.phone || '—'}</span></dd></div>}
      </dl>
      {donor.item && <div style={{ marginTop: 10 }}><Line to={`/manage/people/${donor.item.uid}`} title={donor.item.displayName} meta={<><span className="rm-ltr">{donor.item.phone}</span> · {count === 1 ? 'תרומה ראשונה' : `${count} תרומות עד היום`}</>} /></div>}
      {d.phone && <div className="r-actions"><a className="r-btn ghost sm" href={waLink(d.phone, fillTemplate(ctx.settings.templates.donationThanks, { 'שם': firstName(d.name), 'סכום': d.amount }))} target="_blank" rel="noopener">תודה בוואטסאפ</a><a className="r-btn ghost sm" href={telLink(d.phone)}>להתקשר</a></div>}
      <HistoryLog items={log.items} first={{ text: 'התרומה נרשמה', at: d.createdAt }} />
      <div className="r-dock">
        {!paid && d.paymentStatus !== 'cancelled' && <Btn onClick={approve}>אישור תשלום</Btn>}
        {paid && d.receiptWanted && !d.receiptSent && <Btn onClick={() => receipt(true)}>הקבלה נשלחה</Btn>}
        {paid && <Btn kind="ghost" fit={!!(d.receiptWanted && !d.receiptSent)} onClick={unpay}>להחזיר ל״לא שולם״</Btn>}
      </div>
    </>
  );
}

// ---------- calendar ----------
const COLORS = ['#22362a', '#7a5a0c', '#a3412a', '#31503d', '#4f5d53', '#5b4a8a', '#1f5a6b'];
/** A manager keeps the same colour in every month and on every phone. */
const colorOf = (c: CalendarItem) => { if (c.kind !== 'manual') return '#8a6c2c'; let h = 0; for (const ch of c.ownerUid) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const calLink = (c: CalendarItem) => (c.kind === 'visit' ? `/manage/visits/${c.refId}` : c.kind === 'event' ? `/manage/events/${c.refId}` : '');
const WD = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], WD_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function CalForm({ ctx, existing, date0, onDone }: { ctx: TeamCtx; existing?: CalendarItem; date0: string; onDone: () => void }) {
  const toast = useToast(); const today = todayISO();
  const [a0, b0] = (existing?.time || '').split('–');
  const [title, setTitle] = useState(existing?.title || ''); const [date, setDate] = useState(existing?.date || date0);
  const [from, setFrom] = useState(existing ? a0 || '' : '09:00'); const [to, setTo] = useState(b0 || ''); const [err, setErr] = useState('');
  const quick = [`${firstName(ctx.actor.name)} בחווה`, 'פגישת צוות', 'ספק מגיע', 'סיור'];
  const save = async () => {
    if (!title.trim()) { setErr('צריך לכתוב מה'); return; }
    if (to && from && to <= from) { setErr('שעת הסיום צריכה להיות אחרי ההתחלה'); return; }
    try { await saveCalendarItem(ctx.actor, { title: title.trim(), date, time: from && to ? `${from}–${to}` : from }, existing); toast({ text: existing ? 'נשמר' : `נכנס ליומן: ${title.trim()}` }, 2500); onDone(); }
    catch (e) { setErr((e as Error).message || 'לא נשמר'); }
  };
  const remove = () => { if (!existing) return; const undo = deferDelete(existing.id, () => { deleteCalendarItem(existing.id).catch(() => {}); }); toast({ text: `הוסר מהיומן: ${existing.title}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000); onDone(); };
  return (
    <Form onSubmit={save} className="r-form rm-formwide">
      <Field label="מה?">{(i) => <input id={i} className="r-input big" value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} maxLength={200} autoComplete="off" autoFocus={!existing} />}</Field>
      {!title && <div className="r-sugg" style={{ padding: 0 }}><span>למשל:</span>{quick.map((q) => <button key={q} type="button" onClick={() => setTitle(q)}>{q}</button>)}</div>}
      <Field label="באיזה יום?" help={date === today ? 'היום' : date === addDays(today, 1) ? 'מחר' : fmtDayLong(date)}>{(i) => <input id={i} type="date" className="r-input" dir="ltr" value={date} onChange={(e) => setDate(e.target.value || date)} />}</Field>
      <div className="rm-two">
        <Field label="משעה">{(i) => <input id={i} type="time" className="r-input" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="עד שעה" help="לא חובה">{(i) => <input id={i} type="time" className="r-input" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>
      {err && <p className="r-err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}><Btn type="submit" style={{ flex: 1 }}>{existing ? 'שמירה' : 'להכניס ליומן'}</Btn><Btn kind="quiet" onClick={onDone}>ביטול</Btn>{existing && <Btn kind="danger" onClick={remove}>הסרה מהיומן</Btn>}</div>
    </Form>
  );
}
export function CalendarScreen({ ctx }: { ctx: TeamCtx }) {
  const today = todayISO(); const desktop = useDesktop();
  const [month, setMonthRaw] = useSticky('cal-month', today.slice(0, 7)); const [sel, setSel] = useState(month === today.slice(0, 7) ? today : month + '-01');
  const [editing, setEditing] = useState<CalendarItem | null>(null);
  const first = new Date(month + '-01T12:00:00'); const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); const pad = first.getDay();
  const items = useCalendar(true, month + '-01', month + '-' + String(days).padStart(2, '0'));
  const owners = useMemo(() => [...new Map(items.items.filter((c) => c.kind === 'manual').map((c) => [c.ownerUid, c] as const)).values()], [items.items]);
  const shift = (n: number) => { const d = new Date(month + '-01T12:00:00'); d.setMonth(d.getMonth() + n); const m = dateKey(d).slice(0, 7); setMonthRaw(m); setSel(m === today.slice(0, 7) ? today : m + '-01'); setEditing(null); };
  const of = (k: string) => items.items.filter((c) => c.date === k).sort((a, b) => a.time.localeCompare(b.time));
  const key = (i: number) => `${month}-${String(i + 1).padStart(2, '0')}`;
  const canEdit = (c: CalendarItem) => c.kind === 'manual' && (c.ownerUid === ctx.actor.uid || ctx.owner);
  const openItem = (c: CalendarItem) => { const to = calLink(c); if (to) navigate(to); else if (canEdit(c)) setEditing(c); };
  const row = (c: CalendarItem, withDate?: boolean) => {
    const metaText = [withDate ? dayLabel(c.date) : '', c.time, c.kind === 'manual' ? c.ownerName : c.kind === 'visit' ? 'ביקור מאושר' : 'אירוע'].filter(Boolean).join(' · ');
    const inner = <><i className="rm-swatch" style={{ background: colorOf(c) }} /><span style={{ flex: 1, minWidth: 0 }}><span className="r-t">{c.title}</span><span className="r-m">{metaText}</span></span>{(calLink(c) || canEdit(c)) && <St tone="soft">{calLink(c) ? 'פתיחה' : 'עריכה'}</St>}</>;
    return calLink(c) || canEdit(c) ? <button key={c.id} type="button" className="rm-calrow" onClick={() => openItem(c)}>{inner}</button> : <div key={c.id} className="rm-calrow">{inner}</div>;
  };
  const dayList = of(sel);
  const later = items.items.filter((c) => c.date > sel && c.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="יומן מנהלים" />
      <p className="rm-lead">מי בחווה ומתי. כל המנהלים רואים את כולם; ביקורים מאושרים ואירועים נכנסים לבד.</p>
      <div className="rm-calnav"><button type="button" onClick={() => shift(-1)}>הקודם</button><b>{fmtMonthYear(month + '-01')}</b><button type="button" onClick={() => shift(1)}>הבא</button></div>
      <div className="rm-legend">{owners.map((c) => <span key={c.ownerUid}><i style={{ background: colorOf(c) }} />{firstName(c.ownerName)}</span>)}<span><i style={{ background: '#8a6c2c' }} />אירועים וביקורים</span></div>
      {editing && <><Sect title={`עריכה: ${editing.title}`} /><CalForm key={editing.id} ctx={ctx} existing={editing} date0={editing.date} onDone={() => setEditing(null)} /></>}
      {desktop ? (
        <>
          <div className="r-actions" style={{ paddingTop: 6 }}><Btn small to={`/manage/calendar/new?date=${today}`}>פריט חדש</Btn><span className="rm-lead" style={{ padding: 0, alignSelf: 'center' }}>או לחיצה על מספר היום</span></div>
          <div className="rm-calgrid" role="grid" aria-label={fmtMonthYear(month + '-01')}>
            {WD_LONG.map((d) => <div key={d} className="rm-wd">{d}</div>)}
            {Array.from({ length: pad }, (_, i) => <div key={'p' + i} className="rm-cell off" />)}
            {Array.from({ length: days }, (_, i) => { const k = key(i); return (
              <div key={k} className={'rm-cell' + (k === today ? ' today' : '')}>
                <button type="button" className="rm-add" aria-label={`להוסיף ל־${fmtDayLong(k)}`} onClick={() => navigate(`/manage/calendar/new?date=${k}`)}>{i + 1}</button>
                {of(k).map((c) => <button key={c.id} type="button" className="rm-ev" style={{ background: colorOf(c) }} title={`${c.title}${c.time ? ' · ' + c.time : ''}`} onClick={() => openItem(c)}>{c.time ? c.time.slice(0, 5) + ' ' : ''}{c.title}</button>)}
              </div>
            ); })}
          </div>
        </>
      ) : (
        <>
          <div className="rm-cal">
            {WD.map((d) => <div key={d} className="rm-wd">{d}</div>)}
            {Array.from({ length: pad }, (_, i) => <span key={'p' + i} />)}
            {Array.from({ length: days }, (_, i) => { const k = key(i); return <button type="button" key={k} aria-pressed={k === sel} aria-label={`${fmtDayLong(k)}${of(k).length ? `, ${of(k).length} פריטים` : ''}`} className={(k === today ? 'today ' : '') + (of(k).length ? 'has' : '')} onClick={() => { setSel(k); setEditing(null); }}>{i + 1}</button>; })}
          </div>
          <Sect title={sel === today ? `היום, ${fmtDayLong(sel)}` : fmtDayLong(sel)} n={dayList.length || undefined} />
          {dayList.length === 0 && <p className="rm-lead">אין כלום ביום הזה.</p>}
          {dayList.map((c) => row(c))}
          <div className="r-actions"><Btn small to={`/manage/calendar/new?date=${sel}`}>להוסיף ליום הזה</Btn></div>
          {later.length > 0 && <><Sect title="בהמשך החודש" n={later.length} />{later.map((c) => row(c, true))}</>}
        </>
      )}
    </>
  );
}
export function CalendarAddScreen({ ctx }: { ctx: TeamCtx }) {
  const date0 = /^\d{4}-\d{2}-\d{2}$/.test(param('date')) ? param('date') : todayISO();
  return (
    <>
      <Head backTo="/manage/calendar" backLabel="יומן" title="פריט חדש ביומן" />
      <CalForm ctx={ctx} date0={date0} onDone={() => back('/manage/calendar')} />
    </>
  );
}

// ---------- reports ----------
type Range = 'month' | '90' | 'year';
export function ReportsScreen({ ctx }: { ctx: TeamCtx }) {
  const today = todayISO(); const desktop = useDesktop();
  const [range, setRange] = useSticky<Range>('reports-range', 'month');
  const fromKey = range === 'month' ? today.slice(0, 8) + '01' : range === '90' ? addDays(today, -89) : today.slice(0, 5) + '01-01';
  const from = useMemo(() => new Date(fromKey + 'T00:00:00+02:00').toISOString(), [fromKey]); const to = useMemo(() => new Date(Date.now() + 86400_000).toISOString(), [fromKey]);
  const tasks = useHistoryTasks(true, true, from, to); const open = useOpenTasks(true, true);
  const donations = useDonations(true); const openT = useOpenTickets(true); const openTabs = useOpenTabs(true); const events = useAllEvents(true);
  const people = usePeople(true); const visits = useVisits(true);
  const label = range === 'month' ? `מ־1 ב${fmtMonthYear(today).split(' ')[0]}` : range === '90' ? '90 הימים האחרונים' : `מתחילת ${today.slice(0, 4)}`;
  const days = Math.max(1, Math.round((new Date(today).getTime() - new Date(fromKey).getTime()) / 86400_000) + 1);
  const perPerson = useMemo(() => { const m = new Map<string, { name: string; n: number }>(); for (const t of tasks.items) if (t.doneBy) { const x = m.get(t.doneBy.uid) || { name: t.doneBy.name, n: 0 }; x.n++; m.set(t.doneBy.uid, x); } return [...m.values()].sort((a, b) => b.n - a.n); }, [tasks.items]);
  const max = perPerson[0]?.n || 1;
  // "on time" = done on its own day, before the hour the template sets. Chores with no hour are not part of the measure.
  const timed = tasks.items.filter((t) => t.templateId && t.dateKey && ctx.templates.find((x) => x.id === t.templateId)?.time);
  const onTime = timed.filter((t) => t.doneAt && dayOf(t.doneAt) === t.dateKey && fmtTime(t.doneAt) <= ctx.templates.find((x) => x.id === t.templateId)!.time).length;
  const late = open.items.filter((t) => t.dueDate && t.dueDate < today && !(t.templateId && t.dateKey));
  const paidD = donations.items.filter((d) => dayOf(d.createdAt) >= fromKey && isPaid(d.paymentStatus));
  const openTickets = openT.items.filter((t) => t.status === 'valid');
  const debtTickets = openTickets.reduce((s, t) => s + t.price, 0), debtTabs = openTabs.items.reduce((s, t) => s + t.total, 0);
  const newPeople = people.items.filter((p) => dayOf(p.createdAt) >= fromKey);
  const visitsIn = visits.items.filter((v) => v.status === 'approved' && v.date >= fromKey && v.date <= today);
  const sourceField = ctx.settings.registrationFields.find((f) => f.id === 'source' || f.label.includes('שמע'));
  const source = useMemo(() => { if (!sourceField) return []; const m = new Map<string, number>(); for (const p of people.items) { const s = p.fields?.[sourceField.id]; if (s) m.set(s, (m.get(s) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [people.items, sourceField?.id]);
  const capped = tasks.items.length >= 500;
  const past = events.items.filter((e) => e.end < new Date().toISOString()).slice(0, 6);
  const tasksCsv = () => exportCsv(`משימות ${label}.csv`, ['משימה', 'בוצע על ידי', 'תאריך', 'שעה', 'חוזרת', 'הערה'], tasks.items.map((t) => [t.title, t.doneBy?.name || '', fullDate(t.doneAt), fmtTime(t.doneAt), t.templateId ? 'כן' : '', t.doneNote || '']));
  const moneyCsv = () => exportCsv(`כסף ${label}.csv`, ['סעיף', 'סכום', 'פירוט'], [[`תרומות ששולמו, ${label}`, paidD.reduce((s, d) => s + d.amount, 0), `${new Set(paidD.map((d) => d.uid || d.name)).size} תורמים`], ['כרטיסים שעוד לא שולמו, כרגע', debtTickets, `${new Set(openTickets.map((t) => t.orderId)).size} הזמנות`], ['חשבונות דוכן פתוחים, כרגע', debtTabs, `${openTabs.items.length} חשבונות`]]);
  const tasksBlock = (
    <section>
      <Sect title="משימות" more="ייצוא" onMore={tasksCsv} />
      <div className="rm-stats">
        <div><b>{tasks.items.length}{capped ? '+' : ''}</b><span>בוצעו</span></div>
        <div><b>{(tasks.items.length / days).toFixed(1)}</b><span>ביום, בממוצע</span></div>
        {timed.length > 0 && <div><b>{Math.round((onTime / timed.length) * 100)}%</b><span>משגרה עם שעה, בזמן</span></div>}
        <div><b className={late.length ? 'rust' : ''}>{late.length}</b><span>פתוחות באיחור, כרגע</span></div>
      </div>
      {capped && <p className="rm-lead" style={{ paddingTop: 8 }}>מוצגות 500 המשימות האחרונות בתקופה. לתמונה מלאה בחרו תקופה קצרה יותר.</p>}
      {perPerson.length === 0 ? <p className="rm-lead" style={{ paddingTop: 12 }}>לא סומנו משימות בתקופה.</p> : <div className="rm-bars">{perPerson.slice(0, 8).map((x) => <Fragment key={x.name}><span>{x.name}</span><i style={{ width: `${(x.n / max) * 100}%` }} /><b>{x.n}</b></Fragment>)}</div>}
    </section>
  );
  const moneyBlock = (
    <section>
      <Sect title="כסף" more="ייצוא" onMore={moneyCsv} />
      <Line to="/manage/donations" title="תרומות ששולמו" meta={`${label} · ${new Set(paidD.map((d) => d.uid || d.name)).size} תורמים`} end={money(paidD.reduce((s, d) => s + d.amount, 0))} num />
      <Line to="/manage/events" title="כרטיסים שעוד לא שולמו" meta={`כרגע, בכל האירועים · ${new Set(openTickets.map((t) => t.orderId)).size} הזמנות`} end={money(debtTickets)} num />
      <Line to="/manage/events" title="חשבונות דוכן פתוחים" meta={`כרגע, בכל האירועים · ${openTabs.items.length} חשבונות`} end={money(debtTabs)} num />
      <p className="rm-lead" style={{ paddingTop: 8 }}>הכנסות מכרטיסים ומהדוכן מופיעות בדוח של כל אירוע.</p>
    </section>
  );
  const peopleBlock = (
    <section>
      <Sect title="אנשים" more="לכל האנשים" to="/manage/people" />
      <div className="rm-stats">
        <div><b>{newPeople.length}</b><span>נרשמו, {label}</span></div>
        <div><b>{visitsIn.length}</b><span>ביקורים מאושרים שהיו בתקופה</span></div>
        <div><b>{people.items.filter((p) => p.status === 'blocked').length}</b><span>חסומים, כרגע</span></div>
      </div>
      {source.length > 0 && <><Sect title={sourceField!.label} n="מכל הזמנים" /><div className="rm-bars">{source.slice(0, 6).map(([s, c]) => <Fragment key={s}><span>{s}</span><i style={{ width: `${(c / source[0][1]) * 100}%` }} /><b>{c}</b></Fragment>)}</div></>}
    </section>
  );
  const eventsBlock = past.length > 0 && <section><Sect title="דוחות אירועים" more="לכל האירועים" to="/manage/events" />{past.map((e) => <Line key={e.id} to={`/manage/events/${e.id}/report`} title={e.title} meta={fullDate(e.start)} />)}</section>;
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="דוחות" over={label} />
      <div className="rm-pad" style={{ maxWidth: 520 }}><Seg hideLabel label="תקופה" value={range} onChange={setRange} options={[{ value: 'month', label: 'החודש' }, { value: '90', label: '90 יום' }, { value: 'year', label: 'השנה' }]} /></div>
      {desktop ? <div className="rm-split"><div>{tasksBlock}{peopleBlock}</div><div>{moneyBlock}{eventsBlock}</div></div> : <>{tasksBlock}{moneyBlock}{peopleBlock}{eventsBlock}</>}
    </>
  );
}

// ---------- activity feed ----------
const KINDS: (ActivityKind | 'all')[] = ['all', 'task', 'shopping', 'ticket', 'tab', 'visit', 'donation', 'user', 'event', 'place', 'settings'];
const STEP = 200;
export function ActivityScreen({ ctx }: { ctx: TeamCtx }) {
  const desktop = useDesktop();
  const [kind, setKind] = useSticky<ActivityKind | 'all'>('activity-kind', 'all'); const [who, setWho] = useState(''); const [q, setQ] = useState(''); const [limit, setLimit] = useState(STEP);
  const acts = useActivityByKind(kind, true, limit);
  const people = useMemo(() => [...new Map(acts.items.map((a) => [a.by.uid, a.by.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'he')), [acts.items]);
  const list = acts.items.filter((a) => (!who || a.by.uid === who) && hit(q, a.text, a.by.name, ACTION_LABELS[a.action] || ''));
  const byDay = useMemo(() => { const m = new Map<string, typeof list>(); for (const a of list) { const k = dayOf(a.at); m.set(k, [...(m.get(k) || []), a]); } return [...m.entries()]; }, [list]);
  const full = acts.items.length >= limit;
  const dayTitle = (k: string) => (k === todayISO() || k === addDays(todayISO(), -1) ? `${dayLabel(k)}, ${fmtDayLong(k)}` : fmtDayLong(k));
  void ctx;
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="כל הפעילות" />
      <p className="rm-lead">מי עשה מה ומתי, מהחדש לישן. החיפוש עובר על מה שנטען; בתחתית אפשר לטעון עוד.</p>
      <div className="rm-tools" style={{ paddingTop: 10 }}>
        <input className="r-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: מקדח, שם, פעולה" aria-label="חיפוש בפעילות" />
        <select className="r-input" style={{ flex: '0 1 180px' }} aria-label="של מי" value={who} onChange={(e) => setWho(e.target.value)}><option value="">כולם</option>{people.map(([u, n]) => <option key={u} value={u}>{n}</option>)}</select>
        <Btn small kind="quiet" onClick={() => exportCsv('פעילות.csv', ['תאריך', 'שעה', 'מי', 'פעולה', 'מה', 'סוג'], list.map((a) => [fullDate(a.at), fmtTime(a.at), a.by.name, ACTION_LABELS[a.action] || a.action, a.text, KIND_LABELS[a.kind]]))}>ייצוא ({list.length})</Btn>
      </div>
      <Tabs label="סוג הפעילות" value={kind} onChange={(k) => { setKind(k); setLimit(STEP); }} items={KINDS.map((k) => ({ id: k, label: k === 'all' ? 'הכל' : KIND_LABELS[k] }))} />
      {acts.loading && !list.length ? <Loading /> : list.length === 0 ? <Empty title="לא נמצאה פעילות כזו">{full ? 'אפשר לטעון עוד ולחפש שוב.' : ''}</Empty>
        : desktop ? (
          <table className="r-table"><thead><tr><th>שעה</th><th>מי</th><th>מה</th><th>סוג</th></tr></thead>
            <tbody>{byDay.map(([day, items]) => <Fragment key={day}>
              <tr className="rm-dayhead"><td colSpan={4}>{dayTitle(day)} · {items.length}</td></tr>
              {items.map((a) => <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtTime(a.at)}</td><td><b>{a.by.name}</b></td><td>{ACTION_LABELS[a.action] || a.action}: {a.text}</td><td>{KIND_LABELS[a.kind]}</td></tr>)}
            </Fragment>)}</tbody></table>
        ) : byDay.map(([day, items]) => <div key={day}><Sect title={dayTitle(day)} n={items.length} /><ul className="r-log">{items.map((a) => <li key={a.id}><span style={{ color: 'var(--r-ink)', fontSize: 16, flex: 1 }}><b>{firstName(a.by.name)}</b> · {ACTION_LABELS[a.action] || a.action}: {a.text}</span><span>{fmtTime(a.at)}</span></li>)}</ul></div>)}
      {full && <div className="r-actions"><Btn kind="ghost" onClick={() => setLimit(limit + STEP)}>לטעון עוד {STEP} מוקדמות יותר</Btn></div>}
    </>
  );
}

// ---------- settings ----------
/** The settings as they are on the server right now, and whether the document exists at all (decides set vs update). */
function useServerSettings() {
  const { item, loading } = useDoc<Settings & { id: string }>('settings/app', true);
  // merged here, from the same snapshot that says "loaded": a form can never start from defaults by a race with the shell's copy
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(item || {}), payment: { ...DEFAULT_SETTINGS.payment, ...(item?.payment || {}) }, templates: { ...DEFAULT_SETTINGS.templates, ...(item?.templates || {}) } };
  return { loading, exists: !!item, settings };
}
export function SettingsScreen({ ctx }: { ctx: TeamCtx }) {
  const s = ctx.settings; const desktop = useDesktop(); const toast = useToast(); const server = useServerSettings();
  const [intro, setIntro] = useState<string | null>(null);
  const owners = ctx.team.filter((p) => p.role === 'owner').length, managers = ctx.team.filter((p) => p.role === 'manager').length;
  const dirty = intro !== null && intro.trim() !== s.guestIntro;
  const save = () => { if (!dirty) return; saveSettingsPart(ctx.actor, { guestIntro: intro!.trim() }, server.exists, 'משפט הפתיחה לאורחים עודכן').then(() => { setIntro(null); toast({ text: 'נשמר' }, 2000); }).catch((e) => toast({ text: (e as Error).message || 'לא נשמר', kind: 'error' })); };
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="הגדרות" />
      <p className="rm-lead">כל נושא בדף משלו, ונשמר רק כשלוחצים ״שמירה״ באותו דף.</p>
      <nav className="rm-areas" aria-label="נושאי ההגדרות" style={{ marginTop: 14 }}>
        <Line to="/manage/settings/payments" title="תשלומים" meta={[s.payment.bit && `ביט ${s.payment.bit}`, s.payment.paybox && 'PayBox', s.payment.cash && 'מזומן'].filter(Boolean).join(' · ') || 'עוד לא הוגדר'} end={ctx.owner ? undefined : <St tone="soft">לבעלים</St>} />
        <Line to="/manage/settings/donations" title="סכומי תרומה" meta={s.donationPresets.map((p) => `${p.amount} ₪`).join(' · ') + ' + סכום חופשי'} />
        <Line to="/manage/settings/visit-types" title="סוגי ביקור" meta={s.visitTypes.join(', ')} />
        <Line to="/manage/settings/questions" title="שאלות נוספות לנרשמים" meta={s.registrationFields.length ? s.registrationFields.map((f) => f.label).join(', ') : 'רק שם וטלפון'} />
        <Line to="/manage/settings/whatsapp" title="הודעות מוכנות לוואטסאפ" meta="אישור ביקור, תודה, תזכורות" />
        {ctx.owner && <Line to="/manage/settings/managers" title="מנהלים ובעלים" meta={`${owners} בעלים · ${managers} מנהלים`} />}
        <Line to="/terms" title="תנאי שימוש ופרטיות" meta="הנוסח שהאורח מאשר" />
        <Line href="/admin" title="עריכת האתר" meta="טקסטים ותמונות באתר, נפתח בחלון נפרד" />
      </nav>
      <Form onSubmit={save} className="r-form rm-formwide">
        <Field label="משפט פתיחה לאורחים" help="מופיע בראש דף הבית של האורח">{(i) => <textarea id={i} className="r-input" value={intro ?? s.guestIntro} onChange={(e) => setIntro(e.target.value)} maxLength={500} disabled={server.loading} />}</Field>
        {dirty && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Btn type="submit" small>שמירה</Btn><Btn small kind="quiet" onClick={() => setIntro(null)}>ביטול</Btn><span className="rm-dirty">לא נשמר עדיין</span></div>}
      </Form>
    </>
  );
}
export type SettingsPageKey = 'payments' | 'donations' | 'visit-types' | 'questions' | 'whatsapp' | 'managers';
const PAGE_TITLE: Record<SettingsPageKey, string> = { payments: 'תשלומים', donations: 'סכומי תרומה', 'visit-types': 'סוגי ביקור', questions: 'שאלות נוספות לנרשמים', whatsapp: 'הודעות מוכנות לוואטסאפ', managers: 'מנהלים ובעלים' };
export function SettingsPage({ ctx, page }: { ctx: TeamCtx; page: SettingsPageKey }) {
  const server = useServerSettings();
  if (!(page in PAGE_TITLE)) return <><Head backTo="/manage/settings" backLabel="הגדרות" title="הדף לא נמצא" /><Empty title="אין דף הגדרות כזה" /></>;
  const head = <Head backTo="/manage/settings" backLabel="הגדרות" title={PAGE_TITLE[page]} />;
  if (page === 'managers') return <>{head}<ManagersPage ctx={ctx} /></>;
  // the form is created only once the real settings are here: it can never start from defaults and save them over the real ones
  if (server.loading) return <>{head}<Loading /></>;
  const props = { ctx, exists: server.exists, settings: server.settings };
  return <>{head}{page === 'payments' ? <PaymentsForm {...props} /> : page === 'donations' ? <PresetsForm {...props} /> : page === 'visit-types' ? <VisitTypesForm {...props} /> : page === 'questions' ? <QuestionsForm {...props} /> : <TemplatesForm {...props} />}</>;
}
type PartProps = { ctx: TeamCtx; exists: boolean; settings: Settings };
/** Shared behaviour of a settings page: knows if it is dirty, saves only its own part, says what happened. */
function usePart<T>(initial: T, ctx: TeamCtx, exists: boolean, toPatch: (v: T) => Partial<Settings>, what: string, check?: (v: T) => string) {
  const toast = useToast();
  const [v, setV] = useState<T>(() => structuredClone(initial)); const [base, setBase] = useState(() => JSON.stringify(initial)); const [err, setErr] = useState('');
  const dirty = JSON.stringify(v) !== base;
  const save = async () => {
    const problem = check?.(v) || '';
    if (problem) { setErr(problem); return; }
    try { await saveSettingsPart(ctx.actor, toPatch(v), exists, what); setBase(JSON.stringify(v)); setErr(''); toast({ text: 'נשמר' }, 2000); }
    catch (e) { setErr((e as Error).message || 'לא נשמר'); }
  };
  const foot = <div className="r-dock">{err ? <span className="r-err" role="alert" style={{ flex: 1, alignSelf: 'center' }}>{err}</span> : dirty ? <span className="rm-dirty" style={{ flex: 1, alignSelf: 'center' }}>יש שינויים שלא נשמרו</span> : <span style={{ flex: 1, alignSelf: 'center', color: 'var(--r-soft)', fontSize: 15 }}>אין שינויים</span>}<Btn type="submit" fit disabled={!dirty}>שמירה</Btn></div>;
  return { v, set: (next: T) => { setV(next); setErr(''); }, save, foot, dirty };
}
function PaymentsForm({ ctx, exists, settings }: PartProps) {
  const p = usePart(settings.payment, ctx, exists, (payment) => ({ payment: { ...payment, bit: payment.bit.trim(), paybox: payment.paybox.trim(), note: payment.note.trim() } }), 'פרטי התשלום עודכנו');
  const s = p.v; const ro = !ctx.owner;
  return (
    <Form onSubmit={p.save} className="r-form rm-formwide">
      <p style={{ color: 'var(--r-soft)', fontSize: 16 }}>מה האורח רואה כשצריך לשלם על כרטיס, תרומה או חשבון דוכן.{ro && <b style={{ color: 'var(--r-ink)' }}> רק בעלים יכולים לשנות לאן עובר הכסף.</b>}</p>
      <Field label="מספר ביט">{(i) => <input id={i} className="r-input" dir="ltr" inputMode="tel" value={s.bit} disabled={ro} onChange={(e) => p.set({ ...s, bit: e.target.value })} maxLength={30} />}</Field>
      <Field label="קישור PayBox">{(i) => <input id={i} className="r-input" dir="ltr" inputMode="url" value={s.paybox} disabled={ro} onChange={(e) => p.set({ ...s, paybox: e.target.value })} maxLength={300} placeholder="https://" />}</Field>
      <Field label="הערה לתשלום" help="לא חובה">{(i) => <input id={i} className="r-input" value={s.note} disabled={ro} onChange={(e) => p.set({ ...s, note: e.target.value })} maxLength={300} placeholder="בהעברה לציין שם מלא" />}</Field>
      {!ro && <Tick on={s.cash} onChange={(cash) => p.set({ ...s, cash })} help="המתנדב בשער מסמן ״שולם במקום״">אפשר לשלם במזומן בכניסה</Tick>}
      <div><b style={{ fontSize: 16 }}>כך זה נראה לאורח</b><div className="rm-preview" style={{ margin: '6px 0 0' }}>{[s.bit && `ביט ${s.bit}`, s.paybox && 'PayBox', s.cash && 'מזומן בשער'].filter(Boolean).join(' · ') || 'לא הוגדרה אף דרך תשלום'}{s.note ? `\n${s.note}` : ''}</div></div>
      {!ro && p.foot}
    </Form>
  );
}
function PresetsForm({ ctx, exists, settings }: PartProps) {
  const p = usePart(settings.donationPresets, ctx, exists, (donationPresets) => ({ donationPresets: donationPresets.map((x) => ({ amount: Number(x.amount), label: x.label.trim() })) }), 'סכומי התרומה עודכנו', (v) => (v.some((x) => !(Number(x.amount) > 0)) ? 'כל סכום צריך להיות גדול מאפס. שורה ריקה אפשר להסיר.' : ''));
  const rows = p.v;
  return (
    <Form onSubmit={p.save} className="r-form rm-formwide">
      <p style={{ color: 'var(--r-soft)', fontSize: 16 }}>הכפתורים בדף התרומה. ״סכום אחר״ והנצחה מופיעים שם תמיד.</p>
      <div style={{ margin: '0 calc(-1 * var(--r-pad))' }}>
        {rows.map((x, i) => <div key={i} className="rm-setrow"><input className="r-input r-num" dir="ltr" type="number" inputMode="numeric" min={1} aria-label={`סכום ${i + 1}`} value={x.amount || ''} onChange={(e) => p.set(rows.map((r, j) => (j === i ? { ...r, amount: Number(e.target.value) || 0 } : r)))} /><input className="r-input" aria-label={`כותרת לסכום ${i + 1}`} placeholder="כותרת: חי, לב…" value={x.label} maxLength={60} onChange={(e) => p.set(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} /><Btn small kind="quiet" onClick={() => p.set(rows.filter((_, j) => j !== i))}>הסרה</Btn></div>)}
      </div>
      <Btn small kind="ghost" onClick={() => p.set([...rows, { amount: 0, label: '' }])} style={{ alignSelf: 'flex-start' }}>עוד סכום</Btn>
      {p.foot}
    </Form>
  );
}
function VisitTypesForm({ ctx, exists, settings }: PartProps) {
  const p = usePart(settings.visitTypes, ctx, exists, (visitTypes) => ({ visitTypes: visitTypes.map((x) => x.trim()) }), 'סוגי הביקור עודכנו', (v) => (v.some((x) => !x.trim()) ? 'יש סוג ביקור בלי שם. אפשר למלא או להסיר.' : !v.length ? 'צריך לפחות סוג ביקור אחד' : ''));
  const rows = p.v;
  const move = (i: number, d: number) => { const v = [...rows]; [v[i], v[i + d]] = [v[i + d], v[i]]; p.set(v); };
  return (
    <Form onSubmit={p.save} className="r-form rm-formwide">
      <p style={{ color: 'var(--r-soft)', fontSize: 16 }}>מה שהאורח בוחר בטופס תיאום הביקור, בסדר הזה.</p>
      <div style={{ margin: '0 calc(-1 * var(--r-pad))' }}>
        {rows.map((x, i) => <div key={i} className="rm-setrow"><Btn small kind="quiet" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`להעלות את ${x || 'השורה'} מקום אחד`}>למעלה</Btn><input className="r-input" aria-label={`סוג ביקור ${i + 1}`} value={x} maxLength={100} onChange={(e) => p.set(rows.map((r, j) => (j === i ? e.target.value : r)))} /><Btn small kind="quiet" onClick={() => p.set(rows.filter((_, j) => j !== i))}>הסרה</Btn></div>)}
      </div>
      <Btn small kind="ghost" onClick={() => p.set([...rows, ''])} style={{ alignSelf: 'flex-start' }}>עוד סוג</Btn>
      {p.foot}
    </Form>
  );
}
type QField = RegistrationField & { optionsText: string };
function QuestionsForm({ ctx, exists, settings }: PartProps) {
  const people = usePeople(true);
  // the options are kept as the text the manager types; they are split only when saving, so a comma can be typed
  const p = usePart<QField[]>(settings.registrationFields.map((f) => ({ ...f, optionsText: f.options.join(', ') })), ctx, exists,
    (v) => ({ registrationFields: v.map(({ optionsText, ...f }) => ({ ...f, label: f.label.trim(), options: f.type === 'choice' ? optionsText.split(',').map((x) => x.trim()).filter(Boolean) : [] })) }), 'שאלות ההרשמה עודכנו',
    (v) => (v.some((f) => !f.label.trim()) ? 'יש שאלה בלי נוסח. אפשר למלא או להסיר.' : v.some((f) => f.type === 'choice' && f.optionsText.split(',').filter((x) => x.trim()).length < 2) ? 'שאלת בחירה צריכה לפחות שתי אפשרויות, מופרדות בפסיק.' : ''));
  const fields = p.v;
  const setF = (i: number, patch: Partial<QField>) => p.set(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const answered = (id: string) => people.items.filter((x) => (x.fields?.[id] || '').trim()).length;
  return (
    <Form onSubmit={p.save} className="r-form rm-formwide">
      <p style={{ color: 'var(--r-soft)', fontSize: 16 }}>בהרשמה שואלים רק שם וטלפון. השאלות כאן מופיעות לאורח בחשבון שלו כ״השלמת פרטים״, ולמנהלים בדף האדם ובטבלה.</p>
      {fields.length === 0 && <p style={{ fontSize: 17 }}>אין שאלות נוספות.</p>}
      {fields.map((f, i) => (
        <div key={f.id} className="rm-block" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={`שאלה ${i + 1}`} help={answered(f.id) ? `ענו עליה ${answered(f.id)} מתוך ${people.items.length}` : undefined}>{(id) => <input id={id} className="r-input" value={f.label} maxLength={100} onChange={(e) => setF(i, { label: e.target.value })} placeholder="איך שמעתם עלינו?" />}</Field>
          <Seg label="סוג התשובה" value={f.type} onChange={(type) => setF(i, { type })} options={[{ value: 'text', label: 'טקסט' }, { value: 'choice', label: 'בחירה מרשימה' }, { value: 'date', label: 'תאריך' }]} />
          {f.type === 'choice' && <Field label="האפשרויות" help="מופרדות בפסיק: חברים, פייסבוק, עברתי בסביבה">{(id) => <input id={id} className="r-input" value={f.optionsText} onChange={(e) => setF(i, { optionsText: e.target.value })} />}</Field>}
          <Btn small kind="danger" onClick={() => p.set(fields.filter((_, j) => j !== i))} style={{ alignSelf: 'flex-start' }}>הסרת השאלה{answered(f.id) ? ' (התשובות שכבר ניתנו נשארות שמורות)' : ''}</Btn>
        </div>
      ))}
      <Btn small kind="ghost" onClick={() => p.set([...fields, { id: 'f' + Date.now().toString(36), label: '', type: 'text', options: [], required: false, optionsText: '' }])} style={{ alignSelf: 'flex-start' }}>עוד שאלה</Btn>
      {p.foot}
    </Form>
  );
}
const TPL: { k: keyof Settings['templates']; t: string; vars: Record<string, string | number> }[] = [
  { k: 'visitApproved', t: 'אישור ביקור', vars: { 'שם': 'אסתר', 'תאריך': 'יום שישי, 20 בנובמבר', 'שעה': '10:00' } },
  { k: 'donationThanks', t: 'תודה על תרומה', vars: { 'שם': 'מיכל', 'סכום': 180 } },
  { k: 'debtReminder', t: 'תזכורת חוב', vars: { 'שם': 'רוני', 'אירוע': 'יריד אוקטובר', 'סכום': 46 } },
  { k: 'ticketReminder', t: 'תזכורת לאירוע', vars: { 'שם': 'דוד', 'אירוע': 'פסטיבל הסתיו', 'תאריך': 'שבת, 21 בנובמבר' } },
  { k: 'vendorInvite', t: 'הזמנת בעל דוכן', vars: { 'שם': 'גלעד', 'אירוע': 'פסטיבל הסתיו', 'תאריך': 'שבת, 21 בנובמבר' } },
];
function TemplatesForm({ ctx, exists, settings }: PartProps) {
  const p = usePart(settings.templates, ctx, exists, (templates) => ({ templates }), 'הודעות הוואטסאפ עודכנו');
  const s = p.v;
  return (
    <Form onSubmit={p.save} className="r-form rm-formwide">
      <p style={{ color: 'var(--r-soft)', fontSize: 16 }}>הכפתור באפליקציה פותח וואטסאפ עם הטקסט מוכן; שולחים בעצמכם. מה שבסוגריים מתחלף: <span className="rm-ltr">[שם] [תאריך] [שעה] [אירוע] [סכום]</span></p>
      {TPL.map(({ k, t, vars }) => (
        <div key={k} className="rm-block" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Field label={t}>{(i) => <textarea id={i} className="r-input" value={s[k] || ''} maxLength={1000} onChange={(e) => p.set({ ...s, [k]: e.target.value })} />}</Field>
          <div className="rm-preview" style={{ margin: 0 }}>{fillTemplate(s[k] || '', vars)}</div>
        </div>
      ))}
      {p.foot}
    </Form>
  );
}
function ManagersPage({ ctx }: { ctx: TeamCtx }) {
  const acts = useActivityByKind('user', ctx.owner, 30);
  if (!ctx.owner) return <Empty title="הדף הזה פתוח לבעלים בלבד">מינוי והסרה של מנהלים נעשים על ידי בעלים.</Empty>;
  const of = (r: string) => ctx.team.filter((p) => p.role === r);
  const changes = acts.items.filter((a) => ['role', 'invited', 'blocked', 'unblocked'].includes(a.action)).slice(0, 10);
  return (
    <>
      <p className="rm-lead">תפקיד משנים בדף של האדם. למי שעוד לא נכנס לאפליקציה: <A className="r-textlink" style={{ minHeight: 0 }} to="/manage/people/invite">תפקיד לפי מייל</A>.</p>
      {(['owner', 'manager', 'staff'] as const).map((r) => <div key={r}><Sect title={r === 'owner' ? 'בעלים' : r === 'manager' ? 'מנהלים' : 'מתנדבים'} n={of(r).length} />{of(r).length === 0 ? <p className="rm-lead">אין.</p> : of(r).map((p) => <Line key={p.uid} to={`/manage/people/${p.uid}`} title={<>{p.displayName}{p.uid === ctx.actor.uid ? ' (את/ה)' : ''}</>} meta={<span className="rm-ltr">{p.email}</span>} end={<St tone="soft">{ROLE_LABELS[p.role]}</St>} />)}</div>)}
      {changes.length > 0 && <><Sect title="שינויים אחרונים" /><ul className="r-log">{changes.map((a) => <li key={a.id}>{firstName(a.by.name)} · {a.text}<span>{whenText(a.at)}</span></li>)}</ul></>}
    </>
  );
}
