// U7 GuestAccount (signed in) / U12 GuestSignIn (signed out, and /login), "מה יש לי בחווה" (all items), edit details (with the
// updates switch and account deletion at the bottom), the notifications sheet, U14 messages, and the item pages behind U7's
// rows: a visit (U15), a donation (U16, pay block), the stall account (U10).
import { useEffect, useMemo, useState } from 'react';
import { AppScreen, go, useToast, useRemove, useExternal, waUrl } from '../../core';
import {
  Avatar, BottomBar, Button, ConfirmSheet, DetailList, DetailRow, EmptyState, Field, FormHeader, Icon, IconTile, ListCard, MoreMenu, Overline, PageTitle, PickerSheet,
  Row, Sheet, Tag, Toggle, TopBar, UnderlineLink,
} from '../../kit';
import { claimDonationPaid, claimTabPaid, cancelVisit, contactPhoneOk, hasTabPurchases, receiptDestination, receiptPreference, useDonation } from '../../../data';
import { authErrorMessage } from '../../../firebase';
import { useDemo } from '../../../demo/store';
import { write } from '../../../db';
import { nowIso } from '../../../clock';
import { back, navigate, param } from '../../../router';
import { dayName, daysFromToday, ddmm, longDate, money } from '../../format';
import { isRead, markRead, useBroadcastNotification, useMyBroadcasts, useReceipt } from '../../data/broadcast';
import { usePush, enablePush, disablePush } from '../../data/push';
import { registrationQuestions, answerOf, answersFor, missingAnswers } from '../../data/system';
import { RegistrationQuestions } from '../system/fields';
import { gw } from '../../gender';
import { signOutEverywhere } from '../system/profile';
import type { Broadcast, Donation, Profile, ReceiptPreference, Tab, Visit } from '../../../types';
import {
  type GuestCtx, type Order, type Status, actorOf, paths, useMine, useEvents, useSignIn, orderTag, donationTag, tabTag, visitTag, orderState, dayShort,
  RECEIPT_WORD, receiptMethods, canChooseReceipt, useReceiptChoice, saveReceipt, setUpdatesOptIn, audienceText,
} from './data';
import { GoogleButton, Note, PayBlock, ReceiptSelect, orderTitle } from './parts';
import { messageWhen } from './home';

// ---------- the items under "מה יש לי בחווה" ----------
type Item = { key: string; title: string; tag: Status; meta: string; go: string; rank: number; at: string };
function orderItem(o: Order): Item {
  const s = orderState(o);
  return {
    key: 'o' + o.id, title: orderTitle(o), tag: orderTag(o), meta: s === 'due' ? money(o.owed) : o.event ? dayShort(o.event.start) : '',
    go: `/me/orders/${o.id}`, rank: !o.past && !o.cancelled ? 0 : s === 'due' || s === 'claimed' ? 1 : 2, at: o.event?.start || o.first.createdAt,
  };
}
function donationItem(d: Donation): Item {
  const wait = d.paymentStatus === 'claimed' ? 'מחכה לאישור' : d.paymentStatus === 'pending' ? 'לתשלום' : d.receiptWanted ? (d.receiptSent ? 'קבלה נשלחה' : `קבלה על שם ${d.receiptName}`) : '';
  return {
    key: 'd' + d.id, title: `תרומה · ${money(d.amount)}`, tag: donationTag(d), meta: [d.memorial && `לזכר ${d.memorial}`, wait].filter(Boolean).join(' · '),
    go: `/me/donations/${d.id}`, rank: d.paymentStatus === 'pending' || d.paymentStatus === 'claimed' ? 1 : 2, at: d.createdAt,
  };
}
const tabItem = (t: Tab): Item => ({
  key: 't' + t.id, title: 'החשבון שלי בדוכן', tag: tabTag(t), meta: `${t.eventTitle} · ${money(t.total)}`,
  go: `/me/stall/${t.id}`, rank: t.status === 'open' || t.status === 'claimed' ? 1 : 2, at: t.createdAt,
});
const visitItem = (v: Visit): Item => ({
  key: 'v' + v.id, title: `ביקור · ${dayShort(v.date)} · ${v.people} אנשים`, tag: visitTag(v), meta: v.status === 'approved' && v.managerNote ? v.managerNote : v.type,
  go: `/me/visits/${v.id}`, rank: v.status === 'new' ? 1 : 2, at: v.createdAt,
});
/** Upcoming orders first, then what still waits (to pay, to approve), then the rest; newest first inside each. */
function useItems(ctx: GuestCtx) {
  const mine = useMine(ctx);
  const items = useMemo(() => {
    const up = mine.upcoming.map(orderItem);
    const rest = [...mine.past.map(orderItem), ...mine.donations.map(donationItem), ...mine.tabs.map(tabItem), ...mine.visits.map(visitItem)]
      .sort((a, b) => a.rank - b.rank || b.at.localeCompare(a.at));
    return [...up, ...rest];
  }, [mine.upcoming, mine.past, mine.donations, mine.tabs, mine.visits]);
  return { items, loading: mine.loading };
}
const ItemRow = ({ it }: { it: Item }) => <Row minHeight={58} onClick={() => go(it.go)} title={it.title} tags={<Tag tone={it.tag.tone}>{it.tag.text}</Tag>} meta={it.meta || undefined} />;

