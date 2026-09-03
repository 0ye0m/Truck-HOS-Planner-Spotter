"""
Routing service — OSRM (Open Source Routing Machine) demo server.

Provides total distance (miles), duration (hours), GeoJSON geometry, legs
and turn-by-turn instructions. When the routing service is unavailable a
RoutingError is raised so the API can return a friendly message — route
data is NEVER fabricated.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import requests

from config.settings import ROUTING_API_URL, ROUTING_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

METERS_PER_MILE = 1609.344


@dataclass
class RouteStep:
    instruction: str
    name: str
    distance_miles: float
    maneuver: str
    modifier: str = ""
    exit_number: int | None = None


@dataclass
class RouteLegData:
    distance_miles: float
    duration_hours: float
    steps: list[RouteStep] = field(default_factory=list)


@dataclass
class RouteResult:
    distance_miles: float
    duration_hours: float
    geometry: list[tuple[float, float]]  # [(lat, lon), ...]
    legs: list[RouteLegData]


class RoutingError(Exception):
    """Raised when a route cannot be calculated (user-facing message)."""

    def __init__(self, message: str, kind: str = "routing-failed"):
        super().__init__(message)
        self.message = message
        self.kind = kind


# Human phrasing per modifier — mirrors commercial navigation wording.
_TURN_PHRASE = {
    "left": "Turn left",
    "right": "Turn right",
    "slight left": "Bear slight left",
    "slight right": "Bear slight right",
    "sharp left": "Take a sharp left",
    "sharp right": "Take a sharp right",
    "straight": "Continue straight",
    "uturn": "Make a U-turn",
}


def _instruction_from_step(step: dict) -> str:
    """Industry-grade spoken instruction from an OSRM step.

    Handles turn modifiers, roundabout exits, ramps, forks and arrival side
    so instructions read like a commercial truck navigation unit instead of
    raw maneuver codes.
    """
    maneuver = step.get("maneuver", {}) or {}
    maneuver_type = maneuver.get("type", "")
    modifier = maneuver.get("modifier", "")
    name = (step.get("name", "") or "").strip()
    destinations = (step.get("destinations", "") or "").strip()
    rotary_name = (step.get("rotary_name", "") or "").strip()
    exit_num = maneuver.get("exit")

    ordinal = ""
    if isinstance(exit_num, int) and exit_num > 0:
        ordinal = _ordinal(exit_num)

    if maneuver_type == "depart":
        return f"Head out on {name}" if name else "Start your route"
    if maneuver_type == "arrive":
        side_phrase = {
            "left": " — destination is on your left",
            "right": " — destination is on your right",
        }.get(modifier, "")
        return f"Arrive at destination{side_phrase}"
    if maneuver_type in ("roundabout", "rotary"):
        exit_part = f" and take the {ordinal} exit" if ordinal else ""
        onto = f" onto {name}" if name else ""
        return f"At the roundabout{exit_part}{onto}"
    if maneuver_type == "merge":
        return f"Merge onto {name}" if name else "Merge"
    if maneuver_type == "on ramp":
        target = destinations or name
        return f"Take the ramp onto {target}" if target else "Take the ramp"
    if maneuver_type == "off ramp":
        target = destinations or name
        return f"Take the exit toward {target}" if target else "Take the exit"
    if maneuver_type == "fork":
        base = _TURN_PHRASE.get(modifier, f"Keep {modifier or 'straight'}")
        return f"{base} to stay on {name}" if name else base
    if maneuver_type == "end of road":
        base = _TURN_PHRASE.get(modifier, f"Turn {modifier or 'right'}")
        return f"{base} onto {name}" if name else base
    if maneuver_type == "new name":
        return f"Continue onto {name}" if name else "Continue"
    if maneuver_type == "turn":
        base = _TURN_PHRASE.get(modifier, f"Turn {modifier or 'right'}")
        return f"{base} onto {name}" if name else base
    if maneuver_type == "continue" and modifier == "uturn":
        return f"Make a U-turn onto {name}" if name else "Make a U-turn"
    return f"Continue on {name}" if name else "Continue"


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


class RoutingService:
    """Thin OSRM client (route service, driving profile)."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or ROUTING_API_URL).rstrip("/")

    def route(self, coordinates: list[tuple[float, float]]) -> RouteResult:
        """
        coordinates: [(lat, lon), ...] in travel order.
        Returns a RouteResult; raises RoutingError on failure.
        """
        if len(coordinates) < 2:
            raise RoutingError("At least two coordinates are required.")
        lonlat = ";".join(f"{lon},{lat}" for lat, lon in coordinates)
        url = f"{self.base_url}/route/v1/driving/{lonlat}"
        params = {"overview": "full", "geometries": "geojson", "steps": "true"}
        try:
            response = requests.get(
                url, params=params, timeout=ROUTING_TIMEOUT_SECONDS
            )
            response.raise_for_status()
            data = response.json()
        except requests.Timeout:
            raise RoutingError(
                "The routing service timed out. Please try again in a moment.",
                "timeout",
            )
        except Exception as exc:
            logger.warning("Routing request failed: %s", exc)
            raise RoutingError(
                "We couldn't calculate a route right now. Please try again.",
                "service-unavailable",
            )

        code = data.get("code", "")
        if code != "Ok" or not data.get("routes"):
            raise RoutingError(
                "We couldn't calculate a drivable route between these "
                "locations. Please check them and try again.",
                "no-route",
            )

        route = data["routes"][0]
        distance_miles = route["distance"] / METERS_PER_MILE
        duration_hours = route["duration"] / 3600.0
        geometry = [
            (float(pt[1]), float(pt[0])) for pt in route.get("geometry", {}).get("coordinates", [])
        ]
        legs: list[RouteLegData] = []
        for leg in route.get("legs", []):
            steps = [
                RouteStep(
                    instruction=_instruction_from_step(step),
                    name=(step.get("name") or ""),
                    distance_miles=(step.get("distance", 0.0) / METERS_PER_MILE),
                    maneuver=((step.get("maneuver") or {}).get("type") or ""),
                    modifier=((step.get("maneuver") or {}).get("modifier") or ""),
                    exit_number=(step.get("maneuver") or {}).get("exit"),
                )
                for step in leg.get("steps", [])
            ]
            legs.append(
                RouteLegData(
                    distance_miles=leg["distance"] / METERS_PER_MILE,
                    duration_hours=leg["duration"] / 3600.0,
                    steps=steps,
                )
            )
        return RouteResult(
            distance_miles=distance_miles,
            duration_hours=duration_hours,
            geometry=geometry,
            legs=legs,
        )
