import { eventMillis } from '../events/logic';
// U1 GuestHome and U2 GuestEvent. Both open signed out.
import { useEffect, useMemo, useState } from 'react';
import { AppScreen, go, useExternal } from '../../core';
import { Button, BottomBar, DateBox, DetailList, DetailRow, EmptyState, Icon, IconButton, ListCard, Quote, Row, Tag, TextLink, TopBar, cx } from '../../kit';
import { useEventClock } from '../../data/eventClock';
import { useEvent, useMyTickets } from '../../../data';
import { useDemo } from '../../../demo/store';
import { demoPreviousGuestVisit } from '../../../demo/data';
import { nowIso } from '../../../clock';
import { back } from '../../../router';
import { publicOrigin } from '../../../native';
import { dayName, daysFromToday, hhmm, ddmm } from '../../format';
import { isRead, markRead, markSeen, useBroadcastNotification, useMyBroadcasts, useReceipt } from '../../data/broadcast';
import type { Broadcast, Profile } from '../../../types';
import {
  type GuestCtx, actorOf, paths, useEvents, isPast, hours, monthShort, dayNum, priceLine, whenLong, ordersOf, byDate, ticketsWord, dayShort, downloadIcs, mapsSearch,
} from './data';
import { PhotoHeader } from './parts';
import { EventShareActions } from '../events/EventShareActions';

// ---------- "חדש" on events published since the previous visit ----------
// Kept stable while the guest opens an event and comes back to the home screen.
const previousVisits = new Map<string, string | null>();
function usePreviousVisit(uid: string | undefined, ready: boolean) {
  const demo = useDemo();
  const key = 'farm-guest-visit:' + (demo.on ? 'demo:' : 'real:') + (uid || 'anon');
  const fallback = demo.on && demo.persona === 'guest' ? demoPreviousGuestVisit : null;
  const previous = useMemo(() => {
    if (previousVisits.has(key)) return previousVisits.get(key) ?? null;
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }, [key, fallback]);
  useEffect(() => {
    if (!ready || previousVisits.has(key)) return;
    previousVisits.set(key, previous);
    try { localStorage.setItem(key, nowIso()); } catch { /* private mode */ }
  }, [key, previous, ready]);
  return previous;
}

// ---------- the message card (U1) ----------
const MESSAGE_DAYS = 30;
type Verdict = 'loading' | 'read' | 'unread';
/** Loads my receipt for one message, marks it seen once, and reports whether it is still unread. */
function Probe({ profile, b, onVerdict }: { profile: Profile; b: Broadcast; onVerdict: (id: string, v: Verdict) => void }) {
  const { item, loading } = useReceipt(b.id, profile.uid);
  const verdict: Verdict = loading ? 'loading' : isRead(item) ? 'read' : 'unread';
  useEffect(() => { onVerdict(b.id, verdict); }, [b.id, verdict]);
  useEffect(() => { if (!loading && !item) markSeen(actorOf(profile), b.id).catch(() => {}); }, [loading, !!item, b.id]);
  return null;
}
export const messageWhen = (iso: string) => (daysFromToday(iso) === 0 ? `היום ${hhmm(iso)}` : daysFromToday(iso) === -1 ? `אתמול ${hhmm(iso)}` : ddmm(iso));
function MessageCard({ profile, b, onDone }: { profile: Profile; b: Broadcast; onDone: () => void }) {
  const { item } = useReceipt(b.id, profile.uid);
  const note = useBroadcastNotification(profile.uid, b.id);
  const [out, setOut] = useState(false);
  const seen = () => { setOut(true); markRead(actorOf(profile), b.id, item, note.item).catch(() => {}); setTimeout(onDone, 220); };
  return (
    <section role="status" className={cx('k-hero k-hero--tight guest-msg', out && 'guest-msg--out')}>
      <div className="guest-msg__head"><Icon name="megaphone" size={18} /><span>הודעה מהחווה · {messageWhen(b.createdAt)}</span></div>
      <span className="guest-msg__text">{b.text}</span>
      <Button variant="onhero-solid" className="guest-msg__btn" onClick={seen}>ראיתי</Button>
    </section>
  );
}
/** The newest message to me that I have not read ("ראיתי" writes my receipt). Nothing when all are read. */
function Messages({ profile }: { profile: Profile }) {
  const mine = useMyBroadcasts(profile.uid, 10);
  const recent = mine.items.filter((b) => daysFromToday(b.createdAt) >= -MESSAGE_DAYS);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [gone, setGone] = useState<string[]>([]);
  const onVerdict = (id: string, v: Verdict) => setVerdicts((s) => (s[id] === v ? s : { ...s, [id]: v }));
  let pick: Broadcast | null = null;
  for (const b of recent) {
    if (gone.includes(b.id)) continue;
    const v = verdicts[b.id];
    if (v === 'loading' || v === undefined) break;
    if (v === 'unread') { pick = b; break; }
  }
  return <>{recent.map((b) => <Probe key={b.id} profile={profile} b={b} onVerdict={onVerdict} />)}{pick && <MessageCard key={pick.id} profile={profile} b={pick} onDone={() => setGone((g) => [...g, pick!.id])} />}</>;
}

