// W1 a contact message and W2 a stall request, each opened from its card in the inbox (M2). W2 also opens from the
// vendors-today screen (V7). Both: back to where they came from, ⋯ with the delete (Q8), and the bottom bar of the design.
// W1: the message, one row for the sender (their person file), reply by WhatsApp or call, "טופל".
// W2: the request with an open or closed tag, the stall and the sender as rows, who is handling it, "טופל" and "אני על זה".
// "אני על זה" stores takenBy + takenAt on the request; the vendor sees it on D6 ("נועה בדרך אליך").
import { useMemo } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, useRemove, useToast, waUrl, telUrl } from '../../core';
import { Avatar, BottomBar, Button, DetailList, DetailRow, IconButton, IconTile, ListCard, MoreMenu, PageTitle, Quote, Row, Tag, TopBar, type ActionItem } from '../../kit';
import { back } from '../../../router';
import { useDoc, isConflict } from '../../../db';
import { useContactGuest } from '../../data/contact';
import { agoLong, hhmm, firstName } from '../../format';
import { contactPhoneOk, useUpcomingEvents } from '../../../data';
import type { AppNotification } from '../../../types';
import { useMyTickets, setHandled, deleteInboxItem, deleteVendorRequest, useRun, roleWord, gw } from '../../data/manage';
import { useEventDoc, useVendorDoc, useEventVendor, closeRequest, takeRequest, requestLabel, femName, g, type VendorRequestDoc } from '../../data/vendor';
import { ordersOf, byDate } from '../guest/data';
import { Loading, NotFound } from './shared';

const INBOX = { label: 'לטיפול', path: '/manage/inbox' };

// ---------- W1 ----------
export function InboxMessageScreen({ ctx, params }: ScreenProps) {
  const { item: n, loading } = useDoc<AppNotification>(`notifications/${params.id || '_'}`, !!params.id);
  const sender = n ? ctx.peopleByUid.get(n.refId) : undefined;
  const contact = useContactGuest(n?.contactId || '').item;
  const tickets = useMyTickets(sender?.uid || '', !!sender).items;
  const events = useUpcomingEvents().items;
  const run = useRun();
  const ext = useExternal();
  const remove = useRemove();
  // "3 כרטיסים לפסטיבל הסתיו": the sender's nearest upcoming order, as on their own home screen (U1)
  const nextOrder = useMemo(() => {
    const next = ordersOf(tickets, new Map(events.map((e) => [e.id, e]))).filter((o) => !o.cancelled && !o.past).sort(byDate)[0];
    if (!next) return '';
    const count = next.valid.length;
    return `${count === 1 ? 'כרטיס אחד' : `${count} כרטיסים`} ל${next.first.eventTitle}`;
  }, [tickets, events]);
  if (loading) return <Loading back={INBOX} />;
  if (!n || n.type !== 'contact') return <NotFound back={INBOX} title="הפנייה לא נמצאה" />;
  const name = sender?.displayName || (contact ? 'אורח מפנייה' : '');
  const phone = n.contactId ? (contact?.method === 'phone' ? contact.reply : '') : sender?.phone || '';
  const handled = !!n.handled;
  const toggle = async () => {
    const ok = await run(() => setHandled(n, ctx.actor, !handled), { text: handled ? 'חזר לתור' : 'סומן טופל', undo: () => setHandled(n, ctx.actor, handled) });
    if (ok) back(INBOX.path);
  };
  const actions: ActionItem[] = [
    { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: {
      title: 'למחוק את הפנייה?',
      text: `הפנייה${name ? ` של ${name}` : ''} תימחק מהרשימה לטיפול ומ"מה שטופל". ${name ? gw(name, 'הוא לא יקבל', 'היא לא תקבל') : 'השולח לא יקבל'} על זה הודעה.`,
      onConfirm: () => remove(() => deleteInboxItem(ctx.actor, n), { text: 'הפנייה נמחקה', after: () => go(INBOX.path, true) }),
    } },
  ];
  const over = `פנייה · ${agoLong(n.createdAt)}${handled && n.handledBy ? ` · טופל · ${firstName(n.handledBy.name)}` : ''}`;
  const bar = (
    <BottomBar>
      {handled
        ? <Button size="bar" grow variant="outline" onClick={toggle}>החזרה לתור</Button>
        : <Button size="bar" grow icon="check" onClick={toggle}>טופל</Button>}
    </BottomBar>
  );
  return (
    <AppScreen variant="detail" bar={bar}>
      <TopBar back={{ label: INBOX.label, onClick: () => back(INBOX.path) }} end={<MoreMenu title="פנייה" items={actions} />} />
      <div className="manage-titled">
        <span className="k-meta">{over}</span>
        <PageTitle size="detail" className="k-h1--detail-tight">{n.title}</PageTitle>
      </div>
      {n.text && <Quote>{n.text}</Quote>}
      <ListCard aria-label="מי פנה">
        {sender
          ? <Row minHeight={58} leading={<Avatar name={name} />} title={name}
              meta={[roleWord(sender.role, femName(name)), nextOrder].filter(Boolean).join(' · ')} onClick={() => go(`/manage/people/${sender.uid}`)} />
          : contact ? <Row minHeight={58} leading={<Avatar name={name} />} title={name} meta={<bdi>{contact.reply}</bdi>} onClick={() => go(`/manage/people/contact/${contact.id}`)} />
          : <Row minHeight={58} title={<span className="k-soft" style={{ fontWeight: 400 }}>פרטי השולח אינם זמינים</span>} />}
      </ListCard>
      {contact?.method === 'email' && <Button variant="outline" icon="mail" onClick={() => ext('mailto:' + contact.reply)}>מענה במייל · <bdi>{contact.reply}</bdi></Button>}
      {contactPhoneOk(phone) && (
        <div className="manage-replies">
          <Button icon="message" onClick={() => ext(waUrl(phone, `שלום ${firstName(name)}, `))}>מענה בוואטסאפ</Button>
          <Button variant="outline" icon="phone" onClick={() => ext(telUrl(phone))}>התקשרות</Button>
        </div>
      )}
      {!handled && <span className="k-meta">אחרי שעניתם, מסמנים "טופל" והפנייה יורדת מהתור. היא נשארת ב"מה שטופל".</span>}
    </AppScreen>
  );
}

