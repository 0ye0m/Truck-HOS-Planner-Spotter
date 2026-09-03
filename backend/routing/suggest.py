"""
Place suggestion service — powers the frontend's real-time location picker.

Given a partial query ("colu", "springfield, m"), returns a ranked list of
US places (city / town / village / hamlet / POI) from Nominatim's /search
endpoint. This is what makes the trip-planner location fields feel live:
results arrive while the user types (the frontend debounces ~300 ms and
aborts stale requests).

Usage-policy compliance mirrors routing.geocoder:
* descriptive User-Agent on every request,
* all upstream calls funnel through the same process-wide throttle,
* successful queries are cached in memory (per process) so repeated
  keystroke prefixes and demo trips never hit the network twice.

Failure policy: an autocomplete dropdown must never surface an error
banner. Any upstream problem (timeout, 5xx, bad payload) degrades to an
empty result list — the UI falls back to instant local matches and free
text, and the trip itself is still geocoded (and validated) server-side.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import requests

from config.settings import (
    GEOCODING_API_URL,
    GEOCODING_MIN_INTERVAL_SECONDS,
    GEOCODING_TIMEOUT_SECONDS,
    GEOCODING_USER_AGENT,
)
from routing.us_states import US_STATE_ABBREVIATIONS

logger = logging.getLogger(__name__)

_SUGGEST_LIMIT = 6
_MEMORY_CACHE: dict[str, list[dict]] = {}
_CACHE_LOCK = threading.Lock()
_THROTTLE_LOCK = threading.Lock()
_LAST_REQUEST_AT = 0.0

# Nominatim address keys that carry the settlement name, most specific first.
_CITY_KEYS = ("city", "town", "village", "hamlet", "municipality", "borough")


class SuggestionError(Exception):
    """Raised internally when the suggestion service cannot be reached."""


def _throttle() -> None:
    global _LAST_REQUEST_AT
    with _THROTTLE_LOCK:
        elapsed = time.monotonic() - _LAST_REQUEST_AT
        wait = GEOCODING_MIN_INTERVAL_SECONDS - elapsed
        if wait > 0:
            time.sleep(wait)
        _LAST_REQUEST_AT = time.monotonic()


def _state_code(address: dict) -> str:
    """Best-effort USPS state code from a Nominatim address blob."""
    iso = address.get("ISO3166-2-lvl4") or ""
    if "-" in iso:
        candidate = iso.split("-", 1)[1].upper()
        if len(candidate) == 2:
            return candidate
    state_name = (address.get("state") or "").strip().lower()
    return US_STATE_ABBREVIATIONS.get(state_name, "")


def _short_display(display_name: str) -> str:
    """Trim a Nominatim display_name to at most 4 comma-separated parts."""
    parts = [p.strip() for p in display_name.split(",") if p.strip()]
    if parts and parts[-1].lower() in {"united states", "usa", "us"}:
        parts = parts[:-1]
    return ", ".join(parts[:4])


def _label_without_state(parts: list[str], state_code: str) -> str:
    """Join the first parts of a display_name, dropping a trailing state
    name (the USPS code is appended by the caller instead)."""
    parts = list(parts)
    if parts and US_STATE_ABBREVIATIONS.get(parts[-1].strip().lower()) == state_code:
        parts = parts[:-1]
    return ", ".join(parts[:2] + [state_code])


def _format_item(item: dict) -> Optional[dict]:
    address = item.get("address") or {}
    state_code = _state_code(address)
    city = next((address[k] for k in _CITY_KEYS if address.get(k)), "")

    if city and state_code:
        label = f"{city}, {state_code}"
    elif state_code:
        # County / postcode / road-level hits: keep a readable short label
        # built from the leading display_name parts + the USPS state code.
        parts = [p.strip() for p in (item.get("display_name") or "").split(",") if p.strip()]
        if parts and parts[-1].lower() in {"united states", "usa", "us"}:
            parts = parts[:-1]
        label = _label_without_state(parts, state_code)
    else:
        label = _short_display(item.get("display_name", ""))

    if not label:
        return None

    name_parts = address.get("name") or ""
    subtitle = _short_display(item.get("display_name", ""))
    return {
        "label": label,
        "display_name": subtitle or name_parts,
        "lat": float(item["lat"]),
        "lon": float(item["lon"]),
        "kind": item.get("type") or "place",
    }


def search_upstream(query: str) -> list[dict]:
    """Call Nominatim /search (US-biased) and return formatted suggestions."""
    _throttle()
    response = requests.get(
        f"{GEOCODING_API_URL}/search",
        params={
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": _SUGGEST_LIMIT,
            "countrycodes": "us",
            "accept-language": "en",
        },
        headers={"User-Agent": GEOCODING_USER_AGENT},
        timeout=GEOCODING_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise SuggestionError(f"Nominatim returned {response.status_code}")
    payload = response.json()
    if not isinstance(payload, list):
        raise SuggestionError("Unexpected Nominatim payload")

    formatted: list[dict] = []
    seen: set[str] = set()
    for item in payload:
        entry = _format_item(item)
        if entry is None or entry["label"] in seen:
            continue
        seen.add(entry["label"])
        formatted.append(entry)
    return formatted


def suggest_places(query: str) -> list[dict]:
    """Public API: ranked US place suggestions for a partial query."""
    normalized = " ".join((query or "").strip().split())
    if len(normalized) < 2:
        return []

    with _CACHE_LOCK:
        if normalized in _MEMORY_CACHE:
            return _MEMORY_CACHE[normalized]

    try:
        results = search_upstream(normalized)
    except (requests.RequestException, SuggestionError, ValueError, KeyError) as exc:
        logger.warning("Suggestion lookup failed for %r: %s", normalized, exc)
        return []

    with _CACHE_LOCK:
        _MEMORY_CACHE[normalized] = results
        # Keep the autocomplete cache bounded.
        if len(_MEMORY_CACHE) > 2048:
            _MEMORY_CACHE.pop(next(iter(_MEMORY_CACHE)))
    return results
