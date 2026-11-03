import { describe, expect, it } from 'vitest'
import { Acoustics, AcousticInput, LISTENERS } from './acoustics'
import type { Listener } from './acoustics'
import { EngineCore } from './core'
import type { Controls } from './core'
import {
  engineSchema,
  exhaustDefaults,
  inductionDefaults,
  normalConditions,
  roadEngine,
} from './schema'
import type { EngineDefinition, Exhaust } from './schema'

const withExhaust = (exhaust: Partial<Exhaust>): EngineDefinition => ({
  ...roadEngine,
  exhaust: { ...exhaustDefaults, ...exhaust },
})
const straight = withExhaust({ silencer: 'straight', catalyst: false })

/** Runs a warm engine, then returns its audio for the given controls. */
function listen(
  engine: EngineDefinition,
  controls: Partial<Controls>,
  seconds = 1,
  listener: Listener = 'tailpipe',
) {
  const core = new EngineCore(engine, normalConditions)
  core.setListener(listener)
  core.setControls({ ignition: true, starter: true })
  for (let i = 0; i < 48000; i++) core.step()
  core.setControls({ starter: false, ...controls })
  for (let i = 0; i < 48000; i++) core.step()
  const audio = new Float64Array(seconds * 48000)
  for (let i = 0; i < audio.length; i++) audio[i] = core.step()
  return { core, audio }
}
const rms = (x: ArrayLike<number>) => {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += x[i] ** 2
  return Math.sqrt(sum / x.length)
}
/** Share of signal power above roughly 2 kHz, from first differences. */
const brightness = (x: ArrayLike<number>) => {
  let sum = 0
  let diff = 0
  for (let i = 1; i < x.length; i++) {
    sum += x[i] ** 2
    diff += (x[i] - x[i - 1]) ** 2
  }
  return diff / sum
}
/** Frequency of the strongest response between 40 and 450 Hz, by direct DFT. */
function peakHz(x: Float64Array) {
  let best = 0
  let peak = 0
  for (let hz = 40; hz <= 450; hz += 2) {
    let re = 0
    let im = 0
    const w = (2 * Math.PI * hz) / 48000
    for (let i = 0; i < x.length; i++) {
      re += x[i] * Math.cos(w * i)
      im -= x[i] * Math.sin(w * i)
    }
    const m = Math.hypot(re, im)
    if (m > best) {
      best = m
      peak = hz
    }
  }
  return peak
}

