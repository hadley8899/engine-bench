import { conditionsSchema, displacement, validateEngine } from './schema'
import type {
  Conditions,
  EngineDefinition,
  FuelGrade,
  Pascals,
  RadiansPerSecond,
} from './schema'
import { InductionSystem } from './induction'
import { Acoustics, AcousticInput } from './acoustics'
import type { Listener } from './acoustics'
import { validateRoad, Vehicle } from './road'
import type { Road } from './road'
import type { InductionTelemetry } from './induction'
import { FUELS, FuelDelivery, LEAN_MISFIRE, RICH_MISFIRE } from './fuel'
import type { FuelTelemetry } from './fuel'
import {
  atmosphere,
  clamp,
  CYCLE,
  enthalpy,
  geometry,
  internalEnergy,
  massFlow,
  omegaToRpm,
  powerKw,
  R,
  rpmToOmega,
  temperatureFromEnergy,
  wiebe,
  wrap,
} from './physics'

/** Calibration constants; see docs/SIMULATION.md for their basis. */
const EXHAUST_BACKFLOW_TEMPERATURE = 650
const WALL_HEAT = 3
const WALL_ABOVE_COOLANT = 80
const FMEP_STATIC = 60000
const FMEP_LINEAR = 4200
const FMEP_QUADRATIC = 430
/**
 * Douaud–Eyzat ignition delay, τ = A·(ON/100)^3.402·p^-1.7·exp(3800/T) with
 * p in atm, scaled by a calibration factor for this model's lumped end gas.
 */
const KNOCK_DELAY = 17.68e-3 * 3.3
/** (γ − 1)/γ for isentropic compression of the unburned end gas. */
const END_GAS_EXPONENT = 0.248
/** The knock window closes once this much of the charge has burned. */
const KNOCK_WINDOW_BURN = 0.98
/** Unburned share at onset that a knock sensor detects. */
const KNOCK_SENSED = 0.03
/** ECU retard per detected knock event, its limit and recovery rate. */
const RETARD_STEP = 2
const RETARD_LIMIT = 12
const RETARD_RECOVERY = 1.5
/** C in S_T/S_L = 1 + C·(Ū_p/S_L)^0.7, with turbulence intensity taken as ∝ Ū_p. */
const TURBULENCE = 2.5
/** Idle-air integral gain, throttle per RPM-second. */
const IDLE_INTEGRAL = 0.0003

