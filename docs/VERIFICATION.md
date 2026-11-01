# Phase 1–3 verification

Date: 1 November 2026. Implementation: `eb-0d-1.0.0`. These are prototype measurements on this development machine, not universal browser/hardware guarantees or real-engine validation.

## Evidence by requirement

| Requirement | Authoritative evidence |
| --- | --- |
| Versioned inline-four, conditions and run definitions | `frontend/src/sim/schema.ts`; Zod parsing and exported JSON Schema in `frontend/schemas/` |
| Original reference review, licence boundaries and model assumptions | `SIMULATION.md`, including the pinned reference revision and explicit record that no reference code/assets were copied |
| Crank-angle-resolved gas states, valve flow, combustion, pressure torque | `frontend/src/sim/core.ts` and `physics.ts`; geometry/compression/flow/Wiebe tests in `core.test.ts` |
| Bounded stepping, zero-RPM start, idle, throttle, stalling and limiter | Core regression tests; 48 kHz fixed advance, maximum four angular substeps; actual startup/limiter/stall browser checks |
| Same core in Node, Worker and AudioWorklet | `tests/bench.spec.ts` probes the real browser hosts and compares their state with Node under identical inputs |
| Actual simulated audio | Browser tests render real OfflineAudioContext PCM, require nonzero energy and an output magnitude no greater than 0.650001; live starts exercise the real audio node |
| uPlot telemetry and procedural cutaway | `src/bench/Chart.tsx` and `EngineView.tsx`; desktop visual inspection and browser checks for canvas, pressure selection and inspection mode |
| Approachable presets, advanced editor, rebuild/reset and restoration | Road/Sport definitions, editor/schema validation, invalid-input/import rejection and baseline restoration browser tests |
| Temperature, pressure, humidity and oxygen effects | Atmospheric invariants and measured-torque trend/fuel-limitation tests; supported-envelope stability checks |
| On-screen, keyboard and gamepad input | Real slider/Space input browser checks; standard right-trigger API emulation checks. No physical controller compatibility claim is made from the emulated test |
| Ignition, starter and loaded-stall recovery | Ignition browser check and the user's loaded-stall report; regression test now verifies explicit unloaded restart |
| Volume and output limiting | Bounded core audio, master gain and compressor in `src/bench/audio.ts`; real offline PCM test |
| Live/quick sweeps, RPM hold and steady-state tests | Shared `DynoTest`, Node tests, browser live/quick sample agreement and steady-state 1500/2000/2500 RPM test |
| Abort/control ownership and retained partial samples | Live emergency-stop browser test, core aborted-run test, disabled manual controls during automatic procedures and run-ID filtering of stale messages |
| Baseline/modified curves and sound comparison | Temporary run slots and torque/power overlays; snapshot audition uses its own engine definition at the same selected RPM/full throttle; baseline snapshots remain unchanged across rebuilds |
| Recipe download/import | Browser download and valid/invalid recipe import checks; strict versioned schema and 50 kB input cap |
| Guest use and experiment preservation | Public `/` route; applied and unapplied build preservation through authentication navigation/reload; server saving is verified separately below |
| Guided experiments without progression locks | Three optional experiment descriptions in BenchPage; no currency/unlock system |
| Housekeeping | Backend package renamed, Sail removed from manifest/lock/installed dependencies, Mailpit running on 8027; Composer validation, Compose validation and existing account tests pass |

## Recorded checks

- `npm run build`: passes, including bundled Worker and AudioWorklet assets.
- `npm run lint`: passes.
- `npm test`: 18 numerical/schema/dyno tests pass.
- `npm run test:browser -- --project=chromium`: 11 workflow tests pass.
- `npm run test:browser -- --project=firefox`: 11 workflow tests pass.
- Production preview checks pass all eight selected cases: the built bundle's start/reset, live/quick comparison, limiter/inspection and narrow-screen workflows in both browsers.
- `npm run schemas`: exports four JSON Schema files successfully.
- `docker compose exec -T backend php artisan test --compact`: 32 account/session/storage tests pass, 178 assertions, against the guarded test connection.
- `docker compose exec -T backend composer validate --strict`: passes; the installed lockfile no longer contains Sail.
- `docker compose config --quiet`: passes; Mailpit's local inbox API responds on 8027.

