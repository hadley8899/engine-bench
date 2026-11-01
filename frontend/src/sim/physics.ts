import type {
  Conditions,
  EngineDefinition,
  Metres,
  Pascals,
  RadiansPerSecond,
} from './schema'
export const TAU = Math.PI * 2
export const CYCLE = Math.PI * 4
export const R = 287
export const CV = 718
export const CP = CV + R
/** Valve flow keeps a fixed cold-air ratio of specific heats. */
export const GAMMA = CP / CV
/**
 * In-cylinder gas uses cv rising linearly with temperature, a fitted
 * approximation of air/burned-gas properties (γ ≈ 1.40 at 300 K, ≈ 1.26 at
 * 2,500 K). It lowers peak temperature and cycle efficiency versus cold air.
 */
export const CV_A = 660
export const CV_B = 0.17
/** Specific internal energy (J/kg) relative to 0 K. */
export const internalEnergy = (temperature: number) =>
  temperature * (CV_A + 0.5 * CV_B * temperature)
/** Inverse of internalEnergy, written to avoid cancellation. */
export const temperatureFromEnergy = (energy: number) =>
  (2 * energy) / (CV_A + Math.sqrt(CV_A * CV_A + 2 * CV_B * energy))
export const enthalpy = (temperature: number) =>
  internalEnergy(temperature) + R * temperature
export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))
export const wrap = (angle: number) => ((angle % CYCLE) + CYCLE) % CYCLE
export const rpmToOmega = (rpm: number) =>
  ((rpm * TAU) / 60) as RadiansPerSecond
export const omegaToRpm = (omega: RadiansPerSecond | number) =>
  (omega * 60) / TAU
export const powerKw = (torque: number, omega: RadiansPerSecond) =>
  (torque * omega) / 1000
export function pistonTravel(
  angle: number,
  stroke: Metres,
  rod: Metres,
): Metres {
  const r = stroke / 2
  return (r * (1 - Math.cos(angle)) +
    rod -
    Math.sqrt(rod * rod - (r * Math.sin(angle)) ** 2)) as Metres
}
export function geometry(e: EngineDefinition, angle: number) {
  const area = (Math.PI * e.bore ** 2) / 4
  const r = e.stroke / 2
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  return {
    volume:
      (area * e.stroke) / (e.compression - 1) +
      area * pistonTravel(angle, e.stroke as Metres, e.rodLength as Metres),
    derivative:
      area *
      (r * sin +
        (r * r * sin * cos) / Math.sqrt(e.rodLength ** 2 - r * r * sin * sin)),
  }
}
/** Quasi-steady isentropic orifice with sonic choking; Cd is included in effective area. */
export function massFlow(
  upstream: Pascals,
  downstream: Pascals,
  temperature: number,
  area: number,
) {
  if (upstream <= downstream || area <= 0) return 0
  const ratio = clamp(downstream / upstream, 0.001, 1)
  const critical = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1))
  const factor =
    ratio <= critical
      ? Math.sqrt(GAMMA) *
        (2 / (GAMMA + 1)) ** ((GAMMA + 1) / (2 * (GAMMA - 1)))
      : Math.sqrt(
          ((2 * GAMMA) / (GAMMA - 1)) *
            (ratio ** (2 / GAMMA) - ratio ** ((GAMMA + 1) / GAMMA)),
        )
  return ((area * upstream) / Math.sqrt(R * temperature)) * factor
}
export function atmosphere(c: Conditions) {
  const cel = c.temperature - 273.15
  const waterPressure =
    c.humidity * 610.94 * Math.exp((17.625 * cel) / (cel + 243.04))
  const dryPressure = c.pressure - waterPressure
  const dryDensity = dryPressure / (R * c.temperature)
  const density = dryDensity + waterPressure / (461.5 * c.temperature)
  // Oxygen is dry-gas mole/volume fraction; other dry gas is approximated by N2.
  const oxygenMassFraction =
    ((dryDensity / density) * c.oxygen * 32) /
    (c.oxygen * 32 + (1 - c.oxygen) * 28)
  return { density, waterPressure, dryPressure, oxygenMassFraction }
}
export function wiebe(progress: number) {
  return 1 - Math.exp(-6.9 * clamp(progress, 0, 1) ** 3)
}
export function phaseName(degrees: number) {
  if (degrees < 180) return 'Power'
  if (degrees < 360) return 'Exhaust'
  if (degrees < 540) return 'Intake'
  return 'Compression'
}
