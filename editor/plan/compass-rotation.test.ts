import { describe, it, expect } from 'vitest'
import { compassNeedleRotationDegrees } from './compass-rotation'

describe('compassNeedleRotationDegrees', () => {
  it('leaves the needle pointing up for a zero bearing', () => {
    expect(compassNeedleRotationDegrees(0)).toBeCloseTo(0)
  })

  it('swings a quarter-turn bearing to the matching screen angle', () => {
    // A +pi/2 bearing places true north a quarter turn counterclockwise from
    // plan-up in the y-up world frame. The screen frame is y-down, so the sign
    // flips to a -90 degree SVG rotation, swinging the needle toward the left.
    expect(compassNeedleRotationDegrees(Math.PI / 2)).toBeCloseTo(-90)
  })

  it('mirrors the rotation for the opposite bearing', () => {
    expect(compassNeedleRotationDegrees(-Math.PI / 2)).toBeCloseTo(90)
  })
})
