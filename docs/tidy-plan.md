# Tidy round (placement): inventory and plan

Stage 0 output for `havat-raveh-tidy/PROMPT.md`. Read with `havat-raveh-tidy/RULES.md` (13 placement rules plus the
small-additions table) and `havat-raveh-tidy/design/SCREENS.md` (Q1-Q32 team, U1-U14 guest).

## What was inventoried

Every control or block a user can see that was added by:

- the parity commit `5916c65`, which restored every capability v2 lost compared with the live app;
- the delete-everywhere commits `25010f2` (kit `ConfirmSheet` and `useRemove`), `076fef8`, `a308e03` and `94b87d2`;
- the places commits `284b57f` (link on Manage) and `7b93523` (Farm card);
- the Instinct log commit `add49a0`;
- the swipe commits `2e8fdc6` and `bd10476` (PR #23). They are listed only to record that they stay.

I read the current tree on `tidy/placement` at `7861644`, which already contains stage 1 (`d060644`) and the rule 11 nav
fix (`e9e0ab8`). Line numbers point at that tree.

Each row is one distinct control or block on one screen. Every delete control is its own row, and so is every "צפייה בטבלה"
and every "אקסל". The kit `ExcelButton` (`manage/shared.tsx:39`) draws both buttons, so each of its usages takes two rows.
Behaviour-only restorations that add no control (redirects, fallbacks, permissions) are listed once each so the parity
record is complete. All of them are "Rule: keep".

**Count per disposition** (219 rows):

| Disposition | Rows |
|---|---|
| Q screen | 98 |
| Rule | 89 |
| Remove (duplicate) | 21 |
| Needs a design | 11 |

No row removes a capability. Every "Remove (duplicate)" row names the entry point that stays.

Stage numbers: 1 shared patterns, 2 roots and forms, 3 lists and details, 4 messages, 5 invite by phone, 6 guest, 7 demo.

Commit shorthand used in the table:

| Shorthand | Commit |
|---|---|
| P | `5916c65`, parity |
| D-t | `076fef8`, delete: tasks, recurring, places, shopping, calendar, presence |
| D-e | `a308e03`, delete: events, products, files, orders, stall tabs, stalls |
| D-m | `94b87d2`, delete: projects, broadcasts, people, visits, donations, inbox items, stall requests |
| PL | `284b57f` (Manage places link) and `7b93523` (Farm places card) |
| IL | `add49a0`, Instinct log |
| SW | `2e8fdc6` and `bd10476`, PR #23 swipe |

## Inventory

| # | Area | Screen (file / route) | Addition (control or block) | Capability | Source commit | Disposition | Destination / note | Stage |
|---|---|---|---|---|---|---|---|---|
| 1 | Shell | `App.tsx:116-122`, team nav | Red count badges on משימות, קניות, החווה | See how much waits | P | Rule | Rule 11 (small additions row 14). Already applied in `e9e0ab8`: the count stays on ניהול only, and the bell carries the personal count | 1 |
| 2 | Shell | `misc.tsx:122-150`, rendered from `App.tsx:56` | Install banner strip on every team screen, roots included | Install the PWA | P | Needs a design | Rule 2 forbids it on roots. Q18 already has the "התקנה" row, but the strip is the only prompt for people who never open /me. Leave it as is until designed | 1 |
| 3 | Shell | `system/misc.tsx:147` | X on the install strip | Dismiss the install prompt | P | Needs a design | Goes with row 2 | 1 |
| 4 | Shell | `App.tsx:121` | Event tab for every team member on event day | Crew without a manager role reach E1 | P | Rule | Behaviour only. Keep: one home (rule 1) | 2 |
| 5 | Shell | `routes.tsx:144`, VENDOR_LEGACY | Old vendor pages still open | Vendors' saved links | P | Rule | Behaviour only. Keep | 2 |
| 6 | Shell | `routes.tsx:150`, /me/account | Redirect to /me | Old links | P | Rule | Behaviour only. Keep | 2 |
| 7 | Manage root | `manage/Root.tsx:47-54` | Inbox preview list under the hero | See waiting items at a glance | P | Remove (duplicate) | Duplicates the hero count and the M2 inbox (/manage/inbox), which the hero opens. Rules 3 and 7 | 2 |
| 8 | Manage root | `manage/Root.tsx:62` | Row "יומן" | Open the calendar | P | Remove (duplicate) | The calendar stays on the Farm tab (F1, `farm/root.tsx`). Rule 1 | 2 |
| 9 | Manage root | `manage/Root.tsx:63` | Row "משימות חוזרות" | Recurring tasks list | P | Remove (duplicate) | Stays as the Q2 bottom row "משימות חוזרות · n · רק מנהלים רואים" (`tasks/Root.tsx:158`) | 2 |
| 10 | Manage root | `manage/Root.tsx:64` | Row "בעלי דוכנים" | Vendor pool (V1) | P | Remove (duplicate) | Stays as the link on the events list (`events/list.tsx:59`, /manage/vendors) | 2 |
| 11 | Manage root | `manage/Root.tsx:65` | Row "הודעות לצוות" | Broadcasts | P | Q screen | Q1 tile "אנשים והודעות". Messages live inside People (Q25, Q26) | 2 |
| 12 | Manage root | `manage/Root.tsx:66` | Row "מקומות בחווה" | Places list | PL | Remove (duplicate) | Stays as the Farm tab places card (`farm/root.tsx:103`). Small additions row 13 | 2 |
| 13 | Manage root | `manage/Root.tsx:67` | Row "כל הפעילות" | Activity log | P | Q screen | Q1, first row under the tiles: "כל הפעילות · מי עשה מה באפליקציה, ומתי" | 2 |
| 14 | Manage root | `manage/Root.tsx:68` | Row "יומן אינסטינקט" (owners) | Instinct log | IL | Q screen | Q1, second row: "מה העוזר האישי עשה בשמך · רק בעלים" | 2 |
| 15 | Manage inbox | `manage/Root.tsx:123`, /manage/inbox | Top-bar text link "מה שטופל" | Handled items history | P | Rule | Rule 5: the one top-bar control on M2, as the approved M2 design shows. Re-skin as a quiet control, not a text link beside back. See risks | 3 |
| 16 | Manage inbox | `manage/Root.tsx:130-132` | Chips קבלות / דוכן / הזמנות | Filter the inbox by kind | P | Rule | Small additions row 8 pattern: more chips in the one scrolling chip row (as in Q22) | 3 |
| 17 | Manage inbox | `manage/Root.tsx:159`, `Deletable` at 167, contact card at 196 | X on a contact-message card | Dismiss or delete a contact message | D-m | Needs a design | Small additions row 1 says to remove the X and put delete behind ⋯ in the item's detail, but contact messages have no detail screen | 3 |
| 18 | Manage inbox | `manage/Root.tsx:159`, vendor-request card at 181 | X on a stall request card ("נגמר לי משהו") | Dismiss a stall request | D-m | Needs a design | Same as row 17: no detail screen for a stall request | 3 |
| 19 | Manage inbox | `manage/Root.tsx:216` | Sender link `manage-inline-link` inside a card | Open the sender's person card | P | Needs a design | Rule 4 allows one action per card, so the link belongs in the missing detail of rows 17-18 | 3 |
| 20 | Tasks | `tasks/Root.tsx:26` | "פנויות" segment | Unassigned tasks | P | Q screen | Q2 segments: לפי מקום / לפי זמן / רק שלי / פנויות | 2 |
| 21 | Tasks | `tasks/Root.tsx:86`, `:137` | "באיחור" group | Late tasks first | P | Q screen | Q2 "באיחור" group | 2 |
| 22 | Tasks | `tasks/Root.tsx:107` | Load-error strip | Say the list failed to load | P | Rule | Rule 12: a short Hebrew sentence. Keep | 2 |
| 23 | Tasks | `tasks/Root.tsx:109` | "עליך" list above the by-place list | My open tasks | P | Remove (duplicate) | The same tasks stay under the Q2 "רק שלי" segment. Rule 7 names this list | 2 |
| 24 | Tasks | `tasks/Root.tsx:117` | Heading "כל המשימות בחווה" | Separate the "עליך" copy from the full list | P | Remove (duplicate) | Exists only to split the duplicate list in row 23, so it goes with it | 2 |
| 25 | Tasks | `tasks/Root.tsx:116` | Managers' projects block | Projects at a glance | earlier (not parity) | Needs a design | Not pictured on Q2, and rule 2 keeps roots closed. Do not remove it unasked; keep it as is and ask Meni (risks) | 2 |
| 26 | Tasks | `tasks/Root.tsx:120` | Event filter chip with × ("משימות לאירוע …") | Tasks of one event | P | Q screen | Q2 chip row state (selected chip). The × on a filter chip is a chip control, not a row X | 2 |
| 27 | Tasks | `tasks/Root.tsx:157` | Bottom row "בוצעו ביממה האחרונה · n" | History | P | Q screen | Q2 bottom row | 2 |
| 28 | Tasks | `tasks/Root.tsx:158` | Bottom row "משימות חוזרות" | Recurring list (managers) | P | Q screen | Q2 bottom row "משימות חוזרות · 5 · רק מנהלים רואים" | 2 |
| 29 | Tasks | `tasks/Root.tsx:159` | Bottom row "מקומות" | Places list | PL | Remove (duplicate) | Stays as the Farm tab places card (`farm/root.tsx:103`). Q2 has no places row | 2 |
| 30 | Tasks | `tasks/shared.tsx:128` | Swipe on owner task rows (right: done / take, left: delete with undo / move) | Fast actions | SW | Rule | Keep (PR #23, a hidden action). Kit `Row swipe` prop. See risks for the rule 6 note | 3 |
| 31 | Tasks | `tasks/shared.tsx:133` | "לקחת" icon button on a free task row | Take a task | P | Rule | Rule 4: the one trailing control on the row. Keep | 3 |
| 32 | Tasks | `tasks/shared.tsx:73` | Take toast with undo | Undo a take | P | Rule | Behaviour only. Keep | 3 |
| 33 | Tasks | `tasks/shared.tsx:128`, TaskRow tags | Second tag (managers-only, late) on task rows | Status at a glance | P | Rule | Rule 4: one tag by precedence (late, then urgent, then managers-only) | 3 |
| 34 | Task detail | `tasks/Task.tsx:58`, `:95` | Header tags (urgent, managers-only, event) | Status on the task | P | Rule | Small additions row 4: kit tags beside the title | 3 |
| 35 | Task detail | `tasks/Task.tsx:60`, `:72` | "לקחת" plus "להעביר" inline buttons on the "על מי" row | Take or hand over | P | Rule | Rule 4: one control. The "על מי" row opens C4 (hand over), and "לקחת" stays the row's single button. See risks | 3 |
| 36 | Task detail | `tasks/Task.tsx:107-121` | Add photo / add note buttons and textarea after done | Note or photo after done | P | Rule | Small additions row 4: the note or photo shows as a timeline line. Where the add control sits is open (risks) | 3 |
| 37 | Task detail | `tasks/Task.tsx:93` | Outlined "עריכה" in the top bar | Edit the task | earlier | Rule | Decided: detail screens keep the outlined "עריכה". It is the one top-bar control (rule 5) | 3 |
| 38 | Task form | `tasks/Add.tsx:203-207` | Date chip and date field | Due date | P | Q screen | Q3 date chip ("שישי 27.11") in the existing chip group | 2 |
| 39 | Task form | `tasks/Add.tsx:209` | "לאיזה אירוע?" choice group | Link a task to an event | P | Q screen | Q3 "עוד פרטים" card, row "קשור לאירוע" (a picker row, rule 9) | 2 |
| 40 | Task form | `tasks/Add.tsx:216`, `:246` | "הערה" buttons (note, photo) | Note and photo on a task | P | Q screen | Q3 "עוד פרטים" card, row "הערה ותמונה" | 2 |
| 41 | Task form | `tasks/Add.tsx` urgent toggle | "דחוף" | Mark urgent | P | Q screen | Q3 "עוד פרטים" card, "דחוף" | 2 |
| 42 | Task form | `tasks/Add.tsx:233-236` | "קונים בדרך כלל" suggestions | Quick shopping items | P | Q screen | Q22 / S5 add flow (shopping side of the capture bar). Keep in the shopping add only | 2 |
| 43 | Task form | `tasks/Add.tsx:201` | "מי" people chips | Assign to a person | earlier | Rule | Rule 9: more than five options becomes a picker row (Q17 "של מי" pattern) | 2 |
| 44 | Task form | Q24 recurring in the add form | "חוזרת" chip | Create a recurring task | P | Q screen | Q24: "חוזרת" chip in the add form (decided) | 2 |
| 45 | Task form | `tasks/Add.tsx:227` | Red "מחיקת המשימה" at the bottom of the edit form | Delete a task | D-t | Rule | Rule 6: ⋯ → מחיקה → Q8. T3 keeps "עריכה", so ⋯ sits in the edit form header beside ביטול (default, see risks) | 2 |
| 46 | Recurring | `tasks/Recurring.tsx:36` | "חדשה" in the recurring list | New recurring task | P | Q screen | Q24: new recurring tasks start from the add form with the "חוזרת" chip. The list keeps one primary only if Q2's row shows it | 2 |
| 47 | Recurring | `tasks/Recurring.tsx:46` | "Done 30 days" record on list rows | Track record | P | Rule | Small additions row 5: out of the list rows (title, schedule, switch), into the detail | 3 |
| 48 | Recurring | `tasks/Recurring.tsx:116` | "הסבר קצר" note field | Note on a recurring task | P | Rule | Small additions row 5: card under the form in the recurring detail | 2 |
| 49 | Recurring | `tasks/Recurring.tsx:139` | 30-day record card | Track record | P | Rule | Small additions row 5: card under the form | 3 |
| 50 | Recurring | `tasks/Recurring.tsx:111` | Bottom-bar "מחיקה" | Delete a recurring task | D-t | Rule | Rule 6: ⋯ in the recurring detail header → Q8 | 2 |
| 51 | Task history | `tasks/History.tsx:61` | "סיכום היום" text link | Day summary | P | Rule | Rule 5: ⋯ on T6 | 3 |
| 52 | Task history | `tasks/History.tsx:74` | Cap line ("showing the last n") | Say the list is capped | P | Rule | Rule 12. Keep as one quiet line | 3 |
| 53 | Places | `tasks/Places.tsx:17`, `:37` | placesBack (`?from=manage`) | Back to where the list was opened | PL | Rule | Behaviour only. Keep; once row 12 goes, the `from=manage` branch is unused (risks) | 3 |
| 54 | Places | `tasks/Places.tsx:50` | "צפייה בטבלה" at the bottom of L1 | Places as a table | P | Rule | Rule 5: ⋯ on L1 → Q5 item "צפייה בטבלה" (Q9) | 3 |
| 55 | Places | `tasks/Places.tsx:50` | "אקסל" at the bottom of L1 | Export places | P | Rule | Rule 5: ⋯ on L1 → "ייצוא לאקסל" | 3 |
| 56 | Place | `tasks/Places.tsx:114` | Top-bar "מחיקה" on L4 | Delete a place | D-t | Rule | Rule 6: top-bar ⋯ on L4 → מחיקה → Q8 | 3 |
| 57 | Shopping | `shopping/Root.tsx:79` | Filter chips | Filter the list | P | Q screen | Q22: one scrolling chip row | 2 |
| 58 | Shopping | `shopping/Root.tsx:94`, `:107` | Swipe on shopping rows (right: bought, left: delete with undo) | Fast actions | SW | Rule | Keep (PR #23) | 3 |
| 59 | Shopping | `shopping/Root.tsx:117` | History link | Bought history | P | Q screen | Q22 row "נקנה היום · 2 · להיסטוריה" | 2 |
| 60 | Shopping history | `shopping/History.tsx:14` | "מחפשים" chip | Search the history | P | Rule | Small additions row 8 pattern: one more chip in the existing chip row | 3 |
| 61 | Shopping history | `shopping/History.tsx:49` | "שוב" button per row | Re-add an item | P | Rule | Rule 4: the row's single trailing control. Keep | 3 |
| 62 | Shopping history | `shopping/History.tsx:55` | Cap line | Say the list is capped | P | Rule | Rule 12. Keep | 3 |
| 63 | Shopping item | `shopping/Item.tsx:71` (עריכה at `:74`) | Bottom-bar "מחיקה" on S4 | Delete an item | D-t | Rule | Rule 6. S4 keeps "עריכה" in the top bar, so ⋯ goes in the edit form header (default, risks). Swipe-left delete on the list stays | 3 |
| 64 | Shopping trip | `shopping/Trip.tsx:145` | Red "מחיקת הקנייה" | Delete a trip | D-t | Rule | Rule 6: top-bar ⋯ on the trip → Q8 | 3 |
| 65 | Farm | `farm/root.tsx:103` | Places card | Places list (L1) | PL | Rule | Rule 1: the one home of places. Keep; it is the destination of rows 12 and 29 | 2 |
| 66 | Calendar | `farm/calendar.tsx:75`, `:138`, `:177` | "היום" button in month / week / day | Jump to today | P | Q screen | Q30 "היום" button | 3 |
| 67 | Calendar | `farm/parts.tsx:32-35` | Arrows with onToday | Same as row 66 (shared part) | P | Q screen | Q30. One control, not repeated per view | 3 |
| 68 | Calendar | `farm/calendar.tsx:192-195` | Legend in the day view | Read the colours | P | Rule | Small additions row 6: day view only, one line under the hour axis. The Q30 month legend is the designed one | 3 |
| 69 | Calendar | `farm/calendar.tsx:48` | Presence lines with a date | Who is at the farm | P | Q screen | Q30 month legend "כמה בחווה" | 3 |
| 70 | Calendar | `farm/calendar.tsx:209` | Staff bar | Staff on the day | P | Q screen | Q30 day view | 3 |
| 71 | Calendar item | `farm/calitem.tsx:80-86` | "סוג פריט" chips | Item kind | P | Q screen | Q31 "סוג" chips פגישה / ביקור / הכנות לאירוע / אחר | 2 |
| 72 | Calendar item | `farm/calitem.tsx:90` | OtherDate | Pick another date | P | Q screen | Q31 day strip plus the Q17 "תאריך אחר" link | 2 |
| 73 | Calendar item | `farm/calitem.tsx:74` | Red "מחיקה מהיומן" | Delete a calendar item | D-t | Rule | Rule 6: ⋯ in the form header → Q8 (form only, no detail screen) | 2 |
| 74 | Presence | `farm/presence.tsx:89-95` | "מי בחווה" chip grid | Pick a person | P | Q screen | Q17 "של מי" row with החלפה (picker; rule 9) | 2 |
| 75 | Presence | `farm/presence.tsx:100`, `farm/parts.tsx:55` | OtherDate | Another date | P | Q screen | Q17 "תאריך אחר" link | 2 |
| 76 | Presence | `farm/presence.tsx:81` | Red "הסרה מהיומן" | Delete a presence entry | D-t | Rule | Rule 6: ⋯ in the form header → Q8 | 2 |
| 77 | Donations | `manage/Money.tsx:142` | "צפייה בטבלה" | Donations as a table | P | Q screen | Q4 top-bar ⋯ → Q5 "צפייה בטבלה · כל העמודות, כמו בקובץ" → Q9 | 3 |
| 78 | Donations | `manage/Money.tsx:142` | "אקסל" | Export donations | P | Q screen | Q4 ⋯ → Q5 "ייצוא לאקסל" | 3 |
| 79 | Donations | `manage/Money.tsx:150` | "ממתין" sum tile | Sum waiting for approval | P | Needs a design | Q4 shows three stats (החודש, השנה, מחכות לקבלה). A fourth tile has no home | 3 |
| 80 | Donations | `manage/Money.tsx:154-160` | Chips: month, approve, receipt, memorial, year, all | Filter donations | P | Q screen | Q4 chips החודש / לאישור / צריכות קבלה, continuing in the scrolling row (memorial, year, all) | 3 |
| 81 | Donations | `manage/Money.tsx:166`, `rowActs` at 130 | Row with amount plus inline actions (approve, receipt, WhatsApp) | Act on a donation from the list | P | Q screen | Q4 rows: name, tag, meta, amount. The actions move to Q6 on the detail | 3 |
| 82 | Donation | `manage/Money.tsx:209` | Top-bar "מחיקה" | Delete a donation | D-m | Q screen | Q6 top-bar ⋯ → מחיקה → Q8 "למחוק את התרומה?" | 3 |
| 83 | Donation | `manage/Money.tsx:227` | Donor card | Contact the donor, past gifts | P | Q screen | Q6 actions "תודה בוואטסאפ", "התקשרות", "עוד ממיכל · לתיק שלה" | 3 |
| 84 | Donation | `manage/Money.tsx:233` | PayConfirm | Confirm payment to the donor | P | Q screen | Q6 "אישור תשלום" → Q7 sheet | 3 |
| 85 | Donation | `manage/Money.tsx:236` | "להחזיר לממתין" | Undo approval | P | Q screen | Q6 top-bar ⋯ → "להחזיר לממתין" (next to "עוד לא הגיע" on the detail) | 3 |
| 86 | Donation | `manage/Money.tsx:248` | History card | Change history | P | Q screen | Q6 ⋯ → Q5 "היסטוריית שינויים" | 3 |
| 87 | Reports | `manage/Money.tsx:47` | "צפייה בטבלה" | Report as a table | P | Q screen | Q14 top-bar ⋯ → Q5 → Q9 | 3 |
| 88 | Reports | `manage/Money.tsx:47` | "אקסל" | Export the report | P | Q screen | Q14 ⋯ → "ייצוא לאקסל" | 3 |
| 89 | Reports | `manage/Money.tsx:63-66` | Tiles "חוזרות בזמן", "פתוחות באיחור" | Recurring and late task stats | P | Needs a design | Q14 has four stats and "מי ביצע". No home for two more tiles | 3 |
| 90 | Reports | `manage/Money.tsx:69` | "צפייה בטבלה" in the "מי ביצע" header | Tasks as a table | P | Q screen | Q14 ⋯, second table item ("משימות") | 3 |
| 91 | Reports | `manage/Money.tsx:69` | "אקסל" in the "מי ביצע" header | Export tasks | P | Q screen | Q14 ⋯, second export item | 3 |
| 92 | Reports | `manage/Money.tsx:81-86` | "אנשים" section | People counts | P | Q screen | Q14 drill row "אנשים ונרשמים · איך שמעו עלינו" | 3 |
| 93 | Reports | `manage/Money.tsx:87-92` | "איך שמעו עלינו" section | Source of sign-ups | P | Q screen | Same Q14 drill row (inside the drill-in) | 3 |
| 94 | Reports | `manage/Money.tsx:93-97`, PastEventRow at 102 | Past events list and "כל האירועים" text link | Past event results | P | Q screen | Q14 drill row "אירועים". Each event opens Q15 | 3 |
| 95 | Reports | Q14 "חובות פתוחים" | Open debts block | Who owes | P | Q screen | Q14 drill row "חובות פתוחים" | 3 |
| 96 | Visits | `manage/Visits.tsx:30` | "צפייה בטבלה" | Visits as a table | P | Rule | Small additions row 7: ⋯ on the visits list → Q9 | 3 |
| 97 | Visits | `manage/Visits.tsx:30` | "אקסל" | Export visits | P | Rule | Small additions row 7: ⋯ on the visits list | 3 |
| 98 | Visits | `manage/Visits.tsx:46` | Row "סוגי ביקור" | Edit visit types | P | Remove (duplicate) | Stays in Settings (`manage/Settings.tsx:42`, Q19) | 3 |
| 99 | Visit | `manage/Visits.tsx:88` | Top-bar "מחיקה" | Delete a visit | D-m | Rule | Rule 6: top-bar ⋯ on the visit → Q8 | 3 |
| 100 | Visit | `manage/Visits.tsx:113` | Quiet "לא מתאים" | Decline a visit request | P | Rule | Rule 5: ⋯ on the visit (it is an approved action, not a delete) | 3 |
| 101 | Visit | `manage/Visits.tsx:114` | History card | Visit history | P | Rule | Small additions row 7: ⋯ on the visit → "היסטוריית שינויים" | 3 |
| 102 | People | `manage/People.tsx:51-53` | "צפייה בטבלה" | People as a table | P | Q screen | Q23 top-bar ⋯ → Q9 | 3 |
| 103 | People | `manage/People.tsx:51-53` | "אקסל" | Export people | P | Q screen | Q23 ⋯ → "ייצוא לאקסל" | 3 |
| 104 | People | `manage/People.tsx:62` | "חסומים" chip | Blocked people | P | Q screen | Q23, one more chip in the scrolling row (small additions row 8) | 3 |
| 105 | People | `manage/People.tsx:64-66` | Slim row "כתובות הוגדרו ועוד לא נכנסו" | Pending invites | P | Q screen | Q23 slim row "2 נוספו מראש ועוד לא נכנסו" (small additions row 8) | 5 |
| 106 | Person | `manage/People.tsx:135` | Top-bar "חסימה" | Block a person | P | Q screen | Q13 top-bar ⋯ → "חסימה" | 3 |
| 107 | Person | `manage/People.tsx:163` | "הערות מנהלים" textarea | Managers' note | P | Q screen | Q13 "הערה של מנהלים" card with עריכה | 3 |
| 108 | Person | `manage/People.tsx:166` | History card | Person history | P | Q screen | Q13 row "היסטוריה · 4" | 3 |
| 109 | Person | `manage/People.tsx:171` | Red "מחיקת X" | Delete a person (owner) | D-m | Q screen | Q13 ⋯ → מחיקה → Q8 | 3 |
| 110 | Invite | `manage/People.tsx:209` | Invite segment with 'guest' | Invite a guest | P | Q screen | Q27: a fourth segment "אורח" only if needed (small additions row 9). Log the decision in tidy-progress | 5 |
| 111 | Invite | `manage/People.tsx:216` | Cancel a pending invite | Withdraw an invite | P | Q screen | Q23 pending slim row → the pending list, a row sheet with "ביטול ההזמנה" (Q11 pattern) | 5 |
| 112 | Invite | Q27 | Phone or e-mail invite ("לפי טלפון" / "לפי מייל") | Invite by phone | new in Q27 | Q screen | Q27 (stage 5) | 5 |
| 113 | Settings | `manage/Settings.tsx:40-41` | Payments and donation-amount rows for managers | Managers set payments | P | Q screen | Q19 group "כסף ואורחים" | 3 |
| 114 | Settings | `manage/Settings.tsx:99` | Read-only hint | Say why a field is locked | P | Rule | Rule 12. Keep | 3 |
| 115 | Settings | `manage/Settings.tsx:253` | "ענו: n מתוך m" | Answer count of a sign-up question | P | Rule | Rule 4: the one meta line on the question row | 3 |
| 116 | Settings | `manage/Settings.tsx:307` | Red "הסרת השאלה" in the question sheet | Delete a sign-up question | P | Rule | Row sheet: destructive action in its own group, red, then Q8 (Q11 pattern) | 3 |
| 117 | Managers page | `manage/Settings.tsx:383` | "צוות ומתנדבים" card with "כולם באנשים" text link | Team list | P | Remove (duplicate) | Stays as People filtered to the team (Q23, /manage/people?filter=team) | 3 |
| 118 | Managers page | `manage/Settings.tsx:387` | "שינויים אחרונים" | Recent changes | P | Remove (duplicate) | Stays in Activity (Q16) under the "אנשים" type | 3 |
| 119 | Activity | `manage/Activity.tsx:58` | "צפייה בטבלה" | Activity as a table | P | Q screen | Q16 top-bar ⋯ → Q9 | 3 |
| 120 | Activity | `manage/Activity.tsx:63` | "אקסל" (top bar) | Export activity | P | Q screen | Q16 ⋯ → "ייצוא לאקסל" | 3 |
| 121 | Activity | `manage/Activity.tsx:66-69` | Type filters, EVENT_FILTERS for `?event=` | Filter by type, event history | P | Q screen | Q16 dropdown "כל הסוגים". Event history is the same screen opened with `?event=` | 3 |
| 122 | Activity | `manage/Activity.tsx:72` | Person chip row "מי" | Filter by person | P | Q screen | Q16 dropdown "כל האנשים" (rule 9) | 3 |
| 123 | Activity | `manage/Activity.tsx:91` | Second meta line "דרך <key>" | Which key did it | IL | Q screen | Q16: joins the one meta line ("… · דרך X"). Rule 4 | 3 |
| 124 | Instinct log | `manage/InstinctLog.tsx:22` | SHOW chips | Filter by result | IL | Q screen | Q20 chips שינויים / לא הצליחו / קריאות / הכל | 3 |
| 125 | Instinct log | `manage/InstinctLog.tsx:57` | "צפייה בטבלה" | Log as a table | IL | Q screen | Q20 top-bar ⋯ → Q9 | 3 |
| 126 | Instinct log | `manage/InstinctLog.tsx:62` | "אקסל" (top bar) | Export the log, raw fields included | IL | Q screen | Q20 ⋯ → "ייצוא לאקסל". Raw data lives here | 3 |
| 127 | Instinct log | `manage/InstinctLog.tsx:64` | Search | Find a request | IL | Q screen | Not pictured on Q20. Keep with the Q16 pattern (risks) | 3 |
| 128 | Instinct log | `manage/InstinctLog.tsx:68-73` | Key chips "כל המפתחות" | Filter by key | IL | Q screen | Not pictured on Q20. Keep as a dropdown, Q16 pattern (risks) | 3 |
| 129 | Instinct log | `manage/InstinctLog.tsx:86`, `:88` | Title "keyLabel verb", raw `e.code` tag, "חזרה על בקשה" | Read what happened | IL | Q screen | Q20 Hebrew sentences under a day header "היום · בשם בני". No raw code (rule 12) | 3 |
| 130 | Instinct log | `manage/InstinctLog.tsx:95`, sheet at 97-116 | "עוד" button and raw detail sheet (op, credential id, status, refs, request id, JSON) | Debug a request | IL | Q screen | Q20 "לחיצה על שורה פותחת את הדבר עצמו". The raw sheet goes; the raw fields stay in the export (row 126) | 3 |
| 131 | Instinct log | `manage/InstinctLog.tsx:49-54` | "רק לבעלים" empty state | Explain owners only | IL | Rule | Rule 12. Keep | 3 |
| 132 | Event | `events/event.tsx:39-40` | Top-bar outlined "עריכה" on M4 | Edit the event | earlier | Rule | Decided: details keep the outlined "עריכה". It is the one top-bar control | 3 |
| 133 | Event | `events/event.tsx:86` | Second tag "פתוח להרשמה" / "ההרשמה סגורה" | Registration state | P | Rule | Rule 4: one status tag; the registration state goes into the meta line | 3 |
| 134 | Event guests | `events/event.tsx:148-149` | Chips הגיעו / בוטלו | Filter guests | P | Rule | Small additions row 8 pattern: more chips in the existing chip row | 3 |
| 135 | Event guests | `events/event.tsx:181` | "אקסל" button row | Export guests | P | Rule | Rule 5: ⋯ on the guests screen → "ייצוא לאקסל" | 3 |
| 136 | Order sheet | `events/event.tsx:244` | PayConfirm in the order sheet | Confirm payment to a buyer | P | Q screen | Q7 sheet (WhatsApp / e-mail / none, with preview) | 3 |
| 137 | Order sheet | `events/event.tsx:252` | "הכרטיס של" link | Open the guest's ticket | P | Rule | Rule 4: an item in the row sheet (Q11 pattern) | 3 |
| 138 | Order sheet | `events/event.tsx:253` | Red "ביטול ההזמנה" | Cancel an order | D-e | Rule | Row sheet, destructive group, red (Q11 pattern), then Q8 | 3 |
| 139 | Order sheet | `events/event.tsx:254` | Quiet "מחיקת ההזמנה" | Delete an order | D-e | Rule | Same destructive group in the order sheet → Q8 | 3 |
| 140 | Event summary | `events/event.tsx:376` | "הגעה" tile | Arrival rate | P | Q screen | Q15 stat "הגיעו · 84%" (merged into the stat) | 3 |
| 141 | Event summary | `events/event.tsx:377` | "יצאו וחזרו" tile | Re-entry count | P | Needs a design | Not among the four Q15 stats | 3 |
| 142 | Event summary | `events/event.tsx:379` | "כסף" card | Event money | P | Q screen | Q15 drill row "כסף" | 3 |
| 143 | Event summary | `events/event.tsx:400` | "לעומת אירועים קודמים" | Compare to past events | P | Q screen | Q15 drill row "לעומת אירועים קודמים" (small additions row 7, report comparison) | 3 |
| 144 | Event summary | `events/event.tsx:405` | "ייצוא לאקסל" button | Export the event | P | Q screen | Q15 top-bar ⋯ → "ייצוא לאקסל" | 3 |
| 145 | Event summary | `events/event.tsx:406` | "היסטוריית האירוע" button | Event history | P | Q screen | Q15 ⋯ → "היסטוריית שינויים" (opens Q16 with `?event=`) | 3 |
| 146 | Event summary | `events/event.tsx:407` | "הדפסה" button | Print | P | Q screen | Q15 ⋯ → "הדפסה" | 3 |
| 147 | Event form | `events/form.tsx:94`, `:127` | "מסתיים" end date | Multi-day events | P | Q screen | Q32 "מתאריך" / "עד תאריך" | 2 |
| 148 | Event form | `events/form.tsx:147` | Red "מחיקת האירוע" | Delete an event | D-e | Rule | Rule 6. M4 keeps "עריכה", so ⋯ goes in the event form header → Q8 (default, risks) | 2 |
| 149 | Event files | `events/files.tsx:49-50` | Legacy files list | Files from the old app | P | Rule | Behaviour only. Keep in the same list | 3 |
| 150 | Event files | `events/files.tsx:116`, sheet at 131 | "הוספת קישור" button | Add a link as a file | P | Rule | Rule 5: ⋯ on V3 → "הוספת קישור" | 3 |
| 151 | Event files | `events/files.tsx:148` | Red "מחיקה" in the file sheet | Delete a file | D-e | Rule | Row sheet destructive group (Q11 pattern) → Q8 | 3 |
| 152 | Products | `events/products.tsx:37` | Top-bar outline "העתקה מאירוע קודם" | Copy products from a past event | P | Q screen | Q21 top-bar ⋯ → "העתקה מאירוע קודם" | 3 |
| 153 | Products | `events/products.tsx:48` | Up / down arrows | Reorder products | P | Q screen | Q21 drag handles | 3 |
| 154 | Products | `events/products.tsx:56` | "נמכרו N" per product | Units sold | P | Remove (duplicate) | Stays in Q15 drill row "מה נמכר בדוכן" (sales per product) | 3 |
| 155 | Product form | `events/products.tsx:163-166` | Units and revenue stat row | Sales of one product | P | Remove (duplicate) | Stays in the Q15 "מה נמכר בדוכן" drill-in (one line per product) | 2 |
| 156 | Product form | `events/products.tsx:150` | Bottom-bar "מחיקה" | Delete a product | D-e | Rule | Rule 6: ⋯ in the product form header → Q8 | 2 |
| 157 | Stall tabs | `events/tabs.tsx:48`, /manage/events/:id/tabs | "צפייה בטבלה" | Tabs as a table | P | Q screen | Q12 top-bar ⋯ → Q9 | 3 |
| 158 | Stall tabs | `events/tabs.tsx:48` | "אקסל" | Export tabs | P | Q screen | Q12 ⋯ → "ייצוא לאקסל" | 3 |
| 159 | Stall tabs | `events/tabs.tsx:54-57` | Fourth stat "נמכרו" | Units sold | P | Remove (duplicate) | Q12 has three stats (חשבונות, שולמו, פתוחים). Sales stay in the Q15 "דוכן" stat | 3 |
| 160 | Stall tabs | `events/tabs.tsx:60-64` | Five chips | Filter tabs | P | Q screen | Q12 chips פתוחים / סימנו שהעבירו / הכל. The other two continue in the scrolling row (risks) | 3 |
| 161 | Stall tabs | `events/tabs.tsx:71` | Row with value, link, remind icon, and שולם / אישור | Act on a tab from the list | P | Q screen | Q12 note "אישור תשלום ותזכורת נמצאים בתוך החשבון": the row keeps the amount, and the actions move to N12 | 3 |
| 162 | Stall tab | `events/tab.tsx:74` | Top-bar "מחיקה" on N12 | Delete a tab | D-e | Rule | Rule 6: top-bar ⋯ on N12 → Q8 | 3 |
| 163 | Stall tab | `events/tab.tsx:88`, `:93` | whoWhen meta | Who added, when | P | Rule | Rule 4: one meta line per line item | 3 |
| 164 | Stall tab | `events/tab.tsx:108` | "התיק של" link | Open the person's file | P | Rule | Rule 5: ⋯ on N12 | 3 |
| 165 | Stall tab | `events/tab.tsx:110` | PayConfirm | Confirm payment | P | Q screen | Q7 sheet | 3 |
| 166 | Stall tab | `events/tab.tsx:113` | "תשלום והיסטוריה" card | Payment history | P | Rule | Rule 5: ⋯ on N12 → "היסטוריית שינויים" | 3 |
| 167 | Stall tab | `events/tab.tsx:126` | Red "הסרה מהחשבון" in the line sheet | Remove a line | D-e | Rule | Row sheet destructive group (Q11 pattern) | 3 |
| 168 | Staffing | `events/staffing.tsx:153` | Red "להוריד מהשיבוץ" in the shift sheet | Remove someone from a shift | P | Rule | Row sheet destructive group (Q11 pattern) | 3 |
| 169 | Event day | `eventday/home.tsx:55` | "סריקות אחרונות" list on E1 | Recent scans | P | Remove (duplicate) | Small additions row 2. The gate (E6) shows the previous scan, and managers have the scans log (Y2) | 3 |
| 170 | Event day | `eventday/home.tsx:55` | "חיפוש אורח" text link on E1 | Search a guest | P | Remove (duplicate) | Stays as search on the gate (E6) and in the scans log (Y2) | 3 |
| 171 | Gate | `eventday/gate.tsx:100` | Manager count "נכנסו מתוך" | Entry count | P | Remove (duplicate) | Stays as the Y1 live hero, which managers open from E1 (risks) | 3 |
| 172 | Gate | `eventday/gate.tsx:119` | "לדוכן" link in the gate header | Go to the stall | P | Remove (duplicate) | Stays as the E1 "דוכן" entry | 3 |
| 173 | Gate | `eventday/gate.tsx:134` | Previous scan line, weak-reception scans | Scan saved offline | P | Rule | Small additions row 3: show "נשמר בטלפון, יישלח כשתהיה קליטה" on the previous line and in C8 (to implement; not shown today) | 3 |
| 174 | Gate | `eventday/gate.tsx:114`, `:159` | Module-off message | Say the gate is off | P | Rule | Rule 12. Keep | 3 |
| 175 | Stall | `eventday/stall.tsx:38`, `:136` | Module-off message | Say the stall is off | P | Rule | Rule 12. Keep | 3 |
| 176 | Stall | `eventday/stall.tsx:48` | /event/stall/new route | Open a new tab from the stall | P | Rule | Behaviour only. Keep | 3 |
| 177 | Stall | `eventday/stall.tsx:154`, `:189` | "נקה הכל" in the bar | Clear the cart | P | Rule | Small additions row 11: out of the Q28 bar. Clearing the cart is the existing undo toast (risks: what triggers it) | 3 |
| 178 | Stall | `eventday/stall.tsx:208` | Long press on a product | Remove one unit | P | Rule | Behaviour only. Keep | 3 |
| 179 | Stall | `eventday/stall.tsx:228-233` | "בחשבון" list | Lines already on the tab | P | Q screen | Q29 account sheet lines | 3 |
| 180 | Stall | `eventday/stall.tsx:231` | X per line in "בחשבון" | Remove a line | P | Q screen | Q29 "הסרה" on the line (small additions row 11) | 3 |
| 181 | Stall | `eventday/stall.tsx:270-278` | Manager stat row on E9 | Stall totals | P | Remove (duplicate) | Stays in the Q12 stats (חשבונות, שולמו, פתוחים) | 3 |
| 182 | Stall | `eventday/stall.tsx:292` | "שילם/ה במקום" button plus a chevron on the row | Crew marks paid | P | Q screen | Q29 "שילם עכשיו" in the account sheet (small additions row 11) | 3 |
| 183 | Live | `eventday/live.tsx:24-25`, `:95`, `:165`, `:338` | countersOr / scansOr fallbacks | Numbers survive missing counters | P | Rule | Behaviour only. Keep | 3 |
| 184 | Scans log | `eventday/live.tsx:173`, Y2 | Top-bar "אקסל" | Export scans | P | Rule | Rule 5: top-bar ⋯ on Y2 → "ייצוא לאקסל" | 3 |
| 185 | Vendor pool | `vendor/manager.tsx:45`, V1 | Top-bar "חדש" | New stall | earlier | Rule | The one top-bar primary on V1 (rule 5) | 3 |
| 186 | Vendor pool | `vendor/manager.tsx:59` | "צפייה בטבלה" | Pool as a table | P | Needs a design | Small additions row 7 says ⋯, but the V1 top bar already holds "חדש" | 3 |
| 187 | Vendor pool | `vendor/manager.tsx:59` | "אקסל" | Export the pool | P | Needs a design | Same as row 186 | 3 |
| 188 | Vendor pool | `vendor/manager.tsx:70` | fromEvent context | Back to the event | P | Rule | Behaviour only. Keep | 3 |
| 189 | Vendor form | `vendor/manager.tsx:131` | Red "מחיקת בעל הדוכן" | Delete a stall from the pool | D-e | Rule | Rule 6. V2 keeps "עריכה" (`:183`), so ⋯ goes in the form header → Q8 (default, risks) | 2 |
| 190 | Vendor card | `vendor/manager.tsx:285` | Red revoke in the access sheet | Revoke stall access | D-e | Rule | Row sheet destructive group (Q11 pattern) | 3 |
| 191 | Event vendors | `vendor/manager.tsx:341`, `:365` | Quiet "אישרו" button on invited rows | Record a confirmation that came by phone | P | Q screen | Q11 sheet "אישר בטלפון"; the row keeps one control (Q10) | 3 |
| 192 | Event vendors | `vendor/manager.tsx:366-368` | Remind and WhatsApp icons on answered vendors | Message a vendor | P | Remove (duplicate) | Q10: only vendors who have not answered keep the WhatsApp icon. For the rest, messaging stays on the vendor card and in the Q11 sheet | 3 |
| 193 | Event vendors | `vendor/manager.tsx:366-368` | Remind on rows of vendors who have not answered | Remind a vendor | P | Q screen | Q10 single WhatsApp icon. Q11 "תזכורת בוואטסאפ", "אישר בטלפון", "לא מגיע הפעם" | 3 |
| 194 | Event vendors | `vendor/manager.tsx:369` | X on the row | Remove a stall from the event | D-e | Q screen | Q11 sheet "הסרה מהאירוע" | 3 |
| 195 | Event vendors | `vendor/manager.tsx:380` | "בעל דוכן חדש" in the picker sheet | Add a new stall while picking | P | Rule | Rule 9: the last item in the picker | 3 |
| 196 | Vendor requests | `vendor/manager.tsx:426` | "טופל" on V7 requests | Close a request | P | Rule | Rule 4: the row's single control | 3 |
| 197 | Vendor contact | `vendor/parts.tsx:142-145`, ContactCard | Row with two icon buttons (phone, WhatsApp) | Contact the farm or vendor | P | Rule | Rule 4: one trailing control. The row opens a row sheet with call and WhatsApp (Q11 pattern) | 3 |
| 198 | Stall helper | `vendor/stall.tsx:84` | Red "הסרה מהדוכן" in the helper sheet | Remove a helper | D-e | Rule | Row sheet destructive group (Q11 pattern) | 3 |
| 199 | Projects | `projects/index.tsx:161`, `:228` | Outlined "עריכה" | Edit a project or step | earlier | Rule | Decided: details keep "עריכה" | 3 |
| 200 | Projects | `projects/index.tsx:377` | Red "מחיקת הפרויקט" | Delete a project (owner) | D-m | Rule | Rule 6. P3 keeps "עריכה", so ⋯ goes in the edit form header → Q8 (default, risks) | 2 |
| 201 | Broadcasts | Q25 / Q26 | Broadcast list and composer inside People | Messages | P | Q screen | Q25, Q26 | 4 |
| 202 | Broadcast | `broadcast/Reads.tsx:54` | Owner top-bar "מחיקה" | Delete a broadcast | D-m | Rule | Rule 6: top-bar ⋯ → Q8 | 4 |
| 203 | Profile | `system/profile.tsx:66` | Registration answers listed on /me | See my answers | P | Rule | Small additions row 12: not listed on /me. They stay editable in /me/edit (`:136`) and in welcome (`misc.tsx:74`) | 2 |
| 204 | Profile | `system/profile.tsx:136` | Registration answers in /me/edit | Edit my answers | P | Rule | Small additions row 12: this is their home. Keep | 2 |
| 205 | Welcome | `system/misc.tsx:74` | Registration answers on welcome | Answer on first sign-in | P | Rule | Keep (a form step, rule 8) | 2 |
| 206 | Profile | `system/profile.tsx:77` | Farm website row | Open the farm site | P | Q screen | Q18 quiet link "האתר של החווה" (small additions row 10) | 7 |
| 207 | Profile | `system/profile.tsx:78` | Demo row | Open the demo | earlier | Q screen | Q18 quiet link at the bottom (small additions row 10) | 7 |
| 208 | Demo | `system/demo.tsx:69` | "קישור להדגמה" | Copy the demo link | P | Q screen | Q18 quiet links, next to the demo link | 7 |
| 209 | Profile | Q18 | "עריכת פרטים" | Edit my details | earlier | Q screen | Q18 underlined link (decided) | 2 |
| 210 | Guest | `screens/Guest.tsx:21`, `:241`, `:452` | shownTab | Guest tab memory | P | Rule | Behaviour only. Keep | 6 |
| 211 | Guest | `screens/Guest.tsx:123` | Team lands on /me/tickets | Team see their guest tickets | P | Q screen | Q18 row "הכרטיסים שלי כאורח" | 6 |
| 212 | Guest | `screens/Guest.tsx:216`, used in `App.tsx:152` | BlockedPage | Tell a blocked person | P | Rule | Rule 12. Keep in stage 6 | 6 |
| 213 | Guest | `screens/Guest.tsx:414` | AccountSignIn | Sign in from the account tab | P | Q screen | U-screens, account (signed out) | 6 |
| 214 | Guest | `screens/Guest.tsx:433-439` | MoreLinks with DeleteAccountLink | Delete my account | P | Q screen | U7: account deletion at the bottom of the edit-details screen | 6 |
| 215 | Guest | `screens/Guest.tsx:443` | DemoLink | Open the demo | P | Q screen | U12 quiet demo link | 7 |
| 216 | Guest | `screens/Guest.tsx:468` | Empty state | Nothing booked yet | P | Q screen | U-screens empty state | 6 |
| 217 | Guest | `screens/Guest.tsx:476-478` | Account cards | My details, tickets | P | Q screen | U7 account | 6 |
| 218 | Guest | `screens/Guest.tsx:480` | DemoSection when signed in | Demo switch | P | Remove (duplicate) | U7 has no demo switch. The demo stays as the U12 quiet link and /demo | 7 |
| 219 | Event vendors | `data/vendor.ts` remindVendor, used from `vendor/manager.tsx:366` | Reminder sends the saved "הזמנת בעל דוכן" wording | Saved vendor template | P | Rule | Behaviour only. Small additions row 7: if the wording needs an entry point, it goes in ⋯ on Q10 ("נוסח ההזמנה"); today it is edited in Settings | 3 |

## Small additions table (RULES.md)

| # | RULES.md row | Plan rows |
|---|---|---|
| 1 | X on inbox cards | 17, 18 (and 19, the sender link inside the same cards). All three are Needs a design, because those items have no detail screen to hold ⋯ |
| 2 | Recent scans on E1 | 169, 170 |
| 3 | Scan saved on weak reception | 173 (the line still has to be built) |
| 4 | Task header tags, note and photo after done | 34, 36 (33 is the row-level version under rule 4) |
| 5 | Recurring note and 30-day record | 47, 48, 49 |
| 6 | Calendar legend | 68 (69 is the designed Q30 month legend) |
| 7 | Print, visit export, visit history, vendor export, saved vendor template, report comparison | Print 146. Visit export 96, 97. Visit history 101. Vendor export 186, 187 (Needs a design: V1 has no free top-bar slot). Saved vendor template 219. Report comparison 143 |
| 8 | People filters: blocked, pending invites | 104, 105. The same pattern is used for 16, 60 and 134 |
| 9 | Guest invite role | 110 |
| 10 | Farm website link, demo link | 206, 207, 208 |
| 11 | Staff stall powers, clearing the cart | 179, 180, 182 (Q29), 177 ("נקה הכל") |
| 12 | Registration answers on the profile | 203, 204, 205 |
| 13 | Places link on the Manage root | 12 (also 29 on the Tasks root, 65 for the Farm card that stays) |
| 14 | Nav badges on every tab | 1 (done in `e9e0ab8`) |

## Needs a design

No rule or screen gives these a home. Each one stays exactly as it is until Meni decides. None is removed.

1. **Install banner and its X** (rows 2, 3). The strip with an X shows on every team screen, roots included, which rule 2 does not allow. Q18 has an "התקנה" row, but the strip is the only nudge for people who never open the profile.
2. **Contact messages and stall requests in the inbox** (rows 17, 18, 19). Small additions row 1 removes the card X and puts dismiss/delete in the item's detail behind ⋯. These two item kinds have no detail screen, and the sender link (rule 4) needs the same missing screen. A small M2 detail (message text, sender row, ⋯ with "טופל" and "מחיקה") would cover all three.
3. **Managers' projects block on the Tasks root** (row 25). Q2 does not show it, and rule 2 keeps roots closed. It predates the parity commit, so it stays.
4. **Donations "ממתין" sum tile** (row 79). Q4 shows three stats.
5. **Reports tiles "חוזרות בזמן" and "פתוחות באיחור"** (row 89). Q14 has four stats and "מי ביצע". They could fit inside the "מי ביצע" drill-in, but no screen shows that.
6. **Event summary "יצאו וחזרו" tile** (row 141). Not among the four Q15 stats. It could become a line inside the "הגיעו" drill-in.
7. **Vendor pool export and table view** (rows 186, 187). Small additions row 7 says ⋯, but the V1 top bar already holds its primary "חדש", and rule 5 allows one control.

## Questions / risks

1. **Delete on detail screens that keep "עריכה", and on forms with no detail.** This covers T3 task (45), S4 shopping item (63), M4 event (148), P3 project (200), the vendor card (189), the calendar item (73), presence (76), the product (156) and recurring (50). Rule 5 gives the top bar one control, and the outlined "עריכה" was decided. Default: ⋯ in the edit form header next to ביטול (`FormHeader end`), with מחיקה → Q8. Delete is then one step deeper (detail → עריכה → ⋯). Needs Meni's nod. The alternative is ⋯ replacing "עריכה", with "עריכה" as the first ⋯ item.
2. **Stage 1 already cuts extra row actions.** Since `d060644`, `Row` keeps only the first element of `actions`. Until stage 3 moves the rest, rows with several controls lose actions on screen: donations (`Money.tsx:166`), stall tabs (`tabs.tsx:71`) and event vendors (`vendor/manager.tsx:364-369`). Those are approve, receipt, remind, confirm and remove. Do not ship stage 1 alone. Check these three screens first in stage 3.
3. **M2 "מה שטופל"** (row 15) is a text link beside back in the approved M2 design, but rule 5 says no text links. The screen wins under RULES' own precedence. It still needs Meni's word on whether it becomes ⋯ or stays.
4. **Swipe-left delete with undo** (rows 30, 58) skips rule 6 (⋯ → Q8). It was approved in PR #23 and is kept. Log it in tidy-progress as a decision.
5. **Q12 chips not pictured** (row 160): שולמו and נמחלו are assumed to continue in the scrolling chip row.
6. **Q20 search and key filter not pictured** (rows 127, 128). Default: keep them, as a search field plus a dropdown in the Q16 pattern.
7. **Done-task note and photo** (row 36). The timeline line is defined, but where the "add note / add photo" control sits after done is not. Default: ⋯ on T3 ("הוספת הערה", "הוספת תמונה").
8. **Clearing the stall cart** (row 177). RULES says clearing the cart is the existing undo toast, but once "נקה הכל" leaves the Q28 bar nothing starts the clear. Default: an item in the Q29 account sheet, followed by the undo toast.
9. **Resending a payment confirmation** after Q7 (rows 84, 136, 165). Default: a ⋯ item on the detail.
10. **Hand-over on a free task** (row 35). Today the free task shows "לקחת" and "להעביר" side by side. Default: the "על מי" row opens C4, and "לקחת" stays the single button.
11. **Gate manager count** (row 171) is removed as a duplicate of Y1. Managers at the gate lose the number in their line of sight. Watch for push-back.
12. **Places `?from=manage`** (row 53) becomes dead code once row 12 goes. Leave the branch in place; it is harmless.
13. **Rule 9 on the task form "מי" chips** (row 43) predates this round. Changing it is in scope (rule 9 applies to everything), but it is a visible change for every user.
14. **Recurring note** (row 48). Q24 creates recurring tasks in the add form, and RULES puts the note in the recurring detail. The note is therefore editable after creation only. Check that is acceptable.
15. **Guest invite role** (row 110). Add the "אורח" segment to Q27 only if guests can still be invited ahead; log the decision.
16. **Open per PROMPT**: updates consent (default opt-in, `updatesOptIn`) and Web Push versus FCM.

## Current tree: screens that break rules 4-6 today

Every route in `src/app/v2/screens` that today has a top-bar text link, a row with more than one trailing control, a red
text delete link, or an X on a row or card. Line numbers are against `7861644`.

### Top-bar text links, or more than one top-bar control
- `manage/Root.tsx:123`: M2 inbox, "מה שטופל"
- `manage/People.tsx:51`: People, ExcelButton (two buttons)
- `manage/People.tsx:135`: Person, "חסימה"
- `manage/Money.tsx:47`: Reports, ExcelButton
- `manage/Money.tsx:142`: Donations, ExcelButton
- `manage/Money.tsx:209`: Donation, "מחיקה"
- `manage/Visits.tsx:30`: Visits, ExcelButton
- `manage/Visits.tsx:88`: Visit, "מחיקה"
- `manage/Activity.tsx:63`: Activity, ExcelButton
- `manage/InstinctLog.tsx:62`: Instinct log, ExcelButton
- `events/tabs.tsx:48`: Stall tabs (Q12 route), ExcelButton
- `events/tab.tsx:74`: Stall tab N12, "מחיקה"
- `events/products.tsx:37`: Products, "העתקה מאירוע קודם"
- `tasks/Places.tsx:114`: Place L4, "מחיקה"
- `broadcast/Reads.tsx:54`: Broadcast reads, "מחיקה" (owner)
- `eventday/live.tsx:173`: Scans log Y2, "אקסל"
- `eventday/gate.tsx:119`: Gate, "לדוכן" link in the header

### Export buttons in the screen body (not the top bar)
- `tasks/Places.tsx:50` (ExcelButton at the bottom of L1)
- `vendor/manager.tsx:59` (ExcelButton on V1)
- `manage/Money.tsx:69` (ExcelButton in the "מי ביצע" header)
- `events/event.tsx:181` (guests "אקסל")
- `events/event.tsx:405-407` (ייצוא לאקסל / היסטוריית האירוע / הדפסה)

### Rows with more than one trailing control
- `manage/Money.tsx:166`: donation row, amount plus `rowActs` (130)
- `events/tabs.tsx:71`: stall-tab row, link, remind icon, שולם / אישור
- `vendor/manager.tsx:364-369`: event vendor row, אישרו, remind, WhatsApp, X
- `vendor/parts.tsx:142-145`: contact row, two icon buttons
- `eventday/stall.tsx:292`: stall row, chevron plus "שילם/ה במקום"
- `tasks/Task.tsx:72`: "על מי" row, "לקחת" plus "להעביר"

### Red text delete links, or delete buttons at the bottom of a screen or bar
- `farm/presence.tsx:81` "הסרה מהיומן"
- `farm/calitem.tsx:74` "מחיקה מהיומן"
- `tasks/Add.tsx:227` "מחיקת המשימה"
- `tasks/Recurring.tsx:111` bottom-bar "מחיקה"
- `shopping/Item.tsx:71` bottom-bar "מחיקה"
- `shopping/Trip.tsx:145` "מחיקת הקנייה"
- `projects/index.tsx:377` "מחיקת הפרויקט"
- `manage/People.tsx:171` "מחיקת X"
- `events/form.tsx:147` "מחיקת האירוע"
- `events/products.tsx:150` bottom-bar "מחיקה"
- `vendor/manager.tsx:131` "מחיקת בעל הדוכן"

Inside row sheets. The Q11 pattern allows these as a red group in the sheet:
- `events/files.tsx:148`
- `events/event.tsx:253-254`
- `events/tab.tsx:126`
- `events/staffing.tsx:153`
- `manage/Settings.tsx:307`
- `vendor/manager.tsx:285`
- `vendor/stall.tsx:84`

### X on a row or card
- `manage/Root.tsx:159`: inbox cards (contact message at 196, stall request at 181)
- `vendor/manager.tsx:369`: event vendor row
- `eventday/stall.tsx:231`: "בחשבון" line on E8
- `system/misc.tsx:147`: install strip

Noted but not counted: the × on a selected filter chip, `tasks/Root.tsx:120` and `:126`.
