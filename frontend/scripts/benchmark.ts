import { performance } from 'node:perf_hooks'
import { createCore } from '../src/sim/cores'
import {
  normalConditions,
  raceTwoStroke,
  roadEngine,
  sportEngine,
} from '../src/sim/schema'
import type { EngineDefinition } from '../src/sim/schema'
import { DynoTest } from '../src/sim/dyno'
const twin: EngineDefinition = {
  ...raceTwoStroke,
  name: 'Two-stroke twin',
  layout: 'inline-2',
  cylinders: 2,
  firingOrder: [1, 2],
}
const cases: [string, EngineDefinition, number[]][] = [
  ['four-stroke', { ...sportEngine, revLimit: 8500, mechanicalLimit: 9000 }, [0, 1000, 4000, 7500, 8400]],
  // Two-strokes carry a one-dimensional pipe per cylinder (pipe.ts).
  ['two-stroke single', { ...raceTwoStroke, revLimit: 14000, mechanicalLimit: 15000 }, [0, 4000, 9000, 12500]],
  ['two-stroke twin', { ...twin, revLimit: 14000, mechanicalLimit: 15000 }, [0, 4000, 9000, 12500]],
]
for (const [engine, definition, speeds] of cases)
for (const rpm of speeds) {
  const c = createCore(definition, normalConditions)
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
      engine,
      rpm,
      cylinders: definition.cylinders,
      blockFrames: 128,
      budgetMs: 128 / 48,
      medianMs: blocks[1000],
      p99Ms: blocks[1980],
      maximumMs: blocks.at(-1),
      maxAngularSubsteps: c.maxSubsteps,
      millisecondsPerStepPerCylinder: blocks[1000] / 128 / definition.cylinders,
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
