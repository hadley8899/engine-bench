import type { EngineDefinition, Management } from '../sim/schema'

export type MapTable = 'ignition' | 'lambda' | 'boost'

/** Display units and limits for each table; values are stored in SI. */
export const MAP_TABLES: Record<
  MapTable,
  {
    label: string
    unit: string
    /** Stored value × scale = displayed value. */
    scale: number
    min: number
    max: number
    step: number
    digits: number
    help: string
    /** Cell colour hue from the value's share of the range. */
    hue: (share: number) => number
  }
> = {
  ignition: {
    label: 'Ignition advance',
    unit: '°',
    scale: 1,
    min: -10,
    max: 50,
    step: 1,
    digits: 1,
    help: 'Spark advance in degrees before top dead centre, by RPM and manifold pressure. Knock retard is taken off this.',
    hue: (s) => 200 - 200 * s,
  },
  lambda: {
    label: 'Target λ',
    unit: '',
    scale: 1,
    min: 0.7,
    max: 1.3,
    step: 0.01,
    digits: 2,
    help: 'Commanded mixture by RPM and manifold pressure. Richer than 1 cools the charge and resists knock; leaner saves fuel at part load.',
    hue: (s) => 10 + 200 * s,
  },
  boost: {
    label: 'Boost target',
    unit: ' bar',
    scale: 1e-5,
    min: 0,
    max: 4,
    step: 0.05,
    digits: 2,
    help: 'Turbo wastegate target (gauge) by RPM and driver throttle.',
    hue: (s) => 200 - 200 * Math.min(1, s * 2),
  },
}

/** Index of the breakpoint closest to a value. */
export function nearest(axis: number[], value: number) {
  let best = 0
  for (let i = 1; i < axis.length; i++)
    if (Math.abs(axis[i] - value) < Math.abs(axis[best] - value)) best = i
  return best
}

/** The build's single value that a table replaces, in stored units. */
export function singleValue(e: EngineDefinition, table: MapTable) {
  if (table === 'ignition') return e.ignitionAdvance
  if (table === 'lambda') return e.lambda
  return e.induction.kind === 'turbo' ? e.induction.boostTarget : 0
}

/** Plain-language differences between two sets of maps. */
export function describeMaps(a: Management | null, b: Management | null) {
  if (!a && !b) return []
  if (!a) return ['Engine-management maps: off → on']
  if (!b) return ['Engine-management maps: on → off']
  const changes: string[] = []
  for (const axis of ['rpm', 'load', 'throttle'] as const)
    if (JSON.stringify(a[axis]) !== JSON.stringify(b[axis]))
      changes.push(`Map ${axis === 'rpm' ? 'RPM' : axis} breakpoints changed`)
  for (const t of ['ignition', 'lambda', 'boost'] as const) {
    const cells = b[t].flat()
    const before = a[t].flat()
    if (cells.length !== before.length) {
      changes.push(`${MAP_TABLES[t].label} map resized`)
      continue
    }
    const changed = cells.filter((v, i) => v !== before[i]).length
    if (changed)
      changes.push(
        `${MAP_TABLES[t].label} map: ${changed} cell${changed > 1 ? 's' : ''} changed`,
      )
  }
  return changes
}
