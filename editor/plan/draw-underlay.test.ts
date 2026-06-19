import { describe, it, expect } from 'vitest'
import { drawUnderlay, drawCalibrationSegment, type UnderlayImage } from './draw-underlay'
import { recordingContext } from './draw-plan-test-fixtures'
import type { PreviewSegment } from './draw-plan'
import { underlayTracePoints } from './underlay-trace-points'
import { worldToScreen, type Viewport } from './viewport'
import type { UnderlaySceneNode } from '../../core'

// This slice draws AXIS-ALIGNED underlays only (placement.rotation === 0). A
// non-zero rotation (a canvas rotate/translate dance about the offset) is
// deferred to the rotation-gizmo follow-up.
const SOURCE_WIDTH_PX = 800
const SOURCE_HEIGHT_PX = 600
const MILLIMETERS_PER_PIXEL = 10
const UNDERLAY_OPACITY = 0.6
// A non-trivial scale and pan so the projection (and therefore dx/dy) is
// observable rather than an identity map.
const VIEWPORT: Viewport = { scale: 0.05, offset: { x: 31, y: 47 } }

function underlayNode(overrides: Partial<UnderlaySceneNode> = {}): UnderlaySceneNode {
  return {
    id: 'underlay:a',
    kind: 'underlay',
    floorId: 'f',
    source: { kind: 'raster', image: { scope: 'project', contentHash: 'sha256-abc' } },
    width: SOURCE_WIDTH_PX,
    height: SOURCE_HEIGHT_PX,
    placement: {
      offset: { x: 1000, y: 500 },
      millimetersPerPixel: MILLIMETERS_PER_PIXEL,
      rotation: 0,
    },
    opacity: UNDERLAY_OPACITY,
    visible: true,
    ...overrides,
  }
}

const fakeImage: UnderlayImage = { width: SOURCE_WIDTH_PX, height: SOURCE_HEIGHT_PX }

describe('drawUnderlay', () => {
  // The destination rectangle's four screen corners, derived purely from the
  // recorded drawImage destination parameters (origin top-left, growing right and
  // down in screen pixels, as drawImage does).
  function destinationCorners(image: {
    dx: number
    dy: number
    dWidth: number
    dHeight: number
  }) {
    return [
      { x: image.dx, y: image.dy },
      { x: image.dx + image.dWidth, y: image.dy },
      { x: image.dx + image.dWidth, y: image.dy + image.dHeight },
      { x: image.dx, y: image.dy + image.dHeight },
    ]
  }

  // The trace footprint corners (the snap target) projected through the same
  // viewport the renderer uses. The painted raster must cover exactly this
  // screen region, so a future rotation change cannot let the two drift apart.
  function footprintScreenCorners(node: UnderlaySceneNode) {
    return underlayTracePoints(node).map((corner) => {
      const screen = worldToScreen(corner, VIEWPORT)
      return { x: screen.x, y: screen.y }
    })
  }

  it('covers the corrected footprint screen region: the destination rect corners coincide with the trace footprint projected through worldToScreen', () => {
    const recorder = recordingContext()
    const node = underlayNode()

    drawUnderlay(recorder.ctx, node, VIEWPORT, fakeImage)

    expect(recorder.images).toHaveLength(1)

    const corners = destinationCorners(recorder.images[0])
    const expectedCorners = footprintScreenCorners(node)

    // Float-tolerant four-corner coincidence: every projected footprint corner is
    // covered by a destination-rect corner and vice versa, regardless of ordering.
    for (const expected of expectedCorners) {
      expect(corners).toContainEqual({
        x: expect.closeTo(expected.x, 6),
        y: expect.closeTo(expected.y, 6),
      })
    }
    for (const corner of corners) {
      expect(expectedCorners).toContainEqual({
        x: expect.closeTo(corner.x, 6),
        y: expect.closeTo(corner.y, 6),
      })
    }
  })

  it('anchors the destination origin at the projected top edge and grows down-screen with positive extents', () => {
    const recorder = recordingContext()
    const node = underlayNode()

    drawUnderlay(recorder.ctx, node, VIEWPORT, fakeImage)

    expect(recorder.images).toHaveLength(1)
    const image = recorder.images[0]

    // The destination origin (dx, dy) is the projection of the footprint's TOP
    // edge corner, i.e. the corner with the LARGER world-y. In the y-up world that
    // top edge is offset.y; worldToScreen negates y so it lands at the smaller
    // (upper) screen-y, and the raster grows down-screen from there.
    const footprint = underlayTracePoints(node)
    const topEdgeWorldY = Math.max(...footprint.map((corner) => corner.y))
    const topLeftWorld = footprint.find(
      (corner) => corner.y === topEdgeWorldY && corner.x === Math.min(...footprint.map((c) => c.x)),
    )
    expect(topLeftWorld).toBeDefined()
    const topLeftScreen = worldToScreen(topLeftWorld!, VIEWPORT)

    const pixelToScreen = node.placement.millimetersPerPixel * VIEWPORT.scale
    expect(image.dx).toBeCloseTo(topLeftScreen.x, 6)
    expect(image.dy).toBeCloseTo(topLeftScreen.y, 6)
    expect(image.dWidth).toBeCloseTo(node.width * pixelToScreen, 6)
    expect(image.dHeight).toBeCloseTo(node.height * pixelToScreen, 6)
    expect(image.dWidth).toBeGreaterThan(0)
    expect(image.dHeight).toBeGreaterThan(0)
    expect(image.alpha).toBe(UNDERLAY_OPACITY)
  })

  it('restores the context alpha to fully opaque after drawing the underlay', () => {
    const recorder = recordingContext()

    drawUnderlay(recorder.ctx, underlayNode(), VIEWPORT, fakeImage)

    // The underlay dims itself via globalAlpha; a later wall stroke must not
    // inherit that dimming, so the alpha is restored to 1 before returning.
    expect(recorder.ctx.globalAlpha).toBe(1)
  })
})

describe('drawCalibrationSegment', () => {
  // Two distinct world points so the projected screen endpoints differ in both
  // axes, paired with the non-identity VIEWPORT so the projection is observable.
  const segment: PreviewSegment = {
    start: { x: 1200, y: 800 },
    end: { x: 3400, y: 2600 },
  }

  it('strokes the calibration line between the two projected screen endpoints', () => {
    const recorder = recordingContext()

    drawCalibrationSegment(recorder.ctx, segment, VIEWPORT)

    const from = worldToScreen(segment.start, VIEWPORT)
    const to = worldToScreen(segment.end, VIEWPORT)
    expect(recorder.segments).toContainEqual(
      expect.objectContaining({
        from: [from.x, from.y],
        to: [to.x, to.y],
      }),
    )
  })

  it('marks each measured endpoint with a filled arc at its projected screen position', () => {
    const recorder = recordingContext()

    drawCalibrationSegment(recorder.ctx, segment, VIEWPORT)

    const from = worldToScreen(segment.start, VIEWPORT)
    const to = worldToScreen(segment.end, VIEWPORT)
    expect(recorder.arcs).toHaveLength(2)
    expect(recorder.arcs).toContainEqual(
      expect.objectContaining({ x: from.x, y: from.y, radius: expect.any(Number) }),
    )
    expect(recorder.arcs).toContainEqual(
      expect.objectContaining({ x: to.x, y: to.y, radius: expect.any(Number) }),
    )
    for (const arc of recorder.arcs) {
      expect(arc.radius).toBeGreaterThan(0)
    }
  })
})
