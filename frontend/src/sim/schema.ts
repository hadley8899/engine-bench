import { z } from 'zod'

/**
 * 1.2.0: temperature-dependent gas properties, Woschni-form wall heat,
 * piston-speed friction and intake runner inertia; recalibrated presets.
 * 1.3.0: turbochargers, superchargers and intercoolers.
 * 1.4.0: fuel systems (carburettor, throttle-body, port and direct
 * injection) with wall-film fuel transport and mixture limits.
 * 1.5.0: the rev limiter cuts fuel (injection stops) or spark (fuel still
 * flows and leaves unburned); exhaust systems and sound (no physics change).
 * 1.6.0: fuel grades, an end-gas knock estimate, optional ECU knock control
 * and an optional predictive burn rate. Builds without a combustion block
 * keep 1.5.0 behaviour.
 * 1.7.0: engine-management maps (ignition, target λ, boost) and fuel
 * supply limits (injectors, pump). Builds without them keep 1.6.0
 * behaviour.
 * 1.8.0: per-cylinder estimated temperatures (port gas, piston crown,
 * exhaust valve, combustion deck). They observe the gas and do not change
 * any result.
 * 1.9.0: rich burns form CO and H2 by water–gas shift equilibrium, so
 * enrichment releases less heat into more gas and cools the charge. It
 * applies to every build (decision of 3 November 2026: no saved builds
 * needed to keep 1.8.0 results).
 * 1.10.0: equilibrium dissociation of the burned gas (CO2, CO, H2O, H2,
 * OH, H, O2, O) holds heat back while it is hot and returns it as it
 * cools, so best power falls slightly rich of λ 1. Applies to every build.
 * 1.11.0: engine parts (pistons, rods, head gasket and fasteners, valve
 * springs) with estimated limits, stress estimates and failures. Stock
 * parts, which builds saved earlier receive, leave every result unchanged
 * unless a limit is exceeded.
 */
