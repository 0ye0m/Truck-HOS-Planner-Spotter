"""
REST API endpoints.

    POST /api/trips/plan/               plan a trip (full pipeline)
    POST /api/trips/validate/           dry-run feasibility check
    GET  /api/trips/{id}/               stored trip detail
    GET  /api/trips/{id}/logs/          daily logs list
    GET  /api/trips/{id}/logs/{day}/    one daily log (data)
    GET  /api/trips/{id}/logs/{day}/image/  rendered PNG
    GET  /api/trips/{id}/logs/pdf/      all logs as one PDF
    GET  /api/trips/{id}/route/         route detail
    GET  /api/geocode/?q=...            geocoding helper
    GET  /api/health/                   health check
"""

from __future__ import annotations

import logging
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.utils import timezone as dj_tz
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from config.settings import GEOCODING_API_URL, ROUTING_API_URL
from hos import (
    Activity,
    ActivityType,
    GeoPoint,
    RouteLeg,
    Schedule,
    SchedulerConfig,
    generate_schedule,
    split_into_daily_logs,
    validate_schedule,
)
from hos.daily import cycle_used_at_day_starts

from eldlogs.pdf import image_to_png_bytes, images_to_pdf
from eldlogs.renderer import render_daily_log
from trips.models import DailyLog, Route, ScheduledActivity, Trip
from trips.serializers import GeocodeQuerySerializer, TripPlanInputSerializer
from trips.services import TripInput, TripPlanningError, TripPlanner

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _input_to_dataclass(serializer) -> TripInput:
    payload = serializer.validated_data
    return TripInput(
        current_location=payload["current_location"],
        pickup_location=payload["pickup_location"],
        dropoff_location=payload["dropoff_location"],
        current_cycle_used=payload["current_cycle_used"],
        start_date=payload.get("start_date"),
        start_time=payload.get("start_time"),
        driver_name=payload.get("driver_name", ""),
        carrier_name=payload.get("carrier_name", ""),
        truck_number=payload.get("truck_number", ""),
        trailer_number=payload.get("trailer_number", ""),
        main_office=payload.get("main_office", ""),
        co_driver=payload.get("co_driver", ""),
        timezone=payload.get("timezone", ""),
    )


def _planning_error_response(exc: TripPlanningError) -> Response:
    mapping = {
        "address-not-found": status.HTTP_400_BAD_REQUEST,
        "invalid-address": status.HTTP_400_BAD_REQUEST,
        "timeout": status.HTTP_504_GATEWAY_TIMEOUT,
        "service-unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
        "no-route": status.HTTP_400_BAD_REQUEST,
        "zero-distance-route": status.HTTP_400_BAD_REQUEST,
        "70-8-cycle-limit": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "cycle-limit": status.HTTP_400_BAD_REQUEST,
    }
    return Response(
        {"error": exc.message, "code": exc.code},
        status=mapping.get(exc.code, status.HTTP_400_BAD_REQUEST),
    )


def _get_trip(trip_id: int) -> Trip:
    try:
        return Trip.objects.get(pk=trip_id)
    except Trip.DoesNotExist:
        raise ValidationError({"error": f"Trip {trip_id} was not found."})


