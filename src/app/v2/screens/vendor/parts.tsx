// Pieces shared by the vendor screens: header with the farm's WhatsApp, the event hero, spot card, the day's timeline,
// the event contact, farm messages and the "היית אצלנו" list.
import { useState, type ReactNode } from 'react';
import { Avatar, Card, DateBox, Dot, Hero, HeroNumber, Icon, IconButton, ListCard, Row, Sheet, Tag, TextLink, TopBar, Quote, Button, type IconName } from '../../kit';
import { useExternal, waUrl, telUrl, useV2 } from '../../core';
import { navigate } from '../../../router';
import { nowMs } from '../../../clock';
import { getDemoStates } from '../../../demo/store';
import { daysFromToday, ddmm, dayTime, firstName, initials } from '../../format';
import {
  useVendorDoc, useVendorBundles, useVendorInfo, useLive, timeline, hours, dayShort, setupTime, soon,
  femName, g, type Bundle, type EventVendorDoc, type VendorInfo, type VendorDoc, type TimelineItem,
} from '../../data/vendor';
import type { V2Ctx } from '../../ctx';
import { isRead, markRead, useMyBroadcasts, useReceipt, type Receipt } from '../../data/broadcast';
import type { Broadcast } from '../../../types';
import type { FarmEvent } from '../../../types';

/** The vendor's stall document and every event they were invited to. `empty` (demo Z3) hides what is coming up. */
export function useVendorWorld(ctx: V2Ctx) {
  const v = useVendorDoc(ctx.vendorId);
  const b = useVendorBundles(ctx.vendorId, v.item?.events);
  const empty = getDemoStates().empty;
  const items = b.items.filter((x) => x.record && (!empty || x.phase === 'past'));
  const ahead = items.filter((x) => x.phase !== 'past' && x.record?.status !== 'declined');
  const past = items.filter((x) => x.phase === 'past' && x.record?.status === 'confirmed').reverse();
  return { vendor: v.item, loading: v.loading || (!!v.item && b.loading), items, next: ahead[0] || null, past };
}

/** The farm's WhatsApp, a pine circle (D1, D3, D4). */
export function FarmWa() {
  const ctx = useV2(); const open = useExternal();
  const phone = ctx.settings.contact?.whatsapp || ctx.settings.contact?.phone || '';
  return <IconButton icon="message" iconSize={22} variant="solid" round label="וואטסאפ לחווה" onClick={() => phone && open(waUrl(phone))} disabled={!phone} />;
}

/** Root header of the vendor screens: overline (the stall), title, WhatsApp to the farm, avatar to /me. */
export function VendorHead({ overline, title }: { overline?: ReactNode; title: ReactNode }) {
  const ctx = useV2();
  const p = ctx.profile as { displayName?: string; photo?: string };
  return (
    <header className="k-rootheader vendor-head">
      <div className="k-rootheader__titles">
        {overline !== undefined && <span className="k-rootheader__overline">{overline}</span>}
        <h1 className="k-h1">{title}</h1>
      </div>
      <div className="k-rootheader__actions">
        <FarmWa />
        <Avatar initials={initials(p.displayName || ctx.actor.name)} src={p.photo || undefined} size={44} tone="outline" label="אני: הפרטים וההגדרות שלי" onClick={() => navigate('/me')} />
      </div>
    </header>
  );
}

/** Detail top bar: named back link and the farm's WhatsApp (D4, D9). */
export const VendorTop = ({ label = 'האירועים', href = '/vendor' }: { label?: string; href?: string }) =>
  <TopBar back={{ label, onClick: () => navigate(href) }} end={<FarmWa />} />;

export const statusTag = (rec: EventVendorDoc | null, onHero = false) => {
  if (!rec) return null;
  if (rec.status === 'confirmed') return <Tag tone={onHero ? 'onhero' : 'paid'}>אישרת הגעה</Tag>;
  if (rec.status === 'declined') return <Tag tone={onHero ? 'onhero' : 'neutral'}>לא מגיעים</Tag>;
  return <Tag tone={onHero ? 'onhero' : 'waiting'}>מחכים לתשובה שלך</Tag>;
};

