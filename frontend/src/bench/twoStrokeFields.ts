/** Two-stroke editor helpers: cycle switching, intake defaults and change notes. */
import { fuelSystemDefaults, raceTwoStroke, roadEngine } from '../sim/schema'
import type { PortTiming } from '../sim/twostroke'
import type {
  EngineDefinition,
  TwoStroke,
  TwoStrokeIntake,
  TwoStrokeIntakeKind,
} from '../sim/schema'

export const intakeLabels: Record<TwoStrokeIntakeKind, string> = {
  piston: 'Piston port',
  reed: 'Reed valve',
  rotary: 'Rotary disc valve',
}
export const pipeLabels = {
  straight: 'Straight pipe',
  chamber: 'Expansion chamber',
} as const

/** Cycle and cylinder layouts the workshop offers. */
export const CYCLE_LAYOUTS = [
  { key: 'inline4', label: 'Four-stroke inline-four' },
  { key: 'inline6', label: 'Four-stroke inline-six' },
  { key: 'v6', label: 'Four-stroke V6' },
  { key: 'v8', label: 'Four-stroke cross-plane V8' },
  { key: 'boxer4', label: 'Four-stroke boxer-four' },
  { key: 'single', label: 'Two-stroke single' },
  { key: 'twin180', label: 'Two-stroke twin, 180° crank' },
  { key: 'twin360', label: 'Two-stroke twin, 360° crank' },
  { key: 'vtwin90', label: 'Two-stroke 90° V-twin' },
] as const
export type CycleLayout = (typeof CYCLE_LAYOUTS)[number]['key']
export function cycleLayout(e: EngineDefinition): CycleLayout {
  if (e.cycle !== 'two-stroke') {
    if (e.layout === 'inline-6') return 'inline6'
    if (e.layout === 'v-6') return 'v6'
    if (e.layout === 'v-8') return 'v8'
    if (e.layout === 'boxer-4') return 'boxer4'
    return 'inline4'
  }
  if (e.cylinders === 1) return 'single'
  if (e.layout === 'v-2') return 'vtwin90'
  return e.twoStroke?.crankPhase === 360 ? 'twin360' : 'twin180'
}

/** Template ports and pipe from the race single, scaled to a bore and stroke. */
function scaledTwoStroke(e: EngineDefinition): TwoStroke {
  const t = raceTwoStroke.twoStroke!
  const s = e.stroke / raceTwoStroke.stroke
  const b = e.bore / raceTwoStroke.bore
  const d = Math.sqrt(b * b * s)
  const pipe = t.pipe
  return {
    ...t,
    exhaustPort: { ...t.exhaustPort, height: t.exhaustPort.height * s, width: t.exhaustPort.width * b },
    transfers: { ...t.transfers, height: t.transfers.height * s, width: t.transfers.width * b },
    intake: intakeDefaults(e, t.intake.kind),
    pipe:
      pipe.kind === 'chamber'
        ? {
            ...pipe,
            header: { ...pipe.header, diameter: pipe.header.diameter * d },
            diffuser: pipe.diffuser.map((c) => ({ ...c, diameter: c.diameter * d })),
            baffle: pipe.baffle.map((c) => ({ ...c, diameter: c.diameter * d })),
            stinger: { ...pipe.stinger, diameter: pipe.stinger.diameter * d },
          }
        : pipe,
    powerValve: t.powerValve && { ...t.powerValve, drop: t.powerValve.drop * s },
  }
}
/** Starting values when switching intake control, sized for the bore. */
export function intakeDefaults(e: EngineDefinition, kind: TwoStrokeIntakeKind): TwoStrokeIntake {
  const area = (Math.PI * e.bore ** 2) / 4
  if (kind === 'piston') return { kind, height: 0.48 * e.stroke, width: 0.6 * e.bore }
  if (kind === 'reed') return { kind, area: 0.52 * area, stiffness: 600 }
  return { kind, open: 130, close: 70, area: 0.45 * area }
}
export function setIntakeKind(e: EngineDefinition, kind: TwoStrokeIntakeKind): EngineDefinition {
  return { ...e, twoStroke: { ...e.twoStroke!, intake: intakeDefaults(e, kind) } }
}

/**
 * Switch a build between cycles and layouts. A four-stroke becomes a
 * two-stroke with ports and a pipe scaled from the race single (no
 * camshafts, no forced induction, a carburettor instead of port
 * injection); valve and runner settings stay in the build for a later
 * switch back.
 */
