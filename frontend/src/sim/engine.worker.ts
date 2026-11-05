import { createCore } from './cores'
import { DynoTest } from './dyno'
import { PushTest } from './push'
import type { HostEvent, HostMessage } from './messages'
const scope = self as unknown as {
  onmessage: (event: MessageEvent<HostMessage>) => void
  postMessage: (message: HostEvent) => void
}
let active: DynoTest | null = null
let pushing: PushTest | null = null
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
      const core = createCore(data.engine, data.conditions)
      core.setControls(data.controls)
      for (let i = 0; i < data.frames; i++) core.step()
      scope.postMessage({ type: 'probe', value: core.telemetry() })
    }
    if (data.type === 'stop') {
      active?.abort(data.reason)
      if (active) scope.postMessage({ type: 'run', value: active.run })
      active = null
      pushing?.abort(data.reason)
      if (pushing) scope.postMessage({ type: 'push', value: pushing.result })
      pushing = null
      generation++
    }
    if (data.type === 'push') {
      generation++
      active = null
      const task = generation
      const test = (pushing = new PushTest(
        data.engine,
        data.conditions,
        data.settings,
        data.id,
        data.indestructible,
      ))
      let published = -Infinity
      const batch = () => {
        if (pushing !== test || task !== generation) return
        test.advance(4800)
        const done = test.result.status !== 'running'
        if (done || performance.now() - published >= 100) {
          scope.postMessage({ type: 'push', value: test.result })
          published = performance.now()
        }
        if (done) pushing = null
        else setTimeout(batch, 0)
      }
      batch()
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
        data.indestructible,
      )
      pushing = null
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
