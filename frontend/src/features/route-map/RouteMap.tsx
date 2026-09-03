import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Marker as MarkerType, PlanPayload } from "@/types";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CrosshairIcon,
  MapPinIcon,
} from "@/components/icons";

/**
 * Route map: current/pickup/dropoff + fuel/rest/overnight stops derived
 * from the canonical schedule. Markers are circular SVG badges; clicking a
 * stop shows type, location, arrival, departure, duration and reason.
 *
 * Interaction policy (full control, route never lost):
 *  - The map is INERT until the user clicks/taps it (Google-embed pattern):
 *    page scroll and one-finger touch scroll pass straight through, so the
 *    map can never hijack scrolling or drift out of route context.
 *  - After activation: drag-to-pan (with inertia), scroll-wheel zoom,
 *    double-click zoom, keyboard pan/zoom, and pinch zoom on touch.
 *  - A floating "Recenter on route" chip appears whenever the route is not
 *    fully in view, so the context is always one tap away.
 *  - Very generous maxBounds keep wild pans near the route corridor.
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
const MIN_ZOOM = 4;
const MAX_ZOOM = 16;

/** Actual route extent (used to detect "route fully in view"). */
function routeBounds(geometry: [number, number][]): L.LatLngBounds | null {
  if (geometry.length < 2) return null;
  return L.latLngBounds(geometry.map(([lat, lon]) => L.latLng(lat, lon)));
}

/**
 * Very generous roaming area: route extent padded 150% per side (min 2°)
 * so the user can explore the corridor freely but never wander off to
 * another region entirely.
 */
function roamingBounds(core: L.LatLngBounds | null): L.LatLngBounds | null {
  if (!core) return null;
  const sw = core.getSouthWest();
  const ne = core.getNorthEast();
  const padLat = Math.max((ne.lat - sw.lat) * 1.5, 2);
  const padLon = Math.max((ne.lng - sw.lng) * 1.5, 2);
  return L.latLngBounds(
    [sw.lat - padLat, sw.lng - padLon],
    [ne.lat + padLat, ne.lng + padLon]
  );
}

function fitToRoute(map: L.Map, geometry: [number, number][]) {
  if (geometry.length < 2) return;
  const bounds = L.latLngBounds(geometry.map(([lat, lon]) => L.latLng(lat, lon)));
  map.fitBounds(bounds, { padding: [48, 48], animate: true, duration: 0.4 });
}

/**
 * Mount-time sizing + fit, and keep the canvas in sync with layout changes
 * (accordions, window resizes) so tiles never render stale/clipped. Once
 * the user has taken manual control (activated) we only invalidateSize —
 * the viewport is theirs.
 */
function MapSetup({
  geometry,
  wrapperRef,
  onMap,
  activatedRef,
}: {
  geometry: [number, number][];
  wrapperRef: React.RefObject<HTMLDivElement>;
  onMap: (map: L.Map) => void;
  activatedRef: React.MutableRefObject<boolean>;
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

  // Track container size changes (desktop accordions, mobile rotation, etc.)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = `${el.offsetWidth}x${el.offsetHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${el.offsetWidth}x${el.offsetHeight}`;
      if (next === last) return;
      last = next;
      map.invalidateSize();
      if (!activatedRef.current && geometry.length > 1) fitToRoute(map, geometry);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, geometry, wrapperRef, activatedRef]);

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
  REST_BREAK: "30-MIN BREAK",
};

/** Shared look for the floating white map controls. */
const controlBtn =
  "flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-line bg-white text-night-700 shadow-pop transition hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-night-700";

