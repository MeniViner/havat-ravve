# Visual check, group C (vendors, broadcasts, profile, system, vendor app, demo)

Independent check against `havat-raveh-redesign/design` (PNG + HTML), 2026-11-21.
Run: `node scripts/visual-check.mjs <37 ids> --base=http://localhost:5173 --out=docs/visual-check/C --design=havat-raveh-redesign/design`.
Click-through: `.build/vc-C/clicks.mjs` (all screens), `.build/vc-C/z3.mjs` (Z3 switches), `.build/vc-C/probe*.mjs` (follow-ups).
Chromium headless, 390x844, demo state set through `farm-demo` exactly as visual-check sets it.

**Result: 24 MATCH, 11 MINOR, 2 DEFECT.** No console errors and no Firestore traffic on any screen while demo is on.

Harness artifacts, not app defects:
- **C9, X2**: these gate screens shrink by 28px to make room for the demo strip (`system.css:122`). Visual-check hides the strip, so a 28px empty band shows at the bottom and the content sits about 14 to 28px higher. With the strip visible, the layout is correct.
- **C12, C2**: the app lights "משימות" because the page was loaded directly. Pages without a tab keep the last tab lit (`App.tsx:45`). When reached from ניהול, "ניהול" is lit, as in the design (checked in `probe5.mjs`).
- **Diff %** is high on Z2/Z3 (B4 card and sheet height), V7/D6 (data and a toast) and X2/C9 (the 28px band). The numbers come from `results.json`.

