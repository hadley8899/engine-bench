/**
 * Presets based on real engines. Each is an approximation calibrated to
 * published figures (a full torque curve where one was found), not a
 * replica; docs/PRESETS.md records its sources, inferred values and
 * deviations.
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
import type { EngineDefinition, Management } from '../sim/schema'
import { camsFromEvents } from '../sim/cams'

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

/** Piecewise-linear value at an RPM, held flat beyond the ends. */
function byRpm(points: [number, number][], rpm: number) {
  if (rpm <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++)
    if (rpm <= points[i][0])
      return (
        points[i - 1][1] +
        ((points[i][1] - points[i - 1][1]) * (rpm - points[i - 1][0])) /
          (points[i][0] - points[i - 1][0])
      )
  return points[points.length - 1][1]
}
/**
 * Maps shaped by RPM at full load: boost (full from half throttle, scaled
 * below), spark advance above 80 kPa manifold pressure, and λ above 90 kPa.
 * Everything else keeps the build's single values.
 */
function shapedMaps(
  e: EngineDefinition,
  shape: {
    boost?: [number, number][]
    ignition?: [number, number][]
    lambda?: [number, number][]
  },
): Management {
  const m = flatMaps(e)
  const { boost, ignition, lambda } = shape
  if (boost)
    m.boost = m.throttle.map((t) =>
      m.rpm.map((r) => Math.round(byRpm(boost, r) * Math.min(1, t * 2))),
    )
  if (ignition)
    m.ignition = m.load.map((l, i) =>
      m.rpm.map((r, j) =>
        l >= 80000 ? Math.round(byRpm(ignition, r) * 2) / 2 : m.ignition[i][j],
      ),
    )
  if (lambda)
    m.lambda = m.load.map((l, i) =>
      m.rpm.map((r, j) =>
        l >= 90000 ? Math.round(byRpm(lambda, r) * 100) / 100 : m.lambda[i][j],
      ),
    )
  return m
}

/**
 * Cam profiles reproducing the build's calibrated events, plus an intake
 * phaser whose map follows an RPM curve (the same at every load). The
 * exhaust cam is fixed.
 */
function phased(
  e: EngineDefinition,
  maps: Management,
  range: number,
  intake: [number, number][],
): EngineDefinition {
  const cams = {
    ...camsFromEvents(e),
    phasers: { intakeRange: range, exhaustRange: 0, rate: 200 },
  }
  return {
    ...e,
    camSwitch: null,
    cams,
    management: {
      ...maps,
      intakeCam: maps.load.map(() =>
        maps.rpm.map((r) => Math.round(byRpm(intake, r))),
      ),
      exhaustCam: maps.load.map(() => maps.rpm.map(() => 0)),
    },
  }
}

