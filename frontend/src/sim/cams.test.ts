import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import {
  camsFromEvents,
  clearanceRatio,
  floatedLiftAt,
  floatFactor,
  liftAt,
  peakMotionAcceleration,
  overlap,
  valveEvents,
} from './cams'
import {
  engineSchema,
  flatMaps,
  normalConditions,
  roadEngine,
  stockParts,
} from './schema'
import type { EngineDefinition } from './schema'
import { Stress } from './parts'
import { applyCamGrade, camGrades } from '../bench/partCatalogue'

const profiled: EngineDefinition = { ...roadEngine, cams: camsFromEvents(roadEngine) }
/** Longer duration and more lift around the same centrelines. */
const race = applyCamGrade(profiled, camGrades[2])

function torque(e: EngineDefinition, rpm: number) {
  const core = new EngineCore(e, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm, indestructible: true })
  let sum = 0
  for (let i = 0; i < 48000 * 2; i++) {
    core.step()
    if (i >= 48000) sum += core.absorbedTorque
  }
  return sum / 48000
}
/** Mean idle speed and the spread of idle speed over 3 s. */
function idle(e: EngineDefinition) {
  const core = new EngineCore(e, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, starter: true, indestructible: true })
  for (let i = 0; i < 48000 * 1.2; i++) core.step()
  core.setControls({ starter: false })
  let lo = Infinity
  let hi = 0
  for (let i = 0; i < 48000 * 5; i++) {
    core.step()
    if (i > 48000 * 2 && i % 480 === 0) {
      const rpm = core.telemetry().rpm
      lo = Math.min(lo, rpm)
      hi = Math.max(hi, rpm)
    }
  }
  return hi - lo
}

