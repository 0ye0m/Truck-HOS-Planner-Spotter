import type { HosSummary, TripInfo } from "@/types";
import {
  AlertTriangleIcon,
  BedIcon,
  CheckCircleIcon,
  CoffeeIcon,
  GaugeIcon,
  InfoHint,
  RotateCcwIcon,
} from "@/components/icons";

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
  const drivingPct = Math.min(100, (summary.driving_used_in_period / 11) * 100);
  const windowPct = Math.min(100, (summary.window_used_hours / 14) * 100);

  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-night-900">HOS Availability</h2>
          {summary.schedulable ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <CheckCircleIcon size={13} />
              Legally schedulable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <AlertTriangleIcon size={13} />
              HOS constraint detected
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          All times in home-terminal time zone:{" "}
          <span className="font-medium text-slate-600">
            {trip.home_terminal_timezone.replace(/_/g, " ")}
          </span>
        </p>
      </div>

      <div className="space-y-5 px-5 py-5">
        {/* 70/8 cycle */}
        <Metric
          title="70/8 Cycle"
          hint="Maximum 70 hours of on-duty time in any rolling 8-day period."
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
          title="11-Hour Driving Limit"
          hint="Maximum 11 hours of driving after 10 consecutive hours off duty."
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
          hint="All driving must happen within 14 consecutive hours of coming on duty."
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
            icon={<CoffeeIcon size={13} />}
            label="Next required break"
            value={
              summary.next_break_in_hours !== null
                ? summary.next_break_in_hours <= 0
                  ? "Due now"
                  : `in ${summary.next_break_in_hours.toFixed(1)} h`
                : "after 8 h driving"
            }
          />
          <MiniStat
            icon={<BedIcon size={13} />}
            label="Next rest"
            value={`${summary.next_rest_hours} h sleeper berth`}
          />
          <MiniStat
            icon={<GaugeIcon size={13} />}
            label="Total driving"
            value={`${summary.total_driving_hours.toFixed(1)} h`}
          />
          <MiniStat
            icon={<GaugeIcon size={13} />}
            label="Total on duty"
            value={`${summary.total_on_duty_hours.toFixed(1)} h`}
          />
        </div>

        {summary.restart_used && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <RotateCcwIcon size={14} className="mt-0.5 flex-none" />
            <p>
              <span className="font-semibold">34-hour restart applied.</span> The 70/8
              cycle was exhausted during this trip; a 34-hour consecutive off-duty period
              was scheduled explicitly to reset it.
            </p>
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
  hint,
  rows,
  progress,
}: {
  title: string;
  hint: string;
  rows: [string, string][];
  progress: { value?: number; max?: number; pct: number; label: string };
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-night-800">
          {title}
          <InfoHint text={hint} label={`${title}: ${hint}`} />
        </h3>
        <span className="text-xs font-medium tabular-nums text-slate-500">
          {progress.label}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={`${title} usage`}
        aria-valuemin={0}
        aria-valuemax={progress.max}
        aria-valuenow={Math.round(progress.value ?? 0)}
      >
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
            <dd className="font-medium tabular-nums text-night-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-night-900">{value}</p>
    </div>
  );
}
