import type { Locator, Page } from '@playwright/test'
import {
  agxNeutralInverse,
  linearLuminance,
  linearToSrgb,
  srgbToLinear,
  type Srgb,
} from '../../core'

// Readings of a square patch of a canvas: its mean color, the colors of its single pixels, and
// the measures the scene gates take of them. The harness renderer does not preserve its drawing
// buffer, so an in-page getImageData on the live canvas reads an already-cleared buffer (see
// scene-solar.spec.ts); the compositor screenshot is the source of truth. The screenshot goes
// back to the page as a data URL, and the pixels come from the browser's native decode, so no
// image-decoding dependency is needed.

/** The 8-bit code range a display shows: a channel's 0..1 fraction times this is its code. */
export const CODE_RANGE = 255

// The default side of the square sample patch, in screenshot pixels. Averaging a patch
// rather than reading one pixel damps per-pixel WebGL nondeterminism.
const SAMPLE_PATCH_PX = 24

// The RGBA stride of an ImageData buffer.
const RGBA_STRIDE = 4

// The red, green, and blue codes a pixel holds in the list of patch codes.
const COLOR_CHANNELS = 3

// Where a sample patch sits: its center as fractions (0..1) of the frame width and height,
// and optionally its side in screenshot pixels when the sampled surface is narrower than the
// default patch.
export interface SamplePatch {
  readonly x: number
  readonly y: number
  readonly sizePx?: number
}

// Runs in the browser (page context), so it stands alone with no closure over module scope:
// decodes a PNG data URL, draws it to a 2D canvas, and returns the red, green, and blue codes
// of each pixel of the square patch centered on the given (cx, cy) fractions of the image,
// three codes for each pixel. stride is the RGBA byte stride.
async function patchCodesInPage({
  url,
  patch,
  stride,
  cx,
  cy,
}: {
  url: string
  patch: number
  stride: number
  cx: number
  cy: number
}): Promise<number[]> {
  const image = new Image()
  image.src = url
  await image.decode()
  const surface = document.createElement('canvas')
  surface.width = image.width
  surface.height = image.height
  const context = surface.getContext('2d')
  if (context === null) throw new Error('no 2d context for the sample surface')
  context.drawImage(image, 0, 0)
  const originX = Math.round(image.width * cx - patch / 2)
  const originY = Math.round(image.height * cy - patch / 2)
  const { data } = context.getImageData(originX, originY, patch, patch)
  const codes: number[] = []
  for (let index = 0; index < data.length; index += stride) {
    codes.push(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0)
  }
  return codes
}

// The red, green, and blue codes of each pixel of a square patch of the canvas screenshot.
async function patchCodes(page: Page, canvas: Locator, center: SamplePatch): Promise<number[]> {
  const png = await canvas.screenshot()
  return page.evaluate(patchCodesInPage, {
    url: `data:image/png;base64,${png.toString('base64')}`,
    patch: center.sizePx ?? SAMPLE_PATCH_PX,
    stride: RGBA_STRIDE,
    cx: center.x,
    cy: center.y,
  })
}

// The gamma-encoded sRGB color (0..1) of each pixel of a square patch of the canvas, placed as
// `sampleCanvasColor` places its patch.
export async function samplePatchPixels(
  page: Page,
  canvas: Locator,
  center: SamplePatch,
): Promise<Srgb[]> {
  const codes = await patchCodes(page, canvas, center)
  const colors: Srgb[] = []
  for (let index = 0; index < codes.length; index += COLOR_CHANNELS) {
    const [r = 0, g = 0, b = 0] = codes.slice(index, index + COLOR_CHANNELS)
    colors.push({ r: r / CODE_RANGE, g: g / CODE_RANGE, b: b / CODE_RANGE })
  }
  return colors
}

// Averages a square patch, centered on the canvas by default, of the settled harness canvas
// to one gamma-encoded sRGB triple in 0..1 (ready for srgbToOkLab). The optional patch
// placement (center fractions of width and height, and a side in pixels) places the patch when
// the sampled surface is not at frame center.
export async function sampleCanvasColor(
  page: Page,
  canvas: Locator,
  center: SamplePatch = { x: 0.5, y: 0.5 },
): Promise<Srgb> {
  const codes = await patchCodes(page, canvas, center)
  let red = 0
  let green = 0
  let blue = 0
  for (let index = 0; index < codes.length; index += COLOR_CHANNELS) {
    red += codes[index] ?? 0
    green += codes[index + 1] ?? 0
    blue += codes[index + 2] ?? 0
  }
  const pixels = codes.length / COLOR_CHANNELS
  return {
    r: red / pixels / CODE_RANGE,
    g: green / pixels / CODE_RANGE,
    b: blue / pixels / CODE_RANGE,
  }
}

// The display code of a sampled color's luminance: decode the channels, weigh them, encode.
export function luminanceCode(color: Srgb): number {
  const linear = { r: srgbToLinear(color.r), g: srgbToLinear(color.g), b: srgbToLinear(color.b) }
  return linearToSrgb(linearLuminance(linear)) * CODE_RANGE
}

// The standard deviation of the luminance display codes (0..255) of a set of pixels.
export function luminanceCodeSpread(colors: readonly Srgb[]): number {
  const codes = colors.map(luminanceCode)
  const mean = codes.reduce((sum, code) => sum + code, 0) / codes.length
  const variance = codes.reduce((sum, code) => sum + (code - mean) ** 2, 0) / codes.length
  return Math.sqrt(variance)
}

// The linear light level behind a sampled color: its luminance, encoded as a display code,
// taken back through the inverse of the tone curve.
export function linearLevel(color: Srgb): number {
  const luminance = linearLuminance({
    r: srgbToLinear(color.r),
    g: srgbToLinear(color.g),
    b: srgbToLinear(color.b),
  })
  return agxNeutralInverse(linearToSrgb(luminance))
}
