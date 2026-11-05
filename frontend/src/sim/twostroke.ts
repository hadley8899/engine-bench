/**
 * Crankcase-scavenged, loop-scavenged two-stroke core (model 1.14.0).
 * Same fixed 48 kHz step, gas model, combustion, knock, fuel, parts and
 * sound as the four-stroke core (core.ts), with the piston opening ports
 * in the liner, the crankcase pumping the charge, a two-zone scavenging
 * model with short-circuit loss and a one-dimensional exhaust pipe
 * (pipe.ts). See docs/SIMULATION.md ("Two-stroke engines").
 */
import { conditionsSchema, displacement, lookup, pipeSegments, validateEngine } from './schema'
import type {
  Conditions,
  EngineDefinition,
  Pascals,
  RadiansPerSecond,
  TwoStroke,
} from './schema'
import { InductionSystem } from './induction'
import { Acoustics, AcousticInput } from './acoustics'
import type { Listener } from './acoustics'
import { CylinderThermal } from './thermal'
import { validateRoad, Vehicle } from './road'
import { FUELS, FuelDelivery, LEAN_MISFIRE, RICH_MISFIRE } from './fuel'
import { BurnedGas, FREEZE } from './chemistry'
import { partsInertia, Stress } from './parts'
import { Pipe } from './pipe'
import {
  END_GAS_EXPONENT,
  IDLE_INTEGRAL,
  KNOCK_DELAY,
  KNOCK_SENSED,
  KNOCK_WINDOW_BURN,
  laminarFlame,
  MAP_INTERVAL,
  MIN_ADVANCE,
  RETARD_LIMIT,
  RETARD_RECOVERY,
  RETARD_STEP,
  THERMAL_INTERVAL,
  turbulentFlame,
  WALL_ABOVE_COOLANT,
  WALL_HEAT,
} from './core'
import type { Controls, Telemetry } from './core'
import {
  atmosphere,
  clamp,
  CV_A,
  CV_B,
  enthalpy,
  internalEnergy,
  massFlow,
  omegaToRpm,
  powerKw,
  R,
  rpmToOmega,
  TAU,
  temperatureFromEnergy,
  wiebe,
} from './physics'

/** Port discharge coefficient (sharp-edged port window). */
const PORT_DISCHARGE = 0.7
/** Share of a bridged exhaust port's width the bridge blocks. */
const BRIDGE = 0.1
/** Effective flowing width of the exhaust port, m. */
const exhaustWidth = (t: TwoStroke) =>
  t.exhaustPort.width * (t.exhaustPort.bridge ? 1 - BRIDGE : 1)
/**
 * Two-zone (Benson–Brandham) scavenging by transfer layout: the share of
 * the cylinder's gas the incoming charge displaces before it starts to
 * mix, and the share that short-circuits straight to the exhaust.
 * Calibration estimates for loop scavenging, not measurements.
 */
export const SCAVENGING = {
  2: { displacement: 0.25, shortCircuit: 0.2 },
  3: { displacement: 0.35, shortCircuit: 0.15 },
  5: { displacement: 0.45, shortCircuit: 0.1 },
} as const
/**
 * Friction mean effective pressure of a roller-bearing two-stroke per
 * revolution (no valvetrain): static, per m/s and per (m/s)² of mean
 * piston speed.
 */
const FMEP_STATIC = 30000
const FMEP_LINEAR = 2000
const FMEP_QUADRATIC = 250
/** Idle speed the idle air holds, RPM. */
const IDLE_RPM = 1400
/** The charge fails to light when less than this share of it is fresh. */
const DILUTION_MISFIRE = 0.3
/** Crankcase gas relaxes to the crankcase wall with this time constant, s. */
const CRANKCASE_HEAT_TIME = 0.15
/** Reed petals open fully at this depression for 500 Hz petals, Pa. */
const REED_PRESSURE = 12000
/** A rotary disc's edge sweeps across the port over this many degrees. */
const DISC_EDGE = 15
/** Power valve actuator time constant, s. */
const VALVE_TIME = 0.15
/** Transfer duct length per metre of stroke. */
const TRANSFER_DUCT = 1.2
/** Throttle discharge coefficient, and airbox volume per m³ of displacement. */
const THROTTLE_DISCHARGE = 0.8
const AIRBOX = 0.5
/** Wave speed for the expansion chamber's tuned-speed rule, m/s (Jennings). */
const WAVE_SPEED = 518

export type TwoStrokeTelemetry = {
  /** Per cylinder, last cycle: delivered charge over swept volume at ambient density. */
  delivery: number[]
  /** Share of the delivered fresh charge that stayed trapped. */
  trapping: number[]
  /** Share of the trapped gas that is fresh charge. */
  scavenging: number[]
  /** Crankcase pressure, Pa. */
  crankcase: number[]
  /** Pressure at the exhaust port, Pa. */
  port: number[]
  /** Share of the fuel delivered that left unburned through the exhaust (smoothed). */
  fuelLost: number
  /** Power valve opening 0–1, or null without one. */
  powerValve: number | null
  /** Reed petal opening 0–1 per cylinder, or null without reeds. */
  reed: number[] | null
  /** Pressure along cylinder 1's pipe, Pa, from the port to the outlet. */
  pipe: number[]
}

interface Cylinder {
  mass: number
  energy: number
  fresh: number
  fuel: number
  heat: number
  burn: number
  phase: number
  pressure: number
  volume: number
  unburned: number
  spareAir: number
  spark: number
  duration: number
  sparked: boolean
  retard: number
  knock: number
  knockOpen: boolean
  knockOnset: number
  knockRate: number
  ivcPressure: number
  ivcTemperature: number
  knockIndex: number
  knockIntensity: number
  burned: number
  burnedHeat: number
  burnFresh: number
  held: number
  molesFactor: number
  gas: BurnedGas
  thermal: CylinderThermal
  /** Displacement zone: delivered charge that has not mixed yet, kg. */
  zone: number
  zoneFresh: number
  zoneFuel: number
  /** Short-circuit charge on its way to the exhaust, kg. */
  bypass: number
  bypassFresh: number
  bypassFuel: number
  /** Cylinder gas when the transfers opened; scales the displacement phase. */
  reference: number
  /** This cycle: charge delivered, its fresh air, and fresh air lost. */
  delivered: number
  deliveredFresh: number
  lostFresh: number
  /** Ports open at the previous substep. */
  exhaustOpen: boolean
  transferOpen: boolean
  /** Last trapped cycle's scavenging figures. */
  deliveryRatio: number
  trapping: number
  scavenging: number
  /** Crankcase gas: mass, energy, fresh air and fuel, kg and J. */
  ccMass: number
  ccEnergy: number
  ccFresh: number
  ccFuel: number
  ccPressure: number
  ccVolume: number
  /** Intake tract flow, kg/s (positive into the crankcase). */
  runner: number
  /** Transfer duct flow, kg/s (positive into the cylinder). */
  transfer: number
  /** Reed petal opening, 0–1. */
  reed: number
  /** Charge spat back into the intake: it returns first, with its fuel. */
  pushed: number
  pushedFuel: number
  pipe: Pipe
  /** Port flows this step: mass, energy, fresh air and fuel into the pipe. */
  portMass: number
  portEnergy: number
  portFresh: number
  portFuel: number
}

