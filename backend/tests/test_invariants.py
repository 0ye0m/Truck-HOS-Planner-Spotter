"""
Property / invariant-style tests (assessment §35).

A sweep across many deterministic synthetic trips asserts the global
invariants that must hold for EVERY generated schedule:

* all event durations > 0
* events are chronologically ordered, no overlaps
* every daily log totals exactly 1440 minutes, no gaps, no overlaps
* driving <= 11 h between qualifying resets
* the 14-hour window is never violated by driving
* 8-cumulative-hours break rule is never violated
* cycle usage never silently exceeds the configured limit (only driving
  counts as a violation, and the engine inserts an explicit 34 h restart)
* the fuel threshold is never exceeded between fuel stops
* pickup and dropoff occur exactly once each
* daily miles sum exactly to the route miles
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from hos import (
    ActivityType,
    DutyStatus,
    GeoPoint,
    RouteLeg,
    generate_schedule,
    split_into_daily_logs,
    validate_schedule,
)
from hos.constants import (
    BREAK_AFTER_DRIVING_HOURS,
    CYCLE_LIMIT_HOURS,
    FUEL_INTERVAL_MILES,
    MAX_DRIVING_HOURS,
    MAX_WINDOW_HOURS,
    MINUTES_PER_DAY,
    RESTART_HOURS,
)

CST = ZoneInfo("America/Chicago")
START = datetime(2026, 9, 3, 6, 0, tzinfo=CST)

EPS = 1e-6

# (current->pickup miles, hours, pickup->dropoff miles, hours, cycle used)
SCENARIOS = [
    (180, 3.0, 175, 3.0, 0.0),      # short trip
    (180, 3.0, 175, 3.0, 32.0),     # short trip mid cycle
    (420, 6.0, 380, 5.5, 10.0),     # needs a 30-min break
    (650, 9.5, 540, 8.0, 20.0),     # needs a 10-hour reset
    (900, 13.0, 1100, 16.0, 15.0),  # multi-day, fuel stop
    (1200, 18.0, 1500, 22.0, 30.0), # long haul, fuel + resets
    (100, 1.6, 2400, 36.0, 40.0),   # very long second leg
    (2400, 36.0, 100, 1.6, 5.0),    # very long first leg
    (500, 7.0, 500, 7.0, 69.0),     # cycle nearly exhausted -> restart
    (0.0, 0.0, 300, 4.5, 0.0),      # zero-length first leg
    (1.0, 0.02, 1.0, 0.02, 0.0),    # tiny legs
    (600, 8.8, 600, 8.8, 60.0),     # window + cycle pressure
    (2100, 30.0, 2100, 30.0, 0.0),  # ~4200 mi, several days + fuel stops
]


def make_legs(m1, h1, m2, h2):
    def leg(name, miles, hours):
        return RouteLeg(
            start=GeoPoint(name=f"{name} A", lat=40.0, lon=-88.0),
            end=GeoPoint(name=f"{name} B", lat=39.0, lon=-87.0),
            distance_miles=miles,
            duration_hours=hours,
        )

    return [leg("leg1", m1, h1), leg("leg2", m2, h2)]


@pytest.mark.parametrize("m1,h1,m2,h2,cycle", SCENARIOS, ids=range(len(SCENARIOS)))
def test_invariants_hold_for_every_scenario(m1, h1, m2, h2, cycle):
    legs = make_legs(m1, h1, m2, h2)
    schedule = generate_schedule(legs, cycle, START)
    activities = schedule.activities

    # ---- the built-in validator suite passes with zero errors ------------
    errors = [v for v in validate_schedule(schedule, cycle) if v["severity"] == "error"]
    assert errors == []

    # ---- positive durations, chronological order, no overlaps ------------
    for a in activities:
        assert a.duration_minutes > 0, f"activity #{a.seq} has non-positive duration"
    for prev, nxt in zip(activities, activities[1:]):
        assert nxt.start >= prev.end - timedelta_seconds(1)

    # ---- pickup and dropoff occur exactly once ---------------------------
    assert len([a for a in activities if a.type == ActivityType.PICKUP]) == 1
    assert len([a for a in activities if a.type == ActivityType.DROPOFF]) == 1

    # ---- daily logs: exact 1440 minutes, no gaps, no overlaps ------------
    logs = split_into_daily_logs(schedule)
    assert logs, "every schedule must produce at least one daily log"
    for log in logs:
        assert abs(log.total_minutes() - MINUTES_PER_DAY) < 0.5
        segs = sorted(log.segments, key=lambda s: s.start)
        cursor = segs[0].start
        for seg in segs:
            assert (seg.start - cursor).total_seconds() < 1.0, "gap in daily log"
            assert seg.end > seg.start
            cursor = max(cursor, seg.end)
        day_end = datetime.combine(log.date, datetime.min.time()).replace(
            tzinfo=segs[0].start.tzinfo
        ) + timedelta_hours(24)
        assert (day_end - cursor).total_seconds() < 1.0, "log does not reach 24:00"

    # ---- driving <= 11 h between qualifying resets -----------------------
    driving_in_period = 0.0
    for a in activities:
        if a.duty_status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            if a.duration_minutes + EPS >= 600:
                driving_in_period = 0.0
        elif a.duty_status == DutyStatus.DRIVING:
            driving_in_period += a.duration_minutes
            assert driving_in_period <= MAX_DRIVING_HOURS * 60 + EPS

    # ---- 14-hour window: no driving past window end ----------------------
    window_start = None
    for a in activities:
        if a.duty_status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            if a.duration_minutes + EPS >= 600:
                window_start = None
            elif window_start is not None:
                pass
        else:
            if window_start is None:
                window_start = a.start
            if a.duty_status == DutyStatus.DRIVING:
                window_end = window_start + timedelta_hours(MAX_WINDOW_HOURS)
                assert a.end <= window_end + timedelta_seconds(60)

    # ---- break rule: never more than 8 cumulative driving hours ----------
    since_break = 0.0
    for a in activities:
        if a.duty_status == DutyStatus.DRIVING:
            since_break += a.duration_minutes
            assert since_break <= BREAK_AFTER_DRIVING_HOURS * 60 + EPS
        elif a.duration_minutes + EPS >= 30:
            since_break = 0.0

    # ---- cycle: driving never past the configured limit without restart --
    cycle_minutes = cycle * 60.0
    off_streak = 0.0
    for a in activities:
        if a.duty_status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            off_streak += a.duration_minutes
            if off_streak + EPS >= RESTART_HOURS * 60:
                cycle_minutes = 0.0
            continue
        if off_streak + EPS >= RESTART_HOURS * 60:
            cycle_minutes = 0.0
        off_streak = 0.0
        cycle_minutes += a.duration_minutes
        if a.duty_status == DutyStatus.DRIVING:
            assert cycle_minutes <= CYCLE_LIMIT_HOURS * 60 + EPS

    # ---- fuel threshold never exceeded between fuel stops ----------------
    miles_since_fuel = 0.0
    for a in activities:
        if a.duty_status == DutyStatus.DRIVING:
            miles_since_fuel += a.distance_miles
            assert miles_since_fuel <= FUEL_INTERVAL_MILES + 1.0  # 1-mile tolerance
        elif a.type == ActivityType.FUEL:
            miles_since_fuel = 0.0

    # ---- daily miles sum exactly to the route miles ----------------------
    total_miles = sum(log.miles for log in logs)
    expected = sum(leg.distance_miles for leg in legs)
    assert abs(total_miles - expected) < max(0.5, expected * 1e-6)

    # ---- all route miles are accounted for by driving activities ---------
    driven = sum(
        a.distance_miles for a in activities if a.type == ActivityType.DRIVING
    )
    assert abs(driven - expected) < max(0.5, expected * 1e-6)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def timedelta_seconds(seconds: float):
    from datetime import timedelta

    return timedelta(seconds=seconds)


def timedelta_hours(hours: float):
    from datetime import timedelta

    return timedelta(hours=hours)
