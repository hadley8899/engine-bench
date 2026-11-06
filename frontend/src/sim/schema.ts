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
 * 1.12.0: an optional two-stage cam (VTEC-style lift change or a cam
 * phaser's switch point). Builds without one are unchanged.
 * 1.13.0: optional camshaft profiles (valve events and lift), continuous
 * cam phasers driven by cam maps, a high-lift profile switch, and valve
 * float and valve-to-piston clearance from the profiles. Builds without
 * cam profiles keep 1.12.0's fixed events and results.
 * 1.14.0: two-stroke engines (engine schema 2): piston-controlled ports,
 * crankcase scavenging, two-zone scavenging with short-circuit loss, reed
 * and rotary-disc intakes, a power valve and a one-dimensional exhaust pipe
 * or expansion chamber. Four-stroke builds keep 1.13.0 results.
 * 1.14.1: two-stroke fixes. Backflow from the pipe into the cylinder
 * carries its momentum out of the pipe (the sign was wrong, so large
 * cylinders on small pipes left the model), and an exhaust window larger
 * than the header flows no more than the header. Two-stroke results move
 * by up to about 5%; four-strokes keep 1.13.0 results.
 * 1.15.0: additional four-stroke layouts (inline-six, V6, cross-plane V8
 * and boxer-four) and a 90-degree two-stroke V-twin. Engine schema 3
 * widens layout, cylinder-count, firing-order and crank-phase fields;
 * existing schema 1/2 builds migrate without changing their results.
 * 1.16.0: optional four-stroke exhaust pressure waves make primary length,
 * collector layout and valve overlap affect gas exchange. Engine schema 4
 * stores the opt-in; older builds keep the legacy ambient-pressure boundary.
 * 1.17.0: an optional heated-intake-port model reduces low-speed volumetric
 * efficiency and preserves the energy of residual gas pushed into a runner.
 * Engine schema 5 stores the opt-in; older builds keep 1.16.0 results.
 * 1.18.0: versioned polynomial valve motion adds seating ramps and lets cams
 * of equal duration and lift differ in lift area and peak acceleration;
 * float progressively loses lift and seating control before failure, and an
 * effective valve-relief dimension replaces the generic clearance estimate.
 * Engine schema 6 stores the opt-ins; older builds keep all legacy behaviour.
 * 1.19.0: an opt-in tuned two-stroke charging model adds well-balanced pipe
 * area changes, auxiliary exhaust area, measured loop-scavenging constants
 * and rolling-bearing friction. Engine schema 7 stores the opt-in; older
 * builds keep the 1.18.0 two-stroke model exactly.
 * 1.20.0: optional torque-request maps let an electronic throttle meter
 * cylinder charge independently of the driver's pedal. Engine schema 8
 * stores the map; builds without it keep the direct pedal-to-throttle path.
 * 1.21.0: opt-in representative corrected compressor and radial-turbine maps
 * add explicit speed lines, surge/choke boundaries and efficiency islands.
 * Engine schema 9 stores the opt-ins; older induction systems stay legacy.
 * 1.22.0: revised rich-combustion calibration moves best power into the
 * λ 0.86–0.90 range and reduces the enrichment EGT drop. Engine schema 10
 * preserves the preceding frozen-product calibration for older builds.
 */
export const MODEL_VERSION = 'eb-0d-1.22.0'
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
  'eb-0d-1.11.0',
  'eb-0d-1.12.0',
  'eb-0d-1.13.0',
  'eb-0d-1.14.0',
  'eb-0d-1.14.1',
  'eb-0d-1.15.0',
  'eb-0d-1.16.0',
  'eb-0d-1.17.0',
  'eb-0d-1.18.0',
  'eb-0d-1.19.0',
  'eb-0d-1.20.0',
  'eb-0d-1.21.0',
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
    compressorMap: z.enum(['legacy', 'representative']).default('legacy'),
    /** Effective turbine nozzle area; smaller spools sooner with more back pressure. */
    turbineArea: z.number().min(0.00002).max(0.01),
    turbineEfficiency: z.number().min(0.5).max(0.85),
    turbineMap: z.enum(['legacy', 'representative']).default('legacy'),
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
    compressorMap: z.enum(['legacy', 'representative']).default('legacy'),
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
    compressorMap: 'representative',
    turbineArea: 0.0006,
    turbineEfficiency: 0.72,
    turbineMap: 'representative',
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
    compressorMap: 'representative',
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
 * Exhaust system after the ports. Sound always follows it. Four-strokes can
 * opt into the tuned pressure-wave boundary added in model 1.16.0; the field
 * defaults off so builds saved by older schemas keep their exact results.
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
  /** Tuned primary/collector waves act on four-stroke exhaust-valve flow. */
  pressureWaves: z.boolean().default(false),
})
export type Exhaust = z.infer<typeof exhaustSchema>
export const exhaustDefaults: Exhaust = {
  headerLength: 0.5,
  collector: '4-1',
  catalyst: true,
  silencer: 'chambered',
  tailpipeLength: 2.5,
  pressureWaves: false,
}
/** New workshop builds opt in; `exhaustDefaults` remains the legacy migration. */
export const tunedExhaustDefaults: Exhaust = {
  ...exhaustDefaults,
  pressureWaves: true,
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
  fuel: z.enum(['ron91', 'ron95', 'ron98', 'ron100', 'e85']),
  /** ECU knock sensing: retards the knocking cylinder, then creeps back. */
  knockControl: z.boolean(),
  /** Schema 10 rich-product and knock calibration; absent means legacy. */
  calibration: z.enum(['legacy', 'current']).default('legacy'),
})
export type Combustion = z.infer<typeof combustionSchema>
export type FuelGrade = Combustion['fuel']
/** What builds saved before 1.6.0 receive: unchanged 1.5.0 behaviour. */
export const legacyCombustion: Combustion = {
  burnRate: 'fixed',
  fuel: 'ron95',
  knockControl: false,
  calibration: 'legacy',
}
export const combustionDefaults: Combustion = {
  burnRate: 'predictive',
  fuel: 'ron95',
  knockControl: true,
  calibration: 'current',
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
    /** Maximum requested brake torque, Nm, by driver throttle and RPM. */
    torque: table(0, 20000).optional(),
    /**
     * Cam phaser targets, crank degrees of advance (negative retards), by
     * load row and RPM column. Present only for builds with cam phasers.
     */
    intakeCam: table(-60, 60).optional(),
    exhaustCam: table(-60, 60).optional(),
  })
  .superRefine((m, ctx) => {
    const check = (
      name:
        | 'ignition'
        | 'lambda'
        | 'boost'
        | 'torque'
        | 'intakeCam'
        | 'exhaustCam',
      rows: number,
    ) => {
      const t = m[name]
      if (!t) return
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
    check('torque', m.throttle.length)
    if (m.intakeCam) check('intakeCam', m.load.length)
    if (m.exhaustCam) check('exhaustCam', m.load.length)
  })
export type Management = z.infer<typeof managementSchema>
/**
 * Fuel delivery capacity. Injector flow is per injector at its rated
 * pressure (one per cylinder); a carburettor has none and is limited by the
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

/**
 * A second cam profile used above a switch speed (with 150 RPM of
 * hysteresis): Honda's VTEC lift change, or the switch point of a two-
 * position intake cam phaser. Intake still opens at 350°; the exhaust
 * event keeps its timing.
 */
export const camSwitchSchema = z.strictObject({
  rpm: z.number().int().min(1000).max(15000),
  intakeArea: z.number().min(0.00001).max(0.02),
  exhaustArea: z.number().min(0.00001).max(0.025),
  intakeClose: z.number().min(550).max(630),
})
export type CamSwitch = z.infer<typeof camSwitchSchema>

/**
 * One cam's valve event in crank degrees of the 720° cycle (0 = firing
 * top dead centre, 360 = overlap top dead centre), at zero phaser angle,
 * and its peak valve lift. Opening and closing are where lift begins and
 * ends.
 */
const valveEvent = (open: [number, number], close: [number, number]) =>
  z
    .strictObject({
      open: z.number().min(open[0]).max(open[1]),
      close: z.number().min(close[0]).max(close[1]),
      lift: z.number().min(0.002).max(0.02),
    })
export const intakeEventSchema = valveEvent([300, 400], [520, 660])
export const exhaustEventSchema = valveEvent([80, 220], [330, 430])
export type ValveEvent = z.infer<typeof intakeEventSchema>
/** Valve-lift motion law. Legacy is the pre-1.18.0 half-sine. */
export const camMotionSchema = z.enum([
  'legacy',
  'gentle',
  'performance',
  'race',
])
export type CamMotion = z.infer<typeof camMotionSchema>
/**
 * Camshaft profiles. The build's intake and exhaust areas become the flow
 * area at full lift; lift below a quarter of the valve diameter limits it.
 */
export const camsSchema = z.strictObject({
  intake: intakeEventSchema,
  exhaust: exhaustEventSchema,
  /** A high-lift profile above a switch speed (VTEC), with 150 RPM of hysteresis. */
  high: z
    .strictObject({
      rpm: z.number().int().min(1000).max(15000),
      intake: intakeEventSchema,
      exhaust: exhaustEventSchema,
      /** Flow areas at full lift on the high profile, m². */
      intakeArea: z.number().min(0.00001).max(0.02),
      exhaustArea: z.number().min(0.00001).max(0.025),
    })
    .nullable(),
  /**
   * Continuous phasers: the cam maps set targets within these ranges
   * (crank degrees each way) and the phasers follow at this rate.
   */
  phasers: z
    .strictObject({
      intakeRange: z.number().min(0).max(60),
      exhaustRange: z.number().min(0).max(60),
      /** Crank degrees per second. */
      rate: z.number().min(20).max(1000),
    })
    .nullable(),
})
export type Cams = z.infer<typeof camsSchema>
export const stockParts: Parts = {
  pistons: 'cast',
  rods: 'stock',
  headGasket: 'mls',
  headFasteners: 'bolts',
  valveSprings: 'stock',
}

/**
 * Two-stroke intake control. A piston port opens when the skirt's lower
 * edge rises past the port, so its timing is symmetric about top dead
 * centre; a reed opens on crankcase depression; a rotary disc opens and
 * closes at set crank angles.
 */
export const twoStrokeIntakeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('piston'),
    /** Port's lower edge above the skirt's lower edge at bottom dead centre, m. */
    height: z.number().min(0.002).max(0.15),
    width: z.number().min(0.005).max(0.2),
  }),
  z.strictObject({
    kind: z.literal('reed'),
    /** Flow area with the petals fully open, m². */
    area: z.number().min(0.00005).max(0.02),
    /** Petal natural frequency, Hz: stiffer petals need more depression. */
    stiffness: z.number().min(150).max(1500),
  }),
  z.strictObject({
    kind: z.literal('rotary'),
    /** Disc opens this many degrees before top dead centre. */
    open: z.number().min(90).max(180),
    /** Disc closes this many degrees after top dead centre. */
    close: z.number().min(20).max(110),
    area: z.number().min(0.00005).max(0.02),
  }),
])
export type TwoStrokeIntake = z.infer<typeof twoStrokeIntakeSchema>
export type TwoStrokeIntakeKind = TwoStrokeIntake['kind']
const diameter = z.number().min(0.008).max(0.25)
/** One cone of an expansion chamber: its length and the diameter it ends at. */
const coneSchema = z.strictObject({
  length: z.number().min(0.01).max(0.8),
  diameter,
})
/**
 * Exhaust pipe from the port. Either a straight pipe or an expansion
 * chamber built from segments; the pressure waves in either are simulated.
 */