/** Piston travel from top dead centre at crank angle θ, m. */
function travel(e: EngineDefinition, theta: number) {
  const r = e.stroke / 2
  const s = Math.sin(theta)
  return r * (1 - Math.cos(theta)) + e.rodLength - Math.sqrt(e.rodLength ** 2 - (r * s) ** 2)
}
/** Crank angle after top dead centre (0–180°) at which travel reaches `depth`. */
function angleAt(e: EngineDefinition, depth: number) {
  let lo = 0
  let hi = Math.PI
  if (depth <= 0) return 0
  if (depth >= e.stroke) return 180
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (travel(e, mid) < depth) lo = mid
    else hi = mid
  }
  return (((lo + hi) / 2) * 180) / Math.PI
}

export type PortTiming = {
  /** Exhaust opens, degrees after top dead centre; duration in degrees. */
  exhaustOpen: number
  exhaustDuration: number
  transferOpen: number
  transferDuration: number
  /** Degrees between exhaust and transfer opening. */
  blowdown: number
  /** Intake opens before and closes after top dead centre, degrees. */
  intakeOpen: number | null
  intakeClose: number | null
  intakeDuration: number | null
  /** Compression ratio from exhaust closing, and the full-stroke ratio. */
  trappedCompression: number
  geometricCompression: number
  /** Specific time-areas at `rpm`, s·m²/m³ (Blair's measure). */
  blowdownTimeArea: number
  exhaustTimeArea: number
  transferTimeArea: number
  intakeTimeArea: number | null
  rpm: number
  /** Expansion chamber's estimated tuned speed, RPM, or null for a straight pipe. */
  tunedRpm: number | null
  /** Port to the middle of the baffle, m (the reflection length). */
  tunedLength: number | null
}

/**
 * Port timing derived from geometry: opening angles, durations, trapped
 * compression and Blair's specific time-areas at a given speed. With a
 * power valve, the valve open (high speed) is shown.
 */
export function portTiming(e: EngineDefinition, rpm = e.revLimit): PortTiming {
  const t = e.twoStroke!
  const ex = angleAt(e, t.exhaustPort.height)
  const tr = angleAt(e, t.transfers.height)
  const area = (Math.PI * e.bore ** 2) / 4
  const swept = area * e.stroke
  const clearance = swept / (e.compression - 1)
  // ∫A dθ over the open period, converted to seconds at `rpm`.
  const steps = 720
  let blowdown = 0
  let exhaust = 0
  let transfer = 0
  let intake = 0
  for (let k = 0; k < steps; k++) {
    const theta = ((k + 0.5) / steps) * TAU
    const x = travel(e, theta)
    const exA = exhaustWidth(t) * Math.max(0, x - t.exhaustPort.height)
    const trA = t.transfers.width * Math.max(0, x - t.transfers.height)
    exhaust += exA
    transfer += trA
    if (trA === 0) blowdown += exA
    intake += intakeArea(e, t, theta, x, 1)
  }
  const perStep = TAU / steps / rpmToOmega(rpm) / swept
  const intakeTiming =
    t.intake.kind === 'piston'
      ? 180 - angleAt(e, e.stroke - t.intake.height)
      : t.intake.kind === 'rotary'
        ? t.intake.open
        : null
  const intakeClosing =
    t.intake.kind === 'piston'
      ? intakeTiming
      : t.intake.kind === 'rotary'
        ? t.intake.close
        : null
  const tuned = tunedLength(t)
  const exhaustDuration = 360 - 2 * ex
  return {
    exhaustOpen: ex,
    exhaustDuration,
    transferOpen: tr,
    transferDuration: 360 - 2 * tr,
    blowdown: tr - ex,
    intakeOpen: intakeTiming,
    intakeClose: intakeClosing,
    intakeDuration:
      intakeTiming !== null && intakeClosing !== null
        ? intakeTiming + intakeClosing
        : null,
    trappedCompression: (clearance + area * t.exhaustPort.height) / clearance,
    geometricCompression: e.compression,
    blowdownTimeArea: blowdown * perStep,
    exhaustTimeArea: exhaust * perStep,
    transferTimeArea: transfer * perStep,
    intakeTimeArea: t.intake.kind === 'reed' ? null : intake * perStep,
    rpm,
    tunedRpm:
      tuned === null ? null : (exhaustDuration * WAVE_SPEED) / (12 * tuned),
    tunedLength: tuned,
  }
}
/** Port to the middle of the baffle cones: where the plugging pulse reflects from. */
function tunedLength(t: TwoStroke) {
  const pipe = t.pipe
  if (pipe.kind !== 'chamber') return null
  let length = pipe.header.length
  for (const cone of pipe.diffuser) length += cone.length
  length += pipe.belly.length
  length += pipe.baffle.reduce((s, c) => s + c.length, 0) / 2
  return length
}
/** Intake flow area at crank angle θ (0 = top dead centre); reeds scale by petal opening. */
function intakeArea(
  e: EngineDefinition,
  t: TwoStroke,
  theta: number,
  x: number,
  reed: number,
) {
  const intake = t.intake
  if (intake.kind === 'piston')
    return (
      PORT_DISCHARGE * intake.width * Math.max(0, e.stroke - x - intake.height)
    )
  if (intake.kind === 'reed') return intake.area * reed
  // Degrees after the disc starts to open (window centred over TDC).
  const deg = (theta * 180) / Math.PI
  const since = (deg + intake.open) % 360
  const window = intake.open + intake.close
  if (since >= window) return 0
  const edge = Math.min(since, window - since) / DISC_EDGE
  return intake.area * (edge >= 1 ? 1 : Math.sin((edge * Math.PI) / 2))
}

const wrapRev = (a: number) => ((a % TAU) + TAU) % TAU

export class TwoStrokeCore {
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
  starterStalled = false
  readonly induction: InductionSystem
  readonly fuel: FuelDelivery
  lambda: number
  readonly acoustics: Acoustics
  sound = true
  knockPeak = 0
  readonly stress: Stress
  /** Two-strokes have no cams; kept so hosts can treat both cores alike. */
  highCam = false
  /** Power valve opening, 0 (closed, port lowered) to 1. */
  powerValve = 1
  private misfireTime = -Infinity
  private stallTime = 0
  private knockTime = -Infinity
  private knockEvent = 0
  private input = new AcousticInput()
  private ts: TwoStroke
  private phases: number[]
  private traces: Float32Array[]
  private crowns: number[]
  private knocks: number[]
  private pistonArea: number
  private clearanceVolume: number
  private crankcaseMinimum: number
  private frictionPerPascal: number
  private audioScale: number
  private intakeEnthalpy: number
  private woschniBore: number
  private airDensity: number
  private airDensityRatio: number
  private oxygen: number
  private chargeFuel: number
  private sparkCut: boolean
  private grade: (typeof FUELS)[keyof typeof FUELS]
  private octaneDelay: number
  private referenceFlame: number
  private pistonSpeedPerRpm: number
  private inertia: number
  private exhaustReference: number
  private runnerGain: number
  private runnerArea: number
  /** Transfer duct cross-section over length, m. */
  private transferGain: number
  /** Throttle bore flow area wide open, m², and the tract volume behind it, m³. */
  private throttleArea: number
  private manifoldVolume: number
  /** Gas in the intake tract between throttle and crankcase, kg. */
  private manifoldMass: number
  private scavenging: { displacement: number; shortCircuit: number }
  private direct: boolean
  private idleTrim = 0
  private sparkAdvance: number
  private targetLambda: number
  private mapsRead = false
  private moles = 1
  private fuelDelivered = 0
  private fuelLost = 0
  private sweptMass: number

