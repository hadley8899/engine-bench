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
  it('keeps legacy builds bit-for-bit and pins current results', { timeout: 120000 }, () => {
    const builds = [roadEngine, sportEngine, ...realEngines.map((p) => p.engine)].filter(
      (e) => e.cycle === 'four-stroke',
    )
    const shaped = (rpm: number[], points: [number, number][]) =>
      rpm.map((speed) => {
        if (speed <= points[0][0]) return points[0][1]
        for (let i = 1; i < points.length; i++)
          if (speed <= points[i][0])
            return Math.round(
              points[i - 1][1] +
                ((points[i][1] - points[i - 1][1]) *
                  (speed - points[i - 1][0])) /
                  (points[i][0] - points[i - 1][0]),
            )
        return points[points.length - 1][1]
      })
    const legacy = builds.map((engine) => {
      let intake: [number, number][] | null = null
      if (engine.name.includes('AXX'))
        intake = [
          [1000, -20],
          [1500, 20],
          [2000, 5],
          [2500, 0],
        ]
      if (engine.name.includes('K20A'))
        intake = [
          [1500, -32],
          [2500, -15],
          [3500, 0],
          [4000, -5],
          [4500, -25],
          [5000, -10],
          [5500, 0],
          [6000, 5],
          [7000, 5],
          [8000, 0],
        ]
      let management =
        intake && engine.management?.intakeCam
          ? {
              ...engine.management,
              intakeCam: engine.management.intakeCam.map(() =>
                shaped(engine.management!.rpm, intake),
              ),
            }
          : engine.management
      let induction = engine.induction
      if (engine.name.includes('AXX') && induction.kind === 'turbo') {
        induction = { ...induction, boostTarget: 60000 }
        if (management) {
          const { torque: _torque, ...withoutTorque } = management
          void _torque
          const plateau = withoutTorque.rpm.indexOf(1800)
          const strip = (table: number[][] | undefined) =>
            table?.map((row) => row.filter((_, i) => i !== plateau))
          management = {
            ...withoutTorque,
            rpm: withoutTorque.rpm.filter((_, i) => i !== plateau),
            ignition: strip(withoutTorque.ignition)!,
            lambda: strip(withoutTorque.lambda)!,
            boost: strip(management.boost)!.map((row) =>
              row.map(() => 60000),
            ),
            ...(withoutTorque.intakeCam
              ? { intakeCam: strip(withoutTorque.intakeCam) }
              : {}),
            ...(withoutTorque.exhaustCam
              ? { exhaustCam: strip(withoutTorque.exhaustCam) }
              : {}),
          }
        }
      }
      return {
        ...engine,
        induction,
        ignitionAdvance: engine.name === roadEngine.name ? 20 : engine.ignitionAdvance,
        intakePortModel: 'legacy' as const,
        camMotion: 'legacy' as const,
        valveRelief: null,
        combustion: { ...engine.combustion, calibration: 'legacy' as const },
        management,
        exhaust: { ...engine.exhaust, pressureWaves: false },
      }
    })
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
      'ce063ca483fd9c24',
      '925e5314a818d04a',
      'e6271eb9aa12f839',
      '790a521d195cf22b',
      '04b8604a291819a4',
      '13a009c80ce8ba48',
      '941944876cfb5533',
      'ed76506f31b2d0e3',
      '2a753154ad86f0d0',
      '452abe66377f5696',
      '105de6d84b8df030',
    ])
  })
})
