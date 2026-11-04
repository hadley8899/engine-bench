import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  ThemeProvider,
} from '@mui/material'
import { Link } from 'react-router'
import { ZodError } from 'zod'
import { buildTheme } from '../theme'
import { useAuth } from '../auth/useAuth'
import { crankingTorque, EngineCore } from '../sim/core'
import type { Telemetry } from '../sim/core'
import type { HostEvent } from '../sim/messages'
import {
  conditionsSchema,
  defaultProcedure,
  displacement,
  engineSchema,
  MIN_ROD_STROKE,
  normalConditions,
  recipeSchema,
  roadEngine,
  scaledProportions,
  undersizedForEngine,
  validateEngine,
  validateProcedure,
} from '../sim/schema'
import type {
  Conditions,
  EngineDefinition,
  Procedure,
  Run,
} from '../sim/schema'
import { BenchAudio } from './audio'
import { Chart } from './Chart'
import { EngineView } from './EngineView'
import { NumberField } from './NumberField'
import { InductionEditor } from './InductionEditor'
import { FuelSystemEditor } from './FuelSystemEditor'
import { ExhaustEditor } from './ExhaustEditor'
import { CombustionEditor } from './CombustionEditor'
import { describeCombustion } from './combustionFields'
import { KnockStrip } from './KnockStrip'
import { StressPanel } from './StressPanel'
import { PartsEditor } from './PartsEditor'
import { PushPanel } from './PushPanel'
import { stockParts } from '../sim/schema'
import type { Parts } from '../sim/schema'
import {
  HEAD_FASTENERS,
  HEAD_GASKETS,
  PISTONS,
  RODS,
  VALVE_SPRINGS,
} from '../sim/parts'
import { defaultPush, validatePush } from '../sim/push'
import type { PushResult, PushSettings } from '../sim/push'
import { MapEditor, MapToggle } from './MapEditor'
import { describeMaps } from './mapFields'
import { FuelSupplyEditor } from './FuelSupplyEditor'
import { FUELS } from '../sim/fuel'
import { describeExhaust, exhaustErrors } from './exhaustFields'
import { Gauges } from './Gauges'
import { RoadControls } from './RoadControls'
import { useShortcuts } from './shortcuts'
import type { ShortcutAction } from './shortcuts'
import { ShortcutHelp } from './ShortcutHelp'
import { PullSummary } from './PullSummary'
import { starterBuilds } from './builds'
import {
  formatFixed,
  fromKw,
  fromNm,
  POWER_UNITS,
  TORQUE_UNITS,
} from './units'
import type { PowerUnit, TorqueUnit } from './units'
import { LISTENERS } from '../sim/acoustics'
import type { Listener } from '../sim/acoustics'
import type { Road } from '../sim/road'
import { describeFuel, fuelErrors, fuelShortLabels } from './fuelFields'
import {
  describeInduction,
  inductionErrors,
  inductionLabels,
} from './inductionFields'
import { SavedLibrary } from './SavedLibrary'
import {
  loadDraft,
  loadExperiment,
  loadLiveUpdates,
  loadPreferences,
  persistDraft,
  persistExperiment,
  persistLiveUpdates,
  persistPreferences,
} from './storage'
import './bench.css'

const theme = buildTheme('dark')
const historyLabels = ['seconds', 'RPM']
const pressureLabels = ['crank degrees', 'Cylinder pressure · bar']
const listenerLabels: Record<Listener, string> = {
  tailpipe: 'Tailpipe',
  bay: 'Engine bay',
  cell: 'Test cell (room)',
}
const numericFields: {
  key: keyof EngineDefinition
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
  help: string
}[] = [
  {
    key: 'bore',
    label: 'Bore',
    unit: 'mm',
    scale: 1000,
    min: 20,
    max: 300,
    step: 0.5,
    help: 'Cylinder diameter. Changes displacement.',
  },
  {
    key: 'stroke',
    label: 'Stroke',
    unit: 'mm',
    scale: 1000,
    min: 20,
    max: 300,
    step: 0.5,
    help: 'Piston travel. Changes capacity and piston speed.',
  },
  {
    key: 'rodLength',
    label: 'Rod length',
    unit: 'mm',
    scale: 1000,
    min: 30,
    max: 600,
    step: 1,
    help: 'Changes piston motion and mechanical leverage.',
  },
  {
    key: 'compression',
    label: 'Compression ratio',
    unit: ':1',
    scale: 1,
    min: 5,
    max: 20,
    step: 0.1,
    help: 'Changes clearance volume. Knock is not modelled.',
  },
  {
    key: 'starterTorque',
    label: 'Starter torque',
    unit: 'Nm',
    scale: 1,
    min: 1,
    max: 20000,
    step: 10,
    help: 'Torque the starter applies at the crank while cranking (below 500 RPM).',
  },
  {
    key: 'intakeArea',
    label: 'Intake effective area',
    unit: 'mm²',
    scale: 1e6,
    min: 10,
    max: 20000,
    step: 10,
    help: 'Effective flow area including discharge coefficient.',
  },
  {
    key: 'exhaustArea',
    label: 'Exhaust effective area',
    unit: 'mm²',
    scale: 1e6,
    min: 10,
    max: 25000,
    step: 10,
    help: 'Exhaust flow restriction; also changes pulses.',
  },
  {
    key: 'intakeClose',
    label: 'Intake closes',
    unit: 'cycle °',
    scale: 1,
    min: 550,
    max: 610,
    step: 1,
    help: '540° is intake bottom dead centre.',
  },
  {
    key: 'intakeRunnerLength',
    label: 'Intake runner length',
    unit: 'mm',
    scale: 1000,
    min: 50,
    max: 1500,
    step: 10,
    help: 'Air momentum in the runner fills the cylinder past bottom dead centre. Longer runners move the torque peak lower.',
  },
  {
    key: 'ignitionAdvance',
    label: 'Ignition advance',
    unit: '° BTDC',
    scale: 1,
    min: 5,
    max: 38,
    step: 1,
    help: 'Timing before firing top dead centre. More advance raises cylinder pressure and knock; past the best timing (MBT) torque falls again.',
  },
  {
    key: 'burnDuration',
    label: 'Burn duration',
    unit: '°',
    scale: 1,
    min: 35,
    max: 75,
    step: 1,
    help: 'Wiebe combustion duration. With a predictive burn rate this is the 3,000 RPM full-load figure.',
  },
  {
    key: 'lambda',
    label: 'Mixture lambda',
    unit: '',
    scale: 1,
    min: 0.8,
    max: 1.15,
    step: 0.01,
    help: '1 = stoichiometric fuel command. A carburettor is jetted to this in standard air (20 °C, 1,013 hPa).',
  },
  {
    key: 'inertia',
    label: 'Rotating inertia',
    unit: 'kg·m²',
    scale: 1,
    min: 0.01,
    max: 20,
    step: 0.01,
    help: 'Changes free acceleration and absorbed dyno torque.',
  },
  {
    key: 'revLimit',
    label: 'Electronic limiter',
    unit: 'RPM',
    scale: 1,
    min: 1000,
    max: 20000,
    step: 100,
    help: 'Fuel cut; raising it does not strengthen parts.',
  },
  {
    key: 'mechanicalLimit',
    label: 'Estimated mechanical limit',
    unit: 'RPM',
    scale: 1,
    min: 1000,
    max: 25000,
    step: 100,
    help: 'Assumed component capability; dyno abort boundary.',
  },
]
const conditionFields: {
  key: keyof Conditions
  label: string
  unit: string
  scale: number
  offset: number
  min: number
  max: number
  step: number
}[] = [
  {
    key: 'temperature',
    label: 'Room temperature',
    unit: '°C',
    scale: 1,
    offset: -273.15,
    min: -10,
    max: 40,
    step: 1,
  },
  {
    key: 'pressure',
    label: 'Barometric pressure',
    unit: 'kPa',
    scale: 0.001,
    offset: 0,
    min: 75,
    max: 110,
    step: 0.5,
  },
  {
    key: 'humidity',
    label: 'Relative humidity',
    unit: '%',
    scale: 100,
    offset: 0,
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: 'oxygen',
    label: 'Oxygen in dry air',
    unit: '% vol',
    scale: 100,
    offset: 0,
    min: 18,
    max: 23,
    step: 0.1,
  },
  {
    key: 'coolant',
    label: 'Starting coolant',
    unit: '°C',
    scale: 1,
    offset: -273.15,
    min: 10,
    max: 100,
    step: 5,
  },
]
const rangeText = (f: { min: number; max: number; unit: string }) =>
  `${f.min}–${f.max} ${f.unit}`.trim()
