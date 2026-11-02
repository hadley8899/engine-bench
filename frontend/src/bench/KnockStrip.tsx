import type { KnockTelemetry, Telemetry } from '../sim/core'
import { FUELS } from '../sim/fuel'

/** Estimated temperatures above which a part is shown as hot or very hot, °C. */
const HOT = {
  egt: [980, 1050],
  crown: [320, 350],
  valve: [800, 870],
} as const
const level = (kind: keyof typeof HOT, celsius: number) =>
  celsius >= HOT[kind][1] ? 'very-hot' : celsius >= HOT[kind][0] ? 'hot' : ''

/**
 * Per-cylinder knock from the last cycle and estimated temperatures. The bar
 * shows how close the end gas came to autoigniting before the flame reached
 * it: full at onset.
 */
export function KnockStrip({
  knock,
  temperatures,
}: {
  knock: KnockTelemetry
  temperatures: Telemetry['temperatures']
}) {
  return (
    <div className="knock-strip" data-testid="knock">
      <div className="knock-head">
        <small>CYLINDERS · KNOCK · {FUELS[knock.fuel].label}</small>
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
          const state =
            knock.intensity[i] > 0 ? 'knock' : index > 0.85 ? 'near' : 'safe'
          const egt = temperatures.egt[i] - 273.15
          const crown = temperatures.crown[i] - 273.15
          const valve = temperatures.valve[i] - 273.15
          return (
            <div key={i} className={`knock-cylinder ${state}`}>
              <span className="knock-label">{i + 1}</span>
              <span
                className="knock-bar"
                aria-hidden
                title={`Cylinder ${i + 1}: knock index ${index.toFixed(2)} (1 = onset), ${Math.round(knock.intensity[i] * 100)}% of the charge unburned at onset, burn ${Math.round(knock.burn[i])}°`}
              >
                <span style={{ width: `${share * 100}%` }} />
              </span>
              <span className="knock-value">
                {Math.round(index * 100)}%
                {knock.retard[i] >= 0.5 && (
                  <b> −{knock.retard[i].toFixed(0)}°</b>
                )}
              </span>
              <span
                className="cylinder-temps"
                data-testid={`temps-${i + 1}`}
                title={`Estimated: exhaust port gas, piston crown, exhaust valve; combustion deck ${Math.round(temperatures.head[i] - 273.15)} °C`}
              >
                <span className={level('egt', egt)}>EGT {Math.round(egt)}°</span>
                <span className={level('crown', crown)}>
                  Piston {Math.round(crown)}°
                </span>
                <span className={level('valve', valve)}>
                  Valve {Math.round(valve)}°
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
