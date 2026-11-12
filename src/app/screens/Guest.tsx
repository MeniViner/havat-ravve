// Guest side: events, tickets, visits, donations. Everything is visible before signing in; Google only when it is really needed,
// and whatever was typed before the sign-in is still there after it.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { FarmEvent, Ticket, Profile, Settings, Visit, Donation, Tab } from '../types';
import { PAYMENT_LABELS, VISIT_LABELS, TAB_LABELS } from '../types';
import type { GuestCtx } from '../ctx';
import { A, Icon, useToast, fmtDateShort, fmtWeekday, fmtDayLong, fmtRange, fmtDate, firstName, money, todayISO, addDays, relTime, inText } from '../ui';
import { Head, Sect, Btn, Form, Field, Seg, Tick, Empty, useSticky, deferDelete, isHidden, useHiddenVersion } from '../kit';
import { navigate } from '../router';
import { useUpcomingEvents, useEvent, useMyTickets, orderTickets, qrPayload, claimOrderPaid, cancelOwnOrder, useMyVisits, createVisit, cancelVisit, useMyDonations, createDonation, claimDonationPaid, useMyTabs, claimTabPaid } from '../data';
import { signIn, signOutUser, authErrorMessage, inAppBrowser } from '../firebase';
import { createProfile } from '../store';
import { useDemo, setDemo } from '../demo/store';
import { ProfileSection, InstallHint, SignOut, DemoSection } from './More';

