import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { roadDefaults, suggestedVehicle, validateRoad, vehicleKey, vehicles } from './road'
import { createCore } from './cores'
import { displacement, inductionDefaults, normalConditions, raceTwoStroke, roadEngine } from './schema'
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
  it('offers a vehicle that suits the engine, and recognises it', () => {
    for (const v of Object.values(vehicles)) expect(validateRoad(v.road)).toEqual(v.road)
    expect(suggestedVehicle(displacement(roadEngine), roadEngine.revLimit)).toBe('hatchback')
    expect(suggestedVehicle(50e-6, 8000)).toBe('moped')
    expect(suggestedVehicle(125e-6, 12500)).toBe('race125')
    expect(suggestedVehicle(125e-6, 9500)).toBe('trail125')
    expect(suggestedVehicle(347e-6, 9500)).toBe('motorcycle')
    expect(vehicleKey({ ...vehicles.moped.road, gear: 3 })).toBe('moped')
    expect(vehicleKey({ ...vehicles.moped.road, mass: 170 })).toBeNull()
  })
  it('a race 125 on its bike launches in its powerband without lugging', () => {
    const core = createCore(raceTwoStroke, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, starter: true })
    for (let i = 0; i < 10; i++) core.advance(0.1)
    core.setControls({ starter: false, throttle: 1, road: vehicles.race125.road })
    let lowest = Infinity
    for (let i = 0; i < 40; i++) {
      core.advance(0.1)
      // Once the bike moves, the clutch holds the engine near its launch speed.
      const t = core.telemetry()
      if (t.road!.speed > 2) lowest = Math.min(lowest, t.rpm)
    }
    expect(lowest).toBeGreaterThan(8000)
    expect(core.stress.failure).toBeNull()
    expect(core.telemetry().road!.speed).toBeGreaterThan(20)
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
