# Redesign v2: progress log

Preview link (demo): _filled in when the PR opens_

Branch `redesign/v2`. Nothing merged to `main`, nothing deployed. Development on emulators and demo mode only.

## Stage 0: plan (done)
`docs/redesign-plan.md`: screen → component → old code, route table, redirects, BACKEND capability → collections.

## Stage 1: foundation (done)
- `src/app/clock.ts`: one clock for every "now"; demo scenarios freeze it. All `new Date()` / `Date.now()` in `src/app` go through it.
- Kit `src/app/v2/kit/` (tokens on `.v2`, IBM Plex Sans Hebrew self-hosted in `public/assets/fonts`, 60+ components, 40 icons, `KIT.md`, gallery script). The pine action colour is the single token `--action` in `kit.css`.
- Shell `src/app/v2/App.tsx`: role nav (משימות · קניות · החווה + ניהול + אירוע on event days; vendor 2 tabs), redirects from every old route (`routes.tsx`), `AppScreen` frame in `core.tsx` that carries the demo strip, offline strip, toasts and nav into every screen, `RootHead`.
- Demo store: personas owner, manager, staff, vendor (רז), helper (תמר), guest, blocked, new; scenarios regular / eventDay / afterEvent with a frozen clock; hard-state triggers (offline, refused write, empty); seed per scenario from area slices.
- Types extended additively (`types.ts`); `transact()` + `ConflictError` in `db.ts`; shared `notify()`.
- Old style layers are removed in the cleanup step after the areas land (the team screens that use them are replaced first).

## Decisions and states I added (log)
- Dana Avraham is a manager. Team 12, directory 155 (fillers fictional, `demo-u-gNNN`).
- "giveaway" shopping items are shown as מחפשים (S2).
- X2 suspended screen is used for every blocked role.
- Desktop: the 390 layout is centred (max 480) with the bottom nav; the old side rail is dropped for the team app.
- Legacy guest pages reached from the team app (event page, tickets, visit, donate) render inside a `.legacy` wrapper with their old look, unchanged.
- Demo ids renamed for clarity (`demo-vi-*` visits, `demo-d-rachel` donation).
- Kit follows the HTML where design files disagree (toggle on = pine; sheet title 20px; artboard content-box heights).
- The demo strip "יציאה" turns demo off and opens `/demo` (Z1).

## Stage 2: demo (in progress)
Ten area agents in parallel worktrees (tasks, projects, shopping, farm, eventday+live, manage, events, vendor, broadcast+push, system+demo).
