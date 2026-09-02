#!/usr/bin/env bash
# Owner round 3 prod ops (Task 25-a / 25-d), via live API as mall admin:
#   1. login asha (MALL_ADMIN)
#   2. list staff  → find bhagya@gmail.com + diag-qa throwaway
#   3. overview    → find "milk products" store id
#   4. REASSIGN bhagya → STORE_MANAGER @ milk products
#   5. DELETE diag-qa (already deactivated → removable)
#   6. verify staff list
set -uo pipefail
BASE="https://notifetch.in"
JAR="/tmp/nf-asha3.jar"

code() { curl -s -o /tmp/nf3.json -w '%{http_code}' "$@"; }
jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo PARSE_FAIL; }

echo '── 1. mall admin login'
C=$(code -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"asha@seatserve.demo","password":"demo1234"}')
echo "login=$C"

echo '── 2. staff list → bhagya + diag ids'
C=$(code -b "$JAR" "$BASE/api/admin/staff")
echo "staff=$C"
cat /tmp/nf3.json > /tmp/nf3-staff.json

echo '── 3. overview → milk products store id'
C=$(code -b "$JAR" "$BASE/api/admin/overview")
echo "overview=$C"
cat /tmp/nf3.json > /tmp/nf3-overview.json

BHAGYA_ID=$(python3 -c "import json;d=json.load(open('/tmp/nf3-staff.json'));print(next(s['id'] for s in d['data']['staff'] if (s.get('email') or '')=='bhagya@gmail.com'))")
DIAG_ID=$(python3 -c "import json;d=json.load(open('/tmp/nf3-staff.json'));m=[s['id'] for s in d['data']['staff'] if (s.get('email') or '').startswith('diag-qa@')];print(m[0] if m else 'NOT_FOUND')")
MILK_ID=$(python3 -c "import json;d=json.load(open('/tmp/nf3-overview.json'));print(next(s['id'] for s in d['data']['stores'] if s['name'].strip().lower()=='milk products'))")
echo "bhagya=$BHAGYA_ID diag=$DIAG_ID milk=$MILK_ID"

echo '── 4. REASSIGN bhagya → STORE_MANAGER @ milk products'
C=$(code -b "$JAR" -X PATCH "$BASE/api/admin/staff/$BHAGYA_ID" -H 'Content-Type: application/json' \
  -d '{"action":"REASSIGN","role":"STORE_MANAGER","storeId":"'"$MILK_ID"'"}')
echo "reassign=$C body=$(head -c 200 /tmp/nf3.json)"

echo '── 5. DELETE diag throwaway'
if [ "$DIAG_ID" = "NOT_FOUND" ]; then echo "already gone"; else
  C=$(code -b "$JAR" -X DELETE "$BASE/api/admin/staff/$DIAG_ID")
  echo "delete=$C body=$(head -c 160 /tmp/nf3.json)"
fi

echo '── 6. verify staff list'
C=$(code -b "$JAR" "$BASE/api/admin/staff")
python3 -c "import json;d=json.load(open('/tmp/nf3.json'));[print('-',s['name'],s['email'],s['role'],'@',s.get('storeName') or s.get('cinemaName') or 'mall','active' if s['isActive'] else 'DISABLED') for s in d['data']['staff']]"
