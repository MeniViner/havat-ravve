// The v2 route table (inside /app). One place maps a path to a screen, its bottom-nav tab, and whether it is a root
// (roots get the capture bar and the bottom nav; detail screens and forms do not). Old routes redirect here (REDIRECTS).
import type { ReactNode } from 'react';
import { match } from '../router';
import type { ScreenProps, V2Ctx } from './ctx';
import * as tasks from './screens/tasks';
import * as projects from './screens/projects';
import * as shopping from './screens/shopping';
import * as farm from './screens/farm';
import * as eventday from './screens/eventday';
import * as manage from './screens/manage';
import * as events from './screens/events';
import * as vendor from './screens/vendor';
import * as broadcast from './screens/broadcast';
import * as system from './screens/system';

export type NavTab = 'tasks' | 'shopping' | 'farm' | 'manage' | 'event' | 'vendorEvents' | 'vendorStall' | null;
type Screen = (p: ScreenProps) => ReactNode;
/** kind: 'root' = bottom nav + capture bar; 'tab' = bottom nav only; 'page' = no nav (detail screens, forms, sheets, gate). */
type Route = { path: string; screen: Screen; tab: NavTab; kind: 'root' | 'tab' | 'page'; manager?: boolean; owner?: boolean };

const R = (path: string, screen: Screen, tab: NavTab, kind: Route['kind'] = 'page', o: Partial<Route> = {}): Route => ({ path, screen, tab, kind, ...o });

