// The v2 shell for staff, managers, owners and vendors: role navigation, the event-day tab, demo strip (Z2), offline strip (C8),
// refused-write toast (X1), toasts, redirects from old routes, and the centred 390-480 column on wide screens.
// The guest side keeps the legacy shell (App.tsx at src/app) and is not touched here.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRoute, useSearch, navigate } from '../router';
import { useSync, useList } from '../db';
import { useOnline, useTemplates, useTodayInstances, materializeToday, usePlaces, useTeam, usePeople, actorOf, canManage, isOwner, useCmsEditor } from '../store';
import { useAllEvents, useNotifications } from '../data';
import { useDemo, useDemoStates, setDemo, PERSONA_ROLE, SCENARIOS } from '../demo/store';
import { leaveDemoTarget } from '../demo/intro';
import { DemoIntro } from './DemoIntro';
import { todayKey, useClockVersion } from '../clock';
import { sweepPrivateTaskActivity } from '../activity';
import type { Profile, Settings, Staffing } from '../types';
import type { Session } from '../firebase';
import type { TeamCtx } from '../ctx';
import type { V2Ctx, V2Role } from './ctx';
import { TEAM_ROUTES, VENDOR_ROUTES, VENDOR_LEGACY, resolve, redirectOf, type NavTab } from './routes';
import { V2Provider, ToastProvider, useToast, ChromeProvider, AppScreen } from './core';
import { BottomNav, DemoStrip, Strip, type IconName } from './kit';
import { DemoSheet, useInstallBanner } from './screens/system';
import { READ_ONLY_TEXT, useAppSwitches } from '../switches';
import { useRootTasks } from './data/tasks';
import { useUrgentOpenCount } from './data/shopping';
import { useVendorRequests } from './data/manage';
import * as legacy from './legacy';
import { Guard } from '../guard';
import { AppScreen as Frame2 } from './core';
import { EmptyState, Button } from './kit';

const VIEW_AS_STAFF = 'farm-view-as-staff';
export const setViewAsStaff = (on: boolean) => { try { on ? sessionStorage.setItem(VIEW_AS_STAFF, '1') : sessionStorage.removeItem(VIEW_AS_STAFF); } catch { /* private mode */ } location.reload(); };
const viewAsStaffOn = () => { try { return sessionStorage.getItem(VIEW_AS_STAFF) === '1'; } catch { return false; } };

type NavItem = { key: Exclude<NavTab, null>; label: string; icon: IconName; href: string; badge?: number };
const TEAM_NAV: Record<string, NavItem> = {
  tasks: { key: 'tasks', label: 'משימות', icon: 'tasks', href: '/tasks' },
  shopping: { key: 'shopping', label: 'קניות', icon: 'cart', href: '/shopping' },
  farm: { key: 'farm', label: 'החווה', icon: 'farm', href: '/farm' },
  manage: { key: 'manage', label: 'ניהול', icon: 'grid', href: '/manage' },
  event: { key: 'event', label: 'אירוע', icon: 'qr', href: '/event' },
  vendorEvents: { key: 'vendorEvents', label: 'האירועים', icon: 'calendar', href: '/vendor' },
  vendorStall: { key: 'vendorStall', label: 'הדוכן שלי', icon: 'stall', href: '/vendor/stall' },
};

