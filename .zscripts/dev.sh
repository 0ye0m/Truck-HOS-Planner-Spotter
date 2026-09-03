#!/usr/bin/env bash
# =============================================================================
# TruckHOS Planner — sandbox boot script (run by the container at start-up,
# also safe to run manually: bash .zscripts/dev.sh)
#
# Idempotent + self-healing:
#   1. Rebuilds backend venv + installs requirements if missing
#   2. Rebuilds frontend node_modules if missing
#   3. Applies Django migrations (idempotent)
#   4. Supervises Django (:8000) and Vite (:3000) forever, restarting either
#      if it dies, and re-installing dependencies if the sandbox wiped them.
# Port-guarded: never starts a second instance on an occupied port.
# =============================================================================
set -u

ROOT="/home/z/my-project"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
LOG="$ROOT/dev_boot.log"

log() { echo "[dev.sh $(date '+%H:%M:%S')] $*" >> "$LOG"; }

port_in_use() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.4)
try:
    s.connect(("127.0.0.1", int(sys.argv[1])))
    print("yes")
except Exception:
    print("no")
finally:
    s.close()
PY
}

ensure_backend_deps() {
  if [ ! -x "$BACKEND/venv/bin/python" ]; then
    log "venv missing -> creating"
    ( cd "$BACKEND" && python3 -m venv venv >> "$LOG" 2>&1 \
      && venv/bin/pip install --quiet -r requirements.txt >> "$LOG" 2>&1 )
    log "venv ready (rc=$?)"
  fi
}

ensure_frontend_deps() {
  if [ ! -d "$FRONTEND/node_modules" ] || [ ! -e "$FRONTEND/node_modules/.bin/vite" ]; then
    log "node_modules missing -> bun install"
    ( cd "$FRONTEND" && bun install >> "$LOG" 2>&1 )
    log "bun install done (rc=$?)"
  fi
}

start_django() {
  [ "$(port_in_use 8000)" = "yes" ] && return 0
  ensure_backend_deps
  ( cd "$BACKEND" && venv/bin/python manage.py migrate --no-input >> "$LOG" 2>&1 )
  log "migrations applied; starting Django"
  ( cd "$BACKEND" && exec venv/bin/python manage.py runserver 0.0.0.0:8000 --noreload ) \
    >> "$LOG" 2>&1 &
}

start_vite() {
  [ "$(port_in_use 3000)" = "yes" ] && return 0
  ensure_frontend_deps
  log "starting Vite"
  ( cd "$FRONTEND" && exec bun run dev ) >> "$ROOT/frontend_server.log" 2>&1 &
}

# ---------------- first boot ----------------
: > "$LOG"
log "=== dev.sh boot start ==="
ensure_backend_deps
ensure_frontend_deps

# ---------------- supervision loop ----------------
while true; do
  if ! start_django; then sleep 2; fi
  if ! start_vite;  then sleep 2; fi
  sleep 5
done
