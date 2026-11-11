import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth, useProfile, canManage, isOwner, isTeam, actorOf, useOpenTasks, useRecentDoneTasks, useOpenShopping, useRecentBought, useTemplates, usePlaces, materializeToday, useOnline, usePeople } from './store';
import { useSettings, useNotifications, useVisits, useAllEvents, useCalendar } from './data';
import { useRoute, navigate } from './router';
import { Icon, ToastProvider, Sheet, Button, Segmented, useToast } from './ui';
import { Onboarding, Blocked } from './screens/Auth';
import { TodayScreen } from './screens/Today';
import { TasksScreen } from './screens/Tasks';
import { HistoryScreen } from './screens/History';
import { ShoppingScreen } from './screens/Shopping';
import { ManageScreen } from './screens/Manage';
import { ManageHomeScreen } from './screens/ManageHome';
import { EventsListScreen, EventHubScreen } from './screens/ManageEvents';
import { InboxScreen, VisitsScreen, DonationsScreen, CalendarScreen, ReportsScreen, SettingsScreen, ActivityFeedScreen } from './screens/ManageMore';
import { StaffEventsScreen, StaffEventHub } from './screens/StaffEvents';
import { GuestHome, EventScreen, MyArea, VisitScreen, DonateScreen, type GuestCtx } from './screens/Guest';
import { MoreScreen, TermsScreen } from './screens/More';
import { db, todayKey } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { Profile, Settings } from './types';

type NavItem = { path: string; icon: string; label: string; badge?: number; match?: (r: string) => boolean };
const isCurrent = (i: NavItem, route: string) => i.match ? i.match(route) : (i.path === '/' ? route === '/' : route.startsWith(i.path));

function Nav({ route, items }: { route: string; items: NavItem[] }) {
  return (
    <nav className="bottom-nav" aria-label="ניווט ראשי"><div className="bottom-nav-inner">
      {items.map((i) => (
        <a key={i.path} href={'/app' + (i.path === '/' ? '' : i.path)} aria-current={isCurrent(i, route) ? 'page' : undefined} onClick={(e) => { e.preventDefault(); navigate(i.path); }}>
          <Icon name={i.icon} />{i.label}{i.badge ? <span className="badge">{i.badge > 99 ? '99+' : i.badge}</span> : null}
        </a>
      ))}
    </div></nav>
  );
}

function Shell({ children, nav, online, banner, profile }: { children: React.ReactNode; nav: NavItem[]; online: boolean; banner?: React.ReactNode; profile?: Profile | null }) {
  const route = useRoute();
  return (
    <div className="shell">
      <aside className="rail" aria-label="ניווט">
        <a className="rail-brand" href="/" aria-label="לאתר"><img src="/assets/rava-logo.png" alt="" /><span>חוות רווה</span></a>
        {nav.map((i) => <a key={i.path} href={'/app' + (i.path === '/' ? '' : i.path)} aria-current={isCurrent(i, route) ? 'page' : undefined} onClick={(e) => { e.preventDefault(); navigate(i.path); }}><Icon name={i.icon} />{i.label}{i.badge ? <span className="badge">{i.badge}</span> : null}</a>)}
        {profile && !nav.some((i) => i.path === '/more') && <a className="rail-more" href="/app/more" aria-current={route === '/more' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); navigate('/more'); }}><Icon name="user" />{profile.displayName}</a>}
      </aside>
      <main className="screen">
        {!online && <div className="offline-strip" style={{ marginTop: 12 }}><Icon name="wifiOff" size={18} />אין קליטה. מה שתעשו יישמר בטלפון ויישלח כשתחזור הרשת.</div>}
        {banner}
        {children}
      </main>
      <Nav route={route} items={nav} />
    </div>
  );
}

