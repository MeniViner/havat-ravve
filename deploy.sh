#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node -e "if(Number(process.versions.node.split('.')[0])<22){console.error('Install Node.js 22 or newer first.');process.exit(1)}"
npm ci
npx firebase login
npm run deploy
