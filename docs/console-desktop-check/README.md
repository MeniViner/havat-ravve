# The console on a computer, against its designs

Checked on 2026-11-24, commit 9973eb0, `/admin?demo`. Pairs: `K1-pair.jpg` to `K16-pair.jpg`, the design on the left and the build on
the right, 1440 x 900. The walk on a local Worker is separate, in `walk/`.

How it was judged: each pair by eye, and a script that lays the design's HTML and the build side by side text by text (words, size,
weight, colour, place within 6 px). No design word is missing on any screen, apart from the agreed differences below.

| Screen | Differs | Verdict | Note |
| --- | --- | --- | --- |
| K1 overview | 0.70% | pass | Only the LTR sizes (147 KB) differ |
| K2 monitor | 0.79% | minor, stated | Real weekday letters |
| K3 speed | 0.83% | minor, stated | Extra card "השרת מהיר" kept from the phone |
| K4 stats | 1.87% | minor, stated | Equal bar widths; a line under the chart and "חסומים: 1" kept |
| K5 traffic | 2.12% | minor, stated | Equal bar widths; "הכול · 7"; the app section starts below the fold |
| K6 money | 0.68% | minor, stated | One extra line under the chart |
| K7 data | 1.27% | minor, stated | Extra "כל השדות כמו שהם שמורים · 11"; two columns sit 8 to 10 px further left |
| K8 people | 0.47% | minor, stated | Extra internal notes and "מחיקה" |
| K9 import | 1.72% | minor, stated | 12 rows, not 8; the import button is darker in the picture only because the mouse is on it |
| K10 backups | 0.65% | pass | LTR sizes |
| K11 queue | 0.67% | minor, stated | Extra "ועוד 7 התראות לאדם אחד שנשלחו" |
| K12 jobs | 1.38% | minor, stated | Extra "לא נעצרת מכאן" on the account deletion row |
| K13 switches | 0.36% | pass | |
| K14 keys | 0.63% | minor, stated | Extra "שינוי שם", "שינוי", "לבחור תחומים", two folded sections |
| K15 run | 0.54% | minor, stated | Extra "פרטים טכניים" and "כל הפעולות"; the id is monospace |
| K16 security | 0.65% | minor | A ninth row, "שבת 21.11", stands after "שישי 20.11" (demo data, on purpose: `src/console/demo/access.ts:34`), so the log reads out of order |

## Widths

| Width | Result |
| --- | --- |
| 1920 x 1080 | pass |
| 1440 x 900 and 1440 x 700 | pass |
| 1366 x 768 (K1, K7, K9 only) | pass |
| 1280 x 900 | **fail** K9: row numbers 10, 11, 12 break into two lines, one digit on each. **fail** K7: 6 of 9 task names are cut. K1: "10 GB" breaks between the number and the unit in the morning check |
| 1240 (just above the K7 breakpoint) | **fail** K9: years break, "28.11.202" over "6". **fail** K7: all names cut, and "עודכן" is cut by the card's edge ("16:02" reads "6:02") |
| 1024 x 900 | K7: 8 of 9 task names are cut (the full name is in the tooltip and the panel). K4: the chart's aside is cut, "2 משימות בו…". The rest passes |
| 768 x 1024 | pass, phone layout on every screen |
| 375 x 812 | pass, phone layout on every screen |

No page scrolls sideways at any width, and no two texts overlap. What scrolls sideways on a phone is the tab bar and the chips.

## Interactions (demo, 1440 x 900)

| What | Result |
| --- | --- |
| Up, Down, Home, End in the tables of data, people, backups, queue, keys, and in the run list | pass; the panel and the address follow |
| Reload keeps the selection | pass on all six |
| Enter on the selected row | pass: edit, card in the app, restore window, resend confirmation, save |
| 44 windows and confirmations: focus goes in, Tab and Shift+Tab stay in, Escape closes, focus returns | 44 of 44 pass |
| Every button and link in the page of all 16 screens (repeated rows sampled; the sidebar only in part, sign-out not pressed) | none is dead. A chip that is already chosen does nothing, and refresh shows no message when nothing changed |
| Console errors and warnings | none |
| Requests outside localhost | none |
| Back button, unknown screen, unknown id | pass |
| Unsaved changes, keys | asked before another row, another screen, and a reload |
| Unsaved changes, data | asked before another row or collection. **fail**: leaving by the sidebar, Back or a reload drops the edit without asking |
| Pasted rows, import | **minor**: leaving to another screen and coming back drops the pasted rows and the fixes in them without asking |
| Enter for editing, data | **minor**: focus stays on the row, and Escape does not leave the edit |
| "מפתח API עומד לפוג" on the overview | **minor**: opens the keys screen on the first key, not on the one about to expire |
| "כל השדות כמו שהם שמורים" | **minor**: the stored location is JSON written in RTL, so its brackets and quotes are scrambled |

## How to rerun

The dev server on http://localhost:5193 and the design package in `havat-raveh-console/` are needed.

```
node scripts/console-check.mjs                                   # the pairs, into this folder
node scripts/console-check.mjs --width 1280 --height 900 --shot --out /tmp/w1280
node scripts/console-check.mjs K9 --width 1240 --height 768 --shot --out /tmp/w1240
```

Below 1024 the script stops at K15 (it looks for the computer form's labels), so K15 and K16 are asked for apart: K16 works, K15 has
to be opened by hand at `#/run/tasks.create`. The script looks only for page overflow: text cut inside a card (K7, K9, K4 above)
has to be seen in the pictures. The text comparison and the keyboard script of this check were temporary and are not in the repository.
