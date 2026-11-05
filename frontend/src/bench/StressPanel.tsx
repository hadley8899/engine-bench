import { Alert, Button, FormControlLabel, Switch } from '@mui/material'
import { formatLimit } from '../sim/parts'
import type { StressTelemetry } from '../sim/parts'
import './parts.css'

/** Above this share of a limit the bar turns amber. */
const NEAR = 0.85

/**
 * Part loads against their estimated limits, the failure that stopped the
 * engine (if any) and the indestructible switch.
 */
export function StressPanel({
  stress,
  indestructible,
  onIndestructible,
  onRebuild,
  rebuildDisabled,
}: {
  stress: StressTelemetry
  indestructible: boolean
  onIndestructible: (value: boolean) => void
  onRebuild: () => void
  rebuildDisabled?: boolean
}) {
  const failure = stress.failure
  return (
    <div className="stress-strip" data-testid="stress">
      <div className="knock-head">
        <small>PART STRESS · ESTIMATED LIMITS</small>
        <FormControlLabel
          className="stress-switch"
          control={
            <Switch
              size="small"
              checked={indestructible}
              onChange={(e) => onIndestructible(e.target.checked)}
            />
          }
          label="Indestructible"
        />
      </div>
      {failure && (
        <Alert
          severity="error"
          className="failure-alert"
          data-testid="failure"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={rebuildDisabled}
              onClick={onRebuild}
            >
              Rebuild
            </Button>
          }
        >
          <strong>{failure.title}</strong>
          {failure.cylinder ? ` · cylinder ${failure.cylinder}` : ''}
          <div>{failure.detail}</div>
          <div className="failure-prevent" data-testid="failure-prevent">
            <strong>To prevent it:</strong> {failure.prevent}
          </div>
          <div className="failure-note">
            The engine stopped. Rebuild restores your last build with new
            parts; Start does the same.
          </div>
        </Alert>
      )}
      <div className="stress-limits">
        {stress.limits.map((l) => {
          const state =
            l.ratio >= 1 ? 'over' : l.ratio >= NEAR ? 'near' : 'safe'
          return (
            <div
              key={l.key}
              className={`stress-limit ${state}${failure?.key === l.key ? ' failed' : ''}`}
              data-testid={`stress-${l.key}`}
              title={`${l.label}${l.cylinder ? `, worst cylinder ${l.cylinder}` : ''}: ${formatLimit(l.key, l.value)} against an estimated limit of ${formatLimit(l.key, l.limit)}.${l.exposure > 0 ? ` Overload ${Math.round(l.exposure * 100)}% of the way to failure.` : ''}`}
            >
              <span className="stress-label">{l.label}</span>
              <span className="knock-bar" aria-hidden>
                <span style={{ width: `${Math.min(1, l.ratio) * 100}%` }} />
              </span>
              <span className="knock-value">
                {Math.round(l.ratio * 100)}%
                {l.exposure > 0.02 && (
                  <b> ▲{Math.round(l.exposure * 100)}</b>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="stress-note">
        Share of each part’s estimated limit, worst cylinder. Past 100% a part
        accumulates overload (▲) and fails if it stays there.
        {indestructible
          ? ' Indestructible: parts are stressed but cannot fail.'
          : ''}
      </p>
    </div>
  )
}
