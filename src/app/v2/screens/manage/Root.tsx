// Q1 manage root and M2 inbox ("לטיפול").
// Q1: the hero, six tiles, then exactly two rows (כל הפעילות; יומן אינסטינקט for owners). Everything else the parity round
// appended here has one home elsewhere (rule 1): the calendar is the Farm tab, recurring tasks the managers' row at the bottom
// of Tasks, stall holders are reached from an event, places from the Farm tab card, and team messages inside People.
// M2: cards keep their designed buttons; there is no X on a card. Tapping a contact message opens W1 and a stall request
// opens W2 (their delete is behind ⋯ there); tapping any other card's head opens its row sheet (Q11) with "פתיחה" and the
// delete from the list. Approving a payment opens the Q7 confirmation sheet.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, RootHead, go, useExternal, useRemove, useV2, waUrl, telUrl } from '../../core';
import { ActionSheet, Button, Card, Chip, ChipRow, EmptyState, Hero, HeroNumber, Icon, PageTitle, TextLink, Tile, TileGrid, TopBar, type ActionItem, type IconName } from '../../kit';
import { usePayConfirm, type PayConfirmTarget } from '../../patterns';
import { agoLong, ago, dayName, ddmm, dayOverline, inDays, money, longDate, firstName } from '../../format';
import { nowIso } from '../../../clock';
import { useUpcomingEvents, contactPhoneOk } from '../../../data';
import type { AppNotification, Donation, Tab, Ticket, Visit, VendorRequest } from '../../../types';
import {
  useNotifications, useHandledNotifications, useVendorRequests, usePeople, useVisits, useDonations, useOpenTabs, useOpenTickets,
  inboxIn, inboxSummary, donationTotals, approvedSoon, gw, timeFromNote, needsReceipt, fillTemplate, payTarget,
  approvePayment, paymentNotArrived, undoApproval, approveMany, setHandled, decide, markReceipt, useRun, deleteInboxItem, type PayItem, type InboxFilter,
} from '../../data/manage';
import { lnk, LinkCard } from './shared';

// ---------- Q1 ----------
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
      <TileGrid>
        <Tile icon="ticket" title="אירועים" meta={next ? `${next.title} ${inDays(next.start)}` : 'אין אירוע קרוב'} {...lnk('/manage/events')} />
        <Tile icon="people" title="אנשים והודעות" meta={`${people.length} רשומים · הודעה לצוות או לכולם`} {...lnk('/manage/people')} />
        <Tile icon="pin" title="ביקורים" badge={freshVisits} badgeLabel={`${freshVisits} בקשות חדשות`} meta={`${approvedSoon(visits, ctx.today)} מאושרים החודש`} {...lnk('/manage/visits')} />
        <Tile icon="heart" title="תרומות" badge={d.toApprove} badgeLabel={`${d.toApprove} לאישור`} meta={`${money(d.month)} החודש`} {...lnk('/manage/donations')} />
        <Tile icon="chart" title="דוחות" meta="משימות, כסף, חובות" {...lnk('/manage/reports')} />
        <Tile icon="sliders" title="הגדרות" meta="תשלום, הודעות, מנהלים" {...lnk('/manage/settings')} />
      </TileGrid>
      <LinkCard path="/manage/activity" title="כל הפעילות" meta="מי עשה מה באפליקציה, ומתי" />
      {ctx.role === 'owner' && <LinkCard path="/manage/instinct" title="יומן אינסטינקט" meta="מה העוזר האישי עשה בשמך · רק בעלים" />}
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
/** Where "פתיחה" in a card's row sheet goes: the record's own screen when there is one. */
function detailOf(n: AppNotification, r: Resolved): string {
  if (r.visit) return `/manage/visits/${r.visit.id}`;
  if (r.donation) return `/manage/donations/${r.donation.id}`;
  if (r.tab) return `/manage/events/${r.tab.eventId}/tabs/${r.tab.id}`;
  if (r.tickets?.length) return `/manage/events/${r.tickets[0].eventId}?tab=guests`;
  return n.link && n.link !== '/manage/inbox' ? n.link : '';
}
/** Still waiting for the manager's approval (claimed or pending), so the payment buttons make sense. */
const payOpen = (p?: PayItem) => !!p && (p.kind === 'donation' ? p.doc.paymentStatus === 'claimed' || p.doc.paymentStatus === 'pending' : p.kind === 'tab' ? p.doc.status === 'claimed' || p.doc.status === 'open' : p.tickets.some((t) => t.status === 'valid' && (t.paymentStatus === 'claimed' || t.paymentStatus === 'pending')));

/** Q7: the screen's payment confirmation sheet, opened by a card after its approval went through. */
const AskPay = createContext<(t: PayConfirmTarget) => void>(() => {});

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
  const pay = usePayConfirm();
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
    <AskPay.Provider value={pay.ask}>
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
      {pay.sheet}
    </AskPay.Provider>
  );
}

