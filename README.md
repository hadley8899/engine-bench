# Engine Bench

A browser-based virtual engine workshop: build a fictional inline-four, start it, hear its firing pulses, inspect the moving cutaway and compare dyno curves. Vite/React/TypeScript handle the bench locally; Laravel provides accounts, personal/team workspaces, versioned builds and saved dyno history.

The engine is an experimental zero-dimensional model, not an engineering or tuning tool. See [the model notes](docs/SIMULATION.md), [verification evidence](docs/VERIFICATION.md) and [delivery plan](PLAN.md).

## Start development

Requires Docker Compose and Node.js 22.12+ (or a newer supported LTS). Host PHP and Composer are not required.

```bash
./scripts/setup.sh
cd frontend
npm run dev
```

Open `http://localhost:5175`. The bench works without signing in. The first setup creates missing local environment files, installs dependencies, creates the application key if needed and migrates the project's database. It preserves existing environments/data and does not seed accounts automatically. The frontend can also run on its own for guest simulation; accounts require the backend.

Default ports: frontend 5175, API 8002 and the Mailpit development inbox 8027. Root `.env` controls Compose names/ports/database settings; `frontend/.env` controls frontend branding, port and API proxy; `backend/.env` holds the backend application key/settings. Keep URLs and proxy ports aligned. MySQL and SMTP are not published to the host; the API and Mailpit bind to localhost. This Compose setup is for local development.

## Try the workshop

1. Press **Start engine**. It cranks, catches and idles. Use the throttle slider, hold **Space** outside a form field, or use a standard gamepad's **right trigger**.
2. Add dyno load or hold an RPM. **Ignition** cuts/restores combustion; **Hold starter** cranks with the dyno unloaded. A stalled engine can be restarted with **Start engine**, which explicitly releases load and RPM hold.
3. Choose Road/Sport or edit bore, stroke, compression, starter torque and advanced parameters. The editor estimates the torque needed to turn the engine over and warns if the starter stalls. **Stop & rebuild engine** applies geometry and conditions to physics, sound and 3D together. Until then, edits are marked unapplied.
4. Capture a **Baseline** with **Live pull** or **Quick test**. The former runs with sound and motion; the latter calculates silently in a worker. Change the capture slot to **Modified**, change one setting, rebuild and repeat the same procedure.
5. Compare torque/power curves and changed settings. Audition either snapshot at the same RPM/full throttle. Restore the baseline or previous build when needed.
6. Download/import a versioned JSON build recipe. Guest builds, pending valid edits and baseline/modified results survive navigation/reload in the same browser tab; they are not permanent server saves.

Slow-motion inspection is a separate 15-RPM display mode and mutes sound. Select cylinders for pressure traces and enable/disable stroke colours. Automatic tests own throttle/RPM; emergency stop and hidden tabs abort active tests and retain incomplete results. A quick test is not a replay. Guided experiments are optional and do not lock any controls behind progress.

Sign in to use **Saved builds & runs**. Select your private personal workspace or a team, save the applied build, then save new revisions as you experiment. Save either comparison run, load historical revisions, or load saved results into Baseline/Modified. **Rerun into Modified** uses the saved engine, conditions and procedure. Saving an older run creates a build for its tested snapshot if necessary; retrying a run save reuses its original record. Results are labelled unverified.

Builds can add a turbocharger, a centrifugal or roots supercharger and an intercooler from the workshop's Forced induction section; the bench then shows boost, shaft speed and charge-air temperature. Knock is not modelled, so boost cannot damage an engine. Sharing, additional layouts, real-engine presets (including VW AXX), direct injection and detailed damage are later phases. Signing in does not discard the guest experiment; loading a server record is always explicit.

## Local account

```bash
docker compose exec backend php artisan db:seed
```

Optional demo login: `admin@example.test` / `password`. The repeatable seeder runs only in local/testing environments. Registration email is delivered to the local Mailpit inbox. Registration creates a private personal workspace; existing accounts receive one lazily on login. Existing team memberships are retained. You can switch workspaces or create a team in the bench library. Team members can read shared records; their author or a team administrator can add revisions or attach runs.

## Checks and diagnostics

```bash
# In frontend/:
npm run build
npm run lint
npm test
npm run schemas
npm run benchmark
npx playwright install chromium firefox
npm run test:browser
# From the project root:
docker compose exec -T backend php artisan test --compact
docker compose exec -T backend composer validate --strict
./scripts/test-storage-browser.sh
```

Backend tests use a separate database ending in `_test`; the bootstrap forces the testing connection and refuses main database names. Never run destructive migration/reset commands against the local account database or another project.

`npm run schemas` exports identical Zod JSON Schema definitions to `frontend/schemas/` and `backend/resources/schemas/` for Laravel validation. Storage requests are capped at 1 MiB; run samples are stored as one gzip blob capped at 256 KiB compressed (plus base64 storage overhead), with at most 5,000 samples. The Vitest suite checks geometry, flow, combustion, environment, start/stall/limiter, repeatability and dyno snapshots. Playwright exercises the real worker/AudioWorklet and offline PCM, live/quick agreement, editing, input validation, guest persistence and narrow layouts in Chromium/Firefox; the gamepad test emulates a standard controller input. The storage browser script starts a separate API on 8003 and Vite on 5180 against `engine_bench_browser_test`, runs real sign-in/revision/history/rerun checks, then stops the test API. It does not reset or seed the development database. The storage test is skipped in the default browser command. Performance measurements are hardware-specific; they are not a guarantee for every machine.

## Source map

- `frontend/src/sim`: versioned schemas, pure engine core, physical functions, dyno procedure and browser hosts.
- `frontend/src/bench`: audio lifecycle, procedural Three.js view, uPlot charts, guest session state and workshop UI.
- `frontend/tests`, `frontend/scripts`: browser regressions, JSON Schema export and performance measurements.
- `backend`: existing Laravel accounts, roles, sessions, mail, migrations, factories and tests.
- `docs`: model assumptions, reference review, measurements and acceptance evidence.

This project was created from `../project-base`. Use that separate repository for new generic applications; Engine Bench now contains product-specific code. Do not copy keys, local data, dependencies or Git history between them. Production hosting must serve frontend assets and proxy `/api` to Laravel (or configure an explicit API URL/CORS); deployment secrets remain outside version control.
