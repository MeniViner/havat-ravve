# Data model: broadcast area (B1 to B4, C1, phone push)

Code:

- `src/app/v2/data/broadcast.ts`: broadcasts, receipts, audiences.
- `src/app/v2/data/notify.ts`: personal notifications and the push outbox. Shared by every area.
- `src/app/v2/data/push.ts`: device subscription and preferences.
- `api/src/push.ts`: the Worker drain.

Every write goes through `db.ts` and is offline-first. Times are ISO strings from `clock.ts`. Demo seed: `src/app/demo/seed/broadcast.ts`.

## Collections and fields

### `broadcasts/{id}` (B1 writes; B2, B3, B4 and D3 read)

| Field | Type | Notes |
| --- | --- | --- |
| `text` | string, 1 to 200 | trimmed |
| `audience` | `'all' \| 'farmToday' \| 'managers' \| 'crew' \| 'vendors'` | |
| `eventId` | string, optional | only for `crew` and `vendors` |
| `urgent` | bool | default `false` |
| `by` | `{ uid, name }` | the sender |
| `createdAt` | ISO | |
| `recipients` | uid[] | Snapshot at send time, at most 500. Includes the sender when they are in the audience. |
| `recipientCount` | int | `recipients.length` |
| `resentAt` | ISO or null | set by "לשלוח שוב" |

How each audience is resolved, in the client at send time:

| Audience | Who |
| --- | --- |
| `all` | active owner, manager and staff |
| `farmToday` | `calendar` entries with `kind == 'presence'` for today |
| `managers` | owner and manager |
| `crew` | the people in `events/{eid}/staffing` |
| `vendors` | users with role `vendor` whose `vendorId` is among the event's vendors that have not declined |

### `broadcasts/{id}/reads/{uid}` (the read receipt; only that person writes it)

| Field | Type | Notes |
| --- | --- | --- |
| `uid`, `id` | string | equal to the document id |
| `name` | string, at most 80 | for B3 without reading the profile |
| `seenAt` | ISO, optional | The card was shown on the phone. Written with merge, so it never clears `at`. |
| `at` | ISO or null | "קראתי". A receipt counts as read only with `at`. |

B3 shows three different states:

| Receipt | B3 shows |
| --- | --- |
| none | "עוד לא נכנס לאפליקציה" |
| `seenAt` only | presence today: "בחווה היום, 08:30–13:30" or "לא בחווה היום" |
| `at` | listed under "קראו" |

When the sender is a recipient, their copy starts unread. They mark it read the same way as other recipients.

### `users/{uid}/notifications/{id}` (C1; personal, separate from the managers' inbox `notifications/{id}`)

`{ id, kind, title (≤120), sub (≤240), link (in-app path), refId, action?: { label, kind: 'addToTrip' | 'open' }, by?: { uid, name }, createdAt, readAt: null | ISO }`

- `kind` is one of `task`, `urgent`, `trip`, `event`, `broadcast`, `vendor`, `system`.
- A broadcast uses the stable id `b_<broadcastId>`. "לשלוח שוב" writes the same document again, so it comes back as new instead of appearing twice.
- B4 "קראתי" sets its `readAt`. Opening C1 marks the visible unread items read.

### `push_jobs/{id}` (the push outbox; the app creates it, only the Worker reads it)

`{ id, kind, title (≤80), body (≤180), link, to: uid[] (≤200), createdBy: { uid, name }, createdAt, sentAt: null, urgent, tag, refId }`

- Each selected recipient appears once in `to`, including the sender when selected. A send to more than 200 people becomes several jobs.
- The Worker adds:
  - `leaseUntil`, `attempts`, `cursor`
  - `delivered` and `failed` counts
  - `outcome`: `sent`, `refused`, `stale` or `invalid`
  - `sentAt` (ISO), set when the job is done

### `users/{uid}.push` (new field on the profile)

`{ enabled: bool, kinds?: ('broadcast'|'task'|'urgent'|'trip'|'event')[], devices?: Device[] (≤6), updatedAt }`

A device is one of:

- `{ id, kind: 'webpush', endpoint, keys: { p256dh, auth }, ua, createdAt }`
- `{ id, kind: 'fcm', token, ua, createdAt }`

