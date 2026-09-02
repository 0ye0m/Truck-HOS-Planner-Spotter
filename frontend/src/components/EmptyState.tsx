import {
  CheckCircleIcon,
  FileTextIcon,
  GaugeIcon,
  MapPinIcon,
  RouteIcon,
} from "@/components/icons";

export default function EmptyState() {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center sm:p-12">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <RouteIcon size={30} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-night-900">
        Plan your first trip
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        Enter the current location, pickup, dropoff and your current 70/8
        cycle hours. TruckHOS Planner computes a legal driving schedule under
        FMCSA property-carrier rules, draws the route with all required
        stops, and generates a filled daily ELD log for every day on the
        road.
      </p>
      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        {[
          {
            title: "1. Trip inputs",
            body: "Locations + current cycle used (0–70 h)",
            icon: <MapPinIcon size={15} />,
          },
          {
            title: "2. HOS schedule",
            body: "11 h driving, 14 h window, 30-min break, 10 h reset, 1,000-mi fuel",
            icon: <GaugeIcon size={15} />,
          },
          {
            title: "3. ELD logs",
            body: "A filled 24-hour log grid for every day",
            icon: <FileTextIcon size={15} />,
          },
        ].map(({ title, body, icon }) => (
          <div key={title} className="rounded-lg bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand-700">
              {icon}
              {title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-slate-400">
        <CheckCircleIcon size={13} className="text-brand-500" />
        Every schedule is validated against all FMCSA limits before it is shown
      </p>
    </div>
  );
}
