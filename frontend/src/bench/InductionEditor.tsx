import { FormControlLabel, MenuItem, Switch, TextField } from '@mui/material'
import { inductionDefaults } from '../sim/schema'
import type { Induction, InductionKind } from '../sim/schema'
import { NumberField } from './NumberField'
import {
  inductionErrors,
  inductionFields,
  inductionLabels,
  rangeText,
  read,
  write,
} from './inductionFields'

export function InductionEditor({
  value,
  onChange,
  disabled,
  boostMapped,
}: {
  value: Induction
  onChange: (update: (current: Induction) => Induction) => void
  disabled?: boolean
  /** Engine-management maps are on, so the boost map sets the target. */
  boostMapped?: boolean
}) {
  const errors = inductionErrors(value)
  const toggle =
    value.kind === 'roots'
      ? { key: 'bypass', label: 'Bypass valve (unloads blower off throttle)' }
      : value.kind === 'none'
        ? null
        : { key: 'blowOff', label: 'Blow-off valve (vents boost on lift-off)' }
  return (
    <div className="induction-editor">
      <TextField
        select
        size="small"
        fullWidth
        label="Induction"
        value={value.kind}
        disabled={disabled}
        onChange={(e) =>
          onChange(() => ({
            ...inductionDefaults[e.target.value as InductionKind],
          }))
        }
      >
        {(Object.keys(inductionLabels) as InductionKind[]).map((k) => (
          <MenuItem key={k} value={k}>
            {inductionLabels[k]}
          </MenuItem>
        ))}
      </TextField>
      {value.kind !== 'none' && (
        <>
          <div className="field-grid">
            {inductionFields[value.kind].map((f) => (
              <NumberField
                key={`${value.kind}.${f.key}`}
                size="small"
                label={`${f.label} (${f.unit})`}
                title={f.help}
                error={!!errors[f.label]}
                helperText={
                  errors[f.label] ??
                  (boostMapped && f.key === 'boostTarget'
                    ? 'Not used: the boost map sets the target while maps are on'
                    : rangeText(f))
                }
                value={read(value, f.key) * f.scale}
                slotProps={{
                  htmlInput: { min: f.min, max: f.max, step: f.step },
                }}
                onValueChange={(n) =>
                  onChange((current) => write(current, f.key, n / f.scale))
                }
              />
            ))}
          </div>
          {toggle && (
            <FormControlLabel
              control={
                <Switch
                  checked={
                    (value as Record<string, unknown>)[toggle.key] as boolean
                  }
                  onChange={(e) =>
                    onChange(
                      (current) =>
                        ({
                          ...current,
                          [toggle.key]: e.target.checked,
                        }) as Induction,
                    )
                  }
                />
              }
              label={toggle.label}
            />
          )}
          <p className="cranking-note warn">
            More boost raises cylinder pressure, knock and exhaust heat. Knock
            control pulls timing back; without it, or past what the parts
            take, pistons, rods, the head gasket or the turbo can fail. Real
            boosted engines use lower compression (about 8.5–10.5:1) and less
            ignition advance.
          </p>
        </>
      )}
    </div>
  )
}
