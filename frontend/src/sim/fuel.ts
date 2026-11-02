import type { EngineDefinition, FuelGrade, FuelSystem } from './schema'
import { displacement } from './schema'
import { CP, R } from './physics'

/** Calibration constants; see docs/SIMULATION.md for their basis. */
const STOICHIOMETRIC = 14.7
/** Latent heat of gasoline evaporation, J/kg. */
const LATENT_HEAT = 350000

/**
 * Fuel properties. Octane is the research octane number used in the knock
 * correlation; E85's is a commonly quoted figure, and its stronger charge
 * cooling comes from its latent heat, not from the octane number.
 */
export const FUELS: Record<
  FuelGrade,
  {
    label: string
    octane: number
    /** Stoichiometric air–fuel ratio by mass. */
    stoichiometric: number
    /** Lower heating value, J/kg. */
    heating: number
    /** Oxygen needed to burn 1 kg of fuel, kg. */
    oxygen: number
    latent: number
    /** Laminar flame speed fit S_L0 = base + curve·(φ − peak)², m/s. */
    flame: { base: number; curve: number; peak: number }
  }
> = {
  ron91: gasoline('RON 91 regular', 91),
  ron95: gasoline('RON 95 premium', 95),
  ron98: gasoline('RON 98 super', 98),
  e85: {
    label: 'E85 ethanol blend',
    octane: 105,
    stoichiometric: 9.8,
    heating: 29.2e6,
    oxygen: (3.43 * 9.8) / STOICHIOMETRIC,
    latent: 850000,
    flame: { base: 0.36, curve: -1.0, peak: 1.11 },
  },
}
function gasoline(label: string, octane: number) {
  return {
    label,
    octane,
    stoichiometric: STOICHIOMETRIC,
    heating: 43e6,
    oxygen: 3.43,
    latent: LATENT_HEAT,
    // Metghalchi and Keck's fit for gasoline (indolene).
    flame: { base: 0.305, curve: -0.549, peak: 1.21 },
  }
}
/** Carburettors are jetted for standard dry air at 20 °C and 1,013.25 hPa. */
const JETTING_DENSITY = 101325 / (R * 293.15)
/** Venturi, booster and throttle-plate loss in throat dynamic heads, including pulsation. */
const VENTURI_LOSS = 0.6
/** Share of the ideal wall-film correction an ECU achieves. */
const ECU_CORRECTION = 0.85
/** Accelerator-pump fuel per full throttle opening, kg per m³ of displacement. */
const PUMP_SHOT = 0.185
const DIRECT_RAIL_PRESSURE = 15e6
const FUEL_DENSITY = 740
const AIRFLOW_LAG = 0.02
/** Time constant of the accelerator-pump squirt, s. */
const PUMP_SQUIRT = 0.15
const WARM_COOLANT = 353.15
/** Warm-idle airflow per m³ of displacement, kg/s: the film-time reference and primed starting film. */
const IDLE_AIRFLOW = 2

/** Wall-film share of injected fuel, film evaporation time (s) and evaporative cooling taken from the air. */
const transport = {
  carburettor: { film: 0.3, tau: 0.35, cooling: 0.25 },
  throttleBody: { film: 0.4, tau: 0.3, cooling: 0.25 },
  // Port injection is the calibration baseline: its evaporation off the
  // valve is already inside the 1.2.0 calibration.
  port: { film: 0.25, tau: 0.12, cooling: 0 },
  direct: { film: 0, tau: 0.12, cooling: 0.6 },
} as const

export type FuelTelemetry = {
  kind: FuelSystem['kind']
  /** Delivered λ of recent firing cylinders. */
  lambda: number
  /** Fuel entering the cylinders, kg/s. */
  fuelFlow: number
  misfire: boolean
  overrunCut: boolean
  /** Injection stopped by a fuel-cut rev limiter. */
  limiterCut: boolean
  /** Fuel held as liquid film on the intake walls, kg. */
  film: number
}

