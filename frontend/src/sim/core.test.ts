import { describe, expect, it } from 'vitest'
import { crankingTorque, EngineCore } from './core'
import { DynoTest } from './dyno'
import {
  atmosphere,
  geometry,
  massFlow,
  pistonTravel,
  powerKw,
  internalEnergy,
  rpmToOmega,
  temperatureFromEnergy,
  wiebe,
} from './physics'
import type { EngineDefinition, Metres, Pascals } from './schema'
import {
  conditionsSchema,
  defaultProcedure,
  displacement,
  fuelSystemDefaults,
  inductionDefaults,
  normalConditions,
  recipeSchema,
  roadEngine,
  runSchema,
  scaledProportions,
  undersizedForEngine,
  sportEngine,
  validateEngine,
  validateProcedure,
} from './schema'
function advance(core: EngineCore, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) core.advance(0.1)
}
function complete(test: DynoTest) {
  while (test.run.status === 'running') test.advance(4800)
  return test.run
}

/** Mean brake torque at a held speed and wide-open throttle. */
function heldTorque(engine = roadEngine, rpm: number) {
  const core = new EngineCore(engine, normalConditions)
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
  advance(core, 1.2)
  let sum = 0
  const steps = Math.round((6 * 120 * 48000) / rpm)
  for (let i = 0; i < steps; i++) {
    core.step()
    sum += core.absorbedTorque
  }
  return sum / steps
}
function curve(engine = roadEngine) {
  return [1500, 2500, 3500, 4500, 5500, 6500].map((rpm) => {
    const torque = heldTorque(engine, rpm)
    return { rpm, torque, kw: (torque * rpm * Math.PI) / 30000 }
  })
}

describe('definitions and physical invariants', () => {
  it('derives a 1998 cc engine and compression volume from geometry', () => {
    expect(displacement(roadEngine) * 1e6).toBeCloseTo(1998.23, 1)
    expect(
      geometry(roadEngine, Math.PI).volume / geometry(roadEngine, 0).volume,
    ).toBeCloseTo(10.2, 10)
    expect(pistonTravel(Math.PI, 0.086 as Metres, 0.143 as Metres)).toBeCloseTo(
      0.086,
      12,
    )
  })
  it('rejects nonfinite, unsupported and contradictory inputs', () => {
    expect(() => validateEngine({ ...roadEngine, bore: NaN })).toThrow()
    expect(() => validateEngine({ ...roadEngine, layout: 'v8' })).toThrow()
    expect(() =>
      validateEngine({ ...roadEngine, firingOrder: [1, 1, 3, 4] }),
    ).toThrow()
    // A 200 mm stroke needs a rod of at least 150 mm; the road rod is 143 mm.
    expect(() => validateEngine({ ...roadEngine, stroke: 0.2 })).toThrow()
    expect(
      validateEngine({ ...roadEngine, stroke: 0.2, rodLength: 0.15 }).stroke,
    ).toBe(0.2)
    expect(() => validateEngine({ ...roadEngine, bore: 0.31 })).toThrow()
    expect(() =>
      conditionsSchema.parse({ ...normalConditions, oxygen: 0.99 }),
    ).toThrow()
    expect(() =>
      recipeSchema.parse({
        format: 'engine-bench/99',
        engine: roadEngine,
        conditions: normalConditions,
      }),
    ).toThrow()
  })
  it('inverts temperature-dependent internal energy', () => {
    for (const t of [30, 300, 1500, 2800, 6000])
      expect(temperatureFromEnergy(internalEnergy(t))).toBeCloseTo(t, 9)
    // Hot gas stores more energy per kelvin than cold air.
    expect(internalEnergy(2501) - internalEnergy(2500)).toBeGreaterThan(
      (internalEnergy(301) - internalEnergy(300)) * 1.4,
    )
  })
  it('converts torque and speed to kW', () => {
    expect(powerKw(100, rpmToOmega(3000))).toBeCloseTo(31.4159265, 6)
  })
  it('calculates choked flow and monotonically increasing burned fraction', () => {
    const flow = (p: number) =>
      massFlow(100000 as Pascals, p as Pascals, 300, 0.0003)
    expect(flow(100000)).toBe(0)
    expect(flow(10000)).toBeCloseTo(flow(20000), 12)
    expect(flow(80000)).toBeLessThan(flow(20000))
    expect(wiebe(0)).toBe(0)
    expect(wiebe(0.5)).toBeGreaterThan(wiebe(0.2))
    expect(wiebe(1)).toBeLessThanOrEqual(1)
  })
  it('accounts for temperature, pressure and humidity in air charge', () => {
    const a = atmosphere(normalConditions)
    expect(
      atmosphere({ ...normalConditions, temperature: 313 }).density,
    ).toBeLessThan(a.density)
    expect(
      atmosphere({ ...normalConditions, pressure: 80000 }).density,
    ).toBeLessThan(a.density)
    expect(
      atmosphere({ ...normalConditions, humidity: 1 }).oxygenMassFraction,
    ).toBeLessThan(
      atmosphere({ ...normalConditions, humidity: 0 }).oxygenMassFraction,
    )
    expect(
      atmosphere({ ...normalConditions, oxygen: 0.23 }).oxygenMassFraction,
    ).toBeGreaterThan(a.oxygenMassFraction)
  })
})

