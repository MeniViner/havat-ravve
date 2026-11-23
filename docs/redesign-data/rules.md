# Rules for the v2 redesign

`firestore.rules`, `firestore.indexes.json` and the tests in `tests/rules-app.mjs`, built from the ten area docs in this
folder and from the writes in `src/app/v2/data/*.ts`, `src/app/store.ts` and `src/app/data.ts`. The rules allow what the
app writes and nothing more. Every new field is optional, so documents written before the redesign keep working, and so do
the guest app, `/admin`, the public site and the Worker (`api/`, which uses a service account and is not bound by rules).

Run: `PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH npm run test:rules` (emulator, project `demo-havat-ravve`).
Four blocks: CMS (`tests/rules.mjs`), team app, guest side, then the v2 suite (481 cases) and the vendor cases ported
from `tests/v2-vendor.mjs` (72), 553 in all. The suite counts every case and fails at the end if one failed.

## Roles

| role | who | reads |
|---|---|---|
| owner | `meniviner@gmail.com` (bootstrap) or `role: owner` | everything a manager reads, plus owner-only writes |
| manager | `role: manager`, active | the whole team app |
| staff | `role: staff`, active | the team app except managers-only tasks, projects, cash, files, receipts |
| vendor | `role: vendor`, `vendorId`, `helper` | own stall, events invited to, own notifications, broadcasts addressed to them |
| guest | signed in, no team role | the guest app (own tickets, tabs, visits, donations) |
| blocked | `status: blocked` | nothing of the team; may still edit their own profile (decision 2) |

"Active" means `status == 'active'`. A blocked owner/manager/staff is no longer staff for any rule.

## Per collection

