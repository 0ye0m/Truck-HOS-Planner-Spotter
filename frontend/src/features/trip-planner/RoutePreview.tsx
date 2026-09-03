import { useEffect, useRef, useState } from "react";
import { validateTrip, type ValidateResponse } from "@/services/api";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  GaugeIcon,
  RouteIcon,
} from "@/components/icons";

/**
 * Real-time route estimate: while the three locations are being typed,
 * a debounced dry-run against /api/trips/validate/ streams back the live
 * distance / driving time / compliance verdict — the same numbers the full
 * plan will produce (one shared preparation stage server-side).
 *
 * Behavioral contract:
 *  - Renders NOTHING until all three locations have ≥ 3 characters.
 *  - Aborts the in-flight estimate whenever inputs change.
 *  - Any failure degrades silently (the full plan still reports errors).
 */

const MIN_CHARS = 3;
const DEBOUNCE_MS = 700;

interface Props {
  currentLocation: string;
  pickupLocation: string;
  dropoffLocation: string;
  cycleUsed: string;
}

type Phase =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: ValidateResponse }
  | { status: "hint"; message: string };

export default function RoutePreview({
  currentLocation,
  pickupLocation,
  dropoffLocation,
  cycleUsed,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const current = currentLocation.trim();
  const pickup = pickupLocation.trim();
  const dropoff = dropoffLocation.trim();
  const ready =
    current.length >= MIN_CHARS &&
    pickup.length >= MIN_CHARS &&
    dropoff.length >= MIN_CHARS;
  const requestKey = `${current}|${pickup}|${dropoff}|${cycleUsed}`;

  useEffect(() => {
    if (!ready) {
      abortRef.current?.abort();
      setPhase({ status: "idle" });
      return;
    }
    setPhase({ status: "loading" });
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const parsed = Number(cycleUsed);
      const cycle = Number.isFinite(parsed) ? Math.min(70, Math.max(0, parsed)) : 0;
      validateTrip(
        {
          current_location: current,
          pickup_location: pickup,
          dropoff_location: dropoff,
          current_cycle_used: cycle,
        },
        controller.signal
      )
        .then((data) => {
          if (controller.signal.aborted) return;
          setPhase({ status: "done", data });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setPhase({
            status: "hint",
            message:
              err instanceof Error && err.message
                ? err.message
                : "Could not estimate this route yet.",
          });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, ready]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (phase.status === "idle") return null;

  return (
    <div
      className="rounded-xl border border-line bg-canvas/70 px-4 py-3"
      aria-live="polite"
      data-testid="route-preview"
    >
      {phase.status === "loading" && (
        <div className="flex items-center gap-2.5 text-[13px] font-medium text-night-500">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-line border-t-brand-500"
          />
          Estimating route &amp; HOS compliance…
        </div>
      )}

      {phase.status === "hint" && (
        <div className="flex items-center gap-2 text-[13px] text-night-500">
          <AlertTriangleIcon size={14} className="flex-none text-amber-500" />
          <span className="min-w-0 flex-1">{phase.message}</span>
        </div>
      )}

      {phase.status === "done" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-night-500">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok-500"
              />
              Live estimate
            </p>
            {phase.data.schedulable ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ok-700">
                <CheckCircleIcon size={11} />
                Compliant
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                <AlertTriangleIcon size={11} />
                HOS review
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <PreviewStat
              icon={<RouteIcon size={14} />}
              value={`${phase.data.route.distance_miles.toFixed(0)} mi`}
              label="route"
            />
            <PreviewStat
              icon={<GaugeIcon size={14} />}
              value={`${phase.data.hos_summary.total_driving_hours.toFixed(1)} h`}
              label="driving"
            />
            <PreviewStat
              icon={<ClockIcon size={14} />}
              value={`${phase.data.hos_summary.total_on_duty_hours.toFixed(1)} h`}
              label="on duty"
            />
            <PreviewStat
              icon={<GaugeIcon size={14} />}
              value={`${(70 - phase.data.hos_summary.cycle_used_before - phase.data.hos_summary.cycle_planned).toFixed(1)} h`}
              label="cycle left"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-night-500">
            Final plan adds pickup/dropoff work, breaks and overnight rests — press
            “Plan trip” for the full schedule and ELD logs.
          </p>
        </>
      )}
    </div>
  );
}

function PreviewStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span aria-hidden="true" className="text-night-500">
        {icon}
      </span>
      <span className="text-[15px] font-bold tabular-nums leading-none text-night-900">
        {value}
      </span>
      <span className="text-[11px] font-medium text-night-500">{label}</span>
    </span>
  );
}
