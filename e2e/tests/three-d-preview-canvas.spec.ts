import { test, expect } from '@playwright/test'
import { gotoEditor, selectors } from './journeys/support'

// The three-dimensional preview pane must fill its container height. The R3F canvas
// measures its parent, so a parent that collapses to its content height leaves the
// canvas short (the captured ~150px bug). This checks the rendered region height,
// not the canvas backend, so it holds whether the WebGPU canvas or the accessible
// fallback renders inside it; it runs on chromium, matching the local gate.

const MIN_PANE_HEIGHT = 300

test.describe('Three-dimensional preview pane', () => {
  test('fills its container height in preview mode', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Pane-height regression runs on chromium.')

    await gotoEditor(page)
    await selectors.viewModeButton(page, '3D view').click()

    const region = selectors.threeDRegion(page)
    await expect(region).toBeVisible()

    const box = await region.boundingBox()
    const height = box?.height ?? 0
    expect(height).toBeGreaterThan(MIN_PANE_HEIGHT)
  })
})
