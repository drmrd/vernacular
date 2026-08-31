import { test, expect, type Page } from '@playwright/test'
import { drawnRoomCanvas, stableFrame } from './scene-helpers'

// The 3D preview region holds two status-role nodes: the nav toolbar's color-temperature
// readout (an <output>) and the selection live region. Scope to the selection one by its
// vocabulary ("No entity selected" or "Selected: ...") so the locator stays unambiguous.
function selectionStatusOf(page: Page) {
  return page
    .getByRole('region', { name: /3d preview/i })
    .getByRole('status')
    .filter({ hasText: /No entity selected|^Selected: / })
}

// Exercises the live three-dimensional pane's pointer selection. Click-to-select is ON by
// default; the nav toolbar's "Select" toggle is an opt-out (and walk mode gates selection
// separately). Runs only in the GPU scene-webgl Playwright project (the config routes
// scene-*.spec.ts there) and self-skips without WebGPU.
//
// The assertions are semantic, not a committed pixel baseline: a closed room is drawn so its
// floor slab fills the framed view, the canvas settles, and the selection status region plus
// the settled frame report whether the click wrote the shared selection. That proves the
// default-on pointer pick (and its opt-out) without depending on the non-deterministic
// WebGPU backend's exact pixels.

test.describe('Live three-dimensional default-on selection', () => {
  test('clicking an entity selects it by default (the settled frame changes)', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const region = page.getByRole('region', { name: /3d preview/i })
    const selectionStatus = selectionStatusOf(page)

    // The Select toggle is on by default, so a first click selects with no setup.
    await expect(region.getByRole('button', { name: /select/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(selectionStatus).toHaveText('No entity selected')
    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    // The click commits a selection: the status names an entity and the settled frame
    // changes because the selection outline appeared.
    await expect(selectionStatus).toHaveText(/^Selected: /)
    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })

  test('disabling the Select toggle makes a click inert', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const region = page.getByRole('region', { name: /3d preview/i })
    const selectionStatus = selectionStatusOf(page)

    // Opt out of click-to-select via the nav toolbar toggle.
    const selectToggle = region.getByRole('button', { name: /select/i })
    await selectToggle.click()
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'false')
    await expect(selectionStatus).toHaveText('No entity selected')

    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    // With selection disabled, the click is inert: the selection stays empty and the settled
    // frame is unchanged (no outline appears).
    await expect(selectionStatus).toHaveText('No entity selected')
    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(true)
  })

  test('dragging to orbit the camera does not select the entity under the press', async ({
    page,
  }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const selectionStatus = selectionStatusOf(page)
    await expect(selectionStatus).toHaveText('No entity selected')

    // Press on the entity at the canvas centre, then drag well past the click tolerance to
    // orbit the camera, and release. Selection must stay empty: the drag is a camera move,
    // not a click on the entity under the press.
    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(centre.x, centre.y)
    await page.mouse.down()
    await page.mouse.move(centre.x + 90, centre.y - 50, { steps: 8 })
    await page.mouse.up()

    await expect(selectionStatus).toHaveText('No entity selected')
  })
})