// ---------- U12 ----------
const ABOUT: [RegExp, string][] = [[/\/order/, 'כדי שהכרטיסים יהיו שלך ויישמרו בטלפון'], [/^\/visit/, 'כדי שנוכל לחזור אליך על הביקור'], [/^\/donate/, 'כדי שנוכל לשלוח אישור תשלום ולומר תודה'], [/^\/contact/, 'כדי שהמנהלים ידעו למי לחזור']];
/** U12: the account page signed out, and /login?next=... (then the copy says why, and signing in goes on to `next`). */
export function SignInPage({ ctx, next }: { ctx: GuestCtx; next?: string }) {
  const sign = useSignIn();
  useEffect(() => { if (ctx.profile && next) navigate(next, true); }, [!!ctx.profile]);
  const about = (next && ABOUT.find(([re]) => re.test(next))?.[1]) || 'כדי לראות את הכרטיסים, הביקורים והתרומות שלך';
  return (
    <AppScreen variant="plain" bodyClassName="guest-signin">
      {next && <TopBar className="guest-pull" back={{ label: 'חזרה', onClick: () => back('/') }} />}
      <main className="guest-signin__main">
        <span className="guest-signin__mark" aria-hidden="true"><Icon name="farm" size={32} /></span>
        <h1 className="guest-signin__title">{next?.includes('/order') ? 'רגע לפני הכרטיסים' : 'החשבון שלי בחוות רווה'}</h1>
        <p className="guest-signin__text">{about}, נכנסים פעם אחת עם חשבון Google. לא נשאל שוב.</p>
        <GoogleButton disabled={sign.busy} onClick={() => void sign.go(next)} />
        {sign.error && <span className="k-field__error" role="alert">{sign.error}</span>}
        <span className="guest-signin__fine">בהרשמה ממלאים שם בעברית וטלפון. <button type="button" className="guest-inlinelink" onClick={() => go('/terms')}>תנאי שימוש ופרטיות</button></span>
      </main>
      <div className="guest-signin__demo"><Button variant="quiet" onClick={() => go('/demo')}>לראות איך האפליקציה עובדת, בנתוני הדגמה</Button></div>
    </AppScreen>
  );
}

// ---------- U7 ----------
const townOf = (p: Profile, ctx: GuestCtx) => p.town || answerOf(p.fields, registrationQuestions(ctx.settings.registrationFields).find((f) => f.label.includes('יישוב')) || { id: 'city', label: '', type: 'text', options: [], required: false }) || '';
const relDayWord = (iso: string) => (daysFromToday(iso) === 0 ? 'היום' : daysFromToday(iso) === -1 ? 'אתמול' : ddmm(iso));

