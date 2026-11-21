# Farm area: data model (F1-F6, C11, C5)

Code: `src/app/v2/data/farm.ts` (hooks and writes, all through `db.ts`), `src/app/v2/screens/farm/logic.ts` (pure helpers, tested by `tests/v2-farm.mjs`). Demo rows: `src/app/demo/seed/farm.ts`.

The farm area adds **no new collection**. It extends `calendar` with optional fields and reads `activity`, `tasks`, `shopping`, `events`, `events/{id}/staffing` and (managers) `projects/{id}/steps`.

## `calendar/{id}` (existing; extended)

| field | type | old documents | written by |
|---|---|---|---|
| ownerUid, ownerName, title, date (`YYYY-MM-DD`), kind, refId, createdAt | as today | unchanged | F4, C11 |
| time | `"HH:MM–HH:MM"`, `"HH:MM"`, `"–HH:MM"` or `""` (all day), max 11 chars | still read: hours come from it when `from`/`to` are missing | F4 and C11 keep writing it next to `from`/`to`, so old screens and anything else reading `time` keep working |
| from, to | `"HH:MM"` or `""` (open end) | missing → parsed from `time`; both empty = all day | F4, C11 |
| note | string ≤ 200 | missing → `""` | F4 (note to the team); shown as the line under the title |
| audience | `'all'` \| `'managers'` | missing → `'all'` | C11 |
| participants | uid[] (≤ 30) | missing → `[]` | C11 |
| reminder | `'60'` (one hour before) or `""` | missing → no reminder | C11 |
| remindAt | ISO instant (start minus 60 min, Israel time, summer time handled) or `""` | missing → none | C11 (set again on every save) |
| reminderSentAt | ISO or `null` | missing → treated as not sent | C11 writes `null` on every save; the Worker sets it |

**Presence** = `kind == 'presence'`, or (as the old calendar wrote it) `kind == 'manual'` with title `"<first name> בחווה"` by its owner. Both count everywhere (F1 hero and week bars, F2 marks, F3 axis, C5 week). Several entries of one person on one day count once. F4 updates the person's own `kind: 'presence'` entry for a chosen day instead of adding a second one, and creates a new one otherwise (one `write.batch`, works offline). Old manual entries are left alone.

**Who reads / writes**: every team member reads (`isStaff`). Volunteers create, change and delete only their own presence (F4). Managers create, change and delete any item (C11); events and visits are written by their own areas (`kind: 'event' | 'visit'`, `refId` = the event / visit id) and only displayed here. New C11 items are `kind: 'manual'`.

**Audience**: `'managers'` is a display rule only (rules cannot filter a date-range query per document). Volunteers' screens drop those items on the client; the text is not secret. Anything secret does not belong in the calendar.

## Reads from other areas (unchanged documents)

| what | query | used in |
|---|---|---|
| `activity` | `kind in ['task','shopping']`, `at` in [day start, next day start) Israel time, `orderBy at desc`, limit 400 | F5 feed and counts, F1 "נעשו היום" |
| `activity` | `by.uid ==`, `kind == 'task'` (managers: `in ['task','task_private']`), `action == 'done'`, `at >= month start`, `orderBy at desc` | C5 "בוצעו היום" / "החודש" (distinct refIds) |
| `tasks` | `dateKey == day` (+ `managersOnly == false` for volunteers) | F3 routines of the day |
| `tasks` | `doneAt` range (+ `managersOnly == false`) | F5 photo (`donePhoto`) and place of a done task |
| `tasks` | `eventId ==`, `done == false` (+ `managersOnly == false`), `orderBy createdAt` | F6 "הכנות לאירוע" |
| `tasks` | `assignee.uid ==`, `done == false` (+ `managersOnly == false`), `orderBy createdAt desc`, limit 30 | C5 "עליה עכשיו" |
| `shopping` | `createdAt >= from`, `boughtAt >= from` | F5 urgency and list name |
| `events` | `published == true`, `orderBy start` | F1 next event; F6 reads the event doc |
| `events/{id}/staffing` | all | F6 crew ("6 בצוות האירוע") |
| `projects` (`status == 'active'`) and `projects/{id}/steps` (`assignee.uid ==`, `done == false`) | managers only | C5 project steps |

Writes outside the calendar: F6 "לקחת" = `transact` on `tasks/{id}` (refused with X1 when someone took or finished it first), writing only `assignee` and `updatedAt`, then `logActivity(..., 'assigned', ...)` as the old task screens do. F6 check = `store.setTaskDone` (same activity log as the task screens). No other activity kinds are added; `logActivity` is unchanged.

F6 "רענון" reads tickets, products, staffing and the event's tasks once from the server (`readOnce`) so the cache holds them for the day; the time is kept per device in `localStorage['farm-offline-<eventId>']`.

## Scheduled reminders (the Worker)

The client never sends calendar reminders (no `notify()` call in this area: no farm screen designs a notification). The Worker, on its schedule:

