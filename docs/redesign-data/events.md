# Events (management) data: M3-M7, N9-N12, V3-V5

Code: `src/app/v2/data/events.ts` (listeners and writes, all through `db.ts`), `src/app/v2/screens/events/logic.ts` (pure helpers, tested by `tests/v2-events.mjs`). Demo rows: `src/app/demo/seed/events.ts`.

Every existing field keeps its name and meaning: the guest site and the guest app read `events`, `tickets` and `tabs` as they are. All new fields are optional, and every screen reads an old document without them.

## New collection: `events/{id}/staffing/{station}` (V4)

| field | type | notes |
|---|---|---|
| (doc id) | `gate`, `stall`, `parking`, or any other id | the usual three show even when never saved (`stationsOf`) |
| station | string, max 60 | shown name ("שער", "דוכן החווה", "חניה") |
| people | list (max 30) of `{ uid, name, hours }` | `hours` is `"HH:MM-HH:MM"` or `"HH:MM–HH:MM"` or `""` |
| needed | int 1-30 | the station is short ("חסר") while `people.length < needed` |

Written by V4 only, with `transact` (read, change, write), so two managers assigning at once do not overwrite each other. Assigning someone already in the station throws `ConflictError` (X1 toast). Every change writes `logActivity(actor, 'event', eventId, 'edited', ...)` with `subjectUid`. Assigning also sends `notify([uid], { kind: 'event', title: "<event>: <station>", sub: "<day dd.mm> · <hours>", link: '/farm/events/<id>' })`.

Read by: V4 and M4 (managers), F6 (staff: the festival crew, farm area), B1 audience "צוות האירוע" (broadcast area).

Rules requested:

```
match /staffing/{sid} {            // inside match /events/{id}
  allow read: if isStaff();
  allow write: if isManager() && (request.method == 'delete' || (
    incoming().keys().hasOnly(['station','people','needed'])
    && str(incoming().station, 60) && incoming().station.size() >= 1
    && incoming().people is list && incoming().people.size() <= 30
    && incoming().needed is int && incoming().needed >= 1 && incoming().needed <= 30));
}
```

## Existing collections, extended

| collection | new field | type | written by | old documents |
|---|---|---|---|---|
| `tickets/{id}` | `reminderSentAt` | ISO string | V5 "שליחה" / "שוב", M5 "תזכורת בוואטסאפ" (manager, stamps every owing ticket of the order) | missing = never reminded |
| `tabs/{id}` | `reminderSentAt` | ISO string | V5, N12 "תזכורת בוואטסאפ" (manager) | missing = never reminded |
| `tabs/{id}` | `claimedAt` | ISO string | the guest app when the guest marks the tab as paid (request to the guest area; not written here) | missing: N12 "סימן שהעביר" falls back to `updatedAt` |
| `events/{id}/products/{pid}` | `unit` | string, max 20 ("כוס") | N10 | missing = no unit |
| `events/{id}/files/{fid}` | `mime`, `size` | string max 60, int | V3 | missing: the kind comes from `kind` and the url |
| `events/{id}/files/{fid}` | `url` may be a `data:` URL | `data:image/...` or `data:application/pdf`, at most 700,000 chars | V3 "צילום מסמך" / "קובץ מהטלפון" (no Storage on Spark: images compressed in the browser, a PDF kept only when small) | https links keep working |

Rules requested (exact shape changes):

