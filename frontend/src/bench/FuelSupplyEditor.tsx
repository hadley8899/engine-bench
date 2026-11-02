import { FormControlLabel, Switch } from '@mui/material'
import type { FuelSupply, FuelSystem } from '../sim/schema'
import { fuelSupplySchema } from '../sim/schema'
import { NumberField } from './NumberField'

const fields: {
  key: keyof FuelSupply
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
}[] = [
  { key: 'injectorFlow', label: 'Injector flow, each', unit: 'cc/min', scale: 1, min: 50, max: 3000, step: 10 },
  { key: 'maxDuty', label: 'Injector duty limit', unit: '%', scale: 100, min: 50, max: 100, step: 1 },
  { key: 'pumpFlow', label: 'Fuel pump', unit: 'L/h', scale: 1, min: 10, max: 1000, step: 5 },
]
/** Road-car injectors and pump: enough for about 120 kW on petrol. */
const starting: FuelSupply = { injectorFlow: 240, maxDuty: 0.85, pumpFlow: 110 }

/** Optional injector and pump capacity; without it fuel delivery is unlimited. */
export function FuelSupplyEditor({
  value,
  fuelSystem,
  onChange,
  disabled,
}: {
  value: FuelSupply | null
  fuelSystem: FuelSystem['kind']
  onChange: (update: (current: FuelSupply | null) => FuelSupply | null) => void
  disabled?: boolean
}) {
  const carburettor = fuelSystem === 'carburettor'
  return (
    <div className="induction-editor" data-testid="fuel-supply-editor">
      <FormControlLabel
        control={
          <Switch
            checked={!!value}
            disabled={disabled}
            onChange={(e) => onChange(() => (e.target.checked ? starting : null))}
          />
        }
        label="Limit fuel delivery (injectors and pump)"
      />
      {value && (
        <div className="field-grid">
          {fields
            .filter((f) => !carburettor || f.key === 'pumpFlow')
            .map((f) => {
              const invalid = !fuelSupplySchema.shape[f.key].safeParse(value[f.key]).success
              return (
                <NumberField
                  key={f.key}
                  size="small"
                  label={`${f.key === 'pumpFlow' && fuelSystem === 'direct' ? 'High-pressure pump' : f.label} (${f.unit})`}
                  error={invalid}
                  helperText={`${f.min}–${f.max} ${f.unit}`}
                  value={value[f.key] * f.scale}
                  disabled={disabled}
                  slotProps={{ htmlInput: { min: f.min, max: f.max, step: f.step } }}
                  onValueChange={(n) =>
                    onChange((current) =>
                      current ? { ...current, [f.key]: n / f.scale } : current,
                    )
                  }
                />
              )
            })}
        </div>
      )}
      <p className="cranking-note">
        {value
          ? `Four injectors rated with this fuel; E85 needs about 50% more flow. When ${carburettor ? 'the pump' : 'the injectors (at their duty limit) or the pump'} cannot keep up, the mixture goes lean and the bench shows FUEL LIMITED.`
          : 'Off: fuel delivery is unlimited, as before model 1.7.0.'}
      </p>
    </div>
  )
}
