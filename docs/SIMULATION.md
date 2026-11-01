# Engine model and browser-host decision

Model version: `eb-0d-1.1.0` (1.1.0 scales friction with displacement and makes starter torque configurable; runs recorded by `eb-0d-1.0.0` remain readable as history). Written in TypeScript. Scope: four-stroke, naturally aspirated, fictional inline-four petrol engines. The Road and Sport definitions are experimental starting points, not calibrated replicas of production engines.

## Core equations and assumptions

Each cylinder has gas mass, internal energy, fresh charge, pressure and combustion state. Slider-crank geometry gives volume and its derivative with crank angle. Ideal-gas pressure acts on that derivative to produce indicated crank torque. Empirical mechanical friction is subtracted. It was fitted on a 2.0 L engine and scales linearly with displacement, which assumes a size-independent friction mean effective pressure; very small or very large engines are therefore rough estimates; power is derived from brake torque and angular speed. No horsepower curve or audio recording is supplied as an input.

Quasi-steady effective valve areas feed a compressible isentropic orifice equation, including sonic choking and reverse flow. Flow transports enthalpy; energy changes through combustion, pressure-volume work and simple wall heat transfer. Combustion uses a Wiebe fraction with exponent 3 and coefficient 6.9. Effective valve areas include the discharge coefficient. Specific heats and gas constant are held fixed. Wave propagation, exhaust pipes, acoustic radiation and detailed chemical kinetics are not solved.

Air humidity is relative humidity; oxygen is dry-gas mole/volume fraction. Water vapour displaces dry air. Dry gas is approximated as oxygen/nitrogen; the bulk gas constant and specific heats remain air approximations over the supported range. Fuel command is fresh charge divided by `14.7 * lambda`; heat release is limited by both available fuel and oxygen, with a 43 MJ/kg fuel heating value. Extra oxygen cannot burn fuel that is not present. Fuel enrichment is not automatically recalibrated for every environment.

A simple lumped coolant state evolves separately from ambient temperature. This is illustrative thermal behaviour, not a prediction of overheating or component life. Knock, emissions, fuel evaporation, oil pressure, valve float, wear and failures are not implemented. The mechanical limit is a configurable assumed capability used for warnings and dyno validation/abort; it is not a component stress calculation.

Schema ranges bound the operating envelope and are deliberately wide so that unusual builds are possible: bore and stroke 20–300 mm, rod length at least 0.75 × stroke (rod to crank-radius ratio 1.5), compression 5–20:1, effective valve areas 10–20,000/25,000 mm², inertia 0.01–20 kg·m², limiter up to 20,000 RPM and mechanical limit up to 25,000 RPM. These ranges are what the core has been stress-tested across (every combination of the extremes at 600 and 19,900 RPM, plus free starts at idle and full throttle), not a statement that such engines are buildable or that the model is accurate there. Valve timing, ignition, burn duration and mixture keep their original ranges. The model rejects invalid temperatures (below 30 K or above 6,000 K)/mass and limits a single outflow integration increment to 8% of cylinder mass. These are numerical safeguards, not physical failure models. Errors stop the run and are exposed instead of replacing data with a synthetic curve.

## Integration and clocks

The pure core has a fixed 48,000-step/second time contract. Each step is subdivided when necessary to keep crank-angle travel within approximately one degree. Four substeps per time step is a hard computational bound; exceeding it raises an error. Commanded speeds up to the 20,000 RPM limiter need at most three substeps; the four-substep bound corresponds to about 32,000 RPM, above the 25,000 RPM maximum mechanical limit.

Starting uses the build's configurable starter torque (default 70 Nm for builds saved before it existed, 150 Nm for the presets), applied at the crank below 500 RPM; time advancement never divides by RPM. If the starter is engaged but the crank stays below 20 RPM for 0.4 seconds, the core latches a starter-stalled flag, cleared above 200 RPM or on reset. The editor estimates the torque needed to turn the engine over by holding it at 150 RPM with ignition off for one cycle and taking the peak resisting torque. A weaker starter may still start the engine on flywheel momentum, so the estimate is a guide, not a hard threshold. The starter automatically releases after 1.2 seconds on Start. The operator can hold the starter separately. Bench restart explicitly unloads the dyno and releases RPM hold. Fuel cut latches at the electronic limit and releases 220 RPM below it. The UI keeps a recent-cut status visible for 1.5 seconds so normal limiter cycling does not flash the warning.

The live AudioWorklet uses the audio clock and advances this same core, using a fractional accumulator when the device sample rate differs from 48 kHz. Headless worker batches are capped at 4,800 frames and yield between batches to process cancellation; progress publication is capped at 20 Hz. Run IDs keep late messages from a superseded procedure out of the current result. Node tests advance the identical core. Core state contains no DOM, audio-device or HTTP dependencies.

