// VendorHome: one route (/vendor), five designs chosen by state.
// Event today and confirmed: D5 (not arrived yet) or D6 (arrived). Otherwise a helper sees D11, a stall owner D3,
// and with nothing coming up D10.
import { useState } from 'react';
import { Card, Dot, EmptyState, Hero, HeroNumber, Icon, IconTile, ListCard, Row, TextLink, TileGrid, Toggle, type IconName } from '../../kit';
import { AppScreen, useToast, useExternal } from '../../core';
import { navigate } from '../../../router';
import { nowMs } from '../../../clock';
import { isConflict } from '../../../db';
import { ddmm, hhmm } from '../../format';
import {
  useVendorInfo, useLive, useMyRequests, useVendorInvites, peopleOf, checkIn, createRequest, closeRequest, setInviteNext, markGuidelinesRead,
  setupTime, vehiclesUntil, peakUntil, duration, answerBy, dayShort, first, g, femName, requestLabel, type Bundle, type RequestKind, type VendorDoc,
} from '../../data/vendor';
import { useVendorWorld, VendorHead, NextHero, SpotCard, Timeline, ContactCard, FarmMessages, PastList, Quiet } from './parts';
import { BroadcastCard } from '../broadcast';
import type { ScreenProps } from '../../ctx';
import type { V2Ctx } from '../../ctx';

export function VendorHome({ ctx }: ScreenProps) {
  const w = useVendorWorld(ctx);
  const v = w.vendor;
  if (!ctx.vendorId || (!w.loading && !v)) {
    return <AppScreen variant="root" gap={10}>
      <VendorHead title="האירועים" />
      <EmptyState variant="card" icon="stall" title="החשבון עוד לא מקושר לדוכן" text="בקשו מהחווה קישור חדש בוואטסאפ, ונחבר אתכם לדוכן." />
    </AppScreen>;
  }
  if (w.loading || !v) return <AppScreen variant="root" gap={10}><VendorHead overline={v?.name} title="האירועים" /><Quiet text="טוען את האירועים..." /></AppScreen>;
  const n = w.next;
  if (n && n.phase === 'today' && n.record?.status === 'confirmed') return <EventDay ctx={ctx} v={v} b={n} />;
  if (n && ctx.helper) return <HelperHome ctx={ctx} v={v} b={n} />;
  if (n) return <Home ctx={ctx} v={v} b={n} past={w.past} />;
  return <Empty ctx={ctx} v={v} past={w.past} />;
}

// ---------- D3 ----------
function Home({ ctx, v, b, past }: { ctx: V2Ctx; v: VendorDoc; b: Bundle; past: Bundle[] }) {
  const info = useVendorInfo(b.id).item;
  const invites = useVendorInvites(v.id, !ctx.helper);
  const open = useExternal();
  const rec = b.record;
  const people = peopleOf(v, invites.items);
  const helpers = people.filter((p) => p.role === 'helper');
  const want = Math.max(0, (rec?.people || 1) - 1);
  const todos: { key: string; icon: IconName; title: string; meta: string; go: () => void }[] = [];
  if (rec?.status === 'invited') todos.push({ key: 'answer', icon: 'calendar', title: 'לענות להזמנה', meta: `אפשר עד ${ddmm(answerBy(b.event, info))}`, go: () => navigate(`/vendor/invite/${b.id}`) });
  if (helpers.length < want || helpers.some((h) => !h.entered)) {
    todos.push({ key: 'helpers', icon: 'people', title: 'לצרף את מי שעובד איתך', meta: 'כדי שגם הם יקבלו עדכונים', go: () => navigate(helpers.length < want ? '/vendor/stall/helpers/new' : '/vendor/stall') });
  }
  if (info?.guidelines?.url && !rec?.guidelinesReadAt) {
    todos.push({ key: 'guide', icon: 'file', title: 'לקרוא את ההנחיות לדוכנים', meta: info.guidelines.minutes ? `${info.guidelines.minutes} דקות קריאה` : 'קובץ מהחווה', go: () => { open(info.guidelines!.url); void markGuidelinesRead(b.id, v.id); } });
  }
  return (
    <AppScreen variant="root" gap={10}>
      <VendorHead overline={v.name} title="האירועים" />
      <BroadcastCard ctx={ctx} />
      <NextHero b={b} info={info} />
      {todos.length > 0 && (
        <ListCard title="נשאר לך" count={todos.length}>
          {todos.map((t) => <Row key={t.key} minHeight={58} leading={<IconTile icon={t.icon} />} title={t.title} meta={t.meta} onClick={t.go} />)}
        </ListCard>
      )}
      <FarmMessages ctx={ctx} />
      <PastList past={past} />
    </AppScreen>
  );
}

