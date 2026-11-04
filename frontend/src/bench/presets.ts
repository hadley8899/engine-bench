/**
 * Presets based on real engines. Each is an approximation calibrated to a
 * published torque curve, not a replica; docs/PRESETS.md records its
 * sources, inferred values and deviations.
 */
import {
  combustionDefaults,
  exhaustDefaults,
  flatMaps,
  fuelSystemDefaults,
  inductionDefaults,
  roadEngine,
  stockParts,
} from '../sim/schema'
import type { EngineDefinition } from '../sim/schema'

export type RealEngine = {
  label: string
  description: string
  /** Published figures shown with the preset. */
  rated: string
  engine: EngineDefinition
}

const axx: EngineDefinition = {
  ...roadEngine,
  name: 'VW 2.0 TFSI (AXX) • Golf GTI Mk5',
  // Sourced (VW SSP 337): 1,984 cc, 82.5 × 92.8 mm, 10.5:1, direct
  // injection, RON 98. Rod length from replacement-part listings.
  bore: 0.0825,
  stroke: 0.0928,
  rodLength: 0.144,
  compression: 10.5,
  // Inferred: valve areas, intake closing, runners, burn and inertia.
  intakeArea: 0.00072,
  exhaustArea: 0.00062,
  intakeClose: 585,
  intakeRunnerLength: 0.3,
  ignitionAdvance: 14,
  burnDuration: 50,
  lambda: 1,
  inertia: 0.2,
  revLimit: 6800,
  limiterCut: 'fuel',
  mechanicalLimit: 7200,
  // K03-sized turbo; turbine and boost calibrated to the published curve.
  induction: {
    ...inductionDefaults.turbo,
    compressorDiameter: 0.046,
    turbineArea: 0.00022,
    shaftInertia: 0.000018,
    maxShaftRpm: 230000,
    boostTarget: 60000,
    intercooler: { effectiveness: 0.55, pressureDrop: 12000 },
  },
  fuelSystem: fuelSystemDefaults.direct,
  combustion: { ...combustionDefaults, fuel: 'ron98' },
  management: null,
  fuelSupply: { injectorFlow: 450, maxDuty: 0.85, pumpFlow: 130 },
  exhaust: {
    ...exhaustDefaults,
    headerLength: 0.3,
    silencer: 'absorptive',
    tailpipeLength: 2.4,
  },
  parts: stockParts,
}
// The ECU enriches at full boost, as production engines do to protect the
// turbine and pistons; elsewhere it holds λ 1.
const axxMaps = flatMaps(axx)
axxMaps.lambda = axxMaps.load.map((load) =>
  axxMaps.rpm.map((rpm) =>
    load >= 150000 && rpm >= 3500 ? (rpm >= 5000 ? 0.88 : 0.93) : 1,
  ),
)

export const realEngines: RealEngine[] = [
  {
    label: 'VW Golf GTI Mk5 2.0 TFSI',
    description:
      'The 2005 Golf GTI’s EA113 2.0 TFSI (AXX): turbocharged direct injection on RON 98, with a K03-sized turbo that runs out of breath above 4,700 RPM. Push the boost and see what the cast pistons take.',
    rated: '147 kW at 5,700 RPM · 280 Nm at 1,800–4,700 RPM (VW)',
    engine: { ...axx, management: axxMaps },
  },
]
