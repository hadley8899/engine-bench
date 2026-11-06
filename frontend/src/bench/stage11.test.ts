import { describe, expect, it } from 'vitest'
import { canContinue, createCore } from '../sim/cores'
import { normalConditions, recipeSchema, roadEngine, validateEngine } from '../sim/schema'
import { cycleLayout, withCycleLayout } from './twoStrokeFields'
import type { CycleLayout } from './twoStrokeFields'

const layouts: [CycleLayout, string, number][] = [
  ['inline4', 'inline-4', 4],
  ['inline6', 'inline-6', 6],
  ['v6', 'v-6', 6],
  ['v8', 'v-8', 8],
  ['boxer4', 'boxer-4', 4],
  ['single', 'single', 1],
  ['twin180', 'inline-2', 2],
  ['twin360', 'inline-2', 2],
  ['vtwin90', 'v-2', 2],
]

describe('Stage 11 layout switching', () => {
  for (const [choice, layout, cylinders] of layouts) {
    it(`builds, validates and serialises ${choice}`, () => {
      const engine = validateEngine(withCycleLayout(roadEngine, choice))
      expect(engine.layout).toBe(layout)
      expect(engine.cylinders).toBe(cylinders)
      expect(cycleLayout(engine)).toBe(choice)
      expect(recipeSchema.parse({
        format: 'engine-bench/1',
        engine,
        conditions: normalConditions,
      }).engine).toEqual(engine)
      expect(createCore(engine, normalConditions).telemetry().phases).toHaveLength(cylinders)
    })
  }

  it('treats bank layout and firing-order changes as structural', () => {
    const boxer = withCycleLayout(roadEngine, 'boxer4')
    const inlineSix = withCycleLayout(roadEngine, 'inline6')
    const v6 = withCycleLayout(roadEngine, 'v6')
    expect(canContinue(roadEngine, boxer)).toBe(false)
    expect(canContinue(inlineSix, v6)).toBe(false)
    expect(canContinue(v6, { ...v6, name: 'Renamed V6' })).toBe(true)
  })

  it('gives the V-twin its uneven 90/270-degree firing interval', () => {
    const engine = validateEngine(withCycleLayout(roadEngine, 'vtwin90'))
    expect(engine.twoStroke?.crankPhase).toBe(90)
    const phases = createCore(engine, normalConditions).telemetry().phases
    const separation = ((phases[0] - phases[1]) % 360 + 360) % 360
    expect([90, 270]).toContain(separation)
  })
})
