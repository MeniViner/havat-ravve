# Redesign v2: implementation plan

Branch `redesign/v2`, based on `main` at `033aad1` (no newer commits on `main` when work started, 2026-11-21).
Source of truth: `havat-raveh-redesign/` (119 screens, kept out of git; see `.gitignore`).

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Clock | `src/app/clock.ts` | `now()`, `nowMs()`, `nowIso()`, `todayKey()`. Every `new Date()` / `Date.now()` in `src/app` goes through it. Demo freezes it per scenario. |
| Tokens, font, kit | `src/app/v2/kit/` | Tokens on `.v2` (not `:root`, the guest layer owns `:root`). IBM Plex Sans Hebrew self-hosted in `public/assets/fonts/`. Component API in `src/app/v2/kit/KIT.md`. The action colour (pine) is one token: `--action`. |
| Shell | `src/app/v2/App.tsx`, `src/app/v2/core.tsx` | Role nav, root header helpers, capture bar, demo strip (Z2), offline strip (C8), refused-write toast (X1), toasts, event-day tab, centred 390-480 column on wide screens. |
| Routes | `src/app/v2/routes.tsx` | Route table + redirects from old routes. |
| Screens | `src/app/v2/screens/<area>/` | One folder per area; each exports the screen names that `routes.tsx` uses. |
| Data | `src/app/db.ts` (one door: Firestore or demo), `src/app/store.ts`, `src/app/data.ts`, new `src/app/v2/data/<area>.ts` | Screens use `useList` / `useDoc` / `write` / `transact`, so the same screen works on demo data and on Firestore. `transact` gives take/release/assign conflict detection (X1). |
| Demo | `src/app/demo/store.ts`, `src/app/demo/data.ts` (core seed), `src/app/demo/seed/<area>.ts` (area slices) | Personas incl. vendor and helper, three scenarios with a frozen clock, hard-to-reach states. |
| Legacy (guest) | `src/app/screens/Guest.tsx`, `Account.tsx`, `PaymentConfirmation.tsx`, `src/app/app.css` | Not redesigned. Rendered inside a `.legacy` wrapper so its tokens stay as they are. |

Style layers: the old team layers `farm.css` and `calendar.css` and the old `kit.tsx` are deleted once no screen uses them; `app.css` remains only as the guest layer. The new team UI has one layer: `v2/kit/kit.css`.

## Routes (inside `/app`)

Roots (bottom nav + capture bar): `/tasks`, `/shopping`, `/farm`, `/manage`. Vendor roots: `/vendor`, `/vendor/stall`. Event tab: `/event` (event day only).
The full table is `src/app/v2/routes.tsx`. Screen ids per route:

