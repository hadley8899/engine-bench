import type { EngineDefinition } from './schema'

/** The core and AudioWorklet both advance at this fixed rate. */
const SAMPLE_RATE = 48000
/** Representative wave speed in a hot four-stroke primary, m/s. */
export const EXHAUST_WAVE_SPEED = 560
/** A tri-Y secondary is inferred because the schema quotes primary length only. */
export const SECONDARY_LENGTH_RATIO = 0.55

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

/**
 * Allocation-free tuned pressure-wave boundary for a four-stroke header.
 *
 * Each exhaust-valve mass-flow pulse launches a pressure wave down its
 * primary. A lossless junction scatters delayed waves between the other
 * primaries and the collector; length-dependent attenuation represents wall
 * and bend losses. A 4-2-1 first joins cylinders separated by half a firing
 * cycle, then reflects a second time at the final collector. This is a
 * digital waveguide rather than a gas inventory: the ordinary cylinder and
 * turbo models still own mass and energy, while this model supplies only the
 * returning pressure perturbation seen at each exhaust valve.
 */
export class FourStrokeExhaust {
  readonly engine: EngineDefinition
  readonly enabled: boolean
  readonly cylinders: number
  readonly primaryDelay: number
  readonly finalDelay: number
  readonly primaryArea: number
  private readonly impedance: number
  private readonly attenuation: number
  private readonly signature: string
  private readonly waves: Float64Array[]
  private readonly incident: Float64Array
  private readonly delayed: Float64Array
  private readonly returning: Float64Array
  private readonly pairs: [number, number][]
  private readonly pairWave: Float64Array
  private write = 0

  constructor(engine: EngineDefinition) {
    this.engine = engine
    this.enabled = engine.cycle === 'four-stroke' && engine.exhaust.pressureWaves
    this.cylinders = engine.cylinders
    // A production primary is normally wider than the effective valve-flow
    // area. The bore rule keeps unusual builds from getting a tiny waveguide.
    const boreArea = (Math.PI * engine.bore ** 2) / 4
    this.primaryArea = Math.max(1.65 * engine.exhaustArea, 0.16 * boreArea)
    this.impedance = EXHAUST_WAVE_SPEED / this.primaryArea
    this.primaryDelay = Math.max(
      1,
      Math.round(
        (2 * engine.exhaust.headerLength * SAMPLE_RATE) / EXHAUST_WAVE_SPEED,
      ),
    )
    this.finalDelay = Math.max(
      this.primaryDelay + 1,
      Math.round(
        (2 *
          engine.exhaust.headerLength *
          (1 + SECONDARY_LENGTH_RATIO) *
          SAMPLE_RATE) /
          EXHAUST_WAVE_SPEED,
      ),
    )
    // Longer and narrower primaries lose more wave amplitude. The bound
    // avoids making either end of the editor range an on/off switch.
    const diameter = Math.sqrt((4 * this.primaryArea) / Math.PI)
    this.attenuation = clamp(
      Math.exp((-0.012 * engine.exhaust.headerLength) / diameter),
      0.58,
      0.93,
    )
    const length = this.finalDelay + 2
    this.waves = Array.from(
      { length: this.cylinders },
      () => new Float64Array(length),
    )
    this.incident = new Float64Array(this.cylinders)
    this.delayed = new Float64Array(this.cylinders)
    this.returning = new Float64Array(this.cylinders)
    this.pairs = []
    const order = engine.firingOrder.map((c) => c - 1)
    const half = this.cylinders / 2
    for (let i = 0; i < half; i++) {
      const pair: [number, number] = [order[i], order[i + half]]
      this.pairs.push(pair)
    }
    this.pairWave = new Float64Array(this.pairs.length)
    this.signature = [
      engine.exhaust.pressureWaves,
      engine.exhaust.headerLength,
      engine.exhaust.collector,
      engine.exhaustArea,
      engine.bore,
      engine.firingOrder.join(','),
    ].join('|')
  }

  /** Pressure boundary for one exhaust valve, including bounded rarefaction. */
  backPressure(cylinder: number, mean: number) {
    if (!this.enabled) return mean
    return mean + clamp(this.returning[cylinder], -0.45 * mean, 1.2 * mean)
  }

  /** Pressure perturbation before the safety bound, for telemetry and tests. */
  wave(cylinder: number) {
    return this.enabled ? this.returning[cylinder] : 0
  }

  /**
   * Launch this sample's signed valve flows, kg/s, and scatter waves that
   * completed their round trip. Call once per 48 kHz engine step.
   */
  step(flow: ArrayLike<number>) {
    if (!this.enabled) return
    const size = this.waves[0].length
    const primaryRead = (this.write - this.primaryDelay + size) % size
    const finalRead = (this.write - this.finalDelay + size) % size
    for (let i = 0; i < this.cylinders; i++) {
      const line = this.waves[i]
      this.incident[i] = line[primaryRead]
      this.delayed[i] = line[finalRead]
      // Half the pressure/flow relation is the outward travelling wave.
      line[this.write] = 0.5 * this.impedance * flow[i]
      this.returning[i] = 0
    }
    if (this.engine.exhaust.collector === '4-2-1') this.triY()
    else this.fourIntoOne()
    this.write = (this.write + 1) % size
  }

  private fourIntoOne() {
    let sum = 0
    for (let i = 0; i < this.cylinders; i++) sum += this.incident[i]
    // Collector admittance in units of one primary. It grows with cylinder
    // count but is smaller than their total area, as a real merge collector.
    const collector = 0.72 * this.cylinders
    const junction = (2 * sum) / (this.cylinders + collector)
    for (let i = 0; i < this.cylinders; i++)
      this.returning[i] =
        (junction - this.incident[i]) * this.attenuation
  }

  private triY() {
    const secondary = 1.6
    // First reflection where two primaries enter one secondary.
    for (let p = 0; p < this.pairs.length; p++) {
      const [a, b] = this.pairs[p]
      const junction =
        (2 * (this.incident[a] + this.incident[b])) / (2 + secondary)
      this.returning[a] =
        (junction - this.incident[a]) * this.attenuation
      this.returning[b] =
        (junction - this.incident[b]) * this.attenuation
      this.pairWave[p] =
        (2 * (this.delayed[a] + this.delayed[b])) / (2 + secondary)
    }
    // The secondary waves meet at the final collector. Its larger outlet
    // makes the dominant return a rarefaction; that return splits equally
    // back into the paired primaries.
    let sum = 0
    for (let p = 0; p < this.pairWave.length; p++)
      sum += secondary * this.pairWave[p]
    const outlet = 0.9 * this.pairs.length * secondary
    const junction =
      (2 * sum) / (this.pairs.length * secondary + outlet)
    const backTransmission = (2 * secondary) / (2 + secondary)
    for (let p = 0; p < this.pairs.length; p++) {
      const reflected =
        (junction - this.pairWave[p]) *
        backTransmission *
        this.attenuation *
        this.attenuation
      const [a, b] = this.pairs[p]
      this.returning[a] += reflected
      this.returning[b] += reflected
    }
  }

  /** Carry the delay lines through a live edit when their geometry matches. */
  adopt(previous: FourStrokeExhaust) {
    if (
      !this.enabled ||
      !previous.enabled ||
      this.signature !== previous.signature ||
      this.waves[0].length !== previous.waves[0].length
    )
      return
    this.write = previous.write
    this.returning.set(previous.returning)
    for (let i = 0; i < this.waves.length; i++)
      this.waves[i].set(previous.waves[i])
  }
}
