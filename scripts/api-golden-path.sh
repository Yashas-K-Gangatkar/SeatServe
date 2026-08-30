#!/bin/bash
# SeatServe — end-to-end API golden path test (bash/curl) — Phase 2 edition.
# Covers: commerce flow + auth (login/session/RBAC) + tenant isolation (403s).
set -e
BASE="http://localhost:3000"
RUNKEY=$(date +%s)
PASS=0; FAIL=0
check() {
  if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "  ✅ $1"; else FAIL=$((FAIL+1)); echo "  ❌ $1"; fi
}
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# per-user cookie jars (session cookies only live for this run)
JARS="$HOME/.seatserve-gp-jars-$RUNKEY"
mkdir -p "$JARS"

echo "── Health ──"
H=$(curl -s "$BASE/api/health")
check "health ok" "$([ "$(echo "$H" | jget "['ok']")" = "True" ] && echo 1 || echo 0)"

echo "── Context (QR) ──"
C=$(curl -s "$BASE/api/context?qr=A3-F12")
SEAT=$(echo "$C" | jget "['data']['seat']['code']")
check "QR resolves to F-12" "$([ "$SEAT" = "F-12" ] && echo 1 || echo 0)"
OPEN=$(echo "$C" | jget "['data']['showtime']['cutoff']['orderingOpen']")
check "ordering open for Screen 3 show" "$([ "$OPEN" = "True" ] && echo 1 || echo 0)"
BADQR=$(code "$BASE/api/context?qr=NOPE")
check "unknown QR → 404" "$([ "$BADQR" = "404" ] && echo 1 || echo 0)"

POPCORN=$(echo "$C" | jget "['data']['stores'][0]['products'][0]['id']")
PIZZA=$(echo "$C" | jget "['data']['stores'][1]['products'][0]['id']")
MITHAI=$(echo "$C" | jget "['data']['stores'][3]['products'][0]['id']")
SLUG0=$(echo "$C" | jget "['data']['stores'][0]['slug']")
SLUG1=$(echo "$C" | jget "['data']['stores'][1]['slug']")
STORE1=$(echo "$C" | jget "['data']['stores'][0]['id']")
STORE2=$(echo "$C" | jget "['data']['stores'][1]['id']")

echo "── Auth: login & session ──"
BAD=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"kitchen@$SLUG0.demo\",\"password\":\"wrong\"}")
check "wrong password → 401" "$([ "$BAD" = "401" ] && echo 1 || echo 0)"
ANON=$(code "$BASE/api/auth/me")
check "me without session → 401" "$([ "$ANON" = "401" ] && echo 1 || echo 0)"
curl -s -c "$JARS/admin" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"asha@seatserve.demo","password":"demo1234"}' > /dev/null
ADMIN_ROLE=$(curl -s -b "$JARS/admin" "$BASE/api/auth/me" | jget "['data']['role']")
check "mall admin login (asha)" "$([ "$ADMIN_ROLE" = "MALL_ADMIN" ] && echo 1 || echo 0)"
curl -s -c "$JARS/k0" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"kitchen@$SLUG0.demo\",\"password\":\"demo1234\"}" > /dev/null
K0_STORE=$(curl -s -b "$JARS/k0" "$BASE/api/auth/me" | jget "['data']['storeId']")
check "cook login pinned to own store" "$([ "$K0_STORE" = "$STORE1" ] && echo 1 || echo 0)"
curl -s -c "$JARS/k1" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"kitchen@$SLUG1.demo\",\"password\":\"demo1234\"}" > /dev/null
curl -s -c "$JARS/run" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"ravi@runner.demo","password":"demo1234"}' > /dev/null
RUN_ROLE=$(curl -s -b "$JARS/run" "$BASE/api/auth/me" | jget "['data']['role']")
check "runner login (ravi)" "$([ "$RUN_ROLE" = "RUNNER" ] && echo 1 || echo 0)"
curl -s -c "$JARS/cm" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"vikram@aurora.demo","password":"demo1234"}' > /dev/null
CM_ROLE=$(curl -s -b "$JARS/cm" "$BASE/api/auth/me" | jget "['data']['role']")
check "cinema manager login (vikram)" "$([ "$CM_ROLE" = "CINEMA_MANAGER" ] && echo 1 || echo 0)"
CUST=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"priya@seatserve.demo","password":"demo1234"}')
check "non-staff account rejected" "$([ "$CUST" = "401" ] || [ "$CUST" = "403" ] || [ "$CUST" = "422" ] && echo 1 || echo 0)"

