# Vendor area: data and rules

Screens: D1-D11 (vendor and helper), V1, V2, V6, N8, V7 (managers).
Code: `src/app/v2/data/vendor.ts`. Demo seed: `src/app/demo/seed/vendor.ts`. Tests: `tests/v2-vendor.mjs` (click-through), `tests/rules-app.mjs` (rules).

## Who is a vendor

A vendor is a person whose profile in `users/{uid}` has the role `vendor` and a `vendorId`.

- **Owner (בעל דוכן):** `helper` is false. Answers invitations, edits the stall and adds helpers.
- **Helper (עובד בדוכן):** `helper` is true. Sees the stall's events, checks in and asks for help. Edits nothing else.

The access rule in one sentence: **a vendor or helper reads their own `vendors/{vendorId}`, the events that vendor was invited to, and nothing about other people.** They cannot list vendors, events that are not published, other stalls' records, users, or the team's notes.

## Collections

Every new field is optional. Old documents load without them.

### `users/{uid}`: new fields

The claim writes these four fields (see "Claiming an invite" below).

| Field | Type | Notes |
| --- | --- | --- |
| `vendorId` | string | the stall this person belongs to |
| `helper` | bool | true for a helper, false for the owner |
| `addedBy` | string (uid) | who created the invite: a manager, or the owner for a helper |
| `inviteCode` | string | the code that was claimed; the rules use it to check the claim |

The role `vendor` is new. `activeRole()` returns it, while `isStaff()` and `isManager()` stay false for it.

### `vendors/{vid}` (the pool, V1 and V2; the vendor's own stall, D7)

| Field | Type | Written by |
| --- | --- | --- |
| `name`, `phone` | string | manager (V1/V2), owner (D7 edit) |
| `product`, `sells` | string | manager, owner (D2/D7). `product` mirrors `sells` for the old screens |
| `contact` | string | manager. The contact person's name |
| `needs` | `('table'\|'power'\|'shade'\|'water'\|'chairs')[]` | manager, owner |
| `note` | string | owner (D2/D7). The vendor's note to the farm, which V2 quotes |
| `photo` | data URL (webp/jpeg, up to 200KB) | owner (D7) |
| `external` | bool | manager. False for the farm's own stall, which gets no access link |
| `fem` | bool | manager. Gendered wording |
| `events` | string[] | manager (V2/N8 invite appends the event) |
| `people` | `{uid?, name, phone?, role, entered, addedAt?, addedBy?, code?, fem?, lastSeenAt?}[]` | manager (V6), owner (D8 adds, D7 removes helpers) |
| `inviteNext` | bool | owner (D9/D10) |
| `notes` | string, legacy | **always `''` from now on.** The team's notes moved to `private/main` |
| `createdAt`, `updatedAt` | ISO | |

`people` displays the links. In D7 and `vendors.removePerson`, deleting one link updates the stall, closes the invite and records the action in one server transaction. If an account still uses that invite, the same transaction returns it to `guest`. Removing an old link leaves a newer one in place. A row without a verifiable invite code requires manual review. Access removal never looks up an account by name. V6 removes access for the whole stall.

### `vendors/{vid}/private/main` (new, managers only)

`{ notes, updatedAt }`: the team's notes from V2 ("הערות לצוות"). They live apart from the vendor document because the vendor can read that document.

**Migration before the rules go live:** move each existing `vendors/{id}.notes` into `vendors/{id}/private/main` and blank the field. Today only staff can read `vendors`, so nothing leaks until vendors get access.

### `events/{eid}/vendors/{vid}` (a vendor's record for one event)

