import { continueCore, createCore } from './cores'
import type { Core } from './cores'
import { DynoTest } from './dyno'
import { normalConditions, roadEngine } from './schema'
import type { EngineDefinition, Conditions } from './schema'
import type { HostEvent, HostMessage } from './messages'
import type { Listener } from './acoustics'

declare const sampleRate: number
declare const currentTime: number
declare function registerProcessor(
  name: string,
  ctor: typeof EngineProcessor,
): void
declare class AudioWorkletProcessor {
  port: MessagePort
}

export class EngineProcessor extends AudioWorkletProcessor {
  private core: Core = createCore(roadEngine, normalConditions)
  private dyno: DynoTest | null = null
  private running = false
  private frame = 0
  private accumulator = 0
  private lastOutput = 0
  private started = 0
  private automaticStarter = true
  private peakMs = 0
  private budgetMs = (128 / sampleRate) * 1000
  private listener: Listener = 'tailpipe'
  /** A bench setting, so it survives the cores a stop or rebuild replaces. */
  private indestructible = false
  constructor(options?: {
    processorOptions?: {
      initial?: {
        engine: EngineDefinition
        conditions: Conditions
        throttle: number
        autostart: boolean
      }
    }
  }) {
    super()
    const initial = options?.processorOptions?.initial
    if (initial) {
      this.use(createCore(initial.engine, initial.conditions))
      this.core.setControls({
        throttle: initial.throttle,
        ignition: initial.autostart,
        starter: initial.autostart,
      })
      this.running = initial.autostart
    }
    this.port.onmessage = ({ data }: MessageEvent<HostMessage>) => {
      if (data.type === 'reconfigure') {
        // An invalid edit is reported and the running engine is left as it was.
        try {
          if (this.dyno)
            throw new Error('Live updates are paused during an automatic test.')
          this.use(
            this.running
              ? continueCore(this.core, data.engine, data.conditions)
              : createCore(data.engine, data.conditions),
          )
        } catch (error) {
          this.send({ type: 'error', message: String(error) })
        }
        return
      }
      try {
        if (data.type === 'listener') {
          this.listener = data.value
          this.core.setListener(data.value)
        }
        if (data.type === 'configure') {
          this.use(createCore(data.engine, data.conditions))
          this.running = false
          this.dyno = null
          this.accumulator = 0
        }
        if (data.type === 'controls') {
          if (data.value.indestructible !== undefined)
            this.indestructible = data.value.indestructible
          this.core.setControls(data.value)
        }
        if (data.type === 'start') {
          // Starting a failed engine rebuilds it from its last build first.
          if (this.core.stress.failure)
            this.use(createCore(this.core.engine, this.core.conditions))
          this.running = true
          this.started = this.core.time
          this.automaticStarter = data.automaticStarter ?? true
          this.core.setControls({
            ignition: data.ignition ?? true,
            starter: true,
          })
        }
        if (data.type === 'stop') {
          this.dyno?.abort(data.reason)
          if (this.dyno) this.send({ type: 'run', value: this.dyno.run })
          this.dyno = null
          this.running = false
          this.use(createCore(this.core.engine, this.core.conditions))
          this.sendTelemetry()
        }
        if (data.type === 'dyno') {
          this.dyno = new DynoTest(
            data.engine,
            data.conditions,
            data.procedure,
            data.id,
            data.runtime,
            data.indestructible,
          )
          this.use(this.dyno.core)
          this.running = true
        }
        if (data.type === 'probe') {
          if (
            !Number.isInteger(data.frames) ||
            data.frames < 0 ||
            data.frames > 48000
          )
            throw new Error('Diagnostic probe must contain 0–48000 frames')
          const core = createCore(data.engine, data.conditions)
          core.setControls(data.controls)
          for (let i = 0; i < data.frames; i++) core.step()
          this.send({ type: 'probe', value: core.telemetry() })
        }
      } catch (error) {
        this.send({ type: 'error', message: String(error) })
        this.running = false
      }
    }
  }
  /** Every core the bench plays keeps the chosen listening position. */
  private use(core: Core) {
    core.setListener(this.listener)
    if (!this.dyno || this.dyno.core !== core)
      core.setControls({ indestructible: this.indestructible })
    this.core = core
  }
  private send(event: HostEvent) {
    this.port.postMessage(event)
  }
  private sendTelemetry() {
    this.send({
      type: 'telemetry',
      value: this.core.telemetry(),
      callbackMs: this.peakMs,
      budgetMs: this.budgetMs,
    })
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const began = Date.now()
    const output = outputs[0]?.[0]
    if (!output) return true
    this.budgetMs = (output.length / sampleRate) * 1000
    try {
      for (let i = 0; i < output.length; i++) {
        if (!this.running) {
          output[i] = 0
          continue
        }
        this.accumulator += 48000 / sampleRate
        while (this.accumulator >= 1) {
          this.lastOutput = this.dyno ? this.dyno.tick() : this.core.step()
          this.accumulator--
        }
        output[i] = this.lastOutput
        if (
          !this.dyno &&
          this.automaticStarter &&
          this.core.time - this.started > 1.2 &&
          this.core.time - this.started < 1.2 + (1 / sampleRate) * 2
        )
          this.core.setControls({ starter: false })
        if (this.dyno && this.dyno.run.status !== 'running') {
          const complete = this.dyno.run.status === 'complete'
          this.send({ type: 'run', value: this.dyno.run })
          this.dyno = null
          // A completed pull has run down and is released to idle; an
          // aborted one stops, as an emergency stop should.
          if (!complete) {
            this.running = false
            this.use(createCore(this.core.engine, this.core.conditions))
          }
          this.sendTelemetry()
        }
      }
      this.frame += output.length
      if (this.frame >= sampleRate / 20) {
        this.frame = 0
        this.sendTelemetry()
        if (this.dyno) this.send({ type: 'run', value: this.dyno.run })
      }
    } catch (error) {
      this.running = false
      this.send({ type: 'error', message: String(error) })
    }
    // Keep the node alive for subsequent user starts; suspended contexts advance no physics.
    this.peakMs = Math.max(this.peakMs, Date.now() - began)
    void currentTime
    return true
  }
}
registerProcessor('engine-bench', EngineProcessor)
