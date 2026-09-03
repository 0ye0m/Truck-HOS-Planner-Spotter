import type { Activity, PlanPayload } from "@/types";

/**
 * Chronological trip timeline grouped by calendar day, rendered directly
 * from the canonical schedule activities (same data as the ELD logs).
 * Each day header shows aggregate miles / driving hours — mirroring the
 * per-day totals on the generated log sheets.
 */

const STATUS_STYLES: Record<
  string,
  { dot: string; text: string; label: string; badge: string }
> = {
  OFF_DUTY: {
    dot: "bg-slate-300",
    text: "text-slate-600",
    label: "Off Duty",
    badge: "bg-canvas text-night-700",
  },
  SLEEPER_BERTH: {
    dot: "bg-indigo-400",
    text: "text-indigo-700",
    label: "Sleeper Berth",
    badge: "bg-indigo-50 text-indigo-700",
  },
  DRIVING: {
    dot: "bg-brand-500",
    text: "text-brand-700",
    label: "Driving",
    badge: "bg-brand-100 text-brand-700",
  },
  ON_DUTY_NOT_DRIVING: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    label: "On Duty",
    badge: "bg-amber-50 text-amber-700",
  },
};

/** ELD-grid style one-letter status codes (R - S - D - O mirrors the log). */
const DUTY_CODE: Record<string, string> = {
  OFF_DUTY: "OFF",
  SLEEPER_BERTH: "SB",
  DRIVING: "D",
  ON_DUTY_NOT_DRIVING: "ON",
};

const TYPE_LABELS: Record<string, string> = {
  FUEL: "Fuel",
  PICKUP: "Pickup",
  DROPOFF: "Dropoff",
  REST_BREAK: "30-min Break",
  RESTART_34H: "34-hour Restart",
  ON_DUTY_NOT_DRIVING: "On Duty",
};

function fmtTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
}

function fmtDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(minutes)} min`;
}

function activityTitle(a: Activity): string {
  if (a.type === "DRIVING") return a.note || "Driving";
  return TYPE_LABELS[a.type] ?? a.label;
}

function DaySummary({ items }: { items: Activity[] }) {
  const miles = items.reduce((sum, a) => sum + a.distance_miles, 0);
  const drivingMin = items
    .filter((a) => a.duty_status === "DRIVING")
    .reduce((sum, a) => sum + a.duration_minutes, 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-semibold tabular-nums text-night-700">
        {miles.toFixed(0)} mi
      </span>
      <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-semibold tabular-nums text-night-700">
        {(drivingMin / 60).toFixed(1)} h driving
      </span>
    </div>
  );
}

export default function RouteTimeline({ payload }: { payload: PlanPayload }) {
  const { activities } = payload.schedule;
  const homeTz = payload.trip.home_terminal_timezone;

  const days = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = a.start.slice(0, 10); // ISO date part = home-terminal day
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(a);
  }

  return (
    <div className="thin-scroll max-h-[560px] overflow-y-auto px-5 py-4">
      {[...days.entries()].map(([day, items], dayIndex) => (
        <div key={day} className={dayIndex > 0 ? "mt-6" : ""}>
          <div className="sticky top-0 z-10 -mx-5 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white/95 px-5 py-2 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wider text-night-500">
              Day {dayIndex + 1} ·{" "}
              {new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
            <DaySummary items={items} />
          </div>
          <ol className="relative ml-2 border-l-2 border-line">
            {items.map((a) => {
              const style =
                STATUS_STYLES[a.duty_status] ?? STATUS_STYLES.OFF_DUTY;
              return (
                <li key={a.seq} className="mb-4 ml-4 last:mb-0">
                  <span
                    className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white ${style.dot}`}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold tabular-nums text-night-900">
                        {fmtTime(a.start, homeTz)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${style.badge}`}
                        title={style.label}
                      >
                        {DUTY_CODE[a.duty_status] ?? "OFF"}
                      </span>
                      <span className={`text-sm ${style.text}`}>
                        {activityTitle(a)}
                      </span>
                    </p>
                    <span className="text-xs tabular-nums text-night-500">
                      {fmtDuration(a.duration_minutes)}
                      {a.distance_miles > 0 &&
                        ` · ${a.distance_miles.toFixed(0)} mi`}
                    </span>
                  </div>
                  {a.location && a.location !== "En route" && (
                    <p className="mt-0.5 text-xs text-night-500">{a.location}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
