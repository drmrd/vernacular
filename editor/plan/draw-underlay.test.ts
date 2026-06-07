import { describe, it, expect } from 'vitest'
import { drawUnderlay, type UnderlayImage } from './draw-underlay'
import { recordingContext } from './draw-plan-test-fixtures'
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
    image: { scope: 'project', contentHash: 'sha256-abc' },
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
  it('draws the calibrated underlay bitmap at its projected screen origin with one drawImage', () => {
    const recorder = recordingContext()
    const node = underlayNode()

    drawUnderlay(recorder.ctx, node, VIEWPORT, fakeImage)

    const origin = worldToScreen(node.placement.offset, VIEWPORT)
    const pixelToScreen = node.placement.millimetersPerPixel * VIEWPORT.scale

    expect(recorder.images).toHaveLength(1)
    expect(recorder.images[0]).toEqual({
      dx: origin.x,
      dy: origin.y,
      dWidth: node.width * pixelToScreen,
      dHeight: node.height * pixelToScreen,
      alpha: UNDERLAY_OPACITY,
    })
  })

  it('restores the context alpha to fully opaque after drawing the underlay', () => {
    const recorder = recordingContext()

    drawUnderlay(recorder.ctx, underlayNode(), VIEWPORT, fakeImage)

    // The underlay dims itself via globalAlpha; a later wall stroke must not
    // inherit that dimming, so the alpha is restored to 1 before returning.
    expect(recorder.ctx.globalAlpha).toBe(1)
  })
})
