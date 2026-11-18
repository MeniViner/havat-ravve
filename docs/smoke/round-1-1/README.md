# Round 1.1 verification (Part A: the app)

Local demo (`node scripts/dev.mjs`), Claude's built-in browser with emulated viewports. Screenshots are kept outside the repository. Node 22.22, OpenJDK 27 for the Firestore emulator.

Automated: both typechecks, the build, `npm test` (core, demo, Today ordering), `npm run test:rules` (rules, rules-app incl. the new managers-only activity and eventId checks), `npm run test:api` (269 Worker assertions) all pass. The browser console showed no errors or React warnings.

## Stage 1: managers-only task activity

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Rules: volunteer cannot get or list `task_private` by id, refId, kind, actor or subject (even as assignee) | staff | rules test | Pass |
| Rules: volunteer still reads an open task's history; manager reads both kinds | staff, manager | rules test | Pass |
| Rules: only a manager may move an entry between `task` and `task_private`, and only the `kind` field | staff, manager | rules test | Pass |
| Worker: manager-only task logs as `task_private`; staff get nothing by refId or kind; edit moves history both ways | staff, manager | API test | Pass |
| Managers-only task shows its history to a manager | manager | 390×844 | Pass |
| Managers-only task is not found for a volunteer | staff | 390×844 | Pass |
| Activity feed "משימה" filter includes managers-only entries, labelled "משימת מנהלים" | manager | 390×844 | Pass |

## Stage 2: Today keeps open tasks visible

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Free group with 10 completed (more than its 8 rows): all 6 open visible first, "ועוד 8 שבוצעו היום · לכל המשימות" | staff | 390×844 | Pass |
| Same group at 12 rows: 6 open + 6 completed, "ועוד 4" | staff | 1280×800 | Pass |
| "עליך · N" header equals the tile (open only) | staff | 390×844, 1280×800 | Pass |
| Unit: open before completed, open rows never cut, hidden count | n/a | demo test | Pass |

## Stage 3: ticket totals hidden from volunteers

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Event hub: no "נכנסו"/"כרטיסים" tiles, strip reads "הנתונים במכשיר. הסריקה והדוכן עובדים בלי קליטה." | staff | 390×844, 1280×800 | Pass |
| Scan screen subtitle: "עובד בלי קליטה" only | staff | 390×844 | Pass |
| Scan result overlay: no "X מתוך Y" | staff | 390×844 | Pass |
| Gate search subtitle: event title only | staff | 390×844 | Pass |
| Stall accounts: open-accounts count only, no ₪ totals | staff | 390×844 | Pass |
| Hub, scan subtitle and stall accounts still show every total | manager | 390×844 | Pass |

## Stage 4: tasks linked to an event

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Saturday tour → "משימות לאירוע" shows only its 3 tasks, with a removable chip | staff | 390×844 | Pass |
| "הוספה" from the filtered list pre-selects the event; the new task appears in the filter | staff | 390×844 | Pass |
| Chip "כל המשימות" clears the filter and restores the tabs | staff | 390×844 | Pass |
| Event with no linked tasks: clear empty state | staff | 390×844 | Pass |
| Desktop table filtered; opening a row keeps the filter; detail shows "אירוע" with "כל ההכנות" | manager | 1280×800 | Pass |
| Rules: optional string `eventId` (≤60), creator can unlink, manager can link | staff, manager | rules test | Pass |
| Worker: tasks.create with eventId, unknown event → 400, tasks.edit clearEvent | staff | API test | Pass |

## Round 1 regression

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Tap on a stall guest lands on the product grid | staff | 390×844 | Pass |
| Gate search matches from the first character | staff | 390×844 | Pass |
| Today tile "פנויות X מתוך Y" | staff | 390×844, 1280×800 | Pass |
| Calendar opens from navigation | staff | 390×844 | Pass |
| Guest event page shows no registered count | guest | 390×844 | Pass |

Not verified here: anything that needs a physical phone (camera, autofocus, native install, gate use without reception).
