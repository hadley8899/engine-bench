import { MenuItem, TextField } from '@mui/material'
import type { EngineDefinition, Parts } from '../sim/schema'
import {
  formatLimit,
  HEAD_FASTENERS,
  HEAD_GASKETS,
  PISTONS,
  RODS,
  VALVE_SPRINGS,
} from '../sim/parts'
import { floatFactor } from '../sim/cams'
import {
  injectors,
  intercoolers,
  matchIntercooler,
  matchTurbo,
  pumps,
  roadSupply,
  turbos,
} from './partCatalogue'

type Catalogue = Record<string, { label: string; description: string }>
const internals: {
  key: keyof Parts
  label: string
  options: Catalogue
  limit: (e: EngineDefinition, k: string) => string
}[] = [
  {
    key: 'pistons',
    label: 'Pistons',
    options: PISTONS,
    limit: (_, k) => {
      const p = PISTONS[k as Parts['pistons']]
      return `Crown limit ${formatLimit('crown', p.crown)}; knock tolerance ${formatLimit('knock', p.knock)}.`
    },
  },
  {
    key: 'rods',
    label: 'Connecting rods',
    options: RODS,
    limit: (_, k) => {
      const r = RODS[k as Parts['rods']]
      return `Buckling at about ${(r.compression / 1e5).toFixed(0)} bar on the piston; tension ×${r.tension.toFixed(2)} stock.`
    },
  },
  {
    key: 'headGasket',
    label: 'Head gasket',
    options: HEAD_GASKETS,
    limit: (e, k) =>
      `Clamps about ${(
        (HEAD_GASKETS[k as Parts['headGasket']].clamp *
          HEAD_FASTENERS[e.parts.headFasteners].factor) /
        1e5
      ).toFixed(0)} bar peak pressure with these fasteners.`,
  },
  {
    key: 'headFasteners',
    label: 'Head fasteners',
    options: HEAD_FASTENERS,
    limit: () => '',
  },
  {
    key: 'valveSprings',
    label: 'Valve springs',
    options: VALVE_SPRINGS,
    limit: (e, k) =>
      `Float from about ${formatLimit(
        'valveFloat',
        e.mechanicalLimit *
          VALVE_SPRINGS[k as Parts['valveSprings']].float *
          floatFactor(e),
      )}${e.cams ? ' with these cams' : ''}.`,
  },
]

/**
 * Fitted parts. Internal parts carry estimated limits; bolt-on parts are
 * named sets of the build's induction and fuel-supply fields.
 */
