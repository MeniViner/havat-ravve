// M10 reports, N3 donations, N4 one donation.
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, useRemove, waUrl, telUrl } from '../../core';
import {
  BarList, BottomBar, Button, Card, Chip, ChipRow, DetailList, DetailRow, EmptyState, Icon, ListCard, PageTitle, Quote, Row, SectionHeader,
  IconButton, SectionTitle, StatRow, StatTile, Tag, TextLink, TopBar, ConfirmSheet,
} from '../../kit';
import { money, num, dayTime, ddmm, daysFromToday, relDay, firstName, keyOf, hhmm } from '../../format';
import { contactPhoneOk, setDonation, useAllEvents, useEventTickets, useVisits } from '../../../data';
import { useHistoryTasks, useOpenTasks, usePeople as usePeopleAll } from '../../../store';
import { useActivityFor, ACTION_LABELS } from '../../../activity';
import { nowIso } from '../../../clock';
import { PAYMENT_LABELS, DEFAULT_SETTINGS } from '../../../types';
import type { Donation, FarmEvent } from '../../../types';
import { PayConfirm } from '../events/payconfirm';
import {
  useActivityAll, useDonations, useDonation, useTicketsSince, useOpenTickets, useOpenTabs, useNotifications, useMyTickets, useMyVisits, useMyDonations, usePerson,
  buildReport, periodStart, donationTotals, donationsIn, recurringOnTime, peopleStats, heardFrom, needsReceipt, awaitsApproval, isPaid, gw, fillTemplate, markPaymentConfirmation,
  type DonationFilter,
  approvePayment, paymentNotArrived, undoApproval, markReceipt, useRun, deleteDonation, type Period,
} from '../../data/manage';
import { lnk, ExcelButton, Loading, NotFound } from './shared';

