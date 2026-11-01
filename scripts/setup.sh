#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for target in .env backend/.env frontend/.env; do
  if [ ! -f "$target" ]; then
    cp "$target.example" "$target"
  fi
done
docker compose up -d --build backend mailpit
(cd frontend && npm ci)
printf '\nReady. Start the frontend with: cd frontend && npm run dev\n'
printf 'Optional demo account: docker compose exec backend php artisan db:seed\n'
