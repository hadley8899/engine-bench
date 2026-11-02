import type { Conditions, EngineDefinition, Procedure, Run } from './schema'
import type { Controls, Telemetry } from './core'
import type { Listener } from './acoustics'
export type HostMessage =
  | { type: 'configure'; engine: EngineDefinition; conditions: Conditions }
  /** Live update: apply a definition without stopping a running engine. */
  | { type: 'reconfigure'; engine: EngineDefinition; conditions: Conditions }
  | { type: 'controls'; value: Partial<Controls> }
  /** Listening position; sound only. */
  | { type: 'listener'; value: Listener }
  | { type: 'start'; ignition?: boolean; automaticStarter?: boolean }
  | { type: 'stop'; reason: string }
  | {
      type: 'dyno'
      engine: EngineDefinition
      conditions: Conditions
      procedure: Procedure
      id: string
      runtime: string
    }
  | {
      type: 'probe'
      engine: EngineDefinition
      conditions: Conditions
      frames: number
      controls: Partial<Controls>
    }
export type HostEvent =
  | {
      type: 'telemetry'
      value: Telemetry
      callbackMs: number
      budgetMs: number
    }
  | { type: 'run'; value: Run }
  | { type: 'error'; message: string }
  | { type: 'probe'; value: Telemetry }
