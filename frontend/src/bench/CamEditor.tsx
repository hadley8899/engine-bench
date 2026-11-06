import { Button, FormControlLabel, MenuItem, Switch, TextField } from '@mui/material'
import type { CamSwitch, Cams, EngineDefinition, ValveEvent } from '../sim/schema'
import {
  camSwitchSchema,
  exhaustEventSchema,
  flatMaps,
  intakeEventSchema,
} from '../sim/schema'
import {
  camsFromEvents,
  clearanceRatio,
  effectiveValveRelief,
  floatFactor,
  overlap,
  valveEvents,
} from '../sim/cams'
import { VALVE_SPRINGS } from '../sim/parts'
import { NumberField } from './NumberField'
import { applyCamGrade, camGrades, matchCamGrade } from './partCatalogue'

type Update = (update: (current: EngineDefinition) => EngineDefinition) => void

const legacyFields: {
  key: keyof CamSwitch
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
}[] = [
  { key: 'rpm', label: 'Switch speed', unit: 'RPM', scale: 1, min: 1000, max: 15000, step: 100 },
  { key: 'intakeArea', label: 'High-cam intake area', unit: 'mm²', scale: 1e6, min: 10, max: 20000, step: 10 },
  { key: 'exhaustArea', label: 'High-cam exhaust area', unit: 'mm²', scale: 1e6, min: 10, max: 25000, step: 10 },
  { key: 'intakeClose', label: 'High-cam intake closes', unit: '°', scale: 1, min: 550, max: 630, step: 1 },
]

/**
 * Valve events shown the way cam cards quote them: intake opening before
 * and closing after the nearest dead centre, exhaust likewise.
 */
const eventFields = (
  intake: boolean,
): {
  key: keyof ValveEvent
  label: string
  unit: string
  show: (v: number) => number
  store: (v: number) => number
}[] => [
    intake
      ? { key: 'open', label: 'Opens', unit: '° BTDC', show: (v: number) => 360 - v, store: (v: number) => 360 - v }
      : { key: 'open', label: 'Opens', unit: '° BBDC', show: (v: number) => 180 - v, store: (v: number) => 180 - v },
    intake
      ? { key: 'close', label: 'Closes', unit: '° ABDC', show: (v: number) => v - 540, store: (v: number) => v + 540 }
      : { key: 'close', label: 'Closes', unit: '° ATDC', show: (v: number) => v - 360, store: (v: number) => v + 360 },
    { key: 'lift', label: 'Lift', unit: 'mm', show: (v: number) => v * 1000, store: (v: number) => v / 1000 },
  ]

function EventEditor({
  title,
  intake,
  value,
  disabled,
  onChange,
}: {
  title: string
  intake: boolean
  value: ValveEvent
  disabled?: boolean
  onChange: (v: ValveEvent) => void
}) {
  const schema = intake ? intakeEventSchema : exhaustEventSchema
  return (
    <>
      {eventFields(intake).map((f) => (
        <NumberField
          key={f.key}
          size="small"
          label={`${title} ${f.label.toLowerCase()} (${f.unit})`}
          error={!schema.shape[f.key].safeParse(value[f.key]).success}
          value={Math.round(f.show(value[f.key]) * 10) / 10}
          disabled={disabled}
          slotProps={{ htmlInput: { step: f.key === 'lift' ? 0.1 : 1 } }}
          onValueChange={(n) => onChange({ ...value, [f.key]: f.store(n) })}
        />
      ))}
    </>
  )
}

/** Intake and exhaust duration, centrelines, separation and overlap. */
function describe(cams: Pick<Cams, 'intake' | 'exhaust'>) {
  const iCentre = (cams.intake.open + cams.intake.close) / 2 - 360
  const eCentre = 360 - (cams.exhaust.open + cams.exhaust.close) / 2
  return `Duration ${Math.round(cams.intake.close - cams.intake.open)}° intake, ${Math.round(cams.exhaust.close - cams.exhaust.open)}° exhaust · centrelines ${Math.round(iCentre)}° ATDC and ${Math.round(eCentre)}° BTDC · lobe separation ${Math.round((iCentre + eCentre) / 2)}° · overlap ${Math.round(Math.max(0, cams.exhaust.close - cams.intake.open))}°`
}

