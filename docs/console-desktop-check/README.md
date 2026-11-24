# The console on a computer, against its designs

Final pass, 2026-11-24, commit a3dbb11, `/admin?demo`. Pairs: `K1-pair.jpg` to `K16-pair.jpg`, the design on the left and the build on
the right, 1440 x 900. The walk on a local Worker is separate, in `walk/`.

How it was judged: each pair by eye, and a script that takes every text of the design's HTML and looks for it in the build (words, size,
weight, colour). No design word is missing on any screen, apart from K2's weekday letters. The pictures of seven widths by eye, and a
script that looks for cut text and broken numbers at every 8 px from 1024 to 1480.

| Screen | Differs | Verdict | Note |
| --- | --- | --- | --- |
| K1 overview | 0.70% | pass | LTR sizes |
| K2 monitor | 0.79% | pass | Real weekday letters |
| K3 speed | 0.83% | pass | Extra card "השרת מהיר" |
| K4 stats | 1.87% | pass | Equal bar widths; a line under the chart and "חסומים: 1" kept |
| K5 traffic | 2.12% | pass | Equal bar widths; "הכול · 7"; the app section below the fold |
| K6 money | 0.68% | pass | One extra line under the chart |
| K7 data | 1.27% | pass | Extra "כל השדות כמו שהם שמורים · 11" |
| K8 people | 0.47% | pass | Extra internal notes and "מחיקה" |
| K9 import | 1.72% | pass | 12 rows; the import button is darker only because the mouse is on it |
| K10 backups | 0.65% | pass | LTR sizes |
| K11 queue | 0.67% | pass | Extra "ועוד 7 התראות לאדם אחד שנשלחו" |
| K12 jobs | 1.38% | pass | Extra "לא נעצרת מכאן"; LTR sizes |
| K13 switches | 0.36% | pass | |
| K14 keys | 0.63% | pass | Extra "שינוי שם", "שינוי", "לבחור תחומים", two folded sections |
| K15 run | 0.54% | pass | Extra "פרטים טכניים" and "כל הפעולות"; the id is monospace |
| K16 security | 0.65% | pass | Ninth row "שבת 21.11" after "שישי 20.11" (the design needs both) |

## Accepted deviations

- Sizes like "147 KB" read left to right.
- Extra items are kept, so that no phone feature is lost.
- K2: real weekday letters.
- K4, K5: bar columns of equal width. K4: the total 319 as drawn.
- K5: the seventh ranking is behind "הכול · 7", and the app section is below the fold.
- K6: one line of the open payments ends in "…" in windows of 1240 to 1242 px; the full text is in the tooltip.
- K7: the collection list becomes a select below 1360.
- K9: 12 rows are shown, not 8.
- K16: a live block's length is a minute. The demo's ninth row is out of order, because the design needs both rows.
- Folded columns on narrow windows. On a phone the security log shows the technical path left to right.

## Widths

| Width | Result |
| --- | --- |
| 1920, 1440, 1366, 1280, 1240, 1024 | pass, all 16 screens |
| 768, 375 | pass, phone layout on every screen (K15 to its first step) |
| 1024 to 1480, every 8 px | pass: nothing cut or broken, except the K6 line above |

No page scrolls sideways at any width.

## Interactions (demo, 1440 x 900)

| What | Result |
| --- | --- |
| Unsaved changes in data, pasted rows in import, choices in keys; reached from 6 screens each, with and without a reload on the way | asked by sidebar, Back and Forward, every time; staying (button or Escape) keeps the work; leaving leaves and the next move is not asked; Back and Forward then land on the screens in the order they were visited (702 checks) |
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

The script reports page overflow, console errors, requests outside, and cut text, but not a tag cut by its table's edge and not
text that has a tooltip. Those, the leave question and the windows were checked by temporary scripts that are not in the repository.
