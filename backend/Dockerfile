FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg (gcc, libpq) and Pillow (libjpeg, zlib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies before copying source (better layer cache)
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -e "."

# Copy application source
COPY . .

# Fallback version string for /api/v1/health.
# In production, hosting providers can expose commit metadata at runtime.
ENV APP_VERSION=unknown

# Health check — called after deployment before traffic is routed.
# Timeout generous enough to let the DB probe finish its retries on cold start.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c \
        "import urllib.request, sys; \
         r = urllib.request.urlopen('http://localhost:${PORT:-8000}/api/v1/health'); \
         sys.exit(0 if r.status == 200 else 1)"

# Entrypoint: run migrations then start the server.
# 'exec' replaces the shell so uvicorn receives SIGTERM directly.
CMD set -e \
    && alembic upgrade head \
    && exec uvicorn main:app \
        --host 0.0.0.0 \
        --port "${PORT:-8000}" \
        --workers 1 \
        --loop uvloop \
        --http httptools