`kinds` missing means everything. The job kind `vendor` maps to the preference `event`, and `system` always comes. The Worker removes a device that its push service reports gone.

### `settings/push` (written only by the Worker; readable by everyone, like all of `settings`)

`{ mode: 'off' | 'webpush' | 'fcm', vapidPublicKey, fcmVapidKey, updatedAt }`: public keys only. See `docs/push-setup.md`.

## Defaults for older documents

These collections are new, so there is no old data. Readers still handle missing fields:

- missing `urgent` reads as false
- missing `recipients` reads as `[]`
- a receipt without `at` is unread
- missing `push` reads as push off
- missing `kinds` reads as all kinds

## Indexes (`firestore.indexes.json`, requested)

- `broadcasts`: `recipients` (array-contains) + `createdAt` desc. Used by B4 and D3 (`useMyBroadcasts`).
- Everything else uses single-field indexes:
  - `broadcasts` by `createdAt`
  - `users/{uid}/notifications` by `createdAt`
  - `calendar` by `kind` and `date` (already used)
  - the Worker's `push_jobs` query `sentAt IS NULL`

## Rules needed (requested; `firestore.rules` is a shared file)

```
// inside match /users/{id}: add 'push' to profileShape().keys().hasOnly([...]) and to selfEdit().changed().hasOnly([...]), and:
function pushOk(){let p = incoming().get('push', {}); return p is map && p.keys().hasOnly(['enabled','kinds','devices','updatedAt'])
  && p.get('enabled', false) is bool && p.get('kinds', []) is list && p.get('kinds', []).size() <= 5
  && p.get('devices', []) is list && p.get('devices', []).size() <= 6;}
//   update: ... (self(id) && selfEdit() && (!changed().hasAny(['push']) || pushOk()) ...)

match /users/{id}/notifications/{nid} {
  allow read: if self(id);
  // anyone on the team notifies a teammate; the owner of the list only marks read
  allow create: if (isStaff() || activeRole() == 'vendor') && incoming().keys().hasOnly(['id','kind','title','sub','link','refId','action','by','createdAt','readAt'])
    && incoming().kind in ['task','urgent','trip','event','broadcast','vendor','system'] && (incoming().kind != 'broadcast' || isManager())
    && str(incoming().title, 120) && str(incoming().sub, 240) && str(incoming().link, 200) && incoming().link.matches('/[^/].*|/')
    && actorOk(incoming().by) && incoming().readAt == null;
  // "לשלוח שוב" rewrites b_<id> as new: a manager may overwrite a broadcast notification
  allow update: if (self(id) && changed().hasOnly(['readAt']) && isoTime(incoming().readAt))
    || (isManager() && resource.data.kind == 'broadcast' && incoming().kind == 'broadcast' && incoming().readAt == null && actorOk(incoming().by));
  allow delete: if self(id);
}

match /broadcasts/{bid} {
  function shape(){return incoming().keys().hasOnly(['id','text','audience','eventId','urgent','by','createdAt','recipients','recipientCount','resentAt'])
    && str(incoming().text, 200) && incoming().text.size() >= 1 && incoming().audience in ['all','farmToday','managers','crew','vendors']
    && incoming().urgent is bool && incoming().recipients is list && incoming().recipients.size() <= 500 && incoming().recipientCount == incoming().recipients.size();}
  allow get, list: if isManager() || (google() && uid() in resource.data.recipients);
  allow create: if isManager() && shape() && actorOk(incoming().by) && incoming().resentAt == null;
  allow update: if isManager() && changed().hasOnly(['resentAt']) && isoTime(incoming().resentAt);
  allow delete: if isOwner();

  match /reads/{rid} {
    function receiptOk(){return incoming().keys().hasOnly(['id','uid','name','at','seenAt']) && incoming().uid == rid && incoming().id == rid
      && str(incoming().name, 80) && (incoming().get('at', null) == null || isoTime(incoming().at)) && (!('seenAt' in incoming()) || isoTime(incoming().seenAt));}
    function recipient(){return uid() in get(/databases/$(database)/documents/broadcasts/$(bid)).data.recipients;}
    allow get: if self(rid) || isManager();
    allow list: if isManager();
    // only the person themselves, only if they are a recipient; a read stays read
    allow create: if self(rid) && recipient() && receiptOk();
    allow update: if self(rid) && receiptOk() && (resource.data.get('at', null) == null || incoming().at == resource.data.at);
    allow delete: if false;
  }
}

match /push_jobs/{jid} {
  allow read: if false;               // only the Worker (service account) reads and updates jobs
  allow create: if (isStaff() || activeRole() == 'vendor')
    && incoming().keys().hasOnly(['id','kind','title','body','link','to','createdBy','createdAt','sentAt','urgent','tag','refId'])
    && incoming().id == jid && actorOk(incoming().createdBy) && incoming().sentAt == null
    && incoming().kind in ['task','urgent','trip','event','broadcast','vendor','system'] && (incoming().kind != 'broadcast' || isManager())
    && (activeRole() != 'vendor' || incoming().kind == 'vendor')
    && str(incoming().title, 80) && str(incoming().body, 180) && str(incoming().link, 200) && str(incoming().tag, 64)
    && incoming().to is list && incoming().to.size() >= 1 && incoming().to.size() <= 200 && !(uid() in incoming().to) && incoming().urgent is bool;
  allow update, delete: if false;
}
// settings/{name}: keep 'push' out of every client write rule (only the Worker writes settings/push).
```

