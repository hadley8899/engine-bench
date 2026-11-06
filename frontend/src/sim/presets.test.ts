import { describe, expect, it } from 'vitest'
import { realEngines } from '../bench/presets'
import { createCore } from './cores'
import { displacement, normalConditions } from './schema'
import type { EngineDefinition } from './schema'

/**
 * Published full-load torque, Nm, and the largest deviation each calibrated
 * preset is allowed (docs/PRESETS.md). The Golf and the K20A are read from
 * manufacturer curves; the others are their rated points only.
 */
const published: Record<
  string,
  {
    cc: number
    points: [number, number, number][]
    kw: [number, number]
    /** The share of the published figures the preset is held to (1 unless stated). */
    share?: number
  }
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
      [6500, 302, 13],
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
  // Only the rated power is published; 39.3 Nm is that point.
  RD350LC: {
    cc: 347,
    points: [[8500, 39.3, 4]],
    kw: [8500, 35],
  },
  // Restricted (learner) tune: 15.2 Nm at 6,500 RPM (1990–93 listing) and
  // 10.3 kW, 14.2 Nm at 7,000 RPM (2002 listing).
  DT125R: {
    cc: 125,
    points: [
      [6500, 15.2, 3],
      [7000, 14.2, 3],
    ],
    kw: [7000, 10.3],
  },
  // Racing two-strokes use the versioned tuned charging model and are held
  // to their full published comparison points.
  YZ125: {
    cc: 125,
    // Dirt Bike magazine's dyno: 22.3 Nm at 10,940 and 26.7 kW at 11,670 RPM.
    points: [[11000, 22.3, 2]],
    kw: [11500, 26.7],
  },
  YZ250: {
    cc: 249,
    points: [[7500, 41.5, 3]],
    kw: [8800, 35],
  },
  // Aprilia gives no speeds; 21 kW and 19 Nm meet at about 10,500 RPM.
  RS125: {
    cc: 125,
    points: [[10500, 19, 1.5]],
    kw: [10500, 21],
  },
  '2JZ-GTE': {
    cc: 2997,
    points: [[3600, 431, 18]],
    kw: [5600, 206],
  },
  RB26DETT: {
    // 86.0 × 73.7 mm calculates to 2,568.7 cc; Nissan labels it 2,568 cc.
    cc: 2568.7,
    points: [[4400, 392, 18]],
    kw: [6800, 206],
  },
  'Subaru EJ20': {
    cc: 1994,
    points: [[4000, 373, 19]],
    kw: [6400, 206],
  },
  'GM LS3': {
    cc: 6162,
    points: [[4600, 576, 25]],
    kw: [5900, 321],
  },
  'Aprilia RS250': {
    cc: 249,
    points: [[11000, 39, 4]],
    kw: [11000, 45],
  },
  'Honda RS250R': {
    cc: 250,
    points: [[12500, 48, 5]],
    kw: [12500, 63],
  },
}
function steady(engine: EngineDefinition, rpm: number) {
  const core = createCore(engine, normalConditions)
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
  it('uses RON 100 for the Japanese-market four-strokes', () => {
    const japanese = [
      'Honda Civic',
      'Mitsubishi Evo',
      'Nissan Silvia',
      'Toyota AE86',
      'Toyota Supra',
      'Nissan Skyline',
      'Subaru Impreza',
    ]
    for (const label of japanese)
      expect(realEngines.find((p) => p.label.startsWith(label))!.engine.combustion.fuel).toBe(
        'ron100',
      )
  })
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
      const share = ref.share ?? 1
      const of = share === 1 ? '' : ` (${Math.round(share * 100)}% of the published figure)`
      for (const [rpm, published, tolerance] of ref.points) {
        const torque = published * share
        it(`makes ${torque.toFixed(1)} Nm at ${rpm} RPM within ${tolerance} Nm${of}, inside its limits`, () => {
          const s = steady(engine, rpm)
          expect(Math.abs(s.torque - torque)).toBeLessThan(tolerance)
          expect(s.failure).toBeNull()
          expect(s.stress).toBeLessThan(0.95)
        }, 30000)
      }
      const target = ref.kw[1] * share
      it(`makes about ${target.toFixed(1)} kW at ${ref.kw[0]} RPM${of}`, () => {
        const { torque } = steady(engine, ref.kw[0])
        const kw = (torque * ref.kw[0] * Math.PI) / 30000
        expect(Math.abs(kw - target) / target).toBeLessThan(0.06)
      }, 30000)
    })
  }
})
