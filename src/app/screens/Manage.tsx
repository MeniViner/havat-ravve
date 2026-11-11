// Manager home ("ניהול") and the inbox of things waiting for a decision.
import { useState } from 'react';
import type { AppNotification, FarmEvent, Visit, Donation, CalendarItem, Profile } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Sec, Btn, A, Icon, Avatar, Empty, Chips, Loading, useToast, fmtDayLong, fmtWeekday, firstName, relTime, todayISO, money, useDesktop, useOpenSections, inText } from '../ui';
import { useHandledNotifications, handleNotification } from '../data';

type Props = { ctx: TeamCtx; inbox: AppNotification[]; events: FarmEvent[]; visits: Visit[]; donations: Donation[]; people: Profile[]; calendar: CalendarItem[]; templatesCount: number; placesCount: number; vendorsCount: number };

export function ManageHomeScreen({ ctx, inbox, events, visits, donations, people, calendar, templatesCount, placesCount, vendorsCount }: Props) {
  const today = todayISO();
  const desktop = useDesktop();
  const { isOpen, toggle } = useOpenSections(['inbox', 'topics'], 'manage');
  const next = events.filter((e) => e.published && e.end >= new Date().toISOString()).sort((a, b) => a.start.localeCompare(b.start))[0];
  const monthStart = today.slice(0, 8) + '01';
  const paidMonth = donations.filter((d) => d.createdAt >= monthStart && (d.paymentStatus === 'paid' || d.paymentStatus === 'paid_onsite')).reduce((s, d) => s + d.amount, 0);
  const pendingDon = donations.filter((d) => d.paymentStatus === 'claimed' || d.paymentStatus === 'pending').length;
  const newVisits = visits.filter((v) => v.status === 'new').length;
  const approvedMonth = visits.filter((v) => v.status === 'approved' && v.date >= monthStart).length;
  const team = people.filter((p) => p.role !== 'guest' && p.status === 'active').length;
  const todayCal = calendar.filter((c) => c.date === today);
  const topics: { to: string; icon: string; title: string; sub: string; badge?: number }[] = [
    { to: '/manage/events', icon: 'ticket', title: 'אירועים', sub: next ? `${next.title} · ${fmtWeekday(next.start)} · ${inText(next.start)}` : 'אין אירוע קרוב' },
    { to: '/manage/people', icon: 'people', title: 'אנשים', sub: `${people.length} נרשמים · ${team} בצוות` },
    { to: '/manage/visits', icon: 'pin', title: 'ביקורים', sub: `${newVisits ? `${newVisits} חדשות · ` : ''}${approvedMonth} מאושרים החודש`, badge: newVisits || undefined },
    { to: '/manage/donations', icon: 'heart', title: 'תרומות', sub: `${money(paidMonth)} החודש${pendingDon ? ` · ${pendingDon} ממתינה` : ''}` },
    { to: '/manage/calendar', icon: 'calendar', title: 'יומן', sub: todayCal.length ? `היום: ${todayCal.map((c) => `${c.title}${c.time ? ' ' + c.time : ''}`).join(', ')}` : 'היום: אין כלום ביומן' },
    { to: '/manage/reports', icon: 'chart', title: 'דוחות', sub: 'משימות, תרומות, חובות פתוחים' },
  ];
  return (
    <>
      <Top date={fmtDayLong(today)} title="ניהול" end={<A to="/more" aria-label="הפרופיל שלי"><Avatar name={ctx.profile.displayName} /></A>} />
      <Sec title="לטיפול" n={inbox.length} link="הכל, גם מה שטופל" linkTo="/manage/inbox" open={isOpen('inbox')} onToggle={() => toggle('inbox')} />
      {isOpen('inbox') && (inbox.length ? <div className="list">{inbox.slice(0, desktop ? 10 : 5).map((n) => <InboxRow key={n.id} n={n} ctx={ctx} />)}</div> : <p className="lead">אין כלום שמחכה להחלטה. יופי.</p>)}
      <Sec title="הכל לפי נושא" open={isOpen('topics')} onToggle={() => toggle('topics')} />
      {isOpen('topics') && <>
        <div className="tiles">{topics.map((t) => <A key={t.to} to={t.to} className="tile"><div className="h"><Icon name={t.icon} />{t.title}{t.badge ? <span className="pill rust" style={{ marginInlineStart: 'auto' }}>{t.badge}</span> : null}</div><div className="s">{t.sub}</div></A>)}</div>
        <div className="links">
          <A to="/manage/templates"><Icon name="repeat" />משימות חוזרות<span className="s">{templatesCount} פעילות</span><Icon name="chev" className="chev" size={18} /></A>
          <A to="/manage/places"><Icon name="pin" />מקומות בחווה<span className="s">{placesCount}</span><Icon name="chev" className="chev" size={18} /></A>
          <A to="/manage/vendors"><Icon name="store" />בעלי דוכנים<span className="s">{vendorsCount} ברשימה</span><Icon name="chev" className="chev" size={18} /></A>
          <A to="/manage/activity"><Icon name="history" />כל הפעילות<span className="s">מי עשה מה</span><Icon name="chev" className="chev" size={18} /></A>
          <A to="/manage/settings"><Icon name="sliders" />הגדרות<span className="s">תשלום, תרומות, הודעות</span><Icon name="chev" className="chev" size={18} /></A>
          <a href="/admin" target="_blank" rel="noopener"><Icon name="external" />עריכת האתר<span className="s">נפתח בחלון נפרד</span><Icon name="chev" className="chev" size={18} /></a>
        </div>
      </>}
    </>
  );
}

