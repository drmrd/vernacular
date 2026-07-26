import { test, expect, type Page, type Locator } from '@playwright/test'
import {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  withinColorTolerance,
} from '../../core/color/color-accuracy'
import { colorFromOkLab } from '../../core/color/color'
import { srgbToOkLab } from '../../core/color/oklab'
import { perceptualDistance } from '../../core/color/operations'
import { sampleCanvasColor } from './scene-helpers'

// The color-accuracy gate, the headline acceptance of the realistic-environmental-lighting
// epic. It renders each known swatch on the shell floor under the color-check reference
// condition (ADR-0156: neutral daylight, exposure 1, PBR Neutral tone mapping), samples the
// lit floor, and asserts the sample reads within tolerance of the swatch in OKLab. It renders
// through the deterministic scene harness (WebGL 2 backend), so it runs on both darwin Metal
// and linux SwiftShader and self-skips only where no WebGL 2 context exists. It commits no
// pixel baseline; the assertion is the sampled color, not an image. See ADR-0157.

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

      // Calibration print (removed once the tolerance is pinned): records the sampled color and
      // its OKLab distance from the swatch on whichever backend the runner uses, so the linux
      // SwiftShader spread can be read from the CI log alongside the local darwin numbers.
      // eslint-disable-next-line no-console -- temporary cross-backend calibration measurement
      console.log(
        `COLOR-ACCURACY ${swatch.name}: sampled ${sampled.srgbHex} vs ${swatch.color.srgbHex} = ${distance.toFixed(4)}`,
      )

      expect(
        withinColorTolerance(sampled, swatch.color),
        `${swatch.name}: sampled ${sampled.srgbHex} vs reference ${swatch.color.srgbHex}, ` +
          `OKLab distance ${distance.toFixed(4)} > tolerance ${COLOR_ACCURACY_TOLERANCE}`,
      ).toBe(true)
    })
  }
})
