# System data (L6, C12, C13, A1, A2, C2, C8, C9, C10, X2, Z1, Z3)

My profile, my picture, the global search, first entry, install, the offline queue, the suspended screen and the demo
entry/switch. No new collection: everything is fields on `users/{uid}` plus reads of lists other areas own.

Code: `src/app/v2/data/system.ts` (hooks, actions, pure helpers), screens in `src/app/v2/screens/system/`, demo rows in
`src/app/demo/seed/profile.ts`, tests `tests/v2-system.mjs` (helpers, search role filtering, demo-only writes).

## `users/{uid}`: fields this area writes

All already declared on `Profile` in `src/app/types.ts`. Written only by the person themselves (never by this area for anyone else).

| field | type | default for older docs | written by | notes |
|---|---|---|---|---|
| `displayName` | string 1..80 | required | C13, C9 | already allowed by `selfEdit` |
| `phone` | string ≤ 25 | `''` | C13, C9 | already allowed |
| `town` | string ≤ 60 | absent = `''` | C13 "יישוב" | **new in rules** |
| `birthDate` | `YYYY-MM-DD` or `''` | absent = `''` | C13 "תאריך לידה" (typed `14.03.1975`, stored ISO; not in the future, year ≥ 1900) | **new in rules** |
| `fields.receiptPreference` | `'whatsapp' \| 'email'` | absent = whatsapp | C13 "אישורי תשלום" toggle (on = WhatsApp) | already allowed (`fieldsOk`) |
| `photoSource` | `'custom' \| 'google' \| 'none'` | absent = `google` if `googlePhoto`, else `custom` if `photo`, else `none` (`sourceOf`) | A1, A2 | **new in rules** |
| `photo` | string, JPEG data URL, 320x320, ≤ 80 KB binary (≈ 110k chars) | absent | A2 (crop, `compressPhoto(file, 320, 80_000)`) | **new in rules**, size cap needed |
| `googlePhoto` | https URL ≤ 500 | absent | A1 when choosing Google, and a quiet refresh on L6/C12 when the Google URL changed | **new in rules** |
| `push` | `{enabled: bool, kinds: string[] ≤ 10, updatedAt: ISO}` | absent = enabled with `['broadcast','task','urgent']` | L6/C12 notification sheet | **new in rules**. Kinds: `broadcast, task, urgent, trip, event`. The push subscription itself is not created here (push area) |
| `welcomedAt` | ISO | absent | C9 (and `/welcome`) | **new in rules**. A person with a profile but no `welcomedAt` can still use the app; C9 is shown on first entry |
| `updatedAt` | ISO | required | every write | already allowed |

Never written by this area: `role`, `status`, `email`, `customerNumber`, `notes`, `log`, `helper`, `joinCode`, `createdAt`.

Readers: `users` is readable by the person, managers, and (list) by staff for team members. That means a teammate can read
`town`, `birthDate` and `photo` of other team members. Fine for photo; for `town` and `birthDate` it is a decision for Beni
(alternative: keep them in `users/{uid}/private/profile`). Not changed here.

## Reads (listeners) by screen

| screen | reads | notes |
|---|---|---|
| L6 / C12 | own profile (ctx), `tasks` history from the 1st of the month to tonight (`useHistoryTasks`) filtered `doneBy.uid == me`; `calendar where date == today, kind == 'presence', ownerUid == me` | the calendar query needs a composite index `calendar (date, kind, ownerUid)` unless one exists |
| C13, A1, A2 | own profile | |
| C2 (volunteer) | open tasks + done tasks of the last 45 days (managers-only tasks never), open shopping + recently bought, events (published only), places | client-side search, nothing new on the server |
| C2 (manager, owner) | the above + all profiles from ctx (vendors excluded), `visits`, `tickets where paymentStatus in ['pending','claimed']` | the tickets query needs an index only if combined with order; it is a single `in` filter (no index) |
| C9 | `role_invites/{my email}` (real) | demo: the latest invite (`role_invites` list, demo only) |
| C8 | `activity where by.uid == me` (latest 40) since the moment the phone went offline (`localStorage['farm-offline-since']`) | db.ts only exposes a count of pending writes; the queue lists my activity rows written since the drop. A described pending-write queue in db.ts would be more exact (requested) |
| X2 | own profile `log` (latest "נחסם") else `updatedAt`, `settings.contact` | |
| Z1, Z3 | demo store only (`src/app/demo/store.ts`), never Firestore | |

## Writes

| action | doc | how | offline |
|---|---|---|---|
| save profile (C13) | `users/{me}` displayName, phone, town, birthDate, fields, updatedAt | `write.update` | yes, pending until reception |
| photo source (A1) | photoSource (+ googlePhoto when google), updatedAt | `write.update` | yes |
| crop and save (A2) | photo, photoSource 'custom', updatedAt | `write.update` | yes (≤ 80 KB) |
| notification kinds | push, updatedAt | `write.update` (asks the browser permission first, real accounts only) | yes |
| Google picture refresh | googlePhoto | `write.update` quiet, errors swallowed | yes |
| first entry (C9) | create profile via `createProfile` (role from the invite), then `welcomedAt` quiet | transaction + update | create needs reception (transaction) |
| confirm details (`/welcome`) | displayName, phone, welcomedAt, updatedAt | `write.update` | yes |