| id | diff % | verdict | precise differences |
|---|---|---|---|
| N8-Vendors | 5.9 | MATCH | Demo data lists all 6 invited (adds "דוכן החווה", "תכשיטי המדבר"); the design draws 4 of 6. Structure, badges, buttons and copy match. |
| V1-Pool | 1.6 | MATCH | Only the data differs: 9 rows against 6 drawn. |
| V2-Vendor | 7.7 | MINOR | **Extra link "גישה"** (pine, 15/600) at the left end of the "איש קשר" row. The design has no visible entry to V6, though SCREENS.md says "access->V6". The action buttons row sits about 3px lower and each info row is about 2px taller than the design. "צריך" value is data. |
| V3-Files | 0.8 | DEFECT | **Extra text link "הוספת קישור לקובץ"** below the note "רק מנהלים רואים את הקבצים." (`events/files.tsx:100`). It is not in the design HTML or SCREENS.md. Everything else matches. |
| V4-Staffing | 5.2 | MATCH | Only the data differs: station "דוכן החווה" against "דוכן"; חניה has 2 people and still shows "חסר" (the required count is higher). Structure and copy match. |
| V5-Debts | 6.5 | MINOR | Each debt row is **60px tall; the design is 69px**. The design's `min-height:60px; padding:4px` is content-box, while the app is border-box (`events.css:111 .events-debtrow`). The total row therefore sits 36px higher. The bottom nav shows a 5th "אירוע" tab: the afterEvent clock is 28.11 21:04, still event day, so the SCREENS.md rule applies. The artboard shows 4 tabs. |
| V6-VendorApp | 7.2 | MATCH | Cards start about 4px lower. Copy, icons and colours match. "הסרת הגישה" asks for inline confirmation ("כן, להסיר את הגישה של כולם"). |
| V7-VendorsDay | 10.4 | MINOR | The bottom nav has 5 tabs ("אירוע" added, active "ניהול"); the V7 artboard shows 4. This follows the SCREENS.md "Event tab appears on event day only" rule, so the artboard is out of date. Counts and row order are data ("הגיעו 3", and גבינות משק רז not yet arrived). |
| B1-Compose | 0.9 | MATCH | Only data differs ("בעלי דוכנים · 2" against 6). |
| B2-Sent | 5.1 | MATCH | Data only: 5 broadcasts against 3 drawn, and different read counts. |
| B3-Read | 2.7 | MATCH | Data only: 4 not read against 3; the 15:00–19:00 shift text is real presence. |
| L6-Me | 0.3 | MATCH | Stat numbers are data. |
| C12-Profile | 0.7 | MATCH | The lit tab differs only because of the harness (see above). Stats are data. |
| C13-ProfileEdit | 0.3 | MATCH | None. |
| A1-Photo | 0.3 | MATCH | None. |
| A2-Crop | 2.6 | MATCH | The crop ring is about 5px smaller in diameter, and the slider and "תמונה אחרת" sit 2 to 4px higher. Both are within tolerance. |
| C1-Notifs | 0.8 | MATCH | Name is data ("גיל" against "יואב"). |
| C2-Search | 1.3 | DEFECT | **Copy**: the אסתר כהן row meta reads "050-000-0310 · בקשת ביקור"; the design reads "· ביקשה ביקור" (`data/system.ts:288`). Counts ("הכל · 12", "אנשים · 9" + "עוד 6", "400 ₪") are data. The lit tab is a harness artifact. |
| C9-Welcome | 6.3 | MATCH | Only the 28px harness band; the bottom bar sits 28px higher. Copy matches. |
| C10-Install | 0.1 | MATCH | None. |
| X2-Suspended | 9.4 | MATCH | Only the 28px harness band; content is centred 14px higher. |
| D1-Invite | 0.3 | MATCH | None. |
| D2-Confirm | 2.3 | MINOR | The "מגיעים עם רכב לפריקה" toggle card is about **58px tall; the design is 68px** (`vendor.css:70 .vendor-togglecard`, border-box against content-box). Everything below it sits 10px higher. |
| D3-Home | 4.2 | MATCH | The "אישרת הגעה" tag sits 2px higher. |
| D10-Empty | 5.2 | MINOR | The same toggle card ("להזמין אותי לאירוע הבא") is 10px shorter than the design, so the "היית אצלנו" card sits 12px higher. |
| D4-Event | 6.3 | MINOR | **"היום שלך" timeline rows are 38px; the design is 47px** (`vendor.css:40 .vendor-tl`, `min-height:38px` content-box in the design). With 5 rows, all lower cards and the action row sit about 45px higher. |
| D7-Stall | 4.6 | MATCH | Info rows are 2px taller. "3 אירועים" and "עוד לא נכנסה" are data. |
| D8-Helper | 3.3 | MATCH | Checklist rows are 1px shorter. |
| D11-HelperHome | 2.9 | MATCH | None. |
| D5-Day | 3.6 | MINOR | The "עכשיו" timeline rows are 38px against 47px (same cause as D4). The demo clock is 17:20 against 13:50 in the design, so the list shows 21:00/21:30 and has no "עוד 10 דקות" aside. That part is data. |
| D6-DayLive | 11.5 | MATCH | The toast "מעולה. החווה יודעת שהגעתם" is still visible from the check-in step (transient). The hero is 4px taller. |
| D9-Summary | 1.2 | MINOR | The toggle card is 10px shorter (same cause as D2). Its meta reads "החווה רואה שאתם מעוניינים"; the design reads "ערב חנוכה · 13.12". The code shows the next event when one exists (`vendor/event.tsx:242`), but the demo's ערב חנוכה is `published:false`, so the fallback shows. "אירועים שלך 3" is data. |
| Z1-DemoStart | 5.7 | MATCH | Title and intro sit about 3px lower. |
| Z2-DemoBanner | 28.5 | MINOR | The strip matches exactly. Under it, the demo staff has an unread broadcast, so the B4 card ("הודעה מבני · 14:10 … קראתי") is pinned above the progress bar and pushes the list down 165px. The Z2 artboard shows no card. B4 is a valid state (FLOWS.md:20). |
| Z3-DemoSwitch | 30.8 | MINOR | The sheet adds a disclosure **"מצבים להדגמה ⌄"** below the exit/reset buttons (`system/demo.tsx:68`). It is not in the Z3 design and makes the sheet about 55px taller, so the sheet top sits about 55px higher. Persona rows, the day segment and both buttons match. It holds the hard-state triggers this check was asked to exercise, so it needs design sign-off rather than removal. |
| Z4-DemoOwner | 0.2 | MINOR | The red "3" badge on the bell is missing: the demo owner has no notifications, and `/notifications` as owner shows "אין התראות". Everything else matches. |
| Z5-DemoVendor | 5.7 | MATCH | Card headers with a "הכל" link are 2px taller. |

## Click-through (light)

All primary actions did something sensible. There were no dead buttons and no console or page errors. While demo was on there were 0 requests to Firestore or Auth. The only Firestore Listen happened after "יציאה מההדגמה", once demo was off.
- **Vendor pool and event**: these all worked:
  - Reminders and WhatsApp show the toast "בהדגמה לא נשלח".
  - "הזמנה מהמאגר", "הזמנה לאירוע" and "לקשר עוד מישהו" open sheets.
  - Rows open V2, and V1 search filters the list ("דבש" leaves 1 row).
  - "צילום מסמך" and "קובץ מהטלפון" open a file chooser.
  - "לשלוח לצוות את השיבוץ" opens B1 prefilled (audience=crew plus the text).
  - V7 "טופל" shows the toast "סומן שטופל".
