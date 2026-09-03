import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LocationInput from "@/components/LocationInput";
import { MapPinIcon } from "@/components/icons";
import { ALL_CITY_COUNT, isKnownCityLabel, searchCities } from "@/data/usCities";

/** Stateful harness — the combobox is a controlled component. */
function Harness({
  label,
  onChangeSpy,
  liveSuggestions,
}: {
  label: string;
  onChangeSpy?: (v: string) => void;
  liveSuggestions?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <LocationInput
      id="loc-test"
      label={label}
      leadingIcon={MapPinIcon}
      value={value}
      liveSuggestions={liveSuggestions}
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  /** textContent of a row uses \u00A0 inside ", ST" — normalize for matching. */
  const rowText = (el: HTMLElement) =>
    (el.textContent ?? "").replace(/\u00A0/g, " ");

  it("opens instant suggestions while typing and selects one on click", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness label="Pickup Location" onChangeSpy={spy} liveSuggestions={false} />);

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
    render(<Harness label="Current Location" onChangeSpy={spy} liveSuggestions={false} />);

    const input = screen.getByLabelText(/current location/i);
    await user.type(input, "123 Warehouse Rd");

    await waitFor(() => {
      expect(screen.getByText(/no matches for/i)).toBeInTheDocument();
    });
    // The exact-address escape hatch is offered and selection keeps free text.
    const listbox = screen.getByRole("listbox");
    await user.click(within(listbox).getByText(/use exact address/i));
    expect(input).toHaveValue("123 Warehouse Rd");
  });

  it("shows popular hubs on focus and hides them for very short queries", async () => {
    const user = userEvent.setup();
    render(<Harness label="Pickup Location" liveSuggestions={false} />);
    const input = screen.getByLabelText(/pickup location/i);

    await user.click(input);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option").length).toBeGreaterThan(0);
    expect(within(listbox).getByText(/popular freight hubs/i)).toBeInTheDocument();

    await user.tab();
    await user.type(input, "d");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("replaces local matches with live server results after debounce", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                label: "Springfield, MO",
                display_name: "Springfield, Greene County, Missouri",
                lat: 37.2,
                lon: -93.3,
                kind: "city",
              },
            ],
          }),
      })
    );
    const user = userEvent.setup();
    render(<Harness label="Current Location" />);

    const input = screen.getByLabelText(/current location/i);
    await user.type(input, "springfield");

    // Live results arrive (after the 300 ms debounce) with the LIVE badge.
    const liveBadge = await screen.findByText(/live results/i);
    expect(liveBadge).toBeInTheDocument();
    const listbox = screen.getByRole("listbox");
    await waitFor(() => {
      expect(
        within(listbox)
          .getAllByRole("option")
          .some((o) => rowText(o).includes("Springfield, MO"))
      ).toBe(true);
    });
    // Selecting a live option fills the canonical "City, ST" string.
    const liveOption = within(listbox)
      .getAllByRole("option")
      .find((o) => rowText(o).includes("Springfield, MO"))!;
    await user.click(liveOption);
    expect(input).toHaveValue("Springfield, MO");
  });

  it("falls back to instant local results when the server fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();
    render(<Harness label="Current Location" />);

    const input = screen.getByLabelText(/current location/i);
    await user.type(input, "indianap");

    // Local layer still provides suggestions — autocomplete never breaks.
    await waitFor(() => {
      const options = within(screen.getByRole("listbox")).getAllByRole("option");
      expect(options.some((o) => rowText(o).includes("Indianapolis, IN"))).toBe(true);
    });
  });
});
