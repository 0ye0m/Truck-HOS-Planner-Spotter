"""
Django settings for the Truck Route + HOS Planner backend.

Environment driven: copy .env.example to .env and adjust.
"""

import os
from pathlib import Path
from datetime import timedelta

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0").split(",")
    if h.strip()
]

# ------------------------------------------------------------------
# Application definition
# ------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "corsheaders",
    # Local apps
    "trips",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ------------------------------------------------------------------
# Database (SQLite for development; set DATABASE_URL for PostgreSQL in prod)
# ------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", "")

if DATABASE_URL.startswith("postgres"):
    import urllib.parse as urlparse

    parsed = urlparse.urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": parsed.username or "",
            "PASSWORD": parsed.password or "",
            "HOST": parsed.hostname or "",
            "PORT": parsed.port or 5432,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# ------------------------------------------------------------------
# DRF
# ------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "EXCEPTION_HANDLER": "trips.exceptions.api_exception_handler",
}

# ------------------------------------------------------------------
# CORS / CSRF
# ------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if o.strip()
]
CORS_ALLOW_ALL_ORIGINS = os.getenv("CORS_ALLOW_ALL_ORIGINS", "0") == "1"
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# ------------------------------------------------------------------
# External free map services (OpenStreetMap stack)
# ------------------------------------------------------------------

GEOCODING_API_URL = os.getenv(
    "GEOCODING_API_URL", "https://nominatim.openstreetmap.org"
)
ROUTING_API_URL = os.getenv("ROUTING_API_URL", "https://router.project-osrm.org")
# Public Nominatim policy: max 1 request/second, identify yourself.
GEOCODING_USER_AGENT = os.getenv(
    "GEOCODING_USER_AGENT", "TruckHOSPlanner/1.0 (full-stack assessment project)"
)
GEOCODING_MIN_INTERVAL_SECONDS = float(os.getenv("GEOCODING_MIN_INTERVAL_SECONDS", "1.1"))
GEOCODING_TIMEOUT_SECONDS = float(os.getenv("GEOCODING_TIMEOUT_SECONDS", "10"))
ROUTING_TIMEOUT_SECONDS = float(os.getenv("ROUTING_TIMEOUT_SECONDS", "20"))

# ------------------------------------------------------------------
# Static / media (rendered ELD log images + PDFs)
# ------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
        if not DEBUG
        else "django.contrib.staticfiles.storage.StaticFilesStorage"
    },
}
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

TIME_ZONE = "America/Chicago"
USE_TZ = True

LANGUAGE_CODE = "en-us"
USE_I18N = True
