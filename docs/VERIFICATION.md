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

Known scope limits: no calibrated production-engine predictions, knock, additional layouts, detailed wear/damage. Forced induction was added later in model 1.3.0 and fuel systems in 1.4.0 (see below). These are later planned phases, not missing substitutes for the current inline-four bench. There is no replay feature; quick calculation and snapshot audio auditioning are explicitly distinguished.

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

## Model 1.2.0: full-load calibration

1.2.0 replaces fixed cold-air gas properties, a near-zero wall heat coefficient and RPM-polynomial friction, and adds intake runner inertia (see `SIMULATION.md`). Before the change, steady full-throttle holds on the Road preset gave 284 Nm at 1,000 RPM (BMEP 1.78 MPa, about 55% brake efficiency, 113 bar peak pressure) and only 77 kW at 4,000 RPM; volumetric efficiency fell from 0.95 to 0.47 between 1,000 and 6,000 RPM because 320 mm² of effective intake area choked the flow.

- Road now peaks at 193 Nm at 4,500 RPM and 110 kW at 6,000 RPM. Volumetric efficiency rises from 0.84 at 1,000 RPM to 1.02 at about 5,000 RPM. Brake efficiency at peak torque is about 36% and peak cylinder pressure is 86 bar. Sport peaks at 186 Nm at 5,500–6,000 RPM and 131 kW at 7,000 RPM.
- Vitest regressions check the plausibility bands (peak torque between 3,500 and 5,500 RPM, peak BMEP 1.0–1.3 MPa, peak power 90–130 kW above 5,500 RPM, 1,500 RPM torque at 75–95% of peak). They also check that Sport peaks later than Road, that a 600 mm runner gives more mid-range and less 6,000 RPM torque than a 150 mm runner, internal-energy inversion, and the legacy 300 mm runner default. These are trend checks, not validation against a measured engine.
- Headless stress test: the 512-case 1.1.0 envelope, crossed with runner lengths of 50 and 1,500 mm (1,024 cases). All stayed finite with bounded audio. The Vitest corner set now includes both runner extremes.
- Benchmark (Node 128-frame block, median): about 0.065 ms at 1,000, 4,000 and 7,500 RPM, up from 0.045 ms; quick sweep 0.20 s wall time for 46 samples.
- Frontend: 28 Vitest tests, build and lint (one existing hook-cleanup warning) pass. Playwright: 24 passed in Chromium and Firefox. `scripts/test-storage-browser.sh`: 2 passed. Backend: 32 tests / 178 assertions pass with the re-exported schemas.

## Model 1.3.0: forced induction

- Naturally aspirated full-load holds are identical to 1.2.0 (same Road table to the printed precision).
- Vitest (10 new tests, 38 total):
  - legacy builds read as naturally aspirated;
  - turbo boost settles within −10/+15 kPa of the wastegate target and raises 5,000 RPM torque by more than 40%;
  - a higher target raises boost and torque;
  - boost lags a throttle step while the shaft spools, and a lighter rotor spools sooner;
  - centrifugal boost more than doubles from 3,000 to 6,000 RPM;
  - roots boost at 2,000 RPM is over 40% of its 6,000 RPM value, and it draws crank power;
  - a 90% intercooler gives a cooler charge and more torque than none;
  - lift-off vents with a blow-off valve and flags surge without one;
  - low maximum shaft speed raises the overspeed warning;
  - induction extremes stay finite with bounded audio and are batching-independent;
  - a 20 mm² turbine with the wastegate held shut stops with the "turbine too small" error.
- Headless stress test: geometry corners (bore and stroke 20/300 mm, compression 5/20, valves and inertia scaled to size) × 16 turbo extremes (wheel 20/200 mm, turbine 20/10,000 mm², rotor inertia 1/100,000 g·cm², boost target 0/4 bar), 4 centrifugal and 8 roots extremes. Each was held at 600 and 12,000 RPM and started freely with a throttle lift: 672 cases. 656 stayed finite with bounded audio. The other 16 all pair a 20 mm² turbine with a 300 mm bore (1.4–21 L), and stop with the "turbine too small" error.
- Chromium: the bench was driven through the real UI (Induction selector, rebuild, start, full throttle, lift) for each type; boost, shaft speed, charge air and blow-off status updated with no page errors. Each type's 3D part (turbo with glowing housing and visible wheel, belt-driven centrifugal unit, belt-driven roots blower on the head) was checked in software-WebGL screenshots. A new Playwright test covers the turbo editor's range validation, rebuild and spool in Chromium and Firefox.
- Benchmark (Node 128-frame block, median, 5,000 RPM held): none 0.063 ms, turbo 0.090 ms, centrifugal and roots 0.079 ms, against a 2.67 ms budget.
- Frontend: build and lint (one existing warning) pass. Playwright: 26 passed, 2 storage cases skipped in that run; `scripts/test-storage-browser.sh`: 2 passed. Backend: 33 tests pass, including a new check that turbo builds are accepted and invalid induction settings rejected by the exported schema.

## Model 1.4.0: fuel systems

- Steady full-load torque with port injection, the default, matches 1.3.0 to the printed precision (Road 176 / 185 / 193 / 175 Nm at 1,500 / 3,000 / 4,500 / 6,000 RPM). The existing calibration and forced-induction tests pass unchanged.
- Vitest (8 new tests, 46 total):
  - legacy builds read as port injected; steady λ equals the command and fuel flow equals air / 14.7;
  - a carburettor runs richer than λ 0.92 at 80 kPa while port injection holds λ 1;
  - a 1 × 24 mm venturi loses over 10% of 6,000 RPM torque but under 3% at 1,500 RPM;
  - direct injection makes 2–8% more 4,500 RPM torque than port injection;
  - port injection without transient correction leans at least 0.08 λ more on a tip-in; direct injection stays within 1.02;
  - a carburettor without an accelerator pump misfires lean on a tip-in under load, and with one it does not;
  - injection cuts fuel on a closed throttle at 3,000 RPM and resumes at 1,200 RPM; a carburettor keeps fuelling;
  - a draw-through carburettor feeds a turbo to its boost target at λ about 1.
