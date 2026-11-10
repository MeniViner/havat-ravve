$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx firebase login
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run deploy
exit $LASTEXITCODE
