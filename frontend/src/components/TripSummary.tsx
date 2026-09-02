import type { PlanPayload } from "@/types";

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        accent
          ? "border-brand-200 bg-brand-50"
          : "border-slate-200 bg-white shadow-card"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold ${
          accent ? "text-brand-700" : "text-night-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function fmtHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** "Mon, Sep 7 · 14:35" in the trip's home-terminal time zone. */
function fmtEta(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
  return `${datePart} · ${timePart}`;
}

export default function TripSummary({ payload }: { payload: PlanPayload }) {
  const { route, hos_summary, schedule, logs, trip } = payload;
  const fuelStops = schedule.activities.filter((a) => a.type === "FUEL").length;
  const restStops = schedule.activities.filter(
    (a) => a.type === "SLEEPER_BERTH"
  ).length;
  const restarts = schedule.activities.filter(
    (a) => a.type === "RESTART_34H"
  ).length;

  // Compliant trip duration = schedule span (includes required breaks and
  // rests) — the actually useful "when will this trip take" number.
  const tripDurationHours =
    schedule.start && schedule.end
      ? (new Date(schedule.end).getTime() - new Date(schedule.start).getTime()) /
        3_600_000
      : 0;
  const homeTz = trip.home_terminal_timezone;

  return (
    <section className="mt-6" aria-label="Trip summary">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-base font-semibold text-night-900">Trip Summary</h2>
        {trip.assumed_start_time && (
          <span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
            Assumed start time 06:00 (home terminal) — adjust in advanced
            options
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label="Route distance"
          value={`${route.distance_miles.toFixed(0)} mi`}
          accent
        />
        <Stat
          label="Driving time"
          value={`${hos_summary.total_driving_hours.toFixed(1)} h`}
          accent
        />
        <Stat
          label="Trip duration (HOS)"
          value={fmtHours(tripDurationHours)}
        />
        <Stat
          label="ETA at dropoff"
          value={schedule.end ? fmtEta(schedule.end, homeTz) : "—"}
        />
        <Stat label="Fuel stops" value={String(fuelStops)} />
        <Stat label="Overnight rests" value={String(restStops)} />
        <Stat label="Total on-duty" value={`${hos_summary.total_on_duty_hours.toFixed(1)} h`} />
        <Stat
          label={logs.length > 1 ? "Daily log sheets" : "Daily log sheets"}
          value={String(logs.length)}
        />
        {restarts > 0 && <Stat label="34-hr restarts" value={String(restarts)} />}
      </div>
    </section>
  );
}
