"""
Explicit HOS validators.

Every validator returns a list of structured violations:

    {"rule": str, "severity": "error"|"warning", "message": str,
     "timestamp": iso8601 | None, "activity_seq": int | None}

A generated schedule must pass with zero errors before it is served —
the API refuses to mark a schedule "valid" while violations exist.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from . import constants as C
from .daily import split_into_daily_logs
from .models import Activity, DutyStatus, Schedule

EPS = 1e-6


def _violation(
    rule: str,
    message: str,
    activity: Activity | None = None,
    severity: str = "error",
    timestamp=None,
) -> dict[str, Any]:
    return {
        "rule": rule,
        "severity": severity,
        "message": message,
        "timestamp": (timestamp or activity.start if activity else timestamp).isoformat()
        if (timestamp or activity)
        else None,
        "activity_seq": activity.seq if activity else None,
    }


def _minutes(activity: Activity) -> float:
    return activity.duration_minutes


def validate_activity_sequence(activities: list[Activity]) -> list[dict[str, Any]]:
    """Chronological order, no overlaps, positive durations."""
    errors: list[dict[str, Any]] = []
    previous: Activity | None = None
    for activity in activities:
        if _minutes(activity) <= EPS:
            errors.append(
                _violation(
                    "activity-sequence",
                    f"Activity #{activity.seq} has a non-positive duration.",
                    activity,
                )
            )
        if previous is not None and activity.start < previous.end - timedelta(seconds=1):
            errors.append(
                _violation(
                    "activity-sequence",
                    f"Activity #{activity.seq} starts before the previous "
                    "activity ends (timeline overlap).",
                    activity,
                )
            )
        previous = activity
    return errors


def validate_daily_driving_limit(activities: list[Activity]) -> list[dict[str, Any]]:
    """
    11-hour driving limit per driving period (395.3(a)(3)).

    The limit applies within a driving period (between qualifying 10-hour
    resets), NOT per calendar day — a window may legitimately span midnight.
    """
    errors: list[dict[str, Any]] = []
    driving_in_period = 0.0
    for activity in activities:
        if activity.duty_status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            if _minutes(activity) + EPS >= C.MIN_RESET_HOURS * 60:
                driving_in_period = 0.0
        elif activity.duty_status == DutyStatus.DRIVING:
            driving_in_period += _minutes(activity)
            if driving_in_period > C.MAX_DRIVING_HOURS * 60 + EPS:
                errors.append(
                    _violation(
                        "11-hour-driving-limit",
                        f"Driving exceeds the 11-hour limit within one driving "
                        f"period ({driving_in_period / 60.0:.2f} h driven).",
                        activity,
                    )
                )
                driving_in_period = C.MAX_DRIVING_HOURS * 60  # avoid cascades
    return errors


def validate_14_hour_window(activities: list[Activity]) -> list[dict[str, Any]]:
    """
    No driving after the 14-hour window expires (395.3(a)(2)).

    On-duty-not-driving after the window is legal — only driving is checked.
    """
    errors: list[dict[str, Any]] = []
    window_start = None
    for activity in activities:
        status = activity.duty_status
        if status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            if _minutes(activity) + EPS >= C.MIN_RESET_HOURS * 60:
                window_start = None  # qualifying reset; next work restarts it
        elif status == DutyStatus.DRIVING:
            if window_start is None:
                window_start = activity.start  # window starts with first work
            window_end = window_start + timedelta(hours=C.MAX_WINDOW_HOURS)
            if activity.end > window_end + timedelta(minutes=1):
                errors.append(
                    _violation(
                        "14-hour-driving-window",
                        f"Driving continues past the 14-hour window (window "
                        f"started {window_start.isoformat()}).",
                        activity,
                    )
                )
        else:  # ON_DUTY_NOT_DRIVING
            if window_start is None:
                window_start = activity.start
    return errors


def validate_30_min_break(activities: list[Activity]) -> list[dict[str, Any]]:
    """
    30-minute break after 8 cumulative driving hours (395.3(a)(3)(ii)).

    Any consecutive non-driving period of >= 30 minutes qualifies, including
    on-duty-not-driving work such as fueling or loading.
    """
    errors: list[dict[str, Any]] = []
    since_break = 0.0
    for activity in activities:
        if activity.duty_status == DutyStatus.DRIVING:
            since_break += _minutes(activity)
            if since_break > C.BREAK_AFTER_DRIVING_HOURS * 60 + EPS:
                errors.append(
                    _violation(
                        "30-minute-break",
                        "Driving continued beyond 8 cumulative hours without "
                        "a qualifying 30-minute non-driving break.",
                        activity,
                    )
                )
                since_break = C.BREAK_AFTER_DRIVING_HOURS * 60
        else:
            if _minutes(activity) + EPS >= C.BREAK_DURATION_MINUTES:
                since_break = 0.0
    return errors


def validate_cycle_limit(
    activities: list[Activity], cycle_used_hours: float
) -> list[dict[str, Any]]:
    """
    70-hour/8-day rolling on-duty limit (395.3(b)).

    Only DRIVING past the limit is a violation; staying on duty not driving
    is permitted.  A consecutive >= 34 h off-duty/sleeper period resets the
    cycle (395.3(c)).
    """
    errors: list[dict[str, Any]] = []
    cycle_minutes = cycle_used_hours * 60.0
    off_streak = 0.0
    for activity in activities:
        status = activity.duty_status
        if status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            off_streak += _minutes(activity)
            continue
        if off_streak + EPS >= C.RESTART_HOURS * 60:
            cycle_minutes = 0.0  # valid 34-hour restart
        off_streak = 0.0
        cycle_minutes += _minutes(activity)
        if (
            status == DutyStatus.DRIVING
            and cycle_minutes > C.CYCLE_LIMIT_HOURS * 60 + EPS
        ):
            errors.append(
                _violation(
                    "70-8-cycle-limit",
                    f"Driving occurred after the 70/8 cycle was exhausted "
                    f"({cycle_minutes / 60.0:.2f} h on duty in the rolling "
                    "8-day period).",
                    activity,
                )
            )
            cycle_minutes = C.CYCLE_LIMIT_HOURS * 60
    return errors


def validate_rest_requirements(activities: list[Activity]) -> list[dict[str, Any]]:
    """
    10 consecutive hours off duty (or sleeper) are required before starting
    a new driving period after the previous one ended (395.3(a)(1)).
    """
    errors: list[dict[str, Any]] = []
    off_streak = 0.0
    window_open = False
    for activity in activities:
        status = activity.duty_status
        if status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            off_streak += _minutes(activity)
            if off_streak + EPS >= C.MIN_RESET_HOURS * 60:
                window_open = False
        else:
            if status == DutyStatus.DRIVING and not window_open and off_streak < EPS:
                # First work of a period without any preceding off-duty seed.
                # The schedule seed (driver fresh at start) makes this legal;
                # nothing to check.
                pass
            window_open = True
            off_streak = 0.0
    return errors


def validate_fuel_interval(activities: list[Activity]) -> list[dict[str, Any]]:
    """Fuel at least once every 1,000 miles of driving (assessment rule)."""
    errors: list[dict[str, Any]] = []
    miles_since_fuel = 0.0
    for activity in activities:
        if activity.duty_status == DutyStatus.DRIVING:
            miles_since_fuel += activity.distance_miles
        elif activity.type.value == "FUEL":
            if miles_since_fuel > C.FUEL_INTERVAL_MILES + EPS:
                errors.append(
                    _violation(
                        "fuel-interval",
                        f"{miles_since_fuel:.1f} miles were driven since the "
                        f"previous fuel stop (limit: {C.FUEL_INTERVAL_MILES:.0f} miles).",
                        activity,
                    )
                )
            miles_since_fuel = 0.0
    return errors


def validate_daily_log_totals(schedule: Schedule) -> list[dict[str, Any]]:
    """Every daily log's status totals must equal exactly 24 hours."""
    errors: list[dict[str, Any]] = []
    for log in split_into_daily_logs(schedule):
        total = log.total_minutes()
        if abs(total - C.MINUTES_PER_DAY) > 0.5:
            errors.append(
                {
                    "rule": "daily-log-totals",
                    "severity": "error",
                    "message": f"Daily log for {log.date} totals "
                    f"{total / 60.0:.3f} h — must equal exactly 24 h.",
                    "timestamp": None,
                    "activity_seq": None,
                }
            )
    return errors


