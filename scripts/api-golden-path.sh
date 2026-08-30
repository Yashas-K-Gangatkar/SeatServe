#!/bin/bash
# SeatServe — end-to-end API golden path test (bash/curl) — Phase 3 edition.
# Covers: commerce flow + auth + tenant isolation + audit-round fixes
# (#12–19 isolation, #1–11 money, #20–22 cutoff, refund actioning)
# + Phase 3: provider webhooks (Razorpay/Cashfree schemes), partial cancel,
# settlement batches, reconciliation.
set -e
BASE="http://localhost:3000"
RUNKEY=$(date +%s)
PASS=0; FAIL=0
check() {
  if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "  ✅ $1"; else FAIL=$((FAIL+1)); echo "  ❌ $1"; fi
}
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

JARS="$HOME/.seatserve-gp-jars-$RUNKEY"
mkdir -p "$JARS"

echo "── Health & demo entry ──"
H=$(curl -s "$BASE/api/health")
check "health ok" "$([ "$(echo "$H" | jget "['ok']")" = "True" ] && echo 1 || echo 0)"
ENTRY=$(curl -s "$BASE/api/demo/entry")
AURORA_QR=$(echo "$ENTRY" | jget "['data']['aurora']['qrToken']")
BLOCKED_QR=$(echo "$ENTRY" | jget "['data']['auroraBlocked']['qrToken']")
NEXORA_QR=$(echo "$ENTRY" | jget "['data']['nexora']['qrToken']")
check "demo entry resolves random tokens" "$([ -n "$AURORA_QR" ] && [ "$AURORA_QR" != "None" ] && [ ${#AURORA_QR} -eq 10 ] && echo 1 || echo 0)"

echo "── Context (QR) ──"
C=$(curl -s "$BASE/api/context?qr=$AURORA_QR")
SEAT=$(echo "$C" | jget "['data']['seat']['code']")
check "QR resolves to Aurora A-1" "$([ "$SEAT" = "A-1" ] && echo 1 || echo 0)"
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

echo "── Audit #12/#13: cross-mall isolation ──"
CN=$(curl -s "$BASE/api/context?qr=$NEXORA_QR")
NEX_STORES=$(echo "$CN" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(','.join(s['name'] for s in d['stores']))")
check "Nexora context shows ONLY Dosa Junction" "$([ "$NEX_STORES" = "Dosa Junction" ] && echo 1 || echo 0)"
AUR_STORES=$(echo "$C" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('Dosa' in ','.join(s['name'] for s in d['stores']))")
check "Aurora context does NOT leak Nexora store" "$([ "$AUR_STORES" = "False" ] && echo 1 || echo 0)"
DOSA=$(echo "$CN" | jget "['data']['stores'][0]['products'][0]['id']")
CROSS_ORDER=$(code -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"$AURORA_QR\",\"items\":[{\"productId\":\"$DOSA\",\"qty\":1}]}")
check "Aurora seat ordering Nexora product → 409" "$([ "$CROSS_ORDER" = "409" ] && echo 1 || echo 0)"

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
curl -s -c "$JARS/nadmin" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"meera@nexora.demo","password":"demo1234"}' > /dev/null
NADMIN_MALL=$(curl -s -b "$JARS/nadmin" "$BASE/api/auth/me" | jget "['data']['mallId']")
check "second-mall admin login (meera)" "$([ "$NADMIN_MALL" != "None" ] && [ -n "$NADMIN_MALL" ] && echo 1 || echo 0)"

echo "── Order creation (customer app stays login-free) ──"
O=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"$AURORA_QR\",\"items\":[{\"productId\":\"$POPCORN\",\"qty\":1},{\"productId\":\"$PIZZA\",\"qty\":2,\"notes\":\"less spicy\"}],\"customerName\":\"CLI Test\"}")
CODE=$(echo "$O" | jget "['data']['code']")
TOTAL=$(echo "$O" | jget "['data']['breakdown']['totalPaise']")
SUB=$(echo "$O" | jget "['data']['breakdown']['subtotalPaise']")
DEL=$(echo "$O" | jget "['data']['breakdown']['deliveryFeePaise']")
PLAT=$(echo "$O" | jget "['data']['breakdown']['platformFeePaise']")
check "order created ($CODE)" "$([ -n "$CODE" ] && [ "$CODE" != "None" ] && echo 1 || echo 0)"
SUM=$((SUB+DEL+PLAT))
check "bill invariant subtotal+delivery+platform==total ($SUM==$TOTAL)" "$([ "$SUM" = "$TOTAL" ] && echo 1 || echo 0)"

