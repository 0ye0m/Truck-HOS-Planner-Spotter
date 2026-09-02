import type { HosSummary, TripInfo } from "@/types";

function fmt(hours: number | null): string {
  if (hours === null || hours === undefined) return "—";
  return `${hours.toFixed(1)} h`;
}

export default function HosSummaryCard({
  summary,
  trip,
}: {
  summary: HosSummary;
  trip: TripInfo;
}) {
  const cycleUsed = summary.cycle_used_before + summary.cycle_planned;
  const cyclePct = Math.min(100, (cycleUsed / 70) * 100);
  const drivingPct = Math.min(
    100,
    (summary.driving_used_in_period / 11) * 100
  );
  const windowPct = Math.min(
    100,
    (summary.window_used_hours / 14) * 100
  );

  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-night-900">
            HOS Availability
          </h2>
          {summary.schedulable ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              ✓ Trip is legally schedulable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              ⚠ HOS constraint detected
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Home-terminal time zone: {trip.home_terminal_timezone.replace("_", " ")}
        </p>
      </div>

      <div className="space-y-5 px-5 py-5">
        {/* 70/8 cycle */}
        <Metric
          title="70/8 Cycle"
          rows={[
            ["Used before trip", fmt(summary.cycle_used_before)],
            ["Planned additional", fmt(summary.cycle_planned)],
            ["Remaining after trip", fmt(summary.cycle_remaining_after)],
          ]}
          progress={{
            value: cycleUsed,
            max: 70,
            pct: cyclePct,
            label: `${cycleUsed.toFixed(1)} / 70 h`,
          }}
        />

        {/* Driving period */}
        <Metric
          title="Current Driving Period"
          rows={[
            ["Driving used", fmt(summary.driving_used_in_period)],
            ["Driving remaining", fmt(summary.driving_remaining_in_period)],
          ]}
          progress={{
            value: summary.driving_used_in_period,
            max: 11,
            pct: drivingPct,
            label: `${summary.driving_used_in_period.toFixed(1)} / 11 h`,
          }}
        />

        {/* 14-hour window */}
        <Metric
          title="14-Hour Window"
          rows={[
            ["Window used", fmt(summary.window_used_hours)],
            ["Window remaining", fmt(summary.window_remaining_hours)],
          ]}
          progress={{
            value: summary.window_used_hours,
            max: 14,
            pct: windowPct,
            label: `${summary.window_used_hours.toFixed(1)} / 14 h`,
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            label="Next required break"
            value={
              summary.next_break_in_hours !== null
                ? `in ${summary.next_break_in_hours.toFixed(1)} h`
                : "after 8 h driving"
            }
          />
          <MiniStat label="Next rest" value={`${summary.next_rest_hours} h sleeper berth`} />
          <MiniStat
            label="Total driving"
            value={`${summary.total_driving_hours.toFixed(1)} h`}
          />
          <MiniStat
            label="Total on duty"
            value={`${summary.total_on_duty_hours.toFixed(1)} h`}
          />
        </div>

        {summary.restart_used && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <span className="font-semibold">34-hour restart applied.</span>{" "}
            The 70/8 cycle was exhausted during this trip; a 34-hour
            consecutive off-duty period was scheduled explicitly to reset it.
          </div>
        )}

        {summary.violations?.length > 0 && (
          <div className="space-y-2">
            {summary.violations.map((v, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs ${
                  v.severity === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                <span className="font-semibold">{v.rule}:</span> {v.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  title,
  rows,
  progress,
}: {
  title: string;
  rows: [string, string][];
  progress: { value?: number; max?: number; pct: number; label: string };
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-night-800">{title}</h3>
        <span className="text-xs font-medium text-slate-500">
          {progress.label}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            progress.pct >= 100
              ? "bg-red-500"
              : progress.pct > 80
                ? "bg-amber-500"
                : "bg-brand-500"
          }`}
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      <dl className="mt-2 space-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="flex justify-between text-xs">
            <dt className="text-slate-500">{key}</dt>
            <dd className="font-medium text-night-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-night-900">{value}</p>
    </div>
  );
}
