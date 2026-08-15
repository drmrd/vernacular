import { describe, expect, it } from 'vitest'
import {
  SAMPLE_RADIUS_PX,
  createCanvasPixelReader,
  sampleRenderedColor,
  type RenderedPixelReader,
} from './sample-rendered-color'

// The renderer never sets `preserveDrawingBuffer`, so the drawing buffer only holds
// a frame's pixels for the duration of the frame callback. Rather than grab a canvas
// at will, the sampler takes an injected reader, which keeps this module a pure
// function of (reader, ndc) with no three.js import and no GPU dependency at all.

interface ReadRect {
  x: number
  y: number
  width: number
  height: number
}

interface FakeReader extends RenderedPixelReader {
  readonly calls: ReadRect[]
}

type Rgba = readonly [number, number, number, number]

/**
 * A fake RenderedPixelReader over a buffer of the given device-pixel size. Every
 * `readPixels` call is recorded (so a test can inspect the rectangle the sampler
 * asked for) and filled by calling `colorAt` for each device pixel in that rectangle.
 */
function createFakeReader(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => Rgba,
): FakeReader {
  const calls: ReadRect[] = []

  return {
    width,
    height,
    calls,
    // eslint-disable-next-line max-params -- mirrors the four-argument RenderedPixelReader.readPixels signature the fake records
    readPixels(x, y, patchWidth, patchHeight) {
      calls.push({ x, y, width: patchWidth, height: patchHeight })
      const bytes = new Uint8ClampedArray(patchWidth * patchHeight * 4)
      for (let row = 0; row < patchHeight; row += 1) {
        for (let col = 0; col < patchWidth; col += 1) {
          const [r, g, b, a] = colorAt(x + col, y + row)
          const i = (row * patchWidth + col) * 4
          bytes[i] = r
          bytes[i + 1] = g
          bytes[i + 2] = b
          bytes[i + 3] = a
        }
      }
      return bytes
    },
  }
}

const OPAQUE_GRAY: Rgba = [128, 128, 128, 255]

// Nine distinct RGBA values, one per patch pixel. Row/column order does not matter
// because averaging is order-independent; only the per-channel sums matter.
// r sums to 360 (avg 40), g to 180 (avg 20), b to 108 (avg 12); alpha is deliberately
// varied to prove it is ignored.
const PATCH_COLORS: readonly Rgba[] = [
  [0, 0, 0, 255],
  [10, 5, 3, 240],
  [20, 10, 6, 225],
  [30, 15, 9, 210],
  [40, 20, 12, 195],
  [50, 25, 15, 180],
  [60, 30, 18, 165],
  [70, 35, 21, 150],
  [80, 40, 24, 135],
]

// noUncheckedIndexedAccess types an index read as possibly undefined. These two
// helpers narrow it by failing loudly instead, so a sampler that stopped calling
// readPixels, or a patch index that fell out of range, surfaces as its own error
// rather than as a baffling assertion against undefined.
function onlyReadRect(reader: FakeReader): ReadRect {
  expect(reader.calls).toHaveLength(1)
  const [rect] = reader.calls
  if (rect === undefined) throw new Error('the sampler recorded no readPixels call')
  return rect
}

function patchColorAt(index: number): Rgba {
  const color = PATCH_COLORS[index]
  if (color === undefined) throw new Error(`no patch color at index ${index}`)
  return color
}

