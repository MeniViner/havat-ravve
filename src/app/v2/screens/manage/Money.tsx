// Q14 reports (+ drill-ins /manage/reports/tasks, /manage/reports/people, /manage/reports/events), Q4 donations, Q6 one donation.
// Rule 10: the reports root shows the headline numbers, who did what, and rows that open the detail. Rule 4: a donation row
// carries no buttons; every donation action lives on its screen (Q6), and its secondary actions behind ⋯ (rule 5).
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, useRemove, waUrl, telUrl } from '../../core';
import {
  BarList, BottomBar, Button, Card, Chip, ChipRow, DetailList, DetailRow, EmptyState, ListCard, MoreMenu, PageTitle, Quote, Row, SectionHeader,
  StatRow, StatTile, Tag, TextLink, TopBar, type ActionItem,
} from '../../kit';
import { useTableView, usePayConfirm, payConfirmText, tableCell } from '../../patterns';
import { money, num, dayTime, ddmm, daysFromToday, relDay, firstName, hhmm } from '../../format';
import { contactPhoneOk, receiptDestination, setDonation, useAllEvents, useEventTickets, useVisits } from '../../../data';
import { useDoc } from '../../../db';
import { useHistoryTasks, useOpenTasks, usePeople as usePeopleAll } from '../../../store';
import { useActivityFor, ACTION_LABELS } from '../../../activity';
import { nowIso } from '../../../clock';
import type { Donation, FarmEvent } from '../../../types';
import {
  useActivityAll, useDonations, useDonation, useTicketsSince, useOpenTickets, useOpenTabs, useNotifications, useMyTickets, useMyVisits, useMyDonations, usePerson,
  buildReport, periodStart, donationTotals, donationsIn, recurringOnTime, peopleStats, heardFrom, needsReceipt, awaitsApproval, gw, fillTemplate, markPaymentConfirmation, payTarget,
  type DonationFilter, approvePayment, paymentNotArrived, undoApproval, markReceipt, useRun, deleteDonation, type Period,
} from '../../data/manage';
import { lnk, HistorySheet, Loading, NotFound } from './shared';

// ---------- Q14 ----------
const PERIOD_LABEL: Record<Period, string> = { month: 'החודש', '3m': '3 חודשים', year: 'השנה' };
const PERIODS: Period[] = ['month', '3m', 'year'];
const periodOf = (v?: string): Period => (PERIODS.includes(v as Period) ? (v as Period) : 'month');

/** Who came out of the tickets of one event: "84% הגיעו". */
function arrivedPct(tickets: { status: string; entries: number }[]) {
  const v = tickets.filter((x) => x.status === 'valid'); const a = v.filter((x) => x.entries > 0).length;
  return { valid: v.length, arrived: a, pct: v.length ? Math.round((a / v.length) * 100) : null };
}

