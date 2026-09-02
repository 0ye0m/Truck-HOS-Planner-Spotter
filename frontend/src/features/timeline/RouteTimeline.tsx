import type { Activity, PlanPayload } from "@/types";

/**
 * Chronological trip timeline grouped by calendar day, rendered directly
 * from the canonical schedule activities (same data as the ELD logs).
 */

const STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  OFF_DUTY: { dot: "bg-slate-300", text: "text-slate-600", label: "Off Duty" },
  SLEEPER_BERTH: { dot: "bg-indigo-400", text: "text-indigo-700", label: "Sleeper Berth" },
  DRIVING: { dot: "bg-brand-500", text: "text-brand-700", label: "Driving" },
  ON_DUTY_NOT_DRIVING: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    label: "On Duty",
  },
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
          <div className="sticky top-0 z-10 -mx-5 mb-3 bg-white/95 px-5 py-1.5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Day {dayIndex + 1} ·{" "}
              {new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
          <ol className="relative ml-2 border-l-2 border-slate-100">
            {items.map((a) => {
              const style =
                STATUS_STYLES[a.duty_status] ?? STATUS_STYLES.OFF_DUTY;
              return (
                <li key={a.seq} className="mb-4 ml-4 last:mb-0">
                  <span
                    className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white ${style.dot}`}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-semibold text-night-900">
                      {fmtTime(a.start, homeTz)}{" "}
                      <span className={`ml-1 ${style.text}`}>
                        {activityTitle(a)}
                      </span>
                    </p>
                    <span className="text-xs text-slate-400">
                      {fmtDuration(a.duration_minutes)}
                      {a.distance_miles > 0 &&
                        ` · ${a.distance_miles.toFixed(0)} mi`}
                    </span>
                  </div>
                  {a.location && a.location !== "En route" && (
                    <p className="text-xs text-slate-500">{a.location}</p>
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
