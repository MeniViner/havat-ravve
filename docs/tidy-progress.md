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

## Stages 2 and 3: roots, forms, lists and details (built; verification running)
One builder per area, each in its own branch, merged into `tidy/placement`:
- **Tasks and projects** (`tidy/s2-tasks`): Q2 (no "עליך" list, four views, red "באיחור" first, bottom rows "בוצעו ביממה
  האחרונה" and, for managers, "משימות חוזרות"; no places row), Q3 (date chip, "עוד פרטים" card with event, note and photo,
  urgent, managers-only; pickers for place, person, event), Q24 ("חוזרת" chip for managers; `/manage/recurring/new` and `/:id`
  open the add form; "פעילה" switch and the 30-day record under the form when editing). T3: tags beside the title, a note or
  photo after done is a timeline line, a free task keeps "לקחת" and hand-over opens from "פנויה". Deletes of task, recurring
  task, project and shopping item are ⋯ in the edit form's header; the place delete is ⋯ in its top bar. Places: table view
  and export in ⋯, back link and lit tab go to the Farm.
- **Shopping and farm** (`tidy/s2-shopfarm`): Q22 (one scrolling suggestion row; "נקנה היום" is one row to history; putting
  an item back moved to history: swipe right "להחזיר"), Q30 ("היום" beside the arrows; owners/volunteers legend only in day
  view), Q31 ("סוג" chips, including "ביקור"), Q17 ("של מי" row with "החלפה" and a picker; "תאריך אחר" beside the day strip).
  Calendar item and presence deletes in ⋯ of their forms; trip delete in ⋯ for managers.
- **Manage** (`tidy/s2-manage`): Q1 (hero, six tiles, two rows; removed duplicates: inbox preview → inbox, calendar → Farm,
  recurring → Tasks, vendors → events, places → Farm card, broadcasts → People), inbox without the card X (row sheet
  "פתיחה" / "מחיקה מהרשימה"), Q4, Q6 (approve opens Q7), Q13, people list ("חסומים" chip, pending slim row; team list and
  role changes now in People `?filter=team` and Activity "אנשים"), Q14 (drill-in sub-routes `/manage/reports/:section`;
  comparison, print, export in ⋯), Q16 (two dropdowns), Q19 (two groups; visit types and sign-up questions page), Q20 (12 API
  codes mapped to Hebrew reasons), visits (history, "לא מתאים", delete in ⋯).