/** "3 כרטיסים לפסטיבל הסתיו" under the message: the nearest upcoming order, one tap to the QR. */
function TicketShortcut({ ctx }: { ctx: GuestCtx }) {
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid);
  const events = useEvents();
  const next = useMemo(() => ordersOf(tickets.items, events.byId).filter((o) => !o.cancelled && !o.past).sort(byDate)[0], [tickets.items, events.byId]);
  if (!next) return null;
  const n = next.valid.length;
  return (
    <button type="button" className="guest-shortcut" onClick={() => go(paths(ctx).tickets)}>
      <Icon name="qr" size={24} />
      <span className="guest-shortcut__body"><b>{n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`} ל{next.first.eventTitle}</b><span>{next.event ? `${dayShort(next.event.start)} · ` : ''}להצגה בשער</span></span>
      <Icon name="chevron" size={20} />
    </button>
  );
}

export function GuestHome({ ctx }: { ctx: GuestCtx }) {
  const { items, loading, error } = useEvents();
  const previous = usePreviousVisit(ctx.profile?.uid, !loading && !error);
  const now = useEventClock(items.map((event)=>event.end));
  const upcoming = items.filter((e) => eventMillis(e.end) > now);
  const presets = ctx.settings.donationPresets.slice(0, 2).map((p) => p.label).join(', ');
  return (
    <AppScreen variant="root" gap={10} bodyClassName="guest-bleed">
      <PhotoHeader height={150} overline="ליד טנא עומרים" title="חוות רווה" label="תמונה של החווה בשקיעה" />
      {ctx.profile && <Messages profile={ctx.profile} />}
      {ctx.profile && <TicketShortcut ctx={ctx} />}
      {!upcoming.length ? (loading ? null : <EmptyState variant="card" icon="calendar" title="אין אירועים פתוחים כרגע" text="כשיתפרסם אירוע הוא יופיע כאן." />) : (
        <ListCard title="אירועים קרובים">
          {upcoming.map((e, i) => (
            <Row key={e.id} minHeight={64} onClick={() => go(`/events/${e.id}`)}
              leading={<DateBox day={dayNum(e.start)} month={monthShort(e.start)} className={i === 0 ? 'guest-datebox--pine' : undefined} />}
              title={e.title} tags={previous && (e.publishedAt || e.createdAt) > previous ? <Tag tone="warm">חדש</Tag> : undefined}
              meta={`${dayName(e.start)} · ${hours(e)} · ${priceLine(e)}`} />
          ))}
        </ListCard>
      )}
      <div className="guest-tiles">
        <GuestTile icon="pin" title="תיאום ביקור" meta="קבוצות וסיורים" onClick={() => go('/visit')} />
        <GuestTile icon="heart" title="תרומה לחווה" meta={presets} onClick={() => go('/donate')} />
        <GuestTile icon="phone" title="פנייה לחווה" meta="שאלה או בקשה" onClick={() => go('/contact')} />
        <a className="guest-tile" href="/"><span className="guest-tile__icon"><Icon name="globe" size={24} /></span><span className="guest-tile__body"><b>האתר של החווה</b><span>מי אנחנו, איך מגיעים</span></span></a>
      </div>
      {ctx.settings.guestIntro && <span className="k-note guest-intro">{ctx.settings.guestIntro}</span>}
    </AppScreen>
  );
}
function GuestTile({ icon, title, meta, onClick }: { icon: 'pin' | 'heart' | 'phone'; title: string; meta: string; onClick: () => void }) {
  return <button type="button" className="guest-tile" onClick={onClick}><span className="guest-tile__icon"><Icon name={icon} size={24} /></span><span className="guest-tile__body"><b>{title}</b><span>{meta}</span></span></button>;
}

// ---------- U2 ----------
export function EventPage({ ctx, id }: { ctx: GuestCtx; id: string }) {
  const { item: e, loading } = useEvent(id);
  useEventClock([e?.end || '']);
  const open = useExternal();
  if (loading) return <AppScreen variant="detail" />;
  if (!e || !e.published) {
    return (
      <AppScreen variant="detail">
        <TopBar back={{ label: 'בית', onClick: () => go('/') }} />
        <EmptyState variant="fill" icon="calendar" title="האירוע לא נמצא" text="אולי הוסר מפרסום" action={<Button variant="outline" onClick={() => go('/')}>לדף הבית</Button>} />
      </AppScreen>
    );
  }
  const past = isPast(e);
  const place = e.location || 'חוות רווה, ליד טנא עומרים';
  const bar = past ? <Button size="bar" grow disabled>האירוע הסתיים</Button>
    : !e.open || ('closed' in e && !!e.closed) ? <Button size="bar" grow disabled>ההרשמה עוד לא נפתחה</Button>
    : <Button size="bar" grow icon="ticket" onClick={() => go(`/events/${e.id}/order`)}>{e.price ? 'הזמנת כרטיסים' : 'הרשמה'}</Button>;
  return (
    <AppScreen variant="detail" gap={12} bodyClassName="guest-bleed" bar={<BottomBar>{bar}</BottomBar>}>
      <PhotoHeader src={e.image} height={190} overline={whenLong(e)} title={e.title} label={`תמונה מ${e.title}`} />
      <TopBar className="guest-pull" back={{ label: 'בית', onClick: () => back('/') }} end={<span className="guest-icons">
        <IconButton icon="calendar" label="להוסיף ליומן" variant="bordered" onClick={() => downloadIcs(e)} />
        <EventShareActions event={e} compact />
      </span>} />
      <DetailList>
        <DetailRow term="איפה" action={<TextLink onClick={() => open(mapsSearch(place))}>ניווט</TextLink>}>{place}</DetailRow>
        <DetailRow term="מחיר">{priceLine(e)}</DetailRow>
        <DetailRow term="כמה">עד {ticketsWord(e.maxPerOrder)} בהזמנה</DetailRow>
      </DetailList>
      {e.description && <p className="guest-lead">{e.description}</p>}
      <Quote>כל כרטיס מקבל ברקוד משלו, שנשמר בטלפון ועובד בשער גם בלי קליטה.{e.price ? ' משלמים בביט, ב־PayBox או במזומן בכניסה.' : ''}</Quote>
    </AppScreen>
  );
}
