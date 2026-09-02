export default function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl">
        🚚
      </div>
      <h3 className="mt-4 text-lg font-semibold text-night-900">
        Plan your first trip
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Enter the current location, pickup, dropoff and your current 70/8
        cycle hours. TruckHOS Planner computes a legal driving schedule under
        FMCSA property-carrier rules, draws the route with all required
        stops, and generates a filled daily ELD log for every day on the
        road.
      </p>
      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        {[
          ["1. Trip inputs", "Locations + current cycle used (0–70 h)"],
          [
            "2. HOS schedule",
            "11 h driving, 14 h window, 30-min break, 10 h reset, 1,000-mi fuel",
          ],
          ["3. ELD logs", "A filled 24-hour log grid for every day"],
        ].map(([title, body]) => (
          <div key={title} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-brand-700">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
