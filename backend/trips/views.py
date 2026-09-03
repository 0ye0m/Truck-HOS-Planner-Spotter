"""REST API endpoints.

Endpoints
---------
POST /api/trips/plan/               Plan a trip (full pipeline)
POST /api/trips/validate/           Dry-run feasibility check
GET  /api/trips/{id}/               Stored trip detail
GET  /api/trips/{id}/logs/         Daily logs list
GET  /api/trips/{id}/logs/{day}/   One daily log
GET  /api/trips/{id}/logs/{day}/image/
                                    Rendered PNG
GET  /api/trips/{id}/logs/pdf/     All logs as one PDF
GET  /api/trips/{id}/route/        Route detail
GET  /api/geocode/?q=...           Geocoding helper
GET  /api/geocode/suggest/?q=...   Live US place suggestions
GET  /api/health/                  Health check
"""

from __future__ import annotations

import io
import logging
from zoneinfo import ZoneInfo

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from config.settings import GEOCODING_API_URL, ROUTING_API_URL
from hos import validate_schedule
from routing.geocoder import Geocoder, GeocodingError
from routing.suggest import suggest_places
from trips.models import (
    DailyLog,
    RenderedMedia,
    Route,
    ScheduledActivity,
    Trip,
)
from trips.serializers import (
    GeocodeQuerySerializer,
    SuggestQuerySerializer,
    TripPlanInputSerializer,
)
from trips.services import (
    TripInput,
    TripPlanningError,
    TripPlanner,
)

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _input_to_dataclass(serializer) -> TripInput:
    """Convert validated serializer data into TripInput."""

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


def _planning_error_response(
    exc: TripPlanningError,
) -> Response:
    """Convert planning errors into safe HTTP responses."""

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
        {
            "error": exc.message,
            "code": exc.code,
        },
        status=mapping.get(
            exc.code,
            status.HTTP_400_BAD_REQUEST,
        ),
    )


def _get_trip(trip_id: int) -> Trip:
    """Fetch a trip or raise a DRF validation error."""

    try:
        return Trip.objects.get(pk=trip_id)
    except Trip.DoesNotExist:
        raise ValidationError(
            {
                "error": f"Trip {trip_id} was not found.",
            }
        )


def _home_tz_iso(
    value,
    tz_name: str,
) -> str | None:
    """
    Return an ISO datetime expressed in the trip's home-terminal
    timezone.

    Stored rows are UTC; API responses use the trip's home-terminal
    timezone consistently.
    """

    if value is None:
        return None

    try:
        return value.astimezone(
            ZoneInfo(tz_name)
        ).isoformat()
    except Exception:
        return value.isoformat()


def _get_rendered_media(
    filename: str,
) -> RenderedMedia | None:
    """Return a generated media record by its logical filename."""

    if not filename:
        return None

    try:
        return RenderedMedia.objects.get(
            name=filename
        )
    except RenderedMedia.DoesNotExist:
        return None