export const twoStrokePipeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('straight'),
    length: z.number().min(0.1).max(3),
    diameter: z.number().min(0.01).max(0.15),
  }),
  z.strictObject({
    kind: z.literal('chamber'),
    header: z.strictObject({
      length: z.number().min(0.02).max(0.8),
      diameter,
    }),
    /** Diverging cones; each must be wider than the one before. */
    diffuser: z.array(coneSchema).min(1).max(3),
    /** Parallel middle section at the diffuser's last diameter. */
    belly: z.strictObject({ length: z.number().min(0).max(0.8) }),
    /** Converging cones; each must be narrower than the one before. */
    baffle: z.array(coneSchema).min(1).max(2),
    stinger: z.strictObject({
      length: z.number().min(0.03).max(0.8),
      diameter,
    }),
  }),
])
export type TwoStrokePipe = z.infer<typeof twoStrokePipeSchema>
/**
 * A crankcase-scavenged, loop-scavenged (Schnürle) two-stroke. Port
 * heights are measured down from the deck with the piston's crown flush
 * with it at top dead centre; port timing is derived from them.
 */
export const twoStrokeSchema = z.strictObject({
  exhaustPort: z.strictObject({
    /** Top edge below the deck, m. */
    height: z.number().min(0.005).max(0.2),
    /**
     * Chordal width, m: at most 0.75 × bore for an open port, or 1.05 ×
     * bore with a central bridge, which keeps the rings in but blocks a
     * tenth of the width.
     */
    width: z.number().min(0.005).max(0.3),
    bridge: z.boolean(),
    /** Total effective width of auxiliary exhaust windows, m. */
    auxiliaryWidth: z.number().min(0).max(0.2).default(0),
  }),
  transfers: z.strictObject({
    /** Two, three (with a boost port) or five ports: better scavenging. */
    count: z.union([z.literal(2), z.literal(3), z.literal(5)]),
    /** Top edge below the deck, m; below the exhaust port's. */
    height: z.number().min(0.005).max(0.2),
    /** Total width of all transfer ports, m. */
    width: z.number().min(0.005).max(0.4),
  }),
  intake: twoStrokeIntakeSchema,
  /** Crankcase volume at top dead centre over its volume at bottom dead centre. */
  crankcaseCompression: z.number().min(1.15).max(1.9),
  pipe: twoStrokePipeSchema,
  /**
   * An exhaust power valve lowers the port's effective top edge by `drop`
   * below `rpm`, and opens fully over the 1,000 RPM above it.
   */
  powerValve: z
    .strictObject({
      rpm: z.number().int().min(2000).max(15000),
      drop: z.number().min(0.001).max(0.02),
    })
    .nullable(),
  /** Crank angle between a twin's cylinders: 180° alternate, 360° together. */
  crankPhase: z.union([z.literal(90), z.literal(180), z.literal(360)]),
  /** Versioned gas-exchange, scavenging and rolling-bearing friction model. */
  chargingModel: z.enum(['legacy', 'tuned']).default('legacy'),
})
export type TwoStroke = z.infer<typeof twoStrokeSchema>

