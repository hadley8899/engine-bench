import type { EngineDefinition, Exhaust } from './schema'

/**
 * Sound synthesis driven by the simulated engine state. It never feeds back
 * into the physics: pipes, filters and afterfire change only what is heard.
 * Every part is a fixed-cost, allocation-free filter so it can run per
 * 48 kHz sample in the AudioWorklet. See docs/SIMULATION.md (Sound).
 */
export const LISTENERS = ['tailpipe', 'bay', 'cell'] as const
export type Listener = (typeof LISTENERS)[number]

const FS = 48000
const DT = 1 / FS
const TAU = Math.PI * 2
/** Burned-gas ratio of specific heats and gas constant for sound speed. */
const SOUND_SPEED = (t: number) => Math.sqrt(1.33 * 287 * t)
/**
 * Header wall temperature above which unburned fuel can afterfire: a little
 * above petrol vapour's autoignition temperature in air (about 520–550 K).
 */
export const AFTERFIRE_TEMPERATURE = 600

/** Inputs the core gathers over one step; reused to avoid allocation. */
export class AcousticInput {
  /** Exhaust pulse source: port (or turbine) outflow, normalised by displacement. */
  exhaust = 0
  /** Flow-weighted gas temperature leaving the ports this step, K; 0 if none. */
  portTemperature = 0
  /** Intake runner flow into the cylinders, normalised like the exhaust. */
  intake = 0
  /** Effective throttle opening including the idle air, 0–1. */
  throttle = 0
  /** Manifold pressure divided by the supply ahead of the throttle. */
  manifoldRatio = 1
  /** Sum of cylinder pressures, Pa. */
  pressureSum = 0
  /** Valve seatings during this step. */
  valveSeats = 0
  /** Fuel leaving the ports unburned this step, as a share of a full charge. */
  unburned = 0
  rpm = 0
  /** Compressor or blower: 'none' for a naturally aspirated engine. */
  induction: 'none' | 'turbo' | 'centrifugal' | 'roots' = 'none'
  shaftHz = 0
  /** Boost relative to 1 bar, 0–1. */
  boost = 0
  venting = false
  /** Pressure being dumped by a blow-off valve or bypass, 0–1. */
  dump = 0
  surge = false
}

