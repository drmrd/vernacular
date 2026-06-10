import { test, expect } from '@playwright/test'

// The three-dimensional render harness boots a deterministic, fixed-size scene via the
// `?fixture=scene-harness` seam (see app/app.tsx) and screenshots the rendered canvas.
// The renderer forces the WebGL 2 backend, so the committed baseline is a hardware-WebGL
// render named with a `-webgl` suffix that never collides with a future WebGPU baseline.
//
// Self-skip policy: unlike the absent-WebGPU case, the harness renders via whatever
// backend the runner provides and only self-skips when no WebGL 2 context can be created
// at all (a runner with no usable GPU stack), so it does not vacuously skip everywhere.

test.describe('Three-dimensional scene visual baseline', () => {
  test('renders the lit empty scene to a stable canvas', async ({ page }) => {
    await page.goto('/?fixture=scene-harness')

    const canvas = page.locator('[data-testid="scene-harness"] canvas')
    await expect(canvas).toBeVisible()

    const hasWebGl2 = await page.evaluate(() => {
      const probe = document.createElement('canvas')
      return probe.getContext('webgl2') !== null
    })
    test.skip(!hasWebGl2, 'No WebGL 2 context on this runner; scene harness self-skips here.')

    // The harness renders a single static frame on mount (no animation). Wait for the
    // canvas backing store to reach its pinned size so the rendered frame is in the
    // compositor before screenshotting. The frame contents are verified out of band
    // against the committed baseline; with preserveDrawingBuffer off a 2D-readback of
    // the canvas reads an already-cleared buffer, so the compositor screenshot below is
    // the source of truth, not an in-page pixel poll.
    await expect
      .poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width), {
        message: 'waiting for the harness canvas to size its backing store',
      })
      .toBeGreaterThan(0)

    await expect(canvas).toHaveScreenshot('scene-empty-webgl.png')
  })
})
