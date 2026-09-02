"""
Duty state machine.

Independently tracks the three limits that must never be confused
(assessment section 8):

    A. Driving hours  (11 h per driving period)
    B. 14-hour driving window
    C. 70-hour / 8-day on-duty cycle

All values are tracked in minutes internally for deterministic,
minute-level precision.

Rule references (FMCSA "Interstate Truck Driver's Guide to Hours of
Service for Property Carriers"):

* 395.3(a)(3)(ii): driving is not permitted if more than 8 cumulative
  hours have passed since the end of the driver's last break in driving
  time of at least 30 consecutive minutes.  The interruption may be
  on-duty-not-driving, off-duty, or sleeper berth (e.g. fueling or
  loading stops satisfy it when consecutive).
* 395.3(a)(2): the 14-hour window starts when any work begins after a
  qualifying reset; only *driving* is prohibited after it expires.
* 395.3(b): the 70/8 limit is total on-duty time on a rolling 8-day
  basis.  Violations occur only when *driving* past the limit.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from . import constants as C
from .models import Activity, ActivityType, DutyStatus


@dataclass
class DutyState:
    """
    Mutable duty state while a schedule is being generated.

    Time accounting (minutes):
      * driving_in_window      -- driving since the last qualifying 10 h reset
      * window_started_at      -- when the current 14 h window began
      * driving_since_break    -- driving since the end of the last
                                  qualifying 30-minute non-driving period
      * cycle_used             -- rolling 70/8 on-duty total (minutes),
                                  seeded with the caller-provided history
      * miles_since_fuel       -- driving miles since the last fuel stop
    """

    cycle_used_minutes: float
    window_started_at: datetime | None = None
    driving_in_window_minutes: float = 0.0
    driving_since_break_minutes: float = 0.0
    miles_since_fuel: float = 0.0
    restart_used: bool = False

    # ------------------------------------------------------------------
    # Window helpers
    # ------------------------------------------------------------------

    def start_window(self, at: datetime) -> None:
        """(Re)start the 14-hour window — after any qualifying reset."""
        self.window_started_at = at
        self.driving_in_window_minutes = 0.0
        self.driving_since_break_minutes = 0.0

    def window_remaining_minutes(self, now: datetime) -> float:
        if self.window_started_at is None:
            return C.MAX_WINDOW_HOURS * 60.0
        elapsed = (now - self.window_started_at).total_seconds() / 60.0
        return max(0.0, C.MAX_WINDOW_HOURS * 60.0 - elapsed)

    @property
    def driving_remaining_minutes(self) -> float:
        return max(0.0, C.MAX_DRIVING_HOURS * 60.0 - self.driving_in_window_minutes)

    @property
    def break_cap_minutes(self) -> float:
        """Driving minutes still allowed before the 30-minute break is due."""
        return max(
            0.0, C.BREAK_AFTER_DRIVING_HOURS * 60.0 - self.driving_since_break_minutes
        )

    @property
    def cycle_remaining_minutes(self) -> float:
        return max(0.0, C.CYCLE_LIMIT_HOURS * 60.0 - self.cycle_used_minutes)

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    def apply(self, activity: Activity) -> None:
        """Fold a scheduled activity into the duty state."""
        minutes = activity.duration_minutes
        status = activity.duty_status

        if activity.type == ActivityType.DRIVING:
            self.driving_in_window_minutes += minutes
            self.driving_since_break_minutes += minutes
            self.cycle_used_minutes += minutes
            self.miles_since_fuel += activity.distance_miles
            return

        if status == DutyStatus.ON_DUTY_NOT_DRIVING:
            # Work (pickup / dropoff / fuel) consumes the window and the
            # cycle but never the 11-hour driving allowance.
            self.cycle_used_minutes += minutes
            # A consecutive non-driving interruption of >= 30 minutes
            # (fueling, loading, paperwork) satisfies the 30-minute break.
            if minutes + C.EPSILON >= C.BREAK_DURATION_MINUTES:
                self.driving_since_break_minutes = 0.0
            return

        # OFF_DUTY / SLEEPER_BERTH
        if minutes + C.EPSILON >= C.BREAK_DURATION_MINUTES:
            self.driving_since_break_minutes = 0.0
        # NOTE: a full 10 h reset restarts the 11-hour/14-hour clocks; the
        # scheduler calls start_window() with the rest end time explicitly.