const motionOptions = [
  ['legacy', 'Legacy half-sine'],
  ['gentle', 'Gentle polynomial'],
  ['performance', 'Performance polynomial'],
  ['race', 'Race polynomial'],
] as const

function MotionSelect({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: Update
  disabled?: boolean
}) {
  return (
    <TextField
      select
      size="small"
      label="Valve motion"
      value={engine.camMotion}
      disabled={disabled}
      helperText={
        engine.camMotion === 'legacy'
          ? 'Compatibility curve: no seating ramp and non-zero opening velocity.'
          : 'Polynomial seating ramps start and finish at zero velocity and acceleration.'
      }
      onChange={(event) =>
        onChange((current) => ({
          ...current,
          camMotion: event.target.value as EngineDefinition['camMotion'],
        }))
      }
    >
      {motionOptions.map(([value, label]) => (
        <MenuItem key={value} value={value}>
          {label}
        </MenuItem>
      ))}
    </TextField>
  )
}

function ReliefField({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: Update
  disabled?: boolean
}) {
  return (
    <NumberField
      size="small"
      label="Effective valve relief (mm)"
      value={Math.round(effectiveValveRelief(engine) * 10000) / 10}
      disabled={disabled}
      error={
        engine.valveRelief !== null &&
        !(engine.valveRelief >= 0.0005 && engine.valveRelief <= 0.02)
      }
      helperText={
        engine.valveRelief === null
          ? 'Legacy half-clearance estimate; edit to store this engine’s room.'
          : 'Effective room at overlap TDC, including piston pockets.'
      }
      slotProps={{ htmlInput: { min: 0.5, max: 20, step: 0.1 } }}
      onValueChange={(value) =>
        onChange((current) => ({ ...current, valveRelief: value / 1000 }))
      }
    />
  )
}

/**
 * Camshafts: fixed events with an optional two-stage switch (as before
 * model 1.13.0), or full cam profiles with lift, a high-lift profile and
 * continuous phasers driven by the cam maps.
 */
