# Automatic payment confirmation email

Round 1 gives managers WhatsApp and email draft links and a record of who confirmed sending. The farm owner and accountant decide the requirements for any formal receipt. This design covers automating the payment confirmation message.

## Sender and cost

Use the existing Cloudflare Worker to process a small Firestore outbox on a Cron Trigger. Resend's transactional free tier includes 3,000 emails per month and caps sends at 100 per day. Confirm that the farm controls a sending domain before selecting it. Resend requires a verified domain with DNS access for SPF and DKIM. An existing domain can use a dedicated sending subdomain with a monitored reply address. [Resend pricing](https://resend.com/pricing?product=transactional) · [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)

The Worker and Firestore can stay on their current free plans at low volume. Workers Free allows five Cron Triggers per account, 10 ms CPU and 50 subrequests per invocation for external requests. Limit and measure each batch, including Firestore reads and writes, before choosing the schedule. At the email cap, leave work queued for the next delivery window and show the delay to managers. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Delivery flow

1. Enqueue after the authoritative payment moves to settled. Ticket orders use `paid` or `paid_onsite`. Donations and stall accounts use `paid`. Treat an order as one payment using its `orderId` and use the donation or account ID for the other types. Include both the app and Worker paths that can settle payments. A guest's transfer report leaves payment awaiting verification.
2. Check the guest's current email preference and valid profile address at send time. Keep WhatsApp and missing-address cases in the manager workflow. Only include the payment details already present in the manual confirmation template. The sender key stays in the Worker, with outbox writes limited to the payment transition and sender status updates restricted to authorized actors.
3. Claim each job with a lease and use a stable idempotency key per payment. Record the provider ID after acceptance. Retry network errors and rate limits with bounded backoff. Resend deduplicates a key for 24 hours. Keep the farm's send record beyond that window, and surface ambiguous older attempts for review before retrying. [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
4. Keep separate audit states for a manager's manual confirmation, provider acceptance and confirmed delivery or bounce if verified delivery events are added. A manual send recorded before the Worker claims the job ends automated processing for that payment.

Before implementation, the owner can verify domain access and expected event-day email volume. Test the sender with a sandbox address, replay the same payment twice, exercise manual confirmation and a broken address, and verify that delayed jobs survive quota limits. Production sender setup and credentials are outside this round.
