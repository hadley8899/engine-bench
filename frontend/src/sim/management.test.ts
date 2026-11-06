import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { DynoTest } from './dyno'
import {
  combustionDefaults,
  defaultProcedure,
  flatMaps,
  fuelSystemDefaults,
  lookup,
  normalConditions,
  roadEngine,
  validateEngine,
} from './schema'
import type { EngineDefinition, Management } from './schema'
import { starterBuilds } from '../bench/builds'

const turbo = starterBuilds.find((b) => b.label === 'Turbo hot hatch')!.engine
const unprotected: EngineDefinition = {
  ...roadEngine,
  combustion: { ...combustionDefaults, knockControl: false },
}

function hold(engine: EngineDefinition, rpm: number, throttle = 1) {
  const core = new EngineCore(engine, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, throttle, holdRpm: rpm })
  for (let i = 0; i < 48000 * 1.5; i++) core.step()
  let torque = 0
  for (let i = 0; i < 9600; i++) {
    core.step()
    torque += core.torque / 9600
  }
  const t = core.telemetry()
  return { torque, t, knock: Math.max(...t.knock.index) }
}
/** A copy of the maps with every cell of one table set by a function. */
function withTable(
  m: Management,
  name: 'ignition' | 'lambda' | 'boost' | 'torque',
  cell: (row: number, rpm: number) => number,
): Management {
  const rows = name === 'boost' || name === 'torque' ? m.throttle : m.load
  return { ...m, [name]: rows.map((r) => m.rpm.map((c) => cell(r, c))) }
}

describe('map lookup', () => {
  it('interpolates bilinearly and holds flat beyond the axes', () => {
    const rows = [0, 10]
    const cols = [0, 100, 200]
    const table = [
      [0, 10, 20],
      [100, 110, 120],
    ]
    expect(lookup(rows, cols, table, 5, 50)).toBeCloseTo(55, 9)
    expect(lookup(rows, cols, table, -5, -50)).toBe(0)
    expect(lookup(rows, cols, table, 50, 500)).toBe(120)
    expect(lookup(rows, cols, table, 10, 150)).toBeCloseTo(115, 9)
  })
})