echo "── Order creation (customer app stays login-free) ──"
O=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"A3-F12\",\"items\":[{\"productId\":\"$POPCORN\",\"qty\":1},{\"productId\":\"$PIZZA\",\"qty\":2,\"notes\":\"less spicy\"}],\"customerName\":\"CLI Test\"}")
CODE=$(echo "$O" | jget "['data']['code']")
TOTAL=$(echo "$O" | jget "['data']['breakdown']['totalPaise']")
SUB=$(echo "$O" | jget "['data']['breakdown']['subtotalPaise']")
DEL=$(echo "$O" | jget "['data']['breakdown']['deliveryFeePaise']")
PLAT=$(echo "$O" | jget "['data']['breakdown']['platformFeePaise']")
check "order created ($CODE)" "$([ -n "$CODE" ] && [ "$CODE" != "None" ] && echo 1 || echo 0)"
SUM=$((SUB+DEL+PLAT))
check "bill invariant subtotal+delivery+platform==total ($SUM==$TOTAL)" "$([ "$SUM" = "$TOTAL" ] && echo 1 || echo 0)"

echo "── Idempotent payment ──"
P1=$(curl -s -X POST "$BASE/api/payments/mock-pay" -H 'Content-Type: application/json' \
  -d "{\"orderCode\":\"$CODE\",\"method\":\"UPI\",\"methodDetail\":\"te••@okhdfc\",\"outcome\":\"success\",\"idempotencyKey\":\"cli-$RUNKEY-001\"}")
check "payment captured" "$([ "$(echo "$P1" | jget "['data']['outcome']")" = "captured" ] && echo 1 || echo 0)"
P2=$(curl -s -X POST "$BASE/api/payments/mock-pay" -H 'Content-Type: application/json' \
  -d "{\"orderCode\":\"$CODE\",\"method\":\"UPI\",\"outcome\":\"success\",\"idempotencyKey\":\"cli-$RUNKEY-001\"}")
check "same key → idempotent replay" "$([ "$(echo "$P2" | jget "['data']['idempotent']")" = "True" ] && echo 1 || echo 0)"
P3=$(curl -s -X POST "$BASE/api/payments/mock-pay" -H 'Content-Type: application/json' \
  -d "{\"orderCode\":\"$CODE\",\"method\":\"UPI\",\"outcome\":\"success\",\"idempotencyKey\":\"cli-$RUNKEY-002\"}")
check "already-paid order → 409" "$([ "$(echo "$P3" | jget "['ok']")" = "False" ] && echo 1 || echo 0)"

echo "── Tracking ──"
T=$(curl -s "$BASE/api/orders/$CODE")
check "tracking shows PAID" "$([ "$(echo "$T" | jget "['data']['paymentStatus']")" = "PAID" ] && echo 1 || echo 0)"
STORES=$(echo "$T" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['stores']))")
check "2 store tickets visible" "$([ "$STORES" = "2" ] && echo 1 || echo 0)"

