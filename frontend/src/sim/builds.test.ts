import { describe, expect, it } from 'vitest'
import { starterBuilds } from '../bench/builds'
import { realEngines } from '../bench/presets'
import { createCore } from './cores'
import { DynoTest } from './dyno'
import {
  defaultProcedure,
  displacement,
  normalConditions,
  undersizedForEngine,
  validateEngine,
} from './schema'

describe('starting builds', () => {
  for (const build of [...starterBuilds, ...realEngines])
    it(`${build.label} is valid, starts, idles and completes a dyno sweep`, { timeout: 60000 }, () => {
      const engine = validateEngine(build.engine)
      expect(undersizedForEngine(engine)).toEqual([])
      const two = engine.cycle === 'two-stroke'
      const core = createCore(engine, normalConditions)
      core.setControls({ ignition: true, starter: true })
      for (let i = 0; i < 48000 * 1.2; i++) core.step()
      core.setControls({ starter: false })
      for (let i = 0; i < 48000 * 2; i++) core.step()
      // Two-strokes idle higher and rougher (light cranks, four-stroking).
      const idle = core.telemetry().rpm
      expect(idle).toBeGreaterThan(600)
      expect(idle).toBeLessThan(two ? 2500 : 1400)
      const test = new DynoTest(engine, normalConditions, {
        ...defaultProcedure,
        startRpm: two ? 3000 : defaultProcedure.startRpm,
        endRpm: two
          ? engine.revLimit - 200
          : Math.min(defaultProcedure.endRpm, engine.revLimit - 200),
      })
      while (test.run.status === 'running') test.advance(4800)
      expect(test.run.status).toBe('complete')
      // At least 40 Nm per litre: 100 Nm from the 2-litre fours.
      expect(Math.max(...test.run.samples.map((s) => s.torque))).toBeGreaterThan(
        Math.min(100, 40000 * displacement(engine)),
      )
    })
})