export function AccountPage({ ctx }: { ctx: GuestCtx }) {
  if (!ctx.profile) return <SignInPage ctx={ctx} />;
  return <Account ctx={ctx} p={ctx.profile} />;
}
function Account({ ctx, p }: { ctx: GuestCtx; p: Profile }) {
  const demo = useDemo();
  const { items } = useItems(ctx);
  const messages = useMyBroadcasts(p.uid, 30);
  const msgs = messages.items;
  const [sheet, setSheet] = useState<'notify' | 'receipt' | null>(null);
  const toast = useToast();
  const questions = registrationQuestions(ctx.settings.registrationFields);
  const missing = questions.filter((f) => !answerOf(p.fields, f).trim());
  const town = townOf(p, ctx);
  const method = receiptPreference(p);
  const chooseReceipt = async (m: ReceiptPreference) => {
    try { await saveReceipt(p, m); toast.show({ text: 'נשמר', duration: 2500 }); } catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); }
  };
  return (
    <AppScreen variant="root" gap={10}>
      <div className="guest-editlink"><UnderlineLink icon="edit" onClick={() => go('/me/edit')}>עריכת פרטים</UnderlineLink></div>
      <div className="guest-who">
        <Avatar name={p.displayName} size={56} tone="me" />
        <div className="guest-who__text"><b className="guest-who__name">{p.displayName}</b><span className="guest-who__meta">{p.phone && <span dir="ltr">{p.phone}</span>}{p.phone && town ? ' · ' : ''}{town}</span></div>
      </div>
      {missing.length > 0 && (
        <button type="button" className="k-card guest-nudge" onClick={() => go('/me/edit')}>
          <Icon name="user" size={20} /><span>רוצים להשלים כמה פרטים? {missing.map((m) => m.label).join(', ')}. לוקח רגע, אפשר אחר כך.</span>
        </button>
      )}
      <ListCard title="מה יש לי בחווה" end={items.length > 4 ? <button type="button" className="k-textlink" onClick={() => go('/me/items')}>הכל · {items.length}</button> : undefined}>
        {items.slice(0, 4).map((it) => <ItemRow key={it.key} it={it} />)}
        {!items.length && <li className="guest-emptyli"><span className="k-note">עוד אין כאן כלום. כרטיסים, ביקורים ותרומות יופיעו כאן.</span><Button variant="outline" onClick={() => go('/')}>לאירועים</Button></li>}
      </ListCard>
      <ListCard>
        <Row leading={<IconTile icon="megaphone" />} title="הודעות מהחווה" meta={msgs.length ? `${msgs.length === 1 ? 'הודעה אחת' : `${msgs.length} הודעות`} · האחרונה ${relDayWord(msgs[0].createdAt)}` : 'אין הודעות עדיין'} onClick={() => go('/me/messages')} />
        <Row leading={<IconTile icon="bell" />} title="התראות ועדכונים" meta={`עדכונים על אירועים חדשים: ${p.updatesOptIn ? 'פעיל' : 'כבוי'}`} onClick={() => setSheet('notify')} />
        {canChooseReceipt(p) && <Row leading={<IconTile icon="message" />} title="אישור תשלום" meta={method ? `נשלח אליי ב${RECEIPT_WORD[method]}` : 'עוד לא בחרת לאן'} onClick={() => setSheet('receipt')} />}
        <Row leading={<IconTile icon="phone" />} title="פנייה לחווה" onClick={() => go('/contact')} />
      </ListCard>
      <div className="guest-foot">
        <Button variant="outline" onClick={() => signOutEverywhere(demo.on, p)}>יציאה מהחשבון</Button>
        <Button variant="quiet" onClick={() => go('/install')}>התקנה</Button>
        <Button variant="quiet" href="/">האתר</Button>
        <Button variant="quiet" onClick={() => go('/terms')}>תנאים</Button>
      </div>
      <NotifySheet open={sheet === 'notify'} onClose={() => setSheet(null)} p={p} />
      <PickerSheet open={sheet === 'receipt'} onClose={() => setSheet(null)} title="אישור תשלום" sub="לאן לשלוח לי אישור כשהמנהלים מאשרים תשלום"
        options={receiptMethods(p).map((m) => ({ value: m, label: RECEIPT_WORD[m], meta: <span dir="ltr">{receiptDestination(p, m)}</span> }))} value={method} onChange={(m) => void chooseReceipt(m)} />
    </AppScreen>
  );
}