export const MODEL_VERSION = 'eb-0d-1.11.0'
/** Runs recorded by earlier model versions remain readable as history. */
export const MODEL_VERSIONS = [
  'eb-0d-1.0.0',
  'eb-0d-1.1.0',
  'eb-0d-1.2.0',
  'eb-0d-1.3.0',
  'eb-0d-1.4.0',
  'eb-0d-1.5.0',
  'eb-0d-1.6.0',
  'eb-0d-1.7.0',
  'eb-0d-1.8.0',
  'eb-0d-1.9.0',
  'eb-0d-1.10.0',
  MODEL_VERSION,
] as const
const intercoolerSchema = z.strictObject({
  /** Fraction of the compressor's temperature rise removed. 0 = no intercooler. */
  effectiveness: z.number().min(0).max(0.95),
  /** Charge pressure lost at 0.1 kg/s; scales with flow squared. */
  pressureDrop: z.number().min(0).max(30000),
})
const blowOff = z.boolean()
/** Forced induction. Boost pressures are gauge (above ambient). */
export const inductionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('turbo'),
    compressorDiameter: z.number().min(0.02).max(0.2),
    compressorEfficiency: z.number().min(0.5).max(0.85),
    /** Effective turbine nozzle area; smaller spools sooner with more back pressure. */
    turbineArea: z.number().min(0.00002).max(0.01),
    turbineEfficiency: z.number().min(0.5).max(0.85),
    shaftInertia: z.number().min(0.000001).max(0.01),
    boostTarget: z.number().min(0).max(400000),
    maxShaftRpm: z.number().int().min(20000).max(400000),
    blowOff,
    intercooler: intercoolerSchema,
  }),
  z.strictObject({
    kind: z.literal('centrifugal'),
    compressorDiameter: z.number().min(0.02).max(0.2),
    compressorEfficiency: z.number().min(0.5).max(0.85),
    /** Compressor shaft speed per crank speed, including any internal step-up. */
    driveRatio: z.number().min(1).max(30),
    maxShaftRpm: z.number().int().min(20000).max(400000),
    blowOff,
    intercooler: intercoolerSchema,
  }),
  z.strictObject({
    kind: z.literal('roots'),
    /** Air displaced per rotor revolution. */
    rotorDisplacement: z.number().min(0.0001).max(0.02),
    driveRatio: z.number().min(0.5).max(6),
    efficiency: z.number().min(0.3).max(0.85),
    /** Bypass valve that unloads the blower at part throttle. */
    bypass: z.boolean(),
    intercooler: intercoolerSchema,
  }),
])
export type Induction = z.infer<typeof inductionSchema>
export type InductionKind = Induction['kind']
const defaultIntercooler = { effectiveness: 0.7, pressureDrop: 6000 }
/** Starting points when switching induction type; sized for about 2 L. */
export const inductionDefaults = {
  none: { kind: 'none' },
  turbo: {
    kind: 'turbo',
    compressorDiameter: 0.05,
    compressorEfficiency: 0.76,
    turbineArea: 0.0006,
    turbineEfficiency: 0.72,
    shaftInertia: 0.000025,
    boostTarget: 80000,
    maxShaftRpm: 210000,
    blowOff: true,
    intercooler: defaultIntercooler,
  },
  centrifugal: {
    kind: 'centrifugal',
    compressorDiameter: 0.085,
    compressorEfficiency: 0.76,
    driveRatio: 12,
    maxShaftRpm: 90000,
    blowOff: true,
    intercooler: defaultIntercooler,
  },
  roots: {
    kind: 'roots',
    rotorDisplacement: 0.001,
    driveRatio: 2,
    efficiency: 0.55,
    bypass: true,
    intercooler: { effectiveness: 0.6, pressureDrop: 4000 },
  },
} satisfies { [K in InductionKind]: Extract<Induction, { kind: K }> }
/** How fuel is metered and where it enters the air. */
const ecu = {
  /** Electronic correction for fuel lost to, or released from, the wall film. */
  transientCorrection: z.boolean(),
  /** Cut fuel on a closed throttle above 1,800 RPM; resume below 1,400. */
  overrunCut: z.boolean(),
}
export const fuelSystemSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('carburettor'),
    /** Venturi (choke) throat diameter of each barrel. */
    chokeDiameter: z.number().min(0.012).max(0.07),
    /** Total barrels (chokes) feeding the engine. */
    chokes: z.number().int().min(1).max(8),
    acceleratorPump: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('throttleBody'), ...ecu }),
  z.strictObject({ kind: z.literal('port'), ...ecu }),
  z.strictObject({ kind: z.literal('direct'), ...ecu }),
])
export type FuelSystem = z.infer<typeof fuelSystemSchema>
export type FuelSystemKind = FuelSystem['kind']
const ecuDefaults = { transientCorrection: true, overrunCut: true }
export const fuelSystemDefaults = {
  carburettor: {
    kind: 'carburettor',
    chokeDiameter: 0.032,
    chokes: 2,
    acceleratorPump: true,
  },
  throttleBody: { kind: 'throttleBody', ...ecuDefaults },
  port: { kind: 'port', ...ecuDefaults },
  direct: { kind: 'direct', ...ecuDefaults },
} satisfies { [K in FuelSystemKind]: Extract<FuelSystem, { kind: K }> }

/**
 * Exhaust system after the ports. In this model version it shapes only the
 * sound (pipe resonances, filtering and afterfire); it does not change gas
 * exchange, back pressure or power.
 */
export const exhaustSchema = z.strictObject({
  /** Primary (header) pipe length from port to collector. */
  headerLength: z.number().min(0.2).max(1.5),
  /** 4-2-1 pairs the primaries into two secondaries before the collector. */
  collector: z.enum(['4-1', '4-2-1']),
  catalyst: z.boolean(),
  /** Straight-through, absorptive (packed) or chambered (reactive) silencer. */
  silencer: z.enum(['straight', 'absorptive', 'chambered']),
  /** Pipe from the collector to the outlet, including the silencer. */
  tailpipeLength: z.number().min(0.3).max(4),
})
export type Exhaust = z.infer<typeof exhaustSchema>
export const exhaustDefaults: Exhaust = {
  headerLength: 0.5,
  collector: '4-1',
  catalyst: true,
  silencer: 'chambered',
  tailpipeLength: 2.5,
}

