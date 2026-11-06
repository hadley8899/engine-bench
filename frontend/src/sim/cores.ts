/**
 * The engine cores behind one interface: EngineCore runs four-strokes,
 * TwoStrokeCore two-strokes. Hosts (AudioWorklet, worker, tests) create
 * and continue them through these functions.
 */
import { EngineCore } from './core'
import { TwoStrokeCore } from './twostroke'
import type { Conditions, EngineDefinition } from './schema'

export type Core = EngineCore | TwoStrokeCore

export function createCore(
  engine: EngineDefinition,
  conditions: Conditions,
): Core {
  return (engine.cycle ?? 'four-stroke') === 'two-stroke'
    ? new TwoStrokeCore(engine, conditions)
    : new EngineCore(engine, conditions)
}

/**
 * Continue a running core with an edited definition. Changing the cycle
 * or the cylinder count is structural: the result starts afresh.
 */
export function continueCore(
  previous: Core,
  engine: EngineDefinition,
  conditions: Conditions,
): Core {
  const cycle = engine.cycle ?? 'four-stroke'
  if (
    previous.engine.cycle !== cycle ||
    previous.engine.layout !== engine.layout ||
    previous.engine.cylinders !== engine.cylinders ||
    previous.engine.firingOrder.join() !== engine.firingOrder.join()
  )
    return createCore(engine, conditions)
  return previous instanceof TwoStrokeCore
    ? TwoStrokeCore.continueFrom(previous, engine, conditions)
    : EngineCore.continueFrom(previous, engine, conditions)
}

/** Whether a live edit can carry the running engine over. */
export function canContinue(previous: EngineDefinition, next: EngineDefinition) {
  return (
    (previous.cycle ?? 'four-stroke') === (next.cycle ?? 'four-stroke') &&
    previous.layout === next.layout &&
    previous.cylinders === next.cylinders &&
    previous.firingOrder.join() === next.firingOrder.join()
  )
}

/**
 * Peak torque needed to turn the engine slowly with ignition off: the
 * resisting torque over two revolutions at 150 RPM (one four-stroke
 * cycle, two two-stroke cycles). A starter below this may still start the
 * engine on flywheel momentum, so treat it as a guide, not a rule.
 */
export function crankingTorque(
  engine: EngineDefinition,
  conditions: Conditions,
) {
  const core = createCore(engine, conditions)
  core.setControls({ ignition: false, holdRpm: 150 })
  // Skip the first step's step-change from rest, then measure 720°.
  for (let i = 0; i < 480; i++) core.step()
  let peak = 0
  for (let i = 0; i < 38400; i++) {
    core.step()
    peak = Math.max(peak, -core.absorbedTorque)
  }
  return peak
}
