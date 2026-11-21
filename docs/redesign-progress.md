# Redesign v2: progress log

Preview link (demo): https://havat-ravve--pr19-redesign-v2-wou9u5ju.web.app/app?demo=on (PR https://github.com/MeniViner/havat-ravve/pull/19; the channel refreshes on every push and expires 7 days after the last one)

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
- Where a single screen disagrees with a written rule in FLOWS.md or BACKEND.md, the rule wins:
  - the אירוע tab shows on event day for crew and managers, although the M6, M7, V5 and V7 artboards show 4 tabs
  - projects stay managers-only, although C5 shows a project step to a volunteer
- Kept, though the designs don't draw them:
  - Z3 "מצבים להדגמה" (the hard-state triggers DEMO.md asks for)
  - V2 "גישה" (the entry to V6 that SCREENS.md describes)
  - M3 "אירועים קודמים" (keeps events older than 90 days reachable)
  - N7's fifth template "תזכורת לאירוע", kept from the old app
- Old features with no screen in the new design (not deleted from the code base, waiting for Meni's decision): CSV export of lists (`src/app/ExportTable.tsx`).
- Each area's report lists the loading, empty, error and confirm states it added; they follow the tone of the nearest designed screen.

## Stage 2: demo (done)
- Ten area agents built every screen in parallel worktrees: tasks, projects, shopping, farm, eventday+live, manage, events, vendor, broadcast+push, system+demo. Each area wrote its data model in `docs/redesign-data/<area>.md` and its own tests in `tests/v2-<area>.mjs`.
- Shared fixes made while merging:
  - `/demo` works for everyone
  - routing re-reads the query
  - pages without a tab keep the last tab lit
  - safe-area strip
  - centred controls despite the legacy `button{text-align:start}`
  - routines carry the template's person and place
  - one gender rule for Hebrew wording (`v2/gender.ts`, optional `Profile.gender`)
  - vendor invite claim at first sign-in
  - a crash guard in the v2 shell
- Cleanup: the old team screens (today, tasks, new, shopping, calendar, event day, manage*), the old `kit.tsx` and the `farm.css` style layer are deleted. `app.css` stays only for the guest side, which is not redesigned.
- Visual verification by three fresh agents, results in `docs/visual-check/{A,B,C}/README.md`: 69 MATCH, 38 MINOR, 12 DEFECT on the first pass. The defects went back to their areas.
- Final run on the merged branch (`docs/visual-check/README.md`): 119 screens, no console errors. 62 screens are under 1% pixel difference and 46 are between 1% and 5% (names, counts, times). The 11 at 5% or more are each explained there: seed lists longer than the artboard sample, the P1/P6 artboards disagreeing with each other, and the kept Z3 "מצבים להדגמה" row.

## Stage 3-4: real data, rules, tests (done)
- `firestore.rules` covers every new collection and field. `npm run test:rules` passes: the old suites, 553 v2 cases (one role matrix per new collection) and 72 vendor cases. 11 new indexes are in `firestore.indexes.json`. Summary: `docs/redesign-data/rules.md`.
- Code the rules refused, now fixed:
  - closing an event (cash moved out of the public event doc)
  - guest-order `paidAt` as server time
  - the profile push writer that dropped the device list
- Migration: `docs/migration-redesign.md` and `scripts/migrate-redesign.mjs` (vendor notes move to a managers-only doc; dry run by default). Tested on the emulator: the dry run changes nothing, `--apply` moves and merges the notes, and a second `--apply` changes nothing (`scripts/proofs/migrate-proof.sh`).
- Push: Web Push and FCM are both ready behind `PUSH_MODE` on the Worker (off until Meni sets it). The Worker cron drains `push_jobs`. Setup and an iPhone PWA test script are in `docs/push-setup.md` and `scripts/push-test.mjs`.
- Green on 2026-11-21: both typechecks, `npm test`, `npm run test:rules` (553 + 72 v2 cases and the old suites), `npm run test:api` (323), and all ten `tests/v2-*.mjs`.

## Stage 5: emulator smoke cycle (done)
A fresh agent ran every role end to end on the emulators. The cycle covered:
- a volunteer's day and a manager's day
- the full event lifecycle with a vendor invited through `?k=`
- role boundaries
- offline use, and a refused write
- demo mode for every persona and scenario
- the guest flows

Every Google host was blocked in the browser, and no request outside localhost got through. Report and screenshots: `docs/smoke/redesign/README.md`. Scripts: `scripts/smoke-cycle.mjs` and `scripts/smoke-seed.mjs`.

Round 1 found 7 defects, each fixed in its own commit:
- the C9 inviter's verb gender
- English verbs in the N14 feed
- a double vendor-link claim on remount
- "undefined" for a supply request in M2
- E1 saying "קורה עכשיו" before the start
- two vendor screens navigating during render
- X1 not naming who took the task

Round 2 ran all 8 items in one go: 236 of 236 checks passed, with no console errors.

After the run, a task ticked under "בלי מקום" now stays struck through like in every other group (T4).

## Delete everywhere (2026-11-21)
Meni asked for delete on everything managed, behind a confirmation. Every delete now goes through one kit `ConfirmSheet` (red "מחיקה" or "הסרה", grey "ביטול"). After a delete the screen goes back to its list and a short toast says what was removed. Delete only shows to the roles the rules allow.

Entities and who can delete them:
- Tasks: a manager deletes any task; a team member deletes a one-time task they made. On a recurring task only today's copy goes, and the template remembers the skipped day (`skip`, at most 30), so it does not come back.
- Managers: recurring tasks, places, shopping items, shopping trips (from the finished-trip screen), calendar items, presence days, events, products, event files, ticket orders, stall tabs, stalls from the pool (with their access, invite links, notes and event records), a stall taken off one event (X on the N8 row), visit requests (with the calendar entry), donations, items in the "לטיפול" list, stall requests.
- The owner only: projects (with all their steps), broadcasts, people (not themselves, not the owner email).
- The six instant deletes that existed before (recurring tasks, places, calendar items, presence, products, the event's inline confirm) now confirm too. The broken undo on places and recurring tasks is gone.

Rules changed: `task_templates` accept `skip`; managers delete shopping trips (not other staff); a manager deletes a project step that is not done, the owner deletes done steps too. Rules tests added for every delete.

New Hebrew strings:
- Buttons: "מחיקת המשימה", "מחיקת הקנייה", "מחיקת ההזמנה", "מחיקת בעל הדוכן", "מחיקת הפרויקט", "מחיקת {שם}", "מחיקה" (top bar), "מחיקה מהרשימה" (X on a "לטיפול" card), "הסרה מהאירוע: {שם}" (X on N8).
- Titles: "למחוק את המשימה?", "למחוק את המשימה החוזרת?", "למחוק את המקום?", "למחוק מהרשימה?", "למחוק את הקנייה?", "למחוק מהיומן?", "להסיר מהיומן?", "למחוק את האירוע?", "למחוק את המוצר?", "למחוק את הקובץ?", "למחוק את ההזמנה?", "למחוק את החשבון?", "למחוק את בעל הדוכן?", "להסיר מהאירוע?", "למחוק את הפרויקט?", "למחוק את ההודעה?", "למחוק את {שם}?", "למחוק את הבקשה?", "למחוק את התרומה?".
- One-line texts, for example: "רק המשימה של היום תימחק. "{משימה}" תמשיך לחזור בימים הבאים.", "ההזמנה של {שם} תימחק לגמרי, גם אצל מי שהזמין. ביטול משאיר אותה ברשימה, מחיקה לא.", "החשבון של {שם} יימחק לגמרי, גם מהדוחות. כדי לוותר על התשלום ולהשאיר תיעוד, יש מחילה.", and for a person: "היא תימחק מהאפליקציה. הכרטיסים, התרומות והביקורים נשארים. אם תיכנס שוב עם אותו חשבון גוגל, תתחיל מההתחלה כמו חדשה." (gendered).
- Toasts: "נמחק", "המשימה נמחקה", "המשימה החוזרת נמחקה", "המקום נמחק", "הקנייה נמחקה", "הפריט הוסר מהיומן", "הוסר מהיומן", "ההזמנה נמחקה", "החשבון נמחק", "{דוכן} נמחק מהמאגר", "הוסר מהאירוע", "הפרויקט נמחק", "ההודעה נמחקה", "{שם} נמחק/נמחקה", "הבקשה נמחקה", "התרומה נמחקה".

Left as they are, on purpose: broadcast reads and the personal copies of a broadcast (people who got it keep it), a deleted person's own notifications, scans of deleted tickets (rules keep them), stall requests of a deleted stall, and small inline removals inside forms.

Tests: `tests/v2-delete.mjs` (demo click-through, owner, manager and staff, 75 checks); v2 rules 580 + vendor rules 72.

## Open for Meni
- Deploy steps, in order: `docs/migration-redesign.md` (indexes, then the vendor-notes move, then merge), then push setup in `docs/push-setup.md`.
- Product questions from the area work:
  - town, birth date, photo and push devices are visible to the whole team
  - a blocked person can still edit their own profile document
  - event crew means all active staff
  - CSV export has no place in the new screens (code kept)
  - the optional gender field
- Smoke-run notes: a pending volunteer sees the guest app until approved; vendor screens follow the event's end time rather than the manager's close.

## After review (2026-11-21)

- Guest account (`/me/account`): no demo switch before sign-in; signing in with Google happens on the page; sections are cards in the guest look (not the v2 look). Team members and vendors who land there (for example after their first sign-in) go to `/me`.
- Places (L3) had no way in: a "מקומות בחווה" card on the farm tab (`?from=farm`) and a plain link on the manage screen (`?from=manage`); the back button returns to where it was opened. New strings: "מקומות בחווה", "N מקומות שמורים", "עוד לא נשמר מקום".
- Status answered for Meni: R2 bucket is bound to the Worker but no code reads or writes it (profile photos are small data URLs in the user document). Brevo payment-confirmation email is live (cron every 5 minutes, paid tickets, donations, stall accounts, only to guests who chose email). Resend is not in the code. Tickets (barcodes) are not emailed and free registrations get no email; the association's receipt is sent by hand.
