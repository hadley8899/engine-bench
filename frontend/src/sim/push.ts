import { EngineCore } from './core'
import { powerKw } from './physics'
import type { Conditions, EngineDefinition, RadiansPerSecond } from './schema'
import type { Failure, LimitKey } from './parts'

/** A charge unburned at onset above this counts as knock (as the ECU senses it). */
const KNOCK_FOUND = 0.03
/** Seconds of each step that are measured, at its end. */
const MEASURE = 0.5
const MAX_STEPS = 40
const MAX_ADVANCE = 50
const MAX_BOOST = 400000

export type PushSettings = {
  rpm: number
  /** Raise spark advance (degrees) or turbo boost target (Pa) each step. */
  variable: 'timing' | 'boost'
  step: number
  /** Seconds at each step. */
  hold: number
  /** Stop at the first knock, or carry on until something fails. */
  stopAt: 'knock' | 'failure'
}
export const defaultPush: PushSettings = {
  rpm: 4000,
  variable: 'timing',
  step: 2,
  hold: 1.5,
  stopAt: 'knock',
}
export type PushStep = {
  /** Offset from the build's own setting: degrees or Pa. */
  offset: number
  /** Commanded spark advance, degrees BTDC, or boost target, Pa. */
  setting: number
  torque: number
  power: number
  /** Largest unburned share at knock onset in any cylinder. */
  knock: number
  /** Largest mean ECU retard, degrees. */
  retard: number
  /** Highest part stress as a share of its limit, and which limit. */
  stress: number
  limit: LimitKey | null
  /** Measured boost (gauge), Pa. */
  boost: number
}
export type PushResult = {
  id: string
  status: 'running' | 'complete' | 'aborted'
  settings: PushSettings
  steps: PushStep[]
  /** Why the push stopped. */
  reason: string
  failure: Failure | null
}

export function validatePush(p: PushSettings, e: EngineDefinition) {
  if (!Number.isFinite(p.rpm) || p.rpm < 1000 || p.rpm > e.revLimit - 100)
    throw new Error(
      'Push RPM must be at least 1,000 and 100 RPM below the limiter.',
    )
  if (p.variable === 'boost' && e.induction.kind !== 'turbo')
    throw new Error('Pushing boost needs a turbocharger.')
  const [lo, hi] = p.variable === 'timing' ? [0.5, 5] : [5000, 50000]
  if (!(p.step >= lo && p.step <= hi))
    throw new Error(
      p.variable === 'timing'
        ? 'Timing steps must be 0.5–5°.'
        : 'Boost steps must be 0.05–0.5 bar.',
    )
  if (!(p.hold >= 0.8 && p.hold <= 4))
    throw new Error('Each step must hold for 0.8–4 s.')
}

/**
 * "Push it": hold the engine at one speed on full throttle and raise timing
 * or boost a step at a time until it knocks or something fails. Steps are
 * repeatable for the same build, conditions and settings.
 */
export class PushTest {
  readonly core: EngineCore
  readonly result: PushResult
  private frame = 0
  private stepFrames: number
  private index = 0
  private torque = 0
  private boost = 0
  private count = 0
  private knock = 0
  private retard = 0
  private stress = 0
  private limit: LimitKey | null = null

  constructor(
    engine: EngineDefinition,
    conditions: Conditions,
    settings: PushSettings,
    id = 'push',
    indestructible = false,
  ) {
    validatePush(settings, engine)
    this.core = new EngineCore(engine, conditions)
    this.core.sound = false
    this.core.setControls({
      ignition: true,
      throttle: 1,
      holdRpm: settings.rpm,
      indestructible,
    })
    // The first step also lets the engine settle at the push speed.
    this.stepFrames = Math.round(settings.hold * 48000)
    this.result = {
      id,
      status: 'running',
      settings: { ...settings },
      steps: [],
      reason: '',
      failure: null,
    }
  }
  private get offset() {
    return this.index * this.result.settings.step
  }
  abort(reason: string) {
    if (this.result.status !== 'running') return
    this.result.status = 'aborted'
    this.result.reason = reason
  }
  private finish(reason: string) {
    this.result.status = 'complete'
    this.result.reason = reason
  }
  advance(frames: number) {
    for (let i = 0; i < frames && this.result.status === 'running'; i++)
      this.tick()
  }
  private tick() {
    const core = this.core
    const s = this.result.settings
    try {
      core.step()
    } catch (error) {
      this.abort(error instanceof Error ? error.message : 'Numerical error')
      return
    }
    this.frame++
    const settle = this.index === 0 ? 48000 : 0
    const within = this.frame - settle
    if (core.stress.failure) {
      this.record()
      this.result.failure = core.stress.failure
      this.finish(
        `${core.stress.failure.title} at ${this.describe(this.offset)}.`,
      )
      return
    }
    if (within > 0 && this.frame % 48 === 0) {
      for (const cyl of core.cylinders)
        this.knock = Math.max(this.knock, cyl.knockIntensity)
      this.retard = Math.max(this.retard, core.meanRetard())
      for (const l of core.stress.telemetry(false).limits)
        if (l.ratio > this.stress) {
          this.stress = l.ratio
          this.limit = l.key
        }
    }
    if (within > this.stepFrames - MEASURE * 48000) {
      this.torque += core.torque
      this.boost += core.induction.supply - core.conditions.pressure
      this.count++
    }
    if (within < this.stepFrames) return
    this.record()
    const step = this.result.steps[this.result.steps.length - 1]
    if (s.stopAt === 'knock' && step.knock > KNOCK_FOUND) {
      this.finish(`Knock at ${this.describe(step.offset)}.`)
      return
    }
    const next = (this.index + 1) * s.step
    const ceiling =
      s.variable === 'timing'
        ? step.setting - step.offset + next > MAX_ADVANCE
        : step.setting - step.offset + next > MAX_BOOST
    if (this.index + 1 >= MAX_STEPS || ceiling) {
      this.finish(
        `Reached the largest ${s.variable === 'timing' ? 'advance' : 'boost'} the push supports without ${s.stopAt === 'knock' ? 'knock' : 'a failure'}.`,
      )
      return
    }
    this.index++
    this.frame = 0
    core.setControls(
      s.variable === 'timing'
        ? { advanceOffset: this.offset }
        : { boostOffset: this.offset },
    )
  }
  private describe(offset: number) {
    return this.result.settings.variable === 'timing'
      ? `+${offset.toFixed(1)}° advance`
      : `+${(offset / 1e5).toFixed(2)} bar boost`
  }
  private record() {
    const core = this.core
    const torque = this.count ? this.torque / this.count : core.torque
    this.result.steps.push({
      offset: this.offset,
      setting:
        this.result.settings.variable === 'timing'
          ? core.telemetry().ecu.advance + this.offset
          : core.induction.boostTarget,
      torque,
      power: powerKw(torque, core.omega as RadiansPerSecond),
      knock: this.knock,
      retard: this.retard,
      stress: this.stress,
      limit: this.limit,
      boost: this.count ? this.boost / this.count : 0,
    })
    this.torque = this.boost = this.count = 0
    this.knock = this.retard = this.stress = 0
    this.limit = null
  }
}
