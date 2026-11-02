import { Chip, Stack } from '@mui/material'
import type { Run } from '../sim/schema'
import { NumberField } from './NumberField'
import { formatFixed, fromKw, fromNm } from './units'
import type { PowerUnit, TorqueUnit } from './units'
import { bandPower, knockSummary, peaks } from './pullStats'

const signed = (value: number, digits: number) =>
  `${value > 0 ? '+' : ''}${formatFixed(value, digits)}`

/** Peaks, the change against Baseline and mean power over an RPM band. */
export function PullSummary({
  run,
  baseline,
  power,
  torque,
  band,
  onBand,
}: {
  run: Run
  baseline: Run | null
  power: PowerUnit
  torque: TorqueUnit
  band: [number, number]
  onBand: (band: [number, number]) => void
}) {
  const p = peaks(run)
  const compare = baseline && baseline !== run && baseline.id !== run.id ? baseline : null
  const b = compare ? peaks(compare) : null
  const mean = bandPower(run, band)
  const baseMean = compare ? bandPower(compare, band) : null
  const knock = knockSummary(run)
  return (
    <div className="run-summary" data-testid="run-summary">
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip
          size="small"
          color={run.status === 'complete' ? 'success' : 'warning'}
          label={run.status.toUpperCase()}
        />
        <span className="summary-meta">
          {run.samples.length} points · {run.procedure.kind}
        </span>
      </Stack>
      {p && (
        <>
          <strong>
            {formatFixed(fromKw(p.power.power, power), 1)} {power}{' '}
            <small>@ {Math.round(p.power.rpm)} RPM</small>
            {b && (
              <em className={p.power.power >= b.power.power ? 'gain' : 'loss'}>
                {signed(fromKw(p.power.power - b.power.power, power), 1)} vs Baseline
              </em>
            )}
          </strong>
          <strong>
            {formatFixed(fromNm(p.torque.torque, torque), 1)} {torque}{' '}
            <small>@ {Math.round(p.torque.rpm)} RPM</small>
            {b && (
              <em className={p.torque.torque >= b.torque.torque ? 'gain' : 'loss'}>
                {signed(fromNm(p.torque.torque - b.torque.torque, torque), 1)} vs Baseline
              </em>
            )}
          </strong>
        </>
      )}
      <div className="band-fields">
        <NumberField
          size="small"
          label="Band from (RPM)"
          value={band[0]}
          commitOnBlur
          clamp={[500, 24000]}
          onValueChange={(v) => Number.isFinite(v) && onBand([v, band[1]])}
        />
        <NumberField
          size="small"
          label="to (RPM)"
          value={band[1]}
          commitOnBlur
          clamp={[500, 24900]}
          onValueChange={(v) => Number.isFinite(v) && onBand([band[0], v])}
        />
      </div>
      <p data-testid="band-power">
        Mean power across the band (area under the curve ÷ width):{' '}
        {mean === null ? (
          run.samples.length > 1 ? (
            `this run covers ${Math.round(Math.min(...run.samples.map((s) => s.rpm))).toLocaleString()}–${Math.round(Math.max(...run.samples.map((s) => s.rpm))).toLocaleString()} RPM; choose a band inside it.`
          ) : (
            'not enough points yet.'
          )
        ) : (
          <b>
            {formatFixed(fromKw(mean, power), 1)} {power}
            {baseMean !== null &&
              ` (${signed(((mean - baseMean) / baseMean) * 100, 1)}% vs Baseline)`}
          </b>
        )}
      </p>
      {knock && (
        <p data-testid="knock-summary">
          {knock.from === null ? (
            <>
              No knock. Closest: {Math.round(knock.worst.index * 100)}% of
              onset at {Math.round(knock.worst.rpm).toLocaleString()} RPM.
            </>
          ) : (
            <>
              <b className="knock-warning">
                Knocked from {Math.round(knock.from).toLocaleString()} to{' '}
                {Math.round(knock.to!).toLocaleString()} RPM
              </b>{' '}
              (worst {Math.round(knock.worst.index * 100)}% of onset).
            </>
          )}
          {knock.retard >= 0.5 &&
            ` The ECU pulled up to ${formatFixed(knock.retard, 1)}° of timing.`}
        </p>
      )}
      {run.reason && <p>{run.reason}</p>}
    </div>
  )
}
