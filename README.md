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

1. Press **Start engine**. It cranks, catches and idles. Use the throttle slider, hold **Space** outside a form field, or use a standard gamepad's **right trigger**. The tachometer and gauges beside the engine show speed, boost or manifold pressure, mixture, coolant and exhaust temperature.
2. Add dyno load or hold an RPM, or turn on **Road load** to drive a car through a six-speed gearbox (Q / E to change gear). **Ignition** cuts/restores combustion; **Hold starter** cranks with the dyno unloaded. A stalled engine can be restarted with **Start engine**, which explicitly releases load, RPM hold and road load.
3. Choose a starting build (Road, Sport, Turbo hot hatch, Torquey long-stroke or Screaming 9k) or edit bore, stroke, compression, starter torque and advanced parameters. The editor estimates the torque needed to turn the engine over and warns if the starter stalls. **Stop & rebuild engine** applies geometry and conditions to physics, sound and 3D together. Until then, edits are marked unapplied. Turn on **Live updates** to apply valid edits to the running engine as you make them instead; speed, throttle and load carry over, and the setting is remembered in this browser.
4. Capture a **Baseline** with **Live pull** or **Quick test**. The former runs with sound and motion and draws its curve as it goes; the latter calculates silently in a worker while the engine idles. After a Baseline the capture slot moves to **Modified**, and the bench asks before any test replaces a captured run. Change one setting, rebuild and repeat the same procedure.
5. Compare torque/power curves, the pull summary (peaks, change against Baseline and mean power over an RPM band) and changed settings. Power can be shown in kW, hp or PS and torque in Nm or lb·ft. Audition either snapshot at the same RPM/full throttle. Restore the baseline or previous build when needed.
6. Download/import a versioned JSON build recipe. Guest builds, pending valid edits and baseline/modified results survive navigation/reload in the same browser tab; they are not permanent server saves.

Slow-motion inspection is a separate 15-RPM display mode and mutes sound. Select cylinders for pressure traces and enable/disable stroke colours. Automatic tests own throttle/RPM; emergency stop and hidden tabs abort active tests and retain incomplete results. A quick test is not a replay. Guided experiments are optional and do not lock any controls behind progress.

Sign in to use **Saved builds & runs**. Select your private personal workspace or a team, save the applied build, then save new revisions as you experiment. Save either comparison run, load historical revisions, or load saved results into Baseline/Modified. **Rerun into Modified** uses the saved engine, conditions and procedure. Saving an older run creates a build for its tested snapshot if necessary; retrying a run save reuses its original record. Results are labelled unverified.

The **Exhaust & limiter** section sets header length, a 4-1 or 4-2-1 collector, catalyst, silencer (straight-through, absorptive or chambered) and system length. These shape the sound only; they do not change power in this model version. The limiter can cut fuel or spark: a spark cut lets fuel through unburned, which pops in a hot exhaust. **Listen from** the tailpipe, engine bay or test cell. Press **?** for keyboard shortcuts. `npm run sounds -- <folder>` (in `frontend/`) renders fixed scenarios to WAV files for listening checks.

Builds can add a turbocharger, a centrifugal or roots supercharger and an intercooler from the workshop's Forced induction section; the bench then shows boost, shaft speed and charge-air temperature. The Fuel system section chooses a carburettor, throttle-body, port or direct injection; the bench then shows mixture, air–fuel ratio, fuel flow and overrun-cut or misfire status. **Combustion & knock** chooses the fuel (RON 91, 95, 98 or E85), a fixed or predictive burn rate and ECU knock control. The bench shows each cylinder's knock index (100% = the end gas autoignites before the flame reaches it) and any ECU timing retard, and the pull summary says where a run knocked. Knock causes no damage yet. **Engine management** switches the build to ignition, target-λ and boost maps, edited in the Engine maps panel beside the bench; the cell nearest the running engine is outlined, and with Live updates on, edits reach it at once. The fuel system can **limit fuel delivery** by injector size, duty limit and pump capacity: an engine that outgrows its injectors goes lean and shows FUEL LIMITED. The cylinder strip also shows estimated exhaust gas, piston crown and exhaust valve temperatures for each cylinder, and the cutaway's pistons glow with heat. Running rich cools them, at a small cost in power. **Full reset** beside Reset bench returns everything to the Road build with fresh audio and simulation, keeping comparison runs and saved builds. Upgradeable parts and failures and famous real-engine presets (starting with the VW AXX 2.0 TFSI) are planned next; the 3D overhaul has begun with an industrial-cutaway material and geometry pass. Two-stroke engines (see `docs/TWO_STROKE.md`), other layouts and sharing remain planned; see `PLAN.md` for the order. Signing in does not discard the guest experiment; loading a server record is always explicit.

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
