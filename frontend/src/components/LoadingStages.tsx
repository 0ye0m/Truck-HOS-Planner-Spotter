import { useEffect, useState } from "react";
import { LOADING_STAGES } from "@/services/api";

/**
 * Staged loading feedback: "Calculating route…" → "Checking HOS…" →
 * "Generating ELD logs…" — keeps the UI alive while the pipeline runs.
 */
export default function LoadingStages() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setStage((s) => Math.min(s + 1, LOADING_STAGES.length - 1)),
      1600
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-card"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-sm font-semibold text-night-900">
          {LOADING_STAGES[stage]}
        </p>
      </div>
      <div className="mt-4 space-y-2">
        {[420, 380, 340].map((width, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-slate-100"
            style={{ width: `${(width / 500) * 100}%`, animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <div className="mt-4 flex gap-2 text-[11px]">
        {LOADING_STAGES.map((label, i) => (
          <span
            key={label}
            className={`rounded-full px-2 py-0.5 ${
              i <= stage
                ? "bg-brand-50 font-medium text-brand-700"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {i + 1}. {label.replace("…", "")}
          </span>
        ))}
      </div>
    </div>
  );
}
