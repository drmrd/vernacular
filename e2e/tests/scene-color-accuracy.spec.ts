import { test, expect, type Page, type Locator } from '@playwright/test'
import {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND,
  TONE_MAP_EXTREME_SWATCHES,
  TONE_MAP_EXTREME_TOLERANCE,
  withinColorTolerance,
  colorFromOkLab,
  srgbToOkLab,
  perceptualDistance,
} from '../../core'
import { sampleCanvasColor } from './scene-helpers'

// The color-accuracy gate, the headline acceptance of the realistic-environmental-lighting
// epic. It renders each known swatch on the shell floor under the color-check reference
// condition (ADR-0156: neutral daylight, exposure 1, PBR Neutral tone mapping), samples the
// lit floor, and asserts the sample reads within tolerance of the swatch in OKLab. It renders
// through the deterministic scene harness (WebGL 2 backend), so it runs on both darwin Metal
// and linux SwiftShader and self-skips only where no WebGL 2 context exists. It commits no
// pixel baseline; the assertion is the sampled color, not an image. See ADR-0157.
//
// The tone-map-extreme tier below covers the operator's shoulder and toe: near-white keeps
// the raw-albedo reference, while near-black is judged against its pinned measured render
// rather than its own albedo. See ADR-0168.

// The reference-lighting harness scene the gate renders under.
const REFERENCE_SCENE = 'color-accuracy'
// Where on the frame the floor sample patch is centered (fraction of width and height). Tuned
// against the rendered frame so the patch lands on the lit floor, away from wall-shadow edges.
const FLOOR_SAMPLE_CENTER = { x: 0.5, y: 0.5 }

// Puts the harness in the reference condition with a swatch painted on the floor.
async function gotoPaintedReference(page: Page, hex: string): Promise<Locator> {
  await page.goto(`/?fixture=scene-harness&scene=${REFERENCE_SCENE}&paint=${hex}`)
  const harness = page.getByTestId('scene-harness')
  const canvas = harness.locator('canvas')
  await expect(canvas).toBeVisible()
  const hasWebGl2 = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return probe.getContext('webgl2') !== null
  })
  test.skip(
    !hasWebGl2,
    'No WebGL 2 context on this runner; the color-accuracy gate self-skips here.',
  )
  await expect(harness).toHaveAttribute('data-harness-ready', 'true')
  return canvas
}

test.describe('Decorating color-accuracy gate', () => {
  for (const swatch of COLOR_ACCURACY_SWATCHES) {
    test(`the ${swatch.name} swatch reads within tolerance of its reference`, async ({ page }) => {
      const hex = swatch.color.srgbHex.slice(1)
      const canvas = await gotoPaintedReference(page, hex)

      const sampledSrgb = await sampleCanvasColor(page, canvas, FLOOR_SAMPLE_CENTER)
      const sampled = colorFromOkLab(srgbToOkLab(sampledSrgb))
      const distance = perceptualDistance(sampled, swatch.color)

      expect(
        withinColorTolerance(sampled, swatch.color),
        `${swatch.name}: sampled ${sampled.srgbHex} vs reference ${swatch.color.srgbHex}, ` +
          `OKLab distance ${distance.toFixed(4)} > tolerance ${COLOR_ACCURACY_TOLERANCE}`,
      ).toBe(true)
    })
  }
})

test.describe('Tone-map-extreme color gate', () => {
  for (const swatch of TONE_MAP_EXTREME_SWATCHES) {
    test(`the ${swatch.name} swatch reads within tolerance of its reference`, async ({ page }) => {
      const hex = swatch.paint.srgbHex.slice(1)
      const canvas = await gotoPaintedReference(page, hex)

      const sampledSrgb = await sampleCanvasColor(page, canvas, FLOOR_SAMPLE_CENTER)
      const sampled = colorFromOkLab(srgbToOkLab(sampledSrgb))
      const distance = perceptualDistance(sampled, swatch.reference)

      expect(
        withinColorTolerance(sampled, swatch.reference, TONE_MAP_EXTREME_TOLERANCE),
        `${swatch.name}: sampled ${sampled.srgbHex} vs reference ${swatch.reference.srgbHex}, ` +
          `OKLab distance ${distance.toFixed(4)} > tolerance ${TONE_MAP_EXTREME_TOLERANCE}`,
      ).toBe(true)

      if (swatch.neutralHue) {
        const chroma = Math.hypot(sampled.oklab.a, sampled.oklab.b)
        expect(
          chroma <= TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND,
          `${swatch.name}: measured chroma ${chroma.toFixed(4)} exceeds the neutral bound ` +
            `${TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND}; a neutral swatch's render must stay ` +
            `achromatic`,
        ).toBe(true)
      }
    })
  }
})