/** Staff, managers and owners. Order matters: the first match wins. */
export const TEAM_ROUTES: Route[] = [
  // Tasks tab
  R('/tasks', tasks.TasksRoot, 'tasks', 'root'),
  R('/tasks/history', tasks.HistoryScreen, 'tasks', 'tab'),
  R('/tasks/:id/assign', tasks.AssignScreen, 'tasks'),
  R('/tasks/:id/done', tasks.DonePhotoScreen, 'tasks'),
  R('/tasks/:id/edit', tasks.AddScreen, 'tasks'),
  R('/tasks/:id', tasks.TaskScreen, 'tasks'),
  R('/new', tasks.AddScreen, null),
  R('/day', tasks.DayEndScreen, 'tasks'),
  R('/places', tasks.PlacesScreen, 'farm'),
  R('/places/:id', tasks.PlaceScreen, 'farm'),
  R('/projects', projects.ProjectsList, 'tasks', 'page', { manager: true }),
  R('/projects/new', projects.ProjectForm, 'tasks', 'page', { manager: true }),
  R('/projects/:id/edit', projects.ProjectForm, 'tasks', 'page', { manager: true }),
  R('/projects/:id/steps/:sid', projects.StepScreen, 'tasks', 'page', { manager: true }),
  R('/projects/:id', projects.ProjectScreen, 'tasks', 'page', { manager: true }),
  // Shopping tab
  R('/shopping', shopping.ShoppingRoot, 'shopping', 'root'),
  R('/shopping/history', shopping.ShopHistoryScreen, 'shopping', 'tab'),
  R('/shopping/trip', shopping.TripScreen, 'shopping'),
  R('/shopping/trip/done', shopping.TripDoneScreen, 'shopping'),
  R('/shopping/:id/edit', tasks.AddScreen, 'shopping'),
  R('/shopping/:id', shopping.ShopItemScreen, 'shopping'),
  // Farm tab
  R('/farm', farm.FarmRoot, 'farm', 'root'),
  R('/farm/calendar', farm.CalendarScreen, 'farm', 'tab'),
  R('/farm/calendar/new', farm.CalItemForm, 'farm'),
  R('/farm/calendar/:id/edit', farm.CalItemForm, 'farm'),
  R('/farm/presence', farm.PresenceScreen, 'farm'),
  R('/farm/today', farm.FeedScreen, 'farm', 'tab'),
  R('/farm/events/:id', farm.FarmEventScreen, 'farm'),
  R('/people/:uid', farm.TeammateScreen, null),
  // Event tab (event day only)
  R('/event', eventday.EventHome, 'event', 'tab'),
  R('/event/gate', eventday.GateScreen, 'event'),
  R('/event/gate/search', eventday.GateSearch, 'event'),
  R('/event/stall', eventday.StallWho, 'event'),
  R('/event/stall/tabs', eventday.StallTabs, 'event'),
  R('/event/stall/:tabId', eventday.StallSell, 'event'),
  // Cross-app
  R('/notifications', broadcast.NotificationsScreen, null),
  R('/search', system.SearchScreen, null),
  R('/welcome', system.WelcomeScreen, null),
  R('/install', system.InstallScreen, null),
  R('/offline', system.OfflineScreen, null),
  R('/me', system.ProfileScreen, null),
  R('/me/edit', system.ProfileEdit, null),
  R('/me/photo', system.PhotoSource, null),
  R('/me/photo/crop', system.PhotoCrop, null),
  // Manage tab
  R('/manage', manage.ManageRoot, 'manage', 'root', { manager: true }),
  R('/manage/inbox', manage.InboxScreen, 'manage', 'page', { manager: true }),
  R('/manage/events', events.EventsList, 'manage', 'tab', { manager: true }),
  R('/manage/events/new', events.EventForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/edit', events.EventForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/vendors/today', vendor.VendorsToday, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/vendors', vendor.EventVendors, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/products/new', events.ProductForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/products/:pid', events.ProductForm, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/products', events.ProductsScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/tabs/:tid', events.TabScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/tabs', eventday.StallTabs, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/files', events.FilesScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/staffing', events.StaffingScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/debts', events.DebtsScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/live/scans/:sid', eventday.RejectedScan, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/live/scans', eventday.ScansScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/live/waiting', eventday.WaitingScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/live', eventday.LiveScreen, 'manage', 'page', { manager: true }),
  R('/manage/events/:id/close', eventday.CloseEvent, 'manage', 'page', { manager: true }),
  R('/manage/events/:id', events.EventScreen, 'manage', 'page', { manager: true }),
  R('/manage/vendors', vendor.VendorPool, 'manage', 'page', { manager: true }),
  R('/manage/vendors/:id/access', vendor.VendorAccess, 'manage', 'page', { manager: true }),
  R('/manage/vendors/:id', vendor.VendorCard, 'manage', 'page', { manager: true }),
  R('/manage/people', manage.PeopleScreen, 'manage', 'tab', { manager: true }),
  R('/manage/people/invite', manage.InviteScreen, 'manage', 'page', { manager: true }),
  R('/manage/people/:uid', manage.PersonScreen, 'manage', 'page', { manager: true }),
  R('/manage/reports', manage.ReportsScreen, 'manage', 'page', { manager: true }),
  R('/manage/visits', manage.VisitsScreen, 'manage', 'page', { manager: true }),
  R('/manage/visits/:id', manage.VisitScreen, 'manage', 'page', { manager: true }),
  R('/manage/donations', manage.DonationsScreen, 'manage', 'page', { manager: true }),
  R('/manage/donations/:id', manage.DonationScreen, 'manage', 'page', { manager: true }),
  R('/manage/settings', manage.SettingsScreen, 'manage', 'page', { manager: true }),
  R('/manage/settings/:page', manage.SettingsPage, 'manage', 'page', { manager: true }),
  R('/manage/activity', manage.ActivityScreen, 'manage', 'page', { manager: true }),
  R('/manage/recurring', tasks.RecurringList, 'manage', 'page', { manager: true }),
  R('/manage/recurring/new', tasks.RecurringForm, 'manage', 'page', { manager: true }),
  R('/manage/recurring/:id', tasks.RecurringForm, 'manage', 'page', { manager: true }),
  R('/manage/broadcasts', broadcast.BroadcastsSent, 'manage', 'page', { manager: true }),
  R('/manage/broadcasts/new', broadcast.BroadcastCompose, 'manage', 'page', { manager: true }),
  R('/manage/broadcasts/:id', broadcast.BroadcastReads, 'manage', 'page', { manager: true }),
];

/** Vendors and vendor helpers: only their own world. */
export const VENDOR_ROUTES: Route[] = [
  R('/vendor', vendor.VendorHome, 'vendorEvents', 'tab'),
  R('/vendor/invite/:eventId', vendor.VendorInvite, null),
  R('/vendor/events/:id/needs', vendor.VendorNeeds, null),
  R('/vendor/events/:id/summary', vendor.VendorSummary, null),
  R('/vendor/events/:id', vendor.VendorEvent, 'vendorEvents'),
  R('/vendor/stall/helpers/new', vendor.HelperForm, null),
  R('/vendor/stall', vendor.VendorStall, 'vendorStall', 'tab'),
  R('/notifications', broadcast.NotificationsScreen, null),
  R('/me', system.ProfileScreen, null),
  R('/me/edit', system.ProfileEdit, null),
  R('/me/photo', system.PhotoSource, null),
  R('/me/photo/crop', system.PhotoCrop, null),
  R('/install', system.InstallScreen, null),
];

/** Old paths (bookmarks, notification links stored in Firestore, the Worker) -> new paths. */
export function redirectOf(route: string, search: URLSearchParams, role: V2Ctx['role']): string | null {
  let m: Record<string, string> | null;
  if (role === 'vendor') return route === '/' || !route.startsWith('/vendor') && !['/notifications', '/install'].includes(route) && !route.startsWith('/me') ? '/vendor' : null;
  if (route === '/') return '/tasks';
  if (route === '/more') return '/me';
  if (route === '/tasks/new') return '/new';
  if (route === '/shopping/new') return '/new?kind=shopping';
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
  if (route === '/manage/vendors/new') return '/manage/vendors?new=1';
  void search;
  return null;
}

export type Resolved = { screen: Screen; params: Record<string, string>; tab: NavTab; kind: Route['kind']; route: Route } | null;
export function resolve(routes: Route[], route: string, search: URLSearchParams): Resolved {
  for (const r of routes) {
    const m = match(route, r.path);
    if (m) return { screen: r.screen, params: { ...Object.fromEntries(search.entries()), ...m }, tab: r.tab, kind: r.kind, route: r };
  }
  return null;
}
