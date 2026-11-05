# Bench UI audit (Stage 9)

Audit of every control, readout and notice on the bench, made on 4–5 November 2026 for the Stage 9 UI revision. Each row says what the item does, how often it is used, which task needs it and where it now lives. "Every run" means most sessions touch it; "often" means most experiments; "sometimes" means a specific experiment; "rarely" means setup or recovery.

Before the revision the page was about 8,800 px tall at 1024 px wide. One right-hand pane held bench controls, the whole workshop and the test cell (about 6,600 px), and the dyno room, push-it, library and extras followed below everything. Status messages were spread over the Drive pane, the workshop and the dyno room.

## Principles taken from the audit

- Controls needed during every run (start, stop, throttle, ignition, load) stay visible on every tab.
- Build editing happens one topic at a time; each topic shows whether it has unapplied edits or differs from its starting build.
- Engine state and problems appear in one place, the status strip under the command bar, and each problem says what to do next and offers to take you there.
- Readouts that are not needed every run sit behind telemetry tabs on the bench, not in a long stack.
- Nothing was removed: every control still has its effect, and the model is unchanged.

## Command bar (sticky, every tab)

| Item | Does | Use | Placement |
| --- | --- | --- | --- |
| Build name and spec | Names the build on the stand: capacity, layout, firing order, fuel system, induction. | Every run | Command bar (page heading). |
| Status chip | Ready, running, stalled, starter stalled, live pull, audition, calculating or failed. | Every run | Command bar; a failure chip opens Cylinders and stress. |
| Unapplied changes chip | Counts edited topics; opens the workshop. | Often | Command bar. |
| Live updates | Applies valid edits without stopping. | Sometimes | Command bar, beside the rebuild it replaces. |
| Stop & rebuild engine | Applies edits; highlighted when edits are waiting. | Often | Command bar, so it is reachable from the workshop and maps. |
| Start engine, Emergency stop | Start, and stop everything including tests. | Every run | Command bar. |

## Status strip (under the command bar, every tab)

| Message | Next step it gives | Action button |
| --- | --- | --- |
| Failure | Rebuild from Cylinders and stress, or turn on Indestructible. | Show what broke |
| Starter can't turn the engine | Raise starter torque and rebuild. | Open geometry |
| Stalled | Press Start engine to unload the dyno; scale undersized valves. | — |
| Rev limiter cycling | Release throttle or add load. | — |
| Fuel limited | Larger injectors, a bigger pump or less boost. | Open fuel system |
| Knock (with or without knock control) | Better fuel, less boost or timing, or knock control. | Open combustion |
| Model warnings (compressor overspeed) | — | — |
| Latest notice | Says what the last action did. | — |

Knock and fuel-limit messages are held for 1.5 s after the last event, like the limiter, so they do not flash each cycle.

## Drive panel (every tab)

| Item | Use | Decision |
| --- | --- | --- |
| Gauges (tachometer, boost/MAP, λ, coolant, exhaust) | Every run | Kept at the top. |
| Throttle | Every run | Kept; also Space and a gamepad trigger. |
| Dyno load, RPM hold | Often | Kept. On phones they sit behind More drive controls. |
| Master volume, Listen from | Often | Kept; sound is part of the bench's feel. |
| Ignition, Hold starter | Sometimes | Kept with the throttle. |
| Road load | Sometimes | Kept. |
| Power and torque units | Rarely | Kept with listening position as display settings; remembered. |
| Reset bench, Full reset | Rarely | Kept at the bottom; Full reset still asks first. |
| Shortcuts | Rarely | Link in the panel heading; B, W, M, D and Y switch tabs. |

On screens under 900 px the Drive panel comes first, with gauges, throttle and ignition; More drive controls shows the rest.

## Bench tab

| Item | Use | Decision |
| --- | --- | --- |
| Cutaway, cylinder buttons, cycle colours, slow-motion inspection | Often | Bench tab only; the 3D view is not mounted on other tabs. |
| Engine speed, brake torque, crank power, coolant | Every run | Always shown under the cutaway. |
| Boost, mixture, ECU and cam strips | Often | Engine data tab (default). |
| Knock and temperatures per cylinder, stress and failures, Indestructible | Sometimes | Cylinders and stress tab; opens itself on a failure. |
| Live speed and cylinder pressure charts | Sometimes | Traces tab. |

## Workshop tab

Nine topics, one at a time: Starting build (fictional and famous presets, the provenance note, build name, restore previous build), Geometry and basics (five everyday fields first, ten advanced on demand, derived capacity and cranking estimate), Fuel system, Camshaft, Combustion and knock, Forced induction, Exhaust and limiter, Parts and limits, and Test cell. Pending edits and differences from the starting build are marked on each topic. The workshop footer keeps the explanation of rebuild versus Live updates and any out-of-range fields.

Long topics remain long (Camshaft with profiles and phasers, Parts and limits); they are now the only content on screen while edited, so they no longer push the rest of the bench away.

## Maps, Dyno and Library tabs

- **Maps:** the switch to use engine-management maps and the full-width map editor. The map tab is marked when the maps differ from the engine on the stand.
- **Dyno:** test procedure, live pull and quick test, pull summary, the torque and power comparison and what changed, push-it, audition at the same operating point and guided experiments.
- **Library:** saved builds and runs (sign-in), recipe download and import.

## Open after this audit

- A first-use check with someone unfamiliar with the bench (Phase 2 and Stage 9), which needs a person; the scripted walkthrough in `tests/firstuse.spec.ts` only checks that the steps are reachable from visible labels.