export function ReportsScreen({ ctx, params }: ScreenProps) {
  const [period, setPeriod] = useState<Period>(periodOf(params.period));
  const from = periodStart(ctx.today, period);
  const activity = useActivityAll(true, 3000).items;
  const donations = useDonations(true).items;
  const tickets = useTicketsSince(from).items;
  const openTickets = useOpenTickets(true).items, openTabs = useOpenTabs(true).items;
  const r = useMemo(() => buildReport({ activity, donations, tickets, openTickets, openTabs, today: ctx.today, period }), [activity, donations, tickets, openTickets, openTabs, ctx.today, period]);
  const tasks = useHistoryTasks(true, true, from + 'T00:00:00.000Z', ctx.today + 'T23:59:59.999Z').items;
  const overdue = useOpenTasks(true, true).items.filter((t) => t.dueDate && t.dueDate < ctx.today).length;
  const rec = recurringOnTime(tasks, ctx.templates, hhmm);
  const people = usePeopleAll(true).items.filter((p) => p.role !== 'vendor');
  const visits = useVisits(true).items;
  const ps = peopleStats(people, visits, from);
  const heard = heardFrom(people);
  const nowS = nowIso();
  const past = useAllEvents(true).items.filter((e) => e.end < nowS);
  const lastTickets = useEventTickets(past[0]?.id || '', !!past[0]).items;
  const last = arrivedPct(lastTickets);
  const table = useTableView({
    title: 'דוחות', filter: PERIOD_LABEL[period], filename: `דוח ${PERIOD_LABEL[period]}.csv`, headers: ['סעיף', 'ערך'],
    rows: () => [
      ['משימות שבוצעו', r.tasksDone], ['ממוצע ביום', r.perDay], ['תרומות ששולמו', tableCell.money(r.donations)], ['כרטיסים ששולמו', tableCell.money(r.tickets)],
      ...r.byPerson.map((p) => [`משימות: ${p.label}`, p.value] as (string | number)[]), ['חובות פתוחים', tableCell.money(r.debts.total)], ['אנשים עם חוב', r.debts.people],
      ['חוזרות בזמן (%)', rec.pct ?? ''], ['פתוחות באיחור', overdue], ['נרשמים חדשים', ps.newPeople], ['ביקורים אושרו', ps.visitsApproved], ['חסומים', ps.blocked],
    ],
  });
  const tasksTable = useTableView({
    title: 'משימות', filter: PERIOD_LABEL[period], filename: `משימות ${PERIOD_LABEL[period]}.csv`, headers: ['משימה', 'בוצע על ידי', 'מתי', 'חוזרת'],
    rows: () => tasks.map((t) => [t.title, t.doneBy?.name || '', tableCell.time(t.doneAt), t.templateId ? 'כן' : '']),
  });
  const section = params.section || '';
  // Two tables (Q14 ⋯): the report at /manage/reports/table and the tasks at /manage/reports/tasks/table.
  if (table.active) return section === 'tasks' ? tasksTable.screen : table.screen;
  const back = { label: 'דוחות', ...lnk(`/manage/reports${period === 'month' ? '' : `?period=${period}`}`) };
  const chips = (
    <ChipRow label="תקופה">
      {PERIODS.map((p) => <Chip key={p} selected={period === p} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</Chip>)}
    </ChipRow>
  );

  // drill-in: people and registrants
  if (section === 'people') return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={back} />
      <PageTitle>אנשים ונרשמים</PageTitle>
      {chips}
      <StatRow>
        <StatTile value={num(ps.newPeople)} label="נרשמים חדשים" />
        <StatTile value={num(ps.visitsApproved)} label={`ביקורים אושרו${ps.visitsRequested ? ` · מ־${ps.visitsRequested}` : ''}`} />
        <StatTile value={num(ps.blocked)} label="חסומים" />
      </StatRow>
      <Card as="section" className="manage-bars">
        <SectionHeader title="איך שמעו עלינו" />
        {heard.length ? <BarList items={heard.slice(0, 8)} /> : <p className="manage-hint" style={{ margin: 0, padding: '0 14px 14px' }}>עוד אין תשובות לשאלה הזאת.</p>}
      </Card>
    </AppScreen>
  );
  // drill-in: tasks (needs-design decision 6): the recurring-in-time and overdue figures, and who did what in full
  if (section === 'tasks') return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={back} />
      <PageTitle>משימות</PageTitle>
      {chips}
      <StatRow>
        <StatTile value={rec.pct !== null ? `${rec.pct}%` : '—'} label="חוזרות בזמן" />
        <StatTile value={num(overdue)} label="פתוחות באיחור" />
      </StatRow>
      <Card as="section" className="manage-bars">
        <SectionHeader title="מי ביצע" />
        {r.byPerson.length ? <BarList items={r.byPerson} /> : <p className="manage-hint" style={{ margin: 0, padding: '0 14px' }}>עוד לא בוצעו משימות בתקופה הזאת.</p>}
      </Card>
    </AppScreen>
  );
  // drill-in: past events
  if (section === 'events') return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={back} />
      <PageTitle>אירועים</PageTitle>
      {past.length
        ? <ListCard title="אירועים שעברו" end={<TextLink {...lnk('/manage/events')}>כל האירועים</TextLink>}>{past.slice(0, 12).map((e) => <PastEventRow key={e.id} e={e} />)}</ListCard>
        : <EmptyState variant="card" icon="ticket" title="עוד אין אירועים שעברו" />}
    </AppScreen>
  );

  const more: ActionItem[] = [
    ...table.items,
    { label: 'משימות בטבלה', icon: 'table', meta: `מי ביצע מה, ${PERIOD_LABEL[period]}`, onSelect: () => go('/manage/reports/tasks/table') },
    { label: 'ייצוא משימות לאקסל', icon: 'download', onSelect: tasksTable.download },
  ];
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={<MoreMenu title="דוחות" items={more} />} />
      <PageTitle>דוחות</PageTitle>
      {chips}
      <StatRow grid>
        <StatTile value={num(r.tasksDone)} label="משימות בוצעו" />
        <StatTile value={String(r.perDay)} label="ביום בממוצע" />
        <StatTile value={money(r.donations)} label="תרומות" />
        <StatTile value={money(r.tickets)} label="כרטיסים" />
      </StatRow>
      <Card as="section" className="manage-bars">
        <SectionHeader title="מי ביצע" />
        {/* Q14 pictures the top three; the whole list is on the "משימות" drill-in. */}
        {r.byPerson.length ? <BarList items={r.byPerson.slice(0, 3)} /> : <p className="manage-hint" style={{ margin: 0, padding: '0 14px' }}>עוד לא בוצעו משימות בתקופה הזאת.</p>}
      </Card>
      <ListCard aria-label="עוד בדוחות">
        <Row minHeight={58} {...lnk(`/manage/reports/tasks${period === 'month' ? '' : `?period=${period}`}`)} title="משימות"
          meta={[rec.pct !== null && `${rec.pct}% מהחוזרות בוצעו בזמן`, overdue === 1 ? 'אחת פתוחה באיחור' : `${num(overdue)} פתוחות באיחור`].filter(Boolean).join(' · ')} />
        <Row minHeight={58} {...lnk('/manage/people?filter=debt')} title="חובות פתוחים" tags={r.debts.total > 0 ? <Tag tone="waiting">{money(r.debts.total)}</Tag> : undefined}
          meta={r.debts.people ? `${r.debts.people} אנשים · בכל האירועים` : 'אין חובות פתוחים'} />
        <Row minHeight={58} {...lnk(`/manage/reports/people${period === 'month' ? '' : `?period=${period}`}`)} title="אנשים ונרשמים"
          meta={`${num(ps.newPeople)} נרשמו ${PERIOD_LABEL[period]} · איך שמעו עלינו`} />
        <Row minHeight={58} {...lnk('/manage/reports/events')} title="אירועים"
          meta={past[0] ? (last.pct !== null ? `${past[0].title}: ${last.pct}% הגיעו` : past[0].title) : 'עוד אין אירועים שעברו'} />
      </ListCard>
    </AppScreen>
  );
}
/** One past event: tickets, how many came. */
function PastEventRow({ e }: { e: FarmEvent }) {
  const a = arrivedPct(useEventTickets(e.id, true).items);
  return <Row minHeight={56} {...lnk(`/manage/events/${e.id}?tab=summary`)} title={e.title} meta={`${ddmm(e.start)} · ${a.arrived} הגיעו מתוך ${a.valid}`}
    trailing={<span className="manage-num">{a.pct !== null ? `${a.pct}%` : '—'}</span>} />;
}