// Field-level messages for the editor, keyed by field. Uses the same schema
// as configure() so the editor never accepts what the rebuild would reject.
function engineErrors(e: EngineDefinition) {
  const errors: Partial<Record<keyof EngineDefinition, string>> = {}
  const result = engineSchema.safeParse(e)
  for (const issue of result.error?.issues ?? []) {
    const key = issue.path[0] as keyof EngineDefinition
    const field = numericFields.find((f) => f.key === key)
    errors[key] ??= field
      ? `Supported range ${rangeText(field)}`
      : key === 'name'
        ? 'Enter a name of up to 80 characters'
        : issue.message
  }
  if (
    !errors.rodLength &&
    !errors.stroke &&
    e.rodLength < e.stroke * MIN_ROD_STROKE - 1e-9
  )
    errors.rodLength = `Must be at least ${(e.stroke * MIN_ROD_STROKE * 1000).toFixed(1)} mm (${MIN_ROD_STROKE} × stroke)`
  return errors
}
function conditionErrors(c: Conditions) {
  const errors: Partial<Record<keyof Conditions, string>> = {}
  for (const issue of conditionsSchema.safeParse(c).error?.issues ?? []) {
    const field = conditionFields.find((f) => f.key === issue.path[0])
    if (field) errors[field.key] ??= `Supported range ${rangeText(field)}`
  }
  return errors
}
const partLabels: Record<keyof Parts, string> = {
  pistons: 'Pistons',
  rods: 'Connecting rods',
  headGasket: 'Head gasket',
  headFasteners: 'Head fasteners',
  valveSprings: 'Valve springs',
}
const partNames = Object.fromEntries(
  (
    [
      ['pistons', PISTONS],
      ['rods', RODS],
      ['headGasket', HEAD_GASKETS],
      ['headFasteners', HEAD_FASTENERS],
      ['valveSprings', VALVE_SPRINGS],
    ] as const
  ).map(([k, c]) => [
    k,
    Object.fromEntries(Object.entries(c).map(([n, v]) => [n, v.label])),
  ]),
) as Record<keyof Parts, Record<string, string>>
function describeChanges(a: Run | null, e: EngineDefinition, c: Conditions) {
  if (!a) return ['Capture a baseline to see what changed.']
  const changes = numericFields
    .filter((f) => a.engine[f.key] !== e[f.key])
    .map(
      (f) =>
        `${f.label}: ${(Number(a.engine[f.key]) * f.scale).toFixed(2)} → ${(Number(e[f.key]) * f.scale).toFixed(2)} ${f.unit}`,
    )
  changes.push(
    ...describeInduction(a.engine.induction ?? { kind: 'none' }, e.induction),
    ...describeFuel(
      a.engine.fuelSystem ?? {
        kind: 'port',
        transientCorrection: true,
        overrunCut: true,
      },
      e.fuelSystem,
    ),
    ...describeExhaust(a.engine.exhaust, e.exhaust),
    ...describeCombustion(a.engine.combustion, e.combustion),
    ...describeMaps(a.engine.management ?? null, e.management),
  )
  if (
    JSON.stringify(a.engine.fuelSupply ?? null) !==
    JSON.stringify(e.fuelSupply)
  )
    changes.push('Fuel supply (injectors and pump) changed')
  // Runs before 1.11.0 had stock parts.
  const before = a.engine.parts ?? stockParts
  for (const k of Object.keys(e.parts) as (keyof Parts)[])
    if (before[k] !== e.parts[k])
      changes.push(
        `${partLabels[k]}: ${partNames[k][before[k] as never]} → ${partNames[k][e.parts[k] as never]}`,
      )
  if ((a.engine.limiterCut ?? 'fuel') !== e.limiterCut)
    changes.push(
      `Limiter cuts: ${a.engine.limiterCut ?? 'fuel'} → ${e.limiterCut}`,
    )
  for (const f of conditionFields)
    if (a.conditions[f.key] !== c[f.key])
      changes.push(
        `${f.label}: ${(a.conditions[f.key] * f.scale + f.offset).toFixed(1)} → ${(c[f.key] * f.scale + f.offset).toFixed(1)} ${f.unit}`,
      )
  return changes.length
    ? changes
    : ['Same engine geometry, settings and environment.']
}
function alignCurves(
  runs: (Run | null)[],
  field: 'torque' | 'power',
  convert: (value: number) => number,
) {
  const xs = [
    ...new Set(
      runs.flatMap((r) => r?.samples.map((s) => Math.round(s.rpm)) ?? []),
    ),
  ].sort((x, y) => x - y)
  const interpolate = (run: Run | null, x: number) => {
    if (!run?.samples.length) return null
    const points = run.samples
    if (x < points[0].rpm - 2 || x > points.at(-1)!.rpm + 2) return null
    const index = points.findIndex((s) => s.rpm >= x)
    if (index <= 0) return points[index < 0 ? points.length - 1 : 0][field]
    const lo = points[index - 1],
      hi = points[index]
    return (
      lo[field] +
      ((hi[field] - lo[field]) * (x - lo.rpm)) /
        Math.max(0.001, hi.rpm - lo.rpm)
    )
  }
  return [
    xs,
    ...runs.map((run) =>
      xs.map((x) => {
        const v = interpolate(run, x)
        return v === null ? null : convert(v)
      }),
    ),
  ] as number[][]
}

