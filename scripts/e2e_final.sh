#!/usr/bin/env bash
# Final acceptance verification (single call).
set -u
ROOT=/home/z/my-project
cd "$ROOT"
setsid bash start.sh > "$ROOT/scripts/e2e.log" 2>&1 < /dev/null &
for i in $(seq 1 30); do
  ss -tln 2>/dev/null | grep -q ":3000" && ss -tln 2>/dev/null | grep -q ":8000" && break
  sleep 1
done
echo "== health =="
curl -s http://127.0.0.1:3000/api/health/ | python3 -c "import json,sys; d=json.load(sys.stdin); print('health:', d['status'], '| cycle:', d['hos_rules']['cycle'])"

echo "== TEST 6 live: cycle=65, short trip (must not exceed 5h cycle) =="
curl -s -m 90 -X POST http://127.0.0.1:3000/api/trips/plan/ -H "Content-Type: application/json" \
  -d '{"current_location":"St. Louis, MO","pickup_location":"Springfield, IL","dropoff_location":"Chicago, IL","current_cycle_used":65}' \
  -o "$ROOT/scripts/t6.json" -w "[%{http_code}] "
python3 - << 'PYEOF'
import json
d = json.load(open('/home/z/my-project/scripts/t6.json'))
if 'error' in d: print('ERROR:', d); raise SystemExit(1)
from hos_rules_check import *  # noqa (not used; inline below)
PYEOF
python3 - << 'PYEOF'
import json
d = json.load(open('/home/z/my-project/scripts/t6.json'))
if 'error' not in d:
    restart = [a for a in d['schedule']['activities'] if a['type'] == 'RESTART_34H']
    pre = [a for a in d['schedule']['activities']
           if a['duty_status'] in ('DRIVING','ON_DUTY_NOT_DRIVING')]
    before = next((a for a in d['schedule']['activities'] if a['type']=='RESTART_34H'), None)
    onduty_before = sum(a['duration_minutes'] for a in d['schedule']['activities']
                        if before and a['seq'] < before['seq']
                        and a['duty_status'] in ('DRIVING','ON_DUTY_NOT_DRIVING'))/60
    print(f"trip {d['trip']['id']}: {d['route']['distance_miles']} mi | restart used: {d['hos_summary']['restart_used']}")
    print(f"on-duty hours BEFORE restart: {onduty_before:.2f} (must be <= 5.0 + 0.5 pretrip allowance)")
    print(f"violations: {len(d['hos_summary']['violations'])} | logs: {len(d['logs'])}")
PYEOF

echo "== validate endpoint (dry run, nothing persisted) =="
curl -s -m 60 -X POST http://127.0.0.1:3000/api/trips/validate/ -H "Content-Type: application/json" \
  -d '{"current_location":"Dallas, TX","pickup_location":"Memphis, TN","dropoff_location":"Atlanta, GA","current_cycle_used":10}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('schedulable:', d['schedulable'], '| route:', d['route']['distance_miles'], 'mi | violations:', len(d['violations']))"

echo "== trip detail endpoint =="
TRIP_ID=$(python3 -c "import json; print(json.load(open('$ROOT/scripts/t6.json'))['trip']['id'])")
curl -s "http://127.0.0.1:3000/api/trips/$TRIP_ID/" | python3 -c "import json,sys; d=json.load(sys.stdin); print('trip', d['trip']['id'], '| logs:', len(d['logs']), '| activities:', len(d['schedule']['activities']), '| markers:', len(d['markers']))"

echo "== geocode endpoint =="
curl -s "http://127.0.0.1:3000/api/geocode/?q=Nashville,%20TN" | python3 -c "import json,sys; d=json.load(sys.stdin); print('geocode:', d['display_name'][:60], f\"({d['lat']:.3f}, {d['lon']:.3f})\")"

echo done