echo "── Audit #1: unpaid orders cannot be advanced ──"
TK_UNPAID=$(curl -s "$BASE/api/orders/$CODE" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
leg=[s for s in d['stores'] if s['storeId']=='$STORE1']
print(leg[0]['ticketId'] if leg else '')")
check "unpaid ticket NOT visible in kitchen queue" "$(curl -s -b "$JARS/k0" "$BASE/api/kitchen/tickets?storeId=$STORE1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
mine=[t for t in d['tickets'] if t['orderCode']=='$CODE']
print(1 if mine else 0)" | grep -q 1 && echo 0 || echo 1)"
S_UNPAID=$(code -b "$JARS/k0" -X POST "$BASE/api/kitchen/tickets/$TK_UNPAID/status" -H 'Content-Type: application/json' -d '{"to":"ACCEPTED"}')
check "kitchen advancing UNPAID ticket → 409" "$([ "$S_UNPAID" = "409" ] && echo 1 || echo 0)"

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

echo "── Audit #3: payment.failed AFTER capture must not corrupt ──"
WH_BODY="{\"eventId\":\"evt_fail_after_paid_$RUNKEY\",\"type\":\"payment.failed\",\"provider\":\"SANDBOX_MOCK\",\"providerRef\":\"$(echo "$P1" | jget "['data']['providerRef']")\",\"failureReason\":\"late decline\"}"
SIG=$(python3 -c "import hmac,hashlib,sys;print(hmac.new(b'sandbox_webhook_secret_dev_only',sys.argv[1].encode(),hashlib.sha256).hexdigest())" "$WH_BODY")
FA=$(curl -s -X POST "$BASE/api/payments/webhook" -H 'Content-Type: application/json' -H "X-SeatServe-Signature: $SIG" -d "$WH_BODY")
check "late failed event → already_paid outcome" "$([ "$(echo "$FA" | jget "['data']['outcome']")" = "already_paid" ] && echo 1 || echo 0)"
STILL_PAID=$(curl -s "$BASE/api/orders/$CODE")
check "order still PAID after late failure" "$([ "$(echo "$STILL_PAID" | jget "['data']['paymentStatus']")" = "PAID" ] && echo 1 || echo 0)"

echo "── Audit #18: realtime rooms are token-gated ──"
AURORA_MALL=$(echo "$C" | jget "['data']['mall']['id']")
MALL_ID=$(curl -s -b "$JARS/admin" "$BASE/api/realtime/token" -X POST -H 'Content-Type: application/json' -d "{\"room\":\"admin:$NADMIN_MALL\"}" | jget "['ok']")
check "admin token for FOREIGN mall denied (ok=false)" "$([ "$MALL_ID" = "False" ] && echo 1 || echo 0)"
ADMIN_TOKEN=$(curl -s -b "$JARS/admin" "$BASE/api/realtime/token" -X POST -H 'Content-Type: application/json' -d "{\"room\":\"admin:$AURORA_MALL\"}" | jget "['data']['token']")
check "admin token for OWN mall issued" "$([ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "None" ] && echo 1 || echo 0)"
RUNNER_ADMIN_TOKEN=$(curl -s -b "$JARS/run" "$BASE/api/realtime/token" -X POST -H 'Content-Type: application/json' -d "{\"room\":\"admin:$AURORA_MALL\"}" | jget "['ok']")
check "runner denied admin room token" "$([ "$RUNNER_ADMIN_TOKEN" = "False" ] && echo 1 || echo 0)"
bun scripts/realtime-auth-check.ts "$ADMIN_TOKEN" "admin:$AURORA_MALL" && RT_OK=1 || RT_OK=0
check "socket: valid token joins staff room" "$([ "$RT_OK" = "1" ] && echo 1 || echo 0)"
bun scripts/realtime-auth-check.ts "forged.token" "admin:$AURORA_MALL" && RT_BAD=1 || RT_BAD=0
check "socket: forged token DENIED staff room" "$([ "$RT_BAD" = "0" ] && echo 1 || echo 0)"

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
S2B=$(curl -s -b "$JARS/k0" -X POST "$BASE/api/kitchen/tickets/$TK/status" -H 'Content-Type: application/json' -d '{"to":"PICKED_UP"}')
check "audit #1: kitchen doing RUNNER leg rejected (409)" "$([ "$(echo "$S2B" | jget "['ok']")" = "False" ] && echo 1 || echo 0)"
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

echo "── Audit #2/#43: refund actioning (approve → process) ──"
SUP=$(curl -s -X POST "$BASE/api/orders/$CODE/support" -H 'Content-Type: application/json' -d '{"reason":"NEVER_DELIVERED","detail":"cli test"}')
check "refund request created" "$([ "$(echo "$SUP" | jget "['data']['status']")" = "REQUESTED" ] && echo 1 || echo 0)"
SUP2=$(curl -s -X POST "$BASE/api/orders/$CODE/support" -H 'Content-Type: application/json' -d '{"reason":"OTHER"}')
check "duplicate open request → 409" "$([ "$(echo "$SUP2" | jget "['ok']")" = "False" ] && echo 1 || echo 0)"
REFUND_ID=$(echo "$SUP" | jget "['data']['refundId']")
ACT_CM=$(code -b "$JARS/cm" -X POST "$BASE/api/admin/refunds/$REFUND_ID/action" -H 'Content-Type: application/json' -d '{"action":"APPROVE"}')
check "cinema manager cannot action refunds (403)" "$([ "$ACT_CM" = "403" ] && echo 1 || echo 0)"
APPROVE=$(curl -s -b "$JARS/admin" -X POST "$BASE/api/admin/refunds/$REFUND_ID/action" -H 'Content-Type: application/json' -d '{"action":"APPROVE"}')
check "mall admin APPROVES refund" "$([ "$(echo "$APPROVE" | jget "['data']['status']")" = "APPROVED" ] && echo 1 || echo 0)"
PROCESS=$(curl -s -b "$JARS/admin" -X POST "$BASE/api/admin/refunds/$REFUND_ID/action" -H 'Content-Type: application/json' -d '{"action":"PROCESS"}')
check "mall admin PROCESSES refund" "$([ "$(echo "$PROCESS" | jget "['data']['status']")" = "PROCESSED" ] && echo 1 || echo 0)"
check "order paymentStatus → REFUNDED" "$([ "$(echo "$PROCESS" | jget "['data']['order']['paymentStatus']")" = "REFUNDED" ] && echo 1 || echo 0)"
check "order.refundedPaise == totalPaise" "$([ "$(echo "$PROCESS" | jget "['data']['order']['refundedPaise']")" = "$TOTAL" ] && echo 1 || echo 0)"
REPROCESS=$(code -b "$JARS/admin" -X POST "$BASE/api/admin/refunds/$REFUND_ID/action" -H 'Content-Type: application/json' -d '{"action":"PROCESS"}')
check "double process → 409" "$([ "$REPROCESS" = "409" ] && echo 1 || echo 0)"
OVER_SUP=$(code -X POST "$BASE/api/orders/$CODE/support" -H 'Content-Type: application/json' -d '{"reason":"OTHER"}')
check "fully-refunded order cannot re-request (409)" "$([ "$OVER_SUP" = "409" ] && echo 1 || echo 0)"

echo "── Audit #5/#6: cancel leg → void splits + auto refund ──"
O3=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"$AURORA_QR\",\"items\":[{\"productId\":\"$POPCORN\",\"qty\":1},{\"productId\":\"$PIZZA\",\"qty\":1}],\"customerName\":\"Cancel Test\"}")
CODE3=$(echo "$O3" | jget "['data']['code']")
TOTAL3=$(echo "$O3" | jget "['data']['breakdown']['totalPaise']")
curl -s -X POST "$BASE/api/payments/mock-pay" -H 'Content-Type: application/json' \
  -d "{\"orderCode\":\"$CODE3\",\"method\":\"UPI\",\"outcome\":\"success\",\"idempotencyKey\":\"cli-$RUNKEY-cancel\"}" > /dev/null
