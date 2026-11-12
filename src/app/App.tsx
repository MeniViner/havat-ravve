import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth, useProfile, canManage, isOwner, isTeam, actorOf, useOpenTasks, useRecentDoneTasks, useOpenShopping, useRecentBought, useTemplates, usePlaces, materializeToday, useTodayInstances, useToday, useOnline, usePeople, useTeam } from './store';
import { useSettings, useNotifications, useVisits, useDonations, useAllEvents, useCalendar, useVendors } from './data';
import { useRoute, match, navigate, back, depth } from './router';
import { useSync } from './db';
import { Icon, ToastProvider, useToast, A, useDesktop, addDays } from './ui';
import { Guard, Empty, Head, Btn, isHidden, useHiddenVersion } from './kit';
import type { TeamCtx, GuestCtx } from './ctx';
import type { Profile, Settings } from './types';
import { ROLE_LABELS } from './types';
import type { Session } from './firebase';
import { useDemo, setDemo, PERSONA_LABELS, type Persona } from './demo/store';
import { TodayScreen } from './screens/Today';
import { TasksScreen, TaskDetail, HistoryScreen } from './screens/Tasks';
import { NewScreen, TaskEditScreen } from './screens/New';
import { ShoppingScreen, ShopItemScreen } from './screens/Shopping';
import { MeScreen } from './screens/Me';
import { StaffEventsScreen, ScanScreen, ScanSearchScreen, StallScreen, StallPickScreen, StallTabsScreen } from './screens/EventDay';
import { GuestHome, EventPage, OrderPage, LoginPage, OnboardingPage, BlockedPage, MyTicketsPage, VisitPage, DonatePage, GuestAccountPage, TermsPage } from './screens/Guest';
import { ManageHomeScreen, InboxScreen } from './screens/Manage';
import { EventsListScreen, EventEditor, EventHubScreen, EventGuestsScreen, EventEntryScreen, EventVendorsScreen, VendorsScreen, VendorEditor, EventProductsScreen, ProductEditor, EventTabsScreen, TabDetailScreen, EventReportScreen, EventFilesScreen, EventActivityScreen } from './screens/ManageEvents';
import { PeopleScreen, PersonScreen, InviteRoleScreen, TemplatesScreen, TemplateEditor, PlacesScreen, PlaceEditor } from './screens/ManagePeople';
import { VisitsScreen, VisitDetailScreen, DonationsScreen, DonationDetailScreen, CalendarScreen, CalendarAddScreen, ReportsScreen, ActivityScreen, SettingsScreen, SettingsPage, type SettingsPageKey } from './screens/ManageMore';

// ---------- navigation: words, not icons ----------
type NavItem = { path: string; label: string; badge?: number; match?: (r: string) => boolean; plus?: boolean };
const isCurrent = (i: NavItem, route: string) => (i.match ? i.match(route) : i.path === '/' ? route === '/' : route.startsWith(i.path));
const Count = ({ n }: { n?: number }) => (n ? <span className="r-n">{n > 99 ? '99+' : n}</span> : null);

function Bar({ route, items }: { route: string; items: NavItem[] }) {
  return (
    <div className="r-bar"><nav aria-label="ניווט ראשי">
      {items.map((i) => i.plus
        ? <A key="plus" to={i.path} className="r-plus" aria-label="הוספה: משימה או פריט לקניות"><span><Icon name="plus" /></span></A>
        : <A key={i.path} to={i.path} aria-current={isCurrent(i, route) ? 'page' : undefined}>{i.label}<Count n={i.badge} /></A>)}
    </nav></div>
  );
}
function Rail({ route, items, manage, profile, role, plus }: { route: string; items: NavItem[]; manage?: NavItem[]; profile: Profile | null; role?: string; plus?: string }) {
  const guestRail = !plus;
  const link = (i: NavItem) => <A key={i.path} to={i.path} aria-current={isCurrent(i, route) ? 'page' : undefined}>{i.label}<Count n={i.badge} /></A>;
  return (
    <aside className="r-rail" aria-label="ניווט">
      <A className="r-brand" to="/">חוות רווה<small>{guestRail ? 'ליד טנא עומרים' : 'לוח החווה'}</small></A>
      {plus && <A className="r-new" to={plus}><Icon name="plus" />חדש</A>}
      <nav aria-label="ניווט ראשי">{items.filter((i) => !i.plus).map(link)}</nav>
      {manage && <><div className="r-group">ניהול</div><nav aria-label="ניהול">{manage.map(link)}</nav></>}
      <div className="r-foot">
        {profile ? <A to={guestRail ? '/me/account' : '/more'}><b>{profile.displayName}</b>{role || ROLE_LABELS[profile.role]}</A> : <A to="/login"><b>כניסה</b>עם חשבון Google</A>}
        <a href="/">לאתר החווה</a>
      </div>
    </aside>
  );
}

