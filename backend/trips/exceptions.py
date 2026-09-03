"""Central API exception handling: never leak tracebacks to clients."""
import logging

from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Return structured, user-friendly errors instead of raw tracebacks."""
    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled server error", exc_info=exc)
        return None
    detail = response.data
    if isinstance(detail, dict) and "detail" in detail:
        response.data = {"error": str(detail["detail"]), "code": response.status_code}
    else:
        response.data = {"error": detail, "code": response.status_code}
    return response