describe('engine integration', () => {
  it('starts from rest, settles to an idle and accelerates with throttle', () => {
    const core = new EngineCore(roadEngine, normalConditions)
    expect(core.telemetry().rpm).toBe(0)
    core.setControls({ ignition: true, starter: true })
    advance(core, 1.2)
    core.setControls({ starter: false })
    advance(core, 5)
    const idle = core.telemetry().rpm
    expect(idle).toBeGreaterThan(500)
    expect(idle).toBeLessThan(1600)
    core.setControls({ throttle: 0.8 })
    advance(core, 2)
    expect(core.telemetry().rpm).toBeGreaterThan(idle + 800)
    expect(core.maxSubsteps).toBeLessThanOrEqual(4)
  })
  it('flags a starter too weak to turn the engine and starts with enough torque', () => {
    const big = {
      ...roadEngine,
      bore: 0.105,
      stroke: 0.105,
      starterTorque: 70,
    }
    const needed = crankingTorque(big, normalConditions)
    expect(needed).toBeGreaterThan(crankingTorque(roadEngine, normalConditions))
    expect(needed).toBeGreaterThan(70)
    const weak = new EngineCore(big, normalConditions)
    weak.setControls({ ignition: true, starter: true })
    advance(weak, 1.2)
    expect(weak.telemetry().rpm).toBeLessThan(20)
    expect(weak.telemetry().starterStalled).toBe(true)
    const strong = new EngineCore(
      { ...big, starterTorque: Math.ceil(needed * 1.1) },
      normalConditions,
    )
    strong.setControls({ ignition: true, starter: true })
    advance(strong, 1.2)
    strong.setControls({ starter: false })
    advance(strong, 2)
    expect(strong.telemetry().rpm).toBeGreaterThan(500)
    expect(strong.telemetry().starterStalled).toBe(false)
  })
  it('idles at extreme sizes once valves and inertia are scaled to the engine', () => {
    for (const [bore, stroke, rodLength] of [
      [0.02, 0.02, 0.035],
      [0.3, 0.3, 0.45],
    ]) {
      const raw = {
        ...roadEngine,
        bore,
        stroke,
        rodLength,
        starterTorque: 20000,
      }
      expect(undersizedForEngine(raw).length).toBe(bore > 0.1 ? 3 : 0)
      const scaled = { ...raw, ...scaledProportions(raw) }
      expect(undersizedForEngine(scaled)).toEqual([])
      const core = new EngineCore(scaled, normalConditions)
      core.setControls({ ignition: true, starter: true })
      advance(core, 1.2)
      core.setControls({ starter: false })
      advance(core, 2)
      expect(core.telemetry().rpm).toBeGreaterThan(500)
    }
  })
  it('does not blame the starter when dyno load stops the crank', () => {
    const core = new EngineCore(roadEngine, normalConditions)
    core.setControls({ ignition: false, starter: true, load: 400 })
    advance(core, 1.2)
    expect(core.telemetry().rpm).toBeLessThan(20)
    expect(core.telemetry().starterStalled).toBe(false)
  })
  it('reads builds saved before runners were modelled with a 300 mm runner', () => {
    const legacy: Record<string, unknown> = { ...roadEngine }
    delete legacy.intakeRunnerLength
    expect(validateEngine(legacy).intakeRunnerLength).toBe(0.3)
    expect(() =>
      validateEngine({ ...roadEngine, intakeRunnerLength: 0.04 }),
    ).toThrow()
  })
  it('reads builds saved before starter torque was configurable as 70 Nm', () => {
    const legacy: Record<string, unknown> = { ...roadEngine }
    delete legacy.starterTorque
    expect(validateEngine(legacy).starterTorque).toBe(70)
  })
  it('slows under load and stalls without ignition', () => {
    const core = new EngineCore(roadEngine, normalConditions)
    core.setControls({ ignition: true, throttle: 0.3, starter: true })
    advance(core, 1.2)
    core.setControls({ starter: false, ignition: false, load: 100 })
    advance(core, 4)
    expect(core.telemetry().rpm).toBe(0)
  })
  it('is independent of advance batching', () => {
    const a = new EngineCore(roadEngine, normalConditions),
      b = new EngineCore(roadEngine, normalConditions)
    a.setControls({ ignition: true, starter: true })
    b.setControls({ ignition: true, starter: true })
    advance(a, 1)
    for (let i = 0; i < 48000; i++) b.step()
    expect(a.telemetry()).toEqual(b.telemetry())
  })
  it('cuts combustion at the electronic limiter without changing mechanical capability', () => {
    const core = new EngineCore(
      { ...roadEngine, revLimit: 3500 },
      normalConditions,
    )
    core.setControls({ ignition: true, throttle: 1, holdRpm: 4000 })
    advance(core, 1)
    expect(core.telemetry().limited).toBe(true)
    expect(core.telemetry().torque).toBeLessThan(0)
    expect(core.engine.mechanicalLimit).toBe(roadEngine.mechanicalLimit)
  })
  it('supports different settings without fabricating a power curve', () => {
    const run = (temperature: number, engine = roadEngine) => {
      const core = new EngineCore(engine, { ...normalConditions, temperature })
      core.setControls({ ignition: true, throttle: 1, holdRpm: 3500 })
      advance(core, 1.5)
      return core.telemetry().torque
    }
    expect(run(313)).toBeLessThan(run(273))
    expect(run(293, sportEngine)).not.toBeCloseTo(run(293), 0)
  })
  it('limits advance batches and keeps exhaust audio finite and bounded', () => {
    const core = new EngineCore(roadEngine, normalConditions)
    expect(() => core.advance(1)).toThrow()
    core.setControls({ ignition: true, throttle: 1, holdRpm: 6000 })
    let energy = 0
    for (let i = 0; i < 48000; i++) {
      const audio = core.step()
      expect(Number.isFinite(audio)).toBe(true)
      expect(Math.abs(audio)).toBeLessThanOrEqual(0.65)
      energy += audio ** 2
    }
    expect(energy).toBeGreaterThan(1)
  })
})