/**
 * Fuel, burn rate and knock protection. Knock is always estimated and
 * reported; only knock control acts on it.
 */
export const combustionSchema = z.strictObject({
  /** Fixed: the burn always takes burnDuration. Predictive: burnDuration is
   * the 3,000 RPM full-load reference and the burn speeds up or slows with
   * speed, charge density, mixture and residual gas. */
  burnRate: z.enum(['fixed', 'predictive']),
  fuel: z.enum(['ron91', 'ron95', 'ron98', 'e85']),
  /** ECU knock sensing: retards the knocking cylinder, then creeps back. */
  knockControl: z.boolean(),
})
export type Combustion = z.infer<typeof combustionSchema>
export type FuelGrade = Combustion['fuel']
/** What builds saved before 1.6.0 receive: unchanged 1.5.0 behaviour. */
export const legacyCombustion: Combustion = {
  burnRate: 'fixed',
  fuel: 'ron95',
  knockControl: false,
}
export const combustionDefaults: Combustion = {
  burnRate: 'predictive',
  fuel: 'ron95',
  knockControl: true,
}

/** Map breakpoints: strictly increasing, 2–16 of them. */
const axis = (min: number, max: number) =>
  z
    .array(z.number().min(min).max(max))
    .min(2)
    .max(16)
    .refine((a) => a.every((v, i) => i === 0 || v > a[i - 1]), {
      message: 'Breakpoints must increase',
    })
const table = (min: number, max: number) =>
  z.array(z.array(z.number().min(min).max(max)).min(2).max(16)).min(2).max(16)
/**
 * ECU tables. Rows follow the load axis, columns the RPM axis; values
 * between breakpoints are interpolated and held flat beyond the ends.
 */
export const managementSchema = z
  .strictObject({
    rpm: axis(0, 25000),
    /** Load for ignition and λ: absolute manifold pressure, Pa. */
    load: axis(10000, 500000),
    /** Spark advance, degrees before top dead centre (negative = after). */
    ignition: table(-10, 50),
    /** Target λ for electronic injection. */
    lambda: table(0.7, 1.3),
    /** Load for the boost map: driver throttle, 0–1. */
    throttle: axis(0, 1),
    /** Turbo boost target (gauge), Pa, by throttle row and RPM column. */
    boost: table(0, 400000),
  })
  .superRefine((m, ctx) => {
    const check = (name: 'ignition' | 'lambda' | 'boost', rows: number) => {
      const t = m[name]
      if (t.length !== rows || t.some((r) => r.length !== m.rpm.length))
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `The ${name} table must be ${rows} × ${m.rpm.length}`,
        })
    }
    check('ignition', m.load.length)
    check('lambda', m.load.length)
    check('boost', m.throttle.length)
  })
export type Management = z.infer<typeof managementSchema>
/**
 * Fuel delivery capacity. Injector flow is per injector at its rated
 * pressure (4 injectors); a carburettor has none and is limited by the
 * pump alone. For direct injection the pump is the high-pressure pump.
 */
export const fuelSupplySchema = z.strictObject({
  injectorFlow: z.number().min(50).max(3000),
  /** Largest share of each cycle an injector may stay open. */
  maxDuty: z.number().min(0.5).max(1),
  pumpFlow: z.number().min(10).max(1000),
})
export type FuelSupply = z.infer<typeof fuelSupplySchema>

/**
 * Fitted internal parts; their masses and limits are in parts.ts. Stock
 * parts are rated for the build's estimated mechanical limit.
 */
