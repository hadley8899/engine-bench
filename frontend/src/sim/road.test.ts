import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { roadDefaults, validateRoad } from './road'
import { inductionDefaults, normalConditions, roadEngine } from './schema'
import type { EngineDefinition } from './schema'

/** Starts the engine, then drives with road load at full throttle. */
function drive(
  engine: EngineDefinition,
  seconds: number,
  shift?: (core: EngineCore) => void,
) {
  const core = new EngineCore(engine, normalConditions)
  core.setControls({ ignition: true, starter: true })
  for (let i = 0; i < 48000; i++) core.step()
  core.setControls({ starter: false, road: roadDefaults, throttle: 1 })
  let hundred = Infinity
  for (let i = 0; i < seconds * 48000; i++) {
    core.step()
    if (i % 480 === 0) shift?.(core)
    if (hundred === Infinity && core.vehicle.speed * 3.6 >= 100)
      hundred = i / 48000
  }
  return { core, hundred }
}
/** Changes up just before the limiter. */
const upshift = (core: EngineCore) => {
  const road = core.controls.road!
  if (
    core.telemetry().rpm > core.engine.revLimit - 300 &&
    road.gear < road.ratios.length
  )
    core.setControls({ road: { ...road, gear: road.gear + 1 } })
}

describe('road load', () => {
  it('validates gears against the gearbox', () => {
    expect(() => validateRoad({ ...roadDefaults, gear: 7 })).toThrow()
    expect(() => validateRoad({ ...roadDefaults, mass: 10 })).toThrow()
  })
  it('launches from rest on the automatic clutch and accelerates plausibly', () => {
    const { core, hundred } = drive(roadEngine, 14, upshift)
    // About 110 kW in a 1,350 kg car: 0–100 km/h in roughly 7–12 s.
    expect(hundred).toBeGreaterThan(6)
    expect(hundred).toBeLessThan(12)
    expect(core.controls.road!.gear).toBeGreaterThanOrEqual(3)
    expect(core.telemetry().road!.speed).toBeGreaterThan(100)
  })
  it('keeps road speed through a gear change while engine speed drops', () => {
    const { core } = drive(roadEngine, 3)
    const before = core.telemetry()
    core.setControls({ road: { ...roadDefaults, gear: 2 } })
    for (let i = 0; i < 24000; i++) core.step()
    const after = core.telemetry()
    expect(after.rpm).toBeLessThan(before.rpm * 0.8)
    expect(after.road!.speed).toBeGreaterThan(before.road!.speed * 0.95)
  })
  it('turbo boost builds with load as the car accelerates', () => {
    const turbo = {
      ...roadEngine,
      compression: 9,
      induction: inductionDefaults.turbo,
    }
    const { core } = drive(turbo, 0.4)
    const early = core.telemetry().induction.boost
    for (let i = 0; i < 48000 * 3; i++) core.step()
    expect(core.telemetry().induction.boost).toBeGreaterThan(early + 30000)
  })
  it('in neutral the engine runs free and the car coasts down', () => {
    const { core } = drive(roadEngine, 4, upshift)
    const speed = core.vehicle.speed
    core.setControls({ road: { ...roadDefaults, gear: 0 }, throttle: 0 })
    for (let i = 0; i < 48000 * 2; i++) core.step()
    expect(core.vehicle.speed).toBeLessThan(speed)
    expect(core.vehicle.speed).toBeGreaterThan(speed * 0.8)
    expect(Math.abs(core.vehicle.clutchTorque)).toBe(0)
  })
})