export type Controls = {
  throttle: number
  load: number
  ignition: boolean
  starter: boolean
  holdRpm: number | null
  /** Optional road load through a gearbox and automatic clutch. */
  road: Road | null
}
export type Telemetry = {
  time: number
  rpm: number
  angle: number
  torque: number
  power: number
  absorbedTorque: number
  throttle: number
  manifold: number
  coolant: number
  limited: boolean
  warning: string
  pressures: number[]
  phases: number[]
  traces: number[][]
  sample: number
  maxSubsteps: number
  starterStalled: boolean
  induction: InductionTelemetry
  fuel: FuelTelemetry
  /** Unburned fuel recently lit in the exhaust (sound only). */
  afterfire: boolean
  /** Lumped header wall temperature used for afterfire, K. */
  exhaustWall: number
  /** Road speed (km/h) and gear while road load is on. */
  road: { speed: number; gear: number } | null
  knock: KnockTelemetry
}
interface Cylinder {
  mass: number
  energy: number
  fresh: number
  /** Fuel arrived with the fresh charge this cycle, kg. */
  fuel: number
  heat: number
  burn: number
  phase: number
  pressure: number
  volume: number
  /** Intake runner mass flow, kg/s; positive into the cylinder. */
  runner: number
  /** Flammable fuel left unburned by a misfire or cut spark, kg; leaves with the exhaust. */
  unburned: number
  /** Spark angle (rad) and burn duration (deg) of the current burn. */
  spark: number
  duration: number
  sparked: boolean
  /** ECU knock retard, degrees. */
  retard: number
  /** Livengood–Wu integral since intake closing; 1 = end-gas autoignition. */
  knock: number
  knockOpen: boolean
  /** Unburned share when the integral reached 1, or −1 before onset. */
  knockOnset: number
  /** 1 / ignition-delay prefactor for this cycle's mixture, 1/s. */
  knockRate: number
  ivcPressure: number
  ivcTemperature: number
  /** Results of the last completed cycle. */
  knockIndex: number
  knockIntensity: number
  /** Gas pushed back into the runner, its fresh air and its fuel, kg. */
  pushed: number
  pushedFresh: number
  pushedFuel: number
}
export type KnockTelemetry = {
  fuel: FuelGrade
  control: boolean
  /** Per cylinder, last cycle: the knock integral, where 1 is onset. */
  index: number[]
  /** Per cylinder, last cycle: unburned share of the charge at onset. */
  intensity: number[]
  /** Per cylinder ECU retard, degrees. */
  retard: number[]
  /** Per cylinder burn duration of the last burn, degrees. */
  burn: number[]
  /** Knock in any cylinder within the last 0.3 s. */
  knocking: boolean
}
/** Original 0D research prototype. All hosts advance this exact core at 48 kHz. */
export class EngineCore {
  readonly engine: EngineDefinition
  readonly conditions: Conditions
  readonly dt = 1 / 48000
  readonly cylinders: Cylinder[] = []
  controls: Controls = {
    throttle: 0,
    load: 0,
    ignition: false,
    starter: false,
    holdRpm: null,
    road: null,
  }
  readonly vehicle = new Vehicle()
  time = 0
  angle = 0
  omega = 0
  torque = 0
  absorbedTorque = 0
  manifold: number
  coolant: number
  sample = 0
  maxSubsteps = 0
  limited = false
  warning = ''
  /** Latched when the starter is engaged but cannot turn the crank. */
  starterStalled = false
  readonly induction: InductionSystem
  readonly fuel: FuelDelivery
  /** Smoothed delivered λ of firing cylinders. */
  lambda: number
  private misfireTime = -Infinity
  private stallTime = 0
  /** Sound synthesis; it reads the simulated state but never changes it. */
  readonly acoustics: Acoustics
  /** Off for headless dyno tests, which discard the audio. */
  sound = true
  private input = new AcousticInput()
  private chargeFuel: number
  private oxygen: number
  private traces = Array.from({ length: 4 }, () => new Float32Array(360))
  private phases: number[]
  private airDensityRatio: number
  private pistonArea: number
  private crankRadius: number
  private clearanceVolume: number
  private frictionPerPascal: number
  private audioScale: number
  private intakeEnthalpy: number
  private exhaustEnthalpy: number
  private woschniBore: number
  private airDensity: number
  /** Runner cross-section divided by length, m. */
  private runnerGain: number
  /** The limiter cuts ignition rather than fuel. */
  private sparkCut: boolean
  private grade: (typeof FUELS)[FuelGrade]
  private knockTime = -Infinity
  /** Highest knock index since the last read by a dyno test. */
  knockPeak = 0
  /** Strongest knock among burns that ended this step, for the sound. */
  private knockEvent = 0
  /**
   * Return gas pushed back into the runner with its own composition, so
   * burned gas from valve overlap comes back as residual. Predictive burn
   * only: 1.5.0 re-inducted it as fresh air.
   */
  private runnerResidual: boolean
  private idleTrim = 0
  private runnerVolume: number
  private octaneDelay: number
  private referenceFlame: number
  private pistonSpeedPerRpm: number