export const partsSchema = z.strictObject({
  pistons: z.enum(['cast', 'hypereutectic', 'forged']),
  rods: z.enum(['stock', 'forgedI', 'hBeam']),
  headGasket: z.enum(['composite', 'mls', 'copper']),
  headFasteners: z.enum(['bolts', 'studs']),
  valveSprings: z.enum(['stock', 'uprated', 'race']),
})
export type Parts = z.infer<typeof partsSchema>
export const stockParts: Parts = {
  pistons: 'cast',
  rods: 'stock',
  headGasket: 'mls',
  headFasteners: 'bolts',
  valveSprings: 'stock',
}

// Ranges are the envelope the model has been stress-tested across
// (core.test.ts), not claims about buildable engines.
export const engineSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(80),
  layout: z.literal('inline-4'),
  cylinders: z.literal(4),
  bore: z.number().min(0.02).max(0.3),
  stroke: z.number().min(0.02).max(0.3),
  rodLength: z.number().min(0.03).max(0.6),
  compression: z.number().min(5).max(20),
  intakeArea: z.number().min(0.00001).max(0.02),
  exhaustArea: z.number().min(0.00001).max(0.025),
  intakeClose: z.number().min(550).max(610),
  // Defaulted so builds saved before runners were modelled stay valid.
  intakeRunnerLength: z.number().min(0.05).max(1.5).default(0.3),
  ignitionAdvance: z.number().min(5).max(38),
  burnDuration: z.number().min(35).max(75),
  lambda: z.number().min(0.8).max(1.15),
  inertia: z.number().min(0.01).max(20),
  revLimit: z.number().int().min(1000).max(20000),
  /**
   * What the electronic limiter cuts. Spark cut lets fuel through unburned.
   * A carburettor cannot stop its fuel, so it always cuts the spark.
   */
  limiterCut: z.enum(['fuel', 'spark']).default('fuel'),
  mechanicalLimit: z.number().int().min(1000).max(25000),
  // Defaulted so builds saved before this field existed keep their 70 Nm starter.
  starterTorque: z.number().min(1).max(20000).default(70),
  // Builds saved before forced induction existed are naturally aspirated.
  induction: inductionSchema.default({ kind: 'none' }),
  // Builds saved before fuel systems existed used ideal port injection.
  fuelSystem: fuelSystemSchema.default(fuelSystemDefaults.port),
  // Builds saved before exhaust systems existed get the road exhaust.
  exhaust: exhaustSchema.default(exhaustDefaults),
  // Builds saved before 1.6.0 keep a fixed burn and no knock control.
  combustion: combustionSchema.default(legacyCombustion),
  // Builds saved before 1.7.0 use the single timing, λ and boost values
  // and have unlimited fuel supply.
  management: managementSchema.nullable().default(null),
  fuelSupply: fuelSupplySchema.nullable().default(null),
  // Builds saved before 1.11.0 have stock parts.
  parts: partsSchema.default(stockParts),
  firingOrder: z.tuple([
    z.literal(1),
    z.literal(3),
    z.literal(4),
    z.literal(2),
  ]),
})
export const conditionsSchema = z.strictObject({
  temperature: z.number().min(263.15).max(313.15),
  pressure: z.number().min(75000).max(110000),
  humidity: z.number().min(0).max(1),
  oxygen: z.number().min(0.18).max(0.23),
  coolant: z.number().min(283.15).max(373.15),
})
export const procedureSchema = z.strictObject({
  kind: z.enum(['sweep', 'steps']),
  startRpm: z.number().int().min(500).max(24000),
  endRpm: z.number().int().min(1000).max(24900),
  rate: z.number().min(150).max(1500),
  stepRpm: z.number().int().min(250).max(1000),
  holdSeconds: z.number().min(0.4).max(3),
})
export type EngineDefinition = z.infer<typeof engineSchema>
export type Conditions = z.infer<typeof conditionsSchema>
export type Procedure = z.infer<typeof procedureSchema>
export type Metres = number & { readonly __unit: 'metres' }
export type Pascals = number & { readonly __unit: 'pascals' }
export type RadiansPerSecond = number & { readonly __unit: 'radians/second' }
export const displacement = (e: EngineDefinition) =>
  (Math.PI / 4) * e.bore ** 2 * e.stroke * e.cylinders
