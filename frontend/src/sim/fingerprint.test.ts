import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { normalConditions, roadEngine, sportEngine } from './schema'
import type { EngineDefinition } from './schema'
import { realEngines } from '../bench/presets'

/**
 * Exact four-stroke output, recorded from model 1.13.0 before the core was
 * generalised for two-strokes (Stage 10). A change here means four-stroke
 * results changed; update the hashes only for an intended model change.
 */
function fingerprint(engine: EngineDefinition) {
  const core = new EngineCore(engine, normalConditions)
  // FNV-1a over the bytes of each step's values.
  let h = 0x811c9dc5
  let g = 0x01000193
  core.setControls({ ignition: true, starter: true })
  const buf = new Float64Array(8)
  const bytes = new Uint8Array(buf.buffer)
  for (let i = 0; i < 48000 * 1.5; i++) {
    if (i === 24000) core.setControls({ starter: false, throttle: 0.7 })
    if (i === 48000) core.setControls({ throttle: 0.2, load: 40 })
    buf[0] = core.step()
    buf[1] = core.omega
    buf[2] = core.torque
    buf[3] = core.cylinders[0].pressure
    buf[4] = core.cylinders[2].energy
    buf[5] = core.manifold
    buf[6] = core.cylinders[1].thermal.crown
    buf[7] = core.stress.worst()
    for (const byte of bytes) {
      h = Math.imul(h ^ byte, 0x01000193) >>> 0
      g = Math.imul(g ^ byte, 0x811c9dc5) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0')
}

describe('four-stroke results', () => {
  it('are bit-for-bit those of model 1.13.0', { timeout: 120000 }, () => {
    const builds = [roadEngine, sportEngine, ...realEngines.map((p) => p.engine)]
    expect(builds.map(fingerprint)).toEqual([
      'db02abfde3179af1',
      'ac36a0fb65cc513d',
      '560fb61e289f2c1a',
      '83cfb2913df86869',
      'e9d492dbc2e56f87',
      '297c08ff7aac978b',
      '018a5804b7f1e280',
    ])
  })
})
