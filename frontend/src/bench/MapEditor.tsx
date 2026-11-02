import { useRef, useState } from 'react'
import { Button, FormControlLabel, Stack, Switch, Tab, Tabs } from '@mui/material'
import type { EngineDefinition, Management } from '../sim/schema'
import { flatMaps, lookup } from '../sim/schema'
import type { EcuTelemetry } from '../sim/core'
import { MAP_TABLES, nearest, singleValue } from './mapFields'
import type { MapTable } from './mapFields'

type Selection = { r0: number; c0: number; r1: number; c1: number }

/** A number that commits on Enter or blur, so typing never fights validation. */
function Cell({
  value,
  digits,
  invalid,
  className,
  label,
  disabled,
  onCommit,
  onSelect,
}: {
  value: number
  digits: number
  invalid?: boolean
  className?: string
  label: string
  disabled?: boolean
  onCommit: (v: number) => void
  onSelect?: (extend: boolean) => void
}) {
  const shown = value.toFixed(digits)
  // Text being typed; null when not editing, so the cell follows its value.
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const commit = () => {
    const v = Number(draft)
    if (
      !cancelled.current &&
      draft !== null &&
      draft.trim() !== '' &&
      Number.isFinite(v) &&
      v.toFixed(digits) !== shown
    )
      onCommit(v)
    cancelled.current = false
    setDraft(null)
  }
  return (
    <input
      className={`map-cell ${className ?? ''} ${invalid ? 'invalid' : ''}`}
      aria-label={label}
      inputMode="decimal"
      value={draft ?? shown}
      disabled={disabled}
      onFocus={() => setDraft(shown)}
      onMouseDown={(e) => onSelect?.(e.shiftKey)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

/**
 * Ignition, target λ and boost tables by RPM and load. The cell nearest the
 * running engine's operating point is outlined.
 */
export function MapEditor({
  engine,
  onChange,
  live,
  disabled,
}: {
  engine: EngineDefinition
  onChange: (update: (maps: Management | null) => Management | null) => void
  live: EcuTelemetry & { rpm: number } | null
  disabled?: boolean
}) {
  const maps = engine.management
  const [table, setTable] = useState<MapTable>('ignition')
  const [selection, setSelection] = useState<Selection | null>(null)
  const turbo = engine.induction.kind === 'turbo'
  const carburettor = engine.fuelSystem.kind === 'carburettor'
  const shown: MapTable = table === 'boost' && !turbo ? 'ignition' : table
  const spec = MAP_TABLES[shown]
  const rows = maps ? (shown === 'boost' ? maps.throttle : maps.load) : []
  const rowAxis = shown === 'boost' ? 'throttle' : 'load'
  const update = (fn: (m: Management) => Management) =>
    onChange((m) => (m ? fn(m) : m))
  const setCell = (r: number, c: number, v: number) =>
    update((m) => ({
      ...m,
      [shown]: m[shown].map((row, i) =>
        i === r ? row.map((x, j) => (j === c ? v / spec.scale : x)) : row,
      ),
    }))
  const inSelection = (r: number, c: number) =>
    !!selection &&
    r >= Math.min(selection.r0, selection.r1) &&
    r <= Math.max(selection.r0, selection.r1) &&
    c >= Math.min(selection.c0, selection.c1) &&
    c <= Math.max(selection.c0, selection.c1)
  const adjust = (delta: number) =>
    update((m) => ({
      ...m,
      [shown]: m[shown].map((row, r) =>
        row.map((x, c) =>
          !selection || inSelection(r, c)
            ? Math.min(
                spec.max / spec.scale,
                Math.max(spec.min / spec.scale, x + delta / spec.scale),
              )
            : x,
        ),
      ),
    }))
  const setAxis = (axis: 'rpm' | 'load' | 'throttle', i: number, v: number) =>
    update((m) => ({
      ...m,
      [axis]: m[axis].map((x, j) => (j === i ? v : x)),
    }))
  const increasing = (a: number[]) =>
    a.map((v, i) => (i > 0 && v <= a[i - 1]) || (i < a.length - 1 && v >= a[i + 1]))

  const liveRow = live ? (shown === 'boost' ? live.throttle : live.load) : 0
  const liveCell =
    maps && live
      ? { r: nearest(rows, liveRow), c: nearest(maps.rpm, live.rpm) }
      : null
  const liveValue =
    maps && live
      ? lookup(rows, maps.rpm, maps[shown], liveRow, live.rpm) * spec.scale
      : null
  const rowScale = shown === 'boost' ? 100 : 0.001
  const rowLimits = shown === 'boost' ? [0, 100] : [10, 500]
  const badRows = increasing(rows)
  const badRpm = maps ? increasing(maps.rpm) : []

  if (!maps) return null
  return (
    <div className="induction-editor" data-testid="map-editor">
        <>
          <Tabs
            value={shown}
            onChange={(_, v: MapTable) => {
              setTable(v)
              setSelection(null)
            }}
            variant="scrollable"
          >
            <Tab value="ignition" label="Ignition" />
            <Tab value="lambda" label="Target λ" />
            {turbo && <Tab value="boost" label="Boost" />}
          </Tabs>
          <p className="cranking-note">
            {spec.help}
            {shown === 'lambda' && carburettor &&
              ' A carburettor cannot follow this map; its jets set the mixture.'}
          </p>
          {liveValue !== null && live && (
            <p className="map-live" data-testid="map-live">
              Running at {Math.round(live.rpm).toLocaleString()} RPM,{' '}
              {shown === 'boost'
                ? `${Math.round(live.throttle * 100)}% throttle`
                : `${Math.round(live.load / 1000)} kPa`}
              : <b>{liveValue.toFixed(spec.digits)}{spec.unit}</b>
            </p>
          )}
          <div className="map-scroll">
            <table className="map-table">
              <thead>
                <tr>
                  <th className="map-corner">
                    {shown === 'boost' ? 'Throttle %' : 'kPa'} \ RPM
                  </th>
                  {maps.rpm.map((r, i) => (
                    <th key={i}>
                      <Cell
                        value={r}
                        digits={0}
                        label={`RPM breakpoint ${i + 1}`}
                        invalid={badRpm[i]}
                        className="axis"
                        disabled={disabled}
                        onCommit={(v) =>
                          setAxis('rpm', i, Math.min(25000, Math.max(0, v)))
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .map((value, r) => ({ value, r }))
                  .reverse()
                  .map(({ value, r }) => (
                    <tr key={r}>
                      <th>
                        <Cell
                          value={value * rowScale}
                          digits={0}
                          label={`${shown === 'boost' ? 'Throttle' : 'Load'} breakpoint ${r + 1}`}
                          invalid={badRows[r]}
                          className="axis"
                          disabled={disabled}
                          onCommit={(v) =>
                            setAxis(
                              rowAxis,
                              r,
                              Math.min(rowLimits[1], Math.max(rowLimits[0], v)) /
                                rowScale,
                            )
                          }
                        />
                      </th>
                      {maps.rpm.map((rpm, c) => {
                        const v = maps[shown][r][c] * spec.scale
                        const share = (v - spec.min) / (spec.max - spec.min)
                        return (
                          <td
                            key={c}
                            style={{
                              background: `hsl(${spec.hue(share)} 55% 22%)`,
                            }}
                            className={[
                              liveCell?.r === r && liveCell.c === c ? 'live' : '',
                              inSelection(r, c) ? 'selected' : '',
                            ].join(' ')}
                          >
                            <Cell
                              value={v}
                              digits={spec.digits}
                              label={`${spec.label} at ${rpm} RPM, ${shown === 'boost' ? `${Math.round(value * 100)}% throttle` : `${Math.round(value / 1000)} kPa`}`}
                              invalid={v < spec.min || v > spec.max}
                              disabled={disabled}
                              onSelect={(extend) =>
                                setSelection((s) =>
                                  extend && s
                                    ? { ...s, r1: r, c1: c }
                                    : { r0: r, c0: c, r1: r, c1: c },
                                )
                              }
                              onCommit={(n) => setCell(r, c, n)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            <span className="map-scope">
              {selection ? 'Selection:' : 'Whole table:'}
            </span>
            <Button size="small" variant="outlined" disabled={disabled} onClick={() => adjust(-spec.step)}>
              −{spec.step}
              {spec.unit}
            </Button>
            <Button size="small" variant="outlined" disabled={disabled} onClick={() => adjust(spec.step)}>
              +{spec.step}
              {spec.unit}
            </Button>
            {selection && (
              <Button size="small" onClick={() => setSelection(null)}>
                Clear selection
              </Button>
            )}
            <Button
              size="small"
              disabled={disabled}
              onClick={() => {
                const single = singleValue(engine, shown)
                update((m) => ({
                  ...m,
                  [shown]: m[shown].map((row) => row.map(() => single)),
                }))
                setSelection(null)
              }}
            >
              Fill with the single value
            </Button>
          </Stack>
          <p className="cranking-note">
            Click a cell to select it, shift-click to select a block. Values
            between breakpoints are interpolated and held flat beyond the
            ends. The outlined cell is nearest the running engine; with Live
            updates on, edits reach it straight away.
          </p>
        </>
    </div>
  )
}

/** Switches the build between single values and engine-management maps. */
export function MapToggle({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineDefinition
  onChange: (maps: Management | null) => void
  disabled?: boolean
}) {
  return (
    <div className="induction-editor">
      <FormControlLabel
        control={
          <Switch
            checked={!!engine.management}
            disabled={disabled}
            onChange={(e) =>
              onChange(e.target.checked ? flatMaps(engine) : null)
            }
          />
        }
        label="Use engine-management maps"
      />
      <p className="cranking-note">
        {engine.management
          ? 'Ignition, target λ and boost come from the tables in the Engine maps panel beside the bench.'
          : 'Off: the engine uses its single ignition advance, mixture λ and boost target everywhere. Turning maps on starts from those values, so nothing changes until you edit a cell.'}
      </p>
    </div>
  )
}
