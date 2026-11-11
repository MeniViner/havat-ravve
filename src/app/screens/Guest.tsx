// Guest side: events, tickets, visits, donations. Everything is visible before signing in; Google only when it is really needed.
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { FarmEvent, Ticket, Profile } from '../types';
import { PAYMENT_LABELS, VISIT_LABELS, TAB_LABELS } from '../types';
import type { GuestCtx } from '../ctx';
import { Top, Sec, Row, Pill, Btn, A, Icon, Empty, Field, Input, Textarea, Chip, Stepper, SwitchRow, Avatar, Loading, useToast, fmtDateShort, fmtWeekday, fmtDayLong, fmtRange, firstName, money, todayISO, dateKey, fmtMonthYear, relTime, useDesktop } from '../ui';
import { navigate } from '../router';
import { useUpcomingEvents, useEvent, useEventTickets, useMyTickets, orderTickets, qrPayload, claimOrderPaid, useMyVisits, createVisit, cancelVisit, useMyDonations, createDonation, claimDonationPaid, useMyTabs, claimTabPaid, waLink } from '../data';
import { signIn, authErrorMessage } from '../firebase';
import { createProfile } from '../store';
import { useDemo, setDemo } from '../demo/store';
import { ProfileSection, NotificationsSection, InstallHint, SignOut, DemoSection } from './More';

const needLogin = (ctx: GuestCtx, next: string) => { if (ctx.profile) return false; navigate('/login?next=' + encodeURIComponent(next)); return true; };
export const PaymentLine = ({ ctx }: { ctx: GuestCtx }) => { const p = ctx.settings.payment; return <>{[p.bit && `ביט ${p.bit}`, p.paybox && 'PayBox', p.cash && 'או מזומן בשער'].filter(Boolean).join(' · ')}{p.note ? <><br />{p.note}</> : null}</>; };

// ---------- home ----------
export function GuestHome({ ctx }: { ctx: GuestCtx }) {
  const { items: events, loading } = useUpcomingEvents();
  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.end >= now);
  const desktop = useDesktop();
  return (
    <>
      <div className="hero" style={desktop ? { borderRadius: 16, margin: '20px 20px 0' } : undefined}><img src="/assets/rava-sunset.webp" alt="" /><div className="over"><div className="sub">ליד טנא עומרים</div><h1>חוות רווה</h1></div></div>
      <p className="lead ink" style={{ paddingTop: 14 }}>{ctx.settings.guestIntro}</p>
      <Sec title="אירועים קרובים" />
      {loading && !upcoming.length ? <Loading /> : !upcoming.length ? <Empty title="אין אירועים פתוחים כרגע" text="כשיתפרסם אירוע הוא יופיע כאן." /> : upcoming.map((e) => (
        <A key={e.id} to={`/events/${e.id}`} className="evcard">
          <div className="date"><div className="w">{fmtWeekday(e.start)}</div><div className="d">{new Date(e.start).getDate()}</div><div className="m">{fmtDateShort(e.start).replace(/^\d+\s*/, '')}</div></div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="t">{e.title}</div><div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{fmtRange(e.start, e.end)}{e.price ? ` · ${money(e.price)} לכרטיס` : ' · כניסה חופשית · נדרש רישום'}</div><div style={{ marginTop: 10 }}><span className="btn ghost sm">{e.price ? 'כרטיסים' : 'הרשמה'}</span></div></div>
        </A>
      ))}
      <Sec title="עוד דברים" />
      <div className="tiles">
        <A to="/visit" className="tile"><div className="h"><Icon name="pin" />תיאום ביקור</div><div className="s">קבוצות, סיורים, אירועים פרטיים. ממלאים ואנחנו מתקשרים.</div></A>
        <A to="/donate" className="tile"><div className="h"><Icon name="heart" />תרומה לחווה</div><div className="s">{ctx.settings.donationPresets.map((p) => p.label).join(' · ')} · סכום חופשי · הנצחה</div></A>
        <a href="/" className="tile"><div className="h"><Icon name="globe" />האתר של החווה</div><div className="s">מי אנחנו, איך מגיעים</div></a>
      </div>
    </>
  );
}