echo "── Kitchen flow (scoped) ──"
NOAUTH=$(code "$BASE/api/kitchen/tickets?storeId=$STORE1")
check "kitchen tickets without login → 401" "$([ "$NOAUTH" = "401" ] && echo 1 || echo 0)"
CROSS=$(code -b "$JARS/k0" "$BASE/api/kitchen/tickets?storeId=$STORE2")
check "cook of store1 reading store2 → 403 (server-enforced)" "$([ "$CROSS" = "403" ] && echo 1 || echo 0)"
TK=$(curl -s -b "$JARS/k0" "$BASE/api/kitchen/tickets?storeId=$STORE1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
mine=[t for t in d['tickets'] if t['orderCode']=='$CODE']
print(mine[0]['ticketId'] if mine else '')")
check "cook sees own store's paid ticket" "$([ -n "$TK" ] && echo 1 || echo 0)"
S0=$(code -X POST "$BASE/api/kitchen/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"ACCEPTED"}')
check "status change without login → 401" "$([ "$S0" = "401" ] && echo 1 || echo 0)"
S1=$(curl -s -b "$JARS/k0" -X POST "$BASE/api/kitchen/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"ACCEPTED"}')
check "NEW → ACCEPTED" "$([ "$(echo "$S1" | jget "['data']['status']")" = "ACCEPTED" ] && echo 1 || echo 0)"
S2=$(curl -s -b "$JARS/k0" -X POST "$BASE/api/kitchen/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"DELIVERED"}')
check "illegal jump rejected (409)" "$([ "$(echo "$S2" | jget "['ok']")" = "False" ] && echo 1 || echo 0)"
S3=$(curl -s -b "$JARS/k0" -X POST "$BASE/api/kitchen/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"PREPARING"}')
S4=$(curl -s -b "$JARS/k0" -X POST "$BASE/api/kitchen/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"READY_FOR_PICKUP"}')
RUN=$(echo "$S4" | jget "['data']['assignedRunner']")
check "runner auto-assigned ($RUN)" "$([ -n "$RUN" ] && [ "$RUN" != "None" ] && echo 1 || echo 0)"

echo "── Runner flow (scoped) ──"
RNO=$(code "$BASE/api/runner")
check "runner console without login → 401" "$([ "$RNO" = "401" ] && echo 1 || echo 0)"
RT=$(curl -s -b "$JARS/run" "$BASE/api/runner" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
mine=[t for t in d['queue'] if t['ticketId']=='$TK']
print(1 if mine else 0)")
check "ready ticket in runner queue" "$([ "$RT" = "1" ] && echo 1 || echo 0)"
RP=$(curl -s -b "$JARS/run" -X POST "$BASE/api/runner/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"PICKED_UP"}')
check "picked up" "$([ "$(echo "$RP" | jget "['data']['status']")" = "PICKED_UP" ] && echo 1 || echo 0)"
RD=$(curl -s -b "$JARS/run" -X POST "$BASE/api/runner/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"DELIVERED"}')
check "delivered (ticket 1)" "$([ "$(echo "$RD" | jget "['data']['status']")" = "DELIVERED" ] && echo 1 || echo 0)"
# deliver the second store's ticket too — order completes only when ALL tickets delivered
TK2=$(curl -s -b "$JARS/k1" "$BASE/api/kitchen/tickets?storeId=$STORE2" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
mine=[t for t in d['tickets'] if t['orderCode']=='$CODE']
print(mine[0]['ticketId'] if mine else '')")
check "pizza cook sees own ticket (isolation symmetric)" "$([ -n "$TK2" ] && echo 1 || echo 0)"
for STEP in ACCEPTED PREPARING READY_FOR_PICKUP; do
  curl -s -b "$JARS/k1" -X POST "$BASE/api/kitchen/tickets/$TK2/status" -H 'Content-Type: application/json' -d "{\"to\":\"$STEP\"}" > /dev/null
done
curl -s -b "$JARS/run" -X POST "$BASE/api/runner/tickets/$TK2/status" -H 'Content-Type: application/json' -d '{"to":"PICKED_UP"}' > /dev/null
RD2=$(curl -s -b "$JARS/run" -X POST "$BASE/api/runner/tickets/$TK2/status" -H 'Content-Type: application/json' -d '{"to":"DELIVERED"}')
check "delivered (ticket 2)" "$([ "$(echo "$RD2" | jget "['data']['status']")" = "DELIVERED" ] && echo 1 || echo 0)"
T2=$(curl -s "$BASE/api/orders/$CODE")
check "order COMPLETED after ALL tickets delivered" "$([ "$(echo "$T2" | jget "['data']['status']")" = "COMPLETED" ] && echo 1 || echo 0)"
TP=$(curl -s "$BASE/api/orders/$CODE")
check "payment detail visible on tracking" "$([ -n "$(echo "$TP" | jget "['data']['payment']['providerRef']")" ] && echo 1 || echo 0)"

echo "── Support (customer, login-free) ──"
SUP=$(curl -s -X POST "$BASE/api/orders/$CODE/support" -H 'Content-Type: application/json' -d '{"reason":"NEVER_DELIVERED","detail":"cli test"}')
check "refund request created" "$([ "$(echo "$SUP" | jget "['data']['status']")" = "REQUESTED" ] && echo 1 || echo 0)"
SUP2=$(curl -s -X POST "$BASE/api/orders/$CODE/support" -H 'Content-Type: application/json' -d '{"reason":"OTHER"}')
check "duplicate open request → 409" "$([ "$(echo "$SUP2" | jget "['ok']")" = "False" ] && echo 1 || echo 0)"

echo "── Admin board (scoped by session) ──"
ANO=$(code "$BASE/api/admin/overview")
check "admin overview without login → 401" "$([ "$ANO" = "401" ] && echo 1 || echo 0)"
A=$(curl -s -b "$JARS/admin" "$BASE/api/admin/overview")
check "mall admin KPIs present" "$([ -n "$(echo "$A" | jget "['data']['kpis']['salesPaise']")" ] && echo 1 || echo 0)"
check "mall admin scope label = Mall-wide" "$([ "$(echo "$A" | jget "['data']['scope']['label']")" = "Mall-wide" ] && echo 1 || echo 0)"
ACM=$(curl -s -b "$JARS/cm" "$BASE/api/admin/overview")
check "cinema manager scope label = Your cinema only" "$([ "$(echo "$ACM" | jget "['data']['scope']['label']")" = "Your cinema only" ] && echo 1 || echo 0)"
AUD=$(curl -s -b "$JARS/admin" "$BASE/api/audit" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))")
check "audit trail populated ($AUD)" "$([ "$AUD" -gt 5 ] && echo 1 || echo 0)"
AUD_NO=$(code "$BASE/api/audit")
check "audit without login → 401" "$([ "$AUD_NO" = "401" ] && echo 1 || echo 0)"

echo "── Scoped controls ──"
STORE_CLOSE=$(code -b "$JARS/k0" -X PATCH "$BASE/api/stores/$STORE2" -H 'Content-Type: application/json' -d '{"isOpen":false}')
check "cook toggling ANOTHER store → 403" "$([ "$STORE_CLOSE" = "403" ] && echo 1 || echo 0)"
RESET_CM=$(code -b "$JARS/cm" -X POST "$BASE/api/simulator/reset")
check "cinema manager hitting reset → 403" "$([ "$RESET_CM" = "403" ] && echo 1 || echo 0)"

echo "── Cutoff enforcement (customer) ──"
CB=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"A1-A1\",\"items\":[{\"productId\":\"$MITHAI\",\"qty\":1}]}")
check "past-cutoff seat → blocked" "$([ "$(echo "$CB" | jget "['ok']")" = "False" ] && echo 1 || echo 0)"

echo "── QR sheet (staff only) ──"
QR_NO=$(code "$BASE/api/admin/qr")
check "QR sheet without login → 401" "$([ "$QR_NO" = "401" ] && echo 1 || echo 0)"
N=$(curl -s -b "$JARS/cm" "$BASE/api/admin/qr" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['seats']))")
check "cinema manager QR sheet returns 72 seats" "$([ "$N" = "72" ] && echo 1 || echo 0)"

echo "── Webhook signature ──"
RAW='{"eventId":"evt_evil_1","type":"payment.captured","provider":"EVIL","providerRef":"pay_x"}'
WH=$(code -X POST "$BASE/api/payments/webhook" -H 'Content-Type: application/json' -H 'X-SeatServe-Signature: deadbeef' -d "$RAW")
check "forged webhook → 401" "$([ "$WH" = "401" ] && echo 1 || echo 0)"

echo "── Logout ──"
curl -s -b "$JARS/k0" -c "$JARS/k0" -X POST "$BASE/api/auth/logout" > /dev/null
K0_AFTER=$(code -b "$JARS/k0" "$BASE/api/auth/me")
check "session revoked after logout → 401" "$([ "$K0_AFTER" = "401" ] && echo 1 || echo 0)"

rm -rf "$JARS"
echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