/** RBJ band-pass with 0 dB peak gain. */
class BandPass {
  private b0 = 0
  private a1 = 0
  private a2 = 0
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0
  constructor(hz: number, q: number) {
    this.tune(hz, q)
  }
  tune(hz: number, q: number) {
    const w = (TAU * Math.min(hz, FS * 0.45)) / FS
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b0 = alpha / a0
    this.a1 = (-2 * Math.cos(w)) / a0
    this.a2 = (1 - alpha) / a0
  }
  process(x: number) {
    const y =
      this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
  copy(other: BandPass) {
    Object.assign(this, other)
  }
}

class LowPass {
  private a: number
  y = 0
  constructor(hz: number) {
    this.a = 1 - Math.exp((-TAU * hz) / FS)
  }
  tune(hz: number) {
    this.a = 1 - Math.exp((-TAU * hz) / FS)
  }
  process(x: number) {
    return (this.y += this.a * (x - this.y))
  }
}

/** First-order DC blocker; also the open-end radiation (∝ d/dt of flow). */
class HighPass {
  private x1 = 0
  private y1 = 0
  private r: number
  constructor(r = 0.995) {
    this.r = r
  }
  process(x: number) {
    const y = x - this.x1 + this.r * this.y1
    this.x1 = x
    this.y1 = y
    return y
  }
}

const MASK = 4095
/**
 * A pipe as a feedback comb: the wave returns after one round trip,
 * scaled by both end reflections and damped by wall losses. A negative
 * product (closed-ish port against an open junction) gives quarter-wave
 * resonances; a positive one (open at both ends) gives half-wave ones.
 */
class Pipe {
  readonly buffer = new Float32Array(MASK + 1)
  write = 0
  damp = 0
  /** Round-trip delay in samples. */
  delay = 64
  private reflection: number
  private loss: LowPass
  constructor(reflection: number, loss: LowPass) {
    this.reflection = reflection
    this.loss = loss
  }
  setLength(metres: number, temperature: number) {
    this.delay = Math.min(
      MASK - 2,
      Math.max(2, (2 * metres * FS) / SOUND_SPEED(temperature)),
    )
  }
  setReflection(r: number) {
    this.reflection = r
  }
  process(x: number) {
    const position = this.write - this.delay
    const i = Math.floor(position)
    const frac = position - i
    const a = this.buffer[i & MASK]
    const delayed = a + (this.buffer[(i + 1) & MASK] - a) * frac
    this.damp = this.loss.process(delayed)
    const y = x + this.reflection * this.damp
    this.buffer[this.write] = y
    this.write = (this.write + 1) & MASK
    return y
  }
  copy(other: Pipe) {
    this.buffer.set(other.buffer)
    this.write = other.write
    this.damp = other.damp
    this.delay = other.delay
    this.loss.y = other.loss.y
  }
}

/** Small Schroeder room: four damped combs into two all-passes. */
class Room {
  private combs = [1687, 1601, 2053, 2251].map((n) => ({
    buffer: new Float32Array(n),
    index: 0,
    damp: 0,
  }))
  private passes = [605, 480].map((n) => ({
    buffer: new Float32Array(n),
    index: 0,
  }))
  process(x: number) {
    let sum = 0
    for (const c of this.combs) {
      const out = c.buffer[c.index]
      c.damp += 0.35 * (out - c.damp)
      c.buffer[c.index] = x + 0.8 * c.damp
      c.index = (c.index + 1) % c.buffer.length
      sum += out
    }
    let y = sum * 0.25
    for (const p of this.passes) {
      const out = p.buffer[p.index]
      p.buffer[p.index] = y + 0.5 * out
      p.index = (p.index + 1) % p.buffer.length
      y = out - 0.5 * y
    }
    return y
  }
  copy(other: Room) {
    this.combs.forEach((c, i) => {
      c.buffer.set(other.combs[i].buffer)
      c.index = other.combs[i].index
      c.damp = other.combs[i].damp
    })
    this.passes.forEach((p, i) => {
      p.buffer.set(other.passes[i].buffer)
      p.index = other.passes[i].index
    })
  }
}

/** Relative levels of each source at a listening position, and room reverb. */
const MIX: Record<
  Listener,
  { exhaust: number; muffled: number; intake: number; mechanical: number; induction: number; wet: number }
> = {
  tailpipe: { exhaust: 1, muffled: 0, intake: 0.12, mechanical: 0.08, induction: 0.35, wet: 0.06 },
  bay: { exhaust: 0, muffled: 0.5, intake: 1, mechanical: 1, induction: 1, wet: 0.05 },
  cell: { exhaust: 0.6, muffled: 0.2, intake: 0.45, mechanical: 0.4, induction: 0.6, wet: 0.45 },
}

/** Silencer character: gain, high-frequency cut and tailpipe reflection. */
const SILENCERS = {
  straight: { gain: 0.55, cutoff: 9000, chamber: 0, reflection: 0.55 },
  absorptive: { gain: 0.75, cutoff: 1600, chamber: 0, reflection: 0.45 },
  chambered: { gain: 0.6, cutoff: 900, chamber: 0.7, reflection: 0.35 },
} as const

export class Acoustics {
  listener: Listener = 'tailpipe'
  /** True for about 0.2 s after an afterfire, for display. */
  afterfire = false
  /** Afterfires since this sound state began. */
  afterfires = 0
  /** Lumped header wall temperature, K. */
  wallTemperature: number
  private exhaust!: Exhaust
  private pipeTemperature: number
  private header = new Pipe(-0.55, new LowPass(5000))
  private secondary = new Pipe(-0.4, new LowPass(5000))
  private tailpipe = new Pipe(0.35, new LowPass(3000))
  private chamber = new Float32Array(MASK + 1)
  private chamberWrite = 0
  private chamberDelay = 64
  private catalyst = new LowPass(2500)
  private silencer = new LowPass(900)
  private radiation = new HighPass()
  private firewall = new LowPass(450)
  private intakeDc = new HighPass(0.998)
  private intakeDelay = new Float32Array(96)
  private intakeWrite = 0
  private intakeResonance = new BandPass(150, 4)
  private intakeBody = new LowPass(1400)
  private hiss = new BandPass(3500, 1.2)
  private valvetrain = new BandPass(3400, 12)
  private block = new BandPass(1800, 2)
  private flutterBand = new BandPass(500, 1.5)
  /** Blow-off jet: darkened noise through a band that falls as it empties. */
  private ventDark = new LowPass(1800)
  private ventBand = new BandPass(1100, 1.1)
  private ventRumble = new LowPass(260)
  /** Slow random turbulence that keeps the jet from sounding like static. */
  private turbulence = new LowPass(18)
  private chuffBand = new LowPass(220)
  private thumpPhase = 0
  private room = new Room()
  private output = new HighPass()
  private pressure1 = 0
  private pressure2 = 0
  private unburned = 0
  private pop = 0
  private popAge = 1
  private whinePhase = 0
  private flutterPhase = 0
  private surgeLevel = 0
  private ventSound = 0
  private chuff = 0
  private wasVenting = false
  private counter = 0
  private noise = 0x2545f491
  private gain = 1
  private chamberGain = 0
  private runnerLength = 0.3

