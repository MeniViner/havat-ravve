# Owner walk of the console

The real console page at 1440x900, signed in as an owner of the emulators, on a local Worker. Every action is done once
and checked on the screen and in Firestore or the Worker's own answer. Run it with
`PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH node scripts/console-walk.mjs` (see the head of that file). A frozen copy of
a commit is walked (`WALK_APP`), because the working folder is edited meanwhile.

Parts: `owner` (the sixteen screens and the main flows), `limited` (people who must be refused), `actions` (every other
button that changes or saves something), `demo` (`?demo`, every control, no requests), `today` (this page against
origin/main's Worker, which is what is live until the new Worker goes out).

## What it found

Nothing in the last run. Earlier runs found, and these are fixed: one Firestore query per key on Keys; unsaved choices on
Keys and an unsaved record in Data dropped without a question; the security log not naming the switch and its direction,
who a role or block was about, which job, key, email or alert, who was deleted, or a failed console action; a refused
console action listed twice.

## Not covered

- Real Google sign-in; real mail (a pretend mail service answers) and real phone delivery (no phone is
  registered, so the Worker marks the push as handled).
- The morning check by the clock, the daily summary itself, the site check and the alerts they send: the Worker does none
  of them on emulators (`monitorStep`). The settings, the test alert and "check now" are covered.
- The cron by the clock: it is triggered by hand.
- The quota meter's numbers, and the "copy the command" button, which shows only for a permission error of Google.
- R2 and KV as Cloudflare runs them (their delays, the storage meter's real size), and a composite index missing in
  production.
- Downloading what the cleanup archived: there is no such button, and no such route in the Worker.
- What the app itself shows under a switch (the maintenance screen, closed registration): only its copy in
  `settings/switches` is checked. "Card in the app" and the links to the app and the site editor are checked by address.
- Opening a long list on the traffic screen: the seeded farm has none (the demo part clicks it). The phone layout.

## Safety

Nothing here can reach the live Worker or the production project (`scripts/smoke/console-env.mjs`):

- The whole tree of processes runs under a macOS kernel sandbox (`sandbox-exec`) that denies every outgoing connection
  except to this computer, name lookups included. The run stops unless two probes fail first; their result is below.
- The Firebase project is `demo-havat-ravve`, a name that exists only for emulators. The page's bundle is built with it and
  a made-up key, always on the emulators; only the demo part opens the real bundle, which must send no request at all
  (checked) and could not (the sandbox and the aborted requests). Cloudflare, Google and Firebase credentials are taken out of the environment, and
  `wrangler` runs with an empty home folder, so it finds no sign-in.
- The Worker runs under `wrangler dev` with a config of its own: made-up KV and R2 names, kept in a scratch folder. Its
  entry answers any request to the outside itself and lists it.
- Every browser context aborts and lists each request that is not to localhost, and Chromium resolves no other name.
- "Today's Worker" is `git archive origin/main api` run the same way. Nothing is deployed.
- Only processes the run started are stopped.

<!-- results:start -->
Run 2026-11-24 11:11 UTC, commit caeeddb. 676 passed, 1 failed.

| Part | Step | Passed | Failed |
| --- | --- | --- | --- |
| owner | sign in | 1 | 0 |
| owner | refresh and full check | 4 | 0 |
| owner | people: role, block, notes | 17 | 0 |
| owner | jobs: pause, resume, run, full round | 11 | 0 |
| owner | switches: read-only on and off with a reason; history; security log | 17 | 0 |
| owner | keys: create, use, scopes, replace, revoke, restore, usage | 20 | 0 |
| owner | keys: requests per row | 2 | 0 |
| owner | run: a read, a write, undo it | 8 | 0 |
| owner | backup now and its download | 4 | 0 |
| owner | data: careful edit, history | 11 | 0 |
| owner | delete a record, bring it back from the bin | 5 | 0 |
| owner | restore a record from a backup | 3 | 0 |
| owner | queue: text of one mail, send again, do not send | 9 | 0 |
| owner | import: paste, check, import, undo | 6 | 0 |
| owner | traffic year, stats, speed, money periods | 16 | 0 |
| owner | security export | 3 | 0 |
| limited | dana is refused | 7 | 0 |
| limited | yoav is refused | 7 | 0 |
| limited | michal is refused | 7 | 0 |
| limited | avi is refused | 7 | 0 |
| actions | overview and the frame: every link | 5 | 0 |
| actions | people: search and filters | 4 | 0 |
| actions | people: set a role ahead (invite) | 7 | 0 |
| actions | people: delete one | 9 | 0 |
| actions | people: an owner, myself, a stall, the card in the app | 7 | 0 |
| actions | monitor: check, a row, the alert settings, a test alert | 21 | 0 |
| actions | switches: maintenance and its message | 7 | 0 |
| actions | switches: registration, keys, payments mail, phone, mail to registrants | 26 | 0 |
| actions | switches: read-only stops a key from writing | 3 | 0 |
| actions | jobs: each one once, the cleanup and its archive, a stopped round | 23 | 0 |
| actions | keys: refused forms, picked areas, name, expiry, an expired one, not saved | 24 | 0 |
| actions | keys: last use further back than the last hundred requests | 6 | 0 |
| actions | queue: filters, stop a push, the person's card, the counter | 11 | 0 |
| actions | data: browsing, filters, more, inside a record, the stored fields, exports | 19 | 0 |
| actions | data: edit a yes/no and a date, a bad date, not saved, changed meanwhile | 12 | 0 |
| actions | data: versions, thirty days | 5 | 0 |
| actions | backups: download from the restore window, a record gone since, a bin record made again | 7 | 0 |
| actions | import: shopping from a file, a mended cell, a repeat, an old undo | 8 | 0 |
| actions | run: the list, technical details, more fields, a refused run | 8 | 0 |
| actions | money, speed, traffic, stats: every export and toggle | 6 | 0 |
| actions | security: filters, search, periods, export, and what the lines say | 29 | 1 |
| actions | sign out | 2 | 0 |
| demo | opens ?demo | 1 | 0 |
| demo | requests ?demo | 2 | 0 |
| demo | opens ?demo=owner | 1 | 0 |
| demo | requests ?demo=owner | 2 | 0 |
| today | sign in | 1 | 0 |
| today | actions still work | 12 | 0 |
| today | the old server's limits read as such | 1 | 0 |
| today | control: the detectors see a fault | 2 | 0 |
| owner | the sixteen screens | 96 | 0 |
| demo | the sixteen screens | 64 | 0 |
| today | the sixteen screens | 80 | 0 |

### Failed checks

- [actions] security: filters, search, periods, export, and what the lines say: no code names. ["היום 13:03 אליה כהן הגדרת תפקיד מראש למייל · ahead.walk@example.com · מתנדב/ת קונסולה "]

### Requests to open each screen

| Screen | Worker requests | Firestore queries of the browser | Today's Worker | Firestore (today) |
| --- | --- | --- | --- | --- |
| overview | 3: `GET /overview` `GET /monitor` `GET /queue` | 1 | 3 | 1 |
| monitor | 1: `GET /monitor` | 0 | 1 | 0 |
| speed | 1: `GET /speed?days=…` | 0 | 1 | 0 |
| stats | 1: `GET /stats?days=…` | 0 | 1 | 0 |
| traffic | 1: `GET /traffic?days=…` | 0 | 1 | 0 |
| money | 1: `GET /stats?days=…` | 0 | 1 | 0 |
| data | 4: `GET /data` `GET /data/docs?collection=…` `GET /data/doc?path=…` `GET /data/history?path=…&days=…` | 0 | 4 | 0 |
| people | 2: `GET /people/access` `GET /keys` | 1 | 2 | 1 |
| import | 1: `GET /imports` | 0 | 1 | 0 |
| backups | 3: `GET /backups` `GET /trash` `GET /monitor` | 0 | 3 | 0 |
| queue | 2: `GET /queue` `GET /queue/email/order_or-tk-1` | 0 | 2 | 0 |
| jobs | 1: `GET /jobs` | 0 | 1 | 0 |
| switches | 1: `GET /switches` | 0 | 1 | 1 |
| keys | 2: `GET /keys` `GET /keys/cred-/usage` | 1 | 2 | 2 |
| run | 1: `GET /catalog` | 0 | 1 | 0 |
| security | 1: `GET /security?days=…` | 0 | 1 | 0 |

Keys screen with seven keys: 2 Worker requests, 1 Firestore query for all of them.

A key whose last use is further back than the last hundred requests, opened by its address: 2 Firestore queries (the table's and its own).

### Network

- Sandbox proof at the start: curl to 1.1.1.1: exit 7 (curl: (7) Failed to connect to 1.1.1.1 port 80 after 0 ms: Couldn't connect to server); a name lookup (example.com): exit 6 (curl: (6) Could not resolve host: example.com).
- Aborted in the browser: none.
- Asked by a Worker of the outside world (answered or refused on this computer): {"branch":[],"actions":[],"today":[]}.
<!-- results:end -->