export function PartsEditor({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: (update: (current: EngineDefinition) => EngineDefinition) => void
  disabled?: boolean
}) {
  const induction = engine.induction
  const supply = engine.fuelSupply
  const carburettor = engine.fuelSystem.kind === 'carburettor'
  const turbo = induction.kind === 'turbo' ? matchTurbo(induction) : -1
  const cooler =
    induction.kind !== 'none' ? matchIntercooler(induction.intercooler) : -1
  const injector = supply
    ? injectors.findIndex((p) => p.value === supply.injectorFlow)
    : -1
  const pump = supply ? pumps.findIndex((p) => p.value === supply.pumpFlow) : -1
  const custom = (index: number) => (index < 0 ? 'custom' : String(index))
  return (
    <div className="induction-editor" data-testid="parts-editor">
      <div className="field-grid">
        {internals
          // A two-stroke's ports have no valves or springs.
          .filter((f) => f.key !== 'valveSprings' || engine.cycle !== 'two-stroke')
          .map((f) => {
          const value = engine.parts[f.key]
          return (
            <TextField
              key={f.key}
              select
              size="small"
              label={f.label}
              value={value}
              disabled={disabled}
              data-testid={`part-${f.key}`}
              helperText={`${f.options[value].description} ${f.limit(engine, value)}`}
              onChange={(e) =>
                onChange((current) => ({
                  ...current,
                  parts: { ...current.parts, [f.key]: e.target.value },
                }))
              }
            >
              {Object.entries(f.options).map(([k, o]) => (
                <MenuItem key={k} value={k}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          )
        })}
        {induction.kind === 'turbo' && (
          <TextField
            select
            size="small"
            label="Turbocharger"
            value={custom(turbo)}
            disabled={disabled}
            helperText={
              turbo < 0
                ? 'Custom: set in Forced induction below.'
                : `${turbos[turbo].note} Rated ${formatLimit('turboSpeed', turbos[turbo].value.maxShaftRpm)}.`
            }
            onChange={(e) => {
              const part = turbos[Number(e.target.value)]
              if (part)
                onChange((current) =>
                  current.induction.kind === 'turbo'
                    ? {
                        ...current,
                        induction: { ...current.induction, ...part.value },
                      }
                    : current,
                )
            }}
          >
            {turbo < 0 && <MenuItem value="custom">Custom</MenuItem>}
            {turbos.map((p, i) => (
              <MenuItem key={p.label} value={String(i)}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {induction.kind !== 'none' && (
          <TextField
            select
            size="small"
            label="Intercooler"
            value={custom(cooler)}
            disabled={disabled}
            helperText={
              cooler < 0
                ? 'Custom: set in Forced induction below.'
                : 'Cools the charge after the compressor, for some pressure loss.'
            }
            onChange={(e) => {
              const part = intercoolers[Number(e.target.value)]
              if (part)
                onChange((current) =>
                  current.induction.kind !== 'none'
                    ? {
                        ...current,
                        induction: {
                          ...current.induction,
                          intercooler: part.value,
                        },
                      }
                    : current,
                )
            }}
          >
            {cooler < 0 && <MenuItem value="custom">Custom</MenuItem>}
            {intercoolers.map((p, i) => (
              <MenuItem key={p.label} value={String(i)}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {!carburettor && (
          <TextField
            select
            size="small"
            label="Injectors"
            value={supply ? custom(injector) : 'unlimited'}
            disabled={disabled}
            helperText={
              supply
                ? 'Four injectors; their flow and duty limit cap the fuel.'
                : 'Unlimited fuel. Fitting injectors turns on fuel limits.'
            }
            onChange={(e) => {
              const part = injectors[Number(e.target.value)]
              if (part)
                onChange((current) => ({
                  ...current,
                  fuelSupply: {
                    ...(current.fuelSupply ?? roadSupply),
                    injectorFlow: part.value,
                  },
                }))
            }}
          >
            {!supply && <MenuItem value="unlimited">Unlimited</MenuItem>}
            {supply && injector < 0 && (
              <MenuItem value="custom">Custom</MenuItem>
            )}
            {injectors.map((p, i) => (
              <MenuItem key={p.label} value={String(i)}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label={
            engine.fuelSystem.kind === 'direct'
              ? 'High-pressure pump'
              : 'Fuel pump'
          }
          value={supply ? custom(pump) : 'unlimited'}
          disabled={disabled}
          helperText={
            supply
              ? 'Runs out of fuel above its flow: the mixture goes lean.'
              : 'Unlimited fuel. Fitting a pump turns on fuel limits.'
          }
          onChange={(e) => {
            const part = pumps[Number(e.target.value)]
            if (part)
              onChange((current) => ({
                ...current,
                fuelSupply: {
                  ...(current.fuelSupply ?? roadSupply),
                  pumpFlow: part.value,
                },
              }))
          }}
        >
          {!supply && <MenuItem value="unlimited">Unlimited</MenuItem>}
          {supply && pump < 0 && <MenuItem value="custom">Custom</MenuItem>}
          {pumps.map((p, i) => (
            <MenuItem key={p.label} value={String(i)}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
      </div>
      <p className="cranking-note">
        Every part is available. Limits are estimates calibrated to this
        model, not ratings for real parts. Stock parts are rated for the
        build’s estimated mechanical limit ({formatLimit('valveFloat', engine.mechanicalLimit)}).
        Heavier pistons and rods add crank inertia; stiffer valve springs add
        friction.
      </p>
    </div>
  )
}
