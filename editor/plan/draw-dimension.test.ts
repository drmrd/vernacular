import { describe, it, expect } from 'vitest'
import { drawDimension, type DrawableDimension } from './draw-dimension'
import { recordingContext } from './draw-plan-test-fixtures'
import type { Viewport } from './viewport'
import { DEFAULT_METRIC_PREFERENCES, type DimensionSceneNode } from '../../core'

// A non-trivial scale and pan so the projection is observable rather than an
// identity map, mirroring the underlay and opening draw tests.
const VIEWPORT: Viewport = { scale: 0.05, offset: { x: 31, y: 47 } }

const PREFERENCES = DEFAULT_METRIC_PREFERENCES

// A horizontal one-meter dimension offset 200 mm perpendicular to its measured
// segment, so the dimension line, two extension lines, and two arrowheads are
// all geometrically distinct.
const DIMENSION_LENGTH_MM = 1000
const DIMENSION_OFFSET_MM = 200

function dimensionNode(overrides: Partial<DimensionSceneNode> = {}): DimensionSceneNode {
  return {
    id: 'dimension:d1',
    kind: 'dimension',
    floorId: 'g',
    start: { x: 0, y: 0 },
    end: { x: DIMENSION_LENGTH_MM, y: 0 },
    offset: DIMENSION_OFFSET_MM,
    length: DIMENSION_LENGTH_MM,
    ...overrides,
  }
}

function drawable(
  options: { selected?: boolean; node?: Partial<DimensionSceneNode> } = {},
): DrawableDimension {
  return {
    node: dimensionNode(options.node),
    selected: options.selected ?? false,
  }
}

function countOp(ops: readonly string[], name: string): number {
  return ops.filter((op) => op === name).length
}

// Thresholds chosen well below the expected counts (one dimension line, two
// extension lines, and two arrowheads), so the assertions pin presence and
// rough magnitude without depending on the exact path construction.
const MIN_LINE_TO_OPS = 4
const MIN_MOVE_TO_OPS = 3

describe('drawDimension', () => {
  it('fills the formatted measured length as label text', () => {
    const recorder = recordingContext()

    drawDimension(recorder.ctx, drawable(), VIEWPORT, PREFERENCES)

    // A metre-scale dimension reads in metres with two decimals under the
    // adaptive metric rule: 1000 mm renders as "1.00 m", not "1000 mm".
    const expected = '1.00 m'
    expect(countOp(recorder.ops, 'fillText')).toBeGreaterThanOrEqual(1)
    expect(recorder.texts.map((entry) => entry.text)).toContain(expected)
  })

  it('strokes the dimension line, extension lines, and arrowheads', () => {
    const recorder = recordingContext()

    drawDimension(recorder.ctx, drawable(), VIEWPORT, PREFERENCES)

    // The dimension line, the two extension lines, and the two arrowhead vees
    // each produce stroked path output, so several path ops accumulate.
    expect(countOp(recorder.ops, 'stroke')).toBeGreaterThanOrEqual(1)
    expect(countOp(recorder.ops, 'moveTo')).toBeGreaterThanOrEqual(MIN_MOVE_TO_OPS)
    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(MIN_LINE_TO_OPS)
  })

  it('emits an extra highlight stroke when the dimension is selected', () => {
    const plainRecorder = recordingContext()
    const selectedRecorder = recordingContext()

    drawDimension(plainRecorder.ctx, drawable({ selected: false }), VIEWPORT, PREFERENCES)
    drawDimension(selectedRecorder.ctx, drawable({ selected: true }), VIEWPORT, PREFERENCES)

    expect(countOp(selectedRecorder.ops, 'stroke')).toBeGreaterThan(
      countOp(plainRecorder.ops, 'stroke'),
    )
  })
})