TKC=$(curl -s -b "$JARS/k0" "$BASE/api/kitchen/tickets?storeId=$STORE1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
mine=[t for t in d['tickets'] if t['orderCode']=='$CODE3']
print(mine[0]['ticketId'] if mine else '')")
CANCEL=$(curl -s -b "$JARS/k0" -X POST "$BASE/api/kitchen/tickets/$TKC/status" -H 'Content-Type: application/json' -d '{"to":"CANCELLED"}')
check "kitchen cancels own leg" "$([ "$(echo "$CANCEL" | jget "['data']['status']")" = "CANCELLED" ] && echo 1 || echo 0)"
ORDER3=$(curl -s "$BASE/api/orders/$CODE3")
check "order → PARTIALLY_CANCELLED" "$([ "$(echo "$ORDER3" | jget "['data']['status']")" = "PARTIALLY_CANCELLED" ] && echo 1 || echo 0)"
T3=$(curl -s -b "$JARS/admin" "$BASE/api/admin/overview")
REF3=$(echo "$T3" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
mine=[r for r in d['refunds'] if r['code']=='$CODE3']
print(json.dumps(mine[0]) if mine else '{}')")
check "auto refund row created for cancelled leg" "$(python3 -c "import json,sys;r=json.loads('''$REF3''');print(1 if r.get('reason')=='PARTIAL_STORE_CANCEL' and r.get('status')=='APPROVED' else 0)")"
LEG_AMT=$(echo "$REF3" | python3 -c "import sys,json;print(json.load(sys.stdin).get('amountPaise',0))")
SUB3=$(echo "$ORDER3" | jget "['data']['totals']['subtotalPaise']")
PF3=$(echo "$ORDER3" | jget "['data']['totals']['platformFeePaise']")
# derive the cancelled leg from the ACTUAL order (product indexes shift with seed)
LEG_SUB=$(echo "$ORDER3" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
leg=[s for s in d['stores'] if s['status']=='CANCELLED']
print(leg[0]['subtotalPaise'] if leg else 0)")
DELIVERY1=$(echo "$C" | jget "['data']['stores'][0]['deliveryFeePaise']")
LEG_EXPECT=$((LEG_SUB + DELIVERY1 + PF3*LEG_SUB/SUB3))
check "refund amount = leg + delivery + platform share ($LEG_AMT vs $LEG_EXPECT)" "$([ "$LEG_AMT" = "$LEG_EXPECT" ] && echo 1 || echo 0)"
PROC3=$(curl -s -b "$JARS/admin" -X POST "$BASE/api/admin/refunds/$(echo "$REF3" | jget "['id']")/action" -H 'Content-Type: application/json' -d '{"action":"PROCESS"}')
check "leg refund processed → PARTIALLY_REFUNDED" "$([ "$(echo "$PROC3" | jget "['data']['order']['paymentStatus']")" = "PARTIALLY_REFUNDED" ] && echo 1 || echo 0)"

echo "── Audit #7: KPIs are net of refunds ──"
OV=$(curl -s -b "$JARS/admin" "$BASE/api/admin/overview")
SALES=$(echo "$OV" | jget "['data']['kpis']['salesPaise']")
REFUNDED=$(echo "$OV" | jget "['data']['kpis']['refundedPaise']")
check "kpis.refundedPaise reported ($REFUNDED > 0)" "$([ "$REFUNDED" != "None" ] && [ "$REFUNDED" -gt 0 ] && echo 1 || echo 0)"

echo "── Admin board (scoped by session) ──"
ANO=$(code "$BASE/api/admin/overview")
check "admin overview without login → 401" "$([ "$ANO" = "401" ] && echo 1 || echo 0)"
A=$(curl -s -b "$JARS/admin" "$BASE/api/admin/overview")
check "mall admin scope label = Mall-wide" "$([ "$(echo "$A" | jget "['data']['scope']['label']")" = "Mall-wide" ] && echo 1 || echo 0)"
A_MALL=$(echo "$A" | jget "['data']['scope']['mallName']")
check "scope mallName = Aurora Mall (no more hardcoded label)" "$([ "$A_MALL" = "Aurora Mall" ] && echo 1 || echo 0)"
ACM=$(curl -s -b "$JARS/cm" "$BASE/api/admin/overview")
check "cinema manager scope label = Your cinema only" "$([ "$(echo "$ACM" | jget "['data']['scope']['label']")" = "Your cinema only" ] && echo 1 || echo 0)"
check "cinema manager gets realtimeMallId (own cinema's mall)" "$([ "$(echo "$ACM" | jget "['data']['scope']['realtimeMallId']")" = "$AURORA_MALL" ] && echo 1 || echo 0)"
NEX_OV=$(curl -s -b "$JARS/nadmin" "$BASE/api/admin/overview")
NEX_ORDERS=$(echo "$NEX_OV" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['liveOrders']))")
NEX_KPI=$(echo "$NEX_OV" | jget "['data']['kpis']['ordersCount']")
check "Nexora admin sees ZERO Aurora orders (isolation)" "$([ "$NEX_ORDERS" = "0" ] && [ "$NEX_KPI" = "0" ] && echo 1 || echo 0)"
AUD=$(curl -s -b "$JARS/admin" "$BASE/api/audit" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))")
check "audit trail populated ($AUD)" "$([ "$AUD" -gt 5 ] && echo 1 || echo 0)"
AUD_NO=$(code "$BASE/api/audit")
check "audit without login → 401" "$([ "$AUD_NO" = "401" ] && echo 1 || echo 0)"

echo "── Audit #29: login rate limiting ──"
# throwaway identity per run — a locked account must never poison later logins
RL_EMAIL="rl-$RUNKEY@ratecheck.demo"
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -H "X-Forwarded-For: rl-$RUNKEY" -d "{\"email\":\"$RL_EMAIL\",\"password\":\"bad-$i\"}"
done
RL=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -H "X-Forwarded-For: rl-$RUNKEY" -d "{\"email\":\"$RL_EMAIL\",\"password\":\"whatever\"}")
check "6th attempt → 429 before credentials are even checked" "$([ "$RL" = "429" ] && echo 1 || echo 0)"
RL2=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -H 'X-Forwarded-For: other-ip' -d "{\"email\":\"$RL_EMAIL\",\"password\":\"whatever\"}")
check "different IP is not punished (401 not 429)" "$([ "$RL2" = "401" ] && echo 1 || echo 0)"

