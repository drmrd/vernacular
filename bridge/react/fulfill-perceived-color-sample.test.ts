import { describe, expect, it, vi } from 'vitest'
import { colorFromOkLab, srgbToOkLab, type SurfaceRef } from '../../core'
import type { RenderedPixelReader } from '../../engine'
import { createPerceivedColorStore } from '../perceived-color/perceived-color-store'
import { fulfillPerceivedColorSample } from './fulfill-perceived-color-sample'

// This runs on every animation frame (it is the pure half of the per-frame sampler),
// so each scenario below pins one cheap early-out plus the one path that actually
// touches the reader, rather than exercising sampleRenderedColor's own math again.

const wallFaceLeft: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'left' }
const ndcOrigin = { x: 0, y: 0 }
const MID_GRAY: readonly [number, number, number, number] = [128, 128, 128, 255]

function createFlatColorReader(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): RenderedPixelReader {
  return {
    width,
    height,
    // eslint-disable-next-line max-params -- mirrors the four-argument RenderedPixelReader.readPixels signature
    readPixels(_x, _y, patchWidth, patchHeight) {
      const bytes = new Uint8ClampedArray(patchWidth * patchHeight * 4)
      for (let pixel = 0; pixel < patchWidth * patchHeight; pixel += 1) {
        bytes.set(rgba, pixel * 4)
      }
      return bytes
    },
  }
}

describe('fulfillPerceivedColorSample', () => {
  it('does not touch the reader when no sample is pending', () => {
    const store = createPerceivedColorStore()
    const readPixels = vi.fn()
    const reader: RenderedPixelReader = { width: 100, height: 100, readPixels }

    fulfillPerceivedColorSample(store, reader)

    expect(readPixels).not.toHaveBeenCalled()
  })

  it('leaves a pending request untouched when no reader is available yet', () => {
    const store = createPerceivedColorStore()
    store.requestSample(wallFaceLeft, ndcOrigin)

    fulfillPerceivedColorSample(store, null)

    expect(store.getRequest()).toEqual({ surface: wallFaceLeft, ndc: ndcOrigin })
    expect(store.getSample()).toBeNull()
  })

  it('resolves a pending request to the sampled pixel converted through OkLab', () => {
    const store = createPerceivedColorStore()
    store.requestSample(wallFaceLeft, ndcOrigin)
    const reader = createFlatColorReader(100, 100, MID_GRAY)
    const expectedColor = colorFromOkLab(srgbToOkLab({ r: 128 / 255, g: 128 / 255, b: 128 / 255 }))

    fulfillPerceivedColorSample(store, reader)

    expect(store.getSample()?.surface).toEqual(wallFaceLeft)
    expect(store.getSample()?.color.srgbHex).toBe(expectedColor.srgbHex)
  })

  it('clears the pending request once it resolves, so the next frame does not re-read the buffer', () => {
    const store = createPerceivedColorStore()
    store.requestSample(wallFaceLeft, ndcOrigin)
    const reader = createFlatColorReader(100, 100, MID_GRAY)

    fulfillPerceivedColorSample(store, reader)

    expect(store.getRequest()).toBeNull()
  })

  it('clears an unsamplable request without resolving a sample, so it is not retried every frame', () => {
    const store = createPerceivedColorStore()
    store.requestSample(wallFaceLeft, ndcOrigin)
    const reader = createFlatColorReader(0, 100, MID_GRAY)

    fulfillPerceivedColorSample(store, reader)

    expect(store.getRequest()).toBeNull()
    expect(store.getSample()).toBeNull()
  })
})
