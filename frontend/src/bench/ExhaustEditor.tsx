import { FormControlLabel, MenuItem, Switch, TextField } from '@mui/material'
import type { Exhaust } from '../sim/schema'
import { NumberField } from './NumberField'
import {
  collectorLabels,
  exhaustErrors,
  exhaustFields,
  exhaustRangeText,
  silencerLabels,
  silencerNotes,
} from './exhaustFields'

export function ExhaustEditor({
  value,
  onChange,
  disabled,
  twoStroke,
}: {
  value: Exhaust
  onChange: (update: (current: Exhaust) => Exhaust) => void
  disabled?: boolean
  /** A two-stroke's pipe is set under Ports and pipe: no header or collector. */
  twoStroke?: boolean
}) {
  const errors = exhaustErrors(value)
  return (
    <div className="induction-editor" data-testid="exhaust-editor">
      {twoStroke && (
        <p className="cranking-note">
          The pipe from the port (header, cones and stinger) is set in Ports
          and pipe. These settings shape only the sound after the stinger.
        </p>
      )}
      <div className="field-grid">
        {exhaustFields
          .filter((f) => !twoStroke || f.key !== 'headerLength')
          .map((f) => (
          <NumberField
            key={f.key}
            size="small"
            label={`${f.label} (${f.unit})`}
            title={f.help}
            error={!!errors[f.label]}
            helperText={errors[f.label] ?? exhaustRangeText(f)}
            value={value[f.key] * f.scale}
            disabled={disabled}
            slotProps={{ htmlInput: { min: f.min, max: f.max, step: f.step } }}
            onValueChange={(n) =>
              onChange((current) => ({ ...current, [f.key]: n / f.scale }))
            }
          />
        ))}
        {!twoStroke && (
        <TextField
          select
          size="small"
          label="Collector"
          value={value.collector}
          disabled={disabled}
          onChange={(e) =>
            onChange((current) => ({
              ...current,
              collector: e.target.value as Exhaust['collector'],
            }))
          }
        >
          {(Object.keys(collectorLabels) as Exhaust['collector'][]).map((k) => (
            <MenuItem key={k} value={k}>
              {collectorLabels[k]}
            </MenuItem>
          ))}
        </TextField>
        )}
        <TextField
          select
          size="small"
          label="Silencer"
          value={value.silencer}
          disabled={disabled}
          onChange={(e) =>
            onChange((current) => ({
              ...current,
              silencer: e.target.value as Exhaust['silencer'],
            }))
          }
        >
          {(Object.keys(silencerLabels) as Exhaust['silencer'][]).map((k) => (
            <MenuItem key={k} value={k}>
              {silencerLabels[k]}
            </MenuItem>
          ))}
        </TextField>
      </div>
      <FormControlLabel
        control={
          <Switch
            checked={value.catalyst}
            disabled={disabled}
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                catalyst: e.target.checked,
              }))
            }
          />
        }
        label="Catalytic converter"
      />
      <p className="cranking-note">
        {silencerNotes[value.silencer]} The exhaust shapes the sound only: in
        this model version it does not change back pressure or power. Unburned
        fuel from a misfire or the rev limiter can pop in a hot exhaust.
      </p>
    </div>
  )
}
