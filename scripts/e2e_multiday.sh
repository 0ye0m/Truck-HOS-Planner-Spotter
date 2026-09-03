#!/usr/bin/env bash
# Multi-day trip + PDF verification (single call).
set -u
ROOT=/home/z/my-project
cd "$ROOT"
setsid bash start.sh > "$ROOT/scripts/e2e.log" 2>&1 < /dev/null &
for i in $(seq 1 30); do
  ss -tln 2>/dev/null | grep -q ":3000" && ss -tln 2>/dev/null | grep -q ":8000" && break
  sleep 1
done

echo "== long trip: Los Angeles -> Denver -> Chicago =="
curl -s -m 120 -X POST http://127.0.0.1:3000/api/trips/plan/ \
  -H "Content-Type: application/json" \
  -d '{"current_location":"Los Angeles, CA","pickup_location":"Denver, CO","dropoff_location":"Chicago, IL","current_cycle_used":50,"driver_name":"Jane Smith","carrier_name":"TransAmerica Freight","truck_number":"TR-88","trailer_number":"TL-40","main_office":"Los Angeles, CA"}' \
  -o "$ROOT/scripts/long_response.json" -w "plan: HTTP %{http_code} in %{time_total}s\n"

python3 - << 'PYEOF'
import json
d = json.load(open('/home/z/my-project/scripts/long_response.json'))
if 'error' in d: print('ERROR:', d); raise SystemExit(1)
print('route:', d['route']['distance_miles'], 'mi | tz:', d['trip']['home_terminal_timezone'])
for a in d['schedule']['activities']:
    print(f"  {a['start'][5:16]} {a['type']:18s} {a['duration_minutes']:6.1f}m {a['distance_miles']:7.1f}mi  {a['location']}")
h = d['hos_summary']
print('cycle:', h['cycle_used_before'], '+', h['cycle_planned'], '| remaining:', h['cycle_remaining_after'], '| restart:', h['restart_used'])
print('logs:', len(d['logs']))
for l in d['logs']:
    print(f"  Day {l['day_number']} {l['date']}: miles={l['miles']} drive={l['driving_hours']} onduty={l['on_duty_hours']} sleep={l['sleeper_hours']} off={l['off_duty_hours']} sum={l['total_hours']}")
print('markers:', [(m['type'], m['location']) for m in d['markers']])
PYEOF

TRIP_ID=$(python3 -c "import json; print(json.load(open('$ROOT/scripts/long_response.json'))['trip']['id'])")
echo "== PDF download for trip $TRIP_ID =="
curl -s -o "$ROOT/scripts/all_logs.pdf" -w "pdf: HTTP %{http_code}, %{size_download} bytes\n" "http://127.0.0.1:3000/api/trips/$TRIP_ID/logs/pdf/"
head -c 5 "$ROOT/scripts/all_logs.pdf" | echo "$(cat -); done"

echo "== invalid address error handling =="
curl -s -m 60 -X POST http://127.0.0.1:3000/api/trips/plan/ -H "Content-Type: application/json" \
  -d '{"current_location":"Xyzzy Notaplace 99999","pickup_location":"Denver, CO","dropoff_location":"Chicago, IL","current_cycle_used":0}' -w " [%{http_code}]\n"

pkill -f "agent-browser" 2>/dev/null
echo done
