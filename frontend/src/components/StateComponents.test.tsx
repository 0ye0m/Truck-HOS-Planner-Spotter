import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import LoadingStages from "@/components/LoadingStages";
import { ApiRequestError, friendlyError } from "@/services/api";

describe("state components", () => {
  it("EmptyState explains what to do before any trip exists", () => {
    render(<EmptyState />);
    expect(screen.getByText(/plan your first trip/i)).toBeInTheDocument();
    expect(
      screen.getByText(/current location, pickup, dropoff/i)
    ).toBeInTheDocument();
  });

  it("LoadingStages announces progress politely", () => {
    render(<LoadingStages />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    // The current stage label appears in the live region heading...
    expect(
      within(region).getAllByText(/geocoding locations/i).length
    ).toBeGreaterThan(0);
  });

  it("ErrorState shows the message and triggers retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState message="Pickup location could not be found." onRetry={onRetry} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pickup location could not be found."
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("friendlyError", () => {
  it("passes through structured API errors", () => {
    const error = new ApiRequestError(
      "Unable to find 'Nowhere'. Please choose a more specific address (city and state).",
      "address-not-found"
    );
    expect(friendlyError(error)).toMatch(/more specific address/);
  });

  it("maps raw network failures to an actionable message", () => {
    const error = new TypeError("Failed to fetch");
    const message = friendlyError(error);
    expect(message).toMatch(/cannot reach the trip planner server/i);
    expect(message).not.toMatch(/failed to fetch/i);
  });

  it("never leaks raw exception text for unknown errors", () => {
    expect(friendlyError(undefined)).toMatch(/try again/i);
  });
});
