import { describe, it, expect } from 'vitest'
import type { FurnitureFootprint, Point } from '../../core'
import { FURNITURE_ROTATION_STEP_DEGREES, furnitureGhostAt, rotatedBy } from './place-furniture'

const GHOST_X_MM = 100
const GHOST_Y_MM = 200
const GHOST_ROTATION_DEGREES = 90
const FOOTPRINT_WIDTH_MM = 500
const FOOTPRINT_DEPTH_MM = 520

const ROTATION_STEP_DEGREES = 15
const NEAR_FULL_TURN_DEGREES = 350
const WRAP_ABOVE_RESULT_DEGREES = 5
const SMALL_ROTATION_DEGREES = 10
const WRAP_BELOW_RESULT_DEGREES = 355

describe('furnitureGhostAt', () => {
  it('builds a ghost from the cursor position, rotation, and footprint', () => {
    const point: Point = { x: GHOST_X_MM, y: GHOST_Y_MM }
    const footprint: FurnitureFootprint = { width: FOOTPRINT_WIDTH_MM, depth: FOOTPRINT_DEPTH_MM }

    expect(furnitureGhostAt(point, GHOST_ROTATION_DEGREES, footprint)).toEqual({
      position: { x: GHOST_X_MM, y: GHOST_Y_MM },
      rotation: GHOST_ROTATION_DEGREES,
      footprint: { width: FOOTPRINT_WIDTH_MM, depth: FOOTPRINT_DEPTH_MM },
    })
  })
})

describe('rotatedBy', () => {
  it('wraps past a full turn back into [0, 360)', () => {
    expect(rotatedBy(NEAR_FULL_TURN_DEGREES, ROTATION_STEP_DEGREES)).toBe(WRAP_ABOVE_RESULT_DEGREES)
  })

  it('wraps below zero back into [0, 360)', () => {
    expect(rotatedBy(SMALL_ROTATION_DEGREES, -ROTATION_STEP_DEGREES)).toBe(
      WRAP_BELOW_RESULT_DEGREES,
    )
  })
})

describe('FURNITURE_ROTATION_STEP_DEGREES', () => {
  it('is the coarse 15 degree step used by the rotate key', () => {
    expect(FURNITURE_ROTATION_STEP_DEGREES).toBe(ROTATION_STEP_DEGREES)
  })
})
