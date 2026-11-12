# Havat Ravve API (stage 1)

A Cloudflare Worker that lets Meni's personal assistant read and write farm tasks over HTTPS. It's a thin
gateway: a static catalog describes the operations, the Worker checks permissions, and Firestore is reached
through its REST API. Stage 1 uses **synthetic actors and data only**, and the code refuses the production
project id (`havat-ravve`) outside the emulator.

```
assistant ──GET /v1/catalog──▶ Worker ──Firestore REST──▶ Firestore (emulator or a separate test project)
```

## Endpoints

| Method | Path | Operation | Scope |
|---|---|---|---|
| GET | `/v1/health` | health and catalog version (no auth) | |
| GET | `/v1/catalog` | the versioned catalog (no auth, static) | |
| GET | `/v1/people?q=` | `people.search`: candidates, never a guess | `people:read` |
| GET | `/v1/tasks?assignee=&date=&done=&limit=&cursor=` | `tasks.list` | `tasks:read` |
| GET | `/v1/tasks/{id}` | `tasks.get` | `tasks:read` |
| POST | `/v1/actions/tasks.create` | `tasks.create` (Idempotency-Key) | `tasks:create` (+`tasks:assign` to assign someone else) |
| POST | `/v1/actions/tasks.assign` | `tasks.assign` (Idempotency-Key) | `tasks:assign` |

The catalog in [src/catalog.ts](src/catalog.ts) is the source of truth. The same specs validate requests,
so the catalog can't drift from the server.

## How it works

- **Auth** ([src/auth.ts](src/auth.ts)): `Authorization: Bearer <key>`. The server stores only SHA-256
  hashes (`API_CREDENTIALS`) and compares them in constant time. Each key is bound to its own list of
  actors. `X-Actor-Id` can only choose from that list. Roles and scopes come from the registry in code,
  never from the request.
- **Writes** ([src/ops.ts](src/ops.ts)): the idempotency record, the task and its `activity` entries go in
  one Firestore transaction. The record has a create precondition, so racing requests with the same key
  can't both write. The record is keyed by credential, actor, operation and key, and it stores a canonical
  payload hash and the response.
  - Same key and payload: replay.
  - Same key, different payload: 409.
  - Unknown commit outcome: the record is read back before anything is retried, and if it's missing the
    call returns `OUTCOME_UNKNOWN`.
  - Every write ends with a read-back, and `verified` says whether the stored task matches what was sent.
- **Same shape as the app**: a created task has exactly the fields `addTask()` in `src/app/store.ts`
  writes, so the app and its Rules accept it. The test suite checks this with the real Rules.
- **Manager-only tasks**: they are invisible (404) to staff. Their titles never go into `activity`, which
  avoids the leak that `logActivity` + `taskText` has in the app today.
- **Google auth** ([src/firestore.ts](src/firestore.ts)): the Worker signs the service-account JWT with
  WebCrypto (RS256), exchanges it for an access token, and caches it in memory until 60 seconds before
  expiry. It uses no firebase-admin and no gRPC. Tokens and keys are never logged.
- **Quota**: a Firestore 429 becomes a clean `429 QUOTA_EXCEEDED` with `Retry-After` set to Pacific
  midnight, and nothing is half-written.
- **Logs**: one JSON line per request for `wrangler tail`: request id, actor, operation, status, wall ms
  and token source (`fresh`/`cache`/`emulator`).

## Run locally (Stage A)

```bash
npm run test:api      # gate A: starts the Firestore emulator and wrangler dev, runs tests/api.mjs
```

For manual work: copy `.dev.vars.example` to `.dev.vars` (git-ignored), create keys with
`node api/scripts/new-key.mjs cred-local actor-demo-owner`, and run `npm run dev` in one shell and
`npm run api:dev` in another.

## Gate A results (local, 2026-11-12)

`npm run test:api`: **66 passed, 0 failed.** The suite covers:

- health and catalog
- auth: 401, scope 403, `X-Actor-Id` spoof 403 with no write, unknown actor
- validation: unknown fields, relative or impossible dates, missing or non-UUID key
- idempotency: replay, cross-credential isolation, 409 with no write
- read-back and same-transaction activity
- pagination: 60 tasks in pages of 25 = 25/25/10, each task exactly once, cursor bound to its filters
- ambiguous name search
- 5 parallel identical requests: one task
- lost acknowledgement: reconciled
- commit that never arrived: `OUTCOME_UNKNOWN`, and a retry writes once
- simulated quota: 429 with `Retry-After`
- app compatibility through the Rules, and `api_idempotency` unreadable by clients
- JWT signature verified by a mock token endpoint: one exchange, then cache
- no secrets in logs
- production project locked

Wall time measured from the client, local `wrangler dev` plus emulator, 20 sequential calls each:

| operation | mean ms | p95 ms |
|---|---|---|
| tasks.create (with assignee, read-back) | 8.2 | 11.5 |
| tasks.list (20 items) | 4.6 | 6.4 |
| tasks.get | 3.1 | 4.7 |
| people.search | 3.9 | 5.0 |
| tasks.create, 10 in parallel | 34.4 | 42.9 |
| tasks.create, 5 in parallel with the same key | 4127 | 4147 |

These numbers prove the logic, not production latency. The emulator is local, and its lock handling makes
same-key races slow (around 4 s, then all five resolve to one task). Real CPU time can't be measured
locally. That needs Stage B.

## Not proven yet

- **Stage B** (real Google OAuth, real CPU against the 10 ms limit, a deployed `workers.dev` URL) is
  blocked on two steps that are Meni's:
  1. `npx wrangler login` with a Cloudflare account. Then `npx wrangler deploy --config api/wrangler.toml`.
  2. A separate Spark test project (not `havat-ravve`) with Firestore enabled and a service account with
     only `roles/datastore.user`. Its JSON key goes in with `npx wrangler secret put GCP_SERVICE_ACCOUNT`,
     its project id goes in `FIRESTORE_PROJECT_ID`, and `API_CREDENTIALS` is set with
     `wrangler secret put`.

  After that, measure cold (fresh token) against warm (cache) with `npx wrangler tail` and the
  dashboard's CPU metrics.
- **Gate B (the assistant calling this API)**: not proven. No official Instinct documentation of custom
  HTTP tools, webhooks or MCP servers was found. One developer reports the assistant saying it can't
  connect a custom MCP server. The probe, once there's a deployed URL: ask the assistant to fetch
  `/v1/catalog`, then to call `GET /v1/tasks` with an `Authorization` header holding a synthetic key. If it
  can't send that header from a secret it holds, there's no authenticated channel, and this stays blocked.
  No unverified bridge (a Sheet relay, browser automation) gets built in its place.
- Composite indexes for `tasks.list` filters on a real project (the emulator doesn't need them). Stage B
  will show which ones Firestore asks for.
