import { describe, expect, it } from 'vitest'
import { canContinue, continueCore, createCore, crankingTorque } from './cores'
import { portTiming, TwoStrokeCore } from './twostroke'
import {
  mopedTwoStroke,
  normalConditions,
  raceTwoStroke,
  roadEngine,
  validateEngine,
} from './schema'
import type { EngineDefinition, TwoStroke, TwoStrokePipe } from './schema'

const race = raceTwoStroke
const ts = race.twoStroke!
const withTwoStroke = (e: EngineDefinition, t: Partial<TwoStroke>) => ({
  ...e,
  revLimit: 15000,
  mechanicalLimit: 16000,
  twoStroke: { ...e.twoStroke!, ...t },
})
/** Mean torque at wide-open throttle on a speed-held dyno, Nm. */
function torque(e: EngineDefinition, rpm: number) {
  const core = createCore({ ...e, revLimit: 15000, mechanicalLimit: 16000 }, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
  for (let s = 0; s < 48000 * 0.35; s++) core.step()
  let sum = 0
  const n = 4800
  for (let s = 0; s < n; s++) {
    core.step()
    sum += core.absorbedTorque
  }
  return sum / n
}
function delivery(e: EngineDefinition, rpm: number) {
  const core = createCore(e, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
  for (let s = 0; s < 48000 * 0.4; s++) core.step()
  return core.telemetry().twoStroke!.delivery[0]
}
/** Peak speed and the width of the band within 85% of the peak around it. */
function band(e: EngineDefinition, rpms: number[]) {
  const curve = rpms.map((r) => torque(e, r))
  const top = Math.max(...curve)
  const at = curve.indexOf(top)
  let lo = at
  let hi = at
  while (lo > 0 && curve[lo - 1] >= 0.85 * top) lo--
  while (hi < curve.length - 1 && curve[hi + 1] >= 0.85 * top) hi++
  return { peak: rpms[at], width: rpms[hi] - rpms[lo], top }
}
const chamber = ts.pipe as Extract<TwoStrokePipe, { kind: 'chamber' }>
const lengthened = (k: number): TwoStrokePipe => ({
  ...chamber,
  header: { ...chamber.header, length: chamber.header.length * k },
  diffuser: chamber.diffuser.map((c) => ({ ...c, length: c.length * k })),
  belly: { length: chamber.belly.length * k },
  baffle: chamber.baffle.map((c) => ({ ...c, length: c.length * k })),
})
const onPipe = [9500, 10500, 11500, 12500, 13500]

describe('two-stroke geometry', () => {
  it('derives port timing and time-areas from the port heights', () => {
    const r = race.stroke / 2
    const l = race.rodLength
    // A top edge exactly at the travel for 90° opens at 90°: 180° duration.
    const at90 = r + l - Math.sqrt(l * l - r * r)
    const e = withTwoStroke(race, {
      exhaustPort: { height: at90, width: 0.03, bridge: false },
      transfers: { ...ts.transfers, height: 0.045 },
      powerValve: null,
    })
    const t = portTiming(e, 6000)
    expect(t.exhaustOpen).toBeCloseTo(90, 6)
    expect(t.exhaustDuration).toBeCloseTo(180, 6)
    expect(t.blowdown).toBeCloseTo(t.transferOpen - 90, 9)
    const area = (Math.PI * race.bore ** 2) / 4
    const clearance = (area * race.stroke) / (race.compression - 1)
    expect(t.trappedCompression).toBeCloseTo(1 + (area * at90) / clearance, 9)
    // Exhaust time-area by a fine independent integration.
    let sum = 0
    const steps = 200000
    for (let k = 0; k < steps; k++) {
      const theta = ((k + 0.5) / steps) * 2 * Math.PI
      const s = Math.sin(theta)
      const x = r * (1 - Math.cos(theta)) + l - Math.sqrt(l * l - r * r * s * s)
      sum += 0.03 * Math.max(0, x - at90)
    }
    const timeArea = (sum * ((2 * Math.PI) / steps)) / ((6000 * 2 * Math.PI) / 60) / (area * race.stroke)
    expect(t.exhaustTimeArea / timeArea).toBeCloseTo(1, 3)
  })

  it('rejects impossible layouts and unsupported combinations', () => {
    const bad = (t: Partial<TwoStroke>, e: Partial<EngineDefinition> = {}) => () =>
      validateEngine({ ...withTwoStroke(race, t), ...e })
    expect(bad({ transfers: { ...ts.transfers, height: ts.exhaustPort.height } })).toThrow(/after the exhaust/)
    expect(bad({ exhaustPort: { height: 0.0275, width: 0.05, bridge: false } })).toThrow(/snag the rings/)
    expect(bad({ exhaustPort: { height: 0.0275, width: 0.06, bridge: true } })).toThrow(/bridged/)
    expect(bad({ exhaustPort: { height: 0.01, width: 0.04, bridge: false } })).toThrow(/ring land/)
    expect(bad({ transfers: { ...ts.transfers, height: 0.054 } })).toThrow(/bottom dead centre/)
    expect(
      bad({ pipe: { ...chamber, baffle: [{ length: 0.2, diameter: 0.12 }] } }),
    ).toThrow(/narrower/)
    expect(bad({}, { fuelSystem: { kind: 'port', transientCorrection: true, overrunCut: true } })).toThrow(/inject/)
    expect(bad({}, { induction: { kind: 'roots', rotorDisplacement: 0.001, driveRatio: 2, efficiency: 0.5, bypass: true, intercooler: { effectiveness: 0, pressureDrop: 0 } } })).toThrow(/Forced induction/)
    expect(() => validateEngine({ ...roadEngine, twoStroke: ts })).toThrow(/valves/)
    expect(() => validateEngine({ ...race, cylinders: 2 })).toThrow()
  })

  it('reads schema 1 builds as four-strokes', () => {
    const { cycle, twoStroke, ...old } = roadEngine
    void cycle
    void twoStroke
    const e = validateEngine({ ...old, schemaVersion: 1 })
    expect(e.schemaVersion).toBe(2)
    expect(e.cycle).toBe('four-stroke')
    expect(e.twoStroke).toBeNull()
  })
})

describe('two-stroke core', () => {
  it('kick-starts, idles and revs, and needs little cranking torque', () => {
    const core = createCore(race, normalConditions) as TwoStrokeCore
    core.setControls({ ignition: true, starter: true })
    core.advance(0.1)
    for (let i = 0; i < 6; i++) core.advance(0.1)
    core.setControls({ starter: false })
    for (let i = 0; i < 15; i++) core.advance(0.1)
    const idle = core.telemetry().rpm
    expect(idle).toBeGreaterThan(800)
    expect(idle).toBeLessThan(3000)
    core.setControls({ throttle: 0.5 })
    for (let i = 0; i < 10; i++) core.advance(0.1)
    expect(core.telemetry().rpm).toBeGreaterThan(6000)
    expect(crankingTorque(race, normalConditions)).toBeLessThan(race.starterTorque)
  })

  it('balances mass and energy across crankcase, cylinder and pipe', () => {
    const core = new TwoStrokeCore(race, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, throttle: 1, holdRpm: 11000 })
    core.advance(0.1)
    const start = core.contents()
    const ledger = { ...core.ledger }
    const pipe = core.cylinders[0].pipe
    const out = { mass: pipe.outletMass, energy: pipe.outletEnergy, heat: pipe.heatLost }
    for (let i = 0; i < 2; i++) core.advance(0.1)
    const end = core.contents()
    const inMass = core.ledger.inMass - ledger.inMass
    const outMass = pipe.outletMass - out.mass
    expect((end.mass - start.mass - inMass + outMass) / inMass).toBeLessThan(1e-9)
    const energy =
      core.ledger.inEnergy -
      ledger.inEnergy +
      (core.ledger.heat - ledger.heat) -
      (core.ledger.work - ledger.work) -
      (core.ledger.wall - ledger.wall) -
      (pipe.heatLost - out.heat) -
      (pipe.outletEnergy - out.energy)
    expect(Math.abs(end.energy - start.energy - energy) / (core.ledger.heat - ledger.heat)).toBeLessThan(1e-6)
  })

  it('reports scavenging figures in their physical ranges', () => {
    const core = createCore(race, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, throttle: 1, holdRpm: 11000 })
    core.advance(0.1)
    for (let i = 0; i < 3; i++) core.advance(0.1)
    const t = core.telemetry().twoStroke!
    expect(t.delivery[0]).toBeGreaterThan(0.5)
    expect(t.delivery[0]).toBeLessThan(1.5)
    expect(t.trapping[0]).toBeGreaterThan(0.4)
    expect(t.trapping[0]).toBeLessThan(1)
    expect(t.scavenging[0]).toBeGreaterThan(0.6)
    expect(t.scavenging[0]).toBeLessThan(1)
    expect(t.fuelLost).toBeGreaterThan(0.1)
  })

  it('direct injection loses no fuel through the exhaust', () => {
    const di = createCore(
      { ...race, fuelSystem: { kind: 'direct', transientCorrection: true, overrunCut: true } },
      normalConditions,
    )
    di.sound = false
    di.setControls({ ignition: true, throttle: 1, holdRpm: 9000 })
    for (let i = 0; i < 4; i++) di.advance(0.1)
    expect(di.telemetry().twoStroke!.fuelLost).toBeLessThan(0.02)
  })

  it('a twin fires each cylinder once a revolution, 180° apart', () => {
    const twin: EngineDefinition = { ...race, layout: 'inline-2', cylinders: 2, firingOrder: [1, 2], inertia: 0.008 }
    const single = torque(race, 11000)
    const both = torque(twin, 11000)
    expect(both / single).toBeGreaterThan(1.8)
    expect(both / single).toBeLessThan(2.2)
    const phases = createCore(twin, normalConditions).telemetry().phases
    expect(Math.abs(phases[0] - phases[1])).toBeCloseTo(180, 6)
  })

  it('continues a live edit, and rebuilds when the cycle changes', () => {
    const core = createCore(race, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, throttle: 0.4 })
    core.advance(0.1)
    const rpm = core.telemetry().rpm
    const edited = { ...race, ignitionAdvance: 18 }
    expect(canContinue(race, edited)).toBe(true)
    const next = continueCore(core, edited, normalConditions)
    expect(next.telemetry().rpm).toBeCloseTo(rpm, 6)
    expect((next as TwoStrokeCore).cylinders[0].pipe).toBe((core as TwoStrokeCore).cylinders[0].pipe)
    expect(canContinue(race, roadEngine)).toBe(false)
    expect(continueCore(core, roadEngine, normalConditions).telemetry().rpm).toBe(0)
  })
})