/** Schema 2 adds cycles, 3 layouts, 4 exhaust waves, 5 port heat, 6 cam motion, 7 two-stroke charging, 8 torque requests, 9 turbo maps, 10 combustion calibration. */
export const ENGINE_SCHEMA_VERSION = 10

// Ranges are the envelope the model has been stress-tested across
// (core.test.ts), not claims about buildable engines.
export const engineSchema = z.strictObject({
  schemaVersion: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
  ]),
  name: z.string().trim().min(1).max(80),
  cycle: z.enum(['four-stroke', 'two-stroke']).default('four-stroke'),
  layout: z.enum([
    'inline-4',
    'inline-6',
    'v-6',
    'v-8',
    'boxer-4',
    'single',
    'inline-2',
    'v-2',
  ]),
  cylinders: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(4),
    z.literal(6),
    z.literal(8),
  ]),
  bore: z.number().min(0.02).max(0.3),
  stroke: z.number().min(0.02).max(0.3),
  rodLength: z.number().min(0.03).max(0.6),
  compression: z.number().min(5).max(20),
  intakeArea: z.number().min(0.00001).max(0.02),
  exhaustArea: z.number().min(0.00001).max(0.025),
  intakeClose: z.number().min(550).max(610),
  // Defaulted so builds saved before runners were modelled stay valid.
  intakeRunnerLength: z.number().min(0.05).max(1.5).default(0.3),
  // Builds saved before 1.17.0 keep the unheated-port result exactly.
  intakePortModel: z.enum(['legacy', 'heated']).default('legacy'),
  // Builds saved before 1.18.0 keep the half-sine valve motion exactly.
  camMotion: camMotionSchema.default('legacy'),
  // Null preserves 1.17.0's half-clearance-height assumption. New builds
  // store their effective valve-to-piston room at overlap TDC explicitly.
  valveRelief: z.number().min(0.0005).max(0.02).nullable().default(null),
  ignitionAdvance: z.number().min(5).max(38),
  burnDuration: z.number().min(35).max(75),
  lambda: z.number().min(0.8).max(1.15),
  inertia: z.number().min(0.002).max(20),
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
  // Builds saved before 1.12.0 have a single cam profile.
  camSwitch: camSwitchSchema.nullable().default(null),
  // Builds saved before 1.13.0 have fixed valve events.
  cams: camsSchema.nullable().default(null),
  /** Cylinder numbers in firing order; validation fixes one order per layout. */
  firingOrder: z.array(z.number().int().min(1).max(8)).min(1).max(8),
  /**
   * Ports, crankcase and pipe of a two-stroke; null for four-strokes,
   * whose valve, runner and cam settings a two-stroke ignores.
   */
  twoStroke: twoStrokeSchema.nullable().default(null),
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
  // Two-strokes have ports, not valves, and much lighter cranks.
  if (e.cycle === 'two-stroke') return []
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
  if (e.cams && e.camSwitch)
    throw new Error(
      'A build with cam profiles uses their high-lift switch, not the two-stage cam.',
    )
  const order = [...e.firingOrder].sort((a, b) => a - b)
  if (
    order.length !== e.cylinders ||
    order.some((n, i) => n !== i + 1)
  )
    throw new Error('The firing order must name each cylinder once.')
  if (e.cycle === 'four-stroke') {
    const layouts = {
      'inline-4': { cylinders: 4, order: '1,3,4,2' },
      'inline-6': { cylinders: 6, order: '1,5,3,6,2,4' },
      'v-6': { cylinders: 6, order: '1,4,2,5,3,6' },
      'v-8': { cylinders: 8, order: '1,8,4,3,6,5,7,2' },
      'boxer-4': { cylinders: 4, order: '1,3,2,4' },
    } as const
    const spec = layouts[e.layout as keyof typeof layouts]
    if (!spec || e.cylinders !== spec.cylinders)
      throw new Error('The cylinder count must match the four-stroke layout.')
    if (e.firingOrder.join() !== spec.order)
      throw new Error(`The ${e.layout} firing order is ${spec.order.replaceAll(',', '–')}.`)
    if (e.twoStroke)
      throw new Error('A four-stroke has valves, not two-stroke ports.')
  } else twoStrokeProblems(e)
  // Older builds read as schema 10; compatibility fields retain their model.
  return { ...e, schemaVersion: ENGINE_SCHEMA_VERSION }
}
/**
 * Diameters along a two-stroke's pipe from the port: each entry is a
 * segment's length and its start and end diameters.
 */
