import { EngineCore } from './core'
import { defaultProcedure, MODEL_VERSION, validateProcedure } from './schema'
import type { Conditions, EngineDefinition, Procedure, Run } from './schema'
import { omegaToRpm } from './physics'

/** Run-down after the pull: closed throttle, dyno-controlled deceleration, RPM/s. */
const RUNDOWN_RATE = 1200
/** The run-down ends here, or at the start speed if that is higher. */
const RUNDOWN_FLOOR = 1000

/**
 * A prescribed-speed dyno. Torque is measured from cylinder pressure minus
 * friction. After the pull the throttle closes and the dyno brings the
 * engine down to the start speed; that overrun is recorded separately as
 * the run-down (engine braking), then the engine is released to idle.
 */
export class DynoTest {
  readonly core: EngineCore
  readonly run: Run
  private frame = 0
  private stageTime = 0
  private sumTorque = 0
  private sumAbsorbed = 0
  private sumRpm = 0
  private sumRetard = 0
  private stress = 0
  private count = 0
  private lastBin = 0.8
  private stepTarget: number
  private lastMean: number | null = null
  private stableWindows = 0
  private warmup = 0.8
  /** Frame at which the run-down began, or null during the pull. */
  private rundownFrame: number | null = null
  private rundownTop = 0
  constructor(
    engine: EngineDefinition,
    conditions: Conditions,
    procedure: Procedure = defaultProcedure,
    id = 'test',
    runtime = 'Node',
    indestructible = false,
  ) {
    validateProcedure(procedure, engine)
    this.core = new EngineCore(engine, conditions)
    this.core.setControls({
      ignition: true,
      throttle: 1,
      holdRpm: procedure.startRpm,
      indestructible,
    })
    this.stepTarget = procedure.startRpm
    this.run = {
      schemaVersion: 1,
      modelVersion: MODEL_VERSION,
      id,
      runtime,
      engine: { ...engine, firingOrder: [...engine.firingOrder] },
      conditions: { ...conditions },
      procedure: { ...procedure },
      status: 'running',
      reason: '',
      warnings: indestructible
        ? ['Indestructible mode: parts were stressed but could not fail.']
        : [],
      samples: [],
      rundown: [],
    }
  }
  abort(reason: string) {
    if (this.run.status !== 'running') return
    // The pull itself finished; only the run-down is cut short.
    if (this.rundownFrame !== null) {
      this.record()
      this.finish(`Run-down stopped: ${reason}`)
      return
    }
    if (this.count > 0) this.record()
    this.run.status = 'aborted'
    this.run.reason = reason
    this.core.setControls({
      ignition: false,
      throttle: 0,
      holdRpm: null,
      load: 0,
    })
  }
  private record() {
    if (!this.count) return
    const rpm = this.sumRpm / this.count
    const torque = this.sumTorque / this.count
    const target =
      this.rundownFrame === null ? this.run.samples : this.run.rundown!
    target.push({
      time: this.core.time,
      rpm,
      torque,
      power: (torque * rpm * Math.PI) / 30000,
      absorbedTorque: this.sumAbsorbed / this.count,
      knock: Math.min(100, this.core.knockPeak),
      retard: this.sumRetard / this.count,
      egt: Math.max(...this.core.cylinders.map((c) => c.thermal.egt)),
      stress: Math.min(100, this.stress),
    })
    this.clear()
  }
  private clear() {
    this.sumTorque = 0
    this.sumAbsorbed = 0
    this.sumRpm = 0
    this.sumRetard = 0
    this.count = 0
    this.stress = 0
    this.core.knockPeak = 0
  }
  /** Close the throttle and start bringing the engine down. */
  private beginRundown() {
    this.record()
    this.rundownFrame = this.frame
    this.rundownTop = omegaToRpm(this.core.omega)
    this.lastBin = this.frame / 48000
    this.core.setControls({ throttle: 0 })
  }
  /** Complete the run and release the engine to idle. */
  private finish(reason = '') {
    this.run.status = 'complete'
    this.run.reason = reason
    this.core.setControls({ throttle: 0, holdRpm: null, load: 0 })
  }
  private tickRundown() {
    const time = this.frame / 48000
    const elapsed = (this.frame - this.rundownFrame!) / 48000
    const floor = Math.max(RUNDOWN_FLOOR, this.run.procedure.startRpm)
    const target = this.rundownTop - elapsed * RUNDOWN_RATE
    if (target <= floor) {
      this.record()
      this.finish()
      return 0
    }
    this.core.controls.holdRpm = target
    let audio: number
    try {
      audio = this.core.step()
    } catch (error) {
      this.abort(error instanceof Error ? error.message : 'Numerical error')
      return 0
    }
    this.frame++
    this.sumTorque += this.core.torque
    this.sumAbsorbed += this.core.absorbedTorque
    this.sumRpm += omegaToRpm(this.core.omega)
    this.sumRetard += this.core.meanRetard()
    this.count++
    if (time - this.lastBin >= 0.15) {
      this.record()
      this.lastBin = time
    }
    return audio
  }
  tick() {
    if (this.run.status !== 'running') return 0
    if (this.rundownFrame !== null) return this.tickRundown()
    const p = this.run.procedure
    const time = this.frame / 48000
    const testing = time >= this.warmup
    let target = p.startRpm
    if (testing)
      target =
        p.kind === 'sweep'
          ? p.startRpm + Math.max(0, time - this.warmup - 0.15) * p.rate
          : this.stepTarget
    if (
      target >= this.core.engine.mechanicalLimit ||
      target >= this.core.engine.revLimit
    ) {
      this.abort('Configured operating limit reached')
      return 0
    }
    this.core.controls.holdRpm = target
    let audio: number
    try {
      audio = this.core.step()
    } catch (error) {
      this.abort(error instanceof Error ? error.message : 'Numerical error')
      return 0
    }
    this.frame++
    const failure = this.core.stress.failure
    if (failure) {
      this.abort(`${failure.title}. ${failure.detail}`)
      return audio
    }
    // Knock during warm-up belongs to no sample.
    if (!testing) this.core.knockPeak = 0
    if (testing) {
      this.sumTorque += this.core.torque
      this.sumAbsorbed += this.core.absorbedTorque
      this.sumRpm += omegaToRpm(this.core.omega)
      this.sumRetard += this.core.meanRetard()
      if (this.frame % 48 === 0)
        this.stress = Math.max(this.stress, this.core.stress.worst())
      this.count++
      this.stageTime += 1 / 48000
      if (p.kind === 'sweep' && time - this.lastBin >= 0.15) {
        this.record()
        this.lastBin = time
      }
      if (
        p.kind === 'steps' &&
        this.stageTime >= p.holdSeconds &&
        this.count >= 12000
      ) {
        const mean = this.sumTorque / this.count
        if (
          this.lastMean !== null &&
          Math.abs(mean - this.lastMean) < Math.max(3, Math.abs(mean) * 0.04)
        )
          this.stableWindows++
        else this.stableWindows = 0
        this.lastMean = mean
        if (this.stableWindows >= 1) {
          this.record()
          if (this.stepTarget >= p.endRpm) this.beginRundown()
          this.stepTarget = Math.min(p.endRpm, this.stepTarget + p.stepRpm)
          this.stageTime = 0
          this.lastMean = null
          this.stableWindows = 0
        } else if (this.stageTime >= 4)
          this.abort('Steady-state torque did not settle within 4 seconds')
        else this.clear()
      }
      if (p.kind === 'sweep' && target >= p.endRpm) this.beginRundown()
    }
    if (this.frame > 48000 * 120)
      this.abort('Test duration exceeded the two-minute limit')
    return audio
  }
  advance(frames: number) {
    if (frames > 4800 || frames < 0)
      throw new Error('Dyno batch must be between 0 and 4800 frames')
    for (let i = 0; i < frames && this.run.status === 'running'; i++)
      this.tick()
  }
}
