"""
Tests for the live place-suggestion endpoint (GET /api/geocode/suggest/).

Nominatim is mocked so the suite is fast and hermetic. Covers: happy path
shaping (label / display_name / lat / lon / kind), dedup, US-state code
derivation, free-text fallback labels, short-query rejection (400), empty
result sets, upstream failure degradation (200 + empty list — autocomplete
must never surface an error banner), and caching (a repeated query must
not hit the network twice).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.test import Client

pytestmark = pytest.mark.django_db

SUGGEST_URL = "/api/geocode/suggest/"

NOMINATIM_PAYLOAD = [
    {
        "place_id": 1,
        "lat": "39.9612",
        "lon": "-82.9988",
        "type": "city",
        "display_name": "Columbus, Franklin County, Ohio, United States",
        "address": {
            "city": "Columbus",
            "state": "Ohio",
            "ISO3166-2-lvl4": "US-OH",
            "country": "United States",
        },
    },
    {
        "place_id": 2,
        "lat": "39.8380",
        "lon": "-88.9301",
        "type": "city",
        "display_name": "Decatur, Macon County, Illinois, United States",
        "address": {
            "city": "Decatur",
            "state": "Illinois",
            "ISO3166-2-lvl4": "US-IL",
            "country": "United States",
        },
    },
    # A road-level hit without a settlement name — label falls back to a
    # trimmed display_name with the state code appended.
    {
        "place_id": 3,
        "lat": "40.0",
        "lon": "-83.0",
        "type": "motorway_junction",
        "display_name": "I-71 Exit 121, Worthington, Franklin County, Ohio, United States",
        "address": {"state": "Ohio", "country": "United States"},
    },
]


@pytest.fixture(autouse=True)
def _clear_suggest_cache():
    from routing import suggest

    suggest._MEMORY_CACHE.clear()
    yield
    suggest._MEMORY_CACHE.clear()


def _mock_upstream(payload):
    class FakeResponse:
        status_code = 200

        def json(self):
            return payload

    return patch("routing.suggest.requests.get", return_value=FakeResponse())


def test_suggest_happy_path_shapes_results():
    with _mock_upstream(NOMINATIM_PAYLOAD):
        response = Client().get(SUGGEST_URL, {"q": "colum"})

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "colum"
    results = body["results"]
    assert len(results) == 3
    first = results[0]
    assert first["label"] == "Columbus, OH"
    assert first["lat"] == pytest.approx(39.9612)
    assert first["lon"] == pytest.approx(-82.9988)
    assert first["kind"] == "city"
    assert "Franklin County" in first["display_name"]
    # Road-level hit keeps a readable label carrying the state.
    assert results[2]["label"].endswith(", OH")


def test_suggest_dedupes_identical_labels():
    dupe = dict(NOMINATIM_PAYLOAD[0])
    with _mock_upstream([NOMINATIM_PAYLOAD[0], dupe]):
        response = Client().get(SUGGEST_URL, {"q": "colum"})

    labels = [r["label"] for r in response.json()["results"]]
    assert len(labels) == len(set(labels)) == 1


@pytest.mark.parametrize("query", ["", "c", "a"])
def test_suggest_short_query_is_400(query):
    response = Client().get(SUGGEST_URL, {"q": query})
    assert response.status_code == 400


def test_suggest_missing_param_is_400():
    response = Client().get(SUGGEST_URL)
    assert response.status_code == 400


def test_suggest_empty_result_set():
    with _mock_upstream([]):
        response = Client().get(SUGGEST_URL, {"q": "zzznope"})

    assert response.status_code == 200
    assert response.json()["results"] == []


def test_suggest_upstream_failure_degrades_to_empty_list():
    import requests as requests_lib

    with patch(
        "routing.suggest.requests.get",
        side_effect=requests_lib.ConnectionError("down"),
    ):
        response = Client().get(SUGGEST_URL, {"q": "colum"})

    # Autocomplete degrades gracefully — never an error banner.
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_suggest_caches_repeated_queries():
    with _mock_upstream(NOMINATIM_PAYLOAD) as mock_get:
        Client().get(SUGGEST_URL, {"q": "colum"})
        Client().get(SUGGEST_URL, {"q": "colum"})

    assert mock_get.call_count == 1
