# Visual check, group B (independent verifier)

Date: 2026-11-21. Base: http://localhost:5173, 390x844.
Run: `node scripts/visual-check.mjs <ids> --out=docs/visual-check/B --design=havat-raveh-redesign/design`.
Pairs: `<id>.pair.jpg` (design left, app right). Scores: `results.json`. Click results: `clicks.json`.
Controls were clicked with `.build/verify-B.mjs`, then re-checked with `.build/verify-B2.mjs` and `.build/verify-B3.mjs`.

Rows that differ only in demo data (names, counts, times, row order, extra list rows) count as matching, provided the structure and copy around them match.
Pixel offsets are in CSS px. The pair images are 2x, so divide what you measure on them by 2.

**Result: 26 MATCH · 12 MINOR · 4 DEFECT** (42 screens)

| id | diff % | verdict | precise differences |
|---|---|---|---|
| E1-Home | 2.9 | MATCH | Hero card is about 2px shorter. Everything else lines up. |
| E2-Scan | 0.7 | MINOR | The viewfinder has three demo-only buttons the design does not show: "QR תקין", "QR לא שולם", "QR מבוטל" (`.eventday-demoqr`, gate.tsx:128). They are intentional because the demo has no camera, but they are not in the design. |
| E3-Ok | 0.1 | MATCH | – |
| E4-Pay | 0.0 | MATCH | – |
| E5-Bad | 0.0 | MATCH | – |
| E6-Search | 0.2 | MATCH | – |
| E7-StallWho | 0.4 | MATCH | – |
| E8-StallSell | 5.4 | MINOR | The buyer header is taller. The avatar sits 3px lower, the gap between the name and "כבר בחשבון: …" is about 4px larger, and the product grid starts at y≈154 instead of y≈148. The extra product (שמן זית) is data. |
| E9-Tabs | 0.8 | MATCH | Row order and amounts are data. |
| Y1-Live | 10.0 | DEFECT | **Hero count block.** In the design the row is `align-items: baseline`: "נכנסו" (19px/700) sits on the baseline of the 60px "212", and "מתוך 640 כרטיסים" hangs below that baseline. The app uses `.eventday-hero-count { align-items: flex-end }` with `padding-bottom: 4px`, so both lines sit high beside the number. The hero is 129px tall where the design is 143px, and every card below it moves up about 14px. The chart title "כניסות לפי חצי שעה" is 15px in the app and 16px in the design. The bottom action bar is about 16px wider in total: the buttons start 59px from the left edge instead of 75px. |
| Y2-Scans | 10.8 | MINOR | There is an extra vertical offset that adds up down the page: search box +4px, chips +6px, list +7px. Most of it comes from the gap between the title and the search box. Rows are data. |
| Y3-Rejected | 7.1 | MINOR | The WhatsApp/call buttons sit 4px lower and the details card 6px lower. The "מה קרה" timeline rows are about 3px taller (62px against 59px). |
| Y4-Waiting | 10.1 | MINOR | Stat tiles are 4px lower, chips 6px lower, list 8px lower. The list is longer because of data. The footnote "השעה 17:20. האירוע פתוח עד 21:00…" is present below the fold. |
| Y5-Close | 2.1 | DEFECT | **Copy.** The checklist meta lines are missing the counter verb. The design has "1,150 ₪ · ספר יואב" and "640 ₪ · ספרה נועה". The app shows "1,150 ₪ · יואב" and "640 ₪ · נועה" (live.tsx:341, `meta={`${money(cc.amount)} · ${cc.by}`}`). |
| M1-Root | 0.1 | MATCH | The bell shows no "3" badge because the owner has 0 notifications in the regular demo seed (/notifications reads "אין התראות"). This is data. Seed notifications if the screenshot must match. |
| M2-Inbox | 0.2 | MATCH | – |
| M3-Events | 0.3 | MINOR | There is an extra row, "אירועים קודמים · 2" (list.tsx:65, quiet link-row under "מאגר בעלי הדוכנים"). The design has no such row. It is conditional and expands older events. Confirm it is wanted, or drop it from this view. |
| M4-Prep | 0.5 | MATCH | The "קבצים" subtitle is file-name data. "שיתוף הקישור" calls `navigator.share`. When share rejects it does nothing: it neither falls back to copying nor shows a toast (event.tsx:64). |
| M5-Guests | 4.1 | MINOR | Rows in the selected list are 58px; the design renders them at 67px (`min-height:58px; padding:4px 14px` + border, content-box). Because of that, the "אקסל / הוספת נרשם" buttons sit 18px higher. "לא שילמו · 1" against 2 is data. |
| M6-Live | 4.0 | DEFECT | **Nav.** The bottom bar has 5 tabs (אירוע, ניהול, החווה, קניות, משימות). The design has 4 (ניהול, החווה, קניות, משימות), with no "אירוע" tab for the manager on event day. "סריקות אחרונות" rows are 48px; the design renders them at 53px. Scan rows are data. |
| M7-Summary | 1.7 | DEFECT | **Nav.** Same extra "אירוע" tab: 5 tabs where the design has 4. The afterEvent scenario still counts the festival as "today" and not closed (`useEventToday`, App.tsx). "שני 26.10" against the design's "ראשון 26.10" is fine: 26.10.2026 is a Monday, so the design has the wrong weekday. |
| M8-People | 5.5 | MATCH | The list contents and letter groups are data. "תפקיד לפי כתובת מייל" is present below the fold. "עם חוב · 5" is data. |
| M9-Person | 2.2 | MATCH | History rows are data. |
| M10-Reports | 1.9 | MATCH | Data (extra performer row, debt total). |
| N1-Visits | 0.1 | MATCH | – |
| N2-Visit | 2.2 | MINOR | "באותו יום ביומן" lists "הכנות לפסטיבל · כל היום · נועה" twice (rows 1 and 3). This is either duplicated seed data or a missing dedupe. The longer list pushes "שעה והערה לאורח" below the fold; it is present. |
| N3-Donations | 1.9 | MATCH | Data. |
| N4-Donation | 1.4 | MATCH | The "עוד ממיכל" rows are data. |
| N5-Settings | 0.1 | MATCH | – |
| N6-Payments | 0.4 | MINOR | The disabled "אשראי באתר" switch is faded. The legacy global rule `button:disabled { opacity: .5 }` gives it a computed opacity of 0.5. The design shows a solid #B6BCC4 track with a white knob at full opacity. |
| N7-Messages | 1.5 | MINOR | The "אישור תשלום" body is different. The design has "שלום [שם], קיבלנו [סכום] על [אירוע]. תודה!". The app has "שלום [שם], קיבלנו את התשלום בסך [סכום] עבור [עבור]. תודה מחוות רווה!", which reads as "עבור עבור". There is also a 5th card, "תזכורת לאירוע", with a raw URL; the design shows 4 cards. The template text may be stored settings. |
| N9-Products | 7.6 | MINOR | Product rows are 53px; the design renders them at 57px (`min-height:52px; padding:2px` content-box). Over 8 rows the list ends 32px higher and "מוצר חדש" moves up with it. |
| N10-Product | 0.5 | MATCH | – |
| N11-EventEdit | 0.4 | MATCH | – |
| N12-Tab | 3.5 | MINOR | Line-item rows are 46px; the design renders them at 51px (`min-height:46px; padding:2px` content-box). The "רשמה נועה" footer row is about 4px shorter. The action buttons sit 15px higher. |
| N13-Invite | 0.4 | MATCH | – |
| N14-Activity | 5.8 | MATCH | Data. The app's filter chip row runs to the screen edge, while the design clips it at the 16px gutter (negligible). The duplicate "דנה הוסיפה לקניות: חלב 3%" at 09:12 is seed data. |
| G1-Amounts | 0.2 | MATCH | – |
| G2-VisitTypes | 0.2 | MATCH | – |
| G3-Questions | 0.1 | MATCH | – |
| G4-Contact | 0.2 | MATCH | – |
| G5-Managers | 2.7 | MATCH | The 4th manager is data. |

