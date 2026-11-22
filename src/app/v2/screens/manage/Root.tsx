// M1 manage root and M2 inbox ("לטיפול").
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, RootHead, go, useExternal, useRemove, useV2, waUrl, telUrl } from '../../core';
import { Button, Card, Chip, ChipRow, ConfirmSheet, EmptyState, Hero, HeroNumber, Icon, IconButton, ListCard, PageTitle, Row, TextLink, Tile, TileGrid, TopBar, type IconName } from '../../kit';
import { agoLong, ago, dayName, ddmm, dayOverline, inDays, money, longDate, firstName } from '../../format';
import { nowIso } from '../../../clock';
import { useUpcomingEvents, contactPhoneOk, useCalendar } from '../../../data';
import { useTemplates, usePlaces } from '../../../store';
import { useVendorPool } from '../../data/vendor';
import type { AppNotification, Donation, Tab, Ticket, Visit, VendorRequest } from '../../../types';
import {
  useNotifications, useHandledNotifications, useVendorRequests, usePeople, useVisits, useDonations, useOpenTabs, useOpenTickets,
  inboxIn, inboxSummary, donationTotals, approvedSoon, isTeam, gw, timeFromNote, needsReceipt, fillTemplate,
  approvePayment, paymentNotArrived, undoApproval, approveMany, setHandled, decide, markReceipt, useRun, deleteInboxItem, deleteVendorRequest, type PayItem, type InboxFilter,
} from '../../data/manage';
import { lnk, PlainLink } from './shared';

// ---------- M1 ----------
export function ManageRoot({ ctx }: ScreenProps) {
  const inbox = useNotifications(true).items;
  const vreq = useVendorRequests(ctx.eventToday?.id || '', !!ctx.eventToday).items;
  const people = usePeople(true).items.filter((p) => p.role !== 'vendor');
  const visits = useVisits(true).items;
  const donations = useDonations(true).items;
  const events = useUpcomingEvents().items;
  const nowS = nowIso();
  const next = events.find((e) => e.end >= nowS);
  const d = donationTotals(donations, ctx.today);
  const freshVisits = visits.filter((v) => v.status === 'new').length;
  const waiting = inbox.length + vreq.length;
  const templates = useTemplates(true, true).items.filter((t) => t.active).length;
  const vendors = useVendorPool(true).items.length;
  const places = usePlaces(true).items.length;
  const todayCal = useCalendar(true, ctx.today, ctx.today).items;
  return (
    <AppScreen variant="root">
      <RootHead overline={dayOverline(ctx.today)} title="ניהול" />
      <Hero {...lnk('/manage/inbox')} aria-label={`${waiting} מחכים לטיפול שלך`}>
        <HeroNumber>{waiting}</HeroNumber>
        <span className="manage-hero-line">
          <span className="k-hero__title">{waiting ? 'מחכים לטיפול שלך' : 'אין כלום שמחכה לך'}</span>
          <span className="k-hero__meta">{waiting ? inboxSummary(inbox, vreq.length) : 'מה שטופל נשמר ב"לטיפול"'}</span>
        </span>
      </Hero>
      {inbox.length > 0 && (
        <ListCard title="לטיפול" count={inbox.length} end={<TextLink {...lnk('/manage/inbox')}>הכל</TextLink>}>
          {inbox.slice(0, 5).map((n) => (
            <Row key={n.id} minHeight={54} {...lnk('/manage/inbox')} leading={<span className="manage-item__icon" aria-hidden="true"><Icon name={ICON[n.type] || 'bell'} size={20} /></span>}
              title={n.title} meta={[n.text, agoLong(n.createdAt)].filter(Boolean).join(' · ')} />
          ))}
        </ListCard>
      )}
      <TileGrid>
        <Tile icon="ticket" title="אירועים" meta={next ? `${next.title} ${inDays(next.start)}` : 'אין אירוע קרוב'} {...lnk('/manage/events')} />
        <Tile icon="people" title="אנשים" meta={`${people.length} רשומים · ${people.filter(isTeam).length} בצוות`} {...lnk('/manage/people')} />
        <Tile icon="pin" title="ביקורים" badge={freshVisits} badgeLabel={`${freshVisits} בקשות חדשות`} meta={`${approvedSoon(visits, ctx.today)} מאושרים החודש`} {...lnk('/manage/visits')} />
        <Tile icon="heart" title="תרומות" badge={d.toApprove} badgeLabel={`${d.toApprove} לאישור`} meta={`${money(d.month)} החודש`} {...lnk('/manage/donations')} />
        <Tile icon="chart" title="דוחות" meta="משימות, כסף, חובות" {...lnk('/manage/reports')} />
        <Tile icon="sliders" title="הגדרות" meta="תשלום, הודעות, מנהלים" {...lnk('/manage/settings')} />
      </TileGrid>
      <PlainLink path="/farm/calendar" meta={todayCal.length ? `היום: ${todayCal.map((c) => `${c.title}${c.time ? ' ' + c.time : ''}`).join(', ')}` : 'היום: אין כלום ביומן'}>יומן</PlainLink>
      <PlainLink path="/manage/recurring" meta={`${templates} פעילות`}>משימות חוזרות</PlainLink>
      <PlainLink path="/manage/vendors" meta={`${vendors} ברשימה`}>בעלי דוכנים</PlainLink>
      <PlainLink path="/manage/broadcasts">הודעות לצוות</PlainLink>
      <PlainLink path="/places?from=manage" meta={places ? String(places) : undefined}>מקומות בחווה</PlainLink>
      <PlainLink path="/manage/activity">כל הפעילות בחווה</PlainLink>
      {ctx.role === 'owner' && <PlainLink path="/manage/instinct" meta="כל מה שאינסטינקט עשה, לפי מפתח">יומן אינסטינקט</PlainLink>}
    </AppScreen>
  );
}