  constructor(engine: EngineDefinition, ambient: number) {
    this.wallTemperature = ambient
    this.pipeTemperature = Math.max(ambient, 500)
    this.configure(engine)
  }
  /** Applies an edited definition; filter and pipe state are kept. */
  configure(engine: EngineDefinition) {
    this.exhaust = engine.exhaust
    const s = SILENCERS[engine.exhaust.silencer]
    this.gain = s.gain * (engine.exhaust.catalyst ? 0.8 : 1)
    this.silencer.tune(s.cutoff)
    this.chamberGain = s.chamber
    this.tailpipe.setReflection(s.reflection)
    this.runnerLength = engine.intakeRunnerLength
    // Airbox and inlet add to the runner's effective quarter-wave length.
    this.intakeResonance.tune(343 / (4 * (engine.intakeRunnerLength + 0.25)), 4)
    this.retune()
  }
  /** Pipe delays follow the exhaust gas temperature (speed of sound). */
  private retune() {
    const hot = Math.max(300, 0.85 * this.pipeTemperature)
    const cool = Math.max(300, 0.55 * this.pipeTemperature)
    this.header.setLength(this.exhaust.headerLength, hot)
    this.secondary.setLength(this.exhaust.headerLength * 0.6, hot)
    this.tailpipe.setLength(this.exhaust.tailpipeLength, cool)
    // A 0.35 m expansion chamber: its round trip cancels the quarter-wave
    // frequency and odd multiples, while low frequencies pass.
    this.chamberDelay = (2 * 0.35 * FS) / SOUND_SPEED(cool)
  }
  adopt(previous: Acoustics) {
    this.listener = previous.listener
    this.afterfire = previous.afterfire
    this.afterfires = previous.afterfires
    this.wallTemperature = previous.wallTemperature
    this.pipeTemperature = previous.pipeTemperature
    this.header.copy(previous.header)
    this.secondary.copy(previous.secondary)
    this.tailpipe.copy(previous.tailpipe)
    this.chamber.set(previous.chamber)
    this.chamberWrite = previous.chamberWrite
    this.intakeDelay.set(previous.intakeDelay)
    this.intakeWrite = previous.intakeWrite
    // Low-pass coefficients belong to the new definition; only state is copied.
    for (const key of [
      'catalyst',
      'silencer',
      'firewall',
      'intakeBody',
      'chuffBand',
      'ventDark',
      'ventRumble',
      'turbulence',
    ] as const)
      this[key].y = previous[key].y
    for (const key of ['radiation', 'intakeDc', 'output'] as const)
      Object.assign(this[key], previous[key])
    for (const key of [
      'intakeResonance',
      'hiss',
      'valvetrain',
      'block',
      'flutterBand',
      'ventBand',
    ] as const)
      this[key].copy(previous[key])
    this.room.copy(previous.room)
    this.pressure1 = previous.pressure1
    this.pressure2 = previous.pressure2
    this.unburned = previous.unburned
    this.pop = previous.pop
    this.popAge = previous.popAge
    this.whinePhase = previous.whinePhase
    this.flutterPhase = previous.flutterPhase
    this.surgeLevel = previous.surgeLevel
    this.ventSound = previous.ventSound
    this.chuff = previous.chuff
    this.thumpPhase = previous.thumpPhase
    this.wasVenting = previous.wasVenting
    this.counter = previous.counter
    this.noise = previous.noise
    this.retune()
    // Re-apply the new definition's settings to the copied filters.
    this.intakeResonance.tune(343 / (4 * (this.runnerLength + 0.25)), 4)
  }
  /** Deterministic white noise, −0.5 to 0.5, independent of host and batching. */
  private white() {
    this.noise ^= this.noise << 13
    this.noise ^= this.noise >>> 17
    this.noise ^= this.noise << 5
    return (this.noise >>> 0) / 4294967296 - 0.5
  }

