import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { DynoTest } from './dyno'
import {
  combustionDefaults,
  defaultProcedure,
  legacyCombustion,
  normalConditions,
  roadEngine,
  validateEngine,
} from './schema'
import type { Conditions, EngineDefinition, FuelGrade } from './schema'
import { starterBuilds } from '../bench/builds'
import { FUELS } from './fuel'
import { BurnedGas, richProducts } from './chemistry'

const unprotected: EngineDefinition = {
  ...roadEngine,
  ignitionAdvance: 20,
  combustion: { ...combustionDefaults, knockControl: false },
}
const protectedKnocking: EngineDefinition = {
  ...roadEngine,
  ignitionAdvance: 20,
}
const turbo = starterBuilds.find((b) => b.label === 'Turbo hot hatch')!.engine

/** Wide-open throttle held at one speed: mean torque and last-cycle knock. */
function hold(
  engine: EngineDefinition,
  rpm: number,
  conditions: Conditions = normalConditions,
  seconds = 1.2,
  advanceOffset = 0,
) {
  const core = new EngineCore(engine, conditions)
  core.sound = false
  core.setControls({
    ignition: true,
    throttle: 1,
    holdRpm: rpm,
    indestructible: true,
    advanceOffset,
  })
  for (let i = 0; i < 48000 * seconds; i++) core.step()
  let torque = 0
  const n = 48000 * 0.2
  for (let i = 0; i < n; i++) {
    core.step()
    torque += core.torque / n
  }
  const t = core.telemetry()
  return {
    torque,
    knock: Math.max(...t.knock.index),
    intensity: Math.max(...t.knock.intensity),
    retard: core.meanRetard(),
    burn: t.knock.burn[0],
    lambda: t.fuel.lambda,
    core,
  }
}

describe('knock', () => {
  it('makes the RON 95 Road engine knock when advanced far beyond MBT', () => {
    const engine = {
      ...roadEngine,
      combustion: { ...roadEngine.combustion, knockControl: false },
    }
    const normal = hold(engine, 4000)
    const advanced = hold(
      engine,
      4000,
      normalConditions,
      1.2,
      50 - roadEngine.ignitionAdvance,
    )
    expect(normal.knock).toBeLessThan(1)
    expect(advanced.knock).toBeGreaterThan(1)
    expect(advanced.intensity).toBeGreaterThan(0)
  })
  it('rises with spark advance', () => {
    const k = [12, 18, 24].map(
      (a) => hold({ ...unprotected, ignitionAdvance: a }, 2000).knock,
    )
    expect(k[1]).toBeGreaterThan(k[0] * 1.1)
    expect(k[2]).toBeGreaterThan(k[1] * 1.1)
  })
  it('rises with boost', () => {
    const engine = (boostTarget: number) => ({
      ...turbo,
      combustion: { ...turbo.combustion, knockControl: false },
      induction: { ...turbo.induction, boostTarget } as typeof turbo.induction,
    })
    const low = hold(engine(40000), 4500).knock
    const high = hold(engine(100000), 4500).knock
    expect(high).toBeGreaterThan(low * 1.2)
  })
  it('falls with octane, and E85 resists it best', () => {
    const k = (['ron91', 'ron95', 'ron98', 'e85'] as FuelGrade[]).map(
      (fuel) =>
        hold(
          { ...unprotected, combustion: { ...unprotected.combustion, fuel } },
          2000,
        ).knock,
    )
    for (let i = 1; i < k.length; i++) expect(k[i]).toBeLessThan(k[i - 1])
  })
  it('rises with hotter intake air', () => {
    const at = (temperature: number) =>
      hold(unprotected, 2000, { ...normalConditions, temperature }).knock
    // Hot air is thinner as well as hotter, so the net effect is modest.
    expect(at(313.15)).toBeGreaterThan(at(293.15))
    expect(at(313.15)).toBeGreaterThan(at(263.15) * 1.05)
  })
  it('rises lean and falls with enrichment', () => {
    const k = [0.85, 1, 1.1].map(
      (lambda) => hold({ ...unprotected, lambda }, 2000).knock,
    )
    expect(k[0]).toBeLessThan(k[1])
    expect(k[2]).toBeGreaterThan(k[1])
  })
  it('lugging at full load knocks; the same timing at speed does not', () => {
    const low = hold(unprotected, 1200)
    expect(low.knock).toBeGreaterThan(1)
    expect(low.intensity).toBeGreaterThan(0)
    const high = hold(unprotected, 4500)
    expect(high.knock).toBeLessThan(1)
    expect(high.intensity).toBe(0)
  })
  it('ECU knock control retards the knocking engine and recovers', () => {
    const off = hold(unprotected, 1200)
    expect(off.retard).toBe(0)
    const on = hold(protectedKnocking, 1200, normalConditions, 3)
    expect(on.retard).toBeGreaterThan(2)
    expect(on.intensity).toBeLessThan(off.intensity)
    // Once the knock stops, the timing creeps back.
    on.core.setControls({ holdRpm: 4000 })
    const before = on.core.meanRetard()
    for (let i = 0; i < 48000 * 2; i++) on.core.step()
    expect(on.core.meanRetard()).toBeLessThan(before - 2)
  })
  it('reports nothing for an unlit charge', () => {
    const core = new EngineCore(unprotected, normalConditions)
    core.sound = false
    core.setControls({ ignition: false, throttle: 1, holdRpm: 1200 })
    for (let i = 0; i < 48000; i++) core.step()
    expect(core.telemetry().knock.index).toEqual([0, 0, 0, 0])
  })
  it('dyno samples record knock and retard', () => {
    const test = new DynoTest(protectedKnocking, normalConditions, {
      ...defaultProcedure,
      startRpm: 1200,
      endRpm: 3000,
    })
    test.core.sound = false
    while (test.run.status === 'running') test.advance(4800)
    const samples = test.run.samples
    expect(samples[0].knock).toBeGreaterThan(1)
    expect(samples.at(-1)!.knock).toBeLessThan(1)
    expect(Math.max(...samples.map((s) => s.retard!))).toBeGreaterThan(0)
  })
})

