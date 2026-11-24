# Owners' console on a computer: plan (Stage 0)

Source: the design package `havat-raveh-console/` (not committed). Branch `console/desktop`, from main `2dd6d2b`.

Meni's instruction on top of the package: what is not fully built gets built, and what is not designed gets designed in
the same language. So every item in the "may not exist yet" list is built, not left out. The Worker is not deployed
from here: every screen must also work against the Worker that runs today.

## How it is built

- Each screen file keeps its phone version and gains a computer version. `useWide()` (from 1024 px) picks one.
  Both use the same loading and action code.
- Shared computer parts: `src/console/desk/` (shell, table, detail panel, tiles, charts, toolbar, buttons).
- Tokens come from the v2 kit (`.v2`). Computer sizes are their own `--d-*` set.
- The route is `#/<tab>` exactly as today. A selected row adds to it: `#/people/<uid>`.
- The demo has its own clock (it stands at 23.11.2026, 18:36 Israel time), so it always shows the designed content.
- A control that needs a newer Worker is drawn only when the answer holds its field. Until Meni approves a deploy,
  those controls are hidden, not dead.

## Blocks per screen

Legend: **P** already on the page · **R** from an existing route · **C** computed in the browser · **W** new Worker code.

| Screen | Blocks | Source |
|---|---|---|
| K1 overview | status hero and 24 h strip | R `/monitor` |
| | regular request time | W `overview.last24h.p50`; else the site's answer time, labelled as such |
| | attention cards | R `/overview`, `/queue`, `/monitor` (morning check), C |
| | morning check, quota, sending state | R `/monitor`, `/overview` |
| | recent actions with the record's name | R `api_log` (the request body holds the title) |
| K2 monitor | week matrix, what happened lately | W `monitor.week`, `monitor.events`; else today's column and site incidents |
| | daily morning summary switch | W `alerts.daily` |
| | alerts, test alert, quota | P |
| K3 speed | tiles, chart, per operation | P |
| | slowest requests | W lists the top ten, also under two seconds; else only the slow ones |
| K4 stats | all | P, C |
| K5 traffic | all | P, C |
| K6 money | hero, payments, months, funnel, earlier events | P, C |
| | Excel | C (a CSV made in the browser) |
| K7 data | collections, record, careful edit, versions | P |
| | columns in the records table, status chips | W `data/docs` adds simple `fields`; else title, id, updated |
| | short history in the panel | R `/data/history`; W `days=0` (activity only, no backup reads) |
| K8 people | table, role, block, notes, delete, set ahead | P |
| | last entry and device | W `people/access` (Firebase Auth last sign-in, one request for all; device from the entry of a sign-in to the console or a phone subscription) |
| | permission changes | R the app's `activity`, read by the owner |
| K9 import | steps, table, mapping, verdicts, summary | P, C |
| | place column (existing places matched, new ones made) | C over `places.list` and `places.create` |
| | undo until tomorrow | W `imports` |
| K10 backups | list, download, restore, recycle bin | P |
| | late status, storage | C from the times, R `/monitor` |
| K11 queue | waiting and failed, resend, do not send | P |
| | sent lately, the message itself, the address, the daily count | W `queue.sent`, `queue/email/<id>`, `queue.daily` |
| K12 jobs | table, run now, pause, cleanup, archive | P |
| | four-hour strip, requests used | W `jobs.rounds` |
| | full round now | C: runs each job in turn, each its own request |
| K13 switches | three cards, maintenance text | P |
| | email messages to registrants switch | W `broadcastEmailPaused` |
| | recent changes with the reason | W `switches.history`, `reason`; else from `api_log` without a reason |
| K14 keys | table, scopes, replace, cancel, restore, rename, expiry | P |
| | requests and failures this week | W `keys/<id>/usage` |
| K15 run | list, form, result | P |
| | undo | C: a fixed table of operations and their reverse, behind a confirmation |
| K16 security | table, filters, search | P |
| | from where, what exactly (which switch) | C; W adds the switch's name |
| | summary, blocked addresses, sign-ins, Excel | C |

## The "may not exist yet" list

| Item | Decision |
|---|---|
| ניטור: סיכום בוקר יומי | built (Worker) |
| משימות מתוזמנות: סבב מלא, ורצועת ארבע שעות | built: the round in the browser, the strip in the Worker |
| מתגים: למה | built (Worker) |
| תור שליחה: 11 מתוך 300 | built (Worker: the count already kept in KV) |
| ייבוא: ביטול עד מחר | built (Worker) |
| הרצת פעולה: ביטול | built in the browser |
| אנשים: כניסה אחרונה ומכשיר | built (Worker); the device shows only where the server knows it |
| מפתחות: בקשות ותקלות השבוע | built (Worker) |

## Free-plan limits

No request per table row. KV writes: none added per round (the rounds strip lives in the record the upkeep run already
writes). New subrequests in the upkeep run: two KV reads. Switch history lives in the switches record.

## Where the live console says something else than the drawing

- K16: the drawing says a block lasts ten minutes. The limiter allows one minute, so the live text says a minute.
- K2: the drawing's weekday letters are off by one day for November 2026. The code shows the real weekday.