Earlier 20-case browser passes preceded the held-starter fix. The current suite has 22 bench cases, including direct held-starter startup in each browser. Independent Playwright invocations must not share an output directory concurrently.

## Measured performance and numerical agreement

Development host: Linux x86_64, Intel Core i7-13700K, Node v24.19.0. Frontend testing uses Playwright 1.64.1 with its Chromium and Firefox runtimes. Measurements below use the allocation-reduced core, 2,000 blocks of 128 frames after warm-up. Audio quantum budget at 48 kHz: 2.667 ms.

| Scenario | Median block | p99 block | Maximum observed block |
| --- | --- | --- | --- |
| Starter/free acceleration | 0.087 ms | 0.123 ms | 0.205 ms |
| 1000 RPM hold | 0.043 ms | 0.057 ms | 0.142 ms |
| 4000 RPM hold | 0.044 ms | 0.052 ms | 0.148 ms |
| 7500 RPM hold | 0.043 ms | 0.048 ms | 0.127 ms |
| 8400 RPM hold | 0.087 ms | 0.139 ms | 0.191 ms |

Median cost per cylinder-step was approximately 0.000084–0.000171 ms. The high-speed case used two angular substeps; no case exceeded the four-substep bound. The default sweep simulated 7.664 seconds in 0.135 seconds of Node wall time and captured 46 samples. Browser quick tests additionally yield to the event loop, so their completion time includes scheduling/message overhead.

Actual live AudioWorklet startup was observed with a coarse 2 ms peak against the 2.667 ms budget on this machine. This timer cannot establish precise deadline/underrun rates; numerical/core measurements, real browser audio tests and operator feedback together support the initial inline-four host decision. React/3D update separately from simulation, telemetry is capped at about 20 Hz and quick-test progress publication at 20 Hz. Benchmark again before adding more cylinders or claiming support for slower machines.

Under a one-second free-acceleration probe, Chromium's Worker and AudioWorklet each differed from Node by approximately 0.0000432 RPM, 0.00000187 rad and 0.00000136 Nm; maximum instantaneous pressure relative error was 0.00000244. Firefox's corresponding differences were 0.0000624 RPM, 0.00000269 rad, 0.00000197 Nm and 0.00000351. Both are below the explicitly stated tolerances in `SIMULATION.md`. Controlled-speed live/quick samples agree to seven decimal places on these tested runtimes.

## First-use feedback and outstanding acceptance

The user tried the initial bench and reported fuel-cut warning flicker at unloaded full throttle and inability to restart a loaded stall. Both were fixed: limiter hysteresis/recent-cut presentation and explicit dyno unloading on restart. Dedicated regression tests pass in both browsers. Start engine is now on the first screen.

The follow-up user report exposed a third issue: Hold starter was disabled until Start engine had already been used. Hold starter now creates/resumes audio and starts the stopped bench directly, obeys ignition, unloads the dyno and releases on pointer/key release or focus loss. The real held-pointer regression passes in Chromium and Firefox. The user has been asked to refresh and confirm startup plus the modify/compare/restore flow; that latest reply is pending. The full phase 2 first-use gate therefore remains open: an unfamiliar user must confirm starting within one minute and a clear modification/comparison/restoration experience after the fixes. Automated workflow timing and screenshots do not substitute for that feedback.

Known scope limits: no calibrated production-engine predictions, forced induction, additional layouts, detailed wear/damage. These are later planned phases, not missing substitutes for the current inline-four bench. There is no replay feature; quick calculation and snapshot audio auditioning are explicitly distinguished.

## Phase 3 persistence verification

