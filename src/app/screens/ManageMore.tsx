// Manager: visits, donations, reports, activity feed, settings.
import { Fragment, useMemo, useState } from 'react';
import type { Visit, Donation, Settings, Ticket, RegistrationField, Profile } from '../types';
import { PAYMENT_LABELS, VISIT_LABELS, KIND_LABELS, type ActivityKind } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Ledger, Sec, Row, Pill, Btn, A, Icon, Empty, Field, Input, Textarea, Chips, Chip, SwitchRow, Avatar, Loading, useToast, fmtDate, fmtTime, fmtDayLong, fmtWeekday, fmtMonthYear, firstName, relTime, whenText, todayISO, addDays, money, useDesktop, dayLabel } from '../ui';
import { navigate } from '../router';
import { usePerson, useHistoryTasks, useOpenTasks } from '../store';
import { setVisitStatus, useVisit, useDonation, setDonation, useDonations, useCalendar, upsertCalendarRef, deleteCalendarRef, saveSettings, useOpenTickets, useOpenTabs, useAllEvents, useEventTickets, fillTemplate, waLink, telLink, handleNotificationsFor, useNotifications } from '../data';
import { ExportActions } from '../ExportTable';
import { useActivityFor, useActivityByKind, ACTION_LABELS } from '../activity';
import { useList } from '../db';