| Screen ids | Route | Component (area) | Replaces (old code) |
|---|---|---|---|
| T1, T2, T4, L5, P1, P6 | `/tasks` (`?view=time|mine`) | `TasksRoot` (tasks) | `Today.tsx` (merged) + `Tasks.tsx` list |
| T3, C3 | `/tasks/:id` | `TaskScreen` | `Tasks.tsx` `TaskDetail` |
| C4 | `/tasks/:id/assign` | `AssignScreen` | new (was a select in the task form) |
| C6 | `/tasks/:id/done` | `DonePhotoScreen` | `legacy.tsx` `PhotoPicker` flow |
| T5, S5 | `/new`, `/new?kind=shopping`, `/tasks/:id/edit`, `/shopping/:id/edit` | `AddScreen` | `New.tsx` |
| T6 | `/tasks/history` | `HistoryScreen` | `Tasks.tsx` `HistoryScreen` |
| C7 | `/day` | `DayEndScreen` | new |
| L1, L2 | `/manage/recurring`, `/manage/recurring/:id` | `RecurringList`, `RecurringForm` | `ManagePeople.tsx` templates |
| L3, L4 | `/places`, `/places/:id` | `PlacesScreen`, `PlaceScreen` | `ManagePeople.tsx` places |
| P2-P5 | `/projects`, `/projects/new`, `/projects/:id`, `/projects/:id/steps/:sid` | projects area | new |
| S1, S2, S3 | `/shopping` (`?list=super|building|online|wish`) | `ShoppingRoot` | `Shopping.tsx` |
| S4 | `/shopping/:id` | `ShopItemScreen` | `Shopping.tsx` `ShopItemScreen` |
| S6, S7 | `/shopping/trip`, `/shopping/trip/done` | `TripScreen`, `TripDoneScreen` | new |
| S8 | `/shopping/history` | `ShopHistoryScreen` | `Tasks.tsx` history tab "shopping" |
| F1 | `/farm` | `FarmRoot` | `Today.tsx` week strip + `Calendar.tsx` |
| F2, F3 | `/farm/calendar` (`?view=month|day&date=`) | `CalendarScreen` | `Calendar.tsx`, `CalendarGrid.tsx` |
| F4 | `/farm/presence` | `PresenceScreen` | `Calendar.tsx` editor (presence) |
| F5 | `/farm/today` | `FeedScreen` | new (from `activity`) |
| F6 | `/farm/events/:id` | `FarmEventScreen` | `EventDay.tsx` `StaffEventsScreen` |
| C11 | `/farm/calendar/new`, `/farm/calendar/:id/edit` | `CalItemForm` | `Calendar.tsx` `CalendarEditor` |
| C5 | `/people/:uid` | `TeammateScreen` | new |
| E1 | `/event` | `EventHome` | `EventDay.tsx` `StaffEventsScreen` |
| E2-E5 | `/event/gate` | `GateScreen` | `EventDay.tsx` `ScanScreen` |
| E6 | `/event/gate/search` | `GateSearch` | `ScanSearchScreen` |
| E7, E8, E9 | `/event/stall`, `/event/stall/:tabId`, `/event/stall/tabs` | `StallWho`, `StallSell`, `StallTabs` | `StallScreen` modes |
| Y1-Y5 | `/manage/events/:id/live`, `/live/scans`, `/live/scans/:sid`, `/live/waiting`, `/close` | eventday area | `EventEntryScreen` (partly), new |
| M1 | `/manage` | `ManageRoot` | `Manage.tsx` `ManageHomeScreen` |
| M2 | `/manage/inbox` | `InboxScreen` | `Manage.tsx` `InboxScreen` |
| M3 | `/manage/events` | `EventsList` | `ManageEvents.tsx` `EventsListScreen` |
| M4-M7 | `/manage/events/:id?tab=prep|guests|day|summary` | `EventScreen` | `EventHubScreen`, `EventGuestsScreen`, `EventEntryScreen`, `EventReportScreen` |
| N8 | `/manage/events/:id/vendors` | `EventVendors` (vendor area) | `EventVendorsScreen` |
| N9, N10 | `/manage/events/:id/products(/:pid)` | `ProductsScreen`, `ProductForm` | `EventProductsScreen`, `ProductEditor` |
| N11 | `/manage/events/new`, `/manage/events/:id/edit` | `EventForm` | `EventEditor` |
| N12 | `/manage/events/:id/tabs/:tid` | `TabScreen` | `TabDetailScreen` |
| V3, V4, V5 | `/manage/events/:id/files|staffing|debts` | events area | `EventFilesScreen`, new, new |
| V1, V2, V6, V7 | `/manage/vendors`, `/manage/vendors/:id`, `/manage/vendors/:id/access`, `/manage/events/:id/vendors/today` | vendor area | `VendorsScreen`, `VendorEditor`, new, new |
| M8, M9, N13 | `/manage/people`, `/manage/people/:uid`, `/manage/people/invite` | manage area | `ManagePeople.tsx` |
| M10, N14 | `/manage/reports`, `/manage/activity` | manage area | `ManageMore.tsx` |
| N1-N4 | `/manage/visits(/:id)`, `/manage/donations(/:id)` | manage area | `ManageMore.tsx` |
| N5-N7, G1-G5 | `/manage/settings`, `/manage/settings/:page` (`payments`, `messages`, `donation-amounts`, `visit-types`, `questions`, `contact`, `managers`) | manage area | `ManageMore.tsx` settings |
| B1-B3 | `/manage/broadcasts/new`, `/manage/broadcasts`, `/manage/broadcasts/:id` | broadcast area | new |
| B4 | card on `/tasks` and `/vendor` | `BroadcastCard` | new |
| C1 | `/notifications` | `NotificationsScreen` | new |
| C2 | `/search` | `SearchScreen` | new |
| C8 | strip (shell) + `/offline` queue view | shell + `OfflineScreen` | old offline strip |
| X1 | toast (shell) | shell | old sync failure strip |
| C9 | `/welcome` (and first entry) | `WelcomeScreen` | `Guest.tsx` `OnboardingPage` for team invitees |
| C10 | `/install` | `InstallScreen` | `InstallBanner` |
| X2 | state | `SuspendedScreen` | `Guest.tsx` `BlockedPage` (team look) |
| L6, C12 | `/me` | `ProfileScreen` | `More.tsx` |
| C13, A1, A2 | `/me/edit`, `/me/photo`, `/me/photo/crop` | system area | `More.tsx` `ProfileSection` |
| D1-D11 | `/vendor/...` | vendor area | new |
| Z1 | `/demo` | `DemoStart` | demo section in `More.tsx` |
| Z2, Z4, Z5 | strip (shell) | shell | old green demo bar |
| Z3 | sheet (shell) | `DemoSheet` | old persona chips |

Screens that disappear: the old "היום" screen (merged into Tasks), the old "עוד" menu (replaced by the profile and the Farm tab), the old staff "אירועים" picker (replaced by the event-day tab and F6).
Team members keep the guest pages they used before (`/events/:id`, order, `/visit`, `/donate`, `/contact`, `/terms`, `/delete-account`) in the legacy look; their own tickets move to `/me/tickets`, the old guest account page to `/me/account`.

### Redirects from old routes