/** Days left as the big hero number. */
export function Countdown({ iso }: { iso: string }) {
  const d = Math.max(0, daysFromToday(iso));
  return (
    <div className="vendor-count">
      <HeroNumber>{d}</HeroNumber>
      <span className="vendor-count__unit">{d === 1 ? 'יום' : 'ימים'}</span>
    </div>
  );
}

/** D3, D11: the next event as one warm link. Unanswered invitations open D1, answered ones D4. */
export function NextHero({ b, info }: { b: Bundle; info: VendorInfo | null }) {
  const e = b.event;
  const href = b.record?.status === 'invited' ? `/vendor/invite/${e.id}` : `/vendor/events/${e.id}`;
  return (
    <Hero onClick={() => navigate(href)} chevron={false} className="vendor-hero" aria-label={`${e.title}, ${dayShort(e.start)}`}>
      <div className="k-hero__body">
        <span className="k-hero__meta">האירוע הבא · {dayShort(e.start)}</span>
        <b className="k-hero__big">{e.title}</b>
        <span className="k-hero__sub"><span dir="ltr">{hours(e)}</span> · הקמה מ־{setupTime(e, info)}</span>
        {statusTag(b.record, true)}
      </div>
      <Countdown iso={e.start} />
    </Hero>
  );
}

/** "הדוכן שלך: מספר 3" with the spot note and the stall map. */
export function SpotCard({ rec, info }: { rec: EventVendorDoc | null; info: VendorInfo | null }) {
  const open = useExternal();
  const spot = rec?.spot;
  return (
    <Card pad="md" layout="row" className="vendor-spot" as="section">
      <DateBox tone="warm" day={spot ?? '?'} />
      <div className="vendor-spot__body">
        <span className="vendor-spot__title">{spot ? `הדוכן שלך: מספר ${spot}` : 'מספר הדוכן עוד לא נקבע'}</span>
        <span className="vendor-spot__meta">{spot ? rec?.spotNote || 'נכוון אותך כשתגיע' : 'נעדכן כאן לפני האירוע'}</span>
      </div>
      {info?.mapUrl && <TextLink onClick={() => open(info.mapUrl!)}>במפה</TextLink>}
    </Card>
  );
}