const PERSONAS: Persona[] = ['owner', 'manager', 'staff', 'guest', 'blocked', 'anon'];
/** Marks demo mode on every screen, and switches the example person from here. */
export function DemoStrip() {
  const demo = useDemo();
  if (!demo.on) return null;
  return (
    <div className="r-demo">
      <label>הדגמה, בתור <select aria-label="לעבור בתור" value={demo.persona} onChange={(e) => { setDemo({ on: true, persona: e.target.value as Persona }); navigate('/', true); }}>{PERSONAS.map((p) => <option key={p} value={p}>{PERSONA_LABELS[p]}</option>)}</select></label>
      <button type="button" onClick={() => { setDemo({ on: false }); navigate('/', true); }}>יציאה</button>
    </div>
  );
}
/** Reception and unsent work, in one quiet line. Nothing is shown while everything is in order. */
function Status({ online }: { online: boolean }) {
  const sync = useSync(); const toast = useToast();
  useEffect(() => { if (sync.failure) toast({ text: `פעולה אחת לא נשמרה: ${sync.failure.text}`, kind: 'error' }, 8000); }, [sync.failure?.id]);
  if (online) return null;
  return <div className="r-status" role="status">אין קליטה. הכל נשמר בטלפון ויישלח לבד{sync.pending > 0 && <b>· {sync.pending} מחכים</b>}</div>;
}

/** Routes of the rebuilt screens. Everything else still renders with the previous interface inside the new frame. */
const REBUILT = /^\//; // every route now; the legacy frame classes go away with the last old screen
/** Single-column pages keep a readable width on a wide screen. */
const NARROW = /^\/(more|new|history|events-staff|scan|stall|me|terms|visit|donate|login|events)(\/|$)|^\/manage\/(settings(\/|$)|calendar\/new$)|^\/manage\/events\/(new$|[^/]+\/(edit|products\/[^/]+|tabs\/[^/]+)$)|^\/manage\/vendors\/[^/]+$/;

