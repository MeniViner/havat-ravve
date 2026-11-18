# Automatic payment confirmation email

Managers already have WhatsApp and email draft links, plus a record of who confirmed sending. Round 1.1 adds an automatic email for guests who chose email. It is a payment confirmation only. It is never called a tax receipt or an invoice; the farm owner and accountant decide anything formal.

Code: `api/src/email.ts` (Worker), `firestore.rules` (`email_outbox`, `paidAt`), `src/app/screens/PaymentConfirmation.tsx` (status for managers). Tests: `tests/api.mjs` ("payment-confirmation email"), `tests/rules-app.mjs`.

## Sender and cost

Brevo sends the mail through its transactional API (`POST /v3/smtp/email`). The Brevo free plan covers the expected volume (it has a daily send limit; check the current figure on [Brevo pricing](https://www.brevo.com/pricing/)). The sender address must be a verified sender in Brevo. Brevo recommends authenticating a domain the farm owns (SPF and DKIM). A free-mail sender address (Gmail and similar) is more likely to land in spam.

Everything runs in the existing Cloudflare Worker on the Workers Free plan, on one Cron Trigger every 5 minutes. A run makes at most about 36 subrequests (the free limit is 50): three scan queries, one outbox read and commit, and about five per email for at most five emails. While the switch is off, a run returns before reading anything. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## Configuration

| Name | Kind | Where |
| --- | --- | --- |
| `BREVO_API_KEY` | secret | `npx wrangler secret put BREVO_API_KEY --config api/wrangler.toml` |
| `BREVO_SENDER_EMAIL` | secret (keeps the address out of git) | `npx wrangler secret put BREVO_SENDER_EMAIL --config api/wrangler.toml` |
| `EMAIL_ENABLED` | variable, `"false"` by default | `api/wrangler.toml` `[vars]` |
| `EMAIL_SELF_TEST` | one-off variable, `"once"` | passed only on one deploy: `--var EMAIL_SELF_TEST:once` |

If `EMAIL_ENABLED` is not `"true"` or either secret is missing, nothing is queued and nothing is sent. Turning it on starts from that moment: payments settled earlier are history and are never mailed. The same applies after 20 minutes without a run: while the switch is off nothing is recorded, so turning it back on never mails the payments settled in between. An outage longer than that drops the emails for that gap (managers still have the manual buttons).

## Delivery flow

1. **Settle.** Every write that settles a payment also sets `paidAt` to the server's time (`serverTimestamp()` in the app, `REQUEST_TIME` in the Worker). Ticket orders settle with `paid` or `paid_onsite`; donations and stall accounts settle with `paid`. The app and the Worker both stamp it. The rules allow `paidAt` only on a settling write and only with the server's time. Because the time is the server's, a gate that was offline and syncs an hour later still sorts after the cursor. Scan and stall flows gain no reads and no transactions.
2. **Scan.** Each run reads tickets, donations and stall accounts with `paidAt` after a cursor, overlapping the last two minutes. A full page of 50 continues on the next run strictly after its last document, ordered by time and then document name, because one order or a rush at the gate can share one commit time. It creates one job per payment in `email_outbox`, under a stable id: `order_<orderId>`, `donation_<id>` or `tab_<id>`. Jobs are created with an `exists: false` precondition, and the cursor moves in the same commit. A guest's own transfer report (`claimed`) is not a settle.
3. **Wait.** A job waits 3 minutes before sending. That leaves time for an undo, or for a manager who confirms by hand. Undoing a cancellation re-stamps `paidAt`, so the payment is still confirmed. An order paid ticket by ticket at the gate waits up to 30 minutes for the rest, then confirms what was paid.
4. **Claim and check.** Up to five due jobs per run. Each is claimed with an `updateTime` precondition, a 2-minute lease. At send time the Worker checks again:
   - Is the payment still settled? If not, the job is `skipped` / `not_paid`. Settling it again later requeues it.
   - Did a manager already confirm it by hand? If so, the job is `cancelled` / `manual`.
   - Is the guest's current preference email, with a valid address in the profile (the same check as the app)? If not, the job is `skipped` / `whatsapp`, `no_preference` or `no_address`.
5. **Send.** The email uses the payment-confirmation template from settings, filled with the same values as the manual WhatsApp and email links. It is Hebrew, right to left, in HTML and plain text. The idempotency key is a UUID derived from the job id, so every attempt of one payment carries the same key. Brevo's message id is recorded with the job (`sent`).
6. **Retry.** A rate limit (429), a Brevo error (5xx) or a network failure retries on the following runs, three attempts in all. No attempt starts later than 12 minutes after the first, which keeps it inside Brevo's idempotency window (documented as 15 to 30 minutes), so a retry after a lost response is deduplicated by Brevo. A job that would go past that, including one whose run died mid-send and left its lease to expire, is marked `failed` / `expired` for a manager instead of being sent again. Each outcome is written with the lease's `updateTime` precondition, so an overlapping run can never overwrite it. A Brevo answer of `duplicate_parameter` counts as sent. Any other rejection (for example an invalid address, 400) marks the job `failed` with no retry. Managers then see it next to the manual buttons.

Managers see each payment's job beside the manual actions: queued, sent (with the time and address), failed, or not sent and why. Only managers can read `email_outbox`; the app writes nothing to it.

## Sample email

A deploy with `--var EMAIL_SELF_TEST:once` makes the next cron run send exactly one sample confirmation to `BREVO_SENDER_EMAIL` itself. The guard is a key in `TOKEN_KV` plus a fixed idempotency key. It reads and writes no Firestore data. Check the result with `npx wrangler kv key get --remote --namespace-id d275887525684d4b896d982838dad120 email-self-test-v1`. The next plain deploy drops the variable.
