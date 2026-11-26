# Phone push: setup

How to turn phone notifications on for the team. The design is in `docs/push-design.md`; the code is
`api/src/push.ts` (the cron drain), `api/src/webpush.ts`, `api/src/fcm.ts`, `src/sw.ts` (`push` and
`notificationclick`) and `src/app/v2/data/push.ts` (the subscription in the app).

Notifications inside the app (the bell, C1) always work, with or without phone push. Phone push is a copy for the
lock screen.

## The one switch: `PUSH_MODE`

| Value | What happens |
| --- | --- |
| not set | Nothing runs and nothing is read. This is the state today. |
| `off` | The Worker writes `settings/push = { mode: 'off' }` once, so the app stops offering phone push. No jobs are read. |
| `webpush` | Standard Web Push. Works on Android (Chrome), on desktop browsers, and on iPhone (iOS 16.4 or later) once the app is added to the Home Screen. **Start with this one.** |
| `fcm` | Firebase Cloud Messaging. Only if Web Push turns out not to work for you. |

The Worker publishes the mode and the public key to `settings/push` on its next cron run (within 5 minutes). The
app reads it, so no app release is needed when you flip the switch. Phones that subscribed under one mode
subscribe again under the new one when the person opens "מה לקבל" and taps "להפעיל".

Set it as a Worker secret, so a deploy never resets it:

```sh
npx wrangler secret put PUSH_MODE --config api/wrangler.toml
# type: webpush
```

To turn push off again, set it to `off`, and leave it that way for at least one cron run.

## Before you turn it on

These pieces live outside this branch and must be in place first:

1. **Firestore rules** (`firestore.rules`):
   - People must be allowed to write the `push` field on their own `users/{uid}` document.
   - Team members must be allowed to create `push_jobs` documents. Only with `createdBy.uid == request.auth.uid`, `sentAt == null` and at most 200 recipients. Nobody reads them from the app.
   - `settings/push` stays write-protected for the app. Only the Worker writes it.

   The exact rules and their tests are in `docs/redesign-data/broadcast.md`.
2. **App release.** The v2 app with `src/app/v2/data/push.ts` and the new `src/sw.ts` must be live, because the service worker shows the notifications.

## Web Push (recommended)

1. **Make the keys once.** Run this on your computer, in the project folder:

   ```sh
   node scripts/push-test.mjs --generate
   ```

   It prints `VAPID_PUBLIC_KEY=...` and `VAPID_PRIVATE_KEY=...`. Do not save them in any file in the repo.
2. **Put them in the Worker** (each command asks you to paste the value):

   ```sh
   npx wrangler secret put VAPID_PUBLIC_KEY  --config api/wrangler.toml
   npx wrangler secret put VAPID_PRIVATE_KEY --config api/wrangler.toml
   npx wrangler secret put VAPID_SUBJECT     --config api/wrangler.toml   # mailto:your-address@gmail.com
   ```

   `VAPID_SUBJECT` is the address the push services (Apple, Google) may write to about this sender.
3. **Flip the switch.** Set `PUSH_MODE` to `webpush`, as described above.
4. **Check it.** Within 5 minutes, `settings/push` in the Firebase console shows `mode: "webpush"` and the public key. `npx wrangler tail --config api/wrangler.toml` shows one line per run, for example `{"cron":"push","mode":"webpush","settings":"published","jobs":0,...}`. The line holds counts only, never addresses or message text.

Keep the same keys forever. A new key pair means every phone has to tap "להפעיל" again.

## FCM (only if needed)

1. In the Firebase console, open Project settings, then Cloud Messaging, then Web Push certificates. Generate a key pair and copy the public key.
2. Make sure the Worker's service account has the "Firebase Cloud Messaging API Admin" role. If you would rather use a separate account, create one and store its JSON key as `FCM_SERVICE_ACCOUNT`. The Worker asks for its own token with the `firebase.messaging` scope only. The Firestore token is never widened.
3. Set the secrets and the switch:

   ```sh
   npx wrangler secret put FCM_VAPID_KEY       --config api/wrangler.toml   # the public key from step 1
   npx wrangler secret put FCM_SERVICE_ACCOUNT --config api/wrangler.toml   # optional, see step 2
   npx wrangler secret put PUSH_MODE           --config api/wrangler.toml   # fcm
   ```

