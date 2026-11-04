import workletUrl from '../sim/engine.worklet.ts?worker&url'
import type { HostEvent, HostMessage } from '../sim/messages'
import type { Listener } from '../sim/acoustics'

export class BenchAudio {
  context: AudioContext | null = null
  node: AudioWorkletNode | null = null
  private gain: GainNode | null = null
  private init: Promise<void> | null = null
  onEvent: (event: HostEvent) => void = () => {}
  volume = 0.25
  listener: Listener = 'tailpipe'
  /** Bench setting the worklet keeps across the cores it replaces. */
  indestructible = false
  async enable() {
    if (!this.context) {
      this.context = new AudioContext({
        sampleRate: 48000,
        latencyHint: 'interactive',
      })
      this.init = this.context.audioWorklet.addModule(workletUrl).then(() => {
        const context = this.context!
        this.node = new AudioWorkletNode(context, 'engine-bench', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        })
        const limiter = context.createDynamicsCompressor()
        limiter.threshold.value = -6
        limiter.knee.value = 0
        limiter.ratio.value = 20
        limiter.attack.value = 0.003
        limiter.release.value = 0.15
        this.gain = context.createGain()
        this.gain.gain.value = this.volume
        this.node
          .connect(limiter)
          .connect(this.gain)
          .connect(context.destination)
        this.node.port.postMessage({
          type: 'listener',
          value: this.listener,
        } satisfies HostMessage)
        this.node.port.postMessage({
          type: 'controls',
          value: { indestructible: this.indestructible },
        } satisfies HostMessage)
        this.node.port.onmessage = (e: MessageEvent<HostEvent>) =>
          this.onEvent(e.data)
        this.node.onprocessorerror = () =>
          this.onEvent({
            type: 'error',
            message:
              'Audio processor stopped. Reload the bench to restart audio.',
          })
      })
    }
    await this.init
    await this.context.resume()
  }
  send(message: HostMessage) {
    this.node?.port.postMessage(message)
  }
  setListener(listener: Listener) {
    this.listener = listener
    this.send({ type: 'listener', value: listener })
  }
  setIndestructible(value: boolean) {
    this.indestructible = value
    this.send({ type: 'controls', value: { indestructible: value } })
  }
  setVolume(volume: number) {
    this.volume = volume
    if (this.gain && this.context)
      this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.02)
  }
  async suspend() {
    if (this.context?.state === 'running') await this.context.suspend()
  }
  async close() {
    this.node?.disconnect()
    await this.context?.close()
  }
}