`/` -> `/tasks` (vendors: `/vendor`) · `/more` -> `/me` · `/tasks/new` -> `/new` · `/shopping/new` -> `/new?kind=shopping` · `/history` -> `/tasks/history` · `/history/shopping` -> `/shopping/history` · `/calendar`, `/manage/calendar` -> `/farm/calendar` · `/calendar/:view/:date` -> `/farm/calendar?view&date` · `/calendar/new` -> `/farm/calendar/new` · `/events-staff` -> `/event` · `/events-staff/:id` -> `/farm/events/:id` · `/scan/:id` -> `/event/gate?e=:id` · `/scan/:id/search` -> `/event/gate/search?e=:id` · `/stall/:id(/pick)` -> `/event/stall?e=:id` · `/stall/:id/tabs` -> `/event/stall/tabs?e=:id` · `/manage/templates(/:id)` -> `/manage/recurring(/:id)` · `/manage/places(/:id)` -> `/places(/:id)` · `/manage/events/:id/guests` -> `?tab=guests` · `/entry` -> `?tab=day` · `/report` -> `?tab=summary` · `/manage/events/:id/activity` -> `/manage/activity?event=:id`.
Links stored in production `notifications.link` (`/manage/visits/:id`, `/manage/donations/:id`, `/manage/events/:id/guests`, `/manage/events/:id/tabs/:tid`, `/manage/inbox`) all resolve.

## Backend capabilities (spec/BACKEND.md) -> existing collections

| # | Capability | Collection / field | Status before | Plan |
|---|---|---|---|---|
| 1 | Vendor role + helpers | `users.role='vendor'`, `users.vendorId`, `users.helper`; invite by token `vendor_invites/{code}` claimed at sign-in | none | new role value, rules, claim path |
| 2 | Vendor per-event record | `events/{id}/vendors/{vid}` | `confirmed`, `notes` only | add `status`, `needs`, `people`, `vehicle`, `note`, `spot`, `spotNote`, `arrivedAt`, `feedback` (all optional) |
| 3 | Vendor requests | `events/{id}/vendor_requests/{rid}` | none | new subcollection + inbox + push job |
| 4 | Broadcasts + receipts | `broadcasts/{id}`, `broadcasts/{id}/reads/{uid}` | none | new |
| 5 | Push | `push_outbox/{id}` drained by the Worker cron; `push_subs/{uid}` | design doc only | client enqueue + Worker drain; Web Push and FCM paths, switch left to Meni |
| 6 | Take/release/assign | `tasks.assignee` + `transact()` in `db.ts`; rule: take only when free | plain update | transaction + rule |
| 7 | Task links | `tasks.eventId` (exists), `tasks.location.placeId` (exists), `tasks.shoppingId`, `shopping.taskId` | event + place exist | add the two ids, indexes |
| 8 | Projects | `projects/{id}`, `projects/{id}/steps/{sid}` | none | new, managers only |
| 9 | Presence | `calendar` kind `presence` | date + time text | add `from`, `to`, `note` (optional); multi-day = batch |
| 10 | Shopping trip | `shopping_trips/{id}`, `shopping.notAvailable`, `shopping.tripId` | none | new |
| 11 | Gate scans log | `events/{id}/scans/{sid}`, `events/{id}/counters/live`, `tickets` (exists) | scans array on ticket | add log + counters in the same transaction |
| 12 | Staffing | `events/{id}/staffing/{station}` | none | new |
| 13 | Event files | `events/{id}/files` / `events.files` | exists | managers only, size check |
| 14 | Event close | `events.closed` (EventClose) | none | batch + rules refuse scans/tabs when closed |
| 15 | Debt reminders | `tickets.reminderSentAt`, `tabs.reminderSentAt` | none | stamp only, wa.me links |
| 16 | Profile photo | `users.photoSource`, `users.photo`, `users.googlePhoto` | none | add |
| 17 | Global search | client-side over subscribed lists | none | client |
| 18 | Day summary | derived from `tasks` + `activity` | none | client |
| 19 | Offline queue | Firestore pending writes + `useSync()` | count only | list view |
| 20 | Vendor pool | `vendors` | name, phone, product, notes | add `contact`, `sells`, `needs`, `note`, `events`, `people`, `inviteNext` |
| 21 | View as volunteer | client only | none | shell flag |
| 22 | Recurring tasks | `task_templates` + `materializeToday` (client, idempotent id `templateId_date`) | exists | keep; add `assignee`, `placeId` |
| - | Personal notifications | `users/{uid}/notifications/{id}` | none | new (C1) |

## Execution

Stage 1 (foundation) by the lead; Stage 2 screens by one sub-agent per area in parallel (tasks, projects, shopping, farm, eventday+live, manage, events, vendor, broadcast+push, system+demo), each in its own worktree, owning only its own folders (`src/app/v2/screens/<area>/`, `src/app/v2/data/<area>.ts`, `src/app/demo/seed/<area>.ts`). Then rules + tests, visual verification by a separate agent with fresh context, emulator smoke cycle.
