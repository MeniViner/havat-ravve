// U5 GuestTickets (the nearest order's card, rows for the rest), U6 GuestTicketUnpaid (one order), and the past events list.
// Tickets live in the Firestore cache on the phone and the QR is drawn locally, so the card opens with no reception.
import { useState } from 'react';
import { AppScreen, go } from '../../core';
import { Button, EmptyState, ListCard, MoreMenu, PageTitle, Row, Tag, TopBar, type ActionItem } from '../../kit';
import { qrPayload } from '../../../data';
import { firstName, money } from '../../format';
import { type GuestCtx, type Order, paths, useMine, orderState, ticketsWord, dayShort, downloadIcs, share, orderTag } from './data';
import { TicketCard, Note } from './parts';

/** The card's ⋯ (U5, U6): share this ticket, add the event to the calendar, the event page. */
function cardActions(o: Order, index: number): ActionItem[] {
  const list = o.valid.length ? o.valid : o.tickets;
  const t = list[Math.min(index, list.length - 1)];
  const holder = t.holderName ? ` ל${firstName(t.holderName)}` : '';
  return [
    { label: `שיתוף כרטיס ${t.index}${holder}`, icon: 'share', onSelect: () => share({ title: o.first.eventTitle, text: `הכרטיס של ${t.holderName || t.ownerName} ל${o.first.eventTitle} (${t.index}/${t.total}). קוד: ${qrPayload(t)}` }) },
    { label: 'להוסיף ליומן', icon: 'calendar', hidden: !o.event, onSelect: () => o.event && downloadIcs(o.event) },
    { label: 'לדף האירוע', icon: 'ticket', onSelect: () => go(`/events/${o.first.eventId}`) },
  ];
}
/** "ממתין לתשלום · 50 ₪", "שולם · שבת 28.11" */
const orderMeta = (o: Order) => {
  const s = orderState(o);
  if (s === 'due') return `ממתין לתשלום · ${money(o.owed)}`;
  return [orderTag(o).text, o.event ? dayShort(o.event.start) : ''].filter(Boolean).join(' · ');
};

export function TicketsPage({ ctx }: { ctx: GuestCtx }) {
  const mine = useMine(ctx);
  const [index, setIndex] = useState(0);
  const head = (end?: React.ReactNode) => (
    <header className="guest-head">
      <div className="guest-head__titles"><span className="guest-sub">נשמרים בטלפון, עובדים בלי קליטה</span><PageTitle>הכרטיסים שלי</PageTitle></div>
      {end}
    </header>
  );
  if (!ctx.profile) {
    return (
      <AppScreen variant="root" gap={10}>
        {head()}
        <EmptyState variant="fill" icon="ticket" title="עוד לא נכנסתם" text="הכרטיסים, הביקורים והתרומות שלכם מחכים אחרי כניסה עם Google."
          action={<Button onClick={() => go('/login?next=' + encodeURIComponent(paths(ctx).tickets))}>כניסה</Button>} />
      </AppScreen>
    );
  }
  const [main, ...rest] = mine.upcoming;
  return (
    <AppScreen variant="root" gap={10}>
      {head(main && <MoreMenu title="הכרטיס" items={cardActions(main, index)} />)}
      {!main && !mine.loading && (
        <EmptyState variant="card" icon="ticket" title="אין כרטיסים עדיין" text="כשתזמינו כרטיסים לאירוע הם יופיעו כאן, עם ברקוד לכל אחד."
          action={<Button variant="outline" onClick={() => go('/')}>לאירועים</Button>} />
      )}
      {main && <TicketCard order={main} index={index} onIndex={setIndex} onPay={() => go(`/me/orders/${main.id}/pay`)} />}
      {rest.map((o) => (
        <ListCard key={o.id}><Row minHeight={52} onClick={() => go(`/me/orders/${o.id}`)}
          title={`עוד הזמנה ל${o.first.eventTitle} · ${ticketsWord(o.valid.length)}`} meta={orderMeta(o)} /></ListCard>
      ))}
      {mine.past.length > 0 && (
        <ListCard><Row minHeight={52} onClick={() => go('/me/past')} title={`אירועים שהיו · ${mine.past.length}`}
          meta={`${mine.past[0].first.eventTitle} · ${ticketsWord(mine.past[0].tickets.length)}`} /></ListCard>
      )}
      {/* a team member has no guest account page (their /me is the team profile): visits, donations and stall accounts from here */}
      {ctx.team && <ListCard><Row minHeight={52} onClick={() => go('/me/items')} title="מה יש לי בחווה" meta="כרטיסים, ביקורים, תרומות וחשבונות בדוכן" /></ListCard>}
    </AppScreen>
  );
}

/** U6: one order's card (an unpaid order shows "לתשלום"). */
export function OrderDetail({ ctx, orderId }: { ctx: GuestCtx; orderId: string }) {
  const mine = useMine(ctx);
  const [index, setIndex] = useState(0);
  const o = mine.orders.find((x) => x.id === orderId);
  const p = paths(ctx);
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar className="guest-pull" back={{ label: 'הכרטיסים שלי', onClick: () => go(p.tickets) }} end={o && <MoreMenu title="הכרטיס" items={cardActions(o, index)} />} />
      {!o ? (!mine.loading && <EmptyState variant="fill" icon="ticket" title="ההזמנה לא נמצאה" />) : <>
        <TicketCard order={o} index={index} onIndex={setIndex} onPay={() => go(`/me/orders/${o.id}/pay`)} />
        {orderState(o) === 'due' && !o.past && <Note>הכרטיס תקף. בשער יבקשו לשלם אם עוד לא שילמת.</Note>}
      </>}
    </AppScreen>
  );
}

/** "אירועים שהיו": past and cancelled orders, newest first. */
export function PastPage({ ctx }: { ctx: GuestCtx }) {
  const mine = useMine(ctx);
  const p = paths(ctx);
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar className="guest-pull" back={{ label: 'הכרטיסים שלי', onClick: () => go(p.tickets) }} />
      <PageTitle size="detail">אירועים שהיו</PageTitle>
      {!mine.past.length ? (!mine.loading && <EmptyState variant="card" icon="calendar" title="עוד לא היו אירועים" />) : (
        <ListCard>
          {mine.past.map((o) => {
            const tag = orderTag(o);
            return <Row key={o.id} onClick={() => go(`/me/orders/${o.id}`)} title={`${o.first.eventTitle} · ${ticketsWord(o.tickets.length)}`}
              tags={<Tag tone={tag.tone}>{tag.text}</Tag>} meta={o.event ? dayShort(o.event.start) : undefined} />;
          })}
        </ListCard>
      )}
    </AppScreen>
  );
}
