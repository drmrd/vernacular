import { test, expect } from '@playwright/test'
import { drawnSceneCanvas } from './scene-helpers'

// Exercises the live three-dimensional pane's discoverable camera affordances: the
// per-mode controls hint caption and the grab cursor on the preview pane. Runs only in
// the GPU `scene-webgl` Playwright project (the config routes `scene-*.spec.ts` there)
// and self-skips without WebGPU, because the live pane renders through the WebGPU backend
// and otherwise shows a fallback message.
//
// The camera affordances belong to the live canvas, which only mounts once the active
// floor carries geometry; until then the pane shows the "Nothing to show in 3D yet"
// empty-state. So each test draws a wall first via `drawnSceneCanvas` before reaching for
// the canvas and its controls.
//
// The assertions are on the DOM affordances (the hint text and the pane cursor), not on a
// committed pixel baseline: the live view renders through the non-deterministic WebGPU
// backend (ADR-0045 explains why a WebGPU pixel baseline is not pinned).

test.describe('Discoverable three-dimensional camera controls', () => {
  test('the 3D preview surfaces the camera controls and a grab cursor', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    // Draw a wall so the live canvas mounts (the empty floor shows the empty-state instead).
    await drawnSceneCanvas(page)

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

  test('the pane cursor returns to grab after an orbit drag', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    // Draw a wall so the live canvas mounts (the empty floor shows the empty-state instead).
    const canvas = await drawnSceneCanvas(page)
    const pane = page.locator('.scene-camera-pane')
    const paneCursor = () => pane.evaluate((el) => getComputedStyle(el).cursor)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2

    // Pressing on the canvas starts an orbit drag, so the pane shows the grabbing cursor.
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 60, centerY + 30, { steps: 6 })
    expect(await paneCursor()).toBe('grabbing')

    // Releasing the drag must clear the grabbing cursor back to grab, even though the orbit
    // controls capture the pointer on the canvas so the release does not bubble to the pane.
    await page.mouse.up()
    await expect.poll(paneCursor).toBe('grab')
  })
})
