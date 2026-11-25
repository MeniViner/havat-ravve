# Havat Ravve API 3.0: full end-to-end test for Instinct

Meni pastes everything below the line to Instinct. No key in it: Instinct uses the key already in its vault.

Before it runs, the demo data must exist in production (`api/scripts/fixtures.mjs create`). Afterwards, Claude runs
`fixtures.mjs delete` and `fixtures.mjs sweep --delete`, which remove the demo data, and anything a test left behind.
The ids below belong to the fixtures created on 2026-11-22. A new `create` makes new ids, so update the table first.

---

**Havat Ravve API: full end-to-end test (approved by Meni)**

I want to see that you can run the whole farm app through the API: every one of the 182 operations in catalog
3.0.0, and where something can't be done, exactly why. This is a real test on the production app, on demo data.

**My approval for this test.** For this run only, I approve:
- every read operation;
- every write and every destructive operation (delete, cancel, close, remove) on records **you create in this test**
  or on the **INSTINCT TEST demo data** listed below;
- changing a setting and restoring it right away (read, change, read back, restore the original, read back again).

This is the confirmation the catalog asks for on destructive operations, for these records only. Ask me again only
before phase 11, and if something would touch a real record or a real person.

**Hard rules**
1. Don't change or delete anything real: a record you didn't create in this run and that isn't in the demo table.
   If an operation needs a real record, read it only, and mark the write as "skipped: needs a real record".
2. Never change the role or status of a real person, and above all not mine. Your key acts as me, and making me
   anything but an owner cuts off your own access. For every people.* write, use the fake team member
   `instinct-test-staff` only.
