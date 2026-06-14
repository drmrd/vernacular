import { test, expect } from '@playwright/test'
import { drawnRoomCanvas } from './scene-helpers'

// The 3D preview must frame the model to fill the pane rather than leaving it
// tiny and floating in the middle (issue #123 / ADR-0075). This measures how far
// apart the model's entity proxies project on the settled full-width 3D canvas.
// With the loose, aspect-unaware framing the proxy centers span only about 0.18
// of the canvas height; fitting the model to the viewport roughly doubles that.
// The 0.25 threshold sits comfortably between the two. Runs only in the GPU
// scene-webgl project; self-skips without WebGPU.

const MIN_MODEL_SPREAD_FRACTION = 0.25

test.describe('Three-dimensional preview camera fit', () => {
  test('frames the model to fill the preview pane', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    const canvasHeight = canvasBox?.height ?? 1

    const region = page.getByRole('region', { name: /3d preview/i })
    const options = region.getByRole('option')
    // The projector writes the proxy positions on a frame after the canvas
    // settles, so wait for them to appear before measuring their spread.
    await expect
      .poll(() => options.count(), { message: 'waiting for the 3D entity proxies to project' })
      .toBeGreaterThan(1)
    const count = await options.count()

    const xs: number[] = []
    const ys: number[] = []
    for (let index = 0; index < count; index += 1) {
      const box = await options.nth(index).boundingBox()
      if (box) {
        xs.push(box.x + box.width / 2)
        ys.push(box.y + box.height / 2)
      }
    }

    // Guard against a vacuous pass: with no measurable proxies the spread below
    // would be Infinity (Math.max of an empty list), which would clear the threshold
    // without measuring anything.
    expect(xs.length).toBeGreaterThan(1)

    // The diagonal of the proxy-centers bounding box, as a fraction of the canvas
    // height, is a stable proxy for how large the model is drawn.
    const spread = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    expect(spread / canvasHeight).toBeGreaterThan(MIN_MODEL_SPREAD_FRACTION)
  })
})
