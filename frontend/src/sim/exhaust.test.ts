import { describe, expect, it } from 'vitest'
import { applyCamGrade, camGrades } from '../bench/partCatalogue'
import { camsFromEvents } from './cams'
import { EngineCore } from './core'
import { FourStrokeExhaust } from './exhaust'
import type { EngineDefinition } from './schema'
import { engineSchema, normalConditions, roadEngine } from './schema'

const pulse = (waves: FourStrokeExhaust, cylinder = 0, flow = 0.12) => {
  const values = new Float64Array(waves.cylinders)
  values[cylinder] = flow
  waves.step(values)
}
const wait = (waves: FourStrokeExhaust, samples: number) => {
  const zero = new Float64Array(waves.cylinders)
  for (let i = 0; i < samples; i++) waves.step(zero)
}
const profiled = { ...roadEngine, cams: camsFromEvents(roadEngine) }
const raceCam = applyCamGrade(profiled, camGrades[2])
function heldTorque(engine: EngineDefinition, rpm: number) {
  const core = new EngineCore(engine, normalConditions)
  core.sound = false
  core.setControls({
    ignition: true,
    throttle: 1,
    holdRpm: rpm,
    indestructible: true,
  })
  for (let i = 0; i < 48000; i++) core.step()
  let sum = 0
  for (let i = 0; i < 48000; i++) {
    core.step()
    sum += core.absorbedTorque
  }
  return sum / 48000
}
const header = (
  engine: EngineDefinition,
  headerLength: number,
  collector: EngineDefinition['exhaust']['collector'] = '4-1',
): EngineDefinition => ({
  ...engine,
  exhaust: { ...engine.exhaust, headerLength, collector },
})

describe('four-stroke exhaust pressure waves', () => {
  it('keeps old builds on the ambient-pressure boundary', () => {
    const old = structuredClone(roadEngine) as Record<string, unknown>
    old.schemaVersion = 3
    const exhaust = old.exhaust as Record<string, unknown>
    delete exhaust.pressureWaves
    const migrated = engineSchema.parse(old)
    expect(migrated.exhaust.pressureWaves).toBe(false)
    const waves = new FourStrokeExhaust(migrated)
    pulse(waves)
    wait(waves, waves.finalDelay + 2)
    expect(waves.backPressure(0, normalConditions.pressure)).toBe(
      normalConditions.pressure,
    )
  })

  it('returns a rarefaction after the primary round trip and couples cylinders', () => {
    const waves = new FourStrokeExhaust({
      ...roadEngine,
      exhaust: { ...roadEngine.exhaust, collector: '4-1' },
    })
    pulse(waves)
    wait(waves, waves.primaryDelay - 1)
    expect(waves.wave(0)).toBe(0)
    waves.step(new Float64Array(4))
    expect(waves.wave(0)).toBeLessThan(-1000)
    expect(waves.wave(1)).toBeGreaterThan(100)
    expect(waves.backPressure(0, normalConditions.pressure)).toBeLessThan(
      normalConditions.pressure,
    )
  })

  it('makes primary length set the return time', () => {
    const short = new FourStrokeExhaust({
      ...roadEngine,
      exhaust: { ...roadEngine.exhaust, headerLength: 0.25 },
    })
    const long = new FourStrokeExhaust({
      ...roadEngine,
      exhaust: { ...roadEngine.exhaust, headerLength: 1.2 },
    })
    expect(long.primaryDelay).toBeGreaterThan(short.primaryDelay * 4)
  })

  it('pairs cylinders half a firing cycle apart in a tri-Y', () => {
    const waves = new FourStrokeExhaust({
      ...roadEngine,
      exhaust: { ...roadEngine.exhaust, collector: '4-2-1' },
    })
    pulse(waves, 0)
    wait(waves, waves.primaryDelay)
    // 1-3-4-2 pairs cylinders 1 and 4 at the first Y.
    expect(waves.wave(0)).toBeLessThan(0)
    expect(waves.wave(3)).toBeGreaterThan(0)
    expect(waves.wave(1)).toBe(0)
    expect(waves.wave(2)).toBe(0)
  })

  it('carries matching delay-line state through a live update', () => {
    const first = new FourStrokeExhaust(roadEngine)
    pulse(first)
    wait(first, Math.floor(first.primaryDelay / 2))
    const continued = new FourStrokeExhaust({ ...roadEngine, name: 'Renamed' })
    continued.adopt(first)
    wait(first, first.primaryDelay - Math.floor(first.primaryDelay / 2))
    wait(continued, continued.primaryDelay - Math.floor(continued.primaryDelay / 2))
    expect(continued.wave(0)).toBe(first.wave(0))
  })

  it('moves the useful band when primary length changes', { timeout: 30000 }, () => {
    const short = header(raceCam, 0.2)
    const long = header(raceCam, 1.5)
    const mid = header(raceCam, 1)
    expect(heldTorque(long, 2000)).toBeGreaterThan(
      heldTorque(short, 2000) + 10,
    )
    expect(heldTorque(mid, 6500)).toBeGreaterThan(
      heldTorque(long, 6500) + 4,
    )
  })

  it('makes overlap expose more pressure-wave scavenging', { timeout: 30000 }, () => {
    const stockSpread =
      heldTorque(header(profiled, 1), 5000) -
      heldTorque(header(profiled, 0.2), 5000)
    const overlapSpread =
      heldTorque(header(raceCam, 1), 5000) -
      heldTorque(header(raceCam, 0.2), 5000)
    expect(overlapSpread).toBeGreaterThan(10)
    expect(overlapSpread).toBeGreaterThan(stockSpread * 4)
  })

  it('gives a tri-Y lower-speed help and a 4-1 more top end', { timeout: 30000 }, () => {
    const fourOne = header(raceCam, 1, '4-1')
    const triY = header(raceCam, 1, '4-2-1')
    expect(heldTorque(triY, 2000)).toBeGreaterThan(
      heldTorque(fourOne, 2000) + 4,
    )
    expect(heldTorque(fourOne, 6000)).toBeGreaterThan(
      heldTorque(triY, 6000) + 1,
    )
  })
})
