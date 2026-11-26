# Google Play

The Android application uses Capacitor and loads its interface, icons and fonts from the installed package. Android 1.0.5 and later can also receive signed WebView assets over the air. Native changes, permissions and plugins still ship through Google Play. Firebase provides online sign-in and shared data. Firestore persists previously synced data and queues supported writes locally. A new install needs a connection to sign in and download shared records.

## Build and sign

- Package `com.menis10tec.havatravve` must stay the same for Play updates. Increment `versionCode` and set `versionName` in `android/app/build.gradle` for each release.
- Use Node 22, JDK 21, and Android SDK API 36. Run `npm ci`, `npm run build:android`, then `cd android && ./gradlew assembleRelease bundleRelease`.
- Sign the APK for direct testing and the AAB for Play with the existing upload keystore outside git. Play signs the APK that it distributes to users. The direct APK and Play APK will update each other only if their signing certificates match.
- Firebase Google sign-in uses the Firebase Android app for this package and requires registration of the local test or Play signing certificate's SHA-1. The public client config is `android/app/google-services.json`. Keep private keys and passwords outside git.
- Android App Links for the HTTPS `/app` paths use `public/.well-known/assetlinks.json`, served by Firebase Hosting.
- Run `npm run play:check` after the build and verify offline startup, touch navigation and an actual account sign-in on Android before promoting to the closed track.

## Android web updates

Each Play versionCode has its own GitHub Releases channel, tagged `android-ota-<versionCode>`. The included web bundle opens offline. Once the app renders, it checks the channel for a signed `current.json` and downloads the corresponding ZIP over HTTPS. Android checks the checksum before it installs the assets. Activation happens after the current session backgrounds or the app restarts. If the updated interface fails to report readiness, the updater restores the last working bundle.

1. Use the release branch that matches the target Play versionCode. Make web-only changes that remain compatible with the native plugins and backend already in use.
2. Run `npm run build:android:ota -- <versionCode> <revision> <private-key-path>`. The revision is a positive integer that increases within the channel. Store the signing key outside Git and share it only with the release owner. The built-in public key verifies the app ID, native build, revision and ZIP checksum together.
3. Upload `web-<revision>.zip` to the release first. Confirm the public download matches the signed checksum. Then upload or replace `current.json` from the same output directory. Retain old ZIPs while devices may still be downloading them.
4. Verify on Android that opening the app downloads the revision and leaving and reopening activates it. Check offline startup afterward. To undo an already activated rollout, publish the last known good web assets with a higher revision. Removing `current.json` stops future downloads.

The channel carries installed-app web assets only. The website and iOS use their own release paths.

## Account deletion

In the app: My account → "מחיקת החשבון" (`/app/delete-account`, also the public web link for Play). The request is `account_deletions/{uid}` with the server's time; the account is locked and shows a cancel button. After 30 days the Worker cron (`api/src/accounts.ts`) deletes the Firebase Auth user, the profile and the request, and replaces names, phones and notes on the person's tickets, visits, donations and stall accounts. Amounts and dates stay. The Worker's service account needs permission `firebaseauth.users.delete` (custom role `authUserDeleter`).

## Publishing

Use the internal test track first. For the initial public release, Google requires at least 12 testers opted into the closed test for 14 consecutive days before a production-access application. [Google Play requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
