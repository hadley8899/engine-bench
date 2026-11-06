import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { DynoTest } from './dyno'
import { partsInertia, Stress } from './parts'
import { PushTest } from './push'
import {
  engineSchema,
  normalConditions,
  roadEngine,
  stockParts,
} from './schema'
import type { EngineDefinition } from './schema'
import { starterBuilds } from '../bench/builds'

const hatch = starterBuilds.find((b) => b.engine.induction.kind === 'turbo')!
  .engine as EngineDefinition & {
  induction: { kind: 'turbo'; boostTarget: number }
}
/** The hot hatch at 1.6 bar with knock control off knocks hard. */
const overboosted: EngineDefinition = {
  ...hatch,
  induction: { ...hatch.induction, boostTarget: 160000 },
  combustion: { ...hatch.combustion, knockControl: false },
}
function hold(
  e: EngineDefinition,
  rpm: number,
  seconds: number,
  indestructible = false,
) {
  const core = new EngineCore(e, normalConditions)
  core.sound = false
  core.setControls({ ignition: true, throttle: 1, holdRpm: rpm, indestructible })
  let worst = 0
  for (let i = 0; i < 48000 * seconds && !core.stress.failure; i++) {
    core.step()
    if (i > 48000 * 3 && i % 480 === 0)
      worst = Math.max(worst, core.stress.worst())
  }
  return { core, worst, failure: core.stress.failure }
}
const limits = (e: EngineDefinition) =>
  Object.fromEntries(
    new Stress(e).telemetry(false).limits.map((l) => [l.key, l.limit]),
  )

describe('parts, stress and failures', () => {
  it('reads builds saved before 1.11.0 with stock parts that add nothing', () => {
    const { parts: _, ...old } = roadEngine
    void _
    expect(engineSchema.parse(old).parts).toEqual(stockParts)
    expect(partsInertia(roadEngine)).toBe(0)
  })
  it('heavier parts add inertia and stiffer springs add friction', () => {
    const heavy = { ...roadEngine, parts: { ...stockParts, rods: 'hBeam' as const } }
    expect(partsInertia(heavy)).toBeGreaterThan(0)
    const at = (e: EngineDefinition) => {
      const core = new EngineCore(e, normalConditions)
      core.setControls({ ignition: false, holdRpm: 3000 })
      for (let i = 0; i < 48000; i++) core.step()
      return core.absorbedTorque
    }
    const race = { ...roadEngine, parts: { ...stockParts, valveSprings: 'race' as const } }
    // 6 kPa more friction mean effective pressure is about 1 Nm on 2 L.
    expect(at(race)).toBeLessThan(at(roadEngine) - 0.8)
  })
  it('a stronger part raises only its own limits', () => {
    const stock = limits(roadEngine)
    const forged = limits({
      ...roadEngine,
      parts: { ...stockParts, pistons: 'forged' },
    })
    for (const key of Object.keys(stock))
      if (key === 'crown' || key === 'knock')
        expect(forged[key]).toBeGreaterThan(stock[key])
      else expect(forged[key]).toBe(stock[key])
    const studs = limits({
      ...roadEngine,
      parts: { ...stockParts, headFasteners: 'studs' },
    })
    expect(studs.headGasket).toBeCloseTo(stock.headGasket * 1.2, 6)
    expect(studs.rodCompression).toBe(stock.rodCompression)
  })
  it('stock starting builds stay inside their limits at full load', () => {
    const top = hold(hatch, hatch.revLimit - 200, 8)
    expect(top.failure).toBeNull()
    expect(top.worst).toBeGreaterThan(0.5)
    expect(top.worst).toBeLessThan(1)
  }, 30000)
  it('sustained knock cracks a cast piston, repeatably', () => {
    const a = hold(overboosted, 4000, 6)
    const b = hold(overboosted, 4000, 6)
    expect(a.failure?.key).toBe('knock')
    expect(a.failure?.title).toBe('Cracked piston')
    // It says how to avoid it on this build.
    expect(a.failure?.prevent).toMatch(/higher-octane fuel/)
    expect(a.failure?.prevent).toMatch(/forged pistons/)
    expect(b.failure).toEqual(a.failure)
    // The failed engine stops: no more combustion and no starter.
    a.core.setControls({ holdRpm: null, starter: true })
    for (let i = 0; i < 48000 * 6; i++) a.core.step()
    expect(a.core.telemetry().rpm).toBeLessThan(50)
  }, 30000)
  it('forged pistons survive the same knock longer; indestructible never fails', () => {
    const cast = hold(overboosted, 4000, 6)
    const forged = hold(
      { ...overboosted, parts: { ...stockParts, pistons: 'forged' } },
      4000,
      6,
    )
    expect(cast.failure?.key).toBe('knock')
    expect(forged.failure?.time ?? Infinity).toBeGreaterThan(
      cast.failure!.time + 0.2,
    )
    const tough = hold(overboosted, 4000, 6, true)
    expect(tough.failure).toBeNull()
    expect(tough.core.telemetry().stress.limits.find((l) => l.key === 'knock')!.exposure).toBe(1)
  }, 30000)
  it('over-revving floats stock valves into the pistons', () => {
    const revved = { ...roadEngine, revLimit: 9000 }
    const stock = hold(revved, 8300, 8)
    expect(stock.failure?.key).toBe('valveFloat')
    // Uprated springs move the weak point to the stock rods.
    const springs = hold(
      { ...revved, parts: { ...stockParts, valveSprings: 'uprated' } },
      8600,
      8,
    )
    expect(springs.failure?.key).toBe('rodTension')
  }, 30000)
  it('a dyno run records the failure as its abort reason', () => {
    const dyno = new DynoTest(overboosted, normalConditions, {
      kind: 'sweep',
      startRpm: 3500,
      endRpm: 4500,
      rate: 150,
      stepRpm: 500,
      holdSeconds: 0.65,
    })
    dyno.core.sound = false
    while (dyno.run.status === 'running') dyno.advance(4800)
    expect(dyno.run.status).toBe('aborted')
    expect(dyno.run.reason).toMatch(/^Cracked piston/)
    expect(dyno.run.samples.at(-1)!.stress).toBeGreaterThan(1)
  }, 30000)
  it('push it advances timing until the first knock', () => {
    const push = new PushTest(
      { ...roadEngine, combustion: { ...roadEngine.combustion, fuel: 'ron91' } },
      normalConditions,
      { rpm: 2500, variable: 'timing', step: 3, hold: 1, stopAt: 'knock' },
    )
    while (push.result.status === 'running') push.advance(4800)
    const steps = push.result.steps
    expect(push.result.status).toBe('complete')
    expect(push.result.reason).toMatch(/^Knock at \+\d/)
    expect(steps.length).toBeGreaterThan(1)
    expect(steps.at(-1)!.knock).toBeGreaterThan(0.03)
    expect(steps.slice(0, -1).every((s) => s.knock <= 0.03)).toBe(true)
    expect(steps[1].setting).toBeCloseTo(steps[0].setting + 3, 6)
  }, 60000)
  it('push it raises boost until something fails', () => {
    const push = new PushTest(
      { ...hatch, combustion: { ...hatch.combustion, knockControl: false } },
      normalConditions,
      { rpm: 4000, variable: 'boost', step: 25000, hold: 1, stopAt: 'failure' },
    )
    while (push.result.status === 'running') push.advance(4800)
    expect(push.result.failure).not.toBeNull()
    const steps = push.result.steps
    expect(steps.length).toBeGreaterThan(1)
    expect(steps[1].boost).toBeGreaterThan(steps[0].boost)
  }, 60000)
})
