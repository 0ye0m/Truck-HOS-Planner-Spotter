"""
URL configuration for the HOS Planner backend.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("trips.urls")),
]


# ------------------------------------------------------------------
# Media files
#
# Generated ELD log images and PDFs are stored under MEDIA_ROOT
# and exposed through MEDIA_URL.
#
# This is required for the deployed application as well as
# local development.
# ------------------------------------------------------------------------

urlpatterns += static(
    settings.MEDIA_URL,
    document_root=settings.MEDIA_ROOT,
)