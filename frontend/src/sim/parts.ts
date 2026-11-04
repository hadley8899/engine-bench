/**
 * Engine parts, their estimated limits and the stress and failure model.
 * Every limit here is a labelled estimate calibrated to this model's own
 * pressures and temperatures, not a specification for a real part; see
 * docs/SIMULATION.md ("Parts, stress and failures").
 */
import type { EngineDefinition, Parts } from './schema'
import { rpmToOmega } from './physics'

/** Piston assembly (piston, pin, rings) mass per bore³, kg/m³: 0.47 kg at 86 mm. */
const PISTON_DENSITY = 740
/** Connecting-rod mass per bore² × rod length, kg/m³: 0.6 kg for 86 mm × 143 mm. */
const ROD_DENSITY = 567
/** Stock rods carry this multiple of their tension at the build's mechanical limit. */
const STOCK_TENSION_MARGIN = 1.25
/** Knock pressure oscillation: effective peak pressure × (1 + this × intensity). */
const KNOCK_SPIKE = 1.5
/** Turbine inlet temperature limit, K (1,100 °C). */
const TURBINE_LIMIT = 1373
/** Compressor wheels burst at this multiple of their rated shaft speed. */
const BURST_MARGIN = 1.12
/**
 * Exposure: a limit exceeded by 10% for `hold` seconds fails the part; 30%
 * over fails it three times as fast. Below the limit exposure falls back
 * over this many seconds, so brief excursions are survivable.
 */
const OVERLOAD = 0.1
const RECOVERY = 20

type Choice<T extends string> = Record<
  T,
  { label: string; description: string; [property: string]: string | number }
>
export const PISTONS = {
  cast: {
    label: 'Cast',
    description: 'Cheap and light. The weakest against heat and knock.',
    mass: 1,
    crown: 710,
    knock: 0.06,
  },
  hypereutectic: {
    label: 'Hypereutectic',
    description:
      'High-silicon cast: lighter and takes more heat, but brittle under knock.',
    mass: 0.95,
    crown: 725,
    knock: 0.045,
  },
  forged: {
    label: 'Forged',
    description:
      'Forged 2618 alloy: heavier, keeps its strength when hot and survives far more knock.',
    mass: 1.06,
    crown: 770,
    knock: 0.13,
  },
} satisfies Choice<Parts['pistons']>
export const RODS = {
  stock: {
    label: 'Stock',
    description:
      'Cast or powder-forged, rated for the build’s mechanical limit.',
    mass: 1,
    /** Compressive (buckling) limit as gas pressure on the piston, Pa. */
    compression: 140e5,
    /** Tensile limit relative to stock. */
    tension: 1,
  },
  forgedI: {
    label: 'Forged I-beam',
    description: 'Forged steel: a little lighter and much stronger.',
    mass: 0.95,
    compression: 190e5,
    tension: 1.4,
  },
  hBeam: {
    label: 'H-beam',
    description:
      'Heavy-duty H-section: the strongest in compression and tension, but heavier.',
    mass: 1.1,
    compression: 230e5,
    tension: 1.65,
  },
} satisfies Choice<Parts['rods']>
export const HEAD_GASKETS = {
  composite: {
    label: 'Composite',
    description: 'Fibre-faced: seals easily but clamps the least pressure.',
    /** Peak cylinder pressure held with standard bolts, Pa. */
    clamp: 125e5,
  },
  mls: {
    label: 'Multi-layer steel',
    description: 'The usual modern gasket.',
    clamp: 150e5,
  },
  copper: {
    label: 'Copper, O-ringed',
    description: 'Solid copper with wire rings for high boost.',
    clamp: 180e5,
  },
} satisfies Choice<Parts['headGasket']>
export const HEAD_FASTENERS = {
  bolts: {
    label: 'Stretch bolts',
    description: 'Standard torque-to-yield head bolts.',
    factor: 1,
  },
  studs: {
    label: 'Head studs',
    description: 'Stronger studs clamp the gasket 20% harder.',
    factor: 1.2,
  },
} satisfies Choice<Parts['headFasteners']>
export const VALVE_SPRINGS = {
  stock: {
    label: 'Stock',
    description: 'Valves float about 8% above the build’s mechanical limit.',
    /** Float speed as a multiple of the build's mechanical limit. */
    float: 1.08,
    /** Extra friction mean effective pressure from stiffer springs, Pa. */
    friction: 0,
  },
  uprated: {
    label: 'Uprated',
    description: 'Stiffer springs float about 20% higher, for a little friction.',
    float: 1.2,
    friction: 2500,
  },
  race: {
    label: 'Race',
    description:
      'Very stiff springs float about a third higher, at a noticeable friction cost.',
    float: 1.33,
    friction: 6000,
  },
} satisfies Choice<Parts['valveSprings']>

