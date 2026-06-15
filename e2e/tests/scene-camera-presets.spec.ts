import { test, expect } from '@playwright/test'
import { drawnRoomCanvas, drawnRoomWithDoorCanvas, stableFrame } from './scene-helpers'

// Exercises the live three-dimensional pane's named camera presets (the nav toolbar's
// Top down, elevations, and Doorway buttons). Runs only in the GPU `scene-webgl`
// Playwright project (the config routes `scene-*.spec.ts` there) and self-skips without
// WebGPU, because the live pane renders through the WebGPU backend and otherwise shows a
// fallback message.
//
// The assertion is semantic, not a committed pixel baseline: the live view renders through
// the non-deterministic WebGPU backend (ADR-0045 explains why a WebGPU pixel baseline is
// not pinned). Each test settles the canvas to a stable frame, clicks a preset, settles
// again, and requires the frame to change.

test.describe('Live three-dimensional camera presets', () => {
  test('a camera preset moves the live camera', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const before = await stableFrame(canvas)

    await page.getByRole('button', { name: 'Top down' }).click()

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })

  test('the doorway preset frames the model from an opening', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomWithDoorCanvas(page)
    await expect(page.getByRole('button', { name: 'Doorway' })).toBeEnabled()
    const before = await stableFrame(canvas)

    await page.getByRole('button', { name: 'Doorway' }).click()

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })
})
