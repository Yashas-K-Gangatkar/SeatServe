#!/usr/bin/env bash
# SeatServe server watchdog — keeps :3000 alive.
# - If scripts/.prod-mode exists, restarts the production standalone server;
#   otherwise restarts `next dev` (the demo default).
# - Stale-lock-safe: takes over if the previous watchdog pid is dead.
# Log: /home/z/my-project/dev-watchdog.log

cd /home/z/my-project || exit 1
LOCK=/tmp/seatserve-watchdog.lock

# take over a stale lock from a killed watchdog
if [ -e "$LOCK" ]; then
  oldpid=$(cat "$LOCK" 2>/dev/null)
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
    exit 0            # a live watchdog already runs
  fi
  rm -f "$LOCK"
fi
trap 'rm -f "$LOCK"' EXIT
echo $$ > "$LOCK"

start_prod() {
  echo "[$(date '+%F %T')] starting PRODUCTION server" >> dev-watchdog.log
  setsid nohup bash -c 'cd /home/z/my-project && NODE_ENV=production PORT=3000 bun .next/standalone/server.js >> server.log 2>&1' >/dev/null 2>&1 &
}

start_dev() {
  echo "[$(date '+%F %T')] starting DEV server" >> dev-watchdog.log
  setsid nohup bash -c 'cd /home/z/my-project && bunx next dev -p 3000 2>&1 | tee dev.log' >/dev/null 2>&1 &
}

echo "[$(date '+%F %T')] watchdog started (pid $$, mode=$( [ -f scripts/.prod-mode ] && echo prod || echo dev ))" >> dev-watchdog.log

while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>/dev/null)
  if [ "$code" != "200" ]; then
    echo "[$(date '+%F %T')] unhealthy (code=$code) — restarting" >> dev-watchdog.log
    pkill -9 -f "next dev|next-server|standalone/server.js" 2>/dev/null
    sleep 1
    rm -f .next/dev/lock
    if [ -f scripts/.prod-mode ]; then start_prod; else start_dev; fi
    sleep 25   # allow cold boot before next probe
  fi
  sleep 20
done