def _schedule_from_db(trip: Trip) -> Schedule:
    """Rebuild the canonical Schedule from stored rows (no recalculation)."""
    schedule = Schedule(cycle_used_before=trip.current_cycle_used)
    for index, row in enumerate(
        ScheduledActivity.objects.filter(trip=trip).order_by("seq")
    ):
        schedule.add(
            Activity(
                seq=row.seq,
                type=ActivityType(row.activity_type),
                start=row.start,
                end=row.end,
                location=GeoPoint(
                    name=row.location_name or "En route", lat=row.lat, lon=row.lon
                ),
                leg_index=row.leg_index,
                miles_into_leg=row.miles_into_leg,
                distance_miles=row.distance_miles,
                note=row.note,
            )
        )
        if index == 0:
            schedule.start = row.start
        schedule.end = row.end
    from hos.models import HosStateSnapshot

    driving = sum(
        a.duration_hours for a in schedule.activities if a.duty_status.value == "DRIVING"
    )
    onduty = sum(
        a.duration_hours
        for a in schedule.activities
        if a.duty_status.value in ("DRIVING", "ON_DUTY_NOT_DRIVING")
    )
    schedule.total_driving_hours = driving
    schedule.total_on_duty_hours = onduty
    schedule.total_distance_miles = (
        trip.route.distance_miles if hasattr(trip, "route") else 0.0
    )
    schedule.hos = HosStateSnapshot(
        cycle_used_before=trip.current_cycle_used,
        cycle_planned=onduty,
        cycle_remaining_after=max(0.0, 70.0 - trip.current_cycle_used - onduty),
        driving_used_in_period=driving,
        driving_remaining_in_period=max(0.0, 11.0 - driving),
        window_used_hours=0.0,
        window_remaining_hours=0.0,
        minutes_since_last_break=None,
        next_break_in_hours=None,
        next_rest_hours=10.0,
        restart_used="RESTART_34H" in [
            a.activity_type for a in ScheduledActivity.objects.filter(trip=trip)
        ],
        driving_total_hours=driving,
        on_duty_total_hours=onduty,
    )
    return schedule