// ---------- Q4 ----------
type DFilter = DonationFilter;
const D_FILTERS: { v: DFilter; l: string }[] = [
  { v: 'month', l: 'החודש' }, { v: 'approve', l: 'לאישור' }, { v: 'receipt', l: 'צריכות קבלה' }, { v: 'memorial', l: 'עם הנצחה' }, { v: 'year', l: 'השנה' }, { v: 'all', l: 'הכל' },
];
const shortDay = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : ddmm(iso); };
/** The donation's state in words: the row's tag and the table's "מצב" (Q4, Q9). */
const statusWord = (d: Donation) =>
  d.paymentStatus === 'claimed' ? gw(d.name, 'סימן שהעביר', 'סימנה שהעבירה')
  : d.paymentStatus === 'pending' ? 'עוד לא שולמה'
  : d.paymentStatus === 'cancelled' ? 'בוטלה'
  : 'שולם';
const statusTag = (d: Donation) => (
  <Tag tone={d.paymentStatus === 'claimed' || d.paymentStatus === 'pending' ? 'waiting' : d.paymentStatus === 'cancelled' ? 'neutral' : 'paid'}>{statusWord(d)}</Tag>
);
const receiptText = (d: Donation) => (d.receiptWanted ? (d.receiptSent ? 'קבלה נשלחה' : gw(d.name, 'צריך קבלה', 'צריכה קבלה')) : 'בלי קבלה');