// ---------- small shared pieces ----------
const tix = (n: number) => (n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`);
const ppl = (n: number) => (n === 1 ? 'אדם אחד' : `${n} אנשים`);
const loginThen = (next: string) => navigate('/login?next=' + encodeURIComponent(next));
const isPaid = (s: string) => s === 'paid' || s === 'paid_onsite' || s === 'free';
const whenLine = (e: FarmEvent) => `${fmtWeekday(e.start)} ${fmtDate(e.start)} · ${fmtRange(e.start, e.end)}`;

/** A number with a minus and a plus. A group of buttons, never inside a label. */
function Stepper({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  const id = useId();
  return (
    <div className="r-field">
      <span className="g-steplabel" id={id}>{label}</span>
      <div className="g-stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label="פחות" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Icon name="minus" /></button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label="עוד" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Icon name="plus" /></button>
      </div>
    </div>
  );
}

/** How to pay, from what the managers really configured. Nothing configured means cash at the gate, and it says so. */
export function PayHow({ settings, what }: { settings: Settings; what: string }) {
  const p = settings.payment; const toast = useToast();
  const copy = (v: string) => (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast({ text: 'המספר הועתק' }, 2000)).catch(() => {});
  const link = /^https:\/\//i.test(p.paybox) ? p.paybox : '';
  if (!p.bit && !p.paybox) return <p className="g-payhow">{p.cash ? 'משלמים במזומן בשער.' : 'פרטי התשלום יימסרו על ידי החווה.'}{p.note ? ' ' + p.note : ''}</p>;
  return (
    <div className="g-payhow">
      <p>כך מעבירים. בהעברה כותבים: {what}.</p>
      <ul>
        {p.bit && <li><span>ביט, למספר</span><b dir="ltr">{p.bit}</b><button type="button" onClick={() => copy(p.bit)}>להעתיק</button></li>}
        {p.paybox && <li><span>PayBox</span>{link ? <a href={link} target="_blank" rel="noopener">לפתוח את הקבוצה</a> : <b dir="ltr">{p.paybox}</b>}</li>}
        {p.cash && <li><span>או במזומן, בשער</span></li>}
      </ul>
      {p.note && <p>{p.note}</p>}
    </div>
  );
}

function Qr({ text, size }: { text: string; size: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let on = true; QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#17201a', light: '#ffffff' } }).then((s) => on && setSrc(s)).catch(() => on && setSrc('')); return () => { on = false; }; }, [text, size]);
  return src ? <img className="g-qr" src={src} alt="ברקוד הכרטיס" width={size} height={size} /> : <div className="g-qr" style={{ width: size, height: size }} />;
}
/** The ticket as a picture: the code, whose it is, and for what. This is what the other person shows at the gate. */
async function ticketImage(t: Ticket, when: string): Promise<File | null> {
  try {
    const qr = await QRCode.toDataURL(qrPayload(t), { margin: 1, width: 760, color: { dark: '#17201a', light: '#ffffff' } });
    const img = new Image(); img.src = qr; await img.decode();
    const c = document.createElement('canvas'); c.width = 900; c.height = 1180;
    const x = c.getContext('2d')!; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    x.direction = 'rtl'; x.textAlign = 'center'; x.fillStyle = '#17201a';
    x.font = '700 54px "Frank Ruhl Libre", serif'; x.fillText(t.eventTitle, 450, 96, 820);
    x.font = '500 32px Heebo, Arial, sans-serif'; x.fillText(when, 450, 150, 820);
    x.drawImage(img, 70, 190, 760, 760);
    x.font = '700 46px Heebo, Arial, sans-serif'; x.fillText(t.holderName || t.ownerName, 450, 1030, 820);
    x.font = '500 30px Heebo, Arial, sans-serif'; x.fillText(`כרטיס ${t.index} מתוך ${t.total} · חוות רווה`, 450, 1090, 820);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    return blob ? new File([blob], `כרטיס-${t.index}.png`, { type: 'image/png' }) : null;
  } catch { return null; }
}

// ---------- home ----------
export function GuestHome({ ctx }: { ctx: GuestCtx }) {
  const { items: events, loading } = useUpcomingEvents();
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid);
  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.end >= now);
  const mine = (e: FarmEvent) => tickets.items.filter((t) => t.eventId === e.id && t.status === 'valid');
  const mineNext = upcoming.find((e) => mine(e).length > 0);
  return (
    <>
      <div className="g-hero"><img src="/assets/rava-sunset.webp" alt="" /><div><span>ליד טנא עומרים</span><h1>חוות רווה</h1></div></div>
      {mineNext && (
        <A className="g-you" to="/me">
          <span>{ctx.profile ? firstName(ctx.profile.displayName) + ', ' : ''}יש לך {tix(mine(mineNext).length)}</span>
          <b>{mineNext.title}</b>
          <span>{whenLine(mineNext)} · {inText(mineNext.start)}{mine(mineNext).some((t) => t.paymentStatus === 'pending') ? ' · עוד לא שולם' : ''}</span>
          <em>להציג את הכרטיסים</em>
        </A>
      )}
      {!mineNext && <p className="g-intro">{ctx.settings.guestIntro}</p>}
      <Sect title="אירועים קרובים" />
      {loading && !upcoming.length ? <div className="r-empty">טוען…</div>
        : !upcoming.length ? <Empty title="אין אירועים פתוחים כרגע">כשיתפרסם אירוע הוא יופיע כאן.</Empty>
          : upcoming.map((e) => {
            const have = mine(e).length;
            return (
              <A key={e.id} to={`/events/${e.id}`} className="g-evrow">
                <div className="r-day">{new Date(e.start).getDate()}<small>{fmtDateShort(e.start).replace(/^\d+\s*/, '')}</small></div>
                <div>
                  <b>{e.title}</b>
                  <span>{fmtWeekday(e.start)} · {fmtRange(e.start, e.end)}</span>
                  <span className="g-price">{have ? `יש לך ${tix(have)}` : !e.open ? 'ההרשמה עוד לא נפתחה' : e.price ? `${money(e.price)} לכרטיס` : 'כניסה חופשית, בהרשמה'}</span>
                </div>
                <Icon name="chev" />
              </A>
            );
          })}
      <div style={{ marginTop: 26 }}>
        <A className="r-linkrow" to="/visit"><div>לתאם ביקור <span>· קבוצות, סיורים, אירועים פרטיים</span></div><Icon name="chev" /></A>
        <A className="r-linkrow" to="/donate"><div>לתרום לחווה <span>· עצים, מים, בעלי חיים</span></div><Icon name="chev" /></A>
        <a className="r-linkrow" href="/"><div>האתר של החווה <span>· מי אנחנו, איך מגיעים</span></div><Icon name="chev" /></a>
      </div>
    </>
  );
}

// ---------- event page ----------
type Gate = { ok: boolean; text: string };
const gateOf = (e: FarmEvent): Gate => (e.end < new Date().toISOString() ? { ok: false, text: 'האירוע הסתיים' } : !e.open ? { ok: false, text: 'ההרשמה סגורה כרגע' } : { ok: true, text: '' });
export function EventPage({ id, ctx }: { id: string; ctx: GuestCtx }) {
  const { item: e, loading } = useEvent(id);
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid);
  const toast = useToast();
  if (loading) return <><Head backTo="/" backLabel="בית" title="" /><div className="r-empty">טוען…</div></>;
  if (!e || !e.published) return <><Head backTo="/" backLabel="בית" title="האירוע לא נמצא" /><Empty title="ייתכן שהוסר מהפרסום">אפשר לראות את האירועים הקרובים בדף הבית.</Empty><div className="r-actions"><Btn to="/">לדף הבית</Btn></div></>;
  const gate = gateOf(e); const have = tickets.items.filter((t) => t.eventId === e.id && t.status === 'valid').length;
  const share = () => {
    const data = { title: e.title, text: `${e.title} בחוות רווה · ${fmtDayLong(e.start)}`, url: location.href };
    if (navigator.share) { navigator.share(data).catch(() => {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(() => toast({ text: 'הקישור הועתק, אפשר להדביק ולשלוח' }, 3000)).catch(() => toast({ text: location.href }, 8000));
  };
  return (
    <>
      <Head backTo="/" backLabel="בית" title={e.title} over={fmtDayLong(e.start)} />
      {e.image && <img className="g-hero-img" src={e.image} alt="" />}
      {have > 0 && <A className="r-linkrow g-have" to="/me"><div>יש לך {tix(have)} לאירוע הזה <span>· להציג</span></div><Icon name="chev" /></A>}
      <dl className="r-facts">
        <div><dt>מתי</dt><dd>{fmtRange(e.start, e.end)}<small>{fmtDayLong(e.start)} · {inText(e.start)}</small></dd></div>
        <div><dt>איפה</dt><dd>{e.location || 'חוות רווה, ליד טנא עומרים'}</dd></div>
        <div><dt>מחיר</dt><dd>{e.price ? `${money(e.price)} לכרטיס` : 'כניסה חופשית'}<small>{e.price ? `עד ${e.maxPerOrder} כרטיסים בהזמנה` : `צריך להירשם · עד ${e.maxPerOrder} בהרשמה`}</small></dd></div>
      </dl>
      {e.description && <p className="r-note">{e.description}</p>}
      <p className="r-hint" style={{ paddingTop: 14 }}>כל כרטיס מקבל ברקוד משלו. הוא נשמר בטלפון ומוצג בשער גם בלי קליטה.</p>
      <div className="r-actions"><Btn kind="quiet" small onClick={() => downloadIcs(e)}>להוסיף ליומן</Btn><Btn kind="quiet" small onClick={share}>לשתף</Btn></div>
      <div className="r-dock">
        {gate.ok ? <Btn to={`/events/${e.id}/order`}>{have ? 'להזמין עוד כרטיסים' : e.price ? 'להזמין כרטיסים' : 'להירשם'}</Btn> : <p className="g-closed">{gate.text}</p>}
      </div>
    </>
  );
}
export function downloadIcs(e: FarmEvent) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Havat Ravve//HE', 'BEGIN:VEVENT', `UID:${e.id}@havat-ravve.web.app`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`, `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.location || 'חוות רווה')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `${e.title}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- order ----------
type OrderDraft = { count: number; holders: string[]; answers: Record<string, string> };
export function OrderPage({ id, ctx }: { id: string; ctx: GuestCtx }) {
  const { item: e, loading } = useEvent(id);
  // kept for the session: signing in on the way does not empty the form
  const [d, setD] = useSticky<OrderDraft>('order:' + id, { count: 1, holders: [], answers: {} });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toast = useToast();
  const back = `/events/${id}`;
  if (loading) return <><Head backTo={back} backLabel="לאירוע" title="" /><div className="r-empty">טוען…</div></>;
  if (!e || !e.published) return <><Head backTo="/" backLabel="בית" title="האירוע לא נמצא" /><Empty title="ייתכן שהוסר מהפרסום" /></>;
  const gate = gateOf(e);
  if (!gate.ok) return <><Head backTo={back} backLabel="לאירוע" title={gate.text} /><Empty title={e.title}>אי אפשר להזמין כרטיסים לאירוע הזה כרגע.</Empty><div className="r-actions"><Btn to="/">לאירועים אחרים</Btn></div></>;
  const count = Math.min(Math.max(1, d.count), e.maxPerOrder); const total = e.price * count;
  const submit = async () => {
    const missing = e.questions.filter((q) => q.required && !(d.answers[q.id] || '').trim());
    if (missing.length) { setErr(`חסרה תשובה: ${missing.map((q) => q.label).join(', ')}`); return; }
    if (!ctx.profile) { loginThen(`/events/${id}/order`); return; }
    setBusy(true); setErr('');
    try {
      await orderTickets(ctx.profile, e, count, [ctx.profile.displayName, ...d.holders.slice(0, count - 1)], d.answers);
      setD({ count: 1, holders: [], answers: {} });
      toast({ text: e.price ? `${tix(count)} נוצרו. נשאר לשלם ${money(total)}.` : 'נרשמתם. הכרטיסים בטלפון.' }, 5000);
      navigate('/me', true);
    } catch (x) { setErr(authErrorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <>
      <Head backTo={back} backLabel="לאירוע" title={e.price ? 'הזמנת כרטיסים' : 'הרשמה'} over={`${e.title} · ${whenLine(e)}`} />
      <Form onSubmit={submit}>
        <Stepper label="כמה כרטיסים?" value={count} onChange={(n) => { setD({ ...d, count: n }); setErr(''); }} min={1} max={e.maxPerOrder} />
        {count > 1 && <>
          <p className="g-help">על כל כרטיס אפשר לכתוב שם. לא חובה, אבל כך קל לשלוח לכל אחד את שלו.</p>
          {Array.from({ length: count - 1 }, (_, i) => (
            <Field key={i} label={`שם על כרטיס ${i + 2}`}>{(fid) => <input id={fid} className="r-input" value={d.holders[i] || ''} onChange={(ev) => { const h = [...d.holders]; h[i] = ev.target.value; setD({ ...d, holders: h }); }} maxLength={80} autoComplete="off" />}</Field>
          ))}
        </>}
        {e.questions.filter((q) => q.label.trim()).map((q) => (
          <Field key={q.id} label={q.label} help={q.required ? undefined : 'לא חובה'}>{(fid) => <input id={fid} className="r-input" value={d.answers[q.id] || ''} onChange={(ev) => { setD({ ...d, answers: { ...d.answers, [q.id]: ev.target.value } }); setErr(''); }} maxLength={300} />}</Field>
        ))}
        <div className="g-sum"><b>{e.price ? money(total) : 'בלי תשלום'}</b><span>{e.price ? (count === 1 ? 'כרטיס אחד' : `${count} כרטיסים, ${money(e.price)} כל אחד`) : tix(count)}</span></div>
        {e.price > 0 && <p className="g-help">הכרטיסים נוצרים מיד, במצב ״ממתין לתשלום״. את התשלום מעבירים אחר כך לפי ההסבר שיופיע ליד הכרטיס, או משלמים בשער.</p>}
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" disabled={busy}>{!ctx.profile ? 'המשך: כניסה עם Google' : e.price ? `להזמין · ${money(total)}` : 'להירשם'}</Btn>
        {!ctx.profile && <p className="g-help">נכנסים פעם אחת עם Google, ומה שמילאתם כאן נשמר.</p>}
      </Form>
    </>
  );
}

// ---------- login ----------
export function LoginPage({ ctx }: { ctx: GuestCtx }) {
  const asked = new URLSearchParams(location.search).get('next') || '';
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const demo = useDemo(); const toast = useToast();
  const webview = !demo.on && inAppBrowser();
  // a team member belongs on "today"; a guest goes back to what they were doing
  useEffect(() => { if (ctx.profile) navigate(ctx.profile.role !== 'guest' && (!asked || asked === '/me') ? '/' : asked || '/me', true); }, [ctx.profile]);
  const go = async () => {
    if (demo.on) { setDemo({ persona: 'guest' }); navigate(asked || '/me', true); return; }
    setBusy(true); setError('');
    try { await signIn(); } catch (e) { setError(authErrorMessage(e)); } finally { setBusy(false); }
  };
  const copy = () => {
    const url = location.origin + '/app' + (asked && asked !== '/me' ? asked : '');
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast({ text: 'הקישור הועתק' }, 2500)).catch(() => toast({ text: url }, 8000));
  };
  const why = asked.includes('/order') ? 'כדי שהכרטיסים יהיו שלכם ויישמרו בטלפון' : asked === '/visit' ? 'כדי שנוכל לחזור אליכם על הביקור' : asked === '/donate' ? 'כדי שנוכל לומר תודה ולשלוח קבלה' : 'כדי לראות את הכרטיסים, הביקורים והתרומות שלכם';
  return (
    <>
      <Head backTo={asked && asked !== '/me' && asked !== '/me/account' ? asked : '/'} title={asked.includes('/order') ? 'רגע לפני הכרטיסים' : 'כניסה'} />
      <p className="r-note" style={{ paddingTop: 0 }}>{why}, נכנסים פעם אחת עם חשבון Google. אחר כך לא נשאל שוב.</p>
      {webview ? (
        <div className="g-steps">
          <b>מכאן אי אפשר להיכנס</b>
          <p>הדף נפתח בתוך אפליקציה אחרת (וואטסאפ, אינסטגרם או פייסבוק), ו־Google לא מאפשר כניסה משם. מה שמילאתם נשמר.</p>
          <ol><li>לוחצים על שלוש הנקודות או על כפתור השיתוף למעלה.</li><li>בוחרים ״פתיחה בדפדפן״ (Chrome או Safari).</li><li>שם נכנסים עם Google.</li></ol>
          <Btn kind="ghost" onClick={copy}>או: להעתיק את הקישור</Btn>
        </div>
      ) : (
        <div className="r-form" style={{ paddingTop: 22 }}>
          <button type="button" className="r-btn ghost g-google" disabled={busy} onClick={go}><GoogleG />{busy ? 'פותח את Google…' : 'המשך עם Google'}</button>
          {error && <p className="r-err" role="alert">{error}</p>}
          <p className="g-help">אחרי Google נבקש שם בעברית וטלפון, וזהו. <A to="/terms" className="g-inlinelink">תנאי שימוש ופרטיות</A></p>
        </div>
      )}
    </>
  );
}
const GoogleG = () => <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.3 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.8-4.1-13.7-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>;

// ---------- onboarding (name + phone once) ----------
/** Shown for every route while the profile is missing, so it carries its own frame and the terms open in place. */
export function OnboardingPage({ user }: { user: { uid: string; email: string; displayName: string } }) {
  const [name, setName] = useState(user.displayName || '');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    if (name.trim().length < 2) { setErr('צריך לכתוב שם'); return; }
    if (phone.replace(/\D/g, '').length < 9) { setErr('צריך מספר טלפון מלא, כדי שנוכל לחזור אליכם'); return; }
    setBusy(true); setErr('');
    try { await createProfile(user, { displayName: name, phone }); } catch (e) { setErr(authErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="r-app"><div className="r-work"><main className="r-main bare narrow g-solo">
      <Head title="נעים להכיר" />
      <p className="r-note" style={{ paddingTop: 0 }}>פעם אחת בלבד. השם יופיע ליד הכרטיסים והפעולות שלכם, והטלפון כדי שנוכל לחזור אליכם.</p>
      <Form onSubmit={submit}>
        <Field label="השם שלך בעברית">{(id) => <input id={id} className="r-input big" autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} maxLength={80} autoComplete="name" />}</Field>
        <Field label="טלפון">{(id) => <input id={id} className="r-input big" dir="ltr" inputMode="tel" placeholder="050-000-0000" value={phone} onChange={(e) => { setPhone(e.target.value); setErr(''); }} maxLength={25} autoComplete="tel" />}</Field>
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" disabled={busy}>אישור וסיום</Btn>
        <p className="g-help">בלחיצה אני מאשר/ת את תנאי השימוש ומסכים/ה לקבל עדכונים מהחווה. אפשר להפסיק בכל רגע.</p>
        <details className="r-details g-terms"><summary>לקרוא את תנאי השימוש</summary><TermsText /></details>
        <p className="g-help">נכנסתם עם <span dir="ltr">{user.email}</span>. <button type="button" className="g-inlinelink" onClick={() => { void signOutUser(); }}>זה לא אני</button></p>
      </Form>
    </main></div></div>
  );
}
export function BlockedPage({ profile }: { profile: Profile }) {
  return (
    <div className="r-app"><div className="r-work"><main className="r-main bare narrow g-solo">
      <Head title="החשבון הושעה" />
      <p className="r-note" style={{ paddingTop: 0 }}>שלום {firstName(profile.displayName)}. מנהלי החווה השעו את החשבון הזה, ולכן האפליקציה סגורה בו כרגע. אם זו טעות, דברו איתנו ונסדר.</p>
      <div className="r-actions"><a className="r-btn ghost" href="/">ליצירת קשר, באתר החווה</a></div>
      <SignOut />
    </main></div></div>
  );
}

// ---------- my tickets ----------
type Order = { id: string; all: Ticket[]; valid: Ticket[]; first: Ticket; event?: FarmEvent };
function OrderCard({ o, ctx }: { o: Order; ctx: GuestCtx }) {
  const toast = useToast();
  const rail = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const { first, valid } = o; const t = valid[Math.min(i, valid.length - 1)] || first;
  const when = o.event ? whenLine(o.event) : '';
  const go = (k: number) => rail.current?.children[k]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  const onScroll = () => { const el = rail.current; if (el) setI(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth))); };
  const pending = first.paymentStatus === 'pending'; const claimed = first.paymentStatus === 'claimed';
  const due = first.price * valid.length; const used = valid.some((x) => x.entries > 0);
  const claim = async () => { setClaiming(true); try { await claimOrderPaid(valid); toast({ text: 'תודה. המנהלים יאשרו את ההעברה.' }, 4000); } catch (e) { toast({ text: authErrorMessage(e), kind: 'error' }); } finally { setClaiming(false); } };
  const share = async () => {
    const file = await ticketImage(t, when);
    const text = `הכרטיס של ${t.holderName || t.ownerName} ל${first.eventTitle}${when ? ' · ' + when : ''}. מציגים את הברקוד בשער.`;
    if (file && navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file], title: first.eventTitle, text }).catch(() => {}); return; }
    if (file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast({ text: 'הכרטיס נשמר כתמונה. אפשר לשלוח אותה.' }, 5000); return; }
    toast({ text: 'לא הצלחנו ליצור תמונה. אפשר לצלם את המסך ולשלוח.', kind: 'error' });
  };
  const cancel = () => {
    const undo = deferDelete('order:' + o.id, () => { cancelOwnOrder(valid).catch(() => {}); });
    toast({ text: `ההזמנה ל${first.eventTitle} מבוטלת`, actions: [{ label: 'להשאיר אותה', onClick: undo }] }, 6000);
  };
  return (
    <section className="g-ticket" aria-label={`כרטיסים ל${first.eventTitle}`}>
      <header><h2>{first.eventTitle}</h2>{o.event && <p>{when}</p>}{o.event && <p>{o.event.location || 'חוות רווה, ליד טנא עומרים'}</p>}</header>
      <div className="g-slides" ref={rail} onScroll={onScroll}>
        {valid.map((x) => (
          <div key={x.id} className="g-slide">
            <Qr text={qrPayload(x)} size={244} />
            <b>{x.holderName || x.ownerName}</b>
            <span>כרטיס {x.index} מתוך {x.total}{x.entries > 0 ? ` · נכנס/ה${x.entries > 1 ? ` ${x.entries} פעמים` : ''}` : ''}</span>
          </div>
        ))}
      </div>
      {valid.length > 1 && (
        <div className="g-pager">
          <button type="button" disabled={i === 0} onClick={() => go(i - 1)}>הקודם</button>
          <span aria-live="polite">{i + 1} מתוך {valid.length}</span>
          <button type="button" disabled={i >= valid.length - 1} onClick={() => go(i + 1)}>הבא</button>
        </div>
      )}
      <div className={'g-paystate' + (pending || claimed ? ' wait' : '')}>
        {pending ? `ממתין לתשלום · ${money(due)}${valid.length > 1 ? ` על ${valid.length} כרטיסים` : ''}` : claimed ? 'סימנתם שהעברתם. ממתין לאישור המנהלים.' : PAYMENT_LABELS[first.paymentStatus]}
      </div>
      {pending && <div className="g-paybody"><PayHow settings={ctx.settings} what={`${first.eventTitle}, ${first.ownerName}`} />{(ctx.settings.payment.bit || ctx.settings.payment.paybox) && <Btn block disabled={claiming} onClick={claim}>העברתי את התשלום</Btn>}</div>}
      <div className="g-ticketlinks">
        <button type="button" onClick={share}>לשלוח את הכרטיס{t.holderName && t.holderName !== first.ownerName ? ` ל${firstName(t.holderName)}` : ''}</button>
        <A to={`/events/${first.eventId}`}>לדף האירוע</A>
        {!used && <button type="button" className="danger" onClick={cancel}>לבטל את ההזמנה</button>}
      </div>
    </section>
  );
}
export function MyTicketsPage({ ctx }: { ctx: GuestCtx }) {
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid);
  const events = useUpcomingEvents();
  useHiddenVersion();
  const groups = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of tickets.items) m.set(t.orderId, [...(m.get(t.orderId) || []), t]);
    const now = new Date().toISOString();
    const orders: Order[] = [...m.entries()].map(([id, all]) => { all.sort((a, b) => a.index - b.index); return { id, all, valid: all.filter((t) => t.status === 'valid'), first: all[0], event: events.items.find((e) => e.id === all[0].eventId) }; });
    const live = orders.filter((o) => o.valid.length > 0);
    return {
      upcoming: live.filter((o) => o.event && o.event.end >= now).sort((a, b) => a.event!.start.localeCompare(b.event!.start)),
      past: live.filter((o) => !o.event || o.event.end < now).sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt)),
      cancelled: orders.filter((o) => o.valid.length === 0).sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt)),
    };
  }, [tickets.items, events.items]);
  if (!ctx.profile) return <><Head title="הכרטיסים שלי" /><Empty title="עוד לא נכנסתם">הכרטיסים שהזמנתם מחכים אחרי כניסה עם Google. הם נשמרים בטלפון ומוצגים גם בלי קליטה.</Empty><div className="r-actions"><Btn to="/login?next=/me">כניסה</Btn></div></>;
  const upcoming = groups.upcoming.filter((o) => !isHidden('order:' + o.id));
  const nothing = !tickets.loading && !tickets.items.length;
  return (
    <>
      <Head title="הכרטיסים שלי" over={ctx.profile.displayName} />
      {tickets.loading && !tickets.items.length && <div className="r-empty">טוען…</div>}
      {tickets.error && <div className="r-empty"><b>הכרטיסים לא נטענו</b>{tickets.error}</div>}
      {nothing && !tickets.error && <><Empty title="אין כרטיסים עדיין">כשתזמינו כרטיסים לאירוע הם יופיעו כאן, עם ברקוד לכל אחד.</Empty><div className="r-actions"><Btn to="/">לאירועים הקרובים</Btn></div></>}
      {!nothing && upcoming.length === 0 && !tickets.loading && <Empty title="אין כרטיסים לאירוע קרוב" />}
      {upcoming.map((o) => <OrderCard key={o.id} o={o} ctx={ctx} />)}
      {upcoming.length > 0 && <p className="r-hint" style={{ paddingTop: 16 }}>הכרטיסים נשמרים בטלפון. כדאי לפתוח את הדף הזה פעם אחת לפני שיוצאים, ובשער להגביר את בהירות המסך.</p>}
      {groups.cancelled.length > 0 && <><Sect title="הזמנות שבוטלו" n={groups.cancelled.length} />{groups.cancelled.map((o) => <div key={o.id} className="r-doneline"><s>{o.first.eventTitle} · {tix(o.all.length)}</s><span>בוטלה</span></div>)}</>}
      {groups.past.length > 0 && (
        <details className="g-past">
          <summary className="r-linkrow"><div>אירועים שעברו <span>· {groups.past.length}</span></div></summary>
          {groups.past.map((o) => <div key={o.id} className="r-doneline"><span style={{ flex: 1, color: 'var(--r-ink)', fontSize: 16 }}>{o.first.eventTitle} · {tix(o.valid.length)}</span><span>{o.event ? fmtDate(o.event.start) : relTime(o.first.createdAt)}{o.valid.some((t) => t.entries > 0) ? ' · הגעתם' : ''}</span></div>)}
        </details>
      )}
    </>
  );
}