# ----------------------------------------------------------------------
# Views
# ----------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([AllowAny])
def plan_trip(request):
    """POST /api/trips/plan/ — full planning pipeline."""

    serializer = TripPlanInputSerializer(
        data=request.data
    )
    serializer.is_valid(
        raise_exception=True
    )

    try:
        payload = TripPlanner().plan(
            _input_to_dataclass(serializer)
        )
    except TripPlanningError as exc:
        return _planning_error_response(exc)

    return Response(
        payload,
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def validate_trip(request):
    """
    POST /api/trips/validate/ — dry-run.

    Performs:

        geocode → route → schedule → validation

    without persisting anything or rendering logs.

    Uses exactly the same preparation stage as /plan/.
    """

    serializer = TripPlanInputSerializer(
        data=request.data
    )
    serializer.is_valid(
        raise_exception=True
    )

    data = _input_to_dataclass(serializer)

    try:
        prepared = TripPlanner().prepare(data)
    except TripPlanningError as exc:
        return _planning_error_response(exc)

    schedule = prepared.schedule

    violations = validate_schedule(
        schedule,
        data.current_cycle_used,
    )

    errors = [
        violation
        for violation in violations
        if violation["severity"] == "error"
    ]

    hos = schedule.hos

    return Response(
        {
            "schedulable": not errors,
            "violations": violations,
            "message": (
                "Trip can be scheduled legally under "
                "the specified HOS rules."
                if not errors
                else (
                    "Trip scheduling produced HOS violations "
                    "(see violations)."
                )
            ),
            "hos_summary": {
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
                "total_driving_hours": round(
                    schedule.total_driving_hours,
                    2,
                ),
                "total_on_duty_hours": round(
                    schedule.total_on_duty_hours,
                    2,
                ),
                "restart_used": schedule.restart_used,
            },
            "route": {
                "distance_miles": round(
                    schedule.total_distance_miles,
                    1,
                ),
                "duration_hours": round(
                    sum(
                        result.duration_hours
                        for result in prepared.leg_results
                    ),
                    2,
                ),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_detail(
    request,
    trip_id: int,
):
    """GET /api/trips/{id}/ — stored trip detail."""

    trip = _get_trip(trip_id)

    try:
        route = trip.route
    except Route.DoesNotExist:
        return Response(
            {
                "error": (
                    "Route data for this trip is unavailable."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    activities = [
        {
            "seq": row.seq,
            "type": row.activity_type,
            "duty_status": row.duty_status,
            "start": _home_tz_iso(
                row.start,
                trip.home_terminal_timezone,
            ),
            "end": _home_tz_iso(
                row.end,
                trip.home_terminal_timezone,
            ),
            "duration_minutes": round(
                row.duration_minutes,
                1,
            ),
            "distance_miles": round(
                row.distance_miles,
                1,
            ),
            "location": (
                row.location_name
                or "En route"
            ),
            "lat": row.lat,
            "lon": row.lon,
            "note": row.note,
            "leg_index": row.leg_index,
        }
        for row in ScheduledActivity.objects.filter(
            trip=trip
        ).order_by("seq")
    ]

    logs = [
        {
            "day_number": log.day_number,
            "date": log.date.isoformat(),
            "off_duty_hours": round(
                log.off_duty_hours,
                2,
            ),
            "sleeper_hours": round(
                log.sleeper_hours,
                2,
            ),
            "driving_hours": round(
                log.driving_hours,
                2,
            ),
            "on_duty_hours": round(
                log.on_duty_hours,
                2,
            ),
            "total_hours": 24.0,
            "miles": round(
                log.miles,
                1,
            ),
            "remarks": [
                {
                    "time": t[11:16],
                    "text": text,
                }
                for t, text in log.remarks
            ],
            "image_url": (
                f"/api/media/{log.rendered_file}"
                if log.rendered_file
                else None
            ),
        }
        for log in DailyLog.objects.filter(
            trip=trip
        ).order_by("day_number")
    ]

    markers = [
        {
            "type": row.activity_type,
            "label": (
                row.get_activity_type_display()
                if hasattr(
                    row,
                    "get_activity_type_display",
                )
                else row.activity_type
            ),
            "location": (
                row.location_name
                or "En route"
            ),
            "lat": row.lat,
            "lon": row.lon,
            "arrival": _home_tz_iso(
                row.start,
                trip.home_terminal_timezone,
            ),
            "departure": _home_tz_iso(
                row.end,
                trip.home_terminal_timezone,
            ),
            "duration_minutes": round(
                row.duration_minutes,
                1,
            ),
            "note": row.note,
        }
        for row in ScheduledActivity.objects.filter(
            trip=trip
        )
        .exclude(
            activity_type__in=[
                "DRIVING",
                "OFF_DUTY",
                "REST_BREAK",
            ]
        )
        .exclude(
            lat__isnull=True
        )
        .order_by("seq")
    ]

    return Response(
        {
            "trip": {
                "id": trip.pk,
                "current_location": trip.current_location,
                "pickup_location": trip.pickup_location,
                "dropoff_location": trip.dropoff_location,
                "current_cycle_used": (
                    trip.current_cycle_used
                ),
                "start_datetime": (
                    trip.start_datetime.isoformat()
                    if trip.start_datetime
                    else None
                ),
                "assumed_start_time": (
                    trip.assumed_start_time
                ),
                "home_terminal_timezone": (
                    trip.home_terminal_timezone
                ),
                "driver_name": (
                    trip.driver_name
                    or "Not provided"
                ),
                "carrier_name": (
                    trip.carrier_name
                    or "Not provided"
                ),
                "truck_number": (
                    trip.truck_number
                    or "Not provided"
                ),
                "trailer_number": (
                    trip.trailer_number
                    or "Not provided"
                ),
                "main_office": (
                    trip.main_office
                    or "Not provided"
                ),
                "co_driver": (
                    trip.co_driver
                    or ""
                ),
                "created_at": (
                    trip.created_at.isoformat()
                ),
            },
            "route": {
                "distance_miles": round(
                    route.distance_miles,
                    1,
                ),
                "duration_hours": round(
                    route.duration_hours,
                    2,
                ),
                "geometry": route.geometry,
                "legs": route.legs,
                "provider": route.provider,
            },
            "schedule": {
                "start": (
                    activities[0]["start"]
                    if activities
                    else None
                ),
                "end": (
                    activities[-1]["end"]
                    if activities
                    else None
                ),
                "activities": activities,
                "restart_used": any(
                    activity["type"] == "RESTART_34H"
                    for activity in activities
                ),
            },
            "markers": markers,
            "logs": logs,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_logs(
    request,
    trip_id: int,
):
    """GET /api/trips/{id}/logs/ — daily logs list."""

    trip = _get_trip(trip_id)

    logs = DailyLog.objects.filter(
        trip=trip
    ).order_by("day_number")

    return Response(
        {
            "trip_id": trip.pk,
            "count": logs.count(),
            "logs": [
                {
                    "day_number": log.day_number,
                    "date": log.date.isoformat(),
                    "off_duty_hours": round(
                        log.off_duty_hours,
                        2,
                    ),
                    "sleeper_hours": round(
                        log.sleeper_hours,
                        2,
                    ),
                    "driving_hours": round(
                        log.driving_hours,
                        2,
                    ),
                    "on_duty_hours": round(
                        log.on_duty_hours,
                        2,
                    ),
                    "total_hours": 24.0,
                    "miles": round(
                        log.miles,
                        1,
                    ),
                    "image_url": (
                        f"/api/media/{log.rendered_file}"
                        if log.rendered_file
                        else None
                    ),
                }
                for log in logs
            ],
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_log_detail(
    request,
    trip_id: int,
    day: int,
):
    """GET /api/trips/{id}/logs/{day}/ — one daily log."""

    trip = _get_trip(trip_id)

    try:
        log = DailyLog.objects.get(
            trip=trip,
            day_number=day,
        )
    except DailyLog.DoesNotExist:
        return Response(
            {
                "error": (
                    f"Day {day} log was not found "
                    f"for this trip."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(
        {
            "trip_id": trip.pk,
            "day_number": log.day_number,
            "date": log.date.isoformat(),
            "off_duty_hours": round(
                log.off_duty_hours,
                2,
            ),
            "sleeper_hours": round(
                log.sleeper_hours,
                2,
            ),
            "driving_hours": round(
                log.driving_hours,
                2,
            ),
            "on_duty_hours": round(
                log.on_duty_hours,
                2,
            ),
            "total_hours": 24.0,
            "miles": round(
                log.miles,
                1,
            ),
            "remarks": [
                {
                    "time": t[11:16],
                    "text": text,
                }
                for t, text in log.remarks
            ],
            "image_url": (
                f"/api/media/{log.rendered_file}"
                if log.rendered_file
                else None
            ),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_log_image(
    request,
    trip_id: int,
    day: int,
):
    """
    GET /api/trips/{id}/logs/{day}/image/

    Serve a rendered ELD PNG directly from PostgreSQL.
    """

    trip = _get_trip(trip_id)

    try:
        log = DailyLog.objects.get(
            trip=trip,
            day_number=day,
        )
    except DailyLog.DoesNotExist:
        return Response(
            {
                "error": (
                    f"Day {day} log was not found "
                    f"for this trip."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if not log.rendered_file:
        return Response(
            {
                "error": (
                    "This log has no rendered image."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    media = _get_rendered_media(
        log.rendered_file
    )

    if media is None:
        return Response(
            {
                "error": (
                    "Rendered log image is missing "
                    "from database; please re-plan "
                    "the trip."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return HttpResponse(
        bytes(media.content),
        content_type=(
            media.content_type
            or "image/png"
        ),
        headers={
            "Cache-Control": (
                "public, max-age=31536000, immutable"
            )
        },
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_logs_pdf(
    request,
    trip_id: int,
):
    """
    GET /api/trips/{id}/logs/pdf/

    Generate all daily ELD logs into a PDF entirely in memory.

    No PDF is written to Render's filesystem.
    """

    trip = _get_trip(trip_id)

    logs = list(
        DailyLog.objects.filter(
            trip=trip
        ).order_by("day_number")
    )

    if not logs:
        return Response(
            {
                "error": (
                    "No daily logs exist for this trip."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    from PIL import Image

    images = []

    for log in logs:
        if not log.rendered_file:
            continue

        media = _get_rendered_media(
            log.rendered_file
        )

        if media is None:
            continue

        try:
            image = Image.open(
                io.BytesIO(
                    bytes(media.content)
                )
            ).convert("RGB")

            images.append(image)

        except Exception:
            logger.exception(
                "Failed to decode rendered image %s",
                log.rendered_file,
            )

    if not images:
        return Response(
            {
                "error": (
                    "Rendered log files are missing; "
                    "please re-plan the trip."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    # --------------------------------------------------------------
    # Generate PDF entirely in memory.
    # --------------------------------------------------------------

    pdf_buffer = io.BytesIO()

    try:
        images[0].save(
            pdf_buffer,
            format="PDF",
            save_all=True,
            append_images=images[1:],
            resolution=200.0,
        )

        pdf_buffer.seek(0)

    finally:
        # PIL images are no longer needed after PDF generation.
        for image in images:
            try:
                image.close()
            except Exception:
                pass

    response = HttpResponse(
        pdf_buffer.getvalue(),
        content_type="application/pdf",
    )

    response["Content-Disposition"] = (
        f'attachment; filename="trip_{trip.pk}_daily_logs.pdf"'
    )

    response["Cache-Control"] = (
        "no-store, no-cache, must-revalidate"
    )

    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def trip_route(
    request,
    trip_id: int,
):
    """GET /api/trips/{id}/route/ — route detail."""

    trip = _get_trip(trip_id)

    try:
        route = trip.route
    except Route.DoesNotExist:
        return Response(
            {
                "error": (
                    "Route data for this trip is unavailable."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(
        {
            "trip_id": trip.pk,
            "distance_miles": round(
                route.distance_miles,
                1,
            ),
            "duration_hours": round(
                route.duration_hours,
                2,
            ),
            "geometry": route.geometry,
            "legs": route.legs,
            "provider": route.provider,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def geocode(request):
    """GET /api/geocode/?q=... — geocoding helper."""

    serializer = GeocodeQuerySerializer(
        data=request.query_params
    )
    serializer.is_valid(
        raise_exception=True
    )

    try:
        result = Geocoder().geocode(
            serializer.validated_data["q"]
        )
    except GeocodingError as exc:
        return _planning_error_response(
            TripPlanningError(
                exc.message,
                exc.kind,
            )
        )

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
    """
    GET /api/geocode/suggest/?q=...

    Live US place suggestions.

    Upstream failures degrade gracefully to an empty
    result list so autocomplete does not show an error.
    """

    serializer = SuggestQuerySerializer(
        data=request.query_params
    )
    serializer.is_valid(
        raise_exception=True
    )

    query = serializer.validated_data["q"]

    try:
        results = suggest_places(query)
    except Exception:
        logger.exception(
            "Suggestion endpoint unexpectedly failed for %r",
            query,
        )
        results = []

    return Response(
        {
            "query": query,
            "results": results,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """GET /api/health/ — backend health check."""

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
                "break": (
                    "30 minutes after 8 cumulative "
                    "driving hours"
                ),
                "reset": "10 consecutive hours off duty",
                "restart": (
                    "34 hours (automatic, explicit)"
                ),
            },
        }
    )