import { useEffect, useState } from "react";
import { allLogsPdfUrl, logImageUrl } from "@/services/api";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  ZoomInIcon,
  ZoomOutIcon,
  XIcon,
} from "@/components/icons";
import type { PlanPayload } from "@/types";

/**
 * ELD logs panel: one card per day with a lazy-loaded preview of the real
 * rendered log sheet, View / Download controls, "Download All Logs (PDF)"
 * and a full-screen log viewer modal.
 */
export default function EldLogsPanel({ payload }: { payload: PlanPayload }) {
  const [viewingDay, setViewingDay] = useState<number | null>(null);
  const { logs, trip } = payload;

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-card">
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
          href={allLogsPdfUrl(trip.id)}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-600 px-4 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
          download
        >
          <DownloadIcon size={13} />
          Download All Logs (PDF)
        </a>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {logs.map((log) => (
          <div
            key={log.day_number}
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow"
          >
            <button
              type="button"
              onClick={() => setViewingDay(log.day_number)}
              className="flex w-full items-center justify-between bg-night-900 px-4 py-2.5 text-left text-white"
              aria-label={`Open log viewer for day ${log.day_number}`}
            >
              <span className="text-sm font-semibold">
                Day {log.day_number}
                <span className="ml-2 font-normal text-slate-300">
                  {weekdayOf(log.date)}
                </span>
              </span>
              <span className="text-xs tabular-nums text-slate-300">{log.date}</span>
            </button>

            {/* Real rendered log sheet preview */}
            <button
              type="button"
              onClick={() => setViewingDay(log.day_number)}
              aria-label={`Preview log sheet for day ${log.day_number}`}
              className="block w-full border-b border-slate-100 bg-slate-50 p-2"
            >
              <img
                src={logImageUrl(payload, log.day_number)}
                alt={`Daily ELD log sheet preview for day ${log.day_number}, ${log.date}`}
                loading="lazy"
                decoding="async"
                className="mx-auto block h-36 w-auto rounded border border-slate-200 bg-white object-contain shadow-sm transition group-hover:border-brand-300"
              />
            </button>

            <div className="space-y-1.5 px-4 py-3 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Miles driven</span>
                <span className="font-semibold tabular-nums text-night-900">
                  {log.miles.toFixed(0)} mi
                </span>
              </div>
              <div className="flex justify-between">
                <span>Driving</span>
                <span className="font-medium tabular-nums">{log.driving_hours.toFixed(2)} h</span>
              </div>
              <div className="flex justify-between">
                <span>On duty (ND)</span>
                <span className="font-medium tabular-nums">{log.on_duty_hours.toFixed(2)} h</span>
              </div>
              <div className="flex justify-between">
                <span>Sleeper berth</span>
                <span className="font-medium tabular-nums">{log.sleeper_hours.toFixed(2)} h</span>
              </div>
              <div className="flex justify-between">
                <span>Off duty</span>
                <span className="font-medium tabular-nums">{log.off_duty_hours.toFixed(2)} h</span>
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
              <button
                onClick={() => setViewingDay(log.day_number)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                <FileTextIcon size={13} />
                View Log
              </button>
              <a
                href={logImageUrl(payload, log.day_number)}
                download={`day${log.day_number}_log.png`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-600 transition hover:border-brand-500 hover:text-brand-600"
              >
                <DownloadIcon size={13} />
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

function weekdayOf(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { weekday: "long" });
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

  // Close on Escape (dialog behavior).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!log) return null;

  const toolBtn =
    "inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 font-medium text-white transition hover:bg-white/20 disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Daily ELD log viewer — day ${log.day_number} of ${total}`}
    >
      <div
        className="mx-auto flex h-full w-full max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-white">
          <p className="text-sm font-semibold">
            Day {log.day_number} of {total} — {log.date}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              disabled={log.day_number <= 1}
              onClick={() => onNavigate(log.day_number - 1)}
              aria-label="Show previous day log"
              className={toolBtn}
            >
              <ChevronLeftIcon size={13} /> Previous Day
            </button>
            <span className="px-1 tabular-nums text-slate-300">
              {log.day_number} / {total}
            </span>
            <button
              disabled={log.day_number >= total}
              onClick={() => onNavigate(log.day_number + 1)}
              aria-label="Show next day log"
              className={toolBtn}
            >
              Next Day <ChevronRightIcon size={13} />
            </button>
            <span className="mx-1 hidden h-4 w-px bg-white/20 sm:block" aria-hidden="true" />
            <button
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              className={toolBtn}
            >
              <ZoomOutIcon size={13} /> Zoom Out
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
              className={toolBtn}
            >
              <ZoomInIcon size={13} /> Zoom In
            </button>
            <a
              href={logImageUrl(payload, log.day_number)}
              download={`day${log.day_number}_log.png`}
              className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-2.5 py-1.5 font-semibold text-white transition hover:bg-brand-600"
            >
              <DownloadIcon size={13} /> Download
            </a>
            <button
              onClick={onClose}
              aria-label="Close log viewer"
              className="inline-flex items-center gap-1 rounded-md bg-red-500/90 px-2.5 py-1.5 font-semibold text-white transition hover:bg-red-500"
            >
              <XIcon size={13} /> Close
            </button>
          </div>
        </div>
        <div className="thin-scroll flex-1 overflow-auto rounded-lg bg-white">
          <img
            src={logImageUrl(payload, log.day_number)}
            alt={`Daily ELD log sheet for day ${log.day_number}, ${log.date}`}
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
