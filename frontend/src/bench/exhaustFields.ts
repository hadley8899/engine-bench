/** Editor labels and helpers for exhaust-system settings. */
import { exhaustDefaults, exhaustSchema } from '../sim/schema'
import type { Exhaust } from '../sim/schema'

export const silencerLabels: Record<Exhaust['silencer'], string> = {
  straight: 'Straight-through (no silencer)',
  absorptive: 'Absorptive (packed, glasspack)',
  chambered: 'Chambered (reactive)',
}
export const silencerNotes: Record<Exhaust['silencer'], string> = {
  straight:
    'Nothing between the collector and the outlet: loud, bright and raw, with strong pipe resonance.',
  absorptive:
    'Packing soaks up the high frequencies but leaves the deep pulse: a throaty, open sound.',
  chambered:
    'Chambers reflect sound back on itself and cancel bands of it: quieter, with a hollow, muted note.',
}
export const collectorLabels: Record<Exhaust['collector'], string> = {
  '4-1': '4-into-1',
  '4-2-1': '4-2-1 (tri-Y)',
}
type Field = {
  key: 'headerLength' | 'tailpipeLength'
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
  help: string
}
export const exhaustFields: Field[] = [
  {
    key: 'headerLength',
    label: 'Header length',
    unit: 'mm',
    scale: 1000,
    min: 200,
    max: 1500,
    step: 10,
    help: 'Primary pipes from each port to the collector. Longer headers resonate lower.',
  },
  {
    key: 'tailpipeLength',
    label: 'System length after collector',
    unit: 'mm',
    scale: 1000,
    min: 300,
    max: 4000,
    step: 50,
    help: 'Pipe from the collector to the outlet, including the silencer. Sets the deepest resonances.',
  },
]
export const exhaustRangeText = (f: Field) => `${f.min}–${f.max} ${f.unit}`

/** Out-of-range exhaust fields, keyed by label. */
export function exhaustErrors(value: Exhaust) {
  const errors: Record<string, string> = {}
  for (const issue of exhaustSchema.safeParse(value).error?.issues ?? []) {
    const field = exhaustFields.find((f) => f.key === issue.path[0])
    if (field)
      errors[field.label] ??= `Supported range ${exhaustRangeText(field)}`
  }
  return errors
}

/** Plain-language differences between two exhaust systems. */
export function describeExhaust(
  a: Exhaust = exhaustDefaults,
  b: Exhaust = exhaustDefaults,
) {
  const changes: string[] = []
  for (const f of exhaustFields)
    if (a[f.key] !== b[f.key])
      changes.push(
        `${f.label}: ${Math.round(a[f.key] * f.scale)} → ${Math.round(b[f.key] * f.scale)} ${f.unit}`,
      )
  if (a.collector !== b.collector)
    changes.push(
      `Collector: ${collectorLabels[a.collector]} → ${collectorLabels[b.collector]}`,
    )
  if (a.pressureWaves !== b.pressureWaves)
    changes.push(
      `Pressure waves: ${a.pressureWaves ? 'on' : 'off'} → ${b.pressureWaves ? 'on' : 'off'}`,
    )
  if (a.catalyst !== b.catalyst)
    changes.push(
      `Catalyst: ${a.catalyst ? 'fitted' : 'removed'} → ${b.catalyst ? 'fitted' : 'removed'}`,
    )
  if (a.silencer !== b.silencer)
    changes.push(
      `Silencer: ${silencerLabels[a.silencer]} → ${silencerLabels[b.silencer]}`,
    )
  return changes
}