// ---------- M10 ----------
const PERIOD_LABEL: Record<Period, string> = { month: 'החודש', '3m': '3 חודשים', year: 'השנה' };
export function ReportsScreen({ ctx }: ScreenProps) {
  const [period, setPeriod] = useState<Period>('month');
  const from = periodStart(ctx.today, period);
  const activity = useActivityAll(true, 3000).items;
  const donations = useDonations(true).items;
  const tickets = useTicketsSince(from).items;
  const openTickets = useOpenTickets(true).items, openTabs = useOpenTabs(true).items;
  const r = useMemo(() => buildReport({ activity, donations, tickets, openTickets, openTabs, today: ctx.today, period }), [activity, donations, tickets, openTickets, openTabs, ctx.today, period]);
  // The old M10 extras: recurring in time, overdue open tasks, people, how they heard of us, past events, the task export.
  const tasks = useHistoryTasks(true, true, from + 'T00:00:00.000Z', ctx.today + 'T23:59:59.999Z').items;
  const overdue = useOpenTasks(true, true).items.filter((t) => t.dueDate && t.dueDate < ctx.today).length;
  const rec = recurringOnTime(tasks, ctx.templates, hhmm);
  const people = usePeopleAll(true).items.filter((p) => p.role !== 'vendor');
  const visits = useVisits(true).items;
  const ps = peopleStats(people, visits, from);
  const heard = heardFrom(people);
  const nowS = nowIso();
  const past = useAllEvents(true).items.filter((e) => e.end < nowS).slice(0, 4);
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={
        <ExcelButton filename={`דוח ${PERIOD_LABEL[period]}.csv`} headers={['סעיף', 'ערך']} rows={() => [
          ['משימות שבוצעו', r.tasksDone], ['ממוצע ביום', r.perDay], ['תרומות ששולמו (₪)', r.donations], ['כרטיסים ששולמו (₪)', r.tickets],
          ...r.byPerson.map((p) => [`משימות: ${p.label}`, p.value] as (string | number)[]), ['חובות פתוחים (₪)', r.debts.total], ['אנשים עם חוב', r.debts.people],
        ]} />
      } />
      <PageTitle>דוחות</PageTitle>
      <ChipRow label="תקופה">
        {(['month', '3m', 'year'] as Period[]).map((p) => <Chip key={p} selected={period === p} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</Chip>)}
      </ChipRow>
      <StatRow grid>
        <StatTile value={num(r.tasksDone)} label="משימות בוצעו" />
        <StatTile value={String(r.perDay)} label="ביום בממוצע" />
        <StatTile value={money(r.donations)} label="תרומות" />
        <StatTile value={money(r.tickets)} label="כרטיסים" />
      </StatRow>
      <StatRow>
        {rec.pct !== null && <StatTile value={`${rec.pct}%`} label="חוזרות בזמן" />}
        <StatTile value={num(overdue)} label="פתוחות באיחור" />
      </StatRow>
      <Card as="section" className="manage-bars">
        <SectionHeader title="מי ביצע" end={
          <ExcelButton filename={`משימות ${PERIOD_LABEL[period]}.csv`} headers={['משימה', 'בוצע על ידי', 'מתי', 'חוזרת']}
            rows={() => tasks.map((t) => [t.title, t.doneBy?.name || '', t.doneAt || '', t.templateId ? 'כן' : ''])} />
        } />
        {r.byPerson.length ? <BarList items={r.byPerson} /> : <p className="manage-hint" style={{ margin: 0, padding: '0 14px' }}>עוד לא בוצעו משימות בתקופה הזאת.</p>}
      </Card>
      <Card {...lnk('/manage/people?filter=debt')} className="manage-debts" aria-label={`חובות פתוחים, ${money(r.debts.total)}`}>
        <span className="manage-debts__body">
          <span className="manage-debts__title">חובות פתוחים{r.debts.total > 0 && <Tag tone="waiting">{money(r.debts.total)}</Tag>}</span>
          <span className="k-meta">{r.debts.people ? `${r.debts.people} אנשים · בכל האירועים` : 'אין חובות פתוחים'}</span>
        </span>
        <span className="manage-chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
      </Card>
      <SectionTitle spaced>אנשים</SectionTitle>
      <StatRow>
        <StatTile value={num(ps.newPeople)} label="נרשמים חדשים" />
        <StatTile value={num(ps.visitsApproved)} label={`ביקורים אושרו${ps.visitsRequested ? ` · מ־${ps.visitsRequested}` : ''}`} />
        <StatTile value={num(ps.blocked)} label="חסומים" />
      </StatRow>
      {heard.length > 1 && (
        <Card as="section" className="manage-bars">
          <SectionHeader title="איך שמעו עלינו" />
          <BarList items={heard.slice(0, 5)} />
        </Card>
      )}
      {past.length > 0 && (
        <ListCard title="אירועים" end={<TextLink {...lnk('/manage/events')}>כל האירועים</TextLink>}>
          {past.map((e) => <PastEventRow key={e.id} e={e} />)}
        </ListCard>
      )}
    </AppScreen>
  );
}
/** One past event: tickets, how many came. */
function PastEventRow({ e }: { e: FarmEvent }) {
  const t = useEventTickets(e.id, true).items;
  const v = t.filter((x) => x.status === 'valid'); const a = v.filter((x) => x.entries > 0).length;
  return <Row minHeight={56} {...lnk(`/manage/events/${e.id}?tab=summary`)} title={e.title} meta={`${ddmm(e.start)} · ${a} הגיעו מתוך ${v.length}`}
    trailing={<span className="manage-num">{v.length ? `${Math.round((a / v.length) * 100)}%` : '—'}</span>} />;
}

// ---------- N3 ----------
type DFilter = DonationFilter;
const shortDay = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : ddmm(iso); };
const statusTag = (d: Donation) =>
  d.paymentStatus === 'claimed' ? <Tag tone="waiting">{gw(d.name, 'סימן שהעביר', 'סימנה שהעבירה')}</Tag>
  : d.paymentStatus === 'pending' ? <Tag tone="waiting">עוד לא שולמה</Tag>
  : d.paymentStatus === 'cancelled' ? <Tag>בוטלה</Tag>
  : <Tag tone="paid">שולם</Tag>;
const receiptText = (d: Donation) => (d.receiptWanted ? (d.receiptSent ? 'קבלה נשלחה' : gw(d.name, 'צריך קבלה', 'צריכה קבלה')) : 'בלי קבלה');