  constructor(engine: EngineDefinition, conditions: Conditions) {
    this.engine = validateEngine(engine)
    if (this.engine.cycle !== 'two-stroke' || !this.engine.twoStroke)
      throw new Error('TwoStrokeCore runs two-strokes; use createCore.')
    const e = this.engine
    const t = (this.ts = e.twoStroke!)
    this.conditions = conditionsSchema.parse(conditions)
    const count = e.cylinders
    this.traces = Array.from({ length: count }, () => new Float32Array(360))
    this.crowns = new Array<number>(count).fill(0)
    this.knocks = new Array<number>(count).fill(0)
    this.pistonArea = (Math.PI * e.bore ** 2) / 4
    const swept = this.pistonArea * e.stroke
    this.clearanceVolume = swept / (e.compression - 1)
    this.crankcaseMinimum = swept / (t.crankcaseCompression - 1)
    this.stress = new Stress(e)
    this.inertia = e.inertia + partsInertia(e)
    // One power stroke per revolution: friction work per revolution.
    this.frictionPerPascal = displacement(e) / TAU
    this.audioScale = 0.002 / displacement(e)
    this.grade = FUELS[e.combustion.fuel]
    BurnedGas.prepare(this.grade)
    this.chargeFuel = (displacement(e) / count) * (1.2 / this.grade.stoichiometric)
    this.sparkAdvance = e.ignitionAdvance
    this.targetLambda = e.lambda
    this.octaneDelay = KNOCK_DELAY * (this.grade.octane / 100) ** 3.402
    this.pistonSpeedPerRpm = (2 * e.stroke) / 60
    this.referenceFlame = turbulentFlame(
      laminarFlame(FUELS.ron95.flame, 1, 700, 1.5e6, 0.08),
      this.pistonSpeedPerRpm * 3000,
    )
    this.acoustics = new Acoustics(e, conditions.temperature)
    this.intakeEnthalpy = enthalpy(conditions.temperature)
    this.woschniBore = 3.26 * e.bore ** -0.2
    this.manifold = conditions.pressure
    this.coolant = conditions.coolant
    const air = atmosphere(conditions)
    this.oxygen = air.oxygenMassFraction
    this.airDensity = air.density
    this.airDensityRatio =
      air.density / (conditions.pressure / R / conditions.temperature)
    this.sweptMass = swept * air.density
    // Fires once a revolution: one cylinder's exhaust at 6,000 RPM.
    this.exhaustReference = (swept * 1.2 * 6000) / 60
    // The tract is about as wide as the reed cage, rotary window or port.
    const full = intakeArea(e, t, 0, 0, 1)
    this.runnerArea = Math.max(full, 0.1 * this.pistonArea)
    this.runnerGain = this.runnerArea / e.intakeRunnerLength
    // Ducts as wide as the ports fully open, about a stroke long.
    this.transferGain =
      (t.transfers.width * (e.stroke - t.transfers.height)) /
      (TRANSFER_DUCT * e.stroke)
    // The carburettor slide or throttle plate meters flow into the tract.
    const bore =
      e.fuelSystem.kind === 'carburettor'
        ? e.fuelSystem.chokes * Math.PI * (e.fuelSystem.chokeDiameter / 2) ** 2
        : this.runnerArea
    this.throttleArea = THROTTLE_DISCHARGE * bore
    this.manifoldVolume =
      this.runnerArea * e.intakeRunnerLength + AIRBOX * displacement(e)
    this.manifoldMass =
      (conditions.pressure * this.manifoldVolume) / (R * conditions.temperature)
    this.sparkCut =
      e.limiterCut === 'spark' || e.fuelSystem.kind === 'carburettor'
    this.direct = e.fuelSystem.kind === 'direct'
    this.scavenging = SCAVENGING[t.transfers.count]
    this.induction = new InductionSystem(e, conditions, air.density, this.airDensityRatio)
    this.fuel = new FuelDelivery(e, air.density)
    this.lambda = e.lambda
    this.powerValve = t.powerValve ? 0 : 1
    // Twins fire 180° or 360° apart, cylinder 1 first.
    const step = (t.crankPhase * Math.PI) / 180
    this.phases = Array.from(
      { length: count },
      (_, c) => (e.firingOrder.indexOf(c + 1) * step) % TAU,
    )
    const segments = pipeSegments(t.pipe)
    const T = conditions.temperature
    for (const phase of this.phases) {
      const theta = wrapRev(-phase)
      const x = travel(e, theta)
      const volume = this.clearanceVolume + this.pistonArea * x
      const mass = (conditions.pressure * volume) / (R * T)
      const ccVolume = this.crankcaseMinimum + this.pistonArea * (e.stroke - x)
      const ccMass = (conditions.pressure * ccVolume) / (R * T)
      const gas = new BurnedGas()
      gas.set(this.grade, 1)
      this.cylinders.push({
        mass,
        energy: mass * internalEnergy(T),
        fresh: 0,
        fuel: 0,
        heat: 0,
        burn: 1,
        phase: theta,
        pressure: conditions.pressure,
        volume,
        unburned: 0,
        spareAir: 0,
        spark: TAU - (e.ignitionAdvance * Math.PI) / 180,
        duration: e.burnDuration,
        sparked: false,
        retard: 0,
        knock: 0,
        knockOpen: false,
        knockOnset: -1,
        knockRate: 0,
        ivcPressure: conditions.pressure,
        ivcTemperature: T,
        knockIndex: 0,
        knockIntensity: 0,
        burned: 0,
        burnedHeat: 0,
        burnFresh: 0,
        held: 0,
        molesFactor: 1,
        gas,
        thermal: new CylinderThermal(conditions.coolant),
        zone: 0,
        zoneFresh: 0,
        zoneFuel: 0,
        bypass: 0,
        bypassFresh: 0,
        bypassFuel: 0,
        reference: mass,
        delivered: 0,
        deliveredFresh: 0,
        lostFresh: 0,
        exhaustOpen: x > t.exhaustPort.height,
        transferOpen: x > t.transfers.height,
        deliveryRatio: 0,
        trapping: 0,
        scavenging: 0,
        // The crankcase starts primed with mixture, like a warm engine.
        ccMass,
        ccEnergy: ccMass * internalEnergy(T),
        ccFresh: ccMass,
        ccFuel: this.direct ? 0 : ccMass * this.fuel.fuelPerAir,
        ccPressure: conditions.pressure,
        ccVolume,
        runner: 0,
        transfer: 0,
        reed: 0,
        pushed: 0,
        pushedFuel: 0,
        pipe: new Pipe(segments, conditions.pressure, T),
        portMass: 0,
        portEnergy: 0,
        portFresh: 0,
        portFuel: 0,
      })
    }
  }

