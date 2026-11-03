# Engine Bench — Delivery Plan

Updated: 3 November 2026

## Active delivery goal

Phases 1–3 and Stage 5 are complete, and Stage 6 is in progress: combustion and knock (model 1.6.0), engine management (1.7.0), per-cylinder temperatures (1.8.0), enrichment cooling (1.9.0) and dissociation (1.10.0) are implemented. Phase 2's human first-use check remains open and does not block later work.

Direction set by the user on 2 November 2026: make the bench fun and interesting to play with. The order of work is now:

1. Stage 5, sound and bench feel — complete (model 1.5.0); the user accepted the sound on 2 November 2026.
2. Stage 6, tuning, temperatures and limits — in progress. Combustion and knock (1.6.0) and ignition/λ/boost maps with fuel-supply limits (1.7.0), per-cylinder temperatures (1.8.0), enrichment cooling (1.9.0) and dissociation (1.10.0) are implemented; upgradeable parts and failures are next.
3. Stage 7, famous real engines, starting with the VW EA113 2.0 TFSI (AXX) from the 2005 Golf GTI.
4. Stage 8, a 3D overhaul. It is independent of the simulation and may run alongside stages 5–7.

Two-stroke engines (Stage 9) move behind these, followed by other layouts (Stage 10). A UI revision (Stage 11) follows once those features are in place (user decision, 3 November 2026).

## Product direction

Build a browser-based virtual engine workshop. Users configure an engine, inspect it in animated 3D, set test-cell conditions, control the throttle, hear simulated engine sound and run repeatable dyno tests. Support both custom builds and documented presets based on existing engines, including the VW AXX requested by the user.

The user's goal (2 November 2026) is a tuner's sandbox. Pick a famous engine, tune its timing, fuel and boost, fit stronger parts such as forged pistons and rods, and keep pushing to see how much it takes before something gives. Watch per-cylinder temperatures and hear and see the engine change. Every part and setting is available from the start, with no unlocks, currency or scores.

The target is a credible enthusiast and learning simulator. Performance figures and component limits are model estimates; engineering or tuning accuracy must be demonstrated through validation before making stronger claims. This applies especially to "how much would it take": real component strengths are rarely published, so failure limits are labelled estimates with recorded assumptions, never predictions for a real engine.

## Agreed decisions

- The frontend, simulation and sound-generation code use TypeScript, compiled to browser JavaScript. No C++, native simulation service, or C++ compiled to WebAssembly.
- Retain Vite, React, routing, Material UI and the Laravel API from the extracted project shell.
- Run the engine simulation locally in the browser. Laravel manages authentication, access control, presets, saved configurations and stored test results.
- Use Engine Simulator as a reference and selectively adapt useful algorithms to TypeScript. Build our own application architecture, editor, engine format, test bench and 3D presentation.
- Keep `../project-base` generic. Engine-specific work belongs in this repository. The two projects are independent copies.
- Begin with one configurable inline-four and prove the complete experience. Decision (2 November 2026, user request): famous real inline-fours, tuning and component limits now come before a contrasting layout. The two-stroke follows them, then the other layouts and their famous engines.
- Allow the bench to be used without signing in. An account is required only to save builds and runs to the server; temporary baseline/modified comparisons and downloadable build recipes are available to guests. When an account is needed for saving, it should feel like a personal workspace; the inherited company/role model remains available for teams.

## Experience priorities

The core loop is: start an engine, make an understandable change, hear and see the effect, test it, compare it with the baseline and try another idea. Numerical fidelity supports this experience; it does not replace it.

- **Immediate first run:** open a ready-to-run inline-four on the bench without registration or company setup. One explicit Start action enables sound and starts the engine; expose throttle immediately.
- **Reversible experiments:** offer temporary Baseline and Modified slots, duplicate/reset actions, curve overlays and a clear list of changed settings before server persistence exists. Preserve the guest experiment through sign-in so saving does not require starting again.
- **Approachable configuration:** provide described starting configurations, such as a mild road engine and a higher-revving variant, using only supported model differences. Keep the detailed editor available without making every numerical parameter part of the first-use experience.
- **Clear edit lifecycle:** by default, geometry and structural changes require an explicit stop/rebuild/reset. Throttle and supported operational adjustments may change live. Show which applies before a change is committed and retain the previous configuration for restoration. Decision (1 November 2026, user request): an opt-in **Live updates** mode applies each valid edit to the running engine without stopping it, carrying crank speed, controls and gas state over; Restore previous build returns to the build before the live edits. Automatic tests and snapshot auditioning hold live edits until they end, and Stop & rebuild remains the explicit reset. Decision (3 November 2026, user request): a confirmed **Full reset** returns everything to the Road build in normal air, with default test settings and controls and fresh audio and worker hosts. It keeps comparison runs, saved builds and preferences, so a build that has stopped working can always be escaped.
- **A bench worth watching:** prioritise responsive throttle, audible engine character, visible motion and a live dyno pull. Keep quick calculation available as a separate mode.
- **Optional explanations:** add cylinder firing highlights and intake/compression/power/exhaust colour overlays to the cutaway. Selecting a cylinder can reveal its pressure trace. Keep these overlays optional and distinguish slow-motion inspection from real-time operation.
- **Small optional challenges:** give experiments a purpose without restricting the sandbox. Examples include improving torque in a chosen RPM range at fixed displacement, comparing ambient conditions, or finding a useful operating range within modelled limits. Use genuine simulated trade-offs and published challenge conditions, with no currency, grind or unlock requirements.
- **Shareable experiments:** introduce downloadable, versioned build recipes early, then shareable links. Clearly distinguish user-submitted results from verified results; trusted competition is a separate later feature.

