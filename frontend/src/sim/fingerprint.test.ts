import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { normalConditions, roadEngine, sportEngine } from './schema'
import type { EngineDefinition } from './schema'
import { realEngines } from '../bench/presets'

/**
 * Exact four-stroke output. The first seven hashes were re-recorded from an
 * untouched archive of the 1.14.1 commit on the current supported runtime;
 * the older checked-in hashes were already stale. Stage 11's first seven
 * match that clean baseline exactly, followed by its four new layouts.
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
  it('keep the 1.14.1 builds bit-for-bit and pin the Stage 11 layouts', { timeout: 120000 }, () => {
    const builds = [roadEngine, sportEngine, ...realEngines.map((p) => p.engine)].filter(
      (e) => e.cycle === 'four-stroke',
    )
    expect(builds.map(fingerprint)).toEqual([
      '1f4a150343025205',
      'dce91837020d0507',
      '48de30e3e29b02b9',
      '3b4956a5229ba3a1',
      '3613a1ddeaad3193',
      'c9bae546d05e733a',
      'f2da6d07e8dbb18f',
      'fc727e08d4b09ea8',
      'a7f807a78d15d401',
      '5f529de88bdf1b04',
      'f53479f9d23ec6bf',
    ])
  })
})