/** Reciprocating and rotating masses of one cylinder's parts, kg. */
export function partMasses(e: EngineDefinition, parts: Parts = e.parts) {
  const piston = PISTON_DENSITY * e.bore ** 3 * PISTONS[parts.pistons].mass
  const rod = ROD_DENSITY * e.bore ** 2 * e.rodLength * RODS[parts.rods].mass
  // A third of the rod moves with the piston; the rest rotates with the pin.
  return { reciprocating: piston + rod / 3, rotating: (2 * rod) / 3 }
}
/**
 * Crank inertia added by parts heavier (or lighter) than stock. Stock parts
 * add nothing, so builds keep their results; reciprocating mass counts
 * half, its mean over a revolution.
 */
export function partsInertia(e: EngineDefinition) {
  const fitted = partMasses(e)
  const stock = partMasses(e, { ...e.parts, pistons: 'cast', rods: 'stock' })
  const r = e.stroke / 2
  return (
    e.cylinders *
    r *
    r *
    (0.5 * (fitted.reciprocating - stock.reciprocating) +
      (fitted.rotating - stock.rotating))
  )
}

export type LimitKey =
  | 'rodCompression'
  | 'rodTension'
  | 'crown'
  | 'knock'
  | 'headGasket'
  | 'valveFloat'
  | 'turboSpeed'
  | 'turbineTemperature'
export type StressLimit = {
  key: LimitKey
  label: string
  /** Worst cylinder's value as a share of its limit. */
  ratio: number
  /** 1-based cylinder, or null for limits shared by the engine. */
  cylinder: number | null
  /** Progress towards failure, 0–1. */
  exposure: number
  value: number
  limit: number
}
export type Failure = {
  key: LimitKey
  cylinder: number | null
  title: string
  detail: string
  time: number
}
export type StressTelemetry = {
  limits: StressLimit[]
  failure: Failure | null
  indestructible: boolean
}

const LABELS: Record<LimitKey, string> = {
  rodCompression: 'Rod compression',
  rodTension: 'Rod tension',
  crown: 'Piston crown',
  knock: 'Piston knock',
  headGasket: 'Head gasket',
  valveFloat: 'Valve float',
  turboSpeed: 'Turbo speed',
  turbineTemperature: 'Turbine inlet',
}
const HOLD: Record<LimitKey, number> = {
  rodCompression: 0.4,
  rodTension: 0.4,
  crown: 2,
  knock: 3,
  headGasket: 1.5,
  valveFloat: 1,
  turboSpeed: 2,
  turbineTemperature: 5,
}
const PER_CYLINDER: Record<LimitKey, boolean> = {
  rodCompression: true,
  rodTension: true,
  crown: true,
  knock: true,
  headGasket: true,
  valveFloat: false,
  turboSpeed: false,
  turbineTemperature: false,
}
/** Display a limit's value and its limit in the units the bench uses. */
export function formatLimit(key: LimitKey, value: number) {
  switch (key) {
    case 'rodCompression':
    case 'rodTension':
      return `${(value / 1000).toFixed(1)} kN`
    case 'crown':
    case 'turbineTemperature':
      return `${Math.round(value - 273.15)} °C`
    case 'knock':
      return `${Math.round(value * 100)}% of the charge`
    case 'headGasket':
      return `${(value / 1e5).toFixed(0)} bar`
    case 'valveFloat':
    case 'turboSpeed':
      return `${Math.round(value).toLocaleString('en-GB')} RPM`
  }
}

/**
 * Per-cylinder loads from the simulated gas and crank speed, compared with
 * the fitted parts' limits. It observes the engine; the core stops the
 * engine when it reports a failure.
 */