describe('engine-management maps', () => {
  it('flat maps reproduce the single values exactly', () => {
    const sweep = (engine: EngineDefinition) => {
      const t = new DynoTest(engine, normalConditions, defaultProcedure)
      t.core.sound = false
      while (t.run.status === 'running') t.advance(4800)
      return t.run.samples.map((s) => s.torque)
    }
    expect(sweep({ ...turbo, management: flatMaps(turbo) })).toEqual(
      sweep(turbo),
    )
  })
  it('timing follows the ignition map at the operating point', () => {
    const maps = withTable(flatMaps(unprotected), 'ignition', (_, rpm) =>
      rpm <= 2000 ? 8 : 24,
    )
    const engine = { ...unprotected, management: maps }
    const low = hold(engine, 2000)
    expect(low.t.ecu.advance).toBeCloseTo(8, 6)
    const between = hold(engine, 2250)
    expect(between.t.ecu.advance).toBeCloseTo(16, 1)
    // Less advance than the 20° single value: less knock when lugging.
    expect(low.knock).toBeLessThan(hold(unprotected, 2000).knock)
  })
  it('a spark after top dead centre runs, with less torque', () => {
    const late = withTable(flatMaps(unprotected), 'ignition', () => -8)
    const r = hold({ ...unprotected, management: late }, 3000)
    expect(r.t.ecu.advance).toBe(-8)
    expect(r.torque).toBeGreaterThan(50)
    expect(r.torque).toBeLessThan(hold(unprotected, 3000).torque - 15)
  })
  it('the λ map sets the mixture by load; enrichment cuts knock', () => {
    const maps = withTable(flatMaps(unprotected), 'lambda', (load) =>
      load >= 80000 ? 0.85 : 1,
    )
    const engine = { ...unprotected, management: maps }
    const full = hold(engine, 2000)
    expect(full.t.fuel.lambda).toBeCloseTo(0.85, 1)
    expect(full.knock).toBeLessThan(hold(unprotected, 2000).knock)
    const part = hold(engine, 2000, 0.12)
    expect(part.t.ecu.lambda).toBe(1)
    // A carburettor's jets cannot follow the map.
    const carb = hold(
      {
        ...engine,
        fuelSystem: {
          kind: 'carburettor',
          chokeDiameter: 0.032,
          chokes: 2,
          acceleratorPump: true,
        },
      },
      2000,
    )
    expect(carb.t.fuel.lambda).toBeGreaterThan(0.95)
  })
  it('the boost map sets the turbo target by throttle and RPM', () => {
    const maps = withTable(flatMaps(turbo), 'boost', (throttle) =>
      throttle >= 1 ? 40000 : 0,
    )
    const r = hold({ ...turbo, management: maps }, 4500)
    expect(r.t.ecu.boostTarget).toBe(40000)
    expect(r.t.induction.boost).toBeLessThan(55000)
    expect(hold(turbo, 4500).t.induction.boost).toBeGreaterThan(80000)
  })
  it('a torque request closes the electronic throttle independently of the pedal', () => {
    const stable = {
      ...turbo,
      induction: {
        ...turbo.induction,
        compressorMap: 'legacy' as const,
        turbineMap: 'legacy' as const,
      },
    }
    const maps = withTable(flatMaps(stable), 'torque', (pedal) => 180 * pedal)
    const limited = hold({ ...stable, management: maps }, 4500)
    const open = hold(stable, 4500)
    expect(limited.t.ecu.throttle).toBe(1)
    expect(limited.t.ecu.throttlePlate).toBeLessThan(0.95)
    expect(limited.torque).toBeGreaterThan(165)
    expect(limited.torque).toBeLessThan(195)
    expect(open.torque).toBeGreaterThan(limited.torque + 40)
  })
  it('a positive boost-tune offset explicitly bypasses the production torque request', () => {
    const stable = {
      ...turbo,
      induction: {
        ...turbo.induction,
        compressorMap: 'legacy' as const,
        turbineMap: 'legacy' as const,
      },
    }
    const maps = withTable(flatMaps(stable), 'torque', (pedal) => 180 * pedal)
    const engine = { ...stable, management: maps }
    const core = new EngineCore(engine, normalConditions)
    core.sound = false
    core.setControls({
      ignition: true,
      throttle: 1,
      holdRpm: 4500,
      boostOffset: 10000,
    })
    for (let i = 0; i < 48000 * 1.7; i++) core.step()
    expect(core.telemetry().ecu.throttlePlate).toBe(1)
    expect(core.torque).toBeGreaterThan(220)
  })
  it('rejects tables that do not match their axes', () => {
    const m = flatMaps(roadEngine)
    expect(() =>
      validateEngine({ ...roadEngine, management: { ...m, rpm: m.rpm.slice(1) } }),
    ).toThrow()
    expect(() =>
      validateEngine({
        ...roadEngine,
        management: { ...m, load: [...m.load].reverse() },
      }),
    ).toThrow()
  })
  it('builds saved before 1.7.0 have no maps and unlimited fuel', () => {
    const legacy: Record<string, unknown> = { ...roadEngine }
    delete legacy.management
    delete legacy.fuelSupply
    const e = validateEngine(legacy)
    expect(e.management).toBeNull()
    expect(e.fuelSupply).toBeNull()
    expect(hold(e, 3000).t.fuel.injectorDuty).toBeNull()
  })
})

describe('fuel supply', () => {
  it('small injectors run out of duty and lean the mixture', () => {
    const small = {
      ...unprotected,
      fuelSupply: { injectorFlow: 120, maxDuty: 0.85, pumpFlow: 200 },
    }
    const r = hold(small, 5000)
    expect(r.t.fuel.fuelLimited).toBe(true)
    expect(r.t.fuel.injectorDuty).toBeCloseTo(0.85, 2)
    expect(r.t.fuel.lambda).toBeGreaterThan(1.2)
    const fine = hold(unprotected, 5000)
    expect(fine.t.fuel.fuelLimited).toBe(false)
    expect(r.knock).toBeGreaterThan(fine.knock)
  })
  it('a weak pump limits fuel too, and E85 needs more of it', () => {
    const pump = {
      ...unprotected,
      fuelSupply: { injectorFlow: 600, maxDuty: 0.85, pumpFlow: 25 },
    }
    expect(hold(pump, 3000).t.fuel.fuelLimited).toBe(false)
    const e85 = hold(
      { ...pump, combustion: { ...pump.combustion, fuel: 'e85' } },
      3000,
    )
    expect(e85.t.fuel.fuelLimited).toBe(true)
    expect(e85.t.fuel.pumpUse).toBeCloseTo(1, 2)
  })
  it('a carburettor is limited by its pump alone', () => {
    const carb = hold(
      {
        ...unprotected,
        fuelSystem: fuelSystemDefaults.carburettor,
        fuelSupply: { injectorFlow: 50, maxDuty: 0.5, pumpFlow: 200 },
      },
      4000,
    )
    expect(carb.t.fuel.injectorDuty).toBeNull()
    expect(carb.t.fuel.fuelLimited).toBe(false)
  })
})