/** Shell chrome shared by team and vendor: the strips and nav go into every AppScreen through the chrome context. */
let lastTab: NavTab = null;
function Frame({ nav, tab: routeTab, showNav, children }: { nav: NavItem[]; tab: NavTab; showNav: boolean; children: ReactNode }) {
  const demo = useDemo(); const states = useDemoStates(); const online = useOnline(); const sync = useSync(); const toast = useToast();
  const [sheet, setSheet] = useState(false);
  // pages without a tab of their own (/me, /search, /offline) keep the last tab lit, as in the designs
  if (routeTab) lastTab = routeTab;
  const tab = routeTab ?? lastTab ?? 'tasks';
  const offline = !online || (demo.on && states.offline);
  // a write the server refused after the screen moved on (X1)
  useEffect(() => { if (sync.failure) toast.refused(sync.failure.text.startsWith('לא נשמר') ? sync.failure.text : `לא נשמר. ${sync.failure.text}`); }, [sync.failure?.id]);
  const pending = demo.on && states.offline ? Math.max(3, sync.pending) : sync.pending;
  // the old shell's automatic install invitation (two weeks after "סגירה"; never on /install or in the demo)
  const install = useInstallBanner();
  // the owners turned on read-only from the console (switches.ts): say so, before anyone tries to change something
  const locked = useAppSwitches().locked && !demo.on;
  const top = (demo.on || offline || install || locked) ? <>
    {locked && <Strip icon="blocked">{READ_ONLY_TEXT}</Strip>}
    {demo.on && <DemoStrip roleName={PERSONA_ROLE[demo.persona]} day={SCENARIOS[demo.scenario].label} expanded={sheet} onSwitch={() => setSheet(true)} onExit={() => { setDemo({ on: false }); navigate(leaveDemoTarget(), true); }} />}
    {offline && <button type="button" className="k-strip-btn" onClick={() => navigate('/offline')}><Strip icon="offline">{pending ? `אין קליטה. ${pending} פעולות שמורות בטלפון` : 'אין קליטה. מה שתעשו יישמר בטלפון'}</Strip></button>}
    {install}
  </> : null;
  const navNode = showNav ? <BottomNav items={nav.map((i) => ({ ...i, active: i.key === tab, href: undefined, onClick: () => navigate(i.href) }))} /> : null;
  const route = useRoute();
  return (
    <ChromeProvider value={{ top, nav: navNode }}>
      <Guard resetKey={route} fallback={() => (
        <Frame2 variant="plain">
          <EmptyState variant="fill" icon="help" title="המסך הזה נתקע" text="שאר האפליקציה עובדת. אפשר לחזור אחורה או לטעון מחדש."
            action={<Button variant="outline" onClick={() => location.reload()}>טעינה מחדש</Button>} />
        </Frame2>
      )}>{children}</Guard>
      {demo.on && <DemoSheet open={sheet} onClose={() => setSheet(false)} />}
    </ChromeProvider>
  );
}

function useEventToday(today: string) {
  const events = useAllEvents(true);
  return useMemo(() => events.items.find((e) => e.published && e.start && e.start.slice(0, 10) <= today && (e.end || e.start).slice(0, 10) >= today && !(e as { closed?: unknown }).closed) || null, [events.items, today]);
}

// ---------- staff, managers, owners ----------
export function TeamAppV2({ user, profile, settings }: { user: Session; profile: Profile; settings: Settings }) {
  useClockVersion();
  const route = useRoute(); const search = new URLSearchParams(useSearch());
  const manager = canManage(profile, user.email); const owner = isOwner(profile, user.email);
  const viewAsStaff = manager && viewAsStaffOn();
  const role: V2Role = viewAsStaff ? 'staff' : owner ? 'owner' : manager ? 'manager' : 'staff';
  const cmsEditor = useCmsEditor(user, manager);
  const actor = useMemo(() => actorOf(user, profile), [user.uid, profile.displayName]);
  const today = todayKey();
  const templates = useTemplates(true, manager); const instances = useTodayInstances(true, manager, today);
  const places = usePlaces(true); const team = useTeam(true); const people = usePeople(manager);
  const peopleByUid = useMemo(() => new Map([...team.items, ...people.items].map((p) => [p.uid, p])), [team.items, people.items]);
  const eventToday = useEventToday(today);
  const staffing = useList<Staffing>(`events/${eventToday?.id || '_'}/staffing`, {}, !!eventToday);
  const crew = !!eventToday && (manager || staffing.items.some((s) => s.people?.some((p) => p.uid === user.uid)));
  useEffect(() => {
    if (viewAsStaff || templates.loading || instances.loading || instances.error || !templates.items.length) return;
    materializeToday(templates.items, instances.items, actor, today, places.items);
  }, [today, templates.items, templates.loading, instances.loading, instances.items.length, instances.error, actor, places.items.length]);

  const base: TeamCtx = { user, actor, profile, manager: manager && !viewAsStaff, owner: owner && !viewAsStaff, cmsEditor, settings, places: places.items, templates: templates.items, team: team.items, peopleByUid };
  const ctx: V2Ctx = { ...base, role, vendorId: '', helper: false, today, eventToday, crew, viewAsStaff };

  // one-time move of private-task history for managers (kept from the old shell)
  const online = useOnline();
  useEffect(() => { if (manager && online) void sweepPrivateTaskActivity(); }, [manager, online]);

  const redirect = redirectOf(route, search, role);
  useEffect(() => { if (redirect) navigate(redirect, true); }, [redirect]);
  const hit = resolve(TEAM_ROUTES, route, search);
  const allowed = !hit || ((!hit.route.manager || ctx.manager) && (!hit.route.owner || ctx.owner));
  useEffect(() => { if (hit && !allowed) navigate('/tasks', true); }, [hit, allowed]);

  // nav badges (old shell): my open tasks, urgent shopping, and for managers what waits in "לטיפול" (the manage root's count)
  const myOpen = useRootTasks(ctx).items.filter((t) => !t.done && t.assignee?.uid === user.uid).length;
  const urgent = useUrgentOpenCount();
  const inbox = useNotifications(ctx.manager).items.length + useVendorRequests(eventToday?.id || '', ctx.manager && !!eventToday).items.length;
  const badges: Partial<Record<NavItem['key'], number>> = { tasks: myOpen, shopping: urgent, manage: ctx.manager ? inbox : 0 };
  const nav: NavItem[] = [TEAM_NAV.tasks, TEAM_NAV.shopping, TEAM_NAV.farm, ...(ctx.manager ? [TEAM_NAV.manage] : []), ...(eventToday ? [TEAM_NAV.event] : [])]
    .map((i) => (badges[i.key] ? { ...i, badge: badges[i.key] } : i)); // on the event day every team member gets the tab (the old events tab); `crew` stays in ctx
  let screen: ReactNode;
  if (redirect || (hit && !allowed)) screen = null;
  else if (hit) { const S = hit.screen; screen = <S ctx={ctx} params={hit.params} />; }
  else screen = <AppScreen variant="plain" noNav>{legacy.teamFallback(route, { user, profile, settings }) ?? <legacy.NotFound />}</AppScreen>;
  return <V2Provider value={ctx}><Frame nav={nav} tab={hit?.tab ?? null} showNav={!!hit && hit.kind === 'tab'}>{screen}</Frame></V2Provider>;
}