## Planned technical direction

Agreed in the plan review of 1 November 2026. Items marked "prototype" must be confirmed by Stage 1 measurements before they become fixed decisions; record the outcome here.

- **Simulation model:** a crank-angle-resolved, per-cylinder zero-dimensional model. Each cylinder has its own gas state, and valve flow uses compressible orifice equations. Combustion follows a Wiebe burn-rate curve with simple wall heat transfer. Cylinder pressure produces crank torque, and exhaust pulses drive the audio. A mean-value model is not sufficient because it cannot produce firing-event sound. Target roughly 1° crank-angle resolution (prototype: confirm the integration method, resolution and cost per cylinder). Engine Simulator is a reference for ideas, not for its solver structure.
- **One simulation core, three hosts:** the same pure TypeScript core runs in an AudioWorklet for the live bench (audio clock drives real-time stepping), in a Web Worker for headless dyno sweeps faster than real time, and in Node for tests. This avoids synchronising a worker's simulation with the audio thread through messages. The live simulation host remains provisional until worst-case callback measurements establish sufficient headroom across the supported RPM range; include starting, stopping and load transitions. Fallback (prototype): simulation in a worker feeding the AudioWorklet through a lock-free `SharedArrayBuffer` ring buffer. That requires cross-origin isolation (COOP/COEP headers in Vite and production), which restricts third-party embeds and assets.
- **Engine definition schema:** Zod (v4) schemas are the source of truth for the versioned engine definition, bench conditions and run format. Generate TypeScript types from them and export JSON Schema. Laravel validates stored documents against the exported JSON Schema (for example with `opis/json-schema`) instead of duplicating rules in PHP.
- **Run storage:** store each run's samples as a single compressed JSON or binary blob with a size cap, not as one database row per sample. Store snapshots, versions, conditions and status as queryable columns.
- **Units:** SI internally. Use lightweight branded types (for example `Metres`, `Pascals`, `RadiansPerSecond`) on the simulation's public interfaces to catch unit mix-ups at compile time.
- **Testing:** Vitest for the simulation core from the first numerical code. Playwright for browser checks of audio, worker, 3D and save/reload behaviour once those features exist.
- **Charts:** uPlot for streaming telemetry and dyno curves (prototype: confirm update cost). Avoid chart libraries that re-render through React at telemetry rates.
- **3D:** Three.js, with geometry generated procedurally from the engine definition. If react-three-fiber is used, animate through per-frame callbacks and refs, never through React state.
- **Results are generated in the browser:** the server stores but cannot vouch for submitted results. Acceptable for private builds. Build recipes and explicitly unverified results may be shared without simulation verification. Trusted leaderboards or verified performance claims require verification, for example re-running the TypeScript core in Node.

## Current state

- [x] Extract a reusable shell from Image Trainer without modifying the source application.
- [x] Create Project Base and initialise Engine Bench from it.
- [x] Retain registration, email verification, password reset, hashed token sessions, company setup, user administration, notifications and themes.
- [x] Verify the extracted shell in staging: frontend build/lint, Docker build and 20 backend tests with 84 assertions.
- [x] Add this product plan and project-specific agent guidance.
- [x] Implement the phase 1/2 inline-four configuration, simulation, 3D, sound and dyno functionality; see `docs/VERIFICATION.md` for evidence and the remaining first-use acceptance gate.

The shell checks above describe the extraction verification, not verification of engine features. Local setup and a demo-account login have also been completed during development; check current service state before assuming the application is running. Dependencies and local environment files are created by `scripts/setup.sh`.

## Core user workflow

1. Open a ready-to-run engine on the guest bench and press Start; no account is needed.
2. Blip the throttle and inspect the engine's live motion, sound and telemetry.
3. Capture a baseline, duplicate the build and make one supported modification. Stop/rebuild for structural changes and resolve validation errors before restarting.
4. Choose environmental and engine starting conditions, retaining the baseline for comparison.
5. Run a live dyno pull or a quick test; inspect curves, changed settings and sound at comparable RPM/load points.
6. Restore the baseline or try another experiment, engine configuration or optional challenge.
7. Download a build recipe, or sign in to save builds and runs to the server. Preserve the current guest experiment across authentication.

## Engine configuration

Start with a four-stroke petrol inline-four. Two-stroke engines with editable ports and exhaust shapes were requested by the user on 1 November 2026 (Stage 9; design in `docs/TWO_STROKE.md`). They now follow the tuning and real-engine stages. Expand to inline-six, V6, V8 and boxer layouts after that.

- Geometry: cylinder count/layout, bore, stroke, connecting-rod length and compression ratio.
- Timing: firing order, crank phasing, valve timing/lift and ignition timing, introduced as their simulation support becomes available.
- Breathing and fuelling: intake/exhaust restrictions, exhaust system, fuel systems (carburettor, throttle-body, port and direct injection), mixture control, fuel grade and forced induction.
- Engine management (Stage 6): ignition, fuel and boost maps by RPM and load, knock control, injector and fuel-pump capacity.
- Rotating assembly and parts (Stage 6): inertia, friction and selectable components (pistons, rods, head fasteners, valve springs, turbo, intercooler, injectors, fuel pump), each with estimated limits.
- Operating settings: idle control, throttle response, electronic rev limiter and cooling settings.

Displacement is derived from bore, stroke and cylinder count. A target-capacity control must explicitly choose which geometric value to solve for. Do not expose independent contradictory values.

