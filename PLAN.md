# Engine Bench — Delivery Plan

Updated: 1 November 2026

## Active delivery goal

Complete phases 1, 2 and 3. The user expanded the goal on 1 November 2026 to include saved builds and runs, personal workspaces, schema-validated storage, workspace authorisation and historical comparisons. Preserve phase 2's open first-use acceptance check while proceeding with phase 3; it does not block independent phase 3 implementation.

## Product direction

Build a browser-based virtual engine workshop. Users configure an engine, inspect it in animated 3D, set test-cell conditions, control the throttle, hear simulated engine sound and run repeatable dyno tests. Support both custom builds and documented presets based on existing engines, including the VW AXX requested by the user.

The target is a credible enthusiast and learning simulator. Performance figures are model estimates; engineering or tuning accuracy must be demonstrated through validation before making stronger claims.

## Agreed decisions

- The frontend, simulation and sound-generation code use TypeScript, compiled to browser JavaScript. No C++, native simulation service, or C++ compiled to WebAssembly.
- Retain Vite, React, routing, Material UI and the Laravel API from the extracted project shell.
- Run the engine simulation locally in the browser. Laravel manages authentication, access control, presets, saved configurations and stored test results.
- Use Engine Simulator as a reference and selectively adapt useful algorithms to TypeScript. Build our own application architecture, editor, engine format, test bench and 3D presentation.
- Keep `../project-base` generic. Engine-specific work belongs in this repository. The two projects are independent copies.
- Begin with one configurable inline-four and prove the complete experience. Then prioritise one contrasting engine layout and sound before building a large preset library.
- Allow the bench to be used without signing in. An account is required only to save builds and runs to the server; temporary baseline/modified comparisons and downloadable build recipes are available to guests. When an account is needed for saving, it should feel like a personal workspace; the inherited company/role model remains available for teams.

## Experience priorities

The core loop is: start an engine, make an understandable change, hear and see the effect, test it, compare it with the baseline and try another idea. Numerical fidelity supports this experience; it does not replace it.

- **Immediate first run:** open a ready-to-run inline-four on the bench without registration or company setup. One explicit Start action enables sound and starts the engine; expose throttle immediately.
- **Reversible experiments:** offer temporary Baseline and Modified slots, duplicate/reset actions, curve overlays and a clear list of changed settings before server persistence exists. Preserve the guest experiment through sign-in so saving does not require starting again.
- **Approachable configuration:** provide described starting configurations, such as a mild road engine and a higher-revving variant, using only supported model differences. Keep the detailed editor available without making every numerical parameter part of the first-use experience.
- **Clear edit lifecycle:** geometry and structural changes require an explicit stop/rebuild/reset. Throttle and supported operational adjustments may change live. Show which applies before a change is committed and retain the previous configuration for restoration.
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

Start with a four-stroke petrol inline-four. Expand to inline-six, V6, V8 and boxer layouts after the initial model is validated.

- Geometry: cylinder count/layout, bore, stroke, connecting-rod length and compression ratio.
- Timing: firing order, crank phasing, valve timing/lift and ignition timing, introduced as their simulation support becomes available.
- Breathing and fuelling: intake/exhaust restrictions, fuel properties, mixture control and later forced induction.
- Rotating assembly: inertia, friction and component capability parameters.
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

Damage, wear, valve float, knock and catastrophic failures are later extensions. If simplified thresholds are used, label them as estimates and record the assumptions. Do not claim that every engine fails at one universal RPM or piston-speed value.

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

### 4. Real-engine presets and additional layouts

- [ ] Source and validate a documented naturally aspirated inline-four as the first reference preset.
- [ ] Before expanding the preset library or completing forced induction, add one contrasting engine layout and sound after the inline-four bench is proven. Choose the layout using prototype cost and audible/visual variety; verify its full editor, motion, audio and dyno workflow.
- [ ] Add shareable build links after downloadable recipes work; mark submitted results as unverified unless independently verified.
- [ ] Add a bounded forced-induction model (compressor map, wastegate/boost control, intercooler) and a direct-injection fuelling assumption, as required by the VW AXX (EA113 2.0 TFSI, turbocharged, direct injection).
- [ ] Source a documented VW AXX preset and identify unknown inputs explicitly.
- [ ] Compare each preset with a sourced reference torque curve and operating range; record deviations.
- [ ] Expand the remaining inline-six, V6, V8 and boxer support incrementally, with matching firing, motion and sound. Prioritise meaningful variety over a large list of near-identical presets.

Acceptance: each released preset has provenance and model limitations, and each released layout works through configuration, animation, audio, dyno and persistence.

### 5. Fidelity and release readiness

- [ ] Improve thermal behaviour, forced induction, valvetrain and mechanical-limit models in bounded increments.
- [ ] Add browser compatibility/performance checks, accessible controls, recovery from audio suspension and worker errors.
- [ ] Choose supported browsers/hardware and publish measured limits.
- [ ] Extend exports/sharing and add damage/wear only where they support the established core experience. Keep explicitly unverified sharing available; add server-side verification before trusted leaderboards or verified performance claims.

## Verification and progress tracking

Test meaningful invariants: displacement, geometry, firing sequence, torque/power conversion, time-step repeatability, cross-host agreement (Node, worker, AudioWorklet) within tolerance, limiter/abort behaviour and environmental assumptions. Validate trends and full curves against reference data; do not tune one peak figure and declare the engine accurate.

Browser checks should exercise guest first-use, manual throttle, audio start/stop/resume, structural rebuild/reset, baseline restoration, comparable audio auditioning, animated geometry, complete and aborted live/quick dyno runs, replay controls, recipe import/export and preservation through sign-in/save/reload. Check the one-minute first-run acceptance with an unfamiliar user; automated tests alone do not establish that the experience is enjoyable. Backend tests must cover authorisation, validation and snapshot preservation. Vitest and Playwright are configured. Numerical tests and Chromium/Firefox workflow checks pass; consult `docs/VERIFICATION.md` for scope, measurements and the open first-use acceptance gate.

## Housekeeping

Small shell clean-ups to make alongside Stage 1:

- [x] Rename the Composer package from `project-base/backend`. Update the lockfile with Composer.
- [x] Remove the unused `laravel/sail` dev dependency; the project uses its own Compose configuration.
- [x] Replace MailHog (unmaintained) with Mailpit, keeping the development inbox on port 8027 and updating README and AGENTS.md if anything user-facing changes.

Update stage checkboxes and record material decisions as work completes. Separate implemented and verified behaviour from proposals. Do not expand into a full vehicle/drivetrain simulator, CFD solver or detailed damage game before the first bench is proven.
