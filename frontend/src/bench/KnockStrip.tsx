import type { KnockTelemetry } from '../sim/core'
import { FUELS } from '../sim/fuel'

/**
 * Per-cylinder knock from the last cycle. The bar shows how close the end
 * gas came to autoigniting before the flame reached it: full at onset.
 */
export function KnockStrip({ knock }: { knock: KnockTelemetry }) {
  return (
    <div className="knock-strip" data-testid="knock">
      <div className="knock-head">
        <small>KNOCK · {FUELS[knock.fuel].label}</small>
        {knock.knocking ? (
          <em className="boost-flag warn" data-testid="knocking">
            KNOCK
          </em>
        ) : (
          <span>{knock.control ? 'Knock control on' : 'Unprotected'}</span>
        )}
      </div>
      <div className="knock-cylinders">
        {knock.index.map((index, i) => {
          const share = Math.min(1, index)
          const level =
            knock.intensity[i] > 0 ? 'knock' : index > 0.85 ? 'near' : 'safe'
          return (
            <div
              key={i}
              className={`knock-cylinder ${level}`}
              title={`Cylinder ${i + 1}: knock index ${index.toFixed(2)} (1 = onset), ${Math.round(knock.intensity[i] * 100)}% of the charge unburned at onset, burn ${Math.round(knock.burn[i])}°`}
            >
              <span className="knock-label">{i + 1}</span>
              <span className="knock-bar" aria-hidden>
                <span style={{ width: `${share * 100}%` }} />
              </span>
              <span className="knock-value">
                {Math.round(index * 100)}%
                {knock.retard[i] >= 0.5 && (
                  <b> −{knock.retard[i].toFixed(0)}°</b>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
