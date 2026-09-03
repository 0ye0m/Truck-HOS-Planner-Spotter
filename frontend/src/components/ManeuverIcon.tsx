/**
 * Navigation maneuver icons — the visual language of commercial GPS units.
 *
 * Icons are selected from the OSRM maneuver type + modifier pair; when a
 * legacy trip was stored without those fields the icon is derived from the
 * instruction text so old plans render identically to new ones.
 */
import { cloneElement } from "react";
import type { ReactElement, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function make(children: ReactElement) {
  return function Icon({ size = 16, strokeWidth = 2, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {children}
      </svg>
    );
  };
}

/* ------------------------------------------------------------------ */
/* Maneuver glyph set (24×24, stroke — matches the Lucide icon system) */
/* ------------------------------------------------------------------ */

export const DepartIcon = make(
  <>
    <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 16V5" />
    <path d="m7 10 5-5 5 5" />
  </>
);

export const ArriveIcon = make(
  <>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" x2="4" y1="22" y2="15" />
  </>
);

export const StraightIcon = make(
  <>
    <path d="M12 20V4" />
    <path d="m6 10 6-6 6 6" />
  </>
);

export const TurnRightIcon = make(
  <>
    <path d="M8 20v-8a4 4 0 0 1 4-4h6" />
    <path d="m14 4 4 4-4 4" />
  </>
);

export const TurnLeftIcon = make(
  <>
    <path d="M16 20v-8a4 4 0 0 0-4-4H6" />
    <path d="m10 4-4 4 4 4" />
  </>
);

export const SlightRightIcon = make(
  <>
    <path d="M7 20 16 11" />
    <path d="M16 16v-5h-5" />
  </>
);

export const SlightLeftIcon = make(
  <>
    <path d="m17 20-9-9" />
    <path d="M8 16v-5h5" />
  </>
);

export const SharpRightIcon = make(
  <>
    <path d="M8 21v-9a4 4 0 0 1 6.9-2.8L17 11" />
    <path d="m17 16v-5h-5" />
  </>
);

export const SharpLeftIcon = make(
  <>
    <path d="M16 21v-9a4 4 0 0 0-6.9-2.8L7 11" />
    <path d="m7 16v-5h5" />
  </>
);

export const UturnIcon = make(
  <>
    <path d="M6 20V9a4.5 4.5 0 0 1 9 0v7" />
    <path d="m12 13 3 3 3-3" />
  </>
);

export const MergeIcon = make(
  <>
    <path d="M13 21V4" />
    <path d="m8 9 5-5 5 5" />
    <path d="M5 21c0-4 2.5-6 5-7.5" />
  </>
);

export const ForkRightIcon = make(
  <>
    <path d="M11 21v-5" />
    <path d="m11 16-5-6" />
    <path d="m11 16 4-6h4" />
    <path d="m16 7 3 3-3 3" />
  </>
);

export const ForkLeftIcon = make(
  <>
    <path d="M13 21v-5" />
    <path d="m13 16 5-6" />
    <path d="m13 16-4-6H5" />
    <path d="m8 7-3 3 3 3" />
  </>
);

export const RoundaboutIcon = make(
  <>
    <path d="M12 21v-4" />
    <circle cx="12" cy="13" r="4" />
    <path d="M16 13h5" />
    <path d="m18 10 3 3-3 3" />
  </>
);

export const RampRightIcon = make(
  <>
    <path d="M7 21v-7a5 5 0 0 1 5-5h5" />
    <path d="m13 5 4 4-4 4" />
  </>
);

export const RampLeftIcon = make(
  <>
    <path d="M17 21v-7a5 5 0 0 0-5-5H7" />
    <path d="m11 5-4 4 4 4" />
  </>
);

/* ------------------------------------------------------------------ */
/* Maneuver key resolution                                             */
/* ------------------------------------------------------------------ */

/** Canonical maneuver key from OSRM type + modifier. */
export function maneuverKey(
  maneuver?: string,
  modifier?: string
): string {
  const type = (maneuver ?? "").toLowerCase();
  const mod = (modifier ?? "").toLowerCase();

  if (type === "depart") return "depart";
  if (type === "arrive") return "arrive";
  if (type === "roundabout" || type === "rotary") return "roundabout";
  if (type === "merge") return mod.includes("left") ? "ramp-left" : "merge";
  if (type === "on ramp") return mod.includes("left") ? "ramp-left" : "ramp-right";
  if (type === "off ramp") return mod.includes("left") ? "ramp-left" : "ramp-right";
  if (type === "fork") {
    if (mod.includes("left")) return "fork-left";
    if (mod.includes("right")) return "fork-right";
    return "straight";
  }
  if (type === "turn" || type === "end of road") {
    if (mod.includes("uturn")) return "uturn";
    if (mod.includes("slight")) return mod.includes("left") ? "slight-left" : "slight-right";
    if (mod.includes("sharp")) return mod.includes("left") ? "sharp-left" : "sharp-right";
    if (mod.includes("left")) return "turn-left";
    if (mod.includes("right")) return "turn-right";
    return "straight";
  }
  if (type === "continue" && mod.includes("uturn")) return "uturn";
  return "straight";
}

/** Best-effort icon key from the instruction text (legacy stored trips). */
export function maneuverKeyFromText(instruction: string): string {
  const t = instruction.toLowerCase();
  if (/^head out|^start/.test(t)) return "depart";
  if (/^arrive/.test(t)) return "arrive";
  if (/u-turn/.test(t)) return "uturn";
  if (/roundabout/.test(t)) return "roundabout";
  if (/merge/.test(t)) return "merge";
  if (/take the exit/.test(t)) return "ramp-right";
  if (/take the ramp/.test(t)) return "ramp-right";
  if (/sharp left/.test(t)) return "sharp-left";
  if (/sharp right/.test(t)) return "sharp-right";
  if (/slight left|bear left/.test(t)) return "slight-left";
  if (/slight right|bear right/.test(t)) return "slight-right";
  if (/keep left|fork.*left/.test(t)) return "fork-left";
  if (/keep right|fork.*right/.test(t)) return "fork-right";
  if (/turn left/.test(t)) return "turn-left";
  if (/turn right/.test(t)) return "turn-right";
  if (/^(keep|continue)/.test(t)) return "straight";
  return "straight";
}

const GLYPHS: Record<string, React.JSX.Element> = {
  depart: <DepartIcon />,
  arrive: <ArriveIcon />,
  straight: <StraightIcon />,
  "turn-left": <TurnLeftIcon />,
  "turn-right": <TurnRightIcon />,
  "slight-left": <SlightLeftIcon />,
  "slight-right": <SlightRightIcon />,
  "sharp-left": <SharpLeftIcon />,
  "sharp-right": <SharpRightIcon />,
  uturn: <UturnIcon />,
  merge: <MergeIcon />,
  "fork-left": <ForkLeftIcon />,
  "fork-right": <ForkRightIcon />,
  roundabout: <RoundaboutIcon />,
  "ramp-left": <RampLeftIcon />,
  "ramp-right": <RampRightIcon />,
};

/**
 * The maneuver icon for a route step. Prefers the structured
 * maneuver/modifier fields; falls back to parsing the instruction text.
 */
export default function ManeuverIcon({
  maneuver,
  modifier,
  instruction,
  size = 16,
  strokeWidth = 2,
  className,
}: {
  maneuver?: string;
  modifier?: string;
  instruction: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const key =
    maneuver
      ? maneuverKey(maneuver, modifier)
      : maneuverKeyFromText(instruction);
  const glyph = GLYPHS[key] ?? GLYPHS.straight;
  return (
    <span className={`inline-flex ${className ?? ""}`} aria-hidden="true">
      {cloneElement(glyph, { size, strokeWidth })}
    </span>
  );
}
