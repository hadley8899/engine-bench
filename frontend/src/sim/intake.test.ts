import { describe, expect, it } from 'vitest'
import { realEngines } from '../bench/presets'
import { EngineCore } from './core'
import { enthalpy } from './physics'
import {
  normalConditions,
  roadEngine,
  validateEngine,
} from './schema'
import type { Conditions, EngineDefinition } from './schema'

function held(
  engine: EngineDefinition,
  rpm: number,
  conditions: Conditions = normalConditions,
) {
  const core = new EngineCore(engine, conditions)
  core.sound = false
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
  for (let i = 0; i < 48000 * 1.2; i++) core.step()
  let torque = 0
  const samples = Math.round((6 * 120 * 48000) / rpm)
  for (let i = 0; i < samples; i++) {
    core.step()
    torque += core.absorbedTorque
  }
  return {
    torque: torque / samples,
    temperature: core.intakePortTemperature,
  }
}

describe('heated intake-port gas exchange', () => {
  it('migrates schema-4 builds to the exact legacy intake result', () => {
    const old: Record<string, unknown> = { ...roadEngine, schemaVersion: 4 }
    delete old.intakePortModel
    const migrated = validateEngine(old)
    expect(migrated.schemaVersion).toBe(5)
    expect(migrated.intakePortModel).toBe('legacy')
  })

  it('heats a slow charge more than a fast one and reduces low-speed filling', () => {
    const legacy = { ...roadEngine, intakePortModel: 'legacy' as const }
    const slow = held(roadEngine, 1500)
    const slowLegacy = held(legacy, 1500)
    const fast = held(roadEngine, 6000)
    const fastLegacy = held(legacy, 6000)
    const ambient = normalConditions.temperature

    expect(slow.temperature - ambient).toBeGreaterThan(12)
    expect(slow.temperature - ambient).toBeLessThan(25)
    expect(fast.temperature - ambient).toBeLessThan(
      (slow.temperature - ambient) * 0.35,
    )
    expect(slow.torque).toBeLessThan(slowLegacy.torque - 7)
    expect(fastLegacy.torque - fast.torque).toBeLessThan(7)
  })

  it('responds to the water-jacket temperature instead of an RPM multiplier', () => {
    const cool = held(roadEngine, 1500, {
      ...normalConditions,
      coolant: 323.15,
    })
    const hot = held(roadEngine, 1500, {
      ...normalConditions,
      coolant: 373.15,
    })
    expect(hot.temperature).toBeGreaterThan(cool.temperature + 10)
    expect(hot.torque).toBeLessThan(cool.torque - 4)
  })

  it('returns runner residual with energy bounded by the port wall', () => {
    const core = new EngineCore(roadEngine, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, throttle: 1, holdRpm: 1500 })
    let hottest = 0
    for (let i = 0; i < 48000; i++) {
      core.step()
      const cylinders = (
        core as unknown as {
          cylinders: { pushed: number; pushedEnergy: number }[]
        }
      ).cylinders
      for (const cylinder of cylinders)
        if (cylinder.pushed > 1e-9)
          hottest = Math.max(
            hottest,
            cylinder.pushedEnergy / cylinder.pushed,
          )
    }
    expect(hottest).toBeGreaterThan(enthalpy(normalConditions.temperature))
    expect(hottest).toBeLessThanOrEqual(
      enthalpy(core.telemetry().coolant + 10) + 1,
    )
  })

  it('reduces the K20 low-speed excess before using milder cam phasing', () => {
    const k20 = realEngines.find((preset) =>
      preset.engine.name.includes('K20A'),
    )!.engine
    const unphased = { ...k20, cams: null, management: null }
    const legacy = {
      ...unphased,
      intakePortModel: 'legacy' as const,
    }
    expect(held(unphased, 1500).torque).toBeLessThan(
      held(legacy, 1500).torque - 8,
    )
    const calibrated = held(k20, 1500).torque
    expect(calibrated).toBeGreaterThan(155)
    expect(calibrated).toBeLessThan(168)
  })
})