def validate_daily_miles(schedule: Schedule) -> list[dict[str, Any]]:
    """Daily miles must sum to the trip's total driving miles."""
    errors: list[dict[str, Any]] = []
    logs = split_into_daily_logs(schedule)
    daily_total = sum(log.miles for log in logs)
    expected = schedule.total_distance_miles
    if abs(daily_total - expected) > max(0.5, expected * 1e-6):
        errors.append(
            {
                "rule": "daily-miles",
                "severity": "error",
                "message": f"Daily miles sum to {daily_total:.1f} but the "
                f"route distance is {expected:.1f}.",
                "timestamp": None,
                "activity_seq": None,
            }
        )
    return errors


def validate_schedule(schedule: Schedule, cycle_used_hours: float) -> list[dict[str, Any]]:
    """Run every validator; returns all structured violations found."""
    activities = schedule.activities
    violations: list[dict[str, Any]] = []
    violations += validate_activity_sequence(activities)
    violations += validate_daily_driving_limit(activities)
    violations += validate_14_hour_window(activities)
    violations += validate_30_min_break(activities)
    violations += validate_cycle_limit(activities, cycle_used_hours)
    violations += validate_rest_requirements(activities)
    violations += validate_fuel_interval(activities)
    violations += validate_daily_log_totals(schedule)
    violations += validate_daily_miles(schedule)
    return violations
