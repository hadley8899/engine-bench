import { performance } from 'node:perf_hooks'
import { EngineCore } from '../src/sim/core'
import { normalConditions, roadEngine, sportEngine } from '../src/sim/schema'
import { DynoTest } from '../src/sim/dyno'
for (const rpm of [0, 1000, 4000, 7500, 8400]) {
  const c = new EngineCore(
    { ...sportEngine, revLimit: 8500, mechanicalLimit: 9000 },
    normalConditions,
  )
  c.setControls({
    ignition: true,
    throttle: 1,
    starter: true,
    holdRpm: rpm || null,
  })
  for (let i = 0; i < 48000; i++) c.step()
  const blocks: number[] = []
  for (let block = 0; block < 2000; block++) {
    const before = performance.now()
    for (let i = 0; i < 128; i++) c.step()
    blocks.push(performance.now() - before)
  }
  blocks.sort((a, b) => a - b)
  console.log(
    JSON.stringify({
      host: 'Node',
      rpm,
      cylinders: 4,
      blockFrames: 128,
      budgetMs: 128 / 48,
      medianMs: blocks[1000],
      p99Ms: blocks[1980],
      maximumMs: blocks.at(-1),
      maxAngularSubsteps: c.maxSubsteps,
      millisecondsPerStepPerCylinder: blocks[1000] / 128 / 4,
    }),
  )
}
const test = new DynoTest(roadEngine, normalConditions)
const before = performance.now()
while (test.run.status === 'running') test.advance(4800)
console.log(
  JSON.stringify({
    sweep: test.run.status,
    simulatedSeconds: test.core.time,
    wallSeconds: (performance.now() - before) / 1000,
    samples: test.run.samples.length,
    runtime: process.version,
    platform: process.platform,
  }),
)
