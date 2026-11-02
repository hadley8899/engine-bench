import { z } from 'zod'
import {
  conditionsSchema,
  engineSchema,
  normalConditions,
  roadEngine,
  runSchema,
  validateEngine,
} from '../sim/schema'
import type { Conditions, EngineDefinition, Run } from '../sim/schema'
import { LISTENERS } from '../sim/acoustics'
import type { Listener } from '../sim/acoustics'
const key = 'engine-bench:guest-experiment:1'
const stateSchema = z.object({
  engine: engineSchema,
  conditions: conditionsSchema,
  baseline: runSchema.nullable(),
  modified: runSchema.nullable(),
  previous: engineSchema.nullable(),
})
export type Experiment = {
  engine: EngineDefinition
  conditions: Conditions
  baseline: Run | null
  modified: Run | null
  previous: EngineDefinition | null
}
export function loadExperiment(): Experiment {
  try {
    const value = stateSchema.parse(
      JSON.parse(sessionStorage.getItem(key) || 'null'),
    )
    validateEngine(value.engine)
    return value
  } catch {
    return {
      engine: roadEngine,
      conditions: normalConditions,
      baseline: null,
      modified: null,
      previous: null,
    }
  }
}
export function persistExperiment(state: Experiment) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    /* A blocked/full browser store must not stop the live bench. */
  }
}

const draftKey = 'engine-bench:guest-draft:1'
export function loadDraft(fallback: Pick<Experiment, 'engine' | 'conditions'>) {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) || 'null')
    return {
      engine: validateEngine(value.engine),
      conditions: conditionsSchema.parse(value.conditions),
    }
  } catch {
    return fallback
  }
}
export function persistDraft(engine: EngineDefinition, conditions: Conditions) {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({ engine, conditions }))
  } catch {
    /* Keep editing when browser storage is unavailable. */
  }
}

const liveKey = 'engine-bench:live-updates:1'
/** Per-viewer preference; falls back to off when storage is unavailable. */
export function loadLiveUpdates() {
  try {
    return localStorage.getItem(liveKey) === 'on'
  } catch {
    return false
  }
}
export function persistLiveUpdates(on: boolean) {
  try {
    localStorage.setItem(liveKey, on ? 'on' : 'off')
  } catch {
    // Preference only; the bench works without it.
  }
}

/** Per-viewer bench preferences: listening position and display units. */
const preferencesKey = 'engine-bench:preferences:1'
const preferencesSchema = z.object({
  listener: z.enum(LISTENERS).catch('tailpipe'),
  power: z.enum(['kW', 'hp', 'PS']).catch('kW'),
  torque: z.enum(['Nm', 'lb·ft']).catch('Nm'),
})
export type Preferences = z.infer<typeof preferencesSchema>
export type { Listener }
export function loadPreferences(): Preferences {
  try {
    return preferencesSchema.parse(
      JSON.parse(localStorage.getItem(preferencesKey) || '{}'),
    )
  } catch {
    return { listener: 'tailpipe', power: 'kW', torque: 'Nm' }
  }
}
export function persistPreferences(value: Preferences) {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify(value))
  } catch {
    // Preference only; the bench works without it.
  }
}