export function withCycleLayout(e: EngineDefinition, layout: CycleLayout): EngineDefinition {
  const fourStroke = {
    inline4: { layout: 'inline-4', cylinders: 4, firingOrder: [1, 3, 4, 2] },
    inline6: { layout: 'inline-6', cylinders: 6, firingOrder: [1, 5, 3, 6, 2, 4] },
    v6: { layout: 'v-6', cylinders: 6, firingOrder: [1, 4, 2, 5, 3, 6] },
    v8: { layout: 'v-8', cylinders: 8, firingOrder: [1, 8, 4, 3, 6, 5, 7, 2] },
    boxer4: { layout: 'boxer-4', cylinders: 4, firingOrder: [1, 3, 2, 4] },
  } as const
  if (layout in fourStroke) {
    const next = fourStroke[layout as keyof typeof fourStroke]
    const inertia = Math.max(
      e.inertia * (next.cylinders / e.cylinders),
      roadEngine.inertia * 0.5 * (next.cylinders / 4),
    )
    return {
      ...e,
      cycle: 'four-stroke',
      ...next,
      firingOrder: [...next.firingOrder],
      twoStroke: null,
      inertia,
    }
  }
  const cylinders = layout === 'single' ? 1 : 2
  const base = e.twoStroke ?? scaledTwoStroke(e)
  const management = e.management && {
    ...e.management,
    intakeCam: undefined,
    exhaustCam: undefined,
  }
  if (management) {
    delete management.intakeCam
    delete management.exhaustCam
  }
  return {
    ...e,
    cycle: 'two-stroke',
    layout: cylinders === 1 ? 'single' : layout === 'vtwin90' ? 'v-2' : 'inline-2',
    cylinders,
    firingOrder: cylinders === 1 ? [1] : [1, 2],
    induction: { kind: 'none' },
    fuelSystem:
      e.fuelSystem.kind === 'port'
        ? { ...fuelSystemDefaults.carburettor, chokes: 1, chokeDiameter: Math.min(0.07, Math.max(0.012, 0.66 * e.bore)), acceleratorPump: false }
        : e.fuelSystem,
    cams: null,
    camSwitch: null,
    management,
    twoStroke: {
      ...base,
      crankPhase: layout === 'twin360' ? 360 : layout === 'vtwin90' ? 90 : 180,
    },
  }
}

const mm = (v: number) => `${(v * 1000).toFixed(1)} mm`
/** What changed in the ports, intake, crankcase and pipe, for comparisons. */
export function describeTwoStroke(a: EngineDefinition, b: EngineDefinition) {
  const out: string[] = []
  const ca = a.cycle ?? 'four-stroke'
  if (ca !== b.cycle) {
    out.push(`Cycle: ${ca} → ${b.cycle}`)
    return out
  }
  const x = a.twoStroke
  const y = b.twoStroke
  if (!x || !y) return out
  if (x.exhaustPort.height !== y.exhaustPort.height)
    out.push(`Exhaust port top: ${mm(x.exhaustPort.height)} → ${mm(y.exhaustPort.height)} below the deck`)
  if (x.exhaustPort.width !== y.exhaustPort.width || x.exhaustPort.bridge !== y.exhaustPort.bridge)
    out.push(`Exhaust port: ${mm(x.exhaustPort.width)}${x.exhaustPort.bridge ? ' bridged' : ''} → ${mm(y.exhaustPort.width)}${y.exhaustPort.bridge ? ' bridged' : ''}`)
  if (JSON.stringify(x.transfers) !== JSON.stringify(y.transfers))
    out.push(`Transfers: ${x.transfers.count} at ${mm(x.transfers.height)} → ${y.transfers.count} at ${mm(y.transfers.height)}, ${mm(y.transfers.width)} wide`)
  if (JSON.stringify(x.intake) !== JSON.stringify(y.intake))
    out.push(x.intake.kind === y.intake.kind ? `${intakeLabels[y.intake.kind]} changed` : `Intake: ${intakeLabels[x.intake.kind]} → ${intakeLabels[y.intake.kind]}`)
  if (x.crankcaseCompression !== y.crankcaseCompression)
    out.push(`Crankcase compression: ${x.crankcaseCompression.toFixed(2)} → ${y.crankcaseCompression.toFixed(2)}`)
  if (JSON.stringify(x.pipe) !== JSON.stringify(y.pipe))
    out.push(x.pipe.kind === y.pipe.kind ? `${pipeLabels[y.pipe.kind]} changed` : `Pipe: ${pipeLabels[x.pipe.kind]} → ${pipeLabels[y.pipe.kind]}`)
  if (JSON.stringify(x.powerValve) !== JSON.stringify(y.powerValve))
    out.push(!y.powerValve ? 'Power valve removed' : !x.powerValve ? 'Power valve added' : 'Power valve changed')
  if (x.crankPhase !== y.crankPhase) out.push(`Crank: ${x.crankPhase}° → ${y.crankPhase}°`)
  return out
}

/** Two-stroke events in crank degrees after top dead centre. */
export function twoStrokePhase(degrees: number, t: PortTiming) {
  if (degrees < t.exhaustOpen) return 'Power'
  if (degrees < t.transferOpen) return 'Blowdown'
  if (degrees < 360 - t.transferOpen) return 'Scavenge'
  if (degrees < 360 - t.exhaustOpen) return 'Trapping'
  return 'Compression'
}
