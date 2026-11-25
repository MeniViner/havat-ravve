# Needs-design round: the walk (round 2 of the tidy check)

Independent verifier (built none of it), 2026-11-23. Branch `tidy/nd-walk` cut from `origin/tidy/needs-design` at `cc81e6d`
("Needs-design round: progress log (twelve decisions, one new item), build dist"). Demo mode only (localStorage `farm-demo`),
dev server on port 5240, nothing against production, nothing deployed or pushed.

## Result

**No findings that needed a fix.** Two complete walks were run. The first found nothing in the app to fix. The second, run
after correcting the walker (see "How"), confirmed it. No app code was changed, so the click-throughs below stand for `cc81e6d`.

- Console errors on all 405 screens: **0**.
- Install strip or banner on any screen, for any role: **none** (decision 1). Install is reached only from the profile row
  "התקנה למסך הבית" (team, vendor, helper), the quiet "התקנה" link on U7 (guest), the notifications sheet's "איך מוסיפים"
  on iPhone, and `/install?first=1` after C9.
- X buttons on rows or cards: **0**. Delete controls outside ⋯: only the logged account-deletion links (`/me/edit`, `/terms`,
  `/delete-account`).
- One-word-per-line titles: **0**. The only hits were calendar day chips (a day letter over its date), which is the design.
- Every screen of every role shared with round 1 was compared pixel by pixel against round 1's shot (367 shots; the helper is new, so it has no round-1 shots).
  Only these changed, and each change is the round's decision or seed for it:

| screen | change | why |
|---|---|---|
| `/manage/vendors` | ⋯ in the top bar, dashed "בעל דוכן חדש" under the search, the Excel button is gone from the bottom | W3 (decision 8) |
| `/manage/donations` | three tiles, "לאישור · 180 ₪" | Q4 (decision 5) |
| `/manage/reports` | the two extra tiles are gone, first row "משימות" | Q14 (decision 6) |
| `/manage/reports/tasks` | the tasks drill-in (two figures and the full "מי ביצע") | decision 6 |
| `/manage/settings` (owner) | one row "הדגמה בכניסה ראשונה" in "מנהלים ומערכת" | W4 (decision 9); not shown to managers |
| `/manage/settings/managers` | the pending phone link row with "ביטול" | G5 (decision 12) |
| `/manage/people/invite` | three waiting instead of two | seed for G5 (the phone link) |
| `/manage/inbox` | the contact card's meta shows the message | seed: W1 needs the whole message in the same field |
| `/manage/events/.../live/scans` (event day) | chip "יצאו וחזרו · 3", more rows | decision 7 and its seed |
| guest `/me/visits/…`, `/me/donations/…` | U15 and U16 layouts | decision 10 |
| `/terms`, `/privacy` | the visitor-counting paragraph | from `main` (console rounds), not this round |

No root screen changed: `/tasks`, `/shopping`, `/farm` and `/manage` are pixel-identical to round 1 for every role.

## Reachability checks

| what | where it is now | checked |
|---|---|---|
| Donations' waiting sum ("ממתין") | in the chip: "לאישור · 180 ₪" (regular day), "לאישור · 2 · 360 ₪" (after the event) | Q4 pairs, walk, `v2-eventday` |
| Q14's "חוזרות בזמן" and "פתוחות באיחור" | row "משימות" on Q14 (meta "71% מהחוזרות בוצעו בזמן · אחת פתוחה באיחור"), opening `/manage/reports/tasks` with both figures | Q14 pairs, walk |
| Tasks table and tasks Excel | Q14 ⋯ ("משימות בטבלה", "ייצוא משימות לאקסל"); `/manage/reports/tasks/table` opens | walk, probe |
| "יצאו וחזרו" | chip on Y2, filters the log | Y2 pairs |
| Vendor export | W3 ⋯: "צפייה בטבלה", "ייצוא לאקסל", "נוסח ההזמנה"; Q10 ⋯ keeps "נוסח ההזמנה" | walk |
| Install guide | profile row, U7 link, C10 once after C9 | walk, `v2-system` |
| Inbox actions | M2 cards keep "מענה בוואטסאפ", "התקשרות", "טופל", "אישור ליומן", "אישור תשלום"; W1 has reply, call and "טופל"; W2 has "טופל" and "אני על זה" | M2/W1/W2 pairs, `v2-vendor` |
| Old dismiss behaviour | contact card → W1 ⋯ → מחיקה → Q8; stall request → W2 ⋯ → מחיקה → Q8 (also from V7); other cards keep the row sheet's "מחיקה מהרשימה" → Q8; "מה שטופל" lists handled items with "החזרה לתור" | walk, probe |

**⋯ → מחיקה:** 29 checks opened the Q8 confirmation ("מחיקה" and "ביטול"), nothing confirmed. Round 1's 23 plus W1 and W2
(from M2 and from V7), for owner and manager.

## How it was walked

Same method as round 1 (`docs/tidy-check/README.md`), with the script kept this time: `walk.mjs` in this folder.

- **Routes:** round 1's list for each role (from its `_walk.json`), plus the new routes: W1 `/manage/inbox/demo-n-contact`,
  W2 from the inbox and from V7 (event day), `/manage/vendors/table`, `/manage/settings/demo`, `/manage/inbox?view=handled`,
  the inbox on event day, donations after the event; for the guest U15 and U16 on event day and U7 on event day; and
  `/install?first=1` for the volunteer and the guest. Owner-only routes were also opened as manager (they send a manager to
  `/tasks`).