// Honda K20A (Civic Type R FD2, 2007): Honda's archived catalogue.
const k20a: EngineDefinition = {
  ...roadEngine,
  name: 'Honda K20A • Civic Type R FD2',
  bore: 0.086,
  stroke: 0.086,
  rodLength: 0.139,
  compression: 11.7,
  // Low cam; VTEC's high cam takes over at 5,200 RPM.
  intakeArea: 0.0007,
  exhaustArea: 0.00068,
  intakeClose: 575,
  intakeRunnerLength: 0.36,
  ignitionAdvance: 24,
  burnDuration: 46,
  lambda: 1,
  inertia: 0.15,
  revLimit: 8600,
  limiterCut: 'fuel',
  mechanicalLimit: 9000,
  induction: { kind: 'none' },
  fuelSystem: fuelSystemDefaults.port,
  combustion: { ...combustionDefaults, fuel: 'ron98' },
  management: null,
  fuelSupply: { injectorFlow: 360, maxDuty: 0.85, pumpFlow: 130 },
  exhaust: {
    ...exhaustDefaults,
    headerLength: 0.45,
    collector: '4-2-1',
    silencer: 'absorptive',
  },
  parts: stockParts,
  camSwitch: {
    rpm: 5200,
    intakeArea: 0.0012,
    exhaustArea: 0.0008,
    intakeClose: 615,
  },
}
// Mitsubishi 4G63T (Lancer Evolution VIII GSR, 2003).
const evo: EngineDefinition = {
  ...roadEngine,
  name: 'Mitsubishi 4G63T • Lancer Evolution VIII',
  bore: 0.085,
  stroke: 0.088,
  rodLength: 0.15,
  compression: 8.8,
  intakeArea: 0.00078,
  exhaustArea: 0.00068,
  intakeClose: 590,
  intakeRunnerLength: 0.3,
  ignitionAdvance: 14,
  burnDuration: 50,
  lambda: 1,
  inertia: 0.2,
  revLimit: 7200,
  limiterCut: 'fuel',
  mechanicalLimit: 7600,
  // TD05HR-sized turbo; boost tapers with RPM through the boost map.
  induction: {
    ...inductionDefaults.turbo,
    compressorDiameter: 0.056,
    turbineArea: 0.00033,
    shaftInertia: 0.00003,
    maxShaftRpm: 200000,
    boostTarget: 120000,
    intercooler: { effectiveness: 0.7, pressureDrop: 8000 },
  },
  fuelSystem: fuelSystemDefaults.port,
  combustion: { ...combustionDefaults, fuel: 'ron98' },
  management: null,
  fuelSupply: { injectorFlow: 560, maxDuty: 0.85, pumpFlow: 190 },
  exhaust: { ...exhaustDefaults, headerLength: 0.3, silencer: 'absorptive' },
  parts: stockParts,
}
// Nissan SR20DET (Silvia S15 Spec-R, 1999).
const sr20: EngineDefinition = {
  ...roadEngine,
  name: 'Nissan SR20DET • Silvia S15 Spec-R',
  bore: 0.086,
  stroke: 0.086,
  rodLength: 0.1363,
  compression: 8.5,
  intakeArea: 0.00075,
  exhaustArea: 0.00065,
  intakeClose: 590,
  intakeRunnerLength: 0.28,
  ignitionAdvance: 15,
  burnDuration: 50,
  lambda: 1,
  inertia: 0.2,
  revLimit: 7500,
  limiterCut: 'fuel',
  mechanicalLimit: 8000,
  // T28 ball-bearing-sized turbo.
  induction: {
    ...inductionDefaults.turbo,
    compressorDiameter: 0.054,
    turbineArea: 0.0006,
    shaftInertia: 0.00002,
    maxShaftRpm: 210000,
    boostTarget: 60000,
    intercooler: { effectiveness: 0.65, pressureDrop: 8000 },
  },
  fuelSystem: fuelSystemDefaults.port,
  combustion: { ...combustionDefaults, fuel: 'ron98' },
  management: null,
  fuelSupply: { injectorFlow: 480, maxDuty: 0.85, pumpFlow: 160 },
  exhaust: { ...exhaustDefaults, headerLength: 0.3, silencer: 'absorptive' },
  parts: stockParts,
}
// Toyota 4A-GE 16-valve (Corolla Levin/Sprinter Trueno AE86, 1983).
const ae86: EngineDefinition = {
  ...roadEngine,
  name: 'Toyota 4A-GE • AE86',
  bore: 0.081,
  stroke: 0.077,
  rodLength: 0.1055,
  compression: 9.4,
  intakeArea: 0.0006,
  exhaustArea: 0.0006,
  intakeClose: 585,
  intakeRunnerLength: 0.3,
  ignitionAdvance: 20,
  burnDuration: 48,
  lambda: 1,
  inertia: 0.14,
  revLimit: 7600,
  limiterCut: 'fuel',
  mechanicalLimit: 8000,
  induction: { kind: 'none' },
  fuelSystem: fuelSystemDefaults.port,
  combustion: { ...combustionDefaults, fuel: 'ron98' },
  management: null,
  fuelSupply: { injectorFlow: 190, maxDuty: 0.85, pumpFlow: 90 },
  exhaust: { ...exhaustDefaults, headerLength: 0.5, collector: '4-2-1' },
  parts: stockParts,
}

