"""
Core domain models for the HOS scheduling engine.

These are plain Python dataclasses: the engine is intentionally independent
from Django so it can be unit tested directly (see tests/).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

from .constants import EPSILON


class ActivityType(str, Enum):
    """Planning-level activity types used by the scheduler."""

    OFF_DUTY = "OFF_DUTY"
    SLEEPER_BERTH = "SLEEPER_BERTH"
    DRIVING = "DRIVING"
    ON_DUTY_NOT_DRIVING = "ON_DUTY_NOT_DRIVING"
    FUEL = "FUEL"
    PICKUP = "PICKUP"
    DROPOFF = "DROPOFF"
    REST_BREAK = "REST_BREAK"
    RESTART_34H = "RESTART_34H"


class DutyStatus(str, Enum):
    """The four official ELD/RODS duty statuses used on daily log grids."""

    OFF_DUTY = "OFF_DUTY"
    SLEEPER_BERTH = "SLEEPER_BERTH"
    DRIVING = "DRIVING"
    ON_DUTY_NOT_DRIVING = "ON_DUTY_NOT_DRIVING"


#: Mapping from planning activity types to the official duty status that is
#: drawn on the 24-hour log grid.
ACTIVITY_DUTY_STATUS: dict[ActivityType, DutyStatus] = {
    ActivityType.OFF_DUTY: DutyStatus.OFF_DUTY,
    ActivityType.SLEEPER_BERTH: DutyStatus.SLEEPER_BERTH,
    ActivityType.DRIVING: DutyStatus.DRIVING,
    ActivityType.ON_DUTY_NOT_DRIVING: DutyStatus.ON_DUTY_NOT_DRIVING,
    ActivityType.FUEL: DutyStatus.ON_DUTY_NOT_DRIVING,
    ActivityType.PICKUP: DutyStatus.ON_DUTY_NOT_DRIVING,
    ActivityType.DROPOFF: DutyStatus.ON_DUTY_NOT_DRIVING,
    ActivityType.REST_BREAK: DutyStatus.OFF_DUTY,
    ActivityType.RESTART_34H: DutyStatus.OFF_DUTY,
}

#: Human labels used in remarks / timelines.
ACTIVITY_LABELS: dict[ActivityType, str] = {
    ActivityType.OFF_DUTY: "Off Duty",
    ActivityType.SLEEPER_BERTH: "Sleeper Berth",
    ActivityType.DRIVING: "Driving",
    ActivityType.ON_DUTY_NOT_DRIVING: "On Duty (Not Driving)",
    ActivityType.FUEL: "Fueling",
    ActivityType.PICKUP: "Pickup",
    ActivityType.DROPOFF: "Dropoff",
    ActivityType.REST_BREAK: "30-min Break",
    ActivityType.RESTART_34H: "34-hour Restart",
}


@dataclass
class GeoPoint:
    """A named coordinate."""

    name: str = ""
    lat: Optional[float] = None
    lon: Optional[float] = None


@dataclass
class RouteLeg:
    """
    One drivable leg of the trip.

    The scheduler consumes legs (not raw API responses) so routing data is
    always supplied by the routing layer and the engine stays deterministic.
    """

    start: GeoPoint
    end: GeoPoint
    distance_miles: float
    duration_hours: float
    geometry: list[tuple[float, float]] = field(default_factory=list)  # (lat, lon)

    @property
    def speed_mph(self) -> float:
        if self.duration_hours <= EPSILON:
            return 0.0
        return self.distance_miles / self.duration_hours


@dataclass
class Activity:
    """
    A scheduled activity on the canonical timeline.

    `leg_index` / `miles_into_leg` locate the activity on the route so the
    map, timeline and logs all derive from the same canonical schedule.
    """

    seq: int
    type: ActivityType
    start: datetime
    end: datetime
    location: GeoPoint
    leg_index: int = -1
    miles_into_leg: float = 0.0        # route position where activity starts
    distance_miles: float = 0.0        # miles covered (driving only)
    remark: str = ""                   # e.g. "Chicago, IL — On Duty"
    note: str = ""                     # extra explanation for the UI

    @property
    def duration(self) -> timedelta:
        return self.end - self.start

    @property
    def duration_minutes(self) -> int:
        return int(round((self.end - self.start).total_seconds() / 60))

    @property
    def duration_hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0

    @property
    def duty_status(self) -> DutyStatus:
        return ACTIVITY_DUTY_STATUS[self.type]

    @property
    def label(self) -> str:
        return ACTIVITY_LABELS[self.type]


@dataclass
class HosStateSnapshot:
    """Duty-state snapshot used for the HOS summary UI."""

    cycle_used_before: float
    cycle_planned: float
    cycle_remaining_after: float
    driving_used_in_period: float
    driving_remaining_in_period: float
    window_used_hours: float
    window_remaining_hours: float
    minutes_since_last_break: float | None
    next_break_in_hours: float | None
    next_rest_hours: float
    restart_used: bool
    driving_total_hours: float
    on_duty_total_hours: float


@dataclass
class Schedule:
    """The canonical trip schedule: a single, ordered activity timeline."""

    activities: list[Activity] = field(default_factory=list)
    total_distance_miles: float = 0.0
    total_driving_hours: float = 0.0
    total_on_duty_hours: float = 0.0     # driving + on-duty-not-driving
    cycle_used_before: float = 0.0
    restart_used: bool = False
    hos: Optional[HosStateSnapshot] = None

    def add(self, activity: Activity) -> None:
        self.activities.append(activity)

    @property
    def start(self) -> Optional[datetime]:
        return self.activities[0].start if self.activities else None

    @property
    def end(self) -> Optional[datetime]:
        return self.activities[-1].end if self.activities else None