/** The vendor's day. `from` = start at the next item and show `limit` rows (D5 "עכשיו"); the next item is bold. */
export function Timeline({ e, info, title, limit, withSoon }: { e: FarmEvent; info: VendorInfo | null; title: string; limit?: number; withSoon?: boolean }) {
  const all = timeline(e, info);
  const now = nowMs();
  const nextIdx = Math.max(0, all.findIndex((t) => new Date(t.at).getTime() > now));
  const items: (TimelineItem & { i: number })[] = all.map((t, i) => ({ ...t, i }));
  const shown = limit ? items.slice(nextIdx, nextIdx + limit) : items;
  return (
    <section className="k-card k-card--list">
      <div className="k-cardhead"><h2 className="k-cardhead__title">{title}</h2></div>
      <ul className="k-list">
        {shown.map((t) => (
          <li key={t.i} className={`vendor-tl${t.i === nextIdx ? ' vendor-tl--next' : ''}`}>
            <b className="vendor-tl__time">{t.time}</b>
            <span className="vendor-tl__text">{t.text}</span>
            <span className="vendor-tl__meta">{withSoon && t.i === nextIdx ? soon(t.at) : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The event contact with WhatsApp (and phone). */
export function ContactCard({ info, phone = true }: { info: VendorInfo | null; phone?: boolean }) {
  const open = useExternal();
  const c = info?.contact;
  if (!c?.name) return null;
  const f = femName(c.name); const fn = firstName(c.name);
  return (
    <ListCard>
      <Row minHeight={60} leading={<Avatar name={c.name} />} title={c.name} meta={g(f, 'איש הקשר שלך באירוע', 'אשת הקשר שלך באירוע')}
        actions={c.phone ? <>
          <IconButton icon="message" variant="outline" label={`וואטסאפ ל${fn}`} onClick={() => open(waUrl(c.phone))} />
          {phone && <IconButton icon="phone" variant="outline" label={`התקשרות ל${fn}`} onClick={() => open(telUrl(c.phone))} />}
        </> : undefined} />
    </ListCard>
  );
}

const msgTime = (iso: string) => { const d = daysFromToday(iso); return d === 0 || d === -1 ? dayTime(iso) : ddmm(iso); };
function MsgRow({ m, uid, onOpen }: { m: Broadcast; uid: string; onOpen: (m: Broadcast, r: Receipt | null) => void }) {
  const read = useReceipt(m.id, uid);
  const unread = !read.loading && !isRead(read.item);
  return (
    <Row minHeight={54} leading={unread ? <Dot size="sm" label="חדש" /> : undefined} title={m.text.split('\n')[0]} meta={`${firstName(m.by.name)} · ${msgTime(m.createdAt)}`} onClick={() => onOpen(m, read.item)} />
  );
}
/** "הודעות מהחווה": broadcasts addressed to me (the broadcast area's useMyBroadcasts). Opening one writes my receipt. */
export function FarmMessages({ ctx, n = 2 }: { ctx: V2Ctx; n?: number }) {
  const list = useMyBroadcasts(ctx.user.uid, n);
  const [open, setOpen] = useState<Broadcast | null>(null);
  if (!list.items.length) return null;
  const show = (m: Broadcast, r: Receipt | null) => {
    setOpen(m);
    if (!isRead(r)) markRead(ctx.actor, m.id, r, null).catch(() => {});
  };
  return <>
    <ListCard title="הודעות מהחווה" end={<TextLink onClick={() => navigate('/notifications')}>הכל</TextLink>}>
      {list.items.map((m) => <MsgRow key={m.id} m={m} uid={ctx.user.uid} onOpen={show} />)}
    </ListCard>
    <Sheet open={!!open} onClose={() => setOpen(null)} title="הודעה מהחווה" aside={open ? `${firstName(open.by.name)} · ${msgTime(open.createdAt)}` : undefined}>
      {open && <Quote>{open.text}</Quote>}
      <Button variant="primary" size="lg" block onClick={() => setOpen(null)}>סגירה</Button>
    </Sheet>
  </>;
}

/** One past event: visitors from the brief, else the live counter. */
function PastRow({ b }: { b: Bundle }) {
  const info = useVendorInfo(b.id); const live = useLive(b.id, !info.loading && !info.item?.visitors);
  const visitors = info.item?.visitors ?? live.item?.entered;
  const meta = [visitors ? `${visitors} מבקרים` : '', info.item?.thanks ? 'הסיכום שלך' : ''].filter(Boolean).join(' · ') || 'הסיכום שלך';
  return <Row title={`${b.event.title} · ${ddmm(b.event.start)}`} meta={meta} onClick={() => navigate(`/vendor/events/${b.id}/summary`)} />;
}
export function PastList({ past, count }: { past: Bundle[]; count?: boolean }) {
  if (!past.length) return null;
  return <ListCard title="היית אצלנו" count={count ? past.length : undefined}>{past.map((b) => <PastRow key={b.id} b={b} />)}</ListCard>;
}

/** Leading icon tile for "נשאר לך" rows. */
export const TodoTile = ({ icon }: { icon: IconName }) => (
  <span className="k-icontile" aria-hidden="true"><Icon name={icon} size={20} /></span>
);

/** Loading and error frames in the tone of the nearest screen. */
export const Quiet = ({ text }: { text: string }) => <p className="vendor-note" role="status" style={{ margin: 0 }}>{text}</p>;

export type { VendorDoc };
