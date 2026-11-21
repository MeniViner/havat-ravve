# Projects data (P1-P6)

Manager projects: a goal with a deadline and ordered steps. Managers and owners read and write everything here. Staff, vendors and guests must not be able to read any of it (BACKEND row 8). Separate from tasks; shown above the tasks on the managers' Tasks root (P1, P6) and on `/projects`.

Code: `src/app/v2/data/projects.ts` (hooks and actions), `src/app/v2/screens/projects/logic.ts` (pure helpers), tests `tests/v2-projects.mjs`.

## Collections

### `projects/{pid}`

| field | type | default for older docs | notes |
|---|---|---|---|
| `title` | string ≤ 120 | required | P5 "לאן רוצים להגיע" |
| `goal` | string ≤ 120 | `title` | same text as title today (kept for the type) |
| `deadline` | `YYYY-MM-DD` or `''` | `''` | parsed from P5 "עד מתי" when it is a date (`27.11`, `27.11.26`, `2026-11-27`) |
| `deadlineText` | string ≤ 60, optional | absent / `''` | P5 free text when it is not a date ("סוף דצמבר") |
| `short` | string ≤ 40, optional | `title` | short name for back links and meta lines ("הכנות לפסטיבל"); no UI sets it yet |
| `members` | `Actor[]` | `[createdBy]` | everyone who created, took, was given or finished a step (avatars) |
| `memberUids` | `string[]` | uids of `members` | "שלי" filter (P2) and the P1 block |
| `status` | `'active' \| 'done'` | `'active'` | set to `done` in the same transaction that completes the last open step |
| `doneAt` | ISO or `null` | `null` | |
| `createdBy` | Actor | required | |
| `createdAt`, `updatedAt` | ISO | required | |

### `projects/{pid}/steps/{sid}`

| field | type | default | notes |
|---|---|---|---|
| `projectId` | string | parent id | |
| `n` | number | position | sort key; fractional after "לפצל לצעדים" (4.33, 4.67). The displayed number is the index in sorted order |
| `title` | string ≤ 200 | required | |
| `assignee` | Actor or `null` | `null` | `null` = free ("לקחת") |
| `due` | `YYYY-MM-DD` or `''` | `''` | set in the P4 edit sheet |
| `note` | string ≤ 1000 | `''` | |
| `done` | bool | `false` | |
| `doneBy` | Actor or `null` | `null` | |
| `doneAt` | ISO or `null` | `null` | |
| `parentId` | string or `null` | `null` | the step this one was split from |
| `updates` | `{by: Actor, at: ISO, text ≤ 500}[]` | `[]` | P4 thread, appended with `arrayUnion`; a step stays far under 1 MiB (hundreds of updates) |
| `createdBy`, `createdAt`, `updatedAt` | | | |

No new top-level collection besides `projects`. Notifications go through the shared `notify()` (`users/{uid}/notifications`, `push_jobs`).

## Reads (listeners)

- `projects` (whole collection, no filter): P2, the P1 block, `useMySteps`. Small: a handful active, a few dozen done. No index needed.
- `projects/{pid}/steps` (whole subcollection): P3, P4, each project card, and up to 10 active projects in `useMySteps` (fixed slots).
- No collection-group query, no composite index.

## Writes

| action | where | how | conflict |
|---|---|---|---|
| create (P5) | project + steps | one batch | - |
| save edit (P5) | project, changed/new steps; cleared open steps deleted | transaction (reads every step whose assignee changed) + batch for deletes | assignee on the server differs from the one the form loaded -> `ConflictError`, nothing saved (X1) |
| take "לקחת" (P3, P4) | step `assignee`, project `members/memberUids` | transaction | step done or held by someone else -> X1 |
| release "לשחרר" (P4) | step `assignee = null` | transaction | not held by me -> X1 |
| done "בוצע" (P4, P1 next-up) | step `done/doneBy/doneAt`; project `status/doneAt` when it was the last open step | transaction | already done -> X1 |
| reopen (toast "ביטול", P4 "להחזיר לרשימה") | step + project `status: active` | batch | - |
| update "שליחה" (P4) | step `updates` arrayUnion | update | - |
| split "לפצל לצעדים" (P4) | new steps with `parentId`, same assignee and due | batch | - |
| edit step (P4 "עריכה") | step `title/due/note` | update | - |

