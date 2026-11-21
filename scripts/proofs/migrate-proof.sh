# Emulator-only proof that scripts/migrate-redesign.mjs is safe to rerun (see docs/migration-redesign.md).
set -e
B="http://$FIRESTORE_EMULATOR_HOST/v1/projects/demo-havat-ravve/databases/(default)/documents"
put() { curl -s -X PATCH "$B/$1" -H 'content-type: application/json' -H 'authorization: Bearer owner' -d "$2" > /dev/null; }
put vendors/v1 '{"fields":{"name":{"stringValue":"גבינות"},"notes":{"stringValue":"משלם במזומן"}}}'
put vendors/v2 '{"fields":{"name":{"stringValue":"דבש"},"notes":{"stringValue":""}}}'
put vendors/v3 '{"fields":{"name":{"stringValue":"לחם"},"notes":{"stringValue":"חדש"}}}'
put vendors/v3/private/main '{"fields":{"notes":{"stringValue":"ישן"}}}'
put events/e1 '{"fields":{"title":{"stringValue":"יריד"}}}'
put events/e1/vendors/v1 '{"fields":{"notes":{"stringValue":"דוכן 3"}}}'
echo "=== dry run"; node scripts/migrate-redesign.mjs
echo "=== apply"; node scripts/migrate-redesign.mjs --apply
echo "=== apply again"; node scripts/migrate-redesign.mjs --apply
echo "=== state"
for p in vendors/v1 vendors/v1/private/main vendors/v3 vendors/v3/private/main; do printf "%s: " $p; curl -s "$B/$p" -H 'authorization: Bearer owner' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).fields.notes)))'; done