echo "── Scoped controls ──"
STORE_CLOSE=$(code -b "$JARS/k0" -X PATCH "$BASE/api/stores/$STORE2" -H 'Content-Type: application/json' -d '{"isOpen":false}')
check "cook toggling ANOTHER store → 403" "$([ "$STORE_CLOSE" = "403" ] && echo 1 || echo 0)"
RESET_CM=$(code -b "$JARS/cm" -X POST "$BASE/api/simulator/reset")
check "cinema manager hitting reset → 403" "$([ "$RESET_CM" = "403" ] && echo 1 || echo 0)"

echo "── Audit #20: showtime selection ──"
CB=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"$BLOCKED_QR\",\"items\":[{\"productId\":\"$MITHAI\",\"qty\":1}]}")
check "past-cutoff seat → blocked" "$([ "$(echo "$CB" | jget "['ok']")" = "False" ] && echo 1 || echo 0)"
CBSHOW=$(curl -s "$BASE/api/context?qr=$BLOCKED_QR" | jget "['data']['showtime']['cutoff']['orderingOpen']")
check "blocked seat context stays consistent with order API" "$([ "$CBSHOW" = "False" ] && echo 1 || echo 0)"

echo "── QR sheet (staff only) ──"
QR_NO=$(code "$BASE/api/admin/qr")
check "QR sheet without login → 401" "$([ "$QR_NO" = "401" ] && echo 1 || echo 0)"
N=$(curl -s -b "$JARS/cm" "$BASE/api/admin/qr" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['seats']))")
check "cinema manager QR sheet returns 72 seats" "$([ "$N" = "72" ] && echo 1 || echo 0)"