describe('engine sound', () => {
  it('reads builds saved before exhaust systems with the road exhaust', () => {
    const { exhaust, ...old } = roadEngine
    void exhaust
    expect(engineSchema.parse(old).exhaust).toEqual(exhaustDefaults)
  })
  it('never changes the physics: exhaust, listener and muting', () => {
    const run = (engine: EngineDefinition, listener: Listener, sound = true) => {
      const core = new EngineCore(engine, normalConditions)
      core.sound = sound
      core.setListener(listener)
      core.setControls({ ignition: true, throttle: 1, holdRpm: 4500 })
      for (let i = 0; i < 24000; i++) core.step()
      const t = core.telemetry()
      return [t.torque, t.absorbedTorque, ...t.pressures, t.fuel.lambda]
    }
    const reference = run(roadEngine, 'tailpipe')
    expect(run(straight, 'cell')).toEqual(reference)
    expect(run(withExhaust({ collector: '4-2-1' }), 'bay')).toEqual(reference)
    expect(run(roadEngine, 'tailpipe', false)).toEqual(reference)
  })
  it('stays finite and bounded for every exhaust, listener and induction', () => {
    const engines = [
      straight,
      withExhaust({ headerLength: 1.5, tailpipeLength: 4, collector: '4-2-1' }),
      withExhaust({ headerLength: 0.2, tailpipeLength: 0.3, silencer: 'absorptive' }),
      {
        ...straight,
        compression: 9,
        induction: { ...inductionDefaults.turbo, blowOff: false },
      },
      { ...roadEngine, induction: inductionDefaults.roots },
    ]
    for (const engine of engines)
      for (const listener of LISTENERS) {
        const { audio } = listen(
          { ...engine, revLimit: 5000 },
          { throttle: 1 },
          0.5,
          listener,
        )
        for (const sample of audio) {
          expect(Number.isFinite(sample)).toBe(true)
          expect(Math.abs(sample)).toBeLessThanOrEqual(0.65)
        }
        expect(rms(audio)).toBeGreaterThan(0.005)
      }
    // Fifteen engine runs: longer than the default limit under a parallel run.
  }, 40000)
  it('makes a straight pipe louder and brighter than a silenced exhaust', () => {
    const quiet = listen(roadEngine, { throttle: 1, holdRpm: 4000 }).audio
    const loud = listen(straight, { throttle: 1, holdRpm: 4000 }).audio
    // About +2.8 dB since 1.10.0's dissociation made λ 1 exhaust pulses hotter.
    expect(rms(loud)).toBeGreaterThan(rms(quiet) * 1.35)
    expect(brightness(loud)).toBeGreaterThan(brightness(quiet) * 1.5)
  })
  it('tunes pipe resonances by length: longer headers sound lower', () => {
    const response = (headerLength: number) => {
      const engine = withExhaust({
        headerLength,
        silencer: 'straight',
        tailpipeLength: 0.3,
      })
      const acoustics = new Acoustics(engine, 293)
      const input = new AcousticInput()
      const out = new Float64Array(4800)
      for (let i = 0; i < out.length; i++) {
        input.exhaust = i === 0 ? 1 : 0
        out[i] = acoustics.process(input)
      }
      return peakHz(out)
    }
    expect(response(1.2)).toBeLessThan(response(0.6) * 0.75)
  })
  it('afterfires on unburned fuel from a spark-cut limiter, not when cruising', () => {
    const pops = (engine: EngineDefinition, controls: Partial<Controls>) => {
      // Warm the exhaust under load, then apply the controls under test.
      const { core } = listen(engine, { throttle: 0.8, holdRpm: 3500 }, 0)
      for (let i = 0; i < 48000 * 4; i++) core.step()
      core.setControls(controls)
      // Skip the transition: a closing throttle briefly runs rich.
      for (let i = 0; i < 48000; i++) core.step()
      const before = core.acoustics.afterfires
      for (let i = 0; i < 48000 * 2; i++) core.step()
      const count = core.acoustics.afterfires - before
      return { count, wall: core.telemetry().exhaustWall }
    }
    const free = { throttle: 1, holdRpm: null }
    const spark = pops({ ...roadEngine, revLimit: 4500, limiterCut: 'spark' }, free)
    const fuel = pops({ ...roadEngine, revLimit: 4500 }, free)
    expect(spark.wall).toBeGreaterThan(600)
    expect(spark.count).toBeGreaterThan(5)
    // Cutting fuel leaves only the intake film to escape unburned.
    expect(fuel.count).toBeLessThan(spark.count / 2)
    expect(pops(roadEngine, { throttle: 0.3, holdRpm: 3000 }).count).toBe(0)
  })
  it('a blow-off valve vents for tenths of a second and falls in pitch', () => {
    const turbo = {
      ...roadEngine,
      compression: 9,
      induction: inductionDefaults.turbo,
    }
    const { core } = listen(turbo, { throttle: 1, holdRpm: 5000 }, 0)
    for (let i = 0; i < 48000 * 2; i++) core.step()
    core.setControls({ throttle: 0, holdRpm: null })
    for (let i = 0; i < 9600; i++) core.step()
    expect(core.telemetry().induction.venting).toBe(true)
    for (let i = 0; i < 9600; i++) core.step()
    // Still dumping 0.4 s after the lift, as a real valve does.
    expect(core.telemetry().induction.venting).toBe(true)
    // The jet alone, as the pressure behind it falls: quieter and darker.
    const acoustics = new Acoustics(turbo, 293)
    const input = new AcousticInput()
    input.induction = 'turbo'
    input.venting = true
    const jet = (dump: number) => {
      input.dump = dump
      const out = new Float64Array(9600)
      for (let i = 0; i < out.length; i++) out[i] = acoustics.process(input)
      return out
    }
    jet(1)
    const high = jet(1)
    const low = jet(0.15)
    expect(rms(low)).toBeLessThan(rms(high))
    expect(brightness(low)).toBeLessThan(brightness(high))
  })
  it('keeps sound state across a live update and applies the new exhaust', () => {
    const a = listen(roadEngine, { throttle: 0.3 }, 0).core
    const b = EngineCore.continueFrom(a, roadEngine, normalConditions)
    for (let i = 0; i < 4800; i++) expect(b.step()).toBe(a.step())
    const c = EngineCore.continueFrom(a, straight, normalConditions)
    expect(c.acoustics.wallTemperature).toBe(a.acoustics.wallTemperature)
    const louder = new Float64Array(24000)
    const quieter = new Float64Array(24000)
    for (let i = 0; i < louder.length; i++) {
      louder[i] = c.step()
      quieter[i] = a.step()
    }
    expect(rms(louder)).toBeGreaterThan(rms(quieter))
  })
})