/**
 * Lumped fuel transport, after the x–τ wall-film model (Aquino, SAE 810494):
 * a share of the metered fuel wets the intake walls and evaporates later, so
 * mixture runs lean on tip-in and rich on lift-off. Advanced once per 48 kHz
 * step from the fresh air the cylinders drew over that step.
 */
export class FuelDelivery {
  readonly config: FuelSystem
  /** Fuel the cylinders receive per kg of fresh air over the next step. */
  fuelPerAir: number
  /** Charge-air temperature drop from fuel evaporating upstream of the valve, K. */
  manifoldCooling = 0
  /** Energy taken from the cylinder charge per kg of fresh air (direct injection), J/kg. */
  cylinderCooling = 0
  /** Carburettor venturi pressure loss ahead of the throttle (or compressor), Pa. */
  inletLoss = 0
  /** High-pressure pump torque taken from the crank, Nm. */
  crankTorque = 0
  overrunCut = false
  /** Set by the core while a fuel-cut rev limiter is active. */
  limiterCut = false
  film = 0
  airFlow = 0
  private vapour = 0
  private metered: number
  private injected: number
  private manifoldVolume: number
  private density: number
  private idleFlow: number
  private throatArea: number
  private pumpShot: number
  private previousThrottle = 0
  /** Accelerator-pump fuel still to squirt, kg. */
  private pumping = 0
  private latent: number

  constructor(engine: EngineDefinition, density: number) {
    const c = engine.fuelSystem
    const grade = FUELS[engine.combustion.fuel]
    this.config = c
    this.density = density
    this.metered = 1 / (grade.stoichiometric * engine.lambda)
    // Port injection's gasoline evaporation is inside the calibration, so
    // only the extra of a fuel with more latent heat cools a port charge.
    this.latent =
      c.kind === 'port'
        ? 0.5 * (grade.latent - LATENT_HEAT)
        : transport[c.kind].cooling * grade.latent
    // A fixed jet meters by volume: denser air runs leaner, thinner air richer.
    if (c.kind === 'carburettor')
      this.metered /= Math.sqrt(density / JETTING_DENSITY)
    this.injected = this.metered
    this.fuelPerAir = (1 - transport[c.kind].film) * this.metered
    this.manifoldVolume = displacement(engine)
    this.idleFlow = IDLE_AIRFLOW * this.manifoldVolume
    this.throatArea =
      c.kind === 'carburettor'
        ? c.chokes * Math.PI * (c.chokeDiameter / 2) ** 2
        : 0
    this.pumpShot =
      c.kind === 'carburettor' && c.acceleratorPump
        ? PUMP_SHOT * displacement(engine)
        : 0
    // Start primed, as a warm engine that has just been running: the walls
    // hold their warm-idle film and the manifold its vapour. Coolant set
    // cold lengthens the film time afterwards.
    const share = c.kind === 'carburettor' ? 0.65 : transport[c.kind].film
    const t = transport[c.kind]
    this.film = share * this.metered * this.idleFlow * t.tau
    this.vapour = share * this.metered * density * this.manifoldVolume
  }

