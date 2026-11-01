import { useState } from 'react'
import { TextField } from '@mui/material'
import type { TextFieldProps } from '@mui/material'

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  value: number
  /** Receives NaN while the box is empty or incomplete. */
  onValueChange: (value: number) => void
  /** Clamp into this range when the field loses focus or Enter is pressed. */
  clamp?: [number, number]
  /** Report only on blur/Enter instead of on every keystroke. */
  commitOnBlur?: boolean
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text))
const format = (value: number) =>
  Number.isFinite(value) ? String(Number(value.toPrecision(10))) : ''
const same = (a: number, b: number) =>
  (Number.isNaN(a) && Number.isNaN(b)) ||
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/**
 * Numeric text field that keeps the typed text, so a box can be cleared or
 * hold a partial entry instead of snapping to 0 on every keystroke.
 */
export function NumberField({
  value,
  onValueChange,
  clamp,
  commitOnBlur,
  onBlur,
  onKeyDown,
  ...props
}: Props) {
  const [text, setText] = useState(() => format(value))
  const [last, setLast] = useState(value)
  // Adopt values changed elsewhere (presets, restores) without fighting typing.
  if (!same(value, last)) {
    setLast(value)
    if (!same(value, parse(text))) setText(format(value))
  }
  const commit = () => {
    let next = parse(text)
    if (clamp) {
      next = Number.isFinite(next)
        ? Math.min(clamp[1], Math.max(clamp[0], next))
        : clamp[0]
      setText(format(next))
    }
    if (clamp || commitOnBlur) {
      setLast(next)
      onValueChange(next)
    }
  }
  return (
    <TextField
      {...props}
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        if (!commitOnBlur) {
          const next = parse(e.target.value)
          setLast(next)
          onValueChange(next)
        }
      }}
      onBlur={(e) => {
        commit()
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        onKeyDown?.(e)
      }}
    />
  )
}
