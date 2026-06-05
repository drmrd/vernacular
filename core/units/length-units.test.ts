import { describe, expect, it } from 'vitest'
import {
  centimetersToMillimeters,
  feetToMillimeters,
  inchesToMillimeters,
  metersToMillimeters,
  millimetersToCentimeters,
  millimetersToFeet,
  millimetersToInches,
  millimetersToMeters,
} from './length-units'

describe('length unit conversions', () => {
  it('converts inches to millimeters without floating-point drift', () => {
    expect(inchesToMillimeters(1)).toBe(25.4)
    expect(inchesToMillimeters(80)).toBe(2032)
  })

  it('converts millimeters back to inches exactly', () => {
    expect(millimetersToInches(2032)).toBe(80)
  })

  it('converts feet to millimeters without floating-point drift', () => {
    expect(feetToMillimeters(1)).toBe(304.8)
    expect(feetToMillimeters(6)).toBe(1828.8)
  })

  it('converts millimeters back to feet exactly', () => {
    expect(millimetersToFeet(1828.8)).toBe(6)
  })

  it('converts meters to millimeters exactly', () => {
    expect(metersToMillimeters(2.03)).toBe(2030)
  })

  it('converts millimeters back to meters exactly', () => {
    expect(millimetersToMeters(2030)).toBe(2.03)
  })

  it('converts centimeters to millimeters exactly', () => {
    expect(centimetersToMillimeters(203)).toBe(2030)
  })

  it('converts millimeters back to centimeters exactly', () => {
    expect(millimetersToCentimeters(2030)).toBe(203)
  })
})