  constructor(engine: EngineDefinition, conditions: Conditions) {
    this.engine = validateEngine(engine)
    this.conditions = conditionsSchema.parse(conditions)
    this.pistonArea = (Math.PI * engine.bore ** 2) / 4
    this.crankRadius = engine.stroke / 2
    this.clearanceVolume =
      (this.pistonArea * engine.stroke) / (engine.compression - 1)
    // Friction mean effective pressure becomes torque in proportion to displacement.
    this.frictionPerPascal = displacement(engine) / (4 * Math.PI)
    // Exhaust-pulse loudness was calibrated on a 2.0 L engine.
    this.audioScale = 0.002 / displacement(engine)
    // Fuel in one full cylinder charge of standard air, for afterfire scale.
    this.grade = FUELS[engine.combustion.fuel]
    this.chargeFuel =
      (displacement(engine) / 4) * (1.2 / this.grade.stoichiometric)
    this.runnerResidual = engine.combustion.burnRate === 'predictive'
    this.octaneDelay = KNOCK_DELAY * (this.grade.octane / 100) ** 3.402
    this.pistonSpeedPerRpm = (2 * engine.stroke) / 60
    // burnDuration is quoted for gasoline at 3,000 RPM and full load.
    this.referenceFlame = turbulentFlame(
      laminarFlame(FUELS.ron95.flame, 1, 700, 1.5e6, 0.08),
      this.pistonSpeedPerRpm * 3000,
    )
    this.acoustics = new Acoustics(engine, conditions.temperature)
    this.intakeEnthalpy = enthalpy(conditions.temperature)
    this.exhaustEnthalpy = enthalpy(EXHAUST_BACKFLOW_TEMPERATURE)
    this.woschniBore = 3.26 * engine.bore ** -0.2
    this.manifold = conditions.pressure
    this.coolant = conditions.coolant
    const air = atmosphere(conditions)
    this.oxygen = air.oxygenMassFraction
    this.airDensity = air.density
    // Runner diameter about 0.39 × bore, and never narrower than the valve.
    const runnerArea = Math.max(0.15 * this.pistonArea, 1.2 * engine.intakeArea)
    this.runnerGain = runnerArea / engine.intakeRunnerLength
    this.runnerVolume = Math.min(
      runnerArea * engine.intakeRunnerLength,
      (this.pistonArea * engine.stroke) / 2,
    )
    this.sparkCut =
      engine.limiterCut === 'spark' || engine.fuelSystem.kind === 'carburettor'
    this.airDensityRatio =
      air.density / (conditions.pressure / R / conditions.temperature)
    this.induction = new InductionSystem(
      engine,
      conditions,
      air.density,
      this.airDensityRatio,
    )
    this.fuel = new FuelDelivery(engine, air.density)
    this.lambda = engine.lambda
    this.phases = Array.from(
      { length: 4 },
      (_, c) => engine.firingOrder.indexOf((c + 1) as 1 | 2 | 3 | 4) * Math.PI,
    )
    for (const phase of this.phases) {
      const g = geometry(engine, wrap(-phase))
      const mass =
        (conditions.pressure * g.volume) / (R * conditions.temperature)
      this.cylinders.push({
        mass,
        energy: mass * internalEnergy(conditions.temperature),
        fresh: 0,
        fuel: 0,
        heat: 0,
        burn: 1,
        phase: wrap(-phase),
        pressure: conditions.pressure,
        volume: g.volume,
        runner: 0,
        unburned: 0,
        spark: CYCLE - (engine.ignitionAdvance * Math.PI) / 180,
        duration: engine.burnDuration,
        sparked: false,
        retard: 0,
        knock: 0,
        knockOpen: false,
        knockOnset: -1,
        knockRate: 0,
        ivcPressure: conditions.pressure,
        ivcTemperature: conditions.temperature,
        knockIndex: 0,
        knockIntensity: 0,
        pushed: 0,
        pushedFresh: 0,
        pushedFuel: 0,
      })
    }
  }
  /**
   * A new core for an edited definition or conditions that carries on from a
   * running one: crank angle and speed, controls, clock, coolant, manifold,
   * induction and fuel state, and filters are kept. Each cylinder keeps its
   * pressure, temperature, fresh-charge share and combustion progress; its
   * gas mass is rescaled to the new geometry's volume at the same angle.
   */
  static continueFrom(
    previous: EngineCore,
    engine: EngineDefinition,
    conditions: Conditions,
  ) {
    const core = new EngineCore(engine, conditions)
    core.controls = { ...previous.controls }
    core.vehicle.speed = previous.vehicle.speed
    core.vehicle.clutchTorque = previous.vehicle.clutchTorque
    core.time = previous.time
    core.sample = previous.sample
    core.angle = previous.angle
    core.omega = previous.omega
    core.torque = previous.torque
    core.absorbedTorque = previous.absorbedTorque
    core.manifold = previous.manifold
    core.coolant = previous.coolant
    core.limited = previous.limited
    core.starterStalled = previous.starterStalled
    core.stallTime = previous.stallTime
    core.lambda = previous.lambda
    core.misfireTime = previous.misfireTime
    core.knockTime = previous.knockTime
    if (core.runnerResidual) core.idleTrim = previous.idleTrim
    core.maxSubsteps = previous.maxSubsteps
    core.sound = previous.sound
    core.acoustics.adopt(previous.acoustics)
    core.traces = previous.traces.map((t) => t.slice())
    core.induction.adopt(previous.induction)
    core.fuel.adopt(previous.fuel)
    const p = previous.engine
    const sameGeometry =
      p.bore === engine.bore &&
      p.stroke === engine.stroke &&
      p.rodLength === engine.rodLength &&
      p.compression === engine.compression
    for (let i = 0; i < core.cylinders.length; i++) {
      const old = previous.cylinders[i]
      const cyl = core.cylinders[i]
      // Stored volume belongs to the stored phase, one substep behind the crank.
      const volume = sameGeometry
        ? old.volume
        : geometry(engine, old.phase).volume
      const temperature = temperatureFromEnergy(old.energy / old.mass)
      const scale = volume / old.volume
      cyl.mass = old.mass * scale
      cyl.energy = old.energy * scale
      cyl.fresh = old.fresh * scale
      cyl.fuel = old.fuel * scale
      cyl.heat = old.heat * scale
      cyl.unburned = old.unburned * scale
      cyl.burn = old.burn
      cyl.phase = old.phase
      cyl.volume = volume
      cyl.pressure = (cyl.mass * R * temperature) / volume
      cyl.runner = old.runner
      cyl.spark = old.spark
      cyl.duration = old.duration
      cyl.sparked = old.sparked
      cyl.knockIndex = old.knockIndex
      cyl.knockIntensity = old.knockIntensity
      cyl.pushed = old.pushed
      cyl.pushedFresh = old.pushedFresh
      cyl.pushedFuel = old.pushedFuel
      if (engine.combustion.knockControl) cyl.retard = old.retard
      cyl.knock = old.knock
      cyl.knockOpen = old.knockOpen
      cyl.knockOnset = old.knockOnset
      cyl.knockRate = old.knockRate
      cyl.ivcPressure = old.ivcPressure
      cyl.ivcTemperature = old.ivcTemperature
    }
    return core
  }
  setListener(listener: Listener) {
    this.acoustics.listener = listener
  }
  setControls(update: Partial<Controls>) {
    if (update.road) update = { ...update, road: validateRoad(update.road) }
    Object.assign(this.controls, update)
    this.controls.throttle = clamp(this.controls.throttle, 0, 1)
    this.controls.load = clamp(this.controls.load, 0, 400)
  }
  /** Positive-displacement starter; no division by speed, including at rest. */
  step(): number {
    const e = this.engine
    const c = this.conditions
    const rpm = omegaToRpm(this.omega)
    if (rpm >= e.revLimit) this.limited = true
    else if (rpm < e.revLimit - 220) this.limited = false
    this.warning =
      rpm > e.mechanicalLimit ? 'Estimated mechanical RPM limit exceeded' : ''
    // Idle air: proportional on speed, plus an integral trim with the
    // predictive burn, whose diluted idle needs more air than 1.5.0's.
    if (this.runnerResidual && this.controls.ignition && rpm > 300)
      this.idleTrim = clamp(
        this.idleTrim + (950 - rpm) * IDLE_INTEGRAL * this.dt,
        0,
        0.3,
      )
    else if (!this.controls.ignition) this.idleTrim = 0
    const idle = this.controls.ignition
      ? clamp(
          0.09 + this.idleTrim + (950 - rpm) * 0.0004,
          0,
          this.runnerResidual ? 0.6 : 0.38,
        )
      : 0
    const throttle = Math.max(this.controls.throttle, idle)
    const induction = this.induction
    const turbo = induction.config.kind === 'turbo'
    const fuel = this.fuel
    fuel.limiterCut = this.limited && !this.sparkCut
    // A carburettor's venturi loss sits ahead of the throttle or compressor.
    induction.inletLoss = fuel.inletLoss
    const supply = induction.boosted
      ? induction.supply
      : induction.supply - fuel.inletLoss
    const targetMap = supply * (0.04 + 0.95 * throttle)
    // Charge air after any compressor, intercooler and fuel evaporation.
    const intakeTemperature = induction.chargeTemperature - fuel.manifoldCooling
    const intakeEnthalpy =
      induction.boosted || fuel.manifoldCooling > 0
        ? enthalpy(intakeTemperature)
        : this.intakeEnthalpy
    const intakeDensity =
      (this.airDensity * c.temperature) / (c.pressure * intakeTemperature)
    const backPressure = turbo ? induction.exhaustPressure : c.pressure
    const backTemperature = turbo
      ? induction.exhaustTemperature
      : EXHAUST_BACKFLOW_TEMPERATURE
    const backEnthalpy = turbo
      ? enthalpy(backTemperature)
      : this.exhaustEnthalpy
    if (induction.overspeed()) this.warning = 'Estimated compressor overspeed'
    this.manifold += ((targetMap - this.manifold) * this.dt) / 0.045
    const pistonSpeed = (2 * e.stroke * rpm) / 60
    // Woschni-form gas velocity without its combustion term (calibrated by WALL_HEAT).
    const gasVelocity = (2.28 * pistonSpeed + 1) ** 0.8 * WALL_HEAT
    const n = Math.max(1, Math.ceil((this.omega * this.dt) / (Math.PI / 180)))
    this.maxSubsteps = Math.max(this.maxSubsteps, n)
    if (n > 4)
      throw new Error('Engine exceeded the supported integration speed.')
    const dt = this.dt / n
    let audio = 0
    let portEnergy = 0
    let portMass = 0
    let unburned = 0
    let valveSeats = 0
    let intakeMass = 0
    let freshMass = 0
    let exhaustMass = 0
    let exhaustEnergy = 0
    let torque = 0
    let absorbed = 0
    for (let sub = 0; sub < n; sub++) {
      const da = this.omega * dt
      let indicated = 0
      for (let i = 0; i < 4; i++) {
        const cyl = this.cylinders[i]
        const phase = wrap(this.angle - this.phases[i])
        const deg = (phase * 180) / Math.PI
        const previousDeg = (cyl.phase * 180) / Math.PI
        const intakeClosing =
          previousDeg < e.intakeClose && deg >= e.intakeClose
        if (intakeClosing || (previousDeg < 370 && deg >= 370)) valveSeats++
        // Scalar geometry keeps allocations out of the per-sample audio hot path.
        const sin = Math.sin(phase),
          cos = Math.cos(phase)
        const r = this.crankRadius
        const root = Math.sqrt(e.rodLength ** 2 - (r * sin) ** 2)
        const volume =
          this.clearanceVolume +
          this.pistonArea * (r * (1 - cos) + e.rodLength - root)
        const derivative =
          this.pistonArea * (r * sin + (r * r * sin * cos) / root)
        const previousVolume = cyl.volume
        let temperature = temperatureFromEnergy(cyl.energy / cyl.mass)
        let pressure = (cyl.mass * R * temperature) / previousVolume
        const inlet =
          deg >= 350 && deg < e.intakeClose
            ? Math.sin((Math.PI * (deg - 350)) / (e.intakeClose - 350)) *
              e.intakeArea
            : 0
        const exhaust =
          deg >= 145 && deg < 370
            ? Math.sin((Math.PI * (deg - 145)) / 225) * e.exhaustArea
            : 0
        // Enthalpy transport across each open valve; reverse flow is supported.
        if (inlet > 0) {
          // Lumped runner: gas momentum driven by manifold-to-cylinder
          // pressure, resisted by the valve's quadratic loss. Solved
          // implicitly so a nearly closed valve stays stable; capped at the
          // valve's choked flow.
          const drive =
            cyl.runner + this.runnerGain * dt * (this.manifold - pressure)
          const density =
            drive >= 0
              ? intakeDensity * this.manifold
              : cyl.mass / previousVolume
          const loss = (this.runnerGain * dt) / (2 * density * inlet * inlet)
          const size = Math.abs(drive)
          let flow =
            (Math.sign(drive) * 2 * size) / (1 + Math.sqrt(1 + 4 * loss * size))
          if (flow >= 0) {
            flow = Math.min(
              flow,
              massFlow(
                this.manifold as Pascals,
                0 as Pascals,
                intakeTemperature,
                inlet,
              ) * this.airDensityRatio,
            )
            const dm = flow * dt
            cyl.mass += dm
            cyl.energy += dm * (intakeEnthalpy - fuel.cylinderCooling)
            // Gas pushed back earlier returns first, as it left.
            const back = Math.min(dm, cyl.pushed)
            if (back > 0) {
              const share = back / cyl.pushed
              const fresh = cyl.pushedFresh * share
              const burned = cyl.pushedFuel * share
              cyl.fresh += fresh
              cyl.fuel += burned
              cyl.pushed -= back
              cyl.pushedFresh -= fresh
              cyl.pushedFuel -= burned
            }
            cyl.fresh += dm - back
            cyl.fuel += (dm - back) * fuel.fuelPerAir
            freshMass += dm - back
          } else {
            flow = Math.max(
              flow,
              -massFlow(pressure as Pascals, 0 as Pascals, temperature, inlet),
              (-cyl.mass * 0.08) / dt,
            )
            const dm = -flow * dt
            const kept = 1 - dm / cyl.mass
            if (this.runnerResidual) {
              cyl.pushed += dm
              cyl.pushedFresh += cyl.fresh * (1 - kept)
              cyl.pushedFuel += cyl.fuel * (1 - kept)
              // Only the gas near the valve returns as it left: up to the
              // runner's volume or half the swept volume. The rest mixes
              // into the plenum and returns as fresh charge.
              const room =
                (this.runnerVolume * this.manifold) / (R * intakeTemperature)
              if (cyl.pushed > room) {
                const share = room / cyl.pushed
                cyl.pushed = room
                cyl.pushedFresh *= share
                cyl.pushedFuel *= share
              }
            }
            cyl.fresh *= kept
            cyl.fuel *= kept
            cyl.mass -= dm
            cyl.energy -= dm * enthalpy(temperature)
          }
          cyl.runner = flow
          intakeMass += flow * dt
        } else cyl.runner = 0
        if (exhaust > 0) {
          if (pressure > backPressure) {
            const dm = Math.min(
              cyl.mass * 0.08,
              massFlow(
                pressure as Pascals,
                backPressure as Pascals,
                temperature,
                exhaust,
              ) * dt,
            )
            const h = dm * enthalpy(temperature)
            const kept = 1 - dm / cyl.mass
            unburned += cyl.unburned * (1 - kept)
            cyl.unburned *= kept
            cyl.fresh *= kept
            cyl.fuel *= kept
            cyl.mass -= dm
            cyl.energy -= h
            portMass += dm
            portEnergy += dm * temperature
            exhaustMass += dm
            exhaustEnergy += h
            audio += (dm / this.dt) * 5 * this.audioScale
          } else {
            const dm = Math.min(
              massFlow(
                backPressure as Pascals,
                pressure as Pascals,
                backTemperature,
                exhaust,
              ) * dt,
              Infinity,
            )
            cyl.mass += dm
            cyl.energy += dm * backEnthalpy
            exhaustMass -= dm
            exhaustEnergy -= dm * backEnthalpy
          }
        }
        const advance = Math.max(1, e.ignitionAdvance - cyl.retard)
        const ignition = CYCLE - (advance * Math.PI) / 180
        if (cyl.phase < ignition && phase >= ignition) {
          // Fuel delivered with the charge; extra O2 can only burn available fuel.
          const lambda =
            cyl.fuel > 0
              ? cyl.fresh / (this.grade.stoichiometric * cyl.fuel)
              : Infinity
          const burnable = Math.min(
            cyl.fuel,
            (cyl.fresh * this.oxygen) / this.grade.oxygen,
          )
          const fires =
            this.controls.ignition && !(this.limited && this.sparkCut)
          const ignites = lambda <= LEAN_MISFIRE && lambda >= RICH_MISFIRE
          cyl.heat = fires && ignites ? burnable * this.grade.heating * 0.96 : 0
          cyl.spark = ignition
          cyl.sparked = true
          cyl.duration =
            e.combustion.burnRate === 'fixed'
              ? e.burnDuration
              : this.burnAngle(cyl, lambda, temperature, pressure, rpm)
          // Unlit fuel leaves with the exhaust, weighted by how readily it
          // can afterfire: a charge too lean to light here barely burns
          // there, and fuel beyond the oxygen available needs tailpipe air.
          const flammable =
            lambda > LEAN_MISFIRE ? 0.03 : lambda < RICH_MISFIRE ? 0.5 : 1
          cyl.unburned +=
            fires && ignites
              ? (cyl.fuel - burnable) * 0.3
              : cyl.fuel * flammable
          if (
            fires &&
            cyl.fresh > 0 &&
            !fuel.overrunCut &&
            !fuel.limiterCut
          ) {
            if (!ignites) this.misfireTime = this.time
            this.lambda += 0.3 * (Math.min(lambda, 9.99) - this.lambda)
          }
          cyl.burn = 0
          cyl.fresh = 0
          cyl.fuel = 0
        }
        const elapsed = (wrap(phase - cyl.spark) * 180) / Math.PI
        if (elapsed < cyl.duration && cyl.burn < 1) {
          const burned = wiebe(elapsed / cyl.duration)
          cyl.energy += Math.max(0, burned - cyl.burn) * cyl.heat
          cyl.burn = burned
        }
        // First law: dU = dQ - p dV; simple wall heat transfer, ideal gas.
        cyl.energy -= pressure * (volume - previousVolume)
        temperature = temperatureFromEnergy(cyl.energy / cyl.mass)
        // Head, crown and the currently exposed liner.
        const surface = 2 * this.pistonArea + (4 * volume) / e.bore
        pressure = (cyl.mass * R * temperature) / volume
        const coefficient =
          this.woschniBore *
          (pressure / 1000) ** 0.8 *
          temperature ** -0.55 *
          gasVelocity
        cyl.energy -=
          coefficient *
          surface *
          (temperature - this.coolant - WALL_ABOVE_COOLANT) *
          dt
        temperature = temperatureFromEnergy(cyl.energy / cyl.mass)
        if (
          !Number.isFinite(temperature) ||
          temperature < 30 ||
          temperature > 6000 ||
          cyl.mass <= 0
        )
          throw new Error(
            'Cylinder state left the supported model range. Stop and rebuild.',
          )
        pressure = (cyl.mass * R * temperature) / volume
        if (cyl.knockOpen) this.integrateKnock(cyl, pressure, elapsed, dt)
        if (intakeClosing) this.closeIntake(cyl, pressure, temperature)
        this.traces[i][Math.min(359, Math.floor(deg / 2))] = pressure
        cyl.pressure = pressure
        cyl.phase = phase
        cyl.volume = volume
        indicated += (pressure - c.pressure) * derivative
      }
      // Mechanical friction mean effective pressure from mean piston speed;
      // pumping work is simulated through the valves, not included here.
      const friction =
        (FMEP_STATIC +
          FMEP_LINEAR * pistonSpeed +
          FMEP_QUADRATIC * pistonSpeed * pistonSpeed) *
          this.frictionPerPascal +
        induction.crankTorque +
        fuel.crankTorque
      torque += (indicated - friction) / n
      const starter = this.controls.starter && rpm < 500 ? e.starterTorque : 0
      if (this.controls.holdRpm === null) {
        const road = this.controls.road
        const load =
          this.controls.load +
          (road
            ? this.vehicle.step(
                road,
                this.omega,
                omegaToRpm(this.omega),
                this.airDensity,
                dt,
              )
            : 0)
        this.absorbedTorque = load
        this.omega = Math.max(
          0,
          this.omega +
            ((indicated - friction - load + starter) / e.inertia) * dt,
        )
      } else {
        // Speed-controlled dynamometer: constraint reaction includes rotational acceleration.
        const target = rpmToOmega(this.controls.holdRpm)
        const acceleration = (target - this.omega) / dt
        this.absorbedTorque = indicated - friction - e.inertia * acceleration
        this.omega = target
      }
      absorbed += this.absorbedTorque / n
      this.angle = wrap(this.angle + da)
    }
    this.absorbedTorque = absorbed
    induction.step(
      this.dt,
      this.omega,
      intakeMass / this.dt,
      exhaustMass,
      exhaustEnergy,
      this.manifold,
    )
    fuel.step(
      this.dt,
      rpm,
      this.omega,
      this.controls.throttle,
      freshMass,
      this.manifold,
      intakeTemperature,
      this.coolant,
    )
    // A turbo's manifold and turbine smooth the pulses reaching the tailpipe.
    if (turbo) audio = induction.tailpipeFlow * 5 * this.audioScale
    let sample = 0
    if (this.sound) {
      const input = this.input
      input.exhaust = audio
      input.portTemperature = portMass > 0 ? portEnergy / portMass : 0
      input.intake = (intakeMass / this.dt) * 5 * this.audioScale
      input.throttle = throttle
      input.manifoldRatio = this.manifold / Math.max(supply, 1)
      let pressureSum = 0
      for (const cyl of this.cylinders) pressureSum += cyl.pressure
      input.pressureSum = pressureSum
      input.valveSeats = valveSeats
      input.unburned = unburned / this.chargeFuel
      input.rpm = rpm
      input.induction = induction.config.kind
      input.shaftHz = induction.shaftHz
      input.boost = Math.min(
        1,
        Math.max(0, induction.supply - c.pressure) / 100000,
      )
      input.venting = induction.venting
      input.dump = Math.min(1, (induction.outlet - c.pressure) / 40000)
      input.surge = induction.surge
      input.knock = this.knockEvent
      sample = this.acoustics.process(input)
    }
    this.knockEvent = 0
    // Only blame the starter when nothing else resists it: a loaded dyno
    // stalling a cranking engine is reported as an ordinary stall.
    if (
      this.controls.starter &&
      this.controls.holdRpm === null &&
      this.controls.load === 0 &&
      rpm < 20
    ) {
      this.stallTime += this.dt
      if (this.stallTime > 0.4) this.starterStalled = true
    } else if (!this.controls.starter) this.stallTime = 0
    if (rpm > 200) {
      this.starterStalled = false
      this.stallTime = 0
    }
    if (e.combustion.knockControl)
      for (const cyl of this.cylinders)
        cyl.retard = Math.max(0, cyl.retard - RETARD_RECOVERY * this.dt)
    this.torque += ((torque - this.torque) * this.dt) / 0.08
    this.time += this.dt
    this.sample++
    // Slow illustrative lumped coolant state, independent of ambient temperature.
    this.coolant +=
      ((Math.max(0, torque * this.omega) * 0.12 -
        (this.coolant - c.temperature) * 110) /
        90000) *
      this.dt
    return sample
  }
  /**
   * Burn duration (deg) from a turbulent flame speed: laminar speed from
   * mixture, unburned-gas state and residual dilution (Metghalchi–Keck),
   * wrinkled by turbulence that scales with mean piston speed. Scaled so
   * burnDuration holds at the 3,000 RPM full-load reference.
   */
  private burnAngle(
    cyl: Cylinder,
    lambda: number,
    temperature: number,
    pressure: number,
    rpm: number,
  ) {
    const speed = Math.max(rpm, 300)
    const residual = clamp(1 - cyl.fresh / cyl.mass, 0, 0.6)
    const flame = turbulentFlame(
      laminarFlame(
        this.grade.flame,
        clamp(1 / lambda, 0.5, 1.6),
        temperature,
        pressure,
        residual,
      ),
      this.pistonSpeedPerRpm * speed,
    )
    // The floor only binds for laminar-dominated tiny engines, whose burns
    // would otherwise leave the calibrated range at idle.
    const reference = this.engine.burnDuration
    return clamp(
      ((reference * speed) / 3000) * (this.referenceFlame / flame),
      Math.max(25, 0.7 * reference),
      120,
    )
  }
  /** Start the end-gas ignition-delay integral for the trapped charge. */
  private closeIntake(cyl: Cylinder, pressure: number, temperature: number) {
    const lambda =
      cyl.fuel > 0
        ? cyl.fresh / (this.grade.stoichiometric * cyl.fuel)
        : LEAN_MISFIRE
    const residual = clamp(1 - cyl.fresh / cyl.mass, 0, 0.6)
    // Rich mixtures and inert residual lengthen the delay; lean shortens it.
    const mixture = Math.exp(2 * (1 - Math.min(lambda, LEAN_MISFIRE)))
    cyl.knockRate = 1 / (this.octaneDelay * mixture * (1 + 1.5 * residual))
    cyl.ivcPressure = pressure
    cyl.ivcTemperature = temperature
    cyl.knock = 0
    cyl.knockOnset = -1
    cyl.sparked = false
    cyl.knockOpen = true
  }
  /** Livengood–Wu: ∫ dt/τ over the unburned end gas until the burn ends. */
  private integrateKnock(
    cyl: Cylinder,
    pressure: number,
    elapsed: number,
    dt: number,
  ) {
    const unburned =
      cyl.ivcTemperature * (pressure / cyl.ivcPressure) ** END_GAS_EXPONENT
    cyl.knock +=
      dt *
      cyl.knockRate *
      (pressure / 101325) ** 1.7 *
      Math.exp(-3800 / unburned)
    if (cyl.knockOnset < 0 && cyl.knock >= 1)
      cyl.knockOnset = cyl.sparked ? 1 - cyl.burn : 1
    if (
      !cyl.sparked ||
      (cyl.burn < KNOCK_WINDOW_BURN && elapsed < cyl.duration)
    )
      return
    cyl.knockOpen = false
    // An unlit charge has no flame front to outrun.
    const fired = cyl.heat > 0
    cyl.knockIndex = fired ? Math.min(cyl.knock, 100) : 0
    cyl.knockIntensity = fired ? Math.max(0, cyl.knockOnset) : 0
    this.knockPeak = Math.max(this.knockPeak, cyl.knockIndex)
    if (cyl.knockIntensity > 0) {
      this.knockTime = this.time
      this.knockEvent = Math.max(this.knockEvent, cyl.knockIntensity)
    }
    if (
      this.engine.combustion.knockControl &&
      cyl.knockIntensity > KNOCK_SENSED
    )
      cyl.retard = Math.min(RETARD_LIMIT, cyl.retard + RETARD_STEP)
  }
  /** Mean ECU knock retard across the cylinders, degrees. */
  meanRetard() {
    let sum = 0
    for (const cyl of this.cylinders) sum += cyl.retard
    return sum / this.cylinders.length
  }
  advance(seconds: number) {
    if (seconds < 0 || seconds > 0.1)
      throw new Error('Advance must be bounded to 0–100 ms.')
    const count = Math.round(seconds / this.dt)
    for (let i = 0; i < count; i++) this.step()
  }
  telemetry(): Telemetry {
    return {
      time: this.time,
      rpm: omegaToRpm(this.omega),
      angle: this.angle,
      torque: this.torque,
      power: powerKw(this.torque, this.omega as RadiansPerSecond),
      absorbedTorque: this.absorbedTorque,
      throttle: this.controls.throttle,
      manifold: this.manifold,
      coolant: this.coolant,
      limited: this.limited,
      warning: this.warning,
      traces: this.traces.map((t) => Array.from(t)),
      pressures: this.cylinders.map((c) => c.pressure),
      phases: this.cylinders.map((c) => (c.phase * 180) / Math.PI),
      sample: this.sample,
      maxSubsteps: this.maxSubsteps,
      starterStalled: this.starterStalled,
      induction: this.induction.telemetry(),
      fuel: this.fuel.telemetry(
        this.lambda,
        this.time - this.misfireTime < 0.3,
      ),
      afterfire: this.acoustics.afterfire,
      exhaustWall: this.acoustics.wallTemperature,
      knock: {
        fuel: this.engine.combustion.fuel,
        control: this.engine.combustion.knockControl,
        index: this.cylinders.map((c) => c.knockIndex),
        intensity: this.cylinders.map((c) => c.knockIntensity),
        retard: this.cylinders.map((c) => c.retard),
        burn: this.cylinders.map((c) => c.duration),
        knocking: this.time - this.knockTime < 0.3,
      },
      road: this.controls.road
        ? { speed: this.vehicle.speed * 3.6, gear: this.controls.road.gear }
        : null,
    }
  }
}