| Field | Type | Written by |
| --- | --- | --- |
| `vendorId`, `name`, `confirmed`, `notes` | as today | manager |
| `status` | `'invited'\|'confirmed'\|'declined'` | manager creates `invited`; owner answers (D1/D2) |
| `invitedAt`, `invitedBy` (Actor) | | manager |
| `answeredAt` | ISO or null | owner |
| `sells`, `needs`, `people` (int 1-10), `withVehicle` (bool), `vehicle`, `note` | | owner (D2) |
| `spot` (int or null), `spotNote` | | manager (N8/N9) |
| `arrivedAt` (ISO or null), `arrivedBy` (uid) | | owner or helper (D5 "הגעתי לחווה"), once |
| `guidelinesReadAt` | ISO | owner or helper (D3) |
| `feedback` `{rating 1-5, text, inviteNext, at}` | | owner (D9) |
| `remindedAt` | ISO | manager (N8 "תזכורת") |
| `updatedAt` | ISO | |

### `events/{eid}/vendor_info/main` (what an invited vendor may read about the event)

`events/{eid}` is readable only when published. This is the part of an event that an invited vendor sees before publication, written by managers only:

`setupFrom`, `vehiclesUntil`, `teardownFrom`, `peakUntil` (each `HH:MM`), `expected` (int), `provided`, `bring`, `contact {uid, name, phone}`, `guidelines {name, url, minutes}`, `mapUrl`, `answerBy` (`YYYY-MM-DD`), `note`, `thanks`, `visitors` (int), `stalls` (int), `managerUids` (string[]), `updatedAt`.

`ensureVendorInfo()` creates it with defaults on the first invite to an event. Events N11 should edit it (requested).

### `events/{eid}/vendor_requests/{rid}` (D6, V7, M2)

`{id, eventId, vendorId, vendorName, kind: 'power'|'help'|'supply'|'other'|'water', text, by: Actor, createdAt, takenBy: Actor|null, closedAt: ISO|null, closedBy: Actor|null}`.

- An owner or helper creates one for their own stall, and only if the stall is confirmed for that event.
- Staff take it (`takenBy`).
- Staff, or the stall itself ("הסתדר"), close it once. `closeRequest()` runs in a transaction and is refused when the request is already closed.

### `vendor_invites/{code}` (access links)

`{code, vendorId, vendorName, role: 'owner'|'helper', name, phone, fem?, active, usedBy, usedAt, createdBy: Actor, createdAt}`.

- **The code** is 12 characters from a 32-letter alphabet (60 bits). It is the secret in the link `/app/vendor[/invite/{eid}]?k={code}`.
- **Who creates one:**
  - a manager: owner or helper invites (V2/N8 invite, V6 "לקשר עוד מישהו")
  - an owner: helper invites only, for their own stall (D8)
- **Reading:** anyone signed in with Google can get a single invite by its code. This is what D1 shows before the claim. Listing is for managers, and for the stall's owner on their own stall (D3/D7).
- **Revoking:** sets `active: false`. A manager can close any invite. A stall owner closes a helper's invite as part of the D7 removal transaction.

### `events/{eid}/counters/live`

D5, D6 and D9 read the live visitors count. The vendor rules only add a get for invited vendors. Writes stay with the event-day area.

### Broadcasts and notifications

These are the broadcast area's collections (`docs/redesign-data/broadcast.md`). It already allows what vendors need:

- reading a broadcast addressed to them (`recipients` array-contains)
- writing their own receipt
- creating `vendor`-kind notifications and push jobs for managers (`notify()`)

D3 uses `useMyBroadcasts` and `useReceipt`, and the vendor roots render `<BroadcastCard>`.

## Claiming an invite (first sign-in)

`claimVendorInvite(user, code)` runs one transaction:

1. Read `vendor_invites/{code}`. It must exist with `active == true` and `usedBy == null`.
2. Read `users/{uid}`.
   - **Missing:** create the profile with `role: 'vendor'`, `status: 'active'`, the next `customerNumber` (`counters/users` + 1) and the four vendor fields.
   - **Exists with role `guest` or `vendor`:** update only `role`, `vendorId`, `helper`, `addedBy`, `inviteCode` and `updatedAt`.
   - **Any other role:** refused. A team account never becomes a stall.
3. Update the invite to `usedBy: uid`, `usedAt` and `active: false`.

The rules check both writes against each other with `getAfter`. A profile with role `vendor` can only be written in the same commit that uses up an invite whose `vendorId` and `role` match it.

