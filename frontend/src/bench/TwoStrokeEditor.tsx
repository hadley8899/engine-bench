import { Button, FormControlLabel, MenuItem, Switch, TextField } from '@mui/material'
import { pipeSegments, validateEngine } from '../sim/schema'
import type { EngineDefinition, TwoStroke, TwoStrokePipe } from '../sim/schema'
import { portTiming, SCAVENGING, TUNED_SCAVENGING } from '../sim/twostroke'
import { NumberField } from './NumberField'
import { intakeLabels, pipeLabels, setIntakeKind } from './twoStrokeFields'
import type { TwoStrokeIntakeKind } from '../sim/schema'

type Update = (update: (e: EngineDefinition) => EngineDefinition) => void
type Chamber = Extract<TwoStrokePipe, { kind: 'chamber' }>

/** A metric field: shown in `unit` (value × scale), stored in SI. */
function Field({
  label,
  unit,
  value,
  scale = 1000,
  min,
  max,
  step,
  help,
  disabled,
  onValue,
}: {
  label: string
  unit: string
  value: number
  scale?: number
  min: number
  max: number
  step: number
  help: string
  disabled?: boolean
  onValue: (v: number) => void
}) {
  const outside = !(value * scale >= min - 1e-9 && value * scale <= max + 1e-9)
  return (
    <NumberField
      size="small"
      label={`${label} (${unit})`}
      title={help}
      disabled={disabled}
      error={outside}
      helperText={`${min}–${max} ${unit}`}
      value={value * scale}
      slotProps={{ htmlInput: { min, max, step } }}
      onValueChange={(v) => onValue(v / scale)}
    />
  )
}

const deg = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}°`)
/** Blair's specific time-area, s·mm²/cm³ ×10⁴ for readable numbers. */
const timeArea = (v: number | null) => (v === null ? '—' : (v * 1e4).toFixed(2))

/** Exhaust, transfer and intake windows across one revolution. */
function TimingDiagram({ engine }: { engine: EngineDefinition }) {
  const t = portTiming(engine)
  const x = (d: number) => (d / 360) * 300
  const bar = (from: number, to: number, y: number, colour: string, label: string) => (
    <g>
      <rect x={x(from)} y={y} width={x(to - from)} height={10} rx={2} fill={colour} opacity={0.85} />
      <text x={x(from) + 3} y={y + 8.5} fontSize={8} fill="#0d1418">
        {label}
      </text>
    </g>
  )
  const intake =
    t.intakeOpen !== null && t.intakeClose !== null ? (
      <>
        {bar(360 - t.intakeOpen, 360, 36, '#3be0b0', 'Intake')}
        {bar(0, t.intakeClose, 36, '#3be0b0', '')}
      </>
    ) : (
      <text x={2} y={44} fontSize={8} fill="#9fb3bd">
        Reed: opens on crankcase depression
      </text>
    )
  return (
    <svg className="port-diagram" viewBox="0 0 300 62" role="img" aria-label="Port timing across one revolution">
      {bar(t.exhaustOpen, 360 - t.exhaustOpen, 6, '#ff6b3d', `Exhaust ${t.exhaustDuration.toFixed(0)}°`)}
      {bar(t.transferOpen, 360 - t.transferOpen, 21, '#2fb8ff', `Transfer ${t.transferDuration.toFixed(0)}°`)}
      {intake}
      {[0, 90, 180, 270, 360].map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={2} y2={50} stroke="#4a5b63" strokeWidth={0.5} />
          <text x={Math.min(x(d), 286)} y={60} fontSize={7} fill="#9fb3bd">
            {d === 0 ? 'TDC' : d === 180 ? 'BDC' : `${d}°`}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** The pipe's profile from the port (left) to the outlet, to scale. */
function PipeProfile({ pipe }: { pipe: TwoStrokePipe }) {
  const segments = pipeSegments(pipe)
  const total = segments.reduce((s, g) => s + g.length, 0)
  const widest = Math.max(...segments.map((g) => Math.max(g.start, g.end)))
  const w = 300
  const h = Math.max(24, Math.min(80, (widest / total) * w * 1.1))
  const sx = w / total
  const sy = (h - 4) / widest
  let at = 0
  const top: string[] = []
  const bottom: string[] = []
  for (const g of segments) {
    top.push(`${at * sx},${h / 2 - (g.start * sy) / 2}`, `${(at + g.length) * sx},${h / 2 - (g.end * sy) / 2}`)
    bottom.push(`${at * sx},${h / 2 + (g.start * sy) / 2}`, `${(at + g.length) * sx},${h / 2 + (g.end * sy) / 2}`)
    at += g.length
  }
  return (
    <svg className="pipe-profile" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${pipeLabels[pipe.kind]} profile, ${(total * 1000).toFixed(0)} mm long`}>
      <polygon points={[...top, ...bottom.reverse()].join(' ')} fill="#5c6c74" stroke="#c3ced3" strokeWidth={0.8} />
    </svg>
  )
}

