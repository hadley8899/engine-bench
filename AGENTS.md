# Engine Bench — Agent Guide

## Purpose and source of truth

Engine Bench is a browser-based engine builder and test bench with configurable engine geometry, environmental controls, simulated audio, animated 3D and dyno results. Read `PLAN.md` and `README.md` before changing product behaviour. Keep the plan's progress and decisions consistent with the implementation.

The repository now includes the phase 1–3 inline-four simulation, guest bench and saved library. Read `docs/SIMULATION.md` for model assumptions and host decisions, and `docs/VERIFICATION.md` for actual evidence and remaining acceptance gates. Personal/team workspace storage and immutable run history are implemented. Forced induction (turbocharger, centrifugal and roots superchargers, intercooler) is implemented as a lumped model, and so are fuel systems (carburettor, throttle-body, port and direct injection with wall-film transport); see `docs/SIMULATION.md`. Stage 5 is implemented: synthesised exhaust/intake/mechanical/induction sound with exhaust systems, afterfire and listening positions (sound never changes the physics), fuel- or spark-cut limiters, gauges, pull summaries, display units, starting builds, keyboard shortcuts and optional road load; the user accepted the sound in a listening session. Stage 6 is in progress: model 1.6.0 adds fuel grades, an opt-in predictive burn rate (with runner residual), a per-cylinder end-gas knock estimate and optional ECU knock control; builds saved before 1.6.0 keep 1.5.0 results. Knock does not yet change cycle physics or cause damage. Engine-management maps, per-cylinder temperatures, upgradeable parts and failures (rest of Stage 6), famous real-engine presets (Stage 7), a 3D overhaul (Stage 8), two-stroke engines (Stage 9; see `docs/TWO_STROKE.md`) and other layouts remain planned work, in that order; see `PLAN.md`. Do not describe those as implemented.

## Architecture constraints

- Use TypeScript for the browser simulation and audio generation. Do not introduce C++, a native simulation service or C++ compiled to WebAssembly.
- Run engine physics in the browser. Use Laravel for authentication, access control, saved builds, presets and recorded results.
- Keep numerical engine logic independent of React, HTTP, graphics and audio-device lifecycle. Use fixed simulation steps; rendering and telemetry may run at different rates.
- Write the simulation as one pure TypeScript core that runs unchanged in an AudioWorklet (live bench), a Web Worker (headless dyno sweeps) and Node (tests), as described in `PLAN.md`. Keep processing bounded, handle cancellation/reset, and avoid worker/message backlogs.
- Keep physics, sound and 3D driven by one versioned engine definition and consistent state. React should not receive updates at audio sample rates.
- Reuse the existing MUI components, theme, routing, API client and toast/error patterns. Add dependencies only when needed for the current implementation; update lockfiles with their package manager.

## Experience invariants

- The guest bench at `/` must start without authentication. Preserve applied builds, valid pending edits and comparison slots across sign-in/navigation; server saving must be explicit and must never overwrite the local bench on sign-in.
- Keep live pulls and quick tests on the same `DynoTest` procedure. Disable conflicting manual controls during an automatic test and retain aborted samples/reasons. Do not label quick calculation as replay.
- Structural changes explicitly stop/rebuild/reset unless the user turns on Live updates. Live updates apply valid edits through `EngineCore.continueFrom`, keeping crank speed, controls and gas state, and wait while an automatic test or audition owns the engine. Throttle, ignition and load are always live controls. Restart after a loaded stall must unload the dyno and clear RPM hold. Keep recent fuel-cut status stable rather than flashing with each limiter crossing.
- Physics, sound and the cutaway must use the same active definition, including snapshot audio auditioning. Slow inspection is a separate, labelled, muted display mode.
- Keep numerical diagnostics optional. Do not add scores, grind or unlock requirements to the sandbox.

## Product invariants

- Derive displacement from bore, stroke and cylinder count. Label units; use SI internally and test conversions.
- Validate geometry, firing order and supported combinations. A control must have a corresponding implemented effect; make unsupported features explicit.
- Distinguish ambient air, intake conditions and engine temperatures. Define the basis for oxygen concentration and humidity consistently.
- Separate the electronic rev limiter from estimated mechanical capability. Raising a limiter must not silently strengthen the engine.
- Compute power consistently from torque and speed. Distinguish engine output from transient dyno absorption, and raw output from any later atmospheric correction.
- Store full run snapshots, model/schema versions, conditions and abort status. Later edits to builds or presets must not rewrite historical runs.
- Label estimates and document model assumptions. Do not claim engineering accuracy or reliable real-world tuning predictions without supporting validation.