/** "התראות ועדכונים": update messages about new events (Profile.updatesOptIn) and push on this phone. */
function NotifySheet({ open, onClose, p }: { open: boolean; onClose: () => void; p: Profile }) {
  const toast = useToast();
  const push = usePush(p);
  const [busy, setBusy] = useState(false);
  const setOptIn = (on: boolean) => setUpdatesOptIn(p.uid, on).catch((e) => toast.refused(`לא נשמר. ${authErrorMessage(e)}`));
  const togglePush = async (on: boolean) => {
    setBusy(true);
    try { if (on) { const s = await enablePush(p, push.config); if (s === 'denied') toast.show({ text: 'ההתראות חסומות בהגדרות הטלפון', duration: 4000 }); } else await disablePush(p); push.refresh(); }
    catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); }
    finally { setBusy(false); }
  };
  const pushMeta = push.state === 'needs-install' ? 'קודם מתקינים על מסך הבית' : push.state === 'unsupported' ? 'הדפדפן הזה לא מקבל התראות' : push.state === 'off' ? 'החווה עוד לא הפעילה התראות' : push.state === 'denied' ? 'חסום בהגדרות הטלפון' : push.state === 'on' ? 'פעיל בטלפון הזה' : 'כבוי בטלפון הזה';
  return (
    <Sheet open={open} onClose={onClose} title="התראות ועדכונים">
      <ListCard>
        <Row title="עדכונים על אירועים חדשים" meta="אירועים חדשים, כמה פעמים בשנה" actions={<Toggle checked={!!p.updatesOptIn} onChange={setOptIn} label="עדכונים על אירועים חדשים" />} />
        <Row title="התראות בטלפון" meta={pushMeta} actions={push.state === 'needs-install'
          ? <Button variant="outline" onClick={() => { onClose(); go('/install'); }}>התקנה</Button>
          : <Toggle checked={push.state === 'on'} disabled={busy || !['ask', 'on'].includes(push.state)} onChange={(v) => void togglePush(v)} label="התראות בטלפון" />} />
      </ListCard>
      <Note>הודעות על אירוע שנרשמת אליו (שינוי שעה, ביטול) מגיעות בכל מקרה.</Note>
    </Sheet>
  );
}

/** "הכל · N": every item, in the same order. */
export function ItemsPage({ ctx }: { ctx: GuestCtx }) {
  const { items, loading } = useItems(ctx);
  const p = paths(ctx);
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar className="guest-pull" back={ctx.team ? { label: 'הכרטיסים שלי', onClick: () => go(p.tickets) } : { label: 'החשבון שלי', onClick: () => go(p.account) }} />
      <PageTitle size="detail">מה יש לי בחווה</PageTitle>
      {!items.length ? (!loading && <EmptyState variant="card" icon="farm" title="עוד אין כאן כלום" text="כרטיסים, ביקורים, תרומות וחשבונות בדוכן יופיעו כאן." />)
        : <ListCard>{items.map((it) => <ItemRow key={it.key} it={it} />)}</ListCard>}
    </AppScreen>
  );
}

