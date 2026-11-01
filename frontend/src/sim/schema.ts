import { z } from 'zod'

/**
 * 1.2.0: temperature-dependent gas properties, Woschni-form wall heat,
 * piston-speed friction and intake runner inertia; recalibrated presets.
 * 1.3.0: turbochargers, superchargers and intercoolers.
 * 1.4.0: fuel systems (carburettor, throttle-body, port and direct
 * injection) with wall-film fuel transport and mixture limits.
 */
export const MODEL_VERSION = 'eb-0d-1.4.0'
/** Runs recorded by earlier model versions remain readable as history. */
export const MODEL_VERSIONS = [
  'eb-0d-1.0.0',
  'eb-0d-1.1.0',
  'eb-0d-1.2.0',
  'eb-0d-1.3.0',
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
  mechanicalLimit: z.number().int().min(1000).max(25000),
  // Defaulted so builds saved before this field existed keep their 70 Nm starter.
  starterTorque: z.number().min(1).max(20000).default(70),
  // Builds saved before forced induction existed are naturally aspirated.
  induction: inductionSchema.default({ kind: 'none' }),
  // Builds saved before fuel systems existed used ideal port injection.
  fuelSystem: fuelSystemSchema.default(fuelSystemDefaults.port),
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
  mechanicalLimit: 7400,
  starterTorque: 150,
  induction: { kind: 'none' },
  fuelSystem: fuelSystemDefaults.port,
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