- Headless probes (warm and 10 °C coolant, tip-in from idle against 0, 40 and 80 Nm): all four systems start and idle. Port injection with correction stays within λ 1.00–1.03. Without correction, throttle body reaches about λ 1.3 and port about 1.15. A carburettor with an accelerator pump runs λ 0.8–1.1 on a tip-in. Without the pump it reaches about 1.5 and misfires. On lift-off from 6,700 RPM the carburettor runs rich (λ about 0.5) with brief misfires, the overrun popping of real carburetted engines; injection cuts fuel instead.
- Chromium: each fuel system was selected, rebuilt, started and taken to full throttle through the real UI. Mixture, air–fuel ratio and fuel flow (about 40 L/h at 6,600 RPM, about 270 g/kWh) updated, and lift-off showed OVERRUN CUT for injection and MISFIRE/rich for the carburettor, with no page errors. The 3D plenum, carburettor barrels and filter, throttle body, runner injectors and direct injectors were checked in software-WebGL screenshots. A new Playwright test covers the carburettor editor's range validation, rebuild, start and mixture display in Chromium and Firefox.
- Benchmark (Node 128-frame block, median): about 0.072 ms at 1,000–7,500 RPM, against a 2.67 ms budget.
- Frontend: build and lint (one existing warning) pass. Playwright: 28 passed, with 2 storage cases skipped in that run; `scripts/test-storage-browser.sh`: 2 passed. Backend: 34 tests pass, including a new check that fuel-system builds are accepted and invalid fuel settings rejected by the exported schema.

## Live updates

- Vitest (3 new tests, 49 total):
  - continuing an unchanged running build is bit-identical in audio and telemetry to never stopping, over 4,800 steps;
  - a live edit of bore, compression, ignition, fuel system and ambient temperature keeps crank speed, angle, controls and cylinder pressure, and the engine keeps running;
  - a live turbo edit keeps the current boost and then settles to the new target.
- Headless stress at full throttle (about 6,600 RPM): live switches to turbo, roots, carburettor and direct injection, and live changes of bore (40 and 150 mm), stroke, compression (6 and 18:1), inertia, limiter and a 300 mm-bore build, all continued finitely without errors.
- Playwright (Chromium and Firefox), new test:
  - with Live updates on, a bore edit reaches the running engine (the stand shows 2.29 L) with no stop;
  - an out-of-range edit is held back while the engine keeps running;
  - Restore previous build returns live to the original 2.00 L build;
  - the preference survives a reload.
- The 3D view keeps the user's camera orbit across rebuilds, scaled to block size.
- Full Playwright: 30 passed, with 2 storage cases skipped in that run; `scripts/test-storage-browser.sh`: 2 passed. Build and lint (one existing warning) pass. Not checked: how the sound of a live edit is perceived on real speakers.

## Model 1.5.0: Stage 5 sound and bench feel

- Sound never changes the physics. A Vitest check runs the same held full-throttle point with the road exhaust, a straight pipe, a 4-2-1 collector, every listening position and sound off: torque, absorbed torque, cylinder pressures and λ are identical. Headless quick tests skip sound. Dyno sweeps below the limiter match 1.4.0.
- Vitest (23 new tests, 72 total):
  - the output stays finite and within ±0.65 for straight, long 4-2-1, short absorptive, a turbo with no blow-off valve and a roots blower, at every listening position;
  - a straight pipe without a catalyst is more than 1.4 times as loud (RMS) and more than 1.5 times as bright as the road exhaust;
  - a 1.2 m header puts its main low resonance below 0.75 of a 0.6 m header's;
  - a spark-cut limiter in a warm exhaust (above 600 K) afterfires more than five times in 2 s, a fuel-cut limiter less than half as often, and a steady 3,000 RPM cruise never; a lift-off briefly runs rich and may afterfire, which is plausible and allowed;
  - a live update keeps the sound state bit-identical and applies a new exhaust;
  - a fuel-cut limiter stops injection, a spark cut does not, and a carburettor always cuts the spark;
  - road load: launch from rest on the automatic clutch, 0–100 km/h between 6 and 12 s (7.3 s measured with changes at the limiter), road speed kept through a gear change, turbo boost builds as the car accelerates, neutral coasts down;
  - display units (kW, hp, PS; Nm, lb·ft), no negative zero, peak and band-mean power;
  - every starting build validates, is not undersized, starts, idles at 600–1,400 RPM and completes a dyno sweep.