describe('dyno procedures', () => {
  it('validates limits and reversed ranges before starting', () => {
    expect(() =>
      validateProcedure({ ...defaultProcedure, endRpm: 7000 }, roadEngine),
    ).toThrow()
    expect(() =>
      validateProcedure({ ...defaultProcedure, endRpm: 1500 }, roadEngine),
    ).toThrow()
  })
  it('generates repeatable sweeps, derived power and immutable snapshots', () => {
    const a = new DynoTest(roadEngine, normalConditions, {
      ...defaultProcedure,
      endRpm: 2500,
    })
    const b = new DynoTest(roadEngine, normalConditions, {
      ...defaultProcedure,
      endRpm: 2500,
    })
    const run = complete(a)
    expect(run.status).toBe('complete')
    expect(run.samples.length).toBeGreaterThan(5)
    expect(run.samples).toEqual(complete(b).samples)
    expect(run.engine).not.toBe(roadEngine)
    for (const s of run.samples)
      expect(s.power).toBeCloseTo((s.torque * s.rpm * Math.PI) / 30000, 10)
    expect(runSchema.safeParse(run).success).toBe(true)
  })
  it('holds each steady-state point until torque settles', () => {
    const run = complete(
      new DynoTest(roadEngine, normalConditions, {
        ...defaultProcedure,
        kind: 'steps',
        endRpm: 2500,
      }),
    )
    expect(run.status).toBe('complete')
    expect(run.samples.map((s) => Math.round(s.rpm))).toEqual([
      1500, 2000, 2500,
    ])
  })
  it('retains aborted samples and does not rewrite a completed run', () => {
    const test = new DynoTest(roadEngine, normalConditions)
    for (let i = 0; i < 20; i++) test.advance(4800)
    test.abort('Emergency stop')
    expect(test.run.status).toBe('aborted')
    expect(test.run.samples.length).toBeGreaterThan(0)
    expect(test.run.reason).toBe('Emergency stop')
    const done = new DynoTest(roadEngine, normalConditions, {
      ...defaultProcedure,
      endRpm: 2000,
    })
    complete(done)
    done.abort('Stopped replay')
    expect(done.run.status).toBe('complete')
  })
})

