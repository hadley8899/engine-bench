# Two-stroke engines — design note

Status: proposal, not implemented. Requested by the user on 1 November 2026 as the next phase: build two-stroke engines and experiment with ports and exhaust shapes. This note records the intended model, editor and order of work so the design can be reviewed before code changes. Update it as decisions are made; move implemented behaviour into `docs/SIMULATION.md`.

## Why it is a different engine, not a new preset

A crankcase-scavenged two-stroke fires every revolution and has no valvetrain. The piston opens and closes ports in the cylinder wall, and the underside of the piston pumps fresh charge through the crankcase. Its character comes from three things the current four-stroke core does not model:

1. **Port timing comes from geometry.** A port opens when the piston crown uncovers its top edge, so timing is set by port heights, stroke and rod length. It is symmetric about bottom dead centre unless a reed or rotary valve controls intake.
2. **Scavenging.** Incoming charge pushes burned gas out while the exhaust port is still open. Some of the fresh charge mixes with the burned gas, and some is lost straight out of the exhaust.
3. **Exhaust pressure waves.** A tuned expansion chamber returns a suction wave that helps empty the cylinder, then a reflected pressure wave that pushes escaping charge back in before the port closes. This is the main reason two-strokes are tuned, and it needs a one-dimensional gas-dynamics pipe model. The current core has only lumped volumes.

This is also the Stage 4 "contrasting layout and sound". A two-stroke single differs more in sound, motion and tuning than an inline-six would.

## What the user would configure

Shared with four-strokes: bore, stroke, rod length, compression ratio, ignition timing, burn duration, mixture, inertia, limits, starter and fuel system. Carburettor and direct injection apply; port injection does not. Fuel systems reuse the 1.4.0 model, including short-circuit fuel loss.

Two-stroke specific:

- **Exhaust port:** top-edge height from the deck, width (or chordal width as a share of bore), and an optional bridge. A power valve that lowers the effective port at low RPM comes later.
- **Transfer ports:** count (2, 3 or 5), top-edge height, width and upward angle; an optional boost port. A loop-scavenged (Schnürle) layout is assumed. Cross-flow and uniflow layouts are not planned.
- **Intake control:** piston port (skirt timing from height), reed valve (petal area and stiffness) or rotary disc valve (open and close angles).
- **Crankcase:** volume, entered as primary compression ratio.
- **Exhaust system:** a straight pipe, or an expansion chamber made of segments. Each segment has a length and start and end diameter: header, diffuser cone or cones, belly, baffle cone and stinger. The 3D view draws the pipe from these values, so the shape on screen is the shape simulated.

Derived and displayed values, never entered independently:

- port open and close angles and durations;
- blowdown and transfer time-areas;
- trapped compression ratio (from exhaust closing) alongside the geometric ratio;
- the pipe's estimated tuned RPM.

New telemetry: delivery ratio, trapping efficiency and scavenging efficiency, crankcase pressure, and pressure at the exhaust port.

Validation rejects impossible layouts: transfers that open before the exhaust, ports overlapping the ring land or extending past the skirt, a pipe that self-intersects or has zero-area segments, and unsupported combinations such as port injection or forced induction on a crankcase-scavenged engine.

## Simulation plan

1. **Generalise the core without changing four-stroke results.**
   - Cylinder count and cycle length (360° or 720°) become parameters.
   - Valves and ports become flow openings that are functions of crank angle or piston position.
   - The schema gains a `cycle` discriminator under a new engine `schemaVersion`. Builds saved earlier migrate to four-stroke, and stored run snapshots stay readable unchanged.
   - Acceptance: every existing Vitest calibration and cross-host test passes with identical numbers.
2. **Crankcase and ports (0D).**
   - Each cylinder gets a crankcase control volume whose size changes with piston position.
   - Flow uses the existing compressible orifice equations through the intake, the transfers (crankcase to cylinder) and the exhaust, discharging into a lumped exhaust volume.
   - The reed is a check valve with first-order petal dynamics.
3. **Scavenging.**
   - A two-zone cylinder tracks fresh and burned gas.
   - Transferred charge first displaces burned gas, then increasingly mixes with it. This follows a Benson–Brandham-type perfect-displacement/perfect-mixing split.
   - A short-circuit share of the incoming charge goes straight out of the exhaust.
   - The fresh share of the outflow is tracked, so short-circuited fuel shows up as fuel consumption and lost power.
4. **One-dimensional pipe (the expansion chamber).**
   - Quasi-1D compressible flow with area change, wall friction and heat loss, solved by a finite-volume scheme (for example MUSCL-Hancock with an HLLC flux) with partially open port boundaries and an open stinger end.
   - Cells of 1–2 cm and Courant-limited substeps: a 1 m pipe is roughly 60–100 cells.
   - The audio comes from the flow leaving the stinger, which should give the characteristic two-stroke sound.
   - Measure the cost before committing. If it does not fit the AudioWorklet budget, use the planned worker plus `SharedArrayBuffer` ring-buffer fallback, which needs cross-origin isolation.
   - The same solver could later give four-strokes tuned headers, collectors and intake runners.
5. **Starting, idle and limits.**
   - Two-strokes idle poorly because of heavy residual gas at light throttle. The model must start and idle without masking misfires; four-stroking at light load can be shown as a misfire pattern.
   - A rev limiter and mechanical limit apply as for four-strokes.

## Order of work

1. Generalisation of the core and schema (step 1 above), with no behaviour change.
2. Two-stroke single:
   - piston-ported, with crankcase scavenging and a straight pipe (0D);
   - editor, port-timing display, 3D cutaway showing ports in the liner, crankcase and piston;
   - sound, dyno, persistence and recipes.
3. Pipe solver prototype and benchmark, then the segmented expansion chamber with its editor, 3D shape and tuned-RPM estimate.
4. Reed and rotary-disc intake, then twins (parallel 180°/360° and V) and a power valve.
5. Presets with documented sources (for example a 50 cc moped and a 125 cc race single) once the model reproduces their trends.

## Verification

- Port angles, durations and time-areas match hand calculations from geometry.
- Mass and energy balance across crankcase, cylinder and pipe.
- Trends, not single figures:
  - a longer expansion chamber moves peak torque to lower RPM, and the tuned length follows the wave round-trip rule (round-trip time ≈ exhaust-open period) within a stated band;
  - a higher exhaust port moves the peak up and narrows the band;
  - lower primary compression reduces delivery ratio at low speed;
  - a reed improves low-speed delivery ratio compared with a piston port;
  - a straight pipe makes a flatter, lower curve than a tuned chamber.
- Cross-host agreement and bounded cost, as for the four-stroke core.

References for the model: G. P. Blair, *Design and Simulation of Two-Stroke Engines* (SAE, 1996), and G. Jennings, *Two-Stroke Tuner's Handbook* (1973), for port time-area and expansion-chamber design practice; Benson and Brandham's two-zone scavenging model (1969). Implement from the published equations and record what is adapted. Recheck licences for any code, data or sounds used.

## Open questions

- Single cylinder first (recommended), or a twin from the start?
- Which engines matter most: a moped, a race single, a dirt bike, an outboard or snowmobile twin?
- Should the pipe solver also go into four-strokes (headers and collectors) as soon as it works, or stay two-stroke only at first?
- Oil premix ratio would need a lubrication or smoke model to have any effect. Leave it out until then rather than add a control with no effect.
