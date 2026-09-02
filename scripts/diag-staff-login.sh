#!/usr/bin/env bash
# Controlled staff-login E2E on PROD + repair of bhagya's credentials.
# 1) login as mall admin  2) create throwaway staff  3) login with shown pw
# 4) PATCH reset          5) login with new pw       6) deactivate throwaway
# 7) SET a fresh password for bhagya@gmail.com and PROVE it logs in.
set -uo pipefail
BASE="https://notifetch.in"
JAR="/tmp/nf-asha.jar"
PW_NEW_BHAGYA="Wr4pHouseM0m"

code() { curl -s -o /tmp/nf-out.json -w '%{http_code}' "$@"; }
jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo PARSE_FAIL; }

echo '── 1. mall admin login'
C=$(code -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"asha@seatserve.demo","password":"demo1234"}')
echo "login=$C"

echo '── 2. create throwaway diag account'
C=$(code -b "$JAR" -X POST "$BASE/api/admin/staff" -H 'Content-Type: application/json' \
  -d '{"name":"QA Diag (ignore)","role":"KITCHEN_STAFF","email":"diag-qa@seatserve.demo","phone":"+919812345901","password":"DiagTest7xK","storeId":"'"$1"'"}')
echo "create=$C body=$(head -c 120 /tmp/nf-out.json)"
DIAG_ID=$(jqget "['data']['staff']['id']" < /tmp/nf-out.json)

echo '── 3. login with the exact shown password'
C=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"diag-qa@seatserve.demo","password":"DiagTest7xK"}')
echo "login-new-user=$C"

echo '── 4. PATCH reset throwaway password'
C=$(code -b "$JAR" -X PATCH "$BASE/api/admin/staff/$DIAG_ID" -H 'Content-Type: application/json' \
  -d '{"action":"SET_PASSWORD","password":"DiagReset9zK"}')
echo "reset=$C"

echo '── 5. login with reset password (with + without surrounding space)'
C=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"diag-qa@seatserve.demo","password":"DiagReset9zK"}')
echo "login-after-reset=$C"
C=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"diag-qa@seatserve.demo","password":"DiagReset9zK "}')
echo "login-trailing-space=$C"

echo '── 6. deactivate throwaway'
C=$(code -b "$JAR" -X PATCH "$BASE/api/admin/staff/$DIAG_ID" -H 'Content-Type: application/json' \
  -d '{"action":"DEACTIVATE"}')
echo "deactivate=$C"

echo '── 7. find bhagya + set a fresh password, then PROVE login works'
C=$(code -b "$JAR" "$BASE/api/admin/staff")
BHAGYA_ID=$(jqget "['data']['staff'][0]['id']" < /tmp/nf-out.json)
BHAGYA_ID=$(python3 - << 'EOF'
import json
d = json.load(open('/tmp/nf-out.json'))
m = [s for s in d['data']['staff'] if s.get('email') == 'bhagya@gmail.com']
print(m[0]['id'] if m else 'NOT_FOUND')
EOF
)
echo "bhagya_id=$BHAGYA_ID"
C=$(code -b "$JAR" -X PATCH "$BASE/api/admin/staff/$BHAGYA_ID" -H 'Content-Type: application/json' \
  -d '{"action":"SET_PASSWORD","password":"'"$PW_NEW_BHAGYA"'"}')
echo "bhagya-set-password=$C"
C=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"bhagya@gmail.com","password":"'"$PW_NEW_BHAGYA"'"}')
echo "bhagya-login-with-new-pw=$C"
echo '── done'