// ---------- M2 ----------
type Filter = InboxFilter;
const ICON: Record<AppNotification['type'], IconName> = { contact: 'phone', visit: 'pin', donation: 'heart', claim: 'ticket', tab: 'cart', receipt: 'file', order: 'ticket', join: 'user' };
const VREQ: Record<VendorRequest['kind'], string> = { power: 'חשמל', water: 'מים', help: 'עזרה', supply: 'נגמר לי משהו', other: 'משהו אחר' };

/** What an inbox item points at, resolved from the lists the screen already has. */
type Resolved = { pay?: PayItem; visit?: Visit; donation?: Donation; tab?: Tab; tickets?: Ticket[] };
function resolve(n: AppNotification, m: { visits: Map<string, Visit>; donations: Map<string, Donation>; tabs: Map<string, Tab>; orders: Map<string, Ticket[]> }): Resolved {
  if (n.type === 'visit') return { visit: m.visits.get(n.refId) };
  if (n.type === 'donation' || n.type === 'receipt' || (n.type === 'claim' && n.link.startsWith('/manage/donations/'))) {
    const d = m.donations.get(n.refId); return { donation: d, pay: d ? { kind: 'donation', doc: d } : undefined };
  }
  if (n.type === 'tab') { const t = m.tabs.get(n.refId); return { tab: t, pay: t ? { kind: 'tab', doc: t } : undefined }; }
  if (n.type === 'claim') { const ts = m.orders.get(n.refId); return { tickets: ts, pay: ts?.length ? { kind: 'order', tickets: ts } : undefined }; }
  return {};
}
/** Still waiting for the manager's approval (claimed or pending), so the payment buttons make sense. */
const payOpen = (p?: PayItem) => !!p && (p.kind === 'donation' ? p.doc.paymentStatus === 'claimed' || p.doc.paymentStatus === 'pending' : p.kind === 'tab' ? p.doc.status === 'claimed' || p.doc.status === 'open' : p.tickets.some((t) => t.status === 'valid' && (t.paymentStatus === 'claimed' || t.paymentStatus === 'pending')));

