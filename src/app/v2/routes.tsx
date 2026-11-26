// The v2 route table (inside /app). One place maps a path to a screen, its bottom-nav tab, and whether it is a root
// (roots get the capture bar and the bottom nav; detail screens and forms do not). Old routes redirect here (REDIRECTS).
import type { ReactNode } from 'react';
import { match } from '../router';
import type { ScreenProps, V2Ctx } from './ctx';
import * as tasks from './screens/tasks';
import * as projects from './screens/projects';
import * as shopping from './screens/shopping';
import * as farm from './screens/farm';
import { FarmSurvey } from './screens/farm/FarmSurvey';
import * as eventday from './screens/eventday';
import * as manage from './screens/manage';
import * as events from './screens/events';
import * as vendor from './screens/vendor';
import * as broadcast from './screens/broadcast';
import * as system from './screens/system';
import { AppearanceScreen } from './screens/system/appearance';

export type NavTab = 'tasks' | 'shopping' | 'farm' | 'manage' | 'event' | 'vendorEvents' | 'vendorStall' | null;
type Screen = (p: ScreenProps) => ReactNode;
/** kind: 'tab' = the bottom nav shows under the screen; 'page' = no nav (detail screens, forms, sheets, gate), exactly as each design shows.
 *  Capture bars are part of the screens that have them (T1, F1, S1 ...), rendered with the kit's CaptureBar. */
type Route = { path: string; screen: Screen; tab: NavTab; kind: 'tab' | 'page'; manager?: boolean; owner?: boolean };

const R = (path: string, screen: Screen, tab: NavTab, kind: Route['kind'] = 'page', o: Partial<Route> = {}): Route => ({ path, screen, tab, kind, ...o });