export function DonationsScreen({ ctx }: ScreenProps) {
  const { items, loading } = useDonations(true);
  const [filter, setFilter] = useState<DFilter>('month');
  const t = donationTotals(items, ctx.today);
  const approve = items.filter(awaitsApproval), receipt = items.filter((d) => d.paymentStatus !== 'cancelled' && needsReceipt(d));
  const list = donationsIn(items, filter, ctx.today);
  const label = D_FILTERS.find((f) => f.v === filter)!.l;
  const table = useTableView({
    title: 'תרומות', filter: filter === 'all' ? undefined : label, filename: 'תרומות.csv',
    // Q9's six columns in its order, then what the file always carried (phone, title, note, the name on the receipt)
    headers: ['שם', 'סכום', 'מצב', 'תאריך', 'קבלה', 'הנצחה', 'טלפון', 'כותרת', 'הערה', 'שם לקבלה'],
    rows: () => list.map((d) => [d.name, tableCell.money(d.amount), statusWord(d), tableCell.date(d.createdAt),
      d.receiptWanted ? (d.receiptSent ? 'נשלחה' : gw(d.name, 'צריך', 'צריכה')) : 'בלי', d.memorial, d.phone, d.label, d.note, d.receiptWanted ? d.receiptName || d.name : '']),
  });
  if (table.active) return table.screen;
  if (loading && !items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  const count = (f: DFilter) => (f === 'approve' ? approve.length : f === 'receipt' ? receipt.length : 0);
  // "לאישור · 180 ₪" for one waiting, "לאישור · 2 · 360 ₪" for more: the count and the waiting sum in one chip.
  const chipText = (f: (typeof D_FILTERS)[number]) => {
    const n = count(f.v);
    if (!n) return f.l;
    if (f.v !== 'approve') return `${f.l} · ${n}`;
    return n === 1 ? `${f.l} · ${money(t.pending)}` : `${f.l} · ${n} · ${money(t.pending)}`;
  };
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={<MoreMenu title="תרומות" items={[
        ...table.items,
        // Q5: print the list as shown (as the event summary prints), and the money activity (Activity's "כסף" filter)
        { label: 'הדפסה', icon: 'print', onSelect: () => window.print() },
        { label: 'היסטוריית שינויים', icon: 'clock', onSelect: () => go('/manage/activity?filter=money') },
      ]} />} />
      <PageTitle>תרומות</PageTitle>
      {/* Q4: three stats. The waiting sum ("ממתין") lives in the "לאישור" chip (needs-design decision 5). */}
      <StatRow>
        <StatTile value={money(t.month)} label="החודש" />
        <StatTile value={money(t.year)} label="השנה" />
        <StatTile value={num(t.needReceipt)} label="מחכות לקבלה" />
      </StatRow>
      <ChipRow label="סינון">
        {D_FILTERS.map((f) => <Chip key={f.v} selected={filter === f.v} onClick={() => setFilter(f.v)}>{chipText(f)}</Chip>)}
      </ChipRow>
      {list.length ? (
        <ListCard aria-label="תרומות">
          {list.map((d) => (
            <Row key={d.id} minHeight={58} {...lnk(`/manage/donations/${d.id}`)} title={d.name} tags={statusTag(d)}
              meta={[shortDay(d.createdAt), d.memorial && `לזכר ${d.memorial}`, receiptText(d)].filter(Boolean).join(' · ')}
              trailing={<b className="manage-amount">{money(d.amount)}</b>} />
          ))}
        </ListCard>
      ) : <EmptyState variant="card" icon="heart" title={filter === 'approve' ? 'אין תרומות שמחכות לאישור' : filter === 'receipt' ? 'כל הקבלות נשלחו' : items.length ? 'אין תרומות כאלה' : 'עוד אין תרומות'} />}
    </AppScreen>
  );
}

// ---------- Q6 ----------
const METHOD: Record<string, string> = { bit: 'ביט', paybox: 'PayBox', cash: 'מזומן', transfer: 'העברה בנקאית' };

