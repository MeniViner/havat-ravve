# Tasks (v2) data model

Code: `src/app/v2/data/tasks.ts` (every read and write, through `src/app/db.ts`; time through `src/app/clock.ts`). Tests: `tests/v2-tasks.mjs`.
Screens: T1-T6, C3, C4, C6, C7, L1-L5, and the task parts of P1 / P6, in `src/app/v2/screens/tasks/`. S5 (add a shopping item) is the same form as T5.
Demo seed: `src/app/demo/seed/tasks.ts`.

Nothing is renamed or dropped. Every new field is optional, and old documents load through `normalizeTask` (defaults below).
Writes that do not use a new feature keep exactly the old shape.

## Collection `tasks` (existing, extended)

| field | type | old? | meaning / default for old docs |
|---|---|---|---|
| title | string 1..200 | yes | default '' |
| note | string ≤ 4000 | yes | '' |
| photo | data URL ≤ 400 kB or '' | yes | the "before" photo (T5, T3) |
| location | {lat, lng, placeId?, placeName?} \| null | yes | null when it is missing or has no numeric lat |
| dueDate | 'YYYY-MM-DD' or '' | yes | '' = no date ("בלי תאריך" in T2) |
| managersOnly | bool | yes | false |
| templateId, dateKey | string \| null | yes | null; a recurring instance's id is `${templateId}_${dateKey}` |
| createdBy, createdAt | Actor, ISO | yes | {uid:'', name:''}, '' |
| done, doneBy, doneAt | bool, Actor\|null, ISO\|null | yes | false, null, null |
| donePhoto, doneNote | data URL / string ≤ 2000 | yes | '' (C6) |
| assignee | Actor \| null | yes | null = free ("פנויה"). An assignee with no uid reads as null |
| urgent | bool | yes | false |
| eventId | string ≤ 60 | yes | '' (C3 "קשור ל") |
| updatedAt | ISO | yes | falls back to createdAt |
| **takenAt** | ISO | **new** | when the current assignee took it or got it (C4, "לפני רגע" for 10 min, the T3 timeline). Default: none |
| **shoppingId** | string ≤ 80 | **new** | the shopping item bought for this task (C3 "צריך לקנות משהו בשביל זה"). Default: none |
| **requestedBy** | Actor | **new, read only** | who asked when someone else created it on their behalf. Read by `requesterOf` (falls back to createdBy); nothing writes it yet |

Who writes what:
- **Create (T5)**: `store.addTask`, unchanged shape. Notifies the assignee when it is someone else (`notify`).
- **Edit (/tasks/:id/edit)**: `store.editTask`. Managers and the creator.
- **Done / undo (T1, T4, T3)**: `done, doneBy, doneAt, updatedAt`. A free task (not a routine) ticked by someone also gets `assignee` = the doer, so it counts in their progress. Anyone who can see the task.
- **Done with a photo (C6)**: `donePhoto, doneNote` plus the done fields when it was still open.
- **Before photo (T3 "תמונה")**: `photo, updatedAt`.
- **Take ("לקחת", T1/T3)**: in a transaction `assignee = me, takenAt, updatedAt`. Refused (X1) when it is done, gone, or already on someone else.
- **Release ("לשחרר", T3)**: transaction, `assignee = null, updatedAt`. Staff only their own; managers anyone's.
- **Assign (C4)**: transaction, `assignee, takenAt, updatedAt` (or `assignee = null`). Refused when the assignee changed since the screen opened. Notifies the new person.
- **Link to shopping (S5 opened from C3)**: `shoppingId, updatedAt` on the task, after `shopping.addShopItem` saved the item with `taskId`.
  The tasks area never writes the `shopping` collection itself.