export function InboxScreen({ ctx, params }: ScreenProps) {
  const handledView = params.view === 'handled';
  const open = useNotifications(true).items;
  const handled = useHandledNotifications(true).items;
  const vreq = useVendorRequests(ctx.eventToday?.id || '', !!ctx.eventToday && !handledView).items;
  const visits = useVisits(true).items, donations = useDonations(true).items, tabs = useOpenTabs(true).items, tickets = useOpenTickets(true).items;
  const maps = useMemo(() => {
    const orders = new Map<string, Ticket[]>();
    for (const t of tickets) orders.set(t.orderId, [...(orders.get(t.orderId) || []), t]);
    return { visits: new Map(visits.map((v) => [v.id, v])), donations: new Map(donations.map((d) => [d.id, d])), tabs: new Map(tabs.map((t) => [t.id, t])), orders };
  }, [visits, donations, tabs, tickets]);
  const [filter, setFilter] = useState<Filter>('all');
  const run = useRun();
  const count = (f: Filter) => open.filter((n) => inboxIn(n, f)).length;
  const list = handledView ? handled : open.filter((n) => inboxIn(n, filter));
  const total = open.length + vreq.length;
  const bulk = !handledView && filter === 'payments' ? list.map((n) => resolve(n, maps).pay).filter((p): p is PayItem => payOpen(p)) : [];
  const chip = (f: Filter, label: string, n: number) => <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>{n ? `${label} · ${n}` : label}</Chip>;

  if (handledView) {
    return (
      <AppScreen variant="detail" gap={10}>
        <TopBar back={{ label: 'לטיפול', ...lnk('/manage/inbox') }} />
        <PageTitle>מה שטופל</PageTitle>
        {!list.length && <EmptyState variant="fill" icon="check" title="עוד לא טופל כלום" />}
        {list.map((n) => <InboxCard key={n.id} n={n} r={resolve(n, maps)} handled open={open} />)}
      </AppScreen>
    );
  }
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={<TextLink {...lnk('/manage/inbox?view=handled')}>מה שטופל</TextLink>} />
      <PageTitle>לטיפול · <span className="k-num">{total}</span></PageTitle>
      <ChipRow label="סינון">
        {chip('all', 'הכל', total)}
        {chip('payments', 'תשלומים', count('payments'))}
        {chip('visits', 'ביקורים', count('visits'))}
        {chip('contact', 'פניות', count('contact'))}
        {(count('receipts') > 0 || filter === 'receipts') && chip('receipts', 'קבלות', count('receipts'))}
        {(count('stall') > 0 || filter === 'stall') && chip('stall', 'דוכן', count('stall'))}
        {(count('orders') > 0 || filter === 'orders') && chip('orders', 'הזמנות', count('orders'))}
      </ChipRow>
      {bulk.length > 1 && (
        <Button variant="outline" block onClick={() => run(() => approveMany(ctx.actor, bulk, open), `אושרו ${bulk.length} תשלומים`)}>
          אישור כל התשלומים · {bulk.length}
        </Button>
      )}
      {filter === 'all' && vreq.map((r) => <VendorCard key={r.id} r={r} eventId={ctx.eventToday?.id || ''} />)}
      {list.map((n) => <InboxCard key={n.id} n={n} r={resolve(n, maps)} open={open} />)}
      {!list.length && !(filter === 'all' && vreq.length) && <EmptyState variant="fill" icon="check" title="אין כלום שמחכה" text="כשאורח פונה, מבקש ביקור או מסמן שהעביר כסף, זה מופיע כאן." />}
    </AppScreen>
  );
}

/** The card's delete (M3): set by the card's wrapper, shown as a quiet X at the end of the head. */
const OnDelete = createContext<(() => void) | null>(null);
function CardShell({ icon, over, title, meta, children, done }: { icon: IconName; over: ReactNode; title: ReactNode; meta?: ReactNode; children?: ReactNode; done?: boolean }) {
  const onDelete = useContext(OnDelete);
  return (
    <Card as="section" pad="md" layout="col" className={done ? 'manage-item--done' : undefined}>
      <div className="manage-item__head">
        <span className="manage-item__icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
        <div className="manage-item__body">
          <span className="manage-item__over">{over}</span>
          <span className="manage-item__title">{title}</span>
          {meta ? <span className="manage-item__meta">{meta}</span> : null}
        </div>
        {onDelete && <IconButton className="manage-item__del" icon="close" variant="quiet" label="מחיקה מהרשימה" onClick={onDelete} />}
      </div>
      {children && <div className="manage-item__acts">{children}</div>}
    </Card>
  );
}

/** Wraps a card with its delete and the one confirmation. */
function Deletable({ title, text, run, children }: { title: string; text: string; run: () => Promise<unknown>; children: ReactNode }) {
  const [ask, setAsk] = useState(false);
  const remove = useRemove();
  return (
    <OnDelete.Provider value={() => setAsk(true)}>
      {children}
      <ConfirmSheet open={ask} onClose={() => setAsk(false)} title={title} text={text} confirmLabel="מחיקה"
        onConfirm={() => remove(run, { after: () => setAsk(false) })} />
    </OnDelete.Provider>
  );
}

