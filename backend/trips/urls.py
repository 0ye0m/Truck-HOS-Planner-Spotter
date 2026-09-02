"""API URL routes."""

from django.urls import path

from trips import views

urlpatterns = [
    path("trips/plan/", views.plan_trip, name="trip-plan"),
    path("trips/validate/", views.validate_trip, name="trip-validate"),
    path("trips/<int:trip_id>/", views.trip_detail, name="trip-detail"),
    path("trips/<int:trip_id>/logs/", views.trip_logs, name="trip-logs"),
    path("trips/<int:trip_id>/logs/pdf/", views.trip_logs_pdf, name="trip-logs-pdf"),
    path("trips/<int:trip_id>/logs/<int:day>/", views.trip_log_detail, name="trip-log-detail"),
    path(
        "trips/<int:trip_id>/logs/<int:day>/image/",
        views.trip_log_image,
        name="trip-log-image",
    ),
    path("trips/<int:trip_id>/route/", views.trip_route, name="trip-route"),
    path("geocode/", views.geocode, name="geocode"),
    path("health/", views.health, name="health"),
]