  /** Carries a running two-stroke's state over to an edited definition. */
  static continueFrom(
    previous: TwoStrokeCore,
    engine: EngineDefinition,
    conditions: Conditions,
  ) {
    const core = new TwoStrokeCore(engine, conditions)
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
    core.idleTrim = previous.idleTrim
    core.manifoldMass =
      (previous.manifold * core.manifoldVolume) /
      (R * previous.induction.chargeTemperature)
    core.maxSubsteps = previous.maxSubsteps
    core.sound = previous.sound
    core.powerValve = previous.powerValve
    core.fuelDelivered = previous.fuelDelivered
    core.fuelLost = previous.fuelLost
    core.acoustics.adopt(previous.acoustics)
    core.traces = previous.traces.map((t) => t.slice())
    core.induction.adopt(previous.induction)
    core.stress.adopt(previous.stress)
    core.fuel.adopt(previous.fuel)
    if (previous.cylinders.length !== core.cylinders.length) return core
    const p = previous.engine
    const samePipe =
      JSON.stringify(p.twoStroke!.pipe) === JSON.stringify(engine.twoStroke!.pipe)
    for (let i = 0; i < core.cylinders.length; i++) {
      const old = previous.cylinders[i]
      const cyl = core.cylinders[i]
      const fresh = cyl.pipe
      // Gas keeps its pressure and temperature; mass follows the new volumes.
      const scale = cyl.volume / old.volume
      const ccScale = cyl.ccVolume / old.ccVolume
      Object.assign(cyl, old, {
        thermal: cyl.thermal,
        gas: cyl.gas,
        pipe: samePipe ? old.pipe : fresh,
        volume: cyl.volume,
        ccVolume: cyl.ccVolume,
      })
      cyl.thermal.adopt(old.thermal)
      if (p.combustion.fuel === engine.combustion.fuel) cyl.gas.adopt(old.gas)
      for (const k of [
        'mass',
        'energy',
        'fresh',
        'fuel',
        'heat',
        'unburned',
        'spareAir',
        'burned',
        'burnedHeat',
        'burnFresh',
        'held',
        'zone',
        'zoneFresh',
        'zoneFuel',
        'bypass',
        'bypassFresh',
        'bypassFuel',
      ] as const)
        cyl[k] = old[k] * scale
      for (const k of ['ccMass', 'ccEnergy', 'ccFresh', 'ccFuel'] as const)
        cyl[k] = old[k] * ccScale
      if (!engine.combustion.knockControl) cyl.retard = 0
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

  step(): number {
    const e = this.engine
    const c = this.conditions
    const t = this.ts
    const rpm = omegaToRpm(this.omega)
    if (rpm >= e.revLimit) this.limited = true
    else if (rpm < e.revLimit - 220) this.limited = false
    this.warning =
      rpm > e.mechanicalLimit ? 'Estimated mechanical RPM limit exceeded' : ''
    // Idle air with an integral trim, held while the pedal is pressed.
    if (this.controls.ignition && rpm > 300 && this.controls.throttle < 0.01)
      this.idleTrim = clamp(
        this.idleTrim + (IDLE_RPM - rpm) * IDLE_INTEGRAL * this.dt,
        0,
        0.3,
      )
    else if (!this.controls.ignition) this.idleTrim = 0
    const idle = this.controls.ignition
      ? clamp(0.06 + this.idleTrim + (IDLE_RPM - rpm) * 0.0003, 0, 0.5)
      : 0
    const throttle = idle + (1 - idle) * this.controls.throttle
    const maps = e.management
    if (maps && (this.sample % MAP_INTERVAL === 0 || !this.mapsRead)) {
      this.mapsRead = true
      this.sparkAdvance = lookup(maps.load, maps.rpm, maps.ignition, this.manifold, rpm)
      this.targetLambda = lookup(maps.load, maps.rpm, maps.lambda, this.manifold, rpm)
      this.fuel.setLambda(this.targetLambda)
    }
    if (t.powerValve) {
      const target = clamp((rpm - t.powerValve.rpm) / 1000, 0, 1)
      this.powerValve += ((target - this.powerValve) * this.dt) / VALVE_TIME
    }
    const exhaustEdge =
      t.exhaustPort.height + (t.powerValve ? t.powerValve.drop * (1 - this.powerValve) : 0)
    const failed = this.stress.failure !== null
    const fuel = this.fuel
    fuel.limiterCut = this.limited && !this.sparkCut
    fuel.shutOff = failed
    const induction = this.induction
    induction.inletLoss = fuel.inletLoss
    const supply = induction.supply - fuel.inletLoss
    const intakeTemperature = induction.chargeTemperature - fuel.manifoldCooling
    // Flow through the throttle fills the tract; the crankcases empty it.
    const opening = this.throttleArea * throttle * throttle * (3 - 2 * throttle)
    const admitted =
      massFlow(supply as Pascals, this.manifold as Pascals, intakeTemperature, opening) *
        this.airDensityRatio -
      massFlow(this.manifold as Pascals, supply as Pascals, intakeTemperature, opening)
    this.manifoldMass += admitted * this.dt
    const intakeEnthalpy =
      fuel.manifoldCooling > 0 ? enthalpy(intakeTemperature) : this.intakeEnthalpy
    const intakeDensity =
      (this.airDensity * c.temperature) / (c.pressure * intakeTemperature)
    const pistonSpeed = (2 * e.stroke * rpm) / 60
    const gasVelocity = (2.28 * pistonSpeed + 1) ** 0.8 * WALL_HEAT
    const n = Math.max(1, Math.ceil((this.omega * this.dt) / (Math.PI / 180)))
    this.maxSubsteps = Math.max(this.maxSubsteps, n)
    if (n > 4) throw new Error('Engine exceeded the supported integration speed.')
    const dt = this.dt / n
    const r = e.stroke / 2
    const reedPressure = t.intake.kind === 'reed' ? REED_PRESSURE * (t.intake.stiffness / 500) ** 2 : 0
    const reedRate = t.intake.kind === 'reed' ? Math.min(1, TAU * t.intake.stiffness * dt) : 0
    const wallTemperature = this.coolant - 10
    let audio = 0
    let portEnergy = 0
    let portMass = 0
    let unburned = 0
    let spareAir = 0
    let airIn = 0
    let intakeMass = 0
    let torque = 0
    let absorbed = 0
    for (let sub = 0; sub < n; sub++) {
      const da = this.omega * dt
      let indicated = 0
      for (let i = 0; i < this.cylinders.length; i++) {
        const cyl = this.cylinders[i]
        const pipe = cyl.pipe
        const phase = wrapRev(this.angle - this.phases[i])
        const deg = (phase * 180) / Math.PI
        const sin = Math.sin(phase),
          cos = Math.cos(phase)
        const root = Math.sqrt(e.rodLength ** 2 - (r * sin) ** 2)
        const x = r * (1 - cos) + e.rodLength - root
        const volume = this.clearanceVolume + this.pistonArea * x
        const derivative = this.pistonArea * (r * sin + (r * r * sin * cos) / root)
        const ccVolume = this.crankcaseMinimum + this.pistonArea * (e.stroke - x)
        const previousVolume = cyl.volume
        const previousCc = cyl.ccVolume
        let temperature = this.gasTemperature(cyl, cyl.pressure)
        let moles = this.moles
        const capacity = 1 + (cyl.burned * cyl.gas.capacityGain) / cyl.mass
        let pressure = (cyl.mass * moles * R * temperature) / previousVolume
        const outflowEnthalpy =
          capacity * internalEnergy(temperature) + moles * R * temperature
        const ccTemperature = temperatureFromEnergy(cyl.ccEnergy / cyl.ccMass)
        const ccPressure = (cyl.ccMass * R * ccTemperature) / previousCc
        const ccEnthalpy = enthalpy(ccTemperature)
        const exhaustOpen = x > exhaustEdge
        const transferOpen = x > t.transfers.height
        // Transfers opening: the gas to be scavenged sets the displacement phase.
        if (transferOpen && !cyl.transferOpen) {
          cyl.reference = cyl.mass
          cyl.delivered = 0
          cyl.deliveredFresh = 0
          cyl.lostFresh = 0
        }
        // Exhaust closing traps the charge.
        const trapping = cyl.exhaustOpen && !exhaustOpen
        cyl.exhaustOpen = exhaustOpen
        cyl.transferOpen = transferOpen

        // 1. Intake tract into the crankcase: lumped runner momentum
        // against the port's quadratic loss, solved implicitly; reeds
        // block reverse flow.
        if (t.intake.kind === 'reed') {
          const open = clamp((this.manifold - ccPressure) / reedPressure, 0, 1)
          cyl.reed += (open - cyl.reed) * reedRate
        }
        const inlet = intakeArea(e, t, phase, x, cyl.reed)
        if (inlet > 1e-9) {
          const drive = cyl.runner + this.runnerGain * dt * (this.manifold - ccPressure)
          let flow = 0
          if (drive > 0 || t.intake.kind !== 'reed') {
            const density =
              drive >= 0 ? intakeDensity * this.manifold : cyl.ccMass / previousCc
            const loss = (this.runnerGain * dt) / (2 * density * inlet * inlet)
            const size = Math.abs(drive)
            flow = (Math.sign(drive) * 2 * size) / (1 + Math.sqrt(1 + 4 * loss * size))
          }
          if (flow >= 0) {
            flow = Math.min(
              flow,
              massFlow(this.manifold as Pascals, 0 as Pascals, intakeTemperature, inlet) *
                this.airDensityRatio,
            )
            const dm = flow * dt
            cyl.ccMass += dm
            cyl.ccEnergy += dm * intakeEnthalpy
            this.ledger.inMass += dm
            this.ledger.inEnergy += dm * intakeEnthalpy
            cyl.ccFresh += dm
            const back = Math.min(dm, cyl.pushed)
            let fuelIn = 0
            if (back > 0) {
              fuelIn = (cyl.pushedFuel * back) / cyl.pushed
              cyl.pushed -= back
              cyl.pushedFuel -= fuelIn
            }
            if (!this.direct) fuelIn += (dm - back) * fuel.fuelPerAir
            cyl.ccFuel += fuelIn
            airIn += dm - back
          } else {
            const dm = Math.min(-flow * dt, cyl.ccMass * 0.08)
            flow = -dm / dt
            const share = dm / cyl.ccMass
            cyl.pushed += dm
            cyl.pushedFuel += cyl.ccFuel * share
            cyl.ccFresh -= cyl.ccFresh * share
            cyl.ccFuel -= cyl.ccFuel * share
            cyl.ccMass -= dm
            cyl.ccEnergy -= dm * ccEnthalpy
            this.ledger.inMass -= dm
            this.ledger.inEnergy -= dm * ccEnthalpy
          }
          cyl.runner = flow
          intakeMass += flow * dt
        } else cyl.runner = 0

        // 2. Transfers between crankcase and cylinder.
        const transfer = transferOpen
          ? PORT_DISCHARGE * t.transfers.width * (x - t.transfers.height)
          : 0
        if (transfer > 0) {
          // Gas in the transfer ducts has momentum: driven by the pressure
          // difference, resisted by the port's quadratic loss (implicit, as
          // for the intake), capped at choked flow.
          const drive = cyl.transfer + this.transferGain * dt * (ccPressure - pressure)
          const density = drive >= 0 ? cyl.ccMass / previousCc : cyl.mass / previousVolume
          const loss = (this.transferGain * dt) / (2 * density * transfer * transfer)
          const size = Math.abs(drive)
          let flow = (Math.sign(drive) * 2 * size) / (1 + Math.sqrt(1 + 4 * loss * size))
          if (flow >= 0) {
            flow = Math.min(
              flow,
              massFlow(ccPressure as Pascals, 0 as Pascals, ccTemperature, transfer),
              (cyl.ccMass * 0.08) / dt,
            )
            const dm = flow * dt
            const fresh = (cyl.ccFresh * dm) / cyl.ccMass
            const fuelIn = (cyl.ccFuel * dm) / cyl.ccMass
            cyl.ccMass -= dm
            cyl.ccEnergy -= dm * ccEnthalpy
            cyl.ccFresh -= fresh
            cyl.ccFuel -= fuelIn
            cyl.mass += dm
            cyl.energy += dm * ccEnthalpy
            cyl.fresh += fresh
            cyl.fuel += fuelIn
            // Short-circuit share, then displacement until the incoming
            // charge reaches the displacement share of the cylinder's gas.
            const s = this.scavenging.shortCircuit
            cyl.bypass += s * dm
            cyl.bypassFresh += s * fresh
            cyl.bypassFuel += s * fuelIn
            if (cyl.delivered < this.scavenging.displacement * cyl.reference) {
              cyl.zone += (1 - s) * dm
              cyl.zoneFresh += (1 - s) * fresh
              cyl.zoneFuel += (1 - s) * fuelIn
            }
            cyl.delivered += (1 - s) * dm
            cyl.deliveredFresh += fresh
            this.fuelDelivered += fuelIn
          } else {
            // Blowback: cylinder gas pushed down the transfers.
            flow = Math.max(
              flow,
              -massFlow(pressure as Pascals, 0 as Pascals, temperature * moles, transfer),
              (-cyl.mass * 0.08) / dt,
            )
            const dm = -flow * dt
            const out = this.removeMixed(cyl, dm)
            cyl.mass -= dm
            cyl.energy -= dm * outflowEnthalpy + out.held
            cyl.ccMass += dm
            cyl.ccEnergy += dm * outflowEnthalpy + out.held
            cyl.ccFresh += out.fresh
            cyl.ccFuel += out.fuel
            // Delivery is net: charge pushed back is not delivered twice.
            cyl.deliveredFresh -= out.fresh
            this.fuelDelivered -= out.fuel
          }
          cyl.transfer = flow
        } else cyl.transfer = 0

        // 3. Exhaust port to the pipe, both ways.
        const exhaust = exhaustOpen
          ? PORT_DISCHARGE * exhaustWidth(t) * (x - exhaustEdge)
          : 0
        if (exhaust > 0) {
          const portPressure = pipe.portPressure
          if (pressure > portPressure) {
            const dm = Math.min(
              cyl.mass * 0.08,
              massFlow(pressure as Pascals, portPressure as Pascals, temperature * moles, exhaust) * dt,
            )
            const out = this.removeOutflow(cyl, dm)
            cyl.mass -= dm
            cyl.energy -= dm * outflowEnthalpy + out.held
            cyl.portMass += dm
            cyl.portEnergy += dm * outflowEnthalpy + out.held
            cyl.portFresh += out.fresh
            cyl.portFuel += out.fuel
            cyl.lostFresh += out.fresh
            this.fuelLost += out.fuel
            unburned += out.fuel
            spareAir += (out.fresh * this.oxygen) / this.grade.oxygen
            // Unlit fuel and spare oxygen in the burned gas leave with it.
            const burnedShare = out.burned
            unburned += cyl.unburned * burnedShare
            cyl.unburned *= 1 - burnedShare
            spareAir += cyl.spareAir * burnedShare
            cyl.spareAir *= 1 - burnedShare
            portMass += dm
            portEnergy += dm * temperature
            cyl.thermal.exhaust(dm, temperature)
          } else {
            const room = pipe.portDensity * pipe.faceArea[0] * pipe.dx * 0.3
            const dm = Math.min(
              room,
              massFlow(portPressure as Pascals, pressure as Pascals, pipe.portTemperature, exhaust) * dt,
            )
            const h = pipe.portEnthalpy
            const fresh = dm * pipe.portFresh
            const fuelBack = dm * pipe.portFuel
            cyl.mass += dm
            cyl.energy += dm * h
            cyl.fresh += fresh
            cyl.fuel += fuelBack
            cyl.lostFresh -= fresh
            this.fuelLost -= fuelBack
            cyl.portMass -= dm
            cyl.portEnergy -= dm * h
            cyl.portFresh -= fresh
            cyl.portFuel -= fuelBack
          }
        }
        if (trapping) this.trap(cyl, i, pressure, temperature)

        // 4. Spark and burn.
        const advance = Math.max(
          maps ? MIN_ADVANCE : 1,
          this.sparkAdvance + (this.controls.advanceOffset ?? 0) - cyl.retard,
        )
        const spark = TAU - (advance * Math.PI) / 180
        const ignition = spark >= TAU ? spark - TAU : spark
        if (wrapRev(phase - ignition) < wrapRev(cyl.phase - ignition)) {
          const lambda =
            cyl.fuel > 0 ? cyl.fresh / (this.grade.stoichiometric * cyl.fuel) : Infinity
          const burnable = Math.min(cyl.fuel, (cyl.fresh * this.oxygen) / this.grade.oxygen)
          const fires = this.controls.ignition && !failed && !(this.limited && this.sparkCut)
          // Heavy residual at light load fails to light: the unburned
          // charge stays and the next cycle fires (four-stroking).
          const ignites =
            lambda <= LEAN_MISFIRE &&
            lambda >= RICH_MISFIRE &&
            cyl.fresh >= DILUTION_MISFIRE * cyl.mass
          const lit = fires && ignites
          cyl.heat = lit ? burnable * this.grade.heating * 0.96 : 0
          if (lit) cyl.gas.set(this.grade, 1 / lambda)
          cyl.burnFresh = lit ? cyl.fresh : 0
          cyl.spark = ignition
          cyl.sparked = true
          cyl.duration =
            e.combustion.burnRate === 'fixed'
              ? e.burnDuration
              : this.burnAngle(cyl, lambda, temperature, pressure, rpm)
          if (fires && cyl.fresh > 0 && !fuel.overrunCut && !fuel.limiterCut) {
            if (!ignites) this.misfireTime = this.time
            this.lambda += 0.3 * (Math.min(lambda, 9.99) - this.lambda)
          }
          if (lit) {
            cyl.unburned += (cyl.fuel - burnable) * 0.3
            cyl.spareAir += Math.max(0, (cyl.fresh * this.oxygen) / this.grade.oxygen - burnable)
            cyl.burn = 0
            cyl.fresh = 0
            cyl.fuel = 0
          }
        }
        const elapsed = (wrapRev(phase - cyl.spark) * 180) / Math.PI
        if (elapsed < cyl.duration && cyl.burn < 1) {
          const burned = wiebe(elapsed / cyl.duration)
          const progress = Math.max(0, burned - cyl.burn)
          cyl.energy += progress * cyl.heat
          this.ledger.heat += progress * cyl.heat
          cyl.burnedHeat += progress * cyl.heat
          cyl.burned += progress * cyl.burnFresh
          cyl.burn = burned
        }

        // 5. Piston work on both sides, wall heat.
        cyl.energy -= pressure * (volume - previousVolume)
        cyl.ccEnergy -= ccPressure * (ccVolume - previousCc)
        const ccHeat =
          (cyl.ccMass * (CV_A + CV_B * ccTemperature) * (wallTemperature - ccTemperature) * dt) /
          CRANKCASE_HEAT_TIME
        cyl.ccEnergy += ccHeat
        this.ledger.work +=
          pressure * (volume - previousVolume) + ccPressure * (ccVolume - previousCc)
        this.ledger.wall -= ccHeat
        temperature = this.gasTemperature(cyl, pressure)
        moles = this.moles
        // Head, crown and the exposed liner (ports included).
        const surface = 2 * this.pistonArea + (4 * volume) / e.bore
        pressure = (cyl.mass * moles * R * temperature) / volume
        const coefficient =
          this.woschniBore * (pressure / 1000) ** 0.8 * temperature ** -0.55 * gasVelocity
        const wallHeat =
          coefficient * surface * (temperature - this.coolant - WALL_ABOVE_COOLANT) * dt
        cyl.energy -= wallHeat
        this.ledger.wall += wallHeat
        const deck = (wallHeat * this.pistonArea) / surface
        cyl.thermal.crownHeat += deck
        cyl.thermal.headHeat += deck
        temperature = this.gasTemperature(cyl, pressure)
        moles = this.moles
        const ccNow = temperatureFromEnergy(cyl.ccEnergy / cyl.ccMass)
        if (
          !Number.isFinite(temperature) ||
          temperature < 30 ||
          temperature > 6000 ||
          cyl.mass <= 0 ||
          !(cyl.ccMass > 0) ||
          !(ccNow > 30 && ccNow < 2500)
        )
          throw new Error('Cylinder state left the supported model range. Stop and rebuild.')
        pressure = (cyl.mass * moles * R * temperature) / volume
        const crankcase = (cyl.ccMass * R * ccNow) / ccVolume
        // Rod load: gas force against the crankcase pressure beneath,
        // less the reciprocating parts' inertia.
        const rod =
          (pressure - crankcase) * this.pistonArea -
          this.stress.inertiaForce *
            this.omega *
            this.omega *
            (cos + this.stress.rodRatio * (2 * cos * cos - 1))
        if (rod > this.stress.compression[i]) this.stress.compression[i] = rod
        if (-rod > this.stress.tension[i]) this.stress.tension[i] = -rod
        if (pressure > this.stress.peak[i]) this.stress.peak[i] = pressure
        if (cyl.knockOpen) this.integrateKnock(cyl, pressure, elapsed, dt)
        this.traces[i][Math.min(359, Math.floor(deg))] = pressure
        cyl.pressure = pressure
        cyl.ccPressure = crankcase
        cyl.phase = phase
        cyl.volume = volume
        cyl.ccVolume = ccVolume
        indicated += (pressure - crankcase) * derivative
      }
      const friction =
        (FMEP_STATIC + FMEP_LINEAR * pistonSpeed + FMEP_QUADRATIC * pistonSpeed * pistonSpeed) *
          this.frictionPerPascal +
        induction.crankTorque +
        fuel.crankTorque
      torque += (indicated - friction) / n
      const starter = this.controls.starter && rpm < 500 && !failed ? e.starterTorque : 0
      if (this.controls.holdRpm === null) {
        const road = this.controls.road
        const load =
          this.controls.load +
          (road
            ? this.vehicle.step(road, this.omega, omegaToRpm(this.omega), this.airDensity, dt)
            : 0)
        this.absorbedTorque = load
        this.omega = Math.max(
          0,
          this.omega + ((indicated - friction - load + starter) / this.inertia) * dt,
        )
      } else {
        const target = rpmToOmega(this.controls.holdRpm)
        const acceleration = (target - this.omega) / dt
        this.absorbedTorque = indicated - friction - this.inertia * acceleration
        this.omega = target
      }
      absorbed += this.absorbedTorque / n
      this.angle = wrapRev(this.angle + da)
    }
    this.absorbedTorque = absorbed
    // Each pipe advances once per step with exactly the flows its port
    // passed; the port state it presents is a step behind the cylinder.
    for (const cyl of this.cylinders) {
      const k = 1 / this.dt
      cyl.pipe.advance(this.dt, cyl.portMass * k, cyl.portEnergy * k, cyl.portFresh * k, cyl.portFuel * k)
      cyl.portMass = cyl.portEnergy = cyl.portFresh = cyl.portFuel = 0
      audio += cyl.pipe.outletFlow
    }
    this.manifoldMass = Math.max(this.manifoldMass - intakeMass, 1e-9)
    this.manifold = (this.manifoldMass * R * intakeTemperature) / this.manifoldVolume
    induction.step(this.dt, this.omega, intakeMass / this.dt, 0, 0, this.manifold)
    fuel.step(
      this.dt,
      rpm,
      this.omega,
      this.controls.throttle,
      this.direct ? this.trappedAir : airIn,
      this.manifold,
      intakeTemperature,
      this.coolant,
    )
    this.trappedAir = 0
    // Smooth the short-circuit fuel figures over about a second.
    const decay = 1 - this.dt
    this.fuelDelivered *= decay
    this.fuelLost *= decay
    let sample = 0
    if (this.sound) {
      const input = this.input
      input.exhaust = audio * 5 * this.audioScale
      input.portTemperature = portMass > 0 ? portEnergy / portMass : 0
      input.intake = (intakeMass / this.dt) * 5 * this.audioScale
      input.throttle = throttle
      input.manifoldRatio = this.manifold / Math.max(supply, 1)
      let pressureSum = 0
      for (const cyl of this.cylinders) pressureSum += cyl.pressure
      input.pressureSum = pressureSum
      input.valveSeats = 0
      input.unburned = unburned / this.chargeFuel
      input.air = spareAir / this.chargeFuel
      input.rpm = rpm
      input.induction = 'none'
      input.shaftHz = 0
      input.boost = 0
      input.venting = false
      input.dump = 0
      input.surge = false
      input.knock = this.knockEvent
      sample = this.acoustics.process(input)
    }
    this.knockEvent = 0
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
    if (this.sample % THERMAL_INTERVAL === 0) {
      for (let i = 0; i < this.cylinders.length; i++) {
        const cyl = this.cylinders[i]
        cyl.thermal.update(
          THERMAL_INTERVAL * this.dt,
          this.coolant,
          this.pistonArea,
          this.exhaustReference,
          cyl.knockIntensity,
        )
        this.crowns[i] = cyl.thermal.crown
        this.knocks[i] = cyl.knockIntensity
      }
      this.stress.update(
        THERMAL_INTERVAL * this.dt,
        this.time,
        omegaToRpm(this.omega),
        this.crowns,
        this.knocks,
        0,
        0,
        this.controls.indestructible ?? false,
      )
    }
    if (this.stress.failure) this.warning = this.stress.failure.title
    this.torque += ((torque - this.torque) * this.dt) / 0.08
    this.time += this.dt
    this.sample++
    this.coolant +=
      ((Math.max(0, torque * this.omega) * 0.12 - (this.coolant - c.temperature) * 110) /
        90000) *
      this.dt
    return sample
  }
  /** Fresh air trapped this step, for direct injection's fuel accounting. */
  private trappedAir = 0
  /**
   * Running totals for balance checks: mass and energy into the
   * crankcases, heat released, piston work done by the gas, and heat lost
   * (walls, crankcase walls, direct-injection evaporation).
   */
  readonly ledger = { inMass: 0, inEnergy: 0, heat: 0, work: 0, wall: 0 }
  /** Gas mass and energy held in crankcases, cylinders and pipes. */
  contents() {
    let mass = 0
    let energy = 0
    for (const c of this.cylinders) {
      const pipe = c.pipe.totals()
      mass += c.mass + c.ccMass + pipe.mass
      energy += c.energy + c.ccEnergy + pipe.energy
    }
    return { mass, energy }
  }

  /**
   * Gas leaving through the exhaust port: short-circuit charge first,
   * then the mixed zone, then (only if nothing else is left) the
   * displacement zone. Returns its fresh air, fuel, frozen chemical heat
   * and the share of the burned gas that left.
   */
  private removeOutflow(cyl: Cylinder, dm: number) {
    let left = dm
    let fresh = 0
    let fuel = 0
    if (cyl.bypass > 0) {
      const take = Math.min(left, cyl.bypass)
      const share = take / cyl.bypass
      const f = cyl.bypassFresh * share
      const b = cyl.bypassFuel * share
      cyl.bypass -= take
      cyl.bypassFresh -= f
      cyl.bypassFuel -= b
      cyl.fresh -= f
      cyl.fuel -= b
      fresh += f
      fuel += b
      left -= take
    }
    const mixed = this.removeMixed(cyl, left)
    fresh += mixed.fresh
    fuel += mixed.fuel
    left -= mixed.mass
    if (left > 0 && cyl.zone > 0) {
      const share = Math.min(1, left / cyl.zone)
      const f = cyl.zoneFresh * share
      const b = cyl.zoneFuel * share
      cyl.zone -= cyl.zone * share
      cyl.zoneFresh -= f
      cyl.zoneFuel -= b
      cyl.fresh -= f
      cyl.fuel -= b
      fresh += f
      fuel += b
    }
    return { fresh, fuel, held: mixed.held, burned: mixed.burned }
  }
  /** Take dm from the mixed zone (everything outside the two unmixed zones). */
  private removeMixed(cyl: Cylinder, dm: number) {
    const mass = cyl.mass - cyl.zone - cyl.bypass
    if (dm <= 0 || mass <= 1e-12)
      return { mass: 0, fresh: 0, fuel: 0, held: 0, burned: 0 }
    const take = Math.min(dm, mass * 0.999)
    const share = take / mass
    const fresh = Math.max(0, cyl.fresh - cyl.zoneFresh - cyl.bypassFresh) * share
    const fuel = Math.max(0, cyl.fuel - cyl.zoneFuel - cyl.bypassFuel) * share
    const held = cyl.held * share
    cyl.fresh -= fresh
    cyl.fuel -= fuel
    cyl.held -= held
    cyl.burned *= 1 - share
    cyl.burnedHeat *= 1 - share
    return { mass: take, fresh, fuel, held, burned: share }
  }
  /**
   * The exhaust port has closed: the charge is trapped. Zones merge,
   * direct injection meters its fuel, the cycle's scavenging figures are
   * recorded and the end-gas knock integral starts.
   */
  private trap(cyl: Cylinder, i: number, pressure: number, temperature: number) {
    cyl.zone = cyl.zoneFresh = cyl.zoneFuel = 0
    cyl.bypass = cyl.bypassFresh = cyl.bypassFuel = 0
    if (this.direct) {
      const fuel = Math.max(0, cyl.fresh * this.fuel.fuelPerAir - cyl.fuel)
      cyl.fuel += fuel
      cyl.energy -= cyl.fresh * this.fuel.cylinderCooling
      this.ledger.wall += cyl.fresh * this.fuel.cylinderCooling
      this.trappedAir += cyl.fresh
      this.fuelDelivered += fuel
    }
    cyl.deliveryRatio = cyl.deliveredFresh / this.sweptMass
    cyl.trapping =
      cyl.deliveredFresh > 0
        ? clamp(1 - cyl.lostFresh / cyl.deliveredFresh, 0, 1)
        : 0
    cyl.scavenging = clamp(cyl.fresh / cyl.mass, 0, 1)
    cyl.thermal.closeExhaust(this.time)
    this.stress.closeCycle(i)
    const lambda =
      cyl.fuel > 0 ? cyl.fresh / (this.grade.stoichiometric * cyl.fuel) : LEAN_MISFIRE
    const residual = clamp(1 - cyl.fresh / cyl.mass, 0, 0.6)
    const mixture = Math.exp(2 * (1 - Math.min(lambda, LEAN_MISFIRE)))
    cyl.knockRate = 1 / (this.octaneDelay * mixture * (1 + 1.5 * residual))
    cyl.ivcPressure = pressure
    cyl.ivcTemperature = temperature
    cyl.knock = 0
    cyl.knockOnset = -1
    cyl.sparked = false
    cyl.knockOpen = true
  }
  private integrateKnock(cyl: Cylinder, pressure: number, elapsed: number, dt: number) {
    const unburned = cyl.ivcTemperature * (pressure / cyl.ivcPressure) ** END_GAS_EXPONENT
    cyl.knock += dt * cyl.knockRate * (pressure / 101325) ** 1.7 * Math.exp(-3800 / unburned)
    if (cyl.knockOnset < 0 && cyl.knock >= 1) cyl.knockOnset = cyl.sparked ? 1 - cyl.burn : 1
    if (!cyl.sparked || (cyl.burn < KNOCK_WINDOW_BURN && elapsed < cyl.duration)) return
    cyl.knockOpen = false
    const fired = cyl.heat > 0
    cyl.knockIndex = fired ? Math.min(cyl.knock, 100) : 0
    cyl.knockIntensity = fired ? Math.max(0, cyl.knockOnset) : 0
    this.knockPeak = Math.max(this.knockPeak, cyl.knockIndex)
    if (cyl.knockIntensity > 0) {
      this.knockTime = this.time
      this.knockEvent = Math.max(this.knockEvent, cyl.knockIntensity)
    }
    if (this.engine.combustion.knockControl && cyl.knockIntensity > KNOCK_SENSED)
      cyl.retard = Math.min(RETARD_LIMIT, cyl.retard + RETARD_STEP)
  }
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
      laminarFlame(this.grade.flame, clamp(1 / lambda, 0.5, 1.6), temperature, pressure, residual),
      this.pistonSpeedPerRpm * speed,
    )
    const reference = this.engine.burnDuration
    return clamp(
      ((reference * speed) / 3000) * (this.referenceFlame / flame),
      Math.max(25, 0.7 * reference),
      120,
    )
  }
  /** As EngineCore's: temperature with dissociation, solved by Newton's method. */
  private gasTemperature(cyl: Cylinder, pressure: number) {
    const heatMass = cyl.mass + cyl.burned * cyl.gas.capacityGain
    let temperature = temperatureFromEnergy((cyl.energy - cyl.held) / heatMass)
    if (cyl.burnedHeat <= 0 || temperature < FREEZE) {
      this.moles = 1 + (cyl.burned * (cyl.molesFactor - 1)) / cyl.mass
      return temperature
    }
    const gas = cyl.gas
    for (let k = 0; k < 8; k++) {
      gas.at(temperature, pressure)
      const error =
        heatMass * internalEnergy(temperature) + cyl.burnedHeat * gas.held - cyl.energy
      const step =
        error / (heatMass * (CV_A + CV_B * temperature) + cyl.burnedHeat * gas.heldSlope)
      temperature -= step
      if (Math.abs(step) < 1e-7) break
    }
    gas.at(temperature, pressure)
    cyl.held = cyl.burnedHeat * gas.held
    cyl.molesFactor = gas.moles
    this.moles = 1 + (cyl.burned * (gas.moles - 1)) / cyl.mass
    return temperature
  }
  meanRetard() {
    let sum = 0
    for (const cyl of this.cylinders) sum += cyl.retard
    return sum / this.cylinders.length
  }
  advance(seconds: number) {
    if (seconds < 0 || seconds > 0.1) throw new Error('Advance must be bounded to 0–100 ms.')
    const count = Math.round(seconds / this.dt)
    for (let i = 0; i < count; i++) this.step()
  }
  telemetry(): Telemetry {
    const pipe = this.cylinders[0].pipe
    const along: number[] = []
    for (let i = 0; i < pipe.cells; i++) along.push(pipe.pressureAt(i))
    const e = this.engine
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
      fuel: this.fuel.telemetry(this.lambda, this.time - this.misfireTime < 0.3),
      afterfire: this.acoustics.afterfire,
      exhaustWall: this.acoustics.wallTemperature,
      knock: {
        fuel: e.combustion.fuel,
        control: e.combustion.knockControl,
        index: this.cylinders.map((c) => c.knockIndex),
        intensity: this.cylinders.map((c) => c.knockIntensity),
        retard: this.cylinders.map((c) => c.retard),
        burn: this.cylinders.map((c) => c.duration),
        knocking: this.time - this.knockTime < 0.3,
      },
      stress: this.stress.telemetry(this.controls.indestructible ?? false),
      temperatures: {
        egt: this.cylinders.map((c) => c.thermal.egt),
        crown: this.cylinders.map((c) => c.thermal.crown),
        valve: this.cylinders.map((c) => c.thermal.valve),
        head: this.cylinders.map((c) => c.thermal.head),
      },
      ecu: {
        maps: !!e.management,
        advance: this.sparkAdvance,
        cam: null,
        camPhase: null,
        lambda: this.targetLambda,
        boostTarget: null,
        load: this.manifold,
        throttle: this.controls.throttle,
      },
      road: this.controls.road
        ? { speed: this.vehicle.speed * 3.6, gear: this.controls.road.gear }
        : null,
      twoStroke: {
        delivery: this.cylinders.map((c) => c.deliveryRatio),
        trapping: this.cylinders.map((c) => c.trapping),
        scavenging: this.cylinders.map((c) => c.scavenging),
        crankcase: this.cylinders.map((c) => c.ccPressure),
        port: this.cylinders.map((c) => c.pipe.portPressure),
        fuelLost: this.fuelDelivered > 0 ? clamp(this.fuelLost / this.fuelDelivered, 0, 1) : 0,
        powerValve: this.ts.powerValve ? this.powerValve : null,
        reed: this.ts.intake.kind === 'reed' ? this.cylinders.map((c) => c.reed) : null,
        pipe: along,
      },
    }
  }
}
