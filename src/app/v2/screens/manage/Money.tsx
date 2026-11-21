// M10 reports, N3 donations, N4 one donation.
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, useExternal, waUrl, telUrl } from '../../core';
import {
  BarList, BottomBar, Button, Card, Chip, ChipRow, DetailList, DetailRow, EmptyState, Icon, ListCard, PageTitle, Quote, Row, SectionHeader,
  StatRow, StatTile, Tag, TopBar,
} from '../../kit';
import { money, num, dayTime, ddmm, daysFromToday, relDay, firstName, keyOf } from '../../format';
import { contactPhoneOk } from '../../../data';
import { PAYMENT_LABELS, DEFAULT_SETTINGS } from '../../../types';
import type { Donation } from '../../../types';
import {
  useActivityAll, useDonations, useDonation, useTicketsSince, useOpenTickets, useOpenTabs, useNotifications, useMyTickets, useMyVisits, useMyDonations,
  buildReport, periodStart, donationTotals, needsReceipt, awaitsApproval, gw, fillTemplate, markPaymentConfirmation,
  approvePayment, paymentNotArrived, undoApproval, markReceipt, useRun, type Period,
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
      <Card as="section" className="manage-bars">
        <SectionHeader title="מי ביצע" />
        {r.byPerson.length ? <BarList items={r.byPerson} /> : <p className="manage-hint" style={{ margin: 0, padding: '0 14px' }}>עוד לא בוצעו משימות בתקופה הזאת.</p>}
      </Card>
      <Card {...lnk('/manage/people?filter=debt')} className="manage-debts" aria-label={`חובות פתוחים, ${money(r.debts.total)}`}>
        <span className="manage-debts__body">
          <span className="manage-debts__title">חובות פתוחים{r.debts.total > 0 && <Tag tone="waiting">{money(r.debts.total)}</Tag>}</span>
          <span className="k-meta">{r.debts.people ? `${r.debts.people} אנשים · בכל האירועים` : 'אין חובות פתוחים'}</span>
        </span>
        <span className="manage-chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
      </Card>
    </AppScreen>
  );
}

// ---------- N3 ----------
type DFilter = 'all' | 'approve' | 'receipt';
const shortDay = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : ddmm(iso); };
const statusTag = (d: Donation) =>
  d.paymentStatus === 'claimed' ? <Tag tone="waiting">{gw(d.name, 'סימן שהעביר', 'סימנה שהעבירה')}</Tag>
  : d.paymentStatus === 'pending' ? <Tag tone="waiting">עוד לא שולמה</Tag>
  : d.paymentStatus === 'cancelled' ? <Tag>בוטלה</Tag>
  : <Tag tone="paid">שולם</Tag>;
const receiptText = (d: Donation) => (d.receiptWanted ? (d.receiptSent ? 'קבלה נשלחה' : gw(d.name, 'צריך קבלה', 'צריכה קבלה')) : 'בלי קבלה');

export function DonationsScreen({ ctx }: ScreenProps) {
  const { items, loading } = useDonations(true);
  const [filter, setFilter] = useState<DFilter>('all');
  const t = donationTotals(items, ctx.today);
  const approve = items.filter(awaitsApproval), receipt = items.filter((d) => d.paymentStatus !== 'cancelled' && needsReceipt(d));
  const list = filter === 'approve' ? approve : filter === 'receipt' ? receipt : items;
  if (loading && !items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={
        <ExcelButton filename="תרומות.csv" headers={['תאריך', 'מי', 'טלפון', 'סכום', 'כותרת', 'הנצחה', 'הערה', 'תשלום', 'קבלה']}
          rows={() => items.map((d) => [keyOf(d.createdAt), d.name, d.phone, d.amount, d.label, d.memorial, d.note, PAYMENT_LABELS[d.paymentStatus], d.receiptWanted ? (d.receiptSent ? 'נשלחה' : 'צריך · ' + (d.receiptName || d.name)) : ''])} />
      } />
      <PageTitle>תרומות</PageTitle>
      <StatRow>
        <StatTile value={money(t.month)} label="החודש" />
        <StatTile value={money(t.year)} label="השנה" />
        <StatTile value={num(t.needReceipt)} label="מחכות לקבלה" />
      </StatRow>
      <ChipRow label="סינון">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל</Chip>
        <Chip selected={filter === 'approve'} onClick={() => setFilter('approve')}>{approve.length ? `לאישור · ${approve.length}` : 'לאישור'}</Chip>
        <Chip selected={filter === 'receipt'} onClick={() => setFilter('receipt')}>{receipt.length ? `צריכות קבלה · ${receipt.length}` : 'צריכות קבלה'}</Chip>
      </ChipRow>
      {list.length ? (
        <ListCard aria-label="תרומות">
          {list.map((d) => (
            <Row key={d.id} minHeight={58} {...lnk(`/manage/donations/${d.id}`)} title={d.name} tags={statusTag(d)}
              meta={[shortDay(d.createdAt), d.memorial && `לזכר ${d.memorial}`, receiptText(d)].filter(Boolean).join(' · ')}
              trailing={<b className="manage-amount">{money(d.amount)}</b>} />
          ))}
        </ListCard>
      ) : <EmptyState variant="card" icon="heart" title={filter === 'approve' ? 'אין תרומות שמחכות לאישור' : filter === 'receipt' ? 'כל הקבלות נשלחו' : 'עוד אין תרומות'} />}
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
      <TopBar back={{ label: 'תרומות', ...lnk('/manage/donations') }} />
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
    </AppScreen>
  );
}
