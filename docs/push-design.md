# Background push for new farm events

The app shows new publication badges in the guest event list. Background push would add an optional notification for an event's publication, using the existing app service worker for reception and a trusted scheduled sender for delivery. Retain the in-app list as the destination and source of event details.

## Free sender options

| Option | How it runs | Cost and tradeoff |
| --- | --- | --- |
| Cloudflare Worker Cron and standard Web Push | Use browser `PushSubscription` records and send encrypted notifications directly to the subscriptions' browser push services. Keep the VAPID private key in the sender. | Uses the existing Workers Free and Firestore Spark quotas. The Worker owns encryption, retries and expired endpoints. WebKit documents standards-based Web Push for Home Screen apps. [VAPID standard](https://www.rfc-editor.org/info/rfc8292/) · [WebKit on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) |
| Cloudflare Worker Cron and Firebase Cloud Messaging | Register browser tokens with the Firebase web SDK and send via the FCM HTTP v1 API from the trusted Worker. Use the app's service worker registration. | FCM is free. The Worker still uses Firestore and Cloudflare quotas and needs server-side credentials. Validate the SDK on the actual installed iPhone PWA before choosing this route. [FCM pricing](https://firebase.google.com/products/cloud-messaging) · [FCM web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started) · [FCM trusted sender](https://firebase.google.com/docs/cloud-messaging/server-environment) |

Both designs need bounded batches within the free Worker limits, including 10 ms CPU and 50 external subrequests per scheduled invocation and five Cron Triggers per account. Start the prototype with standard Web Push if the farm prioritizes direct iPhone support. Measure sender CPU and event-day fan-out before picking one. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Permission and delivery

1. On supported devices, display an explanation and an opt-in button in the account screen. Ask for notification permission on that click. On iOS and iPadOS 16.4 or later, Web Push requires an app added to the Home Screen. In the browser, show the install instructions and let the user opt in once they launch it from the Home Screen. A denied permission leads to browser or operating-system settings if the user later wants to enable it. [WebKit permission flow](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
2. Store each subscription or token privately by user and device with the minimum metadata necessary to renew or revoke it. Validate endpoints for the browser push services the sender supports. Provide opt-out in the account screen, revoke the device's association on sign-out and drop endpoints the push service reports as expired.
3. Use a publish transition as the enqueue point and record the event ID and publication timestamp. A retry must reuse the same job, and an edit that leaves an event published does not create another alert. Use a generic Hebrew lock-screen message and an in-app link. The app checks access and fetches the current details after opening the link.
4. Test with actual Chrome on Android and Safari Home Screen on iPhone, including denied permission, sign-out, expiry, a duplicate delivery attempt and opening an event that has since been withdrawn. Use a test environment before choosing a sender and enabling a campaign. This round stops at the design decision.