## Dyno procedures

Both modes use `DynoTest`: a prescribed-speed dyno, with speed-control reaction torque including rotational acceleration. Simulated brake torque comes from cylinder pressure minus empirical friction; absorbed torque is recorded separately. The initial 0.8 seconds settle the starting state. A sweep measures a 0.15-second starting hold, then ramps at the requested rate and records averaged samples every approximately 0.15 seconds. A steady-state test waits at each RPM until adjacent torque windows agree within 4% or 3 Nm, after a minimum settling interval; it aborts if a point fails to settle within four seconds.

Live pull renders the procedure in real time with sound and motion. Quick test calculates it silently in the worker. Neither calculation is driven by React or animation frames. There is currently no replay feature: quick-test progress/results are labelled as calculation. Snapshot audio auditioning is explicitly a fresh simulation at the selected RPM and full throttle, not a recording of a previous run.

Automatic tests own throttle and RPM, disabling conflicting manual controls. Emergency stop and hidden-tab interruption retain incomplete samples and a reason. Completed runs cannot be retroactively aborted. Pausing/closing a bench does not imply server persistence; guest slots use tab-scoped session storage. Recipes are schema-validated, versioned and capped at 50 kB on import.

## Sound and view

Audio originates from computed exhaust mass-flow pulses, scaled inversely with displacement so tiny and huge engines stay audible without clipping, passed through a simple low-pass/DC-blocking filter and soft output bound. A Web Audio compressor and master gain provide additional limiting. No sample banks, impulse responses or third-party sound assets are included. This produces engine-like firing character but does not predict a particular exhaust system's sound.

Three.js generates piston, rod, crank, cylinder sleeve and valve geometry from the current engine definition, including compression-dependent head clearance. Camera framing, zoom limits and the floor grid scale with block size. Normal motion extrapolates bounded elapsed time from the latest telemetry snapshot. Normal view uses telemetry; slow-motion inspection is a separate 15-RPM display mode with audio muted. Cylinder pressure traces retain the most recent cycle in two-degree bins. Idle torque/power may fluctuate around zero because these are cycle-smoothed measurements rather than invented positive idle power.

## Host decision and tolerances

Initial supported target: desktop Chromium and Firefox on hardware with Web Audio and WebGL. If WebGL is unavailable, controls/audio/dyno remain usable and the view reports the limitation. More layouts and mobile performance need new measurements.

Use the AudioWorklet-hosted design for the initial inline-four. The worker/ring-buffer fallback remains available as a future architecture change if measured cost grows. Do not infer this decision applies to V8/V12 engines or all devices.

Cross-host acceptance for the same prescribed inputs: RPM difference below 0.01 RPM, torque below 0.01 Nm, instantaneous pressure relative error below 0.01%, angle difference below 0.0003 rad, and two-degree Float32 pressure-trace bins below 0.1% relative error (10 kPa denominator floor). Live/quick controlled-speed samples are checked more tightly, to seven decimal places, on the tested Chromium runtime. These are numerical agreement tolerances, not estimates of real-world accuracy.

Performance commands: `npm run benchmark` and `npm run test:browser` in `frontend/`. Node reports median/p99/max 128-frame block cost, cost per cylinder-step, substep count and quick-test speed. Browser tests exercise actual workers and AudioWorklets and render real offline PCM. The optional bench diagnostics use a coarse wall-clock timer; they are observations, not a precise real-time profiling guarantee. See `VERIFICATION.md` for measured results and remaining acceptance checks.

## Reference review and attribution

Reviewed Engine Simulator revision [`85f7c3b959a908ed5232ede4f1a4ac7eafe6b630`](https://github.com/ange-yaghi/engine-sim/tree/85f7c3b959a908ed5232ede4f1a4ac7eafe6b630), particularly `src/gas_system.cpp` and `src/combustion_chamber.cpp`, for gas-state, energy/flow accounting and exhaust-driven sound concepts. Its repository's MIT terms must accompany future adapted portions. No source code, C++ library, model script, preset or asset from that project has been copied or mechanically translated into this implementation; it is not a port of that solver.

Physical-equation reference: [NASA Glenn — Mass Flow Choking](https://www.grc.nasa.gov/www/k-12/airplane/mflchk.html). Implementation/API references: [AudioWorklet processing](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process), [Zod JSON Schema export](https://zod.dev/json-schema), [Three.js documentation](https://threejs.org/docs/) and [uPlot](https://github.com/leeoniya/uPlot).