// ---------- edit details ----------
export function EditPage({ ctx }: { ctx: GuestCtx }) {
  const p = ctx.profile;
  if (!p) return <SignInPage ctx={ctx} next="/me/edit" />;
  return <Edit ctx={ctx} p={p} />;
}
function Edit({ ctx, p }: { ctx: GuestCtx; p: Profile }) {
  const toast = useToast();
  const questions = registrationQuestions(ctx.settings.registrationFields);
  const [name, setName] = useState(p.displayName || '');
  const [phone, setPhone] = useState(p.phone || '');
  const [answers, setAnswers] = useState<Record<string, string>>(() => answersFor(p.fields, questions));
  const [optIn, setOptIn] = useState(!!p.updatesOptIn);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const missing = missingAnswers(answers, questions);
  const nameErr = tried && name.trim().length < 2 ? 'צריך שם פרטי ומשפחה' : '';
  const phoneErr = tried && !contactPhoneOk(phone) ? 'מספר טלפון לא תקין' : '';
  const done = () => back(paths(ctx).account);
  const save = async () => {
    setTried(true);
    if (name.trim().length < 2 || !contactPhoneOk(phone) || missing.length || busy) return;
    setBusy(true);
    const given = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.trim()]));
    try {
      await write.update('users', p.uid, { displayName: name.trim(), phone: phone.trim(), fields: { ...(p.fields || {}), ...given }, updatesOptIn: optIn, updatedAt: nowIso() });
      toast.show({ text: 'נשמר', duration: 2500 }); done();
    } catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); }
    finally { setBusy(false); }
  };
  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar><Button size="bar" grow disabled={busy} onClick={save}>שמירה</Button></BottomBar>}>
      <FormHeader title="עריכת פרטים" onCancel={done} />
      <Field label="השם שלך בעברית" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={nameErr} autoComplete="name" />
      <Field label="טלפון" ltr value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={25} inputMode="tel" error={phoneErr} autoComplete="tel" />
      <RegistrationQuestions questions={questions} answers={answers} missing={tried ? missing : []} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
      <UpdatesSwitch checked={optIn} onChange={setOptIn} />
      <DetailList><DetailRow term="מייל"><span dir="ltr">{p.email}</span></DetailRow></DetailList>
      <Note>המייל מגיע מחשבון Google, ולכן אי אפשר לשנות אותו כאן.</Note>
      <Button variant="danger" icon="trash" className="guest-delete" onClick={() => go('/delete-account')}>מחיקת החשבון</Button>
    </AppScreen>
  );
}
/** U13 and edit details: "לקבל עדכונים מהחווה" (off by default) and the note under it. */
export function UpdatesSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <>
      <ListCard><Row className="guest-togglerow" title="לקבל עדכונים מהחווה" meta="אירועים חדשים, כמה פעמים בשנה" actions={<Toggle checked={checked} onChange={onChange} label="לקבל עדכונים מהחווה" />} /></ListCard>
      <Note>הודעות על אירוע שנרשמת אליו (שינוי שעה, ביטול) מגיעות בכל מקרה.</Note>
    </>
  );
}

