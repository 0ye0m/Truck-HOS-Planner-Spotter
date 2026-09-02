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


def _instruction_from_step(step: dict) -> str:
    maneuver = step.get("maneuver", {}) or {}
    maneuver_type = maneuver.get("type", "")
    modifier = maneuver.get("modifier", "")
    name = step.get("name", "") or ""
    if maneuver_type == "depart":
        return f"Start on {name}" if name else "Start"
    if maneuver_type == "arrive":
        return "Arrive at destination"
    if maneuver_type == "roundabout" or maneuver_type == "rotary":
        return f"Take the roundabout onto {name}" if name else "Take the roundabout"
    if maneuver_type == "merge":
        return f"Merge onto {name}" if name else "Merge"
    if maneuver_type == "on ramp":
        return f"Take the ramp onto {name}" if name else "Take the ramp"
    if maneuver_type == "off ramp":
        return f"Take the exit towards {name}" if name else "Take the exit"
    if maneuver_type == "fork":
        return f"Keep {modifier} onto {name}".strip() if name else f"Keep {modifier}"
    if maneuver_type == "end of road":
        return f"Turn {modifier} onto {name}".strip()
    if maneuver_type == "new name":
        return f"Continue onto {name}" if name else "Continue"
    if maneuver_type in ("turn",):
        return f"Turn {modifier} onto {name}".strip() if name else f"Turn {modifier}"
    return f"Continue on {name}" if name else "Continue"


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
