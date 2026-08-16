/* eslint-disable no-console */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { colorFromHex, colorFromOkLab, perceptualDistance, srgbToOkLab } from '../../core'
import { sampleCanvasColor } from './scene-helpers'

// TEMPORARY measurement sweep for issue #512 (tone-map-extreme color accuracy).
// Renders candidate near-white and near-black swatches on the shell floor under the
// color-check reference condition (ADR-0156) and logs the sampled triples on both
// backends (darwin Metal locally, linux SwiftShader on CI). The pinned gate constants
// and the ADR derivation table are built from these logs. This spec never merges:
// delete it before review.

// The reference-lighting harness scene the gate renders under.
const REFERENCE_SCENE = 'color-accuracy'
// Where on the frame the floor sample patch is centered (fraction of width and height).
const FLOOR_SAMPLE_CENTER = { x: 0.5, y: 0.5 }
// Renders per swatch: repeat renders establish per-backend determinism at the 8-bit floor.
const SWEEP_REPEATS = 5
// The maximum value of an 8-bit sRGB channel, for logging patch averages at full precision.
const SRGB_MAX = 255
// Generous budget for five sequential harness renders under SwiftShader.
const SWEEP_TIMEOUT_MS = 300_000

// Sweep candidates with the calibrated closed-form PBR Neutral predictions (scratch model
// validated against ADR-0157's measured mid-gray round trip #808080 -> #747474, gain 0.9944).
const SWEEP = [
  { hex: 'fafaf5', predicted: '#eeeee9' },
  { hex: 'f0f0ea', predicted: '#e9e9e3' },
  { hex: 'e8e8e2', predicted: '#e2e2dc' },
  { hex: '505050', predicted: '#383838' },
  { hex: '333333', predicted: '#141414' },
  { hex: '262626', predicted: '#080808' },
  { hex: '1a1a1a', predicted: '#020202' },
]

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
  test.skip(!hasWebGl2, 'No WebGL 2 context on this runner; the measurement sweep skips here.')
  await expect(harness).toHaveAttribute('data-harness-ready', 'true')
  return canvas
}

test.describe('Tone-map-extreme measurement sweep (issue #512, temporary)', () => {
  for (const candidate of SWEEP) {
    test(`sweep #${candidate.hex}`, async ({ page }) => {
      test.setTimeout(SWEEP_TIMEOUT_MS)
      const albedo = colorFromHex(`#${candidate.hex}`)
      const predicted = colorFromHex(candidate.predicted)
      for (let run = 1; run <= SWEEP_REPEATS; run += 1) {
        const canvas = await gotoPaintedReference(page, candidate.hex)
        const srgb = await sampleCanvasColor(page, canvas, FLOOR_SAMPLE_CENTER)
        const sampled = colorFromOkLab(srgbToOkLab(srgb))
        const patch = [srgb.r, srgb.g, srgb.b].map((c) => (c * SRGB_MAX).toFixed(3)).join(',')
        console.log(
          `[tone-map-sweep] paint=#${candidate.hex} run=${run} sampled=${sampled.srgbHex} ` +
            `patch255=(${patch}) dAlbedo=${perceptualDistance(sampled, albedo).toFixed(4)} ` +
            `dPredicted=${perceptualDistance(sampled, predicted).toFixed(4)}`,
        )
      }
    })
  }
})
