"""Trip planning service.

This module contains the canonical trip-planning pipeline:

    Input
      ↓
    Geocoding
      ↓
    Routing
      ↓
    HOS scheduling
      ↓
    Validation
      ↓
    Persistence
      ↓
    ELD rendering

The same canonical schedule is used for the route, timeline, HOS summary,
and daily ELD logs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time as dt_time
from typing import Any, Optional
from zoneinfo import ZoneInfo

from django.utils import timezone as dj_tz

from eldlogs.pdf import image_to_png_bytes
from eldlogs.renderer import render_daily_log
from hos import (
    ActivityType,
    GeoPoint,
    RouteLeg,
    SchedulerConfig,
    generate_schedule,
    split_into_daily_logs,
    validate_schedule,
)
from hos.daily import cycle_used_at_day_starts
from hos.exceptions import HosEngineError, InfeasibleTripError
from routing.geocoder import GeocodeResult, Geocoder, GeocodingError
from routing.router import RouteResult, RoutingError, RoutingService
from routing.stops import label_stop
from routing.us_states import timezone_for_state

logger = logging.getLogger(__name__)

DEFAULT_START_TIME = dt_time(6, 0)


class TripPlanningError(Exception):
    """User-facing pipeline error with a safe message."""

    def __init__(
        self,
        message: str,
        code: str = "planning-failed",
        details: Any = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


@dataclass
class PreparedTrip:
    """Everything produced by the shared preparation stage."""

    current: GeocodeResult
    pickup: GeocodeResult
    dropoff: GeocodeResult
    tz_name: str
    start_local: datetime
    assumed_start_time: bool
    leg_results: list
    legs: list[RouteLeg]
    schedule: Any


@dataclass
class TripInput:
    """Validated input for a trip-planning request."""

    current_location: str
    pickup_location: str
    dropoff_location: str
    current_cycle_used: float
    start_date: Optional[date] = None
    start_time: Optional[dt_time] = None
    driver_name: str = ""
    carrier_name: str = ""
    truck_number: str = ""
    trailer_number: str = ""
    main_office: str = ""
    co_driver: str = ""
    timezone: str = ""
    assumed_start_time: bool = True


class TripPlanner:
    """Executes the full planning pipeline."""

    def __init__(self) -> None:
        self.geocoder = Geocoder()
        self.router = RoutingService()

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def prepare(self, data: TripInput) -> PreparedTrip:
        """
        Shared preparation stage:

        geocode → time base → route → HOS schedule

        No database persistence or rendering happens here.
        """

        # 1. Geocode the three locations
        current = self._geocode(data.current_location)
        pickup = self._geocode(data.pickup_location)
        dropoff = self._geocode(data.dropoff_location)

        # 2. Home-terminal time zone + start datetime
        tz_name = data.timezone or timezone_for_state(
            current.state,
            "America/Chicago",
        )

        try:
            tzinfo = ZoneInfo(tz_name)
        except Exception:
            tzinfo = ZoneInfo("America/Chicago")
            tz_name = "America/Chicago"

        assumed = data.start_time is None
        start_time = data.start_time or DEFAULT_START_TIME
        start_date = data.start_date or dj_tz.localdate()

        start_local = datetime.combine(
            start_date,
            start_time,
        ).replace(tzinfo=tzinfo)

        # 3. Route
        leg_results = [
            self._route(current, pickup),
            self._route(pickup, dropoff),
        ]

        zero_miles = all(
            result.distance_miles < 1e-6
            for result in leg_results
        )

        if zero_miles:
            raise TripPlanningError(
                "The route between these locations has zero length. "
                "Please check the pickup and dropoff locations.",
                "zero-distance-route",
            )

        endpoints = [
            self._triplet(current),
            self._triplet(pickup),
            self._triplet(dropoff),
        ]

        legs = [
            RouteLeg(
                start=GeoPoint(
                    name=endpoints[i][0],
                    lat=endpoints[i][1],
                    lon=endpoints[i][2],
                ),
                end=GeoPoint(
                    name=endpoints[i + 1][0],
                    lat=endpoints[i + 1][1],
                    lon=endpoints[i + 1][2],
                ),
                distance_miles=leg_results[i].distance_miles,
                duration_hours=leg_results[i].duration_hours,
                geometry=leg_results[i].geometry,
            )
            for i in range(2)
        ]

        # 4. HOS scheduling
        try:
            schedule = generate_schedule(
                legs,
                cycle_used_hours=data.current_cycle_used,
                start_dt=start_local,
                config=SchedulerConfig(),
            )
        except InfeasibleTripError as exc:
            raise TripPlanningError(
                exc.explanation,
                exc.rule,
            )
        except HosEngineError as exc:
            raise TripPlanningError(
                str(exc),
                "hos-engine-error",
            )

        return PreparedTrip(
            current=current,
            pickup=pickup,
            dropoff=dropoff,
            tz_name=tz_name,
            start_local=start_local,
            assumed_start_time=assumed,
            leg_results=leg_results,
            legs=legs,
            schedule=schedule,
        )

    def plan(self, data: TripInput) -> dict[str, Any]:
        prepared = self.prepare(data)
        schedule = prepared.schedule

        # 5. Validate before serving
        violations = validate_schedule(
            schedule,
            data.current_cycle_used,
        )

        errors = [
            violation
            for violation in violations
            if violation["severity"] == "error"
        ]

        if errors:
            logger.error(
                "Generated schedule has violations: %s",
                errors,
            )
            raise TripPlanningError(
                "The generated schedule failed internal validation. "
                "Please try different inputs.",
                "schedule-validation-failed",
                details=errors,
            )

        # 6. Enrich stop locations
        self._enrich_locations(schedule)

        # 7. Split into daily logs
        daily_logs = split_into_daily_logs(schedule)

        cycle_at_day = cycle_used_at_day_starts(
            schedule,
            data.current_cycle_used,
        )

        # 8. Persist + render
        return self._build_payload(
            data=data,
            tz_name=prepared.tz_name,
            assumed_start_time=prepared.assumed_start_time,
            current=prepared.current,
            pickup=prepared.pickup,
            dropoff=prepared.dropoff,
            leg_results=prepared.leg_results,
            schedule=schedule,
            daily_logs=daily_logs,
            cycle_at_day=cycle_at_day,
            violations=violations,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _triplet(
        result: GeocodeResult,
    ) -> tuple[str, float, float]:
        """Return clean (City, ST) label + coordinates."""

        from routing.us_states import state_abbreviation

        city = result.city or result.display_name.split(",")[0]
        state = state_abbreviation(result.state)

        label = (
            f"{city}, {state}".strip(", ")
            if state
            else city or result.display_name
        )

        return (
            label or result.display_name,
            result.lat,
            result.lon,
        )

    def _geocode(self, address: str) -> GeocodeResult:
        try:
            return self.geocoder.geocode(address)
        except GeocodingError as exc:
            raise TripPlanningError(
                exc.message,
                exc.kind,
            )

    def _route(
        self,
        start: GeocodeResult,
        end: GeocodeResult,
    ) -> RouteResult:
        try:
            return self.router.route(
                [
                    (start.lat, start.lon),
                    (end.lat, end.lon),
                ]
            )
        except RoutingError as exc:
            raise TripPlanningError(
                exc.message,
                exc.kind,
            )

    def _enrich_locations(self, schedule) -> None:
        """Give mid-route stops real City, ST labels."""

        for activity in schedule.activities:
            if activity.location.name:
                continue

            if (
                activity.location.lat is None
                or activity.location.lon is None
            ):
                activity.location.name = {
                    ActivityType.FUEL: "Planned fuel stop",
                    ActivityType.REST_BREAK: "Planned rest stop",
                    ActivityType.SLEEPER_BERTH: (
                        "Planned overnight rest stop"
                    ),
                    ActivityType.RESTART_34H: (
                        "Planned 34-hour restart location"
                    ),
                    ActivityType.DRIVING: "En route",
                }.get(
                    activity.type,
                    "En route",
                )
                continue

            activity.location.name = label_stop(
                self.geocoder,
                activity.location.lat,
                activity.location.lon,
                activity.type.value,
            )

    # ------------------------------------------------------------------
    # Persistence + response
    # ------------------------------------------------------------------

    def _build_payload(self, **ctx) -> dict[str, Any]:
        from trips.models import (
            DailyLog,
            Route,
            ScheduledActivity,
            Trip,
        )

        data: TripInput = ctx["data"]
        schedule = ctx["schedule"]
        daily_logs = ctx["daily_logs"]

        trip = Trip.objects.create(
            current_location=data.current_location,
            pickup_location=data.pickup_location,
            dropoff_location=data.dropoff_location,
            current_cycle_used=data.current_cycle_used,
            start_date=data.start_date,
            start_time=data.start_time,
            start_datetime=schedule.start,
            home_terminal_timezone=ctx["tz_name"],
            assumed_start_time=ctx["assumed_start_time"],
            driver_name=data.driver_name,
            carrier_name=data.carrier_name,
            truck_number=data.truck_number,
            trailer_number=data.trailer_number,
            main_office=data.main_office,
            co_driver=data.co_driver,
        )

        # ------------------------------------------------------------------
        # Route
        # ------------------------------------------------------------------

        leg_payload = []

        for index, result in enumerate(ctx["leg_results"]):
            steps = [
                step
                for leg in result.legs
                for step in leg.steps
            ][:200]

            leg_payload.append(
                {
                    "leg_index": index,
                    "distance_miles": round(
                        result.distance_miles,
                        1,
                    ),
                    "duration_hours": round(
                        result.duration_hours,
                        2,
                    ),
                    "steps": [
                        {
                            "instruction": step.instruction,
                            "name": step.name,
                            "distance_miles": round(
                                step.distance_miles,
                                1,
                            ),
                            "maneuver": step.maneuver,
                            "modifier": step.modifier,
                        }
                        for step in steps
                    ],
                }
            )

        geometry = [
            coord
            for result in ctx["leg_results"]
            for coord in result.geometry
        ]

        Route.objects.create(
            trip=trip,
            distance_miles=schedule.total_distance_miles,
            duration_hours=sum(
                result.duration_hours
                for result in ctx["leg_results"]
            ),
            geometry=geometry,
            legs=leg_payload,
            provider="OSRM",
        )

        # ------------------------------------------------------------------
        # Activities
        # ------------------------------------------------------------------

        activity_payload = []

        for activity in schedule.activities:
            ScheduledActivity.objects.create(
                trip=trip,
                seq=activity.seq,
                activity_type=activity.type.value,
                duty_status=activity.duty_status.value,
                start=activity.start,
                end=activity.end,
                duration_minutes=activity.duration_minutes,
                distance_miles=activity.distance_miles,
                lat=activity.location.lat,
                lon=activity.location.lon,
                location_name=activity.location.name,
                note=activity.note,
                leg_index=activity.leg_index,
                miles_into_leg=activity.miles_into_leg,
            )

            activity_payload.append(
                self._activity_json(activity)
            )

        # ------------------------------------------------------------------
        # Daily logs
        # ------------------------------------------------------------------

        cumulative_miles: dict[str, float] = {}
        running = 0.0

        for log in daily_logs:
            running += log.miles
            cumulative_miles[log.date.isoformat()] = running

        cycle_map = {
            day.isoformat(): hours
            for day, hours in ctx["cycle_at_day"].items()
        }

        trip_data = {
            "driver_name": data.driver_name,
            "carrier_name": data.carrier_name,
            "truck_number": data.truck_number,
            "trailer_number": data.trailer_number,
            "main_office": data.main_office,
            "home_terminal": data.main_office or "",
            "co_driver": data.co_driver,
            "cumulative_miles": cumulative_miles,
            "cycle_at_day_start": cycle_map,
            "trip_id": trip.pk,
        }

        log_payload = []

        for log in daily_logs:
            # Render the ELD sheet.
            image = render_daily_log(
                log,
                schedule,
                trip_data,
            )

            # Logical filename only.
            #
            # The actual PNG bytes are stored in PostgreSQL through
            # _save_media(), not on Render's ephemeral filesystem.
            filename = (
                f"trips/{trip.pk}/"
                f"log_day_{log.day_number}.png"
            )

            self._save_media(
                filename,
                image_to_png_bytes(image),
            )

            DailyLog.objects.create(
                trip=trip,
                date=log.date,
                day_number=log.day_number,
                off_duty_hours=(
                    log.off_duty_minutes / 60.0
                ),
                sleeper_hours=(
                    log.sleeper_minutes / 60.0
                ),
                driving_hours=(
                    log.driving_minutes / 60.0
                ),
                on_duty_hours=(
                    log.on_duty_minutes / 60.0
                ),
                miles=log.miles,
                remarks=[
                    [t.isoformat(), text]
                    for t, text in log.remarks
                ],
                rendered_file=filename,
            )

            log_payload.append(
                {
                    "day_number": log.day_number,
                    "date": log.date.isoformat(),
                    "off_duty_hours": round(
                        log.off_duty_minutes / 60.0,
                        2,
                    ),
                    "sleeper_hours": round(
                        log.sleeper_minutes / 60.0,
                        2,
                    ),
                    "driving_hours": round(
                        log.driving_minutes / 60.0,
                        2,
                    ),
                    "on_duty_hours": round(
                        log.on_duty_minutes / 60.0,
                        2,
                    ),
                    "total_hours": 24.0,
                    "miles": round(
                        log.miles,
                        1,
                    ),
                    "remarks": [
                        {
                            "time": t.strftime("%H:%M"),
                            "text": text,
                        }
                        for t, text in log.remarks
                    ],
                    "image_url": (
                        f"/api/media/{filename}"
                    ),
                }
            )

        # ------------------------------------------------------------------
        # Map markers
        # ------------------------------------------------------------------

        markers = self._build_markers(schedule)

        # ------------------------------------------------------------------
        # HOS summary
        # ------------------------------------------------------------------

        hos = schedule.hos

        payload = {
            "trip": {
                "id": trip.pk,
                "current_location": trip.current_location,
                "pickup_location": trip.pickup_location,
                "dropoff_location": trip.dropoff_location,
                "current_cycle_used": trip.current_cycle_used,
                "start_datetime": (
                    schedule.start.isoformat()
                    if schedule.start
                    else None
                ),
                "assumed_start_time": trip.assumed_start_time,
                "home_terminal_timezone": (
                    trip.home_terminal_timezone
                ),
                "driver_name": (
                    data.driver_name or "Not provided"
                ),
                "carrier_name": (
                    data.carrier_name or "Not provided"
                ),
                "truck_number": (
                    data.truck_number or "Not provided"
                ),
                "trailer_number": (
                    data.trailer_number or "Not provided"
                ),
                "main_office": (
                    data.main_office or "Not provided"
                ),
                "co_driver": data.co_driver or "",
                "created_at": trip.created_at.isoformat(),
            },
            "route": {
                "distance_miles": round(
                    schedule.total_distance_miles,
                    1,
                ),
                "duration_hours": round(
                    sum(
                        result.duration_hours
                        for result in ctx["leg_results"]
                    ),
                    2,
                ),
                "geometry": geometry,
                "legs": leg_payload,
                "provider": "OSRM (open source routing)",
            },
            "schedule": {
                "start": (
                    schedule.start.isoformat()
                    if schedule.start
                    else None
                ),
                "end": (
                    schedule.end.isoformat()
                    if schedule.end
                    else None
                ),
                "activities": activity_payload,
                "restart_used": schedule.restart_used,
            },
            "hos_summary": {
                "schedulable": True,
                "cycle_used_before": round(
                    hos.cycle_used_before,
                    2,
                ),
                "cycle_planned": round(
                    hos.cycle_planned,
                    2,
                ),
                "cycle_remaining_after": round(
                    hos.cycle_remaining_after,
                    2,
                ),
                "driving_used_in_period": round(
                    hos.driving_used_in_period,
                    2,
                ),
                "driving_remaining_in_period": round(
                    hos.driving_remaining_in_period,
                    2,
                ),
                "window_used_hours": round(
                    hos.window_used_hours,
                    2,
                ),
                "window_remaining_hours": round(
                    hos.window_remaining_hours,
                    2,
                ),
                "next_break_in_hours": (
                    round(
                        hos.next_break_in_hours,
                        2,
                    )
                    if hos.next_break_in_hours is not None
                    else None
                ),
                "next_rest_hours": hos.next_rest_hours,
                "restart_used": schedule.restart_used,
                "total_driving_hours": round(
                    schedule.total_driving_hours,
                    2,
                ),
                "total_on_duty_hours": round(
                    schedule.total_on_duty_hours,
                    2,
                ),
                "violations": ctx["violations"],
            },
            "markers": markers,
            "logs": log_payload,
        }

        return payload

    # ------------------------------------------------------------------
    # Database-backed media storage
    # ------------------------------------------------------------------

    @staticmethod
    def _save_media(
        filename: str,
        content: bytes,
    ) -> str:
        """
        Store generated ELD media in PostgreSQL.

        Render's free filesystem is ephemeral, so generated files must
        not depend on the local filesystem surviving a restart or
        redeploy.

        The filename is kept in DailyLog.rendered_file so existing
        application data remains compatible.
        """

        from trips.models import RenderedMedia

        RenderedMedia.objects.update_or_create(
            name=filename,
            defaults={
                "content": content,
                "content_type": "image/png",
            },
        )

        return filename

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _activity_json(activity) -> dict[str, Any]:
        return {
            "seq": activity.seq,
            "type": activity.type.value,
            "duty_status": activity.duty_status.value,
            "label": activity.label,
            "start": activity.start.isoformat(),
            "end": activity.end.isoformat(),
            "duration_minutes": round(
                activity.duration_minutes,
                1,
            ),
            "distance_miles": round(
                activity.distance_miles,
                1,
            ),
            "location": (
                activity.location.name
                or "En route"
            ),
            "lat": activity.location.lat,
            "lon": activity.location.lon,
            "note": activity.note,
            "leg_index": activity.leg_index,
        }

    @staticmethod
    def _build_markers(schedule) -> list[dict[str, Any]]:
        """Map markers derived only from the canonical schedule."""

        markers = []

        for activity in schedule.activities:
            if activity.type in (
                ActivityType.DRIVING,
                ActivityType.OFF_DUTY,
                ActivityType.REST_BREAK,
            ):
                continue

            if activity.location.lat is None:
                continue

            markers.append(
                {
                    "type": activity.type.value,
                    "label": activity.label,
                    "location": (
                        activity.location.name
                        or "En route"
                    ),
                    "lat": activity.location.lat,
                    "lon": activity.location.lon,
                    "arrival": activity.start.isoformat(),
                    "departure": activity.end.isoformat(),
                    "duration_minutes": round(
                        activity.duration_minutes,
                        1,
                    ),
                    "note": activity.note,
                }
            )

        return markers


def plan_trip(data: TripInput) -> dict[str, Any]:
    """Module-level convenience wrapper."""

    return TripPlanner().plan(data)