export default function RouteMap({ payload }: { payload: PlanPayload }) {
  const { route, markers, trip } = payload;
  const homeTz = trip.home_terminal_timezone;
  const mapRef = useRef<L.Map | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(6);
  const [legendOpen, setLegendOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640
  );

  // ---- interaction state -------------------------------------------------
  // Inert until the user explicitly clicks the map (Google-embed pattern).
  const [activated, setActivated] = useState(false);
  const activatedRef = useRef(false);
  const [showHint, setShowHint] = useState(false);
  const [routeInView, setRouteInView] = useState(true);
  // react-leaflet v4 mounts children in a SECOND commit (after the Leaflet
  // map is created), so this component's own effects may run while mapRef is
  // still null. Any effect that needs the instance must re-run once the
  // ref callback below flips mapReady — otherwise it silently never binds.
  const [mapReady, setMapReady] = useState(false);

  const coreBounds = useMemo(() => routeBounds(route.geometry), [route.geometry]);
  const maxBounds = useMemo(() => roamingBounds(coreBounds), [coreBounds]);

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
      // QA/debugging handle — lets live tests assert on real map state.
      if (typeof window !== "undefined") {
        (window as unknown as { __tripMap?: L.Map }).__tripMap = map;
      }
      setZoomLevel(map.getZoom());
      map.on("zoomend", () => setZoomLevel(map.getZoom()));
      // Unlocks the effects below that bind to the instance.
      setMapReady(true);
    },
    []
  );

  // Enable/disable Leaflet interaction handlers on activation.
  // (react-leaflet v4 treats these options as init-only, so we toggle the
  // handlers directly — the reliable path.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    activatedRef.current = activated;
    const toggle = (handler: { enable(): void; disable(): void }, on: boolean) =>
      on ? handler.enable() : handler.disable();
    toggle(map.dragging, activated);
    toggle(map.doubleClickZoom, activated);
    toggle(map.keyboard, activated);
    // touchZoom (pinch) stays enabled at all times — a deliberate gesture.
  }, [activated, mapReady]);

  // Recenter affordance: show a chip whenever the route is not fully in
  // view so the context is always one tap away.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const check = () => {
      if (!coreBounds) return;
      try {
        setRouteInView(map.getBounds().contains(coreBounds));
      } catch {
        /* zero-size bounds during transitions — ignore */
      }
    };
    map.on("moveend", check);
    map.on("zoomend", check);
    check();
    return () => {
      map.off("moveend", check);
      map.off("zoomend", check);
    };
  }, [coreBounds, mapReady]);

  // Wheel zoom — non-passive listener on the wrapper. Before activation the
  // handler is a no-op: the page scrolls naturally and the map never
  // hijacks scrolling. After activation the wheel zooms the map
  // (ctrl+wheel = trackpad pinch, finer threshold).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let accum = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      const map = mapRef.current;
      if (!map || !activatedRef.current) return; // page scroll stays native
      e.preventDefault();
      const pinch = e.ctrlKey || e.metaKey;
      accum += e.deltaY;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (accum = 0), 180);
      const threshold = pinch ? 12 : 55;
      if (Math.abs(accum) >= threshold) {
        const steps = Math.max(1, Math.min(3, Math.round(Math.abs(accum) / 110)));
        if (accum < 0) map.zoomIn(steps);
        else map.zoomOut(steps);
        accum = 0;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const activate = () => {
    if (activated) return;
    setActivated(true);
    setShowHint(true);
    window.setTimeout(() => setShowHint(false), 4500);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of markers) c[m.type] = (c[m.type] ?? 0) + 1;
    return c;
  }, [markers]);

  return (
    <div ref={wrapperRef} className="relative h-[400px] w-full select-none sm:h-[520px]">
      <MapContainer
        center={[39.5, -86.0]}
        zoom={6}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        touchZoom
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        maxBounds={maxBounds ?? undefined}
        maxBoundsViscosity={0.6}
        className="h-full w-full rounded-b-xl"
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapSetup
          geometry={route.geometry}
          wrapperRef={wrapperRef}
          onMap={handleMap}
          activatedRef={activatedRef}
        />

        {/* White casing under the colored route for contrast on busy tiles */}
        <Polyline
          positions={route.geometry}
          pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }}
          interactive={false}
        />
        <Polyline
          positions={route.geometry}
          pathOptions={{ color: ROUTE_COLOR, weight: 5, opacity: 0.9 }}
          interactive={false}
        />

        {startCoord && (
          <Marker position={startCoord} icon={buildIcon("CURRENT", true)}>
            <Popup autoPan={false}>
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
            <Popup autoPan={false}>
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

      {/* Activation overlay — the map is inert until the first click/tap.
          touch-action:pan-y keeps vertical page scrolling native on touch. */}
      {!activated && (
        <button
          type="button"
          onClick={activate}
          aria-label="Activate map interaction: drag to pan, scroll or pinch to zoom"
          className="absolute inset-0 z-[560] flex cursor-pointer items-center justify-center bg-night-900/0 transition-colors hover:bg-night-900/[.03]"
          style={{ touchAction: "pan-y" }}
        >
          <span className="pointer-events-none flex items-center gap-2 rounded-full border border-line bg-white/95 px-4 py-2 text-xs font-semibold text-night-800 shadow-pop">
            <MapPinIcon size={14} className="text-brand-600" />
            Click to interact — drag to pan, scroll or pinch to zoom
          </span>
        </button>
      )}

      {/* Post-activation controls hint (auto-fades) */}
      {showHint && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-3 z-[560] -translate-x-1/2 rounded-full bg-night-900/85 px-4 py-1.5 text-[11px] font-medium text-white shadow-pop"
        >
          Drag to pan · scroll to zoom · double-click to zoom in
        </div>
      )}

      {/* Recenter chip — appears when the route is not fully in view.
          Sits top-center on mobile (above the tall open legend) and
          bottom-center on desktop; z-580 keeps it above the legend. */}
      {activated && !routeInView && (
        <button
          type="button"
          onClick={() => {
            if (mapRef.current) fitToRoute(mapRef.current, route.geometry);
          }}
          className="absolute left-1/2 top-14 z-[580] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-[11px] font-semibold text-night-800 shadow-pop transition hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:bottom-16 sm:top-auto"
        >
          <CrosshairIcon size={13} className="text-brand-600" />
          Recenter on route
        </button>
      )}

      {/* Zoom + fit controls (usable even before activation) */}
      <div className="absolute right-3 top-3 z-[570] flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoomLevel >= MAX_ZOOM}
          onClick={() => mapRef.current?.zoomIn()}
          className={controlBtn}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoomLevel <= MIN_ZOOM}
          onClick={() => mapRef.current?.zoomOut()}
          className={controlBtn}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Zoom to fit the full route"
          title="Fit route"
          onClick={() => mapRef.current && fitToRoute(mapRef.current, route.geometry)}
          className={controlBtn}
        >
          <CrosshairIcon size={16} />
        </button>
      </div>

      {/* Compact collapsible legend */}
      <div className="absolute bottom-3 left-3 z-[570] max-w-[calc(100%-5.5rem)] overflow-hidden rounded-lg border border-line bg-white/95 shadow-pop backdrop-blur">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold text-night-900"
        >
          <span className="flex items-center gap-1.5">
            <MapPinIcon size={12} className="text-night-500" />
            Legend
          </span>
          {legendOpen ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
        </button>
        {legendOpen && (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 px-3 pb-2 text-[11px] sm:grid-cols-2">
            {[
              ["CURRENT", "Current location"],
              ["PICKUP", "Pickup (1 h)"],
              ["DROPOFF", "Dropoff (1 h)"],
              ["FUEL", "Fuel stop (30 min)"],
              ["REST_BREAK", "30-min break"],
              ["SLEEPER_BERTH", "Overnight rest (10 h)"],
              ["RESTART_34H", "34-hour restart"],
            ].map(([type, label]) => {
              const count = type === "CURRENT" ? 1 : counts[type] ?? 0;
              if (type !== "CURRENT" && count === 0) return null;
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 flex-none rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: MARKER_STYLES[type]?.bg ?? "#64748b" }}
                  />
                  <span className="text-night-700">{label}</span>
                  <span className="rounded bg-canvas px-1 font-semibold tabular-nums text-night-700">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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
