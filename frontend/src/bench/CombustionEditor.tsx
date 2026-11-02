import { FormControlLabel, MenuItem, Switch, TextField } from '@mui/material'
import type { Combustion, FuelGrade } from '../sim/schema'
import { FUELS } from '../sim/fuel'
import { burnRateLabels } from './combustionFields'

const fuelNotes: Record<FuelGrade, string> = {
  ron91: 'Lowest knock resistance.',
  ron95: 'The usual premium unleaded.',
  ron98: 'More knock margin for high compression or boost.',
  e85: 'Much more knock margin and strong charge cooling, but it needs about 50% more fuel (stoichiometric 9.8:1).',
}

/** Fuel grade, burn-rate model and ECU knock control. */
export function CombustionEditor({
  value,
  onChange,
  disabled,
}: {
  value: Combustion
  onChange: (update: (current: Combustion) => Combustion) => void
  disabled?: boolean
}) {
  return (
    <div className="induction-editor" data-testid="combustion-editor">
      <div className="field-grid">
        <TextField
          select
          size="small"
          label="Fuel"
          value={value.fuel}
          disabled={disabled}
          helperText={fuelNotes[value.fuel]}
          onChange={(e) =>
            onChange((current) => ({
              ...current,
              fuel: e.target.value as FuelGrade,
            }))
          }
        >
          {(Object.keys(FUELS) as FuelGrade[]).map((k) => (
            <MenuItem key={k} value={k}>
              {FUELS[k].label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Burn rate"
          value={value.burnRate}
          disabled={disabled}
          helperText={
            value.burnRate === 'predictive'
              ? 'Burn duration is the 3,000 RPM full-load figure; the flame slows at light load and speeds up with turbulence.'
              : 'Every burn takes the burn duration, as in model 1.5.0.'
          }
          onChange={(e) =>
            onChange((current) => ({
              ...current,
              burnRate: e.target.value as Combustion['burnRate'],
            }))
          }
        >
          {(Object.keys(burnRateLabels) as Combustion['burnRate'][]).map(
            (k) => (
              <MenuItem key={k} value={k}>
                {burnRateLabels[k]}
              </MenuItem>
            ),
          )}
        </TextField>
      </div>
      <FormControlLabel
        control={
          <Switch
            checked={value.knockControl}
            disabled={disabled}
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                knockControl: e.target.checked,
              }))
            }
          />
        }
        label="ECU knock control"
      />
      <p className="cranking-note">
        Knock is estimated for every cylinder from end-gas pressure and
        temperature, octane, mixture and residual gas.{' '}
        {value.knockControl
          ? 'When a cylinder knocks, the ECU retards its timing 2° (up to 12°) and creeps back at 1.5° per second.'
          : 'Without knock control nothing protects the engine: the bench reports knock but does not act on it.'}{' '}
        It is an estimate, not a calibration tool.
      </p>
    </div>
  )
}