- `ticketShape()`: add `'reminderSentAt'` to `hasOnly`, with `(!('reminderSentAt' in incoming()) || isoTime(incoming().reminderSentAt))`. The manager branch of `update` already allows the change.
- `tabShape()`: add `'reminderSentAt'` and `'claimedAt'` the same way. Guest branch: allow `changed().hasOnly(['status','claimedAt','updatedAt'])` for open → claimed.
- products `write`: add `'unit'` to `hasOnly`, with `(!('unit' in incoming()) || str(incoming().unit, 20))`.
- files `write`: add `'mime'` and `'size'` to `hasOnly`, and let `url` be `str(incoming().url, 700000) && (incoming().url.matches('https://.*') || incoming().url.matches('data:(image/(jpeg|webp|png)|application/pdf);base64,.*'))`. A document stays under the 1 MiB limit.
- `events/{id}/counters/live`: M6 reads it (staff). It may carry optional `tickets`, `stallTabs` and `stallSold` (written by the gate and stall, event-day area). When they are missing, M6 counts from the tickets and tabs it already listens to.

## Reads (listeners)

| path | query | screen |
|---|---|---|
| `events` | all (manager) | M3, N9 copy sheet |
| `tickets` / `tabs` | `eventId in [up to 30 ids]` | M3 card meta and debts |
| `tickets` / `tabs` | `eventId ==` (data.ts `useEventTickets` / `useEventTabs`) | M4-M7, N12, V5 |
| `tasks` | `eventId ==` | M4 "משימות הכנה" |
| `events/{id}/staffing`, `/files`, `/products`, `/vendors` | all | V4, V3, N9, M4 |
| `events/{id}/counters/live` | doc | M6 |
| `events/{id}/scans` | `orderBy at desc, limit 6` | M6 "סריקות אחרונות" |
| `calendar` | `date ==`, filtered to `kind == 'presence'` | V4 "פנויים באותו יום" |

No new composite index: every query is a single-field filter, or one `orderBy` without a filter.

## Writes reused from `data.ts` (unchanged)

`saveEvent` / `deleteEvent` (N11, with `upsertCalendarRef` / `deleteCalendarRef` for the calendar), `setOrderPayment` and `restoreOrder` (M5 approve, paid on site, cancel, undo), `markPaymentConfirmation`, `setTabStatus` (N12 approve, waive, reopen), `handleNotificationsFor`, `copyProducts`. The activity log follows them.

M5 "הוספת נרשם" creates tickets owned by the manager who adds them (`ownerUid == uid()` is what the create rule allows), with the guest's name and phone in `ownerName` / `ownerPhone`. The event must be published and open, as for a guest.

## Debts (V5, M7, M3)

Not stored. `debtsOf(eventId, tickets, tabs)` derives them after the event: orders that came in (some ticket with `entries > 0`) and still owe (`pending` or `claimed`), and tabs left `open` or `claimed` with `total > 0`. Bulk approval in M7 (trust-based) calls `setOrderPayment` / `setTabStatus` per debt. Sort: not reminded yet by amount, then reminded by `reminderSentAt`.

The reminder text is `settings/app.templates.debtReminder` with `[שם]` (first name), `[אירוע]`, `[סכום]`, `[ביט]`, `[תאריך]`. Editing it is in the settings area (`/manage/settings/messages`).

## Rules test cases

1. Staff (volunteer) reads `events/e/staffing/gate`: allowed. Guest reads it: refused.
2. Manager writes staffing `{ station: 'שער', people: [], needed: 1 }`: allowed. With an extra key: refused. Volunteer writes: refused.
3. Manager updates a ticket with only `reminderSentAt` (ISO): allowed. Owner (guest) sets `reminderSentAt`: refused.
4. Manager sets `reminderSentAt` on a tab: allowed. Staff (volunteer) sets it: refused.
5. Guest moves their own tab open → claimed with `claimedAt`: allowed. With `claimedAt` on a paid tab: refused.
6. Manager writes a product with `unit: 'כוס'`: allowed. `unit` of 21 chars: refused.
7. Manager writes a file with `url: 'data:image/webp;base64,...'` (under 700,000 chars) and `mime`, `size`: allowed. `data:text/html,...`: refused. A volunteer reads files: refused.
8. Manager creates a ticket for a walk-in guest with `ownerUid` = the manager and the event's price: allowed. With `ownerUid` = the guest's uid: refused (unchanged).