// ---------- "complete your details" prompt ----------
function ProfilePrompt({ profile, settings }: { profile: Profile; settings: Settings }) {
  const missing = settings.registrationFields.filter((f) => !(profile.fields?.[f.id] || '').trim());
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem('farm-prompt-dismissed') === '1'; } catch { return false; } });
  const toast = useToast();
  if (!missing.length || dismissed) return null;
  const required = missing.some((f) => f.required);
  return (
    <>
      <div className="offline-strip" style={{ background: 'var(--cream)', color: 'var(--green)', marginTop: 12, cursor: 'pointer' }} onClick={() => setOpen(true)} role="button"><Icon name="user" size={18} />{required ? 'חסרים כמה פרטים בפרופיל שלכם.' : 'רוצים להשלים כמה פרטים? לוקח רגע.'}<span style={{ marginInlineStart: 'auto', fontWeight: 600 }}>השלמה</span></div>
      <Sheet open={open} onClose={() => setOpen(false)} title="השלמת פרטים">
        {missing.map((f) => <label className="field" key={f.id}><span>{f.label}{f.required ? ' *' : ''}</span>{f.type === 'choice' ? <select value={vals[f.id] || ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })}><option value="">בחירה…</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select> : <input type={f.type === 'date' ? 'date' : 'text'} dir={f.type === 'date' ? 'ltr' : undefined} value={vals[f.id] || ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} />}</label>)}
        <div className="sheet-foot"><Button kind="primary" onClick={async () => { try { await updateDoc(doc(db, 'users', profile.uid), { fields: { ...(profile.fields || {}), ...vals }, updatedAt: new Date().toISOString() }); setOpen(false); toast({ text: 'תודה!' }, 2000); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>שמירה</Button><Button kind="quiet" onClick={() => { setOpen(false); setDismissed(true); try { sessionStorage.setItem('farm-prompt-dismissed', '1'); } catch {} }}>אחר כך</Button></div>
      </Sheet>
    </>
  );
}

// ---------- guest app: what anyone sees, signed in or not ----------
function GuestApp({ user, profile, settings }: { user: User | null; profile: Profile | null; settings: Settings }) {
  const route = useRoute();
  const online = useOnline();
  const ctx: GuestCtx = { user, profile, settings };
  const nav: NavItem[] = [{ path: '/', icon: 'home', label: 'בית', match: (r) => r === '/' || r.startsWith('/events') || r === '/visit' || r === '/donate' }, { path: '/me', icon: 'user', label: 'האזור שלי' }, { path: '/more', icon: 'more', label: 'עוד' }];
  const screen = (() => {
    if (route.startsWith('/events/')) return <EventScreen id={route.split('/')[2]} ctx={ctx} />;
    if (route === '/me') return <MyArea ctx={ctx} />;
    if (route === '/visit') return <VisitScreen ctx={ctx} />;
    if (route === '/donate') return <DonateScreen ctx={ctx} />;
    if (route === '/terms') return <TermsScreen />;
    if (route === '/more') return profile ? <MoreScreen profile={profile} manager={false} /> : <GuestMore />;
    return <GuestHome ctx={ctx} />;
  })();
  return <Shell nav={nav} online={online} profile={profile} banner={profile && route === '/' && <ProfilePrompt profile={profile} settings={settings} />}>{screen}</Shell>;
}
function GuestMore() {
  return (
    <>
      <header className="topbar"><div><h1>עוד</h1></div></header>
      <div className="menu">
        <a href="/app/me" onClick={(e) => { e.preventDefault(); navigate('/me'); }}><Icon name="user" /><div>כניסה לחשבון<small>כרטיסים, ביקורים ותרומות</small></div><Icon name="chev" className="chev" size={18} /></a>
        <a href="/app/terms" onClick={(e) => { e.preventDefault(); navigate('/terms'); }}><Icon name="info" /><div>תנאי שימוש ופרטיות</div><Icon name="chev" className="chev" size={18} /></a>
        <a href="/"><Icon name="home" /><div>האתר של החווה</div><Icon name="chev" className="chev" size={18} /></a>
      </div>
    </>
  );
}

// ---------- team app ----------
function TeamApp({ user, profile, settings }: { user: User; profile: Profile; settings: Settings }) {
  const route = useRoute();
  const online = useOnline();
  const manager = canManage(profile, user.email);
  const owner = isOwner(profile, user.email);
  const actor = useMemo(() => actorOf(user, profile), [user.uid, profile.displayName]);
  const open = useOpenTasks(true, manager);
  const recent = useRecentDoneTasks(true, manager);
  const shopping = useOpenShopping(true);
  const bought = useRecentBought(true);
  const templates = useTemplates(true, manager);
  const places = usePlaces(true);
  const events = useAllEvents(true);
  const inbox = useNotifications(manager);
  const people = usePeople(manager);
  const visits = useVisits(manager);
  const today = todayKey();
  const calToday = useCalendar(manager, today, today);
  const ctx = useMemo(() => ({ actor, manager, owner, profile, places: places.items, templates: templates.items, team: people.items, fields: settings.registrationFields, settings }), [actor, manager, owner, profile, places.items, templates.items, people.items, settings]);
  const guestCtx: GuestCtx = { user, profile, settings };

  const materialized = useRef('');
  useEffect(() => {
    if (templates.loading || !templates.items.length) return;
    const key = new Date().toDateString() + templates.items.map((t) => t.id + t.updatedAt).join();
    if (materialized.current === key) return;
    materialized.current = key;
    materializeToday(templates.items, actor);
  }, [templates.items, templates.loading, actor]);

  const visitsNew = visits.items.filter((v) => v.status === 'new').length;
  const inboxCount = inbox.items.length;
  const myOpen = open.items.filter((t) => t.assignee?.uid === actor.uid).length;
  const nav: NavItem[] = [
    { path: '/', icon: 'home', label: 'היום' },
    { path: '/tasks', icon: 'list', label: 'משימות', badge: myOpen || undefined, match: (r) => r === '/tasks' || r.startsWith('/history') },
    { path: '/shopping', icon: 'cart', label: 'קניות', badge: shopping.items.filter((i) => i.urgent).length || undefined },
    { path: '/events-staff', icon: 'camera', label: 'אירועים' },
    manager ? { path: '/manage', icon: 'people', label: 'ניהול', badge: inboxCount + visitsNew, match: (r) => r.startsWith('/manage') || r === '/inbox' } : { path: '/more', icon: 'more', label: 'עוד' },
  ];
  const todayScreen = <TodayScreen profile={profile} open={open.items} recent={recent.items} shoppingCount={shopping.items.length} urgentShopping={shopping.items.filter((i) => i.urgent).length} ctx={ctx} loading={open.loading} events={events.items} calendarToday={calToday.items} inboxCount={inboxCount} manager={manager} />;
  const screen = (() => {
    if (route === '/') return todayScreen;
    if (route === '/tasks') return <TasksScreen open={open.items} recent={recent.items} ctx={ctx} loading={open.loading} />;
    if (route.startsWith('/history')) return <HistoryScreen ctx={ctx} tab={(route.split('/')[2] as any) || 'tasks'} />;
    if (route.startsWith('/shopping')) return <ShoppingScreen open={shopping.items} recent={bought.items} ctx={ctx} loading={shopping.loading} />;
    if (route === '/events-staff' || route === '/event-day' || route === '/scan' || route === '/stall') return <StaffEventsScreen ctx={ctx} />;
    if (route.startsWith('/events-staff/')) return <StaffEventHub id={route.split('/')[2]} tab={(route.split('/')[3] as any) || 'scan'} ctx={ctx} />;
    if (route === '/more') return <MoreScreen profile={profile} manager={manager} />;
    if (route === '/terms') return <TermsScreen />;
    if (route === '/me') return <MyArea ctx={guestCtx} />;
    if (route.startsWith('/events/')) return <EventScreen id={route.split('/')[2]} ctx={guestCtx} />;
    if (route === '/visit') return <VisitScreen ctx={guestCtx} />;
    if (route === '/donate') return <DonateScreen ctx={guestCtx} />;
    if (route === '/guest') return <GuestHome ctx={guestCtx} />;
    if (!manager) return todayScreen;
    if (route === '/inbox') return <InboxScreen ctx={ctx} />;
    if (route === '/manage') return <ManageHomeScreen inbox={inboxCount} pending={0} visitsNew={visitsNew} />;
    if (route === '/manage/people' || route === '/manage/templates' || route === '/manage/places') return <ManageScreen ctx={ctx} tab={route.split('/')[2] as any} />;
    if (route === '/manage/events') return <EventsListScreen ctx={ctx} />;
    if (route.startsWith('/manage/events/')) return <EventHubScreen id={route.split('/')[3]} ctx={ctx} tab={(route.split('/')[4] as any) || 'info'} />;
    if (route === '/manage/visits') return <VisitsScreen ctx={ctx} />;
    if (route === '/manage/donations') return <DonationsScreen ctx={ctx} />;
    if (route === '/manage/calendar') return <CalendarScreen ctx={ctx} />;
    if (route === '/manage/reports') return <ReportsScreen ctx={ctx} />;
    if (route === '/manage/activity') return <ActivityFeedScreen ctx={ctx} />;
    if (route === '/manage/settings') return <SettingsScreen ctx={ctx} />;
    return todayScreen;
  })();

  return (
    <Shell nav={nav} online={online} profile={profile} banner={<>{open.error && <div className="offline-strip"><Icon name="info" size={18} />{open.error.includes('index') ? 'המערכת עדיין מתכוננת (אינדקסים). נסו שוב בעוד דקה.' : open.error}</div>}{route === '/' && <ProfilePrompt profile={profile} settings={settings} />}</>}>
      {screen}
    </Shell>
  );
}

function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return (
    <div className="splash" role="status" aria-live="polite">
      <img src="/assets/rava-logo.png" alt="" />
      <div className="splash-title">חוות רווה</div>
      <div className="loading" style={{ minHeight: 0 }}>{slow ? 'זה לוקח יותר מהרגיל. בודקים חיבור…' : 'רגע…'}</div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, missing } = useProfile(user);
  const { settings } = useSettings();
  if (loading || (user && profileLoading)) return <Splash />;
  if (user && (missing || !profile)) return <ToastProvider><Onboarding user={user} /></ToastProvider>;
  if (user && profile && profile.status === 'blocked') return <ToastProvider><Blocked profile={profile} /></ToastProvider>;
  if (user && profile && isTeam(profile, user.email)) return <ToastProvider><TeamApp user={user} profile={profile} settings={settings} /></ToastProvider>;
  return <ToastProvider><GuestApp user={user} profile={profile} settings={settings} /></ToastProvider>;
}