/** Rod/crank-radius ratio of 1.5; shorter rods approach a geometric singularity. */
export const MIN_ROD_STROKE = 0.75
/**
 * Valve areas scaled by piston area and inertia by displacement, relative to
 * the Road preset. A guide for unusual sizes, not an optimum: Road-like
 * proportions start and idle across the supported envelope.
 */
export function scaledProportions(e: EngineDefinition) {
  const areaRatio = (e.bore / roadEngine.bore) ** 2
  const sizeRatio = displacement(e) / displacement(roadEngine)
  const fit = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v))
  return {
    intakeArea: fit(roadEngine.intakeArea * areaRatio, 0.00001, 0.02),
    exhaustArea: fit(roadEngine.exhaustArea * areaRatio, 0.00001, 0.025),
    inertia: fit(roadEngine.inertia * sizeRatio, 0.01, 20),
  }
}
/** Settings far below the scaled proportions, which commonly stop idling. */
export function undersizedForEngine(e: EngineDefinition) {
  const s = scaledProportions(e)
  return (['intakeArea', 'exhaustArea', 'inertia'] as const).filter(
    (k) => e[k] < s[k] * 0.4,
  )
}
export function validateEngine(value: unknown): EngineDefinition {
  const e = engineSchema.parse(value)
  if (e.rodLength < e.stroke * MIN_ROD_STROKE - 1e-9)
    throw new Error(
      `Connecting rod length must be at least ${MIN_ROD_STROKE} × stroke.`,
    )
  return e
}
export function validateProcedure(p: Procedure, e: EngineDefinition) {
  procedureSchema.parse(p)
  if (p.endRpm <= p.startRpm) throw new Error('End RPM must exceed start RPM.')
  if (p.endRpm > e.revLimit - 100)
    throw new Error(
      'End RPM must be at least 100 RPM below the electronic limiter.',
    )
  if (p.endRpm >= e.mechanicalLimit)
    throw new Error('End RPM must be below the estimated mechanical limit.')
}
export const roadEngine: EngineDefinition = {
  schemaVersion: 1,
  name: 'Workshop 2.0 • Road',
  layout: 'inline-4',
  cylinders: 4,
  bore: 0.086,
  stroke: 0.086,
  rodLength: 0.143,
  compression: 10.2,
  intakeArea: 0.0007,
  exhaustArea: 0.0006,
  intakeClose: 590,
  intakeRunnerLength: 0.3,
  ignitionAdvance: 20,
  burnDuration: 52,
  lambda: 1,
  inertia: 0.22,
  revLimit: 6800,
  limiterCut: 'fuel',
  mechanicalLimit: 7400,
  starterTorque: 150,
  induction: { kind: 'none' },
  fuelSystem: fuelSystemDefaults.port,
  exhaust: exhaustDefaults,
  combustion: combustionDefaults,
  management: null,
  fuelSupply: { injectorFlow: 240, maxDuty: 0.85, pumpFlow: 110 },
  parts: stockParts,
  firingOrder: [1, 3, 4, 2],
}
export const sportEngine: EngineDefinition = {
  ...roadEngine,
  name: 'Workshop 2.0 • Sport',
  compression: 11.3,
  intakeArea: 0.0009,
  exhaustArea: 0.00075,
  intakeClose: 605,
  intakeRunnerLength: 0.24,
  ignitionAdvance: 18,
  burnDuration: 45,
  inertia: 0.16,
  revLimit: 7600,
  mechanicalLimit: 8000,
  fuelSupply: { injectorFlow: 290, maxDuty: 0.85, pumpFlow: 120 },
}
export const normalConditions: Conditions = {
  temperature: 293.15,
  pressure: 101325,
  humidity: 0.5,
  oxygen: 0.2095,
  coolant: 353.15,
}
export const defaultProcedure: Procedure = {
  kind: 'sweep',
  startRpm: 1500,
  endRpm: 6200,
  rate: 700,
  stepRpm: 500,
  holdSeconds: 0.65,
}
export const recipeSchema = z.strictObject({
  format: z.literal('engine-bench/1'),
  engine: engineSchema,
  conditions: conditionsSchema,
})
export const sampleSchema = z.strictObject({
  time: z.number().nonnegative(),
  rpm: z.number().nonnegative(),
  torque: z.number().finite(),
  power: z.number().finite(),
  absorbedTorque: z.number().finite(),
  /** Highest knock index of any cylinder over the sample (1 = onset); 1.6.0+. */
  knock: z.number().min(0).max(100).optional(),
  /** Mean ECU knock retard over the sample, degrees; 1.6.0+. */
  retard: z.number().min(0).max(90).optional(),
  /** Hottest cylinder's exhaust port gas temperature over the sample, K; 1.8.0+. */
  egt: z.number().min(0).max(4000).optional(),
  /** Highest part stress over the sample, as a share of its limit; 1.11.0+. */
  stress: z.number().min(0).max(100).optional(),
})
export const runSchema = z.strictObject({
  schemaVersion: z.literal(1),
  modelVersion: z.enum(MODEL_VERSIONS),
  id: z.string().min(1).max(128),
  runtime: z.string().min(1).max(512),
  engine: engineSchema,
  conditions: conditionsSchema,
  procedure: procedureSchema,
  status: z.enum(['running', 'complete', 'aborted']),
  reason: z.string().max(1000),
  warnings: z.array(z.string().max(1000)).max(100),
  samples: z.array(sampleSchema).max(5000),
})
export type Run = z.infer<typeof runSchema>
export type Sample = z.infer<typeof sampleSchema>

