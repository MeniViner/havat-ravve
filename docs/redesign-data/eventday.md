# Event day + live: data model (E1-E9, Y1-Y5)

Code: `src/app/v2/data/eventday.ts`. All I/O goes through `db.ts` (`useList`, `useDoc`, `write.*`, `transact`), so demo and Firestore behave the same way.

## Collections

### `tickets/{id}`: existing, still compatible
Old fields are unchanged (`status`, `paymentStatus`, `scans[]`, `entries`, `secret`, ...). New optional fields:

| field | type | default for old docs | written by |
|---|---|---|---|
| `payLater` | bool | false | gate crew (E4 "להכניס, ישלמו אחר כך"), manager (Y3 reopen) |
| `payLaterAt`, `payLaterBy` | iso, Actor | absent | same |
| `paidAt` | server time | absent | gate crew (E4 "שולם, להכניס" sets `paymentStatus: paid_onsite`) |
| `cancelledAt`, `cancelledBy`, `cancelNote` | iso, Actor, text | absent: the screens fall back to `updatedAt` and the `activity` row | events area (cancel order) |
| `walkIn`, `createdBy` | bool, Actor | absent | gate crew (E6 "אורח בלי כרטיס") |

- Unpaid means `pending` and not `payLater`.
- A `claimed` ticket (the guest marked it paid) counts as settled at the gate, because payments are trust-based. Y4 still shows it as an amount until a manager approves it in bulk.

### `events/{id}/scans/{sid}`: new (GateScan, plus `phone`, `count`, `keptBy`, `keptAt`)

- **Id:** `${ticketId}-${entryNumber}` for entries, so the same entry from two gates writes the same document. Rejections use a random id.
- **Fields:** `result` is one of `ok`, `paidAtGate`, `payLater` or `rejected`. Also `reason`, `meta`, `amount`, `method` (always `''`: E4 has no payment-method choice), `by`, `at`, `reopenedBy/At` and `keptBy/At`.
- **Read by:** Y1 (latest scan, unresolved rejections), Y2 (latest 300, plus a rejected query), Y3 (one scan) and E2 (latest scan).

### `events/{id}/counters/live`: new (LiveCounters, plus `per10m`, `eventId`)

- **Fields:** `entered`, `scans`, `paidAtGate`, `payLater`, `payLaterAmount`, `rejected`, `perHalfHour{"HH:00"|"HH:30"}` and `per10m{"HH:M0"}`.
- **Written by:** every gate write, inside the same `transact`.
  - Totals use `inc`.
  - The two time maps are rewritten from the copy read in that transaction.
  - The gate creates the document with `write.merge({eventId})` on load, so an offline scan always has a copy to add to.
- **Read by:** Y1, Y2 and Y5. This is one small document, so watching it live is cheap.

### `events/{id}/counters/cash`: new
- **Fields:** `{gate?: {amount, by, at, byActor}, stall?: {...}}`.
- **Written by:** a manager, from Y5 ("ספירה" / "תיקון").

### `events/{id}/staffing/{station}`: read only here
- The ids I use are `gate`, `stall` and `parking`.
- The events area (V4) writes it. Y1 looks up stations by id or by station name (`שער`, `דוכן`).

### `events/{id}`: new field `closed: EventClose | null`, plus `reopenedAt`, `reopenedBy`
- **Default for old docs:** absent, which means open.
- **Written by:** a manager. Y5 sets `closed: {at, by, reopenUntil}` (noon on the next Israeli day); the cash counts stay in `counters/cash` because the event doc is public. "פתיחה מחדש" sets `closed: null`.

### `tabs/{id}`: existing, unchanged
- E8 adds items with `addTabItems` (push and inc, no read first, so it works offline).
- A walk-in tab has `guestUid: ''` and `ticketId: ''`.

## Writes and conflicts

- **`admit`** (E3, E4, E6) is one transaction. It reads the ticket and the scan document `${ticketId}-${n}`. It refuses with ConflictError, which shows X1, when:
  - the ticket's `entries` differ from what the screen saw, or
  - the scan document already exists, or
  - the ticket is no longer valid.

  Otherwise it updates the owing tickets, pushes the entry, writes the scan and bumps the counters.
- **Offline:** `transact` runs on the cached copy and is queued as a batch.
  - When two offline gates let in the same entry, they write the same scan id. The rules must make scan documents create-only, so the second batch is refused when it syncs and the shell shows the late X1.
  - Totals stay right because they use `inc`. A time-map bucket may lose one concurrent increment, but that only affects the chart.
- **`logRejected`** (E5, and E4 "לא להכניס"): scan document plus counters `scans` and `rejected` each go up by 1.
- **`reopenAndAdmit`** (Y3) is one transaction:
  - The order becomes valid and pending with `payLater`.
  - The scanned ticket enters.
  - The old scan gets `reopenedBy/At`.
  - A new payLater scan is written.
  - Counters change by `rejected −1` and `payLater +n`.

  It is refused if the scan was already handled.
- **`keepRejected`** (Y3): `keptBy/At`. The scan then leaves "דורש אותך".

## Rules needed (requests, `firestore.rules`)

1. Crew means managers plus people in `events/{id}/staffing/*.people[].uid`.
2. Crew may update tickets of an event that is not closed, limited to these fields: `scans` (append only), `entries` (+1), `paymentStatus` (`pending`→`paid_onsite`), `paidAt`, `payLater*` and `updatedAt`.
3. Crew may create walk-in tickets (`walkIn == true`, `createdBy.uid == auth.uid`, `entries == 1`).
4. `events/{id}/scans/{sid}`:
   - crew may create, but never overwrite (create-only);
   - managers may update only `reopenedBy/At` and `keptBy/At`;
   - nobody may delete.
5. `events/{id}/counters/live`: crew may create and update the counter fields; `inc` must be non-negative except `rejected` from managers. `counters/cash`: managers only.
6. Refuse ticket, scan and tab writes from crew when `get(events/{id}).data.closed != null`.
7. Events: managers may write `closed`, `reopenedAt` and `reopenedBy`.

## Indexes
- `scans`: `result ASC, at DESC` (Y2 "נדחו", Y1 unresolved rejections).
- Existing ones: `tickets` by `eventId`, `tabs` by `eventId`, `activity` by `kind, refId, at DESC`.

## Rules test cases
- A volunteer not on staffing cannot write a scan. A staffed volunteer can.
- A second create of `scans/{ticket}-1` is refused (two gates).
- A volunteer cannot set `paymentStatus: paid` (only `paid_onsite`) and cannot change `price` or `status`.
- After `closed` is set, a volunteer's scan and tab writes are refused; a manager's reopen is allowed.
- A volunteer cannot write `counters/cash` or `closed`.
- A manager can reopen a rejected scan once; a second reopen is refused.

## Demo seed
- `src/app/demo/seed/eventday.ts`:
  - tickets (640 valid, 212 inside at 17:20 and 487 at 21:04);
  - festival tabs (18 tabs, 1,240 ₪);
  - product order;
  - staffing;
  - Yossi's cancellation by Noa on 17.11.
- `src/app/demo/seed/live.ts`: counters, the scan log (the design rows plus 203 filler entries) and the cash counts for afterEvent.