export function BenchPage() {
  const { user } = useAuth()
  const [experiment, setExperiment] = useState(loadExperiment)
  const [initialDraft] = useState(() => loadDraft(experiment))
  const [draft, setDraft] = useState(initialDraft.engine)
  const [conditions, setConditions] = useState(initialDraft.conditions)
  const [telemetry, setTelemetry] = useState<Telemetry>(() =>
    new EngineCore(experiment.engine, experiment.conditions).telemetry(),
  )
  const telemetryRef = useRef<Telemetry | null>(telemetry)
  const [running, setRunning] = useState(false)
  const [ignition, setIgnition] = useState(true)
  const [auditionEngine, setAuditionEngine] = useState<EngineDefinition | null>(
    null,
  )
  const [mode, setMode] = useState<'manual' | 'live' | 'quick' | 'audition'>(
    'manual',
  )
  const [throttle, setThrottle] = useState(0)
  const [load, setLoad] = useState(0)
  const [volume, setVolume] = useState(0.25)
  const [prefs, setPrefs] = useState(loadPreferences)
  /** A quick test is calculating in the worker; the live engine is untouched. */
  const [calculating, setCalculating] = useState(false)
  const calculatingRef = useRef(false)
  const [road, setRoad] = useState<Road | null>(null)
  /** Pending test that would replace an existing comparison run. */
  const [overwrite, setOverwrite] = useState<{
    kind: 'live' | 'quick'
    slot: 'baseline' | 'modified'
  } | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [band, setBand] = useState<[number, number]>([2500, 5500])
  const [hold, setHold] = useState(0)
  const [selected, setSelected] = useState(0)
  const [slow, setSlow] = useState(false)
  const [overlays, setOverlays] = useState(true)
  const [advanced, setAdvanced] = useState(false)
  const [liveUpdates, setLiveUpdates] = useState(loadLiveUpdates)
  /** The build before the current run of live edits, for Restore previous build. */
  const liveOrigin = useRef<EngineDefinition | null>(null)
  const [procedure, setProcedure] = useState<Procedure>(defaultProcedure)
  const [run, setRun] = useState<Run | null>(null)
  const [slot, setSlot] = useState<'baseline' | 'modified'>('baseline')
  const [notice, setNotice] = useState(
    'Press Start engine above, or turn ignition on and hold the starter below. Then try the throttle.',
  )
  const [error, setError] = useState('')
  const [history, setHistory] = useState<number[][]>([[], []])
  const [auditionRpm, setAuditionRpm] = useState(3000)
  const [challenge, setChallenge] = useState('Explore freely')
  const [callbackMs, setCallbackMs] = useState(0)
  const lastFuelCut = useRef(-Infinity)
  const [limiterVisible, setLimiterVisible] = useState(false)
  const starterHeld = useRef(false)
  const startupGeneration = useRef(0)
  const audio = useRef<BenchAudio | null>(null)
  const worker = useRef<Worker | null>(null)
  const modeRef = useRef(mode)
  const activeRef = useRef(false)
  const activeRunId = useRef<string | null>(null)
  const activeRunSlot = useRef<'baseline' | 'modified'>(slot)
  const activeRunKind = useRef<'live' | 'quick'>('live')
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  /** Bumped by a full reset to replace the audio and worker hosts. */
  const [hostKey, setHostKey] = useState(0)
  const [confirmReset, setConfirmReset] = useState(false)
  /** Parts are stressed but never fail (bench setting, live and tests). */
  const [indestructible, setIndestructible] = useState(false)
  const indestructibleRef = useRef(false)
  const [pushSettings, setPushSettings] = useState<PushSettings>(defaultPush)
  const [push, setPush] = useState<PushResult | null>(null)
  const pushId = useRef<string | null>(null)
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(experiment.engine) ||
    JSON.stringify(conditions) !== JSON.stringify(experiment.conditions)
  const draftErrors = useMemo(() => engineErrors(draft), [draft])
  const envErrors = useMemo(() => conditionErrors(conditions), [conditions])
  const invalidLabels = [
    ...(draftErrors.name ? ['Build name'] : []),
    ...numericFields.filter((f) => draftErrors[f.key]).map((f) => f.label),
    ...Object.keys(inductionErrors(draft.induction)),
    ...Object.keys(fuelErrors(draft.fuelSystem)),
    ...Object.keys(exhaustErrors(draft.exhaust)),
    ...(draftErrors.management ? ['Engine maps'] : []),
    ...(draftErrors.fuelSupply ? ['Fuel supply'] : []),
    ...conditionFields.filter((f) => envErrors[f.key]).map((f) => f.label),
  ]
  const invalid = invalidLabels.length > 0
  const draftCranking = useMemo(
    () => (invalid ? null : crankingTorque(draft, conditions)),
    [draft, conditions, invalid],
  )
  const undersizedLabels = (e: EngineDefinition) =>
    undersizedForEngine(e).map((k) =>
      numericFields.find((f) => f.key === k)!.label.toLowerCase(),
    )
  const draftUndersized = invalid ? [] : undersizedLabels(draft)
  const benchUndersized = undersizedLabels(experiment.engine)
  const benchCranking = useMemo(
    () => crankingTorque(experiment.engine, experiment.conditions),
    [experiment.engine, experiment.conditions],
  )
  const invalidNote = invalid && (
    <Alert severity="error" className="rebuild-blocked">
      Can't rebuild until these fields are in range: {invalidLabels.join(', ')}.
      The engine on the stand is unchanged.
    </Alert>
  )
  useEffect(() => {
    modeRef.current = mode
    activeRef.current = running
  }, [mode, running, slot])
  useEffect(() => {
    persistExperiment(experiment)
  }, [experiment])
  useEffect(() => {
    persistDraft(draft, conditions)
  }, [draft, conditions])
  // Live updates: shortly after a valid edit, apply it to the bench without
  // stopping. A running engine keeps its speed, controls and gas state.
  // Automatic tests and snapshot auditioning own the engine, so wait.
  const liveBlocked = running && mode !== 'manual'
  const experimentEngine = experiment.engine
  useEffect(() => {
    if (!liveUpdates || !dirty || invalid || liveBlocked) return
    const timer = setTimeout(() => {
      let engine: EngineDefinition
      let env: Conditions
      try {
        engine = validateEngine(draft)
        env = conditionsSchema.parse(conditions)
      } catch (err) {
        setError(String(err))
        return
      }
      const origin = liveOrigin.current ?? experimentEngine
      liveOrigin.current = origin
      setExperiment((prev) => ({
        ...prev,
        previous: origin,
        engine,
        conditions: env,
      }))
      if (activeRef.current)
        audio.current?.send({ type: 'reconfigure', engine, conditions: env })
      else {
        const t = new EngineCore(engine, env).telemetry()
        setTelemetry(t)
        telemetryRef.current = t
      }
      setError('')
    }, 350)
    return () => clearTimeout(timer)
  }, [
    liveUpdates,
    dirty,
    invalid,
    liveBlocked,
    draft,
    conditions,
    experimentEngine,
  ])
  useEffect(() => {
    const engineAudio = new BenchAudio()
    engineAudio.listener = loadPreferences().listener
    engineAudio.indestructible = indestructibleRef.current
    audio.current = engineAudio
    const engineWorker = new Worker(
      new URL('../sim/engine.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.current = engineWorker
    const receive = (event: HostEvent) => {
      if (event.type === 'telemetry') {
        if (event.value.limited) lastFuelCut.current = performance.now()
        setLimiterVisible(
          performance.now() - lastFuelCut.current < 1500 &&
            event.value.rpm > 100,
        )
        telemetryRef.current = event.value
        setTelemetry(event.value)
        setCallbackMs(event.callbackMs)
        setHistory((prev) => [
          [...prev[0].slice(-149), event.value.time],
          [...prev[1].slice(-149), event.value.rpm],
        ])
      }
      if (event.type === 'run') {
        if (event.value.id !== activeRunId.current) return
        setRun(event.value)
        if (event.value.status !== 'running') {
          const captured = activeRunSlot.current
          setExperiment((prev) => ({ ...prev, [captured]: event.value }))
          // The next run should not silently replace a fresh baseline.
          if (captured === 'baseline' && event.value.status === 'complete')
            setSlot('modified')
          if (activeRunKind.current === 'quick') {
            calculatingRef.current = false
            setCalculating(false)
          } else {
            setRunning(false)
            setMode('manual')
          }
          setNotice(
            event.value.status === 'complete'
              ? `Test complete. ${event.value.samples.length} measured points captured in ${captured}.${captured === 'baseline' ? ' The next run will capture in Modified.' : ''}`
              : `Test aborted: ${event.value.reason}`,
          )
        }
      }
      if (event.type === 'push') {
        if (event.value.id !== pushId.current) return
        setPush(event.value)
        if (event.value.status !== 'running') {
          pushId.current = null
          calculatingRef.current = false
          setCalculating(false)
          setNotice(`Push it finished. ${event.value.reason}`)
        }
      }
      if (event.type === 'error') {
        setError(event.message)
        setRunning(false)
        setMode('manual')
        calculatingRef.current = false
        setCalculating(false)
      }
    }
    engineAudio.onEvent = receive
    engineWorker.onmessage = (event: MessageEvent<HostEvent>) =>
      receive(event.data)
    engineWorker.onerror = () => {
      setError('Quick-test worker stopped. Reload the bench to recover.')
      calculatingRef.current = false
      setCalculating(false)
    }
    const visibility = () => {
      if (document.hidden) {
        startupGeneration.current++
        starterHeld.current = false
        activeRef.current = false
        engineAudio.send({
          type: 'stop',
          reason: 'Tab hidden — test interrupted',
        })
        engineWorker.postMessage({
          type: 'stop',
          reason: 'Tab hidden — test interrupted',
        })
        void engineAudio.suspend()
        setRunning(false)
        setMode('manual')
        calculatingRef.current = false
        setCalculating(false)
        setNotice(
          'Paused because the tab was hidden. Press Start to resume a fresh bench run.',
        )
      }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      startupGeneration.current++
      starterHeld.current = false
      document.removeEventListener('visibilitychange', visibility)
      engineWorker.terminate()
      void engineAudio.close()
    }
  }, [hostKey])
  const setManualThrottle = useCallback((value: number) => {
    if (modeRef.current !== 'manual' && modeRef.current !== 'audition') return
    if (calculatingRef.current) return
    setThrottle(value)
    audio.current?.send({ type: 'controls', value: { throttle: value } })
  }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement | null)?.closest?.(
          'input,textarea,select,button',
        ) ||
        event.code !== 'Space'
      )
        return
      event.preventDefault()
      setManualThrottle(event.type === 'keydown' ? 1 : 0)
    }
    const blur = () => {
      setManualThrottle(0)
      starterHeld.current = false
      audio.current?.send({ type: 'controls', value: { starter: false } })
    }
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('blur', blur)
    let frame = 0,
      last = 0
    const poll = () => {
      const pad = navigator.getGamepads?.().find((p) => p?.connected)
      if (pad) {
        const value = pad.buttons[7]?.value ?? 0
        if (Math.abs(value - last) > 0.01) {
          setManualThrottle(value)
          last = value
        }
      }
      frame = requestAnimationFrame(poll)
    }
    poll()
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      window.removeEventListener('blur', blur)
      cancelAnimationFrame(frame)
    }
  }, [setManualThrottle])
  const stop = useCallback((reason = 'Emergency stop') => {
    startupGeneration.current++
    starterHeld.current = false
    activeRef.current = false
    audio.current?.send({ type: 'stop', reason })
    worker.current?.postMessage({ type: 'stop', reason })
    calculatingRef.current = false
    setCalculating(false)
    setRunning(false)
    setMode('manual')
    setThrottle(0)
    setHold(0)
    // The host replaces the stopped core, which has no dyno or road load.
    setLoad(0)
    setRoad(null)
  }, [])
  const crankStarter = async (engaged: boolean) => {
    if (!engaged) {
      starterHeld.current = false
      audio.current?.send({ type: 'controls', value: { starter: false } })
      return
    }
    if (starterHeld.current) return
    starterHeld.current = true
    const generation = ++startupGeneration.current
    setError('')
    try {
      await audio.current!.enable()
      if (generation !== startupGeneration.current || !starterHeld.current)
        return
      if (!activeRef.current) {
        audio.current!.send({
          type: 'configure',
          engine: experiment.engine,
          conditions: experiment.conditions,
        })
        audio.current!.send({
          type: 'start',
          ignition,
          automaticStarter: false,
        })
        setMode('manual')
        setRunning(true)
        activeRef.current = true
      }
      audio.current!.setVolume(slow ? 0 : volume)
      setLoad(0)
      setHold(0)
      audio.current!.send({
        type: 'controls',
        value: { starter: true, load: 0, holdRpm: null, ignition },
      })
      setNotice(
        ignition
          ? 'Starter cranking with the dyno unloaded. Release once the engine catches.'
          : 'Starter cranking with ignition off. Turn ignition on to fire; release the starter to stop cranking.',
      )
    } catch (err) {
      starterHeld.current = false
      setError(`Could not engage starter: ${String(err)}`)
    }
  }
  const configure = (engine: EngineDefinition, env: Conditions) => {
    engine = validateEngine(engine)
    conditionsSchema.parse(env)
    stop('Engine rebuilt')
    liveOrigin.current = null
    setExperiment((prev) => ({
      ...prev,
      previous: prev.engine,
      engine,
      conditions: env,
    }))
    setDraft(engine)
    setConditions(env)
    setSlow(false)
    setHistory([[], []])
    const t = new EngineCore(engine, env).telemetry()
    setTelemetry(t)
    telemetryRef.current = t
    audio.current?.send({ type: 'configure', engine, conditions: env })
    setError('')
    setNotice('Engine rebuilt and stopped. Press Start to run it.')
  }
  /**
   * Everything back to a fresh Road build in normal air, with new audio and
   * worker hosts. Comparison runs, saved builds and preferences are kept.
   */
  const fullReset = () => {
    stop('Full reset')
    setHostKey((key) => key + 1)
    liveOrigin.current = null
    activeRunId.current = null
    lastFuelCut.current = -Infinity
    setExperiment((prev) => ({
      ...prev,
      previous: null,
      engine: roadEngine,
      conditions: normalConditions,
    }))
    setDraft(roadEngine)
    setConditions(normalConditions)
    setProcedure(defaultProcedure)
    setIgnition(true)
    setSlow(false)
    setBusy(false)
    setAuditionEngine(null)
    setRun(null)
    setPush(null)
    pushId.current = null
    indestructibleRef.current = false
    setIndestructible(false)
    setLimiterVisible(false)
    setHistory([[], []])
    const t = new EngineCore(roadEngine, normalConditions).telemetry()
    setTelemetry(t)
    telemetryRef.current = t
    setError('')
    setNotice(
      'Full reset: the Road build in normal air with fresh audio and simulation. Comparison runs and saved builds are kept. Press Start to run it.',
    )
  }
  const start = async () => {
    const generation = ++startupGeneration.current
    setBusy(true)
    setError('')
    try {
      await audio.current!.enable()
      if (generation !== startupGeneration.current) return
      audio.current!.setVolume(slow ? 0 : volume)
      audio.current!.send({
        type: 'configure',
        engine: experiment.engine,
        conditions: experiment.conditions,
      })
      audio.current!.send({
        type: 'controls',
        value: { throttle: 0, load: 0, holdRpm: null, road: null },
      })
      setRoad(null)
      setThrottle(0)
      setLoad(0)
      setHold(0)
      audio.current!.send({ type: 'start' })
      setRunning(true)
      setMode('manual')
      setIgnition(true)
      setNotice(
        'Starting with the dyno unloaded. Reapply load after the engine starts. Hold Space or RT for throttle.',
      )
    } catch (err) {
      setError(`Could not start audio: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }
  const test = async (
    kind: 'live' | 'quick',
    snapshot?: Run,
    captureSlot?: 'baseline' | 'modified',
  ) => {
    setBusy(true)
    setError('')
    try {
      const testEngine = snapshot?.engine ?? experiment.engine
      const testConditions = snapshot?.conditions ?? experiment.conditions
      const testProcedure = snapshot?.procedure ?? procedure
      validateProcedure(testProcedure, testEngine)
      if (kind === 'live') {
        stop('New test started')
        setHistory([[], []])
        setSlow(false)
      } else {
        // The worker calculates silently; the live engine stays on the bench
        // and returns to idle until the result arrives.
        worker.current!.postMessage({ type: 'stop', reason: 'New test started' })
        setThrottle(0)
        setLoad(0)
        setHold(0)
        setRoad(null)
        audio.current?.send({
          type: 'controls',
          value: { throttle: 0, load: 0, holdRpm: null, road: null },
        })
      }
      const generation = startupGeneration.current
      setRun(null)
      const id = crypto.randomUUID()
      activeRunId.current = id
      activeRunKind.current = kind
      activeRunSlot.current = captureSlot ?? slot
      const message = {
        type: 'dyno' as const,
        engine: testEngine,
        conditions: testConditions,
        procedure: testProcedure,
        id,
        runtime: `${kind === 'live' ? 'AudioWorklet' : 'Web Worker'} · ${navigator.userAgent}`,
        indestructible,
      }
      if (kind === 'live') {
        await audio.current!.enable()
        if (generation !== startupGeneration.current) return
        audio.current!.setVolume(volume)
        audio.current!.send(message)
        setMode('live')
        setRunning(true)
      } else {
        worker.current!.postMessage(message)
        calculatingRef.current = true
        setCalculating(true)
      }
      setNotice(
        kind === 'live'
          ? 'Automatic live pull: the dyno owns throttle and RPM. Emergency stop remains available.'
          : 'Quick test calculating in a worker. The engine idles and manual controls are locked until it finishes.',
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }
  const audition = async (value: Run | null, label: string) => {
    if (!value) return
    setBusy(true)
    try {
      stop('Audio comparison started')
      await audio.current!.enable()
      audio.current!.setVolume(volume)
      audio.current!.send({
        type: 'configure',
        engine: value.engine,
        conditions: value.conditions,
      })
      audio.current!.send({
        type: 'controls',
        value: { throttle: 1, holdRpm: auditionRpm },
      })
      audio.current!.send({ type: 'start' })
      setAuditionEngine(value.engine)
      setMode('audition')
      setRunning(true)
      setSlow(false)
      setNotice(
        `Auditioning ${label} at ${auditionRpm} RPM, full throttle. Stop to return to your current build.`,
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }
  const importRecipe = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > 50000) throw new Error('Recipe exceeds the 50 kB limit.')
      const recipe = recipeSchema.parse(JSON.parse(await file.text()))
      configure(recipe.engine, recipe.conditions)
    } catch (err) {
      setError(`Recipe rejected: ${String(err)}`)
    }
    if (fileInput.current) fileInput.current.value = ''
  }
  const download = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: 'engine-bench/1',
            engine: experiment.engine,
            conditions: experiment.conditions,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob),
      anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'engine-bench-recipe.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const activeTest = (running && mode === 'live') || calculating
  const changeIndestructible = (value: boolean) => {
    indestructibleRef.current = value
    setIndestructible(value)
    audio.current?.setIndestructible(value)
  }
  let pushBlocked = ''
  try {
    validatePush(pushSettings, experiment.engine)
  } catch (err) {
    pushBlocked = err instanceof Error ? err.message : String(err)
  }
  if (!pushBlocked && calculating) pushBlocked = 'Wait for the calculation to finish.'
  if (!pushBlocked && running && mode !== 'manual')
    pushBlocked = 'Wait for the automatic test to finish.'
  const runPush = () => {
    if (pushBlocked || !worker.current) return
    const id = crypto.randomUUID()
    pushId.current = id
    calculatingRef.current = true
    setCalculating(true)
    setPush(null)
    worker.current.postMessage({
      type: 'push',
      engine: experiment.engine,
      conditions: experiment.conditions,
      settings: pushSettings,
      id,
      indestructible,
    })
    setNotice(
      `Pushing the applied build at ${pushSettings.rpm} RPM in a worker. Manual controls are locked until it finishes.`,
    )
  }
  const fuelCut = telemetry.fuel.overrunCut || telemetry.fuel.limiterCut
  const baseline = experiment.baseline,
    modified = experiment.modified
  // While a test runs, its samples are drawn as a third curve.
  const current = activeTest ? run : null
  const curves = useMemo(
    () =>
      alignCurves([baseline, modified, current], 'torque', (v) =>
        fromNm(v, prefs.torque),
      ),
    [baseline, modified, current, prefs.torque],
  )
  const powers = useMemo(
    () =>
      alignCurves([baseline, modified, current], 'power', (v) =>
        fromKw(v, prefs.power),
      ),
    [baseline, modified, current, prefs.power],
  )
  const curveLabels = useMemo(
    () => [
      'RPM',
      `Baseline · ${prefs.torque}`,
      `Modified · ${prefs.torque}`,
      `This run · ${prefs.torque}`,
    ],
    [prefs.torque],
  )
  const powerLabels = useMemo(
    () => [
      'RPM',
      `Baseline · ${prefs.power}`,
      `Modified · ${prefs.power}`,
      `This run · ${prefs.power}`,
    ],
    [prefs.power],
  )
  const updatePrefs = (update: Partial<typeof prefs>) => {
    const next = { ...prefs, ...update }
    setPrefs(next)
    persistPreferences(next)
    if (update.listener) audio.current?.setListener(update.listener)
  }
  const changeRoad = (next: Road | null) => {
    setRoad(next)
    if (next) {
      setLoad(0)
      setHold(0)
    }
    audio.current?.send({
      type: 'controls',
      value: next ? { road: next, load: 0, holdRpm: null } : { road: null },
    })
  }
  /** Start a test, asking first if it would replace a comparison run. */
  const requestTest = (kind: 'live' | 'quick') => {
    if (experiment[slot]) setOverwrite({ kind, slot })
    else void test(kind)
  }
  const trace = useMemo(() => {
    const values = telemetry.traces?.[selected] ?? []
    return [values.map((_, i) => i * 2), values.map((v) => v / 100000)]
  }, [telemetry, selected])
  const viewEngine =
    mode === 'audition' && auditionEngine ? auditionEngine : experiment.engine
  const displayed = busy
    ? null
    : activeTest
      ? run
      : (run ?? modified ?? baseline)
  // Starting a test stops a manually running engine, so only an active test,
  // unapplied edits or an invalid procedure block the dyno.
  const procedureError = (() => {
    try {
      validateProcedure(procedure, experiment.engine)
      return ''
    } catch (err) {
      return err instanceof Error && !(err instanceof ZodError)
        ? err.message
        : 'Check the test settings: every value must be filled in and within range.'
    }
  })()
  const dynoReason = activeTest
    ? ''
    : dirty
      ? 'Rebuild the engine first. The dyno tests the engine on the stand, and the workshop has unapplied edits.'
      : procedureError
  const dynoBlocked = activeTest || busy || !!dynoReason
  /** Presets and restore: live when live updates can apply, otherwise a rebuild. */
  const loadBuild = (engine: EngineDefinition, env: Conditions) => {
    if (!liveUpdates || liveBlocked) return configure(engine, env)
    liveOrigin.current = experiment.engine
    setDraft(engine)
    setConditions(env)
  }
  const apply = () => {
    try {
      configure(draft, conditions)
    } catch (err) {
      setError(String(err))
    }
  }
  const shiftTo = (gear: number) =>
    road &&
    changeRoad({ ...road, gear: Math.max(0, Math.min(road.ratios.length, gear)) })
  useShortcuts((action: ShortcutAction) => {
    if (action === 'help') return setShowShortcuts(true)
    if (action === 'stop') return stop()
    if (action === 'listener')
      return updatePrefs({
        listener:
          LISTENERS[(LISTENERS.indexOf(prefs.listener) + 1) % LISTENERS.length],
      })
    if (activeTest || busy) return
    if (action === 'start' && !(running && telemetry.rpm > 100)) void start()
    if ((action === 'live' || action === 'quick') && !dynoBlocked)
      requestTest(action)
    if (action === 'slot')
      setSlot((s) => (s === 'baseline' ? 'modified' : 'baseline'))
    if (action === 'baseline' && baseline) void audition(baseline, 'Baseline')
    if (action === 'modified' && modified) void audition(modified, 'Modified')
    if (road && mode === 'manual') {
      if (action === 'gearUp') shiftTo(road.gear + 1)
      if (action === 'gearDown') shiftTo(road.gear - 1)
      if (action === 'neutral') shiftTo(0)
    }
  })

  return (
    <ThemeProvider theme={theme}>
      <div className="bench-app">
        <header className="bench-header">
          <Link to="/" className="bench-wordmark">
            <span className="brand-mark">EB</span>
            <span>
              ENGINE BENCH<small>THE VIRTUAL ENGINE WORKSHOP</small>
            </span>
          </Link>
          <div className="header-right">
            <Chip size="small" label="LOCAL SIMULATION" variant="outlined" />
            {user ? (
              <Button component={Link} to="/settings">
                Account settings
              </Button>
            ) : (
              <Button component={Link} to="/login">
                Sign in
              </Button>
            )}
          </div>
        </header>
        <main>
          <div className="bench-title">
            <div>
              <div className="eyebrow">WORKSPACE / TEST CELL 01</div>
              <h1>
                Build it. Hear it. <em>Find its limits.</em>
              </h1>
              <p>
                A working engine on your bench. Every change is another
                experiment.
              </p>
            </div>
            <Stack alignItems="flex-end" spacing={1}>
              <Chip
                label={
                  calculating
                    ? 'CALCULATING'
                    : running
                      ? 'ENGINE RUNNING'
                      : 'READY TO START'
                }
                color={running || calculating ? 'success' : 'default'}
              />
              <Button
                variant="contained"
                size="large"
                disabled={
                  (running && telemetry.rpm > 100) || activeTest || busy
                }
                onClick={() => void start()}
              >
                Start engine
              </Button>
            </Stack>
          </div>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          <div className="bench-grid">
            <section className="bench-stage">
              <Paper className="stage-panel" variant="outlined">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">ON THE STAND</span>
                    <h2>{viewEngine.name}</h2>
                  </div>
                  <span className="engine-spec">
                    {(displacement(viewEngine) * 1000).toFixed(2)} L <b>·</b> I4{' '}
                    <b>·</b> 1–3–4–2
                  </span>
                </div>
                <EngineView
                  engine={viewEngine}
                  telemetry={telemetryRef}
                  slow={slow}
                  overlays={overlays}
                  selected={selected}
                  onSelect={setSelected}
                />
                <div className="view-options">
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={overlays}
                        onChange={(_, v) => setOverlays(v)}
                      />
                    }
                    label="Show cycle colours"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={slow}
                        onChange={(_, v) => {
                          setSlow(v)
                          audio.current?.setVolume(v ? 0 : volume)
                        }}
                      />
                    }
                    label="Slow-motion inspection"
                  />
                </div>
                <div className="stats-strip">
                  <div>
                    <small>ENGINE SPEED</small>
                    <strong data-testid="rpm">
                      {Math.round(telemetry.rpm).toLocaleString()}
                      <span> RPM</span>
                    </strong>
                  </div>
                  <div>
                    <small>BRAKE TORQUE</small>
                    <strong>
                      {formatFixed(fromNm(telemetry.torque, prefs.torque), 1)}
                      <span> {prefs.torque}</span>
                    </strong>
                  </div>
                  <div>
                    <small>CRANK POWER</small>
                    <strong>
                      {formatFixed(fromKw(telemetry.power, prefs.power), 1)}
                      <span> {prefs.power}</span>
                    </strong>
                  </div>
                  <div>
                    <small>COOLANT</small>
                    <strong>
                      {(telemetry.coolant - 273.15).toFixed(0)}
                      <span> °C</span>
                    </strong>
                  </div>
                </div>
                <div className="stats-strip boost-strip" data-testid="fuel">
                  <div>
                    <small>MIXTURE</small>
                    <strong>
                      λ{' '}
                      {fuelCut ? '—' : telemetry.fuel.lambda.toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <small>AIR–FUEL</small>
                    <strong>
                      {fuelCut ? (
                        '—'
                      ) : (
                        <>
                          {(
                            telemetry.fuel.lambda *
                            FUELS[telemetry.knock.fuel].stoichiometric
                          ).toFixed(1)}
                          <span>:1</span>
                        </>
                      )}
                    </strong>
                  </div>
                  <div>
                    <small>FUEL FLOW</small>
                    <strong>
                      {((telemetry.fuel.fuelFlow * 3600) / 0.74).toFixed(1)}
                      <span> L/h</span>
                    </strong>
                  </div>
                  <div>
                    <small>FUEL STATUS</small>
                    <strong className="boost-status">
                      {telemetry.fuel.overrunCut && (
                        <em className="boost-flag">OVERRUN CUT</em>
                      )}
                      {limiterVisible && (
                        <em className="boost-flag warn">
                          {experiment.engine.limiterCut === 'spark' ||
                          experiment.engine.fuelSystem.kind === 'carburettor'
                            ? 'SPARK CUT'
                            : 'LIMITER CUT'}
                        </em>
                      )}
                      {telemetry.fuel.fuelLimited && (
                        <em className="boost-flag warn" data-testid="fuel-limited">
                          FUEL LIMITED
                        </em>
                      )}
                      {telemetry.fuel.misfire && (
                        <em className="boost-flag warn">MISFIRE</em>
                      )}
                      {telemetry.afterfire && (
                        <em className="boost-flag pop" data-testid="afterfire">
                          AFTERFIRE
                        </em>
                      )}
                      {!fuelCut &&
                        !limiterVisible &&
                        !telemetry.fuel.fuelLimited &&
                        !telemetry.fuel.misfire &&
                        !telemetry.afterfire &&
                        (telemetry.fuel.lambda > 1.1 ? (
                          <em className="boost-flag warn">LEAN</em>
                        ) : telemetry.fuel.lambda < 0.8 ? (
                          <em className="boost-flag warn">RICH</em>
                        ) : (
                          <span>Normal</span>
                        ))}
                    </strong>
                  </div>
                </div>
                <div className="stats-strip boost-strip" data-testid="ecu">
                  <div>
                    <small>
                      TIMING{telemetry.ecu.maps ? ' · MAP' : ''}
                    </small>
                    <strong>
                      {formatFixed(
                        telemetry.ecu.advance -
                          telemetry.knock.retard.reduce((a, b) => a + b, 0) / 4,
                        1,
                      )}
                      <span>° BTDC</span>
                    </strong>
                  </div>
                  <div>
                    <small>
                      TARGET λ{telemetry.ecu.maps ? ' · MAP' : ''}
                    </small>
                    <strong>{telemetry.ecu.lambda.toFixed(2)}</strong>
                  </div>
                  <div>
                    <small>INJECTOR DUTY</small>
                    <strong>
                      {telemetry.fuel.injectorDuty === null ? (
                        '—'
                      ) : (
                        <>
                          {Math.round(telemetry.fuel.injectorDuty * 100)}
                          <span> %</span>
                        </>
                      )}
                    </strong>
                  </div>
                  <div>
                    <small>FUEL PUMP</small>
                    <strong>
                      {telemetry.fuel.pumpUse === null ? (
                        '—'
                      ) : (
                        <>
                          {Math.round(telemetry.fuel.pumpUse * 100)}
                          <span> %</span>
                        </>
                      )}
                    </strong>
                  </div>
                </div>
                <KnockStrip
                  knock={telemetry.knock}
                  temperatures={telemetry.temperatures}
                />
                <StressPanel
                  stress={telemetry.stress}
                  indestructible={indestructible}
                  onIndestructible={changeIndestructible}
                  rebuildDisabled={mode !== 'manual' && running}
                  onRebuild={() => {
                    stop('Rebuilt after a failure')
                    setNotice(
                      'Engine rebuilt with new parts from the last build. Press Start to run it.',
                    )
                  }}
                />
                {telemetry.induction.kind !== 'none' && (
                  <div className="stats-strip boost-strip" data-testid="boost">
                    <div>
                      <small>BOOST</small>
                      <strong>
                        {formatFixed(telemetry.induction.boost / 1e5, 2)}
                        <span> bar</span>
                      </strong>
                    </div>
                    <div>
                      <small>
                        {telemetry.induction.kind === 'turbo'
                          ? 'TURBO SPEED'
                          : 'BLOWER SPEED'}
                      </small>
                      <strong>
                        {Math.round(
                          telemetry.induction.shaftRpm / 1000,
                        ).toLocaleString()}
                        <span>k RPM</span>
                      </strong>
                    </div>
                    <div>
                      <small>CHARGE AIR</small>
                      <strong>
                        {(
                          telemetry.induction.chargeTemperature - 273.15
                        ).toFixed(0)}
                        <span> °C</span>
                      </strong>
                    </div>
                    <div>
                      <small>
                        {telemetry.induction.kind === 'turbo'
                          ? 'WASTEGATE · BACK PRESSURE'
                          : 'STATUS'}
                      </small>
                      <strong className="boost-status">
                        {telemetry.induction.kind === 'turbo' && (
                          <>
                            {Math.round(telemetry.induction.wastegate * 100)}
                            <span>% · </span>
                            {formatFixed(
                              telemetry.induction.exhaustBackPressure / 1e5,
                              2,
                            )}
                            <span> bar </span>
                          </>
                        )}
                        {telemetry.induction.venting && (
                          <em className="boost-flag">
                            {telemetry.induction.kind === 'roots'
                              ? 'BYPASS'
                              : 'BLOW-OFF'}
                          </em>
                        )}
                        {telemetry.induction.surge && (
                          <em className="boost-flag warn">SURGE</em>
                        )}
                        {telemetry.induction.kind !== 'turbo' &&
                          !telemetry.induction.venting &&
                          !telemetry.induction.surge && <span>Normal</span>}
                      </strong>
                    </div>
                  </div>
                )}
              </Paper>
              {draft.management && (
                <Paper className="editor-panel map-panel" variant="outlined">
                  <div className="panel-heading">
                    <h2>Engine maps</h2>
                  </div>
                  <MapEditor
                    engine={draft}
                    disabled={activeTest}
                    live={
                      running && experiment.engine.management
                        ? { ...telemetry.ecu, rpm: telemetry.rpm }
                        : null
                    }
                    onChange={(update) =>
                      setDraft((d) => ({
                        ...d,
                        management: update(d.management),
                      }))
                    }
                  />
                  {dirty && !liveUpdates && (
                    <p className="cranking-note warn">
                      Edits reach the engine when you rebuild it, or straight
                      away with Live updates on.
                    </p>
                  )}
                </Paper>
              )}
              <Paper className="chart-panel" variant="outlined">
                <Chart
                  title="Live engine speed"
                  labels={historyLabels}
                  data={history}
                />
                <Chart
                  title={`Cylinder ${selected + 1} pressure · latest cycle`}
                  labels={pressureLabels}
                  data={trace}
                />
              </Paper>
            </section>
            <aside className="bench-sidebar">
              <Paper className="control-panel" variant="outlined">
                <div className="panel-heading">
                  <h2>Bench controls</h2>
                  <Button
                    size="small"
                    className="shortcut-link"
                    onClick={() => setShowShortcuts(true)}
                  >
                    Shortcuts (?)
                  </Button>
                </div>
                <Gauges
                  telemetry={telemetryRef}
                  revLimit={viewEngine.revLimit}
                  mechanicalLimit={viewEngine.mechanicalLimit}
                />
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => stop()}
                  >
                    Emergency stop
                  </Button>
                  <Button
                    disabled={activeTest}
                    title="Stop and rebuild the current build"
                    onClick={() =>
                      configure(experiment.engine, experiment.conditions)
                    }
                  >
                    Reset bench
                  </Button>
                  <Button
                    color="warning"
                    title="Back to the Road build with fresh audio and simulation"
                    onClick={() => setConfirmReset(true)}
                  >
                    Full reset
                  </Button>
                </Stack>
                <div className="control-sliders">
                  <div>
                    <label id="throttle-label">
                      Throttle <small>(Space / RT)</small>{' '}
                      <b>{Math.round(throttle * 100)}%</b>
                    </label>
                    <Slider
                      aria-labelledby="throttle-label"
                      value={throttle * 100}
                      min={0}
                      max={100}
                      disabled={busy || activeTest || mode === 'audition'}
                      onChange={(_, v) => setManualThrottle(Number(v) / 100)}
                    />
                  </div>
                  <div>
                    <label id="load-label">
                      Dyno load <b>{load} Nm</b>
                    </label>
                    <Slider
                      aria-labelledby="load-label"
                      value={load}
                      min={0}
                      max={300}
                      disabled={
                        busy || activeTest || mode === 'audition' || !!road
                      }
                      onChange={(_, v) => {
                        setLoad(Number(v))
                        audio.current?.send({
                          type: 'controls',
                          value: { load: Number(v) },
                        })
                      }}
                    />
                  </div>
                  <div>
                    <label id="volume-label">
                      Master volume <b>{Math.round(volume * 100)}%</b>
                    </label>
                    <Slider
                      aria-labelledby="volume-label"
                      value={volume * 100}
                      max={100}
                      onChange={(_, v) => {
                        setVolume(Number(v) / 100)
                        audio.current?.setVolume(slow ? 0 : Number(v) / 100)
                      }}
                    />
                  </div>
                </div>
                <div className="listen-row">
                  <TextField
                    select
                    size="small"
                    label="Listen from (V)"
                    value={prefs.listener}
                    onChange={(e) =>
                      updatePrefs({ listener: e.target.value as Listener })
                    }
                  >
                    {LISTENERS.map((l) => (
                      <MenuItem key={l} value={l}>
                        {listenerLabels[l]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Power"
                    value={prefs.power}
                    onChange={(e) =>
                      updatePrefs({ power: e.target.value as PowerUnit })
                    }
                  >
                    {POWER_UNITS.map((u) => (
                      <MenuItem key={u} value={u}>
                        {u}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Torque"
                    value={prefs.torque}
                    onChange={(e) =>
                      updatePrefs({ torque: e.target.value as TorqueUnit })
                    }
                  >
                    {TORQUE_UNITS.map((u) => (
                      <MenuItem key={u} value={u}>
                        {u}
                      </MenuItem>
                    ))}
                  </TextField>
                </div>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={ignition}
                        disabled={busy || activeTest || mode === 'audition'}
                        onChange={(_, value) => {
                          setIgnition(value)
                          audio.current?.send({
                            type: 'controls',
                            value: { ignition: value },
                          })
                        }}
                      />
                    }
                    label="Ignition"
                  />
                  <Button
                    variant="outlined"
                    disabled={activeTest || mode === 'audition'}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId)
                      void crankStarter(true)
                    }}
                    onPointerUp={() => void crankStarter(false)}
                    onPointerCancel={() => void crankStarter(false)}
                    onLostPointerCapture={() => void crankStarter(false)}
                    onBlur={() => void crankStarter(false)}
                    onKeyDown={(e) => {
                      if (e.code === 'Space' || e.code === 'Enter')
                        void crankStarter(true)
                    }}
                    onKeyUp={() => void crankStarter(false)}
                  >
                    Hold starter
                  </Button>
                </Stack>
                <div className="hold-controls">
                  <NumberField
                    size="small"
                    label="RPM hold (0 = free)"
                    value={hold}
                    commitOnBlur
                    clamp={[
                      0,
                      Math.min(
                        experiment.engine.revLimit - 100,
                        experiment.engine.mechanicalLimit - 100,
                      ),
                    ]}
                    disabled={
                      busy || activeTest || mode === 'audition' || !!road
                    }
                    slotProps={{
                      htmlInput: {
                        min: 0,
                        max: Math.min(
                          experiment.engine.revLimit - 100,
                          experiment.engine.mechanicalLimit - 100,
                        ),
                        step: 100,
                      },
                    }}
                    onValueChange={(value) => {
                      setHold(value)
                      audio.current?.send({
                        type: 'controls',
                        value: { holdRpm: value || null },
                      })
                    }}
                  />
                  <span>
                    Limiter: {experiment.engine.revLimit} RPM · mechanical
                    estimate: {experiment.engine.mechanicalLimit} RPM
                  </span>
                </div>
                <RoadControls
                  road={road}
                  onChange={changeRoad}
                  speed={telemetry.road?.speed ?? null}
                  disabled={busy || activeTest || mode === 'audition'}
                />
                {limiterVisible && (
                  <Alert severity="warning">
                    Rev limiter cycling —{' '}
                    {experiment.engine.limiterCut === 'spark' ||
                    experiment.engine.fuelSystem.kind === 'carburettor'
                      ? 'spark cut: unburned fuel can pop in a hot exhaust'
                      : 'electronic fuel cut'}
                    . Release throttle or add load. Mechanical capability is
                    unchanged.
                  </Alert>
                )}
                {running &&
                  mode === 'manual' &&
                  telemetry.rpm < 100 &&
                  telemetry.time > 1.2 &&
                  !telemetry.starterStalled && (
                    <Alert severity="info">
                      Engine stalled. Press Start engine to unload the dyno and
                      restart.
                      {benchUndersized.length > 0 &&
                        ` For an engine this size the ${benchUndersized.join(', ')} ${benchUndersized.length > 1 ? 'are' : 'is'} very small, so it can fire on the starter but not keep itself running. Use “Scale to this size” in the engine workshop.`}
                    </Alert>
                  )}
                {telemetry.starterStalled && (
                  <Alert severity="warning">
                    The {experiment.engine.starterTorque} Nm starter can't turn
                    this engine over. Turning it over slowly takes about{' '}
                    {Math.ceil(benchCranking / 10) * 10} Nm. Raise Starter
                    torque in the engine workshop and rebuild.
                  </Alert>
                )}
                {telemetry.warning && (
                  <Alert severity="warning">{telemetry.warning}</Alert>
                )}
                <p className="bench-notice" role="status">
                  {notice}
                </p>
              </Paper>
              <Paper className="editor-panel" variant="outlined">
                <div className="panel-heading">
                  <h2>Engine workshop</h2>
                  <Chip
                    size="small"
                    label={
                      `CUSTOM I4 · ${fuelShortLabels[draft.fuelSystem.kind]}` +
                      (draft.induction.kind === 'none'
                        ? ''
                        : ` · ${inductionLabels[draft.induction.kind].toUpperCase()}`)
                    }
                  />
                </div>
                <div className="preset-buttons">
                  {starterBuilds.map((b) => (
                    <Button
                      key={b.label}
                      variant="outlined"
                      size="small"
                      title={b.description}
                      disabled={activeTest}
                      onClick={() => loadBuild(b.engine, experiment.conditions)}
                    >
                      {b.label}
                    </Button>
                  ))}
                </div>
                <p className="helper-text">
                  {starterBuilds.find((b) => b.engine.name === draft.name)
                    ?.description ?? 'Your own build.'}{' '}
                  Fictional starting points, not production replicas.
                </p>
                <TextField
                  size="small"
                  label="Build name"
                  fullWidth
                  value={draft.name}
                  error={!!draftErrors.name}
                  helperText={draftErrors.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <div className="field-grid">
                  {numericFields
                    .filter((f, i) => advanced || i < 5 || draftErrors[f.key])
                    .map((f) => {
                      // With maps on, timing and mixture come from the tables.
                      const mapped =
                        !!draft.management &&
                        (f.key === 'ignitionAdvance' || f.key === 'lambda')
                      return (
                      <NumberField
                        key={f.key}
                        size="small"
                        label={`${f.label} (${f.unit})`}
                        disabled={mapped}
                        error={!!draftErrors[f.key]}
                        helperText={
                          draftErrors[f.key] ??
                          (mapped ? 'Set by the engine maps' : rangeText(f))
                        }
                        value={Number(draft[f.key]) * f.scale}
                        title={f.help}
                        slotProps={{
                          htmlInput: { min: f.min, max: f.max, step: f.step },
                        }}
                        onValueChange={(v) =>
                          setDraft((d) => ({ ...d, [f.key]: v / f.scale }))
                        }
                      />
                      )
                    })}
                </div>
                {draftUndersized.length > 0 && (
                  <div className="cranking-note warn">
                    The {draftUndersized.join(', ')}{' '}
                    {draftUndersized.length > 1 ? 'are' : 'is'} very small for
                    this size. Big engines need bigger valves to breathe and a
                    heavier rotating assembly to idle smoothly.{' '}
                    <Button
                      size="small"
                      onClick={() =>
                        setDraft((d) => ({ ...d, ...scaledProportions(d) }))
                      }
                    >
                      Scale to this size
                    </Button>
                  </div>
                )}
                <Button
                  size="small"
                  className="advanced-toggle"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced((v) => !v)}
                >
                  {advanced
                    ? 'Hide advanced parameters'
                    : `Show ${numericFields.length - 5} advanced parameters (valves, runners, timing, mixture, inertia, limits)`}
                </Button>
                <h3 className="workshop-subheading">Fuel system</h3>
                <FuelSystemEditor
                  value={draft.fuelSystem}
                  disabled={activeTest}
                  onChange={(update) =>
                    setDraft((d) => ({
                      ...d,
                      fuelSystem: update(d.fuelSystem),
                    }))
                  }
                />
                <FuelSupplyEditor
                  value={draft.fuelSupply}
                  fuelSystem={draft.fuelSystem.kind}
                  disabled={activeTest}
                  onChange={(update) =>
                    setDraft((d) => ({ ...d, fuelSupply: update(d.fuelSupply) }))
                  }
                />
                <h3 className="workshop-subheading">Combustion & knock</h3>
                <CombustionEditor
                  value={draft.combustion}
                  disabled={activeTest}
                  onChange={(update) =>
                    setDraft((d) => ({
                      ...d,
                      combustion: update(d.combustion),
                    }))
                  }
                />
                <h3 className="workshop-subheading">Parts & limits</h3>
                <PartsEditor
                  engine={draft}
                  disabled={activeTest}
                  onChange={(update) => setDraft((d) => update(d))}
                />
                <h3 className="workshop-subheading">Engine management</h3>
                <MapToggle
                  engine={draft}
                  disabled={activeTest}
                  onChange={(management) =>
                    setDraft((d) => ({ ...d, management }))
                  }
                />
                <h3 className="workshop-subheading">Forced induction</h3>
                <InductionEditor
                  value={draft.induction}
                  disabled={activeTest}
                  onChange={(update) =>
                    setDraft((d) => ({ ...d, induction: update(d.induction) }))
                  }
                />
                <h3 className="workshop-subheading">Exhaust & limiter</h3>
                <ExhaustEditor
                  value={draft.exhaust}
                  disabled={activeTest}
                  onChange={(update) =>
                    setDraft((d) => ({ ...d, exhaust: update(d.exhaust) }))
                  }
                />
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Rev limiter cuts"
                  value={
                    draft.fuelSystem.kind === 'carburettor'
                      ? 'spark'
                      : draft.limiterCut
                  }
                  disabled={activeTest || draft.fuelSystem.kind === 'carburettor'}
                  helperText={
                    draft.fuelSystem.kind === 'carburettor'
                      ? 'A carburettor cannot stop its fuel, so the limiter cuts the spark.'
                      : draft.limiterCut === 'spark'
                        ? 'Fuel keeps flowing unburned: pops and bangs in a hot exhaust.'
                        : 'Injection stops: quiet and clean.'
                  }
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      limiterCut: e.target.value as 'fuel' | 'spark',
                    }))
                  }
                >
                  <MenuItem value="fuel">Fuel (injection stops)</MenuItem>
                  <MenuItem value="spark">Spark (ignition cut)</MenuItem>
                </TextField>
                <p className="derived-capacity">
                  Derived capacity{' '}
                  <strong>
                    {Number.isFinite(displacement(draft))
                      ? `${(displacement(draft) * 1e6).toFixed(0)} cc`
                      : '—'}
                  </strong>
                </p>
                {draftCranking !== null && (
                  <p
                    className={
                      draft.starterTorque < draftCranking
                        ? 'cranking-note warn'
                        : 'cranking-note'
                    }
                  >
                    Turning over slowly needs about{' '}
                    {Math.ceil(draftCranking / 10) * 10} Nm.
                    {draft.starterTorque < draftCranking &&
                      ' The starter is weaker than that, so starting relies on flywheel momentum and may stall.'}
                  </p>
                )}
                <FormControlLabel
                  className="live-toggle"
                  control={
                    <Switch
                      checked={liveUpdates}
                      onChange={(e) => {
                        liveOrigin.current = null
                        setLiveUpdates(e.target.checked)
                        persistLiveUpdates(e.target.checked)
                      }}
                    />
                  }
                  label="Live updates"
                />
                <p className="cranking-note">
                  {liveUpdates
                    ? 'Valid edits apply to the engine as you make them, without stopping it: speed, throttle and load carry over. Stop & rebuild still resets everything.'
                    : 'Off: edits wait for Stop & rebuild, which stops and resets the engine.'}
                </p>
                <Button
                  variant="contained"
                  fullWidth
                  disabled={(!dirty && !liveUpdates) || invalid || activeTest}
                  onClick={apply}
                >
                  Stop & rebuild engine
                </Button>
                {invalidNote}
                {dirty && !invalid && (
                  <p className="pending-note">
                    {!liveUpdates
                      ? 'Unapplied changes. Rebuild to update physics, sound and geometry together.'
                      : liveBlocked
                        ? 'Live updates wait until the automatic test or audition ends.'
                        : 'Applying to the engine…'}
                  </p>
                )}
                <Button
                  fullWidth
                  disabled={!experiment.previous || activeTest}
                  onClick={() =>
                    experiment.previous &&
                    loadBuild(experiment.previous, experiment.conditions)
                  }
                >
                  Restore previous build
                </Button>
              </Paper>
              <Paper className="editor-panel" variant="outlined">
                <div className="panel-heading">
                  <h2>Test cell</h2>
                  <span className="eyebrow">AMBIENT CONDITIONS</span>
                </div>
                <div className="field-grid">
                  {conditionFields.map((f) => (
                    <NumberField
                      key={f.key}
                      size="small"
                      label={`${f.label} (${f.unit})`}
                      error={!!envErrors[f.key]}
                      helperText={envErrors[f.key] ?? rangeText(f)}
                      value={conditions[f.key] * f.scale + f.offset}
                      slotProps={{
                        htmlInput: { min: f.min, max: f.max, step: f.step },
                      }}
                      onValueChange={(v) =>
                        setConditions((c) => ({
                          ...c,
                          [f.key]: (v - f.offset) / f.scale,
                        }))
                      }
                    />
                  ))}
                </div>
                <p className="helper-text">
                  O₂ is dry-air volume fraction; humidity displaces dry air.
                  Fixed fuelling means extra oxygen only helps when fuel is
                  available. Knock and oil-pressure failures are not modelled.
                </p>
                <Stack direction="row" spacing={1}>
                  <Button
                    disabled={activeTest || !dirty || invalid}
                    onClick={apply}
                  >
                    Apply & reset
                  </Button>
                  <Button onClick={() => setConditions(normalConditions)}>
                    Normal air
                  </Button>
                </Stack>
                {invalidNote}
              </Paper>
            </aside>
          </div>
          <section className="dyno-section">
            <div className="section-title">
              <div className="eyebrow">MEASURE THE DIFFERENCE</div>
              <h2>The dyno room</h2>
              <p>
                Watch a pull unfold, or calculate a quick curve. Same engine.
                Same procedure.
              </p>
            </div>
            <div className="dyno-grid">
              <Paper className="editor-panel" variant="outlined">
                <h3>Test procedure</h3>
                <div className="field-grid">
                  <TextField
                    select
                    size="small"
                    label="Procedure"
                    value={procedure.kind}
                    onChange={(e) =>
                      setProcedure({
                        ...procedure,
                        kind: e.target.value as Procedure['kind'],
                      })
                    }
                  >
                    <MenuItem value="sweep">Continuous sweep</MenuItem>
                    <MenuItem value="steps">Steady-state steps</MenuItem>
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Capture in"
                    disabled={activeTest}
                    value={slot}
                    onChange={(e) => setSlot(e.target.value as typeof slot)}
                  >
                    <MenuItem value="baseline">Baseline</MenuItem>
                    <MenuItem value="modified">Modified</MenuItem>
                  </TextField>
                  {(
                    [
                      'startRpm',
                      'endRpm',
                      'rate',
                      'stepRpm',
                      'holdSeconds',
                    ] as const
                  )
                    .filter((k) =>
                      procedure.kind === 'steps'
                        ? k !== 'rate'
                        : !['stepRpm', 'holdSeconds'].includes(k),
                    )
                    .map((k) => (
                      <NumberField
                        key={k}
                        size="small"
                        label={
                          {
                            startRpm: 'Start RPM',
                            endRpm: 'End RPM',
                            rate: 'Sweep RPM / second',
                            stepRpm: 'Step RPM',
                            holdSeconds: 'Minimum settling seconds',
                          }[k]
                        }
                        value={procedure[k]}
                        onValueChange={(v) =>
                          setProcedure((p) => ({ ...p, [k]: v }))
                        }
                      />
                    ))}
                </div>
                <Stack direction="row" spacing={1} mt={2}>
                  <Button
                    variant="contained"
                    disabled={dynoBlocked}
                    onClick={() => requestTest('live')}
                  >
                    Live pull
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={dynoBlocked}
                    onClick={() => requestTest('quick')}
                  >
                    Quick test
                  </Button>
                </Stack>
                {dynoReason && !busy && (
                  <p className="pending-note" data-testid="dyno-blocked">
                    {dynoReason}
                  </p>
                )}
                <p className="helper-text">
                  Automatic tests own throttle and RPM. Quick tests calculate
                  silently; they are not playback. Stop retains incomplete
                  samples.
                </p>
                {displayed && (
                  <PullSummary
                    run={displayed}
                    baseline={baseline}
                    power={prefs.power}
                    torque={prefs.torque}
                    band={band}
                    onBand={setBand}
                  />
                )}
              </Paper>
              <Paper className="chart-panel" variant="outlined">
                <Chart
                  title="Brake torque comparison"
                  markPeaks
                  labels={curveLabels}
                  data={curves}
                  height={205}
                />
                <Chart
                  title="Crank power comparison"
                  markPeaks
                  labels={powerLabels}
                  data={powers}
                  height={205}
                />
                <div className="comparison-notes">
                  <h3>What changed?</h3>
                  {describeChanges(
                    baseline,
                    modified?.engine ?? experiment.engine,
                    modified?.conditions ?? experiment.conditions,
                  ).map((c) => (
                    <p key={c}>{c}</p>
                  ))}
                  <Button
                    disabled={!baseline || activeTest}
                    onClick={() =>
                      baseline &&
                      configure(baseline.engine, baseline.conditions)
                    }
                  >
                    Restore baseline engine & conditions
                  </Button>
                </div>
              </Paper>
            </div>
            <Paper className="editor-panel push-panel" variant="outlined">
              <h3>Push it</h3>
              <PushPanel
                engine={experiment.engine}
                settings={pushSettings}
                onSettings={setPushSettings}
                result={push}
                busy={calculating}
                blocked={pushBlocked}
                onRun={runPush}
                onStop={() => {
                  worker.current?.postMessage({
                    type: 'stop',
                    reason: 'Push stopped',
                  })
                }}
              />
            </Paper>
          </section>
          <SavedLibrary
            engine={experiment.engine}
            conditions={experiment.conditions}
            baseline={baseline}
            modified={modified}
            locked={running || busy}
            dirty={dirty}
            onLoadBuild={configure}
            onLoadRun={(value, target) => {
              setExperiment((previous) => ({ ...previous, [target]: value }))
              setRun(value)
            }}
            onRerun={async (value) => {
              configure(value.engine, value.conditions)
              setProcedure(value.procedure)
              setSlot('modified')
              await test('quick', value, 'modified')
            }}
            onWorkspaceChange={() => stop('Workspace changed')}
          />
          <div className="extras-grid">
            <Paper className="editor-panel" variant="outlined">
              <div className="eyebrow">HEAR THE DIFFERENCE</div>
              <h3>Compare at the same operating point</h3>
              <NumberField
                label="Comparison RPM"
                size="small"
                value={auditionRpm}
                clamp={[1000, 6000]}
                slotProps={{ htmlInput: { min: 1000, max: 6000, step: 100 } }}
                onValueChange={setAuditionRpm}
              />
              <Stack direction="row" spacing={1} mt={2}>
                <Button
                  disabled={!baseline || activeTest || busy}
                  onClick={() => void audition(baseline, 'Baseline')}
                >
                  Hear baseline
                </Button>
                <Button
                  disabled={!modified || activeTest || busy}
                  onClick={() => void audition(modified, 'Modified')}
                >
                  Hear modified
                </Button>
              </Stack>
              <p className="helper-text">
                Both use full throttle at the chosen RPM. This is a fresh
                simulation of the snapshot, not a recording of its test.
              </p>
            </Paper>
            <Paper className="editor-panel" variant="outlined">
              <div className="eyebrow">TRY AN EXPERIMENT</div>
              <h3>Give your next build a purpose</h3>
              <TextField
                select
                fullWidth
                size="small"
                label="Guided experiment"
                value={challenge}
                onChange={(e) => setChallenge(e.target.value)}
              >
                {[
                  'Explore freely',
                  'Find more mid-range torque',
                  'A change in the weather',
                  'Find the useful rev range',
                ].map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <p>
                {challenge === 'Find more mid-range torque'
                  ? 'Keep bore and stroke fixed. Capture a baseline, change compression or intake area, then compare torque from 2500–4000 RPM. Can you gain mid-range torque without losing power elsewhere?'
                  : challenge === 'A change in the weather'
                    ? 'Capture normal air as a baseline. Change only room temperature to 35°C, rebuild and repeat the exact procedure. Compare the whole curve; keep fuel and oxygen settings unchanged.'
                    : challenge === 'Find the useful rev range'
                      ? 'Run a sweep below both limits. Find where power peaks and begins to fall. Raising the electronic limiter does not raise mechanical capability.'
                      : 'No unlocks, scores or required order. Follow your curiosity; every experiment can be reversed.'}
              </p>
            </Paper>
            <Paper className="editor-panel" variant="outlined">
              <div className="eyebrow">KEEP YOUR EXPERIMENT</div>
              <h3>A build worth coming back to</h3>
              <Stack spacing={1}>
                <Button variant="outlined" onClick={download}>
                  Download build recipe
                </Button>
                <Button onClick={() => fileInput.current?.click()}>
                  Import build recipe
                </Button>
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  accept="application/json,.json"
                  aria-label="Import recipe file"
                  onChange={(e) => void importRecipe(e.target.files?.[0])}
                />
                <Button component={Link} to={user ? '/settings' : '/login'}>
                  {user ? 'Account settings' : 'Sign in — keep this experiment'}
                </Button>
              </Stack>
              <p className="helper-text">
                Guest builds and comparisons survive navigation and reloads in
                this tab. Recipes are portable; sign in to use the server
                library above.
              </p>
            </Paper>
          </div>
          <footer className="bench-footer">
            <span>
              RESEARCH MODEL · CRANKSHAFT ESTIMATES · NO REAL-WORLD TUNING
              CLAIMS
            </span>
            <details>
              <summary>Simulation diagnostics</summary>
              <p>
                48 kHz core · ≤{telemetry.maxSubsteps} substeps · observed
                worklet peak {callbackMs.toFixed(1)} ms (coarse timer) / 2.67 ms
                budget. Model estimates are not engineering validation.
              </p>
            </details>
          </footer>
        </main>
        <ShortcutHelp
          open={showShortcuts}
          onClose={() => setShowShortcuts(false)}
        />
        <Dialog
          open={confirmReset}
          onClose={() => setConfirmReset(false)}
          aria-labelledby="full-reset-title"
        >
          <DialogTitle id="full-reset-title">Reset everything?</DialogTitle>
          <DialogContent>
            <p className="helper-text">
              The engine stops and the bench returns to the Road build in
              normal air, with default test settings, controls and fresh
              audio and simulation. Your current build and unapplied edits
              are discarded; download a recipe or save it first to keep it.
              Baseline and Modified runs, saved builds and preferences are
              kept.
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="contained"
              color="warning"
              onClick={() => {
                setConfirmReset(false)
                fullReset()
              }}
            >
              Reset everything
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={!!overwrite}
          onClose={() => setOverwrite(null)}
          aria-labelledby="overwrite-title"
        >
          <DialogTitle id="overwrite-title">
            Replace the {overwrite?.slot === 'baseline' ? 'Baseline' : 'Modified'}{' '}
            run?
          </DialogTitle>
          <DialogContent>
            <p className="helper-text">
              This test will replace the run already captured in{' '}
              {overwrite?.slot === 'baseline' ? 'Baseline' : 'Modified'}.
              Saved runs in your library are not affected. To keep it, cancel
              and switch “Capture in” to the other slot.
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOverwrite(null)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => {
                const kind = overwrite!.kind
                setOverwrite(null)
                void test(kind)
              }}
            >
              Replace and test
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </ThemeProvider>
  )
}
