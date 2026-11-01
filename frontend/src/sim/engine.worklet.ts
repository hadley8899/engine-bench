import { EngineCore } from './core'
import { DynoTest } from './dyno'
import { normalConditions, roadEngine } from './schema'
import type { EngineDefinition, Conditions } from './schema'
import type { HostEvent, HostMessage } from './messages'

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
  private core = new EngineCore(roadEngine, normalConditions)
  private dyno: DynoTest | null = null
  private running = false
  private frame = 0
  private accumulator = 0
  private lastOutput = 0
  private started = 0
  private automaticStarter = true
  private peakMs = 0
  private budgetMs = (128 / sampleRate) * 1000
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
      this.core = new EngineCore(initial.engine, initial.conditions)
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
          this.core = this.running
            ? EngineCore.continueFrom(this.core, data.engine, data.conditions)
            : new EngineCore(data.engine, data.conditions)
        } catch (error) {
          this.send({ type: 'error', message: String(error) })
        }
        return
      }
      try {
        if (data.type === 'configure') {
          this.core = new EngineCore(data.engine, data.conditions)
          this.running = false
          this.dyno = null
          this.accumulator = 0
        }
        if (data.type === 'controls') this.core.setControls(data.value)
        if (data.type === 'start') {
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
          this.core = new EngineCore(this.core.engine, this.core.conditions)
          this.sendTelemetry()
        }
        if (data.type === 'dyno') {
          this.dyno = new DynoTest(
            data.engine,
            data.conditions,
            data.procedure,
            data.id,
            data.runtime,
          )
          this.core = this.dyno.core
          this.running = true
        }
        if (data.type === 'probe') {
          if (
            !Number.isInteger(data.frames) ||
            data.frames < 0 ||
            data.frames > 48000
          )
            throw new Error('Diagnostic probe must contain 0–48000 frames')
          const core = new EngineCore(data.engine, data.conditions)
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
          this.send({ type: 'run', value: this.dyno.run })
          this.dyno = null
          this.running = false
          this.core = new EngineCore(this.core.engine, this.core.conditions)
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
