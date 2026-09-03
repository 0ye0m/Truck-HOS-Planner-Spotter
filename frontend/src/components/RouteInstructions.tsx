import { useState } from "react";
import ManeuverIcon from "@/components/ManeuverIcon";
import { ChevronDownIcon, FlagIcon, ListIcon } from "@/components/icons";
import type { PlanPayload, RouteLeg, RouteStep } from "@/types";

/**
 * Turn-by-turn directions, navigation-grade:
 *  - proper maneuver icons from the OSRM type + modifier (with text
 *    fallback for trips stored before those fields shipped)
 *  - distances the way a driver reads them (feet under 0.15 mi)
 *  - road names emphasized, distance-to-next-maneuver right-aligned
 *  - per-leg headers with origin/destination, miles, drive time, steps
 */

const NOISE_STEP =
  /^(keep (left|right|straight)|continue (straight)?|slight (left|right)|turn (slight )?(left|right))\.?$/i;

/** Drop only genuinely zero-information maneuvers (no road, no distance). */
function meaningfulSteps(steps: RouteStep[]): RouteStep[] {
  return steps.filter(
    (s) =>
      !(
        NOISE_STEP.test(s.instruction.trim()) &&
        s.distance_miles < 0.2 &&
        !s.name
      )
  );
}

/** Driver-style distance: "650 ft", "2.4 mi", "38 mi". */
export function formatStepDistance(miles: number): string {
  if (miles <= 0) return "";
  if (miles < 0.15) return `${Math.max(50, Math.round((miles * 5280) / 50) * 50)} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function formatDriveTime(hours: number): string {
  if (hours <= 0) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Bold the "onto <Road Name>" part — the driver's actual visual cue. */
function InstructionText({ step }: { step: RouteStep }) {
  const { instruction } = step;
  const ontoMatch = instruction.match(/\b(?:onto|toward|towards|to stay on|on)\b\s+(.+)$/);
  if (!ontoMatch) return <>{instruction}</>;
  const cut = instruction.length - ontoMatch[1].length;
  const prefix = instruction.slice(0, cut);
  const road = ontoMatch[1];
  return (
    <>
      {prefix}
      <span className="font-semibold text-night-900">{road}</span>
    </>
  );
}

function StepRow({
  step,
  isLast,
}: {
  step: RouteStep;
  isLast: boolean;
}) {
  const isArrive = /^arrive/i.test(step.instruction.trim());
  const isDepart = /^(head out|start)/i.test(step.instruction.trim());
  const iconTile = isArrive
    ? "bg-ok-50 text-ok-700 border-ok-200"
    : isDepart
      ? "bg-brand-50 text-brand-700 border-brand-200"
      : "bg-canvas text-night-700 border-line";
  const distance = isLast ? "" : formatStepDistance(step.distance_miles);

  return (
    <li className="relative flex items-start gap-3 py-2" data-arrive={isArrive || undefined}>
      {/* Vertical connector between step icons */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[13px] top-9 h-[calc(100%-20px)] w-px bg-line"
        />
      )}
      <span
        className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg border ${iconTile}`}
      >
        <ManeuverIcon
          maneuver={step.maneuver}
          modifier={step.modifier}
          instruction={step.instruction}
          size={14}
          strokeWidth={2.2}
        />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`text-[13px] leading-snug ${isArrive ? "font-semibold text-night-900" : "text-night-700"}`}>
          <InstructionText step={step} />
        </p>
      </div>
      {distance && (
        <span className="flex-none pt-1 text-[11px] font-medium tabular-nums text-night-500">
          {distance}
        </span>
      )}
    </li>
  );
}

function LegBlock({
  leg,
  endpointLabel,
  open,
  onToggle,
}: {
  leg: RouteLeg;
  endpointLabel: string;
  open: boolean;
  onToggle: () => void;
}) {
  const steps = meaningfulSteps(leg.steps);
  const arriveStep = steps[steps.length - 1];
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 rounded-xl bg-canvas px-3.5 py-3 text-left transition hover:bg-line/50"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-bold tracking-tight text-night-900">
            <ListIcon size={13} className="flex-none text-night-500" />
            <span className="truncate">{endpointLabel}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] tabular-nums text-night-500">
            <span className="font-semibold text-night-700">
              {leg.distance_miles.toFixed(1)} mi
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatDriveTime(leg.duration_hours)} drive</span>
            <span aria-hidden="true">·</span>
            <span>
              {steps.length} step{steps.length === 1 ? "" : "s"}
            </span>
          </span>
        </span>
        <ChevronDownIcon
          size={15}
          className={`mt-1 flex-none text-night-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-1.5 rounded-xl border border-line bg-white px-3.5 py-1.5">
          {steps.length === 0 ? (
            <p className="py-3 text-xs text-night-500">
              No step-by-step instructions available for this leg.
            </p>
          ) : (
            <ol>
              {steps.map((step, i) => (
                <StepRow key={i} step={step} isLast={i === steps.length - 1} />
              ))}
            </ol>
          )}
          {arriveStep && steps.length > 0 && (
            <p className="flex items-center gap-1.5 border-t border-line py-2 text-[11px] text-night-500">
              <FlagIcon size={11} className="text-ok-600" />
              Leg complete — {leg.distance_miles.toFixed(1)} mi driven
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function RouteInstructions({ payload }: { payload: PlanPayload }) {
  const [openLegs, setOpenLegs] = useState<Set<number>>(() => new Set([0]));
  const { legs, provider, distance_miles } = payload.route;

  const legEndpoints = [
    `${payload.trip.current_location} → ${payload.trip.pickup_location}`,
    `${payload.trip.pickup_location} → ${payload.trip.dropoff_location}`,
  ];

  const totalSteps = legs.reduce((n, leg) => n + meaningfulSteps(leg.steps).length, 0);

  const toggle = (index: number) =>
    setOpenLegs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <section
      className="rounded-2xl border border-line bg-white shadow-card lg:col-span-2"
      aria-label="Turn-by-turn directions"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-tightest text-night-900">
            Turn-by-turn directions
          </h2>
          <p className="text-xs text-night-500">
            {distance_miles.toFixed(1)} mi · {totalSteps} maneuvers · via {provider}
          </p>
        </div>
        <span className="mt-0.5 flex-none rounded-md bg-canvas px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-night-500">
          Driving
        </span>
      </div>
      <div className="thin-scroll max-h-[640px] space-y-2.5 overflow-y-auto px-5 py-4">
        {legs.map((leg, index) => (
          <LegBlock
            key={leg.leg_index}
            leg={leg}
            endpointLabel={legEndpoints[index] ?? `Leg ${index + 1}`}
            open={openLegs.has(index)}
            onToggle={() => toggle(index)}
          />
        ))}
      </div>
    </section>
  );
}
