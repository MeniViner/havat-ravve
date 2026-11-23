# App Store (iPhone)

The iPhone app is the team/guest app (`/app`) packed into a native shell with [Capacitor](https://capacitorjs.com) 8.
Same package name as Android: `com.menis10tec.havatravve`. Display name "חוות רווה". iPhone only (no iPad), portrait.

## Why not a thin wrapper like Android

The Android app is a Trusted Web Activity: Chrome shows the live site. iOS has nothing like it, and a plain web view
fails three ways:

1. **Google refuses to sign in inside an embedded web view** (`disallowed_useragent`). The app signs in with the
   native Google sheet and hands the credential to the Firebase JavaScript SDK (`signInWithCredential`).
2. **App Store guideline 4.8**: an app that signs in with Google must offer an equal privacy-friendly option.
   The app offers Sign in with Apple next to Google, inside the iPhone app only.
3. **Guideline 4.2** (minimum functionality) rejects apps that are just a website. The app ships its own files,
   opens with no reception (the farm has none), and uses the camera, location and photos natively.

So the web part is **packed into the app** (`.build/native`, copied to `ios/App/App/public`). It does not update
with a website deploy: a change reaches iPhones with the next App Store build. (A later step can add live updates.)

## How the code is split

| Where | What |
| --- | --- |
| `capacitor.config.json` | App id, name, web folder, plugin settings (`skipNativeAuth`, Google + Apple), SPM traits (no Facebook SDK) |
| `scripts/build-native.mjs` | Packs `dist/app.js`, `app.css`, `assets/` and `app.html` (as `index.html`, without the web manifest tags) |
| `src/app/native.ts` | `isNative`, `publicOrigin()`, the native sign-in plugin by name, links to the website open in Safari |
| `src/app/firebase.ts` | On native: `initializeAuth` with IndexedDB, Google and Apple through the native sheets; closing a sheet is not an error |
| `src/app/v2/screens/guest/parts.tsx` | Sign in with Apple alongside Google on the sign-in screens inside the iPhone app |
| `firestore.rules` | `account()` accepts `google.com` and `apple.com` for the team app. The website editor (`cms_*`) and the owner bootstrap stay Google only |
| `api/src/files.ts` | The Worker accepts uploads from `capacitor://localhost` |
| `ios/` | The Xcode project (Swift Package Manager, no CocoaPods) |

Inside the app: no service worker, no "add to home screen" hints, phone push shows "not on yet" (Web Push does not
exist in an iOS web view; native push is a later step), share links use `https://havat-ravve.web.app`.

The website is unchanged: every native branch is behind `isNative`, and the Apple button never shows on the web.

## Build

```sh
npm run build:ios      # dist/ → .build/native → ios/App/App/public, and Swift packages
npm run ios:open       # opens Xcode
```

In Xcode: pick the team under Signing & Capabilities, then Product → Archive → Distribute → App Store Connect.
Raise the build number (`CURRENT_PROJECT_VERSION`) for every upload, and `MARKETING_VERSION` for each release.

### Simulator smoke test

Run Product → Test on a signed-out iPhone simulator. The shared App scheme checks both sign-in options and the tasks and shopping screens in the team demo. From the command line:

```sh
npm run build:ios
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'platform=iOS Simulator,id=<simulator UDID>' \
  CODE_SIGNING_ALLOWED=NO test
```

## What is left (in order)

### 1. On this Mac

- **Xcode** from the Mac App Store (about 15 GB), then:
  `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` and open it once to install the iOS platform.

### 2. Apple Developer Program (99 USD a year, or free for the עמותה)

- Chosen route: **Organization for the עמותה with a fee waiver**. Apple waives the yearly fee for nonprofits, and
  Israel is an eligible country ([fee waiver](https://developer.apple.com/support/fee-waiver)). Conditions: enrolled
  as a legal entity (not a person), a free app with no in-app purchases, Apple reviews each request. Steps: a D-U-N-S
  number for the עמותה (free, about two weeks), enrolment as an organization signed by someone the עמותה authorizes,
  then the waiver request.
- A free Apple ID (no program) only installs on the developer's own iPhone, for 7 days, without Sign in with Apple:
  good for a first test, not for the team.
- In Certificates, Identifiers & Profiles: App ID `com.menis10tec.havatravve` with the **Sign in with Apple**
  capability (the entitlement is already in `ios/App/App/App.entitlements`).
- In App Store Connect: a new app with that bundle id, primary language Hebrew.

### 3. Firebase (project havat-ravve)

- Done 2026-11-22: iOS app "Havat Ravve iOS" (`1:714901430354:ios:6d851046751ed62a3a3f8b`), bundle id
  `com.menis10tec.havatravve`. `GoogleService-Info.plist` is in `ios/App/App/` and in the App target's resources
  (without it the app closes on launch, since the plugin calls `FirebaseApp.configure()`). `Info.plist` has a URL type
  with its `REVERSED_CLIENT_ID`, where Google sign-in returns. To download it again:
  `firebase apps:sdkconfig IOS 1:714901430354:ios:6d851046751ed62a3a3f8b --out ios/App/App/GoogleService-Info.plist`
- Done 2026-11-22: the **Apple** sign-in provider is on (Google was already on). For iOS only, no Services ID or key
  is needed.
- Check on a phone that an Apple account's token has `email_verified: true` (the rules require it). Firebase
  marks Apple emails as verified; if not, Apple sign-ins will be refused everywhere.

### 4. Check on a real iPhone (TestFlight)

Google and Apple sign-in, onboarding, ticket order and the QR, scanning with the camera at the gate, task photo and
location, offline open and offline writes, file uploads (the Worker must be deployed with the new origin),
links to the website and to WhatsApp, `.ics` and CSV downloads (WKWebView may not save blob downloads), account
deletion, sign-out and signing in with another account.

Apple account deletion also needs token revocation. Configure Apple's OAuth code flow in Firebase and verify revocation
with a real Apple account before App Store review. The current deletion request schedules account and data deletion in Firestore.

### 5. App Store Connect listing

- Screenshots: 6.9" iPhone (1320×2868) at least; the Play screenshots came from demo mode and can be redone at that size.
- Privacy policy URL (`/app/terms`), support URL, the App Privacy answers (same data as the Play data safety form).
- **Review notes**: the demo link `https://havat-ravve.web.app/app?demo=owner`, or a Google test account with a
  team role, so the reviewer can see the team side. Explain that the team signs in with Google accounts the farm
  invites, guests with Google or Apple.
- Account deletion is in the app (My account → "מחיקת החשבון"), which guideline 5.1.1(v) requires.

## Review risks to keep in mind

- **Donations (3.2.1)**: only approved nonprofits may take donations inside the app. Today the app records a
  pledge and the farm handles payment outside the app, with no payment in the app. If a payment gateway is added
  for donations, donations in the iPhone app must open in Safari instead (or the עמותה applies to Apple).
- **Tickets and visits** are physical services, so paying for them outside Apple's in-app purchase is allowed.
- **Rules budget**: one event-day rule (walk-in, pay later) sits close to Firestore's 1000-expression limit. The
  Apple change was kept cheap (the owner check tests the email first); watch it when rules grow.

## Later

- Native push through FCM: `@capacitor-firebase/messaging`, an APNs key in Firebase, devices saved as
  `kind: 'fcm'` (the Worker's `PUSH_MODE=fcm` sender already exists, but sends data-only messages for the service
  worker; iOS needs a `notification` / `apns` payload).
- Universal links (`/app/events/...` opens the app): Associated Domains + `apple-app-site-association` on hosting.
- Live updates of the packed web part without a new App Store build.
