"""
Split the canonical schedule into per-calendar-day log data.

Every calendar day touched by the trip gets a complete, contiguous 24-hour
picture: gaps (before the trip starts, after it ends) are filled with
off-duty time, exactly as a driver would fill a paper log.

This module is the SINGLE source of daily log data — the renderer, the API
and the validators all consume it, so map/timeline/logs can never diverge.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

from . import constants as C
from .models import Activity, DutyStatus, Schedule


@dataclass
class Segment:
    """One contiguous duty-status span on one calendar day."""

    status: DutyStatus
    start: datetime
    end: datetime
    activity: Optional[Activity]      # None => synthetic off-duty fill
    distance_miles: float = 0.0       # driving miles within this segment
    is_continuation: bool = False     # spans midnight from the previous day


@dataclass
class DailyLogData:
    """All data needed to render one daily log sheet."""

    date: date
    day_number: int
    segments: list[Segment] = field(default_factory=list)
    off_duty_minutes: float = 0.0
    sleeper_minutes: float = 0.0
    driving_minutes: float = 0.0
    on_duty_minutes: float = 0.0
    miles: float = 0.0
    remarks: list[tuple[datetime, str]] = field(default_factory=list)

    def total_minutes(self) -> float:
        return (
            self.off_duty_minutes
            + self.sleeper_minutes
            + self.driving_minutes
            + self.on_duty_minutes
        )


def _next_midnight(moment: datetime) -> datetime:
    """Next local midnight after `moment` (works for tz-aware datetimes)."""
    d = moment.date() + timedelta(days=1)
    return datetime.combine(d, datetime.min.time(), tzinfo=moment.tzinfo)


def split_into_daily_logs(schedule: Schedule) -> list[DailyLogData]:
    """
    Split activities at local midnights and produce complete DailyLogData
    objects (one per calendar day between the first and last activity).
    """
    activities = schedule.activities
    if not activities:
        return []

    # --- 1. Cut every activity into per-day raw spans --------------------
    raw: dict[date, list[Segment]] = {}
    for activity in activities:
        cur = activity.start
        continuation = False
        # For driving activities the day pieces must sum EXACTLY to the
        # activity distance: track a remainder and give it to the last piece.
        total_minutes = (activity.end - activity.start).total_seconds() / 60.0
        distance_remaining = activity.distance_miles
        while cur < activity.end - timedelta(seconds=1e-9):
            day_end = _next_midnight(cur)
            seg_end = min(activity.end, day_end)
            is_last = seg_end >= activity.end - timedelta(seconds=1e-9)
            seg = Segment(
                status=activity.duty_status,
                start=cur,
                end=seg_end,
                activity=activity,
                is_continuation=continuation,
            )
            if activity.duty_status == DutyStatus.DRIVING and activity.distance_miles:
                if is_last or total_minutes <= 1e-9:
                    seg.distance_miles = distance_remaining
                else:
                    piece = (seg_end - cur).total_seconds() / 60.0
                    seg.distance_miles = activity.distance_miles * piece / total_minutes
                distance_remaining -= seg.distance_miles
            raw.setdefault(cur.date(), []).append(seg)
            continuation = True
            cur = seg_end

    # --- 2. Fill gaps so every day covers exactly 24 hours ---------------
    first_day = min(raw.keys())
    last_day = max(raw.keys())
    logs: list[DailyLogData] = []
    day: date = first_day
    day_number = 1
    while day <= last_day:
        spans = sorted(raw.get(day, []), key=lambda s: s.start)
        filled: list[Segment] = []
        cursor = datetime.combine(day, datetime.min.time(), tzinfo=spans[0].start.tzinfo if spans else None)
        day_end = cursor + timedelta(days=1)
        for span in spans:
            if span.start > cursor + timedelta(seconds=1e-9):
                filled.append(
                    Segment(status=DutyStatus.OFF_DUTY, start=cursor, end=span.start, activity=None)
                )
            filled.append(span)
            cursor = max(cursor, span.end)
        if cursor < day_end - timedelta(seconds=1e-9):
            filled.append(
                Segment(status=DutyStatus.OFF_DUTY, start=cursor, end=day_end, activity=None)
            )

        log = DailyLogData(date=day, day_number=day_number, segments=filled)
        _accumulate(log)
        _build_remarks(log)
        logs.append(log)
        day += timedelta(days=1)
        day_number += 1
    return logs


def cycle_used_at_day_starts(
    schedule: Schedule, cycle_used_hours: float
) -> dict[date, float]:
    """
    Replay the schedule and return the 70/8 cycle total (hours) at the start
    of every calendar day, seed + prior trip days, restart-aware (34 h
    consecutive off-duty resets the cycle to zero).

    Note: the assessment provides only a single 'current cycle used' value,
    so day-by-day rolling history beyond the trip itself cannot be modeled —
    this is the documented approximation used by the log recap section.
    """
    if not schedule.activities:
        return {}
    cycle = cycle_used_hours * 60.0
    off_streak = 0.0
    result: dict[date, float] = {}
    current_day: Optional[date] = None
    for activity in schedule.activities:
        activity_day = activity.start.date()
        if activity_day != current_day:
            current_day = activity_day
            result[current_day] = cycle / 60.0
        status = activity.duty_status
        if status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
            off_streak += activity.duration_minutes
            if off_streak >= 34 * 60:
                cycle = 0.0
        else:
            if off_streak >= 34 * 60:
                cycle = 0.0
            off_streak = 0.0
            cycle += activity.duration_minutes
    return result


def _accumulate(log: DailyLogData) -> None:
    """Compute status totals + daily driving miles for one day."""
    for seg in log.segments:
        minutes = (seg.end - seg.start).total_seconds() / 60.0
        if seg.status == DutyStatus.OFF_DUTY:
            log.off_duty_minutes += minutes
        elif seg.status == DutyStatus.SLEEPER_BERTH:
            log.sleeper_minutes += minutes
        elif seg.status == DutyStatus.DRIVING:
            log.driving_minutes += minutes
        else:
            log.on_duty_minutes += minutes

        if seg.status == DutyStatus.DRIVING:
            # Distance was assigned exactly during the day-split step.
            log.miles += seg.distance_miles


def _build_remarks(log: DailyLogData) -> None:
    """
    FMCSA remarks: at every duty-status change, record the time, the place
    (city/town + State) and the duty status — e.g.
    "06:00 — Chicago, IL — On Duty".
    """
    previous_status: Optional[DutyStatus] = None
    for seg in log.segments:
        if seg.status == previous_status:
            continue
        activity = seg.activity
        if activity is None:
            # Synthetic off-duty fill: no remark required, but it still
            # establishes the running status.
            previous_status = seg.status
            continue
        place = activity.location.name or "En route"
        label = activity.label
        if seg.is_continuation:
            label += " (cont. from previous day)"
        log.remarks.append((seg.start, f"{place} — {label}"))
        previous_status = seg.status