export function DonationsScreen({ ctx }: ScreenProps) {
  const { items, loading } = useDonations(true);
  const [filter, setFilter] = useState<DFilter>('month');
  const t = donationTotals(items, ctx.today);
  const approve = items.filter(awaitsApproval), receipt = items.filter((d) => d.paymentStatus !== 'cancelled' && needsReceipt(d));
  const list = donationsIn(items, filter, ctx.today);
  const run = useRun();
  const ext = useExternal();
  const open = useNotifications(true).items;
  const approveRow = (d: Donation) => { const p = { kind: 'donation' as const, doc: d }; run(() => approvePayment(ctx.actor, p, open), { text: `${d.name} · ${money(d.amount)} · אושר`, undo: () => undoApproval(ctx.actor, p, open, []) }); };
  const thanks = (d: Donation) => ext(waUrl(d.phone, fillTemplate(ctx.settings.templates.donationThanks, { 'שם': firstName(d.name), 'סכום': money(d.amount) })));
  const rowActs = (d: Donation) => {
    const paid = isPaid(d.paymentStatus);
    // One button per row (a phone row has room for one), plus "תודה" as an icon.
    const main = awaitsApproval(d) ? <Button onClick={() => approveRow(d)}>אישור תשלום</Button>
      : needsReceipt(d) && paid ? <Button variant="outline" onClick={() => run(() => markReceipt(ctx.actor, d, true), { text: 'סומן: הקבלה נשלחה', undo: () => markReceipt(ctx.actor, { ...d, receiptSent: true }, false) })}>הקבלה נשלחה</Button>
      : null;
    if (!main) return undefined;
    return <>{contactPhoneOk(d.phone) && <IconButton variant="quiet" icon="message" label={`תודה בוואטסאפ ל${d.name}`} onClick={() => thanks(d)} />}{main}</>;
  };
  if (loading && !items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={
        <ExcelButton filename="תרומות.csv" headers={['תאריך', 'מי', 'טלפון', 'סכום', 'כותרת', 'הנצחה', 'הערה', 'תשלום', 'קבלה']}
          rows={() => items.map((d) => [keyOf(d.createdAt), d.name, d.phone, d.amount, d.label, d.memorial, d.note, PAYMENT_LABELS[d.paymentStatus], d.receiptWanted ? (d.receiptSent ? 'נשלחה' : 'צריך · ' + (d.receiptName || d.name)) : ''])} />
      } />
      <PageTitle>תרומות</PageTitle>
      <StatRow grid>
        <StatTile value={money(t.month)} label="החודש" />
        <StatTile value={money(t.year)} label="השנה" />
        <StatTile value={money(t.pending)} label="ממתין" />
        <StatTile value={num(t.needReceipt)} label="מחכות לקבלה" />
      </StatRow>
      <ChipRow label="סינון">
        <Chip selected={filter === 'month'} onClick={() => setFilter('month')}>החודש</Chip>
        <Chip selected={filter === 'approve'} onClick={() => setFilter('approve')}>{approve.length ? `לאישור · ${approve.length}` : 'לאישור'}</Chip>
        <Chip selected={filter === 'receipt'} onClick={() => setFilter('receipt')}>{receipt.length ? `צריכות קבלה · ${receipt.length}` : 'צריכות קבלה'}</Chip>
        <Chip selected={filter === 'memorial'} onClick={() => setFilter('memorial')}>עם הנצחה</Chip>
        <Chip selected={filter === 'year'} onClick={() => setFilter('year')}>השנה</Chip>
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל</Chip>
      </ChipRow>
      {list.length ? (
        <ListCard aria-label="תרומות">
          {list.map((d) => (
            <Row key={d.id} minHeight={58} {...lnk(`/manage/donations/${d.id}`)} title={d.name} tags={statusTag(d)}
              meta={[shortDay(d.createdAt), d.memorial && `לזכר ${d.memorial}`, receiptText(d)].filter(Boolean).join(' · ')}
              trailing={<b className="manage-amount">{money(d.amount)}</b>} actions={rowActs(d)} />
          ))}
        </ListCard>
      ) : <EmptyState variant="card" icon="heart" title={filter === 'approve' ? 'אין תרומות שמחכות לאישור' : filter === 'receipt' ? 'כל הקבלות נשלחו' : items.length ? 'אין תרומות כאלה' : 'עוד אין תרומות'} />}
    </AppScreen>
  );
}