- Starting builds (quick sweep peaks): Road 111 kW at 6,070 RPM; Sport 135 kW at 7,390; Turbo hot hatch 224 kW at 6,260 and 370 Nm (optimistic without knock); Torquey long-stroke 96 kW at 4,810 with 204 Nm around 3,000–4,000; Screaming 9k 150 kW at 8,770.
- Rendered audio (`npm run sounds`), compared with the 1.4.0 core on the same scenarios: overall loudness is similar (Road full-throttle limiter RMS 0.28 against 0.22). The straight pipe is about 5 dB louder and much brighter than the road exhaust, the engine bay is dominated by intake and valvetrain, and the test cell adds room reverb. Spark-cut and limiter pops occur after the header warms. Short clipping only happens on straight-pipe afterfires.
- Benchmark (Node 128-frame block): sound adds about 0.015 ms at 4,000 RPM (0.071 ms off, 0.086 ms on). Worst case in the standard benchmark is 0.155 ms median at two substeps, against a 2.67 ms budget.
- Chromium (built-in browser pane, 1,366 × 768): Start, the tachometer cluster, throttle and dyno load fit on the first screen. A quick test calculated while the engine kept idling at about 870 RPM, asked before replacing a captured Baseline, and moved capture to Modified. Road load with the turbo build launched, showed turbo lag (0.09 bar at 3,500 RPM rising to 0.85 bar) and changed gear with E. A live pull drew its curve live, with peak rings and a summary against Baseline. WebGL was unavailable in that pane, so the 3D view was not checked.
- Playwright (Chromium and Firefox): a new `tests/stage5.spec.ts` covers the exhaust editor and spark-cut afterfire, fuel-cut LIMITER CUT, a quick test that leaves the engine idling and protects the baseline, road load and gear changes, shortcuts that ignore typing, remembered listening position and units, and each starting build. Full run: 40 passed, 2 storage cases skipped; `scripts/test-storage-browser.sh`: 2 passed after fixing a gauge drawing error at zero size that it found. Backend: 34 tests pass with the re-exported schemas. Build and lint (one existing warning) pass.
- The cutaway draws the exhaust from the same definition: headers to a collector past the flywheel end (further out for longer headers; paired for 4-2-1), then the catalyst, silencer type and tailpipe. It glows with the header wall temperature and flashes on afterfire. Checked in software-WebGL screenshots of the Road (4-1, catalyst, chambered) and Screaming 9k (4-2-1 straight pipe) builds; the first layout hid the cylinders and was rerouted clear of the open cutaway.
- First user listening check (2 November 2026): "1000x better" overall, but the blow-off valve sounded like TV static and should be deeper; something still sounded slightly off. Cause: the valve was white noise through one fixed 2.5 kHz band, and the modelled valve (sized like the roots bypass, about 3,500 mm²) emptied the charge in under 0.1 s. Fix: a realistically sized valve (about 650 mm²) now vents for about a second after a lift from 0.8 bar, and its sound is a low thump followed by a darker jet whose pitch and level fall as it empties. A Vitest regression checks that it is still venting 0.4 s after the lift and that the jet gets quieter and darker as the dump pressure falls. `npm run sounds` adds a `turbo-blow-off` scenario.
- Listening sign-off (2 November 2026): after the blow-off rework the user said it "sounds really good for now" and asked to mark the sound as done, with a possible revisit later. This closes Stage 5's listening acceptance.

## Model 1.6.0: Stage 6 combustion and knock

The first Stage 6 slice: fuel grades, a predictive burn rate, an end-gas knock estimate and ECU knock control. Engine-management maps, per-cylinder temperatures, parts and failures are not implemented yet.

- Builds saved before 1.6.0 (no `combustion` block) read as fixed burn, RON 95 and no knock control. Each of the five starting builds, stripped of its combustion block, gave a dyno sweep bit-identical to the committed 1.5.0 core (compared in a separate worktree of commit 3c79f7f). The only change such builds see is sound-only: a lean misfire's afterfire weight fell from 10% to 3%.
- Vitest (`src/sim/knock.test.ts`, 14 tests) checks the acceptance trends at wide-open throttle:
  - more spark advance, more boost, lower octane (RON 91 > 95 > 98 > E85), hotter intake air and a leaner mixture each raise the knock index, and enrichment lowers it;
  - full-load lugging at 1,200 RPM knocks, and the same timing at 4,500 RPM does not;
  - knock control retards a knocking engine by more than 2°, lowers its intensity and recovers once the knock stops; with control off there is no retard;
  - an unlit charge reports no knock, and dyno samples record knock and retard;
  - torque has an interior optimum in spark advance (MBT), and MBT at 6,000 RPM is later than at 1,500 RPM;
  - the predictive burn lengthens with speed, lean mixture and part load and is near `burnDuration` at 3,000 RPM full load, while the fixed burn keeps `burnDuration`;
  - E85 meters to its own stoichiometric ratio.
- Changed existing tests:
  - The carburettor overrun fuel-flow threshold is now 5e-5 kg/s instead of 1e-4. The returned runner residual leaves less fresh air to fuel, and the value stays ten times the injected engine's cut flow.
  - The extreme-size idle test still passes. The 20 mm engine idles at 519 RPM with the predictive burn (632 fixed), which depends on the 0.7 × `burnDuration` floor and the runner residual cap.
- Full Vitest run: 88 passed. Playwright (Chromium and Firefox): the new `tests/stage6.spec.ts` loads the Turbo hot hatch, switches it to RON 91, rebuilds, runs a quick test and expects the summary to report the knock and the ECU retard, then turns knock control off. Full run: 42 passed, 2 storage cases skipped. `scripts/test-storage-browser.sh`: 2 passed. Backend: 34 passed with the re-exported schemas. Build and lint (one existing warning) pass.
- Benchmark (Node, 128-frame block): median 0.105 ms at 4,000 RPM (0.086 ms in 1.5.0) and 0.194 ms worst case at two substeps (0.155 ms), against a 2.67 ms budget.
- Chromium (built-in browser pane): the knock strip shows the fuel, knock-control state and each cylinder's knock index. The Turbo hot hatch at 4,500 RPM and full boost (0.93 bar) on RON 98 ran at 94–95% of onset, drawn amber, with no knock. WebGL was unavailable in the pane, so the 3D view was not checked.
- Seen in passing, not changed: at steady full boost the hot hatch shows AFTERFIRE continuously, in 1.5.0 as well as 1.6.0. At λ 1 about 2% of the fuel finds no oxygen (humid air holds slightly less than the stoichiometric ratio assumes), and the 1,150 K header lights it.
- Open: the user's own check of how knock feels to tune against, and its ping sound.

## Model 1.7.0: engine management and fuel supply