- **Roles:** owner, manager, volunteer, vendor, helper (new in this round), guest, signed-out visitor.
- **Shots:** fresh load at 390×844, demo strip hidden, full length, JPEG. On screens with ⋯ the sheet is shot (`-more`) and
  "מחיקה"/"הסרה" pressed; the first row that is a button is pressed (`-row` for a sheet, otherwise the navigation is recorded).
- **Checks in the page:** strips and install banners; more than one top-bar control; text links in the top bar; rows with more
  than one control besides the row itself; X-like buttons and delete outside a sheet; red badges outside the bell and ניהול;
  Latin text; one word per line (text rects only); console errors. Then ⋯ items and row-sheet items against round 1.
- **First walk vs second:** the first walk missed ⋯ on form screens (the ⋯ sits in `.k-formheader`, not `.k-topbar`) and
  pressed "קראתי" on the volunteer's broadcast card, which made its tasks shots differ from round 1. Both were walker bugs,
  not app bugs. The second walk fixed both and is the one recorded here.

| | |
|---|---|
| Screens walked | **405**: owner 132, manager 132, volunteer 60, vendor 20, helper 14, guest 31, signed-out 16 |
| Shots | 503 |
| Console errors | 0 |
| Raw data | `<role>/_walk.json` (findings, ⋯ items, delete confirmation text, row sheets) |

## Visual check (one id at a time)

`node scripts/visual-check.mjs <id> --base=http://localhost:5240 --design=<dir> --out=docs/tidy-check/round2/visual`, one call per
id. W and U15/U16 against `havat-raveh-fill/design`, Q and U7 against `havat-raveh-tidy/design`, and C10, D6, G5, M2, V7 and Y2
against the original redesign PNGs. Each pair was read by eye against the HTML copy. Only the 1x JPEG pairs are kept. Rows
with no design PNG keep the app shot as `<id>.app.jpg`.

| id | diff | read against the design |
|---|---|---|
| W1-InboxMessage | 3.5% | copy and layout match |
| W2-InboxStallRequest | 3.1% | match. The stall meta adds "· עם חשמל": that is the seed's free-text spot note (D6 shows the same text) |
| W3-VendorPool | 1.5% | match. The list is longer (9 in seed, the design draws 6) |
| W3-VendorPoolMore / Table | n/a | ⋯ items as decided; the table is the Q9 pattern |
| W4-DemoFirstVisit | 1.9% | copy and switches match (vendors off) |
| U15-GuestVisitStatus | 5.1% | match; the date differs (seed: 4 December) |
| U16-GuestDonation | 5.6% | match except the ⋯ button, left out on purpose (logged, see below) |
| Q4-Donations / DonationsTwo | 7.8% / n/a | "לאישור · 180 ₪" and "לאישור · 2 · 360 ₪". The rest of the diff is the fourth chip "עם הנצחה" and a sixth row, both there before this round |
| Q14-Reports / ReportsTasks | 3.5% / n/a | row "משימות" first; "אחת פתוחה באיחור" is the live value for 1 (decision 6 asked for live values) |
| Q18-Profile | 0.7% | match; "התקנה למסך הבית" row present |
| Q19-Settings | 7.1% | the W4 row added as decided; "· סכום אחר" on the amounts meta was there in round 1 |
| U7-GuestAccount | 8.3% | copy matches; the diff is a small vertical offset of the rows, unchanged from round 1 |
| Y2-Scans / ScansReturned | 5.1% / n/a | chip "יצאו וחזרו · 3" added; ⋯ instead of "אקסל" and Michal's 17:20 scan missing are both as in round 1 |
| C10-Install | 0.1% | match |
| G5-Managers | 2.8% | the phone row reads "052-000-0315 · מנהל · לפי טלפון · הקישור נשלח היום · ביטול" as decided |
| M2-Inbox | 0.7% | match; only the contact card's meta is the message (seed) |
| V7-VendorsDay | 3.8% | unchanged from round 1 (Raz not arrived in seed). The request row now opens W2 |
| D6-DayLive | 0.3% | unchanged from round 1 ("נועה בדרך אליך"; Noa's row has WhatsApp only, as before) |

## Seen again, already known (no action)

- "מה שטופל" beside the back link on M2 (drawn in M2) and "מה לקבל" on C1 (helper/notifications): open decision from round 1.
- U2's two top-bar icons (להוסיף ליומן, שיתוף), drawn in U2.
- Rows with two controls the designs draw (task check plus "לקחת", and the others listed in round 1).
- Account deletion links on `/me/edit`, `/terms` and `/delete-account`.
- Latin names on screen (Google, PayBox, iPhone/Android/Safari, the `/terms` service names, QR, PDF).

## No designed place (listed, not invented)

- **U16 ⋯:** the design draws a ⋯ button but no items, and a guest has no secondary action on a donation. Left out (already in
  `docs/tidy-progress.md`).
- **Owner phone links in G5:** decision 12 covers the manager link. The builders also list owner links by phone in the owners
  card, the same way. This is an addition and is logged in `docs/tidy-progress.md` ("drop it if not wanted").
- **W2 stall meta:** the screen shows the manager's free-text spot note in full. The design's shorter text is seed, not a rule.
  Nothing to change unless Meni wants the note cut.

## Tests after the walk (on `cc81e6d`; no app change since)

- `npx tsc -p . --noEmit`: clean.
- `npm test`: core, demo and demo-intro pass.
- Click-throughs against port 5240:
  - `v2-delete`: 82/82;
  - `v2-vendor`: all passed;
  - `v2-broadcast`: 66 passed;
  - `v2-eventday`: 44 passed;
  - `v2-system`: all passed.

## Not reached

- The team X2 suspended screen (no demo persona reaches it, as in round 1).
- C10 right after a real C9: the offer is skipped in demo by design. `v2-system` covers `afterFirstEntry` and the
  once-per-device flag.