/** Staff, managers and owners. Order matters: the first match wins. */
export const TEAM_ROUTES: Route[] = [
  // Tasks tab
  R('/tasks', tasks.TasksRoot, 'tasks', 'tab'),
  R('/tasks/history', tasks.HistoryScreen, 'tasks', 'tab'),
  R('/tasks/:id/assign', tasks.AssignScreen, 'tasks', 'page'),
  R('/tasks/:id/done', tasks.DonePhotoScreen, 'tasks', 'page'),
  R('/tasks/:id/edit', tasks.AddScreen, 'tasks', 'page'),
  R('/tasks/:id', tasks.TaskScreen, 'tasks', 'page'),
  R('/new', tasks.AddScreen, null, 'page'),
  R('/day', tasks.DayEndScreen, 'tasks', 'page'),
  // places are reached from the Farm tab card only (Q2, RULES.md); /places/table is the list's Q9 table view
  R('/places', tasks.PlacesScreen, 'farm', 'tab'),
  R('/places/table', tasks.PlacesScreen, 'farm', 'tab'),
  R('/places/:id', tasks.PlaceScreen, 'farm', 'page'),
  R('/projects', projects.ProjectsList, 'tasks', 'tab', { manager: true }),
  R('/projects/new', projects.ProjectForm, 'tasks', 'page', { manager: true }),
  R('/projects/:id/edit', projects.ProjectForm, 'tasks', 'page', { manager: true }),
  R('/projects/:id/steps/:sid', projects.StepScreen, 'tasks', 'page', { manager: true }),
  R('/projects/:id', projects.ProjectScreen, 'tasks', 'tab', { manager: true }),
  // Shopping tab
  R('/shopping', shopping.ShoppingRoot, 'shopping', 'tab'),
  R('/shopping/history', shopping.ShopHistoryScreen, 'shopping', 'tab'),
  R('/shopping/trip', shopping.TripScreen, 'shopping', 'page'),
  R('/shopping/trip/done', shopping.TripDoneScreen, 'shopping', 'page'),
  R('/shopping/:id/edit', tasks.AddScreen, 'shopping', 'page'),
  R('/shopping/:id', shopping.ShopItemScreen, 'shopping', 'page'),
  // Farm tab
  R('/farm', farm.FarmRoot, 'farm', 'tab'),
  R('/farm/map', FarmSurvey, 'farm', 'tab', { owner: true }),
  R('/farm/calendar', farm.CalendarScreen, 'farm', 'tab'),
  R('/farm/calendar/new', farm.CalItemForm, 'farm', 'page'),
  R('/farm/calendar/:id/edit', farm.CalItemForm, 'farm', 'page'),
  R('/farm/presence', farm.PresenceScreen, 'farm', 'page'),
  R('/farm/today', farm.FeedScreen, 'farm', 'tab'),
  R('/farm/events/:id', farm.FarmEventScreen, 'farm', 'page'),
  R('/people/:uid', farm.TeammateScreen, 'farm', 'tab'),
  // Event tab (event day only)
  R('/event', eventday.EventHome, 'event', 'tab'),
  R('/event/gate', eventday.GateScreen, 'event', 'page'),
  R('/event/gate/search', eventday.GateSearch, 'event', 'page'),
  R('/event/stall', eventday.StallWho, 'event', 'page'),
  R('/event/stall/tabs', eventday.StallTabs, 'event', 'page'),
  R('/event/stall/:tabId', eventday.StallSell, 'event', 'page'),
  // Cross-app
  R('/notifications', broadcast.NotificationsScreen, null, 'tab'),
  R('/search', system.SearchScreen, null, 'tab'),
  R('/welcome', system.WelcomeScreen, null, 'page'),
  R('/install', system.InstallScreen, null, 'page'),
  R('/offline', system.OfflineScreen, null, 'tab'),
  R('/me', system.ProfileScreen, null, 'tab'),
  R('/me/appearance', () => <AppearanceScreen />, null),
  R('/me/edit', system.ProfileEdit, null, 'page'),
  R('/me/photo', system.PhotoSource, null, 'page'),
  R('/me/photo/crop', system.PhotoCrop, null, 'page'),
  // Manage tab
  R('/manage', manage.ManageRoot, 'manage', 'tab', { manager: true }),
  R('/manage/inbox', manage.InboxScreen, 'manage', 'tab', { manager: true }),
  R('/manage/inbox/stall/:eid/:rid', manage.StallRequestScreen, 'manage', 'page', { manager: true }), // W2 from M2
  R('/manage/inbox/:id', manage.InboxMessageScreen, 'manage', 'page', { manager: true }), // W1
  R('/manage/events', events.EventsList, 'manage', 'tab', { manager: true }),
  R('/manage/events/new', events.EventForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/edit', events.EventForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:eid/vendors/today/:rid', manage.StallRequestFromDay, 'manage', 'page', { manager: true }), // W2 from V7
  R('/manage/events/:id/vendors/today', vendor.VendorsToday, 'manage', 'tab', { manager: true }),
  R('/manage/events/:id/vendors', vendor.EventVendors, 'manage', 'tab', { manager: true }),
  R('/manage/events/:id/products/new', events.ProductForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/products/:pid', events.ProductForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/products', events.ProductsScreen, 'manage', 'tab', { manager: true }),
  R('/manage/events/:id/tabs/:tid', events.TabScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/tabs', events.TabsScreen, 'manage', 'tab', { manager: true }), // Q12 shows the nav like its siblings
  R('/manage/events/:id/files', events.FilesScreen, 'manage', 'tab', { manager: true }),
  R('/manage/events/:id/staffing', events.StaffingScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/debts', events.DebtsScreen, 'manage', 'tab', { manager: true }),
  R('/manage/events/:id/live/scans/:sid', eventday.RejectedScan, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/live/scans', eventday.ScansScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/live/waiting', eventday.WaitingScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/live', eventday.LiveScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/close', eventday.CloseEvent, 'manage', 'page', { manager: true }),
  R('/manage/events/:id', events.EventScreen, 'manage', 'tab', { manager: true }),
  R('/manage/vendors', vendor.VendorPool, 'manage', 'tab', { manager: true }),
  R('/manage/vendors/:id/access', vendor.VendorAccess, 'manage', 'tab', { manager: true }),
  R('/manage/vendors/:id', vendor.VendorCard, 'manage', 'page', { manager: true }),
  R('/manage/people', manage.PeopleScreen, 'manage', 'tab', { manager: true }),
  R('/manage/people/invite', manage.InviteScreen, 'manage', 'page', { manager: true }),
  R('/manage/people/messages/:id', broadcast.BroadcastReads, 'manage', 'tab', { manager: true }), // B3 under People (Q25)
  R('/manage/people/:uid', manage.PersonScreen, 'manage', 'tab', { manager: true }),
  R('/manage/reports', manage.ReportsScreen, 'manage', 'tab', { manager: true }),
  R('/manage/reports/:section', manage.ReportsScreen, 'manage', 'tab', { manager: true }), // Q14 drill-ins: people, events
  R('/manage/visits', manage.VisitsScreen, 'manage', 'tab', { manager: true }),
  R('/manage/visits/:id', manage.VisitScreen, 'manage', 'page', { manager: true }),
  R('/manage/donations', manage.DonationsScreen, 'manage', 'tab', { manager: true }),
  R('/manage/donations/:id', manage.DonationScreen, 'manage', 'page', { manager: true }),
  R('/manage/settings', manage.SettingsScreen, 'manage', 'tab', { manager: true }),
  R('/manage/settings/messages', manage.SettingsPage, 'manage', 'tab', { manager: true }),
  R('/manage/settings/questions', manage.SettingsPage, 'manage', 'tab', { manager: true }),
  R('/manage/settings/managers', manage.SettingsPage, 'manage', 'tab', { manager: true, owner: true }),
  R('/manage/settings/demo', manage.DemoFirstVisitScreen, 'manage', 'tab', { manager: true, owner: true }),
  R('/manage/settings/payments', manage.SettingsPage, 'manage', 'page', { manager: true }),
  R('/manage/settings/donation-amounts', manage.SettingsPage, 'manage', 'page', { manager: true }),
  R('/manage/settings/:page', manage.SettingsPage, 'manage', 'page', { manager: true }),
  R('/manage/activity', manage.ActivityScreen, 'manage', 'tab'),
  R('/manage/instinct', manage.InstinctLogScreen, 'manage', 'tab', { manager: true, owner: true }),
  R('/manage/recurring', tasks.RecurringList, 'tasks', 'tab', { manager: true }),
  R('/manage/recurring/new', tasks.RecurringForm, 'tasks', 'page', { manager: true }),
  R('/manage/recurring/:id', tasks.RecurringForm, 'tasks', 'page', { manager: true }),
  // Q26 compose keeps its path; the list and the read details live under People (redirects below)
  R('/manage/broadcasts/new', broadcast.BroadcastCompose, 'manage', 'page', { manager: true }),
];

/** Vendors and vendor helpers: only their own world. */
export const VENDOR_ROUTES: Route[] = [
  R('/vendor', vendor.VendorHome, 'vendorEvents', 'tab'),
  R('/vendor/invite/:eventId', vendor.VendorInvite, null, 'page'),
  R('/vendor/events/:id/needs', vendor.VendorNeeds, null, 'page'),
  R('/vendor/events/:id/summary', vendor.VendorSummary, null, 'page'),
  R('/vendor/events/:id', vendor.VendorEvent, 'vendorEvents', 'tab'),
  R('/vendor/stall/helpers/new', vendor.HelperForm, null, 'page'),
  R('/vendor/stall', vendor.VendorStall, 'vendorStall', 'tab'),
  R('/notifications', broadcast.NotificationsScreen, null, 'tab'),
  R('/me', system.ProfileScreen, null, 'tab'),
  R('/me/appearance', () => <AppearanceScreen />, null),
  R('/me/edit', system.ProfileEdit, null, 'page'),
  R('/me/photo', system.PhotoSource, null, 'page'),
  R('/me/photo/crop', system.PhotoCrop, null, 'page'),
  R('/install', system.InstallScreen, null, 'page'),
];

/** Guest pages a vendor may open (rendered by legacy.teamFallback). */
export const VENDOR_LEGACY = ['/terms', '/privacy', '/delete-account', '/contact'];

/** Old paths (bookmarks, notification links stored in Firestore, the Worker) -> new paths. */
export function redirectOf(route: string, search: URLSearchParams, role: V2Ctx['role']): string | null {
  let m: Record<string, string> | null;
  // the guest account page is for guests only: signing in from it (or a bookmark) lands the team and vendors on their profile
  if (route === '/me/account') return search.get('notifications') === '1' ? '/me?notifications=1' : '/me';
  // vendors: their own world, plus the terms, account deletion and contact pages their profile links to (legacy fallback)
  if (role === 'vendor') return route === '/' || !route.startsWith('/vendor') && !['/notifications', '/install', ...VENDOR_LEGACY].includes(route) && !route.startsWith('/me') ? '/vendor' : null;
  if (route === '/') return '/tasks';
  if (route === '/more') return '/me';
  // the query comes along: ?event=<id> (an event's preparations) and the old ?c=<category> (giveaway is the v2 list "wish")
  if (route === '/tasks/new') return search.get('event') ? `/new?event=${encodeURIComponent(search.get('event')!)}` : '/new';
  if (route === '/shopping/new') { const c = search.get('c') || ''; const list = c === 'giveaway' ? 'wish' : ['super', 'building', 'online'].includes(c) ? c : ''; return list ? `/new?kind=shopping&list=${list}` : '/new?kind=shopping'; }
  if (route === '/history' || route === '/history/tasks') return '/tasks/history';
  if (route === '/history/shopping') return '/shopping/history';
  if (route === '/calendar' || route === '/manage/calendar') return '/farm/calendar';
  if (route === '/calendar/new' || route === '/manage/calendar/new') return '/farm/calendar/new';
  if ((m = match(route, '/calendar/:id/edit'))) return `/farm/calendar/${m.id}/edit`;
  if ((m = match(route, '/calendar/:view/:date'))) return `/farm/calendar?view=${m.view}&date=${m.date}`;
  if (route === '/events-staff') return '/event';
  if ((m = match(route, '/events-staff/:id'))) return `/farm/events/${m.id}`;
  if ((m = match(route, '/scan/:id/search'))) return `/event/gate/search?e=${m.id}`;
  if ((m = match(route, '/scan/:id'))) return `/event/gate?e=${m.id}`;
  if ((m = match(route, '/stall/:id/tabs'))) return `/event/stall/tabs?e=${m.id}`;
  if ((m = match(route, '/stall/:id/pick'))) return `/event/stall?e=${m.id}`;
  if ((m = match(route, '/stall/:id'))) return `/event/stall?e=${m.id}`;
  if (route === '/manage/templates') return '/manage/recurring';
  if (route === '/manage/templates/new') return '/manage/recurring/new';
  if ((m = match(route, '/manage/templates/:id'))) return `/manage/recurring/${m.id}`;
  if (route === '/manage/places') return '/places';
  if ((m = match(route, '/manage/places/:id'))) return `/places/${m.id}`;
  if ((m = match(route, '/manage/events/:id/guests'))) return `/manage/events/${m.id}?tab=guests`;
  if ((m = match(route, '/manage/events/:id/entry'))) return `/manage/events/${m.id}?tab=day`;
  if ((m = match(route, '/manage/events/:id/report'))) return `/manage/events/${m.id}?tab=summary`;
  if ((m = match(route, '/manage/events/:id/activity'))) return `/manage/activity?event=${m.id}`;
  // messages moved into People (Q25): the list is its "הודעות" segment, a message's read details are under it
  if (route === '/manage/broadcasts') return '/manage/people?tab=messages';
  if ((m = match(route, '/manage/broadcasts/:id')) && m.id !== 'new') return `/manage/people/messages/${m.id}`;
  if (route === '/manage/vendors/new') return '/manage/vendors?new=1' + (search.get('event') ? `&event=${encodeURIComponent(search.get('event')!)}` : '');
  return null;
}

export type Resolved = { screen: Screen; params: Record<string, string>; tab: NavTab; kind: Route['kind']; route: Route } | null;
export function resolve(routes: Route[], route: string, search: URLSearchParams): Resolved {
  // Q9: "<list>/table" is the list's own table view; the list screen renders it (useTableView in patterns.tsx). Checked first,
  // so "/manage/donations/table" is the donations list and not a donation whose id is "table" ("/manage/donations/:id").
  if (route.endsWith('/table')) {
    const base = resolve(routes, route.slice(0, -'/table'.length) || '/', search);
    if (base) return base;
  }
  for (const r of routes) {
    const m = match(route, r.path);
    if (m) return { screen: r.screen, params: { ...Object.fromEntries(search.entries()), ...m }, tab: r.tab, kind: r.kind, route: r };
  }
  return null;
}
