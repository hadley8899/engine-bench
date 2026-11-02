import { describe, expect, it } from 'vitest'
import { flatMaps, roadEngine } from '../sim/schema'
import { describeMaps, nearest } from './mapFields'

describe('map fields', () => {
  it('describes what changed between two sets of maps', () => {
    const a = flatMaps(roadEngine)
    const b = { ...a, ignition: a.ignition.map((r, i) => (i === 0 ? r.map((v) => v + 2) : r)) }
    expect(describeMaps(null, null)).toEqual([])
    expect(describeMaps(null, a)).toEqual(['Engine-management maps: off → on'])
    expect(describeMaps(a, b)).toEqual([
      `Ignition advance map: ${a.rpm.length} cells changed`,
    ])
  })
  it('finds the nearest breakpoint', () => {
    expect(nearest([1000, 2000, 3000], 2400)).toBe(1)
    expect(nearest([1000, 2000, 3000], 9000)).toBe(2)
  })
  it('flat maps cover the rev range on load axes suited to the induction', () => {
    const m = flatMaps(roadEngine)
    expect(m.rpm.at(-1)).toBeGreaterThanOrEqual(roadEngine.revLimit)
    expect(m.load.at(-1)).toBe(100000)
    expect(m.ignition.flat().every((v) => v === roadEngine.ignitionAdvance)).toBe(true)
  })
})
