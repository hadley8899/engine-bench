import { Button, MenuItem, Stack, TextField } from '@mui/material'
import type { EngineDefinition } from '../sim/schema'
import { defaultPush } from '../sim/push'
import type { PushResult, PushSettings } from '../sim/push'
import { formatLimit } from '../sim/parts'
import { NumberField } from './NumberField'
import './parts.css'

const limitLabels = {
  rodCompression: 'rod compression',
  rodTension: 'rod tension',
  crown: 'piston crown',
  knock: 'piston knock',
  headGasket: 'head gasket',
  valveFloat: 'valve float',
  valveClearance: 'valve clearance',
  turboSpeed: 'turbo speed',
  turbineTemperature: 'turbine inlet',
} as const

/**
 * "Push it": a headless stepped timing or boost ramp at one speed that
 * stops at the first knock or failure.
 */
export function PushPanel({
  engine,
  settings,
  onSettings,
  result,
  busy,
  blocked,
  onRun,
  onStop,
}: {
  engine: EngineDefinition
  settings: PushSettings
  onSettings: (s: PushSettings) => void
  result: PushResult | null
  busy: boolean
  /** Why a push cannot start now, or empty. */
  blocked: string
  onRun: () => void
  onStop: () => void
}) {
  const turbo = engine.induction.kind === 'turbo'
  const timing = settings.variable === 'timing'
  const running = result?.status === 'running'
  const last = result?.steps.at(-1)
  return (
    <div data-testid="push">
      <div className="field-grid">
        <NumberField
          size="small"
          label="Engine speed (RPM)"
          value={settings.rpm}
          disabled={busy}
          slotProps={{ htmlInput: { min: 1000, step: 100 } }}
          onValueChange={(rpm) => onSettings({ ...settings, rpm })}
        />
        <TextField
          select
          size="small"
          label="Raise"
          value={settings.variable}
          disabled={busy}
          helperText={turbo ? '' : 'Boost needs a turbocharger.'}
          onChange={(e) => {
            const variable = e.target.value as PushSettings['variable']
            onSettings({
              ...settings,
              variable,
              step: variable === 'timing' ? defaultPush.step : 10000,
            })
          }}
        >
          <MenuItem value="timing">Spark advance</MenuItem>
          <MenuItem value="boost" disabled={!turbo}>
            Boost
          </MenuItem>
        </TextField>
        <NumberField
          size="small"
          label={timing ? 'Step (° advance)' : 'Step (bar)'}
          value={timing ? settings.step : settings.step / 1e5}
          disabled={busy}
          helperText={timing ? '0.5–5°' : '0.05–0.5 bar'}
          slotProps={{
            htmlInput: { step: timing ? 0.5 : 0.05, min: 0 },
          }}
          onValueChange={(v) =>
            onSettings({ ...settings, step: timing ? v : v * 1e5 })
          }
        />
        <NumberField
          size="small"
          label="Seconds per step"
          value={settings.hold}
          disabled={busy}
          helperText="0.8–4 s"
          slotProps={{ htmlInput: { step: 0.1, min: 0.8, max: 4 } }}
          onValueChange={(hold) => onSettings({ ...settings, hold })}
        />
        <TextField
          select
          size="small"
          label="Stop at"
          value={settings.stopAt}
          disabled={busy}
          onChange={(e) =>
            onSettings({
              ...settings,
              stopAt: e.target.value as PushSettings['stopAt'],
            })
          }
        >
          <MenuItem value="knock">First knock</MenuItem>
          <MenuItem value="failure">A failure</MenuItem>
        </TextField>
      </div>
      <Stack direction="row" spacing={1} mt={2} alignItems="center">
        {running ? (
          <Button variant="outlined" color="warning" onClick={onStop}>
            Stop push
          </Button>
        ) : (
          <Button
            variant="contained"
            color="warning"
            disabled={!!blocked}
            onClick={onRun}
            data-testid="push-run"
          >
            Push it
          </Button>
        )}
        {running && last && (
          <span className="helper-text">
            Step {result.steps.length}:{' '}
            {timing
              ? `+${last.offset.toFixed(1)}°`
              : `+${(last.offset / 1e5).toFixed(2)} bar`}
          </span>
        )}
      </Stack>
      {blocked && !running && <p className="pending-note">{blocked}</p>}
      <p className="helper-text">
        Holds the applied build at full throttle and raises{' '}
        {timing ? 'spark advance' : 'the boost target'} a step at a time,
        calculated silently in a worker. Knock control, parts and
        Indestructible mode apply as on the bench. The engine on the bench is
        untouched.
      </p>
      {result && (
        <>
          <p
            className={
              result.failure ? 'cranking-note warn' : 'cranking-note'
            }
            data-testid="push-result"
          >
            {result.status === 'running'
              ? 'Pushing…'
              : result.status === 'aborted'
                ? `Stopped: ${result.reason}`
                : result.reason}
            {result.failure && (
              <>
                {' '}
                {result.failure.detail} To prevent it:{' '}
                {result.failure.prevent.charAt(0).toLowerCase() +
                  result.failure.prevent.slice(1)}
              </>
            )}
          </p>
          <div className="push-scroll">
            <table className="push-results">
              <thead>
                <tr>
                  <th>{timing ? 'ADVANCE' : 'BOOST TARGET'}</th>
                  <th>TORQUE</th>
                  <th>POWER</th>
                  {!timing && <th>BOOST</th>}
                  <th>KNOCK</th>
                  <th>RETARD</th>
                  <th>WORST STRESS</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((s, i) => {
                  const failed =
                    !!result.failure && i === result.steps.length - 1
                  return (
                    <tr
                      key={i}
                      className={
                        failed ? 'failed' : s.knock > 0.03 ? 'knocked' : ''
                      }
                    >
                      <td>
                        {timing
                          ? `${s.setting.toFixed(1)}° (+${s.offset.toFixed(1)})`
                          : `${(s.setting / 1e5).toFixed(2)} bar`}
                      </td>
                      <td>{s.torque.toFixed(0)} Nm</td>
                      <td>{s.power.toFixed(0)} kW</td>
                      {!timing && <td>{(s.boost / 1e5).toFixed(2)} bar</td>}
                      <td>
                        {s.knock > 0 ? formatLimit('knock', s.knock) : '—'}
                      </td>
                      <td>{s.retard >= 0.5 ? `${s.retard.toFixed(1)}°` : '—'}</td>
                      <td>
                        {Math.round(s.stress * 100)}%
                        {s.limit ? ` ${limitLabels[s.limit]}` : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
