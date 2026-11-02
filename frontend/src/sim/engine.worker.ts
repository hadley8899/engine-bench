import { EngineCore } from './core'
import { DynoTest } from './dyno'
import type { HostEvent, HostMessage } from './messages'
const scope = self as unknown as {
  onmessage: (event: MessageEvent<HostMessage>) => void
  postMessage: (message: HostEvent) => void
}
let active: DynoTest | null = null
let generation = 0
let lastPublished = 0
scope.onmessage = ({ data }) => {
  try {
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
      scope.postMessage({ type: 'probe', value: core.telemetry() })
    }
    if (data.type === 'stop') {
      active?.abort(data.reason)
      if (active) scope.postMessage({ type: 'run', value: active.run })
      active = null
      generation++
    }
    if (data.type === 'dyno') {
      generation++
      lastPublished = -Infinity
      const task = generation
      active = new DynoTest(
        data.engine,
        data.conditions,
        data.procedure,
        data.id,
        data.runtime,
      )
      // Headless tests discard audio; sound never affects the physics.
      active.core.sound = false
      const batch = () => {
        if (!active || task !== generation) return
        active.advance(4800)
        if (
          active.run.status !== 'running' ||
          performance.now() - lastPublished >= 50
        ) {
          scope.postMessage({ type: 'run', value: active.run })
          lastPublished = performance.now()
        }
        if (active.run.status === 'running') setTimeout(batch, 0)
        else active = null
      }
      batch()
    }
  } catch (error) {
    active = null
    scope.postMessage({ type: 'error', message: String(error) })
  }
}
