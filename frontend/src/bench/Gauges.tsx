import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Telemetry } from '../sim/core'
import { AFTERFIRE_TEMPERATURE } from '../sim/acoustics'
import { formatFixed } from './units'

type Dial = {
  label: string
  unit: string
  min: number
  max: number
  value: (t: Telemetry) => number
  digits: number
  /** Value from which the arc is drawn in the warning colour. */
  warn?: number
  /** Hidden when this returns false. */
  shown?: (t: Telemetry) => boolean
}

const DIALS: Dial[] = [
  {
    label: 'BOOST',
    unit: 'bar',
    min: -1,
    max: 2,
    digits: 2,
    value: (t) => t.induction.boost / 1e5,
    shown: (t) => t.induction.kind !== 'none',
  },
  {
    label: 'MAP',
    unit: 'kPa',
    min: 0,
    max: 110,
    digits: 0,
    value: (t) => t.manifold / 1000,
    shown: (t) => t.induction.kind === 'none',
  },
  {
    label: 'λ',
    unit: '',
    min: 0.6,
    max: 1.4,
    digits: 2,
    warn: 1.1,
    value: (t) =>
      t.fuel.overrunCut || t.fuel.limiterCut ? NaN : t.fuel.lambda,
  },
  {
    label: 'COOLANT',
    unit: '°C',
    min: 40,
    max: 130,
    digits: 0,
    warn: 110,
    value: (t) => t.coolant - 273.15,
  },
  {
    label: 'EXHAUST',
    unit: '°C',
    min: 0,
    max: 1000,
    digits: 0,
    warn: AFTERFIRE_TEMPERATURE - 273.15,
    value: (t) => t.exhaustWall - 273.15,
  },
]

/**
 * Analogue tachometer and small dials, drawn on a canvas each animation
 * frame from the latest telemetry snapshot. Nothing here re-renders React.
 */
export function Gauges({
  telemetry,
  revLimit,
  mechanicalLimit,
}: {
  telemetry: RefObject<Telemetry | null>
  revLimit: number
  mechanicalLimit: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const scale = Math.ceil((mechanicalLimit * 1.08) / 1000) * 1000
    let needle = 0
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const t = telemetry.current
      if (!t) return
      const ratio = window.devicePixelRatio || 1
      const width = element.clientWidth
      const height = element.clientHeight
      // Hidden or collapsed (for example while navigating): nothing to draw.
      if (width < 120 || height < 60) return
      if (element.width !== width * ratio) element.width = width * ratio
      if (element.height !== height * ratio) element.height = height * ratio
      const c = context
      c.setTransform(ratio, 0, 0, ratio, 0, 0)
      c.clearRect(0, 0, width, height)
      // Needle eases towards telemetry, which arrives at about 20 Hz.
      needle += (t.rpm - needle) * 0.35
      const tachSize = Math.min(height, width * 0.46)
      const cx = tachSize / 2 + 4
      const cy = tachSize / 2 + 2
      const r = tachSize / 2 - 6
      const start = Math.PI * 0.75
      const sweep = Math.PI * 1.5
      const angle = (rpm: number) =>
        start + (sweep * Math.min(Math.max(rpm, 0), scale)) / scale
      c.lineCap = 'round'
      c.lineWidth = 6
      c.strokeStyle = '#25343e'
      c.beginPath()
      c.arc(cx, cy, r, start, start + sweep)
      c.stroke()
      c.strokeStyle = '#edb167'
      c.beginPath()
      c.arc(cx, cy, r, angle(revLimit), angle(mechanicalLimit))
      c.stroke()
      c.strokeStyle = '#e5675b'
      c.beginPath()
      c.arc(cx, cy, r, angle(mechanicalLimit), start + sweep)
      c.stroke()
      c.fillStyle = '#99aeb9'
      c.font = `${Math.max(9, r * 0.13)}px Saira Condensed, sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      const step = scale > 12000 ? 2000 : 1000
      for (let rpm = 0; rpm <= scale; rpm += step) {
        const a = angle(rpm)
        c.strokeStyle = '#5d7280'
        c.lineWidth = 2
        c.beginPath()
        c.moveTo(cx + Math.cos(a) * (r - 9), cy + Math.sin(a) * (r - 9))
        c.lineTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16))
        c.stroke()
        c.fillText(
          String(rpm / 1000),
          cx + Math.cos(a) * (r - 28),
          cy + Math.sin(a) * (r - 28),
        )
      }
      const a = angle(needle)
      c.strokeStyle = t.limited ? '#e5675b' : '#f3f6f8'
      c.lineWidth = 3
      c.beginPath()
      c.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10)
      c.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12))
      c.stroke()
      c.fillStyle = '#edb167'
      c.beginPath()
      c.arc(cx, cy, 5, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#f3f6f8'
      c.font = `600 ${Math.max(14, r * 0.26)}px Saira Condensed, sans-serif`
      c.fillText(Math.round(t.rpm).toLocaleString(), cx, cy + r * 0.45)
      c.fillStyle = '#99aeb9'
      c.font = `${Math.max(9, r * 0.12)}px Saira Condensed, sans-serif`
      c.fillText('RPM × 1000', cx, cy + r * 0.7)
      // Small dials in a 2 × 2 grid to the right of the tachometer.
      const dials = DIALS.filter((d) => !d.shown || d.shown(t))
      const left = tachSize + 14
      const cellWidth = (width - left) / 2
      const cellHeight = height / 2
      dials.slice(0, 4).forEach((d, i) => {
        const x = left + (i % 2) * cellWidth + cellWidth / 2
        const y = Math.floor(i / 2) * cellHeight + cellHeight * 0.55
        const radius = Math.max(4, Math.min(cellWidth, cellHeight) * 0.38)
        const value = d.value(t)
        const share = Number.isFinite(value)
          ? Math.min(Math.max((value - d.min) / (d.max - d.min), 0), 1)
          : 0
        const begin = Math.PI
        c.lineWidth = 4
        c.strokeStyle = '#25343e'
        c.beginPath()
        c.arc(x, y, radius, begin, begin + Math.PI)
        c.stroke()
        const warn = d.warn !== undefined && value >= d.warn
        c.strokeStyle = warn ? '#e5675b' : '#62b2c9'
        if (share > 0) {
          c.beginPath()
          c.arc(x, y, radius, begin, begin + Math.PI * share)
          c.stroke()
        }
        c.fillStyle = '#f3f6f8'
        c.font = `600 ${Math.max(12, radius * 0.5)}px Saira Condensed, sans-serif`
        c.fillText(
          Number.isFinite(value) ? formatFixed(value, d.digits) : '—',
          x,
          y - radius * 0.2,
        )
        c.fillStyle = '#99aeb9'
        c.font = `${Math.max(8, radius * 0.3)}px Saira Condensed, sans-serif`
        c.fillText(`${d.label}${d.unit ? ` · ${d.unit}` : ''}`, x, y + radius * 0.35)
      })
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [telemetry, revLimit, mechanicalLimit])
  return (
    <canvas
      ref={canvas}
      className="gauge-cluster"
      role="img"
      aria-label="Tachometer and gauges"
    />
  )
}