- **Broadcasts**: B1 sends and lands on B2 with "נשלח ל־5 אנשים". In B3, "לשלוח שוב" shows its toast and "עוד 5" expands the list from 7 to 12.
- **Profile and system**:
  - "עריכה" goes to /me/edit; C13 saves and the value persists.
  - A1 "שמירה" and A2 "זה טוב" work. C12 "לראות את האפליקציה כמו מתנדב" switches to the staff view, so ניהול leaves the nav.
  - C1 "הוספה" goes to /new?kind=shopping. In C2, the "אנשים" chip and the person row work.
  - C9 enters /tasks. C10 switches to the Android tab, and "אחר כך" works. X2 "יציאה מהחשבון" works.
- **Vendor app**:
  - D1 "מגיעים" goes to D2, and D2 "שליחה לחווה" goes back to D4 with a toast.
  - D3 hero, helpers and tabs work. D10 toggle shows its toast. D4 "שינוי תשובה" goes to D1.
  - D7 and D8 add a helper ("נועם צורף לדוכן").
  - D11: a helper sees no "שינוי תשובה".
  - D5 "הגעתי לחווה" goes to D6. D6 request buttons show "נשלח למנהלים. מישהו בדרך", and "הסתדר" works. D9 sends.
- **Z3**: all switches worked:
  - Each of the 5 personas switches, closes the sheet and updates the strip. The owner and manager personas land on /tasks, the vendor on /vendor and the guest on the guest root.
  - All 3 days update the strip.
  - "אין קליטה" shows the offline strip "אין קליטה. 3 פעולות שמורות בטלפון", and turning it off removes the strip.
  - "הפעולה הבאה לא תישמר" followed by "לקחת" shows the alert "לא נשמר. מישהו אחר הקדים אותך."
  - "רשימות ריקות" empties "רק שלי" ("סיימת את כל מה שעליך") and shopping ("אין מה לקנות בסופר"). The unassigned tasks under "לפי מקום" stay listed, which fits the L5 state.
  - The rows "כניסה ראשונה", "חשבון מושעה" and "עוזרת" open C9, X2 and D11.
  - "איפוס הנתונים" shows the toast "נתוני הדוגמה אופסו". "יציאה מההדגמה" goes to /demo, removes the strip and saves `on:false`.
- **Vendor access to manager routes**: refused in every case tried. A vendor at `/manage` and at `/manage/events/demo-e-festival/files` is redirected to `/vendor`. A helper at `/manage/vendors` is redirected to `/vendor`. A vendor at `/tasks` is redirected too.

## Defects to fix (by severity)

1. **V3-Files**: remove the text link "הוספת קישור לקובץ" (`src/app/v2/screens/events/files.tsx:100`). It is not in the design. If it is a kept legacy feature, get design sign-off and a drawn placement before shipping.
2. **C2-Search**: change the visit meta from "בקשת ביקור" to the gendered verb used in the design: "ביקשה ביקור" (feminine) or "ביקש ביקור" (masculine) (`src/app/v2/data/system.ts:288`). The `requested` wording already exists in `manage/calc.ts:165`.
3. **D4, D5 (MINOR, one cause)**: the timeline row `.vendor-tl` (`vendor.css:40`) must render 47px tall, not 38px. Use `min-height: 47px` or `box-sizing: content-box`. This is the largest visible spacing gap: 45px of drift on D4.
4. **D2, D10, D9 (MINOR, one cause)**: `.vendor-togglecard` (`vendor.css:70`) must render about 68–70px tall, not 58px. Use `min-height: 70px` or content-box.
5. **V5-Debts (MINOR)**: `.events-debtrow` (`events.css:111`) must render 69px tall, not 60px. Use `min-height: 69px`.
   - Check other v2 rows built from design `min-height + padding` values for the same border-box shortfall.
6. **V2-Vendor (MINOR)**: the "גישה" link in the איש קשר row is not drawn. Keep it as the V6 entry point, but get the placement confirmed in design. The alternative is a row in the card, like the other detail rows.
7. **Z3-DemoSwitch (MINOR)**: the "מצבים להדגמה" disclosure is not drawn. Get it added to the Z3 design or approved. It is collapsed by default, which is right.
8. **D9 (MINOR, demo data)**: publish ערב חנוכה in the afterEvent vendor seed (or show unpublished upcoming events to vendors invited to them) so the toggle meta reads "ערב חנוכה · 13.12" as designed.
9. **Z4 (MINOR, demo data)**: give the demo owner 3 unread notifications, so the bell badge and `/notifications` are not empty for Beni.
10. **Z2 (MINOR, demo data)**: the B4 broadcast card is valid, but if demo staff should match T1 and Z2 on first entry, seed demo-b-1 as already read by יואב. Otherwise leave it as a demonstration of B4.
11. **V5, V7 (design note)**: the 5th "אירוע" tab on event day follows SCREENS.md; update the V5 and V7 artboards (4 tabs) or confirm.