**Hook point (App.tsx, requested):** `pendingVendorInvite()` returns the code from `?k=` (kept in sessionStorage across the Google redirect). Where App.tsx decides between onboarding and the app, around the profile check, call `claimVendorInvite(user, code)` when:

- there is a pending code, and
- the profile is missing or the role is `guest`.

Then show the vendor root. If the claim fails, show its message and fall back to the normal guest flow.

## Indexes (`firestore.indexes.json`, requested)

- `events/{eid}/vendor_requests`: `vendorId` asc + `createdAt` desc. Used by `useMyRequests` (D6).
- `broadcasts`: `recipients` array-contains + `createdAt` desc. Already requested by the broadcast area.
- Everything else uses single-field indexes: `vendor_invites` by `vendorId`, `events` by `published`, `vendor_requests` by `createdAt`.

## Rules (requested changes to `firestore.rules`)

These seven blocks are now in `firestore.rules`. The cases in the table at the end run in `tests/rules-app.mjs` (`npm run test:rules`).

**`rules:helpers`.** New functions, placed right after `function isStaff()`:

```rules:helpers
  // ---------- vendors: a stall's owner and helpers (role 'vendor', users/{uid}.vendorId) ----------
  // kept small on purpose: Firestore stops a rule after 1000 evaluated expressions, and the record update has five branches
  function vendorMe(){return get(userPath()).data;}
  function isVendor(){return google() && exists(userPath()) && vendorMe().role == 'vendor' && vendorMe().status == 'active';}
  function myVendor(){return isVendor() ? vendorMe().get('vendorId', '') : '';}
  function vendorPerson(vid){return vid is string && vid != '' && isVendor() && vendorMe().get('vendorId', '') == vid;}
  function vendorOwner(vid){return vendorPerson(vid) && vendorMe().get('helper', false) == false;}
  function invitedTo(eid){return isVendor() && vendorMe().get('vendorId', '') != '' && exists(/databases/$(database)/documents/events/$(eid)/vendors/$(vendorMe().get('vendorId', '')));}
```

**`rules:users-shape`.** Replaces the `function profileShape()` line inside `match /users/{id}`. It adds the four vendor keys and the claim check:

```rules:users-shape
   function profileShape(){return incoming().keys().hasOnly(['uid','email','displayName','phone','role','status','customerNumber','acceptedTermsAt','joinCode','notes','fields','log','createdAt','updatedAt','vendorId','helper','addedBy','inviteCode']) && incoming().uid == id && str(incoming().email, 200) && str(incoming().displayName, 80) && incoming().displayName.size() >= 1 && str(incoming().phone, 25) && incoming().customerNumber is int && str(incoming().acceptedTermsAt, 40) && str(incoming().createdAt, 40) && str(incoming().updatedAt, 40) && str(incoming().get('vendorId', ''), 60) && incoming().get('helper', false) is bool && str(incoming().get('addedBy', ''), 60) && str(incoming().get('inviteCode', ''), 40);}
   // a vendor profile is written only in the commit that uses up a matching invite (claimVendorInvite)
   function inviteBefore(){return get(/databases/$(database)/documents/vendor_invites/$(incoming().inviteCode)).data;}
   function inviteAfter(){return getAfter(/databases/$(database)/documents/vendor_invites/$(incoming().inviteCode)).data;}
   function claimsInvite(){return incoming().role == 'vendor' && incoming().get('inviteCode', '') is string && incoming().get('inviteCode', '').size() >= 8 && inviteBefore().active == true && inviteBefore().usedBy == null && inviteAfter().usedBy == id && inviteAfter().active == false && incoming().vendorId == inviteBefore().vendorId && incoming().helper == (inviteBefore().role == 'helper') && incoming().addedBy == inviteBefore().createdBy.uid;}
```

**`rules:users-create`.** Replaces the `function createRole()` line. A new profile may be a vendor through a claim:

