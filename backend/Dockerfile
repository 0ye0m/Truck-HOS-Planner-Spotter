# ── TruckHOS Planner — Django backend image ────────────────────────
# Production-grade single image: deps + collectstatic + gunicorn.
# Migrations run at container start (see CMD) so the DB schema is
# always current before the app accepts traffic.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=0 \
    DJANGO_SECRET_KEY=change-me-in-production

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Static files (WhiteNoise manifest storage — DEBUG=0 is set above)
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# Apply migrations, then serve with gunicorn
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120"]