// ---------- D10 ----------
function Empty({ ctx, v, past }: { ctx: V2Ctx; v: VendorDoc; past: Bundle[] }) {
  const toast = useToast();
  const [on, setOn] = useState(!!v.inviteNext);
  const flip = async (next: boolean) => {
    setOn(next);
    try { await setInviteNext(ctx.actor, v.id, next); toast.show({ text: next ? 'החווה תראה שאתם רוצים להגיע לאירוע הבא' : 'עודכן. לא נזמין אוטומטית', check: next }); }
    catch (e) { setOn(!next); toast.refused(isConflict(e) ? undefined : `לא נשמר. ${(e as Error).message}`); }
  };
  return (
    <AppScreen variant="root" gap={10}>
      <VendorHead overline={v.name} title="האירועים" />
      <BroadcastCard ctx={ctx} />
      <EmptyState variant="card" icon="calendar" title="אין כרגע אירוע קרוב" text={`כשנזמין אותך לאירוע הוא יופיע כאן, ${g(v.fem, 'ותקבל', 'ותקבלי')} גם הודעה בוואטסאפ.`} />
      {!ctx.helper && (
        <div className="vendor-togglecard">
          <div className="vendor-togglecard__body">
            <span className="vendor-togglecard__title">להזמין אותי לאירוע הבא</span>
            <span className="vendor-togglecard__meta">החווה רואה שאתם מעוניינים</span>
          </div>
          <Toggle checked={on} onChange={flip} label="להזמין אותי לאירוע הבא" />
        </div>
      )}
      <PastList past={past} count />
    </AppScreen>
  );
}

// ---------- D11 ----------
function HelperHome({ ctx, v, b }: { ctx: V2Ctx; v: VendorDoc; b: Bundle }) {
  const info = useVendorInfo(b.id).item;
  const me = (v.people || []).find((p) => p.uid === ctx.user.uid);
  const owner = (v.people || []).find((p) => p.role === 'owner');
  const addedBy = (ctx.profile as { addedBy?: string }).addedBy;
  const adder = (v.people || []).find((p) => p.uid === (me?.addedBy || addedBy)) || owner;
  const fem = me?.fem ?? femName(ctx.actor.name);
  const added = me?.addedAt || (ctx.profile as { createdAt?: string }).createdAt;
  return (
    <AppScreen variant="root" gap={10}>
      <VendorHead overline={v.name} title="האירועים" />
      <BroadcastCard ctx={ctx} />
      <Card className="vendor-banner" as="section">
        <IconTile icon="stall" />
        <span className="vendor-banner__text" role="status">
          {g(fem, 'אתה', 'את')} בדוכן של <b>{owner?.name || v.contact || v.name}</b>.
          {adder && added ? ` ${first(adder.name)} ${g(adder.fem ?? femName(adder.name), 'צירף', 'צירפה')} אותך ב־${ddmm(added)}.` : ''}
        </span>
      </Card>
      <NextHero b={b} info={info} />
      <SpotCard rec={b.record} info={info} />
      <FarmMessages ctx={ctx} />
      <ContactCard info={info} />
    </AppScreen>
  );
}

