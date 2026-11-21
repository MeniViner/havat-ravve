#!/usr/bin/env bash
# Runs inside `firebase emulators:exec --only firestore,auth --project demo-havat-ravve`:
#   npx firebase emulators:exec --only firestore,auth --project demo-havat-ravve "bash scripts/proofs/files-proof.sh"
# Starts the app (dev build) and the Worker under wrangler dev against the emulators, seeds, runs the proof, stops both.
set -u
APP_PORT=5181; API_PORT=8797
PERSIST=$(mktemp -d)
PORT=$APP_PORT node scripts/dev.mjs > /tmp/files-proof-app.log 2>&1 & APP=$!
npx wrangler dev --config api/wrangler.toml --ip 127.0.0.1 --port $API_PORT --inspector-port 9797 --persist-to "$PERSIST" --show-interactive-dev-session=false \
  --var FIRESTORE_PROJECT_ID:havat-ravve --var FIRESTORE_EMULATOR_HOST:127.0.0.1:8080 --var FIREBASE_AUTH_EMULATOR_HOST:127.0.0.1:9099 --var AUTH_EMULATOR_PROJECT:demo-havat-ravve \
  --var EMAIL_ENABLED:false --var API_CREDENTIALS:[] --var FILES_PUBLIC_BASE:https://havat-ravve-api.meniviner.workers.dev > /tmp/files-proof-api.log 2>&1 & API=$!
for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$API_PORT/v1/health" >/dev/null && curl -sf "http://localhost:$APP_PORT/app" >/dev/null && break; sleep 0.5; done
node scripts/smoke-seed.mjs > /dev/null && BASE="http://localhost:$APP_PORT" FILES_API="http://127.0.0.1:$API_PORT" node scripts/proofs/files-proof.mjs; CODE=$?
kill -- $APP $API 2>/dev/null; pkill -f "wrangler dev --config api/wrangler.toml --ip 127.0.0.1 --port $API_PORT" 2>/dev/null; pkill -f "workerd.*$API_PORT" 2>/dev/null
rm -rf "$PERSIST"
exit $CODE