```rules:users-create
   function createRole(){return incoming().status == 'active' && ((incoming().role == 'guest') || (incoming().role == 'owner' && bootstrapOwner()) || (hasEmailInvite() && incoming().role == emailInvite().role && incoming().role in ['staff','manager','owner']) || claimsInvite());}
```

**`rules:users-update`.** Replaces the `allow update: if profileShape()` line. It adds the claim by an existing guest or vendor:

```rules:users-update
   function claimEdit(){return self(id) && resource.data.role in ['guest','vendor'] && resource.data.status == 'active' && changed().hasOnly(['role','vendorId','helper','addedBy','inviteCode','updatedAt']) && claimsInvite();}
   allow update: if profileShape() && incoming().email == resource.data.email && ((self(id) && selfEdit() && (!changed().hasAny(['fields']) || fieldsOk())) || (isManager() && managerEdit()) || claimEdit());
```

`managerEdit()` stays as it is. Setting a vendor back to `guest` is how V6 "הסרת הגישה" removes access. A manager cannot set the role to `vendor`: only a claim can.

`helperRevoke()` allows D7 to change only the helper's `role` and `updatedAt`. It requires the exact current link for this account to be removed from the stall and closed in the same write. The stall rule also requires a removal activity entry. The app reads the invite on the server and can retry the whole transaction after a failed response. The stall owner can read the removal entry for that link without seeing the helper's profile.

**`rules:events-read`.** Replaces `allow read: if resource.data.published == true || isStaff();` inside `match /events/{id}`:

```rules:events-read
   allow get: if resource.data.published == true || isStaff() || invitedTo(id);
   allow list: if resource.data.published == true || isStaff();
```

**`rules:event-vendors`.** Replaces the `match /vendors/{vid} { ... }` block nested in `match /events/{id}`, and adds the vendor's brief, the requests and the live counter's read:

