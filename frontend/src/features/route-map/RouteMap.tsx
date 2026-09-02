import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Marker as MarkerType, PlanPayload } from "@/types";

/**
 * Route map: current/pickup/dropoff + fuel/rest/overnight stops derived
 * from the canonical schedule. Markers use distinct SVG icons; clicking a
 * stop shows type, location, arrival, departure, duration and reason.
 */

const ICON_STYLES: Record<string, { bg: string; glyph: string; ring: string }> = {
  CURRENT: { bg: "#1d7a4f", glyph: "◎", ring: "#dcece4" },
  PICKUP: { bg: "#d97706", glyph: "📦", ring: "#fef3c7" },
  DROPOFF: { bg: "#dc2626", glyph: "🏁", ring: "#fee2e2" },
  FUEL: { bg: "#b45309", glyph: "⛽", ring: "#fef3c7" },
  REST_BREAK: { bg: "#64748b", glyph: "☕", ring: "#e2e8f0" },
  SLEEPER_BERTH: { bg: "#4338ca", glyph: "🛏", ring: "#e0e7ff" },
  RESTART_34H: { bg: "#0f172a", glyph: "↻", ring: "#e2e8f0" },
};

function buildIcon(type: string, major: boolean): L.DivIcon {
  const style =
    ICON_STYLES[type] ?? { bg: "#64748b", glyph: "•", ring: "#e2e8f0" };
  const size = major ? 34 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:${major ? "12px 12px 12px 4px" : "50%"};
      background:${style.bg};color:#fff;display:flex;align-items:center;justify-content:center;
      font-size:${major ? 16 : 12}px;box-shadow:0 0 0 3px ${style.ring}, 0 2px 6px rgba(0,0,0,.25);
      border:2px solid #fff;">${style.glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 6],
  });
}

/**
 * Fix Leaflet stale-size tile issues: invalidate the map size after mount
 * and fit the route bounds once the container has settled.
 */
function MapController({ geometry }: { geometry: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const timers = [100, 400, 900].map((delay) =>
      setTimeout(() => {
        map.invalidateSize();
        if (geometry.length > 1) {
          const bounds = L.latLngBounds(
            geometry.map(([lat, lon]) => L.latLng(lat, lon))
          );
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [geometry, map]);
  return null;
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
};

export default function RouteMap({ payload }: { payload: PlanPayload }) {
  const { route, markers, trip } = payload;
  const homeTz = trip.home_terminal_timezone;

  // Current-location marker: first coordinate of the route. The dropoff
  // endpoint does NOT get an extra marker here — the canonical schedule
  // already provides a DROPOFF marker with full popup details.
  const startCoord = route.geometry[0];

  const majorTypes = new Set(["PICKUP", "DROPOFF", "SLEEPER_BERTH", "RESTART_34H"]);

  const renderedMarkers: { marker: MarkerType; major: boolean }[] = markers
    .filter((m) => m.lat !== null && m.lon !== null)
    .map((m) => ({ marker: m, major: majorTypes.has(m.type) }));

  return (
    <div className="relative h-[420px] w-full">
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
        <MapController geometry={route.geometry} />
        <Polyline
          positions={route.geometry}
          pathOptions={{ color: "#1d7a4f", weight: 5, opacity: 0.85 }}
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

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[500] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] shadow-card">
        <p className="mb-1 font-semibold text-night-900">Legend</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            ["CURRENT", "Current location"],
            ["PICKUP", "Pickup (1 h)"],
            ["DROPOFF", "Dropoff (1 h)"],
            ["FUEL", "Fuel stop (30 min)"],
            ["SLEEPER_BERTH", "Overnight rest (10 h)"],
            ["RESTART_34H", "34-hour restart"],
          ].map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: ICON_STYLES[type]?.bg ?? "#64748b" }}
              />
              <span className="text-slate-600">{label}</span>
            </div>
          ))}
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
      <p className="font-bold text-slate-900">{title}</p>
      <p className="mt-0.5 text-slate-600">{location}</p>
      {rows.length > 0 && (
        <dl className="mt-2 space-y-1">
          {rows.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-slate-500">{key}:</dt>
              <dd className="font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