// ---------- N4 ----------
const METHOD: Record<string, string> = { bit: 'ביט', paybox: 'PayBox', cash: 'מזומן', transfer: 'העברה בנקאית' };
export function DonationScreen({ ctx, params }: ScreenProps) {
  const { item: d, loading } = useDonation(params.id);
  const open = useNotifications(true).items;
  const tickets = useMyTickets(d?.uid || '', !!d?.uid).items, visits = useMyVisits(d?.uid || '', !!d?.uid).items, donations = useMyDonations(d?.uid || '', !!d?.uid).items;
  const run = useRun();
  const ext = useExternal();
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();
  const log = useActivityFor('donation', params.id).items;
  const donor = usePerson(d?.uid || '', !!d?.uid).item;
  if (loading) return <Loading back={{ label: 'תרומות', path: '/manage/donations' }} />;
  if (!d) return <NotFound back={{ label: 'תרומות', path: '/manage/donations' }} title="התרומה לא נמצאה" />;
  const paid = d.paymentStatus === 'paid' || d.paymentStatus === 'paid_onsite';
  const method = (d as Donation & { method?: string }).method;
  const p = { kind: 'donation' as const, doc: d };
  const approve = () => run(() => approvePayment(ctx.actor, p, open), { text: `התשלום אושר: ${money(d.amount)}`, undo: () => undoApproval(ctx.actor, p, open, []) });
  const notYet = () => run(() => paymentNotArrived(ctx.actor, p, open), 'סומן: עוד לא הגיע');
  const thanks = fillTemplate(ctx.settings.templates.donationThanks, { 'שם': firstName(d.name), 'סכום': money(d.amount) });
  const confirmText = fillTemplate(ctx.settings.templates.paymentConfirmation?.trim() || DEFAULT_SETTINGS.templates.paymentConfirmation!, { 'שם': firstName(d.name), 'סכום': money(d.amount), 'עבור': `תרומה${d.label ? ' · ' + d.label : ''}`, 'אירוע': 'התרומה' });
  const sendConfirmation = () => { ext(waUrl(d.phone, confirmText)); run(() => markPaymentConfirmation(ctx.actor, 'donations', [d.id]), 'סומן: אישור התשלום נשלח'); };
  const orders = [...new Map(tickets.map((t) => [t.orderId, tickets.filter((x) => x.orderId === t.orderId && x.status === 'valid')])).values()].filter((o) => o.length);
  const more = [
    ...orders.map((o) => ({ key: 'o' + o[0].orderId, at: o[0].createdAt, title: `${o[0].eventTitle} · ${o.length === 1 ? 'כרטיס אחד' : `${o.length} כרטיסים`}`, meta: `הוזמן ${relDay(o[0].createdAt)}`, path: `/manage/events/${o[0].eventId}?tab=guests` })),
    ...donations.filter((x) => x.id !== d.id).map((x) => ({ key: 'd' + x.id, at: x.createdAt, title: `תרומה · ${money(x.amount)}`, meta: shortDay(x.createdAt), path: `/manage/donations/${x.id}` })),
    ...visits.map((v) => ({ key: 'v' + v.id, at: v.createdAt, title: `ביקור · ${v.people} אנשים`, meta: relDay(v.date), path: `/manage/visits/${v.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const bar = !paid && d.paymentStatus !== 'cancelled'
    ? <BottomBar><Button size="bar" grow icon="check" onClick={approve}>אישור תשלום</Button>{d.paymentStatus === 'claimed' && <Button size="bar" variant="secondary" onClick={notYet}>עוד לא הגיע</Button>}</BottomBar>
    : paid && !d.paymentConfirmation && contactPhoneOk(d.phone)
      ? <BottomBar><Button size="bar" grow variant="outline" icon="message" onClick={sendConfirmation}>אישור תשלום בוואטסאפ</Button></BottomBar>
      : undefined;
  return (
    <AppScreen variant="detail" bar={bar}>
      <TopBar back={{ label: 'תרומות', ...lnk('/manage/donations') }} end={<Button variant="quiet" onClick={() => setAskDelete(true)}>מחיקה</Button>} />
      <div className="manage-titled">
        <span className="k-meta">תרומה · {dayTime(d.createdAt)}</span>
        <PageTitle size="detail" className="k-h1--detail-tight">{money(d.amount)} · {d.name}</PageTitle>
      </div>
      <DetailList className="manage-dl50">
        <DetailRow term="מצב">{statusTag(d)}</DetailRow>
        {method && <DetailRow term="אמצעי">{METHOD[method] || method}</DetailRow>}
        {d.memorial && <DetailRow term="הנצחה">לזכר {d.memorial}</DetailRow>}
        <DetailRow term="קבלה" action={d.receiptWanted ? (d.receiptSent
          ? <Button variant="quiet" onClick={() => run(() => markReceipt(ctx.actor, d, false), 'סומן: הקבלה עוד לא נשלחה')}>ביטול</Button>
          : <Button variant="outline" onClick={() => run(() => markReceipt(ctx.actor, d, true), { text: 'סומן: הקבלה נשלחה', undo: () => markReceipt(ctx.actor, { ...d, receiptSent: true }, false) })}>נשלחה</Button>) : undefined}>
          {d.receiptWanted ? <>{d.receiptSent && <><Tag tone="paid">נשלחה</Tag> </>}על שם {d.receiptName || d.name}</> : <span className="k-soft">{gw(d.name, 'לא ביקש', 'לא ביקשה')}</span>}
        </DetailRow>
        {d.paymentConfirmation && <DetailRow term="אישור">נשלח · {firstName(d.paymentConfirmation.by.name)} · {dayTime(d.paymentConfirmation.at)}</DetailRow>}
      </DetailList>
      {d.note && <Quote>{d.note}</Quote>}
      {donor && (
        <ListCard aria-label="התורם">
          <Row minHeight={58} {...lnk(`/manage/people/${donor.uid}`)} title={donor.displayName}
            meta={`#${donor.customerNumber} · ${donations.length || 1} תרומות עד היום`} />
        </ListCard>
      )}
      {d.paymentStatus !== 'cancelled' && (
        <PayConfirm collection="donations" ids={[d.id]} uid={d.uid} name={d.name} phone={d.phone} amount={d.amount} purpose="תרומה לחווה"
          paid={d.paymentStatus === 'paid'} confirmation={d.paymentConfirmation} emailJob={'donation_' + d.id} />
      )}
      {paid && <div><Button variant="quiet" onClick={() => run(() => setDonation(ctx.actor, d, { paymentStatus: 'claimed' }), 'הוחזר לממתין')}>להחזיר לממתין</Button></div>}
      {contactPhoneOk(d.phone) && (
        <div className="manage-btnrow">
          <Button size="tall" variant="outline" icon="message" iconSize={18} onClick={() => ext(waUrl(d.phone, thanks))}>תודה בוואטסאפ</Button>
          <Button size="tall" variant="outline" icon="phone" iconSize={18} onClick={() => ext(telUrl(d.phone))}>התקשרות</Button>
        </div>
      )}
      {more.length > 0 && (
        <ListCard title={`עוד מ${firstName(d.name)}`}>
          {more.map((m) => <Row key={m.key} minHeight={50} {...lnk(m.path)} title={m.title} meta={m.meta} />)}
        </ListCard>
      )}
      <ListCard title="היסטוריה">
        {log.map((a) => <Row key={a.id} minHeight={50} title={<span style={{ fontWeight: 500 }}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}</span>} meta={dayTime(a.at)} />)}
        <Row minHeight={50} title={<span style={{ fontWeight: 500 }}>התרומה נרשמה מהאפליקציה · התראה למנהלים</span>} meta={dayTime(d.createdAt)} />
      </ListCard>
      <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)} title="למחוק את התרומה?"
        text={`התרומה של ${d.name} על ${money(d.amount)} תימחק מהרשימה ומהדוחות.`} confirmLabel="מחיקה"
        onConfirm={() => remove(() => deleteDonation(ctx.actor, d, open), { text: 'התרומה נמחקה', after: () => go('/manage/donations', true) })} />
    </AppScreen>
  );
}
