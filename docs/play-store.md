# Google Play

The Android application uses Capacitor and loads its interface, icons and fonts from the installed package. Updates to the packaged interface require a new Android version in Play. Firebase provides online sign-in and shared data. Firestore persists previously synced data and queues supported writes locally. A new install needs a connection to sign in and download shared records.

## Build and sign

- Package `com.menis10tec.havatravve` must stay the same for Play updates. Increment `versionCode` and set `versionName` in `android/app/build.gradle` for each release.
- Use Node 22, JDK 21, and Android SDK API 36. Run `npm ci`, `npm run build:android`, then `cd android && ./gradlew assembleRelease bundleRelease`.
- Sign the APK for direct testing and the AAB for Play with the existing upload keystore outside git. Play signs the APK that it distributes to users. The direct APK and Play APK will update each other only if their signing certificates match.
- Firebase Google sign-in uses the Firebase Android app for this package and requires registration of the local test or Play signing certificate's SHA-1. The public client config is `android/app/google-services.json`. Keep private keys and passwords outside git.
- Android App Links for the HTTPS `/app` paths use `public/.well-known/assetlinks.json`, served by Firebase Hosting.
- Run `npm run play:check` after the build and verify offline startup, touch navigation and an actual account sign-in on Android before promoting to the closed track.

## Account deletion

In the app: My account → "מחיקת החשבון" (`/app/delete-account`, also the public web link for Play). The request is `account_deletions/{uid}` with the server's time; the account is locked and shows a cancel button. After 30 days the Worker cron (`api/src/accounts.ts`) deletes the Firebase Auth user, the profile and the request, and replaces names, phones and notes on the person's tickets, visits, donations and stall accounts. Amounts and dates stay. The Worker's service account needs permission `firebaseauth.users.delete` (custom role `authUserDeleter`).

## Publishing

Use the internal test track first. For the initial public release, Google requires at least 12 testers opted into the closed test for 14 consecutive days before a production-access application. [Google Play requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
