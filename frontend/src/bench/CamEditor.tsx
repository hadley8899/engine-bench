import { FormControlLabel, Switch } from '@mui/material'
import type { CamSwitch, EngineDefinition } from '../sim/schema'
import { camSwitchSchema } from '../sim/schema'
import { NumberField } from './NumberField'

const fields: {
  key: keyof CamSwitch
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
}[] = [
  { key: 'rpm', label: 'Switch speed', unit: 'RPM', scale: 1, min: 1000, max: 15000, step: 100 },
  { key: 'intakeArea', label: 'High-cam intake area', unit: 'mm²', scale: 1e6, min: 10, max: 20000, step: 10 },
  { key: 'exhaustArea', label: 'High-cam exhaust area', unit: 'mm²', scale: 1e6, min: 10, max: 25000, step: 10 },
  { key: 'intakeClose', label: 'High-cam intake closes', unit: '°', scale: 1, min: 550, max: 630, step: 1 },
]

/**
 * Optional two-stage cam: above the switch speed the engine uses a second
 * set of valve areas and intake closing (VTEC-style).
 */
export function CamEditor({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: (camSwitch: CamSwitch | null) => void
  disabled?: boolean
}) {
  const cam = engine.camSwitch
  return (
    <div className="induction-editor" data-testid="cam-editor">
      <FormControlLabel
        control={
          <Switch
            checked={!!cam}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? {
                      rpm: Math.round((engine.revLimit * 0.65) / 100) * 100,
                      intakeArea: engine.intakeArea * 1.4,
                      exhaustArea: engine.exhaustArea * 1.2,
                      intakeClose: Math.min(630, engine.intakeClose + 25),
                    }
                  : null,
              )
            }
          />
        }
        label="Two-stage cam (switches to a high-lift profile)"
      />
      {cam && (
        <div className="field-grid">
          {fields.map((f) => {
            const invalid = !camSwitchSchema.shape[f.key].safeParse(cam[f.key])
              .success
            return (
              <NumberField
                key={f.key}
                size="small"
                label={`${f.label} (${f.unit})`}
                error={invalid}
                helperText={`${f.min}–${f.max} ${f.unit}`}
                value={Math.round(cam[f.key] * f.scale * 100) / 100}
                disabled={disabled}
                slotProps={{
                  htmlInput: { min: f.min, max: f.max, step: f.step },
                }}
                onValueChange={(n) => onChange({ ...cam, [f.key]: n / f.scale })}
              />
            )
          })}
        </div>
      )}
      <p className="cranking-note">
        {cam
          ? `Below ${cam.rpm.toLocaleString('en-GB')} RPM the engine uses the valve areas and intake closing above; from there up (dropping back 150 RPM lower) it switches to the high cam. Intake still opens at 350°.`
          : 'Off: one cam profile at every speed.'}
      </p>
    </div>
  )
}