describe('sampleRenderedColor', () => {
  it('requests a patch that is 2 * SAMPLE_RADIUS_PX + 1 pixels square', () => {
    // Radius 1 is the smallest neighborhood with any averaging effect, and it stays
    // far inside the 6 px click tolerance the 3D view already uses to decide what
    // counts as the same point (see bridge/react/pointer-click.test.ts), so the patch
    // cannot wander onto a surface the pick did not resolve.
    const reader = createFakeReader(100, 100, () => OPAQUE_GRAY)

    sampleRenderedColor(reader, { x: 0, y: 0 })

    const rect = onlyReadRect(reader)
    expect(rect.width).toBe(2 * SAMPLE_RADIUS_PX + 1)
    expect(rect.height).toBe(2 * SAMPLE_RADIUS_PX + 1)
  })

  it('maps the NDC origin to the pixel at the center of the buffer', () => {
    const reader = createFakeReader(100, 80, () => OPAQUE_GRAY)

    sampleRenderedColor(reader, { x: 0, y: 0 })

    const rect = onlyReadRect(reader)
    expect(rect.x).toBe(50 - SAMPLE_RADIUS_PX)
    expect(rect.y).toBe(40 - SAMPLE_RADIUS_PX)
  })

  it('maps negative NDC x toward the left edge and positive NDC y toward the top row', () => {
    const reader = createFakeReader(100, 80, () => OPAQUE_GRAY)

    sampleRenderedColor(reader, { x: -0.5, y: 0.5 })

    const rect = onlyReadRect(reader)
    // x = -0.5 sits a quarter of the way in from the left edge (device column 25);
    // y = 0.5 sits a quarter of the way down from the top row (device row 20).
    expect(rect.x).toBe(25 - SAMPLE_RADIUS_PX)
    expect(rect.y).toBe(20 - SAMPLE_RADIUS_PX)
  })

  it('averages the RGB channels of the sampled patch and ignores alpha', () => {
    const reader = createFakeReader(20, 20, (x, y) => {
      if (x >= 9 && x <= 11 && y >= 9 && y <= 11) {
        return patchColorAt((y - 9) * 3 + (x - 9))
      }
      // Outside the expected 3x3 patch; a naive implementation that samples the
      // wrong rectangle would pick up this value and fail the assertions below.
      return [255, 255, 255, 255]
    })

    const color = sampleRenderedColor(reader, { x: 0, y: 0 })

    expect(color).not.toBeNull()
    expect(color?.r).toBeCloseTo(40 / 255)
    expect(color?.g).toBeCloseTo(20 / 255)
    expect(color?.b).toBeCloseTo(12 / 255)
  })

  it('never requests a rectangle with a negative origin, even at the top-left corner', () => {
    const reader = createFakeReader(10, 10, () => OPAQUE_GRAY)

    sampleRenderedColor(reader, { x: -1, y: 1 })

    const rect = onlyReadRect(reader)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
  })

  it('never requests a rectangle that overflows the buffer, even at the bottom-right corner', () => {
    const reader = createFakeReader(10, 10, () => OPAQUE_GRAY)

    sampleRenderedColor(reader, { x: 1, y: -1 })

    const rect = onlyReadRect(reader)
    expect(rect.x + rect.width).toBeLessThanOrEqual(10)
    expect(rect.y + rect.height).toBeLessThanOrEqual(10)
  })

  it('returns null when the buffer has zero width', () => {
    const reader = createFakeReader(0, 10, () => OPAQUE_GRAY)

    expect(sampleRenderedColor(reader, { x: 0, y: 0 })).toBeNull()
  })

  it('returns null when the buffer has zero height', () => {
    const reader = createFakeReader(10, 0, () => OPAQUE_GRAY)

    expect(sampleRenderedColor(reader, { x: 0, y: 0 })).toBeNull()
  })

  it.each([
    { x: -1.01, y: 0 },
    { x: 1.01, y: 0 },
    { x: 0, y: -1.01 },
    { x: 0, y: 1.01 },
  ])('returns null when ndc $x, $y falls outside the -1..1 range', (ndc) => {
    const reader = createFakeReader(10, 10, () => OPAQUE_GRAY)

    expect(sampleRenderedColor(reader, ndc)).toBeNull()
  })
})

describe('createCanvasPixelReader', () => {
  it('returns null when a 2D context cannot be obtained', () => {
    // jsdom has no canvas backend, so getContext('2d') yields null here. The populated
    // path (a real reader backed by a live 2D context drawing the WebGPU canvas) is
    // browser-only glue, proven at the end-to-end tier instead.
    const canvas = document.createElement('canvas')

    expect(createCanvasPixelReader(canvas)).toBeNull()
  })
})
