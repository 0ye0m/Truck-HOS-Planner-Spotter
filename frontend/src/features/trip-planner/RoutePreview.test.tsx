import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RoutePreview from "@/features/trip-planner/RoutePreview";

/** Controlled harness with labeled inputs, mirroring the planner form. */
function Harness({ cycleUsed = "32" }: { cycleUsed?: string }) {
  const [current, setCurrent] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [cycle, setCycle] = useState(cycleUsed);
  return (
    <div>
      <input aria-label="Current location" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input aria-label="Pickup location" value={pickup} onChange={(e) => setPickup(e.target.value)} />
      <input aria-label="Dropoff location" value={dropoff} onChange={(e) => setDropoff(e.target.value)} />
      <input aria-label="Cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} />
      <RoutePreview
        currentLocation={current}
        pickupLocation={pickup}
        dropoffLocation={dropoff}
        cycleUsed={cycle}
      />
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const VALID_RESPONSE = {
  schedulable: true,
  violations: [],
  hos_summary: {
    schedulable: true,
    cycle_used_before: 32,
    cycle_planned: 9.5,
    cycle_remaining_after: 28.5,
    driving_used_in_period: 7,
    driving_remaining_in_period: 4,
    window_used_hours: 9.5,
    window_remaining_hours: 4.5,
    next_break_in_hours: null,
    next_rest_hours: 10,
    restart_used: false,
    total_driving_hours: 7,
    total_on_duty_hours: 2.5,
    violations: [],
  },
  route: {
    distance_miles: 355.6,
    duration_hours: 7.02,
    geometry: [[41.8, -87.6]],
    legs: [],
    provider: "OSRM",
  },
};

function typeLocations() {
  const user = userEvent.setup();
  const current = screen.getByLabelText(/current location/i);
  const pickup = screen.getByLabelText(/pickup location/i);
  const dropoff = screen.getByLabelText(/dropoff location/i);
  return user
    .type(current, "Chicago, IL")
    .then(() => user.type(pickup, "Indianapolis, IN"))
    .then(() => user.type(dropoff, "Columbus, OH"));
}

describe("RoutePreview live estimate", () => {
  it("renders nothing until all three locations have enough characters", () => {
    render(<Harness />);
    expect(screen.queryByTestId("route-preview")).not.toBeInTheDocument();
  });

  it("shows the live estimate after the debounced validate call resolves", async () => {
    const fetchMock = vi.fn(
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(VALID_RESPONSE),
        }) as unknown as Promise<Response>
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    await typeLocations();

    await waitFor(() =>
      expect(screen.getByText(/live estimate/i)).toBeInTheDocument(),
      { timeout: 3000 }
    );
    expect(screen.getByText(/356 mi/)).toBeInTheDocument();
    expect(screen.getByText(/7\.0 h/)).toBeInTheDocument();
    expect(screen.getByText(/compliant/i)).toBeInTheDocument();

    // One dry-run call with exactly the typed locations and the cycle value.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/trips/validate/");
    expect(JSON.parse(String(init?.body))).toEqual({
      current_location: "Chicago, IL",
      pickup_location: "Indianapolis, IN",
      dropoff_location: "Columbus, OH",
      current_cycle_used: 32,
    });
  });

  it("degrades to a soft hint when validation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          Promise.resolve({
            ok: false,
            json: () =>
              Promise.resolve({ error: "Address not found", code: "address-not-found" }),
          }) as unknown as Promise<Response>
      )
    );

    render(<Harness />);
    await typeLocations();

    await waitFor(
      () => expect(screen.getByText(/address not found/i)).toBeInTheDocument(),
      { timeout: 3000 }
    );
  });
});
