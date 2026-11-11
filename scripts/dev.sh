#!/usr/bin/env bash
# Local development: builds dist/ and serves it with the Firebase emulators (hosting, firestore, auth).
# Open http://localhost:5050/app?emulator — the ?emulator flag makes the app talk to the emulators instead of production.
set -e
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npm run build
mkdir -p .emulator-data
exec npx firebase emulators:start --only hosting,firestore,auth --project demo-havat-ravve --import=.emulator-data --export-on-exit
