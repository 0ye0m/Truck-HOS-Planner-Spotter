import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Marker as MarkerType, PlanPayload } from "@/types";

/**
 * Route map: current/pickup/dropoff + fuel/rest/overnight stops derived
 * from the canonical schedule. Markers are circular SVG badges; clicking a
 * stop shows type, location, arrival, departure, duration and reason.
 */

const MARKER_STYLES: Record<
  string,
  { bg: string; glyph: string; label: string }
> = {
  CURRENT: { bg: "#15803d", glyph: "pin", label: "Current location" },
  PICKUP: { bg: "#d97706", glyph: "package", label: "Pickup" },
  DROPOFF: { bg: "#dc2626", glyph: "flag", label: "Dropoff" },
  FUEL: { bg: "#0891b2", glyph: "droplet", label: "Fuel stop" },
  REST_BREAK: { bg: "#64748b", glyph: "coffee", label: "30-min break" },
  SLEEPER_BERTH: { bg: "#4f46e5", glyph: "bed", label: "Overnight rest" },
  RESTART_34H: { bg: "#0f172a", glyph: "restart", label: "34-hour restart" },
};

/** 24×24 white stroke glyphs embedded inline (no emoji, crisp at any zoom). */
const GLYPHS: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  package:
    '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  droplet:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  coffee:
    '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  restart:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
};

function buildIcon(type: string, major: boolean): L.DivIcon {
  const style =
    MARKER_STYLES[type] ??
    { bg: "#64748b", glyph: "pin", label: "Stop" };
  const size = major ? 34 : 26;
  const glyphSize = major ? 16 : 13;
  const svg = `<svg width="${glyphSize}" height="${glyphSize}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[style.glyph] ?? GLYPHS.pin}</svg>`;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${style.bg};display:flex;align-items:center;justify-content:center;
      box-shadow:0 0 0 3px rgba(255,255,255,.95), 0 2px 8px rgba(0,0,0,.35);
      border:2px solid #fff;">${svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 6],
  });
}

const ROUTE_COLOR = "#276EF1";

/**
 * Fix Leaflet stale-size tile issues after mount; auto-fit the route once.
 */
