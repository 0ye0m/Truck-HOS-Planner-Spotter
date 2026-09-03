import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import LocationInput from "@/components/LocationInput";
import { MapPinIcon } from "@/components/icons";
import { ALL_CITY_COUNT, isKnownCityLabel, searchCities } from "@/data/usCities";

/** Stateful harness — the combobox is a controlled component. */
function Harness({
  label,
  onChangeSpy,
}: {
  label: string;
  onChangeSpy?: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <LocationInput
      id="loc-test"
      label={label}
      leadingIcon={MapPinIcon}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
    />
  );
}

describe("usCities dataset", () => {
  it("covers a large set of US cities", () => {
    expect(ALL_CITY_COUNT).toBeGreaterThan(500);
  });

  it("ranks major freight hubs above same-prefix smaller cities", () => {
    const labels = searchCities("columbus").map((o) => o.label);
    expect(labels[0]).toBe("Columbus, OH");
    const springfields = searchCities("springfield").map((o) => o.label);
    expect(springfields.length).toBeGreaterThan(1);
    expect(springfields).toContain("Springfield, IL");
  });

  it("matches by state code and state name", () => {
    const byCode = searchCities("wy").map((o) => o.label);
    expect(byCode).toContain("Cheyenne, WY");
    const byName = searchCities("oregon").every((o) => o.state === "OR");
    expect(byName).toBe(true);
  });

  it("confirms known labels and rejects unknown text", () => {
    expect(isKnownCityLabel("Chicago, IL")).toBe(true);
    expect(isKnownCityLabel("chicago, il")).toBe(true);
    expect(isKnownCityLabel("123 Main St, Chicago, IL")).toBe(false);
  });
});

describe("LocationInput combobox", () => {
  it("opens suggestions while typing and selects one on click", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness label="Pickup Location" onChangeSpy={spy} />);

    const input = screen.getByLabelText(/pickup location/i);
    await user.type(input, "indianap");

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    expect(
      options.some((o) => o.textContent?.includes("Indianapolis"))
    ).toBe(true);

    await user.click(options[0]);
    expect(spy).toHaveBeenLastCalledWith("Indianapolis, IN");
    await waitFor(() => {
      expect(input).toHaveValue("Indianapolis, IN");
    });
  });

  it("keeps free text when nothing matches (custom addresses allowed)", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness label="Current Location" onChangeSpy={spy} />);

    const input = screen.getByLabelText(/current location/i);
    await user.type(input, "123 Warehouse Rd");

    await waitFor(() => {
      expect(screen.getByText(/no saved city matches/i)).toBeInTheDocument();
    });
    expect(input).toHaveValue("123 Warehouse Rd");
  });

  it("shows no suggestions for very short queries", async () => {
    const user = userEvent.setup();
    render(<Harness label="Pickup Location" />);
    await user.type(screen.getByLabelText(/pickup location/i), "d");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