describe('supported environmental and configuration envelope', () => {
  function measuredTorque(conditions = normalConditions, engine = roadEngine) {
    const core = new EngineCore(engine, conditions)
    core.setControls({ ignition: true, throttle: 1, holdRpm: 3500 })
    advance(core, 1.5)
    let sum = 0
    for (let i = 0; i < 24000; i++) {
      core.step()
      sum += core.torque
    }
    return sum / 24000
  }
  it('propagates pressure and humidity changes to measured output', () => {
    expect(
      measuredTorque({ ...normalConditions, pressure: 80000 }),
    ).toBeLessThan(measuredTorque())
    expect(measuredTorque({ ...normalConditions, humidity: 1 })).toBeLessThan(
      measuredTorque({ ...normalConditions, humidity: 0 }),
    )
  })
  it('oxygen enrichment is limited by available fuel', () => {
    const rich = { ...roadEngine, lambda: 0.85 }
    expect(
      measuredTorque({ ...normalConditions, oxygen: 0.23 }, rich),
    ).toBeGreaterThan(measuredTorque(normalConditions, rich))
    const lean = { ...roadEngine, lambda: 1.15 }
    const normal = measuredTorque(normalConditions, lean)
    expect(
      Math.abs(
        measuredTorque({ ...normalConditions, oxygen: 0.23 }, lean) - normal,
      ),
    ).toBeLessThan(2)
  })
  it('stays finite across the corners of the supported geometry envelope', () => {
    for (const bore of [0.02, 0.3])
      for (const stroke of [0.02, 0.3])
        for (const [intakeArea, exhaustArea] of [
          [0.00001, 0.00001],
          [0.02, 0.025],
        ])
          for (const holdRpm of [600, 19900]) {
            const core = new EngineCore(
              {
                ...roadEngine,
                bore,
                stroke,
                rodLength: Math.max(0.03, stroke * 0.75),
                compression: 20,
                intakeArea,
                exhaustArea,
                intakeRunnerLength: holdRpm > 1000 ? 0.05 : 1.5,
                inertia: 0.01,
                revLimit: 20000,
                mechanicalLimit: 25000,
              },
              normalConditions,
            )
            core.setControls({ ignition: true, throttle: 1, holdRpm })
            advance(core, 0.2)
            const t = core.telemetry()
            expect(Number.isFinite(t.torque)).toBe(true)
            expect(t.pressures.every((p) => Number.isFinite(p) && p > 0)).toBe(
              true,
            )
          }
  })
  it('does not hide invalid numerical states at supported geometry and atmosphere extremes', () => {
    for (const bore of [0.065, 0.105])
      for (const compression of [7, 13])
        for (const temperature of [263.15, 313.15]) {
          const core = new EngineCore(
            { ...roadEngine, bore, compression },
            { ...normalConditions, temperature, humidity: 1 },
          )
          core.setControls({ ignition: true, throttle: 1, holdRpm: 6000 })
          advance(core, 0.5)
          expect(
            core
              .telemetry()
              .pressures.every((p) => Number.isFinite(p) && p > 0),
          ).toBe(true)
        }
  })
})