export function CamEditor({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: Update
  disabled?: boolean
}) {
  const cams = engine.cams
  if (!cams) return <LegacyCam engine={engine} onChange={onChange} disabled={disabled} />
  const setCams = (fn: (c: Cams) => Cams) =>
    onChange((e) => (e.cams ? { ...e, cams: fn(e.cams) } : e))
  const grade = matchCamGrade(engine)
  const float =
    engine.mechanicalLimit *
    VALVE_SPRINGS[engine.parts.valveSprings].float *
    floatFactor(engine)
  const worstClearance = Math.max(
    clearanceRatio(engine, valveEvents(engine, false, 0, 0)),
    ...(cams.phasers
      ? [
          clearanceRatio(
            engine,
            valveEvents(engine, false, cams.phasers.intakeRange, -cams.phasers.exhaustRange),
          ),
        ]
      : []),
    ...(cams.high ? [clearanceRatio(engine, valveEvents(engine, true, 0, 0))] : []),
  )
  return (
    <div className="induction-editor" data-testid="cam-editor">
      <TextField
        select
        size="small"
        label="Camshafts"
        value={grade < 0 ? 'custom' : String(grade)}
        disabled={disabled}
        helperText={
          grade < 0
            ? 'Custom profiles. Fitting a grade keeps each cam’s centreline.'
            : camGrades[grade].note
        }
        onChange={(e) => {
          const g = camGrades[Number(e.target.value)]
          if (g) onChange((current) => applyCamGrade(current, g))
        }}
      >
        {grade < 0 && <MenuItem value="custom">Custom</MenuItem>}
        {camGrades.map((g, i) => (
          <MenuItem key={g.label} value={String(i)}>
            {g.label}
          </MenuItem>
        ))}
      </TextField>
      <MotionSelect engine={engine} onChange={onChange} disabled={disabled} />
      <ReliefField engine={engine} onChange={onChange} disabled={disabled} />
      <div className="field-grid">
        <EventEditor
          title="Intake"
          intake
          value={cams.intake}
          disabled={disabled}
          onChange={(intake) => setCams((c) => ({ ...c, intake }))}
        />
        <EventEditor
          title="Exhaust"
          intake={false}
          value={cams.exhaust}
          disabled={disabled}
          onChange={(exhaust) => setCams((c) => ({ ...c, exhaust }))}
        />
      </div>
      <p className="cranking-note" data-testid="cam-summary">
        {describe(cams)}. Valves float from about{' '}
        {Math.round(float / 10) * 10} RPM with these springs; the valves use{' '}
        {Math.round(worstClearance * 100)}% of the room above the piston at
        worst{worstClearance >= 1 ? ' — they will hit it' : ''}.
      </p>
      <FormControlLabel
        control={
          <Switch
            checked={!!cams.high}
            disabled={disabled}
            onChange={(e) =>
              onChange((current) =>
                current.cams
                  ? {
                      ...current,
                      cams: {
                        ...current.cams,
                        high: e.target.checked
                          ? {
                              rpm: Math.round((current.revLimit * 0.65) / 100) * 100,
                              intake: {
                                open: Math.max(300, current.cams.intake.open - 10),
                                close: Math.min(660, current.cams.intake.close + 20),
                                lift: Math.min(0.02, current.cams.intake.lift * 1.25),
                              },
                              exhaust: {
                                open: Math.max(80, current.cams.exhaust.open - 15),
                                close: Math.min(430, current.cams.exhaust.close + 10),
                                lift: Math.min(0.02, current.cams.exhaust.lift * 1.2),
                              },
                              intakeArea: current.intakeArea * 1.4,
                              exhaustArea: current.exhaustArea * 1.2,
                            }
                          : null,
                      },
                    }
                  : current,
              )
            }
          />
        }
        label="High-lift profile (VTEC-style switch)"
      />
      {cams.high && (
        <div className="field-grid">
          <NumberField
            size="small"
            label="Switch speed (RPM)"
            value={cams.high.rpm}
            disabled={disabled}
            error={!(cams.high.rpm >= 1000 && cams.high.rpm <= 15000)}
            slotProps={{ htmlInput: { step: 100 } }}
            onValueChange={(rpm) =>
              setCams((c) => (c.high ? { ...c, high: { ...c.high, rpm } } : c))
            }
          />
          <EventEditor
            title="High intake"
            intake
            value={cams.high.intake}
            disabled={disabled}
            onChange={(intake) =>
              setCams((c) => (c.high ? { ...c, high: { ...c.high, intake } } : c))
            }
          />
          <EventEditor
            title="High exhaust"
            intake={false}
            value={cams.high.exhaust}
            disabled={disabled}
            onChange={(exhaust) =>
              setCams((c) => (c.high ? { ...c, high: { ...c.high, exhaust } } : c))
            }
          />
          {(['intakeArea', 'exhaustArea'] as const).map((k) => (
            <NumberField
              key={k}
              size="small"
              label={`High ${k === 'intakeArea' ? 'intake' : 'exhaust'} flow area (mm²)`}
              value={Math.round(cams.high![k] * 1e6)}
              disabled={disabled}
              slotProps={{ htmlInput: { step: 10 } }}
              onValueChange={(n) =>
                setCams((c) => (c.high ? { ...c, high: { ...c.high, [k]: n / 1e6 } } : c))
              }
            />
          ))}
        </div>
      )}
      <FormControlLabel
        control={
          <Switch
            checked={!!cams.phasers}
            disabled={disabled}
            onChange={(e) =>
              onChange((current) => {
                if (!current.cams) return current
                const phasers = e.target.checked
                  ? { intakeRange: 40, exhaustRange: 25, rate: 200 }
                  : null
                const next = { ...current, cams: { ...current.cams, phasers } }
                const maps = current.management ?? (phasers ? flatMaps(next) : null)
                if (!maps) return next
                const zero = maps.load.map(() => maps.rpm.map(() => 0))
                const { intakeCam: _i, exhaustCam: _e, ...rest } = maps
                void _i
                void _e
                return {
                  ...next,
                  management: phasers
                    ? { ...rest, intakeCam: maps.intakeCam ?? zero, exhaustCam: maps.exhaustCam ?? zero }
                    : rest,
                }
              })
            }
          />
        }
        label="Variable cam timing (phasers)"
      />
      {cams.phasers && (
        <div className="field-grid">
          {(
            [
              ['intakeRange', 'Intake phaser range (± °)', 0, 60],
              ['exhaustRange', 'Exhaust phaser range (± °)', 0, 60],
              ['rate', 'Phaser speed (° per second)', 20, 1000],
            ] as const
          ).map(([k, label, min, max]) => (
            <NumberField
              key={k}
              size="small"
              label={label}
              value={cams.phasers![k]}
              disabled={disabled}
              error={!(cams.phasers![k] >= min && cams.phasers![k] <= max)}
              helperText={`${min}–${max}`}
              onValueChange={(n) =>
                setCams((c) =>
                  c.phasers ? { ...c, phasers: { ...c.phasers, [k]: n } } : c,
                )
              }
            />
          ))}
        </div>
      )}
      <p className="cranking-note">
        {cams.phasers
          ? 'The Intake cam and Exhaust cam tabs in Engine maps set the phaser targets by RPM and load (positive advances: the valve opens and closes earlier). Advancing the intake adds overlap and low-speed torque; retarding it helps the top end.'
          : 'Fixed cams. Turn on variable cam timing to phase them with RPM and load.'}{' '}
        Flow follows the selected ramp until the valve curtain reaches its full area (lift
        of about a quarter of the valve diameter). More duration moves torque
        up the rev range; faster motion adds lift area and acceleration, and
        more overlap roughens the idle.
      </p>
      <Button
        size="small"
        disabled={disabled}
        onClick={() =>
          onChange((current) => {
            const maps = current.management
            const rest = maps
              ? (({ intakeCam: _i, exhaustCam: _e, ...r }) => (void _i, void _e, r))(maps)
              : null
            return { ...current, cams: null, management: rest }
          })
        }
      >
        Back to fixed valve events
      </Button>
    </div>
  )
}