describe('combustion', () => {
  it('torque peaks near MBT, which advances with speed', () => {
    const mbt = (rpm: number) => {
      const advances = [6, 10, 14, 18, 22, 26, 30, 34]
      const torque = advances.map(
        (a) => hold({ ...unprotected, ignitionAdvance: a }, rpm, normalConditions, 0.8).torque,
      )
      const best = torque.indexOf(Math.max(...torque))
      // An interior optimum: too little and too much advance both lose torque.
      expect(best).toBeGreaterThan(0)
      expect(best).toBeLessThan(advances.length - 1)
      return advances[best]
    }
    expect(mbt(6000)).toBeGreaterThan(mbt(1500))
  })
  it('a predictive burn lengthens with speed, lean mixture and part load', () => {
    const at = (rpm: number, lambda = 1) =>
      hold({ ...unprotected, lambda }, rpm).burn
    expect(at(6000)).toBeGreaterThan(at(3000))
    expect(at(3000)).toBeGreaterThan(at(1500))
    expect(at(3000, 1.15)).toBeGreaterThan(at(3000))
    // At 3,000 RPM and full load it is close to the quoted reference.
    expect(at(3000)).toBeCloseTo(roadEngine.burnDuration, -1)
    const core = new EngineCore(unprotected, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, throttle: 0.15, holdRpm: 3000 })
    for (let i = 0; i < 48000; i++) core.step()
    expect(core.telemetry().knock.burn[0]).toBeGreaterThan(at(3000) + 3)
  })
  it('a fixed burn keeps the configured duration', () => {
    const fixed = hold(
      { ...unprotected, combustion: legacyCombustion },
      6000,
    )
    expect(fixed.burn).toBe(roadEngine.burnDuration)
  })
  it('builds saved before 1.6.0 keep a fixed burn, RON 95 and no knock control', () => {
    const legacy: Record<string, unknown> = { ...roadEngine }
    delete legacy.combustion
    expect(validateEngine(legacy).combustion).toEqual(legacyCombustion)
  })
  it('keeps schema-9 builds on the legacy combustion calibration', () => {
    const old: Record<string, unknown> = {
      ...roadEngine,
      schemaVersion: 9,
      combustion: { ...roadEngine.combustion },
    }
    delete (old.combustion as Record<string, unknown>).calibration
    expect(validateEngine(old).combustion.calibration).toBe('legacy')
    expect(combustionDefaults.calibration).toBe('current')
  })
  it('E85 meters to its own stoichiometric ratio and needs more fuel', () => {
    const e85 = hold(
      { ...unprotected, combustion: { ...unprotected.combustion, fuel: 'e85' } },
      3000,
    )
    const petrol = hold(unprotected, 3000)
    expect(e85.lambda).toBeCloseTo(petrol.lambda, 1)
    const flow = (r: typeof e85) => r.core.telemetry().fuel.fuelFlow
    expect(flow(e85) / flow(petrol)).toBeGreaterThan(
      (0.9 * FUELS.ron95.stoichiometric) / FUELS.e85.stoichiometric,
    )
  })
})