export function pipeSegments(pipe: TwoStrokePipe) {
  if (pipe.kind === 'straight')
    return [
      {
        role: 'pipe',
        length: pipe.length,
        start: pipe.diameter,
        end: pipe.diameter,
      },
    ]
  const out: { role: string; length: number; start: number; end: number }[] = [
    {
      role: 'header',
      length: pipe.header.length,
      start: pipe.header.diameter,
      end: pipe.header.diameter,
    },
  ]
  let d = pipe.header.diameter
  for (const cone of pipe.diffuser) {
    out.push({ role: 'diffuser', length: cone.length, start: d, end: cone.diameter })
    d = cone.diameter
  }
  if (pipe.belly.length > 0)
    out.push({ role: 'belly', length: pipe.belly.length, start: d, end: d })
  for (const cone of pipe.baffle) {
    out.push({ role: 'baffle', length: cone.length, start: d, end: cone.diameter })
    d = cone.diameter
  }
  out.push({
    role: 'stinger',
    length: pipe.stinger.length,
    start: pipe.stinger.diameter,
    end: pipe.stinger.diameter,
  })
  return out
}
function twoStrokeProblems(e: EngineDefinition) {
  const t = e.twoStroke
  if (!t) throw new Error('A two-stroke needs its ports, crankcase and pipe.')
  if (
    !(
      (e.layout === 'single' && e.cylinders === 1) ||
      (e.layout === 'inline-2' && e.cylinders === 2) ||
      (e.layout === 'v-2' && e.cylinders === 2 && t.crankPhase === 90)
    )
  )
    throw new Error('Two-strokes are singles, parallel twins or 90° V-twins.')
  if (e.induction.kind !== 'none')
    throw new Error(
      'Forced induction is not modelled on a crankcase-scavenged two-stroke.',
    )
  if (e.fuelSystem.kind === 'port')
    throw new Error(
      'A two-stroke has no inlet valve port to inject into: use a carburettor, throttle body or direct injection.',
    )
  if (e.cams || e.camSwitch)
    throw new Error('A two-stroke has ports, not camshafts.')
  if (e.management?.intakeCam || e.management?.exhaustCam)
    throw new Error('A two-stroke has no cam phasers to map.')
  const ex = t.exhaustPort.height
  const drop = t.powerValve?.drop ?? 0
  if (t.transfers.height <= ex + drop + 0.001)
    throw new Error(
      'The transfer ports must open after the exhaust port (top edge at least 1 mm lower, power valve closed included).',
    )
  // Rings sit about 3 mm below the crown; the crown reaches the stroke.
  if (t.transfers.height > e.stroke - 0.003 || ex + drop > e.stroke - 0.004)
    throw new Error('Ports must open before the piston reaches bottom dead centre.')
  if (ex < 0.25 * e.stroke)
    throw new Error(
      'The exhaust port would overlap the ring land near top dead centre: lower it to at least a quarter of the stroke.',
    )
  if (t.exhaustPort.width > (t.exhaustPort.bridge ? 1.05 : 0.75) * e.bore + 1e-9)
    throw new Error(
      t.exhaustPort.bridge
        ? 'A bridged exhaust port wider than 1.05 × bore would snag the rings.'
        : 'An exhaust port wider than 0.75 × bore would snag the rings: narrow it or add a bridge.',
    )
  if (t.exhaustPort.width + t.exhaustPort.auxiliaryWidth > 1.6 * e.bore + 1e-9)
    throw new Error('The main and auxiliary exhaust ports cannot be wider in total than 1.6 × bore.')
  if (t.transfers.width > 1.6 * e.bore + 1e-9)
    throw new Error('The transfer ports cannot be wider in total than 1.6 × bore.')
  if (t.intake.kind === 'piston') {
    if (t.intake.height > 0.9 * e.stroke)
      throw new Error('The piston-port intake would never open: lower its edge.')
    if (t.intake.width > 0.75 * e.bore + 1e-9)
      throw new Error('A piston intake port wider than 0.75 × bore would snag the rings.')
  }
  const pipe = t.pipe
  if (pipe.kind === 'chamber') {
    let d = pipe.header.diameter
    for (const cone of pipe.diffuser) {
      if (cone.diameter <= d)
        throw new Error('Each diffuser cone must end wider than it starts.')
      d = cone.diameter
    }
    for (const cone of pipe.baffle) {
      if (cone.diameter >= d)
        throw new Error('Each baffle cone must end narrower than it starts.')
      d = cone.diameter
    }
    if (pipe.stinger.diameter > d + 1e-9)
      throw new Error('The stinger cannot be wider than the end of the baffle.')
    if (pipe.stinger.diameter > pipe.header.diameter + 1e-9)
      throw new Error('The stinger cannot be wider than the header.')
  }
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
  schemaVersion: ENGINE_SCHEMA_VERSION,
  name: 'Workshop 2.0 • Road',
  cycle: 'four-stroke',
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
  intakePortModel: 'heated',
  camMotion: 'performance',
  valveRelief: 0.0048,
  // Performance valve motion fills more strongly while lugging than the
  // compatibility curve; 16° keeps the standard road launch knock-safe.
  ignitionAdvance: 16,
  burnDuration: 52,
  lambda: 1,
  inertia: 0.22,
  revLimit: 6800,
  limiterCut: 'fuel',
  mechanicalLimit: 7400,
  starterTorque: 150,
  induction: { kind: 'none' },
  fuelSystem: fuelSystemDefaults.port,
  exhaust: tunedExhaustDefaults,
  combustion: combustionDefaults,
  management: null,
  fuelSupply: { injectorFlow: 240, maxDuty: 0.85, pumpFlow: 110 },
  parts: stockParts,
  camSwitch: null,
  cams: null,
  firingOrder: [1, 3, 4, 2],
  twoStroke: null,
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
/**
 * Fictional two-strokes in the proportions of their classes. Four-stroke
 * valve, runner and cam fields keep the Road build's values and are not
 * used. A 125 cc race single: reed valve, five transfers, a power valve
 * and an expansion chamber tuned near 11,000 RPM.
 */
export const raceTwoStroke: EngineDefinition = {
  ...roadEngine,
  name: 'Workshop 125 • Race two-stroke',
  cycle: 'two-stroke',
  layout: 'single',
  cylinders: 1,
  firingOrder: [1],
  bore: 0.054,
  stroke: 0.0545,
  rodLength: 0.11,
  compression: 13,
  intakeRunnerLength: 0.18,
  ignitionAdvance: 16,
  burnDuration: 45,
  lambda: 0.88,
  inertia: 0.005,
  revLimit: 12500,
  limiterCut: 'spark',
  mechanicalLimit: 13500,
  starterTorque: 30,
  fuelSystem: { kind: 'carburettor', chokeDiameter: 0.036, chokes: 1, acceleratorPump: false },
  exhaust: { ...exhaustDefaults, catalyst: false, silencer: 'absorptive', tailpipeLength: 0.3 },
  combustion: {
    burnRate: 'predictive',
    fuel: 'ron98',
    knockControl: false,
    calibration: 'current',
  },
  fuelSupply: null,
  twoStroke: {
    exhaustPort: { height: 0.0275, width: 0.054, bridge: true, auxiliaryWidth: 0.02 },
    transfers: { count: 5, height: 0.0395, width: 0.085 },
    intake: { kind: 'reed', area: 0.0024, stiffness: 600 },
    crankcaseCompression: 1.5,
    pipe: {
      kind: 'chamber',
      header: { length: 0.11, diameter: 0.04 },
      diffuser: [
        { length: 0.12, diameter: 0.058 },
        { length: 0.13, diameter: 0.085 },
        { length: 0.1, diameter: 0.11 },
      ],
      belly: { length: 0.12 },
      baffle: [{ length: 0.18, diameter: 0.024 }],
      stinger: { length: 0.2, diameter: 0.021 },
    },
    powerValve: { rpm: 8500, drop: 0.004 },
    crankPhase: 180,
    chargingModel: 'tuned',
  },
}
/** A 50 cc moped: piston-port intake, two transfers and a mild pipe. */
export const mopedTwoStroke: EngineDefinition = {
  ...raceTwoStroke,
  name: 'Workshop 50 • Moped two-stroke',
  bore: 0.04,
  stroke: 0.0397,
  rodLength: 0.085,
  compression: 10,
  intakeRunnerLength: 0.15,
  ignitionAdvance: 18,
  burnDuration: 50,
  lambda: 0.9,
  inertia: 0.006,
  revLimit: 8000,
  mechanicalLimit: 9500,
  starterTorque: 20,
  fuelSystem: { kind: 'carburettor', chokeDiameter: 0.014, chokes: 1, acceleratorPump: false },
  combustion: {
    burnRate: 'predictive',
    fuel: 'ron95',
    knockControl: false,
    calibration: 'current',
  },
  exhaust: { ...exhaustDefaults, catalyst: false, silencer: 'chambered', tailpipeLength: 0.3 },
  twoStroke: {
    exhaustPort: { height: 0.0215, width: 0.026, bridge: false, auxiliaryWidth: 0 },
    transfers: { count: 2, height: 0.0275, width: 0.04 },
    intake: { kind: 'piston', height: 0.026, width: 0.024 },
    crankcaseCompression: 1.45,
    pipe: {
      kind: 'chamber',
      header: { length: 0.15, diameter: 0.024 },
      diffuser: [{ length: 0.25, diameter: 0.06 }],
      belly: { length: 0.1 },
      baffle: [{ length: 0.15, diameter: 0.018 }],
      stinger: { length: 0.15, diameter: 0.014 },
    },
    powerValve: null,
    crankPhase: 180,
    chargingModel: 'legacy',
  },
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
  /**
   * Closed-throttle run-down after a completed pull, from the end speed
   * down (engine braking, so torque is negative). Runs recorded before
   * run-downs existed have none.
   */
  rundown: z.array(sampleSchema).max(1000).optional(),
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
    // Effectively unlimited: enabling maps alone must not close the throttle.
    torque: fill(throttle.length, 20000).map((r) => r.slice(0, 16)),
    ...(e.cams?.phasers
      ? {
          intakeCam: fill(load.length, 0).map((r) => r.slice(0, 16)),
          exhaustCam: fill(load.length, 0).map((r) => r.slice(0, 16)),
        }
      : {}),
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
