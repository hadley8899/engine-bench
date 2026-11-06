import { describe, expect, it } from 'vitest'
import { representativeCompressor, representativeTurbine } from './turboMaps'

describe('representative turbo maps', () => {
  it('has explicit compressor surge, efficient island and choke regions', () => {
    const surge = representativeCompressor(1, 2.6)
    const island = representativeCompressor(1, 2.25)
    const choke = representativeCompressor(1, 1)
    expect(surge.surge).toBe(true)
    expect(choke.choke).toBe(true)
    expect(island.efficiency).toBeGreaterThan(surge.efficiency)
    expect(island.efficiency).toBeGreaterThan(choke.efficiency)
    expect(choke.flowCoefficient).toBeGreaterThan(island.flowCoefficient)
  })

  it('raises the compressor pressure capability with corrected speed', () => {
    expect(representativeCompressor(0.6, 1.8).surge).toBe(true)
    expect(representativeCompressor(1, 1.8).surge).toBe(false)
  })

  it('chokes turbine flow while retaining a bounded efficiency island', () => {
    const low = representativeTurbine(0.75, 1.2)
    const peak = representativeTurbine(0.75, 2)
    const choked = representativeTurbine(0.75, 4)
    expect(low.flowCapacity).toBeLessThan(peak.flowCapacity)
    expect(choked.flowCapacity).toBeCloseTo(1, 6)
    expect(choked.choked).toBe(true)
    expect(peak.efficiency).toBeGreaterThan(low.efficiency)
  })
})