Reads:
- Root (T1/T2/P6/C7): open `done == false orderBy createdAt desc`, plus `doneAt >= now-24h (10-minute steps) orderBy doneAt desc`. For staff, both also have `managersOnly == false`.
- History (T6): `doneAt between from..to orderBy doneAt desc limit 500` (+ `managersOnly == false` for staff).
- Place (L4): `location.placeId == id, done == false` (+ `managersOnly == false`).
- One task (T3/C3/C4/C6): the document; its activity via `useActivityFor` for the timeline (falls back to the document's own times).
- Recurring instances show the template's place and person when the instance has none (display only: `withTemplateDefaults`).

## Collection `task_templates` (existing, extended)

| field | type | old? | meaning |
|---|---|---|---|
| title, note, days, time, active, managersOnly, createdBy, createdAt, updatedAt | | yes | unchanged; all seven days are still stored as [] |
| **assignee** | Actor \| null | **new** | "אדם קבוע" in L2. Written only when set, or when the document already has the key. null when managersOnly |
| **placeId** | string ≤ 80 | **new** | "איפה" in L2 (a saved place). Written only when set, or when already present |

L1 toggle: `active, updatedAt`. Delete with a 6 s undo that re-creates the same id.

## Collection `places` (existing, extended)

| field | type | old? | meaning |
|---|---|---|---|
| name, lat, lng, createdBy, createdAt | | yes | |
| **photo** | data URL ≤ 400 kB or '' | **new** | "תמונה של המקום" (L4) |
| **accuracy** | number (metres) | **new** | GPS accuracy when the point was saved ("דיוק 4 מטר"). Written only when the browser gave one |

L3 "אני עומד כאן, לשמור מקום" creates a place called "מקום חדש" and opens L4 to name it. In the design anyone on the team can do this.

## Calendar (read only)

C4 reads today's presence: `calendar where kind == 'presence' and date == today`. Hours come from `from`/`to`, or from the older `time` text ("08:00–11:00"). No time means all day.

## Rules changes needed (for the rules agent)

1. `tasks.taskShape().keys().hasOnly([...])`: add `'takenAt'`, `'shoppingId'`, `'requestedBy'`.
   Types: `takenAt` is `str(…, 40)`; `shoppingId` is `str(…, 80)`; `requestedBy` is an actor map (`keys().hasOnly(['uid','name'])`, `str(name, 80)`).
   **Without this, every take and assign (they write `takenAt`) and every C3 shopping link is refused for everyone, managers included.**
2. `tasks` update, non-creator staff branch: allow `takenAt` and `photo` in `changed().hasOnly([...])`, next to `assignee`.
   Staff take free tasks (T1 "לקחת") and add a before photo (T3).
   Also allow `shoppingId` there: S5 from C3 links the task the volunteer is working on.
   Optional hardening: a non-manager who changes `assignee` may only set it to themselves or to null.
3. `task_templates.templateShape()`: add `'assignee'` (Actor or null) and `'placeId'` (`str(…, 80)`).
4. `places`: add `'photo'` (`photoOk`) and `'accuracy'` (number) to the create keys and to update's `changed()`.
   Create and update are allowed for `isStaff()` (L3 "אני עומד כאן" is on the staff screen in the design). Delete stays manager-only.
   If this should stay manager-only, say so and I will hide the button for staff.
5. `shopping.itemShape()`: `taskId` (`str(…, 80)`). Shopping asked for this too; it is listed here because S5 writes it.

### Rules test cases (for tests/rules.mjs)

| # | who | action | expect |
|---|---|---|---|
| 1 | staff (not creator) | update a free task: `assignee = self, takenAt, updatedAt` | allow |
| 2 | staff (not creator) | update a task on Noa: `assignee = self, takenAt` | allow by today's rules; deny if the optional hardening is added |
| 3 | staff (not creator) | update a task: `photo = data:image/webp…, updatedAt` | allow |
| 4 | staff (not creator) | update a task: `shoppingId = 'abc', updatedAt` | allow |
| 5 | staff (not creator) | update a task: `title` | deny (unchanged) |
| 6 | manager | update a task: `assignee = Yoav, takenAt` | allow |
| 7 | anyone | create a task with `takenAt` of 41 characters | deny |
| 8 | anyone | create a task with an unknown key `foo` | deny (unchanged) |
| 9 | manager | create a template with `assignee: {uid, name}, placeId: 'p1'` | allow |
| 10 | manager | create a template with `assignee: 'x'` (not a map) | deny |
| 11 | staff | create a template | deny (unchanged) |
| 12 | staff | create a place `{name, lat, lng, createdBy: self, createdAt, accuracy: 4}` | allow |
| 13 | staff | update a place: `photo = data:image/jpeg…` | allow |
| 14 | staff | update a place: `photo = 'http://x'` | deny |
| 15 | staff | delete a place | deny |
| 16 | staff | create a shopping item with `taskId: 't1'` | allow |
| 17 | old shapes | create or update a task, template or place with none of the new keys | allow, as today |

## Indexes

All covered by `firestore.indexes.json` as it is:
- `tasks (managersOnly, done, createdAt desc)` and `(done, createdAt desc)`: open tasks.
- `tasks (managersOnly, doneAt desc)`: staff done in the last 24 h and T6 ranges. Managers use the automatic single-field index on `doneAt`.
- `tasks location.placeId == x && done == false (&& managersOnly == false)`: equality only, served by single-field merges.
  If the console asks, add `tasks (location.placeId, done)` and `(managersOnly, location.placeId, done)`.
- `calendar kind == presence && date == today`: equality only, existing.

## Notes for other areas

- `materializeToday` (store.ts) creates the day's routine instances. It should copy the template's `assignee` and `placeId` (as `location`) onto the instance. Until then the screens show them from the template (`withTemplateDefaults`), but queries such as "on Yoav" or "at the greenhouse" do not see them.
- The add form (`/new`) accepts `text`, `kind=shopping`, `list=<super|building|online|wish>`, `photo=1` or `camera=1` (a shot waiting in sessionStorage `v2-capture-photo`, or open the camera), `mic=1` (start Hebrew dictation), and `task=<id>` (link to a task).