  /**
   * @param airIn     fresh air drawn into the cylinders over the step, kg
   * @param throttle  driver throttle, before any idle air
   * @param manifold  intake manifold pressure and temperature
   */
  step(
    dt: number,
    rpm: number,
    omega: number,
    throttle: number,
    airIn: number,
    manifold: number,
    manifoldTemperature: number,
    coolant: number,
  ) {
    const c = this.config
    const t = transport[c.kind]
    this.airFlow += ((airIn / dt - this.airFlow) * dt) / AIRFLOW_LAG
    const flow = Math.max(0, this.airFlow)
    let film: number = t.film
    if (c.kind === 'carburettor') {
      // Slow air through an oversized venturi atomises poorly and wets more wall.
      const velocity = flow / (this.density * this.throatArea)
      film = 0.3 + 0.35 * Math.exp(-velocity / 40)
      this.inletLoss = Math.min(
        (VENTURI_LOSS * flow * flow) /
          (2 * this.density * this.throatArea ** 2),
        50000,
      )
    }
    const cold = Math.max(0, WARM_COOLANT - coolant)
    if (film > 0) film = Math.min(0.85, film * (1 + cold / 150))
    // Cold walls hold fuel longer; faster air strips the film sooner, so the
    // film time is quoted at warm idle and falls with the square root of flow.
    const tau =
      t.tau *
      (1 + cold / 40) *
      Math.sqrt(this.idleFlow / Math.max(flow, 0.1 * this.idleFlow))
    const air = Math.max(
      (manifold * this.manifoldVolume) / (R * manifoldTemperature),
      1e-6,
    )
    const vapourPerAir = this.vapour / air
    if (c.kind === 'carburettor') {
      this.injected = this.metered
      const opening = throttle - this.previousThrottle
      if (opening > 0) this.pumping += this.pumpShot * opening
    } else {
      if (c.overrunCut) {
        if (throttle < 0.01 && rpm > 1800) this.overrunCut = true
        else if (throttle >= 0.01 || rpm < 1400) this.overrunCut = false
      }
      const cut = this.overrunCut || this.limiterCut
      const command = cut ? 0 : this.metered
      // Inverse film model: inject what the wall will hold back or release.
      const ideal =
        film > 0 ? Math.max(0, (command - vapourPerAir) / (1 - film)) : command
      this.injected = cut
        ? 0
        : c.transientCorrection
          ? command + ECU_CORRECTION * (ideal - command)
          : command
    }
    this.previousThrottle = throttle
    // The pump squirts into the airstream, which wets the walls like the jets.
    const squirt = (this.pumping * dt) / PUMP_SQUIRT
    this.pumping -= squirt
    const evaporated = (this.film / tau) * dt
    this.film += film * (this.injected * airIn + squirt) - evaporated
    const drawn = Math.min(this.vapour, vapourPerAir * airIn)
    this.vapour += evaporated + (1 - film) * squirt - drawn
    this.fuelPerAir = (1 - film) * this.injected + this.vapour / air
    if (this.latent > 0) {
      const heat = this.latent * this.injected
      if (c.kind === 'direct') this.cylinderCooling = heat
      else this.manifoldCooling = heat / CP
    }
    if (c.kind === 'direct')
      this.crankTorque =
        (this.injected * flow * DIRECT_RAIL_PRESSURE) /
        FUEL_DENSITY /
        0.5 /
        Math.max(omega, 5)
  }

  /**
   * Carry the intake film and vapour over from a running engine's fuel system
   * of the same kind, so a live edit does not reset the mixture.
   */
  adopt(previous: FuelDelivery) {
    if (previous.config.kind !== this.config.kind) return
    this.film = previous.film
    this.vapour = previous.vapour
    this.airFlow = previous.airFlow
    this.overrunCut = previous.overrunCut
    this.limiterCut = previous.limiterCut
    this.pumping = previous.pumping
    this.previousThrottle = previous.previousThrottle
    this.inletLoss = previous.inletLoss
    this.fuelPerAir = previous.fuelPerAir
    this.injected = previous.injected
    this.manifoldCooling = previous.manifoldCooling
    this.cylinderCooling = previous.cylinderCooling
    this.crankTorque = previous.crankTorque
  }

  telemetry(lambda: number, misfire: boolean): FuelTelemetry {
    return {
      kind: this.config.kind,
      lambda,
      fuelFlow: this.fuelPerAir * Math.max(0, this.airFlow),
      misfire,
      overrunCut: this.overrunCut,
      limiterCut: this.limiterCut,
      film: this.film,
    }
  }
}

/** Mixture outside these limits does not ignite. */
export const LEAN_MISFIRE = 1.6
export const RICH_MISFIRE = 0.55
export { STOICHIOMETRIC }
