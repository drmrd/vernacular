import { describe, it, expect } from 'vitest'
import {
  colorTemperatureLabel,
  formatColorTemperature,
  kelvinToLinearRgb,
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  DEFAULT_COLOR_TEMPERATURE_K,
} from './color-temperature'

describe('kelvinToLinearRgb', () => {
  it('warms toward red at the low end (r > g > b)', () => {
    const warm = kelvinToLinearRgb(MIN_COLOR_TEMPERATURE_K)
    expect(warm.r).toBeGreaterThan(warm.g)
    expect(warm.g).toBeGreaterThan(warm.b)
  })

  it('is close to a neutral white at the high end', () => {
    const cool = kelvinToLinearRgb(MAX_COLOR_TEMPERATURE_K)
    const lowestChannel = Math.min(cool.r, cool.g, cool.b)
    expect(lowestChannel).toBeGreaterThan(0.8)
  })

  it('raises the blue channel as the temperature rises', () => {
    const warm = kelvinToLinearRgb(3000)
    const mid = kelvinToLinearRgb(4500)
    const cool = kelvinToLinearRgb(6000)
    expect(mid.b).toBeGreaterThan(warm.b)
    expect(cool.b).toBeGreaterThan(mid.b)
  })

  it('normalizes the brightest channel to one at every temperature', () => {
    for (const kelvin of [2700, 3500, 5000, 6500]) {
      const rgb = kelvinToLinearRgb(kelvin)
      expect(Math.max(rgb.r, rgb.g, rgb.b)).toBeCloseTo(1, 5)
    }
  })

  it('clamps inputs outside the supported band', () => {
    expect(kelvinToLinearRgb(1000)).toEqual(kelvinToLinearRgb(MIN_COLOR_TEMPERATURE_K))
    expect(kelvinToLinearRgb(10000)).toEqual(kelvinToLinearRgb(MAX_COLOR_TEMPERATURE_K))
  })

  it('defaults to the cool end of the supported band', () => {
    expect(DEFAULT_COLOR_TEMPERATURE_K).toBe(MAX_COLOR_TEMPERATURE_K)
  })
})

describe('formatColorTemperature', () => {
  it('formats the cool end as a readable Kelvin value with its unit', () => {
    expect(formatColorTemperature(MAX_COLOR_TEMPERATURE_K)).toBe('6500 K')
  })

  it('formats the warm end as a readable Kelvin value with its unit', () => {
    expect(formatColorTemperature(MIN_COLOR_TEMPERATURE_K)).toBe('2700 K')
  })
})

describe('colorTemperatureLabel', () => {
  it('describes the low end of the band as warm', () => {
    expect(colorTemperatureLabel(MIN_COLOR_TEMPERATURE_K)).toBe('warm')
  })

  it('describes the high end of the band as cool', () => {
    expect(colorTemperatureLabel(MAX_COLOR_TEMPERATURE_K)).toBe('cool')
  })
})