/** What tapping the head of a card does, set by the card's wrapper: its row sheet (Q11, popup) or its own screen (W1, W2). */
const OnMore = createContext<{ run: () => void; popup: boolean } | null>(null);
function CardShell({ icon, over, title, meta, children, done, oneLine }: { icon: IconName; over: ReactNode; title: ReactNode; meta?: ReactNode; children?: ReactNode; done?: boolean; oneLine?: boolean }) {
  const onMore = useContext(OnMore);
  const head = (
    <>
      <span className="manage-item__icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <span className="manage-item__body">
        <span className="manage-item__over">{over}</span>
        <span className="manage-item__title">{title}</span>
        {meta ? <span className={oneLine ? 'manage-item__meta manage-item__meta--one' : 'manage-item__meta'}>{meta}</span> : null}
      </span>
    </>
  );
  return (
    <Card as="section" pad="md" layout="col" className={done ? 'manage-item--done' : undefined}>
      {onMore
        ? <div className="manage-item__head"><button type="button" className="manage-item__hit" onClick={onMore.run} aria-haspopup={onMore.popup ? 'dialog' : undefined}>{head}</button></div>
        : <div className="manage-item__head">{head}</div>}
      {children && <div className="manage-item__acts">{children}</div>}
    </Card>
  );
}

/** Wraps a card with its row sheet: "פתיחה" (when the item has a screen) and the delete from the list behind Q8. */
function WithSheet({ title, sub, open, confirm, children }: { title: string; sub?: string; open?: string; confirm: { title: string; text: string; run: () => Promise<unknown> }; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const remove = useRemove();
  const items: ActionItem[] = [
    { label: 'פתיחה', icon: 'chevron', hidden: !open, onSelect: () => go(open!) },
    { label: 'מחיקה מהרשימה', icon: 'trash', tone: 'danger', confirm: { title: confirm.title, text: confirm.text, onConfirm: () => remove(confirm.run, { text: 'נמחק מהרשימה' }) } },
  ];
  return (
    <OnMore.Provider value={{ run: () => setShown(true), popup: true }}>
      {children}
      <ActionSheet open={shown} onClose={() => setShown(false)} title={title} sub={sub} items={items} />
    </OnMore.Provider>
  );
}

/** A card whose head opens its own detail screen (W1, W2). */
function Opens({ path, children }: { path: string; children: ReactNode }) {
  return <OnMore.Provider value={{ run: () => go(path), popup: false }}>{children}</OnMore.Provider>;
}

function VendorCard({ r, eventId }: { r: VendorRequest; eventId: string }) {
  const path = `/manage/inbox/stall/${eventId}/${r.id}`; // W2
  return (
    <Opens path={path}>
      <CardShell icon="stall" over={`בקשה מדוכן · ${agoLong(r.createdAt)}`} title={`${r.vendorName} · ${VREQ[r.kind]}`} meta={r.text || undefined}>
        <Button {...lnk(path)}>פרטים</Button>
      </CardShell>
    </Opens>
  );
}

function InboxCard(p: { n: AppNotification; r: Resolved; open: AppNotification[]; handled?: boolean }) {
  const { actor } = useV2();
  if (p.n.type === 'contact') return <Opens path={`/manage/inbox/${p.n.id}`}><InboxCardBody {...p} /></Opens>; // W1
  return (
    <WithSheet title={p.n.title} sub={agoLong(p.n.createdAt)} open={detailOf(p.n, p.r) || undefined}
      confirm={{ title: 'למחוק מהרשימה?', text: 'הפריט יימחק מהרשימה לטיפול. הביקור, התרומה או ההזמנה עצמם נשארים.', run: () => deleteInboxItem(actor, p.n) }}>
      <InboxCardBody {...p} />
    </WithSheet>
  );
}
function InboxCardBody({ n, r, open, handled }: { n: AppNotification; r: Resolved; open: AppNotification[]; handled?: boolean }) {
  const { actor, peopleByUid, settings } = useV2();
  const run = useRun();
  const ext = useExternal();
  const askPay = useContext(AskPay);
  const done = () => run(() => setHandled(n, actor, !handled), { text: handled ? 'חזר לתור' : 'סומן טופל', undo: () => setHandled(n, actor, !!handled) });
  const back = handled ? <Button variant="quiet" onClick={done}>החזרה לתור</Button> : null;
  const by = handled && n.handledBy ? ` · ${firstName(n.handledBy.name)}` : '';
  const approve = async (p: PayItem, label: string) => {
    const target = payTarget(p);
    if (await run(() => approvePayment(actor, p, open), { text: `אושר: ${label}`, undo: () => undoApproval(actor, p, open, []) })) askPay(target);
  };
  const notYet = (p: PayItem) => run(() => paymentNotArrived(actor, p, open), 'סומן: עוד לא הגיע');

  if (n.type === 'contact') {
    const sender = peopleByUid.get(n.refId);
    const phone = n.contactId ? '' : sender?.phone || '';
    return (
      <CardShell icon="phone" done={handled} oneLine over={`פנייה · ${agoLong(n.createdAt)}${by}`} title={n.title}
        meta={<>{sender ? sender.displayName : 'פרטי השולח אינם זמינים'}{n.text ? ` · ${n.text}` : ''}</>}>
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