Provide approachable starting configurations alongside the advanced parameters. Structural edits must clearly stop/rebuild/reset the engine; live operating controls must be distinguished from them. Validate configuration ranges and mechanical compatibility before starting. Reject unsupported configurations rather than displaying controls that have no effect. Use SI units internally and clearly labelled conversions in the interface.

## Bench and test cell

- Independent ambient temperature, barometric pressure, relative humidity and oxygen concentration controls, with a normal-air starting preset.
- Define oxygen concentration on an explicit basis (for example dry-gas volume fraction); account for humidity consistently instead of double-counting water vapour.
- Track intake conditions separately where intake heating, boost or intercooling is modelled.
- Separate room temperature from engine coolant/oil starting temperatures and subsequent engine heating.
- Starter, ignition, manual throttle, emergency stop and adjustable dyno load.
- Explain environmental effects through air charge, fuelling and combustion assumptions. Oxygen enrichment must not be a simple arbitrary power multiplier.
- Bound the supported environmental range. More extreme mixtures require explicit model support.

Implement these controls progressively with their underlying behaviour. Thermal, knock and oxygen-enrichment fidelity require separate verification and must not be implied by a working slider.

## Dyno and results

Provide manual load control, RPM hold and an automatic sweep with start/end RPM, throttle target, sweep rate and abort conditions. Show torque, power and RPM throughout the run, including the RPM at peak torque and peak power.

- Distinguish engine brake torque from torque absorbed by the dyno during acceleration; account for inertia and losses consistently.
- Provide a steady-state step test (hold each RPM point until stable) as the reference curve. Inertia-corrected sweeps can be compared against it so that transient error is visible.
- Offer **Live pull** and **Quick test** modes using the same simulation core, configuration/conditions snapshots and test procedure. Live pull advances in real time with synchronised sound, animation and measured samples; Quick test runs headlessly in a worker faster than real time where possible. Numerical results must not depend on UI frame rate, and equivalent inputs must agree within the stated tolerance across modes.
- During an automatic live pull, the procedure owns throttle and load; manual intervention must explicitly cancel the procedure or be disabled with a clear explanation. Stop/emergency stop aborts the active run and retains its incomplete samples and reason.
- Label any replay of a completed quick test as playback. Stopping playback does not retroactively abort or alter the completed run. To interact with the engine, explicitly leave playback and return to the live bench; do not silently combine historical samples with new inputs.
- Derive power from torque and angular speed with tested unit conversions.
- First release reports simulated crankshaft output under the selected conditions. Do not invent wheel-power or drivetrain-loss figures.
- Preserve raw results. Atmospheric correction can follow with a named method and recorded assumptions; keep corrected and uncorrected curves distinguishable.
- Record full configuration/conditions snapshots, simulation/schema versions, test procedure, samples, completion status, warnings and abort reason.
- Save interrupted runs as incomplete. Do not present them as successful full sweeps.
- In Stage 2, provide guest-session Baseline and Modified runs with curve overlays, changed-setting summaries and repeatable audio comparisons at equivalent RPM/load points. Do not gate temporary comparison behind account creation or server storage.
- Extend those comparisons to saved historical runs in Stage 3, retaining visible configuration and environmental differences.

## Mechanical limits

Treat the electronic limiter and the engine's mechanical capability separately. Raising a limiter does not strengthen components.

First implement a configurable limiter, supported operating bounds, overspeed warnings and dyno abort behaviour. Then add validated estimates for piston speed, component loading, valvetrain limits, heat and lubrication as their models become available.

Knock, valve float, component overload and catastrophic failures are planned for Stage 6 (user request, 2 November 2026). Wear stays a later extension. Use simplified, labelled estimates with recorded assumptions. Do not claim that every engine fails at one universal RPM or piston-speed value. A failure stops the engine and explains what failed and why. A rebuild returns it to its last build. An optional indestructible mode keeps pure exploration available. Failures are never a currency, penalty or unlock gate.

## Browser architecture

Implemented phase 1–3 responsibilities:

| Area | Responsibility |
| --- | --- |
| React interface | Editor, bench controls, telemetry, graphs, saved builds and account flows |
| Pure TypeScript simulation | Engine state, bounded integration with crank-angle resolution, per-cylinder gas exchange and combustion, and dyno calculations; runs unchanged in the AudioWorklet, a worker and Node |
| AudioWorklet | Live bench: advance the simulation on the audio clock, synthesise sound from exhaust/intake pulses and publish bounded telemetry snapshots |
| Web Worker | Headless dyno sweeps and other bulk runs, faster than real time where possible |
| 3D renderer | Three.js geometry generated from the engine definition and animated from telemetry snapshots |
| Laravel/MySQL | Authorised storage, engine/preset versions, immutable run snapshots and comparison data |

Keep the simulation independent of React, the renderer and HTTP. Define typed messages and explicit lifecycle controls: initialise, configure, start, stop, reset, advance and report status. Define a deterministic relationship between simulation time, crank angle and the audio sample clock. Prototype a fixed time-based advance contract with bounded substeps that limit angular advance to the target resolution, and record the measured integration decision in Stage 1. Handle zero RPM, starter torque, stalling and changing speed explicitly; never divide by RPM to advance a stopped engine. Render and update React at separate rates. Define pause/resume behaviour for hidden tabs and suspended audio contexts.

Generate sound from firing events and engine state, with intake/exhaust character, rather than only pitch-shifting a generic recording. Audio starts through an explicit user gesture. Keep audible output bounded with a master volume and output limiter, and avoid allocation-heavy work inside audio processing callbacks. If the simulation outgrows the audio callback budget, move it to the worker/ring-buffer fallback described above rather than dropping audio quality silently.

