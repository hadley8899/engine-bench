import { describe, expect, it } from 'vitest'
import { formatFixed, fromKw, fromNm } from './units'

describe('display units', () => {
  it('converts power from kW', () => {
    expect(fromKw(100, 'kW')).toBe(100)
    expect(fromKw(100, 'hp')).toBeCloseTo(134.102, 3)
    expect(fromKw(100, 'PS')).toBeCloseTo(135.962, 3)
    expect(fromKw(0.7457, 'hp')).toBeCloseTo(1, 4)
  })
  it('converts torque from Nm', () => {
    expect(fromNm(280, 'Nm')).toBe(280)
    expect(fromNm(280, 'lb·ft')).toBeCloseTo(206.517, 3)
    expect(fromNm(1.3558179483314, 'lb·ft')).toBeCloseTo(1, 12)
  })
  it('never shows a negative zero', () => {
    expect(formatFixed(-0.001, 2)).toBe('0.00')
    expect(formatFixed(-0.004, 0)).toBe('0')
    expect(formatFixed(-0.1, 2)).toBe('-0.10')
  })
})