| collection | read | write |
|---|---|---|
| `users/{uid}` | self; staff read the team list | self creates (role from bootstrap, invite or vendor claim); self edits name, phone, fields, photo, photoSource, googlePhoto, town, birthDate, push, welcomedAt, never role/status/vendorId/helper; managers set role guest/staff/blocked status and notes (owner: any role); `vendor` only through a claim; a stall's owner sets a helper of their own stall back to `guest` (D7) |
| `users/{uid}/notifications` | self | staff create kind task/urgent/trip/event/vendor (managers also broadcast/system) with `by` = self and an in-app link; a vendor creates kind `vendor` to a team member only; self marks `readAt`, deletes; a manager may overwrite a broadcast notification (resend) |
| `tasks` | staff (managers-only to managers) | as before, plus: a non-creator staff may take a free open task, release or hand on their own, add a photo or `shoppingId`; a task on someone else cannot be taken (late offline take refused) |
| `task_templates` | staff | managers; `assignee` (actor or null), `placeId`, `skip` (days whose instance a manager deleted, 30 max) |
| `places` | staff | staff create and edit (name, lat, lng, accuracy, photo); managers delete |
| `shopping` | staff | as before, plus `taskId`, `notAvailable`, `notAvailableAt`, `tripId`, `foundWhere` |
| `shopping_trips` | staff | staff start their own trip; only the shopper updates (closedAt, bought, missing); managers delete |
| `calendar` | staff | managers write team items (audience, participants, reminder `''`/`'60'`, remindAt, reminderSentAt); staff write their own presence only (from, to, note, no manager fields, name = profile name) |
| `projects`, `projects/*/steps` | managers | managers; a step is done once, stamped by the one who ticks it; the thread only grows by one entry by self (300 max); managers delete open steps, the owner any step; projects deleted by the owner |
| `events/{id}` | published to all; staff; an invited vendor gets (not lists) the event | managers; `closed` holds at/by/reopenUntil only, never cash |
| `events/*/staffing` | staff | managers (station, people, needed) |
| `events/*/scans` | staff | staff create with id `<ticket>-<n>` once, by self, on an open event (managers also on a closed one); managers mark a rejected scan reopened or kept, once; never deleted |
| `events/*/counters/live` | staff, invited vendor | staff create/update on an open event; counts never go down (a manager's reopen lowers `rejected`) |
| `events/*/counters/cash` | managers | managers (gate, stall) |
| `events/*/files` | managers | managers; https or `data:` image/pdf up to 700000 chars, `mime`, `size` |
| `events/*/products` | staff | managers; `unit` |
| `events/*/vendors/{vid}` | staff, the stall's people | managers; the owner answers and gives feedback; owner or helper checks in once as self, stamps guidelines read |
| `events/*/vendor_info` | staff, invited vendor | managers |
| `events/*/vendor_requests` | staff, the stall's people (own only) | the stall's people create on a confirmed stall; staff take; staff or the stall close once |
| `tickets` | staff, owner | guest create and claim/cancel as before; staff: scan (valid tickets only), paid at the gate, pay later, walk-in tickets (one entry, by self, event price) on an open event; managers: anything but `paymentConfirmation` rules; `reminderSentAt` by managers |
| `tabs` | staff, guest | staff open and add items on an open event; managers settle any time; the guest claims (`claimedAt`); `reminderSentAt` by managers |
| `vendors/{id}` | staff, the stall's people | managers; the owner edits what the farm shows and the people list |
| `vendors/{id}/private/main` | managers | managers (team notes) |
| `vendor_invites/{code}` | any Google account by code; list: managers, the stall owner | managers; the owner creates and revokes helper links; claimed once, in the same batch as the vendor profile |
| `broadcasts/{bid}` | managers; recipients (get and `array-contains` list) | managers create (recipients ≤500, count matches), set `resentAt`; owner deletes |
| `broadcasts/*/reads/{uid}` | managers list; self | a recipient writes their own receipt; once read it stays read |
| `push_jobs` | nobody | staff queue a push to others (not broadcast/system unless manager); a vendor queues kind `vendor`; the Worker sends and stamps `sentAt` |
| `settings/push` | everyone | nobody (Worker only) |
| everything else | unchanged | unchanged |

## Decisions taken in the rules

1. Conflicts. Take, assign and gate scans refuse a late offline write: a task on someone else cannot be taken by staff, a
   project step is done once, a scan id is created once, counters never go down. A manager editing a task cannot be told
   apart from a manager taking it, so manager takes are last-write-wins.
2. Event-day crew = every active staff member. `staffing.people` is a list of maps, which rules cannot search. To limit
   scanning to the staffed crew, staffing docs need a `uids` array (eventday request).
3. After `closed`, crew writes stop (scans, ticket scans, tab items, new tabs, counters). Managers still settle debts and
   reopen. "Reopen until noon" (`reopenUntil`) is shown by the app, not enforced.
4. Cash counts live in `counters/cash` (managers only). The public event document never holds them.
5. Calendar `audience: managers` is display only: every staff member can read every calendar item.
6. Staff may save and rename any place (L3 "אני עומד כאן"); only managers delete.
7. A vendor may notify (and push to) team members only, kind `vendor`.
8. An invited vendor reads the event even after declining, until removed from it.
9. Profile extras (`town`, `birthDate`, `photo`, the push device list) sit on `users/{uid}`, which the whole team reads.

## Changed behaviour in old tests

- `tests/rules-app.mjs` places: a volunteer now saves a place (L3); the old test asserted the opposite. Deleting stays with
  managers and is tested.
- Crew scan now also requires the ticket to be `valid` (a cancelled ticket can no longer be scanned in). No old test covered it.

## Indexes added

activity (by.uid, kind, action, at desc); tasks (eventId, done, managersOnly, createdAt), (eventId, done, createdAt),
(assignee.uid, done, managersOnly, createdAt desc), (assignee.uid, done, createdAt desc); calendar (reminderSentAt,
remindAt), (date, kind, ownerUid); scans (result, at desc); broadcasts (recipients contains, createdAt desc);
vendor_requests (vendorId, createdAt desc), (closedAt, createdAt desc) for manage.ts:49. Field overrides keep data URLs
(`files.url`, `users.photo`, `places.photo`) out of the indexes.