/** The Worker's automatic payment e-mail (email_outbox/donation_<id>): information on the detail, not a control. */
type EmailJob = { id: string; status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled'; reason?: string | null; to?: string; sentAt?: string; updatedAt: string };
const SKIP_TEXT: Record<string, string> = {
  whatsapp: 'ההעדפה היא וואטסאפ', no_preference: 'לא נבחרה דרך שליחה', no_address: 'אין כתובת מייל תקינה', not_paid: 'התשלום בוטל לפני השליחה', manual: 'סומן ידנית',
};
function EmailLine({ job }: { job: EmailJob }) {
  if (job.status === 'sent') return <><Tag tone="paid">נשלח במייל אוטומטית</Tag>{job.sentAt && ` ${dayTime(job.sentAt)}`}{job.to && <> · <bdi>{job.to}</bdi></>}</>;
  if (job.status === 'queued' || job.status === 'sending') return <><Tag tone="waiting">מייל אוטומטי בתור</Tag>{job.reason ? ' · ניסיון נוסף בקרוב' : ''}</>;
  if (job.status === 'failed') return <><Tag tone="urgent">המייל האוטומטי נכשל</Tag> {job.reason === 'rejected' ? 'הכתובת נדחתה' : 'שירות המייל לא זמין'} · אפשר לשלוח ידנית</>;
  return <>מייל אוטומטי לא נשלח · {SKIP_TEXT[job.reason || ''] || 'לא נדרש'}</>;
}

export function DonationScreen({ ctx, params }: ScreenProps) {
  const { item: d, loading } = useDonation(params.id);
  const open = useNotifications(true).items;
  const tickets = useMyTickets(d?.uid || '', !!d?.uid).items, visits = useMyVisits(d?.uid || '', !!d?.uid).items, donations = useMyDonations(d?.uid || '', !!d?.uid).items;
  const run = useRun();
  const ext = useExternal();
  const remove = useRemove();
  const pay = usePayConfirm();
  const [history, setHistory] = useState(false);
  const log = useActivityFor('donation', params.id).items;
  const donor = usePerson(d?.uid || '', !!d?.uid).item;
  const paidNow = !!d && (d.paymentStatus === 'paid' || d.paymentStatus === 'paid_onsite');
  const job = useDoc<EmailJob>('email_outbox/donation_' + (d?.id || '_'), !!d && paidNow).item;
  if (loading) return <Loading back={{ label: 'תרומות', path: '/manage/donations' }} />;
  if (!d) return <NotFound back={{ label: 'תרומות', path: '/manage/donations' }} title="התרומה לא נמצאה" />;
  const paid = paidNow;
  const method = (d as Donation & { method?: string }).method;
  const p = { kind: 'donation' as const, doc: d };
  const target = payTarget(p);
  const approve = async () => {
    if (await run(() => approvePayment(ctx.actor, p, open), { text: `התשלום אושר: ${money(d.amount)}`, undo: () => undoApproval(ctx.actor, p, open, []) })) pay.ask(target);
  };
  const notYet = () => run(() => paymentNotArrived(ctx.actor, p, open), 'סומן: עוד לא הגיע');
  const thanks = fillTemplate(ctx.settings.templates.donationThanks, { 'שם': firstName(d.name), 'סכום': money(d.amount) });
  const email = receiptDestination({ phone: donor?.phone || d.phone, email: donor?.email || '' }, 'email');
  const mailto = () => {
    const body = payConfirmText(ctx.settings.templates.paymentConfirmation, { name: donor?.displayName || d.name, amount: d.amount, purpose: target.purpose, event: target.event });
    ext('mailto:' + encodeURIComponent(email).replace('%40', '@') + '?subject=' + encodeURIComponent('אישור תשלום מחוות רווה') + '&body=' + encodeURIComponent(body));
  };
  const orders = [...new Map(tickets.map((t) => [t.orderId, tickets.filter((x) => x.orderId === t.orderId && x.status === 'valid')])).values()].filter((o) => o.length);
  const more = [
    ...orders.map((o) => ({ key: 'o' + o[0].orderId, at: o[0].createdAt, title: `${o[0].eventTitle} · ${o.length === 1 ? 'כרטיס אחד' : `${o.length} כרטיסים`}`, meta: `הוזמן ${relDay(o[0].createdAt)}`, path: `/manage/events/${o[0].eventId}?tab=guests` })),
    ...donations.filter((x) => x.id !== d.id).map((x) => ({ key: 'd' + x.id, at: x.createdAt, title: `תרומה · ${money(x.amount)}`, meta: shortDay(x.createdAt), path: `/manage/donations/${x.id}` })),
    ...visits.map((v) => ({ key: 'v' + v.id, at: v.createdAt, title: `ביקור · ${v.people} אנשים`, meta: relDay(v.date), path: `/manage/visits/${v.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const bar = !paid && d.paymentStatus !== 'cancelled'
    ? <BottomBar><Button size="bar" grow icon="check" onClick={approve}>אישור תשלום</Button>{d.paymentStatus === 'claimed' && <Button size="bar" variant="secondary" onClick={notYet}>עוד לא הגיע</Button>}</BottomBar>
    : paid && !d.paymentConfirmation && contactPhoneOk(d.phone)
      ? <BottomBar><Button size="bar" grow variant="outline" icon="message" onClick={() => pay.ask(target)}>אישור תשלום בוואטסאפ</Button></BottomBar>
      : undefined;
  const actions: ActionItem[] = [
    { label: 'להחזיר לממתין', icon: 'back', hidden: !paid, onSelect: () => run(() => setDonation(ctx.actor, d, { paymentStatus: 'claimed' }), 'הוחזר לממתין') },
    { label: 'אישור תשלום במייל', icon: 'mail', meta: <bdi>{email}</bdi>, hidden: !paid || !email, onSelect: mailto },
    { label: 'סימון שהאישור נשלח', icon: 'check', hidden: !paid || !!d.paymentConfirmation, onSelect: () => run(() => markPaymentConfirmation(ctx.actor, 'donations', [d.id]), 'סומן: אישור התשלום נשלח') },
    { label: 'היסטוריית שינויים', icon: 'clock', onSelect: () => setHistory(true) },
    { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: {
      title: 'למחוק את התרומה?', text: `${money(d.amount)} · ${d.name}. המחיקה נרשמת בפעילות, ואי אפשר לבטל אותה.`,
      onConfirm: () => remove(() => deleteDonation(ctx.actor, d, open), { text: 'התרומה נמחקה', after: () => go('/manage/donations', true) }),
    } },
  ];
  return (
    <AppScreen variant="detail" bar={bar}>
      <TopBar back={{ label: 'תרומות', ...lnk('/manage/donations') }} end={<MoreMenu title="תרומה" items={actions} />} />
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
        {(d.paymentConfirmation || (paid && job)) && (
          <DetailRow term="אישור">
            {d.paymentConfirmation ? <>נשלח · {firstName(d.paymentConfirmation.by.name)} · {dayTime(d.paymentConfirmation.at)}</> : job ? <EmailLine job={job} /> : null}
          </DetailRow>
        )}
      </DetailList>
      {d.note && <Quote>{d.note}</Quote>}
      {contactPhoneOk(d.phone) && (
        <div className="manage-btnrow">
          <Button size="tall" variant="outline" icon="message" iconSize={18} onClick={() => ext(waUrl(d.phone, thanks))}>תודה בוואטסאפ</Button>
          <Button size="tall" variant="outline" icon="phone" iconSize={18} onClick={() => ext(telUrl(d.phone))}>התקשרות</Button>
        </div>
      )}
      {(donor || more.length > 0) && (
        <ListCard title={`עוד מ${firstName(d.name)}`} end={donor ? <TextLink {...lnk(`/manage/people/${donor.uid}`)}>{gw(d.name, 'לתיק שלו', 'לתיק שלה')}</TextLink> : undefined}>
          {more.length ? more.map((m) => <Row key={m.key} minHeight={50} {...lnk(m.path)} title={m.title} meta={m.meta} />)
            : <Row minHeight={50} title={<span className="k-soft" style={{ fontWeight: 400 }}>רק התרומה הזאת</span>} />}
        </ListCard>
      )}
      <HistorySheet open={history} onClose={() => setHistory(false)} title="היסטוריית שינויים" lines={[
        ...log.map((a) => ({ key: a.id, title: `${ACTION_LABELS[a.action] || a.action} · ${firstName(a.by.name)}`, meta: dayTime(a.at) })),
        { key: 'created', title: 'התרומה נרשמה מהאפליקציה · התראה למנהלים', meta: dayTime(d.createdAt) },
      ]} />
      {pay.sheet}
    </AppScreen>
  );
}
