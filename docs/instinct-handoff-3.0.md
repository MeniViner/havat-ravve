# Havat Ravve API 3.0: message for Instinct

Meni pastes the text below to Instinct. It contains no key: Instinct already holds its key (`HAVAT_RAVVE_API_KEY`) in
its own vault, and that key is unchanged.

---

The Havat Ravve API was upgraded to catalog **3.0.0** (2026-11-22). The farm app was redesigned, and the API now
covers every action a manager or owner can do in the new app: **182 operations** (67 reads, 115 writes).

**What to do**
1. Reload the catalog: `GET https://havat-ravve-api.meniviner.workers.dev/v1/catalog` (no auth). Treat it as the only
   source of truth; an operation that isn't listed doesn't exist. Check that `version` is `3.0.0`.
2. Keep using your existing key and `User-Agent` header. Your key acts as Meni (owner), so every operation is allowed.
3. Read `conventions` again: they changed (scopes, files, notifications).

**New areas**
- Projects and their steps (`projects.*`), shopping trips (`shopping.startTrip` / `closeTrip`), take and release a task
  (`tasks.take`, `tasks.release`), a missing shopping item (`shopping.setMissing`).
- Presence at the farm (`presence.save`, also for someone else) and full calendar items (kind, audience, participants,
  a reminder 60 minutes before).
- Broadcasts to the team (`broadcasts.send`, with audiences all / managers / farmToday / crew / vendors), read receipts,
  your own notifications (`me.notifications.*`), and `notifications.send` to notify specific people.
- Events: close and reopen, file links, staffing stations, guest orders, payment confirmations, the gate
  (`gate.admit` and friends), the cash count.
- The vendor pool: invitations, confirmations, reminders, helpers, requests on the event day, private team notes.
- Deletes and payment follow-ups for visits, donations and inbox items; every settings section; registration
  questions.

**Behavior that changed**
- Event `start` / `end`: send Israel local time `YYYY-MM-DDTHH:mm`; they are stored as ISO UTC like the app. Reads
  also return `startLocal` / `endLocal`. An event may end on a later day.
- `events.setVendor` still works, but prefer `events.inviteVendor` / `events.confirmVendor`.
- Writes now notify people exactly as the app does (in-app notification and, when push is on, the phone).
- Photos and files can't be uploaded through the API: only https links already stored by the farm's server, or a
  Drive link for event files.
- Destructive operations say so in their notes: confirm with Meni before calling them.