- Builds without maps or a fuel supply (as saved before 1.7.0) gave dyno sweeps (torque, knock and retard per sample) bit-identical to the committed 1.6.0 core for all five starting builds, both with their 1.6.0 combustion block and without it. Flat maps reproduce the single values exactly (Vitest, Turbo hot hatch sweep).
- Vitest (`src/sim/management.test.ts`, 11 tests; `src/bench/mapFields.test.ts`, 3):
  - bilinear lookup and edge hold;
  - timing follows the ignition map, including halfway between breakpoints, and less advance reduces lugging knock;
  - a spark after top dead centre runs with less torque;
  - the λ map enriches at high load and lowers knock, and a carburettor ignores it;
  - the boost map's 0.4 bar target holds boost below 0.55 bar where the single 0.9 bar target exceeds 0.8;
  - tables that do not match their axes and decreasing breakpoints are rejected, and builds saved before 1.7.0 read with neither block;
  - small injectors hit their duty limit, lean the mixture past λ 1.2 and raise knock; a weak pump limits E85 but not petrol; a carburettor is limited by its pump alone;
  - map change descriptions.
- Changed existing tests: the forced-induction tests build a turbo on the Road preset, whose new Road-sized injectors run out of fuel on boost. Those physics tests now use unlimited supply (`fuelSupply: null`).
- Playwright (`tests/stage6.spec.ts`, Chromium and Firefox): on the Road build, maps switch on; the single timing and λ fields are disabled; a +1° whole-table change and a typed cell carry through a rebuild to the ECU readout (21.0° BTDC, from the map) with the live cell readout showing; 60 cc/min injectors show FUEL LIMITED at full throttle.
- Chromium (built-in browser pane): the Engine maps panel shows the 14 × 9 hot hatch ignition table in full beside the bench, with the live cell outlined. With Live updates on at 4,500 RPM and 190 kPa, +1° on the whole table moved the ECU timing from 14.0° to 15.0° without stopping and raised knock from 94% to 99% of onset.
- Full runs: Vitest 102 passed. Playwright 42 passed, 2 storage cases skipped. In that run the new map test failed once in Firefox, because the typed 800 RPM cell interpolated into the idle timing (a test design error, fixed by editing a 6,000 RPM cell), and the existing bench sign-in test failed once in Chromium and passed on retry. Both then passed twice in each browser. `scripts/test-storage-browser.sh`: 2 passed. Backend: 34 passed with the re-exported schemas. Build and lint (one existing warning) pass.
- Cost (Node, 128-frame block, turbo at 4,000 RPM): 0.171 ms median with maps against 0.145 ms without, after moving map lookups to 3 kHz (0.273 ms when read every step). Standard benchmark: 0.117 ms median at 4,000 RPM, 0.211 ms at 8,400 RPM, against 2.67 ms.

## Model 1.8.0: per-cylinder temperatures

- Results unchanged: for all five starting builds, with and without flat maps, dyno sweeps (torque, knock and retard per sample) were bit-identical to the committed 1.7.0 core.
- Vitest (`src/sim/thermal.test.ts`, 6 tests):
  - full-load temperatures sit in plausible ranges (EGT 800–1,000 °C, crown 200–320 °C, valve above 500 °C and below EGT, deck below crown);
  - every temperature rises with load by more than 20 K;
  - EGT falls when rich;
  - retarded timing raises EGT by more than 20 K and lowers the crown;
  - on two fuels with the same cycle, the knocking one has the hotter crown and the same EGT;
  - identical cylinders differ by under 1 K;
  - temperatures carry through a live update, and dyno samples record EGT.
- Known gap, not hidden by the tests: enrichment from λ 1.0 to 0.85 lowers EGT by only about 5 K and slightly raises the crown temperature, because the excess fuel's mass and chemistry are not modelled. Real engines lose roughly 30–60 K of EGT.
- Calibration (16 s holds from an 87 °C coolant start, Road engine):

  | Operating point | EGT | Crown | Valve | Deck |
  | --- | --- | --- | --- | --- |
  | Idle | 491 °C | 105 °C | 138 °C | 93 °C |
  | 3,000 RPM, light load | 628 °C | 117 °C | 219 °C | 100 °C |
  | 3,000 RPM, full load | 807 °C | 201 °C | 435 °C | 149 °C |
  | 6,000 RPM, full load | 926 °C | 292 °C | 634 °C | 202 °C |
  | Turbo hot hatch, 5,000 RPM, full boost | 1,012 °C | 348 °C | 759 °C | 234 °C |
- Chromium (built-in browser pane): with the Turbo hot hatch at 5,000 RPM and full boost, the cylinder strip read EGT 1,008 °C, crown 323–324 °C (amber) and valve 735–739 °C, plus knock at 91% of onset. WebGL was unavailable in the pane, so the piston glow, knock flash and spark timing on the cutaway were type-checked but not seen.
- Playwright: `tests/stage6.spec.ts` now checks that each cylinder shows EGT, piston and valve temperatures. Full run: 44 passed, 2 storage cases skipped. `scripts/test-storage-browser.sh`: 2 passed. Backend: 34 passed. Vitest: 108 passed. Build and lint (one existing warning) pass. Benchmark: 0.108 ms median at 4,000 RPM and 0.194 ms at 8,400 RPM.

## Model 1.9.0: enrichment cooling, and full reset

- Decision (3 November 2026, user): no saved builds need to keep 1.8.0 results, so 1.9.0 applies to every build without an opt-in.
- Vitest: 111 passed.
  - `src/sim/knock.test.ts`: the rich products are exactly stoichiometric at λ ≥ 1, release less heat into more moles and more heat capacity as the mixture richens, and give a combustion efficiency of about 0.8 at φ 1.18 for petrol and E85.
  - `src/sim/thermal.test.ts`: λ 0.85 at 4,500 RPM lowers EGT by 50–150 K, the crown by more than 3 K and the valve by more than 25 K.
