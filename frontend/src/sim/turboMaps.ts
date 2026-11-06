import { clamp } from './physics'

/**
 * Dimensionless representative radial-compressor map. Flow is
 * mDot/(rho·tipSpeed·wheelDiameter²); speed is corrected shaft speed divided
 * by the map's rated speed. Values are an original, smooth representative
 * map following the corrected-coordinate conventions documented by Garrett
 * and NASA, not digitised data for a branded wheel.
 */
const COMPRESSOR_SPEEDS = [0.45, 0.6, 0.75, 0.9, 1, 1.1] as const
const COMPRESSOR_FLOW = [0.04, 0.06, 0.085, 0.11, 0.13, 0.145] as const
const COMPRESSOR_PRESSURE = [
  [1.26, 1.24, 1.2, 1.14, 1.07, 1],
  [1.5, 1.47, 1.39, 1.28, 1.14, 1],
  [1.85, 1.8, 1.66, 1.48, 1.24, 1],
  [2.25, 2.17, 1.98, 1.73, 1.38, 1],
  [2.55, 2.47, 2.25, 1.94, 1.48, 1],
  [2.92, 2.8, 2.52, 2.12, 1.58, 1],
] as const
const COMPRESSOR_EFFICIENCY = [0.58, 0.7, 0.76, 0.73, 0.63, 0.48] as const

function bracket(axis: readonly number[], value: number) {
  if (value <= axis[0]) return { lo: 0, hi: 0, share: 0 }
  const last = axis.length - 1
  if (value >= axis[last]) return { lo: last, hi: last, share: 0 }
  let hi = 1
  while (value > axis[hi]) hi++
  const lo = hi - 1
  return { lo, hi, share: (value - axis[lo]) / (axis[hi] - axis[lo]) }
}

function onCompressorLine(line: number, pressureRatio: number) {
  const pressures = COMPRESSOR_PRESSURE[line]
  const surge = pressures[0]
  if (pressureRatio >= surge)
    return {
      flowCoefficient: COMPRESSOR_FLOW[0],
      efficiency: COMPRESSOR_EFFICIENCY[0],
      surge: true,
      choke: false,
    }
  if (pressureRatio <= 1)
    return {
      flowCoefficient: COMPRESSOR_FLOW.at(-1)!,
      efficiency: COMPRESSOR_EFFICIENCY.at(-1)!,
      surge: false,
      choke: true,
    }
  let hi = 1
  while (pressureRatio < pressures[hi] && hi < pressures.length - 1) hi++
  const lo = hi - 1
  const share =
    (pressures[lo] - pressureRatio) / (pressures[lo] - pressures[hi])
  return {
    flowCoefficient:
      COMPRESSOR_FLOW[lo] +
      (COMPRESSOR_FLOW[hi] - COMPRESSOR_FLOW[lo]) * share,
    efficiency:
      COMPRESSOR_EFFICIENCY[lo] +
      (COMPRESSOR_EFFICIENCY[hi] - COMPRESSOR_EFFICIENCY[lo]) * share,
    surge: false,
    choke: hi === pressures.length - 1 && share > 0.9,
  }
}

export function representativeCompressor(
  correctedSpeedRatio: number,
  pressureRatio: number,
) {
  const speed = bracket(COMPRESSOR_SPEEDS, correctedSpeedRatio)
  const a = onCompressorLine(speed.lo, pressureRatio)
  const b = onCompressorLine(speed.hi, pressureRatio)
  const mix = (x: number, y: number) => x + (y - x) * speed.share
  return {
    flowCoefficient: mix(a.flowCoefficient, b.flowCoefficient),
    efficiency: mix(a.efficiency, b.efficiency),
    surge: a.surge && b.surge,
    choke: a.choke && b.choke,
  }
}

const TURBINE_RATIOS = [1, 1.2, 1.5, 2, 3, 4] as const
const TURBINE_FLOW = [0, 0.56, 0.8, 0.94, 0.99, 1] as const
const TURBINE_SPEEDS = [0.35, 0.55, 0.75, 0.95, 1.1, 1.3, 1.5] as const
const TURBINE_EFFICIENCY = [
  [0.2, 0.4, 0.52, 0.56, 0.52, 0.48],
  [0.22, 0.48, 0.64, 0.7, 0.68, 0.63],
  [0.2, 0.5, 0.69, 0.76, 0.74, 0.69],
  [0.18, 0.46, 0.65, 0.72, 0.71, 0.67],
  [0.12, 0.26, 0.36, 0.4, 0.35, 0.31],
  [0.08, 0.16, 0.22, 0.24, 0.2, 0.17],
  [0.05, 0.08, 0.11, 0.12, 0.1, 0.08],
] as const

/** Representative radial-turbine corrected-flow and efficiency map. */
export function representativeTurbine(
  correctedSpeedRatio: number,
  expansionRatio: number,
) {
  const speed = bracket(TURBINE_SPEEDS, correctedSpeedRatio)
  const ratio = bracket(TURBINE_RATIOS, clamp(expansionRatio, 1, 4))
  const at = (line: number) =>
    TURBINE_EFFICIENCY[line][ratio.lo] +
    (TURBINE_EFFICIENCY[line][ratio.hi] -
      TURBINE_EFFICIENCY[line][ratio.lo]) *
      ratio.share
  return {
    flowCapacity:
      TURBINE_FLOW[ratio.lo] +
      (TURBINE_FLOW[ratio.hi] - TURBINE_FLOW[ratio.lo]) * ratio.share,
    efficiency: at(speed.lo) + (at(speed.hi) - at(speed.lo)) * speed.share,
    choked: expansionRatio >= 3,
  }
}
