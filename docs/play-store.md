# Google Play (Trusted Web Activity)

The Android app is a thin Trusted Web Activity (TWA) around `https://havat-ravve.web.app/app`, built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). It adds no server and no paid service. The app stays the website: every deploy updates the Android app too, with no new upload.

Check readiness with `npm run build && npm run play:check` (add `-- --live` to fetch the production site, `-- --strict` to fail on owner items). Statuses: `pass`, `fail` (fix in code), `owner` (needs the farm owner), `pending` (a later step).

## Files

| File | Purpose |
| --- | --- |
| `android/twa-manifest.json` | Bubblewrap config: package name, host, colors, icons, signing key path, fingerprints |
| `scripts/build.mjs` | Writes `dist/.well-known/assetlinks.json` from the fingerprints, only once there is at least one |
| `firebase.json` | Hosting no longer skips dot folders (`.well-known`), and serves `assetlinks.json` as JSON |
| `scripts/play-check.mjs` | The readiness checks |

The signing key (`*.keystore`, `*.jks`) never enters git; `.gitignore` covers it and the check fails if one is tracked.

## Owner steps

1. Open a Google Play developer account (one-time fee, paid by the owner).
2. Approve the package name. It is permanent once uploaded. Proposed: `app.web.havat_ravve.twa`.
3. Decide the store name. The manifest says "חוות רווה · צוות", but guests use the app too (tickets, donations).
4. Create the upload key on the owner's machine: `npx @bubblewrap/cli init --manifest android/twa-manifest.json`, then `npx @bubblewrap/cli build`. Keep the keystore and its passwords outside the repository.
5. Add both SHA-256 fingerprints (upload key, and Play App Signing key from Play Console → Setup → App signing) to `fingerprints` in `android/twa-manifest.json`, build and deploy. Without them the app opens with a browser bar.
6. Legal review of the privacy text at `/app/terms`, then remove "טיוטה".
7. Account deletion. Play requires both a way to request deletion inside the app and a public web page for it, because users sign in and get an account. Today the terms only say to ask the managers. This is a product decision.
8. In Play Console: Data safety form, content rating, target audience, store listing (icon 512, feature graphic 1024×500, phone screenshots).

New apps must target Android API 36. The check reads `targetSdk` from the generated Android project once it exists. [Target API level requirements](https://developer.android.com/google/play/requirements/target-sdk), [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