`isoTime` in the rules requires milliseconds and `Z`, which is what `nowIso()` produces.

The Worker repeats every check that matters, because the service account bypasses the rules:

- the creator is active
- a `broadcast` or `system` push needs a manager or owner
- a vendor may send only `vendor` jobs, and only to managers
- recipients must be active, have push enabled and have chosen that kind
- the link must be an in-app path
- the endpoint must be a known push service

## Rules test cases (for the rules test suite)

| # | Who | Action | Expected |
| --- | --- | --- | --- |
| 1 | manager | create `broadcasts/x` with valid shape, `by` = self | allow |
| 2 | staff | create `broadcasts/x` | deny |
| 3 | manager | create with `text` of 201 chars, or `by.uid` of someone else | deny |
| 4 | staff in `recipients` | get `broadcasts/x`; list `where recipients array-contains me` | allow |
| 5 | staff not in `recipients` | get `broadcasts/x` | deny |
| 6 | vendor in `recipients` | list `where recipients array-contains me` | allow (D3) |
| 7 | manager | update `resentAt` only | allow; changing `text` is denied |
| 8 | staff recipient | create `reads/{me}` with `seenAt` only, then set `at` | allow both |
| 9 | staff recipient | create `reads/{other uid}` | deny |
| 10 | staff not a recipient | create `reads/{me}` | deny |
| 11 | staff | update own receipt to clear `at` after reading | deny |
| 12 | staff | list `broadcasts/x/reads` | deny (managers only, B3) |
| 13 | manager | list `broadcasts/x/reads` | allow |
| 14 | me | read `users/{me}/notifications`; update only `readAt` | allow |
| 15 | me | update `title` of my notification | deny |
| 16 | staff | read `users/{other}/notifications` | deny |
| 17 | staff | create `users/{other}/notifications/n` kind `task`, `by` = self | allow |
| 18 | staff | create a notification of kind `broadcast` | deny |
| 19 | manager | overwrite `users/{other}/notifications/b_x` (resend) with `readAt: null` | allow |
| 20 | staff | create `push_jobs/j` with `createdBy` = self, `to` of 3 others, `sentAt: null` | allow |
| 21 | staff | create `push_jobs/j` kind `broadcast`, or `createdBy` someone else, or `to` of 201, or `to` containing self | deny |
| 22 | anyone signed in | get or list `push_jobs` | deny |
| 23 | staff | update `push_jobs/j` (set `sentAt`) | deny |
| 24 | me | update `users/{me}.push` with 2 devices and `kinds` | allow |
| 25 | me | update `users/{me}.push` with 7 devices or an unknown key | deny |
| 26 | staff | update `users/{other}.push` | deny |
| 27 | manager | write `settings/push` | deny |
| 28 | guest (not signed in) | get `settings/push` | allow (public keys only) |

The Worker side of these rules (refused broadcast, stale job, blocked person, chosen kinds, device cleanup, idempotent drain) is covered by the `phone push` section in `tests/api.mjs`.