# ----------------------------------------------------------------------
# Views
# ----------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([AllowAny])
def plan_trip(request):
    """POST /api/trips/plan/ — full planning pipeline."""
    serializer = TripPlanInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        payload = TripPlanner().plan(_input_to_dataclass(serializer))
    except TripPlanningError as exc:
        return _planning_error_response(exc)
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def validate_trip(request):
    """
    POST /api/trips/validate/ — dry-run: geocode + route + schedule +
    validate WITHOUT persisting anything or rendering logs.
    """
    serializer = TripPlanInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _input_to_dataclass(serializer)

    planner = TripPlanner()
    try:
        current = planner._geocode(data.current_location, "current location")
        pickup = planner._geocode(data.pickup_location, "pickup location")
        dropoff = planner._geocode(data.dropoff_location, "dropoff location")

        from datetime import datetime as dt
        from zoneinfo import ZoneInfo

        from routing.us_states import timezone_for_state
        from trips.services import DEFAULT_START_TIME

        tz_name = data.timezone or timezone_for_state(current.state, "America/Chicago")
        tzinfo = ZoneInfo(tz_name)
        start_time = data.start_time or DEFAULT_START_TIME
        start_date = data.start_date or dj_tz.localdate()
        start_local = dt.combine(start_date, start_time).replace(tzinfo=tzinfo)

        leg_results = [planner._route(current, pickup), planner._route(pickup, dropoff)]
        endpoints = [
            planner._triplet(current),
            planner._triplet(pickup),
            planner._triplet(dropoff),
        ]
        legs = [
            RouteLeg(
                start=GeoPoint(
                    name=endpoints[i][0], lat=endpoints[i][1], lon=endpoints[i][2]
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
        schedule = generate_schedule(
            legs, data.current_cycle_used, start_local, SchedulerConfig()
        )
    except TripPlanningError as exc:
        return _planning_error_response(exc)

    violations = validate_schedule(schedule, data.current_cycle_used)
    errors = [v for v in violations if v["severity"] == "error"]
    hos = schedule.hos
    return Response(
        {
            "schedulable": not errors,
            "violations": violations,
            "message": "Trip can be scheduled legally under the specified HOS rules."
            if not errors
            else "Trip scheduling produced HOS violations (see violations).",
            "hos_summary": {
                "cycle_used_before": round(hos.cycle_used_before, 2),
                "cycle_planned": round(hos.cycle_planned, 2),
                "cycle_remaining_after": round(hos.cycle_remaining_after, 2),
                "total_driving_hours": round(schedule.total_driving_hours, 2),
                "total_on_duty_hours": round(schedule.total_on_duty_hours, 2),
                "restart_used": schedule.restart_used,
            },
            "route": {
                "distance_miles": round(schedule.total_distance_miles, 1),
                "duration_hours": round(
                    sum(r.duration_hours for r in leg_results), 2
                ),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_detail(request, trip_id: int):
    """GET /api/trips/{id}/ — stored trip with route, schedule, summary."""
    trip = _get_trip(trip_id)
    try:
        route = trip.route
    except Route.DoesNotExist:
        return Response(
            {"error": "Route data for this trip is unavailable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    activities = [
        {
            "seq": row.seq,
            "type": row.activity_type,
            "duty_status": row.duty_status,
            "start": row.start.isoformat(),
            "end": row.end.isoformat(),
            "duration_minutes": round(row.duration_minutes, 1),
            "distance_miles": round(row.distance_miles, 1),
            "location": row.location_name or "En route",
            "lat": row.lat,
            "lon": row.lon,
            "note": row.note,
            "leg_index": row.leg_index,
        }
        for row in ScheduledActivity.objects.filter(trip=trip).order_by("seq")
    ]
    logs = [
        {
            "day_number": log.day_number,
            "date": log.date.isoformat(),
            "off_duty_hours": round(log.off_duty_hours, 2),
            "sleeper_hours": round(log.sleeper_hours, 2),
            "driving_hours": round(log.driving_hours, 2),
            "on_duty_hours": round(log.on_duty_hours, 2),
            "total_hours": 24.0,
            "miles": round(log.miles, 1),
            "remarks": [
                {"time": t[11:16], "text": text} for t, text in log.remarks
            ],
            "image_url": f"/media/{log.rendered_file}",
        }
        for log in DailyLog.objects.filter(trip=trip).order_by("day_number")
    ]
    markers = [
        {
            "type": row.activity_type,
            "label": row.get_activity_type_display()
            if hasattr(row, "get_activity_type_display")
            else row.activity_type,
            "location": row.location_name or "En route",
            "lat": row.lat,
            "lon": row.lon,
            "arrival": row.start.isoformat(),
            "departure": row.end.isoformat(),
            "duration_minutes": round(row.duration_minutes, 1),
            "note": row.note,
        }
        for row in ScheduledActivity.objects.filter(trip=trip)
        .exclude(activity_type__in=["DRIVING", "OFF_DUTY", "REST_BREAK"])
        .exclude(lat__isnull=True)
        .order_by("seq")
    ]
    return Response(
        {
            "trip": {
                "id": trip.pk,
                "current_location": trip.current_location,
                "pickup_location": trip.pickup_location,
                "dropoff_location": trip.dropoff_location,
                "current_cycle_used": trip.current_cycle_used,
                "start_datetime": trip.start_datetime.isoformat()
                if trip.start_datetime
                else None,
                "assumed_start_time": trip.assumed_start_time,
                "home_terminal_timezone": trip.home_terminal_timezone,
                "driver_name": trip.driver_name or "Not provided",
                "carrier_name": trip.carrier_name or "Not provided",
                "truck_number": trip.truck_number or "Not provided",
                "trailer_number": trip.trailer_number or "Not provided",
                "main_office": trip.main_office or "Not provided",
                "co_driver": trip.co_driver or "",
                "created_at": trip.created_at.isoformat(),
            },
            "route": {
                "distance_miles": round(route.distance_miles, 1),
                "duration_hours": round(route.duration_hours, 2),
                "geometry": route.geometry,
                "legs": route.legs,
                "provider": route.provider,
            },
            "schedule": {
                "activities": activities,
                "restart_used": any(
                    a["type"] == "RESTART_34H" for a in activities
                ),
            },
            "markers": markers,
            "logs": logs,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_logs(request, trip_id: int):
    trip = _get_trip(trip_id)
    logs = DailyLog.objects.filter(trip=trip).order_by("day_number")
    return Response(
        {
            "trip_id": trip.pk,
            "count": logs.count(),
            "logs": [
                {
                    "day_number": log.day_number,
                    "date": log.date.isoformat(),
                    "off_duty_hours": round(log.off_duty_hours, 2),
                    "sleeper_hours": round(log.sleeper_hours, 2),
                    "driving_hours": round(log.driving_hours, 2),
                    "on_duty_hours": round(log.on_duty_hours, 2),
                    "total_hours": 24.0,
                    "miles": round(log.miles, 1),
                    "image_url": f"/media/{log.rendered_file}",
                }
                for log in logs
            ],
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_log_detail(request, trip_id: int, day: int):
    trip = _get_trip(trip_id)
    try:
        log = DailyLog.objects.get(trip=trip, day_number=day)
    except DailyLog.DoesNotExist:
        return Response(
            {"error": f"Day {day} log was not found for this trip."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {
            "trip_id": trip.pk,
            "day_number": log.day_number,
            "date": log.date.isoformat(),
            "off_duty_hours": round(log.off_duty_hours, 2),
            "sleeper_hours": round(log.sleeper_hours, 2),
            "driving_hours": round(log.driving_hours, 2),
            "on_duty_hours": round(log.on_duty_hours, 2),
            "total_hours": 24.0,
            "miles": round(log.miles, 1),
            "remarks": [{"time": t[11:16], "text": text} for t, text in log.remarks],
            "image_url": f"/media/{log.rendered_file}",
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_log_image(request, trip_id: int, day: int):
    trip = _get_trip(trip_id)
    try:
        log = DailyLog.objects.get(trip=trip, day_number=day)
    except DailyLog.DoesNotExist:
        return Response(
            {"error": f"Day {day} log was not found for this trip."},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not log.rendered_file:
        return Response(
            {"error": "This log has no rendered image."}, status=404
        )
    path = Path(settings.MEDIA_ROOT) / log.rendered_file
    if not path.exists():
        return Response(
            {"error": "Rendered log file is missing; please re-plan the trip."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return FileResponse(path.open("rb"), content_type="image/png")


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_logs_pdf(request, trip_id: int):
    """GET /api/trips/{id}/logs/pdf/ — all daily logs in one PDF."""
    trip = _get_trip(trip_id)
    logs = list(DailyLog.objects.filter(trip=trip).order_by("day_number"))
    if not logs:
        return Response(
            {"error": "No daily logs exist for this trip."},
            status=status.HTTP_404_NOT_FOUND,
        )
    images = []
    for log in logs:
        path = Path(settings.MEDIA_ROOT) / log.rendered_file
        if path.exists():
            from PIL import Image

            images.append(Image.open(path).convert("RGB"))
    if not images:
        return Response(
            {"error": "Rendered log files are missing; please re-plan the trip."},
            status=status.HTTP_404_NOT_FOUND,
        )
    pdf_path = Path(settings.MEDIA_ROOT) / f"trips/{trip.pk}/daily_logs.pdf"
    images_to_pdf(images, pdf_path)
    response = FileResponse(pdf_path.open("rb"), content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="trip_{trip.pk}_daily_logs.pdf"'
    )
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_route(request, trip_id: int):
    trip = _get_trip(trip_id)
    try:
        route = trip.route
    except Route.DoesNotExist:
        return Response(
            {"error": "Route data for this trip is unavailable."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {
            "trip_id": trip.pk,
            "distance_miles": round(route.distance_miles, 1),
            "duration_hours": round(route.duration_hours, 2),
            "geometry": route.geometry,
            "legs": route.legs,
            "provider": route.provider,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def geocode(request):
    """GET /api/geocode/?q=... — geocoding helper (cached, throttled)."""
    serializer = GeocodeQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    planner = TripPlanner()
    try:
        result = planner.geocoder.geocode(serializer.validated_data["q"])
    except TripPlanningError as exc:
        return _planning_error_response(exc)
    return Response(
        {
            "query": result.query,
            "lat": result.lat,
            "lon": result.lon,
            "display_name": result.display_name,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response(
        {
            "status": "ok",
            "services": {
                "geocoder": GEOCODING_API_URL,
                "router": ROUTING_API_URL,
            },
            "hos_rules": {
                "cycle": "70 hours / 8 days",
                "driving_limit": "11 hours",
                "driving_window": "14 hours",
                "break": "30 minutes after 8 cumulative driving hours",
                "reset": "10 consecutive hours off duty",
                "restart": "34 hours (automatic, explicit)",
            },
        }
    )
