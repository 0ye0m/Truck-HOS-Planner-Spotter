import { ShieldCheckIcon, TruckIcon } from "@/components/icons";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-night-950 text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white shadow-inner">
            <TruckIcon size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">TruckHOS Planner</h1>
            <p className="text-xs text-slate-300">
              Plan compliant routes and generate ELD logs
            </p>
          </div>
        </div>
        <nav
          aria-label="Rule set"
          className="hidden items-center gap-2 text-[11px] font-medium sm:flex"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-slate-200">
            <ShieldCheckIcon size={12} className="text-brand-100" />
            FMCSA §395.3
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">
            Property-carrying · 70 hr / 8 day
          </span>
          <span className="rounded-full bg-brand-500/20 px-3 py-1 text-brand-100">
            OpenStreetMap + OSRM
          </span>
        </nav>
      </div>
    </header>
  );
}