/** Phone: one screen at a time. Desktop: rail + content, and a detail page opens as a side panel next to its list. */
function Shell({ nav, manage, profile, role, online, master, detail, plus, center }: { nav: NavItem[]; manage?: NavItem[]; profile: Profile | null; role?: string; online: boolean; master: ReactNode; detail?: ReactNode; plus?: string; center?: boolean }) {
  const route = useRoute(); const desktop = useDesktop();
  const rebuilt = REBUILT.test(route); const narrow = NARROW.test(route);
  const base = route.split('/').slice(0, route.startsWith('/manage') ? 3 : 2).join('/') || '/';
  // which way the page moves: deeper slides in from the left, back from the right
  const last = useRef(depth()); const now = depth();
  const dir = now < last.current ? ' backward' : '';
  useEffect(() => { last.current = now; });
  useEffect(() => {
    if (!desktop || !detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) back(base); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [desktop, !!detail, base]);
  const body = desktop ? master : (detail ?? master);
  const mainClass = rebuilt
    ? ['r-main', narrow && !detail ? 'narrow' : ''].filter(Boolean).join(' ')
    : desktop ? ['r-main content screen', narrow && !detail ? 'narrow' : '', center && !detail ? 'center' : '', detail ? 'haspanel' : ''].filter(Boolean).join(' ') : 'r-main screen';
  return (
    <div className="r-app">
      <Rail route={route} items={nav} manage={manage} profile={profile} role={role} plus={plus} />
      <div className="r-work">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Status online={online} /><DemoStrip />
          <main className={mainClass}><Guard resetKey={route}><div key={desktop && detail ? base : route} className={'r-page' + dir}>{body}</div></Guard></main>
        </div>
        {desktop && detail && <aside className={rebuilt ? 'r-side' : 'r-side panel'} aria-label="פרטים"><Guard resetKey={route}><div key={route} className={'r-page' + (rebuilt ? '' : ' screen')}>{detail}</div></Guard></aside>}
      </div>
      {!desktop && <Bar route={route} items={nav} />}
    </div>
  );
}
const NotFound = ({ to = '/' }: { to?: string }) => <><Head title="הדף לא נמצא" /><Empty title="אין כאן כלום">ייתכן שהקישור ישן, או שאין לך הרשאה למסך הזה.</Empty><div className="r-actions"><Btn to={to}>לדף הראשי</Btn></div></>;

// ---------- guest app ----------
function GuestApp({ user, profile, settings }: { user: Session | null; profile: Profile | null; settings: Settings }) {
  const route = useRoute(); const online = useOnline();
  const ctx: GuestCtx = { user, profile, settings };
  const nav: NavItem[] = [{ path: '/', label: 'בית', match: (r) => r === '/' || r.startsWith('/events') || r === '/visit' || r === '/donate' }, { path: '/me', label: 'הכרטיסים שלי', match: (r) => r === '/me' }, { path: '/me/account', label: 'החשבון שלי' }];
  const screen = guestRoutes(route, ctx) || <NotFound />;
  return <Shell nav={nav} profile={profile} online={online} master={screen} center />;
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


// ---------- team app ----------
function TeamApp({ user, profile, settings }: { user: Session; profile: Profile; settings: Settings }) {
  const route = useRoute(); const online = useOnline(); const desktop = useDesktop();
  const manager = canManage(profile, user.email); const owner = isOwner(profile, user.email);
  const actor = useMemo(() => actorOf(user, profile), [user.uid, profile.displayName]);
  const today = useToday(); useHiddenVersion();
  const openAll = useOpenTasks(true, manager); const recent = useRecentDoneTasks(true, manager);
  const shoppingAll = useOpenShopping(true); const bought = useRecentBought(true);
  const templates = useTemplates(true, manager); const places = usePlaces(true); const events = useAllEvents(true);
  const team = useTeam(true); const people = usePeople(manager);
  const inbox = useNotifications(manager); const visits = useVisits(manager); const donations = useDonations(manager); const vendors = useVendors(manager);
  const calendar = useCalendar(manager, today, addDays(today, 14));
  const instances = useTodayInstances(true, manager, today);
  // yesterday's unticked chores are not today's work; records waiting out their undo window are already gone for the user
  const open = useMemo(() => ({ ...openAll, items: openAll.items.filter((t) => !isHidden(t.id) && !(t.templateId && t.dateKey && t.dateKey < today)) }), [openAll, today, isHidden]);
  const shopping = { ...shoppingAll, items: shoppingAll.items.filter((i) => !isHidden(i.id)) };
  const ctx: TeamCtx = useMemo(() => ({ user, actor, profile, manager, owner, settings, places: places.items, templates: templates.items, team: team.items }), [user, actor, profile, manager, owner, settings, places.items, templates.items, team.items]);
  const guestCtx: GuestCtx = { user, profile, settings };

  useEffect(() => {
    if (templates.loading || instances.loading || instances.error || !templates.items.length) return;
    materializeToday(templates.items, instances.items, actor, today);
  }, [today, templates.items, templates.loading, instances.loading, instances.items.length, instances.error, actor]);

  const mineCount = open.items.filter((t) => t.assignee?.uid === actor.uid).length;
  const onShop = route.startsWith('/shopping') || route.startsWith('/history/shopping');
  const plus = onShop ? '/new?k=shop' : '/new';
  const nav: NavItem[] = [
    { path: '/', label: 'היום' },
    { path: '/tasks', label: 'משימות', badge: mineCount || undefined, match: (r) => r.startsWith('/tasks') || r === '/history' },
    { path: plus, label: 'הוספה', plus: true },
    { path: '/shopping', label: 'קניות', match: (r) => r.startsWith('/shopping') || r.startsWith('/history/shopping') },
    manager && !desktop ? { path: '/manage', label: 'ניהול', badge: inbox.items.length || undefined, match: (r) => r.startsWith('/manage') } : { path: '/events-staff', label: desktop ? 'יום אירוע' : 'אירועים', match: (r) => r.startsWith('/events-staff') || r.startsWith('/scan') || r.startsWith('/stall') },
  ];
  const manageNav: NavItem[] | undefined = manager ? [
    { path: '/manage/inbox', label: 'לטיפול', badge: inbox.items.length || undefined, match: (r) => r === '/manage' || r.startsWith('/manage/inbox') },
    { path: '/manage/events', label: 'אירועים' }, { path: '/manage/people', label: 'אנשים' }, { path: '/manage/visits', label: 'ביקורים' },
    { path: '/manage/donations', label: 'תרומות' }, { path: '/manage/calendar', label: 'יומן' }, { path: '/manage/templates', label: 'משימות חוזרות' }, { path: '/manage/places', label: 'מקומות' },
    { path: '/manage/vendors', label: 'בעלי דוכנים' }, { path: '/manage/reports', label: 'דוחות' }, { path: '/manage/activity', label: 'כל הפעילות' }, { path: '/manage/settings', label: 'הגדרות' },
  ] : undefined;

  const today_ = <TodayScreen ctx={ctx} open={open.items} recent={recent.items} shopping={shopping.items} events={events.items} inbox={inbox.items} loading={open.loading} />;
  const tasks = (sel?: string) => <TasksScreen ctx={ctx} open={open.items} recent={recent.items} loading={open.loading} selectedId={sel} />;
  const shop = (sel?: string) => <ShoppingScreen ctx={ctx} open={shopping.items} recent={bought.items} loading={shopping.loading} selectedId={sel} />;
  let m: Record<string, string> | null;
  const r = route;
  // master + optional detail (desktop shows both; phone shows the detail)
  let master: ReactNode = <NotFound />; let detail: ReactNode | undefined;
  if (r === '/') master = today_;
  else if (r === '/tasks') master = tasks();
  else if (r === '/new' || r === '/tasks/new' || r === '/shopping/new') master = <NewScreen ctx={ctx} />;
  else if ((m = match(r, '/tasks/:id/edit'))) { master = tasks(m.id); detail = <TaskEditScreen id={m.id} ctx={ctx} />; }
  else if ((m = match(r, '/tasks/:id'))) { master = tasks(m.id); detail = <TaskDetail id={m.id} ctx={ctx} />; }
  else if (r === '/history' || r === '/history/tasks') master = <HistoryScreen ctx={ctx} tab="tasks" />;
  else if (r === '/history/shopping') master = <HistoryScreen ctx={ctx} tab="shopping" />;
  else if (r === '/shopping') master = shop();
  else if ((m = match(r, '/shopping/:id'))) { master = shop(m.id); detail = <ShopItemScreen id={m.id} ctx={ctx} />; }
  else if (r === '/more') master = <MeScreen ctx={ctx} />;
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
    else if ((m = match(r, '/manage/events/:id/edit'))) master = <EventEditor key={m.id} id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/guests'))) master = <EventGuestsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/entry'))) master = <EventEntryScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/vendors'))) master = <EventVendorsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/products/new'))) master = <ProductEditor eventId={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/products/:pid'))) master = <ProductEditor key={m.id + '/' + m.pid} eventId={m.id} pid={m.pid} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/products'))) master = <EventProductsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/tabs/:tid'))) master = <TabDetailScreen key={m.tid} eventId={m.id} tid={m.tid} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/tabs'))) master = <EventTabsScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/report'))) master = <EventReportScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/files'))) master = <EventFilesScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id/activity'))) master = <EventActivityScreen id={m.id} ctx={ctx} />;
    else if ((m = match(r, '/manage/events/:id'))) master = <EventHubScreen id={m.id} ctx={ctx} />;
    else if (r === '/manage/vendors') master = <VendorsScreen ctx={ctx} />;
    else if (r === '/manage/vendors/new') master = <VendorEditor ctx={ctx} />;
    else if ((m = match(r, '/manage/vendors/:id'))) master = <VendorEditor key={m.id} id={m.id} ctx={ctx} />;
    else if (r === '/manage/people') master = <PeopleScreen ctx={ctx} people={people.items} />;
    else if (r === '/manage/people/invite') { master = <PeopleScreen ctx={ctx} people={people.items} />; detail = <InviteRoleScreen ctx={ctx} />; }
    else if ((m = match(r, '/manage/people/:uid'))) { master = <PeopleScreen ctx={ctx} people={people.items} selectedId={m.uid} />; detail = <PersonScreen key={m.uid} uid={m.uid} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/templates') master = <TemplatesScreen ctx={ctx} />;
    else if (r === '/manage/templates/new') { master = <TemplatesScreen ctx={ctx} />; detail = <TemplateEditor ctx={ctx} />; }
    else if ((m = match(r, '/manage/templates/:id'))) { master = <TemplatesScreen ctx={ctx} selectedId={m.id} />; detail = <TemplateEditor key={m.id} id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/places') master = <PlacesScreen ctx={ctx} open={open.items} />;
    else if ((m = match(r, '/manage/places/:id'))) { master = <PlacesScreen ctx={ctx} open={open.items} selectedId={m.id} />; detail = <PlaceEditor key={m.id} id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/visits') master = <VisitsScreen ctx={ctx} visits={visits.items} />;
    else if ((m = match(r, '/manage/visits/:id'))) { master = <VisitsScreen ctx={ctx} visits={visits.items} selectedId={m.id} />; detail = <VisitDetailScreen key={m.id} id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/donations') master = <DonationsScreen ctx={ctx} donations={donations.items} />;
    else if ((m = match(r, '/manage/donations/:id'))) { master = <DonationsScreen ctx={ctx} donations={donations.items} selectedId={m.id} />; detail = <DonationDetailScreen key={m.id} id={m.id} ctx={ctx} panel={desktop} />; }
    else if (r === '/manage/calendar') master = <CalendarScreen ctx={ctx} />;
    else if (r === '/manage/calendar/new') master = <CalendarAddScreen ctx={ctx} />;
    else if (r === '/manage/reports') master = <ReportsScreen ctx={ctx} />;
    else if (r === '/manage/activity') master = <ActivityScreen ctx={ctx} />;
    else if (r === '/manage/settings') master = <SettingsScreen ctx={ctx} />;
    else if ((m = match(r, '/manage/settings/:page'))) master = <SettingsPage ctx={ctx} page={m.page as SettingsPageKey} />;
    else master = <NotFound to="/manage" />;
  }
  const banner = open.error ? <div className="r-status" role="alert">המשימות לא נטענו: {open.error}</div> : null;
  return <Shell nav={nav} manage={manageNav} profile={profile} role={owner ? ROLE_LABELS.owner : manager ? ROLE_LABELS.manager : ROLE_LABELS[profile.role]} online={online} master={<>{banner}{master}</>} detail={detail} plus={plus} />;
}

function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return <div className="r-splash" role="status" aria-live="polite"><img src="/assets/rava-logo.png" alt="" /><b>חוות רווה</b><div>{slow ? 'זה לוקח יותר מהרגיל. בודקים חיבור…' : 'רגע…'}</div></div>;
}

export default function App() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, missing, error: profileError } = useProfile(user);
  const { settings } = useSettings();
  const demo = useDemo();
  // the public site (same origin) reads this to show who is signed in. Real accounts only, never a demo persona.
  useEffect(() => {
    if (loading || profileLoading || demo.on) return;
    try {
      if (user && profile) localStorage.setItem('farm-me', JSON.stringify({ name: profile.displayName, role: isOwner(profile, user.email) ? ROLE_LABELS.owner : ROLE_LABELS[profile.role] }));
      else if (!user) localStorage.removeItem('farm-me');
    } catch { /* private mode */ }
  }, [loading, profileLoading, user?.uid, profile?.displayName, profile?.role, demo.on, demo.persona]);
  if (loading || (user && profileLoading)) return <Splash />;
  if (user && !profile && profileError) return <div className="r-app"><div className="r-crash" role="alert"><h1>לא הצלחנו לטעון את החשבון</h1><p>{profileError}. הנתונים שלך לא נפגעו.</p><Btn onClick={() => location.reload()}>לנסות שוב</Btn></div></div>;
  if (user && (missing || !profile)) return <ToastProvider><DemoStrip /><OnboardingPage user={user} /></ToastProvider>;
  if (user && profile && profile.status === 'blocked') return <ToastProvider><DemoStrip /><BlockedPage profile={profile} /></ToastProvider>;
  if (user && profile && isTeam(profile, user.email)) return <ToastProvider><TeamApp user={user} profile={profile} settings={settings} /></ToastProvider>;
  return <ToastProvider><GuestApp user={user} profile={profile} settings={settings} /></ToastProvider>;
}