// ---------- U14 ----------
function MessageRow({ p, b, byId }: { p: Profile; b: Broadcast; byId: ReturnType<typeof useEvents>['byId'] }) {
  const { item, loading } = useReceipt(b.id, p.uid);
  const note = useBroadcastNotification(p.uid, b.id);
  const unread = !loading && !isRead(item);
  return (
    <Row className="guest-msgrow" chevron={false} onClick={unread ? () => markRead(actorOf(p), b.id, item, note.item).catch(() => {}) : undefined}
      leading={<span className={unread ? 'guest-dot' : 'guest-dot guest-dot--off'} aria-label={unread ? 'חדש' : undefined} />}
      title={b.text} meta={`${messageWhen(b.createdAt)} · ${audienceText(b, byId)}`} />
  );
}
export function MessagesPage({ ctx }: { ctx: GuestCtx }) {
  const p = ctx.profile;
  const toast = useToast();
  const events = useEvents();
  const messages = useMyBroadcasts(p?.uid || '', 30);
  if (!p) return <SignInPage ctx={ctx} next="/me/messages" />;
  const list = messages.items;
  const flip = (on: boolean) => setUpdatesOptIn(p.uid, on).then(() => toast.show({ text: on ? 'עדכונים על אירועים חדשים: פעיל' : 'לא תקבלו עדכונים על אירועים חדשים', check: true, actions: [{ label: 'ביטול', onClick: () => void setUpdatesOptIn(p.uid, !on) }] }), (e) => toast.refused(`לא נשמר. ${authErrorMessage(e)}`));
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar className="guest-pull" back={{ label: 'החשבון שלי', onClick: () => go(paths(ctx).account) }} />
      <PageTitle size="detail">הודעות מהחווה</PageTitle>
      {!list.length ? (!messages.loading && <EmptyState variant="card" icon="megaphone" title="אין הודעות עדיין" text="הודעות מהחווה על אירועים שנרשמת אליהם יופיעו כאן." />)
        : <ListCard>{list.map((b) => <MessageRow key={b.id} p={p} b={b} byId={events.byId} />)}</ListCard>}
      <ListCard>
        {p.updatesOptIn
          ? <Row title="לא לקבל עדכונים על אירועים חדשים" meta="הודעות על אירוע שנרשמת אליו יגיעו בכל מקרה" onClick={() => void flip(false)} />
          : <Row title="לקבל עדכונים על אירועים חדשים" meta="אירועים חדשים, כמה פעמים בשנה" onClick={() => void flip(true)} />}
      </ListCard>
    </AppScreen>
  );
}

// ---------- the pages behind U7's rows ----------
const backToAccount = (ctx: GuestCtx) => ({ label: ctx.team ? 'מה יש לי בחווה' : 'החשבון שלי', onClick: () => go(ctx.team ? '/me/items' : paths(ctx).account) });

