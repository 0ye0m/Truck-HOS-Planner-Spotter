"""
API + rendering tests. Geocoder and router are mocked so the suite is fast
and hermetic; engine behaviour is covered in test_hos_engine.py.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.urls import reverse

from trips.models import DailyLog, ScheduledActivity, Trip

PLAN_URL = "/api/trips/plan/"
VALIDATE_URL = "/api/trips/validate/"


class FakeGeocode:
    def __init__(self, city, state, lat, lon):
        self.query = city
        self.lat = lat
        self.lon = lon
        self.display_name = f"{city}, {state}, USA"
        self.city = city
        self.state = state


FAKE_GEOCODES = {
    "chicago, il": FakeGeocode("Chicago", "Illinois", 41.8781, -87.6298),
    "indianapolis, in": FakeGeocode("Indianapolis", "Indiana", 39.7684, -86.1581),
    "columbus, oh": FakeGeocode("Columbus", "Ohio", 39.9612, -82.9988),
    "los angeles, ca": FakeGeocode("Los Angeles", "California", 34.0522, -118.2437),
    "denver, co": FakeGeocode("Denver", "Colorado", 39.7392, -104.9903),
    "nowhere": None,
}


def fake_geocode(address):
    from routing.geocoder import GeocodingError

    key = " ".join(address.strip().lower().split())
    result = FAKE_GEOCODES.get(key)
    if result is None and key != "nowhere":
        # unknown but plausible address: invent a stable point (tests only)
        result = FakeGeocode(address.split(",")[0].title(), "Kansas", 38.5, -98.0)
    if result is None:
        raise GeocodingError(
            f"Unable to find '{address}'. Please choose a more specific "
            "address (city and state).",
            "address-not-found",
        )
    return result


def fake_route(coords):
    """Deterministic fake RouteResult based on great-circle-ish distance."""

    from routing.router import RouteLegData, RouteResult, RouteStep

    (lat1, lon1), (lat2, lon2) = coords
    import math

    dx = (lon2 - lon1) * 54.6  # approx miles per degree longitude at ~39N
    dy = (lat2 - lat1) * 69.0
    miles = max(1.0, math.hypot(dx, dy) * 1.2)  # road factor
    hours = miles / 55.0
    steps = [
        RouteStep(instruction=f"Start on {lat1}", name="Start", distance_miles=miles / 2, maneuver="depart"),
        RouteStep(instruction="Arrive at destination", name="End", distance_miles=0, maneuver="arrive"),
    ]
    geometry = [
        (lat1 + (lat2 - lat1) * i / 20, lon1 + (lon2 - lon1) * i / 20)
        for i in range(21)
    ]
    return RouteResult(
        distance_miles=miles,
        duration_hours=hours,
        geometry=geometry,
        legs=[RouteLegData(distance_miles=miles, duration_hours=hours, steps=steps)],
    )


@pytest.fixture
def mock_services():
    with patch("routing.geocoder.Geocoder.geocode", side_effect=fake_geocode):
        with patch("routing.geocoder.Geocoder.reverse", return_value="Somewhere, KS"):
            with patch("routing.router.RoutingService.route", side_effect=fake_route):
                yield


DEMO = {
    "current_location": "Chicago, IL",
    "pickup_location": "Indianapolis, IN",
    "dropoff_location": "Columbus, OH",
    "current_cycle_used": 32,
}


@pytest.mark.django_db
def test_plan_trip_full_pipeline(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.post(PLAN_URL, DEMO, format="json")
    assert response.status_code == 201, response.data
    payload = response.data

    # top-level shape per the assessment contract
    for key in ("trip", "route", "schedule", "hos_summary", "logs", "markers"):
        assert key in payload

    assert payload["route"]["distance_miles"] > 0
    assert payload["route"]["geometry"]
    assert payload["schedule"]["activities"]
    assert payload["logs"], "demo trip should produce at least one daily log"

    log = payload["logs"][0]
    assert log["total_hours"] == 24.0
    assert log["miles"] > 0
    assert log["image_url"].startswith("/media/")

    # exactly one pickup and one dropoff, 60 minutes each
    pickups = [a for a in payload["schedule"]["activities"] if a["type"] == "PICKUP"]
    dropoffs = [a for a in payload["schedule"]["activities"] if a["type"] == "DROPOFF"]
    assert len(pickups) == 1 and pickups[0]["duration_minutes"] == 60
    assert len(dropoffs) == 1 and dropoffs[0]["duration_minutes"] == 60

    # markers derive from the same canonical activities
    marker_types = {m["type"] for m in payload["markers"]}
    assert "PICKUP" in marker_types and "DROPOFF" in marker_types

    # DB persistence
    assert Trip.objects.count() == 1
    assert ScheduledActivity.objects.count() == len(payload["schedule"]["activities"])
    assert DailyLog.objects.count() == len(payload["logs"])


@pytest.mark.django_db
def test_plan_multi_day_trip_generates_multiple_logs(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.post(
        PLAN_URL,
        {
            "current_location": "Los Angeles, CA",
            "pickup_location": "Denver, CO",
            "dropoff_location": "Chicago, IL",
            "current_cycle_used": 0,
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    logs = response.data["logs"]
    assert len(logs) >= 2
    for log in logs:
        assert log["total_hours"] == 24.0
    # fuel stops present for a >1,000 mile trip
    assert response.data["hos_summary"]["total_driving_hours"] > 0


@pytest.mark.django_db
def test_plan_invalid_address_returns_friendly_error(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.post(
        PLAN_URL,
        {
            "current_location": "nowhere",
            "pickup_location": "Indianapolis, IN",
            "dropoff_location": "Columbus, OH",
            "current_cycle_used": 32,
        },
        format="json",
    )
    assert response.status_code == 400
    assert "error" in response.data
    assert "specific" in response.data["error"].lower() or "unable" in response.data["error"].lower()


@pytest.mark.django_db
def test_plan_rejects_cycle_over_70(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.post(
        PLAN_URL, {**DEMO, "current_cycle_used": 71}, format="json"
    )
    assert response.status_code == 400
    assert "70" in str(response.data)


@pytest.mark.django_db
def test_plan_rejects_empty_locations():
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.post(
        PLAN_URL,
        {**DEMO, "current_location": "   "},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_validate_endpoint_dry_run(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.post(VALIDATE_URL, DEMO, format="json")
    assert response.status_code == 200
    assert response.data["schedulable"] is True
    assert response.data["violations"] == []
    # nothing persisted
    assert Trip.objects.count() == 0


@pytest.mark.django_db
def test_trip_detail_and_logs_endpoints(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    created = client.post(PLAN_URL, DEMO, format="json")
    trip_id = created.data["trip"]["id"]

    detail = client.get(f"/api/trips/{trip_id}/")
    assert detail.status_code == 200
    assert detail.data["route"]["distance_miles"] > 0
    assert detail.data["logs"]

    logs = client.get(f"/api/trips/{trip_id}/logs/")
    assert logs.status_code == 200
    assert logs.data["count"] == len(logs.data["logs"])

    day1 = client.get(f"/api/trips/{trip_id}/logs/1/")
    assert day1.status_code == 200
    assert day1.data["total_hours"] == 24.0

    image = client.get(f"/api/trips/{trip_id}/logs/1/image/")
    assert image.status_code == 200
    assert image["Content-Type"] == "image/png"
    assert len(image.getvalue()) > 10000  # a real rendered PNG

    missing = client.get(f"/api/trips/{trip_id}/logs/99/")
    assert missing.status_code == 404


@pytest.mark.django_db
def test_logs_pdf_download(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    created = client.post(PLAN_URL, DEMO, format="json")
    trip_id = created.data["trip"]["id"]

    pdf = client.get(f"/api/trips/{trip_id}/logs/pdf/")
    assert pdf.status_code == 200
    assert pdf["Content-Type"] == "application/pdf"
    assert pdf["Content-Disposition"].startswith("attachment")
    assert pdf.getvalue()[:5] == b"%PDF-"


@pytest.mark.django_db
def test_health_endpoint():
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.get("/api/health/")
    assert response.status_code == 200
    assert response.data["status"] == "ok"
    assert response.data["hos_rules"]["cycle"] == "70 hours / 8 days"


@pytest.mark.django_db
def test_route_endpoint(mock_services):
    from rest_framework.test import APIClient

    client = APIClient()
    created = client.post(PLAN_URL, DEMO, format="json")
    trip_id = created.data["trip"]["id"]
    route = client.get(f"/api/trips/{trip_id}/route/")
    assert route.status_code == 200
    assert route.data["provider"] == "OSRM"
    assert route.data["geometry"]
