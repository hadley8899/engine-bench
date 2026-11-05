import { FormControlLabel, MenuItem, Switch, TextField } from '@mui/material'
import { fuelSystemDefaults } from '../sim/schema'
import type { FuelSystem, FuelSystemKind } from '../sim/schema'
import { NumberField } from './NumberField'
import {
  carburettorFields,
  fuelErrors,
  fuelLabels,
  fuelNotes,
  fuelRangeText,
  fuelToggles,
} from './fuelFields'

export function FuelSystemEditor({
  value,
  onChange,
  disabled,
  twoStroke,
}: {
  value: FuelSystem
  onChange: (update: (current: FuelSystem) => FuelSystem) => void
  disabled?: boolean
  /** A two-stroke has no inlet valve port to inject into. */
  twoStroke?: boolean
}) {
  const errors = fuelErrors(value)
  const fields = value as Record<string, unknown>
  return (
    <div className="induction-editor">
      <TextField
        select
        size="small"
        fullWidth
        label="Fuel system"
        value={value.kind}
        disabled={disabled}
        onChange={(e) =>
          onChange(() => ({
            ...fuelSystemDefaults[e.target.value as FuelSystemKind],
          }))
        }
      >
        {(Object.keys(fuelLabels) as FuelSystemKind[]).map((k) => (
          <MenuItem key={k} value={k} disabled={twoStroke && k === 'port'}>
            {fuelLabels[k]}
            {twoStroke && k === 'port' && ' (four-strokes only)'}
          </MenuItem>
        ))}
      </TextField>
      {value.kind === 'carburettor' && (
        <div className="field-grid">
          {carburettorFields.map((f) => (
            <NumberField
              key={f.key}
              size="small"
              label={`${f.label} (${f.unit})`}
              title={f.help}
              error={!!errors[f.label]}
              helperText={errors[f.label] ?? fuelRangeText(f)}
              value={Number(fields[f.key]) * f.scale}
              slotProps={{
                htmlInput: { min: f.min, max: f.max, step: f.step },
              }}
              onValueChange={(n) =>
                onChange(
                  (current) =>
                    ({ ...current, [f.key]: n / f.scale }) as FuelSystem,
                )
              }
            />
          ))}
        </div>
      )}
      {fuelToggles[value.kind].map((t) => (
        <FormControlLabel
          key={t.key}
          control={
            <Switch
              checked={fields[t.key] as boolean}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  (current) =>
                    ({ ...current, [t.key]: e.target.checked }) as FuelSystem,
                )
              }
            />
          }
          label={t.label}
        />
      ))}
      <p className="cranking-note">{fuelNotes[value.kind]}</p>
    </div>
  )
}
