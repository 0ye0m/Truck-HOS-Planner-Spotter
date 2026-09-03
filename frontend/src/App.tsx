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
import { ClockIcon, MapPinIcon } from "@/components/icons";
import type { PlanPayload } from "@/types";
import { usePlanTrip } from "@/hooks/usePlanTrip";
import { friendlyError } from "@/services/api";

export default function App() {
  const [result, setResult] = useState<PlanPayload | null>(null);
  const { mutate, isPending, error, reset } = usePlanTrip((payload) =>
    setResult(payload)
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-800">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {/* Step 1 — inputs */}
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

        {isPending && <LoadingStages />}

        {error && <ErrorState message={friendlyError(error)} onRetry={() => reset()} />}

        {!result && !isPending && !error && <EmptyState />}

        {result && (
          <>
            {/* Trip summary strip */}
            <TripSummary payload={result} />

            {/* Route map */}
            <SectionCard
              title="Route Map"
              icon={<MapPinIcon size={15} />}
              description="Route, stops and overnight rests — powered by OpenStreetMap & OSRM"
              className="mt-8"
            >
              <RouteMap payload={result} />
            </SectionCard>

            {/* Timeline + instructions */}
            <div className="mt-8 grid gap-6 lg:grid-cols-5">
              <SectionCard
                title="Route Timeline"
                icon={<ClockIcon size={15} />}
                description="Chronological schedule — same canonical data as the ELD logs"
                className="lg:col-span-3"
              >
                <RouteTimeline payload={result} />
              </SectionCard>
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

function SectionCard({
  title,
  description,
  icon,
  className = "",
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold leading-tight text-night-900">
            {title}
          </h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function HosSummaryPlaceholder() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center shadow-card">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <ClockIcon size={24} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-night-900">
        HOS availability
      </h3>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
        Plan a trip to see the 70/8 cycle, 11-hour driving limit and 14-hour
        window — used and remaining, computed live.
      </p>
    </div>
  );
}
