# Round 1.1 verification (Part A: the app)

Local demo (`node scripts/dev.mjs`), Claude's built-in browser with emulated viewports. Screenshots are kept outside the repository. Node 22.22, OpenJDK 27 for the Firestore emulator.

Automated: both typechecks, the build, `npm test` (core, demo, Today ordering), `npm run test:rules` (rules, rules-app incl. the new managers-only activity and eventId checks), `npm run test:api` (269 Worker assertions) all pass. The browser console showed no errors or React warnings.

## Stage 1: managers-only task activity

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Rules: volunteer cannot get or list `task_private` by id, refId, kind, actor or subject (even as assignee) | staff | rules test | Pass |
| Rules: volunteer still reads an open task's history; manager reads both kinds | staff, manager | rules test | Pass |
| Rules: only a manager may move an entry between `task` and `task_private`, and only the `kind` field | staff, manager | rules test | Pass |
| Worker: manager-only task logs as `task_private`; staff get nothing by refId or kind; edit moves history both ways | staff, manager | API test | Pass |
| Managers-only task shows its history to a manager | manager | 390×844 | Pass |
| Managers-only task is not found for a volunteer | staff | 390×844 | Pass |
| Activity feed "משימה" filter includes managers-only entries, labelled "משימת מנהלים" | manager | 390×844 | Pass |

## Stage 2: Today keeps open tasks visible

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Free group with 10 completed (more than its 8 rows): all 6 open visible first, "ועוד 8 שבוצעו היום · לכל המשימות" | staff | 390×844 | Pass |
| Same group at 12 rows: 6 open + 6 completed, "ועוד 4" | staff | 1280×800 | Pass |
| "עליך · N" header equals the tile (open only) | staff | 390×844, 1280×800 | Pass |
| Unit: open before completed, open rows never cut, hidden count | n/a | demo test | Pass |

## Stage 3: ticket totals hidden from volunteers

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Event hub: no "נכנסו"/"כרטיסים" tiles, strip reads "הנתונים במכשיר. הסריקה והדוכן עובדים בלי קליטה." | staff | 390×844, 1280×800 | Pass |
| Scan screen subtitle: "עובד בלי קליטה" only | staff | 390×844 | Pass |
| Scan result overlay: no "X מתוך Y" | staff | 390×844 | Pass |
| Gate search subtitle: event title only | staff | 390×844 | Pass |
| Stall accounts: open-accounts count only, no ₪ totals | staff | 390×844 | Pass |
| Hub, scan subtitle and stall accounts still show every total | manager | 390×844 | Pass |

## Stage 4: tasks linked to an event

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Saturday tour → "משימות לאירוע" shows only its 3 tasks, with a removable chip | staff | 390×844 | Pass |
| "הוספה" from the filtered list pre-selects the event; the new task appears in the filter | staff | 390×844 | Pass |
| Chip "כל המשימות" clears the filter and restores the tabs | staff | 390×844 | Pass |
| Event with no linked tasks: clear empty state | staff | 390×844 | Pass |
| Desktop table filtered; opening a row keeps the filter; detail shows "אירוע" with "כל ההכנות" | manager | 1280×800 | Pass |
| Rules: optional string `eventId` (≤60), creator can unlink, manager can link | staff, manager | rules test | Pass |
| Worker: tasks.create with eventId, unknown event → 400, tasks.edit clearEvent | staff | API test | Pass |

## Round 1 regression

| Check | Persona | Viewport | Result |
| --- | --- | --- | --- |
| Tap on a stall guest lands on the product grid | staff | 390×844 | Pass |
| Gate search matches from the first character | staff | 390×844 | Pass |
| Today tile "פנויות X מתוך Y" | staff | 390×844, 1280×800 | Pass |
| Calendar opens from navigation | staff | 390×844 | Pass |
| Guest event page shows no registered count | guest | 390×844 | Pass |

Not verified here: anything that needs a physical phone (camera, autofocus, native install, gate use without reception).

# Part B: Worker configuration and payment-confirmation email

## Stage 5: live bindings in `api/wrangler.toml`

| Check | Result |
| --- | --- |
| Live version `3336fb66` bindings: TOKEN_KV, FILE_BUCKET (R2 `havat-ravve-files`), RATE_LIMITER, AUTH_LIMITER, FIRESTORE_PROJECT_ID, PRODUCTION_APPROVED | Read with `wrangler versions view` |
| `FILE_BUCKET` was the only live binding missing from the file; added with a comment | Pass |
| `wrangler deploy --dry-run` lists the same six bindings (plus `EMAIL_ENABLED` after Stage 6) | Pass |
| Secrets (names only): API_CREDENTIALS, GCP_SERVICE_ACCOUNT, BREVO_API_KEY, BREVO_SENDER_EMAIL; recorded in the file header, values never in git | Pass |

## Stage 6: automatic payment-confirmation email (Brevo)

| Check | Where | Result |
| --- | --- | --- |
| Switch off: nothing queued, nothing sent, no outbox state | API test | Pass |
| First run starts at now; a payment settled before it is never mailed | API test | Pass |
| Worker `tickets.setOrderPayment` stamps `paidAt` with the server time | API test | Pass |
| One paid order → exactly one email, Brevo message id recorded | API test | Pass |
| Content: settings template, Hebrew RTL HTML + text, escaped, no "receipt" or "invoice" | API test | Pass |
| api-key header, configured sender, UUID idempotency key | API test | Pass |
| WhatsApp preference → nothing sent (skipped) | API test | Pass |
| Address Brevo rejects → failed after one call, no retry | API test | Pass |
| Rate limited (429) → queued, retried and sent on the next run | API test | Pass |
| Manual confirmation before the claim → cancelled, nothing sent | API test | Pass |
| Settling the same order again plus more runs → nothing sent again | API test | Pass |
| Self-test: exactly one sample mail to the sender address over every run | API test | Pass |
| 51 payments sharing one server time → all queued across two runs (paging never stalls) | API test | Pass |
| Request logs carry no Brevo key and no addresses | API test | Pass |
| Rules: `paidAt` only on a settling write, only `request.time`, never on create, not by a guest claim | rules test | Pass |
| Rules: old clients without `paidAt` still settle (gate `paid_onsite`) | rules test | Pass |
| Rules: guests, volunteers and signed-out users cannot read the outbox; nobody writes it from the app; managers read it | rules test | Pass |
| Worker-written tickets, tabs and donations (now with `paidAt`) still pass the app's rules when rewritten as stored | API test | Pass |
| Manager donation page shows "נשלח במייל אוטומטית · time · address" and "מייל אוטומטי לא נשלח · ההעדפה היא וואטסאפ" (demo data) | 390×844, 1280×800 | Pass |
| Payment-confirmation block on donation and tab pages had no side gutter (`.pad` had no CSS rule since round 1); fixed | 390×844 | Pass |

Automated totals: `npm test` 4/4 suites, `npm run test:rules` 3/3 suites, `npm run test:api` 285 passed, 0 failed. An independent review found six defects (scan paging could stall, off→on within a day mailed the backlog, retries could outlast Brevo's idempotency window, endless re-claims after an internal failure, an overlapping run could overwrite an outcome, undoing a cancellation lost the email); all fixed before release.