  process(input: AcousticInput) {
    if (input.portTemperature > 0)
      this.pipeTemperature +=
        (input.portTemperature - this.pipeTemperature) * DT * 2
    if (++this.counter >= 64) {
      this.counter = 0
      this.retune()
    }
    // The header wall follows its gas with a few seconds' lag.
    this.wallTemperature +=
      (this.pipeTemperature - this.wallTemperature) * (DT / 3)
    const exhaust = this.exhaustPath(input)
    const intake = this.intakePath(input)
    const mechanical = this.mechanicalPath(input)
    const induction = this.inductionPath(input)
    const mix = MIX[this.listener]
    const dry =
      exhaust * mix.exhaust +
      this.firewall.process(exhaust) * mix.muffled +
      intake * mix.intake +
      mechanical * mix.mechanical +
      induction * mix.induction
    const wet = this.room.process(dry)
    const out = this.output.process(dry + wet * mix.wet)
    return Math.tanh(out * 2) * 0.65
  }

  /** Port pulses and afterfire through header, collector, catalyst, silencer and tailpipe. */
  private exhaustPath(input: AcousticInput) {
    let source = input.exhaust
    // Unburned fuel collects in the exhaust and leaves with the flow
    // (about 0.1 s). A hot wall or the next firing's flame can light it.
    this.unburned = this.unburned * (1 - DT / 0.1) + input.unburned
    if (this.unburned > 0.02 && this.wallTemperature > AFTERFIRE_TEMPERATURE) {
      const heat = Math.min(1, (this.wallTemperature - AFTERFIRE_TEMPERATURE) / 300)
      const flame = input.portTemperature > 1100 ? 8 : 1
      const rate = 25 * heat * flame
      if (this.white() + 0.5 < rate * DT) {
        this.pop = Math.min(1.6, 0.9 * Math.sqrt(this.unburned))
        this.popAge = 0
        this.afterfires++
        this.unburned = 0
      }
    }
    if (this.pop > 1e-4) {
      // A sharp pressure step that rings briefly, then rides on the flow.
      source += this.pop * (0.55 + this.white())
      this.pop *= 1 - DT / 0.004
    }
    this.popAge += DT
    this.afterfire = this.popAge < 0.2
    let wave = this.header.process(source)
    if (this.exhaust.collector === '4-2-1') wave = this.secondary.process(wave)
    if (this.exhaust.catalyst) wave = this.catalyst.process(wave)
    if (this.chamberGain > 0) {
      const position = this.chamberWrite - this.chamberDelay
      const i = Math.floor(position)
      const frac = position - i
      const a = this.chamber[i & MASK]
      const delayed = a + (this.chamber[(i + 1) & MASK] - a) * frac
      this.chamber[this.chamberWrite] = wave
      this.chamberWrite = (this.chamberWrite + 1) & MASK
      wave = (wave + this.chamberGain * delayed) / (1 + this.chamberGain)
    }
    wave = this.silencer.process(wave)
    wave = this.tailpipe.process(wave)
    // The open end radiates the rate of change of flow.
    return this.radiation.process(wave) * this.gain * 4
  }