3. Events you create stay unpublished and closed for registration: `published: false` and `open: false`, always.
4. Notifications go only to me (you act as me, so I'm skipped) or to `instinct-test-staff`. Assign tasks, steps,
   stations and calendar participants to one of those two only. Never use `urgent: true` before phase 11.
5. The API returns WhatsApp texts (vendor invitations, reminders): don't send them to anyone. Just check that they
   came back.
6. Every title, name, note and text you create starts with `INSTINCT E2E`. For dates, use February 2027 (for
   example 2027-02-10). Use today's date only for presence and where an operation needs today.
7. Keep a ledger of every id you create, and delete each one at the end of its phase.
8. Use a new UUID `Idempotency-Key` for each write. Your usual `User-Agent`. Stay under 240 requests a minute
   (about 2 a second is plenty).
9. On an error, don't retry blindly. Record the code, the `he` message and `meta.requestId`, and move on. After
   OUTCOME_UNKNOWN or a timeout, resend once with the same key.
10. Read each operation's `notes` in the catalog before you call it, and send only the parameters it lists.

**Demo data (already in production, all named INSTINCT TEST)**

| What | id |
|---|---|
| Fake team member (staff, active), as a uid | `instinct-test-staff` |
| Paid draft event (20 ₪ a ticket, 1.2.2027, unpublished) | `AI7hjkF77KQS5CYlnjw4` |
| Guest order A: 2 unpaid tickets | order `wPtVXBINJWBMrzRY2un`, tickets `LNYFcjprHoEphXcrfg`, `Bntz9v7IuXc1HTMSH4` |
| Guest order B: 1 unpaid ticket | order `wlSvWJ73eUZonz4X1ah`, ticket `wgcFi1Z1Shh3Nhs0UE` |
| Stall in the pool, confirmed for the event | `479ye9Pm1p7tC9mBW9DM` |
| Open stall request on the event ("צריך מים") | `fsfeBhpiRJFLj0uIiYRO` |
| Donation of 1 ₪, "claimed" (never charged) | `mlZMsj6Em0byGBKiLf` |
| Visit request (3.2.2027, status new) | `839mbx3Q855ZtLNWfk5` |
| Managers' inbox items: donation, visit | `4Y3tJirb0fgidtI5ZAKN`, `du7kN8xaN1GoAwVVI1gE` |
| A notification in my own bell | `instinct-test-gjH13nIKCOXZFozfptv` |
| Inactive join code | `ITEST35F6` |

**The phases.** Run them in order. Each one lists the operations it must cover. Use the catalog's notes for the
exact flow.

**Phase 0: setup and protocol**
- `GET /v1/catalog`: version 3.0.0, 182 operations. `/v1/health`.
- `farm.overview`, `settings.get`, `system.failures` (record what's there now).
- `people.search` for "INSTINCT": you should get `instinct-test-staff`, not ambiguous.
- Protocol checks, on your first write in phase 1:
  - the same key with the same body returns `replayed: true`;
  - the same key with a different body returns 409;
  - an unknown field returns 400;
  - a stale `ifUpdatedAt` returns 409 STALE_WRITE.

**Phase 1: places, tasks, templates**
- `places.add`, `places.list`, `places.get`, `places.update`.
- `tasks.create` three times:
  - one for me;
  - one for `instinct-test-staff` (they get the notification);
  - one with nobody on it, and with `placeId`.
- `tasks.list` (also with filters: assignee, overdue, doneFrom/doneTo), `tasks.get`.
- `tasks.edit`, `tasks.assign` (to the fake member, then `release: true`), `tasks.take`, `tasks.release`.
- `tasks.setPhoto` with `https://havat-ravve-api.meniviner.workers.dev/v1/files/task/instinct-e2e.jpg`, then `""`.
  Also try once with a link from another site: you should get 400. That is the upload limit; record it.
- `tasks.complete` (with `doneNote`), `tasks.setDoneNote`, `tasks.setDonePhoto` (the same link), `tasks.reopen`
  (the note and the photo stay), `tasks.addShopping` (not urgent).
- `templates.create` with `active: false` and a person, `templates.list`, `templates.get`, `templates.update`,
  `templates.delete`. Check that no task was created from it (`tasks.list`).
- Delete everything: `tasks.delete` for each task, `places.delete`.

**Phase 2: shopping**
- `shopping.add` (not urgent), `shopping.list`, `shopping.edit`, `shopping.setMissing`, `shopping.setBought`,
  `shopping.delete`.
- `shoppingTrips.list`, `shoppingTrips.get` on an existing trip, if there is one. Trips themselves are in phase 11.

**Phase 3: projects**
- `projects.create` with three steps, one of them on `instinct-test-staff`. Then `projects.list` and `projects.get`.
- `projects.update` (title, deadline, then the whole steps list), `projects.addStep`, `projects.updateStep`,
  `projects.splitStep`, `projects.takeStep`, `projects.releaseStep`, `projects.completeStep`,
  `projects.reopenStep`, `projects.postUpdate`.
- Complete every step: `projectDone: true`.
- `projects.delete`.

**Phase 4: calendar and presence**
- `calendar.create`: kind meeting, 2027-02-10, 10:00–11:00, participants = `instinct-test-staff`, reminder on.
- `calendar.list` (with dates), `calendar.get`, `calendar.update` (change the hour), `calendar.delete`.
- `presence.save` for yourself (today, note "INSTINCT E2E") and for `instinct-test-staff` (today and 2027-02-10).
  `calendar.list` should show them.
- Keep the fake member's presence for today until phase 5 is done, then `presence.remove` all of them.

**Phase 5: notifications and broadcasts**
- `notifications.send` to `instinct-test-staff` only.
- `broadcasts.send` with `preview: true` for each of the audiences `farmToday`, `managers` and `all`. Write down who
  each one reaches.
  - Send for real (new key) only to an audience whose preview reaches nobody but me and `instinct-test-staff`
    (usually `farmToday`).
  - If none qualifies, don't send. That moves to phase 11.
- If you sent: `broadcasts.list`, `broadcasts.get`, `broadcastReads.list`, `broadcastReads.get`, `broadcasts.resend`,
  `broadcasts.delete`.
- `me.notifications.list`, `me.notifications.get`, `me.notifications.markRead` on
  `instinct-test-gjH13nIKCOXZFozfptv` only (not my real notifications).
- `notifications.list` and `notifications.get` (the managers' inbox). `notifications.setHandled` on the visit item
  `du7kN8xaN1GoAwVVI1gE` (`handled: true`), then `handled: false`.

**Phase 6: people (only `instinct-test-staff`)**
- `profiles.list`, `profiles.get`.
- `people.setNotes`: read first, then the full text.
- `people.setRole`: staff → manager → staff.
- `people.setStatus`: blocked → active.
- `invites.setRole` with `instinct-e2e@example.invalid` as staff, then the same email as guest (which cancels it).
  Then `roleInvites.list` and `roleInvites.get`.
- `joinCodes.list`, `joinCodes.get` (`ITEST35F6`), `accountDeletions.list`, and `accountDeletions.get` if there is
  one.
- `people.delete` for `instinct-test-staff`: **only at the end of phase 10**, since the earlier phases need it.

**Phase 7: your own event, products, vendors, staffing, files**
- `events.create`: unpublished, closed for registration, 2027-02-15 10:00–14:00, price 30.
- `events.list`, `events.get` (check `startLocal`/`endLocal`), `events.update` (title, hours, an end on a later day).
- Products:
  - `events.saveProduct` three times (with unit);
  - `eventProducts.list`, `eventProducts.get`;
  - `events.reorderProducts`;
  - `events.copyProducts` from your event to the demo event (it has no products yet; phase 8 sells them);
  - `events.deleteProduct`.
- `vendors.create` (with notes), `vendors.list`, `vendors.get` (`privateNotes` is there), `vendors.update`.
- Vendors on your event:
  - `events.inviteVendor` (you get the WhatsApp text back: don't send it), `events.inviteVendors`;
  - `vendorInvites.list`, `vendorInvites.get`, `eventVendorInfo.list`, `eventVendorInfo.get`;
  - `events.confirmVendor`, `events.remindVendor`, `eventVendors.list`, `eventVendors.get`, `events.setVendor`,
    `events.removeVendor`.
- `vendors.addPerson` (a made-up name and phone, don't send the text), `vendors.removePerson`,
  `vendors.removeAccess`, `vendors.delete` (only the stall you created).
- Staffing:
  - `events.assignStation`: you on gate, `instinct-test-staff` on the stall;
  - `eventStaffing.list`, `eventStaffing.get`;
  - `events.updateStationPerson`, `events.removeFromStation`.
- Files: `events.addFileLink` (a made-up Drive link), `eventFiles.list`, `eventFiles.get`, `events.removeFile`.
- Orders: `tickets.addGuestOrder` (2 tickets, not paid), `tickets.list`, `tickets.get`, then
  `tickets.deleteOrder`.
- Keep the event open for phase 10.

**Phase 8: the demo event: payments, gate, tab, cash**
On `AI7hjkF77KQS5CYlnjw4` only:
- `tickets.setOrderPayment` on order A (claimed, then paid), then `payments.markConfirmation` on it.
- `tickets.setPayment` on one ticket, `tickets.stampReminder`.
- Order B: `gate.reject` on its ticket, then `gate.reopenAndAdmit`. Then `tickets.payOnsite`.
- Order A ticket: `gate.admit` (read the notes for an unpaid ticket's `pay`), `gate.admitWalkIn` (one person,
  paid at the gate). A second `gate.reject` on the other ticket of order A, then `gate.keepRejected`.
- `eventScans.list`, `eventScans.get`, `eventCounters.list`, `eventCounters.get` (`live`, and `cash` after saving).
- Tab:
  - `tabs.open` (for the demo guest or a walk-in), `tabs.addItem` (with a product), `tabs.removeItem`,
    `tabs.list`, `tabs.get`;
  - `tabs.setStatus` (claimed, then paid), `tabs.stampReminder`.
  - Open another tab and `tabs.delete` it.
- `emailOutbox.list`, and `emailOutbox.get` with `order_wPtVXBINJWBMrzRY2un`. The guest is fake, so the email is
  skipped: record what you see.
- `events.saveCash`, `events.close`, `events.reopen`.
- Cancellations at the end: `tickets.cancel` on one ticket of order A, `tickets.cancelOrder` on order B.
- Stall request: `eventVendorRequests.list`, `eventVendorRequests.get`, `vendorRequests.close` on
  `fsfeBhpiRJFLj0uIiYRO`, then `vendorRequests.delete`.

**Phase 9: visit, donation, inbox, activity**
- Visit `839mbx3Q855ZtLNWfk5`: `visits.list`, `visits.get`, `visits.setStatus` approved (a calendar item appears),
  then rejected (it goes away), then `visits.delete`.
- Donation `mlZMsj6Em0byGBKiLf`:
  - `donations.list`, `donations.get`;
  - `donations.paymentNotArrived`, `donations.setPayment` paid, `donations.undoApproval`;
  - `donations.setReceiptSent`, `donations.delete`.
- Inbox: `notifications.delete` on `4Y3tJirb0fgidtI5ZAKN` (if it's still there after the donation delete).
- `activity.list` (filter by time since the test started) and `activity.get`: you should see your actions.

**Phase 10: settings and registration questions (read, change, restore)**
- `settings.update` once per section: guestIntro, a message (`msgTicketReminder`), visitTypes, contact
  (`contactInquiries`), payment (`paymentNote` only) and donations (`donationPresets`).
  - Each time: read the original, change it to an `INSTINCT E2E` value, read back, restore exactly, read back.
  - Don't touch the Bit, PayBox or cash fields.
- `settings.saveQuestion` (a new INSTINCT E2E question), `settings.reorderQuestions` (move it, then restore the
  original order), `settings.removeQuestion`.
- Then delete your event from phase 7 (`events.delete`) and `people.delete` for `instinct-test-staff`.

**Phase 11: things the whole team sees: ask me first**
Stop here and send me the list below with who each item reaches (names from `profiles.list`). Run it only after I
answer "כן".
- `shopping.startTrip`: creates in-app notifications and a push job for the team only when a new trip opens. Resuming an unclosed trip uses its existing list.
- `shopping.closeTrip`: an in-app notification to the team.
- `shopping.reopenTrip`, `shopping.deleteTrip`.
- `shopping.add` with `urgent: true`, and `tasks.addShopping` with `urgent: true`: both notify the whole team.
- `broadcasts.send` to `managers` or `all`, if phase 5 couldn't send. Then the rest of the broadcast operations.

**The report I want at the end** (in Hebrew):
1. A table of all 182 operations: name, ✅ worked / ❌ failed (code + `he` + requestId) / ⏭️ skipped (why).
2. What you can't do through the API at all (for example uploading a photo), and what you think is missing to run
   the entire app.
3. Anything that behaved differently from the catalog's notes.
4. The ledger: every id you created, and whether it was deleted. Anything still left, by id.
5. `system.failures` at the end compared with the start.

Claude will then delete the demo data and run a sweep that finds any INSTINCT leftover in the database.
