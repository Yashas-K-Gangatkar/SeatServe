#!/bin/bash
# NotiFetch inspection — mirror live assets into local public/
set -e
BASE="https://ctshop-git-main-noti-fetch.vercel.app"
OUT="/home/z/my-project/public/landing"
mkdir -p "$OUT"

for img in cinema coffee dosa fries jamun nachos pizza popcorn wrap; do
  curl -s --max-time 30 -o "$OUT/$img.png" "$BASE/landing/$img.png" &
done
wait
ls -la "$OUT"

# CSS chunks
mkdir -p /home/z/my-project/scripts/notifetch-inspect/css
for css in 25da0b2e49e00d85 34d933785a17edf3; do
  curl -s --max-time 30 -o "/home/z/my-project/scripts/notifetch-inspect/css/$css.css" "$BASE/_next/static/chunks/$css.css" &
done
wait
wc -c /home/z/my-project/scripts/notifetch-inspect/css/*.css
echo "done"