- λ at 1: for all five starting builds, the 1,500–6,200 RPM sweep (capped below each limiter) gives the same peak power and hottest EGT as 1.8.0 to within 0.1 kW and 1 K. It is not bit-identical, because brief rich transients now form rich products.
- λ 0.85, same sweeps against 1.8.0:

  | Build | Peak power | Hottest EGT | Peak knock index |
  | --- | --- | --- | --- |
  | Road 2.0 | 106.2 kW (109.7) | 820 °C (918) | 0.85 (0.89) |
  | Sport 2.0 | 115.5 kW (119.0) | 758 °C (855) | 0.83 (0.88) |
  | Turbo hot hatch | 209.5 kW (218.3) | 934 °C (1,041) | 0.65 (0.70) |
  | Torquey long-stroke | 92.7 kW (95.6) | 776 °C (870) | 1.01 (1.06) |
  | Screaming 9k | 102.2 kW (105.1) | 736 °C (832) | 0.80 (0.84) |

- Known gaps, recorded in `docs/SIMULATION.md`: with no dissociation, enrichment costs about 3% power instead of reaching a best-power mixture slightly rich of λ 1, and the EGT drop (about 100 K from λ 1.0 to 0.85) is larger than the 30–60 K first quoted in the plan. A web search found the direction confirmed in patent literature (EGT highest near λ 1 and falling with enrichment), but no calibrated full-load data.
- Cost (Node, standard benchmark, 1.9.0 and 1.8.0 interleaved three times on the same machine): median per 128-frame block 0.45 against 0.41–0.48 ms at 4,000 RPM and 0.89–1.02 against 0.79–0.81 ms at 8,400 RPM, against a 2.67 ms budget. This machine was slower than for earlier entries, so compare only within this entry.
- Full reset: a confirmed **Full reset** button beside Reset bench returns the bench to the Road build in normal air with default test settings and controls. It replaces the AudioWorklet and Worker hosts, and keeps comparison runs, saved builds and preferences. Reset bench only rebuilds the current build, and the guest build persists across reloads in the same tab (sessionStorage), so a build or conditions that could not rev had no way out short of editing every field. Emergency stop and rebuilds now also clear the UI's dyno and road load, matching the fresh core. New hosts also take the saved listening position; before, the audio used the tailpipe until the setting was changed.
- Chromium (built-in browser pane, production preview build): an 88 mm bore build was rebuilt, survived a reload and started. After a full reset the bore read 86 mm and the engine was stopped. The new host then idled at 961 RPM and revved to 6,638 RPM on throttle.
- Playwright (browsers downloaded for 1.64.1, Chromium and Firefox): 40 passed, 6 failed, 2 storage cases skipped. Four of the failures ran while Node simulation scripts were loading the CPU; rerun alone, all four passed. Those include the new full-reset case (`tests/bench.spec.ts`) in Chromium. It was not rerun in Firefox, where it passed in the full run. The other two are the sign-in navigation test in both browsers. They fail because the local API was not running, so the sign-in page never shows its button. Backend tests were not run for the same reason; only the run schema's model-version list changed (re-exported with `npm run schemas`).
- A reported restart problem on the deployed site (the 5.4 L "Workshop 1.8 • 9k" recipe: hold 5,000 RPM, ignition off, hold 0, ignition on) was not reproduced. It restarted in Node, in the built-in browser pane with this build and in Chrome on the deployed site. Turning ignition back on while the engine coasts refires it at about 940 RPM. Once it has stopped, the ignition alone does not crank it: Start engine or the held starter does, as the stall notice says.
- Build passes. Lint passes with the one existing warning.

## Model 1.10.0: dissociation and best-power mixture

- Equilibrium constants: van 't Hoff fits to NIST-JANAF log Kf (CO2 C-095, CO C-093, H2O H-064, OH H-038, H H-001, O O-001) at 2,000 and 3,000 K reproduce the tables within 0.03 in log K from 1,500 to 3,500 K. The implied water–gas shift constant is 2.6 at 1,500 K, 3.5 at 1,740 K and 4.6 at 2,000 K, consistent with Heywood's 3.5.
- Vitest: 114 passed. New tests in `src/sim/knock.test.ts`:
  - hot stoichiometric gas holds more than 12% of its heat at 3,000 K and 60 bar, under 0.5% at 1,800 K, and less at higher pressure;
  - lean gas dissociates less;
  - a rich burn's table matches its frozen products at 1,740 K;
  - at 4,500 RPM full load, λ 0.95 beats λ 1, λ 0.9 is within 0.5% of λ 1, and λ 0.8 and λ 1.1 are lower.
- Two existing tests changed:
  - The straight-pipe loudness margin is now 1.35× the silenced exhaust's RMS, from 1.4×. It measures 1.385× (about +2.8 dB), because λ 1 exhaust pulses are hotter.
  - The 15-run bounded-sound test has a 40 s limit. It took about 22 s in a parallel run, over the 20 s default.
- Starting builds, 1,500–6,200 RPM sweeps (capped below each limiter), 1.10.0 against 1.9.0:

  | Build | λ 1 peak power | λ 0.85 peak power | λ 1 hottest EGT | λ 0.85 hottest EGT |
  | --- | --- | --- | --- | --- |
  | Road 2.0 | 106.3 kW (109.5) | 105.6 kW (106.2) | 947 °C (923) | 823 °C (820) |
  | Sport 2.0 | 115.9 kW (118.9) | 114.9 kW (115.5) | 883 °C (859) | 763 °C (758) |
  | Turbo hot hatch | 210.9 kW (216.3) | 208.6 kW (209.5) | 1,070 °C (1,047) | 937 °C (934) |
  | Torquey long-stroke | 93.0 kW (95.7) | 92.2 kW (92.7) | 898 °C (875) | 780 °C (776) |
  | Screaming 9k | 102.8 kW (105.1) | 101.7 kW (102.2) | 860 °C (836) | 740 °C (736) |

