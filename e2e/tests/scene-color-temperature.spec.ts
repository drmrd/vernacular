import { test, expect } from '@playwright/test'
import { drawnSceneCanvas, stableFrame } from './scene-helpers'

// Exercises the live three-dimensional pane's color-temperature slider. Runs only in
// the GPU `scene-webgl` Playwright project (the config routes `scene-*.spec.ts` there)
// and self-skips without WebGPU.
//
// The assertion is semantic, not a committed pixel baseline: settle the canvas to a
// stable frame, drag the slider to the warm end, settle again, and require the frame to
// change. That proves the slider tints the live scene light (the warmth lives in the
// light, ADR-0065) without depending on the non-deterministic WebGPU backend's exact
// pixels.

test.describe('Live three-dimensional color temperature', () => {
  test('the color-temperature slider changes the settled frame', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnSceneCanvas(page)
    const cool = await stableFrame(canvas)

    await page.getByRole('slider', { name: /color temperature/i }).fill('2700')

    const warm = await stableFrame(canvas)
    expect(warm.equals(cool)).toBe(false)
  })
})
