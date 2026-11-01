#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose -f docker-compose.yml -f compose.e2e.yml --profile test)
cleanup() { "${compose[@]}" stop backend-e2e; }
trap cleanup EXIT
"${compose[@]}" up -d --build backend-e2e
ready=false
for attempt in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8003/up >/dev/null; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then
  "${compose[@]}" logs --tail=40 backend-e2e
  exit 1
fi
BENCH_STORAGE_E2E=1 BENCH_URL=http://127.0.0.1:5180 FRONTEND_PORT=5180 API_PROXY_TARGET=http://127.0.0.1:8003 npm --prefix frontend run test:browser -- tests/storage.spec.ts "$@"