- Cross-host agreement: a first version stopped its Newton temperature solve at 0.05 K. Chromium's maths library differs from Node's in the last bit, so that cut-off fell on different iterations and the hosts drifted apart: 7×10⁻⁵ RPM after 1 s, and one pressure-trace bin 2.4% out. Converging to 10⁻⁷ K restored agreement: Chromium's AudioWorklet and Worker match Node within 6×10⁻⁶ RPM and 7×10⁻⁷ trace error, and Firefox's within 10⁻⁵ RPM.
- Cost (Node, standard benchmark, interleaved with the committed 1.9.0 on the same machine): running medians are about 10–20% higher (0.39–0.47 against 0.34–0.44 ms at 1,000–7,500 RPM, and 0.75–0.89 against 0.81–0.99 ms at 8,400 RPM), against a 2.67 ms budget. Cranking blocks still spike to 5–7 ms, as 1.9.0's did (5–6 ms, up to 14 ms on a noisy run). The tables of a fuel are built when a core first uses it, about 120–135 ms once per fuel and thread; a live change of fuel pauses the sound that long.


## Model 1.11.0: parts, stress, failures and push it

- Calibration (Node, held at full load, 14–16 s so the crown settles): at their highest stress, the five starting builds sit between 63% and 93% of their worst limit. The highest are the Turbo hot hatch's crown (91%) and turbo speed (93%) at 6,300 RPM, and the valve float of every build near its limiter (83–86%). In standard 1,500–6,200 RPM sweeps the worst sample was 98% of the hot hatch's turbine inlet limit at 1,067 °C. The turbine limit was raised to 1,100 °C, which puts that pull at about 96%. Over-boosting the hot hatch to 1.6 bar with knock control off knocks hard (19–21% unburned at onset) and cracks a cast piston within 2 s. With knock control on, it runs at 82–83% of crown and head limits and right at the turbine limit. At 2.2 bar, λ 0.85 and knock control on, it knocks intermittently and still cracks a cast piston in about 3 s.
- Stock results unchanged: standard sweeps of all five starting builds with stock parts match the committed 1.10.0 model's torque exactly (largest difference 0 Nm over 42–46 samples). The build without a `parts` block parses with stock parts.
- Vitest: 124 passed. New tests in `src/sim/parts.test.ts`:
  - old builds read as stock parts, which add no inertia;
  - H-beam rods add inertia and race springs add friction;
  - forged pistons raise only the crown and knock limits, and studs only the gasket clamp;
  - the stock hot hatch stays under its limits at full load near the limiter;
  - sustained knock cracks a cast piston repeatably, and the failed engine then cannot fire or crank;
  - forged pistons survive the same knock, and Indestructible mode never fails;
  - over-revving the Road engine floats stock valves into a piston, and uprated springs move the failure to the stock rods;
  - a dyno run aborts with the failure as its reason and records stress;
  - push it advances timing until the first knock and raises boost until a failure.
- Two existing tests that drive extreme builds to check other behaviour now run indestructible: the compressor-overspeed warning (`core.test.ts`) and the component-temperature soaks (`thermal.test.ts`, whose RON 91 build cracked a piston).
- Chromium (Playwright): two new `tests/bench.spec.ts` cases pass. One overboosts the hot hatch with knock control off: it fails with a cracked piston, explains why, and Rebuild clears it. The other runs push it on the Road build and fills the step table. The full Chromium bench suite then passed 17 of 18; the failure is the sign-in navigation step, which needs the local API (not running), as on 3 November.
- Built-in browser pane (development server): the stress strip, parts editor and push panel render. The Road build's timing push at 4,000 RPM ran from 20° to 50° without knock. Torque fell from 188 to 138 Nm and the crown reached 77% of its limit, so on RON 95 at this speed the model finds no knock limit before MBT is long passed. On the live bench, the over-boosted hot hatch cracked a piston at 3,900 RPM. Fuel flow fell to zero, the readings froze at the moment of failure (knock 330%, head gasket 131%) and Rebuild cleared it.
- Cost (Node, standard benchmark, interleaved twice with the committed 1.10.0): medians 0.37–0.38 against 0.35–0.37 ms at 1,000–7,500 RPM and 0.68–0.70 against 0.67 ms at 8,400 RPM, about 3–5% more, against a 2.67 ms budget.
- Not run: backend tests (no backend containers or images on this machine). Only the exported schemas changed: an optional `parts` block, the optional sample `stress` field and the model-version list. The installed ajv (version 6) cannot read the exported draft 2020-12 schemas, so they were not machine-validated outside Laravel. Firefox was not run (see the testing-depth decision of 3 November).
- Known gaps: see `docs/SIMULATION.md`. The cutaway does not show fitted or failed parts yet; that is Stage 13 work.

## Preset: VW 2.0 TFSI (AXX), Golf GTI Mk5

- Sources and values: `docs/PRESETS.md`. The specification table and torque curve are from VW SSP 337 (page 6, diagram S337_008), with the curve read from the figure at 500 RPM steps.
- Calibration (Node, steady full load in normal air): within 7 Nm of the curve from 2,000 to 6,500 RPM, +22 Nm at 1,000 and −15 Nm at 1,500 RPM, about 9 Nm RMS. The boost target is calibrated to 0.6 bar against the published 0.9 bar; this deviation is recorded in `docs/PRESETS.md`. A standard sweep gives 148.6 kW at about 6,070 RPM and 289 Nm (rated 147 kW and 280 Nm), with the highest part stress at 92%. A boost push at 4,000 RPM ends with a cracked cast piston at a 1.6 bar target.
- Vitest: 135 passed. New tests:
  - `src/sim/presets.test.ts` checks the published geometry, eight curve points within their recorded tolerances with no failure and stress under 95%, and about 147 kW at 5,700 RPM;
  - the starting-build test (`src/sim/builds.test.ts`) now also checks that the preset starts, idles and completes a sweep.
