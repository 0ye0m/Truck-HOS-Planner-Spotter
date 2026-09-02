import { InfoIcon } from "@/components/icons";

/**
 * "Calculation assumptions" panel (assessment §26): concise, collapsed by
 * default, so the modeled assumptions are disclosed but never in the way.
 */
export default function AssumptionsPanel() {
  const items: [string, string][] = [
    ["Driver type", "property-carrying driver on a 70-hour / 8-day cycle (FMCSA §395.3)."],
    ["Daily limits", "11 h driving within a 14-hour driving window."],
    [
      "30-minute break",
      "required after 8 cumulative (not consecutive) driving hours; any ≥30-min non-driving period (fueling, loading) qualifies.",
    ],
    ["Daily reset", "10 consecutive hours off duty / sleeper berth."],
    [
      "34-hour restart",
      "applied automatically (and shown explicitly) when the modeled 70-hour cycle is exhausted.",
    ],
    [
      "Fixed work durations",
      "pickup 1 h, dropoff 1 h, fuel stop 30 min, plus a 30-min pre-trip on-duty period.",
    ],
    ["Fuel planning", "at least one fuel stop every 1,000 route miles."],
    [
      "Time base",
      "all times use the home-terminal time zone derived from the trip start state; time-zone crossings do not change the log's clock.",
    ],
    [
      "Not modeled",
      "sleeper-berth split provisions, adverse-driving exceptions, short-haul exceptions, team driving.",
    ],
    [
      "Routing data",
      "OSRM demo server + OpenStreetMap; fuel/rest stop locations are planned positions interpolated along the route and reverse-geocoded to nearby places — they are not confirmed truck stops.",
    ],
  ];

  return (
    <details className="mt-8 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-night-900">
        <InfoIcon size={15} className="text-slate-400" />
        Calculation assumptions
        <span className="text-xs font-normal text-slate-400">
          modeled rules — expand to review
        </span>
      </summary>
      <div className="mt-3 grid gap-x-8 gap-y-2.5 text-xs leading-relaxed text-slate-600 sm:grid-cols-2">
        {items.map(([key, value]) => (
          <p key={key}>
            <strong className="font-semibold text-night-800">{key}:</strong> {value}
          </p>
        ))}
      </div>
    </details>
  );
}
