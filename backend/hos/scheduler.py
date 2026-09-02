"""
Deterministic HOS trip scheduler.

Strategy (assessment section 10) — at every point the scheduler keeps one
pending decision: "how much driving may happen right now?"  The loop below
inserts exactly one activity per iteration based on the first blocking
condition, which makes the output fully deterministic and explainable.

Blocking conditions, in priority order:

1. 70/8 cycle exhausted      -> 34-hour restart (explicit) or infeasible
2. 11-h driving / 14-h window exhausted -> 10-hour sleeper reset
3. 8 cumulative driving hours since last break -> 30-minute break
4. 1,000 miles since last fuel -> 30-minute fuel stop (on duty not driving)
5. otherwise -> drive the largest legal slice

Fueling, being a 30-minute consecutive non-driving on-duty period, also
satisfies the 30-minute break requirement (per the FMCSA guide).

The engine never invents route data: legs come from the routing layer, and
rest/fuel stop coordinates are interpolated along the supplied geometry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from . import constants as C
from .exceptions import InfeasibleTripError
from .geometry import coord_or_none, interpolate_along_geometry, point_at_fraction
from .models import Activity, ActivityType, GeoPoint, RouteLeg, Schedule
from .state import DutyState


@dataclass
class SchedulerConfig:
    """Named, documented configuration — no hidden magic values."""

    rest_activity_type: ActivityType = ActivityType.SLEEPER_BERTH
    allow_34h_restart: bool = C.ALLOW_34H_RESTART
    pre_trip_minutes: float = C.PRE_TRIP_ON_DUTY_MINUTES
    pickup_minutes: float = C.PICKUP_DURATION_MINUTES
    dropoff_minutes: float = C.DROPOFF_DURATION_MINUTES
    fuel_interval_miles: float = C.FUEL_INTERVAL_MILES
    fuel_duration_minutes: float = C.FUEL_DURATION_MINUTES
    break_duration_minutes: float = C.BREAK_DURATION_MINUTES
    reset_hours: float = C.MIN_RESET_HOURS
    restart_hours: float = C.RESTART_HOURS


def _position_on_leg(leg: RouteLeg, miles_into_leg: float) -> GeoPoint:
    """Resolve a GeoPoint at a route position, preferring real geometry."""
    coord = None
    if leg.geometry:
        coord = interpolate_along_geometry(
            leg.geometry, miles_into_leg, leg.distance_miles
        )
    elif leg.start.lat is not None and leg.end.lat is not None:
        frac = (
            miles_into_leg / leg.distance_miles if leg.distance_miles > C.EPSILON else 0.0
        )
        coord = point_at_fraction(
            (leg.start.lat, leg.start.lon or 0.0),
            (leg.end.lat, leg.end.lon or 0.0),
            frac,
        )
    return GeoPoint(name="", lat=coord[0] if coord else None, lon=coord[1] if coord else None)


class HosScheduler:
    """Generates the canonical activity timeline for one trip."""

    def __init__(
        self,
        legs: list[RouteLeg],
        cycle_used_hours: float,
        start_dt: datetime,
        config: SchedulerConfig | None = None,
    ) -> None:
        if not legs:
            raise InfeasibleTripError("A trip requires at least one route leg.")
        if cycle_used_hours < 0 or cycle_used_hours > C.CYCLE_LIMIT_HOURS + C.EPSILON:
            raise InfeasibleTripError(
                "Current cycle used must be between 0 and 70 hours.",
                rule="cycle-limit",
            )
        self.legs = legs
        self.start_dt = start_dt
        self.config = config or SchedulerConfig()
        self.state = DutyState(cycle_used_minutes=cycle_used_hours * 60.0)
        self.schedule = Schedule(cycle_used_before=cycle_used_hours)
        self._seq = 0
        self._now = start_dt

    # ------------------------------------------------------------------
    # Activity helpers
    # ------------------------------------------------------------------

    def _add(
        self,
        type_: ActivityType,
        start: datetime,
        end: datetime,
        location: GeoPoint,
        leg_index: int = -1,
        miles_into_leg: float = 0.0,
        distance_miles: float = 0.0,
        note: str = "",
    ) -> Activity:
        activity = Activity(
            seq=self._seq,
            type=type_,
            start=start,
            end=end,
            location=location,
            leg_index=leg_index,
            miles_into_leg=miles_into_leg,
            distance_miles=distance_miles,
            note=note,
        )
        self._seq += 1
        self.schedule.add(activity)
        self.state.apply(activity)
        return activity

    def _insert_rest(self, hours: float, type_: ActivityType, note: str, leg_index: int) -> None:
        end = self._now + timedelta(hours=hours)
        position = self._current_position(leg_index)
        self._add(type_, self._now, end, position, leg_index=leg_index, note=note)
        self.state.start_window(end)
        self._now = end

    def _current_position(self, leg_index: int) -> GeoPoint:
        """Where the driver is right now (endpoint or interpolated stop)."""
        if leg_index < 0:
            return self.legs[0].start
        leg = self.legs[leg_index]
        return _position_on_leg(leg, self._miles_into_leg.get(leg_index, 0.0))

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def generate(self) -> Schedule:
        cfg = self.config
        self._miles_into_leg: dict[int, float] = {i: 0.0 for i in range(len(self.legs))}

        # --- Pre-trip on-duty period (documented assumption) -------------
        pre_end = self._now + timedelta(minutes=cfg.pre_trip_minutes)
        self._add(
            ActivityType.ON_DUTY_NOT_DRIVING,
            self._now,
            pre_end,
            self.legs[0].start,
            leg_index=0,
            note="Pre-trip inspection and paperwork (assumed "
            f"{int(cfg.pre_trip_minutes)} min on duty)",
        )
        self.state.start_window(self.start_dt)
        self._now = pre_end

        last_leg_index = len(self.legs) - 1
        for idx, leg in enumerate(self.legs):
            self._drive_leg(idx, leg)
            # --- Endpoint work: pickup on first leg, dropoff on last ----
            if idx == 0:
                self._endpoint_activity(ActivityType.PICKUP, idx, leg.end, cfg.pickup_minutes)
            if idx == last_leg_index:
                self._endpoint_activity(
                    ActivityType.DROPOFF, idx, leg.end, cfg.dropoff_minutes
                )

        self._finalize()
        return self.schedule

    def _endpoint_activity(
        self, type_: ActivityType, leg_index: int, location: GeoPoint, minutes: float
    ) -> None:
        end = self._now + timedelta(minutes=minutes)
        note = (
            "Loading / paperwork (1 h on duty, not driving)"
            if type_ == ActivityType.PICKUP
            else "Unloading / paperwork (1 h on duty, not driving)"
        )
        self._add(
            type_,
            self._now,
            end,
            location,
            leg_index=leg_index,
            miles_into_leg=self._miles_into_leg.get(leg_index, 0.0),
            note=note,
        )
        self._now = end

    # ------------------------------------------------------------------
    # Driving loop for one leg
    # ------------------------------------------------------------------

    def _drive_leg(self, leg_index: int, leg: RouteLeg) -> None:
        cfg = self.config
        remaining_miles = leg.distance_miles
        speed = leg.speed_mph

        if leg.distance_miles <= C.EPSILON:
            return  # zero-distance leg: nothing to drive

        if speed <= C.EPSILON:
            raise InfeasibleTripError(
                "Routing service did not return a usable travel duration for this leg.",
                rule="route-duration-unavailable",
            )

        guard = 0
        while remaining_miles > C.EPSILON:
            guard += 1
            if guard > 500:
                raise InfeasibleTripError(
                    "Scheduling did not converge; please check the route data.",
                    rule="internal",
                )

            dist_cap = remaining_miles / speed * 60.0
            fuel_gap = cfg.fuel_interval_miles - self.state.miles_since_fuel
            fuel_cap = fuel_gap / speed * 60.0

            # 1) 70/8 cycle exhausted -> explicit 34-hour restart or stop.
            if self.state.cycle_remaining_minutes <= C.EPSILON:
                if not cfg.allow_34h_restart:
                    raise InfeasibleTripError(
                        "Only 0.0 hours remain in the 70/8 cycle, but the "
                        "remaining trip still requires driving. Enable the "
                        "34-hour restart or shorten the trip.",
                        rule="70-8-cycle-limit",
                    )
                self._insert_rest(
                    cfg.restart_hours,
                    ActivityType.RESTART_34H,
                    "34-hour restart required to continue trip "
                    "(70/8 cycle exhausted)",
                    leg_index,
                )
                self.state.cycle_used_minutes = 0.0
                self.state.restart_used = True
                self.schedule.restart_used = True
                continue

            # 2) Daily capacity exhausted -> 10-hour reset.
            if (
                self.state.driving_remaining_minutes <= C.EPSILON
                or self.state.window_remaining_minutes(self._now) <= C.EPSILON
            ):
                self._insert_rest(
                    cfg.reset_hours,
                    cfg.rest_activity_type,
                    f"{int(cfg.reset_hours)}-hour reset — daily driving/window "
                    "limit reached",
                    leg_index,
                )
                continue

            # 3) 8 cumulative driving hours -> 30-minute break.
            if self.state.break_cap_minutes <= C.EPSILON:
                self._add(
                    ActivityType.REST_BREAK,
                    self._now,
                    self._now + timedelta(minutes=cfg.break_duration_minutes),
                    self._current_position(leg_index),
                    leg_index=leg_index,
                    miles_into_leg=self._miles_into_leg[leg_index],
                    note="Required 30-minute break after 8 cumulative "
                    "driving hours",
                )
                self._now += timedelta(minutes=cfg.break_duration_minutes)
                continue

            # 4) Fuel threshold reached -> 30-minute fuel stop.
            if fuel_gap <= C.EPSILON:
                self._add(
                    ActivityType.FUEL,
                    self._now,
                    self._now + timedelta(minutes=cfg.fuel_duration_minutes),
                    self._current_position(leg_index),
                    leg_index=leg_index,
                    miles_into_leg=self._miles_into_leg[leg_index],
                    note=f"Fueling — required every {int(cfg.fuel_interval_miles)} miles",
                )
                self._now += timedelta(minutes=cfg.fuel_duration_minutes)
                self.state.miles_since_fuel = 0.0
                continue

            # 5) Drive the largest legal slice.
            slice_minutes = min(
                self.state.break_cap_minutes,
                self.state.driving_remaining_minutes,
                self.state.window_remaining_minutes(self._now),
                self.state.cycle_remaining_minutes,
                fuel_cap,
                dist_cap,
            )
            if slice_minutes <= C.EPSILON:
                raise InfeasibleTripError(
                    "No legal driving time is currently available "
                    "(window, driving, break, fuel and cycle limits are all "
                    "exhausted).",
                    rule="hos-infeasible",
                )

            slice_miles = min(slice_minutes / 60.0 * speed, remaining_miles)
            slice_minutes = slice_miles / speed * 60.0  # keep time/miles in sync
            start = self._now
            end = start + timedelta(minutes=slice_minutes)
            start_pos = self._current_position(leg_index)

            route_label = f"{leg.start.name} → {leg.end.name}".strip(" →")
            driving = self._add(
                ActivityType.DRIVING,
                start,
                end,
                start_pos,
                leg_index=leg_index,
                miles_into_leg=self._miles_into_leg[leg_index],
                distance_miles=slice_miles,
                note=route_label,
            )
            self._now = end
            self._miles_into_leg[leg_index] += slice_miles
            remaining_miles -= slice_miles
            if remaining_miles <= C.EPSILON:
                driving.note = route_label  # keep the leg label on all slices

    # ------------------------------------------------------------------
    # Finalisation
    # ------------------------------------------------------------------

    def _finalize(self) -> None:
        schedule = self.schedule
        for activity in schedule.activities:
            status = activity.duty_status
            if status.value == "DRIVING":
                schedule.total_driving_hours += activity.duration_hours
            if status.value in ("DRIVING", "ON_DUTY_NOT_DRIVING"):
                schedule.total_on_duty_hours += activity.duration_hours
        schedule.total_distance_miles = sum(l.distance_miles for l in self.legs)
        schedule.restart_used = self.state.restart_used

        end_state = self.state
        window_used = (
            (self._now - end_state.window_started_at).total_seconds() / 3600.0
            if end_state.window_started_at
            else 0.0
        )
        since_break_min = end_state.driving_since_break_minutes
        next_break = (
            max(0.0, C.BREAK_AFTER_DRIVING_HOURS * 60.0 - since_break_min) / 60.0
        )
        from .models import HosStateSnapshot

        schedule.hos = HosStateSnapshot(
            cycle_used_before=schedule.cycle_used_before,
            cycle_planned=schedule.total_on_duty_hours,
            cycle_remaining_after=max(
                0.0, C.CYCLE_LIMIT_HOURS - (end_state.cycle_used_minutes / 60.0)
            ),
            driving_used_in_period=end_state.driving_in_window_minutes / 60.0,
            driving_remaining_in_period=end_state.driving_remaining_minutes / 60.0,
            window_used_hours=window_used,
            window_remaining_hours=max(0.0, C.MAX_WINDOW_HOURS - window_used),
            minutes_since_last_break=since_break_min,
            next_break_in_hours=next_break,
            next_rest_hours=C.MIN_RESET_HOURS,
            restart_used=schedule.restart_used,
            driving_total_hours=schedule.total_driving_hours,
            on_duty_total_hours=schedule.total_on_duty_hours,
        )


def generate_schedule(
    legs: list[RouteLeg],
    cycle_used_hours: float,
    start_dt: datetime,
    config: SchedulerConfig | None = None,
) -> Schedule:
    """Convenience wrapper around :class:`HosScheduler`."""
    return HosScheduler(legs, cycle_used_hours, start_dt, config).generate()
