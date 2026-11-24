# Shopping (v2) data model

Code: `src/app/v2/data/shopping.ts` (all reads and writes, through `src/app/db.ts`). Tests: `tests/v2-shopping.mjs`.
Screens: S1-S4, S6-S8 in `src/app/v2/screens/shopping/`. S5 (add / edit) is the tasks area's AddScreen.

## Collection `shopping` (existing, extended)

One document per item, in four lists. Every new field is optional; an old document (none of them) loads and shows as before.

| field | type | old? | meaning / default for old docs |
|---|---|---|---|
| title | string ≤ 200, ≥ 1 | yes | |
| qty | string ≤ 40 | yes | free text, "6 קרטונים". S4 stepper changes the leading number (none = 1) |
| note | string ≤ 1000 | yes | short notes (≤ 20 chars) also ride on the S1 row |
| link | string ≤ 2000, `https://` or '' | yes | |
| photo | data URL ≤ 400 kB (webp/jpeg) | yes | compressed in the browser (`compressPhoto`) |
| category | 'super' \| 'building' \| 'online' \| 'giveaway' | yes | tab keys: super, building, online, wish (= giveaway, shown as מחפשים) |
| urgent | bool | yes | |
| createdBy, createdAt | Actor, ISO | yes | |
| bought, boughtBy, boughtAt | bool, Actor\|null, ISO\|null | yes | for giveaway "bought" = found |
| expireAt | ISO\|null | yes | still written (+24 h) for the old app. **TTL on it must stay off**, or S8 history and the S1 chips lose their data |
| updatedAt | ISO | yes | |
| taskId | string ≤ 80 | **new** | the task this item serves (C3, "מפות שולחן"). Default: none |
| notAvailable | bool | **new** | "אין" pressed on a trip; the item stays open. Default false |
| notAvailableAt | ISO\|null | **new** | default null |
| tripId | string ≤ 80 | **new** | the trip that bought it, or marked it "אין". Default: none (bought outside a trip) |
| foundWhere | string ≤ 200 | **new** | S2 found line ("אצל השכנים"). Default: none. No input for it yet (S5 owner may add one) |

Reads (`useShopping`): open items `bought == false orderBy createdAt desc` (index exists) and history `boughtAt >= today-90d orderBy boughtAt desc limit 400` (single-field, automatic).
Writes: add (S1 chips, S8 "שוב", S5), bought / back to the list (S1, S4, S6), "אין" (S6), qty (S4 stepper), photo (S4), delete (S4, deferred 6 s like the old screen so undo never re-creates someone else's item).
Outside a trip the written shape is exactly the old one (no new keys), so the old app and the current rules accept it.

## Collection `shopping_trips` (new)

One document per trip ("אני בסופר, מתחילים" to "סיימתי לקנות").

| field | type | meaning |
|---|---|---|
| by | Actor | the shopper |
| list | category | which list (the button exists on סופר only for now) |
| startedAt | ISO | |
| closedAt | ISO\|null | null while open. Starting again resumes the newest unclosed trip for the same shopper, using that trip’s list. It leaves other trips untouched and sends no new notification |
| bought | string[] ≤ 200 | item ids bought on the trip, filled on close |
| missing | string[] ≤ 200 | item ids marked "אין", filled on close |

Reads: `orderBy startedAt desc limit 20` (single-field), one by id (S7 `?id=`).
Writes: start (batch: close my stale open trips + create), close, reopen (S7 "טעות? לחזור לקנייה": `closedAt: null`). Only the shopper writes their trip.

## Activity (`activity`, kind 'shopping')

Existing actions: added, edited, bought, found, unbought, deleted. New: `unavailable` ("אין"), `photo`. The activity rule allows any action string ≤ 40, so no rules change; `ACTION_LABELS` in shared code could add Hebrew labels for the two new ones.

## Notifications (`notify()` from `v2/data/notify.ts`)

- trip start: kind 'trip', "יואב יוצא לסופר עכשיו", push on, action {label 'הוספה', kind 'addToTrip'}, link `/shopping?list=super`.
- trip close: kind 'trip', "הקנייה בסופר נסגרה", sub "5 נקנו · קפה שחור לא היה", push off, link `/shopping/trip/done?id=`.
- urgent add (`addShopItem` with urgent): kind 'urgent', "דחוף לכולם".
Recipients include all active staff, managers and owners, including the shopper when on the team.

## Rules needed (`firestore.rules`)

1. `shopping` itemShape: add the new keys to `hasOnly` and type them:
   `'taskId','notAvailable','notAvailableAt','tripId','foundWhere'` with
   `str(incoming().get('taskId',''), 80) && incoming().get('notAvailable', false) is bool && (incoming().get('notAvailableAt', null) == null || str(incoming().notAvailableAt, 40)) && str(incoming().get('tripId',''), 80) && str(incoming().get('foundWhere',''), 200)`.
   Until this lands, a trip write (tripId / notAvailable) is refused in production; outside a trip everything works.
2. New block:
```
match /shopping_trips/{id} {
  function tripShape(){return incoming().keys().hasOnly(['by','list','startedAt','closedAt','bought','missing'])
    && incoming().list in ['super','building','online','giveaway'] && str(incoming().startedAt, 40)
    && (incoming().closedAt == null || str(incoming().closedAt, 40))
    && incoming().bought is list && incoming().bought.size() <= 200 && incoming().missing is list && incoming().missing.size() <= 200;}
  allow read: if isStaff();
  allow create: if isStaff() && tripShape() && actorOk(incoming().by) && incoming().closedAt == null;
  allow update: if isStaff() && tripShape() && resource.data.by.uid == uid() && incoming().by == resource.data.by
    && incoming().startedAt == resource.data.startedAt && incoming().list == resource.data.list;
  allow delete: if false;
}
```

## Indexes

No new composite index. Existing `shopping (bought asc, createdAt desc)` serves the open list; `boughtAt` and `shopping_trips.startedAt` are single-field.

## Rules test cases (for `tests/rules-app.mjs`)

shopping
- staff creates an old-shape item: allowed. Same with `taskId: 't1'`: allowed. With `taskId` of 81 chars: refused.
- staff marks bought with `tripId` (bought true, boughtBy self): allowed; with `boughtBy` another person: refused (as today).
- staff sets `notAvailable: true, notAvailableAt: iso, tripId`: allowed; `notAvailable: 'yes'`: refused.
- update with `foundWhere` of 201 chars: refused; unknown key `price`: refused.
- an old document without any new field: still readable and updatable by staff.
- guest / vendor / anonymous: read and write refused.

shopping_trips
- staff creates `{by: self, list: 'super', startedAt, closedAt: null, bought: [], missing: []}`: allowed.
- create with `by` another person, or with `closedAt` set: refused.
- the shopper closes (closedAt, bought, missing): allowed; reopens (closedAt null): allowed.
- another staff member updates the trip: refused. Change of `startedAt` or `list`: refused.
- `bought` with 201 ids: refused. Delete by anyone: refused.
- guest, vendor, helper, anonymous: read refused.
