"""Views for serving generated ELD media stored in the database."""

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from trips.models import RenderedMedia


@api_view(["GET"])
@permission_classes([AllowAny])
def rendered_media(request, filename):
    """
    Serve a generated ELD file directly from PostgreSQL.

    Example:
        /api/media/trips/7/log_day_1.png
    """

    try:
        media = RenderedMedia.objects.get(name=filename)
    except RenderedMedia.DoesNotExist:
        return Response(
            {"error": "Generated file was not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    response = HttpResponse(
        bytes(media.content),
        content_type=media.content_type,
    )

    response["Cache-Control"] = "public, max-age=31536000, immutable"

    return response