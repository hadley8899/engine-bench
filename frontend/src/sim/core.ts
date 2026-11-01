import { conditionsSchema, displacement, validateEngine } from './schema'
import type {
  Conditions,
  EngineDefinition,
  Pascals,
  RadiansPerSecond,
} from './schema'
import { InductionSystem } from './induction'
import type { InductionTelemetry } from './induction'
import {
  FuelDelivery,
  LEAN_MISFIRE,
  RICH_MISFIRE,
  STOICHIOMETRIC,
} from './fuel'
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

export type Controls = {
  throttle: number
  load: number
  ignition: boolean
  starter: boolean
  holdRpm: number | null
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
  }
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
  private whinePhase = 0
  private noise = 0x2545f491
  private ventSound = 0
  private filter = 0
  private previousAudio = 0
  private audioHighpass = 0
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
      })
    }
  }
  setControls(update: Partial<Controls>) {
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
    const idle = this.controls.ignition
      ? clamp(0.09 + (950 - rpm) * 0.0004, 0, 0.38)
      : 0
    const throttle = Math.max(this.controls.throttle, idle)
    const induction = this.induction
    const turbo = induction.config.kind === 'turbo'
    const fuel = this.fuel
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
            cyl.fresh += dm
            cyl.fuel += dm * fuel.fuelPerAir
            cyl.energy += dm * (intakeEnthalpy - fuel.cylinderCooling)
            freshMass += dm
          } else {
            flow = Math.max(
              flow,
              -massFlow(pressure as Pascals, 0 as Pascals, temperature, inlet),
              (-cyl.mass * 0.08) / dt,
            )
            const dm = -flow * dt
            const kept = 1 - dm / cyl.mass
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
            cyl.fresh *= kept
            cyl.fuel *= kept
            cyl.mass -= dm
            cyl.energy -= h
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
        const ignition = CYCLE - (e.ignitionAdvance * Math.PI) / 180
        if (cyl.phase < ignition && phase >= ignition) {
          // Fuel delivered with the charge; extra O2 can only burn available fuel.
          const lambda =
            cyl.fuel > 0 ? cyl.fresh / (STOICHIOMETRIC * cyl.fuel) : Infinity
          const burnable = Math.min(cyl.fuel, (cyl.fresh * this.oxygen) / 3.43)
          const fires = this.controls.ignition && !this.limited
          const ignites = lambda <= LEAN_MISFIRE && lambda >= RICH_MISFIRE
          cyl.heat = fires && ignites ? burnable * 43e6 * 0.96 : 0
          if (fires && cyl.fresh > 0 && !fuel.overrunCut) {
            if (!ignites) this.misfireTime = this.time
            this.lambda += 0.3 * (Math.min(lambda, 9.99) - this.lambda)
          }
          cyl.burn = 0
          cyl.fresh = 0
          cyl.fuel = 0
        }
        const elapsed = (wrap(phase - ignition) * 180) / Math.PI
        if (elapsed < e.burnDuration && cyl.burn < 1) {
          const burned = wiebe(elapsed / e.burnDuration)
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
        this.absorbedTorque = this.controls.load
        this.omega = Math.max(
          0,
          this.omega +
            ((indicated - friction - this.controls.load + starter) /
              e.inertia) *
              dt,
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
    this.torque += ((torque - this.torque) * this.dt) / 0.08
    this.time += this.dt
    this.sample++
    // Slow illustrative lumped coolant state, independent of ambient temperature.
    this.coolant +=
      ((Math.max(0, torque * this.omega) * 0.12 -
        (this.coolant - c.temperature) * 110) /
        90000) *
      this.dt
    this.filter += 0.12 * (audio - this.filter)
    const high = this.filter - this.previousAudio + 0.995 * this.audioHighpass
    this.previousAudio = this.filter
    this.audioHighpass = high
    return Math.tanh((high + this.inductionSound()) * 2) * 0.65
  }
  /** Compressor whistle or blower whine, plus blow-off noise; bounded. */
  private inductionSound() {
    const induction = this.induction
    if (!induction.boosted) return 0
    const kind = induction.config.kind
    // Roots: three-lobe rotor pair; centrifugal wheels: shaft rate.
    const hz = kind === 'roots' ? induction.shaftHz * 6 : induction.shaftHz
    this.whinePhase = (this.whinePhase + ((hz * this.dt) % 1)) % 1
    const loud = Math.min(
      1,
      Math.abs(induction.supply - this.conditions.pressure) / 100000,
    )
    const whine =
      hz < 18000 ? Math.sin(2 * Math.PI * this.whinePhase) * 0.05 * loud : 0
    // Deterministic noise so results do not depend on host or batching.
    this.noise ^= this.noise << 13
    this.noise ^= this.noise >>> 17
    this.noise ^= this.noise << 5
    const white = (this.noise >>> 0) / 4294967296 - 0.5
    // Blow-off hiss follows the pressure being dumped, so it fades as it empties.
    const dumped = (induction.outlet - this.conditions.pressure) / 40000
    const target = induction.venting
      ? 0.5 * Math.min(1, dumped)
      : induction.surge
        ? 0.15
        : 0
    this.ventSound +=
      (target - this.ventSound) * (target > this.ventSound ? 0.01 : 0.0003)
    return whine + white * this.ventSound
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
    }
  }
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
