# Manage area: data model

Screens: M1 root, M2 inbox, M8 people, M9 person, M10 reports, N1/N2 visits, N3/N4 donations, N5 settings, N6 payments, N7 messages, G1 amounts, G2 visit types, G3 questions, G4 contact, G5 managers, N13 invite, N14 activity.

Code: `src/app/v2/data/manage.ts` (reads and writes), `src/app/v2/screens/manage/calc.ts` (pure helpers, tested by `tests/v2-manage.mjs`).

Every write goes through the existing helpers in `data.ts` and `store.ts`, which write through `db.ts`. Those helpers also keep the old `logActivity` lines. Writes queue offline. A refused write shows `useToast().refused()`.

No new collection. No new index. No new field on any document the guest app writes.

## Collections read and written

| Collection | Read by | Written by manage | Fields written |
|---|---|---|---|
| `notifications` | M1, M2 (open and handled) | approve / not arrived / handled / back to the queue | `handled`, `handledBy`, `handledAt` |
| `events/{id}/vendor_requests` | M1, M2 (today's event, `closedAt == null`) | (read only; D6 owns them) | — |
| `donations` | M1, M3, N3, N4, M9 | approve, not arrived, receipt, WhatsApp confirmation | `paymentStatus` (`paid` / `pending`), `paidAt`, `receiptSent`, `paymentConfirmation`, `updatedAt` |
| `tabs` | M2, M9, M10 (open debts) | approve, not arrived | `status` (`paid` / `open`), `paidAt`, `updatedAt` |
| `tickets` | M2 (claimed order), M9, M10 | approve or not arrived for the whole order | `paymentStatus`, `paidAt`, `updatedAt` (via `setOrderPayment`) |
| `visits` + `calendar/visit_{id}` | M1, M2, N1, N2 | approve / reject / cancel / note (`decideVisit`) | `status`, `managerNote`, `handledBy`, `updatedAt`; calendar item `time` ≤ 11 chars |
| `users` | M8, M9, G5 | role change, block (`setUserRole`) | `role`, `status`, `notes`, `updatedAt`, `log` |
| `users/{uid}/notifications` + `push_jobs` | — | `notify()` after a role change (not to guest) | the shared notify() shape, `kind: 'system'`, `link: '/me'`, `push: false` |
| `role_invites/{email}` | N13, G5 | invite, cancel | `email`, `role`, `createdBy`, `createdAt` |
| `activity` | M10 (task totals), N14, G5 (last seen) | through the helpers above | (unchanged) |
| `settings/app` | every settings page, M2/N2/N4 templates | `saveSettingsPart` | see below |

## settings/app

The old keys keep their meaning, so the guest flow and the old screens read them unchanged:

| Key | Page | Notes |
|---|---|---|
| `payment.bit`, `payment.paybox` | N6 (owner) | The live value. `''` means "not offered". |
| `payment.cash`, `payment.note` | N6 (owner) | Unchanged. |
| `payment.bitNumber`, `payment.payboxLink` | N6 (owner), optional | A copy of the typed number or link, kept while the switch is off. Turning the switch back on restores it. Inside `payment`, so the owner-only rule covers it. |
| `donationPresets` | G1 (owner) | `[{amount, label}]`. Empty rows and amounts ≤ 0 are dropped. |
| `donationOptions` | G1, optional | `{custom, memorial, receipt}`. Defaults to all true, which is how the guest form behaves today. **The guest donation form does not read it yet** (see the requests). |
| `visitTypes` | G2 | Trimmed, no duplicates. The order is the order the guest sees. |
| `registrationFields` | G3 | `{id, label, type text/choice/date, options, required}`. A new id comes from `fieldId()` and never reuses a taken id. Reordering saves at once. |
| `templates.*`, `guestIntro` | N7 | The 4 designed cards, plus the kept cards `ticketReminder`, `vendorInvite` and `guestIntro`. `paymentConfirmation` ≤ 2000. |
| `contact.phone`, `contact.whatsapp` | G4 | Checked with `numberOk`, the same regex as the rule. |
| `contactMore` | G4, optional | `{email, address, inquiries}`. These sit outside `contact` because the rule allows only phone and whatsapp there. **The guest app does not read `inquiries` yet.** |

Defaults for old documents: `donationOptionsOf()` and `contactMoreOf()` fill in the missing keys. `paymentForm()` treats a missing `bitNumber` or `payboxLink` as `''`.

## Permissions the screens follow (same as firestore.rules)

- **Roles:** an owner may give any role to anyone except themselves. A manager may give guest or staff, and only to someone who is not a manager or owner. This is stricter than the rule, which also lets a manager demote another manager. It is kept stricter to match the old screen. Vendors have no role picker.
- **Block:** never yourself. An owner may block anyone; a manager may block guests only.
- **Invites:** a manager may pre-assign staff only. Manager and owner invites need an owner (`role_invites` rule).
- **Settings:** `payment` is owner-only. The routes also limit the amounts and managers pages to owners.

## Rules test cases (to add to tests/rules-app.mjs)

1. A manager updates `notifications/x` `{handled, handledBy, handledAt}` → allowed. Adding `title` → denied.
2. A manager sets a donation from `claimed` to `paid` with `paidAt` → allowed. From `claimed` to `pending` → allowed. Writing `method` → denied (not in donationShape).
3. A manager writes `settings/app` with a new `contactMore` and `donationOptions` → allowed. Changing `payment.bitNumber` → denied (owner only). An owner doing the same → allowed.
4. `contact: {phone, whatsapp, email}` → denied. `contact.whatsapp: '123'` → denied.
5. A manager creates `role_invites/a@b.com` with role `staff` → allowed. With role `manager` → denied. An owner with role `manager` → allowed.
6. A manager changes a guest to staff → allowed. A guest to manager → denied. An owner, to owner → allowed.
7. A manager sets a guest's `status: 'blocked'` → allowed (rule). The screen offers it to managers for guests only.
8. A `calendar/visit_x` update with `time: '09:00–14:00'` (11 chars) → allowed. `'09:00 – 14:00'` → denied.

## Demo seed (src/app/demo/seed/manage.ts)

- **Visits:** the approved list as designed (בית ספר אורנים 24.11, קבוצת גמלאים 26.11, משפחת לוי 3.12), with matching calendar items. demo-c-7 becomes Noa's "הכנות לפסטיבל".
- **Donations:** the month is 1,220 and the year 8,400, from four historical paid donations. Michal's donation is at 09:40 and has `method: 'bit'`, a demo-only field shown only when present.
- **Inbox:** the contact text and the tab claimed 6 hours ago.
- **Invite:** farm.ravve@gmail.com is a manager invite, set a week ago.
- **Settings extras:** `contactMore`, `donationOptions`, the PayBox link, WhatsApp 050-000-0002, and the designed `visitApproved` and `donationThanks` texts.
- **Activity:** today's N14 rows, plus generated "done" rows so that M10 shows 28 / 18 / 6 / 1, which is 53 tasks.