// ---------- visit request ----------
type VisitDraft = { date: string; people: number; type: string; note: string };
export function VisitPage({ ctx }: { ctx: GuestCtx }) {
  const today = todayISO(); const types = ctx.settings.visitTypes.filter((t) => t.trim());
  const [d, setD] = useSticky<VisitDraft>('visit', { date: '', people: 4, type: types[0] || '', note: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sent, setSent] = useState<VisitDraft | null>(null);
  const weekday = new Date(today + 'T12:00:00').getDay();
  const fri = addDays(today, ((5 - weekday + 7) % 7) || 7); const sat = addDays(today, ((6 - weekday + 7) % 7) || 7);
  const picks = [{ k: fri, label: `שישי ${fmtDate(fri)}` }, { k: sat, label: `שבת ${fmtDate(sat)}` }, { k: addDays(today, 7), label: 'בעוד שבוע' }];
  const submit = async () => {
    if (!d.date) { setErr('צריך לבחור תאריך'); return; }
    if (d.date < today) { setErr('התאריך כבר עבר'); return; }
    if (!ctx.profile) { loginThen('/visit'); return; }
    setBusy(true); setErr('');
    try { await createVisit(ctx.profile, { date: d.date, people: d.people, type: d.type || types[0] || 'ביקור', note: d.note.trim() }); setSent(d); setD({ date: '', people: 4, type: types[0] || '', note: '' }); }
    catch (e) { setErr(authErrorMessage(e)); } finally { setBusy(false); }
  };
  if (sent) return (
    <>
      <Head backTo="/" backLabel="בית" title="קיבלנו" />
      <p className="r-note" style={{ paddingTop: 0 }}>הבקשה ל{fmtDayLong(sent.date)}, {ppl(sent.people)}, הגיעה למנהלי החווה. נתקשר לסגור שעה ופרטים.</p>
      <div className="r-actions"><Btn to="/me/account">לעקוב אחרי הבקשה</Btn><Btn kind="ghost" to="/">לדף הבית</Btn></div>
    </>
  );
  return (
    <>
      <Head backTo="/" backLabel="בית" title="תיאום ביקור" />
      <p className="r-note" style={{ paddingTop: 0 }}>ממלאים כמה פרטים, ואנחנו מתקשרים לסגור שעה.</p>
      <Form onSubmit={submit}>
        <Field label="מתי תרצו לבוא?" help={d.date ? fmtDayLong(d.date) : undefined}>{(id) => <input id={id} type="date" className="r-input" dir="ltr" min={today} value={d.date} onChange={(e) => { setD({ ...d, date: e.target.value }); setErr(''); }} />}</Field>
        <div className="g-picks" role="group" aria-label="תאריכים קרובים">{picks.map((p) => <button key={p.k + p.label} type="button" aria-pressed={d.date === p.k} onClick={() => { setD({ ...d, date: p.k }); setErr(''); }}>{p.label}</button>)}</div>
        <Stepper label="כמה אנשים?" value={d.people} onChange={(people) => setD({ ...d, people })} min={1} max={500} />
        {types.length > 1 && <Seg label="איזה ביקור?" value={d.type || types[0]} onChange={(type) => setD({ ...d, type })} options={types.map((t) => ({ value: t, label: t }))} />}
        <Field label="כמה מילים" help="לא חובה. גילאים, שעה מועדפת, משהו שכדאי שנדע">{(id) => <textarea id={id} className="r-input" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} maxLength={2000} />}</Field>
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" disabled={busy}>{ctx.profile ? 'לשלוח את הבקשה' : 'המשך: כניסה עם Google'}</Btn>
        {!ctx.profile && <p className="g-help">נכנסים פעם אחת עם Google, ומה שמילאתם כאן נשמר.</p>}
      </Form>
    </>
  );
}

