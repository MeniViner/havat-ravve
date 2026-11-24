# The console on a computer, against its designs

Final pass, 2026-11-24, commit caeeddb, `/admin?demo`. Pairs: `K1-pair.jpg` to `K16-pair.jpg`, the design on the left and the build on
the right, 1440 x 900. The walk on a local Worker is separate, in `walk/`.

How it was judged: each pair by eye, and a script that takes every text of the design's HTML and looks for it in the build (words, size,
weight, colour). No design word is missing on any screen, apart from K2's weekday letters. The pictures of seven widths by eye, and a
script that looks for cut text and broken numbers at every 8 px from 1024 to 1480.

| Screen | Differs | Verdict at 1440 | Note |
| --- | --- | --- | --- |
| K1 overview | 0.70% | pass | LTR sizes. **Fails in a narrow window**, see Open |
| K2 monitor | 0.79% | pass | Real weekday letters |
| K3 speed | 0.83% | pass | Extra card "השרת מהיר" |
| K4 stats | 1.87% | pass | Equal bar widths; a line under the chart and "חסומים: 1" kept |
| K5 traffic | 2.12% | pass | Equal bar widths; "הכול · 7"; the app section below the fold |
| K6 money | 0.68% | pass | One extra line under the chart |
| K7 data | 1.27% | pass | Extra "כל השדות כמו שהם שמורים · 11" |
| K8 people | 0.47% | pass | Extra internal notes and "מחיקה". **Fails in a narrow window**, see Open |
| K9 import | 1.72% | pass | 12 rows; the import button is darker only because the mouse is on it |
| K10 backups | 0.65% | pass | LTR sizes |
| K11 queue | 0.67% | pass | Extra "ועוד 7 התראות לאדם אחד שנשלחו". Cut words in a narrow window, see Open |
| K12 jobs | 1.38% | pass | Extra "לא נעצרת מכאן"; LTR sizes |
| K13 switches | 0.36% | pass | |
| K14 keys | 0.63% | pass | Extra "שינוי שם", "שינוי", "לבחור תחומים", two folded sections |
| K15 run | 0.54% | pass | Extra "פרטים טכניים" and "כל הפעולות"; the id is monospace |
| K16 security | 0.65% | pass | Ninth row "שבת 21.11" after "שישי 20.11" (the design needs both) |

## Open

| Severity | Screen | What | Code |
| --- | --- | --- | --- |
| medium | K1, 1220 to 1258 | The tag "לא הצליח" in the last actions is cut by the table's edge ("לא הצל" at 1240). The table needs 573 px, the card has 542 | `src/console/desk/status.css:59` (the cells fold only up to 1219) |
| medium | K8, 1208 to 1224 | The tags "חסומה" and "את/ה" are cut by the card's edge ("חסומ") | `src/console/desk/data.css:35` (the mail folds only under 520 px) |
| low | K11, 1168 to 1234 | "על מה" ends in "…"; at 1168 six of eight rows lose the main word ("אישור תשלום · …"). The full text is in the tooltip and the panel | `src/console/desk/sending.css:56-59` (folds only under 480 px) |
| low | K7, K9, K14 | Sidebar to another screen, stay, then Back and leave: opens the screen that was declined, not the one before. And after Back and leave, the next Back returns to the screen that was just left | `src/console/desk/route.ts:68-69` (`pushState` and `location.hash =` add entries instead of going back over them) |

## Accepted deviations

- Sizes like "147 KB" read left to right.
- Extra items are kept, so that no phone feature is lost.
- K2: real weekday letters.
- K4, K5: bar columns of equal width. K4: the total 319 as drawn.
- K5: the seventh ranking is behind "הכול · 7", and the app section is below the fold.
- K7: the collection list becomes a select below 1360.
- K9: 12 rows are shown, not 8.
- K16: a live block's length is a minute. The demo's ninth row is out of order, because the design needs both rows.
- Folded columns on narrow windows. On a phone the security log shows the technical path left to right.

## Widths

| Width | Result |
| --- | --- |
| 1920, 1440, 1366, 1280 | pass, all 16 screens |
| 1240 | **fail** K1 (above). K6: one line of the open payments ends in "…" (tooltip, 1240 to 1242 only). The rest passes |
| 1024 | pass, all 16 screens |
| 768, 375 | pass, phone layout on every screen |
| 1024 to 1480, every 8 px | only the K1, K8, K11 and K6 items above; no number, date or size is broken over lines |

Not a pixel of sideways page scroll at any width.

## Interactions (demo, 1440 x 900)

| What | Result |
| --- | --- |
| Unsaved changes in data, pasted rows in import, choices in keys; reached from 5 different screens each | asked by sidebar and by Back, every time; staying (button or Escape) keeps the work; leaving leaves and the next move is not asked. Where Back lands: see Open |
| Same, by another row (data, keys) and another collection (data) | asked; staying and leaving both work |
| Same, by reload | the browser's own question, on all three |
| Import, at the check step | asked, and staying keeps the checked rows |
| "מפתח API עומד לפוג" on the overview | opens that key ("בדיקות אוטומטיות") |
| K7: Enter on a row | opens the edit with focus in the first field; Escape leaves when nothing changed |
| K7: "כל השדות" | the stored location reads left to right |
| 32 windows and confirmations: focus goes in, Tab and Shift+Tab stay in, Escape closes, focus does not drop to the page | 32 of 32 pass |
| Console errors and warnings; requests outside localhost | none; none |

## How to rerun

The dev server on http://localhost:5193 and the design package in `havat-raveh-console/` are needed.

```
node scripts/console-check.mjs                                   # the pairs, into this folder
node scripts/console-check.mjs --shot --width 1240 --out /tmp/w  # the pictures of one width
node scripts/console-check.mjs K9 --shot --width 1280 --out /tmp/w
```

The script reports page overflow, console errors, requests outside, and cut text, but not a tag cut by its table (K1, K8 above) and not
text that has a tooltip (K11). Those were found by temporary scripts that are not in the repository.
