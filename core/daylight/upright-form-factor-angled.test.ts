// core/daylight/upright-form-factor-angled.test.ts
import { describe, expect, it } from 'vitest'
import { doorwayToGlazingFormFactor } from './upright-form-factor'
import type { UprightRectangle } from './upright-form-factor'
import {
  DOORWAY_HEAD,
  RIGHT_ANGLE_FACTOR,
  SUM_TOLERANCE,
  TOWARD_ROOM_FROM_GLAZING,
  WINDOW_HEAD,
  WINDOW_SILL,
  directSum,
  relativeError,
} from './upright-form-factor-test-support'

const DEGREES_PER_HALF_TURN = 180
const NEAR_RIGHT_ANGLE_OFFSET = 0.001
const RIGHT_ANGLE_LOOSE_TOLERANCE = 1e-4
const RIGHT_ANGLE_MEAN_TOLERANCE = 1e-8
const ANGLED_TOLERANCE = 1e-8
const ANGLED_WALL_NEAR = 1000
const ANGLED_WALL_FAR = 2000
const FORTY_FIVE_DEGREES = 45
const SIXTY_DEGREES = 60
const ONE_TWENTY_DEGREES = 120
const ONE_THIRTY_FIVE_DEGREES = 135
const RIGHT_ANGLE_DEGREES = 90

describe('the form factor from a doorway to glazing on a wall at another angle', () => {
  const angledGlazing: UprightRectangle = {
    span: [
      { x: ANGLED_WALL_NEAR, y: 0 },
      { x: ANGLED_WALL_FAR, y: 0 },
    ],
    sill: WINDOW_SILL,
    head: WINDOW_HEAD,
    facing: TOWARD_ROOM_FROM_GLAZING,
  }
  const doorwayAt = (degrees: number): UprightRectangle => {
    const radians = (degrees * Math.PI) / DEGREES_PER_HALF_TURN
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return {
      span: [
        { x: ANGLED_WALL_NEAR * cos, y: ANGLED_WALL_NEAR * sin },
        { x: ANGLED_WALL_FAR * cos, y: ANGLED_WALL_FAR * sin },
      ],
      sill: 0,
      head: DOORWAY_HEAD,
      facing: { x: sin, y: -cos },
    }
  }

  it.each([
    { angle: FORTY_FIVE_DEGREES, expected: 0.0808202834453 },
    { angle: SIXTY_DEGREES, expected: 0.053022464552 },
    { angle: ONE_TWENTY_DEGREES, expected: 0.00828487110367 },
    { angle: ONE_THIRTY_FIVE_DEGREES, expected: 0.00438336190336 },
  ])('gives $expected at $angle degrees', ({ angle, expected }) => {
    const doorway = doorwayAt(angle)
    const factor = doorwayToGlazingFormFactor(doorway, angledGlazing)
    expect(relativeError(factor, expected)).toBeLessThan(ANGLED_TOLERANCE)
    expect(relativeError(factor, directSum(doorway, angledGlazing))).toBeLessThan(SUM_TOLERANCE)
  })

  it('joins the right-angle value without a step', () => {
    const justBelow = doorwayToGlazingFormFactor(
      doorwayAt(RIGHT_ANGLE_DEGREES - NEAR_RIGHT_ANGLE_OFFSET),
      angledGlazing,
    )
    const justAbove = doorwayToGlazingFormFactor(
      doorwayAt(RIGHT_ANGLE_DEGREES + NEAR_RIGHT_ANGLE_OFFSET),
      angledGlazing,
    )
    expect(relativeError(justBelow, RIGHT_ANGLE_FACTOR)).toBeLessThan(RIGHT_ANGLE_LOOSE_TOLERANCE)
    expect(relativeError(justAbove, RIGHT_ANGLE_FACTOR)).toBeLessThan(RIGHT_ANGLE_LOOSE_TOLERANCE)
    expect(relativeError((justBelow + justAbove) / 2, RIGHT_ANGLE_FACTOR)).toBeLessThan(
      RIGHT_ANGLE_MEAN_TOLERANCE,
    )
  })

  it('gives 0 for a doorway that faces away', () => {
    const doorway = doorwayAt(FORTY_FIVE_DEGREES)
    const facingAway = { ...doorway, facing: { x: -doorway.facing.x, y: -doorway.facing.y } }
    expect(doorwayToGlazingFormFactor(facingAway, angledGlazing)).toBe(0)
  })
})