Support keyboard and gamepad throttle input as well as on-screen controls.

Use one authoritative engine definition for physics, sound and geometry. The cutaway must show the selected cylinder arrangement, piston travel and firing sequence. Include a slow-motion inspection mode whose playback speed is clearly distinguished from a real-time bench run. Add optional firing highlights, stroke-phase colours and a selected-cylinder pressure trace without cluttering the normal bench view.

Three.js and uPlot are installed and used by the phase 2 cutaway and telemetry/dyno views. Benchmark representative desktop browsers and hardware before committing numerical performance targets or maximum cylinder counts.

## Data and access

Proposed records: engine definitions, curated presets, bench conditions and dyno runs. Keep ownership and visibility explicit, using the existing company membership/role model. Validate ownership on every endpoint that reads or modifies private builds and results. Guest experiments and temporary comparison slots stay client-side until the user explicitly saves; carry them across sign-in and never discard them to make room for an empty server workspace.

Treat curated presets as versioned starting points. Editing one creates a user build. Each preset needs specification sources and a distinction between documented, inferred and calibrated values. A preset is not an accurate replica simply because it matches peak horsepower.

Use schema versions and migrations for saved engine definitions. Preserve run snapshots when a build or preset changes.

Stored samples are the authoritative record of a run. JavaScript's transcendental functions (`Math.exp`, `Math.sin` and others) are not guaranteed to give bit-identical results across browser engines. A rerun of a stored configuration on the same model version must therefore match within a stated tolerance, not exactly. Record the browser/runtime with each run. Seeders may provide curated demo presets after validation; never seed real user data or external credentials.

## Reference code and licensing

