"""
Stop location enrichment.

The HOS engine places fuel/rest stops at exact route positions. This module
labels those positions: it reverse-geocodes the nearest city when possible
and never invents business names — when no real place can be resolved the
stop is labelled "Planned fuel stop" / "Planned rest stop" as required by
the assessment (section 14 / 42).
"""

from __future__ import annotations

from .geocoder import Geocoder


def label_stop(
    geocoder: Geocoder,
    lat: float | None,
    lon: float | None,
    kind: str,
) -> str:
    """
    Return a human label for a stop position.

    `kind` is the activity type (FUEL, REST_BREAK, SLEEPER_BERTH,
    RESTART_34H, DRIVING...). Real place names are only used when the
    reverse geocoder actually returns one.
    """
    fallback = {
        "FUEL": "Planned fuel stop",
        "REST_BREAK": "Planned rest stop",
        "SLEEPER_BERTH": "Planned overnight rest stop",
        "RESTART_34H": "Planned 34-hour restart location",
        "DRIVING": "En route",
    }.get(kind, "Planned stop")

    if lat is None or lon is None:
        return fallback

    city_label = geocoder.reverse(lat, lon)
    if city_label:
        return city_label
    return fallback