export class Stress {
  /** Running extremes of the current cycle, per cylinder. */
  readonly peak = new Float64Array(4)
  readonly compression = new Float64Array(4)
  readonly tension = new Float64Array(4)
  /** Extremes of each cylinder's last completed cycle. */
  private lastPeak = new Float64Array(4)
  private lastCompression = new Float64Array(4)
  private lastTension = new Float64Array(4)
  /** Reciprocating mass × crank radius, kg·m, and crank radius / rod length. */
  readonly inertiaForce: number
  readonly rodRatio: number
  private limit: Record<LimitKey, number>
  private keys: LimitKey[]
  private ratio = new Map<LimitKey, Float64Array>()
  private value = new Map<LimitKey, Float64Array>()
  private exposure = new Map<LimitKey, Float64Array>()
  failure: Failure | null = null
  private parts: Parts

  constructor(e: EngineDefinition) {
    const parts = (this.parts = e.parts)
    const area = (Math.PI * e.bore ** 2) / 4
    const r = e.stroke / 2
    this.rodRatio = r / e.rodLength
    this.inertiaForce = partMasses(e).reciprocating * r
    // Stock rods are rated for the build's mechanical limit with stock pistons.
    const stockMass = partMasses(e, {
      ...parts,
      pistons: 'cast',
      rods: 'stock',
    }).reciprocating
    const top = rpmToOmega(e.mechanicalLimit)
    const stockTension =
      stockMass * r * top * top * (1 + this.rodRatio) * STOCK_TENSION_MARGIN
    const induction = e.induction
    this.limit = {
      rodCompression: RODS[parts.rods].compression * area,
      rodTension: stockTension * RODS[parts.rods].tension,
      crown: PISTONS[parts.pistons].crown,
      knock: PISTONS[parts.pistons].knock,
      headGasket:
        HEAD_GASKETS[parts.headGasket].clamp *
        HEAD_FASTENERS[parts.headFasteners].factor,
      valveFloat: e.mechanicalLimit * VALVE_SPRINGS[parts.valveSprings].float,
      turboSpeed:
        induction.kind === 'turbo' || induction.kind === 'centrifugal'
          ? induction.maxShaftRpm * BURST_MARGIN
          : 0,
      turbineTemperature: TURBINE_LIMIT,
    }
    this.keys = (Object.keys(LABELS) as LimitKey[]).filter(
      (k) =>
        (k !== 'turboSpeed' || this.limit.turboSpeed > 0) &&
        (k !== 'turbineTemperature' || induction.kind === 'turbo'),
    )
    for (const k of this.keys) {
      this.ratio.set(k, new Float64Array(4))
      this.value.set(k, new Float64Array(4))
      this.exposure.set(k, new Float64Array(4))
    }
  }
  /** Fold a cylinder's finished cycle in and start the next. */
  closeCycle(i: number) {
    this.lastPeak[i] = this.peak[i]
    this.lastCompression[i] = this.compression[i]
    this.lastTension[i] = this.tension[i]
    this.peak[i] = 0
    this.compression[i] = 0
    this.tension[i] = 0
  }
  /**
   * Compare the latest loads with the limits and advance each part's
   * exposure over dt. Returns a failure once one occurs, unless failures
   * are disabled.
   */
  update(
    dt: number,
    time: number,
    rpm: number,
    crown: number[],
    knock: number[],
    shaftRpm: number,
    turbineTemperature: number,
    indestructible: boolean,
  ) {
    // The loads at the moment of failure stay on show.
    if (this.failure) return this.failure
    for (const k of this.keys) {
      const values = this.value.get(k)!
      const ratios = this.ratio.get(k)!
      const exposure = this.exposure.get(k)!
      const count = PER_CYLINDER[k] ? 4 : 1
      for (let i = 0; i < count; i++) {
        let v: number
        switch (k) {
          case 'rodCompression':
            v = this.lastCompression[i]
            break
          case 'rodTension':
            v = this.lastTension[i]
            break
          case 'crown':
            v = crown[i]
            break
          case 'knock':
            v = knock[i]
            break
          case 'headGasket':
            v = this.lastPeak[i] * (1 + KNOCK_SPIKE * knock[i])
            break
          case 'valveFloat':
            v = rpm
            break
          case 'turboSpeed':
            v = shaftRpm
            break
          case 'turbineTemperature':
            v = turbineTemperature
            break
        }
        values[i] = v
        const ratio = v / this.limit[k]
        ratios[i] = ratio
        exposure[i] =
          ratio > 1
            ? exposure[i] + ((ratio - 1) / OVERLOAD) * (dt / HOLD[k])
            : Math.max(0, exposure[i] - dt / RECOVERY)
        if (exposure[i] >= 1) {
          exposure[i] = 1
          if (!indestructible && !this.failure)
            this.failure = this.describe(k, PER_CYLINDER[k] ? i + 1 : null, v, rpm, time)
        }
      }
    }
    return this.failure
  }
  /** Worst cylinder's value as a share of its limit across every limit. */
  worst() {
    let worst = 0
    for (const k of this.keys)
      for (const r of this.ratio.get(k)!) worst = Math.max(worst, r)
    return worst
  }
  telemetry(indestructible: boolean): StressTelemetry {
    return {
      limits: this.keys.map((key) => {
        const ratios = this.ratio.get(key)!
        let worst = 0
        const count = PER_CYLINDER[key] ? 4 : 1
        for (let i = 1; i < count; i++) if (ratios[i] > ratios[worst]) worst = i
        return {
          key,
          label: LABELS[key],
          ratio: ratios[worst],
          cylinder: PER_CYLINDER[key] ? worst + 1 : null,
          exposure: Math.max(...this.exposure.get(key)!.slice(0, count)),
          value: this.value.get(key)![worst],
          limit: this.limit[key],
        }
      }),
      failure: this.failure,
      indestructible,
    }
  }
  adopt(previous: Stress) {
    this.failure = previous.failure
    this.peak.set(previous.peak)
    this.compression.set(previous.compression)
    this.tension.set(previous.tension)
    this.lastPeak.set(previous.lastPeak)
    this.lastCompression.set(previous.lastCompression)
    this.lastTension.set(previous.lastTension)
    // Exposure is kept for limits both builds have; a stronger part keeps
    // the overload so far but now exceeds a higher limit.
    for (const k of this.keys) {
      const old = previous.exposure.get(k)
      if (old) this.exposure.get(k)!.set(old)
    }
  }
  private describe(
    key: LimitKey,
    cylinder: number | null,
    value: number,
    rpm: number,
    time: number,
  ): Failure {
    const where = cylinder ? `Cylinder ${cylinder}: ` : ''
    const limit = formatLimit(key, this.limit[key])
    const shown = formatLimit(key, value)
    const p = this.parts
    const piston = PISTONS[p.pistons].label.toLowerCase()
    const rods = RODS[p.rods].label.toLowerCase()
    const at = `${Math.round(rpm).toLocaleString('en-GB')} RPM`
    const text: Record<LimitKey, [string, string]> = {
      rodCompression: [
        'Bent connecting rod',
        `${where}the gas force at ${at} (${shown}) exceeded the ${rods} rod’s estimated buckling limit of ${limit}.`,
      ],
      rodTension: [
        'Broken connecting rod',
        `${where}the inertia load at ${at} (${shown}) exceeded the ${rods} rod’s estimated tensile limit of ${limit}. The rod let go.`,
      ],
      crown: [
        'Holed piston',
        `${where}the crown reached ${shown}, beyond the ${piston} piston’s estimated limit of ${limit}, and burned through.`,
      ],
      knock: [
        'Cracked piston',
        `${where}sustained knock, with ${shown} still unburned at onset, beyond the ${limit} that ${piston} pistons are estimated to tolerate, cracked the ring land.`,
      ],
      headGasket: [
        'Lifted head gasket',
        `${where}peak pressure with knock spikes (${shown}) exceeded the estimated clamp of a ${HEAD_GASKETS[p.headGasket].label.toLowerCase()} gasket with ${HEAD_FASTENERS[p.headFasteners].label.toLowerCase()} (${limit}).`,
      ],
      valveFloat: [
        'Valve hit a piston',
        `The valves floated at ${shown} with ${VALVE_SPRINGS[p.valveSprings].label.toLowerCase()} springs (estimated float speed ${limit}), and a valve met a piston.`,
      ],
      turboSpeed: [
        'Compressor wheel burst',
        `The shaft reached ${shown}, beyond the estimated burst speed of ${limit}.`,
      ],
      turbineTemperature: [
        'Turbine overheated',
        `Exhaust entering the turbine reached ${shown}, beyond the estimated limit of ${limit}, and cracked the housing.`,
      ],
    }
    return { key, cylinder, title: text[key][0], detail: text[key][1], time }
  }
}
