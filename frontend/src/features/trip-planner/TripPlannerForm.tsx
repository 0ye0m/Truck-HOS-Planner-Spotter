import { useId, useState } from "react";
import LocationInput from "@/components/LocationInput";
import {
  ArrowRightIcon,
  FlagIcon,
  GaugeIcon,
  InfoHint,
  MapPinIcon,
  PackageIcon,
  SlidersIcon,
  TruckIcon,
} from "@/components/icons";
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
const DEMO_TRIPS: {
  label: string;
  current: string;
  pickup: string;
  dropoff: string;
  cycle: string;
  note: string;
}[] = [
  {
    label: "Short trip",
    current: "Chicago, IL",
    pickup: "Indianapolis, IN",
    dropoff: "Columbus, OH",
    cycle: "32",
    note: "Chicago → Indianapolis → Columbus · cycle 32 h",
  },
  {
    label: "Long haul",
    current: "Los Angeles, CA",
    pickup: "Denver, CO",
    dropoff: "Chicago, IL",
    cycle: "24",
    note: "LA → Denver → Chicago · cycle 24 h",
  },
  {
    label: "High cycle",
    current: "Dallas, TX",
    pickup: "Memphis, TN",
    dropoff: "Atlanta, GA",
    cycle: "63",
    note: "Dallas → Memphis → Atlanta · cycle 63 h",
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
      className="rounded-2xl border border-line bg-white shadow-card"
      aria-label="Trip planner"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
        <div>
          <h2 className="text-lg font-bold tracking-tightest text-night-900">
            Plan your trip
          </h2>
          <p className="mt-0.5 text-[13px] text-night-500">
            Route, HOS schedule and ELD logs — computed the moment you submit
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Load a sample trip"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-night-500">
            Try
          </span>
          {DEMO_TRIPS.map((demo, index) => (
            <button
              key={demo.label}
              type="button"
              title={demo.note}
              aria-label={demo.label}
              onClick={() => loadDemo(index)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-night-700 transition hover:border-ink hover:bg-ink hover:text-white"
            >
              {demo.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        {/* Step 1 — current location */}
        <LocationInput
          id={`${id}-current`}
          label="Current location"
          step="1"
          leadingIcon={MapPinIcon}
          placeholder="City, state or street address"
          value={currentLocation}
          onChange={setCurrentLocation}
        />

        {/* Steps 2–3 — pickup + dropoff */}
        <div className="grid gap-4 sm:grid-cols-2">
          <LocationInput
            id={`${id}-pickup`}
            label="Pickup location"
            step="2"
            leadingIcon={PackageIcon}
            placeholder="City, state or address"
            value={pickupLocation}
            onChange={setPickupLocation}
          />
          <LocationInput
            id={`${id}-dropoff`}
            label="Dropoff location"
            step="3"
            leadingIcon={FlagIcon}
            placeholder="City, state or address"
            value={dropoffLocation}
            onChange={setDropoffLocation}
          />
        </div>

        {/* Step 4 — current cycle used */}
        <div>
          <label
            htmlFor={`${id}-cycle`}
            className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-night-900"
          >
            <span
              aria-hidden="true"
              className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white"
            >
              4
            </span>
            Current cycle used
            <InfoHint
              text="Hours already used in your 70-hour / 8-day cycle before this trip begins."
              label="Hours already used in your 70-hour / 8-day cycle before this trip begins."
            />
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-night-500">
                <GaugeIcon size={17} />
              </span>
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
                className={`h-12 w-full rounded-lg border px-10 text-[15px] outline-none transition placeholder:text-night-500/60 ${
                  cycleValid || cycleUsed === ""
                    ? "border-line hover:border-night-500/50 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                    : "border-[#E11900] focus:border-[#E11900] focus:ring-4 focus:ring-[#E11900]/10"
                }`}
              />
            </div>
            <span className="flex-none text-[13px] font-medium text-night-500">of 70 h</span>
          </div>
          <input
            type="range"
            min={0}
            max={70}
            step={0.5}
            value={cycleValid ? cycleNumber : 0}
            onChange={(e) => setCycleUsed(e.target.value)}
            aria-label={`Cycle used slider: ${cycleValid ? cycleNumber : 0} of 70 hours`}
            className="mt-3 w-full"
          />
          {remaining !== null && (
            <p id={`${id}-cycle-remaining`} className="mt-1.5 text-[13px] text-night-500">
              Remaining 70/8 cycle:{" "}
              <span className="font-semibold text-ok-600">{remaining.toFixed(1)} h</span>
            </p>
          )}
        </div>

        {/* Advanced trip info */}
        <div className="rounded-xl border border-line bg-canvas/70">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-night-900">
              <SlidersIcon size={14} className="text-night-500" />
              Advanced trip information
              <span className="font-normal text-night-500">(optional)</span>
            </span>
            <span
              aria-hidden="true"
              className={`text-night-500 transition-transform duration-150 ${showAdvanced ? "rotate-180" : ""}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>
          {showAdvanced && (
            <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2">
              <PlainField
                id={`${id}-start-date`}
                label="Trip start date"
                type="date"
                value={advanced.start_date}
                onChange={(v) => setAdvanced({ ...advanced, start_date: v })}
              />
              <PlainField
                id={`${id}-start-time`}
                label="Trip start time (home terminal)"
                type="time"
                value={advanced.start_time}
                onChange={(v) => setAdvanced({ ...advanced, start_time: v })}
              />
              <PlainField
                id={`${id}-driver`}
                label="Driver name"
                value={advanced.driver_name}
                onChange={(v) => setAdvanced({ ...advanced, driver_name: v })}
              />
              <PlainField
                id={`${id}-carrier`}
                label="Carrier name"
                value={advanced.carrier_name}
                onChange={(v) => setAdvanced({ ...advanced, carrier_name: v })}
              />
              <PlainField
                id={`${id}-truck`}
                label="Truck / tractor no."
                value={advanced.truck_number}
                onChange={(v) => setAdvanced({ ...advanced, truck_number: v })}
              />
              <PlainField
                id={`${id}-trailer`}
                label="Trailer no."
                value={advanced.trailer_number}
                onChange={(v) => setAdvanced({ ...advanced, trailer_number: v })}
              />
              <PlainField
                id={`${id}-office`}
                label="Main office (city, state)"
                value={advanced.main_office}
                onChange={(v) => setAdvanced({ ...advanced, main_office: v })}
              />
              <p className="text-[11px] leading-relaxed text-night-500 sm:col-span-2">
                Left blank = “Not provided” on the logs. Without a start time the plan assumes{" "}
                <strong className="font-semibold text-night-700">06:00 AM</strong> at the home
                terminal and marks it on the results.
              </p>
            </div>
          )}
        </div>

        {localError && (
          <p
            role="alert"
            className="rounded-lg bg-[#FDECEA] px-3.5 py-2.5 text-[13px] font-medium text-[#B3261E]"
          >
            {localError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-[15px] font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
              />
              Planning…
            </>
          ) : (
            <>
              <TruckIcon size={17} />
              Plan trip
              <ArrowRightIcon size={15} />
            </>
          )}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-night-500">
          Pick a city from the live suggestions or type any street address — the planner
          geocodes, routes and validates HOS compliance end to end.
        </p>
      </div>
    </form>
  );
}

function PlainField({
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
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-night-900">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none transition hover:border-night-500/50 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
      />
    </div>
  );
}
