import { describe, it, expect } from 'vitest'
import { drawUnderlay, drawCalibrationSegment, type UnderlayImage } from './draw-underlay'
import { recordingContext } from './draw-plan-test-fixtures'
import type { PreviewSegment } from './draw-plan'
import { underlayTracePoints } from './underlay-trace-points'
import { worldToScreen, type Viewport } from './viewport'
import type { UnderlaySceneNode } from '../../core'

// The renderer now honors placement.rotation: a non-zero rotation paints the
// raster under a saved/restored canvas transform so its footprint matches the
// rotated trace path, while an axis-aligned underlay (placement.rotation === 0)
// remains a plain drawImage with no transform.
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
  function destinationCorners(image: { dx: number; dy: number; dWidth: number; dHeight: number }) {
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
    const image = recorder.images[0]
    expect(image).toBeDefined()

    const corners = destinationCorners(image!)
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
    expect(image).toBeDefined()

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
    expect(image!.dx).toBeCloseTo(topLeftScreen.x, 6)
    expect(image!.dy).toBeCloseTo(topLeftScreen.y, 6)
    expect(image!.dWidth).toBeCloseTo(node.width * pixelToScreen, 6)
    expect(image!.dHeight).toBeCloseTo(node.height * pixelToScreen, 6)
    expect(image!.dWidth).toBeGreaterThan(0)
    expect(image!.dHeight).toBeGreaterThan(0)
    expect(image!.alpha).toBe(UNDERLAY_OPACITY)
  })

  it('overlays geometry sharing its world-y band rather than displacing the raster into the lower half', () => {
    // The 231 Hubbard regression: a floor-sized underlay whose footprint occupies
    // the same +y world band as the floor geometry it was traced from. Before the
    // y-up fix the raster landed below (and mirrored relative to) that geometry.
    // Here the raster's projected screen y-extent must OVERLAP the feature's, so
    // the underlay sits in the same screen region as the rooms, not displaced down.
    const recorder = recordingContext()
    // A floor-sized underlay: footprint spans world-y from 5000 (top) down to
    // 5000 - 600 * 10 = -1000 (bottom).
    const node = underlayNode({
      placement: {
        offset: { x: 2000, y: 5000 },
        millimetersPerPixel: MILLIMETERS_PER_PIXEL,
        rotation: 0,
      },
    })

    drawUnderlay(recorder.ctx, node, VIEWPORT, fakeImage)

    expect(recorder.images).toHaveLength(1)
    const image = recorder.images[0]
    expect(image).toBeDefined()
    const rasterTop = Math.min(image!.dy, image!.dy + image!.dHeight)
    const rasterBottom = Math.max(image!.dy, image!.dy + image!.dHeight)

    // An asymmetric feature (a low, off-centre corner) sitting inside the same +y
    // world band as the underlay footprint. Its projected screen y must fall within
    // the raster's projected screen y-extent: same region, not the lower half.
    const featureWorld = { x: 2500, y: 1200 }
    const featureScreen = worldToScreen(featureWorld, VIEWPORT)

    expect(featureScreen.y).toBeGreaterThanOrEqual(rasterTop)
    expect(featureScreen.y).toBeLessThanOrEqual(rasterBottom)

    // And the raster's y-extent overlaps the feature's band as a whole, not merely
    // touching a single point: the projected top and bottom of the underlay's world
    // band bracket the feature's projected screen y.
    const bandTopScreen = worldToScreen({ x: 2500, y: 5000 }, VIEWPORT)
    const bandBottomScreen = worldToScreen({ x: 2500, y: -1000 }, VIEWPORT)
    const bandTop = Math.min(bandTopScreen.y, bandBottomScreen.y)
    const bandBottom = Math.max(bandTopScreen.y, bandBottomScreen.y)
    expect(rasterTop).toBeLessThanOrEqual(bandBottom)
    expect(rasterBottom).toBeGreaterThanOrEqual(bandTop)
  })

  it('brackets a rotated underlay draw in a balanced save/restore transform scope so the rotation does not leak into later layers', () => {
    const recorder = recordingContext()
    const node = underlayNode({
      placement: {
        offset: { x: 1000, y: 500 },
        millimetersPerPixel: MILLIMETERS_PER_PIXEL,
        rotation: Math.PI / 6,
      },
    })

    drawUnderlay(recorder.ctx, node, VIEWPORT, fakeImage)

    const drawIndex = recorder.ops.indexOf('drawImage')
    const saveIndex = recorder.ops.indexOf('save')
    const restoreIndex = recorder.ops.lastIndexOf('restore')

    // A save must precede the raster draw and a restore must follow it, so the
    // rotated transform is scoped to the underlay and torn down before the grid
    // and walls paint.
    expect(drawIndex).toBeGreaterThanOrEqual(0)
    expect(saveIndex).toBeGreaterThanOrEqual(0)
    expect(saveIndex).toBeLessThan(drawIndex)
    expect(restoreIndex).toBeGreaterThan(drawIndex)

    // Every save is matched by a restore: the transform stack returns to where it
    // started, so no transform leaks past the underlay layer.
    const saveCount = recorder.ops.filter((op) => op === 'save').length
    const restoreCount = recorder.ops.filter((op) => op === 'restore').length
    expect(saveCount).toBe(restoreCount)
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
