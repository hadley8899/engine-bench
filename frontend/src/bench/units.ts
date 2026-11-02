/** Display-only unit conversions; the simulation and stored runs stay SI. */
export type PowerUnit = 'kW' | 'hp' | 'PS'
export type TorqueUnit = 'Nm' | 'lb·ft'

/** Watts per unit: mechanical horsepower and metric horsepower (PS). */
const WATTS: Record<PowerUnit, number> = {
  kW: 1000,
  hp: 745.69987158227,
  PS: 735.49875,
}
/** Newton-metres per pound-foot. */
const NM_PER_LBFT = 1.3558179483314

export const fromKw = (kw: number, unit: PowerUnit) => (kw * 1000) / WATTS[unit]
export const fromNm = (nm: number, unit: TorqueUnit) =>
  unit === 'Nm' ? nm : nm / NM_PER_LBFT
export const POWER_UNITS: PowerUnit[] = ['kW', 'hp', 'PS']
export const TORQUE_UNITS: TorqueUnit[] = ['Nm', 'lb·ft']

/** Fixed decimals without a misleading negative zero ("-0.00"). */
export function formatFixed(value: number, digits: number) {
  const text = value.toFixed(digits)
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text
}
