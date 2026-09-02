import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import TripPlannerForm from "@/features/trip-planner/TripPlannerForm";
import type { PlanRequest } from "@/types";

describe("TripPlannerForm — user-visible behavior", () => {
  it("blocks submission when locations are missing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TripPlannerForm isSubmitting={false} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /plan trip/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "All three locations are required."
    );
  });

  it("blocks submission when cycle hours are out of range", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TripPlannerForm isSubmitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/current location/i), "Chicago, IL");
    await user.type(screen.getByLabelText(/pickup location/i), "Indianapolis, IN");
    await user.type(screen.getByLabelText(/dropoff location/i), "Columbus, OH");
    const cycle = screen.getByLabelText(/current cycle used/i);
    await user.clear(cycle);
    await user.type(cycle, "85");
    await user.click(screen.getByRole("button", { name: /plan trip/i }));

    // Native constraint validation (max=70) blocks the submit event and the
    // field is marked invalid; nothing is ever submitted.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(cycle).toHaveAttribute("aria-invalid", "true");
  });

  it("submits a well-formed request with trimmed values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TripPlannerForm isSubmitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/current location/i), "  Chicago, IL ");
    await user.type(screen.getByLabelText(/pickup location/i), "Indianapolis, IN");
    await user.type(screen.getByLabelText(/dropoff location/i), "Columbus, OH");
    await user.click(screen.getByRole("button", { name: /plan trip/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const request: PlanRequest = onSubmit.mock.calls[0][0];
    expect(request.current_location).toBe("Chicago, IL");
    expect(request.pickup_location).toBe("Indianapolis, IN");
    expect(request.dropoff_location).toBe("Columbus, OH");
    expect(request.current_cycle_used).toBe(0);
  });

  it("loads a demo trip into the form without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TripPlannerForm isSubmitting={false} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Short trip" }));
    expect(screen.getByLabelText(/current location/i)).toHaveValue("Chicago, IL");
    expect(screen.getByLabelText(/pickup location/i)).toHaveValue("Indianapolis, IN");
    expect(screen.getByLabelText(/dropoff location/i)).toHaveValue("Columbus, OH");
    expect(screen.getByLabelText(/current cycle used/i)).toHaveValue(32);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the remaining cycle for the entered value", async () => {
    const user = userEvent.setup();
    render(<TripPlannerForm isSubmitting={false} onSubmit={vi.fn()} />);
    const cycle = screen.getByLabelText(/current cycle used/i);
    await user.clear(cycle);
    await user.type(cycle, "30");
    expect(screen.getByText(/remaining 70\/8 cycle/i)).toHaveTextContent("40.0 h");
  });
});