  /** Induction roar through the runner and airbox, plus throttle hiss. */
  private intakePath(input: AcousticInput) {
    const pulses = this.intakeDc.process(input.intake)
    const open = 0.2 + 0.8 * input.throttle
    const roar =
      (this.intakeResonance.process(pulses) * 0.6 +
        this.intakeBody.process(pulses) * 0.25) *
      open
    // A nearly closed plate passes sonic flow, which hisses.
    const throttled = Math.max(0, 0.6 - input.manifoldRatio) / 0.6
    const hiss =
      this.hiss.process(this.white()) *
      Math.min(1, Math.abs(input.intake) * 4) *
      throttled *
      0.2
    // The inlet sits about 0.7 m further from the tailpipe than the
    // engine; the delay keeps its pulses from simply cancelling the exhaust's.
    this.intakeDelay[this.intakeWrite] = roar + hiss
    this.intakeWrite = (this.intakeWrite + 1) % this.intakeDelay.length
    return this.intakeDelay[this.intakeWrite]
  }

  /** Valve seating ticks and combustion noise through the block. */
  private mechanicalPath(input: AcousticInput) {
    const speed = Math.min(2, input.rpm / 6000)
    const tick = this.valvetrain.process(
      input.valveSeats * (0.05 + 0.6 * speed * speed),
    )
    // The second difference of pressure stands in for the rate of pressure rise.
    const p = input.pressureSum
    const rise = (p - 2 * this.pressure1 + this.pressure2) / 2e5
    this.pressure2 = this.pressure1
    this.pressure1 = p
    const combustion = this.block.process(rise) * 0.8
    return tick * 3 + combustion * 5
  }

  /** Compressor whistle or blower whine, blow-off, bypass and surge flutter. */
  private inductionPath(input: AcousticInput) {
    if (input.induction === 'none') return 0
    const roots = input.induction === 'roots'
    // Roots: three-lobe rotor pair; centrifugal wheels: shaft rate.
    const hz = roots ? input.shaftHz * 6 : input.shaftHz
    this.whinePhase = (this.whinePhase + ((hz * DT) % 1)) % 1
    const loud = 0.15 + 0.85 * input.boost
    let sound = 0
    if (hz < 18000)
      sound +=
        (Math.sin(TAU * this.whinePhase) * 0.06 +
          Math.sin(2 * TAU * this.whinePhase) * (roots ? 0.04 : 0.02)) *
        loud
    // Blow-off: a deep thump as the valve snaps open, then a jet of air.
    // The jet's pitch tracks the pressure behind it, so it starts higher and
    // falls as the charge pipe empties; turbulence makes it uneven.
    if (input.venting && !this.wasVenting) {
      this.chuff = Math.min(1, input.dump * 2)
      this.thumpPhase = 0
    }
    this.wasVenting = input.venting
    this.chuff *= 1 - DT / 0.045
    const target = input.venting ? 0.5 * Math.min(1, input.dump) : 0
    this.ventSound +=
      (target - this.ventSound) * (target > this.ventSound ? 0.01 : 0.0003)
    const white = this.white()
    if (this.ventSound > 1e-4 || this.chuff > 1e-4) {
      const dark = this.ventDark.process(white)
      this.ventBand.tune(450 + 1300 * Math.min(1, this.ventSound * 2), 1.1)
      const swirl = 0.55 + 2.2 * Math.abs(this.turbulence.process(white))
      const jet =
        (this.ventBand.process(dark) * 2.2 + this.ventRumble.process(white) * 1.6) *
        swirl
      sound += jet * this.ventSound
      // Thump: a falling 70 Hz pulse plus low-passed noise.
      this.thumpPhase += (70 * (0.6 + 0.4 * this.chuff)) * DT
      sound +=
        (Math.sin(TAU * this.thumpPhase) * 0.35 +
          this.chuffBand.process(white) * 3) *
        this.chuff
    } else {
      // Keep the filters settled while silent.
      this.ventDark.process(0)
      this.ventRumble.process(0)
      this.turbulence.process(white)
    }
    // Surge with nowhere to vent: air chops back through the wheel.
    this.surgeLevel += ((input.surge ? 1 : 0) - this.surgeLevel) * DT * 12
    if (this.surgeLevel > 1e-3) {
      const rate = 12 + input.shaftHz * 0.006
      this.flutterPhase = (this.flutterPhase + rate * DT) % 1
      const chop = Math.max(0, Math.sin(TAU * this.flutterPhase)) ** 3
      sound += this.flutterBand.process(white) * chop * this.surgeLevel * 2.5
    }
    return sound
  }
}
