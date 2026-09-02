#!/usr/bin/env bash
# Task 25-b — pull live seat-QR data for every screen (asha session).
# Output: /tmp/nf-qr-all.json = [{ screen, cinema, seats: [{code, qrToken}] }]
set -uo pipefail
BASE="https://notifetch.in"
JAR="/tmp/nf-asha3.jar"

code() { curl -s -o /tmp/nfq.json -w '%{http_code}' "$@"; }

C=$(code -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"asha@seatserve.demo","password":"demo1234"}')
echo "login=$C"

C=$(code -b "$JAR" "$BASE/api/admin/qr")
echo "qr-default=$C"
python3 - << 'EOF'
import json
d = json.load(open('/tmp/nfq.json'))['data']
print('origin:', d['origin'])
print('screens:', [(s['name'], s['seatsCount']) for s in d['screens']])
EOF

python3 - << 'EOF'
import json, subprocess
d = json.load(open('/tmp/nfq.json'))['data']
all_screens = []
for s in d['screens']:
    sid = s['id']
    out = subprocess.run(['curl', '-s', '-b', '/tmp/nf-asha3.jar',
                          f"https://notifetch.in/api/admin/qr?screenId={sid}"],
                         capture_output=True, text=True).stdout
    sd = json.loads(out)['data']
    all_screens.append({
        'screen': sd['screen']['name'],
        'cinema': sd['screen']['cinema'],
        'seats': [{'code': x['code'], 'qrToken': x['qrToken']} for x in sd['seats']],
    })
    print(f"{sd['screen']['name']}: {len(sd['seats'])} seats")
json.dump(all_screens, open('/home/z/my-project/scripts/qr-seed.json', 'w'), indent=1)
print('saved scripts/qr-seed.json')
EOF
