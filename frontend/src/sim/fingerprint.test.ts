import { describe, expect, it } from 'vitest'
import { EngineCore } from './core'
import { normalConditions, roadEngine, sportEngine } from './schema'
import type { EngineDefinition } from './schema'
import { realEngines } from '../bench/presets'

/**
 * Exact four-stroke output. Legacy hashes were recorded from the clean
 * 1.14.1/1.15.0 path; schema-4 builds opt into pressure-wave tuning and get
 * a second pinned set. Disabling the opt-in must keep every old hash exactly.
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
  it('keeps legacy builds bit-for-bit and pins pressure-wave results', { timeout: 120000 }, () => {
    const builds = [roadEngine, sportEngine, ...realEngines.map((p) => p.engine)].filter(
      (e) => e.cycle === 'four-stroke',
    )
    const legacy = builds.map((engine) => ({
      ...engine,
      exhaust: { ...engine.exhaust, pressureWaves: false },
    }))
    expect(legacy.map(fingerprint)).toEqual([
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
    expect(builds.map(fingerprint)).toEqual([
      'f50500494fbffd81',
      '80f696624b71e988',
      'edb12e049c3d63f4',
      '4148c73131a1fc51',
      'c483cf890f8b7003',
      'd02a7057b432d379',
      '6521583bfb0db0b9',
      '20220ca5c26baf9f',
      '0e12d0107a573bb0',
      '4e41f1115dd98c91',
      'b6c5dbb1914dd551',
    ])
  })
})
