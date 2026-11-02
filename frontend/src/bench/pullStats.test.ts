import { describe, expect, it } from 'vitest'
import { roadEngine, normalConditions, defaultProcedure } from '../sim/schema'
import type { Run } from '../sim/schema'
import { bandPower, peaks } from './pullStats'

const run = (powers: [number, number][]): Run => ({
  schemaVersion: 1,
  modelVersion: 'eb-0d-1.5.0',
  id: 'r',
  runtime: 'test',
  engine: roadEngine,
  conditions: normalConditions,
  procedure: defaultProcedure,
  status: 'complete',
  reason: '',
  warnings: [],
  samples: powers.map(([rpm, power]) => ({
    time: 0,
    rpm,
    power,
    torque: (power * 30000) / (Math.PI * rpm),
    absorbedTorque: 0,
  })),
})

describe('pull statistics', () => {
  it('finds peak power and torque', () => {
    const p = peaks(run([[2000, 40], [4000, 90], [6000, 100]]))!
    expect(p.power.rpm).toBe(6000)
    expect(p.torque.rpm).toBe(4000)
  })
  it('averages power over a band by area under the curve', () => {
    const r = run([[2000, 40], [4000, 80], [6000, 80]])
    // Linear from 40 to 80 kW over 2,000–4,000 RPM: mean 60 kW.
    expect(bandPower(r, [2000, 4000])).toBeCloseTo(60, 9)
    // 3,000–5,000: half at a mean of 70, half at 80.
    expect(bandPower(r, [3000, 5000])).toBeCloseTo(75, 9)
    expect(bandPower(r, [1000, 4000])).toBeNull()
    expect(bandPower(r, [4000, 3000])).toBeNull()
  })
})