- **Events and event day** (`tidy/s2-events`): Q32, Q12, Q21, Q15, orders (row sheet, Q7 after approval, e-mail status
  line), N12 (⋯: history, confirmation, delete), V3 files (row sheet), Q28/Q29 (account sheet with "הסרה", total, "שילם
  עכשיו", "סגירה", clear the cart with undo), gate "נשמר בטלפון, יישלח כשתהיה קליטה". M4 keeps the outlined "עריכה"; ⋯ only
  on נרשמים and סיכום. Removed as duplicates: E1 recent scans and its search link (gate and Y2 keep them), the gate's
  "נכנסו מתוך" count (M6 and Y1 keep it), the gate's "לדוכן" link (E1 keeps it), E9's manager stat row and the products'
  sales counts (Q12 and Q15 keep them).
- **Vendors** (`tidy/s2-vendor`): Q10 (one WhatsApp button only for vendors who have not answered; ⋯ holds "להזמין את מי
  שהיה ב…" and "נוסח ההזמנה"), Q11 row sheet (reminder, confirmed by phone, not coming this time, vendor card, remove from
  the event through Q8). Pool delete in ⋯ of the vendor's edit form; access removal in ⋯; contact rows on the vendor's own
  screens show WhatsApp and open a sheet with WhatsApp and a call.
- **Profile** (`tidy/s2-system`): Q18 ("עריכת פרטים" underlined link; registration answers only in /me/edit; website, terms
  and demo as quiet links at the bottom; account deletion moved to the bottom of /me/edit).
- Rule 11: a red count only on ניהול.
- Checks on the merged branch: `npx tsc` clean; unit suites tasks 26, projects, shopping, farm 20, manage, events 18, system,
  core and demo; click-throughs delete 79/79, vendor all passed, event day 39/39, broadcast 37/37.

## Stage 4: messages inside People, new audiences (Q23, Q25, Q26)
- "אנשים והודעות" `?tab=messages` is the sent-messages segment (`screens/broadcast/Sent.tsx`): audience tag (warm for the
  team, neutral outside it), read bar, "קראו" / "ראו", filters הכל / לצוות / לאורחים ולכולם; the top bar holds ⋯ on people and
  "+ הודעה חדשה" on messages. Read details at `/manage/people/messages/:id`; `/manage/broadcasts` and `/:id` redirect there.
  Removed duplicate: the owners' top-bar "מחיקה" on a message moved into ⋯.
- Q26: two audience groups with counts. "נרשמי {event}" (everyone holding a ticket that is not cancelled, whatever their
  consent) opens an event picker when more than one event fits. "כל המשתמשים" reaches active users with `updatesOptIn` only.
  The phone preview stays, shown only for a team audience. Outside audiences' notifications open `/`.
- `/me/edit` has "לקבל עדכונים מהחווה" with the U13 note.
- E-mail: a broadcast lane in `api/src/email.ts` sends at most 100 per message and 100 per day, through Brevo only, only on a
  cron run with no payment confirmation due, and stops while Brevo's count is within 100 of its daily limit, so payment
  confirmations always keep room. Skips deleted messages, removed recipients, opted-out people and jobs older than 12 hours.
  With more than 100 people without push in the audience, Q26 says "המייל יגיע ל־100 מהם". Managers create
  `email_outbox/bc_<id>_<uid>` only for recipients of their own message (rules).
- Checks (stage branch): rules 641/641 (54 new), `tests/api.mjs` 375 against a mock Brevo, `v2-broadcast` 66/66.
- Not done: guests get no lock-screen push (`api/src/push.ts` pushes team and vendors only), so they count as "without push"
  and get the e-mail; the Instinct API (`api/src/v2/broadcast.ts`) does not know the two new audiences yet; the Q26 e-mail
  switch starts off while the design shows it on.

## Stage 6: the guest side on the v2 kit (built, merged)
Branch `tidy/s6-guest`, merged into `tidy/placement`. U1-U14 in `src/app/v2/screens/guest/` (home, order, tickets,
account, forms, pages); one pay block serves U4, U6, U9 and U10. Team members reach the same screens through `legacy.tsx`
(their tickets stay at /me/tickets). The old `Guest`, `Account`, `More`, `PaymentConfirmation` and `RegistrationFields`
screens and their css are gone; every capability they held has a new home (signed-out browsing and sign-in: U1, U2, U12,
the order bar; QR, offline, share, calendar: U5/U6 and ⋯; "העברתי": U4, U10, donation page; visits: U8 then the U7 list;
donations: U9 and U7; stall account: U10; contact: U11; registration questions: U13 and edit details; payment confirmation
choice: U3/U9 and U7; notifications: U7 sheet and the U14 row; install, terms, privacy: U7 footer; account deletion: bottom of
edit details; blocked page; demo: U12 quiet link and /demo).
- Merge: the first-visit demo (PR #24) now runs in the new guest shell (`DemoIntro shell="guest"`), and the guest demo
  strip's יציאה goes where the team one goes (`leaveDemoTarget()`: back to the account after its own demo).
- The guest account (U7) has no "מצב הדגמה" row any more, so the guest wording in `INTRO_DECLINED` (`src/app/demo/intro.ts`)
  now names the sign-in page entry: "אפשר לחזור לדמו בכל רגע מעמוד הכניסה, ב״לראות איך האפליקציה עובדת״".
- Removed as duplicates: the claimed-donation strip (the U7 tag shows it), the ticket dots ("כרטיס i מתוך n" instead).

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
- Checks: `npm run test:rules` 631/631 (44 new cases: who may create, single use, expiry, cancel, nobody raises their own
  role without a valid link); claim flow on the emulators 21/21 (claimed once, a second account refused, a guest became a
  manager, a cancelled link refused). The demo count is 3 (the seed had two e-mail invites; one phone invite added).

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
- Guest side: the intro moved to the bottom of home; `payment.note` shows in the U4 note; the missing-details nudge and "לא
  אני" stay; the old on-device "new events" switch is replaced by `updatesOptIn`; U2's top bar has two icons as in the design;
  U7 "הכל" shows 7 (the seed has a visit too).

## Open decisions (defaults implemented)
- Delete on detail screens that keep the outlined "עריכה" (task, shopping item, event, project, vendor card, calendar item,
  presence, product, recurring): ⋯ in the edit form's header next to "ביטול", then "מחיקה" and Q8. Delete is one step deeper
  than before. Alternative for Meni: ⋯ replaces "עריכה" on the detail, with "עריכה" as its first item.
- M2 "מה שטופל" and C1 "מה לקבל" are text links beside the back link in their approved designs (rule 5 forbids them): kept
  until Meni decides (⋯, or keep).
- The gate no longer shows the managers' "נכנסו מתוך" count (a duplicate of M6 and Y1); managers at the gate open it from
  ניהול. Say if it should come back.
- Q24: "בלי תאריך" stays among the "מתי" chips (Q24 leaves it out), so with "חוזרת" the chips wrap to two lines. "הוספה, ועוד
  אחת" stays under the add button (approved T5).
- The add-note and add-photo buttons after a task is done stay in T3's body (its top bar keeps "עריכה").
- Event-file image preview is gone; "פתיחה" opens the file.
- Consent for update messages to all users: opt-in only (`updatesOptIn`).
- A signed-in guest has no demo entry on U7 (the design's footer is יציאה, התקנה, האתר, תנאים). The way back is the sign-in
  page or /demo. Alternative: a fifth quiet link "הדגמה" in the U7 footer.
- Web Push or FCM: still waiting for Meni's test on an installed iPhone app.

## Needs a design (left as they are)
- The install banner and its X on every team screen, roots included (rule 2); Q18 has the "התקנה" row.
- Contact messages and stall requests in the inbox: no detail screen for the card's dismiss and the sender link.
- The managers' projects block on the Tasks root (older than the parity round; not on Q2).
- Extra stat tiles not on the Q screens: donations "ממתין" (Q4 has three), reports "חוזרות בזמן" / "פתוחות באיחור" (Q14 has
  four), event summary "יצאו וחזרו" (Q15).
- Vendor pool export and table view: the V1 top bar already holds "חדש" (rule 5 allows one control).
- From the first-visit demo session: a role-level demo switch in Settings.
- From the guest builder: the team-only "מה יש לי בחווה" row on the team tickets page; the visit and donation detail pages
  reached from U7's list.
- G5 "מנהלים ובעלים" lists pending e-mail invites only; a pending manager link sent by phone is not shown there.
