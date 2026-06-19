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

// Exercises the live three-dimensional pane's pointer selection, now gated behind the nav
// toolbar's "Select" toggle. Runs only in the GPU scene-webgl Playwright project (the config
// routes scene-*.spec.ts there) and self-skips without WebGPU.
//
// Click-to-select is a user toggle that is OFF by default: a pointer click commits a selection
// only when the toggle is on (and the camera is not in walk mode). The assertions are
// semantic, not a committed pixel baseline: a closed room is drawn so its floor slab fills the
// framed view, the canvas settles, and the selection status region plus the settled frame
// report whether the click wrote the shared selection. That proves the toggle gates the
// pointer pick without depending on the non-deterministic WebGPU backend's exact pixels.

test.describe('Live three-dimensional toggle-gated selection', () => {
  test('clicking an entity does not select it while the Select toggle is off', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const region = page.getByRole('region', { name: /3d preview/i })
    const selectionStatus = selectionStatusOf(page)

    // The Select toggle is off by default, so no pointer click should select anything.
    await expect(region.getByRole('button', { name: /select/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
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

  test('enabling the Select toggle lets a click outline the entity (the settled frame changes)', async ({
    page,
  }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const region = page.getByRole('region', { name: /3d preview/i })
    const selectionStatus = selectionStatusOf(page)

    // Turn on click-to-select via the nav toolbar toggle.
    const selectToggle = region.getByRole('button', { name: /select/i })
    await selectToggle.click()
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'true')

    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    // The click now commits a selection: the status names an entity and the settled frame
    // changes because the selection outline appeared.
    await expect(selectionStatus).toHaveText(/^Selected: /)
    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
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
