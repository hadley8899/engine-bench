/** Fictional starting builds with distinct characters. Not production replicas. */
import {
  combustionDefaults,
  exhaustDefaults,
  fuelSystemDefaults,
  inductionDefaults,
  roadEngine,
  sportEngine,
} from '../sim/schema'
import type { EngineDefinition } from '../sim/schema'

export type StarterBuild = {
  label: string
  description: string
  engine: EngineDefinition
}

export const starterBuilds: StarterBuild[] = [
  {
    label: 'Road 2.0',
    description: 'Mild compression and modest ports, catalyst and a chambered silencer.',
    engine: roadEngine,
  },
  {
    label: 'Sport 2.0',
    description: 'Freer breathing, longer intake timing and lighter inertia.',
    engine: {
      ...sportEngine,
      exhaust: {
        ...exhaustDefaults,
        headerLength: 0.42,
        collector: '4-2-1',
        silencer: 'absorptive',
        tailpipeLength: 2.2,
      },
    },
  },
  {
    label: 'Turbo hot hatch',
    description:
      'Lower compression, a small quick-spooling turbo and direct injection on RON 98. Lift off to hear the blow-off valve.',
    engine: {
      ...roadEngine,
      name: 'Workshop 2.0T • Hot hatch',
      compression: 9,
      intakeArea: 0.00075,
      exhaustArea: 0.00065,
      ignitionAdvance: 14,
      revLimit: 6500,
      mechanicalLimit: 7000,
      induction: { ...inductionDefaults.turbo, boostTarget: 90000 },
      fuelSystem: fuelSystemDefaults.direct,
      combustion: { ...combustionDefaults, fuel: 'ron98' },
      // Direct-injection injectors and high-pressure pump with modest headroom.
      fuelSupply: { injectorFlow: 450, maxDuty: 0.85, pumpFlow: 130 },
      exhaust: {
        ...exhaustDefaults,
        headerLength: 0.35,
        silencer: 'absorptive',
        tailpipeLength: 2.3,
      },
    },
  },
  {
    label: 'Torquey long-stroke',
    description:
      'Long stroke, long runners and early intake closing: strong low-down pull that runs out of breath early.',
    engine: {
      ...roadEngine,
      name: 'Workshop 2.0 • Long-stroke',
      bore: 0.081,
      stroke: 0.097,
      rodLength: 0.152,
      compression: 10.5,
      intakeArea: 0.00062,
      exhaustArea: 0.00053,
      intakeClose: 580,
      intakeRunnerLength: 0.5,
      inertia: 0.28,
      revLimit: 6000,
      mechanicalLimit: 6500,
      exhaust: {
        ...exhaustDefaults,
        headerLength: 0.75,
        collector: '4-2-1',
        tailpipeLength: 2.8,
      },
    },
  },
  {
    label: 'Screaming 9k',
    description:
      'Short stroke, big valves, late intake closing and a light crank. A spark-cut limiter and straight pipe pop and bang.',
    engine: {
      ...roadEngine,
      name: 'Workshop 1.8 • 9k',
      bore: 0.088,
      stroke: 0.074,
      rodLength: 0.135,
      compression: 12,
      intakeArea: 0.00105,
      exhaustArea: 0.00088,
      intakeClose: 610,
      intakeRunnerLength: 0.2,
      ignitionAdvance: 17,
      burnDuration: 42,
      inertia: 0.12,
      revLimit: 9000,
      mechanicalLimit: 9600,
      limiterCut: 'spark',
      fuelSupply: { injectorFlow: 320, maxDuty: 0.85, pumpFlow: 130 },
      exhaust: {
        headerLength: 0.32,
        collector: '4-2-1',
        catalyst: false,
        silencer: 'straight',
        tailpipeLength: 1.2,
      },
    },
  },
]
