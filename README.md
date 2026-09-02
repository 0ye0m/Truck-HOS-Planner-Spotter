# TruckHOS Planner 🛣️

**Plan FMCSA-compliant truck routes and generate daily ELD driver logs.**

A production-quality full-stack application built for the Full Stack Developer
assessment. Enter trip details, and the app computes a legal driving schedule
under FMCSA property-carrier Hours of Service rules, displays the route and
all required stops on an interactive map, and generates accurately filled
Daily Driver's Log / ELD sheets — one per calendar day for long trips.

> ⚠️ **Disclaimer:** this application implements the assumptions specified in
> the assessment and should not be treated as legal/compliance advice.

---

## Table of contents

1. [Live demo](#live-demo)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [How it works](#how-it-works)
5. [HOS scheduling logic](#hos-scheduling-logic)
6. [API documentation](#api-documentation)
7. [ELD log rendering](#eld-log-rendering)
8. [Testing](#testing)
9. [Local development](#local-development)
10. [Deployment](#deployment)
11. [Assumptions & known limitations](#assumptions--known-limitations)

---

## Live demo

| Piece | Where |
|---|---|
| Frontend (React + TypeScript) | hosted on Vercel — see deployment notes below |
| Backend (Django + DRF) | hosted on Render — see deployment notes below |

The repo is GitHub-ready: `backend/`, `frontend/`, deployment configs
(`render.yaml`, `vercel.json`) and `.env.example` files are all included.

## Tech stack

**Frontend** — React 18 + **TypeScript**, Vite, Tailwind CSS,
Leaflet + OpenStreetMap tiles, TanStack Query.

**Backend** — **Django** + **Django REST Framework**, SQLite for development
(PostgreSQL-ready via `DATABASE_URL`), Pillow for ELD log rendering.

**Free/open map stack** (as required — no Google Maps):

- **Nominatim** (OpenStreetMap) for geocoding & reverse geocoding
- **OSRM** for routing, geometry and turn-by-turn instructions
- Cached + throttled per public API usage policies

## Architecture

```
React (Vite, TypeScript)
   |
   | REST API (JSON)
   v
Django + Django REST Framework
   |
   +-- routing/   geocoding service (Nominatim + cache)
   |              routing service (OSRM)
   |              stop labeling (reverse geocode, no fabricated names)
   |
   +-- hos/       PURE scheduling engine (no Django/network imports)
   |              constants · state machine · scheduler · validators
   |
   +-- eldlogs/   log sheet template + renderer (Pillow) + PDF export
   |
   +-- trips/     models · serializers · service orchestration · views
   |
   v
SQLite (dev) / PostgreSQL (production)
```

The **HOS engine is independent from Django views** and from the UI — it is a
pure-Python package (`backend/hos/`) that can be unit tested directly
(`backend/tests/test_hos_engine.py`).

### The one canonical schedule

```
Trip Inputs
     ↓ Geocoding (Nominatim)
     ↓ Routing (OSRM, per leg)
     ↓ HOS Scheduler (hos/scheduler.py)
     ↓ CANONICAL ACTIVITY TIMELINE
     ├── Map markers (Leaflet)
     ├── Route instructions
     ├── HOS summary
     └── Daily ELD logs (split at local midnights → Pillow renderer)
```

There is **never** a second scheduling calculation: the map, timeline,
summary and the log sheets all consume the same activity list
(`trips/services.py` → `hos/daily.py`).

## How it works

1. The user enters **current location, pickup, dropoff, current cycle used**
   (plus optional driver/carrier/vehicle/start info).
2. The backend geocodes all three locations (cached; friendly errors for
   invalid addresses).
3. The home-terminal time zone is derived from the current location's state
   (or supplied explicitly in advanced options).
4. OSRM routes each leg (current→pickup, pickup→dropoff) returning real
   distance (converted to miles), duration and geometry.
5. The deterministic HOS scheduler produces the activity timeline.
6. Every schedule passes a full validator suite before it is served —
   a schedule containing a violation is never returned as valid.
7. Stop positions (fuel/rest/restart) are interpolated along the route
   geometry and labelled with real nearby places via reverse geocoding —
   or clearly marked `"Planned fuel stop"` / `"Planned rest stop"` when no
   place can be resolved. **Business names are never fabricated.**
8. The timeline is split at local midnights into complete 24-hour days and
   each day is rendered onto a high-resolution Driver's Daily Log sheet.
9. The frontend shows the HOS summary, interactive map, chronological
   timeline and an ELD log viewer (prev/next day, zoom, per-day PNG and
   all-days PDF download).

## HOS scheduling logic

The engine implements the FMCSA *"Interstate Truck Driver's Guide to Hours
of Service for Property Carriers"* rules for a **property-carrying driver on
the 70-hour/8-day cycle, no adverse conditions**:

| Rule | Value | Reference |
|---|---|---|
| Driving limit | 11 h per driving period | §395.3(a)(3) |
| Driving window | 14 consecutive h — starts when any work begins | §395.3(a)(2) |
| 30-min break | after **8 cumulative** (not consecutive) driving h; any consecutive ≥30-min non-driving period qualifies (off duty, sleeper berth **or on-duty-not-driving**) | §395.3(a)(3)(ii) |
| Daily reset | 10 consecutive h off duty / sleeper berth restarts the 11 h and 14 h clocks | §395.3(a)(1) |
| Cycle | 70 h on-duty in any rolling 8 days — only *driving* past the limit is a violation | §395.3(b) |
| Restart | 34 consecutive h off duty / sleeper resets the cycle (optional, applied automatically and **explicitly** when needed) | §395.3(c) |

### The three limits are tracked independently

The engine never confuses:

- **A.** driving hours in the current period,
- **B.** the 14-hour window, and
- **C.** the rolling 70/8 on-duty cycle.

A driver can have driving/window capacity left but no cycle hours — in that
case driving stops and an explicit 34-hour restart is scheduled
(`"34-hour restart required to continue trip"`). The cycle can also stop
driving mid-window, and the window can expire while non-driving work
(pickup/dropoff) continues legally — only *driving* is prohibited after the
window expires.

### Deterministic scheduling strategy

At every step the scheduler inserts exactly one activity based on the first
blocking condition (priority order):

1. 70/8 cycle exhausted → **34-hour restart** (explicit) or infeasible error
2. 11 h driving / 14 h window exhausted → **10-hour sleeper-berth reset**
3. 8 cumulative driving hours → **30-minute break** (off duty)
4. 1,000 miles since last fuel → **30-minute fuel stop** (on-duty not driving)
5. otherwise → **drive the largest legal slice**

Additional rules:

- **Pickup and dropoff** are exactly 1 h each, logged as *on duty not
  driving* — they consume the window and the cycle but **not** the 11-hour
  driving allowance. A 1-hour loading stop also satisfies the 30-minute
  break rule (it is a consecutive non-driving period ≥ 30 min).
- **Fueling** (30 min, named constant `FUEL_DURATION_MINUTES`) is placed so
  no driving stretch exceeds 1,000 miles, never after a legal driving
  threshold has already been exceeded, and it doubles as a qualifying break.
- **Time base:** all logs use the home-terminal time zone (derived from the
  starting location's state, override in advanced options). Crossing
  state/time-zone lines never changes the log's time base.
- **Remarks:** every duty-status change produces a remark with time, place
  (city/state — reverse geocoded) and the new duty status.
- **Totals:** each daily log's four status totals must equal exactly 24 h —
  verified programmatically; the backend refuses to serve a log that fails.

## API documentation

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/trips/plan/` | Full pipeline: geocode → route → schedule → validate → render logs. Returns trip, route, schedule, hos_summary, markers, logs. |
| POST | `/api/trips/validate/` | Dry-run feasibility check (nothing persisted). |
| GET | `/api/trips/{id}/` | Stored trip detail. |
| GET | `/api/trips/{id}/route/` | Route geometry + per-leg turn-by-turn. |
| GET | `/api/trips/{id}/logs/` | All daily logs (totals, miles, image URLs). |
| GET | `/api/trips/{id}/logs/{day}/` | One day's log data. |
| GET | `/api/trips/{id}/logs/{day}/image/` | Rendered PNG of that log sheet. |
| GET | `/api/trips/{id}/logs/pdf/` | **All daily logs as one PDF.** |
| GET | `/api/geocode/?q=…` | Geocoding helper (cached). |
| GET | `/api/health/` | Health + configured HOS rules. |

Example request:

```json
POST /api/trips/plan/
{
  "current_location": "Chicago, IL",
  "pickup_location": "Indianapolis, IN",
  "dropoff_location": "Columbus, OH",
  "current_cycle_used": 32,
  "driver_name": "John Doe",
  "carrier_name": "ACME Freight LLC",
  "truck_number": "123",
  "trailer_number": "456",
  "main_office": "Chicago, IL"
}
```

Input validation: all locations non-empty; `0 ≤ current_cycle_used ≤ 70`;
useful HTTP status codes (400 invalid address, 503 map service unavailable,
422 HOS infeasible, …); errors are structured, never raw tracebacks.

## ELD log rendering

The renderer (`backend/eldlogs/`) draws the **actual log sheet** — replicating
the supplied blank Driver's Daily Log layout at 200 dpi (landscape letter):

- header: date, From/To, total miles driving today, total mileage, carrier,
  truck/tractor + trailer numbers, main office, home terminal, driver
  signature, co-driver
- the 24-hour graph grid with hour/half-hour ticks and the four official
  duty-status rows (Off Duty, Sleeper Berth, Driving, On Duty Not Driving)
- solid duty lines with **vertical transitions at every status change**
- per-row totals in the right-hand column (must sum to 24 h)
- remarks, shipping docs section and the 70/8 recap (A/B/C values, with a
  note when a 34-hour restart was taken)

All positions are computed mathematically from centralized constants
(`eldlogs/coordinates.py`: `GRID_X`, `GRID_WIDTH`, `ROW_HEIGHT`,
`HOUR_WIDTH`, …) — no scattered pixel values. Missing optional info renders
as `"Not provided"` (never fabricated). Each PDF page preserves the sheet's
visual layout.

## Testing

35+ automated tests (`backend/tests/`) cover the 15 assessment accuracy
scenarios plus edge cases:

1. short trip below all limits
2. trip requiring a 30-minute break
3. trip requiring an overnight 10-hour rest
4. trip requiring multiple daily logs
5. trip requiring a fuel stop
6. cycle near 70 (65 h) — schedule cannot exceed the remaining cycle
7. trip crossing midnight — clean day split
8. pickup/dropoff consume exactly 1 h each (and not driving hours)
9. break inserted exactly at 8 cumulative driving hours
10. no driving after the 14-hour window expires
11. driving stops at exactly 11 hours
12. 34-hour restart scenario (explicit, resets cycle)
13. every daily log totals exactly 24 hours
14. daily miles sum exactly to trip driving miles
15. map/timeline/logs all derive from the one canonical schedule

plus: zero-length legs, same current/pickup location, cycle 0 / 70 / >70,
violating schedules are caught by validators, stop positions lie on the
route, API contract & error handling, PNG & PDF outputs.

```bash
cd backend && ./venv/bin/python -m pytest tests/ -v
```

## Local development

```bash
# --- backend ---
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000

# --- frontend ---
cd ../frontend
bun install        # or npm install
cp .env.example .env
bun run dev        # Vite on :3000, proxies /api -> :8000
```

Open http://localhost:3000. A one-command start (`bash start.sh` from the
repo root) launches both services.

## Deployment

**Backend → Render** (`render.yaml` included): Python web service, root dir
`backend`, build = install + migrate + collectstatic, start = gunicorn. Set
the env vars from `backend/.env.example` (DJANGO_SECRET_KEY, DATABASE_URL
with a Postgres instance, CORS_ALLOWED_ORIGINS pointing at the frontend
domain, DJANGO_ALLOWED_HOSTS).

**Frontend → Vercel** (`vercel.json` included): builds `frontend/`, rewrites
`/api/*` and `/media/*` to the backend URL (or set `VITE_API_BASE_URL` to
the backend origin instead).

**Database → PostgreSQL**: set `DATABASE_URL` — the settings file switches
from SQLite automatically.

## Assumptions & known limitations

- Property-carrying driver, 70 h/8-day cycle, **no adverse driving
  conditions** exception, no short-haul exceptions (isolated for future
  extension in `hos/constants.py`).
- Fuel stop duration 30 min and pickup/dropoff 1 h are named constants
  (`hos/constants.py`), displayed on the timeline — never hidden.
- A 30-minute pre-trip on-duty period (inspection/paperwork) is included and
  visibly labelled, mirroring the assessment's example timeline (06:00 On
  Duty → 06:30 Driving). If no start time is provided, 06:00 home-terminal
  is the clearly marked assumed departure.
- The 70/8 recap column B ("previous 7 days") uses the single provided
  current-cycle value plus prior trip days; day-by-day history beyond the
  trip inputs is not modelled (documented approximation).
- Stop labels use reverse-geocoded real places when available; otherwise
  stops are explicitly labelled "Planned fuel/rest stop" — business names
  are never invented.
- Sleeper-berth **split-sleeper** provisions (7/3 or 8/2 pairing) are not
  used by the scheduling strategy; the simple 10-hour reset is applied (as
  permitted by the assessment assumptions).
- Route data comes from the OSRM demo server; if it is unreachable the API
  returns a friendly retry message — route data is never fabricated.
