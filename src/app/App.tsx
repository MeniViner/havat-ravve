import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth, useProfile, canManage, isOwner, isTeam, actorOf, useOpenTasks, useRecentDoneTasks, useOpenShopping, useRecentBought, useTemplates, usePlaces, materializeToday, useOnline, usePeople } from './store';
import { useSettings, useNotifications, useVisits, useDonations, useAllEvents, useCalendar, useVendors } from './data';
import { useRoute, match, navigate } from './router';
import { Icon, ToastProvider, A, Avatar, useDesktop, usePageEnter, todayISO, addDays } from './ui';
import type { TeamCtx, GuestCtx } from './ctx';
import type { Profile, Settings } from './types';
import { ROLE_LABELS } from './types';
import type { Session } from './firebase';
import { useDemo, setDemo, PERSONA_LABELS, type Persona } from './demo/store';
import { TodayScreen } from './screens/Today';
import { TasksScreen, TaskDetail, TaskForm, TaskEditPage, HistoryScreen } from './screens/Tasks';
import { ShoppingScreen, ShopItemPage, ShopForm } from './screens/Shopping';
import { MoreScreen } from './screens/More';
import { StaffEventsScreen, ScanScreen, ScanSearchScreen, StallScreen, StallPickScreen, StallTabsScreen } from './screens/EventDay';
import { GuestHome, EventPage, OrderPage, LoginPage, OnboardingPage, BlockedPage, MyTicketsPage, VisitPage, DonatePage, GuestAccountPage, TermsPage } from './screens/Guest';
import { ManageHomeScreen, InboxScreen } from './screens/Manage';
import { EventsListScreen, EventEditor, EventHubScreen, EventGuestsScreen, EventEntryScreen, EventVendorsScreen, VendorsScreen, VendorEditor, EventProductsScreen, ProductEditor, EventTabsScreen, TabDetailScreen, EventReportScreen, EventFilesScreen, EventActivityScreen } from './screens/ManageEvents';
import { PeopleScreen, PersonScreen, InviteRoleScreen, TemplatesScreen, TemplateEditor, PlacesScreen, PlaceEditor } from './screens/ManagePeople';
import { VisitsScreen, VisitDetailScreen, DonationsScreen, DonationDetailScreen, CalendarScreen, CalendarAddScreen, ReportsScreen, ActivityScreen, SettingsScreen, SettingsPage, type SettingsPageKey } from './screens/ManageMore';

// ---------- navigation ----------
type NavItem = { path: string; icon: string; label: string; badge?: number; match?: (r: string) => boolean; sub?: boolean };
const isCurrent = (i: NavItem, route: string) => i.match ? i.match(route) : i.path === '/' ? route === '/' : route.startsWith(i.path);