// ---------- event page ----------
export function EventPage({ id, ctx }: { id: string; ctx: GuestCtx }) {
  const { item: e, loading } = useEvent(id);
  const tickets = useEventTickets(id, !!e);
  if (loading) return <Loading />;
  if (!e || !e.published) return <><Top backTo="/" title="האירוע לא נמצא" /><Empty title="אולי הוסר מפרסום" action={<Btn kind="ghost" to="/">לדף הבית</Btn>} /></>;
  const valid = tickets.items.filter((t) => t.status === 'valid');
  const names = [...new Set(valid.map((t) => t.ownerName))].slice(0, 3);
  const past = e.end < new Date().toISOString();
  return (
    <>
      {e.image ? <div className="hero" style={{ height: 240 }}><img src={e.image} alt="" /><div className="over"><div className="sub">{fmtDayLong(e.start)} · {fmtRange(e.start, e.end)}</div><h1>{e.title}</h1></div></div>
        : <Top backTo="/" backLabel="בית" title={e.title} serif date={`${fmtDayLong(e.start)} · ${fmtRange(e.start, e.end)}`} />}
      {e.image && <div className="crumb" style={{ paddingTop: 6 }}><A to="/" className="back"><Icon name="back" />בית</A></div>}
      <dl className="kv" style={{ marginTop: 8 }}>
        <dt><Icon name="pin" size={16} /></dt><dd>{e.location || 'חוות רווה'}</dd>
        <dt><Icon name="ticket" size={16} /></dt><dd>{e.price ? `${money(e.price)} לכרטיס · עד ${e.maxPerOrder} בהזמנה` : `כניסה חופשית · נדרש רישום · עד ${e.maxPerOrder} בהזמנה`}</dd>
      </dl>
      {e.description && <p className="lead ink" style={{ paddingTop: 10, fontSize: 17 }}>{e.description}</p>}
      <p className="note">כל כרטיס מקבל ברקוד נפרד, שנשמר בטלפון ועובד בשער גם בלי קליטה.{e.price ? ' תשלום בביט, PayBox או במזומן בכניסה.' : ''}</p>
      {valid.length > 0 && !tickets.error && <><Sec title="מי כבר בא" /><div className="inline pad"><div style={{ display: 'flex' }}>{names.map((n, i) => <span key={n} style={{ marginInlineStart: i ? -8 : 0 }}><Avatar name={n} size="sm" light /></span>)}</div><span className="muted">{valid.length} נרשמו עד עכשיו</span></div></>}
      <div className="actions sticky">
        {past ? <Btn kind="ghost" disabled>האירוע הסתיים</Btn> : !e.open ? <Btn kind="ghost" disabled>ההרשמה עוד לא נפתחה</Btn> : <Btn size="big" icon="ticket" to={`/events/${e.id}/order`}>{e.price ? 'הזמנת כרטיסים' : 'הרשמה'}</Btn>}
        <div className="actions row2" style={{ padding: 0 }}><Btn kind="ghost" icon="calendar" onClick={() => downloadIcs(e)}>ליומן</Btn><Btn kind="ghost" icon="share" onClick={() => navigator.share?.({ title: e.title, text: `${e.title} בחוות רווה · ${fmtDayLong(e.start)}`, url: location.href }).catch(() => {})}>שיתוף</Btn></div>
      </div>
    </>
  );
}
export function downloadIcs(e: FarmEvent) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Havat Ravve//HE', 'BEGIN:VEVENT', `UID:${e.id}@havat-ravve.web.app`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`, `SUMMARY:${e.title}`, `LOCATION:${e.location || 'חוות רווה'}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `${e.title}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- order ----------
export function OrderPage({ id, ctx }: { id: string; ctx: GuestCtx }) {
  const { item: e, loading } = useEvent(id);
  const [count, setCount] = useState(1);
  const [holders, setHolders] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (loading) return <Loading />;
  if (!e) return <Empty title="האירוע לא נמצא" />;
  const total = e.price * count;
  const missing = e.questions.filter((q) => q.required && !(answers[q.id] || '').trim());
  const order = async () => {
    if (needLogin(ctx, `/events/${id}/order`)) return;
    setBusy(true);
    try { await orderTickets(ctx.profile!, e, count, [ctx.profile!.displayName, ...holders], answers); toast({ text: e.price ? `${count} כרטיסים נוצרו. נשאר לשלם ${money(total)}.` : 'נרשמתם! הכרטיסים בטלפון.' }, 4000); navigate('/me', true); }
    catch (err) { toast({ text: authErrorMessage(err), kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <>
      <Top backTo={`/events/${id}`} backLabel="לאירוע" title={e.price ? 'הזמנת כרטיסים' : 'הרשמה'} sub={`${e.title} · ${fmtWeekday(e.start)} ${fmtDateShort(e.start)}`} />
      <Field label="כמה כרטיסים?" hint={`עד ${e.maxPerOrder} כרטיסים בהזמנה. לכל כרטיס ברקוד משלו.`}><Stepper value={count} onChange={setCount} min={1} max={e.maxPerOrder} /></Field>
      {count > 1 && <Field label="מי מגיע איתך? (לא חובה)">
        <div className="list" style={{ gap: 8 }}><div className="input" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper2)' }}><Pill>1</Pill>{ctx.profile?.displayName || 'את/ה'}<span className="muted">· את/ה</span></div>
          {Array.from({ length: count - 1 }, (_, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Pill>{i + 2}</Pill><Input placeholder={`כרטיס ${i + 2}`} value={holders[i] || ''} onChange={(ev) => { const h = [...holders]; h[i] = ev.target.value; setHolders(h); }} /></div>)}</div>
      </Field>}
      {e.questions.map((q) => <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`}><Input value={answers[q.id] || ''} onChange={(ev) => setAnswers({ ...answers, [q.id]: ev.target.value })} /></Field>)}
      <div className="paybox ok" style={{ marginTop: 22 }}><b>{e.price ? money(total) : 'חינם'}</b>{e.price ? `${count} כרטיסים × ${money(e.price)}` : `${count} ${count === 1 ? 'כרטיס' : 'כרטיסים'}`}</div>
      {e.price > 0 && <p className="note">הכרטיסים נוצרים עכשיו ומסומנים "ממתין לתשלום". משלמים בביט או ב־PayBox ומסמנים "העברתי", או במזומן בשער.</p>}
      <div className="actions sticky">
        <Btn size="big" disabled={busy || missing.length > 0} onClick={order}>{e.price ? `הזמנה · ${money(total)}` : 'הרשמה'}</Btn>
        {!ctx.profile && <p className="lead" style={{ padding: 0, fontSize: 14 }}>בפעם הראשונה: כניסה עם Google ושם וטלפון. אחר כך לא שואלים שוב.</p>}
      </div>
    </>
  );
}

// ---------- login ----------
export function LoginPage({ ctx }: { ctx: GuestCtx }) {
  const next = new URLSearchParams(location.search).get('next') || '/me';
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const demo = useDemo();
  useEffect(() => { if (ctx.profile) navigate(next, true); }, [ctx.profile]);
  const go = async () => {
    if (demo.on && demo.persona !== 'real') { setDemo({ persona: 'guest' }); navigate(next, true); return; }
    setBusy(true); setError('');
    try { await signIn(); } catch (e) { setError(authErrorMessage(e)); } finally { setBusy(false); }
  };
  const about = next.includes('/order') ? 'כדי שהכרטיסים יהיו שלכם ויישמרו בטלפון' : next === '/visit' ? 'כדי שנוכל לחזור אליכם על הביקור' : next === '/donate' ? 'כדי שנוכל לשלוח קבלה ולומר תודה' : 'כדי לראות את הכרטיסים, הביקורים והתרומות שלכם';
  return (
    <>
      <Top back title={next.includes('/order') ? 'רגע לפני הכרטיסים' : 'כניסה'} />
      <p className="lead ink" style={{ fontSize: 17 }}>{about}, נכנסים פעם אחת עם חשבון Google. לא נשאל שוב.</p>
      <div className="actions" style={{ paddingTop: 28 }}>
        <Btn kind="google" size="big" disabled={busy} onClick={go}><GoogleG />המשך עם Google</Btn>
        {error && <p className="lead" style={{ padding: 0, color: 'var(--rust)' }}>{error}</p>}
        <p className="lead" style={{ padding: 0, fontSize: 14 }}>אחרי Google נבקש שם בעברית וטלפון, וזהו. <A to="/terms" style={{ textDecoration: 'underline' }}>תנאי שימוש ופרטיות</A></p>
      </div>
    </>
  );
}
const GoogleG = () => <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.3 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.8-4.1-13.7-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>;

// ---------- onboarding (name + phone once) ----------
export function OnboardingPage({ user }: { user: { uid: string; email: string; displayName: string } }) {
  const [name, setName] = useState(user.displayName || '');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const ok = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9;
  return (
    <div className="app"><div className="screen" style={{ paddingBottom: 20 }}>
      <Top title="נעים להכיר" sub="פעם אחת בלבד. השם יופיע ליד הכרטיסים והפעולות שלכם, והטלפון כדי שנוכל לחזור אליכם." />
      <Field label="השם שלך בעברית"><Input big autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="טלפון"><Input big dir="ltr" inputMode="tel" placeholder="050-000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <p className="note">בלחיצה על "סיום" אני מאשר/ת את <A to="/terms" style={{ textDecoration: 'underline' }}>תנאי השימוש</A> ומסכים/ה לקבל עדכונים מהחווה. אפשר להפסיק בכל רגע.</p>
      <div className="actions"><Btn size="big" disabled={!ok || busy} onClick={async () => { setBusy(true); setError(''); try { await createProfile(user, { displayName: name, phone }); } catch (e) { setError(authErrorMessage(e)); } finally { setBusy(false); } }}>סיום</Btn>{error && <p className="lead" style={{ padding: 0, color: 'var(--rust)' }}>{error}</p>}<p className="lead" style={{ padding: 0, fontSize: 14 }}>נכנסים עם {user.email} · <button type="button" className="lnk" style={{ textDecoration: 'underline' }} onClick={() => import('../firebase').then((m) => m.signOutUser())}>לא אני</button></p></div>
    </div></div>
  );
}
export function BlockedPage({ profile }: { profile: Profile }) {
  return (
    <div className="app"><div className="screen" style={{ paddingBottom: 20 }}>
      <Top title="החשבון הושעה" />
      <p className="lead ink" style={{ fontSize: 17 }}>שלום {firstName(profile.displayName)}. החשבון הזה חסום כרגע להזמנת כרטיסים. אם זו טעות, דברו איתנו ונסדר.</p>
      <div className="actions" style={{ paddingTop: 24 }}><a className="btn ghost" href={waLink('0500000000', 'שלום, החשבון שלי באפליקציה של חוות רווה חסום. אפשר לבדוק?')}><Icon name="whatsapp" size={20} />וואטסאפ לחווה</a><p className="lead" style={{ padding: 0, fontSize: 14 }}>האתר, האירועים ותיאום ביקור עדיין פתוחים לצפייה.</p><SignOut /></div>
    </div></div>
  );
}

// ---------- my tickets ----------
function Qr({ text, size }: { text: string; size: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#1d2920', light: '#ffffff' } }).then(setSrc).catch(() => setSrc('')); }, [text, size]);
  return src ? <img className="qr" src={src} alt="ברקוד הכרטיס" style={{ width: size, height: size }} /> : <div className="qr" style={{ width: size, height: size }} />;
}
export function MyTicketsPage({ ctx }: { ctx: GuestCtx }) {
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid);
  const visits = useMyVisits(uid, !!uid);
  const donations = useMyDonations(uid, !!uid);
  const tabs = useMyTabs(uid, !!uid);
  const toast = useToast();
  const [idx, setIdx] = useState<Record<string, number>>({});
  if (!ctx.profile) return <><Top title="הכרטיסים שלי" sub="נשמרים בטלפון ועובדים בלי קליטה" /><Empty title="עוד לא נכנסתם" text="הכרטיסים, הביקורים והתרומות שלכם מחכים אחרי כניסה עם Google." action={<Btn to="/login?next=/me">כניסה</Btn>} /></>;
  const orders = useMemo(() => { const m = new Map<string, Ticket[]>(); for (const t of tickets.items) m.set(t.orderId, [...(m.get(t.orderId) || []), t]); return [...m.values()].map((o) => o.sort((a, b) => a.index - b.index)).sort((a, b) => a[0].eventId === b[0].eventId ? 0 : b[0].createdAt.localeCompare(a[0].createdAt)); }, [tickets.items]);
  const upcomingOrders = orders.filter((o) => o[0].status === 'valid' || o.some((t) => t.status === 'valid'));
  return (
    <>
      <Top title="הכרטיסים שלי" sub={`${ctx.profile.displayName} · נשמרים בטלפון ועובדים בלי קליטה`} />
      {tickets.loading && !orders.length && <Loading />}
      {!tickets.loading && !orders.length && <Empty title="אין כרטיסים עדיין" text="כשתזמינו כרטיסים לאירוע הם יופיעו כאן, עם ברקוד לכל אחד." action={<Btn kind="ghost" to="/">לאירועים</Btn>} />}
      {upcomingOrders.map((o) => {
        const first = o[0]; const valid = o.filter((t) => t.status === 'valid'); const i = Math.min(idx[first.orderId] || 0, Math.max(0, valid.length - 1)); const t = valid[i] || first;
        const pending = first.paymentStatus === 'pending', claimed = first.paymentStatus === 'claimed';
        return (
          <div key={first.orderId} className={'ticket ' + (t.status === 'cancelled' ? 'cancelled' : '')}>
            <div className="head"><div className="ev">{first.eventTitle}</div><div className="when">{valid.length} {valid.length === 1 ? 'כרטיס' : 'כרטיסים'} · הוזמן {relTime(first.createdAt)}</div></div>
            <div className="body">
              {valid.length > 1 && <div className="idx">{i + 1} / {valid.length}</div>}
              <Qr text={qrPayload(t)} size={220} />
              <div className="who">{t.holderName || t.ownerName}</div>
              <div className="idx">כרטיס {t.index} מתוך {t.total}{t.entries > 0 ? ` · נכנס ${t.entries}` : ''}</div>
              {valid.length > 1 && <div className="dots">{valid.map((_, k) => <i key={k} className={k === i ? 'on' : ''} onClick={() => setIdx({ ...idx, [first.orderId]: k })} />)}</div>}
              {valid.length > 1 && <div className="inline"><Btn kind="quiet" size="sm" disabled={i === 0} onClick={() => setIdx({ ...idx, [first.orderId]: i - 1 })}>הקודם</Btn><Btn kind="quiet" size="sm" disabled={i >= valid.length - 1} onClick={() => setIdx({ ...idx, [first.orderId]: i + 1 })}>הבא</Btn></div>}
            </div>
            <div className={'band ' + (pending ? 'ochre' : claimed ? 'ochre' : first.status === 'cancelled' ? 'rust' : '')}>
              <span>{first.status === 'cancelled' ? 'ההזמנה בוטלה' : pending ? `ממתין לתשלום · ${money(first.price * valid.length)} על ${valid.length} כרטיסים` : claimed ? 'העברתם · ממתין לאישור המנהלים' : PAYMENT_LABELS[first.paymentStatus]}</span>
              {pending && <Btn size="sm" onClick={() => claimOrderPaid(valid).then(() => toast({ text: 'תודה! המנהלים יאשרו את ההעברה.' }, 3000))}>העברתי</Btn>}
            </div>
            {pending && <p className="lead" style={{ padding: '10px 18px 12px', fontSize: 14 }}><PaymentLine ctx={ctx} /></p>}
            <div className="inline" style={{ padding: '6px 14px 12px' }}>
              <Btn kind="quiet" size="sm" icon="share" onClick={() => navigator.share?.({ title: first.eventTitle, text: `הכרטיס של ${t.holderName || t.ownerName} ל${first.eventTitle} (${t.index}/${t.total}). קוד: ${qrPayload(t)}` }).catch(() => {})}>שיתוף כרטיס {t.index}{t.holderName ? ` ל${firstName(t.holderName)}` : ''}</Btn>
              <Btn kind="quiet" size="sm" icon="calendar" to={`/events/${first.eventId}`}>לאירוע</Btn>
            </div>
          </div>
        );
      })}
      {(visits.items.length > 0 || donations.items.length > 0 || tabs.items.length > 0) && <>
        <Sec title="עוד אצלי" />
        <div className="list">
          {visits.items.map((v) => <Row key={v.id} center title={`ביקור · ${fmtWeekday(v.date)} ${fmtDateShort(v.date)} · ${v.people} אנשים`} meta={<><Pill tone={v.status === 'approved' ? 'ok' : v.status === 'new' ? 'ochre' : undefined}>{v.status === 'new' ? 'התקבל, נחזור אליכם' : VISIT_LABELS[v.status]}</Pill>{v.managerNote && v.status === 'approved' && <span>{v.managerNote}</span>}</>} end={v.status === 'new' ? <Btn kind="quiet" size="sm" onClick={() => cancelVisit(v)}>ביטול</Btn> : undefined} />)}
          {donations.items.map((d) => <Row key={d.id} center title={`תרומה · ${money(d.amount)} · ${d.label}`} meta={<><Pill tone={d.paymentStatus === 'paid' ? 'ok' : 'ochre'}>{PAYMENT_LABELS[d.paymentStatus]}</Pill>{d.memorial && <span>לזכר {d.memorial}</span>}{d.receiptWanted && <span>{d.receiptSent ? 'קבלה נשלחה' : `קבלה: ${d.receiptName}`}</span>}</>} end={d.paymentStatus === 'pending' ? <Btn size="sm" kind="ghost" onClick={() => claimDonationPaid(d)}>העברתי</Btn> : undefined} />)}
          {tabs.items.map((t) => <Row key={t.id} center title={`החשבון שלי בדוכן · ${t.eventTitle}`} meta={<><span className="money">{money(t.total)}</span><Pill tone={t.status === 'paid' ? 'ok' : t.status === 'open' ? 'ochre' : undefined}>{TAB_LABELS[t.status]}</Pill></>} end={t.status === 'open' ? <Btn size="sm" kind="ghost" onClick={() => claimTabPaid(t)}>העברתי</Btn> : undefined} />)}
        </div>
      </>}
    </>
  );
}

// ---------- visit request ----------
export function VisitPage({ ctx }: { ctx: GuestCtx }) {
  const today = todayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [date, setDate] = useState('');
  const [people, setPeople] = useState(4);
  const [type, setType] = useState(ctx.settings.visitTypes[0] || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const first = new Date(month + '-01T12:00:00'); const startPad = first.getDay(); const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const shift = (n: number) => { const d = new Date(month + '-01T12:00:00'); d.setMonth(d.getMonth() + n); setMonth(dateKey(d).slice(0, 7)); };
  const send = async () => {
    if (needLogin(ctx, '/visit')) return;
    setBusy(true);
    try { await createVisit(ctx.profile!, { date, people, type, note: note.trim() }); setSent(true); } catch (e) { toast({ text: authErrorMessage(e), kind: 'error' }); } finally { setBusy(false); }
  };
  if (sent) return <><Top backTo="/" backLabel="בית" title="קיבלנו, נחזור אליכם" /><p className="lead ink" style={{ fontSize: 17 }}>הבקשה ל{fmtDayLong(date)}, {people} אנשים, הגיעה למנהלים. נתקשר לסגור שעה ופרטים. אפשר לעקוב אחרי המצב ב"החשבון שלי".</p><div className="actions"><Btn to="/me/account">לחשבון שלי</Btn><Btn kind="ghost" to="/">לדף הבית</Btn></div></>;
  return (
    <>
      <Top backTo="/" backLabel="בית" title="תיאום ביקור" sub="ממלאים כמה פרטים, ואנחנו מתקשרים לסגור שעה ופרטים." />
      <Field label="מתי תרצו לבוא?">
        <div className="inline" style={{ justifyContent: 'space-between' }}><Btn kind="quiet" size="sm" onClick={() => shift(-1)} disabled={month <= today.slice(0, 7)}><Icon name="back" size={18} />הקודם</Btn><b>{fmtMonthYear(month + '-01')}</b><Btn kind="quiet" size="sm" onClick={() => shift(1)}>הבא<Icon name="chev" size={18} /></Btn></div>
        <div className="cal" style={{ padding: '8px 0 0' }}>{['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => <div key={d} className="wd">{d}</div>)}{Array.from({ length: startPad }, (_, i) => <span key={'p' + i} />)}{Array.from({ length: days }, (_, i) => { const k = `${month}-${String(i + 1).padStart(2, '0')}`; const off = k < today; return <button type="button" key={k} disabled={off} className={(off ? 'off ' : '') + (k === today ? 'today ' : '') + (k === date ? 'on' : '')} onClick={() => setDate(k)}>{i + 1}</button>; })}</div>
        {date && <span className="hint">נבחר: {fmtDayLong(date)}</span>}
      </Field>
      <Field label="כמה אנשים?"><Stepper value={people} onChange={setPeople} min={1} max={200} /></Field>
      <Field label="סוג הביקור"><div className="chips">{ctx.settings.visitTypes.map((t) => <Chip key={t} on={type === t} onClick={() => setType(t)}>{t}</Chip>)}</div></Field>
      <Field label="כמה מילים (לא חובה)"><Textarea rows={3} placeholder="סבא וסבתא עם הנכדים, מעדיפים בוקר." value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="actions sticky"><Btn size="big" disabled={!date || !type || busy} onClick={send}>שליחת הבקשה</Btn><p className="lead" style={{ padding: 0, fontSize: 14 }}>אחרי השליחה: "קיבלנו, נחזור אליכם", והבקשה מופיעה בחשבון שלכם עם המצב.</p></div>
    </>
  );
}

// ---------- donation ----------
export function DonatePage({ ctx }: { ctx: GuestCtx }) {
  const presets = ctx.settings.donationPresets;
  const [amount, setAmount] = useState(presets[1]?.amount || presets[0]?.amount || 0);
  const [other, setOther] = useState('');
  const [memorial, setMemorial] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState(false);
  const [receiptName, setReceiptName] = useState(ctx.profile?.displayName || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const toast = useToast();
  const value = other ? Number(other) || 0 : amount;
  const label = other ? 'סכום חופשי' : presets.find((p) => p.amount === amount)?.label || 'סכום חופשי';
  const donations = useMyDonations(ctx.profile?.uid || '', !!done);
  const mine = donations.items.find((d) => d.id === done);
  const give = async () => {
    if (needLogin(ctx, '/donate')) return;
    setBusy(true);
    try { const id = await createDonation(ctx.profile!, { amount: value, label, note: note.trim(), memorial: memorial.trim(), receiptWanted: receipt, receiptName: receipt ? receiptName.trim() : '' }); setDone(id); } catch (e) { toast({ text: authErrorMessage(e), kind: 'error' }); } finally { setBusy(false); }
  };
  if (done) return (
    <>
      <Top backTo="/" backLabel="בית" title="תודה!" />
      <div className="paybox" style={{ marginTop: 10 }}><b>{money(value)}</b>{label}{memorial ? ` · לזכר ${memorial}` : ''}</div>
      <p className="lead ink" style={{ paddingTop: 14, fontSize: 17 }}>עכשיו מעבירים: <PaymentLine ctx={ctx} /></p>
      <p className="lead">אחרי ההעברה לוחצים "העברתי". המנהלים יאשרו{receipt ? ' וישלחו קבלה ידנית מהעמותה' : ''}.</p>
      <div className="actions">{mine && mine.paymentStatus !== 'pending' ? <Pill tone="ok">סומן: הועבר, ממתין לאישור</Pill> : <Btn size="big" onClick={() => mine && claimDonationPaid(mine).then(() => toast({ text: 'תודה! המנהלים יאשרו את ההעברה.' }, 3000))}>העברתי</Btn>}<Btn kind="ghost" to="/me/account">לחשבון שלי</Btn></div>
    </>
  );
  return (
    <>
      <Top backTo="/" backLabel="בית" title="תרומה לחווה" sub="כל תרומה הולכת ישירות לעבודה בשטח: עצים, מים, בעלי חיים." />
      <Field label="סכום"><div className="chips">{presets.map((p) => <Chip key={p.amount} on={!other && amount === p.amount} onClick={() => { setAmount(p.amount); setOther(''); }}><b>{money(p.amount)}</b> {p.label}</Chip>)}<Chip on={!!other} onClick={() => setOther(other || String(amount))}>סכום אחר</Chip></div>{other !== '' && <Input dir="ltr" inputMode="numeric" style={{ marginTop: 10 }} value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, ''))} placeholder="₪" />}</Field>
      <Field label="הנצחה (לא חובה)"><Input placeholder="לזכר…" value={memorial} onChange={(e) => setMemorial(e.target.value)} /></Field>
      <Field label="כמה מילים למנהלים (לא חובה)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div style={{ marginTop: 14 }}><SwitchRow on={receipt} onChange={setReceipt} title="אני צריך/ה קבלה" meta="הקבלה מהעמותה, נשלחת ידנית" /></div>
      {receipt && <Field label="שם מלא לקבלה"><Input value={receiptName} onChange={(e) => setReceiptName(e.target.value)} /></Field>}
      <div className="paybox ok" style={{ marginTop: 22 }}><b>{money(value)}</b><PaymentLine ctx={ctx} /></div>
      <div className="actions sticky"><Btn size="big" disabled={value < 1 || busy || (receipt && !receiptName.trim())} onClick={give}>לתרום {money(value)}</Btn></div>
    </>
  );
}

// ---------- guest account ----------
export function GuestAccountPage({ ctx }: { ctx: GuestCtx }) {
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid); const visits = useMyVisits(uid, !!uid); const donations = useMyDonations(uid, !!uid); const tabs = useMyTabs(uid, !!uid);
  if (!ctx.profile) return <><Top title="החשבון שלי" /><Empty title="עוד לא נכנסתם" text="נכנסים פעם אחת עם Google, וזה נשמר בטלפון." action={<Btn to="/login?next=/me/account">כניסה</Btn>} /><div className="links" style={{ marginTop: 20 }}><A to="/terms"><Icon name="info" />תנאי שימוש ופרטיות<Icon name="chev" className="chev" size={18} /></A></div><DemoSection /></>;
  const p = ctx.profile;
  const missing = ctx.settings.registrationFields.filter((f) => !(p.fields?.[f.id] || '').trim());
  const orders = [...new Map(tickets.items.map((t) => [t.orderId, t])).values()];
  return (
    <>
      <Top title="החשבון שלי" sub={`${p.displayName} · ${p.email}`} end={<Avatar name={p.displayName} />} />
      {donations.items.some((d) => d.paymentStatus === 'claimed') && <div className="strip ok" style={{ alignItems: 'flex-start' }}><Icon name="heart" size={18} /><span>תודה על תרומתך! המנהלים יאשרו את ההעברה{donations.items.find((d) => d.paymentStatus === 'claimed')?.receiptWanted ? ' וישלחו קבלה' : ''}.</span></div>}
      {missing.length > 0 && <div className="strip"><Icon name="user" size={18} /><span>רוצים להשלים כמה פרטים? {missing.map((m) => m.label).join(', ')}. לוקח רגע, אפשר אחר כך.</span></div>}
      <Sec title="הפעילות שלי" />
      <div className="list">
        {orders.map((t) => <Row key={t.orderId} center to="/me" title={`כרטיסים · ${t.eventTitle}`} meta={<><span>{tickets.items.filter((x) => x.orderId === t.orderId && x.status === 'valid').length} כרטיסים</span><Pill tone={t.paymentStatus === 'paid' || t.paymentStatus === 'free' || t.paymentStatus === 'paid_onsite' ? 'ok' : t.status === 'cancelled' ? 'rust' : 'ochre'}>{t.status === 'cancelled' ? 'בוטל' : PAYMENT_LABELS[t.paymentStatus]}</Pill></>} chev />)}
        {visits.items.map((v) => <Row key={v.id} center title={`ביקור · ${fmtWeekday(v.date)} ${fmtDateShort(v.date)} · ${v.people} אנשים`} meta={<Pill tone={v.status === 'approved' ? 'ok' : v.status === 'new' ? 'ochre' : undefined}>{v.status === 'new' ? 'התקבל, נחזור אליכם' : VISIT_LABELS[v.status]}</Pill>} />)}
        {donations.items.map((d) => <Row key={d.id} center title={`תרומה · ${money(d.amount)}${d.memorial ? ` · לזכר ${d.memorial}` : ''}`} meta={<><Pill tone={d.paymentStatus === 'paid' ? 'ok' : 'ochre'}>{PAYMENT_LABELS[d.paymentStatus]}</Pill>{d.receiptWanted && <span>קבלה: {d.receiptName}{d.receiptSent ? ' · נשלחה' : ''}</span>}</>} />)}
        {tabs.items.map((t) => <Row key={t.id} center title={`החשבון שלי בדוכן · ${t.eventTitle}`} meta={<><span className="money">{money(t.total)}</span><Pill tone={t.status === 'paid' ? 'ok' : t.status === 'open' ? 'ochre' : undefined}>{TAB_LABELS[t.status]}</Pill></>} />)}
        {!orders.length && !visits.items.length && !donations.items.length && !tabs.items.length && <p className="lead">עוד אין פעילות. <A to="/" style={{ textDecoration: 'underline' }}>לאירועים</A></p>}
      </div>
      <ProfileSection profile={p} fields={ctx.settings.registrationFields} />
      <NotificationsSection team={false} />
      <Sec title="עוד" />
      <div className="links"><InstallHint /><A to="/terms"><Icon name="info" />תנאי שימוש ופרטיות<Icon name="chev" className="chev" size={18} /></A><a href="/"><Icon name="globe" />האתר של החווה<Icon name="chev" className="chev" size={18} /></a></div>
      <DemoSection />
      <SignOut />
    </>
  );
}

// ---------- terms ----------
export function TermsPage() {
  return (
    <>
      <Top back title="תנאי שימוש ופרטיות" sub="טיוטה · נובמבר 2026 · טרם עברה בדיקה משפטית" />
      {[
        ['מה האפליקציה', 'האפליקציה של חוות רווה משמשת את צוות החווה, מתנדבים ואורחים לניהול משימות, קניות, אירועים, ביקורים ותרומות.'],
        ['הרשמה ופרטים', 'ההרשמה נעשית באמצעות חשבון Google. אנחנו שומרים את השם שכתבתם, מספר הטלפון וכתובת המייל, ובהמשך פרטים נוספים שתבחרו למסור.'],
        ['למה משמש המידע', 'תפעול שוטף: כרטיסים שהזמנתם, ביקורים שתיאמתם, תרומות, ולצוות: משימות ופריטים לצד שמכם. יצירת קשר אתכם בנוגע לפעילותכם בחווה. עדכונים על אירועים בהתראות, במייל, בוואטסאפ או ב־SMS. אפשר להפסיק בכל עת דרך "החשבון שלי".'],
        ['מי רואה מה', 'חברי צוות רואים את שמות חברי הצוות האחרים ליד משימות. מנהלי החווה רואים את פרטי הקשר של הנרשמים. המידע אינו נמכר ואינו מועבר לגורמים חיצוניים, למעט ספקי התשתית (Google Firebase) וספקי תשלום כשיופעלו.'],
        ['הסרה', 'אפשר לבקש מהמנהלים למחוק את החשבון והפרטים בכל עת.'],
      ].map(([h, t]) => <div key={h}><Sec title={h} /><p className="lead ink">{t}</p></div>)}
    </>
  );
}

