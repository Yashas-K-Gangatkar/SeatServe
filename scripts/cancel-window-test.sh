#!/bin/bash
# SeatServe — cancel-before-accept window test (owner feature).
# 1. order → pay → customer cancel (all legs NEW) → 200 + money back
# 2. order → pay → kitchen ACCEPTS → customer cancel → 409 (locked)
# 3. unpaid order → cancel → 409
set -e
BASE="http://localhost:3000"
RUNKEY="cw-$(date +%s)"
PASS=0; FAIL=0
check() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "  ✅ $1"; else FAIL=$((FAIL+1)); echo "  ❌ $1"; fi; }
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

JAR=$(mktemp -d)
QR=$(curl -s "$BASE/api/demo/entry" | jget "['data']['aurora']['qrToken']")
C=$(curl -s "$BASE/api/context?qr=$QR")
# pick Cinema Snacks (kitchen@cinema-snacks.demo is the test's accepter);
# fall back to the first store with an AVAILABLE product
PICK=$(echo "$C" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
order=['Cinema Snacks']+[s['name'] for s in d['stores']]
names={s['name']:s for s in d['stores']}
for name in order:
    s=names.get(name)
    if not s: continue
    avail=[p for p in s['products'] if p.get('isAvailable',True)]
    if avail:
        print(json.dumps({'store':s['id'],'product':avail[0]['id'],'name':name})); break")
POPCORN=$(echo "$PICK" | python3 -c "import sys,json;print(json.load(sys.stdin)['product'])")
STORE1=$(echo "$PICK" | python3 -c "import sys,json;print(json.load(sys.stdin)['store'])")

place_and_pay() {
  local KEY=$1
  O=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
    -d "{\"qrToken\":\"$QR\",\"items\":[{\"productId\":\"$POPCORN\",\"qty\":1}],\"customerName\":\"CancelTest\"}")
  local CODE=$(echo "$O" | jget "['data']['code']")
  curl -s -X POST "$BASE/api/payments/mock-pay" -H 'Content-Type: application/json' \
    -d "{\"orderCode\":\"$CODE\",\"method\":\"UPI\",\"methodDetail\":\"te••@okhdfc\",\"outcome\":\"success\",\"idempotencyKey\":\"$KEY\"}" > /dev/null
  echo "$CODE"
}

echo "── 1. cancel while nothing accepted ──"
CODE1=$(place_and_pay "$RUNKEY-a")
STATUS=$(echo "$CODE1" | xargs -I{} curl -s "$BASE/api/orders/{}" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(d['paymentStatus'], all(s['status']=='NEW' for s in d['stores']))")
check "order PAID, all legs NEW ($STATUS)" "$([ "$(echo $STATUS | cut -d' ' -f1)" = "PAID" ] && [ "$(echo $STATUS | cut -d' ' -f2)" = "True" ] && echo 1 || echo 0)"
CANCEL1=$(curl -s -X POST "$BASE/api/orders/$CODE1/cancel")
check "customer cancel → 200, refund recorded" "$([ "$(echo "$CANCEL1" | jget "['data']['cancelled']")" = "True" ] && [ -n "$(echo "$CANCEL1" | jget "['data']['refund']['refundId']")" ] && echo 1 || echo 0)"
S1=$(echo "$CANCEL1" | jget "['data']['refund']['amountPaise']")
check "refund is full amount ($S1 paise)" "$([ -n "$S1" ] && [ "$S1" != "None" ] && [ "$S1" -gt 0 ] && echo 1 || echo 0)"
AFTER=$(curl -s "$BASE/api/orders/$CODE1")
check "order now CANCELLED" "$([ "$(echo "$AFTER" | jget "['data']['status']")" = "CANCELLED" ] && echo 1 || echo 0)"
AGAIN=$(code -X POST "$BASE/api/orders/$CODE1/cancel")
check "second cancel → 409" "$([ "$AGAIN" = "409" ] && echo 1 || echo 0)"

echo "── 2. accept kills the cancel window ──"
CODE2=$(place_and_pay "$RUNKEY-b")
TK2=$(curl -s "$BASE/api/orders/$CODE2" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
leg=[s for s in d['stores'] if s['storeId']=='$STORE1']
print(leg[0]['ticketId'])")
curl -s -c "$JAR/k" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"kitchen@cinema-snacks.demo\",\"password\":\"demo1234\"}" > /dev/null
ACC=$(code -b "$JAR/k" -X POST "$BASE/api/kitchen/tickets/$TK2/status" -H 'Content-Type: application/json' -d '{"to":"ACCEPTED"}')
check "kitchen accepts ($ACC)" "$([ "$ACC" = "200" ] && echo 1 || echo 0)"
CANCEL2=$(code -X POST "$BASE/api/orders/$CODE2/cancel")
check "customer cancel after accept → 409 LOCKED" "$([ "$CANCEL2" = "409" ] && echo 1 || echo 0)"
LOCKED=$(curl -s -X POST "$BASE/api/orders/$CODE2/cancel" | jget "['error']")
check "message says store accepted ($LOCKED)" "$(echo "$LOCKED" | grep -qi "accepted" && echo 1 || echo 0)"

echo "── 3. unpaid cannot cancel ──"
O3=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"$QR\",\"items\":[{\"productId\":\"$POPCORN\",\"qty\":1}],\"customerName\":\"CancelTest\"}")
CODE3=$(echo "$O3" | jget "['data']['code']")
CANCEL3=$(code -X POST "$BASE/api/orders/$CODE3/cancel")
check "unpaid cancel → 409" "$([ "$CANCEL3" = "409" ] && echo 1 || echo 0)"

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
