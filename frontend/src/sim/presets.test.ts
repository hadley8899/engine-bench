import { describe, expect, it } from 'vitest'
import { realEngines } from '../bench/presets'
import { EngineCore } from './core'
import { displacement, normalConditions } from './schema'
import type { EngineDefinition } from './schema'

/**
 * Published full-load torque, Nm, and the largest deviation each calibrated
 * preset is allowed (docs/PRESETS.md). The Golf and the K20A are read from
 * manufacturer curves; the others are their rated points only.
 */
const published: Record<
  string,
  { cc: number; points: [number, number, number][]; kw: [number, number] }
> = {
  AXX: {
    cc: 1984,
    points: [
      [1000, 170, 25],
      [1500, 239, 20],
      [2000, 280, 12],
      [3000, 280, 12],
      [4000, 280, 12],
      [4500, 280, 12],
      [5500, 254, 12],
      [6500, 218, 12],
    ],
    kw: [5700, 147],
  },
  K20A: {
    cc: 1998,
    points: [
      [1500, 160, 35],
      [2500, 186, 12],
      [3500, 204, 12],
      [4500, 187, 15],
      [5500, 208, 12],
      [6000, 218, 12],
      [7000, 210, 12],
      [8000, 190, 12],
    ],
    kw: [8000, 165],
  },
  '4G63T': {
    cc: 1997,
    points: [
      [3500, 383, 12],
      [6500, 302, 12],
    ],
    kw: [6500, 206],
  },
  SR20DET: {
    cc: 1998,
    points: [
      [4800, 275, 12],
      [6400, 274, 12],
    ],
    kw: [6400, 184],
  },
  '4A-GE': {
    cc: 1587,
    points: [
      [5200, 149, 8],
      [6600, 127, 8],
    ],
    kw: [6600, 88],
  },
}
function steady(engine: EngineDefinition, rpm: number) {
  const core = new EngineCore(engine, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
  // Boost needs longer to settle than a naturally aspirated charge.
  const settle = engine.induction.kind === 'none' ? 1 : 3
  let sum = 0
  let n = 0
  let stress = 0
  for (let i = 0; i < 48000 * (settle + 1); i++) {
    core.step()
    if (i < 48000 * settle) continue
    sum += core.absorbedTorque
    n++
    if (i % 480 === 0) stress = Math.max(stress, core.stress.worst())
  }
  return { torque: sum / n, stress, failure: core.stress.failure }
}

describe('real-engine presets', () => {
  it('has a published reference for every preset', () => {
    for (const preset of realEngines)
      expect(
        Object.keys(published).some((code) => preset.engine.name.includes(code)),
      ).toBe(true)
  })
  for (const [code, ref] of Object.entries(published)) {
    const engine = realEngines.find((b) => b.engine.name.includes(code))!
      .engine
    describe(engine.name, () => {
      it(`displaces ${ref.cc} cc`, () => {
        expect(displacement(engine) * 1e6).toBeCloseTo(ref.cc, 0)
      })
      for (const [rpm, torque, tolerance] of ref.points)
        it(`makes ${torque} Nm at ${rpm} RPM within ${tolerance} Nm, inside its limits`, () => {
          const s = steady(engine, rpm)
          expect(Math.abs(s.torque - torque)).toBeLessThan(tolerance)
          expect(s.failure).toBeNull()
          expect(s.stress).toBeLessThan(0.95)
        }, 30000)
      it(`makes about ${ref.kw[1]} kW at ${ref.kw[0]} RPM`, () => {
        const { torque } = steady(engine, ref.kw[0])
        const kw = (torque * ref.kw[0] * Math.PI) / 30000
        expect(Math.abs(kw - ref.kw[1]) / ref.kw[1]).toBeLessThan(0.06)
      }, 30000)
    })
  }
})
