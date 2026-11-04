import type { EngineDefinition, FuelSupply, Induction } from '../sim/schema'
import { valveDiameter } from '../sim/cams'

type Turbo = Extract<Induction, { kind: 'turbo' }>
type Intercooler = Turbo['intercooler']
/** Fields a turbo part sets; boost target, blow-off and intercooler stay. */
export type TurboPart = Pick<
  Turbo,
  | 'compressorDiameter'
  | 'compressorEfficiency'
  | 'turbineArea'
  | 'turbineEfficiency'
  | 'shaftInertia'
  | 'maxShaftRpm'
>
/**
 * Bolt-on parts as named sets of the existing build fields, sized for about
 * 2 L. Fitting one writes its values; editing a value afterwards shows the
 * part as custom.
 */
export const turbos: { label: string; note: string; value: TurboPart }[] = [
  {
    label: 'Small',
    note: 'Spools early and chokes early.',
    value: {
      compressorDiameter: 0.044,
      compressorEfficiency: 0.75,
      turbineArea: 0.00045,
      turbineEfficiency: 0.7,
      shaftInertia: 0.000016,
      maxShaftRpm: 240000,
    },
  },
  {
    label: 'Medium',
    note: 'The default road turbo.',
    value: {
      compressorDiameter: 0.05,
      compressorEfficiency: 0.76,
      turbineArea: 0.0006,
      turbineEfficiency: 0.72,
      shaftInertia: 0.000025,
      maxShaftRpm: 210000,
    },
  },
  {
    label: 'Large',
    note: 'More top end, later boost.',
    value: {
      compressorDiameter: 0.058,
      compressorEfficiency: 0.77,
      turbineArea: 0.0008,
      turbineEfficiency: 0.73,
      shaftInertia: 0.000038,
      maxShaftRpm: 180000,
    },
  },
  {
    label: 'Big',
    note: 'Lag first, then a lot of air.',
    value: {
      compressorDiameter: 0.068,
      compressorEfficiency: 0.78,
      turbineArea: 0.0011,
      turbineEfficiency: 0.74,
      shaftInertia: 0.00006,
      maxShaftRpm: 155000,
    },
  },
]
export const intercoolers: { label: string; value: Intercooler }[] = [
  { label: 'None', value: { effectiveness: 0, pressureDrop: 0 } },
  { label: 'Small', value: { effectiveness: 0.6, pressureDrop: 5000 } },
  { label: 'Standard', value: { effectiveness: 0.7, pressureDrop: 6000 } },
  { label: 'Large front-mount', value: { effectiveness: 0.8, pressureDrop: 9000 } },
  { label: 'Water-to-air', value: { effectiveness: 0.85, pressureDrop: 4000 } },
]
export const injectors: { label: string; value: number }[] = [
  { label: '240 cc/min · road', value: 240 },
  { label: '330 cc/min', value: 330 },
  { label: '450 cc/min', value: 450 },
  { label: '550 cc/min', value: 550 },
  { label: '750 cc/min', value: 750 },
  { label: '1,000 cc/min', value: 1000 },
]
export const pumps: { label: string; value: number }[] = [
  { label: '110 L/h · road', value: 110 },
  { label: '190 L/h · uprated', value: 190 },
  { label: '255 L/h · high flow', value: 255 },
  { label: '450 L/h · twin pumps', value: 450 },
]
/** Starting fuel supply when a part is fitted to a build with unlimited fuel. */
export const roadSupply: FuelSupply = {
  injectorFlow: 240,
  maxDuty: 0.85,
  pumpFlow: 110,
}
export function matchTurbo(t: Turbo) {
  return turbos.findIndex((p) =>
    (Object.keys(p.value) as (keyof TurboPart)[]).every(
      (k) => p.value[k] === t[k],
    ),
  )
}
export function matchIntercooler(i: Intercooler) {
  return intercoolers.findIndex(
    (p) =>
      p.value.effectiveness === i.effectiveness &&
      p.value.pressureDrop === i.pressureDrop,
  )
}

/**
 * Cam grades: durations (crank degrees, opening to closing) and peak lift
 * as a share of valve diameter. Fitting one keeps each cam's centreline.
 */
export const camGrades: {
  label: string
  note: string
  intake: number
  exhaust: number
  lift: number
}[] = [
  { label: 'Mild', note: 'Smooth idle and strong low-speed torque.', intake: 230, exhaust: 225, lift: 0.27 },
  { label: 'Fast road', note: 'More top end; a little lumpy at idle.', intake: 260, exhaust: 255, lift: 0.32 },
  { label: 'Race', note: 'Top end only: weak below mid-range, a rough idle and harder on springs.', intake: 290, exhaust: 285, lift: 0.37 },
]
export function applyCamGrade(e: EngineDefinition, grade: (typeof camGrades)[number]) {
  const cams = e.cams
  if (!cams) return e
  const fit = (
    event: { open: number; close: number },
    duration: number,
    area: number,
    [openMin, openMax]: [number, number],
    [closeMin, closeMax]: [number, number],
  ) => {
    const centre = (event.open + event.close) / 2
    return {
      open: Math.min(openMax, Math.max(openMin, Math.round(centre - duration / 2))),
      close: Math.min(closeMax, Math.max(closeMin, Math.round(centre + duration / 2))),
      lift:
        Math.round(
          Math.min(0.02, Math.max(0.002, grade.lift * valveDiameter(area))) * 1e4,
        ) / 1e4,
    }
  }
  return {
    ...e,
    cams: {
      ...cams,
      intake: fit(cams.intake, grade.intake, e.intakeArea, [300, 400], [520, 660]),
      exhaust: fit(cams.exhaust, grade.exhaust, e.exhaustArea, [80, 220], [330, 430]),
    },
  }
}
export function matchCamGrade(e: EngineDefinition) {
  return camGrades.findIndex((g) => {
    const fitted = applyCamGrade(e, g).cams
    return JSON.stringify(fitted?.intake) === JSON.stringify(e.cams?.intake) &&
      JSON.stringify(fitted?.exhaust) === JSON.stringify(e.cams?.exhaust)
  })
}
