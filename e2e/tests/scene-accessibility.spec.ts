import { test, expect } from '@playwright/test'
import { drawnRoomCanvas, stableFrame } from './scene-helpers'

// Exercises the live three-dimensional pane's keyboard and screen-reader proxy layer. Runs
// only in the GPU scene-webgl Playwright project and self-skips without WebGPU.
//
// The assertion is functional and semantic: a closed room is drawn, the canvas settles, the
// first entity proxy in the 3D region is focused and activated with Enter, and then the
// proxy reports aria-selected and the settled frame changes because the selection outline
// appeared. That proves the proxy listbox selects through the shared store and the outline
// reconciles, independent of the exact projected pixel positions.

test.describe('Live three-dimensional accessibility', () => {
  test('selecting an entity through a keyboard proxy outlines it', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const before = await stableFrame(canvas)

    const region = page.getByRole('region', { name: /3d preview/i })
    const option = region.getByRole('option').first()
    await option.focus()
    await page.keyboard.press('Enter')

    await expect(option).toHaveAttribute('aria-selected', 'true')
    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })
})