// ---------- W2 ----------
/** From the inbox (M2): /manage/inbox/stall/:eid/:rid. */
export function StallRequestScreen(p: ScreenProps) { return <StallRequest {...p} from={INBOX} />; }
/** From the vendors-today screen (V7): /manage/events/:eid/vendors/today/:rid. */
export function StallRequestFromDay(p: ScreenProps) { return <StallRequest {...p} from={{ label: 'הדוכנים היום', path: `/manage/events/${p.params.eid}/vendors/today` }} />; }

function StallRequest({ ctx, params, from }: ScreenProps & { from: { label: string; path: string } }) {
  const eid = params.eid || '', rid = params.rid || '';
  const { item: r, loading } = useDoc<VendorRequestDoc>(`events/${eid || '_'}/vendor_requests/${rid || '_'}`, !!eid && !!rid);
  const e = useEventDoc(eid).item;
  const v = useVendorDoc(r?.vendorId || '').item;
  const rec = useEventVendor(eid, r?.vendorId || '').item;
  const toast = useToast();
  const ext = useExternal();
  const remove = useRemove();
  if (loading) return <Loading back={from} />;
  if (!r) return <NotFound back={from} title="הבקשה לא נמצאה" />;
  const open = !r.closedAt;
  const sender = r.by;
  const senderPhone = ctx.peopleByUid.get(sender?.uid || '')?.phone || (v?.people || []).find((x) => x.uid === sender?.uid)?.phone || v?.phone || '';
  const fail = (x: unknown) => toast.refused(isConflict(x) ? (x as Error).message : `לא נשמר. ${(x as Error).message}`);
  const take = async () => {
    try { await takeRequest(ctx, eid, rid); toast.show({ text: `${firstName(sender?.name || '') || r.vendorName} רואה שמישהו בדרך`, check: true }); }
    catch (x) { fail(x); }
  };
  const done = async () => {
    try { await closeRequest(ctx, eid, rid, sender?.uid); toast.show({ text: 'סומן שטופל', check: true }); back(from.path); }
    catch (x) { fail(x); }
  };
  const actions: ActionItem[] = [
    { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: {
      title: 'למחוק את הבקשה?',
      text: `הבקשה של ${r.vendorName} תימחק. הדוכן לא יקבל על זה הודעה.`,
      onConfirm: () => remove(() => deleteVendorRequest(ctx.actor, r), { text: 'הבקשה נמחקה', after: () => go(from.path, true) }),
    } },
  ];
  const handler = r.takenBy
    ? `${r.takenBy.name}${r.takenAt ? ` · ${g(femName(r.takenBy.name), 'לקח', 'לקחה')} ב־${hhmm(r.takenAt)}` : ''}`
    : 'עוד אף אחד';
  const stallMeta = [rec?.spot ? `דוכן ${rec.spot}` : '', rec?.spotNote || ''].filter(Boolean).join(' · ');
  const bar = open ? (
    <BottomBar>
      <Button size="bar" grow icon="check" onClick={done}>טופל</Button>
      <Button size="bar" variant="secondary" onClick={take}>אני על זה</Button>
    </BottomBar>
  ) : undefined;
  return (
    <AppScreen variant="detail" bar={bar}>
      <TopBar back={{ label: from.label, onClick: () => back(from.path) }} end={<MoreMenu title="בקשה מדוכן" items={actions} />} />
      <div className="manage-titled">
        <span className="k-meta">{['בקשה מדוכן', e?.title, hhmm(r.createdAt)].filter(Boolean).join(' · ')}</span>
        <div className="manage-titletag">
          <PageTitle size="detail" className="k-h1--detail-tight">{requestLabel(r)}</PageTitle>
          {open ? <Tag tone="urgent">פתוחה</Tag> : <Tag>סגורה</Tag>}
        </div>
      </div>
      <ListCard aria-label="הדוכן ומי ביקש">
        <Row minHeight={58} leading={<IconTile icon="stall" />} title={v?.name || r.vendorName} meta={stallMeta || undefined} onClick={() => go(`/manage/vendors/${r.vendorId}`)} />
        <Row minHeight={58} leading={<Avatar name={sender?.name || ''} />} title={sender?.name || ''} meta={g(femName(sender?.name || ''), 'שלח את הבקשה', 'שלחה את הבקשה')}
          actions={contactPhoneOk(senderPhone) ? <IconButton icon="message" variant="outline" label={`וואטסאפ ל${firstName(sender?.name || '')}`} onClick={() => ext(waUrl(senderPhone))} /> : undefined} />
      </ListCard>
      <DetailList className="manage-dl50">
        <DetailRow term="מי מטפל">{handler}</DetailRow>
        <DetailRow term="נפתחה">{hhmm(r.createdAt)} · {agoLong(r.createdAt)}</DetailRow>
        {!open && <DetailRow term="נסגרה">{hhmm(r.closedAt!)}{r.closedBy ? ` · ${r.closedBy.name}` : ''}</DetailRow>}
      </DetailList>
      {open && <span className="k-meta">"אני על זה" מודיע לבעל הדוכן שמישהו בדרך. "טופל" סוגר את הבקשה אצלו ואצלכם.</span>}
    </AppScreen>
  );
}
