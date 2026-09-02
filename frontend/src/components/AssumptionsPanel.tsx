/**
 * "Calculation assumptions" panel (assessment §26): concise, collapsed by
 * default, so the modeled assumptions are disclosed but never in the way.
 */
export default function AssumptionsPanel() {
  return (
    <details className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
      <summary className="cursor-pointer text-sm font-semibold text-night-900">
        Calculation assumptions
        <span className="ml-2 text-xs font-normal text-slate-400">
          modeled rules — expand to review
        </span>
      </summary>
      <div className="mt-3 grid gap-x-8 gap-y-2 text-xs text-slate-600 sm:grid-cols-2">
        <p><strong className="text-night-800">Driver type:</strong> property-carrying driver on a 70-hour / 8-day cycle (FMCSA §395.3).</p>
        <p><strong className="text-night-800">Daily limits:</strong> 11 h driving within a 14-hour driving window.</p>
        <p><strong className="text-night-800">30-minute break:</strong> required after 8 cumulative (not consecutive) driving hours; any ≥30-min non-driving period (fueling, loading) qualifies.</p>
        <p><strong className="text-night-800">Daily reset:</strong> 10 consecutive hours off duty / sleeper berth.</p>
        <p><strong className="text-night-800">34-hour restart:</strong> applied automatically (and shown explicitly) when the modeled 70-hour cycle is exhausted.</p>
        <p><strong className="text-night-800">Fixed work durations:</strong> pickup 1 h, dropoff 1 h, fuel stop 30 min, plus a 30-min pre-trip on-duty period.</p>
        <p><strong className="text-night-800">Fuel planning:</strong> at least one fuel stop every 1,000 route miles.</p>
        <p><strong className="text-night-800">Time base:</strong> all times use the home-terminal time zone derived from the trip start state; time-zone crossings do not change the log's clock.</p>
        <p><strong className="text-night-800">Not modeled:</strong> sleeper-berth split provisions, adverse-driving exceptions, short-haul exceptions, team driving.</p>
        <p><strong className="text-night-800">Routing data:</strong> OSRM demo server + OpenStreetMap; fuel/rest stop locations are planned positions interpolated along the route and reverse-geocoded to nearby places — they are not confirmed truck stops.</p>
      </div>
    </details>
  );
}
