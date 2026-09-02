import { useState } from "react";
import Header from "@/components/Header";
import TripPlannerForm from "@/features/trip-planner/TripPlannerForm";
import HosSummaryCard from "@/features/hos-summary/HosSummaryCard";
import RouteMap from "@/features/route-map/RouteMap";
import RouteTimeline from "@/features/timeline/RouteTimeline";
import EldLogsPanel from "@/features/eld-logs/EldLogsPanel";
import TripSummary from "@/components/TripSummary";
import RouteInstructions from "@/components/RouteInstructions";
import EmptyState from "@/components/EmptyState";
import LoadingStages from "@/components/LoadingStages";
import ErrorState from "@/components/ErrorState";
import AssumptionsPanel from "@/components/AssumptionsPanel";
import type { PlanPayload } from "@/types";
import { usePlanTrip } from "@/hooks/usePlanTrip";
import { friendlyError } from "@/services/api";

export default function App() {
  const [result, setResult] = useState<PlanPayload | null>(null);
  const { mutate, isPending, error, reset } = usePlanTrip((payload) =>
    setResult(payload)
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {/* Top row: planner form + HOS availability */}
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <TripPlannerForm
              isSubmitting={isPending}
              onSubmit={(request) => {
                reset();
                mutate(request);
              }}
            />
          </section>
          <section className="lg:col-span-2">
            {result ? (
              <HosSummaryCard summary={result.hos_summary} trip={result.trip} />
            ) : (
              <HosSummaryPlaceholder />
            )}
          </section>
        </div>

        {isPending && (
          <div className="mt-6">
            <LoadingStages />
          </div>
        )}

        {error && (
          <div className="mt-6">
            <ErrorState message={friendlyError(error)} onRetry={() => reset()} />
          </div>
        )}

        {!result && !isPending && !error && (
          <div className="mt-6">
            <EmptyState />
          </div>
        )}

        {result && (
          <>
            {/* Trip summary strip */}
            <TripSummary payload={result} />

            {/* Map */}
            <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-night-900">
                  Route Map
                </h2>
                <p className="text-xs text-slate-500">
                  Route, stops and overnight rests — powered by OpenStreetMap &amp; OSRM
                </p>
              </div>
              <RouteMap payload={result} />
            </section>

            {/* Timeline + instructions */}
            <div className="mt-6 grid gap-6 lg:grid-cols-5">
              <section className="rounded-xl border border-slate-200 bg-white shadow-card lg:col-span-3">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-base font-semibold text-night-900">
                    Route Timeline
                  </h2>
                  <p className="text-xs text-slate-500">
                    Chronological schedule — same canonical data as the ELD logs
                  </p>
                </div>
                <RouteTimeline payload={result} />
              </section>
              <RouteInstructions payload={result} />
            </div>

            {/* ELD logs */}
            <EldLogsPanel payload={result} />
          </>
        )}

        {/* Assumptions — always available, collapsed by default */}
        <AssumptionsPanel />
      </main>

      <footer className="mt-10 bg-night-950 py-6 text-center text-xs text-slate-400">
        <p>
          TruckHOS Planner — implements the FMCSA property-carrier assumptions
          specified in the assessment (70/8 cycle, 11-hour driving, 14-hour
          window, 30-minute break, 10-hour reset, 34-hour restart).
        </p>
        <p className="mt-1">
          Planning assistance only — not legal or compliance advice.
        </p>
      </footer>
    </div>
  );
}

function HosSummaryPlaceholder() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center shadow-card">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
        🕒
      </div>
      <h3 className="mt-3 text-sm font-semibold text-night-900">
        HOS availability
      </h3>
      <p className="mt-1 max-w-xs text-xs text-slate-500">
        Plan a trip to see the 70/8 cycle, 14-hour window and driving hours
        used and remaining.
      </p>
    </div>
  );
}
