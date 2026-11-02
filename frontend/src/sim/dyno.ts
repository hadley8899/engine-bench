import { EngineCore } from './core'
import { defaultProcedure, MODEL_VERSION, validateProcedure } from './schema'
import type { Conditions, EngineDefinition, Procedure, Run } from './schema'
import { omegaToRpm } from './physics'

/** A prescribed-speed dyno. Torque is measured from cylinder pressure minus friction. */
export class DynoTest {
  readonly core: EngineCore
  readonly run: Run
  private frame = 0
  private stageTime = 0
  private sumTorque = 0
  private sumAbsorbed = 0
  private sumRpm = 0
  private sumRetard = 0
  private count = 0
  private lastBin = 0.8
  private stepTarget: number
  private lastMean: number | null = null
  private stableWindows = 0
  private warmup = 0.8
  constructor(
    engine: EngineDefinition,
    conditions: Conditions,
    procedure: Procedure = defaultProcedure,
    id = 'test',
    runtime = 'Node',
  ) {
    validateProcedure(procedure, engine)
    this.core = new EngineCore(engine, conditions)
    this.core.setControls({
      ignition: true,
      throttle: 1,
      holdRpm: procedure.startRpm,
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
      warnings: [],
      samples: [],
    }
  }
  abort(reason: string) {
    if (this.run.status !== 'running') return
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
    this.run.samples.push({
      time: this.core.time,
      rpm,
      torque,
      power: (torque * rpm * Math.PI) / 30000,
      absorbedTorque: this.sumAbsorbed / this.count,
      knock: Math.min(100, this.core.knockPeak),
      retard: this.sumRetard / this.count,
    })
    this.clear()
  }
  private clear() {
    this.sumTorque = 0
    this.sumAbsorbed = 0
    this.sumRpm = 0
    this.sumRetard = 0
    this.count = 0
    this.core.knockPeak = 0
  }
  tick() {
    if (this.run.status !== 'running') return 0
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
    // Knock during warm-up belongs to no sample.
    if (!testing) this.core.knockPeak = 0
    if (testing) {
      this.sumTorque += this.core.torque
      this.sumAbsorbed += this.core.absorbedTorque
      this.sumRpm += omegaToRpm(this.core.omega)
      this.sumRetard += this.core.meanRetard()
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
          if (this.stepTarget >= p.endRpm) this.run.status = 'complete'
          this.stepTarget = Math.min(p.endRpm, this.stepTarget + p.stepRpm)
          this.stageTime = 0
          this.lastMean = null
          this.stableWindows = 0
        } else if (this.stageTime >= 4)
          this.abort('Steady-state torque did not settle within 4 seconds')
        else this.clear()
      }
      if (p.kind === 'sweep' && target >= p.endRpm) {
        this.record()
        this.run.status = 'complete'
      }
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
