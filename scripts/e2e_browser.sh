#!/usr/bin/env bash
# Browser interaction E2E: fill form -> plan -> verify map/timeline/logs UI.
set -u
ROOT=/home/z/my-project
LOG=$ROOT/scripts/e2e.log

cd "$ROOT"
setsid bash start.sh > "$LOG" 2>&1 < /dev/null &
for i in $(seq 1 30); do
  if ss -tln 2>/dev/null | grep -q ":3000" && ss -tln 2>/dev/null | grep -q ":8000"; then break; fi
  sleep 1
done
echo "stack up"

B="agent-browser"
$B set viewport 1440 900 2>/dev/null
$B open http://127.0.0.1:3000/ 2>&1 | tail -1
$B wait --load networkidle 2>&1 | tail -1

# Use the demo loader button, then submit
$B find text "Load demo trip" click 2>&1 | tail -1
sleep 0.5
$B find role button click --name "Plan Trip & Generate ELD Logs" 2>&1 | tail -1

# Wait for the plan to complete (HOS Availability card appears)
for i in $(seq 1 40); do
  if $B get text "body" 2>/dev/null | grep -q "legally schedulable"; then
    echo "plan complete after ~${i}x2s"; break
  fi
  sleep 2
done

$B screenshot "$ROOT/scripts/e2e_results_top.png" 2>&1 | tail -1
$B screenshot --full "$ROOT/scripts/e2e_results_full.png" 2>&1 | tail -1

# Verify key UI sections exist
BODY=$($B get text "body" 2>/dev/null)
echo "--- UI checks ---"
for needle in "Trip Summary" "Route Map" "Route Timeline" "Daily ELD Logs" "legally schedulable" "Download All Logs" "Indianapolis" "Columbus" "Fuel" "Overnight"; do
  if echo "$BODY" | grep -qi "$needle"; then echo "OK: $needle"; else echo "MISSING: $needle"; fi
done

# Open the log viewer modal
$B find text "View Log" click 2>&1 | tail -1
sleep 1.5
$B screenshot "$ROOT/scripts/e2e_logviewer.png" 2>&1 | tail -1
BODY2=$($B get text "body" 2>/dev/null)
echo "$BODY2" | grep -q "Day 1 of 1" && echo "OK: log viewer shows Day 1 of 1" || echo "CHECK: log viewer text"
echo "$BODY2" | grep -qi "Previous Day" && echo "OK: log viewer nav present"
$B press Escape 2>/dev/null
$B close 2>&1 | tail -1
echo "done"
