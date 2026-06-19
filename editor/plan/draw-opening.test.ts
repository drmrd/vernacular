import { describe, it, expect } from 'vitest'
import { drawOpening, type DrawableOpening } from './draw-opening'
import { recordingContext } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'
import type { Viewport } from './viewport'
import type { OpeningSceneNode } from '../../core'

// A non-trivial scale and pan so the projection is observable rather than an
// identity map, mirroring the underlay draw test.
const VIEWPORT: Viewport = { scale: 0.05, offset: { x: 31, y: 47 } }
const RENDER = { viewport: VIEWPORT, palette: DEFAULT_PLAN_PALETTE }

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

    drawOpening(recorder.ctx, drawable('door-swing'), RENDER)

    // The gap is painted: at least one fill (the footprint in the background
    // color) so the wall stroke is broken, plus strokes for the jamb caps.
    expect(countOp(recorder.ops, 'fill')).toBeGreaterThanOrEqual(1)
    expect(countOp(recorder.ops, 'stroke')).toBeGreaterThanOrEqual(1)
  })

  it('draws a single swing leaf with exactly one arc for a single door', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-swing', { double: false }), RENDER)

    expect(recorder.arcs).toHaveLength(1)
  })

  it('carries the swing sweep direction to the canvas for opposite-sweeping doors', () => {
    const startRecorder = recordingContext()
    const endRecorder = recordingContext()

    drawOpening(
      startRecorder.ctx,
      drawable('door-swing', { node: { orientation: { hinge: 'start', facing: 'positive' } } }),
      RENDER,
    )
    drawOpening(
      endRecorder.ctx,
      drawable('door-swing', { node: { orientation: { hinge: 'end', facing: 'positive' } } }),
      RENDER,
    )

    expect(startRecorder.arcs).toHaveLength(1)
    expect(endRecorder.arcs).toHaveLength(1)
    const startArc = startRecorder.arcs[0]
    const endArc = endRecorder.arcs[0]
    expect(startArc).toBeDefined()
    expect(endArc).toBeDefined()
    // start/positive sweeps the minor arc clockwise; end/positive the other way.
    expect(startArc?.counterclockwise).toBe(false)
    expect(endArc?.counterclockwise).toBe(true)
  })

  it('draws two mirrored swing leaves with exactly two arcs for a double door', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-swing', { double: true }), RENDER)

    expect(recorder.arcs).toHaveLength(2)
  })

  it('mirrors both leaves of a double door onto the same facing side with opposite sweeps', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-swing', { double: true }), RENDER)

    expect(recorder.arcs).toHaveLength(2)
    const [firstArc, secondArc] = recorder.arcs
    expect(firstArc).toBeDefined()
    expect(secondArc).toBeDefined()
    if (firstArc === undefined || secondArc === undefined) return
    // Both leaves pivot from opposite jambs but open to the SAME facing side
    // (mirrored across the opening centerline, spec lines 297-298), so the two
    // swing arcs carry OPPOSITE sweep flags...
    expect(new Set([firstArc.counterclockwise, secondArc.counterclockwise])).toEqual(
      new Set([false, true]),
    )
    // ...and both arcs open toward the same facing side, so they start at the
    // same angle (each measured from its own hinge toward the +y facing side).
    expect(firstArc.startAngle).toBeCloseTo(secondArc.startAngle)
  })

  it('draws a sliding door as a panel and track with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-slide'), RENDER)

    expect(recorder.arcs).toHaveLength(0)
    // The panel and the track are line segments parallel to the wall.
    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(2)
  })

  it('draws a folding door as a multi-segment zigzag with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-fold'), RENDER)

    expect(recorder.arcs).toHaveLength(0)
    // A bifold leaf is at least two segments beyond the gap jamb caps.
    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(2)
  })

  it('draws a pivot door with at least one arc', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('door-pivot'), RENDER)

    expect(recorder.arcs.length).toBeGreaterThanOrEqual(1)
  })

  it('sweeps the pivot swing arc the same minor-arc direction as the single swing leaf', () => {
    const pivotRecorder = recordingContext()
    const swingRecorder = recordingContext()
    const orientation = { hinge: 'end', facing: 'positive' } as const

    drawOpening(pivotRecorder.ctx, drawable('door-pivot', { node: { orientation } }), RENDER)
    drawOpening(swingRecorder.ctx, drawable('door-swing', { node: { orientation } }), RENDER)

    // The pivot symbol records a small filled pivot dot plus the large swing
    // arc; select the swing arc as the recorded arc with the larger radius.
    const pivotSwingArc = pivotRecorder.arcs.reduce((a, b) => (b.radius > a.radius ? b : a))
    const swingArc = swingRecorder.arcs[0]
    expect(swingArc).toBeDefined()
    // For hinge=end/facing=positive the minor arc sweeps counterclockwise; the
    // pivot must inherit the same corrected direction as the single swing leaf.
    expect(swingArc?.counterclockwise).toBe(true)
    expect(pivotSwingArc.counterclockwise).toBe(true)
  })

  it('draws a cased opening as the gap only, with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('cased-opening'), RENDER)

    // The gap-only symbol: jamb caps and the footprint fill, no swing arc.
    expect(recorder.arcs).toHaveLength(0)
  })

  it('draws a fixed window as a glazing line across the gap, with no arcs', () => {
    const recorder = recordingContext()

    drawOpening(recorder.ctx, drawable('window-fixed'), RENDER)

    expect(recorder.arcs).toHaveLength(0)
    // At least one line segment spans the opening as the glazing line.
    expect(countOp(recorder.ops, 'lineTo')).toBeGreaterThanOrEqual(1)
  })

  it('draws a crank window with more segments than a fixed window, and no arcs', () => {
    const fixedRecorder = recordingContext()
    const crankRecorder = recordingContext()

    drawOpening(fixedRecorder.ctx, drawable('window-fixed'), RENDER)
    drawOpening(crankRecorder.ctx, drawable('window-crank'), RENDER)

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

    drawOpening(plainRecorder.ctx, drawable('door-swing', { selected: false }), RENDER)
    drawOpening(selectedRecorder.ctx, drawable('door-swing', { selected: true }), RENDER)

    expect(countOp(selectedRecorder.ops, 'stroke')).toBeGreaterThan(
      countOp(plainRecorder.ops, 'stroke'),
    )
  })
})