```rules:event-vendors
   match /vendors/{vid} {
    function recShape(){return incoming().keys().hasOnly(['vendorId','name','confirmed','notes','status','invitedAt','invitedBy','answeredAt','sells','needs','people','withVehicle','vehicle','note','spot','spotNote','arrivedAt','arrivedBy','guidelinesReadAt','feedback','remindedAt','updatedAt']) && str(incoming().name, 200) && incoming().confirmed is bool && str(incoming().notes, 1000) && incoming().get('status', 'invited') in ['invited','confirmed','declined'] && str(incoming().get('sells', ''), 300) && incoming().get('needs', []) is list && incoming().get('needs', []).size() <= 5 && str(incoming().get('note', ''), 1000) && str(incoming().get('vehicle', ''), 100) && incoming().get('withVehicle', false) is bool && (incoming().get('people', 1) is int && incoming().get('people', 1) >= 1 && incoming().get('people', 1) <= 10);}
    // D1/D2: the owner answers; the answer can be changed until a manager closes the invite
    function ownerAnswer(){return changed().hasOnly(['status','confirmed','answeredAt','sells','needs','people','withVehicle','vehicle','note','updatedAt']) && incoming().status in ['confirmed','declined'] && incoming().confirmed == (incoming().status == 'confirmed') && isoTime(incoming().answeredAt) && vendorOwner(vid);}
    // D9: the owner's feedback after the event
    function ownerFeedback(){return changed().hasOnly(['feedback','updatedAt']) && incoming().feedback is map && incoming().feedback.keys().hasOnly(['rating','text','inviteNext','at']) && incoming().feedback.rating is int && incoming().feedback.rating >= 1 && incoming().feedback.rating <= 5 && str(incoming().feedback.text, 1000) && incoming().feedback.inviteNext is bool && isoTime(incoming().feedback.at) && vendorOwner(vid);}
    // D5: the owner or a helper presses "הגעתי לחווה", once, as themselves, on a confirmed stall
    function checkIn(){return changed().hasOnly(['arrivedAt','arrivedBy','updatedAt']) && resource.data.get('status', '') == 'confirmed' && resource.data.get('arrivedAt', null) == null && isoTime(incoming().arrivedAt) && incoming().arrivedBy == uid() && vendorPerson(vid);}
    function guidelinesRead(){return changed().hasOnly(['guidelinesReadAt']) && isoTime(incoming().guidelinesReadAt) && vendorPerson(vid);}
    allow get: if isStaff() || vendorPerson(vid);
    allow list: if isStaff();
    allow create: if isManager() && recShape();
    allow update: if recShape() && incoming().vendorId == resource.data.vendorId && (ownerAnswer() || ownerFeedback() || checkIn() || guidelinesRead() || isManager());
    allow delete: if isManager();
   }
   // what an invited vendor reads about the event (D1, D3, D4, D5, D9); managers write it
   match /vendor_info/{doc} {
    function infoShape(){return incoming().keys().hasOnly(['setupFrom','vehiclesUntil','teardownFrom','peakUntil','expected','provided','bring','contact','guidelines','mapUrl','answerBy','note','thanks','visitors','stalls','managerUids','updatedAt']) && str(incoming().get('provided', ''), 300) && str(incoming().get('bring', ''), 300) && str(incoming().get('note', ''), 1000) && str(incoming().get('thanks', ''), 1000) && str(incoming().get('mapUrl', ''), 2000) && incoming().get('managerUids', []) is list && incoming().get('managerUids', []).size() <= 20 && incoming().get('contact', {}) is map && incoming().get('guidelines', {}) is map;}
    allow get: if isStaff() || invitedTo(id);
    allow list: if isStaff();
    allow write: if isManager() && doc == 'main' && (request.method == 'delete' || infoShape());
   }
   // D6 "need something": the stall creates and may close its own; staff take and close (V7, M2)
   match /vendor_requests/{rid} {
    function reqShape(){return incoming().keys().hasOnly(['id','eventId','vendorId','vendorName','kind','text','by','createdAt','takenBy','closedAt','closedBy']) && incoming().id == rid && incoming().eventId == id && incoming().kind in ['power','help','supply','other','water'] && str(incoming().text, 200) && str(incoming().vendorName, 200) && actorOf(incoming().by);}
    function confirmedStall(){return get(/databases/$(database)/documents/events/$(id)/vendors/$(incoming().vendorId)).data.get('status', '') == 'confirmed';}
    allow get, list: if isStaff() || vendorPerson(resource.data.vendorId);
    allow create: if reqShape() && vendorPerson(incoming().vendorId) && confirmedStall() && actorOk(incoming().by) && isoTime(incoming().createdAt) && incoming().takenBy == null && incoming().closedAt == null && incoming().closedBy == null;
    allow update: if reqShape() && incoming().vendorId == resource.data.vendorId && incoming().by == resource.data.by && incoming().createdAt == resource.data.createdAt && ((isStaff() && changed().hasOnly(['takenBy']) && (incoming().takenBy == null || actorOk(incoming().takenBy))) || ((isStaff() || vendorPerson(resource.data.vendorId)) && resource.data.closedAt == null && changed().hasOnly(['closedAt','closedBy']) && isoTime(incoming().closedAt) && actorOk(incoming().closedBy)));
    allow delete: if isManager();
   }
   // the live visitors count (D5, D6, D9): invited vendors may read it; writes stay with the event-day area
   match /counters/{name} {
    allow get: if isStaff() || (name == 'live' && invitedTo(id));
   }
```

**`rules:vendors`.** The current implementation is in [firestore.rules](../../firestore.rules). D8 appends one helper row and creates its invite in the same write. D7 removes one helper row, closes its invite and records the action in the same write. The profile also goes back to `guest` when the account currently uses that exact invite.

What stays unchanged:

- `counters/users`: the claim increments it like any new profile.
- `settings/app` is public, which D3 needs for the farm's WhatsApp number.
- Broadcasts, receipts, notifications and push jobs: see the broadcast area's rules.

The cost of `get()` calls stays inside the limits:

