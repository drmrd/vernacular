import { test, expect } from '@playwright/test'
import { drawnSceneCanvas, stableFrame } from './scene-helpers'

// Exercises the live three-dimensional pane's navigation (orbit drag and walk keys).
// Runs only in the GPU `scene-webgl` Playwright project (the config routes
// `scene-*.spec.ts` there) and self-skips without WebGPU, because the live pane renders
// through the WebGPU backend and otherwise shows a fallback message.
//
// The assertion is semantic, not a committed pixel baseline: the live view renders
// through the non-deterministic WebGPU backend (ADR-0045 explains why a WebGPU pixel
// baseline is not pinned). Each test settles the canvas to a stable frame, performs a
// navigation gesture, settles again, and requires the frame to change.

test.describe('Live three-dimensional navigation', () => {
  test('orbit drag changes the settled frame', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnSceneCanvas(page)
    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 120, centerY + 40, { steps: 8 })
    await page.mouse.up()

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })

  test('a walk movement key changes the settled frame', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnSceneCanvas(page)

    // Enter walk mode: the camera drops to eye height (a deliberate takeover).
    await page.getByRole('button', { name: 'Walk' }).click()
    // The first key event after entering walk settles a one-time WebGPU render
    // warmup; absorb it with a throwaway press so the baseline is the steady
    // walking view rather than that one-off settle.
    await page.keyboard.press('KeyW')
    const standing = await stableFrame(canvas)

    // Movement keys act whenever walk mode is on; they do not depend on pointer
    // capture, which is unreliable headless. Hold W to walk forward a clear distance.
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(600)
    await page.keyboard.up('KeyW')

    const walked = await stableFrame(canvas)
    expect(walked.equals(standing)).toBe(false)
  })
})
