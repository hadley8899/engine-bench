import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { DynoTest } from './dyno'
import {
  combustionDefaults,
  defaultProcedure,
  normalConditions,
  roadEngine,
} from './schema'
import type { EngineDefinition } from './schema'

const engine: EngineDefinition = {
  ...roadEngine,
  combustion: { ...combustionDefaults, knockControl: false },
}
const C = 273.15

/** Held long enough for the crown and valve to settle; the deck lags. */
function soak(e: EngineDefinition, rpm: number, throttle = 1, seconds = 16) {
  const core = new EngineCore(e, normalConditions)
  core.sound = false
  // Temperatures only: knocking builds would otherwise crack a piston.
  core.setControls({ ignition: true, throttle, holdRpm: rpm, indestructible: true })
  for (let i = 0; i < 48000 * seconds; i++) core.step()
  const t = core.telemetry().temperatures
  return { egt: t.egt[0], crown: t.crown[0], valve: t.valve[0], head: t.head[0], all: t }
}

describe('component temperatures', () => {
  const full = soak(engine, 4500)
  it('sit in plausible ranges at full load', () => {
    expect(full.egt - C).toBeGreaterThan(800)
    expect(full.egt - C).toBeLessThan(1000)
    expect(full.crown - C).toBeGreaterThan(200)
    expect(full.crown - C).toBeLessThan(320)
    expect(full.valve - C).toBeGreaterThan(500)
    expect(full.valve).toBeLessThan(full.egt)
    expect(full.head).toBeLessThan(full.crown)
  })
  it('rise with load', () => {
    const part = soak(engine, 4500, 0.12)
    for (const k of ['egt', 'crown', 'valve', 'head'] as const)
      expect(full[k]).toBeGreaterThan(part[k] + 20)
  })
  it('enrichment cools; retarded timing moves heat from crown to exhaust', () => {
    // Schema 10's mixed rich products retain the measured protective trend
    // without the old homogeneous-equilibrium model's 120 K EGT drop.
    const rich = soak({ ...engine, lambda: 0.85 }, 4500)
    expect(full.egt - rich.egt).toBeGreaterThanOrEqual(30)
    expect(full.egt - rich.egt).toBeLessThanOrEqual(60)
    expect(rich.valve).toBeLessThan(full.valve - 10)
    const retarded = soak({ ...engine, ignitionAdvance: 8 }, 4500)
    expect(retarded.egt).toBeGreaterThan(full.egt + 20)
    expect(retarded.crown).toBeLessThan(full.crown)
  })
  it('knock heats the piston crown', () => {
    // The same cycle on two fuels: only the knock differs.
    const at = (fuel: 'ron91' | 'ron98') =>
      soak({ ...engine, combustion: { ...engine.combustion, fuel } }, 1200)
    const knocking = at('ron91')
    const clean = at('ron98')
    expect(knocking.crown).toBeGreaterThan(clean.crown + 5)
    expect(knocking.egt).toBeCloseTo(clean.egt, 6)
  })
  it('identical cylinders stay identical: no cosmetic spread', () => {
    const { egt, crown } = full.all
    for (const v of [...egt, ...crown].slice(1, 4))
      expect(Number.isFinite(v)).toBe(true)
    expect(Math.max(...egt) - Math.min(...egt)).toBeLessThan(1)
    expect(Math.max(...crown) - Math.min(...crown)).toBeLessThan(1)
  })
  it('survive a live update and appear in dyno samples', () => {
    const core = new EngineCore(engine, normalConditions)
    core.sound = false
    core.setControls({ ignition: true, throttle: 1, holdRpm: 4000 })
    for (let i = 0; i < 48000 * 3; i++) core.step()
    const next = EngineCore.continueFrom(core, { ...engine, ignitionAdvance: 18 }, normalConditions)
    expect(next.telemetry().temperatures).toEqual(core.telemetry().temperatures)
    const test = new DynoTest(engine, normalConditions, defaultProcedure)
    test.core.sound = false
    while (test.run.status === 'running') test.advance(4800)
    const egt = test.run.samples.map((s) => s.egt!)
    expect(egt.at(-1)!).toBeGreaterThan(egt[0])
  })
})