function MapSetup({
  geometry,
  onMap,
}: {
  geometry: [number, number][];
  onMap: (map: L.Map) => void;
}) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    onMap(map);
    const timers = [100, 400].map((delay) =>
      setTimeout(() => {
        map.invalidateSize();
        if (!fitted.current && geometry.length > 1) {
          fitted.current = true;
          fitToRoute(map, geometry);
        }
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [geometry, map, onMap]);

  return null;
}

function fitToRoute(map: L.Map, geometry: [number, number][]) {
  if (geometry.length < 2) return;
  const bounds = L.latLngBounds(geometry.map(([lat, lon]) => L.latLng(lat, lon)));
  map.fitBounds(bounds, { padding: [44, 44] });
}

function formatTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

const TYPE_LABELS: Record<string, string> = {
  PICKUP: "PICKUP STOP",
  DROPOFF: "DROPOFF STOP",
  FUEL: "FUEL STOP",
  SLEEPER_BERTH: "OVERNIGHT REST",
  RESTART_34H: "34-HOUR RESTART",
  REST_BREAK: "30-MIN BREAK",
};

export default function RouteMap({ payload }: { payload: PlanPayload }) {
  const { route, markers, trip } = payload;
  const homeTz = trip.home_terminal_timezone;
  const mapRef = useRef<L.Map | null>(null);

  // Current-location marker: first coordinate of the route. The dropoff
  // endpoint does NOT get an extra marker here — the canonical schedule
  // already provides a DROPOFF marker with full popup details.
  const startCoord = route.geometry[0];

  const majorTypes = new Set(["PICKUP", "DROPOFF", "SLEEPER_BERTH", "RESTART_34H"]);

  const renderedMarkers: { marker: MarkerType; major: boolean }[] = markers
    .filter((m) => m.lat !== null && m.lon !== null)
    .map((m) => ({ marker: m, major: majorTypes.has(m.type) }));

  const handleMap = useMemo(
    () => (map: L.Map) => {
      mapRef.current = map;
    },
    []
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of markers) c[m.type] = (c[m.type] ?? 0) + 1;
    return c;
  }, [markers]);

  return (
    <div className="relative h-[400px] w-full sm:h-[500px]">
      <MapContainer
        center={[39.5, -86.0]}
        zoom={6}
        scrollWheelZoom
        className="h-full w-full rounded-b-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapSetup geometry={route.geometry} onMap={handleMap} />

        {/* White casing under the colored route for contrast on busy tiles */}
        <Polyline
          positions={route.geometry}
          pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }}
        />
        <Polyline
          positions={route.geometry}
          pathOptions={{ color: ROUTE_COLOR, weight: 5, opacity: 0.9 }}
        />

        {startCoord && (
          <Marker position={startCoord} icon={buildIcon("CURRENT", true)}>
            <Popup>
              <PopupBody
                title="CURRENT LOCATION"
                location={trip.current_location}
                rows={[]}
              />
            </Popup>
          </Marker>
        )}

        {renderedMarkers.map(({ marker, major }, index) => (
          <Marker
            key={`${marker.type}-${index}`}
            position={[marker.lat, marker.lon]}
            icon={buildIcon(marker.type, major)}
          >
            <Popup>
              <PopupBody
                title={TYPE_LABELS[marker.type] ?? marker.label.toUpperCase()}
                location={marker.location}
                rows={[
                  ["Arrival", formatTime(marker.arrival, homeTz)],
                  ["Departure", formatTime(marker.departure, homeTz)],
                  [
                    "Duration",
                    marker.duration_minutes >= 60
                      ? `${Math.floor(marker.duration_minutes / 60)} h ${Math.round(marker.duration_minutes % 60)} min`
                      : `${Math.round(marker.duration_minutes)} min`,
                  ],
                  ...(marker.note ? [["Reason", marker.note] as [string, string]] : []),
                ]}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map controls */}
      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => mapRef.current && fitToRoute(mapRef.current, route.geometry)}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-night-700 shadow-card transition hover:border-ink hover:text-ink"
          title="Zoom to fit the full route"
        >
          Fit route
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[500] rounded-lg border border-line bg-white/95 px-3 py-2 text-[11px] shadow-card backdrop-blur">
        <p className="mb-1 font-semibold text-night-900">Legend</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            ["CURRENT", "Current location"],
            ["PICKUP", "Pickup (1 h)"],
            ["DROPOFF", "Dropoff (1 h)"],
            ["FUEL", "Fuel stop (30 min)"],
            ["REST_BREAK", "30-min break"],
            ["SLEEPER_BERTH", "Overnight rest (10 h)"],
            ["RESTART_34H", "34-hour restart"],
          ].map(([type, label]) => {
            const count =
              type === "CURRENT"
                ? 1
                : counts[type] ?? 0;
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 flex-none rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: MARKER_STYLES[type]?.bg ?? "#64748b" }}
                />
                <span className="text-night-700">{label}</span>
                {count > 0 && (
                  <span className="rounded bg-canvas px-1 font-semibold tabular-nums text-night-700">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PopupBody({
  title,
  location,
  rows,
}: {
  title: string;
  location: string;
  rows: [string, string][];
}) {
  return (
    <div className="min-w-[220px] text-[13px]">
      <p className="text-[11px] font-bold tracking-wide text-brand-700">{title}</p>
      <p className="mt-0.5 text-sm font-semibold text-night-900">{location}</p>
      {rows.length > 0 && (
        <dl className="mt-2 space-y-1 border-t border-line pt-2">
          {rows.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-night-500">{key}:</dt>
              <dd className="text-right font-medium tabular-nums text-night-800">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