function BottomNav({ route, items }: { route: string; items: NavItem[] }) {
  return <nav className="bottom" aria-label="ניווט ראשי"><div className="nav">{items.map((i) => <A key={i.path} to={i.path} className={isCurrent(i, route) ? 'on' : ''} aria-current={isCurrent(i, route) ? 'page' : undefined}><span className="ico"><Icon name={i.icon} /></span>{i.label}{i.badge ? <span className="badge">{i.badge > 99 ? '99+' : i.badge}</span> : null}</A>)}</div></nav>;
}
function Rail({ route, items, manage, profile, role }: { route: string; items: NavItem[]; manage?: NavItem[]; profile: Profile | null; role?: string }) {
  const meTo = profile && profile.role === 'guest' && !manage && items[0]?.label === 'בית' ? '/me/account' : '/more';
  return (
    <aside className="rail" aria-label="ניווט">
      <A className="brand" to="/"><img src="/assets/rava-logo.png" alt="" />חוות רווה</A>
      {items.map((i) => <A key={i.path} to={i.path} className={isCurrent(i, route) ? 'on' : ''}><Icon name={i.icon} />{i.label}{i.badge ? <span className="badge">{i.badge}</span> : null}</A>)}
      {manage && <><div className="group">ניהול</div>{manage.map((i) => <A key={i.path} to={i.path} className={'sub ' + (isCurrent(i, route) ? 'on' : '')}><Icon name={i.icon} />{i.label}{i.badge ? <span className="badge">{i.badge}</span> : null}</A>)}</>}
      <div className="foot">
        <a href="/" className="site"><Icon name="globe" />לאתר החווה</a>
        {profile
          ? <A to={meTo} className={'me ' + (route === meTo ? 'on' : '')} aria-label={`הפרופיל שלי: ${profile.displayName}, ${role || ROLE_LABELS[profile.role]}`}><Avatar name={profile.displayName} size="sm" /><span className="who"><b>{profile.displayName}</b><small>{role || ROLE_LABELS[profile.role]}</small></span></A>
          : <A to="/login" className="me"><Icon name="user" /><span className="who"><b>כניסה</b><small>עם חשבון Google</small></span></A>}
      </div>
    </aside>
  );
}
const PERSONAS: Persona[] = ['owner', 'manager', 'staff', 'guest', 'blocked', 'anon', 'real'];
/** The green bar that marks demo mode. Switching persona happens right here, from any screen. */
export function DemoStrip() {
  const demo = useDemo();
  const [open, setOpen] = useState(false);
  if (!demo.on) return null;
  const pick = (persona: Persona) => { setOpen(false); setDemo({ on: true, persona }); navigate('/', true); };
  return (
    <div className="demobar">
      <div className="strip demo"><Icon name="eye" size={16} /><span>מצב הדגמה · <b>{PERSONA_LABELS[demo.persona]}</b>{demo.persona === 'real' ? ' + נתוני דוגמה' : ''}</span><button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'סגירה' : 'החלפת דמות'}</button><button type="button" onClick={() => { setOpen(false); setDemo({ on: false }); navigate('/', true); }}>הסתרה</button></div>
      {open && <div className="demopick" role="group" aria-label="לעבור באפליקציה בתור">{PERSONAS.map((p) => <button key={p} type="button" className={'chip ' + (p === demo.persona ? 'on' : '')} aria-pressed={p === demo.persona} onClick={() => pick(p)}>{PERSONA_LABELS[p]}</button>)}</div>}
    </div>
  );
}

/** Phone: one screen at a time. Desktop: rail + content, and a detail page opens as a side panel next to its list. */
function Shell({ nav, manage, profile, role, online, master, detail, narrow, center }: { nav: NavItem[]; manage?: NavItem[]; profile: Profile | null; role?: string; online: boolean; master: ReactNode; detail?: ReactNode; narrow?: boolean; center?: boolean }) {
  const route = useRoute(); const desktop = useDesktop();
  const content = (
    <>
      {!online && <div className="strip" style={{ marginTop: 8 }}><Icon name="wifiOff" size={18} />אין קליטה. מה שתעשו יישמר בטלפון ויישלח כשתחזור הרשת.</div>}
      {desktop ? master : (detail ?? master)}
    </>
  );
  // phone: every navigation is a new page. desktop: opening a detail panel must not replay the list behind it.
  const base = route.split('/').slice(0, route.startsWith('/manage') ? 3 : 2).join('/');
  const pageRef = usePageEnter<HTMLDivElement>(desktop && detail ? base : route);
  const cls = desktop ? ['content screen', narrow && !detail ? 'narrow' : '', center && !detail ? 'center' : '', detail ? 'haspanel' : ''].filter(Boolean).join(' ') : 'screen';
  return (
    <div className="app">
      <Rail route={route} items={nav} manage={manage} profile={profile} role={role} />
      <div className="shellmain" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: desktop ? 'row' : 'column' }}>
        <div style={{ flex: 1, minWidth: 0 }}><DemoStrip /><main className={cls}><div ref={pageRef} className="page">{content}</div></main></div>
        {desktop && detail && <aside className="panel"><div className="screen page-in" key={route}>{detail}</div></aside>}
      </div>
      {!desktop && <BottomNav route={route} items={nav} />}
    </div>
  );
}

// ---------- guest app ----------
function GuestApp({ user, profile, settings }: { user: Session | null; profile: Profile | null; settings: Settings }) {
  const route = useRoute(); const online = useOnline();
  const ctx: GuestCtx = { user, profile, settings };
  const nav: NavItem[] = [{ path: '/', icon: 'home', label: 'בית', match: (r) => r === '/' || r.startsWith('/events') || r === '/visit' || r === '/donate' }, { path: '/me', icon: 'ticket', label: 'הכרטיסים שלי', match: (r) => r === '/me' }, { path: '/me/account', icon: 'user', label: 'החשבון שלי' }];
  const screen = guestRoutes(route, ctx) || <GuestHome ctx={ctx} />;
  return <Shell nav={nav} profile={profile} online={online} master={screen} narrow center />;
}
function guestRoutes(route: string, ctx: GuestCtx): ReactNode | null {
  let m: Record<string, string> | null;
  if (route === '/') return <GuestHome ctx={ctx} />;
  if ((m = match(route, '/events/:id/order'))) return <OrderPage id={m.id} ctx={ctx} />;
  if ((m = match(route, '/events/:id'))) return <EventPage id={m.id} ctx={ctx} />;
  if (route === '/login') return <LoginPage ctx={ctx} />;
  if (route === '/me') return <MyTicketsPage ctx={ctx} />;
  if (route === '/me/account') return <GuestAccountPage ctx={ctx} />;
  if (route === '/visit') return <VisitPage ctx={ctx} />;
  if (route === '/donate') return <DonatePage ctx={ctx} />;
  if (route === '/terms') return <TermsPage />;
  return null;
}