/** Laminar flame speed, m/s (Metghalchi–Keck, residual dilution 1 − 2.06·x^0.77). */
function laminarFlame(
  fit: { base: number; curve: number; peak: number },
  phi: number,
  temperature: number,
  pressure: number,
  residual: number,
) {
  return (
    Math.max(0.05, fit.base + fit.curve * (phi - fit.peak) ** 2) *
    (temperature / 298) ** 2.18 *
    (pressure / 101325) ** -0.16 *
    Math.max(0.1, 1 - 2.06 * residual ** 0.77)
  )
}
/** Turbulent flame speed, S_T = S_L·(1 + C·(u′/S_L)^0.7), m/s. */
function turbulentFlame(laminar: number, pistonSpeed: number) {
  return laminar * (1 + TURBULENCE * (pistonSpeed / laminar) ** 0.7)
}

/**
 * Peak torque needed to turn the engine slowly with ignition off: the
 * resisting torque over one cycle at 150 RPM. A starter below this may still
 * start the engine on flywheel momentum, so treat it as a guide, not a rule.
 */
export function crankingTorque(
  engine: EngineDefinition,
  conditions: Conditions,
) {
  const core = new EngineCore(engine, conditions)
  core.setControls({ ignition: false, holdRpm: 150 })
  // Skip the first step's step-change from rest, then measure one 720° cycle.
  for (let i = 0; i < 480; i++) core.step()
  let peak = 0
  for (let i = 0; i < 38400; i++) {
    core.step()
    peak = Math.max(peak, -core.absorbedTorque)
  }
  return peak
}