- Chromium (Playwright, new case in `tests/bench.spec.ts`): loading the preset shows its rating and "Stock". It labels the Boost target field as unused while maps set boost. Fitting forged pistons lists "Pistons: Cast → Forged", and the rebuilt engine starts.
- Also fixed:
  - the Forced induction note still said knock was not modelled and boost could not damage the engine; it now describes knock control and failures;
  - a push step that fails before its measurement window now reports the boost at the failure instead of 0.
- Build passes; lint passes with the existing warning.

## Model 1.13.0: camshafts and valve timing (4 November)

- Compatibility: all 165 earlier tests pass unchanged, including every preset curve and the bit-identity checks. Converting the Road engine's fixed events to profiles gives bit-identical torque.
- Trends (Node, Road engine, held at full load):
  - race grade against converted stock: 145.5 against 173.4 Nm at 2,000 RPM and 172.9 against 149.8 at 6,500;
  - idle-speed spread 65 against 23 RPM;
  - phasing (+30° below 3,000 RPM, −15° above) raises torque at both 2,000 and 6,500 RPM;
  - phasers move at 200°/s (20° after 0.1 s);
  - valve-float factor with stock springs: 0.99 mild, 0.90 fast road, 0.71 race; 1.02 for race on uprated springs;
  - a race cam at 11:1 compression is clear unphased, but advancing its intake 60° fails Valve clearance repeatably.
- Presets recalibrated with phasing (details in `docs/PRESETS.md`): Golf RMS 9 → 5 Nm (1,000 RPM now 172 against 170); K20A 11 → 3 Nm (1,500 RPM now 159 against 160); SR20 within 2 Nm of both rated points. Highest sweep stress 84–92%.
- Vitest: 171 passed (new `src/sim/cams.test.ts`).
- Chromium: a new case converts the Road engine to profiles (240/225° duration, 20° overlap), fits the race grade (290/285°) and turns on phasers. The Intake cam map tab and the bench's cam strip then appear, and the engine runs. The K20A HIGH CAM case still passes. Screenshots taken in that run show the cutaway rendering, and the race grade on the Road engine at 75° of overlap and 91% of valve clearance.
- A stale hot-reloaded module in a long-running dev server made the editor fail to render (`valveDiameter is not defined`). A fresh server served the correct module and both cases passed. This was a development-server artefact, not a code fault, and production builds are unaffected.
- Benchmark (Node): medians 0.38 ms at 1,000–7,500 RPM and 0.69 ms at 8,400, within noise of 1.12.0, against a 2.67 ms budget.
- Build passes; lint passes with the existing warning.

## Model 1.12.0 and Stage 7's inline-fours (4 November)

- Two-stage cam: a new `core.test.ts` case checks that the cam is low below its switch speed, gives torque identical to the build without a cam there, gives more torque on the high cam above it, and drops back only 150 RPM below the switch. Builds without a cam switch are unchanged by construction: the default is null and the core uses the base valve areas and closing.
- Presets (Node, steady full load in normal air; details and sources in `docs/PRESETS.md`):
  - K20A: within 12 Nm of Honda's curve from 2,500 to 8,000 RPM, including the VTEC dip and crossover; +28 Nm at 1,500 RPM. Sweep: 162.3 kW and 213 Nm (rated 165 kW and 215 Nm).
  - 4G63T: 384/383 Nm at 3,500 RPM and 305/302 Nm at 6,500. Sweep: 209.3 kW and 390 Nm.
  - SR20DET: 282/275 Nm at 4,800 RPM and 277/274 Nm at 6,400. Sweep: 189.5 kW and 284 Nm.
  - 4A-GE: 149/149 Nm at 5,200 RPM and 130/127 Nm at 6,600. Sweep: 91.3 kW and 150 Nm.

  Highest part stress in standard sweeps is 86–90%. Boost pushes crack cast pistons: on the Evo at +1.4 bar and on the SR20 at +1.8 bar. Timing pushes on the K20A and 4A-GE reach the push limit without a failure.
- Vitest: 165 passed. `src/sim/presets.test.ts` now checks every preset's displacement, published points within recorded tolerances (no failure, stress under 95%) and rated power within 6%. The starting-build test checks that all five start, idle and complete a sweep.
- Chromium: a new case loads the K20A, revs it and sees HIGH CAM; the Golf case still passes.
- Benchmark (Node): medians 0.36–0.38 ms at 1,000–7,500 RPM and 0.69 ms at 8,400 RPM, unchanged from 1.11.0 within noise, against a 2.67 ms budget.
- Build passes; lint passes with the existing warning.

## Dyno run-down and afterfire oxygen (4 November)

- Run-down (user request: a pull ended in an abrupt stop). Road and Golf 1,500–6,200 RPM sweeps now end with 27 run-down samples: a brief lift-off transient, then engine braking of about −54 Nm near 5,500 RPM falling to −22 to −30 Nm at 1,500 RPM. Released afterwards, both engines idle at 910–920 RPM. New `core.test.ts` cases check that the run-down falls monotonically with negative torque, that the run validates, that the engine then idles, and that an emergency stop during the run-down keeps the completed pull.
- Afterfire (user report: constant afterfire on the Golf in sixth gear at full throttle). Afterfires per second, before → after the oxygen rule:
  - Golf at full throttle and 5,400 RPM (λ 0.88): 89 → 0;
  - Golf at λ 0.8: 78 → 0;
  - hot hatch at full throttle and 5,000 RPM (λ 1): 34 → 0;
  - 9k spark-cut limiter: 30 → 31;
  - Golf with ignition cut at 5,000 RPM: 15 → 20;
  - 9k lift-off with overrun cut off: 0.5 → 0.

  `acoustics.test.ts` now also checks that a hot λ 0.85 exhaust does not afterfire. Sound only: no physics result changed.