// ---------- donation ----------
type GiveDraft = { pick: string; other: string; memorial: string; note: string; receipt: boolean; receiptName: string };
export function DonatePage({ ctx }: { ctx: GuestCtx }) {
  const presets = ctx.settings.donationPresets.filter((p) => p.amount > 0);
  const [d, setD] = useSticky<GiveDraft>('give', { pick: String((presets[1] || presets[0])?.amount || 'other'), other: '', memorial: '', note: '', receipt: false, receiptName: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [done, setDone] = useState<Donation | null>(null); const [claimed, setClaimed] = useState(false);
  const toast = useToast();
  const custom = d.pick === 'other' || !presets.some((p) => String(p.amount) === d.pick);
  const value = custom ? Number(d.other) || 0 : Number(d.pick);
  const label = custom ? 'סכום חופשי' : presets.find((p) => String(p.amount) === d.pick)?.label || 'סכום חופשי';
  const submit = async () => {
    if (value < 1) { setErr('צריך לבחור או לכתוב סכום'); return; }
    if (d.receipt && !(d.receiptName.trim() || ctx.profile?.displayName)) { setErr('צריך שם מלא לקבלה'); return; }
    if (!ctx.profile) { loginThen('/donate'); return; }
    const p = ctx.profile; setBusy(true); setErr('');
    const data = { amount: value, label, note: d.note.trim(), memorial: d.memorial.trim(), receiptWanted: d.receipt, receiptName: d.receipt ? d.receiptName.trim() || p.displayName : '' };
    try {
      const id = await createDonation(p, data);
      setDone({ id, uid: p.uid, name: p.displayName, phone: p.phone, ...data, receiptSent: false, paymentStatus: 'pending', createdAt: '', updatedAt: '' });
      setD({ pick: d.pick, other: '', memorial: '', note: '', receipt: false, receiptName: '' });
    } catch (e) { setErr(authErrorMessage(e)); } finally { setBusy(false); }
  };
  const claim = async () => { if (!done) return; try { await claimDonationPaid(done); setClaimed(true); toast({ text: 'תודה. המנהלים יאשרו את ההעברה.' }, 4000); } catch (e) { toast({ text: authErrorMessage(e), kind: 'error' }); } };
  const transfer = !!(ctx.settings.payment.bit || ctx.settings.payment.paybox);
  if (done) return (
    <>
      <Head backTo="/" backLabel="בית" title="תודה" />
      <div className="g-sum" style={{ margin: '0 20px' }}><b>{money(done.amount)}</b><span>{done.label}{done.memorial ? ` · לזכר ${done.memorial}` : ''}</span></div>
      <p className="r-note">התרומה נרשמה אצלנו. הכסף עצמו עובר בהעברה:</p>
      <div style={{ padding: '10px 20px 0' }}><PayHow settings={ctx.settings} what={`תרומה, ${done.name}`} /></div>
      <p className="r-hint" style={{ paddingTop: 12 }}>{done.receiptWanted ? `קבלה מהעמותה על שם ${done.receiptName} תישלח אחרי שההעברה תאושר.` : 'אחרי ההעברה המנהלים מאשרים שהתרומה התקבלה.'}</p>
      <div className="r-actions">
        {transfer && (claimed ? <p className="g-closed">סימנתם שהעברתם. תודה רבה.</p> : <Btn onClick={claim}>העברתי</Btn>)}
        <Btn kind="ghost" to="/me/account">לחשבון שלי</Btn>
      </div>
    </>
  );
  return (
    <>
      <Head backTo="/" backLabel="בית" title="תרומה לחווה" />
      <p className="r-note" style={{ paddingTop: 0 }}>כל תרומה הולכת ישר לעבודה בשטח: עצים, מים, בעלי חיים.</p>
      <Form onSubmit={submit}>
        <fieldset className="r-field">
          <legend>כמה?</legend>
          <div className="g-amounts">
            {presets.map((p) => <label key={p.amount}><input type="radio" name="amount" checked={!custom && d.pick === String(p.amount)} onChange={() => { setD({ ...d, pick: String(p.amount) }); setErr(''); }} /><b>{money(p.amount)}</b><span>{p.label}</span></label>)}
            <label><input type="radio" name="amount" checked={custom} onChange={() => { setD({ ...d, pick: 'other' }); setErr(''); }} /><b>סכום אחר</b><span>כמה שתרצו</span></label>
          </div>
        </fieldset>
        {custom && <Field label="הסכום, בשקלים">{(id) => <input id={id} className="r-input big" dir="ltr" inputMode="numeric" autoFocus value={d.other} onChange={(e) => { setD({ ...d, other: e.target.value.replace(/\D/g, '').slice(0, 7) }); setErr(''); }} placeholder="₪" />}</Field>}
        <Field label="הנצחה" help="לא חובה. לזכר מי, או לכבוד מי">{(id) => <input id={id} className="r-input" value={d.memorial} onChange={(e) => setD({ ...d, memorial: e.target.value })} maxLength={500} />}</Field>
        <Field label="כמה מילים למנהלים" help="לא חובה">{(id) => <textarea id={id} className="r-input" style={{ minHeight: 72 }} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} maxLength={2000} />}</Field>
        <Tick on={d.receipt} onChange={(receipt) => setD({ ...d, receipt, receiptName: d.receiptName || ctx.profile?.displayName || '' })} help="קבלה מהעמותה. המנהלים שולחים אותה אחרי שהתרומה מתקבלת">אני צריך/ה קבלה</Tick>
        {d.receipt && <Field label="שם מלא לקבלה">{(id) => <input id={id} className="r-input" value={d.receiptName} onChange={(e) => { setD({ ...d, receiptName: e.target.value }); setErr(''); }} maxLength={120} autoComplete="name" />}</Field>}
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" disabled={busy}>{!ctx.profile ? 'המשך: כניסה עם Google' : value ? `לתרום ${money(value)}` : 'לתרום'}</Btn>
        <p className="g-help">{transfer ? 'התרומה נרשמת כאן, ובמסך הבא מופיע איך מעבירים את הכסף (ביט או PayBox).' : 'התרומה נרשמת כאן, ומנהלי החווה יחזרו אליכם לגבי העברת הכסף.'}</p>
      </Form>
    </>
  );
}

// ---------- guest account: everything that is mine and is not a ticket ----------
function VisitLine({ v }: { v: Visit }) {
  const toast = useToast();
  const cancel = () => { const undo = deferDelete('visit:' + v.id, () => { cancelVisit(v).catch(() => {}); }); toast({ text: 'הבקשה לביקור מבוטלת', actions: [{ label: 'להשאיר אותה', onClick: undo }] }, 6000); };
  const state = v.status === 'new' ? 'התקבלה, נחזור אליכם' : v.status === 'approved' ? 'מאושר' : VISIT_LABELS[v.status];
  return (
    <div className="g-mineline">
      <div><b>{fmtWeekday(v.date)} {fmtDate(v.date)} · {ppl(v.people)}</b><span className={v.status === 'approved' ? 'ok' : v.status === 'new' ? 'wait' : ''}>{state}{v.type ? ` · ${v.type}` : ''}</span>{v.managerNote && v.status !== 'new' && <span>{v.managerNote}</span>}</div>
      {v.status === 'new' && <button type="button" onClick={cancel}>לבטל</button>}
    </div>
  );
}
function DonationLine({ d, transfer }: { d: Donation; transfer: boolean }) {
  const toast = useToast();
  const claim = () => claimDonationPaid(d).then(() => toast({ text: 'תודה. המנהלים יאשרו את ההעברה.' }, 4000)).catch((e) => toast({ text: authErrorMessage(e), kind: 'error' }));
  return (
    <div className="g-mineline">
      <div><b>{money(d.amount)}{d.memorial ? ` · לזכר ${d.memorial}` : ''}</b><span className={d.paymentStatus === 'paid' ? 'ok' : d.paymentStatus === 'cancelled' ? '' : 'wait'}>{d.paymentStatus === 'paid' ? 'התקבלה, תודה' : d.paymentStatus === 'claimed' ? 'סימנתם שהעברתם, ממתין לאישור' : PAYMENT_LABELS[d.paymentStatus]} · {relTime(d.createdAt)}</span>{d.receiptWanted && <span>{d.receiptSent ? 'הקבלה נשלחה' : `קבלה על שם ${d.receiptName}, תישלח אחרי האישור`}</span>}</div>
      {d.paymentStatus === 'pending' && transfer && <button type="button" onClick={claim}>העברתי</button>}
    </div>
  );
}
function TabLine({ t, ctx }: { t: Tab; ctx: GuestCtx }) {
  const toast = useToast();
  const transfer = !!(ctx.settings.payment.bit || ctx.settings.payment.paybox);
  const claim = () => claimTabPaid(t).then(() => toast({ text: 'תודה. המנהלים יאשרו את ההעברה.' }, 4000)).catch((e) => toast({ text: authErrorMessage(e), kind: 'error' }));
  return (
    <div className="g-tabcard">
      <div className="g-mineline">
        <div><b>{t.eventTitle} · {money(t.total)}</b><span className={t.status === 'paid' ? 'ok' : t.status === 'waived' ? '' : 'wait'}>{t.status === 'open' ? 'עוד לא שולם' : t.status === 'claimed' ? 'סימנתם שהעברתם, ממתין לאישור' : TAB_LABELS[t.status]}</span></div>
        {t.status === 'open' && t.total > 0 && transfer && <button type="button" onClick={claim}>העברתי</button>}
      </div>
      {t.items.length > 0 && <ul>{t.items.map((i, k) => <li key={k}><span>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</span><span>{money(i.price * i.qty)}</span></li>)}</ul>}
      {t.status === 'open' && t.total > 0 && <PayHow settings={ctx.settings} what={`דוכן, ${t.eventTitle}, ${t.guestName}`} />}
    </div>
  );
}
export function GuestAccountPage({ ctx }: { ctx: GuestCtx }) {
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid); const visits = useMyVisits(uid, !!uid); const donations = useMyDonations(uid, !!uid); const tabs = useMyTabs(uid, !!uid);
  useHiddenVersion();
  const p = ctx.profile;
  if (!p) return (
    <>
      <Head title="החשבון שלי" />
      <Empty title="עוד לא נכנסתם">נכנסים פעם אחת עם Google, וזה נשמר בטלפון. כאן יופיעו הביקורים, התרומות והפרטים שלכם.</Empty>
      <div className="r-actions"><Btn to="/login?next=/me/account">כניסה</Btn></div>
      <div style={{ marginTop: 26 }}><InstallHint /><A className="r-linkrow" to="/terms"><div>תנאי שימוש ופרטיות</div><Icon name="chev" /></A></div>
      <DemoSection role="guest" />
    </>
  );
  const missing = ctx.settings.registrationFields.filter((f) => !(p.fields?.[f.id] || '').trim());
  const transfer = !!(ctx.settings.payment.bit || ctx.settings.payment.paybox);
  const liveTickets = tickets.items.filter((t) => t.status === 'valid').length;
  const myVisits = visits.items.filter((v) => !isHidden('visit:' + v.id));
  return (
    <>
      <Head title="החשבון שלי" over={p.displayName} />
      <A className="r-linkrow" to="/me"><div>הכרטיסים שלי <span>· {liveTickets ? tix(liveTickets) : 'אין כרגע'}</span></div><Icon name="chev" /></A>
      {missing.length > 0 && <p className="r-hint" style={{ paddingTop: 14 }}>נשמח לעוד כמה פרטים: {missing.map((m) => m.label).join(', ')}. אפשר למלא ב״הפרטים שלי״ למטה, ואפשר גם אחר כך.</p>}
      {myVisits.length > 0 && <section><Sect title="ביקורים" n={myVisits.length} />{myVisits.map((v) => <VisitLine key={v.id} v={v} />)}</section>}
      {donations.items.length > 0 && <section><Sect title="תרומות" n={donations.items.length} />{donations.items.map((d) => <DonationLine key={d.id} d={d} transfer={transfer} />)}</section>}
      {tabs.items.length > 0 && <section><Sect title="החשבון שלי בדוכן" />{tabs.items.map((t) => <TabLine key={t.id} t={t} ctx={ctx} />)}</section>}
      <ProfileSection profile={p} fields={ctx.settings.registrationFields} />
      <div style={{ marginTop: 26 }}>
        <A className="r-linkrow" to="/visit"><div>לתאם ביקור</div><Icon name="chev" /></A>
        <A className="r-linkrow" to="/donate"><div>לתרום לחווה</div><Icon name="chev" /></A>
        <InstallHint />
        <A className="r-linkrow" to="/terms"><div>תנאי שימוש ופרטיות</div><Icon name="chev" /></A>
        <a className="r-linkrow" href="/"><div>האתר של החווה</div><Icon name="chev" /></a>
      </div>
      <DemoSection role={p.role} />
      <SignOut />
    </>
  );
}