function VendorCard({ r, eventId }: { r: VendorRequest; eventId: string }) {
  return (
    <Deletable title="למחוק את הבקשה?" text={`הבקשה של ${r.vendorName} תימחק. הדוכן לא יקבל על זה הודעה.`} run={() => deleteVendorRequest(r)}>
      <VendorCardBody r={r} eventId={eventId} />
    </Deletable>
  );
}
function VendorCardBody({ r, eventId }: { r: VendorRequest; eventId: string }) {
  return (
    <CardShell icon="stall" over={`בקשה מדוכן · ${agoLong(r.createdAt)}`} title={`${r.vendorName} · ${VREQ[r.kind]}`} meta={r.text || undefined}>
      <Button {...lnk(`/manage/events/${eventId}/vendors/today`)}>פרטים</Button>
    </CardShell>
  );
}

function InboxCard(p: { n: AppNotification; r: Resolved; open: AppNotification[]; handled?: boolean }) {
  return (
    <Deletable title="למחוק מהרשימה?" text="הפריט יימחק מהרשימה לטיפול. הביקור, התרומה או ההזמנה עצמם נשארים." run={() => deleteInboxItem(p.n)}>
      <InboxCardBody {...p} />
    </Deletable>
  );
}
function InboxCardBody({ n, r, open, handled }: { n: AppNotification; r: Resolved; open: AppNotification[]; handled?: boolean }) {
  const { actor, peopleByUid, settings } = useV2();
  const run = useRun();
  const ext = useExternal();
  const done = () => run(() => setHandled(n, actor, !handled), { text: handled ? 'חזר לתור' : 'סומן טופל', undo: () => setHandled(n, actor, !!handled) });
  const back = handled ? <Button variant="quiet" onClick={done}>החזרה לתור</Button> : null;
  const by = handled && n.handledBy ? ` · ${firstName(n.handledBy.name)}` : '';
  const approve = (p: PayItem, label: string) => run(() => approvePayment(actor, p, open), { text: `אושר: ${label}`, undo: () => undoApproval(actor, p, open, []) });
  const notYet = (p: PayItem) => run(() => paymentNotArrived(actor, p, open), 'סומן: עוד לא הגיע');

  if (n.type === 'contact') {
    const sender = peopleByUid.get(n.refId);
    const phone = sender?.phone || '';
    return (
      <CardShell icon="phone" done={handled} over={`פנייה · ${agoLong(n.createdAt)}${by}`} title={n.title}
        meta={<>{sender ? <a className="manage-inline-link" {...lnk(`/manage/people/${sender.uid}`)}>{sender.displayName}</a> : 'פרטי השולח אינם זמינים'}{n.text ? ` · ${n.text}` : ''}</>}>
        {handled ? back : <>
          {contactPhoneOk(phone) && <Button icon="message" onClick={() => ext(waUrl(phone, `שלום ${firstName(sender?.displayName || '')}, `))}>מענה בוואטסאפ</Button>}
          {contactPhoneOk(phone) && <Button variant="outline" onClick={() => ext(telUrl(phone))}>התקשרות</Button>}
          <Button variant="quiet" onClick={done}>טופל</Button>
        </>}
      </CardShell>
    );
  }
  if (n.type === 'visit' && r.visit) {
    const v = r.visit;
    const time = timeFromNote(v.managerNote);
    const decideAs = (status: Visit['status']) => run(() => decide(v, actor, status, v.managerNote, time, open), status === 'approved' ? 'אושר ונכנס ליומן' : 'סומן: לא מתאים');
    const wa = () => ext(waUrl(v.phone, fillTemplate(settings.templates.visitApproved, { 'שם': firstName(v.name), 'תאריך': longDate(v.date), 'שעה': time, 'הערה': v.managerNote })));
    return (
      <CardShell icon="pin" done={handled} over={`בקשת ביקור · ${agoLong(n.createdAt)}${by}`} title={`${v.name} · ${v.people} אנשים`} meta={`${dayName(v.date)} ${ddmm(v.date)} · ${v.type}`}>
        {handled ? back : v.status === 'new' ? <>
          <Button onClick={() => decideAs('approved')}>אישור ליומן</Button>
          <Button variant="outline" onClick={() => decideAs('rejected')}>לא מתאים</Button>
          <Button variant="quiet" {...lnk(`/manage/visits/${v.id}`)}>פרטים</Button>
        </> : <>
          {v.status === 'approved' && contactPhoneOk(v.phone) && <Button variant="outline" icon="message" onClick={wa}>וואטסאפ</Button>}
          <Button variant="quiet" {...lnk(`/manage/visits/${v.id}`)}>פרטים</Button>
          <Button variant="quiet" onClick={done}>טופל</Button>
        </>}
      </CardShell>
    );
  }
  if (n.type === 'receipt' && r.donation) {
    const d = r.donation;
    return (
      <CardShell icon="file" done={handled} over={`בקשה לקבלה${by}`} title={`${money(d.amount)} · ${d.receiptName || d.name}`} meta={d.receiptSent ? 'הקבלה נשלחה' : undefined}>
        {handled ? back : <>
          {!d.receiptSent && <Button onClick={() => run(async () => { await markReceipt(actor, d, true); await setHandled(n, actor, true); }, 'סומן: הקבלה נשלחה')}>הקבלה נשלחה</Button>}
          <Button variant="quiet" {...lnk(`/manage/donations/${d.id}`)}>פרטים</Button>
        </>}
      </CardShell>
    );
  }
  if (r.pay && r.donation) {
    const d = r.donation; const p = r.pay;
    const status = d.paymentStatus === 'claimed' ? gw(d.name, 'סימן שהעביר', 'סימנה שהעבירה') : d.paymentStatus === 'pending' ? 'עוד לא שולמה' : d.paymentStatus === 'cancelled' ? 'בוטלה' : 'שולמה';
    const meta = [d.memorial && `לזכר ${d.memorial}`, needsReceipt(d) && gw(d.name, 'צריך קבלה', 'צריכה קבלה')].filter(Boolean).join(' · ');
    return (
      <CardShell icon="heart" done={handled} over={`תרומה · ${status}${by}`} title={`${money(d.amount)} · ${d.name}`} meta={meta || undefined}>
        {handled ? back : payOpen(p) ? <>
          <Button onClick={() => approve(p, `${money(d.amount)} · ${d.name}`)}>אישור תשלום</Button>
          {d.paymentStatus === 'claimed' && <Button variant="quiet" onClick={() => notYet(p)}>עוד לא הגיע</Button>}
        </> : <><Button variant="quiet" {...lnk(`/manage/donations/${d.id}`)}>פרטים</Button><Button variant="quiet" onClick={done}>טופל</Button></>}
      </CardShell>
    );
  }
  if (r.pay && r.tab) {
    const t = r.tab; const p = r.pay;
    return (
      <CardShell icon="cart" done={handled} over={`חשבון דוכן · ${t.eventTitle}${by}`} title={`${money(t.total)} · ${t.guestName}`} meta={t.status === 'claimed' ? `${gw(t.guestName, 'סימן שהעביר', 'סימנה שהעבירה')} ${ago(n.createdAt)}` : 'פתוח'}>
        {handled ? back : payOpen(p) ? <>
          <Button onClick={() => approve(p, `${money(t.total)} · ${t.guestName}`)}>אישור תשלום</Button>
          {t.status === 'claimed' && <Button variant="quiet" onClick={() => notYet(p)}>עוד לא הגיע</Button>}
        </> : <Button variant="quiet" onClick={done}>טופל</Button>}
      </CardShell>
    );
  }
  if (r.pay && r.tickets) {
    const ts = r.tickets.filter((t) => t.status === 'valid'); const t = ts[0] || r.tickets[0]; const p = r.pay;
    const sum = ts.filter((x) => x.paymentStatus === 'claimed' || x.paymentStatus === 'pending').reduce((s, x) => s + x.price, 0);
    return (
      <CardShell icon="ticket" done={handled} over={`כרטיסים · ${t.eventTitle}${by}`} title={`${money(sum)} · ${t.ownerName}`} meta={`${ts.length} כרטיסים · ${gw(t.ownerName, 'סימן שהעביר', 'סימנה שהעבירה')} ${ago(n.createdAt)}`}>
        {handled ? back : payOpen(p) ? <>
          <Button onClick={() => approve(p, `${money(sum)} · ${t.ownerName}`)}>אישור תשלום</Button>
          <Button variant="quiet" onClick={() => notYet(p)}>עוד לא הגיע</Button>
        </> : <Button variant="quiet" onClick={done}>טופל</Button>}
      </CardShell>
    );
  }
  // anything else (new order, join, or a record that is gone): open it, or mark handled
  return (
    <CardShell icon={ICON[n.type] || 'bell'} done={handled} over={`${agoLong(n.createdAt)}${by}`} title={n.title} meta={n.text || undefined}>
      {handled ? back : <>
        {n.link && n.link !== '/manage/inbox' && <Button variant="outline" onClick={() => go(n.link)}>פתיחה</Button>}
        <Button variant="quiet" onClick={done}>טופל</Button>
      </>}
    </CardShell>
  );
}