- Vitest: 137 passed. Chromium full bench suite: 16 of 19 passed. The run-down's sign-in test fails at the sign-in step only (local API not running), after its live and quick pulls pass. The over-boost and Golf cases failed under full-suite load and passed when rerun alone.

### 3 November — cutaway geometry follow-up

- Added solid rear half-bores, machined liners/deck faces and crankcase end walls; relieved piston skirts and wrist pins; rigid I-section rods with bearing eyes and caps; stepped head flanges and cam supports; closer default framing. Simulation and audio code were not changed by this pass.
- `npm run build` passed. `npm run lint` passed with an existing `BenchPage.tsx:681` effect-cleanup ref warning. Build also reports missing `VITE_APP_NAME`, dependency annotation and bundle-size warnings.
- Chromium guest workflow could not start: Vite failed with `listen EPERM: operation not permitted 0.0.0.0:5175`. No rendered visual, animation, mobile-fit or performance verification is claimed for this pass. Review those on the actual browser before calling the overhaul complete.

### 3 November — materials, exhaust and control clearance

- User accepted the preceding geometry pass, reporting that the initial framing overlapped the cylinder controls. The canvas now reserves a 76 px strip for those controls and the default camera is slightly further away.
- Added a deterministic 64×64 casting grain texture (disposed on rebuild), distinct machined/forged finishes, steel rather than gold-coloured major internals, exhaust flanges/bolts, tangent-aligned weld collars, a tapered collector and open tailpipe. Header routing stays near the head until the block end. Removed the canvas CSS colour filter so the renderer controls material colours.
- `npm run build`, `npm run lint` and `git diff --check` passed. Existing Vite environment/dependency/bundle warnings and the `BenchPage.tsx:681` ref-cleanup lint warning remain.
- Rendered review and frame-time measurements remain pending; the previously confirmed local Vite port restriction prevents the browser workflow in this execution environment. No new browser-test pass is claimed.
- Playwright, run from a separate checkout that had only these changes, because another session's in-progress 3D work in the shared checkout made the cylinder-inspect clicks time out. Result: 42 passed, 4 failed, 2 storage cases skipped.
  - The sign-in navigation test fails in both browsers because the local API was not running.
  - The live emergency-stop test (both browsers) and the loaded-stall restart (Firefox) failed in the full run but passed when run alone, in both browsers. In the failing runs the live pull either finished despite the stop (Chromium) or stalled at 5 points without aborting (Firefox). Possible causes include the slower AudioWorklet start while it builds the fuel's tables, but this was not investigated further: the user asked on 3 November 2026 for Vitest and Chromium checks to be enough.
- Build and lint of `src/sim` pass.

### 3 November — timing drive and valve gear

- Added 24/48-tooth crank/cam pulleys (instanced teeth), a flat belt around their outer envelope, shaft connections, half-speed cam motion, firing-order-phased cam profiles, bucket followers, retainers and compressing helical springs. Added rear half-cover ribs, fasteners and oil cap while keeping the front mechanism open.
- Visual event windows match `EngineCore`: intake 350° to `intakeClose`, exhaust 145–370°. Lift is illustrative (0.1 × bore), the sampled radial lobes are not manufacturing profiles, and the belt has no dynamic tension/slip simulation. Physics and audio were not changed.
- Browser rendering and frame-time validation remain pending because of the previously confirmed local server port restriction. The earlier user acceptance applies to the preceding graphics passes, not this one.
- Final `npm run build`, `npm run lint` and `git diff --check` passed. Existing build warnings and the `BenchPage.tsx:681` ref-cleanup warning remain; no browser-test pass is claimed.

### 3 November — crank and exhaust clearance corrections

- Replaced the through-shaft with separated main journals, moved counterweights to the throw cheeks, and cleared the big-end eye/cap/beam around the crankpin. Rod axial half-width is at most 0.095 × bore; cheek inner faces are at 0.16 × bore. Crankpin radius is 0.15 × bore and big-end eye inner radius is 0.16 × bore.
- Relocated the turbo beyond the exhaust collector, away from the timing drive, and connected collector → turbine inlet → turbine outlet → downstream exhaust. Removed the old disconnected dummy downpipe.
- Rounded polyline pipe curves replace overshooting splines. Sampled 401 points per primary at 40/86/150 mm bore for 4-1 and 4-2-1 layouts: minimum centre spacing between non-merging primaries was respectively 0.250 and 0.199 × bore, versus 0.164 × bore pipe diameter. This is a routing sanity check, not complete mesh collision or rendered validation; intended paired junctions were excluded.
- Browser inspection remains pending under the previously recorded local-port restriction. The user’s reported intersections are not considered visually verified fixed until reviewed in the live browser.
- Final build, lint and whitespace checks passed, retaining existing build warnings and the `BenchPage.tsx:681` lint warning. No simulation changes or new browser-test pass are claimed.

### 3 November — turbo intake route and camera presets

- Added compressor-to-intake charge piping with bounded bends, couplers and clamps. Intercooler geometry follows `induction.intercooler.effectiveness > 0`; zero uses a direct route. The cooler has end tanks and 22 instanced fins. Carb/TBI intake uses a sealed hat; port/direct injection uses an end-mounted throttle housing. Direct injection now has manifold runners/plenum as well as injectors.
- Added Overview, Timing, Crank and conditional Turbo view buttons. Overview bounds exclude transient gas overlays and the floor; camera fitting accounts for aspect ratio. Manual orbit cancels automatic fitting and its position remains preserved across rebuilds. A 112 px strip separates camera/cylinder controls from the canvas.
- The Chromium narrow-layout workflow was attempted but its Vite web server could not start. Browser appearance, camera interactions, pipe collisions, narrow-layout fit and frame cost remain unverified. No physics/audio/schema changes were made.
- Final production build, lint and whitespace checks passed. Existing build warnings and the `BenchPage.tsx:681` cleanup-ref warning remain.
