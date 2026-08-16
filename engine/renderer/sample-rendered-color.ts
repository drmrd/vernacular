import type { Srgb } from '../../core'

/*
 * The renderer never sets `preserveDrawingBuffer`, so the drawing buffer only
 * holds a frame's pixels for the duration of that frame's callback; by the
 * time any later code could grab the canvas, the buffer may already be
 * cleared or repainted. `RenderedPixelReader` is the injected seam that lets
 * a caller hand this module a live view of "whatever the buffer holds right
 * now" without this module reaching for a canvas itself. That indirection is
 * also what keeps the NDC-to-pixel mapping and channel averaging below pure
 * and unit-testable in Node, with no GPU or DOM required.
 */

/** A source of device-pixel RGBA rectangles from whatever is currently rendered. */
export interface RenderedPixelReader {
  readonly width: number
  readonly height: number
  /** RGBA bytes, row-major, for a device-pixel rectangle. */
  readPixels(x: number, y: number, width: number, height: number): Uint8ClampedArray
}

/**
 * Radius, in device pixels, of the square neighborhood averaged around the
 * sampled point. 1 is the smallest radius that averages anything at all: it
 * damps a stray antialiased edge pixel to at most one ninth of the reading
 * (a 3x3 patch), and a 3x3 patch stays well inside the 6px tolerance the 3D
 * view already uses to decide two pointer positions are "the same click," so
 * the patch cannot wander onto a surface the raycast did not resolve. The
 * value is derived from those two constraints, not tuned by eye.
 */
export const SAMPLE_RADIUS_PX = 1

const PATCH_SIDE_PX = 2 * SAMPLE_RADIUS_PX + 1
const RGBA_CHANNEL_COUNT = 4
const SRGB_CHANNEL_MAX = 255
const NDC_MIN = -1
const NDC_MAX = 1

function isWithinNdcRange(value: number): boolean {
  return value >= NDC_MIN && value <= NDC_MAX
}

/** Map a 0..1 fraction along one axis to the nearest device pixel index. */
function fractionToDevicePixel(fraction: number, extentPx: number): number {
  return Math.floor(fraction * extentPx)
}

/** Center a patch on `center`, clamped fully inside `[0, extentPx)`. */
function clampedAxis(center: number, extentPx: number): { origin: number; side: number } {
  const side = Math.min(PATCH_SIDE_PX, extentPx)
  const origin = Math.max(0, Math.min(center - SAMPLE_RADIUS_PX, extentPx - side))
  return { origin, side }
}

/** Average the R, G, B channels of an RGBA buffer, ignoring alpha. */
function averageSrgb(pixels: Uint8ClampedArray): Srgb {
  const pixelCount = pixels.length / RGBA_CHANNEL_COUNT
  let redSum = 0
  let greenSum = 0
  let blueSum = 0
  for (let index = 0; index < pixels.length; index += RGBA_CHANNEL_COUNT) {
    // Destructuring one pixel's own slice names the channels at the point they
    // are summed and reads each byte exactly once. The zero defaults cover only
    // a buffer whose last pixel is cut short, which no reader produces; treating
    // the missing bytes as black keeps a malformed buffer from throwing here.
    const [red = 0, green = 0, blue = 0] = pixels.subarray(index, index + RGBA_CHANNEL_COUNT)
    redSum += red
    greenSum += green
    blueSum += blue
  }
  return {
    r: redSum / pixelCount / SRGB_CHANNEL_MAX,
    g: greenSum / pixelCount / SRGB_CHANNEL_MAX,
    b: blueSum / pixelCount / SRGB_CHANNEL_MAX,
  }
}

/**
 * Sample the gamma-encoded sRGB color rendered at an NDC point, averaged
 * over a small neighborhood. Returns `null` for an empty buffer or an NDC
 * point outside the -1..1 viewport range on either axis.
 */
export function sampleRenderedColor(
  reader: RenderedPixelReader,
  ndc: { x: number; y: number },
): Srgb | null {
  if (reader.width === 0 || reader.height === 0) return null
  if (!isWithinNdcRange(ndc.x) || !isWithinNdcRange(ndc.y)) return null

  // NDC x runs left-to-right, the same direction device pixel columns grow.
  const centerX = fractionToDevicePixel((ndc.x + 1) / 2, reader.width)
  // NDC y runs bottom-to-top, but device pixel rows grow top-to-bottom, so
  // the fraction is inverted here rather than threading a flip flag through
  // fractionToDevicePixel.
  const centerY = fractionToDevicePixel((1 - ndc.y) / 2, reader.height)
  const xAxis = clampedAxis(centerX, reader.width)
  const yAxis = clampedAxis(centerY, reader.height)

  const pixels = reader.readPixels(xAxis.origin, yAxis.origin, xAxis.side, yAxis.side)
  return averageSrgb(pixels)
}

/**
 * Build a `RenderedPixelReader` backed by an on-screen `<canvas>`. The source
 * canvas holds a WebGL context, so this never asks it for a 2D context; it
 * draws the requested rectangle onto a scratch 2D canvas sized to match,
 * which keeps each on-demand read cheap regardless of the full canvas size.
 * A fake source canvas covers this path in the unit tests, and an end-to-end
 * journey covers it against a real WebGL canvas.
 */
export function createCanvasPixelReader(canvas: HTMLCanvasElement): RenderedPixelReader {
  return {
    // The extents are read on every access rather than snapshotted because the
    // reader is memoized on the canvas element and so outlives any resize: a
    // snapshot taken at construction would silently map every later sample's
    // NDC point onto the wrong device pixel.
    get width() {
      return canvas.width
    },
    get height() {
      return canvas.height
    },
    // eslint-disable-next-line max-params -- signature mirrors the canvas 2D drawImage/getImageData rectangle API (x, y, width, height)
    readPixels(x, y, width, height) {
      const scratch = document.createElement('canvas')
      scratch.width = width
      scratch.height = height
      const scratchContext = scratch.getContext('2d')
      if (scratchContext === null) {
        throw new Error('createCanvasPixelReader: 2D canvas context unavailable')
      }
      scratchContext.drawImage(canvas, x, y, width, height, 0, 0, width, height)
      return scratchContext.getImageData(0, 0, width, height).data
    },
  }
}