// Plausibility bands for a naturally aspirated 2.0 L petrol engine, not a
// replica of any production engine. They catch gross calibration regressions.
describe('calibrated full-load trends', () => {
  it('gives the Road preset a mid-range torque peak and plausible output', () => {
    const points = curve()
    const peak = points.reduce((a, b) => (b.torque > a.torque ? b : a))
    const power = points.reduce((a, b) => (b.kw > a.kw ? b : a))
    const bmep = (peak.torque * 4 * Math.PI) / displacement(roadEngine)
    expect(peak.rpm).toBeGreaterThanOrEqual(3500)
    expect(peak.rpm).toBeLessThanOrEqual(5500)
    expect(bmep).toBeGreaterThan(1.0e6)
    expect(bmep).toBeLessThan(1.3e6)
    expect(power.rpm).toBeGreaterThanOrEqual(5500)
    expect(power.kw).toBeGreaterThan(90)
    expect(power.kw).toBeLessThan(130)
    // Torque rises out of low speed rather than falling from idle.
    expect(points[0].torque).toBeLessThan(peak.torque * 0.95)
    expect(points[0].torque).toBeGreaterThan(peak.torque * 0.75)
  })
  it('makes the Sport preset peak later than Road', () => {
    const peakRpm = (engine: typeof roadEngine) => {
      let best = { rpm: 0, torque: -Infinity }
      for (let rpm = 3000; rpm <= 6500; rpm += 500) {
        const torque = heldTorque(engine, rpm)
        if (torque > best.torque) best = { rpm, torque }
      }
      return best.rpm
    }
    expect(peakRpm(sportEngine)).toBeGreaterThan(peakRpm(roadEngine))
  })
  it('trades high-speed for mid-range torque with a longer intake runner', () => {
    const long = { ...roadEngine, intakeRunnerLength: 0.6 }
    const short = { ...roadEngine, intakeRunnerLength: 0.15 }
    expect(heldTorque(long, 3500)).toBeGreaterThan(heldTorque(short, 3500) + 10)
    expect(heldTorque(long, 6000)).toBeLessThan(heldTorque(short, 6000))
  })
})

/** Full-throttle hold long enough for a turbo to spool and settle. */
function boosted(engine: EngineDefinition, rpm: number, seconds = 3) {
  const core = new EngineCore(engine, normalConditions)
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm })
  advance(core, seconds)
  let sum = 0
  const steps = Math.round((6 * 120 * 48000) / rpm)
  for (let i = 0; i < steps; i++) {
    core.step()
    sum += core.absorbedTorque
  }
  return { torque: sum / steps, ...core.telemetry().induction, core }
}
const withInduction = (
  induction: EngineDefinition['induction'],
): EngineDefinition => ({ ...roadEngine, compression: 9, induction })
const turbo = inductionDefaults.turbo