/** Single-column pages (forms, settings, a profile, an event-day screen) keep a readable width on a wide screen. */
const NARROW = /^\/(more|history|events-staff|scan|stall|me|terms|visit|donate|login|events)(\/|$)|^\/manage\/(settings(\/|$)|calendar\/new$)|^\/manage\/events\/(new$|[^/]+\/(edit|products\/[^/]+|tabs\/[^/]+)$)|^\/manage\/vendors\/[^/]+$/;

// ---------- team app ----------
function TeamApp({ user, profile, settings }: { user: Session; profile: Profile; settings: Settings }) {
  const route = useRoute(); const online = useOnline(); const desktop = useDesktop();
  const manager = canManage(profile, user.email); const owner = isOwner(profile, user.email);
  const actor = useMemo(() => actorOf(user, profile), [user.uid, profile.displayName]);
  const open = useOpenTasks(true, manager); const recent = useRecentDoneTasks(true, manager);
  const shopping = useOpenShopping(true); const bought = useRecentBought(true);
  const templates = useTemplates(true, manager); const places = usePlaces(true); const events = useAllEvents(true);
  const inbox = useNotifications(manager); const people = usePeople(true); const visits = useVisits(manager); const donations = useDonations(manager); const vendors = useVendors(manager);
  const today = todayISO(); const calendar = useCalendar(manager, today, addDays(today, 14));
  const ctx: TeamCtx = useMemo(() => ({ user, actor, profile, manager, owner, settings, places: places.items, templates: templates.items, team: people.items }), [user, actor, profile, manager, owner, settings, places.items, templates.items, people.items]);
  const guestCtx: GuestCtx = { user, profile, settings };

  const materialized = useRef('');
  useEffect(() => {
    if (templates.loading || !templates.items.length) return;
    const key = today + templates.items.map((t) => t.id + t.updatedAt).join();
    if (materialized.current === key) return; materialized.current = key;
    materializeToday(templates.items, actor);
  }, [templates.items, templates.loading, actor]);

  const myOpen = open.items.filter((t) => t.assignee?.uid === actor.uid).length;
  const nav: NavItem[] = [
    { path: '/', icon: 'home', label: 'היום' },
    { path: '/tasks', icon: 'list', label: 'משימות', badge: myOpen || undefined, match: (r) => r.startsWith('/tasks') || r.startsWith('/history') },
    { path: '/shopping', icon: 'cart', label: 'קניות', badge: shopping.items.filter((i) => i.urgent).length || undefined },
    manager && !desktop ? { path: '/manage', icon: 'people', label: 'ניהול', badge: inbox.items.length || undefined, match: (r) => r.startsWith('/manage') } : { path: '/events-staff', icon: 'qr', label: 'אירועים', match: (r) => r.startsWith('/events-staff') || r.startsWith('/scan') || r.startsWith('/stall') },
  ];
  const manageNav: NavItem[] | undefined = manager ? [
    { path: '/manage/inbox', icon: 'bell', label: 'לטיפול', badge: inbox.items.length || undefined },
    { path: '/manage/events', icon: 'ticket', label: 'אירועים' }, { path: '/manage/people', icon: 'people', label: 'אנשים' }, { path: '/manage/visits', icon: 'pin', label: 'ביקורים' },
    { path: '/manage/donations', icon: 'heart', label: 'תרומות' }, { path: '/manage/calendar', icon: 'calendar', label: 'יומן' }, { path: '/manage/reports', icon: 'chart', label: 'דוחות' }, { path: '/manage/settings', icon: 'sliders', label: 'הגדרות' },
  ] : undefined;

  const today_ = <TodayScreen ctx={ctx} open={open.items} recent={recent.items} shopping={shopping.items} events={events.items} calendar={calendar.items} inbox={inbox.items} loading={open.loading} />;
  const tasks = (sel?: string) => <TasksScreen ctx={ctx} open={open.items} recent={recent.items} loading={open.loading} selectedId={sel} />;
  const shop = (sel?: string) => <ShoppingScreen ctx={ctx} open={shopping.items} recent={bought.items} loading={shopping.loading} selectedId={sel} />;
  let m: Record<string, string> | null;
  const r = route;
  // master + optional detail (desktop shows both; phone shows the detail)
  let master: ReactNode = today_; let detail: ReactNode | undefined;
  if (r === '/') master = today_;
  else if (r === '/tasks') master = tasks();
  else if (r === '/tasks/new') { master = tasks(); detail = <TaskForm ctx={ctx} />; }
  else if ((m = match(r, '/tasks/:id/edit'))) { master = tasks(m.id); detail = <TaskEditPage id={m.id} ctx={ctx} />; }
  else if ((m = match(r, '/tasks/:id'))) { master = tasks(m.id); detail = <TaskDetail id={m.id} ctx={ctx} panel={desktop} />; }
  else if ((m = match(r, '/history/:tab')) || r === '/history') master = <HistoryScreen ctx={ctx} tab={((m?.tab as 'tasks' | 'shopping' | 'all') || 'tasks')} />;
  else if (r === '/shopping') master = shop();
  else if (r === '/shopping/new') { master = shop(); detail = <ShopForm ctx={ctx} />; }
  else if ((m = match(r, '/shopping/:id'))) { master = shop(m.id); detail = <ShopItemPage id={m.id} ctx={ctx} panel={desktop} />; }
  else if (r === '/more') master = <MoreScreen ctx={ctx} />;
  else if (r === '/events-staff') master = <StaffEventsScreen ctx={ctx} events={events.items} />;
  else if ((m = match(r, '/events-staff/:id'))) master = <StaffEventsScreen ctx={ctx} events={events.items} id={m.id} />;
  else if ((m = match(r, '/scan/:id/search'))) master = <ScanSearchScreen eventId={m.id} ctx={ctx} />;
  else if ((m = match(r, '/scan/:id'))) master = <ScanScreen eventId={m.id} ctx={ctx} />;
  else if ((m = match(r, '/stall/:id/pick'))) master = <StallPickScreen eventId={m.id} ctx={ctx} />;
  else if ((m = match(r, '/stall/:id/tabs'))) master = <StallTabsScreen eventId={m.id} ctx={ctx} />;
  else if ((m = match(r, '/stall/:id'))) master = <StallScreen eventId={m.id} ctx={ctx} />;
  else if (guestRoutes(r, guestCtx)) master = guestRoutes(r, guestCtx);
  else if (r.startsWith('/manage') && manager) {
    const mh = <ManageHomeScreen ctx={ctx} inbox={inbox.items} events={events.items} visits={visits.items} donations={donations.items} people={people.items} calendar={calendar.items} templatesCount={templates.items.filter((t) => t.active).length} placesCount={places.items.length} vendorsCount={vendors.items.length} />;
    if (r === '/manage') master = desktop ? <InboxScreen ctx={ctx} inbox={inbox.items} /> : mh;
    else if (r === '/manage/inbox') master = <InboxScreen ctx={ctx} inbox={inbox.items} />;
    else if (r === '/manage/events') master = <EventsListScreen ctx={ctx} />;
    else if (r === '/manage/events/new') master = <EventEditor ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/edit'))) master = <EventEditor id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/guests'))) master = <EventGuestsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/entry'))) master = <EventEntryScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/vendors'))) master = <EventVendorsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/products/new'))) master = <ProductEditor eventId={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/products/:pid'))) master = <ProductEditor eventId={m.id} pid={m.pid} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/products'))) master = <EventProductsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/tabs/:tid'))) master = <TabDetailScreen eventId={m.id} tid={m.tid} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/tabs'))) master = <EventTabsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/report'))) master = <EventReportScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/files'))) master = <EventFilesScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/activity'))) master = <EventActivityScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id'))) master = <EventHubScreen id={m.id} ctx={ctx} />;
    else if (r === '/manage/vendors') master = <VendorsScreen ctx={ctx} />;
    else if (r === '/manage/vendors/new') master = <VendorEditor ctx={ctx} />;
    else if ((m = match(r, '/manage/vendors/:id'))) master = <VendorEditor id={m.id} ctx={ctx} />;
    else if (r === '/manage/people') master = <PeopleScreen ctx={ctx} people={people.items} />;
    else if (r === '/manage/people/invite') { master = <PeopleScreen ctx={ctx} people={people.items} />; detail = <InviteRoleScreen ctx={ctx} />; }
    else if ((m = match(r, '/manage/people/:uid'))) { master = <PeopleScreen ctx={ctx} people={people.items} selectedId={m.uid} />; detail = <PersonScreen uid={m.uid} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/templates') master = <TemplatesScreen ctx={ctx} />;
    else if (r === '/manage/templates/new') { master = <TemplatesScreen ctx={ctx} />; detail = <TemplateEditor ctx={ctx} />; }
    else if ((m = match(r, '/manage/templates/:id'))) { master = <TemplatesScreen ctx={ctx} selectedId={m.id} />; detail = <TemplateEditor id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/places') master = <PlacesScreen ctx={ctx} open={open.items} />;
    else if ((m = match(r, '/manage/places/:id'))) { master = <PlacesScreen ctx={ctx} open={open.items} selectedId={m.id} />; detail = <PlaceEditor id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/visits') master = <VisitsScreen ctx={ctx} visits={visits.items} />;
    else if ((m = match(r, '/manage/visits/:id'))) { master = <VisitsScreen ctx={ctx} visits={visits.items} selectedId={m.id} />; detail = <VisitDetailScreen id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/donations') master = <DonationsScreen ctx={ctx} donations={donations.items} />;
    else if ((m = match(r, '/manage/donations/:id'))) { master = <DonationsScreen ctx={ctx} donations={donations.items} selectedId={m.id} />; detail = <DonationDetailScreen id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/calendar') master = <CalendarScreen ctx={ctx} />;
    else if (r === '/manage/calendar/new') master = <CalendarAddScreen ctx={ctx} />;
    else if (r === '/manage/reports') master = <ReportsScreen ctx={ctx} />;
    else if (r === '/manage/activity') master = <ActivityScreen ctx={ctx} />;
    else if (r === '/manage/settings') master = <SettingsScreen ctx={ctx} />;
    else if ((m = match(r, '/manage/settings/:page'))) master = <SettingsPage ctx={ctx} page={m.page as SettingsPageKey} />;
    else master = mh;
  }
  const banner = open.error ? <div className="strip rust"><Icon name="info" size={18} />{open.error.includes('index') ? 'המערכת עדיין מתכוננת (אינדקסים). נסו שוב בעוד דקה.' : open.error}</div> : null;
  return <Shell nav={nav} manage={manageNav} profile={profile} role={owner ? ROLE_LABELS.owner : manager ? ROLE_LABELS.manager : ROLE_LABELS[profile.role]} online={online} master={<>{banner}{master}</>} detail={detail} narrow={NARROW.test(r)} />;
}

function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return <div className="splash" role="status" aria-live="polite"><img src="/assets/rava-logo.png" alt="" /><div className="title">חוות רווה</div><div>{slow ? 'זה לוקח יותר מהרגיל. בודקים חיבור…' : 'רגע…'}</div></div>;
}

export default function App() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, missing } = useProfile(user);
  const { settings } = useSettings();
  const demo = useDemo();
  // the public site (same origin) reads this to show who is signed in. Real accounts only, never a demo persona.
  useEffect(() => {
    if (loading || profileLoading || (demo.on && demo.persona !== 'real')) return;
    try {
      if (user && profile) localStorage.setItem('farm-me', JSON.stringify({ name: profile.displayName, role: isOwner(profile, user.email) ? ROLE_LABELS.owner : ROLE_LABELS[profile.role] }));
      else if (!user) localStorage.removeItem('farm-me');
    } catch { /* private mode */ }
  }, [loading, profileLoading, user?.uid, profile?.displayName, profile?.role, demo.on, demo.persona]);
  if (loading || (user && profileLoading)) return <Splash />;
  if (user && (missing || !profile)) return <ToastProvider><DemoStrip /><OnboardingPage user={user} /></ToastProvider>;
  if (user && profile && profile.status === 'blocked') return <ToastProvider><DemoStrip /><BlockedPage profile={profile} /></ToastProvider>;
  if (user && profile && isTeam(profile, user.email)) return <ToastProvider><TeamApp user={user} profile={profile} settings={settings} /></ToastProvider>;
  return <ToastProvider><GuestApp user={user} profile={profile} settings={settings} /></ToastProvider>;
}