export const realEngines: RealEngine[] = [
  {
    label: 'VW Golf GTI Mk5 2.0 TFSI',
    description:
      'The 2005 Golf GTI’s EA113 2.0 TFSI (AXX): turbocharged direct injection on RON 98, with a K03-sized turbo that runs out of breath above 4,700 RPM. Push the boost and see what the cast pistons take.',
    rated: '147 kW at 5,700 RPM · 280 Nm at 1,800–4,700 RPM (VW)',
    // 42° of intake phasing (SSP 337): retarded at idle speeds, advanced
    // while the turbo spools, then held where the ECU limits torque.
    engine: phased(axx, axxMaps, 42, [
      [1000, -20],
      [1500, 20],
      [2000, 5],
      [2500, 0],
    ]),
  },
  {
    label: 'Honda Civic Type R FD2 K20A',
    description:
      'Honda’s high-compression K20A: 225 PS without a turbo, an 8,400 RPM redline and VTEC switching to a high-lift cam at 5,200 RPM. Watch the torque dip, then come back hard.',
    rated: '165 kW at 8,000 RPM · 215 Nm at 6,100 RPM (Honda)',
    // i-VTEC: VTEC's high-lift profile plus 50° of continuous intake
    // phasing, retarded at low speed and around the changeover.
    engine: phased(
      k20a,
      shapedMaps(k20a, {
        ignition: [
          [1500, 12],
          [3000, 20],
          [4000, 24],
        ],
        lambda: [
          [4000, 0.92],
          [6000, 0.88],
        ],
      }),
      50,
      [
        [1500, -32],
        [2500, -15],
        [3500, 0],
        [4000, -5],
        [4500, -25],
        [5000, -10],
        [5500, 0],
        [6000, 5],
        [7000, 5],
        [8000, 0],
      ],
    ),
  },
  {
    label: 'Mitsubishi Evo VIII 4G63T',
    description:
      'The iron-block 4G63T from the Lancer Evolution VIII: a TD05HR-sized turbo at about 1.2 bar, tapering with RPM, and a big mid-range. The tuners’ favourite.',
    rated: '206 kW at 6,500 RPM · 383 Nm at 3,500 RPM',
    engine: {
      ...evo,
      management: shapedMaps(evo, {
        boost: [
          [3000, 125000],
          [4000, 122000],
          [6500, 105000],
        ],
        lambda: [
          [3000, 1],
          [4000, 0.88],
          [6000, 0.84],
        ],
      }),
    },
  },
  {
    label: 'Nissan Silvia S15 SR20DET',
    description:
      'The S15 Silvia Spec-R’s SR20DET: a ball-bearing T28-sized turbo and a broad, flat torque curve from 4,000 RPM. A drifting icon.',
    rated: '184 kW at 6,400 RPM · 275 Nm at 4,800 RPM (Nissan)',
    // VTC: the intake cam advances 20° between 1,500 and 5,000 RPM.
    engine: phased(
      sr20,
      shapedMaps(sr20, {
        boost: [
          [3000, 45000],
          [4800, 52000],
          [6400, 80000],
        ],
        lambda: [
          [4000, 0.92],
          [6000, 0.86],
        ],
      }),
      20,
      [
        [1400, 0],
        [1500, 20],
        [5000, 20],
        [5100, 0],
      ],
    ),
  },
  {
    label: 'Toyota AE86 4A-GE',
    description:
      'The AE86’s 16-valve 4A-GE: 1.6 litres, no turbo, a light short stroke and a 7,600 RPM redline. Small numbers, big reputation.',
    rated: '88 kW at 6,600 RPM · 149 Nm at 5,200 RPM (Toyota, JDM net)',
    engine: ae86,
  },
]
