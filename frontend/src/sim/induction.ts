import type { Conditions, EngineDefinition, Induction, Pascals } from './schema'
import { displacement } from './schema'
import {
  CP,
  clamp,
  enthalpy,
  internalEnergy,
  massFlow,
  omegaToRpm,
  R,
  temperatureFromEnergy,
} from './physics'

/** Calibration constants; see docs/SIMULATION.md for their basis. */
const SLIP = 0.9
/** Choke flow coefficient: mass flow / (inlet density × tip speed × diameter²). */
const CHOKE_FLOW = 0.14
const EXHAUST_CP = 1150
const EXHAUST_EXPONENT = 0.248
const BEARING_DRAG = 3e-6
const WASTEGATE_LAG = 0.08
const CHARGE_THERMAL_LAG = 0.6

export type InductionTelemetry = {
  kind: Induction['kind']
  /** Pressure feeding the throttle, gauge Pa. */
  boost: number
  chargeTemperature: number
  shaftRpm: number
  wastegate: number
  /** Turbo exhaust manifold pressure, gauge Pa; 0 without a turbo. */
  exhaustBackPressure: number
  venting: boolean
  surge: boolean
}

/**
 * Lumped charge-air path: compressor → charge pipe/intercooler volume →
 * throttle, plus a turbo's exhaust manifold, turbine and shaft. Advanced once
 * per 48 kHz step from the cylinders' flows over that step.
 */
export class InductionSystem {
  readonly config: Induction
  /** Compressor outlet pressure, Pa. */
  outlet: number
  /** Pressure available to the throttle after the intercooler drop, Pa. */
  supply: number
  chargeTemperature: number
  exhaustPressure: number
  exhaustTemperature: number
  shaftOmega = 0
  wastegate = 0
  surge = false
  venting = false
  /** Brake torque the induction takes from the crank, Nm. */
  crankTorque = 0
  /** Exhaust leaving to atmosphere this step, kg/s (turbo only). */
  tailpipeFlow = 0
  /** Compressor (or blower) shaft revolutions per second, for sound. */
  shaftHz = 0
  private ambient: number
  private ambientTemperature: number
  private density: number
  private densityRatio: number
  private chargeVolume: number
  private exhaustVolume: number
  private exhaustMass = 0
  private exhaustEnergy = 0
  private exhaustHeatLoss: number
  private ventArea: number
  private wastegateArea: number
  private passArea: number
  private engineFlow = 0

  constructor(
    engine: EngineDefinition,
    conditions: Conditions,
    density: number,
    densityRatio: number,
  ) {
    this.config = engine.induction
    this.ambient = conditions.pressure
    this.ambientTemperature = conditions.temperature
    this.density = density
    this.densityRatio = densityRatio
    this.outlet = this.supply = conditions.pressure
    this.chargeTemperature = conditions.temperature
    this.exhaustPressure = conditions.pressure
    this.exhaustTemperature = conditions.temperature
    const size = displacement(engine)
    // Pipes and intercooler hold about twice the displacement; the turbo
    // manifold about one displacement. Never so small the plenum is stiff.
    this.chargeVolume = Math.max(2 * size, 0.0005)
    this.exhaustVolume = Math.max(size, 0.0003)
    this.exhaustHeatLoss = 30 * (size / 0.002) ** (2 / 3)
    this.exhaustMass =
      (this.ambient * this.exhaustVolume) / (R * this.ambientTemperature)
    this.exhaustEnergy =
      this.exhaustMass * internalEnergy(this.ambientTemperature)
    const pistonArea = (Math.PI * engine.bore ** 2) / 4
    // Blow-off/bypass valves sized like one intake runner per cylinder.
    this.ventArea = 0.15 * pistonArea * engine.cylinders
    // The wastegate port is sized for the engine, not the turbine, so a tiny
    // turbine can still be bypassed.
    this.wastegateArea =
      engine.induction.kind === 'turbo'
        ? Math.max(
            engine.induction.turbineArea,
            0.5 * engine.exhaustArea * engine.cylinders,
          )
        : 0
    const c = this.config
    this.passArea =
      c.kind === 'turbo' || c.kind === 'centrifugal'
        ? 0.5 * Math.PI * (c.compressorDiameter / 2) ** 2
        : 0
  }

