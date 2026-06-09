import { describe, it, expect } from 'vitest'
import { drawOpening, type DrawableOpening } from './draw-opening'
import { recordingContext } from './draw-plan-test-fixtures'
import type { Viewport } from './viewport'
import type { OpeningSceneNode } from '../../core'

// A non-trivial scale and pan so the projection is observable rather than an
// identity map, mirroring the underlay draw test.
const VIEWPORT: Viewport = { scale: 0.05, offset: { x: 31, y: 47 } }

// A horizontal opening: center off the origin, leaf running along +x, the
// host-wall left-hand normal pointing +y, a residential door width, and a
// typical interior-wall thickness.
const OPENING_CENTER_X_MM = 1000
const OPENING_WIDTH_MM = 800
const OPENING_HEIGHT_MM = 2032
const OPENING_SILL_HEIGHT_MM = 0
const HOST_THICKNESS_MM = 114

function openingNode(overrides: Partial<OpeningSceneNode> = {}): OpeningSceneNode {
  return {
    id: 'opening:a',
    kind: 'opening',
    floorId: 'f',
    type: 'single-swing-door',
    center: { x: OPENING_CENTER_X_MM, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: OPENING_HEIGHT_MM,
    sillHeight: OPENING_SILL_HEIGHT_MM,
    hostThickness: HOST_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
    ...overrides,
  }
}

function drawable(
  symbol: string,
  options: { double?: boolean; selected?: boolean; node?: Partial<OpeningSceneNode> } = {},
): DrawableOpening {
  return {
    node: openingNode(options.node),
    symbol,
    double: options.double ?? false,
    selected: options.selected ?? false,
  }
}

function countOp(ops: readonly string[], name: string): number {
  return ops.filter((op) => op === name).length
}

describe('drawOpening', () => {
  it('breaks the host wall by filling the opening footprint and stroking the jamb caps', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-swing'), VIEWPORT)

    // The gap is painted: at least one fill (the footprint in the background
    // color) so the wall stroke is broken, plus strokes for the jamb caps.
    expect(countOp(recorder.ops, 'fill')).toBeGreaterThanOrEqual(1)
    expect(countOp(recorder.ops, 'stroke')).toBeGreaterThanOrEqual(1)
  })

  it('draws a single swing leaf with exactly one arc for a single door', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-swing', { double: false }), VIEWPORT)

    expect(recorder.arcs).toHaveLength(1)
  })

  it('draws two mirrored swing leaves with exactly two arcs for a double door', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-swing', { double: true }), VIEWPORT)

    expect(recorder.arcs).toHaveLength(2)
  })

  it('draws a sliding door as a panel and track with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-slide'), VIEWPORT)

    expect(recorder.arcs).toHaveLength(0)
    // The panel and the track are line segments parallel to the wall.
    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(2)
  })

  it('draws a folding door as a multi-segment zigzag with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-fold'), VIEWPORT)

    expect(recorder.arcs).toHaveLength(0)
    // A bifold leaf is at least two segments beyond the gap jamb caps.
    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(2)
  })

  it('draws a pivot door with at least one arc', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-pivot'), VIEWPORT)

    expect(recorder.arcs.length).toBeGreaterThanOrEqual(1)
  })

  it('draws a cased opening as the gap only, with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('cased-opening'), VIEWPORT)

    // The gap-only symbol: jamb caps and the footprint fill, no swing arc.
    expect(recorder.arcs).toHaveLength(0)
  })

  it('draws a fixed window as a glazing line across the gap, with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('window-fixed'), VIEWPORT)

    expect(recorder.arcs).toHaveLength(0)
    // At least one line segment spans the opening as the glazing line.
    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(1)
  })

  it('draws a crank window with more segments than a fixed window, and no arcs', () => {
    const fixedRecorder = recordingContext()
    const crankRecorder = recordingContext()

    drawOpening(fixedRecorder.ctx, drawable('window-fixed'), VIEWPORT)
    drawOpening(crankRecorder.ctx, drawable('window-crank'), VIEWPORT)

    expect(crankRecorder.arcs).toHaveLength(0)
    // The crank window is the fixed-window glazing plus an opening-direction
    // tick, so it draws strictly more segments.
    expect(countOp(crankRecorder.ops, 'lineTo')).toBeGreaterThan(
      countOp(fixedRecorder.ops, 'lineTo'),
    )
  })

  it('emits an extra highlight stroke when the opening is selected', () => {
    const plainRecorder = recordingContext()
    const selectedRecorder = recordingContext()

    drawOpening(plainRecorder.ctx, drawable('door-swing', { selected: false }), VIEWPORT)
    drawOpening(selectedRecorder.ctx, drawable('door-swing', { selected: true }), VIEWPORT)

    expect(countOp(selectedRecorder.ops, 'stroke')).toBeGreaterThan(
      countOp(plainRecorder.ops, 'stroke'),
    )
  })
})
