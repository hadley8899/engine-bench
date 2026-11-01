/** Editor field definitions and helpers for forced-induction settings. */
import { inductionSchema } from '../sim/schema'
import type { Induction, InductionKind } from '../sim/schema'

type Field = {
  key: string
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
  help: string
}
export const inductionLabels: Record<InductionKind, string> = {
  none: 'Naturally aspirated',
  turbo: 'Turbocharger',
  centrifugal: 'Centrifugal supercharger',
  roots: 'Roots supercharger',
}
const compressor: Field[] = [
  {
    key: 'compressorDiameter',
    label: 'Compressor wheel',
    unit: 'mm',
    scale: 1000,
    min: 20,
    max: 200,
    step: 1,
    help: 'Tip diameter. Bigger wheels flow more air but need more shaft speed and energy.',
  },
  {
    key: 'compressorEfficiency',
    label: 'Compressor efficiency',
    unit: '%',
    scale: 100,
    min: 50,
    max: 85,
    step: 1,
    help: 'Peak isentropic efficiency. Lower values heat the charge more for the same boost.',
  },
]
const shaftLimit: Field = {
  key: 'maxShaftRpm',
  label: 'Max shaft speed',
  unit: 'RPM',
  scale: 1,
  min: 20000,
  max: 400000,
  step: 1000,
  help: 'Estimated safe compressor speed, used for the overspeed warning only.',
}
const intercooler: Field[] = [
  {
    key: 'intercooler.effectiveness',
    label: 'Intercooler effectiveness',
    unit: '%',
    scale: 100,
    min: 0,
    max: 95,
    step: 5,
    help: 'Share of the compression heating removed. 0 means no intercooler.',
  },
  {
    key: 'intercooler.pressureDrop',
    label: 'Intercooler pressure drop',
    unit: 'kPa at 0.1 kg/s',
    scale: 0.001,
    min: 0,
    max: 30,
    step: 1,
    help: 'Boost lost across the core; grows with airflow squared.',
  },
]
export const inductionFields: Record<InductionKind, Field[]> = {
  none: [],
  turbo: [
    {
      key: 'boostTarget',
      label: 'Boost target',
      unit: 'bar',
      scale: 1e-5,
      min: 0,
      max: 4,
      step: 0.05,
      help: 'Gauge pressure where the wastegate starts opening.',
    },
    ...compressor,
    {
      key: 'turbineArea',
      label: 'Turbine nozzle area',
      unit: 'mm²',
      scale: 1e6,
      min: 20,
      max: 10000,
      step: 10,
      help: 'Effective turbine flow area. Smaller spools sooner but chokes the exhaust at high RPM.',
    },
    {
      key: 'turbineEfficiency',
      label: 'Turbine efficiency',
      unit: '%',
      scale: 100,
      min: 50,
      max: 85,
      step: 1,
      help: 'Peak efficiency at the ideal blade speed.',
    },
    {
      key: 'shaftInertia',
      label: 'Rotor inertia',
      unit: 'g·cm²',
      scale: 1e7,
      min: 10,
      max: 100000,
      step: 10,
      help: 'Wheel and shaft inertia. Heavier rotors spool more slowly (lag).',
    },
    shaftLimit,
    ...intercooler,
  ],
  centrifugal: [
    ...compressor,
    {
      key: 'driveRatio',
      label: 'Drive ratio',
      unit: '× crank',
      scale: 1,
      min: 1,
      max: 30,
      step: 0.5,
      help: 'Compressor speed per crank speed, including the internal step-up gear.',
    },
    shaftLimit,
    ...intercooler,
  ],
  roots: [
    {
      key: 'rotorDisplacement',
      label: 'Blower displacement',
      unit: 'L/rev',
      scale: 1000,
      min: 0.1,
      max: 20,
      step: 0.1,
      help: 'Air moved per rotor revolution.',
    },
    {
      key: 'driveRatio',
      label: 'Pulley ratio',
      unit: '× crank',
      scale: 1,
      min: 0.5,
      max: 6,
      step: 0.1,
      help: 'Blower speed per crank speed. Higher ratios give more boost and take more power.',
    },
    {
      key: 'efficiency',
      label: 'Blower efficiency',
      unit: '%',
      scale: 100,
      min: 30,
      max: 85,
      step: 1,
      help: 'Lower values take more crank power and heat the charge more.',
    },
    ...intercooler,
  ],
}

export const read = (value: Induction, key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (v, k) => (v as Record<string, unknown>)[k],
      value,
    ) as number
export function write(value: Induction, key: string, n: number): Induction {
  const [head, tail] = key.split('.')
  const v = value as Record<string, unknown>
  return (
    tail
      ? { ...v, [head]: { ...(v[head] as object), [tail]: n } }
      : { ...v, [head]: n }
  ) as Induction
}
export const rangeText = (f: Field) => `${f.min}–${f.max} ${f.unit}`

/** Out-of-range induction fields, keyed by field path, with their labels. */
export function inductionErrors(value: Induction) {
  const errors: Record<string, string> = {}
  const fields = inductionFields[value.kind]
  for (const issue of inductionSchema.safeParse(value).error?.issues ?? []) {
    const key = issue.path.join('.')
    const field = fields.find((f) => f.key === key)
    if (field) errors[field.label] ??= `Supported range ${rangeText(field)}`
  }
  return errors
}

/** Plain-language differences between two induction set-ups. */
export function describeInduction(a: Induction, b: Induction) {
  if (a.kind !== b.kind)
    return [
      `Induction: ${inductionLabels[a.kind]} → ${inductionLabels[b.kind]}`,
    ]
  return inductionFields[b.kind]
    .filter((f) => read(a, f.key) !== read(b, f.key))
    .map(
      (f) =>
        `${f.label}: ${(read(a, f.key) * f.scale).toFixed(2)} → ${(read(b, f.key) * f.scale).toFixed(2)} ${f.unit}`,
    )
}