  get boosted() {
    return this.config.kind !== 'none'
  }

  /**
   * @param intakeFlow  mean flow into the cylinders over the step, kg/s
   * @param exhaustMass exhaust mass the cylinders pushed into the manifold
   * @param exhaustEnthalpy enthalpy carried with it, J
   * @param manifold    intake manifold (post-throttle) pressure, Pa
   */
  step(
    dt: number,
    crankOmega: number,
    intakeFlow: number,
    exhaustMass: number,
    exhaustEnthalpy: number,
    manifold: number,
  ) {
    const c = this.config
    if (c.kind === 'none') return
    const pa = this.ambient
    const ta = this.ambientTemperature
    // Smooth the strongly pulsed cylinder demand over a few milliseconds.
    this.engineFlow += ((intakeFlow - this.engineFlow) * dt) / 0.004
    const ratio = this.outlet / pa
    let flow: number
    let work = 0
    this.surge = false
    if (c.kind === 'roots') {
      this.shaftOmega = crankOmega * c.driveRatio
      const revs = this.shaftOmega / (2 * Math.PI)
      const swept = c.rotorDisplacement * revs
      // Internal leakage back past the rotors grows with pressure difference.
      const leakArea = 0.012 * c.rotorDisplacement ** (2 / 3)
      const leak =
        this.outlet > pa
          ? massFlow(
              this.outlet as Pascals,
              pa as Pascals,
              this.chargeTemperature,
              leakArea,
            )
          : -massFlow(pa as Pascals, this.outlet as Pascals, ta, leakArea)
      flow = this.density * swept - leak * this.densityRatio
      // No internal compression: the blower pushes its volume against outlet pressure.
      const power = Math.max(0, (swept * (this.outlet - pa)) / c.efficiency)
      // Heating is shared by all the air swept, including what leaks back.
      work = swept > 1e-9 ? power / (this.density * swept) : 0
      this.crankTorque = power / Math.max(crankOmega, 5)
    } else {
      if (c.kind === 'centrifugal') this.shaftOmega = crankOmega * c.driveRatio
      const tip = (this.shaftOmega * c.compressorDiameter) / 2
      const choke = this.density * CHOKE_FLOW * tip * c.compressorDiameter ** 2
      const shutoff =
        (1 + (c.compressorEfficiency * SLIP * tip * tip) / (CP * ta)) ** 3.5
      // Elliptical speed line: flat near shut-off, steep towards choke.
      let mapFlow = choke
      if (ratio > 1)
        mapFlow =
          ratio < shutoff
            ? choke * Math.sqrt(1 - ((ratio - 1) / (shutoff - 1)) ** 2)
            : 0
      // A slow or stationary wheel still lets the engine draw air through it.
      const pass =
        this.outlet < pa
          ? massFlow(pa as Pascals, this.outlet as Pascals, ta, this.passArea) *
            this.densityRatio
          : 0
      flow = Math.max(mapFlow, pass)
      this.surge = ratio > 1.15 && mapFlow < 0.2 * choke
      if (ratio > 1 && mapFlow > 0) {
        const fraction = choke > 0 ? mapFlow / choke : 0
        const efficiency = clamp(
          c.compressorEfficiency * (1 - 1.5 * (fraction - 0.65) ** 2),
          0.3,
          c.compressorEfficiency,
        )
        work = (CP * ta * (ratio ** (1 / 3.5) - 1)) / efficiency
      }
      const power = flow * work
      if (c.kind === 'centrifugal')
        this.crankTorque = power / 0.95 / Math.max(crankOmega, 5)
      else this.turbo(c, dt, exhaustMass, exhaustEnthalpy, power)
    }
    // Blow-off / bypass vents the charge when the throttle is closed.
    const vents =
      (c.kind === 'roots' ? c.bypass : c.blowOff) &&
      manifold < 0.6 * this.supply
    let vent = 0
    if (vents) {
      vent =
        this.outlet > pa
          ? massFlow(
              this.outlet as Pascals,
              pa as Pascals,
              this.chargeTemperature,
              this.ventArea,
            )
          : -massFlow(pa as Pascals, this.outlet as Pascals, ta, this.ventArea)
      vent *= this.densityRatio
      if (c.kind !== 'roots') this.surge = false
    }
    this.venting = vents && this.outlet > pa + 5000
    this.outlet +=
      ((R * this.chargeTemperature) / this.chargeVolume) *
      (flow - this.engineFlow - vent) *
      dt
    this.outlet = Math.max(this.outlet, 0.05 * pa)
    const drop =
      c.intercooler.pressureDrop * (Math.max(0, this.engineFlow) / 0.1) ** 2
    this.supply = Math.max(this.outlet - drop, 0.05 * pa)
    const compressed = ta + Math.min(work / CP, 400)
    const cooled = compressed - c.intercooler.effectiveness * (compressed - ta)
    this.chargeTemperature +=
      ((cooled - this.chargeTemperature) * dt) / CHARGE_THERMAL_LAG
    this.shaftHz = this.shaftOmega / (2 * Math.PI)
  }

