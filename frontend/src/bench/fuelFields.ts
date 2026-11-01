/** Editor labels and helpers for fuel-system settings. */
import { fuelSystemSchema } from '../sim/schema'
import type { FuelSystem, FuelSystemKind } from '../sim/schema'

export const fuelLabels: Record<FuelSystemKind, string> = {
  carburettor: 'Carburettor',
  throttleBody: 'Throttle-body injection (single point)',
  port: 'Port injection (multi-point)',
  direct: 'Direct injection',
}
export const fuelShortLabels: Record<FuelSystemKind, string> = {
  carburettor: 'CARB',
  throttleBody: 'TBI',
  port: 'PFI',
  direct: 'DI',
}
export const fuelNotes: Record<FuelSystemKind, string> = {
  carburettor:
    'Fuel is drawn by the venturi, so it meters by volume: thin or hot air runs rich, cold dense air lean. Fuel wets the manifold walls, no fuel is cut on the overrun, and the venturi restricts airflow. Turbos are fed draw-through.',
  throttleBody:
    'One electronic injector above the throttle. Mixture follows measured air, but fuel still wets the whole manifold.',
  port: 'One injector per intake port, sprayed at the valve. Less wall film than a carburettor. Turning transient correction off approximates early analogue or mechanical systems.',
  direct:
    'Injected into the cylinder: no intake wall film, and evaporation cools the trapped charge for a little more air. The high-pressure pump takes a little crank power. Knock benefits are not modelled.',
}
type Field = {
  key: 'chokeDiameter' | 'chokes'
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
  help: string
}
export const carburettorFields: Field[] = [
  {
    key: 'chokeDiameter',
    label: 'Venturi (choke)',
    unit: 'mm',
    scale: 1000,
    min: 12,
    max: 70,
    step: 1,
    help: 'Throat diameter of each barrel. Small chokes restrict top-end power; large ones atomise poorly at low airflow and wet more wall.',
  },
  {
    key: 'chokes',
    label: 'Barrels',
    unit: 'count',
    scale: 1,
    min: 1,
    max: 8,
    step: 1,
    help: 'Total venturis feeding the engine, e.g. 2 for a twin-choke or 4 for two twin-choke sidedraughts.',
  },
]
const ecuToggles = [
  {
    key: 'transientCorrection',
    label: 'Transient fuel correction (compensates wall film)',
  },
  {
    key: 'overrunCut',
    label: 'Overrun fuel cut (closed throttle above 1,800 RPM)',
  },
]
export const fuelToggles: Record<
  FuelSystemKind,
  { key: string; label: string }[]
> = {
  carburettor: [
    {
      key: 'acceleratorPump',
      label: 'Accelerator pump (squirts fuel as the throttle opens)',
    },
  ],
  throttleBody: ecuToggles,
  port: ecuToggles,
  // No intake wall film to correct.
  direct: ecuToggles.filter((t) => t.key === 'overrunCut'),
}
export const fuelRangeText = (f: Field) => `${f.min}–${f.max} ${f.unit}`

/** Out-of-range fuel-system fields, keyed by label. */
export function fuelErrors(value: FuelSystem) {
  const errors: Record<string, string> = {}
  if (value.kind !== 'carburettor') return errors
  for (const issue of fuelSystemSchema.safeParse(value).error?.issues ?? []) {
    const field = carburettorFields.find((f) => f.key === issue.path[0])
    if (field) errors[field.label] ??= `Supported range ${fuelRangeText(field)}`
  }
  return errors
}

/** Plain-language differences between two fuel systems. */
export function describeFuel(a: FuelSystem, b: FuelSystem) {
  if (a.kind !== b.kind)
    return [`Fuel system: ${fuelLabels[a.kind]} → ${fuelLabels[b.kind]}`]
  const changes: string[] = []
  const av = a as Record<string, unknown>
  const bv = b as Record<string, unknown>
  if (b.kind === 'carburettor')
    for (const f of carburettorFields)
      if (av[f.key] !== bv[f.key])
        changes.push(
          `${f.label}: ${Number(av[f.key]) * f.scale} → ${Number(bv[f.key]) * f.scale} ${f.unit}`,
        )
  for (const t of fuelToggles[b.kind])
    if (av[t.key] !== bv[t.key])
      changes.push(
        `${t.label.replace(/ \(.*/, '')}: ${av[t.key] ? 'on' : 'off'} → ${bv[t.key] ? 'on' : 'off'}`,
      )
  return changes
}