// ---------- D5 / D6 ----------
const ASKS: { kind: RequestKind; icon: IconName; label: string }[] = [
  { kind: 'power', icon: 'bolt', label: 'החשמל נפל' }, { kind: 'help', icon: 'people', label: 'צריך עזרה בדוכן' },
  { kind: 'supply', icon: 'box', label: 'נגמר לי משהו' }, { kind: 'other', icon: 'help', label: 'משהו אחר' },
];
function EventDay({ ctx, v, b }: { ctx: V2Ctx; v: VendorDoc; b: Bundle }) {
  const info = useVendorInfo(b.id).item;
  const toast = useToast(); const open = useExternal();
  const [busy, setBusy] = useState(false);
  const e = b.event; const rec = b.record!;
  const now = nowMs();
  const overline = `${dayShort(e.start)} · ${hhmm(new Date(now))}`;
  const arrive = async () => {
    setBusy(true);
    try { await checkIn(ctx, e.id, v.id); toast.show({ text: 'מעולה. החווה יודעת שהגעתם', check: true }); }
    catch (err) { toast.refused(isConflict(err) ? undefined : `לא נשמר. ${(err as Error).message}`); }
    finally { setBusy(false); }
  };
  if (!rec.arrivedAt) {
    return (
      <AppScreen variant="root" gap={10}>
        <VendorHead overline={overline} title="היום האירוע" />
        <BroadcastCard ctx={ctx} />
        <Hero className="vendor-hero" aria-label={e.title}>
          <div className="vendor-titles">
            <b className="vendor-hero__when">{e.title}</b>
            <span className="k-hero__sub">הקמה מ־{setupTime(e, info)} · פתיחה ב־{hhmm(e.start)}</span>
          </div>
          <button type="button" className="vendor-hero__checkin" onClick={arrive} disabled={busy}><Icon name="check" size={24} />הגעתי לחווה</button>
          <span className="vendor-hero__note">כך החווה יודעת שאתם כאן, ומישהו יכוון אתכם לדוכן.</span>
        </Hero>
        <SpotCard rec={rec} info={info} />
        <Timeline e={e} info={info} title="עכשיו" limit={3} withSoon />
        <ContactCard info={info} />
        <div className="vendor-actions">
          <button type="button" className="k-btn k-btn--outline k-btn--tall" onClick={() => open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location || 'חוות רווה')}`)}><Icon name="nav" size={18} />ניווט לחווה</button>
          {info?.mapUrl && <button type="button" className="k-btn k-btn--outline k-btn--tall" onClick={() => open(info.mapUrl!)}><Icon name="pin" size={18} />מפת הדוכנים</button>}
        </div>
      </AppScreen>
    );
  }
  return <Live ctx={ctx} v={v} b={b} info={info} overline={overline} />;
}

function Live({ ctx, v, b, info, overline }: { ctx: V2Ctx; v: VendorDoc; b: Bundle; info: ReturnType<typeof useVendorInfo>['item']; overline: string }) {
  const toast = useToast();
  const e = b.event; const rec = b.record!;
  const live = useLive(e.id).item;
  const reqs = useMyRequests(e.id, v.id);
  const openReq = reqs.items.find((r) => !r.closedAt) || null;
  const [sending, setSending] = useState<RequestKind | null>(null);
  const now = nowMs(); const started = new Date(e.start).getTime() <= now;
  const ask = async (kind: RequestKind) => {
    if (reqs.items.some((r) => !r.closedAt && r.kind === kind)) { toast.show({ text: 'כבר ביקשת את זה. המנהלים יודעים.' }); return; }
    setSending(kind);
    try { await createRequest(ctx, e, v, rec, info, kind); toast.show({ text: 'נשלח למנהלים. מישהו בדרך', check: true }); }
    catch (err) { toast.refused(isConflict(err) ? undefined : `לא נשמר. ${(err as Error).message}`); }
    finally { setSending(null); }
  };
  const settled = async () => {
    if (!openReq) return;
    try { await closeRequest(ctx, e.id, openReq.id, openReq.takenBy?.uid); toast.show({ text: 'מעולה. סימנו שהסתדר', check: true }); }
    catch (err) { toast.refused(isConflict(err) ? (err as Error).message : `לא נשמר. ${(err as Error).message}`); }
  };
  const taker = openReq?.takenBy;
  return (
    <AppScreen variant="root" gap={10}>
      <VendorHead overline={overline} title={started ? 'האירוע פתוח' : 'הגעת לחווה'} />
      <BroadcastCard ctx={ctx} />
      <Hero className={started ? "vendor-hero vendor-hero--live" : "vendor-hero"} aria-label="מבקרים">
        {started ? <>
          <div className="vendor-live">
            <HeroNumber>{live?.entered ?? 0}</HeroNumber>
            <span className="vendor-live__label">מבקרים נכנסו עד עכשיו</span>
          </div>
          <div className="k-hero__split">
            <span>השיא צפוי עד {peakUntil(e, info)}</span>
            <span>{new Date(e.end || e.start).getTime() > now ? `נשארו ${duration(new Date(e.end || e.start).getTime() - now)}` : 'האירוע מסתיים'}</span>
          </div>
        </> : <>
          <div className="vendor-titles">
            <b className="vendor-hero__when">{e.title}</b>
            <span className="k-hero__sub">הגעתם ב־{hhmm(rec.arrivedAt!)} · פתיחה ב־{hhmm(e.start)}</span>
          </div>
          <div className="k-hero__split"><span>הרכבים יוצאים לחניה עד {vehiclesUntil(e, info)}</span><span>{`עוד ${duration(new Date(e.start).getTime() - now)}`}</span></div>
        </>}
      </Hero>
      {openReq && (
        <Card pad="md" as="section" className="vendor-status">
          <Dot tone="amber" />
          <div className="vendor-status__body" role="status">
            <span className="vendor-status__title">ביקשת: {requestLabel(openReq)}</span>
            <span className="vendor-status__meta">{hhmm(openReq.createdAt)} · {taker ? `${first(taker.name)} בדרך אליך` : 'נשלח למנהלים'}</span>
          </div>
          <TextLink onClick={settled}>הסתדר</TextLink>
        </Card>
      )}
      <div className="vendor-ask">
        <span className="vendor-ask__label" id="vendor-ask">צריך משהו? נשלח ישר למנהלים</span>
        <TileGrid>
          {ASKS.map((a) => (
            <button key={a.kind} type="button" className="vendor-ask__btn" aria-describedby="vendor-ask" disabled={!!sending} aria-pressed={sending === a.kind || undefined} onClick={() => ask(a.kind)}>
              <Icon name={a.icon} size={22} />{a.label}
            </button>
          ))}
        </TileGrid>
      </div>
      <SpotCard rec={rec} info={info} />
      <ContactCard info={info} />
    </AppScreen>
  );
}
