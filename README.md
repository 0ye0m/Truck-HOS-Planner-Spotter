<div align="center">

# 🛣️ TruckHOS Planner

**Plan FMCSA-compliant truck trips and generate filled daily ELD driver logs.**

React + TypeScript · Django + Django REST Framework · OpenStreetMap stack

[![Backend tests](https://img.shields.io/badge/backend%20tests-80%20pass-brightgreen)](#testing)
[![Frontend tests](https://img.shields.io/badge/frontend%20tests-37%20pass-brightgreen)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![React 18](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Django](https://img.shields.io/badge/Django-6.1-44b78b)](https://www.djangoproject.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-informational)](#license)

[Live demo](#-live-demo) · [Features](#-features) · [How HOS scheduling works](#-hos-scheduling-logic) · [API](#-api-documentation) · [Deploy](#-deployment)

</div>

---

> ⚠️ **Disclaimer** — this application implements the assumptions specified in the
> assessment brief. It is a demonstration project, **not** legal or compliance advice
> and **not** a certified ELD.

## 📸 Screenshots

| | |
|---|---|
| ![Trip planner — clean marketplace-style form with live US location suggestions and a real-time estimate strip](docs/screenshots/home.png) | ![Full results — trip summary, live HOS availability bars, route map, timeline](docs/screenshots/plan-results.png) |
| **Trip planner** — real-time location selectors, cycle slider, live estimate | **Results overview** — summary · HOS availability · route · ETA |
| ![Interactive route map with all planned stops, legend and zoom controls](docs/screenshots/route-map.png) | ![Industry-grade turn-by-turn directions with maneuver icons and driver-style distances](docs/screenshots/turn-by-turn.png) |
| **Route map** — every fuel / rest / break stop plotted | **Turn-by-turn directions** — 52 maneuvers, leg accordions |
| ![Filled Drivers Daily Log sheet in the viewer modal](docs/screenshots/eld-log-modal.png) | ![Fully responsive on mobile](docs/screenshots/mobile.png) |
| **ELD log viewer** — real filled log sheet, one per day | **Responsive** — same product on a 390 px phone |

---

## ✨ Features

**Trip planning**
- 🇺🇸 **Real-time US location selectors** — instant local city/state matches plus a live
  OpenStreetMap suggestion layer (debounced, race-safe) for any address; popular freight
  hubs on focus; "use exact address" escape hatch.
- ⚡ **Live estimate before you commit** — a debounced dry-run shows miles, drive time,
  window usage and remaining 70/8 cycle while you type, with a COMPLIANT / HOS-review badge.
- 🎚️ **Cycle slider + advanced options** — driver, carrier, truck/trailer, main office,
  home-terminal timezone and start time when you need them.

**Route & schedule**
- 🗺️ **Interactive route map** (Leaflet + OSM tiles) with every stop plotted and color-coded:
  current, pickup, dropoff, fuel, 30-min breaks, 10-h overnight rests, 34-h restarts —
  each marker pop-up shows arrival/departure times and duration.
  The map is inert until clicked (Google-embed pattern): pan, scroll/pinch zoom, keyboard —
  and a **"Recenter on route"** chip appears whenever the route leaves the viewport.
- 🧭 **Industry-grade turn-by-turn directions** — real OSRM maneuver semantics rendered as
  navigation icons ("Turn right onto East Aliso Street", "Take the exit toward I 10 East:
  San Bernardino", "Take the 2nd exit at the roundabout"), bold road names, driver-style
  distances (550 ft → 0.2 mi → 22 mi), per-leg accordions with miles/drive time/step count.
- ⏱️ **Chronological route timeline** — the same canonical schedule the logs use, with
  day headers, duty chips and leg summaries.

**Compliance & logs**
- 📊 **Live HOS availability panel** — 70/8 cycle, 11-h driving limit and 14-h window as
  animated bars, plus next required break / next rest and totals — recomputed live from
  the same engine output.
- 📝 **Filled Drivers Daily Log sheets** — one per calendar day for long trips, drawn
  pixel-accurately on the standard grid: duty-status lines with vertical transitions,
  per-row totals that must sum to 24 h, remarks, shipping info and the 70/8 recap.
  Preview inline, inspect in a zoomable modal, download a day PNG or the whole trip as PDF.

---

## 🏗️ Tech stack

| Layer | Choice |
|---|---|
| Frontend | **React 18 + TypeScript**, Vite, Tailwind CSS, Leaflet, TanStack Query, Vitest + Testing Library |
| Backend | **Django + Django REST Framework**, Gunicorn + WhiteNoise, Pillow + ReportLab (log rendering), pytest-django |
| Maps (all free) | **Nominatim** geocoding · **OSRM** routing — cached, throttled and de-rated per public-API policy |

## 🧱 Architecture

```
React (Vite, TypeScript)
   │  REST (JSON) — same-origin /api via proxy in dev & prod rewrite in cloud
   ▼
Django + Django REST Framework
   ├── routing/   geocoding (Nominatim + in-memory cache) · OSRM routing
   │              · turn-by-turn instruction builder (maneuver-aware phrasing)
   ├── hos/       PURE scheduling engine — no Django, no network, fully unit-tested
   │              constants · state machine · scheduler · validators
   ├── eldlogs/   log-sheet template + Pillow renderer + PDF export
   └── trips/     models · serializers · service orchestration · views
   ▼
SQLite (dev) / PostgreSQL (prod, via DATABASE_URL)
```

### One canonical schedule — never a second calculation

```
Trip inputs
     ↓ geocode (Nominatim)        ← cached, US-focused
     ↓ route per leg (OSRM)       ← real geometry, miles, minutes, maneuvers
     ↓ HOS scheduler (hos/)       ← deterministic, explainable
     ↓ CANONICAL ACTIVITY TIMELINE
     ├── map markers (Leaflet)
     ├── turn-by-turn instructions
     ├── HOS summary + live availability
     └── daily ELD logs (split at local midnights → Pillow)
```

Every surface reads from the **same** activity list — the map, the timeline, the
summary and each log sheet can never disagree.

---

## 🧮 HOS scheduling logic

Implements the FMCSA *Interstate Truck Driver's Guide to Hours of Service* rules for a
**property-carrying driver on the 70-hour/8-day cycle, no adverse conditions**:

| Rule | Value | Reference |
|---|---|---|
| Driving limit | 11 h per driving period | §395.3(a)(3) |
| Driving window | 14 consecutive h — starts when any work begins | §395.3(a)(2) |
| 30-min break | after **8 cumulative** driving h; any ≥30-min consecutive non-driving period qualifies | §395.3(a)(3)(ii) |
| Daily reset | 10 consecutive h off duty / sleeper berth restarts the 11 h and 14 h clocks | §395.3(a)(1) |
| Cycle | 70 h on-duty in any rolling 8 days — only *driving* past the limit is a violation | §395.3(b) |
| Restart | 34 consecutive h off duty resets the cycle (applied automatically, **and explicitly labelled**) | §395.3(c) |

The engine tracks **driving hours, the 14-h window and the 70/8 cycle independently** —
it never conflates a window expiry (only driving is prohibited) with a cycle exhaustion
(driving must stop and a 34-h restart is scheduled, e.g. *"34-hour restart required to
continue trip"*).

**Deterministic priority** at every step — exactly one decision:

1. 70/8 cycle exhausted → **34-h restart** (explicit) or a structured *infeasible* error
2. 11 h driving / 14 h window exhausted → **10-h sleeper-berth reset**
3. 8 cumulative driving hours → **30-min break**
4. 1,000 miles since last fuel → **30-min fuel stop** (`FUEL_DURATION_MINUTES`)
5. otherwise → **drive the largest legal slice**

Plus: pickup & dropoff are exactly 1 h each (on-duty not driving — consumes window and
cycle, **not** the 11-h allowance, and doubles as a qualifying break); all times use the
home-terminal timezone derived from the trip start; every duty-status change writes a
remark; every day's four totals must equal exactly 24 h — verified programmatically, and
a schedule with any violation is never served as valid.

---

## 📡 API documentation

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/trips/plan/` | Full pipeline: geocode → route → schedule → validate → render logs |
| POST | `/api/trips/validate/` | Dry-run feasibility check (nothing persisted) |
| GET | `/api/trips/{id}/` | Stored trip detail (home-terminal timestamps) |
| GET | `/api/trips/{id}/route/` | Route geometry + per-leg turn-by-turn (maneuver + modifier per step) |
| GET | `/api/trips/{id}/logs/` | All daily logs (totals, miles, image URLs) |
| GET | `/api/trips/{id}/logs/{day}/` | One day's log data |
| GET | `/api/trips/{id}/logs/{day}/image/` | Rendered PNG of that log sheet |
| GET | `/api/trips/{id}/logs/pdf/` | **All daily logs as one PDF** |
| GET | `/api/geocode/suggest/?q=…` | Live US place suggestions (city/state + addresses) |
| GET | `/api/geocode/?q=…` | Geocoding helper (cached) |
| GET | `/api/health/` | Health + configured HOS rules |

Example:

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
  "trailer_number": "456"
}
```

**Errors are structured and friendly** — never a raw traceback:

```json
{ "error": "Pickup location could not be found. Try adding the city and state.",
  "code": "address-not-found" }
```

`400` invalid address · `422` HOS-infeasible (with the blocking rule) · `503` map service
unreachable — and the frontend maps every code to a human message with a retry path.

---

## 🧪 Testing

**Backend — 80 tests** (`backend/tests/`):

- `test_hos_engine.py` — the assessment accuracy scenarios + edges (zero-length legs,
  same locations, cycle 0/65/70, midnight crossings, validator mutation-catching)
- `test_invariants.py` — property-style sweep over 13 scenarios: chronological order,
  no gaps/overlaps, daily totals = exactly 1,440 min, 11 h / 14 h / 8 h-break / 70 h
  never violated, fuel threshold never exceeded, daily miles = route miles
- `test_api.py` — API contract with mocked geocoder/router, multi-day trips, error codes
- `test_router_instructions.py` — maneuver-aware instruction phrasing + payload contract
- `test_suggest.py` — live suggestions: shaping, dedup, upstream-failure degradation, cache

**Frontend — 37 tests** (Vitest + Testing Library): form behavior and payloads,
live-suggestion layer, live estimate strip, instruction rendering and distance formats,
maneuver-icon mapping, state handling, error mapper.

```bash
cd backend  && ./venv/bin/python -m pytest tests/ -v   # 80 passed
cd frontend && bun run test                             # 37 passed
```

---

## 🚀 Local development

```bash
# backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000

# frontend (new terminal)
cd frontend
bun install            # or: npm install
cp .env.example .env
bun run dev            # Vite on :3000 — proxies /api and /media to :8000
```

Open **http://localhost:3000** — the browser only ever talks to :3000. The planner form
ships three deterministic example trips (short trip / long haul / high cycle) for one-click QA.

---

## ☁️ Deployment

Three supported paths — pick one. All configs are in the repo root.

### Option A — Render (backend) + Vercel (frontend) — free, recommended

1. **Backend**: push this repo to GitHub → Render dashboard → **New → Blueprint** →
   pick the repo. `render.yaml` provisions the web service **and a free PostgreSQL**,
   sets `DJANGO_SECRET_KEY`, runs migrations and exposes `/api/health/` as the health check.
2. **Frontend**: Vercel → **New Project** → import the same repo (zero build config needed —
   `vercel.json` handles it). After the first deploy, edit `vercel.json` rewrites to point
   `REPLACE-WITH-YOUR-BACKEND.onrender.com` at your Render URL and redeploy — the browser
   stays same-origin, so **no CORS setup is required**.
3. *(Only if you prefer direct cross-origin calls)* set `VITE_API_BASE_URL` to the backend
   URL at Vercel build time **and** set `CORS_ALLOWED_ORIGINS` on Render to your Vercel URL.

> **Free-tier notes** — Render free instances sleep after ~15 min idle (first request wakes
> them in ~50 s) and the free Postgres expires after 30 days. Rendered ELD images live on
> the instance disk: they survive normal operation but are cleared on deploys — the API then
> answers with a friendly *"please re-plan the trip"*. Mount the commented disk in
> `render.yaml` (paid) for durable media. Netlify works identically via `netlify.toml`.

### Option B — Docker Compose (single VM / self-host)

```bash
DJANGO_SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(50))") \
  docker compose up --build
```

Frontend on **http://localhost:8080** (nginx serves the SPA and proxies `/api` + `/media`
to gunicorn), backend on **http://localhost:8000**. SQLite and rendered logs live on named
volumes. Swap in Postgres by adding a `db` service and setting `DATABASE_URL`.

### Option C — any static host + any Python host

`bun run build` produces `frontend/dist` (set `VITE_API_BASE_URL` to the backend origin).
The backend is a standard Gunicorn WSGI app — `collectstatic` + `migrate` + `gunicorn
config.wsgi:application` works on Render, Railway, Fly.io, EC2, …

---

## 📁 Project structure

```
├── backend/
│   ├── config/            settings (env-driven) · urls · wsgi
│   ├── hos/               ⚙️ pure HOS engine — constants · state · scheduler · validators
│   ├── routing/           geocoder + suggest · OSRM router · instruction builder
│   ├── eldlogs/           log-sheet geometry + Pillow renderer + PDF
│   ├── trips/             models · serializers · views · service orchestration
│   ├── tests/             80 tests (engine · invariants · API · instructions · suggest)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── features/      trip-planner · route-map · timeline · hos-summary · eld-logs
│   │   ├── components/    LocationInput (live suggestions) · RouteInstructions · …
│   │   ├── services/      api client (typed, structured errors)
│   │   └── types/         shared TypeScript contracts
│   ├── Dockerfile · nginx.conf
│   └── package.json
├── docs/screenshots/      the images above
├── docker-compose.yml     one-command production stack
├── render.yaml            backend blueprint + free Postgres
├── vercel.json / netlify.toml
└── README.md
```

---

## 📝 Assumptions & known limitations

- Property-carrying driver, 70 h/8-day cycle, **no adverse driving conditions**, no
  short-haul exceptions (isolated for extension in `hos/constants.py`).
- 30-min fuel stop, 1-h pickup and 1-h dropoff are named constants and visibly labelled —
  never hidden. A 30-min pre-trip on-duty period mirrors the assessment's example timeline
  (06:00 On Duty → 06:30 Driving); assumed departure is 06:00 home-terminal when unset.
- The 70/8 recap column B ("previous 7 days") uses the provided current-cycle value plus
  the trip's own days; day-by-day history beyond the inputs is a documented approximation.
- Stop labels come from reverse geocoding — real places when resolvable, otherwise an
  explicit "Planned fuel/rest stop". **Business names are never invented.**
- Sleeper-berth split provisions (7/3, 8/2) are not used; the simple 10-h reset is applied
  as permitted by the assessment assumptions.
- Route data comes from the OSRM demo server; if unreachable the API returns a friendly
  retry message — route data is never fabricated.

## 📄 License

[MIT](LICENSE) — free to use, study and adapt.
