import { describe, expect, it } from 'vitest'
import { starterBuilds } from '../bench/builds'
import { realEngines } from '../bench/presets'
import { EngineCore } from './core'
import { DynoTest } from './dyno'
import {
  defaultProcedure,
  normalConditions,
  undersizedForEngine,
  validateEngine,
} from './schema'

describe('starting builds', () => {
  for (const build of [...starterBuilds, ...realEngines])
    it(`${build.label} is valid, starts, idles and completes a dyno sweep`, () => {
      const engine = validateEngine(build.engine)
      expect(undersizedForEngine(engine)).toEqual([])
      const core = new EngineCore(engine, normalConditions)
      core.setControls({ ignition: true, starter: true })
      for (let i = 0; i < 48000 * 1.2; i++) core.step()
      core.setControls({ starter: false })
      for (let i = 0; i < 48000 * 2; i++) core.step()
      const idle = core.telemetry().rpm
      expect(idle).toBeGreaterThan(600)
      expect(idle).toBeLessThan(1400)
      const test = new DynoTest(engine, normalConditions, {
        ...defaultProcedure,
        endRpm: Math.min(defaultProcedure.endRpm, engine.revLimit - 200),
      })
      while (test.run.status === 'running') test.advance(4800)
      expect(test.run.status).toBe('complete')
      expect(Math.max(...test.run.samples.map((s) => s.torque))).toBeGreaterThan(
        100,
      )
    })
})
