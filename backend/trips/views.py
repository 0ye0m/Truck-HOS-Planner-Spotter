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
    GET  /api/geocode/suggest/?q=...    live US place suggestions
    GET  /api/health/                   health check
"""

from __future__ import annotations

import logging
from pathlib import Path

from django.conf import settings
from django.http import FileResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from config.settings import GEOCODING_API_URL, ROUTING_API_URL
from eldlogs.pdf import images_to_pdf
from hos import validate_schedule
from routing.geocoder import Geocoder, GeocodingError
from routing.suggest import suggest_places
from trips.models import DailyLog, Route, ScheduledActivity, Trip
from trips.serializers import (
    GeocodeQuerySerializer,
    SuggestQuerySerializer,
    TripPlanInputSerializer,
)
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


def _home_tz_iso(value, tz_name: str) -> str:
    """ISO string of a stored datetime expressed in the trip's home-terminal
    time zone. Stored rows are UTC; the plan pipeline serves home-terminal
    times, so every endpoint must use the same convention (one source of
    truth — no contradictory timestamps between endpoints)."""
    if value is None:
        return None
    from zoneinfo import ZoneInfo

    try:
        return value.astimezone(ZoneInfo(tz_name)).isoformat()
    except Exception:
        return value.isoformat()


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

    Uses exactly the same preparation stage as /plan/ (TripPlanner.prepare),
    so the two endpoints can never drift apart.
    """
    serializer = TripPlanInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _input_to_dataclass(serializer)

    try:
        prepared = TripPlanner().prepare(data)
    except TripPlanningError as exc:
        return _planning_error_response(exc)

    schedule = prepared.schedule
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
                    sum(r.duration_hours for r in prepared.leg_results), 2
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
            "start": _home_tz_iso(row.start, trip.home_terminal_timezone),
            "end": _home_tz_iso(row.end, trip.home_terminal_timezone),
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
            "arrival": _home_tz_iso(row.start, trip.home_terminal_timezone),
            "departure": _home_tz_iso(row.end, trip.home_terminal_timezone),
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
                "start": activities[0]["start"] if activities else None,
                "end": activities[-1]["end"] if activities else None,
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
        if not log.rendered_file:
            continue  # log row exists but no rendered image was stored
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
    try:
        result = Geocoder().geocode(serializer.validated_data["q"])
    except GeocodingError as exc:
        # Unknown address / timeout / service unavailable — a structured,
        # user-facing error, never a 500.
        return _planning_error_response(TripPlanningError(exc.message, exc.kind))
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
def geocode_suggest(request):
    """GET /api/geocode/suggest/?q=... — live US place suggestions.

    Powers the frontend's real-time location picker. Autocomplete must
    never show an error banner, so every upstream failure degrades to an
    empty result list (the UI falls back to local matches + free text);
    only a malformed request itself returns 400.
    """
    serializer = SuggestQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    query = serializer.validated_data["q"]
    try:
        results = suggest_places(query)
    except Exception:  # pragma: no cover — suggest_places already guards
        logger.exception("Suggestion endpoint unexpectedly failed for %r", query)
        results = []
    return Response({"query": query, "results": results})


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
