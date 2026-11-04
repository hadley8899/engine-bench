/**
 * Camshaft geometry shared by the core, the editor and the cutaway: valve
 * events after phasing, lift, flow-area ratio, valve-float speed and
 * valve-to-piston clearance. Estimates; see docs/SIMULATION.md.
 */
import type { EngineDefinition, ValveEvent } from './schema'

/** Discharge coefficient relating a build's flow area to two valves' heads. */
const DISCHARGE = 0.6
/** Lift at which the curtain stops limiting flow, as a share of valve diameter. */
const FULL_FLOW_LIFT = 0.25
/** Reference cam for valve float: 240° of duration and lift of 0.3 × diameter. */
const REFERENCE_DURATION = 240
const REFERENCE_LIFT = 0.3
/**
 * Lift each spring grade is designed for, as a share of valve diameter.
 * Beyond it the spring runs short of travel and loses control of the valve
 * sooner: the float speed falls with the square of the excess.
 */
const SPRING_LIFT = { stock: 0.3, uprated: 0.36, race: 0.42 } as const
/**
 * Share of the clearance height (clearance volume / piston area) a valve
 * can open into at top dead centre before it reaches the piston: valve
 * reliefs and the chamber's shape give some room, not all of it.
 */
const VALVE_ROOM = 0.5

/** Valve head diameter of one of two valves giving this flow area, m. */
export function valveDiameter(area: number) {
  return Math.sqrt((2 * area) / (Math.PI * DISCHARGE))
}

/** The events in use at one instant: angles in crank degrees, areas in m². */
export type ValveEvents = {
  intakeOpen: number
  intakeClose: number
  intakeArea: number
  /** Peak lift over the lift at which flow reaches the full area. */
  intakeRatio: number
  intakeLift: number
  exhaustOpen: number
  exhaustClose: number
  exhaustArea: number
  exhaustRatio: number
  exhaustLift: number
}
export function emptyEvents(): ValveEvents {
  return {
    intakeOpen: 350,
    intakeClose: 590,
    intakeArea: 0,
    intakeRatio: 1,
    intakeLift: 0,
    exhaustOpen: 145,
    exhaustClose: 370,
    exhaustArea: 0,
    exhaustRatio: 1,
    exhaustLift: 0,
  }
}

/**
 * Valve events for a build on its low or high profile with the phasers at
 * the given advance (crank degrees; positive opens and closes earlier).
 * Builds without cam profiles keep the fixed events of model 1.12.0: intake
 * from 350° to its closing angle and exhaust from 145° to 370°, reaching
 * full flow area exactly at peak lift.
 */
export function valveEvents(
  e: EngineDefinition,
  high: boolean,
  intakePhase: number,
  exhaustPhase: number,
  out: ValveEvents = emptyEvents(),
) {
  const cams = e.cams
  if (!cams) {
    const cam = e.camSwitch && high ? e.camSwitch : e
    out.intakeOpen = 350
    out.intakeClose = cam.intakeClose
    out.intakeArea = cam.intakeArea
    out.intakeRatio = 1
    out.intakeLift = FULL_FLOW_LIFT * valveDiameter(cam.intakeArea)
    out.exhaustOpen = 145
    out.exhaustClose = 370
    out.exhaustArea = cam.exhaustArea
    out.exhaustRatio = 1
    out.exhaustLift = FULL_FLOW_LIFT * valveDiameter(cam.exhaustArea)
    return out
  }
  const profile = high && cams.high ? cams.high : cams
  const intakeArea = high && cams.high ? cams.high.intakeArea : e.intakeArea
  const exhaustArea =
    high && cams.high ? cams.high.exhaustArea : e.exhaustArea
  out.intakeOpen = profile.intake.open - intakePhase
  out.intakeClose = profile.intake.close - intakePhase
  out.intakeArea = intakeArea
  out.intakeLift = profile.intake.lift
  out.intakeRatio =
    profile.intake.lift / (FULL_FLOW_LIFT * valveDiameter(intakeArea))
  out.exhaustOpen = profile.exhaust.open - exhaustPhase
  out.exhaustClose = profile.exhaust.close - exhaustPhase
  out.exhaustArea = exhaustArea
  out.exhaustLift = profile.exhaust.lift
  out.exhaustRatio =
    profile.exhaust.lift / (FULL_FLOW_LIFT * valveDiameter(exhaustArea))
  return out
}

