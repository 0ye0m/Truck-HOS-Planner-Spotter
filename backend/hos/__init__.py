"""
HOS scheduling engine — pure Python, no Django/network dependencies.

Public API:
    generate_schedule(legs, cycle_used_hours, start_dt, config) -> Schedule
    split_into_daily_logs(schedule) -> list[DailyLogData]
    validate_schedule(schedule, cycle_used_hours) -> list[violations]
"""

from .constants import (  # noqa: F401
    ALLOW_34H_RESTART,
    BREAK_AFTER_DRIVING_HOURS,
    BREAK_DURATION_MINUTES,
    CYCLE_LIMIT_HOURS,
    CYCLE_WINDOW_DAYS,
    DEFAULT_START_TIME,
    DROPOFF_DURATION_MINUTES,
    FUEL_DURATION_MINUTES,
    FUEL_INTERVAL_MILES,
    MAX_DRIVING_HOURS,
    MAX_WINDOW_HOURS,
    MIN_RESET_HOURS,
    PICKUP_DURATION_MINUTES,
    PRE_TRIP_ON_DUTY_MINUTES,
    RESTART_HOURS,
)
from .daily import DailyLogData, Segment, split_into_daily_logs  # noqa: F401
from .exceptions import HosEngineError, InfeasibleTripError  # noqa: F401
from .models import (  # noqa: F401
    ACTIVITY_DUTY_STATUS,
    ACTIVITY_LABELS,
    Activity,
    ActivityType,
    DutyStatus,
    GeoPoint,
    HosStateSnapshot,
    RouteLeg,
    Schedule,
)
from .scheduler import HosScheduler, SchedulerConfig, generate_schedule  # noqa: F401
from .validators import validate_schedule  # noqa: F401
