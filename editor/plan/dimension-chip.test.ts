import { describe, it, expect } from 'vitest'
import { worldToScreen, type Viewport } from './viewport'
import {
  dimensionGeometry,
  DEFAULT_METRIC_PREFERENCES,
  type DimensionSceneNode,
  type Point,
} from '../../core'
import { dimensionChips, MIN_CHIP_LENGTH_PX, type DimensionChip } from './dimension-chip'

const PREFS = DEFAULT_METRIC_PREFERENCES
const UNIT_SCALE_VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const DIMENSION_OFFSET = 200
const THRESHOLD_MARGIN = 10

// A metre-scale dimension, far above the legibility threshold at unit scale, so
// the chip is kept and its label exercises the adaptive metric rule: 1000 mm
// reads in metres with two decimals as "1.00 m", not "1000 mm".
const LABELLED_LENGTH_MM = 1000
const LABELLED_LENGTH_LABEL = '1.00 m'

function horizontalDimension(id: string, length: number): DimensionSceneNode {
  const start: Point = { x: 0, y: 0 }
  const end: Point = { x: length, y: 0 }
  return {
    id,
    kind: 'dimension',
    floorId: 'floor:f1',
    start,
    end,
    offset: DIMENSION_OFFSET,
    length,
  }
}

function expectedScreen(dimension: DimensionSceneNode, viewport: Viewport) {
  const geometry = dimensionGeometry(dimension.start, dimension.end, dimension.offset)
  const midpoint: Point = {
    x: (geometry.lineStart.x + geometry.lineEnd.x) / 2,
    y: (geometry.lineStart.y + geometry.lineEnd.y) / 2,
  }
  return worldToScreen(midpoint, viewport)
}

describe('dimensionChips', () => {
  it('places a chip at the offset-line midpoint with the formatted length label', () => {
    const dimension = horizontalDimension('dimension:d1', LABELLED_LENGTH_MM)

    const chips = dimensionChips([dimension], UNIT_SCALE_VIEWPORT, PREFS)

    const expected: DimensionChip = {
      id: dimension.id,
      screen: expectedScreen(dimension, UNIT_SCALE_VIEWPORT),
      label: LABELLED_LENGTH_LABEL,
    }
    expect(chips).toEqual([expected])
  })

  it('drops a dimension whose on-screen length is below the legibility threshold', () => {
    const tooShort = horizontalDimension('dimension:short', MIN_CHIP_LENGTH_PX - THRESHOLD_MARGIN)

    expect(dimensionChips([tooShort], UNIT_SCALE_VIEWPORT, PREFS)).toEqual([])
  })

  it('keeps only the at-or-above-threshold dimension from a mixed set', () => {
    const tooShort = horizontalDimension('dimension:short', MIN_CHIP_LENGTH_PX - THRESHOLD_MARGIN)
    const longEnough = horizontalDimension('dimension:long', MIN_CHIP_LENGTH_PX + THRESHOLD_MARGIN)

    const chips = dimensionChips([tooShort, longEnough], UNIT_SCALE_VIEWPORT, PREFS)

    expect(chips.map((chip) => chip.id)).toEqual([longEnough.id])
  })
})
