#!/usr/bin/env bash
# Starts the TruckHOS Planner stack:
#   1. Django backend (DRF) on :8000 (background, auto-restart loop)
#   2. React (Vite) frontend on :3000 (foreground — keeps the supervisor happy)
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PY="$BACKEND/venv/bin/python"

# ------------------------------------------------------------------
# Django backend on :8000
# ------------------------------------------------------------------
start_backend() {
  cd "$BACKEND"
  # Apply migrations (idempotent) then run the dev server.
  # NOTE: no `exec` here — exec would replace this subshell and kill the
  # supervision loop on the first backend exit.
  "$PY" manage.py migrate --no-input >/dev/null 2>&1 || true
  "$PY" manage.py runserver 0.0.0.0:8000 --noreload
}

# Supervise the backend: restart it if it ever dies.
(
  while true; do
    start_backend
    sleep 1
  done
) >"$ROOT/backend_server.log" 2>&1 &

BACKEND_PID=$!
echo "[start.sh] Django backend supervising (group $BACKEND_PID) on :8000"

# ------------------------------------------------------------------
# React frontend on :3000 (foreground)
# ------------------------------------------------------------------
cd "$FRONTEND"
exec bun run dev
