# Visual check, group A (independent verifier)

Run on 2026-11-21 against http://localhost:5173, 390x844 @2x, demo mode, demo strip hidden:

```
node scripts/visual-check.mjs <ids> --base=http://localhost:5173 --out=docs/visual-check/A --design=havat-raveh-redesign/design
```

Each `<id>.pair.jpg` puts the design on the left and the app on the right. Differences that come only from demo data (counts, names, times, extra rows) are not counted. No screen logged a console error. "1x px" means CSS pixels at 390 wide.

**Result: 19 MATCH · 15 MINOR · 6 DEFECT** (40 screens)

| id | diff % | verdict | precise differences |
|---|---|---|---|
| T1-Root | 0.6 | MINOR | The visible part matches. Below the fold the by-place list goes on with groups of tasks that are already done (see D1). |
| T2-Time | 2.4 | MATCH | Groups "להיום / השבוע / בהמשך" come from the data. The app shows the full title "להעביר שקי קומפוסט לחממה", which the design cut short. |
| T4-Done | 1.0 | MINOR | "מכולה ומחסן" group: in the design the task just done ("לסדר את ארגז הכלים", struck through, "בוצע עכשיו · יואב") stays first in its group. The app moves it under the open "לצבוע את דלת המחסן". The toast, the hero and the progress all match. |
| T3-Task | 0.2 | MATCH | |
| C3-TaskLinks | 5.6 | MINOR | Top info card: rows are 60px in the app, 58px in the design, and the title sits 3px lower, so everything below is about 9px lower. The "קשור ל" rows match (66px). |
| C4-Assign | 7.5 | DEFECT | Dana's line under "לא כאן עכשיו": the design says **"מגיעה ב־15:00"**, the app says "בחווה מ־15:00" (D4). The selection differs only because the design shows the state after picking Yoav. Picking Yoav does turn the button into "להעביר ליואב" and saves. |
| T5-Add | 0.5 | MATCH | |
| T6-History | 4.5 | MINOR | The search field is 52px tall, the design's is 48px, so the pills and the list sit 4px lower. The "אתמול · 9" header also shows "עוד 5", which the design doesn't have (the design itself shows only 2 of 9 rows). |
| L5-MineEmpty | 2.8 | MINOR | The empty-state block (circle, title, line, button) sits 8px higher than in the design. Same component as S3. Clicking "לקחת אחת מהפנויות" only switches to "לפי מקום" (and leaves "רק שלי"). Nothing gets taken. |
| C6-DonePhoto | 1.8 | MATCH | Photo box is 2px shorter, which is within tolerance. |
| C7-DayEnd | 6.4 | MATCH | Only data differs (4 vs 5 done, 11 vs 15). |
| C8-Offline | 7.5 | MINOR | Everything under the black offline strip starts 4px lower (title block 4px further from the strip). |
| X1-Refused | 1.0 | DEFECT | The red toast says "לא נשמר. מישהו אחר הקדים אותך." The design says **"לא נשמר. נועה לקחה את המשימה לפני רגע"**. Also, the row the user tried to take should change to "נועה · לפני רגע" with no "לקחת" button. The app leaves "פנויה · עם תמונה" and the button (D3). |
| B4-Receive | 14.1 | DEFECT | While the broadcast card is showing, the design has no progress segments and no "3 מתוך 5 שלך בוצעו" line: the hero card comes right after the broadcast. The app shows both, so everything below sits about 44px lower (D2). |
| P1-Root | 9.2 | MINOR | The P1 design disagrees with the P6 design. P1: hero label "הבא בתור · מתוך "הכנות לפסטיבל"", no "פרויקט" chip, projects right under the hero, no "עליך" card. P6: label "הבא בתור", "פרויקט" chip, an "עליך" card, then projects. The app follows P6. The bell has no red badge, because the demo owner has 0 unread (data). Designer should confirm P6 is the source of truth. |
| P6-Full | 12.0 | DEFECT | Under "כל המשימות בחווה" the app adds groups of already-done tasks after "חממה": "בלי מקום" (with 3 done rows), "פינת החי · 5", "שורת העציצים הצפונית · 1", "העץ מאחורי הביתן · 2", "אזור הדוכן · 1" (done 18.11). The group counts include done tasks. The design ends after "חממה" and shows open tasks only (D1). The top of the page matches. |
| P2-List | 0.2 | MATCH | |
| P3-Project | 7.3 | MINOR | Step rows are 60px tall, the design's are 69px (about 9px less padding per row). The list ends 63px higher and "צעד נוסף" moves up with it. |
| P4-Step | 0.8 | MATCH | |
| P5-New | 5.2 | MINOR | Step rows are 60px vs 69px, same as P3. The owner avatars on steps 1 and 3 ("בג", "אכ") are missing only because the run doesn't pick owners. |
| L1-Templates | 3.6 | DEFECT | Bottom nav: the design lights **משימות**, the app lights **ניהול** (D6). The rest matches. Turning a switch off works: the summary goes to 4 and the row moves to the bottom. |
| L2-Template | 1.5 | MATCH | "איפה" truncates the same way in both. |
| L3-Places | 5.0 | DEFECT | Order: the design goes by open tasks (ליד הכניסה, מכולה ומחסן, חממה, then פינת החי, העץ מאחורי הביתן, שורת העציצים הצפונית, אזור הדוכן). The app sorts by name (אזור הדוכן first). Bottom nav: the design lights **משימות**, the app lights **החווה** (D5). The design shows 4 tabs (with ניהול), so the coverage row should use the manager persona. |
| L4-Place | 4.2 | MATCH | The design is drawn for another place. "· דיוק 4 מטר" is missing only because the demo place has no accuracy; the code supports it. |
| S1-Root | 2.2 | MATCH | Only data differs (5 items, "מפות שולחן"). |
| S2-Wish | 0.1 | MATCH | |
| S3-Empty | 1.1 | MINOR | The empty-state block (cart, title, line) sits 8px higher. Same as L5. |
| S4-Item | 0.2 | MATCH | |
| S5-Add | 0.6 | MATCH | |
| S6-Trip | 3.6 | MATCH | Rows are 1px shorter, which is within tolerance. |
| S7-TripEnd | 0.3 | MATCH | |
| S8-History | 0.3 | MATCH | |
| F1-Root | 0.3 | MATCH | |
| F2-Month | 1.6 | MINOR | Day-list rows under "חמישי 19.11" are 50px, the design's are 55px. |
| F3-Day | 3.5 | MINOR | "מה קורה" rows are 50px vs 55px, same as F2. Extra routine rows are data. |
| F4-Presence | 4.5 | MATCH | The design shows three days already picked ("שמירה · 3 ימים"); the app starts with today. Picking a day updates the label ("שמירה · יומיים") and saves. |
| F5-Feed | 1.9 | MINOR | The last line reads "בני סיים: פתיחת שער הכניסה". The design has **"בני פתח את שער הכניסה"**. The app's thumbnails are real photos, which is fine. |
| F6-Event | 0.5 | MATCH | |
| C11-CalItem | 14.4 | MINOR | The design shows a filled form; the app opens empty, which is expected. After "מנהלים בלבד", the "מי משתתף" chips come in name order (אליה, בני, דנה, נועה, רועי). The design orders them בני, נועה, אליה, דנה. With "כל הצוות" (the default) the app wraps all 12 names onto 3 rows of chips; the design doesn't show that state. |
| C5-Teammate | 3.9 | MINOR | "עליה עכשיו" doesn't have the project-step row "לתאם מוזיקה חיה [פרויקט] · הכנות לפסטיבל · צעד 5". The code shows steps only to managers (`teammate.tsx:79`), but the design shows it to a staff viewer. Needs a product decision, since projects are managers-only elsewhere ("מתנדבים לא רואים את המסך הזה"). |

