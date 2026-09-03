import { ShieldCheckIcon, TruckIcon } from "@/components/icons";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
            <TruckIcon size={20} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[17px] font-bold tracking-tightest text-night-900">
              TruckHOS <span className="font-medium text-night-500">Planner</span>
            </h1>
            <p className="text-[11px] text-night-500">
              Compliant routes &amp; ELD logs
            </p>
          </div>
        </div>
        <nav
          aria-label="Rule set"
          className="hidden items-center gap-2 text-[11px] font-semibold sm:flex"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-night-700">
            <ShieldCheckIcon size={12} className="text-ok-600" />
            FMCSA §395.3
          </span>
          <span className="rounded-full border border-line px-3 py-1.5 text-night-700">
            Property-carrying · 70 hr / 8 day
          </span>
          <span className="rounded-full bg-brand-50 px-3 py-1.5 text-brand-700">
            OpenStreetMap + OSRM
          </span>
        </nav>
      </div>
    </header>
  );
}