- **Single-document requests** (limit 10): the worst case is a request create. It reads the profile (every vendor helper shares that one read) plus the stall record.
- **Evaluated expressions** (limit 1000 per rule): each branch tests the cheap `changed()` first and the profile last. The rules tests caught this limit on the record update.
- **The claim** (a 3-write commit, limit 20): it reads the invite (`get` and `getAfter`), the profile (`getAfter`) and the counter.

## Rules test cases

Set-up data:

- **Vendors:**
  - `raz`, owner of `v-raz`
  - `tamar`, helper of `v-raz`
  - `dana`, owner of `v-dana`
- **Events:**
  - `e-hidden` (not published): only `v-raz` is invited
  - `e-other` (not published): only `v-dana` is invited
  - `e-pub` (published)

| # | Who | Action | Expected |
| --- | --- | --- | --- |
| 1 | raz | get `vendors/v-raz` | allow |
| 2 | raz | get `vendors/v-dana`; list `vendors` | deny |
| 3 | tamar | get `vendors/v-raz` | allow |
| 4 | raz | get `vendors/v-raz/private/main` | deny (team notes) |
| 5 | raz | get `events/e-hidden` (invited, unpublished) | allow |
| 6 | raz | get `events/e-other`; list all `events` | deny |
| 7 | raz | list `events` where `published == true` | allow |
| 8 | raz | get `e-hidden/vendor_info/main` and `e-hidden/counters/live` | allow |
| 9 | raz | get `e-other/vendor_info/main`; get `e-other/vendors/v-dana`; list `e-hidden/vendors` | deny |
| 10 | raz | answer `e-hidden/vendors/v-raz` (confirmed + needs) | allow |
| 11 | raz | change own `spot`; tamar answers | deny |
| 12 | tamar | check in (`arrivedAt`, `arrivedBy` = self) | allow; second check-in denied; `arrivedBy` someone else denied |
| 13 | raz | create a request for `v-raz` on `e-hidden` | allow |
| 14 | dana | create a request for `v-raz`; raz creates on `e-other` | deny |
| 15 | raz | list requests where `vendorId == v-raz` | allow; listing all denied |
| 16 | staff | take a request; raz closes it | allow; closing again denied |
| 17 | raz | edit stall `name`/`note` | allow; editing `external`, `notes` or `events` denied |
| 18 | tamar, dana | edit `vendors/v-raz` | deny |
| 19 | raz | create a helper invite for `v-raz` | allow; an owner invite or an invite for `v-dana` denied |
| 20 | raz | list invites where `vendorId == v-raz` | allow; tamar and dana denied |
| 21 | someone signed in | get an invite by code | allow |
| 22 | new account | create profile `vendor` + use the invite in one batch | allow |
| 23 | new account | the same with a used invite, a wrong `vendorId`, or without using the invite | deny |
| 24 | guest | claim (update to `vendor`) with an unused invite | allow |
| 25 | staff | claim | deny |
| 26 | raz | close a helper's invite separately | deny; closing requires the helper removal transaction |
| 27 | manager | set raz back to `guest` (V6) | allow; then raz reads `vendors/v-raz` denied |
| 28 | raz | get `users/tamar` | deny |
| 29 | raz | remove a helper (D7): close the invite, remove the row, set the profile to `guest` and log the removal together | allow; the helper then reads the stall, its requests and the live count denied, creates a request denied; raz and the other helper keep theirs |
| 30 | raz | set another stall's helper, a co-owner, or the helper's other fields | deny; a helper cannot remove anyone |

## Review older missing stall links

`node scripts/vendor-access-audit.mjs --project=<project>` produces a read-only JSON report by account and stall ID. Add `--cleanup` for a dry run or `--cleanup --apply` for an authorized cleanup. Against the emulator set `FIRESTORE_EMULATOR_HOST` to the local address. For a remote report set `ACCESS_TOKEN` to an authorized Firestore access token. Keep the report private.

The cleanup considers only helpers with a closed invite that matches their current account and stall. It checks the current profile, stall and invite together before changing the role to `guest`. A matching row by UID or invite code preserves access. A missing or conflicting identity, an unidentifiable row, or an owner with a missing row requires manual review. Nothing is matched by name.