## Click-through (light)

Scripts: `.build/verify-A-clicks.mjs`, `.build/verify-A-clicks2.mjs`, `.build/verify-A-t1groups.mjs`. No console errors and no dead buttons.

- Each of these did what it should:
  - T1: לקחת (row turns to "שלך"), the three view tabs, בוצע with its toast and undo
  - T3 בוצע; "עם צילום" goes to /done
  - C4 assign
  - T5 and S5 add
  - T6 filters
  - C6 save
  - C7 tomorrow link
  - C8 "לנסות עכשיו" (strip and queue clear)
  - X1 toast and "הבנתי"
  - B4 "קראתי"
  - P1 "לפרויקט"
  - P2 cards
  - P3 take step and "צעד נוסף"
  - P4 posting an update (count becomes 3)
  - P5 create
  - L1 switch and open
  - L2 save
  - L3 open place
  - L4 save
  - S1 tick and "אני בסופר"
  - S4 quantity (6 → 7) and "נקנה"
  - S6 tick and "סיימתי לקנות"
  - S8 "שוב" (toast "נוסף לסופר: ביצים")
  - F1 presence
  - F2 view switch
  - F4 save
  - F6 "שער"
  - C11 add
- External actions (C5 וואטסאפ and התקשרות, L4 ניווט לכאן) show the demo toast "בהדגמה לא נשלח" on purpose.
- L5 "לקחת אחת מהפנויות" just moves to the by-place view. See the L5 row above.