## Controls (light click-through)

On all 42 screens I found no console errors or page errors, no unnamed controls, and no `href="#"` dead links.
I clicked 130 primary controls, each on a fresh load. Every one navigates, opens a sheet, shows a toast, flips its state, or downloads a file. The first pass flagged 6 items as "no effect"; each was a false negative and was re-checked by hand:
- The switches on N9 and G4 and the role segment on N13 flip `aria-checked`, which the first pass did not detect.
- On G3, "יישוב" opens the "עריכת שאלה" sheet.
- On M4, "שיתוף הקישור" calls `navigator.share` with the event URL.
- On Y1, "דורש אותך" is a heading, not a control.

Highlights: Y5 "סגירת האירוע" closes the event and lands on the summary with a toast. N13 save shows a toast with the address and role. M7 and N3 Excel download a CSV. N12 "מחילה" opens a reason sheet.

## Defects to fix (by severity)

1. **M6-Live, M7-Summary: extra "אירוע" tab in the bottom nav.** The designs show 4 tabs for the manager on these screens, and the app shows 5. Either hide the event tab on manager screens (`/manage/*`), or limit it to staff who are assigned to the live event. Also, M7's afterEvent scenario treats the festival as live today. Make the tab go away once the event day is over (Y5 promises "לשונית 'אירוע' יורדת מהטלפונים של הצוות").
2. **Y1-Live: hero count alignment.** Change `.eventday-hero-count` to `align-items: baseline` and remove `padding-bottom: 4px` from `.eventday-hero-count__text`, so "נכנסו" sits on the "212" baseline and "מתוך 640 כרטיסים" hangs below it. The hero should come out at about 143px. Set `.eventday-chartcard__title` to 16px. Make the bottom action buttons size to their content as in the design, starting about 75px from the left edge.
3. **Y5-Close: missing copy.** The cash-count meta should read `${money} · ספר ${name}`, or `ספרה ${name}` for a female counter: "1,150 ₪ · ספר יואב" and "640 ₪ · ספרה נועה" (live.tsx:341).
4. **N7-Messages: "אישור תשלום" copy.** Match the design: "שלום [שם], קיבלנו [סכום] על [אירוע]. תודה!". The current text with the "עבור" chip reads "עבור עבור". Decide whether the 5th "תזכורת לאירוע" card belongs on this screen.
5. **List row heights (M5, M6, N9, N12).** The design renders `min-height` plus padding plus border, because the rows are content-box. Set the rendered heights to: M5 selected guest rows 67px, M6 recent-scan rows 53px, N9 product rows 57px, N12 tab line items 51px. For example, raise min-height by 2×padding+1, or set `box-sizing: content-box` on those rows.
6. **N6-Payments: faded disabled switch.** Exclude `.k-toggle` from the legacy `button:disabled { opacity: .5 }` (for example `.k-toggle:disabled { opacity: 1 }`), so the off track is solid #B6BCC4.
7. **N2-Visit: duplicate same-day entry.** "הכנות לפסטיבל · כל היום · נועה" appears twice in "באותו יום ביומן". Dedupe by item id, or fix the seed.
8. **E8-StallSell: header spacing.** Tighten the buyer header so the product grid starts at y≈148: about 3px less above the avatar and 4px less between the name and the subtitle.
9. **Y2, Y3, Y4: vertical offsets.** Reduce the gap between the title block and the search box or stat tiles by about 4px, and between the search box and the chips by about 2px, so the lists start where the design has them. On Y3, trim the timeline rows to 59px.
10. **M3-Events: extra "אירועים קודמים · 2" row.** It is not in the design. Keep it only if it was decided earlier, and if so, record that in the design.
11. **E2-Scan: demo QR buttons.** They are demo-only and intentional, so leave them, but note that the design does not show them.
12. **M4-Prep: share fallback (behaviour, not visual).** When `navigator.share` rejects for any reason other than the user cancelling, fall back to copying the link and showing the "הקישור הועתק" toast.
