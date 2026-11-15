# Havat Ravve feedback round 1

Baseline `de67395` on `feedback-round-1`. The local demo and Firestore emulator provide the test data.

| Stage | Work | Primary files |
| --- | --- | --- |
| 0 | Record the baseline and reproduce the five reported defects in the browser. | `docs/feedback-round-1-plan.md`, `docs/smoke/round-1/0/` |
| 1 | Fix stall guest selection, account creation, cart controls, gate search and camera feedback. Remove guest-facing sales totals. | `src/app/screens/EventDay.tsx`, `src/app/screens/Guest.tsx`, `src/app/data.ts`, `src/app/app.css`, `src/app/demo/data.ts`, `tests/rules-app.mjs` |
| 2 | Keep completed tasks in Today, distinguish task groups, support routine task claiming and shopping photos, and add sortable export tables. | `src/app/screens/Today.tsx`, `src/app/screens/EventDay.tsx`, `src/app/screens/New.tsx`, `src/app/screens/Shopping.tsx`, `src/app/screens/Manage{People,Events,More}.tsx`, `src/app/{app,farm}.css`, `src/app/{store,types}.ts`, `firestore.rules`, `tests/rules-app.mjs` |
| 3 | Add independent entry and stall switches to events and apply them to the event hub and direct links. | `src/app/{App.tsx,types.ts}`, `src/app/screens/{EventDay,ManageEvents}.tsx`, `src/app/demo/data.ts`, `firestore.rules`, `tests/rules-app.mjs` |
| 4 | Put the team calendar in navigation and Today. Add presence permissions, stable colours and month, week and day views. | `src/app/{App.tsx,data.ts,types.ts}`, `src/app/screens/{Today,ManageMore}.tsx`, `src/app/app.css`, `src/app/demo/data.ts`, `api/src/{overview,resources}.ts`, `firestore.rules`, `tests/rules-app.mjs` |
| 5 | Complete guest registration, payment confirmation preferences, manager contact, app install and new event indicators. Link authorised editors to the CMS and document future email and push. | `src/app/{App.tsx,data.ts,store.ts,types.ts}`, `src/app/screens/{Guest,More,Manage,ManageEvents,ManageMore}.tsx`, `src/app/demo/`, `firestore.rules`, `tests/rules-app.mjs`, `docs/{receipts-email-design,push-design}.md`, `README.md` |

At each stage a fresh verifier runs both typechecks, rebuilds and checks `dist/`, runs the core, demo, rules and Worker suites, and checks the current and earlier acceptance criteria in Chrome at 390×844 and 1280×800. Stage 0 expects the five reported defects to reproduce. After stage 1 the regression checks expect their corrected behaviour.

## Differences found on main

- The autumn festival has one Michal Barak order with three tickets. Her second order belongs to a different event. Stage 1 adds a second order to the autumn festival to verify the two groupings.
- The autumn festival has no seeded open accounts. The October event has an open account for Shira Katz and covers the original open-row stall defect.
- The guest event page shows buyer initials and a registration count. The rendered buyer avatars carry no full name. Stage 1 removes the entire section and its subscriber.
- The account already exposes registration fields and the app offers static install instructions. Stage 5 extends those entry points. The demo guest already has a profile, so onboarding requires a fresh demo profile or a local Auth emulator signup.
- App managers and CMS editors have separate permissions. The `/admin` link follows the CMS access check.
- The local dev server serves a service worker stub and omits the built app manifest. The install UI can be exercised there with a browser event. Install eligibility needs the built app on local hosting.
- Opening a same-repository PR can trigger a temporary Firebase Hosting preview. Exclude `feedback-round-1` from the preview job before opening its PR.

## Baseline notes

The full-history clone stalled. A shallow fetch of the same `main` commit over HTTP/1.1 completed and provided the clean baseline.

The build hashes the copied public stylesheet into the service worker. Restoring the tracked LF line endings for this Windows checkout and completing the dependency lifecycle scripts made the build match the committed output.

Direct emulator downloads timed out. Downloading verified byte ranges and assembling the CLI-pinned JAR with its expected SHA-256 resolved the download. A dedicated cache kept it available alongside the other Firebase CLI version on this workstation.

Windows denied binding the default Firestore port. The test suites ran with the repository's rules and indexes at `127.0.0.1:8180` under Java 21. The Worker test's POSIX process launcher failed on Windows with `spawn npx ENOENT`. A local adapter invoked the installed Wrangler JavaScript entry with Node and stopped its Windows process tree. The Worker assertions ran unchanged.

| Baseline check | Result |
| --- | --- |
| App and Worker typechecks | Pass |
| Build and committed `dist/` parity | Pass |
| Core and demo sandbox suites | Pass |
| Firestore rules suite | Pass on port 8180 |
| Worker integration suite | 250 passed, 0 failed on port 8180 with the Windows launcher adapter |
| Chrome demo at 390×844 and 1280×800 | 42 checks passed across 12 persona and viewport combinations |
| Browser console | Zero errors or React warnings |

[Stage 0 browser matrix and before screenshots](smoke/round-1/0/README.md)
