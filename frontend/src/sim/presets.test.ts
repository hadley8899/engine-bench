import { describe, expect, it } from 'vitest'
import { realEngines } from '../bench/presets'
import { EngineCore } from './core'
import { displacement, normalConditions } from './schema'

const golf = realEngines.find((b) => b.engine.name.includes('AXX'))!.engine
/**
 * Full-load torque read from VW SSP 337's curve (S337_008), Nm, and the
 * largest deviation the calibrated preset is allowed (docs/PRESETS.md).
 */
const published: [number, number, number][] = [
  [1000, 170, 25],
  [1500, 239, 20],
  [2000, 280, 12],
  [3000, 280, 12],
  [4000, 280, 12],
  [4500, 280, 12],
  [5500, 254, 12],
  [6500, 218, 12],
]
function steady(rpm: number) {
  const core = new EngineCore(golf, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
  let sum = 0
  let n = 0
  let stress = 0
  for (let i = 0; i < 48000 * 4; i++) {
    core.step()
    if (i < 48000 * 3) continue
    sum += core.absorbedTorque
    n++
    if (i % 480 === 0) stress = Math.max(stress, core.stress.worst())
  }
  return { torque: sum / n, stress, failure: core.stress.failure }
}

describe('VW 2.0 TFSI (AXX) preset', () => {
  it('has the published geometry', () => {
    expect(displacement(golf) * 1e6).toBeCloseTo(1984, 0)
    expect(golf.compression).toBe(10.5)
    expect(golf.combustion.fuel).toBe('ron98')
    expect(golf.fuelSystem.kind).toBe('direct')
  })
  for (const [rpm, torque, tolerance] of published)
    it(`makes ${torque} Nm at ${rpm} RPM within ${tolerance} Nm, inside its limits`, () => {
      const s = steady(rpm)
      expect(Math.abs(s.torque - torque)).toBeLessThan(tolerance)
      expect(s.failure).toBeNull()
      expect(s.stress).toBeLessThan(0.95)
    }, 30000)
  it('reaches about 147 kW near 5,700 RPM', () => {
    const { torque } = steady(5700)
    expect((torque * 5700 * Math.PI) / 30000).toBeGreaterThan(140)
    expect((torque * 5700 * Math.PI) / 30000).toBeLessThan(154)
  }, 30000)
})
