import { test, expect } from '@playwright/test'

import { drawnRoomCanvas } from './scene-helpers'

// Exercises the whole-building view controls in the live three-dimensional pane (issue
// #206): the scope toggle between the active floor and the whole building stacked at its
// elevations, and the control that shows or hides underground levels such as a basement.
// Runs only in the GPU `scene-webgl` Playwright project (the config routes
// `scene-*.spec.ts` there) and self-skips without WebGPU, because the live pane and its
// toolbar render only through the WebGPU backend. A room is drawn first because the live
// pane shows an empty-state (and no toolbar) until the floor holds some geometry.

test.describe('Whole-building 3D view controls', () => {
  test('switches scope and gates the underground toggle on the whole-building view', async ({
    page,
  }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    await drawnRoomCanvas(page)

    const thisFloor = page.getByRole('button', { name: 'This floor' })
    const wholeBuilding = page.getByRole('button', { name: 'Whole building' })
    const underground = page.getByRole('button', { name: /underground levels/i })

    // The active-floor view is the default, and the underground toggle applies only to
    // the combined model, so it starts disabled.
    await expect(thisFloor).toHaveAttribute('aria-pressed', 'true')
    await expect(underground).toBeDisabled()

    // Switching to the whole building enables the underground toggle, shown by default.
    await wholeBuilding.click()
    await expect(wholeBuilding).toHaveAttribute('aria-pressed', 'true')
    await expect(thisFloor).toHaveAttribute('aria-pressed', 'false')
    await expect(underground).toBeEnabled()
    await expect(underground).toHaveAttribute('aria-pressed', 'true')

    // Hiding the underground levels flips the toggle, then it can be shown again.
    await underground.click()
    await expect(underground).toHaveAttribute('aria-pressed', 'false')
    await underground.click()
    await expect(underground).toHaveAttribute('aria-pressed', 'true')
  })
})
