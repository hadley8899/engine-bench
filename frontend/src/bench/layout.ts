/**
 * Bench layout: the top-level modes, the workshop's sections and which
 * build fields each section edits, so a section can show that it differs
 * from the engine on the stand or from its starting build.
 */
import type { EngineDefinition } from '../sim/schema'

export type View = 'bench' | 'workshop' | 'maps' | 'dyno' | 'library'
export const VIEWS: { key: View; label: string }[] = [
  { key: 'bench', label: 'Bench' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'maps', label: 'Maps' },
  { key: 'dyno', label: 'Dyno' },
  { key: 'library', label: 'Library' },
]

export type Section =
  | 'build'
  | 'basics'
  | 'fuel'
  | 'cams'
  | 'combustion'
  | 'induction'
  | 'exhaust'
  | 'parts'
  | 'conditions'
export const SECTIONS: {
  key: Section
  label: string
  fields: (keyof EngineDefinition)[]
}[] = [
  { key: 'build', label: 'Starting build', fields: ['name'] },
  {
    key: 'basics',
    label: 'Geometry and basics',
    fields: [
      'bore',
      'stroke',
      'rodLength',
      'compression',
      'starterTorque',
      'intakeArea',
      'exhaustArea',
      'intakeClose',
      'intakeRunnerLength',
      'ignitionAdvance',
      'burnDuration',
      'lambda',
      'inertia',
      'revLimit',
      'mechanicalLimit',
    ],
  },
  { key: 'fuel', label: 'Fuel system', fields: ['fuelSystem', 'fuelSupply'] },
  { key: 'cams', label: 'Camshaft', fields: ['cams', 'camSwitch'] },
  { key: 'combustion', label: 'Combustion and knock', fields: ['combustion'] },
  { key: 'induction', label: 'Forced induction', fields: ['induction'] },
  { key: 'exhaust', label: 'Exhaust and limiter', fields: ['exhaust', 'limiterCut'] },
  { key: 'parts', label: 'Parts and limits', fields: ['parts'] },
  { key: 'conditions', label: 'Test cell', fields: [] },
]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Sections whose fields differ between two builds. */
export function changedSections(a: EngineDefinition, b: EngineDefinition) {
  return new Set(
    SECTIONS.filter((s) => s.fields.some((f) => !same(a[f], b[f]))).map(
      (s) => s.key,
    ),
  )
}
/** Whether the engine maps differ between two builds. */
export function mapsChanged(a: EngineDefinition, b: EngineDefinition) {
  return !same(a.management, b.management)
}

const viewKey = 'engine-bench:view'
/** The open mode, workshop section and telemetry tab, kept for this tab. */
export type LayoutState = {
  view: View
  section: Section
  telemetry: 'engine' | 'cylinders' | 'traces'
}
export function loadLayout(): LayoutState {
  const fallback: LayoutState = {
    view: 'bench',
    section: 'build',
    telemetry: 'engine',
  }
  try {
    const value = JSON.parse(sessionStorage.getItem(viewKey) || 'null')
    return {
      view: VIEWS.some((v) => v.key === value?.view) ? value.view : fallback.view,
      section: SECTIONS.some((s) => s.key === value?.section)
        ? value.section
        : fallback.section,
      telemetry: ['engine', 'cylinders', 'traces'].includes(value?.telemetry)
        ? value.telemetry
        : fallback.telemetry,
    }
  } catch {
    return fallback
  }
}
export function persistLayout(state: LayoutState) {
  try {
    sessionStorage.setItem(viewKey, JSON.stringify(state))
  } catch {
    // Storage can be unavailable; the layout then resets on reload.
  }
}
