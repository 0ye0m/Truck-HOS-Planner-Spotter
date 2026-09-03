import { useState } from "react";
import { ChevronDownIcon, ListIcon } from "@/components/icons";
import type { PlanPayload } from "@/types";

/**
 * Turn-by-turn route instructions per leg (OSRM steps), collapsible to
 * keep the page tidy on long routes.
 */
const NOISE_STEP =
  /^(keep (left|right|straight)|continue (straight)?|slight (left|right)|turn (slight )?(left|right))\.?$/i;

/** Drop zero-information maneuvers ("Keep left", < 0.25 mi, no street name). */
function meaningfulSteps(steps: { instruction: string; distance_miles: number }[]) {
  return steps.filter(
    (s) => !(NOISE_STEP.test(s.instruction.trim()) && s.distance_miles < 0.25)
  );
}

export default function RouteInstructions({ payload }: { payload: PlanPayload }) {
  const [openLeg, setOpenLeg] = useState<number | null>(0);
  const { legs, provider } = payload.route;

  const legEndpoints = [
    `${payload.trip.current_location} → ${payload.trip.pickup_location}`,
    `${payload.trip.pickup_location} → ${payload.trip.dropoff_location}`,
  ];

  return (
    <section className="rounded-2xl border border-line bg-white shadow-card lg:col-span-2">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-bold tracking-tightest text-night-900">
          Route instructions
        </h2>
        <p className="text-xs text-night-500">Turn-by-turn via {provider}</p>
      </div>
      <div className="thin-scroll max-h-[560px] overflow-y-auto px-5 py-4">
        {legs.map((leg, index) => {
          const open = openLeg === index;
          return (
            <div key={leg.leg_index} className="mb-3 last:mb-0">
              <button
                onClick={() => setOpenLeg(open ? null : index)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2.5 text-left transition hover:bg-line/60"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-night-900">
                  <ListIcon size={14} className="flex-none text-night-500" />
                  <span className="truncate">
                    {legEndpoints[index] ?? `Leg ${index + 1}`}
                  </span>
                </span>
                <span className="flex flex-none items-center gap-2 text-xs tabular-nums text-night-500">
                  {leg.distance_miles.toFixed(0)} mi
                  <ChevronDownIcon
                    size={14}
                    className={`transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {open && (
                <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-4">
                  {meaningfulSteps(leg.steps).length === 0 && (
                    <li className="text-xs text-night-500">
                      No step-by-step instructions available for this leg.
                    </li>
                  )}
                  {meaningfulSteps(leg.steps).map((step, i) => (
                    <li key={i} className="text-xs leading-relaxed text-night-700">
                      {step.instruction}
                      {step.distance_miles > 0.1 && (
                        <span className="ml-1 tabular-nums text-night-500">
                          ({step.distance_miles.toFixed(1)} mi)
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
