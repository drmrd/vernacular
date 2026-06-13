import { test, expect } from '@playwright/test'
import { drawnRoomCanvas, stableFrame } from './scene-helpers'

// Exercises the live three-dimensional pane's pointer selection. Runs only in the GPU
// scene-webgl Playwright project (the config routes scene-*.spec.ts there) and self-skips
// without WebGPU.
//
// The assertion is semantic, not a committed pixel baseline: a closed room is drawn so its
// floor slab fills the framed view, the canvas settles, a click at the centre strikes an
// entity, and the settled frame must change because the selection outline appeared. That
// proves the pointer pick writes the shared selection and the outline reconciles, without
// depending on the non-deterministic WebGPU backend's exact pixels.

test.describe('Live three-dimensional selection', () => {
  test('clicking an entity outlines it (the settled frame changes)', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })
})
