import { describe, expect, it } from 'vitest'
import { Pipe, PIPE_WALL } from './pipe'
import { enthalpy } from './physics'

const straight = (length: number, d = 0.04) => [{ length, start: d, end: d }]
const chamber = [
  { length: 0.1, start: 0.04, end: 0.04 },
  { length: 0.3, start: 0.04, end: 0.11 },
  { length: 0.15, start: 0.11, end: 0.11 },
  { length: 0.2, start: 0.11, end: 0.022 },
  { length: 0.2, start: 0.022, end: 0.022 },
]

describe('quasi-1D exhaust pipe', () => {
  it('stays at rest in a still atmosphere, even across cones', () => {
    // Gas at the wall temperature, so no heat moves it.
    const pipe = new Pipe(chamber, 101325, 293.15, PIPE_WALL)
    for (let i = 0; i < 2000; i++) pipe.advance(1 / 48000, 0, 0, 0, 0)
    for (let i = 0; i < pipe.cells; i++) {
      expect(Math.abs(pipe.velocityAt(i))).toBeLessThan(1e-6)
      expect(pipe.pressureAt(i)).toBeCloseTo(101325, 2)
    }
  })

  it('backflow into the cylinder takes its momentum with it', () => {
    // A cylinder drawing gas back from a small pipe: the gas at the port
    // moves towards it at about ṁ/ρA instead of running away.
    const pipe = new Pipe(straight(0.3, 0.02), 101325, 293.15, PIPE_WALL)
    const area = Math.PI * 0.01 ** 2
    for (let i = 0; i < 480; i++) {
      const flow = -0.3 * pipe.portDensity * area * 100
      pipe.advance(1 / 48000, flow, flow * pipe.portEnthalpy, flow * pipe.portFresh, flow * pipe.portFuel)
    }
    expect(pipe.velocityAt(0)).toBeLessThan(0)
    expect(pipe.velocityAt(0)).toBeGreaterThan(-200)
    expect(pipe.temperatureAt(0)).toBeGreaterThan(200)
  })

  it('conserves mass and energy between the port and the outlet', () => {
    const pipe = new Pipe(chamber, 101325, 293.15, 600)
    const start = pipe.totals()
    const h = enthalpy(1200)
    for (let i = 0; i < 4800; i++) {
      // A blowdown-like pulse every 5 ms.
      const flow = i % 240 < 40 ? 0.08 * Math.sin((Math.PI * (i % 240)) / 40) : 0
      pipe.advance(1 / 48000, flow, flow * h, flow * 0.2, flow * 0.01)
    }
    const end = pipe.totals()
    const mass = start.mass + pipe.portMass - pipe.outletMass
    const energy =
      start.energy + pipe.portEnergy - pipe.outletEnergy - pipe.heatLost
    expect(end.mass).toBeCloseTo(mass, 12)
    expect(Math.abs(end.energy - energy) / end.energy).toBeLessThan(1e-9)
  })

  it('returns a pulse from its open end inverted, after the round trip', () => {
    const length = 1
    // Gas at the wall temperature, so only the pulse moves it.
    const pipe = new Pipe(straight(length), 101325, 293.15, PIPE_WALL)
    const h = enthalpy(PIPE_WALL)
    const dt = 1 / 48000
    let low = Infinity
    let lowAt = 0
    for (let i = 0; i < 480; i++) {
      // A short pulse, then a closed port (a wall).
      pipe.advance(dt, i < 12 ? 0.05 : 0, i < 12 ? 0.05 * h : 0, 0, 0)
      // Skip the brief dip as the jet stops.
      if (i * dt > 0.0015 && pipe.portPressure < low) {
        low = pipe.portPressure
        lowAt = i * dt
      }
    }
    // An open end reflects compression as rarefaction: it reaches the
    // port below ambient one round trip (2L/a) after the pulse.
    const roundTrip = (2 * length) / Math.sqrt(1.37 * 287 * PIPE_WALL)
    expect(low).toBeLessThan(101325 - 2000)
    expect(lowAt).toBeGreaterThan(roundTrip)
    expect(lowAt).toBeLessThan(roundTrip + 0.0015)
  })
})