// ---------- visits ----------
type VFilter = 'new' | 'approved' | 'rejected' | 'past' | 'all';
export function VisitsScreen({ ctx, visits, selectedId }: { ctx: TeamCtx; visits: Visit[]; selectedId?: string }) {
  const desktop = useDesktop(); const today = todayISO();
  const [filter, setFilter] = useState<VFilter>(visits.some((v) => v.status === 'new') ? 'new' : 'approved');
  const list = visits.filter((v) => filter === 'all' ? true : filter === 'past' ? v.date < today && v.status === 'approved' : filter === 'approved' ? v.status === 'approved' && v.date >= today : v.status === filter).sort((a, b) => filter === 'new' ? b.createdAt.localeCompare(a.createdAt) : a.date.localeCompare(b.date));
  const n = (f: VFilter) => visits.filter((v) => f === 'past' ? v.date < today && v.status === 'approved' : f === 'approved' ? v.status === 'approved' && v.date >= today : v.status === f).length;
  const chips = <Chips scroll={!desktop} value={filter} onChange={setFilter} options={[{ value: 'new', label: 'חדשות', n: n('new') }, { value: 'approved', label: 'מאושרים', n: n('approved') }, { value: 'rejected', label: 'לא מתאים', n: n('rejected') || undefined }, { value: 'past', label: 'עברו', n: n('past') || undefined }, { value: 'all', label: 'הכל' }]} rust={filter === 'new'} />;
  const status = (v: Visit) => <Pill tone={v.status === 'new' ? 'rust' : v.status === 'approved' ? 'ok' : undefined}>{v.status === 'new' ? `חדש · ${relTime(v.createdAt)}` : v.status === 'approved' ? `אושר${v.handledBy ? ' · ' + firstName(v.handledBy.name) : ''}${v.managerNote ? ' · ' + v.managerNote : ''}` : VISIT_LABELS[v.status]}</Pill>;
  const visitExport = () => ({
    filename: 'ביקורים.csv',
    headers: ['תאריך', 'מי', 'טלפון', 'אנשים', 'סוג', 'מצב', 'הערה', 'מטפל/ת'],
    rows: visits.map((visit) => [
      visit.date, visit.name, visit.phone, visit.people, visit.type, VISIT_LABELS[visit.status],
      visit.managerNote, visit.handledBy?.name || '',
    ]),
  });
  return (
    <>
      <Top backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="ביקורים" sub={desktop ? 'בקשות מהאתר. מתקשרים, מאשרים, וזה נכנס ליומן. ה־CRM הקטן של מי שרוצה לבוא.' : 'בקשות מהאתר. מתקשרים, מאשרים, וזה נכנס ליומן.'} end={<><Btn kind="ghost" size="sm" to="/manage/settings/visit-types">סוגי ביקור</Btn><ExportActions getData={visitExport} /></>} />
      <div style={{ paddingTop: 8, paddingInline: desktop ? 20 : 0 }}>{chips}</div>
      {!list.length && <Empty title={filter === 'new' ? 'אין בקשות חדשות' : 'אין ביקורים כאלה'} />}
      {desktop ? <div className="tablewrap"><table><thead><tr><th>תאריך</th><th>מי</th><th>אנשים</th><th className="opt">סוג</th><th className="opt">טלפון</th><th>מצב</th><th className="opt"></th></tr></thead><tbody>{list.map((v) => <tr key={v.id} className={'link ' + (v.id === selectedId ? 'sel' : '')} onClick={() => navigate(`/manage/visits/${v.id}`)}><td style={{ whiteSpace: 'nowrap' }}>{fmtWeekday(v.date)} {fmtDate(v.date)}</td><td style={{ fontWeight: 600 }}>{v.name}</td><td>{v.people}</td><td className="opt">{v.type}</td><td className="ltr opt">{v.phone}</td><td>{status(v)}</td><td className="opt"><div className="acts" onClick={(e) => e.stopPropagation()}>{v.status === 'new' && <Btn size="xs" to={`/manage/visits/${v.id}`}>אישור</Btn>}<a className="btn ghost xs" href={telLink(v.phone)}>התקשרות</a><a className="btn ghost xs" href={waLink(v.phone)} target="_blank" rel="noopener">וואטסאפ</a></div></td></tr>)}</tbody></table></div>
        : <div className="list">{list.map((v) => <A key={v.id} to={`/manage/visits/${v.id}`} className="evcard"><div className="date"><div className="d">{Number(v.date.slice(8, 10))}</div><div className="m">{fmtMonthYear(v.date).split(' ')[0]}</div><div className="w">{fmtWeekday(v.date)}</div></div><div style={{ flex: 1, minWidth: 0 }}><div className="row-title" style={{ fontSize: 17, fontWeight: 600 }}>{v.name} · {v.people} אנשים</div><div className="meta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, fontSize: 14, color: 'var(--muted)' }}><span>{v.type}</span>{status(v)}</div>{v.note && <div className="quote" style={{ margin: '8px 0 0', fontSize: 15 }}>"{v.note}"</div>}</div><Icon name="chev" className="chev" size={18} /></A>)}</div>}
    </>
  );
}
export function VisitDetailScreen({ id, ctx, panel }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: v, loading } = useVisit(id); const toast = useToast();
  const requester = usePerson(v?.uid || '', !!v?.uid);
  const sameDay = useCalendar(!!v, v?.date || '2000-01-01', v?.date || '2000-01-01');
  const log = useActivityFor('visit', id);
  const inbox = useNotifications(true);
  const [note, setNote] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (!v) return <Empty title="הבקשה לא נמצאה" />;
  const n = note ?? v.managerNote;
  const decide = async (status: Visit['status']) => {
    try {
      await setVisitStatus(v, ctx.actor, status, n);
      if (status === 'approved') await upsertCalendarRef(ctx.actor, 'visit', v.id, { title: `ביקור: ${v.name} · ${v.people}`, date: v.date, time: n.match(/\d{1,2}:\d{2}/)?.[0] || '' }); else await deleteCalendarRef('visit', v.id);
      await handleNotificationsFor(inbox.items, v.id, ctx.actor);
      toast({ text: status === 'approved' ? 'אושר ונכנס ליומן' : 'סומן: לא מתאים', action: status === 'approved' && v.phone ? { label: 'וואטסאפ', onClick: () => window.open(waLink(v.phone, fillTemplate(ctx.settings.templates.visitApproved, { 'שם': firstName(v.name), 'תאריך': fmtDayLong(v.date), 'שעה': n.match(/\d{1,2}:\d{2}/)?.[0] || '' })), '_blank') } : undefined }, 6000);
    } catch { toast({ text: 'לא נשמר', kind: 'error' }); }
  };
  const waText = fillTemplate(ctx.settings.templates.visitApproved, { 'שם': firstName(v.name), 'תאריך': fmtDayLong(v.date), 'שעה': n.match(/\d{1,2}:\d{2}/)?.[0] || '' });
  return (
    <>
      <Top backTo={panel ? undefined : '/manage/visits'} back={panel} backLabel={panel ? 'סגירה' : 'ביקורים'} title={v.name} date={fmtDayLong(v.date)} sub={`${v.people} אנשים · ${v.type}`} end={<Pill tone={v.status === 'new' ? 'rust' : v.status === 'approved' ? 'ok' : undefined}>{v.status === 'new' ? `חדש · ${relTime(v.createdAt)}` : VISIT_LABELS[v.status]}</Pill>} />
      {v.note && <blockquote className="quote" style={{ marginTop: 12 }}>"{v.note}"</blockquote>}
      <div className="inline pad" style={{ paddingTop: 14 }}><a className="btn ghost sm" href={telLink(v.phone)}><Icon name="phone" size={18} />התקשרות</a><a className="btn ghost sm" href={waLink(v.phone, v.status === 'approved' ? waText : '')} target="_blank" rel="noopener"><Icon name="whatsapp" size={18} />וואטסאפ</a></div>
      {requester.item && <Row center to={`/manage/people/${requester.item.uid}`} start={<Avatar name={requester.item.displayName} />} title={requester.item.displayName} meta={<><span className="ltr">{requester.item.phone}</span><span>לקוח/ה #{requester.item.customerNumber}</span></>} chev />}
      {!requester.item && <dl className="kv"><dt>טלפון</dt><dd className="ltr">{v.phone}</dd></dl>}
      <Sec title="ביומן באותו יום" n={sameDay.items.filter((c) => c.refId !== v.id).length || undefined} />
      <div className="list">{sameDay.items.filter((c) => c.refId !== v.id).map((c) => <Row key={c.id} center title={c.title} meta={<span>{[c.time, c.kind === 'manual' ? firstName(c.ownerName) : ''].filter(Boolean).join(' · ')}</span>} />)}{!sameDay.items.filter((c) => c.refId !== v.id).length && <p className="lead">היום הזה פנוי ביומן.</p>}</div>
      <Field label="הערה לאורח (יראה בחשבון שלו)" hint="שעה שכותבים כאן (למשל 10:00) נכנסת גם ליומן ולהודעת הוואטסאפ."><Input value={n} onChange={(e) => setNote(e.target.value)} placeholder="נפגשים בשער ב־10:00" /></Field>
      <Sec title="היסטוריה" />
      <div className="list">{log.items.map((a) => <Row key={a.id} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}</span>} meta={<span>{a.text} · {whenText(a.at)}</span>} />)}<Row center title={<span style={{ fontSize: 15, fontWeight: 500 }}>הבקשה הוגשה מהאתר</span>} meta={<span>{whenText(v.createdAt)}</span>} /></div>
      <div className="actions sticky">
        {v.status !== 'approved' && <Btn size="big" icon="calendar" onClick={() => decide('approved')}>אישור ליומן</Btn>}
        {v.status === 'approved' && n !== v.managerNote && <Btn onClick={() => decide('approved')}>שמירת ההערה</Btn>}
        {v.status !== 'rejected' && v.status !== 'cancelled' && <Btn kind="ghost" onClick={() => decide('rejected')}>לא מתאים</Btn>}
        {v.status === 'approved' && <Btn kind="quiet" size="sm" onClick={() => decide('cancelled')}>ביטול הביקור</Btn>}
      </div>
    </>
  );
}

// ---------- donations ----------
type DFilter = 'month' | 'pending' | 'receipt' | 'memorial' | 'year' | 'all';
export function DonationsScreen({ ctx, donations, selectedId }: { ctx: TeamCtx; donations: Donation[]; selectedId?: string }) {
  const desktop = useDesktop(); const toast = useToast(); const today = todayISO();
  const [filter, setFilter] = useState<DFilter>('month');
  const monthStart = today.slice(0, 8) + '01', yearStart = today.slice(0, 5) + '01-01';
  const paid = (d: Donation) => d.paymentStatus === 'paid' || d.paymentStatus === 'paid_onsite';
  const sumM = donations.filter((d) => paid(d) && d.createdAt >= monthStart).reduce((s, d) => s + d.amount, 0);
  const sumY = donations.filter((d) => paid(d) && d.createdAt >= yearStart).reduce((s, d) => s + d.amount, 0);
  const pending = donations.filter((d) => d.paymentStatus === 'claimed' || d.paymentStatus === 'pending');
  const receipts = donations.filter((d) => d.receiptWanted && !d.receiptSent && paid(d));
  const list = donations.filter((d) => filter === 'month' ? d.createdAt >= monthStart || !paid(d) : filter === 'pending' ? !paid(d) : filter === 'receipt' ? d.receiptWanted && !d.receiptSent : filter === 'memorial' ? !!d.memorial : filter === 'year' ? d.createdAt >= yearStart : true);
  const approve = (d: Donation) => setDonation(ctx.actor, d, { paymentStatus: 'paid' }).then(() => toast({ text: `${d.name} · ${money(d.amount)} · אושר`, action: { label: 'ביטול', onClick: () => setDonation(ctx.actor, d, { paymentStatus: d.paymentStatus }) } }, 5000));
  const receipt = (d: Donation) => setDonation(ctx.actor, d, { receiptSent: true }).then(() => toast({ text: 'סומן: הקבלה נשלחה' }, 2500));
  const thanks = (d: Donation) => waLink(d.phone, fillTemplate(ctx.settings.templates.donationThanks, { 'שם': firstName(d.name), 'סכום': d.amount }));
  const payPill = (d: Donation) => <Pill tone={paid(d) ? 'ok' : 'ochre'}>{PAYMENT_LABELS[d.paymentStatus]}</Pill>;
  const recPill = (d: Donation) => d.receiptWanted ? <Pill tone={d.receiptSent ? 'ok' : 'ochre'}>{d.receiptSent ? 'נשלחה' : desktop ? 'צריך קבלה' : `צריך קבלה · ${d.receiptName || d.name}`}</Pill> : <span className="muted">בלי קבלה</span>;
  const acts = (d: Donation) => <>{!paid(d) && <Btn size="xs" onClick={() => approve(d)}>אישור תשלום</Btn>}{d.phone && <a className="btn ghost xs" href={thanks(d)} target="_blank" rel="noopener"><Icon name="whatsapp" size={14} />תודה</a>}{d.receiptWanted && !d.receiptSent && paid(d) && <Btn size="xs" kind="ghost" onClick={() => receipt(d)}>הקבלה נשלחה</Btn>}</>;
  const chips = <Chips scroll={!desktop} value={filter} onChange={setFilter} options={[{ value: 'month', label: 'החודש' }, { value: 'pending', label: 'ממתינות', n: pending.length || undefined }, { value: 'receipt', label: 'צריך קבלה', n: receipts.length || undefined }, { value: 'memorial', label: 'עם הנצחה' }, { value: 'year', label: 'השנה' }, { value: 'all', label: 'הכל' }]} />;
  const donationExport = () => ({
    filename: 'תרומות.csv',
    headers: ['תאריך', 'מי', 'טלפון', 'סכום', 'כותרת', 'הנצחה', 'הערה', 'תשלום', 'קבלה'],
    rows: donations.map((donation) => [
      fmtDate(donation.createdAt), donation.name, donation.phone, donation.amount, donation.label,
      donation.memorial, donation.note, PAYMENT_LABELS[donation.paymentStatus],
      donation.receiptWanted ? (donation.receiptSent ? 'נשלחה' : 'צריך · ' + donation.receiptName) : '',
    ]),
  });
  return (
    <>
      <Top backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="תרומות" sub="אישור העברות, קבלות ידניות, ותודה אישית בוואטסאפ." end={<><Btn kind="ghost" size="sm" to="/manage/settings/donations">סכומים מוגדרים</Btn><ExportActions getData={donationExport} /></>} />
      {desktop ? <div className="cols4"><div className="stat"><b>{money(sumM)}</b><span>החודש · {donations.filter((d) => paid(d) && d.createdAt >= monthStart).length} תורמים</span></div><div className="stat"><b>{money(sumY)}</b><span>השנה · {donations.filter((d) => paid(d) && d.createdAt >= yearStart).length} תורמים</span></div><div className="stat" style={pending.length ? { background: 'var(--ochre-bg)' } : undefined}><b className={pending.length ? 'ochre' : ''}>{money(pending.reduce((s, d) => s + d.amount, 0))}</b><span>ממתין לאישור · {pending.length}</span></div><div className="stat"><b>{receipts.length}</b><span>קבלות לשלוח</span></div></div>
        : <Ledger items={[{ n: money(sumM), label: 'החודש' }, { n: money(sumY), label: 'השנה' }, { n: money(pending.reduce((s, d) => s + d.amount, 0)), label: 'ממתין', tone: pending.length ? 'ochre' : undefined }]} small />}
      <div style={{ paddingTop: 12, paddingInline: desktop ? 20 : 0 }}>{chips}</div>
      {!list.length && <Empty title="אין תרומות כאלה" />}
      {desktop ? <div className="tablewrap"><table><thead><tr><th>תאריך</th><th>מי</th><th>סכום</th><th className="opt">כותרת</th><th className="opt">הנצחה · הערה</th><th>תשלום</th><th>קבלה</th><th className="opt"></th></tr></thead><tbody>{list.map((d) => <tr key={d.id} className={'link ' + (d.id === selectedId ? 'sel' : '') + (paid(d) && !(d.receiptWanted && !d.receiptSent) ? ' sub' : '')} onClick={() => navigate(`/manage/donations/${d.id}`)}><td style={{ whiteSpace: 'nowrap' }}>{dayLabel(d.createdAt.slice(0, 10))}</td><td style={{ fontWeight: 600 }}>{d.name}</td><td className="money" style={{ fontSize: 18 }}>{money(d.amount)}</td><td className="opt">{d.label}</td><td className="muted wrap opt">{d.memorial ? `לזכר ${d.memorial}` : ''}{d.memorial && d.note ? ' · ' : ''}{d.note ? `"${d.note}"` : ''}{!d.memorial && !d.note ? '—' : ''}</td><td>{payPill(d)}</td><td>{recPill(d)}</td><td className="opt"><div className="acts" onClick={(e) => e.stopPropagation()}>{acts(d)}</div></td></tr>)}</tbody></table></div>
        : <div className="list">{list.map((d) => <div key={d.id} className="row"><Avatar name={d.name} light={paid(d)} /><div className="main"><A to={`/manage/donations/${d.id}`} className="title">{d.name}</A><div className="meta"><span>{d.label} · {dayLabel(d.createdAt.slice(0, 10))}</span>{payPill(d)}{d.receiptWanted && !d.receiptSent && <Pill tone="ochre">צריך קבלה</Pill>}</div>{(d.memorial || d.note) && <div className="meta">{d.memorial && <span>לזכר {d.memorial}</span>}{d.note && <span>"{d.note}"</span>}</div>}{(!paid(d) || (d.receiptWanted && !d.receiptSent)) && <div className="inline" style={{ marginTop: 8 }}>{acts(d)}</div>}</div><span className="amount">{money(d.amount)}</span></div>)}</div>}
    </>
  );
}
export function DonationDetailScreen({ id, ctx, panel }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: d, loading } = useDonation(id); const toast = useToast();
  const donor = usePerson(d?.uid || '', !!d?.uid); const all = useDonations(true); const log = useActivityFor('donation', id); const inbox = useNotifications(true);
  if (loading) return <Loading />;
  if (!d) return <Empty title="התרומה לא נמצאה" />;
  const paid = d.paymentStatus === 'paid' || d.paymentStatus === 'paid_onsite';
  const count = all.items.filter((x) => x.uid === d.uid).length;
  const approve = () => setDonation(ctx.actor, d, { paymentStatus: 'paid' }).then(() => handleNotificationsFor(inbox.items, d.id, ctx.actor)).then(() => toast({ text: 'התשלום אושר' }, 2500));
  return (
    <>
      <Top backTo={panel ? undefined : '/manage/donations'} back={panel} backLabel={panel ? 'סגירה' : 'תרומות'} title={`תרומה · ${d.name}`} date={whenText(d.createdAt)} end={<Pill tone={paid ? 'ok' : 'ochre'}>{PAYMENT_LABELS[d.paymentStatus]}</Pill>} />
      <div className={'paybox ' + (paid ? 'ok' : '')} style={{ marginTop: 10 }}><b>{money(d.amount)}</b>{d.label}{d.memorial ? ` · הנצחה: לזכר ${d.memorial}` : ''}</div>
      {d.note && <blockquote className="quote" style={{ marginTop: 12 }}>"{d.note}"</blockquote>}
      {donor.item ? <Row center to={`/manage/people/${donor.item.uid}`} start={<Avatar name={donor.item.displayName} />} title={donor.item.displayName} meta={<><span className="ltr">{donor.item.phone}</span><span>לקוח/ה #{donor.item.customerNumber} · {count} תרומות עד היום</span></>} chev /> : <dl className="kv"><dt>טלפון</dt><dd className="ltr">{d.phone || '—'}</dd></dl>}
      <dl className="kv"><dt>קבלה</dt><dd>{d.receiptWanted ? <>{d.receiptSent ? <Pill tone="ok">נשלחה</Pill> : <Pill tone="ochre">צריך/ה קבלה</Pill>} על שם: {d.receiptName || d.name}</> : <span className="muted">לא ביקש/ה</span>}</dd><dt>אמצעי</dt><dd>{d.paymentStatus === 'claimed' ? `סימן/ה "העברתי" · ${whenText(d.updatedAt)}` : d.paymentStatus === 'pending' ? 'עוד לא סימן/ה שהעביר/ה' : PAYMENT_LABELS[d.paymentStatus]}</dd></dl>
      <div className="inline pad" style={{ paddingTop: 12 }}>{d.phone && <><a className="btn ghost sm" href={waLink(d.phone, fillTemplate(ctx.settings.templates.donationThanks, { 'שם': firstName(d.name), 'סכום': d.amount }))} target="_blank" rel="noopener"><Icon name="whatsapp" size={18} />תודה בוואטסאפ</a><a className="btn ghost sm" href={telLink(d.phone)}><Icon name="phone" size={18} />התקשרות</a></>}</div>
      <Sec title="היסטוריה" />
      <div className="list">{log.items.map((a) => <Row key={a.id} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}</span>} meta={<span>{whenText(a.at)}</span>} />)}<Row center title={<span style={{ fontSize: 15, fontWeight: 500 }}>התרומה נרשמה מהאפליקציה · התראה למנהלים</span>} meta={<span>{whenText(d.createdAt)}</span>} /></div>
      <div className="actions sticky">{!paid && <Btn size="big" icon="check" onClick={approve}>אישור תשלום</Btn>}{d.receiptWanted && !d.receiptSent && <Btn kind="ghost" onClick={() => setDonation(ctx.actor, d, { receiptSent: true }).then(() => toast({ text: 'סומן: הקבלה נשלחה' }, 2500))}>הקבלה נשלחה</Btn>}{paid && <Btn kind="quiet" size="sm" onClick={() => setDonation(ctx.actor, d, { paymentStatus: 'claimed' })}>להחזיר לממתין</Btn>}</div>
    </>
  );
}

// ---------- reports ----------
export function ReportsScreen({ ctx }: { ctx: TeamCtx }) {
  const today = todayISO(); const desktop = useDesktop();
  const [range, setRange] = useState<'month' | '3m' | 'year'>('month');
  const fromKey = range === 'month' ? today.slice(0, 8) + '01' : range === '3m' ? addDays(today, -90) : today.slice(0, 5) + '01-01';
  const from = fromKey + 'T00:00:00.000Z';
  const tasks = useHistoryTasks(true, true, from, today + 'T23:59:59.999Z'); const open = useOpenTasks(true, true);
  const donations = useDonations(true); const tickets = useList<Ticket>('tickets', { where: [['createdAt', '>=', from]], orderBy: [['createdAt', 'desc']], limit: 3000 });
  const openT = useOpenTickets(true); const openTabs = useOpenTabs(true); const events = useAllEvents(true);
  const people = useList<Profile>('users', { orderBy: [['createdAt', 'desc']] });
  const visits = useList<Visit>('visits', { orderBy: [['createdAt', 'desc']], limit: 500 });
  const days = Math.max(1, Math.round((new Date(today).getTime() - new Date(fromKey).getTime()) / 86400_000) + 1);
  const perPerson = useMemo(() => { const m = new Map<string, number>(); for (const t of tasks.items) if (t.doneBy) m.set(t.doneBy.name, (m.get(t.doneBy.name) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [tasks.items]);
  const max = perPerson[0]?.[1] || 1;
  const recurring = tasks.items.filter((t) => t.templateId); const onTime = recurring.filter((t) => { const tpl = ctx.templates.find((x) => x.id === t.templateId); return !tpl?.time || (t.doneAt && fmtTime(t.doneAt) <= tpl.time); }).length;
  const paidD = donations.items.filter((d) => d.createdAt >= from && (d.paymentStatus === 'paid' || d.paymentStatus === 'paid_onsite'));
  const paidT = tickets.items.filter((t) => t.status === 'valid' && (t.paymentStatus === 'paid' || t.paymentStatus === 'paid_onsite'));
  const openSum = openT.items.filter((t) => t.status === 'valid').reduce((s, t) => s + t.price, 0) + openTabs.items.reduce((s, t) => s + t.total, 0);
  const newPeople = people.items.filter((p) => p.createdAt >= from); const approvedV = visits.items.filter((v) => v.status === 'approved' && v.createdAt >= from); const reqV = visits.items.filter((v) => v.createdAt >= from);
  const source = useMemo(() => { const m = new Map<string, number>(); for (const p of people.items) { const s = p.fields?.source || 'לא ענו'; m.set(s, (m.get(s) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [people.items]);
  const label = range === 'month' ? 'החודש' : range === '3m' ? '3 חודשים' : 'השנה';
  const taskExport = () => ({
    filename: `משימות ${label}.csv`,
    headers: ['משימה', 'בוצע על ידי', 'מתי', 'חוזרת'],
    rows: tasks.items.map((task) => [task.title, task.doneBy?.name || '', task.doneAt || '', task.templateId ? 'כן' : '']),
  });
  const moneyExport = () => ({
    filename: `כסף ${label}.csv`,
    headers: ['סעיף', 'סכום'],
    rows: [
      ['תרומות ששולמו', paidD.reduce((sum, donation) => sum + donation.amount, 0)],
      ['כרטיסים ששולמו', paidT.reduce((sum, ticket) => sum + ticket.price, 0)],
      ['חובות פתוחים', openSum],
    ],
  });
  return (
    <>
      <Top backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="דוחות" sub="משימות, כסף ואנשים לפי תקופה. כל טבלה ניתנת לייצוא לאקסל." />
      <div className="inline pad"><Chips value={range} onChange={setRange} options={[{ value: 'month', label: 'החודש' }, { value: '3m', label: '3 חודשים' }, { value: 'year', label: 'השנה' }]} /></div>
      <div className={desktop ? 'cols' : ''}>
        <div>
          <Sec title="משימות · מי ביצע"><ExportActions getData={taskExport} downloadLabel="ייצוא" /></Sec>
          <Ledger small items={[{ n: tasks.items.length, label: 'בוצעו' }, { n: (tasks.items.length / days).toFixed(1), label: 'ביום' }, ...(recurring.length ? [{ n: `${Math.round((onTime / recurring.length) * 100)}%`, label: 'חוזרות בזמן' }] : []), { n: open.items.filter((t) => t.dueDate && t.dueDate < today).length, label: 'פתוחות באיחור', tone: open.items.some((t) => t.dueDate && t.dueDate < today) ? 'rust' : undefined }]} />
          <div className="bars" style={{ paddingTop: 14 }}>{perPerson.slice(0, 6).map(([n, c]) => <div className="bar" key={n}><span>{n}</span><i style={{ width: `${(c / max) * 100}%` }} /><b>{c}</b></div>)}{!perPerson.length && <p className="lead" style={{ padding: 0 }}>אין משימות שבוצעו בתקופה.</p>}</div>
          <Sec title="כסף"><ExportActions getData={moneyExport} downloadLabel="ייצוא" /></Sec>
          <div className="list">
            <Row center to="/manage/donations" title="תרומות ששולמו" meta={<span>{new Set(paidD.map((d) => d.uid)).size} תורמים · {donations.items.filter((d) => d.receiptWanted && !d.receiptSent).length} קבלות ממתינות</span>} end={<span className="amount">{money(paidD.reduce((s, d) => s + d.amount, 0))}</span>} />
            <Row center to="/manage/events" title="כרטיסים ששולמו" meta={<span>{paidT.length} כרטיסים · {new Set(paidT.map((t) => t.eventId)).size} אירועים</span>} end={<span className="amount">{money(paidT.reduce((s, t) => s + t.price, 0))}</span>} />
            <Row center title={<span style={{ color: openSum ? 'var(--ochre)' : undefined }}>חובות פתוחים, כל האירועים</span>} meta={<span>{openTabs.items.length} חשבונות דוכן · {new Set(openT.items.filter((t) => t.status === 'valid').map((t) => t.orderId)).size} הזמנות כרטיסים</span>} end={<span className="amount" style={{ color: openSum ? 'var(--ochre)' : undefined }}>{money(openSum)}</span>} />
          </div>
        </div>
        <div>
          <Sec title="אנשים" link={desktop ? 'כל האנשים' : undefined} linkTo="/manage/people" />
          <Ledger small items={[{ n: newPeople.length, label: 'נרשמים חדשים' }, { n: approvedV.length, label: `ביקורים אושרו${reqV.length ? ` · מ־${reqV.length}` : ''}` }, { n: people.items.filter((p) => p.status === 'blocked').length, label: 'חסומים' }]} />
          {source.length > 1 && <><Sec title="איך שמעו עלינו" /><div className="bars">{source.slice(0, 5).map(([n, c]) => <div className="bar" key={n}><span>{n}</span><i style={{ width: `${(c / (source[0][1] || 1)) * 100}%`, background: n === 'לא ענו' ? 'var(--line)' : undefined }} /><b>{c}</b></div>)}</div></>}
          <Sec title="אירועים" link="כל האירועים" linkTo="/manage/events" />
          {desktop ? <div className="tablewrap" style={{ margin: '8px 20px 0' }}><table><thead><tr><th>אירוע</th><th>כרטיסים</th><th>הגיעו</th><th>מחיר</th></tr></thead><tbody>{events.items.filter((e) => e.end < new Date().toISOString()).slice(0, 6).map((e) => <EvRow key={e.id} e={e} />)}</tbody></table></div>
            : <div className="list">{events.items.filter((e) => e.end < new Date().toISOString()).slice(0, 4).map((e) => <EvRow key={e.id} e={e} row />)}</div>}
        </div>
      </div>
    </>
  );
}
function EvRow({ e, row }: { e: { id: string; title: string; start: string; price: number }; row?: boolean }) {
  const t = useEventTickets(e.id, true); const v = t.items.filter((x) => x.status === 'valid'); const a = v.filter((x) => x.entries > 0).length;
  if (row) return <Row center to={`/manage/events/${e.id}/report`} title={e.title} meta={<span>{fmtDate(e.start)} · {a} הגיעו מתוך {v.length}</span>} chev />;
  return <tr className="link" onClick={() => navigate(`/manage/events/${e.id}/report`)}><td style={{ fontWeight: 600 }}>{e.title} <span className="muted">{fmtDate(e.start)}</span></td><td>{v.length}</td><td>{v.length ? `${Math.round((a / v.length) * 100)}%` : '—'}</td><td className="muted">{e.price ? money(e.price) : 'חינם'}</td></tr>;
}

// ---------- activity feed ----------
export function ActivityScreen({ ctx }: { ctx: TeamCtx }) {
  const desktop = useDesktop();
  const [kind, setKind] = useState<ActivityKind | 'all'>('all'); const [who, setWho] = useState(''); const [q, setQ] = useState('');
  const acts = useActivityByKind(kind, true, 400);
  const people = useMemo(() => [...new Map(acts.items.map((a) => [a.by.uid, a.by.name])).entries()].slice(0, 8), [acts.items]);
  const list = acts.items.filter((a) => (!who || a.by.uid === who) && (!q || a.text.includes(q) || a.by.name.includes(q)));
  const byDay = useMemo(() => { const m = new Map<string, typeof list>(); for (const a of list) m.set(a.at.slice(0, 10), [...(m.get(a.at.slice(0, 10)) || []), a]); return [...m.entries()]; }, [list]);
  const kinds: (ActivityKind | 'all')[] = ['all', 'task', 'shopping', 'ticket', 'tab', 'visit', 'donation', 'user', 'event', 'settings'];
  const activityExport = () => ({
    filename: 'פעילות.csv',
    headers: ['מתי', 'מי', 'פעולה', 'מה', 'סוג'],
    rows: list.map((entry) => [entry.at, entry.by.name, ACTION_LABELS[entry.action] || entry.action, entry.text, KIND_LABELS[entry.kind]]),
  });
  return (
    <>
      <Top backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="כל הפעילות" sub="כל מה שקרה בחווה, לפי זמן. נשמר לתמיד. כאן מוצאים את המקדח אחרי שבוע." end={<ExportActions getData={activityExport} />} />
      <div className="inline pad"><Input placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} style={{ minHeight: 44, flex: 1, minWidth: 160 }} /></div>
      <div style={{ paddingTop: 10, paddingInline: desktop ? 20 : 0, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chips scroll={!desktop} value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: k === 'all' ? 'הכל' : KIND_LABELS[k] }))} />
        {desktop && <><span className="muted">·</span><Chips value={who} onChange={setWho} options={[{ value: '', label: 'כולם' }, ...people.map(([u, n]) => ({ value: u, label: firstName(n) }))]} /></>}
      </div>
      {acts.loading && !list.length && <Loading />}
      {desktop ? <div className="tablewrap"><table><thead><tr><th>מתי</th><th>מי</th><th>מה</th><th>סוג</th></tr></thead><tbody>{byDay.map(([day, items]) => <Fragment key={day}>
        <tr className="sub"><td colSpan={4} style={{ fontWeight: 700, color: 'var(--ink)', background: 'var(--paper2)' }}>{dayLabel(day) === fmtWeekday(day) + ' ' + fmtDate(day) ? fmtDayLong(day) : `${dayLabel(day)}, ${fmtDayLong(day)}`}</td></tr>
        {items.map((a) => <tr key={a.id}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtTime(a.at)}</td><td style={{ fontWeight: 600 }}>{a.by.name}</td><td className="wrap">{ACTION_LABELS[a.action] || a.action}: {a.text}</td><td className="muted">{KIND_LABELS[a.kind]}</td></tr>)}</Fragment>)}</tbody></table></div>
        : byDay.map(([day, items]) => <div key={day}><Sec title={dayLabel(day) === fmtWeekday(day) + ' ' + fmtDate(day) ? fmtDayLong(day) : `${dayLabel(day)}, ${fmtWeekday(day)}`} n={items.length} /><div className="list">{items.map((a) => <Row key={a.id} center start={<Avatar name={a.by.name} size="sm" light />} title={<span style={{ fontSize: 15, fontWeight: 500 }}>{firstName(a.by.name)} · {ACTION_LABELS[a.action] || a.action}: {a.text}</span>} meta={<span>{fmtTime(a.at)} · {KIND_LABELS[a.kind]}</span>} />)}</div></div>)}
      {!acts.loading && !list.length && <Empty title="אין פעילות כזו" />}
    </>
  );
}

// ---------- settings ----------
export function SettingsScreen({ ctx }: { ctx: TeamCtx }) {
  const s = ctx.settings; const desktop = useDesktop(); const toast = useToast();
  const [intro, setIntro] = useState<string | null>(null);
  const owners = ctx.team.filter((p) => p.role === 'owner').length, managers = ctx.team.filter((p) => p.role === 'manager').length;
  return (
    <>
      <Top backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="הגדרות" sub="כל נושא הוא דף משלו. נשמר מיד." />
      <div className="links" style={{ paddingTop: 10 }}>
        <A to="/manage/settings/payments"><Icon name="ticket" />תשלומים<span className="s">{[s.payment.bit && `ביט ${s.payment.bit}`, s.payment.paybox && 'PayBox', s.payment.cash && 'מזומן'].filter(Boolean).join(' · ') || 'לא הוגדר'}</span><Icon name="chev" className="chev" size={18} /></A>
        <A to="/manage/settings/donations"><Icon name="heart" />סכומי תרומה<span className="s">{s.donationPresets.map((p) => `${p.amount} ₪`).join(' · ')} + סכום</span><Icon name="chev" className="chev" size={18} /></A>
        <A to="/manage/settings/visit-types"><Icon name="pin" />סוגי ביקור<span className="s">{s.visitTypes.join(', ')}</span><Icon name="chev" className="chev" size={18} /></A>
        <A to="/manage/settings/questions"><Icon name="list" />שאלות הרשמה נוספות<span className="s">{s.registrationFields.length ? s.registrationFields.map((f) => f.label).join(', ') : 'רק שם וטלפון'}</span><Icon name="chev" className="chev" size={18} /></A>
        <A to="/manage/settings/whatsapp"><Icon name="whatsapp" />הודעות מוכנות לוואטסאפ<span className="s">אישור ביקור, תודה, תזכורות</span><Icon name="chev" className="chev" size={18} /></A>
        {ctx.owner && <A to="/manage/settings/managers"><Icon name="people" />מנהלים ובעלים<span className="s">{owners} בעלים · {managers} מנהלים</span><Icon name="chev" className="chev" size={18} /></A>}
        <A to="/terms"><Icon name="info" />תנאי שימוש ופרטיות<span className="s">הנוסח שהאורח מאשר</span><Icon name="chev" className="chev" size={18} /></A>
        <a href="/admin" target="_blank" rel="noopener"><Icon name="external" />עריכת האתר<span className="s">טקסטים ותמונות באתר התדמית, נפתח בחלון נפרד</span><Icon name="chev" className="chev" size={18} /></a>
      </div>
      <Field label="משפט פתיחה לאורחים" hint="מופיע בראש דף הבית של האורח."><Textarea rows={2} value={intro ?? s.guestIntro} onChange={(e) => setIntro(e.target.value)} /></Field>
      {intro !== null && intro !== s.guestIntro && <div className="actions"><Btn onClick={() => saveSettings(ctx.actor, { ...s, guestIntro: intro.trim() }).then(() => { setIntro(null); toast({ text: 'נשמר' }, 2000); })}>שמירה</Btn></div>}
    </>
  );
}
export type SettingsPageKey = 'payments' | 'donations' | 'visit-types' | 'questions' | 'whatsapp' | 'managers';
export function SettingsPage({ ctx, page }: { ctx: TeamCtx; page: SettingsPageKey }) {
  const toast = useToast();
  const [s, setS] = useState<Settings>(() => structuredClone(ctx.settings));
  const dirty = JSON.stringify(s) !== JSON.stringify(ctx.settings);
  const save = () => saveSettings(ctx.actor, s).then(() => { toast({ text: 'נשמר' }, 2000); navigate('/manage/settings', true); }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const foot = <div className="actions sticky"><Btn size="big" disabled={!dirty} onClick={save}>שמירה</Btn></div>;
  if (page === 'payments') return (
    <>
      <Top backTo="/manage/settings" backLabel="הגדרות" title="תשלומים" sub="מה האורח רואה כשצריך לשלם על כרטיס, תרומה או חשבון דוכן." />
      <Field label="מספר ביט"><Input dir="ltr" inputMode="tel" value={s.payment.bit} onChange={(e) => setS({ ...s, payment: { ...s.payment, bit: e.target.value } })} /></Field>
      <Field label="קישור PayBox"><Input dir="ltr" value={s.payment.paybox} onChange={(e) => setS({ ...s, payment: { ...s.payment, paybox: e.target.value } })} /></Field>
      <Field label="הערה לתשלום (לא חובה)"><Input value={s.payment.note} onChange={(e) => setS({ ...s, payment: { ...s.payment, note: e.target.value } })} placeholder="בהעברה לציין את שם האירוע ושם המזמין" /></Field>
      <div style={{ marginTop: 14 }}><SwitchRow on={s.payment.cash} onChange={(cash) => setS({ ...s, payment: { ...s.payment, cash } })} title="מזומן בכניסה" meta='המתנדב בשער מסמן "שולם במקום"' /><SwitchRow on={false} onChange={() => toast({ text: 'יופעל כשיחובר ספק סליקה (משולם / PayPlus / קארדקום).' }, 4000)} title="אשראי באתר" meta="המסך בנוי. יופעל כשייבחר ספק סליקה." /></div>
      <Sec title="איך זה נראה לאורח" />
      <div className="paybox"><b>ממתין לתשלום · 150 ₪</b>{[s.payment.bit && `ביט ${s.payment.bit}`, s.payment.paybox && 'PayBox', s.payment.cash && 'או מזומן בשער'].filter(Boolean).join(' · ')}{s.payment.note && <><br />{s.payment.note}</>}</div>
      {foot}
    </>
  );
  if (page === 'donations') return (
    <>
      <Top backTo="/manage/settings" backLabel="הגדרות" title="סכומי תרומה" sub="הכפתורים בדף התרומה. אפשר לשנות לפי עונה או אירוע." />
      <div className="list" style={{ marginTop: 10 }}>{s.donationPresets.map((p, i) => <div key={i} className="row center"><Input dir="ltr" type="number" inputMode="numeric" style={{ maxWidth: 110 }} value={p.amount} onChange={(e) => setS({ ...s, donationPresets: s.donationPresets.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) || 0 } : x) })} /><Input placeholder="כותרת (חי, לב…)" value={p.label} onChange={(e) => setS({ ...s, donationPresets: s.donationPresets.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} /><button type="button" className="iconbtn" aria-label="הסרה" onClick={() => setS({ ...s, donationPresets: s.donationPresets.filter((_, j) => j !== i) })}><Icon name="x" size={18} /></button></div>)}</div>
      <div className="inline pad" style={{ paddingTop: 12 }}><Btn kind="ghost" size="sm" icon="plus" onClick={() => setS({ ...s, donationPresets: [...s.donationPresets, { amount: 0, label: '' }] })}>סכום</Btn></div>
      <p className="note">"סכום אחר" והנצחה ("לזכר…") מופיעים תמיד בדף התרומה. קיר הנצחה ציבורי באתר: עדיין פתוח לדיון.</p>
      <Sec title="תצוגה מקדימה" /><div className="chips" style={{ padding: '4px 20px 0' }}>{s.donationPresets.filter((p) => p.amount > 0).map((p, i) => <span key={i} className="chip"><b>{money(p.amount)}</b> {p.label}</span>)}<span className="chip">סכום אחר</span></div>
      {foot}
    </>
  );
  if (page === 'visit-types') return (
    <>
      <Top backTo="/manage/settings" backLabel="הגדרות" title="סוגי ביקור" sub="האפשרויות שהאורח בוחר בטופס תיאום הביקור. הסדר כאן הוא הסדר בטופס." />
      <div className="list" style={{ marginTop: 10 }}>{s.visitTypes.map((t, i) => <div key={i} className="row center"><div style={{ display: 'flex', flexDirection: 'column' }}><button type="button" className="iconbtn" style={{ height: 24 }} disabled={i === 0} onClick={() => { const v = [...s.visitTypes]; [v[i - 1], v[i]] = [v[i], v[i - 1]]; setS({ ...s, visitTypes: v }); }} aria-label="למעלה"><Icon name="down" size={14} /></button><button type="button" className="iconbtn" style={{ height: 24 }} disabled={i === s.visitTypes.length - 1} onClick={() => { const v = [...s.visitTypes]; [v[i + 1], v[i]] = [v[i], v[i + 1]]; setS({ ...s, visitTypes: v }); }} aria-label="למטה"><Icon name="down" size={14} /></button></div><Input value={t} onChange={(e) => setS({ ...s, visitTypes: s.visitTypes.map((x, j) => j === i ? e.target.value : x) })} /><button type="button" className="iconbtn" aria-label="הסרה" onClick={() => setS({ ...s, visitTypes: s.visitTypes.filter((_, j) => j !== i) })}><Icon name="x" size={18} /></button></div>)}</div>
      <div className="inline pad" style={{ paddingTop: 12 }}><Btn kind="ghost" size="sm" icon="plus" onClick={() => setS({ ...s, visitTypes: [...s.visitTypes, ''] })}>סוג ביקור</Btn></div>
      <p className="note">ימים שאפשר לבקש (למשל בלי ראשון): בשלב הבא. כרגע כל יום פתוח לבקשה, והמנהל מחליט.</p>
      {foot}
    </>
  );
  if (page === 'questions') {
    const fields = s.registrationFields;
    const setF = (i: number, p: Partial<RegistrationField>) => setS({ ...s, registrationFields: fields.map((f, j) => j === i ? { ...f, ...p } : f) });
    return (
      <>
        <Top backTo="/manage/settings" backLabel="הגדרות" title="שאלות הרשמה נוספות" sub='בהרשמה שואלים רק שם וטלפון. כל שאלה כאן קופצת בכניסה הבאה כ"השלמת פרטים", ואפשר לדחות.' />
        {fields.map((f, i) => <div key={f.id} style={{ borderBottom: '1px solid var(--line2)', paddingBottom: 14 }}>
          <Field label={`שאלה ${i + 1}`}><Input value={f.label} onChange={(e) => setF(i, { label: e.target.value })} /></Field>
          <div className="inline pad" style={{ paddingTop: 10 }}><Chips value={f.type} onChange={(type) => setF(i, { type })} options={[{ value: 'text', label: 'טקסט' }, { value: 'choice', label: 'בחירה' }, { value: 'date', label: 'תאריך' }]} /><Chip on={f.required} onClick={() => setF(i, { required: !f.required })}>חובה</Chip><Btn size="xs" kind="quiet" onClick={() => setS({ ...s, registrationFields: fields.filter((_, j) => j !== i) })}>הסרה</Btn></div>
          {f.type === 'choice' && <Field label="אפשרויות (מופרדות בפסיק)"><Input value={f.options.join(', ')} onChange={(e) => setF(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>}
          <AnsweredCount f={f} />
        </div>)}
        <div className="inline pad" style={{ paddingTop: 12 }}><Btn kind="ghost" size="sm" icon="plus" onClick={() => setS({ ...s, registrationFields: [...fields, { id: 'f' + Date.now().toString(36), label: '', type: 'text', options: [], required: false }] })}>שאלה</Btn></div>
        <Sec title="איך זה נראה לאורח" /><div className="strip"><Icon name="user" size={18} /><span>רוצים להשלים כמה פרטים? {fields.map((f) => f.label).filter(Boolean).join(', ') || '…'}. לוקח רגע, אפשר אחר כך.</span></div>
        {foot}
      </>
    );
  }
  if (page === 'whatsapp') {
    const keys: { k: keyof Settings['templates']; t: string }[] = [{ k: 'visitApproved', t: 'אישור ביקור' }, { k: 'donationThanks', t: 'תודה על תרומה' }, { k: 'debtReminder', t: 'תזכורת חוב' }, { k: 'ticketReminder', t: 'תזכורת לאירוע' }, { k: 'vendorInvite', t: 'הזמנת בעל דוכן' }];
    return (
      <>
        <Top backTo="/manage/settings" backLabel="הגדרות" title="הודעות מוכנות לוואטסאפ" sub="הכפתור באפליקציה פותח וואטסאפ עם הטקסט מוכן. המערכת לא שולחת בעצמה." />
        <div className="inline pad">{['[שם]', '[תאריך]', '[אירוע]', '[סכום]', '[שעה]'].map((p) => <span key={p} className="pill gold ltr">{p}</span>)}</div>
        {keys.map(({ k, t }) => <Field key={k} label={t}><Textarea rows={3} value={s.templates[k] || ''} onChange={(e) => setS({ ...s, templates: { ...s.templates, [k]: e.target.value } })} /></Field>)}
        <Sec title="תצוגה מקדימה · תזכורת חוב" /><blockquote className="quote">{fillTemplate(s.templates.debtReminder, { 'שם': 'רוני לוי', 'אירוע': 'יריד אוקטובר', 'סכום': 46 })}</blockquote>
        {foot}
      </>
    );
  }
  return <ManagersPage ctx={ctx} />;
}
function AnsweredCount({ f }: { f: RegistrationField }) {
  const people = useList<Profile>('users', { orderBy: [['displayName', 'asc']] });
  const n = people.items.filter((p) => (p.fields?.[f.id] || '').trim()).length;
  return <p className="lead" style={{ fontSize: 13 }}>{n ? `ענו: ${n} מתוך ${people.items.length}` : 'חדש, עוד לא נשאל'}</p>;
}
function ManagersPage({ ctx }: { ctx: TeamCtx }) {
  const owners = ctx.team.filter((p) => p.role === 'owner'), managers = ctx.team.filter((p) => p.role === 'manager'), staff = ctx.team.filter((p) => p.role === 'staff' && p.status === 'active');
  const acts = useActivityByKind('user', true, 20);
  return (
    <>
      <Top backTo="/manage/settings" backLabel="הגדרות" title="מנהלים ובעלים" sub="רק בעלים יכולים למנות ולהסיר. כל שינוי נרשם בהיסטוריה." end={<Btn size="sm" kind="ghost" to="/manage/people/invite">לפי מייל</Btn>} />
      <Sec title="בעלים" n={owners.length} /><div className="list">{owners.map((p) => <Row key={p.uid} to={`/manage/people/${p.uid}`} center start={<Avatar name={p.displayName} />} title={<>{p.displayName}{p.uid === ctx.actor.uid && <span className="muted" style={{ fontWeight: 400 }}> · את/ה</span>}</>} meta={<span className="ltr">{p.email}</span>} chev />)}</div>
      <Sec title="מנהלים" n={managers.length} /><div className="list">{managers.map((p) => <Row key={p.uid} to={`/manage/people/${p.uid}`} center start={<Avatar name={p.displayName} />} title={p.displayName} meta={<span>מנהל/ת מאז {fmtMonthYear(p.log?.find((l) => l.text.includes('מנהל'))?.at || p.createdAt)}</span>} chev />)}{!managers.length && <p className="lead">אין מנהלים מלבד הבעלים.</p>}</div>
      <Sec title="צוות ומתנדבים" n={staff.length} link="כולם באנשים" linkTo="/manage/people" /><p className="lead ink">{staff.map((p) => firstName(p.displayName)).slice(0, 8).join(' · ')}{staff.length > 8 ? ` + ${staff.length - 8}` : ''}</p>
      <Sec title="שינויים אחרונים" /><div className="list">{acts.items.filter((a) => ['role', 'invited', 'blocked', 'unblocked'].includes(a.action)).slice(0, 8).map((a) => <Row key={a.id} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{firstName(a.by.name)} · {a.text}</span>} meta={<span>{whenText(a.at)}</span>} />)}</div>
    </>
  );
}

