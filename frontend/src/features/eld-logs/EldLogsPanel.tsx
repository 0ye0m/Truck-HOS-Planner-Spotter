import { useState } from "react";
import type { PlanPayload } from "@/types";

/**
 * ELD logs panel: one card per day with View / Download controls, plus
 * "Download All Logs (PDF)" and a full-screen log viewer modal.
 */
export default function EldLogsPanel({ payload }: { payload: PlanPayload }) {
  const [viewingDay, setViewingDay] = useState<number | null>(null);
  const { logs, trip } = payload;

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-night-900">
            Daily ELD Logs
          </h2>
          <p className="text-xs text-slate-500">
            {logs.length} daily log sheet{logs.length === 1 ? "" : "s"} ·
            24-hour graph grid · FMCSA record of duty status
          </p>
        </div>
        <a
          href={`/api/trips/${trip.id}/logs/pdf/`}
          className="rounded-lg border border-brand-600 px-4 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
          download
        >
          ⬇ Download All Logs (PDF)
        </a>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {logs.map((log) => (
          <div
            key={log.day_number}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow"
          >
            <div className="flex items-center justify-between bg-night-900 px-4 py-2.5 text-white">
              <span className="text-sm font-semibold">Day {log.day_number}</span>
              <span className="text-xs text-slate-300">{log.date}</span>
            </div>
            <div className="space-y-1.5 px-4 py-3 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Miles driven</span>
                <span className="font-semibold text-night-900">
                  {log.miles.toFixed(0)} mi
                </span>
              </div>
              <div className="flex justify-between">
                <span>Driving</span>
                <span className="font-medium">{log.driving_hours.toFixed(2)} h</span>
              </div>
              <div className="flex justify-between">
                <span>On duty (ND)</span>
                <span className="font-medium">{log.on_duty_hours.toFixed(2)} h</span>
              </div>
              <div className="flex justify-between">
                <span>Sleeper berth</span>
                <span className="font-medium">{log.sleeper_hours.toFixed(2)} h</span>
              </div>
              <div className="flex justify-between">
                <span>Off duty</span>
                <span className="font-medium">{log.off_duty_hours.toFixed(2)} h</span>
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
              <button
                onClick={() => setViewingDay(log.day_number)}
                className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                View Log
              </button>
              <a
                href={log.image_url}
                download={`day${log.day_number}_log.png`}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-600 transition hover:border-brand-500 hover:text-brand-600"
              >
                Download
              </a>
            </div>
          </div>
        ))}
      </div>

      {viewingDay !== null && (
        <LogViewerModal
          payload={payload}
          day={viewingDay}
          onClose={() => setViewingDay(null)}
          onNavigate={setViewingDay}
        />
      )}
    </section>
  );
}

function LogViewerModal({
  payload,
  day,
  onClose,
  onNavigate,
}: {
  payload: PlanPayload;
  day: number;
  onClose: () => void;
  onNavigate: (day: number) => void;
}) {
  const total = payload.logs.length;
  const log = payload.logs.find((l) => l.day_number === day);
  const [zoom, setZoom] = useState(1);
  if (!log) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-white">
          <p className="text-sm font-semibold">
            Day {log.day_number} of {total} — {log.date}
          </p>
          <div className="flex items-center gap-2 text-xs">
            <button
              disabled={log.day_number <= 1}
              onClick={() => onNavigate(log.day_number - 1)}
              className="rounded-md bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20 disabled:opacity-40"
            >
              ← Previous Day
            </button>
            <span className="px-1 text-slate-300">
              {log.day_number} / {total}
            </span>
            <button
              disabled={log.day_number >= total}
              onClick={() => onNavigate(log.day_number + 1)}
              className="rounded-md bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20 disabled:opacity-40"
            >
              Next Day →
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              className="rounded-md bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20"
            >
              Zoom Out
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
              className="rounded-md bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20"
            >
              Zoom In
            </button>
            <a
              href={log.image_url}
              download={`day${log.day_number}_log.png`}
              className="rounded-md bg-brand-500 px-3 py-1.5 font-semibold hover:bg-brand-600"
            >
              ⬇ Download
            </a>
            <button
              onClick={onClose}
              className="rounded-md bg-red-500/90 px-3 py-1.5 font-semibold hover:bg-red-500"
            >
              ✕ Close
            </button>
          </div>
        </div>
        <div className="thin-scroll flex-1 overflow-auto rounded-lg bg-white">
          <img
            src={log.image_url}
            alt={`Daily ELD log day ${log.day_number}`}
            className="mx-auto block origin-top transition-transform"
            style={{
              transform: `scale(${zoom})`,
              width: `${Math.round(100 * Math.max(1, zoom))}%`,
              maxWidth: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