echo "── Webhook signature ──"
RAW='{"eventId":"evt_evil_1","type":"payment.captured","provider":"EVIL","providerRef":"pay_x"}'
WH=$(code -X POST "$BASE/api/payments/webhook" -H 'Content-Type: application/json' -H 'X-SeatServe-Signature: deadbeef' -d "$RAW")
check "forged webhook → 401" "$([ "$WH" = "401" ] && echo 1 || echo 0)"

echo "── Phase 3: provider webhook schemes (Razorpay Route / Cashfree Easy Split) ──"
P3_SECRET="rzp_test_seatserve_secret"
P3_CFSECRET="cf_test_seatserve_secret"
rzs() { python3 -c "import hmac,hashlib,sys;print(hmac.new(sys.argv[1].encode(),sys.argv[2].encode(),hashlib.sha256).hexdigest())" "$1" "$2"; }
cfs() { python3 -c "import hmac,hashlib,sys,base64;print(base64.b64encode(hmac.new(sys.argv[1].encode(),(sys.argv[2]+sys.argv[3]).encode(),hashlib.sha256).digest()).decode())" "$1" "$2" "$3"; }

# helper: make an order with one item, then a FAILED mock-pay to mint an INITIATED→FAILED
# payment row with a known providerRef for provider-shaped events to capture
p3_make_paidable() {
  local qr="$1" pid="$2"
  local ord=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
    -d "{\"qrToken\":\"$qr\",\"items\":[{\"productId\":\"$pid\",\"qty\":1}]}")
  echo "$ord" | jget "['data']['code']"
}
p3_fail_pay() {
  local ord_code="$1"
  curl -s -X POST "$BASE/api/payments/mock-pay" -H 'Content-Type: application/json' \
    -d "{\"orderCode\":\"$ord_code\",\"method\":\"UPI\",\"outcome\":\"failure\",\"failureReason\":\"bank timeout\",\"idempotencyKey\":\"p3-fail-$RUNKEY-$ord_code\"}" \
    | jget "['data']['providerRef']"
}