describe('forced induction', () => {
  it('reads builds saved before forced induction as naturally aspirated', () => {
    const legacy: Record<string, unknown> = { ...roadEngine }
    delete legacy.induction
    expect(validateEngine(legacy).induction).toEqual({ kind: 'none' })
    const na = boosted(roadEngine, 3000, 0.5)
    expect(na.boost).toBe(0)
    expect(na.shaftRpm).toBe(0)
  })
  it('turbo boost is held near the wastegate target and raises torque', () => {
    const na = boosted(withInduction({ kind: 'none' }), 5000)
    const t = boosted(withInduction(turbo), 5000)
    expect(t.boost).toBeGreaterThan(turbo.boostTarget - 10000)
    expect(t.boost).toBeLessThan(turbo.boostTarget + 15000)
    expect(t.wastegate).toBeGreaterThan(0)
    expect(t.torque).toBeGreaterThan(na.torque * 1.4)
    expect(t.exhaustBackPressure).toBeGreaterThan(0)
    const higher = boosted(
      withInduction({ ...turbo, boostTarget: 120000 }),
      5000,
    )
    expect(higher.boost).toBeGreaterThan(t.boost + 20000)
    expect(higher.torque).toBeGreaterThan(t.torque)
  })
  it('turbo boost lags a throttle step while the shaft spools', () => {
    const core = new EngineCore(withInduction(turbo), normalConditions)
    core.setControls({ ignition: true, throttle: 0.1, holdRpm: 4500 })
    advance(core, 2)
    core.setControls({ throttle: 1 })
    advance(core, 0.2)
    const early = core.telemetry().induction
    advance(core, 2.8)
    const late = core.telemetry().induction
    expect(late.shaftRpm).toBeGreaterThan(early.shaftRpm * 1.2)
    expect(early.boost).toBeLessThan(late.boost * 0.6)
  })
  it('a lighter rotor spools sooner', () => {
    const at = (shaftInertia: number) =>
      boosted(withInduction({ ...turbo, shaftInertia }), 3500, 0.6).boost
    expect(at(0.00001)).toBeGreaterThan(at(0.0001))
  })
  it('centrifugal superchargers build boost with engine speed', () => {
    const sc = withInduction(inductionDefaults.centrifugal)
    const low = boosted(sc, 3000, 1.5)
    const high = boosted(sc, 6000, 1.5)
    expect(high.boost).toBeGreaterThan(low.boost * 2)
    expect(high.shaftRpm).toBeCloseTo(
      6000 * inductionDefaults.centrifugal.driveRatio,
      -2,
    )
  })
  it('roots blowers give early boost but cost crank power to drive', () => {
    const roots = inductionDefaults.roots
    const low = boosted(withInduction(roots), 2000, 1.5)
    const high = boosted(withInduction(roots), 6000, 1.5)
    expect(low.boost).toBeGreaterThan(high.boost * 0.4)
    expect(low.core.induction.crankTorque).toBeGreaterThan(0)
    const na = boosted(withInduction({ kind: 'none' }), 2000, 1.5)
    expect(low.torque).toBeGreaterThan(na.torque)
  })
  it('an intercooler cools the charge and makes more torque', () => {
    const at = (effectiveness: number) =>
      boosted(
        withInduction({
          ...turbo,
          intercooler: { effectiveness, pressureDrop: 0 },
        }),
        5000,
      )
    const hot = at(0)
    const cool = at(0.9)
    expect(cool.chargeTemperature).toBeLessThan(hot.chargeTemperature - 30)
    expect(cool.torque).toBeGreaterThan(hot.torque)
  })
  it('vents on lift-off with a blow-off valve and surges without one', () => {
    const lift = (blowOff: boolean) => {
      const core = new EngineCore(
        withInduction({ ...turbo, blowOff }),
        normalConditions,
      )
      core.setControls({ ignition: true, throttle: 1, holdRpm: 5000 })
      advance(core, 2.5)
      core.setControls({ throttle: 0 })
      let venting = false,
        surge = false
      for (let i = 0; i < 4800; i++) {
        core.step()
        venting ||= core.induction.venting
        surge ||= core.induction.surge
      }
      return { venting, surge }
    }
    expect(lift(true)).toEqual({ venting: true, surge: false })
    expect(lift(false).surge).toBe(true)
  })
  it('warns about compressor overspeed without changing the limit', () => {
    const t = boosted(withInduction({ ...turbo, maxShaftRpm: 60000 }), 5000)
    expect(t.core.telemetry().warning).toBe('Estimated compressor overspeed')
  })
  it('stays finite and bounded at induction extremes and is batching-independent', () => {
    const extremes: EngineDefinition['induction'][] = [
      {
        ...turbo,
        compressorDiameter: 0.2,
        turbineArea: 0.0002,
        shaftInertia: 0.000001,
        boostTarget: 400000,
      },
      { ...turbo, compressorDiameter: 0.02, turbineArea: 0.01 },
      {
        ...inductionDefaults.centrifugal,
        compressorDiameter: 0.2,
        driveRatio: 30,
      },
      { ...inductionDefaults.roots, rotorDisplacement: 0.02, driveRatio: 6 },
      {
        ...inductionDefaults.roots,
        rotorDisplacement: 0.0001,
        driveRatio: 0.5,
      },
    ]
    for (const induction of extremes)
      for (const holdRpm of [800, 7000]) {
        const core = new EngineCore(
          {
            ...withInduction(induction),
            revLimit: 8000,
            mechanicalLimit: 9000,
          },
          normalConditions,
        )
        core.setControls({ ignition: true, throttle: 1, holdRpm })
        for (let i = 0; i < 0.5 * 48000; i++) {
          const audio = core.step()
          expect(Math.abs(audio)).toBeLessThanOrEqual(0.65)
        }
        const t = core.telemetry()
        expect(Number.isFinite(t.torque)).toBe(true)
        expect(Number.isFinite(t.induction.boost)).toBe(true)
      }
    // A turbine far too small traps the exhaust and stops with a clear reason.
    const choked = new EngineCore(
      withInduction({ ...turbo, turbineArea: 0.00002, boostTarget: 400000 }),
      normalConditions,
    )
    choked.setControls({ ignition: true, throttle: 1, holdRpm: 7000 })
    expect(() => advance(choked, 1)).toThrow(/Turbine too small/)
    const a = new EngineCore(withInduction(turbo), normalConditions)
    const b = new EngineCore(withInduction(turbo), normalConditions)
    for (const core of [a, b])
      core.setControls({ ignition: true, throttle: 1, starter: true })
    a.advance(0.1)
    for (let i = 0; i < 10; i++) b.advance(0.01)
    expect(a.telemetry()).toEqual(b.telemetry())
  })
})

