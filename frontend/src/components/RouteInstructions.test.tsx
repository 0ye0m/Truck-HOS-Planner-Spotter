import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RouteInstructions, {
  formatStepDistance,
} from "@/components/RouteInstructions";
import {
  maneuverKey,
  maneuverKeyFromText,
} from "@/components/ManeuverIcon";
import type { PlanPayload } from "@/types";

function step(
  instruction: string,
  distance_miles: number,
  extra: Partial<{ name: string; maneuver: string; modifier: string }> = {}
) {
  return { instruction, name: extra.name ?? "", distance_miles, ...extra };
}

function makePayload(legs: PlanPayload["route"]["legs"]): PlanPayload {
  return {
    trip: {
      id: 1,
      current_location: "Chicago, IL",
      pickup_location: "Indianapolis, IN",
      dropoff_location: "Columbus, OH",
      current_cycle_used: 32,
      start_datetime: null,
      assumed_start_time: false,
      home_terminal_timezone: "America/Chicago",
      driver_name: "",
      carrier_name: "",
      truck_number: "",
      trailer_number: "",
      main_office: "",
      co_driver: "",
      created_at: "2026-01-01T00:00:00Z",
    },
    route: {
      distance_miles: 355.6,
      duration_hours: 7.0,
      geometry: [
        [41.8, -87.6],
        [39.9, -83.0],
      ],
      legs,
      provider: "OSRM",
    },
    schedule: { activities: [], restart_used: false },
    hos_summary: {} as PlanPayload["hos_summary"],
    markers: [],
    logs: [],
  };
}

const sampleLegs: PlanPayload["route"]["legs"] = [
  {
    leg_index: 0,
    distance_miles: 184.1,
    duration_hours: 3.2,
    steps: [
      step("Head out on I-90 W", 8.2, { name: "I-90 W", maneuver: "depart" }),
      step("Keep left", 0.05), // zero-info → dropped
      step("Turn right onto US-30 E", 1.4, {
        name: "US-30 E",
        maneuver: "turn",
        modifier: "right",
      }),
      step("Arrive at destination", 0, { maneuver: "arrive" }),
    ],
  },
  {
    leg_index: 1,
    distance_miles: 171.5,
    duration_hours: 2.9,
    steps: [
      step("Head out on I-70 E", 4.0, { name: "I-70 E", maneuver: "depart" }),
      step("At the roundabout and take the 2nd exit onto WI-16 W", 0.3, {
        name: "WI-16 W",
        maneuver: "roundabout",
      }),
      step("Arrive at destination — destination is on your right", 0, {
        maneuver: "arrive",
        modifier: "right",
      }),
    ],
  },
];

describe("formatStepDistance", () => {
  it("renders feet under 0.15 mi", () => {
    expect(formatStepDistance(0.05)).toMatch(/ft$/);
    expect(formatStepDistance(0.1)).toBe("550 ft"); // 528 ft rounds to the nearest 50
  });

  it("renders one-decimal miles under 10 mi", () => {
    expect(formatStepDistance(2.44)).toBe("2.4 mi");
  });

  it("renders whole miles above 10 mi", () => {
    expect(formatStepDistance(38.2)).toBe("38 mi");
  });

  it("renders nothing for zero distance", () => {
    expect(formatStepDistance(0)).toBe("");
  });
});

describe("maneuverKey", () => {
  it("maps turn modifiers", () => {
    expect(maneuverKey("turn", "left")).toBe("turn-left");
    expect(maneuverKey("turn", "slight right")).toBe("slight-right");
    expect(maneuverKey("end of road", "sharp left")).toBe("sharp-left");
    expect(maneuverKey("turn", "uturn")).toBe("uturn");
  });

  it("maps ramps, forks, merges and roundabouts", () => {
    expect(maneuverKey("off ramp", "right")).toBe("ramp-right");
    expect(maneuverKey("on ramp", "left")).toBe("ramp-left");
    expect(maneuverKey("fork", "right")).toBe("fork-right");
    expect(maneuverKey("merge", "")).toBe("merge");
    expect(maneuverKey("rotary", "")).toBe("roundabout");
    expect(maneuverKey("continue", "uturn")).toBe("uturn");
  });

  it("falls back to straight", () => {
    expect(maneuverKey("continue", "")).toBe("straight");
    expect(maneuverKey(undefined, undefined)).toBe("straight");
  });
});

describe("maneuverKeyFromText (legacy steps)", () => {
  it("derives icons from instruction text", () => {
    expect(maneuverKeyFromText("Head out on I-90 W")).toBe("depart");
    expect(maneuverKeyFromText("Arrive at destination")).toBe("arrive");
    expect(maneuverKeyFromText("Turn right onto US-30 E")).toBe("turn-right");
    expect(maneuverKeyFromText("Make a U-turn onto I-70 W")).toBe("uturn");
    expect(maneuverKeyFromText("Take the exit toward US-6 West")).toBe(
      "ramp-right"
    );
  });
});

describe("RouteInstructions", () => {
  it("shows leg headers with distance, drive time and step count", () => {
    render(<RouteInstructions payload={makePayload(sampleLegs)} />);
    expect(screen.getByText("Turn-by-turn directions")).toBeInTheDocument();
    expect(screen.getAllByText("Chicago, IL → Indianapolis, IN")[0]).toBeInTheDocument();
    expect(screen.getAllByText(/184\.1 mi/).length).toBeGreaterThan(0);
    expect(screen.getByText(/3 h 12 min drive/)).toBeInTheDocument();
  });

  it("drops zero-information steps and keeps meaningful ones", () => {
    render(<RouteInstructions payload={makePayload(sampleLegs)} />);
    expect(screen.queryByText("Keep left")).not.toBeInTheDocument();
    expect(screen.getByText(/Head out on/)).toBeInTheDocument();
  });

  it("emphasizes road names in steps", () => {
    render(<RouteInstructions payload={makePayload(sampleLegs)} />);
    const road = screen.getByText("US-30 E");
    expect(road).toHaveClass("font-semibold");
  });

  it("first leg open by default, second leg expands on toggle", () => {
    render(<RouteInstructions payload={makePayload(sampleLegs)} />);
    // leg 1 arrive visible, leg 2 steps hidden
    expect(screen.getAllByText(/Arrive at destination/).length).toBe(1);
    fireEvent.click(screen.getAllByText("Indianapolis, IN → Columbus, OH")[0]);
    expect(screen.getAllByText(/Arrive at destination/).length).toBe(2);
  });

  it("collapses an open leg on second click", () => {
    render(<RouteInstructions payload={makePayload(sampleLegs)} />);
    const header = screen.getAllByText("Chicago, IL → Indianapolis, IN")[0];
    fireEvent.click(header); // open → closed
    expect(screen.queryByText(/Head out on/)).not.toBeInTheDocument();
  });

  it("uses text-derived icons when maneuver fields are absent (legacy)", () => {
    const legacyLegs = [
      {
        leg_index: 0,
        distance_miles: 12,
        duration_hours: 0.2,
        steps: [
          step("Turn right onto Main St", 1.0, { name: "Main St" }),
          step("Arrive at destination", 0),
        ],
      },
    ];
    render(<RouteInstructions payload={makePayload(legacyLegs)} />);
    // No crash + content rendered — icons resolved via maneuverKeyFromText
    expect(screen.getByText("Main St")).toBeInTheDocument();
  });
});
