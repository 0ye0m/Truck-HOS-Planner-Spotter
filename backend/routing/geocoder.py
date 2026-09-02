"""
Geocoding service — Nominatim (OpenStreetMap) with aggressive caching.

Public API usage policy compliance:
* a descriptive User-Agent is always sent,
* requests are throttled to at most one per
  GEOCODING_MIN_INTERVAL_SECONDS,
* every successful lookup is cached (DB + memory) and never repeated.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Optional

import requests

from config.settings import (
    GEOCODING_API_URL,
    GEOCODING_MIN_INTERVAL_SECONDS,
    GEOCODING_TIMEOUT_SECONDS,
    GEOCODING_USER_AGENT,
)

logger = logging.getLogger(__name__)

_THROTTLE_LOCK = threading.Lock()
_LAST_REQUEST_AT = 0.0


@dataclass
class GeocodeResult:
    query: str
    lat: float
    lon: float
    display_name: str
    city: str
    state: str


class GeocodingError(Exception):
    """Raised when an address cannot be geocoded (user-facing message)."""

    def __init__(self, message: str, kind: str = "geocoding-failed"):
        super().__init__(message)
        self.message = message
        self.kind = kind


class Geocoder:
    """Nominatim client with in-memory + database caching."""

    def __init__(self) -> None:
        self._memory: dict[str, Optional[GeocodeResult]] = {}

    # ------------------------------------------------------------------

    def _throttle(self) -> None:
        global _LAST_REQUEST_AT
        with _THROTTLE_LOCK:
            elapsed = time.monotonic() - _LAST_REQUEST_AT
            wait = GEOCODING_MIN_INTERVAL_SECONDS - elapsed
            if wait > 0:
                time.sleep(wait)
            _LAST_REQUEST_AT = time.monotonic()

    def _cache_get(self, query: str) -> Optional[GeocodeResult]:
        if query in self._memory:
            return self._memory[query]
        try:
            from trips.models import GeocodeCache

            row = GeocodeCache.objects.filter(query=query).first()
            if row is not None:
                result = (
                    GeocodeResult(
                        query=query,
                        lat=row.lat,
                        lon=row.lon,
                        display_name=row.display_name,
                        city=row.city,
                        state=row.state,
                    )
                    if row.found
                    else None
                )
                self._memory[query] = result
                return result
        except Exception:  # DB not ready (e.g. pure engine tests)
            pass
        return None

    def _cache_put(self, result: Optional[GeocodeResult]) -> None:
        self._memory[result.query if result else ""] = result
        try:
            from trips.models import GeocodeCache

            GeocodeCache.objects.update_or_create(
                query=result.query if result else "",
                defaults={
                    "lat": result.lat if result else None,
                    "lon": result.lon if result else None,
                    "display_name": result.display_name if result else "",
                    "city": result.city if result else "",
                    "state": result.state if result else "",
                    "found": result is not None,
                },
            )
        except Exception:
            pass

    # ------------------------------------------------------------------

    def geocode(self, address: str) -> GeocodeResult:
        """Resolve a free-text address to coordinates. Raises GeocodingError."""
        query = " ".join(address.strip().split())
        if not query:
            raise GeocodingError("Please enter a location.", "invalid-address")

        cached = self._cache_get(query)
        if cached is not None:
            return cached
        if query in self._memory and self._memory[query] is None:
            raise GeocodingError(
                f"Unable to find '{address}'. Please choose a more specific "
                "address (city and state).",
                "address-not-found",
            )

        self._throttle()
        try:
            response = requests.get(
                f"{GEOCODING_API_URL}/search",
                params={"q": query, "format": "json", "limit": 1, "addressdetails": 1},
                headers={"User-Agent": GEOCODING_USER_AGENT},
                timeout=GEOCODING_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            data = response.json()
        except requests.Timeout:
            raise GeocodingError(
                "The location lookup timed out. Please try again.", "timeout"
            )
        except Exception as exc:
            logger.warning("Geocoding request failed: %s", exc)
            raise GeocodingError(
                "We couldn't look up that location right now. Please try again.",
                "service-unavailable",
            )

        if not data:
            self._cache_put(None)
            self._memory[query] = None
            raise GeocodingError(
                f"Unable to find '{address}'. Please choose a more specific "
                "address (city and state).",
                "address-not-found",
            )

        top = data[0]
        address_details = top.get("address", {}) or {}
        city = (
            address_details.get("city")
            or address_details.get("town")
            or address_details.get("village")
            or address_details.get("county")
            or ""
        )
        state = address_details.get("state") or ""
        result = GeocodeResult(
            query=query,
            lat=float(top["lat"]),
            lon=float(top["lon"]),
            display_name=top.get("display_name", ""),
            city=city,
            state=state,
        )
        self._cache_put(result)
        return result

    def reverse(self, lat: float, lon: float) -> str:
        """
        Best-effort 'City, ST' label for a coordinate (for remarks).
        Returns '' when the lookup fails — the caller falls back to a
        clearly-marked generic label. Results are cached.
        """
        key = f"reverse:{round(lat, 3)},{round(lon, 3)}"
        cached = self._memory.get(key)
        if cached is not None:
            return cached.display_name
        if key in self._memory:
            return ""

        self._throttle()
        try:
            response = requests.get(
                f"{GEOCODING_API_URL}/reverse",
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
                headers={"User-Agent": GEOCODING_USER_AGENT},
                timeout=GEOCODING_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            logger.debug("Reverse geocoding failed: %s", exc)
            self._memory[key] = None
            return ""

        if not data or "address" not in data:
            self._memory[key] = None
            return ""

        address = data["address"]
        city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("county")
            or ""
        )
        state_code = address.get("state") or ""
        from .us_states import state_abbreviation

        label = f"{city}, {state_abbreviation(state_code)}".strip(", ")
        result = GeocodeResult(
            query=key, lat=lat, lon=lon, display_name=label, city=city, state=state_code
        )
        self._memory[key] = result
        return label
