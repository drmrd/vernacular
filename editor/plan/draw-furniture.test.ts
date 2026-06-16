import { describe, it, expect } from 'vitest'
import { drawFurniture, furnitureSymbol, type DrawableFurniture } from './draw-furniture'
import { recordingContext } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'
import type { Viewport } from './viewport'
import { createFurnitureInstance, type FurnitureInstance, type Point } from '../../core'

// A non-trivial scale and pan so the projection is observable rather than an
// identity map, mirroring the opening draw test.
const VIEWPORT: Viewport = { scale: 0.05, offset: { x: 31, y: 47 } }
const RENDER = { viewport: VIEWPORT, palette: DEFAULT_PLAN_PALETTE }

// A 400 mm wide by 200 mm deep footprint centered at (1000, 500): the corners
// sit half-width (200 mm) out in x and half-depth (100 mm) out in y.
const POSITION_X_MM = 1000
const POSITION_Y_MM = 500
const FOOTPRINT_WIDTH_MM = 400
const FOOTPRINT_DEPTH_MM = 200
const HALF_WIDTH_MM = FOOTPRINT_WIDTH_MM / 2
const HALF_DEPTH_MM = FOOTPRINT_DEPTH_MM / 2
const LEFT_X_MM = POSITION_X_MM - HALF_WIDTH_MM
const RIGHT_X_MM = POSITION_X_MM + HALF_WIDTH_MM
const TOP_Y_MM = POSITION_Y_MM - HALF_DEPTH_MM
const BOTTOM_Y_MM = POSITION_Y_MM + HALF_DEPTH_MM

const FOOTPRINT_CORNER_COUNT = 4
const QUARTER_TURN_DEGREES = 90
const ROTATION_TOLERANCE = 1e-6

function instanceAt(
  overrides: Partial<{ rotation: number; name: string }> = {},
): FurnitureInstance {
  return createFurnitureInstance({
    assetRef: { scope: 'user', contentHash: 'abc123' },
    position: { x: POSITION_X_MM, y: POSITION_Y_MM },
    footprint: { width: FOOTPRINT_WIDTH_MM, depth: FOOTPRINT_DEPTH_MM },
    ...(overrides.rotation !== undefined ? { rotation: overrides.rotation } : {}),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
  })
}

function drawable(options: Partial<DrawableFurniture> = {}): DrawableFurniture {
  return {
    instance: options.instance ?? instanceAt(),
    selected: options.selected ?? false,
  }
}

function countOp(ops: readonly string[], name: string): number {
  return ops.filter((op) => op === name).length
}

describe('furnitureSymbol', () => {
  it('places the four footprint corners around the position for an unrotated item', () => {
    const symbol = furnitureSymbol(instanceAt())

    expect(symbol.corners).toHaveLength(FOOTPRINT_CORNER_COUNT)
    expect(symbol.corners).toEqual(
      expect.arrayContaining([
        { x: LEFT_X_MM, y: TOP_Y_MM },
        { x: RIGHT_X_MM, y: TOP_Y_MM },
        { x: RIGHT_X_MM, y: BOTTOM_Y_MM },
        { x: LEFT_X_MM, y: BOTTOM_Y_MM },
      ]),
    )
  })

  it('uses the instance name as the label, falling back to a default when unnamed', () => {
    const named = furnitureSymbol(instanceAt({ name: 'Reading chair' }))
    const unnamed = furnitureSymbol(instanceAt())

    expect(named.label).toBe('Reading chair')
    expect(unnamed.label.length).toBeGreaterThan(0)
  })

  it('turns the footprint so a quarter turn changes the corner positions', () => {
    const unrotated = furnitureSymbol(instanceAt())
    const rotated = furnitureSymbol(instanceAt({ rotation: QUARTER_TURN_DEGREES }))

    // A quarter turn swaps the rectangle's extents about its center: the rotated
    // footprint reaches half the depth out in x and half the width out in y.
    const xs = rotated.corners.map((corner: Point) => corner.x)
    const ys = rotated.corners.map((corner: Point) => corner.y)
    expect(Math.max(...xs)).toBeCloseTo(POSITION_X_MM + HALF_DEPTH_MM)
    expect(Math.max(...ys)).toBeCloseTo(POSITION_Y_MM + HALF_WIDTH_MM)

    const farthestX = unrotated.corners.find(
      (corner: Point) => Math.abs(corner.x - RIGHT_X_MM) < ROTATION_TOLERANCE,
    )
    expect(farthestX).toBeDefined()
    expect(Math.max(...xs)).not.toBeCloseTo(RIGHT_X_MM)
  })
})

describe('drawFurniture', () => {
  it('paints the footprint as a closed polygon and writes the label', () => {
    const recorder = recordingContext()
    const instance = instanceAt({ name: 'Reading chair' })

    drawFurniture(recorder.ctx, drawable({ instance }), RENDER)

    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(3)
    expect(countOp(recorder.ops, 'closePath')).toBeGreaterThanOrEqual(1)
    const labelText = recorder.texts.find((entry) => entry.text === 'Reading chair')
    expect(labelText).toBeDefined()
  })

  it('emits an extra highlight stroke when the furniture is selected', () => {
    const plainRecorder = recordingContext()
    const selectedRecorder = recordingContext()

    drawFurniture(plainRecorder.ctx, drawable({ selected: false }), RENDER)
    drawFurniture(selectedRecorder.ctx, drawable({ selected: true }), RENDER)

    expect(countOp(selectedRecorder.ops, 'stroke')).toBeGreaterThan(
      countOp(plainRecorder.ops, 'stroke'),
    )
  })
})