## Repository map

- `frontend/`: Vite, React, TypeScript, routing, auth, MUI layout/theme, user/session settings and notifications. The implemented core/hosts are in `src/sim`, with 3D/audio/charts/session UI in `src/bench`.
- `backend/`: Laravel 12 API, mail, models, migrations, factories, seeders and Pest feature tests.
- `scripts/setup.sh`: creates missing local environments, installs dependencies and starts the development backend.
- `scripts/create-project.py`: inherited template-copy helper. Prefer Project Base for creating future generic applications; Engine Bench will acquire product-specific code.
- `PLAN.md`: agreed scope, architecture direction, stages and acceptance checks.

## Development and checks

Run from the repository root unless stated otherwise:

```bash
./scripts/setup.sh
# Frontend development, in frontend/:
npm run dev
# Frontend validation, in frontend/:
npm run build
npm run lint
# Backend validation:
docker compose exec -T backend php artisan test
# Isolated persistence workflows in Chromium/Firefox:
./scripts/test-storage-browser.sh
# PHP formatting:
docker compose exec -T backend vendor/bin/pint --dirty
```

Default development ports: frontend 5175, API 8002, Mailpit inbox 8027. Environment examples define the defaults; existing local `.env` files may override them. Root Compose settings, frontend proxy settings and backend/frontend URLs must agree.

- Run backend checks in Docker. Do not assume host PHP extensions or dependency versions match the project.
- Backend tests must use `engine_bench_test` or another dedicated database ending in `_test`. Preserve `backend/tests/bootstrap.php` and its forced testing connection/name guard.
- Never run tests, destructive migrations or database resets against `engine_bench`, Image Trainer, Project Base or another application's database.
- Add tests for meaningful numerical, access-control and persistence behaviour as it is introduced. Vitest and Playwright are configured. Run `npm test` for numerical changes, `npm run test:browser` for Chromium/Firefox workflows, `npm run schemas` after schema changes, and `npm run benchmark` when changing core cost. Run Playwright suites sequentially to avoid test-results directory contention; use separate output directories if parallel independent invocations are needed.
- Run affected tests and frontend checks for relevant changes. Documentation-only changes need consistency checks, not a full application test run.
- For simulation work, measure worker/audio/UI performance and validate physical invariants and supported trends. Do not mask numerical errors by fabricating curves or ignoring invalid states.

## Authentication, data and isolation

Export Zod JSON Schemas with `npm run schemas` to both schema directories after changing document formats. Keep run snapshots and build revisions immutable, enforce request/sample caps, and retain optimistic revision conflicts and idempotent run retries. The library sends `X-Workspace-UUID` to detect another tab changing the save destination; retain this guard. Persistence browser tests must use the isolated `compose.e2e.yml` API/test database through `scripts/test-storage-browser.sh`, never the normal development API.

Preserve hashed API session tokens, email verification, password reset and session revocation. Scope every private engine/result endpoint to the authenticated user's workspace and enforce roles on writes. Do not trust a client-supplied company ID as authorisation.

Do not copy `.env` files, keys, real accounts, databases, storage, dependency directories or Git history from other applications. Keep generated and local files ignored. The demo seeder is optional and only for local/testing environments.

Engine Bench and `../project-base` are independent projects. Do not put engine features into the base. When a generic fix needs to reach both, apply and verify it explicitly in each authorised repository.

## Third-party code and assets

Engine Simulator is a reference, not this project's application foundation. Before adapting an algorithm, record the exact source revision and file, inspect its licence and dependencies, retain required notices and document the adaptation. Recheck licences for assets, sounds, impulse responses and community presets separately. The source project's migration or maintenance status is not a licence grant.

Real-engine presets must identify specification sources, inferred values and calibration assumptions. Do not present a preset as an accurate replica solely because one published power figure matches.

## Working style

Make focused changes that advance the current stage in `PLAN.md`. Preserve unrelated user edits. Report what changed, what was verified and any actual limitations; do not claim tests were run if they were not. Do not add approval rituals for routine work already authorised by the user.
