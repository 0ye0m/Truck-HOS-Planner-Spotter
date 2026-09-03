#!/usr/bin/env bash
# Section screenshots: map / timeline / ELD logs / log viewer modal.
set -u
ROOT=/home/z/my-project
LOG=$ROOT/scripts/e2e.log
cd "$ROOT"
setsid bash start.sh > "$LOG" 2>&1 < /dev/null &
for i in $(seq 1 30); do
  if ss -tln 2>/dev/null | grep -q ":3000" && ss -tln 2>/dev/null | grep -q ":8000"; then break; fi
  sleep 1
done

B="agent-browser"
$B set viewport 1440 900 2>/dev/null
$B open http://127.0.0.1:3000/ 2>&1 | tail -1
$B wait --load networkidle 2>&1 | tail -1
$B find text "Load demo trip" click 2>&1 | tail -1
$B find role button click --name "Plan Trip & Generate ELD Logs" 2>&1 | tail -1
for i in $(seq 1 40); do
  $B get text "body" 2>/dev/null | grep -q "legally schedulable" && break
  sleep 2
done
sleep 2  # let leaflet tiles settle

# scroll to the map section
$B eval "document.querySelectorAll('h2').forEach(h=>{if(h.textContent.trim()==='Route Map') h.scrollIntoView({block:'start'})}); 'ok'" > /dev/null 2>&1
sleep 1
$B screenshot "$ROOT/scripts/e2e_map.png" 2>&1 | tail -1

# timeline
$B eval "document.querySelectorAll('h2').forEach(h=>{if(h.textContent.trim()==='Route Timeline') h.scrollIntoView({block:'start'})}); 'ok'" > /dev/null 2>&1
sleep 1
$B screenshot "$ROOT/scripts/e2e_timeline.png" 2>&1 | tail -1

# ELD logs panel
$B eval "document.querySelectorAll('h2').forEach(h=>{if(h.textContent.trim()==='Daily ELD Logs') h.scrollIntoView({block:'start'})}); 'ok'" > /dev/null 2>&1
sleep 1
$B screenshot "$ROOT/scripts/e2e_eldpanel.png" 2>&1 | tail -1

# open the log viewer via JS click (leaflet container interception workaround)
$B eval "const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='View Log'); btns[0]?.click(); 'clicked'" 2>&1 | tail -1
sleep 2
$B screenshot "$ROOT/scripts/e2e_logviewer.png" 2>&1 | tail -1
$B get text "body" 2>/dev/null | grep -o "Day 1 of 1[^\"]*" | head -1
$B eval "const nb=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Next Day')); nb? nb.disabled : 'notfound'" 2>&1 | tail -1
$B close 2>&1 | tail -1
echo done
