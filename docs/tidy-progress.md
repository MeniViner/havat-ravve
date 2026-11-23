# Tidy round (placement): progress log

Task: `havat-raveh-tidy/PROMPT.md` (Meni, 2026-11-23). Rules: `havat-raveh-tidy/RULES.md`. Screens: `havat-raveh-tidy/design/SCREENS.md`
(46: Q1-Q32 team, U1-U14 guest). The design folder is kept outside git (`.gitignore`), like `havat-raveh-redesign/`.

Branch `tidy/placement`, pull request to `main`, not merged (Meni merges after the preview). Nothing deployed, no `firebase deploy`,
no `wrangler deploy`. Emulators and demo mode only.

Plan and inventory: `docs/tidy-plan.md`.

## Stage 0: inventory and plan (done)
- `docs/tidy-plan.md`: 219 rows (Q screen 98, rule 89, duplicate removed 21, needs a design 11); all 14 rows of the RULES.md
  small-additions table mapped; a list of every current screen that breaks rules 4-6.
- Stages 2 and 3 run per area (one builder per area does that area's roots, forms, lists and details): tasks+projects,
  shopping+farm, manage, events+event day, vendor, system. The guest side (stage 6) runs alongside; stages 4 and 5 follow the
  manage area because they change People.

## Stage 1: shared patterns (kit)
- `src/app/v2/kit/patterns.tsx`: `MoreMenu`, `MoreButton`, `ActionSheet` (Q5, Q11), `SelectRow`, `PickerSheet`, `Dropdown`
  (Q17, Q16), `MoreDetails` (Q3), `useReorder` + `DragHandle` (Q21), `UnderlineLink` (Q18), `DataTable` (Q9), `PayConfirmSheet` (Q7).
- `ConfirmSheet` restyled to Q8 (question, one soft line, red filled "מחיקה" with a bin, outlined "ביטול"). `Sheet` gained `sub`.
- `Row` enforces rule 4: `tags` keeps one element, `actions` takes one element (a fragment of several is cut to the first and
  logged as an error), and a row with a control has no chevron. Swipe actions (PR #23) are untouched.
- `src/app/v2/patterns.tsx`: `useTableView` (Q9: `<route>/table` is the list's own table screen with "הורדה לאקסל"; the route
  table resolves any `/table` suffix to its list) and `usePayConfirm` (Q7).
- New icons from the tidy designs: more, clock, trash, robot, table, print, mail, globe, home, share.

## Decisions (log)
- `main` is merged into `tidy/placement` (not rebased): the area builders' branches are cut from it, and a rebase would rewrite
  the history they build on. Same result for the PR. Merged: PR #26 (console backup), PR #24 (first-visit demo; the DemoIntro
  wiring in `App.tsx` is kept).
- Swipe actions on rows (PR #23) stay: hidden actions, not trailing controls. Swipe-left delete keeps its undo toast instead
  of the Q8 sheet, as approved in PR #23.
- Defaults taken from the plan's questions (docs/tidy-plan.md "Questions / risks"): Q12 chips שולמו/נמחלו continue the scrolling
  chip row; Q20 keeps search plus a key Dropdown; after a task is done "הוספת הערה" / "הוספת תמונה" are ⋯ items on T3; clearing
  the stall cart is an item in the Q29 sheet followed by the undo toast; resending a payment confirmation is a ⋯ item on the
  detail; a free task keeps "לקחת" as its one button and hand-over moves to the "על מי" row.
- Q7 e-mail row: offered only when the guest chose e-mail, because the Worker sends the automatic e-mail only then
  (`api/src/email.ts`). "בלי אישור" for such a guest records a manual confirmation so the e-mail does not go out.
- Q9 table view: the search field of the old table sheet is not in the design and is dropped; sorting by a heading stays.

## Open decisions (defaults implemented)
- Delete on detail screens that keep the outlined "עריכה" (task, shopping item, event, project, vendor card, calendar item,
  presence, product, recurring): ⋯ in the edit form's header next to "ביטול", then "מחיקה" and Q8. Delete is one step deeper
  than before. Alternative for Meni: ⋯ replaces "עריכה" on the detail, with "עריכה" as its first item.
- M2 "מה שטופל" is a text link beside the back link in the approved M2 design (rule 5 forbids it): kept until Meni decides.
- Consent for update messages to all users: opt-in only (`updatesOptIn`).
- Web Push or FCM: still waiting for Meni's test on an installed iPhone app.

## Needs a design (left as they are)
- The install banner and its X on every team screen, roots included (rule 2); Q18 has the "התקנה" row.
- Contact messages and stall requests in the inbox: no detail screen for the card's dismiss and the sender link.
- The managers' projects block on the Tasks root (older than the parity round; not on Q2).
- Extra stat tiles not on the Q screens: donations "ממתין" (Q4 has three), reports "חוזרות בזמן" / "פתוחות באיחור" (Q14 has
  four), event summary "יצאו וחזרו" (Q15).
- Vendor pool export and table view: the V1 top bar already holds "חדש" (rule 5 allows one control).
- From the first-visit demo session: a role-level demo switch in Settings.

## Stage 5: adding someone ahead by phone (Q27)
- `InviteScreen` lives in `manage/Invite.tsx` (People.tsx re-exports it). By phone creates `team_links/{code}`
  (`v2/data/invite.ts`), built like the vendor access link: `?k=` on `/app/login`, remembered across the Google redirect, used
  once, good for 14 days (rules allow at most 15), "ביטול" deletes it. The role is granted only by the claim at Google sign-in
  (a new account inside `createProfile` after C9; a guest account through `TeamClaim` in `App.tsx`), never by the typed phone.
- Decision (plan row 110, small additions row 9): no "אורח" segment. Anyone who signs in is a guest; the old "אורח" choice only
  deleted an address set up ahead, which is "ביטול" on its pending row.
- Decision: the pending list is oldest first, as Q27 lists it. Expiry is not in the row meta (no room in Q27); an expired link
  shows "הקישור פג תוקף" in place of "הקישור נשלח …". Roles the person may not give are hidden (a manager sees only מתנדב and
  the line "רק בעלים יכולים למנות מנהלים ובעלים.").
- Needs a design / follow-up: G5 "מנהלים ובעלים" lists pending e-mail invites only; a pending manager link by phone is not
  shown there.