const ICONS: Record<AppNotification['type'], string> = { visit: 'pin', donation: 'heart', join: 'user', order: 'ticket', receipt: 'file', tab: 'store', claim: 'ticket' };
export function InboxRow({ n, ctx, handled }: { n: AppNotification; ctx: TeamCtx; handled?: boolean }) {
  const toast = useToast();
  const done = () => handleNotification(n, ctx.actor, !handled).then(() => toast({ text: handled ? 'חזר לתור' : 'סומן טופל', action: { label: 'ביטול', onClick: () => handleNotification(n, ctx.actor, !!handled) } }, 4000));
  return (
    <div className="row" style={handled ? { color: 'var(--muted)' } : undefined}>
      <span className="iconbtn" style={{ color: 'var(--green2)', width: 36 }}><Icon name={ICONS[n.type] || 'bell'} /></span>
      <div className="main">
        <A to={n.link} className="title" style={{ display: 'block' }}>{n.title}</A>
        <div className="meta"><span>{n.text}</span><span>{relTime(n.createdAt)}</span>{handled && n.handledBy && <span>· {firstName(n.handledBy.name)}</span>}</div>
        {!handled && <div className="inline" style={{ marginTop: 8 }}><Btn size="sm" to={n.link}>{n.type === 'visit' ? 'אישור ליומן' : n.type === 'donation' || n.type === 'claim' || n.type === 'tab' ? 'אישור תשלום' : n.type === 'receipt' ? 'לקבלה' : 'פתיחה'}</Btn><Btn size="sm" kind="quiet" onClick={done}>טופל</Btn></div>}
      </div>
      {handled && <Btn size="xs" kind="quiet" onClick={done}>החזרה לתור</Btn>}
    </div>
  );
}

type InboxFilter = 'all' | 'visit' | 'donation' | 'tab' | 'order' | 'handled';
export function InboxScreen({ ctx, inbox }: { ctx: TeamCtx; inbox: AppNotification[] }) {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const handled = useHandledNotifications(true);
  const desktop = useDesktop();
  const count = (t: AppNotification['type'][]) => inbox.filter((n) => t.includes(n.type)).length;
  const list = filter === 'handled' ? handled.items : inbox.filter((n) => filter === 'all' ? true : filter === 'visit' ? n.type === 'visit' : filter === 'donation' ? n.type === 'donation' || n.type === 'receipt' : filter === 'tab' ? n.type === 'tab' : n.type === 'order' || n.type === 'claim');
  return (
    <>
      <Top backTo="/manage" backLabel="ניהול" title={<>לטיפול <span className="muted" style={{ fontWeight: 500 }}>· {inbox.length}</span></>} sub='כל מה שמחכה להחלטה של מנהל. פריט נסגר כשעושים את הפעולה או לוחצים "טופל".' />
      <div style={{ paddingTop: 8 }}><Chips scroll={!desktop} value={filter} onChange={setFilter} options={[{ value: 'all', label: 'פתוחים', n: inbox.length }, { value: 'visit', label: 'ביקורים', n: count(['visit']) }, { value: 'donation', label: 'תרומות', n: count(['donation', 'receipt']) }, { value: 'tab', label: 'דוכן', n: count(['tab']) }, { value: 'order', label: 'הזמנות', n: count(['order', 'claim']) }, { value: 'handled', label: 'טופלו', n: handled.items.length }]} /></div>
      {filter === 'handled' && handled.loading && <Loading />}
      {list.length ? <div className="list" style={{ marginTop: 8 }}>{list.map((n) => <InboxRow key={n.id} n={n} ctx={ctx} handled={filter === 'handled'} />)}</div> : <Empty title={filter === 'handled' ? 'עוד לא טופל כלום' : 'אין כלום שמחכה'} text={filter === 'handled' ? '' : 'בקשות ביקור, תרומות שהועברו וחשבונות דוכן יופיעו כאן.'} />}
      {filter === 'all' && handled.items.length > 0 && <><Sec title="טופלו לאחרונה" n={handled.items.length} link="הכל" onLink={() => setFilter('handled')} /><div className="list">{handled.items.slice(0, 5).map((n) => <InboxRow key={n.id} n={n} ctx={ctx} handled />)}</div></>}
    </>
  );
}

