# Tidy round (placement): progress log

Task: `havat-raveh-tidy/PROMPT.md` (Meni, 2026-11-23). Rules: `havat-raveh-tidy/RULES.md`. Screens: `havat-raveh-tidy/design/SCREENS.md`
(46: Q1-Q32 team, U1-U14 guest). The design folder is kept outside git (`.gitignore`), like `havat-raveh-redesign/`.

Branch `tidy/placement`, pull request to `main`, not merged (Meni merges after the preview). Nothing deployed, no `firebase deploy`,
no `wrangler deploy`. Emulators and demo mode only.

Plan and inventory: `docs/tidy-plan.md`.

## Stage 0: inventory and plan
- In progress: inventory of every user-visible addition from the parity, delete-everywhere, places and Instinct-log commits.

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
- Q7 e-mail row: offered only when the guest chose e-mail, because the Worker sends the automatic e-mail only then
  (`api/src/email.ts`). "בלי אישור" for such a guest records a manual confirmation so the e-mail does not go out.
- Q9 table view: the search field of the old table sheet is not in the design and is dropped; sorting by a heading stays.

## Open decisions (defaults implemented)
- Consent for update messages to all users: opt-in only (`updatesOptIn`).
- Web Push or FCM: still waiting for Meni's test on an installed iPhone app.

## Needs a design
- (none yet)