const fuelled = (
  fuelSystem: EngineDefinition['fuelSystem'],
  engine = roadEngine,
): EngineDefinition => ({ ...engine, fuelSystem })
const carb = fuelSystemDefaults.carburettor
/** Running warm idle, then a wide-open throttle step against a light load. */
function tipIn(engine: EngineDefinition, load = 40) {
  const core = new EngineCore(engine, normalConditions)
  core.setControls({ ignition: true, starter: true })
  advance(core, 0.5)
  core.setControls({ starter: false })
  advance(core, 2)
  core.setControls({ throttle: 1, load })
  let lean = 0
  let misfire = false
  for (let i = 0; i < 50; i++) {
    core.advance(0.01)
    const fuel = core.telemetry().fuel
    lean = Math.max(lean, fuel.lambda)
    misfire ||= fuel.misfire
  }
  return { lean, misfire, core }
}

describe('fuel systems', () => {
  it('reads builds saved before fuel systems as port injected', () => {
    const legacy: Record<string, unknown> = { ...roadEngine }
    delete legacy.fuelSystem
    expect(validateEngine(legacy).fuelSystem).toEqual(fuelSystemDefaults.port)
    const core = new EngineCore(roadEngine, normalConditions)
    core.setControls({ ignition: true, throttle: 1, holdRpm: 4000 })
    advance(core, 1.5)
    const fuel = core.telemetry().fuel
    expect(fuel.lambda).toBeCloseTo(roadEngine.lambda, 2)
    // Steady fuel flow matches the air drawn at the commanded mixture.
    expect(fuel.fuelFlow).toBeCloseTo(core.fuel.airFlow / 14.7, 3)
  })
  it('a carburettor richens in thin air while injection holds lambda', () => {
    const at = (
      fuelSystem: EngineDefinition['fuelSystem'],
      pressure: number,
    ) => {
      const core = new EngineCore(fuelled(fuelSystem), {
        ...normalConditions,
        pressure,
      })
      core.setControls({ ignition: true, throttle: 1, holdRpm: 4000 })
      advance(core, 1.5)
      return core.telemetry().fuel.lambda
    }
    expect(at(carb, 101325)).toBeCloseTo(1, 1)
    expect(at(carb, 80000)).toBeLessThan(0.92)
    expect(at(fuelSystemDefaults.port, 80000)).toBeCloseTo(1, 2)
  })
  it('a small venturi restricts top-end torque', () => {
    const small = fuelled({ ...carb, chokes: 1, chokeDiameter: 0.024 })
    expect(heldTorque(small, 6000)).toBeLessThan(
      heldTorque(fuelled(carb), 6000) * 0.9,
    )
    // At low speed the same venturi costs little.
    expect(heldTorque(small, 1500)).toBeGreaterThan(
      heldTorque(fuelled(carb), 1500) * 0.97,
    )
  })
  it('direct injection cools the charge in the cylinder for more torque', () => {
    const port = heldTorque(fuelled(fuelSystemDefaults.port), 4500)
    const direct = heldTorque(fuelled(fuelSystemDefaults.direct), 4500)
    expect(direct).toBeGreaterThan(port * 1.02)
    expect(direct).toBeLessThan(port * 1.08)
  })
  it('wall film leans the mixture on tip-in unless corrected', () => {
    const corrected = tipIn(fuelled(fuelSystemDefaults.port)).lean
    const raw = tipIn(
      fuelled({ ...fuelSystemDefaults.port, transientCorrection: false }),
    ).lean
    expect(raw).toBeGreaterThan(corrected + 0.08)
    expect(tipIn(fuelled(fuelSystemDefaults.direct)).lean).toBeLessThan(1.02)
  })
  it('an accelerator pump covers the carburettor tip-in stumble', () => {
    const pumped = tipIn(fuelled(carb))
    const dry = tipIn(fuelled({ ...carb, acceleratorPump: false }))
    expect(dry.lean).toBeGreaterThan(pumped.lean + 0.2)
    // Too lean to ignite: the classic flat spot.
    expect(dry.misfire).toBe(true)
    expect(pumped.misfire).toBe(false)
  })
  it('injection cuts fuel on the overrun; a carburettor keeps fuelling', () => {
    const overrun = (fuelSystem: EngineDefinition['fuelSystem']) => {
      const core = new EngineCore(fuelled(fuelSystem), normalConditions)
      core.setControls({ ignition: true, throttle: 0, holdRpm: 3000 })
      advance(core, 1)
      const t = core.telemetry()
      core.setControls({ holdRpm: 1200 })
      advance(core, 0.3)
      return { during: t, after: core.telemetry().fuel }
    }
    const port = overrun(fuelSystemDefaults.port)
    expect(port.during.fuel.overrunCut).toBe(true)
    expect(port.during.fuel.fuelFlow).toBeLessThan(1e-5)
    expect(port.after.overrunCut).toBe(false)
    const carburettor = overrun(carb)
    expect(carburettor.during.fuel.overrunCut).toBe(false)
    expect(carburettor.during.fuel.fuelFlow).toBeGreaterThan(1e-4)
  })
  it('a draw-through carburettor feeds a turbo', () => {
    const t = boosted(fuelled(carb, withInduction(turbo)), 5000)
    expect(t.boost).toBeGreaterThan(turbo.boostTarget - 10000)
    expect(t.core.fuel.inletLoss).toBeGreaterThan(0)
    expect(t.core.telemetry().fuel.lambda).toBeCloseTo(1, 1)
  })
})