1. Query `calendar` where `remindAt > ""` and `remindAt <= now` and `reminderSentAt == null` (index below).
2. For each item: recipients = `participants`; if empty, nobody (an item without participants has no one to remind). Skip uids whose profile is not active.
3. Send through the shared `notify()` path (personal notification + push outbox): title = item `title`, text = `"<from> · היום"` (or `"היום"`), link `/farm/calendar?view=day&date=<date>`.
4. Set `reminderSentAt` = now (one write per item). Editing the item in C11 writes a new `remindAt` and `reminderSentAt: null`, so a moved meeting is reminded again.

## Rules changes needed (`firestore.rules`, `match /calendar/{id}`)

```
function calendarShape(){return incoming().keys().hasOnly(['ownerUid','ownerName','title','date','time','kind','refId','createdAt',
    'from','to','note','audience','participants','reminder','remindAt','reminderSentAt'])
  && str(incoming().title, 200) && str(incoming().date, 10) && str(incoming().time, 11)
  && incoming().kind in ['manual','visit','event','presence','meeting','planning']
  && str(incoming().get('from',''), 5) && str(incoming().get('to',''), 5) && str(incoming().get('note',''), 200)
  && incoming().get('audience','all') in ['all','managers']
  && incoming().get('participants',[]) is list && incoming().get('participants',[]).size() <= 30
  && incoming().get('reminder','') in ['', '60'] && str(incoming().get('remindAt',''), 40)
  && (incoming().get('reminderSentAt', null) == null || str(incoming().reminderSentAt, 40));}
// a volunteer's own presence: hours and the note may change too
allow update: if calendarShape() && (isManager() || (ownsPresence() && changed().hasOnly(['title','date','time','from','to','note'])));
// volunteers' presence carries no manager fields
function createsPresence(){return isStaff() && incoming().kind == 'presence' && incoming().ownerUid == uid() && incoming().ownerName == get(userPath()).data.displayName && incoming().refId == '' && str(incoming().createdAt, 40)
  && !incoming().keys().hasAny(['audience','participants','reminder','remindAt','reminderSentAt']);}
```

Until this lands, F4 and C11 writes are refused on Firestore (the current shape refuses `from`, `to`, `note`), so it ships with the screens.

Other rules this area depends on (owned elsewhere): `events/{id}/staffing` needs `allow read: if isStaff()` (no rule exists yet; written by the events / event-day area); `projects` and `projects/{id}/steps` are managers-only, which is why volunteers do not see project steps in C5.

## Indexes needed (`firestore.indexes.json`)

| collection | fields | for |
|---|---|---|
| activity | by.uid ASC, kind ASC, action ASC, at DESC | C5 counts |
| tasks | eventId ASC, done ASC, managersOnly ASC, createdAt ASC | F6 prep (volunteers) |
| tasks | eventId ASC, done ASC, createdAt ASC | F6 prep (managers) |
| tasks | assignee.uid ASC, done ASC, managersOnly ASC, createdAt DESC | C5 tasks (volunteers) |
| tasks | assignee.uid ASC, done ASC, createdAt DESC | C5 tasks (managers) |
| calendar | reminderSentAt ASC, remindAt ASC | Worker reminders |

Already present and used: activity (kind, at DESC); tasks (managersOnly, doneAt DESC); events (published, start ASC). Single-field: calendar.date, shopping.createdAt / boughtAt, tasks.doneAt.

## Rules test cases (to add to `tests/rules-app.mjs`)

1. Volunteer creates own presence with `from`, `to`, `note`, `time: "08:00–13:00"` → allowed.
2. Volunteer creates presence for another uid, or with `ownerName` not equal to the profile name → denied.
3. Volunteer creates presence with `audience` / `participants` / `remindAt` → denied.
4. Volunteer creates `kind: 'manual'` (C11 item) → denied.
5. Volunteer updates own presence `from`, `to`, `note`, `time`, `title`, `date` → allowed; changes `ownerUid` or `kind` → denied.
6. Volunteer updates or deletes someone else's presence → denied; deletes own → allowed.
7. Manager creates `kind: 'manual'` with `audience: 'managers'`, 3 participants, `reminder: '60'`, `remindAt`, `reminderSentAt: null` → allowed.
8. Manager create with `audience: 'secret'`, 31 participants, `reminder: '30'`, `note` of 201 chars, or `time` of 12 chars → denied.
9. Old document without any v2 field: manager updates `title` only → allowed (all new fields optional).
10. Volunteer reads a date range of `calendar` → allowed; signed-out read → denied.
11. Volunteer queries `tasks` with `eventId ==` but without `managersOnly == false` → denied; with it → allowed (F6 "רענון").
12. Volunteer `transact` take: update `assignee` + `updatedAt` on an open task → allowed; adding any other key (e.g. `takenAt`) → denied.
13. Volunteer queries `activity` with `by.uid`, `kind == 'task'`, `action == 'done'` → allowed; with `kind == 'task_private'` → denied.
