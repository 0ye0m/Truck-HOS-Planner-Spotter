"""Request/response serializers with input validation."""

from __future__ import annotations

from rest_framework import serializers

from hos.constants import CYCLE_LIMIT_HOURS


class TripPlanInputSerializer(serializers.Serializer):
    """Validates POST /api/trips/plan/ and /api/trips/validate/ bodies."""

    current_location = serializers.CharField(max_length=512, trim_whitespace=True)
    pickup_location = serializers.CharField(max_length=512, trim_whitespace=True)
    dropoff_location = serializers.CharField(max_length=512, trim_whitespace=True)
    current_cycle_used = serializers.FloatField(min_value=0)

    start_date = serializers.DateField(required=False, allow_null=True)
    start_time = serializers.TimeField(required=False, allow_null=True)

    driver_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    carrier_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    truck_number = serializers.CharField(
        max_length=128, required=False, allow_blank=True, default=""
    )
    trailer_number = serializers.CharField(
        max_length=128, required=False, allow_blank=True, default=""
    )
    main_office = serializers.CharField(
        max_length=512, required=False, allow_blank=True, default=""
    )
    co_driver = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    timezone = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )

    def validate_current_cycle_used(self, value: float) -> float:
        if value > CYCLE_LIMIT_HOURS:
            raise serializers.ValidationError(
                f"Current cycle used cannot exceed {CYCLE_LIMIT_HOURS:.0f} hours "
                "(70-hour / 8-day property-carrier cycle)."
            )
        return value

    def validate_current_location(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Current location must not be empty.")
        return value

    def validate_pickup_location(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Pickup location must not be empty.")
        return value

    def validate_dropoff_location(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Dropoff location must not be empty.")
        return value


class GeocodeQuerySerializer(serializers.Serializer):
    q = serializers.CharField(max_length=512, trim_whitespace=True)


class SuggestQuerySerializer(serializers.Serializer):
    """Live-autocomplete query: at least 2 chars so single keystrokes never
    hit the network, capped to keep URLs sane."""

    q = serializers.CharField(min_length=2, max_length=200, trim_whitespace=True)
