import { test, expect } from '@playwright/test'
import { settledSceneCanvas } from './scene-helpers'

// Exercises the live three-dimensional pane's discoverable camera affordances: the
// per-mode controls hint caption and the grab cursor on the preview pane. Runs only in
// the GPU `scene-webgl` Playwright project (the config routes `scene-*.spec.ts` there)
// and self-skips without WebGPU, because the live pane renders through the WebGPU backend
// and otherwise shows a fallback message.
//
// The assertions are on the DOM affordances (the hint text and the pane cursor), not on a
// committed pixel baseline: the live view renders through the non-deterministic WebGPU
// backend (ADR-0045 explains why a WebGPU pixel baseline is not pinned).

test.describe('Discoverable three-dimensional camera controls', () => {
  test('the 3D preview surfaces the camera controls and a grab cursor', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    await settledSceneCanvas(page)

    // Orbit is the default mode, so the hint shows the orbit lines on first render.
    await expect(page.getByRole('group', { name: /camera controls/i })).toBeVisible()
    await expect(page.getByText('Drag to orbit')).toBeVisible()

    // Switching to walk mode swaps the caption to the walk lines.
    await page.getByRole('button', { name: 'Walk' }).click()
    await expect(page.getByText('W A S D to move')).toBeVisible()
    await expect(page.getByText('Drag to orbit')).toHaveCount(0)

    // The preview pane reports a grab cursor at rest, mirroring the 2D pan affordance.
    const cursor = await page
      .locator('.scene-camera-pane')
      .evaluate((el) => getComputedStyle(el).cursor)
    expect(cursor).toBe('grab')
  })
})
