import type { Combustion } from '../sim/schema'
import { legacyCombustion } from '../sim/schema'
import { FUELS } from '../sim/fuel'

export const burnRateLabels: Record<Combustion['burnRate'], string> = {
  predictive: 'Predictive (speed, load and mixture)',
  fixed: 'Fixed duration (1.5.0)',
}
/** Plain-language differences between two combustion settings. */
export function describeCombustion(
  a: Combustion = legacyCombustion,
  b: Combustion = legacyCombustion,
) {
  const changes: string[] = []
  if (a.fuel !== b.fuel)
    changes.push(`Fuel: ${FUELS[a.fuel].label} → ${FUELS[b.fuel].label}`)
  if (a.burnRate !== b.burnRate)
    changes.push(
      `Burn rate: ${burnRateLabels[a.burnRate]} → ${burnRateLabels[b.burnRate]}`,
    )
  if (a.knockControl !== b.knockControl)
    changes.push(
      `Knock control: ${a.knockControl ? 'on' : 'off'} → ${b.knockControl ? 'on' : 'off'}`,
    )
  return changes
}