// ---------- vendors and helpers ----------
export function VendorAppV2({ user, profile, settings }: { user: Session; profile: Profile; settings: Settings }) {
  useClockVersion();
  const route = useRoute(); const search = new URLSearchParams(useSearch());
  const actor = useMemo(() => actorOf(user, profile), [user.uid, profile.displayName]);
  const today = todayKey();
  const base: TeamCtx = { user, actor, profile, manager: false, owner: false, cmsEditor: false, settings, places: [], templates: [], team: [], peopleByUid: new Map() };
  const ctx: V2Ctx = { ...base, role: 'vendor', vendorId: profile.vendorId || '', helper: !!profile.helper, today, eventToday: null, crew: false, viewAsStaff: false };
  const redirect = redirectOf(route, search, 'vendor');
  useEffect(() => { if (redirect) navigate(redirect, true); }, [redirect]);
  const hit = resolve(VENDOR_ROUTES, route, search);
  const nav = [TEAM_NAV.vendorEvents, TEAM_NAV.vendorStall];
  let screen: ReactNode = null;
  if (!redirect && hit) { const S = hit.screen; screen = <S ctx={ctx} params={hit.params} />; }
  else if (!redirect && VENDOR_LEGACY.includes(route)) screen = <AppScreen variant="plain" noNav>{legacy.teamFallback(route, { user, profile, settings })}</AppScreen>;
  return <V2Provider value={ctx}><Frame nav={nav} tab={hit?.tab ?? null} showNav={!!hit && hit.kind === 'tab'}>{screen}</Frame></V2Provider>;
}

/** Entry used by src/app/App.tsx. */
export function V2Root(props: { user: Session; profile: Profile; settings: Settings }) {
  const isVendor = props.profile.role === 'vendor';
  return <ToastProvider>{isVendor ? <VendorAppV2 {...props} /> : <TeamAppV2 {...props} />}<IntroV2 {...props} /></ToastProvider>;
}
/** First visits in demo, for the real account only (the demo personas never see it). */
function IntroV2({ user, profile }: { user: Session; profile: Profile }) {
  const demo = useDemo(); const toast = useToast();
  if (demo.on) return null;
  return <DemoIntro shell="team" profile={profile} owner={isOwner(profile, user.email)} manager={canManage(profile, user.email)} notify={(text) => toast.show({ text, check: false, duration: 4500 })} />;
}
export { canManage };
