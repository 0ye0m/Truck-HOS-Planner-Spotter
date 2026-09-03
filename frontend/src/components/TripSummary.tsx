import type { PlanPayload } from "@/types";
import {
  BedIcon,
  CalendarIcon,
  ClockIcon,
  FileTextIcon,
  FlagIcon,
  FuelIcon,
  GaugeIcon,
  MapPinIcon,
  PackageIcon,
  RotateCcwIcon,
  RouteIcon,
} from "@/components/icons";

function Stat({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
        accent
          ? "border-brand-200 bg-brand-50"
          : "border-slate-200 bg-white shadow-card"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg ${
          accent ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p
          className={`mt-0.5 text-lg font-bold leading-tight tabular-nums ${
            accent ? "text-brand-700" : "text-night-900"
          }`}
        >
          {value}
        </p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-card">
      <span className="text-slate-400">{icon}</span>
      <span className="font-semibold tabular-nums text-night-900">{value}</span>
      {label}
    </span>
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
    <section className="mt-8" aria-label="Trip summary">
      {/* Route banner: the three stops in order */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 pb-3 text-sm">
        <h2 className="sr-only">Trip summary</h2>
        <span className="inline-flex items-center gap-1.5 font-semibold text-night-900">
          <MapPinIcon size={15} className="text-brand-600" />
          {trip.current_location}
        </span>
        <Arrow />
        <span className="inline-flex items-center gap-1.5 text-night-800">
          <PackageIcon size={15} className="text-amber-600" />
          {trip.pickup_location}
        </span>
        <Arrow />
        <span className="inline-flex items-center gap-1.5 text-night-800">
          <FlagIcon size={15} className="text-red-600" />
          {trip.dropoff_location}
        </span>
        {trip.assumed_start_time && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
            <ClockIcon size={11} />
            Assumed start 06:00 (home terminal) — adjust in advanced options
          </span>
        )}
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Route distance"
          value={`${route.distance_miles.toFixed(0)} mi`}
          icon={<RouteIcon size={17} />}
          sub={`via ${route.provider}`}
          accent
        />
        <Stat
          label="Driving time"
          value={`${hos_summary.total_driving_hours.toFixed(1)} h`}
          icon={<GaugeIcon size={17} />}
          sub="sum of all driving legs"
          accent
        />
        <Stat
          label="Trip duration (HOS)"
          value={fmtHours(tripDurationHours)}
          icon={<ClockIcon size={17} />}
          sub="includes breaks & rests"
        />
        <Stat
          label="ETA at dropoff"
          value={schedule.end ? fmtEta(schedule.end, homeTz) : "—"}
          icon={<CalendarIcon size={17} />}
          sub={`home-terminal time · ${homeTz.replace(/_/g, " ")}`}
        />
      </div>

      {/* Secondary facts */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip icon={<FuelIcon size={13} />} label="fuel stops" value={String(fuelStops)} />
        <Chip
          icon={<BedIcon size={13} />}
          label="overnight rests"
          value={String(restStops)}
        />
        {restarts > 0 && (
          <Chip
            icon={<RotateCcwIcon size={13} />}
            label="34-hr restarts"
            value={String(restarts)}
          />
        )}
        <Chip
          icon={<FileTextIcon size={13} />}
          label={`daily log sheet${logs.length === 1 ? "" : "s"}`}
          value={String(logs.length)}
        />
        <Chip
          icon={<GaugeIcon size={13} />}
          label="total on-duty"
          value={`${hos_summary.total_on_duty_hours.toFixed(1)} h`}
        />
      </div>
    </section>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-slate-300"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