/**
 * Maps that reproduce a build's single timing, λ and boost values, on axes
 * suited to its rev limit and induction: switching maps on changes nothing
 * until a cell is edited.
 */
export function flatMaps(e: EngineDefinition): Management {
  const top = Math.max(2000, Math.ceil(e.revLimit / 1000) * 1000)
  const rpm = [800]
  for (let r = 1000; r <= top; r += top > 9000 ? 1000 : 500) rpm.push(r)
  const boosted = e.induction.kind !== 'none'
  const load = [20, 40, 60, 80, 100, ...(boosted ? [130, 160, 200, 250] : [])]
    .map((k) => k * 1000)
  const throttle = [0, 0.25, 0.5, 0.75, 1]
  const fill = (rows: number, v: number) =>
    Array.from({ length: rows }, () => rpm.map(() => v))
  return {
    rpm: rpm.slice(0, 16),
    load,
    ignition: fill(load.length, e.ignitionAdvance).map((r) => r.slice(0, 16)),
    lambda: fill(load.length, e.lambda).map((r) => r.slice(0, 16)),
    throttle,
    boost: fill(
      throttle.length,
      e.induction.kind === 'turbo' ? e.induction.boostTarget : 0,
    ).map((r) => r.slice(0, 16)),
  }
}
/** Bilinear lookup, held flat beyond the axes. */
export function lookup(
  rows: number[],
  columns: number[],
  table: number[][],
  row: number,
  column: number,
) {
  const locate = (a: number[], v: number) => {
    if (v <= a[0]) return [0, 0, 0] as const
    const last = a.length - 1
    if (v >= a[last]) return [last, last, 0] as const
    let i = 1
    while (a[i] < v) i++
    return [i - 1, i, (v - a[i - 1]) / (a[i] - a[i - 1])] as const
  }
  const [r0, r1, rf] = locate(rows, row)
  const [c0, c1, cf] = locate(columns, column)
  const top = table[r0][c0] + (table[r0][c1] - table[r0][c0]) * cf
  const bottom = table[r1][c0] + (table[r1][c1] - table[r1][c0]) * cf
  return top + (bottom - top) * rf
}