## Defects to fix (most severe first)

1. **D1 (P6, and the same list on T1/T2/T4, staff and owner).** The "לפי מקום" list in `/tasks` adds groups made only of done tasks: פינת החי, שורת העציצים הצפונית, העץ מאחורי הביתן, אזור הדוכן (including a task done 18.11), plus done rows inside "בלי מקום". The group counts include them.
   - Fix: drop done tasks from the by-place groups and their counts. Keep only a task completed in this session, struck through in its place, as in T4. Remove groups that end up empty.
2. **D2 (B4).** While the broadcast card is visible, hide the progress segments and the "X מתוך Y שלך בוצעו" line. The "הבא בתור" card follows the broadcast with the normal card gap.
3. **D3 (X1).** On a refused take:
   - Toast: **"לא נשמר."** in bold, then "{name} לקחה/לקח את המשימה לפני רגע". In demo `refuseNext`, use נועה.
   - Update that row's meta to "{name} · לפני רגע" and remove its "לקחת" button.
   - The current generic copy "מישהו אחר הקדים אותך." is in `src/app/v2/core.tsx:54`.
4. **D4 (C4).** Someone arriving later today should read **"מגיעה ב־15:00"** (male: "מגיע ב־15:00"), not "בחווה מ־15:00".
   - Where: `src/app/v2/data/tasks.ts:316`. The farm screen already has the right wording (`screens/farm/logic.ts:188`).
5. **D5 (L3).** Sort the places list by open-task count, highest first. Places with no open tasks go after, in the design's order: routine-linked, then event-linked.
   - Light the **משימות** tab on `/places` and `/places/:id`: `src/app/v2/routes.tsx:36-37`, tab `'farm'` → `'tasks'`.
   - In `docs/demo-coverage.md`, set the L3 row's persona to `manager`, since the design shows the ניהול tab.
6. **D6 (L1).** Light the **משימות** tab on `/manage/recurring`, as in the design: `src/app/v2/routes.tsx:117-119`, tab `'manage'` → `'tasks'`.

Minor fixes, in this order:
- P3 and P5: step rows 69px tall (9px more vertical padding).
- F2 and F3: day-list rows 55px.
- L5 and S3: move the EmptyState block 8px down.
- T6: search field 48px tall.
- C8: remove the extra 4px under the offline strip.
- C3: info rows 58px.
- T4: keep the just-done task in its original position in the group.
- F5: routine-done feed line wording, if the design's "פתח את" phrasing is wanted.
- C11: order the participant chips as in the design.
- C5: decide whether staff see a teammate's project steps.
- P1: confirm with the designer that P6 is the reference for the top of the owner page.