Reference: [Ange Yaghi's Engine Simulator](https://github.com/ange-yaghi/engine-sim). Its linked repository carries an [MIT licence](https://github.com/ange-yaghi/engine-sim/blob/master/LICENSE), as checked during the initial discussion. The README points to moved development/releases; do not infer that all later code or community presets share the same terms.

Before adapting code, pin and record the source revision, inspect the relevant files and dependencies, and retain the required notices. Record adapted files, TypeScript destinations and algorithm/model limitations in a third-party attribution record when reuse begins. Review assets, impulse responses and community engine definitions separately. No reference code has been imported as part of the shell extraction.

## Delivery stages and acceptance

### 0. Foundation — complete

The reusable shell and independent project exist. Setup, environment examples, database separation and authentication regression coverage are retained.

### 1. TypeScript simulation and audio feasibility — complete

- [x] Add Vitest and define the versioned inline-four configuration as Zod schemas, with validation rules and unit tests.
- [x] Review useful reference algorithms and document any reuse.
- [x] Implement the crank-angle-resolved per-cylinder core with throttle, inertia, load and firing events, tested headlessly in Node. Define time/angle/audio stepping, including zero-RPM starting and stalling, and verify bounded work per advance.
- [x] Run the core in an AudioWorklet and synthesise engine audio from exhaust pulses. Expose a ready-to-run guest engine with Start and throttle controls in the prototype.
- [x] Run the same core headlessly in a worker and compare its output with the AudioWorklet run.
- [x] Measure cost per step per cylinder, audio callback headroom, audio stability and UI responsiveness with a basic uPlot telemetry view. Decide between the AudioWorklet-hosted design and the worker/`SharedArrayBuffer` fallback, and record the decision.

Acceptance: a controllable engine starts, idles, accelerates and responds to load with audible changes; no invalid numerical state or unbounded backlog. The same configuration and inputs give matching results in Node, the worker and the AudioWorklet within a stated tolerance. Record the model assumptions and measurements. This stage proves feasibility, not engineering accuracy.

### 2. First complete bench — implemented; first-use acceptance pending

- [x] Build the engine editor and animated 3D cutaway, with optional firing/stroke overlays and a selected-cylinder pressure trace.
- [x] Add approachable starting configurations, an advanced editor, explicit structural rebuild/reset actions and restoration of the previous build.
- [x] Implement baseline temperature/pressure effects and supported humidity/oxygen behaviour.
- [x] Add manual throttle/load (on-screen, keyboard and gamepad), limiter, telemetry, volume/limiter and reset/stop controls.
- [x] Add live dyno pulls and headless quick tests, steady-state step tests, RPM hold, graphs and abort handling; define automatic-control ownership and clearly labelled replay behaviour.
- [x] Add temporary guest Baseline/Modified runs, curve overlays, changed-setting summaries and comparable RPM/load audio auditioning.
- [x] Add downloadable versioned build recipes with validation on import.
- [x] Keep the guest bench immediately usable and preserve experiments when entering an authentication flow.
- [x] Add a small set of optional guided experiments using supported model behaviour; keep the full sandbox unrestricted.

Acceptance: a new user can start an engine within a minute, make one understandable modification, hear or see its effect, compare it against the baseline, and restore the original without losing their experiment. Changing supported settings changes simulation, sound and view coherently. Equivalent live and quick tests produce consistent torque/power curves within the stated tolerance, and active tests stop at configured limits. Verify this experience with an unfamiliar user, alongside automated checks.

Phase 1/2 implementation and measurements are recorded in `docs/SIMULATION.md` and `docs/VERIFICATION.md`. The AudioWorklet host was selected for the initial inline-four after measurement; the worker/ring-buffer fallback remains available if future cost requires it. Quick tests run silently; no replay feature has been introduced.

- [ ] Confirm the post-fix first-use walkthrough with an unfamiliar user: start within a minute, modify, compare and restore without losing the experiment. Initial feedback fixed limiter flicker and loaded-stall restart. Follow-up exposed a disabled held-starter control; it now starts directly from a stopped bench, with passing Chromium/Firefox regression coverage. A refreshed user walkthrough is pending.

### 3. Saved builds and runs — implemented and verified

- [x] Add Laravel storage, JSON Schema validation (exported from the Zod schemas) and workspace-scoped authorisation.
- [x] Create a personal workspace on registration so saving does not require company setup; keep company workspaces for teams.
- [x] Save/version engine builds and store immutable run snapshots with sample blobs under a size cap.
- [x] Extend the existing temporary comparisons to saved runs, with configuration/condition differences and preserved guest experiments after sign-in.

Acceptance: runs survive reloads, stored samples are unchanged after editing a build, a rerun on the same model version matches within the stated tolerance, and another workspace cannot access private records.

### 4. Model extensions — complete

- [x] Recalibrate the generic presets (model 1.2.0) to plausible naturally aspirated 2.0 L full-load trends, with intake runner inertia. These are textbook plausibility bands, not a sourced reference.
- [x] Add a bounded forced-induction model (model 1.3.0): turbocharger with a parametric compressor map, turbine, shaft inertia, wastegate and blow-off valve; centrifugal and roots superchargers; intercooler. Brought forward ahead of the contrasting layout at the user's request. Knock is not modelled.
- [x] Add fuel systems (model 1.4.0): carburettor (venturi metering by volume, restriction, accelerator pump), throttle-body, port and direct injection, with x–τ wall-film transport, transient correction, overrun cut, evaporative charge cooling and misfire limits. Requested by the user with the period variety engines have used.
- [x] Add opt-in Live updates that apply valid edits to the running engine.

The remaining Stage 4 items moved on 2 November 2026: presets to Stage 7, knock to Stage 6, sharing to Stage 12 and layouts to Stage 10.

### 5. Sound and bench feel — complete

From the 2 November 2026 review of the running bench, which the user accepted. Decision (2 November 2026, user request): reworking the sound is the headline of this stage and comes first. It matters more to how fun the bench feels than any other item. The quick fixes are small and can go in alongside it.

Sound (first):

- [x] Add an exhaust system to the build (header length, collector, catalyst, silencer, tailpipe) and an acoustic model of it: delay-line pipe resonances, silencer filtering and tailpipe radiation. The current sound is exhaust mass flow through a one-pole filter, a high-pass and soft clipping, with no pipe character.
- [x] Add intake induction noise and mechanical/valvetrain noise, mixed by throttle and load so idle, part throttle, full load and overrun sound distinct.
- [x] Add overrun pops and crackle driven by the simulation (unburned fuel reaching a hot exhaust after cut or misfire), not by random triggers. Decision (2 November 2026): pops come from a spark-cut limiter, ignition cuts, misfires and rich running. A fuel-cut overrun stays quiet; deliberate "pops and bangs" from retarded overrun timing need the Stage 6 ignition maps.
- [x] Improve the forced-induction sounds: spool-up whistle, blow-off and, with the blow-off valve removed, compressor flutter from modelled surge.
- [x] Add listening positions, such as the tailpipe, the engine bay and the test cell with room reverb. The room is an algorithmic Schroeder reverb; no impulse responses or recorded assets are used.
- [x] Record whether the acoustic exhaust only shapes sound or also affects gas exchange. Decision (2 November 2026): sound only in model 1.5.0, labelled in the editor and `docs/SIMULATION.md`. Wave-tuned breathing needs the quasi-1D pipe solver planned for the two-stroke (`docs/TWO_STROKE.md`); share it with four-stroke headers once it exists.

Quick fixes:

- [x] After a Baseline is captured, switch "Capture in" to Modified so the next run cannot silently replace the baseline. Ask before overwriting an existing slot.
- [x] Keep the live engine running (or return it to idle) while a Quick test calculates in the worker; a silent calculation should not switch off the engine being listened to.
- [x] Show limiter fuel cut in the fuel status, and show zero or "cut" fuel flow while fuel is cut. Never display "-0.00". The review found the limiter only suppressed combustion while fuel kept flowing; model 1.5.0 makes the cut explicit: fuel (injection stops, the default) or spark (fuel passes unburned; always for carburettors).
- [x] Add a unit preference for power (kW, hp, PS) and torque (Nm, lb·ft). Store SI values and test the conversions.
- [x] Bring the main controls (Start, throttle, load, live readouts) within the first screen on common laptop sizes. Keep the workshop and dyno room below.

Feel and feedback:

- [x] Analogue tachometer with limiter and estimated-mechanical-limit marks, plus boost, λ and temperature gauges, drawn outside React's render loop.
- [x] During a live pull, plot torque and power against RPM as the pull runs, with a peak marker.
- [x] After each run, show a pull summary card: peak power and torque, where they occur, the change against Baseline and the area under the curve over a chosen RPM band.
- [x] Add more fictional starting builds with distinct characters, such as "Turbo hot hatch", "Torquey long-stroke" and "Screaming 9k". Give each a distinct exhaust so it also sounds different. Label them as fictional.
- [x] Add keyboard shortcuts for start/stop, starting a test, swapping Baseline/Modified and auditioning, with a discoverable shortcut list. Do not trigger them from inside form fields.

Something to drive against:

- [x] Add an optional simple road-load mode to the dyno: vehicle mass, gear ratios, rolling resistance and aerodynamic drag, applied as crank load. Gear changes and turbo lag then come naturally instead of from the load slider. This is a load model for the bench, not a vehicle or drivetrain simulator. Keep reporting crank output only; do not invent wheel power.

Evidence is in `docs/VERIFICATION.md`. The user accepted the sound after the blow-off rework on 2 November 2026 ("sounds really good for now"), and may revisit it later; further sound polish is not scheduled.

Acceptance: exhaust-system changes produce audible, explainable differences that physics, sound and the view share from one definition. Offline PCM tests check that the sound stays bounded and that exhaust changes alter its spectrum as intended. The user confirms in a listening session that the new sound is a clear improvement; automated checks do not substitute for this. The quick fixes have browser regression tests. Gauges and live plots add no React updates at audio rate. Audio cost stays inside the measured AudioWorklet budget (`npm run benchmark`).

### 6. Tuning, temperatures and limits — in progress

Requested by the user on 2 November 2026. This stage turns the bench into a tuning sandbox. Knock comes first: without it, extra boost and timing cost nothing, so maps, fuel grade and stronger parts would have no meaning.

Combustion and knock:

- [x] Make burn duration depend on speed, charge motion and mixture, so the best ignition timing (MBT) moves with RPM and load. Model 1.6.0's opt-in predictive burn uses a Metghalchi–Keck laminar flame speed wrinkled by turbulence ∝ piston speed. Decision (2 November 2026): to make part load realistic, the predictive burn also returns gas pushed back into the intake runner as residual, with an idle-air integral trim for the diluted idle. Builds saved before 1.6.0 keep the fixed burn and are bit-identical to 1.5.0.
- [x] Add an end-gas autoignition (knock) model, for example a Livengood–Wu induction-time integral with a Douaud–Eyzat-type correlation. Base it on end-gas pressure and temperature, fuel octane, mixture and residual gas. Report per-cylinder knock intensity. Knock is reported per cylinder, per cycle (index and intensity), recorded in dyno samples and heard as a ping. Decision: in this slice knock changes no cycle physics; its consequences are ECU retard now and damage when failures arrive.
- [x] Add a fuel grade choice (for example RON 91, 95, 98 and E85, including E85's stoichiometric ratio and charge cooling).
- [x] Add optional knock sensing and ECU timing retard, which can be turned off to show unprotected behaviour.

Engine management:

- [x] Add an ignition timing map, a target λ map and a boost target map by RPM and load. Use a table editor that highlights the live operating cell, with interpolation and range validation. Model 1.7.0. Decision (2 November 2026): ignition and λ use manifold pressure as load; the boost map uses driver throttle, since boost itself sets manifold pressure. Maps start flat at the build's single values, so switching them on changes nothing. Breakpoint values are editable; the number of breakpoints is fixed by the starting grid.
- [x] Add injector size, duty-cycle limits and fuel-pump capacity (including the high-pressure pump for direct injection). Running out of fuel leans the mixture rather than being clamped silently.
- [x] Store the maps in the versioned engine definition, with a schema migration and JSON Schema export. Builds saved before 1.7.0 read with no maps and unlimited fuel, and match 1.6.0 exactly.

Temperatures:

- [x] Add lumped per-cylinder thermal states: exhaust gas temperature at the port, piston crown, exhaust valve and head. Make per-cylinder differences come only from modelled causes such as charge, mixture, timing and knock. Do not add cosmetic variation. Model 1.8.0. Decision (2 November 2026): the temperatures observe the gas and do not feed back, so results are unchanged. Enrichment cooling followed in 1.9.0.
- [x] Model enrichment cooling: add the excess fuel's mass, heat capacity and rich-combustion chemistry to the charge, so running rich lowers EGT and crown temperature as in real engines (roughly 30–60 K of EGT from λ 1.0 to 0.85). Do this before failures, so that adding fuel protects an engine. Model 1.9.0. Rich burns form water–gas shift products, so they release less heat into more moles and more heat capacity, and port injection also cools with the extra fuel's latent heat. From λ 1.0 to 0.85 at 4,500 RPM on the Road engine, EGT falls 100 K, the valve 54 K and the crown 7 K, and knock falls. Decision (3 November 2026, user): no saved builds needed to keep 1.8.0 results, so it applies to every build without an opt-in. Known gaps: without dissociation, enrichment cost about 3% power (addressed in 1.10.0, below), and the EGT drop is larger than the figure above.
- [x] Model dissociation, or an equivalent lumped effect, so best power falls slightly rich of λ 1 (around λ 0.86–0.9) as in real engines. Check it against a published fuel–air cycle or engine data, and recheck the EGT drop when it lands. Model 1.10.0: equilibrium burned gas (CO2, CO, H2O, H2, OH, H, O2, O) with constants fitted to NIST-JANAF holds heat back while hot and returns it in expansion. Best power is now at about λ 0.95, 0.6% above λ 1, and torque at λ 0.9 matches λ 1 while EGT is 83 K lower. λ 1 full-load torque fell 2–3% and peak gas temperature about 200 K. Known gaps: real engines peak nearer λ 0.86–0.9 and a few per cent higher, and the EGT drop from λ 1.0 to 0.85 (120 K) is still larger than the figure above. Applies to every build (user decision of 3 November 2026).
- [x] Show per-cylinder temperatures and knock in a strip and on the cutaway (heat colours, glowing manifold). The strip shows EGT, crown and valve. On the cutaway, pistons glow with crown temperature, knocking chambers flash and the spark follows the ECU's timing. The exhaust already glowed (Stage 5).

Parts and limits:

- [ ] Add a parts list where every part is available from the start: pistons (cast, hypereutectic, forged), connecting rods (cast/stock, forged I-beam, H-beam), head gasket and fasteners, valve springs, turbochargers of several sizes, intercoolers, injectors and fuel pumps. Parts change mass, inertia, friction and thermal properties where modelled, and each has estimated limits.
- [ ] Add stress indicators for the main limits: rod load from peak cylinder pressure and reciprocating inertia, piston crown temperature and knock exposure, head clamping against peak pressure, valve-float speed and turbocharger shaft speed and inlet temperature.
- [ ] Add failure events when a limit is exceeded long enough: holed or cracked piston, bent or broken rod, lifted head gasket, valve float or valve-to-piston contact, and turbo damage. The engine stops and the bench shows what failed, where and why. Dyno runs record the failure as their abort reason. A rebuild restores the last build, and indestructible mode disables failures.
- [ ] Add a "push it" procedure: a stepped boost or timing ramp at a chosen RPM that stops at the first knock limit or failure and reports how far the engine went.
- [ ] Document every limit, its basis and its uncertainty in `docs/SIMULATION.md`. Do not present forum figures as specifications.

Acceptance: supported trends hold in tests. More advance, more boost, lower octane, hotter intake air or a leaner mixture each increase knock tendency, and enrichment and better fuel reduce it. Torque peaks near MBT timing when knock is absent. Temperatures respond to load, mixture and timing in the right direction. A stronger part raises only its own limit. Failures are repeatable for the same snapshot and inputs. Existing builds migrate with unchanged results unless they opt in to the new behaviour, which needs a model version bump.

### 7. Famous real engines

The user wants famous engines they recognise, starting with the 2.0 TFSI from the 2005 Golf GTI, so they can push them to see how much they take. Each preset follows the provenance rules under Data and access.

- [ ] Source a documented VW EA113 2.0 TFSI (AXX/BWA, Golf Mk5 GTI) preset: geometry, compression, valve timing, turbocharger, direct injection and published torque and power. Identify inferred and calibrated inputs explicitly. Requires Stage 6 knock and maps.
- [ ] Compare each preset with a sourced reference torque curve and operating range; record deviations.
- [ ] Then add further well-known inline-fours with contrasting characters, for example the Honda K20A, Mitsubishi 4G63T, Nissan SR20DET and Toyota 4A-GE.
- [ ] After the matching layouts exist (Stage 10), add famous engines that need them, for example the Toyota 2JZ-GTE and Nissan RB26DETT (inline-six), Subaru EJ20/EJ25 (boxer) and a GM LS V8.
- [ ] Add a stock-or-modified view: for a preset, show which settings and parts differ from the stock engine.

Acceptance: each released preset has provenance and model limitations, reproduces its sourced curve within a recorded deviation, and runs through the editor, animation, audio, dyno and persistence. The interface never calls a preset an exact replica.

### 8. 3D overhaul

Mechanical-clearance follow-up: user reported rod/counterweight, timing-belt/turbo and exhaust-runner intersections, plus a disconnected turbine. Main journals now occupy only the gaps between throws, counterweights sit beside the rod, and big-end/beam geometry clears the crankpin. The turbo moves beyond the exhaust collector, with a collector-to-turbine inlet and turbine-outlet downpipe (no bypass route). Headers use separate depth lanes and bounded rounded bends, with convergence confined to collector junctions. Rendered acceptance remains pending.

Timing/valve-gear pass (3 November): added a visible 24/48-tooth crank/cam drive with a flat belt, half-speed cam rotation, firing-order-phased illustrative cam profiles, valve followers/retainers and compressing springs. The rear half-cover now has ribs, fasteners and an oil cap; the front stays open. Valve event windows match the current simulation (intake 350° to configured close; exhaust 145–370°), but lift and cam geometry remain visual approximations. No physics changes. Rendered review and frame-time checks remain pending.

The user reviewed and accepted the block/piston/rod/head pass, but reported overlap with the cylinder buttons. The next visual pass reserves a 76 px control strip below the canvas, backs the default camera off slightly, adds deterministic casting grain and more distinct machined/forged finishes, replaces decorative gold on major internals with steel, and adds exhaust flanges, bolts, tangent-aligned weld collars, a tapered collector and an open tailpipe. Headers stay near head height until beyond the block to expose more of the cutaway. This pass awaits rendered review.

3 November follow-up: the cutaway now has solid rear half-bores with machined liners and deck faces, crankcase end walls, relieved piston skirts and wrist pins, rigid I-section connecting rods with bearing eyes/caps, stepped head flanges and cam supports, and closer, more frontal default framing. These are visual changes only. Build and lint verification are recorded in `docs/VERIFICATION.md`; rendered review remains pending because the current execution environment blocks the Vite listening port.

The user reported on 2 November 2026 that the 3D graphics need improving and confirmed on 3 November that the current model looks too toy-like. The first industrial-cutaway pass is in progress: it replaces the bright primitive look with more subdued PBR metals and lighting, rounded castings, a shaped sump, casting ribs and fasteners, visible camshafts and curved intake runners. The automated review still cannot see the view because its browser lacks usable WebGL, so the final material, lighting and composition judgement needs a real-browser review. This stage is independent of the simulation and can run alongside Stages 5–7.

- [x] Use physically based materials with environment lighting, shadows and tone mapping, while keeping the cutaway readable.
- [ ] Add engine detail generated from the definition: block and head, cams and valves moving to the valve timing, timing belt or chain, intake and exhaust manifolds, turbocharger, intercooler piping and the exhaust system.
- [ ] Add orbit and preset camera views, an exploded view and part highlighting on hover or selection.
- [ ] Show Stage 6 state on the model: per-cylinder heat, a glowing exhaust manifold and turbine housing, knock flashes, failed components and the fitted parts.
- [ ] Set and measure a frame budget on representative hardware, use device-dependent quality levels and keep a WebGL-free fallback.

Acceptance: the model stays consistent with the active definition and telemetry, inspection mode stays clearly labelled, and browser tests cover rendering with and without WebGL.

### 9. Two-stroke engines

Requested by the user on 1 November 2026, and moved behind Stages 5–8 on 2 November 2026. The design proposal, open questions and verification approach are in `docs/TWO_STROKE.md`.

- [ ] Generalise the core and schema for cylinder count and cycle length (new engine `schemaVersion` with migration), with identical four-stroke results.
- [ ] Add a piston-ported, crankcase-scavenged two-stroke single: port geometry with derived timing, crankcase volume, two-zone scavenging with short-circuit losses, and a straight pipe. Include the editor, port-timing display, 3D cutaway with ports in the liner, sound, dyno and persistence.
- [ ] Prototype and benchmark a quasi-1D pipe solver. Record whether it fits the AudioWorklet budget or needs the worker/ring-buffer fallback.
- [ ] Add segmented expansion chambers (header, cones, belly, baffle, stinger) with an editor, a 3D shape drawn from the segments, a tuned-RPM estimate and sound from the stinger.
- [ ] Add reed and rotary-disc intake, then twins and a power valve.
- [ ] Add sourced two-stroke presets once their trends are reproduced.

Acceptance: port timing is derived from geometry and validated; mass and energy balance across crankcase, cylinder and pipe; supported trends hold (pipe length moves the torque peak, exhaust-port height moves and narrows the band, a tuned chamber beats a straight pipe at its tuned speed); the two-stroke works through the editor, animation, audio, dyno and persistence; four-stroke results are unchanged.

### 10. Additional layouts

- [ ] Add inline-six, V6, V8 and boxer support incrementally, with matching firing, motion and sound. Prioritise meaningful variety over a large list of near-identical presets.

Acceptance: each released layout works through configuration, animation, audio, dyno and persistence.

### 11. UI revision

Requested by the user on 3 November 2026: the interface has become hard to understand, and the bench controls pane on the right is very long. Scheduled once the feature stages are in place, so the layout is designed around the finished set of controls, not revised again for each new one. Bring it forward if the bench becomes hard to use for the work in between.

- [ ] Audit every control, readout and notice on the bench, workshop, maps and library: what it does, how often it is used and which tasks need it. Use that audit to drive the new structure.
- [ ] Split the bench controls pane into task-based areas, for example drive (start, ignition, throttle, load), dyno test, test-cell conditions, sound and display. Keep the controls needed every run visible and move the rest behind clear tabs or sections.
- [ ] Reorganise the engine workshop into understandable groups with progressive disclosure: everyday settings first, detailed parameters on demand. Show at a glance what differs from the starting build.
- [ ] Make status consistent: one place for engine state, warnings and notices, with stall, limiter, knock, fuel-limit and (later) failure messages saying what to do next.
- [ ] Recheck narrow and mobile layouts, keyboard and gamepad use, and accessible names for every control.
- [ ] Repeat the one-minute first-use check with an unfamiliar user, which is still open from Phase 2.

Acceptance: a new user can start an engine, make a change, run a test and compare it without help. Every existing workflow keeps working, and browser tests cover the new layout in Chromium and Firefox.

### 12. Fidelity and release readiness

- [ ] Improve thermal behaviour, forced induction, valvetrain and mechanical-limit models in bounded increments.
- [ ] Add browser compatibility/performance checks, accessible controls, recovery from audio suspension and worker errors.
- [ ] Choose supported browsers/hardware and publish measured limits.
- [ ] Add shareable build links after downloadable recipes work; mark submitted results as unverified unless independently verified.
- [ ] Extend exports/sharing and add wear only where it supports the established core experience. Keep explicitly unverified sharing available; add server-side verification before trusted leaderboards or verified performance claims.

## Verification and progress tracking

Test meaningful invariants: displacement, geometry, firing sequence, torque/power conversion, time-step repeatability, cross-host agreement (Node, worker, AudioWorklet) within tolerance, limiter/abort behaviour and environmental assumptions. Validate trends and full curves against reference data; do not tune one peak figure and declare the engine accurate.

Browser checks should exercise guest first-use, manual throttle, audio start/stop/resume, structural rebuild/reset, baseline restoration, comparable audio auditioning, animated geometry, complete and aborted live/quick dyno runs, replay controls, recipe import/export and preservation through sign-in/save/reload. Check the one-minute first-run acceptance with an unfamiliar user; automated tests alone do not establish that the experience is enjoyable. Backend tests must cover authorisation, validation and snapshot preservation. Vitest and Playwright are configured. Numerical tests and Chromium/Firefox workflow checks pass; consult `docs/VERIFICATION.md` for scope, measurements and the open first-use acceptance gate.

## Housekeeping

Small shell clean-ups to make alongside Stage 1:

- [x] Rename the Composer package from `project-base/backend`. Update the lockfile with Composer.
- [x] Remove the unused `laravel/sail` dev dependency; the project uses its own Compose configuration.
- [x] Replace MailHog (unmaintained) with Mailpit, keeping the development inbox on port 8027 and updating README and AGENTS.md if anything user-facing changes.

Update stage checkboxes and record material decisions as work completes. Separate implemented and verified behaviour from proposals. Do not expand into a full vehicle/drivetrain simulator or CFD solver. Stage 5's road load is a bounded load model only. Stage 6's failures are labelled estimates. Neither becomes a progression or damage-grind game.
