export default function Header() {
  return (
    <header className="bg-night-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-xl font-bold">
            🛣️
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              TruckHOS Planner
            </h1>
            <p className="text-xs text-slate-300">
              Plan compliant routes and generate ELD logs
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[11px] font-medium sm:flex">
          <span className="rounded-full bg-white/10 px-3 py-1">
            FMCSA 70hr / 8-day
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1">
            Property-carrying
          </span>
          <span className="rounded-full bg-brand-500/20 px-3 py-1 text-brand-100">
            OpenStreetMap + OSRM
          </span>
        </div>
      </div>
    </header>
  );
}
