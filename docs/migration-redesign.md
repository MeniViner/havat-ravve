# Redesign v2: going live (for Meni)

Nothing here has run against production. Each step is Meni's to run, in this order. Every step can run again safely.

## What changes in the data

Almost nothing is renamed or removed. Old documents keep loading: every new field is optional and the app fills in defaults.

- New collections: `projects` (+ `steps`), `shopping_trips`, `broadcasts` (+ `reads`), `users/{uid}/notifications`, `push_jobs`, `vendor_invites`, `events/{id}/scans`, `events/{id}/counters`, `events/{id}/staffing`, `events/{id}/vendor_info`, `events/{id}/vendor_requests`, `vendors/{id}/private`.
- New optional fields on existing documents: tasks, task templates, places, shopping items, calendar items, tickets, tabs, products, events, vendors, event vendor records, users and settings. Each area's list is in `docs/redesign-data/<area>.md`.
- New role: `vendor` (stall owner, or helper with `helper: true`).
- **One move is needed:** the team's notes on a vendor (`vendors/{id}.notes`) go to a managers-only document, because vendors will be able to read their own vendor record.

## Order of steps

1. **Indexes first.** Building them takes a few minutes, and queries that need them fail until they are ready.
   ```
   firebase deploy --only firestore:indexes --project havat-ravve
   ```
2. **Move the vendor notes.** The script is a dry run unless you pass `--apply`.
   ```
   ACCESS_TOKEN="$(gcloud auth print-access-token)" node scripts/migrate-redesign.mjs --project=havat-ravve
   ACCESS_TOKEN="$(gcloud auth print-access-token)" node scripts/migrate-redesign.mjs --project=havat-ravve --apply
   ```
   It also lists any event-level vendor records that still carry notes, so you can decide whether those should stay visible to the vendor.

   Tested on the emulator (2026-11-21) with three vendors: one with notes, one empty, and one whose private notes already existed. The dry run changed nothing. `--apply` moved the notes, merged them with the existing private notes, and blanked the public field. A second `--apply` reported "0 to change". To repeat the test:
   ```
   npx firebase emulators:exec --only firestore --project demo-havat-ravve "bash scripts/proofs/migrate-proof.sh"
   ```
3. **Rules and the app together.** Merging the PR into `main` deploys hosting, rules and indexes (`.github/workflows/deploy.yml`). Merge only after steps 1 and 2.
4. **Push notifications (optional, later).** Follow `docs/push-setup.md`: generate keys, set the Worker secrets, deploy the Worker, then flip `PUSH_MODE`. Until then, everything still appears inside the app under התראות.

## If something goes wrong

- Reverting the merge commit on `main` brings back the previous app and rules. Data written by the new app stays, and the old app ignores the new fields and collections.
- The vendor-notes move is the only data change. The notes stay in `vendors/{id}/private/main`, readable by managers.