/** Valve lift (m) at a crank angle, for an event from open to close. */
export function liftAt(open: number, close: number, lift: number, deg: number) {
  return deg >= open && deg < close
    ? lift * Math.sin((Math.PI * (deg - open)) / (close - open))
    : 0
}

/** Degrees during which both valves are open around overlap TDC. */
export function overlap(v: ValveEvents) {
  return Math.max(0, v.exhaustClose - v.intakeOpen)
}
/** Lobe centrelines (degrees after/before overlap TDC) and their separation. */
export function centrelines(event: { open: number; close: number }, intake: boolean) {
  const centre = (event.open + event.close) / 2
  return intake ? centre - 360 : 360 - centre
}

/**
 * Valve-float speed relative to a reference cam. Peak valve acceleration
 * at a given speed grows with lift and falls with the square of duration,
 * so the float speed scales with duration / √lift. Lift beyond what the
 * springs are designed for lowers it further. The most aggressive of the
 * build's profiles sets it. Builds without cam profiles return 1.
 */
export function floatFactor(e: EngineDefinition) {
  const cams = e.cams
  if (!cams) return 1
  const design = SPRING_LIFT[e.parts.valveSprings]
  const factor = (event: ValveEvent, area: number) => {
    const share = event.lift / valveDiameter(area)
    return (
      ((event.close - event.open) / REFERENCE_DURATION) *
      Math.sqrt(REFERENCE_LIFT / share) *
      Math.min(1, (design / share) ** 2)
    )
  }
  let f = Math.min(
    factor(cams.intake, e.intakeArea),
    factor(cams.exhaust, e.exhaustArea),
  )
  if (cams.high)
    f = Math.min(
      f,
      factor(cams.high.intake, cams.high.intakeArea),
      factor(cams.high.exhaust, cams.high.exhaustArea),
    )
  return Math.min(1.3, Math.max(0.6, f))
}

/**
 * Valve-to-piston clearance: the largest share of the room available that
 * either valve uses near overlap TDC (300–420°). Room is half the clearance
 * height plus the piston's travel below top dead centre. Above 1 the valve
 * reaches the piston.
 */
export function clearanceRatio(e: EngineDefinition, v: ValveEvents) {
  const area = (Math.PI * e.bore ** 2) / 4
  const room =
    (VALVE_ROOM * (area * e.stroke)) / (e.compression - 1) / area
  const r = e.stroke / 2
  let worst = 0
  for (let deg = 300; deg <= 420; deg += 2) {
    const theta = ((deg - 360) * Math.PI) / 180
    const drop =
      r * (1 - Math.cos(theta)) +
      e.rodLength -
      Math.sqrt(e.rodLength ** 2 - (r * Math.sin(theta)) ** 2)
    const lift = Math.max(
      liftAt(v.intakeOpen, v.intakeClose, v.intakeLift, deg),
      liftAt(v.exhaustOpen, v.exhaustClose, v.exhaustLift, deg),
    )
    worst = Math.max(worst, lift / (room + drop))
  }
  return worst
}

/**
 * Cam profiles that reproduce a build's fixed events exactly: intake from
 * 350° to its closing angle, exhaust from 145° to 370°, each reaching full
 * flow at peak lift. A two-stage cam becomes the high-lift profile.
 */
export function camsFromEvents(e: EngineDefinition): NonNullable<EngineDefinition['cams']> {
  const lift = (area: number) =>
    Math.min(0.02, Math.max(0.002, FULL_FLOW_LIFT * valveDiameter(area)))
  const exhaust = { open: 145, close: 370, lift: lift(e.exhaustArea) }
  const s = e.camSwitch
  return {
    intake: { open: 350, close: e.intakeClose, lift: lift(e.intakeArea) },
    exhaust,
    high: s
      ? {
          rpm: s.rpm,
          intake: { open: 350, close: s.intakeClose, lift: lift(s.intakeArea) },
          exhaust: { ...exhaust, lift: lift(s.exhaustArea) },
          intakeArea: s.intakeArea,
          exhaustArea: s.exhaustArea,
        }
      : null,
    phasers: null,
  }
}