/** Builds without cam profiles: fixed events and the 1.12.0 two-stage cam. */
function LegacyCam({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: Update
  disabled?: boolean
}) {
  const cam = engine.camSwitch
  const set = (camSwitch: CamSwitch | null) =>
    onChange((e) => ({ ...e, camSwitch }))
  return (
    <div className="induction-editor" data-testid="cam-editor">
      <p className="cranking-note">
        Fixed valve events: intake from 10° BTDC to the intake closing angle,
        exhaust from 35° BBDC to 10° ATDC (overlap{' '}
        {overlap(valveEvents(engine, false, 0, 0))}°).
      </p>
      <MotionSelect engine={engine} onChange={onChange} disabled={disabled} />
      <ReliefField engine={engine} onChange={onChange} disabled={disabled} />
      <Button
        variant="outlined"
        size="small"
        disabled={disabled}
        data-testid="use-cam-profiles"
        onClick={() =>
          onChange((e) => ({ ...e, cams: camsFromEvents(e), camSwitch: null }))
        }
      >
        Edit cam profiles (lift, overlap, phasing)
      </Button>
      <FormControlLabel
        control={
          <Switch
            checked={!!cam}
            disabled={disabled}
            onChange={(e) =>
              set(
                e.target.checked
                  ? {
                      rpm: Math.round((engine.revLimit * 0.65) / 100) * 100,
                      intakeArea: engine.intakeArea * 1.4,
                      exhaustArea: engine.exhaustArea * 1.2,
                      intakeClose: Math.min(630, engine.intakeClose + 25),
                    }
                  : null,
              )
            }
          />
        }
        label="Two-stage cam (switches to a high-lift profile)"
      />
      {cam && (
        <div className="field-grid">
          {legacyFields.map((f) => (
            <NumberField
              key={f.key}
              size="small"
              label={`${f.label} (${f.unit})`}
              error={!camSwitchSchema.shape[f.key].safeParse(cam[f.key]).success}
              helperText={`${f.min}–${f.max} ${f.unit}`}
              value={Math.round(cam[f.key] * f.scale * 100) / 100}
              disabled={disabled}
              slotProps={{ htmlInput: { min: f.min, max: f.max, step: f.step } }}
              onValueChange={(n) => set({ ...cam, [f.key]: n / f.scale })}
            />
          ))}
        </div>
      )}
      <p className="cranking-note">
        {cam
          ? `Below ${cam.rpm.toLocaleString('en-GB')} RPM the engine uses its own valve areas and intake closing; from there up (dropping back 150 RPM lower) it switches to the high cam. Editing cam profiles converts this exactly.`
          : 'Editing cam profiles converts these events exactly, so nothing changes until you edit them.'}
      </p>
    </div>
  )
}