describe('rich-burn products', () => {
  it('are stoichiometric at λ ≥ 1', () => {
    for (const phi of [0.6, 1])
      expect(richProducts(FUELS.ron95, phi)).toEqual({
        heat: 1,
        moles: 1,
        capacity: 1,
      })
  })
  it('release less heat into more gas as the mixture richens', () => {
    let previous = richProducts(FUELS.ron95, 1)
    for (const lambda of [0.95, 0.85, 0.7, 0.55]) {
      const p = richProducts(FUELS.ron95, 1 / lambda)
      expect(p.heat).toBeLessThan(previous.heat)
      expect(p.moles).toBeGreaterThan(previous.moles)
      expect(p.capacity).toBeGreaterThan(previous.capacity)
      previous = p
    }
  })
  it("match Heywood's rich combustion efficiency of about 0.8 at φ 1.18", () => {
    // Heat per unit of air / fuel supplied per unit of air.
    const phi = 1 / 0.85
    expect(richProducts(FUELS.ron95, phi).heat / phi).toBeCloseTo(0.8, 1)
    expect(richProducts(FUELS.e85, phi).heat / phi).toBeCloseTo(0.8, 1)
    expect(richProducts(FUELS.ron95, phi, 'legacy').heat).toBeCloseTo(
      0.9401,
      3,
    )
  })
})

describe('burned-gas dissociation', () => {
  const held = (phi: number, temperature: number, bar = 60) => {
    const gas = new BurnedGas()
    gas.set(FUELS.ron95, phi)
    gas.at(temperature, bar * 1e5)
    return gas
  }
  it('holds back heat in hot stoichiometric gas and returns it as it cools', () => {
    expect(held(1, 1800).held).toBeLessThan(0.005)
    expect(held(1, 2600).held).toBeGreaterThan(0.03)
    expect(held(1, 3000).held).toBeGreaterThan(0.12)
    expect(held(1, 3000).moles).toBeGreaterThan(1.015)
    // Pressure suppresses dissociation.
    expect(held(1, 3000, 80).held).toBeLessThan(held(1, 3000, 20).held)
  })
  it('dissociates less in lean gas, and a rich burn adds little beyond its frozen CO and H2', () => {
    expect(held(0.87, 3000).held).toBeLessThan(held(1, 3000).held)
    const rich = 1 / 0.85
    const frozen = 1 - richProducts(FUELS.ron95, rich).heat
    expect(held(rich, 1740).held).toBeCloseTo(frozen, 3)
    expect(held(rich, 3000).held - frozen).toBeLessThan(held(1, 3000).held / 2)
  })
  it('puts best power at λ 0.86–0.9', () => {
    const torque = (lambda: number) =>
      hold({ ...unprotected, lambda }, 4500, normalConditions, 2).torque
    const stoichiometric = torque(1)
    const samples = [0.84, 0.86, 0.88, 0.9, 0.92].map((lambda) => ({
      lambda,
      torque: torque(lambda),
    }))
    const best = samples.reduce((a, b) => (b.torque > a.torque ? b : a))
    expect(best.lambda).toBeGreaterThanOrEqual(0.86)
    expect(best.lambda).toBeLessThanOrEqual(0.9)
    expect(best.torque).toBeGreaterThan(stoichiometric)
    expect(torque(1.1)).toBeLessThan(stoichiometric * 0.95)
  }, 40000)
})
