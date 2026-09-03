"""
Turn-by-turn instruction quality tests.

Covers the industry-grade instruction generator (routing.router) and the
fact that maneuver type + modifier reach the API consumer (needed by the
frontend to draw proper turn arrows).
"""

import pytest

from routing.router import RouteStep, _instruction_from_step, _ordinal


def step(mtype, modifier="", name="", distance=0.0, extra=None):
    maneuver = {"type": mtype}
    if modifier:
        maneuver["modifier"] = modifier
    if extra:
        maneuver.update(extra)
    return {"maneuver": maneuver, "name": name, "distance": distance}


class TestInstructionText:
    def test_depart_with_street(self):
        assert _instruction_from_step(step("depart", name="I-80 W")) == "Head out on I-80 W"

    def test_depart_without_street(self):
        assert _instruction_from_step(step("depart")) == "Start your route"

    def test_turn_left_onto_road(self):
        assert (
            _instruction_from_step(step("turn", "left", "Main St"))
            == "Turn left onto Main St"
        )

    def test_slight_right_phrasing(self):
        assert (
            _instruction_from_step(step("turn", "slight right", "US-30 E"))
            == "Bear slight right onto US-30 E"
        )

    def test_sharp_left_phrasing(self):
        assert (
            _instruction_from_step(step("turn", "sharp left"))
            == "Take a sharp left"
        )

    def test_uturn_via_turn(self):
        assert _instruction_from_step(step("turn", "uturn")) == "Make a U-turn"

    def test_uturn_via_continue(self):
        s = step("continue", "uturn", "I-70 W")
        assert _instruction_from_step(s) == "Make a U-turn onto I-70 W"

    def test_end_of_road(self):
        assert (
            _instruction_from_step(step("end of road", "right", "I-35 N"))
            == "Turn right onto I-35 N"
        )

    def test_merge(self):
        assert (
            _instruction_from_step(step("merge", name="I-80 E"))
            == "Merge onto I-80 E"
        )

    def test_on_ramp_prefers_destinations(self):
        s = step("on ramp", name="Exit 12")
        s["destinations"] = "I-80 East; Lincoln"
        assert _instruction_from_step(s) == "Take the ramp onto I-80 East; Lincoln"

    def test_off_ramp_toward(self):
        s = step("off ramp", name="Exit 21")
        s["destinations"] = "US-6 West"
        assert _instruction_from_step(s) == "Take the exit toward US-6 West"

    def test_roundabout_with_exit_number(self):
        s = step("roundabout", name="WI-16 W", extra={"exit": 2})
        assert _instruction_from_step(s) == "At the roundabout and take the 2nd exit onto WI-16 W"

    def test_fork(self):
        assert (
            _instruction_from_step(step("fork", "left", "I-90 W"))
            == "Turn left to stay on I-90 W"
        )

    def test_new_name(self):
        assert (
            _instruction_from_step(step("new name", name="Lincoln Hwy"))
            == "Continue onto Lincoln Hwy"
        )

    def test_arrive_side_left(self):
        assert (
            _instruction_from_step(step("arrive", "left"))
            == "Arrive at destination — destination is on your left"
        )

    def test_arrive_plain(self):
        assert _instruction_from_step(step("arrive")) == "Arrive at destination"

    def test_ordinal_helpers(self):
        assert _ordinal(1) == "1st"
        assert _ordinal(2) == "2nd"
        assert _ordinal(3) == "3rd"
        assert _ordinal(4) == "4th"
        assert _ordinal(11) == "11th"
        assert _ordinal(21) == "21st"


class TestStepDataclass:
    def test_modifier_and_exit_defaults(self):
        s = RouteStep(instruction="x", name="n", distance_miles=1.0, maneuver="turn")
        assert s.modifier == ""
        assert s.exit_number is None


@pytest.mark.django_db
class TestStepsReachApi:
    """The API step payload must carry maneuver + modifier for map arrows."""

    def test_plan_payload_steps_have_maneuver_fields(self):
        from unittest.mock import patch

        from rest_framework.test import APIClient

        from .test_api import DEMO, PLAN_URL, fake_geocode, fake_route

        with patch(
            "routing.geocoder.Geocoder.geocode", side_effect=fake_geocode
        ), patch(
            "routing.geocoder.Geocoder.reverse", return_value="Somewhere, KS"
        ), patch(
            "routing.router.RoutingService.route", side_effect=fake_route
        ):
            response = APIClient().post(PLAN_URL, DEMO, format="json")
        assert response.status_code == 201, response.data
        legs = response.data["route"]["legs"]
        assert legs, "expected at least one leg"
        first_step = legs[0]["steps"][0]
        assert "maneuver" in first_step
        assert "modifier" in first_step
        assert first_step["maneuver"] == "depart"