  private turbo(
    c: Extract<Induction, { kind: 'turbo' }>,
    dt: number,
    mass: number,
    energy: number,
    compressorPower: number,
  ) {
    const pa = this.ambient
    this.exhaustMass += mass
    this.exhaustEnergy += energy
    let t = temperatureFromEnergy(this.exhaustEnergy / this.exhaustMass)
    let p = (this.exhaustMass * R * t) / this.exhaustVolume
    const turbine = massFlow(p as Pascals, pa as Pascals, t, c.turbineArea)
    const gate = massFlow(
      p as Pascals,
      pa as Pascals,
      t,
      this.wastegateArea * this.wastegate,
    )
    let turbinePower = 0
    if (p > pa) {
      const expansion = 1 - (pa / p) ** EXHAUST_EXPONENT
      const spouting = Math.sqrt(2 * EXHAUST_CP * t * expansion)
      const blade = (this.shaftOmega * 0.45 * c.compressorDiameter) / spouting
      const efficiency =
        c.turbineEfficiency * clamp(1 - ((blade - 0.7) / 0.7) ** 2, 0.15, 1)
      turbinePower = turbine * EXHAUST_CP * t * expansion * efficiency
    }
    const out = Math.min(turbine + gate, (0.5 * this.exhaustMass) / dt)
    this.exhaustMass -= out * dt
    this.exhaustEnergy -= out * dt * enthalpy(t)
    this.exhaustEnergy -= this.exhaustHeatLoss * (t - 450) * dt
    t = temperatureFromEnergy(this.exhaustEnergy / this.exhaustMass)
    p = (this.exhaustMass * R * t) / this.exhaustVolume
    // A turbine far too small for the engine traps the exhaust; say so
    // instead of letting the cylinders fail with a generic range error.
    if (p > 30 * pa || t > 2500)
      throw new Error(
        'Turbine too small for this engine: exhaust back pressure or temperature left the supported range. Increase the turbine nozzle area.',
      )
    this.exhaustPressure = p
    this.exhaustTemperature = t
    this.tailpipeFlow = out
    const drag = BEARING_DRAG * this.shaftOmega
    this.shaftOmega = Math.max(
      0,
      this.shaftOmega +
        (((turbinePower - compressorPower) / Math.max(this.shaftOmega, 200) -
          drag) /
          c.shaftInertia) *
          dt,
    )
    // Spring-and-diaphragm style: opens progressively above the target.
    const target = clamp(
      (this.supply - pa - c.boostTarget) / Math.max(15000, 0.2 * c.boostTarget),
      0,
      1,
    )
    this.wastegate += ((target - this.wastegate) * dt) / WASTEGATE_LAG
  }

  overspeed() {
    const c = this.config
    return (
      (c.kind === 'turbo' || c.kind === 'centrifugal') &&
      omegaToRpm(this.shaftOmega) > c.maxShaftRpm
    )
  }

  telemetry(): InductionTelemetry {
    return {
      kind: this.config.kind,
      boost: this.supply - this.ambient,
      chargeTemperature: this.chargeTemperature,
      shaftRpm: omegaToRpm(this.shaftOmega),
      wastegate: this.wastegate,
      exhaustBackPressure:
        this.config.kind === 'turbo' ? this.exhaustPressure - this.ambient : 0,
      venting: this.venting,
      surge: this.surge,
    }
  }
}
