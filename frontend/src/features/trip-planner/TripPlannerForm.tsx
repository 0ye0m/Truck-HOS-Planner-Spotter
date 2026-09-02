import { useId, useState } from "react";
import type { PlanRequest } from "@/types";

interface Props {
  isSubmitting: boolean;
  onSubmit: (request: PlanRequest) => void;
}

interface Advanced {
  start_date: string;
  start_time: string;
  driver_name: string;
  carrier_name: string;
  truck_number: string;
  trailer_number: string;
  main_office: string;
}

const EMPTY_ADVANCED: Advanced = {
  start_date: "",
  start_time: "",
  driver_name: "",
  carrier_name: "",
  truck_number: "",
  trailer_number: "",
  main_office: "",
};

/** Deterministic sample scenarios for quick manual QA (assessment §37/38). */
const DEMO_TRIPS: { label: string; current: string; pickup: string; dropoff: string; cycle: string }[] = [
  {
    label: "Short trip",
    current: "Chicago, IL",
    pickup: "Indianapolis, IN",
    dropoff: "Columbus, OH",
    cycle: "32",
  },
  {
    label: "Long haul (multi-day)",
    current: "Los Angeles, CA",
    pickup: "Denver, CO",
    dropoff: "Chicago, IL",
    cycle: "24",
  },
  {
    label: "High cycle usage",
    current: "Dallas, TX",
    pickup: "Memphis, TN",
    dropoff: "Atlanta, GA",
    cycle: "63",
  },
];

export default function TripPlannerForm({ isSubmitting, onSubmit }: Props) {
  const id = useId();
  const [currentLocation, setCurrentLocation] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [cycleUsed, setCycleUsed] = useState("0");
  const [advanced, setAdvanced] = useState<Advanced>(EMPTY_ADVANCED);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const cycleNumber = Number(cycleUsed);
  const cycleValid =
    cycleUsed.trim() !== "" &&
    !Number.isNaN(cycleNumber) &&
    cycleNumber >= 0 &&
    cycleNumber <= 70;
  const remaining = cycleValid ? 70 - cycleNumber : null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);

    if (!currentLocation.trim() || !pickupLocation.trim() || !dropoffLocation.trim()) {
      setLocalError("All three locations are required.");
      return;
    }
    if (!cycleValid) {
      setLocalError("Current cycle used must be a number between 0 and 70 hours.");
      return;
    }

    const request: PlanRequest = {
      current_location: currentLocation.trim(),
      pickup_location: pickupLocation.trim(),
      dropoff_location: dropoffLocation.trim(),
      current_cycle_used: cycleNumber,
    };
    const a = advanced;
    if (a.start_date) request.start_date = a.start_date;
    if (a.start_time) request.start_time = a.start_time;
    if (a.driver_name.trim()) request.driver_name = a.driver_name.trim();
    if (a.carrier_name.trim()) request.carrier_name = a.carrier_name.trim();
    if (a.truck_number.trim()) request.truck_number = a.truck_number.trim();
    if (a.trailer_number.trim()) request.trailer_number = a.trailer_number.trim();
    if (a.main_office.trim()) request.main_office = a.main_office.trim();

    onSubmit(request);
  }

  function loadDemo(index: number) {
    const demo = DEMO_TRIPS[index];
    if (!demo) return;
    setCurrentLocation(demo.current);
    setPickupLocation(demo.pickup);
    setDropoffLocation(demo.dropoff);
    setCycleUsed(demo.cycle);
    setLocalError(null);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white shadow-card"
      aria-label="Trip planner"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-night-900">Trip Planner</h2>
          <p className="text-xs text-slate-500">
            Enter trip details to compute a legal HOS schedule
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Load a sample trip"
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Examples
          </span>
          {DEMO_TRIPS.map((demo, index) => (
            <button
              key={demo.label}
              type="button"
              onClick={() => loadDemo(index)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-600"
            >
              {demo.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <Field
          id={`${id}-current`}
          label="Current Location"
          placeholder="e.g. Chicago, IL"
          value={currentLocation}
          onChange={setCurrentLocation}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={`${id}-pickup`}
            label="Pickup Location"
            placeholder="e.g. Indianapolis, IN"
            value={pickupLocation}
            onChange={setPickupLocation}
          />
          <Field
            id={`${id}-dropoff`}
            label="Dropoff Location"
            placeholder="e.g. Columbus, OH"
            value={dropoffLocation}
            onChange={setDropoffLocation}
          />
        </div>

        <div>
          <label
            htmlFor={`${id}-cycle`}
            className="mb-1 block text-sm font-medium text-night-800"
          >
            Current Cycle Used (hrs){" "}
            <span className="text-xs font-normal text-slate-400">
              70-hour / 8-day cycle
            </span>
          </label>
          <input
            id={`${id}-cycle`}
            type="number"
            min={0}
            max={70}
            step="0.5"
            value={cycleUsed}
            onChange={(e) => setCycleUsed(e.target.value)}
            placeholder="0 – 70"
            aria-invalid={!cycleValid && cycleUsed !== ""}
            aria-describedby={remaining !== null ? `${id}-cycle-remaining` : undefined}
            className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
              cycleValid || cycleUsed === ""
                ? "border-slate-300 focus:border-brand-500 focus:ring-brand-100"
                : "border-red-300 focus:border-red-400 focus:ring-red-100"
            }`}
          />
          {remaining !== null && (
            <p id={`${id}-cycle-remaining`} className="mt-1.5 text-xs text-slate-500">
              Remaining 70/8 cycle:{" "}
              <span className="font-semibold text-brand-600">
                {remaining.toFixed(1)} h
              </span>
            </p>
          )}
        </div>

        {/* Advanced trip info */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            {showAdvanced ? "▾ Hide advanced trip information" : "▸ Advanced trip information (optional)"}
          </button>
          {showAdvanced && (
            <div className="mt-3 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
              <Field
                id={`${id}-start-date`}
                label="Trip start date"
                type="date"
                value={advanced.start_date}
                onChange={(v) => setAdvanced({ ...advanced, start_date: v })}
              />
              <Field
                id={`${id}-start-time`}
                label="Trip start time (home terminal)"
                type="time"
                value={advanced.start_time}
                onChange={(v) => setAdvanced({ ...advanced, start_time: v })}
              />
              <Field
                id={`${id}-driver`}
                label="Driver name"
                value={advanced.driver_name}
                onChange={(v) => setAdvanced({ ...advanced, driver_name: v })}
              />
              <Field
                id={`${id}-carrier`}
                label="Carrier name"
                value={advanced.carrier_name}
                onChange={(v) => setAdvanced({ ...advanced, carrier_name: v })}
              />
              <Field
                id={`${id}-truck`}
                label="Truck / tractor no."
                value={advanced.truck_number}
                onChange={(v) => setAdvanced({ ...advanced, truck_number: v })}
              />
              <Field
                id={`${id}-trailer`}
                label="Trailer no."
                value={advanced.trailer_number}
                onChange={(v) => setAdvanced({ ...advanced, trailer_number: v })}
              />
              <Field
                id={`${id}-office`}
                label="Main office (city, state)"
                value={advanced.main_office}
                onChange={(v) => setAdvanced({ ...advanced, main_office: v })}
              />
            </div>
          )}
        </div>

        {localError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600"
          >
            {localError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Planning…" : "Plan Trip & Generate ELD Logs"}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-night-800">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
