#!/usr/bin/env bash
set -euo pipefail

echo "==> Iniciando Uvicorn..."
exec uvicorn main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --loop uvloop \
  --http httptools \
  --proxy-headers \
  --forwarded-allow-ips="*"