describe('two-stroke trends', { timeout: 120000 }, () => {
  it('a longer expansion chamber moves the torque peak to lower speed', () => {
    const base = band(race, [8500, ...onPipe])
    const longer = band(withTwoStroke(race, { pipe: lengthened(1.25) }), [8500, ...onPipe])
    expect(longer.peak).toBeLessThan(base.peak)
  })

  it('the tuned length follows the wave round-trip rule within 15%', () => {
    for (const k of [1, 1.25]) {
      const e = withTwoStroke(race, { pipe: lengthened(k) })
      const peak = band(e, [8500, 9500, 10500, 11500, 12500, 13500]).peak
      const tuned = portTiming(e).tunedRpm!
      expect(Math.abs(peak - tuned) / tuned).toBeLessThan(0.15)
    }
  })

  it('a higher exhaust port moves the peak up and narrows the band', () => {
    const base = band(race, onPipe)
    const high = band(withTwoStroke(race, { exhaustPort: { ...ts.exhaustPort, height: 0.0245 } }), onPipe)
    const low = band(withTwoStroke(race, { exhaustPort: { ...ts.exhaustPort, height: 0.0305 } }), [8500, ...onPipe])
    expect(high.peak).toBeGreaterThan(base.peak)
    expect(low.peak).toBeLessThan(base.peak)
    expect(high.width).toBeLessThanOrEqual(base.width)
    expect(low.width).toBeGreaterThan(base.width)
  })

  it('a tuned chamber beats a straight pipe at its tuned speed', () => {
    const straight = withTwoStroke(race, { pipe: { kind: 'straight', length: 0.25, diameter: 0.04 } })
    expect(torque(race, 11500)).toBeGreaterThan(1.3 * torque(straight, 11500))
    // The straight pipe's curve is flatter: its best and worst are closer.
    const curve = (e: EngineDefinition) => [6000, 8000, 10000, 12000].map((r) => torque(e, r))
    const spread = (c: number[]) => Math.max(...c) / Math.min(...c)
    expect(spread(curve(straight))).toBeLessThan(spread(curve(race)) + 0.6)
  })

  it('lower primary compression reduces delivery at low speed', () => {
    const loose = withTwoStroke(race, { crankcaseCompression: 1.2 })
    const tight = withTwoStroke(race, { crankcaseCompression: 1.6 })
    expect(delivery(tight, 4000)).toBeGreaterThan(delivery(loose, 4000))
  })

  it('a reed improves low-speed delivery over a piston port', () => {
    const reed = withTwoStroke(mopedTwoStroke, { intake: { kind: 'reed', area: 0.0004, stiffness: 500 } })
    expect(delivery(reed, 3000)).toBeGreaterThan(1.1 * delivery(mopedTwoStroke, 3000))
  })

  it('a closed power valve adds low-speed torque without costing top end', () => {
    const none = withTwoStroke(race, { powerValve: null })
    expect(torque(race, 7000)).toBeGreaterThan(1.04 * torque(none, 7000))
    expect(torque(race, 12000) / torque(none, 12000)).toBeCloseTo(1, 1)
  })
})
