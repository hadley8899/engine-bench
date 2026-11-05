import { useState } from 'react'
import { Button, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material'
import { roadSchema, vehicleKey, vehicles } from '../sim/road'
import type { Road, VehicleKey } from '../sim/road'
import { NumberField } from './NumberField'

const fields: {
  key: 'mass' | 'finalDrive' | 'tyreRadius' | 'dragArea' | 'launchRpm' | 'clutchCapacity'
  label: string
  unit: string
  scale: number
  min: number
  max: number
  step: number
}[] = [
  { key: 'mass', label: 'Vehicle and rider mass', unit: 'kg', scale: 1, min: 80, max: 5000, step: 5 },
  { key: 'finalDrive', label: 'Final drive', unit: ':1', scale: 1, min: 1.5, max: 15, step: 0.01 },
  { key: 'tyreRadius', label: 'Tyre radius', unit: 'mm', scale: 1000, min: 200, max: 500, step: 1 },
  { key: 'dragArea', label: 'Drag area (CdA)', unit: 'm²', scale: 1, min: 0.1, max: 2, step: 0.01 },
  { key: 'launchRpm', label: 'Clutch bites from', unit: 'RPM', scale: 1, min: 600, max: 12000, step: 100 },
  { key: 'clutchCapacity', label: 'Clutch capacity', unit: 'Nm', scale: 1, min: 10, max: 2000, step: 5 },
]

/**
 * Road-load switch, vehicle, gear selector and vehicle settings. Turning
 * road load on picks the vehicle that suits the engine's size.
 */
export function RoadControls({
  road,
  suggested,
  onChange,
  speed,
  disabled,
}: {
  road: Road | null
  suggested: VehicleKey
  onChange: (road: Road | null) => void
  speed: number | null
  disabled?: boolean
}) {
  const [settings, setSettings] = useState(false)
  const shift = (gear: number) =>
    road &&
    onChange({ ...road, gear: Math.max(0, Math.min(road.ratios.length, gear)) })
  return (
    <div className="road-controls" data-testid="road-controls">
      <FormControlLabel
        control={
          <Switch
            checked={!!road}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? vehicles[suggested].road : null)}
          />
        }
        label="Road load: drive a vehicle through a gearbox"
      />
      {road && (
        <>
          <TextField
            select
            size="small"
            label="Vehicle"
            value={vehicleKey(road) ?? 'custom'}
            disabled={disabled}
            onChange={(e) => {
              const key = e.target.value as VehicleKey
              onChange({ ...vehicles[key].road, gear: Math.min(road.gear, vehicles[key].road.ratios.length) })
            }}
          >
            {(Object.keys(vehicles) as VehicleKey[]).map((k) => (
              <MenuItem key={k} value={k}>
                {vehicles[k].label}
                {k === suggested ? ' (suits this engine)' : ''}
              </MenuItem>
            ))}
            {!vehicleKey(road) && (
              <MenuItem value="custom" disabled>
                Custom settings
              </MenuItem>
            )}
          </TextField>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Button
              variant="outlined"
              size="small"
              disabled={disabled || road.gear === 0}
              onClick={() => shift(road.gear - 1)}
              aria-label="Change down"
            >
              −
            </Button>
            <strong className="gear-display" data-testid="gear">
              {road.gear === 0 ? 'N' : road.gear}
            </strong>
            <Button
              variant="outlined"
              size="small"
              disabled={disabled || road.gear >= road.ratios.length}
              onClick={() => shift(road.gear + 1)}
              aria-label="Change up"
            >
              +
            </Button>
            <Button size="small" disabled={disabled} onClick={() => shift(0)}>
              Neutral
            </Button>
            <span className="road-speed" data-testid="road-speed">
              {speed === null ? '—' : Math.round(speed)} km/h
            </span>
          </Stack>
          <p className="cranking-note">
            The automatic clutch bites from {road.launchRpm} RPM, so floor it in
            first to launch. Q / E change gear. The vehicles are illustrative,
            not real ones. A load model only: the bench still
            reports crank output, with no tyre grip, driveline losses or wheel
            power.
          </p>
          <Button size="small" onClick={() => setSettings((v) => !v)} aria-expanded={settings}>
            {settings ? 'Hide vehicle settings' : 'Vehicle settings'}
          </Button>
          {settings && (
            <div className="field-grid">
              {fields.map((f) => (
                <NumberField
                  key={f.key}
                  size="small"
                  label={`${f.label} (${f.unit})`}
                  value={road[f.key] * f.scale}
                  commitOnBlur
                  clamp={[f.min, f.max]}
                  disabled={disabled}
                  slotProps={{ htmlInput: { min: f.min, max: f.max, step: f.step } }}
                  onValueChange={(v) => {
                    const next = { ...road, [f.key]: v / f.scale }
                    if (roadSchema.safeParse(next).success) onChange(next)
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