- Laravel validates engine/conditions/run JSON against schemas exported from the same Zod definitions used by the bench, plus geometry, procedure and sample consistency checks. Request cap: 1 MiB. Samples: at most 5,000, gzip-compressed into one blob capped at 256 KiB; base64 adds storage overhead. No per-sample database rows.
- Personal workspaces are created during registration and lazily for existing accounts. Team memberships remain usable; explicit activation changes the authenticated workspace. Reads are membership scoped, writes require authorship or a team admin, and personal workspaces cannot invite other users. A workspace hint rejects stale-tab saves with 409.
- Build revision creation uses transactions, row locks and an expected latest revision (409 on conflicts). Saved revisions and runs have no update API and reject Eloquent updates. Runs retain their tested engine, conditions, procedure, model/schema/runtime, warnings, status/reason and samples. Reusing a run ID is idempotent only for the same content and revision. Submitted results remain unverified.
- `BenchStorageTest.php` covers guest denial, registration, lazy personal workspace creation, team switching/roles, private cross-workspace reads and writes, malformed/oversized documents, partial aborted runs, retries, stale save conflicts and unchanged compressed history after editing the build. The full PHP suite passes 32 tests / 178 assertions using the guarded test connection.
- `scripts/test-storage-browser.sh` passes its real end-to-end workflow in Chromium and Firefox: valid guest pending edits and baseline survive sign-in, a build gets two revisions, an older run survives reload and a repeated save creates one history record, historical revision load restores geometry, and a rerun into Modified exactly matches the saved samples on each tested runtime. Switching to an empty new team hides private library records while retaining the local experiment; switching back restores the library.
- Browser persistence writes use a separate API on 8003 and `engine_bench_browser_test`, with a separate temporary Laravel storage directory. Vite runs on 5180 for this suite; the test API stops afterwards. The normal development database is neither reset nor seeded by this workflow. The additive storage migration is applied to the local development database.

Phase 3 acceptance is satisfied by these automated persistence/access-control checks. Phase 2's human first-use gate remains open as described above.

## Model 1.1.0: wider envelope and configurable starter

The measurements above were taken on `eb-0d-1.0.0`. Model 1.1.0 scales friction with displacement, normalises exhaust audio by displacement, makes starter torque a build setting and widens the geometry, valve, inertia and RPM ranges (see `SIMULATION.md`). The cost-per-step, cross-host agreement and live-callback figures have not been re-measured for 1.1.0. Re-run `npm run benchmark` before relying on them at the new extremes.

- Headless stress test: every combination of bore and stroke at 20/300 mm, minimum and maximum rod, compression 5/20, minimum and maximum valve areas and inertia 0.01/20 kg·m², each held at 600 and 19,900 RPM at full throttle and started freely at idle and full throttle (512 cases). All stayed finite with bounded audio once the cold-gas guard was lowered from 100 K to 30 K. Without that change, a 21 L engine with 10 mm² valves at 19,900 RPM expanded its trapped charge below 100 K. A smaller corner set is a Vitest regression.
- Starter: a 105 × 105 mm build needs about 266 Nm to crank slowly. With 70 Nm it stays at 0 RPM and the starter-stalled flag latches; with 10% more than the estimate it starts and idles. Both are Vitest regressions. Builds saved without `starterTorque` read as 70 Nm, matching 1.0.0 behaviour.
- In the Chromium browser pane, the 105 × 105 build showed the stall warning with 70 Nm and idled at about 970 RPM with 300 Nm. An 85 L build with the 2.0 L preset's valve areas and inertia cranked and fired but stalled when the starter released, as expected for a starved engine; the generic stall message covers that case. The 3D framing change could not be checked visually because WebGL was unavailable in that browser pane.
- The starter-stalled flag is only raised with the dyno unloaded, so a loaded dyno stopping a cranking engine is reported as an ordinary stall, not blamed on the starter. The browser suite found this.
- Frontend: 22 Vitest tests, build and lint (one existing hook-cleanup warning) pass. Playwright: 24 passed in Chromium and Firefox, with the 2 storage cases skipped; `scripts/test-storage-browser.sh` was not re-run. Backend: 32 tests / 178 assertions pass. Exported JSON Schemas now use Zod's input form so documents saved before `starterTorque` existed remain valid.