// ---------- terms ----------
// The wording below was written by us and has not had a legal review yet. Guests see the text itself, without a "draft" banner.
const TERMS: [string, string][] = [
  ['מה האפליקציה', 'האפליקציה של חוות רווה משמשת את צוות החווה, מתנדבים ואורחים לניהול משימות, קניות, אירועים, ביקורים ותרומות.'],
  ['הרשמה ופרטים', 'ההרשמה נעשית באמצעות חשבון Google. אנחנו שומרים את השם שכתבתם, מספר הטלפון וכתובת המייל, ובהמשך פרטים נוספים שתבחרו למסור.'],
  ['למה משמש המידע', 'תפעול שוטף: כרטיסים שהזמנתם, ביקורים שתיאמתם, תרומות, ולצוות: משימות ופריטים לצד שמכם. יצירת קשר אתכם בנוגע לפעילותכם בחווה. עדכונים על אירועים בהתראות, במייל, בוואטסאפ או ב־SMS. אפשר לבקש להפסיק בכל עת.'],
  ['מי רואה מה', 'חברי צוות רואים את שמות חברי הצוות האחרים ליד משימות. מנהלי החווה רואים את פרטי הקשר של הנרשמים. המידע אינו נמכר ואינו מועבר לגורמים חיצוניים, למעט ספקי התשתית (Google Firebase) וספקי תשלום כשיופעלו.'],
  ['הסרה', 'אפשר לבקש מהמנהלים למחוק את החשבון והפרטים בכל עת.'],
];
function TermsText() { return <div className="g-termstext">{TERMS.map(([h, t]) => <div key={h}><h3>{h}</h3><p>{t}</p></div>)}</div>; }
export function TermsPage() {
  return (
    <>
      <Head backTo="/" title="תנאי שימוש ופרטיות" over="נובמבר 2026" />
      <div style={{ padding: '0 20px' }}><TermsText /></div>
    </>
  );
}