/**
 * Two-stroke ports, intake control, crankcase, power valve and exhaust
 * pipe, with the port timing and time-areas derived from them.
 */
export function TwoStrokeEditor({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: Update
  disabled?: boolean
}) {
  const t = engine.twoStroke
  if (!t) return null
  const set = (patch: (t: TwoStroke) => TwoStroke) =>
    onChange((e) => ({ ...e, twoStroke: patch(e.twoStroke!) }))
  let problem = ''
  let timing: ReturnType<typeof portTiming> | null = null
  try {
    validateEngine(engine)
    timing = portTiming(engine)
  } catch (err) {
    problem = err instanceof Error && !('issues' in err) ? err.message : 'Check the highlighted values.'
  }
  const stroke = engine.stroke * 1000
  const bore = engine.bore * 1000
  const pipe = t.pipe
  const setChamber = (patch: (p: Chamber) => Chamber) =>
    set((x) => ({ ...x, pipe: patch(x.pipe as Chamber) }))
  const scavenging = t.chargingModel === 'tuned'
    ? TUNED_SCAVENGING
    : SCAVENGING[t.transfers.count]
  return (
    <div className="two-stroke-editor" data-testid="two-stroke-editor">
      {problem && (
        <p className="cranking-note warn" role="alert">
          {problem}
        </p>
      )}
      {timing && (
        <>
          <TimingDiagram engine={engine} />
          <dl className="port-timing" data-testid="port-timing">
            <div>
              <dt>Exhaust opens</dt>
              <dd>
                {deg(timing.exhaustOpen)} ATDC · {deg(timing.exhaustDuration)}
              </dd>
            </div>
            <div>
              <dt>Transfers open</dt>
              <dd>
                {deg(timing.transferOpen)} ATDC · {deg(timing.transferDuration)}
              </dd>
            </div>
            <div>
              <dt>Blowdown</dt>
              <dd>{deg(timing.blowdown)}</dd>
            </div>
            <div>
              <dt>Intake</dt>
              <dd>
                {timing.intakeDuration === null
                  ? 'Reed: by depression'
                  : `${deg(timing.intakeOpen)} BTDC to ${deg(timing.intakeClose)} ATDC · ${deg(timing.intakeDuration)}`}
              </dd>
            </div>
            <div>
              <dt>Compression</dt>
              <dd>
                {timing.trappedCompression.toFixed(1)}:1 trapped · {timing.geometricCompression.toFixed(1)}:1 full stroke
              </dd>
            </div>
            <div title="Blair's specific time-area at the electronic limiter: open area over time, per unit of swept volume (×10⁻⁴ s·m²/m³).">
              <dt>Time-area at {timing.rpm.toLocaleString('en-GB')} RPM</dt>
              <dd>
                blowdown {timeArea(timing.blowdownTimeArea)} · exhaust {timeArea(timing.exhaustTimeArea)} · transfer {timeArea(timing.transferTimeArea)}
                {timing.intakeTimeArea !== null && ` · intake ${timeArea(timing.intakeTimeArea)}`}
              </dd>
            </div>
            {timing.tunedRpm !== null && (
              <div title="Jennings's round-trip rule: the wave reflected from the middle of the baffle returns while the exhaust is open. An estimate; the simulated peak can differ.">
                <dt>Pipe tuned near</dt>
                <dd data-testid="tuned-rpm">
                  {Math.round(timing.tunedRpm / 50) * 50} RPM ({(timing.tunedLength! * 1000).toFixed(0)} mm to mid-baffle)
                </dd>
              </div>
            )}
          </dl>
        </>
      )}
      <h3>Exhaust port</h3>
      <div className="field-grid">
        <Field label="Top edge below deck" unit="mm" value={t.exhaustPort.height} min={Math.round(0.25 * stroke)} max={Math.round(stroke - 4)} step={0.1} disabled={disabled} help="Lower numbers (a higher port) open earlier: more blowdown and a higher, narrower power band." onValue={(v) => set((x) => ({ ...x, exhaustPort: { ...x.exhaustPort, height: v } }))} />
        <Field label="Width" unit="mm" value={t.exhaustPort.width} min={5} max={Math.floor(bore * (t.exhaustPort.bridge ? 1.05 : 0.75))} step={0.5} disabled={disabled} help="Chordal width. More than 0.75 × bore needs a bridge so the rings do not snag." onValue={(v) => set((x) => ({ ...x, exhaustPort: { ...x.exhaustPort, width: v } }))} />
        <Field label="Auxiliary width" unit="mm" value={t.exhaustPort.auxiliaryWidth} min={0} max={Math.max(0, Math.floor(bore * 1.6 - t.exhaustPort.width * 1000))} step={0.5} disabled={disabled} help="Total effective width of the auxiliary exhaust windows. They add early blowdown area without widening the main ring-crossing window." onValue={(v) => set((x) => ({ ...x, exhaustPort: { ...x.exhaustPort, auxiliaryWidth: v } }))} />
      </div>
      <FormControlLabel
        control={<Switch checked={t.exhaustPort.bridge} disabled={disabled} onChange={(_, v) => set((x) => ({ ...x, exhaustPort: { ...x.exhaustPort, bridge: v } }))} />}
        label="Bridged port (wider, the bridge blocks a tenth)"
      />
      <h3>Transfer ports</h3>
      <div className="field-grid">
        <TextField select size="small" label="Charging model" value={t.chargingModel} disabled={disabled} helperText={t.chargingModel === 'tuned' ? 'Balanced pipe · directed loop scavenging · roller-bearing friction' : 'Original 1.14 model for saved-build compatibility'} onChange={(e) => set((x) => ({ ...x, chargingModel: e.target.value as 'legacy' | 'tuned' }))}>
          <MenuItem value="legacy">Legacy</MenuItem>
          <MenuItem value="tuned">Tuned racing</MenuItem>
        </TextField>
        <TextField select size="small" label="Transfer ports" value={t.transfers.count} disabled={disabled} helperText={`Scavenging estimate: ${Math.round(scavenging.shortCircuit * 100)}% short-circuits`} onChange={(e) => set((x) => ({ ...x, transfers: { ...x.transfers, count: Number(e.target.value) as 2 | 3 | 5 } }))}>
          <MenuItem value={2}>2 (simple loop)</MenuItem>
          <MenuItem value={3}>3 (with boost port)</MenuItem>
          <MenuItem value={5}>5 (racing)</MenuItem>
        </TextField>
        <Field label="Top edge below deck" unit="mm" value={t.transfers.height} min={5} max={Math.round(stroke - 3)} step={0.1} disabled={disabled} help="Must sit below the exhaust port so the cylinder blows down before fresh charge enters." onValue={(v) => set((x) => ({ ...x, transfers: { ...x.transfers, height: v } }))} />
        <Field label="Total width" unit="mm" value={t.transfers.width} min={5} max={Math.floor(bore * 1.6)} step={0.5} disabled={disabled} help="All transfer ports together." onValue={(v) => set((x) => ({ ...x, transfers: { ...x.transfers, width: v } }))} />
      </div>
      <h3>Intake and crankcase</h3>
      <div className="field-grid">
        <TextField select size="small" label="Intake control" value={t.intake.kind} disabled={disabled} onChange={(e) => onChange((d) => setIntakeKind(d, e.target.value as TwoStrokeIntakeKind))}>
          {(Object.keys(intakeLabels) as TwoStrokeIntakeKind[]).map((k) => (
            <MenuItem key={k} value={k}>
              {intakeLabels[k]}
            </MenuItem>
          ))}
        </TextField>
        {t.intake.kind === 'piston' && (
          <>
            <Field label="Port edge above skirt at BDC" unit="mm" value={t.intake.height} min={2} max={Math.floor(0.9 * stroke)} step={0.1} disabled={disabled} help="The skirt uncovers the port near top dead centre: a lower edge opens it longer. Timing is symmetric, so charge can spit back at low speed." onValue={(v) => set((x) => ({ ...x, intake: { ...(x.intake as Extract<typeof x.intake, { kind: 'piston' }>), height: v } }))} />
            <Field label="Width" unit="mm" value={t.intake.width} min={5} max={Math.floor(0.75 * bore)} step={0.5} disabled={disabled} help="Intake port width." onValue={(v) => set((x) => ({ ...x, intake: { ...(x.intake as Extract<typeof x.intake, { kind: 'piston' }>), width: v } }))} />
          </>
        )}
        {t.intake.kind === 'reed' && (
          <>
            <Field label="Flow area, open" unit="mm²" scale={1e6} value={t.intake.area} min={50} max={20000} step={10} disabled={disabled} help="Effective area with the petals fully open." onValue={(v) => set((x) => ({ ...x, intake: { ...(x.intake as Extract<typeof x.intake, { kind: 'reed' }>), area: v } }))} />
            <Field label="Petal stiffness" unit="Hz" scale={1} value={t.intake.stiffness} min={150} max={1500} step={10} disabled={disabled} help="Natural frequency: stiff petals follow high speeds but need more depression to open." onValue={(v) => set((x) => ({ ...x, intake: { ...(x.intake as Extract<typeof x.intake, { kind: 'reed' }>), stiffness: v } }))} />
          </>
        )}
        {t.intake.kind === 'rotary' && (
          <>
            <Field label="Opens" unit="° BTDC" scale={1} value={t.intake.open} min={90} max={180} step={1} disabled={disabled} help="The disc's cut-out uncovers the port." onValue={(v) => set((x) => ({ ...x, intake: { ...(x.intake as Extract<typeof x.intake, { kind: 'rotary' }>), open: v } }))} />
            <Field label="Closes" unit="° ATDC" scale={1} value={t.intake.close} min={20} max={110} step={1} disabled={disabled} help="Closing early stops spit-back; late closing fills at high speed." onValue={(v) => set((x) => ({ ...x, intake: { ...(x.intake as Extract<typeof x.intake, { kind: 'rotary' }>), close: v } }))} />
            <Field label="Flow area, open" unit="mm²" scale={1e6} value={t.intake.area} min={50} max={20000} step={10} disabled={disabled} help="Effective port area." onValue={(v) => set((x) => ({ ...x, intake: { ...(x.intake as Extract<typeof x.intake, { kind: 'rotary' }>), area: v } }))} />
          </>
        )}
        <Field label="Crankcase compression" unit=":1" scale={1} value={t.crankcaseCompression} min={1.15} max={1.9} step={0.01} disabled={disabled} help="Primary compression: crankcase volume at top dead centre over bottom dead centre. Higher pumps harder at low speed." onValue={(v) => set((x) => ({ ...x, crankcaseCompression: v }))} />
        {engine.cylinders === 2 && (
          <TextField select size="small" label="Crank" value={t.crankPhase} disabled={disabled} helperText="180°: alternate firing; 360°: both together" onChange={(e) => set((x) => ({ ...x, crankPhase: Number(e.target.value) as 180 | 360 }))}>
            <MenuItem value={180}>180°</MenuItem>
            <MenuItem value={360}>360°</MenuItem>
          </TextField>
        )}
      </div>
      <h3>Power valve</h3>
      <FormControlLabel
        control={<Switch checked={!!t.powerValve} disabled={disabled} onChange={(_, v) => set((x) => ({ ...x, powerValve: v ? { rpm: Math.round(engine.revLimit * 0.65 / 100) * 100, drop: Math.round(engine.stroke * 0.07 * 10000) / 10000 } : null }))} />}
        label="Exhaust power valve"
      />
      {t.powerValve && (
        <div className="field-grid">
          <Field label="Opens from" unit="RPM" scale={1} value={t.powerValve.rpm} min={2000} max={15000} step={100} disabled={disabled} help="Below this the valve lowers the port's top edge; it opens fully over the next 1,000 RPM." onValue={(v) => set((x) => ({ ...x, powerValve: { ...x.powerValve!, rpm: Math.round(v) } }))} />
          <Field label="Lowers the port by" unit="mm" value={t.powerValve.drop} min={1} max={20} step={0.1} disabled={disabled} help="A later exhaust opening at low speed: more trapped charge and a wider spread." onValue={(v) => set((x) => ({ ...x, powerValve: { ...x.powerValve!, drop: v } }))} />
        </div>
      )}
      <h3>Exhaust pipe</h3>
      <TextField
        select
        size="small"
        fullWidth
        label="Pipe"
        value={pipe.kind}
        disabled={disabled}
        onChange={(e) =>
          set((x) => ({
            ...x,
            pipe:
              e.target.value === 'straight'
                ? { kind: 'straight', length: 0.6, diameter: Math.max(0.01, Math.min(0.15, 0.75 * engine.bore)) }
                : {
                    kind: 'chamber',
                    header: { length: 0.11, diameter: 0.75 * engine.bore },
                    diffuser: [
                      { length: 0.13, diameter: 1.1 * engine.bore },
                      { length: 0.14, diameter: 1.6 * engine.bore },
                      { length: 0.1, diameter: 2.05 * engine.bore },
                    ],
                    belly: { length: 0.12 },
                    baffle: [{ length: 0.18, diameter: 0.45 * engine.bore }],
                    stinger: { length: 0.2, diameter: 0.4 * engine.bore },
                  },
          }))
        }
      >
        <MenuItem value="straight">{pipeLabels.straight}</MenuItem>
        <MenuItem value="chamber">{pipeLabels.chamber}</MenuItem>
      </TextField>
      <PipeProfile pipe={pipe} />
      {pipe.kind === 'straight' ? (
        <div className="field-grid">
          <Field label="Length" unit="mm" value={pipe.length} min={100} max={3000} step={10} disabled={disabled} help="Its open end returns the blowdown pulse as suction after a round trip." onValue={(v) => set((x) => ({ ...x, pipe: { ...(x.pipe as Extract<TwoStrokePipe, { kind: 'straight' }>), length: v } }))} />
          <Field label="Diameter" unit="mm" value={pipe.diameter} min={10} max={150} step={0.5} disabled={disabled} help="Pipe bore." onValue={(v) => set((x) => ({ ...x, pipe: { ...(x.pipe as Extract<TwoStrokePipe, { kind: 'straight' }>), diameter: v } }))} />
        </div>
      ) : (
        <div className="chamber-fields">
          <div className="field-grid">
            <Field label="Header length" unit="mm" value={pipe.header.length} min={20} max={800} step={5} disabled={disabled} help="Parallel pipe from the port." onValue={(v) => setChamber((p) => ({ ...p, header: { ...p.header, length: v } }))} />
            <Field label="Header diameter" unit="mm" value={pipe.header.diameter} min={8} max={250} step={0.5} disabled={disabled} help="Usually close to the port's area." onValue={(v) => setChamber((p) => ({ ...p, header: { ...p.header, diameter: v } }))} />
          </div>
          {pipe.diffuser.map((cone, k) => (
            <div className="field-grid" key={`d${k}`}>
              <Field label={`Diffuser cone ${k + 1} length`} unit="mm" value={cone.length} min={10} max={800} step={5} disabled={disabled} help="Diverging cones return the blowdown pulse as suction that helps empty the cylinder." onValue={(v) => setChamber((p) => ({ ...p, diffuser: p.diffuser.map((c, j) => (j === k ? { ...c, length: v } : c)) }))} />
              <Field label={`Diffuser cone ${k + 1} end diameter`} unit="mm" value={cone.diameter} min={8} max={250} step={0.5} disabled={disabled} help="Each cone must end wider than it starts." onValue={(v) => setChamber((p) => ({ ...p, diffuser: p.diffuser.map((c, j) => (j === k ? { ...c, diameter: v } : c)) }))} />
            </div>
          ))}
          <div className="chamber-buttons">
            <Button size="small" disabled={disabled || pipe.diffuser.length >= 3} onClick={() => setChamber((p) => ({ ...p, diffuser: [...p.diffuser, { length: 0.08, diameter: p.diffuser.at(-1)!.diameter * 1.2 }] }))}>
              Add diffuser cone
            </Button>
            <Button size="small" disabled={disabled || pipe.diffuser.length <= 1} onClick={() => setChamber((p) => ({ ...p, diffuser: p.diffuser.slice(0, -1) }))}>
              Remove diffuser cone
            </Button>
          </div>
          <div className="field-grid">
            <Field label="Belly length" unit="mm" value={pipe.belly.length} min={0} max={800} step={5} disabled={disabled} help="Parallel middle section at the widest diameter." onValue={(v) => setChamber((p) => ({ ...p, belly: { length: v } }))} />
          </div>
          {pipe.baffle.map((cone, k) => (
            <div className="field-grid" key={`b${k}`}>
              <Field label={`Baffle cone ${k + 1} length`} unit="mm" value={cone.length} min={10} max={800} step={5} disabled={disabled} help="Converging cones reflect a pressure pulse that pushes escaping charge back before the port closes." onValue={(v) => setChamber((p) => ({ ...p, baffle: p.baffle.map((c, j) => (j === k ? { ...c, length: v } : c)) }))} />
              <Field label={`Baffle cone ${k + 1} end diameter`} unit="mm" value={cone.diameter} min={8} max={250} step={0.5} disabled={disabled} help="Each cone must end narrower than it starts." onValue={(v) => setChamber((p) => ({ ...p, baffle: p.baffle.map((c, j) => (j === k ? { ...c, diameter: v } : c)) }))} />
            </div>
          ))}
          <div className="chamber-buttons">
            <Button size="small" disabled={disabled || pipe.baffle.length >= 2} onClick={() => setChamber((p) => ({ ...p, baffle: [...p.baffle, { length: 0.06, diameter: Math.max(0.008, p.baffle.at(-1)!.diameter * 0.8) }] }))}>
              Add baffle cone
            </Button>
            <Button size="small" disabled={disabled || pipe.baffle.length <= 1} onClick={() => setChamber((p) => ({ ...p, baffle: p.baffle.slice(0, -1) }))}>
              Remove baffle cone
            </Button>
          </div>
          <div className="field-grid">
            <Field label="Stinger length" unit="mm" value={pipe.stinger.length} min={30} max={800} step={5} disabled={disabled} help="The outlet restriction: it holds the chamber's mean pressure and heat." onValue={(v) => setChamber((p) => ({ ...p, stinger: { ...p.stinger, length: v } }))} />
            <Field label="Stinger diameter" unit="mm" value={pipe.stinger.diameter} min={8} max={250} step={0.5} disabled={disabled} help="Narrower raises back pressure and the pipe's temperature." onValue={(v) => setChamber((p) => ({ ...p, stinger: { ...p.stinger, diameter: v } }))} />
          </div>
        </div>
      )}
      <p className="cranking-note">
        Pressure waves in the pipe are simulated (one-dimensional gas dynamics), so its length and cones set where the engine pulls. The silencer, catalyst and tailpipe in Exhaust and limiter shape the sound only. Scavenging, port flow and the pipe are estimates, not a substitute for a dyno.
      </p>
    </div>
  )
}