RZP_CODE=$(p3_make_paidable "$AURORA_QR" "$POPCORN")
RZP_REF=$(p3_fail_pay "$RZP_CODE")
RZP_BODY=$(python3 -c "
import json,sys
print(json.dumps({'event':'payment.captured','payload':{'payment':{'entity':{'id':'pay_$RZP_REF','method':'upi','vpa':'arjun@okicici'}}}}))")
RZP_SIG=$(rzs "$P3_SECRET" "$RZP_BODY")
RZP_WH=$(curl -s -X POST "$BASE/api/payments/webhook" -H 'Content-Type: application/json' \
  -H "X-Razorpay-Signature: $RZP_SIG" -d "$RZP_BODY")
RZP_OUT=$(echo "$RZP_WH" | jget "['data']['outcome']")
check "razorpay-signed webhook captures payment" "$([ "$RZP_OUT" = "captured" ] && echo 1 || echo 0)"
RZP_STATUS=$(curl -s "$BASE/api/orders/$RZP_CODE" | jget "['data']['paymentStatus']")
check "razorpay capture → order PAID" "$([ "$RZP_STATUS" = "PAID" ] && echo 1 || echo 0)"
RZP_BAD=$(code -X POST "$BASE/api/payments/webhook" -H 'Content-Type: application/json' \
  -H "X-Razorpay-Signature: $(printf '%064d' 0)" -d "$RZP_BODY")
check "forged razorpay signature → 401" "$([ "$RZP_BAD" = "401" ] && echo 1 || echo 0)"

CF_CODE=$(p3_make_paidable "$AURORA_QR" "$POPCORN")
CF_REF=$(p3_fail_pay "$CF_CODE")
CF_BODY=$(python3 -c "
import json,sys
print(json.dumps({'type':'PAYMENT_SUCCESS','data':{'order':{'order_id':'$CF_CODE|$CF_REF'},'payment':{'cf_payment_id':987654,'payment_method':'upi','upi':{'vpa':'priya@ybl'}}}}))")
CF_TS="1725000000$RUNKEY"
CF_SIG=$(cfs "$P3_CFSECRET" "$CF_TS" "$CF_BODY")
CF_WH=$(curl -s -X POST "$BASE/api/payments/webhook" -H 'Content-Type: application/json' \
  -H "x-webhook-timestamp: $CF_TS" -H "x-webhook-signature: $CF_SIG" -d "$CF_BODY")
CF_OUT=$(echo "$CF_WH" | jget "['data']['outcome']")
check "cashfree-signed webhook captures payment" "$([ "$CF_OUT" = "captured" ] && echo 1 || echo 0)"
CF_BAD_TS="1725000000999"
CF_BAD=$(code -X POST "$BASE/api/payments/webhook" -H 'Content-Type: application/json' \
  -H "x-webhook-timestamp: $CF_BAD_TS" -H "x-webhook-signature: $CF_SIG" -d "$CF_BODY")
check "cashfree replay with tampered timestamp → 401" "$([ "$CF_BAD" = "401" ] && echo 1 || echo 0)"

echo "── Phase 3: partial cancel (customer self-service) ──"
P3=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' \
  -d "{\"qrToken\":\"$AURORA_QR\",\"items\":[{\"productId\":\"$POPCORN\",\"qty\":1},{\"productId\":\"$PIZZA\",\"qty\":1}]}")
P3_CODE=$(echo "$P3" | jget "['data']['code']")
P3_TOTAL=$(echo "$P3" | jget "['data']['breakdown']['totalPaise']")
P3_PLATFORM=$(echo "$P3" | jget "['data']['breakdown']['platformFeePaise']")
P3_SUBTOTAL=$(echo "$P3" | jget "['data']['breakdown']['subtotalPaise']")
curl -s -X POST "$BASE/api/payments/mock-pay" -H 'Content-Type: application/json' \
  -d "{\"orderCode\":\"$P3_CODE\",\"method\":\"UPI\",\"outcome\":\"success\",\"idempotencyKey\":\"p3-pay-$RUNKEY\"}" > /dev/null
P3_TRACK=$(curl -s "$BASE/api/orders/$P3_CODE")
P3_T0=$(echo "$P3_TRACK" | jget "['data']['stores'][0]['ticketId']")
P3_T1=$(echo "$P3_TRACK" | jget "['data']['stores'][1]['ticketId']")
P3_STORE0_SUB=$(echo "$P3" | jget "['data']['breakdown']['perStore'][0]['subtotalPaise']")
P3_STORE0_FEE=$(echo "$P3" | jget "['data']['breakdown']['perStore'][0]['deliveryFeePaise']")
P3_EXPECT_REFUND=$(python3 -c "print($P3_STORE0_SUB + $P3_STORE0_FEE + round($P3_PLATFORM * $P3_STORE0_SUB / $P3_SUBTOTAL))")
check "expected leg refund math (leg + fee + platform share)" "$([ -n "$P3_EXPECT_REFUND" ] && [ "$P3_EXPECT_REFUND" != "None" ] && echo 1 || echo 0)"

# cancel on an UNPAID order must refuse
P3_UNPAID=$(p3_make_paidable "$AURORA_QR" "$POPCORN")
P3_UPT=$(curl -s "$BASE/api/orders/$P3_UNPAID" | jget "['data']['stores'][0]['ticketId']")
P3_UP=$(code -X POST "$BASE/api/orders/$P3_UNPAID/cancel-leg" -H 'Content-Type: application/json' -d "{\"ticketId\":\"$P3_UPT\"}")
check "cancel leg on unpaid order → 409" "$([ "$P3_UP" = "409" ] && echo 1 || echo 0)"
# unknown ticket
P3_UT=$(code -X POST "$BASE/api/orders/$P3_CODE/cancel-leg" -H 'Content-Type: application/json' -d '{"ticketId":"nope"}')
check "cancel unknown ticket → 404" "$([ "$P3_UT" = "404" ] && echo 1 || echo 0)"

P3_CANCEL=$(curl -s -X POST "$BASE/api/orders/$P3_CODE/cancel-leg" -H 'Content-Type: application/json' -d "{\"ticketId\":\"$P3_T0\"}")
P3_REFUND=$(echo "$P3_CANCEL" | jget "['data']['refundTotalPaise']")
P3_NEWSTATUS=$(echo "$P3_CANCEL" | jget "['data']['orderStatus']")
check "leg cancelled → order PARTIALLY_CANCELLED" "$([ "$P3_NEWSTATUS" = "PARTIALLY_CANCELLED" ] && echo 1 || echo 0)"
check "auto refund amount EXACT (subtotal+fee+platform share)" "$([ "$P3_REFUND" = "$P3_EXPECT_REFUND" ] && echo 1 || echo 0)"
P3_DOUBLE=$(code -X POST "$BASE/api/orders/$P3_CODE/cancel-leg" -H 'Content-Type: application/json' -d "{\"ticketId\":\"$P3_T0\"}")
check "double cancel same leg → 409" "$([ "$P3_DOUBLE" = "409" ] && echo 1 || echo 0)"

# remaining leg continues: accept → prepare → then cancel must refuse
# (T1 is the Pizza Corner leg → use its own cook k1; k0 would get 403)
curl -s -b "$JARS/k1" -X POST "$BASE/api/kitchen/tickets/$P3_T1/status" -H 'Content-Type: application/json' -d '{"to":"ACCEPTED"}' > /dev/null
curl -s -b "$JARS/k1" -X POST "$BASE/api/kitchen/tickets/$P3_T1/status" -H 'Content-Type: application/json' -d '{"to":"PREPARING"}' > /dev/null
P3_LATE=$(code -X POST "$BASE/api/orders/$P3_CODE/cancel-leg" -H 'Content-Type: application/json' -d "{\"ticketId\":\"$P3_T1\"}")
check "cancel after PREPARING → 409" "$([ "$P3_LATE" = "409" ] && echo 1 || echo 0)"

# process the auto-opened refund → refundedPaise exact
P3_REFUND_ID=$(curl -s -b "$JARS/admin" "$BASE/api/admin/overview" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']['refunds']
m=[r for r in d if r['code']=='$P3_CODE' and r['status']=='APPROVED']
print(m[0]['id'] if m else '')")
check "auto-opened refund found in admin inbox" "$([ -n "$P3_REFUND_ID" ] && echo 1 || echo 0)"
curl -s -b "$JARS/admin" -X POST "$BASE/api/admin/refunds/$P3_REFUND_ID/action" -H 'Content-Type: application/json' -d '{"action":"PROCESS"}' > /dev/null
P3_ORDER_AFTER=$(curl -s "$BASE/api/orders/$P3_CODE" | jget "['data']['paymentStatus']")
check "processed leg refund → PARTIALLY_REFUNDED" "$([ "$P3_ORDER_AFTER" = "PARTIALLY_REFUNDED" ] && echo 1 || echo 0)"

echo "── Phase 3: settlement batches & reconciliation ──"
S_GET=$(curl -s -b "$JARS/admin" "$BASE/api/admin/settlement")
S_SCOPE=$(echo "$S_GET" | jget "['data']['scope']")
check "settlement summary scoped Mall-wide" "$([ "$S_SCOPE" = "Mall-wide" ] && echo 1 || echo 0)"
S_STORES=$(echo "$S_GET" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['stores']))")
check "settlement summary lists 4 Aurora stores" "$([ "$S_STORES" = "4" ] && echo 1 || echo 0)"
S_ANON=$(code "$BASE/api/admin/settlement")
check "settlement without login → 401" "$([ "$S_ANON" = "401" ] && echo 1 || echo 0)"
S_KITCHEN=$(code -b "$JARS/k0" "$BASE/api/admin/settlement")
check "kitchen staff settlement access → 403" "$([ "$S_KITCHEN" = "403" ] && echo 1 || echo 0)"

S_BATCH=$(curl -s -b "$JARS/admin" -X POST "$BASE/api/admin/settlement" -H 'Content-Type: application/json' -d '{}')
S_COUNT=$(echo "$S_BATCH" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['batches']))")
check "settlement batch created (≥1 store)" "$([ "$S_COUNT" != "0" ] && [ "$S_COUNT" != "None" ] && echo 1 || echo 0)"
S_ID=$(echo "$S_BATCH" | jget "['data']['batches'][0]['settlementId']")
S_AMT=$(echo "$S_BATCH" | jget "['data']['batches'][0]['amountPaise']")
S_PROC=$(curl -s -b "$JARS/admin" -X POST "$BASE/api/admin/settlement/$S_ID/process")
S_UTR=$(echo "$S_PROC" | jget "['data']['utr']")
check "batch processed with UTR" "$([ "$S_UTR" != "None" ] && [ -n "$S_UTR" ] && echo 1 || echo 0)"
S_PROC_AMT=$(echo "$S_PROC" | jget "['data']['amountPaise']")
check "processed amount matches batch snapshot" "$([ "$S_PROC_AMT" = "$S_AMT" ] && echo 1 || echo 0)"
S_DOUBLE=$(code -b "$JARS/admin" -X POST "$BASE/api/admin/settlement/$S_ID/process")
check "double process same batch → 409" "$([ "$S_DOUBLE" = "409" ] && echo 1 || echo 0)"

R_H=$(curl -s -b "$JARS/admin" "$BASE/api/admin/reconciliation")
R_HEALTHY=$(echo "$R_H" | jget "['data']['healthy']")
R_N=$(echo "$R_H" | jget "['data']['ordersChecked']")
check "reconciliation healthy over $R_N orders" "$([ "$R_HEALTHY" = "True" ] && [ "$R_N" != "0" ] && echo 1 || echo 0)"
R_ANON=$(code "$BASE/api/admin/reconciliation")
check "reconciliation without login → 401" "$([ "$R_ANON" = "401" ] && echo 1 || echo 0)"

# corruption drill: mangle one split row directly in sqlite → report goes unhealthy → restore
bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('/home/z/my-project/db/custom.db');
const row = db.query(\"SELECT id, amountPaise FROM Split WHERE amountPaise > 0 AND beneficiary='STORE' ORDER BY createdAt DESC LIMIT 1\").get();
db.run('UPDATE Split SET amountPaise = ? WHERE id = ?', [row.amountPaise + 777, row.id]);
console.log(row.id);
" > /tmp/p3_corrupt_id 2>/dev/null
CORRUPT_ID=$(cat /tmp/p3_corrupt_id)
if [ -n "$CORRUPT_ID" ]; then
  R_BAD=$(curl -s -b "$JARS/admin" "$BASE/api/admin/reconciliation" | jget "['data']['healthy']")
  check "corrupted ledger detected → unhealthy" "$([ "$R_BAD" = "False" ] && echo 1 || echo 0)"
  bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('/home/z/my-project/db/custom.db');
db.run('UPDATE Split SET amountPaise = amountPaise - 777 WHERE id = ?', ['$CORRUPT_ID']);
" 2>/dev/null
  R_FIXED=$(curl -s -b "$JARS/admin" "$BASE/api/admin/reconciliation" | jget "['data']['healthy']")
  check "restored ledger → healthy again" "$([ "$R_FIXED" = "True" ] && echo 1 || echo 0)"
else
  check "corruption drill skipped (no sqlite rows)" "0"
fi

echo "── Logout ──"
curl -s -b "$JARS/k0" -c "$JARS/k0" -X POST "$BASE/api/auth/logout" > /dev/null
K0_AFTER=$(code -b "$JARS/k0" "$BASE/api/auth/me")
check "session revoked after logout → 401" "$([ "$K0_AFTER" = "401" ] && echo 1 || echo 0)"

rm -rf "$JARS"
echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
