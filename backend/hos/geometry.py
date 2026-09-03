"""Pure-math route geometry helpers (no network, deterministic)."""

from __future__ import annotations

import math
from typing import Optional

from .constants import EPSILON

EARTH_RADIUS_MILES = 3958.8


def haversine_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in miles between two (lat, lon) points."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


def interpolate_along_geometry(
    geometry: list[tuple[float, float]],
    target_miles: float,
    leg_distance_miles: float,
) -> tuple[float, float]:
    """
    Return the (lat, lon) point located `target_miles` along a leg polyline.

    Falls back to a straight line between endpoints when no geometry is
    available. Never raises: stop positions must always be resolvable.
    """
    if not geometry or leg_distance_miles <= EPSILON:
        return geometry[0] if geometry else (0.0, 0.0)

    target = max(0.0, min(target_miles, leg_distance_miles))
    accumulated = 0.0
    for i in range(1, len(geometry)):
        seg = haversine_miles(geometry[i - 1], geometry[i])
        if accumulated + seg >= target - EPSILON:
            if seg <= EPSILON:
                return geometry[i]
            frac = (target - accumulated) / seg
            lat = geometry[i - 1][0] + frac * (geometry[i][0] - geometry[i - 1][0])
            lon = geometry[i - 1][1] + frac * (geometry[i][1] - geometry[i - 1][1])
            return (lat, lon)
        accumulated += seg
    return geometry[-1]


def point_at_fraction(
    leg_start: tuple[float, float],
    leg_end: tuple[float, float],
    fraction: float,
) -> tuple[float, float]:
    """Linear interpolation between two coordinates (fallback without geometry)."""
    fraction = max(0.0, min(1.0, fraction))
    return (
        leg_start[0] + fraction * (leg_end[0] - leg_start[0]),
        leg_start[1] + fraction * (leg_end[1] - leg_start[1]),
    )


def coord_or_none(point) -> Optional[tuple[float, float]]:
    if point is None or point.lat is None or point.lon is None:
        return None
    return (point.lat, point.lon)