## Rules needed (`firestore.rules`, `match /users/{id}`)

```
function profileShape(){ return incoming().keys().hasOnly([
  'uid','email','displayName','phone','role','status','customerNumber','acceptedTermsAt','joinCode','notes','fields','log','createdAt','updatedAt',
  // new
  'vendorId','helper','addedBy','photo','photoSource','googlePhoto','town','birthDate','push','welcomedAt'
]) && ... (as today)
  && (!('photo' in incoming()) || str(incoming().photo, 120000) && incoming().photo.matches('^data:image/(jpeg|webp|png);base64,.*'))
  && (!('photoSource' in incoming()) || incoming().photoSource in ['custom','google','none'])
  && (!('googlePhoto' in incoming()) || str(incoming().googlePhoto, 500))
  && (!('town' in incoming()) || str(incoming().town, 60))
  && (!('birthDate' in incoming()) || incoming().birthDate == '' || incoming().birthDate.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
  && (!('push' in incoming()) || (incoming().push is map && incoming().push.keys().hasOnly(['enabled','kinds','updatedAt']) && incoming().push.enabled is bool && incoming().push.get('kinds', []) is list && incoming().push.get('kinds', []).size() <= 10))
  && (!('welcomedAt' in incoming()) || str(incoming().welcomedAt, 40)); }

function selfEdit(){ return changed().hasOnly([
  'displayName','phone','acceptedTermsAt','fields','updatedAt',
  'photo','photoSource','googlePhoto','town','birthDate','push','welcomedAt'
]) && ... (as today); }
```

`role`, `status`, `email`, `customerNumber`, `notes`, `log`, `vendorId`, `helper`, `addedBy` stay out of `selfEdit`. A blocked person keeps
`selfEdit` (they can still fix their name); if that is not wanted, add `resource.data.status == 'active'` to the self branch.
`vendorId`, `helper`, `addedBy` are in the shape only because vendor docs already carry them (the vendors area owns how they are written) (otherwise any self-edit of a helper fails `profileShape`).

### Rules test cases (`tests/rules.mjs`)

Allowed:
1. Yoav (staff) updates his own `photo` (a 100k-char JPEG data URL), `photoSource: 'custom'`, `updatedAt`.
2. Yoav sets `photoSource: 'none'`; sets `photoSource: 'google'` with `googlePhoto` (https URL).
3. Yoav updates `town`, `birthDate: '1975-03-14'`, `fields.receiptPreference: 'email'`, `displayName`, `phone`.
4. Yoav sets `push: {enabled: true, kinds: ['task','trip'], updatedAt}`; then `push: {enabled: false, kinds: [], updatedAt}`.
5. A new person with an invite creates their profile with the invited role, then sets `welcomedAt`.
6. A vendor helper (doc has `vendorId, helper: true, addedBy`) edits their own `phone`.

Denied:
7. Yoav changes his own `role` to `manager` (alone, or together with a photo change in the same write).
8. Yoav changes his own `status`, `email`, `customerNumber`, `notes` or `log`.
9. Yoav writes `photo` on Noa's doc (`users/demo-u-noa`), or `town` on anyone else's doc.
10. Noa (manager) writes Yoav's `photo`, `town`, `birthDate` or `push` (`managerEdit` does not include them).
11. `photo` longer than 120000 chars; `photo` that is not a `data:image/...;base64,` string.
12. `photoSource: 'facebook'`; `birthDate: '14.03.1975'`; `town` longer than 60; `push.kinds` with 11 entries; `push` with an extra key.
13. A signed-out user writes any of the above.

## Indexes

- `calendar`: `date ==, kind ==, ownerUid ==` (presence line on L6/C12). Add to `firestore.indexes.json` if the farm area does not already define it.
- `activity`: `by.uid ==` ordered by `at desc` (C8; `useActivityBy` already uses it).
- `tickets`: `paymentStatus in` alone needs no composite index.

## Demo

Seed slice `src/app/demo/seed/profile.ts` (same in every scenario): Yoav `createdAt` 12.10.2026 and `photoSource: 'custom'`
(L6 "מאוקטובר 2026"), Beni `photoSource: 'google'`, Yossi blocked on 18.11 09:15 (X2), and two tasks with "כהן" for C2
(a managers-only call on Beni today, a charger returned by Noa on 12.11). C9 in demo writes the "new" persona's user doc
directly with the invited role (the demo branch of `createProfile` always makes a guest). C8 in demo shows the three
designed rows while the "אין קליטה" state is on; "לנסות עכשיו" turns that state off.