Notifications: a step given to someone (create or edit) -> `notify([uid], {kind:'task', title:'צעד חדש עליך', ...})` with push. A thread update -> project members and the assignee, in-app only (`push: false`). Never to the actor.

Activity log: not written. The shared `activity` collection only accepts known kinds and volunteers can read team kinds; projects need a new managers-only kind (`'project'`) before they can log there. Requested in the report.

## Rules needed (`firestore.rules`)

```
match /projects/{pid} {
  allow read: if isManager();
  allow create: if isManager() && incoming().keys().hasOnly(['id','title','goal','deadline','deadlineText','short','members','memberUids','status','doneAt','createdBy','createdAt','updatedAt'])
    && str(incoming().title, 120) && incoming().title.size() > 0 && str(incoming().deadline, 10) && incoming().status == 'active'
    && actorOk(incoming().createdBy) && incoming().memberUids is list && incoming().memberUids.size() <= 50;
  allow update: if isManager() && changed().hasOnly(['title','goal','deadline','deadlineText','short','members','memberUids','status','doneAt','updatedAt'])
    && incoming().status in ['active','done'] && str(incoming().title, 120) && incoming().memberUids.size() <= 50;
  allow delete: if isOwner();
  match /steps/{sid} {
    allow read: if isManager();
    allow create: if isManager() && incoming().keys().hasOnly(['id','projectId','n','title','assignee','due','note','done','doneBy','doneAt','parentId','updates','createdBy','createdAt','updatedAt'])
      && incoming().projectId == pid && incoming().n is number && str(incoming().title, 200) && str(incoming().note, 1000) && incoming().done == false
      && actorOk(incoming().createdBy) && incoming().updates is list && incoming().updates.size() == 0;
    allow update: if isManager() && changed().hasOnly(['n','title','assignee','due','note','done','doneBy','doneAt','updates','updatedAt'])
      && str(incoming().title, 200) && str(incoming().note, 1000) && incoming().updates.size() <= 300
      // done is stamped by the person marking it
      && (!('doneBy' in changed()) || incoming().doneBy == null || actorOk(incoming().doneBy));
    allow delete: if isManager() && resource.data.done == false;
  }
}
```

(`isOwner()` stands for whatever the owner check is called there; `activity` needs `'project'` added to the create list and kept out of `teamKind()` if logging is wanted.)

## Rules test cases (`tests/rules-app.mjs`)

1. Manager reads `projects/p1` and `projects/p1/steps/s1`: allowed. Owner: allowed.
2. Staff reads `projects/p1`: refused. Staff lists `projects`: refused. Staff reads `projects/p1/steps/s1`: refused. Staff lists `projects/p1/steps`: refused.
3. Vendor and vendor helper read `projects/p1`: refused. Guest and signed-out: refused.
4. Staff creates or updates a project or a step: refused.
5. Manager creates a project with an extra field (`secret`): refused; with an empty title: refused; with `status:'done'`: refused.
6. Manager creates a step with `done: true` or with updates already in it: refused; with `projectId` of another project: refused.
7. Manager takes a free step (`assignee` = self): allowed. Manager marks a step done with `doneBy` = someone else: refused; with `doneBy` = self: allowed.
8. Manager changes `createdBy` or `createdAt` of a step or project: refused.
9. Manager deletes an open step: allowed; a done step: refused. Manager deletes a project: refused (owner only).
10. A step update that pushes `updates` past 300 entries: refused.

## Demo

Seed slice `src/app/demo/seed/projects.ts` (must be added to `SLICES` in `src/app/demo/seed/index.ts`): 3 active projects (`demo-p-festival` 3/7 with deadline 27.11, `demo-p-irrigation` 1/5 "סוף דצמבר", `demo-p-permits` 0/4 undated) and 4 done (`demo-p-fence`, `demo-p-roshhashana`, `demo-p-container`, `demo-p-petting`). Steps `demo-ps-*`, among them `demo-ps-police` (Beni's, due 23.11, two updates). The same rows for every day scenario.