describe('camshafts and valve timing', () => {
  it('reads builds saved before 1.13.0 with fixed events', () => {
    const { cams: _, ...old } = roadEngine
    void _
    expect(engineSchema.parse(old).cams).toBeNull()
    const v = valveEvents(roadEngine, false, 0, 0)
    expect([v.intakeOpen, v.intakeClose, v.exhaustOpen, v.exhaustClose]).toEqual([
      350, 590, 145, 370,
    ])
    expect(overlap(v)).toBe(20)
  })
  it('migrates schema-5 builds to legacy motion and valve room', () => {
    const old: Record<string, unknown> = { ...roadEngine, schemaVersion: 5 }
    delete old.camMotion
    delete old.valveRelief
    const migrated = engineSchema.parse(old)
    expect(migrated.camMotion).toBe('legacy')
    expect(migrated.valveRelief).toBeNull()
  })
  it('uses zero-velocity polynomial ramps whose lift area and acceleration differ', () => {
    const area = (motion: EngineDefinition['camMotion']) => {
      let sum = 0
      for (let deg = 0; deg < 100; deg += 0.1)
        sum += liftAt(0, 100, 1, deg, motion) * 0.1
      return sum
    }
    for (const motion of ['gentle', 'performance', 'race'] as const) {
      expect(liftAt(0, 100, 1, 0, motion)).toBe(0)
      expect(liftAt(0, 100, 1, 0.001, motion)).toBeLessThan(1e-10)
      expect(liftAt(0, 100, 1, 99.999, motion)).toBeLessThan(1e-10)
    }
    expect(area('performance')).toBeGreaterThan(area('gentle') + 4)
    expect(area('race')).toBeGreaterThan(area('performance') + 4)
    expect(peakMotionAcceleration('race')).toBeGreaterThan(
      peakMotionAcceleration('performance') * 1.5,
    )
  })
  it('converts fixed events to profiles without changing a result', () => {
    for (const rpm of [2000, 5500])
      expect(torque(profiled, rpm)).toBe(torque(roadEngine, rpm))
  }, 30000)
  it('more duration moves torque up the rev range and roughens the idle', () => {
    expect(torque(race, 2000)).toBeLessThan(torque(profiled, 2000) - 10)
    expect(torque(race, 6500)).toBeGreaterThan(torque(profiled, 6500) + 10)
    expect(overlap(valveEvents(race, false, 0, 0))).toBeGreaterThan(40)
    expect(idle(race)).toBeGreaterThan(idle(profiled) * 1.5)
  }, 60000)
  it('phasers follow their map at their rate and broaden the torque curve', () => {
    const cams = { ...profiled.cams!, phasers: { intakeRange: 40, exhaustRange: 0, rate: 200 } }
    const phasedEngine = { ...profiled, cams }
    const maps = flatMaps(phasedEngine)
    // Advance the intake at low speed and retard it at high speed.
    maps.intakeCam = maps.load.map(() => maps.rpm.map((r) => (r <= 3000 ? 30 : -15)))
    const e = { ...phasedEngine, management: maps }
    const core = new EngineCore(e, normalConditions)
    core.setControls({ ignition: true, throttle: 1, holdRpm: 2000 })
    for (let i = 0; i < 4800; i++) core.step()
    // 0.1 s at 200°/s.
    expect(core.intakePhase).toBeCloseTo(20, 0)
    for (let i = 0; i < 48000; i++) core.step()
    expect(core.telemetry().ecu.camPhase).toEqual({ intake: 30, exhaust: 0 })
    expect(torque(e, 2000)).toBeGreaterThan(torque(profiled, 2000) + 3)
    expect(torque(e, 6700)).toBeGreaterThan(torque(profiled, 6700) + 3)
  }, 60000)
  it('a big cam floats stock springs sooner; uprated springs restore it', () => {
    expect(floatFactor(roadEngine)).toBe(1)
    expect(floatFactor(race)).toBeLessThan(floatFactor(profiled))
    const limit = (e: EngineDefinition) =>
      new Stress(e).telemetry(false).limits.find((l) => l.key === 'valveFloat')!
        .limit
    expect(limit(race)).toBeLessThan(limit(profiled))
    expect(
      limit({ ...race, parts: { ...stockParts, valveSprings: 'uprated' } }),
    ).toBeGreaterThan(limit(race))
  })
  it('separates equal-duration cams by motion and progressively loses control', () => {
    const gentle = { ...profiled, camMotion: 'gentle' as const }
    const performance = { ...profiled, camMotion: 'performance' as const }
    const aggressive = { ...profiled, camMotion: 'race' as const }
    expect(torque(performance, 6000)).toBeGreaterThan(torque(gentle, 6000))
    expect(torque(aggressive, 6000)).toBeGreaterThan(torque(performance, 6000))
    expect(floatFactor(aggressive)).toBeLessThan(floatFactor(performance))
    expect(floatFactor(performance)).toBeLessThan(floatFactor(gentle))
    expect(floatFactor({ ...roadEngine, camMotion: 'race' })).toBeLessThan(
      floatFactor(roadEngine),
    )
    expect(floatedLiftAt(0, 240, 0.01, 246, 'performance', 0)).toBe(0)
    expect(
      floatedLiftAt(0, 240, 0.01, 246, 'performance', 0.8),
    ).toBeGreaterThan(0)
  }, 60000)
  it('loses power below the failure speed, then can bend a valve', () => {
    const floating = { ...profiled, revLimit: 10000 }
    const limit = new Stress(floating)
      .telemetry(false)
      .limits.find((item) => item.key === 'valveFloat')!.limit
    const rpm = Math.round(limit * 0.97)
    const controlled = {
      ...floating,
      mechanicalLimit: Math.min(25000, floating.mechanicalLimit * 1.5),
    }
    expect(torque(floating, rpm)).toBeLessThan(torque(controlled, rpm) - 2)
    const core = new EngineCore(floating, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
    for (let i = 0; i < 48000 * 3; i++) core.step()
    expect(core.stress.failure).toBeNull()
    expect(
      core.telemetry().stress.limits.find((item) => item.key === 'valveFloat')!
        .ratio,
    ).toBeGreaterThan(0.9)
  }, 60000)
  it('advancing an aggressive intake cam puts a valve into the piston', () => {
    const cams = { ...race.cams!, phasers: { intakeRange: 60, exhaustRange: 0, rate: 400 } }
    const e = { ...race, compression: 11, valveRelief: 0.006, cams }
    expect(clearanceRatio(e, valveEvents(e, false, 0, 0))).toBeLessThan(1)
    expect(clearanceRatio(e, valveEvents(e, false, 60, 0))).toBeGreaterThan(1)
    const maps = flatMaps(e)
    maps.intakeCam = maps.load.map(() => maps.rpm.map(() => 60))
    const run = () => {
      const core = new EngineCore({ ...e, management: maps }, normalConditions)
      core.setControls({ ignition: true, throttle: 1, holdRpm: 3000 })
      for (let i = 0; i < 48000 && !core.stress.failure; i++) core.step()
      return core.stress.failure
    }
    const failure = run()
    expect(failure?.key).toBe('valveClearance')
    expect(failure?.title).toBe('Valve hit a piston')
    expect(run()).toEqual(failure)
  }, 30000)
})