/** U15: the request, its tag, what was asked, the three-step status line, WhatsApp to the farm and "ביטול הבקשה" (also, alone, in ⋯). */
export function VisitPage({ ctx, id }: { ctx: GuestCtx; id: string }) {
  const mine = useMine(ctx);
  const remove = useRemove();
  const open = useExternal();
  const [asking, setAsking] = useState(false);
  const v = mine.visits.find((x) => x.id === id);
  const tag = v && visitTag(v);
  const canCancel = !!v && v.status === 'new';
  const wa = ctx.settings.contact?.whatsapp || '';
  const cancel = { title: 'לבטל את בקשת הביקור?', text: 'המנהלים יראו שהבקשה בוטלה.', confirmLabel: 'ביטול הבקשה', onConfirm: () => remove(() => cancelVisit(v!), { text: 'הבקשה בוטלה' }) };
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar className="guest-pull" back={backToAccount(ctx)} end={canCancel && <MoreMenu title="הבקשה" items={[{ label: 'ביטול הבקשה', icon: 'close', tone: 'danger', confirm: cancel }]} />} />
      {!v ? (!mine.loading && <EmptyState variant="fill" icon="pin" title="הבקשה לא נמצאה" />) : <>
        <div className="guest-titleblock">
          <span className="guest-sub guest-sub--sm">בקשת ביקור</span>
          <div className="guest-titlerow"><PageTitle size="detail">{dayName(v.date)}, {longDate(v.date)}</PageTitle><Tag tone={tag!.tone}>{tag!.text}</Tag></div>
        </div>
        <DetailList>
          <DetailRow term="כמה">{v.people} אנשים</DetailRow>
          <DetailRow term="סוג">{v.type}</DetailRow>
          {v.note && <DetailRow term="כתבת">{v.note}</DetailRow>}
          {v.managerNote && v.status !== 'approved' && <DetailRow term="מהחווה">{v.managerNote}</DetailRow>}
        </DetailList>
        {(v.status === 'new' || v.status === 'approved') && <VisitSteps v={v} />}
        {(wa || canCancel) && (
          <div className="guest-actions">
            {wa && <Button variant="outline" size="tall" icon="message" onClick={() => open(waUrl(wa, `שלום, לגבי בקשת הביקור ל${dayName(v.date)} ${ddmm(v.date)}`))}>וואטסאפ לחווה</Button>}
            {canCancel && <Button variant="quiet" onClick={() => setAsking(true)}>ביטול הבקשה</Button>}
          </div>
        )}
        <ConfirmSheet open={asking} onClose={() => setAsking(false)} title={cancel.title} text={cancel.text} confirmLabel={cancel.confirmLabel}
          onConfirm={async () => { await cancel.onConfirm(); setAsking(false); }} />
      </>}
    </AppScreen>
  );
}
/** U15's status line: sent, the farm gets back to you, the visit is set. Approved fills the last two (the last with the farm's note). */
function VisitSteps({ v }: { v: Visit }) {
  const set = v.status === 'approved';
  const steps = [
    { title: 'הבקשה נשלחה', meta: messageWhen(v.createdAt), done: true },
    { title: 'החווה חוזרת אליך', meta: set ? '' : 'בדרך כלל תוך יום, בוואטסאפ או בטלפון', done: set },
    { title: 'הביקור נקבע', meta: set ? (v.managerNote || `${dayName(v.date)}, ${longDate(v.date)}`) : 'יופיע כאן עם השעה', done: set },
  ];
  return (
    <section className="k-card guest-steps" aria-label="מצב הבקשה">
      <ol className="guest-steps__list">
        {steps.map((s) => (
          <li key={s.title} className={s.done ? 'guest-step guest-step--done' : 'guest-step'}>
            <span className="guest-step__rail" aria-hidden="true"><span className="guest-step__dot">{s.done && <Icon name="check" size={14} />}</span><span className="guest-step__line" /></span>
            <span className="guest-step__body"><span className="guest-step__title">{s.title}</span>{s.meta && <span className="guest-step__meta">{s.meta}</span>}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** U16: what was given (dedication, receipt), the shared pay block and "העברתי את התשלום". The donate form lands here (?new=1: "תודה!"). */
export function DonationPage({ ctx, id }: { ctx: GuestCtx; id: string }) {
  const { item: d, loading } = useDonation(id, !!ctx.profile);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const thanks = param('new') === '1';
  if (!ctx.profile || !d || d.uid !== ctx.profile.uid) return <AppScreen variant="detail"><TopBar className="guest-pull" back={backToAccount(ctx)} />{!loading && <EmptyState variant="fill" icon="heart" title="התרומה לא נמצאה" />}</AppScreen>;
  const p = ctx.profile;
  const state = d.paymentStatus === 'pending' ? 'due' : d.paymentStatus === 'claimed' ? 'claimed' : 'paid';
  const tag = donationTag(d);
  const title = `${money(d.amount)}${d.label ? ` · ${d.label}` : ''}`;
  const method = receiptPreference(p);
  const otherName = d.receiptName && d.receiptName !== p.displayName ? ` על שם ${d.receiptName}` : '';
  const receipt = d.receiptSent ? `נשלחה${otherName}` : `ביקשת${otherName} · ${state === 'paid' ? 'תישלח בקרוב' : 'תישלח אחרי האישור'}`;
  const after = method ? `, ואז ${gw(p.displayName, 'תקבל', 'תקבלי', p)} אישור ${method === 'email' ? 'במייל' : 'בוואטסאפ'}.` : '.';
  const claim = async () => {
    setBusy(true);
    try { await claimDonationPaid(d); toast.show({ text: 'תודה! המנהלים יאשרו את ההעברה.', check: true }); } catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); } finally { setBusy(false); }
  };
  return (
    <AppScreen variant="detail" gap={12} bar={state === 'due' ? <BottomBar><Button size="bar" grow icon="check" disabled={busy} onClick={claim}>העברתי את התשלום</Button></BottomBar> : undefined}>
      <TopBar className="guest-pull" back={thanks ? { label: 'בית', onClick: () => go('/') } : backToAccount(ctx)} />
      <div className="guest-titleblock">
        <span className="guest-sub guest-sub--sm">{thanks ? `תרומה · ${title}` : `תרומה · ${messageWhen(d.createdAt)}`}</span>
        <div className="guest-titlerow"><PageTitle size="detail">{thanks ? 'תודה!' : title}</PageTitle><Tag tone={tag.tone}>{tag.text}</Tag></div>
      </div>
      {(d.memorial || d.receiptWanted || d.note) && (
        <DetailList>
          {d.memorial && <DetailRow term="הנצחה">לזכר {d.memorial}</DetailRow>}
          {d.receiptWanted && <DetailRow term="קבלה">{receipt}</DetailRow>}
          {d.note && <DetailRow term="מילים" plain>{d.note}</DetailRow>}
        </DetailList>
      )}
      {d.paymentStatus === 'cancelled' ? <Note>התרומה בוטלה.</Note> : <PayBlock amount={d.amount} purpose="תרומה" name={p.displayName} settings={ctx.settings} state={state} />}
      {state === 'due' && <Note>אחרי "העברתי" מנהל מאשר שהכסף הגיע{after}</Note>}
    </AppScreen>
  );
}

/** U10: what I took at the stall, the pay block, "העברתי" (the receipt channel first when the account has none). */
export function StallPage({ ctx, id }: { ctx: GuestCtx; id: string }) {
  const mine = useMine(ctx);
  const choice = useReceiptChoice(ctx.profile);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const t = mine.allTabs.find((x) => x.id === id);
  if (!ctx.profile || !t) return <AppScreen variant="detail"><TopBar className="guest-pull" back={backToAccount(ctx)} />{!mine.loading && <EmptyState variant="fill" icon="stall" title="החשבון לא נמצא" />}</AppScreen>;
  const p = ctx.profile;
  const event = mine.events.byId.get(t.eventId);
  const open = t.status === 'open';
  const needChannel = hasTabPurchases(t) && !receiptPreference(p) && canChooseReceipt(p);
  const items = t.items || [];
  const count = items.reduce((n, i) => n + (i.qty || 1), 0);
  const claim = async () => {
    setBusy(true);
    try { await saveReceipt(p, choice.method); await claimTabPaid(t); toast.show({ text: 'תודה! המנהלים יאשרו את ההעברה.', check: true }); }
    catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); }
    finally { setBusy(false); }
  };
  const keep = async (m: ReceiptPreference) => { choice.set(m); if (!open) { try { await saveReceipt(p, m); toast.show({ text: 'ההעדפה נשמרה', duration: 2500 }); } catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); } } };
  return (
    <AppScreen variant="detail" gap={14} bar={open ? <BottomBar><Button size="bar" grow icon="check" disabled={busy || (needChannel && choice.missing)} onClick={claim}>העברתי את התשלום</Button></BottomBar> : undefined}>
      <TopBar className="guest-pull" back={backToAccount(ctx)} />
      <div className="guest-titleblock"><span className="guest-sub">{t.eventTitle}{event ? ` · ${dayShort(event.start)}` : ''}</span><PageTitle size="detail">החשבון שלי בדוכן</PageTitle></div>
      {items.length > 0 && (
        <ListCard title={`מה לקחת · ${count === 1 ? 'פריט אחד' : `${count} פריטים`}`}>
          {items.map((i, k) => <Row key={k} minHeight={50} chevron={false} title={i.name} trailing={<span className="guest-qty k-num">{i.qty} ×</span>} value={money(i.price * i.qty)} />)}
        </ListCard>
      )}
      {t.status === 'waived' ? <Note>החווה מחלה על החשבון הזה. אין מה לשלם.</Note>
        : <PayBlock amount={t.total} purpose={t.eventTitle} name={p.displayName} settings={ctx.settings} state={open ? 'due' : t.status === 'claimed' ? 'claimed' : 'paid'} />}
      {needChannel && <ReceiptSelect profile={p} method={choice.method} onChange={(m) => void keep(m)} />}
      {open && <Note>רשמו לך בדוכן לפי הכרטיס. משלמים מתי שנוח, עד סוף האירוע או אחריו.</Note>}
    </AppScreen>
  );
}
