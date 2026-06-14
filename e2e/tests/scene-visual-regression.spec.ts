import { test, expect, type Page } from '@playwright/test'

// The three-dimensional render harness boots a deterministic, fixed-size scene via the
// `?fixture=scene-harness` seam (see app/app.tsx) and screenshots the rendered canvas.
// The renderer forces the WebGL 2 backend, so the committed baseline is a hardware-WebGL
// render named with a `-webgl` suffix that never collides with a future WebGPU baseline.
// The optional `temp` query parameter sets the harness color temperature, so a second
// baseline captures the warm tint alongside the default near-white one.
//
// Self-skip policy: unlike the absent-WebGPU case, the harness renders via whatever
// backend the runner provides and only self-skips when no WebGL 2 context can be created
// at all (a runner with no usable GPU stack), so it does not vacuously skip everywhere.

// Pixel-approximate, not pixel-exact: a generous per-pixel threshold and a tolerant
// different-pixel ratio absorb graphics-driver and antialiasing variation on the wall
// shell, since the deterministic geometry is already proven by the Node geometry tests
// (ADR-0061) and the lighting math by the engine and core tests (ADR-0065).
const SHELL_THRESHOLD = 0.35
const SHELL_MAX_DIFF_PIXEL_RATIO = 0.05

async function captureShell(page: Page, query: string, snapshot: string): Promise<void> {
  await page.goto(`/?fixture=scene-harness${query}`)

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
  // against the committed baseline; with preserveDrawingBuffer off a 2D-readback of the
  // canvas reads an already-cleared buffer, so the compositor screenshot is the source
  // of truth, not an in-page pixel poll.
  await expect
    .poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width), {
      message: 'waiting for the harness canvas to size its backing store',
    })
    .toBeGreaterThan(0)

  await expect(canvas).toHaveScreenshot(snapshot, {
    threshold: SHELL_THRESHOLD,
    maxDiffPixelRatio: SHELL_MAX_DIFF_PIXEL_RATIO,
  })
}

test.describe('Three-dimensional scene visual baseline', () => {
  test('renders the lit wall shell to a stable canvas', async ({ page }) => {
    await captureShell(page, '', 'scene-shell-webgl.png')
  })

  test('renders the warm-lit wall shell to a stable canvas', async ({ page }) => {
    await captureShell(page, '&temp=2700', 'scene-shell-warm-webgl.png')
  })

  test('renders the painted wall shell to a stable canvas', async ({ page }) => {
    await captureShell(page, '&paint=demo', 'scene-shell-painted-webgl.png')
  })

  // The junction fixture (ADR-0080) renders a T-junction and an acute three-way bay,
  // the busier junctions the four-corner shell does not exercise. The baseline confirms
  // they read as one solid with opaque tops and no spikes.
  test('renders the mitered T-junction and acute bay to a stable canvas', async ({ page }) => {
    await captureShell(page, '&scene=junctions', 'scene-junctions-webgl.png')
  })
})