## Installed Android app

The locally bundled Android app registers with Firebase Cloud Messaging (FCM). Chrome and iPhone home screen installations continue to use Web Push with the current VAPID keys.

1. Deploy the Worker with both senders. Configure a dedicated service account with permission to send FCM HTTP v1 messages to this Firebase project. Store its JSON in the Worker secret `FCM_SERVICE_ACCOUNT`. Set `PUSH_ANDROID_FCM=true` and keep `PUSH_MODE=webpush`.
2. Verify the next run publishes `settings/push.androidFcm=true` and keeps the original Web Push mode and public key. The installed app requests Android notification permission from the account settings.
3. Validate a private Android test release on a consenting test device. Check a notification with the app open and in the background. Tap it to verify the destination. Verify Web Push separately before promoting the Android bundle in Play.

To pause native Android delivery, set `PUSH_ANDROID_FCM=false`. Browser push keeps its current mode and keys.

## Testing on a phone

**iPhone (iOS 16.4 or later):**

1. Open the app in Safari, tap Share, then "Add to Home Screen". Open the app from the new icon.
2. Tap the bell, then "מה לקבל", then "להפעיל". Allow notifications when iOS asks.
3. Lock the phone. Ask a manager to send a team broadcast (B1). The notification arrives within 5 minutes. Tapping it opens the app on the right screen.

In a regular Safari tab, the sheet shows "באייפון מקבלים התראות רק אחרי שמוסיפים את האפליקציה למסך הבית". This is expected.

**Android:** the same steps in Chrome. Adding the app to the Home Screen is not needed.

**A direct test to one phone, without the app or the cron:**

1. In the Firebase console, copy the phone's entry from `users/{uid}.push.devices` into a file, for example `device.json`. Keep that file outside the repo.
2. Run:

   ```sh
   VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... \
     node scripts/push-test.mjs --sub=device.json          # prints what it would send
   VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... \
     node scripts/push-test.mjs --sub=device.json --send   # sends one notification
   ```

For FCM, use `FCM_SERVICE_ACCOUNT=./sa.json FCM_PROJECT_ID=havat-ravve node scripts/push-test.mjs --fcm-token=TOKEN --send`.

The script sends one message to one device. It never reads or writes Firestore.

What to try:

- Turn a kind off in "מה לקבל". No push of that kind arrives, but it still shows under the bell.
- Deny permission. The sheet explains how to allow it in the settings.
- Remove the app from the Home Screen. The next push to that phone gets "gone", and the Worker removes the device by itself.
- Send an urgent broadcast. On Android it stays on screen until you open it.

## Limits and behaviour

- **Budget.** Each 5-minute run uses at most 30 outside calls, counting Firestore calls and sends. The free plan allows 50 per run, and email and account deletion use some of them. A big job, like a broadcast to 40 people with phones, continues on the next runs from where it stopped. Each job targets distinct user IDs. A phone must be registered and its notification preferences must allow the kind.
- **Two runs never send the same job.** Each job is claimed under a lease. If a run dies after sending but before recording, the next run may send that slice again. Every push carries the job's tag (`b_<id>` for a broadcast), so the phone replaces the first copy instead of showing two.
- **What the Worker refuses:**
  - jobs older than 6 hours
  - broadcasts not sent by a manager or owner
  - senders who are not active
  - links outside the app (they become the app's first screen)
  - endpoints that are not Apple, Google, Mozilla or Microsoft push services (the device is dropped)
- **Queue status.** A send can write a job while phone notifications are off on the Worker. In-app copies are available independently. The job's existing `delivered` field counts acknowledgements from the push provider. Display on a phone is unknown.
- **Release order for sender copies.** First release Firestore rules that accept self-addressed jobs from roles already allowed to send each kind. The current workflow on main deploys Hosting and rules, so make rules active before serving the new app. Release the Worker separately after the rules are active. Older app versions can keep writing jobs with or without `includeSelf`. Enabling and verifying phone push is a separate operation.
- **What is never stored in the repo:** keys, service-account JSON, and device files.
