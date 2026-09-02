import { useState } from "react";
import type { PlanPayload } from "@/types";

/**
 * Turn-by-turn route instructions per leg (OSRM steps), collapsible to
 * keep the page tidy on long routes.
 */
export default function RouteInstructions({ payload }: { payload: PlanPayload }) {
  const [openLeg, setOpenLeg] = useState<number | null>(0);
  const { legs, provider } = payload.route;

  const legEndpoints = [
    `${payload.trip.current_location} → ${payload.trip.pickup_location}`,
    `${payload.trip.pickup_location} → ${payload.trip.dropoff_location}`,
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-card lg:col-span-2">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-night-900">
          Route Instructions
        </h2>
        <p className="text-xs text-slate-500">Turn-by-turn via {provider}</p>
      </div>
      <div className="thin-scroll max-h-[560px] overflow-y-auto px-5 py-4">
        {legs.map((leg, index) => {
          const open = openLeg === index;
          return (
            <div key={leg.leg_index} className="mb-3 last:mb-0">
              <button
                onClick={() => setOpenLeg(open ? null : index)}
                className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100"
              >
                <span className="text-sm font-semibold text-night-900">
                  {legEndpoints[index] ?? `Leg ${index + 1}`}
                </span>
                <span className="text-xs text-slate-500">
                  {leg.distance_miles.toFixed(0)} mi ·{" "}
                  {open ? "▲" : "▼"}
                </span>
              </button>
              {open && (
                <ol className="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-4">
                  {leg.steps.length === 0 && (
                    <li className="text-xs text-slate-400">
                      No step-by-step instructions available for this leg.
                    </li>
                  )}
                  {leg.steps.map((step, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      {step.instruction}
                      {step.distance_miles > 0.1 && (
                        <span className="ml-1 text-slate-400">
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
