import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  feetToMillimeters,
} from '../../core'
import { formatCoords } from './format-coords'

describe('formatCoords', () => {
  it('formats the world point as an x, y pair in metric', () => {
    expect(formatCoords({ x: 1000, y: 2000 }, DEFAULT_METRIC_PREFERENCES)).toBe('1.00 m, 2.00 m')
  })

  it('formats the pair in feet and inches for an imperial project', () => {
    const point = { x: feetToMillimeters(3), y: feetToMillimeters(4) }

    expect(formatCoords(point, DEFAULT_IMPERIAL_PREFERENCES)).toBe("3', 4'")
  })
})
