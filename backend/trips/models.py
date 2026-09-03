"""Database models: trips, routes, canonical schedule activities, daily logs."""

from __future__ import annotations

from django.db import models


class GeocodeCache(models.Model):
    """Cache for Nominatim lookups (respects public API usage policies)."""

    query = models.CharField(max_length=512, unique=True)
    lat = models.FloatField(null=True, blank=True)
    lon = models.FloatField(null=True, blank=True)
    display_name = models.CharField(max_length=512, blank=True, default="")
    city = models.CharField(max_length=255, blank=True, default="")
    state = models.CharField(max_length=255, blank=True, default="")
    found = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return f"GeocodeCache({self.query!r})"


class Trip(models.Model):
    """One trip-planning request plus optional advanced info."""

    current_location = models.CharField(max_length=512)
    pickup_location = models.CharField(max_length=512)
    dropoff_location = models.CharField(max_length=512)
    current_cycle_used = models.FloatField()

    start_date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    start_datetime = models.DateTimeField(null=True, blank=True)
    home_terminal_timezone = models.CharField(max_length=64, default="America/Chicago")
    assumed_start_time = models.BooleanField(default=True)

    driver_name = models.CharField(max_length=255, blank=True, default="")
    carrier_name = models.CharField(max_length=255, blank=True, default="")
    truck_number = models.CharField(max_length=128, blank=True, default="")
    trailer_number = models.CharField(max_length=128, blank=True, default="")
    main_office = models.CharField(max_length=512, blank=True, default="")
    co_driver = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Trip #{self.pk}: {self.current_location} → {self.dropoff_location}"


class Route(models.Model):
    """Routing result for a trip (OSRM), stored with geometry + legs."""

    trip = models.OneToOneField(Trip, on_delete=models.CASCADE, related_name="route")
    distance_miles = models.FloatField()
    duration_hours = models.FloatField()
    geometry = models.JSONField(default=list)      # [(lat, lon), ...]
    legs = models.JSONField(default=list)          # per-leg data + steps
    provider = models.CharField(max_length=64, default="OSRM")

    def __str__(self) -> str:
        return f"Route for trip #{self.trip_id}: {self.distance_miles:.1f} mi"


class ScheduledActivity(models.Model):
    """One activity of the canonical schedule (single source of truth)."""

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="activities")
    seq = models.PositiveIntegerField()
    activity_type = models.CharField(max_length=32)
    duty_status = models.CharField(max_length=32)
    start = models.DateTimeField()
    end = models.DateTimeField()
    duration_minutes = models.FloatField()
    distance_miles = models.FloatField(default=0.0)
    lat = models.FloatField(null=True, blank=True)
    lon = models.FloatField(null=True, blank=True)
    location_name = models.CharField(max_length=512, blank=True, default="")
    note = models.CharField(max_length=512, blank=True, default="")
    leg_index = models.IntegerField(default=-1)
    miles_into_leg = models.FloatField(default=0.0)

    class Meta:
        ordering = ["seq"]
        unique_together = [("trip", "seq")]

    def __str__(self) -> str:
        return f"#{self.seq} {self.activity_type} {self.start:%m-%d %H:%M}"


class DailyLog(models.Model):
    """One rendered daily log sheet (24-hour ELD grid)."""

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="daily_logs")
    date = models.DateField()
    day_number = models.PositiveIntegerField()

    off_duty_hours = models.FloatField(default=0.0)
    sleeper_hours = models.FloatField(default=0.0)
    driving_hours = models.FloatField(default=0.0)
    on_duty_hours = models.FloatField(default=0.0)
    miles = models.FloatField(default=0.0)
    remarks = models.JSONField(default=list)       # [[time, text], ...]

    rendered_file = models.CharField(max_length=512, blank=True, default="")

    class Meta:
        ordering = ["day_number"]
        unique_together = [("trip", "day_number")]

    def __str__(self) -> str:
        return f"Day {self.day_number} log for trip #{self.trip_id} ({self.date})"


class RenderedMedia(models.Model):
    """Generated ELD files stored in PostgreSQL."""

    name = models.CharField(max_length=512, unique=True)
    content = models.BinaryField()
    content_type = models.CharField(max_length=100, default="application/octet-stream")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name